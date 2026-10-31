// Running a UI template once "as a placement".
//
// The nodes inside a template frame are single shared copies, exactly as a
// macro's are: a pass writes this placement's arguments into the template's
// parameter output sockets, runs the nodes they feed, and then captures what
// each node rendered by the template's body surface ended up with. That
// capture - one input object per node - is what the placement renders from, so
// N placements can show N different things without anything being duplicated.
//
// Same shape as Macro.executeMacro (write args, executeChildren, read back),
// and worth collapsing into one shared helper once a second caller needs it.
import FlowLogic from '../../classes/FlowLogic';
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import PPSocket from '../../classes/SocketClass';
import {
  emptyTemplateCapture,
  TemplateInstanceCapture,
  TemplateNodeValues,
} from '../../components/dashboard/templateInstance';
import {
  getEmbeddedSurfaceNodes,
  getLinkedSourceNodeIds,
  SurfaceSync,
} from './surfaceSync';
import { getTemplates } from './uiTemplateNode';
import type { UITemplate } from './uiTemplateNode';
import type { UISurfaceNode } from './uiSurface';

// arguments keyed by the template's parameter socket name - never by
// position, because the parameter list has gaps (an unlinked parameter in the
// middle, and the spare one at the end)
export type TemplateArgs = Record<string, unknown>;

// Everything a pass can run: what the parameters feed, and what a placement's
// edits feed, which need not be reached by any parameter.
function getPassNodes(template: UITemplate): PPNode[] {
  const editedNodes = template
    .getPlacements()
    .flatMap((placement) => placement.getEditedNodeIds())
    .map((id) => PPGraph.currentGraph.getNodeById(id))
    .filter((node): node is PPNode => node !== undefined);
  const nodes = new Set<PPNode>();
  [template, ...editedNodes].forEach((root) =>
    FlowLogic.getAllUpDownstreamNodes(root, false, true, false).forEach(
      (node) => nodes.add(node),
    ),
  );
  return [...nodes];
}

/**
 * Marks what a pass runs as this template's body, so none of it lets its socket
 * types drift with one row's data, and releases whatever left since last time.
 * Nodes that merely feed the template see no row data and keep adapting.
 */
export function registerTemplateBody(template: UITemplate): void {
  template.bodyNodes.forEach((node) => node.templateBodyOf.delete(template.id));
  template.bodyNodes = getPassNodes(template);
  template.bodyNodes.forEach((node) => node.templateBodyOf.add(template.id));
}

// A pass that reached a placement of its own template would wait in that
// template's queue for itself to finish.
function placesItself(template: UITemplate, path: string[] = []): boolean {
  if (path.includes(template.id)) {
    return true;
  }
  const nextPath = [...path, template.id];
  return getPassNodes(template).some((node) =>
    getTemplates().some(
      (placed) =>
        node.isPlacingTemplate(placed.nodeName) &&
        placesItself(placed, nextPath),
    ),
  );
}

/** Call once per run, not per row. False when the template cannot run. */
export function prepareTemplateRun(template: UITemplate): boolean {
  registerTemplateBody(template);
  return !placesItself(template);
}

// every surface the body renders, following embedded surfaces so a template
// built out of nested surfaces is captured whole
function getRenderedSurfaces(surface: UISurfaceNode): UISurfaceNode[] {
  const collected: UISurfaceNode[] = [surface];
  const seen = new Set<string>([surface.id]);
  for (let i = 0; i < collected.length; i++) {
    getEmbeddedSurfaceNodes(collected[i]).forEach((child) => {
      if (!seen.has(child.id)) {
        seen.add(child.id);
        collected.push(child);
      }
    });
  }
  return collected;
}

function capturePass(template: UITemplate): TemplateInstanceCapture {
  const capture = emptyTemplateCapture();
  // read before the early return: a template can declare outputs without
  // rendering anything, and those are still this placement's result
  capture.outputs = template.readOutputs();

  const body = template.getBodySurface();
  if (!body) {
    return capture;
  }

  getRenderedSurfaces(body).forEach((surface) => {
    // the tree with THIS pass's visibility and per-element layout baked in -
    // those live on the surface's own sockets, which are shared, so they have
    // to be read now rather than at render time
    capture.trees[surface.id] = SurfaceSync.applyRuntimeOverrides(
      surface,
      surface.getSurfaceTree(),
    );
    getLinkedSourceNodeIds(surface).forEach((nodeId) => {
      const node = PPGraph.currentGraph.getNodeById(nodeId);
      if (node) {
        capture.snapshots[nodeId] = {
          ...PPNode.remapInput(node.inputSocketArray),
          ...node.getTemplateSnapshotProps(),
        };
      }
    });
  });
  return capture;
}

async function runPass(
  template: UITemplate,
  args: TemplateArgs,
  edits: TemplateNodeValues,
  action?: () => Promise<void>,
): Promise<TemplateInstanceCapture> {
  template.getParameterSockets().forEach((parameter) => {
    // A parameter SEEDS the row, and then yields to it. If the viewer has
    // edited a socket this parameter feeds, the edit is written into the
    // parameter itself, so it survives the propagation below - otherwise the
    // parameter would overwrite the edit on every pass and a value could be
    // shown from data or edited, never both.
    const edited = parameter.links
      .map((link) => {
        const target = link.getTarget();
        return edits[target.getNode().id]?.[target.name];
      })
      .find((value) => value !== undefined);
    if (edited !== undefined) {
      parameter.data = edited;
      return;
    }
    if (Object.prototype.hasOwnProperty.call(args, parameter.name)) {
      parameter.data = args[parameter.name];
    }
  });

  // An edit on a socket nothing drives only holds for this pass: the shared
  // node has to go back to what the template author set, or the next row and
  // every other placement would start from this row's edit.
  const authored: [PPSocket, unknown][] = [];
  const editedNodes = new Set<PPNode>();
  Object.entries(edits).forEach(([nodeId, bySocket]) => {
    const node = PPGraph.currentGraph.getNodeById(nodeId);
    Object.entries(bySocket).forEach(([socketName, value]) => {
      const socket = node?.getInputSocketByName(socketName);
      if (node && socket && !socket.hasLink()) {
        authored.push([socket, socket.data]);
        socket.data = value;
        editedNodes.add(node);
      }
    });
  });

  try {
    await FlowLogic.executeOptimizedChainBatch(
      [
        ...new Set([
          ...Object.values(template.getDirectDependents()).filter(
            (node) => node.updateBehaviour.update,
          ),
          ...editedNodes,
        ]),
      ],
      template.id,
    );
    await action?.();
    return capturePass(template);
  } finally {
    authored.forEach(([socket, value]) => {
      socket.data = value;
    });
    // a node no parameter reaches would otherwise keep this row's outputs
    if (editedNodes.size > 0) {
      await FlowLogic.executeOptimizedChainBatch([...editedNodes], template.id);
    }
  }
}

// Passes share the template's sockets, so two of them must never interleave.
// The queue is per template: a pass of one template can run a placement of
// another, and prepareTemplateRun rules out that ever coming back around.
// Macro has the same exposure today and no guard; this keeps placements honest
// without changing macro behaviour.
export function runTemplateAsInstance(
  template: UITemplate,
  args: TemplateArgs,
  edits: TemplateNodeValues = {},
  action?: () => Promise<void>,
): Promise<TemplateInstanceCapture> {
  const pass = template.passQueue.then(() =>
    runPass(template, args, edits, action),
  );
  template.passQueue = pass.catch(() => undefined);
  return pass;
}
