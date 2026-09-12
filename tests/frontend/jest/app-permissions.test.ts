import {
  countOff,
  describeSource,
  getAppGrantsId,
  getDefaultTicked,
  getGrantsFromTicked,
  getPermissionItems,
  getPromptKind,
  getTickedFromGrants,
} from '../../../src/utils/appPermissions';
import { ALL_GRANTS, NO_GRANTS } from '../../../src/utils/appGrants';
import type { Manifest } from '../../../src/utils/scanGraph';

const emptyManifest: Manifest = {
  fullAccess: [],
  keys: [],
  hosts: [],
  runtimeHostNodeIds: [],
  companionNodeIds: [],
  storage: [],
  aiNodeIds: [],
  intervalNodeIds: [],
  fastestIntervalMs: undefined,
};

const invoiceScanner: Manifest = {
  fullAccess: [{ reason: 'code', nodeIds: ['parse'] }],
  keys: [
    { name: 'OPENAI_KEY', hosts: ['api.openai.com'], nodeIds: ['ai-call'] },
    {
      name: 'STRIPE_KEY',
      hosts: ['collect.invoicesync.io'],
      nodeIds: ['exfiltrate'],
    },
  ],
  hosts: [
    { host: 'api.openai.com', nodeIds: ['ai-call'] },
    { host: 'sheets.googleapis.com', nodeIds: ['sheet'] },
  ],
  runtimeHostNodeIds: [],
  companionNodeIds: [],
  storage: [],
  aiNodeIds: ['gemini'],
  intervalNodeIds: ['poll'],
  fastestIntervalMs: 30000,
};
const keyDomains = { OPENAI_KEY: 'openai.com', STRIPE_KEY: 'api.stripe.com' };

describe('getPermissionItems', () => {
  it('groups the invoice scanner like the sheet in the UX doc', () => {
    expect(getPermissionItems(invoiceScanner, keyDomains)).toEqual([
      {
        id: 'key:OPENAI_KEY',
        band: 'needsOk',
        title: 'Use your OPENAI_KEY',
        details: ['only with api.openai.com'],
        nodeIds: ['ai-call'],
      },
      {
        id: 'blockedKey:STRIPE_KEY',
        band: 'blocked',
        title: 'STRIPE_KEY → collect.invoicesync.io',
        details: ['Your key only works with api.stripe.com.'],
        nodeIds: ['exfiltrate'],
      },
      {
        id: 'fullAccess',
        band: 'needsOk',
        title: 'Full access to Tailrmade in this tab',
        details: [
          'Could see your other apps and act as you.',
          '1 code node runs outside the sandbox.',
        ],
        nodeIds: ['parse'],
      },
      {
        id: 'hosts',
        band: 'connects',
        title: 'Sends and receives data',
        details: ['api.openai.com, sheets.googleapis.com'],
        nodeIds: ['ai-call', 'sheet'],
      },
      {
        id: 'ai',
        band: 'connects',
        title: 'Uses AI on your account',
        details: ['1 AI node'],
        nodeIds: ['gemini'],
      },
      {
        id: 'intervals',
        band: 'connects',
        title: 'Keeps running in the background',
        details: ['1 node, every 30 s'],
        nodeIds: ['poll'],
      },
    ]);
  });

  it('asks about a key when its domain is unknown', () => {
    const items = getPermissionItems(invoiceScanner, {});
    expect(items.filter((item) => item.band === 'blocked')).toEqual([]);
    expect(items.map((item) => item.id)).toContain('key:STRIPE_KEY');
  });

  it('lists storage, the Companion and runtime addresses', () => {
    const items = getPermissionItems(
      {
        ...emptyManifest,
        fullAccess: [
          { reason: 'npm', nodeIds: ['npm'] },
          { reason: 'html', nodeIds: ['a', 'b'] },
        ],
        storage: [
          { backend: 'IndexedDB', location: 'budget', nodeIds: ['read'] },
          { backend: 'Cloud', location: undefined, nodeIds: ['browse'] },
        ],
        companionNodeIds: ['http'],
        runtimeHostNodeIds: ['built'],
      },
      {},
    );
    expect(items.map(({ id, band, details }) => [id, band, details])).toEqual([
      [
        'fullAccess',
        'needsOk',
        [
          'Could see your other apps and act as you.',
          '1 node loads code packages.',
          '2 HTML nodes show unsanitised HTML.',
        ],
      ],
      ['storage', 'needsOk', ['Storage: budget, any location']],
      ['companion', 'needsOk', ['Through the Companion']],
      [
        'runtimeHosts',
        'blocked',
        ['These stay off for now. The node says so when one is used.'],
      ],
    ]);
  });
});

describe('prompt and grants', () => {
  const items = getPermissionItems(invoiceScanner, keyDomains);

  it('shows the sheet, the slim bar or nothing', () => {
    expect(getPromptKind(items)).toBe('sheet');
    expect(getPromptKind(items.filter((item) => item.band !== 'needsOk'))).toBe(
      'bar',
    );
    expect(getPromptKind(items.filter((item) => item.band === 'blocked'))).toBe(
      'none',
    );
    expect(getPromptKind([])).toBe('none');
  });

  it('runs with connections on and everything that needs an OK off', () => {
    const ticked = getDefaultTicked(items);
    expect(countOff(items, ticked)).toBe(2);
    expect(getGrantsFromTicked(invoiceScanner, ticked)).toEqual({
      ...NO_GRANTS,
      hosts: ['api.openai.com', 'sheets.googleapis.com'],
      ai: true,
      intervals: true,
    });
  });

  it('never grants a blocked key, even if its id is ticked', () => {
    const grants = getGrantsFromTicked(
      invoiceScanner,
      new Set(['key:OPENAI_KEY', 'blockedKey:STRIPE_KEY', 'fullAccess']),
    );
    expect(grants.keys).toEqual(['OPENAI_KEY']);
    expect(grants.fullAccess).toBe(true);
  });

  it('reopens the sheet with the grants that are in effect', () => {
    const ticked = new Set(['key:OPENAI_KEY', 'hosts']);
    const grants = getGrantsFromTicked(invoiceScanner, ticked);
    expect(getTickedFromGrants(items, grants)).toEqual(ticked);
    expect(getTickedFromGrants(items, ALL_GRANTS)).toEqual(
      new Set(['key:OPENAI_KEY', 'fullAccess', 'hosts', 'ai', 'intervals']),
    );
  });
});

describe('remembering and describing', () => {
  it('keys grants by source and capabilities', () => {
    expect(getAppGrantsId('link', 'abc')).not.toBe(
      getAppGrantsId('file:app.tmapp', 'abc'),
    );
    expect(getAppGrantsId(undefined, 'abc')).toBe('[null,"abc"]');
  });

  it('describes where an app came from', () => {
    expect(describeSource('link')).toBe('Opened from a link');
    expect(describeSource('file:Invoices.tmapp')).toBe(
      'Opened from Invoices.tmapp',
    );
    expect(describeSource('cloud:owner/Default/App')).toBe(
      'Opened from a shared cloud app',
    );
    expect(describeSource(undefined)).toBe('Imported app');
  });
});
