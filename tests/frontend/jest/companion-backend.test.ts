const mockGateway = {
  getUserPreferences: jest.fn(),
  isLoggedIn: jest.fn(),
  getCloudCompanionBaseUrl: () => 'https://example.test/cloud-companion',
  getAuthHeader: jest.fn(),
  logCloudCompanionUsage: jest.fn(),
};

jest.mock('../../../src/services/BackendGateway', () => ({
  BackendGateway: { getInstance: () => mockGateway },
}));
jest.mock('../../../src/services/shared-types', () => ({
  CLOUD_MODE: true,
  EXECUTION_LOCATION_CLOUD: 'cloud',
}));
jest.mock('../../../src/InterfaceController', () => ({
  __esModule: true,
  default: { notifyListeners: jest.fn() },
  ListenEvent: {},
}));

import { CompanionBackend } from '../../../src/services/CompanionBackend';

const message = {
  finalHeaders: {},
  finalBody: '{}',
  finalURL: 'https://api.test',
  finalMethod: 'Get',
};
const originalFetch = global.fetch;
const mockFetch = jest.fn();
const send = () => CompanionBackend.getInstance().sendMessage(message);

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
  mockGateway.getUserPreferences.mockResolvedValue({
    companionLocation: 'local',
  });
  mockGateway.isLoggedIn.mockReturnValue(true);
  mockGateway.getAuthHeader.mockResolvedValue({ Authorization: 'Bearer test' });
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

test('unreachable local companion identifies the address and remedy', async () => {
  mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(send()).rejects.toThrow(
    'Local Companion is unreachable at http://localhost:6655. Start the Companion and retry.',
  );
});

test('cloud selection never silently falls back to local when signed out', async () => {
  mockGateway.getUserPreferences.mockResolvedValue({
    companionLocation: 'cloud',
  });
  mockGateway.isLoggedIn.mockReturnValue(false);
  await expect(send()).rejects.toThrow('requires sign-in');
  expect(mockFetch).not.toHaveBeenCalled();
});

test.each([
  [401, 'access was denied'],
  [403, 'access was denied'],
  [429, 'request limit reached'],
  [503, 'HTTP 503'],
])('cloud HTTP %s has an actionable error', async (status, text) => {
  mockGateway.getUserPreferences.mockResolvedValue({
    companionLocation: 'cloud',
  });
  mockFetch.mockResolvedValue({ ok: false, status });
  await expect(send()).rejects.toThrow(text);
});

test('cloud connection failures are distinguished from local failures', async () => {
  mockGateway.getUserPreferences.mockResolvedValue({
    companionLocation: 'cloud',
  });
  mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(send()).rejects.toThrow('Cloud Companion is unreachable');
});

test('invalid JSON is not reported as a connection failure', async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => {
      throw new SyntaxError();
    },
  });
  await expect(send()).rejects.toThrow('returned an invalid response');
});

test('malformed response is rejected', async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ error: 'bad response' }),
  });
  await expect(send()).rejects.toThrow('returned an invalid response');
});

test('usage limits in the response are surfaced as errors', async () => {
  mockGateway.getUserPreferences.mockResolvedValue({
    companionLocation: 'cloud',
  });
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      status: 400,
      response: { error: 'daily token limit exceeded' },
    }),
  });
  await expect(send()).rejects.toThrow('Cloud Companion usage limit reached');
});

test('upstream API statuses and content remain intact', async () => {
  const payload = { status: 401, response: '{"error":"invalid API key"}' };
  mockFetch.mockResolvedValue({ ok: true, json: async () => payload });
  await expect(send()).resolves.toEqual(payload);
});

test('stalled requests time out and clean up the timer', async () => {
  jest.useFakeTimers();
  mockFetch.mockImplementation(
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  );
  const result = expect(send()).rejects.toThrow('timed out after 30 seconds');
  await jest.advanceTimersByTimeAsync(30_000);
  await result;
  expect(jest.getTimerCount()).toBe(0);
});
