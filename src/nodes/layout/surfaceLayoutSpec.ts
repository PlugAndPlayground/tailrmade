// Simplified layout spec for UI surfaces, and the compiler/decompiler between
// it and the raw craft tree (SerializedCraftTree). This is the only shape the
// AI agent ever sees or writes - it never reads or writes the craft tree
// directly (see MCP tools inspect_surface / set_surface_layout).
//
// Keep this module free of React and node-class imports (like surfaceTree.ts)
// so it stays importable from a node/jest environment.
import { TRgba } from '../../utils/color';
import { MAIN_COLOR, UNSET_VALUE } from '../../utils/constants';
import {
  containerName,
  DynamicWidgetName,
  RootName,
} from '../../utils/constants_shared';
import {
  dynamicWidgetDefaultProps,
  rootProps,
  SerializedCraftItem,
  SerializedCraftTree,
} from '../../utils/surfaceTree';

// must match Text.craft.props (textDefaultProps in
// src/components/dashboard/Text.tsx) - kept as a plain data literal here
// rather than importing that module, which pulls in React/MUI
const textDefaultPropsForSpec = {
  fontSize: 20,
  textAlign: 'left',
  fontWeight: 'normal',
  color: { r: '51', g: '51', b: '51', a: '1' },
  text: 'Hi',
};

// must match Container.craft.props (getDefaultWidgetLayoutValue() in
// widgetLayoutType.tsx) - kept as a plain data literal here rather than
// importing that module, which pulls in React (WidgetLayoutWidget).
// Exception: mobileBehavior deliberately diverges, see the inline comment.
function getDefaultContainerBackground(): Record<
  'r' | 'g' | 'b' | 'a',
  number
> {
  const tintedBackground = TRgba.fromString(MAIN_COLOR)
    .darken(0.4)
    .setAlpha(0.2);
  return {
    r: tintedBackground.r,
    g: tintedBackground.g,
    b: tintedBackground.b,
    a: tintedBackground.a,
  };
}

// mirrors surfaceSync.ts's getElementIdForNode/NODE_ELEMENT_PREFIX - not
// imported from there directly because surfaceSync.ts's own imports (Socket/
// PPNode types etc) transitively pull in node-class modules that break a
// React-free, node/jest-importable module like this one
const NODE_ELEMENT_PREFIX = 'NODE_';

function getElementIdForNode(nodeId: string): string {
  return `${NODE_ELEMENT_PREFIX}${nodeId}`;
}

// Copy the given keys from `source` into a fresh object, skipping any whose
// value is undefined - used to build prop overrides from optional spec fields.
function pickDefined<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  keys.forEach((key) => {
    if (source[key] !== undefined) {
      result[key as string] = source[key];
    }
  });
  return result;
}

const containerDefaultPropsForSpec = {
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
  width: '100%',
  height: 'auto',
  padding: [0, 0, 0, 0],
  minWidth: '80px',
  minHeight: '80px',
  maxWidth: UNSET_VALUE,
  maxHeight: UNSET_VALUE,
  gap: 0,
  background: getDefaultContainerBackground(),
  color: { r: 51, g: 51, b: 51, a: 1 },
  // DELIBERATE divergence from the editor default ('row' in
  // getDefaultWidgetLayoutValue): AI-built row containers stack vertically
  // on narrow dashboards by default (mobile-first), which is almost always
  // what a generated layout wants. Safe because compileSurfaceSpec writes
  // every default explicitly into the compiled tree, and
  // decompileSurfaceTree diffs against THIS object - an editor-built 'row'
  // container decompiles to an explicit mobileBehavior:'row', so
  // inspect -> set round-trips stay faithful.
  mobileBehavior: 'column',
  customStyles: {},
};

// ---------------------------------------------------------------------------
// Spec types
// ---------------------------------------------------------------------------

export type SurfaceLayoutColor = { r: number; g: number; b: number; a: number };

