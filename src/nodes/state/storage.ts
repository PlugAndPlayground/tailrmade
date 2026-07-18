import { TRgba } from '../../utils/color';
import { hri } from 'human-readable-ids';
import FlowLogic from '../../classes/FlowLogic';
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import { NodeExecutionWarning } from '../../classes/ErrorClass';
import { NodeExecutionError } from '../../classes/ErrorClass';
import Socket from '../../classes/SocketClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import InterfaceController from '../../InterfaceController';
import {
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
  TRIGGER_TYPE_OPTIONS,
} from '../../utils/constants';
import { GraphDatabase, UserDataEntry } from '../../utils/indexedDB';
import { SerializedNode } from '../../utils/interfaces';
import { convertToViewableString } from '../../utils/utils';
import { AnyType } from '../datatypes/anyType';
import { ArrayType } from '../datatypes/arrayType';
import { BooleanType } from '../datatypes/booleanType';
import { EnumType } from '../datatypes/enumType';
import { JSONType } from '../datatypes/jsonType';
import { StringType } from '../datatypes/stringType';
import { TriggerType } from '../datatypes/triggerType';
import { CLOUD_MODE } from '../../services/shared-types';
import { BackendGateway } from '../../services/BackendGateway';

const LOCATION_NAME = 'Location';
export const STORAGE_BACKEND_NAME = 'Storage type';
export const KEY_NAME = 'Key';
export const VALUE_NAME = 'Value';
const NON_EMPTY_ONLY_NAME = 'Non-empty only';
const INSERT_ONLY_NAME = 'Insert only';
export const FALLBACK_VALUE_NAME = 'Fallback value';
const SUCCESS_NAME = 'Success';
const ERROR_NAME = 'Error';
export const INPUT_SOCKET_NAME = 'Input Socket';
const FILTER_BY_LOCATION_NAME = 'Filter by Location';
const DEFAULT_LOCATION = 'Default';
const OUTPUT_OBJECT_NAMES_NAME = 'Objects';
const SHOW_TOAST_NOTIFICATION_NAME = 'Show Toast Notification';
const STORAGE_WRITE_SKIPPED_VALUE_EMPTY = 'Write skipped: value is empty';
const STORAGE_WRITE_SKIPPED_KEY_EXISTS = 'Write skipped: key already exists';
const STORAGE_DELETE_KEY_NOT_FOUND = 'Key not found in storage';
export const STORAGE_BACKEND_INDEXED_DB = 'IndexedDB';
const STORAGE_BACKEND_LOCAL_STORAGE = 'Local storage';
export const STORAGE_BACKEND_CLOUD = 'Cloud';
const STORAGE_BACKEND_OPTIONS = [
  { text: STORAGE_BACKEND_CLOUD, disabled: !CLOUD_MODE },
  { text: STORAGE_BACKEND_INDEXED_DB },
  { text: STORAGE_BACKEND_LOCAL_STORAGE },
];
const LEGACY_LOCAL_STORAGE_KEY_NAME = 'Local Storage Key';
const LEGACY_OBJECT_KEY_NAME = 'Object Key';
const LEGACY_SELECTED_NAME = 'Selected';
const LEGACY_FALLBACK_VALUE_NAME = 'Fallback Value';

export interface URLSetSocketData {
  node: string;
  socket: string;
  data: any;
}

interface StorageSocketOptions {
  includeStorageBackend?: boolean;
  defaultLocation?: string;
  extraInputs?: Socket[];
}

type StorageActionSocketOptions = StorageSocketOptions;

function getStorageSocketPrefix(options: StorageSocketOptions = {}): Socket[] {
  const sockets: Socket[] = [];
  if (options.includeStorageBackend) {
    sockets.push(getStorageBackendInputSocket());
  }

  return sockets.concat([
    getLocationInputSocket(options.defaultLocation ?? DEFAULT_LOCATION),
    getKeyInputSocket(),
  ]);
}

abstract class AbstractStorageNode extends PPNode {
  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.name === VALUE_NAME || socket.name === FALLBACK_VALUE_NAME;
  }

  protected getStorageActionUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 1000, this);
  }

  protected setStorageExecutionError(
    output: Record<string, any>,
    error: unknown,
    messagePrefix: string,
  ): void {
    const errorMessage = getStorageErrorMessage(error);
    output[ERROR_NAME] = errorMessage;
    this.setStatus(new NodeExecutionError(`${messagePrefix}: ${errorMessage}`));
  }

  protected setStorageReadError(
    output: Record<string, any>,
    error: unknown,
    messagePrefix: string,
    fallbackValue: any,
  ): void {
    output[VALUE_NAME] = fallbackValue;
    this.setStorageExecutionError(output, error, messagePrefix);
  }

  protected setStorageCollectionError(
    output: Record<string, any>,
    error: unknown,
    messagePrefix: string,
    outputName: string,
    emptyValue: any,
  ): void {
    output[outputName] = emptyValue;
    this.setStorageExecutionError(output, error, messagePrefix);
  }
}

