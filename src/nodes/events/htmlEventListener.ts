import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { TRgba } from '../../utils/color';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TNodeSource } from '../../utils/interfaces';
import { JSONType } from '../datatypes/jsonType';
import { StringType } from '../datatypes/stringType';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';

const eventTypeOutputName = 'Event Type';
const customDataOutputName = 'Custom Data';
const eventDetailsOutputName = 'Event Details';

/**
 * HTMLEventListener - A named event listener that can be triggered by HTML nodes.
 *
 * Usage in HTML nodes:
 *   <button data-tm-event-click='{"listener": "myListener", "data": {"action": "submit"}}'>
 *     Click me
 *   </button>
 *
 * The "listener" field specifies the node name of the HTMLEventListener to trigger.
 * Multiple HTML elements across different nodes can trigger the same listener.
 * When this node is renamed, all HTML nodes referencing the old name will be updated.
 */
export class HTMLEventListener extends PPNode {
  // Track the previous name to detect renames
  private previousListenerName: string = '';

  public getName(): string {
    return 'HTML Event Listener';
  }

  public getDescription(): string {
    return 'A named event listener that HTML nodes can target. Reference this node by its name in HTML with data-tm-event-{eventType}=\'{"listener": "nodeName", "data": {...}}\'';
  }

  public getTags(): string[] {
    return ['HTML', 'Trigger'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.OUTPUT);
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 1000, this);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.OUT,
        customDataOutputName,
        new JSONType(),
        {},
        true,
      ),
      new Socket(
        SOCKET_TYPE.OUT,
        eventTypeOutputName,
        new StringType(),
        '',
        false,
      ),
      new Socket(
        SOCKET_TYPE.OUT,
        eventDetailsOutputName,
        new JSONType(),
        {},
        false,
      ),
    ];
  }

  /**
   * Get the listener name for this node (always the node name).
   */
  public getListenerName(): string {
    return this.nodeName;
  }

  /**
   * Called when this node is renamed.
   * Updates all HTML nodes that reference the old listener name.
   */
  public nameChanged(newName: string): void {
    const oldName = this.previousListenerName;
    super.nameChanged(newName);

    // Update all HTML nodes that reference the old listener name
    if (oldName && oldName !== newName) {
      HTMLEventListener.updateListenerReferencesInHtmlNodes(oldName, newName);
    }

    // Track the new name for next rename
    this.previousListenerName = newName;
  }

  /**
   * Initialize the previous name tracking when the node is added.
   */
  public async onNodeAdded(source: TNodeSource): Promise<void> {
    await super.onNodeAdded(source);
    this.previousListenerName = this.nodeName;
  }

  /**
   * Static helper to update listener references in all HTML nodes.
   * Called when a listener node is renamed.
   */
  public static updateListenerReferencesInHtmlNodes(
    oldName: string,
    newName: string,
  ): void {
    if (!PPGraph.currentGraph) return;

    Object.values(PPGraph.currentGraph.nodes).forEach((node) => {
      node.updateListenerReferences(oldName, newName);
    });
  }

  /**
   * Called by HTML nodes when an event should be dispatched to this listener.
   */
  private triggerEvent(
    eventType: string,
    customData: Record<string, unknown>,
    eventDetails: Record<string, unknown>,
  ): void {
    this.setOutputData(eventTypeOutputName, eventType);
    this.setOutputData(customDataOutputName, customData);
    this.setOutputData(eventDetailsOutputName, eventDetails);

    // Execute downstream nodes
    void this.executeOptimizedChain();
  }

  /**
   * Override from PPNode - handles HTML events when the listener name matches this node's name.
   */
  public dispatchHTMLEvent(
    listenerName: string,
    eventType: string,
    customData: Record<string, unknown>,
    eventDetails: Record<string, unknown>,
  ): void {
    if (this.getListenerName() === listenerName) {
      this.triggerEvent(eventType, customData, eventDetails);
    }
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    // Event-driven node - outputs are set by triggerEvent method
    // Just pass through current values
    outputObject[eventTypeOutputName] = this.getOutputData(eventTypeOutputName);
    outputObject[customDataOutputName] =
      this.getOutputData(customDataOutputName);
    outputObject[eventDetailsOutputName] = this.getOutputData(
      eventDetailsOutputName,
    );
    await Promise.resolve();
  }
}
