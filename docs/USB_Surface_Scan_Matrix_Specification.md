# USB 버전 및 장치 클래스별 적응형 표면검사 매트릭스 명세서

- **프로젝트명**: DiskSentinel Pro (디스크 배드섹터 정밀 검사기)
- **버전**: v4.6.0
- **라이선스**: Apache-2.0
- **연계 모듈**:
  - C++ 네이티브 엔진: `src/native/DiskSentinelEngine.h`, `src/native/DiskSentinelEngine.cpp` (`#26 DS_ProbeUsbTopology`, `#27 DS_ScanLbaBlockWithPolicy`)
  - Rust 네이티브 코어: `src/native/rust/src/lib.rs`, `src-tauri/src/main.rs` (`probe_usb_topology_all`, `probe_fake_capacity_checkpoints`, `scan_lba_batch`)
  - TypeScript 정책 엔진: `src/utils/usbScanMatrix.ts`, `src/utils/nativeDriveEngine.ts`, `src/utils/scanProfiles.ts`
  - UI 콘솔: `src/components/ExternalDeviceModal.tsx` (`USB 스캔 매트릭스 & 위조 용량 가드`), `src/components/ScanMethodSelector.tsx`, `src/components/TelemetryPanel.tsx`

---

## 1. 설계 배경 및 해결 과제 (Why USB-Adaptive Surface Inspection?)

기존의 고정 임계치(`Slow > 150ms`, `Critical > 500ms`, 단일 청크 크기) 표면검사 방식은 USB 저장장치를 진단할 때 다음 세 가지 구조적 오진을 유발합니다:

1. **USB 1.1 / 2.0 BOT 대역폭 한계로 인한 배드섹터 오탐(False Positive)**:
   - USB 2.0 BOT(Bulk-Only Transport) 환경에서는 대역폭 한계(실효 `28~35 MB/s`)와 Half-Duplex SCSI 요청 왕복 지연으로 정상 블록도 `20~80ms`, 허브/패킷 지터 시 `200~450ms`까지 지연됩니다.
   - 기존 C++ `DS_ScanLbaBlock`은 `latencyMs >= 500ms`일 때 무조건 `DS_STATUS_BAD`로 격하하여, 실제로는 정상 판독된 USB 1.1/2.0/외장 HDD 블록까지 배드섹터로 잘못 판정했습니다.
2. **USB 3.2 UASP 및 USB4/Thunderbolt PCIe 터널링의 초저지연·발열 미대응**:
   - USB4/Thunderbolt 4(`40 Gbps`, `stornvme` 직결) 또는 USB 3.2 Gen2x2(`20 Gbps`, UASP) 외장 NVMe 인클로저는 `0.1~2ms` 응답과 높은 발열이 특징이므로, `2MB` 대용량 버스트 + 서브밀리초 판정(`Slow > 12~25ms`) + 주기적 마이크로 쿨다운(`cooldownEveryNBlocks`)이 필수적입니다.
3. **용량 위조(Fake-Capacity) 플래시 메모리/microSD 검출 부재**:
   - 컨트롤러 펌웨어를 조작해 실제 `8GB`/`32GB` NAND 위에 `1TB`/`2TB`로 LBA 주소를 래핑(Aliasing)하거나 가비지(`0x00`/`0xFF`)를 반환하는 위조 장치는 일반 순차 읽기(`ReadFile` 성공)만으로는 가려낼 수 없습니다.

이를 해결하기 위해 DiskSentinel Pro는 **(1) Win32 USB 토폴로지 실측**, **(2) 버전×장치 매트릭스 기반 네이티브 엔진 동적 튜닝**, **(3) 2단계 위조 용량 가드(Fake-Capacity Flash Guard)**를 엔드투엔드 통합했습니다.

---

## 2. Win32 USB 디스크립터 및 토폴로지 실측 아키텍처 (`DS_ProbeUsbTopology`)

네이티브 `#26 DS_ProbeUsbTopology` 함수는 더미 추측 없이 OS 커널 레지스트리·PnP 트리·USB 허브 IOCTL을 통해 실제 연결 규격을 탐지합니다.

