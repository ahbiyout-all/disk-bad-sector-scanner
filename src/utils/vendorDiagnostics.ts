import { DiskDrive, ScanTelemetry } from '../types';

export type StorageVendor =
  | 'samsung'
  | 'seagate'
  | 'wd'
  | 'sandisk'
  | 'sk_hynix'
  | 'solidigm'
  | 'crucial'
  | 'toshiba'
  | 'apple'
  | 'kingston'
  | 'lexar'
  | 'corsair'
  | 'sabrent'
  | 'adata'
  | 'pny'
  | 'teamgroup'
  | 'biwin'
  | 'ymtc'
  | 'nextorage'
  | 'msi'
  | 'asus'
  | 'generic';

export interface VendorProfileInfo {
  vendor: StorageVendor;
  nameKo: string;
  nameEn: string;
  badgeColor: string;
  officialToolName: string;
  officialToolDescription: string;
  coreTechHighlights: string[];
  controllerFamily: string;
  knownHardwareTraits: string;
  recommendedRemediation: string;
}

export interface FutureDriveClassification {
  vendorKey: StorageVendor;
  vendorDisplayName: string;
  recognitionSource: 'Vendor ID Match' | 'SKU Prefix Heuristic' | 'Standard Protocol Classifier';
  protocolStandard: string;
  busGeneration: string;
  estimatedControllerTier: string;
  nandOrPlatterClass: string;
  adaptiveNote: string;
}

export interface DriveMediaComparison {
  connectionCategory: string;
  connectionCategoryKo: string;
  busBandwidth: string;
  powerDelivery: string;
  trimSupportStatus: string;
  thermalThrottlingRisk: 'Low' | 'Medium' | 'High' | 'Critical';
  smrCacheBehavior: string;
  cableCrcVulnerability: string;
}

export interface TailoredActionMethod {
  id: string;
  category: 'vendor_tool' | 'interface_power' | 'sector_repair' | 'thermal_cache' | 'data_safety';
  categoryKo: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';
  title: string;
  description: string;
  actionSteps: string[];
  triggerActionId?: 'open_remap_modal' | 'open_usb_modal' | 'open_smart_refresh' | 'download_tool';
  buttonText?: string;
}

/**
 * Detect Storage Manufacturer from drive name/model using explicit vendor tokens + OEM/SKU prefix heuristics
 * so unreleased/future models using standard vendor model prefixes are still recognized accurately.
 */
export function detectVendor(drive: DiskDrive): StorageVendor {
  const text = `${drive.name} ${drive.model} ${drive.hardwareSpecs?.vendorName || ''} ${drive.hardwareSpecs?.modelNumber || ''}`.toLowerCase();

  if (
    text.includes('samsung') ||
    /\bmz-[a-z0-9]+/i.test(text) ||
    /\b(pm9[a-z0-9]+|pm8[a-z0-9]+|bm9[a-z0-9]+)\b/i.test(text) ||
    /\b(8[567]0|9[789]0|9[1-9]\d{2})\s*(evo|pro|qvo)/i.test(text) ||
    /\b(t[579]\b|t[579]\s*shield|bar\s*plus|fit\s*plus)\b/i.test(text)
  ) {
    return 'samsung';
  }
  if (
    text.includes('seagate') ||
    /\b(barracuda|firecuda|ironwolf|skyhawk|exos|one\s*touch|st\d{3,5}[a-z0-9]+|za\d+[a-z0-9]+|zp\d+[a-z0-9]+)\b/i.test(text)
  ) {
    return 'seagate';
  }
  if (
    text.includes('sandisk') ||
    /\b(sdss[a-z0-9]+|cruzer|ultra\s*fit|extreme\s*(pro\s*)?(portable|sd)|ixpand)\b/i.test(text)
  ) {
    return 'sandisk';
  }
  if (
    text.includes('western digital') ||
    /\b(wd\b|wdc\b|wd_black|wd[a-z0-9_-]*\d{3,}|wds\d+|sn[3578]\d{2,3}[a-z]*|pc\s*sn\d+|my\s*passport|my\s*book|easystore)\b/i.test(text)
  ) {
    return 'wd';
  }
  if (
    text.includes('solidigm') ||
    /\b(ssdpf[a-z0-9]+|p41\s*plus|p44\s*pro|d[357]-p\d+)\b/i.test(text)
  ) {
    return 'solidigm';
  }
  if (
    text.includes('hynix') ||
    /\b(sh[gp]p\d+|hfs\d+|hf[ms]\d+|bc[79]01|pc[78]11|gold\s*p31|platinum\s*p[45]1|beetle\s*x31)\b/i.test(text)
  ) {
    return 'sk_hynix';
  }
  if (
    text.includes('crucial') ||
    text.includes('micron') ||
    /\b(ct\d+[a-z0-9]+|mtfd[a-z0-9]+|mx500|bx500|p3\s*plus|p5\s*plus|p310|t500|t70[05]|x9\s*pro|x10\s*pro)\b/i.test(text)
  ) {
    return 'crucial';
  }
  if (
    text.includes('toshiba') ||
    text.includes('kioxia') ||
    /\b(kbg\d+|kxg\d+|kcd\d+|kcm\d+|canvio|exceria|mg\d{2}[a-z]+|dt01|hdw[a-z0-9]+|thnsn)\b/i.test(text)
  ) {
    return 'toshiba';
  }
  if (
    text.includes('kingston') ||
    /\b(skc\d+|snv[23]s?|sfyr[a-z0-9]+|fury\s*renegade|kc3000|nv[23]\b|xs[12]000|datatraveler)\b/i.test(text)
  ) {
    return 'kingston';
  }
  if (
    text.includes('lexar') ||
    /\b(lnm\d+|nm[6789]\d{2}|lsl\d+|ares\s*pro)\b/i.test(text)
  ) {
    return 'lexar';
  }
  if (
    text.includes('corsair') ||
    /\b(cssd-[a-z0-9]+|mp[567]\d{2})\b/i.test(text)
  ) {
    return 'corsair';
  }
  if (
    text.includes('sabrent') ||
    /\b(sb-rkt[a-z0-9]*|rocket\s*[45q])\b/i.test(text)
  ) {
    return 'sabrent';
  }
  if (
    text.includes('adata') ||
    text.includes('xpg') ||
    /\b(s70\s*blade|legend\s*[789]\d{2}|mars\s*980)\b/i.test(text)
  ) {
    return 'adata';
  }
  if (
    text.includes('pny') ||
    /\b(cs[23]\d{3}|xlr8)\b/i.test(text)
  ) {
    return 'pny';
  }
  if (
    text.includes('teamgroup') ||
    text.includes('t-force') ||
    /\b(tm8[a-z0-9]+|mp[34][34]|z540|cardea)\b/i.test(text)
  ) {
    return 'teamgroup';
  }
  if (
    text.includes('biwin') ||
    text.includes('predator') ||
    /\b(gm[37]\d{3}|nv7\d{3}|acer\s*fa\d+)\b/i.test(text)
  ) {
    return 'biwin';
  }
  if (
    text.includes('ymtc') ||
    text.includes('zhitai') ||
    /\b(tiplus\d+|tipro\d+|pc[34]11)\b/i.test(text)
  ) {
    return 'ymtc';
  }
  if (text.includes('nextorage') || /\bnem-[a-z0-9]+/i.test(text)) {
    return 'nextorage';
  }
  if (text.includes('msi') || text.includes('spatium')) {
    return 'msi';
  }
  if (text.includes('asus') || text.includes('rog strix')) {
    return 'asus';
  }
  if (text.includes('apple') || text.includes('macbook') || text.includes('apfs')) {
    return 'apple';
  }

  return 'generic';
}

