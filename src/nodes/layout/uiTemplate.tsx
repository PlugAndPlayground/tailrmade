import React from 'react';
import { HybridWidgetContentProps } from '../../classes/HybridNode2';
import PPSocket from '../../classes/SocketClass';
import {
  TEMPLATE_PLACED_STATE_PROP,
  TemplateInstanceCapture,
  emptyTemplateCapture,
} from '../../components/dashboard/templateInstance';
import { AGENT_DOCS_HEADING } from '../../utils/nodeDocs';
import { SOCKET_TYPE } from '../../utils/constants';
import { TSocketType } from '../../utils/interfaces';
import {
  templateSocketName,
  templateOutputPrefixName,
  templateParameterPrefixName,
} from '../../utils/constants_shared';
import { SOCKET_NAME_DASHBOARD_CONTENT } from '../../utils/layoutableHelpers';
import { deSerializeType, serializeType } from '../datatypes/typehelper';
import { TemplateArgs, runTemplateAsInstance } from './templateInstancing';
import {
  TemplateBody,
  TemplateNotice,
  TemplatePlacementNode,
  usePlacedBody,
} from './templatePlacement';
import { SurfaceSync } from './surfaceSync';
import { UITemplate } from './uiTemplateNode';

export { UITemplate } from './uiTemplateNode';

export const PlaceTemplateWidget: React.FunctionComponent<
  HybridWidgetContentProps<PlaceTemplate>
> = (props) => {
  const node = props.node;
  const { body, bodyVisited, isCanvasPreview, problem } = usePlacedBody(props);
  if (problem || !body) {
    return <TemplateNotice label={problem ?? ''} />;
  }

  // nested in another template, this rendering belongs to that template's row
  const capture: TemplateInstanceCapture =
    props[TEMPLATE_PLACED_STATE_PROP] ?? node.capture;

  return (
    <TemplateBody
      ownerId={node.id}
      capture={capture}
      // the tree this placement's own pass produced, overrides already applied;
      // only before the first pass is there nothing to show but the live one
      tree={
        capture.trees[body.id] ??
        SurfaceSync.applyRuntimeOverrides(body, body.getSurfaceTree())
      }
      visited={bodyVisited}
      isCanvasPreview={isCanvasPreview}
      interactive={Boolean(props.inDashboard) && !props.disabled}
    />
  );
};

export class PlaceTemplate extends TemplatePlacementNode {
  // what this placement's widgets render from: the inner nodes' input objects
  // and the overrides-applied trees, as they stood at the end of THIS
  // placement's evaluation pass
  capture: TemplateInstanceCapture = emptyTemplateCapture();

  public getName(): string {
    return 'Place template';
  }

  public getDescription(): string {
    return 'Place a UI template, with its own parameter values';
  }

  public getDocs(): string {
    return `One placement of a "UI template". Place it as often as you like -
each placement keeps its own values.

Pick the template under "${templateSocketName}". This node then
grows one input per "${templateParameterPrefixName}" the template declares,
and its "ReactUI" output connects to any UI surface like an ordinary widget.

The nodes inside the template are shared between placements, so a change to
the template shows up everywhere at once; only the parameter values differ, and
whatever a viewer changes in a widget of this placement, which stays here.

${AGENT_DOCS_HEADING}
The template is referenced by NAME, and template names are kept unique. See
describe_node "UI template" for how to build one.

Setting "${templateSocketName}" with set_socket_value creates one input per
parameter that feeds something, named like the template's ("Parameter 1"), so
wire the template's parameters first and set or connect those inputs afterwards.
Connect this node's ReactUI output to the surface it should appear on.

"Edits" holds what viewers changed in this placement. Leave it alone: to change
what every placement shows, set the value on the widget inside the template. Fire
"Clear edits" to drop this placement's changes.`;
  }

