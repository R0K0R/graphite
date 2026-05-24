import { MODULES } from '../data/modules.js';

export function mkScriptNode(id, position) {
  const mod = MODULES['SCRIPT'];
  const defaultParams = Object.fromEntries(mod.params.map(p => [p.id, p.default]));
  return {
    id, type: 'chaperonin', position,
    data: { module: mod, varName: id, params: defaultParams, status: 'idle', progress: null },
  };
}

export function mkRegion(id, label, position) {
  return {
    id, type: 'region', position,
    draggable: false,
    style: { width: 300, height: 200 },
    data: { label, dirPath: null, children: [] },
  };
}

export function mkFileNode(id, position) {
  return {
    id, type: 'file', position,
    data: { filePath: null, content: '', externalChange: false },
  };
}