/**
 * Future-Proof Standards-Based Storage Classifier:
 * Automatically classifies unreleased / upcoming drives from any OEM or controller family
 * using bus generation, NVMe/ATA/UFS/SD specs, and SKU heuristics without requiring static tables.
 */
export function classifyFutureDriveStandards(drive: DiskDrive): FutureDriveClassification {
  const vendorKey = detectVendor(drive);
  const profile = getVendorProfile(vendorKey);
  const rawModel = `${drive.model || ''} ${drive.hardwareSpecs?.modelNumber || ''} ${drive.name || ''}`;
  const lower = rawModel.toLowerCase();
  const bus = (drive.hardwareSpecs?.busType || drive.type || 'Unknown').toUpperCase();

  let recognitionSource: FutureDriveClassification['recognitionSource'] = 'Standard Protocol Classifier';
  if (vendorKey !== 'generic') {
    const explicitBrandTokens = [
      'samsung', 'seagate', 'western digital', 'sandisk', 'hynix', 'solidigm',
      'crucial', 'micron', 'toshiba', 'kioxia', 'apple', 'kingston', 'lexar',
      'corsair', 'sabrent', 'adata', 'xpg', 'pny', 'team', 'biwin', 'predator',
      'ymtc', 'zhitai', 'nextorage', 'msi', 'asus'
    ];
    recognitionSource = explicitBrandTokens.some(t => lower.includes(t))
      ? 'Vendor ID Match'
      : 'SKU Prefix Heuristic';
  }

  const isGen5Hint =
    /gen\s*5|pcie\s*5|5\.0|9100\s*pro|t70[05]|sn8100|mp700|z540|e26|sm2508|mars\s*980|pc511|p51\b/i.test(rawModel);
  const isGen4Hint =
    /gen\s*4|pcie\s*4|4\.0|990\s*pro|980\s*pro|sn850|p41|p44|kc3000|nm790|gm7000|s70|rocket\s*4/i.test(rawModel);
  const isUsb4Hint = /usb4|thunderbolt|40gbps|asm2464/i.test(rawModel);

  let protocolStandard = 'Universal Storage Standard (ATA-8 / SCSI / NVMe)';
  let busGeneration = drive.hardwareSpecs?.busInterfaceSpeed || drive.interface;
  let estimatedControllerTier = profile.controllerFamily;

  if (bus.includes('NVME') || drive.type === 'NVMe') {
    if (isGen5Hint) {
      protocolStandard = 'NVMe 2.0 PCIe Gen5 x4 Standard';
      busGeneration = 'PCIe 5.0 x4 (~14,000 MB/s Peak)';
      estimatedControllerTier = vendorKey === 'generic' ? 'Next-Gen PCIe 5.0 Controller (Phison E26 / SMI SM2508 Class)' : profile.controllerFamily;
    } else if (isGen4Hint) {
      protocolStandard = 'NVMe 1.4 / 2.0 PCIe Gen4 x4 Standard';
      busGeneration = 'PCIe 4.0 x4 (~7,400 MB/s Peak)';
    } else {
      protocolStandard = 'NVMe 1.4 / 2.0 Standard Command Set';
      busGeneration = 'PCIe NVMe Direct DMA Queue';
    }
  } else if (bus === 'USB' || drive.isExternal) {
    if (isUsb4Hint) {
      protocolStandard = 'USB4 / Thunderbolt NVMe Tunneling (UASP 40Gbps)';
      busGeneration = 'USB4 / TB4 40 Gbps (~3,800 MB/s)';
    } else if (drive.usbProtocol?.includes('UASP') || bus.includes('USB')) {
      protocolStandard = 'USB Attached SCSI Protocol (UASP / BOT)';
      busGeneration = drive.isUsb2 ? 'USB 2.0 480 Mbps' : 'USB 3.2 Gen1/Gen2 (5~20 Gbps)';
    }
  } else if (bus === 'SATA' || bus === 'ATA') {
    protocolStandard = 'ATA-8 / AHCI NCQ Serial ATA Standard';
    busGeneration = 'SATA III 6.0 Gbps (600 MB/s)';
  } else if (bus === 'SD' || bus === 'MMC' || drive.type === 'SD_CARD') {
    protocolStandard = 'SDXC UHS-I/II / eMMC 5.1 Card Standard';
    busGeneration = 'SDIO / eMMC Bus';
  } else if (bus === 'UFS') {
    protocolStandard = 'JEDEC UFS 3.1 / 4.0 Flash Standard';
    busGeneration = 'UFS M-PHY Dual-Lane';
  } else if (bus === 'RAID' || bus === 'STORAGE SPACES') {
    protocolStandard = 'Hardware/OS RAID Virtual Block Array';
    busGeneration = 'Multi-Disk Striped/Mirrored Controller';
  } else if (bus.includes('SCSI') || bus.includes('SAS')) {
    protocolStandard = 'SCSI / SAS Enterprise Command Set';
    busGeneration = 'SAS 12G / 24G Enterprise Bus';
  }

  const isPlatter = drive.type === 'HDD' || drive.type === 'EXTERNAL_HDD' || drive.hardwareSpecs?.rotationalSpeedRpm === 5400 || drive.hardwareSpecs?.rotationalSpeedRpm === 7200;
  const nandOrPlatterClass = isPlatter
    ? 'Magnetic Platter (CMR / SMR Mechanical Head)'
    : bus === 'SD' || bus === 'MMC' || bus === 'UFS'
    ? 'Embedded 3D TLC/MLC Flash Memory'
    : '3D TLC / QLC Non-Volatile NAND Flash';

  const adaptiveNote =
    vendorKey === 'generic'
      ? `신규/미등록 모델 [${drive.model}]을 표준 ${protocolStandard} 규격으로 자동 프로파일링했습니다.`
      : `${profile.nameEn} 계열 모델로 인식됨 (${protocolStandard}).`;

  return {
    vendorKey,
    vendorDisplayName: vendorKey === 'generic' ? (drive.hardwareSpecs?.vendorName || 'Standard OEM Storage') : profile.nameEn,
    recognitionSource,
    protocolStandard,
    busGeneration,
    estimatedControllerTier,
    nandOrPlatterClass,
    adaptiveNote
  };
}

