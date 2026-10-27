import React, { useContext } from 'react';
import { Box } from '@mui/material';
import HybridNode2, {
  HybridWidgetContentProps,
} from '../../classes/HybridNode2';
import PPNode from '../../classes/NodeClass';
import PPSocket from '../../classes/SocketClass';
import {
  SurfaceCanvasPreviewContext,
  SurfaceRenderer,
  SurfaceVisitedContext,
} from '../../components/dashboard/SurfaceRenderer';
import {
  ComponentInstanceContext,
  ComponentInstanceSnapshots,
} from '../../components/dashboard/componentInstance';
import { getPageDashboardIcon } from '../../components/dashboard/dashboardIcons';
import { DynamicEnumType } from '../datatypes/dynamicEnumType';
import { EnumStructure } from '../datatypes/enumType';
import { TRgba } from '../../utils/color';
import { AGENT_DOCS_HEADING } from '../../utils/nodeDocs';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import {
  componentDefinitionSocketName,
  componentParameterPrefixName,
  componentUISocketName,
} from '../../utils/constants_shared';
import { SOCKET_NAME_DASHBOARD_CONTENT } from '../../utils/layoutableHelpers';
import {
  DashboardIconProps,
  Layoutable,
  WidgetProps,
} from '../../utils/interfaces';
import { deSerializeType, serializeType } from '../datatypes/typehelper';
import { ComponentArgs, runComponentAsInstance } from './componentInstancing';
import { SurfaceSync } from './surfaceSync';
import { getComponents, UIComponent } from './uiComponentNode';

export { UIComponent } from './uiComponentNode';

const NO_COMPONENT = '';

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

export const PlaceComponentWidget: React.FunctionComponent<
  HybridWidgetContentProps<PlaceComponent>
> = (props) => {
  const node = props.node;
  const visited = useContext(SurfaceVisitedContext);
  const isCanvasPreview =
    useContext(SurfaceCanvasPreviewContext) || !props.inDashboard;
  const component = node.getComponent();
  const body = component?.getBodySurface();

  if (!component) {
    const name = String(props[componentDefinitionSocketName] ?? '');
    return (
      <Notice
        label={name ? `Component "${name}" not found` : 'No component selected'}
      />
    );
  }

  if (!body) {
    return (
      <Notice
        label={`"${component.nodeName}" has no UI surface plugged into its ${componentUISocketName} input`}
      />
    );
  }

  // the guard embedded surfaces already use, keyed on the body surface - two
  // placements of one component are fine, a component inside itself is not
  if (visited.includes(body.id)) {
    return (
      <Notice
        label={`Recursive component (${component.nodeName}) - not rendered`}
      />
    );
  }

  const tree = SurfaceSync.applyRuntimeOverrides(body, body.getSurfaceTree());

  return (
    <ComponentInstanceContext.Provider
      value={{ ownerId: node.id, snapshots: node.instanceSnapshots }}
    >
      <SurfaceCanvasPreviewContext.Provider value={isCanvasPreview}>
        <SurfaceVisitedContext.Provider value={[...visited, body.id]}>
          <SurfaceRenderer tree={tree} interactive={false} />
        </SurfaceVisitedContext.Provider>
      </SurfaceCanvasPreviewContext.Provider>
    </ComponentInstanceContext.Provider>
  );
};

export class PlaceComponent extends HybridNode2 implements Layoutable {
  // what this placement's widgets render from: the inner nodes' input objects
  // as they stood at the end of THIS placement's evaluation pass
  instanceSnapshots: ComponentInstanceSnapshots = {};

  // A placement is placed to be seen, so it is never "unused".
  public getSeemsUnused(): boolean {
    return false;
  }

  public getName(): string {
    return 'Place Component';
  }

  public getDescription(): string {
    return 'Place a UI component, with its own parameter values';
  }

