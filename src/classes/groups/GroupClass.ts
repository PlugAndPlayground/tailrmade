import * as PIXI from 'pixi.js';
import PPGraph from '../GraphClass';
import PPNode from '../NodeClass';
import PPSelection from '../selection/SelectionClass';
import { PNPHitArea } from '../selection/PNPHitArea';
import { TRgba } from '../../utils/color';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import {
  COLORIZE_ICON_TEXTURE,
  ICON_BADGE_SVG_RESOLUTION,
  TEXT_RESOLUTION,
} from '../../utils/constants';
import { SerializedGroup } from '../../utils/interfaces';
import { isDoubleActivation } from '../../utils/touchGestures';
import { isCanvasExploreOnly } from '../../utils/stackLayout';
import { updateGroup } from './groupActions';

// Muted enough that a tinted background stays calm behind nodes, saturated
// enough that a white title reads on the full-colour header. Ordered so
// neighbours contrast, as new groups take them in turn.
// export const GROUP_COLORS = [
//   '#3E54A3',
//   '#B0683A',
//   '#40A577',
//   '#A43F6C',
//   '#4092A4',
//   '#A58E43',
//   '#5F3EA3',
//   '#4E9A4C',
//   '#A45140',
//   '#3C7DB0',
//   '#7BA442',
//   '#8B45A0',
//   '#2E7D6B',
//   '#A8394A',
//   '#7A604C',
//   '#5A6372',
// ];

export const GROUP_COLORS = [
  '#FFA48D',
  '#FFAE6B',
  '#E7BF57',
  '#BDD069',
  '#7DDD9C',
  '#4CDFC4',
  '#35DCE9',
  '#60D2FF',
  '#97C3FF',
  '#C0B6FF',
  '#E2ABFF',
  '#FFA0D3',
  '#BBC5D4',
  '#CFC2B4',
  '#C3C2D3',
  '#C9C4B3',
];

// on top of the margin node selection bounds already include
export const GROUP_PADDING = 8;
export const GROUP_HEADER_HEIGHT = 32;
const GROUP_BORDER_HIT_WIDTH = 8;
const GROUP_CORNER_RADIUS = 0;
const GROUP_BACKGROUND_ALPHA = 0.3;
const GROUP_TITLE_FONT_SIZE = 15;
// below this zoom the header shrinks with the content again, so it never
// grows into the space above the group by more than the gap between sections
const GROUP_HEADER_MIN_ZOOM = 0.1;
const GROUP_TITLE_MARGIN = 12;
const GROUP_COLOR_ICON_SIZE = 18;
const GROUP_DROP_TARGET_STROKE = 4;

export default class PPGroup extends PIXI.Container {
  id: string;
  name: string;
  color: string;
  nodeIds: string[];
  // nodes dragged over it would join it on drop
  isDropTarget = false;

  private graphics = new PIXI.Graphics();
  private titleText = new PIXI.Text({
    style: { fontSize: GROUP_TITLE_FONT_SIZE },
    resolution: TEXT_RESOLUTION,
  });
  // what was last drawn, so hit testing does not recompute member bounds on
  // every pointer move
  private frame = new PIXI.Rectangle();
  private header = new PIXI.Rectangle();
  private colorIcon = new PIXI.Sprite();

  constructor(data: SerializedGroup) {
    super();
    this.id = data.id;
    this.name = data.name;
    this.color = data.color;
    this.nodeIds = data.nodeIds;
    this.label = `group_${data.id}`;

    this.titleText.anchor.y = 0.5;
    this.addChild(this.graphics, this.titleText, this.colorIcon);
    void PIXI.Assets.load({
      src: COLORIZE_ICON_TEXTURE,
      data: {
        resolution: ICON_BADGE_SVG_RESOLUTION,
        parseAsGraphicsContext: false,
      },
    }).then((texture: PIXI.Texture) => {
      this.colorIcon.texture = texture;
      // the group can be gone by the time the icon has loaded
      if (!this.destroyed) {
        this.draw();
      }
    });
    this.interactiveChildren = false;
    this.eventMode = 'static';
    this.cursor = 'move';
    // only the header and the border react, so clicks inside the group still
    // reach the canvas (marquee selection, panning, double-click search)
    this.hitArea = new PNPHitArea((x, y) => this.isOnHeaderOrBorder(x, y));

    this.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.addEventListener('pointermove', this.onPointerMove.bind(this));
    this.addEventListener('pointertap', this.onPointerTap.bind(this));
    this.addEventListener('pointerup', this.onPointerUp.bind(this));
    this.addEventListener('pointerupoutside', this.onPointerUp.bind(this));
  }

