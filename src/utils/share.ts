import { createStore } from '../components/createStore';

export interface ShareContent {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
}

export type CopyResult = 'copied' | 'cancelled';
export type ShareResult = 'shared' | 'downloaded' | CopyResult;

export interface ManualCopyRequest {
  title: string;
  value: string;
  resolve: (result: CopyResult) => void;
}

// Read by ManualCopyDialog: set only when the browser refuses the clipboard.
export const manualCopyStore = createStore<ManualCopyRequest | null>(null);

export const canWebShare = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function';

// The clipboard form of a share: the text, then the address unless the text
// already holds it.
export const shareContentAsText = ({ text, url }: ShareContent): string =>
  [text, url && !text?.includes(url) ? url : undefined]
    .filter(Boolean)
    .join('\n');

export type ShareLink =
  | { kind: 'app'; title?: string; text?: string }
  | { kind: 'content'; content: ShareContent };

export const isShareLink = (href: string): boolean => /^share:/i.test(href);

// Markdown share links, values URL-encoded:
//   share:?url=…&text=…&title=…  shares that content
//   share:app?text=…&title=…     shares this app's own public link
// Returns undefined for anything else, including non-HTTP(S) addresses.
export function parseShareLink(
  href: string,
  baseURL = typeof document === 'undefined' ? undefined : document.baseURI,
): ShareLink | undefined {
  if (!isShareLink(href)) return undefined;
  const rest = href.slice('share:'.length);
  const queryStart = rest.indexOf('?');
  const target = queryStart === -1 ? rest : rest.slice(0, queryStart);
  // URLSearchParams, not URL: an unencoded # stays part of the last value.
  const params = new URLSearchParams(
    queryStart === -1 ? '' : rest.slice(queryStart + 1),
  );
  const title = params.get('title') || undefined;
  const text = params.get('text') || undefined;
  if (target.toLowerCase() === 'app') return { kind: 'app', title, text };
  if (target !== '') return undefined;

  let url: string | undefined;
  const rawUrl = params.get('url');
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl, baseURL);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return undefined;
      }
      url = parsed.href;
    } catch {
      return undefined;
    }
  }
  if (!url && !text && !title) return undefined;
  return { kind: 'content', content: { title, text, url } };
}

// Browsers only allow sharing and copying during a click's user activation, so
// call these from the click handler itself, before any other await.
export async function shareContent(
  content: ShareContent,
): Promise<ShareResult> {
  const hasFiles = (content.files?.length ?? 0) > 0;
  const canShareThis =
    canWebShare() &&
    (!hasFiles || navigator.canShare?.({ files: content.files }) === true);
  if (canShareThis) {
    try {
      await navigator.share(content);
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
      // NotAllowedError (activation used up) or data the target refuses.
    }
  }
  if (hasFiles) {
    downloadFiles(content.files!);
    return 'downloaded';
  }
  return copyText(shareContentAsText(content), content.title);
}

export function downloadFiles(files: File[]): void {
  for (const file of files) {
    const href = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = href;
    link.download = file.name;
    link.click();
    // after the click has started the download
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/html': 'html',
  'application/json': 'json',
  'application/pdf': 'pdf',
};

// A data URL as a File. Synchronous, so it never costs a click its user
// activation. Returns undefined for anything that is not a data URL.
export function dataUrlToFile(
  dataUrl: unknown,
  baseName: string,
): File | undefined {
  if (typeof dataUrl !== 'string') return undefined;
  const match = /^data:([^,]*?)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return undefined;
  const type = (match[1] || 'text/plain').split(';')[0].toLowerCase();
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    if (match[2]) {
      const binary = atob(match[3].replace(/\s/g, ''));
      bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(match[3]));
    }
  } catch {
    return undefined;
  }
  const extension = EXTENSIONS[type];
  const hasExtension = /\.[a-z0-9]+$/i.test(baseName);
  const name =
    extension && !hasExtension ? `${baseName}.${extension}` : baseName;
  return new File([bytes], name, { type });
}

export async function copyText(
  value: string,
  title = 'Copy',
): Promise<CopyResult> {
  try {
    await navigator.clipboard.writeText(value);
    return 'copied';
  } catch {
    // The dialog's Copy button is a fresh click, so the clipboard accepts it.
    manualCopyStore.get()?.resolve('cancelled');
    return new Promise((resolve) =>
      manualCopyStore.set({ title, value, resolve }),
    );
  }
}

export interface ShareInputs {
  title?: unknown;
  text?: unknown;
  url?: unknown;
  files?: unknown;
  fileName?: unknown;
}

const asText = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const text = (typeof value === 'string' ? value : String(value)).trim();
  return text || undefined;
};

// What a Share Button shares, built synchronously at click time. Addresses
// that are not HTTP(S) and files that are not data URLs are left out.
// Undefined when nothing is left to share.
export function buildShareContent(
  inputs: ShareInputs,
  baseURL = typeof document === 'undefined' ? undefined : document.baseURI,
): ShareContent | undefined {
  const title = asText(inputs.title);
  const text = asText(inputs.text);
  let url = asText(inputs.url);
  if (url) {
    try {
      const parsed = new URL(url, baseURL);
      url = /^https?:$/.test(parsed.protocol) ? parsed.href : undefined;
    } catch {
      url = undefined;
    }
  }
  const sources = (
    Array.isArray(inputs.files) ? inputs.files : [inputs.files]
  ).filter(
    (source) => source !== undefined && source !== null && source !== '',
  );
  const baseName = asText(inputs.fileName) ?? 'shared';
  const decoded = sources
    .map((source) => dataUrlToFile(source, baseName))
    .filter((file): file is File => file !== undefined);
  // numbered after dropping what is not a file, so the names have no gaps
  const files =
    decoded.length > 1
      ? decoded.map(
          (file, index) =>
            new File(
              [file],
              file.name.replace(/(\.[a-z0-9]+)?$/i, `-${index + 1}$1`),
              { type: file.type },
            ),
        )
      : decoded;
  if (!title && !text && !url && files.length === 0) return undefined;
  return { title, text, url, files: files.length > 0 ? files : undefined };
}
