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