/**
 * Get detailed manufacturer profile information
 */
export function getVendorProfile(vendor: StorageVendor): VendorProfileInfo {
  switch (vendor) {
    case 'samsung':
      return {
        vendor: 'samsung',
        nameKo: '삼성전자 (Samsung Electronics)',
        nameEn: 'Samsung Electronics',
        badgeColor: 'bg-blue-600 text-white',
        officialToolName: 'Samsung Magician (v8.1+)',
        officialToolDescription: '삼성 전용 V-NAND 펌웨어 업데이트, TurboWrite SLC 버퍼 점검, LBA 암호화 세큐어 이레이즈 및 PSID 수복 지원',
        coreTechHighlights: [
          'V-NAND 3D 셀 구조 & Pascal/Elpis/Presto 컨트롤러',
          'Intelligent TurboWrite 가속 버퍼 알고리즘',
          'Rapid Mode RAM 캐싱 & UASP TRIM 파스스루'
        ],
        controllerFamily: 'Samsung Elpis / Pablo / Phoenix / Presto NVMe Controller',
        knownHardwareTraits: '연속 대용량 쓰기 시 TurboWrite SLC 캐시가 소진되면 쓰기 속도가 직결 TLC 속도로 떨어지며, NVMe 70°C 이상 발생 시 써멀 스로틀링 2단계가 개입함.',
        recommendedRemediation: 'Samsung Magician을 사용하여 최신 펌웨어 적용 후, 부하 시 Over-Provisioning(10%) 영역을 설정하여 플래시 셀 수명 연장.'
      };

    case 'seagate':
      return {
        vendor: 'seagate',
        nameKo: '씨게이트 (Seagate Technology)',
        nameEn: 'Seagate Technology',
        badgeColor: 'bg-emerald-600 text-white',
        officialToolName: 'Seagate SeaTools (GUI & Command Line)',
        officialToolDescription: 'SeaTools Bootable 진단, IronWolf Health Management(IHM), S.M.A.R.T. 숏/롱 셀프 테스트 및 물리 섹터 수복',
        coreTechHighlights: [
          'SMR (Shingled Magnetic Recording) 다층 겹침 쓰기',
          'IronWolf Health Management (IHM) 환경 센서',
          'Mach.2 Dual Actuator 이중 자기헤드 가속'
        ],
        controllerFamily: 'Seagate Custom Controller / Phison E18 / Marvell SATA Engine',
        knownHardwareTraits: 'SMR(기와식 기록) 방식 매체는 랜덤 데이터 쓰기 시 오버랩 트랙 재기록으로 인해 순간 응답 지연(500ms+)이 발생할 수 있음.',
        recommendedRemediation: 'SeaTools Long Generic 검사를 시행하여 오프라인 불량 섹터(Offline Uncorrectable)를 디스크 펌웨어 레벨에서 예비 트랙으로 전면 재할당.'
      };

    case 'wd':
      return {
        vendor: 'wd',
        nameKo: '웨스턴 디지털 (Western Digital / WD)',
        nameEn: 'Western Digital',
        badgeColor: 'bg-cyan-600 text-white',
        officialToolName: 'Western Digital Dashboard & Data Lifeguard',
        officialToolDescription: 'WD Dashboard S.M.A.R.T. 확장 검사, nCache 4.0 상태 모니터링, USB 브릿지 보드 일체형 패스워드 락 수수',
        coreTechHighlights: [
          'BiCS 3D TLC/QLC Flash & nCache 4.0 버퍼',
          'WD My Passport 통합 USB PCB 보드 설계',
          'OptiNAND 하이브리드 Flash-Enhanced HDD'
        ],
        controllerFamily: 'WD / SanDisk In-House Polaris / Triton NVMe & SATA Controller',
        knownHardwareTraits: '외장 HDD 모델(My Passport)은 SATA-to-USB 브릿지 회로가 메인 기판에 일체형으로 통합되어 있어, 전력 충격 시 USB Port 통신 에러(ID 199)가 빈번히 발생함.',
        recommendedRemediation: 'WD Dashboard를 통한 S.M.A.R.T. ID #197 Current Pending Sector 정밀 감지 후, Zero-Fill (Write Zero) 모드로 수복 시행.'
      };

    case 'sandisk':
      return {
        vendor: 'sandisk',
        nameKo: '샌디스크 (SanDisk / WD Subsidiary)',
        nameEn: 'SanDisk',
        badgeColor: 'bg-red-600 text-white',
        officialToolName: 'SanDisk Storage Dashboard',
        officialToolDescription: '외장 포터블 SSD 써멀 모니터링, UASP 드라이버 호환성 점검, SD 카드 내구성 검증 유틸리티',
        coreTechHighlights: [
          'Extreme Portable SSD IP65 방수방진 하우징',
          'ASMedia / Realtek RTL9210B UASP 10Gbps Bridge',
          'SDXC UHS-I / UHS-II V30/V60 V-NAND Flash'
        ],
        controllerFamily: 'Realtek / ASMedia / Silicon Motion External Bridge',
        knownHardwareTraits: '포터블 외장 SSD는 밀폐형 서브 하우징 특성상 지속적인 4K 랜덤 파일 검사 시 55°C 이상 상승할 수 있으며, 이 때 열 보호 감소 동작이 시작됨.',
        recommendedRemediation: 'UASP 10Gbps 지원 C-to-C 직결 케이블을 사용하고, 정밀 검사 시 전면 USB 허브 대신 메인보드 후면 직접 연결 권장.'
      };

    case 'sk_hynix':
      return {
        vendor: 'sk_hynix',
        nameKo: 'SK하이닉스 (SK hynix)',
        nameEn: 'SK hynix',
        badgeColor: 'bg-rose-600 text-white',
        officialToolName: 'SK hynix Drive Manager',
        officialToolDescription: 'SK하이닉스 Platinum/Gold SSD 전용 S.M.A.R.T. 모니터링, 펌웨어 갱신 및 PSID 물리적 초기화',
        coreTechHighlights: [
          '176단 / 238단 / 321단 4D NAND Flash & Aries/Alisteria 컨트롤러',
          '초저전력 에너지 효율 관리 프로토콜',
          '정전 대비 데이터 보호 (Power Loss Protection)'
        ],
        controllerFamily: 'SK hynix In-House Aries / Cepheus / Alisteria Controller',
        knownHardwareTraits: '전력 대 성능비가 매우 뛰어나나, 고온 밀폐 환경에서 NVMe 온도 센서 2(Controller Temp)가 급상승할 수 있음.',
        recommendedRemediation: 'SK hynix Drive Manager로 최신 NVMe 펌웨어를 유지하고, 방열판(Heatsink) 밀착 여부를 확인.'
      };

    case 'solidigm':
      return {
        vendor: 'solidigm',
        nameKo: '솔리다임 (Solidigm / SK hynix Subsidiary)',
        nameEn: 'Solidigm',
        badgeColor: 'bg-purple-700 text-white',
        officialToolName: 'Solidigm Synergy Storage Tool',
        officialToolDescription: 'Solidigm P41 Plus / P44 Pro / D7 엔터프라이즈 펌웨어 관리, 호스트 관리형 캐시(Fast Lane) 진단 및 SMART 분석',
        coreTechHighlights: [
          'Solidigm Synergy 드라이버 & Fast Lane 읽기 가속',
          'SK hynix 기반 176단 4D TLC & 고밀도 Floating Gate QLC',
          '엔터프라이즈급 비정상 종료 복구 (PLI)'
        ],
        controllerFamily: 'Solidigm Aries / Silicon Motion Enterprise Controller',
        knownHardwareTraits: 'P41 Plus 같은 QLC 드라이브는 SLC 캐시 고갈 후 순차 쓰기 속도가 급감할 수 있으므로 유휴 시간 확보가 중요함.',
        recommendedRemediation: 'Solidigm Synergy 도구를 설치하여 Fast Lane 캐시 최적화 및 최신 펌웨어 유지.'
      };

    case 'crucial':
      return {
        vendor: 'crucial',
        nameKo: '크루셜 / 마이크론 (Crucial / Micron)',
        nameEn: 'Crucial Micron',
        badgeColor: 'bg-indigo-600 text-white',
        officialToolName: 'Crucial Storage Executive',
        officialToolDescription: 'Momentum Cache RAM 가속기, Over-Provisioning 맞춤 설정, RAIN 다중 하드웨어 이중화 셀 복구',
        coreTechHighlights: [
          'Micron 232-Layer+ 3D TLC NAND',
          'Momentum Cache 스마트 램 캐싱',
          'RAIN (Redundant Array of Independent NAND)'
        ],
        controllerFamily: 'Phison E18/E26 / Silicon Motion NVMe Engine',
        knownHardwareTraits: 'Gen5 T700/T705 등 고성능 모델은 적극적인 방열(Heatsink)이 없으면 75°C 부근에서 급격한 써멀 스로틀링 또는 셧다운이 발생할 수 있음.',
        recommendedRemediation: 'Crucial Storage Executive에서 Momentum Cache 및 온도 경고를 확인하고 적절한 M.2 방열판 장착을 점검.'
      };

    case 'apple':
      return {
        vendor: 'apple',
        nameKo: '애플 (Apple Silicon Mac NVMe Storage)',
        nameEn: 'Apple Inc.',
        badgeColor: 'bg-slate-700 text-white',
        officialToolName: 'Apple macOS Disk Utility & Diagnostics',
        officialToolDescription: 'macOS 디스크 유틸리티 APFS Container 퍼스트 에이드(First Aid), Apple Silicon Mac 내부 SSD 무결성 진단',
        coreTechHighlights: [
          'APFS (Apple File System) 스냅샷 & 잇줄 암호화',
          'Apple Silicon 온칩 통합 NVMe 컨트롤러',
          'PCIe 4.0 / Thunderbolt 4 초고속 다이렉트 버스'
        ],
        controllerFamily: 'Apple Custom Storage Controller (SoC Integrated)',
        knownHardwareTraits: 'Apple Silicon Mac SSD는 컨트롤러가 SoC에 통합되어 있으며, macOS 자체 APFS 스냅샷 및 파일볼트(FileVault) 암호화 컨테이너로 보호됨.',
        recommendedRemediation: '애플 하드웨어 진단(Apple Diagnostics) 실행 및 macOS 디스크 유틸리티 First Aid로 APFS 볼륨 컨테이너 복구.'
      };

    case 'toshiba':
      return {
        vendor: 'toshiba',
        nameKo: '도시바 / 키옥시아 (Toshiba / Kioxia)',
        nameEn: 'Toshiba Kioxia Storage',
        badgeColor: 'bg-slate-800 text-white border border-slate-700',
        officialToolName: 'Kioxia SSD Utility & Toshiba Storage Diagnostic Tool',
        officialToolDescription: '도시바/키옥시아 전용 BiCS FLASH 3D 낸드 수명 분석, Canvio 외장 HDD 진단, QSBC 고성능 ECC 오류 수복 및 전력 관리 최적화',
        coreTechHighlights: [
          'BiCS FLASH 3D TLC/QLC 낸드 & 전용 키옥시아 컨트롤러',
          'QSBC (Quadruple Swing-By Code) 고밀도 ECC 에러 보정',
          'Canvio 램프 로드 (Ramp Load) & 3축 내장 충격 센서'
        ],
        controllerFamily: 'Kioxia TC58NVG NVMe/SATA Controller / Toshiba HDD Engine',
        knownHardwareTraits: '도시바 외장 하드(Canvio)는 3축 충격 센서가 작동 시 헤드를 무충격 위치(Ramp)로 신속히 내보내 물리적 손상을 방지하며, 키옥시아 낸드 매체는 QSBC ECC 한계 근접 시 4K 무작위 레이턴시가 증가할 수 있음.',
        recommendedRemediation: 'Kioxia SSD Utility로 QSBC ECC 오류 카운터 및 TRIM 상태를 확인하고, Canvio 외장 HDD는 충격 센서 이력 점검 권장.'
      };

    case 'kingston':
      return {
        vendor: 'kingston',
        nameKo: '킹스톤 (Kingston Technology)',
        nameEn: 'Kingston Technology',
        badgeColor: 'bg-red-700 text-white',
        officialToolName: 'Kingston SSD Manager (KSM)',
        officialToolDescription: 'KC3000 / Fury Renegade / NV3 등 Kingston SSD 전용 펌웨어 업데이트, Wear-Leveling 건강도 및 NVMe 온도 조회',
        coreTechHighlights: [
          'Phison E18 / E27 / Silicon Motion SM2269XT 컨트롤러',
          '그래핀-알루미늄 로우프로파일 히트스프레더',
          'TCG Opal 2.0 하드웨어 암호화 및 표준 NVMe TRIM'
        ],
        controllerFamily: 'Phison PS5018-E18 / PS5027-E27T / SMI NVMe Controller',
        knownHardwareTraits: 'NV2/NV3 보급형 라인업은 로트(Batch)에 따라 TLC와 QLC 낸드 또는 컨트롤러가 혼용되므로 SLC 캐시 고갈 시 속도 편차가 클 수 있음.',
        recommendedRemediation: 'Kingston SSD Manager로 최신 펌웨어 적용 후, 20% 이상 여유 공간을 유지해 가비지 컬렉션 성능을 확보.'
      };

    case 'lexar':
      return {
        vendor: 'lexar',
        nameKo: '렉사 (Lexar / Longsys)',
        nameEn: 'Lexar',
        badgeColor: 'bg-sky-700 text-white',
        officialToolName: 'Lexar DiskMaster',
        officialToolDescription: 'NM790 / NM990 / ARES SSD 및 SDXC UHS-II 카드 전용 펌웨어 업데이트 및 SMART 진단 유틸리티',
        coreTechHighlights: [
          'Maxio MAP1602 DRAM-less 고효율 / Gen5 컨트롤러',
          'HMB (Host Memory Buffer) 3.0 지원',
          'SDXC UHS-II V90 고속 메모리 카드 아키텍처'
        ],
        controllerFamily: 'Maxio MAP1602 / InnoGrit / SMI Controller',
        knownHardwareTraits: 'HMB 기반 DRAM-less NVMe 모델은 시스템 RAM과 대역폭을 공유하며, SLC 캐시 소진 시 쓰기 지연이 증가할 수 있음.',
        recommendedRemediation: 'Lexar DiskMaster로 최신 HMB/전력 관리 펌웨어를 유지하고 NVMe Log 02h 예비 블록 수치를 주기적으로 점검.'
      };

    case 'corsair':
      return {
        vendor: 'corsair',
        nameKo: '커세어 (Corsair)',
        nameEn: 'Corsair',
        badgeColor: 'bg-amber-600 text-white',
        officialToolName: 'Corsair SSD Toolbox',
        officialToolDescription: 'MP600 / MP700 시리즈 전용 펌웨어 갱신, Over-Provisioning 및 SMART 수명 검사',
        coreTechHighlights: [
          'Phison E18 / E26 PCIe Gen4 & Gen5 고대역폭 엔진',
          '고효율 알루미늄 히트싱크 및 수랭 옵션 지원',
          'Dynamic Wear-Leveling & SmartECC'
        ],
        controllerFamily: 'Phison PS5018-E18 / PS5026-E26 NVMe Controller',
        knownHardwareTraits: 'MP700 Gen5 모델은 고부하 표면 검사 시 발열이 빠르므로 패시브/액티브 쿨링 상태를 함께 모니터링해야 함.',
        recommendedRemediation: 'Corsair SSD Toolbox에서 SMART 마모율과 펌웨어 버전을 확인.'
      };

    case 'sabrent':
      return {
        vendor: 'sabrent',
        nameKo: '세이브렌트 (Sabrent)',
        nameEn: 'Sabrent',
        badgeColor: 'bg-blue-700 text-white',
        officialToolName: 'Sabrent Rocket Control Panel',
        officialToolDescription: 'Sabrent Rocket SSD 펌웨어 업데이트, 512e/4Kn 섹터 포맷 전환 및 S.M.A.R.T. 상태 진단',
        coreTechHighlights: [
          'Phison E18 / E26 레퍼런스 기반 고내구성 튜닝',
          '네이티브 4Kn / 512e 섹터 크기 전환 지원',
          '알루미늄 외장 인클로저 브릿지(RTL9210B/ASM2464)'
        ],
        controllerFamily: 'Phison NVMe Controller / ASMedia USB4 Bridge',
        knownHardwareTraits: '대용량 4TB/8TB 모델 및 외장 USB4 인클로저는 전원 소비가 높아 메인보드 직결 및 안정적인 USB-C PD 포트 연결이 필수적임.',
        recommendedRemediation: 'Rocket Control Panel을 통해 최신 펌웨어 및 섹터 정렬(4K AF)을 유지.'
      };

    case 'adata':
      return {
        vendor: 'adata',
        nameKo: '에이데이타 / XPG (ADATA / XPG)',
        nameEn: 'ADATA / XPG',
        badgeColor: 'bg-fuchsia-700 text-white',
        officialToolName: 'ADATA SSD Toolbox',
        officialToolDescription: 'LEGEND / XPG S70 / MARS 시리즈 펌웨어 갱신, 시스템 최적화 및 SMART 수명 진단',
        coreTechHighlights: [
          'InnoGrit IG5236 / SMI SM2508 고성능 컨트롤러',
          'SLC 캐싱 + DRAM 버퍼 하이브리드 구조',
          'LDPC ECC & AES 256-bit 암호화'
        ],
        controllerFamily: 'InnoGrit / Silicon Motion / Realtek NVMe Controller',
        knownHardwareTraits: '고발열 컨트롤러 탑재 모델의 경우 장시간 스캔 시 방열판 미장착 상태에서 온도 상승(70°C+)에 따른 스로틀링이 발생할 수 있음.',
        recommendedRemediation: 'ADATA SSD Toolbox로 펌웨어 최신화 및 온도 임계치 모니터링.'
      };

    case 'pny':
    case 'teamgroup':
    case 'biwin':
    case 'ymtc':
    case 'nextorage':
    case 'msi':
    case 'asus':
      return {
        vendor,
        nameKo:
          vendor === 'pny'
            ? '피엔와이 (PNY Technologies)'
            : vendor === 'teamgroup'
            ? '팀그룹 (TeamGroup / T-FORCE)'
            : vendor === 'biwin'
            ? '바이윈 / 프레데터 (BIWIN / Acer Predator)'
            : vendor === 'ymtc'
            ? '양쯔메모리 / 즈타이 (YMTC / Zhitai)'
            : vendor === 'nextorage'
            ? '넥스토리지 (Nextorage Japan)'
            : vendor === 'msi'
            ? '엠에스아이 (MSI SPATIUM)'
            : '에이수스 (ASUS ROG Strix Storage)',
        nameEn: vendor.toUpperCase(),
        badgeColor: 'bg-indigo-700 text-white',
        officialToolName: '제조사 공식 SSD Toolbox & 표준 NVMe/ATA 커널 진단',
        officialToolDescription: '표준 NVMe 1.4/2.0 Log Page 02h 및 ATA-8 S.M.A.R.T. 표준 규격 기반 펌웨어/수명 정밀 모니터링',
        coreTechHighlights: [
          'Phison / InnoGrit / Maxio / SMI 표준 멀티채널 NVMe 컨트롤러',
          'Xtacking 3D TLC NAND / BiCS / Micron 고적층 플래시',
          'HMB 및 SLC 동적 캐시 + LDPC 저밀도 패리티 ECC'
        ],
        controllerFamily: 'Phison / Maxio / InnoGrit / Silicon Motion Reference Controller',
        knownHardwareTraits: '최신 세대(PCIe Gen4/Gen5 & USB4) 컨트롤러를 탑재한 모델은 표준 NVMe 2.0 / SMART 속성을 그대로 따르므로 별도 전용 드라이버 없이도 온도·예비블록·마모율 정밀 분석이 가능함.',
        recommendedRemediation: '표준 TRIM 활성 상태와 방열(Heatsink) 상태를 점검하고, 이상 섹터 발견 시 즉시 백업 및 S.M.A.R.T. 상태 확인 권장.'
      };

    case 'generic':
    default:
      return {
        vendor: 'generic',
        nameKo: '표준 프로토콜 범용 스토리지 (Universal OEM / Next-Gen)',
        nameEn: 'Universal Standard Storage',
        badgeColor: 'bg-indigo-600 text-white',
        officialToolName: '표준 NVMe 2.0 / ATA-8 / UASP 커널 직접 진단',
        officialToolDescription: '특정 제조사 DB에 아직 등록되지 않은 신제품·OEM 디스크도 OS 커널 NVMe/ATA/SCSI 표준 디스크립터로 100% 호환 진단합니다.',
        coreTechHighlights: [
          'Zero-Table 표준 프로토콜 자동 분류 (NVMe 2.0 / ATA-8 / SCSI / UFS / SDXC)',
          'STORAGE_DEVICE_DESCRIPTOR + SeekPenalty + TRIM + 온도 IOCTL 자동 감지',
          'USB Mass Storage Class (BOT & UASP / USB4)'
        ],
        controllerFamily: 'Standard Host Kernel Storage Driver (NVMe / AHCI / UASP)',
        knownHardwareTraits: '신규 출시 제조사 및 커스텀 OEM 드라이브는 모델명 대신 표준 버스(BusType), 섹터 크기(512e/4Kn), 및 커널 레이턴시 특성을 기준으로 자동 보정 스캔이 적용됩니다.',
        recommendedRemediation: 'DiskSentinel Pro의 표면 검사(Verify/Read/Butterfly) 및 실시간 지연 히스토그램으로 하드웨어 이상 유무를 직접 검증하세요.'
      };
  }
}

