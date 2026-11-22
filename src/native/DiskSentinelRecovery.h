/**
 * @file DiskSentinelRecovery.h
 * @brief Pure Creative Deep Recovery, NTFS MFT Decoder & Sanitize Verification C ABI Engine
 * @details Pure C++ standalone shared library (DiskSentinelRecovery.dll / libDiskSentinelRecovery.so)
 *          zero-dependency on Win32 device handles:
 *          1. Multi-Signature File Carver (16+ formats) + EOF Boundary & Hamming Bit-Flip Tolerance
 *          2. NTFS $MFT Record USA Fixup + Attribute & Non-Resident $DATA Runlist Decoder
 *          3. NIST SP 800-88 / DoD 5220.22-M Xoshiro256** PRNG Pattern Generator & Residual Verifier
 *          4. ddrescue Multi-Pass Domain Interval Coalescer & Work-Unit Scheduler
 * @license Apache-2.0
 */

#ifndef DISKSENTINEL_RECOVERY_H
#define DISKSENTINEL_RECOVERY_H

#include <stdint.h>
#include <stdbool.h>

#ifdef _WIN32
  #ifdef DSR_EXPORTS
    #define DSR_API extern "C" __declspec(dllexport)
  #else
    #define DSR_API extern "C" __declspec(dllimport)
  #endif
  #define DSR_CALL __stdcall
#else
  #define DSR_API extern "C" __attribute__((visibility("default")))
  #define DSR_CALL
#endif

#pragma pack(push, 8)

#define DSR_CAP_CARVE_16SIG     0x01U
#define DSR_CAP_NTFS_MFT_USA    0x02U
#define DSR_CAP_PRNG_SANITIZE   0x04U
#define DSR_CAP_DDRESCUE_PLAN   0x08U

typedef enum {
    DSR_WIPE_ZERO         = 0,
    DSR_WIPE_ONES         = 1,
    DSR_WIPE_CONSTANT     = 2,
    DSR_WIPE_XOSHIRO_PRNG = 3
} DSRWipePatternMode;

typedef enum {
    DSR_IV_NON_TRIED   = 0,
    DSR_IV_NON_TRIMMED = 1,
    DSR_IV_NON_SCRAPED = 2,
    DSR_IV_BAD_SECTOR  = 3,
    DSR_IV_FINISHED    = 4
} DSRIntervalStatusCode;

typedef struct {
    char     version[32];
    uint32_t capabilityMask;
    uint8_t  selfTestPassed;
    uint8_t  reserved0[3];
    uint32_t signatureRuleCount;
    uint32_t selfTestCrc32;
    uint64_t selfTestPrngSample;
} DSREngineInfo;

typedef struct {
    uint32_t inspectedBytes;
    uint32_t signatureType;
    uint32_t confidenceScore;
    uint8_t  footerDetected;
    uint8_t  isTruncated;
    uint8_t  isZeroFilled;
    uint8_t  reserved0;
    uint64_t estimatedPayloadBytes;
    uint32_t crc32;
    uint32_t nearMatchBitFlips;
    uint64_t galoisParity64;
    double   shannonEntropy;
    double   printableRatio;
    char     signatureName[64];
    char     fileExtension[16];
    char     footerMarker[32];
} DSRCarveInspectionResult;

typedef struct {
    uint64_t lcnStart;
    uint64_t vcnStart;
    uint64_t clusterCount;
} DSRNtfsDataRun;

typedef struct {
    uint32_t recordNumber;
    uint32_t parentRecordNumber;
    uint8_t  inUse;
    uint8_t  isDirectory;
    uint8_t  isResidentData;
    uint8_t  usaFixupApplied;
    uint32_t usaMismatchSectors;
    int32_t  bestNamespace;
    uint32_t dataRunCount;
    uint64_t fileSizeBytes;
    int64_t  creationTimestampMs;
    char     fileNameUtf8[256];
} DSRNtfsMftParsedRecord;

typedef struct {
    uint64_t checkedBytes;
    uint8_t  verifiedClean;
    uint8_t  reserved0[3];
    uint32_t patternMode;
    uint64_t residualNonMatchingBytes;
    int64_t  firstMismatchOffset;
    uint32_t crc32;
    uint32_t reserved1;
} DSRWipeVerifyReport;

typedef struct {
    uint64_t startLba;
    uint64_t sectorCount;
    uint32_t statusCode;
    uint32_t attempts;
    uint32_t lastErrorCode;
    uint32_t reserved0;
} DSRDdrescueIntervalC;

typedef struct {
    uint32_t coalescedIntervalCount;
    uint32_t suggestedPhaseCode; // 0: copying, 1: trimming, 2: retrying, 3: completed
    uint64_t nextWorkStartLba;
    uint32_t nextWorkSectorCount;
    uint8_t  hasNextWork;
    uint8_t  completed;
    uint8_t  reserved0[2];
    uint64_t totalSectors;
    uint64_t finishedSectors;
    uint64_t nonTriedSectors;
    uint64_t nonTrimmedSectors;
    uint64_t nonScrapedSectors;
    uint64_t badSectors;
} DSRDdrescuePlanSummary;

DSR_API bool DSR_CALL DSR_GetRecoveryEngineInfo(DSREngineInfo* outInfo);

DSR_API bool DSR_CALL DSR_InspectRecoveryCarveBuffer(
    const uint8_t* pBuffer,
    uint32_t bufferLength,
    DSRCarveInspectionResult* outResult
);

DSR_API bool DSR_CALL DSR_ParseNtfsMftRecord(
    uint8_t* recordBytes,
    uint32_t recordLength,
    uint32_t recordIndexHint,
    bool applyUsaFixupInPlace,
    DSRNtfsMftParsedRecord* outRecord,
    DSRNtfsDataRun* outRuns,
    uint32_t maxRuns
);

DSR_API bool DSR_CALL DSR_ScanMftBufferForCluster(
    const uint8_t* mftBuffer,
    uint32_t bufferLength,
    uint32_t mftRecordSize,
    uint32_t firstRecordIndex,
    uint64_t batchStartLba,
    uint32_t sectorSize,
    uint64_t targetLba,
    uint64_t targetLcn,
    DSRNtfsMftParsedRecord* outMatchedRecords,
    uint32_t maxMatched,
    uint32_t* outMatchedCount,
    DSRNtfsDataRun* outRunsFlat,
    uint32_t maxRunsFlat,
    uint32_t* outWrittenRuns
);

DSR_API bool DSR_CALL DSR_GenerateWipePatternBuffer(
    uint8_t* pOutBuffer,
    uint32_t bufferLength,
    uint32_t patternMode,
    uint8_t constantByte,
    uint64_t seed64,
    uint64_t lbaOffset,
    uint32_t* outCrc32
);

DSR_API bool DSR_CALL DSR_VerifyWipedBuffer(
    const uint8_t* pBuffer,
    uint32_t bufferLength,
    uint32_t patternMode,
    uint8_t constantByte,
    uint64_t seed64,
    uint64_t lbaOffset,
    DSRWipeVerifyReport* outReport
);

DSR_API bool DSR_CALL DSR_CoalesceAndPlanDdrescueIntervals(
    const DSRDdrescueIntervalC* inIntervals,
    uint32_t inCount,
    uint32_t chunkSectors,
    DSRDdrescueIntervalC* outCoalesced,
    uint32_t maxOut,
    DSRDdrescuePlanSummary* outSummary
);

#pragma pack(pop)

#endif // DISKSENTINEL_RECOVERY_H
