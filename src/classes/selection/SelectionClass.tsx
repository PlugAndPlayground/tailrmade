import * as PIXI from 'pixi.js';
import React, { Suspense } from 'react';
import { Box } from '@mui/material';
import { Viewport } from 'pixi-viewport';
import SelectionHeaderClass from './SelectionHeaderClass';
import PPNode from '../NodeClass';
import {
  ALIGNOPTIONS,
  SUCCESS_COLOR,
  ONCLICK_DOUBLECLICK,
  PIXI_TRANSPARENT_ALPHA,
  SCALEHANDLE_SIZE,
  SELECTION_COLOR_HEX,
  TOOLTIP_WIDTH,
  WHITE_HEX,
  PIXI_OVERLAY_ALPHA,
} from '../../utils/constants';
import { TAlignOptions } from '../../utils/interfaces';
import { getObjectsInsideBounds } from '../../pixi/utils-pixi';
import {
  clearDocumentSelection,
  getCircularReplacer,
  getDifferenceSelection,
} from '../../utils/utils';
import PPGraph from '../GraphClass';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import {
  ActionHandler,
  ACTIONS,
  BakedAction,
  PNPAction,
  ResizeNodeActionArgs,
  SerializableAction,
} from '../Action';
import { NODE_CLICK_DRAG_THRESHOLD_PX } from '../../utils/nodeInteractivity';
import {
  computeLayeredLayout,
  LayoutEdge,
  LayoutNodeInput,
} from './layeredLayout';

export enum Interaction {
  Passive,
  Drawing,
  Dragging,
}

type PendingClick = {
  node: PPNode;
  wasOnlySelectedAtPointerDown: boolean;
  isShiftClick: boolean;
  downPosition: PIXI.Point;
};

export default class PPSelection extends PIXI.Container {
  public viewport: Viewport;
  protected previousSelectedNodes: PPNode[];
  _selectedNodes: PPNode[];

  protected selectionIntendGraphics: PIXI.Graphics;
  selectionGraphicsContainer: PIXI.Container;
  selectionGraphics: PIXI.Graphics;
  protected singleSelectionsGraphics: PIXI.Graphics;
  protected focusGraphics: PIXI.Graphics;
  protected scaleHandle: ScaleHandle;
  selectionHeader: SelectionHeaderClass;

  protected sourcePoint: PIXI.Point;
  protected lastPointMovedTo: PIXI.Point;
  interaction: Interaction = Interaction.Passive;

  // Deferred node click state used to disambiguate click vs drag.
  pendingClick: PendingClick | undefined = undefined;

  protected onMoveHandler: (event?: PIXI.FederatedPointerEvent) => void;

  constructor(viewport: Viewport) {
    super();
    globalThis.__PPSELECTION__ = this;
    this.viewport = viewport;
    this.selectionIntendGraphics = new PIXI.Graphics();
    this.singleSelectionsGraphics = new PIXI.Graphics();
    this.singleSelectionsGraphics.eventMode = 'none';
    this.focusGraphics = new PIXI.Graphics();
    this.selectionGraphicsContainer = new PIXI.Container();
    this.selectionGraphics = new PIXI.Graphics();
    this.selectionHeader = new SelectionHeaderClass();
    this.scaleHandle = new ScaleHandle(this);
  }

  async init(): Promise<void> {
    this.sourcePoint = new PIXI.Point(0, 0);
    this.previousSelectedNodes = [];
    this._selectedNodes = [];

    this.label = 'selectionContainer';
    this.selectionIntendGraphics.label = 'selectionIntendGraphics';
    this.addChild(this.selectionIntendGraphics);
    this.singleSelectionsGraphics.label = 'singleSelectionsGraphics';
    this.addChild(this.singleSelectionsGraphics);
    this.focusGraphics.label = 'focusGraphics';
    this.addChild(this.focusGraphics);
    this.selectionGraphics.label = 'selectionGraphics';
    await this.selectionHeader.init();
    this.selectionGraphicsContainer.addChild(this.selectionGraphics);
    this.selectionGraphicsContainer.addChild(this.selectionHeader);
    this.addChild(this.selectionGraphicsContainer);
    this.addChild(this.scaleHandle);

    this.eventMode = 'static';
    this.focusGraphics.eventMode = 'none';

    this.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.addEventListener(
      'pointerupoutside',
      this.onPointerUpAndUpOutside.bind(this),
    );
    this.addEventListener('pointerup', this.onPointerUpAndUpOutside.bind(this));
    this.addEventListener('pointerover', this.onPointerOver.bind(this));
    this.addEventListener('rightclick', (event) =>
      InterfaceController.onRightClick(event, event.target),
    );
    this.viewport.addEventListener(
      'zoomed',
      (this as any).onViewportMoved.bind(this),
    );

    this.onMoveHandler = this.onMove.bind(this);
    // subscribe to pointermove, dont ever unsub, we live forever
    InterfaceController.addListener(
      ListenEvent.GlobalPointerMove,
      this.onMoveHandler,
    );
  }

