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
// enough that a white title reads on the full-colour header. Ordered so
// neighbours contrast, as new groups take them in turn.
export const GROUP_COLORS = [
  '#3E54A3',
  '#B0683A',
  '#40A577',
  '#A43F6C',
  '#4092A4',
  '#A58E43',
  '#5F3EA3',
  '#4E9A4C',
  '#A45140',
  '#3C7DB0',
  '#7BA442',
  '#8B45A0',
  '#2E7D6B',
  '#A8394A',
  '#7A604C',
  '#5A6372',
];

// on top of the margin node selection bounds already include
export const GROUP_PADDING = 8;
export const GROUP_HEADER_HEIGHT = 32;
const GROUP_BORDER_HIT_WIDTH = 8;
const GROUP_CORNER_RADIUS = 0;
const GROUP_BACKGROUND_ALPHA = 0.12;
const GROUP_TITLE_FONT_SIZE = 15;
// below this zoom the header shrinks with the content again, so it never
// grows into the space above the group by more than the gap between sections
const GROUP_HEADER_MIN_ZOOM = 0.10;
const GROUP_TITLE_MARGIN = 12;

export default class PPGroup extends PIXI.Container {
  id: string;
  name: string;
  color: string;
  nodeIds: string[];

  private graphics = new PIXI.Graphics();
  private titleText = new PIXI.Text({
    style: { fontSize: GROUP_TITLE_FONT_SIZE },
    resolution: TEXT_RESOLUTION,
  });
  // what was last drawn, so hit testing does not recompute member bounds on
  // every pointer move
  private frame = new PIXI.Rectangle();
  private header = new PIXI.Rectangle();

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

  // The frame layout works with. Its header part has a fixed size, so layouts
  // do not depend on the current zoom.
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
    this.header = new PIXI.Rectangle(
      x,
      y + GROUP_HEADER_HEIGHT - headerHeight,
      Math.max(
        width,
        this.titleText.width + GROUP_TITLE_MARGIN * headerScale * 2,
      ),
      headerHeight,
    );
    this.titleText.x = x + GROUP_TITLE_MARGIN * headerScale;
    this.titleText.y = this.header.y + headerHeight / 2;

    this.graphics
      .clear()
      .roundRect(x, y, width, height, GROUP_CORNER_RADIUS)
      .fill({ color: color.hexNumber(), alpha: GROUP_BACKGROUND_ALPHA })
      // .stroke({ width: 2, color: color.hexNumber() })
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
