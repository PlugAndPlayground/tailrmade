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
  readonly title = 'Runs JavaScript with browser access';
  readonly description =
    "Runs outside the code sandbox to support page interactions and browser libraries. This gives code access to the Tailrmade page and your signed-in session, including reading, changing, or deleting Tailrmade data, using available API keys and Companion services, and making network requests. Access is broader than the individual capabilities listed here; paid services can incur charges. Long-running code may make this tab unresponsive. Normal browser permissions still apply, without general access to your computer's files or other apps.";
}

export class ApiKeyRisk extends NodeRisk {
  readonly kind = 'api-key';
  readonly title = 'Uses API keys';
  readonly description =
    'Uses the listed API keys through your configured Companion to authenticate requests. The service may charge for usage. Connected inputs can supply additional keys when the app runs.';
}

export class NetworkRisk extends NodeRisk {
  readonly severity: RiskSeverity;
  readonly kind = 'network';
  readonly title = 'Connects to external services';
  readonly description =
    'Sends and receives data using the listed destinations. Connected inputs or custom code can choose other destinations when the app runs. Addresses shown here omit credentials, query strings, and fragments.';

  constructor(
    url?: unknown,
    baseURL = typeof document === 'undefined' ? undefined : document.baseURI,
    severity: RiskSeverity = 'warning',
  ) {
    let destination = 'Destination determined at runtime';
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
  }
}

export class ExternalHtmlRisk extends NodeRisk {
  readonly kind = 'external-html';
  readonly severity = 'info' as const;
  readonly title = 'References external URLs';
  readonly description =
    'Sanitized HTML references this address. Loading resources or following links sends a request to that host. Addresses omit credentials, query strings, and fragments.';

  constructor(url: string) {
    super(new NetworkRisk(url).target);
  }
}

export class ExternalImageRisk extends NodeRisk {
  readonly kind = 'external-image';
  readonly severity = 'info' as const;
  readonly title = 'Loads external images';
  readonly description =
    'Loads an image from the listed address. The image host receives the request. The address shown here omits credentials, query strings, and fragments.';

  constructor(url: string) {
    super(new NetworkRisk(url).target);
  }
}

export class DynamicImageRisk extends NodeRisk {
  readonly kind = 'dynamic-image';
  readonly title = 'Loads images from dynamic URLs';
  readonly description =
    'Uses connected inputs to choose which images to load. If an image address includes app data, the image host receives that data with the request.';
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
    'Opens web pages in new tabs. Data included in a URL is sent to that destination. Connected inputs can choose destinations when the app runs. Addresses shown here omit credentials, query strings, and fragments.';

  constructor(url?: unknown) {
    super(new NetworkRisk(url).target);
  }
}

export class CompanionRisk extends NodeRisk {
  readonly kind = 'companion';
  readonly title = 'Uses your Companion';
  readonly description =
    'Routes requests through your configured Tailrmade Companion. A Companion running on your computer can connect to services on that computer or your local network.';
}

export class StorageRisk extends NodeRisk {
  readonly kind = 'storage';
  readonly title = 'Accesses Tailrmade data';
  readonly description =
    'Reads saved data from Tailrmade in this browser or your Tailrmade cloud storage. Write and delete nodes can also update or remove that data. This access is limited to Tailrmade storage, not other files on your computer.';
}

export class AIUsageRisk extends NodeRisk {
  readonly kind = 'ai-usage';
  readonly title = 'Uses AI services';
  readonly description =
    'Sends app inputs to the configured AI provider for processing. Requests count toward your usage allowance and may use paid credits.';
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
