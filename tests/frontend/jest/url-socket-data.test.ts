import {
  getURLSocketDataRefusalMessage,
  parseURLSocketData,
  partitionURLSocketData,
  previewURLSocketValue,
} from '../../../src/utils/urlSocketData';

const socket = (name: string, typeName = 'String') => ({
  name,
  dataType: { getName: () => typeName },
});

describe('parseURLSocketData', () => {
  it('accepts an array of entries', () => {
    const raw = JSON.stringify([{ node: 'a', socket: 'Input', data: 1 }]);
    expect(parseURLSocketData(raw)).toEqual([
      { node: 'a', socket: 'Input', data: 1 },
    ]);
  });

  it('accepts a single copied socket reference', () => {
    const raw = JSON.stringify({ node: 'a', socket: 'Input', data: '' });
    expect(parseURLSocketData(raw)).toEqual([
      { node: 'a', socket: 'Input', data: '' },
    ]);
  });

  it.each(['not json', '[1, 2]', '[{"node": "a"}]', 'null'])(
    'rejects %s',
    (raw) => {
      expect(parseURLSocketData(raw)).toBeUndefined();
    },
  );
});

describe('partitionURLSocketData', () => {
  const sockets = {
    'code/Code': socket('Code', 'Code'),
    'html/Html': socket('Html', 'Html'),
    'fn/Main Thread': socket('Main Thread', 'Boolean'),
    'http/URL': socket('URL'),
    'http/Headers': socket('Headers', 'JSON'),
    'npm/Package Name': socket('Package Name'),
    'store/Location': socket('Location'),
    'text/Input': socket('Input'),
  };
  const partition = (keys: string[]) =>
    partitionURLSocketData(
      keys.map((key) => {
        const [node, socketName] = key.split('/');
        return { node, socket: socketName, data: 'x' };
      }),
      (entry) => sockets[`${entry.node}/${entry.socket}`],
    );

  it('allows plain data sockets', () => {
    const { allowed, refusals } = partition(['text/Input']);
    expect(allowed.map(({ socket }) => socket.name)).toEqual(['Input']);
    expect(refusals).toEqual([]);
  });

  it('refuses code and HTML sockets as code', () => {
    expect(partition(['code/Code', 'html/Html']).refusals).toEqual([
      'code',
      'code',
    ]);
  });

  it.each([
    'fn/Main Thread',
    'http/URL',
    'http/Headers',
    'npm/Package Name',
    'store/Location',
  ])('refuses %s as protected', (key) => {
    const { allowed, refusals } = partition([key]);
    expect(allowed).toEqual([]);
    expect(refusals).toEqual(['protected']);
  });

  it('skips sockets that do not exist', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { allowed, refusals } = partition(['gone/Input', 'text/Input']);
    expect(allowed).toHaveLength(1);
    expect(refusals).toEqual([]);
    warn.mockRestore();
  });
});

describe('getURLSocketDataRefusalMessage', () => {
  it('names code when any refusal was code', () => {
    expect(getURLSocketDataRefusalMessage(['protected', 'code'], 'Demo')).toBe(
      "This link tried to change code in Demo. Links can't do that, so it opened unchanged.",
    );
  });

  it('names a protected setting otherwise', () => {
    expect(getURLSocketDataRefusalMessage(['protected'], 'Demo')).toBe(
      "This link tried to change a protected setting in Demo. Links can't do that, so it opened unchanged.",
    );
  });
});

describe('previewURLSocketValue', () => {
  it('shows strings as-is and serialises everything else', () => {
    expect(previewURLSocketValue('hello')).toBe('hello');
    expect(previewURLSocketValue({ a: 1 })).toBe('{"a":1}');
    expect(previewURLSocketValue(undefined)).toBe('undefined');
  });

  it('truncates long values', () => {
    const preview = previewURLSocketValue('x'.repeat(500));
    expect(preview).toHaveLength(121);
    expect(preview.endsWith('…')).toBe(true);
  });
});
