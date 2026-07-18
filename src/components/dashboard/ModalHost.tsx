import React from 'react';
import { Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PPGraph from '../../classes/GraphClass';
import { ListenEvent } from '../../InterfaceController';
import { SurfaceRenderer } from './SurfaceRenderer';
import { SurfaceSync } from '../../nodes/layout/surfaceSync';
import { TRgba } from '../../utils/color';
import {
  COLOR_DARK,
  COLOR_WHITE_TEXT,
  MAIN_COLOR,
  SOCKETNAME_BACKGROUNDCOLOR,
} from '../../utils/constants';
import {
  modalOpenSocketName,
  modalTitleSocketName,
  modalDismissOnBackdropSocketName,
  modalDismissOnEscapeSocketName,
} from '../../utils/constants_shared';
import { useForceUpdateOn } from './hooks';

// duck-typed modal node (avoids importing the uiModal node module, which would
// pull `class extends HybridNode2` into this early-mounted UI component and
// risk a module-init circular dependency)
type ModalNodeLike = {
  id: string;
  isModalDialog?: () => boolean;
  getInputData: (name: string) => any;
  getSurfaceTree: () => any;
  closeDialog?: () => Promise<void> | void;
  inputSocketArray: any[];
  getInputSocketByName: (name: string) => any;
};

const ModalDialogOverlay: React.FC<{ node: ModalNodeLike }> = ({ node }) => {
  const open = Boolean(node.getInputData(modalOpenSocketName));
  if (!open) {
    return null;
  }

  const title = node.getInputData(modalTitleSocketName);
  const dismissOnBackdrop = Boolean(
    node.getInputData(modalDismissOnBackdropSocketName),
  );
  const dismissOnEscape = Boolean(
    node.getInputData(modalDismissOnEscapeSocketName),
  );

  const tree = SurfaceSync.applyRuntimeOverrides(
    node as any,
    node.getSurfaceTree(),
  );

  // the dialog frame's own background - the surface's ROOT content (sized
  // and laid out via its own Layout socket, same as any surface) renders on
  // top of this and is usually opaque, so the frame mostly shows through
  // behind the title bar
  const backgroundColor = Object.assign(
    new TRgba(),
    node.getInputData(SOCKETNAME_BACKGROUNDCOLOR),
  );
  const background = backgroundColor.toString();
  const titleColor = backgroundColor.isDark() ? COLOR_WHITE_TEXT : COLOR_DARK;

  const close = () => void node.closeDialog?.();
  const handleClose = (_event: object, reason: string) => {
    if (reason === 'backdropClick' && !dismissOnBackdrop) {
      return;
    }
    if (reason === 'escapeKeyDown' && !dismissOnEscape) {
      return;
    }
    close();
  };

  return (
    <Dialog
      open
      // no fullWidth/numeric maxWidth - the Paper shrink-wraps to the
      // surface's own ROOT size (see UIModalNode.getDefaultIO's Layout JSON
      // default) instead of a size forced from here
      maxWidth={false}
      disableEscapeKeyDown={!dismissOnEscape}
      onClose={handleClose}
      data-cy={`modal dialog of NODE_${node.id}`}
      PaperProps={{
        sx: {
          overflow: 'hidden',
          background,
          backgroundImage: 'none',
        },
      }}
    >
      {title ? (
        <DialogTitle sx={{ pr: 6, color: titleColor }}>
          {title}
          <IconButton
            aria-label="close modal"
            data-cy={`modal-close-btn-NODE_${node.id}`}
            onClick={close}
            sx={{ position: 'absolute', right: 8, top: 8, color: titleColor }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
      ) : null}
      <DialogContent sx={{ p: 0 }}>
        <SurfaceRenderer tree={tree} interactive randomMainColor={MAIN_COLOR} />
      </DialogContent>
    </Dialog>
  );
};

// Renders every open UI modal node as a global overlay, independent of whether
// the modal is embedded in another surface. Mounted once in the app.
export const ModalHost: React.FC = () => {
  // re-render when a modal opens/closes (ModalOpenChanged, emitted from
  // UIModalNode.onExecute), when its surface content changes, or when a
  // graph loads (which may already contain open modals)
  useForceUpdateOn([
    ListenEvent.ModalOpenChanged,
    ListenEvent.SurfaceRuntimeChanged,
    ListenEvent.GraphConfigured,
  ]);

  const modals = Object.values(PPGraph.currentGraph.nodes).filter(
    (node: any) => node.isModalDialog?.(),
  ) as unknown as ModalNodeLike[];

  return (
    <>
      {modals.map((node) => (
        <ModalDialogOverlay key={node.id} node={node} />
      ))}
    </>
  );
};
