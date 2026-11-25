import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { TRgba } from '../../utils/color';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TNodeSource } from '../../utils/interfaces';
import { AnyType } from '../datatypes/anyType';
import { ensureVisible, getObjectsInsideBounds } from '../../pixi/utils-pixi';
import { DynamicEnumType } from '../datatypes/dynamicEnumType';
import * as PIXI from 'pixi.js';
import InputArrayKeysType, {
  CONSTANT_NAME,
} from '../datatypes/inputArrayKeysType';
import { JSONArrayType } from '../datatypes/jsonArrayType';
import { arrayEntryToSelectedValue } from '../data/dataFunctions';
import { deSerializeType, serializeType } from '../datatypes/typehelper';
import { MacroFrame } from './macroFrame';

export const macroOutputName = 'Output';
export const macroNameName = 'Macro';

export const EMPTY_DEFAULT_MACRO_NAME = 'EmptyDefaultMacro';

const macroArrayName = 'Array';
const constantSuffix = ' - Constant';

const macroColor = TRgba.fromString(NODE_TYPE_COLOR.MACRO);

export const MACRO_PARAMETER_PREFIX_NAME = 'Parameter';

export class Macro extends MacroFrame {
  public getName(): string {
    return 'Macro';
  }

  public getDescription(): string {
    return 'Wrap a group of nodes into a macro and use this Macro as often as you want';
  }

  public getTags(): string[] {
    return ['Macro'].concat(super.getTags());
  }

  getColor(): TRgba {
    return macroColor;
  }

  protected getReferrersHeading(): string {
    return 'Referenced by';
  }

  public outputPlugged(socket: Socket): void {
    super.outputPlugged(socket);

    // align the type with whatever its connected to
    const linked = socket.links[0].target;
    const linkedDataType = linked.dataType;
    if (linkedDataType.getName() !== socket.dataType.getName()) {
      console.log("Changing socket's data type to match linked socket");
      socket.changeSocketDataType(
        deSerializeType(serializeType(linkedDataType)),
      );
    }

    const last = this.outputSocketArray[this.outputSocketArray.length - 1];
    // if furthest down parameter is plugged in, add a new one
    if (last.hasLink()) {
      this.addDefaultOutput();
    }
    this.potentiallyUpdateCallingNodesMeta();
    this.debounceDrawShape();
  }