  serialize(): SerializedGroup {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      nodeIds: [...this.nodeIds],
    };
  }

  getMembers(): PPNode[] {
    return this.nodeIds.map((id) => PPGraph.currentGraph.nodes[id]);
  }

  // The frame layout works with. Its header part has a fixed size, so layouts
  // do not depend on the current zoom.
  // selected means exactly its members are, e.g. after clicking its header
  isSelected(): boolean {
    const selectedNodes = PPGraph.currentGraph.selection.selectedNodes;
    return (
      selectedNodes.length === this.nodeIds.length &&
      selectedNodes.every((node) => this.nodeIds.includes(node.id))
    );
  }

  getFrame(): PIXI.Rectangle {
    const { minX, minY, maxX, maxY } = PPSelection.getNodesMinMax(
      this.getMembers(),
    );
    return new PIXI.Rectangle(
      minX - GROUP_PADDING,
      minY - GROUP_PADDING - GROUP_HEADER_HEIGHT,
      maxX - minX + GROUP_PADDING * 2,
      maxY - minY + GROUP_PADDING * 2 + GROUP_HEADER_HEIGHT,
    );
  }

  // The header keeps its 100% size on screen while zooming out to
  // GROUP_HEADER_MIN_ZOOM, so titles stay readable as labels for an overview of
  // an app. It grows upwards and widens to fit the title.
  getHeader(): PIXI.Rectangle {
    return this.header;
  }

  private getHeaderScale(): number {
    const zoom = PPGraph.currentGraph.viewportScaleX;
    return 1 / Math.min(Math.max(zoom, GROUP_HEADER_MIN_ZOOM), 1);
  }

  draw(): void {
    this.frame = this.getFrame();
    const { x, y, width, height } = this.frame;
    const headerScale = this.getHeaderScale();
    const color = TRgba.fromString(this.color);

    this.titleText.text = this.name;
    this.titleText.style.fill = color.getContrastTextColor().hexNumber();
    this.titleText.scale.set(headerScale);

    const headerHeight = GROUP_HEADER_HEIGHT * headerScale;
    const margin = GROUP_TITLE_MARGIN * headerScale;
    const iconSize = GROUP_COLOR_ICON_SIZE * headerScale;
    // room for the colour icon is kept even while it is hidden, so the header
    // does not change width when the group gets selected
    this.header = new PIXI.Rectangle(
      x,
      y + GROUP_HEADER_HEIGHT - headerHeight,
      Math.max(width, this.titleText.width + margin * 3 + iconSize),
      headerHeight,
    );
    this.titleText.x = x + margin;
    this.titleText.y = this.header.y + headerHeight / 2;

    this.colorIcon.visible = this.isSelected();
    this.colorIcon.tint = color.getContrastTextColor().hexNumber();
    this.colorIcon.setSize(iconSize);
    this.colorIcon.x = this.header.right - margin - iconSize;
    this.colorIcon.y = this.header.y + (headerHeight - iconSize) / 2;

    this.graphics
      .clear()
      .roundRect(x, y, width, height, GROUP_CORNER_RADIUS)
      .fill({ color: color.hexNumber(), alpha: GROUP_BACKGROUND_ALPHA });
    if (this.isDropTarget) {
      this.graphics.stroke({
        width: GROUP_DROP_TARGET_STROKE * headerScale,
        color: color.hexNumber(),
      });
    }
    this.graphics
      .roundRect(
        this.header.x,
        this.header.y,
        this.header.width,
        headerHeight,
        GROUP_CORNER_RADIUS,
      )
      // square off the header's bottom corners
      .rect(
        x,
        y + GROUP_HEADER_HEIGHT - GROUP_CORNER_RADIUS,
        width,
        GROUP_CORNER_RADIUS,
      )
      .fill(color.hexNumber());
  }

  isOnHeader(x: number, y: number): boolean {
    return this.header.contains(x, y);
  }

  getColorIconRect(): PIXI.Rectangle {
    const { x, y, width, height } = this.colorIcon;
    return new PIXI.Rectangle(x, y, width, height);
  }

  isOnColorIcon(x: number, y: number): boolean {
    return this.colorIcon.visible && this.getColorIconRect().contains(x, y);
  }

  private isOnHeaderOrBorder(x: number, y: number): boolean {
    const outer = this.frame.clone().pad(GROUP_BORDER_HIT_WIDTH / 2);
    const inner = this.frame.clone().pad(-GROUP_BORDER_HIT_WIDTH / 2);
    return (
      this.isOnHeader(x, y) || (outer.contains(x, y) && !inner.contains(x, y))
    );
  }

  private onPointerDown(event: PIXI.FederatedPointerEvent): void {
    // the right button falls through so the viewport can still pan from here;
    // the context menu comes from the viewport's rightclick handler
    if (isCanvasExploreOnly() || event.button === 2) {
      return;
    }
    event.stopPropagation();
    const point = PPGraph.currentGraph.viewport.toWorld(event.global);
    if (this.isOnColorIcon(point.x, point.y)) {
      InterfaceController.notifyListeners(
        ListenEvent.GroupColorPickerRequested,
        { groupId: this.id, x: event.global.x, y: event.global.y },
      );
      return;
    }
    const selection = PPGraph.currentGraph.selection;
    selection.selectNodes(this.getMembers(), false);
    selection.startDragAction(event);
  }

  private onPointerMove(event: PIXI.FederatedPointerEvent): void {
    const point = PPGraph.currentGraph.viewport.toWorld(event.global);
    this.cursor = this.isOnColorIcon(point.x, point.y) ? 'pointer' : 'move';
  }

  private onPointerUp(event: PIXI.FederatedPointerEvent): void {
    PPGraph.currentGraph.selection.stopDragAction(event);
  }

  private onPointerTap(event: PIXI.FederatedPointerEvent): void {
    // keep the viewport from treating this as a double-click on the canvas
    event.stopPropagation();
    const point = PPGraph.currentGraph.viewport.toWorld(event.global);
    if (
      !isCanvasExploreOnly() &&
      isDoubleActivation(event) &&
      this.isOnHeader(point.x, point.y)
    ) {
      this.editTitle();
    }
  }

  editTitle(): void {
    const graph = PPGraph.currentGraph;
    const scale = graph.viewportScaleX;
    const screenScale = scale * this.getHeaderScale();
    const canvasRect = graph.app.canvas.getBoundingClientRect();
    const topLeft = graph.viewport.toScreen(this.header.x, this.header.y);
    const color = TRgba.fromString(this.color);

    const input = document.createElement('input');
    input.id = 'group-title-input';
    input.value = this.name;
    Object.assign(input.style, {
      position: 'fixed',
      left: `${canvasRect.left + topLeft.x}px`,
      top: `${canvasRect.top + topLeft.y}px`,
      width: `${this.header.width * scale}px`,
      height: `${this.header.height * scale}px`,
      padding: `0 ${GROUP_TITLE_MARGIN * screenScale}px`,
      boxSizing: 'border-box',
      font: `bold ${GROUP_TITLE_FONT_SIZE * screenScale}px sans-serif`,
      color: color.getContrastTextColor().hex(),
      background: color.hex(),
      border: 'none',
      outline: 'none',
      zIndex: '1300',
    });

    let cancelled = false;
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        cancelled = event.key === 'Escape';
        input.blur();
      }
    });
    input.addEventListener('blur', () => {
      input.remove();
      this.titleText.visible = true;
      const name = input.value.trim();
      if (!cancelled && name && name !== this.name) {
        void updateGroup(this.id, { name });
      }
    });

    this.titleText.visible = false;
    document.body.appendChild(input);
    input.focus();
    input.select();
  }
}
