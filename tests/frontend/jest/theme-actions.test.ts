import {
  chooseThemeMode,
  chooseThemePreset,
  flushThemeTokenOverrides,
  overrideThemeToken,
  overrideThemeTokenDebounced,
  resetAllThemeTokens,
  resetThemeToken,
} from '../../../src/components/dashboard/themeActions';
import {
  getThemeDocument,
  setThemeDocument,
} from '../../../src/utils/theme/store';
import { EMPTY_THEME_DOCUMENT } from '../../../src/utils/theme/document';
import { DEFAULT_THEME_MODE } from '../../../src/utils/theme/tokens';

jest.mock('../../../src/classes/Action', () => ({
  ActionHandler: { setUnsavedChange: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ActionHandler } = require('../../../src/classes/Action');

beforeEach(() => {
  setThemeDocument(EMPTY_THEME_DOCUMENT);
  flushThemeTokenOverrides();
  ActionHandler.setUnsavedChange.mockClear();
});

describe('theme writes', () => {
  it('marks the graph dirty so the change is actually persisted', () => {
    chooseThemePreset('cloud');
    expect(ActionHandler.setUnsavedChange).toHaveBeenCalledWith(true);
    expect(getThemeDocument().presetId).toBe('cloud');
  });

  it('keeps overrides when the preset changes', () => {
    overrideThemeToken('radius', 12);
    chooseThemePreset('newsprint');
    expect(getThemeDocument()).toEqual({
      presetId: 'newsprint',
      override: { radius: 12 },
    });
  });

  it('resets one role without touching the others', () => {
    overrideThemeToken('radius', 12);
    overrideThemeToken('primary', '#ff0000');
    resetThemeToken('radius');
    expect(getThemeDocument().override).toEqual({ primary: '#ff0000' });
  });

  it('resets every role but keeps the chosen preset and mode', () => {
    chooseThemePreset('cloud');
    chooseThemeMode('light');
    overrideThemeToken('radius', 12);
    resetAllThemeTokens();
    expect(getThemeDocument()).toEqual({ presetId: 'cloud', mode: 'light' });
  });

  it('drops the mode key when the choice is the default', () => {
    chooseThemeMode('light');
    expect(getThemeDocument().mode).toBe('light');
    chooseThemeMode(DEFAULT_THEME_MODE);
    expect(getThemeDocument().mode).toBeUndefined();
  });

  it('stores the mode when System is chosen explicitly', () => {
    chooseThemeMode('light');
    chooseThemeMode('system');
    expect(getThemeDocument().mode).toBe('system');
  });

  it('leaves a fresh document alone when the default is chosen', () => {
    chooseThemeMode(DEFAULT_THEME_MODE);
    expect(getThemeDocument()).toEqual({});
  });
});

describe('debounced writes', () => {
  jest.useFakeTimers();

  it('collapses a drag into one write', () => {
    overrideThemeTokenDebounced('primary', '#111111');
    overrideThemeTokenDebounced('primary', '#222222');
    overrideThemeTokenDebounced('primary', '#333333');
    expect(getThemeDocument().override).toBeUndefined();

    jest.advanceTimersByTime(100);
    expect(getThemeDocument().override).toEqual({ primary: '#333333' });
    expect(ActionHandler.setUnsavedChange).toHaveBeenCalledTimes(1);
  });

  it('does not let one role cancel another role pending write', () => {
    overrideThemeTokenDebounced('primary', '#111111');
    overrideThemeTokenDebounced('secondary', '#222222');
    jest.advanceTimersByTime(100);
    expect(getThemeDocument().override).toEqual({
      primary: '#111111',
      secondary: '#222222',
    });
  });
});
