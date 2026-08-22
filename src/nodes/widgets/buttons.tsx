import React from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  FormControl,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import {
  WidgetHybridBase,
  WidgetPaper,
  colorOptions,
  labelName,
  outName,
  outIndexName,
  initialValueName,
  variantName,
  sizeName,
  getMuiSize,
  getSizeSocket,
  getSizeTokens,
  offValueName,
  onValueName,
  colorName,
  defaultOptions,
} from './abstract';
import { HybridWidgetContentProps } from '../../classes/HybridNode2';
import Socket from '../../classes/SocketClass';
import { AnyType } from '../datatypes/anyType';
import { ArrayType } from '../datatypes/arrayType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import { EnumType, EnumStructure } from '../datatypes/enumType';
import { BooleanType } from '../datatypes/booleanType';
import { BackPropagation } from '../../interfaces';
import { DEFAULT_UPDATE_FREQUENCY, SOCKET_TYPE } from '../../utils/constants';
import {
  ActionHandler,
  BakedAction,
  SerializableAction,
  SerializableActionHandler,
} from '../../classes/Action';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import PPGraph from '../../classes/GraphClass';

const disabledName = 'Disabled';

const variantOptions: EnumStructure = [
  {
    text: 'contained',
  },
  {
    text: 'outlined',
  },
  {
    text: 'text',
  },
];

export class WidgetButton extends WidgetHybridBase {
  isCurrentlyForceDisabled = false;
  public getName(): string {
    return 'Button';
  }

  public getDescription(): string {
    return 'Adds a button to trigger values';
  }

  public getTags(): string[] {
    return ['Trigger'].concat(super.getTags());
  }

  public getVersion(): number {
    return 3;
  }

  public async migrate(previousVersion: number): Promise<void> {
    await super.migrate(previousVersion);
    if (previousVersion < 2) {
      this.updateBehaviour = new UpdateBehaviourClass(
        false,
        true,
        false,
        DEFAULT_UPDATE_FREQUENCY,
        this,
      );
      await this.updateBehaviour.onNodeAdded();
    }
    if (previousVersion < 3) {
      // 'On'/'Off' -> 'On value'/'Off value'
      await this.renameInputSocketPreservingData('On', onValueName);
      await this.renameInputSocketPreservingData('Off', offValueName);
    }
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, offValueName, new AnyType(), 0, false),
      new Socket(SOCKET_TYPE.IN, onValueName, new AnyType(), 1, false),
      new Socket(SOCKET_TYPE.IN, labelName, new StringType(), 'Button', false),
      new Socket(
        SOCKET_TYPE.IN,
        variantName,
        new EnumType(variantOptions, undefined, true),
        variantOptions[0].text,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        colorName,
        new EnumType(colorOptions, undefined, true),
        colorOptions[0].text,
        false,
      ),
      new Socket(SOCKET_TYPE.IN, disabledName, new BooleanType(), false, false),
      getSizeSocket(),
      new Socket(SOCKET_TYPE.OUT, outName, new AnyType()),
    ];
  }

  public getDefaultNodeWidth(): number {
    return 200;
  }

  public getDefaultNodeHeight(): number {
    return 104;
  }

  onNodeResize = (newWidth, newHeight) => {
    this.forceRerender();
  };

  protected getBackPropagationTargets(): BackPropagation {
    return {
      SocketToGetValue: this.getInputSocketByName(onValueName),
      SocketToTakeName: this.getInputSocketByName(labelName),
    };
  }

  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    await super.onExecute(inputObject, outputObject);
    // No default execution behavior needed - button is event driven
  }

  handleOnClick = async () => {
    if (
      this.isCurrentlyForceDisabled ||
      !PPGraph.currentGraph?.graphConfiguredAndReady
    ) {
      return;
    }
    this.isCurrentlyForceDisabled = true;
    const id = this.id;
    const inputData = this.getInputData(onValueName);
    const inputDataOff = this.getInputData(offValueName);
    const disabledBefore = this.getInputData(disabledName) ? true : false;

    const applyFunction = async (value) => {
      const safeNode = SerializableActionHandler.getSafeNode(id);
      await safeNode.getOutputSocketByName(outName).setDataAndWait(value);
      await safeNode.executeOptimizedChain();
    };

    const buttonAction = async (isDown) => {
      await ActionHandler.performRawAction(
        new BakedAction(
          new SerializableAction(
            applyFunction,
            applyFunction,
            isDown ? 'Button Press' : 'Button Release',
          ),
          isDown ? inputData : inputDataOff,
          isDown ? inputDataOff : inputData,
        ),
      );
    };

    this.setInputData(disabledName, true);
    this.forceRerender();
    try {
      await buttonAction(true);
      await buttonAction(false);
    } finally {
      this.isCurrentlyForceDisabled = false;
      this.setInputData(disabledName, disabledBefore);
      this.forceRerender(false);
    }
  };

  getWidgetContent(props: HybridWidgetContentProps): React.ReactElement {
    const node = props.node;
    const isDisabled = props.disabled || props[disabledName];
    const tokens = getSizeTokens(props[sizeName]);

    return (
      <WidgetPaper node={node} inDashboard={props.inDashboard}>
        <Button
          data-cy={'button-' + props[labelName]}
          variant={props[variantName]}
          color={props[colorName]}
          size={getMuiSize(props[sizeName])}
          disabled={isDisabled}
          disableRipple
          sx={{
            margin: 'auto',
            minHeight: props.inDashboard
              ? `${tokens.controlHeight}px`
              : undefined,
            lineHeight: props.inDashboard
              ? `${36 * tokens.scale}px`
              : `${(node.nodeHeight / 5) * tokens.scale}px`,
            width: '100%',
            height: '100%',
            pointerEvents: isDisabled ? 'none' : undefined,
            // in the dashboard minHeight (controlHeight) owns the height, so
            // any fixed padding here can only overshoot it - at XS the 24px
            // this used to add made the control 42px instead of its 36px token
            py: props.inDashboard ? 0 : 1.5,
            '&.Mui-disabled': {
              opacity: 0.6,
              color: 'text.secondary',
              backgroundColor: (theme) =>
                props[variantName] === 'contained'
                  ? 'rgba(80, 80, 80, 0.3)'
                  : 'transparent',
              border:
                props[variantName] === 'outlined'
                  ? '1px solid rgba(120, 120, 120, 0.5)'
                  : 'none',
            },
          }}
          onClick={() => (node as WidgetButton).handleOnClick()}
        >
          <Typography
            sx={{
              fontSize: props.inDashboard
                ? `${tokens.fontSize}px`
                : `${(node.nodeHeight / 6) * tokens.scale}px`,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
              textTransform: 'none',
            }}
          >
            {props[labelName]}
          </Typography>
        </Button>
      </WidgetPaper>
    );
  }
}

