// What Place Template and Repeat Template have in common: which template they
// place, the edits made in their placements, and rendering one placement.
//
// Deliberately not exported from a module allNodes.ts lists, which would
// register this abstract class as a node.
import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import HybridNode2 from '../../classes/HybridNode2';
import { NodeExecutionError } from '../../classes/ErrorClass';
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import PPSocket from '../../classes/SocketClass';
import {
  SurfaceCanvasPreviewContext,
  SurfaceRenderer,
  SurfaceVisitedContext,
} from '../../components/dashboard/SurfaceRenderer';
import {
  TemplateEdits,
  TemplateInstanceCapture,
  TemplateInstanceContext,
  TemplateNodeValues,
} from '../../components/dashboard/templateInstance';
import { getPageDashboardIcon } from '../../components/dashboard/dashboardIcons';
import { DynamicEnumType } from '../datatypes/dynamicEnumType';
import { EnumStructure } from '../datatypes/enumType';
import { JSONType } from '../datatypes/jsonType';
import { TRgba } from '../../utils/color';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import {
  templateEditsSocketName,
  templateSocketName,
  templateUISocketName,
} from '../../utils/constants_shared';
import {
  DashboardIconProps,
  Layoutable,
  WidgetProps,
} from '../../utils/interfaces';
import {
  prepareTemplateRun,
  runTemplateAsInstance,
  TemplateArgs,
} from './templateInstancing';
import { getTemplates, UITemplate } from './uiTemplateNode';

export const TemplateNotice: React.FunctionComponent<{
  label: string;
  color?: string;
}> = ({ label, color = 'warning.main' }) => (
  <Box
    sx={{
      width: '100%',
      p: 1,
      color,
      fontSize: '12px',
      textAlign: 'center',
    }}
  >
    {label}
  </Box>
);

/** Why a placement cannot render, if it cannot. */
export function getPlacementProblem(
  templateName: unknown,
  template: UITemplate | undefined,
  visited: string[],
): string | undefined {
  if (!template) {
    const name = String(templateName ?? '');
    return name ? `Template "${name}" not found` : 'No template selected';
  }
  const body = template.getBodySurface();
  if (!body) {
    return `"${template.nodeName}" has no UI surface plugged into its ${templateUISocketName} input`;
  }
  // the guard embedded surfaces already use, keyed on the body surface - two
  // placements of one template are fine, a template inside itself is not
  if (visited.includes(body.id)) {
    return `Recursive template (${template.nodeName}) - not rendered`;
  }
  return undefined;
}

type TemplateBodyProps = {
  ownerId: string;
  rowKey?: string;
  capture: TemplateInstanceCapture;
  tree: Parameters<typeof SurfaceRenderer>[0]['tree'];
  visited: string[];
  isCanvasPreview: boolean;
  interactive: boolean;
};

// Memoized on the capture: a row whose capture did not change has nothing new
// to show, whatever its owner re-rendered for.
export const TemplateBody = React.memo(function TemplateBody({
  ownerId,
  rowKey,
  capture,
  tree,
  visited,
  isCanvasPreview,
  interactive,
}: TemplateBodyProps) {
  const instance = useMemo(
    () => ({ ownerId, rowKey, ...capture }),
    [ownerId, rowKey, capture],
  );
  return (
    <TemplateInstanceContext.Provider value={instance}>
      <SurfaceCanvasPreviewContext.Provider value={isCanvasPreview}>
        <SurfaceVisitedContext.Provider value={visited}>
          <SurfaceRenderer tree={tree} interactive={interactive} />
        </SurfaceVisitedContext.Provider>
      </SurfaceCanvasPreviewContext.Provider>
    </TemplateInstanceContext.Provider>
  );
});

