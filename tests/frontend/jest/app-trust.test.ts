import { webcrypto } from 'node:crypto';
import {
  getAppFingerprint,
  getAppReviewContent,
  isAppApproved,
  rememberAppApproval,
} from '../../../src/services/appTrust';
import { NetworkRisk } from '../../../src/classes/NodeRisk';

const graph = () =>
  ({
    version: 1,
    graphSettings: { viewportCenterPosition: { x: 0, y: 0 }, viewportScale: 1 },
    nodes: [{ id: 'code', socketArray: [{ name: 'Code', data: 'return 1' }] }],
    links: [],
  }) as any;
const risks = [{ risk: new NetworkRisk('https://example.com'), nodes: [] }];

beforeEach(() => {
  const values = new Map();
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: jest.fn((key) => values.get(key) ?? null),
      setItem: jest.fn((key, value) => values.set(key, value)),
    },
  });
});

it('remembers only the approved content and invalidates code, wiring and risk changes', async () => {
  const original = await getAppFingerprint(graph(), risks);
  expect(original).toMatch(/^[a-f0-9]{64}$/);
  expect(isAppApproved(original)).toBe(false);
  rememberAppApproval(original);
  expect(isAppApproved(await getAppFingerprint(graph(), risks))).toBe(true);
  const changed = graph();
  changed.nodes[0].socketArray[0].data = 'return 2';
  expect(isAppApproved(await getAppFingerprint(changed, risks))).toBe(false);
  const rewired = graph();
  rewired.links.push({ id: 'new-link' });
  expect(isAppApproved(await getAppFingerprint(rewired, risks))).toBe(false);
  expect(isAppApproved(await getAppFingerprint(graph(), []))).toBe(false);
});

it('ignores viewport and drawer state and normalizes object key order', async () => {
  const moved = graph();
  moved.graphSettings.viewportScale = 2;
  moved.graphSettings.viewportCenterPosition = { x: 100, y: 200 };
  moved.overlay = { leftSide: { open: true } };
  moved.nodes[0] = { socketArray: moved.nodes[0].socketArray, id: 'code' };
  expect(await getAppFingerprint(moved, risks)).toBe(
    await getAppFingerprint(graph(), risks),
  );
});

it('keeps review content stable when node geometry settles', async () => {
  const moved = graph();
  Object.assign(moved.nodes[0], { x: 300, y: 50, width: 400, height: 200 });
  expect(getAppReviewContent(moved, risks)).toBe(
    getAppReviewContent(graph(), risks),
  );
  expect(await getAppFingerprint(moved, risks)).toBe(
    await getAppFingerprint(graph(), risks),
  );
});

it('does not bind stored approval to generated migration node IDs', async () => {
  const first = [
    { ...risks[0], nodes: [{ id: 'generated-a', name: 'Surface' }] },
  ];
  const second = [
    { ...risks[0], nodes: [{ id: 'generated-b', name: 'Surface' }] },
  ];
  expect(await getAppFingerprint(graph(), first)).toBe(
    await getAppFingerprint(graph(), second),
  );
});

it('requires review when hashing or storage is unavailable', async () => {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: undefined,
  });
  expect(await getAppFingerprint(graph(), risks)).toBeNull();
  rememberAppApproval(null);
  expect(isAppApproved(null)).toBe(false);
  (localStorage.getItem as jest.Mock).mockImplementation(() => {
    throw new Error('blocked');
  });
  (localStorage.setItem as jest.Mock).mockImplementation(() => {
    throw new Error('quota');
  });
  expect(isAppApproved('hash')).toBe(false);
  expect(() => rememberAppApproval('hash')).not.toThrow();
});
