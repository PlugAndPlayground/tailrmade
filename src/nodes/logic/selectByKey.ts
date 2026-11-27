import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { SOCKET_TYPE } from '../../utils/constants';
import { TNodeSource } from '../../utils/interfaces';
import { AnyType } from '../datatypes/anyType';
import { BOOLEAN_COLOR } from '../datatypes/booleanType';
import { StringType } from '../datatypes/stringType';
import {
  casesName,
  defaultName,
  FIXED_INPUTS,
  keyName,
  matchCase,
  parseCases,
} from './selectCases';

const outputName = 'Output';

// what "Type of" reports for the values a form edits
const DEFAULT_CASES = 'String, Number, Boolean';

export class SelectByKey extends PPNode {
  public getName(): string {
    return 'Select by key';
  }

  public getDescription(): string {
    return 'Passes through the input whose name matches a key';
  }

  public getDocs(): string {
    return `A switch with any number of cases. "${casesName}" lists the case names,
separated by commas, and each one gets an input of that name. "${outputName}"
is the input whose name matches "${keyName}", ignoring upper and lower case,
or "${defaultName}" when none does.

The default cases are what "Type of" reports for text, numbers and on/off
values, so with "Type of" feeding "${keyName}" it picks the value of whichever
widget suits the data, as a settings form needs.

Removing a name from "${casesName}" removes its input once nothing is
connected to it.`;
  }

  public getTags(): string[] {
    return ['Logic'].concat(super.getTags());
  }

  public getColor() {
    return BOOLEAN_COLOR.multiply(0.8);
  }

  // each case carries its own kind of value, and the output whichever is picked
  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return false;
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, keyName, new StringType(), 'String'),
      new Socket(
        SOCKET_TYPE.IN,
        casesName,
        new StringType(),
        DEFAULT_CASES,
        false,
      ),
      new Socket(SOCKET_TYPE.IN, defaultName, new AnyType(), null),
      ...parseCases(DEFAULT_CASES).map(
        (name) => new Socket(SOCKET_TYPE.IN, name, new AnyType(), null),
      ),
      new Socket(SOCKET_TYPE.OUT, outputName, new AnyType()),
    ];
  }

  public async onNodeAdded(source: TNodeSource): Promise<void> {
    await super.onNodeAdded(source);
    this.adaptCaseSockets();
  }

  private getCases(): string[] {
    return parseCases(this.getInputData(casesName));
  }

  // one input per case; an input that is no longer a case goes once unplugged
  private adaptCaseSockets(): void {
    const cases = this.getCases();
    const stale = this.inputSocketArray.filter(
      (socket) =>
        !FIXED_INPUTS.includes(socket.name) &&
        !cases.includes(socket.name) &&
        !socket.hasLink(),
    );
    const missing = cases.filter((name) => !this.getInputSocketByName(name));
    if (stale.length === 0 && missing.length === 0) {
      return;
    }
    stale.forEach((socket) => this.removeSocket(socket));
    missing.forEach((name) =>
      this.addInput(name, new AnyType(), null, true, {}, false),
    );
    const order = [...FIXED_INPUTS, ...cases];
    const rank = (socket: Socket) => {
      const index = order.indexOf(socket.name);
      return index === -1 ? order.length : index;
    };
    this.inputSocketArray.sort((a, b) => rank(a) - rank(b));
    this.metaInfoChanged();
    this.resizeAndDraw();
  }

  public inputUnplugged(socket: Socket): void {
    super.inputUnplugged(socket);
    this.adaptCaseSockets();
  }

  // like If/Then/Else, only the picked case runs what feeds it
  public shouldPropagateExecutionThrough(socket: Socket): boolean {
    if (
      FIXED_INPUTS.includes(socket.name) ||
      !PPGraph.currentGraph.graphConfiguredAndReady
    ) {
      return true;
    }
    return (
      matchCase(this.getCases(), this.getInputData(keyName)) === socket.name
    );
  }

  protected async onExecute(
    input: Record<string, unknown>,
    output: Record<string, unknown>,
  ): Promise<void> {
    this.adaptCaseSockets();
    const picked = matchCase(this.getCases(), input[keyName]);
    output[outputName] =
      picked === undefined
        ? input[defaultName]
        : this.getInputData(picked);
  }
}
