import {
  ApiKeyRisk,
  NetworkRisk,
  UnrestrictedCodeRisk,
  WorkerCodeRisk,
  collectAppRisks,
  findApiKeyReferences,
} from '../../../src/classes/NodeRisk';

describe('app risk disclosure', () => {
  it('groups shared capabilities by target and puts unrestricted code first', () => {
    const risks = collectAppRisks([
      {
        id: 'a',
        nodeName: 'First',
        getRisks: () => [new WorkerCodeRisk(), new ApiKeyRisk('OPENAI')],
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
    expect(risks).toHaveLength(4);
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

  it('removes credentials, paths and query strings from network disclosures', () => {
    expect(
      new NetworkRisk('https://user:secret@example.com/private?key=secret')
        .target,
    ).toBe('https://example.com');
    expect(new NetworkRisk().target).toBe('Destination determined at runtime');
  });
});
