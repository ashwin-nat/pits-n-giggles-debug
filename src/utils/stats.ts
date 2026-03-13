import type {
  FrameRenderMetricValue,
  GroupRow,
  MetricRow,
  TelemetrySession,
} from '../types';

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

const readNumberField = (
  value: Record<string, unknown>,
  ...keys: string[]
): number | undefined => {
  for (const key of keys) {
    const parsed = toNumber(value[key]);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
};

const readFrameRenderMetric = (
  value: Record<string, unknown>
): FrameRenderMetricValue | undefined => {
  const budget = isRecord(value.budget) ? value.budget : undefined;
  const fps = isRecord(value.fps) ? value.fps : undefined;
  const intervalNs = isRecord(value.interval_ns)
    ? value.interval_ns
    : isRecord(value.intervalNs)
      ? value.intervalNs
      : undefined;
  const pacingErrorNs = isRecord(value.pacing_error_ns)
    ? value.pacing_error_ns
    : isRecord(value.pacingErrorNs)
      ? value.pacingErrorNs
      : undefined;

  const frameRender: FrameRenderMetricValue = {
    budgetMaxMissStreak: budget
      ? readNumberField(budget, 'max_miss_streak', 'maxMissStreak')
      : undefined,
    budgetMissRatio: budget ? readNumberField(budget, 'miss_ratio', 'missRatio') : undefined,
    budgetMissedFrames: budget
      ? readNumberField(budget, 'missed_frames', 'missedFrames')
      : undefined,
    fpsAvg: fps ? readNumberField(fps, 'avg') : undefined,
    fpsMax: fps ? readNumberField(fps, 'max') : undefined,
    fpsMin: fps ? readNumberField(fps, 'min') : undefined,
    fpsTarget: fps ? readNumberField(fps, 'target') : undefined,
    intervalAvgNs: intervalNs ? readNumberField(intervalNs, 'avg') : undefined,
    intervalMaxNs: intervalNs ? readNumberField(intervalNs, 'max') : undefined,
    intervalMinNs: intervalNs ? readNumberField(intervalNs, 'min') : undefined,
    intervalStddevNs: intervalNs ? readNumberField(intervalNs, 'stddev') : undefined,
    intervalVariance: intervalNs ? readNumberField(intervalNs, 'variance') : undefined,
    pacingErrorAvgNs: pacingErrorNs ? readNumberField(pacingErrorNs, 'avg') : undefined,
    pacingErrorMaxNs: pacingErrorNs ? readNumberField(pacingErrorNs, 'max') : undefined,
  };

  return Object.values(frameRender).some((entry) => entry !== undefined)
    ? frameRender
    : undefined;
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
        badLatencyCount: readNumberField(node, 'bad_latency_count', 'badLatencyCount'),
        minNs: readNumberField(node, 'min_ns', 'minNs', 'min'),
        maxNs: readNumberField(node, 'max_ns', 'maxNs', 'max'),
        avgNs: readNumberField(node, 'avg_ns', 'avgNs', 'avg'),
        stddevNs: readNumberField(
          node,
          'stddev_ns',
          'stddevNs',
          'stddev'
        ),
        frameRender: readFrameRenderMetric(node),
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

export const formatMillisecondsFromNanoseconds = (valueNs?: number): string => {
  if (valueNs === undefined) {
    return '-';
  }

  const valueMs = valueNs / 1_000_000;
  return `${valueMs.toLocaleString(undefined, { maximumFractionDigits: 3 })} ms`;
};

export const formatDecimal = (
  value: number | undefined,
  maximumFractionDigits = 3
): string => {
  if (value === undefined) {
    return '-';
  }
  return value.toLocaleString(undefined, { maximumFractionDigits });
};

export const formatPercentFromRatio = (
  value: number | undefined,
  maximumFractionDigits = 2
): string => {
  if (value === undefined) {
    return '-';
  }
  return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits })}%`;
};

export const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return date.toLocaleString();
};
