import * as PIXI from 'pixi.js';
import { createTheme } from '@mui/material';
import { TextStyle } from 'pixi.js';
import type { EnumStructure } from '../nodes/datatypes/enumType';
import { darkThemeOverride } from './customTheme';
import { TRgba } from './color';
export { SOCKET_TYPE } from './constants_shared';

export const URL_PARAMETER_NAME = {
  NEW: 'new',
  TOASTEVERYTHING: 'toastEverything',
  LOADURLGRAPH: 'loadFullGraph',
  LOADGRAPH: 'loadGraph',
  LOADLOCALGRAPH: 'loadLocalGraph',
  LOADREMOTEGRAPH: 'loadRemoteGraph',
  SETSOCKETDATA: 'setSocketData',
};

export const GET_STARTED_GRAPH = 'Welcome to Tailrmade';

export const GESTUREMODE = {
  MOUSE: 'Mouse',
  TRACKPAD: 'Trackpad',
  AUTO: 'Auto detect',
} as const;

export const ONCLICK_DOUBLECLICK = 2;
export const ONCLICK_TRIPPLECLICK = 3;

export const ALIGNOPTIONS = {
  ALIGN_AUTO: 'Align auto',
  ALIGN_LEFT: 'Align left',
  ALIGN_CENTER_HORIZONTAL: 'Align center horizontal',
  ALIGN_RIGHT: 'Align right',
  ALIGN_TOP: 'Align top',
  ALIGN_CENTER_VERTICAL: 'Align center vertical',
  ALIGN_BOTTOM: 'Align bottom',
  DISTRIBUTE_VERTICAL: 'Distribute vertical',
  DISTRIBUTE_HORIZONTAL: 'Distribute horizontal',
} as const;

export const DRAWER_CONSTANTS = {
  MIN_DRAWER_WIDTH: 240,
  DEFAULT_DRAWER_WIDTH: 340,
  MAX_DRAWER_WIDTH:
    typeof window === 'undefined' ? 340 : window.innerWidth - 100,
  DEFAULT_DASHBOARD_WIDTH_PERCENTAGE: 35,
  MAX_DASHBOARD_WIDTH_PERCENTAGE: 80,
} as const;

// The docked shell: rail | menu panel | dashboard | canvas strip | inspector
// are siblings in one flex row, so opening a panel narrows its neighbours
// instead of covering them. The row itself is pointer-events:none - only the
// panels take events, which lets the full-screen pixi canvas behind stay
// interactive through the canvas strip.
export const SHELL_CONSTANTS = {
  RAIL_WIDTH: 48,
  // the dashboard's own header row, so no global bar can cover the app UI
  DASHBOARD_HEADER_HEIGHT: 48,
  // the dashboard may never take so much that the canvas disappears
  // completely - maximising (the header's expand button) is the explicit
  // way to do that
  MIN_CANVAS_STRIP_WIDTH: 120,
} as const;

// The docked panels' backgrounds. They live here rather than in each panel
// because the rail has no colour of its own - it borrows whichever of these
// its neighbour is using, and the two columns only read as one surface while
// both sides agree on the value.
export const getDrawerBackground = (randomMainColor: string): TRgba =>
  TRgba.fromString(randomMainColor).darken(0.8);

export const getDashboardBackground = (randomMainColor: string): TRgba =>
  TRgba.fromString(randomMainColor).darken(0.85);

export const DASHBOARD_DEFAULT = {
  visible: false,
  fullscreen: false,
  maximized: false,
  widthPercentage: DRAWER_CONSTANTS.DEFAULT_DASHBOARD_WIDTH_PERCENTAGE,
  locked: false,
};

// Which content the left drawer is showing (distinct tools).
export enum LeftDrawerView {
  GRAPHS = 'graphs',
  AI = 'ai',
  ACTIONS = 'actions',
}

// Which tab the right drawer (inspector) is showing for the current selection.
export enum RightDrawerView {
  GRAPH = 'graph',
  INTERFACE = 'interface',
  APP = 'app',
}

// The shared role: a named sub-view a drawer can open/switch to. Each drawer
// still only accepts its own view type - this alias is only for the generic
// drawer-toggling code path.
export type DrawerView = LeftDrawerView | RightDrawerView;

