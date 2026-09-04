import { DrawerSide } from './interfaces';

// The three shell panels that take real width from the canvas. The rail is not
// one of them - it is 48px and never yields - and neither is anything that
// lives inside a panel.
export const CAPPED_PANELS: DrawerSide[] = [
  DrawerSide.LEFT,
  DrawerSide.DASHBOARD,
  DrawerSide.RIGHT,
];

/**
 * Which panels have to close for the cap to hold.
 *
 * Between md and lg only two of the three fit: at 1180px two leave the canvas
 * around 500px, and a third leaves under 200 - narrower than a single node, so
 * the canvas stops being something you can work against. Above lg all three
 * fit and the cap lifts.
 *
 * The oldest one goes. Opening a panel is a statement about what you want to
 * look at now, so the thing you asked for most recently is the thing worth
 * keeping - and closing the one you just opened would make the control feel
 * broken.
 *
 * @param openOrder sides currently open, oldest first
 */
export function panelsToClose(
  openOrder: DrawerSide[],
  maxOpen: number,
): DrawerSide[] {
  if (!Number.isFinite(maxOpen) || openOrder.length <= maxOpen) {
    return [];
  }
  return openOrder.slice(0, openOrder.length - maxOpen);
}

/**
 * Keeps a stable oldest-first order across a change in which panels are open.
 *
 * Panels that were already open hold their place; ones that have just opened
 * join the end. Without this the order would be whatever CAPPED_PANELS happens
 * to list, and the cap would close a panel the user had been looking at rather
 * than the one they had finished with.
 */
export function nextPanelOrder(
  previousOrder: DrawerSide[],
  openNow: DrawerSide[],
): DrawerSide[] {
  const stillOpen = previousOrder.filter((side) => openNow.includes(side));
  const newlyOpen = openNow.filter((side) => !previousOrder.includes(side));
  return [...stillOpen, ...newlyOpen];
}
