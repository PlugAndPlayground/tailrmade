// Temporary state belongs to one loaded app, even when the graph is reused.
export let sessionLocations = new Map<string, Record<string, any>>();
export let appSessionStorageVersion = 0;

export function resetAppSessionStorage(): void {
  sessionLocations = new Map();
  appSessionStorageVersion++;
}

export function captureAppSessionStorage(): () => void {
  const session = sessionLocations;
  return () => {
    if (session !== sessionLocations) {
      throw new Error('The app session has ended');
    }
  };
}