  public outputUnplugged(socket: Socket): void {
    super.outputUnplugged(socket);

    // if both last two sockets are unplugged AND last one is not currently a source for connecting - remove the last one
    let array = this.outputSocketArray;
    while (this.shouldRemoveLastSocket(array)) {
      const lastSocket = array[array.length - 1];
      this.removeSocket(lastSocket);
      array = array.slice(0, -1);
    }

    this.potentiallyUpdateCallingNodesMeta();
    this.debounceDrawShape();
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.OUT,
        MACRO_PARAMETER_PREFIX_NAME + ' 1',
        new AnyType(),
        0,
      ),
      new Socket(SOCKET_TYPE.IN, macroOutputName, new AnyType()),
    ];
  }

  public addDefaultOutput(): void {
    this.addOutput(
      this.constructSocketName(
        MACRO_PARAMETER_PREFIX_NAME,
        this.outputSocketArray,
      ),
      new AnyType(),
    );
  }

  public async executeMacro(args: any[]): Promise<any> {
    let attempts = 0;

    const outputSockets = this.outputSocketArray;
    args.forEach((arg, i) => {
      if (i < outputSockets.length) {
        outputSockets[i].data = arg;
      }
    });
    await this.executeChildren();
    const out = await this.getInputData(macroOutputName);

    return out;
  }

  public socketTypeChanged(): void {
    super.socketTypeChanged();
    this.debounceDrawShape();
  }

  // make sure there are no name collisions with other macros
  public setNodeName(text: string): string {
    const existingMacros = PPGraph.currentGraph.macros;
    const oldName = this.name;
    let nameToUse = text;
    let lastFound = Object.values(existingMacros).find(
      (macro) => macro.nodeName == nameToUse,
    );
    for (
      let i = 0;
      nameToUse == 'Macro' ||
      (lastFound !== undefined && lastFound.id !== this.id);
      i++
    ) {
      nameToUse = text + i.toString();
      lastFound = Object.values(existingMacros).find(
        (macro) => macro.nodeName == nameToUse,
      );
    }
    const callers = this.getReferrers();

    this.name = nameToUse;
    if (this.hasBeenAdded) {
      this.debounceDrawShape();
    }
    super.setNodeName(nameToUse);

    // migrate all my callers to my new name
    callers.forEach((node) => node.calledMacroChangedName(oldName, nameToUse));
    return nameToUse;
  }

  public getShrinkOnSocketRemove(): boolean {
    return false;
  }

  public getInsideNodes(): PPNode[] {
    // interface is calling this potentially after node is removed (ideally shouldnt but)
    if (this.destroyed) {
      return [];
    }
    // get all nodes that are within the bounds
    const myBounds = this.getSelectionBounds();
    const nodesInside: PPNode[] = getObjectsInsideBounds(
      Object.values(PPGraph.currentGraph.nodes),
      myBounds[0],
    );
    return nodesInside;
  }

  public getSocketDisplayName(socket: Socket): string {
    if (socket == undefined) {
      return '';
    }
    if (socket.socketType == SOCKET_TYPE.OUT) {
      let myDesiredName = this.getSocketDesiredDisplayName(socket);
      let count = 0;
      for (let i = 0; i < this.outputSocketArray.length; i++) {
        const inSocket = this.outputSocketArray[i];
        const desiredName = this.getSocketDesiredDisplayName(inSocket);
        if (socket.name == inSocket.name) {
          // ready to return
          if (count == 0) {
            return desiredName;
          } else {
            return desiredName + ' ' + (count + 1);
          }
        } else if (desiredName == myDesiredName) {
          count++;
        }
      }
      return myDesiredName;
    } else {
      return socket.name;
    }
  }

  protected getReferrers(): PPNode[] {
    return Object.values(PPGraph.currentGraph.nodes).filter((node) =>
      node.isCallingMacro(this.name),
    );
  }

  updateAllCallers(): void {
    const nodesCallingMe = this.getReferrers();
    // needs to be sequential
    for (let i = 0; i < nodesCallingMe.length; i++) {
      if (!nodesCallingMe[i].isExecuting) {
        nodesCallingMe[i].calledMacroUpdated();
      }
    }
  }

  // macro doesnt do normal execution, its a shell
  protected async rawExecute(): Promise<void> {
    if (!this.hasBeenAdded) {
      return;
    }

    this.debug_timesExecuted++;
    if (PPGraph.currentGraph.graphConfiguredAndReady && this.hasBeenAdded) {
      this.updateAllCallers();
    }
  }

  protected potentiallyUpdateCallingNodesMeta() {
    if (PPGraph.currentGraph.graphConfiguredAndReady) {
      this.getReferrers().forEach((caller) => caller.calledMacroUpdatedMeta());
    }
  }

  protected socketRemoved(): void {
    this.potentiallyUpdateCallingNodesMeta();
  }
  protected socketAdded(): void {
    this.potentiallyUpdateCallingNodesMeta();
  }
}

export class ExecuteMacro extends PPNode {
  // Pause the caller, including MapExecuteMacro, before entering its body.
  // Pausing inside a macro would let executeMacro return an unfinished result.
  public readonly deferUntilAppApproved: boolean = true;

  // Macros can be referenced by name or execute nodes with side effects.
  public getSeemsUnused(): boolean {
    return false;
  }

  static getMacroOptions(): any[] {
    return Object.values(PPGraph.currentGraph.macros).map((macro) => {
      return { text: macro.nodeName };
    });
  }
  public getName(): string {
    return 'Execute Macro';
  }

  public getNodeTextString(): [string, PIXI.TextStyleFontStyle] {
    const calledMacro = this.getInputData(macroNameName);
    const isCallingMacro = calledMacro !== EMPTY_DEFAULT_MACRO_NAME;
    const name = super.getNodeTextString(
      true,
      isCallingMacro ? 'Macro: ' + calledMacro : this.getName(),
    );
    return isCallingMacro ? [name[0], 'italic'] : [name[0], 'normal'];
  }

  public getDescription(): string {
    return 'Executes a macro that is defined in the graph';
  }

