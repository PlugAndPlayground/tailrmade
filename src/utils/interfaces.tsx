import * as PIXI from 'pixi.js';
import PPNode from '../classes/NodeClass';
import { PNPStatus, SocketParsingWarning } from '../classes/ErrorClass';
import { IUpdateBehaviour } from '../classes/UpdateBehaviourClass';
import {
  ALIGNOPTIONS,
  SOCKET_TYPE,
  NODE_SOURCE,
  DrawerView,
  LeftDrawerView,
  RightDrawerView,
} from './constants';
import type { UISurfaceNode } from '../nodes/layout/uiSurface';
import type { ThemeDocument } from './theme/document';
export { TRgba } from './color';
export type { TColorHsva } from './color';

export type RegisteredNodeTypes = Record<
  string,
  {
    constructor: PPNodeConstructor;
    name: string;
    description: string;
    hasInputs: boolean;
    tags: string[];
    hasExample: boolean;
    showInNodeSearch: boolean;
  }
>;

export type PPNodeConstructor<T extends PPNode = PPNode> = {
  type?: string;
  category?: string;
  new (name: string, ...args: any[]): T;
};

export enum DrawerSide {
  LEFT = 'leftSide',
  DASHBOARD = 'dashboard',
  RIGHT = 'rightSide',
}

// Both drawers share the same shape - only the type of their active sub-view differs.
export interface IDrawerSideState<V extends DrawerView> {
  visible: boolean;
  width: number;
  activeView?: V;
}

export interface IDrawerState {
  [DrawerSide.LEFT]: IDrawerSideState<LeftDrawerView>;
  [DrawerSide.RIGHT]: IDrawerSideState<RightDrawerView>;
}

export interface IDashboardState {
  [DrawerSide.DASHBOARD]: {
    visible: boolean;
    fullscreen: boolean;
    maximized: boolean;
    widthPercentage: number;
    locked: boolean;
  };
}

export interface IOverlay extends IDrawerState, IDashboardState {}

export type SerializedGraph = {
  version: number;
  graphSettings: {
    showExecutionVisualisation: boolean;
    viewportCenterPosition: PIXI.Point;
    viewportScale: number;
    // the UI surface node shown on app load
    defaultUISurfaceNodeId?: string;
    // the app theme, stored as a SPARSE DIFF against a shipped preset. It
    // lives in the document rather than being produced by the graph so the
    // dashboard can paint before anything has executed - otherwise every load
    // flashes unthemed content, and apps whose theme node is never reached
    // never theme at all. Absent on documents that never touched theming.
    theme?: ThemeDocument;
  };
  overlay: IDashboardState;
  nodes: SerializedNode[];
  links: SerializedLink[];
};

export type SerializedSelection = {
  version: number;
  nodes: SerializedNode[];
  links: SerializedLink[];
};

export type AccessType = 'private' | 'public' | 'organization';

export type CustomArgs = {
  overrideId?: string;
  name?: string;
  nodePosX?: number;
  nodePosY?: number;
  nodeWidth?: number;
  nodeHeight?: number;
  defaultArguments?: Record<string, any>;
};

export interface IGraphSearch {
  id: string;
  name: string;
  isRemote: boolean;
  location: string;
  access: AccessType;
  owner: string;
  date: Date;
}

export interface IGraphSearchLabel {
  label: string;
}
export interface INodeSearch {
  inputValue?: string;
  title: string;
  key: string;
  name: string;
  description: string;
  hasInputs: boolean;
  group: string;
  isNew?: boolean;
}

export type FlexDirection = 'column' | 'row';

export type MobileBehavior = 'column' | 'wrap' | 'row';

export type DashboardIconProps = {
  flexDirection?: FlexDirection;
  mobileBehavior?: MobileBehavior;
  isMobile?: boolean;
};

export type WidgetProps = {
  background: Record<'r' | 'g' | 'b' | 'a', number>;
  width: string;
  height: string;
  minWidth: string;
  minHeight: string;
};

