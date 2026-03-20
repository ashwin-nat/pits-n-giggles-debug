export type StatsJson = Record<string, unknown>;

export interface TelemetrySession {
  sessionId: string;
  timestamp: string;
  statsJson: StatsJson;
  subsystems: string[];
  uptimeSeconds?: number;
  sourceLine?: number;
  version?: string;
  forcedShutdown?: boolean;
}

export type StatNodeKind = 'subsystem' | 'container' | 'metric';

export interface FrameRenderMetricValue {
  budgetMaxMissStreak?: number;
  budgetMissRatio?: number;
  budgetMissedFrames?: number;
  fpsAvg?: number;
  fpsMax?: number;
  fpsMin?: number;
  fpsTarget?: number;
  intervalAvgNs?: number;
  intervalMaxNs?: number;
  intervalMinNs?: number;
  intervalStddevNs?: number;
  intervalVariance?: number;
  pacingErrorAvgNs?: number;
  pacingErrorMaxNs?: number;
}

export interface StatMetricValue {
  count: number;
  bytes?: number;
  type?: string;
  badLatencyCount?: number;
  minNs?: number;
  maxNs?: number;
  avgNs?: number;
  stddevNs?: number;
  frameRender?: FrameRenderMetricValue;
}

export interface StatTreeNode {
  id: string;
  pathKey: string;
  name: string;
  segments: string[];
  path: string;
  kind: StatNodeKind;
  metric?: StatMetricValue;
  children?: StatTreeNode[];
}

export interface MetricRow {
  subsystem: string;
  groupPath: string;
  metricName: string;
  count?: number;
  bytes?: number;
  type?: string;
  badLatencyCount?: number;
  minNs?: number;
  maxNs?: number;
  avgNs?: number;
  stddevNs?: number;
  frameRender?: FrameRenderMetricValue;
  fullPath: string;
}

export interface GroupRow {
  subsystem: string;
  groupPath: string;
  metrics: MetricRow[];
  metricCount: number;
  totalCount: number;
  totalBytes: number;
}