function isStorageValueEmpty(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'object' && Object.keys(value).length === 0) return true;
  return false;
}

function getConditionalBrowseLocationSocket(node: PPNode): Socket {
  return Socket.getOptionalVisibilitySocket(
    SOCKET_TYPE.IN,
    LOCATION_NAME,
    new StringType(),
    DEFAULT_LOCATION,
    () => node.getInputData(FILTER_BY_LOCATION_NAME),
  );
}

function getLocationInputSocket(defaultValue = DEFAULT_LOCATION): Socket {
  return new Socket(
    SOCKET_TYPE.IN,
    LOCATION_NAME,
    new StringType(),
    defaultValue,
  );
}

function getStorageBackendInputSocket(
  defaultValue = STORAGE_BACKEND_INDEXED_DB,
): Socket {
  return new Socket(
    SOCKET_TYPE.IN,
    STORAGE_BACKEND_NAME,
    new EnumType(STORAGE_BACKEND_OPTIONS, undefined, true),
    defaultValue,
    false,
  );
}

function getKeyInputSocket(defaultValue = 'Key'): Socket {
  return new Socket(SOCKET_TYPE.IN, KEY_NAME, new StringType(), defaultValue);
}

function getStorageWriteSockets(
  valueSocket: Socket,
  options: StorageActionSocketOptions = {},
): Socket[] {
  return getStorageSocketPrefix(options).concat([
    valueSocket,
    getNonEmptyOnlyInputSocket(),
    getInsertOnlyInputSocket(),
    ...(options.extraInputs ?? []),
    getExecuteTriggerSocket(),
    getSuccessOutputSocket(),
    getErrorOutputSocket(),
  ]);
}

function getStorageReadSockets(
  valueSocket: Socket,
  options: StorageSocketOptions = {},
): Socket[] {
  return getStorageSocketPrefix(options).concat([
    getFallbackValueInputSocket(),
    ...(options.extraInputs ?? []),
    valueSocket,
    getErrorOutputSocket(),
  ]);
}

function getStorageDeleteSockets(
  options: StorageActionSocketOptions = {},
): Socket[] {
  return getStorageSocketPrefix(options).concat([
    ...(options.extraInputs ?? []),
    getExecuteTriggerSocket(),
    getSuccessOutputSocket(),
    getErrorOutputSocket(),
  ]);
}

function getStorageBrowseSockets(
  node: PPNode,
  outputSocket: Socket,
  options: StorageSocketOptions = {},
): Socket[] {
  const sockets: Socket[] = [];
  if (options.includeStorageBackend) {
    sockets.push(getStorageBackendInputSocket());
  }

  return sockets.concat([
    new Socket(
      SOCKET_TYPE.IN,
      FILTER_BY_LOCATION_NAME,
      new BooleanType(),
      false,
      false,
    ),
    getConditionalBrowseLocationSocket(node),
    ...(options.extraInputs ?? []),
    outputSocket,
    getErrorOutputSocket(),
  ]);
}

function getFallbackValueInputSocket(): Socket {
  return new Socket(SOCKET_TYPE.IN, FALLBACK_VALUE_NAME, new AnyType());
}

function getShowToastNotificationInputSocket(defaultValue = false): Socket {
  return new Socket(
    SOCKET_TYPE.IN,
    SHOW_TOAST_NOTIFICATION_NAME,
    new BooleanType(),
    defaultValue,
    false,
  );
}

function getNonEmptyOnlyInputSocket(): Socket {
  return new Socket(
    SOCKET_TYPE.IN,
    NON_EMPTY_ONLY_NAME,
    new BooleanType(),
    true,
    false,
  );
}

function getInsertOnlyInputSocket(): Socket {
  return new Socket(
    SOCKET_TYPE.IN,
    INSERT_ONLY_NAME,
    new BooleanType(),
    false,
    false,
  );
}

export function getExecuteTriggerSocket(): Socket {
  return new Socket(
    SOCKET_TYPE.TRIGGER,
    'Execute',
    new TriggerType(TRIGGER_TYPE_OPTIONS[0].text),
  );
}

function getSuccessOutputSocket(): Socket {
  return new Socket(SOCKET_TYPE.OUT, SUCCESS_NAME, new BooleanType());
}