  public getTags(): string[] {
    return ['Widget', 'Layout', 'Template'];
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      this.getTemplateSelectSocket(),
      this.getEditsSocket(),
      this.getClearEditsSocket(),
    ];
  }

  public getTemplateSnapshotProps(): Record<string, unknown> {
    return { [TEMPLATE_PLACED_STATE_PROP]: this.capture };
  }

  // this placement's own inputs for the template's parameters
  private getParameterInputSockets(): PPSocket[] {
    return this.inputSocketArray.filter((socket) =>
      socket.name.startsWith(templateParameterPrefixName),
    );
  }

  /**
   * Re-derives this node's parameter inputs from the template's parameter
   * outputs: adds what is missing, drops what is extra and unlinked, and
   * aligns the types. Modelled on ExecuteMacro.updateMacroCallSockets.
   */
  public updateTemplateSockets(): void {
    const template = this.getTemplate();
    // a template keeps one spare (unlinked) parameter at the end; a placement
    // only wants the ones that actually feed something
    const parameters = (template?.getParameterSockets() ?? []).filter(
      (socket) => socket.hasLink(),
    );
    this.syncSockets(
      SOCKET_TYPE.IN,
      this.getParameterInputSockets(),
      parameters,
    );
    this.updateOutputSockets();
    this.resizeAndDraw();
  }

  // Adds a socket per declared one, drops the unlinked ones of own nobody
  // declares any more, and aligns the types.
  private syncSockets(
    socketType: TSocketType,
    own: PPSocket[],
    declared: PPSocket[],
  ): void {
    const wantedNames = declared.map((socket) => socket.name);
    own
      .filter(
        (socket) => !wantedNames.includes(socket.name) && !socket.hasLink(),
      )
      .forEach((socket) => this.removeSocket(socket));

    declared.forEach((declaredSocket) => {
      const dataType = deSerializeType(serializeType(declaredSocket.dataType));
      const existing = own.find(
        (socket) => socket.name === declaredSocket.name,
      );
      if (!existing) {
        this.addSocket(
          new PPSocket(
            socketType,
            declaredSocket.name,
            dataType,
            undefined,
            true,
          ),
        );
      } else if (existing.dataType.getName() !== dataType.getName()) {
        existing.changeSocketDataType(dataType);
      }
    });
  }

  /**
   * One output socket per Output the template declares, so a placement's
   * result is usable in the graph like any other node's.
   */
  private updateOutputSockets(): void {
    const template = this.getTemplate();
    const declared = (template?.getOutputSockets() ?? []).filter((socket) =>
      socket.hasLink(),
    );
    this.syncSockets(
      SOCKET_TYPE.OUT,
      this.outputSocketArray.filter((socket) =>
        socket.name.startsWith(templateOutputPrefixName),
      ),
      declared,
    );
  }

  // a parameter's name means nothing on its own, so show the name the
  // template shows (which is the name of the socket it feeds)
  public getSocketDisplayName(socket: PPSocket): string {
    if (socket.isOutput() && socket.name.startsWith(templateOutputPrefixName)) {
      const template = this.getTemplate();
      const declared = template?.getInputSocketByName(socket.name);
      if (declared && template) {
        return template.getOutputDisplayName(declared);
      }
    }
    if (socket.name.startsWith(templateParameterPrefixName)) {
      const template = this.getTemplate();
      const parameter = template?.getOutputSocketByName(socket.name);
      if (parameter && template) {
        return template.getSocketDisplayName(parameter);
      }
    }
    return super.getSocketDisplayName(socket);
  }

  // Only the template-derived Output sockets adapt. Not ReactUI: it carries a
  // render function, and letting it adapt retypes it away from
  // DeferredReactType, after which a surface will not accept the connection.
  public socketShouldAutomaticallyAdapt(socket: PPSocket): boolean {
    return (
      socket.isOutput() && socket.name.startsWith(templateOutputPrefixName)
    );
  }

  protected getRowArgs(): TemplateArgs {
    return Object.fromEntries(
      this.getParameterInputSockets().map((socket) => [
        socket.name,
        socket.data,
      ]),
    );
  }

  // Every template output socket, including one kept only for its link after
  // the template stopped declaring it, which then carries nothing. Written to
  // the sockets directly, since execute() skips an undefined output.
  private getCapturedOutputs(): Record<string, unknown> {
    return Object.fromEntries(
      this.outputSocketArray
        .filter((socket) => socket.name.startsWith(templateOutputPrefixName))
        .map((socket) => [socket.name, this.capture.outputs[socket.name]]),
    );
  }

  protected storeRowCapture(
    _rowKey: string | undefined,
    capture: TemplateInstanceCapture,
  ): void {
    this.capture = capture;
    Object.entries(this.getCapturedOutputs()).forEach(([name, value]) =>
      this.setOutputData(name, value),
    );
  }

  getWidgetContent(
    props: HybridWidgetContentProps<PlaceTemplate>,
  ): React.ReactElement {
    return <PlaceTemplateWidget {...props} />;
  }

  // Not HybridNode2.onExecute: that structuredClones the input object for its
  // own reactUIProps, which throws on anything non-cloneable a parameter may
  // carry. A placement builds its render payload per inner node instead.
  protected async onExecute(input: any, output: any): Promise<void> {
    const template = this.getTemplate();
    if (template) {
      this.prepareRun(template);
      this.storeRowCapture(
        undefined,
        await runTemplateAsInstance(
          template,
          this.getRowArgs(),
          this.getRowEdits(undefined),
        ),
      );
    } else {
      this.storeRowCapture(undefined, emptyTemplateCapture());
    }

    if (this.getOutputSocketByName(SOCKET_NAME_DASHBOARD_CONTENT)?.hasLink()) {
      output[SOCKET_NAME_DASHBOARD_CONTENT] = {
        renderFunction: (props) => this.getDashboardWrapper(props),
        nodeId: this.id,
      };
    }
    this.callRender(input);
  }
}
