import { getHost, getKeyNames } from './scanGraph';

export interface AppGrants {
  fullAccess: boolean;
  keys: string[];
  hosts: string[];
  companion: boolean;
  // undefined backend or location grants any
  storage: { backend: string | undefined; location: string | undefined }[];
  ai: boolean;
  intervals: boolean;
}

// Trusted apps get everything
export const ALL_GRANTS = 'all';
export type GraphGrants = AppGrants | typeof ALL_GRANTS;

// Imported apps open paused with this until the user runs them
export const NO_GRANTS: AppGrants = {
  fullAccess: false,
  keys: [],
  hosts: [],
  companion: false,
  storage: [],
  ai: false,
  intervals: false,
};

export const OFF_FOR_THIS_APP = 'Off for this app';

export const isFullAccessGranted = (grants: GraphGrants): boolean =>
  grants === ALL_GRANTS || grants.fullAccess;

export const isAIGranted = (grants: GraphGrants): boolean =>
  grants === ALL_GRANTS || grants.ai;

export const areIntervalsGranted = (grants: GraphGrants): boolean =>
  grants === ALL_GRANTS || grants.intervals;

export const isHostGranted = (grants: GraphGrants, url: unknown): boolean => {
  if (grants === ALL_GRANTS) return true;
  const host = getHost(url);
  return host !== undefined && grants.hosts.includes(host);
};

// Checks the request as it is about to be sent, so hosts and keys built at
// runtime are caught too
export const getRequestRefusal = (
  grants: GraphGrants,
  request: {
    url: unknown;
    headers: unknown;
    body: unknown;
    usingCompanion: boolean;
  },
): string | undefined => {
  if (grants === ALL_GRANTS) return undefined;
  if (request.usingCompanion && !grants.companion) {
    return `${OFF_FOR_THIS_APP}: sending through the Companion`;
  }
  const refusedKey = getKeyNames(
    JSON.stringify([request.url, request.headers, request.body]) ?? '',
  ).find((name) => !grants.keys.includes(name));
  if (refusedKey) {
    return `${OFF_FOR_THIS_APP}: the API key ${refusedKey}`;
  }
  if (!isHostGranted(grants, request.url)) {
    return `${OFF_FOR_THIS_APP}: connecting to ${getHost(request.url) ?? String(request.url)}`;
  }
  return undefined;
};

export const getStorageRefusal = (
  grants: GraphGrants,
  backend: string,
  location: string | undefined,
): string | undefined => {
  if (grants === ALL_GRANTS) return undefined;
  const granted = grants.storage.some(
    (grant) =>
      (grant.backend === undefined || grant.backend === backend) &&
      (grant.location === undefined || grant.location === location),
  );
  return granted
    ? undefined
    : `${OFF_FOR_THIS_APP}: storage ${location === undefined ? 'in every location' : `location "${location}"`}`;
};
