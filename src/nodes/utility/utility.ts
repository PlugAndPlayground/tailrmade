import debounce from 'lodash/debounce';

import PPGraph from '../../classes/GraphClass';
import InterfaceController from '../../InterfaceController';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import {
  NODE_MARGIN,
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
  TRIGGER_TYPE_OPTIONS,
} from '../../utils/constants';
import {
  imageDataURLToPngBlob,
  isImageDataURL,
  wrapDownloadLink,
} from '../../utils/utils';
import { TRgba } from '../../utils/color';
import { ensureVisible } from '../../pixi/utils-pixi';
import { AbstractType } from '../datatypes/abstractType';
import { AnyType } from '../datatypes/anyType';
import { BooleanType } from '../datatypes/booleanType';
import { DynamicEnumType } from '../datatypes/dynamicEnumType';
import { EnumStructure, EnumType } from '../datatypes/enumType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import { TriggerType } from '../datatypes/triggerType';
import { WidgetButton } from '../widgets/buttons';
import { JSONType } from '../datatypes/jsonType';
import { DynamicImport } from '../../utils/dynamicImport';
import { migrateFromCustomFunctionCommon } from '../data/array';

const rerouteHeight = 48;

export class Reroute extends PPNode {
  public getName(): string {
    return 'Reroute';
  }

  public getDescription(): string {
    return 'Adds a node to reroute connections';
  }

  public getTags(): string[] {
    return ['Canvas'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, 'In', new AnyType()),
      new Socket(SOCKET_TYPE.OUT, 'Out', new AnyType()),
    ];
  }

  public getMinNodeWidth(): number {
    return rerouteHeight;
  }

  public getMinNodeHeight(): number {
    return rerouteHeight;
  }

  get headerHeight(): number {
    return 16;
  }

  public getDrawBackground(): boolean {
    return false;
  }

  public getShowLabels(): boolean {
    return false;
  }

  public getParallelInputsOutputs(): boolean {
    return true;
  }

  public getRoundedCorners(): boolean {
    return false;
  }

  public getShouldShowHoverActions(): boolean {
    return false;
  }

  public getColor(): TRgba {
    return new TRgba(204, 204, 204);
  }

  public drawBackground(): void {
    this._BackgroundGraphicsRef
      .roundRect(
        NODE_MARGIN,
        0,
        this.nodeWidth,
        rerouteHeight,
        rerouteHeight / 2,
      )
      .fill({
        color: this.getColor().hexNumber(),
        alpha: this.getOpacity(),
      });
  }

  protected async onExecute(
    inputObject: unknown,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    outputObject['Out'] = inputObject['In'];
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return true;
  }
}

const selectNodeName = 'Select Node';

const getNodeArrayOptions = () => {
  return () => {
    const nodeArray = Object.values(PPGraph.currentGraph.nodes);
    const nodeArrayOptions = nodeArray.map((node) => {
      return {
        text: `${node.name} (${node.id})`,
        value: node.id,
      };
    });
    return nodeArrayOptions;
  };
};

export class JumpToNode extends WidgetButton {
  public getName(): string {
    return 'Jump to node';
  }

  public getDescription(): string {
    return 'Adds a button which can be used to jump to another node';
  }

  public getTags(): string[] {
    return ['Canvas'];
  }

  onWidgetTrigger = () => {
    const nodeId = getNodeArrayOptions()().find(
      (option) => option.text === this.getInputData(selectNodeName),
    )?.value;
    const nodeToJumpTo = PPGraph.currentGraph.nodes[nodeId];
    if (nodeToJumpTo) {
      void ensureVisible([nodeToJumpTo]);
      setTimeout(() => {
        nodeToJumpTo.renderOutlineThrottled();
      }, 500);
    }
    void this.executeOptimizedChain();
  };

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        selectNodeName,
        new DynamicEnumType(getNodeArrayOptions, () => {}),
        undefined,
        false,
      ),
    ].concat(super.getDefaultIO());
  }
}

const dataToCopyName = 'Input';

export class WriteToClipboard extends PPNode {
  public getName(): string {
    return 'Write to clipboard';
  }

  public getDescription(): string {
    return 'Copies the input value to the clipboard';
  }

