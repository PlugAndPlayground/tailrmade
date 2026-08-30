import * as React from 'react';
import { Paper, Stack } from '@mui/material';
import HybridNode2 from '../../classes/HybridNode2';
import Socket from '../../classes/SocketClass';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { WidgetProps } from '../../utils/interfaces';
import { EnumStructure, EnumType } from '../datatypes/enumType';
import { StringType } from '../datatypes/stringType';
import { Density, useResolvedDensity, useThemeTokens } from '../../utils/theme';
import { getCanvasGrabThroughSx } from '../../utils/nodeInteractivity';

export const defaultProps: WidgetProps = {
  background: { r: 9, g: 13, b: 26, a: 0 },
  width: '100%',
  height: 'auto',
  minWidth: '48px',
  minHeight: '36px',
};

export const initialValueName = 'Initial Value';
export const labelName = 'Label';
export const offValueName = 'Off value';
export const onValueName = 'On value';
export const optionsName = 'Options';
export const selectedOptionName = 'Selected Option';
export const variantName = 'Variant';
export const colorName = 'Color';
export const sizeName = 'Size';

export const outName = 'Out';
export const outIndexName = 'Index';
export const fallbackValueName = 'Fallback Option';

export const defaultOptions = ['Option 1', 'Option 2', 'Option 3'];

