import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { NodeConfigurationWarning, PNPSuccess } from '../../classes/ErrorClass';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { ArrayType } from '../datatypes/arrayType';
import { EnumType } from '../datatypes/enumType';
import { JSONType } from '../datatypes/jsonType';
import {
  clearRuntimeThemeLayer,
  getRuntimeThemeLayer,
  parseThemeOverrides,
  PRESETS,
  resolveAppThemeNow,
  setRuntimeThemeLayer,
  ThemeLayer,
  ThemeModeSetting,
} from '../../utils/theme';

const PRESET_SOCKET = 'Preset';
const MODE_SOCKET = 'Mode';
const OVERRIDES_SOCKET = 'Overrides';
const THEME_OUTPUT = 'Theme';
const WARNINGS_OUTPUT = 'Warnings';

const INHERIT = 'Keep app setting';

const PRESET_OPTIONS = [{ text: INHERIT }].concat(
  PRESETS.map((preset) => ({ text: preset.id })),
);

const MODE_OPTIONS = [
  { text: INHERIT },
  { text: 'light' },
  { text: 'dark' },
  { text: 'system' },
];

// Only one node can hold the runtime layer - it is a single slot, and the last
// node to execute wins. Remembering who filled it is what lets a node clean up
// after itself on removal without wiping a layer a different node has since
// pushed.
let runtimeLayerOwnerId: string | undefined = undefined;

const releaseRuntimeLayer = (nodeId: string): void => {
  if (runtimeLayerOwnerId !== nodeId) {
    return;
  }
  runtimeLayerOwnerId = undefined;
  clearRuntimeThemeLayer();
};

const isSameLayer = (
  a: Partial<ThemeLayer> | undefined,
  b: Partial<ThemeLayer> | undefined,
): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export class Theme extends PPNode {
  public getName(): string {
    return 'Theme';
  }

  public getDescription(): string {
    return 'Switch the app theme at runtime, by preset or by overriding single values.';
  }

  public getDocs(): string {
    return `Pushes a theme on top of the one saved in the App tab, for the
current session only. A reload returns to the saved theme - this node styles an
app while it runs, it does not edit the app's stored theme.

"${PRESET_SOCKET}" and "${MODE_SOCKET}" are dropdowns; both default to
"${INHERIT}", which leaves that part of the app theme alone.

"${OVERRIDES_SOCKET}" is a JSON object of single token values layered on top of
the preset. Token names are the keys - there is no wrapper object:

{
  "primary": "#ff0055",
  "radius": 12,
  "density": "S",
  "byMode": {
    "dark": { "background.paper": "#121212" },
    "light": { "background.paper": "#ffffff" }
  }
}

Top-level tokens apply in both modes. Colors under "byMode" (or under
top-level "light"/"dark", which mean the same thing) apply in that mode only -
use those for anything that should still react to the light/dark toggle, since
a color pinned at the top level makes the toggle a no-op for that role.

Colors: primary, secondary, background.default, background.paper,
text.primary, text.secondary, divider, error, warning, info, success.
Shape: fontFamily, fontFamilyMono, fontSizeScalar, radius, density (XS|S|M|L|XL),
spacingUnit, buttonVariant (contained|outlined|text), inputVariant
(outlined|filled|standard).

Keys that are not tokens, and values of the wrong type, are dropped and
reported on "${WARNINGS_OUTPUT}" and on the node - they are never applied.

The node applies whenever it executes, so wiring a widget into
"${PRESET_SOCKET}" gives an app a working theme switcher. With several theme
nodes in a graph, the last one to execute wins.`;
  }

  public getTags(): string[] {
    return ['App'].concat(super.getTags());
  }

  public getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.SYSTEM);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        PRESET_SOCKET,
        new EnumType(PRESET_OPTIONS),
        INHERIT,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        MODE_SOCKET,
        new EnumType(MODE_OPTIONS),
        INHERIT,
      ),
      new Socket(SOCKET_TYPE.IN, OVERRIDES_SOCKET, new JSONType(), {}),
      new Socket(SOCKET_TYPE.OUT, THEME_OUTPUT, new JSONType()),
      new Socket(SOCKET_TYPE.OUT, WARNINGS_OUTPUT, new ArrayType()),
    ];
  }

  protected async onExecute(input, output): Promise<void> {
    const preset = String(input[PRESET_SOCKET] ?? INHERIT);
    const mode = String(input[MODE_SOCKET] ?? INHERIT);
    const { tokens, tokensByMode, rejected } = parseThemeOverrides(
      input[OVERRIDES_SOCKET],
    );

    const layer: Partial<ThemeLayer> = {};
    if (preset !== INHERIT && preset !== '') {
      layer.presetId = preset;
    }
    if (mode !== INHERIT && mode !== '') {
      layer.mode = mode as ThemeModeSetting;
    }
    if (tokens) {
      layer.tokens = tokens;
    }
    if (tokensByMode) {
      layer.tokensByMode = tokensByMode;
    }

    const hasLayer = Object.keys(layer).length > 0;
    if (hasLayer) {
      runtimeLayerOwnerId = this.id;
      // the store notifies on identity, and this node executes on every input
      // change and on load - pushing an equal layer would repaint the whole
      // interface for nothing
      if (!isSameLayer(getRuntimeThemeLayer(), layer)) {
        setRuntimeThemeLayer(layer);
      }
    } else {
      // an emptied node stops theming rather than leaving its last push in
      // force, which would make clearing the JSON look broken
      releaseRuntimeLayer(this.id);
    }

    const resolved = resolveAppThemeNow();
    output[THEME_OUTPUT] = {
      presetId: resolved.presetId,
      mode: resolved.mode,
      followsSystem: resolved.followsSystem,
      tokens: resolved.tokens,
    };
    output[WARNINGS_OUTPUT] = rejected.concat(
      resolved.warnings.map((warning) => warning.message),
    );

    if (rejected.length > 0) {
      this.setStatus(
        new NodeConfigurationWarning(
          `${rejected.length} override${
            rejected.length === 1 ? ' was' : 's were'
          } ignored:\n${rejected.join('\n')}`,
        ),
      );
    } else {
      this.setStatus(new PNPSuccess());
    }
  }

  public onNodeRemoved = (): void => {
    releaseRuntimeLayer(this.id);
  };
}
