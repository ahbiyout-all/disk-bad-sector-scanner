# DiskSentinelPredictive.dll 순수 창작 장애 예측·음향 진동 분석 DLL 기술 명세서

**무의존성 네이티브 Weibull RUL · 음향 탐색 RMSSD 지터 · Arrhenius 열가속 · S.M.A.R.T. OLS 추세 회귀 엔진 (Pure Creative Predictive & Acoustic Analytics DLL)**

- **작성자 / 개발자**: AhBiYout (GitHub: [AhBiYout-all](https://github.com/AhBiYout-all))
- **소속**: [CISNet](https://www.cisnet.co.kr)
- **공식 기술 블로그**: [ahbiyoutvibe.blogspot.com](https://ahbiyoutvibe.blogspot.com/)
- **라이선스**: Apache-2.0 (100% 독립 창작 알고리즘 및 소스 코드)
- **엔진 버전**: v4.6.0 (ABI v1)
- **대상 플랫폼**: Windows 10/11 x64·ARM64 (`DiskSentinelPredictive.dll`), Tauri v2 Rust `LoadLibraryW` 동적 로드 및 POSIX/Linux 크로스 플랫폼 C ABI 호환

---

## 1. 개발 배경 및 순수 창작 설계 의의 (Design Philosophy)

기존 **`DiskSentinelNativeCore.dll`**이 커널 Direct DMA/S.M.A.R.T. 입출력을 담당하고 **`DiskSentinelForensics.dll`**이 Z-Score 군집 탐지·섀넌 엔트로피·GPT CRC32 포렌식을 담당한다면, 신규 순수 창작 라이브러리인 **`DiskSentinelPredictive.dll`**은 물리 디스크의 **단기 텔레메트리와 장기 마모 이력을 결합해 미래 고장 확률과 잔여 수명을 정량 예측**하는 전용 수리 예지(Prognostic) 엔진입니다.

현재 DiskSentinel Pro의 **Penta-DLL(5-DLL) 분업 아키텍처**(`NativeCore`, `Forensics`, `Predictive`, `Recovery`, `Integrity`) 내에서의 고유 역할은 다음과 같습니다:
1. **비선형 고장 위험률 모델링**: 단순 선형 감점이 아닌 **Weibull 욕조 곡선(Bathtub / Wear-Out Curve)** 기반의 조건부 고장 확률($30\text{일} / 90\text{일} / 365\text{일}$)과 중앙값 잔여 수명(Median RUL Days)을 산출합니다.
2. **기계적 액추에이터·FTL 음향 진동 프로파일링**: 연속 LBA 탐색 지연의 인접 차분 제곱평균제곱근(**RMSSD Jitter**)을 연산해 HDD 헤드 공진/재시도 진동과 SSD FTL 가비지 컬렉션(GC) 마이크로 스톨 버스트를 정밀 분리합니다.
3. **물리 화학적 열 스트레스 정량화**: 반도체 산화막 및 베어링 윤활유 열화 법칙인 **Arrhenius 열가속 방정식**을 적용해 $35^\circ\text{C}$ 기준 등가 가동시간과 일일 TBW 소진율을 계산합니다.
4. **시계열 S.M.A.R.T. 회귀 예측**: 불규칙한 타임스탬프를 가진 다중 S.M.A.R.T. 이력에 **중심화 최소제곱(Centered OLS)** 선형 회귀를 적용해 $R^2$, 30일 예상치, 주의/위험 임계치 도달 예상 일수를 도출합니다.

---

## 2. 아키텍처 및 4대 순수 창작 알고리즘 동작 원리

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                  DiskSentinelPredictive.dll (Pure Creative Prognostic Engine)            │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 1] Weibull Bathtub Hazard & Conditional RUL Estimator                            │
│  - DSP_ComputeWeibullRul                                                                 │
│  - 매체별(HDD/SATA SSD/NVMe/USB) 특성 수명(η)·형상 모수(β) 동적 보정 & 조건부 RUL 산출 │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 2] Acoustic Seek Instability, RMSSD Jitter & FTL Micro-Stall Profiler            │
│  - DSP_AnalyzeAcousticSeekProfile                                                        │
│  - 순차 vs 스트라이드 RMSSD 분리, 연속 스톨 버스트 횟수, 공진비(Resonance Ratio) 연산   │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 3] Arrhenius Thermal Acceleration & TBW Endurance Stress Evaluator               │
│  - DSP_EvaluateThermalWearStress                                                         │
│  - Ea=0.7 eV 열가속 계수(AF), 경고/위험 온도 체류 가중, 일일 TBW 쓰기율 및 잔여 연수    │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Module 4] Centered OLS S.M.A.R.T. History Degradation Regressor                         │
│  - DSP_ProjectSmartDegradationTrend                                                      │
│  - 중심화 공분산/분산 2-Pass OLS 회귀(일 변화율, R², 30일 전망, 임계치 도달 일수 예측)  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Weibull 욕조 곡선 & 조건부 잔여 수명 추정 (`DSP_ComputeWeibullRul`)
- **매체별 기본 모수($\eta_{\text{base}}, \beta_{\text{base}}$)**:
  - NVMe SSD: $\eta = 75,000\text{h}, \beta = 1.25$ / SATA SSD: $\eta = 65,000\text{h}, \beta = 1.30$
  - HDD: $\eta = 50,000\text{h}, \beta = 1.40$ / USB Flash: $\eta = 25,000\text{h}, \beta = 1.45$