  public getTags(): string[] {
    return ['Macro'].concat(super.getTags());
  }
  onNodeDoubleClick: (event: PIXI.FederatedPointerEvent) => void = () => {
    const macroName = this.getInputData(macroNameName);
    if (macroName !== undefined) {
      void ensureVisible(
        [PPGraph.currentGraph.getMacroWithName(macroName)],
        true,
      );
    }
  };

  getColor(): TRgba {
    return macroColor;
  }

  public isCallingMacro(macroName: string): boolean {
    return (
      super.isCallingMacro(macroName) ||
      this.getInputData(macroNameName) == macroName
    );
  }

  public calledMacroChangedName(oldName: string, newName: string): void {
    this.setInputData(macroNameName, newName);
  }

  protected getMacroSockets() {
    const calledMacroName = this.getInputData(macroNameName);
    const targetMacro = Object.values(PPGraph.currentGraph.macros).find(
      (macro) => macro.nodeName === calledMacroName,
    );
    if (targetMacro !== undefined) {
      const macrosParams = targetMacro.outputSocketArray;
      if (macrosParams.length > 1) {
        return macrosParams.slice(0, -1); // remove last param if there are more than one
      } else {
        return macrosParams;
      }
    } else {
      return [];
    }
  }

  protected calculateMissingAndExtraSockets(
    desiredSocketNames: string[],
  ): [Socket[], string[]] {
    const socketsToBeRemoved = this.inputSocketArray.filter(
      (socket) =>
        socket.name !== macroNameName &&
        desiredSocketNames.find(
          (socketName) =>
            socketName === socket.name.replaceAll(constantSuffix, ''),
        ) == undefined &&
        socket.links.length == 0,
    );
    const socketNamesToBeAdded = desiredSocketNames.filter(
      (socketName) =>
        this.inputSocketArray.find((socket) => socketName === socket.name) ===
        undefined,
    );
    return [socketsToBeRemoved, socketNamesToBeAdded];
  }

  private updateMacroCallSockets(): void {
    const macroSockets = this.getMacroSockets();
    const desiredSocketNames = [macroNameName].concat(
      macroSockets.map((socket) => socket.name),
    );
    const [socketsToBeRemoved, socketNamesToBeAdded] =
      this.calculateMissingAndExtraSockets(desiredSocketNames);
    socketsToBeRemoved.forEach((socket) => {
      this.removeSocket(socket);
    });
    socketNamesToBeAdded.forEach((socketName) => {
      this.addSocket(
        new Socket(
          SOCKET_TYPE.IN,
          socketName,
          deSerializeType(
            serializeType(
              macroSockets.find((socket) => socket.name == socketName)!
                .dataType,
            ),
          ),
        ),
      );
    });

    if (socketNamesToBeAdded.length + socketsToBeRemoved.length > 0) {
      this.inputSocketArray.sort((socket1, socket2) => {
        return socket1.name.localeCompare(socket2.name);
      });
      this.resizeAndDraw();
    }
    // align the types of the sockets as well
    macroSockets.forEach((socket) => {
      const inputSocket = this.getInputSocketByName(socket.name);
      if (inputSocket.dataType.getName() !== socket.dataType.getName()) {
        inputSocket.changeSocketDataType(
          deSerializeType(serializeType(socket.dataType)),
        );
      }
      socket.redraw();
    });
  }

  public calledMacroUpdatedMeta(): void {
    this.updateMacroCallSockets();
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        macroNameName,
        new DynamicEnumType(
          () => ExecuteMacro.getMacroOptions(),
          () => {
            this.calledMacroUpdatedMeta();
            this.calledMacroUpdated();
          },
        ),
        EMPTY_DEFAULT_MACRO_NAME,
      ),
      this.getOutputSocket(),
    ].concat(super.getDefaultIO());
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const calledMacro = this.getInputData(macroNameName);
    if (this.getInputData(calledMacro) !== EMPTY_DEFAULT_MACRO_NAME) {
      const args = this.inputSocketArray
        .filter((socket) => socket.name !== macroNameName)
        .map((socket) => socket.data);
      outputObject[macroOutputName] = await PPGraph.currentGraph.invokeMacro(
        calledMacro,
        args,
      );
    }
  }

  protected getOutputSocket() {
    return new Socket(SOCKET_TYPE.OUT, macroOutputName, new AnyType());
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.isOutput();
  }

  public getSocketDisplayName(socket: Socket): string {
    if (socket.name.includes(MACRO_PARAMETER_PREFIX_NAME)) {
      const calledMacro = PPGraph.currentGraph.getMacroWithName(
        this.getInputData(macroNameName),
      );
      if (calledMacro !== undefined) {
        const nameInMacro = calledMacro.getSocketDisplayName(
          calledMacro.getOutputSocketByName(socket.name),
        );
        if (nameInMacro !== undefined && nameInMacro !== '') {
          return nameInMacro;
        } else {
          return socket.name;
        }
      } else {
        return socket.name;
      }
    } else {
      return socket.name;
    }
  }
}

