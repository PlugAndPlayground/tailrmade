import { isCssValue, sanitizeCustomStyles } from '../../../src/utils/cssValue';

it('accepts plain values only', () => {
  expect(isCssValue('rgba(1, 2, 3, 0.5)')).toBe(true);
  expect(isCssValue('1px solid #fff')).toBe(true);
  expect(isCssValue('red; color: blue')).toBe(false);
  expect(isCssValue('url(https://example.com/a.png)')).toBe(false);
  expect(isCssValue('')).toBe(false);
});

it('keeps properties, responsive blocks, own states and inner elements', () => {
  const styles = {
    padding: '0 16px',
    opacity: 0.5,
    '--tm-gap': '4px',
    backgroundImage: 'url("data:image/png;base64,AAAA")',
    '@media (max-width: 600px)': { padding: '0 8px' },
    '&:hover': { opacity: 1 },
    position: 'sticky',
    backgroundSize: 'cover',
    background: "url('/assets/landingPage/DragDrop.jpg') center",
    '& [id^="slider-label-"]': { display: 'none' },
    '&:hover > .row img:first-child': { opacity: 1 },
  };
  expect(sanitizeCustomStyles(styles)).toEqual(styles);
});

it('drops selectors, remote addresses and positioning outside the box', () => {
  expect(
    sanitizeCustomStyles({
      color: 'red',
      position: 'fixed',
      backgroundImage: 'url(https://example.com/a.png)',
      border: '1px solid red; inset: 0',
      'body &': { display: 'none' },
      listStyle: 'url(//example.com/a.png)',
      cursor: 'url(/\\example.com/a.png), auto',
      maskImage: 'url(/a.png), url(https://example.com/b.png)',
      '& img, body': { display: 'none' },
      '& + div': { display: 'none' },
      '& [title="]"] ~ *': { display: 'none' },
      '& > img': { position: 'fixed', content: 'url(https://example.com)' },
      '& ~ *': { display: 'none' },
      '.dialog': { display: 'none' },
      '@media (max-width: 600px)': { '* &': { color: 'blue' }, gap: '2px' },
    }),
  ).toEqual({
    color: 'red',
    '& > img': {},
    '@media (max-width: 600px)': { gap: '2px' },
  });
  expect(sanitizeCustomStyles('nope')).toEqual({});
});
