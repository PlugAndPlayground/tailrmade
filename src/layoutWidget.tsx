import React, { useState } from 'react';
import { Box, Stack } from '@mui/material';
import {
  LayoutSection,
  PaddingSection,
  GapSection,
  AlignmentSection,
  DimensionsSection,
  ColorSection,
  CustomCSSSection,
} from './components/dashboard/SettingsControls';
import useInterval from 'use-interval';
import {
  WidgetLayoutInterface,
  WidgetLayoutTypeProps,
} from './nodes/datatypes/widgetLayoutType';
import { potentiallyUpdateSocketData } from './widgets';

export const WidgetLayoutWidget: React.FunctionComponent<
  WidgetLayoutTypeProps
> = (props) => {
  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  const [layoutData, setLayoutData] = useState<WidgetLayoutInterface>(
    property.data || props.dataType.getDefaultValue(),
  );
  const disabled = property.hasLink();

  useInterval(() => {
    if (
      property.data &&
      JSON.stringify(property.data) !== JSON.stringify(layoutData)
    ) {
      setLayoutData(property.data);
    }
  }, 100);

  const setProp = (callback: (props: any) => void) => {
    if (disabled) return;

    const updatedData = { ...layoutData };
    callback(updatedData);
    setLayoutData(updatedData);
    void potentiallyUpdateSocketData(property, updatedData);
  };

  return (
    <Box
      data-cy="widget-layout-widget"
      sx={{ p: 1, height: '100%', overflow: 'auto' }}
    >
      <Stack spacing={0.5} sx={{ bgcolor: 'background.paper' }}>
        <LayoutSection setProp={setProp} props={layoutData} />
        <PaddingSection setProp={setProp} props={layoutData} />
        <GapSection setProp={setProp} props={layoutData} />
        <AlignmentSection
          setProp={setProp}
          props={layoutData}
          flexDirection={layoutData.flexDirection || 'column'}
        />
        <DimensionsSection setProp={setProp} props={layoutData} />
        <ColorSection setProp={setProp} props={layoutData} />
        <CustomCSSSection setProp={setProp} props={layoutData} />
      </Stack>
    </Box>
  );
};
