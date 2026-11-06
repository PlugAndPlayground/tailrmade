import { TRgba } from '../utils/color';
import {
  COLOR_COMMENT,
  COLOR_WHITE_TEXT,
  DARK_HEX,
  MAIN_COLOR,
  NODE_TYPE_COLOR,
  WHITE_HEX,
} from '../utils/constants';
import { REACT_UI_CONNECTION_ALPHA } from '../utils/visuals';

// How the graph canvas looks: light, dark, or dark with the space backdrop.
// Nodes, sockets and selection paint their own backgrounds and read fine on
// either, so the palette only covers what is drawn straight onto the canvas.

export enum CANVAS_MODE {
  LIGHT = 'Light',
  DARK = 'Dark',
  SPACE = 'Space',
}

export type CanvasPalette = {
  background: number;
  emptyCanvasHeading: string;
  // badges and hover buttons around nodes
  iconTint: number;
  // align buttons below a selection
  selectionButtonTint: number;
  commentText: string;
  layoutNode: string;
  layoutWire: string;
  // ReactUI wires are meant to stay faint; light on dark needs more alpha
  // than dark on light to read equally faint
  layoutWireAlpha: number;
};

const mainColor = TRgba.fromString(MAIN_COLOR);

const LIGHT_PALETTE: CanvasPalette = {
  background: mainColor.mix(TRgba.white(), 0.9).hexNumber(),
  emptyCanvasHeading: '#0c1122',
  iconTint: DARK_HEX,
  selectionButtonTint: mainColor.darken(0.7).hexNumber(),
  commentText: COLOR_COMMENT,
  layoutNode: NODE_TYPE_COLOR.LAYOUT,
  layoutWire: NODE_TYPE_COLOR.LAYOUT,
  layoutWireAlpha: REACT_UI_CONNECTION_ALPHA,
};

const DARK_PALETTE: CanvasPalette = {
  background: mainColor.darken(0.72).hexNumber(),
  emptyCanvasHeading: COLOR_WHITE_TEXT,
  iconTint: WHITE_HEX,
  selectionButtonTint: mainColor.mix(TRgba.white(), 0.75).hexNumber(),
  commentText: '#9AA6CC',
  layoutNode: '#2B3557',
  layoutWire: '#9AA6CC',
  layoutWireAlpha: 0.2,
};

const STORAGE_KEY = 'canvasMode';

const readStoredMode = (): CANVAS_MODE => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return (
    Object.values(CANVAS_MODE).find((mode) => mode === stored) ??
    CANVAS_MODE.LIGHT
  );
};

export default class CanvasMode {
  private static mode = readStoredMode();
  private static listeners = new Set<() => void>();

  static get(): CANVAS_MODE {
    return CanvasMode.mode;
  }

  static palette(): CanvasPalette {
    return CanvasMode.mode === CANVAS_MODE.LIGHT ? LIGHT_PALETTE : DARK_PALETTE;
  }

  static set(mode: CANVAS_MODE): void {
    if (mode === CanvasMode.mode) {
      return;
    }
    CanvasMode.mode = mode;
    localStorage.setItem(STORAGE_KEY, mode);
    CanvasMode.listeners.forEach((listener) => listener());
  }

  // Light -> Dark -> Space -> Light
  static cycle(): void {
    const modes = Object.values(CANVAS_MODE);
    CanvasMode.set(modes[(modes.indexOf(CanvasMode.mode) + 1) % modes.length]);
  }

  static onChange(listener: () => void): void {
    CanvasMode.listeners.add(listener);
  }
}
