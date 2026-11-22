/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DiskSentinel Pro - USB Version & Device-Class Adaptive Surface Scan Matrix
 * Tunes native C++/Rust block chunk size, latency thresholds, retry backoff,
 * thermal cooldown intervals, and Fake-Capacity (H2testw-style) checkpoint guards.
 */

import {
  DiskDrive,
  FakeCapacityCheckpointResult,
  FakeCapacityGuardReport,
  SpecializedScanMethodId,
  UsbDeviceClassId,
  UsbGenerationId,
  UsbSurfaceScanPolicy,
  UsbTopologyMetadata,
  UsbTransportProtocol,
} from '../types';

export interface UsbMatrixProfileSpec {
  profileKey: string;
  profileName: string;
  generation: UsbGenerationId;
  generationLabel: string;
  negotiatedSpeedMbps: number;
  maxPracticalMbSec: number;
  transport: UsbTransportProtocol;
  deviceClass: UsbDeviceClassId;
  deviceClassLabel: string;
  methodId: SpecializedScanMethodId;
  chunkKb: number;
  batchSize: number;
  slowThresholdMs: number;
  criticalThresholdMs: number;
  ioTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  cooldownEveryNBlocks: number;
  cooldownMs: number;
  thermalCapC: number;
  rationale: string;
}