function getErrorOutputSocket(defaultValue = ''): Socket {
  return new Socket(
    SOCKET_TYPE.OUT,
    ERROR_NAME,
    new StringType(),
    defaultValue,
  );
}

function initStorageSuccessAndError(output: Record<string, any>): void {
  output[SUCCESS_NAME] = false;
  output[ERROR_NAME] = '';
}

function initStorageError(output: Record<string, any>): void {
  output[ERROR_NAME] = '';
}

function getStorageErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getStorageBackend(input: Record<string, any>): string {
  if (input[STORAGE_BACKEND_NAME] === STORAGE_BACKEND_LOCAL_STORAGE) {
    return STORAGE_BACKEND_LOCAL_STORAGE;
  }
  if (CLOUD_MODE && input[STORAGE_BACKEND_NAME] === STORAGE_BACKEND_CLOUD) {
    return STORAGE_BACKEND_CLOUD;
  }
  return STORAGE_BACKEND_INDEXED_DB;
}

function setStorageWriteSkippedWarning(
  node: PPNode,
  output: Record<string, any>,
  message: string,
): void {
  output[ERROR_NAME] = message;
  node.setStatus(new NodeExecutionWarning(message));
}

const LOCAL_STORAGE_PREFIX = 'TM.';

let dbInstance: GraphDatabase | undefined;

function getDb(): GraphDatabase {
  if (!dbInstance) {
    dbInstance = new GraphDatabase();
  }
  return dbInstance;
}

function makeId(location: string, key: string): string {
  return `${location}::${key}`;
}

function getLocalStorageLocationKey(location: string): string {
  return LOCAL_STORAGE_PREFIX + location;
}

function objectKeysToEnum(object: Record<string, any>) {
  return Object.keys(object).map((key) => ({
    text: key,
    value: key,
  }));
}

function parseLocalStorageObject(storedValue: string): Record<string, any> {
  const parsed = JSON.parse(storedValue);
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    return parsed;
  }

  throw new Error('Stored local storage value is not an object');
}

function readLocalStorageObject(
  location: string,
): Record<string, any> | undefined {
  const storedValue = localStorage.getItem(
    getLocalStorageLocationKey(location),
  );
  if (storedValue === null) {
    return undefined;
  }

  return parseLocalStorageObject(storedValue);
}

function writeLocalStorageObject(
  location: string,
  data: Record<string, any>,
): void {
  localStorage.setItem(
    getLocalStorageLocationKey(location),
    JSON.stringify(data),
  );
}

function describeStorageBackend(storageBackend: string): string {
  if (storageBackend === STORAGE_BACKEND_LOCAL_STORAGE) {
    return 'local storage';
  }
  if (storageBackend === STORAGE_BACKEND_CLOUD) {
    return 'cloud storage';
  }
  return 'IndexedDB';
}

function maybeShowToast(input: Record<string, any>, message: string): void {
  if (input[SHOW_TOAST_NOTIFICATION_NAME]) {
    InterfaceController.showSnackBar(message);
  }
}

function areValuesEqual(previousValue: any, nextValue: any): boolean {
  if (previousValue === nextValue) {
    return true;
  }

  if (
    previousValue === null ||
    previousValue === undefined ||
    nextValue === null ||
    nextValue === undefined
  ) {
    return false;
  }

  return (
    convertToViewableString(previousValue) ===
    convertToViewableString(nextValue)
  );
}

export function hasValueChanged(
  hadPreviousValue: boolean,
  previousValue: any,
  hasNextValue: boolean,
  nextValue: any,
): boolean {
  if (hadPreviousValue !== hasNextValue) {
    return true;
  }

  if (!hadPreviousValue) {
    return false;
  }

  return !areValuesEqual(previousValue, nextValue);
}

async function notifyStorageReadNodes(
  storageBackend: string,
  location: string,
  key: string,
): Promise<void> {
  const graph = PPGraph.currentGraph;
  if (!graph.nodes) {
    return;
  }

  const nodesToExecute = Object.values(graph.nodes).filter((node) =>
    node.shouldExecuteOnStorageValueChanged(storageBackend, location, key),
  );

  await FlowLogic.executeOptimizedChainBatch(nodesToExecute);
}

async function readStorageValue(
  storageBackend: string,
  location: string,
  key: string,
): Promise<any | undefined> {
  if (storageBackend === STORAGE_BACKEND_LOCAL_STORAGE) {
    const storedObject = readLocalStorageObject(location);
    if (storedObject === undefined || !(key in storedObject)) {
      return undefined;
    }
    return storedObject[key];
  }

  if (storageBackend === STORAGE_BACKEND_CLOUD) {
    return BackendGateway.getInstance().getObject(key, location);
  }

  const entry = await getDb().user_data.get(makeId(location, key));
  return entry?.value;
}

