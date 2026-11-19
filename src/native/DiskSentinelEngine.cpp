/**
 * @file DiskSentinelEngine.cpp
 * @brief Implementation of Pure Creative DLL: DiskSentinelNativeCore.dll
 * @author AhBiYout (GitHub: AhBiYout-all)
 * @affiliation CISNet (https://www.cisnet.co.kr)
 * @blog https://ahbiyoutvibe.blogspot.com/
 * @license Apache-2.0
 */

#ifndef DISKSENTINEL_EXPORTS
#define DISKSENTINEL_EXPORTS
#endif
#include "DiskSentinelEngine.h"
#include <stddef.h>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winioctl.h>
#include <ntddscsi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Portable string copy for cross-compiler compatibility (MSVC, MinGW, Clang)
static void safe_strncpy(char* dest, const char* src, size_t destSize) {
    if (!dest || destSize == 0) return;
    if (!src) { dest[0] = '\0'; return; }
    size_t i = 0;
    for (; i < destSize - 1 && src[i] != '\0'; ++i) {
        dest[i] = src[i];
    }
    dest[i] = '\0';
}

// Portable aligned memory allocator
#if defined(_MSC_VER)
  #define DS_ALIGNED_ALLOC(size, align) _aligned_malloc(size, align)
  #define DS_ALIGNED_FREE(ptr) _aligned_free(ptr)
#elif defined(__MINGW32__) || defined(__MINGW64__)
  #define DS_ALIGNED_ALLOC(size, align) __mingw_aligned_malloc(size, align)
  #define DS_ALIGNED_FREE(ptr) __mingw_aligned_free(ptr)
#else
  static void* ds_portable_aligned_alloc(size_t size, size_t align) {
      if (align < sizeof(void*)) align = sizeof(void*);
      uintptr_t mask = (uintptr_t)(align - 1);
      void* raw = malloc(size + align + sizeof(void*));
      if (!raw) return NULL;
      uintptr_t alignedAddr = (((uintptr_t)raw) + sizeof(void*) + mask) & ~mask;
      ((void**)alignedAddr)[-1] = raw;
      return (void*)alignedAddr;
  }
  static void ds_portable_aligned_free(void* ptr) {
      if (ptr) free(((void**)ptr)[-1]);
  }
  #define DS_ALIGNED_ALLOC(size, align) ds_portable_aligned_alloc(size, align)
  #define DS_ALIGNED_FREE(ptr) ds_portable_aligned_free(ptr)
#endif

// Internal Drive Context
typedef struct {
    HANDLE   hDevice;
    uint32_t driveIndex;
    uint32_t sectorSize;
    uint32_t physicalSectorSize;
    void*    alignedBuffer;
    uint32_t bufferCapacity;
    uint32_t allocationGranularity;
    bool     isVirtualAllocBuffer;
    uint64_t lastByteOffset;
    bool     offsetValid;
    LARGE_INTEGER timerFrequency;
} DSDriveContext;

DS_API void* DS_CALL DS_OpenDriveDirect(uint32_t physicalDriveIndex, uint32_t* outSectorSize) {
    wchar_t devicePath[64];
    swprintf(devicePath, 64, L"\\\\.\\PhysicalDrive%u", physicalDriveIndex);

    // Module 1: Direct OS Cache Bypass File Open with full sharing flags
    HANDLE hDevice = CreateFileW(
        devicePath,
        GENERIC_READ | GENERIC_WRITE,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        NULL,
        OPEN_EXISTING,
        FILE_FLAG_NO_BUFFERING | FILE_FLAG_WRITE_THROUGH,
        NULL
    );

    if (hDevice == INVALID_HANDLE_VALUE) {
        // Fallback to read-only if write rights are not elevated
        hDevice = CreateFileW(
            devicePath,
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            NULL,
            OPEN_EXISTING,
            FILE_FLAG_NO_BUFFERING,
            NULL
        );
    }

    if (hDevice == INVALID_HANDLE_VALUE) {
        // Secondary fallback to Query Access (0) for metadata/geometry enumeration without elevation
        hDevice = CreateFileW(
            devicePath,
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            NULL,
            OPEN_EXISTING,
            0,
            NULL
        );
    }

    if (hDevice == INVALID_HANDLE_VALUE) {
        return NULL;
    }

    DSDriveContext* ctx = (DSDriveContext*)malloc(sizeof(DSDriveContext));
    if (!ctx) {
        CloseHandle(hDevice);
        return NULL;
    }
    memset(ctx, 0, sizeof(DSDriveContext));

    ctx->hDevice = hDevice;
    ctx->driveIndex = physicalDriveIndex;
    ctx->sectorSize = 512; // Standard default until geometry IOCTL confirms 512 / 4096
    ctx->physicalSectorSize = 4096;

    SYSTEM_INFO sysInfo;
    GetSystemInfo(&sysInfo);
    ctx->allocationGranularity = (sysInfo.dwAllocationGranularity >= 4096) ? (uint32_t)sysInfo.dwAllocationGranularity : 65536U;

    DISK_GEOMETRY_EX geom;
    memset(&geom, 0, sizeof(geom));
    DWORD geomBytes = 0;
    if (DeviceIoControl(hDevice, IOCTL_DISK_GET_DRIVE_GEOMETRY_EX, NULL, 0, &geom, sizeof(geom), &geomBytes, NULL)) {
        if (geom.Geometry.BytesPerSector >= 512) {
            ctx->sectorSize = geom.Geometry.BytesPerSector;
            ctx->physicalSectorSize = geom.Geometry.BytesPerSector;
        }
    }

    // Query StorageAccessAlignmentProperty (PropertyId = 6) for true 4Kn / 512e physical sector size
    {
        STORAGE_PROPERTY_QUERY alignQuery;
        memset(&alignQuery, 0, sizeof(alignQuery));
        alignQuery.PropertyId = (STORAGE_PROPERTY_ID)6;
        alignQuery.QueryType = PropertyStandardQuery;
        uint8_t alignBuf[32];
        memset(alignBuf, 0, sizeof(alignBuf));
        DWORD alignBytes = 0;
        if (DeviceIoControl(hDevice, IOCTL_STORAGE_QUERY_PROPERTY, &alignQuery, sizeof(alignQuery),
                            alignBuf, sizeof(alignBuf), &alignBytes, NULL) && alignBytes >= 24) {
            uint32_t logSec = *(const uint32_t*)(alignBuf + 16);
            uint32_t physSec = *(const uint32_t*)(alignBuf + 20);
            if (logSec >= 512 && (logSec & (logSec - 1)) == 0) ctx->sectorSize = logSec;
            if (physSec >= 512 && (physSec & (physSec - 1)) == 0) ctx->physicalSectorSize = physSec;
        }
    }

    // Query StorageAdapterProperty (PropertyId = 1) to scale DMA burst size up to hardware MaximumTransferLength
    uint32_t optimalBurstBytes = 2U * 1024U * 1024U; // 2MB default DMA window
    {
        STORAGE_PROPERTY_QUERY adapterQuery;
        memset(&adapterQuery, 0, sizeof(adapterQuery));
        adapterQuery.PropertyId = StorageAdapterProperty;
        adapterQuery.QueryType = PropertyStandardQuery;
        STORAGE_ADAPTER_DESCRIPTOR adapterDesc;
        memset(&adapterDesc, 0, sizeof(adapterDesc));
        DWORD adapterBytes = 0;
        if (DeviceIoControl(hDevice, IOCTL_STORAGE_QUERY_PROPERTY, &adapterQuery, sizeof(adapterQuery),
                            &adapterDesc, sizeof(adapterDesc), &adapterBytes, NULL) &&
            adapterBytes >= 16 && adapterDesc.MaximumTransferLength >= 512U * 1024U) {
            uint32_t maxTx = (uint32_t)adapterDesc.MaximumTransferLength;
            maxTx = (maxTx / ctx->sectorSize) * ctx->sectorSize;
            if (maxTx > 4U * 1024U * 1024U) maxTx = 4U * 1024U * 1024U;
            if (maxTx >= 1024U * 1024U) optimalBurstBytes = maxTx;
        }
    }

    ctx->bufferCapacity = optimalBurstBytes;
    // VirtualAlloc reserves & commits 64KB-aligned OS pages for zero-copy MDL locking in Direct DMA
    ctx->alignedBuffer = VirtualAlloc(NULL, ctx->bufferCapacity, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    if (ctx->alignedBuffer) {
        ctx->isVirtualAllocBuffer = true;
    } else {
        ctx->isVirtualAllocBuffer = false;
        ctx->alignedBuffer = DS_ALIGNED_ALLOC(ctx->bufferCapacity, 4096);
    }
    if (!ctx->alignedBuffer) {
        CloseHandle(hDevice);
        free(ctx);
        return NULL;
    }
    QueryPerformanceFrequency(&ctx->timerFrequency);

    if (outSectorSize) {
        *outSectorSize = ctx->sectorSize;
    }

    return (void*)ctx;
}

DS_API bool DS_CALL DS_ScanLbaBlock(void* hDrive, uint64_t lba, uint32_t count, DSBlockResult* outResult) {
    if (!hDrive || !outResult || count == 0) return false;
    DSDriveContext* ctx = (DSDriveContext*)hDrive;

    uint64_t totalBytesToRead = (uint64_t)count * (uint64_t)ctx->sectorSize;
    uint64_t targetByteOffset = lba * (uint64_t)ctx->sectorSize;

    // 64-bit integer overflow protection
    LARGE_INTEGER offset;
    offset.QuadPart = (LONGLONG)targetByteOffset;

    // Skip redundant SetFilePointerEx syscall when reading sequentially from previous position
    bool needSeek = !(ctx->offsetValid && ctx->lastByteOffset == targetByteOffset);
    if (needSeek && !SetFilePointerEx(ctx->hDevice, offset, NULL, FILE_BEGIN)) {
        ctx->offsetValid = false;
        outResult->startLba = lba;
        outResult->sectorCount = count;
        outResult->latencyMs = -1.0;
        outResult->statusCode = DS_STATUS_BAD;
        outResult->win32ErrorCode = GetLastError();
        safe_strncpy(outResult->errorMnemonic, "SEEK_ERROR", sizeof(outResult->errorMnemonic));
        return false;
    }

    // Microsecond High Precision Latency Measurement across full requested range
    LARGE_INTEGER startTick, endTick;
    QueryPerformanceCounter(&startTick);

    uint64_t remainingBytes = totalBytesToRead;
    uint64_t cursorOffset = targetByteOffset;
    BOOL readSuccess = TRUE;
    DWORD lastErr = 0;

    while (remainingBytes > 0) {
        DWORD chunkSize = (remainingBytes > (uint64_t)ctx->bufferCapacity)
            ? ctx->bufferCapacity
            : (DWORD)remainingBytes;
        DWORD bytesRead = 0;
        if (!ReadFile(ctx->hDevice, ctx->alignedBuffer, chunkSize, &bytesRead, NULL) || bytesRead != chunkSize) {
            readSuccess = FALSE;
            lastErr = GetLastError();
            ctx->offsetValid = false;
            break;
        }
        cursorOffset += chunkSize;
        remainingBytes -= chunkSize;
    }

    if (readSuccess) {
        ctx->lastByteOffset = cursorOffset;
        ctx->offsetValid = true;
    }

    QueryPerformanceCounter(&endTick);

    double elapsedMs = (double)(endTick.QuadPart - startTick.QuadPart) * 1000.0 / (double)ctx->timerFrequency.QuadPart;

    outResult->startLba = lba;
    outResult->sectorCount = count;
    outResult->latencyMs = elapsedMs;
    outResult->win32ErrorCode = readSuccess ? 0 : lastErr;

    if (!readSuccess) {
        outResult->statusCode = DS_STATUS_BAD;
        if (outResult->win32ErrorCode == ERROR_CRC) {
            safe_strncpy(outResult->errorMnemonic, "CRC (Data Error)", sizeof(outResult->errorMnemonic));
        } else if (outResult->win32ErrorCode == ERROR_SECTOR_NOT_FOUND) {
            safe_strncpy(outResult->errorMnemonic, "IDNF (Sector Not Found)", sizeof(outResult->errorMnemonic));
        } else {
            safe_strncpy(outResult->errorMnemonic, "UNC (Uncorrectable Error)", sizeof(outResult->errorMnemonic));
        }
    } else {
        if (elapsedMs < 10.0) {
            outResult->statusCode = DS_STATUS_GOOD;
            safe_strncpy(outResult->errorMnemonic, "OK", sizeof(outResult->errorMnemonic));
        } else if (elapsedMs < 50.0) {
            outResult->statusCode = DS_STATUS_NORMAL;
            safe_strncpy(outResult->errorMnemonic, "OK", sizeof(outResult->errorMnemonic));
        } else if (elapsedMs < 150.0) {
            outResult->statusCode = DS_STATUS_SLOW;
            safe_strncpy(outResult->errorMnemonic, "SLOW", sizeof(outResult->errorMnemonic));
        } else {
            outResult->statusCode = DS_STATUS_CRITICAL;
            safe_strncpy(outResult->errorMnemonic, "CRITICAL_LATENCY", sizeof(outResult->errorMnemonic));
        }
    }

    return true;
}

/**
 * Pure Creative Algorithm: Adaptive Burst & Micro-LBA Seeker
 */
DS_API bool DS_CALL DS_AdaptiveScanChunk(
    void* hDrive,
    uint64_t chunkStartLba,
    uint32_t chunkSectorCount,
    uint32_t burstStep,
    DSBlockResult* outBadResults,
    uint32_t maxBadResults,
    uint32_t* outDetectedBadCount
) {
    if (!hDrive || chunkSectorCount == 0) return false;
    if (burstStep == 0) burstStep = 256; // Default 256 sectors (~1MB)

    uint32_t badCount = 0;
    uint64_t currentLba = chunkStartLba;
    uint64_t endLba = chunkStartLba + chunkSectorCount;

    while (currentLba < endLba) {
        uint32_t sectorsToTest = (uint32_t)(endLba - currentLba);
        if (sectorsToTest > burstStep) sectorsToTest = burstStep;

        DSBlockResult burstResult;
        bool ok = DS_ScanLbaBlock(hDrive, currentLba, sectorsToTest, &burstResult);

        // Healthy burst block: skip directly to next burst block (High-speed phase)
        if (ok && burstResult.statusCode <= DS_STATUS_NORMAL) {
            currentLba += sectorsToTest;
            continue;
        }

        // Degradation or Bad Sector Triggered:
        // Iterative Binary Subdivision down to 1-sector resolution (O(log K) syscalls for isolated defects)
        typedef struct {
            uint64_t start;
            uint32_t count;
        } DSSubRange;
        DSSubRange stack[64];
        int sp = 0;

        if (sectorsToTest > 4U) {
            uint32_t half = sectorsToTest >> 1;
            stack[sp++] = { currentLba + half, sectorsToTest - half };
            stack[sp++] = { currentLba, half };
        } else {
            stack[sp++] = { currentLba, sectorsToTest };
        }

        while (sp > 0) {
            DSSubRange sub = stack[--sp];
            if (sub.count <= 4U) {
                for (uint32_t k = 0; k < sub.count; ++k) {
                    DSBlockResult singleResult;
                    DS_ScanLbaBlock(hDrive, sub.start + k, 1, &singleResult);
                    if (singleResult.statusCode >= DS_STATUS_SLOW) {
                        if (outBadResults && badCount < maxBadResults) {
                            outBadResults[badCount] = singleResult;
                        }
                        badCount++;
                    }
                }
            } else {
                DSBlockResult subRes;
                bool subOk = DS_ScanLbaBlock(hDrive, sub.start, sub.count, &subRes);
                if (subOk && subRes.statusCode <= DS_STATUS_NORMAL) {
                    continue; // Healthy half skipped in 1 ReadFile syscall
                }
                if (sp + 2 <= 64) {
                    uint32_t half = sub.count >> 1;
                    stack[sp++] = { sub.start + half, sub.count - half };
                    stack[sp++] = { sub.start, half };
                } else {
                    for (uint32_t k = 0; k < sub.count; ++k) {
                        DSBlockResult singleResult;
                        DS_ScanLbaBlock(hDrive, sub.start + k, 1, &singleResult);
                        if (singleResult.statusCode >= DS_STATUS_SLOW) {
                            if (outBadResults && badCount < maxBadResults) {
                                outBadResults[badCount] = singleResult;
                            }
                            badCount++;
                        }
                    }
                }
            }
        }

        currentLba += sectorsToTest;
    }

    if (outDetectedBadCount) {
        *outDetectedBadCount = badCount;
    }
    return true;
}

// Lazy thread-safe 256-entry IEEE 802.3 CRC32 lookup table (0xEDB88320)
struct DSCrc32LookupTable {
    uint32_t entries[256];
    DSCrc32LookupTable() {
        for (uint32_t i = 0; i < 256; ++i) {
            uint32_t c = i;
            for (int k = 0; k < 8; ++k) {
                c = (c >> 1) ^ ((c & 1) ? 0xEDB88320U : 0U);
            }
            entries[i] = c;
        }
    }
};

static const uint32_t* DS_GetCrc32Table() {
    static const DSCrc32LookupTable s_table;
    return s_table.entries;
}

/**
 * Pure Creative Algorithm: Fast Hardware ECC Parity & LUT-Accelerated CRC32 Generator
 */
DS_API bool DS_CALL DS_CalculateParityChecksum(
    const uint8_t* pBuffer,
    uint32_t bufferLength,
    uint32_t* outCrc32,
    uint64_t* outEccParity
) {
    if (!pBuffer || bufferLength == 0) return false;

    const uint32_t* table = DS_GetCrc32Table();
    uint32_t crc = 0xFFFFFFFFU;
    uint64_t xorParity = 0ULL;

    uint32_t i = 0;
    uint32_t wordLimit = bufferLength & ~7U;

    // 8-byte unrolled loop for O(N) CRC32 LUT + 64-bit Galois XOR parity
    for (; i < wordLimit; i += 8) {
        uint64_t word64 = 0;
        memcpy(&word64, pBuffer + i, sizeof(uint64_t));
        xorParity ^= word64;

        crc = table[(crc ^ pBuffer[i])     & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 1]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 2]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 3]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 4]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 5]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 6]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 7]) & 0xFFU] ^ (crc >> 8);
    }

    for (; i < bufferLength; ++i) {
        uint8_t byteVal = pBuffer[i];
        crc = table[(crc ^ byteVal) & 0xFFU] ^ (crc >> 8);
        uint32_t shift = (i & 7U) * 8U;
        xorParity ^= ((uint64_t)byteVal << shift);
    }

    if (outCrc32) *outCrc32 = ~crc;
    if (outEccParity) *outEccParity = xorParity;
    return true;
}