export const USB_SCAN_MATRIX_CATALOG: UsbMatrixProfileSpec[] = [
  {
    profileKey: 'usb11_flash_legacy',
    profileName: 'USB 1.1 Full-Speed Legacy Guard',
    generation: 'usb_1_1',
    generationLabel: 'USB 1.1 (12 Mbps)',
    negotiatedSpeedMbps: 12,
    maxPracticalMbSec: 1.1,
    transport: 'BOT',
    deviceClass: 'flash_thumb',
    deviceClassLabel: '레거시 USB 플래시 / 구형 리더기',
    methodId: 'usb_bot_jitter_filter',
    chunkKb: 16,
    batchSize: 8,
    slowThresholdMs: 650,
    criticalThresholdMs: 1800,
    ioTimeoutMs: 5000,
    maxRetries: 3,
    retryDelayMs: 60,
    cooldownEveryNBlocks: 4,
    cooldownMs: 25,
    thermalCapC: 60,
    rationale: '12 Mbps 저속 버스 포화 및 False-Bad 오탐 차단을 위해 16KB 극소 청크와 650/1800ms 완화 임계값을 적용합니다.',
  },
  {
    profileKey: 'usb20_bot_flash',
    profileName: 'USB 2.0 BOT Flash Drive Policy',
    generation: 'usb_2_0',
    generationLabel: 'USB 2.0 High-Speed (480 Mbps)',
    negotiatedSpeedMbps: 480,
    maxPracticalMbSec: 38,
    transport: 'BOT',
    deviceClass: 'flash_thumb',
    deviceClassLabel: 'USB 2.0 플래시 메모리',
    methodId: 'usb_bot_jitter_filter',
    chunkKb: 64,
    batchSize: 16,
    slowThresholdMs: 180,
    criticalThresholdMs: 600,
    ioTimeoutMs: 3500,
    maxRetries: 2,
    retryDelayMs: 40,
    cooldownEveryNBlocks: 8,
    cooldownMs: 20,
    thermalCapC: 62,
    rationale: 'BOT(USBSTOR) 벌크 전송 오버헤드와 저가형 단일 채널 NAND 발열을 억제하기 위해 64KB 청크 + 8블록당 20ms 쿨다운을 적용합니다.',
  },
  {
    profileKey: 'usb20_bot_sd_reader',
    profileName: 'USB 2.0 SD/microSD Card Reader Policy',
    generation: 'usb_2_0',
    generationLabel: 'USB 2.0 High-Speed (480 Mbps)',
    negotiatedSpeedMbps: 480,
    maxPracticalMbSec: 32,
    transport: 'BOT',
    deviceClass: 'sd_card_uhs',
    deviceClassLabel: 'SD / microSD 카드 리더기',
    methodId: 'usb_fat_meta_priority',
    chunkKb: 64,
    batchSize: 16,
    slowThresholdMs: 220,
    criticalThresholdMs: 700,
    ioTimeoutMs: 4000,
    maxRetries: 3,
    retryDelayMs: 50,
    cooldownEveryNBlocks: 8,
    cooldownMs: 25,
    thermalCapC: 60,
    rationale: 'SD 카드 컨트롤러 가비지 컬렉션 지연과 리더기 접점 불안정을 3회 백오프 재시도로 걸러내며 FAT 메타 영역을 선제 검증합니다.',
  },
  {
    profileKey: 'usb20_bot_ext_hdd',
    profileName: 'USB 2.0 External HDD Power-Resilient Policy',
    generation: 'usb_2_0',
    generationLabel: 'USB 2.0 High-Speed (480 Mbps)',
    negotiatedSpeedMbps: 480,
    maxPracticalMbSec: 35,
    transport: 'BOT',
    deviceClass: 'external_hdd',
    deviceClassLabel: '외장 2.5" / 3.5" 기계식 HDD',
    methodId: 'usb_power_glitch_recovery',
    chunkKb: 128,
    batchSize: 16,
    slowThresholdMs: 280,
    criticalThresholdMs: 850,
    ioTimeoutMs: 6000,
    maxRetries: 3,
    retryDelayMs: 120,
    cooldownEveryNBlocks: 16,
    cooldownMs: 15,
    thermalCapC: 55,
    rationale: 'USB 2.0 버스 전력 강하(500mA 한계) 시 스핀업 재대기(120ms 백오프 x 3)로 허위 배드 판정을 방지합니다.',
  },
  {
    profileKey: 'usb30_gen1_flash',
    profileName: 'USB 3.0 / 3.2 Gen1 High-Speed Flash Policy',
    generation: 'usb_3_0_gen1',
    generationLabel: 'USB 3.0 / 3.2 Gen1 (5 Gbps)',
    negotiatedSpeedMbps: 5000,
    maxPracticalMbSec: 420,
    transport: 'BOT',
    deviceClass: 'flash_thumb',
    deviceClassLabel: 'USB 3.0/3.2 Gen1 고속 플래시 드라이브',
    methodId: 'usb_fat_meta_priority',
    chunkKb: 256,
    batchSize: 32,
    slowThresholdMs: 80,
    criticalThresholdMs: 280,
    ioTimeoutMs: 2500,
    maxRetries: 2,
    retryDelayMs: 30,
    cooldownEveryNBlocks: 16,
    cooldownMs: 15,
    thermalCapC: 65,
    rationale: '초소형 메탈 USB 3.0 메모리의 연속 읽기 발열 스로틀링을 막기 위해 256KB 청크와 16블록당 15ms 쿨다운을 적용합니다.',
  },
  {
    profileKey: 'usb30_gen1_sd_uhs',
    profileName: 'USB 3.0 UHS-I / UHS-II SD Card Policy',
    generation: 'usb_3_0_gen1',
    generationLabel: 'USB 3.0 / 3.2 Gen1 (5 Gbps)',
    negotiatedSpeedMbps: 5000,
    maxPracticalMbSec: 312,
    transport: 'SDIO',
    deviceClass: 'sd_card_uhs',
    deviceClassLabel: 'UHS-I / UHS-II 고속 SD 카드',
    methodId: 'usb_fat_meta_priority',
    chunkKb: 256,
    batchSize: 32,
    slowThresholdMs: 90,
    criticalThresholdMs: 320,
    ioTimeoutMs: 2500,
    maxRetries: 2,
    retryDelayMs: 35,
    cooldownEveryNBlocks: 16,
    cooldownMs: 15,
    thermalCapC: 62,
    rationale: '블랙박스/카메라용 UHS-I/II 카드의 SLC 캐시 고갈 지연을 구별하기 위해 256KB 스트림으로 안정 검사를 수행합니다.',
  },
  {
    profileKey: 'usb30_gen1_uasp_ext_hdd',
    profileName: 'USB 3.0 UASP External HDD Streaming Policy',
    generation: 'usb_3_0_gen1',
    generationLabel: 'USB 3.0 / 3.2 Gen1 (5 Gbps)',
    negotiatedSpeedMbps: 5000,
    maxPracticalMbSec: 220,
    transport: 'UASP',
    deviceClass: 'external_hdd',
    deviceClassLabel: 'USB 3.0 UASP 외장 HDD',
    methodId: 'usb_power_glitch_recovery',
    chunkKb: 512,
    batchSize: 32,
    slowThresholdMs: 140,
    criticalThresholdMs: 450,
    ioTimeoutMs: 4500,
    maxRetries: 2,
    retryDelayMs: 100,
    cooldownEveryNBlocks: 0,
    cooldownMs: 0,
    thermalCapC: 55,
    rationale: 'UASP 큐잉으로 ZBR 플래터 최대 대역폭(~210MB/s)을 유지하되 헤드 회전 지연(140ms) 기준을 적용합니다.',
  },
  {
    profileKey: 'usb30_gen1_uasp_sata_ssd',
    profileName: 'USB 3.0 UASP External SATA SSD Policy',
    generation: 'usb_3_0_gen1',
    generationLabel: 'USB 3.0 / 3.2 Gen1 (5 Gbps)',
    negotiatedSpeedMbps: 5000,
    maxPracticalMbSec: 460,
    transport: 'UASP',
    deviceClass: 'external_sata_ssd',
    deviceClassLabel: 'USB 3.0 UASP 외장 SATA SSD',
    methodId: 'usb_uasp_streaming',
    chunkKb: 512,
    batchSize: 48,
    slowThresholdMs: 45,
    criticalThresholdMs: 160,
    ioTimeoutMs: 1800,
    maxRetries: 1,
    retryDelayMs: 20,
    cooldownEveryNBlocks: 0,
    cooldownMs: 0,
    thermalCapC: 68,
    rationale: 'ASMedia/JMicron 브릿지 UASP 환경에서 512KB 대역 정렬 I/O로 SATA SSD 실효 한계(~450MB/s)까지 무지연 스캔합니다.',
  },
  {
    profileKey: 'usb32_gen2_uasp_nvme_ssd',
    profileName: 'USB 3.2 Gen2 (10Gbps) UASP NVMe Enclosure Policy',
    generation: 'usb_3_2_gen2',
    generationLabel: 'USB 3.1 / 3.2 Gen2 (10 Gbps)',
    negotiatedSpeedMbps: 10000,
    maxPracticalMbSec: 1050,
    transport: 'UASP',
    deviceClass: 'external_nvme_ssd',
    deviceClassLabel: '10Gbps UASP 외장 NVMe SSD',
    methodId: 'usb_uasp_streaming',
    chunkKb: 1024,
    batchSize: 64,
    slowThresholdMs: 25,
    criticalThresholdMs: 90,
    ioTimeoutMs: 1200,
    maxRetries: 1,
    retryDelayMs: 15,
    cooldownEveryNBlocks: 32,
    cooldownMs: 8,
    thermalCapC: 70,
    rationale: 'RTL9210B/ASM2362 10Gbps 브릿지 발열 제어(32블록당 8ms 휴지)와 1MB 대용량 DMA 청크를 결합합니다.',
  },
  {
    profileKey: 'usb32_gen2x2_uasp_nvme_ssd',
    profileName: 'USB 3.2 Gen2x2 (20Gbps) UASP NVMe Dual-Lane Policy',
    generation: 'usb_3_2_gen2x2',
    generationLabel: 'USB 3.2 Gen2x2 (20 Gbps)',
    negotiatedSpeedMbps: 20000,
    maxPracticalMbSec: 2000,
    transport: 'UASP',
    deviceClass: 'external_nvme_ssd',
    deviceClassLabel: '20Gbps Gen2x2 외장 NVMe SSD',
    methodId: 'usb_uasp_streaming',
    chunkKb: 1024,
    batchSize: 64,
    slowThresholdMs: 18,
    criticalThresholdMs: 65,
    ioTimeoutMs: 1000,
    maxRetries: 1,
    retryDelayMs: 10,
    cooldownEveryNBlocks: 32,
    cooldownMs: 10,
    thermalCapC: 72,
    rationale: '듀얼 레인 20Gbps 대역폭 포화 구간에서 18ms 초정밀 지연 판정과 10ms 열 완화 사이클을 동시 적용합니다.',
  },
  {
    profileKey: 'usb4_tb_pcie_nvme',
    profileName: 'USB4 / Thunderbolt 4 (40Gbps) Direct PCIe Tunnel',
    generation: 'usb4_tb',
    generationLabel: 'USB4 / Thunderbolt 4 (40 Gbps)',
    negotiatedSpeedMbps: 40000,
    maxPracticalMbSec: 3600,
    transport: 'PCIe_Tunnel',
    deviceClass: 'external_nvme_ssd',
    deviceClassLabel: 'USB4 / TB4 PCIe 터널 NVMe 인클로저',
    methodId: 'usb_usb4_pcie_direct',
    chunkKb: 2048,
    batchSize: 64,
    slowThresholdMs: 12,
    criticalThresholdMs: 45,
    ioTimeoutMs: 800,
    maxRetries: 1,
    retryDelayMs: 10,
    cooldownEveryNBlocks: 32,
    cooldownMs: 12,
    thermalCapC: 75,
    rationale: 'stornvme 네이티브 PCIe 터널링을 통해 내장 NVMe와 동일한 2MB DMA 버스트 및 12/45ms 서브밀리초 판정을 수행합니다.',
  },
  {
    profileKey: 'usb_fake_capacity_guard',
    profileName: 'Industrial / Fake-Capacity Flash Guard (H2testw LBA Guard)',
    generation: 'usb_2_0',
    generationLabel: 'USB 2.0 / 3.0 전세대 호환',
    negotiatedSpeedMbps: 480,
    maxPracticalMbSec: 35,
    transport: 'BOT',
    deviceClass: 'flash_thumb',
    deviceClassLabel: '용량 뻥튀기 의심 USB / SD 카드',
    methodId: 'usb_fake_capacity_guard',
    chunkKb: 64,
    batchSize: 16,
    slowThresholdMs: 160,
    criticalThresholdMs: 500,
    ioTimeoutMs: 3500,
    maxRetries: 2,
    retryDelayMs: 30,
    cooldownEveryNBlocks: 8,
    cooldownMs: 15,
    thermalCapC: 62,
    rationale: '512MB~1TB 2의 거듭제곱 경계 LBA 에일리어싱(CRC32 충돌) 및 Xoshiro256** PRNG 왕복 검증으로 위조 컨트롤러를 적발합니다.',
  },
];

