import React from 'react';
import { AbstractType } from './abstractType';
import { ImageWidget } from './imageType';
import { HtmlWidget } from '../../widgets';
import { HtmlTypeProps } from './htmlType';

export const convertSvgToBase64 = (svgData: string): string => {
  if (!svgData) return '';

  const base64 = btoa(svgData);
  return `data:image/svg+xml;base64,${base64}`;
};

export const convertSvgToBase64WithResolution = (
  svgData: string,
  maxSize: number,
): Promise<string> => {
  if (!svgData) return Promise.resolve('');

  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svgData], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const aspectRatio = img.naturalWidth / img.naturalHeight;

      let targetWidth: number;
      let targetHeight: number;

      if (aspectRatio >= 1) {
        targetWidth = maxSize;
        targetHeight = maxSize / aspectRatio;
      } else {
        targetHeight = maxSize;
        targetWidth = maxSize * aspectRatio;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Could not get canvas context'));
        return;
      }

      canvas.width = Math.round(targetWidth);
      canvas.height = Math.round(targetHeight);

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/png', 1.0);
      URL.revokeObjectURL(url);
      resolve(base64);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG'));
    };

    img.src = url;
  });
};

export class SvgImageType extends AbstractType {
  constructor() {
    super();
  }

  getName(): string {
    return 'SvgImage';
  }

  getOutputWidget = (props: any): any => {
    props.dataType = this;
    const property = props.socketsToUpdate[0];
    if (typeof property.data === 'string') {
      // Create a modified socket with converted data for ImageWidget
      const modifiedSocket = {
        ...property,
        data: convertSvgToBase64(property.data),
      };
      const modifiedProps = {
        ...props,
        socketsToUpdate: [modifiedSocket],
      };
      return <ImageWidget {...modifiedProps} />;
    }
    return '';
  };

  getInputWidget = (props: HtmlTypeProps): any => {
    props.dataType = this;
    return <HtmlWidget {...props} />;
  };

  getDefaultValue(): any {
    return '';
  }

  getComment(data: any): string {
    return data ? 'Image' : 'No Image';
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['draw_image', 'imageshader', 'image'];
  }

  recommendedInputNodeWidgets(): string[] {
    return [];
  }
}
