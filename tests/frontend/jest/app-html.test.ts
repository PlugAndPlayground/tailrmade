import {
  findExternalAddresses,
  getEmbeddableAddress,
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

it('embeds only web addresses, written back out in escaped form', () => {
  expect(getEmbeddableAddress(' https://example.com/a?b=1&c=2 ')).toBe(
    'https://example.com/a?b=1&amp;c=2',
  );
  expect(getEmbeddableAddress('https://example.com/"><b>x')).toBe(
    'https://example.com/%22%3E%3Cb%3Ex',
  );
  expect(getEmbeddableAddress('ftp://example.com/file')).toBeUndefined();
  expect(getEmbeddableAddress('data://example.com/x')).toBeUndefined();
  expect(getEmbeddableAddress('just some text')).toBeUndefined();
});
