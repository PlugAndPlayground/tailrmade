import {
  getGraphSource,
  registerCloudGraphSource,
} from '../../../src/services/graphSource';
import { BackendApiClient } from '../../../src/services/BackendApiClient';

afterEach(() => jest.restoreAllMocks());

it('uses cloud loading provenance instead of owner claims in a file', () => {
  const file = {
    owner: 'publicUser',
    isRemote: true,
    source: { ownerId: 'publicUser' },
  } as any;
  expect(getGraphSource(file)).toBeUndefined();
  registerCloudGraphSource(file, 'account-id', {
    name: 'Account name',
    email: 'owner@example.com',
  });
  expect(getGraphSource(file)).toEqual({
    ownerId: 'account-id',
    owner: { name: 'Account name', email: 'owner@example.com' },
  });
  expect(getGraphSource(JSON.parse(JSON.stringify(file)))).toBeUndefined();
});

it('retains account details supplied by the TM graph response', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: 'graph data',
      owner: { name: 'Owner', email: 'owner@example.com' },
    }),
  } as Response);
  await expect(
    new BackendApiClient({ origin: 'https://tailrmade.app' }).getPublicGraph(
      'account-id',
      'Default',
      'App',
    ),
  ).resolves.toEqual({
    data: 'graph data',
    owner: { name: 'Owner', email: 'owner@example.com' },
  });
});

it('rejects malformed storage responses instead of treating them as missing items', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true }),
  } as Response);
  await expect(
    new BackendApiClient().getItem('App', 'Default', 'graph'),
  ).rejects.toThrow('Invalid response when retrieving graph');
});

it('still represents an actual 404 as a missing storage item', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({ ok: false, status: 404 } as Response);
  await expect(
    new BackendApiClient().getItem('App', 'Default', 'graph'),
  ).resolves.toBeUndefined();
});
