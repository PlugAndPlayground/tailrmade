// The nodes that own template placements, as seen from code that must not import
// them: NodeClass is their base class, and the dashboard module brings in React.
import type {
  TemplateNodeValues,
  TemplateRowRef,
} from '../components/dashboard/templateInstance';
import type PPNode from '../classes/NodeClass';

export interface TemplateOwner {
  /** Resolves to the row's edits from before this one, which is what undo needs. */
  applyTemplateEdit(
    rowKey: string | undefined,
    nodeId: string,
    values: Record<string, unknown>,
    parent?: TemplateRowRef,
  ): Promise<TemplateNodeValues>;
  restoreRowEdits(
    rowKey: string | undefined,
    rowEdits: TemplateNodeValues,
    parent?: TemplateRowRef,
  ): Promise<void>;
  /** Re-evaluates one row, running `action` while its values are in the shared nodes. */
  runInTemplateRow(
    rowKey: string | undefined,
    action?: () => Promise<void>,
    parent?: TemplateRowRef,
  ): Promise<void>;
}

export const isTemplateOwner = (node: object): node is TemplateOwner =>
  'applyTemplateEdit' in node;

// What a UI template asks of the nodes that place it, as seen from code that
// iterates every node in the graph or must not import the placement module.
export interface TemplatePlacement {
  isPlacingTemplate(templateName: string): boolean;
  placedTemplateChangedName(oldName: string, newName: string): void;
  // the template's parameters changed
  placedTemplateUpdatedMeta(): void;
  // the template's contents changed
  placedTemplateUpdated(): void;
  // the surface this placement embeds, for surface loop detection
  getTemplateBodySurface(): PPNode | undefined;
  // what a snapshot taken during a pass adds, for a placement nested in a template
  getTemplateSnapshotProps(): Record<string, unknown>;
}

export const isTemplatePlacement = (
  node: object | undefined,
): node is TemplatePlacement =>
  node !== undefined && 'isPlacingTemplate' in node;