  public getTags(): string[] {
    return ['App'].concat(super.getTags());
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 1000, this);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.TRIGGER,
        'Trigger',
        new TriggerType(TRIGGER_TYPE_OPTIONS[1].text),
        undefined,
        true,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        dataToCopyName,
        new StringType(),
        undefined,
        true,
      ),
    ].concat(super.getDefaultIO());
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return true;
  }

  // an image socket carries a data url, which as text/plain would paste as a
  // wall of base64 rather than as the picture
  private static async buildClipboardItem(input: any): Promise<ClipboardItem> {
    if (isImageDataURL(input)) {
      return new ClipboardItem({
        'image/png': await imageDataURLToPngBlob(input),
      });
    }
    return new ClipboardItem({
      'text/plain': new Blob([input], { type: 'text/plain' }),
    });
  }

  protected async onExecute(inputObject: any): Promise<void> {
    const input = inputObject[dataToCopyName];
    if (!navigator.clipboard || !window.ClipboardItem) {
      return;
    }
    try {
      await navigator.clipboard.write([
        await WriteToClipboard.buildClipboardItem(input),
      ]);
    } catch (error) {
      console.error('Writing to clipboard failed:', error);
      InterfaceController.showSnackBar(
        `Could not write to the clipboard. ${(error as Error).message}`,
        { variant: 'error' },
      );
    }
  }
}

export class ThrottleDebounce extends PPNode {
  passThroughDebounced;

  public getName(): string {
    return 'Throttle/Debounce';
  }

  public getDescription(): string {
    return 'Limits how often the value is passed through';
  }

  public getTags(): string[] {
    return ['Logic'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.TRANSFORM);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, 'In', new AnyType()),
      new Socket(
        SOCKET_TYPE.IN,
        'Update',
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'updateDebounceFunction'),
        undefined,
        false,
      ),
      new Socket(SOCKET_TYPE.IN, 'Wait', new NumberType(), 1000, false),
      new Socket(
        SOCKET_TYPE.IN,
        'Max Wait',
        new NumberType(),
        undefined,
        false,
      ),
      new Socket(SOCKET_TYPE.IN, 'Leading', new BooleanType(), false, false),
      new Socket(SOCKET_TYPE.IN, 'Trailing', new BooleanType(), true, false),
      new Socket(SOCKET_TYPE.OUT, 'Out', new AnyType()),
    ];
  }
  public updateDebounceFunction(): void {
    const passThrough = (input: unknown) => {
      this.setOutputData('Out', input);
      void this.executeChildren();
    };

    this.passThroughDebounced?.cancel();
    this.passThroughDebounced = debounce(
      passThrough,
      this.getInputData('Wait'),
      {
        maxWait: this.getInputData('Max Wait'),
        leading: this.getInputData('Leading'),
        trailing: this.getInputData('Trailing'),
      },
    );
  }

  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    if (this.passThroughDebounced === undefined) {
      this.updateDebounceFunction();
    }
    const input = inputObject['In'];
    this.passThroughDebounced(input);
    // Don't set output here - let the debounced function handle it
    return Promise.resolve();
  }
}

export class LoadNPM extends PPNode {
  public getName(): string {
    return 'Load NPM package';
  }

  public getDescription(): string {
    return 'Lazy loads an NPM package';
  }

  public getTags(): string[] {
    return ['Input'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, 'Package Name', new StringType()),
      new Socket(SOCKET_TYPE.OUT, 'NpmPackage', new AnyType()),
    ];
  }

  protected getOutputParameterName(): string {
    return 'NpmPackage';
  }

  protected getOutputParameterType(): AbstractType {
    return new AnyType();
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 1000, this);
  }

  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    const packageName = inputObject['Package Name'];
    const npmPackage = await DynamicImport.dynamicImport(packageName);
    outputObject['NpmPackage'] = npmPackage;
  }

  public getVersion(): number {
    return 6;
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion < 6) {
      migrateFromCustomFunctionCommon(this);
      this.setInputData('Package Name', this.getInputData('packageName'));
      await this.replaceSocketWithOtherSocket(
        this.getInputSocketByName('packageName'),
        this.getInputSocketByName('Package Name'),
      );
    }
  }
}

const hashMethodName = 'Hash method';
const parameterName1 = 'Data';
const parameterName2 = 'Key';
const hashFunctionName = 'Hash function';
const outputSocketName = 'Output';
const outputPackageName = 'Module';

