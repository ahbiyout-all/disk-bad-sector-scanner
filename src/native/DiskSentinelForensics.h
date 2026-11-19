/**
 * @file DiskSentinelForensics.h
 * @brief Pure Creative Compute & Forensics DLL Export Header (DiskSentinelForensics.dll)
 *        Zero-dependency native algorithmic engine for:
 *          1. Welford One-Pass Z-Score Telemetry & Contiguous Degradation Zone Detection
 *          2. O(N log M) File-Extent Bad-Sector Density Heatmap Mapping
 *          3. Shannon Entropy, Repeating Poison-Pattern & Erased-NAND Classifier
 *          4. MBR / GPT Header & Partition Array IEEE 802.3 CRC32 Integrity Validator
 *          5. NTFS / FAT32 / exFAT Volume Boot Record (VBR) Geometry Decoder
 * @author AhBiYout (GitHub: AhBiYout-all)
 * @affiliation CISNet (https://www.cisnet.co.kr)
 * @blog https://ahbiyoutvibe.blogspot.com/
 * @license Apache-2.0
 */

#ifndef DISK_SENTINEL_FORENSICS_H
#define DISK_SENTINEL_FORENSICS_H

#ifdef _WIN32
  #ifdef DSF_EXPORTS
    #define DSF_API __declspec(dllexport)
  #else
    #define DSF_API __declspec(dllimport)
  #endif
  #define DSF_CALL __stdcall
#else
  #define DSF_API __attribute__((visibility("default")))
  #define DSF_CALL
#endif

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// Capability flags for DSFEngineInfo.capabilitiesMask
#define DSF_CAP_ZSCORE_TELEMETRY   (1U << 0)
#define DSF_CAP_EXTENT_HEATMAP     (1U << 1)
#define DSF_CAP_SHANNON_ENTROPY    (1U << 2)
#define DSF_CAP_GPT_MBR_CRC32      (1U << 3)
#define DSF_CAP_VBR_DECODER        (1U << 4)

typedef enum {
    DSF_RISK_OPTIMAL  = 0,
    DSF_RISK_LOW      = 1,
    DSF_RISK_MODERATE = 2,
    DSF_RISK_HIGH     = 3,
    DSF_RISK_CRITICAL = 4
} DSFRiskLevel;

typedef enum {
    DSF_SECTOR_ALL_ZERO             = 0,
    DSF_SECTOR_ALL_FF               = 1,
    DSF_SECTOR_REPEATING_PATTERN    = 2,
    DSF_SECTOR_TEXT_METADATA        = 3,
    DSF_SECTOR_STRUCTURED_BINARY    = 4,
    DSF_SECTOR_ENCRYPTED_COMPRESSED = 5
} DSFSectorClass;

typedef enum {
    DSF_FS_UNKNOWN = 0,
    DSF_FS_NTFS    = 1,
    DSF_FS_FAT32   = 2,
    DSF_FS_EXFAT   = 3
} DSFFileSystemType;

#pragma pack(push, 8)

typedef struct {
    char     engineName[48];
    char     version[16];
    uint32_t capabilitiesMask;
    uint32_t crc32SelfTestValue; // Expected 0xCBF43926 for "123456789"
    uint8_t  crc32SelfTestPassed;
    uint8_t  reserved[7];
} DSFEngineInfo;

typedef struct {
    uint64_t lba;
    uint32_t blockId;
    uint32_t statusCode; // 0=Good, 1=Normal, 2=Slow, 3=Critical, 4=Bad
    double   latencyMs;
} DSFTelemetrySample;

typedef struct {
    uint64_t startLba;
    uint64_t endLba;
    uint32_t startBlockId;
    uint32_t endBlockId;
    uint32_t blockCount;
    uint32_t badCount;
    double   avgLatencyMs;
    double   peakLatencyMs;
    double   peakZScore;
    uint32_t severity; // 1=Warning(Slow Cluster), 2=Critical(Bad Cluster)
    uint32_t reserved;
} DSFContiguousZone;

typedef struct {
    uint32_t totalSamples;
    uint32_t slowOrBadCount;
    uint32_t within1SigmaCount;
    uint32_t sigma1To2Count;
    uint32_t sigma2To3Count;
    uint32_t over3SigmaCount;
    uint32_t contiguousZoneCount;
    uint32_t longestRunBlocks;
    uint32_t riskLevel; // DSFRiskLevel
    uint32_t reserved;
    double   meanMs;
    double   stdDevMs;
    double   maxLatencyMs;
    double   degradationRiskScore; // 0.0 ~ 100.0
} DSFZScoreReport;

typedef struct {
    uint64_t startLba;
    uint64_t sectorCount;
} DSFExtentInput;

typedef struct {
    uint32_t totalExtents;
    uint32_t impactedExtentCount;
    uint32_t peakCellIndex;
    uint32_t totalBadHits;
    uint64_t totalSectorsMapped;
    double   peakCellDensityPct;
    double   fragmentationSpreadScore; // 0.0 ~ 100.0
} DSFHeatmapSummary;

typedef struct {
    uint32_t inspectedBytes;
    uint32_t crc32;
    uint32_t repeatingWord32;
    uint32_t sectorClass; // DSFSectorClass
    double   shannonEntropy;    // 0.000 ~ 8.000 bits/byte
    double   zeroByteRatio;     // 0.0 ~ 1.0
    double   ffByteRatio;       // 0.0 ~ 1.0
    double   printableRatio;    // 0.0 ~ 1.0
    uint8_t  hasRepeatingPattern;
    uint8_t  isAllZero;
    uint8_t  isAllFF;
    uint8_t  reserved[5];
    char     classificationLabel[48];
} DSFSectorEntropyResult;

