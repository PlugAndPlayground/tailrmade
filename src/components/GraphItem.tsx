import { TRgba } from '../utils/color';
import {
  Box,
  Chip,
  ListSubheader,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Stack,
  Tooltip,
} from '@mui/material';
import React, { useState } from 'react';
import PPGraph from '../classes/GraphClass';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { MAIN_COLOR } from '../utils/constants';
import { EditIcon } from '../utils/icons';
import { IGraphSearch, IGraphSearchLabel } from '../utils/interfaces';
import {
  useIsSmallScreen,
  getLoadCloudGraphURL,
  loadGraphFromIGraphSearch,
  writeTextToClipboard,
} from '../utils/utils';
import PPStorage from '../PPStorage';
import * as styles from '../utils/style.module.css';

import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LockIcon from '@mui/icons-material/Lock';
import PublicIcon from '@mui/icons-material/Public';
import BusinessIcon from '@mui/icons-material/Business';

import { VISIBILITY_ACTION } from '../utils/constants_shared';

import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en.json';
import { BackendGateway } from '../services/BackendGateway';
TimeAgo.addLocale(en);
const timeAgo = new TimeAgo('en-US');

const handleMainClick = async (graph: IGraphSearch, smallScreen: boolean) => {
  await loadGraphFromIGraphSearch(graph);
  if (smallScreen) {
    InterfaceController.toggleLeftSideDrawer(VISIBILITY_ACTION.CLOSE);
  }
};

const handleCopyUrl = (url: string | null, event: React.MouseEvent) => {
  event.stopPropagation();
  InterfaceController.setIsGraphSearchOpen(false);
  if (url) writeTextToClipboard(url);
};

const handleOpenNewTab = (url: string | null, event: React.MouseEvent) => {
  event.stopPropagation();
  InterfaceController.setIsGraphSearchOpen(false);
  if (url) window.open(url, '_blank')?.focus();
};

const handleDownload = (graph: IGraphSearch, event: React.MouseEvent) => {
  event.stopPropagation();
  InterfaceController.setIsGraphSearchOpen(false);
  void PPStorage.getInstance().downloadGraph(graph);
};

const handleEdit = (graph: IGraphSearch, event: React.MouseEvent) => {
  event.stopPropagation();
  InterfaceController.setGraphToBeModified(graph);
  InterfaceController.setShowGraphEdit(true);
};

const handleDelete = (graph: IGraphSearch, event: React.MouseEvent) => {
  event.stopPropagation();
  InterfaceController.setGraphToBeModified(graph);
  InterfaceController.setShowGraphDelete(true);
};

interface GraphItemProps {
  property: IGraphSearch | IGraphSearchLabel;
  sx: any;
}