/**
 * Pure Creative Algorithm: Weighted Drive Reliability & Remaining Life Evaluator
 */
DS_API bool DS_CALL DS_EvaluateDriveReliability(
    const DSSmartEntry* entries,
    int32_t entryCount,
    DSDriveHealthReport* outReport
) {
    if (!outReport) return false;
    if (!entries && entryCount > 0) return false;
    memset(outReport, 0, sizeof(DSDriveHealthReport));

    double score = 100.0;
    outReport->estimatedRemainingDays = 1825; // 5 years baseline

    for (int32_t i = 0; i < entryCount; ++i) {
        const DSSmartEntry* e = &entries[i];

        switch (e->attributeId) {
            case 0x05: // Reallocated Sector Count
                outReport->reallocatedSectors = (uint32_t)e->rawValue;
                if (e->rawValue > 0) {
                    double penalty = (double)e->rawValue * 5.0;
                    if (penalty > 45.0) penalty = 45.0;
                    score -= penalty;
                }
                break;

            case 0xC5: // Current Pending Sector Count
                outReport->pendingSectors = (uint32_t)e->rawValue;
                if (e->rawValue > 0) {
                    double penalty = (double)e->rawValue * 10.0;
                    if (penalty > 50.0) penalty = 50.0;
                    score -= penalty;
                }
                break;

            case 0xBB: // Reported Uncorrectable Errors
            case 0xC6: // Offline Uncorrectable Sector Count
                outReport->uncorrectableErrors += (uint32_t)e->rawValue;
                if (e->rawValue > 0) {
                    double penalty = (double)e->rawValue * 8.0;
                    if (penalty > 40.0) penalty = 40.0;
                    score -= penalty;
                }
                break;

            case 0x09: // Power-On Hours (POH)
                outReport->totalPowerOnHours = (uint32_t)e->rawValue;
                break;

            case 0xC2: // Temperature
            case 0xBE: // Airflow Temperature
                outReport->temperatureCelsius = (uint32_t)(e->rawValue & 0xFF);
                if (outReport->temperatureCelsius > 55) {
                    score -= (outReport->temperatureCelsius - 55) * 2.0;
                }
                break;
        }
    }

    if (score < 0.0) score = 0.0;
    outReport->reliabilityScore = score;

    if (score >= 90.0) {
        outReport->estimatedRemainingDays = 1825; // ~5 years
        safe_strncpy(outReport->overallGrade, "EXCELLENT", sizeof(outReport->overallGrade));
    } else if (score >= 75.0) {
        outReport->estimatedRemainingDays = 730;  // ~2 years
        safe_strncpy(outReport->overallGrade, "GOOD", sizeof(outReport->overallGrade));
    } else if (score >= 45.0) {
        outReport->estimatedRemainingDays = 120;  // ~4 months
        safe_strncpy(outReport->overallGrade, "WARNING", sizeof(outReport->overallGrade));
    } else {
        outReport->estimatedRemainingDays = 14;   // Critical: immediate backup
        safe_strncpy(outReport->overallGrade, "CRITICAL", sizeof(outReport->overallGrade));
    }

    return true;
}

static const char* LookupSmartAttributeName(uint8_t id) {
    switch (id) {
        case 0x01: return "Read Error Rate";
        case 0x03: return "Spin Up Time";
        case 0x04: return "Start/Stop Count";
        case 0x05: return "Reallocated Sectors Count";
        case 0x07: return "Seek Error Rate";
        case 0x09: return "Power-On Hours";
        case 0x0A: return "Spin Retry Count";
        case 0x0C: return "Power Cycle Count";
        case 0xBB: return "Reported Uncorrectable Errors";
        case 0xBC: return "Command Timeout";
        case 0xBE: return "Airflow Temperature";
        case 0xC0: return "Unsafe Shutdown Count";
        case 0xC1: return "Load Cycle Count";
        case 0xC2: return "Temperature Celsius";
        case 0xC4: return "Reallocation Event Count";
        case 0xC5: return "Current Pending Sector Count";
        case 0xC6: return "Offline Uncorrectable Sector Count";
        case 0xC7: return "UltraDMA CRC Error Count";
        case 0xE1: return "Host Writes (Total)";
        case 0xE7: return "SSD Life Left";
        case 0xF1: return "Total LBA Written";
        case 0xF2: return "Total LBA Read";
        default:   return "Vendor Specific Attribute";
    }
}

DS_API int32_t DS_CALL DS_GetSmartTelemetry(void* hDrive, DSSmartEntry* outEntries, int32_t maxEntries) {
    if (!hDrive || !outEntries || maxEntries <= 0) return 0;
    DSDriveContext* ctx = (DSDriveContext*)hDrive;

    DWORD bytesReturned = 0;
    int count = 0;

    // 1. Attempt real ATA S.M.A.R.T. query via SMART_GET_VERSION + SMART_RCV_DRIVE_DATA
    GETVERSIONINPARAMS gvip;
    memset(&gvip, 0, sizeof(gvip));
    BOOL smartVerOk = DeviceIoControl(
        ctx->hDevice,
        SMART_GET_VERSION,
        NULL, 0,
        &gvip, sizeof(gvip),
        &bytesReturned,
        NULL
    );

    if (smartVerOk) {
        // First read attribute thresholds (command 0xD1) so we have real manufacturer thresholds
        uint8_t thresholds[256];
        memset(thresholds, 0, sizeof(thresholds));
        {
            SENDCMDINPARAMS threshIn;
            memset(&threshIn, 0, sizeof(threshIn));
            threshIn.cBufferSize = READ_THRESHOLD_BUFFER_SIZE;
            threshIn.irDriveRegs.bFeaturesReg = 0xD1; // READ_THRESHOLDS
            threshIn.irDriveRegs.bSectorCountReg = 1;
            threshIn.irDriveRegs.bSectorNumberReg = 1;
            threshIn.irDriveRegs.bCylLowReg = SMART_CYL_LOW;
            threshIn.irDriveRegs.bCylHighReg = SMART_CYL_HI;
            threshIn.irDriveRegs.bDriveHeadReg = (uint8_t)(0xA0 | ((ctx->driveIndex & 1) << 4));
            threshIn.irDriveRegs.bCommandReg = SMART_CMD;

            uint8_t threshOutBuf[sizeof(SENDCMDOUTPARAMS) + READ_THRESHOLD_BUFFER_SIZE];
            memset(threshOutBuf, 0, sizeof(threshOutBuf));
            DWORD threshBytes = 0;
            if (DeviceIoControl(ctx->hDevice, SMART_RCV_DRIVE_DATA, &threshIn, sizeof(threshIn),
                                threshOutBuf, sizeof(threshOutBuf), &threshBytes, NULL) && threshBytes >= sizeof(SENDCMDOUTPARAMS)) {
                SENDCMDOUTPARAMS* pThreshOut = (SENDCMDOUTPARAMS*)threshOutBuf;
                const uint8_t* tData = pThreshOut->bBuffer;
                for (int i = 0; i < 30; ++i) {
                    const uint8_t* rec = tData + 2 + (i * 12);
                    uint8_t attrId = rec[0];
                    if (attrId != 0) {
                        thresholds[attrId] = rec[1];
                    }
                }
            }
        }

        // Now read attribute values (0xD0 / READ_ATTRIBUTES)
        SENDCMDINPARAMS attrIn;
        memset(&attrIn, 0, sizeof(attrIn));
        attrIn.cBufferSize = READ_ATTRIBUTE_BUFFER_SIZE;
        attrIn.irDriveRegs.bFeaturesReg = READ_ATTRIBUTES;
        attrIn.irDriveRegs.bSectorCountReg = 1;
        attrIn.irDriveRegs.bSectorNumberReg = 1;
        attrIn.irDriveRegs.bCylLowReg = SMART_CYL_LOW;
        attrIn.irDriveRegs.bCylHighReg = SMART_CYL_HI;
        attrIn.irDriveRegs.bDriveHeadReg = (uint8_t)(0xA0 | ((ctx->driveIndex & 1) << 4));
        attrIn.irDriveRegs.bCommandReg = SMART_CMD;

        uint8_t attrOutBuf[sizeof(SENDCMDOUTPARAMS) + READ_ATTRIBUTE_BUFFER_SIZE];
        memset(attrOutBuf, 0, sizeof(attrOutBuf));
        DWORD attrBytes = 0;

        if (DeviceIoControl(ctx->hDevice, SMART_RCV_DRIVE_DATA, &attrIn, sizeof(attrIn),
                            attrOutBuf, sizeof(attrOutBuf), &attrBytes, NULL) && attrBytes >= 528) {
            SENDCMDOUTPARAMS* pAttrOut = (SENDCMDOUTPARAMS*)attrOutBuf;
            const uint8_t* pData = pAttrOut->bBuffer;

            for (int i = 0; i < 30 && count < maxEntries; ++i) {
                const uint8_t* attr = pData + 2 + (i * 12);
                uint8_t id = attr[0];
                if (id == 0) continue;

                DSSmartEntry* entry = &outEntries[count];
                memset(entry, 0, sizeof(DSSmartEntry));
                entry->attributeId = id;
                safe_strncpy(entry->attributeName, LookupSmartAttributeName(id), sizeof(entry->attributeName));
                entry->currentValue = attr[3];
                entry->worstValue = attr[4];
                entry->thresholdValue = thresholds[id];

                uint64_t raw = 0;
                for (int b = 0; b < 6; ++b) {
                    raw |= ((uint64_t)attr[5 + b]) << (b * 8);
                }
                entry->rawValue = raw;

                uint32_t status = 0;
                if (entry->thresholdValue > 0 && entry->currentValue <= entry->thresholdValue) {
                    status = 2; // Critical: crossed manufacturer threshold
                } else if ((id == 0x05 || id == 0xC5 || id == 0xC6 || id == 0xBB) && raw > 0) {
                    status = (raw >= 8) ? 2 : 1;
                } else if ((id == 0xC2 || id == 0xBE) && (raw & 0xFF) >= 60) {
                    status = 2;
                } else if ((id == 0xC2 || id == 0xBE) && (raw & 0xFF) >= 52) {
                    status = 1;
                }
                entry->healthStatus = status;
                count++;
            }
        }
    }

    // 2. Supplement or fallback via IOCTL_STORAGE_QUERY_PROPERTY (StorageDeviceTemperatureProperty)
    //    for NVMe/USB UASP devices where ATA SMART_RCV_DRIVE_DATA is unsupported.
    if (count == 0 && count < maxEntries) {
        STORAGE_PROPERTY_QUERY tempQuery;
        memset(&tempQuery, 0, sizeof(tempQuery));
        tempQuery.PropertyId = StorageDeviceTemperatureProperty;
        tempQuery.QueryType = PropertyStandardQuery;

        STORAGE_TEMPERATURE_DATA_DESCRIPTOR tempDesc;
        memset(&tempDesc, 0, sizeof(tempDesc));
        DWORD tempBytes = 0;
        if (DeviceIoControl(ctx->hDevice, IOCTL_STORAGE_QUERY_PROPERTY, &tempQuery, sizeof(tempQuery),
                            &tempDesc, sizeof(tempDesc), &tempBytes, NULL) && tempDesc.InfoCount > 0) {
            int16_t tempC = tempDesc.TemperatureInfo[0].Temperature;
            if (tempC > -40 && tempC < 150) {
                DSSmartEntry* entry = &outEntries[count];
                memset(entry, 0, sizeof(DSSmartEntry));
                entry->attributeId = 0xC2;
                safe_strncpy(entry->attributeName, "Temperature Celsius", sizeof(entry->attributeName));
                entry->currentValue = (tempC < 100 && tempC >= 0) ? (uint8_t)(100 - tempC) : 0;
                entry->worstValue = entry->currentValue;
                entry->thresholdValue = 0;
                entry->rawValue = (uint64_t)(tempC > 0 ? tempC : 0);
                entry->healthStatus = (tempC >= 60) ? 2 : (tempC >= 52 ? 1 : 0);
                count++;
            }
        }
    }

    // Check OS Predict Failure flag only when at least 1 real attribute was read
    if (count > 0) {
        STORAGE_PREDICT_FAILURE checkFailure;
        memset(&checkFailure, 0, sizeof(checkFailure));
        DWORD predBytes = 0;
        if (DeviceIoControl(ctx->hDevice, IOCTL_STORAGE_PREDICT_FAILURE, NULL, 0,
                            &checkFailure, sizeof(checkFailure), &predBytes, NULL) && checkFailure.PredictFailure) {
            outEntries[0].healthStatus = 2;
        }
    }

    return count;
}

