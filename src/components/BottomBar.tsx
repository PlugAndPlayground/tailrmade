import React, { useEffect, useRef, useState } from 'react';
import { Box, ButtonBase, MenuList, Paper, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import IosShareIcon from '@mui/icons-material/IosShare';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PolylineIcon from '@mui/icons-material/Polyline';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import ShareContextMenu from './contextmenus/ShareContextMenu';
import { appMenuOptions } from './contextmenus/GraphContextMenu';
import { setStackView, StackView, useStackView } from '../utils/layoutModel';
import { getDrawerBackground, MAIN_COLOR } from '../utils/constants';
import { TRgba } from '../utils/color';
import { TMIconNoShadow } from '../utils/icons';
import { CLOUD_MODE } from '../services/shared-types';
import { BackendGateway } from '../services/BackendGateway';

// The whole of navigation under the stack layout, and the reason the rail can
// disappear there. Everything reachable at a phone's size is one of these.
//
// It lives at the BOTTOM because that is where a thumb is. The rail sat on the
// left, at the far edge of a one-handed grip, and on a phone it also drew on
// top of the app UI's first 48px rather than making room for it.
//
// And it is CLOSED to begin with, because an app that owns the screen should
// own all of it. Collapsed it is the logo alone in the bottom-left corner; the
// logo is the whole bar, shrunk. Tapping it grows the same surface out to the
// full width, and the bar then gets out of the way on its own (see
// AUTO_COLLAPSE_MS) rather than waiting to be dismissed.
export const BOTTOM_BAR_HEIGHT = 56;

// what is left of the bar when it is closed: a logo-sized square
export const BOTTOM_BAR_COLLAPSED_WIDTH = 56;

// Long enough to read the row and choose a second destination, short enough
// that a bar you opened by accident is gone before it annoys you. Any tap
// inside the bar restarts it, so this is idle time, not a deadline.
const AUTO_COLLAPSE_MS = 4000;

type Destination = {
  view: StackView;
  label: string;
  Icon: typeof DashboardIcon;
  dataCy: string;
};

// Apps first: it is where a session starts, and the leftmost slot sits right
// beside the logo you just pressed. Then the two views of the app you opened -
// its UI, then the graph behind it - and then AI, which is what changes them.
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

export const BottomBar: React.FC = () => {
  const stackView = useStackView();
  const [expanded, setExpanded] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // bumped by every tap inside the bar, to restart the idle countdown
  const [lastTouched, setLastTouched] = useState(0);
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

  // Signing in is not something the bar asks for any more - it is the first
  // item in the overflow menu. So AI is simply not a destination until there
  // is an account behind it, and a local build (no accounts at all) always has
  // it.
  const menuOpen = shareOpen || moreOpen;
  const showAI = !CLOUD_MODE || currentUser !== null;
  const destinations = DESTINATIONS.filter(
    (destination) => destination.view !== 'ai' || showAI,
  );

  // Idle: the bar closes itself rather than being dismissed. A menu open in
  // front of it is the one thing that means you are still using it.
  useEffect(() => {
    if (!expanded || menuOpen) {
      return;
    }
    const timer = setTimeout(() => setExpanded(false), AUTO_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [expanded, menuOpen, lastTouched]);

  // ...and going back to the app closes it too, without waiting out the timer.
  // Capture phase: a scroll inside the app UI never reaches the window by
  // bubbling, and the pointerdown has to be seen before whatever it lands on
  // stops it.
  useEffect(() => {
    if (!expanded || menuOpen) {
      return;
    }
    const collapseIfOutside = (event: Event) => {
      if (barRef.current?.contains(event.target as Node)) {
        return;
      }
      setExpanded(false);
    };
    window.addEventListener('pointerdown', collapseIfOutside, true);
    window.addEventListener('scroll', collapseIfOutside, true);
    return () => {
      window.removeEventListener('pointerdown', collapseIfOutside, true);
      window.removeEventListener('scroll', collapseIfOutside, true);
    };
  }, [expanded, menuOpen]);

  const background = getDrawerBackground().toString();
  const activeColor = TRgba.fromString(MAIN_COLOR).lighten(0.35).hex();
  const restColor = 'rgba(255, 255, 255, 0.62)';

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
        background,
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        borderTopRightRadius: expanded ? 0 : '12px',
        boxShadow: expanded ? 'none' : '0 4px 20px rgba(0, 0, 0, 0.45)',
        // the bar sits on the screen's bottom edge, which on a phone is where
        // the home indicator lives - the row keeps its height and the inset is
        // added below it, so the targets never shrink
        paddingBottom: 'env(safe-area-inset-bottom)',
        pointerEvents: 'auto',
      }}
    >
      {/* the logo IS the bar when it is closed, so it opens and closes it */}
      <ButtonBase
        data-cy="bottom-bar-toggle"
        aria-label={expanded ? 'Hide navigation' : 'Show navigation'}
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((open) => !open);
          setLastTouched(Date.now());
        }}
        sx={{
          ...slotSx,
          flex: expanded ? '0 0 48px' : 1,
          '--svg-fill-color': expanded ? restColor : activeColor,
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
                onClick={() => {
                  setStackView(destination.view);
                  setLastTouched(Date.now());
                }}
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
            onClick={() => {
              setShareOpen(true);
              setLastTouched(Date.now());
            }}
            sx={{ ...slotSx, color: restColor }}
          >
            <IosShareIcon sx={{ fontSize: '22px' }} />
            {label('Share')}
          </ButtonBase>

          <ButtonBase
            data-cy="bottom-bar-more"
            aria-label="More"
            onClick={() => {
              setMoreOpen(true);
              setLastTouched(Date.now());
            }}
            sx={{ ...slotSx, color: restColor }}
          >
            <MoreVertIcon sx={{ fontSize: '22px' }} />
            {label('More')}
          </ButtonBase>
        </>
      )}

      {shareOpen && (
        <>
          <Box
            data-cy="bottom-bar-share-scrim"
            sx={{ position: 'fixed', inset: 0, zIndex: 1300 }}
            onClick={() => setShareOpen(false)}
          />
          {/* anchored above the bar rather than beside it - there is no room
              to the right of the last slot, and a menu under the thumb is
              worse than one over the content */}
          <ShareContextMenu
            anchorPosition={{
              top: window.innerHeight - BOTTOM_BAR_HEIGHT - 8,
              left: 8,
            }}
            anchorCorner="bottom-left"
            onClose={() => setShareOpen(false)}
          />
        </>
      )}

      {moreOpen && (
        <>
          <Box
            data-cy="bottom-bar-more-scrim"
            sx={{ position: 'fixed', inset: 0, zIndex: 1300 }}
            onClick={() => setMoreOpen(false)}
          />
          {/* everything an app can do that is not a destination: the account,
              saving, renaming. Same items, same order, as the top of the graph
              context menu - see appMenuOptions. */}
          <Paper
            data-cy="bottom-bar-more-menu"
            onClick={() => setMoreOpen(false)}
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
            <MenuList dense>{appMenuOptions()}</MenuList>
          </Paper>
        </>
      )}
    </Box>
  );
};

export default BottomBar;
