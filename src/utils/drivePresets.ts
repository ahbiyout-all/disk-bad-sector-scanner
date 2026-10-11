import { DiskDrive } from '../types';

export const INITIAL_DRIVES: DiskDrive[] = [
  // 1. Internal NVMe SSD
  {
    id: 'drive-samsung-980',
    name: 'Samsung SSD 980 PRO 1TB (내장)',
    model: 'MZ-V8P1T0BW',
    serialNumber: 'S5GXNF0R810294M',
    firmware: '5B2QGXA7',
    type: 'NVMe',
    isExternal: false,
    connectionType: 'internal',
    capacityGb: 1000,
    totalSectors: 1953525168,
    interface: 'PCIe 4.0 x4 (NVMe 1.4 Direct)',
    healthScore: 99,
    temperatureC: 38,
    powerOnHours: 3420,
    mountPoint: 'C:',
    fileSystem: 'NTFS',
    defaultBadSectorProbability: 0.001,
    seededBadSectors: [],
    seededSlowSectors: [142, 670],
    smartAttributes: [
      { id: 1, name: 'Critical Warning (치명적 경고)', current: 100, worst: 100, threshold: 0, raw: '0x00', status: 'good', description: '예비 블록 및 신뢰성 상태 양호' },
      { id: 2, name: 'Composite Temperature (복합 온도)', current: 62, worst: 50, threshold: 15, raw: '38°C', status: 'good', description: '정상 작동 온도 범위' },
      { id: 3, name: 'Available Spare (사용 가능한 예비 용량)', current: 100, worst: 100, threshold: 10, raw: '100%', status: 'good', description: '플래시 메모리 예비 블록 충분' },
      { id: 5, name: 'Percentage Used (사용 비율)', current: 97, worst: 97, threshold: 100, raw: '3%', status: 'good', description: '예상 수명 대비 3% 소비' },
      { id: 12, name: 'Power Cycles (전원 인가 횟수)', current: 99, worst: 99, threshold: 0, raw: '1,420 회', status: 'good', description: '정상 횟수' },
      { id: 13, name: 'Unsafe Shutdowns (비정상 종료 횟수)', current: 99, worst: 99, threshold: 0, raw: '4 회', status: 'good', description: '급작스러운 전원 차단 이력 극소' },
      { id: 14, name: 'Media and Data Integrity Errors (데이터 무결성 오류)', current: 100, worst: 100, threshold: 0, raw: '0', status: 'good', description: '전송 무결성 오류 없음' },
    ]
  },
  // 2. Internal SATA HDD
  {
    id: 'drive-seagate-barracuda',
    name: 'Seagate BarraCuda 2TB (내장 HDD)',
    model: 'ST2000DM008-2FR102',
    serialNumber: 'ZFL2KB90',
    firmware: '0001',
    type: 'HDD',
    isExternal: false,
    connectionType: 'internal',
    capacityGb: 2000,
    totalSectors: 3907029168,
    interface: 'SATA III 6.0Gb/s (7200 RPM)',
    healthScore: 74,
    temperatureC: 43,
    powerOnHours: 18450,
    mountPoint: 'D:',
    fileSystem: 'NTFS',
    defaultBadSectorProbability: 0.015,
    seededBadSectors: [280, 281, 283, 715, 716],
    seededSlowSectors: [110, 278, 279, 282, 284, 450, 714, 717, 890],
    smartAttributes: [
      { id: 1, name: 'Raw Read Error Rate (원시 읽기 오류율)', current: 82, worst: 64, threshold: 6, raw: '138902', status: 'warning', description: '헤드 판독 시 가벼운 재시도 발생' },
      { id: 5, name: 'Reallocated Sectors Count (치환된 섹터 수)', current: 88, worst: 88, threshold: 36, raw: '12 (0x0C)', status: 'warning', description: '배드섹터 발견 후 예비 영역으로 대체됨' },
      { id: 7, name: 'Seek Error Rate (탐색 오류율)', current: 85, worst: 60, threshold: 45, raw: '298104', status: 'good', description: '자기 헤드 위치 탐색 상태' },
      { id: 9, name: 'Power-On Hours (총 사용 시간)', current: 79, worst: 79, threshold: 0, raw: '18,450 시간', status: 'good', description: '약 2.1년 연속 가동' },
      { id: 194, name: 'Temperature (작동 온도)', current: 57, worst: 41, threshold: 0, raw: '43°C', status: 'good', description: '다소 높으나 허용 한도 이내' },
      { id: 197, name: 'Current Pending Sector (보류 중인 섹터 수)', current: 92, worst: 92, threshold: 0, raw: '5 (0x05)', status: 'warning', description: '불안정하여 재할당 대기 중인 섹터 존재' },
      { id: 198, name: 'Offline Uncorrectable (오프라인 회복 불가)', current: 90, worst: 90, threshold: 0, raw: '3 (0x03)', status: 'warning', description: '읽기/쓰기 복구 불가 섹터 감지' },
      { id: 199, name: 'UltraDMA CRC Error Count (케이블 전송 오류)', current: 100, worst: 100, threshold: 0, raw: '0', status: 'good', description: 'SATA 통신 케이블 정상' }
    ]
  },
  // 3. External Portable SSD (USB 3.2 Gen 2 / UASP)
  {
    id: 'drive-sandisk-portable',
    name: 'SanDisk Extreme Portable SSD 1TB (외장)',
    model: 'SDSSDE61-1T00',
    serialNumber: '2145A9301824',
    firmware: '1004',
    type: 'EXTERNAL_SSD',
    isExternal: true,
    connectionType: 'usb',
    usbProtocol: 'NVMe over USB (UASP 10Gbps)',
    bridgeChipset: 'ASMedia ASM2362 UASP Bridge',
    mountPoint: 'E:',
    fileSystem: 'exFAT',
    capacityGb: 1000,
    totalSectors: 1953525168,
    interface: 'USB 3.2 Gen 2 (Type-C 10Gbps, UASP 활성화)',
    healthScore: 94,
    temperatureC: 36,
    powerOnHours: 850,
    defaultBadSectorProbability: 0.003,
    seededBadSectors: [],
    seededSlowSectors: [520, 521, 522],
    smartAttributes: [
      { id: 1, name: 'Critical Warning (치명적 경고)', current: 100, worst: 100, threshold: 0, raw: '0x00', status: 'good', description: '외장 SSD 컨트롤러 정상' },
      { id: 2, name: 'Composite Temperature (복합 온도)', current: 64, worst: 52, threshold: 10, raw: '36°C', status: 'good', description: 'UASP 고속 전송 중 안정 발열' },
      { id: 3, name: 'Available Spare (예비 블록 잔여율)', current: 99, worst: 99, threshold: 10, raw: '99%', status: 'good', description: '외장 플래시 셀 충분' },
      { id: 5, name: 'Percentage Used (플래시 마모율)', current: 99, worst: 99, threshold: 100, raw: '1%', status: 'good', description: 'TBW 잔여 수명 99% 이상' },
      { id: 12, name: 'Power Cycles (USB 탈부착 횟수)', current: 98, worst: 98, threshold: 0, raw: '312 회', status: 'good', description: '외장 핫플러그 정상 이력' },
      { id: 13, name: 'Unsafe Shutdowns (불시 분리 횟수)', current: 96, worst: 96, threshold: 0, raw: '8 회', status: 'warning', description: '안전 제거 없이 케이블 분리된 이력' }
    ]
  },
  // 4. External 2.5" HDD (USB 3.0 / BOT)
  {
    id: 'drive-wd-passport',
    name: 'WD My Passport 4TB (외장 하드)',
    model: 'WDBPKJ0040BBK-0B',
    serialNumber: 'WX21DA948102',
    firmware: '1028',
    type: 'EXTERNAL_HDD',
    isExternal: true,
    connectionType: 'usb',
    usbProtocol: 'BOT (Bulk-Only Transport)',
    bridgeChipset: 'JMicron JMS579 USB 3.0 to SATA',
    mountPoint: 'F:',
    fileSystem: 'NTFS',
    capacityGb: 4000,
    totalSectors: 7814037168,
    interface: 'USB 3.0 Micro-B (5Gbps)',
    healthScore: 78,
    temperatureC: 41,
    powerOnHours: 4210,
    defaultBadSectorProbability: 0.012,
    seededBadSectors: [154, 155, 630],
    seededSlowSectors: [152, 153, 156, 340, 341, 629, 631],
    smartAttributes: [
      { id: 1, name: 'Raw Read Error Rate (원시 읽기 오류율)', current: 78, worst: 66, threshold: 51, raw: '42100', status: 'warning', description: '외장 케이블 신호 감쇄 및 헤드 판독 재시도' },
      { id: 5, name: 'Reallocated Sectors Count (치환된 섹터 수)', current: 85, worst: 85, threshold: 140, raw: '6 (0x06)', status: 'warning', description: '이동 중 충격으로 발생한 배드섹터 대체됨' },
      { id: 9, name: 'Power-On Hours (연결 사용 시간)', current: 90, worst: 90, threshold: 0, raw: '4,210 시간', status: 'good', description: '외장 백업용 실사용 누적' },
      { id: 194, name: 'Temperature (외장 케이스 내부 온도)', current: 59, worst: 46, threshold: 0, raw: '41°C', status: 'good', description: '정상 작동 온도' },
      { id: 197, name: 'Current Pending Sector (보류 중인 섹터)', current: 94, worst: 94, threshold: 0, raw: '3 (0x03)', status: 'warning', description: '불안정 섹터 감지됨 - 백업 권장' },
      { id: 199, name: 'UltraDMA CRC Error Count (USB 브릿지 CRC 에러)', current: 97, worst: 97, threshold: 0, raw: '4 회', status: 'warning', description: 'USB 포트 전력 불안정/접촉 불량' }
    ]
  },
  // 5. USB Flash Drive (USB 3.1 Thumb Drive)
  {
    id: 'drive-samsung-bar',
    name: 'Samsung BAR Plus USB 128GB (USB 3.1 메모리)',
    model: 'MUF-128BE4/AM',
    serialNumber: '0374121048291032',
    firmware: '1100',
    type: 'USB',
    isExternal: true,
    connectionType: 'usb',
    usbProtocol: 'BOT (Bulk-Only Transport)',
    bridgeChipset: 'Phison PS2251-09 USB 3.1 Gen 1',
    mountPoint: 'G:',
    fileSystem: 'FAT32',
    capacityGb: 128,
    totalSectors: 250069680,
    interface: 'USB 3.1 Gen 1 Type-A (5Gbps)',
    healthScore: 89,
    temperatureC: 34,
    powerOnHours: 420,
    defaultBadSectorProbability: 0.008,
    seededBadSectors: [812],
    seededSlowSectors: [810, 811, 813],
    smartAttributes: [
      { id: 1, name: 'Flash Wear Level (USB 낸드 마모도)', current: 89, worst: 89, threshold: 10, raw: '11% 마모', status: 'good', description: '플래시 메모리 P/E 사이클 양호' },
      { id: 2, name: 'Controller Temperature (USB 칩셋 온도)', current: 66, worst: 55, threshold: 10, raw: '34°C', status: 'good', description: '금속 하우징 방열 정상' },
      { id: 12, name: 'Plug/Unplug Cycles (탈부착 횟수)', current: 95, worst: 95, threshold: 0, raw: '1,280 회', status: 'good', description: '포트 단자 상태 양호' },
      { id: 198, name: 'Bad Block Count (플래시 배드 블록)', current: 98, worst: 98, threshold: 50, raw: '1 개', status: 'warning', description: '1개 배드 블록 격리됨' }
    ]
  },
  // 6. USB 2.0 Flash Drive (Legacy USB 2.0 Thumb Drive)
  {
    id: 'drive-sandisk-cruzer-usb2',
    name: 'SanDisk Cruzer Blade 32GB (USB 2.0 레거시)',
    model: 'SDCZ50-032G',
    serialNumber: '4C53000128091811',
    firmware: '1.26',
    type: 'USB',
    isExternal: true,
    isUsb2: true,
    connectionType: 'usb',
    usbProtocol: 'USB 2.0 BOT (Bulk-Only Transport 480Mbps)',
    bridgeChipset: 'Alcor Micro AU6989SN USB 2.0 Controller',
    mountPoint: 'N:',
    fileSystem: 'FAT32',
    capacityGb: 32,
    totalSectors: 62533632,
    interface: 'USB 2.0 High-Speed (480Mbps / 실효 28MB/s)',
    healthScore: 79,
    temperatureC: 38,
    powerOnHours: 1950,
    defaultBadSectorProbability: 0.02,
    seededBadSectors: [412, 413],
    seededSlowSectors: [205, 410, 411, 414, 780, 781],
    smartAttributes: [
      { id: 1, name: 'Flash Wear Level (USB 2.0 낸드 수명)', current: 79, worst: 79, threshold: 10, raw: '21% 마모 (2D TLC)', status: 'warning', description: '구형 낸드 플래시 P/E 사이클 누적' },
      { id: 2, name: 'Read Disturb Check (읽기 간섭 안정도)', current: 85, worst: 72, threshold: 30, raw: '12회 재시도', status: 'warning', description: '대역폭 한계 및 인접 셀 전하 간섭' },
      { id: 12, name: 'Power Cycles (탈부착 횟수)', current: 90, worst: 90, threshold: 0, raw: '2,840 회', status: 'good', description: '오랜 기간 사용된 레거시 USB' },
      { id: 198, name: 'Bad Block Count (플래시 배드 블록)', current: 88, worst: 88, threshold: 50, raw: '2 개', status: 'warning', description: '2개 배드 블록 격리됨' }
    ]
  },
  // 7. SD Card (SDXC V30 UHS-I)
  {
    id: 'drive-sandisk-sdxc',
    name: 'SanDisk Extreme PRO SDXC 256GB (SD 카드)',
    model: 'SDSDXXY-256G',
    serialNumber: '920148102381',
    firmware: '0003',
    type: 'SD_CARD',
    isExternal: true,
    connectionType: 'sd_card',
    usbProtocol: 'SDIO UHS-I',
    bridgeChipset: 'Genesys Logic GL3224 SD 4.0 Controller',
    mountPoint: 'H:',
    fileSystem: 'exFAT',
    capacityGb: 256,
    totalSectors: 500118144,
    interface: 'SDXC UHS-I U3 V30 (최대 170MB/s)',
    healthScore: 95,
    temperatureC: 31,
    powerOnHours: 290,
    defaultBadSectorProbability: 0.002,
    seededBadSectors: [],
    seededSlowSectors: [210, 211],
    smartAttributes: [
      { id: 1, name: 'SD Wear Indicator (SD카드 내구성 지표)', current: 95, worst: 95, threshold: 10, raw: '95% 잔여', status: 'good', description: '블록 재작성 수명 충분' },
      { id: 2, name: 'Read Disturb Check (읽기 간섭 안정도)', current: 100, worst: 100, threshold: 0, raw: '0 Error', status: 'good', description: '사진/영상 데이터 무결성 완벽' },
      { id: 12, name: 'Card Insertions (슬롯 삽입 횟수)', current: 99, worst: 99, threshold: 0, raw: '145 회', status: 'good', description: '골드 핑거 단자 상태 깨끗함' }
    ]
  },
  // 8. Internal Failing HDD (Test Drive)
  {
    id: 'drive-wd-blue-failing',
    name: 'WD Blue 500GB (심각 경고 테스트용 내장)',
    model: 'WDC WD5000AAKX-00ERMA0',
    serialNumber: 'WD-WCAYU4819201',
    firmware: '15.01H15',
    type: 'HDD',
    isExternal: false,
    connectionType: 'internal',
    capacityGb: 500,
    totalSectors: 976773168,
    interface: 'SATA III 6.0Gb/s (5400 RPM)',
    healthScore: 32,
    temperatureC: 49,
    powerOnHours: 42100,
    mountPoint: 'J:',
    fileSystem: 'NTFS',
    defaultBadSectorProbability: 0.05,
    seededBadSectors: [45, 46, 47, 48, 192, 193, 310, 311, 312, 580, 581, 690, 840, 841, 842, 843],
    seededSlowSectors: [43, 44, 49, 50, 190, 191, 194, 308, 309, 313, 578, 579, 582, 688, 689, 691, 838, 839, 844],
    smartAttributes: [
      { id: 1, name: 'Raw Read Error Rate (원시 읽기 오류율)', current: 45, worst: 35, threshold: 51, raw: '891024', status: 'critical', description: '임계치 초과: 극심한 헤드/플래터 손상' },
      { id: 5, name: 'Reallocated Sectors Count (치환된 섹터 수)', current: 40, worst: 40, threshold: 140, raw: '148 (0x94)', status: 'critical', description: '예비 영역 고갈 임박! 즉시 교체 필요' },
      { id: 9, name: 'Power-On Hours (총 사용 시간)', current: 42, worst: 42, threshold: 0, raw: '42,100 시간', status: 'warning', description: '약 4.8년 가동 노후 디스크' },
      { id: 194, name: 'Temperature (작동 온도)', current: 51, worst: 35, threshold: 0, raw: '49°C', status: 'warning', description: '내부 발열 주의' },
      { id: 197, name: 'Current Pending Sector (보류 중인 섹터 수)', current: 38, worst: 38, threshold: 0, raw: '36 (0x24)', status: 'critical', description: '치명적: 다수의 불안정 섹터 누적' },
      { id: 198, name: 'Offline Uncorrectable (오프라인 회복 불가)', current: 35, worst: 35, threshold: 0, raw: '28 (0x1C)', status: 'critical', description: '심각한 데이터 유실 위험' },
      { id: 199, name: 'UltraDMA CRC Error Count (케이블 전송 오류)', current: 95, worst: 95, threshold: 0, raw: '14 회', status: 'warning', description: 'SATA 케이블 접촉 불량 가능성' }
    ]
  },

  // 9. Toshiba Canvio Advance 2TB (External HDD)
  {
    id: 'drive-toshiba-canvio-advance',
    name: 'Toshiba Canvio Advance 2TB (도시바 외장 하드)',
    model: 'HDTCA20XK3AA (Canvio Advance USB 3.2)',
    serialNumber: '93810294TX',
    firmware: '02.01.00',
    type: 'EXTERNAL_HDD',
    isExternal: true,
    connectionType: 'usb',
    usbProtocol: 'BOT (Bulk-Only Transport)',
    bridgeChipset: 'Toshiba Native USB Bridge & Shock Sensor',
    mountPoint: 'T:',
    fileSystem: 'NTFS',
    capacityGb: 2000,
    totalSectors: 3907029168,
    interface: 'USB 3.2 Gen 1 (5Gbps Micro-B / 충격 감지 램프 로드)',
    healthScore: 88,
    temperatureC: 37,
    powerOnHours: 1420,
    defaultBadSectorProbability: 0.008,
    seededBadSectors: [310],
    seededSlowSectors: [308, 309, 311, 620, 621],
    smartAttributes: [
      { id: 1, name: 'Raw Read Error Rate (원시 읽기 오류율)', current: 88, worst: 75, threshold: 50, raw: '18200', status: 'good', description: '플래터 판독 헤드 무결성 양호' },
      { id: 5, name: 'Reallocated Sectors Count (치환된 섹터 수)', current: 92, worst: 92, threshold: 10, raw: '4 (0x04)', status: 'warning', description: '충격 보호 동작으로 예비 영역 대체 완료' },
      { id: 9, name: 'Power-On Hours (누적 사용 시간)', current: 93, worst: 93, threshold: 0, raw: '1,420 시간', status: 'good', description: '정상 작동 누적' },
      { id: 191, name: 'G-Sense Error Rate (내장 충격 센서 감지)', current: 82, worst: 82, threshold: 0, raw: '18 회', status: 'warning', description: '3축 충격 센서가 물리 진동 감지 및 헤드 대피 기록' },
      { id: 194, name: 'Temperature (작동 온도)', current: 63, worst: 48, threshold: 0, raw: '37°C', status: 'good', description: '외장 케이스 내부 발열 안정' },
      { id: 197, name: 'Current Pending Sector (보류 중인 섹터)', current: 96, worst: 96, threshold: 0, raw: '2 (0x02)', status: 'warning', description: 'S.M.A.R.T. Zero-Fill 수복 대기 중인 섹터' }
    ]
  },

  // 10. Kioxia Exceria Pro 1TB (Internal NVMe SSD)
  {
    id: 'drive-kioxia-exceria-pro',
    name: 'Kioxia Exceria Pro 1TB (키옥시아/도시바 내장 NVMe)',
    model: 'LSE10Z001TG8 (BiCS FLASH PCIe 4.0)',
    serialNumber: 'K3910248X01',
    firmware: 'EIPM10.2',
    type: 'NVMe',
    isExternal: false,
    connectionType: 'internal',
    capacityGb: 1000,
    totalSectors: 1953525168,
    interface: 'PCIe 4.0 x4 (NVMe 1.4 Direct)',
    healthScore: 97,
    temperatureC: 41,
    powerOnHours: 1150,
    mountPoint: 'E:',
    fileSystem: 'NTFS',
    defaultBadSectorProbability: 0.001,
    seededBadSectors: [],
    seededSlowSectors: [240],
    smartAttributes: [
      { id: 1, name: 'Critical Warning (치명적 경고)', current: 100, worst: 100, threshold: 0, raw: '0x00', status: 'good', description: 'BiCS FLASH 낸드 및 키옥시아 컨트롤러 최상' },
      { id: 2, name: 'Composite Temperature (복합 온도)', current: 59, worst: 48, threshold: 15, raw: '41°C', status: 'good', description: 'M.2 방열판 작동 상태 우수' },
      { id: 3, name: 'Available Spare (사용 가능한 예비 블록)', current: 100, worst: 100, threshold: 10, raw: '100%', status: 'good', description: 'QSBC ECC 예비 낸드 수명 100%' },
      { id: 5, name: 'Percentage Used (낸드 마모율)', current: 98, worst: 98, threshold: 100, raw: '2%', status: 'good', description: 'P/E 사이클 소비 2%' },
      { id: 12, name: 'Power Cycles (전원 부팅 횟수)', current: 99, worst: 99, threshold: 0, raw: '840 회', status: 'good', description: '정상 가동 이력' }
    ]
  },

  // 11. Toshiba Enterprise Capacity MG08 8TB (Internal Enterprise SATA HDD)
  {
    id: 'drive-toshiba-enterprise-8tb',
    name: 'Toshiba Enterprise MG08 8TB (도시바 엔터프라이즈 HDD)',
    model: 'MG08ACA800E (7200 RPM Enterprise)',
    serialNumber: '739210482TX',
    firmware: 'FJ3A',
    type: 'HDD',
    isExternal: false,
    connectionType: 'internal',
    capacityGb: 8000,
    totalSectors: 15628053168,
    interface: 'SATA III 6.0Gb/s (7200 RPM / RV 센서 내장)',
    healthScore: 82,
    temperatureC: 42,
    powerOnHours: 14200,
    mountPoint: 'S:',
    fileSystem: 'NTFS',
    defaultBadSectorProbability: 0.01,
    seededBadSectors: [750, 751],
    seededSlowSectors: [748, 749, 752, 910],
    smartAttributes: [
      { id: 1, name: 'Raw Read Error Rate (원시 읽기 오류율)', current: 82, worst: 70, threshold: 50, raw: '31200', status: 'good', description: '헬륨/플래터 판독 서보 시스템 정상' },
      { id: 5, name: 'Reallocated Sectors Count (치환된 섹터 수)', current: 88, worst: 88, threshold: 10, raw: '8 (0x08)', status: 'warning', description: '엔터프라이즈 헬스 모니터링: 대체 섹터 할당됨' },
      { id: 9, name: 'Power-On Hours (연속 운용 시간)', current: 84, worst: 84, threshold: 0, raw: '14,200 시간', status: 'good', description: '24x7 서버 및 NAS 가동 누적' },
      { id: 194, name: 'Temperature (작동 온도)', current: 58, worst: 42, threshold: 0, raw: '42°C', status: 'good', description: '내부 스핀들 모터 발열 관리 안정' },
      { id: 197, name: 'Current Pending Sector (보류 중인 섹터)', current: 90, worst: 90, threshold: 0, raw: '3 (0x03)', status: 'warning', description: '리매핑 수복 필요한 섹터 존재' },
      { id: 199, name: 'UltraDMA CRC Error Count (SATA 케이블 에러)', current: 100, worst: 100, threshold: 0, raw: '0', status: 'good', description: '통신 케이블 무결성 완벽' }
    ]
  }
];

