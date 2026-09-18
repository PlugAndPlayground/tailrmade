import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { SOCKET_TYPE } from '../../utils/constants';
import { ArrayType } from '../datatypes/arrayType';
import { AnyType } from '../datatypes/anyType';
import { BooleanType } from '../datatypes/booleanType';
import { JSONType } from '../datatypes/jsonType';
import { StatisticsWorkerClient } from './statistics/StatisticsWorkerClient';

const outputs = {
  Count: 'count',
  Sum: 'sum',
  Min: 'min',
  Max: 'max',
  Mean: 'mean',
  Median: 'median',
  Variance: 'variance',
  'Standard Deviation': 'standardDeviation',
  Q1: 'q1',
  Q3: 'q3',
} as const;

export class Statistics extends PPNode {
  private statisticsWorker = new StatisticsWorkerClient(
    () =>
      new Worker(new URL('./statistics/statistics-worker.ts', import.meta.url)),
  );

  public getName(): string {
    return 'Statistics';
  }
  public getDescription(): string {
    return 'Summary statistics using lazy-loaded Simple Statistics in a Web Worker.';
  }
  public getTags(): string[] {
    return ['Data', 'Analytics'].concat(super.getTags());
  }
  public getAIDocs(): string {
    return `Use this node for descriptive statistics instead of main-thread custom code.
Connect a numeric array to "Values". "Sample" selects sample variance (n-1);
otherwise population variance (n) is used. The library loads inside a worker.
"Summary" returns count, sum, min, max, mean, median, variance,
standardDeviation, q1, q3. Quartiles use linear interpolation (type 7).
Each metric also has its own output socket.
Empty arrays return count/sum 0 and null for other metrics. Sample variance
and standard deviation are null for a single value. Non-finite values and
non-numbers are errors; clean missing values explicitly upstream.`;
  }
  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, 'Values', new ArrayType(), []),
      new Socket(SOCKET_TYPE.IN, 'Sample', new BooleanType(), false),
      new Socket(SOCKET_TYPE.OUT, 'Summary', new JSONType()),
      ...Object.keys(outputs).map(
        (name) => new Socket(SOCKET_TYPE.OUT, name, new AnyType()),
      ),
    ];
  }
  protected async onExecute(input: any, output: any): Promise<void> {
    const summary = await this.statisticsWorker.compute(
      input.Values,
      input.Sample,
    );
    output.Summary = summary;
    for (const [name, key] of Object.entries(outputs))
      output[name] = summary[key];
  }
  public onNodeRemoved = (): void => {
    this.statisticsWorker.dispose();
  };
}
