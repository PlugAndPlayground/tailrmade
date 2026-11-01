// Repeat Template: one placement of a UI template per entry of an array or
// object. Not called "grid": columns is a setting, and "Widget grid array"
// already exists.
import React, { useContext, useMemo } from 'react';
import { Box } from '@mui/material';
import { HybridWidgetContentProps } from '../../classes/HybridNode2';
import PPNode from '../../classes/NodeClass';
import PPSocket from '../../classes/SocketClass';
import {
  SurfaceCanvasPreviewContext,
  SurfaceVisitedContext,
} from '../../components/dashboard/SurfaceRenderer';
import {
  TEMPLATE_PLACED_STATE_PROP,
  TemplateInstanceCapture,
} from '../../components/dashboard/templateInstance';
import { EnumStructure, EnumType } from '../datatypes/enumType';
import { JSONType } from '../datatypes/jsonType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import { AGENT_DOCS_HEADING } from '../../utils/nodeDocs';
import { SOCKET_TYPE } from '../../utils/constants';
import {
  templateOutputPrefixName,
  templateSocketName,
} from '../../utils/constants_shared';
import { SOCKET_NAME_DASHBOARD_CONTENT } from '../../utils/layoutableHelpers';
import { runTemplateAsInstance, TemplateArgs } from './templateInstancing';
import {
  getPlacementProblem,
  TemplateBody,
  TemplateNotice,
  TemplatePlacementNode,
} from './templatePlacement';
import type { UITemplate } from './uiTemplateNode';

const itemsSocketName = 'Items';
const directionSocketName = 'Direction';
const columnsSocketName = 'Columns';
const gapSocketName = 'Gap';
const maxItemsSocketName = 'Max items';
const keyFieldSocketName = 'Key field';
const emptyTextSocketName = 'Empty text';
const outName = 'Output';
const EMPTY_TREE = {};

const DIRECTION_OPTIONS: EnumStructure = [{ text: 'column' }, { text: 'row' }];

// Parameter names the repeater fills itself, whatever the entry looks like.
// Anything else is matched against the entry's own fields by name.
const ENTRY_PARAMETER_NAMES = ['entry', 'item', 'value'];
const FIELD_SOCKET_SUFFIX = ' from';
const fieldSocketNameFor = (parameterName: string): string =>
  `${parameterName}${FIELD_SOCKET_SUFFIX}`;
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
 * - a parameter called key/index gets the key
 * - any other parameter gets the entry's field of that name
 * - if the entry is not an object, an unmatched parameter gets the entry
 *
 * Matching is on the parameter's display name, the one the user sees.
 */
export function bindEntryToParameters(
  template: UITemplate,
  key: string,
  entry: unknown,
  overrides: Record<string, string> = {},
): Record<string, unknown> {
  const findField = (wanted: string): string | undefined =>
    isPlainObject(entry)
      ? Object.keys(entry).find((name) => name.trim().toLowerCase() === wanted)
      : undefined;
  const pick = (wanted: string): unknown => {
    if (KEY_PARAMETER_NAMES.includes(wanted)) {
      return key;
    }
    if (ENTRY_PARAMETER_NAMES.includes(wanted)) {
      return entry;
    }
    if (isPlainObject(entry)) {
      const field = findField(wanted);
      return field === undefined ? undefined : entry[field];
    }
    // a scalar entry has only itself to give
    return entry;
  };

  const args: Record<string, unknown> = {};
  template.getParameterSockets().forEach((parameter) => {
    if (!parameter.hasLink()) {
      return;
    }
    const override = (overrides[parameter.name] ?? '').trim().toLowerCase();
    // naming a field outright means that field, even one called key or value
    const overrideField = override ? findField(override) : undefined;
    args[parameter.name] =
      overrideField !== undefined
        ? (entry as Record<string, unknown>)[overrideField]
        : pick(
            override ||
              template.getSocketDisplayName(parameter).trim().toLowerCase(),
          );
  });
  return args;
}

export const RepeatTemplateWidget: React.FunctionComponent<
  HybridWidgetContentProps<RepeatTemplate>
