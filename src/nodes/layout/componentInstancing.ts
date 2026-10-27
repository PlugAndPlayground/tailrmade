// Running a UI component once "as a placement".
//
// The nodes inside a component frame are single shared copies, exactly as a
// macro's are: a pass writes this placement's arguments into the component's
// parameter output sockets, runs the nodes they feed, and then captures what
// each node rendered by the component's body surface ended up with. That
// capture - one input object per node - is what the placement renders from, so
// N placements can show N different things without anything being duplicated.
//
// Same shape as Macro.executeMacro (write args, executeChildren, read back),
// and worth collapsing into one shared helper once a second caller needs it.
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import type { ComponentInstanceSnapshots } from '../../components/dashboard/componentInstance';
import { getEmbeddedSurfaceNodes, getLinkedSourceNodeIds } from './surfaceSync';
import type { UIComponent } from './uiComponentNode';
import type { UISurfaceNode } from './uiSurface';

// arguments keyed by the component's parameter socket name - never by
// position, because the parameter list has gaps (an unlinked parameter in the
// middle, and the spare one at the end)
export type ComponentArgs = Record<string, unknown>;

// Passes share the component's sockets, so two of them must never interleave.
// Macro has the same exposure today and no guard; this keeps placements honest
// without changing macro behaviour.
let passQueue: Promise<unknown> = Promise.resolve();

// every node rendered by the body surface, following embedded surfaces so a
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
  component: UIComponent,
  args: ComponentArgs,
): Promise<ComponentInstanceSnapshots> {
  component.getParameterSockets().forEach((parameter) => {
    if (Object.prototype.hasOwnProperty.call(args, parameter.name)) {
      parameter.data = args[parameter.name];
    }
  });

  await component.executeChildren();

  const body = component.getBodySurface();
  if (!body) {
    return {};
  }

  const snapshots: ComponentInstanceSnapshots = {};
  getRenderedNodeIds(body).forEach((nodeId) => {
    const node = PPGraph.currentGraph.getNodeById(nodeId);
    if (node) {
      snapshots[nodeId] = PPNode.remapInput(node.inputSocketArray);
    }
  });
  return snapshots;
}

export function runComponentAsInstance(
  component: UIComponent,
  args: ComponentArgs,
): Promise<ComponentInstanceSnapshots> {
  const pass = passQueue.then(() => runPass(component, args));
  passQueue = pass.catch(() => undefined);
  return pass;
}
