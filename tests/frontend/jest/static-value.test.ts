import {
  resolveStaticInput,
  UNKNOWN_STATIC_VALUE,
} from '../../../src/classes/StaticValue';

it('propagates parsing errors instead of classifying broken inputs as dynamic', () => {
  const error = new Error('Invalid input value');
  const socket = {
    links: [
      {
        getSource: () => ({
          name: 'Out',
          getNode: () => ({
            getStaticOutputData: () => ({ known: true, value: 42 }),
          }),
        }),
      },
    ],
    dataType: {
      parse: () => {
        throw error;
      },
    },
  } as any;
  expect(() => resolveStaticInput(socket)).toThrow(error);
});

it('keeps unsupported upstream computations unknown without reading cached data', () => {
  const socket = {
    links: [
      {
        getSource: () => ({
          name: 'Out',
          getNode: () => ({ getStaticOutputData: () => UNKNOWN_STATIC_VALUE }),
        }),
      },
    ],
    get data() {
      throw new Error('Cached data must not be read');
    },
  } as any;
  expect(resolveStaticInput(socket)).toEqual({
    known: false,
    value: undefined,
  });
});

it.each([null, undefined])('preserves a known %s input value', (value) => {
  expect(resolveStaticInput({ links: [], data: value } as any)).toEqual({
    known: true,
    value,
  });
});

it.each([null, undefined])('throws for a missing socket: %s', (socket) => {
  expect(() => resolveStaticInput(socket as any)).toThrow(TypeError);
});

it.each([null, undefined])(
  'throws for a broken upstream result: %s',
  (result) => {
    const socket = {
      links: [
        {
          getSource: () => ({
            name: 'Out',
            getNode: () => ({ getStaticOutputData: () => result }),
          }),
        },
      ],
    } as any;
    expect(() => resolveStaticInput(socket)).toThrow(TypeError);
  },
);

it('represents a cycle as an unknown value', () => {
  const socket = {} as any;
  expect(resolveStaticInput(socket, new Set([socket]))).toEqual({
    known: false,
    value: undefined,
  });
});
