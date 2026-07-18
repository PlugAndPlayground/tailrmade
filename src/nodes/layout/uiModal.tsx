import React from 'react';
import { Box } from '@mui/material';
import PPSocket from '../../classes/SocketClass';
import { HybridWidgetContentProps } from '../../classes/HybridNode2';
import { getModalDashboardIcon } from '../../components/dashboard/dashboardIcons';
import { BooleanType } from '../datatypes/booleanType';
import { ColorType } from '../datatypes/colorType';
import { JSONType } from '../datatypes/jsonType';
import { StringType } from '../datatypes/stringType';
import { TriggerType } from '../datatypes/triggerType';
import {
  COLOR_DARK,
  SOCKET_TYPE,
  SOCKETNAME_BACKGROUNDCOLOR,
  TRIGGER_TYPE_OPTIONS,
} from '../../utils/constants';
import { TRgba } from '../../utils/color';
import {
  dashboardLayoutInputName,
  modalOpenSocketName,
  modalOpenTriggerSocketName,
  modalCloseTriggerSocketName,
  modalIsOpenOutputSocketName,
  modalTitleSocketName,
  modalDismissOnBackdropSocketName,
  modalDismissOnEscapeSocketName,
  RootName,
  surfaceJsonSocketName,
} from '../../utils/constants_shared';
import { coerceSurfaceTree, wrapSurfaceTree } from './surfaceSync';
import { UISurfaceNode, UISurfaceWidget } from './uiSurface';
import InterfaceController, { ListenEvent } from '../../InterfaceController';

// a fresh surface's ROOT defaults to page-style sizing (100% width, 50dvh
// min-height, see surfaceTree.ts's rootProps) - give a modal a sane dialog
// size instead. `width` (unlike `maxWidth`, which Container.tsx's ROOT
// rendering only accepts as an MUI breakpoint key) is applied to ROOT as a
// literal CSS value, so the responsive clamp lives in `width` itself.
function getDefaultModalSurfaceTree() {
  const tree = coerceSurfaceTree(undefined);
  tree[RootName].props = {
    ...tree[RootName].props,
    width: 'min(480px, 90vw)',
    minWidth: '280px',
    minHeight: '80px',
    padding: [8, 8, 8, 8],
    customStyles: {},
  };
  return wrapSurfaceTree(tree);
}

// The actual modal dialog is rendered globally by ModalHost (so it works even
// when the modal node is not embedded in another surface, and dismiss controls
// behave consistently). This widget is only the node's canvas/inline preview.
const UIModalWidget: React.FunctionComponent<
  HybridWidgetContentProps<UIModalNode>
> = (props) => {
  const node = props.node;
  const title = node.getInputData(modalTitleSocketName);

  // in the dashboard the live dialog is global; show a compact placeholder
  if (props.inDashboard) {
    return (
      <Box
        data-cy={`modal placeholder of ${node.getDashboardId()}`}
        sx={{
          p: 1,
          borderRadius: 1,
          border: '1px dashed',
          borderColor: 'divider',
          color: 'text.secondary',
          fontSize: '12px',
        }}
      >
        Modal: {title || node.nodeName} — opens as a dialog
      </Box>
    );
  }

  // canvas preview: show the title bar and the modal's content
  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      {title ? (
        <Box sx={{ p: 0.5, background: 'rgba(255,255,255,0.06)' }}>{title}</Box>
      ) : null}
      <UISurfaceWidget {...props} />
    </Box>
  );
};

/**
 * A UI surface presented as a modal dialog: it holds its own layout like any
 * UI surface, plus open/close triggers, title and dismiss options.
 */
export class UIModalNode extends UISurfaceNode {
  // last open state we emitted ModalOpenChanged for, so onExecute only
  // notifies on an actual change (undefined until the first execute)
  private lastNotifiedModalOpen: boolean | undefined;

  public getName(): string {
    return 'UI modal dialog';
  }

  public getDescription(): string {
    return 'Build a modal dialog from connected widgets.';
  }

  public getAIDocs(): string {
    return `${super.getAIDocs()}

## Opening and closing the dialog
These sockets are separate from the layout:
- Wire an output to "Open Dialog". Placing a button in the modal only adds it
  to the content; it does not open the dialog.
- "Close Dialog" closes it. "Open" (boolean input) is an alternative: true opens,
  false closes; "Is Open" (boolean output) reflects the state.
- "Title" sets the header; "Dismiss on Backdrop"/"Dismiss on Escape" toggle
  closing on outside-click or Esc.`;
  }

  public isModalDialog(): boolean {
    return true;
  }

  public getDashboardName(): string {
    const title = this.getInputData(modalTitleSocketName);
    return title || this.nodeName;
  }

  public getDashboardIcon(): React.ReactNode {
    return getModalDashboardIcon();
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.TRIGGER,
        modalOpenTriggerSocketName,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'openDialog'),
        0,
        true,
      ),
      new PPSocket(
        SOCKET_TYPE.TRIGGER,
        modalCloseTriggerSocketName,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'closeDialog'),
        0,
        true,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        modalOpenSocketName,
        new BooleanType(),
        false,
        true,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        modalTitleSocketName,
        new StringType(),
        'Dialog',
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        modalDismissOnBackdropSocketName,
        new BooleanType(),
        true,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.OUT,
        modalIsOpenOutputSocketName,
        new BooleanType(),
        false,
        true,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        modalDismissOnEscapeSocketName,
        new BooleanType(),
        true,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        SOCKETNAME_BACKGROUNDCOLOR,
        new ColorType(),
        TRgba.fromString(COLOR_DARK),
        true,
      ),
      ...super
        .getDefaultIO()
        // drop the generic inherited Layout socket - sizing for a modal is
        // ROOT's job (edited directly in the dashboard editor like any
        // surface), background is the dedicated socket above, so this
        // generic "wire a Layout JSON to drive ROOT" knob is redundant here
        .filter(
          (socket) =>
            socket.name !== surfaceJsonSocketName &&
            socket.name !== dashboardLayoutInputName,
        ),
      new PPSocket(
        SOCKET_TYPE.IN,
        surfaceJsonSocketName,
        new JSONType(),
        getDefaultModalSurfaceTree(),
        false,
      ),
    ];
  }

  public async openDialog(): Promise<void> {
    this.setInputData(modalOpenSocketName, true);
    await this.executeOptimizedChain();
  }

  public async closeDialog(): Promise<void> {
    this.setInputData(modalOpenSocketName, false);
    await this.executeOptimizedChain();
  }

  getWidgetContent(
    props: HybridWidgetContentProps<UIModalNode>,
  ): React.ReactElement {
    return <UIModalWidget {...props} />;
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    const isOpen = Boolean(input[modalOpenSocketName]);
    output[modalIsOpenOutputSocketName] = isOpen;
    // notify the globally-mounted ModalHost when the open/closed state
    // changes so it can re-render the dialog
    if (isOpen !== this.lastNotifiedModalOpen) {
      this.lastNotifiedModalOpen = isOpen;
      InterfaceController.notifyListeners(ListenEvent.ModalOpenChanged, {
        nodeId: this.id,
      });
    }
    await super.onExecute(input, output);
  }
}
