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
  ComponentInstanceContext,
  ComponentInstanceSnapshots,
} from '../../components/dashboard/componentInstance';
import { getPageDashboardIcon } from '../../components/dashboard/dashboardIcons';
import { AnyType } from '../datatypes/anyType';
import { DynamicEnumType } from '../datatypes/dynamicEnumType';
import { EnumStructure } from '../datatypes/enumType';
import { TRgba } from '../../utils/color';
import { AGENT_DOCS_HEADING } from '../../utils/nodeDocs';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import {
  componentDefinitionSocketName,
  surfaceParameterPrefixName,
} from '../../utils/constants_shared';
import { SOCKET_NAME_DASHBOARD_CONTENT } from '../../utils/layoutableHelpers';
import {
  DashboardIconProps,
  isSurfaceNode,
  Layoutable,
  WidgetProps,
} from '../../utils/interfaces';
import { deSerializeType, serializeType } from '../datatypes/typehelper';
import { ComponentArgs, runSurfaceAsInstance } from './componentInstancing';
import { SurfaceSync } from './surfaceSync';
import type { UISurfaceNode } from './uiSurface';

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

export const UIComponentInstanceWidget: React.FunctionComponent<
  HybridWidgetContentProps<UIComponentInstance>
> = (props) => {
  const node = props.node;
  const visited = useContext(SurfaceVisitedContext);
  const isCanvasPreview =
    useContext(SurfaceCanvasPreviewContext) || !props.inDashboard;
  const definition = node.getDefinition();

  if (!definition) {
    const name = String(props[componentDefinitionSocketName] ?? '');
    return (
      <Notice
        label={name ? `Component "${name}" not found` : 'No component selected'}
      />
    );
  }

  // the same guard embedded surfaces use, keyed on the DEFINITION - two
  // instances of one definition are fine, a definition inside itself is not
  if (visited.includes(definition.id)) {
    return (
      <Notice
        label={`Recursive component (${definition.getDashboardName()}) - not rendered`}
      />
    );
  }

  const tree = SurfaceSync.applyRuntimeOverrides(
    definition,
    definition.getSurfaceTree(),
  );

  return (
    <ComponentInstanceContext.Provider
      value={{ ownerId: node.id, snapshots: node.instanceSnapshots }}
    >
      <SurfaceCanvasPreviewContext.Provider value={isCanvasPreview}>
        <SurfaceVisitedContext.Provider value={[...visited, definition.id]}>
          <SurfaceRenderer tree={tree} interactive={false} />
        </SurfaceVisitedContext.Provider>
      </SurfaceCanvasPreviewContext.Provider>
    </ComponentInstanceContext.Provider>
  );
};

export class UIComponentInstance extends HybridNode2 implements Layoutable {
  // what this instance's widgets render from: the inner nodes' input objects
  // as they stood at the end of THIS instance's evaluation pass
  instanceSnapshots: ComponentInstanceSnapshots = {};

  // A component instance is placed to be seen, so it is never "unused".
  public getSeemsUnused(): boolean {
    return false;
  }

  public getName(): string {
    return 'UI component';
  }

  public getDescription(): string {
    return 'Show a UI surface as a reusable component, with its own values';
  }

  public getDocs(): string {
    return `Places a UI surface as a component: the same layout, shown as many
times as you like, each placement with its own values.

Pick the surface to use under "${componentDefinitionSocketName}". This node then
grows one input socket per "${surfaceParameterPrefixName}" output socket on that
surface, and its "ReactUI" output can be connected to any surface like an
ordinary widget.

To make a surface usable here, wire its "${surfaceParameterPrefixName} 1" output
into an input of one of its widgets (a Stat's Value, a Text's content). A fresh
parameter appears each time you use the last one, and each parameter takes the
name of the socket it feeds.

The component's inner nodes are shared between all instances - only the values
are per instance - so a change to the surface shows up in every placement at
once. Instances render read-only: a widget inside a component does not yet
write back per instance.

${AGENT_DOCS_HEADING}
The surface is referenced by NODE NAME, so renaming a surface currently breaks
instances pointing at it.`;
  }

