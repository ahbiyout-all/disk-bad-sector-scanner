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

// Memory-Mapped File Access Mode
typedef enum {
    DS_MAP_MODE_READ_ONLY  = 0,
    DS_MAP_MODE_READ_WRITE = 1
} DSMappedAccessMode;

// Zero-Copy Memory-Mapped Sector Window Descriptor
typedef struct {
    void*    viewPtr;                // Direct user-space pointer to requested LBA window (Zero-Copy)
    void*    internalBasePtr;        // OS granularity-aligned mapping base (passed to UnmapViewOfFile/munmap)
    uint64_t fileOffsetBytes;        // Requested starting byte offset
    uint32_t mappedLengthBytes;      // Valid mapped bytes accessible from viewPtr
    uint32_t sectorSize;             // Logical sector size (512 or 4096)
    uint8_t  isSectionMapped;        // 1 if OS CreateFileMappingW/MapViewOfFile (or mmap)
    uint8_t  isReadOnly;             // 1 if mapped read-only
    uint8_t  reserved[6];
} DSMappedSectorWindow;
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
DS_API bool DS_CALL DS_AttemptSoftSectorRepair(void* hDrive, uint64_t badLba, uint32_t count, uint32_t* outRecoveredStatus);

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

/**
 * 16. Hardware Surface Verification (IOCTL_DISK_VERIFY) with read-fallback check
 */
DS_API bool DS_CALL DS_VerifyLbaBlock(void* hDrive, uint64_t lba, uint32_t count, DSBlockResult* outResult);

/**
 * 17. Launch ATA S.M.A.R.T. Self-Test (1=Short, 2=Extended, 3=Conveyance, 127=Abort)
 */
DS_API bool DS_CALL DS_StartSmartSelfTest(void* hDrive, uint32_t testTypeCode);

/**
 * 18. Poll ATA S.M.A.R.T. Self-Test Execution Status & Percentage Remaining
 */
DS_API bool DS_CALL DS_GetSmartSelfTestStatus(void* hDrive, uint32_t* outExecCode, uint32_t* outProgressPct);

/**
 * 19. Query Full Hardware Details on an already-opened Drive Handle (Model, Serial, 4K AF, TRIM, Write Cache, Temp, Health)
 */
DS_API bool DS_CALL DS_GetDriveDetails(void* hDrive, DSPhysicalDriveDetail* outDetail);

/**
 * 20. Open a file-backed disk image or clone target for Zero-Copy Memory-Mapped I/O
 *     Uses CreateFileMappingW (Windows) / mmap (POSIX) with persistent OS section handle.
 */
DS_API void* DS_CALL DS_OpenMappedTarget(
    const char* utf8Path,
    uint32_t sectorSize,
    uint32_t accessMode,
    uint64_t initialSizeBytes
);

/**
 * 21. Map a granularity-aligned sliding window over a mapped target (Zero-Copy user pointer)
 */
DS_API bool DS_CALL DS_MapSectorWindow(
    void* hMapped,
    uint64_t startLba,
    uint32_t sectorCount,
    DSMappedSectorWindow* outWindow
);

/**
 * 22. Unmap an active memory-mapped sector window
 */
DS_API bool DS_CALL DS_UnmapSectorWindow(DSMappedSectorWindow* window);

/**
 * 23. Flush (if writable) and close a Memory-Mapped Target handle
 */
DS_API void DS_CALL DS_CloseMappedTarget(void* hMapped);

/**
 * 24. Zero-Copy Memory-Mapped Range Scanner (CRC32, 64-bit Parity & Zero-Sector Counter)
 *     Streams large disk image ranges directly via MapViewOfFile/mmap without ReadFile copies.
 */
DS_API bool DS_CALL DS_ScanMappedLbaRange(
    void* hMapped,
    uint64_t startLba,
    uint64_t sectorCount,
    uint32_t windowSectors,
    uint32_t* outCrc32,
    uint64_t* outParity,
    uint64_t* outZeroSectors
);

/**
 * 25. Zero-Copy Direct DMA Physical-to-Mapped-File Imager
 *     Reads from physical drive (FILE_FLAG_NO_BUFFERING) directly into MapViewOfFile pages,
 *     eliminating intermediate WriteFile syscalls and kernel-user buffer copies.
 */
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

#ifdef __cplusplus
}
#endif


#endif // DISK_SENTINEL_ENGINE_H
