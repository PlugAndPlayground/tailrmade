import React, { useMemo, useState } from 'react';
import {
  Box,
  Collapse,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import { ChevronRight, ExpandMore } from '@mui/icons-material';
import { IGraphSearch } from '../utils/interfaces';
import { PlaygroundLocation } from '../components/PlaygroundLocation';
import { EXAMPLE_APPS_LABEL } from '../containers/LeftsideContainer';
import { GraphItem } from './GraphItem';

export interface IPlaygroundLocationData {
  locationName: string;
  graphs: IGraphSearch[];
}

export interface IPlaygroundFolderProps {
  label: string;
  locations: IPlaygroundLocationData[];
}

const STICKY_FOLDER_HEADER_HEIGHT = 58;

export const PlaygroundFolder: React.FC<IPlaygroundFolderProps> = ({
  label,
  locations,
}) => {
  const [open, setOpen] = useState(label !== EXAMPLE_APPS_LABEL);

  const handleClick = () => {
    setOpen(!open);
  };

  const { defaultGraphs, otherLocations, totalGraphCount } = useMemo(() => {
    const allDefaultGraphs: IGraphSearch[] = [];
    const nonDefaultLocations: IPlaygroundLocationData[] = [];

    locations.forEach((loc) => {
      if (loc.locationName === 'Default') {
        allDefaultGraphs.push(...loc.graphs);
      } else {
        nonDefaultLocations.push(loc);
      }
    });

    return {
      defaultGraphs: allDefaultGraphs,
      otherLocations: nonDefaultLocations,
      totalGraphCount: locations.reduce(
        (total, location) => total + location.graphs.length,
        0,
      ),
    };
  }, [locations]);

  return (
    <Box
      sx={{
        mb: 1.25,
        borderRadius: 3,
        overflow: 'visible',
        backgroundColor: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: open ? '0 18px 34px rgba(0,0,0,0.18)' : 'none',
      }}
    >
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 3,
          borderRadius: 'inherit',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          backgroundColor: 'rgb(20, 26, 48)',
          boxShadow: '0 4px 10px rgba(0,0,0,0.18)',
          isolation: 'isolate',
        }}
      >
        <ListItemButton
          onClick={handleClick}
          sx={{
            px: 1.25,
            py: 0.35,
            minHeight: `${STICKY_FOLDER_HEADER_HEIGHT}px`,
            gap: 1,
            alignItems: 'center',
            backgroundColor: 'rgb(20, 26, 48)',
          }}
        >
          <IconButton size="small" sx={{ color: 'text.secondary' }}>
            {open ? <ExpandMore /> : <ChevronRight />}
          </IconButton>
          <ListItemText
            primary={
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 700, lineHeight: 1.25 }}
              >
                {label}
              </Typography>
            }
            secondary={
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {otherLocations.length} folder
                {otherLocations.length === 1 ? '' : 's'}
              </Typography>
            }
            sx={{ my: 0, '& .MuiListItemText-secondary': { lineHeight: 1.05 } }}
          />
          <Typography
            sx={{
              px: 2,
              pt: 0.5,
              pb: 0.25,
              opacity: '0.5',
            }}
          >
            {`${totalGraphCount} app${totalGraphCount === 1 ? '' : 's'}`}
          </Typography>
        </ListItemButton>
      </Box>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List disablePadding sx={{ px: 1, pb: 1 }}>
          {defaultGraphs.map((graph) => (
            <GraphItem
              key={`item-${graph.id}-${graph.isRemote}-${graph.owner}`}
              property={graph}
              sx={{
                listStyleType: 'none',
                mx: 0.5,
              }}
            />
          ))}
          {otherLocations.map((locationData) => (
            <PlaygroundLocation
              key={locationData.locationName}
              locationName={locationData.locationName}
              graphs={locationData.graphs}
              stickyTop={STICKY_FOLDER_HEADER_HEIGHT}
            />
          ))}
        </List>
      </Collapse>
    </Box>
  );
};
