export const CATEGORIES = {
  scripting:     { label: 'Scripting',     color: '#8b5cf6' },
};

export const TYPE_COLORS = {
  'Text.Code':       '#8b5cf6',
};

export const MODULES = {
  SCRIPT: {
    id: 'SCRIPT',
    label: 'Script Editor',
    category: 'scripting',
    resources: { gpu: 0, memory_gb: 0 },
    retention: 'standard',
    inputs: [],
    params: [{ id: 'code', type: 'Text.Code', default: 'print("Hello, World!")\n' }],
    outputs: [],
  },
};

