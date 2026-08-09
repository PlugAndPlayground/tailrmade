import { migrateGraphDataOnLoad } from '../../../src/utils/graphMigrations';
import {
  surfaceElementLayoutSuffix,
  surfaceElementVisibleSuffix,
  surfaceJsonSocketName,
} from '../../../src/utils/constants_shared';
import type { SerializedGraph } from '../../../src/utils/interfaces';

const widgetItem = (nodeId: string) => ({
  type: { resolvedName: 'DynamicWidget' },
  props: { id: `NODE_${nodeId}` },
  parent: 'ROOT',
  nodes: [],
  linkedNodes: {},
});

const makeLegacyGraph = (): SerializedGraph =>
  ({
    version: 2,
    graphSettings: {},
    links: [],
    nodes: [
      {
        // a HybridNode2 widget - saved back when the ReactUI output already
        // existed, so it is part of the serialized socketArray
        id: 'quiet-bird-38',
        type: 'widgettextfield',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        socketArray: [
          {
            socketType: 'out',
            name: 'Out',
            dataType: '{"class":"StringType"}',
          },
          {
            socketType: 'out',
            name: 'ReactUI',
            dataType: '{"class":"DeferredReactType"}',
          },
        ],
        updateBehaviour: { load: true, update: true, interval: false },
      },
      {
        // became layoutable only later - no ReactUI socket in this old save
        id: 'sharp-mole-59',
        type: 'filedropzone',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        socketArray: [
          {
            socketType: 'out',
            name: 'Filedata',
            dataType: '{"class":"ArrayType"}',
          },
        ],
        updateBehaviour: { load: false, update: true, interval: false },
      },
      {
        id: 'sharp-monkey-80',
        type: 'image',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        socketArray: [
          {
            socketType: 'out',
            name: 'Image',
            dataType: '{"class":"ImageType"}',
          },
        ],
        updateBehaviour: { load: false, update: true, interval: false },
      },
    ],
    layouts: {
      default: JSON.stringify({
        ROOT: {
          type: { resolvedName: 'Container' },
          isCanvas: true,
          props: {},
          displayName: 'Container',
          custom: {},
          hidden: false,
          nodes: ['w1', 'w2', 'w3'],
          linkedNodes: {},
        },
        w1: widgetItem('quiet-bird-38'),
        w2: widgetItem('sharp-mole-59'),
        w3: widgetItem('sharp-monkey-80'),
      }),
      _version: '2',
    },
  }) as unknown as SerializedGraph;

const containerNode = (id: string, name: string, visibleData?: boolean) => ({
  id,
  type: 'DashboardContainerNode',
  name,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  socketArray: [
    {
      socketType: 'in',
      name: 'Visible',
      dataType: '{"class":"BooleanType"}',
      data: visibleData,
    },
    {
      socketType: 'in',
      name: 'Collapse Mode',
      dataType: '{"class":"StringType"}',
      data: 'No Control',
    },
    {
      socketType: 'in',
      name: 'Layout',
      dataType: '{"class":"WidgetLayoutType"}',
    },
    {
      socketType: 'out',
      name: 'ReactUI',
      dataType: '{"class":"DeferredReactType"}',
    },
  ],
  updateBehaviour: { load: true, update: true, interval: false },
});

const containerItem = (nodeId: string, children: string[]) => ({
  type: { resolvedName: 'DashboardContainer' },
  props: { id: `NODE_${nodeId}` },
  parent: 'ROOT',
  nodes: children,
  linkedNodes: {},
});

