# DiskSentinelIntegrity.dll 순수 창작 무결성·익스텐트 상관분석·차분 속도·워치독 엔진 기술 명세서

**무의존성 네이티브 FIPS 180-4 스트리밍 SHA-256 + Slicing-by-8 CRC32 + FNV-1a64 · $O((E+B)\log B)$ 물리 익스텐트 Bit-Rot 상관분석 · 일일 열화 속도 차분(Diff Velocity) · 플릿 워치독 룰 매트릭스 엔진**

- **작성자 / 개발자**: AhBiYout (GitHub: [AhBiYout-all](https://github.com/AhBiYout-all))
- **소속**: [CISNet](https://www.cisnet.co.kr)
- **공식 기술 블로그**: [ahbiyoutvibe.blogspot.com](https://ahbiyoutvibe.blogspot.com/)
- **라이선스**: Apache-2.0 (100% 독립 창작 알고리즘 및 소스 코드)
- **엔진 버전**: `4.6.0-integrity` (C ABI v1, `#pragma pack(push, 8)`)
- **대상 플랫폼**: Windows 10/11 x64·ARM64 (`DiskSentinelIntegrity.dll`), Tauri v2 Rust `LoadLibraryW` 동적 로드 및 Linux/macOS POSIX C ABI 호환

---

## 1. 개발 배경 및 순수 창작 설계 의의 (Design Philosophy)

기존 4-DLL 아키텍처에 **5번째 순수 창작 네이티브 라이브러리(`DiskSentinelIntegrity.dll`)**가 합류함으로써 Disk Bad Sector Scanner는 **Penta-DLL(5-DLL) 순수 창작 네이티브 엔진 스위트**를 완성합니다:

1. **`DiskSentinelNativeCore.dll`**: OS 캐시 우회 Direct DMA, Memory-Mapped Zero-Copy I/O, $O(\log K)$ 이진 분할 탐색, S.M.A.R.T./NVMe 패스스루
2. **`DiskSentinelForensics.dll`**: Welford 단일 패스 Z-Score, 익스텐트 히트맵, 섀넌 엔트로피, GPT CRC32/VBR 구조 검증
3. **`DiskSentinelPredictive.dll`**: Weibull RUL 예측, 음향 RMSSD 지터/FTL 스톨 분석, Arrhenius 열가속, OLS S.M.A.R.T. 추세 회귀
4. **`DiskSentinelRecovery.dll`**: 16+ 시그니처 카빙·Hamming 복원, NTFS `$MFT` USA/Runlist 디코더, NIST `Xoshiro256**` 소거 검증, ddrescue 구간 플래너
5. **`DiskSentinelIntegrity.dll`** *(제5 순수 창작 DLL)*: 커널 핸들에 일절 의존하지 않고 **암호학적 해시 스트리밍, LBA 익스텐트-결함 교차 상관분석, 스캔 시점 간 열화 속도 차분(Diff), 다중 드라이브 워치독 SLA 매트릭스 평가**를 C++ 네이티브 속도로 일원화합니다.

### 왜 `DiskSentinelIntegrity.dll`이 별도 창작 DLL로 적합한가?
- **대용량 파일 스트리밍 SHA-256 오프로드**: `sha256_file_streaming`(Tauri `main.rs`)이 64KB 청크 단위로 파일을 읽을 때 Windows에서는 `LoadLibraryW`로 로드된 `DiskSentinelIntegrity.dll`의 `DSI_Sha256Init` / `DSI_Sha256Update` / `DSI_Sha256Final`을 직접 호출해 C++ `-O2/-O3` 최적화 FIPS 180-4 압축 루프로 해시를 계산합니다.
- **무결성 점수·생존율 일관성 보장**: 중요 폴더 LBA 매핑의 Bit-Rot 위험도, 스캔 A↔B 비교의 일일 열화 속도(`badSectorsPerDay`, `healthLossPerDay`), 플릿 워치독의 `fleetHealthIndex`가 C++ DLL·Rust 패리티·TypeScript 패리티 3계층에서 단 하나의 수식 오차도 없이 결정적으로 일치합니다.
- **제로 핸들 독립 검증**: 외부 C# 런처·Python 포렌식 스크립트·배치 감사 도구도 Win32 디스크 핸들 없이 표준 C ABI로 동일 SHA-256/CRC32/FNV-1a64 및 익스텐트 리스크 엔진을 호출할 수 있습니다.

---

## 2. 아키텍처 및 4대 핵심 모듈 동작 원리

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                DiskSentinelIntegrity.dll (Pure Creative Integrity Engine)                │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 1] Streaming FIPS 180-4 SHA-256 + Slicing-by-8 IEEE CRC32 + FNV-1a64             │
│  - DSI_Sha256Init, DSI_Sha256Update, DSI_Sha256Final, DSI_ComputeIntegrityDigest         │
│  - 64B 블록 스트리밍 컨텍스트, 빅엔디언 64bit 비트 길이 패딩, 단일 버퍼 삼중 다이제스트  │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 2] O((E + B) log B) Extent Correlation & Bit-Rot / Survivability Risk Scorer     │
│  - DSI_EvaluateExtentIntegrity                                                           │
│  - std::lower_bound 이진 탐색, 중복 배드/지연 LBA 섹터 집계, 생존율(0~100%) 산출        │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 3] Scan-vs-Scan & S.M.A.R.T. Snapshot Delta / Daily Degradation Velocity Engine  │
│  - DSI_ComputeScanSmartDiff                                                              │
│  - 시간축(>=1시간 가드) 일일 배드·건강도 손실 속도, 속성별 악화/개선, 4단계 회귀 등급    │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 4] Fleet Watchdog SLA Rule Matrix Evaluator                                      │
│  - DSI_EvaluateWatchdogMatrix                                                            │
│  - 온도/05h증감/C5h/건강도/정기스캔/링크다운 6종 규칙 × N드라이브 쿨다운/HealthIndex    │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 FIPS 180-4 스트리밍 SHA-256 + Slicing-by-8 CRC32 + FNV-1a64
- **스트리밍 파이프라인 (`DSI_Sha256Init` / `Update` / `Final`)**:
  - `DSISha256Context` (112B)는 8개 32비트 상태 레지스터(`state[8]`), 누적 바이트(`totalBytes`), 64B 잔여 블록 버퍼(`buffer[64]`), 채워진 길이(`bufLen`), 완료 플래그(`finalized`)를 유지합니다.
  - 임의 크기 청크(예: Tauri 백엔드의 64KB `Read` 버퍼)가 입력되면 선행 잔여 블록을 채워 `dsi_sha256_transform` 64라운드 압축을 실행한 뒤 전체 64B 정렬 블록을 제로 복사 순회합니다.
  - `DSI_Sha256Final`은 `0x80` 패딩과 64비트 빅엔디언 총 비트 길이(`totalBytes * 8`)를 부착해 최종 압축 후 32바이트 이진 다이제스트와 64자 소문자 Hex 문자열(`char[65]`)을 출력합니다.
