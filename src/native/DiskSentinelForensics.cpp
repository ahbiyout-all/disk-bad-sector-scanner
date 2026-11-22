/**
 * @file DiskSentinelForensics.cpp
 * @brief Implementation of Pure Creative DLL: DiskSentinelForensics.dll
 *        Self-contained, zero-OS-handle native analytics & storage forensics library.
 * @author AhBiYout (GitHub: AhBiYout-all)
 * @affiliation CISNet (https://www.cisnet.co.kr)
 * @blog https://ahbiyoutvibe.blogspot.com/
 * @license Apache-2.0
 */

#ifndef DSF_EXPORTS
#define DSF_EXPORTS
#endif
#include "DiskSentinelForensics.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

// ---------------------------------------------------------------------------
// Internal Portable Helpers & IEEE 802.3 CRC32 Lookup Table
// ---------------------------------------------------------------------------

static void dsf_safe_strncpy(char* dest, const char* src, size_t destSize) {
    if (!dest || destSize == 0) return;
    if (!src) { dest[0] = '\0'; return; }
    size_t i = 0;
    for (; i < destSize - 1 && src[i] != '\0'; ++i) {
        dest[i] = src[i];
    }
    dest[i] = '\0';
}

static uint16_t dsf_read_u16_le(const uint8_t* p) {
    return (uint16_t)((uint16_t)p[0] | ((uint16_t)p[1] << 8));
}

static uint32_t dsf_read_u32_le(const uint8_t* p) {
    return (uint32_t)p[0] |
           ((uint32_t)p[1] << 8) |
           ((uint32_t)p[2] << 16) |
           ((uint32_t)p[3] << 24);
}

static uint64_t dsf_read_u64_le(const uint8_t* p) {
    uint64_t v = 0ULL;
    for (int k = 0; k < 8; ++k) {
        v |= ((uint64_t)p[k]) << (k * 8);
    }
    return v;
}

struct DSFCrc32Table {
    uint32_t entries[256];
    DSFCrc32Table() {
        for (uint32_t i = 0; i < 256; ++i) {
            uint32_t c = i;
            for (int k = 0; k < 8; ++k) {
                c = (c >> 1) ^ ((c & 1U) ? 0xEDB88320U : 0U);
            }
            entries[i] = c;
        }
    }
};

static const uint32_t* dsf_get_crc32_table() {
    static const DSFCrc32Table s_table;
    return s_table.entries;
}

static uint32_t dsf_crc32_update(uint32_t crcState, const uint8_t* data, size_t length) {
    const uint32_t* table = dsf_get_crc32_table();
    uint32_t crc = crcState;
    for (size_t i = 0; i < length; ++i) {
        crc = table[(crc ^ data[i]) & 0xFFU] ^ (crc >> 8);
    }
    return crc;
}

static uint32_t dsf_crc32(const uint8_t* data, size_t length) {
    return ~dsf_crc32_update(0xFFFFFFFFU, data, length);
}

static int dsf_cmp_u64(const void* a, const void* b) {
    const uint64_t va = *(const uint64_t*)a;
    const uint64_t vb = *(const uint64_t*)b;
    if (va < vb) return -1;
    if (va > vb) return 1;
    return 0;
}

