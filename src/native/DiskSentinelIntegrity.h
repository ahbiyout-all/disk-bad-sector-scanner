/**
 * @file DiskSentinelIntegrity.h
 * @brief Pure Creative Bit-Rot Integrity, Extent Correlation, Diff Velocity & Watchdog Matrix Engine
 * @details Pure C++ standalone shared library (DiskSentinelIntegrity.dll / libDiskSentinelIntegrity.so)
 *          with zero OS device handle dependencies:
 *          1. FIPS 180-4 Streaming & One-Shot SHA-256 + FNV-1a64 + Slicing-by-8 IEEE 802.3 CRC32
 *          2. O((E + B) log B) LBA Extent Correlation & Bit-Rot / Survivability Risk Scorer
 *          3. Scan-vs-Scan & S.M.A.R.T. Snapshot Delta / Daily Degradation Velocity Engine
 *          4. Fleet Watchdog SLA Rule Matrix Evaluator with Cooldown & Fleet Health Indexing
 * @license Apache-2.0
 */

#ifndef DISKSENTINEL_INTEGRITY_H
#define DISKSENTINEL_INTEGRITY_H

#include <stdint.h>
#include <stdbool.h>

#ifdef _WIN32
  #ifdef DSI_EXPORTS
    #define DSI_API extern "C" __declspec(dllexport)
  #else
    #define DSI_API extern "C" __declspec(dllimport)
  #endif
  #define DSI_CALL __stdcall
#else
  #define DSI_API extern "C" __attribute__((visibility("default")))
  #define DSI_CALL
#endif

#pragma pack(push, 8)

#define DSI_CAP_SHA256_STREAM      0x01U
#define DSI_CAP_EXTENT_CORRELATE   0x02U
#define DSI_CAP_SCAN_SMART_DIFF    0x04U
#define DSI_CAP_WATCHDOG_MATRIX    0x08U

typedef enum {
    DSI_STATUS_VERIFIED         = 0,
    DSI_STATUS_UNVERIFIED       = 1,
    DSI_STATUS_SLOW_LBA_OVERLAP = 2,
    DSI_STATUS_BAD_LBA_OVERLAP  = 3,
    DSI_STATUS_HASH_MISMATCH    = 4,
    DSI_STATUS_UNREADABLE       = 5,
    DSI_STATUS_MISSING          = 6
} DSIIntegrityStatusCode;

typedef enum {
    DSI_REG_IMPROVED  = 0,
    DSI_REG_STABLE    = 1,
    DSI_REG_DEGRADING = 2,
    DSI_REG_CRITICAL  = 3
} DSIRegressionGradeCode;

typedef enum {
    DSI_WD_TEMP                 = 0,
    DSI_WD_SMART_05_DELTA       = 1,
    DSI_WD_SMART_C5             = 2,
    DSI_WD_HEALTH_SCORE         = 3,
    DSI_WD_SCHEDULED_QUICK_SCAN = 4,
    DSI_WD_LINK_DOWNGRADED      = 5
} DSIWatchdogMetricCode;

typedef struct {
    char     version[32];
    uint32_t capabilityMask;
    uint8_t  selfTestPassed;
    uint8_t  sha256KatPassed;
    uint8_t  extentKatPassed;
    uint8_t  diffKatPassed;
    uint32_t selfTestCrc32;
    uint32_t reserved0;
    uint64_t selfTestFnv1a64;
    char     sha256KatHex[65];
    char     reserved1[7];
} DSIEngineInfo;

typedef struct {
    uint32_t state[8];
    uint64_t totalBytes;
    uint8_t  buffer[64];
    uint32_t bufLen;
    uint32_t finalized;
} DSISha256Context;

typedef struct {
    uint64_t inspectedBytes;
    uint32_t crc32;
    uint32_t reserved0;
    uint64_t fnv1a64;
    uint8_t  sha256Bytes[32];
    char     sha256Hex[65];
    char     reserved1[7];
} DSIIntegrityDigestReport;

typedef struct {
    uint64_t startLba;
    uint64_t endLba;
} DSIExtentInterval;

typedef struct {
    uint32_t extentCount;
    uint32_t statusCode;
    uint32_t badHitCount;
    uint32_t slowHitCount;
    uint32_t affectedBadSectors;
    uint32_t affectedSlowSectors;
    uint64_t totalMappedSectors;
    double   riskScore;
    double   survivabilityPct;
    uint8_t  hashChanged;
    uint8_t  isUnreadable;
    uint8_t  isMissing;
    uint8_t  reserved0[5];
} DSIExtentIntegrityReport;

typedef struct {
    uint32_t attributeId;
    uint8_t  currentA;
    uint8_t  currentB;
    uint8_t  statusA;
    uint8_t  statusB;
    uint64_t rawA;
    uint64_t rawB;
    uint8_t  presentA;
    uint8_t  presentB;
    uint8_t  reserved0[6];
} DSISmartAttrSnapshot;

typedef struct {
    uint32_t attributeId;
    int32_t  currentDelta;
    int64_t  rawDelta;
    uint8_t  worsened;
    uint8_t  improved;
    uint8_t  statusA;
    uint8_t  statusB;
    uint8_t  reserved0[4];
} DSISmartAttrDiffRow;

typedef struct {
    int64_t  timestampAMs;
    int64_t  timestampBMs;
    uint32_t badSectorsA;
    uint32_t badSectorsB;
    uint32_t slowCriticalA;
    uint32_t slowCriticalB;
    double   healthScoreA;
    double   healthScoreB;
    double   avgReadLatencyMsA;
    double   avgReadLatencyMsB;
    uint32_t attrCount;
    uint32_t reserved0;
} DSIScanDiffInput;