export function generationCodeToId(code: number): UsbGenerationId {
  switch (code) {
    case 11:
      return 'usb_1_1';
    case 20:
      return 'usb_2_0';
    case 30:
      return 'usb_3_0_gen1';
    case 31:
      return 'usb_3_2_gen2';
    case 32:
      return 'usb_3_2_gen2x2';
    case 40:
      return 'usb4_tb';
    default:
      return 'usb_3_0_gen1';
  }
}

export function generationIdToLabel(gen: UsbGenerationId): string {
  switch (gen) {
    case 'usb_1_1':
      return 'USB 1.1 (12 Mbps)';
    case 'usb_2_0':
      return 'USB 2.0 (480 Mbps)';
    case 'usb_3_0_gen1':
      return 'USB 3.0 / 3.2 Gen1 (5 Gbps)';
    case 'usb_3_2_gen2':
      return 'USB 3.1 / 3.2 Gen2 (10 Gbps)';
    case 'usb_3_2_gen2x2':
      return 'USB 3.2 Gen2x2 (20 Gbps)';
    case 'usb4_tb':
      return 'USB4 / Thunderbolt 4 (40 Gbps)';
  }
}

export function inferUsbDeviceClass(drive: Partial<DiskDrive>): {
  deviceClass: UsbDeviceClassId;
  deviceClassLabel: string;
} {
  const model = `${drive.model || ''} ${drive.name || ''}`.toLowerCase();
  const bus = (drive.hardwareSpecs?.busType || '').toUpperCase();

  if (drive.type === 'SD_CARD' || drive.connectionType === 'sd_card' || bus === 'SD' || bus === 'MMC' || /sdxc|sdhc|microsd|card reader/i.test(model)) {
    return { deviceClass: 'sd_card_uhs', deviceClassLabel: 'SD / microSD 카드' };
  }
  if (drive.type === 'EXTERNAL_HDD' || (drive.hardwareSpecs?.rotationalSpeedRpm && drive.hardwareSpecs.rotationalSpeedRpm > 0) || /elements|my passport|backup plus|canvio|expansion|hdd/i.test(model)) {
    return { deviceClass: 'external_hdd', deviceClassLabel: '외장 기계식 HDD' };
  }
  if (/nvme|980|990|sn850|t7|t9|x9|x10|extreme pro|pcie|thunderbolt|usb4/i.test(model)) {
    return { deviceClass: 'external_nvme_ssd', deviceClassLabel: '외장 NVMe SSD 인클로저' };
  }
  if (drive.type === 'EXTERNAL_SSD' || drive.hardwareSpecs?.mediaType === 'SSD (Non-Volatile NAND Flash)') {
    return { deviceClass: 'external_sata_ssd', deviceClassLabel: '외장 SATA/Portable SSD' };
  }
  return { deviceClass: 'flash_thumb', deviceClassLabel: 'USB 플래시 메모리 드라이브' };
}

