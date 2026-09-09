import PPNode, { SmallNode } from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { TRgba } from '../../utils/color';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { CustomArgs, TNodeSource } from '../../utils/interfaces';
import { parseValueAndAttachWarnings } from '../../utils/utils';
import { AbstractType } from '../datatypes/abstractType';
import { AnyType } from '../datatypes/anyType';
import { ArrayType } from '../datatypes/arrayType';
import { StringType } from '../datatypes/stringType';
import { CodeType } from '../datatypes/codeType';
import { NumberType } from '../datatypes/numberType';
import {
  CONSTANT_NAME,
  ENTIRE_OBJECT_NAME,
  INDEX_NAME,
} from '../datatypes/inputArrayKeysType';
import { BooleanType } from '../datatypes/booleanType';
import PPGraph from '../../classes/GraphClass';
import { NodeConfigurationWarning, PNPSuccess } from '../../classes/ErrorClass';
import { PNPWorker } from './worker/PNPWorker';
import { BackPropagation } from '../../interfaces';

export const arrayName = 'Array';
const typeName = 'Type';
const arrayOutName = 'Out';

export const anyCodeName = 'Code';
export const initialValueName = 'Initial Value';
export const allowFullAccessName = 'Main Thread';
const outDataName = 'OutData';

const constantInName = 'In';
const constantOutName = 'Out';

const constantDefaultData = 0;

export class Constant extends PPNode {
  public getName(): string {
    return 'Constant';
  }

  public getDescription(): string {
    return 'Provides a constant input';
  }

  public getTags(): string[] {
    return ['Input'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        constantInName,
        new AnyType(),
        constantDefaultData,
      ),
      new Socket(SOCKET_TYPE.OUT, constantOutName, new AnyType()),
    ];
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    outputObject[constantOutName] = inputObject?.[constantInName];
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return true;
  }

  protected getBackPropagationTargets(): BackPropagation {
    return { SocketToGetValue: this.getInputSocketByName(constantInName) };
  }
}

export class ParseArray extends PPNode {
  public getName(): string {
    return 'Parse array';
  }

  public getDescription(): string {
    return 'Convert every element in an array to another data type.';
  }

  public getTags(): string[] {
    return ['Array'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, arrayName, new ArrayType(), []),
      new Socket(SOCKET_TYPE.IN, typeName, new NumberType(), 1),
      new Socket(SOCKET_TYPE.OUT, arrayOutName, new ArrayType()),
    ];
  }
  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const inputArray = inputObject[arrayName];
    outputObject[arrayOutName] = inputArray.map((element) => {
      const socket = this.getSocketByName(typeName);
      const value = parseValueAndAttachWarnings(this, socket.dataType, element);
      return value;
    });
  }
}

export class ConsolePrint extends PPNode {
  public getName(): string {
    return 'Console print';
  }

  public getDescription(): string {
    return 'Logs the input in the console, prefixed with the node name';
  }

  public getTags(): string[] {
    return ['Debug'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.OUTPUT);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        constantInName,
        new StringType(),
        'Hello from console',
      ),
    ];
  }

  protected async onExecute(inputObject: any): Promise<void> {
    console.log(`[${this.name}]`, inputObject[constantInName]);
  }
}

export function arrayEntryToSelectedValue(
  arrayEntry: any,
  selection: string,
  index = -1,
  constant = 0,
) {
  if (selection == ENTIRE_OBJECT_NAME) {
    return arrayEntry;
  } else if (selection == INDEX_NAME) {
    return index;
  } else if (selection == CONSTANT_NAME) {
    return constant;
  } else {
    return arrayEntry[selection];
  }
}

