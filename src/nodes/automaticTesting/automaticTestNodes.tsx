import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import InterfaceController from '../../InterfaceController';
import { SOCKET_TYPE } from '../../utils/constants';
import { BooleanType } from '../datatypes/booleanType';
import { StringType } from '../datatypes/stringType';

const conditionName = 'Condition';
const descriptionName = 'Test Description';

abstract class TEST extends PPNode {
  public getTags(): string[] {
    return ['Test'];
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, conditionName, new BooleanType()),
      new Socket(SOCKET_TYPE.IN, descriptionName, new StringType()),
    ];
  }
}

export class TEST_PotentiallyFail extends TEST {
  public getName() {
    return 'Potentially Fail Test';
  }
  public getDescription(): string {
    return 'Evokes test failure if the incoming condition is fulfilled';
  }

  protected onExecute(input: any, output: any): Promise<void> {
    if (input[conditionName]) {
      console.log('Test Failure: ' + new Error().stack);
      InterfaceController.showSnackBar(
        input[descriptionName] + ': Test Failure!',
      );
    }
    return;
  }
}

export class TEXT_PotentiallySucceed extends TEST {
  public getName() {
    return 'Potentially Pass Test';
  }
  public getDescription(): string {
    return 'Evokes test success if the incoming condition is fulfilled';
  }

  protected onExecute(input: any, output: any): Promise<void> {
    if (input[conditionName]) {
      InterfaceController.showSnackBar(
        input[descriptionName] + ': Test Success!',
      );
    }
    return;
  }
}
