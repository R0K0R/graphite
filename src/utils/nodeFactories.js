import { MODULES } from '../data/modules.js';

export function mkScriptNode(id, position) {
  const mod = MODULES['SCRIPT'];
  const defaultParams = Object.fromEntries(mod.params.map(p => [p.id, p.default]));
  return {
    id, type: 'chaperonin', position,
    data: { module: mod, varName: id, params: defaultParams, status: 'idle', progress: null },
  };
}

export function mkRegion(id, label, position, dirPath = null) {
  return {
    id, type: 'region', position,
    style: { width: 300, height: 200 },
    data: { label, dirPath, children: [] },
  };
}

export function mkFileNode(id, position, extra = {}) {
  return {
    id, type: 'file', position,
    data: { filePath: null, content: '', externalChange: false, ...extra },
  };
}
