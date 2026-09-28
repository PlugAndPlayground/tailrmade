import { computeStatistics } from './computeStatistics';

self.onmessage = async (event: MessageEvent) => {
  const { id, values, sample } = event.data;
  try {
    const result = await computeStatistics(values, sample);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