const buttonGroupOptionsName = 'Button Options';
const selectedButtonIndex = 'Selected Button';
const isToggleGroupName = 'Toggle Mode';
const orientationName = 'Vertical';

export class WidgetButtonGroup extends WidgetHybridBase {
  public getName(): string {
    return 'Button Group';
  }

  public getDescription(): string {
    return 'Adds a group of buttons that can also function as toggle buttons';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        buttonGroupOptionsName,
        new ArrayType(),
        defaultOptions,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        isToggleGroupName,
        new BooleanType(),
        true,
        false,
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        selectedButtonIndex,
        new NumberType(true, 0, 10),
        0,
        () => this.getInputData(isToggleGroupName),
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        variantName,
        new EnumType(variantOptions, undefined, true),
        variantOptions[0].text,
        () => !this.getInputData(isToggleGroupName),
      ),
      new Socket(
        SOCKET_TYPE.IN,
        colorName,
        new EnumType(colorOptions, undefined, true),
        colorOptions[0].text,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        orientationName,
        new BooleanType(),
        false,
        false,
      ),
      getSizeSocket(),
      new Socket(SOCKET_TYPE.OUT, outName, new StringType(), undefined, false),
      new Socket(SOCKET_TYPE.OUT, outIndexName, new NumberType()),
    ];
  }

  public getDefaultNodeWidth(): number {
    return 340;
  }

  public getDefaultNodeHeight(): number {
    return 90;
  }

  getPreferredOutputSocketName(): string {
    return outName;
  }

  onNodeResize = (newWidth, newHeight) => {
    this.forceRerender();
  };

  protected getBackPropagationTargets(): BackPropagation {
    return {
      SocketToGetValue: this.getInputSocketByName(selectedButtonIndex),
      SocketToGetOptions: this.getInputSocketByName(buttonGroupOptionsName),
      SocketToTakeName: this.getInputSocketByName(labelName),
    };
  }

  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    await super.onExecute(inputObject, outputObject);

    const options = inputObject[buttonGroupOptionsName];
    const selectedIndex = Math.max(
      0,
      Math.min(options.length - 1, inputObject[selectedButtonIndex]),
    );

    const selectedValue = options[selectedIndex];
    this.setOutputData(outName, selectedValue);
    this.setOutputData(outIndexName, selectedIndex);
  }

  handleButtonClick = async (index) => {
    const id = this.id;
    const prev = this.getInputData(selectedButtonIndex);

    // If we're in regular button mode (not toggle), or we're in exclusive toggle mode
    // simply set the selected index to the clicked button
    // If we're in non-exclusive toggle mode, we'd need state to track multiple selections
    // but since we're limited to a single output, we'll still use the last clicked

    const applyFunction = async (newIndex) => {
      const safeNode = SerializableActionHandler.getSafeNode(id);
      safeNode.setInputData(selectedButtonIndex, newIndex);
      const options = safeNode.getInputData(buttonGroupOptionsName);
      const selectedOption = options[newIndex];
      safeNode.setOutputData(outName, selectedOption);
      safeNode.setOutputData(outIndexName, newIndex);
      await safeNode.executeOptimizedChain();
    };

    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(applyFunction, applyFunction, 'Select Button'),
        index,
        prev,
      ),
    );
  };

  getWidgetContent(props: HybridWidgetContentProps): React.ReactElement {
    const node = props.node;
    const options = props[buttonGroupOptionsName] || [];
    const selectedIndex = Math.max(
      0,
      Math.min(options.length - 1, props[selectedButtonIndex]),
    );

    // Get configuration props
    const isToggleMode = props[isToggleGroupName];
    const variant = props[variantName];
    const color = props[colorName];
    const isVertical = props[orientationName];

    // Calculate dynamic font sizes based on node dimensions
    const tokens = getSizeTokens(props[sizeName]);
    const fontSize = props.inDashboard
      ? `${tokens.fontSize}px`
      : `${Math.max(12, node.nodeHeight / 12) * tokens.scale}px`;

    return (
      <WidgetPaper node={node} inDashboard={props.inDashboard}>
        <Box
          sx={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
              flex: 1,
            }}
          >
            {isToggleMode ? (
              // Toggle Button Group
              <Box
                sx={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: isVertical ? 'column' : 'row',
                  justifyContent: 'center',
                  pointerEvents: props.disabled ? 'none' : undefined,
                }}
              >
                {options.map((option, index) => {
                  const isFirst = index === 0;
                  const isLast = index === options.length - 1;

                  return (
                    <Button
                      key={index}
                      variant={
                        selectedIndex === index ? 'contained' : 'outlined'
                      }
                      color={color}
                      size={getMuiSize(props[sizeName])}
                      onClick={() =>
                        void (node as WidgetButtonGroup).handleButtonClick(
                          index,
                        )
                      }
                      disabled={props.disabled}
                      sx={{
                        fontSize: fontSize,
                        minHeight: props.inDashboard
                          ? `${tokens.controlHeight}px`
                          : undefined,
                        flex: isVertical ? '0 0 auto' : '1 1 0',
                        minWidth: isVertical ? '90%' : '30%',
                        ...(selectedIndex === index && {
                          boxShadow: 2,
                        }),
                        py: props.inDashboard ? 0 : 1.5,
                        textTransform: 'none',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        borderRadius: 0,
                        ...(isVertical
                          ? {
                              ...(isFirst && {
                                borderTopLeftRadius: 4,
                                borderTopRightRadius: 4,
                              }),
                              ...(isLast && {
                                borderBottomLeftRadius: 4,
                                borderBottomRightRadius: 4,
                              }),
                            }
                          : {
                              ...(isFirst && {
                                borderTopLeftRadius: 4,
                                borderBottomLeftRadius: 4,
                              }),
                              ...(isLast && {
                                borderTopRightRadius: 4,
                                borderBottomRightRadius: 4,
                              }),
                            }),
                        m: 0,
                        ...(isFirst
                          ? {}
                          : isVertical
                            ? { mt: '-1px' }
                            : { ml: '-1px' }),
                        ...(selectedIndex === index && {
                          position: 'relative',
                          zIndex: 1,
                        }),
                        '&.Mui-disabled': {
                          opacity: 0.7,
                          color: 'text.secondary',
                          backgroundColor: (theme) =>
                            props[variantName] === 'contained'
                              ? 'rgba(0, 0, 0, 0.12)'
                              : 'transparent',
                          border:
                            props[variantName] === 'outlined'
                              ? '1px solid rgba(0, 0, 0, 0.23)'
                              : 'none',
                        },
                      }}
                    >
                      {option}
                    </Button>
                  );
                })}
              </Box>
            ) : (
              // Regular Button Group
              <ButtonGroup
                variant={variant}
                color={color}
                size={getMuiSize(props[sizeName])}
                orientation={isVertical ? 'vertical' : 'horizontal'}
                sx={{
                  justifyContent: 'center',
                  pointerEvents: props.disabled ? 'none' : undefined,
                  width: '100%',
                  '& .MuiButtonGroup-grouped': {
                    flex: 1,
                  },
                }}
                disabled={props.disabled}
              >
                {options.map((option, index) => (
                  <Button
                    key={index}
                    onClick={() =>
                      void (node as WidgetButtonGroup).handleButtonClick(index)
                    }
                    sx={{
                      fontSize: fontSize,
                      minHeight: props.inDashboard
                        ? `${tokens.controlHeight}px`
                        : undefined,
                      py: props.inDashboard ? 0 : 1.5,
                      textTransform: 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {option}
                  </Button>
                ))}
              </ButtonGroup>
            )}
          </Box>
        </Box>
      </WidgetPaper>
    );
  }
}

