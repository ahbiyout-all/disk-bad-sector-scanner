import {
  DiskDrive,
  LbaAffectedFileRecord,
  LbaFileExtent,
  LbaFileTraceResult,
  PartitionEntryRecord
} from '../types';
import { isTauriDesktopRuntime, queryTauriRawSectorBytes, queryTauriRawSectorRange } from './nativeDriveEngine';
import { detectVbrBootInfo, parsePartitionTableFromRawBytes } from './partitionParser';

type ByteBufferLike = number[] | Uint8Array;

const utf16LeDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : null;

function readU16Le(buf: ByteBufferLike, off: number): number {
  if (off + 1 >= buf.length) return 0;
  return (buf[off] | (buf[off + 1] << 8)) >>> 0;
}

function readU32Le(buf: ByteBufferLike, off: number): number {
  if (off + 3 >= buf.length) return 0;
  return (
    (buf[off] |
      (buf[off + 1] << 8) |
      (buf[off + 2] << 16) |
      (buf[off + 3] << 24)) >>>
    0
  );
}

function readU64Le(buf: ByteBufferLike, off: number): number {
  if (off + 7 >= buf.length) return 0;
  const lo = readU32Le(buf, off);
  const hi = readU32Le(buf, off + 4);
  return hi * 4294967296 + lo;
}

function readSignedVarIntLe(buf: ByteBufferLike, off: number, len: number): number {
  if (len <= 0 || off + len > buf.length) return 0;
  let val = 0;
  for (let i = 0; i < len; i++) {
    val += buf[off + i] * Math.pow(256, i);
  }
  const signBit = 1 << 7;
  if ((buf[off + len - 1] & signBit) !== 0) {
    val -= Math.pow(256, len);
  }
  return val;
}

function readUnsignedVarIntLe(buf: ByteBufferLike, off: number, len: number): number {
  if (len <= 0 || off + len > buf.length) return 0;
  let val = 0;
  for (let i = 0; i < len; i++) {
    val += buf[off + i] * Math.pow(256, i);
  }
  return val;
}

function applyNtfsUsaFixup(recordBytes: ByteBufferLike): boolean {
  if (recordBytes.length < 512) return false;
  if (
    recordBytes[0] !== 0x46 ||
    recordBytes[1] !== 0x49 ||
    recordBytes[2] !== 0x4c ||
    recordBytes[3] !== 0x45
  ) {
    return false;
  }

  const usaOffset = readU16Le(recordBytes, 4);
  const usaCount = readU16Le(recordBytes, 6);
  if (usaOffset < 42 || usaCount < 2 || usaOffset + usaCount * 2 > recordBytes.length) {
    return false;
  }

  const usnLo = recordBytes[usaOffset];
  const usnHi = recordBytes[usaOffset + 1];

  for (let sec = 1; sec < usaCount; sec++) {
    const sectorEnd = sec * 512 - 2;
    if (sectorEnd + 1 >= recordBytes.length) break;
    if (recordBytes[sectorEnd] === usnLo && recordBytes[sectorEnd + 1] === usnHi) {
      recordBytes[sectorEnd] = recordBytes[usaOffset + sec * 2];
      recordBytes[sectorEnd + 1] = recordBytes[usaOffset + sec * 2 + 1];
    }
  }
  return true;
}

interface ParsedNtfsRecord {
  recordNumber: number;
  inUse: boolean;
  isDirectory: boolean;
  fileName: string;
  parentRecordNumber: number;
  namespace: number;
  isResidentData: boolean;
  fileSizeBytes: number;
  creationTimestampMs?: number;
  dataRuns: { lcnStart: number; clusterCount: number; vcnStart: number }[];
}

function decodeNtfsDataRuns(
  attrBytes: ByteBufferLike,
  runListStart: number,
  maxEnd: number
): { lcnStart: number; clusterCount: number; vcnStart: number }[] {
  const runs: { lcnStart: number; clusterCount: number; vcnStart: number }[] = [];
  let pos = runListStart;
  let prevLcn = 0;
  let curVcn = 0;

  while (pos < maxEnd && pos < attrBytes.length) {
    const header = attrBytes[pos++];
    if (header === 0) break;

    const lenSize = header & 0x0f;
    const offSize = (header >> 4) & 0x0f;
    if (lenSize === 0 || pos + lenSize + offSize > maxEnd || pos + lenSize + offSize > attrBytes.length) {
      break;
    }

    const clusterCount = readUnsignedVarIntLe(attrBytes, pos, lenSize);
    pos += lenSize;
    const lcnDelta = offSize > 0 ? readSignedVarIntLe(attrBytes, pos, offSize) : 0;
    pos += offSize;

    if (offSize > 0 && clusterCount > 0) {
      const lcnStart = prevLcn + lcnDelta;
      prevLcn = lcnStart;
      if (lcnStart >= 0) {
        runs.push({ lcnStart, clusterCount, vcnStart: curVcn });
      }
    }
    curVcn += clusterCount;
  }

  return runs;
}

