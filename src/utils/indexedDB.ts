import Dexie from 'dexie';
import { SerializedGraph, AccessType } from './interfaces';

export interface StoredGraph {
  id: string;
  date: Date;
  name: string;
  location: string;
  access: AccessType;
  graphData: SerializedGraph;
  owner: string;
  isRemote: boolean;
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

// Declare Database
export class GraphDatabase extends Dexie {
  public graphs_data: Dexie.Table<StoredGraph, string>;
  public settings: Dexie.Table<Settings, string>;
  public localResources: Dexie.Table<LocalResource, string>;
  public user_data: Dexie.Table<UserDataEntry, string>;

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
    this.graphs_data = this.table('graphs_data');
    this.settings = this.table('settings');
    this.localResources = this.table('localResources');
    this.user_data = this.table('user_data');
  }
}
