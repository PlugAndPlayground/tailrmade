import { doWithTestController, openNewGraph } from '../helpers';

// Regressions around the undo stack and link integrity. Each of these used to
// either corrupt the saved graph or leave the editor in a broken state.
describe('Undo integrity', () => {
  const nodeIds = (tc): string[] => tc.getNodes().map((node) => node.id);

  const serializeAs = (tc, name: string): string => {
    const stored = tc.getGraph().getSerializedStoredGraph();
    return JSON.stringify({ ...stored, id: name, name });
  };

  it('opening another app leaves nothing of the old one on the undo stack', () => {
    openNewGraph();
    doWithTestController(async (tc) => {
      tc.setShowUnsavedChangesWarning(false);

      await tc.addNode('Constant', 'A1');
      const appA = serializeAs(tc, 'undo-integrity-app-a');

      await tc.clear();
      await tc.addNode('Constant', 'B1');
      const appB = serializeAs(tc, 'undo-integrity-app-b');

      await tc.loadStringifiedGraph(appA);
      expect(nodeIds(tc)).to.deep.equal(['A1']);

      await tc.loadStringifiedGraph(appB);
      expect(nodeIds(tc)).to.deep.equal(['B1']);

      // clear() used to delete through the undoable action, so app A's nodes
      // were sitting on the stack waiting to be pasted into app B
      expect(tc.getActionHistory().canUndo).to.equal(false);
      await tc.undo();
      expect(nodeIds(tc)).to.deep.equal(['B1']);
    });
  });

  it('undoing a connect that replaced a link puts the replaced link back', () => {
    openNewGraph();
    doWithTestController(async (tc) => {
      tc.setShowUnsavedChangesWarning(false);
      await tc.addNode('Constant', 'f2-a', 0, -200);
      await tc.addNode('Constant', 'f2-b', 0, 200);
      await tc.addNode('Constant', 'f2-c', 300, 0);

      await tc.connectNodesByIDAction('f2-a', 'f2-c', 'Out', 'In');
      expect(tc.getInputLinkSourceNodeID('f2-c', 'In')).to.equal('f2-a');

      // replaces the link that is already there
      await tc.connectNodesByIDAction('f2-b', 'f2-c', 'Out', 'In');
      expect(tc.getInputLinkSourceNodeID('f2-c', 'In')).to.equal('f2-b');

      await tc.undo();
      expect(tc.getInputLinkSourceNodeID('f2-c', 'In')).to.equal('f2-a');

      // and the second undo takes the first connect back off, on an input that
      // ends up empty - this used to throw and drop the entry from both stacks
      await tc.undo();
      expect(tc.getInputLinkSourceNodeID('f2-c', 'In')).to.equal(undefined);
      expect(tc.getActionHistory().canRedo).to.equal(true);

      // both connects are still redoable
      await tc.redo();
      expect(tc.getInputLinkSourceNodeID('f2-c', 'In')).to.equal('f2-a');
      await tc.redo();
      expect(tc.getInputLinkSourceNodeID('f2-c', 'In')).to.equal('f2-b');
    });
  });

  it('ctrl+dragging a wire off an output socket is undoable', () => {
    openNewGraph();
    doWithTestController(async (tc) => {
      tc.setShowUnsavedChangesWarning(false);
      await tc.addNode('Constant', 'f3-a', 0, 0);
      await tc.addNode('Constant', 'f3-c', 300, 0);
      await tc.connectNodesByIDAction('f3-a', 'f3-c', 'Out', 'In');

      // ctrl+press detaches the wire so it can be re-aimed
      await tc.pressOnSocket('f3-a', 'Out', true);
      expect(tc.getInputLinkSourceNodeID('f3-c', 'In')).to.equal(undefined);

      // released over empty canvas - the detach has to be on the stack
      tc.getGraph().stopConnecting();
      await tc.undo();
      expect(tc.getInputLinkSourceNodeID('f3-c', 'In')).to.equal('f3-a');
    });
  });

  it('deleting a node mid wire drag abandons the drag', () => {
    openNewGraph();
    doWithTestController(async (tc) => {
      tc.setShowUnsavedChangesWarning(false);
      await tc.addNode('Constant', 'f4-a', 0, 0);
      await tc.addNode('Constant', 'f4-c', 300, 0);

      await tc.pressOnSocket('f4-a', 'Out');
      expect(tc.getSelectedSocket()?.name).to.equal('Out');

      await tc.removeNodeAction('f4-a');
      // the drag source is gone, so nothing may still point at its socket
      expect(tc.getSelectedSocket()).to.equal(undefined);
    });
  });

  it('undo of a partial delete brings the nodes back with their links', () => {
    openNewGraph();
    doWithTestController(async (tc) => {
      tc.setShowUnsavedChangesWarning(false);
      await tc.addNode('Constant', 'src', 0, 0);
      await tc.addNode('Constant', 'mid', 200, 0);
      await tc.addNode('Constant', 'out1', 400, -100);
      await tc.addNode('Constant', 'out2', 400, 100);
      await tc.connectNodesByID('src', 'mid', 'Out', 'In');
      await tc.connectNodesByID('mid', 'out1', 'Out', 'In');

      tc.selectNodesById(['mid', 'out1']);
      await tc.getGraph().perform_action_DeleteSelectedNodes();
      expect(nodeIds(tc)).to.deep.equal(['src', 'out2']);

      await tc.undo();
      expect(nodeIds(tc).sort()).to.deep.equal(['mid', 'out1', 'out2', 'src']);
      // the links between a restored node and one that was never deleted have
      // to come back too, not just the ones inside the deleted selection
      expect(tc.getInputLinkSourceNodeID('mid', 'In')).to.equal('src');
      expect(tc.getInputLinkSourceNodeID('out1', 'In')).to.equal('mid');
    });
  });
});
