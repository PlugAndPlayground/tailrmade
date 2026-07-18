import { Analytics, logEvent } from 'firebase/analytics';
// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import {
  Auth,
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  connectAuthEmulator,
  signOut,
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  getIdToken,
  sendEmailVerification,
} from 'firebase/auth';
import { getPerformance, trace } from 'firebase/performance';
import MailChecker from 'mailchecker';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { StoredGraph } from '../utils/indexedDB';
import PPStorage from '../PPStorage';
import { AccessType } from '../utils/interfaces';
import {
  getDefaultPreferences,
  type StorageType,
  type UserData,
  type UserPreferences,
} from '../services/shared-types';
import {
  AccountDataExport,
  ApiKeySummary,
  BackendApiClient,
  MetadataListResult,
  QuotaInfo,
  StoredItem,
  StoredItemMetadata,
} from '../services/BackendApiClient';

const firebaseConfig = {
  apiKey: 'AIzaSyAp1onINhf_L8g6zW9_poghiAccxjDdwRQ',
  authDomain: 'plugandplayground.firebaseapp.com',
  databaseURL:
    'https://plugandplayground-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'plugandplayground',
  storageBucket: 'plugandplayground.firebasestorage.app',
  messagingSenderId: '451137850222',
  appId: '1:451137850222:web:37b679ab74eb174c7b0f7f',
  measurementId: 'G-Z3BTJYQ689',
};
const firebaseConfigEmulator = {
  apiKey: 'emulator-api-key',
  authDomain: 'localhost',
  projectId: process.env.GCLOUD_PROJECT || 'pnp-emulator',
  storageBucket: `${process.env.GCLOUD_PROJECT || 'pnp-emulator'}.appspot.com`,
  messagingSenderId: '0',
  appId: '1:0:web:emulator',
  measurementId: 'G-EMULATOR',
};

type StoredItemType = StorageType;

export type {
  AccountDataExport,
  ApiKeySummary,
  MetadataListResult,
  QuotaInfo,
  StoredItem,
  StoredItemMetadata,
};
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

const isFirebaseAuthEmulatorEnabled = () => Boolean(authEmulatorHost);

// Get the appropriate config based on environment variables
const getFirebaseConfig = () => {
  if (isFirebaseAuthEmulatorEnabled()) {
    return firebaseConfigEmulator;
  }
  return firebaseConfig;
};

const connectToAuthEmulatorIfConfigured = (auth: Auth) => {
  if (!authEmulatorHost || auth.emulatorConfig) {
    return;
  }
  const emulatorUrl = authEmulatorHost.startsWith('http')
    ? authEmulatorHost
    : `http://${authEmulatorHost}`;
  connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true });
};

export class FirebaseAppHandler {
  private static handler: FirebaseAppHandler | undefined = undefined;
  analytics: Analytics | undefined = undefined;
  auth: Auth | undefined = undefined;
  performance: any = undefined;
  private backendApi: BackendApiClient;
  // comes from firebase directly
  currentUser: User | null = null;
  // comes from database
  currentUserData: UserData | null = null;

  // Utility methods to reduce duplication
  private ensureUserLoggedIn(operation: string): void {
    if (!this.getIsLoggedIn()) {
      throw new Error(`User must be logged in to ${operation}`);
    }
  }

  private validateObjectId(objectId: string): void {
    if (!objectId || objectId.trim() === '') {
      throw new Error('Object ID cannot be empty');
    }
  }

  private constructor() {
    // Initialize Firebase with the appropriate config
    const app = initializeApp(getFirebaseConfig());
    this.auth = getAuth(app);
    connectToAuthEmulatorIfConfigured(this.auth);
    if (!isFirebaseAuthEmulatorEnabled()) {
      this.analytics = getAnalytics(app);
    }
    // Only initialize performance monitoring in production
    if (process.env.NODE_ENV === 'production') {
      this.performance = getPerformance(app);
    }
    this.backendApi = new BackendApiClient({
      authProvider: {
        getAuthHeader: () => this.getAuthHeader(),
        refreshAuthToken: async () => {
          if (this.currentUser) {
            await getIdToken(this.currentUser, true);
          }
        },
      },
      createTrace: (traceName) => this.createPerformanceTrace(traceName),
      onSessionExpired: () => {
        InterfaceController.showSnackBar(
          'Session expired. Please sign in again.',
        );
      },
    });

    // Setup auth state listener
    onAuthStateChanged(this.auth!, async (user) => {
      this.currentUser = user;
      await this.getAuthToken();

      // Parallelize all data fetching operations
      const [userData, userPreferences] = await Promise.all([
        this.refreshCurrentUserData(),
        this.getUserPreferences(),
        this.refreshGraphsMetadata(),
      ]);

      InterfaceController.notifyListenersBatch([
        {
          event: ListenEvent.UserPreferencesUpdated,
          data: userPreferences,
        },
        {
          event: ListenEvent.UserIsLoggedIn,
          data: user !== null,
        },
      ]);

      if (InterfaceController.toastEverything) {
        InterfaceController.showSnackBar(
          this.currentUser ? 'User logged in' : 'User logged out',
        );
      }
    });
  }

