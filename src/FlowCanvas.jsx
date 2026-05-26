import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { PrefsContext } from './ThemeContext.js';
import ReactFlow, {
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  MarkerType,
} from 'reactflow';
import { useYNodes } from './crdt/useYNodes.js';
import { initRoom, destroyProviders, getDoc, getYText, getAwareness, getYNodes } from './crdt/doc.js';
import { dispatch as agentDispatch } from './agent/agentBridge.js';
import AgentPanel from './components/AgentPanel.jsx';
import UnifiedDiff from './components/UnifiedDiff.jsx';
import { generateRoomCode } from './utils/wordlist.js';

import ChaperonNode from './components/nodes/ScriptNode.jsx';
import RegionNode from './components/nodes/RegionNode.jsx';
import FileNode from './components/nodes/FileNode.jsx';
import DiffGhostNode from './components/nodes/DiffGhostNode.jsx';
import MergeGhostNode from './components/nodes/MergeGhostNode.jsx';
import SymbolCard from './components/nodes/SymbolCard.jsx';
import Sidebar from './components/Sidebar.jsx';
import StatusBar from './components/StatusBar.jsx';
import PrefsPopup from './components/PrefsPopup.jsx';
import SessionPanel from './components/SessionPanel.jsx';
import BranchBar from './components/BranchBar.jsx';
import DiffPanel from './components/DiffPanel.jsx';
import MergePanel from './components/MergePanel.jsx';
import { usePeers } from './crdt/usePeers.js';
import { getAllDeps, onDepsChanged, clearAllDeps, getRefCount } from './lsp/depGraph.js';
import PeerCursorWindow from './components/PeerCursorWindow.jsx';
import { useVcs } from './vcs/useVcs.js';
import { CATEGORIES } from './data/modules.js';
import { computeAllRegionBounds } from './utils/regionBounds.js';
import { useLiveRef, centerViewport } from './utils/viewport.js';
import { buildNodesFromTree } from './utils/treeLayout.js';
import { mkScriptNode, mkRegion, mkFileNode, mkSymbolCard } from './utils/nodeFactories.js';
import { usePrefsState } from './hooks/usePrefsState.js';
import { T_FW, T_FH, FOCUS_FILL } from './utils/canvasConstants.js';

const NODE_TYPES = {
  chaperonin: ChaperonNode,
  region: RegionNode,
  file: FileNode,
  'diff-ghost': DiffGhostNode,
  'merge-ghost': MergeGhostNode,
  'symbol-card': SymbolCard,
};