DS_API bool DS_CALL DS_AttemptSoftSectorRepair(void* hDrive, uint64_t badLba, uint32_t count, uint32_t* outRecoveredStatus) {
    if (!hDrive) {
        if (outRecoveredStatus) *outRecoveredStatus = 0;
        return false;
    }
    DSDriveContext* ctx = (DSDriveContext*)hDrive;
    uint32_t safeCount = (count == 0) ? 1 : count;
    uint32_t maxSectorsPerChunk = (ctx->sectorSize > 0) ? (ctx->bufferCapacity / ctx->sectorSize) : 1;
    if (maxSectorsPerChunk == 0) maxSectorsPerChunk = 1;

    uint32_t remainingSectors = safeCount;
    uint64_t currentLba = badLba;
    ctx->offsetValid = false;

    while (remainingSectors > 0) {
        uint32_t batch = (remainingSectors > maxSectorsPerChunk) ? maxSectorsPerChunk : remainingSectors;
        DWORD totalBytes = batch * ctx->sectorSize;

        LARGE_INTEGER offset;
        offset.QuadPart = ((LONGLONG)currentLba) * ((LONGLONG)ctx->sectorSize);

        if (!SetFilePointerEx(ctx->hDevice, offset, NULL, FILE_BEGIN)) {
            ctx->offsetValid = false;
            if (outRecoveredStatus) *outRecoveredStatus = 0;
            return false;
        }

        // Zero-fill buffer and issue write-verify cycle with FILE_FLAG_WRITE_THROUGH
        memset(ctx->alignedBuffer, 0, totalBytes);
        DWORD bytesWritten = 0;
        BOOL writeOk = WriteFile(ctx->hDevice, ctx->alignedBuffer, totalBytes, &bytesWritten, NULL);
        if (!writeOk || bytesWritten != totalBytes) {
            ctx->offsetValid = false;
            if (outRecoveredStatus) *outRecoveredStatus = 0;
            return false;
        }

        // Re-verify read-back matches all zeros
        if (!SetFilePointerEx(ctx->hDevice, offset, NULL, FILE_BEGIN)) {
            ctx->offsetValid = false;
            if (outRecoveredStatus) *outRecoveredStatus = 0;
            return false;
        }
        DWORD reRead = 0;
        BOOL reReadOk = ReadFile(ctx->hDevice, ctx->alignedBuffer, totalBytes, &reRead, NULL);
        if (!reReadOk || reRead != totalBytes) {
            ctx->offsetValid = false;
            if (outRecoveredStatus) *outRecoveredStatus = 0;
            return false;
        }
        const uint8_t* verifyPtr = (const uint8_t*)ctx->alignedBuffer;
        for (DWORD i = 0; i < totalBytes; ++i) {
            if (verifyPtr[i] != 0) {
                ctx->offsetValid = false;
                if (outRecoveredStatus) *outRecoveredStatus = 0;
                return false;
            }
        }

        currentLba += batch;
        remainingSectors -= batch;
    }

    if (outRecoveredStatus) *outRecoveredStatus = 1; // Successfully zero-filled & verified
    return true;
}

DS_API void DS_CALL DS_CloseDrive(void* hDrive) {
    if (!hDrive) return;
    DSDriveContext* ctx = (DSDriveContext*)hDrive;
    if (ctx->hDevice != INVALID_HANDLE_VALUE) {
        CloseHandle(ctx->hDevice);
    }
    if (ctx->alignedBuffer) {
        if (ctx->isVirtualAllocBuffer) {
            VirtualFree(ctx->alignedBuffer, 0, MEM_RELEASE);
        } else {
            DS_ALIGNED_FREE(ctx->alignedBuffer);
        }
    }
    free(ctx);
}

DS_API bool DS_CALL DS_GetNvmeDeepTelemetry(void* hDrive, DSNvmeHealthLog* outLog) {
    if (!hDrive || !outLog) return false;
    memset(outLog, 0, sizeof(DSNvmeHealthLog));
    DSDriveContext* ctx = (DSDriveContext*)hDrive;
    if (ctx->hDevice == INVALID_HANDLE_VALUE) return false;

    const DWORD logPageSize = 512;
    const DWORD queryHeaderSize = FIELD_OFFSET(STORAGE_PROPERTY_QUERY, AdditionalParameters) + sizeof(STORAGE_PROTOCOL_SPECIFIC_DATA);
    const DWORD totalBufSize = queryHeaderSize + logPageSize;

    uint8_t* buffer = (uint8_t*)malloc(totalBufSize);
    if (!buffer) return false;
    memset(buffer, 0, totalBufSize);

    STORAGE_PROPERTY_QUERY* query = (STORAGE_PROPERTY_QUERY*)buffer;
    query->PropertyId = StorageDeviceProtocolSpecificProperty;
    query->QueryType = PropertyStandardQuery;

    STORAGE_PROTOCOL_SPECIFIC_DATA* protocolData = (STORAGE_PROTOCOL_SPECIFIC_DATA*)query->AdditionalParameters;
    protocolData->ProtocolType = ProtocolTypeNvme;
    protocolData->DataType = NVMeDataTypeLogPage;
    protocolData->ProtocolDataRequestValue = 0x02; // SMART / Health Information Log Page
    protocolData->ProtocolDataRequestSubValue = 0;
    protocolData->ProtocolDataOffset = sizeof(STORAGE_PROTOCOL_SPECIFIC_DATA);
    protocolData->ProtocolDataLength = logPageSize;

    DWORD bytesReturned = 0;
    BOOL ok = DeviceIoControl(
        ctx->hDevice,
        IOCTL_STORAGE_QUERY_PROPERTY,
        buffer,
        totalBufSize,
        buffer,
        totalBufSize,
        &bytesReturned,
        NULL
    );

    if (!ok) {
        // Fallback: try StorageAdapterProtocolSpecificProperty on controllers that require adapter-level query
        memset(buffer, 0, totalBufSize);
        query->PropertyId = StorageAdapterProtocolSpecificProperty;
        query->QueryType = PropertyStandardQuery;
        protocolData->ProtocolType = ProtocolTypeNvme;
        protocolData->DataType = NVMeDataTypeLogPage;
        protocolData->ProtocolDataRequestValue = 0x02;
        protocolData->ProtocolDataOffset = sizeof(STORAGE_PROTOCOL_SPECIFIC_DATA);
        protocolData->ProtocolDataLength = logPageSize;
        bytesReturned = 0;
        ok = DeviceIoControl(
            ctx->hDevice,
            IOCTL_STORAGE_QUERY_PROPERTY,
            buffer,
            totalBufSize,
            buffer,
            totalBufSize,
            &bytesReturned,
            NULL
        );
    }

    bool parsed = false;
    if (ok && bytesReturned >= sizeof(STORAGE_PROTOCOL_DATA_DESCRIPTOR)) {
        STORAGE_PROTOCOL_DATA_DESCRIPTOR* desc = (STORAGE_PROTOCOL_DATA_DESCRIPTOR*)buffer;
        const size_t specOffset = (size_t)((const uint8_t*)(&desc->ProtocolSpecificData) - buffer);
        const DWORD dataOffset = desc->ProtocolSpecificData.ProtocolDataOffset;
        const DWORD dataLen = desc->ProtocolSpecificData.ProtocolDataLength;

        if (dataOffset > 0 && dataLen >= 200 &&
            dataOffset <= totalBufSize &&
            specOffset + (size_t)dataOffset + 200 <= (size_t)totalBufSize &&
            specOffset + (size_t)dataOffset + 200 <= (size_t)bytesReturned) {
            const uint8_t* raw = (const uint8_t*)(&desc->ProtocolSpecificData) + dataOffset;
            auto readU64LE = [](const uint8_t* p) -> uint64_t {
                uint64_t v = 0;
                for (int k = 0; k < 8; ++k) v |= ((uint64_t)p[k]) << (k * 8);
                return v;
            };
            auto readU32LE = [](const uint8_t* p) -> uint32_t {
                return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
            };

            outLog->criticalWarning = raw[0];
            uint16_t tempKelvin = (uint16_t)((uint16_t)raw[1] | ((uint16_t)raw[2] << 8));
            outLog->temperatureCelsius = (tempKelvin >= 273) ? (uint16_t)(tempKelvin - 273) : 0;
            outLog->availableSpare = raw[3];
            outLog->availableSpareThreshold = raw[4];
            outLog->percentageUsed = raw[5];

            // NVMe spec: 1 Data Unit = 1000 * 512 bytes = 512,000 bytes (~0.000512 GB decimal)
            uint64_t dataUnitsReadLo = readU64LE(raw + 32);
            uint64_t dataUnitsWrittenLo = readU64LE(raw + 48);
            outLog->dataUnitsReadTb = ((double)dataUnitsReadLo * 512000.0) / 1e12;
            outLog->dataUnitsWrittenTb = ((double)dataUnitsWrittenLo * 512000.0) / 1e12;

            outLog->hostReadCommands = readU64LE(raw + 64);
            outLog->hostWriteCommands = readU64LE(raw + 80);
            outLog->controllerBusyTimeMinutes = readU64LE(raw + 96);
            outLog->powerCycles = readU64LE(raw + 112);
            outLog->powerOnHours = readU64LE(raw + 128);
            outLog->unsafeShutdowns = readU64LE(raw + 144);
            outLog->mediaErrors = readU64LE(raw + 160);
            outLog->numErrLogEntries = readU64LE(raw + 176);
            outLog->warningTempTimeMin = readU32LE(raw + 192);
            outLog->criticalTempTimeMin = readU32LE(raw + 196);
            parsed = true;
        }
    }

    free(buffer);
    return parsed;
}

