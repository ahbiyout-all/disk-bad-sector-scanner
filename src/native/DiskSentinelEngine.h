/**
 * @file DiskSentinelEngine.h
 * @brief DiskSentinel Pro Native Core Export Header (Pure Creative DLL)
 * @author AhBiYout (GitHub: AhBiYout-all)
 * @affiliation CISNet (https://www.cisnet.co.kr)
 * @blog https://ahbiyoutvibe.blogspot.com/
 * @license Apache-2.0
 */

#ifndef DISK_SENTINEL_ENGINE_H
#define DISK_SENTINEL_ENGINE_H

#ifdef _WIN32
  #ifdef DISKSENTINEL_EXPORTS
    #define DS_API __declspec(dllexport)
  #else
    #define DS_API __declspec(dllimport)
  #endif
  #define DS_CALL __stdcall
#else
  #define DS_API __attribute__((visibility("default")))
  #define DS_CALL
#endif

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// Sector Latency & Status Enum
typedef enum {
    DS_STATUS_GOOD     = 0, // < 10ms (Healthy surface)
    DS_STATUS_NORMAL   = 1, // < 50ms (Acceptable)
    DS_STATUS_SLOW     = 2, // < 150ms (Mild delay)
    DS_STATUS_CRITICAL = 3, // < 500ms (Degraded / Head weak)
    DS_STATUS_BAD      = 4, // Uncorrectable / I/O Timeout / CRC error
    DS_STATUS_ABORTED  = 5
} DSSectorStatus;

// Real-time block scan telemetry result
#pragma pack(push, 8)
typedef struct {
    uint64_t startLba;
    uint64_t sectorCount;
    double   latencyMs;
    uint32_t statusCode;
    uint32_t win32ErrorCode;
    char     errorMnemonic[32];
} DSBlockResult;

// S.M.A.R.T. and NVMe telemetry entry
typedef struct {
    uint32_t attributeId;
    char     attributeName[64];
    uint8_t  currentValue;
    uint8_t  worstValue;
    uint8_t  thresholdValue;
    uint64_t rawValue;
    uint32_t healthStatus; // 0: Good, 1: Warning, 2: Critical
} DSSmartEntry;

// Detailed Health Summary
typedef struct {
    double   reliabilityScore;       // 0.0 to 100.0%
    uint32_t estimatedRemainingDays; // Days before expected failure
    uint32_t totalPowerOnHours;      // Raw POH
    uint32_t reallocatedSectors;     // Attr 0x05
    uint32_t pendingSectors;         // Attr 0xC5
    uint32_t uncorrectableErrors;    // Attr 0xBB / 0xC6
    uint32_t temperatureCelsius;     // Drive thermal sensor
    char     overallGrade[16];       // "EXCELLENT", "GOOD", "WARNING", "CRITICAL"
} DSDriveHealthReport;

// NVMe Deep Telemetry Health Information (Log Page 02h)
typedef struct {
    uint8_t  criticalWarning;
    uint16_t temperatureCelsius;
    uint8_t  availableSpare;
    uint8_t  availableSpareThreshold;
    uint8_t  percentageUsed;
    double   dataUnitsReadTb;
    double   dataUnitsWrittenTb;
    uint64_t hostReadCommands;
    uint64_t hostWriteCommands;
    uint64_t controllerBusyTimeMinutes;
    uint64_t powerCycles;
    uint64_t powerOnHours;
    uint64_t unsafeShutdowns;
    uint64_t mediaErrors;
    uint64_t numErrLogEntries;
    uint32_t warningTempTimeMin;
    uint32_t criticalTempTimeMin;
} DSNvmeHealthLog;

// Multi-Drive Parallel Scan Target specification (Rayon)
typedef struct {
    uint32_t driveIndex;
    uint64_t startLba;
    uint64_t sectorCount;
    uint32_t burstStep;
} DSMultiDriveScanTarget;

// Multi-Drive Parallel Scan Summary result per drive
typedef struct {
    uint32_t driveIndex;
    uint64_t totalSectorsScanned;
    uint32_t badSectorsFound;
    double   elapsedMs;
    double   avgLatencyMs;
    bool     isCompleted;
    uint32_t statusCode;
} DSMultiDriveScanSummary;

// System Tray Lightweight Guardian Daemon Status Struct
typedef struct {
    bool     isMonitoringActive;
    uint32_t pollIntervalSec;
    uint32_t monitoredDriveCount;
    uint32_t highestTempCelsius;
    bool     criticalAlertTriggered;
    uint32_t warningDriveIndex;
    uint32_t lastAlertCode;
    uint8_t  lastAlertMessage[128];
} DSTrayGuardianStatus;

// Bit Carving File Signature & ECC Parity Recovery Result Struct
typedef struct {
    uint64_t sourceLba;
    uint32_t signatureType;
    uint8_t  signatureName[32];
    uint64_t carvedSizeBytes;
    uint32_t eccRecoveredBits;
    bool     isSalvaged;
    uint8_t  hexPreview[64];
} DSCarvedSectorResult;

