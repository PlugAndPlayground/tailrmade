import type { SerializedGraph } from '../utils/interfaces';
import type { AppRisk } from '../classes/NodeRisk';

const APPROVAL_PREFIX = 'tailrmade.app-approval.v1.';

export function getAppReviewContent(
  graph: SerializedGraph,
  risks: AppRisk[],
): string {
  const { viewportCenterPosition, viewportScale, ...settings } =
    graph.graphSettings;
  // Ignore navigation state, but retain all node data and wiring.
  return JSON.stringify(
    {
      version: graph.version,
      settings,
      nodes: graph.nodes,
      links: graph.links,
      risks,
    },
    (_key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        );
      }
      return value;
    },
  );
}

export async function getAppFingerprint(
  graph: SerializedGraph,
  risks: AppRisk[],
): Promise<string | null> {
  try {
    const content = getAppReviewContent(graph, risks);
    const hash = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(content),
    );
    return Array.from(new Uint8Array(hash), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  } catch {
    return null;
  }
}

export function isAppApproved(fingerprint: string | null): boolean {
  if (!fingerprint) return false;
  try {
    return localStorage.getItem(APPROVAL_PREFIX + fingerprint) === 'approved';
  } catch {
    return false;
  }
}

export function rememberAppApproval(fingerprint: string | null): void {
  if (!fingerprint) return;
  try {
    localStorage.setItem(APPROVAL_PREFIX + fingerprint, 'approved');
  } catch {
    // Approval still applies to this run when browser storage is unavailable.
  }
}
