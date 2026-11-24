// A Transformers.js `env.customCache` that keeps model files in a folder the
// Companion manages, so they survive clearing site data and can be shared
// between browsers, origins and machines.
//
// Companion endpoints (spec: COMPANION_MODEL_STORE.md next to this file):
//   GET    /models                -> 200 { folder, writable }   (availability)
//   GET    /models/<encoded url>  -> 200 file bytes | 404
//   PUT    /models/<encoded url>  -> 201/204 (body: file bytes)
//   DELETE /models/<encoded url>  -> 204 | 404
// <encoded url> is encodeURIComponent of the file's Hugging Face URL, which is
// the key Transformers.js caches under.

export const COMPANION_ADDRESS = 'http://localhost:6655';

const PING_TIMEOUT_MS = 1500;

export interface CompanionStoreInfo {
  available: boolean;
  folder?: string;
  reason?: string;
}

const isRemoteKey = (key: string) => /^https?:\/\//i.test(key);

export function companionModelUrl(key: string, base = COMPANION_ADDRESS) {
  return `${base}/models/${encodeURIComponent(key)}`;
}

export async function checkCompanionModelStore(
  base = COMPANION_ADDRESS,
  fetchImpl: typeof fetch = fetch,
): Promise<CompanionStoreInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${base}/models`, {
      signal: controller.signal,
    });
    if (response.status === 404) {
      return {
        available: false,
        reason: 'the Companion is running but too old to store models',
      };
    }
    if (!response.ok) {
      return {
        available: false,
        reason: `the Companion answered HTTP ${response.status}`,
      };
    }
    const info = await response.json().catch(() => ({}));
    if (info?.writable === false) {
      return {
        available: false,
        reason:
          'the Companion has no writable model folder; choose one in the Companion',
      };
    }
    return { available: true, folder: info?.folder };
  } catch {
    return {
      available: false,
      reason: `the Companion is not running at ${base}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function createCompanionModelCache(
  base = COMPANION_ADDRESS,
  fetchImpl: typeof fetch = fetch,
) {
  return {
    async match(key: string): Promise<Response | undefined> {
      // Transformers.js also probes local paths such as "/models/…".
      if (!isRemoteKey(key)) return undefined;
      try {
        const response = await fetchImpl(companionModelUrl(key, base));
        return response.ok ? response : undefined;
      } catch {
        return undefined;
      }
    },

    async put(key: string, response: Response): Promise<void> {
      if (!isRemoteKey(key)) return;
      // A Blob keeps large files out of the JS heap in Chrome, and unlike a
      // streamed request body it works over the Companion's HTTP/1.1.
      const body = await response.blob();
      const result = await fetchImpl(companionModelUrl(key, base), {
        method: 'PUT',
        headers: {
          'Content-Type':
            response.headers.get('content-type') || 'application/octet-stream',
        },
        body,
      });
      if (!result.ok) {
        throw new Error(
          `Companion could not store the file (HTTP ${result.status})`,
        );
      }
    },

    async delete(key: string): Promise<boolean> {
      if (!isRemoteKey(key)) return false;
      try {
        const result = await fetchImpl(companionModelUrl(key, base), {
          method: 'DELETE',
        });
        return result.ok;
      } catch {
        return false;
      }
    },
  };
}