export interface ContainerSpecItem {
  direction: 'row' | 'column';
  children: SurfaceLayoutSpecItem[];
  gap?: number;
  // shorthand: a single number applies to all four sides, matching the
  // stored tree's [top, right, bottom, left] array
  padding?: number | [number, number, number, number];
  background?: SurfaceLayoutColor;
  width?: string;
  height?: string;
  align?: string;
  justify?: string;
  // what a 'row' container does on a narrow dashboard (< 600px):
  // 'column' (default) stacks the children vertically, 'wrap' lets them
  // wrap, 'row' keeps them side by side. No effect on 'column' containers.
  mobileBehavior?: 'row' | 'column' | 'wrap';
  // advanced passthrough merged last into the compiled item's props - rarely
  // needed, only for props not otherwise exposed by this spec
  props?: Record<string, unknown>;
}

export interface TextSpecItem {
  text: string;
  fontSize?: number;
  fontWeight?: string;
  textAlign?: string;
  color?: SurfaceLayoutColor;
  props?: Record<string, unknown>;
}

export interface WidgetSpecItem {
  // the source node id (a node with a ReactUI output) placed on the surface
  widget: string;
  showLabel?: boolean;
  collapsible?: boolean;
  collapsedByDefault?: boolean;
  width?: string;
  height?: string;
  props?: Record<string, unknown>;
}

export type SurfaceLayoutSpecItem =
  | ContainerSpecItem
  | TextSpecItem
  | WidgetSpecItem;

export interface CompileSurfaceSpecResult {
  tree: SerializedCraftTree;
  warnings: string[];
}

export interface DecompileSurfaceTreeResult {
  root: ContainerSpecItem;
  unknownItems: string[];
}

// ---------------------------------------------------------------------------
// Item-kind guards
// ---------------------------------------------------------------------------

export function isContainerSpecItem(
  item: SurfaceLayoutSpecItem,
): item is ContainerSpecItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'children' in item &&
    Array.isArray((item as ContainerSpecItem).children)
  );
}

export function isTextSpecItem(
  item: SurfaceLayoutSpecItem,
): item is TextSpecItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as TextSpecItem).text === 'string'
  );
}

export function isWidgetSpecItem(
  item: SurfaceLayoutSpecItem,
): item is WidgetSpecItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as WidgetSpecItem).widget === 'string'
  );
}

// ---------------------------------------------------------------------------
// Random id generation (matches craft's own nanoid(10) id shape closely
// enough for tree-key purposes: a 10-char alphanumeric string)
// ---------------------------------------------------------------------------