function normalizeToArrowFunction(input: string): string {
  let s = input.trim();
  s = s.replace(/^async\s+/, '');
  s = s.replace(/^function\s*\w*\s*(?=\()/, '');
  s = s.replace(/^([a-zA-Z_$]\w*)\s*=>/, '($1) =>');
  s = s.replace(/^(\([^)]*\))\s*({)/, '$1 => $2');
  const arrowMatch = s.match(/^(\([^)]*\))\s*=>\s*/);
  if (arrowMatch) {
    const afterArrow = s.slice(arrowMatch[0].length).trim();
    if (!afterArrow.startsWith('{')) {
      s = arrowMatch[0] + '{ return ' + afterArrow.replace(/;$/, '') + '; }';
    }
  }
  return s;
}

function getArgumentsFromFunction(inputFunction: string): string[] {
  const normalized = normalizeToArrowFunction(inputFunction);
  const argumentsRegex = /(\(.*?\))/;
  const match = normalized.match(argumentsRegex);
  if (!match) {
    return [];
  }
  const res = match[0];
  const cleaned = res.replace('(', '').replace(')', '');
  let codeArguments = cleaned.split(',').filter((clean) => clean.length);
  codeArguments = codeArguments
    .map((argument) => argument.split('=')[0].trim())
    .filter((argument) => argument !== '');
  return [...new Set(codeArguments)];
}

function getFunctionFromFunction(inputFunction: string): string {
  const normalized = normalizeToArrowFunction(inputFunction);
  const functionRegex = /({(.|\s)*})/;
  const match = normalized.match(functionRegex);
  if (!match) {
    return '{}';
  }
  return match[0];
}