// mirrors the CKD/AKI dashboard: a Switch node drives two containers'
// Visible sockets; after migration those links must drive the parent
// surface's "<container> visible" element sockets instead
const makeLegacyGraphWithLinkedContainers = (): SerializedGraph =>
  ({
    version: 2,
    graphSettings: {},
    links: [
      {
        sourceNodeId: 'switch-node-1',
        sourceSocketName: 'Out',
        targetNodeId: 'container-a',
        targetSocketName: 'Visible',
      },
      {
        sourceNodeId: 'switch-node-1',
        sourceSocketName: 'Inverted',
        targetNodeId: 'container-b',
        targetSocketName: 'Visible',
      },
      {
        sourceNodeId: 'container-a',
        sourceSocketName: 'ReactUI',
        targetNodeId: 'unrelated-node',
        targetSocketName: 'In',
      },
    ],
    nodes: [
      {
        id: 'switch-node-1',
        type: 'widgetswitch',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        socketArray: [
          {
            socketType: 'out',
            name: 'Out',
            dataType: '{"class":"BooleanType"}',
          },
          {
            socketType: 'out',
            name: 'Inverted',
            dataType: '{"class":"BooleanType"}',
          },
        ],
        updateBehaviour: { load: true, update: true, interval: false },
      },
      containerNode('container-a', 'CKD Container'),
      containerNode('container-b', 'AKI Container', false),
      {
        id: 'quiet-bird-38',
        type: 'widgettextfield',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        socketArray: [
          {
            socketType: 'out',
            name: 'ReactUI',
            dataType: '{"class":"DeferredReactType"}',
          },
        ],
        updateBehaviour: { load: true, update: true, interval: false },
      },
    ],
    layouts: {
      default: JSON.stringify({
        ROOT: {
          type: { resolvedName: 'Container' },
          isCanvas: true,
          props: {},
          displayName: 'Container',
          custom: {},
          hidden: false,
          nodes: ['c1', 'c2'],
          linkedNodes: {},
        },
        c1: containerItem('container-a', ['w1']),
        c2: containerItem('container-b', []),
        w1: { ...widgetItem('quiet-bird-38'), parent: 'c1' },
      }),
      _version: '2',
    },
  }) as unknown as SerializedGraph;

describe('v2 -> v3 container visibility links', () => {
  const migrated = migrateGraphDataOnLoad(makeLegacyGraphWithLinkedContainers());
  const rootSurface = migrated.nodes.find(
    (n) =>
      n.type === 'UISurfaceNode' &&
      n.id === migrated.graphSettings.defaultUISurfaceNodeId,
  )!;

  it('rewires links into a consumed container Visible socket to the parent surface element visible socket', () => {
    const expectedTargets = [
      ['Out', 'CKD Container' + surfaceElementVisibleSuffix],
      ['Inverted', 'AKI Container' + surfaceElementVisibleSuffix],
    ];
    expectedTargets.forEach(([sourceSocketName, targetSocketName]) => {
      expect(migrated.links).toContainEqual({
        sourceNodeId: 'switch-node-1',
        sourceSocketName,
        targetNodeId: rootSurface.id,
        targetSocketName,
      });
      expect(rootSurface.socketArray.map((s) => s.name)).toContain(
        targetSocketName,
      );
    });
  });

  it('drops remaining links from/to consumed nodes with no equivalent', () => {
    migrated.links.forEach((l) => {
      expect(['container-a', 'container-b']).not.toContain(l.sourceNodeId);
      expect(['container-a', 'container-b']).not.toContain(l.targetNodeId);
    });
  });

  it('carries a static Visible value over to the element visible socket', () => {
    const akiVisible = rootSurface.socketArray.find(
      (s) => s.name === 'AKI Container' + surfaceElementVisibleSuffix,
    )!;
    expect(akiVisible.data).toBe(false);
    const ckdVisible = rootSurface.socketArray.find(
      (s) => s.name === 'CKD Container' + surfaceElementVisibleSuffix,
    )!;
    expect(ckdVisible.data).toBe(true);
  });
});

describe('v2 -> v3 legacy dashboard migration', () => {
  const migrated = migrateGraphDataOnLoad(makeLegacyGraph());
  const surface = migrated.nodes.find((n) => n.type === 'UISurfaceNode')!;
  const elementLinks = migrated.links.filter(
    (l) => l.targetNodeId === surface.id,
  );

  it('places every widget of the legacy tree on the surface', () => {
    expect(elementLinks.map((l) => l.sourceNodeId).sort()).toEqual([
      'quiet-bird-38',
      'sharp-mole-59',
      'sharp-monkey-80',
    ]);
    elementLinks.forEach((link) => {
      expect(link.sourceSocketName).toBe('ReactUI');
    });
  });

  it('creates the element/visible/layout socket trio for each widget', () => {
    elementLinks.forEach((link) => {
      const elementSocketName = link.targetSocketName;
      const names = surface.socketArray.map((s) => s.name);
      expect(names).toContain(elementSocketName);
      expect(names).toContain(elementSocketName + surfaceElementVisibleSuffix);
      expect(names).toContain(elementSocketName + surfaceElementLayoutSuffix);
    });
  });

  it('keeps the widget nodes and drops the legacy layouts blob', () => {
    expect(
      (migrated as SerializedGraph & { layouts?: unknown }).layouts,
    ).toBeUndefined();
    expect(
      surface.socketArray.some((s) => s.name === surfaceJsonSocketName),
    ).toBe(true);
    expect(migrated.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining([
        'quiet-bird-38',
        'sharp-mole-59',
        'sharp-monkey-80',
      ]),
    );
  });
});