- **결함 가중 수축 모델**:
  - 보류 섹터(`0xC5`), 복구 불가 오류(`0xBB`/`0xC6`), 재할당 섹터(`0x05`), NVMe 마모율(`Percentage Used`), 가용 예비 블록 부족, $45^\circ\text{C}$ 초과 열 스트레스, 비정상 종료 횟수를 합산해 결함 심각도 $D$를 산출하고 특성 수명 $\eta = \max(720, \eta_{\text{base}} e^{-0.42 D})$ 및 형상 모수 $\beta \in [1.05, 3.80]$를 갱신합니다.
- **조건부 고장 확률 및 중앙값 RUL**:
  $$P(T \le t_0 + \Delta t \mid T > t_0) = 1 - \exp\!\left[\left(\frac{t_0}{\eta}\right)^\beta - \left(\frac{t_0 + \Delta t}{\eta}\right)^\beta\right]$$
  $$t_{\text{RUL, hours}} = \eta \left[\left(\frac{t_0}{\eta}\right)^\beta + \ln 2\right]^{1/\beta} - t_0$$

### 2.2 음향 탐색 불안정성, RMSSD 지터 및 FTL 스톨 프로파일러 (`DSP_AnalyzeAcousticSeekProfile`)
- **원리**:
  - 단순 표준편차는 느린 외주-내주(OD-to-ID) 구배까지 변동으로 오인합니다. 본 엔진은 물리 LBA 순서의 **연속 샘플 간 지연시간 차분** $\Delta_i = |L_i - L_{i-1}|$으로 **RMSSD(Root Mean Square of Successive Differences)**를 계산해 고주파 액추에이터 진동과 순간 스톨만 분리해냅니다:
  $$\text{RMSSD} = \sqrt{\frac{1}{K}\sum_{i=1}^{K} (L_i - L_{i-1})^2}$$
- **순차 vs 스트라이드 분리 & 마이크로 스톨 버스트**:
  - LBA 간격 $\le 131,072$ 섹터인 순차 탐색 지터(`sequentialJitterMs`)와 점프/역탐색 지터(`randomSeekJitterMs`)를 구분하고 공진비(`resonanceRatio`)를 산출합니다.
  - 중앙값의 3배(SSD 최소 15ms, HDD 최소 35ms)를 2회 이상 연속 초과하는 구간을 **마이크로 스톨 버스트(`microStallBurstCount`)**로 집계합니다.

