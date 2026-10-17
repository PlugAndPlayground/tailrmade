import { FirebaseAppHandler } from '../../../src/firebase/FirebaseAppHandler';

jest.mock('../../../src/PPStorage', () => ({ __esModule: true, default: {} }));
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
