import React, { useEffect, useRef, useState } from 'react';
import { Box, ButtonBase, MenuList, Paper, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import IosShareIcon from '@mui/icons-material/IosShare';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PolylineIcon from '@mui/icons-material/Polyline';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { shareOptions } from './contextmenus/ShareContextMenu';
import { appMenuOptions } from './contextmenus/GraphContextMenu';
import { setStackView, StackView, useStackView } from '../utils/layoutModel';
import { getDrawerBackground, MAIN_COLOR } from '../utils/constants';
import { TRgba } from '../utils/color';
import { TMIconNoShadow } from '../utils/icons';
import { CLOUD_MODE } from '../services/shared-types';
import { BackendGateway } from '../services/BackendGateway';
import { useResolvedAppTheme } from '../utils/theme/store';

// The whole of navigation under the stack layout, and the reason the rail can
// disappear there. It sits at the bottom because that is where a thumb is, and
// starts closed because an app that owns the screen should own all of it:
// collapsed it is the logo alone in the corner, and tapping it grows the same
// surface out to the full width.
export const BOTTOM_BAR_HEIGHT = 56;

// What is left of the bar when it is closed, and - the same number - the width
// of the logo's slot when it is open, so that opening animates the width
// around a logo that does not move.
export const BOTTOM_BAR_COLLAPSED_WIDTH = 56;

// Long enough to read the row and choose a destination, short enough that a
// bar opened by accident is gone before it annoys you.
const AUTO_COLLAPSE_MS = 4000;

// Where the bar is in the way, and therefore where it closes itself. The apps
// list and the AI panel end above it anyway, so there it stays and navigation
// is one tap instead of two.
const COLLAPSING_VIEWS: StackView[] = ['ui', 'graph'];

type Destination = {
  view: StackView;
  label: string;
  Icon: typeof DashboardIcon;
  dataCy: string;
};

// Apps first: it is where a session starts. Then the two views of the app you
// opened - its UI, then the graph behind it - and then AI, which changes them.
const DESTINATIONS: Destination[] = [
  {
    view: 'apps',
    label: 'Apps',
    Icon: FolderOpenIcon,
    dataCy: 'bottom-bar-apps',
  },
  { view: 'ui', label: 'UI', Icon: DashboardIcon, dataCy: 'bottom-bar-ui' },
  {
    view: 'graph',
    label: 'Graph',
    Icon: PolylineIcon,
    dataCy: 'bottom-bar-graph',
  },
  { view: 'ai', label: 'AI', Icon: AutoAwesomeIcon, dataCy: 'bottom-bar-ai' },
];

// A menu opened from the bar: the full width of the screen, sitting on top of
// it, with a scrim that takes the tap that closes it.
const MenuSheet: React.FC<{
  dataCy: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ dataCy, onClose, children }) => (
  <>
    <Box
      data-cy={`${dataCy}-scrim`}
      sx={{ position: 'fixed', inset: 0, zIndex: 1300 }}
      onClick={onClose}
    />
    <Paper
      data-cy={`${dataCy}-menu`}
      // any item closes it - each one either acts or opens something of its own
      onClick={onClose}
      sx={{
        position: 'fixed',
        left: '8px',
        right: '8px',
        bottom: `calc(${BOTTOM_BAR_HEIGHT}px + env(safe-area-inset-bottom) + 8px)`,
        maxHeight: '60dvh',
        overflowY: 'auto',
        zIndex: 1400,
      }}
    >
      <MenuList dense>{children}</MenuList>
    </Paper>
  </>
);

