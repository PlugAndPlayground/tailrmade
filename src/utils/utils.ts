import React, { useEffect, useState, useRef } from 'react';
import JSON5 from 'json5';
import * as PIXI from 'pixi.js';
import isUrl from 'is-url';
import { useTheme } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import PPStorage, { checkForUnsavedChanges } from '../PPStorage';
import PPGraph from '../classes/GraphClass';
import PPNode from '../classes/NodeClass';
import PPSocket from '../classes/SocketClass';
import HybridNode2 from '../classes/HybridNode2';
import {
  CONDITION_OPTIONS,
  DATA_DASHBOARD_EDITABLE,
  DEFAULT_2DVECTOR,
  DEFAULT_3DVECTOR,
  GET_STARTED_GRAPH,
  GESTUREMODE,
  IMAGE_TYPES,
  MAX_STRING_LENGTH,
  NODE_HEADER_HEIGHT,
  NODE_PADDING_TOP,
  SOCKET_TEXTMARGIN_TOP,
  SOCKET_TYPE,
  SOCKET_WIDTH,
  URL_PARAMETER_NAME,
} from './constants';
import { GraphDatabase, StoredGraph } from './indexedDB';
import {
  IGraphSearch,
  IWarningHandler,
  Layoutable,
  SerializedSelection,
  TParseType,
} from './interfaces';
import { parseElementId } from './elementIds';
import { Viewport } from 'pixi-viewport';
import { EnumItem } from '../nodes/datatypes/enumType';
import { AbstractType } from '../nodes/datatypes/abstractType';
import { PNPSuccess, SocketParsingWarning } from '../classes/ErrorClass';
import { getNodesUpperLeftCorner } from '../pixi/utils-pixi';
import InterfaceController from '../InterfaceController';
import { outputPixiName } from '../nodes/draw/abstract';
import { SOCKET_NAME_DASHBOARD_CONTENT } from './layoutableHelpers';
import { isCSV } from './dataParser';
import { Table2, tableDataInputName } from '../nodes/table/table2';
import { htmlInputSocketName } from '../nodes/draw/html';
import {
  createMarkdownFromText,
  textEditorAutoHeightName,
  textEditorMarkdownName,
} from '../nodes/textEditor/textEditor2';
import { BackendGateway } from '../services/BackendGateway';
import { ActionHandler } from '../classes/Action';
import type { URLSetSocketData } from '../nodes/state/storage';
import FlowLogic from '../classes/FlowLogic';

export function isFunction(funcOrClass: any): boolean {
  const propertyNames = Object.getOwnPropertyNames(funcOrClass);
  console.log(propertyNames);
  return (
    !propertyNames.includes('prototype') || propertyNames.includes('arguments')
  );
}

export function isClass(item: any): boolean {
  console.log(item.constructor.name);
  return (
    item.constructor.name !== 'Function' && item.constructor.name !== 'Object'
  );
}

export function convertToArray<T>(value: T | T[]): T[] {
  let array: T[] = [];
  if (Array.isArray(value)) {
    array = value;
  } else {
    array.push(value);
  }
  return array;
}

const numberFormatter = new Intl.NumberFormat();

export function prettyPrintNumber(n: number) {
  return numberFormatter.format(n);
}

export function convertToViewableString(value: unknown): string {
  // Early return for null, undefined, or primitive types
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value !== 'object') {
    return typeof value === 'string' ? value : String(value);
  }

  try {
    // For objects, check for RenderTexture first
    let hasRenderTexture = false;
    let keyCount = 0;
    const formattedKeys: string[] = [];

    for (const key in value) {
      keyCount++;

      // Early size check to avoid processing huge objects
      if (keyCount > 5000) {
        return '[Large amount of data, preview unavailable]';
      }

      // Check for RenderTexture without creating arrays
      if (value[key]?.constructor?.name === 'RenderTexture') {
        hasRenderTexture = true;
        formattedKeys.push(`${key}: [Image]`);
      } else if (hasRenderTexture) {
        // Only collect keys if we found a RenderTexture
        formattedKeys.push(`${key}: [Image]`);
      }
    }

    if (hasRenderTexture) {
      return formattedKeys.join(',');
    }

    // Skip objectIsSuperLarge check since we already counted keys
    if (keyCount > 5000) {
      return '[Large amount of data, preview unavailable]';
    }

    return JSON.stringify(value, getCircularReplacer(), 2);
  } catch (error) {
    console.error('Error converting to viewable string:', error);
    return '[Error converting object to string]';
  }
}

export function getElement(value: number | number[], index: number): number {
  let array: number[] = [];
  if (Array.isArray(value)) {
    array = value;
  } else {
    array.push(value);
  }
  return index < array.length ? array[index] : array[array.length - 1];
}

export function getNodeCommentPosX(width: number): number {
  return width + SOCKET_WIDTH;
}

export function getNodeCommentPosY(): number {
  return NODE_PADDING_TOP + NODE_HEADER_HEIGHT + SOCKET_TEXTMARGIN_TOP - 8;
}

export function highlightText(text: string, query: string): any {
  let lastIndex = 0;
  const words = query
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map(escapeRegExpChars);
  if (words.length === 0) {
    return [text];
  }
  const regexp = new RegExp(words.join('|'), 'gi');
  const tokens: React.ReactNode[] = [];
  while (true) {
    const match = regexp.exec(text);
    if (!match) {
      break;
    }
    const length = match[0].length;
    const before = text.slice(lastIndex, regexp.lastIndex - length);
    if (before.length > 0) {
      tokens.push(before);
    }
    lastIndex = regexp.lastIndex;
    tokens.push(
      React.createElement(
        'strong',
        {
          key: lastIndex,
        },
        match[0],
      ),
    );
  }
  const rest = text.slice(lastIndex);
  if (rest.length > 0) {
    tokens.push(rest);
  }
  return tokens;
}

export function escapeRegExpChars(text: string): string {
  return text.replace(/[.*+?^=!:${}()|[\]\/\\]/g, '\\$1');
}

