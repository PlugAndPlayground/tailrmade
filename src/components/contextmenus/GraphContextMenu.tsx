import {
  Paper,
  MenuList,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
} from '@mui/material';
import React, { useEffect } from 'react';
import PPGraph from '../../classes/GraphClass';
import InterfaceController from '../../InterfaceController';
import PPStorage from '../../PPStorage';
import {
  CONTEXTMENU_WIDTH,
  GESTUREMODE,
  LeftDrawerView,
  UNSET_VALUE,
} from '../../utils/constants';
import { useIsSmallScreen } from '../../utils/utils';
import { shareOptions } from './ShareContextMenu';
import { openAuthDialog } from '../AuthDialog';
import { BackendGateway } from '../../services/BackendGateway';
import { CLOUD_MODE } from '../../services/shared-types';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import UploadIcon from '@mui/icons-material/Upload';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import SaveAsIcon from '@mui/icons-material/SaveAs';
import LogoutIcon from '@mui/icons-material/Logout';
import ClearIcon from '@mui/icons-material/Clear';
import ViewListIcon from '@mui/icons-material/ViewList';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TuneIcon from '@mui/icons-material/Tune';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import MouseIcon from '@mui/icons-material/Mouse';
import SwipeIcon from '@mui/icons-material/Swipe';
import QuestionMarkIcon from '@mui/icons-material/QuestionMark';
import PersonIcon from '@mui/icons-material/Person';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SensorsIcon from '@mui/icons-material/Sensors';
import { VISIBILITY_ACTION } from '../../utils/constants_shared';
import { SubMenuItem } from './ContextMenus';

const GestureModeMenuItem = (props) => {
  const GestureIcon = props.icon;
  return (
    <MenuItem
      onClick={() => {
        PPStorage.getInstance().applyGestureMode(
          PPGraph.currentGraph.viewport,
          props.gestureMode,
        );
      }}
    >
      <ListItemIcon>
        <GestureIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>{props.gestureMode}</ListItemText>
      <Typography variant="body2" color="text.secondary">
        {props.details}
      </Typography>
    </MenuItem>
  );
};

function gestureModes(): any {
  return [
    <GestureModeMenuItem
      icon={MouseIcon}
      key={GESTUREMODE.MOUSE}
      gestureMode={GESTUREMODE.MOUSE}
      details="Scroll to zoom, right click to pan"
    />,
    <GestureModeMenuItem
      icon={SwipeIcon}
      key={GESTUREMODE.TRACKPAD}
      gestureMode={GESTUREMODE.TRACKPAD}
      details="Pinch to zoom, 2 finger to pan"
    />,
    <GestureModeMenuItem
      icon={SensorsIcon}
      key={GESTUREMODE.AUTO}
      gestureMode={GESTUREMODE.AUTO}
    />,
  ];
}

/**
 * The part of this menu that also has to work with a thumb.
 *
 * The bottom bar's overflow menu is not a second menu with its own idea of
 * what an app can do - it is these items, in this order, and nothing else. So
 * they live here, at the top of the graph menu, and both callers render the
 * same array. Anything below them in the graph menu is desktop-only because it
 * needs a rail, a pointer or a keyboard to mean anything.
 */
export function appMenuOptions(controlOrMetaKey?: string): any {
  const isLoggedIn =
    CLOUD_MODE && BackendGateway.getInstance().getCurrentUser() !== null;
  // undefined on the phone, where there is no keyboard to show a shortcut for
  const shortcut = (keys: string) =>
    controlOrMetaKey ? (
      <Typography variant="body2" color="text.secondary">
        {keys.replace('$mod', controlOrMetaKey)}
      </Typography>
    ) : null;

  return [
    CLOUD_MODE && !isLoggedIn && (
      <MenuItem key="Sign in" data-cy="menu-sign-in" onClick={openAuthDialog}>
        <ListItemIcon>
          <PersonIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Sign in</ListItemText>
      </MenuItem>
    ),
    CLOUD_MODE && isLoggedIn && (
      <MenuItem
        key="Logout"
        data-cy="menu-sign-out"
        onClick={() => {
          const currentUrl = window.location.href;
          window.location.href = `/logout?redirectUrl=${currentUrl}`;
        }}
      >
        <ListItemIcon>
          <LogoutIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Logout</ListItemText>
      </MenuItem>
    ),
    <MenuItem
      key="Save"
      data-cy="menu-save"
      onClick={() => PPStorage.getInstance().saveGraphAction(false)}
    >
      <ListItemIcon>
        <SaveIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>Save</ListItemText>
      {shortcut('$mod+S')}
    </MenuItem>,
    <MenuItem
      key="Save as new"
      onClick={() => PPStorage.getInstance().saveGraphAction(true)}
    >
      <ListItemIcon>
        <SaveAsIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>Save as new</ListItemText>
      {shortcut('$mod+Shift+S')}
    </MenuItem>,
    // the phone's only way to rename an app - the name shown over its canvas
    // there is a label, not a control
    <MenuItem
      key="Edit details"
      data-cy="menu-edit-details"
      onClick={() => {
        InterfaceController.setShowGraphEdit(true);
      }}
    >
      <ListItemIcon>
        <EditIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>Edit details</ListItemText>
      {shortcut('$mod+E')}
    </MenuItem>,
    <MenuItem
      key="Create new app"
      onClick={() => {
        void PPStorage.getInstance().createNewGraph();
      }}
    >
      <ListItemIcon>
        <AddIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>Create new app</ListItemText>
    </MenuItem>,
    <MenuItem
      key="Load from file"
      onClick={() => {
        InterfaceController.onOpenFileBrowser();
      }}
    >
      <ListItemIcon>
        <UploadIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>Load from file</ListItemText>
    </MenuItem>,
    <MenuItem
      key="Open help"
      onClick={() => {
        window.open('https://tailrmade.app/help', '_blank');
      }}
    >
      <ListItemIcon>
        <QuestionMarkIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>Open help</ListItemText>
    </MenuItem>,
  ].filter(Boolean);
}

