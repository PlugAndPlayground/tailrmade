import { OptionsObject, SnackbarKey, SnackbarMessage } from 'notistack';

import * as PIXI from 'pixi.js';
import { v4 as uuid } from 'uuid';
import {
  combineSelectedDrawNodes,
  combineSelectedLayoutablesIntoSurface,
  combineToArray,
  getCurrentCursorPosition,
  isEventComingFromWithinTextInput,
  isMac,
} from './utils/utils';
import PPGraph from './classes/GraphClass';
import PPStorage from './PPStorage';
import { zoomInOutViewport, zoomToFitNodes } from './pixi/utils-pixi';
import { getDefaultDrawerState } from './utils/sessionStorageHandler';
import {
  IGraphSearch,
  INodeSearch,
  IOverlay,
  isSurfaceNode,
} from './utils/interfaces';
import {
  VISIBILITY_ACTION,
  surfaceElementVisibleSuffix,
} from './utils/constants_shared';
import {
  ActionHandler,
  ACTIONS,
  AddNodeActionArgs,
  PNPAction,
} from './classes/Action';
import {
  ALIGNOPTIONS,
  DASHBOARD_DEFAULT,
  LeftDrawerView,
  RightDrawerView,
} from './utils/constants';
import { findEmbeddingsOf } from './nodes/layout/surfaceSync';
import type { UISurfaceNode } from './nodes/layout/uiSurface';

export enum ListenEvent {
  SelectionChanged, // data = PPNode[]
  SelectionDraggingOrDrawing, // data = Boolean
  ViewportDragging, // data = Boolean
  ViewportZoom, // data = Boolean
  ViewportMoveEnded, // data = Boolean
  GlobalPointerMove, // data = event: PIXI.FederatedPointerEvent
  GlobalPointerUp, // data = event: PIXI.FederatedPointerEvent
  GraphChanged, // data = {id,name}
  DashboardLoaded,
  AddToDashboard, // data = Layoutable
  RemoveFromDashboard, // data = string (itemId)
  GraphConfigured, // data = {id,name}
  ToggleTooltipInspector, // data = {event: PIXI.FederatedPointerEvent | KeyboardEvent, open?: boolean} => void: called when tooltip inspector is toggled
  EscapeKeyUsed,
  UnsavedChanges, // data = Boolean
  ResourceUpdated, // data = {id}
  OverlayStateChanged, // data = IOverlay
  CompanionConnected,
  newAIMessageArrived,
  DashboardContainerChanged, // data = {id, input}
  DashboardItemAdded,
  UserIsLoggedIn,
  UserPreferencesUpdated, // data = UserPreferences
  UserHasProAccessChanged,
  GraphListUpdated,
  ActionHistoryChanged, // data = ActionHistorySnapshot
  SurfaceListChanged, // data = { nodeId: string; action: 'added' | 'removed' } - a UI surface node was added to or removed from the graph
  SurfaceLayoutChanged, // data = { nodeId: string } - a UI surface node's layout tree (Layout JSON socket) changed
  DisplayedSurfaceChanged, // data = { nodeId: string } - the UI surface shown in the dashboard changed
  SurfaceRuntimeChanged, // data = { nodeId: string } - a surface's runtime override sockets (visible/layout) changed
  ModalOpenChanged, // data = { nodeId: string } - a UI modal node's open/closed state changed
}

type InterfaceEventListener = (data: any, event: ListenEvent) => void;
type ListenEventNotification = {
  event: ListenEvent;
  data?: any;
};

const getDefaultOverlayState = (): IOverlay => ({
  ...getDefaultDrawerState(),
  dashboard: { ...DASHBOARD_DEFAULT },
});

export default class InterfaceController {
  static _showUnsavedChangesWarning = true;

  static listeners: Partial<
    Record<ListenEvent, Record<string, InterfaceEventListener>>
  > = {};

