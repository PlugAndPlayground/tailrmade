import {
  getLoadSeedNodes,
  shouldExecuteOnInitialNodeAdd,
} from '../../../src/utils/updateBehaviour';
import {
  GRAPH_DATA_VERSION,
  migrateGraphDataOnLoad,
} from '../../../src/utils/graphMigrations';

const findRequiredSocket = (
  node: { socketArray: Array<{ name: string; data: unknown }> },
  socketName: string,
) => {
  const socket = node.socketArray.find(
    (candidate) => candidate.name === socketName,
  );
  expect(socket).toBeDefined();
  return socket!;
};

const getRequiredSocketData = (
  node: { socketArray: Array<{ name: string; data: unknown }> },
  socketName: string,
) => findRequiredSocket(node, socketName).data;

describe('update behaviour load seeding', () => {
  it('only seeds nodes that opt into load execution', () => {
    const nodes = [
      { id: 'load-only', updateBehaviour: { load: true } },
      { id: 'update-only', updateBehaviour: { load: false } },
      { id: 'both', updateBehaviour: { load: true } },
    ];

    expect(getLoadSeedNodes(nodes).map((node) => node.id)).toEqual([
      'load-only',
      'both',
    ]);
  });

  it('only auto-executes newly added nodes when load is enabled', () => {
    expect(
      shouldExecuteOnInitialNodeAdd({
        isSerialized: false,
        isNewConnected: false,
        load: true,
        graphConfiguredAndReady: true,
      }),
    ).toBe(true);

    expect(
      shouldExecuteOnInitialNodeAdd({
        isSerialized: false,
        isNewConnected: false,
        load: false,
        graphConfiguredAndReady: true,
      }),
    ).toBe(false);

    expect(
      shouldExecuteOnInitialNodeAdd({
        isSerialized: true,
        isNewConnected: false,
        load: true,
        graphConfiguredAndReady: true,
      }),
    ).toBe(false);
  });

  it('migrates old graph load behaviour as prevOnLoad || prevOnChange', () => {
    const graphData = migrateGraphDataOnLoad({
      version: 0.1,
      graphSettings: {},
      overlay: {},
      nodes: [
        {
          id: 'legacy-update',
          type: 'legacy-update',
          name: 'legacy-update',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          socketArray: [],
          updateBehaviour: {
            load: false,
            update: true,
            interval: false,
            intervalFrequency: 1000,
          },
        },
        {
          id: 'legacy-manual',
          type: 'legacy-manual',
          name: 'legacy-manual',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          socketArray: [],
          updateBehaviour: {
            load: false,
            update: false,
            interval: false,
            intervalFrequency: 1000,
          },
        },
        {
          id: 'explicit-load-false',
          type: 'explicit-load-false',
          name: 'explicit-load-false',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          socketArray: [],
          updateBehaviour: {
            load: false,
            update: true,
            interval: false,
            intervalFrequency: 1000,
          },
        },
      ],
      links: [],
      layouts: {},
    } as any);

    expect(graphData.version).toBe(GRAPH_DATA_VERSION);
    expect(graphData.nodes.map((node) => node.updateBehaviour.load)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it('does not migrate newer graphs', () => {
    const graphData = migrateGraphDataOnLoad({
      version: GRAPH_DATA_VERSION,
      graphSettings: {},
      overlay: {},
      nodes: [
        {
          id: 'new-graph-node',
          type: 'new-graph-node',
          name: 'new-graph-node',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          socketArray: [],
          updateBehaviour: {
            load: false,
            update: true,
            interval: false,
            intervalFrequency: 1000,
          },
        },
      ],
      links: [],
      layouts: {},
    } as any);

    expect(graphData.nodes[0].updateBehaviour.load).toBe(false);
  });

  it('treats missing graph version as legacy and upgrades it on load', () => {
    const graphData = migrateGraphDataOnLoad({
      version: undefined,
      graphSettings: {},
      overlay: {},
      nodes: [],
      links: [],
      layouts: {},
    } as any);

    expect(graphData.version).toBe(GRAPH_DATA_VERSION);
  });

  it('migrates legacy layouts.default into a UISurfaceNode with mappable input sockets', () => {
    // mirrors NodeClass.getSocketByNameAndType: a socket only overwrites (rather
    // than duplicates) an existing default socket of the same name when its
    // serialized socketType resolves to a real direction, not undefined
    const resolvesToInputSocket = (socketType: unknown) => socketType === 'in';

    const legacyTree = {
      ROOT: {
        type: { resolvedName: 'Container' },
        props: {},
        nodes: ['widget-1'],
        linkedNodes: {},
      },
      'widget-1': {
        type: { resolvedName: 'DynamicWidget' },
        props: { id: 'NODE_button-1' },
        parent: 'ROOT',
        nodes: [],
        linkedNodes: {},
      },
    };

    const graphData = migrateGraphDataOnLoad({
      version: 2,
      graphSettings: {},
      overlay: {},
      nodes: [
        {
          id: 'button-1',
          type: 'button',
          name: 'button',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          socketArray: [
            {
              socketType: 'out',
              name: 'ReactUI',
              dataType: '{}',
              data: undefined,
            },
          ],
          updateBehaviour: { load: true, update: true, interval: false },
        },
      ],
      links: [],
      layouts: { default: JSON.stringify(legacyTree) },
    } as any);

    expect(graphData.version).toBe(GRAPH_DATA_VERSION);
    const surfaceNode = graphData.nodes.find(
      (node) => node.type === 'UISurfaceNode',
    );
    expect(surfaceNode).toBeDefined();

    // every input socket must resolve as mappable onto an existing default
    // socket (or as a fresh dynamic one) - none should be silently dropped
    // into a duplicate because socketType was left undefined
    surfaceNode!.socketArray.forEach((socket) => {
      expect(resolvesToInputSocket(socket.socketType)).toBe(true);
    });

    const jsonSocket = findRequiredSocket(surfaceNode!, 'Layout JSON');
    expect((jsonSocket.data as any).tree.ROOT).toBeDefined();
  });

  it('transforms a legacy DashboardContainerNode into its own nested UISurfaceNode', () => {
    const legacyTree = {
      ROOT: {
        type: { resolvedName: 'Container' },
        props: {},
        nodes: ['container-1'],
        linkedNodes: {},
      },
      'container-1': {
        type: { resolvedName: 'DashboardContainer' },
        props: { id: 'NODE_container-node-1' },
        parent: 'ROOT',
        nodes: ['widget-1'],
        linkedNodes: {},
      },
      'widget-1': {
        type: { resolvedName: 'DynamicWidget' },
        props: { id: 'NODE_button-1' },
        parent: 'container-1',
        nodes: [],
        linkedNodes: {},
      },
    };

    const graphData = migrateGraphDataOnLoad({
      version: 2,
      graphSettings: {},
      overlay: {},
      nodes: [
        {
          id: 'container-node-1',
          type: 'DashboardContainerNode',
          name: 'My Container',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          socketArray: [
            {
              socketType: 'out',
              name: 'ReactUI',
              dataType: '{}',
              data: undefined,
            },
            {
              socketType: 'in',
              name: 'Layout',
              dataType: '{}',
              data: { custom: true },
            },
          ],
          updateBehaviour: { load: true, update: true, interval: false },
        },
        {
          id: 'button-1',
          type: 'button',
          name: 'button',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          socketArray: [
            {
              socketType: 'out',
              name: 'ReactUI',
              dataType: '{}',
              data: undefined,
            },
          ],
          updateBehaviour: { load: true, update: true, interval: false },
        },
      ],
      links: [],
      layouts: { default: JSON.stringify(legacyTree) },
    } as any);

    // the old container node must be gone entirely, not left dangling/connected
    expect(
      graphData.nodes.find((node) => node.id === 'container-node-1'),
    ).toBeUndefined();

    const surfaceNodes = graphData.nodes.filter(
      (node) => node.type === 'UISurfaceNode',
    );
    expect(surfaceNodes).toHaveLength(2);

    const topSurface = surfaceNodes.find(
      (node) =>
        (
          ((getRequiredSocketData(node, 'Layout JSON') as any).tree.ROOT
            .nodes as string[]) ?? []
        ).length > 0,
    )!;
    const nestedSurface = surfaceNodes.find(
      (node) => node.id !== topSurface.id,
    )!;
    expect(nestedSurface).toBeDefined();

    // the container item in the parent tree was rewritten into a plain
    // DynamicWidget reference to the new nested surface
    const topTree = (getRequiredSocketData(topSurface, 'Layout JSON') as any)
      .tree;
    const rewrittenItem = topTree['container-1'];
    expect(rewrittenItem.type.resolvedName).toBe('DynamicWidget');
    expect(rewrittenItem.props.id).toBe(`NODE_${nestedSurface.id}`);

    // the nested surface carried over the original container's Layout data
    const nestedLayoutSocket = findRequiredSocket(nestedSurface, 'Layout');
    expect(nestedLayoutSocket.data).toEqual({ custom: true });

    // the moved leaf widget now lives inside the nested surface's own tree
    const nestedTree = (
      getRequiredSocketData(nestedSurface, 'Layout JSON') as any
    ).tree;
    expect(nestedTree['widget-1']).toBeDefined();
    expect(topTree['widget-1']).toBeUndefined();

    // the moved widget's parent must point at the nested tree's own ROOT,
    // not the old (now nonexistent in this tree) container key - otherwise
    // craft's isLinkedNode() throws when the nested surface is entered
    expect(nestedTree['widget-1'].parent).toBe('ROOT');
    expect(nestedTree.ROOT).toBeDefined();

    // link wiring: nested surface's ReactUI -> parent surface's element socket
    expect(
      graphData.links.some(
        (l) =>
          l.sourceNodeId === nestedSurface.id &&
          l.sourceSocketName === 'ReactUI' &&
          l.targetNodeId === topSurface.id,
      ),
    ).toBe(true);

    // link wiring: original leaf widget's ReactUI -> NESTED surface, not the top one
    expect(
      graphData.links.some(
        (l) =>
          l.sourceNodeId === 'button-1' &&
          l.sourceSocketName === 'ReactUI' &&
          l.targetNodeId === nestedSurface.id,
      ),
    ).toBe(true);
    expect(
      graphData.links.some(
        (l) =>
          l.sourceNodeId === 'button-1' && l.targetNodeId === topSurface.id,
      ),
    ).toBe(false);
  });

  it('keeps only the default DashboardPageNode visible among migrated page siblings', () => {
    const legacyTree = {
      ROOT: {
        type: { resolvedName: 'Container' },
        props: {},
        nodes: ['page-1', 'page-2'],
        linkedNodes: {},
      },
      'page-1': {
        type: { resolvedName: 'DashboardContainer' },
        props: { id: 'NODE_page-node-1' },
        parent: 'ROOT',
        nodes: [],
        linkedNodes: {},
      },
      'page-2': {
        type: { resolvedName: 'DashboardContainer' },
        props: { id: 'NODE_page-node-2' },
        parent: 'ROOT',
        nodes: [],
        linkedNodes: {},
      },
    };

    const graphData = migrateGraphDataOnLoad({
      version: 2,
      graphSettings: {},
      overlay: {},
      nodes: [
        {
          id: 'page-node-1',
          type: 'DashboardPageNode',
          name: 'Home',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          socketArray: [
            {
              socketType: 'out',
              name: 'ReactUI',
              dataType: '{}',
              data: undefined,
            },
            {
              socketType: 'in',
              name: 'Is Default Page',
              dataType: '{}',
              data: true,
            },
          ],
          updateBehaviour: { load: true, update: true, interval: false },
        },
        {
          id: 'page-node-2',
          type: 'DashboardPageNode',
          name: 'Settings',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          socketArray: [
            {
              socketType: 'out',
              name: 'ReactUI',
              dataType: '{}',
              data: undefined,
            },
            {
              socketType: 'in',
              name: 'Is Default Page',
              dataType: '{}',
              data: false,
            },
          ],
          updateBehaviour: { load: true, update: true, interval: false },
        },
      ],
      links: [],
      layouts: { default: JSON.stringify(legacyTree) },
    } as any);

    const topSurface = graphData.nodes.find(
      (node) => node.type === 'UISurfaceNode',
    )!;
    const homeVisible = findRequiredSocket(topSurface, 'Home visible');
    const settingsVisible = findRequiredSocket(topSurface, 'Settings visible');
    expect(homeVisible.data).toBe(true);
    expect(settingsVisible.data).toBe(false);

    const homePage = graphData.nodes.find(
      (node) => node.type === 'UISurfaceNode' && node.name === 'Home',
    )!;
    const settingsPage = graphData.nodes.find(
      (node) => node.type === 'UISurfaceNode' && node.name === 'Settings',
    )!;
    const homeRadioGroup = getRequiredSocketData(homePage, 'Radio Group');
    const settingsRadioGroup = getRequiredSocketData(
      settingsPage,
      'Radio Group',
    );
    expect(homeRadioGroup).toBeTruthy();
    expect(homeRadioGroup).toBe(settingsRadioGroup);
  });

  it('hides every migrated page sibling when none was marked default', () => {
    const legacyTree = {
      ROOT: {
        type: { resolvedName: 'Container' },
        props: {},
        nodes: ['page-1', 'page-2'],
        linkedNodes: {},
      },
      'page-1': {
        type: { resolvedName: 'DashboardContainer' },
        props: { id: 'NODE_page-node-1' },
        parent: 'ROOT',
        nodes: [],
        linkedNodes: {},
      },
      'page-2': {
        type: { resolvedName: 'DashboardContainer' },
        props: { id: 'NODE_page-node-2' },
        parent: 'ROOT',
        nodes: [],
        linkedNodes: {},
      },
    };

    const graphData = migrateGraphDataOnLoad({
      version: 2,
      graphSettings: {},
      overlay: {},
      nodes: [
        {
          id: 'page-node-1',
          type: 'DashboardPageNode',
          name: 'Home',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          socketArray: [
            {
              socketType: 'out',
              name: 'ReactUI',
              dataType: '{}',
              data: undefined,
            },
            {
              socketType: 'in',
              name: 'Is Default Page',
              dataType: '{}',
              data: false,
            },
          ],
          updateBehaviour: { load: true, update: true, interval: false },
        },
        {
          id: 'page-node-2',
          type: 'DashboardPageNode',
          name: 'Settings',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          socketArray: [
            {
              socketType: 'out',
              name: 'ReactUI',
              dataType: '{}',
              data: undefined,
            },
            {
              socketType: 'in',
              name: 'Is Default Page',
              dataType: '{}',
              data: false,
            },
          ],
          updateBehaviour: { load: true, update: true, interval: false },
        },
      ],
      links: [],
      layouts: { default: JSON.stringify(legacyTree) },
    } as any);

    const topSurface = graphData.nodes.find(
      (node) => node.type === 'UISurfaceNode',
    )!;
    const homeVisible = findRequiredSocket(topSurface, 'Home visible');
    const settingsVisible = findRequiredSocket(topSurface, 'Settings visible');
    expect(homeVisible.data).toBe(false);
    expect(settingsVisible.data).toBe(false);
  });

  it('does not assign a Radio Group to a lone migrated page with no siblings', () => {
    const legacyTree = {
      ROOT: {
        type: { resolvedName: 'Container' },
        props: {},
        nodes: ['page-1'],
        linkedNodes: {},
      },
      'page-1': {
        type: { resolvedName: 'DashboardContainer' },
        props: { id: 'NODE_page-node-1' },
        parent: 'ROOT',
        nodes: [],
        linkedNodes: {},
      },
    };

    const graphData = migrateGraphDataOnLoad({
      version: 2,
      graphSettings: {},
      overlay: {},
      nodes: [
        {
          id: 'page-node-1',
          type: 'DashboardPageNode',
          name: 'Home',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          socketArray: [
            {
              socketType: 'out',
              name: 'ReactUI',
              dataType: '{}',
              data: undefined,
            },
            {
              socketType: 'in',
              name: 'Is Default Page',
              dataType: '{}',
              data: true,
            },
          ],
          updateBehaviour: { load: true, update: true, interval: false },
        },
      ],
      links: [],
      layouts: { default: JSON.stringify(legacyTree) },
    } as any);

    const homePage = graphData.nodes.find(
      (node) => node.type === 'UISurfaceNode' && node.name === 'Home',
    )!;
    const radioGroup = getRequiredSocketData(homePage, 'Radio Group');
    expect(radioGroup).toBe('');
  });

  it('names a migrated page surface after its "Page Name" socket, not the node\'s own (usually unset) top-level name', () => {
    const legacyTree = {
      ROOT: {
        type: { resolvedName: 'Container' },
        props: {},
        nodes: ['page-1'],
        linkedNodes: {},
      },
      'page-1': {
        type: { resolvedName: 'DashboardContainer' },
        props: { id: 'NODE_page-node-1' },
        parent: 'ROOT',
        nodes: [],
        linkedNodes: {},
      },
    };

    const graphData = migrateGraphDataOnLoad({
      version: 2,
      graphSettings: {},
      overlay: {},
      nodes: [
        {
          id: 'page-node-1',
          type: 'DashboardPageNode',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          socketArray: [
            {
              socketType: 'out',
              name: 'ReactUI',
              dataType: '{}',
              data: undefined,
            },
            {
              socketType: 'in',
              name: 'Is Default Page',
              dataType: '{}',
              data: true,
            },
            {
              socketType: 'in',
              name: 'Page Name',
              dataType: '{}',
              data: 'Drop',
            },
          ],
          updateBehaviour: { load: true, update: true, interval: false },
        },
      ],
      links: [],
      layouts: { default: JSON.stringify(legacyTree) },
    } as any);

    const migratedPageSurface = graphData.nodes.find(
      (node) => node.type === 'UISurfaceNode' && node.name === 'Drop',
    );
    expect(migratedPageSurface).toBeDefined();
  });
});