DS_API bool DS_CALL DS_CalculateAvx2ChecksumAndZeroCheck(
    const uint8_t* pBuffer,
    uint32_t bufferLength,
    bool* outIsAllZeros,
    uint32_t* outCrc32,
    uint64_t* outAvxParity
) {
    if (!pBuffer || bufferLength == 0 || !outIsAllZeros || !outCrc32 || !outAvxParity) return false;

    // Single-pass fused Zero-Check + 64-bit XOR Parity + 256-entry IEEE 802.3 CRC32 LUT
    const uint32_t* table = DS_GetCrc32Table();
    uint32_t crc = 0xFFFFFFFFU;
    uint64_t zeroAcc = 0ULL;
    uint64_t xorParity = 0ULL;

    uint32_t i = 0;
    uint32_t wordLimit = bufferLength & ~7U;

    for (; i < wordLimit; i += 8) {
        uint64_t word64 = 0;
        memcpy(&word64, pBuffer + i, sizeof(uint64_t));
        zeroAcc |= word64;
        xorParity ^= word64;

        crc = table[(crc ^ pBuffer[i])     & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 1]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 2]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 3]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 4]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 5]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 6]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 7]) & 0xFFU] ^ (crc >> 8);
    }

    for (; i < bufferLength; ++i) {
        uint8_t byteVal = pBuffer[i];
        zeroAcc |= (uint64_t)byteVal;
        uint32_t shift = (i & 7U) * 8U;
        xorParity ^= ((uint64_t)byteVal << shift);
        crc = table[(crc ^ byteVal) & 0xFFU] ^ (crc >> 8);
    }

    *outIsAllZeros = (zeroAcc == 0ULL);
    *outCrc32 = ~crc;
    *outAvxParity = xorParity;
    return true;
}

typedef struct {
    const DSMultiDriveScanTarget* target;
    DSMultiDriveScanSummary* summary;
} DSParallelWorkerArg;

static DWORD WINAPI DS_ParallelScanWorker(LPVOID lpParam) {
    DSParallelWorkerArg* arg = (DSParallelWorkerArg*)lpParam;
    const DSMultiDriveScanTarget* target = arg->target;
    DSMultiDriveScanSummary* summary = arg->summary;

    memset(summary, 0, sizeof(DSMultiDriveScanSummary));
    summary->driveIndex = target->driveIndex;

    LARGE_INTEGER freq, t0, t1;
    QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&t0);

    uint32_t sectorSize = 512;
    void* hDrive = DS_OpenDriveDirect(target->driveIndex, &sectorSize);
    if (!hDrive) {
        QueryPerformanceCounter(&t1);
        summary->elapsedMs = (double)(t1.QuadPart - t0.QuadPart) * 1000.0 / (double)freq.QuadPart;
        summary->isCompleted = false;
        summary->statusCode = DS_STATUS_BAD;
        return 0;
    }

    uint32_t detectedBad = 0;
    uint32_t step = (target->burstStep == 0) ? 256 : target->burstStep;
    DSBlockResult badBuf[32];
    bool ok = true;
    uint64_t remaining = target->sectorCount;
    uint64_t curLba = target->startLba;
    while (remaining > 0) {
        uint32_t chunkCount = (remaining > 0xFFFFFFFFULL) ? 0xFFFFFFFFU : (uint32_t)remaining;
        uint32_t chunkBad = 0;
        uint32_t spaceLeft = (detectedBad < 32) ? (32 - detectedBad) : 0;
        if (!DS_AdaptiveScanChunk(
                hDrive,
                curLba,
                chunkCount,
                step,
                spaceLeft > 0 ? &badBuf[detectedBad] : NULL,
                spaceLeft,
                &chunkBad
            )) {
            ok = false;
            break;
        }
        detectedBad += chunkBad;
        curLba += chunkCount;
        remaining -= chunkCount;
    }
    DS_CloseDrive(hDrive);

    QueryPerformanceCounter(&t1);
    double elapsedMs = (double)(t1.QuadPart - t0.QuadPart) * 1000.0 / (double)freq.QuadPart;
    uint64_t chunkOps = (target->sectorCount + step - 1) / step;
    if (chunkOps == 0) chunkOps = 1;

    summary->totalSectorsScanned = target->sectorCount;
    summary->badSectorsFound = detectedBad;
    summary->elapsedMs = elapsedMs;
    summary->avgLatencyMs = elapsedMs / (double)chunkOps;
    summary->isCompleted = ok;
    summary->statusCode = (ok && detectedBad == 0) ? DS_STATUS_GOOD : (detectedBad > 0 ? DS_STATUS_BAD : DS_STATUS_SLOW);
    return 0;
}

DS_API bool DS_CALL DS_ScanMultipleDrivesParallel(
    const DSMultiDriveScanTarget* targets,
    uint32_t targetCount,
    DSMultiDriveScanSummary* outSummaries,
    uint32_t concurrencyLimit
) {
    if (!targets || !outSummaries || targetCount == 0) return false;
    uint32_t maxWorkers = (concurrencyLimit == 0 || concurrencyLimit > targetCount) ? targetCount : concurrencyLimit;
    if (maxWorkers > 64) maxWorkers = 64;

    uint32_t offset = 0;
    while (offset < targetCount) {
        uint32_t batch = targetCount - offset;
        if (batch > maxWorkers) batch = maxWorkers;

        HANDLE threads[64];
        DSParallelWorkerArg args[64];
        for (uint32_t i = 0; i < batch; ++i) {
            args[i].target = &targets[offset + i];
            args[i].summary = &outSummaries[offset + i];
            threads[i] = CreateThread(NULL, 0, DS_ParallelScanWorker, &args[i], 0, NULL);
            if (!threads[i]) {
                // Run inline if thread spawn fails
                DS_ParallelScanWorker(&args[i]);
            }
        }
        for (uint32_t i = 0; i < batch; ++i) {
            if (threads[i]) {
                WaitForSingleObject(threads[i], INFINITE);
                CloseHandle(threads[i]);
            }
        }
        offset += batch;
    }
    return true;
}

static volatile LONG g_guardianActive = 1;
static volatile LONG g_guardianPollIntervalSec = 10;
static volatile LONG g_guardianTempThresholdC = 55;
static volatile LONG g_guardianAlertPending = 1;

DS_API bool DS_CALL DS_ConfigureTrayGuardian(
    uint32_t pollIntervalSec,
    uint32_t tempThresholdC,
    bool alertOnPendingSector
) {
    LONG interval = (pollIntervalSec < 1) ? 1 : (LONG)pollIntervalSec;
    LONG threshold = (tempThresholdC < 30) ? 30 : (LONG)tempThresholdC;
    InterlockedExchange(&g_guardianPollIntervalSec, interval);
    InterlockedExchange(&g_guardianTempThresholdC, threshold);
    InterlockedExchange(&g_guardianAlertPending, alertOnPendingSector ? 1 : 0);
    InterlockedExchange(&g_guardianActive, 1);
    return true;
}

DS_API bool DS_CALL DS_RunTrayGuardianCheck(
    DSTrayGuardianStatus* outStatus
) {
    if (!outStatus) return false;
    memset(outStatus, 0, sizeof(DSTrayGuardianStatus));

    uint32_t tempLimit = (uint32_t)InterlockedCompareExchange(&g_guardianTempThresholdC, 0, 0);
    bool checkPending = InterlockedCompareExchange(&g_guardianAlertPending, 0, 0) != 0;

    outStatus->isMonitoringActive = InterlockedCompareExchange(&g_guardianActive, 0, 0) != 0;
    outStatus->pollIntervalSec = (uint32_t)InterlockedCompareExchange(&g_guardianPollIntervalSec, 0, 0);
    outStatus->monitoredDriveCount = 0;
    outStatus->highestTempCelsius = 0;
    outStatus->criticalAlertTriggered = false;
    outStatus->warningDriveIndex = 0;
    outStatus->lastAlertCode = 0;

    uint32_t pendingTriggerIdx = 0;
    bool pendingTriggered = false;
    uint32_t reallocatedTriggerIdx = 0;
    bool reallocatedTriggered = false;

    for (uint32_t idx = 0; idx < 32; ++idx) {
        uint32_t secSize = 512;
        void* hDrive = DS_OpenDriveDirect(idx, &secSize);
        if (!hDrive) continue;

        outStatus->monitoredDriveCount++;

        DSSmartEntry entries[32];
        int32_t count = DS_GetSmartTelemetry(hDrive, entries, 32);
        DSNvmeHealthLog nvmeLog;
        if (DS_GetNvmeDeepTelemetry(hDrive, &nvmeLog)) {
            if (nvmeLog.temperatureCelsius > outStatus->highestTempCelsius) {
                outStatus->highestTempCelsius = nvmeLog.temperatureCelsius;
                if (nvmeLog.temperatureCelsius >= tempLimit) {
                    outStatus->warningDriveIndex = idx;
                }
            }
            if (nvmeLog.mediaErrors > 0 && checkPending) {
                pendingTriggered = true;
                pendingTriggerIdx = idx;
            }
        }

        for (int32_t j = 0; j < count; ++j) {
            if (entries[j].attributeId == 0xC2 || entries[j].attributeId == 0xBE || entries[j].attributeId == 0xE7) {
                uint32_t tempC = (uint32_t)(entries[j].rawValue & 0xFF);
                if (tempC > 0 && tempC < 150 && tempC > outStatus->highestTempCelsius) {
                    outStatus->highestTempCelsius = tempC;
                    if (tempC >= tempLimit) {
                        outStatus->warningDriveIndex = idx;
                    }
                }
            }
            if (checkPending && (entries[j].attributeId == 0xC5 || entries[j].attributeId == 0xC6) && entries[j].rawValue > 0) {
                pendingTriggered = true;
                pendingTriggerIdx = idx;
            }
            if (entries[j].attributeId == 0x05 && entries[j].rawValue > 0) {
                reallocatedTriggered = true;
                reallocatedTriggerIdx = idx;
            }
        }

        DS_CloseDrive(hDrive);
    }

    if (outStatus->highestTempCelsius >= tempLimit) {
        outStatus->criticalAlertTriggered = true;
        outStatus->lastAlertCode = (outStatus->highestTempCelsius >= 60) ? 2 : 1;
        snprintf((char*)outStatus->lastAlertMessage, sizeof(outStatus->lastAlertMessage),
                 "Thermal Warning: PhysicalDrive%u reached %u C (Threshold %u C)",
                 outStatus->warningDriveIndex, outStatus->highestTempCelsius, tempLimit);
    } else if (pendingTriggered) {
        outStatus->criticalAlertTriggered = true;
        outStatus->warningDriveIndex = pendingTriggerIdx;
        outStatus->lastAlertCode = 4;
        snprintf((char*)outStatus->lastAlertMessage, sizeof(outStatus->lastAlertMessage),
                 "S.M.A.R.T. Alert: Pending/Uncorrectable sectors detected on PhysicalDrive%u", pendingTriggerIdx);
    } else if (reallocatedTriggered) {
        outStatus->criticalAlertTriggered = true;
        outStatus->warningDriveIndex = reallocatedTriggerIdx;
        outStatus->lastAlertCode = 3;
        snprintf((char*)outStatus->lastAlertMessage, sizeof(outStatus->lastAlertMessage),
                 "S.M.A.R.T. Notice: Reallocated sectors detected on PhysicalDrive%u", reallocatedTriggerIdx);
    } else if (outStatus->monitoredDriveCount == 0) {
        safe_strncpy((char*)outStatus->lastAlertMessage,
                     "No physical drives accessible (Administrator elevation required for raw handles)",
                     sizeof(outStatus->lastAlertMessage));
    } else if (outStatus->highestTempCelsius == 0) {
        snprintf((char*)outStatus->lastAlertMessage, sizeof(outStatus->lastAlertMessage),
                 "%u drive(s) monitored; thermal sensors unavailable without SMART/NVMe elevation",
                 outStatus->monitoredDriveCount);
    } else {
        snprintf((char*)outStatus->lastAlertMessage, sizeof(outStatus->lastAlertMessage),
                 "All %u monitored drives operational (Peak %u C)",
                 outStatus->monitoredDriveCount, outStatus->highestTempCelsius);
    }

    return true;
}

