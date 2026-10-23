import {
  GRAPH_DATA_VERSION,
  migrateGraphDataOnLoad,
} from '../../../src/utils/graphMigrations';
import type { SerializedGraph } from '../../../src/utils/interfaces';

const makeGraph = (version: number, extra = {}): SerializedGraph =>
  ({
    version,
    graphSettings: {},
    links: [],
    nodes: [],
    ...extra,
  }) as unknown as SerializedGraph;

describe('v7 -> v8 group migration', () => {
  it('gives graphs saved before groups an empty group list', () => {
    const migrated = migrateGraphDataOnLoad(makeGraph(7));

    expect(migrated.version).toBe(GRAPH_DATA_VERSION);
    expect(migrated.groups).toEqual([]);
  });

  it('leaves the groups of a current graph alone', () => {
    const groups = [
      { id: 'g1', name: 'Inputs', color: '#3E54A3', nodeIds: ['a', 'b'] },
    ];
    const migrated = migrateGraphDataOnLoad(
      makeGraph(GRAPH_DATA_VERSION, { groups }),
    );

    expect(migrated.groups).toBe(groups);
  });
});