async function readStorageLocation(
  storageBackend: string,
  location: string,
): Promise<Record<string, any> | undefined> {
  if (storageBackend === STORAGE_BACKEND_LOCAL_STORAGE) {
    return readLocalStorageObject(location);
  }

  if (storageBackend === STORAGE_BACKEND_CLOUD) {
    const handler = BackendGateway.getInstance();
    const metadata = (await handler.listObjectsMetadata()).objects.filter(
      (object) => object.location === location,
    );
    if (metadata.length === 0) {
      return undefined;
    }

    const entries = await Promise.all(
      metadata.map(async (object) => ({
        key: object.objectId,
        value: await handler.getObject(object.objectId, object.location),
      })),
    );
    const result: Record<string, any> = {};
    for (const entry of entries) {
      if (entry.value !== undefined) {
        result[entry.key] = entry.value;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  const entries = await getDb()
    .user_data.where('location')
    .equals(location)
    .toArray();
  if (entries.length === 0) {
    return undefined;
  }

  const result: Record<string, any> = {};
  for (const entry of entries) {
    result[entry.key] = entry.value;
  }
  return result;
}

async function browseStorageObjects(
  storageBackend: string,
  location?: string,
): Promise<any[]> {
  if (storageBackend === STORAGE_BACKEND_LOCAL_STORAGE) {
    if (location) {
      const storedObject = readLocalStorageObject(location);
      if (storedObject === undefined) {
        return [];
      }

      return Object.keys(storedObject).map((key) => ({ key, location }));
    }

    const keys: Array<{ location: string; key: string }> = [];
    for (let index = 0; index < localStorage.length; index++) {
      const localStorageKey = localStorage.key(index);
      if (
        !localStorageKey ||
        !localStorageKey.startsWith(LOCAL_STORAGE_PREFIX)
      ) {
        continue;
      }

      const currentLocation = localStorageKey.substring(
        LOCAL_STORAGE_PREFIX.length,
      );
      const storedObject = readLocalStorageObject(currentLocation);
      if (storedObject === undefined) {
        continue;
      }

      keys.push(
        ...Object.keys(storedObject).map((key) => ({
          key,
          location: currentLocation,
        })),
      );
    }

    return keys;
  }

  if (storageBackend === STORAGE_BACKEND_CLOUD) {
    const objects = (await BackendGateway.getInstance().listObjectsMetadata())
      .objects;
    if (!location) {
      return objects;
    }
    return objects.filter((object) => object.location === location);
  }

  const entries = location
    ? await getDb().user_data.where('location').equals(location).toArray()
    : await getDb().user_data.toArray();

  return entries.map((entry) => ({
    location: entry.location,
    key: entry.key,
    updatedAt: entry.updatedAt,
  }));
}

abstract class StorageNode extends AbstractStorageNode {
  public getTags(): string[] {
    return ['Storage', 'Browser', 'Cloud'].concat(super.getTags());
  }

  protected getConfiguredStorageBackend(): string {
    return getStorageBackend({
      [STORAGE_BACKEND_NAME]: this.getInputData(STORAGE_BACKEND_NAME),
    });
  }
}

abstract class StorageMutation extends StorageNode {
  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.OUTPUT);
  }

  public isDependentOnUserData(): boolean {
    return false;
  }

  public getUpdateBehaviour() {
    return this.getStorageActionUpdateBehaviour();
  }

  protected completeMutation(
    input: Record<string, any>,
    output: Record<string, any>,
    toastMessage?: string,
  ): void {
    if (getStorageBackend(input) === STORAGE_BACKEND_CLOUD) {
      void PPGraph.getCurrentGraph().notifyUserDataChanged(false);
    }
    output[SUCCESS_NAME] = true;
    if (toastMessage) {
      maybeShowToast(input, toastMessage);
    }
  }
}

abstract class StorageReader extends StorageNode {
  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  public isDependentOnUserData(): boolean {
    return this.getConfiguredStorageBackend() === STORAGE_BACKEND_CLOUD;
  }
}

export class StorageWrite extends StorageMutation {
  public getName() {
    return 'Storage Write';
  }

  public getDescription() {
    return 'Writes a value by location and key to local storage, IndexedDB, or cloud storage';
  }

  protected getDefaultIO(): Socket[] {
    return getStorageWriteSockets(
      new Socket(SOCKET_TYPE.IN, VALUE_NAME, new AnyType()),
      {
        includeStorageBackend: true,
        defaultLocation: DEFAULT_LOCATION,
        extraInputs: [getShowToastNotificationInputSocket()],
      },
    );
  }

  protected async onExecute(
    input: Record<string, any>,
    output: Record<string, any>,
  ) {
    initStorageSuccessAndError(output);
    try {
      const storageBackend = getStorageBackend(input);
      const location: string = input[LOCATION_NAME];
      const key: string = input[KEY_NAME];
      const value = input[VALUE_NAME];
      const nonEmptyOnly = input[NON_EMPTY_ONLY_NAME];
      const insertOnly = input[INSERT_ONLY_NAME];
      const nextValue = structuredClone(value);

      if (nonEmptyOnly && isStorageValueEmpty(value)) {
        setStorageWriteSkippedWarning(
          this,
          output,
          STORAGE_WRITE_SKIPPED_VALUE_EMPTY,
        );
        return;
      }

      if (storageBackend === STORAGE_BACKEND_LOCAL_STORAGE) {
        const localStorageObject = readLocalStorageObject(location) ?? {};
        const hadPreviousValue = key in localStorageObject;
        const previousValue = hadPreviousValue
          ? structuredClone(localStorageObject[key])
          : undefined;

        if (insertOnly && key in localStorageObject) {
          setStorageWriteSkippedWarning(
            this,
            output,
            STORAGE_WRITE_SKIPPED_KEY_EXISTS,
          );
          return;
        }

        localStorageObject[key] = nextValue;
        writeLocalStorageObject(location, localStorageObject);
        await this.completeMutation(
          input,
          output,
          `Wrote "${key}" to ${describeStorageBackend(storageBackend)}`,
        );
        if (hasValueChanged(hadPreviousValue, previousValue, true, nextValue)) {
          await notifyStorageReadNodes(storageBackend, location, key);
        }
        return;
      }

      if (storageBackend === STORAGE_BACKEND_CLOUD) {
        const handler = BackendGateway.getInstance();
        const previousValue = await handler.getObject(key, location);
        const hadPreviousValue = previousValue !== undefined;
        if (insertOnly) {
          if (hadPreviousValue) {
            setStorageWriteSkippedWarning(
              this,
              output,
              STORAGE_WRITE_SKIPPED_KEY_EXISTS,
            );
            return;
          }
        }

        await handler.storeObject(value, location, key);
        await this.completeMutation(
          input,
          output,
          `Wrote "${key}" to ${describeStorageBackend(storageBackend)}`,
        );
        if (hasValueChanged(hadPreviousValue, previousValue, true, nextValue)) {
          await notifyStorageReadNodes(storageBackend, location, key);
        }
        return;
      }

      const id = makeId(location, key);
      const db = getDb();
      const existing = await db.user_data.get(id);
      const hadPreviousValue = existing !== undefined;
      const previousValue = hadPreviousValue
        ? structuredClone(existing.value)
        : undefined;

      if (insertOnly) {
        if (hadPreviousValue) {
          setStorageWriteSkippedWarning(
            this,
            output,
            STORAGE_WRITE_SKIPPED_KEY_EXISTS,
          );
          return;
        }
      }

      await db.user_data.put({
        id,
        location,
        key,
        value: nextValue,
        updatedAt: new Date(),
      } satisfies UserDataEntry);
      await this.completeMutation(
        input,
        output,
        `Wrote "${key}" to ${describeStorageBackend(storageBackend)}`,
      );
      if (hasValueChanged(hadPreviousValue, previousValue, true, nextValue)) {
        await notifyStorageReadNodes(storageBackend, location, key);
      }
    } catch (err) {
      this.setStorageExecutionError(output, err, 'Failed to write to storage');
    }
  }
}

export class StorageRead extends StorageReader {
  public getName() {
    return 'Storage Read';
  }

  public shouldExecuteOnStorageValueChanged(
    storageBackend: string,
    location: string,
    key: string,
  ): boolean {
    if (!this.updateBehaviour.update) {
      return false;
    }

    const nodeStorageBackend = getStorageBackend({
      [STORAGE_BACKEND_NAME]: this.getInputData(STORAGE_BACKEND_NAME),
    });
    if (nodeStorageBackend !== storageBackend) {
      return false;
    }

    if (this.getInputData(LOCATION_NAME) !== location) {
      return false;
    }

    const nodeKey = this.getInputData(KEY_NAME);
    return !nodeKey || nodeKey === key;
  }

  public isDependentOnUserData(): boolean {
    return false;
  }

  public getDescription() {
    return 'Reads a value by location and key from local storage, IndexedDB, or cloud storage';
  }

  protected getDefaultIO(): Socket[] {
    return getStorageReadSockets(
      new Socket(SOCKET_TYPE.OUT, VALUE_NAME, new AnyType()),
      {
        includeStorageBackend: true,
        defaultLocation: DEFAULT_LOCATION,
        extraInputs: [getShowToastNotificationInputSocket()],
      },
    );
  }

  protected async onExecute(
    input: Record<string, any>,
    output: Record<string, any>,
  ) {
    initStorageError(output);
    try {
      const storageBackend = getStorageBackend(input);
      const location = input[LOCATION_NAME];
      const key = input[KEY_NAME];

      if (!key) {
        const result = await readStorageLocation(storageBackend, location);
        output[VALUE_NAME] =
          result === undefined ? input[FALLBACK_VALUE_NAME] : result;
        if (result !== undefined) {
          maybeShowToast(
            input,
            `Read location "${location}" from ${describeStorageBackend(storageBackend)}`,
          );
        }
        return;
      }

      const value = await readStorageValue(storageBackend, location, key);
      output[VALUE_NAME] =
        value !== undefined ? value : input[FALLBACK_VALUE_NAME];
      if (value !== undefined) {
        maybeShowToast(
          input,
          `Read "${key}" from ${describeStorageBackend(storageBackend)}`,
        );
      }
    } catch (err) {
      this.setStorageReadError(
        output,
        err,
        'Failed to read from storage',
        input[FALLBACK_VALUE_NAME],
      );
    }
  }
}

export class StorageDelete extends StorageMutation {
  public getName() {
    return 'Storage Delete';
  }

  public getDescription() {
    return 'Deletes a value by location and key from local storage, IndexedDB, or cloud storage';
  }

  protected getDefaultIO(): Socket[] {
    return getStorageDeleteSockets({
      includeStorageBackend: true,
      defaultLocation: DEFAULT_LOCATION,
      extraInputs: [getShowToastNotificationInputSocket()],
    });
  }

  protected async onExecute(
    input: Record<string, any>,
    output: Record<string, any>,
  ) {
    initStorageSuccessAndError(output);
    try {
      const storageBackend = getStorageBackend(input);
      const location = input[LOCATION_NAME];
      const key = input[KEY_NAME];

      if (storageBackend === STORAGE_BACKEND_LOCAL_STORAGE) {
        const localStorageObject = readLocalStorageObject(location);
        if (localStorageObject === undefined || !(key in localStorageObject)) {
          output[ERROR_NAME] = STORAGE_DELETE_KEY_NOT_FOUND;
          this.setStatus(
            new NodeExecutionWarning(STORAGE_DELETE_KEY_NOT_FOUND),
          );
          return;
        }

        const previousValue = structuredClone(localStorageObject[key]);
        delete localStorageObject[key];
        writeLocalStorageObject(location, localStorageObject);
        await this.completeMutation(
          input,
          output,
          `Deleted "${key}" from ${describeStorageBackend(storageBackend)}`,
        );
        if (hasValueChanged(true, previousValue, false, undefined)) {
          await notifyStorageReadNodes(storageBackend, location, key);
        }
        return;
      }

      if (storageBackend === STORAGE_BACKEND_CLOUD) {
        const previousValue = await BackendGateway.getInstance().getObject(
          key,
          location,
        );
        await BackendGateway.getInstance().deleteObject(key, location);
        await this.completeMutation(
          input,
          output,
          `Deleted "${key}" from ${describeStorageBackend(storageBackend)}`,
        );
        if (hasValueChanged(true, previousValue, false, undefined)) {
          await notifyStorageReadNodes(storageBackend, location, key);
        }
        return;
      }

      const db = getDb();
      const id = makeId(location, key);
      const existing = await db.user_data.get(id);
      if (existing === undefined) {
        output[ERROR_NAME] = STORAGE_DELETE_KEY_NOT_FOUND;
        this.setStatus(new NodeExecutionWarning(STORAGE_DELETE_KEY_NOT_FOUND));
        return;
      }
      await db.user_data.delete(id);
      await this.completeMutation(
        input,
        output,
        `Deleted "${key}" from ${describeStorageBackend(storageBackend)}`,
      );
      if (hasValueChanged(true, existing.value, false, undefined)) {
        await notifyStorageReadNodes(storageBackend, location, key);
      }
    } catch (err) {
      this.setStorageExecutionError(
        output,
        err,
        'Failed to delete from storage',
      );
    }
  }
}

export class StorageBrowse extends StorageReader {
  public getName() {
    return 'Browse Storage';
  }

  public getDescription() {
    return 'Lists objects in local storage, IndexedDB, or cloud storage, optionally filtered by location';
  }

  protected getDefaultIO(): Socket[] {
    return getStorageBrowseSockets(
      this,
      new Socket(SOCKET_TYPE.OUT, OUTPUT_OBJECT_NAMES_NAME, new ArrayType()),
      {
        includeStorageBackend: true,
        extraInputs: [getShowToastNotificationInputSocket()],
      },
    );
  }

  protected async onExecute(input, output) {
    initStorageError(output);
    try {
      const storageBackend = getStorageBackend(input);
      const objects = await browseStorageObjects(
        storageBackend,
        input[FILTER_BY_LOCATION_NAME] ? input[LOCATION_NAME] : undefined,
      );
      output[OUTPUT_OBJECT_NAMES_NAME] = objects;
      maybeShowToast(
        input,
        `Browsed ${objects.length} object${objects.length === 1 ? '' : 's'} from ${describeStorageBackend(storageBackend)}`,
      );
    } catch (err) {
      this.setStorageCollectionError(
        output,
        err,
        'Failed to browse storage',
        OUTPUT_OBJECT_NAMES_NAME,
        [],
      );
    }
  }
}

abstract class LegacyStorageScaffold extends AbstractStorageNode {
  protected setInputSocketValue(
    node: PPNode,
    socketName: string,
    value: any,
  ): void {
    const socket = node.getInputSocketByName(socketName);

    if (!socket) {
      return;
    }

    socket.data = value;
    socket.defaultData = value;
  }

  protected async renameInputSocket(
    oldName: string,
    newName: string,
    dataType: AnyType | BooleanType | EnumType | JSONType | StringType,
  ): Promise<void> {
    const oldSocket = this.getInputSocketByName(oldName);

    if (!oldSocket || this.getInputSocketByName(newName)) {
      return;
    }

    await this.replaceSocketWithOtherSocket(
      oldSocket,
      new Socket(SOCKET_TYPE.IN, newName, dataType, oldSocket.data),
    );
  }

  protected async migrateToStorageNode(
    targetType: string,
    storageBackend: string,
    configureReplacement?: (replacementNode: PPNode) => void,
  ): Promise<void> {
    const previousNodeId = this.id;
    const replacementId = hri.random();
    const serializedNode = this.serialize();
    const migratedSerializedNode: SerializedNode = {
      ...serializedNode,
      type: targetType,
    };
    const replacementNode = await PPGraph.currentGraph.replaceNode(
      serializedNode,
      previousNodeId,
      replacementId,
      undefined,
      migratedSerializedNode,
    );

    delete PPGraph.currentGraph.nodes[replacementId];
    replacementNode.id = previousNodeId;
    PPGraph.currentGraph.nodes[previousNodeId] = replacementNode;

    this.setInputSocketValue(
      replacementNode,
      STORAGE_BACKEND_NAME,
      storageBackend,
    );
    configureReplacement?.(replacementNode);
  }
}

abstract class LocalStorageScaffold extends LegacyStorageScaffold {
  public getVersion(): number {
    return 2;
  }

  public showInNodeSearch(): boolean {
    return false;
  }

  public getTags(): string[] {
    return ['LocalStorage', 'Storage', 'Legacy'].concat(super.getTags());
  }
}

abstract class UserStorageScaffold extends LegacyStorageScaffold {
  public getVersion(): number {
    return 2;
  }

  public showInNodeSearch(): boolean {
    return false;
  }

  public getTags(): string[] {
    return ['Storage', 'Cloud', 'Legacy'].concat(super.getTags());
  }
}

export class LocalStorageWrite extends LocalStorageScaffold {
  public getName() {
    return 'Local Storage Write (Deprecated)';
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion >= this.getVersion()) {
      return;
    }

    await this.renameInputSocket(
      LEGACY_LOCAL_STORAGE_KEY_NAME,
      LOCATION_NAME,
      new StringType(),
    );
    await this.renameInputSocket(
      LEGACY_OBJECT_KEY_NAME,
      KEY_NAME,
      new StringType(),
    );
    await this.migrateToStorageNode(
      'StorageWrite',
      STORAGE_BACKEND_LOCAL_STORAGE,
      (replacementNode) => {
        this.setInputSocketValue(replacementNode, NON_EMPTY_ONLY_NAME, false);
        this.setInputSocketValue(replacementNode, INSERT_ONLY_NAME, false);
        this.setInputSocketValue(
          replacementNode,
          SHOW_TOAST_NOTIFICATION_NAME,
          false,
        );
      },
    );
  }
}

