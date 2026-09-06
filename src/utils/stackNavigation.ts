// Where the stack layout should land after an app is opened.
//
// On a phone the apps list is a destination you leave the moment you pick
// something: staying on it would mean the tap did nothing visible. Which view
// it hands over to depends on what the app actually has - an app with a UI is
// the thing you came for, and one without a UI has nothing to show there, so
// the graph is the only honest answer.

import { RootName } from './constants_shared';
import { setStackView, StackView } from './layoutModel';

// Structurally typed rather than PPGraph/PPNode-typed on purpose: this is the
// phone's navigation rule, and keeping it free of the node layer keeps it
// free of pixi - so it stays a plain function anything can call and a test can
// exercise without a graph.
type SurfaceCandidate = {
  isSurface?: () => boolean;
  getSurfaceTree?: () => Record<string, { nodes?: string[] } | undefined>;
};

export type GraphWithNodes = { nodes: Record<string, SurfaceCandidate> };

/**
 * Does this graph have any UI worth opening?
 *
 * UI lives in UI surface nodes, each holding a craft tree whose ROOT lists the
 * widgets on it. A graph can carry a surface node that was never filled in
 * (the dashboard auto-creates one the first time it is edited), so the
 * question is not "is there a surface" but "does any surface hold anything".
 */
export const graphHasUI = (graph: GraphWithNodes | undefined): boolean => {
  if (!graph) {
    return false;
  }
  return Object.values(graph.nodes ?? {}).some((node) => {
    if (!node?.isSurface?.() || !node.getSurfaceTree) {
      return false;
    }
    try {
      return (node.getSurfaceTree()[RootName]?.nodes?.length ?? 0) > 0;
    } catch {
      // a surface whose Layout JSON cannot be read is not a UI to open
      return false;
    }
  });
};

export const viewForOpenedApp = (
  graph: GraphWithNodes | undefined,
): StackView => (graphHasUI(graph) ? 'ui' : 'graph');

export const goToOpenedApp = (graph: GraphWithNodes | undefined): void => {
  setStackView(viewForOpenedApp(graph));
};
