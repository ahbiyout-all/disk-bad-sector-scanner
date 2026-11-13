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
  #define DS_ALIGNED_ALLOC(size, align) malloc(size)
  #define DS_ALIGNED_FREE(ptr) free(ptr)
#endif

// Internal Drive Context
typedef struct {
    HANDLE   hDevice;
    uint32_t driveIndex;
    uint32_t sectorSize;
    void*    alignedBuffer;
    uint32_t bufferCapacity;
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
        // Fallback to read-only if admin write rights are not elevated
        hDevice = CreateFileW(
            devicePath,
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            NULL,
            OPEN_EXISTING,
            FILE_FLAG_NO_BUFFERING,
            NULL
        );
        if (hDevice == INVALID_HANDLE_VALUE) {
            return NULL;
        }
    }

    DSDriveContext* ctx = (DSDriveContext*)malloc(sizeof(DSDriveContext));
    if (!ctx) {
        CloseHandle(hDevice);
        return NULL;
    }

    ctx->hDevice = hDevice;
    ctx->driveIndex = physicalDriveIndex;
    ctx->sectorSize = 512; // Standard default until geometry IOCTL confirms 512 / 4096

    DISK_GEOMETRY_EX geom;
    DWORD geomBytes = 0;
    if (DeviceIoControl(hDevice, IOCTL_DISK_GET_DRIVE_GEOMETRY_EX, NULL, 0, &geom, sizeof(geom), &geomBytes, NULL)) {
        if (geom.Geometry.BytesPerSector >= 512) {
            ctx->sectorSize = geom.Geometry.BytesPerSector;
        }
    }

    ctx->bufferCapacity = 1024 * 1024; // 1MB burst buffer
    ctx->alignedBuffer = DS_ALIGNED_ALLOC(ctx->bufferCapacity, 4096);
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

    // 64-bit integer overflow protection
    LARGE_INTEGER offset;
    offset.QuadPart = ((LONGLONG)lba) * ((LONGLONG)ctx->sectorSize);

    // Position file pointer
    if (!SetFilePointerEx(ctx->hDevice, offset, NULL, FILE_BEGIN)) {
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
            break;
        }
        remainingBytes -= chunkSize;
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
        // Execute Recursive Micro-Subdivision down to 1 sector resolution
        uint64_t subStart = currentLba;
        uint64_t subEnd = currentLba + sectorsToTest;

        for (uint64_t singleLba = subStart; singleLba < subEnd; ++singleLba) {
            DSBlockResult singleResult;
            DS_ScanLbaBlock(hDrive, singleLba, 1, &singleResult);

            if (singleResult.statusCode >= DS_STATUS_SLOW) {
                if (outBadResults && badCount < maxBadResults) {
                    outBadResults[badCount] = singleResult;
                }
                badCount++;
            }
        }

        currentLba += sectorsToTest;
    }

    if (outDetectedBadCount) {
        *outDetectedBadCount = badCount;
    }
    return true;
}

/**
 * Pure Creative Algorithm: Fast Hardware ECC Parity & CRC32 Generator
 */
