/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const SUPPORTED_URL_PROTOCOLS = new Set([
  'http:',
  'https:',
  'mailto:',
  'sms:',
  'tel:',
  'share:',
]);

// a scheme the editor keeps as typed; anything else gets https://
const KNOWN_SCHEME = /^(https?|mailto|sms|tel|share):/i;

export function sanitizeUrl(url: string): string {
  if (!url) return '';

  try {
    // Add protocol if missing
    if (!KNOWN_SCHEME.test(url)) {
      url = 'https://' + url;
    }

    const parsedUrl = new URL(url);
    if (!SUPPORTED_URL_PROTOCOLS.has(parsedUrl.protocol)) {
      return 'about:blank';
    }
    return url;
  } catch {
    // If URL parsing fails, ensure it has a protocol
    if (!KNOWN_SCHEME.test(url)) {
      return 'https://' + url;
    }
    return url;
  }
}
