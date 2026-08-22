import SocketNameOverlay from '../../../src/classes/SocketNameOverlay';

// getConnectionSummary only touches links, isInput() and the node names on the
// far end, so it can be driven with plain stand-ins rather than a pixi stage
const link = (nodeName: string, socketName: string) => {
  const other = {
    name: socketName,
    getNode: () => ({ nodeName, getName: () => nodeName }),
  };
  return { getSource: () => other, getTarget: () => other };
};

const socketWith = (isInput: boolean, links: unknown[]) =>
  ({ isInput: () => isInput, links }) as any;

const CAP = 10;

describe('SocketNameOverlay.getConnectionSummary', () => {
  it('says nothing at all for an unconnected socket', () => {
    expect(
      SocketNameOverlay.getConnectionSummary(socketWith(true, []), false),
    ).toEqual({ direction: '', rows: [], more: 0 });
  });

  it('gives a single link its row and no count line', () => {
    const incoming = SocketNameOverlay.getConnectionSummary(
      socketWith(true, [link('Add', 'Out')]),
      false,
    );
    expect(incoming.direction).toBe('');
    expect(incoming.rows).toEqual([{ node: 'Add', socket: 'Out' }]);

    // and reads the same either way round - the row is the whole story
    const outgoing = SocketNameOverlay.getConnectionSummary(
      socketWith(false, [link('Add', 'Addend')]),
      false,
    );
    expect(outgoing.direction).toBe('');
    expect(outgoing.rows).toEqual([{ node: 'Add', socket: 'Addend' }]);
  });

  it('collapses a fan out to a bare count', () => {
    const summary = SocketNameOverlay.getConnectionSummary(
      socketWith(false, [link('Add', 'Addend'), link('Multiply', 'Factor')]),
      false,
    );
    expect(summary.direction).toBe('2 connections');
    expect(summary.rows).toEqual([]);
    expect(summary.more).toBe(0);
  });

  it('lists the fan out when detailed', () => {
    const summary = SocketNameOverlay.getConnectionSummary(
      socketWith(false, [link('Add', 'Addend'), link('Multiply', 'Factor')]),
      true,
    );
    expect(summary.direction).toBe('2 connections');
    expect(summary.rows).toEqual([
      { node: 'Add', socket: 'Addend' },
      { node: 'Multiply', socket: 'Factor' },
    ]);
  });

  it('sorts by node then socket, so one node’s sockets land adjacent', () => {
    const summary = SocketNameOverlay.getConnectionSummary(
      socketWith(false, [
        link('Zeta', 'In'),
        link('Alpha', 'Second'),
        link('Zeta', 'Another'),
        link('Alpha', 'First'),
      ]),
      true,
    );
    expect(summary.rows.map((row) => `${row.node}.${row.socket}`)).toEqual([
      'Alpha.First',
      'Alpha.Second',
      'Zeta.Another',
      'Zeta.In',
    ]);
  });

  it('caps the list and reports the remainder', () => {
    const links = Array.from({ length: CAP + 3 }, (_, index) =>
      // zero padded so the sort order matches creation order
      link(`Node${String(index).padStart(2, '0')}`, 'In'),
    );
    const summary = SocketNameOverlay.getConnectionSummary(
      socketWith(false, links),
      true,
    );
    expect(summary.direction).toBe(`${CAP + 3} connections`);
    expect(summary.rows).toHaveLength(CAP);
    expect(summary.more).toBe(3);
    expect(summary.rows[0].node).toBe('Node00');
    expect(summary.rows[CAP - 1].node).toBe(
      `Node${String(CAP - 1).padStart(2, '0')}`,
    );
  });

  it('never reports a remainder while collapsed', () => {
    const links = Array.from({ length: 40 }, () => link('Node', 'In'));
    const summary = SocketNameOverlay.getConnectionSummary(
      socketWith(false, links),
      false,
    );
    expect(summary.direction).toBe('40 connections');
    expect(summary.more).toBe(0);
    expect(summary.rows).toEqual([]);
  });
});
