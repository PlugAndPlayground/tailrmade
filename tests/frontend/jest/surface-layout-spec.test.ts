import {
  compileSurfaceSpec,
  decompileSurfaceTree,
  ContainerSpecItem,
} from '../../../src/nodes/layout/surfaceLayoutSpec';
import {
  RootName,
  containerName,
  DynamicWidgetName,
} from '../../../src/utils/constants_shared';
import type { SerializedCraftTree } from '../../../src/utils/surfaceTree';

describe('surfaceLayoutSpec', () => {
  describe('compileSurfaceSpec', () => {
    it('compiles a nested spec into a structurally valid tree', () => {
      const spec: ContainerSpecItem = {
        direction: 'column',
        children: [
          { text: 'Hello world' },
          {
            direction: 'row',
            children: [{ widget: 'widget-a' }, { widget: 'widget-b' }],
          },
        ],
      };

      const { tree, warnings } = compileSurfaceSpec(
        spec,
        new Set(['widget-a', 'widget-b']),
      );

      expect(warnings).toEqual([]);
      expect(tree[RootName]).toBeDefined();
      expect(tree[RootName].parent).toBeUndefined();
      expect(tree[RootName].type.resolvedName).toBe(containerName);
      expect(tree[RootName].props.flexDirection).toBe('column');
      expect(tree[RootName].nodes).toHaveLength(2);

      // every non-ROOT item appears in exactly one parent's nodes array, and
      // its own parent field matches
      const nonRootIds = Object.keys(tree).filter((id) => id !== RootName);
      expect(nonRootIds.length).toBeGreaterThan(0);
      nonRootIds.forEach((id) => {
        const item = tree[id];
        expect(item.parent).toBeDefined();
        const parentItem = tree[item.parent as string];
        expect(parentItem).toBeDefined();
        expect(parentItem.nodes).toContain(id);
      });

      // exactly one parent per child (no duplication across parents' nodes)
      Object.keys(tree).forEach((id) => {
        const owners = Object.keys(tree).filter((candidateId) =>
          tree[candidateId].nodes.includes(id),
        );
        if (id === RootName) {
          expect(owners).toHaveLength(0);
        } else {
          expect(owners).toHaveLength(1);
        }
      });

      // resolvedNames correct
      const textItemId = tree[RootName].nodes[0];
      expect(tree[textItemId].type.resolvedName).toBe('Text');
      expect(tree[textItemId].props.text).toBe('Hello world');

      const rowItemId = tree[RootName].nodes[1];
      expect(tree[rowItemId].type.resolvedName).toBe(containerName);
      expect(tree[rowItemId].props.flexDirection).toBe('row');
      expect(tree[rowItemId].nodes).toHaveLength(2);

      tree[rowItemId].nodes.forEach((widgetId) => {
        expect(tree[widgetId].type.resolvedName).toBe(DynamicWidgetName);
      });

      const widgetIds = tree[rowItemId].nodes.map(
        (id) => tree[id].props.id as string,
      );
      expect(widgetIds.sort()).toEqual(
        ['NODE_widget-a', 'NODE_widget-b'].sort(),
      );
    });

    it('applies node-preferred widget props (widgetPropsByNodeId) under the spec overrides', () => {
      // the node's own getWidgetProps() - what a sync-layer insert would
      // apply - supplied by the caller and recomputed on every compile
      const widgetPropsByNodeId = new Map<string, Record<string, unknown>>([
        ['widget-a', { heightMode: 'hug', height: '370px' }],
      ]);

      const spec: ContainerSpecItem = {
        direction: 'column',
        children: [{ widget: 'widget-a', showLabel: true, height: '200px' }],
      };

      const { tree } = compileSurfaceSpec(
        spec,
        new Set(['widget-a']),
        widgetPropsByNodeId,
      );

      const widgetItemId = tree[RootName].nodes[0];
      const widgetItem = tree[widgetItemId];
      // node-preferred prop with no spec override applies
      expect(widgetItem.props.heightMode).toBe('hug');
      // explicit spec override beats the node-preferred value
      expect(widgetItem.props.height).toBe('200px');
      expect(widgetItem.props.showLabel).toBe(true);
      expect(widgetItem.props.id).toBe('NODE_widget-a');
    });

    it('appends an omitted connected widget to the end of ROOT with a warning', () => {
      const spec: ContainerSpecItem = {
        direction: 'column',
        children: [{ text: 'Only text here' }],
      };

      const { tree, warnings } = compileSurfaceSpec(
        spec,
        new Set(['widget-a']),
      );

      expect(tree[RootName].nodes).toHaveLength(2);
      const appendedId = tree[RootName].nodes[1];
      expect(tree[appendedId].type.resolvedName).toBe(DynamicWidgetName);
      expect(tree[appendedId].props.id).toBe('NODE_widget-a');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/widget-a/);
      expect(warnings[0]).toMatch(/appended at the end/);
    });

    it('forces the root to a column and warns when the root spec asks for a row', () => {
      const spec: ContainerSpecItem = {
        direction: 'row',
        children: [{ text: 'a' }, { text: 'b' }],
      };

      const { tree, warnings } = compileSurfaceSpec(spec, new Set());

      expect(tree[RootName].props.flexDirection).not.toBe('row');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/root/i);
      expect(warnings[0]).toMatch(/nested/i);
    });

    it('still applies a row direction to a nested (non-root) container', () => {
      const spec: ContainerSpecItem = {
        direction: 'column',
        children: [{ direction: 'row', children: [{ text: 'a' }] }],
      };

      const { tree, warnings } = compileSurfaceSpec(spec, new Set());

      const nestedId = tree[RootName].nodes[0];
      expect(tree[nestedId].props.flexDirection).toBe('row');
      expect(warnings).toEqual([]);
    });

    it('throws listing valid ids when the spec references an unconnected widget', () => {
      const spec: ContainerSpecItem = {
        direction: 'column',
        children: [{ widget: 'not-connected' }],
      };

      expect(() =>
        compileSurfaceSpec(spec, new Set(['widget-a', 'widget-b'])),
      ).toThrow(/widget-a, widget-b|not-connected/);
    });

    it('throws on duplicate widget ids in the spec', () => {
      const spec: ContainerSpecItem = {
        direction: 'column',
        children: [{ widget: 'widget-a' }, { widget: 'widget-a' }],
      };

      expect(() => compileSurfaceSpec(spec, new Set(['widget-a']))).toThrow(
        /widget-a/,
      );
    });
  });

  // The declarative contract of set_surface_layout: an omitted prop always
  // means the default (recomputed fresh on every compile), never a stale
  // value from a previous call - and everything explicit in the stored tree
  // must survive decompile -> compile so the AI's inspect -> modify -> set
  // loop round-trips (the read side carries the preservation burden).
  describe('declarative compile / faithful decompile', () => {
    // strips the random item ids so two compiles of equivalent specs can be
    // compared structurally
    const normalizeTree = (tree: SerializedCraftTree) => {
      const walk = (id: string) => {
        const item = tree[id];
        return {
          type: item.type,
          isCanvas: item.isCanvas,
          props: { ...item.props },
          hidden: item.hidden,
          children: (item.nodes ?? []).map(walk),
        };
      };
      return walk(RootName);
    };

    it('an omitted widget prop falls back to the default, not the previous tree value', () => {
      // compile is stateless by construction now (it no longer receives the
      // previous tree at all) - this locks the contract in regardless: an
      // earlier compile with explicit props must not influence a later bare
      // compile of the same widget
      const specWithWidth: ContainerSpecItem = {
        direction: 'column',
        children: [{ widget: 'widget-a', width: '200px', showLabel: true }],
      };
      compileSurfaceSpec(specWithWidth, new Set(['widget-a']));

      // second call omits width/showLabel entirely
      const specBare: ContainerSpecItem = {
        direction: 'column',
        children: [{ widget: 'widget-a' }],
      };
      const second = compileSurfaceSpec(specBare, new Set(['widget-a']));

      const widgetItemId = second.tree[RootName].nodes[0];
      const widgetProps = second.tree[widgetItemId].props;
      expect(widgetProps.width).toBe('100%'); // the default, not '200px'
      expect(widgetProps.showLabel).toBe(false); // the default, not true
    });

    it('decompile(compile(spec)) preserves every explicit container/text/widget prop', () => {
      const spec: ContainerSpecItem = {
        direction: 'column',
        gap: 12,
        padding: [4, 8, 4, 8],
        children: [
          {
            text: 'Title',
            fontSize: 30,
            fontWeight: '700',
            textAlign: 'center',
            color: { r: 1, g: 2, b: 3, a: 1 },
          },
          {
            direction: 'row',
            gap: 4,
            padding: [2, 2, 2, 2],
            background: { r: 9, g: 9, b: 9, a: 1 },
            width: '80%',
            height: '300px',
            align: 'center',
            justify: 'space-between',
            mobileBehavior: 'wrap',
            children: [
              {
                widget: 'widget-a',
                width: '150px',
                height: '120px',
                showLabel: true,
                collapsible: true,
                collapsedByDefault: true,
              },
              { widget: 'widget-b', width: '100%', height: 'auto' },
            ],
          },
        ],
      };

      const { tree, warnings } = compileSurfaceSpec(
        spec,
        new Set(['widget-a', 'widget-b']),
      );
      expect(warnings).toEqual([]);

      const { root, unknownItems } = decompileSurfaceTree(tree);
      expect(unknownItems).toEqual([]);

      const row = root.children[1] as ContainerSpecItem;
      expect(row.mobileBehavior).toBe('wrap');
      expect(row.width).toBe('80%');
      expect(row.height).toBe('300px');
      const widgetA = row.children[0] as Record<string, unknown>;
      expect(widgetA.width).toBe('150px');
      expect(widgetA.height).toBe('120px');
      expect(widgetA.showLabel).toBe(true);
      expect(widgetA.collapsible).toBe(true);
      expect(widgetA.collapsedByDefault).toBe(true);
      // explicit-but-default values compile to the same tree values, so the
      // decompiled spec omitting them is semantically equivalent - assert
      // recompiling the decompiled spec reproduces the same tree instead
      const recompiled = compileSurfaceSpec(
        root,
        new Set(['widget-a', 'widget-b']),
      );
      expect(normalizeTree(recompiled.tree)).toEqual(normalizeTree(tree));
    });

    it('a user-tweaked non-spec widget prop (e.g. minWidth) survives decompile -> compile', () => {
      // simulate a widget the user tweaked in the dashboard editor
      // (WidthHeightControl writes minWidth/maxWidth/minHeight/maxHeight
      // straight into the stored item's props)
      const { tree } = compileSurfaceSpec(
        { direction: 'column', children: [{ widget: 'widget-a' }] },
        new Set(['widget-a']),
      );
      const widgetItemId = tree[RootName].nodes[0];
      tree[widgetItemId].props.minWidth = '300px';

      const { root } = decompileSurfaceTree(tree);
      const recompiled = compileSurfaceSpec(root, new Set(['widget-a']));
      const recompiledWidgetId = recompiled.tree[RootName].nodes[0];
      expect(recompiled.tree[recompiledWidgetId].props.minWidth).toBe('300px');
    });
  });

  describe('round-trip stability', () => {
    it('decompile(compile(spec)) reproduces an equivalent spec', () => {
      const spec: ContainerSpecItem = {
        direction: 'column',
        gap: 12,
        children: [
          { text: 'Title', fontSize: 30, fontWeight: '700' },
          {
            direction: 'row',
            gap: 4,
            align: 'center',
            justify: 'space-between',
            children: [{ widget: 'widget-a' }, { widget: 'widget-b' }],
          },
        ],
      };

      const { tree, warnings } = compileSurfaceSpec(
        spec,
        new Set(['widget-a', 'widget-b']),
      );
      expect(warnings).toEqual([]);

      const { root, unknownItems } = decompileSurfaceTree(tree);
      expect(unknownItems).toEqual([]);
      expect(root).toEqual(spec);
    });
  });
});
