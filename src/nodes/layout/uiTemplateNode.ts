// The UI template frame, inverted like a Macro: parameter OUTPUTS on the left
// block and the UI INPUT on the right, so wires read left to right through the
// nodes inside. Its body is whatever UI surface is plugged into "UI".
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { registerTemplateBody } from './templateInstancing';
import { TRgba } from '../../utils/color';
import { AGENT_DOCS_HEADING } from '../../utils/nodeDocs';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import {
  templateParameterPrefixName,
  templateOutputPrefixName,
  templateSocketName,
  templateUISocketName,
} from '../../utils/constants_shared';
import { AnyType } from '../datatypes/anyType';
import { DeferredReactType } from '../datatypes/deferredHtmlType';
import { deSerializeType, serializeType } from '../datatypes/typehelper';
import type { TemplatePlacementNode } from './templatePlacement';
import type { UISurfaceNode } from './uiSurface';
import { isSurfaceNode } from '../../utils/interfaces';
import { MacroFrame } from '../macro/macroFrame';

export function getTemplates(): UITemplate[] {
  return Object.values(PPGraph.currentGraph?.nodes ?? {}).filter(
    (node): node is UITemplate => node instanceof UITemplate,
  );
}

export class UITemplate extends MacroFrame {
  // what this template's passes run, see registerTemplateBody
  bodyNodes: PPNode[] = [];
  // the end of the last pass queued, see runTemplateAsInstance
  passQueue: Promise<unknown> = Promise.resolve();
  // true while a pass runs, see TemplatePlacementNode.execute
  passRunning = false;

  public getName(): string {
    return 'UI template';
  }

  public getDescription(): string {
    return 'Wrap a piece of UI into a template and place it as often as you want';
  }

  public getDocs(): string {
    return `A block you build a piece of reusable UI inside, shaped like a Macro.

Drop the nodes that make up the UI inside the frame, arrange them on a UI
surface as usual, and plug that surface's "ReactUI" output into the template's
"${templateUISocketName}" input on the right.

Anything the template should differ by - a city, a title, a number - comes out
of a "${templateParameterPrefixName}" socket on the left: wire it into the
input that should change. A fresh parameter appears as soon as you use the last
one, and each takes the name of the socket it feeds.

Place it with "Place template", once per copy you want. Each placement has its
own parameter values and renders on its own; the nodes inside the frame are
shared, so a change to the template shows up in every placement.

To show it once per entry of an array or object, use "Repeat template" instead.

A viewer's change to a widget inside a placement stays in that placement. To show
or hide a widget per placement, wire a test of a parameter into that widget's
"visible" socket on the surface. A value to hand back goes into an
"${templateOutputPrefixName}" socket on the right block, and placements expose it.

A template cannot place itself, directly or through another template. Placing a
different template inside one works, and an edit in the nested placement stays
in the outer row it was made in: it is kept in the outer placement's Edits.

${AGENT_DOCS_HEADING}
Templates are referenced by NAME, which is kept unique across templates, so give
each a distinct name with set_node_name and read the final name back with
inspect_nodes. Prefer a template over duplicating widgets per row or wiring
per-row widget nodes by hand.

Build order, all with the ordinary tools:
1. add_node "UI template", "UI surface", and the widgets. Give the widgets the
   defaults every placement should start from.
2. connect_sockets each widget's ReactUI to the surface, and the surface's ReactUI
   to the template's "${templateUISocketName}". Arrange that surface as usual with
   set_surface_layout; it is the template's body, so connect it to nothing else.
3. connect_sockets from the template's "${templateParameterPrefixName} 1" to each
   input that should differ. One parameter can feed several inputs, and a spare
   "${templateParameterPrefixName} 2" appears once the first is used.
4. add_node "Place template" or "Repeat template", set_socket_value its
   "${templateSocketName}" to the template's name, then connect its ReactUI to the
   surface the app shows.

Inner nodes are shared, and run once per placement or row, so never read a row's
value from an inner node's socket: it holds whichever row ran last. Read a Repeat
Template's "Output" instead.`;
  }

