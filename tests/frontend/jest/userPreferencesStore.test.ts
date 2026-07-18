import { getDefaultPreferences } from '../../../src/services/shared-types';

type StoredSetting = { name: string; value: string };

const mockSettings = {
  values: new Map<string, StoredSetting>(),
  get: jest.fn((name: string) =>
    Promise.resolve(mockSettings.values.get(name)),
  ),
  put: jest.fn((setting: StoredSetting) => {
    mockSettings.values.set(setting.name, setting);
    return Promise.resolve();
  }),
};

const mockNotifyListeners = jest.fn();

const mockFirebaseHandler = {
  currentUser: { uid: 'user-123' },
  getCurrentUser: jest.fn(() => mockFirebaseHandler.currentUser),
  getIsLoggedIn: jest.fn(() => false),
  getUserPreferences: jest.fn(() =>
    Promise.resolve(getDefaultPreferences('user-123')),
  ),
  setUserPreferences: jest.fn(() => Promise.resolve(true)),
};

jest.mock('../../../src/utils/indexedDB', () => ({
  GraphDatabase: jest.fn().mockImplementation(() => ({
    settings: mockSettings,
  })),
}));

jest.mock('../../../src/firebase/FirebaseAppHandler', () => ({
  FirebaseAppHandler: {
    getInstance: jest.fn(() => mockFirebaseHandler),
  },
}));

jest.mock('../../../src/InterfaceController', () => ({
  __esModule: true,
  default: {
    notifyListeners: mockNotifyListeners,
  },
  ListenEvent: {
    UserPreferencesUpdated: 24,
  },
}));

describe('userPreferencesStore', () => {
  beforeEach(() => {
    jest.resetModules();
    mockSettings.values.clear();
    jest.clearAllMocks();
    mockFirebaseHandler.currentUser = { uid: 'user-123' };
    mockFirebaseHandler.getIsLoggedIn.mockReturnValue(false);
    mockFirebaseHandler.getCurrentUser.mockImplementation(
      () => mockFirebaseHandler.currentUser,
    );
    mockFirebaseHandler.getUserPreferences.mockImplementation(() =>
      Promise.resolve(getDefaultPreferences('user-123')),
    );
  });

  it('stores preferences in IndexedDB settings when no user is logged in', async () => {
    const { userPreferencesStore } =
      await import('../../../src/components/userPreferencesStore');

    await userPreferencesStore.load();
    const preferences = await userPreferencesStore.save({
      graphSortMode: 'name',
      saveInCloud: true,
    });

    expect(mockFirebaseHandler.setUserPreferences).not.toHaveBeenCalled();
    expect(mockSettings.put).toHaveBeenCalledWith({
      name: 'userPreferences',
      value: expect.any(String),
    });
    expect(preferences).toMatchObject({
      uid: 'local',
      graphSortMode: 'name',
      saveInCloud: false,
      companionLocation: 'local',
      aiLocation: 'local',
    });
    expect(
      JSON.parse(mockSettings.values.get('userPreferences')!.value),
    ).toEqual(preferences);
    expect(mockNotifyListeners).toHaveBeenCalledWith(24, preferences);
  });

  it('stores preferences on the current Firebase user when logged in', async () => {
    mockFirebaseHandler.getIsLoggedIn.mockReturnValue(true);
    mockFirebaseHandler.getUserPreferences.mockImplementation(() =>
      Promise.resolve({
        ...getDefaultPreferences('user-123'),
        graphSortMode: 'name',
      }),
    );

    const { userPreferencesStore } =
      await import('../../../src/components/userPreferencesStore');

    const preferences = await userPreferencesStore.save({
      graphSortMode: 'name',
    });

    expect(mockFirebaseHandler.setUserPreferences).toHaveBeenCalledWith({
      graphSortMode: 'name',
    });
    expect(mockSettings.put).not.toHaveBeenCalled();
    expect(mockNotifyListeners).not.toHaveBeenCalled();
    expect(preferences).toMatchObject({
      uid: 'user-123',
      graphSortMode: 'name',
    });
  });
});
