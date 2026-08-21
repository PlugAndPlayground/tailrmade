import { IDrawerState } from './interfaces';
import { DRAWER_CONSTANTS, LeftDrawerView, RightDrawerView } from './constants';

const DRAWER_STATE_KEY = 'tm-drawer-state';

/**
 * Save drawer state to session storage
 */
export function saveDrawerStateToSession(drawerState: IDrawerState): void {
  try {
    sessionStorage.setItem(DRAWER_STATE_KEY, JSON.stringify(drawerState));
  } catch (error) {
    console.warn('Failed to save drawer state to session storage:', error);
  }
}

/**
 * Load drawer state from session storage
 * Returns null if no state is found or if there's an error
 */
export function loadDrawerStateFromSession(): IDrawerState {
  try {
    const stored = sessionStorage.getItem(DRAWER_STATE_KEY);
    if (!stored) {
      return getDefaultDrawerState();
    }
    return JSON.parse(stored) as IDrawerState;
  } catch (error) {
    console.warn('Failed to load drawer state from session storage:', error);
    return getDefaultDrawerState();
  }
}

/**
 * Clear drawer state from session storage
 */
export function clearDrawerStateFromSession(): void {
  try {
    sessionStorage.removeItem(DRAWER_STATE_KEY);
  } catch (error) {
    console.warn('Failed to clear drawer state from session storage:', error);
  }
}

/**
 * Get default drawer state
 */
export function getDefaultDrawerState(): IDrawerState {
  return {
    leftSide: {
      visible: false,
      // the menu panel opens narrow (it holds lists, not editors) but stays
      // resizable; MIN_DRAWER_WIDTH is its floor
      width: DRAWER_CONSTANTS.MIN_DRAWER_WIDTH,
      activeView: LeftDrawerView.GRAPHS,
    },
    rightSide: {
      visible: false,
      width: 320,
      activeView: RightDrawerView.GRAPH,
    },
  };
}
