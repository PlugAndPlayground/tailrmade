import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import {
  NodeExecutionWarning,
  PNPCustomStatus,
} from '../../classes/ErrorClass';
import { wrapDownloadLink } from '../../utils/utils';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { BooleanType } from '../datatypes/booleanType';
import { EnumStructure, EnumType } from '../datatypes/enumType';
import { JSONType } from '../datatypes/jsonType';
import { StringType } from '../datatypes/stringType';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import { CompanionBackend } from '../../services/CompanionBackend';

export const urlInputName = 'URL';
const bodyInputName = 'Body';
const headersInputName = 'Headers';
export const outputContentName = 'Content';
export const sendThroughCompanionName = 'Send Through Companion';
export const companionDefaultAddress = 'http://localhost:6655';
const methodName = 'Method';

export const HTTPMethodOptions: EnumStructure = [
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
].map((val) => {
  return { text: val, value: val };
});

export interface CompanionResponse {
  status: number;
  response: string;
}

export class HTTPNode extends PPNode {
  public getName(): string {
    return 'HTTP';
  }

  public getDescription(): string {
    return 'Make an HTTP request to get data from or send data to a server or API';
  }

  public getAdditionalDescription(): string {
    return `<p>${wrapDownloadLink(
      'https://github.com/magnificus/pnp-companion-2/releases/',
      'Download tailrmade Companion',
    )}</p>`;
  }

  public getAIDocs(): string {
    return `Reference API keys in Headers or URL as $TM_KEY{KEYNAME}, e.g.
Authorization: "Bearer $TM_KEY{OPENAI_KEY}". The value is substituted at
request time and is not stored in the graph.

KEYNAME comes from either:
- The cloud: the logged-in user stores it under "Manage API Keys".
- The companion app: enable "Send Through Companion" and define it as an
  environment variable there.

The user must configure the key in the chosen source.`;
  }

  public getTags(): string[] {
    return ['Input'].concat(super.getTags());
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return !socket.isInput();
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        urlInputName,
        new StringType(),
        'https://tailrmade.app/public/exampleGraphs',
      ),
      new Socket(
        SOCKET_TYPE.IN,
        headersInputName,
        new JSONType(),
        HTTPNode.defaultHeaders,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        methodName,
        new EnumType(HTTPMethodOptions, undefined, true),
        HTTPMethodOptions[0].text,
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        bodyInputName,
        new JSONType(),
        {},
        () => this.getInputData(methodName) !== 'Get',
      ),
      new Socket(
        SOCKET_TYPE.IN,
        sendThroughCompanionName,
        new BooleanType(),
        false,
      ),
      new Socket(SOCKET_TYPE.OUT, outputContentName, new JSONType(), {}),
    ];
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const usingCompanion: boolean = inputObject[sendThroughCompanionName];
    outputObject[outputContentName] = await this.request(
      inputObject[headersInputName],
      usingCompanion
        ? inputObject[bodyInputName]
        : JSON.stringify(inputObject[bodyInputName]), // TODO polish this crap
      inputObject[urlInputName],
      inputObject[methodName],
      usingCompanion,
    );
  }

  protected async request(
    headers: HeadersInit,
    body: BodyInit,
    url: string,
    method: 'Get' | 'Post',
    usingCompanion = false,
  ): Promise<object | string> {
    this.clearStatuses();
    try {
      if (usingCompanion) {
        this.status.custom.push(
          new PNPCustomStatus('Companion', TRgba.white().multiply(0.5)),
        );
        const companionRes = await HTTPNode.sendThroughCompanion(
          headers,
          body,
          url,
          method,
        );

        this.pushStatusCode(companionRes.status);
        const returnResponse = companionRes.response;
        try {
          return JSON.parse(returnResponse);
        } catch (error) {
          return companionRes.response;
        }
      } else {
        // no body if Get
        const bodyToUse: BodyInit = method !== 'Get' ? body : undefined;
        const res = fetch(url, {
          method: method,
          headers: headers,
          body: bodyToUse,
        });
        const awaitedRes = await res;
        this.pushStatusCode(awaitedRes.status);
        return await awaitedRes.json();
      }
    } catch (error) {
      console.trace(error);
      // something went terribly wrong with the request
      this.pushStatusCode(400);
      this.setStatus(
        new NodeExecutionWarning(`${error}
Most likely a header the endpoint rejects — try clearing the Headers input.
Other causes: the endpoint's CORS policy, a wrong URL, or a network error.
If it is a CORS issue, select the HTTP node and in the Info tab on the right download and run the tailrmade Companion app, then enable "Send Through Companion" in this node.`),
      );
      return {};
    }
  }

  static async sendThroughCompanion(
    headers,
    body,
    URL,
    method: 'Get' | 'Post',
  ): Promise<CompanionResponse> {
    try {
      const companionSpecific = {
        finalHeaders: headers,
        finalBody: method == 'Post' ? JSON.stringify(body) : '{}',
        finalURL: URL,
        finalMethod: method,
      };
      const companionRes =
        await CompanionBackend.getInstance().sendMessage(companionSpecific);

      return companionRes;
    } catch (error) {
      return { status: 404, response: error };
    }
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  static getDefaultBearerHeaders(key) {
    return { ...this.getBearerAuthentication(key), ...this.defaultHeaders };
  }
  static getBearerAuthentication(key) {
    return { Authorization: 'Bearer ' + key };
  }

  static readonly defaultHeaders = {
    'Content-Type': 'application/json',
    Authorization: 'Basic $TM_KEY{YOUR_ENVIRONMENTAL_COMPANION_VARIABLE_HERE}',
  };

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(true, false, false, 1000, this);
  }
}
