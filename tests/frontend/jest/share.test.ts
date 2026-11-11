import {
  buildShareContent,
  copyText,
  dataUrlToFile,
  manualCopyStore,
  shareContent,
  shareContentAsText,
  parseShareLink,
} from '../../../src/utils/share';

const domError = (name: string) =>
  Object.assign(new Error(name), { name }) as Error;

function mockNavigator({
  share,
  writeText = jest.fn().mockResolvedValue(undefined),
}: {
  share?: jest.Mock;
  writeText?: jest.Mock;
}) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { share, clipboard: { writeText } },
    configurable: true,
  });
  return { share, writeText };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => manualCopyStore.set(null));

it('opens the share sheet when the browser has one', async () => {
  const { share, writeText } = mockNavigator({
    share: jest.fn().mockResolvedValue(undefined),
  });
  const content = { title: 'App', url: 'https://tailrmade.app/?a' };
  await expect(shareContent(content)).resolves.toBe('shared');
  expect(share).toHaveBeenCalledWith(content);
  expect(writeText).not.toHaveBeenCalled();
});

it('treats closing the share sheet as cancelled, not as a failure', async () => {
  const { writeText } = mockNavigator({
    share: jest.fn().mockRejectedValue(domError('AbortError')),
  });
  await expect(shareContent({ url: 'https://x.test' })).resolves.toBe(
    'cancelled',
  );
  expect(writeText).not.toHaveBeenCalled();
});

it('copies when the browser refuses to share', async () => {
  const { writeText } = mockNavigator({
    share: jest.fn().mockRejectedValue(domError('NotAllowedError')),
  });
  await expect(
    shareContent({ text: 'Your envelope', url: 'https://x.test' }),
  ).resolves.toBe('copied');
  expect(writeText).toHaveBeenCalledWith('Your envelope\nhttps://x.test');
});

it('copies when the browser has no share sheet', async () => {
  const { writeText } = mockNavigator({});
  await expect(shareContent({ url: 'https://x.test' })).resolves.toBe('copied');
  expect(writeText).toHaveBeenCalledWith('https://x.test');
});

it('does not repeat an address the text already holds', () => {
  expect(
    shareContentAsText({
      text: 'Open https://x.test now',
      url: 'https://x.test',
    }),
  ).toBe('Open https://x.test now');
});

it('falls back to the copy dialog when the clipboard is blocked', async () => {
  mockNavigator({
    writeText: jest.fn().mockRejectedValue(domError('NotAllowedError')),
  });
  const result = copyText('https://x.test', 'Copy link');
  await flush();
  const request = manualCopyStore.get();
  expect(request).toMatchObject({
    title: 'Copy link',
    value: 'https://x.test',
  });
  request.resolve('copied');
  await expect(result).resolves.toBe('copied');
});

it('cancels an earlier copy dialog that a new one replaces', async () => {
  mockNavigator({
    writeText: jest.fn().mockRejectedValue(domError('NotAllowedError')),
  });
  const first = copyText('one');
  await flush();
  const second = copyText('two');
  await expect(first).resolves.toBe('cancelled');
  await flush();
  manualCopyStore.get().resolve('copied');
  await expect(second).resolves.toBe('copied');
});

describe('parseShareLink', () => {
  const base = 'https://tailrmade.app/';

  it('reads URL-encoded content', () => {
    expect(
      parseShareLink(
        'share:?text=Hi%20Anna&url=https%3A%2F%2Fx.test%2F%3Fa%3D1%23santa%3Dab&title=Santa',
        base,
      ),
    ).toEqual({
      kind: 'content',
      content: {
        title: 'Santa',
        text: 'Hi Anna',
        url: 'https://x.test/?a=1#santa=ab',
      },
    });
  });

  it('keeps an unencoded # in the last value', () => {
    expect(parseShareLink('share:?url=https://x.test/#santa=ab', base)).toEqual(
      {
        kind: 'content',
        content: { url: 'https://x.test/#santa=ab' },
      },
    );
  });

  it('resolves a relative address against the page', () => {
    expect(parseShareLink('share:?url=%2F%3Fa%3D1', base)).toMatchObject({
      content: { url: 'https://tailrmade.app/?a=1' },
    });
  });

  it('reads the app form with optional text', () => {
    expect(parseShareLink('share:app', base)).toEqual({ kind: 'app' });
    expect(parseShareLink('share:app?text=Try%20this', base)).toEqual({
      kind: 'app',
      text: 'Try this',
    });
  });

  it('rejects addresses that are not HTTP(S), and empty or unknown links', () => {
    expect(parseShareLink('share:?url=javascript%3Aalert(1)', base)).toBe(
      undefined,
    );
    expect(parseShareLink('share:?url=data%3Atext%2Fhtml,x', base)).toBe(
      undefined,
    );
    expect(parseShareLink('share:', base)).toBe(undefined);
    expect(parseShareLink('share:other?text=x', base)).toBe(undefined);
    expect(parseShareLink('https://x.test', base)).toBe(undefined);
  });
});

describe('files', () => {
  const pngDataUrl = 'data:image/png;base64,iVBORw0KGgo=';

  it('turns a data URL into a named file', async () => {
    const file = dataUrlToFile(pngDataUrl, 'drawing');
    expect(file.name).toBe('drawing.png');
    expect(file.type).toBe('image/png');
    expect([...new Uint8Array(await file.arrayBuffer())].slice(0, 4)).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
  });

  it('reads URL-encoded text data URLs and keeps a given extension', async () => {
    const file = dataUrlToFile('data:text/csv,a%2Cb%0A1%2C2', 'table.csv');
    expect(file.name).toBe('table.csv');
    expect(await file.text()).toBe('a,b\n1,2');
  });

  it('ignores anything that is not a data URL', () => {
    expect(dataUrlToFile('https://x.test/a.png', 'a')).toBeUndefined();
    expect(dataUrlToFile({}, 'a')).toBeUndefined();
  });

  it('builds share content, numbering several files', () => {
    const content = buildShareContent(
      {
        title: ' Card ',
        text: 42,
        url: 'javascript:alert(1)',
        files: [pngDataUrl, 'https://x.test/a.png', pngDataUrl],
        fileName: 'card',
      },
      'https://tailrmade.app/',
    );
    expect(content.title).toBe('Card');
    expect(content.text).toBe('42');
    expect(content.url).toBeUndefined();
    expect(content.files.map((file) => file.name)).toEqual([
      'card-1.png',
      'card-2.png',
    ]);
  });

  it('has nothing to share when every input is empty', () => {
    expect(
      buildShareContent({ title: '', text: '  ', url: '', files: '' }),
    ).toBeUndefined();
  });

  it('shares files the browser accepts', async () => {
    const { share } = mockNavigator({
      share: jest.fn().mockResolvedValue(undefined),
    });
    (navigator as any).canShare = () => true;
    const files = [dataUrlToFile(pngDataUrl, 'a')];
    await expect(shareContent({ files })).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ files });
  });

  it('downloads files the browser cannot share', async () => {
    const { share } = mockNavigator({ share: jest.fn() });
    (navigator as any).canShare = () => false;
    const click = jest.fn();
    const link = { click } as any;
    Object.defineProperty(globalThis, 'document', {
      value: { createElement: () => link },
      configurable: true,
    });
    URL.createObjectURL = jest.fn(() => 'blob:x');
    URL.revokeObjectURL = jest.fn();
    const files = [dataUrlToFile(pngDataUrl, 'a')];
    await expect(shareContent({ files })).resolves.toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(link.download).toBe('a.png');
    expect(click).toHaveBeenCalled();
    delete (globalThis as any).document;
  });
});
