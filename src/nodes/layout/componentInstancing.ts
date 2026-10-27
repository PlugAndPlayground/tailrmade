// Running a UI surface once "as a component instance".
//
// The definition's inner nodes are single shared copies, exactly as a macro's
// are: a pass writes this instance's arguments into the surface's parameter
// output sockets, runs the inner nodes, and then captures what each of them
// ended up with. That capture - one input object per inner node - is what the
// instance renders from, so N instances of one definition can show N different
// things without the inner nodes being duplicated.
//
// Same shape as Macro.executeMacro (write args, executeChildren, read back),
// and worth collapsing into one shared helper once a second caller needs it.
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import type { ComponentInstanceSnapshots } from '../../components/dashboard/componentInstance';
import { getEmbeddedSurfaceNodes, getLinkedSourceNodeIds } from './surfaceSync';
import type { UISurfaceNode } from './uiSurface';

// arguments keyed by the definition's parameter socket name - never by
// position, because a definition's parameter list has gaps (an unlinked
// parameter in the middle, and the spare one at the end)
export type ComponentArgs = Record<string, unknown>;

// Passes share the definition's sockets, so two of them must never interleave.
// Macro has the same exposure today and no guard; this keeps instances honest
// without changing macro behaviour.
let passQueue: Promise<unknown> = Promise.resolve();

// every node rendered by this surface, following embedded surfaces so a
// component built out of nested surfaces is captured whole
function getRenderedNodeIds(surface: UISurfaceNode): Set<string> {
  const collected = new Set<string>();
  const visitedSurfaces = new Set<string>([surface.id]);
  const queue: UISurfaceNode[] = [surface];
  while (queue.length > 0) {
    const current = queue.shift()!;
    getLinkedSourceNodeIds(current).forEach((nodeId) => collected.add(nodeId));
    getEmbeddedSurfaceNodes(current).forEach((child) => {
      if (!visitedSurfaces.has(child.id)) {
        visitedSurfaces.add(child.id);
        queue.push(child);
      }
    });
  }
  return collected;
}

async function runPass(
  definition: UISurfaceNode,
  args: ComponentArgs,
): Promise<ComponentInstanceSnapshots> {
  definition.getParameterSockets().forEach((parameter) => {
    if (Object.prototype.hasOwnProperty.call(args, parameter.name)) {
      parameter.data = args[parameter.name];
    }
  });

  await definition.executeChildren();

  const snapshots: ComponentInstanceSnapshots = {};
  getRenderedNodeIds(definition).forEach((nodeId) => {
    const node = PPGraph.currentGraph.getNodeById(nodeId);
    if (node) {
      snapshots[nodeId] = PPNode.remapInput(node.inputSocketArray);
    }
  });
  return snapshots;
}

export function runSurfaceAsInstance(
  definition: UISurfaceNode,
  args: ComponentArgs,
): Promise<ComponentInstanceSnapshots> {
  const pass = passQueue.then(() => runPass(definition, args));
  passQueue = pass.catch(() => undefined);
  return pass;
}
