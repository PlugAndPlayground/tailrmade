import React, { useEffect, useState } from 'react';
import { Badge, Box, ButtonBase, Typography } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PolylineIcon from '@mui/icons-material/Polyline';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import MenuIcon from '@mui/icons-material/Menu';
import IosShareIcon from '@mui/icons-material/IosShare';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import ShareContextMenu from './contextmenus/ShareContextMenu';
import { setStackView, StackView, useStackView } from '../utils/layoutModel';
import { getDrawerBackground, MAIN_COLOR } from '../utils/constants';
import { TRgba } from '../utils/color';
import { CLOUD_MODE } from '../services/shared-types';
import { BackendGateway } from '../services/BackendGateway';

// The whole of navigation under the stack layout, and the reason the rail can
// disappear there. Everything reachable at a phone's size is one of these.
//
// It lives at the BOTTOM because that is where a thumb is. The rail sat on the
// left, at the far edge of a one-handed grip, and on a phone it also drew on
// top of the app UI's first 48px rather than making room for it.
export const BOTTOM_BAR_HEIGHT = 56;

type Destination = {
  view: StackView;
  label: string;
  Icon: typeof DashboardIcon;
  dataCy: string;
};

// UI first: on a phone the app is what you came for, and it is what you land
// on. Canvas next because exploring it is the second thing a phone is for,
// then the two panels that are places rather than modes.
const DESTINATIONS: Destination[] = [
  { view: 'ui', label: 'UI', Icon: DashboardIcon, dataCy: 'bottom-bar-ui' },
  {
    view: 'canvas',
    label: 'Canvas',
    Icon: PolylineIcon,
    dataCy: 'bottom-bar-canvas',
  },
  { view: 'ai', label: 'AI', Icon: AutoAwesomeIcon, dataCy: 'bottom-bar-ai' },
  { view: 'apps', label: 'Apps', Icon: MenuIcon, dataCy: 'bottom-bar-apps' },
];

type BottomBarProps = {
  onRequestSignIn: () => void;
};

export const BottomBar: React.FC<BottomBarProps> = ({ onRequestSignIn }) => {
  const stackView = useStackView();
  const [shareOpen, setShareOpen] = useState(false);
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

  // The AI slot stays put when signed out and becomes the invitation to sign
  // in, rather than the bar losing a destination underneath you. It is also
  // the one feature worth signing in for on a phone - it is how you build
  // anything there - so it earns the prompt rather than hiding.
  const aiNeedsSignIn = CLOUD_MODE && currentUser === null;

  const background = getDrawerBackground().toString();
  const activeColor = TRgba.fromString(MAIN_COLOR).lighten(0.35).hex();
  const restColor = 'rgba(255, 255, 255, 0.62)';

  const select = (destination: Destination) => {
    if (destination.view === 'ai' && aiNeedsSignIn) {
      onRequestSignIn();
      return;
    }
    setStackView(destination.view);
  };

  return (
    <Box
      data-cy="bottom-bar"
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'stretch',
        background,
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        // the bar sits on the screen's bottom edge, which on a phone is where
        // the home indicator lives - the row keeps its height and the inset is
        // added below it, so the targets never shrink
        paddingBottom: 'env(safe-area-inset-bottom)',
        pointerEvents: 'auto',
      }}
    >
      {DESTINATIONS.map((destination) => {
        const selected = stackView === destination.view;
        const { Icon } = destination;
        const icon = <Icon sx={{ fontSize: '22px' }} />;
        return (
          <ButtonBase
            key={destination.view}
            data-cy={destination.dataCy}
            aria-label={destination.label}
            aria-current={selected ? 'page' : undefined}
            onClick={() => select(destination)}
            sx={{
              flex: 1,
              minWidth: 0,
              height: `${BOTTOM_BAR_HEIGHT}px`,
              flexDirection: 'column',
              gap: '2px',
              color: selected ? activeColor : restColor,
              touchAction: 'manipulation',
            }}
          >
            {destination.view === 'ai' && aiNeedsSignIn ? (
              <Badge
                variant="dot"
                color="primary"
                data-cy="bottom-bar-ai-signin"
              >
                {icon}
              </Badge>
            ) : (
              icon
            )}
            <Typography
              sx={{ fontSize: '10px', lineHeight: 1, fontWeight: 500 }}
            >
              {destination.label}
            </Typography>
          </ButtonBase>
        );
      })}

      <ButtonBase
        data-cy="bottom-bar-share"
        aria-label="Share"
        onClick={() => setShareOpen(true)}
        sx={{
          flex: 1,
          minWidth: 0,
          height: `${BOTTOM_BAR_HEIGHT}px`,
          flexDirection: 'column',
          gap: '2px',
          color: restColor,
          touchAction: 'manipulation',
        }}
      >
        <IosShareIcon sx={{ fontSize: '22px' }} />
        <Typography sx={{ fontSize: '10px', lineHeight: 1, fontWeight: 500 }}>
          Share
        </Typography>
      </ButtonBase>

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
    </Box>
  );
};

export default BottomBar;
