import React from 'react';
import {
  Box,
  Collapse,
  ListItem,
  ListItemButton,
  ListItemButtonProps,
  Stack,
} from '@mui/material';
import PPGraph from '../classes/GraphClass';
import PPNode from '../classes/NodeClass';
import { MAIN_COLOR } from '../utils/constants';
import { TRgba } from '../utils/color';

export const ROW_BACKGROUND = TRgba.fromString(MAIN_COLOR).darken(0.6);
export const ROW_LINE_HEIGHT = 24;
const TAG_MAX_SHARE = '65%';

type NodeRowProps = Omit<ListItemButtonProps, 'onClick' | 'title'> & {
  node: PPNode;
  onClick: (event: React.MouseEvent<HTMLLIElement>) => void;
  title?: string;
  background?: TRgba;
  tags?: React.ReactNode;
  aside?: React.ReactNode;
  subtitle?: React.ReactNode;
  details?: React.ReactNode;
  expanded?: boolean;
};

// One node as a list row: node colour bar, name, tags on the right and a
// smaller second line. Shared by the node list and the risk review.
export const NodeRow: React.FC<NodeRowProps> = ({
  node,
  onClick,
  title,
  background = ROW_BACKGROUND,
  tags,
  aside,
  subtitle,
  details,
  expanded = false,
  ...buttonProps
}) => (
  <ListItem
    sx={{
      p: 0,
      flexDirection: 'column',
      alignItems: 'stretch',
      '&:hover + .MuiListItemSecondaryAction-root': {
        visibility: 'visible',
      },
      bgcolor: `${background}`,
      margin: '2px 0',
      borderLeft: `16px solid ${node.getColor()}`,
    }}
    title={title ?? node.id}
    onPointerEnter={(event: React.MouseEvent<HTMLLIElement>) => {
      event.stopPropagation();
      PPGraph.currentGraph.selection.drawSingleFocus(node);
    }}
    onClick={(event: React.MouseEvent<HTMLLIElement>) => {
      event.stopPropagation();
      onClick(event);
    }}
  >
    <ListItemButton {...buttonProps} sx={{ p: 1 }}>
      <Stack sx={{ width: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
          <Box
            sx={{
              flex: '1 1 auto',
              minWidth: 0,
              lineHeight: `${ROW_LINE_HEIGHT}px`,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.name}
          </Box>
          {tags && (
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
                columnGap: '2px',
                rowGap: '3px',
                maxWidth: TAG_MAX_SHARE,
                minWidth: 0,
                ml: '8px',
              }}
            >
              {tags}
            </Box>
          )}
          {aside}
        </Box>
        <Box
          sx={{
            fontSize: '12px',
            opacity: '0.75',
            textOverflow: 'ellipsis',
            overflowWrap: 'anywhere',
          }}
        >
          {subtitle}
        </Box>
      </Stack>
    </ListItemButton>
    {details && (
      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ px: 1, pb: 1, bgcolor: 'rgba(0,0,0,0.25)' }}>{details}</Box>
      </Collapse>
    )}
  </ListItem>
);