/**
 * Compare Internal vs External Traits for a given drive
 */
export function getDriveMediaAnalysis(drive: DiskDrive): DriveMediaComparison {
  const busUpper = (drive.hardwareSpecs?.busType || '').toUpperCase();
  const classification = classifyFutureDriveStandards(drive);

  if (drive.isExternal || busUpper === 'SD' || busUpper === 'MMC' || drive.type === 'SD_CARD') {
    const isSd = busUpper === 'SD' || busUpper === 'MMC' || drive.type === 'SD_CARD';
    const isUsb2 = drive.isUsb2 || drive.usbProtocol?.includes('USB 2.0');
    const isUsb4 = /usb4|thunderbolt|40gbps/i.test(`${drive.model} ${drive.interface}`);
    const isUasp = drive.usbProtocol?.includes('UASP') || drive.usbProtocol?.includes('NVMe over USB');

    return {
      connectionCategory: isSd ? 'sd_card' : drive.type === 'EXTERNAL_SSD' ? 'external_ssd' : 'external_hdd',
      connectionCategoryKo: isSd
        ? 'SD / MicroSD / eMMC 메모리 카드'
        : drive.type === 'EXTERNAL_SSD'
        ? isUsb4
          ? '외장 USB4 / Thunderbolt 포터블 SSD'
          : '외장 포터블 SSD (USB UASP/NVMe)'
        : '외장 하드디스크 (2.5"/3.5" USB HDD)',
      busBandwidth: isSd
        ? 'SD UHS-I / UHS-II (104 ~ 312 MB/s)'
        : isUsb4
        ? 'USB4 / Thunderbolt 4 (40Gbps / ~3,800MB/s)'
        : isUsb2
        ? 'USB 2.0 (실효 ~35MB/s 대역폭 병목)'
        : isUasp
        ? 'USB 3.2 Gen 2 UASP (10Gbps / ~1,050MB/s)'
        : 'USB 3.0 BOT (5Gbps / ~450MB/s)',
      powerDelivery: isUsb2 ? 'USB 2.0 (5V 500mA / 2.5W - 전력 강하 위험 높음)' : 'USB 3.x / USB-C PD (900mA~15W+ - 정상)',
      trimSupportStatus: isUasp || isUsb4 ? 'UASP 패킷을 통한 TRIM / UNMAP 파스스루 지원' : 'BOT / SD 버스 제한으로 OS TRIM 미지원 (컨트롤러 자체 GC)',
      thermalThrottlingRisk: drive.temperatureC !== null && drive.temperatureC > 48 ? 'High' : drive.temperatureC !== null && drive.temperatureC > 40 ? 'Medium' : 'Low',
      smrCacheBehavior: drive.type === 'EXTERNAL_HDD' ? '외장 SMR 구조: 대용량 쓰기 시 300ms+ 헤드 지연 가능성' : 'USB/SD SLC 캐시 소진 시 직결 TLC/QLC 쓰기 감속',
      cableCrcVulnerability: 'USB 케이블 단자 오염, 리더기 접촉 불량 시 S.M.A.R.T. ID #199 / 패킷 재전송 오류 위험'
    };
  }

  if (busUpper === 'RAID' || busUpper === 'STORAGE SPACES') {
    return {
      connectionCategory: 'raid_array',
      connectionCategoryKo: '하드웨어/OS RAID 및 스토리지 풀 볼륨',
      busBandwidth: classification.busGeneration,
      powerDelivery: '멀티 드라이브 백플레인 / 호스트 전원 직접 인가',
      trimSupportStatus: drive.hardwareSpecs?.trimSupported ? 'RAID 컨트롤러 UNMAP / TRIM 파스스루 활성' : '컨트롤러 정책에 따름',
      thermalThrottlingRisk: drive.temperatureC !== null && drive.temperatureC > 55 ? 'High' : 'Low',
      smrCacheBehavior: 'RAID 어레이 스트라이핑(Striping) 및 컨트롤러 Write-Back 캐시 동작',
      cableCrcVulnerability: '백플레인 커넥터 및 개별 멤버 디스크 SMART 상태를 RAID BIOS/관리자에서 교차 검증 권장'
    };
  }

  // Internal NVMe / UFS / SCM
  if (drive.type === 'NVMe' || busUpper === 'NVME' || busUpper === 'UFS' || busUpper === 'SCM') {
    return {
      connectionCategory: 'internal_nvme',
      connectionCategoryKo: busUpper === 'UFS' ? '내장 UFS 3.1/4.0 플래시 스토리지' : '내장 NVMe M.2 PCIe SSD',
      busBandwidth: classification.busGeneration,
      powerDelivery: '메인보드 3.3V Direct 레일 (최대 10W+ 서지 케이파빌리티)',
      trimSupportStatus: 'OS 네이티브 NVMe Dataset Management (TRIM) 100% 지원',
      thermalThrottlingRisk: drive.temperatureC !== null && drive.temperatureC > 65 ? 'Critical' : drive.temperatureC !== null && drive.temperatureC > 50 ? 'Medium' : 'Low',
      smrCacheBehavior: 'SLC TurboWrite/nCache 동적 버퍼링 (소진 시 본래 TLC 속도 유지)',
      cableCrcVulnerability: 'PCIe M.2 골드핑거 직접 체결로 케이블 CRC 에러 원천 차단'
    };
  }

  // Internal SATA (HDD / SSD)
  return {
    connectionCategory: drive.type === 'HDD' ? 'internal_hdd' : 'internal_sata_ssd',
    connectionCategoryKo: drive.type === 'HDD' ? '내장 SATA III 기계식 하드디스크 (7200/5400 RPM)' : '내장 SATA III 2.5인치 SSD',
    busBandwidth: 'SATA III 6.0Gbps (실효 ~550MB/s)',
    powerDelivery: '파워서플라이 12V (스핀들 모터) + 5V (로직) 직결',
    trimSupportStatus: drive.type === 'HDD' ? 'N/A (기계식 플래터)' : 'SATA AHCI TRIM (Deterministic Read ZEROs)',
    thermalThrottlingRisk: drive.temperatureC !== null && drive.temperatureC > 45 ? 'Medium' : 'Low',
    smrCacheBehavior: drive.type === 'HDD' ? '플래터 ZBR 외주/내주 속도 차이 (외주 220MB/s -> 내주 100MB/s)' : 'SATA DRAM 캐시 유무에 따른 4K 랜덤 지연',
    cableCrcVulnerability: 'SATA 데이터 케이블 접촉 불량 시 S.M.A.R.T. ID #199 에러 증가'
  };
}

