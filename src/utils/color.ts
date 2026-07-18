import Color from 'color';

const COLOR_WHITE = '#F5F5F5';
const COLOR_DARK = '#0C0C0C';
const PIXI_TRANSPARENT_ALPHA = 0.001;

export type TColorHsva = { h: number; s: number; v: number; a: number };

export class TRgba {
  r = 0;
  g = 0;
  b = 0;
  a = 1;

  constructor(r = 0, g = 0, b = 0, a = 1) {
    // colors produced by the AI/MCP can arrive as strings
    this.r = Number(r);
    this.g = Number(g);
    this.b = Number(b);
    this.a = Number(a);
  }

  static fromString(hexOrOtherString: string): TRgba {
    try {
      const parsedData = JSON.parse(hexOrOtherString);
      return Object.assign(new TRgba(), parsedData);
    } catch (error) {
      return TRgba.fromColor(Color(hexOrOtherString));
    }
  }

  object(): string {
    return this.toColor().object();
  }

  toString(): string {
    return this.toColor().rgb().string();
  }

  rgb(): string {
    return this.toColor().rgb().string();
  }

  hsva(): TColorHsva {
    const { color, valpha = 1 } = this.toColor().hsv();
    const [h = 0, s = 0, v = 100] = color;
    return { h, s, v, a: valpha };
  }

  hex(): string {
    return this.toColor().hex();
  }

  hexa(): string {
    return this.toColor().hexa();
  }

  hexNumber(): number {
    return parseInt(this.hex().replace(/^#/, ''), 16);
  }

  negate(): TRgba {
    return TRgba.fromColor(this.toColor().negate().rgb());
  }

  desaturate(value: number): TRgba {
    return TRgba.fromColor(this.toColor().desaturate(value).rgb());
  }

  lighten(value: number): TRgba {
    return TRgba.fromColor(this.toColor().lighten(value).rgb());
  }

  darken(value: number): TRgba {
    return TRgba.fromColor(this.toColor().darken(value).rgb());
  }

  isDark(): boolean {
    return this.toColor().isDark();
  }

  getContrastTextColor(): TRgba {
    return this.toColor().isDark() ? TRgba.white() : TRgba.black();
  }

  setAlpha(value: number): TRgba {
    return TRgba.fromColor(this.toColor().alpha(value));
  }

  getAlpha(preventZero = false): string {
    const alpha = this.toColor().alpha();
    return preventZero ? alpha || PIXI_TRANSPARENT_ALPHA : alpha;
  }

  mix(otherColor: TRgba, blendFactor: number): TRgba {
    return TRgba.fromColor(
      this.toColor().mix(otherColor.toColor(), blendFactor),
    );
  }

  static white(): TRgba {
    return TRgba.fromString(COLOR_WHITE);
  }
  static black(): TRgba {
    return TRgba.fromString(COLOR_DARK);
  }

  multiply(value: number): TRgba {
    return new TRgba(
      this.r * value,
      this.g * value,
      this.b * value,
      this.a * value,
    );
  }

  public static fromObject = (color: any): TRgba => {
    return new TRgba(color.r, color.g, color.b, color.a);
  };

  // private so no temptation to call from outside (lets not expose the Color class at all and keep it TRgba)
  private toColor(): any {
    return Color({
      r: this.r,
      g: this.g,
      b: this.b,
    }).alpha(this.a);
  }

  private static fromColor = (color: any): TRgba => {
    return new TRgba(
      color.color[0],
      color.color[1],
      color.color[2],
      color.valpha,
    );
  };

  public static fromHashedString = (value: string): TRgba => {
    if (!value) {
      return new TRgba();
    }

    const hash = TRgba.stringHash(value);

    const hue = hash % 360;
    const saturation = 0.55 + (((hash >> 8) & 0xff) / 255) * 0.3; // 55% - 85%
    const lightness = 0.45 + (((hash >> 16) & 0xff) / 255) * 0.2; // 45% - 65%

    const { r, g, b } = TRgba.hslToRgb(hue, saturation, lightness);

    return new TRgba(r, g, b, 1);
  };

  public static isTRgba(data: any): boolean {
    return (
      typeof data == 'object' &&
      Object.keys(data).length == 4 &&
      data['r'] !== undefined &&
      data['g'] !== undefined &&
      data['b'] !== undefined &&
      data['a'] !== undefined
    );
  }

  public static randomColor(): TRgba {
    return new TRgba(
      Math.random() * 255,
      Math.random() * 255,
      Math.random() * 255,
      1,
    );
  }

  private static stringHash(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0; // force 32-bit int
    }
    return hash >>> 0;
  }

  private static hslToRgb(
    hue: number,
    saturation: number,
    lightness: number,
  ): { r: number; g: number; b: number } {
    const normalizedHue = ((hue % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const hPrime = normalizedHue / 60;
    const x = c * (1 - Math.abs((hPrime % 2) - 1));

    let r1 = 0;
    let g1 = 0;
    let b1 = 0;

    if (hPrime >= 0 && hPrime < 1) {
      r1 = c;
      g1 = x;
    } else if (hPrime >= 1 && hPrime < 2) {
      r1 = x;
      g1 = c;
    } else if (hPrime >= 2 && hPrime < 3) {
      g1 = c;
      b1 = x;
    } else if (hPrime >= 3 && hPrime < 4) {
      g1 = x;
      b1 = c;
    } else if (hPrime >= 4 && hPrime < 5) {
      r1 = x;
      b1 = c;
    } else if (hPrime >= 5 && hPrime < 6) {
      r1 = c;
      b1 = x;
    }

    const m = lightness - c / 2;

    return {
      r: Math.round((r1 + m) * 255),
      g: Math.round((g1 + m) * 255),
      b: Math.round((b1 + m) * 255),
    };
  }
}
