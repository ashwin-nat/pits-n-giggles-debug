export type StatsJson = Record<string, unknown>;

export interface TelemetrySession {
  sessionId: string;
  timestamp: string;
  statsJson: StatsJson;
  subsystems: string[];
  uptimeSeconds?: number;
  sourceLine?: number;
}

export type StatNodeKind = 'subsystem' | 'container' | 'metric';

export interface StatMetricValue {
  count: number;
  bytes?: number;
  type?: string;
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
