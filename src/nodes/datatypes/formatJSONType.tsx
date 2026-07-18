import { useState } from 'react';
import { AbstractType, DataTypeProps } from './abstractType';
import { Checkbox, FormGroup, TextField } from '@mui/material';
import React from 'react';
import useInterval from 'use-interval';
import { BooleanType } from './booleanType';
import * as PIXI from 'pixi.js';
import { potentiallyUpdateMultipleSocketsData } from '../../widgets';

export interface FormatJSONInterface {
  Enabled: boolean;
  Alias: string;
}
export default class FormatJSONType extends AbstractType {
  getName(): string {
    return 'Format JSON';
  }

  getInputWidget = (props: any): any => {
    props.dataType = this;
    return <FormatJSONWidget {...props} />;
  };

  allowedAsOutput(): boolean {
    return false;
  }

  drawValueSpecificGraphics(graphics: PIXI.Graphics, data: any) {
    super.drawValueSpecificGraphics(graphics, data);
    BooleanType.drawBooleanValue(graphics, data.Enabled);
  }

  getMetaText(data: any): string {
    return data.Alias;
  }
}

export const FormatJSONWidget: React.FunctionComponent<DataTypeProps> = (
  props,
) => {
  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  const propertyEnabled = property.data.Enabled;
  const propertyAlias = property.data.Alias;

  const [enabled, setEnabled] = useState(propertyEnabled);
  const [alias, setAlias] = useState(propertyAlias);

  useInterval(() => {
    if (enabled !== propertyEnabled) {
      setEnabled(propertyEnabled);
    }

    if (alias !== propertyAlias) {
      setAlias(propertyAlias);
    }
  }, 100);

  return (
    <>
      <FormGroup
        row={true}
        sx={{
          display: 'flex',
          flexWrap: 'nowrap',
        }}
      >
        <Checkbox
          name="Include"
          checked={enabled}
          onChange={() => {
            setEnabled(!enabled);
            const newData = { Enabled: !enabled, Alias: alias };
            void potentiallyUpdateMultipleSocketsData(
              props.socketsToUpdate,
              newData,
            );
          }}
          disabled={false}
        />
        <TextField
          label={property.name}
          variant="filled"
          sx={{
            flexGrow: 1,
          }}
          onChange={(event) => {
            const value = event.target.value;
            setAlias(value);
            const newData = { Enabled: enabled, Alias: value };
            void potentiallyUpdateMultipleSocketsData(
              props.socketsToUpdate,
              newData,
            );
          }}
          disabled={!enabled}
          inputProps={{
            type: 'string',
          }}
          value={alias}
        />
      </FormGroup>
    </>
  );
};
