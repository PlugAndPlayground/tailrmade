import { FirebaseAppHandler } from '../../../src/firebase/FirebaseAppHandler';

jest.mock('../../../src/PPStorage', () => ({
  __esModule: true,
  default: { getInstance: () => ({ stringToStoredGraph: JSON.parse }) },
}));
jest.mock('../../../src/InterfaceController', () => ({
  __esModule: true,
  default: { notifyListeners: jest.fn() },
  ListenEvent: { GraphListUpdated: 'GraphListUpdated' },
}));

it('handles an asynchronous graph-list failure inside the error handler', async () => {
  const error = new Error('Failed to list graphs (HTTP 404)');
  const handler = Object.create(FirebaseAppHandler.prototype);
  handler.currentUser = { uid: 'persisted-user' };
  handler.backendApi = {
    listItemsMetadata: jest.fn().mockRejectedValue(error),
  };
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(handler.listItemsMetadata('graph')).resolves.toEqual({
      objects: [],
    });
    expect(log).toHaveBeenCalledWith('Error listing graphs:', error);
  } finally {
    log.mockRestore();
  }
});

it('reports a missing graph instead of attempting to parse undefined', async () => {
  const handler = Object.create(FirebaseAppHandler.prototype);
  handler.getGraph = jest.fn().mockResolvedValue(undefined);
  await expect(
    handler.tryGetGraph('owner', 'Missing app', 'Default'),
  ).rejects.toThrow('App "Missing app" not found in "Default"');
});

it('propagates account lookup errors instead of substituting Firebase profile data', async () => {
  const handler = Object.create(FirebaseAppHandler.prototype);
  const error = new Error('TM account service failed');
  handler.currentUser = {
    uid: 'owner',
    displayName: 'Fallback name',
    email: 'fallback@example.com',
  };
  handler.getGraph = jest.fn().mockResolvedValue({ data: '{}' });
  handler.backendApi = { getUserData: jest.fn().mockRejectedValue(error) };
  await expect(handler.tryGetGraph('owner', 'App', 'Default')).rejects.toBe(
    error,
  );
});

it('reports unavailable owner account data', async () => {
  const handler = Object.create(FirebaseAppHandler.prototype);
  handler.getGraph = jest.fn().mockResolvedValue({ data: '{}' });
  handler.backendApi = { getUserData: jest.fn().mockResolvedValue(null) };
  await expect(handler.tryGetGraph('owner', 'App', 'Default')).rejects.toThrow(
    'TM account data unavailable for graph owner',
  );
});

it('propagates authentication failures when retrieving storage items', async () => {
  const handler = Object.create(FirebaseAppHandler.prototype);
  handler.currentUser = null;
  await expect(handler.getItem('App', 'Default', 'graph')).rejects.toThrow(
    'User must be logged in to get graph',
  );
});
