// UI template list: one placement of a UI template per entry of an array or
// object. Not called "grid": columns is a setting, and "Widget grid array"
// already exists.
import React from 'react';
import { Box } from '@mui/material';
import { HybridWidgetContentProps } from '../../classes/HybridNode2';
import PPSocket from '../../classes/SocketClass';
import {
  TEMPLATE_PLACED_STATE_PROP,
  TemplateInstanceCapture,
} from '../../components/dashboard/templateInstance';
import { BooleanType } from '../datatypes/booleanType';
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
import {
  EntryPath,
  expandEntries,
  isPlainObject,
  setAtPaths,
  toEntries,
} from './templateEntries';
import { runTemplateAsInstance, TemplateArgs } from './templateInstancing';
import {
  TemplateBody,
  TemplateNotice,
  TemplatePlacementNode,
  usePlacedBody,
} from './templatePlacement';
import type { UITemplate } from './uiTemplateNode';

const itemsSocketName = 'Items';
const directionSocketName = 'Direction';
const columnsSocketName = 'Columns';
const gapSocketName = 'Gap';
const maxItemsSocketName = 'Max items';
const keyFieldSocketName = 'Key field';
const emptyTextSocketName = 'Empty text';
const expandSocketName = 'Expand nested';
const indentSocketName = 'Indent';
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

// Where an expanded row sits in the tree. Only rows of "Expand nested" have it.
export interface ExpandedPlace {
  path: EntryPath;
  depth: number;
  group: boolean;
}

export interface TemplateRow {
  key: string;
  label: string;
  entry: unknown;
  capture: TemplateInstanceCapture;
  place?: ExpandedPlace;
}

/**
 * Binds one entry to the template's parameters by NAME, so a template needs no
 * per-column mapping UI:
 * - a parameter called entry/item/value gets the whole entry
 * - a parameter called key/index gets the key
 * - any other parameter gets the entry's field of that name
 * - if the entry is not an object, an unmatched parameter gets the entry
 *
 * An expanded row is one value, never a record to pick fields from: path,
 * depth and group get its place in the tree, and any other name gets the value.
 *
 * Matching is on the parameter's display name, the one the user sees.
 */
