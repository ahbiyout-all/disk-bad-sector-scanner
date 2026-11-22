/**
 * @file DiskSentinelIntegrity.cpp
 * @brief Implementation of Pure Creative Bit-Rot Integrity, Extent Correlation,
 *        Scan Diff Velocity & Fleet Watchdog Matrix Engine (DiskSentinelIntegrity.dll)
 * @license Apache-2.0
 */

#ifndef DSI_EXPORTS
#define DSI_EXPORTS
#endif

#include "DiskSentinelIntegrity.h"
#include <string.h>
#include <math.h>
#include <vector>
#include <algorithm>

#ifdef _WIN32
#include <windows.h>
BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved) {
    (void)hModule;
    (void)ul_reason_for_call;
    (void)lpReserved;
    return TRUE;
}
#endif

static const char* DSI_ENGINE_VERSION = "4.6.0-integrity";

static inline double dsi_clamp(double v, double lo, double hi) {
    if (!isfinite(v)) return lo;
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

static inline uint32_t dsi_rotr32(uint32_t x, uint32_t n) {
    return (x >> n) | (x << (32U - n));
}

// ===========================================================================
// 1. Slicing-by-8 IEEE 802.3 CRC32 + FNV-1a 64-bit
// ===========================================================================

static uint32_t dsi_crc32_ieee(const uint8_t* data, uint32_t len) {
    static uint32_t tables[8][256];
    static bool initialized = false;
    if (!initialized) {
        for (uint32_t i = 0; i < 256U; ++i) {
            uint32_t c = i;
            for (int k = 0; k < 8; ++k) {
                c = (c & 1U) ? (0xEDB88320U ^ (c >> 1U)) : (c >> 1U);
            }
            tables[0][i] = c;
        }
        for (uint32_t t = 1; t < 8U; ++t) {
            for (uint32_t i = 0; i < 256U; ++i) {
                uint32_t prev = tables[t - 1U][i];
                tables[t][i] = (prev >> 8U) ^ tables[0][prev & 0xFFU];
            }
        }
        initialized = true;
    }

    uint32_t crc = 0xFFFFFFFFU;
    uint32_t idx = 0;
    while (idx + 8U <= len) {
        uint32_t low = (uint32_t)data[idx] |
                       ((uint32_t)data[idx + 1U] << 8U) |
                       ((uint32_t)data[idx + 2U] << 16U) |
                       ((uint32_t)data[idx + 3U] << 24U);
        uint32_t high = (uint32_t)data[idx + 4U] |
                        ((uint32_t)data[idx + 5U] << 8U) |
                        ((uint32_t)data[idx + 6U] << 16U) |
                        ((uint32_t)data[idx + 7U] << 24U);
        low ^= crc;
        crc = tables[7][low & 0xFFU] ^
              tables[6][(low >> 8U) & 0xFFU] ^
              tables[5][(low >> 16U) & 0xFFU] ^
              tables[4][(low >> 24U) & 0xFFU] ^
              tables[3][high & 0xFFU] ^
              tables[2][(high >> 8U) & 0xFFU] ^
              tables[1][(high >> 16U) & 0xFFU] ^
              tables[0][(high >> 24U) & 0xFFU];
        idx += 8U;
    }
    while (idx < len) {
        crc = tables[0][(crc ^ data[idx]) & 0xFFU] ^ (crc >> 8U);
        ++idx;
    }
    return crc ^ 0xFFFFFFFFU;
}

static uint64_t dsi_fnv1a64(const uint8_t* data, uint32_t len) {
    uint64_t h = 14695981039346656037ULL;
    for (uint32_t i = 0; i < len; ++i) {
        h ^= (uint64_t)data[i];
        h *= 1099511628211ULL;
    }
    return h;
}

// ===========================================================================
// 2. FIPS 180-4 SHA-256 Compression Core
// ===========================================================================

static const uint32_t DSI_SHA256_K[64] = {
    0x428a2f98U, 0x71374491U, 0xb5c0fbcfU, 0xe9b5dba5U, 0x3956c25bU, 0x59f111f1U, 0x923f82a4U, 0xab1c5ed5U,
    0xd807aa98U, 0x12835b01U, 0x243185beU, 0x550c7dc3U, 0x72be5d74U, 0x80deb1feU, 0x9bdc06a7U, 0xc19bf174U,
    0xe49b69c1U, 0xefbe4786U, 0x0fc19dc6U, 0x240ca1ccU, 0x2de92c6fU, 0x4a7484aaU, 0x5cb0a9dcU, 0x76f988daU,
    0x983e5152U, 0xa831c66dU, 0xb00327c8U, 0xbf597fc7U, 0xc6e00bf3U, 0xd5a79147U, 0x06ca6351U, 0x14292967U,
    0x27b70a85U, 0x2e1b2138U, 0x4d2c6dfcU, 0x53380d13U, 0x650a7354U, 0x766a0abbU, 0x81c2c92eU, 0x92722c85U,
    0xa2bfe8a1U, 0xa81a664bU, 0xc24b8b70U, 0xc76c51a3U, 0xd192e819U, 0xd6990624U, 0xf40e3585U, 0x106aa070U,
    0x19a4c116U, 0x1e376c08U, 0x2748774cU, 0x34b0bcb5U, 0x391c0cb3U, 0x4ed8aa4aU, 0x5b9cca4fU, 0x682e6ff3U,
    0x748f82eeU, 0x78a5636fU, 0x84c87814U, 0x8cc70208U, 0x90befffaU, 0xa4506cebU, 0xbef9a3f7U, 0xc67178f2U
};

static void dsi_sha256_transform(uint32_t state[8], const uint8_t block[64]) {
    uint32_t w[64];
    for (uint32_t i = 0; i < 16U; ++i) {
        uint32_t j = i * 4U;
        w[i] = ((uint32_t)block[j] << 24U) |
               ((uint32_t)block[j + 1U] << 16U) |
               ((uint32_t)block[j + 2U] << 8U) |
               (uint32_t)block[j + 3U];
    }
    for (uint32_t i = 16U; i < 64U; ++i) {
        uint32_t s0 = dsi_rotr32(w[i - 15U], 7U) ^ dsi_rotr32(w[i - 15U], 18U) ^ (w[i - 15U] >> 3U);
        uint32_t s1 = dsi_rotr32(w[i - 2U], 17U) ^ dsi_rotr32(w[i - 2U], 19U) ^ (w[i - 2U] >> 10U);
        w[i] = w[i - 16U] + s0 + w[i - 7U] + s1;
    }

    uint32_t a = state[0];
    uint32_t b = state[1];
    uint32_t c = state[2];
    uint32_t d = state[3];
    uint32_t e = state[4];
    uint32_t f = state[5];
    uint32_t g = state[6];
    uint32_t h = state[7];

    for (uint32_t i = 0; i < 64U; ++i) {
        uint32_t s1 = dsi_rotr32(e, 6U) ^ dsi_rotr32(e, 11U) ^ dsi_rotr32(e, 25U);
        uint32_t ch = (e & f) ^ ((~e) & g);
        uint32_t temp1 = h + s1 + ch + DSI_SHA256_K[i] + w[i];
        uint32_t s0 = dsi_rotr32(a, 2U) ^ dsi_rotr32(a, 13U) ^ dsi_rotr32(a, 22U);
        uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
        uint32_t temp2 = s0 + maj;

        h = g;
        g = f;
        f = e;
        e = d + temp1;
        d = c;
        c = b;
        b = a;
        a = temp1 + temp2;
    }

    state[0] += a;
    state[1] += b;
    state[2] += c;
    state[3] += d;
    state[4] += e;
    state[5] += f;
    state[6] += g;
    state[7] += h;
}

DSI_API bool DSI_CALL DSI_Sha256Init(DSISha256Context* ctx) {
    if (!ctx) return false;
    memset(ctx, 0, sizeof(DSISha256Context));
    ctx->state[0] = 0x6a09e667U;
    ctx->state[1] = 0xbb67ae85U;
    ctx->state[2] = 0x3c6ef372U;
    ctx->state[3] = 0xa54ff53aU;
    ctx->state[4] = 0x510e527fU;
    ctx->state[5] = 0x9b05688cU;
    ctx->state[6] = 0x1f83d9abU;
    ctx->state[7] = 0x5be0cd19U;
    return true;
}

DSI_API bool DSI_CALL DSI_Sha256Update(
    DSISha256Context* ctx,
    const uint8_t* pData,
    uint32_t dataLen
) {
    if (!ctx || ctx->finalized) return false;
    if (dataLen == 0U) return true;
    if (!pData) return false;

    ctx->totalBytes += (uint64_t)dataLen;
    uint32_t idx = 0U;

    if (ctx->bufLen > 0U) {
        uint32_t needed = 64U - ctx->bufLen;
        uint32_t take = (dataLen < needed) ? dataLen : needed;
        memcpy(ctx->buffer + ctx->bufLen, pData, take);
        ctx->bufLen += take;
        idx += take;
        if (ctx->bufLen == 64U) {
            dsi_sha256_transform(ctx->state, ctx->buffer);
            ctx->bufLen = 0U;
        }
    }

    while (idx + 64U <= dataLen) {
        dsi_sha256_transform(ctx->state, pData + idx);
        idx += 64U;
    }

    if (idx < dataLen) {
        uint32_t rem = dataLen - idx;
        memcpy(ctx->buffer, pData + idx, rem);
        ctx->bufLen = rem;
    }
    return true;
}

DSI_API bool DSI_CALL DSI_Sha256Final(
    DSISha256Context* ctx,
    uint8_t outDigest[32],
    char* outHex65
) {
    if (!ctx || ctx->finalized) return false;

    uint64_t bitLen = ctx->totalBytes * 8ULL;
    uint32_t len = ctx->bufLen;
    ctx->buffer[len] = 0x80U;
    if (len + 1U > 56U) {
        if (len + 1U < 64U) {
            memset(ctx->buffer + len + 1U, 0, 64U - (len + 1U));
        }
        dsi_sha256_transform(ctx->state, ctx->buffer);
        memset(ctx->buffer, 0, 56U);
    } else {
        memset(ctx->buffer + len + 1U, 0, 56U - (len + 1U));
    }

    for (int i = 0; i < 8; ++i) {
        ctx->buffer[56 + i] = (uint8_t)((bitLen >> (56 - i * 8)) & 0xFFULL);
    }
    dsi_sha256_transform(ctx->state, ctx->buffer);
    ctx->finalized = 1U;

    static const char HEX_DIGITS[] = "0123456789abcdef";
    for (uint32_t i = 0; i < 8U; ++i) {
        uint32_t w = ctx->state[i];
        uint8_t b0 = (uint8_t)((w >> 24U) & 0xFFU);
        uint8_t b1 = (uint8_t)((w >> 16U) & 0xFFU);
        uint8_t b2 = (uint8_t)((w >> 8U) & 0xFFU);
        uint8_t b3 = (uint8_t)(w & 0xFFU);
        if (outDigest) {
            outDigest[i * 4U + 0U] = b0;
            outDigest[i * 4U + 1U] = b1;
            outDigest[i * 4U + 2U] = b2;
            outDigest[i * 4U + 3U] = b3;
        }
        if (outHex65) {
            outHex65[i * 8U + 0U] = HEX_DIGITS[(b0 >> 4U) & 0x0FU];
            outHex65[i * 8U + 1U] = HEX_DIGITS[b0 & 0x0FU];
            outHex65[i * 8U + 2U] = HEX_DIGITS[(b1 >> 4U) & 0x0FU];
            outHex65[i * 8U + 3U] = HEX_DIGITS[b1 & 0x0FU];
            outHex65[i * 8U + 4U] = HEX_DIGITS[(b2 >> 4U) & 0x0FU];
            outHex65[i * 8U + 5U] = HEX_DIGITS[b2 & 0x0FU];
            outHex65[i * 8U + 6U] = HEX_DIGITS[(b3 >> 4U) & 0x0FU];
            outHex65[i * 8U + 7U] = HEX_DIGITS[b3 & 0x0FU];
        }
    }
    if (outHex65) {
        outHex65[64] = '\0';
    }
    return true;
}

DSI_API bool DSI_CALL DSI_ComputeIntegrityDigest(
    const uint8_t* pData,
    uint32_t dataLen,
    DSIIntegrityDigestReport* outReport
) {
    if (!outReport) return false;
    if (dataLen > 0U && !pData) return false;
    memset(outReport, 0, sizeof(DSIIntegrityDigestReport));

    DSISha256Context ctx;
    DSI_Sha256Init(&ctx);
    if (dataLen > 0U) {
        DSI_Sha256Update(&ctx, pData, dataLen);
    }
    DSI_Sha256Final(&ctx, outReport->sha256Bytes, outReport->sha256Hex);

    outReport->inspectedBytes = (uint64_t)dataLen;
    outReport->crc32 = (dataLen > 0U) ? dsi_crc32_ieee(pData, dataLen) : 0U;
    outReport->fnv1a64 = (dataLen > 0U) ? dsi_fnv1a64(pData, dataLen) : 14695981039346656037ULL;
    return true;
}

// ===========================================================================
// 3. O((E + B) log B) Extent Correlation & Bit-Rot Risk Scorer
// ===========================================================================

static void dsi_collect_extent_hits(
    const DSIExtentInterval* extents,
    uint32_t extentCount,
    const std::vector<uint64_t>& sortedLbas,
    uint64_t* outHits,
    uint32_t maxHits,
    uint32_t* outHitCount,
    uint32_t* outSectorSpanCount
) {
    *outHitCount = 0U;
    *outSectorSpanCount = 0U;
    if (!extents || extentCount == 0U || sortedLbas.empty()) return;

    std::vector<uint64_t> uniqueHits;
    uniqueHits.reserve(64);
    uint64_t sectorAccumulator = 0ULL;

    for (uint32_t e = 0U; e < extentCount; ++e) {
        uint64_t s = extents[e].startLba;
        uint64_t end = extents[e].endLba;
        if (end < s) continue;

        auto it = std::lower_bound(sortedLbas.begin(), sortedLbas.end(), s);
        uint64_t prevMatched = UINT64_MAX;
        for (; it != sortedLbas.end(); ++it) {
            uint64_t lba = *it;
            if (lba > end) break;
            if (lba != prevMatched) {
                ++sectorAccumulator;
                prevMatched = lba;
                if (uniqueHits.size() < 256U) {
                    uniqueHits.push_back(lba);
                }
            }
        }
    }

    if (!uniqueHits.empty()) {
        std::sort(uniqueHits.begin(), uniqueHits.end());
        uniqueHits.erase(std::unique(uniqueHits.begin(), uniqueHits.end()), uniqueHits.end());
        uint32_t totalUnique = (uint32_t)uniqueHits.size();
        *outHitCount = totalUnique;
        if (outHits && maxHits > 0U) {
            uint32_t toCopy = (totalUnique < maxHits) ? totalUnique : maxHits;
            for (uint32_t i = 0U; i < toCopy; ++i) {
                outHits[i] = uniqueHits[i];
            }
        }
    }
    *outSectorSpanCount = (sectorAccumulator > 0xFFFFFFFFULL) ? 0xFFFFFFFFU : (uint32_t)sectorAccumulator;
}

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
) {
    if (!outReport) return false;
    memset(outReport, 0, sizeof(DSIExtentIntegrityReport));
    outReport->extentCount = extentCount;
    outReport->hashChanged = hashMismatch ? 1U : 0U;
    outReport->isUnreadable = isUnreadable ? 1U : 0U;
    outReport->isMissing = isMissing ? 1U : 0U;

    uint64_t mappedSectors = 0ULL;
    if (extents && extentCount > 0U) {
        for (uint32_t i = 0U; i < extentCount; ++i) {
            if (extents[i].endLba >= extents[i].startLba) {
                mappedSectors += (extents[i].endLba - extents[i].startLba) + 1ULL;
            }
        }
    }
    outReport->totalMappedSectors = mappedSectors;

    std::vector<uint64_t> badVec;
    if (badLbas && badCount > 0U) {
        badVec.assign(badLbas, badLbas + badCount);
        if (!inputsSorted) {
            std::sort(badVec.begin(), badVec.end());
        }
    }

    std::vector<uint64_t> slowVec;
    if (slowLbas && slowCount > 0U) {
        slowVec.assign(slowLbas, slowLbas + slowCount);
        if (!inputsSorted) {
            std::sort(slowVec.begin(), slowVec.end());
        }
    }

    uint32_t badHitCount = 0U;
    uint32_t badSpanCount = 0U;
    dsi_collect_extent_hits(
        extents,
        extentCount,
        badVec,
        outBadHits,
        maxBadHits,
        &badHitCount,
        &badSpanCount
    );

    uint32_t slowHitCount = 0U;
    uint32_t slowSpanCount = 0U;
    dsi_collect_extent_hits(
        extents,
        extentCount,
        slowVec,
        outSlowHits,
        maxSlowHits,
        &slowHitCount,
        &slowSpanCount
    );

    outReport->badHitCount = badHitCount;
    outReport->slowHitCount = slowHitCount;
    outReport->affectedBadSectors = badSpanCount;
    outReport->affectedSlowSectors = slowSpanCount;

    uint32_t status = DSI_STATUS_UNVERIFIED;
    if (isMissing) {
        status = DSI_STATUS_MISSING;
    } else if (isUnreadable) {
        status = DSI_STATUS_UNREADABLE;
    } else if (hashMismatch) {
        status = DSI_STATUS_HASH_MISMATCH;
    } else if (badHitCount > 0U) {
        status = DSI_STATUS_BAD_LBA_OVERLAP;
    } else if (slowHitCount > 0U) {
        status = DSI_STATUS_SLOW_LBA_OVERLAP;
    } else if (hasSha256) {
        status = DSI_STATUS_VERIFIED;
    }
    outReport->statusCode = status;

    double risk = 0.0;
    if (isMissing) {
        risk = 100.0;
    } else {
        if (hashMismatch) risk += 78.0;
        if (isUnreadable) risk += 85.0;
        if (badHitCount > 0U) risk += 55.0 + dsi_clamp((double)badHitCount * 6.5, 0.0, 35.0);
        if (slowHitCount > 0U) risk += 18.0 + dsi_clamp((double)slowHitCount * 2.5, 0.0, 22.0);
        if (extentCount > 32U) {
            risk += dsi_clamp((double)(extentCount - 32U) * 0.25, 0.0, 10.0);
        }
    }
    outReport->riskScore = dsi_clamp(risk, 0.0, 100.0);
    outReport->survivabilityPct = dsi_clamp(100.0 - outReport->riskScore, 0.0, 100.0);
    return true;
}