const MACRO_CALL_REGEX = /\bmacro\s*\(/;

// customfunction does any number of inputs but only one output for simplicity
export class CustomFunction extends PPNode {
  previousUserInput = '';
  functionWithVariablesFromInputObject = '';

  public getName(): string {
    return 'Custom function';
  }

  public getDescription(): string {
    return 'Run a custom JavaScript function. Function parameters become input sockets.';
  }

  public getAIDocs(): string {
    return `The Code input defines a JavaScript function whose parameters become
input sockets. Set Code before configuring or connecting those sockets because
they do not exist until the code defines them.

The function's return value becomes the node's output.

It cannot be placed on a UI surface directly. To display a DOM element
(canvas, SVG, or div), connect its output to an Element Renderer; see that
node's docs for the pattern.`;
  }

  // Catches the classic "connected before finalizing the code" mistake: a link
  // sits on a socket whose name is no longer a function parameter, so its data
  // is silently ignored while the real parameter socket reads its default. Sets
  // a node status (surfaced in the inspector and via inspect_warnings_and_errors)
  // instead of failing, since the node still runs. Recomputed after every
  // execution and connection change; clears itself once the wiring is correct.
  private updateConfigurationStatus(): void {
    const code = this.getInputData(anyCodeName);
    const params =
      typeof code === 'string' ? getArgumentsFromFunction(code) : [];
    const orphans = this.getAllNonDefaultInputSockets().filter(
      (socket) => socket.links.length > 0 && !params.includes(socket.name),
    );
    if (orphans.length === 0) {
      if (this.status.node instanceof NodeConfigurationWarning) {
        this.setStatus(new PNPSuccess());
      }
      return;
    }
    const paramList = params.length ? `"${params.join('", "')}"` : '(none)';
    const names = orphans.map((socket) => `"${socket.name}"`).join(', ');
    this.setStatus(
      new NodeConfigurationWarning(
        `${names} ${orphans.length > 1 ? 'are' : 'is'} connected but not a parameter of the function (parameters: ${paramList}), so the data is ignored and the function reads undefined for it.
Parameter names become sockets and a link does not follow a renamed parameter — reconnect to the intended parameter socket.`,
      ),
    );
  }

  public getTags(): string[] {
    return ['Function'].concat(super.getTags());
  }

  public hasExample(): boolean {
    return true;
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        anyCodeName,
        new CodeType(),
        this.getDefaultFunction(),
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        allowFullAccessName,
        new BooleanType(),
        false,
        false,
      ),
      new Socket(
        SOCKET_TYPE.OUT,
        this.getOutputParameterName(),
        this.getOutputParameterType(),
      ),
      new Socket(
        SOCKET_TYPE.OUT,
        anyCodeName,
        new CodeType(),
        '',
        this.getOutputCodeVisibleByDefault(),
      ),
    ];
  }

  public isCallingMacro(macroName: string): boolean {
    return this.getInputData(anyCodeName)
      ?.replaceAll("'", '"') // this question mark is ugly... but it might be called before node gets the input data
      .includes('acro("' + macroName);
  }

  public static replaceMacroNameInCode(oldCode, oldName, newName): string {
    const replaceMacro = (code: string, quote: string) =>
      code.replace(
        new RegExp(`macro\\(${quote}${oldName}${quote}([^)]*)\\)`, 'g'),
        `macro(${quote}${newName}${quote}$1)`,
      );

    return replaceMacro(replaceMacro(oldCode, '"'), "'");
  }

  public calledMacroChangedName(oldName: string, newName: string): void {
    if (!this.getInputSocketByName(anyCodeName).links.length) {
      this.setInputData(
        anyCodeName,
        CustomFunction.replaceMacroNameInCode(
          this.getInputData(anyCodeName),
          oldName,
          newName,
        ),
      );
    }
  }

  protected getDefaultParameterValues(): Record<string, any> {
    return {};
  }

  protected getDefaultParameterTypes(): Record<string, AbstractType> {
    return {};
  }

  protected getOutputParameterType(): AbstractType {
    return new AnyType();
  }

  protected getOutputParameterName(): string {
    return outDataName;
  }

  protected getOutputCodeVisibleByDefault(): boolean {
    return false;
  }

  protected getDefaultFunction(): string {
    return '(a) => {\n\treturn a;\n}';
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.DEFAULT);
  }

  public async onNodeAdded(source: TNodeSource): Promise<void> {
    await super.onNodeAdded(source);
    // added this to make sure all sockets are in place before anything happens (caused visual issues on load before)
    if (this.getInputData(anyCodeName) !== undefined) {
      this.potentiallyUpdateFunctionAndSockets(this.getInputData(anyCodeName));
    }
  }

  public inputUnplugged(socket: Socket): void {
    this.adaptInputs(this.previousUserInput);
    super.inputUnplugged(socket);
    this.updateConfigurationStatus();
  }

  public inputPlugged(socket: Socket): void {
    super.inputPlugged(socket);
    this.updateConfigurationStatus();
  }

  // returns true if there was a socket change
  private potentiallyUpdateFunctionAndSockets(code: string): boolean {
    let codeChangeFound = code !== this.previousUserInput;
    this.previousUserInput = code;
    if (codeChangeFound) {
      const socketChangeFound = this.adaptInputs(this.previousUserInput);
      // update function call string
      const codeToUse = getFunctionFromFunction(code);
      const paramKeys = this.inputSocketArray
        .map((socket) => socket.name)
        .filter((key) => key !== anyCodeName && key !== allowFullAccessName);
      const defineAllVariablesFromInputObject = paramKeys
        .map(
          (argument) =>
            'const ' + argument + ' = inputObject["' + argument + '"];',
        )
        .join(';');
      this.functionWithVariablesFromInputObject = codeToUse.replace(
        '{',
        '{' + defineAllVariablesFromInputObject,
      );
      this.updateConfigurationStatus();
      if (socketChangeFound) {
        return true;
      }
    }
    return false;
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const socketChangeFound = this.potentiallyUpdateFunctionAndSockets(
      inputObject[anyCodeName],
    );
    if (socketChangeFound) {
      // might be new sockets that need to go into execution, so restart it
      this.debug_timesExecuted--;
      await this.rawExecute();
      return;
    }

    let res = undefined;
    if (inputObject[allowFullAccessName]) {
      const CURRENT_GRAPH = PPGraph.currentGraph;
      const macro = async (
        macroName: string,
        ...macroArgs: any[]
      ): Promise<any> => {
        if (typeof macroName !== 'string' || !macroName.length) {
          throw new Error(
            'macro() expects a macro name as the first argument.',
          );
        }
        const macroResult = await CURRENT_GRAPH.invokeMacro(
          macroName,
          macroArgs,
        );
        return macroResult;
      };
      // `macro` is intentionally consumed only inside the evaluated user code.

      const finalized =
        'async () => ' + this.functionWithVariablesFromInputObject;
      try {
        res = await (await eval(finalized))();
      } catch (err) {
        let errorMessage = err instanceof Error ? err.message : String(err);

        // Extract line and column from stack trace for main thread errors
        if (err instanceof Error && err.stack) {
          const lineMatch = err.stack.match(/:(\d+):(\d+)/);
          if (lineMatch) {
            const lineNumber = parseInt(lineMatch[1], 10);
            const columnNumber = parseInt(lineMatch[2], 10);
            errorMessage += ` (line: ${lineNumber}, column: ${columnNumber})`;
          }
        }

        throw new Error(errorMessage);
      }
    } else {
      const finalized =
        'async (inputObject) => ' + this.functionWithVariablesFromInputObject;
      const worked = await new PNPWorker().work({
        code: finalized,
        data: inputObject,
      });
      if (!worked.success) {
        let errorMessage = worked.error || 'Unknown error occurred';

        // Add line number information if available
        if (worked.lineNumber) {
          errorMessage += ` (line: ${worked.lineNumber - 2}`; //why -2? Its offset for some reason
          if (worked.columnNumber) {
            errorMessage += `, column: ${worked.columnNumber}`;
          }
          errorMessage += ')';
        }

        throw new Error(errorMessage);
      }
      res = worked.result;
    }
    outputObject[this.getOutputParameterName()] = res;
    outputObject[anyCodeName] = this.previousUserInput;
  }

  // returns true if there was a change
  protected adaptInputs(code: string): boolean {
    const functionName = code
      .split('(')[0]
      .replaceAll('function', '')
      .replaceAll('const', '')
      .trim();
    if (
      functionName.length < 100 &&
      this.nodeName !== functionName &&
      functionName.length
    ) {
      console.log('updating custom function node name');
      this.setNodeName(functionName);
    }

    const codeArguments = getArgumentsFromFunction(code);
    // remove all non existing arguments and add all missing (based on the definition we just got)
    const currentInputSockets = this.getAllNonDefaultInputSockets();
    const socketsToBeRemoved = currentInputSockets.filter(
      (socket) =>
        !codeArguments.find((argument) => socket.name === argument) &&
        socket.links.length === 0,
    );
    const argumentsToBeAdded = codeArguments.filter(
      (argument) =>
        !this.getAllInputSockets().some((socket) => socket.name === argument),
    );
    if (socketsToBeRemoved.length > 0) {
      console.log('socketsToBeRemoved', socketsToBeRemoved);
    }
    if (argumentsToBeAdded.length > 0) {
      console.log('argumentsToBeAdded', argumentsToBeAdded);
    }
    socketsToBeRemoved.forEach((socket) => {
      this.removeSocket(socket);
    });
    argumentsToBeAdded.forEach((argument) => {
      const type = this.getDefaultParameterTypes()[argument] || new AnyType();
      this.addInput(
        argument,
        type,
        this.getDefaultParameterValues()[argument] || type.getDefaultValue(),
        true,
        {},
        false,
      );
    });
    if (socketsToBeRemoved.length > 0 || argumentsToBeAdded.length > 0) {
      // sort sockets based on their location in code arguments
      this.inputSocketArray.sort((socket1, socket2) => {
        return (
          codeArguments.indexOf(socket1.name) -
          codeArguments.indexOf(socket2.name)
        );
      });
      this.metaInfoChanged();
      return true;
    }
    return false;
  }
  // adapt all nodes apart from the code one
  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.name !== anyCodeName;
  }

  public getVersion(): number {
    return 3;
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion === 1 || previousVersion === 2) {
      // many older graphs are dependent on full access
      this.setInputData(allowFullAccessName, true);
    }
  }
}