export class MapExecuteMacro extends ExecuteMacro {
  public getName(): string {
    return 'Map Execute Macro';
  }

  public getDescription(): string {
    return 'Maps an array of JSONs over a macro';
  }

  public getTags(): string[] {
    return ['Array'].concat(super.getTags());
  }

  getPreferredNodesPerSocket(socket: Socket): string[] {
    switch (socket.name) {
      case macroArrayName:
        return ['draw_combine_array'];
    }
    return [];
  }

  private getMacroInputSocket() {
    return new InputArrayKeysType(macroArrayName, this.id, true, true);
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.name.includes(constantSuffix);
  }

  public async onNodeAdded(source: TNodeSource): Promise<void> {
    await super.onNodeAdded(source);

    // hacky fix - there is a problem with the visibility conditions on sockets being loaded from serialized, their function is gone
    this.inputSocketArray.forEach((socket) => {
      if (socket.name.includes(constantSuffix)) {
        socket.visibilityCondition = () => {
          return (
            this.getInputData(socket.name.replaceAll(constantSuffix, '')) ==
            CONSTANT_NAME
          );
        };
      }
    });
  }

  private updateMacroFormatSockets(): void {
    const desiredSocketNames = [macroNameName, macroArrayName].concat(
      this.getMacroSockets().map((socket) => socket.name),
    );
    const [socketsToBeRemoved, socketNamesToBeAdded] =
      this.calculateMissingAndExtraSockets(desiredSocketNames);

    socketsToBeRemoved.forEach((socket) => {
      this.removeSocket(socket);
    });
    socketNamesToBeAdded.forEach((socketName) => {
      this.addSocket(
        new Socket(SOCKET_TYPE.IN, socketName, this.getMacroInputSocket()),
      );
      this.addSocket(
        Socket.getOptionalVisibilitySocket(
          SOCKET_TYPE.IN,
          socketName + constantSuffix,
          new AnyType(),
          0,
          () => {
            const visible = this.getInputData(socketName) == CONSTANT_NAME;
            return visible;
          },
        ),
      );
    });

    if (socketNamesToBeAdded.length + socketsToBeRemoved.length > 0) {
      this.inputSocketArray.sort((socket1, socket2) => {
        return (
          desiredSocketNames.indexOf(socket1.name) -
          desiredSocketNames.indexOf(socket2.name)
        );
      });
      this.resizeAndDraw();
    }
  }

  public calledMacroUpdatedMeta(): void {
    this.updateMacroFormatSockets();
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, macroArrayName, new JSONArrayType()),
    ].concat(super.getDefaultIO());
  }

  protected async onExecute(
    inputObject: Record<string, any>,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const calledMacro = this.getInputData(macroNameName);
    const toReturn: unknown[] = [];
    if (calledMacro !== EMPTY_DEFAULT_MACRO_NAME) {
      const inputArray: object[] = inputObject[macroArrayName];

      // hack alert
      const remappings = Object.entries(inputObject).filter(
        (pair) =>
          pair[0].includes(MACRO_PARAMETER_PREFIX_NAME + ' ') &&
          !pair[0].includes(constantSuffix),
      );
      for (let i = 0; i < inputArray.length; i++) {
        const args = remappings.map((pair) => {
          return arrayEntryToSelectedValue(
            inputArray[i],
            pair[1],
            i,
            inputObject[pair[0] + constantSuffix],
          );
        });
        const res = await PPGraph.currentGraph.invokeMacro(calledMacro, args);
        toReturn.push(res);
      }
    }
    outputObject[macroArrayName] = toReturn;
  }

  protected getOutputSocket() {
    return new Socket(SOCKET_TYPE.OUT, macroArrayName, new JSONArrayType());
  }
}
