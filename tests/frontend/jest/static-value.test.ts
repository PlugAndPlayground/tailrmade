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

const linked = (data: unknown, predicted: unknown) =>
  ({
    data,
    links: [
      {
        getSource: () => ({
          name: 'Out',
          getNode: () => ({
            getStaticOutputData: () => ({ known: true, value: predicted }),
          }),
        }),
      },
    ],
    dataType: { parse: (value: unknown) => ({ value: Boolean(value) }) },
  }) as any;

it('knows a linked input once the source has delivered the predicted value', () => {
  expect(resolveStaticInput(linked(true, 1))).toEqual({
    known: true,
    value: true,
  });
});

it('keeps a linked input unknown while its data differs from the prediction', () => {
  // A source that never runs leaves the input on whatever it held before.
  expect(resolveStaticInput(linked(false, true))).toEqual(UNKNOWN_STATIC_VALUE);
});
