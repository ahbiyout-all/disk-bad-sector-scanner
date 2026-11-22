import { AppLocale } from '../types';
import { safeStorage } from './safeStorage';

const LOCALE_STORAGE_KEY = 'disksentinel_locale_v1';

export function loadSavedLocale(): AppLocale {
  const saved = safeStorage.getItem(LOCALE_STORAGE_KEY);
  return saved === 'en' ? 'en' : 'ko';
}

export function saveLocale(locale: AppLocale): void {
  safeStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

const MESSAGES = {
  ko: {
    'tab.fleet': '전체 디스크 플릿',
    'tab.scan': '라이브 표면 검사',
    'tab.logs': '오류 & 이벤트 로그',
    'tab.integrity': '폴더 LBA 무결성',
    'tab.health': '건강 & 발열 추이',
    'tab.smart': 'S.M.A.R.T. 정밀 속성',
    'tab.history': '검사 기록 & 대조',
    'tab.recovery': '데이터 복구 · 포렌식',
    'tab.tools': '하드웨어 · 벤치 · 감시',
    'tab.settings': '설정 · 시스템 · 가이드',
    'sidebar.group.workspace': '진단 워크스페이스',
    'sidebar.group.telemetry': '텔레메트리 & 이력',
    'sidebar.group.workbenches': '전문가 워크벤치',
    'sidebar.group.system': '시스템 & 지원',
    'sidebar.collapse': '사이드바 접기',
    'sidebar.expand': '사이드바 펼치기',
    'sidebar.ipcReady': '네이티브 IPC 연결됨',
    'sidebar.ipcStandby': 'Tauri IPC 대기',
    'sidebar.watchdog': '워치독',
    'sidebar.updateAvailable': '업데이트 있음',
    'nav.file': '파일',
    'nav.view': '보기',
    'nav.tools': '도구',
    'nav.options': '옵션',
    'nav.help': '도움말',
    'nav.commandPalette': '명령 팔레트',
    'nav.rescan': '장치 재검색',
    'nav.selectDrive': '대상 디스크 선택',
    'nav.noDrive': '디스크 미연결',
    'nav.report': '보고서',
    'nav.export': '내보내기',
    'workbench.needDriveTitle': '대상 물리 드라이브를 선택하세요',
    'workbench.needDriveDesc': '이 도구는 선택한 물리 디스크(\\.\PhysicalDrive)에 직접 I/O를 수행합니다. 상단 드라이브 선택기에서 디스크를 선택하거나 Tauri 데스크톱 관리자 권한으로 장치를 재검색하세요.',
    'fleet.title': '멀티 드라이브 플릿 비교 대시보드',
    'fleet.subtitle': '연결된 모든 내·외장 물리 디스크의 링크 대역폭, 건강도, 온도, S.M.A.R.T. 이상 징후를 한눈에 비교하고 일괄 감사할 수 있습니다.',
    'fleet.totalDrives': '연결 디스크',
    'fleet.externalDrives': '외장 / USB',
    'fleet.alertDrives': '주의·위험 드라이브',
    'fleet.downgradedLinks': '링크 속도 저하',
    'fleet.batchAudit': '전체 일괄 Quick 감사',
    'fleet.exportCsv': 'CSV 내보내기',
    'fleet.exportJson': 'JSON 내보내기',
    'fleet.print': '인쇄',
    'fleet.empty': '감지된 물리 디스크가 없습니다. Tauri 데스크톱 앱(관리자 권한)에서 장치를 연결한 후 재검색하세요.',
    'integrity.title': '중요 폴더 물리 LBA 매핑 & Bit-Rot 무결성 감시',
    'integrity.subtitle': 'Win32 FSCTL_GET_RETRIEVAL_POINTERS로 파일의 실제 물리 LBA 익스텐트를 추적하고 SHA-256 해시 변조(Bit-Rot) 및 배드섹터 겹침 여부를 감시합니다.',
    'integrity.addFolder': '폴더 추가',
    'integrity.addFiles': '파일 추가',
    'integrity.verifyNow': '무결성 일괄 검증',
    'integrity.refreshBaseline': '기준 해시 갱신',
    'integrity.empty': '감시 중인 중요 폴더 또는 파일이 없습니다. [폴더 추가] 또는 경로 입력으로 기준 해시와 LBA 매핑을 등록하세요.',
    'cmd.placeholder': '메뉴, 진단 도구, 탭 또는 드라이브 검색... (예: hex, ddrescue, fleet, lba)',
    'cmd.empty': '일치하는 명령이나 도구가 없습니다.',
    'checkpoint.found': '중단된 표면 검사 체크포인트가 감지되었습니다.',
    'checkpoint.resume': '이어서 재개',
    'checkpoint.discard': '폐기'
  },
  en: {
    'tab.fleet': 'Disk Fleet',
    'tab.scan': 'Live Surface Scan',
    'tab.logs': 'Error & Event Logs',
    'tab.integrity': 'Folder LBA Integrity',
    'tab.health': 'Health & Thermal',
    'tab.smart': 'S.M.A.R.T. Telemetry',
    'tab.history': 'History & Diff',
    'tab.recovery': 'Recovery & Forensics',
    'tab.tools': 'Hardware & Watchdog',
    'tab.settings': 'Settings & Docs',
    'sidebar.group.workspace': 'Diagnostics',
    'sidebar.group.telemetry': 'Telemetry & Logs',
    'sidebar.group.workbenches': 'Workbenches',
    'sidebar.group.system': 'System',
    'sidebar.collapse': 'Collapse Sidebar',
    'sidebar.expand': 'Expand Sidebar',
    'sidebar.ipcReady': 'Native IPC Active',
    'sidebar.ipcStandby': 'Tauri IPC Standby',
    'sidebar.watchdog': 'Watchdog',
    'sidebar.updateAvailable': 'Update Ready',
    'nav.file': 'File',
    'nav.view': 'View',
    'nav.tools': 'Tools',
    'nav.options': 'Options',
    'nav.help': 'Help',
    'nav.commandPalette': 'Command Palette',
    'nav.rescan': 'Rescan',
    'nav.selectDrive': 'Target Physical Drive',
    'nav.noDrive': 'No Drive Attached',
    'nav.report': 'Report',
    'nav.export': 'Export',
    'workbench.needDriveTitle': 'Select a physical drive first',
    'workbench.needDriveDesc': 'This utility issues direct I/O against a physical disk handle. Choose a drive in the top selector or rescan devices inside Tauri Desktop (Administrator).',
    'fleet.title': 'Multi-Drive Fleet Overview Dashboard',
    'fleet.subtitle': 'Compare negotiated PCIe/SATA/USB link speeds, health scores, temperatures, and S.M.A.R.T. counters across all drives.',
    'fleet.totalDrives': 'Connected Drives',
    'fleet.externalDrives': 'External / USB',
    'fleet.alertDrives': 'Alert / Critical',
    'fleet.downgradedLinks': 'Link Downgraded',
    'fleet.batchAudit': 'Batch Quick Audit',
    'fleet.exportCsv': 'Export CSV',
    'fleet.exportJson': 'Export JSON',
    'fleet.print': 'Print',
    'fleet.empty': 'No physical drives detected. Launch in Tauri Desktop (Administrator) and rescan attached storage.',
    'integrity.title': 'Folder Physical LBA Mapping & Bit-Rot Watch',
    'integrity.subtitle': 'Maps critical files to physical disk LBA extents via Win32 FSCTL_GET_RETRIEVAL_POINTERS and detects SHA-256 bit-rot or bad-sector overlap.',
    'integrity.addFolder': 'Add Folder',
    'integrity.addFiles': 'Add Files',
    'integrity.verifyNow': 'Verify Integrity',
    'integrity.refreshBaseline': 'Update Baselines',
    'integrity.empty': 'No critical folders or files watched yet. Add a folder or path to record SHA-256 baselines and LBA extents.',
    'cmd.placeholder': 'Search tools, tabs, drives, or actions... (e.g. hex, ddrescue, fleet, lba)',
    'cmd.empty': 'No matching commands found.',
    'checkpoint.found': 'Interrupted surface scan checkpoint detected.',
    'checkpoint.resume': 'Resume Scan',
    'checkpoint.discard': 'Discard'
  }
} as const;

export type I18nKey = keyof typeof MESSAGES.ko;

export function t(locale: AppLocale, key: I18nKey): string {
  return MESSAGES[locale]?.[key] ?? MESSAGES.ko[key] ?? key;
}
