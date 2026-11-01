// The nodes that own template placements, as seen from code that must not import
// them: NodeClass is their base class, and the dashboard module brings in React.
import type { TemplateNodeValues } from '../components/dashboard/templateInstance';

export interface TemplateOwner {
  /** Resolves to the row's edits from before this one, which is what undo needs. */
  applyTemplateEdit(
    rowKey: string | undefined,
    nodeId: string,
    socketName: string,
    value: unknown,
  ): Promise<TemplateNodeValues>;
  restoreRowEdits(
    rowKey: string | undefined,
    rowEdits: TemplateNodeValues,
  ): Promise<void>;
  /** Re-evaluates one row, running `action` while its values are in the shared nodes. */
  runInTemplateRow(
    rowKey: string | undefined,
    action?: () => Promise<void>,
  ): Promise<void>;
}

export const isTemplateOwner = (node: object): node is TemplateOwner =>
  'applyTemplateEdit' in node;
