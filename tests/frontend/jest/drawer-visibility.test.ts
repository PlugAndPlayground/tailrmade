import { nextDrawerVisibility } from '../../../src/utils/drawerVisibility';

const OPEN = 'OPEN';
const CLOSE = 'CLOSE';
const TOGGLE = 'TOGGLE';

describe('drawer visibility', () => {
  describe('OPEN and CLOSE are literal', () => {
    it('opens a closed drawer', () => {
      expect(
        nextDrawerVisibility({
          action: OPEN,
          isVisible: false,
          requestedView: 'ai',
          activeView: 'graphs',
        }),
      ).toBe(true);
    });

    // the regression: asking to open what is already open used to close it,
    // because the close decision was taken before the action was consulted
    it('leaves an already open drawer open, on the same view', () => {
      expect(
        nextDrawerVisibility({
          action: OPEN,
          isVisible: true,
          requestedView: 'ai',
          activeView: 'ai',
        }),
      ).toBe(true);
    });

    it('closes on CLOSE whatever is showing', () => {
      expect(
        nextDrawerVisibility({
          action: CLOSE,
          isVisible: true,
          requestedView: 'ai',
          activeView: 'ai',
        }),
      ).toBe(false);
    });
  });

  describe('TOGGLE', () => {
    it('closes when the drawer already shows the requested view', () => {
      expect(
        nextDrawerVisibility({
          action: TOGGLE,
          isVisible: true,
          requestedView: 'ai',
          activeView: 'ai',
        }),
      ).toBe(false);
    });

    it('stays open when switching to a different view', () => {
      expect(
        nextDrawerVisibility({
          action: TOGGLE,
          isVisible: true,
          requestedView: 'actions',
          activeView: 'ai',
        }),
      ).toBe(true);
    });

    it('opens a closed drawer', () => {
      expect(
        nextDrawerVisibility({
          action: TOGGLE,
          isVisible: false,
          requestedView: 'ai',
          activeView: 'ai',
        }),
      ).toBe(true);
    });

    it('flips plain visibility when no view is named', () => {
      expect(nextDrawerVisibility({ action: TOGGLE, isVisible: true })).toBe(
        false,
      );
      expect(nextDrawerVisibility({ action: TOGGLE, isVisible: false })).toBe(
        true,
      );
    });
  });

  // the rail buttons and the number shortcuts press the same view repeatedly,
  // so the sequence a user actually produces has to alternate
  it('alternates across repeated presses of the same shortcut', () => {
    let visible = false;
    const press = () => {
      visible = nextDrawerVisibility({
        action: TOGGLE,
        isVisible: visible,
        requestedView: 'graph',
        activeView: 'graph',
      });
      return visible;
    };
    expect([press(), press(), press(), press()]).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });
});