const ID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateItemId(): string {
  let id = '';
  for (let i = 0; i < 10; i++) {
    id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return id;
}

// ---------------------------------------------------------------------------
// Padding helper
// ---------------------------------------------------------------------------

function normalizePadding(
  padding: number | [number, number, number, number] | undefined,
): [number, number, number, number] | undefined {
  if (padding === undefined) {
    return undefined;
  }
  if (typeof padding === 'number') {
    return [padding, padding, padding, padding];
  }
  return padding;
}

// ---------------------------------------------------------------------------
// compileSurfaceSpec
// ---------------------------------------------------------------------------

export function compileSurfaceSpec(
  spec: ContainerSpecItem,
  connectedWidgetNodeIds: Set<string>,
  // node-preferred widget props (each node's getWidgetProps(), supplied by
  // the caller because this module must stay node-class free) - the same
  // props the sync layer applies when it inserts a widget, so a widget added
  // via set_surface_layout looks identical to one added from the node header.
  // These are recomputed from the node on EVERY compile: the spec is fully
  // declarative, an omitted prop always means the (node's) default and never
  // a stale value from a previous call. Anything the user tweaked beyond that
  // must come back in explicitly through the spec, which decompileSurfaceTree
  // emits faithfully (see the props passthrough there).
  widgetPropsByNodeId?: Map<string, Record<string, unknown>>,
): CompileSurfaceSpecResult {
  if (!isContainerSpecItem(spec)) {
    throw new Error(
      'compileSurfaceSpec: the root of a surface layout spec must be a container ({direction, children})',
    );
  }

  const warnings: string[] = [];
  const tree: SerializedCraftTree = {};
  const seenWidgetIds = new Set<string>();

  function buildContainerItem(
    item: ContainerSpecItem,
    parent: string | undefined,
    defaults: Record<string, unknown>,
  ): { id: string; craftItem: SerializedCraftItem } {
    const id = parent === undefined ? RootName : generateItemId();
    const isRoot = id === RootName;

    const overrides: Record<string, unknown> = {};
    if (item.direction !== undefined) {
      // ROOT is the page shell (centered, max-width, vertically scrolling) and
      // the renderer always lays it out as a column - a row override here would
      // be silently ignored. Force column and tell the caller to nest a row
      // container instead of letting them chase a no-op.
      if (isRoot && item.direction !== 'column') {
        warnings.push(
          `the root container is always a vertical stack; "direction":"${item.direction}" was ignored. Wrap side-by-side content in a nested {"direction":"row", children:[...]} container.`,
        );
      } else {
        overrides.flexDirection = item.direction;
      }
    }
    if (item.gap !== undefined) {
      overrides.gap = item.gap;
    }
    const padding = normalizePadding(item.padding);
    if (padding !== undefined) {
      overrides.padding = padding;
    }
    if (item.background !== undefined) {
      overrides.background = item.background;
    }
    if (item.width !== undefined) {
      overrides.width = item.width;
    }
    if (item.height !== undefined) {
      overrides.height = item.height;
    }
    if (item.align !== undefined) {
      overrides.alignItems = item.align;
    }
    if (item.justify !== undefined) {
      overrides.justifyContent = item.justify;
    }
    if (item.mobileBehavior !== undefined) {
      overrides.mobileBehavior = item.mobileBehavior;
    }

    const props = { ...defaults, ...overrides, ...(item.props ?? {}) };

    const craftItem: SerializedCraftItem =
      id === RootName
        ? {
            type: { resolvedName: containerName },
            displayName: containerName,
            isCanvas: true,
            props,
            custom: {},
            hidden: false,
            nodes: [],
            linkedNodes: {},
          }
        : {
            type: { resolvedName: containerName },
            displayName: containerName,
            isCanvas: true,
            props,
            custom: {},
            hidden: false,
            parent,
            nodes: [],
            linkedNodes: {},
          };

    tree[id] = craftItem;

    item.children.forEach((child) => {
      const childId = buildAnyItem(child, id);
      craftItem.nodes.push(childId);
    });

    return { id, craftItem };
  }

  function buildTextItem(item: TextSpecItem, parent: string): string {
    const id = generateItemId();
    const overrides = {
      text: item.text,
      ...pickDefined(item, ['fontSize', 'fontWeight', 'textAlign', 'color']),
    };

    const props = {
      ...textDefaultPropsForSpec,
      ...overrides,
      ...(item.props ?? {}),
    };

    tree[id] = {
      type: { resolvedName: 'Text' },
      displayName: 'Text',
      isCanvas: false,
      props,
      custom: {},
      hidden: false,
      parent,
      nodes: [],
      linkedNodes: {},
    };
    return id;
  }

  function buildWidgetItem(item: WidgetSpecItem, parent: string): string {
    if (seenWidgetIds.has(item.widget)) {
      throw new Error(
        `compileSurfaceSpec: widget "${item.widget}" appears more than once in the layout spec`,
      );
    }
    if (!connectedWidgetNodeIds.has(item.widget)) {
      throw new Error(
        `compileSurfaceSpec: widget "${item.widget}" is not connected to this surface. Valid widget ids: ${
          connectedWidgetNodeIds.size > 0
            ? Array.from(connectedWidgetNodeIds).join(', ')
            : '(none connected)'
        }`,
      );
    }
    seenWidgetIds.add(item.widget);

    const overrides = pickDefined(item, [
      'showLabel',
      'collapsible',
      'collapsedByDefault',
      'width',
      'height',
    ]);

    const elementId = getElementIdForNode(item.widget);

    // always built fresh (declarative): shared defaults, then the node's own
    // preferred widget props (matching a sync-layer insert), then the spec's
    // explicit overrides.
    const id = generateItemId();
    const craftItem: SerializedCraftItem = {
      type: { resolvedName: DynamicWidgetName },
      displayName: DynamicWidgetName,
      isCanvas: false,
      props: {
        ...dynamicWidgetDefaultProps,
        ...(widgetPropsByNodeId?.get(item.widget) ?? {}),
        id: elementId,
        index: 0,
        ...overrides,
        ...(item.props ?? {}),
      },
      custom: {},
      hidden: false,
      parent,
      nodes: [],
      linkedNodes: {},
    };

    tree[id] = craftItem;
    return id;
  }

  function buildAnyItem(item: SurfaceLayoutSpecItem, parent: string): string {
    if (isContainerSpecItem(item)) {
      return buildContainerItem(item, parent, containerDefaultPropsForSpec).id;
    }
    if (isWidgetSpecItem(item)) {
      return buildWidgetItem(item, parent);
    }
    if (isTextSpecItem(item)) {
      return buildTextItem(item, parent);
    }
    throw new Error(
      `compileSurfaceSpec: unrecognised layout spec item: ${JSON.stringify(item)}`,
    );
  }

  buildContainerItem(spec, undefined, rootProps);

  // any connected widget id missing from the spec is appended to ROOT's
  // children rather than treated as an error (the sync layer would re-add it
  // anyway on the next inputPlugged/onExecute cycle)
  connectedWidgetNodeIds.forEach((nodeId) => {
    if (seenWidgetIds.has(nodeId)) {
      return;
    }
    const appendedId = buildWidgetItem({ widget: nodeId }, RootName);
    tree[RootName].nodes.push(appendedId);
    warnings.push(
      `widget ${nodeId} was connected but missing from the layout; appended at the end (the sync layer would re-add it anyway - include it explicitly or disconnect it)`,
    );
  });

  return { tree, warnings };
}

// ---------------------------------------------------------------------------
// decompileSurfaceTree
// ---------------------------------------------------------------------------

function diffProps(
  props: Record<string, unknown>,
  defaults: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  keys.forEach((key) => {
    const value = props[key];
    const defaultValue = defaults[key];
    if (JSON.stringify(value) !== JSON.stringify(defaultValue)) {
      result[key] = value;
    }
  });
  return result;
}

// Emits every remaining explicit, non-default prop into the spec item's
// `props` passthrough (which compile merges last), so props the spec has no
// first-class field for - e.g. minWidth tweaked in the dashboard editor's
// WidthHeightControl - survive the AI's inspect -> modify -> set loop. Since
// compileSurfaceSpec is fully declarative (no persistence from the previous
// tree), this read-side faithfulness is what preserves user tweaks.
function collectExtraProps(
  props: Record<string, unknown>,
  defaults: Record<string, unknown>,
  handledKeys: string[],
  internalKeys: string[] = [],
): Record<string, unknown> | undefined {
  const skip = new Set([...handledKeys, ...internalKeys]);
  const extras: Record<string, unknown> = {};
  Object.keys(props).forEach((key) => {
    if (skip.has(key)) {
      return;
    }
    if (JSON.stringify(props[key]) !== JSON.stringify(defaults[key])) {
      extras[key] = props[key];
    }
  });
  return Object.keys(extras).length > 0 ? extras : undefined;
}

export function decompileSurfaceTree(
  tree: SerializedCraftTree,
): DecompileSurfaceTreeResult {
  const unknownItems: string[] = [];

  function decompileContainer(
    id: string,
    defaults: Record<string, unknown>,
  ): ContainerSpecItem {
    const item = tree[id];
    const props = item.props ?? {};
    const diffed = diffProps(props, defaults, [
      'gap',
      'padding',
      'background',
      'width',
      'height',
      'alignItems',
      'justifyContent',
      'mobileBehavior',
    ]);

    const result: ContainerSpecItem = {
      direction: (props.flexDirection as 'row' | 'column') ?? 'column',
      children: (item.nodes ?? []).map((childId) => decompileAny(childId)),
    };
    if (diffed.gap !== undefined) result.gap = diffed.gap as number;
    if (diffed.padding !== undefined) {
      result.padding = diffed.padding as [number, number, number, number];
    }
    if (diffed.background !== undefined) {
      result.background = diffed.background as SurfaceLayoutColor;
    }
    if (diffed.width !== undefined) result.width = diffed.width as string;
    if (diffed.height !== undefined) result.height = diffed.height as string;
    if (diffed.alignItems !== undefined) {
      result.align = diffed.alignItems as string;
    }
    if (diffed.justifyContent !== undefined) {
      result.justify = diffed.justifyContent as string;
    }
    if (diffed.mobileBehavior !== undefined) {
      result.mobileBehavior = diffed.mobileBehavior as
        | 'row'
        | 'column'
        | 'wrap';
    }
    const extras = collectExtraProps(props, defaults, [
      'flexDirection', // handled as `direction`
      'gap',
      'padding',
      'background',
      'width',
      'height',
      'alignItems',
      'justifyContent',
      'mobileBehavior',
    ]);
    if (extras) result.props = extras;
    return result;
  }

  function decompileText(id: string): TextSpecItem {
    const item = tree[id];
    const props = item.props ?? {};
    const diffed = diffProps(props, textDefaultPropsForSpec, [
      'fontSize',
      'fontWeight',
      'textAlign',
      'color',
    ]);

    const result: TextSpecItem = {
      text: (props.text as string) ?? '',
    };
    if (diffed.fontSize !== undefined)
      result.fontSize = diffed.fontSize as number;
    if (diffed.fontWeight !== undefined) {
      result.fontWeight = diffed.fontWeight as string;
    }
    if (diffed.textAlign !== undefined) {
      result.textAlign = diffed.textAlign as string;
    }
    if (diffed.color !== undefined)
      result.color = diffed.color as SurfaceLayoutColor;
    const extras = collectExtraProps(props, textDefaultPropsForSpec, [
      'text',
      'fontSize',
      'fontWeight',
      'textAlign',
      'color',
    ]);
    if (extras) result.props = extras;
    return result;
  }

  function decompileWidget(id: string): WidgetSpecItem {
    const item = tree[id];
    const props = item.props ?? {};
    const elementId = String(props.id ?? '');
    const nodeId = elementId.startsWith(NODE_ELEMENT_PREFIX)
      ? elementId.slice(NODE_ELEMENT_PREFIX.length)
      : elementId;

    const diffed = diffProps(props, dynamicWidgetDefaultProps, [
      'showLabel',
      'collapsible',
      'collapsedByDefault',
      'width',
      'height',
    ]);

    const result: WidgetSpecItem = { widget: nodeId };
    if (diffed.showLabel !== undefined) {
      result.showLabel = diffed.showLabel as boolean;
    }
    if (diffed.collapsible !== undefined) {
      result.collapsible = diffed.collapsible as boolean;
    }
    if (diffed.collapsedByDefault !== undefined) {
      result.collapsedByDefault = diffed.collapsedByDefault as boolean;
    }
    if (diffed.width !== undefined) result.width = diffed.width as string;
    if (diffed.height !== undefined) result.height = diffed.height as string;
    const extras = collectExtraProps(
      props,
      dynamicWidgetDefaultProps,
      ['showLabel', 'collapsible', 'collapsedByDefault', 'width', 'height'],
      // internal, recomputed on every compile - never round-tripped
      // randomMainColor is retired, but trees saved before that still carry
      // it - it stays listed so it keeps being ignored rather than surfacing
      // as an extra prop on every decompiled widget.
      ['id', 'index', 'randomMainColor'],
    );
    if (extras) result.props = extras;
    return result;
  }

  function decompileAny(id: string): SurfaceLayoutSpecItem {
    const item = tree[id];
    const resolvedName = item?.type?.resolvedName;
    if (resolvedName === containerName) {
      return decompileContainer(id, containerDefaultPropsForSpec);
    }
    if (resolvedName === 'Text') {
      return decompileText(id);
    }
    if (resolvedName === DynamicWidgetName) {
      return decompileWidget(id);
    }
    unknownItems.push(id);
    return { props: item?.props ?? {} } as unknown as SurfaceLayoutSpecItem;
  }

  const root = decompileContainer(RootName, rootProps);
  return { root, unknownItems };
}
