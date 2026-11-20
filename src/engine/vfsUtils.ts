import { VmState, VfsNode } from '../types/rhel';

export function normalizePath(rawPath: string, cwd: string, home: string): string {
  let path = rawPath.trim();
  if (!path) return cwd;
  if (path === '~') {
    path = home;
  } else if (path.startsWith('~/')) {
    path = `${home}/${path.slice(2)}`;
  }

  const combined = path.startsWith('/') ? path : `${cwd === '/' ? '' : cwd}/${path}`;
  const parts = combined.split('/');
  const resolved: string[] = [];

  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  return '/' + resolved.join('/');
}

export function splitParentChild(absPath: string): { parent: string; name: string } {
  if (absPath === '/') return { parent: '/', name: '' };
  const idx = absPath.lastIndexOf('/');
  const parent = idx === 0 ? '/' : absPath.slice(0, idx);
  const name = absPath.slice(idx + 1);
  return { parent, name };
}

export function resolveSymlink(vm: VmState, absPath: string, depth = 0): string {
  if (depth > 8) return absPath;
  const node = vm.vfs[absPath];
  if (node && node.type === 'symlink' && node.target) {
    const { parent } = splitParentChild(absPath);
    const resolvedTarget = node.target.startsWith('/')
      ? normalizePath(node.target, '/', '/root')
      : normalizePath(node.target, parent, '/root');
    return resolveSymlink(vm, resolvedTarget, depth + 1);
  }
  return absPath;
}

export function getNode(vm: VmState, absPath: string, followSymlink = true): { path: string; node: VfsNode } | null {
  const finalPath = followSymlink ? resolveSymlink(vm, absPath) : absPath;
  const node = vm.vfs[finalPath];
  if (!node) return null;
  return { path: finalPath, node };
}

export function canUserAccess(
  vm: VmState,
  user: string,
  node: VfsNode,
  need: 'r' | 'w' | 'x',
  asRoot = false
): boolean {
  if (asRoot || user === 'root') return true;
  const userObj = vm.users[user];
  const userGroups = new Set<string>(userObj ? userObj.groups : []);
  if (userObj) {
    const primaryGroup = Object.values(vm.groups).find((g) => g.gid === userObj.gid);
    if (primaryGroup) userGroups.add(primaryGroup.name);
  }

  const bit = need === 'r' ? 4 : need === 'w' ? 2 : 1;
  if (node.owner === user) {
    return ((node.mode >> 6) & bit) === bit;
  }
  if (userGroups.has(node.group)) {
    return ((node.mode >> 3) & bit) === bit;
  }
  return (node.mode & bit) === bit;
}

export function formatModeString(node: VfsNode): string {
  const prefix = node.type === 'dir' ? 'd' : node.type === 'symlink' ? 'l' : '-';
  const rwx = (val: number, special: boolean, specialChar: string, execCharFallback: string) => {
    const r = (val & 4) !== 0 ? 'r' : '-';
    const w = (val & 2) !== 0 ? 'w' : '-';
    let x = (val & 1) !== 0 ? 'x' : '-';
    if (special) {
      x = (val & 1) !== 0 ? specialChar : execCharFallback;
    }
    return `${r}${w}${x}`;
  };

  const u = rwx((node.mode >> 6) & 7, Boolean(node.suid), 's', 'S');
  const g = rwx((node.mode >> 3) & 7, Boolean(node.sgid), 's', 'S');
  const o = rwx(node.mode & 7, Boolean(node.sticky), 't', 'T');
  return `${prefix}${u}${g}${o}`;
}

export function getOctalString(node: VfsNode): string {
  const special = (node.suid ? 4 : 0) + (node.sgid ? 2 : 0) + (node.sticky ? 1 : 0);
  const perm = (node.mode & 0o777).toString(8).padStart(3, '0');
  return special > 0 ? `${special}${perm}` : perm;
}

export function createVfsFile(
  vm: VmState,
  absPath: string,
  content: string,
  owner: string,
  group?: string,
  mode?: number
): { ok: boolean; error?: string } {
  const { parent, name } = splitParentChild(absPath);
  const parentNode = vm.vfs[parent];
  if (!parentNode || parentNode.type !== 'dir') {
    return { ok: false, error: `No such file or directory` };
  }
  const existing = vm.vfs[absPath];
  if (existing) {
    if (existing.type === 'dir') {
      return { ok: false, error: `Is a directory` };
    }
    existing.content = content;
    existing.size = content.length;
    existing.mtime = 'Nov 20 12:10';
    return { ok: true };
  }

  const resolvedGroup = parentNode.sgid ? parentNode.group : group || owner;
  const resolvedMode = mode !== undefined ? mode : 0o666 & ~vm.umask;
  vm.vfs[absPath] = {
    type: 'file',
    inodeId: vm.nextInode++,
    mode: resolvedMode,
    owner,
    group: resolvedGroup,
    content,
    mtime: 'Nov 20 12:10',
    size: content.length,
  };
  if (parentNode.children && !parentNode.children.includes(name)) {
    parentNode.children.push(name);
  }
  return { ok: true };
}