  public static getInstance() {
    if (this.handler == undefined) {
      this.handler = new FirebaseAppHandler();
    }
    return this.handler;
  }

  // Authentication methods
  async signUpWithEmail(email: string, password: string): Promise<User> {
    if (!MailChecker.isValid(email)) {
      throw new Error(
        'Temporary or disposable email addresses are not allowed. Please use a permanent email address.',
      );
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        this.auth!,
        email,
        password,
      );

      // Send verification email
      await sendEmailVerification(userCredential.user);

      // Show message to verify email
      InterfaceController.showSnackBar(
        'A verification email has been sent. Please verify your email before logging in.',
      );

      // Sign out - user must verify email before they can use the app
      await this.signOutUser();

      return userCredential.user;
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    }
  }

  async signInWithEmail(email: string, password: string): Promise<User> {
    try {
      const userCredential = await signInWithEmailAndPassword(
        this.auth!,
        email,
        password,
      );

      // Check if email is verified
      if (
        !userCredential.user.emailVerified &&
        !isFirebaseAuthEmulatorEnabled()
      ) {
        // Show message that verification is required
        InterfaceController.showSnackBar(
          'Email verification required. Please check your inbox and verify your email.',
        );

        // Resend verification email
        await sendEmailVerification(userCredential.user);

        // Sign out - user must verify email before they can use the app
        await this.signOutUser();

        throw new Error(
          'Email not verified. A new verification email has been sent.',
        );
      }

      return userCredential.user;
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  }

  async signInWithGoogle(): Promise<User> {
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(this.auth!, provider);

      return userCredential.user;
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  }

  async signOutUser(): Promise<void> {
    try {
      await signOut(this.auth!);
      this.currentUser = null;
      this.currentUserData = null;
      this.cachedUserPreferences = undefined;
      InterfaceController.notifyListenersBatch([
        {
          event: ListenEvent.UserPreferencesUpdated,
          data: this.getDefaultPreferencesWithMyID(),
        },
        {
          event: ListenEvent.UserIsLoggedIn,
          data: false,
        },
        {
          event: ListenEvent.UserHasProAccessChanged,
          data: false,
        },
      ]);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }

  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth!, email);
    } catch (error) {
      console.error('Error resetting password:', error);
      throw error;
    }
  }

  private async getUserData() {
    try {
      if (!this.currentUser) {
        return null;
      }

      return await this.backendApi.getUserData();
    } catch (error) {
      console.error('Error fetching user data:', error);
      return null; // Return null instead of throwing to handle errors gracefully
    }
  }

  async awaitPotentialLogin(
    retries: number = 40,
    delayMs: number = 50,
  ): Promise<boolean> {
    for (let attemptIndex = 0; attemptIndex < retries; attemptIndex++) {
      if (this.getIsLoggedIn()) {
        return true;
      }
      console.log('waiting for potential login...');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return false;
  }

  getIsLoggedIn(): boolean {
    return this.getCurrentUser() !== null;
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }
  async refreshCurrentUserData(): Promise<UserData | null> {
    this.currentUserData = await this.getUserData();
    return this.currentUserData;
  }

  getCurrentUserData(): UserData | null {
    return this.currentUserData;
  }

  /**
   * Get the current user's authentication token for backend requests
   */
  async getAuthToken(): Promise<string | null> {
    const user = this.currentUser;
    if (!user) return null;

    try {
      const token = await getIdToken(user);
      return token;
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  /**
   * Create an authorization header with the Firebase token
   */
  async getAuthHeader(): Promise<Record<string, string>> {
    const token = await this.getAuthToken(); // Always get fresh token - Firebase SDK handles caching
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Create a performance trace to measure a specific operation
   * @param traceName The name of the trace
   * @returns A Trace object that can be started and stopped
   */
  createPerformanceTrace(traceName: string): any {
    // If performance monitoring is not initialized, return a dummy trace object
    if (!this.performance) {
      return {
        start: () => {},
        stop: () => {},
        putAttribute: () => {},
      };
    }
    return trace(this.performance, traceName);
  }

  /**
   * Log when an app is opened for analytics
   * @param appName The name of the app being opened
   */
  logAppOpened(appName: string): void {
    if (this.analytics) {
      logEvent(this.analytics, 'app_opened', {
        app_name: appName,
      });
    }
  }

  logAIUsage(provider: string, model: string, tokensUsed: number): void {
    if (this.analytics) {
      logEvent(this.analytics, 'ai_token_usage', {
        provider,
        model,
        tokens_used: tokensUsed,
      });
    }
  }

  logCloudCompanionUsage(domain: string): void {
    if (this.analytics) {
      logEvent(this.analytics, 'cloud_companion_usage', {
        domain,
      });
    }
  }

  /**
   * Make an authenticated API request to your backend with performance tracing
   * Automatically retries once on 401 errors with a fresh token
   */
  async authenticatedFetch(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    return this.backendApi.authenticatedFetch(url, options);
  }

  async getUserStorageQuota(): Promise<QuotaInfo> {
    return this.backendApi.getUserStorageQuota();
  }

  // ---------- STORAGE METHODS ----------

  /**
   * Store or update a JSON object in Firebase
   * @param data Any JSON-serializable object to store
   * @param location Optional location/folder path (defaults to 'default')
   * @param itemId Optional ID for updating an existing object
   * @returns Object with objectId and quota information
   */

  private async extractErrorMessage(
    response: Response,
    fallback: string,
  ): Promise<string> {
    return this.backendApi.extractErrorMessage(response, fallback);
  }

  async storeObject(
    data: any,
    location: string,
    itemId: string,
  ): Promise<{ quota: QuotaInfo }> {
    return this.storeItem(data, location, itemId, 'object');
  }

  async storeItem(
    data: any,
    location: string,
    itemId: string,
    type: StoredItemType,
    access: AccessType = 'private',
    date: string = new Date().toISOString(),
  ): Promise<{ quota: QuotaInfo }> {
    try {
      this.ensureUserLoggedIn(`store ${type}`);

      // Validate objectId if provided
      if (itemId !== undefined) {
        this.validateObjectId(itemId);
      }
      return this.backendApi.storeItem(
        data,
        location,
        itemId,
        type,
        access,
        date,
      );
    } catch (error) {
      InterfaceController.showSnackBar(`Error storing ${type}: ${error}`);
      console.error(`Error storing ${type}:`, error);
      throw error;
    }
  }

  // ---------- STORAGE METHODS ----------

  async listItemsMetadata(type: StoredItemType): Promise<MetadataListResult> {
    try {
      this.ensureUserLoggedIn(`list ${type}s`);

      return this.backendApi.listItemsMetadata(type);
    } catch (error) {
      console.error(`Error listing ${type}s:`, error);
      return {
        objects: [],
      };
    }
  }

  cachedGraphs: StoredItemMetadata[] = [];

  async refreshGraphsMetadata(notifyListeners = true): Promise<boolean> {
    let success = false;
    if (this.getIsLoggedIn()) {
      console.log('Fetching Cloud Graphs');
      const result = await this.listItemsMetadata('graph');
      this.cachedGraphs = result.objects;
      success = true;
    } else {
      this.cachedGraphs = [];
      success = false;
    }
    if (notifyListeners) {
      InterfaceController.notifyListeners(
        ListenEvent.GraphListUpdated,
        this.cachedGraphs,
      );
    }
    return success;
  }

  getGraphsMetadata(): MetadataListResult {
    return {
      objects: this.cachedGraphs,
    };
  }

  /**
   * Retrieve a list of all stored objects metadata for the current user
   * Returns only metadata (id, objectId, location, timestamps) without the full data
   * @returns Object containing array of metadata and quota information
   */
  async listObjectsMetadata(): Promise<MetadataListResult> {
    return this.listItemsMetadata('object');
  }

  /**
   * Retrieve a list of objects filtered by location (deprecated)
   * @param location Location to filter by
   * @returns Array of objects in the specified location
   * @deprecated Use listObjectsMetadata() and filter client-side instead
   */
  async listObjects(location?: string): Promise<StoredItemMetadata[]> {
    const result = await this.listObjectsMetadata();
    if (location) {
      return result.objects.filter((obj) => obj.location === location);
    }
    return result.objects;
  }

  /**
   * Get a single item by its ID (with full data)
   * @param itemId The ID of the item to retrieve
   * @param location The location of the item
   * @param type The type of item to retrieve (object or graph)
   * @returns The complete stored item or undefined if not found
   */
  async getItem(
    itemId: string,
    location: string,
    type: StoredItemType,
  ): Promise<StoredItem | undefined> {
    try {
      this.ensureUserLoggedIn(`get ${type}`);
      this.validateObjectId(itemId);

      return this.backendApi.getItem(itemId, location, type);
    } catch (error) {
      console.error(`Error getting ${type}:`, error);
      return undefined;
    }
  }

  /**
   * Get a single object by its ID (with full data)
   * @param itemId The ID of the object to retrieve
   * @param location The location of the object, defaults to 'default'
   * @returns The complete stored object or undefined if not found
   */
  async getObject(
    itemId: string,
    location: string,
  ): Promise<StoredItem | undefined> {
    return this.getItem(itemId, location, 'object');
  }

  /**
   * Get a single graph by its ID (with full data)
   * @param itemId The ID of the graph to retrieve
   * @param location The location of the graph, defaults to 'default'
   * @returns The complete stored graph or undefined if not found
   */
  async getGraph(
    itemId: string,
    location: string,
  ): Promise<StoredItem | undefined> {
    return this.getItem(itemId, location, 'graph');
  }

  /**
   * Delete an item by its ID
   * @param itemId The ID of the item to delete
   * @param location Location of the item to delete
   * @param type The type of item to delete (object or graph)
   */
  async deleteItem(
    itemId: string,
    location: string,
    type: StoredItemType,
  ): Promise<boolean> {
    try {
      this.ensureUserLoggedIn(`delete ${type}`);
      this.validateObjectId(itemId);

      return this.backendApi.deleteItem(itemId, location, type);
    } catch (error) {
      //InterfaceController.showSnackBar(`Error deleting ${type}:`, error);
      console.warn(`Error deleting ${type}:`, error);
      return false;
    }
  }

  /**
   * Delete an object by its ID
   * @param itemId The ID of the object to delete
   * @param location Location of the object to delete
   */
  async deleteObject(itemId: string, location: string): Promise<void> {
    void this.deleteItem(itemId, location, 'object');
  }

  /**
   * Delete a graph by its ID
   * @param itemId The ID of the graph to delete
   * @param location Location of the graph to delete
   */
  async deleteGraph(itemId: string, location: string): Promise<void> {
    void this.deleteItem(itemId, location, 'graph');
  }

  /**
   * Get user's current storage quota
   * @returns The most recent quota information
   */
  async getStorageQuota(): Promise<QuotaInfo> {
    const result = await this.getUserStorageQuota();
    return result;
  }

  cachedExampleGraphs: StoredItemMetadata[] = [];
  cachedUserPreferences: UserPreferences | undefined = undefined;

  async getExampleGraphs(): Promise<StoredItemMetadata[]> {
    if (this.cachedExampleGraphs.length === 0) {
      try {
        this.cachedExampleGraphs = await this.backendApi.getExampleGraphs();
      } catch (error) {
        console.error('Error getting example graphs, maybe offline? ', error);
        return this.cachedExampleGraphs;
      }
    }
    return this.cachedExampleGraphs;
  }

  async tryGetGraph(
    userId: string,
    itemId: string,
    location: string,
    publicAccess: boolean = false,
  ): Promise<StoredGraph> {
    if (publicAccess) {
      console.log('getting public graph');
      return this.getPublicGraph(userId, location, itemId);
    } else {
      console.log('getting private graph');
      const graph = await this.getGraph(itemId, location);
      console.log('graph', graph);
      return PPStorage.getInstance().stringToStoredGraph(graph?.data);
    }
  }

  /**
   * Retrieves a public graph by its ID, location, and user ID
   *
   * @param userId The user ID of the graph owner
   * @param location The location/folder of the graph
   * @param name The name of the graph to retrieve
   * @returns The public graph data or throws an error if not found/not public
   */
  async getPublicGraph(
    userId: string,
    location: string,
    name: string,
  ): Promise<StoredGraph> {
    try {
      const graphData = await this.backendApi.getPublicGraph(
        userId,
        location,
        name,
      );
      return PPStorage.getInstance().stringToStoredGraph(graphData);
    } catch (error) {
      console.error('Error retrieving public graph:', error);
      throw error;
    }
  }

  getDefaultPreferencesWithMyID() {
    return getDefaultPreferences(this.currentUser?.uid || '0');
  }

  /**
   * Get user preferences from the server
   * @returns The user preferences or null if not found or user is not logged in
   */
  async getUserPreferences(): Promise<UserPreferences> {
    if (this.cachedUserPreferences !== undefined) {
      return this.cachedUserPreferences;
    }
    try {
      if (!this.getIsLoggedIn()) {
        return this.getDefaultPreferencesWithMyID();
      }

      this.cachedUserPreferences = await this.backendApi.getUserPreferences();
    } catch (error) {
      InterfaceController.showSnackBar(
        `Error fetching user preferences: ${error}`,
      );
      console.error('Error fetching user preferences:', error);
      return this.getDefaultPreferencesWithMyID();
    }
    if (this.cachedUserPreferences) {
      return this.cachedUserPreferences;
    } else {
      return this.getDefaultPreferencesWithMyID();
    }
  }

  /**
   * Update user preferences on the server
   * @param preferencesData The preferences data to update
   * @returns True if the update was successful, false otherwise
   */
  async setUserPreferences(
    preferencesData: Partial<UserPreferences>,
  ): Promise<boolean> {
    try {
      this.ensureUserLoggedIn('update preferences');

      void this.backendApi.setUserPreferences(preferencesData);

      this.cachedUserPreferences = {
        ...this.getDefaultPreferencesWithMyID(),
        ...this.cachedUserPreferences,
        ...preferencesData,
        uid: this.currentUser?.uid!,
      };

      InterfaceController.notifyListeners(
        ListenEvent.UserPreferencesUpdated,
        await this.getUserPreferences(),
      );
      return true;
    } catch (error) {
      console.error('Error updating user preferences:', error);
      InterfaceController.showSnackBar(`Error updating preferences: ${error}`);
      return false;
    }
  }

  async getApiKeys(): Promise<ApiKeySummary[]> {
    try {
      this.ensureUserLoggedIn('fetch API keys');
      return this.backendApi.getApiKeys();
    } catch (error) {
      console.error('Error fetching API keys:', error);
      InterfaceController.showSnackBar(`Error fetching API keys: ${error}`);
      return [];
    }
  }

  async upsertApiKey({
    name,
    key,
    domain,
  }: {
    name: string;
    key: string;
    domain: string;
  }): Promise<boolean> {
    try {
      this.ensureUserLoggedIn('save API key');

      await this.backendApi.upsertApiKey({ name, key, domain });

      return true;
    } catch (error) {
      console.error('Error saving API key:', error);
      InterfaceController.showSnackBar(`Error saving API key: ${error}`);
      return false;
    }
  }

  async deleteApiKey(name: string): Promise<boolean> {
    try {
      this.ensureUserLoggedIn('delete API key');

      await this.backendApi.deleteApiKey(name);

      return true;
    } catch (error) {
      console.error('Error deleting API key:', error);
      InterfaceController.showSnackBar(`Error deleting API key: ${error}`);
      return false;
    }
  }

  async exportAccountData(): Promise<AccountDataExport> {
    this.ensureUserLoggedIn('export account data');

    return this.backendApi.exportAccountData();
  }

  async deleteAccountData(confirmation: string): Promise<void> {
    this.ensureUserLoggedIn('delete account');

    await this.backendApi.deleteAccountData(confirmation);

    await signOut(this.auth!);
    this.currentUser = null;
    this.currentUserData = null;
    this.cachedUserPreferences = undefined;
    this.cachedGraphs = [];
    InterfaceController.notifyListenersBatch([
      {
        event: ListenEvent.UserPreferencesUpdated,
        data: this.getDefaultPreferencesWithMyID(),
      },
      {
        event: ListenEvent.UserIsLoggedIn,
        data: false,
      },
      {
        event: ListenEvent.UserHasProAccessChanged,
        data: false,
      },
    ]);
  }
}
