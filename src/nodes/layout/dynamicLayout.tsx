import React, { useEffect, useState, useMemo } from 'react';
import { Box } from '@mui/material';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import PPNode from '../../classes/NodeClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import { HybridNodeErrorBoundary } from '../../components/HybridNodeErrorBoundary';
import PPSocket from '../../classes/SocketClass';
import { StringType } from '../datatypes/stringType';
import { NumberType } from '../datatypes/numberType';
import { ColorType } from '../datatypes/colorType';
import { BooleanType } from '../datatypes/booleanType';
import { getDefaultWidgetLayoutValue } from '../datatypes/widgetLayoutType';
import { TriggerType } from '../datatypes/triggerType';
import PPGraph from '../../classes/GraphClass';
import { NodeConfigurationWarning, PNPSuccess } from '../../classes/ErrorClass';
import {
  DashboardWidgetProps,
  IOverlay,
  Layoutable,
  MobileBehavior,
  WidgetContentProps,
  WidgetProps,
  isSurfaceNode,
} from '../../utils/interfaces';
import {
  DEFAULT_UPDATE_FREQUENCY,
  SOCKETNAME_BACKGROUNDCOLOR,
  SOCKET_TYPE,
  TRIGGER_TYPE_OPTIONS,
  UNSET_VALUE,
} from '../../utils/constants';
import { widthName, heightName } from '../../utils/layoutableHelpers';
import { DashboardContentGate } from '../../components/dashboard/DashboardContentGate';
import { ArrayType } from '../datatypes/arrayType';
import { LayoutableNodeBase } from './dynamicLayoutBase';
import { ColorSetting } from '../../utils/themeColors';

type VisibilityMode = 'visible' | 'hidden';
type CollapseMode = 'collapse' | 'expand' | 'none';

type DashboardContainerBaseProps = {
  background: Record<'r' | 'g' | 'b' | 'a', number>;
  // see WidgetLayoutInterface.color - may be the 'inherit' keyword
  color: ColorSetting;
  flexDirection: string;
  alignItems: string;
  justifyContent: string;
  width: string;
  height: string;
  padding: number[];
  minWidth: string;
  minHeight: string;
  gap: number;
  children?: React.ReactNode;
  visibility: VisibilityMode;
  collapseMode: CollapseMode;
  mobileBehavior: MobileBehavior;
};

const defaultProps: DashboardContainerBaseProps = {
  ...getDefaultWidgetLayoutValue(),
  alignItems: 'stretch',
  padding: [8, 8, 8, 8],
  minWidth: '48px',
  minHeight: '48px',
  gap: 8,
  visibility: 'visible',
  collapseMode: 'none',
  mobileBehavior: 'row',
};

type DynamicWidgetContainerNodeProps = DashboardWidgetProps & {
  property: PPNode & Layoutable;
};

export const DynamicWidgetContainerNode: React.FunctionComponent<
  DynamicWidgetContainerNodeProps
> = (props) => {
  const [showDashboard, setShowDashboard] = useState(true);
  const [_, setDummyExecutionVar] = useState(0);

  useEffect(() => {
    const listenerId = InterfaceController.addListener(
      ListenEvent.OverlayStateChanged,
      (newState: IOverlay) => {
        setShowDashboard(newState.dashboard.visible);
      },
    );

    return () => InterfaceController.removeListener(listenerId);
  }, []);

  useEffect(() => {
    const executionListener = () => {
      setDummyExecutionVar(Math.random);
    };
    props.property.addExecutionListener(executionListener);

    return () => {
      props.property.removeExecutionListener(executionListener);
    };
  }, [props.property]);

  return (
    <Box
      id={`inspector-node-${props.property.getName()}`}
      sx={{
        height: '100%',
        overflow: 'hidden',
        pointerEvents: showDashboard ? UNSET_VALUE : 'none',
        width: '100%',
      }}
    >
      <DashboardContentGate
        disabled={props.disabled}
        isSurfacePreview={props.isSurfacePreview}
      >
        <HybridNodeErrorBoundary node={props.property}>
          <props.property.getWidgetContent
            {...PPNode.remapInput(props.property.inputSocketArray)}
            {...props}
            id={props.property.id}
            selected={props.property.selected}
            disabled={props.disabled}
            node={props.property}
            showDashboard={showDashboard}
            inDashboard={true}
            dataCyId={`${props.property.id}-dashboard`}
            width={props.width}
            height={props.height}
            isEditMode={props.isEditMode}
            components={props.components}
          />
        </HybridNodeErrorBoundary>
      </DashboardContentGate>
    </Box>
  );
};

