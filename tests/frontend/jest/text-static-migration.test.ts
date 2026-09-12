import {
  migrateLegacyStaticTextProps,
  migrateStaticTextItemsInTree,
} from '../../../src/text/migrations';
import {
  normalizeTextProps,
  resolveTextElementStyle,
} from '../../../src/text/model';

const legacyProps = {
  text: 'Hello world\nnext',
  fontSize: 24,
  fontWeight: '700',
  textAlign: 'center',
  color: { r: 10, g: 20, b: 30, a: 1 },
};

describe('legacy static Text props', () => {
  it('moves every legacy style into custom styles', () => {
    const migrated = migrateLegacyStaticTextProps(legacyProps);
    expect(migrated).toMatchObject({
      variant: 'body',
      tone: 'default',
      alignment: 'center',
      customStyles: {
        fontSize: '24px',
        fontWeight: '700',
        lineHeight: 1.2,
        color: 'rgb(10, 20, 30)',
      },
    });
    expect(migrated).not.toHaveProperty('text');
    expect(migrated).not.toHaveProperty('fontSize');
    expect(migrated.content).toBe('Hello world\nnext');
  });

  it('renders the same computed style the old widget used', () => {
    const style = resolveTextElementStyle(
      normalizeTextProps(migrateLegacyStaticTextProps(legacyProps)),
    );
    expect(style).toMatchObject({
      fontSize: '24px',
      fontWeight: '700',
      lineHeight: 1.2,
      textAlign: 'center',
      color: 'rgb(10, 20, 30)',
    });
  });

  it('keeps theme-inherited color and the old fallbacks', () => {
    const migrated = migrateLegacyStaticTextProps({
      text: 'Hi',
      fontSize: 'big',
      fontWeight: undefined,
      textAlign: 'middle',
      color: 'inherit',
    });
    expect(migrated.alignment).toBe('left');
    expect(migrated.customStyles).toEqual({
      fontSize: '20px',
      fontWeight: 'normal',
      lineHeight: 1.2,
      color: 'inherit',
    });
    expect(resolveTextElementStyle(normalizeTextProps(migrated)).color).toBe(
      'inherit',
    );
  });

  it('keeps custom styles the item already had on top', () => {
    expect(
      migrateLegacyStaticTextProps({
        ...legacyProps,
        customStyles: { color: 'red' },
      }).customStyles.color,
    ).toBe('red');
  });

  it('keeps legacy markup as literal text, escaped for Markdown', () => {
    expect(
      migrateLegacyStaticTextProps({ text: 'a <b>b</b> *c*' }).content,
    ).toBe('a <b>b</b> \\*c\\*');
  });
});

describe('migrateStaticTextItemsInTree', () => {
  it('migrates only legacy Text items', () => {
    const v2Props = normalizeTextProps({ content: 'kept' });
    const tree = {
      ROOT: { type: { resolvedName: 'Container' }, props: {}, nodes: ['a'] },
      a: { type: { resolvedName: 'Text' }, props: legacyProps, nodes: [] },
      b: { type: { resolvedName: 'Text' }, props: v2Props, nodes: [] },
      c: {
        type: { resolvedName: 'DynamicWidget' },
        props: { text: 'not a text item' },
        nodes: [],
      },
    };
    const migrated = migrateStaticTextItemsInTree(tree);
    expect(migrated.a.props.customStyles.fontSize).toBe('24px');
    expect(migrated.b).toBe(tree.b);
    expect(migrated.c).toBe(tree.c);
    expect(migrated.ROOT).toBe(tree.ROOT);
  });
});
