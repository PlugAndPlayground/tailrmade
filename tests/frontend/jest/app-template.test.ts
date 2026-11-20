import {
  CANNOT_REVIEW,
  expandTemplate,
  expandTemplateForReview,
} from '../../../src/utils/appTemplate';

it('expands a template with its data, helpers and own partials', () => {
  expect(
    expandTemplate(
      '<img src="{{scheme}}://{{host}}/a.png">{{#if (eq n 1)}}{{> row}}{{/if}}',
      { scheme: 'https', host: 'example.com', n: 1, label: '<b>x</b>' },
      { row: '<p>{{label}}</p>' },
    ),
  ).toBe('<img src="https://example.com/a.png"><p><b>x</b></p>');
});

it('does not keep partials between renders', () => {
  expandTemplate('{{> row}}', {}, { row: 'one' });
  expect(() => expandTemplate('{{> row}}', {})).toThrow();
});

it('reviews what will be rendered', () => {
  expect(expandTemplateForReview('{{a}}{{b}}', { a: 'ht', b: 'tps:' })).toBe(
    'https:',
  );
  // rendered as written when it does not compile
  expect(expandTemplateForReview('{{#if}', {})).toBe('{{#if}');
  expect(expandTemplateForReview('{{macro "fetch"}}', {})).toBe(CANNOT_REVIEW);
  expect(
    expandTemplateForReview('{{> row}}', {}, { row: '{{macro "x"}}' }),
  ).toBe(CANNOT_REVIEW);
});
