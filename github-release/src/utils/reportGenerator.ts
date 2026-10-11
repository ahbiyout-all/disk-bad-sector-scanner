import { DiskDrive, SavedScanRecord, SectorBlock, SpecializedScanMethodId } from '../types';
import { SCAN_METHOD_DEFINITIONS, generateMediaSpecificDiagnosis } from './scanProfiles';

export function createScanRecordFromSession(
  drive: DiskDrive,
  scanMode: 'quick' | 'full',
  blocks: SectorBlock[],
  durationSeconds: number,
  methodId?: SpecializedScanMethodId
): SavedScanRecord {
  const scannedBlocks = blocks.filter(b => b.status !== 'unscanned');
  const goodCount = blocks.filter(b => b.status === 'good').length;
  const normalCount = blocks.filter(b => b.status === 'normal').length;
  const slowCount = blocks.filter(b => b.status === 'slow').length;
  const criticalCount = blocks.filter(b => b.status === 'critical').length;
  const badBlocks = blocks.filter(b => b.status === 'bad');
  const badCount = badBlocks.length;
  const badLbaList = badBlocks.map(b => b.lba);

  const latencies = scannedBlocks
    .filter(b => b.responseTimeMs > 0)
    .map(b => b.responseTimeMs);

  const avgLatency = latencies.length > 0 ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1)) : 0;
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;

  // Calculate dynamic health score based on scan findings and base drive health
  let calculatedHealth = drive.healthScore;
  if (badCount > 0) {
    calculatedHealth = Math.max(10, calculatedHealth - (badCount * 12));
  }
  if (criticalCount > 0) {
    calculatedHealth = Math.max(20, calculatedHealth - (criticalCount * 3));
  }
  if (slowCount > 0) {
    calculatedHealth = Math.max(30, calculatedHealth - (slowCount * 0.5));
  }
  calculatedHealth = Math.round(calculatedHealth);

  let recommendation = '디스크 상태가 매우 양호합니다. 정기적인 백업을 유지하며 정상 사용하십시오.';
  if (badCount >= 5) {
    recommendation = '【긴급 조치 요망】 다수의 물리적/논리적 배드섹터가 검출되었습니다. 즉시 중요 데이터를 다른 드라이브로 백업하고, 드라이브 교체 또는 RMA 서비스를 신청하십시오.';
  } else if (badCount > 0) {
    recommendation = '【주의 - 데이터 유실 위험】 배드섹터가 발견되었습니다. 섹터 재할당(Reallocated) 진행 여부를 관찰하고, 즉시 중요 파일 백업을 권장합니다.';
  } else if (criticalCount > 0 || slowCount > 10) {
    recommendation = '【경고】 응답 지연(>150ms) 섹터가 다수 존재하여 헤드 마모 또는 표면 열화가 진행 중일 수 있습니다. 주기적인 정밀 검사를 권장합니다.';
  }

  const activeMethod = methodId ? SCAN_METHOD_DEFINITIONS[methodId] : undefined;
  const mediaDiagnosis = methodId ? generateMediaSpecificDiagnosis(drive, methodId, badCount, slowCount, criticalCount) : undefined;

  const now = new Date();
  const dateStr = now.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  return {
    id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    driveId: drive.id,
    driveModel: drive.model,
    driveSerial: drive.serialNumber,
    driveCapacityGb: drive.capacityGb,
    date: dateStr,
    timestamp: now.getTime(),
    scanMode,
    scanMethodId: methodId,
    scanMethodName: activeMethod?.nameKo || activeMethod?.name,
    totalBlocks: blocks.length,
    goodCount,
    normalCount,
    slowCount,
    criticalCount,
    badCount,
    badLbaList,
    healthScore: calculatedHealth,
    durationSeconds,
    avgLatencyMs: avgLatency,
    maxLatencyMs: maxLatency,
    smartSnapshot: [...drive.smartAttributes],
    recommendation,
    mediaSpecificDiagnosis: mediaDiagnosis
  };
}

export function exportCsvReport(record: SavedScanRecord, badBlocks: SectorBlock[]) {
  const headers = ['Block_ID', 'Start_LBA', 'End_LBA', 'Status', 'Response_Time_ms', 'Error_Code'];
  const rows = badBlocks.map(b => [
    b.id,
    b.lba,
    b.endLba,
    b.status.toUpperCase(),
    b.responseTimeMs,
    `"${b.errorCode || 'N/A'}"`
  ]);

  const csvContent = '\uFEFF' + [
    `# Disk Bad Sector Inspection Report - ${record.driveModel}`,
    `# Scan Date: ${record.date}`,
    `# Serial Number: ${record.driveSerial}`,
    `# Total Bad Sectors: ${record.badCount}`,
    `# Overall Health: ${record.healthScore}%`,
    headers.join(','),
    ...rows.map(r => r.join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `BadSector_Report_${record.driveSerial}_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportJsonReport(record: SavedScanRecord) {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(record, null, 2));
  const link = document.createElement('a');
  link.setAttribute('href', dataStr);
  link.setAttribute('download', `DiskScan_Diagnostic_${record.driveSerial}_${Date.now()}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * OpenTelemetry (OTel) 2026 Standard & Prometheus metric exporter
 */
export function exportOtelMetricsReport(record: SavedScanRecord) {
  const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9_-]/g, '_');
  const driveLabel = `device="${sanitize(record.driveModel)}",serial="${sanitize(record.driveSerial)}"`;

  const lines = [
    '# HELP storage_device_health_score Overall health score of the storage device (0-100)',
    '# TYPE storage_device_health_score gauge',
    `storage_device_health_score{${driveLabel}} ${record.healthScore}`,
    '',
    '# HELP storage_device_bad_sectors_total Total count of physical bad sectors detected',
    '# TYPE storage_device_bad_sectors_total counter',
    `storage_device_bad_sectors_total{${driveLabel}} ${record.badCount}`,
    '',
    '# HELP storage_device_critical_latency_sectors_total Sectors with response time > 500ms',
    '# TYPE storage_device_critical_latency_sectors_total counter',
    `storage_device_critical_latency_sectors_total{${driveLabel}} ${record.criticalCount}`,
    '',
    '# HELP storage_device_slow_sectors_total Sectors with response time between 150ms and 500ms',
    '# TYPE storage_device_slow_sectors_total counter',
    `storage_device_slow_sectors_total{${driveLabel}} ${record.slowCount}`,
    '',
    '# HELP storage_device_avg_latency_ms Average read response latency across surface in milliseconds',
    '# TYPE storage_device_avg_latency_ms gauge',
    `storage_device_avg_latency_ms{${driveLabel}} ${record.avgLatencyMs}`,
    '',
    '# HELP storage_device_max_latency_ms Maximum single block latency in milliseconds',
    '# TYPE storage_device_max_latency_ms gauge',
    `storage_device_max_latency_ms{${driveLabel}} ${record.maxLatencyMs}`,
    ''
  ];

  // Append SMART attributes in OTel metric format
  if (record.smartSnapshot && record.smartSnapshot.length > 0) {
    lines.push(
      '# HELP storage_smart_attribute_value Current normalized SMART attribute value',
      '# TYPE storage_smart_attribute_value gauge'
    );
    record.smartSnapshot.forEach(attr => {
      const attrName = sanitize(attr.name.split(' ')[0]);
      lines.push(`storage_smart_attribute_value{${driveLabel},id="${attr.id}",name="${attrName}"} ${attr.current}`);
    });
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `OTel_Prometheus_Metrics_${record.driveSerial}_${Date.now()}.prom`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