const inputHtmlArrayName = 'HtmlArray';
const numberPerColumnRowName = 'Number Per Column/Row';
const drawingOrderName = 'Change Column/Row drawing order';
const gapXName = 'Gap X';
const gapYName = 'Gap Y';
const objectsInteractive = 'Objects Interactive';
const outputMultiplierIndex = 'Output Multiplier Index';
const outputMultiplierPointerDown = 'Output Multiplier Pointer Down';

export class ReactUICombineArray
  extends LayoutableNodeBase
  implements Layoutable
{
  public getName(): string {
    return 'Widget grid array';
  }

  public getDescription(): string {
    return 'Combines an array of ReactUI elements into a grid layout';
  }

  public getTags(): string[] {
    return super.getTags().concat(['HTML']);
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.IN,
        inputHtmlArrayName,
        new ArrayType(),
        [],
        true,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        numberPerColumnRowName,
        new NumberType(true, 1, 100),
        3,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        drawingOrderName,
        new BooleanType(),
        true,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        gapXName,
        new NumberType(true, 0, 100),
        8,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        gapYName,
        new NumberType(true, 0, 100),
        8,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        widthName,
        new StringType(),
        defaultProps.width,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        heightName,
        new StringType(),
        defaultProps.height,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        SOCKETNAME_BACKGROUNDCOLOR,
        new ColorType(),
        defaultProps.background,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        objectsInteractive,
        new BooleanType(),
        false,
        false,
      ),
      PPSocket.getOptionalVisibilitySocket(
        SOCKET_TYPE.OUT,
        outputMultiplierIndex,
        new NumberType(true),
        -1,
        () => this.getInputData(objectsInteractive),
      ),
      PPSocket.getOptionalVisibilitySocket(
        SOCKET_TYPE.OUT,
        outputMultiplierPointerDown,
        new BooleanType(),
        false,
        () => this.getInputData(objectsInteractive),
      ),
    ];
  }

  getWidgetProps(): WidgetProps {
    return { ...defaultProps };
  }

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    return <ReactUICombineArrayComponent {...props} />;
  }
}

