import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Tree } from 'react-arborist';
import type { NodeApi, NodeRendererProps, TreeApi } from 'react-arborist';
import { DataTable } from './components/DataTable';
import type { StatMetricValue, StatTreeNode, TelemetrySession } from './types';
import {
  parseTelemetryInput,
  statsMarker,
  type ParseResult,
} from './utils/parser';
import {
  formatBytes,
  formatDecimal,
  formatMillisecondsFromNanoseconds,
  formatNumber,
  formatPercentFromRatio,
  formatSeconds,
  formatTimestamp,
} from './utils/stats';
import {
  buildStatsTree,
  indexStatsTree,
  pathKeyFromSegments,
} from './utils/tree';

type View = 'input' | 'sessions' | 'explorer';

interface SessionListRow extends TelemetrySession {
  index: number;
}

const ChevronRightIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="currentColor"
    aria-hidden
  >
    <path
      fillRule="evenodd"
      d="M6.646 12.854a.5.5 0 0 1 0-.708L10.293 8 6.646 4.354a.5.5 0 1 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708 0"
    />
  </svg>
);

const ChevronDownIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="currentColor"
    aria-hidden
  >
    <path
      fillRule="evenodd"
      d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708"
    />
  </svg>
);

const DotIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="currentColor"
    aria-hidden
  >
    <circle cx="8" cy="8" r="3" />
  </svg>
);

const CopyIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="currentColor"
    aria-hidden
  >
    <path d="M10 1.5v1h-6v10h-1v-10A1.5 1.5 0 0 1 4.5 1h5a.5.5 0 0 1 .5.5" />
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h5A1.5 1.5 0 0 1 13 4.5v8A1.5 1.5 0 0 1 11.5 14h-5A1.5 1.5 0 0 1 5 12.5zM6.5 4a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5z" />
  </svg>
);

const isCategoryNode = (node: StatTreeNode | undefined): boolean => {
  if (!node || node.kind !== 'container') {
    return false;
  }

  const children = node.children ?? [];
  return children.length > 0 && children.every((child) => child.kind === 'metric');
};

interface MetricDetailCard {
  key: string;
  label: string;
  value: string;
  tabular?: boolean;
}

type MetricDetailRenderer = (metric: StatMetricValue) => MetricDetailCard[];

const hasLatencyMetricData = (metric: StatMetricValue | undefined): boolean =>
  Boolean(
    metric &&
      (metric.type === '__LATENCY__' ||
        metric.badLatencyCount !== undefined ||
        metric.minNs !== undefined ||
        metric.maxNs !== undefined ||
        metric.avgNs !== undefined ||
        metric.stddevNs !== undefined)
  );

const hasFrameTimingMetricData = (metric: StatMetricValue | undefined): boolean => {
  const frameRender = metric?.frameRender;
  return Boolean(frameRender && Object.values(frameRender).some((entry) => entry !== undefined));
};

const renderLatencyMetricCards: MetricDetailRenderer = (metric) => [
  {
    key: 'latency.bad-latency-count',
    label: 'Bad Latency Count',
    value: formatNumber(metric.badLatencyCount),
    tabular: true,
  },
  {
    key: 'latency.min-ms',
    label: 'Min (ms)',
    value: formatMillisecondsFromNanoseconds(metric.minNs),
    tabular: true,
  },
  {
    key: 'latency.max-ms',
    label: 'Max (ms)',
    value: formatMillisecondsFromNanoseconds(metric.maxNs),
    tabular: true,
  },
  {
    key: 'latency.avg-ms',
    label: 'Avg (ms)',
    value: formatMillisecondsFromNanoseconds(metric.avgNs),
    tabular: true,
  },
  {
    key: 'latency.std-dev-ms',
    label: 'Std Dev (ms)',
    value: formatMillisecondsFromNanoseconds(metric.stddevNs),
    tabular: true,
  },
];

