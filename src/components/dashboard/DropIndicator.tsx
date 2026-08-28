import React from 'react';
import {
  DefaultEventHandlers,
  Indicator,
  NodeId,
  useEditor,
} from '@craftjs/core';
import type { EditorStore } from '@craftjs/core/lib/editor/store';
import { COLOR, COLOR_ERROR } from '../../utils/constants';

/**
 * craft.js decides whether the drop indicator is a horizontal or a vertical
 * bar from `getDOMInfo(el).inFlow` (@craftjs/utils), which bails out as soon
 * as the *child* has `overflow` other than `visible` - before it ever looks at
 * the parent's flex-direction. Every Tailrmade widget and container gets
 * `overflow: auto` unless it hugs on both axes (getOverflowForSize in
 * layoutableHelpers.tsx), so `inFlow` is false everywhere and craft treats the
 * whole dashboard as a row of floats: vertical bar always, and a drop index
 * derived from the pointer's x position even inside a column.
 *
 * Rather than bend the layout to craft's heuristic, this module replaces both
 * halves through craft's own extension points: an event-handler subclass that
 * recomputes the placement along the parent's real main axis (the `handlers`
 * option), and a replacement indicator element (craft's own is hidden via the
 * `indicator` option).
 */

type StackAxis = {
  isHorizontal: boolean;
  isReversed: boolean;
};

// The axis a parent actually stacks its children on. Reading the rendered
// flex-direction rather than the flexDirection prop keeps this correct for the
// narrow-dashboard flip (getNewDirection) and for any non-craft wrapper.
export const getStackAxis = (dom: HTMLElement): StackAxis => {
  const style = window.getComputedStyle(dom);
  const isFlex = style.display === 'flex' || style.display === 'inline-flex';
  // a non-flex parent is normal block flow, i.e. stacked vertically
  const direction = isFlex ? style.flexDirection : 'column';

  return {
    isHorizontal: direction.startsWith('row'),
    isReversed: direction.endsWith('-reverse'),
  };
};

type ChildRect = {
  // index into the parent's node list, NOT into the filtered array below -
  // children without a mounted dom must not shift the drop index
  index: number;
  id: NodeId;
  rect: DOMRect;
};

const collectChildRects = (
  store: EditorStore,
  parentId: NodeId,
): ChildRect[] => {
  const childIds = store.query.node(parentId).get()?.data.nodes ?? [];

  return childIds.reduce((result: ChildRect[], id: NodeId, index: number) => {
    const dom = store.query.node(id).get()?.dom;
    if (dom) {
      result.push({ index, id, rect: dom.getBoundingClientRect() });
    }
    return result;
  }, []);
};

// A row parent may wrap (mobileBehavior: 'wrap'), in which case comparing x
// against every child mixes up the lines. Keep only the line the pointer is
// on, falling back to the nearest one when it is in a gap or outside.
const narrowToHoveredLine = (children: ChildRect[], y: number): ChildRect[] => {
  const onLine = children.filter(
    (child) => y >= child.rect.top && y <= child.rect.bottom,
  );
  if (onLine.length > 0) {
    return onLine;
  }

  const distanceTo = (child: ChildRect) =>
    y < child.rect.top ? child.rect.top - y : y - child.rect.bottom;
  const nearest = children.reduce((closest, child) =>
    distanceTo(child) < distanceTo(closest) ? child : closest,
  );

  return children.filter(
    (child) =>
      child.rect.top <= nearest.rect.bottom &&
      child.rect.bottom >= nearest.rect.top,
  );
};

/**
 * Rewrites `indicator.placement` in place so index/where follow the parent's
 * main axis. Mutating is deliberate: craft's Positioner hands the very same
 * object to `dropElement()` on dragend, so correcting a copy would show one
 * slot and drop into another. The store only ever receives copies (see below),
 * which is what keeps this object out of immer's auto-freeze.
 */
export const applyAxisAwarePlacement = (
  store: EditorStore,
  indicator: Indicator,
  x: number,
  y: number,
): void => {
  const parent = indicator.placement.parent;
  const parentDom = parent?.dom;
  if (!parentDom) {
    return;
  }

  const { isHorizontal, isReversed } = getStackAxis(parentDom);
  const allChildren = collectChildRects(store, parent.id);
  if (allChildren.length === 0) {
    // empty container - craft's index 0 / 'before' is already right
    return;
  }

  const children = isHorizontal
    ? narrowToHoveredLine(allChildren, y)
    : allChildren;

  const pointer = isHorizontal ? x : y;
  const centerOf = (rect: DOMRect) =>
    isHorizontal ? (rect.left + rect.right) / 2 : (rect.top + rect.bottom) / 2;
  const isBehindPointer = (child: ChildRect) =>
    isReversed
      ? pointer < centerOf(child.rect)
      : pointer > centerOf(child.rect);

  const passed = children.filter(isBehindPointer).length;
  const target = passed === 0 ? children[0] : children[passed - 1];

  indicator.placement.index = target.index;
  indicator.placement.where = passed === 0 ? 'before' : 'after';
  indicator.placement.currentNode = store.query.node(target.id).get();
};

