import React, { useEffect, useState, useRef, Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useTheme } from '@mui/material';
import { useSnackbar } from 'notistack';
import { NodeSearch } from './components/Search';
import GraphOverlay from './components/GraphOverlay';
import ErrorFallback from './components/ErrorFallback';
import PixiContainer from './containers/PixiContainer';
import { onOpenFileBrowser, StyledDropzone } from './dragAndDrop';
import { Tooltip } from './components/Tooltip';

import { EditDialog, DeleteConfirmationDialog } from './components/Dialogs';
import PPGraph from './classes/GraphClass';
import {
  CONTEXTMENU_GRAPH_HEIGHT,
  CONTEXTMENU_WIDTH,
  MAIN_COLOR,
} from './utils/constants';
import { IGraphSearch, INodeSearch } from './utils/interfaces';
import { controlOrMetaKey, isPhone } from './utils/utils';
import { createPixiApp, zoomToFitNodes } from './pixi/utils-pixi';
import PPSocket from './classes/SocketClass';
import PPNode from './classes/NodeClass';
import InterfaceController, { ListenEvent } from './InterfaceController';
import PPSelection from './classes/selection/SelectionClass';
import TestController from './TestController';
import { getTMBuildLabel } from './buildInfo';

import { BackendGateway } from './services/BackendGateway';
import GraphContextMenu from './components/contextmenus/GraphContextMenu';
import { AuthDialogHost } from './components/AuthDialog';
import { isCanvasExploreOnly } from './utils/layoutModel';
import NodeContextMenu from './components/contextmenus/NodeContextMenu';
import SocketContextMenu from './components/contextmenus/SocketContextMenu';
import SpinnerContainer from './containers/SpinnerContainer';
import { CLOUD_MODE } from './services/shared-types';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

if (CLOUD_MODE) {
  BackendGateway.getInstance().initialize();
}
//////////////////////// THIS FIXES THE RESIZEOBSERVER, FINALLY (?)
// Save a reference to the original ResizeObserver
const OriginalResizeObserver = window.ResizeObserver;
// Create a new ResizeObserver constructor
(window as any).ResizeObserver = function (callback) {
  const wrappedCallback = (entries, observer) => {
    window.requestAnimationFrame(() => {
      try {
        callback(entries, observer);
      } catch (error) {
        console.error('Error in ResizeObserver callback:', error);
      }
    });
  };
  return new OriginalResizeObserver(wrappedCallback);
};
// Copy over static methods, if any
for (let staticMethod in OriginalResizeObserver) {
  if (OriginalResizeObserver.hasOwnProperty(staticMethod)) {
    window.ResizeObserver[staticMethod] = OriginalResizeObserver[staticMethod];
  }
}

///////////////////////////////

console.log(getTMBuildLabel());

fetch('/buildInfo')
  .then((response) => response.json())
  .then((data) => console.log(data))
  .catch((error) => console.error(error));

(window as any).testController = new TestController(); // this is for cypress tests to be able to access everything in here