export default function FlowCanvas() {
  const [nodes, setNodes, onNodesChange] = useYNodes();
  const [fileTree, setFileTree] = useState(null);
  const [rootPath, setRootPath] = useState(null);
  const [showPrefs, setShowPrefs]           = useState(false);
  const [showSession, setShowSession]       = useState(false);
  const [showAgent, setShowAgent]           = useState(false);
  const [agentScopedFile, setAgentScopedFile] = useState(null);
  const [contentDiff, setContentDiff]       = useState(null); // { filePath, oldText, newText }
  const [namePrompt, setNamePrompt]         = useState(null); // { kind: 'file'|'region', resolve }
  const [namePromptValue, setNamePromptValue] = useState('');
  const peers = usePeers();
  const [hoveredNodeId, setHoveredNodeId]   = useState(null);
  const [focusedNodeId, setFocusedNodeId]   = useState(null);
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [ctrlDragOver, setCtrlDragOver]     = useState(null); // regionId the Ctrl-dragged node hovers over
  const [editMode, setEditMode]             = useState(false);
  const [accessStack, setAccessStack]       = useState([]); // nodeIds, most recently accessed last → highest z-index
  const [depTick, setDepTick]               = useState(0);
  const [dismissedPeers, setDismissedPeers] = useState(new Set());
  const [ctrlHeld, setCtrlHeld]             = useState(false);
  const [showLayouts, setShowLayouts]       = useState(false);
  const [layoutProfiles, setLayoutProfiles] = useState([]);
  const [layoutNameInput, setLayoutNameInput] = useState('');

  const {
    theme, setTheme,
    regionAlpha, setRegionAlpha,
    hoverScale, setHoverScale,
    dimScale, setDimScale,
    hoverDelay, setHoverDelay,
    focusZoom, setFocusZoom,
    watchdogEnabled, setWatchdogEnabled,
    watchdogModel, setWatchdogModel,
  } = usePrefsState();

  const vcs = useVcs(rootPath);

  const [expandedNodeId, setExpandedNodeId] = useState(null);
  const [expandedDims, setExpandedDims]     = useState(null); // { width, height } — state so resize triggers re-render
  const expandSavedRef      = useRef(null);  // { style, width, height } saved before expand
  const expandedNodeIdRef   = useLiveRef(expandedNodeId); // stable ref for callbacks
  const shrinkingNodeIdRef  = useRef(null);  // blocks stale dimension events after Alt+F shrink
  const shrinkTimerRef      = useRef(null);

  // Two-phase layout: phase 1 = estimated, phase 2 = measured actual sizes
  const treeRef           = useRef(null);
  const layoutPhaseRef    = useRef(0); // 0=idle, 1=measuring, 2=done

  const nodesRef        = useRef(nodes);
  const metaTimer       = useRef(null);
  const hoverTimer      = useRef(null);
  const editBlurTimer   = useRef(null);
  const regionBoundsRef = useRef(new Map());
  const { fitView, getViewport, setViewport } = useReactFlow();

  const hoveredNodeRef = useLiveRef(hoveredNodeId);
  const focusedNodeRef = useLiveRef(focusedNodeId);
  const focusZoomRef   = useLiveRef(focusZoom);
  const fitViewRef     = useLiveRef(fitView);
  const setViewportRef = useLiveRef(setViewport);
  const editModeRef    = useLiveRef(editMode);

  const markAccessed = useCallback((nodeId) => {
    if (!nodeId) return;
    setAccessStack(prev =>
      prev[prev.length - 1] === nodeId ? prev : [...prev.filter(id => id !== nodeId), nodeId]
    );
  }, []);
  const markAccessedRef = useLiveRef(markAccessed);

  // Alt+F: expand node to fill viewport; toggle restores.
  // Expand state is purely local (never in Yjs) so Yjs roundtrips can't clobber it.
  useEffect(() => {
    function calcDims() {
      const canvas = document.querySelector('.ide-canvas');
      const { width: cw, height: ch } = canvas?.getBoundingClientRect() ?? { width: window.innerWidth, height: window.innerHeight };
      const targetZoom = focusZoomRef.current / 100;
      return {
        nodeW: Math.round(cw * FOCUS_FILL / targetZoom),
        nodeH: Math.round(ch * FOCUS_FILL / targetZoom),
        cw, ch, targetZoom,
      };
    }

    function onKeyDown(e) {
      if (!e.altKey || e.key.toLowerCase() !== 'f') return;
      e.preventDefault();
      e.stopPropagation();
      const fid = focusedNodeRef.current;
      const hid = hoveredNodeRef.current;

      if (fid) {
        const saved = expandSavedRef.current;
        shrinkingNodeIdRef.current = fid;
        clearTimeout(shrinkTimerRef.current);
        shrinkTimerRef.current = setTimeout(() => { shrinkingNodeIdRef.current = null; }, 600);
        setExpandedDims(null);
        expandSavedRef.current = null;
        setExpandedNodeId(null);
        setFocusedNodeId(null);
        setEditMode(false);
        setNodes(nds => nds.map(n => {
          if (n.id !== fid) return n;
          if (saved?.width != null) {
            const next = { ...n, width: saved.width, height: saved.height };
            if (saved.style) next.style = saved.style; else delete next.style;
            return next;
          }
          const { width: _w, height: _h, style: _s, ...rest } = n;
          return rest;
        }));
        setTimeout(() => fitViewRef.current({ padding: 0.3, duration: 350 }), 80);
      } else if (hid) {
        const node = nodesRef.current.find(n => n.id === hid);
        if (!node) return;
        if (node.type === 'region') {
          const b = regionBoundsRef.current.get(hid);
          if (!b) return;
          const { cw, ch, targetZoom } = calcDims();
          centerViewport(setViewportRef.current, b.position.x + b.width / 2, b.position.y + b.height / 2, targetZoom, cw, ch);
          return;
        }

        setHoveredNodeId(null);
        setFocusedNodeId(hid);
        markAccessedRef.current(hid);

        // Measure canvas right now — fresh every time Alt+F is pressed
        const { nodeW, nodeH, cw, ch, targetZoom } = calcDims();

        // Save original state so shrink can restore it exactly
        expandSavedRef.current = { style: node.style ?? null, width: node.width, height: node.height };
        setExpandedDims({ width: nodeW, height: nodeH });
        setExpandedNodeId(hid);

        const nodePos = node.position;
        setTimeout(() => {
          centerViewport(setViewportRef.current, nodePos.x + nodeW / 2, nodePos.y + nodeH / 2, targetZoom, cw, ch);
          setTimeout(() => {
            const ta = document.querySelector(`[data-id="${hid}"] .monaco-editor textarea`);
            if (ta) { ta.focus(); setEditMode(true); }
          }, 380);
        }, 80);
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // Recalculate expanded dimensions whenever the window is resized while a node is expanded
  useEffect(() => {
    if (!expandedNodeId) return;
    function onResize() {
      const canvas = document.querySelector('.ide-canvas');
      const { width: cw, height: ch } = canvas?.getBoundingClientRect() ?? { width: window.innerWidth, height: window.innerHeight };
      const targetZoom = focusZoomRef.current / 100;
      setExpandedDims({ width: Math.round(cw * FOCUS_FILL / targetZoom), height: Math.round(ch * FOCUS_FILL / targetZoom) });
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [expandedNodeId]);

  // ESC exits edit mode
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && editModeRef.current) {
        document.activeElement?.blur();
        setEditMode(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Track Ctrl key for region drag gating
  useEffect(() => {
    const dn = e => { if (e.key === 'Control') setCtrlHeld(true);  };
    const up = e => { if (e.key === 'Control') setCtrlHeld(false); };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup',   up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  useEffect(() => () => destroyProviders(), []);

  // Load layout profile list when rootPath changes
  useEffect(() => {
    if (!rootPath || !window.electronAPI?.layoutList) return;
    window.electronAPI.layoutList(rootPath).then(setLayoutProfiles);
  }, [rootPath]);

  const saveLayout = async (name) => {
    if (!rootPath || !name.trim()) return;
    const data = {
      name: name.trim(),
      savedAt: new Date().toISOString(),
      nodes: nodesRef.current.map(n => ({ id: n.id, x: n.position.x, y: n.position.y, ...(n.width ? { width: n.width } : {}), ...(n.height ? { height: n.height } : {}) })),
    };
    await window.electronAPI.layoutSave(rootPath, name.trim(), data);
    const updated = await window.electronAPI.layoutList(rootPath);
    setLayoutProfiles(updated);
    setLayoutNameInput('');
  };

  const loadLayout = async (name) => {
    if (!rootPath) return;
    const data = await window.electronAPI.layoutLoad(rootPath, name);
    if (!data?.nodes) return;
    const posMap = new Map(data.nodes.map(n => [n.id, n]));
    setNodes(nds => nds.map(n => {
      const p = posMap.get(n.id);
      if (!p) return n;
      return { ...n, position: { x: p.x, y: p.y }, ...(p.width ? { width: p.width } : {}), ...(p.height ? { height: p.height } : {}) };
    }));
    setShowLayouts(false);
  };

  const deleteLayout = async (name) => {
    if (!rootPath) return;
    await window.electronAPI.layoutDelete(rootPath, name);
    setLayoutProfiles(prev => prev.filter(p => p !== name));
  };

  useEffect(() => onDepsChanged(() => setDepTick(t => t + 1)), []);

  // Broadcast which node the local user is viewing via awareness
  useEffect(() => {
    const aw = getAwareness();
    if (!aw) return;
    aw.setLocalStateField('focusedNode', focusedNodeId ?? hoveredNodeId ?? null);
  }, [focusedNodeId, hoveredNodeId]);

  // Agent IPC → agentBridge + canvas actions
  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onAgentEvent(event => {
      agentDispatch(event);
      if (event.type === 'canvas-action') {
        const { action } = event;
        if (action.type === 'create') {
          const id = `agent_${Date.now()}`;
          const pos = { x: action.x ?? 200, y: action.y ?? 200 };
          if (action.nodeType === 'file') setNodes(nds => [...nds, mkFileNode(id, pos, { filePath: action.filePath })]);
          else if (action.nodeType === 'chaperonin') setNodes(nds => [...nds, mkScriptNode(id, pos)]);
        } else if (action.type === 'delete') {
          setNodes(nds => nds.filter(n => n.id !== action.id));
        }
      }
    });
  }, [setNodes]);

  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onFileChanged(({ filePath, content }) => {
      // Only replace Y.Text when content differs — if CRDT already delivered
      // this change the content will match and replacing would cause a syntax-
      // highlighting flash and clobber peer cursors.
      const yText = getYText(filePath);
      if (yText.toString() !== content) {
        getDoc().transact(() => {
          yText.delete(0, yText.length);
          yText.insert(0, content);
        });
      }
    });
  }, []);

  const { childParentMap, nodeById } = useMemo(() => {
    const childParentMap = new Map();
    const nodeById = new Map();
    for (const n of nodes) {
      nodeById.set(n.id, n);
      if (n.type === 'region') {
        for (const cid of n.data?.children ?? []) childParentMap.set(cid, n.id);
      }
    }
    return { childParentMap, nodeById };
  }, [nodes]);

  function isHiddenByCollapse(nodeId) {
    let cur = nodeId;
    const visited = new Set();
    while (childParentMap.has(cur)) {
      if (visited.has(cur)) break;
      visited.add(cur);
      const parentId = childParentMap.get(cur);
      if (nodeById.get(parentId)?.data?.collapsed) return true;
      cur = parentId;
    }
    return false;
  }

  // ---- Callbacks ----

  const onChangeParam = useCallback((nodeId, paramId, value) => {
    setNodes(nds => nds.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, params: { ...n.data.params, [paramId]: value } } } : n
    ));
  }, [setNodes]);

  const onContentChange = useCallback((nodeId, content) => {
    setNodes(nds => nds.map(n =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, content, externalChange: false, _diskContent: undefined } }
        : n
    ));
  }, [setNodes]);

  const onFilePicked = useCallback((nodeId) => {
    if (!window.electronAPI) return;
    window.electronAPI.openFilePicker().then(filePath => {
      if (!filePath) return;
      window.electronAPI.readFile(filePath).then(content => {
        setNodes(nds => nds.map(n =>
          n.id === nodeId ? { ...n, data: { ...n.data, filePath, content, externalChange: false } } : n
        ));
        window.electronAPI.watchFile(filePath);
      });
    });
  }, [setNodes]);

  const toggleRegionCollapse = useCallback((regionId) => {
    setNodes(nds => {
      const bounds = computeAllRegionBounds(nds);
      return nds.map(n => {
        if (n.id !== regionId || n.type !== 'region') return n;
        const collapsed = !(n.data?.collapsed ?? false);
        if (collapsed) {
          const b = bounds.get(regionId);
          return { ...n, data: { ...n.data, collapsed, savedBounds: b ?? null } };
        }
        return { ...n, data: { ...n.data, collapsed } };
      });
    });
  }, []);

  const onLinkDir = useCallback((regionId) => {
    if (!window.electronAPI) return;
    window.electronAPI.openDirPicker().then(dirPath => {
      if (!dirPath) return;
      setNodes(nds => nds.map(n =>
        n.id === regionId ? { ...n, data: { ...n.data, dirPath } } : n
      ));
    });
  }, [setNodes]);

  const onEditorFocus = useCallback((nodeId) => {
    clearTimeout(editBlurTimer.current);
    setEditMode(true);
    markAccessed(nodeId);
  }, [markAccessed]);

  const onEditorBlur = useCallback(() => {
    // Debounce so clicking between two Monaco editors doesn't flash out of edit mode
    editBlurTimer.current = setTimeout(() => setEditMode(false), 100);
  }, []);

  const focusNode = useCallback((nodeId) => {
    const isRegion = nodesRef.current.find(n => n.id === nodeId)?.type === 'region';
    requestAnimationFrame(() => {
      fitView({ nodes: [{ id: nodeId }], duration: 350, padding: isRegion ? 0.05 : 0.15 });
    });
  }, [fitView]);

  const removeNode = useCallback((nodeId) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node?.type === 'file' && node.data.filePath && window.electronAPI) {
      window.electronAPI.unwatchFile(node.data.filePath);
    }
    setNodes(nds => nds.filter(n => n.id !== nodeId));
  }, [setNodes]);

  // Phase 2: once ReactFlow has measured all file nodes, re-layout with actual sizes
  useEffect(() => {
    if (layoutPhaseRef.current !== 1) return;
    const tree = treeRef.current;
    if (!tree) return;
    const fileNodes = nodes.filter(n => n.type === 'file');
    if (fileNodes.length === 0) return;
    if (!fileNodes.every(n => n.width != null && n.width > 0)) return;

    layoutPhaseRef.current = 2;
    const sizeMap = new Map(fileNodes.map(n => [n.id, { w: n.width, h: n.height }]));
    setNodes(buildNodesFromTree(tree, sizeMap));
  }, [nodes, setNodes]);

  // After branch checkout with no snapshot, rebuild the canvas from the file tree on disk
  useEffect(() => {
    if (!vcs.pendingTreeRefresh || !rootPath || !window.electronAPI) return;
    vcs.clearPendingTreeRefresh();
    window.electronAPI.readTree(rootPath).then(tree => {
      if (!tree) return;
      setFileTree(tree);
      treeRef.current = tree;
      layoutPhaseRef.current = 1;
      setNodes(buildNodesFromTree(tree));
    });
  }, [vcs.pendingTreeRefresh, rootPath, setNodes]);

  const reorganizeLayout = useCallback(() => {
    const tree = treeRef.current;
    if (!tree) return;
    layoutPhaseRef.current = 1;
    setNodes(buildNodesFromTree(tree));
  }, [setNodes]);

  const openRootFolder = useCallback(() => {
    if (!window.electronAPI) return;
    nodesRef.current.forEach(n => {
      if (n.type === 'file' && n.data.filePath) window.electronAPI.unwatchFile(n.data.filePath);
    });
    window.electronAPI.openDirPicker().then(async dirPath => {
      if (!dirPath) return;
      setRootPath(dirPath);

      let roomCode = await window.electronAPI.graphiteInitRoom(dirPath);
      if (!roomCode) {
        roomCode = generateRoomCode();
        await window.electronAPI.graphiteSaveRoom(dirPath, roomCode);
      }

      const config = await window.electronAPI.graphiteReadConfig(dirPath);
      const { persist } = initRoom(dirPath, roomCode, config.signalingUrl ?? null);
      clearAllDeps();
      vcs.init(dirPath);

      const tree = await window.electronAPI.readTree(dirPath);
      if (!tree) return;
      setFileTree(tree);
      treeRef.current = tree;

      await persist.whenSynced;
      if (getYNodes().size === 0) {
        layoutPhaseRef.current = 1;
        setNodes(buildNodesFromTree(tree));
      }
    });
  }, [setNodes]);

  const addScriptNode = useCallback(() => {
    const id = `script_${Date.now()}`;
    setNodes(nds => [...nds, mkScriptNode(id, { x: 200, y: 200 })]);
  }, [setNodes]);

  // Prompt the user for a name then create the node + file/dir on disk
  function promptName(kind) {
    return new Promise(resolve => {
      setNamePromptValue('');
      setNamePrompt({ kind, resolve });
    });
  }

  const addRegionNode = useCallback(async () => {
    const name = await promptName('region');
    if (!name) return;
    const id = `region_${Date.now()}`;
    const dirPath = rootPath ? `${rootPath}/${name}` : null;
    if (dirPath && window.electronAPI) await window.electronAPI.createDir(dirPath).catch(() => {});
    setNodes(nds => [...nds, mkRegion(id, name, { x: 200, y: 200 }, dirPath)]);
  }, [rootPath, setNodes]);

  const addFileNode = useCallback(async () => {
    const name = await promptName('file');
    if (!name) return;
    const id = `file_${Date.now()}`;
    const filePath = rootPath ? `${rootPath}/${name}` : null;
    if (filePath && window.electronAPI) await window.electronAPI.createFile(filePath).catch(() => {});
    setNodes(nds => [...nds, mkFileNode(id, { x: 200, y: 200 }, filePath ? { filePath } : {})]);
  }, [rootPath, setNodes]);

  const handleNodesChange = useCallback((changes) => {
    const expandedId = expandedNodeIdRef.current;
    const shrinkingId = shrinkingNodeIdRef.current;
    const filtered = changes.filter(c =>
      !(c.type === 'dimensions' && (
        (expandedId  && c.id === expandedId) ||
        (shrinkingId && c.id === shrinkingId)
      ))
    );

    // Feature 3: when a region moves, apply the same delta to all its children
    const extraChanges = [];
    const nds = nodesRef.current;
    for (const c of filtered) {
      if (c.type !== 'position' || !c.position) continue;
      const node = nds.find(n => n.id === c.id);
      if (node?.type !== 'region') continue;
      const dx = c.position.x - node.position.x;
      const dy = c.position.y - node.position.y;
      if (dx === 0 && dy === 0) continue;
      // Collect all descendants recursively
      const toMove = [];
      const stack = [...(node.data?.children ?? [])];
      const visited = new Set();
      while (stack.length) {
        const cid = stack.pop();
        if (visited.has(cid)) continue;
        visited.add(cid);
        const child = nds.find(n => n.id === cid);
        if (!child) continue;
        toMove.push(child);
        if (child.type === 'region') stack.push(...(child.data?.children ?? []));
      }
      for (const child of toMove) {
        extraChanges.push({
          type: 'position',
          id: child.id,
          position: { x: child.position.x + dx, y: child.position.y + dy },
          dragging: c.dragging,
        });
      }
    }

    filtered.forEach(c => {
      if (c.type === 'remove') {
        const node = nds.find(n => n.id === c.id);
        if (node?.type === 'file' && node.data.filePath && window.electronAPI) {
          window.electronAPI.unwatchFile(node.data.filePath);
        }
      }
    });
    onNodesChange([...filtered, ...extraChanges]);

    clearTimeout(metaTimer.current);
    metaTimer.current = setTimeout(() => {
      const nds = nodesRef.current;
      const bounds = computeAllRegionBounds(nds);
      nds.filter(n => n.type === 'region' && n.data?.dirPath).forEach(region => {
        const childIds = region.data?.children ?? [];
        const b = bounds.get(region.id);
        const metadata = {
          version: 1,
          regionId: region.id,
          dirPath: region.data.dirPath,
          position: b?.position,
          width: b?.width,
          height: b?.height,
          nodes: childIds.map(cid => {
            const n = nds.find(nd => nd.id === cid);
            if (!n) return null;
            const nb = n.type === 'region' ? bounds.get(cid) : null;
            return {
              id: cid,
              x: nb ? nb.position.x : n.position.x,
              y: nb ? nb.position.y : n.position.y,
            };
          }).filter(Boolean),
        };
        if (rootPath && region.data.dirPath) window.electronAPI?.writeMetadata(rootPath, region.data.dirPath, metadata);
      });
    }, 800);
  }, [onNodesChange]);

  // ---- Render ----

  const visibleNodes = nodes.filter(n => !isHiddenByCollapse(n.id));

  const regionBounds = computeAllRegionBounds(nodes);
  regionBoundsRef.current = regionBounds;

  // Dragging and hover both trigger magnification; only hover spreads positions.
  const hoverActiveId = hoveredNodeId ?? draggingNodeId;
  const activeId = focusedNodeId ?? hoverActiveId;
  const magnifiedIds = new Set();
  if (activeId) {
    magnifiedIds.add(activeId);
    const queue = [activeId];
    while (queue.length > 0) {
      const id = queue.shift();
      for (const cid of nodeById.get(id)?.data?.children ?? []) {
        magnifiedIds.add(cid);
        queue.push(cid);
      }
    }
  }

  const scaledPositions = new Map();
  if (!focusedNodeId && hoveredNodeId && !draggingNodeId && magnifiedIds.size > 0) {
    const leaves = visibleNodes.filter(n => magnifiedIds.has(n.id) && n.type !== 'region');
    if (leaves.length > 0) {
      const cx = leaves.reduce((s, n) => s + n.position.x + (n.width ?? T_FW) / 2, 0) / leaves.length;
      const cy = leaves.reduce((s, n) => s + n.position.y + (n.height ?? T_FH) / 2, 0) / leaves.length;
      for (const n of leaves) {
        const nw = n.width ?? T_FW;
        const nh = n.height ?? T_FH;
        scaledPositions.set(n.id, {
          x: cx + (n.position.x + nw / 2 - cx) * hoverScale - nw / 2,
          y: cy + (n.position.y + nh / 2 - cy) * hoverScale - nh / 2,
        });
      }
    }
  }

  const activeRegionBounds = scaledPositions.size > 0
    ? computeAllRegionBounds(nodes.map(n => { const sp = scaledPositions.get(n.id); return sp ? { ...n, position: sp } : n; }))
    : regionBounds;

  const diffEdges = [];

  // Dependency edges derived from depGraph (depTick triggers recompute on change)
  void depTick;
  const fileNodeMap = new Map();
  nodes.forEach(n => {
    if (n.type !== 'file' || !n.data?.filePath) return;
    const uri = 'file://' + n.data.filePath;
    fileNodeMap.set(uri, n.id);
    const noExt = uri.replace(/\.[^/.]+$/, '');
    if (noExt !== uri) fileNodeMap.set(noExt, n.id);
  });
  const depEdges = [];
  getAllDeps().forEach((depSet, srcUri) => {
    const srcId = fileNodeMap.get(srcUri);
    if (!srcId) return;
    depSet.forEach(depUri => {
      const tgtId = fileNodeMap.get(depUri);
      if (!tgtId || tgtId === srcId) return;
      const refCount  = getRefCount(srcUri, depUri);
      const heatWidth   = Math.min(1 + refCount * 0.35, 5);
      const heatOpacity = Math.min(0.3 + refCount * 0.07, 0.9);
      const heatColor   = refCount > 10 ? '#f97316'
                        : refCount > 5  ? '#fbbf24'
                        : '#4a5568';
      depEdges.push({
        id: `dep:${srcId}:${tgtId}`,
        source: srcId, target: tgtId,
        type: 'default',
        style: { stroke: heatColor, strokeWidth: heatWidth, strokeDasharray: '4 3', opacity: heatOpacity },
        markerEnd: { type: MarkerType.Arrow, color: heatColor, width: 8, height: 8 },
        label: refCount > 0 ? String(refCount) : undefined,
        labelStyle: { fontSize: 9, fill: heatColor, fontFamily: 'var(--mono)' },
        labelBgStyle: { fill: 'var(--bg)', fillOpacity: 0.8 },
        animated: false, selectable: false, focusable: false,
      });
    });
  });


  // Peer cursor windows — peers editing files in my dependency graph
  const localPeer = peers.find(p => p.isLocal);
  const localUri  = localPeer?.filePath ? 'file://' + localPeer.filePath : null;
  const localDeps = localUri ? getAllDeps().get(localUri) ?? new Set() : new Set();
  const relevantPeers = peers.filter(p => {
    if (p.isLocal || !p.filePath || dismissedPeers.has(p.id)) return false;
    const peerUri = 'file://' + p.filePath;
    return localDeps.has(peerUri) || (localUri && (getAllDeps().get(peerUri)?.has(localUri) ?? false));
  });

  const nodesWithCallbacks = visibleNodes.map(node => {
    const isMagnified = magnifiedIds.has(node.id);
    const isRegion = node.type === 'region';
    const isExpanded = node.id === expandedNodeId;

    const bounds = isRegion
      ? (isMagnified ? activeRegionBounds.get(node.id) : regionBounds.get(node.id)) ?? regionBounds.get(node.id)
      : null;
    const position = isRegion
      ? (bounds?.position ?? node.position)
      : (scaledPositions.get(node.id) ?? node.position);

    // Expand style is local — never stored in Yjs
    const style = isExpanded
      ? expandedDims
      : bounds
        ? { ...node.style, width: bounds.width, height: bounds.height }
        : node.style;

    return {
      ...node,
      position,
      style,
      draggable: isRegion ? ctrlHeld : true,
      className: isMagnified ? (focusedNodeId ? 'node-state-focused' : 'node-state-hovered') : '',
      zIndex: isRegion ? 0 : 10 + (accessStack.indexOf(node.id) + 1),
      data: {
        ...node.data,
        ...(node.type === 'chaperonin' ? { onChangeParam } : {}),
        ...(isRegion                   ? { onToggleCollapse: toggleRegionCollapse, onLinkDir, isCtrlDragTarget: ctrlDragOver === node.id } : {}),
        ...(node.type === 'file'       ? {
          onContentChange, onFilePicked, rootPath, hasGit: vcs.hasGit, onEditorFocus, onEditorBlur,
          expanded: isExpanded,
          peerColors: peers.filter(p => !p.isLocal && p.focusedNode === node.id).map(p => p.color),
          blameInfo: vcs.blameMap[node.id] ?? null,
          onAskAgent: (filePath) => { setAgentScopedFile(filePath); setShowAgent(true); },
          onSymbolDetach: (sym) => {
            const newId = `sym-${sym.name}-${Date.now()}`;
            const pos = { x: node.position.x + (node.width ?? 300) + 30, y: node.position.y };
            setNodes(prev => [...prev, mkSymbolCard(newId, pos, { ...sym, symbolName: sym.name, symbolKind: sym.kind, filePath: node.data.filePath })]);
          },
        } : {}),
      },
    };
  });

  // Diff overlay injection
  const { diffMode } = vcs;
  if (diffMode) {
    const { diffById, baseOpacity } = diffMode;

    // Dim unchanged current nodes — opacity driven by slider so it always responds
    const unchangedOpacity = Math.max(0.15, 1 - baseOpacity * 0.85);
    for (const n of nodesWithCallbacks) {
      if (!diffById.has(n.id)) {
        n.className = ((n.className ?? '') + ' diff-unchanged').trim();
        n.style = { ...(n.style ?? {}), opacity: unchangedOpacity };
      } else {
        const d = diffById.get(n.id);
        if (d.type === 'added')    n.className = ((n.className ?? '') + ' diff-added').trim();
        if (d.type === 'modified') n.className = ((n.className ?? '') + ' diff-modified').trim();
        if (d.type === 'moved')    n.className = ((n.className ?? '') + ' diff-moved').trim();
      }
    }

    // Inject base-layer ghost nodes for removed or moved-from positions
    for (const [id, d] of diffById) {
      if (d.type === 'removed' || d.type === 'moved') {
        const ghostPos = d.type === 'moved' ? d.prevPosition : d.node.position;
        nodesWithCallbacks.push({
          id: 'base:' + id,
          type: 'diff-ghost',
          position: ghostPos,
          style: {
            width:         d.node.width  ?? 380,
            height:        d.node.height ?? 180,
            pointerEvents: 'none',
            opacity:       baseOpacity,
          },
          selectable: false,
          draggable:  false,
          zIndex:     4,
          data: {
            diffType:  d.type,
            nodeType:  d.node.type,
            label:     d.node.data?.filePath ?? d.node.data?.label ?? d.node.id,
            arrowTo:   d.type === 'moved' ? d.node.position : null,
          },
        });

        // Movement arrow
        if (d.type === 'moved') {
          diffEdges.push({
            id: 'diff-arrow:' + id,
            source: 'base:' + id,
            target: id,
            type: 'default',
            style: { stroke: 'var(--amber, #fbbf24)', strokeWidth: 1.5, strokeDasharray: '5 3', opacity: 0.55 },
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--amber, #fbbf24)' },
            animated: false,
          });
        }
      }
    }
  }

  // Merge overlay ghost injection
  const { mergeMode } = vcs;
  if (mergeMode) {
    const { conflicts, theirAdded, resolutions } = mergeMode;
    const onAcceptMergeNode = vcs.acceptMergeNode;

    for (const [id, { theirs }] of conflicts) {
      if (resolutions.has(id)) continue;
      nodesWithCallbacks.push({
        id: 'merge:' + id,
        type: 'merge-ghost',
        position: theirs.position ?? { x: 0, y: 0 },
        style: {
          width: theirs.width ?? 280,
          height: theirs.height ?? 160,
          zIndex: 20,
        },
        draggable: false,
        selectable: false,
        data: {
          mergeType: 'conflict',
          nodeId: id,
          nodeType: theirs.type,
          label: theirs.data?.filePath ?? theirs.data?.label ?? id,
          onAcceptMergeNode,
        },
      });
    }

    for (const theirNode of theirAdded) {
      if (resolutions.has(theirNode.id)) continue;
      nodesWithCallbacks.push({
        id: 'merge:' + theirNode.id,
        type: 'merge-ghost',
        position: theirNode.position ?? { x: 0, y: 0 },
        style: {
          width: theirNode.width ?? 280,
          height: theirNode.height ?? 160,
          zIndex: 20,
        },
        draggable: false,
        selectable: false,
        data: {
          mergeType: 'added',
          nodeId: theirNode.id,
          nodeType: theirNode.type,
          label: theirNode.data?.filePath ?? theirNode.data?.label ?? theirNode.id,
          onAcceptMergeNode,
        },
      });
    }
  }

  return (
    <PrefsContext.Provider value={{ theme, regionAlpha, hoverScale, dimScale, hoverDelay, focusZoom, watchdogEnabled, watchdogModel }}>
    <div className="ide-shell">
      <div className="ide-titlebar">
        {/* Logo */}
        <div className="titlebar-logo">
          <div className="titlebar-logo-mark" />
          <span className="titlebar-logo-name">graphite</span>
        </div>

        <div className="titlebar-sep" />

        <button className="titlebar-btn" onClick={openRootFolder}>open</button>
        {fileTree && <button className="titlebar-btn" onClick={reorganizeLayout} title="Re-run auto layout">reorganize</button>}

        <div className="titlebar-sep" />

        <button className="titlebar-btn" onClick={addFileNode}>file</button>
        <button className="titlebar-btn" onClick={addRegionNode}>region</button>

        <div className="titlebar-sep" />

        <button className="titlebar-btn" onClick={() => setShowPrefs(true)}>prefs</button>

        {rootPath && <span className="titlebar-path">{rootPath}</span>}

        <div className="titlebar-spacer" />

        {/* Peer cluster */}
        {peers.filter(p => !p.isLocal).length > 0 && (
          <div className="titlebar-peers">
            {peers.filter(p => !p.isLocal).slice(0, 4).map(p => (
              <div
                key={p.id}
                className="titlebar-peer-dot"
                style={{ background: p.color }}
                title={p.focusedNode ? `${p.name} — click to follow` : p.name}
                onClick={() => {
                  if (!p.focusedNode) return;
                  const node = nodesRef.current.find(n => n.id === p.focusedNode);
                  if (!node) return;
                  const { width: cw, height: ch } = document.querySelector('.ide-canvas')?.getBoundingClientRect()
                    ?? { width: window.innerWidth, height: window.innerHeight };
                  const zoom = focusZoomRef.current / 100;
                  const nw = node.width ?? 380;
                  const nh = node.height ?? 355;
                  centerViewport(setViewportRef.current, node.position.x + nw / 2, node.position.y + nh / 2, zoom, cw, ch);
                }}
              >
                {p.name.slice(0, 2).toUpperCase()}
              </div>
            ))}
          </div>
        )}

        {/* Agent button */}
        <button
          className={`titlebar-sync-btn${showAgent ? ' is-active' : ''}`}
          onClick={() => { setAgentScopedFile(null); setShowAgent(s => !s); }}
        >
          ✦ agent
        </button>

        {/* Session button */}
        <button
          className={`titlebar-sync-btn${peers.length > 1 ? ' is-active' : ''}`}
          onClick={() => setShowSession(s => !s)}
        >
          <div className={`sync-dot${peers.length > 1 ? ' is-live' : ''}`} />
          {peers.length > 1 ? `sync · ${peers.length - 1}` : 'sync'}
        </button>

        {/* Layout profiles button */}
        {rootPath && (
          <div style={{ position: 'relative' }}>
            <button
              className={`titlebar-sync-btn${showLayouts ? ' is-active' : ''}`}
              onClick={() => setShowLayouts(s => !s)}
            >
              layouts
            </button>
            {showLayouts && (
              <div className="layout-panel">
                <div className="layout-panel-title">Layout profiles</div>
                {layoutProfiles.length === 0 && (
                  <div className="layout-panel-empty">No saved layouts</div>
                )}
                {layoutProfiles.map(name => (
                  <div key={name} className="layout-panel-row">
                    <button className="layout-panel-load" onClick={() => loadLayout(name)}>{name}</button>
                    <button className="layout-panel-delete" onClick={() => deleteLayout(name)}>×</button>
                  </div>
                ))}
                <div className="layout-panel-save-row">
                  <input
                    className="layout-panel-input"
                    placeholder="profile name…"
                    value={layoutNameInput}
                    onChange={e => setLayoutNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveLayout(layoutNameInput); }}
                  />
                  <button
                    className="session-btn session-btn--primary"
                    disabled={!layoutNameInput.trim()}
                    onClick={() => saveLayout(layoutNameInput)}
                  >
                    save
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Sidebar tree={fileTree} rootPath={rootPath} onFocusNode={focusNode} />

      <BranchBar
        hasGit={vcs.hasGit}
        branches={vcs.branches}
        currentBranch={vcs.currentBranch}
        isDirty={vcs.isDirty}
        gitLog={vcs.gitLog}
        mergeMode={vcs.mergeMode}
        onCommit={vcs.commit}
        onCreateBranch={vcs.createBranch}
        onCheckout={vcs.checkout}
        onShowDiff={vcs.showDiff}
        onStartMerge={vcs.startMerge}
      />

      <div className="ide-canvas" data-anim={vcs.canvasAnim ?? undefined}>
        <ReactFlow
          nodes={nodesWithCallbacks}
          edges={[...diffEdges, ...depEdges]}
          onNodesChange={handleNodesChange}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          deleteKeyCode={editMode ? null : ['Delete', 'Backspace']}
          panActivationKeyCode={editMode ? null : ' '}
          panOnDrag={!focusedNodeId}
          panOnScroll={!focusedNodeId}
          zoomOnScroll={!focusedNodeId}
          zoomOnPinch={!focusedNodeId}
          zoomOnDoubleClick={!focusedNodeId}
          proOptions={{ hideAttribution: true }}
          onNodeMouseEnter={(_, node) => {
            if (node.type === 'region') return;
            clearTimeout(hoverTimer.current);
            hoverTimer.current = setTimeout(() => {
              setHoveredNodeId(node.id);
              markAccessed(node.id);
            }, hoverDelay);
          }}
          onNodeClick={async (_, node) => {
            if (!vcs.diffMode || !rootPath || !window.electronAPI) return;
            const d = vcs.diffMode.diffById.get(node.id);
            if (d?.type !== 'modified') return;
            const filePath = node.data?.filePath;
            if (!filePath) return;
            const oldText = await window.electronAPI.vcsFileAtCommit(rootPath, filePath, vcs.diffMode.fromHash);
            const newText = getYText(filePath).toString();
            setContentDiff({ filePath, oldText: oldText ?? '', newText });
          }}
          onNodeDragStart={(event, node) => {
            setDraggingNodeId(node.id);
            markAccessed(node.id);
            // Ctrl+drag: immediately detach the node from its current region
            if (event.ctrlKey && node.type === 'file') {
              const parentId = childParentMap.get(node.id);
              if (parentId) {
                setNodes(nds => nds.map(n =>
                  n.id === parentId
                    ? { ...n, data: { ...n.data, children: n.data.children.filter(c => c !== node.id) } }
                    : n
                ));
              }
            }
          }}
          onNodeDrag={(event, node) => {
            if (!event.ctrlKey || node.type !== 'file') {
              if (ctrlDragOver) setCtrlDragOver(null);
              return;
            }
            const cx = node.position.x + (node.width ?? 280) / 2;
            const cy = node.position.y + (node.height ?? 160) / 2;
            let hit = null;
            for (const [rid, b] of regionBoundsRef.current) {
              if (!b) continue;
              if (cx >= b.position.x && cx <= b.position.x + b.width &&
                  cy >= b.position.y && cy <= b.position.y + b.height) {
                hit = rid;
                break;
              }
            }
            if (hit !== ctrlDragOver) setCtrlDragOver(hit);
          }}
          onNodeDragStop={(event, node) => {
            setDraggingNodeId(null);
            if (!event.ctrlKey || node.type !== 'file' || !ctrlDragOver) {
              setCtrlDragOver(null);
              return;
            }
            const destRegion = nodesRef.current.find(n => n.id === ctrlDragOver);
            setCtrlDragOver(null);
            if (!destRegion) return;
            // Attach node to dest region and move file if region has a dirPath
            const srcPath = node.data?.filePath;
            const doMove = !!(srcPath && destRegion.data?.dirPath);
            const destPath = doMove ? `${destRegion.data.dirPath}/${srcPath.split('/').pop()}` : null;
            const applyAttach = () => {
              // Migrate Y.Text content from old path to new path before the node
              // filePath changes, so Monaco binds to a populated Y.Text not an empty one.
              if (doMove && srcPath !== destPath) {
                const oldYText = getYText(srcPath);
                const newYText = getYText(destPath);
                const content = oldYText.toString();
                getDoc().transact(() => {
                  newYText.delete(0, newYText.length);
                  newYText.insert(0, content);
                });
              }
              setNodes(nds => nds.map(n => {
                if (n.id === destRegion.id)
                  return { ...n, data: { ...n.data, children: [...new Set([...(n.data.children ?? []), node.id])] } };
                if (doMove && n.id === node.id)
                  return { ...n, data: { ...n.data, filePath: destPath } };
                return n;
              }));
            };
            if (doMove && srcPath !== destPath) {
              window.electronAPI?.moveFile(srcPath, destPath).then(applyAttach).catch(err => console.error('[move file]', err));
            } else {
              applyAttach();
            }
          }}
          onNodeMouseLeave={() => { clearTimeout(hoverTimer.current); setHoveredNodeId(null); }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1a2235" />
          <Controls />
          <DiffPanel
            diffMode={vcs.diffMode}
            onExit={vcs.exitDiff}
            onOpacityChange={vcs.setDiffOpacity}
          />
          <MergePanel
            mergeMode={vcs.mergeMode}
            onFinalize={() => vcs.finalizeMerge()}
            onAbort={vcs.abortMerge}
          />
          <MiniMap
            nodeColor={n => {
              if (n.type === 'region') return '#1e2535';
              if (n.type === 'file') return '#3b82f6';
              const cat = n.data?.module?.category;
              return cat ? (CATEGORIES[cat]?.color || '#334155') : '#334155';
            }}
            maskColor="rgba(13,17,23,0.75)"
          />
        </ReactFlow>
      </div>

      <StatusBar rootPath={rootPath} nodeCount={nodes.length} peers={peers} />

      <AgentPanel
        open={showAgent}
        onClose={() => setShowAgent(false)}
        rootPath={rootPath}
        scopedFilePath={agentScopedFile}
      />

      {contentDiff && (
        <div className="content-diff-overlay" onClick={() => setContentDiff(null)}>
          <div className="content-diff-panel" onClick={e => e.stopPropagation()}>
            <div className="content-diff-header">
              <span className="content-diff-title">{contentDiff.filePath.split('/').pop()}</span>
              <span className="content-diff-subtitle">{vcs.diffMode?.fromHash?.slice(0,7)} → now</span>
              <button className="session-close" onClick={() => setContentDiff(null)}>×</button>
            </div>
            <div className="content-diff-body">
              <UnifiedDiff oldText={contentDiff.oldText} newText={contentDiff.newText} />
            </div>
          </div>
        </div>
      )}

      {namePrompt && (
        <div className="content-diff-overlay" onClick={() => { namePrompt.resolve(null); setNamePrompt(null); }}>
          <div className="name-prompt-panel" onClick={e => e.stopPropagation()}>
            <div className="name-prompt-title">
              {namePrompt.kind === 'file' ? 'New file' : 'New region'}
            </div>
            <input
              className="name-prompt-input"
              placeholder={namePrompt.kind === 'file' ? 'filename.js' : 'directory-name'}
              value={namePromptValue}
              onChange={e => setNamePromptValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && namePromptValue.trim()) {
                  namePrompt.resolve(namePromptValue.trim());
                  setNamePrompt(null);
                } else if (e.key === 'Escape') {
                  namePrompt.resolve(null);
                  setNamePrompt(null);
                }
              }}
              autoFocus
            />
            <div className="name-prompt-actions">
              <button className="session-btn session-btn--primary"
                disabled={!namePromptValue.trim()}
                onClick={() => { namePrompt.resolve(namePromptValue.trim()); setNamePrompt(null); }}>
                create
              </button>
              <button className="session-btn"
                onClick={() => { namePrompt.resolve(null); setNamePrompt(null); }}>
                cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <SessionPanel
        open={showSession}
        onClose={() => setShowSession(false)}
        rootPath={rootPath}
      />

      {depEdges.length > 0 && (
        <div className="dep-heat-legend">
          <span className="dep-heat-legend-item" style={{ opacity: 0.35 }}>──</span>
          <span className="dep-heat-legend-item" style={{ color: '#fbbf24' }}>──</span>
          <span className="dep-heat-legend-item" style={{ color: '#f97316' }}>──</span>
          <span className="dep-heat-legend-label">import coupling</span>
        </div>
      )}

      {relevantPeers.map(peer => (
        <PeerCursorWindow
          key={peer.id}
          peer={peer}
          onClose={() => setDismissedPeers(s => new Set([...s, peer.id]))}
        />
      ))}

      <PrefsPopup
        open={showPrefs}
        onClose={() => setShowPrefs(false)}
        theme={theme}        onTheme={setTheme}
        regionAlpha={regionAlpha} onAlpha={setRegionAlpha}
        hoverScale={hoverScale}   onHoverScale={setHoverScale}
        dimScale={dimScale}       onDimScale={setDimScale}
        hoverDelay={hoverDelay}   onHoverDelay={setHoverDelay}
        focusZoom={focusZoom}     onFocusZoom={setFocusZoom}
        watchdogEnabled={watchdogEnabled} onWatchdogEnabled={setWatchdogEnabled}
        watchdogModel={watchdogModel}     onWatchdogModel={setWatchdogModel}
      />
    </div>
    </PrefsContext.Provider>
  );
}
