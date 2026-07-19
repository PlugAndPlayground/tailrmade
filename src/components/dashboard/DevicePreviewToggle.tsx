import React from 'react';
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import SmartphoneIcon from '@mui/icons-material/Smartphone';
import TabletMacIcon from '@mui/icons-material/TabletMac';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import {
  DEVICE_PREVIEW_WIDTHS,
  DevicePreviewMode,
  setDevicePreviewMode,
  useDevicePreviewMode,
} from './devicePreviewStore';

const PRESETS: {
  mode: DevicePreviewMode;
  label: string;
  Icon: typeof SmartphoneIcon;
}[] = [
  { mode: 'mobile', label: 'Mobile', Icon: SmartphoneIcon },
  { mode: 'tablet', label: 'Tablet', Icon: TabletMacIcon },
  { mode: 'desktop', label: 'Desktop', Icon: DesktopWindowsIcon },
];

const presetTooltip = (mode: DevicePreviewMode, label: string): string => {
  const width = DEVICE_PREVIEW_WIDTHS[mode];
  return width === null ? `${label} (full width)` : `${label} (${width}px)`;
};

// Three-state device preview toggle for the dashboard editor toolbar.
export const DevicePreviewToggle: React.FC = () => {
  const currentMode = useDevicePreviewMode();

  return (
    <ToggleButtonGroup
      data-cy="device-preview-toggle"
      value={currentMode}
      exclusive
      size="small"
      onChange={(_event, value: DevicePreviewMode | null) => {
        // MUI passes null when the already-selected button is clicked
        if (value) {
          setDevicePreviewMode(value);
        }
      }}
      sx={{ flexShrink: 0 }}
    >
      {PRESETS.map(({ mode, label, Icon }) => (
        <ToggleButton
          key={mode}
          value={mode}
          aria-label={`${label} preview`}
          data-cy={`device-preview-${mode}`}
          sx={{ px: 1 }}
        >
          <Tooltip title={presetTooltip(mode, label)}>
            <Icon fontSize="small" />
          </Tooltip>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
};
