import {
  ApiKeyRisk,
  NetworkRisk,
  ExternalImageRisk,
  DynamicImageRisk,
  UnrestrictedCodeRisk,
  collectAppRisks,
  findApiKeyReferences,
  getImageSourceRisks,
  requiresAppRiskReview,
} from '../../../src/classes/NodeRisk';

describe('app risk disclosure', () => {
  it('does not require approval for informational image loads alone', () => {
    const risks = collectAppRisks([
      {
        id: 'image',
        nodeName: 'Image',
        getRisks: () => [
          new ExternalImageRisk('https://images.example.com/photo.png'),
        ],
      },
    ]);
    expect(requiresAppRiskReview(risks)).toBe(false);
    expect(requiresAppRiskReview([])).toBe(false);
    expect(
      requiresAppRiskReview([...risks, { risk: new NetworkRisk(), nodes: [] }]),
    ).toBe(true);
  });

  it('classifies fixed image sources and hides URL secrets', () => {
    const baseURL = 'https://app.example.com/editor';
    for (const source of [
      'https://user:secret@images.example.com/photo.png?key=secret#secret',
      '//images.example.com/photo.png?key=secret',
    ]) {
      const risks = getImageSourceRisks(source, false, baseURL);
      expect(risks).toHaveLength(1);
      expect(risks[0]).toBeInstanceOf(ExternalImageRisk);
      expect(risks[0].severity).toBe('info');
      expect(risks[0].target).toBe('https://images.example.com/photo.png');
    }
    for (const source of [
      undefined,
      '',
      'data:image/png;base64,AAAA',
      'blob:https://app.example.com/image',
      '/assets/photo.png',
      'https://app.example.com/photo.png',
    ]) {
      expect(getImageSourceRisks(source, false, baseURL)).toEqual([]);
    }
  });

  it('does not mistake saved image data for a predictable connected source', () => {
    expect(
      getImageSourceRisks('data:image/png;base64,AAAA', true)[0],
    ).toBeInstanceOf(DynamicImageRisk);
    const risks = collectAppRisks([
      {
        id: 'image',
        nodeName: 'Image',
        getRisks: () => [
          new ExternalImageRisk('https://example.com/image.png'),
          new DynamicImageRisk(),
          new UnrestrictedCodeRisk(),
        ],
      },
    ]);
    expect(risks.map(({ risk }) => risk.severity)).toEqual([
      'critical',
      'warning',
      'info',
    ]);
    expect(requiresAppRiskReview(risks)).toBe(true);
  });

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
