import { VISIBILITY_ACTION } from './constants_shared';

export const nextDrawerVisibility = ({
  action,
  isVisible,
  requestedView,
  activeView,
}: {
  action: string;
  isVisible: boolean;
  /** the view being switched to, if the caller named one */
  requestedView?: string;
  activeView?: string;
}): boolean => {
  if (action !== VISIBILITY_ACTION.TOGGLE) {
    return action === VISIBILITY_ACTION.OPEN;
  }
  const alreadyShowingRequestedView =
    requestedView == null || requestedView === activeView;
  return !(isVisible && alreadyShowingRequestedView);
};
