import React from 'react';
import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  dataTypeWidgetDefaultProps,
} from './abstractType';
import { AnyType } from './anyType';
import { TRgba } from '../../utils/color';
import type { DashboardWidgetProps } from '../../utils/interfaces';
import { NODE_TYPE_COLOR } from '../../utils/constants';
import { REACT_UI_CONNECTION_ALPHA } from '../../utils/visuals';

// its a composite type, a function that will draw onto a container, and a hash (so that the caller knows if it needs to be redrawn)
export interface DeferredReactTypeInterface {
  renderFunction: (props: DashboardWidgetProps) => React.ReactNode;
  nodeId?: string;
}

export class DeferredReactType extends AbstractType {
  getInputWidget = (props: any): any => {
    return <></>;
  };

  getOutputWidget = (props: any): any => {
    props.dataType = this;
    return <HtmlOutputWidget {...props} />;
  };

  getName(): string {
    return 'Deferred Html';
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.LAYOUT);
  }

  getConnectionAlpha(): number {
    return REACT_UI_CONNECTION_ALPHA;
  }

  getDefaultValue(): DeferredReactTypeInterface {
    return {
      renderFunction: () => <div>Default HTML</div>,
    };
  }

  getComment(commentData: any): string {
    return commentData ? 'Graphics' : 'null';
  }

  getDefaultWidgetProps() {
    return {
      ...dataTypeWidgetDefaultProps,
      height: '320px',
      heightMode: 'fixed' as const,
    };
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['reactuicombinearray'];
  }

  recommendedInputNodeWidgets(): string[] {
    return [];
  }

  // cannot save this
  prepareDataForSaving(data: any) {
    return undefined;
  }

  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType = new AnyType(),
  ): Compatibility {
    return data != undefined && typeof data.renderFunction === 'function'
      ? new Compatibility(CompatibilityType.Compatible)
      : new Compatibility(CompatibilityType.Incompatible);
  }

  static stringToHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }
}

const HtmlOutputWidget: React.FunctionComponent<any> = (props) => {
  if (!props.inDashboard) {
    return <></>;
  }

  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  return property
    .getNode()
    .getDashboardWrapper(props.index, props.disabled, props.heightMode);
};