// ===========================================================================
// 4. Scan-vs-Scan & S.M.A.R.T. Snapshot Delta / Daily Velocity Engine
// ===========================================================================

DSI_API bool DSI_CALL DSI_ComputeScanSmartDiff(
    const DSIScanDiffInput* pInput,
    const DSISmartAttrSnapshot* pAttrs,
    uint32_t attrCount,
    DSISmartAttrDiffRow* outAttrRows,
    uint32_t maxAttrRows,
    DSIScanDiffSummary* outSummary
) {
    if (!pInput || !outSummary) return false;
    memset(outSummary, 0, sizeof(DSIScanDiffSummary));

    int64_t deltaMs = pInput->timestampBMs - pInput->timestampAMs;
    double elapsedDays = (deltaMs > 0LL) ? ((double)deltaMs / 86400000.0) : 0.0;
    outSummary->elapsedDays = elapsedDays;

    int32_t badDelta = (int32_t)((int64_t)pInput->badSectorsB - (int64_t)pInput->badSectorsA);
    int32_t slowDelta = (int32_t)((int64_t)pInput->slowCriticalB - (int64_t)pInput->slowCriticalA);
    double healthDelta = pInput->healthScoreB - pInput->healthScoreA;
    double latDelta = pInput->avgReadLatencyMsB - pInput->avgReadLatencyMsA;

    outSummary->badDelta = badDelta;
    outSummary->slowCriticalDelta = slowDelta;
    outSummary->healthDelta = isfinite(healthDelta) ? healthDelta : 0.0;
    outSummary->latencyDeltaMs = isfinite(latDelta) ? latDelta : 0.0;

    // Guard against sub-hour noise explosions identically to Predictive engine
    if (elapsedDays >= (1.0 / 24.0)) {
        outSummary->badSectorsPerDay = (double)badDelta / elapsedDays;
        outSummary->healthLossPerDay = (-outSummary->healthDelta) / elapsedDays;
    } else {
        outSummary->badSectorsPerDay = 0.0;
        outSummary->healthLossPerDay = 0.0;
    }

    uint32_t worsenedCount = 0U;
    uint32_t improvedCount = 0U;
    if (pAttrs && attrCount > 0U) {
        for (uint32_t i = 0U; i < attrCount; ++i) {
            const DSISmartAttrSnapshot& a = pAttrs[i];
            int32_t curDelta = (a.presentA && a.presentB)
                ? ((int32_t)a.currentB - (int32_t)a.currentA)
                : 0;
            int64_t rawDelta = (a.presentA && a.presentB)
                ? ((int64_t)a.rawB - (int64_t)a.rawA)
                : 0LL;

            bool isWorsened = (a.presentA && a.presentB && a.statusA <= 2U && a.statusB <= 2U && a.statusB > a.statusA);
            bool isImproved = (a.presentA && a.presentB && a.statusA <= 2U && a.statusB <= 2U && a.statusB < a.statusA);
            if (isWorsened) ++worsenedCount;
            if (isImproved) ++improvedCount;

            if (outAttrRows && i < maxAttrRows) {
                DSISmartAttrDiffRow row;
                memset(&row, 0, sizeof(row));
                row.attributeId = a.attributeId;
                row.currentDelta = curDelta;
                row.rawDelta = rawDelta;
                row.worsened = isWorsened ? 1U : 0U;
                row.improved = isImproved ? 1U : 0U;
                row.statusA = a.statusA;
                row.statusB = a.statusB;
                outAttrRows[i] = row;
            }
        }
    }

    outSummary->worsenedAttrCount = worsenedCount;
    outSummary->improvedAttrCount = improvedCount;

    double regScore = 0.0;
    if (badDelta > 0) regScore += 42.0 + dsi_clamp((double)badDelta * 4.5, 0.0, 28.0);
    if (slowDelta > 0) regScore += dsi_clamp((double)slowDelta * 1.2, 0.0, 16.0);
    if (outSummary->healthDelta < 0.0) regScore += dsi_clamp(-outSummary->healthDelta * 1.5, 0.0, 22.0);
    if (outSummary->latencyDeltaMs > 5.0) regScore += dsi_clamp((outSummary->latencyDeltaMs - 5.0) * 0.4, 0.0, 12.0);
    regScore += (double)worsenedCount * 8.5;
    regScore -= (double)improvedCount * 4.0;
    outSummary->regressionScore = dsi_clamp(regScore, 0.0, 100.0);

    uint32_t grade = DSI_REG_STABLE;
    if (badDelta >= 5 || worsenedCount >= 2 || outSummary->healthDelta <= -15.0 || outSummary->regressionScore >= 55.0) {
        grade = DSI_REG_CRITICAL;
    } else if (badDelta > 0 || slowDelta > 0 || worsenedCount > 0 || outSummary->healthDelta <= -3.0 || outSummary->regressionScore >= 20.0) {
        grade = DSI_REG_DEGRADING;
    } else if (badDelta < 0 || improvedCount > 0 || outSummary->healthDelta >= 3.0) {
        grade = DSI_REG_IMPROVED;
    }
    outSummary->regressionGradeCode = grade;
    return true;
}