- **단일 버퍼 삼중 지문 (`DSI_ComputeIntegrityDigest`)**:
  - 단일 호출로 암호학적 무결성(**SHA-256**), 블록 전송 오류 검출(**Slicing-by-8 IEEE 802.3 CRC32**, 다항식 `0xEDB88320`), 고속 해시맵 인덱싱(**FNV-1a 64-bit**, 오프셋 베이시스 `14695981039346656037`, 소수 `1099511628211`)을 모두 반환합니다.

### 2.2 $O((E + B)\log B)$ 물리 LBA 익스텐트 상관분석 & 생존성 평가 (`DSI_EvaluateExtentIntegrity`)
- **원리**:
  - Win32 `FSCTL_GET_RETRIEVAL_POINTERS`로 추출된 파일의 물리 익스텐트 목록 `extents[E]`(`startLba..endLba`)을 정렬된 결함 `badLbas[B]` 및 고지연 `slowLbas[S]` 배열에 대해 `std::lower_bound` 이진 탐색으로 교차 조회합니다.
  - 미정렬 입력(`inputsSorted == false`) 시 내부 복사본을 정렬한 후 순회하며 중복 LBA를 제거하고 최대 256개 충돌 LBA 샘플과 전체 영향 섹터 수를 산출합니다.
- **상태 우선순위 (`DSIIntegrityStatusCode`)**:
  - `6 MISSING` → `5 UNREADABLE` → `4 HASH_MISMATCH (Bit-Rot)` → `3 BAD_LBA_OVERLAP` → `2 SLOW_LBA_OVERLAP` → `0 VERIFIED` → `1 UNVERIFIED`
- **위험도(`riskScore`) 및 생존율(`survivabilityPct`) 모델**:
  - 누락(`isMissing`) 시 즉시 `riskScore = 100.0`, 그 외에는 해시 불일치(`+78`), 읽기 불가(`+85`), 배드 LBA 중첩(`55 + min(35, hits*6.5)`), 지연 LBA 중첩(`18 + min(22, hits*2.5)`), 과도한 파일 단편화(`>32 extents` 시 최대 `+10`)를 합산하고 `[0, 100]`으로 클램핑한 뒤 `survivabilityPct = 100.0 - riskScore`로 직관적인 생존 가능 비율을 계산합니다.