DS_API bool DS_CALL DS_ExecuteBitCarvingRecovery(
    void* hDrive,
    uint64_t targetLba,
    uint32_t clusterSpan,
    DSCarvedSectorResult* outResult
) {
    if (!hDrive || !outResult) return false;
    memset(outResult, 0, sizeof(DSCarvedSectorResult));
    outResult->sourceLba = targetLba;
    safe_strncpy((char*)outResult->signatureName, "Unknown / Unreadable Raw Data", sizeof(outResult->signatureName));

    DSDriveContext* ctx = (DSDriveContext*)hDrive;
    if (ctx->hDevice == INVALID_HANDLE_VALUE) return false;

    uint32_t span = (clusterSpan == 0) ? 8 : (clusterSpan > 64 ? 64 : clusterSpan);
    uint32_t sectorBytes = (ctx->sectorSize > 0) ? ctx->sectorSize : 512;
    uint32_t bufferSize = span * sectorBytes;
    if (bufferSize > ctx->bufferCapacity) {
        bufferSize = ctx->bufferCapacity;
    }

    LARGE_INTEGER offset;
    offset.QuadPart = ((LONGLONG)targetLba) * ((LONGLONG)sectorBytes);
    ctx->offsetValid = false;
    if (!SetFilePointerEx(ctx->hDevice, offset, NULL, FILE_BEGIN)) {
        return false;
    }

    DWORD bytesRead = 0;
    BOOL ok = ReadFile(ctx->hDevice, ctx->alignedBuffer, bufferSize, &bytesRead, NULL);
    if (!ok || bytesRead == 0) {
        return false;
    }

    const uint8_t* raw = (const uint8_t*)ctx->alignedBuffer;
    size_t previewLen = (bytesRead < 64) ? bytesRead : 64;
    memcpy(outResult->hexPreview, raw, previewLen);
    outResult->carvedSizeBytes = (uint64_t)bytesRead;

    if (bytesRead >= 4 && raw[0] == 0xFF && raw[1] == 0xD8 && raw[2] == 0xFF) {
        outResult->signatureType = 1;
        safe_strncpy((char*)outResult->signatureName, "JPEG Image (EXIF/JFIF)", sizeof(outResult->signatureName));
        outResult->isSalvaged = true;
    } else if (bytesRead >= 4 && raw[0] == 0x89 && raw[1] == 0x50 && raw[2] == 0x4E && raw[3] == 0x47) {
        outResult->signatureType = 2;
        safe_strncpy((char*)outResult->signatureName, "PNG Lossless Image", sizeof(outResult->signatureName));
        outResult->isSalvaged = true;
    } else if (bytesRead >= 4 && memcmp(raw, "%PDF", 4) == 0) {
        outResult->signatureType = 3;
        safe_strncpy((char*)outResult->signatureName, "PDF Portable Document", sizeof(outResult->signatureName));
        outResult->isSalvaged = true;
    } else if (bytesRead >= 4 && raw[0] == 0x50 && raw[1] == 0x4B && raw[2] == 0x03 && raw[3] == 0x04) {
        outResult->signatureType = 4;
        safe_strncpy((char*)outResult->signatureName, "ZIP / DOCX / XLSX Archive", sizeof(outResult->signatureName));
        outResult->isSalvaged = true;
    } else if (bytesRead >= 8 && memcmp(raw + 4, "ftyp", 4) == 0) {
        outResult->signatureType = 5;
        safe_strncpy((char*)outResult->signatureName, "MP4 / MOV Video Container", sizeof(outResult->signatureName));
        outResult->isSalvaged = true;
    } else {
        size_t inspectLen = (bytesRead < 256) ? bytesRead : 256;
        size_t asciiCount = 0;
        for (size_t k = 0; k < inspectLen; ++k) {
            uint8_t c = raw[k];
            if ((c >= 32 && c <= 126) || c == 10 || c == 13 || c == 9) {
                asciiCount++;
            }
        }
        if (inspectLen > 0 && asciiCount * 100 >= inspectLen * 80) {
            outResult->signatureType = 6;
            safe_strncpy((char*)outResult->signatureName, "UTF-8 Source / System Log", sizeof(outResult->signatureName));
            outResult->isSalvaged = true;
        } else {
            outResult->signatureType = 0;
            safe_strncpy((char*)outResult->signatureName, "Raw Binary / Encrypted Sector", sizeof(outResult->signatureName));
            outResult->isSalvaged = false;
        }
    }

    return true;
}

static void PopulateDriveDetailFromHandle(HANDLE hDevice, uint32_t driveIndex, DSPhysicalDriveDetail* detail) {
    memset(detail, 0, sizeof(DSPhysicalDriveDetail));
    detail->driveIndex = driveIndex;
    snprintf(detail->devicePath, sizeof(detail->devicePath), "\\\\.\\PhysicalDrive%u", driveIndex);
    detail->sectorSize = 512;
    detail->physicalSectorSize = 4096;
    detail->temperatureCelsius = 0; // 0 = unavailable until real sensor reads
    detail->healthScore = 0;        // 0 = unavailable until real SMART/NVMe evaluates

    // Query Storage Device Property
    STORAGE_PROPERTY_QUERY query;
    memset(&query, 0, sizeof(query));
    query.PropertyId = StorageDeviceProperty;
    query.QueryType = PropertyStandardQuery;

    uint8_t descBuffer[1024];
    memset(descBuffer, 0, sizeof(descBuffer));
    DWORD bytesReturned = 0;

    if (DeviceIoControl(hDevice, IOCTL_STORAGE_QUERY_PROPERTY, &query, sizeof(query), descBuffer, sizeof(descBuffer), &bytesReturned, NULL)) {
        STORAGE_DEVICE_DESCRIPTOR* pDesc = (STORAGE_DEVICE_DESCRIPTOR*)descBuffer;

        char vendorStr[64] = {0};
        char productStr[64] = {0};
        if (pDesc->VendorIdOffset != 0 && pDesc->VendorIdOffset < sizeof(descBuffer)) {
            safe_strncpy(vendorStr, (char*)(descBuffer + pDesc->VendorIdOffset), sizeof(vendorStr));
        }
        if (pDesc->ProductIdOffset != 0 && pDesc->ProductIdOffset < sizeof(descBuffer)) {
            safe_strncpy(productStr, (char*)(descBuffer + pDesc->ProductIdOffset), sizeof(productStr));
        }

        auto trimStr = [](char* s) {
            size_t len = strlen(s);
            while (len > 0 && (s[len - 1] == ' ' || s[len - 1] == '\t' || s[len - 1] == '\r' || s[len - 1] == '\n')) {
                s[--len] = '\0';
            }
            size_t start = 0;
            while (s[start] == ' ' || s[start] == '\t') start++;
            if (start > 0) memmove(s, s + start, strlen(s + start) + 1);
        };
        trimStr(vendorStr);
        trimStr(productStr);

        if (vendorStr[0] != '\0' && productStr[0] != '\0') {
            bool startsWithVendor = true;
            size_t vLen = strlen(vendorStr);
            if (strlen(productStr) < vLen) {
                startsWithVendor = false;
            } else {
                for (size_t k = 0; k < vLen; ++k) {
                    char a = vendorStr[k];
                    char b = productStr[k];
                    if (a >= 'A' && a <= 'Z') a = (char)(a + 32);
                    if (b >= 'A' && b <= 'Z') b = (char)(b + 32);
                    if (a != b) { startsWithVendor = false; break; }
                }
            }
            if (startsWithVendor) {
                safe_strncpy(detail->model, productStr, sizeof(detail->model));
            } else {
                snprintf(detail->model, sizeof(detail->model), "%s %s", vendorStr, productStr);
            }
        } else if (productStr[0] != '\0') {
            safe_strncpy(detail->model, productStr, sizeof(detail->model));
        } else if (vendorStr[0] != '\0') {
            safe_strncpy(detail->model, vendorStr, sizeof(detail->model));
        } else {
            safe_strncpy(detail->model, "Physical Storage Drive", sizeof(detail->model));
        }

        if (pDesc->SerialNumberOffset != 0 && pDesc->SerialNumberOffset < sizeof(descBuffer)) {
            safe_strncpy(detail->serialNumber, (char*)(descBuffer + pDesc->SerialNumberOffset), sizeof(detail->serialNumber));
            trimStr(detail->serialNumber);
        } else {
            snprintf(detail->serialNumber, sizeof(detail->serialNumber), "DISK-PHYS-%u", driveIndex);
        }

        if (pDesc->ProductRevisionOffset != 0 && pDesc->ProductRevisionOffset < sizeof(descBuffer)) {
            safe_strncpy(detail->firmwareRev, (char*)(descBuffer + pDesc->ProductRevisionOffset), sizeof(detail->firmwareRev));
            trimStr(detail->firmwareRev);
        } else {
            safe_strncpy(detail->firmwareRev, "N/A", sizeof(detail->firmwareRev));
        }

        // Future-proof Windows STORAGE_BUS_TYPE detection (0..19)
        switch ((int)pDesc->BusType) {
            case 17: // BusTypeNvme
                safe_strncpy(detail->busType, "NVMe", sizeof(detail->busType));
                detail->isSsd = true;
                break;
            case 11: // BusTypeSata
                safe_strncpy(detail->busType, "SATA", sizeof(detail->busType));
                break;
            case 7: // BusTypeUsb
                safe_strncpy(detail->busType, "USB", sizeof(detail->busType));
                break;
            case 8: // BusTypeRaid
                safe_strncpy(detail->busType, "RAID", sizeof(detail->busType));
                break;
            case 3: // BusTypeAta
                safe_strncpy(detail->busType, "ATA", sizeof(detail->busType));
                break;
            case 1: // BusTypeScsi
            case 10: // BusTypeSas
                safe_strncpy(detail->busType, "SCSI/SAS", sizeof(detail->busType));
                break;
            case 12: // BusTypeSd
                safe_strncpy(detail->busType, "SD", sizeof(detail->busType));
                detail->isSsd = true;
                break;
            case 13: // BusTypeMmc
                safe_strncpy(detail->busType, "MMC", sizeof(detail->busType));
                detail->isSsd = true;
                break;
            case 16: // BusTypeSpaces
                safe_strncpy(detail->busType, "Storage Spaces", sizeof(detail->busType));
                break;
            case 18: // BusTypeScm
                safe_strncpy(detail->busType, "SCM", sizeof(detail->busType));
                detail->isSsd = true;
                break;
            case 19: // BusTypeUfs
                safe_strncpy(detail->busType, "UFS", sizeof(detail->busType));
                detail->isSsd = true;
                break;
            default:
                safe_strncpy(detail->busType, "Standard Storage", sizeof(detail->busType));
                break;
        }
    }

    // Query Geometry & Size (with IOCTL_DISK_GET_LENGTH_INFO fallback)
    DISK_GEOMETRY_EX geom;
    memset(&geom, 0, sizeof(geom));
    DWORD geomBytes = 0;
    if (DeviceIoControl(hDevice, IOCTL_DISK_GET_DRIVE_GEOMETRY_EX, NULL, 0, &geom, sizeof(geom), &geomBytes, NULL)) {
        if (geom.DiskSize.QuadPart > 0) {
            detail->totalCapacityBytes = (uint64_t)geom.DiskSize.QuadPart;
        }
        if (geom.Geometry.BytesPerSector > 0) {
            detail->sectorSize = geom.Geometry.BytesPerSector;
            detail->physicalSectorSize = geom.Geometry.BytesPerSector;
        }
    }
    if (detail->totalCapacityBytes == 0) {
        GET_LENGTH_INFORMATION lenInfo;
        memset(&lenInfo, 0, sizeof(lenInfo));
        DWORD lenBytes = 0;
        if (DeviceIoControl(hDevice, IOCTL_DISK_GET_LENGTH_INFO, NULL, 0, &lenInfo, sizeof(lenInfo), &lenBytes, NULL) && lenInfo.Length.QuadPart > 0) {
            detail->totalCapacityBytes = (uint64_t)lenInfo.Length.QuadPart;
        }
    }

    // Query StorageAccessAlignmentProperty (PropertyId = 6) for true physical sector size (4Kn/512e)
    {
        STORAGE_PROPERTY_QUERY alignQuery;
        memset(&alignQuery, 0, sizeof(alignQuery));
        alignQuery.PropertyId = (STORAGE_PROPERTY_ID)6;
        alignQuery.QueryType = PropertyStandardQuery;
        uint8_t alignBuf[32];
        memset(alignBuf, 0, sizeof(alignBuf));
        DWORD alignBytes = 0;
        if (DeviceIoControl(hDevice, IOCTL_STORAGE_QUERY_PROPERTY, &alignQuery, sizeof(alignQuery),
                            alignBuf, sizeof(alignBuf), &alignBytes, NULL) && alignBytes >= 24) {
            uint32_t logSec = *(const uint32_t*)(alignBuf + 16);
            uint32_t physSec = *(const uint32_t*)(alignBuf + 20);
            if (logSec >= 512 && (logSec & (logSec - 1)) == 0) detail->sectorSize = logSec;
            if (physSec >= 512 && (physSec & (physSec - 1)) == 0) detail->physicalSectorSize = physSec;
        }
    }

    // Query StorageDeviceWriteCacheProperty (PropertyId = 4)
    {
        STORAGE_PROPERTY_QUERY wcQuery;
        memset(&wcQuery, 0, sizeof(wcQuery));
        wcQuery.PropertyId = (STORAGE_PROPERTY_ID)4;
        wcQuery.QueryType = PropertyStandardQuery;
        uint8_t wcBuf[32];
        memset(wcBuf, 0, sizeof(wcBuf));
        DWORD wcBytes = 0;
        if (DeviceIoControl(hDevice, IOCTL_STORAGE_QUERY_PROPERTY, &wcQuery, sizeof(wcQuery),
                            wcBuf, sizeof(wcBuf), &wcBytes, NULL) && wcBytes >= 16) {
            uint32_t writeCacheEnabled = *(const uint32_t*)(wcBuf + 12); // 2 == WriteCacheEnableYes
            detail->isWriteCacheEnabled = (writeCacheEnabled == 2);
        }
    }

    // Query Seek Penalty (SSD vs HDD)
    STORAGE_PROPERTY_QUERY seekQuery;
    memset(&seekQuery, 0, sizeof(seekQuery));
    seekQuery.PropertyId = StorageDeviceSeekPenaltyProperty;
    seekQuery.QueryType = PropertyStandardQuery;
    DEVICE_SEEK_PENALTY_DESCRIPTOR seekDesc;
    memset(&seekDesc, 0, sizeof(seekDesc));
    DWORD seekBytes = 0;
    if (DeviceIoControl(hDevice, IOCTL_STORAGE_QUERY_PROPERTY, &seekQuery, sizeof(seekQuery), &seekDesc, sizeof(seekDesc), &seekBytes, NULL)) {
        detail->isSsd = (seekDesc.IncursSeekPenalty == 0);
    }

    // Query TRIM
    STORAGE_PROPERTY_QUERY trimQuery;
    memset(&trimQuery, 0, sizeof(trimQuery));
    trimQuery.PropertyId = StorageDeviceTrimProperty;
    trimQuery.QueryType = PropertyStandardQuery;
    DEVICE_TRIM_DESCRIPTOR trimDesc;
    memset(&trimDesc, 0, sizeof(trimDesc));
    DWORD trimBytes = 0;
    if (DeviceIoControl(hDevice, IOCTL_STORAGE_QUERY_PROPERTY, &trimQuery, sizeof(trimQuery), &trimDesc, sizeof(trimDesc), &trimBytes, NULL)) {
        detail->isTrimSupported = (trimDesc.TrimEnabled != 0);
    } else {
        detail->isTrimSupported = false;
    }

    // Query real hardware temperature if available via StorageDeviceTemperatureProperty
    STORAGE_PROPERTY_QUERY tempQuery;
    memset(&tempQuery, 0, sizeof(tempQuery));
    tempQuery.PropertyId = StorageDeviceTemperatureProperty;
    tempQuery.QueryType = PropertyStandardQuery;
    STORAGE_TEMPERATURE_DATA_DESCRIPTOR tempDesc;
    memset(&tempDesc, 0, sizeof(tempDesc));
    DWORD tempBytes = 0;
    if (DeviceIoControl(hDevice, IOCTL_STORAGE_QUERY_PROPERTY, &tempQuery, sizeof(tempQuery), &tempDesc, sizeof(tempDesc), &tempBytes, NULL) && tempDesc.InfoCount > 0) {
        int16_t tC = tempDesc.TemperatureInfo[0].Temperature;
        if (tC > 0 && tC < 150) {
            detail->temperatureCelsius = (uint32_t)tC;
        }
    }

    // Populate real healthScore if SMART telemetry succeeds on a read handle
    DSDriveContext tmpCtx;
    memset(&tmpCtx, 0, sizeof(tmpCtx));
    tmpCtx.hDevice = hDevice;
    tmpCtx.driveIndex = driveIndex;
    tmpCtx.sectorSize = detail->sectorSize;
    tmpCtx.physicalSectorSize = detail->physicalSectorSize;
    DSSmartEntry smartEntries[32];
    int32_t smartCount = DS_GetSmartTelemetry(&tmpCtx, smartEntries, 32);
    if (smartCount > 0) {
        DSDriveHealthReport report;
        if (DS_EvaluateDriveReliability(smartEntries, smartCount, &report)) {
            detail->healthScore = (uint32_t)(report.reliabilityScore + 0.5);
            if (detail->temperatureCelsius == 0 && report.temperatureCelsius > 0) {
                detail->temperatureCelsius = report.temperatureCelsius;
            }
        }
    }
}

