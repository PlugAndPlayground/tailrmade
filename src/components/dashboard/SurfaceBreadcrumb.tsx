import React, { useState } from 'react';
import {
  Box,
  Breadcrumbs,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import PPGraph from '../../classes/GraphClass';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import type { UISurfaceNode } from '../../nodes/layout/uiSurface';
import { getParentSurfaceNodes } from '../../nodes/layout/surfaceSync';
import { useForceUpdateOn } from './hooks';

const getSurfaceName = (nodeId: string): string => {
  const node = PPGraph.currentGraph.getNodeById(nodeId) as
    UISurfaceNode | undefined;
  if (!node) {
    console.error(
      'SurfaceBreadcrumb: stack entry points to a deleted surface node',
      nodeId,
    );
    return nodeId;
  }
  return node.getDashboardName();
};

// a crumb whose child is embedded in several surfaces gets a dropdown listing
// all of them (this crumb highlighted); picking another shows that surface
const AncestorCrumb: React.FC<{ nodeId: string; childId: string }> = ({
  nodeId,
  childId,
}) => {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const child = PPGraph.currentGraph.getNodeById(childId);
  const parents = child ? getParentSurfaceNodes(child) : [];

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
      <Link
        component="button"
        variant="body2"
        underline="hover"
        color="inherit"
        onClick={() => InterfaceController.showSurface(nodeId, 'crumb')}
        data-cy={`surface-crumb-${nodeId}`}
        sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {getSurfaceName(nodeId)}
      </Link>
      {parents.length > 1 && (
        <>
          <IconButton
            size="small"
            title={`Embedded in ${parents.length} surfaces`}
            onClick={(event) => setMenuAnchor(event.currentTarget)}
            data-cy={`surface-crumb-parents-${childId}`}
            sx={{ p: 0, flex: 'none', color: 'inherit' }}
          >
            <ArrowDropDownIcon fontSize="small" />
          </IconButton>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
          >
            {parents.map((parent) => (
              <MenuItem
                key={parent.id}
                dense
                selected={parent.id === nodeId}
                onClick={() => {
                  setMenuAnchor(null);
                  InterfaceController.showSurface(parent.id);
                }}
                data-cy={`surface-crumb-parent-option-${parent.id}`}
              >
                {parent.getDashboardName()}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
    </Box>
  );
};

// shows the app name followed by the path of nested UI surfaces down to the
// displayed one (derived from the embedding links, or the dive path);
// clicking a crumb navigates back up. It complements the inspector's surface
// switcher rather than replacing it.
export const SurfaceBreadcrumb: React.FC<{
  surfaceStack: string[];
  appName?: string;
  onAppNameClick?: () => void;
}> = ({ surfaceStack, appName, onAppNameClick }) => {
  // parents can be added or removed without the path itself changing
  useForceUpdateOn([
    ListenEvent.SurfaceLayoutChanged,
    ListenEvent.SurfaceListChanged,
  ]);

  if (surfaceStack.length === 0 && !appName) {
    return null;
  }

  return (
    <Breadcrumbs
      data-cy="surface-breadcrumb"
      sx={{
        px: 1,
        minWidth: 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap', minWidth: 0 },
        '& .MuiBreadcrumbs-li': {
          minWidth: 0,
          overflow: 'hidden',
          display: 'flex',
        },
        '& .MuiBreadcrumbs-li > *': {
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
      }}
    >
      {appName && (
        <Link
          key="app-name"
          component="button"
          variant="body2"
          underline="hover"
          color="inherit"
          onClick={onAppNameClick}
          data-cy="surface-crumb-app-name"
        >
          {appName}
        </Link>
      )}
      {surfaceStack.map((nodeId, index) =>
        index === surfaceStack.length - 1 ? (
          <Typography
            key={nodeId}
            color="text.primary"
            variant="body2"
            data-cy={`surface-crumb-${nodeId}`}
          >
            {getSurfaceName(nodeId)}
          </Typography>
        ) : (
          <AncestorCrumb
            key={nodeId}
            nodeId={nodeId}
            childId={surfaceStack[index + 1]}
          />
        ),
      )}
    </Breadcrumbs>
  );
};
