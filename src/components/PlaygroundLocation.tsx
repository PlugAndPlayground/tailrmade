import React, { useState } from 'react';
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
import { GraphItem } from './GraphItem';
import PPGraph from '../classes/GraphClass';

export interface IPlaygroundLocationProps {
  locationName: string;
  graphs: IGraphSearch[];
  stickyTop?: number;
}

export const PlaygroundLocation: React.FC<IPlaygroundLocationProps> = ({
  locationName,
  graphs,
  stickyTop = 0,
}) => {
  const [open, setOpen] = useState(
    graphs.find((g) => PPGraph.currentGraph.id === g.id) !== undefined,
  );

  const handleClick = () => {
    setOpen(!open);
  };

  if (graphs.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        width: '100%',
        mt: 0.75,
        borderRadius: 2.5,
        overflow: 'visible',
        border: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(255,255,255,0.02)',
      }}
    >
      <Box
        sx={{
          position: 'sticky',
          top: `${stickyTop}px`,
          zIndex: 2,
          borderRadius: 'inherit',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          backgroundColor: 'rgb(17, 22, 40)',
          boxShadow: '0 3px 8px rgba(0,0,0,0.16)',
          isolation: 'isolate',
        }}
      >
        <ListItemButton
          onClick={handleClick}
          sx={{
            px: 1,
            py: 0.3,
            minHeight: 30,
            gap: 1,
            backgroundColor: 'rgb(17, 22, 40)',
          }}
        >
          <IconButton size="small" sx={{ color: 'text.secondary' }}>
            {open ? <ExpandMore /> : <ChevronRight />}
          </IconButton>
          <ListItemText
            primary={
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {locationName}
              </Typography>
            }
            sx={{ my: 0 }}
          />
          <Typography
            sx={{
              px: 2,
              pt: 0.5,
              pb: 0.25,
              opacity: '0.5',
              fontSize: '0.75rem',
            }}
          >
            {graphs.length === 1 ? '1 app' : `${graphs.length} apps`}
          </Typography>
        </ListItemButton>
      </Box>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List component="div" disablePadding sx={{ px: 0.75, pb: 0.75 }}>
          {graphs.map((graph) => (
            <GraphItem
              key={`item-${graph.id}-${graph.isRemote}-${graph.owner}`}
              property={graph}
              sx={{
                listStyleType: 'none',
                mx: 0.25,
              }}
            />
          ))}
        </List>
      </Collapse>
    </Box>
  );
};
