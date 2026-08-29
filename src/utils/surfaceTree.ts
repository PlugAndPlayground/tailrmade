// Headless craft-tree types and constants shared between the dashboard React
// components and node-land code (e.g. the UI surface sync engine). Keep this
// module free of React and node-class imports.
import { UNSET_VALUE } from './constants';
import { RootName, containerName } from './constants_shared';
import { TRgba } from './color';
import { INHERIT_COLOR } from './themeColors';

// The root surface paints NOTHING of its own by default: the app theme's
// background.default is what shows through, and text inherits the theme's
// text.primary. Before theming these were baked to the editor theme's dark
// palette, which meant a themed app could never change its own background.
//
// Transparent is the right default for a background (you see the themed
// surface behind it) but not for a foreground - fully transparent text is
// invisible, not inherited - so color uses the CSS keyword instead.
const TRANSPARENT_BACKGROUND = { r: 0, g: 0, b: 0, a: 0 };

export type SerializedCraftItem = {
  type: { resolvedName: string };
  isCanvas?: boolean;
  props: Record<string, any>;
  displayName?: string;
  custom?: Record<string, any>;
  parent?: string;
  hidden?: boolean;
  nodes: string[];
  linkedNodes?: Record<string, string>;
};

export type SerializedCraftTree = Record<string, SerializedCraftItem>;

// craft's own query.serialize() and the hand-built trees in surfaceSync.ts
// use different object-key insertion orders for logically identical content
// (e.g. where "parent" falls relative to "hidden"/"nodes"), so a plain
// JSON.stringify comparison between the two never matches even when nothing
// actually changed. Sorting keys before stringifying makes tree comparisons
// (and the resulting "did anything actually change" checks) order-independent.
export function canonicalTreeString(tree: unknown): string {
  const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(sortKeys);
    }
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce((acc: Record<string, unknown>, key) => {
          acc[key] = sortKeys((value as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }
    return value;
  };
  return JSON.stringify(sortKeys(tree));
}

// Normalises a free-text route into a URL-safe slug (lowercase, alphanumerics
// and single hyphens). Lives here (a leaf module) so UI components can use it
// without importing the heavy uiSurface node module.
export const slugifyUINodeRoute = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// must match the craft defaults of the DynamicWidget component
export const dynamicWidgetDefaultProps = {
  flexDirection: 'column',
  alignItems: 'stretch',
  justifyContent: 'flex-start',
  padding: [0, 0, 0, 0],
  background: { r: 0, g: 0, b: 0, a: 1 },
  color: { r: 255, g: 255, b: 255, a: 1 },
  width: '100%',
  height: 'auto',
  minWidth: '48px',
  minHeight: '48px',
  maxWidth: UNSET_VALUE,
  maxHeight: UNSET_VALUE,
  showLabel: false,
  // collapse is presentation chrome of the placement (per widget item), not
  // of the embedded surface itself
  collapsible: false,
  collapsedByDefault: false,
};

// must include every key in Container.craft.props (getDefaultWidgetLayoutValue
// in widgetLayoutType.tsx) - any key omitted here gets silently filled in by
// craft's own component defaults on deserialize, permanently diverging this
// stored tree from craft's serialized one (same failure mode as the ROOT
// displayName/custom fix above, just for props instead of top-level fields)
export const rootProps = {
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
  background: TRANSPARENT_BACKGROUND,
  color: INHERIT_COLOR,
  width: '100%',
  height: 'auto',
  padding: [0, 0, 0, 0],
  minWidth: '80px',
  minHeight: '50dvh',
  maxWidth: 'lg',
  maxHeight: UNSET_VALUE,
  gap: 8,
  mobileBehavior: 'row',
  customStyles: {
    '@media (min-width: 601px) and (max-width: 900px)': {
      padding: '0px 16px',
      width: '90%',
    },
    '@media (max-width: 600px)': {
      padding: '0px 8px',
      width: '100%',
    },
  },
};

export const emptyLayout = {
  [RootName]: {
    type: { resolvedName: containerName },
    // craft's own deserialize/serialize round-trip normalizes the root item's
    // displayName to its resolver name ("Container"), not the literal id
    // ("ROOT") - matching that here avoids a permanent mismatch between the
    // socket-stored tree and the craft editor's own serialized tree, which
    // would otherwise make every comparison report "changed" forever.
    displayName: containerName,
    isCanvas: true,
    props: rootProps,
    custom: {},
    hidden: false,
    nodes: [],
    linkedNodes: {},
  },
};
