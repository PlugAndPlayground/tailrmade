import {
  ApiKeyRisk,
  NetworkRisk,
  UnrestrictedCodeRisk,
  collectAppRisks,
  findApiKeyReferences,
} from '../../../src/classes/NodeRisk';

describe('app risk disclosure', () => {
  it('groups shared capabilities by target and puts unrestricted code first', () => {
    const risks = collectAppRisks([
      {
        id: 'a',
        nodeName: 'First',
        getRisks: () => [new ApiKeyRisk('OPENAI')],
      },
      {
        id: 'b',
        nodeName: 'Second',
        getRisks: () => [
          new ApiKeyRisk('OPENAI'),
          new ApiKeyRisk('OTHER'),
          new UnrestrictedCodeRisk(),
        ],
      },
    ]);
    expect(risks[0].risk).toBeInstanceOf(UnrestrictedCodeRisk);
    expect(risks.find(({ risk }) => risk.target === 'OPENAI')?.nodes).toEqual([
      { id: 'a', name: 'First' },
      { id: 'b', name: 'Second' },
    ]);
    expect(risks).toHaveLength(3);
  });

  it('extracts nested key references without disclosing values or looping on cycles', () => {
    const data: any = {
      headers: { Authorization: 'Bearer $TM_KEY{OPENAI}' },
      body: ['$TM_KEY{OTHER}', '$TM_KEY{OPENAI}'],
      literal: 'secret-value',
    };
    data.self = data;
    expect(findApiKeyReferences(data)).toEqual(['OPENAI', 'OTHER']);
  });

  it('shows endpoint paths without credentials, query strings or fragments', () => {
    expect(
      new NetworkRisk(
        'https://user:secret@example.com/private?key=secret#secret',
      ).target,
    ).toBe('https://example.com/private');
    expect(new NetworkRisk().target).toBe('Destination determined at runtime');
  });

  it('resolves relative destinations against the page base URL', () => {
    expect(
      new NetworkRisk(
        '../api/items?token=secret',
        'https://example.com/apps/one',
      ).target,
    ).toBe('https://example.com/api/items');
    expect(
      new NetworkRisk(
        '//user:secret@api.example.com/items',
        'https://example.com',
      ).target,
    ).toBe('https://api.example.com/items');
  });

  it('supports websocket endpoints and does not expose non-network URL payloads', () => {
    expect(
      new NetworkRisk('wss://example.com:8443/events?key=secret').target,
    ).toBe('wss://example.com:8443/events');
    for (const url of [
      'data:text/plain,secret',
      'invalid://secret',
      'http://[',
    ]) {
      expect(new NetworkRisk(url).target).toBe(
        'Destination determined at runtime',
      );
    }
  });

  it('keeps different endpoints on the same host separate in the review', () => {
    const risks = collectAppRisks([
      {
        id: 'http',
        nodeName: 'HTTP',
        getRisks: () => [
          new NetworkRisk('https://example.com/read'),
          new NetworkRisk('https://example.com/delete'),
        ],
      },
    ]);
    expect(risks).toHaveLength(2);
  });
});
