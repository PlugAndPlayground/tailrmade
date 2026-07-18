import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import { SOCKET_TYPE } from '../../utils/constants';
import { NumberType } from '../datatypes/numberType';
import { TriggerType } from '../datatypes/triggerType';

export default class Sequence extends PPNode {
  public getName() {
    return 'Sequence';
  }

  // this needs to execute last because it itself starts new executions, need everything feeding into that to be ready
  public executionOrder(): number {
    return 10;
  }
  public getDescription(): string {
    return 'Fire output triggers in order from top to bottom.';
  }

  public getTags(): string[] {
    return ['Trigger'];
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.TRIGGER, 'Trigger', new TriggerType()),
      new Socket(SOCKET_TYPE.OUT, 'Sequence 0', new NumberType()),
    ];
  }

  public addDefaultOutput(): void {
    this.addOutput(
      this.constructSocketName('Sequence', this.outputSocketArray),
      new NumberType(),
    );
  }

  public async outputPlugged(socket: Socket): Promise<void> {
    await super.outputPlugged(socket);

    const last = this.outputSocketArray[this.outputSocketArray.length - 1];
    // if furthest down parameter is plugged in, add a new one
    if (last.hasLink()) {
      this.addDefaultOutput();
    }
    this.debounceDrawShape();
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    // set all outputs to 1 then 0
    for (let i = 0; i < this.outputSocketArray.length; i++) {
      await this.outputSocketArray[i].setDataAndWait(0);
      await this.outputSocketArray[i].setDataAndWait(1);
    }
    return;
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(true, false, false, 1000, this);
  }
}