### 2.3 스캔 시점 비교 차분 & 일일 열화 속도 엔진 (`DSI_ComputeScanSmartDiff`)
- **서브-아워 노이즈 폭주 차단**:
  - 두 스캔 간 경과 일수 `elapsedDays = (timestampBMs - timestampAMs) / 86400000.0`가 **1시간(`1/24`일)** 미만일 경우 일일 외삽(`badSectorsPerDay`, `healthLossPerDay`)을 `0.0`으로 억제하여 직후 재스캔 시 기울기가 수만 배로 과장되는 오류를 방지합니다(Predictive DLL의 OLS 가드와 동일 규격).
- **다변량 회귀 점수(`regressionScore 0..100`) & 4단계 등급(`regressionGradeCode`)**:
  - 배드 증가(`42 + min(28, badDelta*4.5)`), 지연/임계 증가(`min(16, slowDelta*1.2)`), 건강도 하락(`min(22, -healthDelta*1.5)`), 평균 레이턴시 `+5ms` 초과 증가(`min(12, (latDelta-5)*0.4)`), S.M.A.R.T. 상태 악화 속성(`+8.5/개`), 개선 속성(`-4.0/개`)을 종합해 `0 IMPROVED` / `1 STABLE` / `2 DEGRADING` / `3 CRITICAL`을 분류합니다.

### 2.4 플릿 워치독 SLA 매트릭스 평가기 (`DSI_EvaluateWatchdogMatrix`)
- 전체 드라이브의 평균 건강 지수(`fleetHealthIndex`)와 최악 상태 드라이브(`worstDriveIndex`)를 산출합니다.
- 활성화된 각 규칙의 쿨다운(`cooldownMinutes`, 최소 1분) 또는 정기 Quick Scan 주기(`intervalMinutes`, 최소 5분)를 준수하며 6종 메트릭(`0 TEMP`, `1 SMART_05_DELTA`, `2 SMART_C5`, `3 HEALTH_SCORE`, `4 SCHEDULED_QUICK_SCAN`, `5 LINK_DOWNGRADED`)을 일괄 평가합니다.

### 2.5 결정적 Known-Answer Test 자가 진단 (`DSI_GetIntegrityEngineInfo`)
엔진 로드 시 아래 4종 수학 불변식을 즉시 실측 검증해 `selfTestPassed` 비트를 설정합니다:
1. **FIPS 180-4 SHA-256 KAT**: `"abc"` → `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`
2. **IEEE 802.3 CRC32 KAT**: `"123456789"` → `0xCBF43926`
3. **Extent Correlation KAT**: `[1000..1050]` ∩ `{1024, 2048}` → `statusCode == 3`, `badHitCount == 1`, `hit == 1024`
4. **Diff Velocity KAT**: 2일 경과 · 배드 `0→4` → `badDelta == 4`, `badSectorsPerDay == 2.0`, `regressionGradeCode == 2 (DEGRADING)`

---

## 3. C ABI 구조체 메모리 레이아웃 (`#pragma pack(push, 8)`)

모든 구조체는 64비트 경계에 맞추어 암시적 컴파일러 패딩이 **0바이트**가 되도록 명시적 `reserved` 필드를 배치했습니다.

