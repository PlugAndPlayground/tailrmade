// Repeat Template: one placement of a UI template per entry of an array or
// object.
//
// Same evaluation engine as Place Template, run once per entry. The name is
// deliberately not "grid": columns is a setting, so the same node has to be
// right for one column, a row and a wrapped grid - and "Widget grid array"
// already exists in this space.
//
// Read-only for now. Collecting edits back out needs per-row writes, which is
// the write path; see the design doc's step 4.
import React, { useContext } from 'react';
import { Box } from '@mui/material';
import HybridNode2, {
  HybridWidgetContentProps,
} from '../../classes/HybridNode2';
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import PPSocket from '../../classes/SocketClass';
import {
  SurfaceCanvasPreviewContext,
  SurfaceRenderer,
  SurfaceVisitedContext,
} from '../../components/dashboard/SurfaceRenderer';
import {
  emptyTemplateCapture,
  TemplateEdits,
  emptyTemplateEdits,
  TemplateInstanceCapture,
  TemplateInstanceContext,
  TemplateRowEdits,
} from '../../components/dashboard/templateInstance';
import { getPageDashboardIcon } from '../../components/dashboard/dashboardIcons';
import { DynamicEnumType } from '../datatypes/dynamicEnumType';
import { EnumStructure, EnumType } from '../datatypes/enumType';
import { JSONType } from '../datatypes/jsonType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import { TRgba } from '../../utils/color';
import { AGENT_DOCS_HEADING } from '../../utils/nodeDocs';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import {
  templateEditsSocketName,
  templateOutputPrefixName,
  templateSocketName,
  templateUISocketName,
} from '../../utils/constants_shared';
import { SOCKET_NAME_DASHBOARD_CONTENT } from '../../utils/layoutableHelpers';
import {
  DashboardIconProps,
  Layoutable,
  WidgetProps,
} from '../../utils/interfaces';
import { runTemplateAsInstance } from './templateInstancing';
import { getTemplates, UITemplate } from './uiTemplateNode';

const itemsSocketName = 'Items';
const directionSocketName = 'Direction';
const columnsSocketName = 'Columns';
const gapSocketName = 'Gap';
const maxItemsSocketName = 'Max items';
const keyFieldSocketName = 'Key field';
const emptyTextSocketName = 'Empty text';
const outName = 'Output';

const DIRECTION_OPTIONS: EnumStructure = [{ text: 'column' }, { text: 'row' }];

// Parameter names the repeater fills itself, whatever the entry looks like.
// Anything else is matched against the entry's own fields by name.
const ENTRY_PARAMETER_NAMES = ['entry', 'item', 'value'];
// deliberately NOT 'label': a parameter feeding a widget's Label socket is
// named "Label", and almost always wants the entry itself rather than the key
const KEY_PARAMETER_NAMES = ['key', 'index'];

