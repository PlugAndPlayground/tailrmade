import PPGraph from '../../classes/GraphClass';
import { TRgba } from '../../utils/color';
import { AbstractType } from './abstractType';
import { DynamicEnumType } from './dynamicEnumType';

export interface FilterTypeInterface {
  Filters: FilterCondition[];
}

interface FilterCondition {
  Property: string;
  Condition: FilterComparator;
}

enum FilterComparator {
  Equals,
  NotEquals,
  Contains,
  NotContains,
  GreaterThan,
  GreaterOrEqual,
  LessThan,
  LessorEqual,
}

export class FilterType extends DynamicEnumType {
  nodeID: string;
  parameterName: string;
  constructor(parameterName: string, nodeID: string) {
    super(
      () => this.getOptions(),
      () => this.onChange(),
    );
    this.parameterName = parameterName;
    this.nodeID = nodeID;
  }

  getName(): string {
    return 'Filter';
  }

  getOptions = () => {
    return PPGraph.currentGraph.nodes[this.nodeID].getInputKeyOptions(
      this.parameterName,
      false,
      false,
    );
  };

  onChange = () => {
    void PPGraph.currentGraph.nodes[this.nodeID].executeOptimizedChain();
  };

  getColor(): TRgba {
    return new TRgba(240, 110, 60);
  }
}