  get selectedNodes(): PPNode[] {
    return this._selectedNodes;
  }

  get isPendingSelection(): boolean {
    return this.pendingClick !== undefined;
  }

  public isOnlySelectedNode(node: PPNode): boolean {
    return (
      this.selectedNodes.length === 1 &&
      this.selectedNodes[0] === node &&
      !this.isPendingSelection
    );
  }

  public isOnlySelectedNodeIgnoringPendingSelection(node: PPNode): boolean {
    return this.selectedNodes.length === 1 && this.selectedNodes[0] === node;
  }

  private clearPendingClick(): void {
    this.pendingClick = undefined;
  }

  public beginPendingClick(
    node: PPNode,
    event: PIXI.FederatedPointerEvent,
    {
      clearExistingSelection,
      isShiftClick,
      wasOnlySelectedAtPointerDown,
    }: {
      clearExistingSelection: boolean;
      isShiftClick: boolean;
      wasOnlySelectedAtPointerDown: boolean;
    },
  ): void {
    this.pendingClick = {
      node,
      wasOnlySelectedAtPointerDown,
      isShiftClick,
      downPosition: new PIXI.Point(event.global.x, event.global.y),
    };

    if (clearExistingSelection) {
      this.selectNodes([], false);
    }
  }

  public async beginNodePointerInteraction(
    event: PIXI.FederatedPointerEvent,
  ): Promise<void> {
    if (event.altKey) {
      const pendingNode = this.pendingClick?.node;
      const shouldDuplicatePendingNode =
        pendingNode !== undefined && !this.selectedNodes.includes(pendingNode);
      const duplicatedNodes = shouldDuplicatePendingNode
        ? await PPGraph.currentGraph.perform_action_pasteNodes(
            PPGraph.currentGraph.serializeNodes([pendingNode], false),
            new PIXI.Point(24, 24),
          )
        : await PPGraph.currentGraph.duplicateSelection(new PIXI.Point(24, 24));

      this.clearPendingClick();
      this.selectNodes(duplicatedNodes, false);
      this.startDragAction(event);
      return;
    }

    this.startDragAction(event);
  }

  public resolvePendingClick(
    node: PPNode,
    event: PIXI.FederatedPointerEvent,
    onResolved: (args: {
      event: PIXI.FederatedPointerEvent;
      wasOnlySelectedAtPointerDown: boolean;
    }) => void,
  ): boolean {
    const pendingClick = this.pendingClick;
    if (!pendingClick || pendingClick.node !== node) {
      return false;
    }

    const upPosition = new PIXI.Point(event.global.x, event.global.y);
    const wasDragged =
      Math.hypot(
        upPosition.x - pendingClick.downPosition.x,
        upPosition.y - pendingClick.downPosition.y,
      ) > NODE_CLICK_DRAG_THRESHOLD_PX;

    if (!wasDragged) {
      this.selectNodes([node], pendingClick.isShiftClick);
      onResolved({
        event,
        wasOnlySelectedAtPointerDown: pendingClick.wasOnlySelectedAtPointerDown,
      });
    }

    this.clearPendingClick();
    return true;
  }

  onScaleReset = (): void => {
    const node = this.selectedNodes[0];
    if (!node) {
      return;
    }

    const argsDo = new ResizeNodeActionArgs(
      node.id,
      node.getDefaultNodeWidth(),
      node.getDefaultNodeHeight(),
    );
    const argsUndo = new ResizeNodeActionArgs(
      node.id,
      node.nodeWidth,
      node.nodeHeight,
    );
    void PNPAction(ACTIONS.RESIZE_NODE, argsDo, argsUndo);
    this.drawRectanglesFromSelection();
  };

  public setInteraction(interaction: Interaction) {
    const prevInteraction = this.interaction;

    const prevDraggingOrDrawing =
      prevInteraction == Interaction.Dragging ||
      prevInteraction == Interaction.Drawing;
    const currPrevOrDrawing =
      interaction == Interaction.Dragging || interaction == Interaction.Drawing;
    if (prevDraggingOrDrawing && !currPrevOrDrawing) {
      InterfaceController.notifyListeners(
        ListenEvent.SelectionDraggingOrDrawing,
        false,
      );
    } else if (!prevDraggingOrDrawing && currPrevOrDrawing) {
      InterfaceController.notifyListeners(
        ListenEvent.SelectionDraggingOrDrawing,
        true,
      );
    }
    switch (interaction) {
      case Interaction.Dragging: {
        this.cursor = 'move';
        break;
      }
      case Interaction.Drawing: {
        this.cursor = 'default';
        break;
      }
      case Interaction.Passive: {
        this.cursor = 'default';
        break;
      }
    }
    this.interaction = interaction;
  }

