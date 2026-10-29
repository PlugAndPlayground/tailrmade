import * as React from 'react';
import Socket from '../classes/SocketClass';
import { SOCKET_TYPE } from '../utils/constants';
import { EnumStructure, EnumType } from './datatypes/enumType';
import { NumberType } from './datatypes/numberType';

/**
 * When the value a viewer is editing reaches the graph.
 *
 * Every editable widget used to push every intermediate value: one undoable
 * action and one execution of whatever hangs off it per keystroke or per drag
 * step. That is right for a slider driving a live preview and wrong for a text
 * field or a code editor feeding an expensive chain, so the widgets that are
 * edited rather than clicked carry a Commit socket. The immediate modes come
 * first in every option list, so they are the defaults and a graph that never
 * touches this socket behaves exactly as it did.
 */
export const commitModeName = 'Commit';
export const commitDelayName = 'Commit Delay';

// these strings are the stored socket value as well as the button label, so
// they stay at two short words: the inspector draws them as a button group in a
// drawer narrow enough that anything longer wraps to a third line
export const COMMIT_WHILE_TYPING = 'While typing';
export const COMMIT_RATE_LIMITED = 'Rate limited';
export const COMMIT_AFTER_PAUSE = 'After pause';
export const COMMIT_ON_ENTER_OR_BLUR = 'Enter or blur';
export const COMMIT_ON_BLUR = 'On blur';
export const COMMIT_WHILE_DRAGGING = 'While dragging';
export const COMMIT_ON_RELEASE = 'On release';

// every list runs from the most eager to the most patient, so the mode that
// waits for the user to leave the control comes last; the immediate mode leads,
// which is what makes options[0] the default
export const typingCommitOptions: EnumStructure = [
  { text: COMMIT_WHILE_TYPING },
  { text: COMMIT_RATE_LIMITED },
  { text: COMMIT_AFTER_PAUSE },
  { text: COMMIT_ON_ENTER_OR_BLUR },
];

// a search box wants its text live - the only thing worth deferring there is
// how often the text reaches the graph, never whether a keystroke shows up
export const searchCommitOptions: EnumStructure = [
  { text: COMMIT_WHILE_TYPING },
  { text: COMMIT_RATE_LIMITED },
  { text: COMMIT_AFTER_PAUSE },
];

// Enter writes a new line in an editor, and the editors own their key handling
// anyway, so blur is the explicit end of an edit there
export const editorCommitOptions: EnumStructure = [
  { text: COMMIT_WHILE_TYPING },
  { text: COMMIT_RATE_LIMITED },
  { text: COMMIT_AFTER_PAUSE },
  { text: COMMIT_ON_BLUR },
];

export const draggingCommitOptions: EnumStructure = [
  { text: COMMIT_WHILE_DRAGGING },
  { text: COMMIT_ON_RELEASE },
];

export const defaultCommitDelay = 400;

/**
 * The modes that hold a value back. Membership is listed rather than inferred,
 * and everything else counts as immediate, so a socket that is missing, left at
 * a legacy value or linked to something unexpected keeps the old behaviour.
 */
const deferredCommitModes: ReadonlySet<unknown> = new Set([
  COMMIT_RATE_LIMITED,
  COMMIT_ON_ENTER_OR_BLUR,
  COMMIT_ON_BLUR,
  COMMIT_AFTER_PAUSE,
  COMMIT_ON_RELEASE,
]);

export const commitsImmediately = (mode: unknown): boolean =>
  !deferredCommitModes.has(mode);

/** The two modes that read Commit Delay: one waits it out, one rations by it. */
export const usesCommitDelay = (mode: unknown): boolean =>
  mode === COMMIT_AFTER_PAUSE || mode === COMMIT_RATE_LIMITED;

export const getCommitModeSocket = (
  options: EnumStructure = typingCommitOptions,
  visibilityCondition?: () => boolean,
): Socket => {
  const socket = new Socket(
    SOCKET_TYPE.IN,
    commitModeName,
    new EnumType(options, undefined, true),
    options[0].text,
    false,
  );
  if (visibilityCondition) {
    socket.visibilityCondition = visibilityCondition;
  }
  return socket;
};

/**
 * How long the deferred timers wait, in ms: the quiet period after the last
 * keystroke in COMMIT_AFTER_PAUSE, the shortest gap between two commits
 * in COMMIT_RATE_LIMITED. Hidden in the modes that have no timer.
 */