| 구조체 | 크기 | 주요 필드 |
| :--- | :---: | :--- |
| `DSIEngineInfo` | 128 B | `version[32]`, `capabilityMask`, `selfTestPassed`, `sha256KatPassed`, `extentKatPassed`, `diffKatPassed`, `selfTestCrc32`, `selfTestFnv1a64`, `sha256KatHex[65]` |
| `DSISha256Context` | 112 B | `state[8]`, `totalBytes`, `buffer[64]`, `bufLen`, `finalized` |
| `DSIIntegrityDigestReport` | 128 B | `inspectedBytes`, `crc32`, `fnv1a64`, `sha256Bytes[32]`, `sha256Hex[65]` |
| `DSIExtentInterval` | 16 B | `startLba`, `endLba` |
| `DSIExtentIntegrityReport` | 56 B | `extentCount`, `statusCode`, `badHitCount`, `slowHitCount`, `affectedBadSectors`, `affectedSlowSectors`, `totalMappedSectors`, `riskScore`, `survivabilityPct`, flags |
| `DSISmartAttrSnapshot` | 32 B | `attributeId`, `currentA/B`, `statusA/B`, `rawA/B`, `presentA/B` |
| `DSISmartAttrDiffRow` | 24 B | `attributeId`, `currentDelta`, `rawDelta`, `worsened`, `improved`, `statusA/B` |
| `DSIScanDiffInput` | 72 B | `timestampAMs/BMs`, `badSectorsA/B`, `slowCriticalA/B`, `healthScoreA/B`, `avgReadLatencyMsA/B`, `attrCount` |
| `DSIScanDiffSummary` | 72 B | `elapsedDays`, `badDelta`, `slowCriticalDelta`, `healthDelta`, `latencyDeltaMs`, `badSectorsPerDay`, `healthLossPerDay`, `worsenedAttrCount`, `improvedAttrCount`, `regressionGradeCode`, `regressionScore` |
| `DSIWatchdogDriveState` | 48 B | `driveIndex`, `temperatureC`, `healthScore`, `smart05Raw`, `smart05Baseline`, `smartC5Raw`, `isLinkDowngraded` |
| `DSIWatchdogRuleInput` | 40 B | `ruleIndex`, `targetDriveIndex`, `metricCode`, `intervalMinutes`, `thresholdValue`, `cooldownMinutes`, `enabled`, `lastTriggeredMs` |
| `DSIWatchdogTriggerOut` | 32 B | `ruleIndex`, `driveIndex`, `metricCode`, `severityCode`, `observedValue`, `thresholdValue` |
| `DSIWatchdogMatrixReport` | 32 B | `evaluatedDriveCount`, `evaluatedRuleCount`, `triggeredCount`, `quickScanTargetCount`, `worstDriveIndex`, `fleetHealthIndex` |

---

## 4. 8대 C ABI 익스포트 API 명세

```cpp
// 1. 엔진 메타데이터 & 4종 KAT 자가진단
DSI_API bool DSI_CALL DSI_GetIntegrityEngineInfo(DSIEngineInfo* outInfo);

// 2~4. 스트리밍 FIPS 180-4 SHA-256 파이프라인
DSI_API bool DSI_CALL DSI_Sha256Init(DSISha256Context* ctx);
DSI_API bool DSI_CALL DSI_Sha256Update(DSISha256Context* ctx, const uint8_t* pData, uint32_t dataLen);
DSI_API bool DSI_CALL DSI_Sha256Final(DSISha256Context* ctx, uint8_t outDigest[32], char* outHex65);

// 5. 단일 패스 삼중 다이제스트 (SHA-256 + CRC32 + FNV-1a64)
DSI_API bool DSI_CALL DSI_ComputeIntegrityDigest(const uint8_t* pData, uint32_t dataLen, DSIIntegrityDigestReport* outReport);

// 6. 물리 LBA 익스텐트 교차 상관분석 & Bit-Rot 생존성 평가
DSI_API bool DSI_CALL DSI_EvaluateExtentIntegrity(
    const DSIExtentInterval* extents, uint32_t extentCount,
    const uint64_t* badLbas, uint32_t badCount,
    const uint64_t* slowLbas, uint32_t slowCount,
    bool inputsSorted, bool hashMismatch, bool isUnreadable, bool isMissing, bool hasSha256,
    uint64_t* outBadHits, uint32_t maxBadHits,
    uint64_t* outSlowHits, uint32_t maxSlowHits,
    DSIExtentIntegrityReport* outReport);

// 7. 스캔 A↔B 및 S.M.A.R.T. 일일 열화 속도 차분 분석
DSI_API bool DSI_CALL DSI_ComputeScanSmartDiff(
    const DSIScanDiffInput* pInput,
    const DSISmartAttrSnapshot* pAttrs, uint32_t attrCount,
    DSISmartAttrDiffRow* outAttrRows, uint32_t maxAttrRows,
    DSIScanDiffSummary* outSummary);

// 8. 다중 드라이브 워치독 규칙 매트릭스 평가
DSI_API bool DSI_CALL DSI_EvaluateWatchdogMatrix(
    const DSIWatchdogDriveState* pDrives, uint32_t driveCount,
    const DSIWatchdogRuleInput* pRules, uint32_t ruleCount,
    int64_t nowMs,
    DSIWatchdogTriggerOut* outTriggers, uint32_t maxTriggers,
    uint32_t* outQuickScanDriveIndices, uint32_t maxQuickScanTargets,
    DSIWatchdogMatrixReport* outReport);
```

---

## 5. 빌드 및 앱 내 FFI 연동 구조

