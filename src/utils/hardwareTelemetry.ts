import { DiskDrive, ScanTelemetry } from '../types';

export interface HardwareVitals {
  temperatureC: number;
  tempDeltaFromBaseline: number;
  thermalStatus: 'normal' | 'warm' | 'critical';
  powerWatts: number;
  powerCurrentMa: number;
  powerVoltageV: number;
  powerRailText: string;
  rpmValue: number; // 7200, 5400, or 0
  rpmDisplay: string;
  rpmSubtext: string;
  isMechanicalHdd: boolean;
  controllerLoadPct: number;
  busSpeedText: string;
}

export function calculateHardwareVitals(
  drive: DiskDrive,
  telemetry: ScanTelemetry,
  speedMultiplier: number,
  isThermalStress: boolean = false
): HardwareVitals {
  const isScanning = telemetry.status === 'scanning';
  const elapsed = telemetry.elapsedSeconds || 0;

  // Is this drive a mechanical HDD or External HDD?
  const isMechanicalHdd = drive.type === 'HDD' || drive.type === 'EXTERNAL_HDD';

  // Base RPM determination for HDDs
  let baseRpm = 0;
  if (isMechanicalHdd) {
    if (drive.interface?.includes('7200') || drive.model?.includes('2FR102') || drive.capacityGb <= 500) {
      baseRpm = 7200;
    } else {
      baseRpm = 5400;
    }
  }

  // 1. Temperature Calculation (°C)
  const baseTemp = drive.temperatureC || 36;
  let tempThermalLoad = 0;
  if (isScanning) {
    // Thermal rise grows with time scanning and speed multiplier
    const speedFactor = Math.min(10, speedMultiplier);
    const timeFactor = Math.min(6.0, (elapsed / 60) * 1.5);
    tempThermalLoad = Number(((speedFactor * 0.4) + timeFactor + (telemetry.badCount * 0.8)).toFixed(1));
  } else {
    tempThermalLoad = 0;
  }

  if (isThermalStress) {
    tempThermalLoad += 25.0; // Force overheat above 60°C!
  }

  // Add slight physical thermal rise based on actual scanning throughput
  const throughputFactor = Math.min(1.5, (telemetry.scanSpeedMbPerSec || 0) / 200);
  const liveTemp = Number((baseTemp + tempThermalLoad + throughputFactor).toFixed(1));

  let thermalStatus: 'normal' | 'warm' | 'critical' = 'normal';
  if (liveTemp >= 52) {
    thermalStatus = 'critical';
  } else if (liveTemp >= 44) {
    thermalStatus = 'warm';
  }

  // 2. Power Consumption Calculation (Watts, Amps, Volts)
  let baseIdleWatts = 0.5;
  let activeMaxWatts = 3.0;
  let railVoltage = 5.0;

  if (drive.type === 'HDD') {
    // 3.5" desktop HDD uses 12V and 5V
    baseIdleWatts = 5.8;
    activeMaxWatts = 11.5;
    railVoltage = 12.0;
  } else if (drive.type === 'EXTERNAL_HDD') {
    // 2.5" external HDD uses 5V USB power
    baseIdleWatts = 1.8;
    activeMaxWatts = 4.6;
    railVoltage = 5.0;
  } else if (drive.type === 'NVMe') {
    baseIdleWatts = 0.8;
    activeMaxWatts = 7.4;
    railVoltage = 3.3;
  } else if (drive.type === 'EXTERNAL_SSD' || drive.type === 'SSD') {
    baseIdleWatts = 0.5;
    activeMaxWatts = 3.2;
    railVoltage = 5.0;
  } else {
    // USB / SD Card / External
    baseIdleWatts = 0.25;
    activeMaxWatts = 1.4;
    railVoltage = 5.0;
  }

  let currentWatts = baseIdleWatts;
  if (isScanning) {
    // Dynamically calculate power from real measured throughput (MB/s)
    const actualMbPerSec = telemetry.scanSpeedMbPerSec || 0;
    const loadRatio = Math.min(1, actualMbPerSec / 500);
    const speedRatio = Math.min(1, speedMultiplier / 5);
    const badSectorPenalty = Math.min(1.5, telemetry.badCount * 0.2);

    currentWatts = Number(
      (
        baseIdleWatts +
        (activeMaxWatts - baseIdleWatts) * Math.max(0.25, Math.max(loadRatio, speedRatio * 0.5)) +
        badSectorPenalty
      ).toFixed(2)
    );
  } else {
    currentWatts = baseIdleWatts;
  }

  const powerCurrentMa = Math.round((currentWatts / railVoltage) * 1000);
  const powerRailText = drive.type === 'HDD' ? '12V / 5V Dual Rail' : `${railVoltage}V DC Rail`;

  // 3. RPM / Spindle / Bus Speed Calculation
  let rpmValue = 0;
  let rpmDisplay = '';
  let rpmSubtext = '';
  let controllerLoadPct = 12;

  if (isMechanicalHdd) {
    rpmValue = baseRpm;
    if (isScanning) {
      // Micro spindle jitter ±2 RPM
      const rpmJitter = Math.round(Math.sin(elapsed * 2.1) * 2);
      const liveRpm = baseRpm + rpmJitter;
      rpmDisplay = `${liveRpm.toLocaleString()} RPM`;
      rpmSubtext = `스핀들 모터 서보 락 (정밀도 99.98%)`;
      controllerLoadPct = Math.min(99, Math.round(65 + speedMultiplier * 3.2 + telemetry.badCount * 2));
    } else {
      rpmDisplay = `${baseRpm.toLocaleString()} RPM (대기)`;
      rpmSubtext = `스핀들 아이들링 회전 유지`;
      controllerLoadPct = 15;
    }
  } else {
    // Solid State Storage (0 RPM)
    rpmValue = 0;
    rpmDisplay = `0 RPM (솔리드 스테이트 / NAND Flash)`;

    if (drive.type === 'NVMe') {
      rpmSubtext = `PCIe 4.0 x4 Direct (구동 부품 없음)`;
    } else if (drive.isExternal) {
      rpmSubtext = `${drive.usbProtocol || 'USB High-Speed Flash'}`;
    } else {
      rpmSubtext = `SATA III NAND Flash (구동 부품 없음)`;
    }

    if (isScanning) {
      controllerLoadPct = Math.min(98, Math.round(40 + speedMultiplier * 5.5 + telemetry.badCount * 3));
    } else {
      controllerLoadPct = 8;
    }
  }

  // Bus Speed Text
  let busSpeedText = drive.interface || 'Standard I/O Interface';
  if (drive.isExternal && drive.bridgeChipset) {
    busSpeedText = `${drive.interface} (${drive.bridgeChipset})`;
  }

  return {
    temperatureC: liveTemp,
    tempDeltaFromBaseline: tempThermalLoad,
    thermalStatus,
    powerWatts: currentWatts,
    powerCurrentMa,
    powerVoltageV: railVoltage,
    powerRailText,
    rpmValue,
    rpmDisplay,
    rpmSubtext,
    isMechanicalHdd,
    controllerLoadPct,
    busSpeedText
  };
}