export function parseRawUsbTopologyToMetadata(
  raw: any,
  driveHint: Partial<DiskDrive>
): UsbTopologyMetadata | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const genCode = Number(raw.usbGenerationCode || 0);
  const trCode = Number(raw.transportCode || 0);
  if (genCode === 0 && trCode === 0) return undefined;

  const generation = generationCodeToId(genCode || 20);
  const transport: UsbTransportProtocol =
    trCode === 2 ? 'UASP' :
    trCode === 3 ? 'PCIe_Tunnel' :
    trCode === 4 ? 'SDIO' :
    'BOT';
  const speedMbps = Number(raw.negotiatedSpeedMbps || (generation === 'usb_2_0' ? 480 : generation === 'usb_1_1' ? 12 : 5000));
  const maxPracticalMbSec =
    speedMbps >= 40000 ? 3600 :
    speedMbps >= 20000 ? 2000 :
    speedMbps >= 10000 ? 1050 :
    speedMbps >= 5000 ? 450 :
    speedMbps >= 480 ? 38 :
    1.1;

  const { deviceClass, deviceClassLabel } = inferUsbDeviceClass(driveHint);

  return {
    generation,
    generationCode: genCode || 20,
    generationLabel: String(raw.usbVersionLabel || generationIdToLabel(generation)),
    negotiatedSpeedMbps: speedMbps,
    maxPracticalMbSec,
    transport,
    transportCode: trCode || 1,
    transportLabel: String(raw.transportLabel || (transport === 'UASP' ? 'UASP (UASPStor)' : transport === 'PCIe_Tunnel' ? 'PCIe Tunnel (USB4/TB)' : transport === 'SDIO' ? 'SDIO' : 'BOT (USBSTOR)')),
    deviceClass,
    deviceClassLabel,
    driverService: String(raw.driverService || (transport === 'UASP' ? 'UASPStor' : transport === 'PCIe_Tunnel' ? 'stornvme' : 'USBSTOR')),
    vendorIdHex: typeof raw.vendorIdHex === 'string' ? raw.vendorIdHex : undefined,
    productIdHex: typeof raw.productIdHex === 'string' ? raw.productIdHex : undefined,
    bcdUsbHex: typeof raw.bcdUsbHex === 'string' ? raw.bcdUsbHex : undefined,
    portNumber: typeof raw.portNumber === 'number' && raw.portNumber > 0 ? raw.portNumber : undefined,
    bridgeChipset: typeof raw.bridgeChipset === 'string' ? raw.bridgeChipset : undefined,
    pnpDeviceId: typeof raw.pnpDeviceId === 'string' ? raw.pnpDeviceId : undefined,
    probeSource: 'win32_pnp_hub',
  };
}

