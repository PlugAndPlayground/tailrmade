// Shared (non-React) session state between the craft Editor save handler in
// GraphOverlay and the DashboardEditor load/refresh logic. All tree strings
// are in the craft `query.serialize()` normalization so they can be compared
// directly.
export const surfaceEditSession = {
  // last tree string deserialized into, or written out of, the craft editor;
  // used as echo guard so deserialize-triggered onNodesChange does not write
  lastSyncedTreeString: '',
};

export function resetSurfaceEditSession(): void {
  surfaceEditSession.lastSyncedTreeString = '';
}