const switchDefaultData = false;
const switchDefaultName = 'Switch';

export class WidgetSwitch extends WidgetHybridBase {
  public getName(): string {
    return 'Switch';
  }

  public getDescription(): string {
    return 'Adds a switch to toggle between values';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        initialValueName,
        new BooleanType(),
        switchDefaultData,
        false,
      ),
      new Socket(SOCKET_TYPE.IN, offValueName, new BooleanType(), false, false),
      new Socket(SOCKET_TYPE.IN, onValueName, new BooleanType(), true, false),
      new Socket(
        SOCKET_TYPE.IN,
        labelName,
        new StringType(),
        switchDefaultName,
        false,
      ),
      getSizeSocket(),
      new Socket(SOCKET_TYPE.OUT, outName, new BooleanType()),
    ];
  }

  public getVersion(): number {
    return 3;
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion < 2 && this.getInputSocketByName('Initial Selection')) {
      await this.replaceSocketWithOtherSocket(
        this.getInputSocketByName('Initial Selection'),
        this.getInputSocketByName(initialValueName),
      );
      // sockets got renamed
    }
    if (previousVersion < 3) {
      // 'On'/'Off' -> 'On value'/'Off value'
      await this.renameInputSocketPreservingData('On', onValueName);
      await this.renameInputSocketPreservingData('Off', offValueName);
    }
  }

  public getDefaultNodeWidth(): number {
    return 200;
  }

  public getDefaultNodeHeight(): number {
    return 104;
  }

  onNodeResize = (newWidth, newHeight) => {
    this.forceRerender();
  };

  protected getBackPropagationTargets(): BackPropagation {
    return {
      SocketToGetValue: this.getInputSocketByName(initialValueName),
      SocketToTakeName: this.getInputSocketByName(labelName),
    };
  }

  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    await super.onExecute(inputObject, outputObject);
    const onValue = inputObject[onValueName];
    const offValue = inputObject[offValueName];
    const newValue = inputObject[initialValueName] ? onValue : offValue;
    this.setInputData(initialValueName, newValue);
    this.setOutputData(outName, newValue);
  }

  handleOnChange = (value) => {
    const id = this.id;
    const prev = this.getInputData(initialValueName);
    const applyFunction = async (newValue) => {
      const safeNode = SerializableActionHandler.getSafeNode(
        id,
      ) as WidgetSwitch;
      const onValue = safeNode.getInputData(onValueName);
      const offValue = safeNode.getInputData(offValueName);
      safeNode.setInputData(initialValueName, value);
      safeNode.setOutputData(outName, newValue ? onValue : offValue);
      await safeNode.executeOptimizedChain();
    };
    void ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(applyFunction, applyFunction, 'Toggle Switch'),
        value,
        prev,
      ),
    );
  };

  getWidgetContent(props: HybridWidgetContentProps): React.ReactElement {
    const node = props.node;
    const tokens = getSizeTokens(props[sizeName]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const checked = event.target.checked;
      (node as WidgetSwitch).handleOnChange(checked);
    };

    return (
      <WidgetPaper node={node} inDashboard={props.inDashboard}>
        <FormControl component="fieldset" sx={{ margin: 'auto' }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{
              minWidth: 'min-content',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <Switch
              disabled={props.disabled}
              size="medium"
              checked={props[initialValueName]}
              color="primary"
              onChange={handleChange}
              sx={{
                transform: props.inDashboard
                  ? `scale(${1.4 * tokens.scale})`
                  : `scale(${(node.nodeHeight / 60) * tokens.scale})`,
                pointerEvents: props.disabled ? 'none' : undefined,
              }}
            />
            <Typography
              sx={{
                mt: props.inDashboard ? '0' : `${node.nodeHeight / 24}px`,
                fontSize: props.inDashboard
                  ? `${tokens.fontSize}px`
                  : `${(node.nodeHeight / 6) * tokens.scale}px`,
              }}
            >
              {props[labelName]}
            </Typography>
          </Stack>
        </FormControl>
      </WidgetPaper>
    );
  }
}
