export type RiskSeverity = 'critical' | 'warning';

export abstract class NodeRisk {
  abstract readonly kind: string;
  abstract readonly title: string;
  abstract readonly description: string;
  readonly severity: RiskSeverity = 'warning';

  constructor(public readonly target?: string) {}

  get id(): string {
    return JSON.stringify([this.kind, this.target ?? null]);
  }
}

export class UnrestrictedCodeRisk extends NodeRisk {
  readonly kind = 'unrestricted-code';
  readonly severity = 'critical' as const;
  readonly title = 'Runs unrestricted JavaScript';
  readonly description =
    'Can access the Tailrmade page and browser-stored data, make requests, and freeze the tab. Includes main-thread code and unsanitized HTML.';
}

export class WorkerCodeRisk extends NodeRisk {
  readonly kind = 'worker-code';
  readonly title = 'Runs custom JavaScript in a worker';
  readonly description =
    'Can make network requests, access browser databases, and invoke app macros.';
}

export class ApiKeyRisk extends NodeRisk {
  readonly kind = 'api-key';
  readonly title = 'Uses API keys';
  readonly description =
    'Can use these credentials through the configured Companion. Requests may incur charges. Runtime inputs may introduce additional keys.';
}

export class NetworkRisk extends NodeRisk {
  readonly kind = 'network';
  readonly title = 'Connects to external services';
  readonly description =
    'Can send and receive data. Connected inputs and custom code may determine additional destinations at runtime.';

  constructor(url?: unknown) {
    let destination = 'Destination determined at runtime';
    if (typeof url === 'string') {
      try {
        // Never disclose query strings, credentials, or API keys in the review.
        destination = new URL(url).origin;
      } catch {}
    }
    super(destination);
  }
}

export class CompanionRisk extends NodeRisk {
  readonly kind = 'companion';
  readonly title = 'Uses your Companion';
  readonly description =
    'Routes requests through your configured local or cloud Companion. A local Companion may reach services on your computer or network.';
}

export class StorageRisk extends NodeRisk {
  readonly kind = 'storage';
  readonly title = 'Accesses stored data';
  readonly description =
    'Can access local or cloud storage using your account. Write and delete nodes can change or remove stored data.';
}

export class AIUsageRisk extends NodeRisk {
  readonly kind = 'ai-usage';
  readonly title = 'Uses AI services';
  readonly description =
    'Sends app inputs to an AI provider and consumes usage or paid credits.';
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
  return [...grouped.values()].sort(
    (a, b) =>
      Number(b.risk.severity === 'critical') -
      Number(a.risk.severity === 'critical'),
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
