import { ALL_GRANTS, AppGrants, GraphGrants } from './appGrants';
import type { FullAccessReason, Manifest } from './scanGraph';

// needsOk is unticked by default, connects is ticked, blocked can't be ticked
export type PermissionBand = 'needsOk' | 'connects' | 'blocked';

export interface PermissionItem {
  id: string;
  band: PermissionBand;
  title: string;
  details: string[];
  nodeIds: string[];
}

export type PromptKind = 'none' | 'bar' | 'sheet';

export interface AppPermissionsContext {
  appName: string;
  source: string | undefined;
  manifest: Manifest;
  items: PermissionItem[];
  // undefined when the decision can't be remembered
  grantsId: string | undefined;
}

const FULL_ACCESS_REASONS: Record<FullAccessReason, [string, string]> = {
  code: [
    'code node runs outside the sandbox',
    'code nodes run outside the sandbox',
  ],
  npm: ['node loads code packages', 'nodes load code packages'],
  html: [
    'HTML node shows unsanitised HTML',
    'HTML nodes show unsanitised HTML',
  ],
};

const count = (amount: number, one: string, many: string) =>
  `${amount} ${amount === 1 ? one : many}`;

const uniqueNodeIds = (entries: { nodeIds: string[] }[]) => [
  ...new Set(entries.flatMap((entry) => entry.nodeIds)),
];

const matchesDomain = (host: string, domain: string) => {
  const hostname = host.split(':')[0].toLowerCase();
  const expected = domain.toLowerCase();
  return hostname === expected || hostname.endsWith(`.${expected}`);
};

const formatInterval = (ms: number) =>
  ms < 1000 ? `${ms} ms` : `${Math.round(ms / 100) / 10} s`;

// keyDomains maps the signed-in user's stored key names to their domains
export const getPermissionItems = (
  manifest: Manifest,
  keyDomains: Record<string, string>,
): PermissionItem[] => {
  const items: PermissionItem[] = [];

  manifest.keys.forEach((key) => {
    const domain = keyDomains[key.name];
    const wrongHosts =
      domain === undefined
        ? []
        : key.hosts.filter((host) => !matchesDomain(host, domain));
    if (wrongHosts.length > 0) {
      items.push({
        id: `blockedKey:${key.name}`,
        band: 'blocked',
        title: `${key.name} → ${wrongHosts.join(', ')}`,
        details: [`Your key only works with ${domain}.`],
        nodeIds: key.nodeIds,
      });
      return;
    }
    items.push({
      id: `key:${key.name}`,
      band: 'needsOk',
      title: `Use your ${key.name}`,
      details: [
        key.hosts.length > 0
          ? `only with ${key.hosts.join(', ')}`
          : 'with addresses put together while running',
      ],
      nodeIds: key.nodeIds,
    });
  });

  if (manifest.fullAccess.length > 0) {
    items.push({
      id: 'fullAccess',
      band: 'needsOk',
      title: 'Full access to Tailrmade in this tab',
      details: [
        'Could see your other apps and act as you.',
        ...manifest.fullAccess.map(
          ({ reason, nodeIds }) =>
            `${count(nodeIds.length, ...FULL_ACCESS_REASONS[reason])}.`,
        ),
      ],
      nodeIds: uniqueNodeIds(manifest.fullAccess),
    });
  }

  if (manifest.storage.length > 0) {
    items.push({
      id: 'storage',
      band: 'needsOk',
      title: 'Read or change data from your other apps',
      details: [
        `Storage: ${manifest.storage
          .map(({ location }) => location ?? 'any location')
          .join(', ')}`,
      ],
      nodeIds: uniqueNodeIds(manifest.storage),
    });
  }

  if (manifest.companionNodeIds.length > 0) {
    items.push({
      id: 'companion',
      band: 'needsOk',
      title: 'Reach devices on your network',
      details: ['Through the Companion'],
      nodeIds: manifest.companionNodeIds,
    });
  }

  if (manifest.hosts.length > 0) {
    items.push({
      id: 'hosts',
      band: 'connects',
      title: 'Sends and receives data',
      details: [manifest.hosts.map(({ host }) => host).join(', ')],
      nodeIds: uniqueNodeIds(manifest.hosts),
    });
  }

  if (manifest.aiNodeIds.length > 0) {
    items.push({
      id: 'ai',
      band: 'connects',
      title: 'Uses AI on your account',
      details: [count(manifest.aiNodeIds.length, 'AI node', 'AI nodes')],
      nodeIds: manifest.aiNodeIds,
    });
  }

  if (manifest.fastestIntervalMs !== undefined) {
    items.push({
      id: 'intervals',
      band: 'connects',
      title: 'Keeps running in the background',
      details: [
        `${count(manifest.intervalNodeIds.length, 'node', 'nodes')}, every ${formatInterval(manifest.fastestIntervalMs)}`,
      ],
      nodeIds: manifest.intervalNodeIds,
    });
  }

  if (manifest.runtimeHostNodeIds.length > 0) {
    items.push({
      id: 'runtimeHosts',
      band: 'blocked',
      title: 'Addresses put together while running',
      details: ['These stay off for now. The node says so when one is used.'],
      nodeIds: manifest.runtimeHostNodeIds,
    });
  }

  return items;
};