// Presets for on-demand external drive hot-plugging
export const EXTERNAL_DRIVE_PRESETS: Omit<DiskDrive, 'id'>[] = [
  {
    name: 'Samsung T7 Shield 2TB (러기드 외장 SSD)',
    model: 'MU-PE2T0S',
    serialNumber: 'S6V8NS0R918231',
    firmware: 'FXM7301Q',
    type: 'EXTERNAL_SSD',
    isExternal: true,
    connectionType: 'usb',
    usbProtocol: 'NVMe over USB (UASP 10Gbps)',
    bridgeChipset: 'ASMedia ASM2364 NVMe Bridge',
    mountPoint: 'K:',
    fileSystem: 'exFAT',
    capacityGb: 2000,
    totalSectors: 3907029168,
    interface: 'USB 3.2 Gen 2 (10Gbps Type-C, 방수방진 IP65)',
    healthScore: 98,
    temperatureC: 33,
    powerOnHours: 120,
    defaultBadSectorProbability: 0.001,
    seededBadSectors: [],
    seededSlowSectors: [480],
    smartAttributes: [
      { id: 1, name: 'Critical Warning (치명적 경고)', current: 100, worst: 100, threshold: 0, raw: '0x00', status: 'good', description: '새 제품 수준의 셀 내구성' },
      { id: 2, name: 'Composite Temperature (복합 온도)', current: 67, worst: 60, threshold: 10, raw: '33°C', status: 'good', description: '실리콘 외장 방열 양호' },
      { id: 3, name: 'Available Spare (사용 가능한 예비 용량)', current: 100, worst: 100, threshold: 10, raw: '100%', status: 'good', description: '예비 블록 100% 잔여' }
    ]
  },
  {
    name: 'Transcend StoreJet 25M2 500GB (구형 USB 2.0 외장 하드)',
    model: 'TS500GSJ25M2',
    serialNumber: 'SJ25-94810291',
    firmware: '1.08',
    type: 'EXTERNAL_HDD',
    isExternal: true,
    isUsb2: true,
    connectionType: 'usb',
    usbProtocol: 'USB 2.0 BOT (Bulk-Only Transport 480Mbps)',
    bridgeChipset: 'Initio INIC-1608 USB 2.0 to SATA Bridge',
    mountPoint: 'P:',
    fileSystem: 'NTFS',
    capacityGb: 500,
    totalSectors: 976773168,
    interface: 'USB 2.0 Mini-B (480Mbps / 5V 500mA 전력 민감)',
    healthScore: 73,
    temperatureC: 45,
    powerOnHours: 12400,
    defaultBadSectorProbability: 0.025,
    seededBadSectors: [120, 121, 560],
    seededSlowSectors: [118, 119, 122, 558, 559, 561, 890],
    smartAttributes: [
      { id: 1, name: 'Raw Read Error Rate (원시 읽기 오류율)', current: 72, worst: 60, threshold: 51, raw: '78200', status: 'warning', description: 'USB 2.0 500mA 전력 부족으로 인한 헤드 지연' },
      { id: 5, name: 'Reallocated Sectors Count (치환된 섹터 수)', current: 80, worst: 80, threshold: 140, raw: '8 (0x08)', status: 'warning', description: '충격 및 전원 차단으로 인한 배드섹터' },
      { id: 199, name: 'UltraDMA CRC Error Count (USB 2.0 케이블 전송 오류)', current: 88, worst: 88, threshold: 0, raw: '18 회', status: 'warning', description: '구형 Mini-B 단자 접촉 불량 주의' }
    ]
  },
  {
    name: 'Seagate One Touch 5TB (대용량 외장 HDD)',
    model: 'STKZ5000400',
    serialNumber: 'NAA71029831',
    firmware: '0002',
    type: 'EXTERNAL_HDD',
    isExternal: true,
    connectionType: 'usb',
    usbProtocol: 'BOT (Bulk-Only Transport)',
    bridgeChipset: 'Realtek RTS5411 USB 3.0 Hub & Bridge',
    mountPoint: 'L:',
    fileSystem: 'NTFS',
    capacityGb: 5000,
    totalSectors: 9767546468,
    interface: 'USB 3.0 Micro-B (5Gbps)',
    healthScore: 84,
    temperatureC: 44,
    powerOnHours: 2850,
    defaultBadSectorProbability: 0.01,
    seededBadSectors: [90, 91],
    seededSlowSectors: [89, 92, 450, 451],
    smartAttributes: [
      { id: 1, name: 'Raw Read Error Rate (원시 읽기 오류율)', current: 80, worst: 70, threshold: 6, raw: '29810', status: 'good', description: '정상 판독' },
      { id: 5, name: 'Reallocated Sectors Count (치환된 섹터 수)', current: 90, worst: 90, threshold: 36, raw: '2 (0x02)', status: 'warning', description: '가벼운 재할당 섹터 발생' }
    ]
  },
  {
    name: 'SanDisk Cruzer Blade 32GB (USB 2.0 플래시 메모리)',
    model: 'SDCZ50-032G',
    serialNumber: '4C53000128091811',
    firmware: '1.26',
    type: 'USB',
    isExternal: true,
    isUsb2: true,
    connectionType: 'usb',
    usbProtocol: 'USB 2.0 BOT (Bulk-Only Transport 480Mbps)',
    bridgeChipset: 'Alcor Micro AU6989SN USB 2.0 Flash Controller',
    mountPoint: 'N:',
    fileSystem: 'FAT32',
    capacityGb: 32,
    totalSectors: 62533632,
    interface: 'USB 2.0 High-Speed (480Mbps / 실효 28MB/s)',
    healthScore: 79,
    temperatureC: 38,
    powerOnHours: 1950,
    defaultBadSectorProbability: 0.02,
    seededBadSectors: [412, 413],
    seededSlowSectors: [205, 410, 411, 414, 780, 781],
    smartAttributes: [
      { id: 1, name: 'Flash Wear Level (USB 2.0 낸드 수명)', current: 79, worst: 79, threshold: 10, raw: '21% 마모 (2D TLC)', status: 'warning', description: '구형 낸드 플래시 P/E 사이클 누적' },
      { id: 2, name: 'Read Disturb Check (읽기 간섭 안정도)', current: 85, worst: 72, threshold: 30, raw: '12회 재시도', status: 'warning', description: '대역폭 한계 및 인접 셀 전하 간섭' }
    ]
  },
  {
    name: 'SanDisk Ultra Dual Drive Luxe 256GB (C/A 듀얼 USB 3.1)',
    model: 'SDDDC4-256G',
    serialNumber: '048102941824',
    firmware: '2001',
    type: 'USB',
    isExternal: true,
    connectionType: 'usb',
    usbProtocol: 'BOT (Bulk-Only Transport)',
    bridgeChipset: 'SMI SM3281 USB 3.1 Controller',
    mountPoint: 'M:',
    fileSystem: 'FAT32',
    capacityGb: 256,
    totalSectors: 500118144,
    interface: 'USB 3.1 Gen 1 Dual (150MB/s)',
    healthScore: 91,
    temperatureC: 37,
    powerOnHours: 610,
    defaultBadSectorProbability: 0.005,
    seededBadSectors: [],
    seededSlowSectors: [120, 121],
    smartAttributes: [
      { id: 1, name: 'Flash Wear Level (낸드 마모도)', current: 91, worst: 91, threshold: 10, raw: '9% 소모', status: 'good', description: '정상 내구성' }
    ]
  },
  {
    name: 'Toshiba Canvio Flex 4TB (C/A 듀얼 외장 HDD)',
    model: 'HDTX140EK3CA',
    serialNumber: '9481029TX02',
    firmware: '03.00.01',
    type: 'EXTERNAL_HDD',
    isExternal: true,
    connectionType: 'usb',
    usbProtocol: 'BOT (Bulk-Only Transport)',
    bridgeChipset: 'Toshiba Multi-Host USB 3.2 Bridge',
    mountPoint: 'Q:',
    fileSystem: 'exFAT',
    capacityGb: 4000,
    totalSectors: 7814037168,
    interface: 'USB 3.2 Gen 1 (USB-C & USB-A 케이블 동봉)',
    healthScore: 96,
    temperatureC: 36,
    powerOnHours: 320,
    defaultBadSectorProbability: 0.002,
    seededBadSectors: [],
    seededSlowSectors: [510],
    smartAttributes: [
      { id: 1, name: 'Raw Read Error Rate (원시 읽기 오류율)', current: 100, worst: 100, threshold: 50, raw: '0', status: 'good', description: '플래터 가동 무결성 상태 양호' },
      { id: 191, name: 'G-Sense Error Rate (내장 충격 센서 감지)', current: 95, worst: 95, threshold: 0, raw: '2 회', status: 'good', description: '충격 수치 미미' }
    ]
  },
  {
    name: 'Kioxia TransMemory U366 128GB (USB 3.2 낸드 메탈)',
    model: 'LU366S128GG4',
    serialNumber: 'KX83019248X',
    firmware: '1.00',
    type: 'USB',
    isExternal: true,
    connectionType: 'usb',
    usbProtocol: 'BOT (Bulk-Only Transport)',
    bridgeChipset: 'Kioxia BiCS Flash USB Controller',
    mountPoint: 'R:',
    fileSystem: 'FAT32',
    capacityGb: 128,
    totalSectors: 250069680,
    interface: 'USB 3.2 Gen 1 (메탈 하우징 방열)',
    healthScore: 94,
    temperatureC: 33,
    powerOnHours: 190,
    defaultBadSectorProbability: 0.003,
    seededBadSectors: [],
    seededSlowSectors: [112],
    smartAttributes: [
      { id: 1, name: 'Flash Wear Level (BiCS 낸드 수명)', current: 94, worst: 94, threshold: 10, raw: '6% 마모', status: 'good', description: '메탈 케이스 우수한 방열' }
    ]
  }
];

export const TOTAL_SCAN_BLOCKS = 1000;

export function generateBlocksForDrive(drive: DiskDrive, blockCount = TOTAL_SCAN_BLOCKS) {
  const blocks = [];
  const lbaStep = Math.floor(drive.totalSectors / blockCount);

  const badSet = new Set(drive.seededBadSectors || []);
  const slowSet = new Set(drive.seededSlowSectors || []);

  for (let i = 0; i < blockCount; i++) {
    const lba = i * lbaStep;
    const endLba = (i + 1) * lbaStep - 1;

    blocks.push({
      id: i,
      lba,
      endLba,
      status: 'unscanned' as const,
      responseTimeMs: 0
    });
  }

  return { blocks, badSet, slowSet };
}
