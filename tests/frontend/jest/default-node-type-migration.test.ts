import {
  migrateGraphDataOnLoad,
  GRAPH_DATA_VERSION,
} from '../../../src/utils/graphMigrations';
import type { SerializedGraph } from '../../../src/utils/interfaces';

const graphWith = (version: number, type: string): SerializedGraph =>
  ({
    version,
    graphSettings: {},
    nodes: [{ id: 'n', type, socketArray: [] }],
    links: [],
  }) as unknown as SerializedGraph;

describe('default node type migration', () => {
  it('turns a saved "default" node into the Sequence it always loaded as', () => {
    const migrated = migrateGraphDataOnLoad(graphWith(12, 'default'));
    expect(migrated.version).toBe(GRAPH_DATA_VERSION);
    expect(migrated.nodes[0].type).toBe('Sequence');
  });

  it('reaches it from older versions too', () => {
    expect(migrateGraphDataOnLoad(graphWith(9, 'default')).nodes[0].type).toBe(
      'Sequence',
    );
  });

  it('leaves other node types alone', () => {
    expect(
      migrateGraphDataOnLoad(graphWith(12, 'CustomFunction')).nodes[0].type,
    ).toBe('CustomFunction');
  });
});
