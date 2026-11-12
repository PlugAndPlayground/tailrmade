import {
  findExternalAddresses,
  restoreHandlebarsPartials,
} from '../../../src/utils/appHtml';

it('restores partial calls without decoding markup', () => {
  expect(restoreHandlebarsPartials('<p>{{&gt; row}}</p>')).toBe(
    '<p>{{> row}}</p>',
  );
  expect(restoreHandlebarsPartials('{{&lt;b&gt;}} &gt;')).toBe(
    '{{&lt;b>}} &gt;',
  );
});

it('lists addresses on other sites and skips the app itself', () => {
  const base = 'https://app.example.com/editor';
  expect(
    findExternalAddresses(
      '<a href="https://docs.example.org/a">a</a> <img src="/local.png"> //cdn.example.net/x.png',
      base,
    ).sort(),
  ).toEqual(['https://cdn.example.net/x.png', 'https://docs.example.org/a']);
});