  public startDragAction(event: PIXI.FederatedPointerEvent) {
    this.setInteraction(Interaction.Dragging);
    this.sourcePoint = this.toLocal(
      new PIXI.Point(event.clientX, event.clientY),
    );
    this.lastPointMovedTo = this.sourcePoint;
    event.stopPropagation();
  }

  public stopDragAction(event) {
    this.setInteraction(Interaction.Passive);
    this.clearPendingClick();
  }

  async onPointerDown(event: PIXI.FederatedPointerEvent): Promise<void> {
    console.log('Selection: onPointerDown');
    clearDocumentSelection();
    this.viewport.plugins.resume('mouse-edges');
    const shiftKey = event.shiftKey;
    const altKey = event.altKey;

    if (shiftKey) {
      const targetPoint = this.toLocal(
        new PIXI.Point(event.clientX, event.clientY),
      );
      const selectionRect = new PIXI.Rectangle(
        targetPoint.x,
        targetPoint.y,
        1,
        1,
      );
      const newlySelectedNodes = getObjectsInsideBounds(
        Object.values(PPGraph.currentGraph.nodes),
        selectionRect,
      );
      InterfaceController.spamToast(
        `selection - node_shift_clicked ${newlySelectedNodes[0].id}`,
      );
      const differenceSelection = getDifferenceSelection(
        this.selectedNodes,
        newlySelectedNodes,
      );

      this.selectNodes(differenceSelection, false);
      this.drawRectanglesFromSelection();
    } else {
      if (altKey) {
        const duplicatedNodes = await PPGraph.currentGraph.duplicateSelection(
          new PIXI.Point(24, 24),
        );
        this.selectNodes(duplicatedNodes, false);
      }

      this.startDragAction(event);
    }
  }

  onPointerOver(): void {
    this.cursor = 'move';
  }

  onViewportMoved(): void {
    this.drawRectanglesFromSelection();
  }

  async onPointerUpAndUpOutside(event): Promise<void> {
    console.log('Selection: onPointerUpAndUpOutside');
    this.viewport.plugins.pause('mouse-edges');
    await this.stopDragAction(event);

    // we remove the fill of the selection on the nodes if its just one, so that sockets etc on it can be pressed
    this.drawRectanglesFromSelection();
  }

  onMove(event: PIXI.FederatedPointerEvent): void {
    switch (this.interaction) {
      case Interaction.Drawing: {
        // temporarily draw rectangle while dragging
        const targetPoint = this.toLocal(
          new PIXI.Point(event.clientX, event.clientY),
        );

        const selX = Math.min(this.sourcePoint.x, targetPoint.x);
        const selY = Math.min(this.sourcePoint.y, targetPoint.y);
        const selWidth = Math.max(this.sourcePoint.x, targetPoint.x) - selX;
        const selHeight = Math.max(this.sourcePoint.y, targetPoint.y) - selY;

        this.selectionIntendGraphics.clear();
        this.selectionIntendGraphics
          .rect(selX, selY, selWidth, selHeight)
          .fill({
            color: SELECTION_COLOR_HEX,
            alpha: 0.05,
          })
          .stroke({
            width: 1,
            color: SELECTION_COLOR_HEX,
            alpha: 0.8,
          });

        // bring drawing rect into node nodeContainer space
        const selectionRect = new PIXI.Rectangle(
          selX,
          selY,
          selWidth,
          selHeight,
        );

        // get differenceSelection of newlySelectedNodes and
        // previousSelectedNodes (is empty if not addToOrToggleSelection)
        const newlySelectedNodes = getObjectsInsideBounds(
          Object.values(PPGraph.currentGraph.nodes),
          selectionRect,
        );
        const differenceSelection = getDifferenceSelection(
          this.previousSelectedNodes,
          newlySelectedNodes,
        );

        this.selectNodes(differenceSelection);
        break;
      }
      case Interaction.Dragging: {
        const targetPoint = this.toLocal(
          new PIXI.Point(event.clientX, event.clientY),
        );
        const deltaX = targetPoint.x - this.lastPointMovedTo.x;
        const deltaY = targetPoint.y - this.lastPointMovedTo.y;
        this.lastPointMovedTo = targetPoint;
        void this.moveSelection(deltaX, deltaY);
        this.drawRectanglesFromSelection(); // Update visual border during drag
        break;
      }
    }
  }