### 2.3 Arrhenius 열가속 마모 & TBW 내구도 평가 (`DSP_EvaluateThermalWearStress`)
- **수학적 모델**:
  - 활성화 에너지 $E_a = 0.7\text{ eV}$, 볼츠만 상수 $k_B = 8.617333 \times 10^{-5}\text{ eV/K}$ ($E_a / k_B = 8123.166\text{ K}$), 기준 온도 $T_{\text{ref}} = 35^\circ\text{C}\,(308.15\text{ K})$ 기준 열가속 계수:
  $$AF = \exp\!\left[\frac{E_a}{k_B}\left(\frac{1}{T_{\text{ref}}} - \frac{1}{T_{\text{op}}}\right)\right]$$
- **열 체류 보정 & TBW 수명**:
  - NVMe Warning/Critical 온도 초과 분(minutes) 비율로 지속 열 스트레스 계수(`sustainedThermalStressFactor`)와 등가 노화 시간(`effectiveAgedHours`)을 보정하며, 누적 쓰기량(TB)과 정격 TBW 한계로부터 일일 쓰기량(`dailyTbwRateGb`) 및 잔여 연수(`estimatedTbwRemainingYears`)를 계산합니다.

### 2.4 중심화 최소제곱(OLS) S.M.A.R.T. 열화 추세 회귀기 (`DSP_ProjectSmartDegradationTrend`)
- **원리**:
  - 타임스탬프의 최솟값 `minTs` 기준 일수 $x_i = (\text{ts}_i - \text{minTs}) / 86400$을 구하고 표본 평균 $(\bar{x}, \bar{y})$으로 중심화한 2-Pass OLS로 부동소수점 정밀도 손실 없이 일 변화율(`slopePerDay`), 결정 계수(`rSquared`), 30일 전망치(`projectedValue30d`) 및 주의/위험 임계치 도달 예상 일수(`projectedDaysToWarning`, `projectedDaysToCritical`)를 산출합니다.

---

## 3. 바이너리 C ABI 구조체 및 익스포트 API 명세 (`DiskSentinelPredictive.h`)

모든 구조체는 `#pragma pack(push, 8)`으로 8바이트 정렬되며 `DSP_CALL` (`__stdcall`) 규약을 따릅니다.

```cpp
extern "C" {
  // 1. 엔진 메타데이터 및 Weibull(1-e^-1) + OLS(y=2x+10, R²=1.0) 결정적 자가 검증
  DSP_API bool DSP_CALL DSP_GetPredictiveEngineInfo(DSPEngineInfo* outInfo);

  // 2. Weibull 욕조 곡선 조건부 고장 확률 & 잔여 수명(RUL) 추정
  DSP_API bool DSP_CALL DSP_ComputeWeibullRul(
      const DSPWeibullInput* input, DSPWeibullRulReport* outReport);

  // 3. 음향 탐색 RMSSD 지터, 순차/스트라이드 분리 & FTL 마이크로 스톨 분석
  DSP_API bool DSP_CALL DSP_AnalyzeAcousticSeekProfile(
      const DSPAcousticSample* samples, uint32_t sampleCount,
      uint32_t mediaType, DSPAcousticProfile* outProfile);

  // 4. Arrhenius 열가속(0.7 eV) & TBW 내구도 스트레스 평가
  DSP_API bool DSP_CALL DSP_EvaluateThermalWearStress(
      const DSPThermalWearInput* input, DSPThermalWearReport* outReport);

  // 5. 중심화 OLS S.M.A.R.T. 시계열 열화 기울기 & 임계치 도달 일수 예측
  DSP_API bool DSP_CALL DSP_ProjectSmartDegradationTrend(
      const DSPSmartHistoryPoint* points, uint32_t pointCount,
      double warningThreshold, double criticalThreshold,
      uint32_t lowerIsWorse, DSPSmartTrendProjection* outProjection);
}
```

