import { resolveCustomStylesForPreviewWidth } from '../../../src/components/dashboard/viewState';

describe('resolveCustomStylesForPreviewWidth', () => {
  const customStyles = {
    color: 'red',
    '@media (min-width: 601px) and (max-width: 900px)': {
      padding: '0px 16px',
      width: '90%',
    },
    '@media (max-width: 600px)': {
      padding: '0px 8px',
      width: '100%',
    },
    '@media (orientation: landscape)': {
      gap: '4px',
    },
  };

  it('passes styles through unchanged without a preview width', () => {
    expect(resolveCustomStylesForPreviewWidth(customStyles, null)).toBe(
      customStyles,
    );
  });

  it('flattens the matching width block at a mobile preview width', () => {
    const resolved = resolveCustomStylesForPreviewWidth(customStyles, 390);
    expect(resolved.color).toBe('red');
    expect(resolved.padding).toBe('0px 8px');
    expect(resolved.width).toBe('100%');
    // tablet-range block was dropped
    expect(
      resolved['@media (min-width: 601px) and (max-width: 900px)'],
    ).toBeUndefined();
  });

  it('flattens the combined min/max block at a tablet preview width', () => {
    const resolved = resolveCustomStylesForPreviewWidth(customStyles, 820);
    expect(resolved.padding).toBe('0px 16px');
    expect(resolved.width).toBe('90%');
    expect(resolved['@media (max-width: 600px)']).toBeUndefined();
  });

  it('drops non-matching width blocks at a wide preview width', () => {
    const resolved = resolveCustomStylesForPreviewWidth(customStyles, 1400);
    expect(resolved.padding).toBeUndefined();
    expect(resolved.width).toBeUndefined();
    expect(resolved.color).toBe('red');
  });

  it('leaves unrecognized media conditions to the browser', () => {
    const resolved = resolveCustomStylesForPreviewWidth(customStyles, 390);
    expect(resolved['@media (orientation: landscape)']).toEqual({
      gap: '4px',
    });
  });
});