  async moveSelection(deltaX: number, deltaY: number): Promise<void> {
    // Include pending click node in the drag (if not already selected)
    const pendingNode = this.pendingClick?.node;
    const nodesToMove =
      pendingNode && !this.selectedNodes.includes(pendingNode)
        ? [...this.selectedNodes, pendingNode]
        : this.selectedNodes;

    const prevPositions = nodesToMove.map(
      (node) => new PIXI.Point(node.position.x, node.position.y),
    );
    const newPositions = prevPositions.map(
      (pos) => new PIXI.Point(pos.x + deltaX, pos.y + deltaY),
    );
    const nodeIDs = nodesToMove.map((node) => node.id);
    const argsDo = {
      Nodes: nodeIDs,
      Positions: newPositions,
    };
    const argsUndo = {
      Nodes: nodeIDs,
      Positions: prevPositions,
    };
    const ID = 'MOVE_NODES_' + nodeIDs.join(',');
    await PNPAction(ACTIONS.MOVE_NODES, argsDo, argsUndo, ID);
  }

  static getNodesMinMax(nodes: PPNode[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    let minX = Number.MAX_VALUE;
    let minY = Number.MAX_VALUE;
    let maxX = -Number.MAX_VALUE;
    let maxY = -Number.MAX_VALUE;
    nodes.forEach((node) => {
      const rects = this.getValidSelectionBounds(node);
      rects.forEach((rect) => {
        minX = Math.min(minX, rect.x);
        minY = Math.min(minY, rect.y);
        maxX = Math.max(maxX, rect.x + rect.width);
        maxY = Math.max(maxY, rect.y + rect.height);
      });
    });
    return { minX, minY, maxX, maxY };
  }

  // Build the layout adjacency (edges among the selected nodes only) with the
  // socket indices the layered layout needs to order siblings by socket.
  private buildLayoutEdges(nodes: PPNode[]): LayoutEdge[] {
    const idSet = new Set(nodes.map((node) => node.id));
    const edges: LayoutEdge[] = [];
    nodes.forEach((node) => {
      // Use display order (triggers above inputs) so toIn matches where the
      // socket actually sits on the node; otherwise wires to trigger sockets are
      // ordered as if they were the bottom-most input and cross the others.
      node.getAllInputSocketsInDisplayOrder().forEach((socket, toIn) => {
        if (!socket.hasLink()) {
          return;
        }
        const sourceSocket = socket.links[0].getSource();
        const sourceNode = sourceSocket.getNode();
        if (!idSet.has(sourceNode.id)) {
          return;
        }
        edges.push({
          from: sourceNode.id,
          to: node.id,
          fromOut: sourceNode.outputSocketArray.indexOf(sourceSocket),
          toIn,
        });
      });
    });
    return edges;
  }

  async autoAlignNodes(nodes: PPNode[]): Promise<void> {
    const nonePostPassNodes = nodes.filter(
      (node) => !node.isPostPassForAutoAlign(),
    );
    if (nonePostPassNodes.length === 0) {
      return;
    }
    const { minX, minY } = PPSelection.getNodesMinMax(nonePostPassNodes);
    const positionsOld = nonePostPassNodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
    }));

    // Delegate the actual arrangement to the pure layered-layout module: it
    // assigns layers (x) by flow depth, orders siblings by socket, and centres
    // nodes on their neighbours (y) with proportional gaps for wide fans. See
    // layeredLayout.ts for the full pipeline.
    // Post-pass nodes (macros) wrap their content with padding after the layout
    // runs. Tag that content with the chrome margin so the layout reserves room
    // for the container and adjacent macros keep the full component gap instead
    // of overlapping.
    const marginById = new Map<string, number>();
    nodes
      .filter((node) => node.isPostPassForAutoAlign())
      .forEach((node) => {
        const margin = node.getAutoAlignChromeMargin();
        if (margin <= 0) {
          return;
        }
        node.getAutoAlignContentNodes().forEach((content) => {
          marginById.set(
            content.id,
            Math.max(marginById.get(content.id) ?? 0, margin),
          );
        });
      });

    const layoutNodes: LayoutNodeInput[] = nonePostPassNodes.map((node) => ({
      id: node.id,
      width: node.nodeWidth,
      height: node.nodeHeight,
      y: node.y,
      marginTop: marginById.get(node.id) ?? 0,
      marginBottom: marginById.get(node.id) ?? 0,
    }));
    const edges: LayoutEdge[] = this.buildLayoutEdges(nonePostPassNodes);
    const { positions } = computeLayeredLayout(layoutNodes, edges);

    nonePostPassNodes.forEach((node) => {
      const position = positions.get(node.id);
      if (position) {
        node.setPosition(position.x, position.y);
      }
    });

    // Anchor the arranged result back onto the selection's original top-left so
    // the nodes settle where the user was looking, not at the origin.
    const { minX: minX2, minY: minY2 } =
      PPSelection.getNodesMinMax(nonePostPassNodes);
    const diffX = minX2 - minX;
    const diffY = minY2 - minY;
    nonePostPassNodes.forEach((node) => {
      node.setPosition(node.x - diffX, node.y - diffY);
    });

    // animate them into position because we are cute like that
    const positionsNew = nonePostPassNodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
    }));
    const iterations = 10;
    for (let i = 0; i <= iterations; i++) {
      for (let j = 0; j < positionsOld.length; j++) {
        const node = PPGraph.currentGraph.nodes[positionsOld[j].id];
        const oldPosX = positionsOld[j].x;
        const oldPosY = positionsOld[j].y;
        const newPosX = positionsNew[j].x;
        const newPosY = positionsNew[j].y;
        const diffX = newPosX - oldPosX;
        const diffY = newPosY - oldPosY;
        const along = i / iterations;
        node.setPosition(oldPosX + along * diffX, oldPosY + along * diffY);
      }
      this.drawRectanglesFromSelection();
      await new Promise((resolve) => setTimeout(resolve, 16));
    }

    // post pass
    nodes
      .filter((node) => node.isPostPassForAutoAlign())
      .forEach((node) => {
        node.postPassForAutoAlign(nonePostPassNodes, iterations);
      });
    this.drawRectanglesFromSelection();
  }

  async perform_action_alignNodes(
    alignAndDistribute: TAlignOptions,
  ): Promise<void> {
    const selection = PPGraph.currentGraph.selection;
    const { minX, minY, maxX, maxY } = PPSelection.getNodesMinMax(
      selection.selectedNodes,
    );

    const nodeIDsPos = selection.selectedNodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.nodeWidth,
      height: node.nodeHeight,
    }));

    let incrementPos = 0;

    function alignNode(
      node: PPNode,
      alignAndDistribute: TAlignOptions,
      interval: number,
      index: number,
    ) {
      let x;
      let y;
      switch (alignAndDistribute) {
        case ALIGNOPTIONS.ALIGN_AUTO:
          x = minX;
          y = minY;
          break;
        case ALIGNOPTIONS.ALIGN_LEFT:
          x = minX;
          break;
        case ALIGNOPTIONS.ALIGN_CENTER_HORIZONTAL:
          x = minX + (maxX - minX) / 2 - node.nodeWidth / 2;
          break;
        case ALIGNOPTIONS.ALIGN_RIGHT:
          console.log(node.width, node.nodeWidth, node.getMinNodeWidth());
          x = maxX - node.nodeWidth;
          break;
        case ALIGNOPTIONS.ALIGN_TOP:
          y = minY;
          break;
        case ALIGNOPTIONS.ALIGN_CENTER_VERTICAL:
          y = minY + (maxY - minY) / 2 - node.nodeHeight / 2;
          break;
        case ALIGNOPTIONS.ALIGN_BOTTOM:
          y = maxY - node.nodeHeight;
          break;
        case ALIGNOPTIONS.DISTRIBUTE_HORIZONTAL:
          x = index === 0 ? minX : incrementPos + interval;
          incrementPos = x + node.nodeWidth;
          break;
        case ALIGNOPTIONS.DISTRIBUTE_VERTICAL:
          y = index === 0 ? minY : incrementPos + interval;
          incrementPos = y + node.nodeHeight;
          break;
      }
      node.setPosition(x, y);
    }

    const doAlign = async () => {
      if (alignAndDistribute === ALIGNOPTIONS.ALIGN_AUTO) {
        await this.autoAlignNodes(selection.selectedNodes);
      } else {
        const calcInterval = (min, max, sum, length) =>
          (max - min - sum) / (length - 1);

        nodeIDsPos.sort((a, b) => {
          return alignAndDistribute === ALIGNOPTIONS.DISTRIBUTE_VERTICAL
            ? a.y - b.y
            : a.x - b.x;
        });

        const sumOfWidthHeight =
          alignAndDistribute === ALIGNOPTIONS.DISTRIBUTE_VERTICAL
            ? nodeIDsPos.reduce((n, { height }) => n + height, 0)
            : nodeIDsPos.reduce((n, { width }) => n + width, 0);

        const interval =
          alignAndDistribute === ALIGNOPTIONS.DISTRIBUTE_VERTICAL
            ? calcInterval(minY, maxY, sumOfWidthHeight, nodeIDsPos.length)
            : calcInterval(minX, maxX, sumOfWidthHeight, nodeIDsPos.length);

        nodeIDsPos.forEach((idAndPos, index) => {
          const node = PPGraph.currentGraph.nodes[idAndPos.id];
          alignNode(node, alignAndDistribute, interval, index);
        });
        incrementPos = 0; // reset
      }

      selection.drawRectanglesFromSelection();
    };

    const undoAlign = (): Promise<void> => {
      nodeIDsPos.forEach((idAndPos, index) => {
        const node = PPGraph.currentGraph.nodes[idAndPos.id];
        const oldPosition = nodeIDsPos[index];
        node.setPosition(oldPosition.x, oldPosition.y);
      });
      selection.drawRectanglesFromSelection();
      return Promise.resolve();
    };

    // TODO SERIALIZED ACTION
    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(doAlign, undoAlign, 'Align node(s)'),
      ),
    );
  }

  resetAllGraphics(): void {
    this.resetGraphics(this.selectionIntendGraphics);
    this.resetGraphics(this.singleSelectionsGraphics);
    this.resetGraphics(this.focusGraphics);
    this.resetGraphics(this.selectionGraphics);
    this.selectionHeader.visible = false;
    this.scaleHandle.visible = false;
  }

  resetGraphics(graphics: PIXI.Graphics): void {
    graphics.clear();
    graphics.x = 0;
    graphics.y = 0;
    graphics.scale.x = 1;
    graphics.scale.y = 1;
  }

  drawSelectionStart(
    event: PIXI.FederatedPointerEvent,
    addToOrToggleSelection: boolean,
  ): void {
    // store selectedNodes in previousSelectedNodes
    // if addToOrToggleSelection is true
    this.previousSelectedNodes = addToOrToggleSelection
      ? this.selectedNodes
      : [];

    this.resetGraphics(this.selectionIntendGraphics);
    addToOrToggleSelection || this.resetGraphics(this.singleSelectionsGraphics);
    addToOrToggleSelection || this.resetGraphics(this.focusGraphics);
    addToOrToggleSelection || this.resetGraphics(this.selectionGraphics);

    this.setInteraction(Interaction.Drawing);
    this.sourcePoint = this.toLocal(
      new PIXI.Point(event.clientX, event.clientY),
    );
    this.lastPointMovedTo = this.sourcePoint;
  }

  drawSelectionFinish(event: PIXI.FederatedPointerEvent): void {
    const interactionPre = this.interaction;
    this.setInteraction(Interaction.Passive);
    this.selectionIntendGraphics.clear();

    // reset previousSelectedNodes
    this.previousSelectedNodes = [];

    console.log(this.selectedNodes);
    if (this.selectedNodes.length > 0) {
      this.drawRectanglesFromSelection();
    } else {
      this.resetAllGraphics();
    }
    // only trigger deselect if the mouse was not moved and onMove was not called
    const adjustedP = this.toLocal(
      new PIXI.Point(event.clientX, event.clientY),
    );
    if (
      this.sourcePoint.x === adjustedP.x &&
      this.sourcePoint.y === adjustedP.y &&
      interactionPre == Interaction.Drawing
    ) {
      console.log('deselectAllNodesAndResetSelection');
      this.deselectAllNodesAndResetSelection();
    }
    InterfaceController.notifyListeners(
      ListenEvent.SelectionChanged,
      this.selectedNodes,
    );
  }
  ROUNDNESS = 5;

  drawSingleSelections(): void {
    this.focusGraphics.clear();
    this.singleSelectionsGraphics.clear();
    this.singleSelectionsGraphics.x = 0;
    this.singleSelectionsGraphics.y = 0;

    // draw single selections
    this.selectedNodes.forEach((node) => {
      //  console.trace();
      const nodeBounds = this.getBoundsFromNodes([node]);
      if (!nodeBounds) {
        return;
      }
      this.singleSelectionsGraphics.roundRect(
        nodeBounds.x,
        nodeBounds.y,
        nodeBounds.width,
        nodeBounds.height,
        this.ROUNDNESS,
      );
    });
    this.singleSelectionsGraphics.stroke({
      width: 1 / this.viewport.scale.x,
      color: SELECTION_COLOR_HEX,
    });
  }

  public drawSingleFocus(node: PPNode): void {
    this.focusGraphics.clear();
    this.focusGraphics.x = 0;
    this.focusGraphics.y = 0;

    // draw single selections
    const nodeBounds = this.getBoundsFromNodes([node]);
    if (!nodeBounds) {
      return;
    }
    this.focusGraphics
      .roundRect(
        nodeBounds.x - 4,
        nodeBounds.y - 4,
        nodeBounds.width + 8,
        nodeBounds.height + 8,
        this.ROUNDNESS,
      )
      .fill({ color: SUCCESS_COLOR.hexNumber(), alpha: 0.15 })
      .stroke({
        width: 2,
        color: SUCCESS_COLOR.hexNumber(),
        alpha: 0.8,
        alignment: 1,
      });
  }

  public clearFocus(): void {
    this.focusGraphics.clear();
    this.focusGraphics.x = 0;
    this.focusGraphics.y = 0;
  }

  static getValidSelectionBounds(node: PPNode): PIXI.Rectangle[] {
    try {
      return node
        .getSelectionBounds()
        .filter(
          (bound): bound is PIXI.Rectangle =>
            !!bound &&
            Number.isFinite(bound.x) &&
            Number.isFinite(bound.y) &&
            Number.isFinite(bound.width) &&
            Number.isFinite(bound.height),
        );
    } catch {
      return [];
    }
  }

  getBoundsFromNodes(
    nodes: PPNode[],
    margin: number = 0,
  ): PIXI.Rectangle | undefined {
    let x = Infinity;
    let y = Infinity;
    let endX = -Infinity;
    let endY = -Infinity;
    nodes.forEach((node) => {
      const nodeBounds = PPSelection.getValidSelectionBounds(node);
      nodeBounds.forEach((nodeBound) => {
        x = Math.min(x, nodeBound.x);
        y = Math.min(y, nodeBound.y);
        endX = Math.max(endX, nodeBound.width + nodeBound.x);
        endY = Math.max(endY, nodeBound.height + nodeBound.y);
      });
    });

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return undefined;
    }

    return new PIXI.Rectangle(
      x - margin,
      y - margin,
      endX - x + margin * 2,
      endY - y + margin * 2,
    );
  }

  drawRectanglesFromSelection(): void {
    if (this.selectedNodes.length == 1) {
      this.drawSingleSelections();
    } else {
      this.focusGraphics.clear();
      this.singleSelectionsGraphics.clear();
    }
    const pendingNode = this.pendingClick?.node;
    const selectionBounds =
      this.selectedNodes.length > 0
        ? this.getBoundsFromNodes(this.selectedNodes)
        : pendingNode
          ? this.getBoundsFromNodes([pendingNode])
          : undefined;

    this.selectionGraphics.clear();
    this.selectionGraphics.x = 0;
    this.selectionGraphics.y = 0;

    if (!selectionBounds) {
      return;
    }

    this.selectionGraphics.roundRect(
      selectionBounds.x,
      selectionBounds.y,
      selectionBounds.width,
      selectionBounds.height,
      this.ROUNDNESS,
    );

    if (this.selectedNodes.length > 1) {
      this.selectionGraphics
        .fill({
          color: SELECTION_COLOR_HEX,
          alpha: PIXI_OVERLAY_ALPHA,
        })
        .stroke({
          width: 1 / this.viewport.scale.x,
          color: SELECTION_COLOR_HEX,
          alpha: 1,
        });
    }

    // Draw visual border for pending drag node
    if (pendingNode && this.isPendingSelection) {
      const pendingBounds = this.getBoundsFromNodes([pendingNode]);
      if (!pendingBounds) {
        return;
      }
      this.selectionGraphics.roundRect(
        pendingBounds.x,
        pendingBounds.y,
        pendingBounds.width,
        pendingBounds.height,
        this.ROUNDNESS,
      );
      this.selectionGraphics.stroke({
        width: 1 / this.viewport.scale.x,
        color: SELECTION_COLOR_HEX,
        alpha: 1,
      });
    }

    if (this.selectedNodes.length > 0) {
      this.selectionHeader.x = selectionBounds.x;
      this.selectionHeader.y = selectionBounds.y + selectionBounds.height + 4;

      this.selectionHeader.scale.x = 1 / this.viewport.scale.x;
      this.selectionHeader.scale.y = 1 / this.viewport.scale.y;

      this.scaleHandle.x = selectionBounds.x + selectionBounds.width;
      this.scaleHandle.y = selectionBounds.y + selectionBounds.height;
    }
  }

  isNodeSelected(node: PPNode): boolean {
    return this.selectedNodes.includes(node);
  }

  selectNodes(nodes: PPNode[], addToOrToggleSelection = false): void {
    if (addToOrToggleSelection) {
      const differenceSelection = getDifferenceSelection(
        this.selectedNodes,
        nodes,
      );
      this._selectedNodes = differenceSelection;
    } else {
      this._selectedNodes = nodes;
    }
    // show selectionHeader if there are more than 1 nodes selected
    this.selectionHeader.visible = this.selectedNodes.length > 1;
    // show scaleHandle if there is only 1 node selected
    this.scaleHandle.visible =
      this.selectedNodes.length === 1 && this.selectedNodes[0]?.allowResize();

    this.drawRectanglesFromSelection();
    InterfaceController.notifyListeners(
      ListenEvent.SelectionChanged,
      this.selectedNodes,
    );
  }

  selectAllNodes(): void {
    this.selectNodes(Object.values(PPGraph.currentGraph.nodes), false);
  }

  deselectAllNodes(): void {
    this.selectNodes([], false);
  }

  deselectAllNodesAndResetSelection(): void {
    this.resetAllGraphics();
    this.deselectAllNodes();
  }
}