### 2.1 다단계 커널 프로빙 파이프라인

1. **드라이브 번호 → PnP 장치 인스턴스 ID 매핑**:
   - `HKLM\SYSTEM\CurrentControlSet\Services\disk\Enum` 레지스트리에서 `\\.\PhysicalDrive{N}`의 `DeviceInstanceId` 획득.
2. **PnP 부모 체인 추적 (`cfgmgr32.dll`)**:
   - `CM_Locate_DevNodeW` → `CM_Get_Parent`를 최대 8단계 상위 노드로 순회하며:
     - **전송 드라이버(`SPDRP_SERVICE`) 식별**:
       - `USBSTOR` → **BOT** (Bulk-Only Transport)
       - `UASPStor` / `uaspstor` → **UASP** (USB Attached SCSI Protocol)
       - `stornvme` + USB4/PCIe 부모 → **PCIe_Tunnel** (Native PCIe NVMe Tunnel)
       - `sdbus` / `rtsxstor` 등 → **SDIO** (SD/MMC Bus Reader)
     - **VID / PID 추출**: `USB\VID_XXXX&PID_YYYY` 문자열 파싱 후 알려진 브릿지 칩셋 테이블 조회(예: ASMedia `ASM2362`/`ASM2364`/`ASM2464PD`, Realtek `RTL9210`/`RTL9210B`, JMicron `JMS583`, Phison/SMI/Alcor/Genesys Logic).
3. **USB Hub 포트 실측 (`setupapi.dll` + USB IOCTL)**:
   - `GUID_DEVINTERFACE_USB_HUB` 허브 핸들을 열어 `IOCTL_USB_GET_NODE_INFORMATION`으로 포트 수 확보.
   - 각 포트에 `IOCTL_USB_GET_NODE_CONNECTION_INFORMATION_EX` 및 `_V2`를 질의해 실제 협상된 포트 속도(`ConnectionStatus`, `Speed`, `SupportedUsbProtocols`)와 `bcdUSB`(예: `0x0110`, `0x0200`, `0x0300`, `0x0310`, `0x0320`)를 직접 취득.
4. **폴백 휴리스틱 (`resolveDriveUsbTopology`)**:
   - 비관리자 권한 또는 커널 허브 IOCTL 차단 시에도 `DiskDrive.usbProtocol`, `bridgeChipset`, `hardwareSpecs.busType`, `hardwareSpecs.busInterfaceSpeed` 단서를 조합해 가장 근접한 USB 세대 및 장치 클래스를 결정론적으로 해석(브라우저 전용 실행 시에는 `SIMULATION_UNAVAILABLE` 가드 유지).

---

## 3. 동적 정책 실행 엔진 (`DS_ScanLbaBlockWithPolicy`)

`#27 DS_ScanLbaBlockWithPolicy`는 프론트엔드 레이블만 바꾸는 방식이 아니라 **C++ DLL · Rust FFI · Tauri 배치 루프** 전체에서 다음 6개 파라미터를 직접 제어합니다:

| 파라미터 | 단위 | C++/Rust 네이티브 계층 동작 |
| :--- | :--- | :--- |
| `chunkSectors` | sectors (`512B`) | 단일 `ReadFile` DMA 전송 블록 크기 결정 (`16KB` ~ `2048KB`) |
| `slowThresholdMs` | ms | `latencyMs >= slowThresholdMs` 시 `DS_STATUS_SLOW` 분류 |
| `criticalThresholdMs` | ms | `latencyMs >= criticalThresholdMs` 시 `DS_STATUS_CRITICAL` 분류 *(단, Read 성공 시 `BAD`로 격하하지 않음)* |
| `maxRetries` / `retryDelayMs` | 횟수 / ms | USB 일시적 오류(`ERROR_SEM_TIMEOUT`, `ERROR_IO_DEVICE`, `ERROR_NOT_READY`, `ERROR_BUSY`, `ERROR_GEN_FAILURE`, `ERROR_DEVICE_NOT_CONNECTED`, `433`) 발생 시 버스 재안정화 대기 후 최대 5회 재시도 |
| `cooldownEveryNBlocks` / `cooldownMs` | 블록 / ms | QLC USB 스틱·초고속 NVMe 브릿지·무전원 허브 2.5" HDD 과열/전압강하(Brownout) 방지를 위한 주기적 스캔 쉼 |
| `ioTimeoutMs` | ms | 장치/버전별 허용 타임아웃 기준(`800ms` ~ `6000ms`) |

