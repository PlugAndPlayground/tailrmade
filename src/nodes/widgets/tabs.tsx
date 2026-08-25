import React from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import {
  WidgetHybridBase,
  WidgetPaper,
  getSizeSocket,
  getSizeTokens,
  labelName,
  outName,
  outIndexName,
  sizeName,
  useWidgetSize,
} from './abstract';
import Socket from '../../classes/SocketClass';
import { ArrayType } from '../datatypes/arrayType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import { BooleanType } from '../datatypes/booleanType';
import { BackPropagation } from '../../interfaces';
import { MAIN_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { WidgetContentProps } from '../../utils/interfaces';
import {
  ActionHandler,
  BakedAction,
  SerializableAction,
  SerializableActionHandler,
} from '../../classes/Action';

const tabsOptionsName = 'Tab Options';
const selectedTabIndex = 'Selected Tab';
const scrollableName = 'Scrollable';

const tabsDefaultValue = ['Tab 1', 'Tab 2', 'Tab 3'];

export class WidgetTabs extends WidgetHybridBase {
  public getName(): string {
    return 'Tabs';
  }

  public getDescription(): string {
    return 'Adds a group of tabs for navigation or selection';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        tabsOptionsName,
        new ArrayType(),
        tabsDefaultValue,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        selectedTabIndex,
        new NumberType(true, 0, 10),
        0,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        scrollableName,
        new BooleanType(),
        true,
        false,
      ),
      getSizeSocket(),
      new Socket(SOCKET_TYPE.OUT, outName, new StringType(), undefined, false),
      new Socket(SOCKET_TYPE.OUT, outIndexName, new NumberType()),
    ];
  }

  public getDefaultNodeWidth(): number {
    return 300;
  }

  public getDefaultNodeHeight(): number {
    return 120;
  }

  getPreferredOutputSocketName(): string {
    return outName;
  }

  onNodeResize = (newWidth, newHeight) => {
    this.forceRerender();
  };

  protected getBackPropagationTargets(): BackPropagation {
    return {
      SocketToGetValue: this.getInputSocketByName(selectedTabIndex),
      SocketToGetOptions: this.getInputSocketByName(tabsOptionsName),
      SocketToTakeName: this.getInputSocketByName(labelName),
    };
  }

  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    await super.onExecute(inputObject, outputObject);

    const options = inputObject[tabsOptionsName];
    const selectedIndex = Math.max(
      0,
      Math.min(options.length - 1, inputObject[selectedTabIndex]),
    );

    const selectedValue = options[selectedIndex];
    this.setOutputData(outName, selectedValue);
    this.setOutputData(outIndexName, selectedIndex);
  }

  handleOnChange = async (event, newValue) => {
    const id = this.id;
    const prev = this.getInputData(selectedTabIndex);

    const applyFunction = async (newIndex) => {
      const safeNode = SerializableActionHandler.getSafeNode(id);
      safeNode.setInputData(selectedTabIndex, newIndex);
      const selectedOption = safeNode.getInputData(tabsOptionsName)[newIndex];
      safeNode.setOutputData(outName, selectedOption);
      safeNode.setOutputData(outIndexName, newIndex);
      await safeNode.executeOptimizedChain();
    };

    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(applyFunction, applyFunction, 'Select Tab'),
        newValue,
        prev,
      ),
    );
  };

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    const node = props.node as WidgetTabs;
    const options = props[tabsOptionsName] || [];
    const selectedIndex = Math.max(
      0,
      Math.min(options.length - 1, props[selectedTabIndex]),
    );

    const scrollable = props[scrollableName];
    const size = useWidgetSize(props[sizeName]);
    const tokens = getSizeTokens(size);
    const fontSize = props.inDashboard
      ? `${14 * tokens.scale}px`
      : `${Math.max(12, node.nodeHeight / 10) * tokens.scale}px`;

    return (
      <WidgetPaper node={node} inDashboard={props.inDashboard}>
        <Box
          sx={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Tabs
            data-cy={`${props.dataCyId}-tabs`}
            value={selectedIndex}
            onChange={node.handleOnChange}
            variant={scrollable ? 'scrollable' : 'standard'}
            scrollButtons={scrollable ? 'auto' : false}
            centered={!scrollable}
            allowScrollButtonsMobile={scrollable}
            textColor="secondary"
            indicatorColor="secondary"
            aria-label="tabs widget"
            sx={{
              pointerEvents: props.disabled ? 'none' : undefined,
              minHeight: `${tokens.tabHeight}px`,
              '& .MuiSvgIcon-root': {
                fontSize: `${tokens.iconSize}px`,
              },
            }}
          >
            {options.map((option, index) => (
              <Tab
                key={index}
                data-cy={`${props.dataCyId}-tab-${index}`}
                label={option}
                disabled={props.disabled}
                sx={{
                  fontSize: fontSize,
                  minWidth: !scrollable ? 0 : 90 * tokens.scale,
                  minHeight: `${tokens.tabHeight}px`,
                  flex: !scrollable ? 1 : 'auto',
                  padding: `${6 * tokens.scale}px ${12 * tokens.scale}px`,
                  '&.Mui-selected': {
                    backgroundColor: `${TRgba.fromString(MAIN_COLOR).negate().setAlpha(0.1)}`,
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                  },
                  '&:hover': {
                    backgroundColor: `${TRgba.fromString(MAIN_COLOR).negate().setAlpha(0.05)}`,
                    opacity: 1,
                  },
                  textTransform: 'none',
                }}
              />
            ))}
          </Tabs>
        </Box>
      </WidgetPaper>
    );
  }
}
