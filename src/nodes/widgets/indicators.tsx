import React from 'react';
import { Box, Typography } from '@mui/material';
import {
  WidgetHybridBase,
  WidgetPaper,
  getSizeSocket,
  getSizeTokens,
  sizeName,
  useWidgetSize,
  useSizeTokens,
} from './abstract';
import Socket from '../../classes/SocketClass';
import { BooleanType } from '../datatypes/booleanType';
import { ColorType } from '../datatypes/colorType';
import { StringType } from '../datatypes/stringType';
import { SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { WidgetContentProps } from '../../utils/interfaces';
import { BackPropagation } from '../../interfaces';

// Socket names
const diodeInputName = 'Diode Input';
const diodeColorName = 'Diode Color';
const labelName = 'Label';

export class WidgetDiode extends WidgetHybridBase {
  public getName(): string {
    return 'Diode';
  }

  public getDescription(): string {
    return 'A colored diode that can be on or off';
  }

  public getVersion(): number {
    return 2;
  }

  public async migrate(previousVersion: number): Promise<void> {
    await super.migrate(previousVersion);
    if (previousVersion < 2) {
      this.resizeAndDraw(160, 160);
    }
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, diodeInputName, new BooleanType(), true),
      new Socket(
        SOCKET_TYPE.IN,
        diodeColorName,
        new ColorType(),
        TRgba.white(),
        false,
      ),
      new Socket(SOCKET_TYPE.IN, labelName, new StringType(), 'Diode', false),
      getSizeSocket(),
    ];
  }

  public getDefaultNodeWidth(): number {
    return 160;
  }

  public getDefaultNodeHeight(): number {
    return 160;
  }

  onNodeResize = (newWidth, newHeight) => {
    this.forceRerender();
  };

  protected getBackPropagationTargets(): BackPropagation {
    return {
      SocketToGetValue: this.getInputSocketByName(diodeInputName),
      SocketToTakeName: this.getInputSocketByName(labelName),
    };
  }

  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    await super.onExecute(inputObject, outputObject);
    // No specific execution logic needed, just display
  }

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    const node = props.node;
    const isOn = props[diodeInputName];
    const diodeColor = TRgba.fromObject(props[diodeColorName]);
    const glowStrength = 5;

    // `size` further down is a pixel diameter, not a density step - keep the
    // two apart
    const widgetSize = useWidgetSize(props[sizeName]);
    const tokens = useSizeTokens(widgetSize);
    const size =
      Math.min(
        props.inDashboard ? 40 : node.nodeWidth * 0.5,
        props.inDashboard ? 40 : node.nodeHeight * 0.5,
      ) * tokens.scale;

    // Create darker version of the color for off state or border
    const darkerColor = diodeColor.multiply(0.3);
    darkerColor.a = diodeColor.a * 0.4;

    return (
      <WidgetPaper
        node={node as WidgetDiode}
        inDashboard={props.inDashboard}
        hasBackground={false}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
          }}
        >
          <Box
            sx={{
              width: size,
              height: size,
              borderRadius: '50%',
              // Replace the backgroundColor with gradient backgrounds
              background: isOn
                ? `radial-gradient(circle at 35% 35%, 
          ${diodeColor.lighten(0.5).hexa()}, 
          ${diodeColor.hexa()} 45%, 
          ${diodeColor.darken(0.2).hexa()} 80%)`
                : `radial-gradient(circle at 35% 35%, 
          ${darkerColor.lighten(0.3).hexa()}, 
          ${darkerColor.hexa()} 45%, 
          ${darkerColor.darken(0.1).hexa()} 80%)`,
              border: `${size * 0.05}px solid ${darkerColor.hexa()}`,
              boxShadow: isOn
                ? `0 0 ${glowStrength}px ${glowStrength / 2}px ${diodeColor.hexa()},
         inset 0 0 ${size * 0.1}px rgba(0,0,0,0.3)` // Inner shadow for depth
                : `inset 0 0 ${size * 0.1}px rgba(0,0,0,0.3)`, // Inner shadow for depth
              transition: isOn ? 'none' : 'box-shadow 0.3s ease',
            }}
          />
          {props[labelName] && (
            <Typography
              variant="subtitle2"
              sx={{
                fontSize: props.inDashboard
                  ? `${tokens.fontSize}px`
                  : `${(node.nodeHeight / 10) * tokens.scale}px`,
                mt: 1,
                textAlign: 'center',
              }}
            >
              {props[labelName]}
            </Typography>
          )}
        </Box>
      </WidgetPaper>
    );
  }
}
