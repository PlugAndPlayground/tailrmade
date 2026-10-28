import React, { useContext } from 'react';
import { Box } from '@mui/material';
import HybridNode2, {
  HybridWidgetContentProps,
} from '../../classes/HybridNode2';
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import PPSocket from '../../classes/SocketClass';
import {
  SurfaceCanvasPreviewContext,
  SurfaceRenderer,
  SurfaceVisitedContext,
} from '../../components/dashboard/SurfaceRenderer';
import {
  TemplateInstanceContext,
  TemplateEdits,
  emptyTemplateEdits,
  TemplateInstanceCapture,
  TemplateRowEdits,
  emptyTemplateCapture,
} from '../../components/dashboard/templateInstance';
import { getPageDashboardIcon } from '../../components/dashboard/dashboardIcons';
import { DynamicEnumType } from '../datatypes/dynamicEnumType';
import { JSONType } from '../datatypes/jsonType';
import { EnumStructure } from '../datatypes/enumType';
import { TRgba } from '../../utils/color';
import { AGENT_DOCS_HEADING } from '../../utils/nodeDocs';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import {
  templateSocketName,
  templateEditsSocketName,
  templateOutputPrefixName,
  templateParameterPrefixName,
  templateUISocketName,
} from '../../utils/constants_shared';
import { SOCKET_NAME_DASHBOARD_CONTENT } from '../../utils/layoutableHelpers';
import {
  DashboardIconProps,
  Layoutable,
  WidgetProps,
} from '../../utils/interfaces';
import { deSerializeType, serializeType } from '../datatypes/typehelper';
import { TemplateArgs, runTemplateAsInstance } from './templateInstancing';
import { SurfaceSync } from './surfaceSync';
import { getTemplates, UITemplate } from './uiTemplateNode';

export { UITemplate } from './uiTemplateNode';

const NO_TEMPLATE = '';

const Notice: React.FunctionComponent<{ label: string }> = ({ label }) => (
  <Box
    sx={{
      width: '100%',
      p: 1,
      color: 'warning.main',
      fontSize: '12px',
      textAlign: 'center',
    }}
  >
    {label}
  </Box>
);

export const PlaceTemplateWidget: React.FunctionComponent<
  HybridWidgetContentProps<PlaceTemplate>
> = (props) => {
  const node = props.node;
  const visited = useContext(SurfaceVisitedContext);
  const isCanvasPreview =
    useContext(SurfaceCanvasPreviewContext) || !props.inDashboard;
  const template = node.getTemplate();
  const body = template?.getBodySurface();

  if (!template) {
    const name = String(props[templateSocketName] ?? '');
    return (
      <Notice
        label={name ? `Template "${name}" not found` : 'No template selected'}
      />
    );
  }

  if (!body) {
    return (
      <Notice
        label={`"${template.nodeName}" has no UI surface plugged into its ${templateUISocketName} input`}
      />
    );
  }

  // the guard embedded surfaces already use, keyed on the body surface - two
  // placements of one template are fine, a template inside itself is not
  if (visited.includes(body.id)) {
    return (
      <Notice
        label={`Recursive template (${template.nodeName}) - not rendered`}
      />
    );
  }

  // the tree this placement's own pass produced, overrides already applied;
  // only before the first pass is there nothing to show but the live one
  const tree =
    node.capture.trees[body.id] ??
    SurfaceSync.applyRuntimeOverrides(body, body.getSurfaceTree());

  return (
    <TemplateInstanceContext.Provider
      value={{ ownerId: node.id, ...node.capture }}
    >
      <SurfaceCanvasPreviewContext.Provider value={isCanvasPreview}>
        <SurfaceVisitedContext.Provider value={[...visited, body.id]}>
          <SurfaceRenderer
            tree={tree}
            interactive={Boolean(props.inDashboard) && !props.disabled}
          />
        </SurfaceVisitedContext.Provider>
      </SurfaceCanvasPreviewContext.Provider>
    </TemplateInstanceContext.Provider>
  );
};

export class PlaceTemplate extends HybridNode2 implements Layoutable {
  // what this placement's widgets render from: the inner nodes' input objects
  // and the overrides-applied trees, as they stood at the end of THIS
  // placement's evaluation pass
  capture: TemplateInstanceCapture = emptyTemplateCapture();

  // A placement is placed to be seen, so it is never "unused".
  public getSeemsUnused(): boolean {
    return false;
  }

  public getName(): string {
    return 'Place Template';
  }

  public getDescription(): string {
    return 'Place a UI template, with its own parameter values';
  }

  public getDocs(): string {
    return `One placement of a "UI Template". Place it as often as you like -
each placement keeps its own values.

Pick the template under "${templateSocketName}". This node then
grows one input per "${templateParameterPrefixName}" the template declares,
and its "ReactUI" output connects to any UI surface like an ordinary widget.

The nodes inside the template are shared between placements, so a change to
the template shows up everywhere at once; only the parameter values differ.

Placements render read-only for now: a widget inside a template does not yet
write back per placement.

${AGENT_DOCS_HEADING}
The template is referenced by NAME, and template names are kept unique.`;
  }

  public getTags(): string[] {
    return ['Widget', 'Layout', 'Template'];
  }