const ReactUICombineArrayComponent: React.FunctionComponent<any> = (props) => {
  const node = props.node;
  const nodeComponentId = `${node.id}-${props.inDashboard ? 'dashboard' : 'canvas'}`;

  const {
    [inputHtmlArrayName]: htmlArray = [],
    [numberPerColumnRowName]: numberPerColumn = 3,
    [drawingOrderName]: changeDrawingOrder = false,
    [gapXName]: gapX = 8,
    [gapYName]: gapY = 8,
    [SOCKETNAME_BACKGROUNDCOLOR]: background,
    [objectsInteractive]: isInteractive = false,
  } = props;

  // Calculate grid template columns based on layout mode
  const totalItems = htmlArray?.length || 0;

  // If rowFirst (changeDrawingOrder=true), we need numberPerColumn columns
  // If columnFirst (changeDrawingOrder=false), we calculate columns based on total items
  const columnsCount = changeDrawingOrder
    ? numberPerColumn
    : Math.ceil(totalItems / numberPerColumn);

  // For empty arrays, default to a safer value
  const effectiveColumnsCount = Math.max(columnsCount, 1);

  // Determine grid template column sizing based on width mode
  // For true "hug" content behavior in Grid:
  // - Use min-content (not auto) to prevent all columns from having the same width
  // - min-content will make columns as narrow as possible without overflowing content
  const gridColumnSize = props[widthName] === 'auto' ? 'min-content' : '1fr';

  // Compute styles for container and items
  const containerStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${effectiveColumnsCount}, ${gridColumnSize})`,
    gap: `${gapY}px ${gapX}px`,
    width: props.width,
    height: props.height,
    background: background?.toString() || 'transparent',
    overflow: 'auto',
    justifyItems: props[widthName] === 'auto' ? 'start' : 'stretch', // Prevent horizontal stretching for hug mode
    alignItems: props[heightName] === 'auto' ? 'start' : 'stretch', // Prevent vertical stretching for hug mode
  };

  // Handle interactivity for items
  const handleItemClick = (index: number) => {
    if (isInteractive && node) {
      // Set the output data
      node.setOutputData(outputMultiplierIndex, index);
      node.setOutputData(outputMultiplierPointerDown, true);

      // Execute children to propagate updates
      node.executeChildren();
    }
  };

  const handleItemRelease = () => {
    if (isInteractive && node) {
      node.setOutputData(outputMultiplierPointerDown, false);
      node.executeChildren();
    }
  };

  // Prepare child item styles based on width/height modes
  const getItemStyle = (isActive = false) => {
    const style: any = {
      cursor: isInteractive ? 'pointer' : 'default',
      transition: 'opacity 0.15s ease',
      opacity: isActive ? 0.7 : 1,
    };

    // Apply width styles - key changes for better "hug" behavior
    if (props[widthName] === 'auto') {
      // Don't set width - let content determine it
      // Add justifySelf to prevent stretching
      style.justifySelf = 'start';
    } else if (props[widthName] === '100%') {
      style.width = '100%';
    } else if (props[widthName] !== 'auto' && props[widthName] !== '100%') {
      style.width = props[widthName] || 'auto';
    }

    // Apply height styles with same principle
    if (props[heightName] === 'auto') {
      style.alignSelf = 'start';
    } else if (props[heightName] === '100%') {
      style.height = '100%';
    } else if (props[heightName] !== 'auto' && props[heightName] !== '100%') {
      style.height = props[heightName] || 'auto';
    }

    return style;
  };

  // Track active (pressed) item
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);

  // Arrange the items in the grid, respecting the drawing order
  const arrangedItems = useMemo(() => {
    if (!htmlArray || htmlArray.length === 0) return null;

    return htmlArray.map((item, index) => {
      if (!item?.renderFunction) return null;

      // Calculate position based on drawing order
      let row, col;

      if (changeDrawingOrder) {
        // Row-first ordering: fill rows left-to-right, then move down
        row = Math.floor(index / numberPerColumn);
        col = index % numberPerColumn;
      } else {
        // Column-first ordering: fill columns top-to-bottom, then move right
        col = Math.floor(index / numberPerColumn);
        row = index % numberPerColumn;
      }

      // CSS grid areas are 1-indexed
      const gridArea = `${row + 1} / ${col + 1}`;
      const isActive = activeItemIndex === index;

      return (
        <Box
          key={`item-${index}`}
          style={{
            ...getItemStyle(isActive),
            gridArea: gridArea,
          }}
          onMouseDown={() => {
            if (isInteractive) {
              setActiveItemIndex(index);
              handleItemClick(index);
            }
          }}
          onMouseUp={() => {
            if (isInteractive) {
              setActiveItemIndex(null);
              handleItemRelease();
            }
          }}
          onMouseLeave={() => {
            if (isInteractive && activeItemIndex === index) {
              setActiveItemIndex(null);
              handleItemRelease();
            }
          }}
        >
          {item.renderFunction({
            index,
            disabled: props.disabled,
            width: 'auto',
            height: 'auto',
          })}
        </Box>
      );
    });
  }, [
    htmlArray,
    numberPerColumn,
    changeDrawingOrder,
    props[widthName],
    props[heightName],
    props.disabled,
    isInteractive,
    activeItemIndex,
  ]);

  return (
    <Box id={nodeComponentId} sx={containerStyle}>
      {arrangedItems}
    </Box>
  );
};

// ============================================================================
// NavigateToPage Node - Utility node to trigger page navigation
// ============================================================================

const navigateToSurfaceInputName = 'Surface';
const executeTriggerSocketName = 'Execute';
const navigateTriggerFunctionName = 'navigateNow';

function getNavigateTriggerSocket(): PPSocket {
  return new PPSocket(
    SOCKET_TYPE.TRIGGER,
    executeTriggerSocketName,
    new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, navigateTriggerFunctionName),
  );
}

/**
 * NavigateToPage - Utility node to navigate to/show a specific UI surface
 * Mutual exclusivity with sibling surfaces is driven by the target surface's
 * own Radio Group (see UISurfaceNode.getRadioGroup), so navigation doesn't
 * need to be told the group.
 */
export class NavigateToPage extends PPNode {
  private lastNavigatedTarget: string | undefined;

  public getName(): string {
    return 'Navigate to UI surface';
  }

  public getDescription(): string {
    return 'Shows a UI surface by their node name or route when the target changes or its Execute trigger fires.';
  }

  public getAIDocs(): string {
    return `Navigates when "Surface" changes, so a tabs or dropdown widget can
drive it directly. Nothing happens on graph load - the default surface wins.

## The target must name a real surface
1. set_node_name each surface to a short unique name ("Home", "Settings").
2. Feed this node exactly those strings.

## Wiring
- Tabs/dropdown for several destinations: set its options to the exact surface
  names and connect its "Out" to "Surface".
- One button per destination: set_socket_value "Surface" to the fixed target
  and connect the button's "Out" to "Execute".