export function stringifyIfNeeded(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

export const colorOptions: EnumStructure = [
  {
    text: 'primary',
  },
  {
    text: 'secondary',
  },
  {
    text: 'success',
  },
  {
    text: 'error',
  },
  {
    text: 'info',
  },
  {
    text: 'warning',
  },
];

// the same five steps the theme calls density - one source of truth, so a
// widget's Size and the theme's density can never drift apart
export type WidgetSize = Density;
export type WidgetSizeSetting = WidgetSize | 'Inherit';
export const sizeOptions: EnumStructure = [
  { text: 'Inherit' },
  { text: 'XS' },
  { text: 'S' },
  { text: 'M' },
  { text: 'L' },
  { text: 'XL' },
];

export const defaultSize: WidgetSize = 'M';
export const defaultSizeSetting: WidgetSizeSetting = 'Inherit';

export type SizeTokens = {
  // MUI only knows 'small' and 'medium', so XS/S and M/L share a MUI size and
  // everything that tells them apart comes from the tokens below
  muiSize: 'small' | 'medium';
  // multiplier on the M baseline, for the places where a widget derives its own
  // font size from the node height (canvas mode) instead of using a fixed one
  scale: number;
  fontSize: number;
  helperFontSize: number;
  iconSize: number;
  // target height of the interactive control
  controlHeight: number;
  tabHeight: number;
  // only set where the MUI default for muiSize does not already produce
  // controlHeight - see getSizeSx
  inputPadding?: { top: number; bottom: number };
};

const sizeTokens: Record<WidgetSize, SizeTokens> = {
  XS: {
    muiSize: 'small',
    scale: 0.75,
    fontSize: 12,
    helperFontSize: 10,
    iconSize: 16,
    controlHeight: 36,
    tabHeight: 32,
    inputPadding: { top: 12, bottom: 4 },
  },
  S: {
    muiSize: 'small',
    scale: 0.875,
    fontSize: 14,
    helperFontSize: 11,
    iconSize: 20,
    controlHeight: 48,
    tabHeight: 40,
  },
  M: {
    muiSize: 'medium',
    scale: 1,
    fontSize: 16,
    helperFontSize: 13,
    iconSize: 24,
    controlHeight: 56,
    tabHeight: 48,
  },
  L: {
    muiSize: 'medium',
    scale: 1.1875,
    fontSize: 19,
    helperFontSize: 15,
    iconSize: 30,
    controlHeight: 68,
    tabHeight: 58,
    inputPadding: { top: 30, bottom: 10 },
  },
  XL: {
    muiSize: 'medium',
    scale: 1.4375,
    fontSize: 23,
    helperFontSize: 18,
    iconSize: 36,
    controlHeight: 80,
    tabHeight: 70,
    inputPadding: { top: 35, bottom: 12 },
  },
};

/**
 * Resolves a widget's Size socket to a concrete step.
 *
 * 'Inherit' - the default - follows the density of whichever theme the widget
 * is under, which is how the app theme reaches controls at all. A widget that
 * names an explicit size opts out. Call this once at the top of a widget and
 * pass the result to the getSize* helpers below, which all expect a size that
 * has already been resolved.
 */
export const useWidgetSize = (setting: unknown): WidgetSize =>
  useResolvedDensity(setting);

/** The theme's type scalar, for the pure getSize* helpers above. */
export const useFontScalar = (): number => useThemeTokens().fontSizeScalar;

export const useSizeTokens = (size: unknown): SizeTokens =>
  getSizeTokens(size, useFontScalar());

export const useSizeSx = (size: unknown) => getSizeSx(size, useFontScalar());

/**
 * Size tokens for a step, with the theme's type scalar applied.
 *
 * Density picks the STEP (how big a control is); fontSizeScalar scales the
 * type system on top of it. Only the text sizes move - control height, icon
 * size and padding are geometry of the control, not of the type scale, and
 * scaling them here would make fontSizeScalar a second density knob.
 */
export const getSizeTokens = (size: unknown, fontScalar = 1): SizeTokens => {
  const base = sizeTokens[size as WidgetSize] ?? sizeTokens[defaultSize];
  if (fontScalar === 1) {
    return base;
  }
  return {
    ...base,
    fontSize: Math.round(base.fontSize * fontScalar),
    helperFontSize: Math.round(base.helperFontSize * fontScalar),
  };
};

export const getMuiSize = (size: unknown): 'small' | 'medium' =>
  getSizeTokens(size).muiSize;

// text never gets smaller than this, however small the node is drawn
const MIN_CANVAS_FONT_SIZE = 10;

/**
 * Font size for widgets whose text follows the node height on the canvas: the
 * size step decides it in the dashboard, the node height decides it on the
 * canvas (scaled by the step, floored at MIN_CANVAS_FONT_SIZE).
 */
export const getWidgetFontSize = (
  tokens: SizeTokens,
  inDashboard: boolean,
  nodeHeight: number,
  divisor = 10,
): string =>
  inDashboard
    ? `${tokens.fontSize}px`
    : `${Math.max(MIN_CANVAS_FONT_SIZE, nodeHeight / divisor) * tokens.scale}px`;

// Autocomplete component needs special handling
const INPUT_LINE_HEIGHT_EM = 1.4375;
const AUTOCOMPLETE_INPUT_PADDING_Y = { small: 2.5, medium: 7 };
const AUTOCOMPLETE_ROOT_PADDING_BOTTOM = { small: 1, medium: 0 };
const getAutocompleteRootPaddingTop = (t: SizeTokens): number =>
  Math.max(
    Math.round(
      t.controlHeight -
        t.fontSize * INPUT_LINE_HEIGHT_EM -
        AUTOCOMPLETE_INPUT_PADDING_Y[t.muiSize] * 2 -
        AUTOCOMPLETE_ROOT_PADDING_BOTTOM[t.muiSize],
    ),
    0,
  );

/**
 * Shared sx for the MUI input-like widgets, so the XS/S/M/L/XL scale stays
 * consistent across all of them. Meant to be spread onto the outermost MUI
 * element of a widget (TextField, FormControl, Autocomplete, ...).
 */
export const getSizeSx = (size: unknown, fontScalar = 1) => {
  const t = getSizeTokens(size, fontScalar);
  return {
    fontSize: `${t.fontSize}px`,
    '& .MuiInputBase-root': {
      fontSize: `${t.fontSize}px`,
      minHeight: `${t.controlHeight}px`,
    },
    '& .MuiInputBase-input': {
      fontSize: `${t.fontSize}px`,
    },
    '& .MuiInputLabel-root': {
      fontSize: `${t.fontSize}px`,
    },
    '& .MuiFormHelperText-root': {
      fontSize: `${t.helperFontSize}px`,
    },
    '& .MuiSvgIcon-root': {
      fontSize: `${t.iconSize}px`,
    },
    '& .MuiChip-root': {
      height: `${Math.round(t.controlHeight * 0.43)}px`,
      fontSize: `${t.helperFontSize}px`,
    },
    ...(t.inputPadding && {
      '& .MuiFilledInput-input:not(.MuiAutocomplete-input)': {
        paddingTop: `${t.inputPadding.top}px`,
        paddingBottom: `${t.inputPadding.bottom}px`,
      },
    }),
    '& .MuiAutocomplete-root .MuiFilledInput-root': {
      paddingTop: `${getAutocompleteRootPaddingTop(t)}px`,
    },
  };
};

/**
 * The palette role a control paints itself with. Every option is a MUI palette
 * role name, so the theme reaches these for free - no widget resolves a color
 * of its own.
 *
 * 'primary' is the default and is also MUI's own default for Slider, Checkbox,
 * Radio, Switch, Tabs and input focus, so adding this socket to a widget that
 * did not have one changes nothing until a creator picks something else.
 */
export const getColorSocket = (): Socket =>
  new Socket(
    SOCKET_TYPE.IN,
    colorName,
    new EnumType(colorOptions, undefined, true),
    colorOptions[0].text,
    false,
  );

export const getLabelSocket = (defaultLabel: string): Socket =>
  new Socket(SOCKET_TYPE.IN, labelName, new StringType(), defaultLabel, false);

export const getSizeSocket = (): Socket =>
  new Socket(
    SOCKET_TYPE.IN,
    sizeName,
    new EnumType(sizeOptions, undefined, true),
    defaultSizeSetting,
    false,
  );

export const CANVAS_MARGIN = 4;

export abstract class WidgetHybridBase extends HybridNode2 {
  public getTags(): string[] {
    return ['Widget'].concat(super.getTags());
  }

  // widgets size their content off the node, so a resize has to re-render
  onNodeResize = (newWidth: number, newHeight: number) => {
    this.forceRerender();
  };

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.WIDGET);
  }

  getOpacity(): number {
    return 0.01;
  }

  getRoundedCorners(): boolean {
    return false;
  }

  getWidgetProps(): WidgetProps {
    return { ...defaultProps, heightMode: 'hug' };
  }

  /**
   * Widget nodes are always interactive in canvas mode.
   * @returns true
   */
  public isWidget(): boolean {
    return true;
  }

  // The parts of this widget's own markup that take pointer input on the canvas
  public getCanvasControlSelectors(): string[] {
    return [];
  }
}

interface WidgetPaperProps {
  node: WidgetHybridBase;
  inDashboard?: boolean;
  hasBackground?: boolean;
  children: React.ReactNode;
}

export const WidgetPaper = React.forwardRef<HTMLDivElement, WidgetPaperProps>(
  ({ node, inDashboard = false, hasBackground = true, children }, ref) => {
    return (
      <Paper
        ref={ref}
        elevation={0}
        component={Stack}
        direction="column"
        justifyContent="center"
        sx={{
          bgcolor:
            inDashboard || !hasBackground
              ? 'transparent'
              : 'background.default',
          fontSize: '16px',
          border: 0,
          width: inDashboard
            ? 'auto'
            : `${(node as any).getHybridNodeWidth()}px`,
          height: inDashboard
            ? '100%'
            : `${(node as any).getHybridNodeHeight()}px`,
          padding: inDashboard ? 0 : `${4 * CANVAS_MARGIN}px`,
          ...(inDashboard || node.isCanvasInteractionBlocked()
            ? {}
            : getCanvasGrabThroughSx(node.getCanvasControlSelectors())),
        }}
      >
        {children}
      </Paper>
    );
  },
);
