import PPNode from '../../../classes/NodeClass';
import Socket from '../../../classes/SocketClass';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../../utils/constants';
import { TRgba } from '../../../utils/color';
import { GraphInputPointXY, GraphInputXYType } from '../../datatypes/graphInputType';
import { NumberType } from '../../datatypes/numberType';
import { inputDataName } from './scatterGraph';

export const outputTrendFunctionM = 'Trend Function M';
export const outputTrendFunctionB = 'Trend Function B';
export const outputTrendFunctionM_CI_Lower = 'Trend M CI Lower';
export const outputTrendFunctionM_CI_Upper = 'Trend M CI Upper';
export const outputTrendFunctionB_CI_Lower = 'Trend B CI Lower';
export const outputTrendFunctionB_CI_Upper = 'Trend B CI Upper';

export function calculateTrendLine(
  inputData: GraphInputPointXY[],
): [
  number,
  number,
  [number, number],
  [number, number],
] {
  const n = inputData.length;

  if (n === 0) {
    return [0,0,[0,0],[0,0]];
  }

  // Calculate sums
  const sumX = inputData.reduce((sum, point) => sum + point.Value1, 0);
  const sumY = inputData.reduce((sum, point) => sum + point.Value2, 0);
  const sumXY = inputData.reduce(
    (sum, point) => sum + point.Value1 * point.Value2,
    0,
  );
  const sumXSquared = inputData.reduce(
    (sum, point) => sum + point.Value1 * point.Value1,
    0,
  );

  // Calculate slope (m) and y-intercept (b)
  // Denominator for m
  const mDenominator = n * sumXSquared - sumX * sumX;

  if (mDenominator === 0) {
    // All X values are likely the same, or n=1 and sumXSquared = sumX*sumX (which is always true for n=1)
    // Vertical line or single point - cannot calculate a unique slope or meaningful CIs
    // For a single point, slope is indeterminate, intercept could be Y value if X is 0.
    // For multiple points with same X, it's a vertical line, infinite slope.
    // We'll return NaN for m and b, and null for CIs.
    const calculatedM = NaN;
    const calculatedB = n === 1 ? (inputData[0].Value1 === 0 ? inputData[0].Value2 : NaN) : NaN;
    return [calculatedM, calculatedB, [NaN, NaN], [NaN, NaN]];
  }

  const calculatedM = (n * sumXY - sumX * sumY) / mDenominator;
  const calculatedB = (sumY - calculatedM * sumX) / n;

  if (n <= 2) {
    // Not enough data points to calculate confidence intervals (degrees of freedom n-2 <= 0)
    return [calculatedM, calculatedB, [NaN, NaN], [NaN, NaN]];
  }

  // Calculate Sum of Squared Errors (SSE)
  let sse = 0;
  for (const point of inputData) {
    const predictedY = calculatedM * point.Value1 + calculatedB;
    sse += (point.Value2 - predictedY) ** 2;
  }

  // Standard Error of the Estimate (SEE or RSE)
  const degreesOfFreedom = n - 2;
  const see = Math.sqrt(sse / degreesOfFreedom);

  // Sum of squared differences for X (Sum(X_i - meanX)^2)
  // sumXSquared - (sumX * sumX) / n  which is mDenominator / n
  const sumSqDiffX = mDenominator / n;


  if (sumSqDiffX === 0) {
    // This case should have been caught by mDenominator === 0, but as a safeguard
    return [calculatedM, calculatedB, [NaN, NaN], [NaN, NaN]];
  }

  // Standard Error for slope (m)
  const seM = see / Math.sqrt(sumSqDiffX);

  // Standard Error for y-intercept (b)
  const meanX = sumX / n;
  const seB = see * Math.sqrt(1 / n + (meanX * meanX) / sumSqDiffX);

  // t-critical value for 95% CI (df = n-2).
  // For simplicity, using 1.96 (z-value for large n).
  // A more accurate approach would use a t-distribution lookup.
  const tCritical = 1.96; // Placeholder for t-distribution value

  const mConfidenceInterval: [number, number] = [
    calculatedM - tCritical * seM,
    calculatedM + tCritical * seM,
  ];

  const bConfidenceInterval: [number, number] = [
    calculatedB - tCritical * seB,
    calculatedB + tCritical * seB,
  ];

  return [calculatedM, calculatedB, mConfidenceInterval, bConfidenceInterval];
}


export class TrendLine extends PPNode {
  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.DRAW);
  }

  public getName(): string {
    return 'Calculate Trend Line';
  }

  public getDescription(): string {
    return 'Uses graph input and calculates the minimal square distance linear trend line';
  }

  public getTags(): string[] {
    return ['Input'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputDataName, new GraphInputXYType()),
      new Socket(SOCKET_TYPE.OUT, outputTrendFunctionM, new NumberType()),
      new Socket(SOCKET_TYPE.OUT, outputTrendFunctionB, new NumberType()),
      new Socket(SOCKET_TYPE.OUT, outputTrendFunctionM_CI_Lower, new NumberType()),
      new Socket(SOCKET_TYPE.OUT, outputTrendFunctionM_CI_Upper, new NumberType()),
      new Socket(SOCKET_TYPE.OUT, outputTrendFunctionB_CI_Lower, new NumberType()),
      new Socket(SOCKET_TYPE.OUT, outputTrendFunctionB_CI_Upper, new NumberType())
    ].concat(super.getDefaultIO());
  }

  public async onExecute(input,output): Promise<void> {
    const points = input[inputDataName];
    const [m, b, mCI, bCI] = calculateTrendLine(points);
    output[outputTrendFunctionM] = m;
    output[outputTrendFunctionB] = b;

    output[outputTrendFunctionM_CI_Lower] = mCI[0];
    output[outputTrendFunctionM_CI_Upper] = mCI[1];

    output[outputTrendFunctionB_CI_Lower] = bCI[0];
    output[outputTrendFunctionB_CI_Upper] = bCI[1];

  };
}