export class LocalStorageDelete extends LocalStorageScaffold {
  public getName() {
    return 'Local Storage Delete (Deprecated)';
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion >= this.getVersion()) {
      return;
    }

    await this.renameInputSocket(
      LEGACY_LOCAL_STORAGE_KEY_NAME,
      LOCATION_NAME,
      new StringType(),
    );
    await this.renameInputSocket(
      LEGACY_OBJECT_KEY_NAME,
      KEY_NAME,
      new StringType(),
    );
    await this.migrateToStorageNode(
      'StorageDelete',
      STORAGE_BACKEND_LOCAL_STORAGE,
      (replacementNode) => {
        this.setInputSocketValue(
          replacementNode,
          SHOW_TOAST_NOTIFICATION_NAME,
          false,
        );
      },
    );
  }
}

export class LocalStorageBrowse extends LocalStorageScaffold {
  public getName() {
    return 'Browse Object in Local Storage (Deprecated)';
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion >= this.getVersion()) {
      return;
    }

    await this.renameInputSocket(
      LEGACY_LOCAL_STORAGE_KEY_NAME,
      LOCATION_NAME,
      new StringType(),
    );
    await this.renameInputSocket(
      LEGACY_SELECTED_NAME,
      KEY_NAME,
      new StringType(),
    );
    await this.renameInputSocket(
      LEGACY_FALLBACK_VALUE_NAME,
      FALLBACK_VALUE_NAME,
      new AnyType(),
    );
    await this.migrateToStorageNode(
      'StorageRead',
      STORAGE_BACKEND_LOCAL_STORAGE,
      (replacementNode) => {
        this.setInputSocketValue(
          replacementNode,
          SHOW_TOAST_NOTIFICATION_NAME,
          false,
        );
      },
    );
  }
}