  public getTags(): string[] {
    return ['Template', 'Layout', 'UI'];
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.LAYOUT);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.OUT,
        `${templateParameterPrefixName} 1`,
        new AnyType(),
      ),
      new Socket(SOCKET_TYPE.IN, templateUISocketName, new DeferredReactType()),
      new Socket(
        SOCKET_TYPE.IN,
        `${templateOutputPrefixName} 1`,
        new AnyType(),
      ),
    ];
  }

  public getParameterSockets(): Socket[] {
    return this.outputSocketArray.filter((socket) =>
      socket.name.startsWith(templateParameterPrefixName),
    );
  }

  // What a placement produces: the nodes inside feed these, and a placement
  // exposes one output per declared one.
  public getOutputSockets(): Socket[] {
    return this.inputSocketArray.filter((socket) =>
      socket.name.startsWith(templateOutputPrefixName),
    );
  }

  // Only the wired ones: counting the spare at the end would make a
  // single-output template look like it has two.
  public readOutputs(): Record<string, unknown> {
    return Object.fromEntries(
      this.getOutputSockets()
        .filter((socket) => socket.hasLink())
        .map((socket) => [socket.name, socket.data]),
    );
  }

  // keeps exactly one spare (unlinked) socket at the end, as Macro does
  private keepOneSpareSocket(
    getSockets: () => Socket[],
    addSpare: () => void,
  ): void {
    if (getSockets().at(-1)?.hasLink()) {
      addSpare();
    }
    let remaining = getSockets();
    while (this.shouldRemoveLastSocket(remaining)) {
      this.removeSocket(remaining[remaining.length - 1]);
      remaining = remaining.slice(0, -1);
    }
    this.notifyPlacementsOfSignatureChange();
  }

  private updateOutputSocketCount(): void {
    this.keepOneSpareSocket(
      () => this.getOutputSockets(),
      () =>
        this.addInput(
          this.constructSocketName(
            templateOutputPrefixName,
            this.inputSocketArray,
          ),
          new AnyType(),
        ),
    );
  }

  public inputPlugged(socket: Socket): void {
    super.inputPlugged(socket);
    registerTemplateBody(this);
    if (socket.name.startsWith(templateOutputPrefixName)) {
      // adopt the type of whatever feeds it, so placements get it too
      const linked = socket.links[0]?.getSource();
      if (linked && linked.dataType.getName() !== socket.dataType.getName()) {
        socket.changeSocketDataType(
          deSerializeType(serializeType(linked.dataType)),
        );
      }
      this.updateOutputSocketCount();
      this.debounceDrawShape();
    }
  }

  public inputUnplugged(socket: Socket): void {
    super.inputUnplugged(socket);
    if (socket.name.startsWith(templateOutputPrefixName)) {
      this.updateOutputSocketCount();
      this.debounceDrawShape();
    }
  }

  // an Output's display name follows whatever feeds it, as a parameter's
  // follows what it feeds
  public getOutputDisplayName(socket: Socket): string {
    if (socket.hasLink()) {
      const source = socket.links[0].getSource();
      return source.getNode().getSocketDisplayName(source);
    }
    return socket.name;
  }

  // the surface plugged into "UI" - the template's body
  public getBodySurface(): UISurfaceNode | undefined {
    const socket = this.getInputSocketByName(templateUISocketName);
    const source = socket?.links[0]?.getSource().getNode();
    return source && isSurfaceNode(source) ? source : undefined;
  }

  // Every pass runs the template, so it is always in its own body - also before
  // the first registerTemplateBody. Otherwise a load, which copies each source's
  // last row into the Outputs it feeds, would re-type them from that row.
  public isInTemplateBody(): boolean {
    return true;
  }

  public getSocketDisplayName(socket: Socket): string {
    if (socket == undefined) {
      return '';
    }
    return socket.isOutput()
      ? this.getSocketDesiredDisplayName(socket)
      : socket.name;
  }

  // template names are the reference placements store, so keep them unique
  // (Macro does the same for the same reason)
  public setNodeName(text: string): string {
    const others = getTemplates().filter((template) => template.id !== this.id);
    const oldName = this.nodeName;
    let nameToUse = text;
    for (
      let i = 0;
      nameToUse === 'UI template' ||
      others.some((template) => template.nodeName === nameToUse);
      i++
    ) {
      nameToUse = `${text}${i}`;
    }
    const placements = this.getPlacements();
    this.name = nameToUse;
    super.setNodeName(nameToUse);
    placements.forEach((node) =>
      node.placedTemplateChangedName(oldName, nameToUse),
    );
    return nameToUse;
  }

  protected getReferrers(): PPNode[] {
    return this.getPlacements();
  }

  protected getReferrersHeading(): string {
    return 'Placed by';
  }

  public getPlacements(): TemplatePlacementNode[] {
    return Object.values(PPGraph.currentGraph.nodes).filter(
      (node): node is TemplatePlacementNode =>
        node.isPlacingTemplate(this.nodeName),
    );
  }

  private updateParameterSocketCount(): void {
    this.keepOneSpareSocket(
      () => this.getParameterSockets(),
      () =>
        this.addOutput(
          this.constructSocketName(
            templateParameterPrefixName,
            this.outputSocketArray,
          ),
          new AnyType(),
        ),
    );
  }

  private notifyPlacementsOfSignatureChange(): void {
    if (!PPGraph.currentGraph?.graphConfiguredAndReady) {
      return;
    }
    this.getPlacements().forEach((node) =>
      node.placedTemplateUpdatedMeta(this),
    );
  }

  public outputPlugged(socket: Socket): void {
    super.outputPlugged(socket);
    registerTemplateBody(this);

    const targets = socket.links.map((link) => link.target);

    // Connecting copies the parameter's data into the target, and a parameter
    // that has never run carries a placeholder. A target that adapts has just
    // taken its type, which says nothing about the template, so both stay
    // untyped and rows carry whatever they carry.
    const adapting = targets.filter((target) =>
      target.getNode().socketShouldAutomaticallyAdapt(target),
    );
    if (adapting.length > 0) {
      adapting.forEach((target) => {
        if (!(target.dataType instanceof AnyType)) {
          target.changeSocketDataType(new AnyType());
        }
      });
      if (!(socket.dataType instanceof AnyType)) {
        socket.changeSocketDataType(new AnyType());
      }
    } else {
      // otherwise adopt the type of what it was wired into, as Macro does
      const linked = targets[0];
      if (linked && linked.dataType.getName() !== socket.dataType.getName()) {
        socket.changeSocketDataType(
          deSerializeType(serializeType(linked.dataType)),
        );
      }
    }
    this.updateParameterSocketCount();
    this.debounceDrawShape();
  }

  public outputUnplugged(socket: Socket): void {
    super.outputUnplugged(socket);
    registerTemplateBody(this);
    this.updateParameterSocketCount();
    this.debounceDrawShape();
  }

  protected socketAdded(): void {
    this.notifyPlacementsOfSignatureChange();
  }

  protected socketRemoved(): void {
    this.notifyPlacementsOfSignatureChange();
  }

  // the frame itself computes nothing; it tells its placements to re-render
  protected async rawExecute(): Promise<void> {
    if (!this.hasBeenAdded) {
      return;
    }
    if (PPGraph.currentGraph.graphConfiguredAndReady) {
      this.getPlacements().forEach((node) => {
        if (!node.isExecuting) {
          node.placedTemplateUpdated();
        }
      });
    }
  }

  onNodeRemoved: () => void = () => {
    this.bodyNodes.forEach((node) => node.templateBodyOf.delete(this.id));
  };
}
