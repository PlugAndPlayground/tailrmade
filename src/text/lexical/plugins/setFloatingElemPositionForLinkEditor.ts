/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
const VERTICAL_GAP = 8;
const HORIZONTAL_OFFSET = 4;

export function setFloatingElemPositionForLinkEditor(
  targetRect: DOMRect | null,
  floatingElem: HTMLElement,
  anchorElem: HTMLElement,
  verticalGap: number = VERTICAL_GAP,
  horizontalOffset: number = HORIZONTAL_OFFSET,
): void {
  if (targetRect === null) {
    floatingElem.style.opacity = '0';
    floatingElem.style.transform = 'translate(-10000px, -10000px)';
    return;
  }

  const floatingElemRect = floatingElem.getBoundingClientRect();

  let top = targetRect.bottom + verticalGap;
  let left = targetRect.left - horizontalOffset;

  // Check viewport boundaries
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Adjust if floating element would go outside viewport
  if (left + floatingElemRect.width > viewportWidth) {
    const oldLeft = left;
    left = viewportWidth - floatingElemRect.width - horizontalOffset;
  }

  if (left < 0) {
    const oldLeft = left;
    left = horizontalOffset;
  }

  if (top + floatingElemRect.height > viewportHeight) {
    const oldTop = top;
    // Position above the target instead
    top = targetRect.top - floatingElemRect.height - verticalGap;
  }

  if (top < 0) {
    const oldTop = top;
    top = verticalGap;
  }

  floatingElem.style.opacity = '1';
  floatingElem.style.transform = `translate(${left}px, ${top}px)`;
  floatingElem.style.position = 'fixed';
  floatingElem.style.zIndex = '9999';
}
