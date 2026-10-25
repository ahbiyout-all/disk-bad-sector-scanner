import { DiskDrive, ScanTelemetry } from '../types';

export type StorageVendor = 
  | 'samsung'
  | 'seagate'
  | 'wd'
  | 'sandisk'
  | 'sk_hynix'
  | 'crucial'
  | 'toshiba'
  | 'apple'
  | 'kingston'
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
 * Detect Storage Manufacturer from drive name/model
 */
export function detectVendor(drive: DiskDrive): StorageVendor {
  const text = `${drive.name} ${drive.model}`.toLowerCase();
  
  if (text.includes('samsung') || text.includes('mz-v') || text.includes('bar plus')) {
    return 'samsung';
  }
  if (text.includes('seagate') || text.includes('barracuda') || text.includes('ironwolf') || text.includes('one touch') || text.includes('st2000') || text.includes('stkz')) {
    return 'seagate';
  }
  if (text.includes('wd') || text.includes('western digital') || text.includes('passport') || text.includes('wdc') || text.includes('blue') || text.includes('black') || text.includes('red')) {
    return 'wd';
  }
  if (text.includes('sandisk') || text.includes('cruzer') || text.includes('sdssde')) {
    return 'sandisk';
  }
  if (text.includes('hynix') || text.includes('gold p31') || text.includes('platinum p41')) {
    return 'sk_hynix';
  }
  if (text.includes('crucial') || text.includes('micron') || text.includes('mx500') || text.includes('p5')) {
    return 'crucial';
  }
  if (text.includes('toshiba') || text.includes('kioxia') || text.includes('canvio') || text.includes('exceria') || text.includes('mg08') || text.includes('dt01') || text.includes('hdtc') || text.includes('thnsn')) {
    return 'toshiba';
  }
  if (text.includes('apple') || text.includes('macbook') || text.includes('mac') || text.includes('apfs')) {
    return 'apple';
  }
  if (text.includes('kingston')) {
    return 'kingston';
  }
  
  return 'generic';
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
          'V-NAND 3D 셀 구조 & Pascal/Elpis 컨트롤러',
          'Intelligent TurboWrite 가속 버퍼 알고리즘',
          'Rapid Mode RAM 캐싱 & UASP TRIM 파스스루'
        ],
        controllerFamily: 'Samsung Elpis / Pablo / Phoenix Proprietary NVMe Controller',
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
        controllerFamily: 'Seagate Custom Controller / Marvell SATA Engine',
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
        controllerFamily: 'WD / SanDisk In-House NVMe & SATA Controller',
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
          '176단 / 238단 4D NAND Flash & Aries 컨트롤러',
          '초저전력 에너지 효율 관리 프로토콜',
          '정전 대비 데이터 보호 (Power Loss Protection)'
        ],
        controllerFamily: 'SK hynix In-House Aries / Cepheus Controller',
        knownHardwareTraits: '전력 대 성능비가 매우 뛰어나나, 고온 밀폐 환경에서 NVMe 온도 센서 2(Controller Temp)가 급상승할 수 있음.',
        recommendedRemediation: 'SK hynix Drive Manager로 최신 NVMe 펌웨어를 유지하고, 방열판(Heatsink) 밀착 여부를 확인.'
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
          'Micron 232-Layer 3D TLC NAND',
          'Momentum Cache 스마트 램 캐싱',
          'RAIN (Redundant Array of Independent NAND)'
        ],
        controllerFamily: 'Silicon Motion / Phison E18 NVMe Engine',
        knownHardwareTraits: 'RAIN 수복 기능으로 소량의 배드 블록은 내부에 인캡슐레이션되어 자동 대체되나, 전원 비정상 차단 시 무결성 수복에 시간이 소요될 수 있음.',
        recommendedRemediation: 'Crucial Storage Executive에서 Momentum Cache 상태를 확인하고 PSID Re-set을 이용한 공장 초기화 고려.'
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
          'Canvio 램프 로드 (Ramp Load) & 3축 내장 충격 센서',
          '엔터프라이즈 회전 진동 감쇄 센서 (RV Sensors)'
        ],
        controllerFamily: 'Kioxia TC58NVG NVMe/SATA Controller / Toshiba High-Reliability HDD Engine',
        knownHardwareTraits: '도시바 외장 하드(Canvio)는 3축 충격 센서가 작동 시 헤드를 무충격 위치(Ramp)로 신속히 내보내 물리적 손상을 방지하며, 키옥시아 낸드 매체는 QSBC ECC 한계 근접 시 4K 무작위 레이턴시가 증가할 수 있음.',
        recommendedRemediation: 'Kioxia SSD Utility로 QSBC ECC 오류 카운터 및 TRIM 상태를 확인하고, Canvio 외장 HDD는 전용 진단 툴로 충격 센서 이력 로그를 감지한 후 Zero-Fill 수복을 권장.'
      };

    case 'kingston':
    case 'generic':
    default:
      return {
        vendor: 'generic',
        nameKo: '호스트 시스템 및 범용 스토리지 (Host / OEM)',
        nameEn: 'Host System / Generic Storage',
        badgeColor: 'bg-indigo-600 text-white',
        officialToolName: 'OS 네이티브 스토리지 진단 및 DiskSentinel Pro',
        officialToolDescription: 'OS 커널 Direct I/O 및 표준 NVMe 1.4 / ATA-8 명령 큐를 통한 무결성 검사 및 표면 분석',
        coreTechHighlights: [
          'OS Direct Kernel Buffer & DMA I/O Stack',
          '표준 ATA-8 & NVMe 1.4 Command Set',
          'USB Mass Storage Class (BOT & UASP)'
        ],
        controllerFamily: 'Host Kernel Driver / Phison / SMI / Realtek Universal Controller',
        knownHardwareTraits: 'OS 커널 버퍼 캐시 및 표준 LBA Read/Write 파이프라인을 통해 하드웨어 병목 없이 고속 스캔이 수행됨.',
        recommendedRemediation: '본 프로그램의 S.M.A.R.T. 수복 & Zero-Fill 재할당 엔진을 통해 직접 불량 섹터 치료 진행.'
      };
  }
}