---

## 4. Tauri 데스크톱 통합 & 다국어 FFI 연동

### Tauri v2 Rust 동적 로드 및 패리티 통합 (`src-tauri/src/main.rs`)
- Windows 데스크톱 실행 시 `LoadLibraryW` / `GetProcAddress`로 실행 파일 인접 경로의 `DiskSentinelPredictive.dll`을 동적 로드하고, 미배치/비-Windows 환경에서도 동일 수리 모델을 실행하는 Rust 패리티 fallback을 내장합니다.
- 등록된 5개 IPC 커맨드:
  - `inspect_predictive_dll_status`
  - `compute_predictive_weibull_rul`
  - `analyze_acoustic_seek_profile`
  - `evaluate_thermal_wear_stress`
  - `project_smart_degradation_trend`

### Python (`ctypes`) 연동 예제
```python
import ctypes
from ctypes import c_uint32, c_uint64, c_double, c_char, c_bool, Structure, byref

class DSPWeibullInput(Structure):
    _pack_ = 8
    _fields_ = [
        ("mediaType", c_uint32),
        ("powerOnHours", c_uint32),
        ("temperatureCelsius", c_uint32),
        ("percentageUsed", c_uint32),
        ("availableSparePct", c_uint32),
        ("reallocatedSectors", c_uint32),
        ("pendingSectors", c_uint32),
        ("uncorrectableErrors", c_uint32),
        ("unsafeShutdowns", c_uint64),
        ("avgDailyPowerOnHours", c_double),
    ]

class DSPWeibullRulReport(Structure):
    _pack_ = 8
    _fields_ = [
        ("weibullShapeBeta", c_double),
        ("weibullScaleEtaHours", c_double),
        ("failureProb30dPct", c_double),
        ("failureProb90dPct", c_double),
        ("failureProb365dPct", c_double),
        ("hazardRatePer1kHours", c_double),
        ("reliabilityIndexPct", c_double),
        ("estimatedRulDays", c_uint32),
        ("riskGradeCode", c_uint32),
        ("primaryRiskFactor", c_char * 64),
    ]

dll = ctypes.windll.LoadLibrary("./bin/native/DiskSentinelPredictive.dll")
dll.DSP_ComputeWeibullRul.restype = c_bool

inp = DSPWeibullInput(2, 12000, 44, 15, 98, 0, 0, 0, 12, 8.0)
rep = DSPWeibullRulReport()
if dll.DSP_ComputeWeibullRul(byref(inp), byref(rep)):
    print(f"RUL={rep.estimatedRulDays}d, 90d={rep.failureProb90dPct:.2f}%, Driver={rep.primaryRiskFactor.decode()}")
```

### C# (.NET P/Invoke) 연동 예제
```csharp
[DllImport("DiskSentinelPredictive.dll", CallingConvention = CallingConvention.StdCall)]
[return: MarshalAs(UnmanagedType.I1)]
public static extern bool DSP_ComputeWeibullRul(ref DSPWeibullInput input, out DSPWeibullRulReport report);
```

### 빌드 지침 (`build-dll.bat`)
- **MSVC (x64 Release)**:
  ```cmd
  cl.exe /O2 /LD /MD /EHsc /W4 /D_WIN32 /DDSP_EXPORTS src\native\DiskSentinelPredictive.cpp /Fe"bin\native\DiskSentinelPredictive.dll"
  ```
- **MinGW-w64 (GCC x64 Release)**:
  ```cmd
  g++.exe -O3 -shared -m64 -DDSP_EXPORTS -D_WIN32 src/native/DiskSentinelPredictive.cpp -o "bin/native/DiskSentinelPredictive.dll"
  ```
- Inno Setup (`setup.iss`) 및 GitHub Actions (`.github/workflows/tauri-desktop.yml`) 모두 `DiskSentinelPredictive.dll`을 자동 컴파일하여 패키징/스테이징합니다.
