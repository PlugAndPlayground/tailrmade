export type GraphProvenance = 'local' | 'own-cloud' | 'imported';

export const isTrustedGraph = (graph: {
  provenance: GraphProvenance;
}): boolean => graph.provenance !== 'imported';

// Only your own account can write a graph's stored provenance, so it is read
// only for graphs fetched from there, and only to keep an imported app imported.
export const getCloudProvenance = ({
  owner,
  isPublic,
  currentUserId,
  storedProvenance,
}: {
  owner: string;
  isPublic: boolean;
  currentUserId: string | undefined;
  storedProvenance: GraphProvenance | undefined;
}): GraphProvenance => {
  // Private graphs are always fetched from the signed-in account
  const fetchedFrom = isPublic ? owner : currentUserId;
  return currentUserId !== undefined &&
    fetchedFrom === currentUserId &&
    storedProvenance !== 'imported'
    ? 'own-cloud'
    : 'imported';
};

export const getCloudSource = (owner: string, location: string, name: string) =>
  `cloud:${owner}/${location}/${name}`;