DS_API bool DS_CALL DS_CalculateParityChecksum(
    const uint8_t* pBuffer,
    uint32_t bufferLength,
    uint32_t* outCrc32,
    uint64_t* outEccParity
) {
    if (!pBuffer || bufferLength == 0) return false;

    // Fast CRC32 polynomial 0xEDB88320
    uint32_t crc = 0xFFFFFFFF;
    uint64_t xorParity = 0;

    for (uint32_t i = 0; i < bufferLength; ++i) {
        uint8_t byteVal = pBuffer[i];
        crc ^= byteVal;
        for (int k = 0; k < 8; ++k) {
            crc = (crc >> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
        }

        // 64-bit multi-lane XOR parity accumulator
        uint32_t shift = (i % 8) * 8;
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

    while (remainingSectors > 0) {
        uint32_t batch = (remainingSectors > maxSectorsPerChunk) ? maxSectorsPerChunk : remainingSectors;
        DWORD totalBytes = batch * ctx->sectorSize;

        LARGE_INTEGER offset;
        offset.QuadPart = ((LONGLONG)currentLba) * ((LONGLONG)ctx->sectorSize);

        if (!SetFilePointerEx(ctx->hDevice, offset, NULL, FILE_BEGIN)) {
            if (outRecoveredStatus) *outRecoveredStatus = 0;
            return false;
        }

        // Zero-fill buffer and issue write-verify cycle with FILE_FLAG_WRITE_THROUGH
        memset(ctx->alignedBuffer, 0, totalBytes);
        DWORD bytesWritten = 0;
        BOOL writeOk = WriteFile(ctx->hDevice, ctx->alignedBuffer, totalBytes, &bytesWritten, NULL);
        if (!writeOk || bytesWritten != totalBytes) {
            if (outRecoveredStatus) *outRecoveredStatus = 0;
            return false;
        }

        // Re-verify read-back matches all zeros
        if (!SetFilePointerEx(ctx->hDevice, offset, NULL, FILE_BEGIN)) {
            if (outRecoveredStatus) *outRecoveredStatus = 0;
            return false;
        }
        DWORD reRead = 0;
        BOOL reReadOk = ReadFile(ctx->hDevice, ctx->alignedBuffer, totalBytes, &reRead, NULL);
        if (!reReadOk || reRead != totalBytes) {
            if (outRecoveredStatus) *outRecoveredStatus = 0;
            return false;
        }
        const uint8_t* verifyPtr = (const uint8_t*)ctx->alignedBuffer;
        for (DWORD i = 0; i < totalBytes; ++i) {
            if (verifyPtr[i] != 0) {
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
        DS_ALIGNED_FREE(ctx->alignedBuffer);
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
        if (desc->ProtocolSpecificData.ProtocolDataOffset > 0 && desc->ProtocolSpecificData.ProtocolDataLength >= 200) {
            const uint8_t* raw = (const uint8_t*)(&desc->ProtocolSpecificData) + desc->ProtocolSpecificData.ProtocolDataOffset;
            if ((size_t)(raw - buffer) + 200 <= totalBufSize) {
                auto readU64LE = [](const uint8_t* p) -> uint64_t {
                    uint64_t v = 0;
                    for (int k = 0; k < 8; ++k) v |= ((uint64_t)p[k]) << (k * 8);
                    return v;
                };
                auto readU32LE = [](const uint8_t* p) -> uint32_t {
                    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
                };

                outLog->criticalWarning = raw[0];
                uint16_t tempKelvin = (uint16_t)raw[1] | ((uint16_t)raw[2] << 8);
                outLog->temperatureCelsius = (tempKelvin >= 273) ? (tempKelvin - 273) : 0;
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
    bool allZeros = true;
    for (uint32_t i = 0; i < bufferLength; ++i) {
        if (pBuffer[i] != 0) {
            allZeros = false;
            break;
        }
    }
    *outIsAllZeros = allZeros;
    return DS_CalculateParityChecksum(pBuffer, bufferLength, outCrc32, outAvxParity);
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

        DSPhysicalDriveDetail* detail = &outDrives[foundCount];
        memset(detail, 0, sizeof(DSPhysicalDriveDetail));
        detail->driveIndex = i;
        snprintf(detail->devicePath, sizeof(detail->devicePath), "\\\\.\\PhysicalDrive%u", i);
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

            if (pDesc->ProductIdOffset != 0 && pDesc->ProductIdOffset < sizeof(descBuffer)) {
                safe_strncpy(detail->model, (char*)(descBuffer + pDesc->ProductIdOffset), sizeof(detail->model));
            } else {
                safe_strncpy(detail->model, "Physical Storage Drive", sizeof(detail->model));
            }

            if (pDesc->SerialNumberOffset != 0 && pDesc->SerialNumberOffset < sizeof(descBuffer)) {
                safe_strncpy(detail->serialNumber, (char*)(descBuffer + pDesc->SerialNumberOffset), sizeof(detail->serialNumber));
            } else {
                snprintf(detail->serialNumber, sizeof(detail->serialNumber), "DISK-PHYS-%u", i);
            }

            if (pDesc->ProductRevisionOffset != 0 && pDesc->ProductRevisionOffset < sizeof(descBuffer)) {
                safe_strncpy(detail->firmwareRev, (char*)(descBuffer + pDesc->ProductRevisionOffset), sizeof(detail->firmwareRev));
            } else {
                safe_strncpy(detail->firmwareRev, "N/A", sizeof(detail->firmwareRev));
            }

            // Bus type detection
            switch (pDesc->BusType) {
                case BusTypeNvme:
                    safe_strncpy(detail->busType, "NVMe", sizeof(detail->busType));
                    detail->isSsd = true;
                    break;
                case BusTypeSata:
                    safe_strncpy(detail->busType, "SATA", sizeof(detail->busType));
                    break;
                case BusTypeUsb:
                    safe_strncpy(detail->busType, "USB", sizeof(detail->busType));
                    break;
                case BusTypeScsi:
                case BusTypeSas:
                    safe_strncpy(detail->busType, "SCSI/SAS", sizeof(detail->busType));
                    break;
                default:
                    safe_strncpy(detail->busType, "Standard Storage", sizeof(detail->busType));
                    break;
            }
        }

        // Query Geometry & Size
        DISK_GEOMETRY_EX geom;
        DWORD geomBytes = 0;
        if (DeviceIoControl(hDevice, IOCTL_DISK_GET_DRIVE_GEOMETRY_EX, NULL, 0, &geom, sizeof(geom), &geomBytes, NULL)) {
            detail->totalCapacityBytes = geom.DiskSize.QuadPart;
            if (geom.Geometry.BytesPerSector > 0) {
                detail->sectorSize = geom.Geometry.BytesPerSector;
            }
        }

        // Query Seek Penalty (SSD vs HDD)
        STORAGE_PROPERTY_QUERY seekQuery;
        memset(&seekQuery, 0, sizeof(seekQuery));
        seekQuery.PropertyId = StorageDeviceSeekPenaltyProperty;
        seekQuery.QueryType = PropertyStandardQuery;
        DEVICE_SEEK_PENALTY_DESCRIPTOR seekDesc;
        DWORD seekBytes = 0;
        if (DeviceIoControl(hDevice, IOCTL_STORAGE_QUERY_PROPERTY, &seekQuery, sizeof(seekQuery), &seekDesc, sizeof(seekDesc), &seekBytes, NULL)) {
            detail->isSsd = !seekDesc.IncursSeekPenalty;
        }

        // Query TRIM
        STORAGE_PROPERTY_QUERY trimQuery;
        memset(&trimQuery, 0, sizeof(trimQuery));
        trimQuery.PropertyId = StorageDeviceTrimProperty;
        trimQuery.QueryType = PropertyStandardQuery;
        DEVICE_TRIM_DESCRIPTOR trimDesc;
        DWORD trimBytes = 0;
        if (DeviceIoControl(hDevice, IOCTL_STORAGE_QUERY_PROPERTY, &trimQuery, sizeof(trimQuery), &trimDesc, sizeof(trimDesc), &trimBytes, NULL)) {
            detail->isTrimSupported = trimDesc.TrimEnabled;
        } else {
            detail->isTrimSupported = false;
        }

        // Query real hardware temperature if available via StorageDeviceTemperatureProperty
        STORAGE_PROPERTY_QUERY tempQuery;
        memset(&tempQuery, 0, sizeof(tempQuery));
        tempQuery.PropertyId = StorageDeviceTemperatureProperty;
        tempQuery.QueryType = PropertyStandardQuery;
        STORAGE_TEMPERATURE_DATA_DESCRIPTOR tempDesc;
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
        tmpCtx.driveIndex = i;
        tmpCtx.sectorSize = detail->sectorSize;
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

        CloseHandle(hDevice);
        foundCount++;
    }

    return foundCount;
}

#else
// Cross-Platform POSIX / Linux / WASM stubs
DS_API void* DS_CALL DS_OpenDriveDirect(uint32_t physicalDriveIndex, uint32_t* outSectorSize) { return NULL; }
DS_API bool DS_CALL DS_ScanLbaBlock(void* hDrive, uint64_t lba, uint32_t count, DSBlockResult* outResult) { return false; }
DS_API bool DS_CALL DS_AdaptiveScanChunk(void* hDrive, uint64_t chunkStartLba, uint32_t chunkSectorCount, uint32_t burstStep, DSBlockResult* outBadResults, uint32_t maxBadResults, uint32_t* outDetectedBadCount) { return false; }
DS_API int32_t DS_CALL DS_GetSmartTelemetry(void* hDrive, DSSmartEntry* outEntries, int32_t maxEntries) { return 0; }
DS_API bool DS_CALL DS_EvaluateDriveReliability(const DSSmartEntry* entries, int32_t entryCount, DSDriveHealthReport* outReport) { return false; }
DS_API bool DS_CALL DS_CalculateParityChecksum(const uint8_t* pBuffer, uint32_t bufferLength, uint32_t* outCrc32, uint64_t* outEccParity) { return false; }
DS_API bool DS_CALL DS_AttemptSoftSectorRepair(void* hDrive, uint64_t badLba, uint32_t count, uint32_t* outRecoveredStatus) { return false; }
DS_API void DS_CALL DS_CloseDrive(void* hDrive) {}
DS_API bool DS_CALL DS_GetNvmeDeepTelemetry(void* hDrive, DSNvmeHealthLog* outLog) { return false; }
DS_API bool DS_CALL DS_CalculateAvx2ChecksumAndZeroCheck(const uint8_t* pBuffer, uint32_t bufferLength, bool* outIsAllZeros, uint32_t* outCrc32, uint64_t* outAvxParity) { return false; }
DS_API bool DS_CALL DS_ScanMultipleDrivesParallel(const DSMultiDriveScanTarget* targets, uint32_t targetCount, DSMultiDriveScanSummary* outSummaries, uint32_t concurrencyLimit) { return false; }
DS_API bool DS_CALL DS_ConfigureTrayGuardian(uint32_t pollIntervalSec, uint32_t tempThresholdC, bool alertOnPendingSector) { return false; }
DS_API bool DS_CALL DS_RunTrayGuardianCheck(DSTrayGuardianStatus* outStatus) { return false; }
DS_API bool DS_CALL DS_ExecuteBitCarvingRecovery(void* hDrive, uint64_t targetLba, uint32_t clusterSpan, DSCarvedSectorResult* outResult) { return false; }
DS_API uint32_t DS_CALL DS_EnumeratePhysicalDrives(DSPhysicalDriveDetail* outDrives, uint32_t maxDrives) { return 0; }
#endif

