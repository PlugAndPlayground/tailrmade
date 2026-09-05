import { Viewport } from 'pixi-viewport';
import InterfaceController, { ListenEvent } from './InterfaceController';
import * as constants from './utils/constants';
import { GraphDatabase, StoredGraph } from './utils/indexedDB';
import { VISIBILITY_ACTION } from './utils/constants_shared';
import {
  downloadFile,
  formatDate,
  getFileNameFromLocalResourceId,
  getGraphFromIGraphSearch,
  getSetting,
  setGestureModeOnViewport,
  writeDataToClipboard,
} from './utils/utils';
import { migrateGraphDataOnLoad } from './utils/graphMigrations';
import * as PIXI from 'pixi.js';
import PPGraph from './classes/GraphClass';
import { hri } from 'human-readable-ids';
import { Button } from '@mui/material';
import React from 'react';
import { IGraphSearch, SerializedGraph, AccessType } from './utils/interfaces';
import pako from 'pako';
import { ActionHandler } from './classes/Action';
import { CLOUD_MODE } from './services/shared-types';
import { DASHBOARD_DEFAULT } from './utils/constants';
import _ from 'lodash';
import { BackendGateway } from './services/BackendGateway';

(window as any).__PIXI_INSPECTOR_GLOBAL_HOOK__ &&
  (window as any).__PIXI_INSPECTOR_GLOBAL_HOOK__.register({ PIXI: PIXI });

export const DEFAULT_LOCATION = 'Default';
export const DEFAULT_ACCESS = 'private';

export const autoSaveSuffix = ' - Autosave';

const autoLocalBackupInterval = 1000 * 60 * 3;

function detectTrackPad(event: WheelEvent) {
  let isTrackpad = false;

  // Check 1: deltaMode - trackpads typically use pixel mode
  if (event.deltaMode === 0) {
    // Check 2: Fractional deltas suggest trackpad
    const hasFractionalDelta =
      event.deltaY !== Math.floor(event.deltaY) ||
      event.deltaX !== Math.floor(event.deltaX);

    // Check 3: Small absolute values (< 4) are common with trackpads
    const hasSmallDelta = Math.abs(event.deltaY) < 4;

    // Trackpad if we have fractional values OR small deltas
    isTrackpad = hasFractionalDelta || hasSmallDelta;
  }

  const gestureMode = isTrackpad
    ? constants.GESTUREMODE.TRACKPAD
    : constants.GESTUREMODE.MOUSE;

  setGestureModeOnViewport(PPStorage.viewport, gestureMode);
  InterfaceController.showSnackBar(`${gestureMode} detected`);
}

export function checkForUnsavedChanges(): boolean {
  return (
    !ActionHandler.existsUnsavedChanges() ||
    window.confirm('Changes that you made may not be saved. OK to continue?')
  );
}

function removeUrlParameter(parameter: string): void {
  const currentUrl = new URL(window.location.href);
  const searchParams = new URLSearchParams(currentUrl.search);
  searchParams.delete(parameter);
  currentUrl.search = searchParams.toString();
  window.history.pushState({}, '', currentUrl.href);
}

