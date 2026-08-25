import * as React from 'react';
import { Paper, Stack } from '@mui/material';
import HybridNode2 from '../../classes/HybridNode2';
import Socket from '../../classes/SocketClass';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { WidgetProps } from '../../utils/interfaces';
import { EnumStructure, EnumType } from '../datatypes/enumType';
import { Density, useResolvedDensity } from '../../utils/theme';

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

type SizeTokens = {
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

export const getSizeTokens = (size: unknown): SizeTokens =>
  sizeTokens[size as WidgetSize] ?? sizeTokens[defaultSize];

export const getMuiSize = (size: unknown): 'small' | 'medium' =>
  getSizeTokens(size).muiSize;

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
export const getSizeSx = (size: unknown) => {
  const t = getSizeTokens(size);
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
}

interface WidgetPaperProps {
  node: HybridNode2;
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
        }}
      >
        {children}
      </Paper>
    );
  },
);
