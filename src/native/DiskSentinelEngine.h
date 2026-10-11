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
#pragma pack(pop)

/**
 * Open physical drive with OS Cache Bypass (FILE_FLAG_NO_BUFFERING | FILE_FLAG_WRITE_THROUGH)
 */
DS_API void* DS_CALL DS_OpenDriveDirect(uint32_t physicalDriveIndex, uint32_t* outSectorSize);

/**
 * High precision hardware scan of specified LBA chunk with microsecond latency measurement
 */
DS_API bool DS_CALL DS_ScanLbaBlock(void* hDrive, uint64_t lba, uint32_t count, DSBlockResult* outResult);

/**
 * Native S.M.A.R.T. (ATA SFF-8035i) & NVMe (Log Page 02h) telemetry retrieval
 */
DS_API int32_t DS_CALL DS_GetSmartTelemetry(void* hDrive, DSSmartEntry* outEntries, int32_t maxEntries);

/**
 * Non-destructive soft bad sector evaluation and spare block reallocation trigger
 */
DS_API bool DS_CALL DS_AttemptSoftSectorRepair(void* hDrive, uint64_t badLba, uint32_t* outRecoveredStatus);

/**
 * Close physical drive handle and release memory resources
 */
DS_API void DS_CALL DS_CloseDrive(void* hDrive);

#ifdef __cplusplus
}
#endif

#endif // DISK_SENTINEL_ENGINE_H
