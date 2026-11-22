import React, { useMemo, useState } from 'react';
import { AppLocale, DiskDrive } from '../types';
import { t } from '../utils/i18n';
import { downloadFleetCsv, downloadFleetJson } from '../utils/scanDiff';
import { detectUsbPortBottleneck, resolveDriveUsbTopology } from '../utils/usbScanMatrix';
import {
  Activity,
  AlertTriangle,
  Cpu,
  Download,
  FileJson,
  HardDrive,
  Layers,
  Play,
  Printer,
  RefreshCw,
  Search,
  Usb,
  ArrowUpDown
} from 'lucide-react';

interface FleetOverviewDashboardProps {
  drives: DiskDrive[];
  selectedDriveId: string;
  locale: AppLocale;
  isRescanning?: boolean;
  onRescanDrives: () => Promise<void>;
  onSelectDriveForScan: (driveId: string) => void;
  onOpenHardwareDetails: (driveId: string) => void;
  onOpenUsbMatrix: (driveId: string) => void;
  onBatchQuickAudit: (driveIds: string[]) => void;
  onOpenParallelScan?: () => void;
}

type FleetFilter = 'all' | 'internal' | 'external' | 'alerts';
type FleetSortKey = 'model' | 'health' | 'temp' | 'poh' | 'capacity' | 'errors';

