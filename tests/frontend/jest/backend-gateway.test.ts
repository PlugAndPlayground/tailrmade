const mockHandler = {
  refreshGraphsMetadata: jest.fn().mockResolvedValue(true),
};
const mockGetInstance = jest.fn(() => mockHandler);
const mockNotifyListeners = jest.fn();

jest.mock('../../../src/firebase/FirebaseAppHandler', () => ({
  FirebaseAppHandler: { getInstance: mockGetInstance },
}));
jest.mock('../../../src/InterfaceController', () => ({
  __esModule: true,
  default: { notifyListeners: mockNotifyListeners },
  ListenEvent: { GraphListUpdated: 'GraphListUpdated' },
}));

describe('backend gateway storage mode', () => {
  const originalCloudMode = process.env.CLOUD_MODE;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalCloudMode === undefined) delete process.env.CLOUD_MODE;
    else process.env.CLOUD_MODE = originalCloudMode;
  });

  it('keeps local app operations out of Firebase and updates the graph list', async () => {
    process.env.CLOUD_MODE = 'false';
    const { BackendGateway } =
      await import('../../../src/services/BackendGateway');
    const gateway = BackendGateway.getInstance();

    gateway.initialize();
    gateway.logAppOpened('Local app');
    gateway.logAIUsage('local', 'model', 1);
    gateway.logCloudCompanionUsage('example.com');
    expect(gateway.getIsLoggedIn()).toBe(false);
    expect(gateway.getCurrentUser()).toBeNull();
    expect(gateway.getCurrentUserId()).toBeUndefined();
    await expect(gateway.awaitPotentialLogin()).resolves.toBe(false);
    await expect(gateway.refreshCurrentUserData()).resolves.toBeNull();
    await expect(gateway.getExampleGraphs()).resolves.toEqual([]);
    expect(gateway.getGraphsMetadata()).toEqual({ objects: [] });
    await expect(gateway.refreshGraphsMetadata()).resolves.toBe(false);
    expect(mockNotifyListeners).toHaveBeenCalledWith('GraphListUpdated', []);
    mockNotifyListeners.mockClear();
    await gateway.refreshGraphsMetadata(false);
    expect(mockNotifyListeners).not.toHaveBeenCalled();
    expect(mockGetInstance).not.toHaveBeenCalled();
  });

  it('still delegates graph refreshes in cloud mode', async () => {
    process.env.CLOUD_MODE = 'true';
    const { BackendGateway } =
      await import('../../../src/services/BackendGateway');
    await expect(
      BackendGateway.getInstance().refreshGraphsMetadata(false),
    ).resolves.toBe(true);
    expect(mockHandler.refreshGraphsMetadata).toHaveBeenCalledWith(false);
  });
});