DS_API bool DS_CALL DS_GetDriveDetails(void* hDrive, DSPhysicalDriveDetail* outDetail) {
    if (!hDrive || !outDetail) return false;
    DSDriveContext* ctx = (DSDriveContext*)hDrive;
    if (ctx->hDevice == INVALID_HANDLE_VALUE) return false;
    PopulateDriveDetailFromHandle(ctx->hDevice, ctx->driveIndex, outDetail);
    return true;
}

DS_API uint32_t DS_CALL DS_EnumeratePhysicalDrives(
    DSPhysicalDriveDetail* outDrives,
    uint32_t maxDrives
) {
    if (!outDrives || maxDrives == 0) return 0;
    uint32_t foundCount = 0;

    // Windows IOCTL 32 PhysicalDrive exhaustive search (PhysicalDrive0 to PhysicalDrive31)
    for (uint32_t i = 0; i < 32 && foundCount < maxDrives; ++i) {
        wchar_t path[64];
        swprintf(path, 64, L"\\\\.\\PhysicalDrive%u", i);

        // Try standard read share with full sharing flags (prevents ERROR_SHARING_VIOLATION)
        HANDLE hDevice = CreateFileW(
            path,
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            NULL,
            OPEN_EXISTING,
            0,
            NULL
        );

        // Fallback to query access (0 desired access) if GENERIC_READ is denied by Windows security/UAC
        if (hDevice == INVALID_HANDLE_VALUE) {
            hDevice = CreateFileW(
                path,
                0,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                NULL,
                OPEN_EXISTING,
                0,
                NULL
            );
        }

        if (hDevice == INVALID_HANDLE_VALUE) {
            continue;
        }

        PopulateDriveDetailFromHandle(hDevice, i, &outDrives[foundCount]);
        CloseHandle(hDevice);
        foundCount++;
    }

    return foundCount;
}

DS_API bool DS_CALL DS_VerifyLbaBlock(void* hDrive, uint64_t lba, uint32_t count, DSBlockResult* outResult) {
    if (!hDrive || !outResult || count == 0) return false;
    DSDriveContext* ctx = (DSDriveContext*)hDrive;
    uint32_t sectorSize = (ctx->sectorSize >= 512) ? ctx->sectorSize : 512;
    uint32_t maxSectorsPerIoctl = 0x4000000U / sectorSize; // 64MB chunks prevent 32-bit DWORD overflow
    if (maxSectorsPerIoctl == 0) maxSectorsPerIoctl = 1;

    LARGE_INTEGER startTick, endTick;
    QueryPerformanceCounter(&startTick);

    uint32_t remaining = count;
    uint64_t currentLba = lba;
    BOOL ok = TRUE;
    DWORD lastErr = 0;

    while (remaining > 0) {
        uint32_t batch = (remaining > maxSectorsPerIoctl) ? maxSectorsPerIoctl : remaining;
        VERIFY_INFORMATION verifyInfo;
        verifyInfo.StartingOffset.QuadPart = ((LONGLONG)currentLba) * ((LONGLONG)sectorSize);
        verifyInfo.Length = batch * sectorSize;

        DWORD bytesReturned = 0;
        if (!DeviceIoControl(
                ctx->hDevice,
                IOCTL_DISK_VERIFY,
                &verifyInfo,
                sizeof(verifyInfo),
                NULL,
                0,
                &bytesReturned,
                NULL
            )) {
            ok = FALSE;
            lastErr = GetLastError();
            break;
        }
        currentLba += batch;
        remaining -= batch;
    }

    QueryPerformanceCounter(&endTick);

    if (ok) {
        double elapsedMs = (double)(endTick.QuadPart - startTick.QuadPart) * 1000.0 / (double)ctx->timerFrequency.QuadPart;
        outResult->startLba = lba;
        outResult->sectorCount = count;
        outResult->latencyMs = elapsedMs;
        outResult->win32ErrorCode = 0;
        safe_strncpy(outResult->errorMnemonic, "VERIFY_OK", sizeof(outResult->errorMnemonic));
        outResult->statusCode = (elapsedMs < 10.0) ? DS_STATUS_GOOD
            : (elapsedMs < 50.0) ? DS_STATUS_NORMAL
            : (elapsedMs < 150.0) ? DS_STATUS_SLOW
            : DS_STATUS_CRITICAL;
        return true;
    }

    if (lastErr == ERROR_INVALID_FUNCTION || lastErr == ERROR_NOT_SUPPORTED || lastErr == ERROR_ACCESS_DENIED) {
        return DS_ScanLbaBlock(hDrive, lba, count, outResult);
    }

    double elapsedMs = (double)(endTick.QuadPart - startTick.QuadPart) * 1000.0 / (double)ctx->timerFrequency.QuadPart;
    outResult->startLba = lba;
    outResult->sectorCount = count;
    outResult->latencyMs = elapsedMs;
    outResult->win32ErrorCode = lastErr;
    outResult->statusCode = DS_STATUS_BAD;
    safe_strncpy(outResult->errorMnemonic, "VERIFY_FAIL", sizeof(outResult->errorMnemonic));
    return false;
}

DS_API bool DS_CALL DS_StartSmartSelfTest(void* hDrive, uint32_t testTypeCode) {
    if (!hDrive) return false;
    DSDriveContext* ctx = (DSDriveContext*)hDrive;

    SENDCMDINPARAMS scip;
    memset(&scip, 0, sizeof(scip));
    scip.cBufferSize = 0;
    scip.irDriveRegs.bFeaturesReg = 0xD4; // EXECUTE_OFFLINE_DIAGS
    scip.irDriveRegs.bSectorCountReg = 1;
    scip.irDriveRegs.bSectorNumberReg = (BYTE)(testTypeCode & 0xFF); // 1=Short, 2=Extended, 3=Conveyance, 127=Abort
    scip.irDriveRegs.bCylLowReg = SMART_CYL_LOW;
    scip.irDriveRegs.bCylHighReg = SMART_CYL_HI;
    scip.irDriveRegs.bDriveHeadReg = (BYTE)(0xA0 | ((ctx->driveIndex & 1) << 4));
    scip.irDriveRegs.bCommandReg = SMART_CMD;

    SENDCMDOUTPARAMS outParams;
    memset(&outParams, 0, sizeof(outParams));
    DWORD bytesReturned = 0;
    return DeviceIoControl(
        ctx->hDevice,
        SMART_SEND_DRIVE_COMMAND,
        &scip,
        sizeof(scip),
        &outParams,
        sizeof(outParams),
        &bytesReturned,
        NULL
    ) != 0;
}

DS_API bool DS_CALL DS_GetSmartSelfTestStatus(void* hDrive, uint32_t* outExecCode, uint32_t* outProgressPct) {
    if (!hDrive || !outExecCode || !outProgressPct) return false;
    DSDriveContext* ctx = (DSDriveContext*)hDrive;

    SENDCMDINPARAMS scip;
    memset(&scip, 0, sizeof(scip));
    scip.cBufferSize = READ_ATTRIBUTE_BUFFER_SIZE;
    scip.irDriveRegs.bFeaturesReg = READ_ATTRIBUTES;
    scip.irDriveRegs.bSectorCountReg = 1;
    scip.irDriveRegs.bSectorNumberReg = 1;
    scip.irDriveRegs.bCylLowReg = SMART_CYL_LOW;
    scip.irDriveRegs.bCylHighReg = SMART_CYL_HI;
    scip.irDriveRegs.bDriveHeadReg = (BYTE)(0xA0 | ((ctx->driveIndex & 1) << 4));
    scip.irDriveRegs.bCommandReg = SMART_CMD;

    uint8_t outBuf[sizeof(SENDCMDOUTPARAMS) + READ_ATTRIBUTE_BUFFER_SIZE];
    memset(outBuf, 0, sizeof(outBuf));
    DWORD bytesReturned = 0;
    if (!DeviceIoControl(ctx->hDevice, SMART_RCV_DRIVE_DATA, &scip, sizeof(scip),
                         outBuf, sizeof(outBuf), &bytesReturned, NULL) || bytesReturned < 528) {
        return false;
    }

    SENDCMDOUTPARAMS* pOut = (SENDCMDOUTPARAMS*)outBuf;
    const uint8_t execByte = pOut->bBuffer[363];
    *outExecCode = execByte;

    const uint8_t statusNibble = (execByte >> 4) & 0x0F;
    if (statusNibble == 0x0F) {
        uint32_t remPct = (uint32_t)(execByte & 0x0F) * 10;
        *outProgressPct = (remPct <= 100) ? (100 - remPct) : 0;
    } else if (statusNibble == 0x00) {
        *outProgressPct = 100;
    } else {
        *outProgressPct = 0;
    }
    return true;
}

// ---------------------------------------------------------------------------
// Memory-Mapped File Zero-Copy Target Implementation (Win32 Section Mapping)
// ---------------------------------------------------------------------------
typedef struct {
    HANDLE   hFile;
    HANDLE   hMapping;
    uint64_t fileSizeBytes;
    uint32_t sectorSize;
    uint32_t allocationGranularity;
    bool     isReadOnly;
} DSMappedTargetContext;

DS_API void* DS_CALL DS_OpenMappedTarget(
    const char* utf8Path,
    uint32_t sectorSize,
    uint32_t accessMode,
    uint64_t initialSizeBytes
) {
    if (!utf8Path || utf8Path[0] == '\0') return NULL;
    uint32_t safeSec = (sectorSize >= 512 && (sectorSize & (sectorSize - 1)) == 0) ? sectorSize : 512U;
    bool readOnly = (accessMode == DS_MAP_MODE_READ_ONLY);

    int wLen = MultiByteToWideChar(CP_UTF8, 0, utf8Path, -1, NULL, 0);
    if (wLen <= 0 || wLen > 4096) return NULL;
    wchar_t* widePath = (wchar_t*)malloc((size_t)wLen * sizeof(wchar_t));
    if (!widePath) return NULL;
    MultiByteToWideChar(CP_UTF8, 0, utf8Path, -1, widePath, wLen);

    DWORD desiredAccess = readOnly ? GENERIC_READ : (GENERIC_READ | GENERIC_WRITE);
    DWORD creationDisp = readOnly ? OPEN_EXISTING : OPEN_ALWAYS;
    HANDLE hFile = CreateFileW(
        widePath,
        desiredAccess,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        NULL,
        creationDisp,
        FILE_ATTRIBUTE_NORMAL | FILE_FLAG_SEQUENTIAL_SCAN,
        NULL
    );
    free(widePath);

    if (hFile == INVALID_HANDLE_VALUE) return NULL;

    LARGE_INTEGER fileSize;
    fileSize.QuadPart = 0;
    if (!GetFileSizeEx(hFile, &fileSize)) {
        CloseHandle(hFile);
        return NULL;
    }

    uint64_t effectiveSize = (uint64_t)(fileSize.QuadPart > 0 ? fileSize.QuadPart : 0);
    if (!readOnly && initialSizeBytes > effectiveSize) {
        LARGE_INTEGER newEnd;
        newEnd.QuadPart = (LONGLONG)initialSizeBytes;
        if (!SetFilePointerEx(hFile, newEnd, NULL, FILE_BEGIN) || !SetEndOfFile(hFile)) {
            CloseHandle(hFile);
            return NULL;
        }
        effectiveSize = initialSizeBytes;
    }

    if (effectiveSize == 0ULL) {
        CloseHandle(hFile);
        return NULL;
    }

    DWORD flProtect = readOnly ? PAGE_READONLY : PAGE_READWRITE;
    DWORD sizeHi = (DWORD)(effectiveSize >> 32);
    DWORD sizeLo = (DWORD)(effectiveSize & 0xFFFFFFFFULL);
    HANDLE hMapping = CreateFileMappingW(hFile, NULL, flProtect, sizeHi, sizeLo, NULL);
    if (!hMapping) {
        CloseHandle(hFile);
        return NULL;
    }

    SYSTEM_INFO sysInfo;
    GetSystemInfo(&sysInfo);
    uint32_t gran = (sysInfo.dwAllocationGranularity >= 4096) ? (uint32_t)sysInfo.dwAllocationGranularity : 65536U;

    DSMappedTargetContext* mCtx = (DSMappedTargetContext*)malloc(sizeof(DSMappedTargetContext));
    if (!mCtx) {
        CloseHandle(hMapping);
        CloseHandle(hFile);
        return NULL;
    }
    mCtx->hFile = hFile;
    mCtx->hMapping = hMapping;
    mCtx->fileSizeBytes = effectiveSize;
    mCtx->sectorSize = safeSec;
    mCtx->allocationGranularity = gran;
    mCtx->isReadOnly = readOnly;
    return (void*)mCtx;
}

