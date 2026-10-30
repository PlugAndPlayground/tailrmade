import type { StoredGraph } from '../utils/indexedDB';

export type CloudGraphOwner = {
  name?: string;
  email?: string;
};

export type GraphSource = {
  ownerId: string;
  owner: CloudGraphOwner;
};

const cloudSources = new WeakMap<StoredGraph, GraphSource>();

export function registerCloudGraphSource(
  graph: StoredGraph,
  ownerId: string,
  owner: CloudGraphOwner = {},
): StoredGraph {
  cloudSources.set(graph, { ownerId, owner });
  return graph;
}

export function getGraphSource(graph: StoredGraph): GraphSource | undefined {
  return cloudSources.get(graph);
}
