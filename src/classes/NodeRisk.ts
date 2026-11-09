export type RiskSeverity = 'critical' | 'warning' | 'info';

// Short "so what?" labels shown next to each action. A title says what a
// node can do, a consequence says what it can cost you if the app misbehaves.
// Each starts with "Can": a chip stands on its own, and most only happen when
// the app takes that path.
export const CONSEQUENCE = {
  costsMoney: 'Can cost money',
  sendsDataOut: 'Can send your data out',
  readsYourData: 'Can read your saved data',
  changesYourData: 'Can change your data',
  reachesYourComputer: 'Can reach your computer',
  revealsYouVisited: 'Can reveal your visit',
} as const;

export type Consequence = (typeof CONSEQUENCE)[keyof typeof CONSEQUENCE];

// Titles are bare verbs: the review lists them under "This app can:".
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
    // `resolved` is part of the claim. A known "all saved data" target and an
    // address chosen while running can both have no target, but the latter must
    // not disappear when risks are collected.
    return JSON.stringify([
      this.kind,
      this.target ?? null,
      this.severity,
      this.resolved,
    ]);
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

// Drops credentials and the fragment, and masks every query value. Returns
// undefined when the address cannot be worked out without running the graph.
export function resolveDestination(
  url: unknown,
  baseURL = typeof document === 'undefined' ? undefined : document.baseURI,
): string | undefined {
  if (typeof url !== 'string') return undefined;
  try {
    const parsed = new URL(url, baseURL);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
      return undefined;
    }
    // The query is part of what reaches the site, so hiding it entirely left
    // the review quieter than the truth. Names say what kinds of data travel;
    // values stay masked, so a secret typed into an address is never printed.
    const query = [...parsed.searchParams]
      .map(([name, value]) => (value === '' ? name : `${name}=\u2026`))
      .join('&');
    return parsed.origin + parsed.pathname + (query ? `?${query}` : '');
  } catch {}
  return undefined;
}

export class UnrestrictedCodeRisk extends NodeRisk {
  readonly kind = 'unrestricted-code';
  readonly severity = 'critical' as const;
  readonly title = 'Run unsandboxed code';
  readonly resolved = false;
  readonly description =
    "Tailrmade can't check what this code does. It can potentially do anything Tailrmade can: use your saved data, API keys and Companion, and contact any site. It can't reach your files or other apps.";
  readonly consequences = [
    CONSEQUENCE.changesYourData,
    CONSEQUENCE.sendsDataOut,
    CONSEQUENCE.costsMoney,
  ] as const;
}

export class ApiKeyRisk extends NodeRisk {
  readonly kind = 'api-key';
  readonly title = 'Use API keys';
  readonly description = 'Can send the saved key below with its requests.';
  readonly consequences = [
    CONSEQUENCE.costsMoney,
    CONSEQUENCE.sendsDataOut,
  ] as const;
  readonly resolved: boolean;

  // Without a key name the review can only say one gets picked while running.
  // With a known address it also says where the key goes.
  constructor(key?: string, url?: unknown) {
    const destination = resolveDestination(url);
    super(
      key !== undefined && destination
        ? `${key} \u2192 ${new URL(destination).host}`
        : key,
    );
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
        ? 'Load data from other sites'
        : 'Send data to other sites';
    this.description =
      severity === 'info'
        ? 'Each site sees your IP address and when the app loads.'
        : 'Can send app data to these sites and use their replies.';
    this.consequences =
      severity === 'info'
        ? [CONSEQUENCE.revealsYouVisited]
        : [CONSEQUENCE.sendsDataOut];
  }
}

export class ExternalHtmlRisk extends NodeRisk {
  readonly kind = 'external-html';
  readonly severity = 'info' as const;
  readonly title = 'Load content from other sites';
  readonly description =
    'Each site sees your IP address when it loads or is clicked.';
  readonly consequences = [CONSEQUENCE.revealsYouVisited] as const;

  constructor(url: string) {
    super(resolveDestination(url));
  }
}

export class ExternalImageRisk extends NodeRisk {
  readonly kind = 'external-image';
  readonly severity = 'info' as const;
  readonly title = 'Load images from other sites';
  readonly description = 'Each site sees your IP address when the image loads.';
  readonly consequences = [CONSEQUENCE.revealsYouVisited] as const;

  constructor(url: string) {
    super(resolveDestination(url));
  }
}

export class DynamicImageRisk extends NodeRisk {
  readonly kind = 'dynamic-image';
  readonly title = 'Load images from addresses set while running';
  readonly description =
    'If an address points to another site, any app data in it reaches that site.';
  readonly consequences = [CONSEQUENCE.sendsDataOut] as const;
  readonly resolved = false;
}

