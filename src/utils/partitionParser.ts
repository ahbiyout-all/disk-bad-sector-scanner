import {
  ParsedPartitionTable,
  PartitionEntryRecord,
  VbrBootInfo
} from '../types';

const MBR_TYPE_NAMES: Record<number, string> = {
  0x00: 'Empty',
  0x01: 'FAT12',
  0x04: 'FAT16 (<32MB)',
  0x05: 'Extended CHS',
  0x06: 'FAT16B',
  0x07: 'NTFS / exFAT / HPFS',
  0x0b: 'FAT32 (CHS)',
  0x0c: 'FAT32 (LBA)',
  0x0e: 'FAT16B (LBA)',
  0x0f: 'Extended LBA',
  0x27: 'Windows Recovery (Hidden)',
  0x82: 'Linux Swap',
  0x83: 'Linux Native (ext4/xfs)',
  0x8e: 'Linux LVM',
  0xee: 'GPT Protective MBR',
  0xef: 'EFI System Partition'
};

const GPT_TYPE_GUIDS: Record<string, string> = {
  'C12A7328-F81F-11D2-BA4B-00A0C93EC93B': 'EFI System Partition',
  'E3C9E316-0B5C-4DB8-817D-F92DF00215AE': 'Microsoft Reserved (MSR)',
  'EBD0A0A2-B9E5-4433-87C0-68B6B72699C7': 'Basic Data (NTFS/exFAT/FAT32)',
  'DE94BBA4-06D1-4D40-A16A-BFD50179D6AC': 'Windows Recovery Environment',
  '0FC63DAF-8483-4772-8E79-3D69D8477DE4': 'Linux Filesystem Data',
  '0657FD6D-A4AB-43C4-84E5-0933C84B4F4F': 'Linux Swap',
  'E6D6D379-F507-44C2-A23C-238F2A3DF928': 'Linux LVM',
  '48465300-0000-11AA-AA11-00306543ECAC': 'Apple HFS+',
  '7C3457EF-0000-11AA-AA11-00306543ECAC': 'Apple APFS'
};

function readU16Le(bytes: number[], off: number): number {
  if (off + 1 >= bytes.length) return 0;
  return (bytes[off] | (bytes[off + 1] << 8)) >>> 0;
}

function readU32Le(bytes: number[], off: number): number {
  if (off + 3 >= bytes.length) return 0;
  return (
    (bytes[off] |
      (bytes[off + 1] << 8) |
      (bytes[off + 2] << 16) |
      (bytes[off + 3] << 24)) >>>
    0
  );
}

function readU64LeNumber(bytes: number[], off: number): number {
  if (off + 7 >= bytes.length) return 0;
  const lo = readU32Le(bytes, off);
  const hi = readU32Le(bytes, off + 4);
  return hi * 4294967296 + lo;
}

function formatGuid(bytes: number[], off: number): string {
  if (off + 15 >= bytes.length) return '00000000-0000-0000-0000-000000000000';
  const d1 = readU32Le(bytes, off).toString(16).toUpperCase().padStart(8, '0');
  const d2 = readU16Le(bytes, off + 4).toString(16).toUpperCase().padStart(4, '0');
  const d3 = readU16Le(bytes, off + 6).toString(16).toUpperCase().padStart(4, '0');
  const d4 = bytes
    .slice(off + 8, off + 10)
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
    .join('');
  const d5 = bytes
    .slice(off + 10, off + 16)
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
    .join('');
  return `${d1}-${d2}-${d3}-${d4}-${d5}`;
}

function decodeUtf16LeName(bytes: number[], off: number, byteLen: number): string {
  const chars: string[] = [];
  for (let i = 0; i + 1 < byteLen && off + i + 1 < bytes.length; i += 2) {
    const code = readU16Le(bytes, off + i);
    if (code === 0) break;
    chars.push(String.fromCharCode(code));
  }
  return chars.join('').trim();
}