export function createVfsDir(
  vm: VmState,
  absPath: string,
  owner: string,
  group?: string,
  mode?: number,
  recursive = false
): { ok: boolean; error?: string } {
  if (absPath === '/') return { ok: false, error: 'File exists' };
  const parts = absPath.split('/').filter(Boolean);

  if (!recursive) {
    const { parent, name } = splitParentChild(absPath);
    const parentNode = vm.vfs[parent];
    if (!parentNode || parentNode.type !== 'dir') {
      return { ok: false, error: `cannot create directory '${absPath}': No such file or directory` };
    }
    if (vm.vfs[absPath]) {
      return { ok: false, error: `cannot create directory '${absPath}': File exists` };
    }
    const resolvedGroup = parentNode.sgid ? parentNode.group : group || owner;
    const resolvedMode = mode !== undefined ? mode : 0o777 & ~vm.umask;
    vm.vfs[absPath] = {
      type: 'dir',
      inodeId: vm.nextInode++,
      mode: resolvedMode,
      sgid: Boolean(parentNode.sgid),
      owner,
      group: resolvedGroup,
      children: [],
      mtime: 'Nov 20 12:10',
      size: 4096,
    };
    parentNode.children?.push(name);
    return { ok: true };
  }

  let current = '';
  for (const part of parts) {
    const prev = current || '/';
    current = `${current}/${part}`;
    if (!vm.vfs[current]) {
      const parentNode = vm.vfs[prev];
      const resolvedGroup = parentNode?.sgid ? parentNode.group : group || owner;
      const resolvedMode = mode !== undefined ? mode : 0o777 & ~vm.umask;
      vm.vfs[current] = {
        type: 'dir',
        inodeId: vm.nextInode++,
        mode: resolvedMode,
        sgid: Boolean(parentNode?.sgid),
        owner,
        group: resolvedGroup,
        children: [],
        mtime: 'Nov 20 12:10',
        size: 4096,
      };
      if (parentNode?.children && !parentNode.children.includes(part)) {
        parentNode.children.push(part);
      }
    } else if (vm.vfs[current].type !== 'dir') {
      return { ok: false, error: `cannot create directory '${current}': File exists` };
    }
  }
  return { ok: true };
}

export function deleteVfsPath(vm: VmState, absPath: string, recursive = false): { ok: boolean; error?: string } {
  if (absPath === '/') return { ok: false, error: `cannot remove '/'` };
  const node = vm.vfs[absPath];
  if (!node) return { ok: false, error: `cannot remove '${absPath}': No such file or directory` };

  if (node.type === 'dir') {
    if (!recursive && node.children && node.children.length > 0) {
      return { ok: false, error: `cannot remove '${absPath}': Is a directory` };
    }
    const children = [...(node.children || [])];
    for (const child of children) {
      const childPath = absPath === '/' ? `/${child}` : `${absPath}/${child}`;
      deleteVfsPath(vm, childPath, true);
    }
  }

  const { parent, name } = splitParentChild(absPath);
  const parentNode = vm.vfs[parent];
  if (parentNode?.children) {
    parentNode.children = parentNode.children.filter((c) => c !== name);
  }
  delete vm.vfs[absPath];
  return { ok: true };
}

export function copyVfsPath(
  vm: VmState,
  srcPath: string,
  destPath: string,
  owner: string,
  recursive = false
): { ok: boolean; error?: string } {
  const srcNode = vm.vfs[srcPath];
  if (!srcNode) return { ok: false, error: `cannot stat '${srcPath}': No such file or directory` };
  if (srcNode.type === 'dir' && !recursive) {
    return { ok: false, error: `-r not specified; omitting directory '${srcPath}'` };
  }

  let targetPath = destPath;
  const destNode = vm.vfs[destPath];
  if (destNode && destNode.type === 'dir') {
    const { name } = splitParentChild(srcPath);
    targetPath = destPath === '/' ? `/${name}` : `${destPath}/${name}`;
  }

  if (srcNode.type === 'dir') {
    if (!vm.vfs[targetPath]) {
      const mk = createVfsDir(vm, targetPath, owner, owner, srcNode.mode, true);
      if (!mk.ok) return mk;
    }
    for (const child of srcNode.children || []) {
      const childSrc = srcPath === '/' ? `/${child}` : `${srcPath}/${child}`;
      const childDest = targetPath === '/' ? `/${child}` : `${targetPath}/${child}`;
      const res = copyVfsPath(vm, childSrc, childDest, owner, true);
      if (!res.ok) return res;
    }
    return { ok: true };
  }

  if (srcNode.type === 'symlink') {
    const { parent, name } = splitParentChild(targetPath);
    const pNode = vm.vfs[parent];
    if (!pNode || pNode.type !== 'dir') return { ok: false, error: `No such file or directory` };
    vm.vfs[targetPath] = { ...srcNode, inodeId: vm.nextInode++, owner, group: owner };
    if (pNode.children && !pNode.children.includes(name)) pNode.children.push(name);
    return { ok: true };
  }

  return createVfsFile(vm, targetPath, srcNode.content || '', owner, owner, srcNode.mode);
}

