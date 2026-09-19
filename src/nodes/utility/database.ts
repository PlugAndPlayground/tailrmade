import PPSocket from '../../classes/SocketClass';
import { TRgba } from '../../utils/color';
import { TNodeSource } from '../../utils/interfaces';
import {
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
  TRIGGER_TYPE_OPTIONS,
} from '../../utils/constants';
import PPStorage from '../../PPStorage';
import {
  NodeExecutionError,
  NodeExecutionWarning,
} from '../../classes/ErrorClass';
import PPNode from '../../classes/NodeClass';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import { ArrayType } from '../datatypes/arrayType';
import { FileType } from '../datatypes/fileType';
import { StringType } from '../datatypes/stringType';
import { TriggerType } from '../datatypes/triggerType';
import { inputResourceIdSocketName } from '../../nodes/draw/video';
import { DynamicImport } from '../../utils/dynamicImport';

const inputResourceURLSocketName = 'Resource URL';
export const sqlQuerySocketName = 'SQL query';
const reloadResourceSocketName = 'Reload resource';
const outputTableSocketName = 'Tables';
const outputColumnNamesSocketName = 'Query columns';
const outputQuerySocketName = 'Query result';
const defaultSqlQuery = `SELECT * FROM tablename`;

const IMPORT_NAME = '@sqlite.org/sqlite-wasm@3.45.2-build1';

// the sqlite engine is shared by all reader nodes
let sqlite3Promise: Promise<any> | undefined = undefined;

const getSqlite3 = async () => {
  if (sqlite3Promise === undefined) {
    sqlite3Promise = DynamicImport.dynamicImport(IMPORT_NAME)
      .then((sqlite3Module) =>
        sqlite3Module.default({
          print: console.log,
          printErr: console.error,
          locateFile: () => {
            return `https://cdn.jsdelivr.net/npm/${IMPORT_NAME}/sqlite-wasm/jswasm/sqlite3.wasm`;
          },
        }),
      )
      .catch((error) => {
        // let a later execution try again instead of failing forever
        sqlite3Promise = undefined;
        throw error;
      });
  }
  return sqlite3Promise;
};

export class SqliteReader extends PPNode {
  sqlite3;
  db;
  listenID;
  loadedSource: string | undefined = undefined;
  pendingLoad: Promise<void> | undefined = undefined;

  public getName(): string {
    return 'Sqlite reader';
  }

  public getDescription(): string {
    return 'Reads sqlite files and returns a JSON';
  }

