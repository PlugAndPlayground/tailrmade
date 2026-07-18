import * as React from 'react';
import { Paper, Stack } from '@mui/material';
import HybridNode2 from '../../classes/HybridNode2';
import { NODE_TYPE_COLOR } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { WidgetProps } from '../../utils/interfaces';
import { EnumStructure } from '../datatypes/enumType';

export const defaultProps: WidgetProps = {
  background: { r: 9, g: 13, b: 26, a: 0 },
  width: '100%',
  height: 'auto',
  minWidth: '48px',
  minHeight: '48px',
};

export const initialValueName = 'Initial Value';
export const labelName = 'Label';
export const offValueName = 'Off value';
export const onValueName = 'On value';
export const optionsName = 'Options';
export const selectedOptionName = 'Selected Option';
export const variantName = 'Variant';
export const colorName = 'Color';
export const sizeName = 'Size';

export const outName = 'Out';
export const outIndexName = 'Index';
export const fallbackValueName = 'Fallback Option';

export const defaultOptions = ['Option 1', 'Option 2', 'Option 3'];

export function stringifyIfNeeded(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

export const colorOptions: EnumStructure = [
  {
    text: 'primary',
  },
  {
    text: 'secondary',
  },
  {
    text: 'success',
  },
  {
    text: 'error',
  },
  {
    text: 'info',
  },
  {
    text: 'warning',
  },
];

export const CANVAS_MARGIN = 4;

export abstract class WidgetHybridBase extends HybridNode2 {
  public getTags(): string[] {
    return ['Widget'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.WIDGET);
  }

  getOpacity(): number {
    return 0.01;
  }

  getRoundedCorners(): boolean {
    return false;
  }

  getWidgetProps(): WidgetProps {
    return { ...defaultProps, heightMode: 'hug' };
  }

  /**
   * Widget nodes are always interactive in canvas mode.
   * @returns true
   */
  public isWidget(): boolean {
    return true;
  }
}

interface WidgetPaperProps {
  node: HybridNode2;
  inDashboard?: boolean;
  hasBackground?: boolean;
  children: React.ReactNode;
}

export const WidgetPaper = React.forwardRef<HTMLDivElement, WidgetPaperProps>(
  ({ node, inDashboard = false, hasBackground = true, children }, ref) => {
    return (
      <Paper
        ref={ref}
        elevation={0}
        component={Stack}
        direction="column"
        justifyContent="center"
        sx={{
          bgcolor:
            inDashboard || !hasBackground
              ? 'transparent'
              : 'background.default',
          fontSize: '16px',
          border: 0,
          width: inDashboard
            ? 'auto'
            : `${(node as any).getHybridNodeWidth()}px`,
          height: inDashboard
            ? '100%'
            : `${(node as any).getHybridNodeHeight()}px`,
          padding: inDashboard ? 0 : `${4 * CANVAS_MARGIN}px`,
        }}
      >
        {children}
      </Paper>
    );
  },
);