export function countHardLinks(vm: VmState, inodeId: number): number {
  let count = 0;
  for (const node of Object.values(vm.vfs)) {
    if (node.inodeId === inodeId) count++;
  }
  return count;
}

export function applyChmodMode(node: VfsNode, modeExpr: string): boolean {
  const trimmed = modeExpr.trim();
  // Octal check (3 or 4 digits)
  if (/^[0-7]{3,4}$/.test(trimmed)) {
    if (trimmed.length === 4) {
      const special = parseInt(trimmed[0], 8);
      node.suid = (special & 4) !== 0;
      node.sgid = (special & 2) !== 0;
      node.sticky = (special & 1) !== 0;
      node.mode = parseInt(trimmed.slice(1), 8);
    } else {
      node.suid = false;
      node.sgid = false;
      node.sticky = false;
      node.mode = parseInt(trimmed, 8);
    }
    return true;
  }

  // Symbolic check: comma-separated clauses e.g. u+x,g-w,o=r,a+rX,g+s,+t
  const clauses = trimmed.split(',');
  let mode = node.mode;
  let suid = Boolean(node.suid);
  let sgid = Boolean(node.sgid);
  let sticky = Boolean(node.sticky);

  for (const clause of clauses) {
    const match = clause.match(/^([ugoa]*)([+\-=])([rwxXst]*)$/);
    if (!match) return false;
    const who = match[1] || 'a';
    const op = match[2];
    const perms = match[3];

    let bits = 0;
    if (perms.includes('r')) bits |= 4;
    if (perms.includes('w')) bits |= 2;
    if (perms.includes('x')) bits |= 1;
    if (perms.includes('X') && (node.type === 'dir' || (mode & 0o111) !== 0)) bits |= 1;

    const targets = {
      u: who.includes('u') || who.includes('a'),
      g: who.includes('g') || who.includes('a'),
      o: who.includes('o') || who.includes('a'),
    };

    const applyMask = (current: number, shift: number, active: boolean) => {
      if (!active) return current;
      const curBits = (current >> shift) & 7;
      let nextBits = curBits;
      if (op === '+') nextBits = curBits | bits;
      if (op === '-') nextBits = curBits & ~bits;
      if (op === '=') nextBits = bits;
      return (current & ~(7 << shift)) | (nextBits << shift);
    };

    mode = applyMask(mode, 6, targets.u);
    mode = applyMask(mode, 3, targets.g);
    mode = applyMask(mode, 0, targets.o);

    if (perms.includes('s')) {
      if (targets.u) suid = op !== '-';
      if (targets.g) sgid = op !== '-';
    }
    if (perms.includes('t')) {
      sticky = op !== '-';
    }
  }

  node.mode = mode;
  node.suid = suid;
  node.sgid = sgid;
  node.sticky = sticky;
  return true;
}

export function expandGlobsAndBraces(vm: VmState, token: string, wasQuoted: boolean): string[] {
  if (wasQuoted) return [token];

  // Brace expansion: e.g. file{1..4}.txt or {a,b,c}
  let braceExpanded: string[] = [token];
  const rangeMatch = token.match(/^(.*)\{(\d+)\.\.(\d+)\}(.*)$/);
  const listMatch = token.match(/^(.*)\{([^{}]+,[^{}]+)\}(.*)$/);

  if (rangeMatch) {
    const [, pre, startStr, endStr, post] = rangeMatch;
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    const step = start <= end ? 1 : -1;
    braceExpanded = [];
    for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
      braceExpanded.push(`${pre}${i}${post}`);
    }
  } else if (listMatch) {
    const [, pre, items, post] = listMatch;
    braceExpanded = items.split(',').map((item) => `${pre}${item}${post}`);
  }

  const finalResults: string[] = [];
  for (const item of braceExpanded) {
    if (!item.includes('*') && !item.includes('?')) {
      finalResults.push(item);
      continue;
    }

    const lastSlash = item.lastIndexOf('/');
    const dirPart = lastSlash >= 0 ? item.slice(0, lastSlash) || '/' : '';
    const patternPart = lastSlash >= 0 ? item.slice(lastSlash + 1) : item;
    const home = vm.users[vm.currentUser]?.home || '/home/student';
    const searchDir = dirPart ? normalizePath(dirPart, vm.cwd, home) : vm.cwd;
    const dirNode = vm.vfs[searchDir];

    if (!dirNode || dirNode.type !== 'dir' || !dirNode.children) {
      finalResults.push(item);
      continue;
    }

    const regexStr =
      '^' +
      patternPart
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$';
    const regex = new RegExp(regexStr);

    const matches = dirNode.children
      .filter((name) => {
        if (!patternPart.startsWith('.') && name.startsWith('.')) return false;
        return regex.test(name);
      })
      .sort()
      .map((name) => (dirPart ? `${dirPart === '/' ? '' : dirPart}/${name}` : name));

    if (matches.length > 0) {
      finalResults.push(...matches);
    } else {
      finalResults.push(item);
    }
  }

  return finalResults;
}