// old node color #C1CADF
export const COLOR = [
  '#E1547D',
  '#E154BB',
  '#AB53DE',
  '#5952DF',
  '#549BE0',
  '#56E1CC',
  '#55E179',
  '#7FE158',
  '#D4E25A',
  '#E19757',
  '#A43F6C',
  '#5F3EA3',
  '#3E54A3',
  '#4092A4',
  '#40A577',
  '#42A541',
  '#7BA442',
  '#A58E43',
  '#A45140',
  '#D4FF00',
  '#F5F5F5',
  '#090D1A',
];

export const COLOR_WHITE = '#F5F5F5';
export const WHITE_HEX = 0xf5f5f5;
export const COLOR_DARK = '#0C0C0C';
export const DARK_HEX = 0x0c0c0c;
export const COLOR_WHITE_TEXT = '#F4FAF9';
export const COLOR_ERROR = '#FF0000';
export const COLOR_WARNING = '#FF8A00';

export const MAIN_COLOR = '#3c54ab';
const randomColor = TRgba.fromString(MAIN_COLOR);

export const customTheme = createTheme(darkThemeOverride, {
  palette: {
    primary: {
      light: `${randomColor.lighten(0.2)}`,
      main: `${MAIN_COLOR}`,
      dark: `${randomColor.darken(0.2)}`,
      contrastText: `${randomColor.getContrastTextColor()}`,
    },
    secondary: {
      light: `${randomColor.negate().lighten(0.2)}`,
      main: `${randomColor.negate()}`,
      dark: `${randomColor.negate().darken(0.2)}`,
      contrastText: `${randomColor.negate().getContrastTextColor()}`,
    },
    background: {
      paper: `${randomColor.darken(0.5)}`,
      medium: `${randomColor.darken(0.6)}`,
      default: `${randomColor.darken(0.85)}`,
    },
  },
});

export const PRESET_COLORS = [
  '#F4FAF9',
  '#F5F5F5',
  '#0C0C0C',
  '#E1547D',
  '#E154BB',
  '#AB53DE',
  '#5952DF',
  '#549BE0',
  '#56E1CC',
  '#55E179',
  '#7FE158',
  '#D4E25A',
  '#E19757',
  '#A43F6C',
  '#5F3EA3',
  '#3E54A3',
  '#4092A4',
  '#40A577',
  '#42A541',
  '#7BA442',
  '#A58E43',
  '#A45140',
  '#D4FF00',
];

export const ERROR_COLOR = TRgba.fromString('#B71C1C');
export const SUCCESS_COLOR = TRgba.fromString('#4BB543');

export const CANVAS_BACKGROUND_TEXTURE =
  '../assets/Pixel_grid_4000x2000.svg.png';
export const CANVAS_BACKGROUND_ALPHA = 0.01;
export const NINE_SLICE_SHADOW = '../assets/NineSliceShadow.png';

export const COLOR_MAIN = TRgba.fromString(COLOR[0]).lighten(0.8).hex();
export const COLOR_COMMENT = COLOR[12];

// common
export const TEXT_RESOLUTION = 2; // so one can zoom in closer and it keeps a decent resolution
export const GRAPH_RESOLUTION = 2;

export const SOCKET_COLOR_HEX: string = TRgba.fromString(COLOR[0])
  .lighten(0.4)
  .hex();
export const SOCKET_HEIGHT = 24;
export const SOCKET_WIDTH = 12;
export const SOCKET_CORNERRADIUS = 4;
export const SOCKET_TEXTMARGIN = 8;
export const SOCKET_TEXTMARGIN_TOP = 4;
export const SOCKET_TEXTSTYLE = new TextStyle({
  fontSize: 12,
  fill: COLOR_MAIN,
});
export const UPDATEBEHAVIOURHEADER_TEXTSTYLE = new TextStyle({
  fontSize: 10,
  fill: '#FFFFFF',
});
export const UPDATEBEHAVIOURHEADER_UPDATE =
  '../assets/Icon_UpdateBehaviour_Update.svg';
export const UPDATEBEHAVIOURHEADER_NOUPDATE =
  '../assets/Icon_UpdateBehaviour_NoUpdate.svg';
export const UPDATEBEHAVIOURHEADER_INTERVAL =
  '../assets/Icon_UpdateBehaviour_Interval.svg';
export const UPDATEBEHAVIOURHEADER_NOLOAD =
  '../assets/Icon_UpdateBehaviour_NoLoad.svg';
