import {
  Paper,
  MenuList,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
} from '@mui/material';
import React, { useEffect } from 'react';
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import InterfaceController from '../../InterfaceController';
import {
  ALIGNAUTO_TEXTURE,
  ALIGNBOTTOM_TEXTURE,
  ALIGNCENTERHORIZONTALLY_TEXTURE,
  ALIGNCENTERVERTICALLY_TEXTURE,
  ALIGNLEFT_TEXTURE,
  ALIGNOPTIONS,
  ALIGNRIGHT_TEXTURE,
  ALIGNTOP_TEXTURE,
  CONTEXTMENU_WIDTH,
  DISTRIBUTEHORIZONTAL_TEXTURE,
  DISTRIBUTEVERTICAL_TEXTURE,
} from '../../utils/constants';
import {
  useIsSmallScreen,
  combineSelectedDrawNodes,
  combineSelectedLayoutablesIntoSurface,
  combineToArray,
} from '../../utils/utils';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import TuneIcon from '@mui/icons-material/Tune';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CachedIcon from '@mui/icons-material/Cached';
import { VISIBILITY_ACTION } from '../../utils/constants_shared';
import * as styles from '../../utils/style.module.css';
import { SubMenuItem } from './ContextMenus';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { extractSelectionToMacro } from '../../actions/graphActions';

function constructListOptions(options: any): any {
  return Object.keys(options).map((key) => {
    return (
      <div key={key}>
        {' '}
        <MenuItem onClick={options[key]}>
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{key}</ListItemText>
        </MenuItem>
      </div>
    );
  });
}

const AlignOptionMenuItem = (props) => {
  return (
    <MenuItem
      onClick={async () => {
        await PPGraph.currentGraph.selection.perform_action_alignNodes(
          props.alignOption,
        );
      }}
    >
      <img className={styles.imageMenuIcon} src={props.image} />
      <ListItemText>{props.alignOption}</ListItemText>
    </MenuItem>
  );
};

function alignOptions(): any {
  return [
    <AlignOptionMenuItem
      image={ALIGNAUTO_TEXTURE}
      key={ALIGNOPTIONS.ALIGN_AUTO}
      alignOption={ALIGNOPTIONS.ALIGN_AUTO}
    />,
    <AlignOptionMenuItem
      image={ALIGNLEFT_TEXTURE}
      key={ALIGNOPTIONS.ALIGN_LEFT}
      alignOption={ALIGNOPTIONS.ALIGN_LEFT}
    />,
    <AlignOptionMenuItem
      image={ALIGNCENTERHORIZONTALLY_TEXTURE}
      key={ALIGNOPTIONS.ALIGN_CENTER_HORIZONTAL}
      alignOption={ALIGNOPTIONS.ALIGN_CENTER_HORIZONTAL}
    />,
    <AlignOptionMenuItem
      image={ALIGNRIGHT_TEXTURE}
      key={ALIGNOPTIONS.ALIGN_RIGHT}
      alignOption={ALIGNOPTIONS.ALIGN_RIGHT}
    />,
    <AlignOptionMenuItem
      image={ALIGNTOP_TEXTURE}
      key={ALIGNOPTIONS.ALIGN_TOP}
      alignOption={ALIGNOPTIONS.ALIGN_TOP}
    />,
    <AlignOptionMenuItem
      image={ALIGNCENTERVERTICALLY_TEXTURE}
      key={ALIGNOPTIONS.ALIGN_CENTER_VERTICAL}
      alignOption={ALIGNOPTIONS.ALIGN_CENTER_VERTICAL}
    />,
    <AlignOptionMenuItem
      image={ALIGNBOTTOM_TEXTURE}
      key={ALIGNOPTIONS.ALIGN_BOTTOM}
      alignOption={ALIGNOPTIONS.ALIGN_BOTTOM}
    />,
    <AlignOptionMenuItem
      image={DISTRIBUTEVERTICAL_TEXTURE}
      key={ALIGNOPTIONS.DISTRIBUTE_VERTICAL}
      alignOption={ALIGNOPTIONS.DISTRIBUTE_VERTICAL}
    />,
    <AlignOptionMenuItem
      image={DISTRIBUTEHORIZONTAL_TEXTURE}
      key={ALIGNOPTIONS.DISTRIBUTE_HORIZONTAL}
      alignOption={ALIGNOPTIONS.DISTRIBUTE_HORIZONTAL}
    />,
  ];
}