typedef struct {
    uint32_t index;
    uint32_t sectorAligned4K; // 1 if (startLba * sectorSize) % 4096 == 0
    uint64_t startLba;
    uint64_t endLba;
    uint64_t sectorCount;
    uint64_t sizeBytes;
    uint8_t  mbrTypeByte;
    uint8_t  isBootable;
    uint8_t  isGpt;
    uint8_t  reserved[5];
    char     typeLabel[48];
    char     nameUtf8[72];
} DSFPartitionRecord;

typedef struct {
    uint32_t sectorSize;
    uint32_t partitionCount;
    uint8_t  hasMbrSignature;       // LBA 0 [510..511] == 0x55AA
    uint8_t  hasGptHeader;          // "EFI PART" signature verified
    uint8_t  gptHeaderCrcValid;     // IEEE 802.3 CRC32 over 92-byte GPT header matches
    uint8_t  gptEntriesCrcValid;    // IEEE 802.3 CRC32 over Partition Array matches
    uint8_t  isProtectiveMbr;       // MBR partition 0 type == 0xEE
    uint8_t  reserved[3];
    uint32_t storedHeaderCrc32;
    uint32_t computedHeaderCrc32;
    uint32_t storedEntriesCrc32;
    uint32_t computedEntriesCrc32;
    uint64_t firstUsableLba;
    uint64_t lastUsableLba;
    char     schemeName[32];        // "GPT", "MBR", "RAW/UNFORMATTED"
} DSFPartitionTableReport;

typedef struct {
    uint32_t fsType;                // DSFFileSystemType
    uint32_t bytesPerSector;
    uint32_t sectorsPerCluster;
    uint32_t clusterSizeBytes;
    uint32_t reservedSectors;
    uint32_t rootCluster;           // FAT32 / exFAT root cluster
    uint64_t totalSectors;
    uint64_t mftStartLcn;           // NTFS $MFT starting cluster
    uint8_t  hasBootSignature;      // [510..511] == 0x55AA
    uint8_t  reserved[7];
    char     oemId[16];
} DSFVbrInfo;

#pragma pack(pop)

/**
 * 1. Query Forensics Engine Metadata & Self-Test CRC32 Integrity
 */
DSF_API bool DSF_CALL DSF_GetForensicsEngineInfo(DSFEngineInfo* outInfo);

/**
 * 2. [Pure Creative Algorithm] Welford One-Pass Z-Score Variance & Contiguous Degradation Detector
 *    Processes large sector telemetry arrays numerically stably in O(N).
 */
DSF_API bool DSF_CALL DSF_AnalyzeSectorTelemetryZScore(
    const DSFTelemetrySample* samples,
    uint32_t sampleCount,
    double   baselineExpectedMs,
    uint32_t maxBlockIdGap,
    DSFZScoreReport* outReport,
    DSFContiguousZone* outZones,
    uint32_t maxZones,
    uint32_t* outWrittenZones
);

/**
 * 3. [Pure Creative Algorithm] Binary-Search Fragmented Extent Bad-Density Heatmap Mapper
 *    Maps arbitrary file extents against bad LBA indices into fixed-resolution heatmap cells.
 */
DSF_API bool DSF_CALL DSF_ComputeExtentBadDensityHeatmap(
    const DSFExtentInput* extents,
    uint32_t extentCount,
    const uint64_t* badLbas,
    uint32_t badLbaCount,
    bool     badLbasAlreadySorted,
    uint32_t cellCount,
    uint32_t* outCellBadCounts,
    double*   outCellDensityPct,
    DSFHeatmapSummary* outSummary
);

/**
 * 4. [Pure Creative Algorithm] Shannon Entropy, Erased-NAND & Poison-Pattern Sector Inspector
 *    Computes 256-bin entropy H = -sum(p * log2(p)), 32-bit repeating pattern check, and LUT CRC32.
 */
DSF_API bool DSF_CALL DSF_ComputeSectorEntropyAndPattern(
    const uint8_t* pBuffer,
    uint32_t bufferLength,
    DSFSectorEntropyResult* outResult
);

/**
 * 5. [Pure Creative Algorithm] MBR / Protective MBR / GPT Header & Partition Array CRC32 Validator
 *    Parses raw LBA 0..33 sectors (512 or 4096 bytes/sector) and validates GPT IEEE 802.3 CRC32s.
 */
DSF_API bool DSF_CALL DSF_InspectBootAndPartitionTable(
    const uint8_t* rawLbaBuffer,
    uint32_t bufferLength,
    uint32_t sectorSize,
    DSFPartitionTableReport* outReport,
    DSFPartitionRecord* outPartitions,
    uint32_t maxPartitions
);

/**
 * 6. [Pure Creative Algorithm] NTFS / FAT32 / exFAT Volume Boot Record (VBR) Decoder
 */
DSF_API bool DSF_CALL DSF_InspectVbrBootSector(
    const uint8_t* vbrSectorBuffer,
    uint32_t bufferLength,
    DSFVbrInfo* outInfo
);

#ifdef __cplusplus
}
#endif

#endif // DISK_SENTINEL_FORENSICS_H