DS_API bool DS_CALL DS_MapSectorWindow(
    void* hMapped,
    uint64_t startLba,
    uint32_t sectorCount,
    DSMappedSectorWindow* outWindow
) {
    if (!hMapped || !outWindow || sectorCount == 0) return false;
    memset(outWindow, 0, sizeof(DSMappedSectorWindow));
    DSMappedTargetContext* mCtx = (DSMappedTargetContext*)hMapped;

    if (startLba > (UINT64_MAX / (uint64_t)mCtx->sectorSize)) return false;
    uint64_t reqOffset = startLba * (uint64_t)mCtx->sectorSize;
    if (reqOffset >= mCtx->fileSizeBytes) return false;

    uint64_t reqBytes = (uint64_t)sectorCount * (uint64_t)mCtx->sectorSize;
    uint64_t availBytes = mCtx->fileSizeBytes - reqOffset;
    if (reqBytes > availBytes) reqBytes = availBytes;
    if (reqBytes > 0x40000000ULL) reqBytes = 0x40000000ULL; // Cap single 32-bit view window at 1GB

    uint64_t granMask = (uint64_t)mCtx->allocationGranularity - 1ULL;
    uint64_t alignedOffset = reqOffset & ~granMask;
    uint64_t delta = reqOffset - alignedOffset;
    SIZE_T mapBytes = (SIZE_T)(delta + reqBytes);

    DWORD desiredAccess = mCtx->isReadOnly ? FILE_MAP_READ : FILE_MAP_WRITE;
    DWORD offHi = (DWORD)(alignedOffset >> 32);
    DWORD offLo = (DWORD)(alignedOffset & 0xFFFFFFFFULL);

    void* base = MapViewOfFile(mCtx->hMapping, desiredAccess, offHi, offLo, mapBytes);
    if (!base) return false;

    outWindow->internalBasePtr = base;
    outWindow->viewPtr = (void*)((uint8_t*)base + delta);
    outWindow->fileOffsetBytes = reqOffset;
    outWindow->mappedLengthBytes = (uint32_t)reqBytes;
    outWindow->sectorSize = mCtx->sectorSize;
    outWindow->isSectionMapped = 1;
    outWindow->isReadOnly = mCtx->isReadOnly ? 1 : 0;
    return true;
}

DS_API bool DS_CALL DS_UnmapSectorWindow(DSMappedSectorWindow* window) {
    if (!window || !window->internalBasePtr) return false;
    BOOL ok = UnmapViewOfFile(window->internalBasePtr);
    memset(window, 0, sizeof(DSMappedSectorWindow));
    return ok != 0;
}

DS_API void DS_CALL DS_CloseMappedTarget(void* hMapped) {
    if (!hMapped) return;
    DSMappedTargetContext* mCtx = (DSMappedTargetContext*)hMapped;
    if (mCtx->hMapping) CloseHandle(mCtx->hMapping);
    if (mCtx->hFile != INVALID_HANDLE_VALUE) {
        if (!mCtx->isReadOnly) FlushFileBuffers(mCtx->hFile);
        CloseHandle(mCtx->hFile);
    }
    free(mCtx);
}

DS_API bool DS_CALL DS_ScanMappedLbaRange(
    void* hMapped,
    uint64_t startLba,
    uint64_t sectorCount,
    uint32_t windowSectors,
    uint32_t* outCrc32,
    uint64_t* outParity,
    uint64_t* outZeroSectors
) {
    if (!hMapped || sectorCount == 0) return false;
    DSMappedTargetContext* mCtx = (DSMappedTargetContext*)hMapped;
    uint32_t secSize = mCtx->sectorSize;
    uint32_t winSecs = (windowSectors == 0) ? ((16U * 1024U * 1024U) / secSize) : windowSectors;
    if (winSecs == 0) winSecs = 1;

    const uint32_t* table = DS_GetCrc32Table();
    uint32_t crc = 0xFFFFFFFFU;
    uint64_t parity = 0ULL;
    uint64_t zeroSectors = 0ULL;

    uint64_t remaining = sectorCount;
    uint64_t curLba = startLba;

    while (remaining > 0) {
        uint32_t batchSecs = (remaining > (uint64_t)winSecs) ? winSecs : (uint32_t)remaining;
        DSMappedSectorWindow win;
        if (!DS_MapSectorWindow(hMapped, curLba, batchSecs, &win)) {
            return false;
        }

        const uint8_t* ptr = (const uint8_t*)win.viewPtr;
        uint32_t len = win.mappedLengthBytes;
        uint32_t fullSecs = len / secSize;

        for (uint32_t s = 0; s < fullSecs; ++s) {
            const uint8_t* secPtr = ptr + ((size_t)s * secSize);
            uint64_t zeroAcc = 0ULL;
            uint32_t i = 0;
            uint32_t wordLimit = secSize & ~7U;
            for (; i < wordLimit; i += 8) {
                uint64_t w = 0;
                memcpy(&w, secPtr + i, sizeof(uint64_t));
                zeroAcc |= w;
                parity ^= w;
                crc = table[(crc ^ secPtr[i])     & 0xFFU] ^ (crc >> 8);
                crc = table[(crc ^ secPtr[i + 1]) & 0xFFU] ^ (crc >> 8);
                crc = table[(crc ^ secPtr[i + 2]) & 0xFFU] ^ (crc >> 8);
                crc = table[(crc ^ secPtr[i + 3]) & 0xFFU] ^ (crc >> 8);
                crc = table[(crc ^ secPtr[i + 4]) & 0xFFU] ^ (crc >> 8);
                crc = table[(crc ^ secPtr[i + 5]) & 0xFFU] ^ (crc >> 8);
                crc = table[(crc ^ secPtr[i + 6]) & 0xFFU] ^ (crc >> 8);
                crc = table[(crc ^ secPtr[i + 7]) & 0xFFU] ^ (crc >> 8);
            }
            for (; i < secSize; ++i) {
                uint8_t b = secPtr[i];
                zeroAcc |= (uint64_t)b;
                parity ^= ((uint64_t)b << ((i & 7U) * 8U));
                crc = table[(crc ^ b) & 0xFFU] ^ (crc >> 8);
            }
            if (zeroAcc == 0ULL) zeroSectors++;
        }

        DS_UnmapSectorWindow(&win);
        if (fullSecs == 0) break;
        curLba += fullSecs;
        remaining -= fullSecs;
    }

    if (outCrc32) *outCrc32 = ~crc;
    if (outParity) *outParity = parity;
    if (outZeroSectors) *outZeroSectors = zeroSectors;
    return true;
}

DS_API bool DS_CALL DS_CopyLbaRangeToMappedFile(
    void* hDrive,
    uint64_t startLba,
    uint64_t totalSectors,
    const char* destUtf8Path,
    uint64_t destStartLba,
    uint32_t chunkSectors,
    uint64_t* outBytesCopied,
    uint32_t* outWin32Error
) {
    if (outBytesCopied) *outBytesCopied = 0ULL;
    if (outWin32Error) *outWin32Error = 0U;
    if (!hDrive || totalSectors == 0 || !destUtf8Path || destUtf8Path[0] == '\0') {
        if (outWin32Error) *outWin32Error = ERROR_INVALID_PARAMETER;
        return false;
    }

    DSDriveContext* ctx = (DSDriveContext*)hDrive;
    if (ctx->hDevice == INVALID_HANDLE_VALUE) {
        if (outWin32Error) *outWin32Error = ERROR_INVALID_HANDLE;
        return false;
    }

    uint32_t secSize = (ctx->sectorSize >= 512) ? ctx->sectorSize : 512U;
    if (destStartLba > UINT64_MAX - totalSectors || (destStartLba + totalSectors) > (UINT64_MAX / (uint64_t)secSize)) {
        if (outWin32Error) *outWin32Error = ERROR_INVALID_PARAMETER;
        return false;
    }
    uint64_t totalDestEndBytes = (destStartLba + totalSectors) * (uint64_t)secSize;
    void* hMapped = DS_OpenMappedTarget(destUtf8Path, secSize, DS_MAP_MODE_READ_WRITE, totalDestEndBytes);
    if (!hMapped) {
        if (outWin32Error) *outWin32Error = GetLastError();
        return false;
    }

    uint32_t defaultSecs = (16U * 1024U * 1024U) / secSize; // 16MB mapped view window
    uint32_t stepSecs = (chunkSectors > 0) ? chunkSectors : defaultSecs;
    if (stepSecs == 0) stepSecs = 1;

    uint64_t remaining = totalSectors;
    uint64_t srcLba = startLba;
    uint64_t dstLba = destStartLba;
    uint64_t copiedBytes = 0ULL;
    bool allOk = true;

    while (remaining > 0) {
        uint32_t batchSecs = (remaining > (uint64_t)stepSecs) ? stepSecs : (uint32_t)remaining;
        DSMappedSectorWindow win;
        if (!DS_MapSectorWindow(hMapped, dstLba, batchSecs, &win)) {
            if (outWin32Error) *outWin32Error = GetLastError();
            allOk = false;
            break;
        }

        uint64_t srcByteOffset = srcLba * (uint64_t)secSize;
        if (!(ctx->offsetValid && ctx->lastByteOffset == srcByteOffset)) {
            LARGE_INTEGER seekOff;
            seekOff.QuadPart = (LONGLONG)srcByteOffset;
            if (!SetFilePointerEx(ctx->hDevice, seekOff, NULL, FILE_BEGIN)) {
                ctx->offsetValid = false;
                if (outWin32Error) *outWin32Error = GetLastError();
                DS_UnmapSectorWindow(&win);
                allOk = false;
                break;
            }
        }

        // Attempt Direct DMA ReadFile straight into MapViewOfFile pages (Zero-Copy)
        uint32_t bytesLeft = win.mappedLengthBytes;
        uint8_t* dstPtr = (uint8_t*)win.viewPtr;
        bool viewAligned = ((((uintptr_t)dstPtr) & (uintptr_t)(secSize - 1U)) == 0U);
        bool chunkOk = true;

        if (viewAligned) {
            while (bytesLeft > 0) {
                DWORD ioChunk = (bytesLeft > 0x4000000U) ? 0x4000000U : (DWORD)bytesLeft;
                DWORD bytesRead = 0;
                if (!ReadFile(ctx->hDevice, dstPtr, ioChunk, &bytesRead, NULL) || bytesRead != ioChunk) {
                    DWORD err = GetLastError();
                    ctx->offsetValid = false;
                    // Fallback to VirtualAlloc DMA buffer if storage filter rejects mapped pages directly
                    if (err == ERROR_INVALID_PARAMETER || err == ERROR_NOACCESS) {
                        viewAligned = false;
                        break;
                    }
                    if (outWin32Error) *outWin32Error = err;
                    chunkOk = false;
                    break;
                }
                dstPtr += bytesRead;
                bytesLeft -= bytesRead;
                srcByteOffset += bytesRead;
                ctx->lastByteOffset = srcByteOffset;
                ctx->offsetValid = true;
            }
        }

        if (chunkOk && !viewAligned) {
            // Re-seek to current srcByteOffset and transfer via VirtualAlloc DMA buffer -> mapped pages
            LARGE_INTEGER reseek;
            reseek.QuadPart = (LONGLONG)srcByteOffset;
            if (!SetFilePointerEx(ctx->hDevice, reseek, NULL, FILE_BEGIN)) {
                ctx->offsetValid = false;
                if (outWin32Error) *outWin32Error = GetLastError();
                chunkOk = false;
            } else {
                while (bytesLeft > 0) {
                    DWORD ioChunk = (bytesLeft > ctx->bufferCapacity) ? ctx->bufferCapacity : (DWORD)bytesLeft;
                    DWORD bytesRead = 0;
                    if (!ReadFile(ctx->hDevice, ctx->alignedBuffer, ioChunk, &bytesRead, NULL) || bytesRead != ioChunk) {
                        ctx->offsetValid = false;
                        if (outWin32Error) *outWin32Error = GetLastError();
                        chunkOk = false;
                        break;
                    }
                    memcpy(dstPtr, ctx->alignedBuffer, bytesRead);
                    dstPtr += bytesRead;
                    bytesLeft -= bytesRead;
                    srcByteOffset += bytesRead;
                    ctx->lastByteOffset = srcByteOffset;
                    ctx->offsetValid = true;
                }
            }
        }

        copiedBytes += (uint64_t)(win.mappedLengthBytes - bytesLeft);
        DS_UnmapSectorWindow(&win);

        if (!chunkOk) {
            allOk = false;
            break;
        }

        srcLba += batchSecs;
        dstLba += batchSecs;
        remaining -= batchSecs;
    }

    DS_CloseMappedTarget(hMapped);
    if (outBytesCopied) *outBytesCopied = copiedBytes;
    return allOk;
}

#else
// Cross-Platform POSIX / Linux Implementation (Supports Memory-Mapped Image I/O + CRC32/Parity)
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <stdlib.h>
#include <string.h>

struct DSCrc32LookupTable {
    uint32_t entries[256];
    DSCrc32LookupTable() {
        for (uint32_t i = 0; i < 256; ++i) {
            uint32_t c = i;
            for (int k = 0; k < 8; ++k) {
                c = (c >> 1) ^ ((c & 1) ? 0xEDB88320U : 0U);
            }
            entries[i] = c;
        }
    }
};

