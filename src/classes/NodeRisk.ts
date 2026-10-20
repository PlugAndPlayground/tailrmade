export type RiskSeverity = 'critical' | 'warning' | 'info';

export abstract class NodeRisk {
  abstract readonly kind: string;
  abstract readonly title: string;
  abstract readonly description: string;
  readonly severity: RiskSeverity = 'warning';

  constructor(public readonly target?: string) {}

  get id(): string {
    return JSON.stringify([this.kind, this.target ?? null, this.severity]);
  }
}

export class UnrestrictedCodeRisk extends NodeRisk {
  readonly kind = 'unrestricted-code';
  readonly severity = 'critical' as const;
  readonly title = 'Runs code with full browser access';
  readonly description =
    "Acts as you in this tab: it can read, change or delete your Tailrmade data, use your API keys and Companion, and contact any site. Paid services may charge you. It can't reach your computer's files or other apps, or use your camera, microphone or location unless you've allowed Tailrmade to.";
}

export class ApiKeyRisk extends NodeRisk {
  readonly kind = 'api-key';
  readonly title = 'Uses API keys';
  readonly description =
    'Sends your saved keys with its requests. The service may charge you.';
}

export class NetworkRisk extends NodeRisk {
  readonly severity: RiskSeverity;
  readonly kind = 'network';
  readonly title: string;
  readonly description: string;

  constructor(
    url?: unknown,
    baseURL = typeof document === 'undefined' ? undefined : document.baseURI,
    severity: RiskSeverity = 'warning',
  ) {
    let destination = 'Address chosen while the app runs';
    if (typeof url === 'string') {
      try {
        const parsed = new URL(url, baseURL);
        if (['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
          // Show the endpoint without credentials or query/fragment secrets.
          destination = parsed.origin + parsed.pathname;
        }
      } catch {}
    }
    super(destination);
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
  }
}

export class ExternalHtmlRisk extends NodeRisk {
  readonly kind = 'external-html';
  readonly severity = 'info' as const;
  readonly title = 'Links to other sites';
  readonly description =
    "Content links to or loads from the sites below. They can see when it's loaded or followed.";

  constructor(url: string) {
    super(new NetworkRisk(url).target);
  }
}

export class ExternalImageRisk extends NodeRisk {
  readonly kind = 'external-image';
  readonly severity = 'info' as const;
  readonly title = 'Loads images from other sites';
  readonly description = 'The site hosting each image can see when it loads.';

  constructor(url: string) {
    super(new NetworkRisk(url).target);
  }
}

export class DynamicImageRisk extends NodeRisk {
  readonly kind = 'dynamic-image';
  readonly title = 'Loads images from changing addresses';
  readonly description =
    'Other nodes choose which images to load, so app data in an address is sent to that site.';
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

  constructor(url?: unknown) {
    super(new NetworkRisk(url).target);
  }
}

export class CompanionRisk extends NodeRisk {
  readonly kind = 'companion';
  readonly title = 'Uses your Companion';
  readonly description =
    'Sends requests through your Companion, which can reach your computer and local network.';
}

export class StorageRisk extends NodeRisk {
  readonly kind = 'storage';
  readonly title = 'Accesses Tailrmade data';
  readonly description =
    'Reads data saved in Tailrmade. Write and delete nodes can also change or remove it. Nothing outside Tailrmade storage.';
}

export class AIUsageRisk extends NodeRisk {
  readonly kind = 'ai-usage';
  readonly title = 'Uses AI services';
  readonly description =
    'Sends app data to your AI provider. Counts toward your AI allowance and may use paid credits.';
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
