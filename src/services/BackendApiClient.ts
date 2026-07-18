import type { StorageType, UserData, UserPreferences } from './shared-types';
import type { AccessType } from '../utils/interfaces';

export interface BackendTrace {
  start(): void;
  stop(): void;
  putAttribute(name: string, value: string): void;
}

export interface BackendAuthProvider {
  getAuthHeader(): Promise<Record<string, string>>;
  refreshAuthToken?(): Promise<void>;
}

export interface BackendApiClientOptions {
  origin?: string;
  authProvider?: BackendAuthProvider;
  createTrace?: (traceName: string) => BackendTrace;
  onSessionExpired?: () => void;
}

export interface StorageResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
  message?: string;
  quota?: QuotaInfo;
}

export interface QuotaInfo {
  currentUsage: number;
  maxAllowed: number;
  remaining?: number;
  percentUsed?: number;
}

export interface ApiKeySummary {
  name: string;
  domain: string;
}

export interface AccountDataExport {
  exportedAt: string;
  account: UserData | null;
  preferences: UserPreferences | null;
  apiKeys: Array<{
    name: string;
    key: string;
    domain: string;
  }>;
  storageFiles: Array<{
    path: string;
    contentType?: string;
    size: number;
    updatedAt?: string;
    customMetadata: Record<string, string>;
    data: string;
  }>;
}

export interface StoredItemMetadata {
  id: string;
  objectId: string;
  location: string;
  owner: string;
  updatedAt: string;
}

export interface StoredItem extends StoredItemMetadata {
  data: any;
}

export interface MetadataListResult {
  objects: StoredItemMetadata[];
}

type BackendNamespace = 'auth' | 'storage' | 'public' | 'cloudCompanion';

const noopTrace: BackendTrace = {
  start: () => {},
  stop: () => {},
  putAttribute: () => {},
};

export class BackendApiClient {
  private origin: string;
  private authProvider?: BackendAuthProvider;
  private createTrace: (traceName: string) => BackendTrace;
  private onSessionExpired?: () => void;

  constructor(options: BackendApiClientOptions = {}) {
    this.origin =
      options.origin ??
      (typeof window !== 'undefined' ? window.location.origin : '');
    this.authProvider = options.authProvider;
    this.createTrace = options.createTrace ?? (() => noopTrace);
    this.onSessionExpired = options.onSessionExpired;
  }

  getCloudCompanionBaseUrl(): string {
    return this.url('cloudCompanion');
  }

  getAIRelayEndpoint(): string {
    return this.path('auth', '/ai-request');
  }

  getClaudeStreamEndpoint(): string {
    return this.path('auth', '/ai-request-claude-stream');
  }

  async getAuthHeader(): Promise<Record<string, string>> {
    return this.authProvider?.getAuthHeader() ?? {};
  }

  async authenticatedFetch(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    return this.fetchWithOptionalAuth(url, options, true);
  }

  async cloudFunctionFetch(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    return this.authenticatedFetch(this.path('auth', path), options);
  }

