import {
  CAPPED_PANELS,
  nextPanelOrder,
  panelsToClose,
} from '../../../src/utils/panelCap';
import { DrawerSide } from '../../../src/utils/interfaces';

const { LEFT, RIGHT, DASHBOARD } = DrawerSide;

describe('which panels have to close', () => {
  it('closes nothing while the cap holds', () => {
    expect(panelsToClose([LEFT], 2)).toEqual([]);
    expect(panelsToClose([LEFT, RIGHT], 2)).toEqual([]);
  });

  // the panel you just asked for is the one worth keeping - closing it would
  // make the control that opened it look broken
  it('closes the oldest when a third opens', () => {
    expect(panelsToClose([LEFT, RIGHT, DASHBOARD], 2)).toEqual([LEFT]);
    expect(panelsToClose([DASHBOARD, LEFT, RIGHT], 2)).toEqual([DASHBOARD]);
  });

  // the window can shrink across the breakpoint with everything already open,
  // which no toggle went through
  it('closes as many as it takes', () => {
    expect(panelsToClose([LEFT, RIGHT, DASHBOARD], 1)).toEqual([LEFT, RIGHT]);
  });

  // above lg the cap lifts entirely rather than being a large number
  it('never closes anything when the cap is lifted', () => {
    expect(panelsToClose([LEFT, RIGHT, DASHBOARD], Infinity)).toEqual([]);
  });
});

describe('panel order', () => {
  it('keeps panels that were already open in their place', () => {
    expect(nextPanelOrder([LEFT, RIGHT], [LEFT, RIGHT])).toEqual([LEFT, RIGHT]);
  });

  it('puts a newly opened panel last, so it survives the cap', () => {
    const order = nextPanelOrder([RIGHT, LEFT], [LEFT, RIGHT, DASHBOARD]);
    expect(order).toEqual([RIGHT, LEFT, DASHBOARD]);
    expect(panelsToClose(order, 2)).toEqual([RIGHT]);
  });

  it('forgets panels that have closed', () => {
    expect(nextPanelOrder([LEFT, RIGHT, DASHBOARD], [DASHBOARD])).toEqual([
      DASHBOARD,
    ]);
  });

  // reopening should feel like opening, not like resuming an old position
  it('treats a reopened panel as newly opened', () => {
    const afterClose = nextPanelOrder([LEFT, RIGHT], [RIGHT]);
    const afterReopen = nextPanelOrder(afterClose, [RIGHT, LEFT]);
    expect(afterReopen).toEqual([RIGHT, LEFT]);
  });
});

describe('what counts as a panel', () => {
  // the rail is 48px and never yields, so it is not in the competition
  it('caps the three that take real width, and nothing else', () => {
    expect(CAPPED_PANELS).toHaveLength(3);
    expect(CAPPED_PANELS).toEqual(
      expect.arrayContaining([LEFT, RIGHT, DASHBOARD]),
    );
  });
});
