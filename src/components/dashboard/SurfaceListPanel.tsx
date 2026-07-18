import React, { useState } from 'react';
import {
  alpha,
  Box,
  Collapse,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PPGraph from '../../classes/GraphClass';
import { isSurfaceNode } from '../../utils/interfaces';
import {
  ACTIONS,
  ActionHandler,
  PNPAction,
  SetSocketValueActionArgs,
} from '../../classes/Action';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import { COLOR_WHITE, SOCKET_TYPE } from '../../utils/constants';
import {
  surfaceRouteSocketName,
  VISIBILITY_ACTION,
} from '../../utils/constants_shared';
import { slugifyUINodeRoute } from '../../utils/surfaceTree';
import type { UISurfaceNode } from '../../nodes/layout/uiSurface';
import { useForceUpdateOn } from './hooks';
import { ensureVisible } from '../../pixi/utils-pixi';

const getSurfaces = (): UISurfaceNode[] =>
  Object.values(PPGraph.currentGraph.nodes).filter(isSurfaceNode);

// fields that blend into the panel row instead of looking like standalone form
// inputs. The outline only appears on the selected surface's row (where the
// fields are actually editable); other rows are fully borderless, and there's
// no hover border in either case. Focus adds a subtle blue fill. `editable`
// (true on the selected row) also drives the caret: a row you're not viewing
// shows a pointer cursor (the whole row is clickable to select it) and its
// first click selects the row (see onMouseDown below) rather than dropping a
// caret — only the row you're already viewing shows a text caret and edits on
// click, so renaming can't change what's displayed.
const getSurfaceTextFieldSx = (theme: any, bold = false, editable = false) => ({
  flex: '1 1 0',
  minWidth: 0,
  '& .MuiOutlinedInput-root': {
    borderRadius: 0,
  },
  // border only on the selected row; none otherwise
  '& .MuiOutlinedInput-notchedOutline': {
    border: editable
      ? `1px solid ${alpha(theme.palette.text.primary, 0.05)}`
      : 'none',
  },
  // keep hover subtle — MUI otherwise darkens the outline to full text.primary
  '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
    border: editable
      ? `1px solid ${alpha(theme.palette.text.primary, 0.2)}`
      : 'none',
  },
  // focused field: subtle blue fill for keyboard visibility (no border)
  '& .MuiOutlinedInput-root.Mui-focused': {
    backgroundColor: alpha(theme.palette.primary.main, 0.1),
  },
  '& .MuiInputBase-input': {
    fontSize: '0.78rem',
    py: 0.4,
    fontWeight: bold ? 700 : 400,
    // unselected row: whole row selects on click, so show the pointer to match
    // the row; selected row: real text caret for editing the field
    cursor: editable ? 'text' : 'pointer',
  },
});