> = (props) => {
  const node = props.node;
  const visited = useContext(SurfaceVisitedContext);
  const isCanvasPreview =
    useContext(SurfaceCanvasPreviewContext) || !props.inDashboard;
  const template = node.getTemplate();
  const body = template?.getBodySurface();
  const bodyVisited = useMemo(
    () => [...visited, body?.id ?? ''],
    [visited, body?.id],
  );

  const problem = getPlacementProblem(
    props[templateSocketName],
    template,
    visited,
  );
  if (problem || !body) {
    return <TemplateNotice label={problem ?? ''} />;
  }

  // nested in another template, this rendering belongs to that template's row
  const rows: TemplateRow[] = props[TEMPLATE_PLACED_STATE_PROP] ?? node.rows;
  if (rows.length === 0) {
    return (
      <TemplateNotice
        label={String(props[emptyTextSocketName] ?? '')}
        color="text.secondary"
      />
    );
  }

  const direction = props[directionSocketName] === 'row' ? 'row' : 'column';
  const columns = Math.max(
    1,
    Math.round(Number(props[columnsSocketName]) || 1),
  );
  const gap = Math.max(0, Number(props[gapSocketName]) || 0);
  const interactive = Boolean(props.inDashboard) && !props.disabled;

  return (
    <Box
      data-cy={`repeat-template of ${node.id}`}
      sx={{
        display: 'grid',
        gap: `${gap}px`,
        width: '100%',
        // one column is a list, several is a grid, and a row direction with one
        // column lays every row out side by side - all the same node
        gridTemplateColumns:
          direction === 'row' && columns === 1
            ? `repeat(${rows.length}, minmax(0, 1fr))`
            : `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {rows.map((row) => (
        <TemplateBody
          key={row.key}
          ownerId={node.id}
          rowKey={row.key}
          capture={row.capture}
          tree={row.capture.trees[body.id] ?? EMPTY_TREE}
          visited={bodyVisited}
          isCanvasPreview={isCanvasPreview}
          interactive={interactive}
        />
      ))}
    </Box>
  );
};

export class RepeatTemplate extends TemplatePlacementNode {
  // one evaluated row per entry, in render order
  rows: TemplateRow[] = [];

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

When a parameter's name does not match the field you want - above all when it
should take the row's KEY but feeds a widget's "Label" socket - set its
"<parameter> from" input to a field name, or to "key" or "entry". A field of that
name wins, so a field called "key" or "value" can be asked for too.

"${directionSocketName}" and "${columnsSocketName}" decide the layout: one
column is a list, several is a grid, and a row direction puts the entries side
by side. "${keyFieldSocketName}" names the field that identifies a row, which
keeps rows stable when the data is reordered; repeated values get told apart by
position, which does not survive a reorder. "${maxItemsSocketName}" caps how
many are rendered - every row costs one evaluation of the template, so an
unbounded array is slow.

Whatever a viewer changes in a row's widget stays in that row. A template's
"${templateOutputPrefixName}" values are collected per row into this node's
"${outName}".

${AGENT_DOCS_HEADING}
The template is referenced by NAME, and template names are kept unique. See
describe_node "UI Template" for how to build one.

Setting "${templateSocketName}" with set_socket_value creates the "<parameter>
from" inputs, named after the template's sockets ("Parameter 1 from"), so wire
the template's parameters first. When a parameter's name matches no field, point
it at one with those inputs rather than adding nodes that reshape the data. Check
the result with inspect_ui.

Connect this node's ReactUI output to the surface it should appear on, not the
template's body surface.

"Edits" holds what viewers changed, per row. Leave it alone: to change what every
row starts from, set the value on the widget inside the template.`;
  }

  public getTags(): string[] {
    return ['Widget', 'Layout', 'Template', 'Array'];
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      this.getTemplateSelectSocket(),
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
      this.getEditsSocket(),
      new PPSocket(SOCKET_TYPE.OUT, outName, new JSONType()),
    ];
  }

  public placedTemplateUpdatedMeta(template: PPNode): void {
    super.placedTemplateUpdatedMeta(template);
    void this.executeOptimizedChain();
  }

  // One "<parameter> from" input per wired parameter, to point it at a field
  // when its own name does not match one. Left empty it binds by name.
  public updateTemplateSockets(): void {
    const template = this.getTemplate();
    const parameters = (template?.getParameterSockets() ?? []).filter(
      (socket) => socket.hasLink(),
    );
    const wanted = parameters.map((socket) => fieldSocketNameFor(socket.name));

    this.inputSocketArray
      .filter(
        (socket) =>
          socket.name.endsWith(FIELD_SOCKET_SUFFIX) &&
          !wanted.includes(socket.name) &&
          !socket.hasLink(),
      )
      .forEach((socket) => this.removeSocket(socket));

    parameters.forEach((parameter) => {
      const name = fieldSocketNameFor(parameter.name);
      if (!this.getInputSocketByName(name)) {
        this.addSocket(
          new PPSocket(SOCKET_TYPE.IN, name, new StringType(), '', false),
        );
      }
    });
    this.resizeAndDraw();
  }

  private getFieldOverrides(): Record<string, string> {
    const template = this.getTemplate();
    const overrides: Record<string, string> = {};
    (template?.getParameterSockets() ?? []).forEach((parameter) => {
      const value = this.getInputData(fieldSocketNameFor(parameter.name));
      if (typeof value === 'string' && value.trim() !== '') {
        overrides[parameter.name] = value;
      }
    });
    return overrides;
  }

  // reads as '"Label" from' in the inspector rather than 'Parameter 1 from'
  public getSocketDisplayName(socket: PPSocket): string {
    if (socket.name.endsWith(FIELD_SOCKET_SUFFIX)) {
      const parameterName = socket.name.slice(0, -FIELD_SOCKET_SUFFIX.length);
      const template = this.getTemplate();
      const parameter = template?.getOutputSocketByName(parameterName);
      if (parameter && template) {
        return `"${template.getSocketDisplayName(parameter)}" from`;
      }
    }
    return super.getSocketDisplayName(socket);
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

  public getTemplateSnapshotProps(): Record<string, unknown> {
    return { [TEMPLATE_PLACED_STATE_PROP]: this.rows };
  }

  protected getRowArgs(
    template: UITemplate,
    rowKey: string | undefined,
  ): TemplateArgs | undefined {
    const row = this.rows.find((candidate) => candidate.key === rowKey);
    return (
      row &&
      bindEntryToParameters(
        template,
        row.label,
        row.entry,
        this.getFieldOverrides(),
      )
    );
  }

  protected storeRowCapture(
    rowKey: string | undefined,
    capture: TemplateInstanceCapture,
  ): void {
    this.rows = this.rows.map((row) =>
      row.key === rowKey ? { ...row, capture } : row,
    );
    this.setOutputData(
      outName,
      this.collectOutputs(this.getInputData(itemsSocketName)),
    );
  }

  // the template's declared Outputs, collected per row in the shape that came
  // in: an object keeps its keys, an array stays an array
  private collectOutputs(items: unknown): unknown {
    const collected = this.rows.map((row) => {
      const values = Object.values(row.capture.outputs);
      return values.length === 1 ? values[0] : row.capture.outputs;
    });
    return Array.isArray(items)
      ? collected
      : Object.fromEntries(
          this.rows.map((row, i) => [row.label, collected[i]]),
        );
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
      this.prepareRun(template);
      const overrides = this.getFieldOverrides();
      const usedKeys = new Set<string>();
      // sequential on purpose: every row writes the same shared parameter
      // sockets, so the passes must not interleave
      for (const [key, entry] of entries) {
        const rowKey = this.getRowKey(key, entry);
        // repeated key field values must not share React keys and edits
        let uniqueKey = rowKey;
        for (let n = 1; usedKeys.has(uniqueKey); n++) {
          uniqueKey = `${rowKey}#${n}`;
        }
        usedKeys.add(uniqueKey);
        const capture = await runTemplateAsInstance(
          template,
          bindEntryToParameters(template, key, entry, overrides),
          this.getRowEdits(uniqueKey),
        );
        rows.push({
          key: uniqueKey,
          label: key,
          entry,
          capture,
        });
      }
    }
    this.rows = rows;
    output[outName] = this.collectOutputs(input[itemsSocketName]);

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
