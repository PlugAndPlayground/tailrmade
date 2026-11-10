// Only the pure helpers are under test; keep the node's rendering imports out.
jest.mock('../../../src/classes/NodeClass', () => ({
  __esModule: true,
  default: class {},
}));
jest.mock('../../../src/classes/GraphClass', () => ({
  __esModule: true,
  default: { currentGraph: undefined },
}));
jest.mock('../../../src/classes/SocketClass', () => ({
  __esModule: true,
  default: class {},
}));
jest.mock('../../../src/classes/UpdateBehaviourClass', () => ({
  __esModule: true,
  default: class {},
}));
jest.mock('../../../src/classes/ErrorClass', () => ({}));
jest.mock('../../../src/nodes/data/array', () => ({}));
jest.mock('../../../src/nodes/datatypes/anyType', () => ({}));
jest.mock('../../../src/nodes/datatypes/booleanType', () => ({}));
jest.mock('../../../src/nodes/datatypes/stringType', () => ({}));

import PPGraph from '../../../src/classes/GraphClass';
import {
  getAppLink,
  readURLParameters,
  URLParameter,
} from '../../../src/nodes/utility/browser';

const cloudApp = {
  isRemote: true,
  access: 'public' as const,
  owner: 'jakob',
  name: 'Secret Santa',
  location: 'Default',
};

const runURLParameter = async (
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const output: Record<string, unknown> = {};
  await (new (URLParameter as any)() as any).onExecute(input, output);
  return output;
};

// Jest runs in node here, so the address is a stub with URL's fields.
const setAddress = (address: string) => {
  (globalThis as any).window = {
    location: new URL(address, 'https://tailrmade.app'),
  };
};

describe('readURLParameters', () => {
  it('lets the hash replace query values and keeps repeats', () => {
    const parameters = readURLParameters(
      '?city=Linz&tag=a',
      '#city=Wien&tag=b&tag=c',
    );
    expect(parameters.get('city')).toEqual(['Wien']);
    expect(parameters.get('tag')).toEqual(['b', 'c']);
  });

  it('never reports Tailrmade parameters', () => {
    const parameters = readURLParameters(
      '?loadGraph=x&loadLocalGraph=y&setSocketData=z',
      '#loadFullGraph=big&new=1&city=Wien',
    );
    expect([...parameters.keys()]).toEqual(['city']);
  });
});

describe('getAppLink', () => {
  beforeEach(() => setAddress('/app?loadLocalGraph=abc#santa=Anna'));

  it('builds the short cloud link without the current query or hash', () => {
    expect(getAppLink(cloudApp)).toBe(
      `https://tailrmade.app/app?loadGraph=jakob;;Secret%20Santa;;Default;;public`,
    );
  });

  it('is empty for an app only stored in this browser', () => {
    expect(getAppLink({ ...cloudApp, isRemote: false })).toBe('');
  });

  it('is empty for a cloud app that is not public', () => {
    expect(getAppLink({ ...cloudApp, access: 'private' })).toBe('');
    expect(getAppLink({ ...cloudApp, access: 'organization' })).toBe('');
  });

  it('is empty without a loaded app', () => {
    expect(getAppLink(undefined)).toBe('');
  });
});

describe('URLParameter', () => {
  afterEach(() => {
    (PPGraph as any).currentGraph = undefined;
  });

  it('reads the hash over the query and outputs the cloud app link', async () => {
    // What the address looks like after a cloud load rewrote it.
    setAddress(
      `/?loadRemoteGraph=${encodeURIComponent('{"id":"x"}')}&city=Linz#city=Wien`,
    );
    (PPGraph as any).currentGraph = cloudApp;

    const output = await runURLParameter({ Key: 'city', Default: '' });

    expect(output.Value).toBe('Wien');
    expect(output.Found).toBe(true);
    expect(output['App link']).toBe(
      `https://tailrmade.app/?loadGraph=jakob;;Secret%20Santa;;Default;;public`,
    );
  });

  it('leaves reserved names out and the link empty for a local app', async () => {
    setAddress('/?loadLocalGraph=abc#santa=Anna');
    (PPGraph as any).currentGraph = { ...cloudApp, isRemote: false };

    const output = await runURLParameter({ Key: '', Default: '' });

    expect(output.Value).toEqual({ santa: 'Anna' });
    expect(output['App link']).toBe('');
  });

  it('outputs the default and an empty link for an unsaved app', async () => {
    setAddress('/');
    (PPGraph as any).currentGraph = {
      id: 'new-app',
      name: 'new-app',
      isRemote: false,
      access: 'private',
      owner: 'unknown',
      location: 'Default',
    };

    const output = await runURLParameter({ Key: 'santa', Default: 'nobody' });

    expect(output.Value).toBe('nobody');
    expect(output.Found).toBe(false);
    expect(output['App link']).toBe('');
  });
});
