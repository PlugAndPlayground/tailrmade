import {
  AIUsageRisk,
  ApiKeyRisk,
  CONSEQUENCE,
  CompanionRisk,
  NetworkRisk,
  ExternalImageRisk,
  DynamicImageRisk,
  StorageReadRisk,
  StorageWriteRisk,
  UnrestrictedCodeRisk,
  collectAppRisks,
  findApiKeyReferences,
  getImageSourceRisks,
  getRiskLevel,
  highestRiskLevel,
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

  it('classifies fixed image sources and masks URL secrets', () => {
    const baseURL = 'https://app.example.com/editor';
    for (const source of [
      'https://user:secret@images.example.com/photo.png?key=secret#secret',
      '//images.example.com/photo.png?key=secret',
    ]) {
      const risks = getImageSourceRisks(source, false, baseURL);
      expect(risks).toHaveLength(1);
      expect(risks[0]).toBeInstanceOf(ExternalImageRisk);
      expect(risks[0].severity).toBe('info');
      expect(risks[0].target).toBe(
        'https://images.example.com/photo.png?key=…',
      );
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
    ).toBe('https://example.com/private?key=…');
    // An address the review cannot work out carries no prose in the model.
    expect(new NetworkRisk().target).toBeUndefined();
    expect(new NetworkRisk().resolved).toBe(false);
  });

  it('names query parameters without printing their values', () => {
    expect(new NetworkRisk('https://example.com/p?a=1&b=2&c=3').target).toBe(
      'https://example.com/p?a=…&b=…&c=…',
    );
    // An empty value has nothing to hide, so it is not masked into one.
    expect(new NetworkRisk('https://example.com/p?flag=&x=1').target).toBe(
      'https://example.com/p?flag&x=…',
    );
    expect(new NetworkRisk('https://example.com/p?').target).toBe(
      'https://example.com/p',
    );
    // The fragment never reaches the server, so it stays out entirely.
    expect(new NetworkRisk('https://example.com/p#secret').target).toBe(
      'https://example.com/p',
    );
  });

  it('resolves relative destinations against the page base URL', () => {
    expect(
      new NetworkRisk(
        '../api/items?token=secret',
        'https://example.com/apps/one',
      ).target,
    ).toBe('https://example.com/api/items?token=…');
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
    ).toBe('wss://example.com:8443/events?key=…');
    for (const url of [
      'data:text/plain,secret',
      'invalid://secret',
      'http://[',
    ]) {
      expect(new NetworkRisk(url).target).toBeUndefined();
      expect(new NetworkRisk(url).resolved).toBe(false);
    }
  });

  it('ranks how well each capability can be judged', () => {
    expect(getRiskLevel(new UnrestrictedCodeRisk())).toBe('unrestricted');
    // Same capability, but the destination is only picked while running.
    expect(getRiskLevel(new NetworkRisk('https://example.com'))).toBe('static');
    expect(getRiskLevel(new NetworkRisk())).toBe('dynamic');
    expect(getRiskLevel(new DynamicImageRisk())).toBe('dynamic');
    expect(getRiskLevel(new ApiKeyRisk('OPENAI'))).toBe('static');
    expect(getRiskLevel(new ApiKeyRisk())).toBe('dynamic');
    expect(
      getRiskLevel(new NetworkRisk('https://example.com', undefined, 'info')),
    ).toBe('loads-only');
    expect(highestRiskLevel([])).toBe('none');
    expect(
      highestRiskLevel([
        new ExternalImageRisk('https://example.com/a.png'),
        new StorageWriteRisk(),
      ]),
    ).toBe('static');
    expect(highestRiskLevel([new StorageWriteRisk(), new NetworkRisk()])).toBe(
      'dynamic',
    );
  });

  it('keeps gating on what is at stake, not on how judgeable it is', () => {
    // A dynamic destination is harder to judge but still blocks, and a fully
    // static storage write blocks too, so the gate cannot read the scale.
    for (const risk of [new NetworkRisk(), new StorageWriteRisk()]) {
      expect(requiresAppRiskReview([{ risk, nodes: [] }])).toBe(true);
    }
    expect(
      requiresAppRiskReview([
        { risk: new ExternalImageRisk('https://example.com/a.png'), nodes: [] },
      ]),
    ).toBe(false);
  });

  it('separates reading saved data from changing it', () => {
    const risks = collectAppRisks([
      {
        id: 'read',
        nodeName: 'Storage read',
        getRisks: () => [new StorageReadRisk()],
      },
      {
        id: 'write',
        nodeName: 'Storage write',
        getRisks: () => [new StorageWriteRisk()],
      },
    ]);
    expect(risks.map(({ risk }) => risk.kind).sort()).toEqual([
      'storage-read',
      'storage-write',
    ]);
    // Neither description has to hedge about the other direction.
    expect(new StorageReadRisk().description).not.toContain('remove');
    expect(new StorageWriteRisk().consequences).toEqual([
      CONSEQUENCE.changesYourData,
    ]);
  });

  it('tags every capability that costs money or leaves the browser', () => {
    for (const risk of [new ApiKeyRisk('OPENAI'), new AIUsageRisk()]) {
      expect(risk.consequences).toContain(CONSEQUENCE.costsMoney);
    }
    expect(new CompanionRisk().consequences).toContain(
      CONSEQUENCE.reachesYourComputer,
    );
    // A plain GET only reveals that the request happened.
    expect(
      new NetworkRisk('https://example.com', undefined, 'info').consequences,
    ).toEqual([CONSEQUENCE.revealsYouVisited]);
    expect(new NetworkRisk('https://example.com').consequences).toEqual([
      CONSEQUENCE.sendsDataOut,
    ]);
    expect(new UnrestrictedCodeRisk().consequences).toContain(
      CONSEQUENCE.notSandboxed,
    );
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
