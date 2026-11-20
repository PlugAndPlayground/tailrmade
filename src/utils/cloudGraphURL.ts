import type { IGraphSearch } from './interfaces';

type CloudGraphReference = Pick<
  IGraphSearch,
  'owner' | 'name' | 'location' | 'access'
>;

// Kept free of app imports so nodes and tests can build share links cheaply.
export const getLoadCloudGraphURL = (
  graph: CloudGraphReference & Partial<IGraphSearch>,
): string => {
  const encodedOwner = encodeURIComponent(graph.owner);
  const encodedName = encodeURIComponent(graph.name);
  const encodedLocation = encodeURIComponent(graph.location);
  const encodedAccess = encodeURIComponent(graph.access);

  const fullPath = `${window.location.origin}${
    window.location.pathname
  }?loadGraph=${encodedOwner};;${encodedName};;${encodedLocation};;${encodedAccess}`;
  return fullPath;
};

// The address that reopens this app for someone else. Built from the loaded
// app's cloud reference, not window.location: loading rewrites the address to
// loadRemoteGraph/loadLocalGraph, and a local id only works in this browser.
export function getAppLink(
  graph:
    | Pick<IGraphSearch, 'isRemote' | 'access' | 'owner' | 'name' | 'location'>
    | undefined,
): string {
  if (!graph?.isRemote || graph.access !== 'public') return '';
  return getLoadCloudGraphURL(graph);
}