const methods: EnumStructure = [
  { text: 'adler32' },
  { text: 'argon2Verify' },
  { text: 'argon2d' },
  { text: 'argon2i' },
  { text: 'argon2id' },
  { text: 'bcrypt' },
  { text: 'bcryptVerify' },
  { text: 'blake2b' },
  { text: 'blake2s' },
  { text: 'blake3' },
  { text: 'crc32' },
  { text: 'crc32c' },
  { text: 'createHMAC' },
  { text: 'keccak' },
  { text: 'md4' },
  { text: 'md5' },
  { text: 'pbkdf2' },
  { text: 'ripemd160' },
  { text: 'scrypt' },
  { text: 'sha1' },
  { text: 'sha224' },
  { text: 'sha256' },
  { text: 'sha3' },
  { text: 'sha384' },
  { text: 'sha512' },
  { text: 'sm3' },
  { text: 'whirlpool' },
  { text: 'xxhash128' },
  { text: 'xxhash3' },
  { text: 'xxhash32' },
  { text: 'xxhash64' },
];

const createHashFunctions: EnumStructure = [
  { text: 'createAdler32' },
  { text: 'createBLAKE2b' },
  { text: 'createBLAKE2s' },
  { text: 'createBLAKE3' },
  { text: 'createCRC32' },
  { text: 'createCRC32C' },
  { text: 'createKeccak' },
  { text: 'createMD4' },
  { text: 'createMD5' },
  { text: 'createRIPEMD160' },
  { text: 'createSHA1' },
  { text: 'createSHA224' },
  { text: 'createSHA256' },
  { text: 'createSHA3' },
  { text: 'createSHA384' },
  { text: 'createSHA512' },
  { text: 'createSM3' },
  { text: 'createWhirlpool' },
  { text: 'createXXHash128' },
  { text: 'createXXHash3' },
  { text: 'createXXHash32' },
  { text: 'createXXHash64' },
];

const IMPORT_NAME = 'hash-wasm@4.11.0';

export class Hash extends PPNode {
  onOptionChange?: (value: string) => void;

  public getName(): string {
    return 'Hash calculator';
  }

  public getDescription(): string {
    return 'Create a wide range of cryptographic hashes (SHA, BLAKE, bcrypt, HMAC and more)';
  }

  public getAdditionalDescription(): string {
    return `<p>This node uses the ${wrapDownloadLink(
      'https://github.com/Daninet/hash-wasm',
      'hash-wasm',
    )} library. Check out its documentation for more details.</p>`;
  }

  public getTags(): string[] {
    return ['Input'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(true, true, false, 1000, this);
  }

  protected getDefaultIO(): Socket[] {
    const onOptionChange = (value) => {
      this.setNodeName(value);
    };
    return [
      new Socket(
        SOCKET_TYPE.IN,
        hashMethodName,
        new EnumType(methods, (value) => onOptionChange(value)),
        'sha256',
        false,
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        hashFunctionName,
        new EnumType(createHashFunctions),
        'createSHA1',
        () => this.getInputData(hashMethodName) === 'createHMAC',
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        parameterName2,
        new StringType(),
        'key',
        () => this.getInputData(hashMethodName) === 'createHMAC',
      ),
      new Socket(
        SOCKET_TYPE.IN,
        parameterName1,
        new StringType(),
        'data',
        true,
      ),
      new Socket(SOCKET_TYPE.OUT, outputSocketName, new StringType(), '', true),
      new Socket(
        SOCKET_TYPE.OUT,
        outputPackageName,
        new JSONType(),
        DynamicImport.tryGetImportImmediately(IMPORT_NAME),
        false,
      ),
    ];
  }

  protected async onExecute(input, output): Promise<void> {
    const hashMethodValue = input[hashMethodName];
    const hashPackage = await DynamicImport.dynamicImport(IMPORT_NAME);
    if (hashMethodValue === 'createHMAC') {
      const hasher = hashPackage[input[hashFunctionName]]();
      const hmac = await hashPackage[hashMethodValue](
        hasher,
        input[parameterName2],
      );
      hmac.update(input[parameterName1]);
      output[outputSocketName] = await hmac.digest();
    } else {
      output[outputSocketName] = await hashPackage[hashMethodValue](
        input[parameterName1],
      );
    }
  }

  public getDynamicImports(): string[] {
    return [IMPORT_NAME];
  }
}
