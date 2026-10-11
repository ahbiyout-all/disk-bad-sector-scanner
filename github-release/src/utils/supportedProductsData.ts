import { StorageVendor } from './vendorDiagnostics';

export interface SupportedProductSeries {
  id: string;
  vendor: StorageVendor;
  vendorNameKo: string;
  seriesName: string;
  category: 'INTERNAL_NVME' | 'INTERNAL_SATA' | 'INTERNAL_HDD' | 'EXTERNAL_SSD' | 'EXTERNAL_HDD' | 'SD_FLASH' | 'MOBILE_DEVICE';
  categoryKo: string;
  supportedModels: string[];
  precisionDiagnosticFeatures: string[];
  smartMonitoringIds: { id: number; name: string; targetMetric: string }[];
  hardwareFeatures: string[];
  remediationCapabilities: string[];
  officialTool: string;
}

export const SUPPORTED_VENDOR_CATALOG: SupportedProductSeries[] = [
  // 1. SAMSUNG
  {
    id: 'samsung-990-980-pro',
    vendor: 'samsung',
    vendorNameKo: '삼성전자 (Samsung)',
    seriesName: 'Samsung NVMe 990 PRO / 980 PRO / 970 EVO Plus',
    category: 'INTERNAL_NVME',
    categoryKo: '내장 NVMe M.2 SSD',
    supportedModels: ['MZ-V9P2T0', 'MZ-V9P1T0', 'MZ-V8V1T0', 'MZ-V7S1T0', 'MZ-V8P2T0', 'PM9A1 OEM'],
    precisionDiagnosticFeatures: [
      'V-NAND 3D 셀 마모도 (Wear Leveling Count) 실시간 정밀 추적',
      'Pascal / Elpis 컨트롤러 VUC(Vendor Unique Command) 패스스루 통신',
      'Intelligent TurboWrite SLC 캐시 잔여량 및 소진 스로틀링 모니터링',
      'NVMe 다중 온도 센서 (Composite Temp & Controller Temp) 2단계 과열 감지',
      'PSID LBA 공장 초기화 & 파티션 마이크로코드 재할당 지원'
    ],
    smartMonitoringIds: [
      { id: 5, name: 'Reallocated Sectors Count', targetMetric: '예비 블록 대체 카운터' },
      { id: 177, name: 'Wear Leveling Count', targetMetric: '낸드 플래시 마모 지수 (%)' },
      { id: 179, name: 'Used Reserved Block Count', targetMetric: '소모된 예비 블록 수' },
      { id: 195, name: 'ECC Unrecoverable Error', targetMetric: '하드웨어 복구 불가 에러' },
      { id: 235, name: 'POR Recovery Count', targetMetric: '비정상 전원 차단 회복 카운터' }
    ],
    hardwareFeatures: ['Samsung Elpis / Pascal In-House Controller', 'V-NAND 176단 / 236단 TLC', 'Dynamic Thermal Guard'],
    remediationCapabilities: ['LBA Zero-Fill 배드섹터 논리 복구', 'Over-Provisioning 10% 할당 수복', 'PSID 하드웨어 초기화'],
    officialTool: 'Samsung Magician'
  },
  {
    id: 'samsung-portable-t7-t9',
    vendor: 'samsung',
    vendorNameKo: '삼성전자 (Samsung)',
    seriesName: 'Samsung Portable SSD T9 / T7 Shield / T7 Touch',
    category: 'EXTERNAL_SSD',
    categoryKo: '외장 포터블 SSD',
    supportedModels: ['MU-PC2T0', 'MU-PE4T0', 'MU-PG2T0', 'MU-PC1T0K'],
    precisionDiagnosticFeatures: [
      'USB 3.2 Gen 2x2 (20Gbps) / Gen 2 (10Gbps) UASP TRIM 패스스루 검증',
      '실시간 표면 스캔 시 알루미늄 외장 하우징 발열 스로틀링 계측',
      'ASMedia / NVMe USB 브릿지 컨트롤러 신호 손실율(CRC Error) 파싱',
      'AES 256-bit 하드웨어 암호화 상태 및 읽기/쓰기 대역폭 벤치마크'
    ],
    smartMonitoringIds: [
      { id: 5, name: 'Reallocated Sectors Count', targetMetric: '예비 섹터 재할당 카운트' },
      { id: 199, name: 'UltraDMA CRC Error Count', targetMetric: 'USB 케이블 신호 오류' },
      { id: 241, name: 'Total LBA Written', targetMetric: '총 호스트 쓰기 용량 (TBW)' }
    ],
    hardwareFeatures: ['IP65 방수방진 실리콘 쉘', 'UASP NVMe over USB Bridge', 'AES 256 Bit HW Encryption'],
    remediationCapabilities: ['UASP TRIM 수동 가비지 컬렉션 강제 실행', 'USB 2.0/3.0 전력 강하 수복 가이드'],
    officialTool: 'Samsung Magician Portable Mode'
  },
  {
    id: 'samsung-870-evo-qvo',
    vendor: 'samsung',
    vendorNameKo: '삼성전자 (Samsung)',
    seriesName: 'Samsung 870 EVO / 870 QVO / 860 PRO (SATA III)',
    category: 'INTERNAL_SATA',
    categoryKo: '내장 SATA III SSD',
    supportedModels: ['MZ-77E1T0', 'MZ-77Q2T0', 'MZ-76P500'],
    precisionDiagnosticFeatures: [
      'SATA AHCI deterministic READ ZEROs TRIM 상태 실시간 체크',
      'S.M.A.R.T. ID #187 (Reported Uncorrectable Error) 정밀 추적',
      'DRAM 캐시 및 SLC 버퍼 소진 구간 대역폭 유지 모니터링'
    ],
    smartMonitoringIds: [
      { id: 187, name: 'Reported Uncorrectable Errors', targetMetric: '호스트 보고 불가 에러' },
      { id: 177, name: 'Wear Leveling Count', targetMetric: '낸드 수명 잔여비' },
      { id: 199, name: 'UDMA CRC Error Count', targetMetric: 'SATA 케이블 접촉 상태' }
    ],
    hardwareFeatures: ['Samsung MKX Controller', 'V-NAND 3D TLC/QLC', 'SATA III 6Gbps'],
    remediationCapabilities: ['SATA 케이블 단자 신호 감지', 'Zero-Fill 블록 수복'],
    officialTool: 'Samsung Magician'
  },

  // 2. SEAGATE
  {
    id: 'seagate-ironwolf-barracuda',
    vendor: 'seagate',
    vendorNameKo: '씨게이트 (Seagate)',
    seriesName: 'Seagate IronWolf Pro / BarraCuda / Mach.2 HDD',
    category: 'INTERNAL_HDD',
    categoryKo: '내장 기계식 HDD (3.5" / 2.5")',
    supportedModels: ['ST2000DM008', 'ST4000VN006', 'ST8000NT001', 'ST14000NM001G', 'Mach.2 ST2X18000'],
    precisionDiagnosticFeatures: [
      'IronWolf Health Management (IHM) 200여 가지 센서 파라미터 정밀 진단',
      'Seagate 특유의 S.M.A.R.T. Raw Read Error Rate (ID #1) 정규화 헤더 해독',
      'SMR (Shingled Magnetic Recording) 기와식 겹침 트랙 기록 지연 시간 감지',
      'Mach.2 Dual Actuator 액추에이터 동시 독립 LBA 표면 스캔',
      '오프라인 회복 불가 섹터 (Offline Uncorrectable) 디스크 마이크로코드 예비 트랙 전면 재할당'
    ],
    smartMonitoringIds: [
      { id: 1, name: 'Raw Read Error Rate', targetMetric: '자기 헤드 신호 감쇄율' },
      { id: 5, name: 'Reallocated Sectors Count', targetMetric: '물리 배드섹터 재할당 카운트' },
      { id: 187, name: 'Reported Uncorrectable Errors', targetMetric: 'ECC 가공 실패 수' },
      { id: 197, name: 'Current Pending Sector Count', targetMetric: '보류 중인 불안정 섹터' },
      { id: 198, name: 'Offline Uncorrectable Sector', targetMetric: '오프라인 불량 섹터' }
    ],
    hardwareFeatures: ['IronWolf Health Management (IHM)', 'SMR / CMR Magnetic Recording', 'Mach.2 Dual Actuator', 'AgileArray NAS Tech'],
    remediationCapabilities: ['G-List / P-List 레벨 예비 트랙 섹터 자동 대체', 'SeaTools Long Generic 수복'],
    officialTool: 'Seagate SeaTools'
  },
  {
    id: 'seagate-firecuda-ssd',
    vendor: 'seagate',
    vendorNameKo: '씨게이트 (Seagate)',
    seriesName: 'Seagate FireCuda 530 / 540 PCIe 5.0 NVMe SSD',
    category: 'INTERNAL_NVME',
    categoryKo: '내장 초고속 NVMe SSD',
    supportedModels: ['ZP2000GM3A013', 'ZP1000GM3A002', 'ZP2000GM3A023'],
    precisionDiagnosticFeatures: [
      'Phison E18 / E26 Gen5 컨트롤러 내구성 수명 파라미터 정밀 감지',
      'DirectStorage API 대응 IOPS 및 4K 랜덤 지연시간 모니터링',
      '커스텀 히트싱크 접촉면 온도 지표 정밀 수집'
    ],
    smartMonitoringIds: [
      { id: 5, name: 'Reallocated Sectors', targetMetric: '재할당 대체 블록' },
      { id: 232, name: 'Available Reserved Space', targetMetric: '예비 낸드 공간 비율 (%)' }
    ],
    hardwareFeatures: ['Phison E18/E26 NVMe Controller', 'Micron 176L/232L 3D TLC', 'DirectStorage Optimized'],
    remediationCapabilities: ['NVMe Dataset Management TRIM 수복', 'Zero-Fill 논리 치료'],
    officialTool: 'Seagate SeaTools for NVMe'
  },
  {
    id: 'seagate-one-touch-expansion',
    vendor: 'seagate',
    vendorNameKo: '씨게이트 (Seagate)',
    seriesName: 'Seagate One Touch / Expansion Portable USB External',
    category: 'EXTERNAL_HDD',
    categoryKo: '외장 하드디스크 (USB HDD)',
    supportedModels: ['STKZ2000400', 'STGX2000400', 'STKP5000400'],
    precisionDiagnosticFeatures: [
      'USB Mass Storage BOT 프로토콜 리셋 및 포트 공급 전력 지터 분석',
      '외장 하드 수평/수직 설치 각도에 따른 회전 진동(RV) 영향 계측',
      'S.M.A.R.T. ID #199 UDMA CRC Error 감지로 케이블 헐거움 판별'
    ],
    smartMonitoringIds: [
      { id: 197, name: 'Current Pending Sector Count', targetMetric: '보류 중인 섹터' },
      { id: 199, name: 'UltraDMA CRC Error Count', targetMetric: 'USB 케이블 신호 손실' }
    ],
    hardwareFeatures: ['USB 3.0 High-Speed Bridge', 'SMR Dynamic Caching', 'Rescue Data Recovery Plan Included'],
    remediationCapabilities: ['Zero-Fill 세큐어 패턴 덮어쓰기', '포트 전력 수복 가이드'],
    officialTool: 'Seagate SeaTools Portable'
  },

  // 3. WESTERN DIGITAL (WD)
  {
    id: 'wd-black-blue-red-nvme',
    vendor: 'wd',
    vendorNameKo: '웨스턴 디지털 (WD)',
    seriesName: 'WD_BLACK SN850X / Blue SN580 / Red SN700 NVMe SSD',
    category: 'INTERNAL_NVME',
    categoryKo: '내장 NVMe M.2 SSD',
    supportedModels: ['WDS200T2X0E', 'WDS100T3B0E', 'WDS400T1R0E', 'SN750'],
    precisionDiagnosticFeatures: [
      'BiCS 3D Flash nCache 4.0 동적 버퍼 건강 및 소진 지수 분석',
      'Gaming Mode 2.0 적용 시 저전력 자폐 모드(ASPM) 해제 및 응답속도 검증',
      'SanDisk/WD 독자 NVMe 컨트롤러 패닉 로그 분석 및 낸드 건강도 파싱'
    ],
    smartMonitoringIds: [
      { id: 5, name: 'Reallocated Block Count', targetMetric: '재할당 불량 블록 수' },
      { id: 230, name: 'Drive Life Used', targetMetric: '사용된 드라이브 수명 (%)' },
      { id: 232, name: 'Available Reserved Space', targetMetric: '가용 예비 영역' }
    ],
    hardwareFeatures: ['WD Proprietary NVMe Controller', 'BiCS5 / BiCS6 3D Flash', 'nCache 4.0 Architecture'],
    remediationCapabilities: ['WD Dashboard 펌웨어 수복', 'Zero-Fill 블록 치료'],
    officialTool: 'WD Dashboard'
  },
  {
    id: 'wd-my-passport-elements',
    vendor: 'wd',
    vendorNameKo: '웨스턴 디지털 (WD)',
    seriesName: 'WD My Passport Ultra / Elements / Red Pro NAS HDD',
    category: 'EXTERNAL_HDD',
    categoryKo: '외장 / NAS 하드디스크',
    supportedModels: ['WDBYVG0020BBK', 'WDBU6Y0020BBK', 'WD181KRYZ (Red Pro)'],
    precisionDiagnosticFeatures: [
      'My Passport 특유의 SATA-to-USB 브릿지 일체형 PCB 회로 통신 에러 모니터링',
      'OptiNAND 하이브리드 Flash-Enhanced DRAM S.M.A.R.T. 메타데이터 분석',
      'S.M.A.R.T. ID #197 Current Pending Sector 감지 시 강제 Zero-Fill LBA 수복',
      'NAS용 OptiNAND Red Pro 드라이브 회전 진동 센서(RV Sensor) 진단'
    ],
    smartMonitoringIds: [
      { id: 1, name: 'Raw Read Error Rate', targetMetric: '자기 헤드 신호 독출 실패' },
      { id: 197, name: 'Current Pending Sector', targetMetric: '대기 중인 보류 섹터' },
      { id: 198, name: 'Offline Uncorrectable', targetMetric: '오프라인 불량 섹터' },
      { id: 199, name: 'UltraDMA CRC Error', targetMetric: 'USB 브릿지 회로 에러' }
    ],
    hardwareFeatures: ['Integrated USB-PCB Controller', 'OptiNAND Flash Technology', 'NASware 3.0 Firmware'],
    remediationCapabilities: ['S.M.A.R.T. #197 Zero-Fill 재할당 프로토콜', 'USB 통신 리셋'],
    officialTool: 'WD Dashboard & Data Lifeguard'
  },

  // 4. SANDISK
  {
    id: 'sandisk-extreme-portable',
    vendor: 'sandisk',
    vendorNameKo: '샌디스크 (SanDisk)',
    seriesName: 'SanDisk Extreme Portable SSD V2 / PRO Portable SSD',
    category: 'EXTERNAL_SSD',
    categoryKo: '포터블 외장 SSD',
    supportedModels: ['SDSSDE61-2T00', 'SDSSDE81-4T00', 'SDSSDE30-1T00'],
    precisionDiagnosticFeatures: [
      'UASP (USB Attached SCSI Protocol) 패스스루 TRIM 및 UNMAP 명령어 검증',
      'Realtek RTL9210B / ASMedia USB 브릿지 컨트롤러 온도 및 신호 손실율 모니터링',
      'IP65 방수방진 실티드 하우징 내 지속 표면 검사 시 써멀 방열 상태 분석'
    ],
    smartMonitoringIds: [
      { id: 5, name: 'Reallocated Sectors', targetMetric: '예비 셀 재할당 카운트' },
      { id: 199, name: 'UDMA CRC Error Count', targetMetric: 'USB-C 케이블 신호 손실' }
    ],
    hardwareFeatures: ['IP65 Water & Dust Resistance', 'UASP 10Gbps / 20Gbps Bridge', 'Silicon Rubber Shielding'],
    remediationCapabilities: ['UASP TRIM 수동 명령 복구', '케이블 신호 신뢰성 모니터링'],
    officialTool: 'SanDisk Memory Zone / Dashboard'
  },
  {
    id: 'sandisk-extreme-pro-sd',
    vendor: 'sandisk',
    vendorNameKo: '샌디스크 (SanDisk)',
    seriesName: 'SanDisk Extreme PRO SDXC / MicroSDXC UHS-I / UHS-II',
    category: 'SD_FLASH',
    categoryKo: 'SD / MicroSD 카드 및 플래시 리더',
    supportedModels: ['SDSDXXU-256G', 'SDSQXCD-512G', 'SDSDXDK-128G'],
    precisionDiagnosticFeatures: [
      'SD 카드리더기 SPI/SDIO 통신 소켓 물리 접촉 저항 검지',
      'V30/V60/V90 지속 비디오 쓰기 클래스 낸드 블록 마모도 추적',
      '카드리더 파스스루 LBA 표면 에러 및 부트 레코드 무결성 진단'
    ],
    smartMonitoringIds: [
      { id: 1, name: 'Flash Health Wear Ratio', targetMetric: '낸드 블록 수명' }
    ],
    hardwareFeatures: ['UHS-II Bus Speed (Up to 300MB/s)', 'V90 Video Speed Class', 'High Endurance MLC/TLC'],
    remediationCapabilities: ['SD Formatter 저수준 포맷 수복', 'LBA 표면 0x00 기입'],
    officialTool: 'SanDisk Storage Utility'
  },

  // 5. SK HYNIX
  {
    id: 'skhynix-platinum-gold',
    vendor: 'sk_hynix',
    vendorNameKo: 'SK하이닉스 (SK hynix)',
    seriesName: 'SK hynix Platinum P41 / Gold P31 / Beetle X31',
    category: 'INTERNAL_NVME',
    categoryKo: '내장 & 포터블 NVMe SSD',
    supportedModels: ['SHPP41-2000GM', 'SHGP31-1000GM', 'Beetle X31 1TB', 'PC801 OEM'],
    precisionDiagnosticFeatures: [
      '176단 / 238단 4D NAND Flash 셀 구조 및 Aries 자체 컨트롤러 레지스터 진단',
      '업계 최고 수준의 초저전력 가공 모드(ASPM) 및 Power Loss Protection 복구 카운트 감지',
      'NVMe Controller Temp (Sensor 2) 고정밀 개별 발열 로그 계측'
    ],
    smartMonitoringIds: [
      { id: 5, name: 'Reallocated Sectors Count', targetMetric: '재할당 블록' },
      { id: 232, name: 'Available Reserved Space', targetMetric: '예비 낸드 공간 (%)' },
      { id: 235, name: 'POR Recovery Count', targetMetric: '정전 비상 회복 횟수' }
    ],
    hardwareFeatures: ['SK hynix In-House Aries Controller', '176L / 238L 4D NAND', 'Built-in Thermal Throttling'],
    remediationCapabilities: ['SK hynix Drive Manager PSID 수복', 'Zero-Fill LBA 재할당'],
    officialTool: 'SK hynix Drive Manager'
  },

  // 6. CRUCIAL / MICRON
  {
    id: 'crucial-t700-p5plus-mx500',
    vendor: 'crucial',
    vendorNameKo: '크루셜 / 마이크론 (Crucial)',
    seriesName: 'Crucial T700 PCIe 5.0 / P5 Plus / MX500 / X9 Pro',
    category: 'INTERNAL_NVME',
    categoryKo: '내장 Gen5/Gen4 NVMe & SATA SSD',
    supportedModels: ['CT2000T700SSD3', 'CT1000P5PSSD8', 'CT1000MX500SSD1', 'CT2000X9PROSSD9'],
    precisionDiagnosticFeatures: [
      'RAIN (Redundant Array of Independent NAND) 하드웨어 셀 이중화 복구 상태 검증',
      'Momentum Cache RAM 가속기 버퍼 무결성 및 시스템 메인 메모리 동기화 진단',
      'Micron 232-Layer 3D TLC Flash의 불량 블록 인캡슐레이션 오프셋 파싱'
    ],
    smartMonitoringIds: [
      { id: 5, name: 'Reallocated NAND Blocks', targetMetric: '대체된 불량 낸드 블록' },
      { id: 196, name: 'Reallocation Event Count', targetMetric: 'RAIN 수복 이벤트 발생 수' },
      { id: 202, name: 'Percentage Lifetime Used', targetMetric: '소모된 수명 백분율 (%)' }
    ],
    hardwareFeatures: ['Micron 232-Layer 3D TLC NAND', 'RAIN Technology', 'Momentum Cache Engine'],
    remediationCapabilities: ['Crucial Storage Executive PSID Reset', 'Momentum Cache 갱신'],
    officialTool: 'Crucial Storage Executive'
  },

  // 7. TOSHIBA / KIOXIA
  {
    id: 'toshiba-canvio-kioxia-exceria',
    vendor: 'toshiba',
    vendorNameKo: '도시바 / 키옥시아 (Toshiba / Kioxia)',
    seriesName: 'Toshiba Canvio Advance/Flex & Kioxia Exceria Pro NVMe',
    category: 'EXTERNAL_HDD',
    categoryKo: '내장/외장 HDD & NVMe SSD',
    supportedModels: ['HDTC920AK3AA', 'HDTP130AK3AA', 'LSE10Z001TG8', 'Kioxia Exceria Pro 2TB', 'MG08 Enterprise 16TB'],
    precisionDiagnosticFeatures: [
      'Canvio 외장 하드의 3축 충격 센서(Internal Shock Sensor) 충격 감지 이력 파싱',
      '도시바 램프 로드(Ramp Load) 메커니즘 회전 헤드 안착 물리 안전 상태 검사',
      '키옥시아 BiCS FLASH QSBC (Quadruple Swing-By Code) 고밀도 ECC 오류 카운터 추적',
      '엔터프라이즈 MG08 시리즈 회전 진동(RV Sensor) 진동 감쇄 효율 분석'
    ],
    smartMonitoringIds: [
      { id: 1, name: 'Raw Read Error Rate', targetMetric: '독출 오류 모니터링' },
      { id: 191, name: 'G-Sense Error Rate', targetMetric: '물리 충격 센서 감지 횟수' },
      { id: 197, name: 'Current Pending Sector', targetMetric: '보류 중인 불안정 섹터' },
      { id: 198, name: 'Offline Uncorrectable', targetMetric: '오프라인 불량 섹터' }
    ],
    hardwareFeatures: ['BiCS FLASH 3D NAND', 'QSBC Ultra High-Density ECC', '3-Axis Shock Sensor', 'Enterprise RV Sensors'],
    remediationCapabilities: ['QSBC ECC 가공 오버헤드 감지', 'Zero-Fill LBA 예비 트랙 수복'],
    officialTool: 'Kioxia SSD Utility & Toshiba Diagnostic Tool'
  },

  // 8. APPLE
  {
    id: 'apple-silicon-apfs-nvme',
    vendor: 'apple',
    vendorNameKo: '애플 (Apple Inc.)',
    seriesName: 'Apple Mac M1/M2/M3/M4 Custom NVMe & Mobile UFS',
    category: 'MOBILE_DEVICE',
    categoryKo: 'Mac / iPhone / iPad 통합 스토리지',
    supportedModels: ['Apple APFS Fabric SSD', 'iPhone 15/16 Pro NVMe Storage', 'iPad Pro M4 UFS'],
    precisionDiagnosticFeatures: [
      'APFS 파일시스템 스냅샷 및 컨테이너 무결성 패킷 검증',
      'Apple Silicon 통합 스토리지 컨트롤러 온칩 버스 상태 진단',
      '모바일 MTP / WebUSB direct 소켓 통신 패킷 손실 모니터링'
    ],
    smartMonitoringIds: [
      { id: 1, name: 'APFS Volume Integrity Status', targetMetric: 'APFS 컨테이너 무결성' }
    ],
    hardwareFeatures: ['Apple Custom Storage Controller (SoC Integrated)', 'APFS Encrypted Snapshot Engine', 'MTP Packet Protocol'],
    remediationCapabilities: ['macOS First Aid 컨테이너 수복', 'MTP 연결 유지 보수'],
    officialTool: 'Apple macOS Disk Utility & Diagnostics'
  },

  // 9. KINGSTON
  {
    id: 'kingston-kc3000-fury',
    vendor: 'kingston',
    vendorNameKo: '킹스톤 (Kingston)',
    seriesName: 'Kingston KC3000 / Fury Renegade / XS2000 Portable',
    category: 'INTERNAL_NVME',
    categoryKo: '내장 Gen4 NVMe & 포터블 SSD',
    supportedModels: ['SKC3000D/2048G', 'SFYRD/1000G', 'SXS2000/2000G'],
    precisionDiagnosticFeatures: [
      'Phison E18 NVMe 컨트롤러 낸드 블록 마모도 및 S.M.A.R.T. ID #231 파싱',
      'USB 3.2 Gen 2x2 (20Gbps) 포터블 SSD 대역폭 레이턴시 계측',
      '3D TLC 낸드 예비 공간(Over-Provisioning) 잔여율 체크'
    ],
    smartMonitoringIds: [
      { id: 5, name: 'Reallocated Sector Count', targetMetric: '재할당 불량 블록' },
      { id: 231, name: 'SSD Life Left', targetMetric: '남은 SSD 수명 (%)' }
    ],
    hardwareFeatures: ['Phison E18 Controller', 'Graphene Aluminum Heat Spreader', 'USB 3.2 Gen 2x2 Bridge'],
    remediationCapabilities: ['Kingston SSD Manager 펌웨어 갱신', 'Zero-Fill LBA 치료'],
    officialTool: 'Kingston SSD Manager'
  }
];

export function filterSupportedCatalog(
  searchQuery: string,
  selectedCategory: string,
  selectedVendor: string
): SupportedProductSeries[] {
  return SUPPORTED_VENDOR_CATALOG.filter((item) => {
    // Search query match
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      item.seriesName.toLowerCase().includes(q) ||
      item.vendorNameKo.toLowerCase().includes(q) ||
      item.supportedModels.some(m => m.toLowerCase().includes(q)) ||
      item.precisionDiagnosticFeatures.some(f => f.toLowerCase().includes(q)) ||
      item.hardwareFeatures.some(h => h.toLowerCase().includes(q)) ||
      item.officialTool.toLowerCase().includes(q);

    // Category match
    const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;

    // Vendor match
    const matchesVendor = selectedVendor === 'ALL' || item.vendor === selectedVendor;

    return matchesSearch && matchesCategory && matchesVendor;
  });
}
