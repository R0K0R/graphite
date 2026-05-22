import { useCallback } from 'react';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from 'reactflow';

import ChaperonNode from './components/ChaperonNode.jsx';
import { MODULES, CATEGORIES, TYPE_COLORS, isCompatible } from './data/modules.js';

const NODE_TYPES = { chaperonin: ChaperonNode };

function mkEdge(source, sourceHandle, target, targetHandle, type) {
  const color = TYPE_COLORS[type] || '#6b7280';
  return {
    id: `${source}.${sourceHandle}->${target}.${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
    style: { stroke: color, strokeWidth: 2 },
    label: type,
    labelStyle: { fontSize: 9, fontFamily: 'monospace', fill: color, fontWeight: 600 },
    labelBgStyle: { fill: '#0d1117', fillOpacity: 0.88 },
    labelBgPadding: [4, 7],
    labelBgBorderRadius: 3,
    data: { sourceType: type, compatible: true },
  };
}

function mkNode(id, moduleId, position) {
  const mod = MODULES[moduleId];
  const defaultParams = Object.fromEntries(mod.params.map((p) => [p.id, p.default]));
  return {
    id,
    type: 'chaperonin',
    position,
    data: { module: mod, varName: id, params: defaultParams, status: 'idle', progress: null },
  };
}

const INIT_NODES = [
  mkNode('rosetta_relax_1', 'ROSETTA_RELAX', { x: 120, y: 80 }),
  mkNode('pymol_1', 'PYMOL', { x: 120, y: 300 }),
];

const INIT_EDGES = [
  mkEdge('rosetta_relax_1', 'relaxed', 'pymol_1', 'structure', 'Structure.PDB'),
];

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(INIT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INIT_EDGES);

  const onConnect = useCallback(
    (params) => {
      const srcNode = nodes.find((n) => n.id === params.source);
      const tgtNode = nodes.find((n) => n.id === params.target);
      if (!srcNode || !tgtNode) return;

      const srcType = srcNode.data.module?.outputs?.find((o) => o.id === params.sourceHandle)?.type;
      const tgtType = tgtNode.data.module?.inputs?.find((i) => i.id === params.targetHandle)?.type;
      const compatible = tgtType ? isCompatible(srcType, tgtType) : true;
      const color = TYPE_COLORS[srcType] || '#6b7280';

      const newEdge = {
        id: `${params.source}.${params.sourceHandle}->${params.target}.${params.targetHandle}`,
        ...params,
        style: {
          stroke: compatible ? color : '#ef4444',
          strokeWidth: 2,
          strokeDasharray: compatible ? undefined : '5 3',
        },
        label: srcType || '',
        labelStyle: {
          fontSize: 9,
          fontFamily: 'monospace',
          fill: compatible ? color : '#ef4444',
          fontWeight: 600,
        },
        labelBgStyle: { fill: '#0d1117', fillOpacity: 0.88 },
        labelBgPadding: [4, 7],
        labelBgBorderRadius: 3,
        data: { sourceType: srcType, targetType: tgtType, compatible },
      };

      setEdges((eds) => {
        const filtered = eds.filter(
          (e) => !(e.target === params.target && e.targetHandle === params.targetHandle)
        );
        return addEdge(newEdge, filtered);
      });

      setNodes((nds) =>
        nds.map((n) => {
          if (n.type !== 'chaperonin') return n;
          const missingInputs = n.data.module.inputs
            .filter((inp) => !edges.find((e) => e.target === n.id && e.targetHandle === inp.id))
            .map((inp) => inp.id);
          return { ...n, data: { ...n.data, missingInputs, typeErrInputs: [] } };
        })
      );
    },
    [nodes, edges, setEdges, setNodes]
  );

  return (
    <div className="canvas-app">
      <div className="canvas-wrapper">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          deleteKeyCode={['Delete', 'Backspace']}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e2535" />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const cat = n.data?.module?.category;
              return cat ? (CATEGORIES[cat]?.color || '#334155') : '#334155';
            }}
            maskColor="rgba(13,17,23,0.75)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