export class DynamicContentRisk extends NodeRisk {
  readonly kind = 'dynamic-content';
  readonly title = 'Load content from addresses set while running';
  readonly description =
    'If an address points to another site, any app data in it reaches that site.';
  readonly consequences = [CONSEQUENCE.sendsDataOut] as const;
  readonly resolved = false;
}

// Tailrmade's own pages, relative links included, reach no other site.
export function isSameOrigin(
  url: unknown,
  baseURL = typeof document === 'undefined' ? undefined : document.baseURI,
): boolean {
  if (typeof url !== 'string' || !baseURL) return false;
  try {
    return new URL(url, baseURL).origin === new URL(baseURL).origin;
  } catch {
    return false;
  }
}

export function getImageSourceRisks(
  source: unknown,
  dynamic: boolean,
  baseURL = typeof document === 'undefined' ? undefined : document.baseURI,
): NodeRisk[] {
  // Only when the address cannot be worked out ahead of time. A connection
  // that resolves to a constant is reported as that constant.
  if (dynamic) return [new DynamicImageRisk()];
  if (typeof source !== 'string' || !source.trim()) return [];
  try {
    const url = new URL(source, baseURL);
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !isSameOrigin(source, baseURL)
    ) {
      return [new ExternalImageRisk(url.href)];
    }
  } catch {}
  return [];
}

export class NavigationRisk extends NodeRisk {
  readonly kind = 'navigation';
  readonly severity: RiskSeverity;
  readonly title = 'Open web pages';
  readonly description: string;
  readonly consequences: readonly Consequence[];
  readonly resolved: boolean;

  constructor(url?: unknown) {
    const destination = resolveDestination(url);
    super(destination);
    this.resolved = destination !== undefined;
    this.severity = this.resolved ? 'info' : 'warning';
    // A fixed address holds none of the app's data, so it only reveals the
    // visit. One chosen while running can carry anything in it.
    this.description = this.resolved
      ? 'Can open a new tab to the site below.'
      : 'Can open a new tab. Anything in the address reaches that site.';
    this.consequences = this.resolved
      ? [CONSEQUENCE.revealsYouVisited]
      : [CONSEQUENCE.sendsDataOut];
  }
}

export class CompanionRisk extends NodeRisk {
  readonly kind = 'companion';
  readonly title = 'Use your Companion';
  readonly description =
    'Requests go through your Companion, so they can reach your computer and local network.';
  readonly consequences = [
    CONSEQUENCE.reachesYourComputer,
    CONSEQUENCE.sendsDataOut,
  ] as const;
}

// Storage targets read "<location> › <key> · this browser". Without one, the
// node can reach any saved data: all of it, or what is chosen while running.
export class StorageReadRisk extends NodeRisk {
  readonly kind = 'storage-read';
  readonly title = 'Read Tailrmade data';
  readonly description: string;
  readonly consequences = [CONSEQUENCE.readsYourData] as const;
  readonly resolved: boolean;

  constructor(target?: string, resolved = true) {
    super(target);
    this.resolved = resolved;
    this.description =
      target !== undefined
        ? 'Can read the saved data below.'
        : "Can read anything saved in Tailrmade, including your other apps' data.";
  }
}

export class StorageWriteRisk extends NodeRisk {
  readonly kind = 'storage-write';
  readonly title = 'Change Tailrmade data';
  readonly description: string;
  readonly consequences = [CONSEQUENCE.changesYourData] as const;
  readonly resolved: boolean;

  constructor(target?: string, resolved = true) {
    super(target);
    this.resolved = resolved;
    this.description =
      target !== undefined
        ? 'Can change the saved data below.'
        : "Can add, change or delete anything saved in Tailrmade, including your other apps' data.";
  }
}

export class AIUsageRisk extends NodeRisk {
  readonly kind = 'ai-usage';
  readonly title = 'Use AI services';
  readonly description: string;
  readonly consequences = [
    CONSEQUENCE.costsMoney,
    CONSEQUENCE.sendsDataOut,
  ] as const;
  readonly resolved: boolean;

  // Without a provider name it is picked while running. Local execution means
  // the request is relayed by the Companion, not that the provider itself runs
  // locally, so it can still send data out and incur provider charges.
  constructor(
    provider?: string,
    billing: 'tailrmade-allowance' | 'provider-account' = 'tailrmade-allowance',
  ) {
    super(provider);
    this.resolved = provider !== undefined;
    const destination =
      provider !== undefined ? 'the provider below' : 'your AI provider';
    this.description =
      billing === 'provider-account'
        ? `Can send prompts and images to ${destination}. May incur charges on your provider account.`
        : `Can send prompts and images to ${destination}. Uses your AI allowance.`;
  }
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
