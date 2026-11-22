/**
 * @file DiskSentinelRecovery.cpp
 * @brief Pure Creative Deep Recovery, NTFS MFT Decoder & Sanitize Verification Engine
 * @license Apache-2.0
 */

#ifndef DSR_EXPORTS
#define DSR_EXPORTS
#endif
#include "DiskSentinelRecovery.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <vector>

namespace {

static void dsr_safe_strcpy(char* dst, const char* src, size_t dstSize) {
    if (!dst || dstSize == 0) return;
    if (!src) {
        dst[0] = '\0';
        return;
    }
    size_t i = 0;
    while (i + 1 < dstSize && src[i] != '\0') {
        dst[i] = src[i];
        ++i;
    }
    dst[i] = '\0';
}

struct DSRCrc32Table {
    uint32_t t[256];
    DSRCrc32Table() {
        for (uint32_t i = 0; i < 256; ++i) {
            uint32_t c = i;
            for (int k = 0; k < 8; ++k) {
                c = (c >> 1) ^ ((c & 1U) ? 0xEDB88320U : 0U);
            }
            t[i] = c;
        }
    }
};

static const DSRCrc32Table& dsr_crc_table() {
    static const DSRCrc32Table s_tbl;
    return s_tbl;
}

static uint32_t dsr_crc32_ieee(const uint8_t* data, uint32_t len) {
    if (!data || len == 0) return 0U;
    const DSRCrc32Table& tbl = dsr_crc_table();
    uint32_t crc = 0xFFFFFFFFU;
    for (uint32_t i = 0; i < len; ++i) {
        crc = tbl.t[(crc ^ data[i]) & 0xFFU] ^ (crc >> 8);
    }
    return ~crc;
}

static inline uint16_t dsr_u16le(const uint8_t* b, size_t off) {
    return (uint16_t)b[off] | ((uint16_t)b[off + 1] << 8);
}

static inline uint32_t dsr_u32le(const uint8_t* b, size_t off) {
    return (uint32_t)b[off] |
           ((uint32_t)b[off + 1] << 8) |
           ((uint32_t)b[off + 2] << 16) |
           ((uint32_t)b[off + 3] << 24);
}

static inline uint64_t dsr_u64le(const uint8_t* b, size_t off) {
    uint64_t lo = (uint64_t)dsr_u32le(b, off);
    uint64_t hi = (uint64_t)dsr_u32le(b, off + 4);
    return lo | (hi << 32);
}

static inline uint32_t dsr_popcount8(uint8_t v) {
    uint32_t c = 0;
    while (v) {
        c += (v & 1U);
        v >>= 1;
    }
    return c;
}

static inline uint64_t dsr_rotl64(uint64_t x, int k) {
    return (x << k) | (x >> (64 - k));
}

static inline uint64_t dsr_splitmix64(uint64_t& state) {
    uint64_t z = (state += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

struct DSRXoshiro256StarStar {
    uint64_t s[4];

    void init(uint64_t seed64, uint64_t lbaOffset) {
        uint64_t sm = seed64 ^ (lbaOffset * 0xD6E8FEB86659FD93ULL) ^ 0xA0761D6478BD642FULL;
        s[0] = dsr_splitmix64(sm);
        s[1] = dsr_splitmix64(sm);
        s[2] = dsr_splitmix64(sm);
        s[3] = dsr_splitmix64(sm);
        if ((s[0] | s[1] | s[2] | s[3]) == 0ULL) {
            s[0] = 0x243F6A8885A308D3ULL;
            s[1] = 0x13198A2E03707344ULL;
            s[2] = 0xA4093822299F31D0ULL;
            s[3] = 0x082EFA98EC4E6C89ULL;
        }
    }

    inline uint64_t next64() {
        const uint64_t result = dsr_rotl64(s[1] * 5ULL, 7) * 9ULL;
        const uint64_t t = s[1] << 17;
        s[2] ^= s[0];
        s[3] ^= s[1];
        s[1] ^= s[2];
        s[0] ^= s[3];
        s[2] ^= t;
        s[3] = dsr_rotl64(s[3], 45);
        return result;
    }
};

static int64_t dsr_find_subseq(const uint8_t* buf, uint32_t len, const uint8_t* needle, uint32_t needleLen, uint32_t startOff) {
    if (!buf || !needle || needleLen == 0 || len < needleLen || startOff > len - needleLen) return -1;
    uint32_t limit = len - needleLen;
    for (uint32_t i = startOff; i <= limit; ++i) {
        if (buf[i] == needle[0] && memcmp(buf + i, needle, needleLen) == 0) {
            return (int64_t)i;
        }
    }
    return -1;
}

static void dsr_utf16le_to_utf8(const uint8_t* src, uint32_t charCount, uint32_t maxAvailBytes, char* outUtf8, size_t outSize) {
    if (!outUtf8 || outSize == 0) return;
    outUtf8[0] = '\0';
    if (!src || charCount == 0 || maxAvailBytes < 2) return;

    uint32_t availChars = maxAvailBytes / 2U;
    uint32_t limitChars = (charCount < availChars) ? charCount : availChars;
    size_t outPos = 0;

    for (uint32_t i = 0; i < limitChars; ++i) {
        uint16_t u1 = dsr_u16le(src, (size_t)i * 2U);
        if (u1 == 0) break;
        uint32_t cp = u1;
        if (u1 >= 0xD800U && u1 <= 0xDBFFU && (i + 1U) < limitChars) {
            uint16_t u2 = dsr_u16le(src, (size_t)(i + 1U) * 2U);
            if (u2 >= 0xDC00U && u2 <= 0xDFFFU) {
                cp = 0x10000U + ((((uint32_t)(u1 - 0xD800U)) << 10) | (uint32_t)(u2 - 0xDC00U));
                ++i;
            } else {
                cp = 0xFFFDU;
            }
        } else if (u1 >= 0xDC00U && u1 <= 0xDFFFU) {
            cp = 0xFFFDU;
        }

        if (cp <= 0x7FU) {
            if (outPos + 1 >= outSize) break;
            outUtf8[outPos++] = (char)cp;
        } else if (cp <= 0x7FFU) {
            if (outPos + 2 >= outSize) break;
            outUtf8[outPos++] = (char)(0xC0U | (cp >> 6));
            outUtf8[outPos++] = (char)(0x80U | (cp & 0x3FU));
        } else if (cp <= 0xFFFFU) {
            if (outPos + 3 >= outSize) break;
            outUtf8[outPos++] = (char)(0xE0U | (cp >> 12));
            outUtf8[outPos++] = (char)(0x80U | ((cp >> 6) & 0x3FU));
            outUtf8[outPos++] = (char)(0x80U | (cp & 0x3FU));
        } else {
            if (outPos + 4 >= outSize) break;
            outUtf8[outPos++] = (char)(0xF0U | (cp >> 18));
            outUtf8[outPos++] = (char)(0x80U | ((cp >> 12) & 0x3FU));
            outUtf8[outPos++] = (char)(0x80U | ((cp >> 6) & 0x3FU));
            outUtf8[outPos++] = (char)(0x80U | (cp & 0x3FU));
        }
    }
    outUtf8[outPos] = '\0';
}

static int64_t dsr_read_signed_varint_le(const uint8_t* buf, uint32_t off, uint32_t len) {
    if (len == 0 || len > 8) return 0;
    uint64_t raw = 0ULL;
    for (uint32_t i = 0; i < len; ++i) {
        raw |= ((uint64_t)buf[off + i]) << (i * 8U);
    }
    if (len < 8 && (buf[off + len - 1] & 0x80U) != 0) {
        uint64_t mask = (~0ULL) << (len * 8U);
        raw |= mask;
    }
    return (int64_t)raw;
}

static uint64_t dsr_read_unsigned_varint_le(const uint8_t* buf, uint32_t off, uint32_t len) {
    if (len == 0 || len > 8) return 0ULL;
    uint64_t val = 0ULL;
    for (uint32_t i = 0; i < len; ++i) {
        val |= ((uint64_t)buf[off + i]) << (i * 8U);
    }
    return val;
}

static uint32_t dsr_decode_data_runs(
    const uint8_t* attrBytes,
    uint32_t runListStart,
    uint32_t maxEnd,
    DSRNtfsDataRun* outRuns,
    uint32_t maxRuns
) {
    uint32_t pos = runListStart;
    int64_t prevLcn = 0;
    uint64_t curVcn = 0;
    uint32_t countOut = 0;

    while (pos < maxEnd) {
        uint8_t header = attrBytes[pos++];
        if (header == 0) break;

        uint32_t lenSize = header & 0x0FU;
        uint32_t offSize = (header >> 4) & 0x0FU;
        if (lenSize == 0 || lenSize > 8 || offSize > 8 || (pos + lenSize + offSize) > maxEnd) {
            break;
        }

        uint64_t clusterCount = dsr_read_unsigned_varint_le(attrBytes, pos, lenSize);
        pos += lenSize;
        int64_t lcnDelta = (offSize > 0) ? dsr_read_signed_varint_le(attrBytes, pos, offSize) : 0;
        pos += offSize;

        if (offSize > 0 && clusterCount > 0) {
            int64_t lcnStart = prevLcn + lcnDelta;
            prevLcn = lcnStart;
            if (lcnStart >= 0 && outRuns && countOut < maxRuns) {
                outRuns[countOut].lcnStart = (uint64_t)lcnStart;
                outRuns[countOut].vcnStart = curVcn;
                outRuns[countOut].clusterCount = clusterCount;
            }
            if (lcnStart >= 0) {
                countOut++;
            }
        }
        curVcn += clusterCount;
    }

    return countOut;
}

static int dsr_namespace_rank(int32_t ns) {
    if (ns == 1 || ns == 3) return 3; // Win32 / Win32+DOS
    if (ns == 0) return 2;            // POSIX
    return 1;                         // DOS-only
}

static bool dsr_parse_mft_internal(
    uint8_t* buf,
    uint32_t len,
    uint32_t recordIndexHint,
    bool applyUsaFixup,
    DSRNtfsMftParsedRecord* outRecord,
    DSRNtfsDataRun* outRuns,
    uint32_t maxRuns
) {
    if (!buf || len < 512U || !outRecord) return false;
    memset(outRecord, 0, sizeof(DSRNtfsMftParsedRecord));
    outRecord->bestNamespace = -1;
    outRecord->parentRecordNumber = 5U;

    if (buf[0] != 0x46 || buf[1] != 0x49 || buf[2] != 0x4C || buf[3] != 0x45) {
        return false; // Not "FILE"
    }

    uint16_t usaOffset = dsr_u16le(buf, 4);
    uint16_t usaCount = dsr_u16le(buf, 6);
    if (usaOffset < 42U || usaCount < 2U || (uint32_t)usaOffset + (uint32_t)usaCount * 2U > len) {
        return false;
    }

    if (applyUsaFixup) {
        uint8_t usnLo = buf[usaOffset];
        uint8_t usnHi = buf[usaOffset + 1U];
        uint32_t mismatches = 0;
        for (uint16_t sec = 1; sec < usaCount; ++sec) {
            uint32_t sectorEnd = (uint32_t)sec * 512U - 2U;
            if (sectorEnd + 1U >= len) break;
            if (buf[sectorEnd] == usnLo && buf[sectorEnd + 1U] == usnHi) {
                buf[sectorEnd] = buf[usaOffset + (uint32_t)sec * 2U];
                buf[sectorEnd + 1U] = buf[usaOffset + (uint32_t)sec * 2U + 1U];
            } else {
                mismatches++;
            }
        }
        outRecord->usaFixupApplied = 1;
        outRecord->usaMismatchSectors = mismatches;
    }

    uint16_t flags = dsr_u16le(buf, 22);
    bool inUse = (flags & 0x01U) != 0;
    bool isDir = (flags & 0x02U) != 0;
    outRecord->inUse = inUse ? 1 : 0;
    outRecord->isDirectory = isDir ? 1 : 0;

    uint32_t selfRecNum = dsr_u32le(buf, 44);
    if (selfRecNum == 0) selfRecNum = recordIndexHint;
    outRecord->recordNumber = selfRecNum;

    if (!inUse) {
        return true;
    }

    uint16_t firstAttrOff = dsr_u16le(buf, 20);
    uint32_t bytesUsed = dsr_u32le(buf, 24);
    if (bytesUsed == 0 || bytesUsed > len) bytesUsed = len;

    uint32_t off = firstAttrOff;
    uint32_t totalRunsWritten = 0;
    while (off + 16U <= bytesUsed) {
        uint32_t attrType = dsr_u32le(buf, off);
        if (attrType == 0xFFFFFFFFU || attrType == 0U) break;
        uint32_t attrLen = dsr_u32le(buf, off + 4U);
        if (attrLen < 16U || attrLen > (bytesUsed - off)) break;

        bool nonResident = (buf[off + 8U] != 0);

        // $STANDARD_INFORMATION (0x10)
        if (attrType == 0x10U && !nonResident && attrLen >= 24U) {
            uint32_t contentLen = dsr_u32le(buf, off + 16U);
            uint16_t contentRel = dsr_u16le(buf, off + 20U);
            if (contentLen >= 8U && contentRel <= attrLen && (attrLen - contentRel) >= 8U) {
                uint32_t contentOff = off + (uint32_t)contentRel;
                uint64_t ft = dsr_u64le(buf, contentOff);
                if (ft > 116444736000000000ULL) {
                    outRecord->creationTimestampMs = (int64_t)((ft - 116444736000000000ULL) / 10000ULL);
                }
            }
        }

        // $FILE_NAME (0x30)
        if (attrType == 0x30U && !nonResident && attrLen >= 24U) {
            uint32_t contentLen = dsr_u32le(buf, off + 16U);
            uint16_t contentRel = dsr_u16le(buf, off + 20U);
            if (contentLen >= 66U && contentRel <= attrLen && (attrLen - contentRel) >= 66U) {
                uint32_t contentOff = off + (uint32_t)contentRel;
                uint32_t pRec = dsr_u32le(buf, contentOff); // Low 32 bits cover 4B MFT records
                uint64_t ft = dsr_u64le(buf, contentOff + 8U);
                uint64_t realSize = dsr_u64le(buf, contentOff + 48U);
                uint8_t nameLen = buf[contentOff + 64U];
                int32_t ns = (int32_t)buf[contentOff + 65U];
                uint32_t nameStart = contentOff + 66U;
                uint32_t maxNameBytes = (off + attrLen > nameStart) ? (off + attrLen - nameStart) : 0U;

                if (nameLen > 0 && maxNameBytes >= 2U &&
                    dsr_namespace_rank(ns) >= dsr_namespace_rank(outRecord->bestNamespace)) {
                    dsr_utf16le_to_utf8(
                        buf + nameStart,
                        nameLen,
                        maxNameBytes,
                        outRecord->fileNameUtf8,
                        sizeof(outRecord->fileNameUtf8)
                    );
                    outRecord->bestNamespace = ns;
                    outRecord->parentRecordNumber = pRec;
                    if (outRecord->fileSizeBytes == 0 && realSize > 0) {
                        outRecord->fileSizeBytes = realSize;
                    }
                    if (outRecord->creationTimestampMs == 0 && ft > 116444736000000000ULL) {
                        outRecord->creationTimestampMs = (int64_t)((ft - 116444736000000000ULL) / 10000ULL);
                    }
                }
            }
        }

        // $DATA (0x80), primary unnamed stream has nameLen == 0
        if (attrType == 0x80U && buf[off + 9U] == 0U) {
            if (!nonResident && attrLen >= 24U) {
                outRecord->isResidentData = 1;
                uint32_t resSize = dsr_u32le(buf, off + 16U);
                if (resSize > 0) outRecord->fileSizeBytes = resSize;
            } else if (nonResident && attrLen >= 64U) {
                uint64_t realSize = dsr_u64le(buf, off + 48U);
                if (realSize > 0) outRecord->fileSizeBytes = realSize;
                uint16_t runListRel = dsr_u16le(buf, off + 32U);
                if (runListRel >= 64U && off + runListRel < off + attrLen) {
                    DSRNtfsDataRun* dstPtr = (outRuns && totalRunsWritten < maxRuns) ? (outRuns + totalRunsWritten) : NULL;
                    uint32_t remCap = (maxRuns > totalRunsWritten) ? (maxRuns - totalRunsWritten) : 0U;
                    uint32_t decoded = dsr_decode_data_runs(buf, off + runListRel, off + attrLen, dstPtr, remCap);
                    totalRunsWritten += decoded;
                    outRecord->dataRunCount += decoded;
                }
            }
        }

        off += attrLen;
    }

    return true;
}

} // namespace

DSR_API bool DSR_CALL DSR_GetRecoveryEngineInfo(DSREngineInfo* outInfo) {
    if (!outInfo) return false;
    memset(outInfo, 0, sizeof(DSREngineInfo));
    dsr_safe_strcpy(outInfo->version, "4.6.0", sizeof(outInfo->version));
    outInfo->capabilityMask =
        DSR_CAP_CARVE_16SIG |
        DSR_CAP_NTFS_MFT_USA |
        DSR_CAP_PRNG_SANITIZE |
        DSR_CAP_DDRESCUE_PLAN;
    outInfo->signatureRuleCount = 16U;

    const char* vec = "123456789";
    uint32_t crc = dsr_crc32_ieee((const uint8_t*)vec, 9U);
    outInfo->selfTestCrc32 = crc;

    DSRXoshiro256StarStar rng;
    rng.init(0x20260406ULL, 0ULL);
    uint64_t s1 = rng.next64();
    uint64_t s2 = rng.next64();
    outInfo->selfTestPrngSample = s1;

    // NTFS data-run self-test: 0x31 0x04 0x20 0x00 0x01 0x00 => LCN=0x010020 (65568), clusters=4
    const uint8_t runVec[6] = { 0x31, 0x04, 0x20, 0x00, 0x01, 0x00 };
    DSRNtfsDataRun testRun;
    memset(&testRun, 0, sizeof(testRun));
    uint32_t runCnt = dsr_decode_data_runs(runVec, 0, 6, &testRun, 1);

    outInfo->selfTestPassed = (
        crc == 0xCBF43926U &&
        s1 != s2 &&
        runCnt == 1U &&
        testRun.lcnStart == 0x010020ULL &&
        testRun.clusterCount == 4ULL
    ) ? 1 : 0;

    return true;
}

DSR_API bool DSR_CALL DSR_InspectRecoveryCarveBuffer(
    const uint8_t* pBuffer,
    uint32_t bufferLength,
    DSRCarveInspectionResult* outResult
) {
    if (!pBuffer || bufferLength == 0 || !outResult) return false;
    memset(outResult, 0, sizeof(DSRCarveInspectionResult));
    outResult->inspectedBytes = bufferLength;

    uint32_t hist[256];
    memset(hist, 0, sizeof(hist));
    uint32_t printable = 0;
    uint64_t zeroAcc = 0ULL;
    uint64_t galoisParity = 0ULL;

    for (uint32_t i = 0; i < bufferLength; ++i) {
        uint8_t b = pBuffer[i];
        hist[b]++;
        zeroAcc |= (uint64_t)b;
        galoisParity ^= ((uint64_t)b << ((i & 7U) * 8U));
        if ((b >= 32U && b <= 126U) || b == '\t' || b == '\r' || b == '\n') {
            printable++;
        }
    }

    double n = (double)bufferLength;
    double entropy = 0.0;
    for (int i = 0; i < 256; ++i) {
        if (hist[i] > 0U) {
            double p = (double)hist[i] / n;
            entropy -= p * log2(p);
        }
    }
    if (entropy < 0.0) entropy = 0.0;

    outResult->crc32 = dsr_crc32_ieee(pBuffer, bufferLength);
    outResult->galoisParity64 = galoisParity;
    outResult->shannonEntropy = entropy;
    outResult->printableRatio = (double)printable / n;
    outResult->isZeroFilled = (zeroAcc == 0ULL) ? 1 : 0;

    if (outResult->isZeroFilled) {
        outResult->signatureType = 0;
        outResult->confidenceScore = 100U;
        dsr_safe_strcpy(outResult->signatureName, "Zero-Filled / Deallocated Sector", sizeof(outResult->signatureName));
        dsr_safe_strcpy(outResult->fileExtension, "bin", sizeof(outResult->fileExtension));
        return true;
    }

    // 1. Exact Multi-Signature Header & Footer Inspection
    if (bufferLength >= 3 && pBuffer[0] == 0xFF && pBuffer[1] == 0xD8 && pBuffer[2] == 0xFF) {
        outResult->signatureType = 1;
        dsr_safe_strcpy(outResult->signatureName, "JPEG Image (EXIF/JFIF)", sizeof(outResult->signatureName));
        dsr_safe_strcpy(outResult->fileExtension, "jpg", sizeof(outResult->fileExtension));
        static const uint8_t kJpegEof[2] = { 0xFF, 0xD9 };
        int64_t eofOff = dsr_find_subseq(pBuffer, bufferLength, kJpegEof, 2, 4);
        if (eofOff >= 0) {
            outResult->footerDetected = 1;
            outResult->estimatedPayloadBytes = (uint64_t)(eofOff + 2);
            outResult->confidenceScore = 98U;
            dsr_safe_strcpy(outResult->footerMarker, "FF D9 (JPEG EOI)", sizeof(outResult->footerMarker));
        } else {
            outResult->isTruncated = 1;
            outResult->estimatedPayloadBytes = bufferLength;
            outResult->confidenceScore = 88U;
        }
    } else if (bufferLength >= 8 && pBuffer[0] == 0x89 && pBuffer[1] == 0x50 && pBuffer[2] == 0x4E && pBuffer[3] == 0x47 &&
               pBuffer[4] == 0x0D && pBuffer[5] == 0x0A && pBuffer[6] == 0x1A && pBuffer[7] == 0x0A) {
        outResult->signatureType = 2;
        dsr_safe_strcpy(outResult->signatureName, "PNG Lossless Image", sizeof(outResult->signatureName));
        dsr_safe_strcpy(outResult->fileExtension, "png", sizeof(outResult->fileExtension));
        static const uint8_t kPngIend[8] = { 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82 };
        int64_t eofOff = dsr_find_subseq(pBuffer, bufferLength, kPngIend, 8, 8);
        if (eofOff >= 0) {
            outResult->footerDetected = 1;
            outResult->estimatedPayloadBytes = (uint64_t)(eofOff + 8);
            outResult->confidenceScore = 99U;
            dsr_safe_strcpy(outResult->footerMarker, "IEND (CRC32 OK)", sizeof(outResult->footerMarker));
        } else {
            outResult->isTruncated = 1;
            outResult->estimatedPayloadBytes = bufferLength;
            outResult->confidenceScore = 92U;
        }
    } else if (bufferLength >= 5 && memcmp(pBuffer, "%PDF-", 5) == 0) {
        outResult->signatureType = 3;
        dsr_safe_strcpy(outResult->signatureName, "PDF Portable Document", sizeof(outResult->signatureName));
        dsr_safe_strcpy(outResult->fileExtension, "pdf", sizeof(outResult->fileExtension));
        static const uint8_t kPdfEof[5] = { '%', '%', 'E', 'O', 'F' };
        int64_t eofOff = dsr_find_subseq(pBuffer, bufferLength, kPdfEof, 5, 5);
        if (eofOff >= 0) {
            outResult->footerDetected = 1;
            outResult->estimatedPayloadBytes = (uint64_t)(eofOff + 5);
            outResult->confidenceScore = 97U;
            dsr_safe_strcpy(outResult->footerMarker, "%%EOF Trailer", sizeof(outResult->footerMarker));
        } else {
            outResult->isTruncated = 1;
            outResult->estimatedPayloadBytes = bufferLength;
            outResult->confidenceScore = 90U;
        }
    } else if (bufferLength >= 4 && pBuffer[0] == 0x50 && pBuffer[1] == 0x4B && pBuffer[2] == 0x03 && pBuffer[3] == 0x04) {
        outResult->signatureType = 4;
        dsr_safe_strcpy(outResult->signatureName, "ZIP / DOCX / XLSX Archive", sizeof(outResult->signatureName));
        dsr_safe_strcpy(outResult->fileExtension, "zip", sizeof(outResult->fileExtension));
        static const uint8_t kZipEocd[4] = { 0x50, 0x4B, 0x05, 0x06 };
        int64_t eofOff = dsr_find_subseq(pBuffer, bufferLength, kZipEocd, 4, 4);
        if (eofOff >= 0) {
            outResult->footerDetected = 1;
            outResult->estimatedPayloadBytes = (uint64_t)(eofOff + 22);
            outResult->confidenceScore = 97U;
            dsr_safe_strcpy(outResult->footerMarker, "PK EOCD (0x06054B50)", sizeof(outResult->footerMarker));
        } else {
            outResult->isTruncated = 1;
            outResult->estimatedPayloadBytes = bufferLength;
            outResult->confidenceScore = 89U;
        }
    } else if (bufferLength >= 8 && memcmp(pBuffer + 4, "ftyp", 4) == 0) {
        outResult->signatureType = 5;
        dsr_safe_strcpy(outResult->signatureName, "MP4 / MOV / ISO BMFF Video", sizeof(outResult->signatureName));
        dsr_safe_strcpy(outResult->fileExtension, "mp4", sizeof(outResult->fileExtension));
        outResult->estimatedPayloadBytes = bufferLength;
        outResult->confidenceScore = 91U;
    } else if (bufferLength >= 12 && memcmp(pBuffer, "RIFF", 4) == 0) {
        outResult->signatureType = 7;
        uint32_t riffLen = dsr_u32le(pBuffer, 4);
        outResult->estimatedPayloadBytes = (uint64_t)riffLen + 8ULL;
        if (memcmp(pBuffer + 8, "WEBP", 4) == 0) {
            dsr_safe_strcpy(outResult->signatureName, "RIFF WebP Image", sizeof(outResult->signatureName));
            dsr_safe_strcpy(outResult->fileExtension, "webp", sizeof(outResult->fileExtension));
        } else if (memcmp(pBuffer + 8, "WAVE", 4) == 0) {
            dsr_safe_strcpy(outResult->signatureName, "RIFF WAV Audio", sizeof(outResult->signatureName));
            dsr_safe_strcpy(outResult->fileExtension, "wav", sizeof(outResult->fileExtension));
        } else {
            dsr_safe_strcpy(outResult->signatureName, "RIFF Media Container (AVI/WAV)", sizeof(outResult->signatureName));
            dsr_safe_strcpy(outResult->fileExtension, "avi", sizeof(outResult->fileExtension));
        }
        outResult->footerDetected = (outResult->estimatedPayloadBytes <= bufferLength) ? 1 : 0;
        outResult->isTruncated = outResult->footerDetected ? 0 : 1;
        outResult->confidenceScore = 93U;
    } else if (bufferLength >= 6 && (memcmp(pBuffer, "GIF87a", 6) == 0 || memcmp(pBuffer, "GIF89a", 6) == 0)) {
        outResult->signatureType = 8;
        dsr_safe_strcpy(outResult->signatureName, "GIF Animated Image", sizeof(outResult->signatureName));
        dsr_safe_strcpy(outResult->fileExtension, "gif", sizeof(outResult->fileExtension));
        outResult->confidenceScore = 94U;
        outResult->estimatedPayloadBytes = bufferLength;
    } else if (bufferLength >= 14 && pBuffer[0] == 0x42 && pBuffer[1] == 0x4D && dsr_u32le(pBuffer, 2) >= 26U) {
        outResult->signatureType = 9;
        dsr_safe_strcpy(outResult->signatureName, "BMP Bitmap Image", sizeof(outResult->signatureName));
        dsr_safe_strcpy(outResult->fileExtension, "bmp", sizeof(outResult->fileExtension));
        outResult->estimatedPayloadBytes = (uint64_t)dsr_u32le(pBuffer, 2);
        outResult->footerDetected = (outResult->estimatedPayloadBytes <= bufferLength) ? 1 : 0;
        outResult->isTruncated = outResult->footerDetected ? 0 : 1;
        outResult->confidenceScore = 87U;
    } else if (bufferLength >= 6 && pBuffer[0] == 0x37 && pBuffer[1] == 0x7A && pBuffer[2] == 0xBC &&
               pBuffer[3] == 0xAF && pBuffer[4] == 0x27 && pBuffer[5] == 0x1C) {
        outResult->signatureType = 10;
        dsr_safe_strcpy(outResult->signatureName, "7-Zip Compressed Archive", sizeof(outResult->signatureName));
        dsr_safe_strcpy(outResult->fileExtension, "7z", sizeof(outResult->fileExtension));
        outResult->confidenceScore = 96U;
        outResult->estimatedPayloadBytes = bufferLength;
    } else if (bufferLength >= 7 && memcmp(pBuffer, "Rar!\x1A\x07", 6) == 0) {
        outResult->signatureType = 11;
        dsr_safe_strcpy(outResult->signatureName, "RAR Archive", sizeof(outResult->signatureName));
        dsr_safe_strcpy(outResult->fileExtension, "rar", sizeof(outResult->fileExtension));
        outResult->confidenceScore = 95U;
        outResult->estimatedPayloadBytes = bufferLength;
    } else if (bufferLength >= 3 && pBuffer[0] == 0x1F && pBuffer[1] == 0x8B && pBuffer[2] == 0x08) {
        outResult->signatureType = 12;
        dsr_safe_strcpy(outResult->signatureName, "GZIP Compressed Stream", sizeof(outResult->signatureName));
        dsr_safe_strcpy(outResult->fileExtension, "gz", sizeof(outResult->fileExtension));
        outResult->confidenceScore = 90U;
        outResult->estimatedPayloadBytes = bufferLength;
    } else if (bufferLength >= 16 && memcmp(pBuffer, "SQLite format 3\0", 16) == 0) {
        outResult->signatureType = 13;
        dsr_safe_strcpy(outResult->signatureName, "SQLite 3 Database", sizeof(outResult->signatureName));
        dsr_safe_strcpy(outResult->fileExtension, "sqlite", sizeof(outResult->fileExtension));
        outResult->confidenceScore = 99U;
        outResult->estimatedPayloadBytes = bufferLength;
    } else if (bufferLength >= 4 && pBuffer[0] == 0x7F && pBuffer[1] == 'E' && pBuffer[2] == 'L' && pBuffer[3] == 'F') {
        outResult->signatureType = 14;
        dsr_safe_strcpy(outResult->signatureName, "ELF Executable / Shared Object", sizeof(outResult->signatureName));
        dsr_safe_strcpy(outResult->fileExtension, "elf", sizeof(outResult->fileExtension));
        outResult->confidenceScore = 95U;
        outResult->estimatedPayloadBytes = bufferLength;
    } else if (bufferLength >= 64 && pBuffer[0] == 'M' && pBuffer[1] == 'Z' &&
               (uint64_t)dsr_u32le(pBuffer, 60) + 4ULL <= (uint64_t)bufferLength &&
               memcmp(pBuffer + dsr_u32le(pBuffer, 60), "PE\0\0", 4) == 0) {
        outResult->signatureType = 15;
        dsr_safe_strcpy(outResult->signatureName, "Windows PE Executable / DLL", sizeof(outResult->signatureName));
        dsr_safe_strcpy(outResult->fileExtension, "exe", sizeof(outResult->fileExtension));
        outResult->confidenceScore = 96U;
        outResult->estimatedPayloadBytes = bufferLength;
    } else if (bufferLength >= 512 && memcmp(pBuffer + 3, "NTFS    ", 8) == 0 && pBuffer[510] == 0x55 && pBuffer[511] == 0xAA) {
        outResult->signatureType = 16;
        dsr_safe_strcpy(outResult->signatureName, "NTFS Volume Boot Record ($Boot)", sizeof(outResult->signatureName));
        dsr_safe_strcpy(outResult->fileExtension, "vbr", sizeof(outResult->fileExtension));
        outResult->confidenceScore = 99U;
        outResult->estimatedPayloadBytes = 512U;
    } else {
        // Check Hamming Bit-Flip tolerance (<= 2 flipped bits in key 4-8 byte magic headers)
        // before falling back to generic UTF-8 ASCII text logs so ASCII-heavy PDF/SQLite headers recover.
        struct NearMagic {
            uint32_t sigType;
            const char* name;
            const char* ext;
            uint32_t len;
            uint8_t bytes[8];
        };
        static const NearMagic kNearMagics[] = {
            { 2, "PNG Lossless Image (Bit-Flip Header)", "png", 8, { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A } },
            { 3, "PDF Document (Bit-Flip Header)", "pdf", 5, { '%', 'P', 'D', 'F', '-', 0, 0, 0 } },
            { 4, "ZIP/OOXML Archive (Bit-Flip Header)", "zip", 4, { 0x50, 0x4B, 0x03, 0x04, 0, 0, 0, 0 } },
            { 13, "SQLite 3 DB (Bit-Flip Header)", "sqlite", 8, { 'S', 'Q', 'L', 'i', 't', 'e', ' ', 'f' } },
        };
        uint32_t bestFlips = 99U;
        const NearMagic* bestMatch = NULL;
        for (size_t m = 0; m < sizeof(kNearMagics) / sizeof(kNearMagics[0]); ++m) {
            if (bufferLength < kNearMagics[m].len) continue;
            uint32_t flips = 0;
            for (uint32_t b = 0; b < kNearMagics[m].len; ++b) {
                flips += dsr_popcount8((uint8_t)(pBuffer[b] ^ kNearMagics[m].bytes[b]));
            }
            if (flips > 0 && flips <= 2U && flips < bestFlips) {
                bestFlips = flips;
                bestMatch = &kNearMagics[m];
            }
        }
        if (bestMatch) {
            outResult->signatureType = bestMatch->sigType;
            outResult->nearMatchBitFlips = bestFlips;
            outResult->confidenceScore = (bestFlips == 1U) ? 72U : 58U;
            outResult->estimatedPayloadBytes = bufferLength;
            dsr_safe_strcpy(outResult->signatureName, bestMatch->name, sizeof(outResult->signatureName));
            dsr_safe_strcpy(outResult->fileExtension, bestMatch->ext, sizeof(outResult->fileExtension));
        } else if (outResult->printableRatio >= 0.80) {
            outResult->signatureType = 6;
            dsr_safe_strcpy(outResult->signatureName, "UTF-8 Source / System Log", sizeof(outResult->signatureName));
            dsr_safe_strcpy(outResult->fileExtension, "txt", sizeof(outResult->fileExtension));
            outResult->confidenceScore = (uint32_t)(outResult->printableRatio * 90.0);
            outResult->estimatedPayloadBytes = bufferLength;
        } else {
            outResult->signatureType = 0;
            outResult->confidenceScore = 0;
            dsr_safe_strcpy(outResult->signatureName, "Raw Binary / Unmapped Sector", sizeof(outResult->signatureName));
            dsr_safe_strcpy(outResult->fileExtension, "bin", sizeof(outResult->fileExtension));
        }
    }

    return true;
}

DSR_API bool DSR_CALL DSR_ParseNtfsMftRecord(
    uint8_t* recordBytes,
    uint32_t recordLength,
    uint32_t recordIndexHint,
    bool applyUsaFixupInPlace,
    DSRNtfsMftParsedRecord* outRecord,
    DSRNtfsDataRun* outRuns,
    uint32_t maxRuns
) {
    if (!recordBytes || recordLength < 512U || !outRecord) return false;
    if (applyUsaFixupInPlace) {
        return dsr_parse_mft_internal(recordBytes, recordLength, recordIndexHint, true, outRecord, outRuns, maxRuns);
    }
    std::vector<uint8_t> scratch(recordBytes, recordBytes + recordLength);
    return dsr_parse_mft_internal(scratch.data(), recordLength, recordIndexHint, true, outRecord, outRuns, maxRuns);
}

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
) {
    if (outMatchedCount) *outMatchedCount = 0;
    if (outWrittenRuns) *outWrittenRuns = 0;
    if (!mftBuffer || bufferLength < 512U || mftRecordSize < 512U || sectorSize < 512U) return false;

    uint32_t recordCount = bufferLength / mftRecordSize;
    std::vector<uint8_t> scratch(mftRecordSize);
    std::vector<DSRNtfsDataRun> localRuns(128);
    uint32_t matchedTotal = 0;
    uint32_t runsWrittenTotal = 0;

    for (uint32_t i = 0; i < recordCount; ++i) {
        uint32_t recByteStart = i * mftRecordSize;
        memcpy(scratch.data(), mftBuffer + recByteStart, mftRecordSize);

        DSRNtfsMftParsedRecord rec;
        if (!dsr_parse_mft_internal(
                scratch.data(),
                mftRecordSize,
                firstRecordIndex + i,
                true,
                &rec,
                localRuns.data(),
                (uint32_t)localRuns.size())) {
            continue;
        }
        if (!rec.inUse) continue;

        uint32_t availableLocalRuns = (rec.dataRunCount < (uint32_t)localRuns.size())
            ? rec.dataRunCount
            : (uint32_t)localRuns.size();

        bool hitsExtent = false;
        for (uint32_t r = 0; r < availableLocalRuns; ++r) {
            uint64_t rStart = localRuns[r].lcnStart;
            uint64_t rCnt = localRuns[r].clusterCount;
            if (rStart <= targetLcn && (targetLcn - rStart) < rCnt) {
                hitsExtent = true;
                break;
            }
        }

        uint64_t recLbaStart = batchStartLba + (uint64_t)(recByteStart / sectorSize);
        uint64_t recLbaEnd = batchStartLba + (uint64_t)((recByteStart + mftRecordSize - 1U) / sectorSize);
        bool hitsResidentRecord = (targetLba >= recLbaStart && targetLba <= recLbaEnd);

        if (hitsExtent || hitsResidentRecord) {
            if (outMatchedRecords && matchedTotal < maxMatched) {
                DSRNtfsMftParsedRecord copyRec = rec;
                copyRec.dataRunCount = 0;
                if (outRunsFlat && runsWrittenTotal < maxRunsFlat) {
                    uint32_t cap = maxRunsFlat - runsWrittenTotal;
                    uint32_t toWrite = (availableLocalRuns < cap) ? availableLocalRuns : cap;
                    memcpy(outRunsFlat + runsWrittenTotal, localRuns.data(), toWrite * sizeof(DSRNtfsDataRun));
                    runsWrittenTotal += toWrite;
                    copyRec.dataRunCount = toWrite;
                }
                outMatchedRecords[matchedTotal] = copyRec;
            }
            matchedTotal++;
        }
    }

    if (outMatchedCount) *outMatchedCount = matchedTotal;
    if (outWrittenRuns) *outWrittenRuns = runsWrittenTotal;
    return true;
}

DSR_API bool DSR_CALL DSR_GenerateWipePatternBuffer(
    uint8_t* pOutBuffer,
    uint32_t bufferLength,
    uint32_t patternMode,
    uint8_t constantByte,
    uint64_t seed64,
    uint64_t lbaOffset,
    uint32_t* outCrc32
) {
    if (!pOutBuffer || bufferLength == 0) return false;

    if (patternMode == DSR_WIPE_ZERO) {
        memset(pOutBuffer, 0x00, bufferLength);
    } else if (patternMode == DSR_WIPE_ONES) {
        memset(pOutBuffer, 0xFF, bufferLength);
    } else if (patternMode == DSR_WIPE_CONSTANT) {
        memset(pOutBuffer, constantByte, bufferLength);
    } else {
        DSRXoshiro256StarStar rng;
        rng.init(seed64, lbaOffset);
        uint32_t i = 0;
        uint32_t wordLimit = bufferLength & ~7U;
        for (; i < wordLimit; i += 8U) {
            uint64_t val = rng.next64();
            for (uint32_t b = 0; b < 8U; ++b) {
                pOutBuffer[i + b] = (uint8_t)((val >> (b * 8U)) & 0xFFU);
            }
        }
        if (i < bufferLength) {
            uint64_t tailVal = rng.next64();
            uint32_t rem = bufferLength - i;
            for (uint32_t b = 0; b < rem; ++b) {
                pOutBuffer[i + b] = (uint8_t)((tailVal >> (b * 8U)) & 0xFFU);
            }
        }
    }

    if (outCrc32) {
        *outCrc32 = dsr_crc32_ieee(pOutBuffer, bufferLength);
    }
    return true;
}

DSR_API bool DSR_CALL DSR_VerifyWipedBuffer(
    const uint8_t* pBuffer,
    uint32_t bufferLength,
    uint32_t patternMode,
    uint8_t constantByte,
    uint64_t seed64,
    uint64_t lbaOffset,
    DSRWipeVerifyReport* outReport
) {
    if (!pBuffer || bufferLength == 0 || !outReport) return false;
    memset(outReport, 0, sizeof(DSRWipeVerifyReport));
    outReport->checkedBytes = bufferLength;
    outReport->patternMode = patternMode;
    outReport->firstMismatchOffset = -1;
    outReport->crc32 = dsr_crc32_ieee(pBuffer, bufferLength);

    uint64_t mismatchCount = 0;
    if (patternMode == DSR_WIPE_ZERO || patternMode == DSR_WIPE_ONES || patternMode == DSR_WIPE_CONSTANT) {
        uint8_t expected = (patternMode == DSR_WIPE_ZERO) ? 0x00U : (patternMode == DSR_WIPE_ONES ? 0xFFU : constantByte);
        for (uint32_t i = 0; i < bufferLength; ++i) {
            if (pBuffer[i] != expected) {
                if (outReport->firstMismatchOffset < 0) outReport->firstMismatchOffset = (int64_t)i;
                mismatchCount++;
            }
        }
    } else {
        DSRXoshiro256StarStar rng;
        rng.init(seed64, lbaOffset);
        uint32_t i = 0;
        uint32_t wordLimit = bufferLength & ~7U;
        for (; i < wordLimit; i += 8U) {
            uint64_t expectedWord = rng.next64();
            for (uint32_t b = 0; b < 8U; ++b) {
                uint8_t eb = (uint8_t)((expectedWord >> (b * 8U)) & 0xFFU);
                if (pBuffer[i + b] != eb) {
                    if (outReport->firstMismatchOffset < 0) outReport->firstMismatchOffset = (int64_t)(i + b);
                    mismatchCount++;
                }
            }
        }
        if (i < bufferLength) {
            uint64_t tailWord = rng.next64();
            uint32_t rem = bufferLength - i;
            for (uint32_t b = 0; b < rem; ++b) {
                uint8_t eb = (uint8_t)((tailWord >> (b * 8U)) & 0xFFU);
                if (pBuffer[i + b] != eb) {
                    if (outReport->firstMismatchOffset < 0) outReport->firstMismatchOffset = (int64_t)(i + b);
                    mismatchCount++;
                }
            }
        }
    }

    outReport->residualNonMatchingBytes = mismatchCount;
    outReport->verifiedClean = (mismatchCount == 0ULL) ? 1 : 0;
    return true;
}

DSR_API bool DSR_CALL DSR_CoalesceAndPlanDdrescueIntervals(
    const DSRDdrescueIntervalC* inIntervals,
    uint32_t inCount,
    uint32_t chunkSectors,
    DSRDdrescueIntervalC* outCoalesced,
    uint32_t maxOut,
    DSRDdrescuePlanSummary* outSummary
) {
    if (!outSummary) return false;
    memset(outSummary, 0, sizeof(DSRDdrescuePlanSummary));

    if (!inIntervals || inCount == 0) {
        outSummary->suggestedPhaseCode = 3U; // completed
        outSummary->completed = 1;
        return true;
    }

    std::vector<DSRDdrescueIntervalC> valid;
    valid.reserve(inCount);
    for (uint32_t i = 0; i < inCount; ++i) {
        if (inIntervals[i].sectorCount > 0) {
            valid.push_back(inIntervals[i]);
        }
    }

    std::sort(valid.begin(), valid.end(), [](const DSRDdrescueIntervalC& a, const DSRDdrescueIntervalC& b) {
        return a.startLba < b.startLba;
    });

    std::vector<DSRDdrescueIntervalC> merged;
    merged.reserve(valid.size());
    for (const auto& iv : valid) {
        if (!merged.empty()) {
            auto& back = merged.back();
            if (back.startLba <= (UINT64_MAX - back.sectorCount) &&
                back.startLba + back.sectorCount == iv.startLba &&
                back.statusCode == iv.statusCode &&
                back.attempts == iv.attempts &&
                back.lastErrorCode == iv.lastErrorCode) {
                back.sectorCount += iv.sectorCount;
                continue;
            }
        }
        merged.push_back(iv);
    }

    uint32_t safeChunk = (chunkSectors < 16U) ? 16U : (chunkSectors > 2048U ? 2048U : chunkSectors);
    uint32_t trimStep = safeChunk / 4U;
    if (trimStep < 4U) trimStep = 4U;
    if (trimStep > 16U) trimStep = 16U;

    const DSRDdrescueIntervalC* firstNonTried = NULL;
    const DSRDdrescueIntervalC* firstNonTrimmed = NULL;
    const DSRDdrescueIntervalC* firstNonScraped = NULL;

    for (const auto& iv : merged) {
        outSummary->totalSectors += iv.sectorCount;
        switch (iv.statusCode) {
            case DSR_IV_FINISHED:
                outSummary->finishedSectors += iv.sectorCount;
                break;
            case DSR_IV_NON_TRIED:
                outSummary->nonTriedSectors += iv.sectorCount;
                if (!firstNonTried) firstNonTried = &iv;
                break;
            case DSR_IV_NON_TRIMMED:
                outSummary->nonTrimmedSectors += iv.sectorCount;
                if (!firstNonTrimmed) firstNonTrimmed = &iv;
                break;
            case DSR_IV_NON_SCRAPED:
                outSummary->nonScrapedSectors += iv.sectorCount;
                if (!firstNonScraped) firstNonScraped = &iv;
                break;
            case DSR_IV_BAD_SECTOR:
                outSummary->badSectors += iv.sectorCount;
                break;
            default:
                break;
        }
    }

    if (firstNonTried) {
        outSummary->suggestedPhaseCode = 0U; // copying
        outSummary->nextWorkStartLba = firstNonTried->startLba;
        outSummary->nextWorkSectorCount = (firstNonTried->sectorCount > (uint64_t)safeChunk)
            ? safeChunk
            : (uint32_t)firstNonTried->sectorCount;
        outSummary->hasNextWork = 1;
        outSummary->completed = 0;
    } else if (firstNonTrimmed) {
        outSummary->suggestedPhaseCode = 1U; // trimming
        outSummary->nextWorkStartLba = firstNonTrimmed->startLba;
        outSummary->nextWorkSectorCount = (firstNonTrimmed->sectorCount > (uint64_t)trimStep)
            ? trimStep
            : (uint32_t)firstNonTrimmed->sectorCount;
        outSummary->hasNextWork = 1;
        outSummary->completed = 0;
    } else if (firstNonScraped) {
        outSummary->suggestedPhaseCode = 2U; // retrying
        outSummary->nextWorkStartLba = firstNonScraped->startLba;
        outSummary->nextWorkSectorCount = 1U;
        outSummary->hasNextWork = 1;
        outSummary->completed = 0;
    } else {
        outSummary->suggestedPhaseCode = 3U; // completed
        outSummary->hasNextWork = 0;
        outSummary->completed = 1;
    }

    outSummary->coalescedIntervalCount = (uint32_t)merged.size();
    if (outCoalesced && maxOut > 0) {
        uint32_t copyCnt = (merged.size() < (size_t)maxOut) ? (uint32_t)merged.size() : maxOut;
        memcpy(outCoalesced, merged.data(), copyCnt * sizeof(DSRDdrescueIntervalC));
    }
    return true;
}