export abstract class TemplatePlacementNode
  extends HybridNode2
  implements Layoutable
{
  // A placement is placed to be seen, so it is never "unused".
  public getSeemsUnused(): boolean {
    return false;
  }

  public getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.LAYOUT);
  }

  public getMinNodeWidth(): number {
    return 300;
  }

  public getDefaultNodeHeight(): number {
    return 300;
  }

  public getWidgetProps(): WidgetProps {
    return { ...super.getWidgetProps(), height: 'auto' };
  }

  public getDashboardIcon(_props: DashboardIconProps): React.ReactNode {
    return getPageDashboardIcon();
  }

  protected getTemplateSelectSocket(): PPSocket {
    const options = (): EnumStructure =>
      getTemplates().map((template) => ({ text: template.nodeName }));
    return new PPSocket(
      SOCKET_TYPE.IN,
      templateSocketName,
      new DynamicEnumType(options, () => {
        this.updateTemplateSockets();
        void this.executeOptimizedChain();
      }),
      '',
      true,
    );
  }

  protected getEditsSocket(): PPSocket {
    return new PPSocket(
      SOCKET_TYPE.IN,
      templateEditsSocketName,
      new JSONType(),
      {},
      false,
    );
  }

  public getTemplate(): UITemplate | undefined {
    const name = String(this.getInputData(templateSocketName) ?? '').trim();
    if (!name) {
      return undefined;
    }
    return getTemplates().find((template) => template.nodeName === name);
  }

  public isPlacingTemplate(templateName: string): boolean {
    return this.getInputData(templateSocketName) === templateName;
  }

  public placedTemplateChangedName(_oldName: string, newName: string): void {
    this.setInputData(templateSocketName, newName);
  }

  // lets surface-embedding loop detection see through this placement
  public getTemplateBodySurface(): PPNode | undefined {
    return this.getTemplate()?.getBodySurface();
  }

  // the sockets that depend on which template is placed
  public abstract updateTemplateSockets(): void;

  public placedTemplateUpdatedMeta(_template: PPNode): void {
    this.updateTemplateSockets();
  }

  // Also how a template set by the AI or undo arrives: a socket value set from
  // outside never goes through the dropdown's onChange.
  public socketChangedFromWidget(): void {
    this.updateTemplateSockets();
    super.socketChangedFromWidget();
  }

  // ---- per-placement edits ---------------------------------------------

  private getEdits(): TemplateEdits {
    const stored = this.getInputData(templateEditsSocketName);
    return { rows: stored?.rows ?? {} };
  }

  protected getRowEdits(rowKey: string | undefined): TemplateNodeValues {
    return this.getEdits().rows[rowKey ?? ''] ?? {};
  }

  public getEditedNodeIds(): string[] {
    return Object.values(this.getEdits().rows).flatMap((nodes) =>
      Object.keys(nodes),
    );
  }

  public async applyTemplateEdit(
    rowKey: string | undefined,
    nodeId: string,
    socketName: string,
    value: unknown,
  ): Promise<void> {
    const edits = structuredClone(this.getEdits());
    const rowEdits = (edits.rows[rowKey ?? ''] ??= {});
    // A parameter holds one value per row, so the latest edit of any socket it
    // feeds replaces earlier edits of the others - with both kept, only one
    // could ever reach the parameter and the newer one might be dropped.
    PPGraph.currentGraph
      .getNodeById(nodeId)
      ?.getInputSocketByName(socketName)
      ?.links[0]?.getSource()
      .links.forEach((link) => {
        const target = link.getTarget();
        delete rowEdits[target.getNode().id]?.[target.name];
      });
    (rowEdits[nodeId] ??= {})[socketName] = value;
    this.setInputData(templateEditsSocketName, edits);
    await this.runInTemplateRow(rowKey);
  }

  // ---- evaluating ------------------------------------------------------

  /** Throws what the node's status should show when the template cannot run. */
  protected prepareRun(template: UITemplate): void {
    if (!prepareTemplateRun(template)) {
      throw new NodeExecutionError(
        `Template "${template.nodeName}" places itself, so it cannot run`,
      );
    }
  }

  // The arguments of one known row, undefined if there is no such row.
  protected abstract getRowArgs(
    template: UITemplate,
    rowKey: string | undefined,
  ): TemplateArgs | undefined;

  protected abstract storeRowCapture(
    rowKey: string | undefined,
    capture: TemplateInstanceCapture,
  ): void;

  /**
   * One row only, because the other rows' values did not change: a full run
   * costs a pass per row, on every keystroke. Falls back to one when this row
   * cannot be run alone, which also lets a run in flight pick the change up -
   * it may already be past this row, and it would overwrite the result.
   */
  public async runInTemplateRow(
    rowKey: string | undefined,
    action?: () => Promise<void>,
  ): Promise<void> {
    const template = this.getTemplate();
    const args = template && this.getRowArgs(template, rowKey);
    if (
      !template ||
      !args ||
      !prepareTemplateRun(template) ||
      (this.isExecuting && !action)
    ) {
      await this.executeOptimizedChain();
      return;
    }
    const capture = await runTemplateAsInstance(
      template,
      args,
      this.getRowEdits(rowKey),
      action,
    );
    this.storeRowCapture(rowKey, capture);
    this.forceRerender();
    await this.executeChildren();
  }
}