  async extractErrorMessage(
    response: Response,
    fallback: string,
  ): Promise<string> {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const errorData = await response.json();
        return errorData.error || errorData.details || fallback;
      } catch {
        // JSON parse failed despite the content-type header.
      }
    }
    if (response.status === 401 || response.status === 403) {
      return 'Not authenticated. Please sign in first.';
    }
    return `${fallback} (HTTP ${response.status})`;
  }

  async getUserData(): Promise<UserData | null> {
    const response = await this.fetchAuth('/user-data');

    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        await this.extractErrorMessage(response, 'Failed to fetch user data'),
      );
    }

    return response.json();
  }

  async getUserPreferences(): Promise<UserPreferences> {
    const response = await this.fetchAuth('/preferences');

    if (!response.ok) {
      throw new Error(
        await this.extractErrorMessage(
          response,
          'Failed to fetch user preferences',
        ),
      );
    }

    return response.json();
  }

  async setUserPreferences(
    preferencesData: Partial<UserPreferences>,
  ): Promise<void> {
    const response = await this.fetchAuth('/preferences', {
      method: 'POST',
      body: JSON.stringify(preferencesData),
    });

    if (!response.ok) {
      throw new Error(
        await this.extractErrorMessage(
          response,
          'Failed to update user preferences',
        ),
      );
    }
  }

  async getUserStorageQuota(): Promise<QuotaInfo> {
    const response = await this.fetchStorage('/quota');
    const result: StorageResponse<QuotaInfo> = await response.json();
    return result.quota!;
  }

  async storeItem(
    data: any,
    location: string,
    itemId: string,
    type: StorageType,
    access: AccessType = 'private',
    date: string = new Date().toISOString(),
  ): Promise<{ quota: QuotaInfo }> {
    const response = await this.fetchStorage(`/${type}s`, {
      method: 'POST',
      body: JSON.stringify({
        data,
        location,
        objectId: itemId,
        access,
        date,
      }),
    });

    if (!response.ok) {
      throw new Error(
        await this.extractErrorMessage(response, `Failed to store ${type}`),
      );
    }

    const result: StorageResponse<{ date: string }> = await response.json();
    return {
      quota: result.quota!,
    };
  }

  async listItemsMetadata(type: StorageType): Promise<MetadataListResult> {
    const response = await this.fetchStorage(`/${type}s`);

    if (!response.ok) {
      throw new Error(
        await this.extractErrorMessage(response, `Failed to list ${type}s`),
      );
    }

    const result: StorageResponse<StoredItemMetadata[]> = await response.json();

    return {
      objects: result.data || [],
    };
  }

  async getItem(
    itemId: string,
    location: string,
    type: StorageType,
  ): Promise<StoredItem | undefined> {
    const response = await this.fetchStorage(
      `/${type}/${encodeURIComponent(location)}/${encodeURIComponent(itemId)}`,
    );

    if (response.status === 404) {
      return undefined;
    }

    if (!response.ok) {
      throw new Error(
        await this.extractErrorMessage(response, `Failed to get ${type}`),
      );
    }

    const result: StorageResponse<StoredItem> = await response.json();
    return result.data || undefined;
  }

  async deleteItem(
    itemId: string,
    location: string,
    type: StorageType,
  ): Promise<boolean> {
    const response = await this.fetchStorage(
      `/${type}/${encodeURIComponent(location)}/${encodeURIComponent(itemId)}`,
      {
        method: 'DELETE',
      },
    );

    if (!response.ok) {
      return false;
    }
    return true;
  }

  async getExampleGraphs(): Promise<StoredItemMetadata[]> {
    const response = await this.fetchPublic('/exampleGraphs');
    if (!response.ok) {
      throw new Error(
        await this.extractErrorMessage(
          response,
          'Failed to fetch example graphs',
        ),
      );
    }
    return (await response.json()).data;
  }

  async getPublicGraph(
    userId: string,
    location: string,
    name: string,
  ): Promise<string> {
    const response = await this.fetchPublic(
      `/graph/${encodeURIComponent(userId)}/${encodeURIComponent(location)}/${encodeURIComponent(name)}`,
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`${name} app not found or not public`);
      }
      throw new Error(
        await this.extractErrorMessage(
          response,
          'Failed to retrieve public graph',
        ),
      );
    }

    const result = await response.json();
    if (!result.success || !result.data) {
      throw new Error('Invalid response when retrieving public graph');
    }

    return result.data;
  }

  async getApiKeys(): Promise<ApiKeySummary[]> {
    const response = await this.fetchAuth('/api-keys');

    if (!response.ok) {
      throw new Error(
        await this.extractErrorMessage(response, 'Failed to fetch API keys'),
      );
    }

    return response.json();
  }

  async upsertApiKey({
    name,
    key,
    domain,
  }: {
    name: string;
    key: string;
    domain: string;
  }): Promise<void> {
    const response = await this.fetchAuth(
      `/api-keys/${encodeURIComponent(name)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ key, domain }),
      },
    );

    if (!response.ok) {
      throw new Error(
        await this.extractErrorMessage(response, 'Failed to save API key'),
      );
    }
  }

  async deleteApiKey(name: string): Promise<void> {
    const response = await this.fetchAuth(
      `/api-keys/${encodeURIComponent(name)}`,
      {
        method: 'DELETE',
      },
    );

    if (!response.ok && response.status !== 204) {
      throw new Error(
        await this.extractErrorMessage(response, 'Failed to delete API key'),
      );
    }
  }

  async exportAccountData(): Promise<AccountDataExport> {
    const response = await this.fetchAuth('/account-data/export');

    if (!response.ok) {
      throw new Error(
        await this.extractErrorMessage(
          response,
          'Failed to export account data',
        ),
      );
    }

    return response.json();
  }

  async deleteAccountData(confirmation: string): Promise<void> {
    const response = await this.fetchAuth('/account-data/account', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation }),
    });

    if (!response.ok) {
      throw new Error(
        await this.extractErrorMessage(response, 'Failed to delete account'),
      );
    }
  }

  private fetchAuth(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    return this.fetchWithOptionalAuth(this.path('auth', path), options, true);
  }

  private fetchStorage(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    return this.fetchWithOptionalAuth(
      this.path('storage', path),
      options,
      true,
    );
  }

  private fetchPublic(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    return this.fetchWithOptionalAuth(
      this.path('public', path),
      options,
      false,
    );
  }

  private async fetchWithOptionalAuth(
    url: string,
    options: RequestInit,
    authenticated: boolean,
  ): Promise<Response> {
    const fetchTrace = this.createTrace(`fetch_${url.split('/').pop()}`);
    fetchTrace.start();

    try {
      const response = await fetch(url, {
        ...options,
        headers: await this.buildHeaders(options.headers, authenticated),
      });

      if (
        response.status === 401 &&
        authenticated &&
        this.authProvider?.refreshAuthToken
      ) {
        try {
          await this.authProvider.refreshAuthToken();
          const retryResponse = await fetch(url, {
            ...options,
            headers: await this.buildHeaders(options.headers, authenticated),
          });
          fetchTrace.putAttribute('status', retryResponse.status.toString());
          fetchTrace.putAttribute('retried', 'true');
          return retryResponse;
        } catch (refreshError) {
          console.error('Failed to refresh token:', refreshError);
          this.onSessionExpired?.();
        }
      }

      fetchTrace.putAttribute('status', response.status.toString());
      return response;
    } catch (error) {
      fetchTrace.putAttribute('error', 'true');
      throw error;
    } finally {
      fetchTrace.stop();
    }
  }

  private async buildHeaders(
    headers: HeadersInit | undefined,
    authenticated: boolean,
  ): Promise<Record<string, string>> {
    return {
      ...(headers as Record<string, string> | undefined),
      ...(authenticated ? await this.getAuthHeader() : {}),
      'Content-Type': 'application/json',
    };
  }

  private path(namespace: BackendNamespace, path: string): string {
    return `${this.url(namespace)}${path}`;
  }

  private url(namespace: BackendNamespace): string {
    const prefix =
      namespace === 'cloudCompanion' ? '/cloud-companion' : `/${namespace}`;
    return `${this.origin}${prefix}`;
  }
}