  public getTags(): string[] {
    return ['Input'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.IN,
        inputResourceIdSocketName,
        new FileType([
          'pxshow',
          'sqlite',
          'sqlite3',
          'db',
          'db3',
          's3db',
          'sl3',
        ]),
        '',
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        inputResourceURLSocketName,
        new StringType(),
        '',
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        reloadResourceSocketName,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'loadDatabase'),
        0,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        sqlQuerySocketName,
        new StringType(),
        defaultSqlQuery,
        true,
      ),
      new PPSocket(SOCKET_TYPE.OUT, outputTableSocketName, new ArrayType(), []),
      new PPSocket(
        SOCKET_TYPE.OUT,
        outputColumnNamesSocketName,
        new ArrayType(),
        [],
      ),
      new PPSocket(SOCKET_TYPE.OUT, outputQuerySocketName, new ArrayType(), []),
    ];
  }

  public onNodeAdded = async (source: TNodeSource): Promise<void> => {
    await super.onNodeAdded(source);

    // adding a node should not wait for the engine
    void this.openDatabase().catch((error) => this.reportError(error));

    this.listenID = InterfaceController.addListener(
      ListenEvent.ResourceUpdated,
      (data: any) => {
        const resourceId = this.getInputData(inputResourceIdSocketName);
        if (data.id === resourceId) {
          void this.updateFile().catch((error) => this.reportError(error));
        }
      },
    );
  };

  private reportError = (error: unknown): void => {
    if (!this.destroyed) {
      const errorText =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      this.setStatus(new NodeExecutionError(errorText));
    }
    console.error(error);
  };

  private getSourceKey = (): string => {
    const resourceId = this.getInputData(inputResourceIdSocketName);
    if (resourceId) {
      return `id:${resourceId}`;
    }
    const resourceURL = this.getInputData(inputResourceURLSocketName);
    return resourceURL ? `url:${resourceURL}` : '';
  };

  private closeDatabase = (): void => {
    if (this.db) {
      try {
        this.db.close();
      } catch (error) {
        console.error(error);
      }
      this.db = undefined;
    }
    this.loadedSource = undefined;
  };

  private clearOutputs = (): void => {
    if (!this.destroyed) {
      this.setOutputData(outputTableSocketName, []);
      this.setOutputData(outputQuerySocketName, []);
      this.setOutputData(outputColumnNamesSocketName, []);
    }
  };

  // queue up a load
  openDatabase = (force = false): Promise<void> => {
    const next = (this.pendingLoad ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => this.openDatabaseNow(force));
    this.pendingLoad = next.catch(() => undefined);
    return next;
  };

  private openDatabaseNow = async (force: boolean): Promise<void> => {
    const sourceKey = this.getSourceKey();
    if (!sourceKey) {
      this.closeDatabase();
      this.clearOutputs();
      if (!this.destroyed) {
        this.setStatus(new NodeExecutionWarning('No database loaded'));
      }
      return;
    }
    if (!force && sourceKey === this.loadedSource && this.db) {
      return;
    }

    this.closeDatabase();

    const sqlite3 = await getSqlite3();
    if (this.destroyed) {
      return;
    }
    this.sqlite3 = sqlite3;

    const resourceId = this.getInputData(inputResourceIdSocketName);
    const blob = resourceId
      ? await this.loadResourceLocal(resourceId)
      : await this.loadResourceURL(
          this.getInputData(inputResourceURLSocketName),
        );
    if (!blob) {
      this.clearOutputs();
      if (!this.destroyed) {
        this.setStatus(
          new NodeExecutionWarning(
            resourceId
              ? `No database loaded, "${resourceId}" is not a stored resource. To read many files, feed them into a Map Execute Macro one by one`
              : 'No database loaded',
          ),
        );
      }
      return;
    }

    const db = await this.loadDbFromBlob(blob);
    if (this.destroyed) {
      db.close();
      return;
    }
    this.db = db;
    this.loadedSource = sourceKey;

    const returnArray = [];
    this.db.exec({
      sql: "SELECT name FROM sqlite_master WHERE type='table'",
      rowMode: 'array',
      callback: function (row) {
        returnArray.push(row);
      }.bind(this),
    });
    this.setOutputData(outputTableSocketName, returnArray);
    this.setOutputData(outputQuerySocketName, []);
    this.setOutputData(outputColumnNamesSocketName, []);
  };

  executeQuery = async (): Promise<void> => {
    if (this.db) {
      const returnArray = [];
      const columnNames = [];
      this.db.exec({
        sql: this.getInputData(sqlQuerySocketName),
        columnNames: columnNames,
        rowMode: 'array',
        callback: function (row) {
          returnArray.push(row);
        }.bind(this),
      });
      if (!this.destroyed) {
        this.setOutputData(
          outputQuerySocketName,
          returnArray.length === 1 ? returnArray[0] : returnArray,
        );
        this.setOutputData(outputColumnNamesSocketName, columnNames);
      }
    }
  };

  updateAndExecute = async (localResourceId: string): Promise<void> => {
    this.setInputData(inputResourceIdSocketName, localResourceId);
    await this.updateFile();
  };

  loadDatabase = async (): Promise<void> => {
    await this.openDatabase(true);
    await this.executeQuery();
    if (!this.destroyed) {
      await this.executeChildren();
    }
  };

  updateFile = async (): Promise<void> => {
    await this.loadDatabase();
  };

  onExecute = async (): Promise<void> => {
    await this.openDatabase();
    await this.executeQuery();
  };

  loadResourceLocal = async (resourceId) => {
    return PPStorage.getInstance().loadResource(resourceId);
  };

  loadResourceURL = async (resourceURL) => {
    const promise = fetch(resourceURL)
      .then((response) => {
        if (!response.ok) {
          return null;
        }
        return response.blob();
      })
      .catch((error) => {
        console.error(error);
        return null;
      });
    const blob = await promise;
    if (!blob) {
      return null;
    }
    return blob;
  };

  loadDbFromBlob = async (blob) => {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const p = this.sqlite3.wasm.allocFromTypedArray(bytes);
    const db = new this.sqlite3.oo1.DB();
    const rc = this.sqlite3.capi.sqlite3_deserialize(
      db.pointer,
      'main',
      p,
      bytes.length,
      bytes.length,
      this.sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE,
    );
    if (rc !== this.sqlite3.capi.SQLITE_OK) {
      this.sqlite3.wasm.dealloc(p);
      db.close();
      throw new Error(`Could not read the file as a database (sqlite ${rc})`);
    }
    return db;
  };

  public getDynamicImports(): string[] {
    return [IMPORT_NAME];
  }

  onRemoved(): void {
    super.onRemoved();
    InterfaceController.removeListener(this.listenID);
    this.closeDatabase();
    this.sqlite3 = undefined;
  }
}
