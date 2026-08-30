import React from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import {
  WidgetHybridBase,
  WidgetPaper,
  colorName,
  getColorSocket,
  getSizeSocket,
  labelName,
  outName,
  outIndexName,
  sizeName,
  useWidgetSize,
  useSizeTokens,
} from './abstract';
import Socket from '../../classes/SocketClass';
import { ArrayType } from '../datatypes/arrayType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import { BooleanType } from '../datatypes/booleanType';
import { BackPropagation } from '../../interfaces';
import { SOCKET_TYPE } from '../../utils/constants';
import { useThemeTokens } from '../../utils/theme';
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
      getColorSocket(),
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

  public getCanvasControlSelectors(): string[] {
    return ['.MuiButtonBase-root'];
  }

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    const node = props.node as WidgetTabs;
    const options = props[tabsOptionsName] || [];
    const selectedIndex = Math.max(
      0,
      Math.min(options.length - 1, props[selectedTabIndex]),
    );

    const scrollable = props[scrollableName];
    const size = useWidgetSize(props[sizeName]);
    const color = props[colorName];
    const tabRadius = useThemeTokens().radius;
    const tokens = useSizeTokens(size);
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
            // MUI's own textColor/indicatorColor only accept primary and
            // secondary, so the indicator and the selected label are driven
            // from the palette here instead - that way every role the Color
            // socket offers actually works
            textColor="inherit"
            aria-label="tabs widget"
            sx={{
              pointerEvents: props.disabled ? 'none' : undefined,
              minHeight: `${tokens.tabHeight}px`,
              '& .MuiSvgIcon-root': {
                fontSize: `${tokens.iconSize}px`,
              },
              '& .MuiTabs-indicator': {
                backgroundColor: `${color}.main`,
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
                  // was a fixed tint derived from MAIN_COLOR, which ignored
                  // the theme outright. action.selected/action.hover are the
                  // palette's own interaction layers and follow light/dark.
                  '&.Mui-selected': {
                    color: `${color}.main`,
                    backgroundColor: 'action.selected',
                    borderTopLeftRadius: tabRadius,
                    borderTopRightRadius: tabRadius,
                  },
                  '&:hover': {
                    backgroundColor: 'action.hover',
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
