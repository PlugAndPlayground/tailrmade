import { TRgba } from '../../utils/color';
import FlowLogic from '../../classes/FlowLogic';
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import {
  NodeRisk,
  StorageReadRisk,
  StorageWriteRisk,
} from '../../classes/NodeRisk';
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
const FILTER_BY_LOCATION_NAME = 'Filter by Location';
const DEFAULT_LOCATION = 'Default';
const OUTPUT_OBJECT_NAMES_NAME = 'Objects';
const SHOW_TOAST_NOTIFICATION_NAME = 'Show Toast Notification';
const STORAGE_WRITE_SKIPPED_VALUE_EMPTY = 'Write skipped: value is empty';
const STORAGE_WRITE_SKIPPED_KEY_EXISTS = 'Write skipped: key already exists';
const STORAGE_DELETE_KEY_NOT_FOUND = 'Key not found in storage';
export const STORAGE_BACKEND_INDEXED_DB = 'IndexedDB';
export const STORAGE_BACKEND_SESSION = 'Session';
const SESSION = STORAGE_BACKEND_SESSION;
export const STORAGE_BACKEND_CLOUD = 'Cloud';
const STORAGE_BACKEND_OPTIONS = [
  { text: STORAGE_BACKEND_CLOUD, disabled: !CLOUD_MODE },
  { text: STORAGE_BACKEND_INDEXED_DB },
  { text: SESSION },
];
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
    getLocationInputSocket(
      options.defaultLocation ?? PPGraph.currentGraph?.id ?? DEFAULT_LOCATION,
    ),
    getKeyInputSocket(),
  ]);
}

abstract class AbstractStorageNode extends PPNode {
  // Readers and mutations report different actions, so neither
  // description has to hedge about what this particular node does.
  protected mutatesStorage = false;

  public getRisks(): NodeRisk[] {
    const { target, resolved } = this.getStorageRiskTarget();
    return [
      this.mutatesStorage
        ? new StorageWriteRisk(target, resolved)
        : new StorageReadRisk(target, resolved),
    ];
  }

  // "<location> › <key> · this browser" once everything that picks the saved
  // data is fixed. Anything set while running leaves it unresolved.
  protected getStorageRiskTarget(): { target?: string; resolved: boolean } {
    const backend = this.getStaticInputData(STORAGE_BACKEND_NAME);
    const address = [LOCATION_NAME, KEY_NAME].map((name) =>
      this.getStaticInputData(name),
    );
    if (!backend.known || address.some(({ known }) => !known)) {
      return { resolved: false };
    }
    return {
      target: describeStorageTarget(
        address.map(({ value }) => String(value)).join(' \u203a '),
        backend.value,
      ),
      resolved: true,
    };
  }
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
  if (input[STORAGE_BACKEND_NAME] === SESSION) return SESSION;
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

const sessionLocations = new Map<string, Record<string, any>>();

let dbInstance: GraphDatabase | undefined;

function getDb(): GraphDatabase {
  return (dbInstance ??= new GraphDatabase());
}

function makeId(location: string, key: string): string {
  return `${location}::${key}`;
}

function objectKeysToEnum(object: Record<string, any>) {
  return Object.keys(object).map((key) => ({
    text: key,
    value: key,
  }));
}

function readSessionLocation(
  location: string,
): Record<string, any> | undefined {
  return structuredClone(sessionLocations.get(location));
}

function describeStorageBackend(backend: string): string {
  return backend === SESSION
    ? 'session storage'
    : backend === STORAGE_BACKEND_CLOUD
      ? 'cloud storage'
      : 'IndexedDB';
}

function describeStorageTarget(address: string, backend: unknown): string {
  return `${address} \u00b7 ${
    getStorageBackend({ [STORAGE_BACKEND_NAME]: backend }) ===
    STORAGE_BACKEND_CLOUD
      ? 'your account'
      : 'this browser'
  }`;
}

function maybeShowToast(input: Record<string, any>, message: string): void {
  if (input[SHOW_TOAST_NOTIFICATION_NAME]) {
    InterfaceController.showSnackBar(message);
  }
}

function areValuesEqual(previousValue: any, nextValue: any): boolean {
  return (
    previousValue === nextValue ||
    (previousValue != null &&
      nextValue != null &&
      convertToViewableString(previousValue) ===
        convertToViewableString(nextValue))
  );
}

export function hasValueChanged(
  hadPreviousValue: boolean,
  previousValue: any,
  hasNextValue: boolean,
  nextValue: any,
): boolean {
  return (
    hadPreviousValue !== hasNextValue ||
    (hadPreviousValue && !areValuesEqual(previousValue, nextValue))
  );
}

const notifying = new Set<string>();
const mutationQueues = new Map<string, Promise<void>>();
function storageAddress(
  backend: string,
  location: string,
  key: string,
): string {
  return JSON.stringify([backend, location, key]);
}
async function serializeMutation<T>(
  address: string,
  action: () => Promise<T>,
): Promise<T> {
  if (notifying.has(address)) throw new Error('Storage feedback loop detected');
  const previous = mutationQueues.get(address) ?? Promise.resolve();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  mutationQueues.set(address, pending);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (mutationQueues.get(address) === pending) mutationQueues.delete(address);
  }
}

