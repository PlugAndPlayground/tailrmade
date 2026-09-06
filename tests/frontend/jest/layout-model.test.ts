import {
  getStackView,
  setStackView,
  StackView,
} from '../../../src/utils/layoutModel';

// useLayoutModel and useMaxOpenPanels are thin useMediaQuery wrappers and are
// covered where they are observable - responsiveShell.cy.ts drives real
// viewports. What is worth pinning here is the stack's own state, which the
// bottom bar and the shell both read.

describe('stack view', () => {
  afterEach(() => setStackView('ui'));

  // the app UI is the phone's reason to exist, so it is what you land on
  it('starts on the app UI', () => {
    expect(getStackView()).toBe('ui');
  });

  it('holds exactly one destination at a time', () => {
    const views: StackView[] = ['graph', 'ai', 'apps', 'ui'];
    views.forEach((view) => {
      setStackView(view);
      expect(getStackView()).toBe(view);
    });
  });

  it('accepts a functional update, like any other store', () => {
    setStackView('graph');
    setStackView((current) => (current === 'graph' ? 'ai' : 'ui'));
    expect(getStackView()).toBe('ai');
  });
});