class ScaleHandle extends PIXI.Graphics {
  selection: PPSelection;

  private _pointerDown: boolean;
  private _pointerDragging: boolean;
  private _pointerMoveTarget: PIXI.Container | null;
  private dragStartSize:
    | { nodeID: string; width: number; height: number }
    | undefined;

  constructor(selection: PPSelection) {
    super();

    this.eventMode = 'dynamic';

    this.selection = selection;

    this._pointerDown = false;
    this._pointerDragging = false;
    this._pointerMoveTarget = null;
    this.dragStartSize = undefined;
    this.addEventListener('pointerover', this.onPointerOver.bind(this));
    this.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.addEventListener('pointerup', this.onPointerUp.bind(this));
    this.addEventListener('pointerupoutside', this.onPointerUp.bind(this));
    this.addEventListener('click', this.onPointerClick.bind(this));

    this.onRender = () => {
      this.drawScaleHandle();
    };

    // im also never cleared, I also live forever
    InterfaceController.addListener(
      ListenEvent.GlobalPointerMove,
      this.onPointerMove.bind(this),
    );
  }

  drawScaleHandle(): void {
    this.clear();
    this.rect(
      0,
      0,
      SCALEHANDLE_SIZE / this.selection.viewport.scale.x,
      SCALEHANDLE_SIZE / this.selection.viewport.scale.y,
    )
      .fill({ color: WHITE_HEX })
      .stroke({
        width: 1 / this.selection.viewport.scale.x,
        color: SELECTION_COLOR_HEX,
      });
  }