/**
 * Generate 4 - 6 prioritized, highly tailored action methods based on drive vendor, media type, and current SMART state.
 */
export function getTailoredActionMethods(
  drive: DiskDrive,
  telemetry?: ScanTelemetry
): TailoredActionMethod[] {
  const vendor = detectVendor(drive);
  const vendorProfile = getVendorProfile(vendor);
  const actions: TailoredActionMethod[] = [];

  const badCount = telemetry?.badCount ?? 0;
  const pendingSectors = drive.smartAttributes.find(a => a.id === 197);
  const crcErrors = drive.smartAttributes.find(a => a.id === 199);

  // 1. Critical Sector Repair Action if Bad sectors exist
  if (badCount > 0 || (pendingSectors && parseInt(pendingSectors.raw) > 0)) {
    actions.push({
      id: 'action-sector-repair',
      category: 'sector_repair',
      categoryKo: '배드섹터 복구 & S.M.A.R.T. 재할당',
      priority: 'CRITICAL',
      title: `[S.M.A.R.T. 수복] ${badCount > 0 ? `${badCount}개 배드섹터` : '보류 중인 섹터(Pending Sector)'} 논리 제로필 치료`,
      description: `검출된 불량 LBA 주소에 0x00 제로필(Zero-Fill)을 수행하여 파티션 통신을 복구하고, 마이크로코드에 예비 섹터 재할당(Reallocation) 신호를 전송합니다.`,
      actionSteps: [
        '안전 잠금 토글을 해제하고 S.M.A.R.T. 수복 & 재할당 모달 실행',
        '논리 오류인 경우 Zero-Fill 패턴 기입으로 LBA 가용 상태 회복',
        '물리 손상 시 디스크 마이크로코드가 예비 트랙(G-List)으로 위치 재할당'
      ],
      triggerActionId: 'open_remap_modal',
      buttonText: 'S.M.A.R.T. 수복 실행'
    });
  }

  // 2. Vendor Specific Official Tool Diagnostic Action
  actions.push({
    id: 'action-vendor-tool',
    category: 'vendor_tool',
    categoryKo: `${vendorProfile.nameKo} 전용 진단`,
    priority: badCount > 0 ? 'HIGH' : 'MEDIUM',
    title: `[제조사 맞춤] ${vendorProfile.officialToolName} 정밀 진단`,
    description: vendorProfile.officialToolDescription,
    actionSteps: [
      `${vendorProfile.officialToolName} 실행 후 펌웨어 업데이트 여부 확인`,
      `제조사 독자 프로토콜: ${vendorProfile.coreTechHighlights[0]}`,
      `특성 참고: ${vendorProfile.knownHardwareTraits}`
    ],
    buttonText: `${vendorProfile.officialToolName} 가이드`
  });

  // 3. Interface & Power Supply Action (External USB or SATA Cable)
  if (drive.isExternal) {
    const isUsb2 = drive.isUsb2 || drive.usbProtocol?.includes('USB 2.0');
    actions.push({
      id: 'action-interface-power',
      category: 'interface_power',
      categoryKo: '외장 인터페이스 & 전력 수복',
      priority: isUsb2 ? 'HIGH' : 'MEDIUM',
      title: isUsb2 
        ? '[USB 2.0 대역폭 해제] USB 3.2 UASP 포트로 변경 연결 권장' 
        : '[UASP 스트리밍] 전력 공급 및 케이블 신뢰성 점검',
      description: isUsb2
        ? 'USB 2.0은 5V 500mA 전력 한계와 35MB/s 속도 병목으로 전력 지터가 발생할 수 있습니다.'
        : 'UASP 10Gbps 고속 통신 모드가 활성화되어 있습니다. C-타입 케이블 유격을 점검하세요.',
      actionSteps: [
        'PC 전면 USB 허브 대신 메인보드 후면 직접 연결 (전력 안정화)',
        '외장 HDD의 경우 보조 전원 Y-케이블 또는 유전원 허브 사용',
        '안전 제거(Safe Eject) 기능을 통해 OS 쓰기 캐시 완전 플러시 후 분리'
      ],
      triggerActionId: 'open_usb_modal',
      buttonText: '외부 장치 관리자 열기'
    });
  } else if (crcErrors && parseInt(crcErrors.raw) > 0) {
    actions.push({
      id: 'action-cable-crc',
      category: 'interface_power',
      categoryKo: '인터페이스 케이블 수복',
      priority: 'HIGH',
      title: '[케이블 전송 에러] UltraDMA CRC Error (ID 199) 교정',
      description: `SATA 데이터 케이블 접촉 불량 또는 M.2 슬롯 이물질로 인해 ${crcErrors.raw}회의 신호 전송 오류가 발생했습니다.`,
      actionSteps: [
        'SATA 케이블 단자를 새 제품으로 교체하거나 M.2 골드핑거 세척',
        '메인보드 SATA 포트를 다른 번호로 변경 결착',
        'S.M.A.R.T. ID 199 카운터가 더 이상 증가하지 않는지 모니터링'
      ]
    });
  }

  // 4. Thermal & Cache Strategy Action
  if ((drive.temperatureC !== null && drive.temperatureC > 45) || drive.type === 'NVMe' || drive.type === 'EXTERNAL_SSD') {
    const tempDisplay = drive.temperatureC !== null ? `${drive.temperatureC}°C` : '센서 N/A';
    actions.push({
      id: 'action-thermal-cache',
      category: 'thermal_cache',
      categoryKo: '발열 관리 & 쓰기 캐시 최적화',
      priority: drive.temperatureC !== null && drive.temperatureC > 50 ? 'HIGH' : 'INFO',
      title: `[발열 & 캐시] ${tempDisplay} 발열 제어 및 SLC 버퍼 관리`,
      description: drive.type === 'NVMe'
        ? 'NVMe SSD는 70°C 이상 도달 시 써멀 스로틀링이 발동하여 속도를 저하시킵니다.'
        : '외장 SSD는 밀폐 하우징 특성상 대량 스캔 중 발열을 방지해야 합니다.',
      actionSteps: [
        'M.2 방열판(Heatsink) 및 써멀패드 밀착 상태 점검',
        '연속 대용량 작업 후 5~10분간 유휴(Idle) 상태를 두어 SLC 캐시 비우기',
        'Windows TRIM 명령을 통해 비어있는 낸드 블록 사전 정리'
      ]
    });
  }

  // 5. Data Safety & Backup Strategy Action
  actions.push({
    id: 'action-data-safety',
    category: 'data_safety',
    categoryKo: '데이터 안전 & 무결성 보존',
    priority: badCount > 0 ? 'CRITICAL' : 'INFO',
    title: badCount > 0 ? '[긴급 대피] 중요 데이터 2차 백업 및 이미지 백업' : '[데이터 무결성] 정기적 건강 상태 스냅샷 저장',
    description: badCount > 0
      ? '물리적 배드섹터가 발견된 디스크는 추가 손상이 빠르게 진행될 수 있습니다. 중요한 문서와 사진을 우선 복사하세요.'
      : '현재 디스크 상태의 S.M.A.R.T. 스냅샷 및 스캔 보고서를 PDF로 보관하여 추후 상태 변화와 비교하세요.',
    actionSteps: [
      '결함 영역(LBA 주소)을 피하여 중요 폴더 우선 백업',
      '수복 작업(Zero-Fill/Remap)을 실행하기 전 핵심 데이터 백업 완료',
      '상단 [진단 보고서] 버튼으로 검사 결과서 저장'
    ]
  });

  return actions;
}
