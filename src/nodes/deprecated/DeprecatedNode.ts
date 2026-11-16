import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import {
  NodeReplacement,
  NodeReplacementContext,
  SerializedNode,
} from '../../utils/interfaces';

// A removed node, kept only so saved graphs still load. When a graph with it
// loads, migrate() swaps it for what replaces it, under the same id.
export abstract class DeprecatedNode extends PPNode {
  private savedVersion: number | undefined;

  protected abstract getReplacement(
    node: SerializedNode,
    context: NodeReplacementContext,
  ): NodeReplacement;

  // Above every version the node was saved with before it was removed, so
  // loading any of them migrates.
  public getVersion(): number {
    return 2;
  }

  public showInNodeSearch(): boolean {
    return false;
  }

  public getDescription(): string {
    return 'Removed. It is replaced the next time its graph loads.';
  }

  async configure(
    nodeConfig: SerializedNode,
    includeSocketData = true,
  ): Promise<void> {
    this.savedVersion = nodeConfig.version;
    await super.configure(nodeConfig, includeSocketData);
  }

  // Keeps the version it was saved with: a pasted stub is not migrated, and
  // must still be the next time its graph loads.
  serialize(includeDataForOutputSockets = false): SerializedNode {
    return {
      ...super.serialize(includeDataForOutputSockets),
      version: this.savedVersion,
    };
  }

  public async migrate(): Promise<void> {
    const graph = PPGraph.currentGraph;
    const replacement = this.getReplacement(this.serialize(), {
      links: graph
        .getLinks()
        .map((link) => link.serialize())
        .filter((link) => link !== undefined),
      getNode: (id) => graph.nodes[id]?.serialize(),
    });
    await graph.replaceNodeInPlace(this, replacement);
  }
}
