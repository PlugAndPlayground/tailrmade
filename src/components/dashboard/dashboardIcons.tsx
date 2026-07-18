import React from 'react';
import { Tooltip } from '@mui/material';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import TableRowsIcon from '@mui/icons-material/TableRows';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import WebAssetIcon from '@mui/icons-material/WebAsset';
import WidgetsIcon from '@mui/icons-material/Widgets';

export const DEFAULT_DASHBOARD_ICON = (
  <WidgetsIcon
    sx={{
      fontSize: '16px !important',
      width: '16px !important',
      height: '16px !important',
    }}
  />
);

export const getContainerDashboardIcon = (iconProps: {
  flexDirection?: string;
  mobileBehavior?: string;
  isMobile?: boolean;
  id?: string;
}) => {
  const direction = iconProps?.flexDirection;
  const mobileBehavior = iconProps?.mobileBehavior;
  const isMobile = iconProps?.isMobile;

  // Check if mobile behavior is different from desktop
  const hasMobileBehaviorChange =
    direction === 'row' && mobileBehavior === 'column' && isMobile;

  if (hasMobileBehaviorChange) {
    // Show red TableRowsIcon with tooltip when mobile behavior changes
    return (
      <Tooltip
        title="Switched to vertical layout, due to mobile width. To stay horizontal, change narrow width behaviour setting."
        arrow
        placement="top"
      >
        <TableRowsIcon
          sx={{
            fontSize: '16px !important',
            width: '16px !important',
            height: '16px !important',
            color: '#f44336 !important',
            fill: '#f44336 !important',
          }}
        />
      </Tooltip>
    );
  }

  // Normal behavior
  const DirectionIcon = direction === 'row' ? ViewColumnIcon : TableRowsIcon;
  return (
    <DirectionIcon
      sx={{
        fontSize: '16px !important',
        width: '16px !important',
        height: '16px !important',
      }}
    />
  );
};

export const SOCKET_DASHBOARD_ICON = (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ fontSize: 'inherit' }}
  >
    <rect x="6" y="6" width="12" height="12" rx="4" fill="currentColor" />
  </svg>
);

export const getPageDashboardIcon = () => {
  return (
    <WebAssetIcon
      sx={{
        fontSize: '16px !important',
        width: '16px !important',
        height: '16px !important',
      }}
    />
  );
};

export const getModalDashboardIcon = () => {
  return (
    <OpenInFullIcon
      sx={{
        fontSize: '16px !important',
        width: '16px !important',
        height: '16px !important',
      }}
    />
  );
};
