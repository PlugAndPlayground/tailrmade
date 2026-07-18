import React from 'react';
import { AbstractType, DataTypeProps } from './abstractType';
import { DEFAULT_IMAGE } from '../../utils/constants';
import { TParseType } from '../../utils/interfaces';

export interface ImageTypeProps extends DataTypeProps {
  dataType: ImageType;
}

export const ImageWidget: React.FunctionComponent<ImageTypeProps> = (props) => {
  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  return (
    <img
      style={{
        width: '100%',
        height: '100%',
        maxHeight: '60vh',
        objectFit: 'contain',
      }}
      src={property.data}
      alt={property.name}
      onError={({ currentTarget }) => {
        currentTarget.onerror = null; // prevents looping
        currentTarget.src = DEFAULT_IMAGE;
        currentTarget.style.width = '48px';
      }}
    />
  );
};

export class ImageType extends AbstractType {
  constructor() {
    super();
  }

  getName(): string {
    return 'Image';
  }

  // append b64 header if it is missing
  parse(data: any): TParseType {
    let value = data;
    if (typeof data == 'string' && !data.startsWith('data'))
      value = 'data:image/png;base64,' + data;
    return { value, warnings: [] };
  }

  getInputWidget = (props: any): any => {
    props.dataType = this;
    const property = props.socketsToUpdate[0];
    if (typeof property.data === 'string') {
      return <ImageWidget {...props} />;
    }
    return '';
  };

  getOutputWidget = (props: any): any => {
    props.dataType = this;
    const property = props.socketsToUpdate[0];
    if (typeof property.data === 'string') {
      return <ImageWidget {...props} />;
    }
    return '';
  };

  getDefaultValue(): any {
    return DEFAULT_IMAGE;
  }

  getComment(data: any): string {
    return data ? 'Image' : 'No Image';
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['draw_image', 'imageshader', 'image'];
  }

  recommendedInputNodeWidgets(): string[] {
    return ['image', 'extract_image_from_graphics'];
  }
}
