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
    chooseThemePreset('slate');
    expect(ActionHandler.setUnsavedChange).toHaveBeenCalledWith(true);
    expect(getThemeDocument().presetId).toBe('slate');
  });

  it('keeps overrides when the preset changes', () => {
    overrideThemeToken('radius', 12);
    chooseThemePreset('paper');
    expect(getThemeDocument()).toEqual({
      presetId: 'paper',
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
    chooseThemePreset('slate');
    chooseThemeMode('light', true);
    overrideThemeToken('radius', 12);
    resetAllThemeTokens();
    expect(getThemeDocument()).toEqual({ presetId: 'slate', mode: 'light' });
  });

  it('drops the mode key when the choice matches the system', () => {
    chooseThemeMode('light', true);
    expect(getThemeDocument().mode).toBe('light');
    chooseThemeMode('dark', true);
    expect(getThemeDocument().mode).toBeUndefined();
  });

  it('clears the mode when System is chosen explicitly', () => {
    chooseThemeMode('light', true);
    chooseThemeMode('system', true);
    expect(getThemeDocument().mode).toBeUndefined();
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