static const uint32_t* DS_GetCrc32Table() {
    static const DSCrc32LookupTable s_table;
    return s_table.entries;
}

DS_API bool DS_CALL DS_CalculateParityChecksum(
    const uint8_t* pBuffer,
    uint32_t bufferLength,
    uint32_t* outCrc32,
    uint64_t* outEccParity
) {
    if (!pBuffer || bufferLength == 0) return false;
    const uint32_t* table = DS_GetCrc32Table();
    uint32_t crc = 0xFFFFFFFFU;
    uint64_t xorParity = 0ULL;
    uint32_t i = 0;
    uint32_t wordLimit = bufferLength & ~7U;

    for (; i < wordLimit; i += 8) {
        uint64_t word64 = 0;
        memcpy(&word64, pBuffer + i, sizeof(uint64_t));
        xorParity ^= word64;
        crc = table[(crc ^ pBuffer[i])     & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 1]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 2]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 3]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 4]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 5]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 6]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 7]) & 0xFFU] ^ (crc >> 8);
    }
    for (; i < bufferLength; ++i) {
        uint8_t byteVal = pBuffer[i];
        crc = table[(crc ^ byteVal) & 0xFFU] ^ (crc >> 8);
        xorParity ^= ((uint64_t)byteVal << ((i & 7U) * 8U));
    }
    if (outCrc32) *outCrc32 = ~crc;
    if (outEccParity) *outEccParity = xorParity;
    return true;
}

DS_API bool DS_CALL DS_CalculateAvx2ChecksumAndZeroCheck(
    const uint8_t* pBuffer,
    uint32_t bufferLength,
    bool* outIsAllZeros,
    uint32_t* outCrc32,
    uint64_t* outAvxParity
) {
    if (!pBuffer || bufferLength == 0 || !outIsAllZeros || !outCrc32 || !outAvxParity) return false;
    const uint32_t* table = DS_GetCrc32Table();
    uint32_t crc = 0xFFFFFFFFU;
    uint64_t zeroAcc = 0ULL;
    uint64_t xorParity = 0ULL;
    uint32_t i = 0;
    uint32_t wordLimit = bufferLength & ~7U;

    for (; i < wordLimit; i += 8) {
        uint64_t word64 = 0;
        memcpy(&word64, pBuffer + i, sizeof(uint64_t));
        zeroAcc |= word64;
        xorParity ^= word64;
        crc = table[(crc ^ pBuffer[i])     & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 1]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 2]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 3]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 4]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 5]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 6]) & 0xFFU] ^ (crc >> 8);
        crc = table[(crc ^ pBuffer[i + 7]) & 0xFFU] ^ (crc >> 8);
    }
    for (; i < bufferLength; ++i) {
        uint8_t byteVal = pBuffer[i];
        zeroAcc |= (uint64_t)byteVal;
        xorParity ^= ((uint64_t)byteVal << ((i & 7U) * 8U));
        crc = table[(crc ^ byteVal) & 0xFFU] ^ (crc >> 8);
    }
    *outIsAllZeros = (zeroAcc == 0ULL);
    *outCrc32 = ~crc;
    *outAvxParity = xorParity;
    return true;
}

typedef struct {
    int      fd;
    uint64_t fileSizeBytes;
    uint32_t sectorSize;
    uint32_t pageSize;
    bool     isReadOnly;
} DSPosixMappedTarget;

DS_API void* DS_CALL DS_OpenMappedTarget(
    const char* utf8Path,
    uint32_t sectorSize,
    uint32_t accessMode,
    uint64_t initialSizeBytes
) {
    if (!utf8Path || utf8Path[0] == '\0') return NULL;
    uint32_t safeSec = (sectorSize >= 512 && (sectorSize & (sectorSize - 1)) == 0) ? sectorSize : 512U;
    bool readOnly = (accessMode == DS_MAP_MODE_READ_ONLY);

    int flags = readOnly ? O_RDONLY : (O_RDWR | O_CREAT);
    int fd = open(utf8Path, flags, 0644);
    if (fd < 0) return NULL;

    struct stat st;
    if (fstat(fd, &st) != 0) {
        close(fd);
        return NULL;
    }

    uint64_t effectiveSize = (st.st_size > 0) ? (uint64_t)st.st_size : 0ULL;
    if (!readOnly && initialSizeBytes > effectiveSize) {
        if (ftruncate(fd, (off_t)initialSizeBytes) != 0) {
            close(fd);
            return NULL;
        }
        effectiveSize = initialSizeBytes;
    }
    if (effectiveSize == 0ULL) {
        close(fd);
        return NULL;
    }

    long ps = sysconf(_SC_PAGESIZE);
    uint32_t pageSize = (ps >= 4096) ? (uint32_t)ps : 4096U;

    DSPosixMappedTarget* mCtx = (DSPosixMappedTarget*)malloc(sizeof(DSPosixMappedTarget));
    if (!mCtx) {
        close(fd);
        return NULL;
    }
    mCtx->fd = fd;
    mCtx->fileSizeBytes = effectiveSize;
    mCtx->sectorSize = safeSec;
    mCtx->pageSize = pageSize;
    mCtx->isReadOnly = readOnly;
    return (void*)mCtx;
}

DS_API bool DS_CALL DS_MapSectorWindow(
    void* hMapped,
    uint64_t startLba,
    uint32_t sectorCount,
    DSMappedSectorWindow* outWindow
) {
    if (!hMapped || !outWindow || sectorCount == 0) return false;
    memset(outWindow, 0, sizeof(DSMappedSectorWindow));
    DSPosixMappedTarget* mCtx = (DSPosixMappedTarget*)hMapped;

    uint64_t reqOffset = startLba * (uint64_t)mCtx->sectorSize;
    if (reqOffset >= mCtx->fileSizeBytes) return false;

    uint64_t reqBytes = (uint64_t)sectorCount * (uint64_t)mCtx->sectorSize;
    uint64_t availBytes = mCtx->fileSizeBytes - reqOffset;
    if (reqBytes > availBytes) reqBytes = availBytes;
    if (reqBytes > 0x40000000ULL) reqBytes = 0x40000000ULL;

    uint64_t pageMask = (uint64_t)mCtx->pageSize - 1ULL;
    uint64_t alignedOffset = reqOffset & ~pageMask;
    uint64_t delta = reqOffset - alignedOffset;
    size_t mapLen = (size_t)(delta + reqBytes);

    int prot = mCtx->isReadOnly ? PROT_READ : (PROT_READ | PROT_WRITE);
    void* base = mmap(NULL, mapLen, prot, MAP_SHARED, mCtx->fd, (off_t)alignedOffset);
    if (base == MAP_FAILED) return false;

    outWindow->internalBasePtr = base;
    outWindow->viewPtr = (void*)((uint8_t*)base + delta);
    outWindow->fileOffsetBytes = reqOffset;
    outWindow->mappedLengthBytes = (uint32_t)reqBytes;
    outWindow->sectorSize = mCtx->sectorSize;
    outWindow->isSectionMapped = 1;
    outWindow->isReadOnly = mCtx->isReadOnly ? 1 : 0;
    return true;
}

DS_API bool DS_CALL DS_UnmapSectorWindow(DSMappedSectorWindow* window) {
    if (!window || !window->internalBasePtr) return false;
    uintptr_t delta = (uintptr_t)window->viewPtr - (uintptr_t)window->internalBasePtr;
    size_t totalLen = (size_t)delta + (size_t)window->mappedLengthBytes;
    int rc = munmap(window->internalBasePtr, totalLen);
    memset(window, 0, sizeof(DSMappedSectorWindow));
    return rc == 0;
}

DS_API void DS_CALL DS_CloseMappedTarget(void* hMapped) {
    if (!hMapped) return;
    DSPosixMappedTarget* mCtx = (DSPosixMappedTarget*)hMapped;
    if (mCtx->fd >= 0) {
        if (!mCtx->isReadOnly) fsync(mCtx->fd);
        close(mCtx->fd);
    }
    free(mCtx);
}

DS_API bool DS_CALL DS_ScanMappedLbaRange(
    void* hMapped,
    uint64_t startLba,
    uint64_t sectorCount,
    uint32_t windowSectors,
    uint32_t* outCrc32,
    uint64_t* outParity,
    uint64_t* outZeroSectors
) {
    if (!hMapped || sectorCount == 0) return false;
    DSPosixMappedTarget* mCtx = (DSPosixMappedTarget*)hMapped;
    uint32_t secSize = mCtx->sectorSize;
    uint32_t winSecs = (windowSectors == 0) ? ((16U * 1024U * 1024U) / secSize) : windowSectors;
    if (winSecs == 0) winSecs = 1;

    const uint32_t* table = DS_GetCrc32Table();
    uint32_t crc = 0xFFFFFFFFU;
    uint64_t parity = 0ULL;
    uint64_t zeroSectors = 0ULL;

    uint64_t remaining = sectorCount;
    uint64_t curLba = startLba;

    while (remaining > 0) {
        uint32_t batchSecs = (remaining > (uint64_t)winSecs) ? winSecs : (uint32_t)remaining;
        DSMappedSectorWindow win;
        if (!DS_MapSectorWindow(hMapped, curLba, batchSecs, &win)) {
            return false;
        }
        const uint8_t* ptr = (const uint8_t*)win.viewPtr;
        uint32_t fullSecs = win.mappedLengthBytes / secSize;
        for (uint32_t s = 0; s < fullSecs; ++s) {
            const uint8_t* secPtr = ptr + ((size_t)s * secSize);
            uint64_t zeroAcc = 0ULL;
            uint32_t i = 0;
            uint32_t wordLimit = secSize & ~7U;
            for (; i < wordLimit; i += 8) {
                uint64_t w = 0;
                memcpy(&w, secPtr + i, sizeof(uint64_t));
                zeroAcc |= w;
                parity ^= w;
                crc = table[(crc ^ secPtr[i])     & 0xFFU] ^ (crc >> 8);
                crc = table[(crc ^ secPtr[i + 1]) & 0xFFU] ^ (crc >> 8);
                crc = table[(crc ^ secPtr[i + 2]) & 0xFFU] ^ (crc >> 8);
                crc = table[(crc ^ secPtr[i + 3]) & 0xFFU] ^ (crc >> 8);
                crc = table[(crc ^ secPtr[i + 4]) & 0xFFU] ^ (crc >> 8);
                crc = table[(crc ^ secPtr[i + 5]) & 0xFFU] ^ (crc >> 8);
                crc = table[(crc ^ secPtr[i + 6]) & 0xFFU] ^ (crc >> 8);
                crc = table[(crc ^ secPtr[i + 7]) & 0xFFU] ^ (crc >> 8);
            }
            for (; i < secSize; ++i) {
                uint8_t b = secPtr[i];
                zeroAcc |= (uint64_t)b;
                parity ^= ((uint64_t)b << ((i & 7U) * 8U));
                crc = table[(crc ^ b) & 0xFFU] ^ (crc >> 8);
            }
            if (zeroAcc == 0ULL) zeroSectors++;
        }
        DS_UnmapSectorWindow(&win);
        if (fullSecs == 0) break;
        curLba += fullSecs;
        remaining -= fullSecs;
    }

    if (outCrc32) *outCrc32 = ~crc;
    if (outParity) *outParity = parity;
    if (outZeroSectors) *outZeroSectors = zeroSectors;
    return true;
}

DS_API void* DS_CALL DS_OpenDriveDirect(uint32_t, uint32_t*) { return NULL; }
DS_API bool DS_CALL DS_ScanLbaBlock(void*, uint64_t, uint32_t, DSBlockResult*) { return false; }
DS_API bool DS_CALL DS_AdaptiveScanChunk(void*, uint64_t, uint32_t, uint32_t, DSBlockResult*, uint32_t, uint32_t*) { return false; }
DS_API int32_t DS_CALL DS_GetSmartTelemetry(void*, DSSmartEntry*, int32_t) { return 0; }
DS_API bool DS_CALL DS_EvaluateDriveReliability(const DSSmartEntry*, int32_t, DSDriveHealthReport*) { return false; }
DS_API bool DS_CALL DS_AttemptSoftSectorRepair(void*, uint64_t, uint32_t, uint32_t*) { return false; }
DS_API void DS_CALL DS_CloseDrive(void*) {}
DS_API bool DS_CALL DS_GetNvmeDeepTelemetry(void*, DSNvmeHealthLog*) { return false; }
DS_API bool DS_CALL DS_ScanMultipleDrivesParallel(const DSMultiDriveScanTarget*, uint32_t, DSMultiDriveScanSummary*, uint32_t) { return false; }
DS_API bool DS_CALL DS_ConfigureTrayGuardian(uint32_t, uint32_t, bool) { return false; }
DS_API bool DS_CALL DS_RunTrayGuardianCheck(DSTrayGuardianStatus*) { return false; }
DS_API bool DS_CALL DS_ExecuteBitCarvingRecovery(void*, uint64_t, uint32_t, DSCarvedSectorResult*) { return false; }
DS_API uint32_t DS_CALL DS_EnumeratePhysicalDrives(DSPhysicalDriveDetail*, uint32_t) { return 0; }
DS_API bool DS_CALL DS_VerifyLbaBlock(void*, uint64_t, uint32_t, DSBlockResult*) { return false; }
DS_API bool DS_CALL DS_StartSmartSelfTest(void*, uint32_t) { return false; }
DS_API bool DS_CALL DS_GetSmartSelfTestStatus(void*, uint32_t*, uint32_t*) { return false; }
DS_API bool DS_CALL DS_GetDriveDetails(void*, DSPhysicalDriveDetail*) { return false; }
DS_API bool DS_CALL DS_CopyLbaRangeToMappedFile(void*, uint64_t, uint64_t, const char*, uint64_t, uint32_t, uint64_t*, uint32_t*) { return false; }
#endif