// ===========================================================================
// 5. Fleet Watchdog SLA Rule Matrix Evaluator
// ===========================================================================

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
) {
    if (!outReport) return false;
    memset(outReport, 0, sizeof(DSIWatchdogMatrixReport));
    outReport->evaluatedDriveCount = driveCount;
    outReport->evaluatedRuleCount = ruleCount;
    outReport->worstDriveIndex = -1;

    if (!pDrives || driveCount == 0U) {
        outReport->fleetHealthIndex = 100.0;
        return true;
    }

    double healthSum = 0.0;
    uint32_t healthValidCount = 0U;
    double worstHealth = 101.0;
    for (uint32_t d = 0U; d < driveCount; ++d) {
        double h = pDrives[d].healthScore;
        if (isfinite(h) && h >= 0.0) {
            double clamped = dsi_clamp(h, 0.0, 100.0);
            healthSum += clamped;
            ++healthValidCount;
            if (clamped < worstHealth) {
                worstHealth = clamped;
                outReport->worstDriveIndex = (int32_t)pDrives[d].driveIndex;
            }
        }
    }
    outReport->fleetHealthIndex = (healthValidCount > 0U)
        ? (healthSum / (double)healthValidCount)
        : 100.0;

    if (!pRules || ruleCount == 0U) {
        return true;
    }

    uint32_t trigCount = 0U;
    std::vector<uint32_t> quickScanTargets;

    for (uint32_t r = 0U; r < ruleCount; ++r) {
        const DSIWatchdogRuleInput& rule = pRules[r];
        if (!rule.enabled) continue;

        if (rule.metricCode == DSI_WD_SCHEDULED_QUICK_SCAN) {
            int64_t intervalMs = (int64_t)((rule.intervalMinutes < 5U) ? 5U : rule.intervalMinutes) * 60000LL;
            if ((nowMs - rule.lastTriggeredMs) >= intervalMs) {
                for (uint32_t d = 0U; d < driveCount; ++d) {
                    if (rule.targetDriveIndex >= 0 && (uint32_t)rule.targetDriveIndex != pDrives[d].driveIndex) {
                        continue;
                    }
                    uint32_t dIdx = pDrives[d].driveIndex;
                    if (std::find(quickScanTargets.begin(), quickScanTargets.end(), dIdx) == quickScanTargets.end()) {
                        quickScanTargets.push_back(dIdx);
                    }
                    if (outTriggers && trigCount < maxTriggers) {
                        DSIWatchdogTriggerOut t;
                        t.ruleIndex = rule.ruleIndex;
                        t.driveIndex = dIdx;
                        t.metricCode = rule.metricCode;
                        t.severityCode = 0U;
                        t.observedValue = (double)rule.intervalMinutes;
                        t.thresholdValue = (double)rule.intervalMinutes;
                        outTriggers[trigCount] = t;
                    }
                    ++trigCount;
                }
            }
            continue;
        }

        int64_t cooldownMs = (int64_t)((rule.cooldownMinutes < 1U) ? 1U : rule.cooldownMinutes) * 60000LL;
        if (rule.lastTriggeredMs > 0LL && (nowMs - rule.lastTriggeredMs) < cooldownMs) {
            continue;
        }

        for (uint32_t d = 0U; d < driveCount; ++d) {
            const DSIWatchdogDriveState& drv = pDrives[d];
            if (rule.targetDriveIndex >= 0 && (uint32_t)rule.targetDriveIndex != drv.driveIndex) {
                continue;
            }

            bool matched = false;
            uint32_t severity = 1U;
            double observed = 0.0;

            if (rule.metricCode == DSI_WD_TEMP) {
                if (drv.temperatureC >= 0 && (double)drv.temperatureC >= rule.thresholdValue) {
                    matched = true;
                    observed = (double)drv.temperatureC;
                    severity = ((double)drv.temperatureC >= rule.thresholdValue + 5.0) ? 2U : 1U;
                }
            } else if (rule.metricCode == DSI_WD_SMART_C5) {
                if (drv.smartC5Raw != UINT64_MAX && drv.smartC5Raw >= (uint64_t)(rule.thresholdValue < 1.0 ? 1.0 : rule.thresholdValue)) {
                    matched = true;
                    observed = (double)drv.smartC5Raw;
                    severity = 2U;
                }
            } else if (rule.metricCode == DSI_WD_SMART_05_DELTA) {
                if (drv.smart05Raw != UINT64_MAX && drv.smart05Baseline != UINT64_MAX && drv.smart05Raw > drv.smart05Baseline) {
                    uint64_t delta = drv.smart05Raw - drv.smart05Baseline;
                    if (delta >= (uint64_t)(rule.thresholdValue < 1.0 ? 1.0 : rule.thresholdValue)) {
                        matched = true;
                        observed = (double)delta;
                        severity = 2U;
                    }
                }
            } else if (rule.metricCode == DSI_WD_HEALTH_SCORE) {
                if (isfinite(drv.healthScore) && drv.healthScore >= 0.0 && drv.healthScore <= rule.thresholdValue) {
                    matched = true;
                    observed = drv.healthScore;
                    severity = (drv.healthScore <= 50.0) ? 2U : 1U;
                }
            } else if (rule.metricCode == DSI_WD_LINK_DOWNGRADED) {
                if (drv.isLinkDowngraded != 0U) {
                    matched = true;
                    observed = 1.0;
                    severity = 1U;
                }
            }

            if (matched) {
                if (outTriggers && trigCount < maxTriggers) {
                    DSIWatchdogTriggerOut t;
                    t.ruleIndex = rule.ruleIndex;
                    t.driveIndex = drv.driveIndex;
                    t.metricCode = rule.metricCode;
                    t.severityCode = severity;
                    t.observedValue = observed;
                    t.thresholdValue = rule.thresholdValue;
                    outTriggers[trigCount] = t;
                }
                ++trigCount;
            }
        }
    }

    outReport->triggeredCount = trigCount;
    outReport->quickScanTargetCount = (uint32_t)quickScanTargets.size();
    if (outQuickScanDriveIndices && maxQuickScanTargets > 0U) {
        uint32_t toCopy = ((uint32_t)quickScanTargets.size() < maxQuickScanTargets)
            ? (uint32_t)quickScanTargets.size()
            : maxQuickScanTargets;
        for (uint32_t i = 0U; i < toCopy; ++i) {
            outQuickScanDriveIndices[i] = quickScanTargets[i];
        }
    }
    return true;
}

