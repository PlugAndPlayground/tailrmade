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

  // theming an app while it runs must never edit what gets saved
  it('never touches the saved document', async () => {
    const saved = { presetId: 'cloud', mode: 'dark' as const };
    setThemeDocument(saved);
    await run(makeNode(), { Preset: 'terminal', Mode: 'light' });
    expect(getThemeDocument()).toEqual(saved);
  });

  it('stops theming once its inputs are emptied again', async () => {
    const node = makeNode();
    await run(node, { Preset: 'terminal' });
    await run(node, {});
    expect(getRuntimeThemeLayer()).toBeUndefined();
  });

  it('on removal clears only a layer it pushed itself', async () => {
    const first = makeNode('first');
    const second = makeNode('second');
    await run(first, { Preset: 'terminal' });
    await run(second, { Preset: 'neon' });
    first.onNodeRemoved();
    expect(getRuntimeThemeLayer()).toEqual({ presetId: 'neon' });
    second.onNodeRemoved();
    expect(getRuntimeThemeLayer()).toBeUndefined();
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
});