export class UserStorageWrite extends UserStorageScaffold {
  public getName() {
    return 'User Storage Write (Deprecated)';
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion >= this.getVersion()) {
      return;
    }

    const showToastNotification = this.getInputData(
      SHOW_TOAST_NOTIFICATION_NAME,
    );
    await this.migrateToStorageNode(
      'StorageWrite',
      STORAGE_BACKEND_CLOUD,
      (replacementNode) => {
        this.setInputSocketValue(replacementNode, NON_EMPTY_ONLY_NAME, false);
        this.setInputSocketValue(replacementNode, INSERT_ONLY_NAME, false);
        this.setInputSocketValue(
          replacementNode,
          SHOW_TOAST_NOTIFICATION_NAME,
          showToastNotification,
        );
      },
    );
  }
}

export class UserStorageRead extends UserStorageScaffold {
  public getName() {
    return 'User Storage Read (Deprecated)';
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion >= this.getVersion()) {
      return;
    }

    await this.migrateToStorageNode(
      'StorageRead',
      STORAGE_BACKEND_CLOUD,
      (replacementNode) => {
        this.setInputSocketValue(
          replacementNode,
          SHOW_TOAST_NOTIFICATION_NAME,
          false,
        );
      },
    );
  }
}

export class UserStorageDelete extends UserStorageScaffold {
  public getName() {
    return 'User Storage Delete (Deprecated)';
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion >= this.getVersion()) {
      return;
    }

    const showToastNotification = this.getInputData(
      SHOW_TOAST_NOTIFICATION_NAME,
    );
    await this.migrateToStorageNode(
      'StorageDelete',
      STORAGE_BACKEND_CLOUD,
      (replacementNode) => {
        this.setInputSocketValue(
          replacementNode,
          SHOW_TOAST_NOTIFICATION_NAME,
          showToastNotification,
        );
      },
    );
  }
}

export class UserStorageBrowse extends UserStorageScaffold {
  public getName() {
    return 'Browse User Storage (Deprecated)';
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion >= this.getVersion()) {
      return;
    }

    const filterByLocation = this.getInputData(FILTER_BY_LOCATION_NAME);
    const location = this.getInputData(LOCATION_NAME);
    await this.migrateToStorageNode(
      'StorageBrowse',
      STORAGE_BACKEND_CLOUD,
      (replacementNode) => {
        this.setInputSocketValue(
          replacementNode,
          FILTER_BY_LOCATION_NAME,
          filterByLocation,
        );
        this.setInputSocketValue(replacementNode, LOCATION_NAME, location);
        this.setInputSocketValue(
          replacementNode,
          SHOW_TOAST_NOTIFICATION_NAME,
          false,
        );
      },
    );
  }
}
