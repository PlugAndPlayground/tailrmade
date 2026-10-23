import * as PIXI from 'pixi.js';
import PPGraph from '../GraphClass';
import PPNode from '../NodeClass';
import PPSelection from '../selection/SelectionClass';
import { PNPHitArea } from '../selection/PNPHitArea';
import { TRgba } from '../../utils/color';
import { TEXT_RESOLUTION } from '../../utils/constants';
import { SerializedGroup } from '../../utils/interfaces';
import { isDoubleActivation } from '../../utils/touchGestures';
import { isCanvasExploreOnly } from '../../utils/stackLayout';
import { updateGroup } from './groupActions';

// Muted enough that a tinted background stays calm behind nodes, saturated
// enough that a white title reads on the full-colour header
export const GROUP_COLORS = [
  '#3E54A3',
  '#4092A4',
  '#40A577',
  '#7BA442',
  '#A58E43',
  '#A45140',
  '#A43F6C',
  '#5F3EA3',
  '#5A6372',
];

// on top of the margin node selection bounds already include
export const GROUP_PADDING = 8;
export const GROUP_HEADER_HEIGHT = 32;
const GROUP_BORDER_HIT_WIDTH = 8;
const GROUP_CORNER_RADIUS = 8;
const GROUP_BACKGROUND_ALPHA = 0.12;
const GROUP_TITLE_FONT_SIZE = 15;
const GROUP_TITLE_MARGIN = 12;

export default class PPGroup extends PIXI.Container {
  id: string;
  name: string;
  color: string;
  nodeIds: string[];

  private graphics = new PIXI.Graphics();
  private titleText = new PIXI.Text({
    style: { fontSize: GROUP_TITLE_FONT_SIZE, fontWeight: 'bold' },
    resolution: TEXT_RESOLUTION,
  });
  // what was last drawn, so hit testing does not recompute member bounds on
  // every pointer move
  private frame = new PIXI.Rectangle();

  constructor(data: SerializedGroup) {
    super();
    this.id = data.id;
    this.name = data.name;
    this.color = data.color;
    this.nodeIds = data.nodeIds;
    this.label = `group_${data.id}`;

    this.titleText.anchor.y = 0.5;
    this.addChild(this.graphics, this.titleText);
    this.interactiveChildren = false;
    this.eventMode = 'static';
    this.cursor = 'move';
    // only the header and the border react, so clicks inside the group still
    // reach the canvas (marquee selection, panning, double-click search)
    this.hitArea = new PNPHitArea((x, y) => this.isOnHeaderOrBorder(x, y));

    this.addEventListener('pointerdown', this.onPointerDown.bind(this));
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

  draw(): void {
    this.frame = this.getFrame();
    const { x, y, width, height } = this.frame;
    const color = TRgba.fromString(this.color);
    this.graphics
      .clear()
      .roundRect(x, y, width, height, GROUP_CORNER_RADIUS)
      .fill({ color: color.hexNumber(), alpha: GROUP_BACKGROUND_ALPHA })
      .stroke({ width: 2, color: color.hexNumber() })
      .roundRect(x, y, width, GROUP_HEADER_HEIGHT, GROUP_CORNER_RADIUS)
      // square off the header's bottom corners
      .rect(
        x,
        y + GROUP_HEADER_HEIGHT - GROUP_CORNER_RADIUS,
        width,
        GROUP_CORNER_RADIUS,
      )
      .fill(color.hexNumber());

    this.titleText.text = this.name;
    this.titleText.style.fill = color.getContrastTextColor().hexNumber();
    this.titleText.x = x + GROUP_TITLE_MARGIN;
    this.titleText.y = y + GROUP_HEADER_HEIGHT / 2;
  }

  isOnHeader(x: number, y: number): boolean {
    const { left, right, top } = this.frame;
    return (
      x >= left && x <= right && y >= top && y <= top + GROUP_HEADER_HEIGHT
    );
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
    const selection = PPGraph.currentGraph.selection;
    selection.selectNodes(this.getMembers(), false);
    selection.startDragAction(event);
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
    const canvasRect = graph.app.canvas.getBoundingClientRect();
    const topLeft = graph.viewport.toScreen(this.frame.x, this.frame.y);
    const color = TRgba.fromString(this.color);

    const input = document.createElement('input');
    input.id = 'group-title-input';
    input.value = this.name;
    Object.assign(input.style, {
      position: 'fixed',
      left: `${canvasRect.left + topLeft.x}px`,
      top: `${canvasRect.top + topLeft.y}px`,
      width: `${this.frame.width * scale}px`,
      height: `${GROUP_HEADER_HEIGHT * scale}px`,
      padding: `0 ${GROUP_TITLE_MARGIN * scale}px`,
      boxSizing: 'border-box',
      font: `bold ${GROUP_TITLE_FONT_SIZE * scale}px sans-serif`,
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
