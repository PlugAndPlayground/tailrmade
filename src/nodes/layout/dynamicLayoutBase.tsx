import React from 'react';
import PPNode from '../../classes/NodeClass';
import { TRgba } from '../../utils/color';
import { DashboardIconProps, Layoutable, WidgetProps, DashboardWidgetProps, WidgetContentProps } from '../../utils/interfaces';
import { NODE_TYPE_COLOR } from '../../utils/constants';
import { DEFAULT_DASHBOARD_ICON } from '../../components/dashboard/dashboardIcons';
import {
  SOCKET_NAME_DASHBOARD_CONTENT,
} from '../../utils/layoutableHelpers';
import { DynamicWidgetContainerNode } from './dynamicLayout';
import { DeferredReactTypeInterface } from '../datatypes/deferredHtmlType';

/**
 * Base class for nodes that implement the Layoutable interface
 * Provides common functionality for layout nodes
 */
export abstract class LayoutableNodeBase extends PPNode implements Layoutable {
  isLayoutable(): boolean {
    return true;
  }

  isContainer(): boolean {
    return false;
  }

  public getTags(): string[] {
    return ['Widget', 'Layout', 'Container'];
  }

  public getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.LAYOUT);
  }

  public getDashboardId(): string {
    return `NODE_${this.id}`;
  }

  public getDashboardName(): string {
    return this.nodeName;
  }

  public getDashboardIcon(_props: DashboardIconProps): React.ReactNode {
    return DEFAULT_DASHBOARD_ICON;
  }

  public getRoundedCorners(): boolean {
    return false;
  }

  public getDashboardWrapper(props: DashboardWidgetProps): React.ReactNode {
    return <DynamicWidgetContainerNode property={this} {...props} />;
  }

  public getRelatedNode(): PPNode {
    return this;
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    await super.onExecute(input, output);

    const ReactUI: DeferredReactTypeInterface = {
      renderFunction: (props) =>
        this.getDashboardWrapper({
          ...props,
          ...input,
        }),
    };

    output[SOCKET_NAME_DASHBOARD_CONTENT] = ReactUI;
  }

  // Abstract methods that child classes must implement
  public abstract getName(): string;
  public abstract getDescription(): string;
  public abstract getWidgetProps(): WidgetProps;
  public abstract getWidgetContent(
    props: WidgetContentProps,
  ): React.ReactElement;
}
