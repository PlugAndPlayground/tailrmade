import { AbstractType } from '../datatypes/abstractType';
import { CodeType } from '../datatypes/codeType';
import { JSONType } from '../datatypes/jsonType';
import { CodeEditorAbstract } from './abstractEditor';

export class CodeEditor extends CodeEditorAbstract {
  public getName(): string {
    return 'Code editor';
  }

  public getDescription(): string {
    return 'Widget Code editor';
  }

  protected getEditorLanguage(): string {
    return 'javascript';
  }
  protected getSocketType(): AbstractType {
    return new CodeType();
  }
}

export class JSONEditor extends CodeEditorAbstract {
  public getName(): string {
    return 'JSON editor';
  }
  public getDescription(): string {
    return 'Widget JSON editor';
  }

  protected getEditorLanguage(): string {
    return 'json';
  }
  protected getSocketType(): AbstractType {
    return new JSONType();
  }
}
