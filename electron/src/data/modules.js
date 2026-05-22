export const CATEGORIES = {
  refinement:    { label: 'Refinement',    color: '#10b981' },
  visualization: { label: 'Visualization', color: '#f59e0b' },
};

export const TYPE_COLORS = {
  'Structure':       '#22c55e',
  'Structure.PDB':   '#16a34a',
  'Visual':          '#ec4899',
  'Visual.PNG':      '#db2777',
  'Text':            '#94a3b8',
  'Text.Score':      '#a3e635',
};

export function isCompatible(outputType, inputType) {
  if (!outputType || !inputType) return false;
  if (outputType === inputType) return true;
  if (inputType.includes('|')) {
    return inputType.split('|').some((t) => isCompatible(outputType, t.trim()));
  }
  if (outputType.startsWith(inputType + '.')) return true;
  return false;
}

export const MODULES = {
  ROSETTA_RELAX: {
    id: 'ROSETTA_RELAX',
    label: 'Rosetta Relax',
    category: 'refinement',
    resources: { gpu: 0, memory_gb: 8 },
    retention: 'standard',
    inputs: [{ id: 'structure', type: 'Structure.PDB' }],
    params: [{ id: 'nstruct', type: 'Text.Integer', default: 1 }],
    outputs: [
      { id: 'relaxed', type: 'Structure.PDB' },
      { id: 'score', type: 'Text.Score' },
    ],
  },
  PYMOL: {
    id: 'PYMOL',
    label: 'PyMOL',
    category: 'visualization',
    resources: { gpu: 0, memory_gb: 4 },
    retention: 'ephemeral',
    inputs: [{ id: 'structure', type: 'Structure.PDB' }],
    params: [{ id: 'style', type: 'Text.RawString', default: 'cartoon' }],
    outputs: [
      { id: 'rendered', type: 'Visual.PNG' },
      { id: 'scene', type: 'Structure.PDB' },
    ],
  },
};

export function handleLeft(index, total) {
  return `${((index + 0.5) / total) * 100}%`;
}