## What navigating does
- A top-level surface becomes the displayed page.
- An embedded page in a nav shell is shown and every surface sharing the same "Radio Group" is hidden`;
  }

  public getVersion(): number {
    return 4;
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion < 2) {
      await this.replaceSocketWithOtherSocket(
        this.getInputSocketByName('Page Name'),
        this.getInputSocketByName(navigateToSurfaceInputName),
      );
      this.removeSocket(this.getInputSocketByName('Page Group'));
    }
    if (previousVersion < 3) {
      // 'Navigate' used to be a BooleanType input gated in onExecute, which
      // could never fire this node from data-flow (its update behaviour is
      // off). v3 replaces it with the 'Execute' trigger socket, which
      // executes the node directly when it fires (TriggerType.onDataSet).
      if (
        this.getNodeTriggerSocketByName(executeTriggerSocketName) === undefined
      ) {
        this.addSocket(getNavigateTriggerSocket());
      }
      const oldNavigateSocket = this.getInputSocketByName('Navigate');
      if (oldNavigateSocket) {
        // move an incoming link over to the trigger socket - a boolean
        // source keeps working, since positiveFlank fires on false->true.
        // replaceSocketWithOtherSocket refuses mismatched socket types
        // (IN vs TRIGGER), so mirror its body here instead.
        if (oldNavigateSocket.links.length) {
          const prevSource = oldNavigateSocket.links[0].getSource();
          await PPGraph.currentGraph.linkConnect(
            prevSource.getNode().id,
            prevSource.name,
            this.id,
            executeTriggerSocketName,
            true,
          );
          while (oldNavigateSocket.links.length) {
            await PPGraph.currentGraph.linkDisconnect(
              oldNavigateSocket.links[0].getTarget().getNode().id,
              oldNavigateSocket.links[0].getTarget().name,
              false,
            );
          }
        }
        this.removeSocket(oldNavigateSocket);
      }
    }
    if (previousVersion < 4) {
      const executeSocket = this.getNodeTriggerSocketByName(
        executeTriggerSocketName,
      );
      if (executeSocket?.dataType instanceof TriggerType) {
        executeSocket.dataType.customFunctionString =
          navigateTriggerFunctionName;
      }
    }
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, true, false, 1000, this);
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.IN,
        navigateToSurfaceInputName,
        new StringType(),
        '',
        true,
      ),
      getNavigateTriggerSocket(),
    ];
  }

  public navigateNow(): void {
    this.navigateTo(this.getInputData(navigateToSurfaceInputName));
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    const target = String(input[navigateToSurfaceInputName] ?? '').trim();
    if (target !== this.lastNavigatedTarget) {
      this.navigateTo(target);
    }

    await super.onExecute(input, output);
  }

  private navigateTo(rawTarget: unknown): void {
    if (!PPGraph.currentGraph.graphConfiguredAndReady) {
      return;
    }
    const target = String(rawTarget ?? '').trim();
    if (!target) {
      this.setStatus(
        new NodeConfigurationWarning(
          `No target set. Give "${navigateToSurfaceInputName}" a UI surface name or route slug.${this.listSurfaces()}`,
        ),
      );
      return;
    }

    if (InterfaceController.navigateToSurface(target) === 'not-found') {
      this.setStatus(
        new NodeConfigurationWarning(
          `No UI surface named "${target}" (names are case-sensitive) and no surface with that route slug.${this.listSurfaces()}`,
        ),
      );
      return;
    }

    this.lastNavigatedTarget = target;
    const ambiguous = this.getSurfaces().filter(
      (surface) => surface.getDashboardName() === target,
    );
    if (ambiguous.length > 1) {
      this.setStatus(
        new NodeConfigurationWarning(
          `${ambiguous.length} UI surfaces are named "${target}", so navigation always shows the first one. Give each surface its own name.`,
        ),
      );
      return;
    }
    this.setStatus(new PNPSuccess());
  }

  private getSurfaces() {
    return Object.values(PPGraph.currentGraph?.nodes ?? {}).filter(
      isSurfaceNode,
    );
  }

  private listSurfaces(): string {
    const surfaces = this.getSurfaces();
    if (surfaces.length === 0) {
      return ' This graph has no UI surfaces.';
    }
    const described = surfaces.map((surface) => {
      const route = surface.getRouteSlug();
      const name = `"${surface.getDashboardName()}"`;
      return route ? `${name} (route "${route}")` : name;
    });
    return ` Available surfaces: ${described.join(', ')}.`;
  }
}
