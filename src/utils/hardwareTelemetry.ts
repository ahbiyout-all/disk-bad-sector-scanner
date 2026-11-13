import { DiskDrive, ScanTelemetry } from '../types';

export interface HardwareVitals {
  temperatureC: number | null;
  tempDeltaFromBaseline: number | null;
  thermalStatus: 'normal' | 'warm' | 'critical' | 'unavailable';
  powerWatts: number | null;
  powerCurrentMa: number | null;
  powerVoltageV: number | null;
  powerRailText: string;
  rpmValue: number | null;
  rpmDisplay: string;
  rpmSubtext: string;
  isMechanicalHdd: boolean;
  controllerLoadPct: number | null;
  busSpeedText: string;
  isSensorAvailable: boolean;
}

export function calculateHardwareVitals(
  drive: DiskDrive,
  telemetry: ScanTelemetry,
  _speedMultiplier: number
): HardwareVitals {
  const isScanning = telemetry.status === 'scanning';
  const isMechanicalHdd = drive.type === 'HDD' || drive.type === 'EXTERNAL_HDD';

  // Only report real temperature if provided by native kernel IOCTL/NVMe/SMART
  const realTemp = drive.temperatureC !== null && drive.temperatureC !== undefined && drive.temperatureC > 0
    ? drive.temperatureC
    : null;

  let thermalStatus: HardwareVitals['thermalStatus'] = 'unavailable';
  if (realTemp !== null) {
    if (realTemp >= 55) thermalStatus = 'critical';
    else if (realTemp >= 45) thermalStatus = 'warm';
    else thermalStatus = 'normal';
  }

  // Only report rotational RPM if hardware specs or native query supplied it (or 0 for solid-state)
  const specRpm = drive.hardwareSpecs?.rotationalSpeedRpm ?? null;
  let rpmValue: number | null = null;
  let rpmDisplay = 'N/A (커널 RPM 미제공)';
  let rpmSubtext = '브라우저 샌드박스에서는 ATA 스핀들 센서 조회가 제한됩니다';

  if (!isMechanicalHdd) {
    rpmValue = 0;
    rpmDisplay = '0 RPM (솔리드 스테이트 / NAND Flash)';
    if (drive.type === 'NVMe') {
      rpmSubtext = drive.interface || 'PCIe NVMe Controller';
    } else if (drive.attachedFile || drive.attachedFileHandle) {
      rpmSubtext = 'W3C File / OPFS Sandbox Storage';
    } else if (drive.isExternal) {
      rpmSubtext = drive.usbProtocol || 'USB Solid-State Flash';
    } else {
      rpmSubtext = drive.interface || 'NAND Flash Storage';
    }
  } else if (specRpm !== null && specRpm > 0) {
    rpmValue = specRpm;
    rpmDisplay = `${specRpm.toLocaleString()} RPM`;
    rpmSubtext = isScanning ? '스핀들 가동 중 (하드웨어 사양 기준)' : '스핀들 대기 상태';
  }

  // Browser/Web APIs cannot measure physical Wattage/Amps/Voltage rails directly
  const powerRailText = drive.type === 'HDD'
    ? '12V / 5V Dual Rail (전력 센서 N/A)'
    : drive.type === 'NVMe'
      ? '3.3V PCIe Rail (전력 센서 N/A)'
      : '5V DC / Host Bus (전력 센서 N/A)';

  let busSpeedText = drive.interface || 'Standard I/O Interface';
  if (drive.isExternal && drive.bridgeChipset) {
    busSpeedText = `${drive.interface} (${drive.bridgeChipset})`;
  }

  // Controller I/O load reflects real measured throughput when scanning
  const measuredThroughput = drive.hardwareSpecs?.measuredSequentialReadMbSec ?? null;
  let controllerLoadPct: number | null = null;
  if (isScanning && measuredThroughput && measuredThroughput > 0) {
    controllerLoadPct = Math.min(100, Math.round(((telemetry.scanSpeedMbPerSec || 0) / measuredThroughput) * 100));
  }

  return {
    temperatureC: realTemp,
    tempDeltaFromBaseline: realTemp !== null && drive.hardwareSpecs?.currentTempC != null
      ? Number((realTemp - drive.hardwareSpecs.currentTempC).toFixed(1))
      : null,
    thermalStatus,
    powerWatts: null,
    powerCurrentMa: null,
    powerVoltageV: null,
    powerRailText,
    rpmValue,
    rpmDisplay,
    rpmSubtext,
    isMechanicalHdd,
    controllerLoadPct,
    busSpeedText,
    isSensorAvailable: realTemp !== null
  };
}