export const BottomBar: React.FC = () => {
  const stackView = useStackView();
  const appTheme = useResolvedAppTheme();
  const [expanded, setExpanded] = useState(false);
  const [openMenu, setOpenMenu] = useState<'share' | 'more' | undefined>();
  const barRef = useRef<HTMLDivElement | null>(null);
  const [currentUser, setCurrentUser] = useState(
    CLOUD_MODE ? BackendGateway.getInstance().getCurrentUser() : null,
  );

  useEffect(() => {
    if (!CLOUD_MODE) {
      return;
    }
    const listenerId = InterfaceController.addListener(
      ListenEvent.UserIsLoggedIn,
      (isLoggedIn: boolean) =>
        setCurrentUser(
          isLoggedIn ? BackendGateway.getInstance().getCurrentUser() : null,
        ),
    );
    return () => InterfaceController.removeListener(listenerId);
  }, []);

  const collapses = COLLAPSING_VIEWS.includes(stackView);
  // Signing in is the first item in the overflow menu rather than a
  // destination, so AI is simply not offered until there is an account behind
  // it. A local build has no accounts at all and always shows it.
  const showAI = !CLOUD_MODE || currentUser !== null;
  const destinations = DESTINATIONS.filter(
    (destination) => destination.view !== 'ai' || showAI,
  );

  // Idle: the bar closes itself rather than being dismissed. A menu open in
  // front of it is the one thing that means you are still using it, and a new
  // destination restarts the countdown.
  useEffect(() => {
    if (!expanded || openMenu || !collapses) {
      return;
    }
    const timer = setTimeout(() => setExpanded(false), AUTO_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [expanded, openMenu, collapses, stackView]);

  // ...and going back to the app closes it too, without waiting out the timer.
  // Capture phase: a scroll inside the app UI never reaches the window by
  // bubbling, and the pointerdown has to be seen before whatever it lands on
  // stops it.
  useEffect(() => {
    if (!expanded || openMenu || !collapses) {
      return;
    }
    const collapseIfOutside = (event: Event) => {
      if (!barRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    };
    window.addEventListener('pointerdown', collapseIfOutside, true);
    window.addEventListener('scroll', collapseIfOutside, true);
    return () => {
      window.removeEventListener('pointerdown', collapseIfOutside, true);
      window.removeEventListener('scroll', collapseIfOutside, true);
    };
  }, [expanded, openMenu, collapses]);

  // ...and arriving on one of the views that keeps the bar brings it back
  useEffect(() => {
    if (!collapses) {
      setExpanded(true);
    }
  }, [collapses]);

  const background = getDrawerBackground().toString();
  const activeColor = TRgba.fromString(MAIN_COLOR).lighten(0.35).hex();
  // White, not a dimmed white: the current destination is already marked by its
  // colour, and dimming the rest only made the bar look switched off.
  const restColor = TRgba.white().hex();

  // Collapsed, the logo floats directly on the view, so what is behind it
  // decides its colour - the graph being black whatever the app theme says,
  // because the canvas is the editor's surface rather than the app's. Expanded,
  // it sits on the bar's own background like every other slot.
  const floatingLogoColor = (): string => {
    if (stackView === 'graph') {
      return TRgba.black().hex();
    }
    if (stackView === 'ui') {
      return appTheme.mode === 'dark'
        ? TRgba.white().hex()
        : TRgba.black().hex();
    }
    return TRgba.white().hex();
  };
  const logoColor = expanded ? restColor : floatingLogoColor();

  const slotSx = {
    flex: 1,
    minWidth: 0,
    height: `${BOTTOM_BAR_HEIGHT}px`,
    flexDirection: 'column' as const,
    gap: '2px',
    touchAction: 'manipulation',
  };

  const label = (text: string) => (
    <Typography sx={{ fontSize: '10px', lineHeight: 1, fontWeight: 500 }}>
      {text}
    </Typography>
  );

  return (
    <Box
      ref={barRef}
      data-cy="bottom-bar"
      data-expanded={expanded ? 'true' : 'false'}
      sx={{
        position: 'fixed',
        left: 0,
        bottom: 0,
        // the collapsed bar floats over the view rather than reserving a strip
        // of it: 56px permanently withheld from the app is a worse trade than
        // a corner of it briefly covered
        width: expanded ? '100%' : `${BOTTOM_BAR_COLLAPSED_WIDTH}px`,
        transition: 'width 0.2s cubic-bezier(0, 0, 0.2, 1)',
        zIndex: 40,
        display: 'flex',
        alignItems: 'stretch',
        overflow: 'hidden',
        background: expanded ? background : 'transparent',
        borderTop: expanded ? '1px solid rgba(255, 255, 255, 0.12)' : 'none',
        // the inset is added below the row rather than taken out of it, so the
        // targets never shrink around the home indicator
        paddingBottom: 'env(safe-area-inset-bottom)',
        pointerEvents: 'auto',
      }}
    >
      {/* the logo IS the bar when it is closed, so it opens and closes it */}
      <ButtonBase
        data-cy="bottom-bar-toggle"
        aria-label={expanded ? 'Hide navigation' : 'Show navigation'}
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        sx={{
          ...slotSx,
          flex: `0 0 ${BOTTOM_BAR_COLLAPSED_WIDTH}px`,
          '--svg-fill-color': logoColor,
          '& path': { transition: 'fill 0.15s ease-in-out' },
        }}
      >
        <TMIconNoShadow />
      </ButtonBase>

      {expanded && (
        <>
          {destinations.map((destination) => {
            const selected = stackView === destination.view;
            const { Icon } = destination;
            return (
              <ButtonBase
                key={destination.view}
                data-cy={destination.dataCy}
                aria-label={destination.label}
                aria-current={selected ? 'page' : undefined}
                onClick={() => setStackView(destination.view)}
                sx={{
                  ...slotSx,
                  color: selected ? activeColor : restColor,
                }}
              >
                <Icon sx={{ fontSize: '22px' }} />
                {label(destination.label)}
              </ButtonBase>
            );
          })}

          <ButtonBase
            data-cy="bottom-bar-share"
            aria-label="Share"
            onClick={() => setOpenMenu('share')}
            sx={{ ...slotSx, color: restColor }}
          >
            <IosShareIcon sx={{ fontSize: '22px' }} />
            {label('Share')}
          </ButtonBase>

          <ButtonBase
            data-cy="bottom-bar-more"
            aria-label="More"
            onClick={() => setOpenMenu('more')}
            sx={{ ...slotSx, color: restColor }}
          >
            <MoreVertIcon sx={{ fontSize: '22px' }} />
            {label('More')}
          </ButtonBase>
        </>
      )}

      {/* Both menus are the same sheet: a phone has no room for one anchored to
          the slot that opened it. `more` is everything an app can do that is
          not a destination - the same items, in the same order, as the top of
          the graph context menu. */}
      {openMenu && (
        <MenuSheet
          dataCy={`bottom-bar-${openMenu}`}
          onClose={() => setOpenMenu(undefined)}
        >
          {openMenu === 'share' ? shareOptions() : appMenuOptions()}
        </MenuSheet>
      )}
    </Box>
  );
};
