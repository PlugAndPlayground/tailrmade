import React from 'react';
import { Box } from '@mui/material';

type DashboardContentGateProps = {
  disabled?: boolean;
  // see DashboardWidgetProps.isSurfacePreview - true suppresses the
  // capturing overlay below even while disabled, since these headless
  // renders have no craftjs ancestor for a click to bubble to
  isSurfacePreview?: boolean;
  children: React.ReactNode;
};

export const DashboardContentGate: React.FunctionComponent<
  DashboardContentGateProps
> = ({ disabled, isSurfacePreview = false, children }) => {
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
      }}
    >
      <Box
        sx={{
          width: '100%',
          height: '100%',
        }}
      >
        {children}
      </Box>
      {disabled && !isSurfacePreview && (
        // intercepts all pointer events so a click still bubbles to a
        // craftjs drag connector higher up the tree, instead of falling
        // through past this (pointerEvents:none) disabled content to
        // whatever else is underneath on the page
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            pointerEvents: 'auto',
          }}
        />
      )}
    </Box>
  );
};
