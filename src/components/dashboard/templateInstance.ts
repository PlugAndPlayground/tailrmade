// What a placement renders from, captured at the end of its pass. Its widgets
// still resolve to the single shared inner nodes, so their inputs (`snapshots`)
// and each surface's visibility and layout overrides (`trees`) have to be read
// then, or every placement would show the last pass's values.
//
// Its own module because SurfaceRenderer.tsx imports DynamicWidget, which needs
// this.
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

// values per inner node id, then socket name
export type TemplateNodeValues = Record<string, Record<string, unknown>>;

// The viewer's edits, per row key ('' for a single placement). They are applied
// for the length of that row's pass, so the shared nodes keep what the template
// author set.
export type TemplateEdits = {
  rows: Record<string, TemplateNodeValues>;
};

// A nested placement's own state travels inside the snapshot its parent's pass
// took of it, because the node is shared between the parent's rows.
export const TEMPLATE_PLACED_STATE_PROP = '__templatePlacedState';

// the placement a widget is rendered inside, which its edits are routed to
export interface TemplateInstanceHandle {
  ownerId: string;
  rowKey?: string;
  // the input object this widget was rendered from
  snapshot?: Record<string, unknown>;
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