typedef struct {
    double   elapsedDays;
    int32_t  badDelta;
    int32_t  slowCriticalDelta;
    double   healthDelta;
    double   latencyDeltaMs;
    double   badSectorsPerDay;
    double   healthLossPerDay;
    uint32_t worsenedAttrCount;
    uint32_t improvedAttrCount;
    uint32_t regressionGradeCode;
    uint32_t reserved0;
    double   regressionScore;
} DSIScanDiffSummary;

typedef struct {
    uint32_t driveIndex;
    int32_t  temperatureC;
    double   healthScore;
    uint64_t smart05Raw;
    uint64_t smart05Baseline;
    uint64_t smartC5Raw;
    uint8_t  isLinkDowngraded;
    uint8_t  reserved0[7];
} DSIWatchdogDriveState;

typedef struct {
    uint32_t ruleIndex;
    int32_t  targetDriveIndex;
    uint32_t metricCode;
    uint32_t intervalMinutes;
    double   thresholdValue;
    uint32_t cooldownMinutes;
    uint8_t  enabled;
    uint8_t  reserved0[3];
    int64_t  lastTriggeredMs;
} DSIWatchdogRuleInput;

typedef struct {
    uint32_t ruleIndex;
    uint32_t driveIndex;
    uint32_t metricCode;
    uint32_t severityCode;
    double   observedValue;
    double   thresholdValue;
} DSIWatchdogTriggerOut;

typedef struct {
    uint32_t evaluatedDriveCount;
    uint32_t evaluatedRuleCount;
    uint32_t triggeredCount;
    uint32_t quickScanTargetCount;
    int32_t  worstDriveIndex;
    uint32_t reserved0;
    double   fleetHealthIndex;
} DSIWatchdogMatrixReport;

#pragma pack(pop)

/**
 * 1. Returns Integrity Engine metadata and runs deterministic SHA-256 ("abc"),
 *    CRC32 ("123456789"), FNV-1a64, extent-overlap, and scan-diff self-tests.
 */
DSI_API bool DSI_CALL DSI_GetIntegrityEngineInfo(DSIEngineInfo* outInfo);

/**
 * 2. Initializes a FIPS 180-4 SHA-256 streaming context.
 */
DSI_API bool DSI_CALL DSI_Sha256Init(DSISha256Context* ctx);

/**
 * 3. Feeds an arbitrary byte chunk into an initialized SHA-256 streaming context.
 */
DSI_API bool DSI_CALL DSI_Sha256Update(
    DSISha256Context* ctx,
    const uint8_t* pData,
    uint32_t dataLen
);

/**
 * 4. Finalizes SHA-256 digest into 32 raw bytes and/or 65-char null-terminated hex string.
 */
DSI_API bool DSI_CALL DSI_Sha256Final(
    DSISha256Context* ctx,
    uint8_t outDigest[32],
    char* outHex65
);

/**
 * 5. Single-pass buffer integrity digest: FIPS 180-4 SHA-256 + IEEE CRC32 + FNV-1a64.
 */
DSI_API bool DSI_CALL DSI_ComputeIntegrityDigest(
    const uint8_t* pData,
    uint32_t dataLen,
    DSIIntegrityDigestReport* outReport
);

/**
 * 6. O((E + B) log B) LBA Extent Correlation & Bit-Rot Risk Scorer.
 *    Evaluates physical file extents against bad/slow LBA sorted arrays, detects overlap
 *    sector spans, and computes integrity status, riskScore (0..100), and survivabilityPct.
 */
DSI_API bool DSI_CALL DSI_EvaluateExtentIntegrity(
    const DSIExtentInterval* extents,
    uint32_t extentCount,
    const uint64_t* badLbas,
    uint32_t badCount,
    const uint64_t* slowLbas,
    uint32_t slowCount,
    bool inputsSorted,
    bool hashMismatch,
    bool isUnreadable,
    bool isMissing,
    bool hasSha256,
    uint64_t* outBadHits,
    uint32_t maxBadHits,
    uint64_t* outSlowHits,
    uint32_t maxSlowHits,
    DSIExtentIntegrityReport* outReport
);

/**
 * 7. Scan-vs-Scan & S.M.A.R.T. Snapshot Delta / Daily Degradation Velocity Engine.
 */
DSI_API bool DSI_CALL DSI_ComputeScanSmartDiff(
    const DSIScanDiffInput* pInput,
    const DSISmartAttrSnapshot* pAttrs,
    uint32_t attrCount,
    DSISmartAttrDiffRow* outAttrRows,
    uint32_t maxAttrRows,
    DSIScanDiffSummary* outSummary
);

/**
 * 8. Fleet Watchdog SLA Rule Matrix Evaluator honoring cooldown and interval windows.
 */
DSI_API bool DSI_CALL DSI_EvaluateWatchdogMatrix(
    const DSIWatchdogDriveState* pDrives,
    uint32_t driveCount,
    const DSIWatchdogRuleInput* pRules,
    uint32_t ruleCount,
    int64_t nowMs,
    DSIWatchdogTriggerOut* outTriggers,
    uint32_t maxTriggers,
    uint32_t* outQuickScanDriveIndices,
    uint32_t maxQuickScanTargets,
    DSIWatchdogMatrixReport* outReport
);

#endif // DISKSENTINEL_INTEGRITY_H
