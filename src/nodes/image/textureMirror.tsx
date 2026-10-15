import React, { useEffect, useId, useRef, useState } from 'react';

// Something that renders into a texture on the main PIXI renderer and can copy
// the result into a plain 2D canvas. Widgets can't render such nodes in their
// own PIXI app: textures only live in the WebGL context that rendered them, so
// any texture coming from another node would show up empty there
export interface TextureMirrorSource {
  getMirrorSize(): { width: number; height: number };
  addRenderListener(listener: () => void): void;
  removeRenderListener(listener: () => void): void;
  // undefined unregisters the viewer
  setViewerResolution(viewerId: string, resolution: number | undefined): void;
  copyToCanvas(canvas: HTMLCanvasElement): boolean;
}

type TextureMirrorBodyProps = {
  source: TextureMirrorSource;
  disabled: boolean;
  width: string;
  height: string;
};

export const TextureMirrorBody: React.FunctionComponent<
  TextureMirrorBodyProps
> = ({ source, disabled, width, height }) => {
  const viewerId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(() => source.getMirrorSize());

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let frame = 0;
    let visible = true;

    const copy = () => {
      frame = 0;
      if (!visible) return;
      if (source.copyToCanvas(canvas)) {
        const next = source.getMirrorSize();
        setSize((prev) =>
          prev.width === next.width && prev.height === next.height
            ? prev
            : next,
        );
      }
    };
    // copying reads pixels back from the GPU, so do it at most once per frame
    const scheduleCopy = () => {
      if (!frame) {
        frame = requestAnimationFrame(copy);
      }
    };

    const updateResolution = () => {
      const { width: w, height: h } = source.getMirrorSize();
      if (!w || !h || !container.clientWidth || !container.clientHeight) {
        return;
      }
      const displayScale = Math.min(
        container.clientWidth / w,
        container.clientHeight / h,
      );
      source.setViewerResolution(
        viewerId,
        displayScale * (window.devicePixelRatio || 1),
      );
    };

    const resizeObserver = new ResizeObserver(updateResolution);
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) scheduleCopy();
    });
    intersectionObserver.observe(container);

    source.addRenderListener(scheduleCopy);
    updateResolution();
    scheduleCopy();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      source.removeRenderListener(scheduleCopy);
      source.setViewerResolution(viewerId, undefined);
    };
  }, [source, viewerId]);

  const aspectRatio = `${size.width} / ${size.height}`;
  let containerStyle: React.CSSProperties;
  if (width === 'auto' && height === 'auto') {
    containerStyle = { width: `${size.width}px`, height: `${size.height}px` };
  } else if (height === 'auto') {
    containerStyle = { width: '100%', aspectRatio };
  } else if (width === 'auto') {
    containerStyle = { height: '100%', aspectRatio };
  } else {
    containerStyle = { width: '100%', height: '100%' };
  }

  return (
    <div
      ref={containerRef}
      style={{
        ...containerStyle,
        pointerEvents: disabled ? 'none' : 'auto',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
};