  protected onPointerOver(event: PIXI.FederatedPointerEvent): void {
    //event.stopPropagation();
    this.cursor = 'nwse-resize';
  }

  protected onPointerDown(event: PIXI.FederatedPointerEvent): void {
    clearDocumentSelection();
    this._pointerDown = true;
    this._pointerDragging = false;

    event.stopPropagation();

    if (this._pointerMoveTarget) {
      this._pointerMoveTarget = null;
    }

    this._pointerMoveTarget = this;
  }

  protected onPointerMove(event: PIXI.FederatedPointerEvent): void {
    if (!this._pointerDown) {
      return;
    }

    if (this._pointerDragging) {
      this.onDrag(event);
    } else {
      this.onDragStart(event);
    }

    event.stopPropagation();
  }

  protected onPointerUp(event: PIXI.FederatedPointerEvent): void {
    if (this._pointerDragging) {
      this.onDragEnd(event);
    }

    this._pointerDown = false;

    if (this._pointerMoveTarget) {
      this._pointerMoveTarget = null;
    }
  }

  protected onPointerClick(event: PIXI.FederatedPointerEvent): void {
    // check if double clicked
    if (event.detail === ONCLICK_DOUBLECLICK) {
      event.stopPropagation();
      this.selection.onScaleReset();
    }
  }

