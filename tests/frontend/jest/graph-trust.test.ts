import {
  getCloudProvenance,
  isTrustedGraph,
} from '../../../src/utils/graphTrust';

describe('isTrustedGraph', () => {
  it.each([
    ['local', true],
    ['own-cloud', true],
    ['imported', false],
  ] as const)('%s is trusted: %s', (provenance, trusted) => {
    expect(isTrustedGraph({ provenance })).toBe(trusted);
  });
});

describe('getCloudProvenance', () => {
  const me = 'user-1';

  it('trusts a public graph fetched from your own account', () => {
    expect(
      getCloudProvenance({
        owner: me,
        isPublic: true,
        currentUserId: me,
        storedProvenance: undefined,
      }),
    ).toBe('own-cloud');
  });

  it('trusts a private graph, which is always fetched from your account', () => {
    expect(
      getCloudProvenance({
        owner: 'someone-else',
        isPublic: false,
        currentUserId: me,
        storedProvenance: 'local',
      }),
    ).toBe('own-cloud');
  });

  it("does not trust someone else's public graph, whatever it claims", () => {
    expect(
      getCloudProvenance({
        owner: 'someone-else',
        isPublic: true,
        currentUserId: me,
        storedProvenance: 'own-cloud',
      }),
    ).toBe('imported');
  });

  it('keeps an imported app imported after it was saved to your cloud', () => {
    expect(
      getCloudProvenance({
        owner: me,
        isPublic: true,
        currentUserId: me,
        storedProvenance: 'imported',
      }),
    ).toBe('imported');
  });

  it.each([true, false])(
    'trusts nothing while signed out (public: %s)',
    (isPublic) => {
      expect(
        getCloudProvenance({
          owner: 'publicUser',
          isPublic,
          currentUserId: undefined,
          storedProvenance: undefined,
        }),
      ).toBe('imported');
    },
  );
});
