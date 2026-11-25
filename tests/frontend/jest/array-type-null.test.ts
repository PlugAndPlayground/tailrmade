import { ArrayType } from '../../../src/nodes/datatypes/arrayType';

jest.mock('../../../src/widgets', () => ({ ArrayWidget: () => null }));

describe('list socket parsing', () => {
  const type = new ArrayType();

  it.each([null, undefined, 'null'])('reads %p as an empty list', (input) => {
    expect(type.parse(input)).toEqual({ value: [], warnings: [] });
  });

  it('still wraps a single value into a list', () => {
    expect(type.parse(5).value).toEqual([5]);
  });

  it('accepts null without a compatibility warning', () => {
    expect(type.parse(null).warnings).toHaveLength(0);
  });
});
