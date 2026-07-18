import { FirebaseAppHandler } from '../firebase/FirebaseAppHandler';
import type { StorageType, UserPreferences } from './shared-types';
import { BackendApiClient } from './BackendApiClient';
import type { StoredGraph } from '../utils/indexedDB';
import type { AccessType } from '../utils/interfaces';
import type {
  ApiKeySummary,
  AccountDataExport,
  MetadataListResult,
  QuotaInfo,
  StoredItem,
  StoredItemMetadata,
} from './BackendApiClient';

export class BackendGateway {
  private static gateway: BackendGateway | undefined;
  private routeClient = new BackendApiClient({ origin: '' });

  static getInstance(): BackendGateway {
    if (!this.gateway) {
      this.gateway = new BackendGateway();
    }
    return this.gateway;
  }

  initialize(): void {
    FirebaseAppHandler.getInstance();
  }

  isLoggedIn(): boolean {
    return FirebaseAppHandler.getInstance().getIsLoggedIn();
  }

  getIsLoggedIn(): boolean {
    return this.isLoggedIn();
  }

  getCurrentUser() {
    return FirebaseAppHandler.getInstance().getCurrentUser();
  }

  getCurrentUserId(): string | undefined {
    return this.getCurrentUser()?.uid;
  }

  refreshCurrentUserData() {
    return FirebaseAppHandler.getInstance().refreshCurrentUserData();
  }

  getAuthHeader(): Promise<Record<string, string>> {
    return FirebaseAppHandler.getInstance().getAuthHeader();
  }

  awaitPotentialLogin(): Promise<boolean> {
    return FirebaseAppHandler.getInstance().awaitPotentialLogin();
  }

  getUserPreferences(): Promise<UserPreferences> {
    return FirebaseAppHandler.getInstance().getUserPreferences();
  }

  setUserPreferences(
    preferencesData: Partial<UserPreferences>,
  ): Promise<boolean> {
    return FirebaseAppHandler.getInstance().setUserPreferences(preferencesData);
  }

  refreshGraphsMetadata(notifyListeners = true): Promise<boolean> {
    return FirebaseAppHandler.getInstance().refreshGraphsMetadata(
      notifyListeners,
    );
  }

  getGraphsMetadata(): MetadataListResult {
    return FirebaseAppHandler.getInstance().getGraphsMetadata();
  }

  getExampleGraphs(): Promise<StoredItemMetadata[]> {
    return FirebaseAppHandler.getInstance().getExampleGraphs();
  }

  tryGetGraph(
    userId: string,
    itemId: string,
    location: string,
    publicAccess = false,
  ): Promise<StoredGraph> {
    return FirebaseAppHandler.getInstance().tryGetGraph(
      userId,
      itemId,
      location,
      publicAccess,
    );
  }

  getPublicGraph(
    userId: string,
    location: string,
    name: string,
  ): Promise<StoredGraph> {
    return FirebaseAppHandler.getInstance().getPublicGraph(
      userId,
      location,
      name,
    );
  }

  getObject(itemId: string, location: string): Promise<StoredItem | undefined> {
    return FirebaseAppHandler.getInstance().getObject(itemId, location);
  }

  storeObject(
    data: any,
    location: string,
    itemId: string,
  ): Promise<{ quota: QuotaInfo }> {
    return FirebaseAppHandler.getInstance().storeObject(data, location, itemId);
  }

  storeItem(
    data: any,
    location: string,
    itemId: string,
    type: StorageType,
    access?: AccessType,
    date?: string,
  ): Promise<{ quota: QuotaInfo }> {
    return FirebaseAppHandler.getInstance().storeItem(
      data,
      location,
      itemId,
      type,
      access,
      date,
    );
  }

  listObjectsMetadata(): Promise<MetadataListResult> {
    return FirebaseAppHandler.getInstance().listObjectsMetadata();
  }

  deleteObject(itemId: string, location: string): Promise<void> {
    return FirebaseAppHandler.getInstance().deleteObject(itemId, location);
  }

  deleteItem(
    itemId: string,
    location: string,
    type: StorageType,
  ): Promise<boolean> {
    return FirebaseAppHandler.getInstance().deleteItem(itemId, location, type);
  }

  deleteGraph(itemId: string, location: string): Promise<void> {
    return FirebaseAppHandler.getInstance().deleteGraph(itemId, location);
  }

  getStorageQuota(): Promise<QuotaInfo> {
    return FirebaseAppHandler.getInstance().getStorageQuota();
  }

  getApiKeys(): Promise<ApiKeySummary[]> {
    return FirebaseAppHandler.getInstance().getApiKeys();
  }

  upsertApiKey({
    name,
    key,
    domain,
  }: {
    name: string;
    key: string;
    domain: string;
  }): Promise<boolean> {
    return FirebaseAppHandler.getInstance().upsertApiKey({ name, key, domain });
  }

  deleteApiKey(name: string): Promise<boolean> {
    return FirebaseAppHandler.getInstance().deleteApiKey(name);
  }

  exportAccountData(): Promise<AccountDataExport> {
    return FirebaseAppHandler.getInstance().exportAccountData();
  }

  deleteAccountData(confirmation: string): Promise<void> {
    return FirebaseAppHandler.getInstance().deleteAccountData(confirmation);
  }

  logAppOpened(appName: string): void {
    FirebaseAppHandler.getInstance().logAppOpened(appName);
  }

  logAIUsage(provider: string, model: string, tokensUsed: number): void {
    FirebaseAppHandler.getInstance().logAIUsage(provider, model, tokensUsed);
  }

  logCloudCompanionUsage(domain: string): void {
    FirebaseAppHandler.getInstance().logCloudCompanionUsage(domain);
  }

  getCloudCompanionBaseUrl(): string {
    return this.routeClient.getCloudCompanionBaseUrl();
  }

  getAIRelayEndpoint(): string {
    return this.routeClient.getAIRelayEndpoint();
  }

  getClaudeStreamEndpoint(): string {
    return this.routeClient.getClaudeStreamEndpoint();
  }
}