function compressString(str) {
  const textEncoder = new TextEncoder();
  const input = textEncoder.encode(str);
  const compressed = pako.deflate(input);
  let binaryString = '';
  const chunkSize = 5000;
  for (let i = 0; i < compressed.length; i += chunkSize) {
    const chunk = compressed.subarray(i, i + chunkSize);
    binaryString += String.fromCharCode.apply(null, chunk);
  }
  // Use URL-safe Base64
  return btoa(binaryString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function decompressString(urlSafeBase64) {
  // Restore Base64 characters
  const base64String = urlSafeBase64
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(urlSafeBase64.length + ((4 - (urlSafeBase64.length % 4)) % 4), '=');

  const binaryString = atob(base64String);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const decompressed = pako.inflate(bytes);
  const textDecoder = new TextDecoder();
  return textDecoder.decode(decompressed);
}

export default class PPStorage {
  dateOfLastGraphLoaded = new Date();

  autoBackupThrottled = _.throttle(
    async () => {
      // we make auto save in case we have the graph stored already, otherwise not, this is so that you wouldn't start auto saving a graph a user has opened via URL but not saved for example
      const loadedGraph: StoredGraph | undefined = await this.getGraphFromDB(
        PPGraph.currentGraph.id,
      );
      if (ActionHandler.existsUnsavedChanges() && loadedGraph !== undefined) {
        console.log('auto saved app');
        void this.saveGraphAction(
          true,
          PPGraph.currentGraph.name + autoSaveSuffix,
          PPGraph.currentGraph.location,
          false,
        );
      }
    },
    autoLocalBackupInterval,
    { leading: false },
  );

  public static getInstance(): PPStorage {
    if (this.instance == undefined) {
      this.instance = new PPStorage();
    }
    return this.instance;
  }

  debug_timesLoaded;
  constructor() {
    this.db = new GraphDatabase();
    this.debug_timesLoaded = 0;
  }

  public async createNewGraph(): Promise<void> {
    if (checkForUnsavedChanges()) {
      await this.createEmptyGraph();
    }
  }

  async createEmptyGraph(): Promise<string> {
    const currentOverlayState = InterfaceController.getOverlayState();
    InterfaceController.updateOverlayState({
      ...currentOverlayState,
      dashboard: DASHBOARD_DEFAULT,
    });
    InterfaceController.toggleDashboardInEditMode(VISIBILITY_ACTION.CLOSE);

    await PPGraph.currentGraph.clear();

    const graphId = hri.random();

    PPGraph.currentGraph.setBaselineMetadata({
      id: graphId,
      name: graphId,
    });

    InterfaceController.notifyListeners(
      ListenEvent.GraphChanged,
      PPGraph.currentGraph,
    );
    InterfaceController.showSnackBar('Created new empty app');

    // Clear all graph-loading URL parameters when creating a new graph
    removeUrlParameter(constants.URL_PARAMETER_NAME.LOADLOCAL);
    removeUrlParameter(constants.URL_PARAMETER_NAME.LOADURLGRAPH);
    removeUrlParameter(constants.URL_PARAMETER_NAME.LOADGRAPH);
    removeUrlParameter(constants.URL_PARAMETER_NAME.LOADLOCALGRAPH);
    removeUrlParameter(constants.URL_PARAMETER_NAME.LOADREMOTEGRAPH);
    removeUrlParameter(constants.URL_PARAMETER_NAME.NEW);

    ActionHandler.setUnsavedChange(false);
    return graphId;
  }

  applyGestureMode(viewport: Viewport, newGestureMode: string | undefined) {
    PPStorage.viewport = viewport;
    this.db
      .transaction('rw', this.db.settings, async () => {
        let gestureMode = newGestureMode;
        if (gestureMode) {
          // save newGestureMode
          await this.db.settings.put({
            name: 'gestureMode',
            value: gestureMode,
          });
        } else {
          // get saved gestureMode
          gestureMode = await getSetting(this.db, 'gestureMode');
          console.log(gestureMode);
        }

        if (
          gestureMode === constants.GESTUREMODE.MOUSE ||
          gestureMode === constants.GESTUREMODE.TRACKPAD
        ) {
          const otherMode =
            gestureMode === constants.GESTUREMODE.MOUSE
              ? constants.GESTUREMODE.TRACKPAD
              : constants.GESTUREMODE.MOUSE;
          setGestureModeOnViewport(viewport, gestureMode);
          InterfaceController.showSnackBar(
            `GestureMode is set to: ${gestureMode}`,
            {
              action: (key) => (
                <Button
                  size="small"
                  onClick={() => {
                    this.applyGestureMode(
                      PPGraph.currentGraph.viewport,
                      otherMode || 'Mouse',
                    );
                    InterfaceController.hideSnackBar(key);
                  }}
                >
                  Switch to {otherMode}
                </Button>
              ),
            },
          );
        } else {
          // subscribe to wheel event to detect pointer device
          window.addEventListener('wheel', detectTrackPad, {
            once: true,
            passive: true,
          });
        }
      })
      .catch((e) => {
        console.log(e.stack || e);
      });
  }

  potentiallyConvertSerializedGraphToStoredGraph(
    graph: SerializedGraph | StoredGraph | any,
  ): StoredGraph {
    // If this already looks like a complete StoredGraph, return it
    if (
      graph.name !== undefined &&
      graph.id !== undefined &&
      graph.date !== undefined &&
      graph.graphData !== undefined
    ) {
      return graph as StoredGraph;
    }

    // Otherwise, convert it to a StoredGraph
    console.log('Converting an older serialized graph to stored graph');
    const id = graph.id || hri.random();
    return {
      id: id,
      name: graph.name || id,
      location: graph.location || DEFAULT_LOCATION,
      graphData: graph.graphData || graph,
      date: graph.date || new Date(),
      access: graph.access || DEFAULT_ACCESS,
      owner: graph.owner || 'unknown',
      isRemote: graph.isRemote || false,
    };
  }

  // this gets a StoredGraph, but SerializedGraph is legacy so might need to convert
  stringToStoredGraph(stringifiedGraph: string): StoredGraph {
    const uncompressed =
      PPStorage.potentiallyDeCompressString(stringifiedGraph);
    const parsed = JSON.parse(uncompressed);
    return this.potentiallyConvertSerializedGraphToStoredGraph(parsed);
  }

  static potentiallyDeCompressString(stringifiedGraph: string) {
    // see if it is compressed by seeing if we can parse it
    try {
      JSON.parse(stringifiedGraph);
      console.log('string was not compressed, loading as usual');
      return stringifiedGraph;
    } catch (e) {
      console.log('Decompressing string');
      return decompressString(stringifiedGraph);
    }
  }

  getDownloadReadyGraph(graph: StoredGraph, compressed: boolean): string {
    let stringifiedGraph = compressed
      ? JSON.stringify(graph)
      : JSON.stringify(graph, null, 2);
    if (compressed) {
      return compressString(stringifiedGraph);
    } else {
      return stringifiedGraph;
    }
  }

  downloadStoredGraph(graph: StoredGraph, compressed: boolean) {
    const stringifiedGraph = this.getDownloadReadyGraph(graph, compressed);
    downloadFile(
      stringifiedGraph,
      `${graph.name} - ${formatDate()}.tmapp`,
      'text/plain',
    );
  }

  async downloadCurrentGraph(compressed: boolean) {
    this.downloadStoredGraph(
      PPGraph.currentGraph.getSerializedStoredGraph(),
      compressed,
    );
  }

  async downloadGraph(graph: IGraphSearch) {
    document.body.style.cursor = 'wait';
    const data = await getGraphFromIGraphSearch(graph);

    if (data !== undefined) {
      this.downloadStoredGraph(data, false);
      InterfaceController.showSnackBar(
        <span>
          <b>{data.name}</b> was saved to your Download folder
        </span>,
      );
    } else {
      console.error(
        "Unable to download graph, not found (this shouldn't happen 🤡)",
      );
    }
    document.body.style.cursor = 'default';
  }

  async deleteAllGraphs(): Promise<void> {
    await this.db.graphs_data.clear();
    void BackendGateway.getInstance().refreshGraphsMetadata();
    InterfaceController.showSnackBar('All apps were deleted');
  }

  async deleteGraph(graph: IGraphSearch): Promise<boolean> {
    let wasDeleted = false;
    try {
      await this.db.graphs_data.delete(graph.id);
      await this.db.graphs_data
        .filter(
          (item) =>
            item.name === graph.name &&
            item.location === graph.location &&
            item.date.toISOString() === graph.date.toISOString(),
        )
        .delete();
      console.log('Removed graph from local database');
      wasDeleted = true;
    } catch (error) {
      console.log('Did not remove graph from local database');
    }
    try {
      if (graph.isRemote) {
        wasDeleted = await BackendGateway.getInstance().deleteItem(
          graph.name,
          graph.location,
          'graph',
        );
        console.log('Removed graph from cloud');
      }
    } catch (error) {
      console.log('Did not remove graph from cloud');
    }
    if (wasDeleted) {
      void BackendGateway.getInstance().refreshGraphsMetadata();
      InterfaceController.showSnackBar(`${graph.name} was deleted`);
    }
  }

  async loadGraphFromCloudReference(compactFormat: any): Promise<void> {
    const [owner, name, location, access = 'public'] =
      compactFormat.split(';;');
    const isPublic = access === 'public';

    if (!isPublic) {
      console.log('Need to login to load graph');
      InterfaceController.showSpinner('Trying to access app');
      const wasLoggedIn =
        await BackendGateway.getInstance().awaitPotentialLogin();
      InterfaceController.hideSpinner('Trying to access app');
      if (!wasLoggedIn) {
        InterfaceController.showSnackBar(
          'Failed to access app, special access required and you are not signed in',
        );
      }
    } else {
      console.log('Determined login not needed to load graph');
    }

    const data = await BackendGateway.getInstance().tryGetGraph(
      owner,
      name,
      location,
      isPublic,
    );
    data.isRemote = true;
    console.log('data', data);
    await this.loadGraphFromData(data);
    console.log('loaded graph');
    // Remove the URL parameter after loading
    removeUrlParameter(constants.URL_PARAMETER_NAME.LOADGRAPH);
  }

  async loadGraphFromData(fileData: StoredGraph) {
    try {
      document.body.style.cursor = 'wait';
      PPStorage.getInstance().dateOfLastGraphLoaded = new Date(fileData.date);
      const migratedFileData = {
        ...fileData,
        graphData: migrateGraphDataOnLoad(fileData.graphData),
      };
      await PPGraph.currentGraph.configure(migratedFileData);

      InterfaceController.notifyListeners(ListenEvent.GraphChanged, {
        id: fileData.id,
        name: fileData.name,
      });
      ActionHandler.setUnsavedChange(false); // reset unsaved changes after loading a graph

      // Log app open event for analytics
      BackendGateway.getInstance().logAppOpened(fileData.name);

      // just want the green check mark
      InterfaceController.showSpinner('App was loaded');
      InterfaceController.hideSpinner('App was loaded');
      if (InterfaceController.toastEverything) {
        InterfaceController.showSnackBar('App was loaded');
      }
      document.body.style.cursor = 'default';

      return fileData;
    } catch (error) {
      InterfaceController.showSnackBar('Loading app failed: ' + error, {
        variant: 'error',
      });
      return undefined;
    }
  }

  async loadGraphFromDataEmbeddedInURL(
    stringifiedGraph: string,
  ): Promise<StoredGraph | undefined> {
    const graph = this.stringToStoredGraph(stringifiedGraph);
    const result = await this.loadGraphFromData(graph);
    // Remove the URL parameter after loading - this is a one-time load from URL
    removeUrlParameter(constants.URL_PARAMETER_NAME.LOADURLGRAPH);
    return result;
  }

  async getGraphNameFromDB(graphId: string): Promise<undefined | string> {
    try {
      return await this.db.graphs_data
        .where(':id')
        .equals(graphId)
        .first((graph: StoredGraph) => graph.name || graph.id);
    } catch (e) {
      console.log(e.stack || e);
      return '';
    }
  }

  getLatestGraphId(): Promise<string> {
    return this.db.graphs_data
      .toCollection()
      .sortBy('date')
      .then((graphs) =>
        graphs.length > 0 ? graphs[graphs.length - 1].id : '',
      );
  }

  async loadGetStartedGraph(): Promise<void> {
    if (!CLOUD_MODE) {
      await this.createEmptyGraph();
      return;
    }
    try {
      await this.loadGraphFromData(
        await BackendGateway.getInstance().getPublicGraph(
          'publicUser',
          'Default',
          constants.GET_STARTED_GRAPH,
        ),
      );
    } catch (error) {
      // the get-started graph may be unreachable
      console.log(error.stack || error);
      await this.createEmptyGraph();
    }
  }

  async loadLatestGraphFromDB(): Promise<void> {
    const latestGraphId = await this.getLatestGraphId();
    if (latestGraphId === '') {
      await this.loadGetStartedGraph();
    } else {
      await this.loadGraphFromDB(latestGraphId);
    }
  }

  async getGraphFromDB(id: string): Promise<StoredGraph | undefined> {
    try {
      const storedGraph = await this.db.graphs_data.get(id);
      return storedGraph;
    } catch (error) {
      console.error('Error retrieving graph from database:', error);
      return undefined;
    }
  }

  updateLocalURL = (storedGraph: StoredGraph) => {
    const urlObj = new URL(window.location.href);
    urlObj.searchParams.delete(constants.URL_PARAMETER_NAME.LOADLOCALGRAPH);
    urlObj.searchParams.delete(constants.URL_PARAMETER_NAME.LOADREMOTEGRAPH);
    if (storedGraph.isRemote) {
      urlObj.searchParams.set(
        constants.URL_PARAMETER_NAME.LOADREMOTEGRAPH,
        JSON.stringify(this.storedGraphToIGraphSearch(storedGraph)),
      );
    } else {
      urlObj.searchParams.set(
        constants.URL_PARAMETER_NAME.LOADLOCALGRAPH,
        storedGraph.id,
      );
    }
    history.pushState(null, '', urlObj.toString());
  };

  async loadGraphFromDB(id: string): Promise<void> {
    this.debug_timesLoaded++;

    // look for the graph in the database
    const loadedGraph: StoredGraph | undefined = await this.getGraphFromDB(id);
    console.log('loaded', loadedGraph);
    if (loadedGraph !== undefined) {
      try {
        await this.loadGraphFromData(loadedGraph);
      } catch (e) {
        console.warn('Error loading graph:', e);
        await this.createEmptyGraph();
        InterfaceController.showSnackBar(
          <span>
            Failed to load <b>{loadedGraph.name}</b> from the database.
          </span>,
          { variant: 'error' },
        );
      }
    } else {
      console.warn('No graph found with id:', id);
      await this.createEmptyGraph();
      InterfaceController.showSnackBar(
        <span>
          <b>{id}</b> not found.
        </span>,
        { variant: 'error' },
      );
    }
  }

  idToGraphName(id: string): string {
    return id.substring(0, id.lastIndexOf('-')).replace('-', ' ');
  }

  async renameGraph(graphId: string, newName: string) {
    const loadedGraph = await this.db.graphs_data.get(graphId);
    if (loadedGraph !== undefined && loadedGraph.name !== newName) {
      await this.db.graphs_data.update(graphId, { name: newName });
      PPGraph.currentGraph.name = newName;

      void BackendGateway.getInstance().refreshGraphsMetadata();
      InterfaceController.notifyListeners(ListenEvent.GraphChanged, {
        id: graphId,
        name: newName,
      });
      InterfaceController.showSnackBar(
        <span>
          Name changed to <b>{newName}</b>
        </span>,
      );
    }
  }

  async updateGraph(newName: string, access: AccessType, location: string) {
    const graph = PPGraph.currentGraph;
    let changed =
      graph.name !== newName ||
      graph.location !== location ||
      graph.access !== access;
    PPGraph.currentGraph.access = access; // access is special and stored directly

    if (changed) {
      await this.saveGraphAction(false, newName, location);
    }
  }

  async potentiallySaveCloudGraph(
    graph: StoredGraph,
    saveNew: boolean,
    oldName: string,
    oldLocation: string,
  ): Promise<boolean> {
    if (!CLOUD_MODE) {
      return false;
    }
    if (
      !BackendGateway.getInstance().getIsLoggedIn() ||
      !(await BackendGateway.getInstance().getUserPreferences())?.saveInCloud
    ) {
      console.log(
        'Not saving to cloud because user is not logged in or saveInCloud is false',
      );
      return false;
    }

    const downloadReadyGraph = PPStorage.getInstance().getDownloadReadyGraph(
      graph,
      true,
    );
    await BackendGateway.getInstance().storeItem(
      downloadReadyGraph,
      graph.location,
      graph.name,
      'graph',
      graph.access,
      graph.date.toISOString(),
    );
    // if we didnt save new and stuff changed then delete the old graph
    if (
      !saveNew &&
      (oldName !== graph.name || oldLocation !== graph.location)
    ) {
      await BackendGateway.getInstance().deleteItem(
        oldName,
        oldLocation,
        'graph',
      );
    }

    return true;
  }

  graphIDFromNameAndLocation(name: string, location: string) {
    return PPGraph.currentGraph.location + '/' + name;
  }

  async saveGraphAction(
    saveNew: boolean,
    name: string = PPGraph.currentGraph.name,
    location: string = PPGraph.currentGraph.location,
    setAsCurrentGraph: boolean = true,
  ) {
    const SAVING_GRAPH_SPINNER_MESSAGE = 'Saving app';
    InterfaceController.showSpinner(SAVING_GRAPH_SPINNER_MESSAGE);
    try {
      const storedGraph = PPGraph.currentGraph.getSerializedStoredGraph();
      const savedDate = storedGraph.date;

      const oldName = storedGraph.name;
      const oldLocation = storedGraph.location;

      const existingGraphRuntime = PPGraph.currentGraph;
      const newName = saveNew
        ? name == existingGraphRuntime.name
          ? existingGraphRuntime.name + ' (copy)'
          : name
        : name;

      storedGraph.name = newName;
      storedGraph.location = location;
      storedGraph.owner = storedGraph.owner || 'unknown';
      storedGraph.isRemote = storedGraph.isRemote || false;

      // potentially save to cloud
      const savedToCloud = await this.potentiallySaveCloudGraph(
        storedGraph,
        saveNew,
        oldName,
        oldLocation,
      );
      const loadedGraphId = PPGraph.currentGraph.id;
      const existingGraphDB: StoredGraph | undefined =
        await this.db.graphs_data.get(loadedGraphId);

      const newId = this.graphIDFromNameAndLocation(newName, location);
      if (saveNew || existingGraphDB === undefined) {
        storedGraph.id = newId;
        await this.saveGraphToDabase(storedGraph);
        if (setAsCurrentGraph) {
          PPGraph.currentGraph.id = newId;
          this.updateLocalURL(storedGraph); // update the URL to use the new id
        }
      } else {
        // override old ID if exists
        storedGraph.id = existingGraphDB!.id;
        await this.saveGraphToDabase(storedGraph);
      }
      if (setAsCurrentGraph) {
        PPGraph.currentGraph.name = newName;
        PPGraph.currentGraph.location = location;
        PPStorage.getInstance().dateOfLastGraphLoaded = savedDate;
        InterfaceController.notifyListeners(
          ListenEvent.GraphChanged,
          PPGraph.currentGraph,
        );
      }
      void BackendGateway.getInstance().refreshGraphsMetadata();
      // if we are not setting as current graph then dont show the toast - its annoying
      if (setAsCurrentGraph) {
        if (!savedToCloud) {
          InterfaceController.showSnackBar(
            <span>
              <b>{newName}</b> was saved to local database
            </span>,
          );
        } else {
          InterfaceController.showSnackBar(
            <span>
              <b>{newName}</b> was saved to cloud and local database
            </span>,
          );
        }
      }
      ActionHandler.setUnsavedChange(false);
    } catch (e) {
      console.error(e);
    }
    InterfaceController.hideSpinner(SAVING_GRAPH_SPINNER_MESSAGE);
  }

  async saveGraphToDabase(storedGraph: StoredGraph) {
    storedGraph.isRemote = false;
    await this.db.graphs_data.put(storedGraph);
  }

  async getLocalGraphsList(): Promise<IGraphSearch[]> {
    // Use the .keys() method to fetch only the primary keys first
    const graphIds = await PPStorage.getInstance()
      .db.graphs_data.toCollection()
      .primaryKeys();

    // Then retrieve only the necessary fields for each key
    const graphs: IGraphSearch[] = await Promise.all(
      graphIds.map(async (id) => {
        return this.db.graphs_data
          .where(':id')
          .equals(id)
          .first((graph: StoredGraph) => this.storedGraphToIGraphSearch(graph));
      }),
    );
    //console.log('graphs: ' + JSON.stringify(graphs));

    // slight hack, make sure they dont register as remote
    graphs.forEach((graph) => {
      graph.isRemote = false;
    });

    return graphs;
  }

  storedGraphToIGraphSearch(graph: StoredGraph): IGraphSearch {
    return {
      id: graph.isRemote
        ? this.graphIDFromNameAndLocation(graph.name, graph.location)
        : graph.id,
      location: graph.location || DEFAULT_LOCATION,
      owner: graph.owner || 'unknown',
      name: graph.name,
      date: graph.date,
      access: graph.access || DEFAULT_ACCESS,
      isRemote: graph.isRemote || false,
    };
  }

  async getResources(): Promise<any[]> {
    return PPStorage.getInstance()
      .db.localResources.toCollection()
      .sortBy('date');
  }

  async loadResource(resourceId: string): Promise<Blob> {
    let foundResource;
    return this.db
      .transaction('rw', this.db.localResources, async () => {
        const resources = await this.db.localResources.toArray();

        if (resources.length > 0) {
          foundResource = resources.find(
            (resource) => resource.id === resourceId,
          );
          if (foundResource) {
            InterfaceController.showSnackBar(
              <span>
                <b>{getFileNameFromLocalResourceId(resourceId)}</b> was loaded
                from the local storage
              </span>,
            );
            return foundResource.data;
          }
        }
        console.log('Resource not found');
        return undefined;
      })
      .catch((e) => {
        console.log(e.stack || e);
        return undefined;
      });
  }

  async storeResource(
    resourceId: string,
    size: number,
    data: Blob,
    name: string,
  ): Promise<void> {
    return this.db
      .transaction('rw', this.db.localResources, async () => {
        const resources = await this.db.localResources.toArray();
        const foundResource = resources.find(
          (resource) => resource.id === resourceId,
        );
        const fileName = getFileNameFromLocalResourceId(resourceId);

        if (foundResource === undefined) {
          await this.db.localResources.put({
            id: resourceId,
            size,
            date: new Date(),
            data,
            name,
          });

          InterfaceController.showSnackBar(
            <span>
              <b>{fileName}</b> is stored in the local storage
            </span>,
          );
          console.log(`Resource ${resourceId} was stored`);
        } else {
          await this.db.localResources.where('id').equals(resourceId).modify({
            date: new Date(),
            data,
          });
          console.log(`Resource ${resourceId} was updated`);
        }
        InterfaceController.notifyListeners(ListenEvent.ResourceUpdated, {
          id: resourceId,
        });
      })
      .catch((e) => {
        console.log(e.stack || e);
      });
  }

  async deleteResource(resourceId: string): Promise<void> {
    return this.db
      .transaction('rw', this.db.localResources, async () => {
        const resource = await this.db.localResources.get(resourceId);

        if (resource) {
          await this.db.localResources.delete(resourceId);

          const fileName = getFileNameFromLocalResourceId(resourceId);

          InterfaceController.showSnackBar(
            <span>
              <b>{fileName}</b> has been removed from the local storage
            </span>,
          );
          console.log(`Resource ${resourceId} was deleted`);

          InterfaceController.notifyListeners(ListenEvent.ResourceUpdated, {
            id: resourceId,
            deleted: true,
          });
        } else {
          console.log(`Resource ${resourceId} not found`);
        }
      })
      .catch((e) => {
        console.error(`Error deleting resource ${resourceId}:`, e.stack || e);
        InterfaceController.showSnackBar(
          <span>Error deleting resource. Please try again.</span>,
        );
      });
  }

  public copyCurrentGraphURLToClipboard() {
    const serialized = PPStorage.getInstance().getDownloadReadyGraph(
      PPGraph.currentGraph.getSerializedStoredGraph(),
      true,
    );
    const URL = 'https://tailrmade.app/?loadFullGraph=' + serialized;
    writeDataToClipboard(URL, false);
    InterfaceController.showSnackBar('Copied graph URL to clipboard');
  }

  static viewport: Viewport; // WARNING, HACK, this should not be saved, TODO improve
  private db: GraphDatabase; // spent a lot of effort making this private, if you want to do something with it, please go through this class
  private static instance: PPStorage;
}
