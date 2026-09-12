import Dexie from 'dexie';
import { SerializedGraph, AccessType } from './interfaces';
import type { GraphProvenance } from './graphTrust';
import type { AppGrants } from './appGrants';

export interface StoredGraph {
  id: string;
  date: Date;
  name: string;
  location: string;
  access: AccessType;
  graphData: SerializedGraph;
  owner: string;
  isRemote: boolean;
  provenance: GraphProvenance;
  // Where an imported app came from: a link, a file or a cloud app
  source?: string;
}

export interface Settings {
  name: string;
  value: string;
}

interface LocalResource {
  id: string;
  size: number;
  date: Date;
  data: Blob;
  name?: string;
}

export interface UserDataEntry {
  id: string;
  location: string;
  key: string;
  value: any;
  updatedAt: Date;
}

export interface AppGrantsEntry {
  id: string;
  grants: AppGrants;
  date: Date;
}

// Declare Database
export class GraphDatabase extends Dexie {
  public graphs_data: Dexie.Table<StoredGraph, string>;
  public settings: Dexie.Table<Settings, string>;
  public localResources: Dexie.Table<LocalResource, string>;
  public user_data: Dexie.Table<UserDataEntry, string>;
  public app_grants: Dexie.Table<AppGrantsEntry, string>;

  public constructor() {
    super('GraphDatabase');
    this.version(5).stores({
      graphs_data: '&id',
      settings: '&name',
      localResources: '&id',
    });
    this.version(6).stores({
      graphs_data: '&id',
      settings: '&name',
      localResources: '&id',
      user_data: '&id, location, key',
    });
    // Imported and self-made graphs were stored alike before this, so every
    // existing graph counts as local
    this.version(7)
      .stores({
        graphs_data: '&id',
        settings: '&name',
        localResources: '&id',
        user_data: '&id, location, key',
      })
      .upgrade((transaction) =>
        transaction
          .table('graphs_data')
          .toCollection()
          .modify((graph: StoredGraph) => {
            graph.provenance = 'local';
          }),
      );
    this.version(8).stores({
      graphs_data: '&id',
      settings: '&name',
      localResources: '&id',
      user_data: '&id, location, key',
      app_grants: '&id',
    });
    this.graphs_data = this.table('graphs_data');
    this.settings = this.table('settings');
    this.localResources = this.table('localResources');
    this.user_data = this.table('user_data');
    this.app_grants = this.table('app_grants');
  }
}