export function detectUsbPortBottleneck(
  drive: Partial<DiskDrive>,
  topo: UsbTopologyMetadata
): string | undefined {
  if (
    (topo.deviceClass === 'external_nvme_ssd' || topo.deviceClass === 'external_sata_ssd' || drive.type === 'EXTERNAL_SSD') &&
    (topo.generation === 'usb_2_0' || topo.generation === 'usb_1_1')
  ) {
    return `고속 외장 SSD가 ${topo.generationLabel} 포트에 연결되어 최대 ~${topo.maxPracticalMbSec} MB/s 병목이 발생 중입니다. PC 후면 USB 3.2 포트 직결을 권장합니다.`;
  }

  if (
    (topo.generation === 'usb_3_0_gen1' || topo.generation === 'usb_3_2_gen2' || topo.generation === 'usb_3_2_gen2x2') &&
    topo.transport === 'BOT' &&
    (topo.deviceClass === 'external_sata_ssd' || topo.deviceClass === 'external_nvme_ssd')
  ) {
    return 'USB 3.x 외장 SSD가 UASP 대신 레거시 BOT(USBSTOR) 프로토콜로 동작 중입니다. UASP 지원 케이블/포트 연결 시 IOPS와 순차 대역폭이 크게 향상됩니다.';
  }

  if (topo.deviceClass === 'external_hdd' && (topo.generation === 'usb_2_0' || topo.generation === 'usb_1_1')) {
    return 'USB 2.0 이하 포트는 5V 공급 전류 한계(500mA)로 인해 외장 HDD 스핀다운 순단이 발생할 수 있습니다. USB 3.0 직결 또는 Y-케이블을 권장합니다.';
  }

  return undefined;
}