> **핵심 보장**: `ReadFile`이 유효하게 성공한 블록은 레이턴시가 `criticalThresholdMs`를 넘더라도 `DS_STATUS_BAD`로 덮어쓰지 않습니다.

---

## 4. USB 버전 × 장치 클래스 표면검사 매트릭스

`src/utils/usbScanMatrix.ts`의 `USB_SCAN_MATRIX_CATALOG`에 정의된 전체 12개 정책 조합입니다.

| 프로파일 키 | USB 버전 / 규격 | 프로토콜 | 대상 장치 클래스 | 청크 크기 | Slow / Crit (ms) | 재시도 (간격) | 열/전력 쿨다운 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `usb11_flash_legacy` | USB 1.1 (12 Mbps) | BOT | 레거시 USB 플래시 / 리더기 (`flash_thumb`) | `16 KB` | `650 / 1800` | 3회 (60ms) | 4블록 / 25ms |
| `usb20_bot_flash` | USB 2.0 (480 Mbps) | BOT | USB 2.0 플래시 메모리 (`flash_thumb`) | `64 KB` | `180 / 600` | 2회 (40ms) | 8블록 / 20ms |
| `usb20_bot_sd_reader` | USB 2.0 (480 Mbps) | BOT | SD / microSD 카드 리더기 (`sd_card_uhs`) | `64 KB` | `220 / 700` | 3회 (50ms) | 8블록 / 25ms |
| `usb20_bot_ext_hdd` | USB 2.0 (480 Mbps) | BOT | 외장 2.5"/3.5" 기계식 HDD (`external_hdd`) | `128 KB` | `280 / 850` | 3회 (120ms) | 16블록 / 15ms |
| `usb30_gen1_flash` | USB 3.0 / 3.2 Gen1 (5 Gbps) | BOT | USB 3.0/3.2 Gen1 플래시 (`flash_thumb`) | `256 KB` | `80 / 280` | 2회 (30ms) | 16블록 / 15ms |
| `usb30_gen1_sd_uhs` | USB 3.0 / 3.2 Gen1 (5 Gbps) | SDIO | UHS-I / UHS-II SD 카드 (`sd_card_uhs`) | `256 KB` | `90 / 320` | 2회 (35ms) | 16블록 / 15ms |
| `usb30_gen1_uasp_ext_hdd` | USB 3.0 / 3.2 Gen1 (5 Gbps) | UASP | USB 3.0 UASP 외장 HDD (`external_hdd`) | `512 KB` | `140 / 450` | 2회 (100ms) | 없음 |
| `usb30_gen1_uasp_sata_ssd` | USB 3.0 / 3.2 Gen1 (5 Gbps) | UASP | 외장 SATA SSD (`external_sata_ssd`) | `512 KB` | `45 / 160` | 1회 (20ms) | 없음 |
| `usb32_gen2_uasp_nvme_ssd` | USB 3.1 / 3.2 Gen2 (10 Gbps) | UASP | 10Gbps 외장 NVMe SSD (`external_nvme_ssd`) | `1024 KB` | `25 / 90` | 1회 (15ms) | 32블록 / 8ms |
| `usb32_gen2x2_uasp_nvme_ssd` | USB 3.2 Gen2x2 (20 Gbps) | UASP | 20Gbps 듀얼 레인 NVMe SSD (`external_nvme_ssd`) | `1024 KB` | `18 / 65` | 1회 (10ms) | 32블록 / 10ms |
| `usb4_tb_pcie_nvme` | USB4 / TB4 (40 Gbps) | PCIe_Tunnel (`stornvme`) | USB4/TB4 PCIe NVMe 인클로저 (`external_nvme_ssd`) | `2048 KB` | `12 / 45` | 1회 (10ms) | 32블록 / 12ms |
| `usb_fake_capacity_guard` | 전세대 USB / SD | Guard Probe | 위조 용량 의심 USB / SD (`flash_thumb`) | `64 KB` | `160 / 500` | 2회 (30ms) | 8블록 / 15ms |

