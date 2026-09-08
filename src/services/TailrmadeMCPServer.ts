import * as PIXI from 'pixi.js';
import {
  ACTIONS,
  ActionHandler,
  AddNodeActionArgs,
  ConnectSocketsActionArgs,
  PNPAction,
  SetCommentActionArgs,
  SetSocketValueActionArgs,
  SetUISurfaceLayoutActionArgs,
  SetUpdateBehaviourActionArgs,
} from '../classes/Action';
import PPGraph from '../classes/GraphClass';
import PPNode from '../classes/NodeClass';
import Socket from '../classes/SocketClass';
import InterfaceController from '../InterfaceController';
import { getAllNodeTypes, getAINodesInDetail } from '../nodes/allNodes';
import { ensureVisible, zoomToFitNodes } from '../pixi/utils-pixi';
import { STATUS_SEVERITY, TRIGGER_TYPE_OPTIONS } from '../utils/constants';
import {
  dashboardLayoutInputName,
  surfaceElementLayoutSuffix,
  surfaceElementVisibleSuffix,
  surfaceJsonSocketName,
} from '../utils/constants_shared';
import {
  heightName,
  SOCKET_NAME_DASHBOARD_CONTENT,
  widthName,
} from '../utils/layoutableHelpers';
import {
  applySpecProperties,
  compileSurfaceSpec,
  ContainerSpecItem,
  decompileSurfaceTree,
  findLayoutItemId,
  getSpecItemKind,
  SPEC_PROPERTIES_BY_KIND,
} from '../nodes/layout/surfaceLayoutSpec';
import {
  getElementIdForNode,
  getElementSockets,
  getLinkedSourceNodeIds,
  isElementSocket,
  wouldCreateSurfaceEmbeddingLoop,
} from '../nodes/layout/surfaceSync';
import { getLayoutableElement } from '../utils/utils';
import { isLayoutableNode } from '../utils/interfaces';
import type { UISurfaceNode } from '../nodes/layout/uiSurface';
import { cloneAndTruncateContext } from './contextTruncation';
import { DeferredReactType } from '../nodes/datatypes/deferredHtmlType';
import {
  normalizeDimension,
  normalizeDimensionProps,
} from '../utils/cssDimensions';
import {
  AI_INSPECT_SOURCES,
  AIInspectSource,
  captureForAI,
  getDisplayedSurfaceNodeId,
} from './AIVisionService';
import { TriggerType } from '../nodes/datatypes/triggerType';

export interface MCPToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPToolResult {
  content: string;
  is_error?: boolean;
  /**
   * Data urls the caller must show the model alongside `content`. Only
   * inspect_ui sets this; see AIBackend for how they reach the conversation.
   */
  images?: string[];
}

type MCPToolName =
  | 'inspect_graph'
  | 'inspect_nodes'
  | 'inspect_selected_nodes'
  | 'inspect_warnings_and_errors'
  | 'list_available_nodes'
  | 'describe_node'
  | 'add_node'
  | 'connect_sockets'
  | 'disconnect_sockets'
  | 'set_socket_value'
  | 'set_node_comment'
  | 'set_update_behaviour'
  | 'add_trigger_input'
  | 'set_trigger_type'
  | 'set_node_name'
  | 'inspect_surface'
  | 'inspect_ui'
  | 'set_layout_value'
  | 'set_surface_layout'
  | 'set_default_surface';

interface AddNodeInput {
  node_type: string;
  node_id: string;
}

interface ConnectSocketsInput {
  from_node: string;
  from_socket: string;
  to_node: string;
  to_socket: string;
}

interface DisconnectSocketsInput {
  to_node: string;
  to_socket?: string;
  from_node?: string;
}

interface SetSocketValueInput {
  node_id: string;
  socket_name: string;
  value: unknown;
}

interface SetNodeCommentInput {
  node_id: string;
  comment: string;
}

interface AddTriggerInputInput {
  node_id: string;
  trigger_type?: string;
}

interface SetTriggerTypeInput {
  node_id: string;
  socket_name: string;
  trigger_type: string;
}

interface SetNodeNameInput {
  node_id: string;
  name: string;
}

interface SetUpdateBehaviourInput {
  node_id: string;
  load?: boolean;
  update?: boolean;
  interval?: boolean;
  interval_frequency?: number;
}

interface InspectNodesInput {
  node_ids: string[];
}

interface DescribeNodeInput {
  node_type: string;
}

interface InspectSurfaceInput {
  node_id: string;
}

interface InspectUIInput {
  source?: AIInspectSource;
}

interface SetLayoutValueInput {
  node_id: string;
  item: string;
  values: Record<string, unknown>;
}

interface SetSurfaceLayoutInput {
  node_id: string;
  layout: unknown;
}

interface SetDefaultSurfaceInput {
  node_id: string;
}

/**
 * A local MCP-style server for the browser graph runtime.
 *
 * The model talks to these tools one call at a time. Each call is executed
 * against the live graph and its result is returned to the agent before it
 * decides whether another action is needed.
 */
export class TailrmadeMCPServer {
  private static instance: TailrmadeMCPServer | undefined = undefined;

  static getInstance(): TailrmadeMCPServer {
    if (this.instance === undefined) {
      this.instance = new TailrmadeMCPServer();
    }
    return this.instance;
  }

  // Nodes created by add_node during the current agent turn. Scoped strictly
  // to this turn's own nodes so end-of-turn auto-alignment never moves a node
  // the user placed themselves.
  private turnCreatedNodeIds = new Set<string>();

  // The spot the turn's first add_node anchors to. Captured once (from the
  // viewport centre) and reused for every subsequent add so deOverlap stacks
  // the turn's nodes into a consistent column
  private turnNodeAnchor: PIXI.Point | null = null;

  public beginAgentTurn(): void {
    this.turnCreatedNodeIds.clear();
    this.turnNodeAnchor = null;
  }

  public async finishAgentTurn(): Promise<void> {
    const nodes = Array.from(this.turnCreatedNodeIds)
      .map((id) => PPGraph.currentGraph.nodes[id])
      .filter((node): node is PPNode => node !== undefined);
    this.turnCreatedNodeIds.clear();
    // A single node needs no pass: autoAlignNodes only lays out the nodes it
    // is given and re-anchors the result to their original top-left, so with
    // one node it's a geometric no-op (deOverlap at add time already placed
    // it). Skip the pointless move animation.
    if (nodes.length >= 2) {
      await PPGraph.currentGraph.selection.autoAlignNodes(nodes);
    }
    if (nodes.length >= 1) {
      zoomToFitNodes(nodes);
    }
  }

