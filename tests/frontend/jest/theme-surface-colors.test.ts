import { migrateGraphDataOnLoad } from '../../../src/utils/graphMigrations';
import {
  colorSettingToCss,
  INHERIT_COLOR,
  isInheritColor,
  isTransparentColor,
  TRANSPARENT_COLOR,
} from '../../../src/utils/themeColors';
import { rootProps } from '../../../src/utils/surfaceTree';
import {
  surfaceJsonSocketName,
  RootName,
} from '../../../src/utils/constants_shared';

const treeWithColors = (
  rootBackground: unknown,
  rootColor: unknown,
  childColor: unknown,
) => ({
  [RootName]: {
    type: { resolvedName: 'Container' },
    props: { background: rootBackground, color: rootColor },
    nodes: ['child'],
  },
  child: {
    type: { resolvedName: 'Container' },
    props: { background: { r: 1, g: 2, b: 3, a: 0.2 }, color: childColor },
    nodes: [],
  },
});

const graphWith = (tree: unknown) =>
  ({
    version: 4,
    graphSettings: {},
    overlay: {},
    links: [],
    nodes: [
      {
        socketArray: [
          { name: surfaceJsonSocketName, data: JSON.stringify(tree) },
        ],
      },
    ],
  }) as any;

const treeOf = (graph: any) => JSON.parse(graph.nodes[0].socketArray[0].data);

describe('surface color defaults', () => {
  it('leaves the root painting nothing of its own', () => {
    // the app theme's background.default is what should show through
    expect(rootProps.background).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(rootProps.color).toBe(INHERIT_COLOR);
  });

  it('renders an inherited color as the CSS keyword, not as black', () => {
    expect(colorSettingToCss(INHERIT_COLOR)).toBe('inherit');
    expect(colorSettingToCss(undefined)).toBe('inherit');
    expect(colorSettingToCss(null)).toBe('inherit');
  });

  it('still renders a color the creator actually chose', () => {
    expect(colorSettingToCss({ r: 10, g: 20, b: 30, a: 1 })).toBe(
      'rgb(10, 20, 30)',
    );
  });

  it('reads channels by key, not by object order', () => {
    expect(colorSettingToCss({ b: 30, a: 1, r: 10, g: 20 })).toBe(
      'rgb(10, 20, 30)',
    );
  });
});

describe('v4 -> v5 surface color migration', () => {
  it('frees the root background and text that were never chosen', () => {
    const migrated = migrateGraphDataOnLoad(
      graphWith(
        treeWithColors(
          { r: 9, g: 13, b: 26, a: 1 },
          { r: 244, g: 250, b: 249, a: 1 },
          { r: 51, g: 51, b: 51, a: 1 },
        ),
      ),
    );
    const tree = treeOf(migrated);
    expect(tree[RootName].props.background).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(tree[RootName].props.color).toBe(INHERIT_COLOR);
    expect(tree.child.props.color).toBe(INHERIT_COLOR);
  });

  it('never touches a color the creator picked', () => {
    const chosenBackground = { r: 20, g: 40, b: 60, a: 1 };
    const chosenText = { r: 255, g: 0, b: 0, a: 1 };
    const migrated = migrateGraphDataOnLoad(
      graphWith(treeWithColors(chosenBackground, chosenText, chosenText)),
    );
    const tree = treeOf(migrated);
    expect(tree[RootName].props.background).toEqual(chosenBackground);
    expect(tree[RootName].props.color).toEqual(chosenText);
    expect(tree.child.props.color).toEqual(chosenText);
  });

  it('does not free a child background, only the root', () => {
    // a child container's tint is a deliberate layer over the app surface
    const migrated = migrateGraphDataOnLoad(
      graphWith(
        treeWithColors(
          { r: 9, g: 13, b: 26, a: 1 },
          { r: 244, g: 250, b: 249, a: 1 },
          { r: 51, g: 51, b: 51, a: 1 },
        ),
      ),
    );
    expect(treeOf(migrated).child.props.background).toEqual({
      r: 1,
      g: 2,
      b: 3,
      a: 0.2,
    });
  });

  it('frees a static Text whose legacy default stored STRING channels', () => {
    // the Text widget shipped rgb(51,51,51) as { r: '51', ... } while
    // containers shipped the same colour as numbers. A strict === compared
    // only the numeric form, so no static text was ever freed.
    const migrated = migrateGraphDataOnLoad(
      graphWith(
        treeWithColors(
          { r: 9, g: 13, b: 26, a: 1 },
          { r: 244, g: 250, b: 249, a: 1 },
          { r: '51', g: '51', b: '51', a: '1' },
        ),
      ),
    );
    expect(treeOf(migrated).child.props.color).toBe(INHERIT_COLOR);
  });

  it('still refuses a string channel that is not the legacy value', () => {
    const migrated = migrateGraphDataOnLoad(
      graphWith(
        treeWithColors(
          { r: 9, g: 13, b: 26, a: 1 },
          { r: 244, g: 250, b: 249, a: 1 },
          { r: '52', g: '51', b: '51', a: '1' },
        ),
      ),
    );
    expect(treeOf(migrated).child.props.color).toEqual({
      r: '52',
      g: '51',
      b: '51',
      a: '1',
    });
  });

  it('does not read an empty channel as zero', () => {
    // Number('') is 0, so a blank channel would sail through a bare coercion
    const blank = { r: '', g: '', b: '', a: '' };
    const migrated = migrateGraphDataOnLoad(
      graphWith(treeWithColors(blank, blank, blank)),
    );
    expect(treeOf(migrated).child.props.color).toEqual(blank);
  });

  it('is not fooled by a near-miss value', () => {
    const nearMiss = { r: 9, g: 13, b: 27, a: 1 };
    const migrated = migrateGraphDataOnLoad(
      graphWith(treeWithColors(nearMiss, nearMiss, nearMiss)),
    );
    expect(treeOf(migrated)[RootName].props.background).toEqual(nearMiss);
  });
});

describe('deferring to the theme', () => {
  it('treats a transparent background as deferred', () => {
    expect(isTransparentColor({ r: 0, g: 0, b: 0, a: 0 })).toBe(true);
    expect(isTransparentColor({ r: 10, g: 20, b: 30, a: 1 })).toBe(false);
  });

  it('keeps the two deferral forms distinct', () => {
    // a background defers by being transparent so the app's own ground shows;
    // `background: inherit` would copy whatever the parent painted instead
    expect(isInheritColor(TRANSPARENT_COLOR)).toBe(false);
    expect(isTransparentColor(INHERIT_COLOR)).toBe(false);
  });
});
