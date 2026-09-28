export interface StatisticsSummary {
  count: number;
  sum: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  variance: number | null;
  standardDeviation: number | null;
  q1: number | null;
  q3: number | null;
}

export async function computeStatistics(
  values: unknown,
  sample: boolean,
): Promise<StatisticsSummary> {
  if (!Array.isArray(values)) throw new Error('Values must be an array.');
  for (let index = 0; index < values.length; index++) {
    if (typeof values[index] !== 'number' || !Number.isFinite(values[index])) {
      throw new Error(`Values[${index}] must be a finite number.`);
    }
  }
  if (!values.length) {
    return {
      count: 0,
      sum: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      variance: null,
      standardDeviation: null,
      q1: null,
      q3: null,
    };
  }

  // This module is called only by the statistics worker in the app.
  const stats = await import(
    /* webpackChunkName: "simple-statistics" */ 'simple-statistics'
  );
  const sorted = stats.numericSort(values);
  const variance = sample
    ? values.length > 1
      ? stats.sampleVariance(values)
      : null
    : stats.variance(values);
  return {
    count: values.length,
    sum: stats.sum(values),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: stats.mean(values),
    median: stats.quantileSorted(sorted, 0.5),
    variance,
    standardDeviation: variance === null ? null : Math.sqrt(variance),
    q1: stats.quantileSorted(sorted, 0.25),
    q3: stats.quantileSorted(sorted, 0.75),
  };
}
