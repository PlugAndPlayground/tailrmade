// The one piece of per-instance state the dashboard renderer needs.
//
// A UI component instance renders its definition surface's tree through the
// ordinary SurfaceRenderer, so every widget in it still resolves through
// getLayoutableElement to the single shared inner node. What makes the
// rendering belong to THIS instance is the snapshot below: the input object
// each inner node had at the end of this instance's evaluation pass, which
// DynamicWidgetView hands to the widget as reactUIProps instead of letting it
// read the shared node's live sockets.
//
// Deliberately its own module: DynamicWidget.tsx and the component node both
// need it, and SurfaceRenderer.tsx already imports DynamicWidget, so putting
// it there would close an import cycle.
import React from 'react';

// input object (socket name -> data) per inner node id
export type ComponentInstanceSnapshots = Record<string, Record<string, any>>;

export interface ComponentInstanceContextValue {
  // the UIComponentInstance node this rendering belongs to
  ownerId: string;
  snapshots: ComponentInstanceSnapshots;
}

export const ComponentInstanceContext = React.createContext<
  ComponentInstanceContextValue | undefined
>(undefined);
