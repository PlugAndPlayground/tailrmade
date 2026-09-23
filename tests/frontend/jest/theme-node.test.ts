// Keep rendering out of these tests; exercise the real node against the real
// theme store. Same mocking shape as websocket-node.test.ts.
jest.mock('../../../src/classes/NodeClass', () => ({
  __esModule: true,
  default: class {
    id = 'node-1';
    status: unknown = undefined;
    setStatus(status: unknown) {
      this.status = status;
    }
    getTags() {
      return [];
    }
  },
}));
jest.mock('../../../src/classes/SocketClass', () => ({
  __esModule: true,
  default: class {
    constructor(direction, name, type, data) {
      Object.assign(this, { direction, name, type, data });
    }
  },
}));
jest.mock('../../../src/classes/ErrorClass', () => ({
  NodeConfigurationWarning: class {
    message: string;
    constructor(message: string) {
      this.message = message;
    }
  },
  PNPSuccess: class {},
}));
jest.mock('../../../src/nodes/datatypes/arrayType', () => ({
  ArrayType: class {},
}));
jest.mock('../../../src/nodes/datatypes/enumType', () => ({
  EnumType: class {
    constructor(options) {
      Object.assign(this, { options });
    }
  },
}));
jest.mock('../../../src/nodes/datatypes/jsonType', () => ({
  JSONType: class {},
}));
jest.mock('../../../src/utils/color', () => ({
  TRgba: { fromString: () => ({}) },
}));
jest.mock('../../../src/utils/constants', () => ({
  NODE_TYPE_COLOR: {},
  SOCKET_TYPE: { IN: 'in', OUT: 'out' },
}));

import { Theme } from '../../../src/nodes/utility/theme';
import { EMPTY_THEME_DOCUMENT } from '../../../src/utils/theme/document';
import { PRESETS } from '../../../src/utils/theme/presets';
import {
  clearRuntimeThemeLayer,
  getRuntimeThemeLayer,
  getThemeDocument,
  setThemeDocument,
} from '../../../src/utils/theme/store';

const INHERIT = 'Keep app setting';

type Output = Record<string, any>;

const makeNode = (id = 'node-1'): any => {
  const node = new Theme() as any;
  node.id = id;
  return node;
};

const run = async (node: any, input: Record<string, unknown>) => {
  const output: Output = {};
  await node.onExecute(
    { Preset: INHERIT, Mode: INHERIT, Overrides: {}, ...input },
    output,
  );
  return output;
};

afterEach(() => {
  setThemeDocument(EMPTY_THEME_DOCUMENT);
  clearRuntimeThemeLayer();
});

describe('Theme node', () => {
  it('offers every shipped preset, plus the inherit option, on the dropdown', () => {
    const sockets = makeNode().getDefaultIO();
    expect(sockets.map((socket: any) => socket.name)).toEqual([
      'Preset',
      'Mode',
      'Overrides',
      'Theme',
      'Warnings',
    ]);
    const presets = sockets[0].type.options.map((option: any) => option.text);
    expect(presets[0]).toBe(INHERIT);
    // the ids the document stores, so a graph keeps working if we rename a
    // preset's display name
    expect(presets.slice(1)).toEqual(PRESETS.map((preset) => preset.id));
    expect(sockets[0].data).toBe(INHERIT);
    expect(sockets[1].data).toBe(INHERIT);
  });

  it('pushes preset, mode and overrides onto the runtime layer', async () => {
    await run(makeNode(), {
      Preset: 'newsprint',
      Mode: 'light',
      Overrides: { primary: '#ff0055', dark: { divider: '#333333' } },
    });
    expect(getRuntimeThemeLayer()).toEqual({
      presetId: 'newsprint',
      mode: 'light',
      tokens: { primary: '#ff0055' },
      tokensByMode: { dark: { divider: '#333333' } },
    });
  });

  it('pushes nothing at all while both dropdowns inherit and the JSON is empty', async () => {
    await run(makeNode(), {});
    expect(getRuntimeThemeLayer()).toBeUndefined();
  });

  it('leaves the preset alone when only overrides are set', async () => {
    setThemeDocument({ presetId: 'cloud' });
    const output = await run(makeNode(), { Overrides: { radius: 3 } });
    expect(getRuntimeThemeLayer()).toEqual({ tokens: { radius: 3 } });
    expect(output.Theme.presetId).toBe('cloud');
    expect(output.Theme.tokens.radius).toBe(3);
  });

  // the property the whole runtime-layer design rests on: theming an app while
  // it runs must never edit what gets serialized back into the document
  it('never touches the saved document', async () => {
    const saved = { presetId: 'cloud', mode: 'dark' as const };
    setThemeDocument(saved);
    await run(makeNode(), { Preset: 'terminal', Mode: 'light' });
    expect(getThemeDocument()).toEqual(saved);
  });

  it('stops theming once its inputs are emptied again', async () => {
    const node = makeNode();
    await run(node, { Preset: 'terminal' });
    expect(getRuntimeThemeLayer()).toBeDefined();
    await run(node, {});
    expect(getRuntimeThemeLayer()).toBeUndefined();
  });

  it('does not re-push an identical layer, so an equal execute is free', async () => {
    const node = makeNode();
    await run(node, { Preset: 'terminal' });
    const pushed = getRuntimeThemeLayer();
    await run(node, { Preset: 'terminal' });
    expect(getRuntimeThemeLayer()).toBe(pushed);
  });

  it('clears the layer it pushed when the node is removed', async () => {
    const node = makeNode();
    await run(node, { Preset: 'terminal' });
    node.onNodeRemoved();
    expect(getRuntimeThemeLayer()).toBeUndefined();
  });

  it('does not clear a layer another theme node has since pushed', async () => {
    const first = makeNode('first');
    const second = makeNode('second');
    await run(first, { Preset: 'terminal' });
    await run(second, { Preset: 'neon' });
    first.onNodeRemoved();
    expect(getRuntimeThemeLayer()).toEqual({ presetId: 'neon' });
  });

  it('reports bad override keys on the node and on the Warnings output', async () => {
    const node = makeNode();
    const output = await run(node, {
      Overrides: { radius: 8, primry: '#ff0055' },
    });
    expect(getRuntimeThemeLayer()).toEqual({ tokens: { radius: 8 } });
    expect(output.Warnings).toContain('"primry" is not a theme token');
    expect(node.status.message).toContain('"primry" is not a theme token');
  });

  it('outputs the resolved theme, not just what it pushed', async () => {
    const output = await run(makeNode(), { Preset: 'bauhaus', Mode: 'light' });
    expect(output.Theme.presetId).toBe('bauhaus');
    expect(output.Theme.mode).toBe('light');
    expect(output.Theme.tokens.fontFamily).toEqual(expect.any(String));
  });
});
