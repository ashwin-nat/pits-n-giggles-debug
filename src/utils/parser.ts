import type { StatsJson, TelemetrySession } from '../types';

const STATS_MARKER = 'Final subsystem stats';

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

const parseTimestampFromLine = (line: string): string => {
  const match = line.match(/^\[([^\]]+)\]/);
  if (!match) {
    return '';
  }
  const raw = match[1].trim();
  const maybeIso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const date = new Date(maybeIso);
  return Number.isNaN(date.valueOf()) ? raw : date.toISOString();
};

const extractJsonObject = (text: string, marker: string): string | null => {
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  const firstBrace = text.indexOf('{', markerIndex + marker.length);
  if (firstBrace === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = firstBrace; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(firstBrace, i + 1);
      }
    }
  }

  return null;
};

const readUptimeSeconds = (statsJson: StatsJson): number | undefined => {
  const direct =
    toNumber(statsJson.uptime_seconds) ??
    toNumber(statsJson.uptimeSeconds) ??
    toNumber(statsJson.duration_seconds) ??
    toNumber(statsJson.durationSeconds);

  if (direct !== undefined) {
    return direct;
  }

  for (const value of Object.values(statsJson)) {
    if (isRecord(value)) {
      const nested =
        toNumber(value.uptime_seconds) ??
        toNumber(value.uptimeSeconds) ??
        toNumber(value.duration_seconds) ??
        toNumber(value.durationSeconds);
      if (nested !== undefined) {
        return nested;
      }
    }
  }

  return undefined;
};

const buildSession = (
  statsJson: StatsJson,
  sessionNumber: number,
  timestamp: string,
  sourceLine?: number
): TelemetrySession => {
  const subsystems = Object.keys(statsJson);
  const normalizedTimestamp =
    timestamp || new Date().toISOString();

  return {
    sessionId: `session-${sessionNumber}`,
    timestamp: normalizedTimestamp,
    statsJson,
    subsystems,
    uptimeSeconds: readUptimeSeconds(statsJson),
    sourceLine,
  };
};

const parseRawJsonFallback = (input: string): TelemetrySession[] => {
  const trimmed = input.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  if (Array.isArray(parsed)) {
    const sessions: TelemetrySession[] = [];
    parsed.forEach((entry, index) => {
      if (!isRecord(entry)) {
        return;
      }

      const statsCandidate = isRecord(entry.stats_json)
        ? (entry.stats_json as StatsJson)
        : (entry as StatsJson);

      const timestamp =
        typeof entry.timestamp === 'string'
          ? entry.timestamp
          : new Date().toISOString();

      sessions.push(buildSession(statsCandidate, index + 1, timestamp));
    });
    return sessions;
  }

  if (isRecord(parsed)) {
    return [buildSession(parsed as StatsJson, 1, new Date().toISOString())];
  }

  return [];
};

export interface ParseResult {
  sessions: TelemetrySession[];
  errors: string[];
}

export const parseTelemetryInput = (input: string): ParseResult => {
  const lines = input.split(/\r?\n/);
  const sessions: TelemetrySession[] = [];
  const errors: string[] = [];

  let sessionNumber = 1;

  lines.forEach((line, lineIndex) => {
    if (!line.includes(STATS_MARKER)) {
      return;
    }

    const jsonText = extractJsonObject(line, STATS_MARKER);
    if (!jsonText) {
      errors.push(
        `Line ${lineIndex + 1}: found marker but could not extract JSON payload.`
      );
      return;
    }

    try {
      const parsed = JSON.parse(jsonText);
      if (!isRecord(parsed)) {
        errors.push(
          `Line ${lineIndex + 1}: stats payload is not a JSON object.`
        );
        return;
      }

      const timestamp = parseTimestampFromLine(line);
      sessions.push(
        buildSession(parsed as StatsJson, sessionNumber, timestamp, lineIndex + 1)
      );
      sessionNumber += 1;
    } catch {
      errors.push(`Line ${lineIndex + 1}: failed to parse stats JSON payload.`);
    }
  });

  if (sessions.length > 0) {
    return { sessions, errors };
  }

  const fallbackSessions = parseRawJsonFallback(input);
  if (fallbackSessions.length > 0) {
    return { sessions: fallbackSessions, errors };
  }

  if (input.trim().length > 0) {
    errors.push(
      `No sessions found. Include lines containing "${STATS_MARKER}" or paste raw JSON stats.`
    );
  }

  return { sessions: [], errors };
};

export const statsMarker = STATS_MARKER;
