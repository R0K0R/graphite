import { useState, useEffect, useCallback } from 'react';
import { applyNodeChanges } from 'reactflow';
import { getDoc, getYNodes, onRoomChange } from './doc.js';

const CALLBACK_KEYS = new Set([
  'onContentChange', 'onFilePicked', 'onEditorFocus', 'onEditorBlur',
  'onChangeParam', 'onToggleCollapse', 'onLinkDir', 'peerColors',
]);

function stripCallbacks(node) {
  const cleanData = {};
  for (const [k, v] of Object.entries(node.data ?? {})) {
    if (!CALLBACK_KEYS.has(k)) cleanData[k] = v;
  }
  const { externalChange, _diskContent, ...restData } = cleanData;
  // `selected` is local UI state — never persist it so peer windows don't
  // inherit a spuriously-selected node with its inflated z-index.
  const { selected: _sel, ...restNode } = node;
  return { ...restNode, data: restData };
}

export function useYNodes() {
  const [nodes, setLocal] = useState([]);

  useEffect(() => {
    let unsubYMap = null;

    function connectToRoom() {
      // Unsubscribe from the previous Y.Map (if any)
      unsubYMap?.();
      unsubYMap = null;

      const yNodes = getYNodes();
      const sync = () => setLocal(Array.from(yNodes.values()));
      yNodes.observe(sync);
      sync();
      unsubYMap = () => yNodes.unobserve(sync);
    }

    connectToRoom();
    const unsubRoom = onRoomChange(connectToRoom);

    return () => {
      unsubYMap?.();
      unsubRoom();
    };
  }, []);

  const setNodes = useCallback((updater) => {
    const yNodes = getYNodes();
    const current = Array.from(yNodes.values());
    const next = typeof updater === 'function' ? updater(current) : updater;
    getDoc().transact(() => {
      const nextIds = new Set(next.map(n => n.id));
      current.forEach(n => { if (!nextIds.has(n.id)) yNodes.delete(n.id); });
      next.forEach(n => yNodes.set(n.id, stripCallbacks(n)));
    });
  }, []);

  const onNodesChange = useCallback((changes) => {
    const yNodes = getYNodes();
    const current = Array.from(yNodes.values());
    const next = applyNodeChanges(changes, current);
    getDoc().transact(() => {
      changes.filter(c => c.type === 'remove').forEach(c => yNodes.delete(c.id));
      next.forEach(n => yNodes.set(n.id, stripCallbacks(n)));
    });
  }, []);

  return [nodes, setNodes, onNodesChange];
}
import { useState, useEffect, useCallback } from 'react';
import { applyNodeChanges } from 'reactflow';
import { getDoc, getYNodes, onRoomChange } from './doc.js';

const CALLBACK_KEYS = new Set([
  'onContentChange', 'onFilePicked', 'onEditorFocus', 'onEditorBlur',
  'onChangeParam', 'onToggleCollapse', 'onLinkDir', 'peerColors',
]);

function stripCallbacks(node) {
  const cleanData = {};
  for (const [k, v] of Object.entries(node.data ?? {})) {
    if (!CALLBACK_KEYS.has(k)) cleanData[k] = v;
  }
  const { externalChange, _diskContent, ...restData } = cleanData;
  // `selected` is local UI state — never persist it so peer windows don't
  // inherit a spuriously-selected node with its inflated z-index.
  const { selected: _sel, ...restNode } = node;
  return { ...restNode, data: restData };
}

export function useYNodes() {
  const [nodes, setLocal] = useState([]);

  useEffect(() => {
    let unsubYMap = null;

    function connectToRoom() {
      // Unsubscribe from the previous Y.Map (if any)
      unsubYMap?.();
      unsubYMap = null;

      const yNodes = getYNodes();
      const sync = () => setLocal(Array.from(yNodes.values()));
      yNodes.observe(sync);
      sync();
      unsubYMap = () => yNodes.unobserve(sync);
    }

    connectToRoom();
    const unsubRoom = onRoomChange(connectToRoom);

    return () => {
      unsubYMap?.();
      unsubRoom();
    };
  }, []);

  const setNodes = useCallback((updater) => {
    const yNodes = getYNodes();
    const current = Array.from(yNodes.values());
    const next = typeof updater === 'function' ? updater(current) : updater;
    getDoc().transact(() => {
      const nextIds = new Set(next.map(n => n.id));
      current.forEach(n => { if (!nextIds.has(n.id)) yNodes.delete(n.id); });
      next.forEach(n => yNodes.set(n.id, stripCallbacks(n)));
    });
  }, []);

  const onNodesChange = useCallback((changes) => {
    const yNodes = getYNodes();
    const current = Array.from(yNodes.values());
    const next = applyNodeChanges(changes, current);
    getDoc().transact(() => {
      changes.filter(c => c.type === 'remove').forEach(c => yNodes.delete(c.id));
      next.forEach(n => yNodes.set(n.id, stripCallbacks(n)));
    });
  }, []);

  return [nodes, setNodes, onNodesChange];
}