// Physical Drive Advanced Hardware Discovery Details
typedef struct {
    uint32_t driveIndex;
    char     devicePath[64];         // "\\\\.\\PhysicalDrive0"
    char     model[64];              // e.g. "Samsung SSD 980 PRO 1TB"
    char     serialNumber[64];       // e.g. "S5GXNF0R123456"
    char     firmwareRev[32];        // e.g. "5B2QGXA7"
    char     busType[32];            // "NVMe", "SATA", "USB", "SCSI"
    uint64_t totalCapacityBytes;     // e.g. 1000204886016
    uint32_t sectorSize;             // 512 or 4096
    uint32_t physicalSectorSize;     // 4096 (4Kn/512e)
    bool     isSsd;                  // true if seek penalty = 0
    bool     isTrimSupported;        // true if DeviceTrimProperty supported
    bool     isWriteCacheEnabled;
    uint32_t temperatureCelsius;
    uint32_t healthScore;
} DSPhysicalDriveDetail;
#pragma pack(pop)


/**
 * 1. Open physical drive with OS Cache Bypass (FILE_FLAG_NO_BUFFERING | FILE_FLAG_WRITE_THROUGH)
 */
DS_API void* DS_CALL DS_OpenDriveDirect(uint32_t physicalDriveIndex, uint32_t* outSectorSize);

/**
 * 2. High precision hardware scan of specified LBA chunk with microsecond latency measurement
 */
DS_API bool DS_CALL DS_ScanLbaBlock(void* hDrive, uint64_t lba, uint32_t count, DSBlockResult* outResult);

/**
 * 3. [Pure Creative Algorithm] Adaptive Burst & Micro-LBA Seeker
 *    High-speed burst scan with intelligent binary sub-division on delay/error.
 */
DS_API bool DS_CALL DS_AdaptiveScanChunk(
    void* hDrive,
    uint64_t chunkStartLba,
    uint32_t chunkSectorCount,
    uint32_t burstStep,
    DSBlockResult* outBadResults,
    uint32_t maxBadResults,
    uint32_t* outDetectedBadCount
);

/**
 * 4. Native S.M.A.R.T. (ATA SFF-8035i) & NVMe (Log Page 02h) telemetry retrieval
 */
DS_API int32_t DS_CALL DS_GetSmartTelemetry(void* hDrive, DSSmartEntry* outEntries, int32_t maxEntries);

/**
 * 5. [Pure Creative Algorithm] Drive Reliability & Remaining Life Index Calculator
 *    Weighted predictive algorithm based on critical failure attributes.
 */
DS_API bool DS_CALL DS_EvaluateDriveReliability(
    const DSSmartEntry* entries,
    int32_t entryCount,
    DSDriveHealthReport* outReport
);

/**
 * 6. [Pure Creative Algorithm] Fast Hardware ECC Parity & CRC32 Checksum Generator
 *    Non-destructive surface bit-integrity verifier.
 */
DS_API bool DS_CALL DS_CalculateParityChecksum(
    const uint8_t* pBuffer,
    uint32_t bufferLength,
    uint32_t* outCrc32,
    uint64_t* outEccParity
);

/**
 * 7. Non-destructive soft bad sector evaluation and spare block reallocation trigger
 */
DS_API bool DS_CALL DS_AttemptSoftSectorRepair(void* hDrive, uint64_t badLba, uint32_t* outRecoveredStatus);

/**
 * 8. Close physical drive handle and release memory resources
 */
DS_API void DS_CALL DS_CloseDrive(void* hDrive);

/**
 * 9. NVMe Log Page 02h Deep Health & Wear Telemetry retrieval
 */
DS_API bool DS_CALL DS_GetNvmeDeepTelemetry(void* hDrive, DSNvmeHealthLog* outLog);

/**
 * 10. SIMD AVX2 Accelerated Zero-Check, Fast Parity & CRC32 generator
 */
DS_API bool DS_CALL DS_CalculateAvx2ChecksumAndZeroCheck(
    const uint8_t* pBuffer,
    uint32_t bufferLength,
    bool* outIsAllZeros,
    uint32_t* outCrc32,
    uint64_t* outAvxParity
);

/**
 * 11. Rayon Fearless Concurrency Multi-Drive Parallel Scanner
 */
DS_API bool DS_CALL DS_ScanMultipleDrivesParallel(
    const DSMultiDriveScanTarget* targets,
    uint32_t targetCount,
    DSMultiDriveScanSummary* outSummaries,
    uint32_t concurrencyLimit
);

/**
 * 12. Configure System Tray Lightweight Guardian Daemon
 */
DS_API bool DS_CALL DS_ConfigureTrayGuardian(
    uint32_t pollIntervalSec,
    uint32_t tempThresholdC,
    bool alertOnPendingSector
);

/**
 * 13. System Tray Lightweight Guardian Daemon Status Poll
 */
DS_API bool DS_CALL DS_RunTrayGuardianCheck(
    DSTrayGuardianStatus* outStatus
);

/**
 * 14. Deep Bit Carving File Signature Analysis & ECC Parity Recovery
 */
DS_API bool DS_CALL DS_ExecuteBitCarvingRecovery(
    void* hDrive,
    uint64_t targetLba,
    uint32_t clusterSpan,
    DSCarvedSectorResult* outResult
);

/**
 * 15. Advanced Physical Drive Device Discovery & Hardware Detail Acquisition
 *     Probes \\\\.\\PhysicalDrive0..N using Win32 Storage Property Queries.
 */
DS_API uint32_t DS_CALL DS_EnumeratePhysicalDrives(
    DSPhysicalDriveDetail* outDrives,
    uint32_t maxDrives
);

#ifdef __cplusplus
}
#endif


#endif // DISK_SENTINEL_ENGINE_H
