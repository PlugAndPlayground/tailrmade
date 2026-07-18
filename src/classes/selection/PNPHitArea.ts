import * as PIXI from 'pixi.js';

export class PNPHitArea implements PIXI.IHitArea {
  hitFunction: (x: number, y: number) => boolean;
  constructor(inHitFunction: (x: number, y: number) => boolean) {
    this.hitFunction = inHitFunction;
  }

  contains(x: number, y: number): boolean {
    return this.hitFunction(x, y);
  }
}