// ===========================================================================
// 6. Engine Metadata & Known-Answer Self-Test (KAT)
// ===========================================================================

DSI_API bool DSI_CALL DSI_GetIntegrityEngineInfo(DSIEngineInfo* outInfo) {
    if (!outInfo) return false;
    memset(outInfo, 0, sizeof(DSIEngineInfo));

    strncpy(outInfo->version, DSI_ENGINE_VERSION, sizeof(outInfo->version) - 1U);
    outInfo->capabilityMask =
        DSI_CAP_SHA256_STREAM |
        DSI_CAP_EXTENT_CORRELATE |
        DSI_CAP_SCAN_SMART_DIFF |
        DSI_CAP_WATCHDOG_MATRIX;

    // 1. FIPS 180-4 SHA-256("abc") Known-Answer Test
    static const uint8_t KAT_ABC[3] = { 'a', 'b', 'c' };
    DSIIntegrityDigestReport digestRep;
    bool digestOk = DSI_ComputeIntegrityDigest(KAT_ABC, 3U, &digestRep);
    bool shaOk = digestOk &&
        (strcmp(digestRep.sha256Hex, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") == 0);

    // 2. IEEE 802.3 CRC32("123456789") == 0xCBF43926
    static const uint8_t KAT_CRC[9] = { '1', '2', '3', '4', '5', '6', '7', '8', '9' };
    uint32_t crcVal = dsi_crc32_ieee(KAT_CRC, 9U);
    bool crcOk = (crcVal == 0xCBF43926U);

    // 3. Extent Correlation Known-Answer Test
    DSIExtentInterval ext = { 1000ULL, 1050ULL };
    uint64_t badArr[2] = { 1024ULL, 2048ULL };
    uint64_t badHits[4] = { 0 };
    DSIExtentIntegrityReport extRep;
    bool extOk = DSI_EvaluateExtentIntegrity(
        &ext, 1U, badArr, 2U, nullptr, 0U, true, false, false, false, true,
        badHits, 4U, nullptr, 0U, &extRep
    ) && extRep.statusCode == DSI_STATUS_BAD_LBA_OVERLAP && extRep.badHitCount == 1U && badHits[0] == 1024ULL;

    // 4. Scan Diff Velocity Known-Answer Test (2 bad sectors / 2 days = 1.0/day, score 52.5 => DEGRADING)
    DSIScanDiffInput diffIn;
    memset(&diffIn, 0, sizeof(diffIn));
    diffIn.timestampAMs = 1000000LL;
    diffIn.timestampBMs = 1000000LL + 2LL * 86400000LL;
    diffIn.badSectorsA = 0U;
    diffIn.badSectorsB = 2U;
    diffIn.healthScoreA = 98.0;
    diffIn.healthScoreB = 97.0;
    DSIScanDiffSummary diffOut;
    bool diffOk = DSI_ComputeScanSmartDiff(&diffIn, nullptr, 0U, nullptr, 0U, &diffOut)
        && diffOut.badDelta == 2
        && fabs(diffOut.badSectorsPerDay - 1.0) < 1e-6
        && diffOut.regressionGradeCode == DSI_REG_DEGRADING;

    outInfo->sha256KatPassed = shaOk ? 1U : 0U;
    outInfo->extentKatPassed = extOk ? 1U : 0U;
    outInfo->diffKatPassed = diffOk ? 1U : 0U;
    outInfo->selfTestPassed = (shaOk && crcOk && extOk && diffOk) ? 1U : 0U;
    outInfo->selfTestCrc32 = crcVal;
    outInfo->selfTestFnv1a64 = digestRep.fnv1a64;
    memcpy(outInfo->sha256KatHex, digestRep.sha256Hex, 65);
    return true;
}
