import * as fs from 'fs';
import * as path from 'path';
import {
  clearAppThemeCache,
  createAppTheme,
} from '../../../src/utils/theme/muiTheme';
import { themeToCssVariables } from '../../../src/utils/theme/cssVariables';
import { resolveTheme } from '../../../src/utils/theme/resolve';

const themeWith = (tokens: Record<string, unknown>) =>
  createAppTheme(
    resolveTheme(
      [{ source: 'saved', mode: 'light', tokens: tokens as never }],
      { prefersDark: false },
    ),
  );

beforeEach(() => clearAppThemeCache());

describe('theme -> CSS variables', () => {
  it('exposes the authored roles and the derived contrast text', () => {
    const variables = themeToCssVariables(
      themeWith({
        primary: '#112233',
        'background.paper': '#fafafa',
        'text.secondary': '#555555',
        radius: 6,
      }),
    );
    expect(variables['--tm-primary']).toBe('#112233');
    expect(variables['--tm-primary-foreground']).toBe('#fff');
    expect(variables['--tm-paper']).toBe('#fafafa');
    expect(variables['--tm-muted-foreground']).toBe('#555555');
    expect(variables['--tm-radius']).toBe('6px');
  });

  it('backs every variable the Tailwind theme in template.html reads', () => {
    const template = fs.readFileSync(
      path.join(__dirname, '../../../template.html'),
      'utf8',
    );
    const referenced = [...template.matchAll(/var\((--tm-[\w-]+)\)/g)].map(
      (match) => match[1],
    );
    expect(referenced.length).toBeGreaterThan(0);
    const provided = Object.keys(themeToCssVariables(themeWith({})));
    referenced.forEach((name) => expect(provided).toContain(name));
  });
});