export function resolveDriveUsbTopology(drive: DiskDrive): UsbTopologyMetadata | undefined {
  if (!drive.usbTopology) {
    return undefined;
  }

  return {
    ...drive.usbTopology,
    bottleneckWarning:
      drive.usbTopology.bottleneckWarning ?? detectUsbPortBottleneck(drive, drive.usbTopology),
  };
}

export function resolveUsbSurfaceScanPolicy(
  drive: DiskDrive,
  methodId?: SpecializedScanMethodId,
  overrideProfileKey?: string | null
): UsbSurfaceScanPolicy | undefined {
  const secSize = Math.max(512, drive.hardwareSpecs?.logicalSectorSize || 512);
  const toPolicy = (spec: UsbMatrixProfileSpec): UsbSurfaceScanPolicy => ({
    ...spec,
    chunkSectors: Math.max(1, Math.round((spec.chunkKb * 1024) / secSize)),
  });

  if (overrideProfileKey) {
    const manualSpec = USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === overrideProfileKey);
    if (manualSpec) {
      return toPolicy(manualSpec);
    }
  }

  if (methodId === 'usb_fake_capacity_guard') {
    const spec = USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb_fake_capacity_guard')!;
    return toPolicy(spec);
  }

  const topo = resolveDriveUsbTopology(drive);
  const isUsbOrExternal =
    Boolean(topo) ||
    drive.isExternal ||
    drive.type === 'USB' ||
    drive.type === 'SD_CARD' ||
    drive.type === 'EXTERNAL_HDD' ||
    drive.type === 'EXTERNAL_SSD' ||
    drive.connectionType === 'usb' ||
    drive.connectionType === 'sd_card' ||
    drive.connectionType === 'thunderbolt';

  if (!isUsbOrExternal) {
    return undefined;
  }

  if (!topo) {
    if (methodId === 'usb_usb4_pcie_direct' || drive.connectionType === 'thunderbolt') {
      return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb4_tb_pcie_nvme')!);
    }
    if (drive.isUsb2 || drive.usbProtocol?.includes('USB 2.0')) {
      if (drive.type === 'EXTERNAL_HDD' || methodId === 'usb_power_glitch_recovery') {
        return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb20_bot_ext_hdd')!);
      }
      if (drive.type === 'SD_CARD' || drive.connectionType === 'sd_card') {
        return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb20_bot_sd_reader')!);
      }
      return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb20_bot_flash')!);
    }
    if (drive.type === 'SD_CARD' || drive.connectionType === 'sd_card') {
      return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb30_gen1_sd_uhs')!);
    }
    if (drive.type === 'EXTERNAL_HDD' || methodId === 'usb_power_glitch_recovery') {
      return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb30_gen1_uasp_ext_hdd')!);
    }
    if (drive.type === 'EXTERNAL_SSD' || drive.usbProtocol?.includes('UASP')) {
      return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb30_gen1_uasp_sata_ssd')!);
    }
    return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb30_gen1_flash')!);
  }

  if (methodId === 'usb_usb4_pcie_direct' || topo.generation === 'usb4_tb') {
    return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb4_tb_pcie_nvme')!);
  }

  if (topo.generation === 'usb_1_1') {
    return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb11_flash_legacy')!);
  }

  if (topo.generation === 'usb_2_0') {
    if (topo.deviceClass === 'external_hdd' || methodId === 'usb_power_glitch_recovery') {
      return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb20_bot_ext_hdd')!);
    }
    if (topo.deviceClass === 'sd_card_uhs') {
      return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb20_bot_sd_reader')!);
    }
    return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb20_bot_flash')!);
  }

  if (topo.generation === 'usb_3_2_gen2x2') {
    return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb32_gen2x2_uasp_nvme_ssd')!);
  }

  if (topo.generation === 'usb_3_2_gen2') {
    return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb32_gen2_uasp_nvme_ssd')!);
  }

  // USB 3.0 / 3.2 Gen1
  if (topo.deviceClass === 'sd_card_uhs') {
    return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb30_gen1_sd_uhs')!);
  }
  if (topo.deviceClass === 'external_hdd') {
    return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb30_gen1_uasp_ext_hdd')!);
  }
  if (topo.deviceClass === 'external_sata_ssd' || topo.deviceClass === 'external_nvme_ssd' || topo.transport === 'UASP') {
    return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb30_gen1_uasp_sata_ssd')!);
  }
  return toPolicy(USB_SCAN_MATRIX_CATALOG.find(item => item.profileKey === 'usb30_gen1_flash')!);
}