const renderFrameTimingMetricCards: MetricDetailRenderer = (metric) => {
  if (!hasFrameTimingMetricData(metric)) {
    return [];
  }

  const frameRender = metric.frameRender;

  return [
    {
      key: 'frame-timing.budget-max-miss-streak',
      label: 'Budget Max Miss Streak',
      value: formatNumber(frameRender?.budgetMaxMissStreak),
      tabular: true,
    },
    {
      key: 'frame-timing.budget-miss-ratio',
      label: 'Budget Miss Ratio',
      value: formatPercentFromRatio(frameRender?.budgetMissRatio),
      tabular: true,
    },
    {
      key: 'frame-timing.budget-missed-frames',
      label: 'Budget Missed Frames',
      value: formatNumber(frameRender?.budgetMissedFrames),
      tabular: true,
    },
    {
      key: 'frame-timing.fps-avg',
      label: 'FPS Avg',
      value: formatDecimal(frameRender?.fpsAvg),
      tabular: true,
    },
    {
      key: 'frame-timing.fps-min',
      label: 'FPS Min',
      value: formatDecimal(frameRender?.fpsMin),
      tabular: true,
    },
    {
      key: 'frame-timing.fps-max',
      label: 'FPS Max',
      value: formatDecimal(frameRender?.fpsMax),
      tabular: true,
    },
    {
      key: 'frame-timing.fps-target',
      label: 'FPS Target',
      value: formatDecimal(frameRender?.fpsTarget),
      tabular: true,
    },
    {
      key: 'frame-timing.interval-avg-ms',
      label: 'Interval Avg (ms)',
      value: formatMillisecondsFromNanoseconds(frameRender?.intervalAvgNs),
      tabular: true,
    },
    {
      key: 'frame-timing.interval-min-ms',
      label: 'Interval Min (ms)',
      value: formatMillisecondsFromNanoseconds(frameRender?.intervalMinNs),
      tabular: true,
    },
    {
      key: 'frame-timing.interval-max-ms',
      label: 'Interval Max (ms)',
      value: formatMillisecondsFromNanoseconds(frameRender?.intervalMaxNs),
      tabular: true,
    },
    {
      key: 'frame-timing.interval-stddev-ms',
      label: 'Interval Std Dev (ms)',
      value: formatMillisecondsFromNanoseconds(frameRender?.intervalStddevNs),
      tabular: true,
    },
    {
      key: 'frame-timing.interval-variance',
      label: 'Interval Variance',
      value: formatDecimal(frameRender?.intervalVariance),
      tabular: true,
    },
    {
      key: 'frame-timing.pacing-error-avg-ms',
      label: 'Pacing Error Avg (ms)',
      value: formatMillisecondsFromNanoseconds(frameRender?.pacingErrorAvgNs),
      tabular: true,
    },
    {
      key: 'frame-timing.pacing-error-max-ms',
      label: 'Pacing Error Max (ms)',
      value: formatMillisecondsFromNanoseconds(frameRender?.pacingErrorMaxNs),
      tabular: true,
    },
  ];
};

const metricTypeRenderers: Partial<Record<string, MetricDetailRenderer>> = {
  __LATENCY__: renderLatencyMetricCards,
  __FRAME_TIMING__: renderFrameTimingMetricCards,
};

