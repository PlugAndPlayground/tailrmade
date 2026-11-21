import PPNode from '../classes/NodeClass';
import { DeprecatedNode } from './deprecated/DeprecatedNode';
import { RegisteredNodeTypes } from '../utils/interfaces';

declare const require: (path: string) => any;

let allNodesCached: RegisteredNodeTypes | undefined = undefined;
let allNodesInDetail: Promise<any[]> | undefined = undefined;
let aiNodesInDetail: Promise<any[]> | undefined = undefined;
let aiNodesCompactList: Promise<string> | undefined = undefined;

// TODO get rid of copy pasting here
const getNodeCategories = () => ({
  array: require('./data/array'),
  base: require('./base'),
  booleanlogic: require('./logic/boolean'),
  browser: require('./utility/browser'),
  lineCharts: require('./draw/graph/lineGraph'),
  pieCharts: require('./draw/graph/pieGraph'),
  scatterCharts: require('./draw/graph/scatterGraph'),
  trendLine: require('./draw/graph/trendLine'),
  barCharts: require('./draw/graph/barGraph'),
  draw_meta: require('./draw/drawMeta'),
  codeEditor: require('./editor/codeEditor'),
  database: require('./utility/database'),
  dataFunctions: require('./data/dataFunctions'),
  statistics: require('./data/statistics'),
  plotlyChart: require('./draw/graph/plotlyChart'),
  draw: require('./draw/draw'),
  drawCombine: require('./draw/drawCombine'),
  drawInteractivity: require('./draw/drawInteractivity'),
  get: require('./api/http'),
  websocket: require('./api/websocket'),
  html: require('./draw/html'),
  slides: require('./draw/slides'),
  video: require('./draw/video'),
  image: require('./image/image'),
  screenshot: require('./image/screenshot'),
  json: require('./data/json'),
  logViewer: require('./logViewer'),
  macro: require('./macro/macro'),
  math: require('./math'),
  tailrmade: require('./utility/tailrmade'),
  replay: require('./utility/replay'),
  subtitle: require('./utility/subtitle'),
  typeOf: require('./utility/typeOf'),
  theme: require('./utility/theme'),
  pixotopegateway: require('./api/pixotopeGateway'),
  shader: require('./image/shader'),
  storageAccumulators: require('./state/storageAccumulator'),
  string: require('./string'),
  table2: require('./table/table2'),
  rawSpreadsheet: require('./table/rawSpreadsheet'),
  test: require('./data/test'),
  text: require('./text'),
  textEditor2: require('./textEditor/textEditor2'),
  utility: require('./utility/utility'),
  widgetNodes: require('./widgets/'),
  ai: require('./api/ai'),
  dataTypeConversions: require('./dataConversion/dataTypeConversions'),
  spreadsheetToTable: require('./dataConversion/spreadsheetToTable'),
  graphConversions: require('./dataConversion/graphTypeConversions'),
  constants: require('./constants/constants'),
  autoTestNodes: require('./automaticTesting/automaticTestNodes'),
  sequence: require('./utility/sequence'),
  quantize: require('./dataConversion/quantizeData'),
  layout: require('./layout/dynamicLayout'),
  storage: require('./state/storage'),
  pdf: require('./pdf/PDF'),
  plotly: require('./draw/graph/3dGraphPlotly'),
  unrealEngine: require('./unrealEngine/uassetParser'),
  userStatus: require('./user/userStatus'),
  saveFile: require('./utility/saveFile'),
  events: require('./events'),
  uiSurface: require('./layout/uiSurface'),
  uiModal: require('./layout/uiModal'),
  deprecated: require('./deprecated/deprecatedNodes'),
});

// The AI sees every node but these, by the key add_node takes. A new node is
// visible to it by default - a node it cannot see, it will not use.
// Deprecated nodes are always hidden.
const AI_EXCLUDED_NODES = new Set<string>([
  // the native canvas charts and their graph inputs: PlotlyChart replaces them
  'GRAPH_LINE',
  'GRAPH_PIE',
  'GRAPH_SCATTER',
  'GRAPH_BAR',
  'TrendLine',
  'JSONArrayToGraphInputX',
  'JSONArrayToGraphInputXY',
  'JSONArrayToGraphInputXYZ',
  // test fixtures
  'TestDataTypes',
  'TEST_PotentiallyFail',
  'TEXT_PotentiallySucceed',
  // vendor integrations that need hardware or files the AI cannot assume
  'PixotopeGatewayGet',
  'PixotopeGatewaySet',
  'PixotopeGatewayCall',
  'UAssetParser',
  // jumps the editor's viewport, which means nothing in an app
  'JumpToNode',
  // stands in for a node type that failed to load
  'Placeholder',
  // presets of AINode, which the AI picks the provider on directly
  'ClaudeNode',
  'GeminiNode',
]);

const isAIVisible = (node: PPNode, key: string): boolean =>
  !AI_EXCLUDED_NODES.has(key) && !(node instanceof DeprecatedNode);

