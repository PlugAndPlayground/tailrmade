import { NodeExecutionWarning } from '../../classes/ErrorClass';
import { NavigationRisk, NodeRisk, isSameOrigin } from '../../classes/NodeRisk';
import {
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
  URL_PARAMETER_NAME,
} from '../../utils/constants';
import { TRgba } from '../../utils/color';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { AnyType } from '../datatypes/anyType';
import { BooleanType } from '../datatypes/booleanType';
import { StringType } from '../datatypes/stringType';
import { migrateFromCustomFunctionCommon } from '../data/array';

const URLName = 'url';

const keyName = 'Key';
const defaultName = 'Default';
const valueName = 'Value';
const foundName = 'Found';

const reservedNames = new Set(Object.values(URL_PARAMETER_NAME));

const unwrapSingle = (values: unknown[]): unknown =>
  values.length > 1 ? values : values[0];

// Hash values replace query values with the same name, like getURLParameters,
// but every repeat is kept so repeated keys can come out as an array.
export function readURLParameters(
  search: string,
  hash: string,
): Map<string, string[]> {
  const parameters = new Map<string, string[]>();
  for (const source of [search, hash.replace(/^#/, '')]) {
    const sourceValues = new Map<string, string[]>();
    new URLSearchParams(source).forEach((value, name) => {
      if (!reservedNames.has(name)) {
        sourceValues.set(name, [...(sourceValues.get(name) ?? []), value]);
      }
    });
    sourceValues.forEach((values, name) => parameters.set(name, values));
  }
  return parameters;
}

export class OpenURL extends PPNode {
  public getRisks(): NodeRisk[] {
    const url = this.getStaticInputData(URLName);
    if (url.known && isSameOrigin(url.value)) return [];
    return [new NavigationRisk(url.value)];
  }

  // Opening a URL is an external effect.
  public getSeemsUnused(): boolean {
    return false;
  }

  protected getDefaultIO(): Socket[] {
    return [new Socket(SOCKET_TYPE.IN, URLName, new StringType())];
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    let url: URL;
    try {
      const value = input[URLName];
      if (typeof value !== 'string' || !value.trim()) throw new Error();
      url = new URL(value, document.baseURI);
    } catch {
      throw new NodeExecutionWarning('Enter a valid HTTP or HTTPS URL.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new NodeExecutionWarning(
        'Open URL only supports HTTP and HTTPS links.',
      );
    }
    window.open(url.href, '_blank', 'noopener,noreferrer');
  }

  public getName(): string {
    return 'Open URL';
  }

  public getDescription(): string {
    return 'Opens a URL in a new tab';
  }

  public getTags(): string[] {
    return ['App'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.SYSTEM);
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 1000, this);
  }
  public getVersion(): number {
    return 4;
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion <= 3) {
      migrateFromCustomFunctionCommon(this);
    }
  }
}

export class URLParameter extends PPNode {
  public getName(): string {
    return 'URL Parameter';
  }

  public getDescription(): string {
    return 'Reads a parameter from the address the app was opened with';
  }

  public getDocs(): string {
    return `Reads parameters from the app's address, so one app can be shared as
links that open it differently, for example ?city=Vienna or #page=2. The query
and the part after # are both read, and # wins when both carry a name.

"Key" picks the parameter. Leave it empty to get every parameter as an object.
Values are text, which Number and JSON inputs convert on arrival. A name that
appears more than once comes out as an array.

"Found" is true when the address has the parameter. Without the parameter, "Value" is "Default".

Tailrmade's own parameters, such as loadGraph, are never reported.`;
  }

  public getTags(): string[] {
    return ['App'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, keyName, new StringType(), ''),
      new Socket(SOCKET_TYPE.IN, defaultName, new AnyType(), ''),
      new Socket(SOCKET_TYPE.OUT, valueName, new AnyType()),
      new Socket(SOCKET_TYPE.OUT, foundName, new BooleanType()),
    ];
  }

  protected async onExecute(
    input: Record<string, any>,
    output: Record<string, unknown>,
  ): Promise<void> {
    const parameters = readURLParameters(
      window.location.search,
      window.location.hash,
    );
    const key = input[keyName];
    if (!key) {
      output[valueName] = Object.fromEntries(
        [...parameters].map(([name, values]) => [name, unwrapSingle(values)]),
      );
      output[foundName] = parameters.size > 0;
      return;
    }
    const values = parameters.get(key);
    output[foundName] = values !== undefined;
    output[valueName] = values ? unwrapSingle(values) : input[defaultName];
  }
}