  public getTags(): string[] {
    return ['Widget', 'Layout', 'Container', 'Component'];
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
    return Object.values(PPGraph.currentGraph.nodes)
      .filter(isSurfaceNode)
      .map((surface) => ({ text: surface.getDashboardName() }));
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.IN,
        componentDefinitionSocketName,
        new DynamicEnumType(
          () => UIComponentInstance.getComponentOptions(),
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

  // The surface this instance shows. Resolved by node name, as Execute Macro
  // resolves a macro and as "Navigate to UI surface" resolves a surface -
  // names are what the picker can offer. Names are not unique, so an ambiguous
  // name takes the first match.
  public getDefinition(): UISurfaceNode | undefined {
    const name = String(
      this.getInputData(componentDefinitionSocketName) ?? '',
    ).trim();
    if (!name || !PPGraph.currentGraph) {
      return undefined;
    }
    return Object.values(PPGraph.currentGraph.nodes)
      .filter(isSurfaceNode)
      .find((surface) => surface.getDashboardName() === name);
  }

  // this instance's own input sockets for the definition's parameters
  private getParameterInputSockets(): PPSocket[] {
    return this.inputSocketArray.filter((socket) =>
      socket.name.startsWith(surfaceParameterPrefixName),
    );
  }

  /**
   * Re-derives this node's parameter inputs from the definition's parameter
   * outputs: adds what is missing, removes what is extra and unlinked, and
   * aligns the types. Modelled on ExecuteMacro.updateMacroCallSockets.
   */
  public updateParameterSockets(): void {
    const definition = this.getDefinition();
    // a definition keeps one spare (unlinked) parameter at the end; an
    // instance only wants the ones actually feeding something
    const definitionParameters = (
      definition?.getParameterSockets() ?? []
    ).filter((socket) => socket.hasLink());
    const wantedNames = definitionParameters.map((socket) => socket.name);

    const toRemove = this.getParameterInputSockets().filter(
      (socket) => !wantedNames.includes(socket.name) && !socket.hasLink(),
    );
    toRemove.forEach((socket) => this.removeSocket(socket));

    definitionParameters.forEach((parameter) => {
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

  // the definition's parameter names mean nothing on their own, so show the
  // name the definition shows (which is the fed socket's name)
  public getSocketDisplayName(socket: PPSocket): string {
    if (socket.name.startsWith(surfaceParameterPrefixName)) {
      const definition = this.getDefinition();
      const parameter = definition?.getOutputSocketByName(socket.name);
      if (parameter) {
        return definition!.getSocketDisplayName(parameter);
      }
    }
    return super.getSocketDisplayName(socket);
  }

  public definitionSurfaceUpdatedMeta(surface: PPNode): void {
    if (this.getDefinition()?.id === surface.id) {
      this.updateParameterSockets();
    }
  }

  public getWidgetProps(): WidgetProps {
    return {
      ...super.getWidgetProps(),
      height: 'auto',
    };
  }

  public getDashboardIcon(_props: DashboardIconProps): React.ReactNode {
    return getPageDashboardIcon();
  }

  getWidgetContent(
    props: HybridWidgetContentProps<UIComponentInstance>,
  ): React.ReactElement {
    return <UIComponentInstanceWidget {...props} />;
  }

  // Not HybridNode2.onExecute: that structuredClones the input object for its
  // own reactUIProps, which throws on anything non-cloneable a parameter may
  // carry. An instance builds its render payload per inner node instead.
  protected async onExecute(input: any, output: any): Promise<void> {
    const definition = this.getDefinition();
    if (definition) {
      const args: ComponentArgs = Object.fromEntries(
        this.getParameterInputSockets().map((socket) => [
          socket.name,
          socket.data,
        ]),
      );
      this.instanceSnapshots = await runSurfaceAsInstance(definition, args);
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
