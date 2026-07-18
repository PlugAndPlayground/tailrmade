import React, { useEffect } from 'react';
import { useEditor } from '@craftjs/core';
import InterfaceController from '../../InterfaceController';
import { RootName } from '../../utils/constants_shared';
import { getNodeIdFromElementId } from '../../utils/utils';

/**
 * This component must be rendered inside the craft.js Editor context.
 * It provides access to the dashboard state through InterfaceController.getDashboardState()
 * so that the dashboard state can be accessed from anywhere in the application,
 * not just from within components that use the useEditor hook.
 */
export const DashboardStateProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { query, actions } = useEditor();

  useEffect(() => {
    // Set up the getDashboardState function in InterfaceController
    InterfaceController.getDashboardState = () => {
      return query.getState().nodes;
    };

    // Select a dashboard item by its element ID (NODE_xxx or SOCKET_xxx)
    InterfaceController.selectDashboardItemByElementId = (
      elementId: string,
    ) => {
      try {
        const nodeIdPart = getNodeIdFromElementId(elementId);
        const match = Object.entries(query.getNodes()).find(([nid, node]) => {
          if (nid === RootName) return false;
          const propId = node.data.props.id;
          if (propId === elementId) return true;
          return nodeIdPart != null && propId?.includes(nodeIdPart);
        });
        if (match) actions.selectNode(match[0]);
      } catch {
        // widget may not exist in dashboard
      }
    };

    // Cleanup on unmount
    return () => {
      InterfaceController.getDashboardState = () => ({});
      InterfaceController.selectDashboardItemByElementId = () => {};
    };
  }, [query, actions]);

  return <>{children}</>;
};
