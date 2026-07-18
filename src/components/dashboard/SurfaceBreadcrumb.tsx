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

// shows the dive path of nested UI surfaces; clicking a crumb navigates
// back up (the last entry is the currently edited surface)
export const SurfaceBreadcrumb: React.FC<{
  surfaceStack: string[];
}> = ({ surfaceStack }) => {
  if (surfaceStack.length === 0) {
    return null;
  }

  return (
    <Breadcrumbs
      data-cy="surface-breadcrumb"
      sx={{ px: 2, py: 0.5, flexShrink: 0 }}
    >
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