export const ICON_BADGE_SIZE = 20;
export const ICON_BADGE_GAP = 2;
export const ICON_BADGE_BACKGROUND = {
  color: 0x000000,
  alpha: 0.02,
} as const;
export const ICON_BADGE_STATIC_ICON_ALPHA = 0.85;
export const ICON_BADGE_BUTTON_DEFAULT_ALPHA = 0.65;
export const ICON_BADGE_BUTTON_HOVER_ALPHA = 1;
export const ICON_BADGE_ICON_TINT = DARK_HEX;
export const ICON_BADGE_SVG_RESOLUTION = 2;
export const EDIT_ICON_TEXTURE = '../assets/Icon_Tune.svg';
export const ADD_TO_DASHBOARD_ICON_TEXTURE =
  '../assets/Icon_AddToDashboard.svg';
export const CONFIRMATION_ICON_TEXTURE = '../assets/Icon_Confirmation.svg';

export const ALIGNLEFT_TEXTURE = '../assets/Icon_AlignLeft.svg';
export const ALIGNAUTO_TEXTURE = '../assets/Icon_AutoAlign.svg';
export const ALIGNCENTERHORIZONTALLY_TEXTURE =
  '../assets/Icon_AlignCenterHorizontally.svg';
export const ALIGNRIGHT_TEXTURE = '../assets/Icon_AlignRight.svg';
export const ALIGNTOP_TEXTURE = '../assets/Icon_AlignTop.svg';
export const ALIGNCENTERVERTICALLY_TEXTURE =
  '../assets/Icon_AlignCenterVertically.svg';
export const ALIGNBOTTOM_TEXTURE = '../assets/Icon_AlignBottom.svg';
export const DISTRIBUTEHORIZONTAL_TEXTURE =
  '../assets/Icon_DistributeHorizontally.svg';
export const DISTRIBUTEVERTICAL_TEXTURE =
  '../assets/Icon_DistributeVertically.svg';

export const NODE_TEXTSTYLE = new TextStyle({
  fontSize: 13,
  fontWeight: 'bold',
  fill: COLOR_MAIN,
});
export const NODE_MARGIN = SOCKET_WIDTH / 2;
export const NODE_HEADER_HEIGHT = 24;
export const NODE_PADDING_TOP = 8;
export const NODE_PADDING_BOTTOM = 8;
export const NODE_HEADER_TEXTMARGIN_LEFT = SOCKET_WIDTH / 2 + 14;
export const NODE_HEADER_TEXTMARGIN_TOP = 4;
export const NODE_WIDTH = 160;
export const NODE_CORNERRADIUS = 8;

export const SMALL_NODE_WIDTH = 115;

export const CONTEXTMENU_WIDTH = 288;
export const CONTEXTMENU_GRAPH_HEIGHT = 764;
export const TOOLTIP_WIDTH = 320;
export const TOOLTIP_DISTANCE = 8;
export const TOOLTIP_DELAY = 700;

export const DISABLED_OPACITY = 0.75;

export const DRAGANDDROP_GRID_MARGIN = 32;

export const DEFAULT_UPDATE_FREQUENCY = 1000;

export const NODE_TYPE_COLOR = {
  DEFAULT: COLOR[1], // Transform
  INPUT: COLOR[0],
  TRANSFORM: COLOR[1],
  DRAW: COLOR[2],
  SHADER: COLOR[3],
  OUTPUT: COLOR[4],
  SYSTEM: COLOR[5],
  MACRO: COLOR[6],
  WIDGET: COLOR[20],
  LAYOUT: COLOR[21],
  MISSING: COLOR_ERROR,
};

export const PIXI_TRANSPARENT_ALPHA = 0.001; // If an PIXI element has alpha set to 0 it has no size and is not rendered at all
export const PIXI_OVERLAY_ALPHA = 0.2;

export const NODE_SOURCE = {
  NEW: 'New',
  NEWCONNECTED: 'NewConnected',
  SERIALIZED: 'Serialized',
  NEW_DASHBOARD: 'NewDashboard',
} as const;

export enum STATUS_SEVERITY {
  SUCCESS = 1,
  WARNING = 2,
  ERROR = 3,
  FATAL = 4,
}

export const COMMENT_TEXTSTYLE = new TextStyle({
  fontSize: 12,
  fill: COLOR_COMMENT,
  align: 'left',
  fontStyle: 'italic',
});