  listTools(): MCPToolDefinition[] {
    const { highestNumber, nextId } = this.getAINodeIdSequence();
    return [
      {
        name: 'inspect_graph',
        description:
          'Summarize the current graph, including node IDs, names, positions, and socket names.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'inspect_nodes',
        description:
          'Inspect nodes by ID, including socket values and types, links, comments, warnings, and errors.',
        input_schema: {
          type: 'object',
          properties: {
            node_ids: {
              type: 'array',
              description: 'The IDs of the nodes to inspect, up to 30 nodes.',
              items: {
                type: 'string',
              },
              maxItems: 30,
            },
          },
          required: ['node_ids'],
        },
      },
      {
        name: 'inspect_selected_nodes',
        description:
          'Inspect the selected nodes and the links between them, with large socket data truncated.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'inspect_warnings_and_errors',
        description:
          'List all node and socket warnings and errors in the graph.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'list_available_nodes',
        description:
          'Get detailed node metadata in bulk, optionally filtered by name. For one node type, use describe_node.',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Case-insensitive search text for node names.',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of node descriptions to return.',
            },
          },
        },
      },
      {
        name: 'describe_node',
        description:
          "Get one node type's description, AI usage docs, and socket types and defaults.",
        input_schema: {
          type: 'object',
          properties: {
            node_type: {
              type: 'string',
              description: 'Node key or display name (case-insensitive).',
            },
          },
          required: ['node_type'],
        },
      },
      {
        name: 'add_node',
        description: `Add one automatically placed node with a caller-chosen ID. The highest existing ai-node number in the app is ${highestNumber}; the next safe ID is ${nextId}. For multiple new nodes in this response, start with ${nextId} and increment the number for each node. Calls in one response run in order, so add the node first, then use the same node_id immediately in set_node_name, set_node_comment, set_socket_value, and connect_sockets calls without waiting for a tool result.`,
        input_schema: {
          type: 'object',
          properties: {
            node_type: {
              type: 'string',
              description: 'Node key or display name (case-insensitive).',
            },
            node_id: {
              type: 'string',
              description:
                'Unique ID chosen by the caller in the format ai-node-UNIQUENUMBER, for example ai-node-1.',
            },
          },
          required: ['node_type', 'node_id'],
        },
      },
      {
        name: 'connect_sockets',
        description: 'Connect an output socket to an input socket.',
        input_schema: {
          type: 'object',
          properties: {
            from_node: { type: 'string' },
            from_socket: { type: 'string' },
            to_node: { type: 'string' },
            to_socket: { type: 'string' },
          },
          required: ['from_node', 'from_socket', 'to_node', 'to_socket'],
        },
      },
      {
        name: 'disconnect_sockets',
        description:
          'Remove a link. Give to_socket to unlink one named input, or from_node to unlink everything one node feeds into another - which is how a widget is taken off a UI surface (its element socket and the "<name> visible"/"<name> layout" companions go with it, and it leaves that surface\'s layout). The widget node itself stays in the graph, so connect it to another surface to move it there. Errors when no such link exists rather than reporting success.',
        input_schema: {
          type: 'object',
          properties: {
            to_node: {
              type: 'string',
              description: 'the node the link points at, e.g. the UI surface',
            },
            to_socket: {
              type: 'string',
              description:
                'the input or trigger socket holding the link. Omit for a widget on a surface - element socket names are generated, so identify it with from_node instead.',
            },
            from_node: {
              type: 'string',
              description:
                'the node the link comes from. On its own it removes every link from that node into to_node; alongside to_socket it is checked against the link actually there.',
            },
          },
          required: ['to_node'],
        },
      },
      {
        name: 'set_socket_value',
        description: 'Set an editable input socket value.',
        input_schema: {
          type: 'object',
          properties: {
            node_id: { type: 'string' },
            socket_name: {
              type: 'string',
            },
            value: {},
          },
          required: ['node_id', 'socket_name', 'value'],
        },
      },
      {
        name: 'set_node_comment',
        description: 'Set a short explanatory comment on a node.',
        input_schema: {
          type: 'object',
          properties: {
            node_id: { type: 'string' },
            comment: { type: 'string' },
          },
          required: ['node_id', 'comment'],
        },
      },
      {
        name: 'set_update_behaviour',
        description: 'Change when a node runs.',
        input_schema: {
          type: 'object',
          properties: {
            node_id: { type: 'string' },
            load: {
              type: 'boolean',
              description: 'Run this node when the graph loads.',
            },
            update: {
              type: 'boolean',
              description: 'Run this node when an upstream input changes.',
            },
            interval: {
              type: 'boolean',
              description: 'Run this node repeatedly on an interval.',
            },
            interval_frequency: {
              type: 'number',
              description: 'Interval frequency in milliseconds.',
            },
          },
          required: ['node_id'],
        },
      },
      {
        name: 'add_trigger_input',
        description:
          'Add a Trigger input and return its socket name. A fired trigger runs the node regardless of its update behaviour.',
        input_schema: {
          type: 'object',
          properties: {
            node_id: { type: 'string' },
            trigger_type: {
              type: 'string',
              enum: TRIGGER_TYPE_OPTIONS.map((option) => option.text),
              description:
                'Fire when the value increases (positiveFlank, default), decreases (negativeFlank), changes (change), or arrives (always).',
            },
          },
          required: ['node_id'],
        },
      },
      {
        name: 'set_trigger_type',
        description:
          'Change when an existing trigger socket fires. See add_trigger_input for trigger types.',
        input_schema: {
          type: 'object',
          properties: {
            node_id: { type: 'string' },
            socket_name: {
              type: 'string',
              description: 'Name of the trigger socket, e.g. "Execute".',
            },
            trigger_type: {
              type: 'string',
              enum: TRIGGER_TYPE_OPTIONS.map((option) => option.text),
            },
          },
          required: ['node_id', 'socket_name', 'trigger_type'],
        },
      },
      {
        name: 'set_node_name',
        description: 'Rename a node.',
        input_schema: {
          type: 'object',
          properties: {
            node_id: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['node_id', 'name'],
        },
      },
      {
        name: 'inspect_surface',
        description:
          "Inspect a UI surface's simplified layout, widgets, route, and default status.",
        input_schema: {
          type: 'object',
          properties: {
            node_id: { type: 'string' },
          },
          required: ['node_id'],
        },
      },
      {
        name: 'inspect_ui',
        description:
          'Look at the app as it is actually rendered right now. Returns a screenshot paired with the structure behind it, so you can cross-reference what is drawn against what should exist: overflowing or clipped labels, widgets that landed in the wrong container, and empty states that the layout JSON alone cannot reveal. Use it to check your own work after changing a UI, and whenever the user describes something visual. Sources: "dashboard" (default) is the live user interface; "graph" is the node canvas and its wiring; "selection" is the currently selected nodes. The user\'s screen outside the app is never captured.',
        input_schema: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              enum: [...AI_INSPECT_SOURCES],
              description: 'Defaults to "dashboard".',
            },
          },
        },
      },
      {
        name: 'set_layout_value',
        description: `Change individual layout properties of ONE item on a UI surface, leaving the rest of the layout untouched. Prefer this over set_surface_layout for any focused change - resizing a widget, changing a container's direction or padding, restyling a text block - because it cannot disturb anything it does not name. Address the item by the "id" that inspect_surface reports for it (a widget can also be addressed by its source node id). Valid properties per item kind - container: ${SPEC_PROPERTIES_BY_KIND.container.join(', ')}; text: ${SPEC_PROPERTIES_BY_KIND.text.join(', ')}; widget: ${SPEC_PROPERTIES_BY_KIND.widget.join(', ')}. Sizes are css strings ("240px", "100%", "auto"), never bare numbers.`,
        input_schema: {
          type: 'object',
          properties: {
            node_id: {
              type: 'string',
              description: 'the UI surface node',
            },
            item: {
              type: 'string',
              description:
                'the layout item id from inspect_surface, "ROOT" for the root container, or a widget\'s source node id',
            },
            values: {
              type: 'object',
              description:
                'the properties to change, e.g. {"height": "240px"}. Everything else keeps its current value.',
            },
          },
          required: ['node_id', 'item', 'values'],
        },
      },
      {
        name: 'set_surface_layout',
        description:
          'Replace a UI surface\'s ENTIRE layout from a simplified declarative spec, for building or restructuring a surface. Omitted properties reset to defaults, so to change one property of one item use set_layout_value instead - it cannot disturb the rest of the layout. Item ids from inspect_surface are preserved when sent back. Referenced unconnected widgets are connected automatically. width and height are css strings - "240px", "100%" or "auto" - never bare numbers.',
        input_schema: {
          type: 'object',
          properties: {
            node_id: { type: 'string' },
            layout: {
              type: 'object',
              description:
                'The simplified surface layout spec. Root must be a container.',
            },
          },
          required: ['node_id', 'layout'],
        },
      },
      {
        name: 'set_default_surface',
        description:
          'Set the UI surface shown on app load and initially in the editor.',
        input_schema: {
          type: 'object',
          properties: {
            node_id: {
              type: 'string',
            },
          },
          required: ['node_id'],
        },
      },
    ];
  }

  private getAINodeIdSequence(): {
    highestNumber: string;
    nextId: string;
  } {
    let highestNumber = 0n;
    for (const nodeId of Object.keys(PPGraph.currentGraph.nodes)) {
      const match = /^ai-node-(\d+)$/.exec(nodeId);
      if (!match) continue;
      const number = BigInt(match[1]);
      if (number > highestNumber) highestNumber = number;
    }
    return {
      highestNumber: highestNumber.toString(),
      nextId: `ai-node-${highestNumber + 1n}`,
    };
  }

  async callTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    try {
      const toolName = name as MCPToolName;
      switch (toolName) {
        case 'inspect_graph':
          return this.inspectGraph();
        case 'inspect_nodes':
          return this.inspectNodes(input as unknown as InspectNodesInput);
        case 'inspect_selected_nodes':
          return this.inspectSelectedNodes();
        case 'inspect_warnings_and_errors':
          return this.inspectWarningsAndErrors();
        case 'list_available_nodes':
          return await this.listAvailableNodes(input);
        case 'describe_node':
          return this.describeNode(input as unknown as DescribeNodeInput);
        case 'add_node':
          return await this.addNode(input as unknown as AddNodeInput);
        case 'connect_sockets':
          return await this.connectSockets(
            input as unknown as ConnectSocketsInput,
          );
        case 'disconnect_sockets':
          return await this.disconnectSockets(
            input as unknown as DisconnectSocketsInput,
          );
        case 'set_socket_value':
          return await this.setSocketValue(
            input as unknown as SetSocketValueInput,
          );
        case 'set_node_comment':
          return await this.setNodeComment(
            input as unknown as SetNodeCommentInput,
          );
        case 'set_update_behaviour':
          return await this.setUpdateBehaviour(
            input as unknown as SetUpdateBehaviourInput,
          );
        case 'add_trigger_input':
          return this.addTriggerInput(input as unknown as AddTriggerInputInput);
        case 'set_trigger_type':
          return this.setTriggerType(input as unknown as SetTriggerTypeInput);
        case 'set_node_name':
          return this.setNodeName(input as unknown as SetNodeNameInput);
        case 'inspect_surface':
          return this.inspectSurface(input as unknown as InspectSurfaceInput);
        case 'inspect_ui':
          return await this.inspectUI(input as unknown as InspectUIInput);
        case 'set_layout_value':
          return await this.setLayoutValue(
            input as unknown as SetLayoutValueInput,
          );
        case 'set_surface_layout':
          return await this.setSurfaceLayout(
            input as unknown as SetSurfaceLayoutInput,
          );
        case 'set_default_surface':
          return this.setDefaultSurface(
            input as unknown as SetDefaultSurfaceInput,
          );
        default:
          return {
            content: `Unknown MCP tool: ${name}`,
            is_error: true,
          };
      }
    } catch (error) {
      return {
        content:
          error instanceof Error
            ? error.message
            : 'Unknown MCP tool execution error',
        is_error: true,
      };
    }
  }

  private inspectGraph(): MCPToolResult {
    const graph = PPGraph.currentGraph;
    const nodes = Object.values(graph.nodes).map((node) => ({
      id: node.id,
      name: node.getName(),
      // set when the user or AI renamed the node (see set_node_name)
      custom_name: node.nodeName === node.getName() ? undefined : node.nodeName,
      x: Math.round(node.x),
      y: Math.round(node.y),
      comment: node.comment || undefined,
      update_behaviour: this.updateBehaviourToSerializable(node),
      inputs: node.inputSocketArray.map((socket) => socket.name),
      triggers: node.nodeTriggerSocketArray.map((socket) => socket.name),
      outputs: node.outputSocketArray.map((socket) => socket.name),
    }));

    return {
      content: JSON.stringify({
        node_count: nodes.length,
        nodes,
      }),
    };
  }

  private inspectSelectedNodes(): MCPToolResult {
    const selection = PPGraph.currentGraph.serializeSelection(true);
    const truncatedSelection = cloneAndTruncateContext(selection);
    return {
      content: JSON.stringify(truncatedSelection),
    };
  }

  private inspectNodes(input: InspectNodesInput): MCPToolResult {
    if (!Array.isArray(input.node_ids) || input.node_ids.length === 0) {
      return {
        content: 'inspect_nodes requires at least one node_id',
        is_error: true,
      };
    }

    const nodeIds = Array.from(new Set(input.node_ids)).slice(0, 30);
    const nodes = nodeIds
      .map((nodeId) => PPGraph.currentGraph.nodes[nodeId])
      .filter((node): node is PPNode => Boolean(node))
      .map((node) => this.nodeToSerializable(node));
    const missingNodeIds = nodeIds.filter(
      (nodeId) => !PPGraph.currentGraph.nodes[nodeId],
    );

    return {
      content: JSON.stringify({
        requested_node_count: nodeIds.length,
        node_count: nodes.length,
        missing_node_ids: missingNodeIds,
        nodes,
      }),
    };
  }

  private nodeToSerializable(node: PPNode) {
    return {
      id: node.id,
      name: node.getName(),
      // set when the user or AI renamed the node (see set_node_name)
      custom_name: node.nodeName === node.getName() ? undefined : node.nodeName,
      type: node.type,
      x: Math.round(node.x),
      y: Math.round(node.y),
      width: Math.round(node.nodeWidth),
      height: Math.round(node.nodeHeight),
      comment: node.comment || undefined,
      update_behaviour: this.updateBehaviourToSerializable(node),
      status: {
        node: this.statusToSerializable(node.status.node),
        socket_summary: this.statusToSerializable(node.status.socket),
        custom: node.status.custom.map((status) =>
          this.statusToSerializable(status),
        ),
      },
      sockets: node.getAllSockets().map((socket) => ({
        name: socket.name,
        socket_type: socket.socketType,
        data_type: socket.dataType.getName(),
        visible: socket.visible,
        has_link: socket.hasLink(),
        status: this.statusToSerializable(socket.status),
        links: socket.links.map((link) => ({
          from_node: link.getSource().getNode().id,
          from_socket: link.getSource().name,
          to_node: link.getTarget().getNode().id,
          to_socket: link.getTarget().name,
        })),
        data: cloneAndTruncateContext(this.getSocketPreparedData(socket)),
      })),
    };
  }

  private updateBehaviourToSerializable(node: PPNode) {
    return {
      load: node.updateBehaviour.load,
      update: node.updateBehaviour.update,
      interval: node.updateBehaviour.interval,
      interval_frequency: node.updateBehaviour.intervalFrequency,
    };
  }

  private getSocketPreparedData(socket: Socket): unknown {
    try {
      return socket.dataType.prepareDataForSaving(socket.data);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        raw_data: cloneAndTruncateContext(socket.data),
      };
    }
  }

  private inspectWarningsAndErrors(): MCPToolResult {
    const issues = Object.values(PPGraph.currentGraph.nodes).flatMap((node) => {
      const nodeIssues = [
        this.statusToIssue(node, 'node', node.status.node),
        this.statusToIssue(node, 'socket_summary', node.status.socket),
        ...node.status.custom.map((status) =>
          this.statusToIssue(node, 'custom', status),
        ),
      ].filter(Boolean);

      const socketIssues = node
        .getAllSockets()
        .map((socket) =>
          this.statusToIssue(node, 'socket', socket.status, socket.name),
        );

      return nodeIssues.concat(socketIssues).filter(Boolean);
    });

    return {
      content: JSON.stringify({
        has_issues: issues.length > 0,
        issue_count: issues.length,
        issues,
      }),
    };
  }

  private statusToIssue(
    node: PPNode,
    source: 'node' | 'socket_summary' | 'custom' | 'socket',
    status: {
      getSeverity: () => STATUS_SEVERITY;
      getName: () => string;
      message?: string;
    },
    socket_name?: string,
  ) {
    const severity = status.getSeverity();
    if (severity < STATUS_SEVERITY.WARNING) {
      return undefined;
    }

    return {
      node_id: node.id,
      node_name: node.getName(),
      source,
      socket_name,
      severity:
        severity >= STATUS_SEVERITY.FATAL
          ? 'fatal'
          : severity >= STATUS_SEVERITY.ERROR
            ? 'error'
            : 'warning',
      status_name: status.getName(),
      message: status.message || '',
    };
  }

  private statusToSerializable(status: {
    getSeverity: () => STATUS_SEVERITY;
    getName: () => string;
    getDescription: () => string;
    message?: string;
  }) {
    const severity = status.getSeverity();
    return {
      severity:
        severity >= STATUS_SEVERITY.FATAL
          ? 'fatal'
          : severity >= STATUS_SEVERITY.ERROR
            ? 'error'
            : severity >= STATUS_SEVERITY.WARNING
              ? 'warning'
              : 'success',
      status_name: status.getName(),
      description: status.getDescription(),
      message: status.message || '',
    };
  }

  private async listAvailableNodes(
    input: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    const query =
      typeof input.query === 'string' ? input.query.trim().toLowerCase() : '';
    const limit =
      typeof input.limit === 'number' && input.limit > 0
        ? Math.min(Math.floor(input.limit), 80)
        : 40;
    const nodes = await getAINodesInDetail();
    const filteredNodes = query
      ? nodes.filter((node) =>
          JSON.stringify(node).toLowerCase().includes(query),
        )
      : nodes;

    return {
      content: JSON.stringify(filteredNodes.slice(0, limit)),
    };
  }

  // Resolve a caller-supplied node type to its canonical registry key. Accepts
  // either the key itself (e.g. "httpnode") or the display name (e.g. "HTTP"),
  // both case-insensitive - list_available_nodes exposes both and the AI often
  // reaches for the name. Returns undefined if neither matches.
  private resolveNodeTypeKey(nodeType: string): string | undefined {
    const requested = nodeType.toLowerCase();
    const allTypes = getAllNodeTypes();
    if (allTypes[requested] !== undefined) {
      return requested;
    }
    return Object.keys(allTypes).find(
      (candidate) => allTypes[candidate].name.toLowerCase() === requested,
    );
  }

  private describeNode(input: DescribeNodeInput): MCPToolResult {
    if (!input.node_type) {
      return {
        content: 'describe_node requires node_type',
        is_error: true,
      };
    }

    const key = this.resolveNodeTypeKey(input.node_type);
    const entry = key ? getAllNodeTypes()[key] : undefined;
    if (!entry || !key) {
      return {
        content: `Unknown node type: ${input.node_type}. Use list_available_nodes to find the exact node type (pass its "key", e.g. "httpnode", or its display "name", e.g. "HTTP").`,
        is_error: true,
      };
    }

    const node: PPNode = new entry.constructor(key);
    // A template node built via `new entry.constructor(...)` is never passed
    // through onNodeAdded(), which is where updateBehaviour normally gets
    // assigned. Populate the default here so describe_node reports the same
    // update behaviour a freshly-added node would have.
    if (!node.updateBehaviour) {
      node.updateBehaviour = node.getUpdateBehaviour();
    }

    return {
      content: JSON.stringify({
        type: key,
        name: node.getName(),
        description: node.getDescription(),
        ai_docs: node.getAIDocs(),
        tags: node.getTags(),
        update_behaviour: this.updateBehaviourToSerializable(node),
        sockets: node.getAllSockets().map((socket) => ({
          name: socket.name,
          socket_type: socket.socketType,
          data_type: socket.dataType.getName(),
          visible: socket.visible,
          default_data: cloneAndTruncateContext(
            this.getSocketPreparedData(socket),
          ),
        })),
      }),
    };
  }

  private async addNode(input: AddNodeInput): Promise<MCPToolResult> {
    if (!input.node_type) {
      throw new Error('add_node requires node_type');
    }
    if (!input.node_id) {
      throw new Error('add_node requires node_id');
    }
    if (!/^ai-node-\d+$/.test(input.node_id)) {
      return {
        content:
          'Invalid node_id. Use the format ai-node-UNIQUENUMBER, for example ai-node-1.',
        is_error: true,
      };
    }
    if (PPGraph.currentGraph.nodes[input.node_id]) {
      return {
        content: `Node ID already exists: ${input.node_id}. Retry with a different unique node_id.`,
        is_error: true,
      };
    }

    // Resolve display name -> key up front so an unknown or misspelled type
    // comes back as a visible tool error; createNode alone would silently
    // build a placeholder node instead of the real one.
    const nodeTypeKey = this.resolveNodeTypeKey(input.node_type);
    if (!nodeTypeKey) {
      return {
        content: `Unknown node type: ${input.node_type}. Use list_available_nodes to find the exact node type (pass its "key", e.g. "httpnode", or its display "name", e.g. "HTTP").`,
        is_error: true,
      };
    }

    const nodeId = input.node_id;
    // Anchor every node in the turn to the same point (captured on the first
    // add) and let deOverlap fan them out; clone so the node can't mutate the
    // shared anchor. autoAlignNodes lays out the final positions end-of-turn.
    if (!this.turnNodeAnchor) {
      this.turnNodeAnchor = PPGraph.currentGraph.getDefaultNewNodeLocation();
    }
    const args = new AddNodeActionArgs(
      nodeTypeKey,
      this.turnNodeAnchor.clone(),
      nodeId,
    );

    const spinnerLabel = `AI adding node: ${nodeTypeKey}`;
    InterfaceController.showSpinner(spinnerLabel);
    try {
      await PNPAction(ACTIONS.ADD_NODE, args, args, undefined, 'ai');
    } finally {
      InterfaceController.hideSpinner(spinnerLabel);
    }

    const addedNode = PPGraph.currentGraph.nodes[nodeId];
    if (addedNode) {
      this.turnCreatedNodeIds.add(addedNode.id);
      // de-overlap immediately so intermediate states (before end-of-turn
      // auto-alignment) don't stack nodes on top of each other either
      addedNode.deOverlap();
      this.spawnEditEffect(addedNode);
      await ensureVisible([addedNode]);
    }

    return {
      content: JSON.stringify({
        node_id: nodeId,
        node_type: nodeTypeKey,
        status: addedNode ? 'added' : 'add_requested',
      }),
    };
  }

  private async connectSockets(
    input: ConnectSocketsInput,
  ): Promise<MCPToolResult> {
    // Surface element sockets are dynamic: every widget connection must mint a
    // fresh, uniquely-named socket. If the caller's to_socket name reaches
    // resolveInputSocketForLink, two same-named widgets (e.g. two "Text Field"
    // nodes) resolve to the SAME surface socket and the second connection
    // evicts the first, since an input socket holds a single link. Mirror the
    // native drag path (UISurfaceNode.getSocketForNewConnection): when the
    // target is a surface and the source is a ReactUI output, allocate the
    // element socket ourselves. This is the single owner of that rule, shared
    // by connect_sockets and set_surface_layout's auto-connect.
    const surfaceWidget = this.resolveSurfaceWidgetTarget(input);
    if (surfaceWidget.kind === 'error') {
      return surfaceWidget.result;
    }
    if (surfaceWidget.kind === 'already_connected') {
      return {
        content: JSON.stringify({
          status: 'already_connected',
          from: { node_id: input.from_node, socket: input.from_socket },
          to: { node_id: input.to_node },
        }),
      };
    }
    const toSocketName =
      surfaceWidget.kind === 'new'
        ? surfaceWidget.elementSocketName
        : input.to_socket;
    // A widget can only drive a surface through its ReactUI output, so when the
    // caller aimed at a different output the resolver redirects us to ReactUI.
    const fromSocketName =
      surfaceWidget.kind === 'new'
        ? surfaceWidget.fromSocketName
        : input.from_socket;

    const args = new ConnectSocketsActionArgs(
      input.from_node,
      fromSocketName,
      input.to_node,
      toSocketName,
    );

    const spinnerLabel = 'AI connecting sockets';
    InterfaceController.showSpinner(spinnerLabel);
    try {
      await PNPAction(ACTIONS.CONNECT_SOCKETS, args, args, undefined, 'ai');
    } finally {
      InterfaceController.hideSpinner(spinnerLabel);
    }

    const affectedNodes = [input.from_node, input.to_node]
      .map((id) => PPGraph.currentGraph.nodes[id])
      .filter((node): node is PPNode => Boolean(node));
    affectedNodes.forEach((node) => this.spawnEditEffect(node));
    if (affectedNodes.length > 0) {
      await ensureVisible(affectedNodes);
    }

    return {
      content: JSON.stringify({
        status: 'connected',
        from: {
          node_id: input.from_node,
          socket: fromSocketName,
        },
        to: {
          node_id: input.to_node,
          socket: toSocketName,
        },
      }),
    };
  }

  private async disconnectSockets(
    input: DisconnectSocketsInput,
  ): Promise<MCPToolResult> {
    const targetNode = PPGraph.currentGraph.nodes[input.to_node];
    if (!targetNode) {
      return { content: `Node not found: ${input.to_node}`, is_error: true };
    }
    if (!input.to_socket && !input.from_node) {
      return {
        content:
          'disconnect_sockets needs to_socket (the input holding the link) or from_node (the node feeding it).',
        is_error: true,
      };
    }
    if (input.from_node && !PPGraph.currentGraph.nodes[input.from_node]) {
      return { content: `Node not found: ${input.from_node}`, is_error: true };
    }

    const linkedSockets = targetNode
      .getAllInputSockets()
      .filter((socket) => socket.links.length > 0);

    let sockets = linkedSockets;
    if (input.to_socket) {
      sockets = sockets.filter((socket) => socket.name === input.to_socket);
      if (sockets.length === 0) {
        return {
          content: `No link into "${input.to_socket}" on ${input.to_node}.${this.describeIncomingLinks(linkedSockets)}`,
          is_error: true,
        };
      }
    }
    if (input.from_node) {
      sockets = sockets.filter(
        (socket) =>
          socket.links[0].getSource().getNode().id === input.from_node,
      );
      if (sockets.length === 0) {
        return {
          content: `No link from ${input.from_node} into ${input.to_node}${input.to_socket ? ` "${input.to_socket}"` : ''}.${this.describeIncomingLinks(linkedSockets)}`,
          is_error: true,
        };
      }
    }

    const disconnected: Array<{
      from: { node_id: string; socket: string };
      to: { node_id: string; socket: string };
    }> = [];
    const spinnerLabel = 'AI disconnecting sockets';
    InterfaceController.showSpinner(spinnerLabel);
    try {
      for (const socket of sockets) {
        const source = socket.links[0].getSource();
        // ConnectSocketsActionArgs both ways round: the undo of a disconnect
        // is the connect that puts this exact link back
        const args = new ConnectSocketsActionArgs(
          source.getNode().id,
          source.name,
          input.to_node,
          socket.name,
        );
        await PNPAction(
          ACTIONS.DISCONNECT_SOCKETS,
          args,
          args,
          undefined,
          'ai',
        );
        disconnected.push({
          from: { node_id: source.getNode().id, socket: source.name },
          to: { node_id: input.to_node, socket: socket.name },
        });
      }
    } finally {
      InterfaceController.hideSpinner(spinnerLabel);
    }

    const affectedNodes = [input.to_node, input.from_node]
      .map((id) => (id ? PPGraph.currentGraph.nodes[id] : undefined))
      .filter((node): node is PPNode => Boolean(node));
    affectedNodes.forEach((node) => this.spawnEditEffect(node));
    if (affectedNodes.length > 0) {
      await ensureVisible(affectedNodes);
    }

    return {
      content: JSON.stringify({
        status: 'disconnected',
        links: disconnected,
      }),
    };
  }

  // what IS wired into the node, so a missed link can be corrected in one step
  private describeIncomingLinks(sockets: Socket[]): string {
    if (sockets.length === 0) {
      return ' Nothing is connected to it.';
    }
    const described = sockets.map(
      (socket) =>
        `"${socket.name}" <- ${socket.links[0].getSource().getNode().id}`,
    );
    return ` Connected inputs: ${described.join(', ')}.`;
  }

  // Decides how a connect_sockets call that targets a UI surface should be
  // handled. Non-surface connections return { kind: 'not_surface_widget' } and
  // pass through unchanged. A widget -> surface connection gets a fresh,
  // uniquely-named element socket (mirroring the native drag path); a widget
  // can only drive a surface through its ReactUI output, so if the caller aimed
  // at a different output we transparently redirect to ReactUI (fromSocketName)
  // rather than reject - the intent is unambiguous. It is rejected only if the
  // source has no ReactUI output at all or it would embed a surface into
  // itself, and reported as already connected if that widget is already on the
  // surface (so we don't add a duplicate socket for the same source node).
  private resolveSurfaceWidgetTarget(
    input: ConnectSocketsInput,
  ):
    | { kind: 'not_surface_widget' }
    | { kind: 'error'; result: MCPToolResult }
    | { kind: 'already_connected' }
    | { kind: 'new'; fromSocketName: string; elementSocketName: string } {
    const targetNode = PPGraph.currentGraph.nodes[input.to_node];
    const sourceNode = PPGraph.currentGraph.nodes[input.from_node];
    if (!targetNode?.isSurface() || !sourceNode) {
      return { kind: 'not_surface_widget' };
    }
    // A surface node still exposes real, declared input sockets: a Modal's
    // "Open Dialog"/"Close Dialog" triggers, its "Open" boolean, "Title", etc.
    // When the caller explicitly names one of those, honor it as a normal
    // socket-to-socket link instead of hijacking the connection into widget
    // placement (which discards to_socket and drops the source onto the surface
    // as content). Widget placement is only the right reading when to_socket is
    // an arbitrary widget label that doesn't resolve to an existing input.
    // getInputSocketByName misses TRIGGER sockets, so search all input sockets;
    // element sockets and the structural craft-tree/layout sockets are owned by
    // the widget path / set_surface_layout and are never wired directly here.
    const namedTarget = targetNode
      .getAllInputSockets()
      .find((socket) => socket.name === input.to_socket);
    if (
      namedTarget &&
      !isElementSocket(namedTarget) &&
      namedTarget.name !== surfaceJsonSocketName &&
      namedTarget.name !== dashboardLayoutInputName
    ) {
      return { kind: 'not_surface_widget' };
    }
    // A surface can only be driven by a node's ReactUI output. Use the caller's
    // socket if it already is one; otherwise fall back to the node's ReactUI
    // output (the AI often grabs a value output like a Button's "Out"). Only
    // error when the node has no ReactUI output to place on the surface at all.
    const requestedSocket = sourceNode.getOutputSocketByName(input.from_socket);
    const reactUISocket = sourceNode.getOutputSocketByName(
      SOCKET_NAME_DASHBOARD_CONTENT,
    );
    const widgetSocket =
      requestedSocket?.dataType instanceof DeferredReactType
        ? requestedSocket
        : reactUISocket?.dataType instanceof DeferredReactType
          ? reactUISocket
          : undefined;
    if (!widgetSocket) {
      return {
        kind: 'error',
        result: {
          content: `${sourceNode.getName()} has no "${SOCKET_NAME_DASHBOARD_CONTENT}" output, so it cannot be placed on a surface.`,
          is_error: true,
        },
      };
    }
    const surface = targetNode as unknown as UISurfaceNode;
    if (wouldCreateSurfaceEmbeddingLoop(sourceNode, targetNode)) {
      return {
        kind: 'error',
        result: {
          content: `Connecting ${input.from_node} to surface ${input.to_node} would embed a UI surface into itself or into one it already contains`,
          is_error: true,
        },
      };
    }
    if (getLinkedSourceNodeIds(surface).has(sourceNode.id)) {
      return { kind: 'already_connected' };
    }
    return {
      kind: 'new',
      fromSocketName: widgetSocket.name,
      elementSocketName: surface.getNewSocketName(sourceNode.getName()),
    };
  }

  private async setSocketValue(
    input: SetSocketValueInput,
  ): Promise<MCPToolResult> {
    const targetNode = PPGraph.currentGraph.nodes[input.node_id];

    // A surface's layout has a dedicated, validated tool pair; a raw write to
    // its craft-tree socket bypasses spec validation and widget auto-connect.
    if (
      targetNode?.isSurface() &&
      input.socket_name === surfaceJsonSocketName
    ) {
      return {
        content: `"${surfaceJsonSocketName}" cannot be written directly. Use inspect_surface to read this surface's layout and set_surface_layout to change it.`,
        is_error: true,
      };
    }

    const socket = targetNode?.getInputSocketByName(input.socket_name);

    const { value, warnings: dimensionWarnings } = this.normalizeDimensionValue(
      input.value,
      input.socket_name,
    );
    input = { ...input, value };

    // setting the same value again would only create a no-op undo entry
    if (socket && JSON.stringify(socket.data) === JSON.stringify(input.value)) {
      return {
        content: JSON.stringify({
          status: 'value_unchanged',
          node_id: input.node_id,
          socket_name: input.socket_name,
        }),
      };
    }

    const args: SetSocketValueActionArgs = {
      nodeID: input.node_id,
      socketName: input.socket_name,
      socketType: 'in',
      newValue: input.value,
    };
    const undoArgs: SetSocketValueActionArgs = {
      nodeID: input.node_id,
      socketName: input.socket_name,
      socketType: 'in',
      newValue: socket ? structuredClone(socket.data) : undefined,
    };

    const spinnerLabel = `AI setting ${input.socket_name}`;
    InterfaceController.showSpinner(spinnerLabel);
    try {
      await PNPAction(
        ACTIONS.SET_SOCKET_VALUE,
        args,
        undoArgs,
        undefined,
        'ai',
      );
    } finally {
      InterfaceController.hideSpinner(spinnerLabel);
    }

    const node = PPGraph.currentGraph.nodes[input.node_id];
    if (node) {
      this.spawnEditEffect(node);
      await ensureVisible([node]);
    }

    return {
      content: JSON.stringify({
        status: 'value_set',
        node_id: input.node_id,
        socket_name: input.socket_name,
        ...(dimensionWarnings.length ? { warnings: dimensionWarnings } : {}),
      }),
    };
  }

  // Repairs css dimensions on their way into a socket and notifies caller.
  private normalizeDimensionValue(
    value: unknown,
    socketName: string,
  ): { value: unknown; warnings: string[] } {
    const warnings: string[] = [];

    // a layout node's own Width/Height string socket
    if (socketName === widthName || socketName === heightName) {
      const normalized = normalizeDimension(value, socketName);
      if (normalized.warning) {
        warnings.push(normalized.warning);
      }
      return { value: normalized.value ?? 'auto', warnings };
    }

    // a widget layout object, such as a surface's "<name> layout" override
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { value, warnings };
    }
    return {
      value: normalizeDimensionProps(
        value as Record<string, unknown>,
        socketName,
        warnings,
      ),
      warnings,
    };
  }

  private async setNodeComment(
    input: SetNodeCommentInput,
  ): Promise<MCPToolResult> {
    const node = PPGraph.currentGraph.nodes[input.node_id];
    const oldComment = node?.comment || '';
    const args = new SetCommentActionArgs(input.node_id, input.comment || '');
    const undoArgs = new SetCommentActionArgs(input.node_id, oldComment);

    const spinnerLabel = 'AI setting node comment';
    InterfaceController.showSpinner(spinnerLabel);
    try {
      await PNPAction(ACTIONS.SET_COMMENT, args, undoArgs, undefined, 'ai');
    } finally {
      InterfaceController.hideSpinner(spinnerLabel);
    }

    if (node) {
      this.spawnEditEffect(node);
    }

    return {
      content: JSON.stringify({
        status: 'comment_set',
        node_id: input.node_id,
      }),
    };
  }

  private async setUpdateBehaviour(
    input: SetUpdateBehaviourInput,
  ): Promise<MCPToolResult> {
    const node = PPGraph.currentGraph.nodes[input.node_id];
    if (!node) {
      return {
        content: `Node not found: ${input.node_id}`,
        is_error: true,
      };
    }

    const oldBehaviour = node.updateBehaviour;
    const intervalFrequency =
      input.interval_frequency === undefined
        ? oldBehaviour.intervalFrequency
        : Number(input.interval_frequency);
    if (
      !Number.isFinite(intervalFrequency) ||
      intervalFrequency <= 0 ||
      !Number.isInteger(intervalFrequency)
    ) {
      return {
        content:
          'interval_frequency must be a positive integer in milliseconds',
        is_error: true,
      };
    }

    const args = new SetUpdateBehaviourActionArgs(
      input.node_id,
      input.load ?? oldBehaviour.load,
      input.update ?? oldBehaviour.update,
      input.interval ?? oldBehaviour.interval,
      intervalFrequency,
    );
    const undoArgs = new SetUpdateBehaviourActionArgs(
      input.node_id,
      oldBehaviour.load,
      oldBehaviour.update,
      oldBehaviour.interval,
      oldBehaviour.intervalFrequency,
    );

    const spinnerLabel = 'AI setting update behaviour';
    InterfaceController.showSpinner(spinnerLabel);
    try {
      await PNPAction(
        ACTIONS.SET_UPDATE_BEHAVIOUR,
        args,
        undoArgs,
        undefined,
        'ai',
      );
    } finally {
      InterfaceController.hideSpinner(spinnerLabel);
    }

    this.spawnEditEffect(node);

    return {
      content: JSON.stringify({
        status: 'update_behaviour_set',
        node_id: input.node_id,
        update_behaviour: this.updateBehaviourToSerializable(node),
      }),
    };
  }

  // Returns an error result to hand back to the model when trigger_type is
  // not one of TRIGGER_TYPE_OPTIONS, undefined when it is valid.
  private triggerTypeError(triggerType: string): MCPToolResult | undefined {
    const validTypes = TRIGGER_TYPE_OPTIONS.map((option) => option.text);
    if (!validTypes.includes(triggerType)) {
      return {
        content: `Invalid trigger_type "${triggerType}". Valid types: ${validTypes.join(', ')}`,
        is_error: true,
      };
    }
    return undefined;
  }

  private addTriggerInput(input: AddTriggerInputInput): MCPToolResult {
    const node = PPGraph.currentGraph.nodes[input.node_id];
    if (!node) {
      return {
        content: `Node not found: ${input.node_id}`,
        is_error: true,
      };
    }
    if (input.trigger_type !== undefined) {
      const error = this.triggerTypeError(input.trigger_type);
      if (error) {
        return error;
      }
    }

    // same code path as the user's right-click "Add Trigger Input" (which
    // does not create an undo action either)
    node.addDefaultTrigger();
    const socket =
      node.nodeTriggerSocketArray[node.nodeTriggerSocketArray.length - 1];
    if (input.trigger_type !== undefined) {
      (socket.dataType as TriggerType).triggerType = input.trigger_type;
    }

    this.spawnEditEffect(node);

    return {
      content: JSON.stringify({
        status: 'trigger_input_added',
        node_id: input.node_id,
        socket_name: socket.name,
        trigger_type: (socket.dataType as TriggerType).triggerType,
        hint: `Connect a widget output (e.g. a Button's "Out") to "${socket.name}" with connect_sockets to execute ${node.getName()} when it fires.`,
      }),
    };
  }

  private setTriggerType(input: SetTriggerTypeInput): MCPToolResult {
    const node = PPGraph.currentGraph.nodes[input.node_id];
    if (!node) {
      return {
        content: `Node not found: ${input.node_id}`,
        is_error: true,
      };
    }
    const socket = node.getNodeTriggerSocketByName(input.socket_name);
    if (!socket || !(socket.dataType instanceof TriggerType)) {
      const triggerNames = node.nodeTriggerSocketArray.map(
        (triggerSocket) => triggerSocket.name,
      );
      return {
        content: `${node.getName()} has no trigger socket "${input.socket_name}". Trigger sockets: ${
          triggerNames.length ? triggerNames.join(', ') : '(none)'
        }`,
        is_error: true,
      };
    }
    const error = this.triggerTypeError(input.trigger_type);
    if (error) {
      return error;
    }

    // same in-place mutation as the socket inspector's TriggerWidget
    socket.dataType.triggerType = input.trigger_type;

    this.spawnEditEffect(node);

    return {
      content: JSON.stringify({
        status: 'trigger_type_set',
        node_id: input.node_id,
        socket_name: socket.name,
        trigger_type: input.trigger_type,
      }),
    };
  }

  private setNodeName(input: SetNodeNameInput): MCPToolResult {
    const node = PPGraph.currentGraph.nodes[input.node_id];
    if (!node) {
      return {
        content: `Node not found: ${input.node_id}`,
        is_error: true,
      };
    }
    // same trim/reject-empty semantics as the surface list's rename input
    // (SurfaceListPanel.commitName)
    const nextName = String(input.name ?? '').trim();
    if (!nextName) {
      return {
        content: 'name must not be empty',
        is_error: true,
      };
    }

    node.setNodeName(nextName);

    this.spawnEditEffect(node);

    return {
      content: JSON.stringify({
        status: 'node_renamed',
        node_id: input.node_id,
        name: nextName,
      }),
    };
  }

  private async inspectUI(input: InspectUIInput): Promise<MCPToolResult> {
    const source: AIInspectSource = input.source ?? 'dashboard';
    if (!AI_INSPECT_SOURCES.includes(source)) {
      return {
        content: `inspect_ui source must be one of ${AI_INSPECT_SOURCES.join(', ')}`,
        is_error: true,
      };
    }

    const structure = this.getUIStructure(source);
    let image: string | undefined;
    let captureNote: string;
    try {
      const captured = await captureForAI(source);
      image = captured.dataURL;
      captureNote = `The attached image is the ${captured.note}.`;
    } catch (error) {
      captureNote =
        'No image could be taken: ' +
        (error instanceof Error ? error.message : String(error)) +
        ' The structure below is still current.';
    }

    return {
      content: JSON.stringify({
        source,
        image: captureNote,
        structure_of: structure.describes,
        structure: structure.content,
      }),
      ...(image ? { images: [image] } : {}),
    };
  }

  /** What the image is a picture of, in the serialisation the edit tools take. */
  private getUIStructure(source: AIInspectSource): {
    describes: string;
    content: unknown;
  } {
    if (source === 'dashboard') {
      const nodeId = getDisplayedSurfaceNodeId();
      if (!nodeId) {
        return {
          describes: 'no surface',
          content: 'No UI surface is being displayed.',
        };
      }
      return {
        describes: `the layout of UI surface ${nodeId}, as set_surface_layout takes it`,
        content: this.parseToolContent(
          this.inspectSurface({ node_id: nodeId }),
        ),
      };
    }

    if (source === 'selection') {
      // an empty selection serializes to an empty subgraph, which reads like a
      // broken tool rather than like an empty canvas selection - say so
      if ((PPGraph.currentGraph.selection?.selectedNodes?.length ?? 0) === 0) {
        return {
          describes: 'no selection',
          content:
            'No nodes are selected. Use source "graph" to see the whole canvas.',
        };
      }
      return {
        describes: 'the serialized subgraph of the selected nodes',
        content: this.parseToolContent(this.inspectSelectedNodes()),
      };
    }
    return {
      describes: 'every node in the graph',
      content: this.parseToolContent(this.inspectGraph()),
    };
  }

  /**
   * Inlines an inspection tool's json so the pair arrives as one object rather
   * than as json escaped inside json.
   */
  private parseToolContent(result: MCPToolResult): unknown {
    try {
      return JSON.parse(result.content);
    } catch {
      return result.content;
    }
  }

  private inspectSurface(input: InspectSurfaceInput): MCPToolResult {
    const node = PPGraph.currentGraph.nodes[input.node_id];
    if (!node) {
      return {
        content: `Node not found: ${input.node_id}`,
        is_error: true,
      };
    }
    if (!node.isSurface()) {
      return {
        content: `Node ${input.node_id} is not a UI surface node`,
        is_error: true,
      };
    }

    const surface = node as unknown as UISurfaceNode;

    const connectedWidgets = getElementSockets(surface).flatMap((socket) => {
      return socket.links.map((link) => {
        const sourceNode = link.getSource().getNode();
        return {
          node_id: sourceNode.id,
          node_name: sourceNode.getName(),
          node_type: sourceNode.type,
          element_socket: socket.name,
          visible_socket: socket.name + surfaceElementVisibleSuffix,
          layout_socket: socket.name + surfaceElementLayoutSuffix,
        };
      });
    });

    const { root, unknownItems } = decompileSurfaceTree(
      surface.getSurfaceTree(),
    );

    const otherSurfaces = Object.values(PPGraph.currentGraph.nodes)
      .filter((candidate) => candidate.isSurface() && candidate.id !== node.id)
      .map((candidate) => ({
        node_id: candidate.id,
        // the name navigateToSurface matches (exact, case-sensitive)
        name: (candidate as unknown as UISurfaceNode).getDashboardName(),
        is_default:
          PPGraph.currentGraph.defaultUISurfaceNodeId === candidate.id,
      }));

    return {
      content: JSON.stringify({
        node_id: node.id,
        // the name navigateToSurface matches (exact, case-sensitive)
        name: surface.getDashboardName(),
        route: surface.getRouteSlug(),
        radio_group: surface.getRadioGroup(),
        is_default: PPGraph.currentGraph.defaultUISurfaceNodeId === node.id,
        is_layout_locked: surface.isLayoutLocked(),
        connected_widgets: connectedWidgets,
        layout: root,
        unknown_layout_items: unknownItems,
        other_surfaces: otherSurfaces,
      }),
    };
  }

  /**
   * Refuses an edit to a layout the graph owns. A linked "Layout JSON" input
   * rewrites the surface on every execution, so a write that got through here
   * would report success and then be silently overwritten.
   */
  private layoutLockedError(
    surface: UISurfaceNode,
    nodeId: string,
    toolName: MCPToolName,
  ): MCPToolResult | undefined {
    if (!surface.isLayoutLocked()) {
      return undefined;
    }
    return {
      content: `Surface ${nodeId} is layout-locked: its "Layout JSON" input socket has a link, so the graph owns this layout. Disconnect that link before using ${toolName}.`,
      is_error: true,
    };
  }

  private async applySurfaceLayout(
    nodeId: string,
    newTreeJSON: string,
    previousTreeJSON: string,
    spinnerLabel: string,
  ): Promise<void> {
    const args = new SetUISurfaceLayoutActionArgs(nodeId, newTreeJSON);
    const undoArgs = new SetUISurfaceLayoutActionArgs(nodeId, previousTreeJSON);

    InterfaceController.showSpinner(spinnerLabel);
    try {
      await PNPAction(
        ACTIONS.SET_UI_SURFACE_LAYOUT,
        args,
        undoArgs,
        undefined,
        'ai',
      );
    } finally {
      InterfaceController.hideSpinner(spinnerLabel);
    }
  }

  // Patches one item's layout properties in place.
  private async setLayoutValue(
    input: SetLayoutValueInput,
  ): Promise<MCPToolResult> {
    const node = PPGraph.currentGraph.nodes[input.node_id];
    if (!node) {
      return { content: `Node not found: ${input.node_id}`, is_error: true };
    }
    if (!node.isSurface()) {
      return {
        content: `Node ${input.node_id} is not a UI surface node`,
        is_error: true,
      };
    }
    if (
      typeof input.values !== 'object' ||
      input.values === null ||
      Array.isArray(input.values)
    ) {
      return {
        content:
          'set_layout_value needs a "values" object, e.g. {"height": "240px"}',
        is_error: true,
      };
    }

    const surface = node as unknown as UISurfaceNode;
    const locked = this.layoutLockedError(
      surface,
      input.node_id,
      'set_layout_value',
    );
    if (locked) {
      return locked;
    }
    const tree = surface.getSurfaceTree();
    const itemId = findLayoutItemId(tree, input.item);
    if (itemId === undefined) {
      return {
        content: `No layout item "${input.item}" on surface ${input.node_id}. Use inspect_surface to read the current item ids.`,
        is_error: true,
      };
    }

    const item = tree[itemId];
    const kind = getSpecItemKind(item?.type?.resolvedName);
    if (kind === undefined) {
      return {
        content: `Layout item "${input.item}" is of an unrecognised kind and cannot be patched here. Use set_surface_layout.`,
        is_error: true,
      };
    }

    const patch = applySpecProperties(item.props ?? {}, input.values, kind);
    if (patch.applied.length === 0) {
      return {
        content: `Nothing was changed. ${patch.warnings.join(' ')}`,
        is_error: true,
      };
    }

    const previousTreeJSON = JSON.stringify(tree);
    const newTree = { ...tree, [itemId]: { ...item, props: patch.props } };
    const newTreeJSON = JSON.stringify(newTree);

    await this.applySurfaceLayout(
      input.node_id,
      newTreeJSON,
      previousTreeJSON,
      'AI setting layout value',
    );

    return {
      content: JSON.stringify({
        status: 'layout_value_set',
        node_id: input.node_id,
        item: itemId,
        item_kind: kind,
        applied: patch.applied,
        ...(patch.warnings.length ? { warnings: patch.warnings } : {}),
      }),
    };
  }

  private async setSurfaceLayout(
    input: SetSurfaceLayoutInput,
  ): Promise<MCPToolResult> {
    const node = PPGraph.currentGraph.nodes[input.node_id];
    if (!node) {
      return {
        content: `Node not found: ${input.node_id}`,
        is_error: true,
      };
    }
    if (!node.isSurface()) {
      return {
        content: `Node ${input.node_id} is not a UI surface node`,
        is_error: true,
      };
    }

    const surface = node as unknown as UISurfaceNode;

    const locked = this.layoutLockedError(
      surface,
      input.node_id,
      'set_surface_layout',
    );
    if (locked) {
      return locked;
    }

    const spec = input.layout as ContainerSpecItem;
    const specWidgetIds = new Set<string>();
    const collectWidgetIds = (item: unknown) => {
      if (!item || typeof item !== 'object') {
        return;
      }
      const record = item as Record<string, unknown>;
      if (typeof record.widget === 'string') {
        specWidgetIds.add(record.widget);
      }
      if (Array.isArray(record.children)) {
        record.children.forEach(collectWidgetIds);
      }
    };
    collectWidgetIds(spec);

    // Reject unresolvable widget ids up front, BEFORE any connection side
    // effects. The dashboard resolves a widget item through
    // getLayoutableElement(NODE_<id>) at render time and silently shows a
    // placeholder when that fails (the node does not exist, or the node is
    // not layoutable) - malformed input must be loud for the LLM instead of
    // producing a degraded surface.
    const unresolvableWidgetIds = Array.from(specWidgetIds).filter(
      (widgetNodeId) =>
        !PPGraph.currentGraph.nodes[widgetNodeId] ||
        !getLayoutableElement(getElementIdForNode(widgetNodeId)),
    );
    if (unresolvableWidgetIds.length > 0) {
      return {
        content:
          `set_surface_layout: widget id(s) do not resolve to a layoutable graph node: ` +
          `${unresolvableWidgetIds.join(', ')}. Each "widget" value must be the id of an ` +
          `existing node with a ReactUI output. The layout was NOT applied.`,
        is_error: true,
      };
    }

    const alreadyLinkedIds = getLinkedSourceNodeIds(surface);
    const newlyConnected: string[] = [];

    for (const widgetNodeId of specWidgetIds) {
      if (alreadyLinkedIds.has(widgetNodeId)) {
        continue;
      }
      const sourceNode = PPGraph.currentGraph.nodes[widgetNodeId];
      if (!sourceNode) {
        return {
          content: `Node not found: ${widgetNodeId}`,
          is_error: true,
        };
      }
      const reactUISocket = sourceNode.getOutputSocketByName(
        SOCKET_NAME_DASHBOARD_CONTENT,
      );
      if (!reactUISocket) {
        return {
          content: `node ${widgetNodeId} has no UI output — it cannot be placed on a surface`,
          is_error: true,
        };
      }
      if (wouldCreateSurfaceEmbeddingLoop(sourceNode, node)) {
        return {
          content: `Connecting ${widgetNodeId} to surface ${input.node_id} would embed a UI surface into itself or into one it already contains`,
          is_error: true,
        };
      }

      // connectSockets is surface-aware: it allocates a fresh, uniquely-named
      // element socket for each widget (see resolveSurfaceWidgetTarget), so two
      // same-typed widgets no longer collide on one socket. The to_socket we
      // pass here is only a hint and is superseded by that logic.
      const connectResult = await this.connectSockets({
        from_node: widgetNodeId,
        from_socket: SOCKET_NAME_DASHBOARD_CONTENT,
        to_node: input.node_id,
        to_socket: sourceNode.getName(),
      });
      if (connectResult.is_error) {
        return connectResult;
      }
      newlyConnected.push(widgetNodeId);
    }

    const previousTreeJSON = JSON.stringify(surface.getSurfaceTree());
    const currentConnectedIds = getLinkedSourceNodeIds(surface);

    // each widget's node-preferred props (the same ones a sync-layer insert
    // applies), recomputed fresh on every call - see compileSurfaceSpec for
    // the declarative contract
    const widgetPropsByNodeId = new Map<string, Record<string, unknown>>();
    currentConnectedIds.forEach((nodeId) => {
      const widgetNode = PPGraph.currentGraph.nodes[nodeId];
      if (widgetNode && isLayoutableNode(widgetNode)) {
        widgetPropsByNodeId.set(
          nodeId,
          widgetNode.getWidgetProps() as unknown as Record<string, unknown>,
        );
      }
    });

    let compiled: { tree: unknown; warnings: string[] };
    try {
      compiled = compileSurfaceSpec(
        spec,
        currentConnectedIds,
        widgetPropsByNodeId,
      );
    } catch (error) {
      return {
        content:
          error instanceof Error
            ? error.message
            : 'Unknown error compiling the layout spec',
        is_error: true,
      };
    }

    const newTreeJSON = JSON.stringify(compiled.tree);

    await this.applySurfaceLayout(
      input.node_id,
      newTreeJSON,
      previousTreeJSON,
      'AI setting surface layout',
    );

    this.spawnEditEffect(node);
    await ensureVisible([node]);

    const { root } = decompileSurfaceTree(surface.getSurfaceTree());

    return {
      content: JSON.stringify({
        status: 'layout_set',
        node_id: input.node_id,
        connected: newlyConnected,
        warnings: compiled.warnings,
        layout: root,
      }),
    };
  }

  // matches the UI's own star-toggle behaviour in SurfaceListPanel, which
  // also mutates this directly rather than going through the undo system
  private setDefaultSurface(input: SetDefaultSurfaceInput): MCPToolResult {
    const node = PPGraph.currentGraph.nodes[input.node_id] as
      (PPNode & { isSurface?: () => boolean }) | undefined;
    if (!node) {
      return {
        content: `Node not found: ${input.node_id}`,
        is_error: true,
      };
    }
    if (!node.isSurface?.()) {
      return {
        content: `Node ${input.node_id} is not a UI surface node`,
        is_error: true,
      };
    }

    PPGraph.currentGraph.defaultUISurfaceNodeId = input.node_id;
    ActionHandler.setUnsavedChange(true);

    return {
      content: JSON.stringify({
        status: 'default_surface_set',
        node_id: input.node_id,
      }),
    };
  }

  private spawnEditEffect(node: PPNode): void {
    const graph = PPGraph.currentGraph;
    if (!graph?.app || !graph.viewport || node.destroyed) return;

    const cx = node.x + node.nodeWidth / 2;
    const cy = node.y + node.nodeHeight / 2;

    const container = new PIXI.Container();
    container.x = cx;
    container.y = cy;
    graph.foregroundCanvas.addChild(container);

    const halo = new PIXI.Graphics();
    const cog = new PIXI.Graphics();
    container.addChild(halo);
    container.addChild(cog);

    const cogRadius = 26;
    const cogTeeth = 12;
    const cogInnerRadius = cogRadius * 0.76;
    const cogOuterRadius = cogRadius * 1.08;
    const toothWidth = (Math.PI * 2) / cogTeeth / 2;
    const holeRadius = cogRadius * 0.33;
    const yellow = 0xf4c430;
    const centerYellow = 0xffdf68;

    cog.beginFill(yellow, 1);
    for (let i = 0; i < cogTeeth; i++) {
      const toothCenter = (Math.PI * 2 * i) / cogTeeth - Math.PI / 2;
      const toothStart = toothCenter - toothWidth / 2;
      const toothEnd = toothCenter + toothWidth / 2;
      const nextToothStart =
        toothCenter + (Math.PI * 2) / cogTeeth - toothWidth / 2;
      const points = [
        [
          Math.cos(toothStart) * cogInnerRadius,
          Math.sin(toothStart) * cogInnerRadius,
        ],
        [
          Math.cos(toothStart) * cogOuterRadius,
          Math.sin(toothStart) * cogOuterRadius,
        ],
        [
          Math.cos(toothEnd) * cogOuterRadius,
          Math.sin(toothEnd) * cogOuterRadius,
        ],
        [
          Math.cos(toothEnd) * cogInnerRadius,
          Math.sin(toothEnd) * cogInnerRadius,
        ],
        [
          Math.cos(nextToothStart) * cogInnerRadius,
          Math.sin(nextToothStart) * cogInnerRadius,
        ],
      ];
      points.forEach(([x, y], pointIndex) => {
        if (i === 0 && pointIndex === 0) {
          cog.moveTo(x, y);
        } else {
          cog.lineTo(x, y);
        }
      });
    }
    cog.closePath();
    cog.endFill();

    cog.beginFill(centerYellow, 1);
    cog.drawCircle(0, 0, holeRadius);
    cog.endFill();

    cog.lineStyle(3, 0xd09400, 0.75);
    cog.drawCircle(0, 0, cogRadius * 0.6);

    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.22);
    shadow.drawCircle(3, 4, cogRadius * 1.12);
    shadow.endFill();
    container.addChildAt(shadow, 0);

    let age = 0;
    const maxAge = 160;
    const fadeInFrames = 20;
    const fadeOutFrames = 48;

    const onTick = () => {
      age++;
      const fadeIn = Math.min(age / fadeInFrames, 1);
      const fadeOut = Math.min((maxAge - age) / fadeOutFrames, 1);
      const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
      const pulse = 0.98 + Math.sin(age * 0.08) * 0.025;

      container.alpha = alpha;
      cog.rotation += 0.024;
      cog.scale.set(pulse);
      shadow.scale.set(pulse);
      shadow.alpha = 0.65 * alpha;

      halo.clear();
      halo.lineStyle(3, yellow, 0.22 * alpha);
      halo.drawCircle(0, 0, cogRadius * (1.55 + Math.sin(age * 0.06) * 0.08));
      halo.lineStyle(1, 0xffffff, 0.18 * alpha);
      halo.drawCircle(0, 0, cogRadius * 1.18);

      if (age >= maxAge) {
        graph.app.ticker.remove(onTick);
        container.destroy({ children: true });
      }
    };

    graph.app.ticker.add(onTick);
  }
}
