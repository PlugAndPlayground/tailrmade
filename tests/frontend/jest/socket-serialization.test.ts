import { serializeSocketData } from '../../../src/utils/serializeSocketData';

const makeSocket = (data: any) => ({
  name: 'Data',
  data,
  dataType: { prepareDataForSaving: (value: any) => value },
});

describe('socket data snapshots', () => {
  let warning: jest.SpyInstance;

  beforeEach(() => {
    warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => warning.mockRestore());

  it('isolates an undo snapshot from later edits to valid table data', () => {
    const socket = makeSocket([{ name: 'First', values: [1, 2] }]);
    const snapshot = serializeSocketData(socket);
    socket.data[0].values.push(3);
    expect(snapshot).toEqual([{ name: 'First', values: [1, 2] }]);
    expect(warning).not.toHaveBeenCalled();
  });

  it.each([
    Promise.resolve([]),
    [{ value: Promise.resolve('pending') }],
    [{ value: () => 'runtime function' }],
  ])('omits uncloneable data without blocking the other sockets', (data) => {
    const invalid = makeSocket(data);
    const valid = makeSocket({ width: 100 });
    expect([invalid, valid].map(serializeSocketData)).toEqual([
      undefined,
      { width: 100 },
    ]);
    expect(invalid.data).toBe(data);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it('uses the data type conversion before cloning runtime values', () => {
    const socket = makeSocket(Promise.resolve([]));
    socket.dataType.prepareDataForSaving = () => ['saved representation'];
    expect(serializeSocketData(socket)).toEqual(['saved representation']);
    expect(warning).not.toHaveBeenCalled();
  });

  it('also tolerates a data type that cannot prepare malformed data', () => {
    const socket = makeSocket(null);
    socket.dataType.prepareDataForSaving = () => {
      throw new TypeError('Invalid data');
    };
    expect(serializeSocketData(socket)).toBeUndefined();
    expect(warning).toHaveBeenCalledTimes(1);
  });
});