// lists all UI surface nodes. Clicking a row selects it and shows that surface
// in the dashboard in view mode (low-commitment); the pencil enters layout-edit
// mode for that surface; the star marks the default surface shown on app load;
// and each row exposes the route slug used by the Navigate node. Selection and
// layout-editing are independent — only the pencil turns edit mode on.
export const SurfaceListPanel: React.FC = () => {
  // in-progress edits, keyed by node id (kept out of node data until commit)
  const [slugDrafts, setSlugDrafts] = useState<Record<string, string>>({});
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  // collapse the whole list to save vertical space when needed
  const [expanded, setExpanded] = useState(true);

  const forceUpdate = useForceUpdateOn([
    ListenEvent.GraphConfigured,
    ListenEvent.DisplayedSurfaceChanged,
    ListenEvent.SurfaceListChanged,
    ListenEvent.SurfaceLayoutChanged,
  ]);

  const surfaces = getSurfaces();
  if (surfaces.length === 0) {
    return null;
  }

  const displayedId = InterfaceController.displayedSurfaceNodeId;
  const defaultId = PPGraph.currentGraph.defaultUISurfaceNodeId;
  const displayedSurface = surfaces.find((s) => s.id === displayedId);

  // select/view a surface: show it in the dashboard in view mode. Switching to
  // a different surface exits any layout-edit mode so selecting never edits;
  // re-clicking the row you're already viewing is a no-op that leaves edit mode
  // (and input focus) untouched so a second click can edit the name/route.
  const selectSurface = (surface: UISurfaceNode) => {
    InterfaceController.toggleShowDashboard(VISIBILITY_ACTION.OPEN);
    if (surface.id !== displayedId) {
      InterfaceController.toggleDashboardInEditMode(VISIBILITY_ACTION.CLOSE);
      InterfaceController.showSurface(surface.id);
      void ensureVisible([surface], false);
    }
    // edit-mode changes don't otherwise notify this panel
    forceUpdate();
  };

  // pencil: enter layout-edit mode for this surface. Clicking it again while
  // already editing this surface toggles edit mode back off.
  const toggleEditLayout = (surface: UISurfaceNode) => {
    const isEditingThisSurface =
      surface.id === displayedId && InterfaceController.isDashboardInEditMode;
    InterfaceController.toggleShowDashboard(VISIBILITY_ACTION.OPEN);
    if (isEditingThisSurface) {
      InterfaceController.toggleDashboardInEditMode(VISIBILITY_ACTION.CLOSE);
    } else {
      InterfaceController.showSurface(surface.id);
      InterfaceController.toggleDashboardInEditMode(VISIBILITY_ACTION.OPEN);
      void ensureVisible([surface], false);
    }
    forceUpdate();
  };

  const setDefaultSurface = (nodeId: string) => {
    PPGraph.currentGraph.defaultUISurfaceNodeId =
      PPGraph.currentGraph.defaultUISurfaceNodeId === nodeId
        ? undefined
        : nodeId;
    ActionHandler.setUnsavedChange(true);
    forceUpdate();
  };

  const commitName = (surface: UISurfaceNode) => {
    const nextName = (nameDrafts[surface.id] ?? '').trim();
    setNameDrafts((drafts) => {
      const { [surface.id]: _removed, ...rest } = drafts;
      return rest;
    });
    if (!nextName || nextName === surface.nodeName) {
      return;
    }
    surface.setNodeName(nextName);
    ActionHandler.setUnsavedChange(true);
    forceUpdate();
  };

  const commitSlug = async (surface: UISurfaceNode) => {
    const previousSlug = surface.getRouteSlug();
    const draftSlug = slugDrafts[surface.id];
    const nextSlug = slugifyUINodeRoute(draftSlug ?? previousSlug);
    if (draftSlug !== undefined) {
      // reflect the normalised value back into the field only after an edit
      setSlugDrafts((drafts) => ({ ...drafts, [surface.id]: nextSlug }));
    }
    if (nextSlug === previousSlug) {
      return;
    }
    await PNPAction(
      ACTIONS.SET_SOCKET_VALUE,
      {
        nodeID: surface.id,
        socketType: SOCKET_TYPE.IN,
        socketName: surfaceRouteSocketName,
        newValue: nextSlug,
      } as SetSocketValueActionArgs,
      {
        nodeID: surface.id,
        socketType: SOCKET_TYPE.IN,
        socketName: surfaceRouteSocketName,
        newValue: previousSlug,
      } as SetSocketValueActionArgs,
      `surface-route-slug-${surface.id}`,
    );
    forceUpdate();
  };

  return (
    <Box data-cy="surface-list-panel" sx={{ bgcolor: 'background.paper' }}>
      <Box
        role="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        data-cy="surface-list-toggle"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.25,
          px: 0.5,
          pt: 1,
          pb: 0.25,
          cursor: 'pointer',
          userSelect: 'none',
          color: 'text.secondary',
          '&:hover': { color: 'text.primary' },
        }}
      >
        {expanded ? (
          <ExpandMoreIcon sx={{ fontSize: 16 }} />
        ) : (
          <ChevronRightIcon sx={{ fontSize: 16 }} />
        )}
        <Typography variant="caption" noWrap sx={{ minWidth: 0 }}>
          UI surfaces ({surfaces.length})
          {!expanded && displayedSurface && (
            <>
              {' › '}
              <Box component="span" sx={{ color: 'text.primary' }}>
                {displayedSurface.nodeName}
              </Box>
            </>
          )}
        </Typography>
      </Box>
      <Collapse in={expanded} timeout={150} unmountOnExit>
        <List
          dense
          disablePadding
          sx={{ maxHeight: 'min(32vh, 16rem)', overflowY: 'auto' }}
        >
          {surfaces.map((surface) => {
            const isDisplayed = surface.id === displayedId;
            const isEditingThisSurface =
              isDisplayed && InterfaceController.isDashboardInEditMode;
            const isDefault = surface.id === defaultId;
            // prevent the first click on a not-yet-viewed row from dropping a
            // caret — let it bubble to the row so it selects instead
            const guardCaret = (event: React.MouseEvent) => {
              if (!isDisplayed) event.preventDefault();
            };
            return (
              <ListItem
                key={surface.id}
                disablePadding
                onClick={() => selectSurface(surface)}
                onMouseEnter={() =>
                  PPGraph.currentGraph.selection.drawSingleFocus(surface)
                }
                onMouseLeave={() => PPGraph.currentGraph.selection.clearFocus()}
                data-cy={`surface-list-item-${surface.id}`}
                sx={(theme) => ({
                  gap: 0.5,
                  px: 1,
                  py: 0.25,
                  cursor: 'pointer',
                  bgcolor: isEditingThisSurface
                    ? alpha(theme.palette.primary.main, 0.32)
                    : isDisplayed
                      ? 'action.selected'
                      : 'transparent',
                  // editing gets a solid accent stripe so it clearly outranks the
                  // subtle "selected/viewing" highlight (which is also blue-tinted)
                  boxShadow: isEditingThisSurface
                    ? `inset 3px 0 0 ${theme.palette.primary.main}`
                    : 'none',
                  '&:hover': {
                    bgcolor: isEditingThisSurface
                      ? alpha(theme.palette.primary.main, 0.4)
                      : isDisplayed
                        ? 'action.selected'
                        : 'action.hover',
                  },
                  // reveal the (hollow) non-default star on row hover
                  '&:hover .surface-default-toggle': { opacity: 1 },
                })}
              >
                {/* editable surface name */}
                <Tooltip
                  title="Surface name"
                  placement="left"
                  disableInteractive
                >
                  <TextField
                    hiddenLabel
                    size="small"
                    variant="outlined"
                    placeholder="name"
                    value={nameDrafts[surface.id] ?? surface.nodeName}
                    data-cy={`surface-name-input-${surface.id}`}
                    onChange={(event) =>
                      setNameDrafts((drafts) => ({
                        ...drafts,
                        [surface.id]: event.target.value,
                      }))
                    }
                    onBlur={() => commitName(surface)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitName(surface);
                        (event.target as HTMLInputElement).blur();
                      }
                    }}
                    slotProps={{ htmlInput: { onMouseDown: guardCaret } }}
                    sx={(theme) =>
                      getSurfaceTextFieldSx(theme, isDefault, isDisplayed)
                    }
                  />
                </Tooltip>

                {/* route slug: used by the Navigate node */}
                <Tooltip
                  title="Route used by the Navigate node"
                  placement="left"
                  disableInteractive
                >
                  <TextField
                    hiddenLabel
                    size="small"
                    variant="outlined"
                    placeholder="route"
                    value={slugDrafts[surface.id] ?? surface.getRouteSlug()}
                    data-cy={`surface-route-input-${surface.id}`}
                    onChange={(event) =>
                      setSlugDrafts((drafts) => ({
                        ...drafts,
                        [surface.id]: event.target.value.replace(/^\/+/, ''),
                      }))
                    }
                    onBlur={() => void commitSlug(surface)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void commitSlug(surface);
                        (event.target as HTMLInputElement).blur();
                      }
                    }}
                    slotProps={{
                      htmlInput: { onMouseDown: guardCaret },
                      input: {
                        startAdornment: (
                          <InputAdornment position="start" sx={{ mr: 0.25 }}>
                            /
                          </InputAdornment>
                        ),
                      },
                    }}
                    sx={(theme) =>
                      getSurfaceTextFieldSx(theme, false, isDisplayed)
                    }
                  />
                </Tooltip>

                {/* edit this surface's layout — always visible, explicit action */}
                <Tooltip
                  title={
                    isEditingThisSurface ? 'Stop editing layout' : 'Edit layout'
                  }
                  placement="left"
                  disableInteractive
                >
                  <IconButton
                    size="small"
                    aria-label="Edit layout"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleEditLayout(surface);
                    }}
                    data-cy={`surface-edit-layout-btn-${surface.id}`}
                    sx={{
                      p: 0.25,
                      color: isEditingThisSurface
                        ? 'primary.main'
                        : 'text.secondary',
                    }}
                  >
                    <EditIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>

                {/* default surface (shown on app load) */}
                <Tooltip
                  placement="left"
                  title={
                    isDefault
                      ? 'Default surface (shown on app load)'
                      : 'Set as default surface'
                  }
                >
                  <IconButton
                    size="small"
                    edge="end"
                    aria-label="Set as default surface"
                    className="surface-default-toggle"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDefaultSurface(surface.id);
                    }}
                    data-cy={`surface-default-btn-${surface.id}`}
                    sx={{
                      // default star is always visible; a non-default star only
                      // appears on row hover (or keyboard focus)
                      opacity: isDefault ? 1 : 0,
                      transition: 'opacity 0.15s',
                      '&:focus-visible': { opacity: 1 },
                    }}
                  >
                    {isDefault ? (
                      <StarIcon sx={{ fontSize: 16, color: COLOR_WHITE }} />
                    ) : (
                      <StarBorderIcon sx={{ fontSize: 16 }} />
                    )}
                  </IconButton>
                </Tooltip>
              </ListItem>
            );
          })}
        </List>
      </Collapse>
    </Box>
  );
};
