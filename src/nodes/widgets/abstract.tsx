import * as React from 'react';
import { Paper, Stack } from '@mui/material';
import HybridNode2 from '../../classes/HybridNode2';
import Socket from '../../classes/SocketClass';
import {
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
  UNSET_VALUE,
} from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { WidgetProps } from '../../utils/interfaces';
import { BackPropagation } from '../../interfaces';
import { EnumStructure, EnumType } from '../datatypes/enumType';
import { StringType } from '../datatypes/stringType';
import { NumberType } from '../datatypes/numberType';
import { Density, useResolvedDensity, useThemeTokens } from '../../utils/theme';
import { getCanvasGrabThroughSx } from '../../utils/nodeInteractivity';

export {
  getWidgetControlProps,
  getWidgetDragControlProps,
} from '../../utils/nodeInteractivity';

export const defaultProps: WidgetProps = {
  background: { r: 9, g: 13, b: 26, a: 0 },
  width: '100%',
  height: 'auto',
  minWidth: '48px',
  minHeight: UNSET_VALUE,
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
    controlHeight: 28,
    tabHeight: 28,
    inputPadding: { top: 12, bottom: 4 },
  },
  S: {
    muiSize: 'small',
    scale: 0.875,
    fontSize: 14,
    helperFontSize: 11,
    iconSize: 20,
    controlHeight: 40,
    tabHeight: 36,
    inputPadding: { top: 17, bottom: 3 },
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

/**
 * When the value a viewer is editing reaches the graph.
 *
 * Every widget used to push every intermediate value: one undoable action and
 * one `executeOptimizedChain()` per keystroke or per drag step. That is the
 * right thing for a slider driving a live preview and the wrong thing for a
 * text field feeding an expensive chain, so the widgets that are edited rather
 * than clicked carry a Commit socket. The immediate modes are the defaults, so
 * a graph that never touches this socket behaves exactly as it did.
 */
export const commitModeName = 'Commit';
export const commitDelayName = 'Commit Delay';

export const COMMIT_WHILE_TYPING = 'While typing';
export const COMMIT_ON_ENTER_OR_BLUR = 'On enter or blur';
export const COMMIT_AFTER_TYPING_STOPS = 'After typing stops';
export const COMMIT_WHILE_DRAGGING = 'While dragging';
export const COMMIT_ON_RELEASE = 'On release';

export const typingCommitOptions: EnumStructure = [
  { text: COMMIT_WHILE_TYPING },
  { text: COMMIT_ON_ENTER_OR_BLUR },
  { text: COMMIT_AFTER_TYPING_STOPS },
];

// a search box wants its text live - the only thing worth deferring there is
// how often the text reaches the graph, never whether a keystroke shows up
export const searchCommitOptions: EnumStructure = [
  { text: COMMIT_WHILE_TYPING },
  { text: COMMIT_AFTER_TYPING_STOPS },
];

export const draggingCommitOptions: EnumStructure = [
  { text: COMMIT_WHILE_DRAGGING },
  { text: COMMIT_ON_RELEASE },
];

export const defaultCommitDelay = 400;

/**
 * True for the modes that push every intermediate value. Written as "not one of
 * the deferred modes" on purpose: a socket that is missing, left at a legacy
 * value or linked to something unexpected then keeps the old behaviour.
 */
export const commitsImmediately = (mode: unknown): boolean =>
  mode !== COMMIT_ON_ENTER_OR_BLUR &&
  mode !== COMMIT_AFTER_TYPING_STOPS &&
  mode !== COMMIT_ON_RELEASE;

export const getCommitModeSocket = (
  options: EnumStructure = typingCommitOptions,
  visibilityCondition?: () => boolean,
): Socket => {
  const socket = new Socket(
    SOCKET_TYPE.IN,
    commitModeName,
    new EnumType(options, undefined, true),
    options[0].text,
    false,
  );
  if (visibilityCondition) {
    socket.visibilityCondition = visibilityCondition;
  }
  return socket;
};

/** Only read in COMMIT_AFTER_TYPING_STOPS, so it stays out of the way elsewhere. */
export const getCommitDelaySocket = (node: {
  getInputData: (name: string) => any;
}): Socket =>
  Socket.getOptionalVisibilitySocket(
    SOCKET_TYPE.IN,
    commitDelayName,
    new NumberType(true, 0, 5000),
    defaultCommitDelay,
    () => node.getInputData(commitModeName) === COMMIT_AFTER_TYPING_STOPS,
  );

export interface CommitModeOptions {
  /** the Commit socket's value */
  mode: unknown;
  /** the Commit Delay socket's value in ms; only read in COMMIT_AFTER_TYPING_STOPS */
  delay?: number;
  /** false where a bare Enter belongs to the control, e.g. a multiline field */
  commitOnEnter?: boolean;
}

export interface CommitModeHandle<T> {
  /** what the control shows: the draft, which the graph only writes to between edits */
  value: T;
  /** the control changed; commits straight away in the immediate modes */
  edit: (next: T) => void;
  /** push a pending edit now, without leaving the edit (Enter) */
  commit: () => void;
  /** throw a pending edit away and show the graph's value again (Escape) */
  revert: () => void;
  beginEditing: () => void;
  /** leave the edit and push whatever is pending (blur, pointer release) */
  endEditing: () => void;
  /** Enter commits, Escape reverts; does nothing in the immediate modes */
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * Holds the value a viewer is editing until the widget's Commit socket says to
 * push it into the graph.
 *
 * While an edit is open the draft is the single source of truth for the
 * control, so an execution of the graph cannot overwrite half-typed input; once
 * the edit ends the graph owns the value again. A widget that has no draft of
 * its own to show (the number field keeps its own, the autocomplete's text
 * belongs to MUI) can ignore `value` and use the rest.
 */
export function useCommitMode<T>(
  committedValue: T,
  commitValue: (value: T) => void,
  { mode, delay = defaultCommitDelay, commitOnEnter = true }: CommitModeOptions,
): CommitModeHandle<T> {
  const immediate = commitsImmediately(mode);
  const [draft, setDraft] = React.useState<T>(committedValue);
  const [isEditing, setIsEditing] = React.useState(false);
  const draftRef = React.useRef<T>(committedValue);
  // set by a deferred edit and cleared by a commit, so leaving a field nobody
  // touched does not add an undo step or execute the chain
  const isDirty = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // the widgets rebuild their callbacks on every render; the pending timeout has
  // to reach the current one
  const commitRef = React.useRef(commitValue);
  commitRef.current = commitValue;

  const cancelTimer = () => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  };

  React.useEffect(() => cancelTimer, []);

  React.useEffect(() => {
    if (!isEditing) {
      draftRef.current = committedValue;
      setDraft(committedValue);
    }
  }, [committedValue, isEditing]);

  const commit = () => {
    cancelTimer();
    if (isDirty.current) {
      isDirty.current = false;
      commitRef.current(draftRef.current);
    }
  };

  const edit = (next: T) => {
    draftRef.current = next;
    setDraft(next);
    if (immediate) {
      commitRef.current(next);
      return;
    }
    isDirty.current = true;
    setIsEditing(true);
    if (mode === COMMIT_AFTER_TYPING_STOPS) {
      cancelTimer();
      timer.current = setTimeout(commit, Math.max(0, delay));
    }
  };

  const revert = () => {
    cancelTimer();
    isDirty.current = false;
    draftRef.current = committedValue;
    setDraft(committedValue);
  };

  return {
    value: draft,
    edit,
    commit,
    revert,
    beginEditing: () => setIsEditing(true),
    endEditing: () => {
      setIsEditing(false);
      commit();
    },
    handleKeyDown: (event: React.KeyboardEvent) => {
      if (immediate) {
        return;
      }
      if (event.key === 'Escape') {
        revert();
      } else if (
        event.key === 'Enter' &&
        (commitOnEnter || event.metaKey || event.ctrlKey)
      ) {
        commit();
      }
    },
  };
}

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
    // heightMode is the legacy field; migrateLegacyWidgetProps turns it into height
    return { ...defaultProps, heightMode: 'hug' } as WidgetProps;
  }

  /**
   * Widget nodes are always interactive in canvas mode.
   * @returns true
   */
  public isWidget(): boolean {
    return true;
  }
}

export abstract class WidgetSelectionBase extends WidgetHybridBase {
  protected abstract getOptionsSocketName(): string;
  protected abstract getSelectedIndexSocketName(): string;

  protected getBackPropagationTargets(): BackPropagation {
    return {
      SocketToGetValue: this.getInputSocketByName(
        this.getSelectedIndexSocketName(),
      ),
      SocketToGetOptions: this.getInputSocketByName(
        this.getOptionsSocketName(),
      ),
      SocketToTakeName: this.getInputSocketByName(labelName),
    };
  }

  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    await super.onExecute(inputObject, outputObject);

    const options = inputObject[this.getOptionsSocketName()];
    const selectedIndex = Math.max(
      0,
      Math.min(
        options.length - 1,
        inputObject[this.getSelectedIndexSocketName()],
      ),
    );

    this.setOutputData(outName, options[selectedIndex]);
    this.setOutputData(outIndexName, selectedIndex);
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
        sx={{
          justifyContent: 'center',
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
            : getCanvasGrabThroughSx()),
        }}
      >
        {children}
      </Paper>
    );
  },
);