  public getDocs(): string {
    return `One placement of a "UI Component". Place it as often as you like -
each placement keeps its own values.

Pick the component under "${componentDefinitionSocketName}". This node then
grows one input per "${componentParameterPrefixName}" the component declares,
and its "ReactUI" output connects to any UI surface like an ordinary widget.

The nodes inside the component are shared between placements, so a change to
the component shows up everywhere at once; only the parameter values differ.

Placements render read-only for now: a widget inside a component does not yet
write back per placement.

${AGENT_DOCS_HEADING}
The component is referenced by NAME, and component names are kept unique.`;
  }

  public getTags(): string[] {
    return ['Widget', 'Layout', 'Component'];
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

  static getComponentOptions(): EnumStructure {
    return getComponents().map((component) => ({ text: component.nodeName }));
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.IN,
        componentDefinitionSocketName,
        new DynamicEnumType(
          () => PlaceComponent.getComponentOptions(),
          () => {
            this.updateParameterSockets();
            void this.executeOptimizedChain();
          },
        ),
        NO_COMPONENT,
        true,
      ),
    ];
  }

  public getComponent(): UIComponent | undefined {
    const name = String(
      this.getInputData(componentDefinitionSocketName) ?? '',
    ).trim();
    if (!name) {
      return undefined;
    }
    return getComponents().find((component) => component.nodeName === name);
  }

  public isPlacingComponent(componentName: string): boolean {
    return this.getInputData(componentDefinitionSocketName) === componentName;
  }

  public placedComponentChangedName(_oldName: string, newName: string): void {
    this.setInputData(componentDefinitionSocketName, newName);
  }

  public placedComponentUpdatedMeta(_component: PPNode): void {
    this.updateParameterSockets();
  }

  // this placement's own inputs for the component's parameters
  private getParameterInputSockets(): PPSocket[] {
    return this.inputSocketArray.filter((socket) =>
      socket.name.startsWith(componentParameterPrefixName),
    );
  }

  /**
   * Re-derives this node's parameter inputs from the component's parameter
   * outputs: adds what is missing, drops what is extra and unlinked, and
   * aligns the types. Modelled on ExecuteMacro.updateMacroCallSockets.
   */
  public updateParameterSockets(): void {
    const component = this.getComponent();
    // a component keeps one spare (unlinked) parameter at the end; a placement
    // only wants the ones that actually feed something
    const parameters = (component?.getParameterSockets() ?? []).filter(
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

    this.resizeAndDraw();
  }

  // a parameter's name means nothing on its own, so show the name the
  // component shows (which is the name of the socket it feeds)
  public getSocketDisplayName(socket: PPSocket): string {
    if (socket.name.startsWith(componentParameterPrefixName)) {
      const component = this.getComponent();
      const parameter = component?.getOutputSocketByName(socket.name);
      if (parameter && component) {
        return component.getSocketDisplayName(parameter);
      }
    }
    return super.getSocketDisplayName(socket);
  }

  public getWidgetProps(): WidgetProps {
    return { ...super.getWidgetProps(), height: 'auto' };
  }

  public getDashboardIcon(_props: DashboardIconProps): React.ReactNode {
    return getPageDashboardIcon();
  }

  getWidgetContent(
    props: HybridWidgetContentProps<PlaceComponent>,
  ): React.ReactElement {
    return <PlaceComponentWidget {...props} />;
  }

  // Not HybridNode2.onExecute: that structuredClones the input object for its
  // own reactUIProps, which throws on anything non-cloneable a parameter may
  // carry. A placement builds its render payload per inner node instead.
  protected async onExecute(input: any, output: any): Promise<void> {
    const component = this.getComponent();
    if (component) {
      const args: ComponentArgs = Object.fromEntries(
        this.getParameterInputSockets().map((socket) => [
          socket.name,
          socket.data,
        ]),
      );
      this.instanceSnapshots = await runComponentAsInstance(component, args);
    } else {
      this.instanceSnapshots = {};
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