function crc32Ieee(slice: number[]): number {
  let crc = 0xffffffff;
  for (let i = 0; i < slice.length; i++) {
    crc ^= slice[i];
    for (let bit = 0; bit < 8; bit++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (~crc) >>> 0;
}

/**
 * Parses raw LBA 0..33 bytes from a physical drive into MBR or GPT partition metadata.
 */
export function parsePartitionTableFromRawBytes(
  bytes: number[],
  sectorSize = 512
): ParsedPartitionTable {
  const safeSecSize = sectorSize >= 512 ? sectorSize : 512;
  const sigLow = bytes[510] ?? 0;
  const sigHigh = bytes[511] ?? 0;
  const mbrSigHex = `0x${((sigHigh << 8) | sigLow).toString(16).toUpperCase().padStart(4, '0')}`;
  const mbrSignatureValid = sigLow === 0x55 && sigHigh === 0xaa;

  // Parse MBR 4 primary entries at 0x1BE (446)
  const mbrEntries: PartitionEntryRecord[] = [];
  let protectiveMbrDetected = false;

  if (bytes.length >= 512) {
    for (let idx = 0; idx < 4; idx++) {
      const base = 446 + idx * 16;
      const bootFlag = bytes[base];
      const partType = bytes[base + 4];
      const startLba = readU32Le(bytes, base + 8);
      const sectorCount = readU32Le(bytes, base + 12);

      if (partType === 0 || sectorCount === 0) continue;
      if (partType === 0xee) protectiveMbrDetected = true;

      const sizeGb = Number(((sectorCount * safeSecSize) / (1024 * 1024 * 1024)).toFixed(2));
      mbrEntries.push({
        index: idx + 1,
        scheme: 'MBR',
        typeName: MBR_TYPE_NAMES[partType] || `MBR Type 0x${partType.toString(16).toUpperCase().padStart(2, '0')}`,
        typeCodeOrGuid: `0x${partType.toString(16).toUpperCase().padStart(2, '0')}`,
        name: `MBR Partition #${idx + 1}`,
        bootable: bootFlag === 0x80,
        startLba,
        endLba: startLba + sectorCount - 1,
        sectorCount,
        sizeGb,
        is4kAligned: (startLba * safeSecSize) % 4096 === 0
      });
    }
  }

  // Check LBA 1 for GPT Header ("EFI PART" = 45 46 49 20 50 41 52 54)
  const gptOff = safeSecSize;
  if (bytes.length >= gptOff + 92) {
    const gptSig = String.fromCharCode(...bytes.slice(gptOff, gptOff + 8));
    if (gptSig === 'EFI PART') {
      const headerSize = readU32Le(bytes, gptOff + 12);
      const storedCrc = readU32Le(bytes, gptOff + 16);
      let gptHeaderCrcValid = false;
      if (headerSize >= 92 && headerSize <= safeSecSize && bytes.length >= gptOff + headerSize) {
        const headerCopy = bytes.slice(gptOff, gptOff + headerSize);
        if (headerCopy.length >= 20) {
          headerCopy[16] = 0;
          headerCopy[17] = 0;
          headerCopy[18] = 0;
          headerCopy[19] = 0;
        }
        const computedCrc = crc32Ieee(headerCopy);
        gptHeaderCrcValid = computedCrc === storedCrc;
      }

      const gptPrimaryLba = readU64LeNumber(bytes, gptOff + 24);
      const gptBackupLba = readU64LeNumber(bytes, gptOff + 32);
      const gptFirstUsableLba = readU64LeNumber(bytes, gptOff + 40);
      const gptLastUsableLba = readU64LeNumber(bytes, gptOff + 48);
      const gptDiskGuid = formatGuid(bytes, gptOff + 56);
      const entryStartLba = readU64LeNumber(bytes, gptOff + 72);
      const numEntries = readU32Le(bytes, gptOff + 80);
      const entrySize = readU32Le(bytes, gptOff + 84) || 128;

      const entriesByteOffset = entryStartLba * safeSecSize;
      const gptEntries: PartitionEntryRecord[] = [];
      const maxReadable = Math.min(
        numEntries,
        Math.floor(Math.max(0, bytes.length - entriesByteOffset) / entrySize)
      );

      for (let i = 0; i < maxReadable; i++) {
        const eOff = entriesByteOffset + i * entrySize;
        const typeGuid = formatGuid(bytes, eOff);
        if (typeGuid === '00000000-0000-0000-0000-000000000000') continue;

        const partitionGuid = formatGuid(bytes, eOff + 16);
        const firstLba = readU64LeNumber(bytes, eOff + 32);
        const lastLba = readU64LeNumber(bytes, eOff + 40);
        const attrFlagsLo = readU32Le(bytes, eOff + 48);
        const name = decodeUtf16LeName(bytes, eOff + 56, 72) || `Partition #${gptEntries.length + 1}`;
        const sectorCount = lastLba >= firstLba ? lastLba - firstLba + 1 : 0;
        const sizeGb = Number(((sectorCount * safeSecSize) / (1024 * 1024 * 1024)).toFixed(2));

        gptEntries.push({
          index: i + 1,
          scheme: 'GPT',
          typeName: GPT_TYPE_GUIDS[typeGuid] || 'GPT Custom / Vendor Partition',
          typeCodeOrGuid: typeGuid,
          partitionGuid,
          name,
          bootable: (attrFlagsLo & 0x04) !== 0,
          startLba: firstLba,
          endLba: lastLba,
          sectorCount,
          sizeGb,
          is4kAligned: (firstLba * safeSecSize) % 4096 === 0
        });
      }

      return {
        scheme: 'GPT',
        sectorSize: safeSecSize,
        mbrSignatureHex: mbrSigHex,
        mbrSignatureValid,
        protectiveMbrDetected,
        gptHeaderSignature: gptSig,
        gptHeaderCrcValid,
        gptDiskGuid,
        gptPrimaryLba,
        gptBackupLba,
        gptFirstUsableLba,
        gptLastUsableLba,
        entries: gptEntries
      };
    }
  }

  return {
    scheme: mbrEntries.length > 0 || mbrSignatureValid ? 'MBR' : 'UNINITIALIZED',
    sectorSize: safeSecSize,
    mbrSignatureHex: mbrSigHex,
    mbrSignatureValid,
    protectiveMbrDetected,
    entries: mbrEntries
  };
}

/**
 * Inspects a single 512B+ sector buffer for NTFS / exFAT / FAT32 Volume Boot Record signatures.
 */
export function detectVbrBootInfo(bytes: number[]): VbrBootInfo | null {
  if (bytes.length < 512) return null;
  const sigValid = bytes[510] === 0x55 && bytes[511] === 0xaa;
  const oemBytes = bytes.slice(3, 11);
  const oemId = oemBytes
    .map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : ' '))
    .join('')
    .trim();

  if (oemId.startsWith('NTFS')) {
    const bps = readU16Le(bytes, 11) || 512;
    const spc = bytes[13] || 8;
    return {
      filesystem: 'NTFS',
      oemId,
      bytesPerSector: bps,
      sectorsPerCluster: spc,
      clusterSizeBytes: bps * spc,
      signatureValid: sigValid
    };
  }

  if (oemId.startsWith('EXFAT')) {
    const bpsShift = bytes[108] || 9;
    const spcShift = bytes[109] || 3;
    const bps = 1 << Math.min(16, Math.max(9, bpsShift));
    const spc = 1 << Math.min(25, spcShift);
    return {
      filesystem: 'exFAT',
      oemId,
      bytesPerSector: bps,
      sectorsPerCluster: spc,
      clusterSizeBytes: bps * spc,
      signatureValid: sigValid
    };
  }

  const fat32Label = String.fromCharCode(...bytes.slice(82, 87)).trim();
  if (fat32Label === 'FAT32') {
    const bps = readU16Le(bytes, 11) || 512;
    const spc = bytes[13] || 8;
    return {
      filesystem: 'FAT32',
      oemId: oemId || 'FAT32',
      bytesPerSector: bps,
      sectorsPerCluster: spc,
      clusterSizeBytes: bps * spc,
      signatureValid: sigValid
    };
  }

  return null;
}