  public getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.LAYOUT);
  }

  public getMinNodeWidth(): number {
    return 300;
  }

  public getDefaultNodeHeight(): number {
    return 300;
  }

  static getTemplateOptions(): EnumStructure {
    return getTemplates().map((template) => ({ text: template.nodeName }));
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.IN,
        templateSocketName,
        new DynamicEnumType(
          () => PlaceTemplate.getTemplateOptions(),
          () => {
            this.updateParameterSockets();
            void this.executeOptimizedChain();
          },
        ),
        NO_TEMPLATE,
        true,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        templateEditsSocketName,
        new JSONType(),
        {},
        false,
      ),
    ];
  }

  public getTemplate(): UITemplate | undefined {
    const name = String(this.getInputData(templateSocketName) ?? '').trim();
    if (!name) {
      return undefined;
    }
    return getTemplates().find((template) => template.nodeName === name);
  }

  public isPlacingTemplate(templateName: string): boolean {
    return this.getInputData(templateSocketName) === templateName;
  }

  public placedTemplateChangedName(_oldName: string, newName: string): void {
    this.setInputData(templateSocketName, newName);
  }

  public placedTemplateUpdatedMeta(_template: PPNode): void {
    this.updateParameterSockets();
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
  public updateParameterSockets(): void {
    const template = this.getTemplate();
    // a template keeps one spare (unlinked) parameter at the end; a placement
    // only wants the ones that actually feed something
    const parameters = (template?.getParameterSockets() ?? []).filter(
      (socket) => socket.hasLink(),
    );
    const wantedNames = parameters.map((socket) => socket.name);

    this.getParameterInputSockets()
      .filter(
        (socket) => !wantedNames.includes(socket.name) && !socket.hasLink(),
      )
      .forEach((socket) => this.removeSocket(socket));

    parameters.forEach((parameter) => {
      const existing = this.getInputSocketByName(parameter.name);
      if (!existing) {
        this.addSocket(
          new PPSocket(
            SOCKET_TYPE.IN,
            parameter.name,
            deSerializeType(serializeType(parameter.dataType)),
            undefined,
            true,
          ),
        );
      } else if (existing.dataType.getName() !== parameter.dataType.getName()) {
        existing.changeSocketDataType(
          deSerializeType(serializeType(parameter.dataType)),
        );
      }
    });

    this.updateOutputSockets();
    this.resizeAndDraw();
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
    const wantedNames = declared.map((socket) => socket.name);

    this.outputSocketArray
      .filter(
        (socket) =>
          socket.name.startsWith(templateOutputPrefixName) &&
          !wantedNames.includes(socket.name) &&
          !socket.hasLink(),
      )
      .forEach((socket) => this.removeSocket(socket));

    declared.forEach((declaredSocket) => {
      const existing = this.getOutputSocketByName(declaredSocket.name);
      if (!existing) {
        this.addSocket(
          new PPSocket(
            SOCKET_TYPE.OUT,
            declaredSocket.name,
            deSerializeType(serializeType(declaredSocket.dataType)),
            undefined,
            true,
          ),
        );
      } else if (
        existing.dataType.getName() !== declaredSocket.dataType.getName()
      ) {
        existing.changeSocketDataType(
          deSerializeType(serializeType(declaredSocket.dataType)),
        );
      }
    });
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

  // ---- per-placement edits ---------------------------------------------

  private getEdits(): TemplateEdits {
    const stored = this.getInputData(templateEditsSocketName);
    if (!stored || typeof stored !== 'object') {
      return emptyTemplateEdits();
    }
    const edits = stored as Partial<TemplateEdits>;
    return { baseline: edits.baseline ?? {}, rows: edits.rows ?? {} };
  }

  public getRowEdits(rowKey: string | undefined): TemplateRowEdits {
    const edits = this.getEdits();
    return {
      baseline: edits.baseline,
      edits: edits.rows[rowKey ?? ''] ?? {},
    };
  }

  public getTemplateEdit(
    rowKey: string | undefined,
    nodeId: string,
    socketName: string,
  ): unknown {
    return this.getEdits().rows[rowKey ?? '']?.[nodeId]?.[socketName];
  }

  public setTemplateEdit(
    rowKey: string | undefined,
    nodeId: string,
    socketName: string,
    value: unknown,
  ): void {
    const edits = structuredClone(this.getEdits());
    // The first edit of a socket records what it held beforehand. At that
    // moment no row has edited it, so the shared node still carries the value
    // the template author set - which is what every unedited row must show.
    if (edits.baseline[nodeId]?.[socketName] === undefined) {
      const node = PPGraph.currentGraph.getNodeById(nodeId);
      if (node?.getInputSocketByName(socketName)) {
        (edits.baseline[nodeId] ??= {})[socketName] =
          node.getInputData(socketName);
      }
    }
    ((edits.rows[rowKey ?? ''] ??= {})[nodeId] ??= {})[socketName] = value;
    this.setInputData(templateEditsSocketName, edits);
  }

  // lets surface-embedding loop detection see through this placement
  public getTemplateBodySurface(): PPNode | undefined {
    return this.getTemplate()?.getBodySurface();
  }

  public getWidgetProps(): WidgetProps {
    return { ...super.getWidgetProps(), height: 'auto' };
  }

  public getDashboardIcon(_props: DashboardIconProps): React.ReactNode {
    return getPageDashboardIcon();
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
      const args: TemplateArgs = Object.fromEntries(
        this.getParameterInputSockets().map((socket) => [
          socket.name,
          socket.data,
        ]),
      );
      this.capture = await runTemplateAsInstance(
        template,
        args,
        this.getRowEdits(undefined),
      );
      Object.entries(this.capture.outputs).forEach(([name, value]) => {
        if (this.getOutputSocketByName(name)) {
          output[name] = value;
        }
      });
    } else {
      this.capture = emptyTemplateCapture();
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
