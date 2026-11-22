/**
 * @file DiskSentinelPredictive.h
 * @brief Pure Creative Predictive Failure & Acoustic Analytics DLL Export Header
 *        (DiskSentinelPredictive.dll)
 *        Zero-dependency native prognostic engine for:
 *          1. Weibull Hazard Curve & Conditional Remaining Useful Life (RUL) Estimation
 *          2. Acoustic Seek Instability, Actuator RMSSD Jitter & FTL GC Stall Profiling
 *          3. Arrhenius Thermal Acceleration & TBW Workload Wear Stress Modeling
 *          4. Multi-Attribute S.M.A.R.T. History OLS Linear Degradation Projection
 * @author AhBiYout (GitHub: AhBiYout-all)
 * @affiliation CISNet (https://www.cisnet.co.kr)
 * @blog https://ahbiyoutvibe.blogspot.com/
 * @license Apache-2.0
 */

#ifndef DISK_SENTINEL_PREDICTIVE_H
#define DISK_SENTINEL_PREDICTIVE_H

#ifdef _WIN32
  #ifdef DSP_EXPORTS
    #define DSP_API __declspec(dllexport)
  #else
    #define DSP_API __declspec(dllimport)
  #endif
  #define DSP_CALL __stdcall
#else
  #define DSP_API __attribute__((visibility("default")))
  #define DSP_CALL
#endif

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// Capability flags for DSPEngineInfo.capabilitiesMask
#define DSP_CAP_WEIBULL_RUL        (1U << 0)
#define DSP_CAP_ACOUSTIC_SEEK      (1U << 1)
#define DSP_CAP_THERMAL_ARRHENIUS  (1U << 2)
#define DSP_CAP_SMART_OLS_TREND    (1U << 3)

typedef enum {
    DSP_MEDIA_HDD       = 0,
    DSP_MEDIA_SATA_SSD  = 1,
    DSP_MEDIA_NVME_SSD  = 2,
    DSP_MEDIA_USB_FLASH = 3
} DSPMediaType;

typedef enum {
    DSP_GRADE_OPTIMAL  = 0,
    DSP_GRADE_LOW      = 1,
    DSP_GRADE_MODERATE = 2,
    DSP_GRADE_HIGH     = 3,
    DSP_GRADE_CRITICAL = 4
} DSPGradeLevel;

typedef enum {
    DSP_TREND_STABLE    = 0,
    DSP_TREND_DEGRADING = 1,
    DSP_TREND_IMPROVING = 2
} DSPTrendDirection;

#pragma pack(push, 8)

typedef struct {
    char     engineName[48];
    char     version[16];
    uint32_t abiVersion;
    uint32_t capabilitiesMask;
    uint8_t  selfTestPassed;
    uint8_t  reserved[7];
    double   weibullSelfTestError;
    double   olsSelfTestR2;
} DSPEngineInfo;

typedef struct {
    uint32_t mediaType;            // DSPMediaType
    uint32_t powerOnHours;
    uint32_t temperatureCelsius;
    uint32_t percentageUsed;       // NVMe Log Page 02h Percentage Used (0..255), 0 if N/A
    uint32_t availableSparePct;    // 0..100 (100 if healthy/N/A)
    uint32_t reallocatedSectors;   // Attr 0x05
    uint32_t pendingSectors;       // Attr 0xC5
    uint32_t uncorrectableErrors;  // Attr 0xBB / 0xC6 / NVMe media_errors
    uint64_t unsafeShutdowns;      // Attr 0xC0 / NVMe unsafe_shutdowns
    double   avgDailyPowerOnHours; // Defaults to 8.0 if <= 0
} DSPWeibullInput;

typedef struct {
    double   weibullShapeBeta;       // Bathtub / wear-out shape parameter (>= 1.0)
    double   weibullScaleEtaHours;   // Characteristic life scale parameter (hours)
    double   failureProb30dPct;      // Conditional P(fail within 30 days) 0..100
    double   failureProb90dPct;      // Conditional P(fail within 90 days) 0..100
    double   failureProb365dPct;     // Conditional P(fail within 365 days) 0..100
    double   hazardRatePer1kHours;   // Instantaneous failure rate per 1,000h
    double   reliabilityIndexPct;    // Composite Weibull survival index 0..100
    uint32_t estimatedRulDays;       // Projected median remaining useful life (days)
    uint32_t riskGradeCode;          // DSPGradeLevel (0..4)
    char     primaryRiskFactor[64];  // Dominant prognostic driver
} DSPWeibullRulReport;

typedef struct {
    uint64_t lba;
    double   latencyMs;
    uint32_t statusCode; // 0=Good, 1=Normal, 2=Slow, 3=Critical, 4=Bad
    uint32_t reserved;
} DSPAcousticSample;