async function notifyStorageReadNodes(
  storageBackend: string,
  location: string,
  key: string | string[],
  exclude?: PPNode,
): Promise<void> {
  const keys = Array.isArray(key) ? key : [key];
  const graph = PPGraph.currentGraph;
  if (!graph.nodes) {
    return;
  }

  const nodesToExecute = Object.values(graph.nodes).filter(
    (node) =>
      node !== exclude &&
      keys.some((key) =>
        node.shouldExecuteOnStorageValueChanged(storageBackend, location, key),
      ),
  );

  const addresses = keys.map((key) =>
    storageAddress(storageBackend, location, key),
  );
  addresses.forEach((address) => notifying.add(address));
  try {
    await FlowLogic.executeOptimizedChainBatch(nodesToExecute);
  } finally {
    addresses.forEach((address) => notifying.delete(address));
  }
}

// Legacy accumulators share the same session store and notification path.
export function readSessionState(
  location: string,
  key: string,
  initial: any,
): any {
  const values = readSessionLocation(location);
  return values && Object.hasOwn(values, key)
    ? values[key]
    : structuredClone(initial);
}
export async function writeSessionState(
  location: string,
  key: string,
  value: any,
  owner: PPNode,
): Promise<void> {
  const changed = await serializeMutation(
    storageAddress(SESSION, location, key),
    async () => {
      const values = readSessionLocation(location) ?? {};
      const previous = values[key];
      await mutateStorage(SESSION, location, key, structuredClone(value));
      return hasValueChanged(Object.hasOwn(values, key), previous, true, value);
    },
  );
  if (changed) await notifyStorageReadNodes(SESSION, location, key, owner);
}