  // we use this listener structure here as there can be multiple listeners, not needed for everything (sometimes there is just one listener)
  private static addListenerForEvents(
    events: ListenEvent[],
    func: InterfaceEventListener,
  ) {
    const newID = uuid();
    for (const listenEvent of events) {
      if (this.listeners[listenEvent] === undefined) {
        this.listeners[listenEvent] = {};
      }
      this.listeners[listenEvent][newID] = func;
    }
    return newID;
  }
  static addListener(event: ListenEvent, func: InterfaceEventListener) {
    return this.addListenerForEvents([event], func);
  }
  static addListeners(events: ListenEvent[], func: InterfaceEventListener) {
    return this.addListenerForEvents(events, func);
  }
  static removeListener(id: string) {
    for (const eventListeners of Object.values(this.listeners)) {
      if (eventListeners && eventListeners[id]) {
        delete eventListeners[id];
      }
    }
  }
  static removeListeners(ids: string[]) {
    ids.forEach((id) => this.removeListener(id));
  }
  private static notifyListenerNotifications(
    notifications: ListenEventNotification[],
  ) {
    const notifiedListeners = new Set<string>();
    for (const notification of notifications) {
      const specificListeners = this.listeners[notification.event];
      if (specificListeners) {
        for (const [key, listener] of Object.entries(specificListeners)) {
          if (!notifiedListeners.has(key)) {
            notifiedListeners.add(key);
            listener(notification.data, notification.event);
          }
        }
      }
    }
  }
  static notifyListeners(event: ListenEvent, data?: any) {
    this.notifyListenerNotifications([{ event, data }]);
  }
  static notifyListenersBatch(notifications: ListenEventNotification[]) {
    this.notifyListenerNotifications(notifications);
  }

  static spamToast(message: string): void {
    if (InterfaceController.toastEverything) {
      InterfaceController.showSnackBar(message, { autoHideDuration: 500 });
    }
  }
  // these are single target, move them up to be multi listener if multiple places needs to use them
  static showSnackBar: (
    message: SnackbarMessage,
    options?: OptionsObject,
  ) => void = () => {};
  static hideSnackBar = (key?: SnackbarKey) => {};

  static onRightClick: (
    event: PIXI.FederatedPointerEvent,
    target: PIXI.Container,
  ) => void = () => {}; // called when the graph is right clicked
  static isDashboardInEditMode = false;
  static unselectDashboardItems: () => void = () => {};
  static selectDashboardItemByElementId: (elementId: string) => void = () => {};
  static onMadeChangeToGraphList: () => void = () => {};
  static getDashboardState: () => any = () => null;

  // these were previously only in app.tsx and are still being set from there, but they can be accessed from anywhere
  static openNodeSearch: (position?: PIXI.Point) => void = () => {};
  static toggleShowEdit: (open?: boolean) => void = () => {};
  static toggleLeftSideDrawer: (
    action: VISIBILITY_ACTION,
    content?: LeftDrawerView,
  ) => void = () => {};
  static toggleShowDashboard: (action: VISIBILITY_ACTION) => void = () => {};
  static toggleDashboardInEditMode: (action: VISIBILITY_ACTION) => void =
    () => {};
  // App view: zero chrome, forced live, the app UI fills the window. Entered
  // and left through the rail logo or P; Escape also leaves it.
  static toggleAppView: (action: VISIBILITY_ACTION) => void = () => {};
  static isInAppView: () => boolean = () => false;
  static toggleRightSideDrawer: (
    action: VISIBILITY_ACTION,
    view?: RightDrawerView,
  ) => void = () => {};
  // Sets the active right drawer tab without changing the drawer's visibility.
  static openDashboardInEditMode: () => void = () => {};
  static setRightDrawerView: (view: RightDrawerView) => void = () => {};

  // Open the right drawer on the given tab, or close it if that tab is already
  // showing - same "switch or close" behaviour as the left drawer's content buttons.
  static selectRightDrawerView(view: RightDrawerView): void {
    this.toggleRightSideDrawer(VISIBILITY_ACTION.OPEN, view);
  }
  static toggleShowDebugInfo: (open?: boolean) => void = () => {};
  static getOverlayState: () => IOverlay = getDefaultOverlayState;
  static updateOverlayState: (overlayState: Partial<IOverlay>) => void =
    () => {};

  // The UI surface node currently displayed/edited in the dashboard
  static displayedSurfaceNodeId: string | null = null;

  /**
   * Show a specific UI surface node in the dashboard (view and edit mode).
   * source: 'select' resets the breadcrumb, 'dive' pushes onto it,
   * 'crumb' navigates back up
   */
  static showSurface(
    nodeId: string,
    source: 'select' | 'dive' | 'crumb' = 'select',
  ): void {
    if (this.displayedSurfaceNodeId === nodeId) {
      return;
    }
    const node = PPGraph.currentGraph.getNodeById(nodeId);
    if (!node?.isSurface()) {
      throw new Error(
        `showSurface: node "${nodeId}" is not a surface (or does not exist)`,
      );
    }
    this.displayedSurfaceNodeId = nodeId;
    this.notifyListeners(ListenEvent.DisplayedSurfaceChanged, {
      nodeId,
      source,
    });
  }