export const roundNumber = (number: number, decimals = 2): number =>
  Math.round(number * 10 ** decimals + Number.EPSILON) / 10 ** decimals; // rounds the number with 3 decimals

export function widthToPercentage(newWidth: number): number {
  return Math.trunc((newWidth / window.innerWidth) * 100);
}

export function percentageToWidth(percentage: number): number {
  return Math.trunc((percentage / 100) * window.innerWidth);
}

export const limitRange = (
  value: number,
  lowerLimit: number,
  upperLimit: number,
): number => {
  const min = Math.min(lowerLimit, upperLimit);
  const max = Math.max(lowerLimit, upperLimit);

  return Math.min(Math.max(min, value), max);
};

export const mapRange = (
  value: number,
  low1: number,
  high1: number,
  low2: number,
  high2: number,
  returnInt = true,
): number => {
  // special case, prevent division by 0
  if (high1 - low1 === 0) {
    return 0;
  }
  // * 1.0 added to force float division
  let newValue =
    low2 + (high2 - low2) * (((value - low1) * 1.0) / (high1 - low1));
  newValue = Math.round(newValue * 1000 + Number.EPSILON) / 1000; // rounds the number with 3 decimals
  let limitedNewValue = Math.min(Math.max(newValue, low2), high2);
  if (returnInt) {
    limitedNewValue = Math.round(limitedNewValue);
  }
  return limitedNewValue;
};

export const fetchAsBlob = (url) => {
  return fetch(url).then((response) => response.blob());
};

export const convertBlobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
};

export const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (_key: string, value: any) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  };
};

