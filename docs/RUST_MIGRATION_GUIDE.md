# DiskSentinel Pro - Rust 마이그레이션 및 네이티브 코어 구축 가이드

- **문서 버전**: v1.0.0
- **저작자**: AhBiYout (GitHub: [AhBiYout-all](https://github.com/AhBiYout-all))
- **소속**: CISNet (http://www.cisnet.co.kr)
- **라이선스**: Apache-2.0

---

## 1. Rust 전환 가능 여부 (결론)

**네, 100% 완벽하게 변경 가능하며 강력히 권장됩니다.**

디스크 로우 레벨 I/O(Direct I/O, S.M.A.R.T. 패스스루, 배드섹터 복구) 영역은 **잘못된 포인터 참조나 메모리 오버런 발생 시 치명적인 BSOD(블루스크린)나 데이터 유실 위험**이 있는 분야입니다.
Rust는 컴파일 타임에 **메모리 안전성(Memory Safety)**과 **데이터 레이스 방지(Data Race Prevention)**를 보장하므로 C++보다 시스템 스토리지 진단 도구에 훨씬 안전하고 현대적입니다.

---

## 2. 두 가지 Rust 전환 방식

### 전략 A. C++ 네이티브 DLL을 Rust `cdylib`으로 1:1 드롭인 교체 (이미 구현 완료)
- **대상**: `src/native/DiskSentinelEngine.cpp` -> `src/native/rust/`
- **방식**: Rust에서 `extern "system"` (C ABI)으로 8개 API 함수를 노출하여 `DiskSentinelNativeCore.dll` 빌드
- **장점**:
  - 프론트엔드(React 19 / TypeScript) 코드를 단 한 줄도 바꿀 필요 없음.
  - 기존 `nativeDllBridge.ts` 및 대시보드 인터페이스 100% 호환.
  - 버퍼 오버플로우 및 미정의 동작(Undefined Behavior) 원천 차단.
  - 패리티 및 CRC32 연산의 안전한 슬라이스 청크 처리.

### 전략 B. Tauri 2.0을 도입하여 데스크톱 앱 전체를 Rust + React로 통합
- **방식**: 브라우저 기반 런처(`DiskSentinelPro.bat / .vbs`) 대신 Rust 기반 경량 데스크톱 프레임워크인 **Tauri** 채택.
- **구조**:
  - **백엔드 (Rust)**: OS 윈도우 생성, 물리 디스크 관리자 권한 취득, Direct I/O 직접 실행
  - **프론트엔드 (React 19 + TypeScript)**: Tauri IPC (`invoke()`, `listen()`)를 통해 Rust 엔진과 실시간 통신
- **장점**:
  - 단일 실행 파일(`DiskSentinelPro.exe`, 약 12~15MB)로 배포 가능.
  - Electron 대비 메모리 사용량 80% 이상 절감.
  - 브라우저 보안 제약 없이 OS 물리 디스크 핸들 직접 제어.

---

## 3. Rust 네이티브 코어 구현 현황 (`src/native/rust/`)

이미 프로젝트 내 `src/native/rust/` 디렉터리에 8개 핵심 함수가 모두 구현되어 있습니다.

```
src/native/rust/
├── Cargo.toml          # Rust 크레이트 설정 (crate-type = ["cdylib", "rlib"])
└── src/
    └── lib.rs          # 8대 Win32 Direct I/O 및 알고리즘 구현
```

### 구현된 8대 익스포트 함수:
1. `DS_OpenDriveDirect`: Win32 `CreateFileW` 직접 캐시 바이패스 드라이브 오픈
2. `DS_ScanLbaBlock`: 마이크로초 단위 단일 섹터 정밀 지연시간 측정
3. `DS_AdaptiveScanChunk`: 가변 버스트 LBA 블록 고속 적응형 스캔 알고리즘
4. `DS_GetSmartTelemetry`: ATA/NVMe S.M.A.R.T. 텔레메트리 파싱
5. `DS_EvaluateDriveReliability`: 수명 잔여 지수 및 가중 신뢰도 계산기
6. `DS_CalculateParityChecksum`: 고속 64비트 비트와이즈 패리티 & IEEE 802.3 CRC32 생성기
7. `DS_AttemptSoftSectorRepair`: 안전 제로 오버라이트를 통한 불안정 섹터 복구 루틴
8. `DS_CloseDrive`: 드라이브 핸들 및 메모리 안전 해제

---

## 4. Rust DLL 빌드 방법 (Windows)

Windows 환경에 Rust(`cargo`)가 설치되어 있다면 원클릭으로 빌드할 수 있습니다:

```cmd
# 1. 원클릭 빌드 스크립트 실행
build-rust.bat

# 또는 수동 Cargo 명령 실행
cd src\native\rust
cargo build --release
```

컴파일이 완료되면 `bin\native\DiskSentinelNativeCore.dll` 및 `dist\DiskSentinelNativeCore.dll`로 자동 배치됩니다.

---

## 5. Rust 확장으로 추가 가능한 추천 핵심 기능 (Top 5)

Rust의 무비용 추상화(Zero-Cost Abstractions), 고성능 동시성(Fearless Concurrency), SIMD 벡터 가속, 메모리 안전성을 극대화하여 추가할 수 있는 5가지 차세대 기능입니다:

### 1) Rayon 기반 다중 디스크 병렬 동시 스캔 (Multi-Drive Concurrent Scanner)
- **개념**: 시스템에 연결된 4~8개의 SATA/NVMe/USB 드라이브를 스레드 안전성(Data Race 걱정 없음) 하에 동시 병렬 스캔.
- **기술**: Rust의 `rayon` 또는 `crossbeam` 채널을 활용해 각 물리 드라이브별로 독립된 Direct I/O 파이프라인을 운영하고 집계.
- **효과**: 디스크가 여러 개 있는 서버/워크스테이션 환경에서 검사 시간을 1/N로 대폭 단축.

### 2) NVMe 전용 네이티브 심층 텔레메트리 (NVMe Health Log 02h & Wear Leveling)
- **개념**: SATA S.M.A.R.T.를 넘어 최신 PCIe NVMe SSD 전용 벤더 프로토콜 직접 통신.
- **기술**: Windows `IOCTL_STORAGE_PROTOCOL_COMMAND`를 통해 NVMe 컨트롤러에 직접 Admin Command 전송.
- **제공 정보**:
  - `Available Spare` (가용 예비 블록 백분율)
  - `Percentage Used` (수명 소모율 및 잔여 TBW 테라바이트)
  - `Data Units Read/Written` (총 누적 입출력량)
  - `Media and Data Integrity Errors` (미디어 무결성 에러 카운터)

### 3) SIMD / AVX2 하드웨어 가속 기반 블록 해시 및 무결성 제로 검증 (Zero-Check)
- **개념**: 초당 수 GB/s 속도로 디스크 섹터가 단순 0(Zero-fill) 상태인지, 유효 데이터인지 나노초 단위로 판별.
- **기술**: Rust의 `std::arch::x86_64` (AVX2/SSE4.2) 인트린직(Intrinsics)을 활용한 256비트 벡터 레지스터 병렬 비교.
- **효과**: 빈 섹터는 초고속 스킵 처리하여 전체 스캔 성능 극대화 및 변조된 비트(Bit-rot) 즉시 감지.

### 4) 손상 섹터 주변 긴급 데이터 카빙 (Data Carving & File Recovery Engine)
- **개념**: 배드섹터가 발생하여 접근이 불가능해지기 직전, 인접 섹터에서 중요 문서/사진 파일의 헤더 시그니처를 스캔하여 긴급 복구.
- **기술**: JPEG, PNG, PDF, ZIP, SQLite 등의 매직 넘버(Magic Bytes)를 메모리 안전한 Rust 파서(`nom` 등)로 파싱하여 유실 전 자동 추출.

### 5) 5MB 미만의 초경량 백그라운드 상주 가디언 데몬 (Disk Guardian Daemon)
- **개념**: 메인 GUI를 닫아도 시스템 트레이에서 상주하며 1초 간격으로 디스크 온도 및 위험 S.M.A.R.T. 속성을 실시간 감시.
- **기술**: Rust 네이티브 백그라운드 서비스 또는 트레이 프로세스 구축 (RAM 점유율 약 3~5MB 수준).
- **효과**: 위험 온도(55°C 이상) 도달 또는 `Reallocated / Pending Sector` 증가 즉시 Windows Native Toast 알림 및 경보 발령.

