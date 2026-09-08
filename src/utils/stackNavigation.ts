// Where the stack layout lands after an app is opened. On a phone the apps
// list is a destination you leave the moment you pick something, and which
// view it hands over to depends on what the app has: its UI is what you came
// for, and an app without one has nothing to show there.

import { RootName } from './constants_shared';
import { setStackView } from './layoutModel';

// Structurally typed rather than PPGraph/PPNode-typed, so the phone's
// navigation rule stays free of the node layer and therefore of pixi.
type SurfaceCandidate = {
  isSurface: () => boolean;
  getSurfaceTree?: () => Record<string, { nodes?: string[] } | undefined>;
};

export type GraphWithNodes = { nodes: Record<string, SurfaceCandidate> };

/**
 * Does this graph have any UI worth opening? A graph can carry a surface node
 * that was never filled in - the dashboard auto-creates one the first time it
 * is edited - so the question is not whether there is a surface but whether
 * any surface holds anything.
 */
export const graphHasUI = (graph: GraphWithNodes): boolean =>
  Object.values(graph.nodes).some(
    (node) =>
      node.isSurface() &&
      (node.getSurfaceTree?.()[RootName]?.nodes?.length ?? 0) > 0,
  );

export const goToOpenedApp = (graph: GraphWithNodes): void =>
  setStackView(graphHasUI(graph) ? 'ui' : 'graph');