export const formatDate = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${[year, month, day].join('-')} at ${[hour, minutes, seconds].join(
    '.',
  )}`;
};

export const getDifferenceSelection = (
  firstSelection: PPNode[],
  secondSelection: PPNode[],
): PPNode[] => {
  return firstSelection
    .filter((x) => !secondSelection.includes(x))
    .concat(secondSelection.filter((x) => !firstSelection.includes(x)));
};

export const truncateText = (
  inputString: string,
  maxLength: number,
): string => {
  if (inputString.length > maxLength) {
    return inputString.substring(0, maxLength) + '...';
  }
  return inputString;
};

export const useStateRef = (initialValue?: any) => {
  const [value, setValue] = useState(initialValue);

  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return [value, setValue, ref];
};

export const getFileExtension = (fileName: string): string => {
  return fileName
    .slice(((fileName.lastIndexOf('.') - 1) >>> 0) + 2)
    .toLowerCase();
};

export const removeExtension = (fileName: string): string => {
  return fileName.replace(/\.[^/.]+$/, '');
};

export const getSetting = async (
  db: GraphDatabase,
  settingsName: string,
): Promise<string | undefined> => {
  const settingsObject = await db.settings
    .where({
      name: settingsName,
    })
    .first();
  const setting = settingsObject?.value;
  return setting;
};

export function setGestureModeOnViewport(
  viewport: Viewport,
  gestureMode: string | undefined,
) {
  viewport.wheel({
    smooth: 3,
    trackpadPinch: true,
    wheelZoom: gestureMode === GESTUREMODE.TRACKPAD ? false : true,
  });
}

export const getPropertyNames = (
  obj,
  { includePrototype = true, onlyFunctions = false } = {},
) => {
  let propertyNames = Object.getOwnPropertyNames(obj);

  if (includePrototype) {
    const proto = Object.getPrototypeOf(obj);
    propertyNames = propertyNames.concat(Object.getOwnPropertyNames(proto));
  }

  if (onlyFunctions) {
    propertyNames = propertyNames.filter(
      (name) => typeof obj[name] === 'function',
    );
  }

  // Remove duplicates and constructor
  propertyNames = [...new Set(propertyNames)].filter(
    (name) => name !== 'constructor',
  );

  return propertyNames;
};

export const writeTextToClipboard = (newClip: string): void => {
  navigator.clipboard.writeText(newClip).then(
    function () {
      /* clipboard successfully set */
    },
    function () {
      console.error('Writing to clipboard of this text failed:', newClip);
    },
  );
};

export const escapeHtml = (str: string) => {
  const element = document.createElement('div');
  element.textContent = str;
  return element.innerHTML;
};

export const unescapeHtml = (escapedStr: string) => {
  const element = document.createElement('div');
  element.innerHTML = escapedStr;
  return element.textContent;
};

export const writeNodeDataToClipboard = (stringifiedData: string): void => {
  const htmlString = `<tailrmade>${escapeHtml(stringifiedData)}</tailrmade>`;

  if (navigator.clipboard && window.ClipboardItem) {
    navigator.clipboard
      .write([
        new ClipboardItem({
          'text/plain': new Blob([stringifiedData], {
            type: 'text/plain',
          }),
          'text/html': new Blob([htmlString], { type: 'text/html' }),
        }),
      ])
      .then(
        function () {
          /* clipboard successfully set */
        },
        function () {
          console.error(
            'Writing to clipboard of this text failed:',
            stringifiedData,
          );
        },
      );
  }
};

export const writeDataToClipboard = (data: unknown, stringify = true): void => {
  writeNodeDataToClipboard(
    stringify
      ? JSON.stringify(data, getCircularReplacer(), 2)
      : (data as string),
  );
};

export const getDataFromClipboard = async (): Promise<
  Record<string, string>
> => {
  // get text from clipboard and try to parse it
  try {
    const clipboardItems = await navigator.clipboard.read();
    const clipboardBlobs = {};
    for (const clipboardItem of clipboardItems) {
      for (const type of clipboardItem.types) {
        const blob = await clipboardItem.getType(type);

        // Handle image data by converting to data URL
        if (type.startsWith('image/')) {
          clipboardBlobs[type] = await convertBlobToBase64(blob);
        } else {
          clipboardBlobs[type] = await blob.text();
        }
      }
    }
    return clipboardBlobs;
  } catch (err) {
    console.error(err.name, err.message);
    return {};
  }
};

export const getNodeDataFromHtml = (html: string): SerializedSelection => {
  const regex = /<tailrmade>([\s\S]*)<\/tailrmade>/;
  const match = regex.exec(html);
  if (!match || !match[1]) {
    throw new Error('Invalid HTML format - missing tailrmade tags or content');
  }
  const maybeJson = unescapeHtml(match[1]);
  if (typeof maybeJson !== 'string') {
    throw new Error('Failed to unescape HTML content for JSON parsing');
  }
  return JSON.parse(maybeJson) as SerializedSelection;
};

export const getNodeDataFromText = (text: string): SerializedSelection => {
  return JSON.parse(text) as SerializedSelection;
};

export const isEventComingFromWithinTextInput = (event: any): boolean => {
  try {
    const id = event.target?.id;
    const localName = event.target?.localName;
    const classList = event.target?.classList;
    const attributes = event.target?.attributes;

    const result =
      (typeof id === 'string' && id.endsWith('Input')) ||
      localName === 'textarea' ||
      (localName === 'input' &&
        (!event.target?.type ||
          [
            'text',
            'number',
            'search',
            'url',
            'tel',
            'email',
            'password',
          ].includes(event.target.type))) ||
      (classList &&
        (classList.contains('editor-input') || // texteditor2
          classList.contains('native-edit-context') || // monaco editor
          classList.contains('MuiInputBase-input') ||
          classList.contains('MuiInput-input') ||
          classList.contains('contenteditable'))) ||
      (attributes && attributes[DATA_DASHBOARD_EDITABLE] !== undefined);

    // Debug logs
    //console.log('isEventComingFromWithinTextInput: id', id);
    //console.log('isEventComingFromWithinTextInput: localName', localName);
    //console.log('isEventComingFromWithinTextInput: classList', classList);
    //console.log('isEventComingFromWithinTextInput: attributes', attributes);
    //console.log('isEventComingFromWithinTextInput: result', result);
    //console.log(
    //  'DETERMINING IF EVENT IS COMING FROM WITHIN TEXT INPUT',
    // result,
    //);

    return result;
  } catch (err) {
    console.error('Error in isEventComingFromWithinTextInput:', err);
    return false;
  }
};

export const clearDocumentSelection = (): void => {
  const selection = document.getSelection();
  if (selection && !selection.isCollapsed) {
    selection.removeAllRanges();
  }
};

export const calculateAspectRatioFit = (
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
  minWidth: number,
  minHeight: number,
): { width: number; height: number } => {
  let ratio = Math.min(newWidth / oldWidth, newHeight / oldHeight);
  const tempWidth = oldWidth * ratio;
  const tempHeight = oldHeight * ratio;
  if (tempWidth < minWidth || tempHeight < minHeight) {
    ratio = Math.max(minWidth / oldWidth, minHeight / oldHeight);
  }
  return { width: oldWidth * ratio, height: oldHeight * ratio };
};

export const replacePartOfObject = (
  originalObject: any,
  pathToReplace: string,
  value: any,
): any => {
  let objValue = value;
  const parsedJSON = parseJSON(value).value;
  if (parsedJSON) {
    objValue = parsedJSON;
  } else {
    console.log('Value is probably a primitive:', value);
  }

  // duplicate originalObject
  const obj = structuredClone(originalObject);

  let movingPointer = obj;
  const parts = pathToReplace
    .split('.')
    .map((item) => item.replace(/[\[\]']/g, '')); // remove square brackets and quotes

  let part;
  const last = parts.pop();

  // navigate to the property to be replaced
  while ((part = parts.shift())) {
    if (typeof movingPointer[part] !== 'object') movingPointer[part] = {};
    movingPointer = movingPointer[part];
  }
  // replace with value
  if (last !== undefined) {
    movingPointer[last] = objValue;
  }
  return obj;
};

export const parseJSON = (data: any, strictParsing = false): TParseType => {
  let parsedData;
  const warnings: SocketParsingWarning[] = [];
  if (typeof data === 'string' || strictParsing) {
    try {
      parsedData = JSON5.parse(data);
    } catch (error) {
      // Ignore parsing errors
    }
  }
  if (parsedData == undefined) {
    if (typeof data == 'object') {
      parsedData = data;
    } else {
      try {
        parsedData = JSON.parse(JSON.stringify(data));
      } catch (error) {
        parsedData = {};
        warnings.push(new SocketParsingWarning('Not a JSON. {} is returned'));
      }
    }
  }

  return {
    value: parsedData,
    warnings: warnings,
  };
};

/**
 * Validates HTML strings or objects and returns the original or stringified content
 * @param data - The HTML string or object to validate
 * @param strictParsing - Whether to enforce strict parsing rules
 * @returns Original or stringified HTML and any warnings generated during validation
 */
export const validateHtml = (data: any, strictParsing = false): TParseType => {
  const warnings: SocketParsingWarning[] = [];
  let resultValue = '';

  // Handle string input
  if (typeof data === 'string') {
    try {
      // Create a temporary element to test if HTML can be parsed
      const temp = document.createElement('template');
      temp.innerHTML = data;

      // If we get here, the HTML is at least parseable
      resultValue = data; // Return the original string

      // Check for potential issues
      if (data.includes('</') && !/<[a-z][\s\S]*>/i.test(data)) {
        warnings.push(
          new SocketParsingWarning('HTML may have unmatched closing tags'),
        );
      }
    } catch (error) {
      warnings.push(
        new SocketParsingWarning(`Error validating HTML: ${error}`),
      );
      resultValue = strictParsing ? '' : data;
    }
  } else if (data instanceof Document) {
    // If it's already a Document, extract its HTML content
    try {
      // For complete documents, use the full serialized HTML
      resultValue = new XMLSerializer().serializeToString(data);
    } catch (error) {
      warnings.push(
        new SocketParsingWarning(`Error serializing Document: ${error}`),
      );
      resultValue = '';
    }
  } else if (data instanceof DocumentFragment) {
    // If it's a DocumentFragment, convert to string
    try {
      const div = document.createElement('div');
      div.appendChild(data.cloneNode(true));
      resultValue = div.innerHTML;
    } catch (error) {
      warnings.push(
        new SocketParsingWarning(
          `Error serializing DocumentFragment: ${error}`,
        ),
      );
      resultValue = '';
    }
  } else if (typeof data === 'object' && data !== null) {
    try {
      // Attempt to stringify the object
      const htmlString =
        typeof data.toString === 'function'
          ? data.toString()
          : JSON.stringify(data);

      // Validate the HTML string
      const temp = document.createElement('template');
      temp.innerHTML = htmlString;

      resultValue = htmlString;
      warnings.push(
        new SocketParsingWarning(
          'Input was not HTML string. Converted object to string.',
        ),
      );
    } catch (error) {
      // Return stringified object or empty string based on strictParsing
      resultValue = strictParsing ? '' : String(data);
      warnings.push(
        new SocketParsingWarning(
          'Failed to validate object as HTML. Using string representation.',
        ),
      );
    }
  } else {
    // Default case for non-objects
    resultValue = strictParsing ? '' : String(data);
    warnings.push(
      new SocketParsingWarning(
        'Invalid input type. Using string representation.',
      ),
    );
  }

  return {
    value: resultValue,
    warnings: warnings,
  };
};

export const is2DVector = (obj) => {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'x' in obj &&
    typeof obj.x === 'number' &&
    'y' in obj &&
    typeof obj.y === 'number'
  );
};

export const parse2DVector = (data): TParseType => {
  let parsedData;
  const warnings: SocketParsingWarning[] = [];

  function parseArray(array) {
    if (array.length >= 2) {
      const [x, y] = array.map(Number);
      parsedData = { x: isNaN(x) ? 0 : x, y: isNaN(y) ? 0 : y };
    } else {
      parsedData = DEFAULT_2DVECTOR;
      warnings.push(
        new SocketParsingWarning('Not a vector. {x: 0, y: 0} is returned'),
      );
    }
  }

  function parse2Values(x, y) {
    if (isNaN(x) || isNaN(y)) {
      parsedData = DEFAULT_2DVECTOR;
      warnings.push(
        new SocketParsingWarning('Not a vector. {x: 0, y: 0} is returned'),
      );
    } else {
      parsedData = {
        x,
        y,
      };
    }
  }

  let parsedString = {};
  switch (typeof data) {
    case 'string':
      try {
        parsedString = JSON5.parse(data);
      } catch (error) {
        // Ignore parsing errors
      }
      if (is2DVector(parsedString)) {
        parsedData = parsedString;
      } else if (Array.isArray(parsedString)) {
        parseArray(parsedString);
      } else {
        const parts = data.split(',').map(Number);
        if (parts.length >= 2) {
          const [x, y] = parts;
          parse2Values(x, y);
        } else {
          parsedData = DEFAULT_2DVECTOR;
          warnings.push(
            new SocketParsingWarning('Not a vector. {x: 0, y: 0} is returned'),
          );
        }
      }
      break;
    case 'object':
      if (Array.isArray(data)) {
        parseArray(data);
      } else if (data !== null) {
        const x = Number(data.x);
        const y = Number(data.y);
        parse2Values(x, y);
      }
      break;
    // Default case to handle other data types
    default:
      parsedData = DEFAULT_2DVECTOR;
      warnings.push(
        new SocketParsingWarning('Not a vector. {x: 0, y: 0} is returned'),
      );
      break;
  }
  return {
    value: parsedData,
    warnings: warnings,
  };
};

export const is3DVector = (obj) => {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'x' in obj &&
    typeof obj.x === 'number' &&
    'y' in obj &&
    typeof obj.y === 'number' &&
    'z' in obj &&
    typeof obj.z === 'number'
  );
};

export const parse3DVector = (data): TParseType => {
  if (is3DVector(data)) {
    return { value: data, warnings: [] };
  }
  return {
    value: DEFAULT_3DVECTOR,
    warnings: [
      new SocketParsingWarning(
        'Not a 3D vector. {x: 0, y: 0, z: 0} is returned',
      ),
    ],
  };
};

export const isVariable = (
  inputA: unknown,
  chosenCondition: string,
): unknown => {
  switch (chosenCondition) {
    case CONDITION_OPTIONS[0].text:
      return typeof inputA === 'undefined' || inputA === null;
    case CONDITION_OPTIONS[1].text:
      return typeof inputA === 'undefined';
    case CONDITION_OPTIONS[2].text:
      return inputA === null;
    case CONDITION_OPTIONS[3].text:
      return typeof inputA !== 'undefined' && inputA !== null;
    case CONDITION_OPTIONS[4].text:
      return typeof inputA !== 'undefined';
    case CONDITION_OPTIONS[5].text:
      return inputA !== null;
    default:
      return false;
  }
};

export function compare(valueA: any, operator: string, valueB: any): boolean {
  switch (operator) {
    case '>':
      return valueA > valueB;
    case '>=':
      return valueA >= valueB;
    case '<':
      return valueA < valueB;
    case '<=':
      return valueA <= valueB;
    case '==':
      return valueA == valueB;
    case '!=':
      return valueA != valueB;
    case '===':
      return valueA === valueB;
    case '!==':
      return valueA !== valueB;
    case '&&':
      return !!(valueA && valueB); // Convert to boolean
    case '||':
      return !!(valueA || valueB); // Convert to boolean
    case '!':
      return !valueB; // In this case, valueA is ignored
    default:
      return false;
  }
}

export function getSocketsForConnection(
  node: PPNode,
  socket: PPSocket,
): [PPSocket, PPSocket] {
  const input =
    socket.isInput() || socket.socketType === SOCKET_TYPE.GHOST
      ? socket
      : node.getSocketForNewConnection(socket);
  const output = socket.isOutput()
    ? socket
    : node.getSocketForNewConnection(socket);
  return [input, output];
}

export async function perform_action_connectNodeToSocket(
  socket: PPSocket,
  node: PPNode,
): Promise<void> {
  if (!node) {
    return;
  }
  const [input, output] = getSocketsForConnection(node, socket);

  if (!input || !output) {
    return;
  }
  await PPGraph.currentGraph.perform_action_Connect(output, input);
}

export const indexToAlphaNumName = (num: number) => {
  let alpha = '';

  for (; num >= 0; num = parseInt(String(num / 26), 10) - 1) {
    alpha = String.fromCharCode((num % 26) + 0x41) + alpha;
  }

  return alpha;
};

// TODO this function sometimes returns 0,0 (before graph has gotten event), fix this (and function below)
export function getCurrentCursorPosition(): PIXI.Point {
  if (PPGraph.currentGraph.pointerEvent) {
    const event = PPGraph.currentGraph.pointerEvent;
    let pointerPosition: PIXI.Point = JSON.parse(
      JSON.stringify(new PIXI.Point(event.clientX, event.clientY)),
    );
    const viewport = PPGraph.currentGraph.viewport;

    pointerPosition = viewport.toWorld(pointerPosition);
    return pointerPosition;
  } else {
    console.warn(
      'Failed to get cursor event (probably not set yet), returning 0,0',
    );
    return new PIXI.Point(0, 0);
  }
}

export function getCurrentButtons(): number {
  if (
    PPGraph.currentGraph.pointerEvent &&
    typeof PPGraph.currentGraph.pointerEvent.buttons === 'number'
  ) {
    return PPGraph.currentGraph.pointerEvent.buttons;
  } else {
    console.warn(
      'Failed to get cursor event (probably not set yet), returning 0',
    );
    return 0;
  }
}

export function sortCompare(a: string, b: string, desc: boolean): number {
  // make sure that empty lines are always on the bottom
  if (a == '' || a == null) return 1;
  if (b == '' || b == null) return -1;

  if (desc) {
    [b, a] = [a, b];
  }

  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export const cutOrCopyClipboard = async (e: ClipboardEvent): Promise<void> => {
  const selection = document.getSelection();
  // If text selection is empty and event is not from a text input element,
  // prevent default and copy selected nodes instead.
  // Note: We need isEventComingFromWithinTextInput because Monaco editor (and some
  // other editors) manage selection internally and don't populate document.getSelection()
  if (
    selection &&
    selection.toString() === '' &&
    PPGraph.currentGraph.interactionEnabledHybridNode == undefined &&
    !isEventComingFromWithinTextInput(e)
  ) {
    e.preventDefault();
    const serializeSelection = PPGraph.currentGraph.serializeSelection(false);
    writeDataToClipboard(serializeSelection);
    if (e.type === 'cut') {
      await PPGraph.currentGraph.perform_action_DeleteSelectedNodes();
    }
  }
};

export const pasteClipboard = async (e: ClipboardEvent): Promise<void> => {
  console.log('pasteClipboard', e);
  const currPos = getCurrentCursorPosition();
  if (!isEventComingFromWithinTextInput(e)) {
    // First check if we have files in the clipboard data (common for images)
    if (
      e.clipboardData &&
      e.clipboardData.files &&
      e.clipboardData.files.length > 0
    ) {
      e.preventDefault();
      const files = Array.from(e.clipboardData.files);

      // Check if it's an image
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          // Convert the file to base64
          const base64 = await convertBlobToBase64(file);

          // Create an Image node with the pasted image data
          const added = await PPGraph.currentGraph.addNewNode('Image', {
            defaultArguments: {
              Image: base64,
            },
            nodePosX: currPos.x,
            nodePosY: currPos.y,
          });
          currPos.y += added.nodeHeight + 100;
          return; // Exit the entire function after handling the image
        }
      }
    }

    const clipboardBlobs = await getDataFromClipboard();

    const tryGettingDataAndAdd = async (mimeType) => {
      try {
        let data: SerializedSelection | undefined = undefined;
        // check if it is node data
        if (mimeType === 'text/html') {
          data = getNodeDataFromHtml(clipboardBlobs[mimeType]);
        } else {
          data = getNodeDataFromText(clipboardBlobs[mimeType]);
        }
        e.preventDefault();
        const upperLeft = getNodesUpperLeftCorner(data.nodes);
        await PPGraph.currentGraph.perform_action_pasteNodes(
          data,
          new PIXI.Point(currPos.x - upperLeft.x, currPos.y - upperLeft.y),
        );
        return true;
      } catch (e) {
        console.log(`No node data in ${mimeType}`, e);
      }
      try {
        const data = clipboardBlobs[mimeType];
        e.preventDefault();
        if (PPGraph.currentGraph.selection.selectedNodes.length < 1) {
          if (isUrl(data)) {
            await PPGraph.currentGraph.addNewNode('EmbedWebsite', {
              defaultArguments: {
                [htmlInputSocketName]: `<iframe src="${data}" style="width: 100%; height: 100%;"></iframe>`,
              },
              nodePosX: currPos.x,
              nodePosY: currPos.y,
            });
          } else if (isCSV(data)) {
            // TODO switch to new method that is faster
            const jsonArray = Table2.convertArrayBufferToTableInput(data);
            await PPGraph.currentGraph.addNewNode('Table2', {
              defaultArguments: {
                [tableDataInputName]: jsonArray,
              },
              nodePosX: currPos.x,
              nodePosY: currPos.y,
            });
          } else {
            const serializedState = await createMarkdownFromText(
              mimeType === 'text/html' ? { html: data } : { plain: data },
            );
            await PPGraph.currentGraph.addNewNode('TextEditor2', {
              defaultArguments: {
                [textEditorMarkdownName]: serializedState,
                [textEditorAutoHeightName]: false,
              },
              nodePosX: currPos.x,
              nodePosY: currPos.y,
            });
          }
        }
        return true;
      } catch (e) {
        console.log(`No text data in ${mimeType}`, e);
      }
    };

    let result = false;
    if (!result && clipboardBlobs['text/html']) {
      result = (await tryGettingDataAndAdd('text/html')) || false;
    }
    if (!result && clipboardBlobs['text/plain']) {
      result = (await tryGettingDataAndAdd('text/plain')) || false;
    }
  }
};

export function getLoadedValue(value, shouldLoadAll) {
  return shouldLoadAll
    ? String(value)
    : String(value)?.slice(0, MAX_STRING_LENGTH) + '...';
}

export const getExampleURL = (path: string, fileName: string): string => {
  return `${
    window.location.origin
  }/assets/examples/${path}/${encodeURIComponent(fileName)}.ppgraph`;
};

export const getLoadExampleURL = (path: string, fileName: string): string => {
  const fullPath = `${window.location.origin}${
    window.location.pathname
  }?loadURL=${getExampleURL(path, fileName)}`;
  return fullPath;
};

export const getLoadCloudGraphURL = (graph: IGraphSearch): string => {
  const encodedOwner = encodeURIComponent(graph.owner);
  const encodedName = encodeURIComponent(graph.name);
  const encodedLocation = encodeURIComponent(graph.location);
  const encodedAccess = encodeURIComponent(graph.access);

  const fullPath = `${window.location.origin}${
    window.location.pathname
  }?loadGraph=${encodedOwner};;${encodedName};;${encodedLocation};;${encodedAccess}`;
  return fullPath;
};

export const getLoadNodeExampleURL = (nodeName: string): string => {
  return getLoadExampleURL('nodes', nodeName);
};

export function isPhone(): boolean {
  const toMatch = [
    /Android/i,
    /webOS/i,
    /iPhone/i,
    /iPad/i,
    /iPod/i,
    /BlackBerry/i,
    /Windows Phone/i,
  ];

  return toMatch.some((toMatchItem) => {
    return navigator.userAgent.match(toMatchItem);
  });
}

export function controlOrMetaKey() {
  return isMac() ? '⌘' : 'Ctrl';
}

export function isMac(): boolean {
  return navigator.platform.indexOf('Mac') != -1;
}

// needs ThemeProvider context
export function useIsSmallScreen(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'));
}

export const wrapDownloadLink = (URL: string, text = '') => {
  return `<a style="color:#E154BB;text-decoration:none;" href="${URL}" target="_blank">${
    text || URL
  }</a>`;
};

interface SaveOptions {
  format?: EnumItem;
  quality?: number;
}

export const saveBase64AsImage = async (
  base64: string,
  fileName: string,
  options: SaveOptions = {},
): Promise<void> => {
  const { format = IMAGE_TYPES[0], quality = 0.8 } = options;

  const img = new Image();
  img.src = base64;

  await new Promise((resolve) => {
    img.onload = resolve;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  ctx.drawImage(img, 0, 0);
  // going the detour via canvas to allow saving in jpg, not just png
  const convertedBase64 = canvas.toDataURL(format.value, quality);

  const byteString = atob(convertedBase64.split(',')[1]);
  const mimeString = convertedBase64.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);

  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  const blob = new Blob([ab], { type: mimeString });
  const fullFileName = `${fileName} - ${formatDate()}.${format.text}`;

  downloadFile(blob, fullFileName, format.value);
};

export const downloadFile = (
  content: Blob | string | ArrayBufferLike,
  fileName: string,
  contentType: string,
): void => {
  const a = document.createElement('a');
  const file =
    content instanceof Blob
      ? content
      : new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const getObjectAtPoint = (point): PIXI.Container => {
  const boundary = new PIXI.EventBoundary(PPGraph.currentGraph.app.stage);
  const objectsUnderPoint = boundary.hitTest(point.x, point.y);
  return objectsUnderPoint;
};

export function getConfigData(selectedNodeOrGraph: PPNode | PPGraph) {
  return JSON.stringify(
    selectedNodeOrGraph?.serialize(),
    getCircularReplacer(),
    2,
  );
}

export const constructLocalResourceId = (fileName, fileSize) => {
  return `${fileName}-${fileSize}`;
};

export const getFileNameFromLocalResourceId = (localResourceId) => {
  const regex = /(.+)-\d+$/;
  return localResourceId.match(regex)[1];
};

export const getExtensionFromLocalResourceId = (localResourceId) => {
  const fileName = getFileNameFromLocalResourceId(localResourceId);
  return getFileExtension(fileName);
};

export { constructSocketId } from './elementIds';

// Node ids are arbitrary unique strings (hri.random() by default, "::"
// forbidden); parseElementId splits element ids exactly on the reserved
// separator (see elementIds.ts). Persisted trees in the old "-"-separated
// format are rewritten on load by graphMigrations.ts.
export function getLayoutableElement(id: string): Layoutable | undefined {
  const parsed = parseElementId(id);
  if (!parsed) {
    console.warn(`No corresponding element for:`, id);
    return undefined;
  }

  const node: HybridNode2 = PPGraph.currentGraph.getNodeById(
    parsed.nodeId,
  ) as HybridNode2;
  if (!node) {
    console.error(`No corresponding ${parsed.kind} for:`, id);
    return undefined;
  }

  const layoutable: Layoutable | undefined =
    parsed.kind === 'socket'
      ? node.getSocketByNameAndType(parsed.socketName, parsed.socketType)
      : node;
  return layoutable?.isLayoutable() ? layoutable : undefined;
}

export function getNodeIdFromElementId(id: string): string | undefined {
  return parseElementId(id)?.nodeId;
}

export const getGraphFromIGraphSearch = async (
  graph: IGraphSearch,
): Promise<StoredGraph | undefined> => {
  if (graph.isRemote) {
    const isPublic = graph.access === 'public';
    if (
      !isPublic &&
      !(await BackendGateway.getInstance().awaitPotentialLogin())
    ) {
      InterfaceController.showSnackBar(
        'Failed to access app, special access required and you are not signed in',
      );
      return undefined;
    }

    const DOWNLOADING_GRAPH_SPINNER_MESSAGE = 'Downloading app';
    InterfaceController.showSpinner(DOWNLOADING_GRAPH_SPINNER_MESSAGE);
    try {
      const graphData = await BackendGateway.getInstance().tryGetGraph(
        graph.owner,
        graph.name,
        graph.location,
        isPublic,
      );
      // a little ugly to override whats stored but otherwise we risk it being out of sync TODO improve the logic and remove data redundancy so that this is not needed
      graphData.name = graph.name;
      graphData.location = graph.location;
      graphData.owner = graph.owner;
      graphData.isRemote = true;
      graphData.access = graph.access;
      InterfaceController.hideSpinner(DOWNLOADING_GRAPH_SPINNER_MESSAGE);
      return graphData;
    } catch (e) {
      InterfaceController.hideSpinner(DOWNLOADING_GRAPH_SPINNER_MESSAGE);
    }
  } else {
    const storedGraph = await PPStorage.getInstance().getGraphFromDB(graph.id);
    return storedGraph;
  }
};

export const loadGraphFromIGraphSearch = async (graph: IGraphSearch) => {
  if (!checkForUnsavedChanges()) {
    return;
  }
  const [, data] = await Promise.all([
    PPGraph.currentGraph.clear(),
    getGraphFromIGraphSearch(graph),
  ]);
  if (data) {
    await PPStorage.getInstance().loadGraphFromData(data);
  } else {
    console.warn(`No graph data found for:`, graph);
    await PPStorage.getInstance().createEmptyGraph();
  }
};

export const loadGraph = async (urlParams: URLSearchParams) => {
  // Remote graph loading:
  const loadGraph = urlParams.get(URL_PARAMETER_NAME.LOADGRAPH); // Compact format: "owner;;name;;location;;access"
  const loadRemoteGraph = urlParams.get(URL_PARAMETER_NAME.LOADREMOTEGRAPH); // Full IGraphSearch JSON with metadata

  // Local graph loading:
  const loadLocalGraph = urlParams.get(URL_PARAMETER_NAME.LOADLOCALGRAPH); // Load from IndexedDB by ID

  // Graph data embedded in URL:
  const loadFullGraphFromURL = urlParams.get(URL_PARAMETER_NAME.LOADURLGRAPH); // Full serialized graph in URL parameter (REMOVED after load)

  // One-time actions:
  const createEmptyGraph = urlParams.get(URL_PARAMETER_NAME.NEW); // Create empty graph (REMOVED after load)
  const setSocketData = urlParams.get(URL_PARAMETER_NAME.SETSOCKETDATA); // Set socket data on nodes

  // Debug/settings:
  const toastEverything = urlParams.get(URL_PARAMETER_NAME.TOASTEVERYTHING); // Show all toast notifications
  InterfaceController.toastEverything = Boolean(toastEverything);
  console.log(
    `${URL_PARAMETER_NAME.LOADGRAPH}: ${loadGraph}, ${URL_PARAMETER_NAME.NEW}: ${createEmptyGraph},${URL_PARAMETER_NAME.TOASTEVERYTHING}: ${toastEverything}, ${URL_PARAMETER_NAME.LOADLOCALGRAPH}: ${loadLocalGraph}, ${URL_PARAMETER_NAME.LOADREMOTEGRAPH}: ${loadRemoteGraph}, ${URL_PARAMETER_NAME.SETSOCKETDATA}: ${setSocketData}`,
  );
  if (loadGraph) {
    await PPStorage.getInstance().loadGraphFromCloudReference(loadGraph);
  } else if (loadFullGraphFromURL) {
    await PPStorage.getInstance().loadGraphFromDataEmbeddedInURL(
      loadFullGraphFromURL,
    );
  } else if (loadLocalGraph) {
    await PPStorage.getInstance().loadGraphFromDB(loadLocalGraph);
  } else if (loadRemoteGraph) {
    await loadGraphFromIGraphSearch(
      JSON.parse(loadRemoteGraph) as IGraphSearch,
    );
  } else if (createEmptyGraph) {
    await PPStorage.getInstance().createEmptyGraph();
  } else {
    // No URL params - decide based on whether user has saved graphs
    const latestGraphId = await PPStorage.getInstance().getLatestGraphId();

    if (latestGraphId === '') {
      // New user with no saved graphs → load GET_STARTED_GRAPH
      await PPStorage.getInstance().loadGetStartedGraph();
    } else {
      // Returning user with saved graphs → createEmptyGraph
      await PPStorage.getInstance().createEmptyGraph();
    }
  }
  if (setSocketData) {
    const socketDatas = JSON.parse(setSocketData) as URLSetSocketData[];
    let foundNodes: PPNode[] = [];
    for (const socketData of socketDatas) {
      const node = PPGraph.currentGraph.getNodeById(socketData.node);
      foundNodes.push(node);
      const socket = node.getInputSocketByName(socketData.socket);
      console.log(
        'Setting data via URL, node: ' +
          node.id +
          ', socket: ' +
          socket.name +
          ', data: ' +
          JSON.stringify(socketData.data),
      );
      socket.data = socketData.data;
      const nodesThatShouldExecute = foundNodes.filter(
        (node) => node.updateBehaviour.load || node.updateBehaviour.update,
      );
      await FlowLogic.executeOptimizedChainBatch(nodesThatShouldExecute);
    }
  }
  ActionHandler.setUnsavedChange(false); // reset unsaved changes after loading a graph
};

export const sortByDate = (a, b) =>
  new Date(b.date).getTime() - new Date(a.date).getTime();

export const parseValueAndAttachWarnings = (
  nodeOrSocket: IWarningHandler,
  dataType: AbstractType,
  data: any,
): any => {
  const { value, warnings } = dataType.parse(data);
  if (warnings.length === 0) {
    nodeOrSocket.setStatus(new PNPSuccess());
  } else {
    warnings.forEach((warning) => {
      nodeOrSocket.setStatus(warning);
    });
  }
  return value;
};

export const calculateDistance = (pointA: PIXI.Point, pointB: PIXI.Point) => {
  const xDist = pointB.x - pointA.x;
  const yDist = pointB.y - pointA.y;
  return Math.sqrt(xDist * xDist + yDist * yDist);
};

export const getSuffix = (inputString, prefix) => {
  const regex = new RegExp(`^${prefix}\\s*`);
  return inputString.replace(regex, '');
};

const getNodesBoundsOfBackground = (nodes: PPNode[]): PIXI.Rectangle => {
  let bounds = new PIXI.Rectangle();
  nodes.forEach((node: PIXI.Container, index: number) => {
    const backgroundChild = node.getChildByName('background');
    if (
      backgroundChild &&
      backgroundChild.children &&
      backgroundChild.children.length > 0
    ) {
      const tempRect = (
        backgroundChild.children[0] as PIXI.Container
      ).getLocalBounds().rectangle;
      // move rect to get bounds local to nodeContainer
      tempRect.x += node.position.x;
      tempRect.y += node.position.y;
      if (index === 0) {
        bounds = tempRect;
      }
      bounds.enlarge(tempRect);
    } else {
      // Optionally handle cases where background or its children are missing
      console.warn(
        `Node ${node.name || 'Unnamed Node'} is missing background or its children for bounds calculation.`,
      );
    }
  });
  return bounds;
};

export const combineSelectedDrawNodes = async () => {
  const selectedNodes = PPGraph.currentGraph.selection.selectedNodes.filter(
    (node) => node.reactsToCombineDrawKeyBinding(),
  );
  if (selectedNodes.length > 0) {
    const boundsOfSelection = getNodesBoundsOfBackground(selectedNodes);
    const added: PPNode = await PPGraph.currentGraph.addNewNode(
      'DRAW_Combine',
      {
        nodePosX: boundsOfSelection.x + boundsOfSelection.width + 200,
        nodePosY: boundsOfSelection.y,
      },
    );

    // sort/connect by y coordinates
    selectedNodes.sort((nodeA, nodeB) => nodeA.y - nodeB.y);
    for (const node of selectedNodes) {
      await perform_action_connectNodeToSocket(
        node.getOutputSocketByName(outputPixiName),
        added,
      );
    }
    await added.executeOptimizedChain();
  }
};

// combine all selected layoutable nodes into a new UI surface node by
// connecting their ReactUI outputs to it
export const combineSelectedLayoutablesIntoSurface = async () => {
  const selectedNodes = PPGraph.currentGraph.selection.selectedNodes.filter(
    (node) =>
      node.isLayoutable() &&
      node.getOutputSocketByName(SOCKET_NAME_DASHBOARD_CONTENT),
  );
  if (selectedNodes.length > 0) {
    const boundsOfSelection = getNodesBoundsOfBackground(selectedNodes);
    const added: PPNode = await PPGraph.currentGraph.addNewNode(
      'UISurfaceNode',
      {
        nodePosX: boundsOfSelection.x + boundsOfSelection.width + 200,
        nodePosY: boundsOfSelection.y,
      },
    );
    added.deOverlap();

    // sort/connect by y coordinates
    selectedNodes.sort((nodeA, nodeB) => nodeA.y - nodeB.y);
    for (const node of selectedNodes) {
      await perform_action_connectNodeToSocket(
        node.getOutputSocketByName(SOCKET_NAME_DASHBOARD_CONTENT),
        added,
      );
    }
    await added.executeOptimizedChain();
    InterfaceController.showSurface(added.id);
  }
};

export const combineToArray = async () => {
  const selectedNodes = PPGraph.currentGraph.selection.selectedNodes;
  if (selectedNodes.length > 0) {
    const boundsOfSelection = getNodesBoundsOfBackground(selectedNodes);
    const added: PPNode = await PPGraph.currentGraph.addNewNode('ArrayCreate', {
      nodePosX: boundsOfSelection.x + boundsOfSelection.width + 200,
      nodePosY: boundsOfSelection.y,
    });

    const nodeTypes = new Set(selectedNodes.map((node) => node.type));
    if (nodeTypes.size > 1) {
      InterfaceController.showSnackBar(
        'Selected nodes are not all of the same type. This may lead to unexpected results.',
        {
          variant: 'warning',
        },
      );
    }

    // sort/connect by y coordinates
    selectedNodes.sort((nodeA, nodeB) => nodeA.y - nodeB.y);
    for (const node of selectedNodes) {
      if (node.outputSocketArray.length > 0) {
        await perform_action_connectNodeToSocket(
          node.outputSocketArray[0],
          added,
        );
      } else {
        console.warn(`${node.id} does not have an output socket`);
      }
    }
    await added.executeOptimizedChain();
  }
};

const SUPPORTED_URL_PROTOCOLS = new Set([
  'http:',
  'https:',
  'mailto:',
  'sms:',
  'tel:',
]);

export const sanitizeUrl = (url: string): string => {
  try {
    const parsedUrl = new URL(url);

    if (!SUPPORTED_URL_PROTOCOLS.has(parsedUrl.protocol)) {
      return 'about:blank';
    }
  } catch {
    return url;
  }
  return url;
};

export function formatIfNumber(num: any): string {
  if (typeof num == 'number') {
    return prettyPrintNumber(num);
  } else {
    return num;
  }
}

// generates a not unique name of a copy
export function generateCopyName(name: string): string {
  // Check for "copy N" pattern first
  const copyNumberMatch = name.match(/^(.+) copy (\d+)$/);
  if (copyNumberMatch) {
    const baseName = copyNumberMatch[1];
    const number = parseInt(copyNumberMatch[2]);
    return `${baseName} copy ${number + 1}`;
  }

  // Check for just "copy" pattern
  const copyMatch = name.match(/^(.+) copy$/);
  if (copyMatch) {
    const baseName = copyMatch[1];
    return `${baseName} copy 2`;
  }

  // Base case: add "copy"
  return `${name} copy`;
}

/**
 * Gets the value of an enum item from its text property
 * If the enum item doesn't have an explicit value, the text is returned as the value
 * @param options The enum structure containing text/value pairs
 * @param text The text to look up in the enum
 * @returns The value associated with the text, or the text itself if no explicit value is defined
 */
export function getEnumValue(options: EnumItem[], text: string): any {
  const option = options.find((opt) => opt.text === text);
  if (!option) {
    return undefined; // Return undefined if no matching option found
  }
  return option.value;
}

/**
 * Gets the text of an enum item from its value
 * @param options The enum structure containing text/value pairs
 * @param value The value to look up in the enum
 * @returns The text associated with the value, or the first option's text if no match is found
 */
export function getEnumText(options: EnumItem[], value: any): any {
  const option = options.find((opt) => opt.value === value);
  if (!option) {
    return undefined; // Return undefined if no matching option found
  }
  return option.text;
}