export interface DashboardWidgetProps {
  index: number;
  disabled: boolean;
  width: string;
  height: string;
  minWidth: string;
  minHeight: string;
  maxWidth: string;
  maxHeight: string;
  isEditMode?: boolean;
  components?: React.ReactNode;
  reactUIProps?: any;
  // true when rendered by SurfaceRenderer - a canvas thumbnail, an embedded
  // surface that isn't the one currently open for editing, or a modal/app
  // preview - rather than the single live craftjs Editor instance. The same
  // widget can be on screen in both places at once, so anything that needs a
  // stable, addressable identity (e.g. data-cy) should fold this in to stay
  // distinct from its own live counterpart. Also tells DashboardContentGate
  // to skip its click-capturing overlay when disabled, since these headless
  // renders have no craftjs ancestor for a click to bubble to (clicks should
  // fall through to whatever is underneath instead, e.g. PIXI's canvas for
  // drag-and-drop link creation onto a UI surface node).
  isSurfacePreview?: boolean;
  // Add any additional props you need
}

// messy type trying to statically type the props for the widget content TODO make nicer
export interface WidgetContentProps {
  // Dynamic props from node's input sockets
  [socketName: string]: any;

  // Standard framework props
  id: string;
  selected: boolean;
  isOnlySelected?: boolean;
  node: PPNode;
  // Interaction-enabled is the explicit interaction mode for hybrid nodes.
  isInteractionEnabled: boolean;
  inDashboard: boolean;
  dataCyId: string;

  // Optional dashboard-specific props
  disabled?: boolean;
  showDashboard?: boolean;
  width?: string;
  height?: string;
  isEditMode?: boolean;
  components?: React.ReactNode;
  // see DashboardWidgetProps.isSurfacePreview
  isSurfacePreview?: boolean;
}

export interface Layoutable {
  isLayoutable(): boolean;
  getWidgetProps(): WidgetProps;
  getDashboardId(): string;
  getDashboardName(): string;
  getDashboardIcon(props: DashboardIconProps): React.ReactNode;
  getDashboardWrapper(props: DashboardWidgetProps): React.ReactNode;
  getWidgetContent(props: WidgetContentProps): React.ReactNode;
  getRelatedNode(): PPNode;
  isContainer(): boolean;
  isModalDialog?(): boolean;
  isSurface(): boolean; // Returns true for UI surface nodes
}

// isLayoutable() is PPNode's marker for implementing Layoutable - narrow to
// the intersection so its methods are callable without duck-type probes
export function isLayoutableNode(node: PPNode): node is PPNode & Layoutable {
  return node.isLayoutable();
}

// isSurface() is only true for UISurfaceNode (and subclasses) - narrow so
// its members are callable without casts or duck-type probes
export function isSurfaceNode(node: PPNode): node is UISurfaceNode {
  return node.isSurface();
}

// Node ids are arbitrary unique strings: hri.random() by default (e.g.
// "orange-stingray-61"), "ai-node-<n>" for AI-created nodes, or anything a
// caller passes as overrideId. Nothing may assume a shape - element-id
// parsing resolves against the ids actually present in the graph (see
// utils/elementIds.ts).
export type TNodeId = string;

export type SerializedNode = {
  type: string;
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  socketArray: SerializedSocket[];
  updateBehaviour: IUpdateBehaviour;
  version: number | undefined; // undefined is interpreted as 1
  comment?: string; // optional user comment displayed above the node
};

export type SerializedLink = {
  sourceNodeId: string;
  sourceSocketName: string;
  targetNodeId: string;
  targetSocketName: string;
};

export type TSocketId = `SOCKET_${string}`;

export type TSocketType = (typeof SOCKET_TYPE)[keyof typeof SOCKET_TYPE];

export type TParseType = {
  value: any;
  warnings: SocketParsingWarning[];
};

export interface IWarningHandler {
  setStatus(status: PNPStatus): void;
}

export type SerializedSocket = {
  socketType: TSocketType | undefined; // if it is undefined, it is an input socket
  name: string;
  dataType: string;
  data: any;
  visible: boolean | undefined; // if it is undefined, it is visible
  dependentSocketName: string | undefined;
};

export type TNodeSource = (typeof NODE_SOURCE)[keyof typeof NODE_SOURCE];

export type TAlignOptions = (typeof ALIGNOPTIONS)[keyof typeof ALIGNOPTIONS];
