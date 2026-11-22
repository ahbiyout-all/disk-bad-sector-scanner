import { DiskDrive, SavedScanRecord, ScanSmartDiffRow } from '../types';
import { parseSmartAttributeNumericRaw } from './smartThresholds';

const STATUS_SEVERITY: Record<'good' | 'warning' | 'critical', number> = {
  good: 0,
  warning: 1,
  critical: 2
};

export function computeSmartSnapshotDiff(
  scanA: SavedScanRecord,
  scanB: SavedScanRecord
): ScanSmartDiffRow[] {
  const mapA = new Map(scanA.smartSnapshot.map(a => [a.id, a] as const));
  const mapB = new Map(scanB.smartSnapshot.map(b => [b.id, b] as const));
  const allIds = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort((x, y) => x - y);

  const rows: ScanSmartDiffRow[] = [];
  for (const id of allIds) {
    const a = mapA.get(id);
    const b = mapB.get(id);
    const numA = a ? parseSmartAttributeNumericRaw(a) : null;
    const numB = b ? parseSmartAttributeNumericRaw(b) : null;
    const rawDelta = numA !== null && numB !== null ? numB - numA : null;
    const curA = a ? a.current : null;
    const curB = b ? b.current : null;
    const currentDelta = curA !== null && curB !== null ? curB - curA : null;
    const stA = a?.status ?? null;
    const stB = b?.status ?? null;
    const worsened = Boolean(
      stA && stB && STATUS_SEVERITY[stB] > STATUS_SEVERITY[stA]
    );
    const improved = Boolean(
      stA && stB && STATUS_SEVERITY[stB] < STATUS_SEVERITY[stA]
    );

    rows.push({
      attributeId: id,
      attributeName: b?.name || a?.name || `Attribute 0x${id.toString(16).toUpperCase()}`,
      rawA: a?.raw ?? null,
      rawB: b?.raw ?? null,
      numericRawA: numA,
      numericRawB: numB,
      rawDelta,
      currentA: curA,
      currentB: curB,
      currentDelta,
      statusA: stA,
      statusB: stB,
      worsened,
      improved
    });
  }

  return rows;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let raw = String(value);
  if (/^[=+\-@\t\r]/.test(raw)) {
    raw = `'${raw}`;
  }
  const str = raw.replace(/"/g, '""');
  return `"${str}"`;
}

export function buildFleetCsvContent(drives: DiskDrive[]): string {
  const headers = [
    'Model',
    'Serial',
    'Bus',
    'Location',
    'LinkSpeed',
    'LinkDowngraded',
    'CapacityGB',
    'UsedPct',
    'HealthPct',
    'TempC',
    'PowerOnHours',
    'Smart05Raw',
    'SmartC5Raw',
    'MountPoint'
  ];

  const getAttrRaw = (drive: DiskDrive, id: number): string => {
    const hit = drive.smartAttributes.find(a => a.id === id);
    return hit ? hit.raw : 'N/A';
  };

  const rows = drives.map(d =>
    [
      escapeCsvCell(d.model),
      escapeCsvCell(d.serialNumber),
      escapeCsvCell(d.hardwareSpecs?.busType || d.type),
      escapeCsvCell(d.isExternal ? 'External' : 'Internal'),
      escapeCsvCell(d.hardwareSpecs?.busInterfaceSpeed || d.interface),
      escapeCsvCell(
        d.hardwareSpecs?.linkProbe?.isLinkDowngraded === true
          ? 'DOWNGRADED'
          : d.hardwareSpecs?.linkProbe?.isLinkDowngraded === false
          ? 'OK'
          : 'N/A'
      ),
      d.capacityGb !== null ? d.capacityGb : 'N/A',
      d.usedPercentage !== null && d.usedPercentage !== undefined ? d.usedPercentage : 'N/A',
      d.healthScore !== null ? d.healthScore : 'N/A',
      d.temperatureC !== null ? d.temperatureC : 'N/A',
      d.powerOnHours !== null ? d.powerOnHours : 'N/A',
      escapeCsvCell(getAttrRaw(d, 0x05)),
      escapeCsvCell(getAttrRaw(d, 0xc5)),
      escapeCsvCell(d.mountPoint || '')
    ].join(',')
  );

  return '\uFEFF' + [headers.join(','), ...rows].join('\n');
}

export function downloadFleetCsv(drives: DiskDrive[]): string {
  const csv = buildFleetCsvContent(drives);
  const filename = `disksentinel_fleet_report_${new Date().toISOString().slice(0, 10)}.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return filename;
}

export function downloadFleetJson(drives: DiskDrive[]): string {
  const filename = `disksentinel_fleet_report_${new Date().toISOString().slice(0, 10)}.json`;
  const payload = {
    exportedAt: new Date().toISOString(),
    totalDrives: drives.length,
    drives: drives.map(d => ({
      id: d.id,
      model: d.model,
      serialNumber: d.serialNumber,
      busType: d.hardwareSpecs?.busType || d.type,
      isExternal: Boolean(d.isExternal),
      capacityGb: d.capacityGb,
      healthScore: d.healthScore,
      temperatureC: d.temperatureC,
      powerOnHours: d.powerOnHours,
      usedPercentage: d.usedPercentage ?? null,
      busInterfaceSpeed: d.hardwareSpecs?.busInterfaceSpeed || d.interface,
      linkProbe: d.hardwareSpecs?.linkProbe ?? null,
      smartAttributes: d.smartAttributes
    }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return filename;
}
