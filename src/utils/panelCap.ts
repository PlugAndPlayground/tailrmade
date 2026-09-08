import { DrawerSide } from './interfaces';

// The shell panels that take real width from the canvas. The rail is not one
// of them - it is 48px and never yields.
export const CAPPED_PANELS: DrawerSide[] = [
  DrawerSide.LEFT,
  DrawerSide.DASHBOARD,
  DrawerSide.RIGHT,
];

/**
 * Which panels have to close for the cap to hold. The oldest goes: opening a
 * panel is a statement about what you want to look at now, so closing the one
 * you just opened would make the control feel broken.
 *
 * @param openOrder sides currently open, oldest first
 */
export function panelsToClose(
  openOrder: DrawerSide[],
  maxOpen: number,
): DrawerSide[] {
  return openOrder.slice(0, Math.max(0, openOrder.length - maxOpen));
}

/**
 * Keeps a stable oldest-first order across a change in which panels are open:
 * panels that were already open hold their place, ones that have just opened
 * join the end.
 */
export function nextPanelOrder(
  previousOrder: DrawerSide[],
  openNow: DrawerSide[],
): DrawerSide[] {
  return [
    ...previousOrder.filter((side) => openNow.includes(side)),
    ...openNow.filter((side) => !previousOrder.includes(side)),
  ];
}