export function computePowerOf2Checkpoints(
  totalCapacityBytes: number,
  logicalSectorSize = 512
): Array<{ label: string; lba: number; offsetBytes: number }> {
  const secSize = Math.max(512, logicalSectorSize);
  const totalSectors = Math.floor(totalCapacityBytes / secSize);
  if (totalSectors < 16384) return [];

  const points: Array<{ label: string; lba: number; offsetBytes: number }> = [];
  let targetMb = 512;
  while (targetMb <= 1024 * 1024) {
    const offsetBytes = targetMb * 1024 * 1024;
    const lba = Math.floor(offsetBytes / secSize);
    if (lba + 64 < totalSectors) {
      const label = targetMb >= 1024 ? `${targetMb / 1024} GiB` : `${targetMb} MiB`;
      points.push({ label, lba, offsetBytes: lba * secSize });
    }
    targetMb *= 2;
  }

  const tailLba = Math.floor(totalSectors * 0.995);
  if (tailLba + 32 < totalSectors && (points.length === 0 || points[points.length - 1].lba !== tailLba)) {
    points.push({
      label: '99.5% Tail',
      lba: tailLba,
      offsetBytes: tailLba * secSize,
    });
  }
  return points;
}

export function isFakeCapacityTier2ProtectedOsDrive(drive: DiskDrive): {
  protected: boolean;
  reason?: string;
} {
  const partitions = drive.hardwareSpecs?.partitions || [];
  const hasCDrive =
    /\bC:/i.test(drive.mountPoint || '') ||
    partitions.some(p => /^C:/i.test(p.letterOrMount || ''));
  const driveIndexMatch = drive.id.match(/^drive-tauri-physical-(\d+)$/);
  const driveIndex = driveIndexMatch ? parseInt(driveIndexMatch[1], 10) : null;

  if (hasCDrive || driveIndex === 0) {
    return {
      protected: true,
      reason: 'OS 시스템/부트 드라이브(PhysicalDrive0 / C:)는 Tier-2 쓰기-검증 복원 테스트가 영구 차단됩니다. Tier-1 읽기 전용 검사만 허용됩니다.',
    };
  }
  return { protected: false };
}