  /**
   * Called when the currently displayed surface node is removed: switches to
   * another available surface, or clears the displayed surface if none remain.
   */
  static showAnotherSurfaceOrClear(removedNodeId: string): void {
    this.displayedSurfaceNodeId = null;
    const nextSurface = Object.values(PPGraph.currentGraph.nodes)
      .filter(isSurfaceNode)
      .find((node) => node.id !== removedNodeId);
    if (nextSurface) {
      this.showSurface(nextSurface.id);
    } else {
      this.notifyListeners(ListenEvent.DisplayedSurfaceChanged, {
        nodeId: null,
        source: 'select',
      });
    }
  }

  /**
   * Find a UI surface node by its route slug (the user-controlled URL fragment).
   */
  static getSurfaceByRouteSlug(routeSlug: string): UISurfaceNode | undefined {
    const normalized = String(routeSlug ?? '').trim();
    if (!normalized) {
      return undefined;
    }
    return Object.values(PPGraph.currentGraph.nodes)
      .filter(isSurfaceNode)
      .find((node) => node.getRouteSlug() === normalized);
  }

  /**
   * Makes the given (embedded) surface node visible: shows it at every place
   * it is embedded, and - if it belongs to a non-empty "Radio Group" - hides
   * every other surface sharing that group at every place THEY are embedded,
   * regardless of whether they share a parent with the target (replacing the
   * old DashboardPageNode "one page per group visible at a time" behaviour,
   * decoupled from tree structure). Surfaces with no Radio Group are simply
   * shown, nothing else is hidden. Returns false when the node isn't embedded
   * anywhere, so the caller can fall back to switching the top-level
   * displayed surface instead.
   */
  static showEmbeddedSurface(targetNodeId: string): boolean {
    const allSurfaces = Object.values(PPGraph.currentGraph.nodes).filter(
      isSurfaceNode,
    );
    const targetEmbeddings = findEmbeddingsOf(allSurfaces, targetNodeId);
    if (targetEmbeddings.length === 0) {
      return false;
    }

    const setEmbeddingsVisible = (
      embeddings: { surface: any; socket: any }[],
      visible: boolean,
    ) => {
      embeddings.forEach(({ surface, socket }) => {
        const visibleSocket = surface.getInputSocketByName(
          socket.name + surfaceElementVisibleSuffix,
        );
        if (visibleSocket) {
          visibleSocket.data = visible;
        }
        surface.forceRerender(false);
        this.notifyListeners(ListenEvent.SurfaceRuntimeChanged, {
          nodeId: surface.id,
        });
      });
    };

    setEmbeddingsVisible(targetEmbeddings, true);

    const targetSurface: any = allSurfaces.find(
      (node: any) => node.id === targetNodeId,
    );
    const radioGroup = targetSurface?.getRadioGroup?.() ?? '';
    if (radioGroup) {
      allSurfaces
        .filter(
          (node: any) =>
            node.id !== targetNodeId && node.getRadioGroup?.() === radioGroup,
        )
        .forEach((sibling: any) => {
          setEmbeddingsVisible(
            findEmbeddingsOf(allSurfaces as any, sibling.id),
            false,
          );
        });
    }

    return true;
  }

  /**
   * Navigate by a single identifier: try a UI surface route slug first, then
   * fall back to a surface name.
   */
  static navigateToSurface(identifier: string): 'surface' | 'not-found' {
    const normalized = String(identifier ?? '').trim();
    if (!normalized) {
      return 'not-found';
    }

    const target =
      this.getSurfaceByRouteSlug(normalized) ??
      Object.values(PPGraph.currentGraph.nodes)
        .filter(isSurfaceNode)
        .find((node) => node.getDashboardName() === normalized);
    if (target) {
      // an embedded surface acts as a "page" (show it, hide its siblings);
      // a standalone/top-level surface is simply made the displayed one
      if (!this.showEmbeddedSurface(target.id)) {
        this.showSurface(target.id);
      }
      return 'surface';
    }

    return 'not-found';
  }
  static setIsGraphSearchOpen: (open: boolean) => void = () => {};
  static setIsNodeSearchVisible: (open: boolean) => void = () => {};
  static setIsGraphContextMenuOpen: (open: boolean) => void = () => {};
  static setIsNodeContextMenuOpen: (open: boolean) => void = () => {};
  static setIsSocketContextMenuOpen: (open: boolean) => void = () => {};

