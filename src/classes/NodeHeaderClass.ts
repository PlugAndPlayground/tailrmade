import * as PIXI from 'pixi.js';
import PPGraph from './GraphClass';
import Button from './ButtonClass';
import PPNode from './NodeClass';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import {
  EDIT_ICON_TEXTURE,
  ICON_BADGE_GAP,
  ICON_BADGE_BUTTON_DEFAULT_ALPHA,
  ICON_BADGE_BUTTON_HOVER_ALPHA,
  ICON_BADGE_ICON_TINT,
  ICON_BADGE_SIZE,
  ICON_BADGE_SVG_RESOLUTION,
  SELECTION_DOWNSTREAM_TEXTURE,
  SELECTION_UPSTREAM_TEXTURE,
  SELECTION_WHOLE_TEXTURE,
  ADD_TO_DASHBOARD_ICON_TEXTURE,
  CONFIRMATION_ICON_TEXTURE,
} from '../utils/constants';
import { VISIBILITY_ACTION } from '../utils/constants_shared';
import FlowLogic from './FlowLogic';

const HEADER_BUTTON_OPTIONS = {
  badge: true,
  tint: ICON_BADGE_ICON_TINT,
  defaultAlpha: ICON_BADGE_BUTTON_DEFAULT_ALPHA,
  hoverAlpha: ICON_BADGE_BUTTON_HOVER_ALPHA,
  svgResolution: ICON_BADGE_SVG_RESOLUTION,
} as const;

export default class NodeHeaderClass extends PIXI.Container {
  _selectDownstreamBranchButton!: Button;
  _selectUpstreamBranchButton!: Button;
  _selectWholeBranchButton!: Button;
  _editNodeButton!: Button;
  _addToDashboardButton!: Button;
  _confirmAddToDashboardButton!: Button;
  _showingConfirmation: boolean = false;

  constructor() {
    super();
  }

  private createHeaderButton(texture: string): Promise<Button> {
    return Button.create(texture, ICON_BADGE_SIZE, HEADER_BUTTON_OPTIONS);
  }

  private async createBranchButton(
    texture: string,
    up: boolean,
    down: boolean,
  ): Promise<Button> {
    const button = await this.createHeaderButton(texture);
    button.addEventListener('pointerdown', (e) =>
      this.onPointerDown(e, up, down),
    );
    return button;
  }

  private getButtonX(index: number): number {
    return (ICON_BADGE_SIZE + ICON_BADGE_GAP) * index;
  }

  async init(): Promise<void> {
    this.name = 'headerGraphics';
    this._selectUpstreamBranchButton = await this.createBranchButton(
      SELECTION_UPSTREAM_TEXTURE,
      true,
      false,
    );
    this._selectWholeBranchButton = await this.createBranchButton(
      SELECTION_WHOLE_TEXTURE,
      true,
      true,
    );
    this._selectDownstreamBranchButton = await this.createBranchButton(
      SELECTION_DOWNSTREAM_TEXTURE,
      false,
      true,
    );
    this._editNodeButton = await this.createHeaderButton(EDIT_ICON_TEXTURE);
    this._editNodeButton.addEventListener(
      'pointerdown',
      this.editNodeMouseDown.bind(this),
    );

    this._addToDashboardButton = await this.createHeaderButton(
      ADD_TO_DASHBOARD_ICON_TEXTURE,
    );
    this._addToDashboardButton.addEventListener(
      'pointerdown',
      this.addToDashboardMouseDown.bind(this),
    );
    this._addToDashboardButton.addEventListener('pointerup', (e) => {
      e.stopPropagation();
    });

    this._confirmAddToDashboardButton = await this.createHeaderButton(
      CONFIRMATION_ICON_TEXTURE,
    );
    this._confirmAddToDashboardButton.addEventListener(
      'pointerdown',
      this.confirmAddToDashboardMouseDown.bind(this),
    );
    this._confirmAddToDashboardButton.visible = false;
    this._confirmAddToDashboardButton.addEventListener('pointerout', (e) => {
      e.stopPropagation();
      this.hideAddToDashboardConfirmation();
    });
    this._confirmAddToDashboardButton.addEventListener('pointerup', (e) => {
      e.stopPropagation();
    });

    this.addChild(this._selectUpstreamBranchButton);
    this.addChild(this._selectWholeBranchButton);
    this.addChild(this._selectDownstreamBranchButton);
    this.addChild(this._editNodeButton);
    this.addChild(this._addToDashboardButton);
    this.addChild(this._confirmAddToDashboardButton);

    this._selectUpstreamBranchButton.x = this.getButtonX(0);
    this._selectWholeBranchButton.x = this.getButtonX(1);
    this._selectDownstreamBranchButton.x = this.getButtonX(2);
    this._editNodeButton.x = this.getButtonX(3);
    this._addToDashboardButton.x = this.getButtonX(4);
    this._confirmAddToDashboardButton.x = this.getButtonX(4);

    this.redrawAnythingChanging();
  }

