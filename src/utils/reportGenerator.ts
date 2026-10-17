import { DiskDrive, SavedScanRecord, SectorBlock, SpecializedScanMethodId } from '../types';
import { SCAN_METHOD_DEFINITIONS, generateMediaSpecificDiagnosis } from './scanProfiles';
import { jsPDF } from 'jspdf';

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

/**
 * Enhanced CSV Exporter with complete hardware metadata and UTF-8 BOM
 */
export function exportCsvReport(record: SavedScanRecord, badBlocks: SectorBlock[] = []) {
  const metadataRows = [
    ['=== DiskSentinel Pro 디스크 표면 무결성 진단 보고서 ==='],
    ['보고서 ID (Report ID)', record.id],
    ['검사 일시 (Scan Date)', record.date],
    ['드라이브 모델 (Drive Model)', `"${record.driveModel}"`],
    ['시리얼 번호 (Serial Number)', record.driveSerial],
    ['전체 용량 (Capacity)', `${record.driveCapacityGb} GB`],
    ['검사 모드 (Scan Mode)', record.scanMode === 'quick' ? '빠른 검사 (Quick Scan)' : '정밀 검사 (Full Scan)'],
    ['적용 검사 방식 (Method)', `"${record.scanMethodName || '표준 다이렉트 I/O'}"`],
    ['검사 소요 시간 (Duration)', `${Math.floor(record.durationSeconds / 60)}분 ${Math.floor(record.durationSeconds % 60)}초`],
    ['종합 건강 지수 (Health Score)', `${record.healthScore}%`],
    ['총 블록 수 (Total Blocks)', String(record.totalBlocks)],
    ['정상 블록 (<10ms)', String(record.goodCount)],
    ['일반 블록 (<50ms)', String(record.normalCount)],
    ['지연 블록 (<150ms)', String(record.slowCount)],
    ['위험 지연 블록 (<500ms)', String(record.criticalCount)],
    ['물리/논리 배드섹터 (Bad Sectors)', String(record.badCount)],
    ['평균 응답 지연 (Avg Latency)', `${record.avgLatencyMs} ms`],
    ['최대 응답 지연 (Max Latency)', `${record.maxLatencyMs} ms`],
    ['진단 소견 및 권장 조치', `"${record.recommendation.replace(/"/g, '""')}"`],
    ['공식 배포자', 'AhBiYout (CISNet - https://www.cisnet.co.kr)'],
    []
  ];

  // S.M.A.R.T. Attributes Section
  const smartRows: string[][] = [];
  if (record.smartSnapshot && record.smartSnapshot.length > 0) {
    smartRows.push(['=== S.M.A.R.T. 하드웨어 텔레메트리 스냅샷 ===']);
    smartRows.push(['속성 ID', '속성명', '현재값', '최악값', '임계값', '원시값 (Raw)', '상태']);
    record.smartSnapshot.forEach(attr => {
      smartRows.push([
        String(attr.id),
        `"${attr.name}"`,
        String(attr.current),
        String(attr.worst),
        String(attr.threshold),
        String(attr.raw),
        attr.status.toUpperCase()
      ]);
    });
    smartRows.push([]);
  }

  // Defective Blocks Section
  const blockRows: string[][] = [
    ['=== 검출된 결함 및 배드섹터 목록 ==='],
    ['순번 (No)', '블록 ID (Block ID)', '시작 LBA (Start LBA)', '종료 LBA (End LBA)', '상태 (Status)', '응답 지연 (Latency ms)', '오류 코드 (Error Code)']
  ];

  if (badBlocks.length > 0) {
    badBlocks.forEach((b, idx) => {
      blockRows.push([
        String(idx + 1),
        String(b.id),
        String(b.lba),
        String(b.endLba),
        b.status.toUpperCase(),
        String(b.responseTimeMs),
        `"${b.errorCode || 'N/A'}"`
      ]);
    });
  } else {
    blockRows.push(['-', 'N/A', '-', '-', '배드섹터 없음 (Healthy)', '-', '정상 (OK)']);
  }

  const csvContent = '\uFEFF' + [
    ...metadataRows.map(r => r.join(',')),
    ...smartRows.map(r => r.join(',')),
    ...blockRows.map(r => r.join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeSerial = record.driveSerial.replace(/[^a-zA-Z0-9_-]/g, '_');
  link.setAttribute('download', `DiskSentinel_Report_${safeSerial}_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * High-Resolution PDF Certificate Generator via HTML5 Canvas & jsPDF
 */
export async function exportPdfReport(record: SavedScanRecord, badBlocks: SectorBlock[] = []): Promise<void> {
  const width = 1240;
  const height = 1754; // A4 aspect ratio @ 150 DPI
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Top Accent Header
  const headerGrad = ctx.createLinearGradient(0, 0, width, 0);
  headerGrad.addColorStop(0, '#0F172A');
  headerGrad.addColorStop(1, '#1E1B4B');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, width, 140);

  // Decorative Top Line
  ctx.fillStyle = '#6366F1';
  ctx.fillRect(0, 0, width, 6);

  // Header Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
  ctx.fillText('DiskSentinel Pro - 디스크 표면 정밀 진단 보고서', 50, 60);

  ctx.fillStyle = '#A5B4FC';
  ctx.font = '600 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", monospace';
  ctx.fillText('STORAGE INTEGRITY & BAD SECTOR DIAGNOSTIC CERTIFICATE', 50, 90);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('엔진: DiskSentinel Pro v4.4.0 Native Core | CISNet (AhBiYout)', 50, 115);

  // Certificate ID badge in header
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.roundRect(width - 330, 45, 280, 60, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.stroke();

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
  ctx.fillText('REPORT ID', width - 315, 68);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
  const shortId = record.id.length > 25 ? record.id.substring(0, 25) + '...' : record.id;
  ctx.fillText(shortId, width - 315, 88);

  let currentY = 175;

  // --- Section 1: Hardware Specifications ---
  ctx.fillStyle = '#1E293B';
  ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
  ctx.fillText('1. 하드웨어 기본 사양 및 검사 정보 (Hardware Specifications)', 50, currentY);
  currentY += 15;

  // 4 Specs Boxes
  const boxWidth = 270;
  const boxHeight = 72;
  const specs = [
    { label: '드라이브 모델 (Model)', val: record.driveModel },
    { label: '시리얼 번호 (Serial No)', val: record.driveSerial },
    { label: '전체 용량 (Capacity)', val: `${record.driveCapacityGb} GB` },
    { label: '검사 모드 / 알고리즘', val: `${record.scanMode === 'quick' ? '빠른 검사' : '정밀 검사'} / ${record.scanMethodName || '표준'}` },
  ];

  specs.forEach((item, i) => {
    const x = 50 + i * (boxWidth + 20);
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.roundRect(x, currentY, boxWidth, boxHeight, 8);
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
    ctx.fillText(item.label, x + 16, currentY + 26);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", monospace';
    const textVal = item.val.length > 22 ? item.val.substring(0, 20) + '...' : item.val;
    ctx.fillText(textVal, x + 16, currentY + 52);
  });

  currentY += boxHeight + 35;

  // --- Section 2: Surface Integrity & Health Score ---
  ctx.fillStyle = '#1E293B';
  ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
  ctx.fillText('2. 표면 무결성 진단 지수 및 섹터 통계 (Surface Health & Metrics)', 50, currentY);
  currentY += 15;

  // Big Card Container
  ctx.fillStyle = '#F8FAFC';
  ctx.beginPath();
  ctx.roundRect(50, currentY, 1140, 155, 10);
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.stroke();

  // Left: Health Score Box
  const score = record.healthScore;
  const scoreColor = score >= 80 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444';
  const scoreGrade = score >= 90 ? 'EXCELLENT' : score >= 75 ? 'GOOD' : score >= 50 ? 'WARNING' : 'CRITICAL';
  const scoreGradeKo = score >= 75 ? '정상 / 양호' : score >= 50 ? '주의 요망' : '위험 (교체 권장)';

  ctx.fillStyle = scoreColor;
  ctx.beginPath();
  ctx.roundRect(75, currentY + 20, 210, 115, 10);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('종합 건강 지수', 95, currentY + 46);

  ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
  ctx.fillText(`${score}%`, 95, currentY + 92);

  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`${scoreGrade} (${scoreGradeKo})`, 95, currentY + 118);

  // Right: 5 Sector Stat Cards
  const statBoxW = 155;
  const statBoxH = 115;
  const statStartX = 310;
  const sectorStats = [
    { label: '정상 (<10ms)', count: record.goodCount, color: '#10B981', bg: '#ECFDF5' },
    { label: '일반 (<50ms)', count: record.normalCount, color: '#3B82F6', bg: '#EFF6FF' },
    { label: '지연 (<150ms)', count: record.slowCount, color: '#F59E0B', bg: '#FFFBEB' },
    { label: '위험 (<500ms)', count: record.criticalCount, color: '#F97316', bg: '#FFF7ED' },
    { label: '배드섹터 (Error)', count: record.badCount, color: '#EF4444', bg: '#FEF2F2' },
  ];

  sectorStats.forEach((st, i) => {
    const sx = statStartX + i * (statBoxW + 15);
    ctx.fillStyle = st.bg;
    ctx.beginPath();
    ctx.roundRect(sx, currentY + 20, statBoxW, statBoxH, 8);
    ctx.fill();
    ctx.strokeStyle = st.color + '40';
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
    ctx.fillText(st.label, sx + 12, currentY + 45);

    ctx.fillStyle = st.color;
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
    ctx.fillText(`${st.count}`, sx + 12, currentY + 80);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const pct = record.totalBlocks > 0 ? ((st.count / record.totalBlocks) * 100).toFixed(1) : '0';
    ctx.fillText(`블록 (${pct}%)`, sx + 12, currentY + 105);
  });

  currentY += 155 + 35;

  // --- Section 3: Diagnostic Findings & Recommendations ---
  ctx.fillStyle = '#1E293B';
  ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
  ctx.fillText('3. 종합 정밀 진단 소견 및 권장 조치 가이드 (Diagnostic Advice)', 50, currentY);
  currentY += 15;

  const recBoxBg = record.badCount > 0 ? '#FEF2F2' : record.slowCount > 10 ? '#FFFBEB' : '#F0FDF4';
  const recBoxBorder = record.badCount > 0 ? '#F87171' : record.slowCount > 10 ? '#FCD34D' : '#86EFAC';
  const recBoxText = record.badCount > 0 ? '#991B1B' : record.slowCount > 10 ? '#92400E' : '#166534';

  ctx.fillStyle = recBoxBg;
  ctx.beginPath();
  ctx.roundRect(50, currentY, 1140, 95, 8);
  ctx.fill();
  ctx.strokeStyle = recBoxBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = recBoxText;
  ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
  ctx.fillText('【엔진 공식 진단 소견】', 70, currentY + 30);

  ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
  ctx.fillText(record.recommendation, 70, currentY + 56);

  ctx.fillStyle = '#64748B';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
  ctx.fillText(`검사 일시: ${record.date} | 총 소요 시간: ${Math.floor(record.durationSeconds / 60)}분 ${Math.floor(record.durationSeconds % 60)}초 | 평균 지연: ${record.avgLatencyMs}ms | 최대 지연: ${record.maxLatencyMs}ms`, 70, currentY + 80);

  currentY += 95 + 35;

  // --- Section 4: Defective Sectors Table ---
  ctx.fillStyle = '#1E293B';
  ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
  ctx.fillText('4. 검출된 결함 및 배드섹터 상세 목록 (Defective Blocks List)', 50, currentY);
  currentY += 15;

  if (badBlocks.length === 0) {
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.roundRect(50, currentY, 1140, 65, 8);
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.stroke();

    ctx.fillStyle = '#10B981';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
    ctx.fillText('✓ 검사된 모든 섹터에서 물리적/논리적 배드섹터가 검출되지 않았습니다. (0 Bad Sectors - Healthy Surface)', 75, currentY + 40);
    currentY += 65 + 30;
  } else {
    // Table Header
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(50, currentY, 1140, 36);
    ctx.strokeStyle = '#CBD5E1';
    ctx.strokeRect(50, currentY, 1140, 36);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
    ctx.fillText('순번 (No)', 70, currentY + 23);
    ctx.fillText('블록 ID (Block ID)', 170, currentY + 23);
    ctx.fillText('시작 LBA 주소 (Start LBA)', 360, currentY + 23);
    ctx.fillText('상태 (Status)', 600, currentY + 23);
    ctx.fillText('응답 시간 (Latency)', 770, currentY + 23);
    ctx.fillText('에러 코드 / 하드웨어 상태', 940, currentY + 23);
    currentY += 36;

    // Display up to 7 rows
    const displayBlocks = badBlocks.slice(0, 7);
    displayBlocks.forEach((b, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      ctx.fillRect(50, currentY, 1140, 32);
      ctx.strokeStyle = '#E2E8F0';
      ctx.strokeRect(50, currentY, 1140, 32);

      ctx.fillStyle = '#0F172A';
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
      ctx.fillText(String(idx + 1), 70, currentY + 21);
      ctx.fillText(String(b.id), 170, currentY + 21);
      ctx.fillText(String(b.lba), 360, currentY + 21);

      ctx.fillStyle = b.status === 'bad' ? '#EF4444' : '#F97316';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(b.status.toUpperCase(), 600, currentY + 21);

      ctx.fillStyle = '#475569';
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
      ctx.fillText(`${b.responseTimeMs} ms`, 770, currentY + 21);
      ctx.fillText(b.errorCode || 'UNC (Uncorrectable Error)', 940, currentY + 21);

      currentY += 32;
    });

    if (badBlocks.length > 7) {
      ctx.fillStyle = '#64748B';
      ctx.font = 'italic 12px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
      ctx.fillText(`* 총 ${badBlocks.length}개 결함 중 상위 7개 표시됨 (전체 상세 데이터는 함께 제공되는 CSV 파일에서 확인 가능합니다.)`, 55, currentY + 22);
      currentY += 30;
    } else {
      currentY += 15;
    }
  }

  // --- Section 5: S.M.A.R.T. Key Indicator Strip ---
  ctx.fillStyle = '#1E293B';
  ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
  ctx.fillText('5. S.M.A.R.T. 핵심 하드웨어 텔레메트리 스냅샷 (Critical Attributes)', 50, currentY);
  currentY += 15;

  const smartGridW = 216;
  const smartGridH = 65;
  const smartItems = [
    { name: '재할당 섹터 (0x05)', val: record.smartSnapshot?.find(s => s.id === 5 || s.id === 0x05)?.raw || 0 },
    { name: '보류 중 섹터 (0xC5)', val: record.smartSnapshot?.find(s => s.id === 197 || s.id === 0xC5)?.raw || 0 },
    { name: '복구 불가 오류 (0xBB)', val: record.smartSnapshot?.find(s => s.id === 187 || s.id === 0xBB)?.raw || 0 },
    { name: '총 사용 시간 (POH)', val: `${record.smartSnapshot?.find(s => s.id === 9 || s.id === 0x09)?.raw || 0} hrs` },
    { name: '드라이브 온도 (0xC2)', val: `${record.smartSnapshot?.find(s => s.id === 194 || s.id === 0xC2)?.raw || 32} °C` },
  ];

  smartItems.forEach((it, i) => {
    const x = 50 + i * (smartGridW + 15);
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.roundRect(x, currentY, smartGridW, smartGridH, 6);
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
    ctx.fillText(it.name, x + 12, currentY + 24);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
    ctx.fillText(String(it.val), x + 12, currentY + 48);
  });

  // --- Footer Seal & Certificate Notice ---
  const footerY = height - 85;
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(50, footerY);
  ctx.lineTo(width - 50, footerY);
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
  ctx.fillText('공식 발급 엔진: DiskSentinel Pro Native Core | 소속: CISNet (https://www.cisnet.co.kr) | 개발자: AhBiYout (GitHub: AhBiYout-all)', 50, footerY + 25);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
  ctx.fillText('본 보고서는 Windows Direct I/O 바이패스 하드웨어 텔레메트리 실측 기반으로 생성되었습니다. 공식 기술 블로그: https://ahbiyoutvibe.blogspot.com/', 50, footerY + 45);

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
  ctx.fillText('Page 1 of 1 (OFFICIAL DIAGNOSTIC CERTIFICATE)', width - 360, footerY + 35);

  // Export to jsPDF
  const imgData = canvas.toDataURL('image/png', 0.95);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
  const safeSerial = record.driveSerial.replace(/[^a-zA-Z0-9_-]/g, '_');
  pdf.save(`DiskSentinel_Diagnostic_Report_${safeSerial}_${Date.now()}.pdf`);
}

export function exportJsonReport(record: SavedScanRecord) {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(record, null, 2));
  const link = document.createElement('a');
  link.setAttribute('href', dataStr);
  const safeSerial = record.driveSerial.replace(/[^a-zA-Z0-9_-]/g, '_');
  link.setAttribute('download', `DiskScan_Diagnostic_${safeSerial}_${Date.now()}.json`);
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
