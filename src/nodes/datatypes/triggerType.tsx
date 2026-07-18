import React from 'react';
import Socket from '../../classes/SocketClass';
import { TriggerWidget } from '../../widgets';
import { AbstractType, DataTypeProps } from './abstractType';
import { TRIGGER_TYPE_OPTIONS } from '../../utils/constants';

export interface TriggerTypeProps extends DataTypeProps {
  dataType: TriggerType;
  triggerType: string;
  customFunctionString: string;
  previousData: any;
}

export class TriggerType extends AbstractType {
  triggerType: string;
  customFunctionString: string;
  previousData: any = undefined;
  showDetails: boolean;
  constructor(
    triggerType = TRIGGER_TYPE_OPTIONS[0].text,
    customFunctionString = '',
    showDetails = false,
  ) {
    super();
    this.triggerType = triggerType;
    this.customFunctionString = customFunctionString;
    this.showDetails = showDetails;
  }

  getName(): string {
    return 'Trigger';
  }

  getDefaultValue(): any {
    return 0;
  }

  getInputWidget = (props: TriggerTypeProps): any => {
    props.dataType = this;
    return <TriggerWidget {...props} />;
  };

  getOutputWidget = (props: TriggerTypeProps): any => {
    return this.getInputWidget(props);
  };

  private compareDataIsSame(data1: any, data2: any): boolean {
    if (typeof data1 === 'object' && typeof data2 === 'object') {
      return JSON.stringify(data1) === JSON.stringify(data2);
    } else {
      return data1 === data2;
    }
  }

  async onDataSet(data: any, socket: Socket): Promise<void> {
    await super.onDataSet(data, socket);

    if (
      // when socket is originally populated we dont want an execution
      socket.isInput() &&
      this.previousData !== undefined &&
      ((this.triggerType === TRIGGER_TYPE_OPTIONS[0].text &&
        this.previousData < data) ||
        (this.triggerType === TRIGGER_TYPE_OPTIONS[1].text &&
          this.previousData > data) ||
        (this.triggerType === TRIGGER_TYPE_OPTIONS[2].text &&
          !this.compareDataIsSame(this.previousData, data)) ||
        this.triggerType === TRIGGER_TYPE_OPTIONS[3].text)
    ) {
      //console.trace('trigger');
      // if im an input and condition is fullfilled, execute either custom function or start new chain with this as origin
      if (this.customFunctionString.length) {
        await socket.getNode()[this.customFunctionString]();
      } else {
        try {
          await socket.getNode().executeOptimizedChain();
        } catch (err) {
          console.error(err.name, err.message);
        }
      }
    }
    this.previousData = data;
    return;
  }

  allowedAsOutput(): boolean {
    return false;
  }

  allowedToAutomaticallyAdapt(): boolean {
    return false;
  }

  roundedCorners(): boolean {
    return false;
  }

  recommendedInputNodeWidgets(): string[] {
    return ['widgetbutton', 'pulse', 'constant_number', 'widgetswitch'];
  }

  public getMetaText(data: any): string {
    return this.triggerType;
  }

  // a bit of a workaround in here, dont want to keep previousData, and for some reason structuredClone was giving errors
  public serialize(): string {
    const cp = JSON.parse(JSON.stringify(this));
    delete cp['previousData'];
    return JSON.stringify(cp);
  }
}