  public redrawAnythingChanging(hoverNode = false): void {
    // Don't redraw if state has not changed
    if (this.visible === (hoverNode ? true : false)) {
      return;
    }

    this.visible = false;
    if (hoverNode) {
      this.visible = true;
    }

    // Hide dashboard button if node is not layoutable
    const node = this.parent?.parent as PPNode;
    this._addToDashboardButton.visible =
      node?.isLayoutable() && !this._showingConfirmation;
  }

  onPointerDown(
    event: PIXI.FederatedPointerEvent,
    up: boolean,
    down: boolean,
  ): void {
    event.stopPropagation();
    const altKey = event.altKey;
    const node = this.parent?.parent as PPNode;
    const graph = PPGraph.currentGraph;
    graph.selection.selectNodes(
      Object.values(FlowLogic.getAllUpDownstreamNodes(node, up, down, altKey)),
    );
  }

  editNodeMouseDown(): void {
    const node = this.parent?.parent as PPNode;

    if (node.selected) {
      InterfaceController.toggleRightSideDrawer(VISIBILITY_ACTION.TOGGLE);
    } else {
      PPGraph.currentGraph.selection.selectNodes([node], false);
      InterfaceController.toggleRightSideDrawer(VISIBILITY_ACTION.OPEN);
    }
  }

  addToDashboardMouseDown(e: PIXI.FederatedPointerEvent): void {
    e.stopPropagation();
    this.showAddToDashboardConfirmation();
  }

  showAddToDashboardConfirmation(): void {
    if (!this._showingConfirmation) {
      this._showingConfirmation = true;
      this._addToDashboardButton.visible = false;
      this._confirmAddToDashboardButton.visible = true;
    }
  }

  hideAddToDashboardConfirmation(): void {
    if (this._showingConfirmation) {
      this._showingConfirmation = false;
      this._confirmAddToDashboardButton.visible = false;
      this._addToDashboardButton.visible = true;
    }
  }

  confirmAddToDashboardMouseDown(e: PIXI.FederatedPointerEvent): void {
    e.stopPropagation();
    this.hideAddToDashboardConfirmation();

    const node = this.parent?.parent as PPNode;
    if (node?.isLayoutable()) {
      InterfaceController.notifyListeners(
        ListenEvent.AddToDashboard,
        node as any,
      );
    }
  }

  public getButtonByName(buttonName: string): Button | null {
    switch (buttonName) {
      case 'selectUpstream':
        return this._selectUpstreamBranchButton;
      case 'selectWhole':
        return this._selectWholeBranchButton;
      case 'selectDownstream':
        return this._selectDownstreamBranchButton;
      case 'edit':
        return this._editNodeButton;
      case 'addToDashboard':
        return this._addToDashboardButton;
      case 'confirmAddToDashboard':
        return this._confirmAddToDashboardButton;
      default:
        return null;
    }
  }

  // visible including all ancestors (PIXI v8 has no worldVisible anymore);
  // an invisible button never receives pointer events, so callers must not
  // click before this returns true
  public isButtonVisible(buttonName: string): boolean {
    const button = this.getButtonByName(buttonName);
    if (!button) return false;
    let current: PIXI.Container | null = button;
    while (current) {
      if (!current.visible) return false;
      current = current.parent;
    }
    return true;
  }

  public screenPointButtonCenter(buttonName: string): PIXI.Point | null {
    const button = this.getButtonByName(buttonName);
    if (!button) return null;

    // getGlobalPosition is in screen space, but width/height are in world
    // units, so the half extents must be scaled by the viewport zoom
    const scale = PPGraph.currentGraph.viewportScaleX;
    const globalPos = button.getGlobalPosition();
    return new PIXI.Point(
      globalPos.x + (button.width * scale) / 2,
      globalPos.y + (button.height * scale) / 2,
    );
  }
}