### MSVC x64 / MinGW / Linux GCC 빌드
```cmd
:: Windows MSVC
cl.exe /O2 /LD /MD /EHsc /W4 /D_WIN32 /DDSI_EXPORTS src\native\DiskSentinelIntegrity.cpp /Fe"bin\native\DiskSentinelIntegrity.dll"

:: MinGW-w64
g++.exe -O3 -shared -m64 -DDSI_EXPORTS -D_WIN32 src/native/DiskSentinelIntegrity.cpp -o bin/native/DiskSentinelIntegrity.dll

:: Linux POSIX 검증 빌드
g++ -std=c++17 -O2 -Wall -Wextra -shared -fPIC src/native/DiskSentinelIntegrity.cpp -o libDiskSentinelIntegrity.so
```

### Tauri Rust (`src-tauri/src/main.rs`) & TypeScript (`src/utils/integrityDllBridge.ts`)
- Windows 런타임 시 `get_integrity_dll()`이 `LoadLibraryW`로 `DiskSentinelIntegrity.dll`을 동적 로드하며, `sha256_file_streaming`의 대용량 파일 해싱도 64KB 청크 단위로 C++ `DSI_Sha256Update`를 직접 사용합니다.
- IPC 커맨드 5종(`inspect_integrity_dll_status`, `compute_integrity_digest`, `evaluate_extent_integrity`, `compute_scan_smart_diff`, `evaluate_fleet_watchdog`)은 `FolderLbaIntegrityPanel.tsx`, `HistoryAndComparison.tsx`, `TrayGuardianModal.tsx`, `watchdogEngine.ts`에 실시간 연동되며 브라우저 미리보기 시 동일 수식의 TypeScript 패리티로 동작합니다.

---

## 6. 동시 감사에 따른 기존 4종 DLL 수정 요약

`DiskSentinelIntegrity.dll` 신설과 함께 기존 4종 DLL 및 Rust/TS 패리티 계층 전수 감사를 통해 아래 버그를 함께 수정했습니다:

| 대상 모듈 | 발견된 결함 | 수정 조치 |
| :--- | :--- | :--- |
| **`DiskSentinelNativeCore` (C++)** | `DS_ScanLbaBlock`이 읽기 실패(`DS_STATUS_BAD`) 시에도 `true`를 반환해 `main.rs` 치명 핸들 중단(`isFatalHandleError`)과 일관성이 어긋남 | `DS_ScanLbaBlockWithPolicy`/`DS_VerifyLbaBlock`/Rust 미러와 동일하게 `readSuccess ? true : false` 반환으로 통일 |
| **`DiskSentinelNativeCore` (C++/Rust)** | `DS_EvaluateDriveReliability`에서 온도 속성 `0xC2`/`0xBE` 동시 존재 시 이중 감점 및 `raw=0xFF` 이상치 오감점 | `1..149°C` 범위 검증, 주 센서 `0xC2` 우선 단일 선택, 루프 종료 후 1회 감점으로 교정 |
| **`DiskSentinelNativeCore` (C++/Rust)** | `0xA0 \| ((driveIndex & 1) << 4)` PATA 레거시 슬레이브 비트(`0xB0`)로 인해 `PhysicalDrive1/3/5...` 홀수 SATA AHCI/USB 브릿지 S.M.A.R.T. 조회 실패 | `0xA0` 우선 고정 프로브 + 홀수 드라이브 실패 시에만 `0xB0` 레거시 폴백으로 교정 (`DS_GetSmartTelemetry`, `DS_StartSmartSelfTest`, `DS_GetSmartSelfTestStatus`, `DS_AtaIdentifyDevice`) |
| **`DiskSentinelForensics` (C++)** | GPT 헤더 CRC32 계산 버퍼가 128B 고정되어 >128B 확장 GPT 헤더에서 잘림 발생 | 스택 버퍼 `512B`로 확장 및 Windows LDM/Storage Spaces, Linux Swap/LVM/LUKS, Apple APFS/HFS+ GUID 분류 추가 |
| **`DiskSentinelPredictive` (C++/Rust/TS)** | 1시간 미만 연속 샘플에서 OLS 일일 기울기(`slopePerDay`)가 수만 단위로 폭주 | 3계층 모두 `observationSpanDays >= 1/24` 최소 관측 창 가드 적용 |
| **`DiskSentinelRecovery` (C++/Rust/TS)** | 한국어 UTF-8 로그 멀티바이트 시퀀스가 비인쇄 바이트로 간주되어 `Raw Binary`로 오분류, `$MFT` `targetLba == 0` 시 레코드 0 오탐 | 유효 2/3/4바이트 UTF-8 시퀀스를 `printable` 비율에 반영, `targetLba > 0 && targetLba != UINT64_MAX` 조건 강제 |