/**
 * Same drop connector as DefaultEventHandlers, with the placement corrected
 * before it reaches the store.
 */
export class AxisAwareEventHandlers extends DefaultEventHandlers {
  handlers() {
    const base = super.handlers();
    const store = this.options.store;

    return {
      ...base,
      drop: (el: HTMLElement, targetId: NodeId) => {
        const unbindDragOver = this.addCraftEventListener(
          el,
          'dragover',
          (e) => {
            e.craft.stopPropagation();
            e.preventDefault();

            if (!this.positioner) {
              return;
            }

            // computeIndicator() returns undefined whenever *craft's* own
            // placement is unchanged, but ours depends on the pointer along a
            // different axis - so always re-read and re-correct the current one
            this.positioner.computeIndicator(targetId, e.clientX, e.clientY);
            const indicator = this.positioner.getIndicator();
            if (!indicator) {
              return;
            }

            applyAxisAwarePlacement(store, indicator, e.clientX, e.clientY);

            store.actions.setIndicator({
              ...indicator,
              placement: { ...indicator.placement },
            });
          },
        );

        const unbindDragEnter = this.addCraftEventListener(
          el,
          'dragenter',
          (e) => {
            e.craft.stopPropagation();
            e.preventDefault();
          },
        );

        return () => {
          unbindDragEnter();
          unbindDragOver();
        };
      },
    };
  }
}

export const createAxisAwareHandlers = (store: EditorStore) =>
  new AxisAwareEventHandlers({
    store,
    removeHoverOnMouseleave: false,
    isMultiSelectEnabled: (e: MouseEvent) => !!e.metaKey,
  });

// craft's built-in indicator is hidden (its geometry comes from the same
// `inFlow` heuristic); DashboardDropIndicator draws the bar instead. Colours
// and thickness stay here so both halves read them from the editor options.
export const dropIndicatorOptions = {
  success: COLOR[6],
  error: COLOR_ERROR,
  thickness: 4,
  style: { display: 'none' } as React.CSSProperties,
};

const getIndicatorBox = (
  parentDom: HTMLElement,
  childDom: HTMLElement | null | undefined,
  where: string,
  isHorizontal: boolean,
  thickness: number,
): React.CSSProperties => {
  if (childDom) {
    const rect = childDom.getBoundingClientRect();
    // the bar sits centred on the edge it marks, so it lands in the gap
    // between two siblings rather than on top of one of them
    if (isHorizontal) {
      const edge = where === 'before' ? rect.left : rect.right;
      return {
        top: rect.top,
        height: rect.height,
        left: edge - thickness / 2,
        width: thickness,
      };
    }

    const edge = where === 'before' ? rect.top : rect.bottom;
    return {
      left: rect.left,
      width: rect.width,
      top: edge - thickness / 2,
      height: thickness,
    };
  }

  // empty container: mark the leading edge of its content box
  const rect = parentDom.getBoundingClientRect();
  const style = window.getComputedStyle(parentDom);
  const padding = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };

  return isHorizontal
    ? {
        top: rect.top + padding.top,
        height: Math.max(rect.height - padding.top - padding.bottom, thickness),
        left: rect.left + padding.left,
        width: thickness,
      }
    : {
        left: rect.left + padding.left,
        width: Math.max(rect.width - padding.left - padding.right, thickness),
        top: rect.top + padding.top,
        height: thickness,
      };
};

// Renders inside <Editor> (fixed positioning, so it can sit anywhere).
export const DashboardDropIndicator = () => {
  const { indicator, options } = useEditor((state) => ({
    indicator: state.indicator,
    options: state.options.indicator,
  }));

  const parentDom = indicator?.placement?.parent?.dom;
  if (!parentDom) {
    return null;
  }

  const { currentNode, where } = indicator.placement;
  const { isHorizontal } = getStackAxis(parentDom);
  const thickness = options.thickness ?? dropIndicatorOptions.thickness;

  return (
    <div
      data-cy="dashboard-drop-indicator"
      data-orientation={isHorizontal ? 'vertical' : 'horizontal'}
      style={{
        position: 'fixed',
        zIndex: 99999,
        pointerEvents: 'none',
        borderRadius: `${thickness}px`,
        backgroundColor: indicator.error
          ? (options.error ?? dropIndicatorOptions.error)
          : (options.success ?? dropIndicatorOptions.success),
        transition: options.transition || '0.1s ease-in',
        ...getIndicatorBox(
          parentDom,
          currentNode?.dom,
          where,
          isHorizontal,
          thickness,
        ),
      }}
    />
  );
};