export const getPromptKind = (items: PermissionItem[]): PromptKind => {
  if (items.some((item) => item.band === 'needsOk')) return 'sheet';
  return items.some((item) => item.band === 'connects') ? 'bar' : 'none';
};

export const getDefaultTicked = (items: PermissionItem[]): Set<string> =>
  new Set(
    items.filter((item) => item.band === 'connects').map((item) => item.id),
  );

export const getGrantsFromTicked = (
  manifest: Manifest,
  ticked: ReadonlySet<string>,
): AppGrants => ({
  fullAccess: ticked.has('fullAccess'),
  keys: manifest.keys
    .filter((key) => ticked.has(`key:${key.name}`))
    .map((key) => key.name),
  hosts: ticked.has('hosts') ? manifest.hosts.map(({ host }) => host) : [],
  companion: ticked.has('companion'),
  storage: ticked.has('storage')
    ? manifest.storage.map(({ backend, location }) => ({ backend, location }))
    : [],
  ai: ticked.has('ai'),
  intervals: ticked.has('intervals'),
});

export const getTickedFromGrants = (
  items: PermissionItem[],
  grants: GraphGrants,
): Set<string> => {
  const isGranted = (id: string): boolean => {
    if (grants === ALL_GRANTS) return true;
    if (id.startsWith('key:')) {
      return grants.keys.includes(id.slice('key:'.length));
    }
    const granted: Record<string, boolean> = {
      fullAccess: grants.fullAccess,
      storage: grants.storage.length > 0,
      companion: grants.companion,
      hosts: grants.hosts.length > 0,
      ai: grants.ai,
      intervals: grants.intervals,
    };
    return granted[id] ?? false;
  };
  return new Set(
    items
      .filter((item) => item.band !== 'blocked' && isGranted(item.id))
      .map((item) => item.id),
  );
};

export const countOff = (
  items: PermissionItem[],
  ticked: ReadonlySet<string>,
): number =>
  items.filter((item) => item.band !== 'blocked' && !ticked.has(item.id))
    .length;

export const getAppGrantsId = (
  source: string | undefined,
  manifestHash: string,
): string => JSON.stringify([source ?? null, manifestHash]);

export const describeSource = (source: string | undefined): string => {
  if (source === 'link') return 'Opened from a link';
  if (source?.startsWith('file:')) {
    return `Opened from ${source.slice('file:'.length)}`;
  }
  if (source?.startsWith('cloud:')) return 'Opened from a shared cloud app';
  return 'Imported app';
};
