import { getStackView, setStackView } from '../../../src/utils/layoutModel';
import {
  goToOpenedApp,
  graphHasUI,
  viewForOpenedApp,
} from '../../../src/utils/stackNavigation';
import { RootName } from '../../../src/utils/constants_shared';

// Opening an app from the phone's apps list has to leave the list, and the
// view it lands on is the only decision in that handover: an app with a UI is
// what the tap was for, and one without has nothing to show there.

const surface = (childCount: number) => ({
  isSurface: () => true,
  getSurfaceTree: () => ({
    [RootName]: {
      nodes: Array.from({ length: childCount }, (_, i) => `w${i}`),
    },
  }),
});

const plainNode = { isSurface: () => false };

describe('the view an opened app lands on', () => {
  afterEach(() => setStackView('ui'));

  it('finds no UI in a graph of ordinary nodes', () => {
    expect(graphHasUI({ nodes: { a: plainNode, b: plainNode } })).toBe(false);
  });

  // the dashboard creates one the first time it is edited, so an empty
  // surface is a normal thing for a graph to be carrying
  it('does not count a surface that was never filled in', () => {
    expect(graphHasUI({ nodes: { a: surface(0) } })).toBe(false);
  });

  it('counts a surface with widgets on it', () => {
    expect(graphHasUI({ nodes: { a: surface(0), b: surface(2) } })).toBe(true);
  });

  it('treats an unreadable surface as no UI rather than throwing', () => {
    const broken = {
      isSurface: () => true,
      getSurfaceTree: () => {
        throw new Error('Layout JSON is wired to something unresolvable');
      },
    };
    expect(graphHasUI({ nodes: { a: broken } })).toBe(false);
  });

  it('has no UI to open without a graph at all', () => {
    expect(graphHasUI(undefined)).toBe(false);
    expect(viewForOpenedApp(undefined)).toBe('graph');
  });

  it('sends an app with a UI to the UI, and one without to the graph', () => {
    goToOpenedApp({ nodes: { a: surface(1) } });
    expect(getStackView()).toBe('ui');

    goToOpenedApp({ nodes: { a: plainNode } });
    expect(getStackView()).toBe('graph');
  });
});
