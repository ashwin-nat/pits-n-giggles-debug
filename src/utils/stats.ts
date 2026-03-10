import type { GroupRow, MetricRow, TelemetrySession } from '../types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const isMetricContainer = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) {
    return false;
  }
  const count = toNumber(value.count);
  const bytes = toNumber(value.bytes);
  return count !== undefined || bytes !== undefined;
};

export const flattenSubsystemMetrics = (
  subsystem: string,
  subsystemData: unknown
): MetricRow[] => {
  if (!isRecord(subsystemData)) {
    return [];
  }

  const rows: MetricRow[] = [];

  const visit = (node: unknown, path: string[]) => {
    if (!isRecord(node)) {
      return;
    }

    if (isMetricContainer(node)) {
      const metricName = path[path.length - 1] ?? subsystem;
      rows.push({
        subsystem,
        groupPath: path.slice(0, -1).join('.'),
        metricName,
        count: toNumber(node.count),
        bytes: toNumber(node.bytes),
        type: typeof node.type === 'string' ? node.type : undefined,
        fullPath: [subsystem, ...path].join('.'),
      });
      return;
    }

    Object.entries(node).forEach(([key, value]) => {
      if (!isRecord(value)) {
        return;
      }
      visit(value, [...path, key]);
    });
  };

  visit(subsystemData, []);
  return rows;
};

export const flattenSessionMetrics = (session: TelemetrySession): MetricRow[] => {
  return session.subsystems.flatMap((subsystem) =>
    flattenSubsystemMetrics(subsystem, session.statsJson[subsystem])
  );
};

const compareGroupPath = (a: string, b: string): number => {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return -1;
  }
  if (b.length === 0) {
    return 1;
  }
  return a.localeCompare(b);
};

export const groupMetrics = (
  subsystem: string,
  metrics: MetricRow[]
): GroupRow[] => {
  const grouped = new Map<string, MetricRow[]>();
  metrics
    .filter((row) => row.subsystem === subsystem)
    .forEach((row) => {
      const key = row.groupPath;
      const existing = grouped.get(key);
      if (existing) {
        existing.push(row);
      } else {
        grouped.set(key, [row]);
      }
    });

  return Array.from(grouped.entries())
    .map(([groupPath, rows]) => ({
      subsystem,
      groupPath,
      metrics: rows,
      metricCount: rows.length,
      totalCount: rows.reduce((sum, row) => sum + (row.count ?? 0), 0),
      totalBytes: rows.reduce((sum, row) => sum + (row.bytes ?? 0), 0),
    }))
    .sort((a, b) => compareGroupPath(a.groupPath, b.groupPath));
};

export const formatNumber = (value?: number): string => {
  if (value === undefined) {
    return '-';
  }
  return value.toLocaleString();
};

export const formatBytes = (value?: number): string => {
  if (value === undefined) {
    return '-';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = value;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current.toFixed(current >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export const formatSeconds = (value?: number): string => {
  if (value === undefined) {
    return '-';
  }
  return `${value.toFixed(1)}s`;
};

export const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return date.toLocaleString();
};