export function bindEntryToParameters(
  template: UITemplate,
  key: string,
  entry: unknown,
  overrides: Record<string, string> = {},
  place?: ExpandedPlace,
): Record<string, unknown> {
  const findField = (wanted: string): string | undefined =>
    isPlainObject(entry) && !place
      ? Object.keys(entry).find((name) => name.trim().toLowerCase() === wanted)
      : undefined;
  const pick = (wanted: string): unknown => {
    if (KEY_PARAMETER_NAMES.includes(wanted)) {
      return key;
    }
    if (ENTRY_PARAMETER_NAMES.includes(wanted)) {
      return entry;
    }
    if (place) {
      if (wanted === 'path') return place.path;
      if (wanted === 'depth') return place.depth;
      if (wanted === 'group') return place.group;
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
  const { body, bodyVisited, isCanvasPreview, problem } = usePlacedBody(props);
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
  const indent = Math.max(0, Number(props[indentSocketName]) || 0);
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
      {rows.map((row) => {
        const content = (
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
        );
        const depth = row.place?.depth ?? 0;
        // only an expanded row has a depth, so plain rows keep their DOM as is
        return depth > 0 && indent > 0 ? (
          <Box key={row.key} sx={{ pl: `${depth * indent}px`, minWidth: 0 }}>
            {content}
          </Box>
        ) : (
          content
        );
      })}
    </Box>
  );
};

export class RepeatTemplate extends TemplatePlacementNode {
  // one evaluated row per entry, in render order
  rows: TemplateRow[] = [];

  public getName(): string {
    return 'UI template list';
  }

  public getDescription(): string {
    return 'Show a UI template once per entry of an array or object';
  }

  public getDocs(): string {
    return `Shows a "UI template" once per entry of "${itemsSocketName}" (an array
or object). Pick the template under "${templateSocketName}".

Each entry fills the template's parameters by name: "entry", "item" or "value"
get the whole entry, "key" or "index" get its key, any other name gets the field
of that name. To bind a parameter to something else, set its "<parameter> from"
input to a field name, "key" or "entry".

"${keyFieldSocketName}" names the field that identifies a row, so rows survive a
reorder. "${maxItemsSocketName}" caps the rows; each one runs the template once.
"${directionSocketName}" and "${columnsSocketName}" set the layout.

"${expandSocketName}" shows nested JSON as one row per value at any depth, as
a settings form does. A nested object or list gets a row of its own before its
values, so the template can show it as a heading. Each row is one value:
"key" gets its own key, "path" the keys down to it, "depth" how deep it is
(0 at the top), "group" whether it is an object or list, and any other name
gets the value. Rows are indented by "${indentSocketName}" per level. "${outName}"
is then the JSON in the shape that came in, each value replaced by what its
row outputs; group rows and values past "${maxItemsSocketName}" stay as they were.

What a viewer changes in a row stays in that row. The template's
"${templateOutputPrefixName}" values are collected per row into "${outName}".

${AGENT_DOCS_HEADING}
See describe_node "UI template" for how to build one; it is referenced by name.
Wire the template's parameters before setting "${templateSocketName}", which
creates the "<parameter> from" inputs. Prefer those inputs over reshaping the
data with extra nodes. For a form over nested JSON, turn on
"${expandSocketName}" rather than flattening and rebuilding the JSON yourself.
Connect this node's ReactUI to the surface it appears on,
not the template's body. Leave "Edits" alone; fire "Clear edits" to reset rows.
For a row button that changes the list, feed "${itemsSocketName}" from a
Storage Read and fire a Storage Write of the same key from the button. Check
with inspect_ui.`;
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
        expandSocketName,
        new BooleanType(),
        false,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        indentSocketName,
        new NumberType(true, 0, 64),
        16,
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
      this.getClearEditsSocket(),
      new PPSocket(SOCKET_TYPE.OUT, outName, new JSONType()),
    ];
  }

  public placedTemplateUpdatedMeta(): void {
    super.placedTemplateUpdatedMeta();
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
        row.place,
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
  // An expanded list instead writes each value row's output back where the
  // value came from, so the result is the edited JSON.
  private collectOutputs(items: unknown): unknown {
    const collected = this.rows.map((row) => {
      const values = Object.values(row.capture.outputs);
      return values.length === 1 ? values[0] : row.capture.outputs;
    });
    if (this.rows.some((row) => row.place)) {
      return setAtPaths(
        items,
        this.rows.flatMap((row, i): [EntryPath, unknown][] =>
          // a group row outputting its value would undo its own rows' edits
          row.place &&
          !row.place.group &&
          Object.keys(row.capture.outputs).length > 0
            ? [[row.place.path, collected[i]]]
            : [],
        ),
      );
    }
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
    const items = input[itemsSocketName];
    const expand = Boolean(input[expandSocketName]);
    const entries: [string, unknown, ExpandedPlace?][] = (
      expand
        ? expandEntries(items).map(
            ({ key, value, path, depth, group }): [
              string,
              unknown,
              ExpandedPlace,
            ] => [key, value, { path, depth, group }],
          )
        : toEntries(items)
    ).slice(
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
      for (const [key, entry, place] of entries) {
        // an expanded row is known by its path: its key repeats across levels
        const rowKey = place
          ? JSON.stringify(place.path)
          : this.getRowKey(key, entry);
        // repeated key field values must not share React keys and edits
        let uniqueKey = rowKey;
        for (let n = 1; usedKeys.has(uniqueKey); n++) {
          uniqueKey = `${rowKey}#${n}`;
        }
        usedKeys.add(uniqueKey);
        const capture = await runTemplateAsInstance(
          template,
          bindEntryToParameters(template, key, entry, overrides, place),
          this.getRowEdits(uniqueKey),
        );
        rows.push({
          key: uniqueKey,
          label: key,
          entry,
          capture,
          place,
        });
      }
    }
    this.rows = rows;
    output[outName] = this.collectOutputs(items);

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
