import {
  ALL_GRANTS,
  AppGrants,
  areIntervalsGranted,
  getRequestRefusal,
  getStorageRefusal,
  isAIGranted,
  isFullAccessGranted,
  isHostGranted,
} from '../../../src/utils/appGrants';

const nothingGranted: AppGrants = {
  fullAccess: false,
  keys: [],
  hosts: [],
  companion: false,
  storage: [],
  ai: false,
  intervals: false,
};

const request = (
  overrides: Partial<Parameters<typeof getRequestRefusal>[1]>,
) => ({
  url: 'https://api.example.com/items',
  headers: {},
  body: undefined,
  usingCompanion: false,
  ...overrides,
});

describe('app grants', () => {
  it('allows everything for trusted apps', () => {
    expect(isFullAccessGranted(ALL_GRANTS)).toBe(true);
    expect(isAIGranted(ALL_GRANTS)).toBe(true);
    expect(areIntervalsGranted(ALL_GRANTS)).toBe(true);
    expect(isHostGranted(ALL_GRANTS, 'not a url')).toBe(true);
    expect(
      getRequestRefusal(
        ALL_GRANTS,
        request({
          headers: { Authorization: '$TM_KEY{ANY}' },
          usingCompanion: true,
        }),
      ),
    ).toBeUndefined();
    expect(getStorageRefusal(ALL_GRANTS, 'Cloud', undefined)).toBeUndefined();
  });

  it('refuses everything that was not granted', () => {
    expect(isFullAccessGranted(nothingGranted)).toBe(false);
    expect(isAIGranted(nothingGranted)).toBe(false);
    expect(areIntervalsGranted(nothingGranted)).toBe(false);
  });
});

describe('getRequestRefusal', () => {
  const grants: AppGrants = {
    ...nothingGranted,
    keys: ['OCR_KEY'],
    hosts: ['api.example.com'],
  };

  it('sends a request to a granted host with a granted key', () => {
    expect(
      getRequestRefusal(
        grants,
        request({ headers: { Authorization: 'Bearer $TM_KEY{OCR_KEY}' } }),
      ),
    ).toBeUndefined();
  });

  it("ignores the HTTP node's placeholder key", () => {
    expect(
      getRequestRefusal(
        grants,
        request({
          headers: {
            Authorization:
              'Basic $TM_KEY{YOUR_ENVIRONMENTAL_COMPANION_VARIABLE_HERE}',
          },
        }),
      ),
    ).toBeUndefined();
  });

  it('refuses the Companion when it is off', () => {
    expect(getRequestRefusal(grants, request({ usingCompanion: true }))).toBe(
      'Off for this app: sending through the Companion',
    );
  });

  it('refuses a key that was not granted, wherever it appears', () => {
    expect(
      getRequestRefusal(grants, request({ body: { token: '$TM_KEY{OTHER}' } })),
    ).toBe('Off for this app: the API key OTHER');
    expect(
      getRequestRefusal(
        grants,
        request({ url: 'https://api.example.com/?key=$TM_KEY{OTHER}' }),
      ),
    ).toBe('Off for this app: the API key OTHER');
  });

  it('refuses hosts that were not granted, including ones built at runtime', () => {
    expect(
      getRequestRefusal(grants, request({ url: 'https://evil.example.com' })),
    ).toBe('Off for this app: connecting to evil.example.com');
    expect(getRequestRefusal(grants, request({ url: '/relative' }))).toBe(
      'Off for this app: connecting to /relative',
    );
  });
});

describe('getStorageRefusal', () => {
  it('allows a granted backend and location only', () => {
    const grants: AppGrants = {
      ...nothingGranted,
      storage: [{ backend: 'IndexedDB', location: 'notes' }],
    };
    expect(getStorageRefusal(grants, 'IndexedDB', 'notes')).toBeUndefined();
    expect(getStorageRefusal(grants, 'Cloud', 'notes')).toBe(
      'Off for this app: storage location "notes"',
    );
    expect(getStorageRefusal(grants, 'IndexedDB', 'secrets')).toBe(
      'Off for this app: storage location "secrets"',
    );
    expect(getStorageRefusal(grants, 'IndexedDB', undefined)).toBe(
      'Off for this app: storage in every location',
    );
  });

  it('lets a grant without backend or location cover any', () => {
    const grants: AppGrants = {
      ...nothingGranted,
      storage: [{ backend: undefined, location: undefined }],
    };
    expect(getStorageRefusal(grants, 'Cloud', undefined)).toBeUndefined();
    expect(getStorageRefusal(grants, 'Local storage', 'x')).toBeUndefined();
  });
});
