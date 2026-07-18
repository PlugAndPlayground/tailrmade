import { TRgba } from '../../utils/color';
import { PNPCustomStatus } from '../../classes/ErrorClass';
import PPNode from '../../classes/NodeClass';
import PPSocket from '../../classes/SocketClass';
import {
  ERROR_COLOR,
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
  SUCCESS_COLOR,
} from '../../utils/constants';
import { CustomArgs } from '../../utils/interfaces';
import { AnyType } from '../datatypes/anyType';
import { JSONType } from '../datatypes/jsonType';

export class UAssetParser extends PPNode {
  public getName(): string {
    return 'UAsset Parser (uasset-rs)';
  }

  public getDescription(): string {
    return 'Parses Unreal Engine .uasset files and returns JSON description of the file, uses the uasset-rs library';
  }

  public getTags(): string[] {
    return ['File', 'Unreal Engine', 'Parser'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.TRANSFORM);
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(SOCKET_TYPE.IN, 'File Data', new AnyType()),
      new PPSocket(SOCKET_TYPE.OUT, 'JSON', new JSONType()),
    ].concat(super.getDefaultIO());
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const fileData = inputObject['File Data'];

    const wasmModule =
      await import('../../../pnp-webassembly-nodes/pnp_webassembly_nodes');

    await wasmModule.default();

    // Ensure fileData is a Uint8Array
    let uint8Data: Uint8Array = new Uint8Array();
    if (fileData instanceof Uint8Array) {
      uint8Data = fileData;
    } else if (fileData instanceof ArrayBuffer) {
      uint8Data = new Uint8Array(fileData);
    } else if (typeof fileData === 'string') {
      // If it's a string, convert it to Uint8Array
      uint8Data = new TextEncoder().encode(fileData);
    } else {
      this.pushExclusiveStatus(
        new PNPCustomStatus('Failure', ERROR_COLOR, 'statuscode'),
      );
    }
    if (uint8Data.length > 0) {
      this.pushExclusiveStatus(
        new PNPCustomStatus('OK', SUCCESS_COLOR, 'statuscode'),
      );
    }

    const jsonString = wasmModule.parse_uasset(uint8Data);

    // Parse the JSON string to an object
    const jsonObject = JSON.parse(jsonString);

    outputObject['JSON'] = jsonObject;
  }
}
