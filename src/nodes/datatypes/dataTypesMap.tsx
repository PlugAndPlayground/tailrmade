import { AnyType } from './anyType';
import { ArrayType } from './arrayType';
import { BooleanType } from './booleanType';
import { CodeType } from './codeType';
import { ColorType } from './colorType';
import { DeferredPixiType } from './deferredPixiType';
import { DeferredReactType } from './deferredHtmlType';
import { TwoDVectorType } from './twoDVectorType';
import { DynamicEnumType } from './dynamicEnumType';
import { EnumType } from './enumType';
import { FileType } from './fileType';
import { FunctionType } from './functionType';
import {
  GraphInputXType,
  GraphInputXYType,
  GraphInputXYZType,
} from './graphInputType';
import { ImageType } from './imageType';
import { JSONType } from './jsonType';
import { HtmlType } from './htmlType';
import { NumberType } from './numberType';
import { StringType } from './stringType';
import { TriggerType } from './triggerType';
import FormatJSONType from './formatJSONType';
import InputArrayKeysType from './inputArrayKeysType';
import { JSONArrayType } from './jsonArrayType';
import { FilterType } from './filterType';
import { ImageResourceMapType } from './imageResourceMapType';
import { ThreeDVectorType } from './threeDVectorType';
import { SvgImageType } from './svgImageType';
import { WidgetLayoutType } from './widgetLayoutType';

// I hate this but what can you do
export const allDataTypes = {
  AnyType: AnyType,
  ArrayType: ArrayType,
  JSONArrayType: JSONArrayType,
  BooleanType: BooleanType,
  ColorType: ColorType,
  NumberType: NumberType,
  DeferredPixiType: DeferredPixiType,
  DeferredReactType: DeferredReactType,
  TwoDVectorType: TwoDVectorType,
  ThreeDVectorType: ThreeDVectorType,
  FileType: FileType,
  FunctionType: FunctionType,
  StringType: StringType,
  TriggerType: TriggerType,
  JSONType: JSONType,
  HtmlType: HtmlType,
  ImageType: ImageType,
  CodeType: CodeType,
  EnumType: EnumType,
  DynamicEnumType: DynamicEnumType,
  GraphInputXType: GraphInputXType,
  GraphInputXYType: GraphInputXYType,
  GraphInputXYZType: GraphInputXYZType,
  FormatJSONType: FormatJSONType,
  InputArrayKeysType: InputArrayKeysType,
  FilterType: FilterType,
  ImageResourceMapType: ImageResourceMapType,
  SvgImageType: SvgImageType,
  WidgetLayoutType: WidgetLayoutType,
};

export const dropDownSelectableTypes = {
  AnyType: AnyType,
  ArrayType: ArrayType,
  BooleanType: BooleanType,
  ColorType: ColorType,
  NumberType: NumberType,
  FunctionType: FunctionType,
  StringType: StringType,
  JSONType: JSONType,
  HtmlType: HtmlType,
  ImageType: ImageType,
  CodeType: CodeType,
  TwoDVectorType: TwoDVectorType,
  ThreeDVectorType: ThreeDVectorType,
};