export interface TemplateRow {
  key: string;
  label: string;
  entry: unknown;
  capture: TemplateInstanceCapture;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The entries to repeat over, as [key, value] pairs, for arrays and objects. */
export function toEntries(items: unknown): [string, unknown][] {
  if (Array.isArray(items)) {
    return items.map((value, index) => [String(index), value]);
  }
  if (isPlainObject(items)) {
    return Object.entries(items);
  }
  if (items === undefined || items === null || items === '') {
    return [];
  }
  // a single scalar is a one-row repeat, which beats rendering nothing
  return [['0', items]];
}

/**
 * Binds one entry to the template's parameters by NAME, so a template needs no
 * per-column mapping UI:
 * - a parameter called entry/item/value gets the whole entry
 * - a parameter called key/label/index gets the key
 * - any other parameter gets the entry's field of that name
 * - if the entry is not an object, an unmatched parameter gets the entry
 *
 * Matching is on the parameter's DISPLAY name (the name of the socket it
 * feeds), because that is the name the user sees and types against.
 */
export function bindEntryToParameters(
  template: UITemplate,
  key: string,
  entry: unknown,
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  template.getParameterSockets().forEach((parameter) => {
    if (!parameter.hasLink()) {
      return;
    }
    const shown = template.getSocketDisplayName(parameter).trim().toLowerCase();
    if (KEY_PARAMETER_NAMES.includes(shown)) {
      args[parameter.name] = key;
    } else if (ENTRY_PARAMETER_NAMES.includes(shown)) {
      args[parameter.name] = entry;
    } else if (isPlainObject(entry)) {
      const field = Object.keys(entry).find(
        (name) => name.trim().toLowerCase() === shown,
      );
      args[parameter.name] = field === undefined ? undefined : entry[field];
    } else {
      args[parameter.name] = entry;
    }
  });
  return args;
}

const Notice: React.FunctionComponent<{ label: string }> = ({ label }) => (
  <Box
    sx={{
      width: '100%',
      p: 1,
      color: 'text.secondary',
      fontSize: '12px',
      textAlign: 'center',
    }}
  >
    {label}
  </Box>
);

export const RepeatTemplateWidget: React.FunctionComponent<
  HybridWidgetContentProps<RepeatTemplate>
> = (props) => {
  const node = props.node;
  const visited = useContext(SurfaceVisitedContext);
  const isCanvasPreview =
    useContext(SurfaceCanvasPreviewContext) || !props.inDashboard;
  const template = node.getTemplate();
  const body = template?.getBodySurface();
  const rows = node.rows;

  if (!template) {
    const name = String(props[templateSocketName] ?? '');
    return (
      <Notice
        label={name ? `Template "${name}" not found` : 'No template selected'}
      />
    );
  }

  if (!body) {
    return (
      <Notice
        label={`"${template.nodeName}" has no UI surface plugged into its ${templateUISocketName} input`}
      />
    );
  }

  if (visited.includes(body.id)) {
    return (
      <Notice label={`Recursive template (${template.nodeName}) - skipped`} />
    );
  }

  if (rows.length === 0) {
    return <Notice label={String(props[emptyTextSocketName] ?? '')} />;
  }

  const direction = props[directionSocketName] === 'row' ? 'row' : 'column';
  const columns = Math.max(
    1,
    Math.round(Number(props[columnsSocketName]) || 1),
  );
  const gap = Math.max(0, Number(props[gapSocketName]) || 0);

  return (
    <Box
      data-cy={`repeat-template of ${node.id}`}
      sx={{
        display: 'grid',
        gap: `${gap}px`,
        width: '100%',
        // one column is a list, several is a grid, and a row direction lays
        // the same rows out side by side - all the same node
        gridTemplateColumns:
          direction === 'row' && columns === 1
            ? `repeat(${rows.length}, minmax(0, 1fr))`
            : `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoFlow: direction === 'row' ? 'column' : 'row',
      }}
    >
      {rows.map((row) => (
        <TemplateInstanceContext.Provider
          key={row.key}
          value={{ ownerId: node.id, rowKey: row.key, ...row.capture }}
        >
          <SurfaceCanvasPreviewContext.Provider value={isCanvasPreview}>
            <SurfaceVisitedContext.Provider value={[...visited, body.id]}>
              <SurfaceRenderer
                tree={row.capture.trees[body.id] ?? {}}
                interactive={Boolean(props.inDashboard) && !props.disabled}
              />
            </SurfaceVisitedContext.Provider>
          </SurfaceCanvasPreviewContext.Provider>
        </TemplateInstanceContext.Provider>
      ))}
    </Box>
  );
};

export class RepeatTemplate extends HybridNode2 implements Layoutable {
  // one evaluated row per entry, in render order
  rows: TemplateRow[] = [];

  public getSeemsUnused(): boolean {
    return false;
  }

  public getName(): string {
    return 'Repeat Template';
  }

  public getDescription(): string {
    return 'Show a UI template once per entry of an array or object';
  }

  public getDocs(): string {
    return `Repeats a "UI Template" over data: one placement per entry of an
array or an object, each with its own values.

Pick the template under "${templateSocketName}" and feed "${itemsSocketName}"
an array or a JSON object. Each entry becomes one placement.

Entries are bound to the template's parameters by NAME, so there is no mapping
to configure:
- a parameter called entry, item or value gets the whole entry
- a parameter called key or index gets the entry's key (an object's key, an
  array's index)
- any other parameter gets the entry's field of the same name
- if the entry is not an object, an unmatched parameter gets the entry itself

"${directionSocketName}" and "${columnsSocketName}" decide the layout: one
column is a list, several is a grid, and a row direction puts the entries side
by side. "${keyFieldSocketName}" names the field that identifies a row, which
keeps rows stable when the data is reordered. "${maxItemsSocketName}" caps how
many are rendered - every row costs one evaluation of the template, so an
unbounded array is slow.

Rows render read-only, so nothing comes back out of them yet. A template's
"${templateOutputPrefixName}" values are collected per row into this node's
"${outName}".

${AGENT_DOCS_HEADING}
The template is referenced by NAME, and template names are kept unique.`;
  }

  public getTags(): string[] {
    return ['Widget', 'Layout', 'Template', 'Array'];
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

  static getTemplateOptions(): EnumStructure {
    return getTemplates().map((template) => ({ text: template.nodeName }));
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.IN,
        templateSocketName,
        new DynamicEnumType(
          () => RepeatTemplate.getTemplateOptions(),
          () => void this.executeOptimizedChain(),
        ),
        '',
        true,
      ),
      new PPSocket(SOCKET_TYPE.IN, itemsSocketName, new JSONType(), [], true),
      new PPSocket(
        SOCKET_TYPE.IN,
        directionSocketName,
        new EnumType(DIRECTION_OPTIONS),
        'column',
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        columnsSocketName,
        new NumberType(true, 1, 12),
        1,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        gapSocketName,
        new NumberType(true, 0, 64),
        8,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        keyFieldSocketName,
        new StringType(),
        '',
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        maxItemsSocketName,
        new NumberType(true, 1, 500),
        50,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        emptyTextSocketName,
        new StringType(),
        'Nothing to show',
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        templateEditsSocketName,
        new JSONType(),
        {},
        false,
      ),
      new PPSocket(SOCKET_TYPE.OUT, outName, new JSONType()),
    ];
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

  public placedTemplateUpdatedMeta(_template: PPNode): void {
    void this.executeOptimizedChain();
  }

  // A row's identity, so edits and React keys survive a reorder. Prefers the
  // named key field, falls back to the entry's own key (an object key is
  // stable, an array index is not - which is why the field exists).
  private getRowKey(key: string, entry: unknown): string {
    const field = String(this.getInputData(keyFieldSocketName) ?? '').trim();
    if (field && isPlainObject(entry) && entry[field] !== undefined) {
      return String(entry[field]);
    }
    return key;
  }

  // ---- per-placement edits ---------------------------------------------

  private getEdits(): TemplateEdits {
    const stored = this.getInputData(templateEditsSocketName);
    if (!stored || typeof stored !== 'object') {
      return emptyTemplateEdits();
    }
    const edits = stored as Partial<TemplateEdits>;
    return { baseline: edits.baseline ?? {}, rows: edits.rows ?? {} };
  }

  public getRowEdits(rowKey: string | undefined): TemplateRowEdits {
    const edits = this.getEdits();
    return {
      baseline: edits.baseline,
      edits: edits.rows[rowKey ?? ''] ?? {},
    };
  }

  public getTemplateEdit(
    rowKey: string | undefined,
    nodeId: string,
    socketName: string,
  ): unknown {
    return this.getEdits().rows[rowKey ?? '']?.[nodeId]?.[socketName];
  }

  public setTemplateEdit(
    rowKey: string | undefined,
    nodeId: string,
    socketName: string,
    value: unknown,
  ): void {
    const edits = structuredClone(this.getEdits());
    // The first edit of a socket records what it held beforehand. At that
    // moment no row has edited it, so the shared node still carries the value
    // the template author set - which is what every unedited row must show.
    if (edits.baseline[nodeId]?.[socketName] === undefined) {
      const node = PPGraph.currentGraph.getNodeById(nodeId);
      if (node?.getInputSocketByName(socketName)) {
        (edits.baseline[nodeId] ??= {})[socketName] =
          node.getInputData(socketName);
      }
    }
    ((edits.rows[rowKey ?? ''] ??= {})[nodeId] ??= {})[socketName] = value;
    this.setInputData(templateEditsSocketName, edits);
  }

  // lets surface-embedding loop detection see through this placement
  public getTemplateBodySurface(): PPNode | undefined {
    return this.getTemplate()?.getBodySurface();
  }

  public getWidgetProps(): WidgetProps {
    return { ...super.getWidgetProps(), height: 'auto' };
  }

  public getDashboardIcon(_props: DashboardIconProps): React.ReactNode {
    return getPageDashboardIcon();
  }

  getWidgetContent(
    props: HybridWidgetContentProps<RepeatTemplate>,
  ): React.ReactElement {
    return <RepeatTemplateWidget {...props} />;
  }

  // Not HybridNode2.onExecute: it structuredClones the input for its own
  // reactUIProps, which throws on anything non-cloneable the items may carry.
  protected async onExecute(input: any, output: any): Promise<void> {
    const template = this.getTemplate();
    const entries = toEntries(input[itemsSocketName]).slice(
      0,
      Math.max(1, Math.round(Number(input[maxItemsSocketName]) || 1)),
    );

    const rows: TemplateRow[] = [];
    if (template) {
      // sequential on purpose: every row writes the same shared parameter
      // sockets, so the passes must not interleave
      for (const [key, entry] of entries) {
        const rowKey = this.getRowKey(key, entry);
        const capture = await runTemplateAsInstance(
          template,
          bindEntryToParameters(template, key, entry),
          this.getRowEdits(rowKey),
        );
        rows.push({
          key: rowKey,
          label: key,
          entry,
          capture,
        });
      }
    }
    this.rows = rows;

    // the template's declared Outputs, collected per row in the shape that
    // came in: an object keeps its keys, an array stays an array
    const collected = rows.map((row) => {
      const values = Object.values(row.capture.outputs);
      return values.length === 1 ? values[0] : row.capture.outputs;
    });
    output[outName] = Array.isArray(input[itemsSocketName])
      ? collected
      : Object.fromEntries(rows.map((row, i) => [row.label, collected[i]]));

    if (this.getOutputSocketByName(SOCKET_NAME_DASHBOARD_CONTENT)?.hasLink()) {
      output[SOCKET_NAME_DASHBOARD_CONTENT] = {
        renderFunction: (wrapperProps) =>
          this.getDashboardWrapper(wrapperProps),
        nodeId: this.id,
      };
    }
    this.callRender(input);
  }
}