const App = (): JSX.Element => {
  console.log('FULL APP REDRAW');

  // Update document title when current graph changes
  useEffect(() => {
    const updateTitle = () => {
      if (PPGraph.currentGraph?.name) {
        document.title = PPGraph.currentGraph.name;
      } else {
        document.title = 'Tailrmade - Your Visual App Builder';
      }
    };

    // Initial title update
    updateTitle();

    // Listen for graph name changes
    const listenerId = InterfaceController.addListener(
      ListenEvent.GraphChanged,
      updateTitle,
    );

    return () => {
      InterfaceController.removeListener(listenerId);
    };
  }, []);

  const mousePosition = { x: 0, y: 0 };

  const theme = useTheme();

  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const pixiApp = useRef<PIXI.Application | null>(null);
  const pixiContext = useRef<HTMLDivElement | null>(null);
  const viewport = useRef<Viewport | null>(null);
  const overlayCommentContainer = useRef<PIXI.Container | null>(null);
  const nodeSearchInput = useRef<HTMLInputElement | null>(null);
  const [isNodeSearchVisible, setIsNodeSearchVisible] = useState(false);
  const nodeSearchCountRef = useRef(0);
  const [isGraphContextMenuOpen, setIsGraphContextMenuOpen] = useState(false);
  const [isNodeContextMenuOpen, setIsNodeContextMenuOpen] = useState(false);
  const [isSocketContextMenuOpen, setIsSocketContextMenuOpen] = useState(false);
  const [selectedSocket, setSelectedSocket] = useState<PPSocket | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState([0, 0]);
  const [graphToBeModified, setGraphToBeModified] =
    useState<IGraphSearch>(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [nodeSearchActiveItem, setNodeSearchActiveItem] = useState<
    INodeSearch[]
  >([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // dialogs
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteGraph, setShowDeleteGraph] = useState(false);
  let lastTimeTicked = 0;

  // on mount
  useEffect(() => {
    console.time('main_app_mount');

    // create pixiApp
    lastTimeTicked = createPixiApp(
      pixiContext,
      pixiApp,
      viewport,
      overlayCommentContainer,
      mousePosition,
      lastTimeTicked,
    );

    const toggleInputValue = (open) => (prev) => open ?? !prev;

    InterfaceController.toggleShowEdit = (open) =>
      setShowEdit(toggleInputValue(open));
    InterfaceController.toggleShowDebugInfo = (open) =>
      setShowDebugInfo(toggleInputValue(open));

    InterfaceController.openNodeSearch = openNodeSearch;
    InterfaceController.setIsNodeSearchVisible = setIsNodeSearchVisible;
    InterfaceController.setIsGraphContextMenuOpen = setIsGraphContextMenuOpen;
    InterfaceController.setIsNodeContextMenuOpen = setIsNodeContextMenuOpen;
    InterfaceController.setIsSocketContextMenuOpen = setIsSocketContextMenuOpen;

    InterfaceController.setGraphToBeModified = setGraphToBeModified;
    InterfaceController.setShowGraphDelete = setShowDeleteGraph;
    InterfaceController.setShowGraphEdit = setShowEdit;
    InterfaceController.setNodeSearchActiveItem = setNodeSearchActiveItem;
  }, []);

  InterfaceController.showSnackBar = enqueueSnackbar;
  InterfaceController.hideSnackBar = closeSnackbar;

  useEffect(() => {
    // data has id and name
    const ids: any[] = [];
    ids.push(
      InterfaceController.addListener(ListenEvent.GraphChanged, (data: any) => {
        setGraphToBeModified(data as IGraphSearch);
      }),
    );

    InterfaceController.onOpenFileBrowser = onOpenFileBrowser;

    InterfaceController.onRightClick = (
      event: PIXI.FederatedPointerEvent,
      target: PIXI.Container,
    ) => {
      // one gate for all three canvas menus: under the stack layout every
      // entry in them is an edit the phone does not offer (see
      // isCanvasExploreOnly). The app's own actions live in the bottom bar's
      // overflow menu instead.
      if (isCanvasExploreOnly()) {
        return;
      }
      setIsGraphContextMenuOpen(false);
      setIsNodeContextMenuOpen(false);
      setIsSocketContextMenuOpen(false);
      const contextMenuPosX = Math.min(
        window.innerWidth - (CONTEXTMENU_WIDTH + 8),
        event.global.x,
      );
      const contextMenuPosY = (offset: number) => {
        return Math.min(window.innerHeight - offset, event.global.y);
      };
      switch (true) {
        case target.parent instanceof PPSocket:
          console.log('app right click, socket');
          setContextMenuPosition([contextMenuPosX, contextMenuPosY(80)]);
          setSelectedSocket(target.parent as PPSocket);
          setIsSocketContextMenuOpen(true);
          break;
        case target instanceof PPNode:
          console.log('app right click, node');
          setContextMenuPosition([contextMenuPosX, contextMenuPosY(220)]);
          setIsNodeContextMenuOpen(true);
          break;
        case target instanceof Viewport:
          console.log('app right click, viewport');
          setContextMenuPosition([
            contextMenuPosX,
            contextMenuPosY(CONTEXTMENU_GRAPH_HEIGHT + 8),
          ]);
          setIsGraphContextMenuOpen(true);
          break;
        case target instanceof PPSelection:
          setContextMenuPosition([
            Math.min(
              window.innerWidth - (CONTEXTMENU_WIDTH + 8),
              event.global.x,
            ),
            Math.min(window.innerHeight - 432, event.global.y),
          ]);
          setIsNodeContextMenuOpen(true);
          break;
        default:
          console.log('app right click, something else');
          break;
      }
    };

    return () => {
      InterfaceController.removeListeners(ids);
    };
  });

  useEffect(() => {
    if (!nodeSearchInput?.current) {
      return;
    }
    console.log('add eventlistener to nodeSearchInput');
    nodeSearchInput.current.addEventListener('blur', nodeSearchInputBlurred);
    // }
  }, [nodeSearchInput?.current]);

  useEffect(() => {
    if (isNodeSearchVisible) {
      nodeSearchInput.current.focus();
      nodeSearchInput.current.select();
      // console.dir(nodeSearchInput.current);
    } else {
      // TODO remove timeout here
      // so handleNodeItemSelect has access
      setTimeout(() => {
        if (PPGraph.currentGraph) {
          PPGraph.currentGraph.stopConnecting();
        }
      }, 100);
    }
  }, [isNodeSearchVisible]);

  useEffect(() => {
    if (PPGraph.currentGraph) {
      PPGraph.currentGraph.showDebugInfo = showDebugInfo;
      overlayCommentContainer.current.visible = showDebugInfo;
    }
  }, [showDebugInfo]);

  const openNodeSearch = (pos?: PIXI.Point) => {
    // this is ugly and should be consolidated (the mouseposition in here that is used if no pos is coming in often gives incorrect result at upper left corner)
    if (pos == undefined) {
      pos = new PIXI.Point(mousePosition.x, mousePosition.y);
    }
    setContextMenuPosition([pos.x, pos.y]);
    setIsNodeSearchVisible(true);
  };

  const nodeSearchInputBlurred = () => {
    console.log('nodeSearchInputBlurred');
    setIsNodeSearchVisible(false);
    PPGraph.currentGraph.selectedSocket = undefined;
  };

  const toReturn = (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div
        // close open context menu again on click
        onClick={() => {
          setIsGraphContextMenuOpen(false);
          setIsNodeContextMenuOpen(false);
          setIsSocketContextMenuOpen(false);
        }}
        style={{
          overflow: 'hidden',
          width: '100%',
          height: '100vh',
        }}
      >
        <StyledDropzone>
          {!isPhone() && (
            <Tooltip
              pixiApp={pixiApp.current}
              isContextMenuOpen={
                isGraphContextMenuOpen ||
                isNodeContextMenuOpen ||
                isSocketContextMenuOpen
              }
            />
          )}
          {showDeleteGraph && (
            <DeleteConfirmationDialog graphToBeModified={graphToBeModified} />
          )}

          {showEdit && (
            <EditDialog
              graphId={graphToBeModified.id}
              graphName={graphToBeModified.name}
              graphAccess={graphToBeModified.access}
              graphLocation={graphToBeModified.location}
            />
          )}
          <SpinnerContainer />
          <AuthDialogHost />

          {isGraphContextMenuOpen && (
            <GraphContextMenu
              controlOrMetaKey={controlOrMetaKey()}
              contextMenuPosition={contextMenuPosition}
              showDebugInfo={showDebugInfo}
              zoomToFitNodes={zoomToFitNodes}
            />
          )}
          {isNodeContextMenuOpen && (
            <NodeContextMenu
              controlOrMetaKey={controlOrMetaKey()}
              contextMenuPosition={contextMenuPosition}
              currentGraph={PPGraph.currentGraph}
              openNodeSearch={openNodeSearch}
              zoomToFitNodes={zoomToFitNodes}
            />
          )}
          {isSocketContextMenuOpen && (
            <SocketContextMenu
              controlOrMetaKey={controlOrMetaKey()}
              contextMenuPosition={contextMenuPosition}
              currentGraph={PPGraph.currentGraph}
              selectedSocket={selectedSocket}
            />
          )}
          <PixiContainer ref={pixiContext} />
          <GraphOverlay
            setContextMenuPosition={setContextMenuPosition}
            setIsGraphContextMenuOpen={setIsGraphContextMenuOpen}
          />
          {PPGraph.currentGraph && (
            <NodeSearch
              isVisible={isNodeSearchVisible}
              position={contextMenuPosition}
              setIsNodeSearchVisible={setIsNodeSearchVisible}
              selectedTags={selectedTags}
              setSelectedTags={setSelectedTags}
              nodeSearchInput={nodeSearchInput}
              nodeSearchCountRef={nodeSearchCountRef}
              nodeSearchActiveItem={nodeSearchActiveItem}
              theme={theme}
            />
          )}
        </StyledDropzone>
        <div
          id="portal"
          style={{ position: 'fixed', left: 0, top: 0, zIndex: 9999 }}
        />
      </div>
    </ErrorBoundary>
  );
  return toReturn;
};

export default App;