export const CONNECTION_COLOR_HEX = new PIXI.Color(
  TRgba.fromString(COLOR[0]).desaturate(0.3).hex(),
).toNumber();

export const SELECTION_COLOR_HEX = new PIXI.Color(
  TRgba.fromString(COLOR[4]).desaturate(0.3).hex(),
).toNumber();

export const SELECTION_DOWNSTREAM_TEXTURE =
  '../assets/Icon_SelectDownstream.svg';
export const SELECTION_UPSTREAM_TEXTURE = '../assets/Icon_SelectUpstream.svg';
export const SELECTION_WHOLE_TEXTURE = '../assets/Icon_SelectWhole.svg';

export const NOTE_FONT = '../assets/Arial-normal-black.fnt';
export const NOTE_MARGIN_STRING = '3px 0px 0px 5px';
export const NOTE_PADDING = 12;
export const NOTE_FONTSIZE = 32;
export const NOTE_LINEHEIGHT_FACTOR = 1.15;

export const MAX_STRING_LENGTH = 10000;

export const DEFAULT_EDITOR_DATA = `// Ctrl-Enter to update node
// Change function name to create new node
function customFunctionNode(a, b) {
  return a * b;
}`;

export const DEFAULT_2DVECTOR = {
  x: 0,
  y: 0,
};

export const DEFAULT_3DVECTOR = {
  x: 0,
  y: 0,
  z: 0,
};

export const MAX_LATEST_NODES_IN_SEARCH = 3;

export const PIXI_PIVOT_OPTIONS: EnumStructure = [
  {
    text: 'top left',
    value: { x: 0.0, y: 0.0 },
  },
  {
    text: 'top center',
    value: { x: 0.5, y: 0.0 },
  },
  {
    text: 'top right',
    value: { x: 1.0, y: 0.0 },
  },
  {
    text: 'center left',
    value: { x: 0.0, y: 0.5 },
  },
  {
    text: 'center center',
    value: { x: 0.5, y: 0.5 },
  },
  {
    text: 'center right',
    value: { x: 1.0, y: 0.5 },
  },
  {
    text: 'bottom left',
    value: { x: 0.0, y: 1.0 },
  },
  {
    text: 'bottom center',
    value: { x: 0.5, y: 1.0 },
  },
  {
    text: 'bottom right',
    value: { x: 1.0, y: 1.0 },
  },
];

export const SIMPLE_SIZE_OPTIONS: EnumStructure = [
  { text: 'Quarter', value: 0.25 },
  { text: 'Half', value: 0.5 },
  { text: 'Full', value: 1 },
];

export const SCALEHANDLE_SIZE = 8;

export const DEFAULT_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAABrrFhUAAAAP1BMVEX////29vb4+Pj4+Pj6+vr5+fn39/f7+/v////4+Pj4+Pj39/f5+fn7+/v39/f5+fn4+Pj4+Pj6+vr39/f39/cLb9M/AAAAFHRSTlMUbeLwMYnEIjGZbNNPQKd70rZd8TNl2iwAAAK2SURBVHja7N1bktsgEEDRDg8hQI9xwv7XmsRTM8nYjjGVkgDpnh3oNrb14WoEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADg02QHlXahBjtLa6Yh7SoGaYkZ0u4WI82YVapANVPA/EhV6Ea+CczL8z/oGVhSNYM0IKSKJqkvpgIHPAJzKnO4I2BTVVZqG1Kho30GVKpKSW2pMilEAAIQgAAEIAABCEAAAhCAAAQgAAEIQAACEIAABCAAAQhAAAIQgAAEIAABCEAAAhCAAAQgAAEIQAACEIAABCAAAQhAAALsHcDGcwfwYvSZAygRCScOoEb5xZ83wHf5zcWzBrDyzuhzBrjIh3DKAGqUT/6MAUb5w8XzBVjlb0YfK4BKOV6+CocKYGedK+Tkhj9QgEVkzX4B3nLxMAGu07WZN6B7Rh8kgH6f7qV4FUg4SIBVrpwq3gTiDxHAZnduqVEec/EAAd7yO4dm+Rejuw/wZbpr8S6g0H2AKfuh9vKM7zyAze5dUk6ecbHrAMvd86j738jnjO44gHLZ5wmSE/oN8HC6U/EyNN9tgFUeWUt3obnYaQCbnaga5RVGdxngLb+Cb5bXhB4DPJmuU6XbEH2HAabsmV7kZS52F+D5dKfcG9B9ss4C5Ka7Jj1KidBXgPx0fZAyvqcA+emWc7GjAKtswOhuAljZROglwJtsxPcRQI2yERe7CDDJZozuIICVDYX2AyyyKd96AOVkUy62HUCPsjGjmw4wfNvcpekA/4H/ChOAAAQgAAEI0F2A01+zc/qLlk5/1daUqmrg0skhVRSlvilV1MTlu0OqZpEWVLx0dZQmzDpVoRt5/lpnQDXwC/DBLGl3QzPzvwox7Wqof9vqrXnP6/fbe3wAAAAAAAAAAAAAAAAAAAAAwM/24JAAAAAAQND/186wAAAAAADwCYSLR6/Ziv9fAAAAAElFTkSuQmCC';

