// The dynamic Text node's socket vocabulary. Headless, so graph migrations
// and the surface conversions can share it with the node class.
import { normalizeTextProps, TextProps } from './model';

export const TEXT_NODE_TYPE = 'Text';

export const TEXT_NODE_SOCKETS = {
  output: 'Output',
  content: 'Content',
  variant: 'Variant',
  tone: 'Tone',
  alignment: 'Alignment',
  customStyles: 'Custom styles',
} as const;

export function textPropsToSocketValues(
  props: TextProps,
): Record<string, unknown> {
  return {
    [TEXT_NODE_SOCKETS.content]: props.content,
    [TEXT_NODE_SOCKETS.variant]: props.variant,
    [TEXT_NODE_SOCKETS.tone]: props.tone,
    [TEXT_NODE_SOCKETS.alignment]: props.alignment,
    [TEXT_NODE_SOCKETS.customStyles]: props.customStyles,
  };
}

export function textPropsFromSocketValues(
  values: Record<string, unknown>,
): TextProps {
  return normalizeTextProps({
    content: values[TEXT_NODE_SOCKETS.content],
    variant: values[TEXT_NODE_SOCKETS.variant],
    tone: values[TEXT_NODE_SOCKETS.tone],
    alignment: values[TEXT_NODE_SOCKETS.alignment],
    customStyles: values[TEXT_NODE_SOCKETS.customStyles],
  });
}
