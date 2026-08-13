import React from 'react';
import { Breadcrumbs, Link, Typography } from '@mui/material';
import PPGraph from '../../classes/GraphClass';
import InterfaceController from '../../InterfaceController';
import type { UISurfaceNode } from '../../nodes/layout/uiSurface';

const getSurfaceName = (nodeId: string): string => {
  const node = PPGraph.currentGraph.getNodeById(nodeId) as
    | UISurfaceNode
    | undefined;
  if (!node) {
    console.error(
      'SurfaceBreadcrumb: stack entry points to a deleted surface node',
      nodeId,
    );
    return nodeId;
  }
  return node.getDashboardName();
};

// shows the app name followed by the dive path of nested UI surfaces;
// clicking a crumb navigates back up (the last entry is the currently edited
// surface). It complements the inspector's surface switcher rather than
// replacing it.
export const SurfaceBreadcrumb: React.FC<{
  surfaceStack: string[];
  appName?: string;
  onAppNameClick?: () => void;
}> = ({ surfaceStack, appName, onAppNameClick }) => {
  if (surfaceStack.length === 0 && !appName) {
    return null;
  }

  return (
    <Breadcrumbs
      data-cy="surface-breadcrumb"
      sx={{
        px: 1,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' },
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
          <Link
            key={nodeId}
            component="button"
            variant="body2"
            underline="hover"
            color="inherit"
            onClick={() => InterfaceController.showSurface(nodeId, 'crumb')}
            data-cy={`surface-crumb-${nodeId}`}
          >
            {getSurfaceName(nodeId)}
          </Link>
        ),
      )}
    </Breadcrumbs>
  );
};
