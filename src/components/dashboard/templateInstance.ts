// The per-placement state the dashboard renderer needs.
//
// A placement renders its template's body surface through the ordinary
// SurfaceRenderer, so every widget in it still resolves through
// getLayoutableElement to the single shared inner node. What makes the
// rendering belong to THIS placement is what is captured here at the end of
// its evaluation pass:
//
// - `snapshots`: the input object each inner node ended up with, handed to the
//   widget as reactUIProps instead of letting it read the shared node's live
//   sockets.
// - `trees`: each rendered surface's craft tree with that pass's runtime
//   overrides already applied. Visibility and per-element layout live on the
//   SURFACE's sockets, which are shared like everything else, so re-deriving
//   them at render time would give every placement the last pass's answer -
//   and a template that shows a number field for a number and a text field for
//   a string would show the same widget in every row.
//
// Deliberately its own module: DynamicWidget.tsx, uiSurface.tsx and the
// template nodes all need it, and SurfaceRenderer.tsx already imports
// DynamicWidget, so putting it there would close an import cycle.
import React from 'react';
import type { SerializedCraftTree } from '../../utils/surfaceTree';

// input object (socket name -> data) per inner node id
export type TemplateInstanceSnapshots = Record<string, Record<string, any>>;

// overrides-applied craft tree per surface node id
export type TemplateInstanceTrees = Record<string, SerializedCraftTree>;

export interface TemplateInstanceCapture {
  snapshots: TemplateInstanceSnapshots;
  trees: TemplateInstanceTrees;
  // what the template's Output sockets held at the end of this pass
  outputs: Record<string, unknown>;
}

export const emptyTemplateCapture = (): TemplateInstanceCapture => ({
  snapshots: {},
  trees: {},
  outputs: {},
});

/**
 * Identifies the placement a widget is being rendered inside, so an edit made
 * in it can be routed to that placement instead of the shared inner node.
 */
// values per inner node id, then socket name
export type TemplateNodeValues = Record<string, Record<string, unknown>>;

/**
 * What a placing node remembers.
 *
 * `rows` holds the viewer's edits, per row key ('' for a single placement).
 *
 * `baseline` is the other half, and it is not optional: the inner nodes are
 * shared, so whatever one pass leaves in a socket is what the next pass starts
 * from. A row that has never been edited would inherit the previous row's
 * value. The baseline is the value a socket had before anyone edited it, and
 * every pass restores it first - so an unedited row shows what the template
 * author set, not what the row above it happens to hold.
 */
export type TemplateEdits = {
  baseline: TemplateNodeValues;
  rows: Record<string, TemplateNodeValues>;
};

export const emptyTemplateEdits = (): TemplateEdits => ({
  baseline: {},
  rows: {},
});

// what one pass applies: the baseline, then that row's edits over it
export type TemplateRowEdits = {
  baseline: TemplateNodeValues;
  edits: TemplateNodeValues;
};

export interface TemplateInstanceHandle {
  ownerId: string;
  rowKey?: string;
}

export interface TemplateInstanceContextValue extends TemplateInstanceCapture {
  // the node this rendering belongs to (Place Template, or Repeat Template)
  ownerId: string;
  // distinguishes rows of one Repeat Template; undefined for a single placement
  rowKey?: string;
}

export const TemplateInstanceContext = React.createContext<
  TemplateInstanceContextValue | undefined
>(undefined);
