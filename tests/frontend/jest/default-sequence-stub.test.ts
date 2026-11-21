import { loadWithStubs } from './loadWithStubs';
import type { SerializedGraph } from '../../../src/utils/interfaces';

describe('the "default" stub', () => {
  it('becomes the Sequence a "default" node always loaded as', () => {
    const graph = {
      nodes: [
        { id: 'seq', type: 'default', version: 1, socketArray: [] },
        { id: 'target', type: 'Constant', socketArray: [] },
      ],
      links: [
        {
          id: 1,
          sourceNodeId: 'seq',
          sourceSocketName: 'Sequence 1',
          targetNodeId: 'target',
          targetSocketName: 'In',
        },
      ],
    } as unknown as SerializedGraph;

    const loaded = loadWithStubs(graph);

    expect(loaded.nodes[0]).toMatchObject({ id: 'seq', type: 'Sequence' });
    expect(loaded.links).toHaveLength(1);
  });
});