export const GraphItem = ({ property: graph, sx }: GraphItemProps) => {
  const smallScreen = useIsSmallScreen();
  const [isHovered, setIsHovered] = useState(false);
  const [isActionAreaHovered, setIsActionAreaHovered] = useState(false);

  if ('label' in graph) {
    return (
      <ListSubheader
        sx={{
          lineHeight: '40px',
          paddingLeft: '8px',
          bgcolor: `${TRgba.fromString(MAIN_COLOR).darken(0.7)}`,
        }}
      >
        {graph.label}
      </ListSubheader>
    );
  }
  const url = graph.isRemote ? getLoadCloudGraphURL(graph) : null;
  const contrastTextColor = TRgba.fromString(MAIN_COLOR)
    .getContrastTextColor()
    .hex();

  // Get access level icon and label
  const getAccessIcon = () => {
    if (!graph.access || graph.access === 'private')
      return <LockIcon fontSize="small" />;
    if (graph.access === 'public') return <PublicIcon fontSize="small" />;
    if (graph.access === 'organization')
      return <BusinessIcon fontSize="small" />;
    return <LockIcon fontSize="small" />;
  };

  const accessLabel = graph.access || 'private';
  const storageLabel = graph.isRemote ? 'Cloud' : 'Local';

  const autosaveSuffix = /-\s*Autosave$/i;
  const isAutosave = autosaveSuffix.test(graph.name);

  const selected =
    graph.name === PPGraph.currentGraph.name &&
    graph.location === PPGraph.currentGraph.location &&
    graph?.date?.toISOString() ==
      PPStorage.getInstance().dateOfLastGraphLoaded.toISOString();

  return (
    <ListItem
      sx={{
        p: 0,
        mb: 0.5,
        bgcolor: `${TRgba.fromString(MAIN_COLOR).darken(0.6)}`,
      }}
      title={`Load app`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <ListItemButton
        selected={selected}
        onClick={(e) => handleMainClick(graph, smallScreen)}
        sx={{
          px: 1.25,
          py: 0.4,
          '&.Mui-selected': {
            bgcolor: `${TRgba.fromString(MAIN_COLOR)}`,
            color: contrastTextColor,
          },
        }}
      >
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    flexWrap: 'wrap',
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      fontSize: '0.93rem',
                      fontWeight: selected ? 700 : 500,
                      lineHeight: 1.2,
                      fontStyle:
                        graph.isRemote || isAutosave ? 'italic' : 'inherit',
                    }}
                  >
                    {graph.name}
                  </Box>
                </Box>
                {isAutosave && (
                  <Chip
                    label="Autosave"
                    size="small"
                    color="warning"
                    sx={{
                      mt: 0.2,
                      height: '16px',
                      fontSize: '0.58rem',
                      '& .MuiChip-label': {
                        px: 0.6,
                      },
                      '.Mui-selected &': {
                        color: contrastTextColor,
                        borderColor: contrastTextColor,
                      },
                    }}
                    variant="outlined"
                  />
                )}
              </Box>
              <Chip
                label={storageLabel}
                size="small"
                variant="outlined"
                sx={{
                  height: 16,
                  fontSize: '0.58rem',
                  '& .MuiChip-label': {
                    px: 0.6,
                  },
                }}
              />
              <Tooltip title={accessLabel} arrow>
                <Chip
                  icon={getAccessIcon()}
                  size="small"
                  sx={{
                    height: '16px',
                    minWidth: 0,
                    px: 0,
                    backgroundColor: 'transparent',
                    '& .MuiChip-label': { display: 'none' },
                    '.MuiChip-icon': {
                      fontSize: '0.8rem',
                      display: 'block',
                      margin: '0 auto',
                    },
                    '.Mui-selected &': {
                      color: contrastTextColor,
                      borderColor: contrastTextColor,
                    },
                  }}
                />
              </Tooltip>
            </Box>
          }
          secondary={
            <Stack direction="row" spacing={0.6} sx={{ pt: 0.05 }}>
              <Box component="span">saved {timeAgo.format(graph.date)}</Box>
              {graph.location && graph.location !== 'Default' && (
                <Box component="span">in {graph.location}</Box>
              )}
            </Stack>
          }
          slotProps={{
            primary: {
              sx: {
                my: 0,
                ...(isAutosave
                  ? {
                      color: 'text.secondary',
                      '.Mui-selected &': {
                        color: contrastTextColor,
                      },
                    }
                  : {}),
              },
            },
            secondary: {
              component: 'div',
              sx: {
                mt: 0,
                fontSize: isAutosave ? '0.6rem' : '0.68rem',
                lineHeight: 1.15,
                '.Mui-selected &': {
                  color: contrastTextColor,
                },
              },
            },
          }}
        />
      </ListItemButton>
      <ListItemSecondaryAction
        data-cy={`hover-${graph.name}`}
        sx={{
          visibility:
            smallScreen || selected || isHovered || isActionAreaHovered
              ? 'visible'
              : 'hidden',
          bgcolor: `${TRgba.fromString(MAIN_COLOR).darken(0.6)}`,
          right: '6px',
        }}
        onMouseEnter={() => setIsActionAreaHovered(true)}
        onMouseLeave={() => setIsActionAreaHovered(false)}
      >
        {graph.isRemote &&
          (() => {
            const copyUrlTooltip = 'Copy URL';
            const openNewTabTooltip = 'Open in new tab';

            return (
              <>
                <Tooltip title={copyUrlTooltip} arrow>
                  <span>
                    {' '}
                    {/* Wrapper for Tooltip on disabled button */}
                    <IconButton
                      size="small"
                      onClick={(e) => handleCopyUrl(url, e)}
                      data-cy="copyURLButton"
                      className={styles.menuItemButton}
                      sx={{ p: 0.4 }}
                      disabled={false}
                    >
                      <LinkIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={openNewTabTooltip} arrow>
                  <span>
                    {' '}
                    {/* Wrapper for Tooltip on disabled button */}
                    <IconButton
                      size="small"
                      onClick={(e) => handleOpenNewTab(url, e)}
                      data-cy="openInNewtabButton"
                      className={styles.menuItemButton}
                      sx={{ p: 0.4 }}
                      disabled={false}
                    >
                      <OpenInNewIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </>
            );
          })()}
        {selected && (
          <>
            <IconButton
              size="small"
              onClick={(e) => handleEdit(graph, e)}
              title="Edit app"
              data-cy="editButton"
              className={styles.menuItemButton}
              sx={{
                p: 0.4,
                '& svg': {
                  fill: 'currentColor',
                  '& path': { fill: 'currentColor' },
                  '& rect': { fill: 'transparent' },
                },
              }}
            >
              <EditIcon />
            </IconButton>
          </>
        )}
        <IconButton
          size="small"
          onClick={(e) => handleDownload(graph, e)}
          title="Download app"
          data-cy="downloadButton"
          className={styles.menuItemButton}
          sx={{ p: 0.4 }}
        >
          <DownloadIcon />
        </IconButton>
        {(!graph.isRemote ||
          graph.owner == BackendGateway.getInstance().getCurrentUserId()) && (
          <>
            <IconButton
              size="small"
              title="Delete app"
              data-cy="deleteButton"
              className={styles.menuItemButton}
              sx={{ p: 0.4 }}
              onClick={(e) => handleDelete(graph, e)}
            >
              <DeleteIcon />
            </IconButton>
          </>
        )}
      </ListItemSecondaryAction>
    </ListItem>
  );
};