export const GraphContextMenu = (props) => {
  useEffect(() => {
    window.addEventListener('contextmenu', handleContextMenu);
  }, []);

  useEffect(() => {
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  function handleContextMenu(e: Event) {
    e.preventDefault();
  }

  return (
    <Paper
      id="graph-contextmenu"
      sx={{
        width: useIsSmallScreen() ? '100%' : CONTEXTMENU_WIDTH,
        maxHeight: '100dvh',
        overflow: 'auto',
        position: 'absolute',
        zIndex: 1230,
        left: useIsSmallScreen() ? 0 : props.contextMenuPosition[0],
        top: useIsSmallScreen() ? 0 : props.contextMenuPosition[1],
        paddingLeft: useIsSmallScreen() ? '32px' : UNSET_VALUE,
      }}
    >
      <MenuList dense>
        <MenuItem disabled>Tailrmade</MenuItem>
        {appMenuOptions(props.controlOrMetaKey)}
        <MenuItem
          onClick={() =>
            InterfaceController.toggleLeftSideDrawer(
              VISIBILITY_ACTION.TOGGLE,
              LeftDrawerView.GRAPHS,
            )
          }
        >
          <ListItemIcon>
            <SearchIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Open app</ListItemText>
          <Typography variant="body2" color="text.secondary">
            {`${props.controlOrMetaKey}+O`}
          </Typography>
        </MenuItem>
        {useIsSmallScreen() ? (
          [
            <Divider
              key="Share app"
              variant="inset"
              sx={{
                fontSize: '0.7rem',
                color: 'text.disabled',
              }}
            >
              Share app
            </Divider>,
            shareOptions(),
            <Divider key="Share app - end" variant="inset" />,
          ]
        ) : (
          <SubMenuItem autoFocus={false} label="Share app">
            {shareOptions()}
          </SubMenuItem>
        )}
        <MenuItem
          onClick={() => {
            void PPGraph.currentGraph.clear();
          }}
        >
          <ListItemIcon>
            <ClearIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Clear</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem disabled>Menus</MenuItem>
        <MenuItem
          onClick={() => {
            InterfaceController.openNodeSearch();
          }}
        >
          <ListItemIcon>
            <SearchIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Find node</ListItemText>
          <Typography variant="body2" color="text.secondary">
            {`${props.controlOrMetaKey}+F`}
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            InterfaceController.toggleLeftSideDrawer(
              VISIBILITY_ACTION.TOGGLE,
              LeftDrawerView.GRAPHS,
            );
          }}
        >
          <ListItemIcon>
            <ViewListIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Toggle apps list</ListItemText>
          <Typography variant="body2" color="text.secondary">
            {`1`}
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            InterfaceController.toggleShowDashboard(VISIBILITY_ACTION.TOGGLE);
          }}
        >
          <ListItemIcon>
            <DashboardIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Toggle user interface</ListItemText>
          <Typography variant="body2" color="text.secondary">
            {`2`}
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            InterfaceController.toggleRightSideDrawer(VISIBILITY_ACTION.TOGGLE);
          }}
        >
          <ListItemIcon>
            <TuneIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Toggle inspector</ListItemText>
          <Typography variant="body2" color="text.secondary">
            {`3`}
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            InterfaceController.toggleLeftSideDrawer(
              VISIBILITY_ACTION.OPEN,
              LeftDrawerView.AI,
            );
          }}
        >
          <ListItemIcon>
            <AutoAwesomeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Toggle AI assistant</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem disabled>Viewport</MenuItem>
        <MenuItem
          onClick={() => {
            props.zoomToFitNodes();
          }}
        >
          <ListItemIcon>
            <ZoomOutMapIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Zoom to fit all</ListItemText>
          <Typography variant="body2" color="text.secondary">
            Shift+1
          </Typography>
        </MenuItem>
        <Divider />
        <MenuItem disabled>Settings</MenuItem>
        {useIsSmallScreen() ? (
          [
            <Divider
              key="Gesture mode "
              variant="inset"
              sx={{
                fontSize: '0.7rem',
                color: 'text.disabled',
              }}
            >
              Gesture mode
            </Divider>,
            gestureModes(),
            <Divider key="Gesture mode - end" variant="inset" />,
          ]
        ) : (
          <SubMenuItem autoFocus={false} label="Gesture mode">
            {gestureModes()}
          </SubMenuItem>
        )}
        <MenuItem
          onClick={() => {
            PPGraph.currentGraph.showExecutionVisualisation =
              !PPGraph.currentGraph.showExecutionVisualisation;
          }}
        >
          <ListItemText>
            {PPGraph.currentGraph.showExecutionVisualisation
              ? 'Hide execution visualisation'
              : 'Show execution visualisation'}
          </ListItemText>
          <Typography variant="body2" color="text.secondary">
            {`${props.controlOrMetaKey}+Shift+X`}
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            InterfaceController.toggleShowDebugInfo();
          }}
        >
          <ListItemText>
            {props.showDebugInfo ? 'Hide debug output' : 'Show debug output'}
          </ListItemText>
          <Typography variant="body2" color="text.secondary">
            {`${props.controlOrMetaKey}+Shift+Y`}
          </Typography>
        </MenuItem>
      </MenuList>
    </Paper>
  );
};

export default GraphContextMenu;
