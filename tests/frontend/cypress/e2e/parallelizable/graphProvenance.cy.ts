import {
  doWithTestController,
  openGraphWithURLParams,
  openNewGraph,
  openStringifiedGraph,
  saveGraph,
  shouldWithTestController,
} from '../helpers';

const expectProvenance = (provenance: string) =>
  shouldWithTestController((testController) => {
    expect(testController.getGraph().provenance).to.equal(provenance);
  });

describe('Graph provenance', () => {
  it('marks a new graph as local', () => {
    openNewGraph();
    expectProvenance('local');
  });

  it('marks a graph opened from a link as imported', () => {
    cy.fixture('triggerSocketLoad.ppgraph').then((data) => {
      openStringifiedGraph(data);
    });
    expectProvenance('imported');
  });

  it('keeps an imported graph imported after saving and reopening it', () => {
    saveGraph();
    doWithTestController((testController) => {
      openGraphWithURLParams(
        `loadLocalGraph=${encodeURIComponent(testController.getGraph().id)}`,
      );
    });
    expectProvenance('imported');
  });
});