function StatsTreeNodeRenderer({ node, style }: NodeRendererProps<StatTreeNode>) {
  const isMetric = node.data.kind === 'metric';

  return (
    <div
      style={style}
      onClick={node.handleClick}
      className={`flex h-full items-center gap-2 border-l-2 px-2 text-sm ${
        node.isSelected
          ? 'border-accent bg-hover text-text'
          : 'border-transparent text-muted hover:bg-hover hover:text-text'
      }`}
    >
      {node.isInternal ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            node.toggle();
          }}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-card text-lg font-bold leading-none text-text hover:border-accent hover:text-accent"
          aria-label={node.isOpen ? 'Collapse' : 'Expand'}
        >
          {node.isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </button>
      ) : (
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-card">
          <span className="text-muted">
            <DotIcon />
          </span>
        </span>
      )}
      <span className="truncate">{node.data.name}</span>
      {isMetric && (
        <span className="ml-auto text-xs tabular-nums text-muted">
          {formatNumber(node.data.metric?.count)}
        </span>
      )}
    </div>
  );
}
function App() {
  const [activeView, setActiveView] = useState<View>('input');
  const [inputText, setInputText] = useState('');
  const [sessions, setSessions] = useState<TelemetrySession[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [treeSearch, setTreeSearch] = useState('');
  const [showRawJson, setShowRawJson] = useState(false);
  const [rawJsonCopied, setRawJsonCopied] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 900 : window.innerHeight
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const treeRef = useRef<TreeApi<StatTreeNode> | null>(null);
  const rawJsonCopyResetRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    return () => {
      if (rawJsonCopyResetRef.current !== null) {
        window.clearTimeout(rawJsonCopyResetRef.current);
      }
    };
  }, []);

  const treeHeight = useMemo(
    () => Math.max(320, Math.min(720, viewportHeight - 360)),
    [viewportHeight]
  );

  const sessionRows = useMemo<SessionListRow[]>(
    () => sessions.map((session, index) => ({ ...session, index: index + 1 })),
    [sessions]
  );

  const selectedSession = useMemo(
    () => sessions.find((session) => session.sessionId === selectedSessionId),
    [sessions, selectedSessionId]
  );

  const selectedSessionNumber = useMemo(() => {
    const row = sessionRows.find((session) => session.sessionId === selectedSessionId);
    return row?.index ?? 1;
  }, [sessionRows, selectedSessionId]);

  const treeData = useMemo<StatTreeNode[]>(() => {
    if (!selectedSession) {
      return [];
    }
    return buildStatsTree(selectedSession.statsJson);
  }, [selectedSession]);

  const treeIndex = useMemo(() => indexStatsTree(treeData), [treeData]);

  const resolvedSelectedNodeId = useMemo(() => {
    if (selectedNodeId && treeIndex.byId.has(selectedNodeId)) {
      return selectedNodeId;
    }
    return treeData[0]?.id ?? '';
  }, [selectedNodeId, treeData, treeIndex]);

  const selectedNode = useMemo(
    () =>
      resolvedSelectedNodeId
        ? treeIndex.byId.get(resolvedSelectedNodeId)
        : undefined,
    [resolvedSelectedNodeId, treeIndex]
  );

  const selectedParentNode = useMemo(() => {
    if (!selectedNode || selectedNode.segments.length < 2) {
      return undefined;
    }

    return treeIndex.byPath.get(
      pathKeyFromSegments(selectedNode.segments.slice(0, -1))
    );
  }, [selectedNode, treeIndex]);

  const selectedNodeKindLabel = useMemo(() => {
    if (!selectedNode) {
      return '';
    }

    if (selectedNode.kind === 'subsystem') {
      return 'Subsystem';
    }

    if (selectedNode.kind === 'metric') {
      return 'Subcategory';
    }

    return isCategoryNode(selectedNode) ? 'Category' : 'Container';
  }, [selectedNode]);

  const selectedNodeCategoryName = useMemo(() => {
    if (!selectedNode || selectedNode.kind !== 'metric') {
      return undefined;
    }

    if (!selectedParentNode || !isCategoryNode(selectedParentNode)) {
      return undefined;
    }

    return selectedParentNode.name;
  }, [selectedNode, selectedParentNode]);

  const selectedMetricDetailCards = useMemo<MetricDetailCard[]>(() => {
    if (!selectedNode || selectedNode.kind !== 'metric' || !selectedNode.metric) {
      return [];
    }

    const metric = selectedNode.metric;
    const cards: MetricDetailCard[] = [];
    const renderedTypes = new Set<string>();

    if (metric.type) {
      const renderer = metricTypeRenderers[metric.type];
      if (renderer) {
        cards.push(...renderer(metric));
        renderedTypes.add(metric.type);
      }
    }

    // Backward compatibility for latency metrics that carry latency fields without a type.
    if (!renderedTypes.has('__LATENCY__') && hasLatencyMetricData(metric)) {
      cards.push(...renderLatencyMetricCards(metric));
    }

    return cards;
  }, [selectedNode]);

  const breadcrumbNodes = useMemo(() => {
    if (!selectedNode) {
      return [];
    }

    const nodes: StatTreeNode[] = [];

    for (let i = 0; i < selectedNode.segments.length; i += 1) {
      const node = treeIndex.byPath.get(
        pathKeyFromSegments(selectedNode.segments.slice(0, i + 1))
      );
      if (node) {
        nodes.push(node);
      }
    }

    return nodes;
  }, [selectedNode, treeIndex]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const applyParseResult = useCallback((result: ParseResult) => {
    setErrors(result.errors);
    setSessions(result.sessions);

    if (result.sessions.length > 0) {
      setSelectedSessionId(result.sessions[0].sessionId);
      setSelectedNodeId('');
      setTreeSearch('');
      setShowRawJson(false);
      setRawJsonCopied(false);
      setActiveView('sessions');
      return;
    }

    setSelectedSessionId('');
    setSelectedNodeId('');
    setTreeSearch('');
    setShowRawJson(false);
    setRawJsonCopied(false);
    setActiveView('input');
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      const text = await file.text();
      const result = parseTelemetryInput(text);
      applyParseResult(result);
      event.target.value = '';
    },
    [applyParseResult]
  );

  const openSession = useCallback(
    (sessionId: string) => {
      setSelectedSessionId(sessionId);
      setSelectedNodeId('');
      setTreeSearch('');
      setShowRawJson(false);
      setRawJsonCopied(false);
      setActiveView('explorer');
    },
    []
  );

  const handleParseSessions = useCallback(() => {
    const result = parseTelemetryInput(inputText);
    applyParseResult(result);
  }, [applyParseResult, inputText]);

  const handleCopyRawJson = useCallback(async () => {
    if (!selectedSession) {
      return;
    }

    await navigator.clipboard.writeText(
      JSON.stringify(selectedSession.statsJson, null, 2)
    );
    setRawJsonCopied(true);

    if (rawJsonCopyResetRef.current !== null) {
      window.clearTimeout(rawJsonCopyResetRef.current);
    }
    rawJsonCopyResetRef.current = window.setTimeout(() => {
      setRawJsonCopied(false);
      rawJsonCopyResetRef.current = null;
    }, 1600);
  }, [selectedSession]);

  const handleTreeSelect = useCallback((nodes: NodeApi<StatTreeNode>[]) => {
    setSelectedNodeId(nodes[0]?.id ?? '');
  }, []);

  const searchMatch = useCallback((node: NodeApi<StatTreeNode>, term: string) => {
    const searchTerm = term.trim().toLowerCase();
    if (!searchTerm) {
      return true;
    }

    return (
      node.data.name.toLowerCase().includes(searchTerm) ||
      node.data.path.toLowerCase().includes(searchTerm)
    );
  }, []);

  const sessionColumns = useMemo<ColumnDef<SessionListRow>[]>(
    () => [
      {
        accessorKey: 'index',
        header: 'Session',
        cell: ({ row }) => `Session ${row.original.index}`,
        size: 120,
      },
      {
        accessorKey: 'timestamp',
        header: 'Timestamp',
        cell: ({ row }) => formatTimestamp(row.original.timestamp),
        size: 260,
      },
      {
        accessorKey: 'subsystems',
        header: 'Subsystems',
        cell: ({ row }) => row.original.subsystems.join(', '),
        size: 360,
      },
      {
        accessorKey: 'uptimeSeconds',
        header: 'Duration',
        cell: ({ row }) => formatSeconds(row.original.uptimeSeconds),
        size: 120,
      },
      {
        id: 'view',
        header: 'View',
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

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 md:px-6">
        <header className="mb-6 rounded-md border border-border bg-card px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-wide">
                Pits n&apos; Giggles Stats Explorer
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
                    onClick={() => setSelectedNodeId(treeData[0]?.id ?? '')}
                    className="rounded border border-border px-2 py-1 hover:border-accent hover:text-accent"
                  >
                    Session {selectedSessionNumber}
                  </button>
                  {breadcrumbNodes.map((crumb) => (
                    <span key={crumb.id} className="inline-flex items-center gap-2">
                      <span>&gt;</span>
                      <button
                        type="button"
                        onClick={() => setSelectedNodeId(crumb.id)}
                        className="rounded border border-border px-2 py-1 hover:border-accent hover:text-accent"
                      >
                        {crumb.name}
                      </button>
                    </span>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded border border-border bg-bg p-3">
                    <div className="text-xs text-muted">Session timestamp</div>
                    <div className="mt-1 text-sm">{formatTimestamp(selectedSession.timestamp)}</div>
                  </div>
                  <div className="rounded border border-border bg-bg p-3">
                    <div className="text-xs text-muted">Tree nodes</div>
                    <div className="mt-1 text-sm tabular-nums">
                      {formatNumber(treeIndex.totalNodes)}
                    </div>
                  </div>
                  <div className="rounded border border-border bg-bg p-3">
                    <div className="text-xs text-muted">Metric leaves</div>
                    <div className="mt-1 text-sm tabular-nums">
                      {formatNumber(treeIndex.metricNodes)}
                    </div>
                  </div>
                  <div className="rounded border border-border bg-bg p-3">
                    <div className="text-xs text-muted">Metric types</div>
                    <div className="mt-1 text-sm">
                      {treeIndex.metricTypes.length > 0 ? treeIndex.metricTypes.join(', ') : '—'}
                    </div>
                  </div>
                  <div className="rounded border border-border bg-bg p-3">
                    <div className="text-xs text-muted">Version</div>
                    <div className="mt-1 text-sm">{selectedSession.version ?? '—'}</div>
                  </div>
                  <div className="rounded border border-border bg-bg p-3">
                    <div className="text-xs text-muted">Forced shutdown</div>
                    <div className="mt-1 text-sm">
                      {selectedSession.forcedShutdown === undefined
                        ? '—'
                        : selectedSession.forcedShutdown
                          ? 'Yes'
                          : 'No'}
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-muted">
                  Duration: {formatSeconds(selectedSession.uptimeSeconds)}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(340px,420px)_1fr]">
                <div className="rounded-md border border-border bg-card p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      value={treeSearch}
                      onChange={(event) => setTreeSearch(event.target.value)}
                      placeholder="Search node name or full path..."
                      className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
                    />
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => treeRef.current?.openAll()}
                      className="rounded border border-border px-2 py-1 hover:border-accent hover:text-accent"
                    >
                      Expand All
                    </button>
                    <button
                      type="button"
                      onClick={() => treeRef.current?.closeAll()}
                      className="rounded border border-border px-2 py-1 hover:border-accent hover:text-accent"
                    >
                      Collapse All
                    </button>
                    <button
                      type="button"
                      onClick={() => setTreeSearch('')}
                      className="rounded border border-border px-2 py-1 hover:border-accent hover:text-accent"
                    >
                      Clear Search
                    </button>
                  </div>

                  <div className="overflow-hidden rounded border border-border bg-bg">
                    {treeData.length > 0 ? (
                      <Tree
                        ref={treeRef}
                        data={treeData}
                        width="100%"
                        height={treeHeight}
                        openByDefault={false}
                        rowHeight={38}
                        indent={20}
                        overscanCount={8}
                        disableDrag
                        disableEdit
                        disableMultiSelection
                        selection={resolvedSelectedNodeId}
                        searchTerm={treeSearch}
                        searchMatch={searchMatch}
                        onSelect={handleTreeSelect}
                      >
                        {StatsTreeNodeRenderer}
                      </Tree>
                    ) : (
                      <div className="px-3 py-6 text-sm text-muted">
                        No tree nodes found for this session.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-border bg-card p-4">
                  {selectedNode ? (
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted">
                          Selected Node
                        </div>
                        <h3 className="mt-1 text-xl font-semibold">{selectedNode.name}</h3>
                      </div>

                      {selectedNode.kind === 'metric' ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded border border-border bg-bg p-3">
                            <div className="text-xs text-muted">Count</div>
                            <div className="mt-1 text-base tabular-nums">
                              {formatNumber(selectedNode.metric?.count)}
                            </div>
                          </div>
                          <div className="rounded border border-border bg-bg p-3">
                            <div className="text-xs text-muted">Bytes</div>
                            <div className="mt-1 text-base tabular-nums">
                              {selectedNode.metric?.bytes !== undefined
                                ? `${formatNumber(selectedNode.metric.bytes)} (${formatBytes(selectedNode.metric.bytes)})`
                                : '-'}
                            </div>
                          </div>
                          <div className="rounded border border-border bg-bg p-3">
                            <div className="text-xs text-muted">Type</div>
                            <div className="mt-1 text-base">
                              {selectedNode.metric?.type ?? '-'}
                            </div>
                          </div>
                          {selectedMetricDetailCards.map((card) => (
                            <div
                              key={card.key}
                              className="rounded border border-border bg-bg p-3"
                            >
                              <div className="text-xs text-muted">{card.label}</div>
                              <div
                                className={`mt-1 text-base${card.tabular ? ' tabular-nums' : ''}`}
                              >
                                {card.value}
                              </div>
                            </div>
                          ))}
                          <div className="rounded border border-border bg-bg p-3">
                            <div className="text-xs text-muted">Category</div>
                            <div className="mt-1 text-base">
                              {selectedNodeCategoryName ?? '-'}
                            </div>
                          </div>
                          <div className="rounded border border-border bg-bg p-3">
                            <div className="text-xs text-muted">Node Kind</div>
                            <div className="mt-1 text-base">Subcategory</div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="rounded border border-border bg-bg p-3">
                            <div className="text-xs text-muted">Node Kind</div>
                            <div className="mt-1 text-base">
                              {selectedNodeKindLabel}
                            </div>
                          </div>
                          <div className="rounded border border-border bg-bg p-3">
                            <div className="text-xs text-muted">Children</div>
                            <div className="mt-1 text-base tabular-nums">
                              {formatNumber(selectedNode.children?.length ?? 0)}
                            </div>
                          </div>
                          <div className="rounded border border-border bg-bg p-3">
                            <div className="text-xs text-muted">Child Nodes</div>
                            <div className="mt-2 space-y-1 text-sm">
                              {(selectedNode.children ?? []).length > 0 ? (
                                selectedNode.children?.map((child) => (
                                  <button
                                    key={child.id}
                                    type="button"
                                    onClick={() => setSelectedNodeId(child.id)}
                                    className="block text-left text-muted hover:text-accent"
                                  >
                                    {child.name}
                                  </button>
                                ))
                              ) : (
                                <div className="text-muted">No child nodes</div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="rounded border border-border bg-bg p-3">
                        <div className="text-xs text-muted">Full Path</div>
                        <div className="mt-1 break-all text-sm">{selectedNode.path}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted">Select a node to inspect its details.</div>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showRawJson;
                      setShowRawJson(next);
                      if (!next) {
                        setRawJsonCopied(false);
                      }
                    }}
                    className="rounded border border-border px-3 py-2 text-sm hover:border-accent hover:text-accent"
                  >
                    {showRawJson ? 'Hide Raw JSON' : 'Show Raw JSON'}
                  </button>
                  {showRawJson && (
                    <button
                      type="button"
                      onClick={() => {
                        void handleCopyRawJson();
                      }}
                      className="inline-flex h-[38px] w-[38px] items-center justify-center rounded border border-border text-base text-muted hover:border-accent hover:text-accent"
                      title="Copy Raw JSON"
                      aria-label="Copy Raw JSON"
                    >
                      <CopyIcon />
                    </button>
                  )}
                  {showRawJson && rawJsonCopied && (
                    <span className="text-xs text-muted">Copied</span>
                  )}
                </div>
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
