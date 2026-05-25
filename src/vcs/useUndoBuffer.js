import { useRef, useCallback } from 'react';
import * as Y from 'yjs';

const RING_SIZE = 50;

// In-memory ring buffer of Y.Doc updates (Uint8Array).
// Nothing touches disk; the buffer lives only for the current session.
export function useUndoBuffer() {
  const ringRef  = useRef([]);  // array of Uint8Array (encoded state updates)
  const cursorRef = useRef(-1); // index of the "current" snapshot

  const push = useCallback((update) => {
    const ring = ringRef.current;
    // Drop any redo tail when a new update arrives
    const newRing = ring.slice(0, cursorRef.current + 1);
    newRing.push(update);
    if (newRing.length > RING_SIZE) newRing.shift();
    ringRef.current = newRing;
    cursorRef.current = newRing.length - 1;
  }, []);

  // Returns the Uint8Array snapshot to apply, or null if at beginning
  const undo = useCallback(() => {
    const cursor = cursorRef.current;
    if (cursor <= 0) return null;
    cursorRef.current = cursor - 1;
    return ringRef.current[cursorRef.current];
  }, []);

  const redo = useCallback(() => {
    const cursor = cursorRef.current;
    if (cursor >= ringRef.current.length - 1) return null;
    cursorRef.current = cursor + 1;
    return ringRef.current[cursorRef.current];
  }, []);

  const canUndo = () => cursorRef.current > 0;
  const canRedo = () => cursorRef.current < ringRef.current.length - 1;

  const reset = useCallback(() => {
    ringRef.current  = [];
    cursorRef.current = -1;
  }, []);

  return { push, undo, redo, canUndo, canRedo, reset };
}
