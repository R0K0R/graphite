import { useState, useEffect, useCallback, useRef } from 'react';
import * as Y from 'yjs';
import { roomCodeForBranch, readVcsJson, setBranchMeta } from './branchStore.js';
import { computeNodeDiff } from './computeNodeDiff.js';
import { captureUpdate, getYNodes, getDoc, initRoom } from '../crdt/doc.js';

// Converts a base64 string (from IPC) to Uint8Array
function b64toU8(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function useVcs(rootPath) {
  const [branches, setBranches]         = useState([]);
  const [currentBranch, setCurrentBranch] = useState(null);
  const [hasGit, setHasGit]             = useState(false);
  const [isDirty, setIsDirty]           = useState(false);
  const [gitLog, setGitLog]             = useState([]);
  const [diffMode, setDiffMode]         = useState(null);
  // { fromBranch, fromHash, diffById: Map, baseOpacity: number, counts: {added,removed,moved,modified} }
  const [canvasAnim, setCanvasAnim]     = useState(null);
  const [blameMap, setBlameMap]         = useState({});
  const baseSnapshotRef = useRef(null); // Uint8Array of last committed snapshot

  // Track Yjs changes to detect dirty state
  useEffect(() => {
    if (!rootPath || !hasGit) return;
    const yNodes = getYNodes();
    const check = () => {
      const cur = captureUpdate();
      if (!baseSnapshotRef.current) { setIsDirty(cur.length > 10); return; }
      setIsDirty(!arraysEqual(cur, baseSnapshotRef.current));
    };
    yNodes.observe(check);
    return () => yNodes.unobserve(check);
  }, [rootPath, hasGit]);

  const init = useCallback(async (path) => {
    if (!window.electronAPI || !path) return;
    try {
      const res = await window.electronAPI.vcsInit(path);
      if (!res) return;
      setHasGit(res.hasGit);
      setBranches(res.branches ?? []);
      setCurrentBranch(res.currentBranch ?? null);
      if (res.snapshotUpdate) {
        baseSnapshotRef.current = b64toU8(res.snapshotUpdate);
      }
      // Load blame
      const blame = await window.electronAPI.vcsLoadBlame(path);
      if (blame) setBlameMap(blame);
      // Load git log
      const log = await window.electronAPI.vcsGitLog(path, 10);
      if (log) setGitLog(log);
    } catch (e) {
      console.error('[VCS] init error', e);
    }
  }, []);

  const refreshLog = useCallback(async (path) => {
    if (!window.electronAPI || !path) return;
    const log = await window.electronAPI.vcsGitLog(path, 10);
    if (log) setGitLog(log);
  }, []);

  const commit = useCallback(async (message) => {
    if (!rootPath || !window.electronAPI) return null;
    const update = captureUpdate();
    const b64 = btoa(String.fromCharCode(...update));
    const res = await window.electronAPI.vcsCommit(rootPath, b64, message);
    if (res?.ok) {
      baseSnapshotRef.current = update;
      setIsDirty(false);
      await refreshLog(rootPath);
      // Refresh blame
      const blame = await window.electronAPI.vcsLoadBlame(rootPath);
      if (blame) setBlameMap(blame);
    }
    return res;
  }, [rootPath, refreshLog]);

  const createBranch = useCallback(async (name) => {
    if (!rootPath || !window.electronAPI) return null;
    const update = captureUpdate();
    const b64 = btoa(String.fromCharCode(...update));
    const res = await window.electronAPI.vcsCreateBranch(rootPath, name, b64);
    if (res?.ok) {
      setBranches(prev => [...prev, name]);
      await setBranchMeta(rootPath, name, { roomCode: res.roomCode });
    }
    return res;
  }, [rootPath]);

  const checkout = useCallback(async (branchName) => {
    if (!rootPath || !window.electronAPI || branchName === currentBranch) return null;
    setCanvasAnim('lift');
    const res = await window.electronAPI.vcsCheckout(rootPath, branchName);
    if (res?.ok) {
      // Switch to this branch's Yjs room (~180ms into the animation)
      setTimeout(async () => {
        const roomCode = res.roomCode ?? await roomCodeForBranch(rootPath, branchName);
        initRoom(rootPath, roomCode);
        // Seed the doc with the committed snapshot if available
        if (res.snapshotUpdate) {
          const seed = b64toU8(res.snapshotUpdate);
          Y.applyUpdate(getDoc(), seed);
          baseSnapshotRef.current = seed;
        } else {
          baseSnapshotRef.current = null;
        }
        setCurrentBranch(branchName);
        setIsDirty(false);
        setCanvasAnim('reveal');
        setTimeout(() => setCanvasAnim(null), 330);
      }, 180);
    } else {
      setCanvasAnim(null);
    }
    return res;
  }, [rootPath, currentBranch]);

  const showDiff = useCallback(async (fromHash) => {
    if (!rootPath || !window.electronAPI) return;
    const update = captureUpdate();
    const b64 = btoa(String.fromCharCode(...update));
    const res = await window.electronAPI.vcsDiff(rootPath, fromHash ?? null, b64);
    if (!res) return;
    // res.baseNodes + res.currentNodes
    const diffById = computeNodeDiff(res.baseNodes ?? [], res.currentNodes ?? []);
    const counts = { added: 0, removed: 0, moved: 0, modified: 0 };
    for (const d of diffById.values()) counts[d.type] = (counts[d.type] ?? 0) + 1;
    setDiffMode({
      fromHash: fromHash ?? 'last',
      diffById,
      baseOpacity: 0.5,
      counts,
    });
  }, [rootPath]);

  const exitDiff = useCallback(() => setDiffMode(null), []);

  const setDiffOpacity = useCallback((v) => {
    setDiffMode(prev => prev ? { ...prev, baseOpacity: v } : null);
  }, []);

  // Listen for git branch changes triggered externally (e.g. user runs `git checkout` in terminal)
  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onGitBranchChanged(async (newBranch) => {
      if (newBranch === currentBranch || !rootPath) return;
      await checkout(newBranch);
      await init(rootPath);
    });
  }, [currentBranch, rootPath, checkout, init]);

  return {
    hasGit, branches, currentBranch, isDirty, gitLog, blameMap,
    diffMode, canvasAnim,
    init, commit, createBranch, checkout, showDiff, exitDiff, setDiffOpacity,
  };
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