/**
 * Compare Internal vs External Traits for a given drive
 */
export function getDriveMediaAnalysis(drive: DiskDrive): DriveMediaComparison {
  if (drive.isExternal) {
    const isUsb2 = drive.isUsb2 || drive.usbProtocol?.includes('USB 2.0');
    const isUasp = drive.usbProtocol?.includes('UASP') || drive.usbProtocol?.includes('NVMe over USB');

    return {
      connectionCategory: drive.type === 'EXTERNAL_SSD' ? 'external_ssd' : drive.type === 'SD_CARD' ? 'sd_card' : 'external_hdd',
      connectionCategoryKo: drive.type === 'EXTERNAL_SSD' ? '외장 포터블 SSD (USB UASP/NVMe)' : drive.type === 'SD_CARD' ? 'SD / MicroSD 카드리더' : '외장 하드디스크 (2.5"/3.5" USB HDD)',
      busBandwidth: isUsb2 ? 'USB 2.0 (실효 ~35MB/s 대역폭 병목)' : isUasp ? 'USB 3.2 Gen 2 UASP (10Gbps / ~1,050MB/s)' : 'USB 3.0 BOT (5Gbps / ~450MB/s)',
      powerDelivery: isUsb2 ? 'USB 2.0 (5V 500mA / 2.5W - 전력 강하 위험 높음)' : 'USB 3.x (5V 900mA~15W - 정상)',
      trimSupportStatus: isUasp ? 'UASP 패킷을통한 TRIM / UNMAP 파스스루 지원' : 'BOT 프로토콜 제한으로 OS TRIM 지원 불가 (가비지 컬렉션 내장 처리)',
      thermalThrottlingRisk: drive.temperatureC > 48 ? 'High' : drive.temperatureC > 40 ? 'Medium' : 'Low',
      smrCacheBehavior: drive.type === 'EXTERNAL_HDD' ? '외장 SMR 구조: 대용량 쓰기 시 300ms+ 헤드 지연 가능성' : 'USB SLC 캐시 소진 시 직결 TLC/QLC 쓰기 감속',
      cableCrcVulnerability: 'USB 케이블 단자 오염, Micro-B 젠더 유격 시 S.M.A.R.T. ID #199 UltraDMA CRC Error 감지 위험'
    };
  }

  // Internal Storage
  if (drive.type === 'NVMe') {
    return {
      connectionCategory: 'internal_nvme',
      connectionCategoryKo: '내장 NVMe M.2 PCIe SSD',
      busBandwidth: 'PCIe Gen4 x4 (최대 7,000MB/s)',
      powerDelivery: '메인보드 3.3V Direct 레일 (최대 10W 서지 케이파빌리티)',
      trimSupportStatus: 'OS 네이티브 NVMe Dataset Management (TRIM) 100% 지원',
      thermalThrottlingRisk: drive.temperatureC > 65 ? 'Critical' : drive.temperatureC > 50 ? 'Medium' : 'Low',
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
    thermalThrottlingRisk: drive.temperatureC > 45 ? 'Medium' : 'Low',
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
  const mediaAnalysis = getDriveMediaAnalysis(drive);
  const actions: TailoredActionMethod[] = [];

  const badCount = telemetry?.badCount ?? drive.seededBadSectors?.length ?? 0;
  const criticalCount = telemetry?.criticalCount ?? 0;
  const pendingSectors = drive.smartAttributes.find(a => a.id === 197);
  const reallocatedSectors = drive.smartAttributes.find(a => a.id === 5);
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
  if (drive.temperatureC > 45 || drive.type === 'NVMe' || drive.type === 'EXTERNAL_SSD') {
    actions.push({
      id: 'action-thermal-cache',
      category: 'thermal_cache',
      categoryKo: '발열 관리 & 쓰기 캐시 최적화',
      priority: drive.temperatureC > 50 ? 'HIGH' : 'INFO',
      title: `[발열 & 캐시] ${drive.temperatureC}°C 내부 발열 제어 및 SLC 버퍼 관리`,
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
