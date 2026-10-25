export type RiskSeverity = 'critical' | 'warning' | 'info';

// Short "so what?" labels shown next to each capability. A title says what a
// node does, a consequence says what it costs you if the app misbehaves.
export const CONSEQUENCE = {
  costsMoney: 'Costs money',
  sendsDataOut: 'Sends your data out',
  readsYourData: 'Reads your saved data',
  changesYourData: 'Can change your data',
  reachesYourComputer: 'Reaches your computer',
  revealsYouVisited: 'Reveals you visited',
  notSandboxed: 'Not sandboxed',
} as const;

export type Consequence = (typeof CONSEQUENCE)[keyof typeof CONSEQUENCE];

export abstract class NodeRisk {
  abstract readonly kind: string;
  abstract readonly title: string;
  abstract readonly description: string;
  readonly severity: RiskSeverity = 'warning';
  readonly consequences: readonly Consequence[] = [];
  // False when a value is only chosen once the app runs, so the review cannot
  // show what it will be. The review has no prose here: it decides how to say
  // that at render time.
  readonly resolved: boolean = true;

  constructor(public readonly target?: string) {}

  get id(): string {
    return JSON.stringify([this.kind, this.target ?? null, this.severity]);
  }
}

// What the review shows. `severity` says how much is at stake and still drives
// execution gating; this says how well a person can judge it, which is the one
// ordered scale in the panel.
export type RiskLevel =
  'unrestricted' | 'dynamic' | 'static' | 'loads-only' | 'none';

// Lowest to highest, so a single max() gives an app its headline.
export const RISK_LEVEL_ORDER: readonly RiskLevel[] = [
  'none',
  'loads-only',
  'static',
  'dynamic',
  'unrestricted',
];

export function getRiskLevel(risk: NodeRisk): RiskLevel {
  if (risk.severity === 'critical') return 'unrestricted';
  if (!risk.resolved) return 'dynamic';
  return risk.severity === 'info' ? 'loads-only' : 'static';
}

export function highestRiskLevel(risks: NodeRisk[]): RiskLevel {
  return risks.reduce<RiskLevel>(
    (highest, risk) =>
      RISK_LEVEL_ORDER.indexOf(getRiskLevel(risk)) >
      RISK_LEVEL_ORDER.indexOf(highest)
        ? getRiskLevel(risk)
        : highest,
    'none',
  );
}

// Strips credentials and query/fragment secrets. Returns undefined when the
// address cannot be worked out without running the graph.
export function resolveDestination(
  url: unknown,
  baseURL = typeof document === 'undefined' ? undefined : document.baseURI,
): string | undefined {
  if (typeof url !== 'string') return undefined;
  try {
    const parsed = new URL(url, baseURL);
    if (['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
      return parsed.origin + parsed.pathname;
    }
  } catch {}
  return undefined;
}

export class UnrestrictedCodeRisk extends NodeRisk {
  readonly kind = 'unrestricted-code';
  readonly severity = 'critical' as const;
  readonly title = 'Runs code that is not sandboxed';
  readonly resolved = false;
  readonly description =
    'Its capabilities cannot be determined, because this code is not sandboxed. It can use anything Tailrmade can: your saved data, your API keys, your Companion, and any site. It cannot reach your files or other apps, or use your camera, microphone or location unless you have allowed Tailrmade to.';
  readonly consequences = [
    CONSEQUENCE.notSandboxed,
    CONSEQUENCE.changesYourData,
    CONSEQUENCE.sendsDataOut,
    CONSEQUENCE.costsMoney,
  ] as const;
}

export class ApiKeyRisk extends NodeRisk {
  readonly kind = 'api-key';
  readonly title = 'Uses API keys';
  readonly description =
    'Sends your saved keys with its requests. The service may charge you.';
  readonly consequences = [
    CONSEQUENCE.costsMoney,
    CONSEQUENCE.sendsDataOut,
  ] as const;
  readonly resolved: boolean;

  // Without a key name the review can only say one gets picked while running.
  constructor(key?: string) {
    super(key);
    this.resolved = key !== undefined;
  }
}

export class NetworkRisk extends NodeRisk {
  readonly severity: RiskSeverity;
  readonly kind = 'network';
  readonly title: string;
  readonly description: string;
  readonly consequences: readonly Consequence[];
  readonly resolved: boolean;

  constructor(
    url?: unknown,
    baseURL = typeof document === 'undefined' ? undefined : document.baseURI,
    severity: RiskSeverity = 'warning',
  ) {
    const destination = resolveDestination(url, baseURL);
    super(destination);
    this.resolved = destination !== undefined;
    this.severity = severity;
    // Info only loads data, so it gets its own card instead of a second
    // card with the same title
    this.title =
      severity === 'info'
        ? 'Loads data from other sites'
        : 'Connects to other sites';
    this.description =
      severity === 'info'
        ? 'Loads data from the sites below. Each site can see the request.'
        : 'Sends and receives data from the sites below.';
    this.consequences =
      severity === 'info'
        ? [CONSEQUENCE.revealsYouVisited]
        : [CONSEQUENCE.sendsDataOut];
  }
}

export class ExternalHtmlRisk extends NodeRisk {
  readonly kind = 'external-html';
  readonly severity = 'info' as const;
  readonly title = 'Links to other sites';
  readonly description =
    "Content links to or loads from the sites below. They can see when it's loaded or followed.";
  readonly consequences = [CONSEQUENCE.revealsYouVisited] as const;

  constructor(url: string) {
    super(resolveDestination(url));
  }
}

export class ExternalImageRisk extends NodeRisk {
  readonly kind = 'external-image';
  readonly severity = 'info' as const;
  readonly title = 'Loads images from other sites';
  readonly description = 'The site hosting each image can see when it loads.';
  readonly consequences = [CONSEQUENCE.revealsYouVisited] as const;

  constructor(url: string) {
    super(resolveDestination(url));
  }
}

export class DynamicImageRisk extends NodeRisk {
  readonly kind = 'dynamic-image';
  readonly title = 'Loads images from changing addresses';
  readonly description =
    'Other nodes choose which images to load, so app data in an address is sent to that site.';
  readonly consequences = [CONSEQUENCE.sendsDataOut] as const;
  readonly resolved = false;
}

export function getImageSourceRisks(
  source: unknown,
  connected: boolean,
  baseURL = typeof document === 'undefined' ? undefined : document.baseURI,
): NodeRisk[] {
  // A saved input value cannot predict what its connection will produce.
  if (connected) return [new DynamicImageRisk()];
  if (typeof source !== 'string' || !source.trim()) return [];
  try {
    const url = new URL(source, baseURL);
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      (!baseURL || url.origin !== new URL(baseURL).origin)
    ) {
      return [new ExternalImageRisk(url.href)];
    }
  } catch {}
  return [];
}

