import { isCSV } from '../../../src/utils/dataParser';

describe('isCSV', () => {
  it('detects comma separated rows', () => {
    expect(isCSV('name,age,city\nAnna,32,Vienna\nBen,41,Graz')).toBe(true);
  });

  it('detects tab separated rows copied from a spreadsheet', () => {
    expect(isCSV('id\tvalue\n1\t10\n2\t20')).toBe(true);
  });

  it('rejects clipboard HTML with semicolons in style attributes', () => {
    const html =
      '<meta charset="utf-8"><div style="color: red; font-size: 12px;">Can you check the HTML renderers.</div>\n' +
      '<div style="margin: 0;">Selected node IDs at send time: fat-lionfish-93, pink-treefrog-82</div>\n' +
      '<div>21:52:21</div>';
    expect(isCSV(html)).toBe(false);
  });

  it('rejects prose with a comma in the first line', () => {
    const text =
      'Can you check the HTML renderers. They all have different issues with a mobile width I think. How can they be optimized and less squeezed?\n\n' +
      'Selected node IDs at send time: fat-lionfish-93, pink-treefrog-82, tasty-goose-20, odd-mule-72, good-rabbit-19, friendly-grasshopper-99\n\n' +
      '21:52:21';
    expect(isCSV(text)).toBe(false);
  });

  it('rejects single lines and non-strings', () => {
    expect(isCSV('a,b,c')).toBe(false);
    expect(isCSV(undefined)).toBe(false);
  });
});