function decodeUtf16LeSegment(buf: ByteBufferLike, start: number, charCount: number, boundEnd: number): string {
  const maxChars = Math.min(charCount, Math.floor(Math.max(0, boundEnd - start) / 2));
  if (maxChars <= 0) return '';
  if (utf16LeDecoder && buf instanceof Uint8Array) {
    const decoded = utf16LeDecoder.decode(buf.subarray(start, start + maxChars * 2));
    const nulIdx = decoded.indexOf('\0');
    return nulIdx >= 0 ? decoded.slice(0, nulIdx) : decoded;
  }
  let out = '';
  for (let c = 0; c < maxChars; c++) {
    const ch = readU16Le(buf, start + c * 2);
    if (ch > 0) out += String.fromCharCode(ch);
  }
  return out;
}

function parseNtfsMftRecord(rawRecord: ByteBufferLike, recordIndex: number, mutateInPlace = false): ParsedNtfsRecord | null {
  if (
    rawRecord.length < 512 ||
    rawRecord[0] !== 0x46 ||
    rawRecord[1] !== 0x49 ||
    rawRecord[2] !== 0x4c ||
    rawRecord[3] !== 0x45
  ) {
    return null;
  }

  const flagsPre = readU16Le(rawRecord, 22);
  if ((flagsPre & 0x01) === 0) return null;

  const buf = mutateInPlace ? rawRecord : rawRecord.slice();
  if (!applyNtfsUsaFixup(buf)) return null;

  const flags = readU16Le(buf, 22);
  const inUse = (flags & 0x01) !== 0;
  const isDirectory = (flags & 0x02) !== 0;
  if (!inUse) return null;

  const firstAttrOff = readU16Le(buf, 20);
  const bytesUsed = Math.min(buf.length, readU32Le(buf, 24) || buf.length);
  const selfRecNum = readU32Le(buf, 44) || recordIndex;

  let bestFileName = '';
  let bestNamespace = -1;
  let parentRecordNumber = 5; // root default
  let fileSizeBytes = 0;
  let bestCreationMs = 0;
  let isResidentData = false;
  let dataRuns: { lcnStart: number; clusterCount: number; vcnStart: number }[] = [];

  let off = firstAttrOff;
  while (off + 16 <= bytesUsed) {
    const attrType = readU32Le(buf, off);
    if (attrType === 0xffffffff || attrType === 0) break;
    const attrLen = readU32Le(buf, off + 4);
    if (attrLen < 16 || off + attrLen > bytesUsed) break;

    const nonResident = buf[off + 8] !== 0;

    // $FILE_NAME (0x30) - always resident
    if (attrType === 0x30 && !nonResident) {
      const contentLen = readU32Le(buf, off + 16);
      const contentOff = off + readU16Le(buf, off + 20);
      if (contentLen >= 66 && contentOff + 66 <= off + attrLen) {
        const parentRefLo = readU32Le(buf, contentOff);
        const parentRefHi = readU16Le(buf, contentOff + 4);
        const pRec = parentRefHi * 4294967296 + parentRefLo;
        const realSize = readU64Le(buf, contentOff + 48);
        const creationTimeFiletime = readU64Le(buf, contentOff + 8);
        const creationMs = creationTimeFiletime > 0 ? Math.floor(creationTimeFiletime / 10000) - 11644473600000 : 0;
        const nameLen = buf[contentOff + 64];
        const ns = buf[contentOff + 65];
        const nameStart = contentOff + 66;
        const decodedName = decodeUtf16LeSegment(buf, nameStart, nameLen, off + attrLen);
        // Prefer Win32 (1) or Win32+DOS (3) over POSIX (0) or DOS-only (2)
        const rank = (n: number) => (n === 1 || n === 3 ? 3 : n === 0 ? 2 : 1);
        if (decodedName && rank(ns) >= rank(bestNamespace)) {
          bestFileName = decodedName;
          bestNamespace = ns;
          parentRecordNumber = pRec;
          if (fileSizeBytes === 0 && realSize > 0) {
            fileSizeBytes = realSize;
          }
          if (creationMs > 0) {
            bestCreationMs = creationMs;
          }
        }
      }
    }

    // $DATA (0x80) - primary unnamed data stream has nameLen === 0
    if (attrType === 0x80 && buf[off + 9] === 0) {
      if (!nonResident) {
        isResidentData = true;
        const resSize = readU32Le(buf, off + 16);
        if (resSize > 0) fileSizeBytes = resSize;
      } else if (attrLen >= 64) {
        const realSize = readU64Le(buf, off + 48);
        if (realSize > 0) fileSizeBytes = realSize;
        const runListRel = readU16Le(buf, off + 32);
        if (runListRel >= 64 && off + runListRel < off + attrLen) {
          const parsedRuns = decodeNtfsDataRuns(buf, off + runListRel, off + attrLen);
          dataRuns = dataRuns.concat(parsedRuns);
        }
      }
    }

    off += attrLen;
  }

  return {
    recordNumber: selfRecNum,
    inUse,
    isDirectory,
    fileName: bestFileName,
    parentRecordNumber,
    namespace: bestNamespace,
    isResidentData,
    fileSizeBytes,
    creationTimestampMs: bestCreationMs,
    dataRuns
  };
}