export class NavigationRisk extends NodeRisk {
  readonly kind = 'navigation';
  readonly title = 'Opens web pages';
  readonly description =
    'Opens pages in a new tab. Anything in the address is sent to that site.';
  readonly consequences = [CONSEQUENCE.sendsDataOut] as const;
  readonly resolved: boolean;

  constructor(url?: unknown) {
    const destination = resolveDestination(url);
    super(destination);
    this.resolved = destination !== undefined;
  }
}

export class CompanionRisk extends NodeRisk {
  readonly kind = 'companion';
  readonly title = 'Uses your Companion';
  readonly description =
    'Sends requests through your Companion, which can reach your computer and local network.';
  readonly consequences = [
    CONSEQUENCE.reachesYourComputer,
    CONSEQUENCE.sendsDataOut,
  ] as const;
}

export class StorageReadRisk extends NodeRisk {
  readonly kind = 'storage-read';
  readonly title = 'Reads Tailrmade data';
  readonly description =
    'Reads data saved in Tailrmade by you or by other apps. Nothing outside Tailrmade storage.';
  readonly consequences = [CONSEQUENCE.readsYourData] as const;
}

export class StorageWriteRisk extends NodeRisk {
  readonly kind = 'storage-write';
  readonly title = 'Changes Tailrmade data';
  readonly description =
    'Adds, changes or removes data saved in Tailrmade. Nothing outside Tailrmade storage.';
  readonly consequences = [CONSEQUENCE.changesYourData] as const;
}

export class AIUsageRisk extends NodeRisk {
  readonly kind = 'ai-usage';
  readonly title = 'Uses AI services';
  readonly description =
    'Sends app data to your AI provider. Counts toward your AI allowance and may use paid credits.';
  readonly consequences = [
    CONSEQUENCE.costsMoney,
    CONSEQUENCE.sendsDataOut,
  ] as const;
}

export interface RiskSource {
  id: string;
  nodeName: string;
  getRisks(): NodeRisk[];
}

export interface AppRisk {
  risk: NodeRisk;
  nodes: Array<{ id: string; name: string }>;
}

export function requiresAppRiskReview(risks: AppRisk[]): boolean {
  return risks.some(({ risk }) => risk.severity !== 'info');
}

export function collectAppRisks(nodes: RiskSource[]): AppRisk[] {
  const grouped = new Map<string, AppRisk>();
  for (const node of nodes) {
    for (const risk of node.getRisks()) {
      const entry = grouped.get(risk.id) ?? { risk, nodes: [] };
      if (!entry.nodes.some((source) => source.id === node.id)) {
        entry.nodes.push({ id: node.id, name: node.nodeName });
      }
      grouped.set(risk.id, entry);
    }
  }
  const severityOrder: Record<RiskSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  return [...grouped.values()].sort(
    (a, b) => severityOrder[a.risk.severity] - severityOrder[b.risk.severity],
  );
}

export function findApiKeyReferences(value: unknown): string[] {
  const keys = new Set<string>();
  const seen = new Set<object>();
  const visit = (current: unknown): void => {
    if (typeof current === 'string') {
      for (const match of current.matchAll(/\$TM_KEY\{([^{}]+)\}/g)) {
        keys.add(match[1]);
      }
    } else if (current && typeof current === 'object' && !seen.has(current)) {
      seen.add(current);
      for (const entry of Object.values(current)) visit(entry);
    }
  };
  visit(value);
  return [...keys].sort();
}
