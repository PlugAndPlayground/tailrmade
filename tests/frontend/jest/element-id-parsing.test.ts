import {
  constructSocketId,
  ELEMENT_ID_SEPARATOR,
  parseElementId,
  parseLegacyElementId,
} from '../../../src/utils/elementIds';
import { SOCKET_TYPE } from '../../../src/utils/constants_shared';

describe('parseElementId', () => {
  describe('NODE_ element ids', () => {
    it('parses a human-readable node id', () => {
      expect(parseElementId('NODE_orange-stingray-61')).toEqual({
        kind: 'node',
        nodeId: 'orange-stingray-61',
      });
    });

    it('parses arbitrary node ids', () => {
      expect(parseElementId('NODE_MyButton')).toEqual({
        kind: 'node',
        nodeId: 'MyButton',
      });
      expect(parseElementId('NODE_ai-node-lon')).toEqual({
        kind: 'node',
        nodeId: 'ai-node-lon',
      });
    });

    it('rejects an empty node id', () => {
      expect(parseElementId('NODE_')).toBeUndefined();
    });
  });

  describe('SOCKET_ element ids', () => {
    it('round-trips constructSocketId', () => {
      const id = constructSocketId(
        'orange-stingray-61',
        SOCKET_TYPE.IN,
        'My Value',
      );
      expect(id).toBe('SOCKET_orange-stingray-61::in::My Value');
      expect(parseElementId(id)).toEqual({
        kind: 'socket',
        nodeId: 'orange-stingray-61',
        socketType: SOCKET_TYPE.IN,
        socketName: 'My Value',
      });
    });

    it('is exact for ids that were ambiguous under the legacy "-" separator', () => {
      // node "a" with socket "b-in-x" vs node "a-in-b" with socket "x":
      // legacy parsing had to guess; the reserved separator makes each
      // reading a distinct string
      const forNodeA = constructSocketId('a', SOCKET_TYPE.IN, 'b-in-x');
      const forNodeAInB = constructSocketId('a-in-b', SOCKET_TYPE.IN, 'x');
      expect(forNodeA).not.toBe(forNodeAInB);
      expect(parseElementId(forNodeA)).toEqual({
        kind: 'socket',
        nodeId: 'a',
        socketType: SOCKET_TYPE.IN,
        socketName: 'b-in-x',
      });
      expect(parseElementId(forNodeAInB)).toEqual({
        kind: 'socket',
        nodeId: 'a-in-b',
        socketType: SOCKET_TYPE.IN,
        socketName: 'x',
      });
    });

    it('keeps dashes and even the separator inside the socket name', () => {
      // only node ids reserve "::" - the socket name is the tail, so it may
      // contain anything
      const id = constructSocketId('a', SOCKET_TYPE.IN, 'b::c-d');
      expect(parseElementId(id)).toEqual({
        kind: 'socket',
        nodeId: 'a',
        socketType: SOCKET_TYPE.IN,
        socketName: 'b::c-d',
      });
    });

    it('supports every socket type', () => {
      Object.values(SOCKET_TYPE).forEach((socketType) => {
        const id = constructSocketId('some-node-1', socketType as any, 'S');
        expect(parseElementId(id)).toEqual({
          kind: 'socket',
          nodeId: 'some-node-1',
          socketType,
          socketName: 'S',
        });
      });
    });

    it('rejects malformed socket ids', () => {
      expect(parseElementId('SOCKET_a::in::')).toBeUndefined(); // empty name
      expect(parseElementId('SOCKET_::in::x')).toBeUndefined(); // empty node id
      expect(parseElementId('SOCKET_a::bogus::x')).toBeUndefined(); // bad type
      expect(parseElementId('SOCKET_a::in')).toBeUndefined(); // one separator
      expect(parseElementId('SOCKET_a-in-x')).toBeUndefined(); // legacy format
    });
  });

  it('returns undefined for ids without a known prefix', () => {
    expect(parseElementId('orange-stingray-61')).toBeUndefined();
    expect(parseElementId('')).toBeUndefined();
  });
});

describe('parseLegacyElementId (migration helper)', () => {
  // mirrors the pre-"::" production regex exactly: node ids were required to
  // be human-readable-ids (word-word-number), which "ai-node-<n>" also matches
  it('parses a legacy socket id with an hri-shaped node id', () => {
    expect(
      parseLegacyElementId('SOCKET_orange-stingray-61-in-My Value'),
    ).toEqual({
      kind: 'socket',
      nodeId: 'orange-stingray-61',
      socketType: SOCKET_TYPE.IN,
      socketName: 'My Value',
    });
    expect(parseLegacyElementId('SOCKET_ai-node-12-out-value')).toEqual({
      kind: 'socket',
      nodeId: 'ai-node-12',
      socketType: SOCKET_TYPE.OUT,
      socketName: 'value',
    });
  });

  it('keeps dashes inside the socket name', () => {
    expect(parseLegacyElementId('SOCKET_lazy-lion-23-in-b-c')).toEqual({
      kind: 'socket',
      nodeId: 'lazy-lion-23',
      socketType: SOCKET_TYPE.IN,
      socketName: 'b-c',
    });
  });

  it('rejects ids the old production regex also rejected', () => {
    // these never resolved (or rendered) under the old regime, so the
    // migration leaves them untouched
    expect(parseLegacyElementId('SOCKET_btn-2-out-value')).toBeUndefined();
    expect(parseLegacyElementId('SOCKET_MyButton-in-x')).toBeUndefined();
    expect(parseLegacyElementId('SOCKET_a-in-x')).toBeUndefined();
    expect(parseLegacyElementId('SOCKET_lazy-lion-23-bogus-x')).toBeUndefined();
    expect(parseLegacyElementId('NODE_lazy-lion-23')).toBeUndefined();
  });
});

describe('separator reservation', () => {
  it('hri-style and ai-node ids can never contain the separator', () => {
    ['orange-stingray-61', 'ai-node-12'].forEach((id) => {
      expect(id.includes(ELEMENT_ID_SEPARATOR)).toBe(false);
    });
  });
});
