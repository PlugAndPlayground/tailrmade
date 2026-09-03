import React from 'react';
import { Box } from '@mui/material';

type DashboardContentGateProps = {
  // the widget's OWN read-only state
  disabled?: boolean;
  // interaction is suppressed by whatever is rendering the widget rather
  // than by the widget's own settings
  blockInteraction?: boolean;
  // see DashboardWidgetProps.isSurfacePreview - true suppresses the
  // capturing overlay below, since these headless renders have no craftjs
  // ancestor for a click to bubble to
  isSurfacePreview?: boolean;
  children: React.ReactNode;
};

export const DashboardContentGate: React.FunctionComponent<
  DashboardContentGateProps
> = ({ disabled, blockInteraction, isSurfacePreview = false, children }) => {
  const blocked = Boolean(disabled || blockInteraction);
  return (
    <Box
      sx={{
        position: 'relative',
        isolation: 'isolate',
        width: '100%',
        height: '100%',
      }}
    >
      <Box
        inert={blocked}
        sx={{
          position: 'relative',
          zIndex: 0,
          width: '100%',
          height: '100%',
        }}
      >
        {children}
      </Box>
      {blocked && !isSurfacePreview && (
        // intercepts all pointer events so a click still bubbles to a
        // craftjs drag connector higher up the tree, instead of falling
        // through past this content to whatever else is underneath
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