async function readStorageValue(
  storageBackend: string,
  location: string,
  key: string,
): Promise<any | undefined> {
  if (storageBackend === SESSION) {
    const storedObject = readSessionLocation(location);
    if (storedObject === undefined || !Object.hasOwn(storedObject, key)) {
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

async function mutateStorage(
  backend: string,
  location: string,
  key: string,
  value: any,
  remove = false,
): Promise<void> {
  if (backend === SESSION) {
    const values = readSessionLocation(location) ?? {};
    if (remove) delete values[key];
    else
      Object.defineProperty(values, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    sessionLocations.set(location, structuredClone(values));
  } else if (backend === STORAGE_BACKEND_CLOUD) {
    const handler = BackendGateway.getInstance();
    if (remove) await handler.deleteObject(key, location);
    else await handler.storeObject(value, location, key);
  } else {
    const id = makeId(location, key);
    const db = getDb();
    if (remove) await db.user_data.delete(id);
    else
      await db.user_data.put({
        id,
        location,
        key,
        value,
        updatedAt: new Date(),
      } satisfies UserDataEntry);
  }
}

async function readStorageLocation(
  storageBackend: string,
  location: string,
): Promise<Record<string, any> | undefined> {
  if (storageBackend === SESSION) {
    return readSessionLocation(location);
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

  const db = getDb();
  const entries = await db.user_data
    .where('location')
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
  if (storageBackend === SESSION) {
    return [...sessionLocations]
      .filter(([name]) => !location || name === location)
      .flatMap(([location, values]) =>
        Object.keys(values).map((key) => ({ location, key })),
      );
  }

  if (storageBackend === STORAGE_BACKEND_CLOUD) {
    const objects = (await BackendGateway.getInstance().listObjectsMetadata())
      .objects;
    if (!location) {
      return objects;
    }
    return objects.filter((object) => object.location === location);
  }

  const db = getDb();
  const entries = location
    ? await db.user_data.where('location').equals(location).toArray()
    : await db.user_data.toArray();

  return entries.map((entry) => ({
    location: entry.location,
    key: entry.key,
    updatedAt: entry.updatedAt,
  }));
}

abstract class StorageNode extends AbstractStorageNode {
  public async configure(
    config: SerializedNode,
    includeSocketData = true,
  ): Promise<void> {
    await super.configure(config, includeSocketData);
    // Saved enum options must not restore removed backends in older apps.
    this.getInputSocketByName(STORAGE_BACKEND_NAME).dataType = new EnumType(
      STORAGE_BACKEND_OPTIONS,
      undefined,
      true,
    );
  }

  protected storageOptions(): StorageSocketOptions {
    return {
      includeStorageBackend: true,
      defaultLocation: PPGraph.currentGraph?.id ?? DEFAULT_LOCATION,
      extraInputs: [getShowToastNotificationInputSocket()],
    };
  }

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
  protected mutatesStorage = true;

  // Storage mutations are useful even when their outputs are unused.
  public getSeemsUnused(): boolean {
    return false;
  }

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
  protected nextValue(previous: any, input: Record<string, any>): any {
    return input[VALUE_NAME];
  }

  public getName() {
    return 'Storage Write';
  }

  public getDescription() {
    return 'Writes a value by location and key to session storage, IndexedDB, or cloud storage';
  }

  protected getDefaultIO(): Socket[] {
    return getStorageWriteSockets(
      new Socket(SOCKET_TYPE.IN, VALUE_NAME, new AnyType()),
      this.storageOptions(),
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
      const additionalKeys = input['Additional keys'] ?? [];
      if (
        !Array.isArray(additionalKeys) ||
        !additionalKeys.every((key) => typeof key === 'string')
      )
        throw new Error('Additional keys must be an array of strings');
      const changedKeys: string[] = [];
      for (const key of new Set<string>([input[KEY_NAME], ...additionalKeys])) {
        const changed = await serializeMutation(
          storageAddress(storageBackend, location, key),
          async () => {
            const previousValue = await readStorageValue(
              storageBackend,
              location,
              key,
            );
            const value = this.nextValue(previousValue, input);
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

            const hadPreviousValue = previousValue !== undefined;
            if (insertOnly && hadPreviousValue) {
              setStorageWriteSkippedWarning(
                this,
                output,
                STORAGE_WRITE_SKIPPED_KEY_EXISTS,
              );
              return;
            }
            await mutateStorage(storageBackend, location, key, nextValue);
            this.completeMutation(
              input,
              output,
              `Wrote "${key}" to ${describeStorageBackend(storageBackend)}`,
            );
            return hasValueChanged(
              hadPreviousValue,
              previousValue,
              true,
              nextValue,
            );
          },
        );
        if (changed) changedKeys.push(key);
      }
      if (changedKeys.length)
        await notifyStorageReadNodes(storageBackend, location, changedKeys);
    } catch (err) {
      this.setStorageExecutionError(output, err, 'Failed to write to storage');
    }
  }
}

export class StorageUpdate extends StorageWrite {
  public getName() {
    return 'Storage Update';
  }
  public getDescription() {
    return 'Updates the latest stored value: increment, append, remove last, or merge object fields';
  }
  protected getDefaultIO(): Socket[] {
    const sockets = super.getDefaultIO();
    const nonEmpty = sockets.find(
      (socket) => socket.name === NON_EMPTY_ONLY_NAME,
    );
    if (nonEmpty) nonEmpty.data = nonEmpty.defaultData = false;
    return sockets.concat(
      new Socket(
        SOCKET_TYPE.IN,
        'Operation',
        new EnumType(
          ['Increment', 'Append', 'Remove last', 'Merge'].map((text) => ({
            text,
          })),
        ),
        'Increment',
      ),
    );
  }
  protected nextValue(previous: any, input: Record<string, any>): any {
    const value = input[VALUE_NAME];
    switch (input.Operation) {
      case 'Increment':
        if (
          (previous !== undefined && typeof previous !== 'number') ||
          typeof value !== 'number'
        )
          throw new Error('Increment requires numbers');
        return (previous ?? 0) + value;
      case 'Append':
      case 'Remove last':
        if (previous !== undefined && !Array.isArray(previous))
          throw new Error('Operation requires an array');
        return input.Operation === 'Append'
          ? [...(previous ?? []), value]
          : (previous ?? []).slice(0, -1);
      case 'Merge':
        if (
          !value ||
          typeof value !== 'object' ||
          Array.isArray(value) ||
          (previous != null &&
            (typeof previous !== 'object' || Array.isArray(previous)))
        )
          throw new Error('Merge requires objects');
        return { ...previous, ...value };
      default:
        throw new Error('Unknown storage operation');
    }
  }
}

export class StorageRead extends StorageReader {
  public getName() {
    return 'Storage Read';
  }

  public shouldExecuteOnStorageValueChanged(
    backend: string,
    location: string,
    key: string,
  ): boolean {
    const nodeKey = this.getInputData(KEY_NAME);
    return (
      this.updateBehaviour.update &&
      this.getConfiguredStorageBackend() === backend &&
      this.getInputData(LOCATION_NAME) === location &&
      (!nodeKey || nodeKey === key)
    );
  }

  public isDependentOnUserData(): boolean {
    return false;
  }

  public getDescription() {
    return 'Reads a value by location and key from session storage, IndexedDB, or cloud storage';
  }

  protected getDefaultIO(): Socket[] {
    return getStorageReadSockets(
      new Socket(SOCKET_TYPE.OUT, VALUE_NAME, new AnyType()),
      this.storageOptions(),
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
    return 'Deletes a value by location and key from session storage, IndexedDB, or cloud storage';
  }

  protected getDefaultIO(): Socket[] {
    return getStorageDeleteSockets({
      includeStorageBackend: true,
      defaultLocation: PPGraph.currentGraph?.id ?? DEFAULT_LOCATION,
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

      const changed = await serializeMutation(
        storageAddress(storageBackend, location, key),
        async () => {
          const previousValue = await readStorageValue(
            storageBackend,
            location,
            key,
          );
          if (previousValue === undefined) {
            setStorageWriteSkippedWarning(
              this,
              output,
              STORAGE_DELETE_KEY_NOT_FOUND,
            );
            return;
          }
          await mutateStorage(storageBackend, location, key, undefined, true);
          this.completeMutation(
            input,
            output,
            `Deleted "${key}" from ${describeStorageBackend(storageBackend)}`,
          );
          return true;
        },
      );
      if (changed) await notifyStorageReadNodes(storageBackend, location, key);
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
  // Without the location filter it reads everything, which today's wording
  // already says, so there is no target to name.
  protected getStorageRiskTarget(): { target?: string; resolved: boolean } {
    const backend = this.getStaticInputData(STORAGE_BACKEND_NAME);
    const filter = this.getStaticInputData(FILTER_BY_LOCATION_NAME);
    if (!backend.known || !filter.known) return { resolved: false };
    if (!filter.value) return { resolved: true };
    const location = this.getStaticInputData(LOCATION_NAME);
    if (!location.known) return { resolved: false };
    return {
      target: describeStorageTarget(String(location.value), backend.value),
      resolved: true,
    };
  }

  public shouldExecuteOnStorageValueChanged(
    backend: string,
    location: string,
  ): boolean {
    return (
      this.updateBehaviour.update &&
      this.getConfiguredStorageBackend() === backend &&
      (!this.getInputData(FILTER_BY_LOCATION_NAME) ||
        this.getInputData(LOCATION_NAME) === location)
    );
  }
  public getName() {
    return 'Browse Storage';
  }

  public getDescription() {
    return 'Lists objects in session storage, IndexedDB, or cloud storage, optionally filtered by location';
  }

  protected getDefaultIO(): Socket[] {
    return getStorageBrowseSockets(
      this,
      new Socket(SOCKET_TYPE.OUT, OUTPUT_OBJECT_NAMES_NAME, new ArrayType()),
      this.storageOptions(),
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
