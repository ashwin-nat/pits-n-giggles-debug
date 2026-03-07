import {
  type ChangeEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './components/DataTable';
import type { GroupRow, MetricRow, TelemetrySession } from './types';
import { parseTelemetryInput, statsMarker } from './utils/parser';
import {
  flattenSessionMetrics,
  flattenSubsystemMetrics,
  formatNumber,
  formatSeconds,
  formatTimestamp,
  groupMetrics,
} from './utils/stats';

type View = 'input' | 'sessions' | 'explorer';

interface SessionListRow extends TelemetrySession {
  index: number;
}

const groupLabel = (value: string): string => value || '(root)';

function App() {
  const [activeView, setActiveView] = useState<View>('input');
  const [inputText, setInputText] = useState('');
  const [sessions, setSessions] = useState<TelemetrySession[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [selectedSubsystem, setSelectedSubsystem] = useState<string>('');
  const [selectedGroupPath, setSelectedGroupPath] = useState<string>('');
  const [showRawJson, setShowRawJson] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sessionRows = useMemo<SessionListRow[]>(
    () => sessions.map((session, index) => ({ ...session, index: index + 1 })),
    [sessions]
  );

  const selectedSession = useMemo(
    () => sessions.find((session) => session.sessionId === selectedSessionId),
    [sessions, selectedSessionId]
  );

  const allSessionMetrics = useMemo<MetricRow[]>(() => {
    if (!selectedSession) {
      return [];
    }
    return flattenSessionMetrics(selectedSession);
  }, [selectedSession]);

  const subsystemMetrics = useMemo<MetricRow[]>(() => {
    if (!selectedSession || !selectedSubsystem) {
      return [];
    }
    return flattenSubsystemMetrics(
      selectedSubsystem,
      selectedSession.statsJson[selectedSubsystem]
    );
  }, [selectedSession, selectedSubsystem]);

  const groups = useMemo<GroupRow[]>(() => {
    if (!selectedSubsystem) {
      return [];
    }
    return groupMetrics(selectedSubsystem, subsystemMetrics);
  }, [selectedSubsystem, subsystemMetrics]);

  const resolvedGroupPath = useMemo(() => {
    if (groups.length === 0) {
      return '';
    }

    if (!selectedGroupPath) {
      return groups[0].groupPath;
    }

    const hasValidSelection = groups.some(
      (group) =>
        group.groupPath === selectedGroupPath ||
        group.groupPath.startsWith(`${selectedGroupPath}.`)
    );

    return hasValidSelection ? selectedGroupPath : groups[0].groupPath;
  }, [groups, selectedGroupPath]);

  const visibleGroups = useMemo(() => {
    if (!resolvedGroupPath) {
      return groups;
    }
    return groups.filter(
      (group) =>
        group.groupPath === resolvedGroupPath ||
        group.groupPath.startsWith(`${resolvedGroupPath}.`)
    );
  }, [groups, resolvedGroupPath]);

  const selectedGroup = useMemo(() => {
    if (visibleGroups.length === 0) {
      return undefined;
    }
    const exact = visibleGroups.find(
      (group) => group.groupPath === resolvedGroupPath
    );
    return exact ?? visibleGroups[0];
  }, [resolvedGroupPath, visibleGroups]);

  const totalGroupCount = useMemo(() => {
    const keys = new Set(
      allSessionMetrics.map((metric) => `${metric.subsystem}:${metric.groupPath}`)
    );
    return keys.size;
  }, [allSessionMetrics]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      const text = await file.text();
      setInputText(text);
      setActiveView('input');
      setErrors([]);
      event.target.value = '';
    },
    []
  );

  const openSession = useCallback(
    (sessionId: string) => {
      const session = sessions.find((item) => item.sessionId === sessionId);
      setSelectedSessionId(sessionId);
      setSelectedSubsystem(session?.subsystems[0] ?? '');
      setSelectedGroupPath('');
      setShowRawJson(false);
      setActiveView('explorer');
    },
    [sessions]
  );

  const handleParseSessions = useCallback(() => {
    const result = parseTelemetryInput(inputText);
    setErrors(result.errors);
    setSessions(result.sessions);

    if (result.sessions.length > 0) {
      setSelectedSessionId(result.sessions[0].sessionId);
      setSelectedSubsystem(result.sessions[0].subsystems[0] ?? '');
      setSelectedGroupPath('');
      setShowRawJson(false);
      setActiveView('sessions');
    }
  }, [inputText]);

  const sessionColumns = useMemo<ColumnDef<SessionListRow>[]>(
    () => [
      {
        accessorKey: 'index',
        header: '#',
        size: 50,
      },
      {
        accessorKey: 'timestamp',
        header: 'Timestamp',
        cell: ({ row }) => formatTimestamp(row.original.timestamp),
        size: 250,
      },
      {
        accessorKey: 'subsystems',
        header: 'Subsystems',
        cell: ({ row }) => row.original.subsystems.join(', '),
        size: 320,
      },
      {
        accessorKey: 'uptimeSeconds',
        header: 'Duration',
        cell: ({ row }) => formatSeconds(row.original.uptimeSeconds),
        size: 120,
      },
      {
        id: 'view',
        header: '',
        size: 100,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => openSession(row.original.sessionId)}
            className="rounded border border-accent px-2 py-1 text-xs font-medium text-accent hover:bg-accent hover:text-black"
          >
            View
          </button>
        ),
      },
    ],
    [openSession]
  );

  const groupColumns = useMemo<ColumnDef<GroupRow>[]>(
    () => [
      {
        accessorKey: 'groupPath',
        header: 'Group',
        cell: ({ row }) => groupLabel(row.original.groupPath),
        size: 380,
      },
      {
        accessorKey: 'metricCount',
        header: 'Metrics',
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {formatNumber(row.original.metricCount)}
          </span>
        ),
        size: 100,
      },
      {
        accessorKey: 'totalCount',
        header: 'Total Count',
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {formatNumber(row.original.totalCount)}
          </span>
        ),
        size: 140,
      },
      {
        accessorKey: 'totalBytes',
        header: 'Total Bytes',
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {formatNumber(row.original.totalBytes)}
          </span>
        ),
        size: 140,
      },
      {
        id: 'inspect',
        header: '',
        size: 100,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setSelectedGroupPath(row.original.groupPath)}
            className="rounded border border-border px-2 py-1 text-xs hover:border-accent hover:text-accent"
          >
            Inspect
          </button>
        ),
      },
    ],
    []
  );

  const metricColumns = useMemo<ColumnDef<MetricRow>[]>(
    () => [
      {
        accessorKey: 'metricName',
        header: 'Metric',
        size: 220,
      },
      {
        accessorKey: 'count',
        header: 'Count',
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {formatNumber(row.original.count)}
          </span>
        ),
        size: 110,
      },
      {
        accessorKey: 'bytes',
        header: 'Bytes',
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {formatNumber(row.original.bytes)}
          </span>
        ),
        size: 120,
      },
      {
        id: 'avgBytes',
        header: 'Avg Bytes',
        size: 120,
        cell: ({ row }) => {
          const { bytes, count } = row.original;
          if (bytes === undefined || count === undefined || count === 0) {
            return <span className="block text-right tabular-nums">-</span>;
          }
          return (
            <span className="block text-right tabular-nums">
              {formatNumber(Math.round(bytes / count))}
            </span>
          );
        },
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => row.original.type ?? '-',
        size: 100,
      },
      {
        accessorKey: 'fullPath',
        header: 'Full Path',
        size: 420,
      },
    ],
    []
  );

  const breadcrumbs = useMemo(() => {
    if (!resolvedGroupPath) {
      return [];
    }
    return resolvedGroupPath.split('.').filter(Boolean);
  }, [resolvedGroupPath]);

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 md:px-6">
        <header className="mb-6 rounded-md border border-border bg-card px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-wide">
                Pits n&apos; Giggles - Stats Viewer
              </h1>
              <p className="text-sm text-muted">
                Inspect telemetry statistics captured in Pits n&apos; Giggles logs
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUploadClick}
                className="rounded border border-border bg-bg px-3 py-2 text-sm hover:border-accent hover:text-accent"
              >
                Upload Log
              </button>
              <button
                type="button"
                onClick={() => setActiveView('input')}
                className="rounded border border-border bg-bg px-3 py-2 text-sm hover:border-accent hover:text-accent"
              >
                Paste Logs
              </button>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="rounded border border-border px-3 py-2 text-sm text-muted hover:border-accent hover:text-accent"
              >
                GitHub
              </a>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".log,.txt,.json"
            onChange={handleFileChange}
            className="hidden"
          />
        </header>

        <main className="flex-1 space-y-4">
          {activeView === 'input' && (
            <section className="rounded-md border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Input</h2>
                  <p className="text-xs text-muted">
                    Paste logs containing "{statsMarker}" or raw JSON stats.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleParseSessions}
                  className="rounded border border-accent bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={inputText.trim().length === 0}
                >
                  Parse Sessions
                </button>
              </div>
              <textarea
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                placeholder={`[2026-03-07 15:18:07.853] [INFO] ... ${statsMarker}: {...}`}
                className="h-[360px] w-full resize-y rounded border border-border bg-bg p-3 text-sm text-text outline-none focus:border-accent"
              />
              {errors.length > 0 && (
                <div className="mt-3 rounded border border-red-700/80 bg-red-900/20 p-3 text-xs text-red-200">
                  {errors.map((error) => (
                    <div key={error}>{error}</div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeView === 'sessions' && (
            <section className="rounded-md border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Session List</h2>
                  <p className="text-xs text-muted">
                    {sessions.length} detected session(s)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveView('input')}
                  className="rounded border border-border px-3 py-2 text-sm hover:border-accent hover:text-accent"
                >
                  Back to Input
                </button>
              </div>
              <DataTable
                data={sessionRows}
                columns={sessionColumns}
                emptyMessage="No sessions found yet."
                filterPlaceholder="Filter sessions by timestamp or subsystem..."
                pageSize={8}
              />
            </section>
          )}

          {activeView === 'explorer' && selectedSession && (
            <section className="space-y-4">
              <div className="rounded-md border border-border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <button
                    type="button"
                    onClick={() => setActiveView('sessions')}
                    className="rounded border border-border px-2 py-1 hover:border-accent hover:text-accent"
                  >
                    Sessions
                  </button>
                  <span>&gt;</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGroupPath('');
                      setActiveView('explorer');
                    }}
                    className="rounded border border-border px-2 py-1 hover:border-accent hover:text-accent"
                  >
                    Session {sessionRows.findIndex((row) => row.sessionId === selectedSession.sessionId) + 1}
                  </button>
                  {selectedSubsystem && (
                    <>
                      <span>&gt;</span>
                      <button
                        type="button"
                        onClick={() => setSelectedGroupPath('')}
                        className="rounded border border-border px-2 py-1 hover:border-accent hover:text-accent"
                      >
                        {selectedSubsystem}
                      </button>
                    </>
                  )}
                  {breadcrumbs.map((crumb, index) => {
                    const path = breadcrumbs.slice(0, index + 1).join('.');
                    return (
                      <span key={path} className="inline-flex items-center gap-2">
                        <span>&gt;</span>
                        <button
                          type="button"
                          onClick={() => setSelectedGroupPath(path)}
                          className="rounded border border-border px-2 py-1 hover:border-accent hover:text-accent"
                        >
                          {crumb}
                        </button>
                      </span>
                    );
                  })}
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {selectedSession.subsystems.map((subsystem) => (
                    <button
                      key={subsystem}
                      type="button"
                      onClick={() => {
                        setSelectedSubsystem(subsystem);
                        setSelectedGroupPath('');
                      }}
                      className={`rounded border px-3 py-1.5 text-sm ${
                        selectedSubsystem === subsystem
                          ? 'border-accent bg-accent text-black'
                          : 'border-border hover:border-accent hover:text-accent'
                      }`}
                    >
                      {subsystem}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded border border-border bg-bg p-3">
                    <div className="text-xs text-muted">Session timestamp</div>
                    <div className="mt-1 text-sm">{formatTimestamp(selectedSession.timestamp)}</div>
                  </div>
                  <div className="rounded border border-border bg-bg p-3">
                    <div className="text-xs text-muted">Subsystems</div>
                    <div className="mt-1 text-sm tabular-nums">
                      {formatNumber(selectedSession.subsystems.length)}
                    </div>
                  </div>
                  <div className="rounded border border-border bg-bg p-3">
                    <div className="text-xs text-muted">Groups</div>
                    <div className="mt-1 text-sm tabular-nums">{formatNumber(totalGroupCount)}</div>
                  </div>
                  <div className="rounded border border-border bg-bg p-3">
                    <div className="text-xs text-muted">Total metrics</div>
                    <div className="mt-1 text-sm tabular-nums">
                      {formatNumber(allSessionMetrics.length)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-muted">
                  Duration: {formatSeconds(selectedSession.uptimeSeconds)}
                </div>
              </div>

              <div className="rounded-md border border-border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                  Group Navigator ({selectedSubsystem || 'No subsystem selected'})
                </h3>
                <DataTable
                  data={groups}
                  columns={groupColumns}
                  emptyMessage="No metric groups detected for this subsystem."
                  filterPlaceholder="Filter group path..."
                  pageSize={6}
                />
              </div>

              <div className="rounded-md border border-border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                  Metrics: {selectedGroup ? groupLabel(selectedGroup.groupPath) : 'No group selected'}
                </h3>
                <DataTable
                  data={selectedGroup?.metrics ?? []}
                  columns={metricColumns}
                  emptyMessage="No metrics in this group."
                  filterPlaceholder="Filter metrics by name, type, or full path..."
                  pageSize={12}
                />
                {selectedGroup && (
                  <div className="mt-3 rounded border border-border bg-bg px-3 py-2 text-xs text-muted">
                    Showing {formatNumber(selectedGroup.metricCount)} metrics | Total Count{' '}
                    {formatNumber(selectedGroup.totalCount)} | Total Bytes{' '}
                    {formatNumber(selectedGroup.totalBytes)}
                  </div>
                )}
              </div>

              <div className="rounded-md border border-border bg-card p-4">
                <button
                  type="button"
                  onClick={() => setShowRawJson((value) => !value)}
                  className="rounded border border-border px-3 py-2 text-sm hover:border-accent hover:text-accent"
                >
                  {showRawJson ? 'Hide Raw JSON' : 'Show Raw JSON'}
                </button>
                {showRawJson && (
                  <pre className="mt-3 max-h-[420px] overflow-auto rounded border border-border bg-bg p-3 text-xs text-muted">
                    {JSON.stringify(selectedSession.statsJson, null, 2)}
                  </pre>
                )}
              </div>
            </section>
          )}
        </main>

        <footer className="mt-6 rounded-md border border-border bg-card px-4 py-3 text-sm text-muted">
          <div>Pits n&apos; Giggles</div>
          <div>Telemetry debugging tools</div>
        </footer>
      </div>
    </div>
  );
}

export default App;
