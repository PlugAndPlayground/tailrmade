import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import { TRgba } from '../../utils/color';
import { DynamicEnumType } from './dynamicEnumType';

export const ENTIRE_OBJECT_NAME = '-- Entire Object --';
export const INDEX_NAME = '-- Index --';
export const CONSTANT_NAME = '-- Constant --';
export default class InputArrayKeysType extends DynamicEnumType {
  parameterName: string;
  nodeID: string;
  allowIndex: boolean;
  allowConstant: boolean;
  constructor(
    parameterName: string,
    nodeID: string,
    allowIndex = true,
    allowConstant = false,
  ) {
    super(
      () => this.getOptions(),
      () => this.onChange(),
    );
    this.parameterName = parameterName;
    this.allowIndex = allowIndex;
    this.nodeID = nodeID;
    this.allowConstant = allowConstant;
  }

  getOptions = () => {
    if (!PPGraph.currentGraph.nodes[this.nodeID]) {
      return [];
    }
    return PPGraph.currentGraph.nodes[this.nodeID].getInputKeyOptions(
      this.parameterName,
      this.allowIndex,
      this.allowConstant,
    );
  };

  onChange = () => {
    void PPGraph.currentGraph.nodes[this.nodeID].executeOptimizedChain();
  };

  getMetaText(data: any): string {
    return data == undefined ? '' : data;
  }

  getColor(): TRgba {
    return new TRgba(40, 110, 60);
  }

  getDefaultValue(): any {
    return ENTIRE_OBJECT_NAME;
  }
  // cursed, for copy pasting the node
  onNodeAdded(node: PPNode) {
    this.nodeID = node.id;
  }
}