function parseAttrRawCount(drive: DiskDrive, id: number): number {
  const attr = drive.smartAttributes.find(a => a.id === id);
  if (!attr) return 0;
  const token = String(attr.raw || '').trim().split(/[\s(/,:]+/)[0] || '';
  if (/^0x[0-9a-f]+$/i.test(token)) return parseInt(token, 16) || 0;
  if (/^\d+$/.test(token)) return parseInt(token, 10) || 0;
  return 0;
}

function isDriveDowngraded(drive: DiskDrive): { downgraded: boolean; reason?: string } {
  const lp = drive.hardwareSpecs?.linkProbe;
  if (lp?.isLinkDowngraded) {
    return {
      downgraded: true,
      reason: `${lp.currentSpeedLabel || lp.linkType} < Max ${lp.maxSpeedLabel || ''}`
    };
  }
  const usbTopo = resolveDriveUsbTopology(drive);
  if (usbTopo) {
    const bottleneck = detectUsbPortBottleneck(drive, usbTopo);
    if (bottleneck) {
      return { downgraded: true, reason: bottleneck };
    }
  }
  return { downgraded: false };
}

function isDriveAlert(drive: DiskDrive): boolean {
  const reallocated = parseAttrRawCount(drive, 0x05);
  const pending = parseAttrRawCount(drive, 0xc5);
  const uncorr = parseAttrRawCount(drive, 0xc6);
  const hasCriticalSmart = drive.smartAttributes.some(a => a.status === 'critical' || a.status === 'warning');
  const lowHealth = drive.healthScore !== null && drive.healthScore < 80;
  const hot = drive.temperatureC !== null && drive.temperatureC >= 55;
  const linkWarn = isDriveDowngraded(drive).downgraded;
  return reallocated > 0 || pending > 0 || uncorr > 0 || hasCriticalSmart || lowHealth || hot || linkWarn;
}

export const FleetOverviewDashboard: React.FC<FleetOverviewDashboardProps> = ({
  drives,
  selectedDriveId,
  locale,
  isRescanning = false,
  onRescanDrives,
  onSelectDriveForScan,
  onOpenHardwareDetails,
  onOpenUsbMatrix,
  onBatchQuickAudit,
  onOpenParallelScan
}) => {
  const [filter, setFilter] = useState<FleetFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortKey, setSortKey] = useState<FleetSortKey>('health');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const summary = useMemo(() => {
    const internalCount = drives.filter(d => !d.isExternal).length;
    const externalCount = drives.filter(d => Boolean(d.isExternal)).length;
    const alertCount = drives.filter(isDriveAlert).length;
    const downgradedCount = drives.filter(d => isDriveDowngraded(d).downgraded).length;
    return {
      total: drives.length,
      internalCount,
      externalCount,
      alertCount,
      downgradedCount
    };
  }, [drives]);

  const filteredDrives = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = drives.filter(d => {
      if (filter === 'internal' && d.isExternal) return false;
      if (filter === 'external' && !d.isExternal) return false;
      if (filter === 'alerts' && !isDriveAlert(d)) return false;
      if (!q) return true;
      return (
        d.model.toLowerCase().includes(q) ||
        d.serialNumber.toLowerCase().includes(q) ||
        (d.mountPoint || '').toLowerCase().includes(q) ||
        (d.hardwareSpecs?.busInterfaceSpeed || d.interface).toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'model') {
        cmp = a.model.localeCompare(b.model);
      } else if (sortKey === 'health') {
        cmp = (a.healthScore ?? 999) - (b.healthScore ?? 999);
      } else if (sortKey === 'temp') {
        cmp = (b.temperatureC ?? -1) - (a.temperatureC ?? -1);
      } else if (sortKey === 'poh') {
        cmp = (b.powerOnHours ?? -1) - (a.powerOnHours ?? -1);
      } else if (sortKey === 'capacity') {
        cmp = (b.capacityGb ?? -1) - (a.capacityGb ?? -1);
      } else if (sortKey === 'errors') {
        const errA = parseAttrRawCount(a, 0x05) + parseAttrRawCount(a, 0xc5) + parseAttrRawCount(a, 0xc6);
        const errB = parseAttrRawCount(b, 0x05) + parseAttrRawCount(b, 0xc5) + parseAttrRawCount(b, 0xc6);
        cmp = errB - errA;
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [drives, filter, searchQuery, sortKey, sortAsc]);

  const toggleSort = (nextKey: FleetSortKey) => {
    if (sortKey === nextKey) {
      setSortAsc(prev => !prev);
    } else {
      setSortKey(nextKey);
      setSortAsc(nextKey === 'model' || nextKey === 'health');
    }
  };

  const toggleChecked = (driveId: string) => {
    setCheckedIds(prev =>
      prev.includes(driveId) ? prev.filter(id => id !== driveId) : [...prev, driveId]
    );
  };

  const targetAuditIds =
    checkedIds.length > 0
      ? checkedIds.filter(id => drives.some(d => d.id === id))
      : filteredDrives.map(d => d.id);

  const handleExportCsv = () => {
    const file = downloadFleetCsv(filteredDrives);
    setExportNotice(locale === 'en' ? `Saved ${file}` : `${file} 저장 완료`);
    setTimeout(() => setExportNotice(null), 3000);
  };

  const handleExportJson = () => {
    const file = downloadFleetJson(filteredDrives);
    setExportNotice(locale === 'en' ? `Saved ${file}` : `${file} 저장 완료`);
    setTimeout(() => setExportNotice(null), 3000);
  };

  return (
    <div className="space-y-3">
      {/* Top Action & Header Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 sm:p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>{t(locale, 'fleet.title')}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(locale, 'fleet.subtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void onRescanDrives()}
              disabled={isRescanning}
              className="min-h-[40px] px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
              <span>{t(locale, 'nav.rescan')}</span>
            </button>

            <button
              type="button"
              onClick={() => onBatchQuickAudit(targetAuditIds)}
              disabled={targetAuditIds.length === 0}
              className="min-h-[40px] px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>
                {t(locale, 'fleet.batchAudit')} ({targetAuditIds.length})
              </span>
            </button>

            {onOpenParallelScan && drives.length > 1 && (
              <button
                type="button"
                onClick={onOpenParallelScan}
                className="min-h-[40px] px-3 py-2 rounded-md border border-orange-500/40 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/40 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>{locale === 'en' ? 'Parallel Scan' : 'Rayon 병렬 검사'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredDrives.length === 0}
              className="min-h-[40px] px-2.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5 text-emerald-500" />
              <span>{t(locale, 'fleet.exportCsv')}</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              disabled={filteredDrives.length === 0}
              className="min-h-[40px] px-2.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
            >
              <FileJson className="w-3.5 h-3.5 text-sky-500" />
              <span>{t(locale, 'fleet.exportJson')}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              disabled={filteredDrives.length === 0}
              className="min-h-[40px] px-2.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer print:hidden disabled:opacity-40"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>{t(locale, 'fleet.print')}</span>
            </button>
          </div>
        </div>

        {exportNotice && (
          <div className="mt-2.5 px-3 py-1.5 rounded border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-xs font-mono text-emerald-700 dark:text-emerald-300">
            {exportNotice}
          </div>
        )}

        {/* Single-Elevation Hairline KPI Strip */}
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 border border-slate-200 dark:border-slate-800 rounded-md divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
          <div className="p-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {t(locale, 'fleet.totalDrives')}
            </div>
            <div className="mt-0.5 text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {summary.total}
            </div>
          </div>
          <div className="p-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {t(locale, 'fleet.externalDrives')}
            </div>
            <div className="mt-0.5 text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {summary.internalCount} <span className="text-xs font-normal text-slate-400">/</span> {summary.externalCount}
            </div>
          </div>
          <div className="p-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {t(locale, 'fleet.alertDrives')}
            </div>
            <div
              className={`mt-0.5 text-lg font-mono font-bold tabular-nums ${
                summary.alertCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {summary.alertCount}
            </div>
          </div>
          <div className="p-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {t(locale, 'fleet.downgradedLinks')}
            </div>
            <div
              className={`mt-0.5 text-lg font-mono font-bold tabular-nums ${
                summary.downgradedCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {summary.downgradedCount}
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar + Fleet Comparison Matrix Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/50 dark:bg-slate-950/40">
          <div className="inline-flex border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden text-xs">
            {(
              [
                { id: 'all', label: locale === 'en' ? `All (${drives.length})` : `전체 (${drives.length})` },
                { id: 'internal', label: locale === 'en' ? `Internal (${summary.internalCount})` : `내장 (${summary.internalCount})` },
                { id: 'external', label: locale === 'en' ? `External (${summary.externalCount})` : `외장/USB (${summary.externalCount})` },
                { id: 'alerts', label: locale === 'en' ? `Alerts (${summary.alertCount})` : `주의·경고 (${summary.alertCount})` }
              ] as const
            ).map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`min-h-[36px] px-3 py-1.5 font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  filter === item.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={locale === 'en' ? 'Filter model, serial, mount, bus...' : '모델명, 시리얼, 마운트, 버스 검색...'}
              className="w-full min-h-[36px] pl-8 pr-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>
        </div>

        {drives.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
            <HardDrive className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="font-medium text-slate-700 dark:text-slate-300">{t(locale, 'fleet.empty')}</p>
          </div>
        ) : filteredDrives.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            {locale === 'en' ? 'No drives match the active filter.' : '검색 및 필터 조건에 맞는 드라이브가 없습니다.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-950 text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-3 py-2.5 w-8">
                    <input
                      type="checkbox"
                      aria-label={locale === 'en' ? 'Select all visible drives' : '표시된 드라이브 전체 선택'}
                      checked={filteredDrives.length > 0 && filteredDrives.every(d => checkedIds.includes(d.id))}
                      onChange={e => {
                        if (e.target.checked) {
                          setCheckedIds(filteredDrives.map(d => d.id));
                        } else {
                          setCheckedIds([]);
                        }
                      }}
                      className="rounded border-slate-300 dark:border-slate-700 cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggleSort('model')}
                      className="inline-flex items-center gap-1 font-semibold hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      <span>{locale === 'en' ? 'Drive & Mount' : '드라이브 & 볼륨'}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5">{locale === 'en' ? 'Negotiated Link / Controller' : '링크 속도 & 컨트롤러'}</th>
                  <th className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('capacity')}
                      className="inline-flex items-center gap-1 font-semibold hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      <span>{locale === 'en' ? 'Capacity / Used' : '용량 / 사용량'}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('health')}
                      className="inline-flex items-center gap-1 font-semibold hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      <span>{locale === 'en' ? 'Health' : '건강도'}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('temp')}
                      className="inline-flex items-center gap-1 font-semibold hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      <span>{locale === 'en' ? 'Temp' : '온도'}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('poh')}
                      className="inline-flex items-center gap-1 font-semibold hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      <span>POH</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('errors')}
                      className="inline-flex items-center gap-1 font-semibold hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      <span>05h / C5h</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-right">{locale === 'en' ? 'Actions' : '작업'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredDrives.map(drive => {
                  const isSelected = drive.id === selectedDriveId;
                  const linkWarn = isDriveDowngraded(drive);
                  const reallocated = parseAttrRawCount(drive, 0x05);
                  const pending = parseAttrRawCount(drive, 0xc5);
                  const smartErrSum = reallocated + pending;
                  const controllerText =
                    drive.hardwareSpecs?.linkProbe?.controllerName ||
                    drive.bridgeChipset ||
                    drive.hardwareSpecs?.controllerVendor ||
                    'N/A';

                  return (
                    <tr
                      key={drive.id}
                      className={`hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 align-middle">
                        <input
                          type="checkbox"
                          checked={checkedIds.includes(drive.id)}
                          onChange={() => toggleChecked(drive.id)}
                          aria-label={`${drive.model} 선택`}
                          className="rounded border-slate-300 dark:border-slate-700 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2.5 align-middle max-w-[260px]">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {drive.isExternal ? (
                            <Usb className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                          ) : (
                            <HardDrive className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          )}
                          <span className="truncate" title={drive.model}>
                            {drive.model}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {drive.mountPoint || 'Raw'} · S/N {drive.serialNumber}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-middle max-w-[260px]">
                        <div className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">
                            {drive.hardwareSpecs?.busInterfaceSpeed || drive.interface}
                          </span>
                          {linkWarn.downgraded && (
                            <span
                              title={linkWarn.reason}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                            >
                              <AlertTriangle className="w-2.5 h-2.5" />
                              <span>LINK DOWNGRADE</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate" title={controllerText}>
                          {controllerText}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-middle text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {drive.capacityGb !== null ? `${drive.capacityGb} GB` : 'N/A'}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {drive.usedPercentage !== null && drive.usedPercentage !== undefined
                            ? `${drive.usedPercentage}% used`
                            : 'Raw / N/A'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-middle text-right font-mono tabular-nums font-bold whitespace-nowrap">
                        <span
                          className={
                            drive.healthScore === null
                              ? 'text-slate-400'
                              : drive.healthScore >= 85
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : drive.healthScore >= 60
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {drive.healthScore !== null ? `${drive.healthScore}%` : 'N/A'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle text-right font-mono tabular-nums font-semibold whitespace-nowrap">
                        <span
                          className={
                            drive.temperatureC === null
                              ? 'text-slate-400'
                              : drive.temperatureC >= 55
                              ? 'text-red-600 dark:text-red-400 font-bold'
                              : drive.temperatureC >= 48
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-800 dark:text-slate-200'
                          }
                        >
                          {drive.temperatureC !== null ? `${drive.temperatureC}°C` : 'N/A'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {drive.powerOnHours !== null ? `${drive.powerOnHours.toLocaleString()}h` : 'N/A'}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-right font-mono tabular-nums whitespace-nowrap">
                        {drive.smartAttributes.length === 0 ? (
                          <span className="text-slate-400">N/A</span>
                        ) : (
                          <span className={smartErrSum > 0 ? 'text-red-600 dark:text-red-400 font-bold' : 'text-slate-700 dark:text-slate-300'}>
                            {reallocated} / {pending}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onSelectDriveForScan(drive.id)}
                            className="min-h-[32px] px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer"
                          >
                            {locale === 'en' ? 'Scan' : '검사'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenHardwareDetails(drive.id)}
                            className="min-h-[32px] px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            title={locale === 'en' ? 'Hardware specs' : '하드웨어 상세 스펙'}
                          >
                            <Cpu className="w-3 h-3" />
                            <span>{locale === 'en' ? 'Specs' : '스펙'}</span>
                          </button>
                          {drive.isExternal && (
                            <button
                              type="button"
                              onClick={() => onOpenUsbMatrix(drive.id)}
                              className="min-h-[32px] px-2 py-1 rounded border border-sky-500/40 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/30 text-[11px] font-semibold cursor-pointer"
                            >
                              USB
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
