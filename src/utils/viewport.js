import { useRef } from 'react';

// Keep a ref always equal to the latest value — no useEffect churn needed.
export function useLiveRef(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

// Pan+zoom viewport so canvas point (cx, cy) is centered on screen.
export function centerViewport(setVp, cx, cy, zoom, cw, ch) {
  setVp({ x: cw / 2 - cx * zoom, y: ch / 2 - cy * zoom, zoom }, { duration: 350 });
}

export function isRectFullyVisible(b, vpX, vpY, zoom, cw, ch) {
  return (
    b.position.x * zoom + vpX >= 0 &&
    b.position.y * zoom + vpY >= 0 &&
    (b.position.x + b.width)  * zoom + vpX <= cw &&
    (b.position.y + b.height) * zoom + vpY <= ch
  );
}