static uint32_t dsf_lower_bound_u64(const uint64_t* arr, uint32_t n, uint64_t target) {
    uint32_t lo = 0;
    uint32_t hi = n;
    while (lo < hi) {
        uint32_t mid = lo + ((hi - lo) >> 1);
        if (arr[mid] < target) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

static int dsf_cmp_sample_by_block_id(const void* a, const void* b) {
    const DSFTelemetrySample* sa = (const DSFTelemetrySample*)a;
    const DSFTelemetrySample* sb = (const DSFTelemetrySample*)b;
    if (sa->blockId < sb->blockId) return -1;
    if (sa->blockId > sb->blockId) return 1;
    if (sa->lba < sb->lba) return -1;
    if (sa->lba > sb->lba) return 1;
    return 0;
}

static size_t dsf_utf16le_to_utf8(const uint8_t* utf16Bytes, size_t maxCodeUnits, char* outUtf8, size_t outCapacity) {
    if (!utf16Bytes || !outUtf8 || outCapacity == 0) return 0;
    size_t outPos = 0;
    for (size_t idx = 0; idx < maxCodeUnits; ++idx) {
        uint16_t u16 = dsf_read_u16_le(utf16Bytes + (idx * 2));
        if (u16 == 0) break;

        uint32_t cp = u16;
        if (u16 >= 0xD800U && u16 <= 0xDBFFU && (idx + 1) < maxCodeUnits) {
            uint16_t low = dsf_read_u16_le(utf16Bytes + ((idx + 1) * 2));
            if (low >= 0xDC00U && low <= 0xDFFFU) {
                cp = 0x10000U + (((uint32_t)(u16 - 0xD800U) << 10) | (uint32_t)(low - 0xDC00U));
                idx++;
            } else {
                cp = 0xFFFDU;
            }
        } else if (u16 >= 0xDC00U && u16 <= 0xDFFFU) {
            cp = 0xFFFDU;
        }

        if (cp <= 0x7FU) {
            if (outPos + 1 >= outCapacity) break;
            outUtf8[outPos++] = (char)cp;
        } else if (cp <= 0x7FFU) {
            if (outPos + 2 >= outCapacity) break;
            outUtf8[outPos++] = (char)(0xC0U | ((cp >> 6) & 0x1FU));
            outUtf8[outPos++] = (char)(0x80U | (cp & 0x3FU));
        } else if (cp <= 0xFFFFU) {
            if (outPos + 3 >= outCapacity) break;
            outUtf8[outPos++] = (char)(0xE0U | ((cp >> 12) & 0x0FU));
            outUtf8[outPos++] = (char)(0x80U | ((cp >> 6) & 0x3FU));
            outUtf8[outPos++] = (char)(0x80U | (cp & 0x3FU));
        } else {
            if (outPos + 4 >= outCapacity) break;
            outUtf8[outPos++] = (char)(0xF0U | ((cp >> 18) & 0x07U));
            outUtf8[outPos++] = (char)(0x80U | ((cp >> 12) & 0x3FU));
            outUtf8[outPos++] = (char)(0x80U | ((cp >> 6) & 0x3FU));
            outUtf8[outPos++] = (char)(0x80U | (cp & 0x3FU));
        }
    }
    outUtf8[outPos] = '\0';
    return outPos;
}

// ---------------------------------------------------------------------------
// Export 1: Engine Metadata & CRC32 Self-Test
// ---------------------------------------------------------------------------

DSF_API bool DSF_CALL DSF_GetForensicsEngineInfo(DSFEngineInfo* outInfo) {
    if (!outInfo) return false;
    memset(outInfo, 0, sizeof(DSFEngineInfo));

    dsf_safe_strncpy(outInfo->engineName, "DiskSentinelForensics Pure Creative Engine", sizeof(outInfo->engineName));
    dsf_safe_strncpy(outInfo->version, "4.6.0", sizeof(outInfo->version));
    outInfo->capabilitiesMask =
        DSF_CAP_ZSCORE_TELEMETRY |
        DSF_CAP_EXTENT_HEATMAP |
        DSF_CAP_SHANNON_ENTROPY |
        DSF_CAP_GPT_MBR_CRC32 |
        DSF_CAP_VBR_DECODER;

    static const uint8_t kCheckVec[9] = { '1','2','3','4','5','6','7','8','9' };
    uint32_t testCrc = dsf_crc32(kCheckVec, sizeof(kCheckVec));
    outInfo->crc32SelfTestValue = testCrc;
    outInfo->crc32SelfTestPassed = (testCrc == 0xCBF43926U) ? 1 : 0;
    return true;
}

// ---------------------------------------------------------------------------
// Export 2: Welford One-Pass Z-Score & Contiguous Degradation Zone Detector
// ---------------------------------------------------------------------------

DSF_API bool DSF_CALL DSF_AnalyzeSectorTelemetryZScore(
    const DSFTelemetrySample* samples,
    uint32_t sampleCount,
    double   baselineExpectedMs,
    uint32_t maxBlockIdGap,
    DSFZScoreReport* outReport,
    DSFContiguousZone* outZones,
    uint32_t maxZones,
    uint32_t* outWrittenZones
) {
    if (!outReport) return false;
    if (!samples && sampleCount > 0) return false;

    memset(outReport, 0, sizeof(DSFZScoreReport));
    if (outWrittenZones) *outWrittenZones = 0;

    if (sampleCount == 0) {
        outReport->riskLevel = DSF_RISK_OPTIMAL;
        return true;
    }

    if (maxBlockIdGap == 0) maxBlockIdGap = 1;
    const double safeBaseline = (baselineExpectedMs > 0.1) ? baselineExpectedMs : 1.0;

    // Pass 1: Finite-Guarded Welford Numerically Stable Mean & M2 Recurrence + Monotonic Order Check
    double mean = 0.0;
    double m2 = 0.0;
    double maxLat = 0.0;
    uint32_t validLatCount = 0;
    uint32_t slowBadCount = 0;
    bool needsSort = false;

    for (uint32_t i = 0; i < sampleCount; ++i) {
        if (i > 0 && samples[i].blockId < samples[i - 1].blockId) {
            needsSort = true;
        }
        if (samples[i].statusCode >= 2U) {
            slowBadCount++;
        }

        double x = samples[i].latencyMs;
        if (!isfinite(x) || x < 0.0) {
            continue;
        }

        validLatCount++;
        double delta = x - mean;
        mean += delta / (double)validLatCount;
        double delta2 = x - mean;
        m2 += delta * delta2;

        if (x > maxLat) maxLat = x;
    }

    // Align sample standard deviation denominator (N - 1) with frontend d3.deviation()
    double variance = (validLatCount > 1) ? (m2 / (double)(validLatCount - 1U)) : 0.0;
    double stdDev = sqrt(variance > 0.0 ? variance : 0.0);
    double effectiveStdDev = (stdDev < 0.05) ? 0.05 : stdDev;

    const DSFTelemetrySample* orderedSamples = samples;
    DSFTelemetrySample* sortedCopy = NULL;
    if (needsSort && sampleCount > 1U) {
        sortedCopy = (DSFTelemetrySample*)malloc(sizeof(DSFTelemetrySample) * sampleCount);
        if (sortedCopy) {
            memcpy(sortedCopy, samples, sizeof(DSFTelemetrySample) * sampleCount);
            qsort(sortedCopy, sampleCount, sizeof(DSFTelemetrySample), dsf_cmp_sample_by_block_id);
            orderedSamples = sortedCopy;
        }
    }

    // Pass 2: Z-Score Banding & Contiguous Physical Cluster Aggregation
    uint32_t w1 = 0, s12 = 0, s23 = 0, s3p = 0;
    uint32_t totalZones = 0;
    uint32_t writtenZones = 0;
    uint32_t longestRun = 0;

    bool inRun = false;
    DSFContiguousZone curZone;
    memset(&curZone, 0, sizeof(curZone));
    double curLatencySum = 0.0;

    auto flushZone = [&]() {
        if (!inRun) return;
        if (curZone.blockCount >= 2 || curZone.badCount >= 1) {
            curZone.avgLatencyMs = curLatencySum / (double)(curZone.blockCount > 0 ? curZone.blockCount : 1);
            if (curZone.blockCount > longestRun) longestRun = curZone.blockCount;
            if (outZones && writtenZones < maxZones) {
                outZones[writtenZones] = curZone;
                writtenZones++;
            }
            totalZones++;
        }
        inRun = false;
        curLatencySum = 0.0;
    };

    for (uint32_t i = 0; i < sampleCount; ++i) {
        const DSFTelemetrySample& s = orderedSamples[i];
        bool isBadStatus = (s.statusCode >= 4U);
        double lat = (isfinite(s.latencyMs) && s.latencyMs >= 0.0) ? s.latencyMs : 0.0;
        double z = (validLatCount > 0 && isfinite(s.latencyMs) && s.latencyMs >= 0.0)
            ? ((lat - mean) / effectiveStdDev)
            : 0.0;

        if (validLatCount > 0 && isfinite(s.latencyMs) && s.latencyMs >= 0.0) {
            if (z <= 1.0)      w1++;
            else if (z <= 2.0) s12++;
            else if (z <= 3.0) s23++;
            else               s3p++;
        }

        bool isAnomalous = (s.statusCode >= 2U) || (z >= 2.5 && lat >= safeBaseline * 2.0);
        if (isAnomalous) {
            if (!inRun) {
                inRun = true;
                curZone.startLba = s.lba;
                curZone.endLba = s.lba;
                curZone.startBlockId = s.blockId;
                curZone.endBlockId = s.blockId;
                curZone.blockCount = 1;
                curZone.badCount = isBadStatus ? 1U : 0U;
                curZone.peakLatencyMs = lat;
                curZone.peakZScore = z;
                curZone.severity = isBadStatus ? 2U : 1U;
                curLatencySum = lat;
            } else {
                uint32_t gap = (s.blockId >= curZone.endBlockId)
                    ? (s.blockId - curZone.endBlockId)
                    : (maxBlockIdGap + 1U);
                if (gap <= maxBlockIdGap) {
                    curZone.endLba = s.lba;
                    curZone.endBlockId = s.blockId;
                    curZone.blockCount++;
                    if (isBadStatus) {
                        curZone.badCount++;
                        curZone.severity = 2U;
                    }
                    if (lat > curZone.peakLatencyMs) curZone.peakLatencyMs = lat;
                    if (z > curZone.peakZScore) curZone.peakZScore = z;
                    curLatencySum += lat;
                } else {
                    flushZone();
                    inRun = true;
                    curZone.startLba = s.lba;
                    curZone.endLba = s.lba;
                    curZone.startBlockId = s.blockId;
                    curZone.endBlockId = s.blockId;
                    curZone.blockCount = 1;
                    curZone.badCount = isBadStatus ? 1U : 0U;
                    curZone.peakLatencyMs = lat;
                    curZone.peakZScore = z;
                    curZone.severity = isBadStatus ? 2U : 1U;
                    curLatencySum = lat;
                }
            }
        } else {
            flushZone();
        }
    }
    flushZone();
    if (sortedCopy) free(sortedCopy);

    // Composite Degradation Risk Index (0.0 .. 100.0)
    double slowPct = (double)slowBadCount * 100.0 / (double)sampleCount;
    double outlierPct = (double)(s23 + s3p) * 100.0 / (double)sampleCount;
    double clusterPenalty = (double)totalZones * 7.5 + (double)longestRun * 2.5;
    double score = slowPct * 3.0 + outlierPct * 1.4 + clusterPenalty;
    if (score > 100.0) score = 100.0;
    if (score < 0.0) score = 0.0;

    uint32_t risk = DSF_RISK_OPTIMAL;
    if (score >= 70.0 || longestRun >= 8)       risk = DSF_RISK_CRITICAL;
    else if (score >= 45.0 || totalZones >= 3)  risk = DSF_RISK_HIGH;
    else if (score >= 20.0 || totalZones >= 1)  risk = DSF_RISK_MODERATE;
    else if (score >= 5.0 || slowBadCount > 0)  risk = DSF_RISK_LOW;

    outReport->totalSamples = sampleCount;
    outReport->slowOrBadCount = slowBadCount;
    outReport->within1SigmaCount = w1;
    outReport->sigma1To2Count = s12;
    outReport->sigma2To3Count = s23;
    outReport->over3SigmaCount = s3p;
    outReport->contiguousZoneCount = totalZones;
    outReport->longestRunBlocks = longestRun;
    outReport->riskLevel = risk;
    outReport->meanMs = mean;
    outReport->stdDevMs = stdDev;
    outReport->maxLatencyMs = maxLat;
    outReport->degradationRiskScore = score;

    if (outWrittenZones) *outWrittenZones = writtenZones;
    return true;
}

// ---------------------------------------------------------------------------
// Export 3: O(N log M) Fragmented Extent Bad-Density Heatmap Mapper
// ---------------------------------------------------------------------------

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
) {
    if (!outSummary || cellCount == 0) return false;
    if (!extents && extentCount > 0) return false;
    if (!badLbas && badLbaCount > 0) return false;

    memset(outSummary, 0, sizeof(DSFHeatmapSummary));
    if (outCellBadCounts) {
        memset(outCellBadCounts, 0, sizeof(uint32_t) * cellCount);
    }
    if (outCellDensityPct) {
        for (uint32_t c = 0; c < cellCount; ++c) outCellDensityPct[c] = 0.0;
    }

    if (extentCount == 0) return true;

    uint64_t totalSectors = 0ULL;
    for (uint32_t i = 0; i < extentCount; ++i) {
        if (extents[i].sectorCount > UINT64_MAX - totalSectors) {
            totalSectors = UINT64_MAX;
        } else {
            totalSectors += extents[i].sectorCount;
        }
    }

    outSummary->totalExtents = extentCount;
    outSummary->totalSectorsMapped = totalSectors;
    if (totalSectors == 0ULL || badLbaCount == 0U) return true;

    const uint64_t* sortedPtr = badLbas;
    uint64_t* ownedSorted = NULL;
    if (!badLbasAlreadySorted && badLbaCount > 1U) {
        ownedSorted = (uint64_t*)malloc(sizeof(uint64_t) * badLbaCount);
        if (!ownedSorted) return false;
        memcpy(ownedSorted, badLbas, sizeof(uint64_t) * badLbaCount);
        qsort(ownedSorted, badLbaCount, sizeof(uint64_t), dsf_cmp_u64);
        sortedPtr = ownedSorted;
    }

    const uint64_t minBadLba = sortedPtr[0];
    const uint64_t maxBadLba = sortedPtr[badLbaCount - 1U];

    uint32_t impactedExtents = 0;
    uint32_t totalHits = 0;
    uint64_t cumulativeOffset = 0ULL;

    for (uint32_t e = 0; e < extentCount; ++e) {
        uint64_t extStart = extents[e].startLba;
        uint64_t extLen = extents[e].sectorCount;
        if (extLen == 0ULL) continue;
        uint64_t extEndExcl = (extLen > UINT64_MAX - extStart) ? UINT64_MAX : (extStart + extLen);

        if (maxBadLba >= extStart && minBadLba < extEndExcl) {
            uint32_t loIdx = dsf_lower_bound_u64(sortedPtr, badLbaCount, extStart);
            uint32_t hiIdx = dsf_lower_bound_u64(sortedPtr, badLbaCount, extEndExcl);

            if (hiIdx > loIdx) {
                impactedExtents++;
                for (uint32_t k = loIdx; k < hiIdx; ++k) {
                    uint64_t relOffsetInExt = sortedPtr[k] - extStart;
                    uint64_t relSector = (relOffsetInExt > UINT64_MAX - cumulativeOffset)
                        ? UINT64_MAX
                        : (relOffsetInExt + cumulativeOffset);
                    uint32_t cellIdx = (uint32_t)(((double)relSector / (double)totalSectors) * (double)cellCount);
                    if (cellIdx >= cellCount) cellIdx = cellCount - 1U;
                    if (outCellBadCounts) outCellBadCounts[cellIdx]++;
                    totalHits++;
                }
            }
        }
        cumulativeOffset = (extLen > UINT64_MAX - cumulativeOffset) ? UINT64_MAX : (cumulativeOffset + extLen);
    }

    if (ownedSorted) free(ownedSorted);

    double sectorsPerCell = (double)totalSectors / (double)cellCount;
    if (sectorsPerCell < 1.0) sectorsPerCell = 1.0;

    uint32_t nonZeroCells = 0;
    uint32_t peakIdx = 0;
    double peakPct = 0.0;

    for (uint32_t c = 0; c < cellCount; ++c) {
        uint32_t cnt = outCellBadCounts ? outCellBadCounts[c] : 0;
        double pct = ((double)cnt / sectorsPerCell) * 100.0;
        if (pct > 100.0) pct = 100.0;
        if (outCellDensityPct) outCellDensityPct[c] = pct;
        if (cnt > 0) nonZeroCells++;
        if (pct > peakPct) {
            peakPct = pct;
            peakIdx = c;
        }
    }

    outSummary->impactedExtentCount = impactedExtents;
    outSummary->totalBadHits = totalHits;
    outSummary->peakCellIndex = peakIdx;
    outSummary->peakCellDensityPct = peakPct;
    outSummary->fragmentationSpreadScore = (double)nonZeroCells * 100.0 / (double)cellCount;
    return true;
}

// ---------------------------------------------------------------------------
// Export 4: Shannon Entropy, Erased-NAND & Repeating Poison-Pattern Inspector
// ---------------------------------------------------------------------------

DSF_API bool DSF_CALL DSF_ComputeSectorEntropyAndPattern(
    const uint8_t* pBuffer,
    uint32_t bufferLength,
    DSFSectorEntropyResult* outResult
) {
    if (!pBuffer || bufferLength == 0 || !outResult) return false;
    memset(outResult, 0, sizeof(DSFSectorEntropyResult));

    uint32_t hist[256];
    memset(hist, 0, sizeof(hist));

    uint32_t printableCount = 0;
    for (uint32_t i = 0; i < bufferLength; ++i) {
        uint8_t b = pBuffer[i];
        hist[b]++;
        if ((b >= 32 && b <= 126) || b == '\t' || b == '\r' || b == '\n') {
            printableCount++;
        }
    }

    double entropy = 0.0;
    const double n = (double)bufferLength;
    for (int k = 0; k < 256; ++k) {
        if (hist[k] > 0U) {
            double p = (double)hist[k] / n;
            entropy -= p * log2(p);
        }
    }
    if (entropy < 0.0) entropy = 0.0;

    bool isAllZero = (hist[0] == bufferLength);
    bool isAllFF   = (hist[0xFF] == bufferLength);

    // Repeating 4-byte pattern check across buffer
    bool hasPattern = false;
    uint32_t word0 = 0;
    if (bufferLength >= 8) {
        word0 = dsf_read_u32_le(pBuffer);
        hasPattern = true;
        uint32_t limit4 = bufferLength & ~3U;
        for (uint32_t i = 4; i < limit4; i += 4) {
            if (dsf_read_u32_le(pBuffer + i) != word0) {
                hasPattern = false;
                break;
            }
        }
        if (hasPattern) {
            for (uint32_t i = limit4; i < bufferLength; ++i) {
                if (pBuffer[i] != ((const uint8_t*)&word0)[i & 3U]) {
                    hasPattern = false;
                    break;
                }
            }
        }
    }

    double zeroRatio = (double)hist[0] / n;
    double ffRatio   = (double)hist[0xFF] / n;
    double printRatio = (double)printableCount / n;

    uint32_t sClass = DSF_SECTOR_STRUCTURED_BINARY;
    const char* label = "Structured Binary / Filesystem Metadata";

    if (isAllZero) {
        sClass = DSF_SECTOR_ALL_ZERO;
        label = "Zero-Filled / TRIM-Deallocated Sector";
    } else if (isAllFF) {
        sClass = DSF_SECTOR_ALL_FF;
        label = "Erased NAND / All-0xFF Sector";
    } else if (hasPattern) {
        sClass = DSF_SECTOR_REPEATING_PATTERN;
        label = "Repeating Wipe / Poison Word Pattern";
    } else if (printRatio >= 0.85 && entropy <= 6.2) {
        sClass = DSF_SECTOR_TEXT_METADATA;
        label = "UTF-8 / ASCII Text or System Log";
    } else if (entropy >= 7.5) {
        sClass = DSF_SECTOR_ENCRYPTED_COMPRESSED;
        label = "High-Entropy Encrypted / Compressed Data";
    }

    outResult->inspectedBytes = bufferLength;
    outResult->crc32 = dsf_crc32(pBuffer, bufferLength);
    outResult->repeatingWord32 = word0;
    outResult->sectorClass = sClass;
    outResult->shannonEntropy = entropy;
    outResult->zeroByteRatio = zeroRatio;
    outResult->ffByteRatio = ffRatio;
    outResult->printableRatio = printRatio;
    outResult->hasRepeatingPattern = hasPattern ? 1 : 0;
    outResult->isAllZero = isAllZero ? 1 : 0;
    outResult->isAllFF = isAllFF ? 1 : 0;
    dsf_safe_strncpy(outResult->classificationLabel, label, sizeof(outResult->classificationLabel));
    return true;
}

// ---------------------------------------------------------------------------
// Export 5: MBR / Protective MBR / GPT Header & Partition Array CRC32 Validator
// ---------------------------------------------------------------------------

static void dsf_classify_gpt_guid(const uint8_t* g, char* outBuf, size_t bufSize) {
    uint32_t d1 = dsf_read_u32_le(g);
    uint16_t d2 = dsf_read_u16_le(g + 4);
    uint16_t d3 = dsf_read_u16_le(g + 6);

    // EBD0A0A2-B9E5-4433-87C0-68B6B72699C7 -> Microsoft Basic Data
    if (d1 == 0xEBD0A0A2U && d2 == 0xB9E5U && d3 == 0x4433U) {
        dsf_safe_strncpy(outBuf, "Microsoft Basic Data (NTFS/exFAT)", bufSize);
    }
    // C12A7328-F81F-11D2-BA4B-00A0C93EC93B -> EFI System Partition
    else if (d1 == 0xC12A7328U && d2 == 0xF81FU && d3 == 0x11D2U) {
        dsf_safe_strncpy(outBuf, "EFI System Partition (ESP)", bufSize);
    }
    // E3C9E316-0B5C-4DB8-817D-F92DF00215AE -> Microsoft Reserved (MSR)
    else if (d1 == 0xE3C9E316U && d2 == 0x0B5CU && d3 == 0x4DB8U) {
        dsf_safe_strncpy(outBuf, "Microsoft Reserved (MSR)", bufSize);
    }
    // DE94BBA4-06D1-4D40-A16A-BFD50179D6AC -> Windows Recovery Environment
    else if (d1 == 0xDE94BBA4U && d2 == 0x06D1U && d3 == 0x4D40U) {
        dsf_safe_strncpy(outBuf, "Windows Recovery Environment", bufSize);
    }
    // AF9B60A0-1431-4F62-BC68-3311714A69AD -> Windows LDM Data
    else if (d1 == 0xAF9B60A0U && d2 == 0x1431U && d3 == 0x4F62U) {
        dsf_safe_strncpy(outBuf, "Windows LDM Dynamic Data", bufSize);
    }
    // E75CAF8F-F680-4CEE-AFA3-B001E56EFC2D -> Windows Storage Spaces
    else if (d1 == 0xE75CAF8FU && d2 == 0xF680U && d3 == 0x4CEEU) {
        dsf_safe_strncpy(outBuf, "Microsoft Storage Spaces", bufSize);
    }
    // 0FC63DAF-8483-4772-8E79-3D69D8477DE4 -> Linux Filesystem Data
    else if (d1 == 0x0FC63DAFU && d2 == 0x8483U && d3 == 0x4772U) {
        dsf_safe_strncpy(outBuf, "Linux Filesystem Data", bufSize);
    }
    // 0657FD6D-A4AB-43C4-84E5-0933C84B4F4F -> Linux Swap
    else if (d1 == 0x0657FD6DU && d2 == 0xA4ABU && d3 == 0x43C4U) {
        dsf_safe_strncpy(outBuf, "Linux Swap Partition", bufSize);
    }
    // E6D6D379-F507-44C2-A23C-238F2A3DF928 -> Linux LVM
    else if (d1 == 0xE6D6D379U && d2 == 0xF507U && d3 == 0x44C2U) {
        dsf_safe_strncpy(outBuf, "Linux LVM Physical Volume", bufSize);
    }
    // CA7D7CCB-63ED-4C53-861C-1742536059CC -> Linux LUKS
    else if (d1 == 0xCA7D7CCBU && d2 == 0x63EDU && d3 == 0x4C53U) {
        dsf_safe_strncpy(outBuf, "Linux LUKS Encrypted Volume", bufSize);
    }
    // 7C3457EF-0000-11AA-AA11-00306543ECAC -> Apple APFS
    else if (d1 == 0x7C3457EFU && d2 == 0x0000U && d3 == 0x11AAU) {
        dsf_safe_strncpy(outBuf, "Apple APFS Container", bufSize);
    }
    // 48465300-0000-11AA-AA11-00306543ECAC -> Apple HFS+
    else if (d1 == 0x48465300U && d2 == 0x0000U && d3 == 0x11AAU) {
        dsf_safe_strncpy(outBuf, "Apple HFS+ Filesystem", bufSize);
    } else {
        dsf_safe_strncpy(outBuf, "GPT Partition", bufSize);
    }
}

DSF_API bool DSF_CALL DSF_InspectBootAndPartitionTable(
    const uint8_t* rawLbaBuffer,
    uint32_t bufferLength,
    uint32_t sectorSize,
    DSFPartitionTableReport* outReport,
    DSFPartitionRecord* outPartitions,
    uint32_t maxPartitions
) {
    if (!rawLbaBuffer || bufferLength < 512 || !outReport) return false;
    memset(outReport, 0, sizeof(DSFPartitionTableReport));

    uint32_t secBytes = (sectorSize == 4096) ? 4096U : 512U;
    outReport->sectorSize = secBytes;

    bool mbrSig = (rawLbaBuffer[510] == 0x55 && rawLbaBuffer[511] == 0xAA);
    outReport->hasMbrSignature = mbrSig ? 1 : 0;

    // Inspect first MBR record to check for Protective MBR (0xEE)
    uint8_t mbrFirstType = rawLbaBuffer[446 + 4];
    if (mbrSig && mbrFirstType == 0xEE) {
        outReport->isProtectiveMbr = 1;
    }

    // Check GPT Header at LBA 1 (byte offset = secBytes)
    if (bufferLength >= secBytes + 92U && memcmp(rawLbaBuffer + secBytes, "EFI PART", 8) == 0) {
        const uint8_t* hdr = rawLbaBuffer + secBytes;
        uint32_t hdrSize = dsf_read_u32_le(hdr + 12);
        if (hdrSize < 92U || hdrSize > secBytes) hdrSize = 92U;

        uint32_t storedHdrCrc = dsf_read_u32_le(hdr + 16);
        uint8_t hdrCopy[512];
        uint32_t copyLen = (hdrSize <= sizeof(hdrCopy)) ? hdrSize : (uint32_t)sizeof(hdrCopy);
        memcpy(hdrCopy, hdr, copyLen);
        memset(hdrCopy + 16, 0, 4); // HeaderCRC32 field zeroed prior to CRC calculation

        uint32_t computedHdrCrc = dsf_crc32(hdrCopy, copyLen);

        outReport->hasGptHeader = 1;
        outReport->storedHeaderCrc32 = storedHdrCrc;
        outReport->computedHeaderCrc32 = computedHdrCrc;
        outReport->gptHeaderCrcValid = (storedHdrCrc == computedHdrCrc) ? 1 : 0;

        outReport->firstUsableLba = dsf_read_u64_le(hdr + 40);
        outReport->lastUsableLba  = dsf_read_u64_le(hdr + 48);

        uint64_t partEntriesLba   = dsf_read_u64_le(hdr + 72);
        uint32_t numEntries       = dsf_read_u32_le(hdr + 80);
        uint32_t entrySize        = dsf_read_u32_le(hdr + 84);
        uint32_t storedArrCrc     = dsf_read_u32_le(hdr + 88);
        outReport->storedEntriesCrc32 = storedArrCrc;

        dsf_safe_strncpy(outReport->schemeName, "GPT", sizeof(outReport->schemeName));

        if (entrySize >= 128U && entrySize <= 512U && numEntries > 0U && numEntries <= 1024U &&
            partEntriesLba <= (UINT64_MAX / (uint64_t)secBytes)) {
            uint64_t arrayByteOffset = partEntriesLba * (uint64_t)secBytes;
            uint64_t arrayTotalBytes = (uint64_t)numEntries * (uint64_t)entrySize;
            if (arrayByteOffset <= (uint64_t)bufferLength &&
                arrayTotalBytes <= (uint64_t)bufferLength - arrayByteOffset) {
                const uint8_t* entriesPtr = rawLbaBuffer + (size_t)arrayByteOffset;
                uint32_t computedArrCrc = dsf_crc32(entriesPtr, (size_t)arrayTotalBytes);
                outReport->computedEntriesCrc32 = computedArrCrc;
                outReport->gptEntriesCrcValid = (computedArrCrc == storedArrCrc) ? 1 : 0;

                uint32_t found = 0;
                for (uint32_t idx = 0; idx < numEntries; ++idx) {
                    const uint8_t* ent = entriesPtr + ((size_t)idx * (size_t)entrySize);
                    bool emptyGuid = true;
                    for (int b = 0; b < 16; ++b) {
                        if (ent[b] != 0) { emptyGuid = false; break; }
                    }
                    if (emptyGuid) continue;

                    uint64_t sLba = dsf_read_u64_le(ent + 32);
                    uint64_t eLba = dsf_read_u64_le(ent + 40);
                    if (eLba < sLba) continue;

                    if (outPartitions && found < maxPartitions) {
                        DSFPartitionRecord* rec = &outPartitions[found];
                        memset(rec, 0, sizeof(DSFPartitionRecord));
                        rec->index = found + 1U;
                        rec->startLba = sLba;
                        rec->endLba = eLba;
                        rec->sectorCount = (eLba - sLba) + 1ULL;
                        rec->sizeBytes = (rec->sectorCount <= (UINT64_MAX / (uint64_t)secBytes))
                            ? (rec->sectorCount * (uint64_t)secBytes)
                            : UINT64_MAX;
                        rec->sectorAligned4K = (sLba <= (UINT64_MAX / (uint64_t)secBytes) && (((sLba * (uint64_t)secBytes) % 4096ULL) == 0ULL)) ? 1U : 0U;
                        rec->isGpt = 1;
                        dsf_classify_gpt_guid(ent, rec->typeLabel, sizeof(rec->typeLabel));

                        // Full UTF-16LE -> UTF-8 decode (preserves multi-byte Unicode / Korean labels + surrogate pairs)
                        dsf_utf16le_to_utf8(ent + 56, 36U, rec->nameUtf8, sizeof(rec->nameUtf8));
                    }
                    found++;
                }
                outReport->partitionCount = found;
            }
        }
        return true;
    }

    // Fallback: Standard Legacy MBR Partition Parsing
    if (mbrSig) {
        dsf_safe_strncpy(outReport->schemeName, "MBR", sizeof(outReport->schemeName));
        uint32_t found = 0;
        for (int p = 0; p < 4; ++p) {
            const uint8_t* ent = rawLbaBuffer + 446 + (p * 16);
            uint8_t pType = ent[4];
            uint32_t sLba = dsf_read_u32_le(ent + 8);
            uint32_t cnt  = dsf_read_u32_le(ent + 12);
            if (pType == 0 || cnt == 0) continue;

            if (outPartitions && found < maxPartitions) {
                DSFPartitionRecord* rec = &outPartitions[found];
                memset(rec, 0, sizeof(DSFPartitionRecord));
                rec->index = found + 1U;
                rec->mbrTypeByte = pType;
                rec->isBootable = (ent[0] == 0x80) ? 1 : 0;
                rec->startLba = sLba;
                rec->sectorCount = cnt;
                rec->endLba = (uint64_t)sLba + (uint64_t)cnt - 1ULL;
                rec->sizeBytes = (uint64_t)cnt * (uint64_t)secBytes;
                rec->sectorAligned4K = ((((uint64_t)sLba * (uint64_t)secBytes) % 4096ULL) == 0ULL) ? 1U : 0U;

                if (pType == 0x07)      dsf_safe_strncpy(rec->typeLabel, "NTFS / exFAT", sizeof(rec->typeLabel));
                else if (pType == 0x0B || pType == 0x0C) dsf_safe_strncpy(rec->typeLabel, "FAT32", sizeof(rec->typeLabel));
                else if (pType == 0x83) dsf_safe_strncpy(rec->typeLabel, "Linux ext4/xfs", sizeof(rec->typeLabel));
                else if (pType == 0xEE) dsf_safe_strncpy(rec->typeLabel, "Protective GPT", sizeof(rec->typeLabel));
                else                    dsf_safe_strncpy(rec->typeLabel, "MBR Partition", sizeof(rec->typeLabel));
            }
            found++;
        }
        outReport->partitionCount = found;
        return true;
    }

    dsf_safe_strncpy(outReport->schemeName, "RAW/UNFORMATTED", sizeof(outReport->schemeName));
    return true;
}

// ---------------------------------------------------------------------------
// Export 6: NTFS / FAT32 / exFAT Volume Boot Record (VBR) Decoder
// ---------------------------------------------------------------------------

DSF_API bool DSF_CALL DSF_InspectVbrBootSector(
    const uint8_t* vbrSectorBuffer,
    uint32_t bufferLength,
    DSFVbrInfo* outInfo
) {
    if (!vbrSectorBuffer || bufferLength < 512 || !outInfo) return false;
    memset(outInfo, 0, sizeof(DSFVbrInfo));

    outInfo->hasBootSignature = (vbrSectorBuffer[510] == 0x55 && vbrSectorBuffer[511] == 0xAA) ? 1 : 0;
    for (int i = 0; i < 8; ++i) {
        uint8_t c = vbrSectorBuffer[3 + i];
        outInfo->oemId[i] = (c >= 32 && c <= 126) ? (char)c : ' ';
    }
    outInfo->oemId[8] = '\0';

    if (memcmp(vbrSectorBuffer + 3, "NTFS    ", 8) == 0) {
        uint16_t bps = dsf_read_u16_le(vbrSectorBuffer + 11);
        uint8_t spc = vbrSectorBuffer[13];
        if (bps >= 512U && bps <= 4096U && (bps & (bps - 1U)) == 0U &&
            spc > 0U && (spc & (spc - 1U)) == 0U) {
            outInfo->fsType = DSF_FS_NTFS;
            outInfo->bytesPerSector = bps;
            outInfo->sectorsPerCluster = spc;
            outInfo->clusterSizeBytes = (uint32_t)bps * (uint32_t)spc;
            outInfo->reservedSectors = dsf_read_u16_le(vbrSectorBuffer + 14);
            outInfo->totalSectors = dsf_read_u64_le(vbrSectorBuffer + 40);
            outInfo->mftStartLcn  = dsf_read_u64_le(vbrSectorBuffer + 48);
            return true;
        }
        return false;
    }

    if (memcmp(vbrSectorBuffer + 3, "EXFAT   ", 8) == 0) {
        uint8_t secShift = vbrSectorBuffer[108];
        uint8_t clusShift = vbrSectorBuffer[109];
        if (secShift < 9 || secShift > 12 || clusShift > 25) {
            return false;
        }
        uint32_t bps = 1U << secShift;
        uint32_t spc = 1U << clusShift;
        if ((uint64_t)bps * (uint64_t)spc > 33554432ULL) {
            return false;
        }
        outInfo->fsType = DSF_FS_EXFAT;
        outInfo->bytesPerSector = bps;
        outInfo->sectorsPerCluster = spc;
        outInfo->clusterSizeBytes = bps * spc;
        outInfo->totalSectors = dsf_read_u64_le(vbrSectorBuffer + 72);
        outInfo->rootCluster  = dsf_read_u32_le(vbrSectorBuffer + 96);
        return true;
    }

    bool hasFat32FsType = (memcmp(vbrSectorBuffer + 82, "FAT32", 5) == 0);
    uint32_t fatSize32 = dsf_read_u32_le(vbrSectorBuffer + 36);
    uint16_t resSecs = dsf_read_u16_le(vbrSectorBuffer + 14);
    uint8_t numFats = vbrSectorBuffer[16];
    if (hasFat32FsType || (outInfo->hasBootSignature && fatSize32 > 0U && resSecs > 0U && numFats >= 1U && numFats <= 4U)) {
        uint16_t bps = dsf_read_u16_le(vbrSectorBuffer + 11);
        uint8_t spc  = vbrSectorBuffer[13];
        if (bps >= 512U && bps <= 4096U && (bps & (bps - 1U)) == 0U &&
            spc > 0U && (spc & (spc - 1U)) == 0U) {
            outInfo->fsType = DSF_FS_FAT32;
            outInfo->bytesPerSector = bps;
            outInfo->sectorsPerCluster = spc;
            outInfo->clusterSizeBytes = (uint32_t)bps * (uint32_t)spc;
            outInfo->reservedSectors = resSecs;
            uint32_t tot16 = dsf_read_u16_le(vbrSectorBuffer + 19);
            uint32_t tot32 = dsf_read_u32_le(vbrSectorBuffer + 32);
            outInfo->totalSectors = (tot16 != 0) ? (uint64_t)tot16 : (uint64_t)tot32;
            outInfo->rootCluster = dsf_read_u32_le(vbrSectorBuffer + 44);
            return true;
        }
        return false;
    }

    return false;
}