export async function runFakeCapacityGuardScan(
  drive: DiskDrive,
  options: { tier: 'tier1_readonly_alias' | 'tier2_prng_roundtrip'; allowDestructiveWrite?: boolean }
): Promise<FakeCapacityGuardReport> {
  const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI__?.core?.invoke;
  const match = drive.id.match(/^drive-tauri-physical-(\d+)$/);
  const driveIndex = match ? parseInt(match[1], 10) : null;
  const reportedCapBytes =
    drive.hardwareSpecs?.totalCapacityBytes ||
    (drive.capacityGb !== null ? Math.round(drive.capacityGb * 1024 * 1024 * 1024) : 0);

  if (options.tier === 'tier2_prng_roundtrip') {
    const guard = isFakeCapacityTier2ProtectedOsDrive(drive);
    if (guard.protected || !options.allowDestructiveWrite) {
      return {
        driveId: drive.id,
        driveIndex,
        tier: options.tier,
        reportedCapacityBytes: reportedCapBytes,
        verifiedBoundaryBytes: 0,
        verdict: 'SIMULATION_UNAVAILABLE',
        summary: guard.reason || 'Tier-2 PRNG 쓰기-재판독 검증을 실행하려면 사용자 명시적 위험 동의가 필요합니다.',
        checkpoints: [],
        executedAt: Date.now(),
      };
    }
  }

  if (isTauri && driveIndex !== null) {
    try {
      const res = await (window as any).__TAURI__.core.invoke('probe_fake_capacity_checkpoints', {
        driveIndex,
        writeVerifyMode: options.tier === 'tier2_prng_roundtrip',
        allowDestructiveWrite: Boolean(options.allowDestructiveWrite),
      });
      return {
        driveId: drive.id,
        driveIndex,
        tier: res?.tier === 'tier2_prng_roundtrip' ? 'tier2_prng_roundtrip' : 'tier1_readonly_alias',
        reportedCapacityBytes: Number(res?.reportedCapacityBytes || reportedCapBytes),
        verifiedBoundaryBytes: Number(res?.verifiedBoundaryBytes || 0),
        verdict:
          res?.verdict === 'SUSPECTED_FAKE_CAPACITY'
            ? 'SUSPECTED_FAKE_CAPACITY'
            : 'GENUINE_CAPACITY_VERIFIED',
        summary: String(res?.summary || 'LBA 체크포인트 검사 완료'),
        checkpoints: Array.isArray(res?.checkpoints)
          ? res.checkpoints.map((cp: any): FakeCapacityCheckpointResult => ({
              label: String(cp.label || ''),
              lba: Number(cp.lba || 0),
              offsetBytes: Number(cp.offsetBytes || 0),
              crc32Hex: String(cp.crc32Hex || '00000000'),
              entropyBits: Number(cp.entropyBits || 0),
              isAllZero: Boolean(cp.isAllZero),
              latencyMs: Number(cp.latencyMs || 0),
              status: cp.status || 'PASS',
              note: String(cp.note || ''),
            }))
          : [],
        executedAt: Date.now(),
      };
    } catch (err: any) {
      return {
        driveId: drive.id,
        driveIndex,
        tier: options.tier,
        reportedCapacityBytes: reportedCapBytes,
        verifiedBoundaryBytes: 0,
        verdict: 'SIMULATION_UNAVAILABLE',
        summary: `하드웨어 LBA 체크포인트 검사 오류: ${err?.message || String(err)}`,
        checkpoints: [],
        executedAt: Date.now(),
      };
    }
  }

  // Honest browser-sandbox fallback: expose exact calculated Power-of-2 LBA checkpoints without fabricating hardware results
  const planned = computePowerOf2Checkpoints(
    reportedCapBytes,
    drive.hardwareSpecs?.logicalSectorSize || 512
  );
  return {
    driveId: drive.id,
    driveIndex,
    tier: options.tier,
    reportedCapacityBytes: reportedCapBytes,
    verifiedBoundaryBytes: 0,
    verdict: 'SIMULATION_UNAVAILABLE',
    summary: `현재 웹 미리보기(샌드박스) 환경에서는 물리 Raw LBA 에일리어싱 검증이 비활성화됩니다. Windows Tauri 데스크톱(관리자 권한) 실행 시 ${planned.length}개 2의 거듭제곱 경계 LBA를 직접 검증합니다.`,
    checkpoints: planned.map(p => ({
      label: p.label,
      lba: p.lba,
      offsetBytes: p.offsetBytes,
      crc32Hex: '--------',
      entropyBits: 0,
      isAllZero: false,
      latencyMs: 0,
      status: 'WRITE_LOCKED',
      note: 'Tauri 데스크톱 네이티브 Raw I/O 필요',
    })),
    executedAt: Date.now(),
  };
}