  protected onDragStart(event: PIXI.FederatedPointerEvent): void {
    this._pointerDragging = true;
    const node = this.selection.selectedNodes[0];
    this.dragStartSize = node
      ? {
          nodeID: node.id,
          width: node.nodeWidth,
          height: node.nodeHeight,
        }
      : undefined;
  }

  protected onDrag(event: PIXI.FederatedPointerEvent): void {
    // possible to get here if you do cursed things
    if (this.selection.selectedNodes.length == 0) {
      this._pointerDragging = false;
      return;
    }
    const adjustedP = this.selection.toLocal(
      new PIXI.Point(event.clientX, event.clientY),
    );

    const pointerPosition = new PIXI.Point(
      adjustedP.x - PPNode.EXTRA_NODE_SELECTION_MARGIN,
      adjustedP.y - PPNode.EXTRA_NODE_SELECTION_MARGIN,
    );
    const shiftKeyPressed = event.shiftKey;

    this.selection.selectedNodes[0].onBeingScaled(
      Math.abs(pointerPosition.x - this.selection.selectedNodes[0].x),
      Math.abs(pointerPosition.y - this.selection.selectedNodes[0].y),
      shiftKeyPressed,
    );
  }

  protected onDragEnd(_: PIXI.FederatedPointerEvent): void {
    const node = this.selection.selectedNodes[0];
    if (
      node &&
      this.dragStartSize &&
      this.dragStartSize.nodeID === node.id &&
      (node.nodeWidth !== this.dragStartSize.width ||
        node.nodeHeight !== this.dragStartSize.height)
    ) {
      const argsDo = new ResizeNodeActionArgs(
        node.id,
        node.nodeWidth,
        node.nodeHeight,
      );
      const argsUndo = new ResizeNodeActionArgs(
        node.id,
        this.dragStartSize.width,
        this.dragStartSize.height,
      );
      void PNPAction(ACTIONS.RESIZE_NODE, argsDo, argsUndo);
    }
    this.dragStartSize = undefined;
    this._pointerDragging = false;
  }
}
