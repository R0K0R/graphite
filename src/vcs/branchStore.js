// Deterministic room code derivation and vcs.json I/O.
// Room codes are stable: same rootPath + branchName always gives the same code
// so switching branches and back restores the exact same Yjs IDB database.

async function sha1hex(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function roomCodeForBranch(rootPath, branchName) {
  const hash = await sha1hex(rootPath + ':' + branchName);
  return 'branch:' + hash.slice(0, 8);
}

// --- vcs.json helpers (all I/O goes through electronAPI) ---

function vcsPath(rootPath) {
  return rootPath + '/.graphite/vcs.json';
}

export async function readVcsJson(rootPath) {
  try {
    const raw = await window.electronAPI.readFile(vcsPath(rootPath));
    return JSON.parse(raw);
  } catch (_) {
    return { version: 1, branches: {} };
  }
}

export async function writeVcsJson(rootPath, data) {
  await window.electronAPI.writeFile(vcsPath(rootPath), JSON.stringify(data, null, 2));
}

export async function setBranchMeta(rootPath, branchName, meta) {
  const vcs = await readVcsJson(rootPath);
  vcs.branches[branchName] = { ...(vcs.branches[branchName] ?? {}), ...meta };
  await writeVcsJson(rootPath, vcs);
}

export async function getBranchMeta(rootPath, branchName) {
  const vcs = await readVcsJson(rootPath);
  return vcs.branches[branchName] ?? null;
}
