import {
  CLOUD_MODE,
  EXECUTION_LOCATION_LOCAL,
  getDefaultPreferences,
  LOCAL_USER_ID,
  type UserPreferences,
} from '../services/shared-types';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { BackendGateway } from '../services/BackendGateway';
import { GraphDatabase } from '../utils/indexedDB';

const INDEXED_DB_PREFERENCES_KEY = 'userPreferences';
const LEGACY_LOCAL_STORAGE_PREFERENCES_KEY = 'tailrmade-user-preferences';

function getLocalDefaultPreferences(): UserPreferences {
  return {
    ...getDefaultPreferences(LOCAL_USER_ID),
    uid: LOCAL_USER_ID,
    saveInCloud: false,
    companionLocation: EXECUTION_LOCATION_LOCAL,
    aiLocation: EXECUTION_LOCATION_LOCAL,
  };
}

function safeParsePreferences(value: string | null): Partial<UserPreferences> {
  if (!value) {
    return {};
  }
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function readLegacyLocalStoragePreferences(): Partial<UserPreferences> {
  if (typeof window === 'undefined') {
    return {};
  }
  return safeParsePreferences(
    window.localStorage.getItem(LEGACY_LOCAL_STORAGE_PREFERENCES_KEY),
  );
}

function normalizeLocalPreferences(
  preferences: Partial<UserPreferences>,
): UserPreferences {
  return {
    ...getLocalDefaultPreferences(),
    ...preferences,
    uid: LOCAL_USER_ID,
    saveInCloud: false,
    companionLocation: EXECUTION_LOCATION_LOCAL,
    aiLocation: EXECUTION_LOCATION_LOCAL,
  };
}

function normalizeCloudPreferences(
  preferences: Partial<UserPreferences>,
  uid: string,
): UserPreferences {
  return {
    ...getDefaultPreferences(uid),
    ...preferences,
    uid,
  };
}

class IndexedDBUserPreferencesBackend {
  private db = new GraphDatabase();

  async load(): Promise<UserPreferences> {
    const storedPreferences = await this.db.settings.get(
      INDEXED_DB_PREFERENCES_KEY,
    );

    if (storedPreferences) {
      return normalizeLocalPreferences(
        safeParsePreferences(storedPreferences.value),
      );
    }

    const legacyPreferences = readLegacyLocalStoragePreferences();
    const preferences = normalizeLocalPreferences(legacyPreferences);
    await this.save(preferences);

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_PREFERENCES_KEY);
    }

    return preferences;
  }

  async save(preferences: UserPreferences): Promise<void> {
    await this.db.settings.put({
      name: INDEXED_DB_PREFERENCES_KEY,
      value: JSON.stringify(preferences),
    });
  }
}

class CloudUserPreferencesBackend {
  private backendGateway = BackendGateway.getInstance();

  get uid(): string {
    return this.backendGateway.getCurrentUserId() || '0';
  }

  get isAvailable(): boolean {
    return CLOUD_MODE && this.backendGateway.getIsLoggedIn();
  }

  async load(): Promise<UserPreferences> {
    return normalizeCloudPreferences(
      await this.backendGateway.getUserPreferences(),
      this.uid,
    );
  }

  async save(updates: Partial<UserPreferences>): Promise<UserPreferences> {
    await this.backendGateway.setUserPreferences(updates);
    return normalizeCloudPreferences(
      await this.backendGateway.getUserPreferences(),
      this.uid,
    );
  }
}

class UserPreferencesStore {
  private localBackend = new IndexedDBUserPreferencesBackend();
  private cloudBackend: CloudUserPreferencesBackend | undefined;

  private cachedPreferences: UserPreferences = CLOUD_MODE
    ? normalizeCloudPreferences(readLegacyLocalStoragePreferences(), '0')
    : normalizeLocalPreferences(readLegacyLocalStoragePreferences());

  private getCloudBackend(): CloudUserPreferencesBackend | undefined {
    if (!CLOUD_MODE) {
      return undefined;
    }
    if (!this.cloudBackend) {
      this.cloudBackend = new CloudUserPreferencesBackend();
    }
    return this.cloudBackend;
  }

  private useCloudBackend(): boolean {
    return this.getCloudBackend()?.isAvailable ?? false;
  }

  getCached(): UserPreferences {
    return this.cachedPreferences;
  }

  cacheExternal(preferences: UserPreferences): UserPreferences {
    this.cachedPreferences = this.useCloudBackend()
      ? normalizeCloudPreferences(
          preferences,
          this.getCloudBackend()?.uid || preferences.uid || '0',
        )
      : normalizeLocalPreferences(preferences);
    return this.cachedPreferences;
  }

  async load(): Promise<UserPreferences> {
    this.cachedPreferences = this.useCloudBackend()
      ? await this.getCloudBackend()!.load()
      : await this.localBackend.load();
    return this.cachedPreferences;
  }

  getOptimisticPreferences(updates: Partial<UserPreferences>): UserPreferences {
    return this.useCloudBackend()
      ? normalizeCloudPreferences(
          { ...this.cachedPreferences, ...updates },
          this.getCloudBackend()?.uid || '0',
        )
      : normalizeLocalPreferences({ ...this.cachedPreferences, ...updates });
  }

  async save(updates: Partial<UserPreferences>): Promise<UserPreferences> {
    if (this.useCloudBackend()) {
      this.cachedPreferences = await this.getCloudBackend()!.save(updates);
      return this.cachedPreferences;
    }

    this.cachedPreferences = normalizeLocalPreferences({
      ...this.cachedPreferences,
      ...updates,
    });
    await this.localBackend.save(this.cachedPreferences);
    InterfaceController.notifyListeners(
      ListenEvent.UserPreferencesUpdated,
      this.cachedPreferences,
    );
    return this.cachedPreferences;
  }
}

export const userPreferencesStore = new UserPreferencesStore();

export function getCachedUserPreferences(): UserPreferences {
  return userPreferencesStore.getCached();
}
