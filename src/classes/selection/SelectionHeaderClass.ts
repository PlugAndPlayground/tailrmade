import * as PIXI from 'pixi.js';
import PPGraph from '../GraphClass';
import Button from '../ButtonClass';
import { TAlignOptions } from '../../utils/interfaces';
import {
  ALIGNOPTIONS,
  ALIGNLEFT_TEXTURE,
  ALIGNCENTERHORIZONTALLY_TEXTURE,
  ALIGNRIGHT_TEXTURE,
  ALIGNTOP_TEXTURE,
  ALIGNCENTERVERTICALLY_TEXTURE,
  ALIGNBOTTOM_TEXTURE,
  DISTRIBUTEHORIZONTAL_TEXTURE,
  DISTRIBUTEVERTICAL_TEXTURE,
  ALIGNAUTO_TEXTURE,
} from '../../utils/constants';

export default class SelectionHeaderClass extends PIXI.Container {
  buttons: Record<string, Button> = {};
  alignLeft: Button;
  alignAuto: Button;
  alignCenterHorizontal: Button;
  alignRight: Button;
  alignTop: Button;
  alignCenterVertical: Button;
  alignBottom: Button;
  distributeHorizontal: Button;
  distributeVertical: Button;

  constructor() {
    super();
  }

  async init(): Promise<void> {
    const buttonsToCreate = [
      {
        texture: ALIGNAUTO_TEXTURE,
        alignOption: ALIGNOPTIONS.ALIGN_AUTO,
        x: 0,
      },
      {
        texture: ALIGNLEFT_TEXTURE,
        alignOption: ALIGNOPTIONS.ALIGN_LEFT,
        x: 28,
      },
      {
        texture: ALIGNCENTERHORIZONTALLY_TEXTURE,
        alignOption: ALIGNOPTIONS.ALIGN_CENTER_HORIZONTAL,
        x: 48,
      },
      {
        texture: ALIGNRIGHT_TEXTURE,
        alignOption: ALIGNOPTIONS.ALIGN_RIGHT,
        x: 68,
      },
      {
        texture: ALIGNTOP_TEXTURE,
        alignOption: ALIGNOPTIONS.ALIGN_TOP,
        x: 96,
      },
      {
        texture: ALIGNCENTERVERTICALLY_TEXTURE,
        alignOption: ALIGNOPTIONS.ALIGN_CENTER_VERTICAL,
        x: 116,
      },
      {
        texture: ALIGNBOTTOM_TEXTURE,
        alignOption: ALIGNOPTIONS.ALIGN_BOTTOM,
        x: 136,
      },
      {
        texture: DISTRIBUTEVERTICAL_TEXTURE,
        alignOption: ALIGNOPTIONS.DISTRIBUTE_VERTICAL,
        x: 164,
      },
      {
        texture: DISTRIBUTEHORIZONTAL_TEXTURE,
        alignOption: ALIGNOPTIONS.DISTRIBUTE_HORIZONTAL,
        x: 184,
      },
    ];

    for (const button of buttonsToCreate) {
      const buttonInstance = await Button.create(button.texture, 16);
      buttonInstance.addEventListener('pointerdown', (e) =>
        this.onPointerDown(e, button.alignOption),
      );
      this.addChild(buttonInstance);
      buttonInstance.x = button.x;
    }
  }

  async onPointerDown(
    event: PIXI.FederatedPointerEvent,
    alignAndDistribute: TAlignOptions,
  ): Promise<void> {
    event.stopPropagation();
    await PPGraph.currentGraph.selection.perform_action_alignNodes(
      alignAndDistribute,
    );
  }
}