export const IMAGE_TYPES: EnumStructure = [
  {
    text: 'jpg',
    value: 'image/jpeg',
  },
  {
    text: 'png',
    value: 'image/png',
  },
];

export const OBJECT_FIT_OPTIONS: EnumStructure = [
  {
    text: 'contain',
  },
  {
    text: 'cover',
  },
  {
    text: 'fill',
  },
  {
    text: 'scale-down',
  },
  {
    text: 'none',
  },
];

export const COMPARISON_OPTIONS: EnumStructure = [
  {
    text: 'Greater than (>)',
    value: '>',
  },
  {
    text: 'Greater than or equal (>=)',
    value: '>=',
  },
  {
    text: 'Less than (<)',
    value: '<',
  },
  {
    text: 'Less than or equal (<=)',
    value: '<=',
  },
  {
    text: 'Equal (==)',
    value: '==',
  },
  {
    text: 'Not equal (!=)',
    value: '!=',
  },
  {
    text: 'Strict equal (===)',
    value: '===',
  },
  {
    text: 'Strict not equal (!==)',
    value: '!==',
  },
  {
    text: 'Logical AND (&&)',
    value: '&&',
  },
  {
    text: 'Logical OR (||)',
    value: '||',
  },
  {
    text: 'Logical NOT (!)',
    value: '!',
  },
];

export const CONDITION_OPTIONS: EnumStructure = [
  {
    text: 'is null OR undefined',
  },
  {
    text: 'is undefined',
  },
  {
    text: 'is null',
  },
  {
    text: 'is NOT null OR undefined',
  },
  {
    text: 'is NOT undefined',
  },
  {
    text: 'is NOT null',
  },
];

export const TRIGGER_TYPE_OPTIONS: EnumStructure = [
  {
    text: 'positiveFlank',
  },
  {
    text: 'negativeFlank',
  },
  {
    text: 'change',
  },
  {
    text: 'always',
  },
];

export const LOADING_STATE = {
  ISLOADING: 'ISLOADING',
  LOADED: 'LOADED',
  FAILED: 'FAILED',
};

export const GRID_SHADER = `
  precision mediump float;
  varying vec2 vUvs;
  uniform float zoom;

  void main()
  {
      //Generate a simple grid.
      //Offset uv so that center is 0,0 and edges are -1,1
      vec2 uv = (vUvs-vec2(0.5))*2.0;
      vec2 gUv = floor(uv*zoom);
      vec4 color1 = vec4(0.0, 0.0, 0.0, 0.0);
      vec4 color2 = vec4(0.0, 0.0, 0.0, 0.05);
      vec4 outColor = mod(gUv.x + gUv.y, 2.) < 0.5 ? color1 : color2;
      gl_FragColor = outColor;

  }`;

export const PXSHOW_SQL_QUERY = `SELECT json_extract(state,'$.State') as State FROM states
WHERE service IS 'Store'`;

// General socket names
export const SOCKETNAME_BACKGROUNDCOLOR = 'Background color';
export const SANITIZE_NAME = 'Sanitize input';

// topParentOverrideSettings parameter names
export const parentBgWidthName = 'parentBgWidth';
export const parentBgHeightName = 'parentBgHeight';

export const DATA_DASHBOARD_EDITABLE = 'data-dashboard-editable'; // Attribute to mark HTML elements in the dashboard that are editable (isEventComingFromWithinTextInput)

export const UNSET_VALUE = 'unset';
