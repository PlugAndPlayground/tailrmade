import { TRgba } from '../utils/color';
import {
  COLOR_ERROR,
  COLOR_WARNING,
  STATUS_SEVERITY,
} from '../utils/constants';

export abstract class PNPStatus extends Error {
  severity: STATUS_SEVERITY;
  id: string;
  // Set by whatever the status got attached to (a socket, so far), so a status
  // can say where it came from without anyone matching on its message.
  protected sourceLabel?: string;

  constructor(message?: string, id = message) {
    super(message);
    this.name = this.getName();
    this.severity = this.getSeverity();
    this.id = id || message || '';
  }
  public abstract getName(): string;
  public abstract getDescription(): string;
  public abstract getColor(): TRgba;
  public abstract getSeverity(): STATUS_SEVERITY;

  // Worth surfacing to the user at all.
  public isProblem(): boolean {
    return this.getSeverity() >= STATUS_SEVERITY.WARNING;
  }

  // Fatal counts as an error, it is the same "this is broken" bucket.
  public isError(): boolean {
    return this.getSeverity() >= STATUS_SEVERITY.ERROR;
  }

  // Severity tier as a name, for anything reporting statuses as text.
  public getSeverityName(): string {
    return 'success';
  }

  // What the status is called where it is shown to the user.
  public getBucketName(): string {
    return 'Success';
  }

  public setSourceLabel(sourceLabel: string): void {
    this.sourceLabel = sourceLabel;
    this.name = this.getName();
  }

  public getSourceLabel(): string | undefined {
    return this.sourceLabel;
  }
}

export abstract class PNPError extends PNPStatus {
  constructor(message?: string) {
    super(message);
  }

  public getSeverity(): number {
    return STATUS_SEVERITY.ERROR;
  }

  public getSeverityName(): string {
    return 'error';
  }

  public getBucketName(): string {
    return 'Error';
  }

  public getName(): string {
    return 'Error';
  }

  public getDescription(): string {
    return 'Nondescript Error';
  }

  public getColor(): TRgba {
    return TRgba.black();
  }
}

export abstract class PNPWarning extends PNPStatus {
  constructor(message?: string) {
    super(message);
  }

  public getSeverity(): number {
    return STATUS_SEVERITY.WARNING;
  }

  public getSeverityName(): string {
    return 'warning';
  }

  public getBucketName(): string {
    return 'Warning';
  }

  public getName(): string {
    return 'Warning';
  }

  public getDescription(): string {
    return 'Nondescript warning';
  }

  public getColor(): TRgba {
    return TRgba.white();
  }
}

export class PNPSuccess extends PNPStatus {
  constructor(message?: string) {
    super(message);
  }

  public getSeverity(): number {
    return STATUS_SEVERITY.SUCCESS;
  }

  public getName(): string {
    return 'Success';
  }

  public getDescription(): string {
    return 'Success';
  }

  public getColor(): TRgba {
    return TRgba.white();
  }
}

export class PNPCustomStatus extends PNPStatus {
  color: TRgba;

  constructor(message?: string, color = TRgba.black(), id = message) {
    super(message, id);
    this.color = color;
  }

  public getSeverity(): number {
    return STATUS_SEVERITY.SUCCESS;
  }

  public getName(): string {
    return 'Custom status';
  }

  public getDescription(): string {
    return 'Custom status';
  }

  public getColor(): TRgba {
    return this.color;
  }
}

export class FatalError extends PNPError {
  constructor(message?: string) {
    super(message);
  }

  public getSeverity(): number {
    return STATUS_SEVERITY.FATAL;
  }

  public getSeverityName(): string {
    return 'fatal';
  }

  public getName(): string {
    return 'Fatal Error';
  }

  public getDescription(): string {
    return 'Unrecoverable error, PNP cannot continue';
  }

  public getColor(): TRgba {
    return TRgba.black();
  }
}

export class NodeExecutionError extends PNPError {
  constructor(message?: string) {
    super(message);
  }

  public getName(): string {
    return 'Node Execution Error';
  }

  public getDescription(): string {
    return 'Node failed to execute ';
  }

  public getColor(): TRgba {
    return TRgba.fromString(COLOR_ERROR);
  }
}

export class NodeConfigurationError extends PNPError {
  constructor(message?: string) {
    super(message);
  }

  public getName(): string {
    return 'Node Configuration Error';
  }

  public getDescription(): string {
    return 'Node configuration failed';
  }

  public getColor(): TRgba {
    return TRgba.fromString(COLOR_WARNING);
  }
}

export class NodeConfigurationWarning extends PNPWarning {
  constructor(message?: string) {
    super(message);
  }

  public getName(): string {
    return 'Node Configuration Warning';
  }

  public getDescription(): string {
    return 'Node is misconfigured but still runs';
  }

  public getColor(): TRgba {
    return TRgba.fromString(COLOR_WARNING);
  }
}

export class NodeExecutionWarning extends PNPWarning {
  constructor(message?: string) {
    super(message);
  }

  public getName(): string {
    return 'Execution Warning';
  }

  public getDescription(): string {
    return 'Node executed with warnings';
  }

  public getColor(): TRgba {
    return TRgba.fromString(COLOR_WARNING);
  }
}

export class SocketParsingWarning extends PNPWarning {
  public getName(): string {
    return this.sourceLabel
      ? `Socket Parsing Warning (${this.sourceLabel})`
      : 'Socket Parsing Warning';
  }

  public getDescription(): string {
    return 'Socket parsing returned warnings';
  }

  public getColor(): TRgba {
    return TRgba.fromString(COLOR_WARNING);
  }
}
