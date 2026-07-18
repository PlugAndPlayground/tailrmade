import PPGraph from '../classes/GraphClass';
import PPNode from '../classes/NodeClass';
import { isEventComingFromWithinTextInput } from './utils';

// This class didnt really work out TODO deprecate entirely

abstract class Hotkey {
  protected getKeys(): string[] {
    return [];
  }
  protected execute(graph: PPGraph): void {
    return;
  }
  areKeysPressed(currPressed: string, allPressed: Set<string>) {
    return (
      this.getKeys().includes(currPressed) &&
      !this.getKeys().find((key) => !allPressed.has(key))
    );
  }

  // you can override this function if you want more custom behaviour
  potentiallyExecute(
    currPressed: KeyboardEvent,
    allPressed: Set<string>,
    graph: PPGraph,
  ): boolean {
    // see if all keys are pressed and if one of the relevant keys was pressed now
    if (this.areKeysPressed(currPressed.key, allPressed)) {
      this.execute(graph);
      return true;
    } else {
      return false;
    }
  }
}

// delete behaviour is a little more specialized so overriding "potentiallyexecute"
class deleteNodeAction extends Hotkey {
  potentiallyExecute(
    currPressed: KeyboardEvent,
    allPressed: Set<string>,
    graph: PPGraph,
  ): boolean {
    if (currPressed.key === 'Backspace' || currPressed.key === 'Delete') {
      if (isEventComingFromWithinTextInput(currPressed)) {
        return false;
      }

      void graph.perform_action_DeleteSelectedNodes();
      return true;
    }
    return false;
  }
}

class focusSelectedHybridNodeAction extends Hotkey {
  potentiallyExecute(
    currPressed: KeyboardEvent,
    _allPressed: Set<string>,
    graph: PPGraph,
  ): boolean {
    if (currPressed.key !== 'Enter') {
      return false;
    }

    if (isEventComingFromWithinTextInput(currPressed)) {
      return false;
    }

    if (graph.selection.selectedNodes.length !== 1) {
      return false;
    }

    const selectedNode = graph.selection.selectedNodes[0] as PPNode;
    return selectedNode.onEnterKeyPressed();
  }
}

// remember to add your hotkey to the list
const activeHotkeys: Hotkey[] = [
  // new createAddNodeAction(),
  new deleteNodeAction(),
  new focusSelectedHybridNodeAction(),
];

export class InputParser {
  static keysPressed: Set<string> = new Set();

  static parseKeyDown(event: KeyboardEvent, graph: PPGraph): void {
    // console.log('parsed keykey: ' + JSON.stringify(event.key));
    this.keysPressed.add(event.key);
    const wasHandled = activeHotkeys.some((hotkey) =>
      hotkey.potentiallyExecute(event, this.keysPressed, graph),
    );

    if (wasHandled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  // no action triggers on key up, so no graph passed
  static parseKeyUp(event: KeyboardEvent): void {
    this.keysPressed.delete(event.key);
  }
}
