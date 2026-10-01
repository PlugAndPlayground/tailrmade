import { JSONType } from './jsonType';

export class WorkbookType extends JSONType {
  getName(): string {
    return 'Workbook';
  }

  getDefaultValue() {
    return { SheetNames: [], Sheets: {} };
  }

  configureOnLoad(): boolean {
    return false;
  }

  allowedToAutomaticallyAdapt(): boolean {
    return false;
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['table2', 'spreadsheettotable'];
  }
}
