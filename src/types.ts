export type StatsJson = Record<string, unknown>;

export interface TelemetrySession {
  sessionId: string;
  timestamp: string;
  statsJson: StatsJson;
  subsystems: string[];
  uptimeSeconds?: number;
  sourceLine?: number;
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
