// Only the pure helpers are under test; keep the node's rendering imports out.
jest.mock('../../../src/classes/NodeClass', () => ({
  __esModule: true,
  default: class {},
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

import { readURLParameters } from '../../../src/nodes/utility/browser';

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
