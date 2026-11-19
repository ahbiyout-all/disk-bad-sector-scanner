# DiskSentinelNativeCore.dll 기술 백서 및 순수 창작 DLL 명세서
**초저지연 비동기 다이렉트 I/O 배드섹터 정밀 진단 & 하드웨어 텔레메트리 순수 창작 네이티브 엔진**

- **작성자 / 개발자**: AhBiYout (GitHub: [AhBiYout-all](https://github.com/AhBiYout-all))
- **소속**: [CISNet](https://www.cisnet.co.kr)
- **공식 기술 블로그**: [ahbiyoutvibe.blogspot.com](https://ahbiyoutvibe.blogspot.com/)
- **라이선스**: Apache-2.0 (순수 독자 창작 알고리즘 및 소스 코드)
- **대상 플랫폼**: Windows 10/11 x64 및 ARM64 (C ABI 호환: C#, Python, Rust, Node-API/Electron)

---

## 1. 순수 창작 DLL 개발 배경 및 기술적 의의

웹 브라우저 환경이나 표준 고수준 파일 시스템 API는 운영체제의 **페이지 캐시(OS Page Cache)**, 파일 시스템 저널링, 그리고 선행 읽기(Read-Ahead Buffer) 정책으로 인해 디스크 플래터/NAND 플래시 셀의 **실제 물리적 응답 지연시간(Raw Hardware Latency)**을 왜곡 없이 측정하는 데 한계가 있습니다.

`DiskSentinelNativeCore.dll`은 기존 폐쇄형 상용 툴을 역공학하지 않고, **Windows 커널 표준 Direct I/O 규격과 마이크로초 CPU 타임스탬프 카운터**를 기반으로 순수 자체 설계된 고성능 네이티브 C++ 동적 링크 라이브러리(DLL)입니다.

---

## 2. 기존 DLL 파일의 오류 및 개선점 감사 결과 (Audit Findings & Fixes)

코드 리뷰 및 아키텍처 감사 결과, 기존 네이티브 소스 코드에서 다음 오류 및 개선점이 식별되어 전면 수정되었습니다:

| 식별된 문제점 / 결함 | 기존 상태의 위험성 | 개선 및 해결 조치 (v4.4.0) |
| :--- | :--- | :--- |
| **스텁(Stub) 방치 함수** | `DS_GetSmartTelemetry`, `DS_AttemptSoftSectorRepair`가 `return 0` 스텁으로 남아 실제 동작 불가 | Windows `IOCTL_STORAGE_PREDICT_FAILURE` 쿼리 및 `FILE_FLAG_WRITE_THROUGH` 기반 원자적 비파괴 수복 시퀀스 실제 구현 |
| **컴파일러 이식성 결함** | MSVC 전용 함수인 `strcpy_s`, `_aligned_malloc` 사용으로 MinGW, GCC, Clang에서 컴파일 에러 발생 | 크로스 컴파일러 호환 `safe_strncpy` 및 매크로 기반 메모리 정렬 할당기(`DS_ALIGNED_ALLOC`) 도입 |
| **64비트 LBA 오버플로 취약점** | `offset.QuadPart = (LONGLONG)(lba * ctx->sectorSize);` 에서 4TB 초과 드라이브 시 32비트 연산 오버플로 위험 | `((LONGLONG)lba) * ((LONGLONG)ctx->sectorSize)`로 64비트 명시적 캐스팅을 적용하여 대용량 스토리지 지원 |
| **핵심 창작 알고리즘 미구현** | 백서에 언급된 적응형 버스트 점핑 알고리즘이 네이티브 함수로 부재 | `DS_AdaptiveScanChunk`, `DS_CalculateParityChecksum`, `DS_EvaluateDriveReliability` 3대 순수 창작 함수 신규 구현 |
| **빌드 자동화 도구 부재** | DLL 소스만 존재하고 사용자가 빌드할 수 있는 스크립트 없음 | MSVC / MinGW 자동 감지 릴리스 빌더인 `build-dll.bat` 신규 제작 및 배치 |
| **누락된 `DS_GetDriveDetails` 익스포트 (v4.6.0)** | `DiskSentinelLauncher.cs`가 `DS_GetDriveDetails`를 P/Invoke 호출하지만 DLL 헤더/구현에 미선언되어 `EntryPointNotFoundException` 발생 가능 | 공통 헬퍼 `PopulateDriveDetailFromHandle` 기반으로 `DS_GetDriveDetails` 정식 구현 및 익스포트(No.19) 추가, 런처 온도 폴링 예외 가드 보강 |
| **하드웨어 정렬/쓰기 캐시 실측 누락 (v4.6.0)** | `physicalSectorSize = 4096`, `isWriteCacheEnabled = false` 고정값 반환 | `StorageAccessAlignmentProperty(6)`, `StorageDeviceWriteCacheProperty(4)`, `IOCTL_DISK_GET_LENGTH_INFO` 폴백 실측 적용 |
| **비트 시프트 O(8N) CRC32 및 NVMe 포인터 산술 위험 (v4.6.0)** | 루프당 8회 비트 시프트로 성능 저하 및 `DS_GetNvmeDeepTelemetry`에서 `ProtocolDataOffset` 사전 검증 전 포인터 가산 위험 | 256-엔트리 IEEE 802.3 LUT + 8바이트 언롤 패리티/제로 체크로 고속화, 포인터 연산 전 `bytesReturned`·`totalBufSize` 경계 검사 및 `DS_VerifyLbaBlock` 64MB 청크 분할로 DWORD 오버플로 차단 |
| **대용량 I/O 버퍼 복사·시스템 콜 병목 & Memory-Mapped Zero-Copy 도입 (v4.6.1)** | 매 읽기마다 힙 할당/`memset` 및 반복 `SetFilePointerEx` 발생, 결함 시 선형 1섹터 탐색($O(K)$), 이미지/복제 대상에 `WriteFile`/`flush` 이중 복사 발생 | **이중 경로(Dual-Path) Zero-Copy DMA**: ① 물리 드라이브는 `VirtualAlloc` 64KB 페이지 정렬 버퍼 + `StorageAdapterProperty`(`MaximumTransferLength`) 동적 버스트 + 순차 시크 생략 + $O(\log K)$ 이진 분할 적용 ② 이미지·복제 파일은 `CreateFileMappingW`/`MapViewOfFile`(`mmap`) 영속 섹션 매핑 및 Direct DMA `ReadFile`→매핑 페이지 직접 기록(Exports #20~#25) |

---

## 3. 순수 창작 DLL 4계층 아키텍처 (Architecture Overview)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     DiskSentinelNativeCore.dll (Pure Creative C++/Rust Engine)          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ [Layer 1] Hardware Direct DMA & Memory-Mapped Zero-Copy I/O Abstraction                 │
│  - Physical: CreateFileW(\\.\PhysicalDriveN, FILE_FLAG_NO_BUFFERING) + VirtualAlloc DMA │
│  - Adaptive Transfer Sizing via StorageAdapterProperty (MaximumTransferLength 1MB~4MB)  │
│  - Image/Clone: CreateFileMappingW + MapViewOfFile (Win32) / mmap (POSIX) Zero-Copy     │
│  - Sequential Offset Tracking (Skip redundant SetFilePointerEx) & QPC µs Timer          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ [Layer 2] AdaptiveBurstSeeker (순수 창작 고속 버스트 & O(log K) 이진 분할 알고리즘)     │
│  - [High-Speed Phase] Hardware-Scaled Burst Reads (1MB ~ 4MB per I/O Request)           │
│  - [Degradation Trigger] Latency > 150ms or Hardware Read Error (UNC/CRC/IDNF)          │
│  - [Micro-Decomposition] Iterative LIFO Binary Subdivision down to 1-Sector Resolution  │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ [Layer 3] Low-Level Hardware Pass-Through Telemetry & Health Projection Engine         │
│  - IOCTL_STORAGE_PREDICT_FAILURE / S.M.A.R.T. & NVMe Log Page 02h Telemetry Extraction  │
│  - Multi-Factor Reliability Score & Weibull Hazard Remaining Life Projection           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ [Layer 4] Atomic Soft Sector Restoration, Mapped Zero-Copy Scan & Fused LUT CRC32       │
│  - Single-Pass Fused Zero-Check + 64-bit Galois XOR Parity + 256-Entry LUT CRC32        │
│  - Direct DMA ReadFile -> MapViewOfFile Target Pages (Zero WriteFile / Heap Copies)     │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 3대 순수 창작 알고리즘 상세 동작 원리

### 1) 적응형 버스트 점핑 & 미세 분해 스캔 (`DS_AdaptiveScanChunk`)
- **수학적 모델 및 원리**:
  - 기존 툴은 수십억 개의 LBA를 1개씩 단일 I/O로 순차 스캔하여 수십 시간이 소요됩니다.
  - 본 알고리즘은 정상 표면(Healthy Surface)에서는 `burstStep` (기본 256섹터 = 1MB) 단위로 묶어 고속 버스트 읽기를 수행합니다. I/O 오버헤드가 **99.6% 감소**합니다.
  - 해당 청크 내에서 지연시간이 150ms를 초과하거나 I/O 오류(`ERROR_CRC`, `ERROR_SECTOR_NOT_FOUND`)가 감지되는 즉시, 해당 블록 범위에 대해 **1섹터 해상도의 미세 이진 분해(Micro-Subdivision)**를 발동합니다.
  - 정상 구간은 고속으로 통과하고, 결함 구간은 1섹터 단위로 물리 LBA 주소를 핀포인트 검출합니다.

### 2) 고속 하드웨어 ECC 패리티 및 CRC32 생성기 (`DS_CalculateParityChecksum`)
- **수학적 모델 및 원리**:
  - 하드웨어 비트 반전(Bit-Flip) 및 소프트 에러를 검증하기 위해 0xEDB88320 다항식 기반의 비트 시프트 CRC32 연산과 8비트 레인별 64비트 누적 XOR 갈루아 필드(Galois Field) 패리티를 동시 연산합니다.
  - 디스크에서 읽어온 원시 섹터 버퍼의 소프트 체크섬 손상 여부를 네이티브 속도로 판정합니다.

### 3) 다차원 가중치 기반 수명 예측 및 신뢰도 지수 연산 (`DS_EvaluateDriveReliability`)
- **수학적 모델 및 원리**:
  - S.M.A.R.T. 속성 중 디스크 고장 상관계수가 가장 높은 5대 핵심 지표(Reallocated Sectors 0x05, Current Pending 0xC5, Uncorrectable Errors 0xBB/0xC6, Power-On Hours 0x09, Temperature 0xC2)를 다변량 가중치 모델로 집계합니다.
  - 100점 만점 기준의 신뢰도 지수(`reliabilityScore`)와 함께 잔여 수명 일수(`estimatedRemainingDays`) 및 등급(`EXCELLENT`, `GOOD`, `WARNING`, `CRITICAL`)을 예측 산출합니다.

---

## 5. 바이너리 C ABI 데이터 구조체 명세 (`#pragma pack(push, 8)`)

```c
#pragma pack(push, 8)
// 1. 단일 블록 스캔 원시 텔레메트리 구조체 (64바이트)
typedef struct {
    uint64_t startLba;         // 시작 LBA 주소 (8 bytes)
    uint64_t sectorCount;      // 검사 섹터 수 (8 bytes)
    double   latencyMs;        // 마이크로초 환산 응답 시간 (8 bytes)
    uint32_t statusCode;       // DSSectorStatus 코드 (4 bytes)
    uint32_t win32ErrorCode;   // Win32 GetLastError() 코드 (4 bytes)
    char     errorMnemonic[32];// 에러 원인 문자열 (32 bytes)
} DSBlockResult;

// 2. 드라이브 하드웨어 S.M.A.R.T. 원시 데이터 구조체 (88바이트)
typedef struct {
    uint32_t attributeId;      // S.M.A.R.T. ID (예: 0x05, 0xC5) (4 bytes)
    char     attributeName[64];// 속성 영문명 (64 bytes)
    uint8_t  currentValue;     // 정규화 현재값 (1 byte)
    uint8_t  worstValue;       // 최악값 (1 byte)
    uint8_t  thresholdValue;   // 임계값 (1 byte)
    uint8_t  reservedPadding;  // 정렬 패딩 (1 byte)
    uint64_t rawValue;         // 원시 레지스터 48/64비트 정수 (8 bytes)
    uint32_t healthStatus;     // 0: 정상, 1: 주의, 2: 위험 (4 bytes)
    uint32_t reservedAlignment;// 8바이트 정렬 보정 (4 bytes)
} DSSmartEntry;

// 3. 종합 신뢰도 및 수명 진단 리포트 구조체 (56바이트)
typedef struct {
    double   reliabilityScore;       // 종합 신뢰도 점수 (0.0 ~ 100.0%)
    uint32_t estimatedRemainingDays; // 잔여 예상 사용 일수
    uint32_t totalPowerOnHours;      // 총 사용 시간
    uint32_t reallocatedSectors;     // 재할당된 섹터 수
    uint32_t pendingSectors;         // 보류 중인 섹터 수
    uint32_t uncorrectableErrors;    // 복구 불가능 오류 수
    uint32_t temperatureCelsius;     // 현재 온도 (°C)
    char     overallGrade[16];       // 판정 등급 문자열
} DSDriveHealthReport;

// 4. Zero-Copy 메모리 맵 섹터 윈도우 기술자
typedef struct {
    void*    viewPtr;                // 요청 LBA에 맞춰 오프셋 보정된 사용자 공간 직접 포인터
    void*    internalBasePtr;        // OS 할당 단위(64KB/4KB) 정렬 매핑 기준 주소
    uint64_t fileOffsetBytes;        // 요청 시작 바이트 오프셋
    uint32_t mappedLengthBytes;      // viewPtr로부터 접근 가능한 유효 바이트 길이
    uint32_t sectorSize;             // 논리 섹터 크기 (512 또는 4096)
    uint8_t  isSectionMapped;        // 1: OS CreateFileMappingW/MapViewOfFile 또는 mmap
    uint8_t  isReadOnly;             // 1: 읽기 전용 매핑
    uint8_t  reserved[6];
} DSMappedSectorWindow;
#pragma pack(pop)
```

---

## 6. 익스포트 C API 함수 명세서 (Export API Reference)

```cpp
extern "C" {
  // 1. 드라이브 Direct I/O 핸들 열기 (OS 캐시 우회)
  DS_API void* DS_CALL DS_OpenDriveDirect(uint32_t physicalDriveIndex, uint32_t* outSectorSize);

  // 2. 고정밀 단일 LBA 블록 스캔
  DS_API bool  DS_CALL DS_ScanLbaBlock(void* hDrive, uint64_t lba, uint32_t count, DSBlockResult* outResult);

  // 3. [순수 창작] 적응형 버스트 점핑 & 이진 분할 미세 추적 스캔
  DS_API bool  DS_CALL DS_AdaptiveScanChunk(
      void* hDrive,
      uint64_t chunkStartLba,
      uint32_t chunkSectorCount,
      uint32_t burstStep,
      DSBlockResult* outBadResults,
      uint32_t maxBadResults,
      uint32_t* outDetectedBadCount
  );

  // 4. 네이티브 S.M.A.R.T. 텔레메트리 레지스터 조회
  DS_API int32_t DS_CALL DS_GetSmartTelemetry(void* hDrive, DSSmartEntry* outEntries, int32_t maxEntries);

  // 5. [순수 창작] 다변량 가중치 기반 수명 예측 및 신뢰도 지수 연산
  DS_API bool  DS_CALL DS_EvaluateDriveReliability(
      const DSSmartEntry* entries,
      int32_t entryCount,
      DSDriveHealthReport* outReport
  );

  // 6. [순수 창작] 초고속 하드웨어 ECC 패리티 및 CRC32 생성
  DS_API bool  DS_CALL DS_CalculateParityChecksum(
      const uint8_t* pBuffer,
      uint32_t bufferLength,
      uint32_t* outCrc32,
      uint64_t* outEccParity
  );

  // 7. 소프트 배드섹터 비파괴 원자적 수복 시도
  DS_API bool  DS_CALL DS_AttemptSoftSectorRepair(void* hDrive, uint64_t badLba, uint32_t count, uint32_t* outRecoveredStatus);

  // 8. 드라이브 핸들 및 정렬 메모리 해제
  DS_API void  DS_CALL DS_CloseDrive(void* hDrive);

  // 9. NVMe Log Page 02h 딥 텔레메트리 및 수명 상태 추출
  DS_API bool  DS_CALL DS_GetNvmeDeepTelemetry(void* hDrive, DSNvmeHealthLog* outLog);

  // 10. [순수 창작] AVX2 256비트 SIMD 가속 제로 섹터 판별 및 ECC 패리티 생성
  DS_API bool  DS_CALL DS_CalculateAvx2ChecksumAndZeroCheck(
      const uint8_t* pBuffer,
      uint32_t bufferLength,
      bool* outIsAllZeros,
      uint32_t* outCrc32,
      uint64_t* outAvxParity
  );

  // 11. [순수 창작] Rayon 스레드 풀 기반 다중 드라이브 동시 병렬 스캐너
  DS_API bool  DS_CALL DS_ScanMultipleDrivesParallel(
      const DSMultiDriveScanTarget* targets,
      uint32_t targetCount,
      DSMultiDriveScanSummary* outSummaries,
      uint32_t concurrencyLimit
  );

  // 12. [순수 창작] 시스템 트레이 경량 가디언 데몬 정책 설정
  DS_API bool  DS_CALL DS_ConfigureTrayGuardian(
      uint32_t pollIntervalSec,
      uint32_t tempThresholdC,
      bool alertOnPendingSector
  );

  // 13. [순수 창작] 시스템 트레이 경량 가디언 실시간 폴링 및 온도/이상 섹터 감시
  DS_API bool  DS_CALL DS_RunTrayGuardianCheck(
      DSTrayGuardianStatus* outStatus
  );

  // 14. [순수 창작] 휴리스틱 비트 카빙 파일 시그니처 분석 및 ECC 패리티 복구 엔진
  DS_API bool  DS_CALL DS_ExecuteBitCarvingRecovery(
      void* hDrive,
      uint64_t targetLba,
      uint32_t clusterSpan,
      DSCarvedSectorResult* outResult
  );

  // 15. 물리 디스크 32슬롯 전수 탐색 및 하드웨어 상세 정보 획득
  DS_API uint32_t DS_CALL DS_EnumeratePhysicalDrives(
      DSPhysicalDriveDetail* outDrives,
      uint32_t maxDrives
  );

  // 16. 하드웨어 표면 검증 (IOCTL_DISK_VERIFY) 및 읽기 폴백
  DS_API bool DS_CALL DS_VerifyLbaBlock(void* hDrive, uint64_t lba, uint32_t count, DSBlockResult* outResult);

  // 17. ATA S.M.A.R.T. 자가 진단(Self-Test) 시작 (1=Short, 2=Extended, 3=Conveyance, 127=Abort)
  DS_API bool DS_CALL DS_StartSmartSelfTest(void* hDrive, uint32_t testTypeCode);

  // 18. ATA S.M.A.R.T. 자가 진단 실행 상태 및 진행률(%) 조회
  DS_API bool DS_CALL DS_GetSmartSelfTestStatus(void* hDrive, uint32_t* outExecCode, uint32_t* outProgressPct);

  // 19. 열린 드라이브 핸들 기준 하드웨어 상세 정보(4K AF, 쓰기 캐시, TRIM, 온도, 수명 점수) 조회
  DS_API bool DS_CALL DS_GetDriveDetails(void* hDrive, DSPhysicalDriveDetail* outDetail);

  // 20. 디스크 이미지/복제 대상 파일용 영속 메모리 맵 핸들 열기 (CreateFileMappingW / mmap)
  DS_API void* DS_CALL DS_OpenMappedTarget(
      const char* utf8Path,
      uint32_t sectorSize,
      uint32_t accessMode,
      uint64_t initialSizeBytes
  );

  // 21. OS 할당 단위(64KB) 정렬 슬라이딩 윈도우 매핑 (Zero-Copy 사용자 공간 포인터 획득)
  DS_API bool DS_CALL DS_MapSectorWindow(
      void* hMapped,
      uint64_t startLba,
      uint32_t sectorCount,
      DSMappedSectorWindow* outWindow
  );

  // 22. 활성 메모리 맵 섹터 윈도우 해제 (UnmapViewOfFile / munmap)
  DS_API bool DS_CALL DS_UnmapSectorWindow(DSMappedSectorWindow* window);

  // 23. 쓰기 버퍼 플러시 및 메모리 맵 대상 핸들 닫기
  DS_API void DS_CALL DS_CloseMappedTarget(void* hMapped);

  // 24. Memory-Mapped Zero-Copy LBA 범위 고속 스캔 (ReadFile 복사 없이 CRC32·패리티·제로섹터 집계)
  DS_API bool DS_CALL DS_ScanMappedLbaRange(
      void* hMapped,
      uint64_t startLba,
      uint64_t sectorCount,
      uint32_t windowSectors,
      uint32_t* outCrc32,
      uint64_t* outParity,
      uint64_t* outZeroSectors
  );

  // 25. 물리 드라이브 -> 메모리 맵 파일 Direct DMA 무복사 이미징 (WriteFile·중간 버퍼 제거)
  DS_API bool DS_CALL DS_CopyLbaRangeToMappedFile(
      void* hDrive,
      uint64_t startLba,
      uint64_t totalSectors,
      const char* destUtf8Path,
      uint64_t destStartLba,
      uint32_t chunkSectors,
      uint64_t* outBytesCopied,
      uint32_t* outWin32Error
  );
}
```

> **신규 포렌식·통계 연산 순수 창작 DLL**: Z-Score 열화 클러스터 분석, $O(N \log M)$ 파일 익스텐트 히트맵, 섀넌 엔트로피/소거 NAND 판별, MBR/GPT IEEE CRC32 무결성 검증 및 VBR 디코더는 별도 순수 창작 라이브러리인 [`DiskSentinelForensics.dll`](./DiskSentinel_Forensics_DLL_Specification.md)에 구현되어 있습니다.

---

## 7. 다국어 FFI (외부 언어 바인딩) 연동 예제

### Python (`ctypes`) 연동 예제
```python
import ctypes
from ctypes import c_uint32, c_uint64, c_double, c_char, Structure, POINTER, byref

class DSBlockResult(Structure):
    _pack_ = 8
    _fields_ = [
        ("startLba", c_uint64),
        ("sectorCount", c_uint64),
        ("latencyMs", c_double),
        ("statusCode", c_uint32),
        ("win32ErrorCode", c_uint32),
        ("errorMnemonic", c_char * 32)
    ]

# DLL 로드
dll = ctypes.cdll.LoadLibrary("./bin/native/DiskSentinelNativeCore.dll")
dll.DS_OpenDriveDirect.restype = ctypes.c_void_p
dll.DS_ScanLbaBlock.restype = ctypes.c_bool

sector_size = c_uint32()
hDrive = dll.DS_OpenDriveDirect(0, byref(sector_size)) # PhysicalDrive0

if hDrive:
    res = DSBlockResult()
    success = dll.DS_ScanLbaBlock(hDrive, c_uint64(0), c_uint32(1), byref(res))
    if success:
        print(f"LBA: {res.startLba}, Latency: {res.latencyMs:.3f}ms, Status: {res.statusCode}")
    dll.DS_CloseDrive(hDrive)
```

### C# (.NET P/Invoke) 연동 예제
```csharp
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential, Pack = 8)]
public struct DSBlockResult {
    public ulong startLba;
    public ulong sectorCount;
    public double latencyMs;
    public uint statusCode;
    public uint win32ErrorCode;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string errorMnemonic;
}

public static class DiskSentinelNative {
    [DllImport("DiskSentinelNativeCore.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern IntPtr DS_OpenDriveDirect(uint driveIndex, out uint sectorSize);

    [DllImport("DiskSentinelNativeCore.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern bool DS_ScanLbaBlock(IntPtr hDrive, ulong lba, uint count, ref DSBlockResult result);

    [DllImport("DiskSentinelNativeCore.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern void DS_CloseDrive(IntPtr hDrive);
}
```

---

## 8. 컴파일 및 빌드 지침 (`build-dll.bat`)

프로젝트 루트의 **`build-dll.bat`**을 실행하면 시스템 환경을 감지하여 자동으로 빌드됩니다:

1. **MSVC (Visual Studio 2019/2022 x64 Native Tools)**:
   ```cmd
   cl.exe /O2 /LD /MD /EHsc /W4 /D_WIN32 /DDISKSENTINEL_EXPORTS src\native\DiskSentinelEngine.cpp /Fe"bin\native\DiskSentinelNativeCore.dll"
   ```
2. **MinGW-w64 G++**:
   ```cmd
   g++.exe -O3 -shared -m64 -DDISKSENTINEL_EXPORTS -D_WIN32 src/native/DiskSentinelEngine.cpp -o "bin/native/DiskSentinelNativeCore.dll"
   ```

산출물:
- `bin/native/DiskSentinelNativeCore.dll` / `DiskSentinelForensics.dll` (배포용 동적 라이브러리)
- `bin/native/DiskSentinelNativeCore.lib` / `DiskSentinelForensics.lib` (MSVC 임포트 라이브러리)

---

## 9. 저작권 및 기술 독창성 보증

1. **완전 독립 창작 (100% Original Codebase)**:
   본 DLL은 어떠한 타사 상용 바이너리의 역공학, 디컴파일, 후킹 기술도 사용하지 않았으며, 공개된 국제 표준 하드웨어 규격(ATA SFF-8035i, NVM Express Base Specification 2.0) 및 Windows Win32 커널 API를 기반으로 작성되었습니다.
2. **적응형 분해 알고리즘의 고유 IP**:
   하이브리드 다중 해상도 LBA 버스트 및 지연시간 감지 시 이진 분할 미세 추적 기법은 개발자 `AhBiYout (CISNet)`의 독창적 알고리즘입니다.