function buildFullPathFromMftCache(
  recNum: number,
  nameCache: Map<number, { name: string; parent: number }>
): string {
  const parts: string[] = [];
  const visited = new Set<number>();
  let cur: number | undefined = recNum;

  while (cur !== undefined && !visited.has(cur) && parts.length < 32) {
    visited.add(cur);
    if (cur === 5) break; // NTFS root directory
    const entry = nameCache.get(cur);
    if (!entry) break;
    if (entry.name && entry.name !== '.') {
      parts.unshift(entry.name);
    }
    cur = entry.parent;
  }

  return parts.length > 0 ? `\\${parts.join('\\')}` : `\\MFT_Record_${recNum}`;
}

export interface TraceLbaOptions {
  maxMftRecords?: number;
  signal?: AbortSignal;
  onProgress?: (scannedRecords: number, note: string) => void;
}

/**
 * Forensic read-only tracer: maps a damaged physical LBA -> Partition -> Cluster (LCN) ->
 * NTFS $MFT Non-Resident Data Runs (or FAT32 cluster chain summary) to identify affected files.
 */
export async function traceAffectedFilesForLba(
  drive: DiskDrive,
  targetLbaInput: number,
  options: TraceLbaOptions = {}
): Promise<LbaFileTraceResult> {
  const startMs = performance.now();
  const targetLba = Math.max(0, Math.floor(targetLbaInput));
  const fallbackSecSize = drive.hardwareSpecs?.logicalSectorSize || 512;
  const maxMftRecords = Math.max(256, Math.min(32768, options.maxMftRecords ?? 8192));

  const makeEmpty = (
    diagnosticNote: string,
    overrides: Partial<LbaFileTraceResult> = {}
  ): LbaFileTraceResult => ({
    supported: false,
    targetLba,
    sectorSize: fallbackSecSize,
    partitionName: 'Unknown',
    partitionStartLba: 0,
    partitionEndLba: 0,
    filesystem: 'UNKNOWN',
    clusterSizeBytes: 0,
    sectorsPerCluster: 0,
    targetLcn: null,
    mftRecordsScanned: 0,
    elapsedMs: Math.round(performance.now() - startMs),
    aborted: false,
    affectedFiles: [],
    diagnosticNote,
    ...overrides
  });

  if (!isTauriDesktopRuntime() || !drive.id.startsWith('drive-tauri-physical-')) {
    return makeEmpty(
      'Tauri 데스크톱 네이티브 IPC 환경(Windows 관리자 권한)에서만 물리 디스크의 MBR/GPT/MFT 메타데이터를 직접 판독해 손상 LBA 영향 파일을 추적할 수 있습니다.'
    );
  }

  // 1. Read LBA 0..33 to locate partition containing targetLba
  options.onProgress?.(0, 'MBR/GPT 파티션 테이블 판독 중...');
  const ptRes = await queryTauriRawSectorRange(drive, 0, 34);
  if (options.signal?.aborted) {
    return makeEmpty('사용자 요청으로 추적이 중단되었습니다.', { aborted: true, supported: true });
  }
  if (!ptRes.supported || ptRes.bytes.length < 512) {
    return makeEmpty(
      ptRes.reason || '물리 디스크 LBA 0~33 파티션 테이블을 읽을 수 없습니다 (관리자 권한 확인 필요).'
    );
  }

  const secSize = ptRes.sectorSize || fallbackSecSize;
  const parsedPt = parsePartitionTableFromRawBytes(ptRes.bytes, secSize);
  const matchingPartition: PartitionEntryRecord | undefined = parsedPt.entries.find(
    e => targetLba >= e.startLba && targetLba <= e.endLba
  );

  if (!matchingPartition) {
    return makeEmpty(
      `LBA #${targetLba.toLocaleString()}은(는) 할당된 파티션 외부 영역(${
        targetLba < 34 ? 'MBR/GPT 파티션 헤더 영역' : '미할당 공간 / 백업 GPT 영역'
      })에 위치해 있어 파일 시스템에 속하지 않습니다.`,
      {
        supported: true,
        sectorSize: secSize,
        partitionName: targetLba < 34 ? 'MBR/GPT Header Zone' : 'Unallocated Space'
      }
    );
  }

  // 2. Read Partition VBR at partitionStartLba
  options.onProgress?.(0, `파티션 VBR (LBA #${matchingPartition.startLba.toLocaleString()}) 분석 중...`);
  const vbrRes = await queryTauriRawSectorRange(drive, matchingPartition.startLba, 1);
  if (options.signal?.aborted) {
    return makeEmpty('사용자 요청으로 추적이 중단되었습니다.', {
      aborted: true,
      supported: true,
      sectorSize: secSize,
      partitionName: matchingPartition.name,
      partitionStartLba: matchingPartition.startLba,
      partitionEndLba: matchingPartition.endLba
    });
  }
  if (!vbrRes.supported || vbrRes.bytes.length < 512) {
    return makeEmpty(
      vbrRes.reason || `파티션 VBR (LBA #${matchingPartition.startLba})을 읽을 수 없습니다.`,
      {
        supported: true,
        sectorSize: secSize,
        partitionName: matchingPartition.name,
        partitionStartLba: matchingPartition.startLba,
        partitionEndLba: matchingPartition.endLba
      }
    );
  }

  const vbrInfo = detectVbrBootInfo(vbrRes.bytes);
  const fsType: 'NTFS' | 'FAT32' | 'exFAT' | 'UNKNOWN' =
    vbrInfo?.filesystem === 'NTFS'
      ? 'NTFS'
      : vbrInfo?.filesystem === 'FAT32'
      ? 'FAT32'
      : vbrInfo?.filesystem === 'exFAT'
      ? 'exFAT'
      : 'UNKNOWN';

  if (fsType === 'UNKNOWN' || !vbrInfo) {
    return makeEmpty(
      `파티션 "${matchingPartition.name}" (${matchingPartition.typeName})의 VBR에서 NTFS/FAT32/exFAT 시그니처를 감지하지 못했습니다 (BitLocker 암호화 또는 Linux ext4/미지원 볼륨).`,
      {
        supported: true,
        sectorSize: secSize,
        partitionName: matchingPartition.name,
        partitionStartLba: matchingPartition.startLba,
        partitionEndLba: matchingPartition.endLba
      }
    );
  }

  const relLba = targetLba - matchingPartition.startLba;
  const spc = Math.max(1, vbrInfo.sectorsPerCluster);

  if (fsType === 'FAT32' || fsType === 'exFAT') {
    const bps = vbrInfo.bytesPerSector || secSize;
    const fatClusterHeapStartSector =
      fsType === 'FAT32'
        ? readU16Le(vbrRes.bytes, 14) + vbrRes.bytes[16] * readU32Le(vbrRes.bytes, 36)
        : readU32Le(vbrRes.bytes, 88);
    const rootCluster = fsType === 'FAT32' ? readU32Le(vbrRes.bytes, 44) : readU32Le(vbrRes.bytes, 96);
    const targetCluster =
      relLba >= fatClusterHeapStartSector
        ? Math.floor((relLba - fatClusterHeapStartSector) / spc) + 2
        : null;

    const affectedFiles: LbaAffectedFileRecord[] = [];
    if (targetCluster === null) {
      affectedFiles.push({
        fileName: fsType === 'FAT32' ? '$FAT32_Reserved_or_FAT_Table' : '$exFAT_Boot_or_FAT_Region',
        fullPath: `\\${matchingPartition.name}\\$FAT_METADATA`,
        filesystem: fsType,
        fileSizeBytes: fatClusterHeapStartSector * bps,
        isDirectory: false,
        isSystemMetafile: true,
        matchConfidence: 'metadata_zone',
        extents: [
          {
            startLba: matchingPartition.startLba,
            endLba: matchingPartition.startLba + fatClusterHeapStartSector - 1,
            vcnStart: 0,
            lcnStart: 0,
            clusterCount: Math.ceil(fatClusterHeapStartSector / spc)
          }
        ],
        note: 'FAT 할당 테이블 또는 예약된 부트 영역(FAT Metadata Zone)에 해당하는 LBA입니다.'
      });
    } else if (fsType === 'FAT32') {
      const reservedSectors = readU16Le(vbrRes.bytes, 14);
      const fat1StartLba = matchingPartition.startLba + reservedSectors;
      const fatSectorCache = new Map<number, number[]>();

      const readFat32NextCluster = async (cluster: number): Promise<number> => {
        const fatOffset = cluster * 4;
        const fatSectorIdx = Math.floor(fatOffset / bps);
        const offsetInSec = fatOffset % bps;
        let secBytes = fatSectorCache.get(fatSectorIdx);
        if (!secBytes) {
          const r = await queryTauriRawSectorRange(drive, fat1StartLba + fatSectorIdx, 1);
          secBytes = r.supported && r.bytes.length >= bps ? r.bytes : [];
          fatSectorCache.set(fatSectorIdx, secBytes);
        }
        if (secBytes.length < offsetInSec + 4) return 0x0fffffff;
        return readU32Le(secBytes, offsetInSec) & 0x0fffffff;
      };

      const buildFat32Extents = async (firstCluster: number): Promise<LbaFileExtent[]> => {
        if (firstCluster < 2) return [];
        const visited = new Set<number>();
        const clusters: number[] = [];
        let cur = firstCluster;
        while (cur >= 2 && cur < 0x0ffffff8 && !visited.has(cur) && clusters.length < 16384) {
          if (options.signal?.aborted) break;
          visited.add(cur);
          clusters.push(cur);
          cur = await readFat32NextCluster(cur);
        }
        if (clusters.length === 0) return [];
        const extents: LbaFileExtent[] = [];
        let runStart = clusters[0];
        let runLen = 1;
        let vcn = 0;
        for (let i = 1; i < clusters.length; i++) {
          if (clusters[i] === clusters[i - 1] + 1) {
            runLen++;
          } else {
            const startLba = matchingPartition.startLba + fatClusterHeapStartSector + (runStart - 2) * spc;
            extents.push({
              startLba,
              endLba: startLba + runLen * spc - 1,
              vcnStart: vcn,
              lcnStart: runStart,
              clusterCount: runLen
            });
            vcn += runLen;
            runStart = clusters[i];
            runLen = 1;
          }
        }
        const startLba = matchingPartition.startLba + fatClusterHeapStartSector + (runStart - 2) * spc;
        extents.push({
          startLba,
          endLba: startLba + runLen * spc - 1,
          vcnStart: vcn,
          lcnStart: runStart,
          clusterCount: runLen
        });
        return extents;
      };

      // Traverse root directory + up to 24 subdirectories to catch fragmented FAT32 files
      const dirQueue: { cluster: number; pathPrefix: string }[] = [{ cluster: rootCluster, pathPrefix: '' }];
      const visitedDirs = new Set<number>();
      while (dirQueue.length > 0 && visitedDirs.size < 25) {
        if (options.signal?.aborted) break;
        const dir = dirQueue.shift()!;
        if (dir.cluster < 2 || visitedDirs.has(dir.cluster)) continue;
        visitedDirs.add(dir.cluster);

        const dirLba =
          matchingPartition.startLba + fatClusterHeapStartSector + Math.max(0, dir.cluster - 2) * spc;
        const dirRes = await queryTauriRawSectorRange(drive, dirLba, Math.min(32, spc));
        if (!dirRes.supported || dirRes.bytes.length < 32) continue;

        const entryCount = Math.floor(dirRes.bytes.length / 32);
        let lfnParts: string[] = [];
        for (let idx = 0; idx < entryCount; idx++) {
          if (options.signal?.aborted) break;
          const eOff = idx * 32;
          const firstByte = dirRes.bytes[eOff];
          if (firstByte === 0x00) break;
          if (firstByte === 0xe5) {
            lfnParts = [];
            continue;
          }
          const attr = dirRes.bytes[eOff + 11];
          if (attr === 0x0f) {
            const chars: string[] = [];
            const offsets = [1, 3, 5, 7, 9, 14, 16, 18, 20, 22, 24, 28, 30];
            for (const o of offsets) {
              const code = readU16Le(dirRes.bytes, eOff + o);
              if (code === 0x0000 || code === 0xffff) break;
              chars.push(String.fromCharCode(code));
            }
            lfnParts.unshift(chars.join(''));
            continue;
          }
          if ((attr & 0x08) !== 0) {
            lfnParts = [];
            continue;
          }
          const shortNameRaw = String.fromCharCode(...dirRes.bytes.slice(eOff, eOff + 8)).trim();
          const shortExtRaw = String.fromCharCode(...dirRes.bytes.slice(eOff + 8, eOff + 11)).trim();
          const name =
            lfnParts.length > 0
              ? lfnParts.join('')
              : shortExtRaw
              ? `${shortNameRaw}.${shortExtRaw}`
              : shortNameRaw;
          lfnParts = [];
          if (name === '.' || name === '..') continue;

          const clusHi = readU16Le(dirRes.bytes, eOff + 20);
          const clusLo = readU16Le(dirRes.bytes, eOff + 26);
          const firstCluster = ((clusHi << 16) | clusLo) >>> 0;
          const fileSize = readU32Le(dirRes.bytes, eOff + 28);
          const isSubDir = (attr & 0x10) !== 0;
          const fullPath = `${dir.pathPrefix}\\${name}`;

          if (isSubDir && firstCluster >= 2 && visitedDirs.size + dirQueue.length < 25) {
            dirQueue.push({ cluster: firstCluster, pathPrefix: fullPath });
          }

          if (firstCluster >= 2) {
            const extents = await buildFat32Extents(firstCluster);
            const hitsTarget = extents.some(
              ext => targetLba >= ext.startLba && targetLba <= ext.endLba
            );
            if (hitsTarget) {
              affectedFiles.push({
                fileName: name,
                fullPath,
                filesystem: 'FAT32',
                startCluster: firstCluster,
                fileSizeBytes: fileSize,
                isDirectory: isSubDir,
                isSystemMetafile: false,
                matchConfidence: 'exact_extent',
                extents,
                note: `FAT32 FAT1 클러스터 체인 매핑 일치 (${extents.length}개 단편화 구간)`
              });
            }
          }
        }
      }
    }

    const fatAborted = Boolean(options.signal?.aborted);
    return {
      supported: true,
      targetLba,
      sectorSize: secSize,
      partitionName: matchingPartition.name,
      partitionStartLba: matchingPartition.startLba,
      partitionEndLba: matchingPartition.endLba,
      filesystem: fsType,
      clusterSizeBytes: vbrInfo.clusterSizeBytes,
      sectorsPerCluster: spc,
      targetLcn: targetCluster,
      mftRecordsScanned: 0,
      elapsedMs: Math.round(performance.now() - startMs),
      aborted: fatAborted,
      affectedFiles,
      diagnosticNote: fatAborted
        ? `사용자 요청으로 ${fsType} 볼륨 추적이 중단되었습니다.`
        : affectedFiles.length > 0
        ? `${fsType} 볼륨 클러스터 #${targetCluster ?? 'Meta'} 매핑 완료 (${affectedFiles.length}건 식별)`
        : `${fsType} 볼륨 클러스터 #${targetCluster ?? 'N/A'}에 대응하는 파일 엔트리를 찾지 못했습니다 (비할당 클러스터 또는 심층 서브폴더).`
    };
  }

  // 3. NTFS $MFT Traversal
  const mftStartLcn = readU64Le(vbrRes.bytes, 0x30);
  const rawRecordClusterByte = vbrRes.bytes[0x40];
  const signedRecVal = rawRecordClusterByte >= 128 ? rawRecordClusterByte - 256 : rawRecordClusterByte;
  const rawMftRecordSize =
    signedRecVal < 0
      ? signedRecVal >= -16
        ? 1 << -signedRecVal
        : 1024
      : signedRecVal * vbrInfo.clusterSizeBytes;
  const mftRecordSize =
    rawMftRecordSize >= 512 && rawMftRecordSize <= 65536 ? rawMftRecordSize : 1024;
  const sectorsPerRecord = Math.max(1, Math.ceil(mftRecordSize / secSize));
  const targetLcn = Math.floor(relLba / spc);
  const mftBaseLba = matchingPartition.startLba + mftStartLcn * spc;

  // Read MFT Record #0 ($MFT itself) to get all $MFT Data Runs
  options.onProgress?.(0, `$MFT 레코드 #0 (LCN ${mftStartLcn.toLocaleString()}) 판독 중...`);
  const mftRec0Res = await queryTauriRawSectorBytes(drive, mftBaseLba, sectorsPerRecord);
  let mftRuns: { lcnStart: number; clusterCount: number; vcnStart: number }[] = [
    { lcnStart: mftStartLcn, clusterCount: 4096, vcnStart: 0 }
  ];

  if (mftRec0Res.supported && mftRec0Res.bytes.length >= mftRecordSize) {
    const parsedMft0 = parseNtfsMftRecord(mftRec0Res.bytes.subarray(0, mftRecordSize), 0, true);
    if (parsedMft0 && parsedMft0.dataRuns.length > 0) {
      mftRuns = parsedMft0.dataRuns;
    }
  }

  // Build map: recordIndex -> absolute LBA + intra-sector byte skip inside $MFT Data Runs (supports both 512e and 4Kn drives)
  const mftRecordsPerCluster = Math.max(1, Math.floor(vbrInfo.clusterSizeBytes / mftRecordSize));
  const resolveMftBatchLba = (
    firstRecordIdx: number
  ): { lba: number; byteSkip: number; availableRecords: number } | null => {
    const targetClusterOffset = Math.floor(firstRecordIdx / mftRecordsPerCluster);
    let passedClusters = 0;
    for (const run of mftRuns) {
      if (targetClusterOffset < passedClusters + run.clusterCount) {
        const intraRunCluster = targetClusterOffset - passedClusters;
        const intraClusterRecord = firstRecordIdx % mftRecordsPerCluster;
        const byteOffInCluster = intraClusterRecord * mftRecordSize;
        const secOffInCluster = Math.floor(byteOffInCluster / secSize);
        const byteSkip = byteOffInCluster % secSize;
        const lba =
          matchingPartition.startLba +
          (run.lcnStart + intraRunCluster) * spc +
          secOffInCluster;
        const remRecordsInRun =
          (run.clusterCount - intraRunCluster) * mftRecordsPerCluster - intraClusterRecord;
        return { lba, byteSkip, availableRecords: Math.max(1, remRecordsInRun) };
      }
      passedClusters += run.clusterCount;
    }
    return null;
  };

  const nameCache = new Map<number, { name: string; parent: number }>();
  const matchedRecords: ParsedNtfsRecord[] = [];
  let scanned = 0;
  let aborted = Boolean(options.signal?.aborted);

  const maxBatchSectors = 512;
  const batchRecords = Math.max(
    1,
    Math.min(256, Math.floor((maxBatchSectors * secSize) / mftRecordSize) - 1)
  );
  let recCursor = 0;

  while (recCursor < maxMftRecords) {
    if (options.signal?.aborted) {
      aborted = true;
      break;
    }

    const loc = resolveMftBatchLba(recCursor);
    if (!loc) break;

    const readRecordsNow = Math.min(batchRecords, loc.availableRecords, maxMftRecords - recCursor);
    const neededBytes = loc.byteSkip + readRecordsNow * mftRecordSize;
    const readSectors = Math.min(maxBatchSectors, Math.ceil(neededBytes / secSize));
    const batchRes = await queryTauriRawSectorBytes(drive, loc.lba, readSectors);
    if (!batchRes.supported || batchRes.bytes.length < loc.byteSkip + mftRecordSize) {
      recCursor += readRecordsNow;
      continue;
    }

    const availableBytes = Math.max(0, batchRes.bytes.length - loc.byteSkip);
    const actualCount = Math.min(readRecordsNow, Math.floor(availableBytes / mftRecordSize));
    for (let i = 0; i < actualCount; i++) {
      const idx = recCursor + i;
      const recByteStart = loc.byteSkip + i * mftRecordSize;
      const slice = batchRes.bytes.subarray(recByteStart, recByteStart + mftRecordSize);
      const parsed = parseNtfsMftRecord(slice, idx, true);
      scanned++;
      if (!parsed) continue;

      if (parsed.fileName) {
        nameCache.set(parsed.recordNumber, {
          name: parsed.fileName,
          parent: parsed.parentRecordNumber
        });
      }

      // Check if targetLba falls inside any non-resident $DATA run of this file
      const hitsExtent = parsed.dataRuns.some(
        r => targetLcn >= r.lcnStart && targetLcn < r.lcnStart + r.clusterCount
      );
      // Also check if targetLba directly falls inside this specific $MFT record itself!
      const recordLbaStart = loc.lba + Math.floor(recByteStart / secSize);
      const recordLbaEnd = loc.lba + Math.floor((recByteStart + mftRecordSize - 1) / secSize);
      const hitsResidentRecord = targetLba >= recordLbaStart && targetLba <= recordLbaEnd;

      if (hitsExtent || hitsResidentRecord) {
        matchedRecords.push(parsed);
      }
    }

    recCursor += readRecordsNow;
    options.onProgress?.(
      scanned,
      `$MFT 레코드 스캔 중 (${scanned.toLocaleString()} / ${maxMftRecords.toLocaleString()})...`
    );

    if (matchedRecords.some(r => r.recordNumber >= 24 && r.dataRuns.length > 0)) {
      // Found concrete user file extent match; break early if we already passed initial system metafiles
      if (recCursor >= 256) break;
    }
  }

  // On-demand resolve any missing parent directory MFT records so full hierarchy paths are complete
  for (const rec of matchedRecords) {
    if (options.signal?.aborted) {
      aborted = true;
      break;
    }
    let curParent = rec.parentRecordNumber;
    let depth = 0;
    while (curParent !== 5 && !nameCache.has(curParent) && depth < 16) {
      if (options.signal?.aborted) {
        aborted = true;
        break;
      }
      depth++;
      const pLoc = resolveMftBatchLba(curParent);
      if (!pLoc) break;
      const pNeededSectors = Math.ceil((pLoc.byteSkip + mftRecordSize) / secSize);
      const pRes = await queryTauriRawSectorBytes(drive, pLoc.lba, pNeededSectors);
      if (!pRes.supported || pRes.bytes.length < pLoc.byteSkip + mftRecordSize) break;
      const parsedParent = parseNtfsMftRecord(
        pRes.bytes.subarray(pLoc.byteSkip, pLoc.byteSkip + mftRecordSize),
        curParent,
        true
      );
      if (!parsedParent || !parsedParent.fileName) break;
      nameCache.set(parsedParent.recordNumber, {
        name: parsedParent.fileName,
        parent: parsedParent.parentRecordNumber
      });
      curParent = parsedParent.parentRecordNumber;
    }
  }

  const affectedFiles: LbaAffectedFileRecord[] = matchedRecords.map(rec => {
    const fullPath = buildFullPathFromMftCache(rec.recordNumber, nameCache);
    const extents: LbaFileExtent[] = rec.dataRuns.map(r => {
      const startLba = matchingPartition.startLba + r.lcnStart * spc;
      const endLba = startLba + r.clusterCount * spc - 1;
      return {
        startLba,
        endLba,
        vcnStart: r.vcnStart,
        lcnStart: r.lcnStart,
        clusterCount: r.clusterCount
      };
    });
    const isMeta = rec.recordNumber < 24 || (rec.fileName || '').startsWith('$');
    return {
      fileName: rec.fileName || `MFT_Record_${rec.recordNumber}`,
      fullPath,
      filesystem: 'NTFS',
      mftRecordNumber: rec.recordNumber,
      startCluster: rec.dataRuns[0]?.lcnStart,
      fileSizeBytes: rec.fileSizeBytes,
      isDirectory: rec.isDirectory,
      isSystemMetafile: isMeta,
      matchConfidence: rec.dataRuns.length > 0 ? 'exact_extent' : 'resident_mft',
      extents,
      creationTimestampMs: rec.creationTimestampMs,
      note:
        rec.dataRuns.length > 0
          ? `NTFS Data Run Extent 일치 (LCN #${targetLcn.toLocaleString()})`
          : '대상 LBA가 해당 파일의 $MFT 레코드(상주 데이터/메타) 내부에 위치합니다.'
    };
  });

  if (affectedFiles.length === 0 && targetLba === matchingPartition.startLba) {
    affectedFiles.push({
      fileName: '$Boot',
      fullPath: '\\$Boot',
      filesystem: 'NTFS',
      mftRecordNumber: 7,
      fileSizeBytes: 8192,
      isDirectory: false,
      isSystemMetafile: true,
      matchConfidence: 'metadata_zone',
      extents: [
        {
          startLba: matchingPartition.startLba,
          endLba: matchingPartition.startLba + 15,
          vcnStart: 0,
          lcnStart: 0,
          clusterCount: 2
        }
      ],
      note: 'NTFS 볼륨 부트 레코드($Boot) 영역입니다.'
    });
  }

  const diagnosticNote = aborted
    ? `사용자 요청으로 추적이 중단되었습니다 (${scanned.toLocaleString()}개 MFT 레코드 검사됨).`
    : affectedFiles.length > 0
    ? `NTFS 클러스터 LCN #${targetLcn.toLocaleString()} 매핑 완료 — 영향 파일 ${affectedFiles.length}건 식별 (${scanned.toLocaleString()}개 레코드 분석)`
    : `상위 ${scanned.toLocaleString()}개 MFT 레코드에서 LCN #${targetLcn.toLocaleString()}에 매핑된 파일이 발견되지 않았습니다 (비할당 여유 공간 또는 더 높은 MFT 레코드 번호에 위치할 수 있음).`;

  return {
    supported: true,
    targetLba,
    sectorSize: secSize,
    partitionName: matchingPartition.name,
    partitionStartLba: matchingPartition.startLba,
    partitionEndLba: matchingPartition.endLba,
    filesystem: 'NTFS',
    clusterSizeBytes: vbrInfo.clusterSizeBytes,
    sectorsPerCluster: spc,
    targetLcn,
    mftRecordsScanned: scanned,
    elapsedMs: Math.round(performance.now() - startMs),
    aborted,
    affectedFiles,
    diagnosticNote
  };
}
