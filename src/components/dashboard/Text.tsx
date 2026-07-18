import React, { useEffect, useRef, useState } from 'react';
import { useEditor, useNode } from '@craftjs/core';
import { Stack, ToggleButton } from '@mui/material';
import {
  AlignmentControl,
  ColorControl,
  FormWrapper,
  SliderControl,
} from './SettingsControls';
import { DATA_DASHBOARD_EDITABLE } from '../../utils/constants';
import { TRgba } from '../../utils/color';

type TextWidgetProps = {
  fontSize: number;
  textAlign: string;
  fontWeight: string;
  color: Record<'r' | 'g' | 'b' | 'a', string>;
  text: string;
};

export const textDefaultProps: TextWidgetProps = {
  fontSize: 20,
  textAlign: 'left',
  fontWeight: 'normal',
  color: { r: '51', g: '51', b: '51', a: '1' },
  text: 'Hi',
};

function Contenteditable(props) {
  const contentEditableRef = useRef(null);

  useEffect(() => {
    if (contentEditableRef.current.innerHTML !== props.value) {
      contentEditableRef.current.innerHTML = props.value.replace(/\n/g, '<br>');
    }
  });

  return (
    <div
      contentEditable={props.contentEditable}
      ref={contentEditableRef}
      onInput={(event) => {
        props.onChange((event.target as any).innerHTML);
      }}
      style={{
        fontSize: `${props.fontSize}px`,
        color: props.color,
        textAlign: props.textAlign,
        fontWeight: props.fontWeight,
        whiteSpace: 'pre-wrap',
        lineHeight: 1.2,
      }}
      {...{ [DATA_DASHBOARD_EDITABLE]: 'true' }}
    />
  );
}

interface TextViewProps extends TextWidgetProps {
  editable?: boolean;
  onChange?: (updatedContent: string) => void;
  innerRef?: (ref: HTMLDivElement | null) => void;
}

// Pure presentational text, usable outside of a craftjs Editor
// (e.g. by the SurfaceRenderer). The craft `Text` below wraps it.
export const TextView = ({
  fontSize,
  textAlign,
  fontWeight,
  color,
  text,
  editable = false,
  onChange,
  innerRef,
  ...props
}: TextViewProps & Record<string, any>) => {
  return (
    <div {...props} ref={innerRef} style={{ width: '100%' }}>
      <Contenteditable
        contentEditable={editable}
        value={text}
        onChange={onChange ?? (() => {})}
        fontSize={fontSize}
        color={Object.assign(new TRgba(), color).toString()}
        fontWeight={fontWeight}
        textAlign={textAlign}
      />
    </div>
  );
};

export const Text = ({
  fontSize,
  textAlign,
  fontWeight,
  color,
  text,
  ...props
}) => {
  const { isEditMode } = useEditor((state) => ({
    isEditMode: state.options.enabled,
  }));
  const {
    connectors: { connect, drag },
    actions: { setProp },
  } = useNode((node) => ({
    dragged: node.events.dragged,
  }));

  const [editable, setEditable] = useState(isEditMode);
  const [content, setContent] = useState(text);

  useEffect(() => {
    setEditable(isEditMode);
  }, [isEditMode]);

  return (
    <TextView
      {...props}
      innerRef={(ref) => ref && connect(drag(ref))}
      editable={editable}
      text={content}
      onChange={(updatedContent) => {
        setProp(
          (props) =>
            (props.text = updatedContent
              .replace(/<div>/g, '\n')
              .replace(/<\/div>/g, '')
              .replace(/<br\/?>/g, '\n')),
        );
        setContent(updatedContent);
      }}
      fontSize={fontSize}
      color={color}
      fontWeight={fontWeight}
      textAlign={textAlign}
    />
  );
};

const TextSettings = () => {
  const {
    actions: { setProp },
    fontSize,
    color,
    textAlign,
    fontWeight,
  } = useNode((node) => ({
    text: node.data.props.text,
    fontSize: node.data.props.fontSize,
    color: node.data.props.color,
    fontWeight: node.data.props.fontWeight,
    textAlign: node.data.props.textAlign,
  }));

  return (
    <Stack
      spacing={0.5}
      sx={{
        bgcolor: 'background.paper',
      }}
    >
      <FormWrapper>
        <SliderControl
          value={fontSize || 20}
          onChange={(value) =>
            setProp((props: any) => (props.fontSize = value))
          }
          label="Font size"
          min={1}
          max={50}
        />
      </FormWrapper>
      <AlignmentControl
        value={textAlign}
        onChange={(value) => setProp((props: any) => (props.textAlign = value))}
        label="Text alignment"
        options={[
          <ToggleButton size="small" value="left" key="left">
            Left
          </ToggleButton>,
          <ToggleButton size="small" value="center" key="center">
            Center
          </ToggleButton>,
          <ToggleButton size="small" value="right" key="right">
            Right
          </ToggleButton>,
        ]}
      />
      <AlignmentControl
        value={fontWeight}
        onChange={(value) =>
          setProp((props: any) => (props.fontWeight = value))
        }
        label="Font weight"
        options={[
          <ToggleButton size="small" value="400" key="400">
            Regular
          </ToggleButton>,
          <ToggleButton size="small" value="500" key="500">
            Medium
          </ToggleButton>,
          <ToggleButton size="small" value="700" key="700">
            Bold
          </ToggleButton>,
        ]}
      />
      <ColorControl setProp={setProp} color={color} controlBackground={false} />
    </Stack>
  );
};

Text.craft = {
  props: { ...textDefaultProps },
  related: {
    settings: TextSettings,
  },
};