export const getAllNodeTypes = (): RegisteredNodeTypes => {
  if (allNodesCached === undefined) {
    const categories = getNodeCategories();
    const toReturn: RegisteredNodeTypes = {};
    const start = Date.now();
    for (const categoryValue of Object.values(categories)) {
      for (const key of Object.keys(categoryValue)) {
        const nodeConstructor = categoryValue[key];
        if (nodeConstructor.prototype instanceof PPNode) {
          const node: PPNode = new nodeConstructor(key);
          const hasInputs = node.hasInputSockets();
          const normalizedKey = key.toLowerCase();

          toReturn[normalizedKey] = {
            constructor: nodeConstructor,
            name: node.getName(),
            description: node.getDescription(),
            hasInputs: hasInputs,
            tags: node.getTags(),
            hasExample: node.hasExample(),
            showInNodeSearch: node.showInNodeSearch(),
            deprecated: node instanceof DeprecatedNode,
          };
        }
      }
    }
    console.log('time to gather all node info: ' + (Date.now() - start));
    allNodesCached = toReturn as RegisteredNodeTypes;
  }
  return allNodesCached;
};

export const getNodeTypesByTag = (tagName?: string): RegisteredNodeTypes => {
  const allNodes = getAllNodeTypes();

  if (!tagName) {
    return allNodes;
  }

  return Object.fromEntries(
    Object.entries(allNodes).filter(([_, nodeInfo]) =>
      nodeInfo.tags.includes(tagName),
    ),
  );
};

export const getAllTagNames = (): string[] => {
  const allNodes = getAllNodeTypes();
  return [
    ...new Set(
      Object.values(allNodes)
        .filter((node) => node.showInNodeSearch)
        .map((node) => node.tags)
        .flat(),
    ),
  ].sort();
};

const getDetailsForNode = (node: PPNode, key: string): any => {
  const inputSockets = node.getAllInputSockets().map((socket) => {
    return `${socket.name}:${socket.dataType.getName()}`;
  });
  const outputSockets = node.outputSocketArray.map((socket) => {
    return `${socket.name}: ${socket.dataType.getName()}`;
  });

  const nodesUpdateBehaviour = node.getUpdateBehaviour();
  const updateBehaviour = [
    nodesUpdateBehaviour.load,
    nodesUpdateBehaviour.update,
    nodesUpdateBehaviour.interval,
    nodesUpdateBehaviour.intervalFrequency,
  ];

  return {
    key: key,
    name: node.getName(),
    description: node.getDescription(),
    hasDocs: node.getDocs() !== '',
    tags: node.getTags().join(),
    hasExample: node.hasExample(),
    updateBehaviour: updateBehaviour.join(),
    inputCount: node.getAllInputSockets().length,
    inputSockets: inputSockets.join(),
    outputCount: node.outputSocketArray.length,
    outputSockets: outputSockets.join(),
  };
};

const getDetailsForCategory = (
  category: any,
  include: (node: PPNode, key: string) => boolean = () => true,
): any[] => {
  const toReturn: any[] = [];
  for (const key of Object.keys(category)) {
    const nodeConstructor = category[key];
    if (nodeConstructor.prototype instanceof PPNode) {
      const node: PPNode = new nodeConstructor(key);
      if (!include(node, key)) continue;
      toReturn.push(getDetailsForNode(node, key));
    }
  }
  return toReturn;
};

export const getAllNodesInDetail = (): Promise<any[]> => {
  if (allNodesInDetail === undefined) {
    const categories = getNodeCategories();
    const toReturn: any[] = [];
    for (const [categoryKey, categoryValue] of Object.entries(categories)) {
      toReturn.push(...getDetailsForCategory(categoryValue));
    }
    allNodesInDetail = Promise.resolve(
      toReturn.sort((a, b) => a.name.localeCompare(b.name)),
    );
  }
  return allNodesInDetail;
};

export const getAINodesInDetail = (): Promise<any[]> => {
  if (aiNodesInDetail === undefined) {
    const categories = getNodeCategories();
    const toReturn: any[] = [];
    for (const categoryValue of Object.values(categories)) {
      toReturn.push(...getDetailsForCategory(categoryValue, isAIVisible));
    }
    aiNodesInDetail = Promise.resolve(
      toReturn.sort((a, b) => a.name.localeCompare(b.name)),
    );
  }
  return aiNodesInDetail;
};

const MAX_COMPACT_DESCRIPTION_LENGTH = 140;

// Single-line, compact rendering of one node's description for the catalogue.
// Strips newlines and truncates to a fixed budget so the catalogue - and
// therefore the cached system prompt prefix - stays stable. The detail lives
// in getDocs(), which the AI fetches per node through describe_node.
const getCompactDescriptionForNode = (nodeDetail: any): string => {
  const description = String(nodeDetail.description ?? '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();

  if (description.length > MAX_COMPACT_DESCRIPTION_LENGTH) {
    return `${description.slice(0, MAX_COMPACT_DESCRIPTION_LENGTH - 1).trimEnd()}…`;
  }

  return description;
};

// Renders a compact, deterministic catalogue of every AI-visible node type
// (one line per node) so it can be embedded directly in the (prompt-cached)
// system prompt instead of the AI having to page through list_available_nodes
// results across multiple calls. The result MUST be byte-identical across
// calls within a session, or it invalidates the Anthropic prompt cache prefix
// on every turn - keep this pure/deterministic over the already memoized,
// name-sorted getAINodesInDetail() data.
export const getAINodesCompactList = (): Promise<string> => {
  if (aiNodesCompactList === undefined) {
    aiNodesCompactList = getAINodesInDetail().then((nodeDetails) =>
      nodeDetails
        .map((nodeDetail) => {
          const description = getCompactDescriptionForNode(nodeDetail);
          const docsMarker = nodeDetail.hasDocs ? ' [docs]' : '';
          return `- ${nodeDetail.key} (${nodeDetail.name}): ${description}${docsMarker}`;
        })
        .join('\n'),
    );
  }
  return aiNodesCompactList;
};