typedef struct {
    uint32_t validSampleCount;
    uint32_t consecutiveStepCount;
    uint32_t microStallBurstCount;
    uint32_t strideJumpCount;
    uint32_t acousticGradeCode;        // 0=Quiet/Stable, 1=Mild Jitter, 2=Resonance/GC Stall, 3=Severe Instability
    uint32_t reserved;
    double   rmssdJitterMs;            // Root Mean Square of Successive Latency Differences
    double   meanStepDeltaMs;          // Mean |L_i - L_{i-1}|
    double   peakStepDeltaMs;          // Max |L_i - L_{i-1}|
    double   sequentialJitterMs;       // RMSSD on sequential LBA steps
    double   randomSeekJitterMs;       // RMSSD on stride / backward seek steps
    double   resonanceRatio;           // Random-vs-Sequential or Burst-vs-Baseline ratio
    double   acousticInstabilityScore; // 0.0 (silent/stable) .. 100.0 (severe actuator/FTL stall)
    char     diagnosticSummary[96];
} DSPAcousticProfile;

typedef struct {
    uint32_t mediaType;            // DSPMediaType
    uint32_t currentTempCelsius;
    uint32_t peakTempCelsius;
    uint32_t warningTempTimeMin;   // Minutes spent >= warning threshold
    uint32_t criticalTempTimeMin;  // Minutes spent >= critical threshold
    uint64_t powerOnHours;
    double   totalTbWritten;       // Cumulative host writes (TB)
    double   ratedTbwLimitTb;      // Manufacturer TBW endurance rating (0 if HDD/unknown)
} DSPThermalWearInput;

typedef struct {
    double   arrheniusAccelerationFactor;   // Current thermal aging multiplier (1.0 at 35 C)
    double   sustainedThermalStressFactor;  // Effective weighted factor incl. excursion history
    double   effectiveAgedHours;            // Equivalent 35 C baseline operating hours
    double   dailyTbwRateGb;                // Average GB written per day
    double   estimatedTbwRemainingYears;    // -1.0 if ratedTbwLimitTb <= 0 or no writes
    double   thermalStressScore;            // 0.0 .. 100.0
    uint32_t thermalGradeCode;              // DSPGradeLevel
    uint32_t reserved;
    char     thermalSummary[96];
} DSPThermalWearReport;

typedef struct {
    int64_t timestampSec; // Unix epoch seconds
    double  value;        // Raw or normalized S.M.A.R.T. attribute measurement
} DSPSmartHistoryPoint;

typedef struct {
    uint32_t validPointCount;
    uint32_t trendDirection;            // DSPTrendDirection (0=Stable, 1=Degrading, 2=Improving)
    uint8_t  isStatisticallySignificant;
    uint8_t  reserved[7];
    double   observationSpanDays;
    double   latestValue;
    double   slopePerDay;               // OLS change rate per day
    double   interceptValue;            // Baseline value at first observation
    double   rSquared;                  // Coefficient of determination (0.0 .. 1.0)
    double   projectedValue30d;         // Projected attribute value 30 days after latest sample
    double   projectedDaysToWarning;    // -1.0 if not trending toward warning, 0.0 if already breached
    double   projectedDaysToCritical;   // -1.0 if not trending toward critical, 0.0 if already breached
} DSPSmartTrendProjection;

#pragma pack(pop)

/**
 * 1. Query Predictive Engine Metadata & Run Deterministic Mathematical Self-Test
 */
DSP_API bool DSP_CALL DSP_GetPredictiveEngineInfo(DSPEngineInfo* outInfo);

/**
 * 2. [Pure Creative Algorithm] Weibull Bathtub Conditional Failure & RUL Estimator
 */
DSP_API bool DSP_CALL DSP_ComputeWeibullRul(
    const DSPWeibullInput* input,
    DSPWeibullRulReport* outReport
);

/**
 * 3. [Pure Creative Algorithm] Acoustic Seek Instability, RMSSD Jitter & FTL Stall Analyzer
 */
DSP_API bool DSP_CALL DSP_AnalyzeAcousticSeekProfile(
    const DSPAcousticSample* samples,
    uint32_t sampleCount,
    uint32_t mediaType,
    DSPAcousticProfile* outProfile
);

/**
 * 4. [Pure Creative Algorithm] Arrhenius Thermal Acceleration & TBW Endurance Stress Evaluator
 */
DSP_API bool DSP_CALL DSP_EvaluateThermalWearStress(
    const DSPThermalWearInput* input,
    DSPThermalWearReport* outReport
);

/**
 * 5. [Pure Creative Algorithm] S.M.A.R.T. History OLS Linear Degradation Regressor
 *    lowerIsWorse: 1 for normalized health scores (Current <= threshold),
 *                  0 for raw error counters (Raw >= threshold).
 */
DSP_API bool DSP_CALL DSP_ProjectSmartDegradationTrend(
    const DSPSmartHistoryPoint* points,
    uint32_t pointCount,
    double warningThreshold,
    double criticalThreshold,
    uint32_t lowerIsWorse,
    DSPSmartTrendProjection* outProjection
);

#ifdef __cplusplus
}
#endif

#endif // DISK_SENTINEL_PREDICTIVE_H