export const getCommitDelaySocket = (node: {
  getInputData: (name: string) => any;
}): Socket =>
  Socket.getOptionalVisibilitySocket(
    SOCKET_TYPE.IN,
    commitDelayName,
    new NumberType(true, 0, 5000),
    defaultCommitDelay,
    () => usesCommitDelay(node.getInputData(commitModeName)),
  );

export interface CommitModeOptions {
  /** the Commit socket's value */
  mode: unknown;
  /** the Commit Delay socket's value in ms; only read by the timed modes */
  delay?: number;
  /** false where Enter belongs to the control, e.g. a multiline field */
  commitOnEnter?: boolean;
}

export interface CommitModeHandle<T> {
  /** what the control shows: the draft, which the graph only writes to between edits */
  value: T;
  /** the control changed; commits straight away in the immediate modes */
  edit: (next: T) => void;
  /** push a pending edit now, without leaving the edit (Enter) */
  commit: () => void;
  /** throw a pending edit away and show the graph's value again (Escape) */
  revert: () => void;
  beginEditing: () => void;
  /** leave the edit and push whatever is pending (blur, pointer release) */
  endEditing: () => void;
  /** Enter commits, Escape reverts; does nothing in the immediate modes */
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * Holds the value a viewer is editing until the widget's Commit socket says to
 * push it into the graph.
 *
 * While an edit is open the draft is the single source of truth for the
 * control, so an execution of the graph cannot overwrite half-typed input; once
 * the edit ends the graph owns the value again. A widget that has no draft of
 * its own to show (the number field keeps its own, the autocomplete's text
 * belongs to MUI) can ignore `value` and use the rest.
 */
export function useCommitMode<T>(
  committedValue: T,
  commitValue: (value: T) => void,
  { mode, delay = defaultCommitDelay, commitOnEnter = true }: CommitModeOptions,
): CommitModeHandle<T> {
  const immediate = commitsImmediately(mode);
  const [draft, setDraft] = React.useState<T>(committedValue);
  const [isEditing, setIsEditing] = React.useState(false);
  const draftRef = React.useRef<T>(committedValue);
  // set by a deferred edit and cleared by a commit, so leaving a field nobody
  // touched does not add an undo step or execute the chain
  const isDirty = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastCommitAt = React.useRef(0);
  // the widgets rebuild their callbacks on every render; the pending timeout has
  // to reach the current one
  const commitRef = React.useRef(commitValue);
  commitRef.current = commitValue;

  const cancelTimer = () => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  };

  React.useEffect(() => cancelTimer, []);

  React.useEffect(() => {
    if (!isEditing) {
      draftRef.current = committedValue;
      setDraft(committedValue);
    }
  }, [committedValue, isEditing]);

  const commit = () => {
    cancelTimer();
    if (isDirty.current) {
      isDirty.current = false;
      lastCommitAt.current = Date.now();
      commitRef.current(draftRef.current);
    }
  };

  const edit = (next: T) => {
    draftRef.current = next;
    setDraft(next);
    if (immediate) {
      commitRef.current(next);
      return;
    }
    isDirty.current = true;
    setIsEditing(true);
    if (mode === COMMIT_AFTER_PAUSE) {
      cancelTimer();
      timer.current = setTimeout(commit, Math.max(0, delay));
      return;
    }
    if (mode === COMMIT_RATE_LIMITED) {
      // first keystroke of a burst goes straight through, the rest ride the
      // timer that closes the window - so typing stays visible downstream
      // without one action per character
      const waited = Date.now() - lastCommitAt.current;
      if (waited >= Math.max(0, delay)) {
        commit();
      } else if (timer.current === undefined) {
        timer.current = setTimeout(commit, Math.max(0, delay) - waited);
      }
    }
  };

  const revert = () => {
    cancelTimer();
    isDirty.current = false;
    draftRef.current = committedValue;
    setDraft(committedValue);
  };

  return {
    value: draft,
    edit,
    commit,
    revert,
    beginEditing: () => setIsEditing(true),
    endEditing: () => {
      setIsEditing(false);
      commit();
    },
    handleKeyDown: (event: React.KeyboardEvent) => {
      if (immediate) {
        return;
      }
      if (event.key === 'Escape') {
        revert();
      } else if (
        event.key === 'Enter' &&
        (commitOnEnter || event.metaKey || event.ctrlKey)
      ) {
        commit();
      }
    },
  };
}