export const NodeContextMenu = (props) => {
  const selectedNodes: PPNode[] = PPGraph.currentGraph.selection.selectedNodes;
  const areDrawNodesSelected =
    PPGraph.currentGraph.selection.selectedNodes.some((node) =>
      node.reactsToCombineDrawKeyBinding(),
    );
  const areLayoutableNodesSelected =
    PPGraph.currentGraph.selection.selectedNodes.some((node) =>
      node.isLayoutable(),
    );

  useEffect(() => {
    window.addEventListener('contextmenu', handleContextMenu);
  }, []);

  useEffect(() => {
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  function handleContextMenu(e: Event) {
    e.preventDefault();
  }

  return (
    <Paper
      id="node-contextmenu"
      sx={{
        width: CONTEXTMENU_WIDTH,
        maxWidth: '100%',
        position: 'absolute',
        zIndex: 1230,
        left: props.contextMenuPosition[0],
        top: props.contextMenuPosition[1],
      }}
    >
      <MenuList dense>
        <MenuItem
          onClick={() => {
            props.zoomToFitNodes(PPGraph.currentGraph.selection.selectedNodes);
          }}
        >
          <ListItemIcon>
            <FitScreenIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Zoom to fit</ListItemText>
          <Typography variant="body2" color="text.secondary">
            Shift+2
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            InterfaceController.toggleRightSideDrawer(VISIBILITY_ACTION.TOGGLE);
          }}
        >
          <ListItemIcon>
            <TuneIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Toggle inspector</ListItemText>
          <Typography variant="body2" color="text.secondary">
            3
          </Typography>
        </MenuItem>
        <Divider />
        {selectedNodes.length === 1 && (
          <MenuItem
            onClick={() => {
              InterfaceController.openNodeSearch();
            }}
          >
            <ListItemIcon>
              <CachedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Replace with ...</ListItemText>
          </MenuItem>
        )}
        {selectedNodes.length > 1 &&
          (useIsSmallScreen() ? (
            [
              <Divider
                key="Align nodes "
                variant="inset"
                sx={{
                  fontSize: '0.7rem',
                  color: 'text.disabled',
                }}
              >
                Align nodes
              </Divider>,
              alignOptions(),
              <Divider key="Align nodes - end" variant="inset" />,
            ]
          ) : (
            <SubMenuItem autoFocus={false} label="Align nodes">
              {alignOptions()}
            </SubMenuItem>
          ))}
        <MenuItem
          onClick={() => {
            void PPGraph.currentGraph.duplicateSelection();
          }}
        >
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Duplicate</ListItemText>
          <Typography variant="body2" color="text.secondary">
            {`${props.controlOrMetaKey}+D`}
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={() => {
            void PPGraph.currentGraph.perform_action_DeleteSelectedNodes();
          }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
          <Typography variant="body2" color="text.secondary">
            Delete
          </Typography>
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            PPGraph.currentGraph.addTriggerInput();
          }}
        >
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Add Trigger Input</ListItemText>
        </MenuItem>
        {areDrawNodesSelected && (
          <MenuItem onClick={combineSelectedDrawNodes}>
            <ListItemIcon>
              <AddIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Combine draw nodes</ListItemText>
            <Typography variant="body2" color="text.secondary">
              {'Shift+C'}
            </Typography>
          </MenuItem>
        )}
        {areLayoutableNodesSelected && (
          <MenuItem onClick={combineSelectedLayoutablesIntoSurface}>
            <ListItemIcon>
              <AddIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Combine into UI surface</ListItemText>
            <Typography variant="body2" color="text.secondary">
              {'Shift+U'}
            </Typography>
          </MenuItem>
        )}
        <MenuItem onClick={combineToArray}>
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Combine to array</ListItemText>
          <Typography variant="body2" color="text.secondary">
            {'Shift+A'}
          </Typography>
        </MenuItem>
        <MenuItem onClick={() => void extractSelectionToMacro(selectedNodes)}>
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Extract to macro</ListItemText>
          <Typography variant="body2" color="text.secondary">
            {'Shift+M'}
          </Typography>
        </MenuItem>
      </MenuList>
    </Paper>
  );
};

export default NodeContextMenu;