  static setGraphToBeModified: (graph: IGraphSearch) => void = () => {};
  static setShowGraphEdit: (show: boolean) => void = () => {};
  static setShowGraphDelete: (show: boolean) => void = () => {};
  static setBackgroundColor: (number) => void = () => {};
  static setNodeSearchActiveItem: (
    updateFunction: (oldArray: INodeSearch[]) => INodeSearch[],
  ) => void = () => {};

  static isClickOutsideDashboard(event: PIXI.FederatedPointerEvent): boolean {
    const overlayState = InterfaceController.getOverlayState();

    if (overlayState.dashboard.visible) {
      const dashboardWidthPercentage = overlayState.dashboard.widthPercentage;
      const leftDrawerWidth = overlayState.leftSide.visible
        ? overlayState.leftSide.width
        : 0;

      // Calculate dashboard bounds
      const dashboardWidth =
        window.innerWidth * (dashboardWidthPercentage / 100);
      const dashboardLeft = leftDrawerWidth;
      const dashboardRight = dashboardLeft + dashboardWidth;

      // Check if click is within dashboard bounds
      if (event.global.x >= dashboardLeft && event.global.x <= dashboardRight) {
        return false; // Click is inside dashboard
      }
    }
    return true;
  }

  static isTypingInConsole = false;
  static consoleBeingTyped = '';
  static toastEverything = false;

  static get showUnsavedChangesWarning() {
    return this._showUnsavedChangesWarning;
  }
  static set showUnsavedChangesWarning(value) {
    this._showUnsavedChangesWarning = value;
  }