### 4.1 포트 병목 자동 감지 (`detectUsbPortBottleneck`)
- 외장 NVMe/SATA SSD(`external_nvme_ssd`, `external_sata_ssd`, `EXTERNAL_SSD`)가 **USB 2.0 이하 포트(`usb_2_0`/`usb_1_1`)**에 연결되거나 USB 3.x SSD가 UASP 대신 BOT로 동작할 때, 또는 USB 2.0 이하 500mA 포트로 외장 HDD를 구동할 때 실시간 경고 배너를 출력해 포트/케이블 교체를 안내합니다.

---

## 5. 2단계 위조 용량 가드 (Two-Tier Fake-Capacity Flash Guard)

`probe_fake_capacity_checkpoints` (Tauri / Rust) 및 `runFakeCapacityGuardScan` (TS)는 H2testw 원리를 개선해 안전하게 위조 용량을 적발합니다.

### 5.1 2의 거듭제곱 LBA 경계 체크포인트 계산 (`computePowerOf2Checkpoints`)
- `512 MiB`부터 `1 TiB`까지 2의 거듭제곱 LBA 경계(`512 MiB, 1 GiB, 2 GiB, ..., 1 TiB`)와 디스크 끝 99.5% 구간(`99.5% Tail`)을 자동 체크포인트로 계산합니다.

### 5.2 2단계 검증 메커니즘

1. **Tier 1 — 무파괴 읽기 전용 앨리어싱·엔트로피 프로브 (기본값, 데이터 100% 보존)**:
   - 모든 체크포인트의 16섹터(`8KB`)를 `DS_ProbeRawDiskRead`로 직접 판독해 IEEE 802.3 CRC32와 All-Zero/All-0xFF 균일 패턴 여부를 계산합니다.
   - 서로 다른 2의 거듭제곱 경계 LBA에서 **동일한 비제로(non-zero) CRC32 해시**가 반복 검출되거나(주소 래핑 앨리어싱), 고용량 경계 이상 전 영역이 I/O 오류(`READ_ERROR`) 또는 순수 `0x00`/`0xFF` 공패턴으로 떨어지면 위조 의심 판정을 내립니다.
2. **Tier 2 — `Xoshiro256**` PRNG 왕복 검증 (Write → Read-Back Verify → 원본 섹터 즉시 복원)**:
   - **OS 시스템 디스크 영구 차단**: TypeScript(`isFakeCapacityTier2ProtectedOsDrive`)와 Rust(`probe_fake_capacity_checkpoints`) 양쪽에서 **`PhysicalDrive0`**, **`C:` 매핑 드라이브**, **`allowDestructiveWrite === false`**를 영구 차단해 OS/사용자 시스템 손상을 원천 불가능하게 설계했습니다.
   - 비시스템 외장 장치에서 사용자가 명시적 동의 체크박스를 활성화한 경우에만 각 체크포인트의 **원본 섹터를 메모리 백업 → `Xoshiro256**` 고유 LBA 시드 패턴 기록 → 즉시 재판독 비교(원본 CRC32 및 기대 패턴 대조) → 실패 지점 추적 → 원본 섹터 즉시 복원**을 수행합니다.
   - 만약 후반부 LBA에 기록한 고유 시드 패턴이 앞선 LBA와 충돌(Wrapping)하거나 재판독 시 다른 패턴으로 덮여 있으면 **실측 실제 용량(`estimatedRealCapacityGb`)**을 즉시 보고합니다.
