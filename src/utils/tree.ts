import type { StatTreeNode, StatsJson } from '../types';

const PATH_SEPARATOR = '\u001f';

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

const isMetricLeaf = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) {
    return false;
  }
  return toNumber(value.count) !== undefined;
};

const createNodeId = (segments: string[]): string =>
  `stats:${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;

export const pathKeyFromSegments = (segments: string[]): string =>
  segments.join(PATH_SEPARATOR);

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

const buildNode = (
  key: string,
  value: unknown,
  segments: string[],
  kind: 'subsystem' | 'container'
): StatTreeNode => {
  if (isMetricLeaf(value)) {
    return {
      id: createNodeId(segments),
      pathKey: pathKeyFromSegments(segments),
      name: key,
      segments,
      path: segments.join('.'),
      kind: 'metric',
      metric: {
        count: toNumber(value.count) ?? 0,
        bytes: toNumber(value.bytes),
        type: typeof value.type === 'string' ? value.type : undefined,
        badLatencyCount: readNumberField(
          value,
          'bad_latency_count',
          'badLatencyCount'
        ),
        minNs: readNumberField(value, 'min_ns', 'minNs', 'min'),
        maxNs: readNumberField(value, 'max_ns', 'maxNs', 'max'),
        avgNs: readNumberField(value, 'avg_ns', 'avgNs', 'avg'),
        stddevNs: readNumberField(
          value,
          'stddev_ns',
          'stddevNs',
          'stddev'
        ),
      },
    };
  }

  const children: StatTreeNode[] = [];

  if (isRecord(value)) {
    for (const [childKey, childValue] of Object.entries(value)) {
      if (!isRecord(childValue)) {
        continue;
      }
      children.push(
        buildNode(childKey, childValue, [...segments, childKey], 'container')
      );
    }
  }

  return {
    id: createNodeId(segments),
    pathKey: pathKeyFromSegments(segments),
    name: key,
    segments,
    path: segments.join('.'),
    kind,
    children,
  };
};

export const buildStatsTree = (statsJson: StatsJson): StatTreeNode[] => {
  const roots: StatTreeNode[] = [];

  for (const [subsystem, subsystemValue] of Object.entries(statsJson)) {
    if (!isRecord(subsystemValue)) {
      continue;
    }
    roots.push(buildNode(subsystem, subsystemValue, [subsystem], 'subsystem'));
  }

  return roots;
};

export interface IndexedTree {
  byId: Map<string, StatTreeNode>;
  byPath: Map<string, StatTreeNode>;
  totalNodes: number;
  metricNodes: number;
}

export const indexStatsTree = (roots: StatTreeNode[]): IndexedTree => {
  const byId = new Map<string, StatTreeNode>();
  const byPath = new Map<string, StatTreeNode>();

  let totalNodes = 0;
  let metricNodes = 0;

  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    byId.set(node.id, node);
    byPath.set(node.pathKey, node);
    totalNodes += 1;
    if (node.kind === 'metric') {
      metricNodes += 1;
    }

    if (node.children && node.children.length > 0) {
      for (let i = node.children.length - 1; i >= 0; i -= 1) {
        stack.push(node.children[i]);
      }
    }
  }

  return {
    byId,
    byPath,
    totalNodes,
    metricNodes,
  };
};