  static keysDown = async (e: KeyboardEvent): Promise<void> => {
    const modKey = isMac() ? e.metaKey : e.ctrlKey;
    if (!isEventComingFromWithinTextInput(e)) {
      if (modKey) {
        if (!e.shiftKey) {
          switch (e.key.toLowerCase()) {
            case 'a':
              PPGraph.currentGraph.selection.selectAllNodes();
              e.preventDefault();
              break;
            case 'f':
              this.openNodeSearch();
              e.preventDefault();
              break;
            case 'd':
              void PPGraph.currentGraph.duplicateSelection();
              e.preventDefault();
              break;
            case 'o':
              this.toggleLeftSideDrawer(
                VISIBILITY_ACTION.OPEN,
                LeftDrawerView.GRAPHS,
              );
              e.preventDefault();
              break;
            case 'e':
              this.toggleShowEdit();
              e.preventDefault();
              break;
            case 'y':
              void ActionHandler.redo();
              e.preventDefault();
              break;
            case 'z':
              void ActionHandler.undo();
              e.preventDefault();
              break;
            case 'k':
              PPStorage.getInstance().copyCurrentGraphURLToClipboard();
              e.preventDefault();
              break;
            case '=':
              zoomInOutViewport(true);
              e.preventDefault();
              break;
            case '-':
              zoomInOutViewport(false);
              e.preventDefault();
              break;
          }
        } else if (e.shiftKey) {
          switch (e.key.toLowerCase()) {
            case 'a':
              PPGraph.currentGraph.selection.deselectAllNodes();
              e.preventDefault();
              break;
            case 'y':
              this.toggleShowDebugInfo();
              break;
            case 'x':
              PPGraph.currentGraph.showExecutionVisualisation =
                !PPGraph.currentGraph.showExecutionVisualisation;
              break;
            case 'z':
              void ActionHandler.redo();
              break;
          }
        }
      } else if (e.shiftKey) {
        switch (e.code) {
          case 'Digit0':
            PPGraph.currentGraph.viewport.setZoom(1, true);
            break;
          case 'Digit1':
            zoomToFitNodes();
            break;
          case 'Digit2':
            zoomToFitNodes(PPGraph.currentGraph.selection.selectedNodes);
            break;
          case 'KeyA':
            void combineToArray();
            break;
          case 'KeyC':
            void combineSelectedDrawNodes();
            break;
          case 'KeyU':
            void combineSelectedLayoutablesIntoSurface();
            break;
        }
      } else if (e.altKey) {
        switch (e.code) {
          case 'KeyA':
            console.log('alt a');
            e.preventDefault();
            break;
        }
      } else if (e.key == '§') {
        if (this.isTypingInConsole) {
          ConsoleController.executeCommand(this.consoleBeingTyped);
          console.log('Executing console command: ' + this.consoleBeingTyped);
          this.consoleBeingTyped = '';
        } else {
          console.log('Starting typing into console');
        }
        this.isTypingInConsole = !this.isTypingInConsole;
      } else if (this.isTypingInConsole) {
        this.consoleBeingTyped += e.key;
      } else {
        const overlayState = this.getOverlayState();
        switch (e.code) {
          case 'KeyA': {
            const selection = PPGraph.currentGraph.selection;
            if (selection.selectedNodes.length > 0) {
              e.preventDefault();
              void selection.perform_action_alignNodes(ALIGNOPTIONS.ALIGN_AUTO);
            }
            break;
          }
          case 'Digit1':
            e.preventDefault();
            this.toggleLeftSideDrawer(
              VISIBILITY_ACTION.TOGGLE,
              LeftDrawerView.GRAPHS,
            );
            break;
          case 'Digit2':
            e.preventDefault();
            if (overlayState.dashboard.visible) {
              this.toggleDashboardInEditMode(VISIBILITY_ACTION.CLOSE);
            }
            this.toggleShowDashboard(VISIBILITY_ACTION.TOGGLE);
            break;
          case 'Digit3':
            e.preventDefault();
            this.selectRightDrawerView(RightDrawerView.GRAPH);
            break;
          case 'Digit4':
            e.preventDefault();
            this.selectRightDrawerView(RightDrawerView.INTERFACE);
            break;
          case 'Digit5':
            e.preventDefault();
            this.selectRightDrawerView(RightDrawerView.APP);
            break;
          case 'KeyM':
            e.preventDefault();
            {
              const goingFullscreen = !overlayState.dashboard.fullscreen;
              this.updateOverlayState({
                dashboard: {
                  ...overlayState.dashboard,
                  visible: goingFullscreen
                    ? true
                    : overlayState.dashboard.visible,
                  fullscreen: goingFullscreen,
                },
              });
            }
            break;
          case 'KeyE':
            e.preventDefault();
            if (overlayState.dashboard.visible) {
              this.toggleDashboardInEditMode(VISIBILITY_ACTION.TOGGLE);
            }
            break;
          // P for preview: where M gives the dashboard the whole row, this
          // gives it the whole window. Escape leaves app view too, so this is
          // mainly the way in.
          case 'KeyP':
            e.preventDefault();
            this.toggleAppView(VISIBILITY_ACTION.TOGGLE);
            break;
          case 'KeyL':
            e.preventDefault();
            const currPos = getCurrentCursorPosition();

            await PNPAction(
              ACTIONS.ADD_NODE,
              new AddNodeActionArgs('Label', currPos),
            );
            break;
        }
      }
    }
    if (modKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (e.shiftKey) {
        await PPStorage.getInstance().saveGraphAction(true);
      } else {
        await PPStorage.getInstance().saveGraphAction(false);
      }
    } else if (e.key === 'Escape') {
      // Leaving app view is what Escape means while you are in it - everything
      // below is canvas and editor chrome that app view does not show, and the
      // EscapeKeyUsed listeners are all canvas interactions (node edit mode,
      // hybrid node interaction) that cannot be active there either.
      //
      // Typing is the exception: Escape inside an app's own text input belongs
      // to that input, so it must not throw the user out of the running app.
      if (this.isInAppView()) {
        if (!isEventComingFromWithinTextInput(e)) {
          e.preventDefault();
          this.toggleAppView(VISIBILITY_ACTION.CLOSE);
        }
        return;
      }
      this.notifyListeners(ListenEvent.EscapeKeyUsed, e);
      this.setIsGraphSearchOpen(false);
      this.setIsNodeSearchVisible(false);
      this.setIsGraphContextMenuOpen(false);
      this.setIsNodeContextMenuOpen(false);
      this.setIsSocketContextMenuOpen(false);
      PPGraph.currentGraph.selection.deselectAllNodes();
      this.notifyListeners(ListenEvent.ToggleTooltipInspector, {
        event: e,
        open: false,
      });
    }
  };
  static onOpenFileBrowser: (fileHandler?: (data: any) => void) => void =
    () => {};

  // Spinner methods
  static showSpinner: (message: string) => void = () => {};
  static hideSpinner: (message?: string) => void = () => {};
}

class ConsoleController {
  static executeCommand(command: string): void {
    switch (command.toLowerCase()) {
      case 'clear': {
        void PPGraph.currentGraph.clear();
        break;
      }
      case 'resetbgcolor': {
      }
    }
  }
}
