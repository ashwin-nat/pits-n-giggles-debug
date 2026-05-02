import type { StatsJson, TelemetrySession } from '../types';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

const STATS_MARKER = 'Final subsystem stats';
const SQLITE_DB_EXTENSION = /\.(db|sqlite|sqlite3)$/i;
const SQLITE_FILE_HEADER = 'SQLite format 3\u0000';
const decoder = new TextDecoder('utf-8');

type SqlPrimitive = string | number | Uint8Array | null;

interface SqlExecResult {
  columns: string[];
  values: SqlPrimitive[][];
}

interface SqlDatabase {
  exec: (sql: string) => SqlExecResult[];
  close: () => void;
}

interface SqlFactory {
  Database: new (data?: ArrayLike<number> | null) => SqlDatabase;
}

interface PerfSessionRow {
  id?: number;
  timestamp?: string;
  stats?: string;
}

type InitSqlJs = (config?: {
  locateFile?: (fileName: string) => string;
}) => Promise<SqlFactory>;

let sqlFactoryPromise: Promise<SqlFactory> | null = null;

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

const parseVersionFromLine = (line: string): string | undefined => {
  const match = line.match(/Pits n' Giggles\s+(\S+)\s+shutdown complete/);
  return match ? match[1] : undefined;
};

const parseForcedShutdownFromLine = (line: string): boolean | undefined => {
  const match = line.match(/\bforced=(True|False)\b/i);
  if (!match) return undefined;
  return match[1].toLowerCase() === 'true';
};

const normalizeTimestamp = (rawTimestamp: string): string => {
  const raw = rawTimestamp.trim();
  if (!raw) {
    return '';
  }

  const maybeIso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const date = new Date(maybeIso);
  return Number.isNaN(date.valueOf()) ? raw : date.toISOString();
};

const parseTimestampFromLine = (line: string): string => {
  const match = line.match(/^\[([^\]]+)\]/);
  if (!match) {
    return '';
  }
  return normalizeTimestamp(match[1]);
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
  const topLevel = toNumber(statsJson.uptime_seconds);
  if (topLevel !== undefined) {
    return topLevel;
  }

  for (const value of Object.values(statsJson)) {
    if (!isRecord(value)) {
      continue;
    }

    const nested = toNumber(value.uptime_seconds);
    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
};

const buildSession = (
  statsJson: StatsJson,
  sessionNumber: number,
  timestamp: string,
  sourceLine?: number,
  version?: string,
  forcedShutdown?: boolean
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
    version,
    forcedShutdown,
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

const hasSqliteHeader = (bytes: Uint8Array): boolean => {
  if (bytes.length < SQLITE_FILE_HEADER.length) {
    return false;
  }

  const header = decoder.decode(bytes.slice(0, SQLITE_FILE_HEADER.length));
  return header === SQLITE_FILE_HEADER;
};

const shouldParseAsSqlite = (file: File, bytes: Uint8Array): boolean => {
  return SQLITE_DB_EXTENSION.test(file.name) || hasSqliteHeader(bytes);
};

const toStringValue = (value: SqlPrimitive): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Uint8Array) {
    return decoder.decode(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const toIntegerValue = (value: SqlPrimitive): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return undefined;
};

const getSqlFactory = async (): Promise<SqlFactory> => {
  if (!sqlFactoryPromise) {
    sqlFactoryPromise = (async () => {
      const sqlModule = await import('sql.js');
      const initSqlJs = ((sqlModule as { default?: unknown }).default ??
        sqlModule) as InitSqlJs;
      return initSqlJs({
        locateFile: (fileName) =>
          fileName.endsWith('.wasm') ? sqlWasmUrl : fileName,
      });
    })();
  }

  return sqlFactoryPromise;
};

const mapExecResultRows = (result: SqlExecResult | undefined): PerfSessionRow[] => {
  if (!result || result.values.length === 0) {
    return [];
  }

  const idIndex = result.columns.indexOf('id');
  const timestampIndex = result.columns.indexOf('timestamp');
  const statsIndex = result.columns.indexOf('stats');

  return result.values.map((row) => ({
    id: idIndex >= 0 ? toIntegerValue(row[idIndex]) : undefined,
    timestamp:
      timestampIndex >= 0 ? toStringValue(row[timestampIndex]) : undefined,
    stats: statsIndex >= 0 ? toStringValue(row[statsIndex]) : undefined,
  }));
};

const parseSessionsFromSqliteBuffer = async (
  bytes: Uint8Array
): Promise<ParseResult> => {
  const errors: string[] = [];
  const sessions: TelemetrySession[] = [];
  const SQL = await getSqlFactory();
  const db = new SQL.Database(bytes);

  try {
    const tableExistsResult = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='perf_sessions'"
    );
    const tableExists = tableExistsResult[0]?.values.length ?? 0;

    if (tableExists === 0) {
      return {
        sessions: [],
        errors: ['SQLite file is missing required table "perf_sessions".'],
      };
    }

    const rows = mapExecResultRows(
      db.exec(
        'SELECT id, timestamp, stats FROM perf_sessions ORDER BY id ASC'
      )[0]
    );

    rows.forEach((row, rowIndex) => {
      if (!row.stats) {
        errors.push(`DB row ${row.id ?? rowIndex + 1}: missing stats payload.`);
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(row.stats);
      } catch {
        errors.push(
          `DB row ${row.id ?? rowIndex + 1}: failed to parse stats JSON payload.`
        );
        return;
      }

      if (!isRecord(parsed)) {
        errors.push(
          `DB row ${row.id ?? rowIndex + 1}: stats payload is not a JSON object.`
        );
        return;
      }

      const timestamp = row.timestamp
        ? normalizeTimestamp(row.timestamp)
        : new Date().toISOString();

      sessions.push(buildSession(parsed as StatsJson, rowIndex + 1, timestamp));
    });

    if (rows.length === 0 && errors.length === 0) {
      errors.push('No sessions found in table "perf_sessions".');
    }

    return { sessions, errors };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown SQLite parse error.';
    return {
      sessions: [],
      errors: [`Failed to read SQLite file: ${message}`],
    };
  } finally {
    db.close();
  }
};

export interface ParseResult {
  sessions: TelemetrySession[];
  errors: string[];
}

export const parseTelemetryFile = async (file: File): Promise<ParseResult> => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (shouldParseAsSqlite(file, bytes)) {
    return parseSessionsFromSqliteBuffer(bytes);
  }

  const text = decoder.decode(bytes);
  return parseTelemetryInput(text);
};

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
      const version = parseVersionFromLine(line);
      const forcedShutdown = parseForcedShutdownFromLine(line);
      sessions.push(
        buildSession(parsed as StatsJson, sessionNumber, timestamp, lineIndex + 1, version, forcedShutdown)
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
