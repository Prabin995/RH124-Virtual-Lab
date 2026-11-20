import {
  EditorSession,
  FeedbackEvent,
  ManSession,
  ProcessEntry,
  Quest,
  VmState,
} from '../types/rhel';
import { cloneVmState, syncSystemAuthFiles } from './initialVmState';
import { formatManPage, MAN_PAGES } from './manPages';
import {
  applyChmodMode,
  canUserAccess,
  copyVfsPath,
  countHardLinks,
  createVfsDir,
  createVfsFile,
  deleteVfsPath,
  expandGlobsAndBraces,
  formatModeString,
  getNode,
  normalizePath,
  splitParentChild,
} from './vfsUtils';

export interface ShellExecutionResult {
  vm: VmState;
  stdout: string;
  stderr: string;
  exitCode: number;
  clearTerminal?: boolean;
  openEditor?: EditorSession;
  openMan?: ManSession;
  feedback?: FeedbackEvent;
}

interface ParsedToken {
  value: string;
  quoted: boolean;
}

interface ParsedCommand {
  args: string[];
  stdoutFile?: string;
  stdoutAppend?: boolean;
  stderrFile?: string;
  stderrAppend?: boolean;
  bothFile?: string;
  bothAppend?: boolean;
  background?: boolean;
}

function expandEnvVars(str: string, vm: VmState): string {
  return str.replace(/\$([A-Za-z_][A-Za-z0-9_]*|\?)/g, (_, name) => {
    if (name === '?') return String(vm.lastExitCode);
    if (name === 'PWD') return vm.cwd;
    if (name === 'USER') return vm.currentUser;
    if (name === 'HOME') return vm.users[vm.currentUser]?.home || '/home/student';
    return vm.env[name] ?? '';
  });
}

function tokenizeSegment(segment: string, vm: VmState): ParsedToken[] {
  const tokens: ParsedToken[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let hasToken = false;
  let wasQuoted = false;

  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];

    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      } else {
        current += ch;
      }
      hasToken = true;
      continue;
    }

    if (inDouble) {
      if (ch === '"') {
        inDouble = false;
      } else if (ch === '\\' && i + 1 < segment.length) {
        current += segment[++i];
      } else {
        current += ch;
      }
      hasToken = true;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      wasQuoted = true;
      hasToken = true;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      wasQuoted = true;
      hasToken = true;
      continue;
    }

    if (ch === '\\' && i + 1 < segment.length) {
      current += segment[++i];
      wasQuoted = true;
      hasToken = true;
      continue;
    }

    if (/\s/.test(ch)) {
      if (hasToken) {
        const expanded = wasQuoted && current.includes(' ') ? current : expandEnvVars(current, vm);
        tokens.push({ value: expanded, quoted: wasQuoted });
        current = '';
        hasToken = false;
        wasQuoted = false;
      }
      continue;
    }

    // Handle standalone redirection operators glued to args
    if (ch === '>' || ch === '|') {
      if (hasToken && !(ch === '>' && (current === '2' || current === '&'))) {
        tokens.push({ value: expandEnvVars(current, vm), quoted: wasQuoted });
        current = '';
        hasToken = false;
        wasQuoted = false;
      }
      if (ch === '>') {
        const prefix = current === '2' || current === '&' ? current : '';
        if (segment[i + 1] === '>') {
          tokens.push({ value: `${prefix}>>`, quoted: false });
          i++;
        } else {
          tokens.push({ value: `${prefix}>`, quoted: false });
        }
        current = '';
        hasToken = false;
        wasQuoted = false;
        continue;
      }
    }

    current += ch;
    hasToken = true;
  }

  if (hasToken) {
    tokens.push({ value: expandEnvVars(current, vm), quoted: wasQuoted });
  }

  return tokens;
}

function splitTopLevel(input: string, delimiter: '&&' | ';' | '|'): string[] {
  const parts: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }
    if (!inSingle && !inDouble) {
      if (delimiter === '&&' && input.slice(i, i + 2) === '&&') {
        parts.push(current.trim());
        current = '';
        i++;
        continue;
      }
      if (delimiter === ';' && ch === ';') {
        parts.push(current.trim());
        current = '';
        continue;
      }
      if (delimiter === '|' && ch === '|') {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseCommand(tokens: ParsedToken[], vm: VmState): ParsedCommand {
  const args: string[] = [];
  const parsed: ParsedCommand = { args };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok.quoted && (tok.value === '>' || tok.value === '>>')) {
      parsed.stdoutFile = tokens[++i]?.value;
      parsed.stdoutAppend = tok.value === '>>';
      continue;
    }
    if (!tok.quoted && (tok.value === '2>' || tok.value === '2>>')) {
      parsed.stderrFile = tokens[++i]?.value;
      parsed.stderrAppend = tok.value === '2>>';
      continue;
    }
    if (!tok.quoted && (tok.value === '&>' || tok.value === '&>>')) {
      parsed.bothFile = tokens[++i]?.value;
      parsed.bothAppend = tok.value === '&>>';
      continue;
    }
    if (!tok.quoted && tok.value === '&' && i === tokens.length - 1) {
      parsed.background = true;
      continue;
    }

    if (args.length === 0) {
      args.push(tok.value);
    } else {
      const expanded = expandGlobsAndBraces(vm, tok.value, tok.quoted);
      args.push(...expanded);
    }
  }

  return parsed;
}

function writeRedirection(vm: VmState, filePath: string, content: string, append: boolean, asRoot: boolean): string | null {
  const home = vm.users[vm.currentUser]?.home || '/home/student';
  const abs = normalizePath(filePath, vm.cwd, home);
  if (abs === '/dev/null') return null;

  const existing = vm.vfs[abs];
  if (existing) {
    if (existing.type === 'dir') return `bash: ${filePath}: Is a directory`;
    if (!canUserAccess(vm, vm.currentUser, existing, 'w', asRoot)) {
      return `bash: ${filePath}: Permission denied`;
    }
    const nextContent = append ? (existing.content || '') + content : content;
    existing.content = nextContent;
    existing.size = nextContent.length;
    return null;
  }

  const { parent } = splitParentChild(abs);
  const pNode = vm.vfs[parent];
  if (!pNode || pNode.type !== 'dir') return `bash: ${filePath}: No such file or directory`;
  if (!canUserAccess(vm, vm.currentUser, pNode, 'w', asRoot)) {
    return `bash: ${filePath}: Permission denied`;
  }
  createVfsFile(vm, abs, content, asRoot ? 'root' : vm.currentUser);
  return null;
}

function formatPermissionsOutput(vm: VmState, absPath: string, displayName: string, showInode = false): string {
  const node = vm.vfs[absPath];
  if (!node) return '';
  const modeStr = formatModeString(node);
  const links = node.type === 'dir' ? Math.max(2, (node.children?.length || 0) + 2) : countHardLinks(vm, node.inodeId);
  const sizeStr = String(node.size).padStart(5, ' ');
  const inodePrefix = showInode ? `${String(node.inodeId).padStart(4, ' ')} ` : '';
  const nameSuffix = node.type === 'symlink' && node.target ? ` -> ${node.target}` : '';
  return `${inodePrefix}${modeStr} ${links} ${node.owner.padEnd(8, ' ')} ${node.group.padEnd(10, ' ')} ${sizeStr} ${node.mtime} ${displayName}${nameSuffix}`;
}

export function runShellCommand(
  inputVm: VmState,
  rawInput: string,
  activeQuest?: Quest
): ShellExecutionResult {
  const trimmed = rawInput.trim();
  const vmBefore = cloneVmState(inputVm);
  const vm = cloneVmState(inputVm);

  if (!trimmed) {
    return { vm, stdout: '', stderr: '', exitCode: 0 };
  }

  vm.commandHistory = [...vm.commandHistory, trimmed].slice(-100);
  vm.lastCommand = trimmed;

  // Handle chained commands separated by ; or &&
  const seqParts = splitTopLevel(trimmed, ';');
  let combinedStdout: string[] = [];
  let combinedStderr: string[] = [];
  let lastExit = 0;
  let clearTerminal = false;
  let openEditor: EditorSession | undefined;
  let openMan: ManSession | undefined;

  for (const seqPart of seqParts) {
    const andParts = splitTopLevel(seqPart, '&&');
    for (const andPart of andParts) {
      const pipeStages = splitTopLevel(andPart, '|');
      let pipeStdin = '';
      let stageExit = 0;

      for (let sIdx = 0; sIdx < pipeStages.length; sIdx++) {
        const stageStr = pipeStages[sIdx];
        const tokens = tokenizeSegment(stageStr, vm);
        const parsed = parseCommand(tokens, vm);
        if (parsed.args.length === 0) continue;

        const isLastStage = sIdx === pipeStages.length - 1;
        const res = executeSingleCommand(vm, parsed, pipeStdin, stageStr, false, activeQuest);
        stageExit = res.exitCode;
        if (res.clearTerminal) clearTerminal = true;
        if (res.openEditor) openEditor = res.openEditor;
        if (res.openMan) openMan = res.openMan;

        let outText = res.stdout;
        let errText = res.stderr;

        if (parsed.bothFile) {
          const combined = [outText, errText].filter(Boolean).join('\n');
          const redirErr = writeRedirection(vm, parsed.bothFile, combined ? combined + '\n' : '', Boolean(parsed.bothAppend), vm.currentUser === 'root');
          if (redirErr) {
            errText = redirErr;
            stageExit = 1;
          } else {
            outText = '';
            errText = '';
          }
        } else {
          if (parsed.stdoutFile) {
            const redirErr = writeRedirection(vm, parsed.stdoutFile, outText ? outText + (outText.endsWith('\n') ? '' : '\n') : '', Boolean(parsed.stdoutAppend), vm.currentUser === 'root');
            if (redirErr) {
              errText = [errText, redirErr].filter(Boolean).join('\n');
              stageExit = 1;
            }
            outText = '';
          }
          if (parsed.stderrFile) {
            const redirErr = writeRedirection(vm, parsed.stderrFile, errText ? errText + '\n' : '', Boolean(parsed.stderrAppend), vm.currentUser === 'root');
            if (redirErr) {
              errText = redirErr;
              stageExit = 1;
            } else {
              errText = '';
            }
          }
        }

        if (!isLastStage) {
          pipeStdin = outText;
          if (errText) combinedStderr.push(errText);
        } else {
          if (outText) combinedStdout.push(outText);
          if (errText) combinedStderr.push(errText);
        }
      }

      lastExit = stageExit;
      if (lastExit !== 0) break; // && short-circuit
    }
  }

  vm.lastExitCode = lastExit;
  const stdout = combinedStdout.join('\n');
  const stderr = combinedStderr.join('\n');

  const feedback = analyzeCommandFeedback(trimmed, lastExit, stdout, stderr, vmBefore, vm);

  return {
    vm,
    stdout,
    stderr,
    exitCode: lastExit,
    clearTerminal,
    openEditor,
    openMan,
    feedback,
  };
}

function executeSingleCommand(
  vm: VmState,
  parsed: ParsedCommand,
  stdin: string,
  rawStage: string,
  elevatedBySudo = false,
  activeQuest?: Quest
): {
  stdout: string;
  stderr: string;
  exitCode: number;
  clearTerminal?: boolean;
  openEditor?: EditorSession;
  openMan?: ManSession;
} {
  const [cmd, ...rest] = parsed.args;
  const asRoot = elevatedBySudo || vm.currentUser === 'root';
  const home = vm.users[vm.currentUser]?.home || '/home/student';

  // Handle background jobs like `sleep 300 &` or `yes > /dev/null &`
  if (parsed.background) {
    const jobCount = vm.processes.filter((p) => p.isBackgroundJob).length + 1;
    const pid = vm.nextPid++;
    const proc: ProcessEntry = {
      pid,
      ppid: 1410,
      user: asRoot ? 'root' : vm.currentUser,
      cpu: cmd === 'yes' || cmd === 'sha256sum' ? 98.4 : 0.0,
      mem: 0.1,
      stat: cmd === 'yes' ? 'R' : 'S',
      nice: 0,
      command: rawStage.replace(/\s*&\s*$/, ''),
      startTime: '12:05',
      isBackgroundJob: true,
      jobId: jobCount,
    };
    vm.processes.push(proc);
    return { stdout: `[${jobCount}] ${pid}`, stderr: '', exitCode: 0 };
  }

  // Handle `sudo`
  if (cmd === 'sudo') {
    if (rest.length === 0) {
      return { stdout: '', stderr: 'usage: sudo -i | sudo <command>', exitCode: 1 };
    }
    if (!asRoot && !(vm.users[vm.currentUser]?.groups.includes('wheel') || vm.vfs[`/etc/sudoers.d/${vm.currentUser}`])) {
      return {
        stdout: '',
        stderr: `${vm.currentUser} is not in the sudoers file. This incident will be reported.`,
        exitCode: 1,
      };
    }

    if (rest[0] === '-i' || rest[0] === '-s') {
      vm.currentUser = 'root';
      vm.cwd = '/root';
      vm.env.USER = 'root';
      vm.env.HOME = '/root';
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    if (rest[0] === '-l') {
      return {
        stdout: `User ${vm.currentUser} may run the following commands on ${vm.hostname}:\n    (ALL) NOPASSWD: ALL`,
        stderr: '',
        exitCode: 0,
      };
    }

    vm.journal.push({
      timestamp: 'Nov 20 12:08:00',
      unit: 'sudo',
      priority: 'notice',
      pid: vm.nextPid++,
      message: `${vm.currentUser} : PWD=${vm.cwd} ; USER=root ; COMMAND=${rest.join(' ')}`,
    });

    return executeSingleCommand(vm, { ...parsed, args: rest }, stdin, rawStage, true, activeQuest);
  }

  switch (cmd) {
    case 'clear':
      return { stdout: '', stderr: '', exitCode: 0, clearTerminal: true };

    case 'help':
      return {
        stdout:
          'Red Hat Enterprise Linux 9.3 (RH124 Lab Environment)\nRed Hat Lab CLI: lab start <slug>, lab grade, lab finish, lab list\nSystem & CLI Tools: ls, cd, pwd, mkdir, touch, cp, mv, rm, ln, find, stat, cat, head, tail, grep, sort, uniq, cut, tr, sed, wc, vim, man, whatis, useradd, usermod, groupadd, passwd, chage, su, sudo, chmod, chown, umask, ps, pgrep, pkill, kill, top, jobs, nice, renice, systemctl, ssh-keygen, ssh-copy-id, ssh, sftp, journalctl, logger, ip, nmcli, hostnamectl, ping, dig, host, traceroute, ss, curl, tar, scp, rsync, dnf, rpm, timedatectl, chronyc, lsblk, blkid, df, du, mount, umount, lsof, firewall-cmd, sos, subscription-manager',
        stderr: '',
        exitCode: 0,
      };

    case 'lab': {
      const sub = rest[0];
      const slug = rest[1] || activeQuest?.labSlug || 'rh124-lab';
      const allSlugs = [
        'intro-navigate',
        'cli-basics',
        'files-manage',
        'help-man',
        'text-vim',
        'users-groups',
        'permissions-access',
        'processes-monitor',
        'services-systemd',
        'openssh-secure',
        'logging-journald',
        'network-nmcli',
        'archive-transfer',
        'software-dnf',
        'filesystems-mount',
        'support-review',
      ];
      if (!sub || sub === '--help' || sub === '-h') {
        return {
          stdout: `Usage: lab <command> [EXERCISE]\n\nCommands:\n  start [EXERCISE]   Prepare the classroom lab environment\n  grade [EXERCISE]   Verify objectives on workstation/servera/serverb\n  finish [EXERCISE]  Clean up the lab environment\n  list               List all RH124 9.3 lab exercise slugs`,
          stderr: '',
          exitCode: 0,
        };
      }
      if (sub === 'list') {
        return {
          stdout: `Available RH124 (RHEL 9.3) Lab Exercises:\n${allSlugs.map((s, i) => `  ${String(i + 1).padStart(2, '0')}. ${s}`).join('\n')}`,
          stderr: '',
          exitCode: 0,
        };
      }
      if (sub === 'start') {
        return {
          stdout: `Starting lab exercise '${slug}'...\n\n · Checking workstation.lab.example.com .......... SUCCESS\n · Checking servera.lab.example.com .............. SUCCESS\n · Checking serverb.lab.example.com .............. SUCCESS\n · Preparing environment for ${activeQuest?.title || slug} ... SUCCESS`,
          stderr: '',
          exitCode: 0,
        };
      }
      if (sub === 'grade') {
        if (!activeQuest) {
          return { stdout: `Grading '${slug}'... No active lab selected.`, stderr: '', exitCode: 1 };
        }
        const results = activeQuest.objectives.map((obj) => ({
          title: obj.title,
          passed: obj.check(vm),
        }));
        const allPassed = results.every((r) => r.passed);
        const lines = results.map((r) => ` ${r.passed ? 'PASS' : 'FAIL'}  ${r.title}`);
        return {
          stdout: `Grading lab exercise '${slug}' (${activeQuest.moduleCode})...\n\n${lines.join('\n')}\n\nOverall lab grade: ${allPassed ? 'PASS' : 'FAIL'}`,
          stderr: '',
          exitCode: allPassed ? 0 : 1,
        };
      }
      if (sub === 'finish') {
        return {
          stdout: `Finishing lab exercise '${slug}'...\n\n · Verifying clean workstation state ............. SUCCESS`,
          stderr: '',
          exitCode: 0,
        };
      }
      return { stdout: '', stderr: `lab: unknown subcommand '${sub}'. Try 'lab --help'.`, exitCode: 2 };
    }

    case 'pwd':
      return { stdout: vm.cwd, stderr: '', exitCode: 0 };

    case 'whoami':
      return { stdout: asRoot ? 'root' : vm.currentUser, stderr: '', exitCode: 0 };

    case 'hostname':
      return { stdout: vm.hostname, stderr: '', exitCode: 0 };

    case 'hostnamectl': {
      if (rest[0] === 'set-hostname') {
        if (!asRoot) return { stdout: '', stderr: 'Could not set property: Access denied (try sudo)', exitCode: 1 };
        const newHost = rest[1];
        if (!newHost) return { stdout: '', stderr: 'hostnamectl: missing hostname argument', exitCode: 1 };
        vm.hostname = newHost;
        createVfsFile(vm, '/etc/hostname', `${newHost}\n`, 'root');
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      return {
        stdout: ` Static hostname: ${vm.hostname}
       Icon name: computer-vm
         Chassis: vm
Operating System: Red Hat Enterprise Linux 9.3 (Plow)
     CPE OS Name: cpe:/o:redhat:enterprise_linux:9::baseos
          Kernel: Linux 5.14.0-427.13.1.el9_4.x86_64
    Architecture: x86-64`,
        stderr: '',
        exitCode: 0,
      };
    }

    case 'uname': {
      const flag = rest.join(' ');
      if (flag.includes('-a')) {
        return {
          stdout: `Linux ${vm.hostname} 5.14.0-427.13.1.el9_4.x86_64 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux`,
          stderr: '',
          exitCode: 0,
        };
      }
      if (flag.includes('-r')) return { stdout: '5.14.0-427.13.1.el9_4.x86_64', stderr: '', exitCode: 0 };
      if (flag.includes('-n')) return { stdout: vm.hostname, stderr: '', exitCode: 0 };
      return { stdout: 'Linux', stderr: '', exitCode: 0 };
    }

    case 'date':
      return { stdout: 'Fri Nov 20 12:15:32 EST 2026', stderr: '', exitCode: 0 };

    case 'timedatectl': {
      if (rest[0] === 'list-timezones') {
        return {
          stdout: 'America/New_York\nAmerica/Chicago\nAmerica/Los_Angeles\nEurope/London\nEurope/Berlin\nAsia/Tokyo\nUTC',
          stderr: '',
          exitCode: 0,
        };
      }
      if (rest[0] === 'set-timezone') {
        if (!asRoot) return { stdout: '', stderr: 'Failed to set time zone: Access denied', exitCode: 1 };
        if (!rest[1]) return { stdout: '', stderr: 'timedatectl: missing timezone', exitCode: 1 };
        vm.timezone = rest[1];
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (rest[0] === 'set-ntp') {
        if (!asRoot) return { stdout: '', stderr: 'Failed to set NTP: Access denied', exitCode: 1 };
        vm.ntpSync = rest[1] === 'true' || rest[1] === '1';
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      return {
        stdout: `               Local time: Fri 2026-11-20 12:15:32 ${vm.timezone === 'UTC' ? 'UTC' : 'EST'}
           Universal time: Fri 2026-11-20 17:15:32 UTC
                 RTC time: Fri 2026-11-20 17:15:32
                Time zone: ${vm.timezone}
System clock synchronized: ${vm.ntpSync ? 'yes' : 'no'}
              NTP service: ${vm.ntpSync ? 'active' : 'inactive'}
          RTC in local TZ: no`,
        stderr: '',
        exitCode: 0,
      };
    }

    case 'chronyc': {
      if (rest[0] === 'sources') {
        return {
          stdout: `MS Name/IP address         Stratum Poll Reach LastRx Last sample
===============================================================================
^* 172.25.250.254                2   6   377    34   +112us[ +140us] +/-   18ms`,
          stderr: '',
          exitCode: 0,
        };
      }
      if (rest[0] === 'tracking') {
        return {
          stdout: `Reference ID    : AC19FAFE (172.25.250.254)
Stratum         : 3
System time     : 0.000112412 seconds fast of NTP time
Last offset     : +0.000028102 seconds
Leap status     : Normal`,
          stderr: '',
          exitCode: 0,
        };
      }
      return { stdout: 'chronyc> try "chronyc sources" or "chronyc tracking"', stderr: '', exitCode: 0 };
    }

    case 'uptime':
      return { stdout: ' 12:15:32 up 3:15,  1 user,  load average: 0.08, 0.05, 0.01', stderr: '', exitCode: 0 };

    case 'lscpu':
      return {
        stdout: `Architecture:            x86_64
CPU(s):                  2
Model name:              AMD EPYC 7763 64-Core Processor
Thread(s) per core:      1
Core(s) per socket:      2`,
        stderr: '',
        exitCode: 0,
      };

    case 'free':
      return {
        stdout: `               total        used        free      shared  buff/cache   available
Mem:           3.8Gi       620Mi       2.1Gi        12Mi       1.1Gi       2.9Gi
Swap:          2.0Gi          0B       2.0Gi`,
        stderr: '',
        exitCode: 0,
      };

    case 'df': {
      const extraMounts = vm.blockDevices
        .filter((b) => b.mountpoint && b.mountpoint !== '/' && b.mountpoint !== '/boot')
        .map((b) => `/dev/${b.name.padEnd(9, ' ')} ${b.size.padStart(4, ' ')}   48M  ${b.size.padStart(4, ' ')}   3% ${b.mountpoint}`);
      return {
        stdout: [
          'Filesystem     Size  Used Avail Use% Mounted on',
          '/dev/vda2       19G  3.4G   16G  18% /',
          '/dev/vda1      1.0G  260M  764M  26% /boot',
          'tmpfs          1.9G     0  1.9G   0% /dev/shm',
          ...extraMounts,
        ].join('\n'),
        stderr: '',
        exitCode: 0,
      };
    }

    case 'lsblk': {
      const showFs = rest.some((a) => a.includes('f'));
      const showPath = rest.some((a) => a.includes('p'));
      const prefix = (name: string) => (showPath ? `/dev/${name}` : name);
      if (showFs) {
        const rows = vm.blockDevices.map((b) => {
          const disp = b.parent ? `└─${prefix(b.name)}` : prefix(b.name);
          return `${disp.padEnd(16, ' ')} ${b.fstype.padEnd(6, ' ')} ${' '.padEnd(8, ' ')} ${b.uuid.padEnd(36, ' ')} ${b.mountpoint || ''}`;
        });
        return {
          stdout: ['NAME             FSTYPE LABEL    UUID                                 MOUNTPOINTS', ...rows].join('\n'),
          stderr: '',
          exitCode: 0,
        };
      }
      const rows = vm.blockDevices.map((b) => {
        const disp = b.parent ? `└─${prefix(b.name)}` : prefix(b.name);
        return `${disp.padEnd(14, ' ')} 252:0    0  ${b.size.padStart(4, ' ')}  0 ${b.type.padEnd(4, ' ')} ${b.mountpoint || ''}`;
      });
      return {
        stdout: ['NAME           MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS', ...rows].join('\n'),
        stderr: '',
        exitCode: 0,
      };
    }

    case 'blkid': {
      const rows = vm.blockDevices
        .filter((b) => b.uuid && b.fstype)
        .map((b) => `/dev/${b.name}: UUID="${b.uuid}" BLOCK_SIZE="512" TYPE="${b.fstype}"`);
      return { stdout: rows.join('\n'), stderr: '', exitCode: 0 };
    }

    case 'mount': {
      if (rest.length === 0) {
        const base = [
          'sysfs on /sys type sysfs (rw,nosuid,nodev,noexec,relatime,seclabel)',
          'proc on /proc type proc (rw,nosuid,nodev,noexec,relatime)',
          '/dev/vda2 on / type xfs (rw,relatime,seclabel,attr2,inode64)',
          '/dev/vda1 on /boot type xfs (rw,relatime,seclabel,attr2,inode64)',
        ];
        const extras = vm.blockDevices
          .filter((b) => b.mountpoint && b.mountpoint !== '/' && b.mountpoint !== '/boot')
          .map((b) => `/dev/${b.name} on ${b.mountpoint} type ${b.fstype || 'xfs'} (rw,relatime,seclabel)`);
        return { stdout: [...base, ...extras].join('\n'), stderr: '', exitCode: 0 };
      }
      const pos = rest.filter((a) => !a.startsWith('-'));
      if (pos.length < 2) return { stdout: '', stderr: 'mount: usage: mount <device|UUID=...> <mountpoint>', exitCode: 1 };
      if (!asRoot) return { stdout: '', stderr: 'mount: only root can use "--all" or mount filesystems (try sudo).', exitCode: 1 };
      const [srcArg, targetArg] = pos;
      const targetAbs = normalizePath(targetArg, vm.cwd, home);
      const targetNode = vm.vfs[targetAbs];
      if (!targetNode || targetNode.type !== 'dir') {
        return { stdout: '', stderr: `mount: ${targetArg}: mount point does not exist.`, exitCode: 32 };
      }
      const dev = vm.blockDevices.find((b) =>
        srcArg.startsWith('UUID=') ? b.uuid === srcArg.slice(5).replace(/"/g, '') : `/dev/${b.name}` === srcArg || b.name === srcArg
      );
      if (!dev || !dev.fstype) {
        return { stdout: '', stderr: `mount: ${targetArg}: special device ${srcArg} does not exist.`, exitCode: 32 };
      }
      dev.mountpoint = targetAbs;
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'umount': {
      if (!asRoot) return { stdout: '', stderr: 'umount: only root can unmount filesystems (try sudo).', exitCode: 1 };
      const target = rest.find((a) => !a.startsWith('-'));
      if (!target) return { stdout: '', stderr: 'umount: bad usage', exitCode: 1 };
      const targetAbs = normalizePath(target, vm.cwd, home);
      const dev = vm.blockDevices.find(
        (b) => b.mountpoint === targetAbs || `/dev/${b.name}` === target || b.name === target
      );
      if (!dev || !dev.mountpoint) {
        return { stdout: '', stderr: `umount: ${target}: not mounted.`, exitCode: 32 };
      }
      if (dev.mountpoint === '/' || dev.mountpoint === '/boot') {
        return { stdout: '', stderr: `umount: ${dev.mountpoint}: target is busy.`, exitCode: 32 };
      }
      dev.mountpoint = null;
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'du': {
      const human = rest.some((a) => a.includes('h'));
      const summary = rest.some((a) => a.includes('s'));
      const targets = rest.filter((a) => !a.startsWith('-'));
      const targetArg = targets[0] || '.';
      const targetAbs = normalizePath(targetArg, vm.cwd, home);
      const node = vm.vfs[targetAbs];
      if (!node) return { stdout: '', stderr: `du: cannot access '${targetArg}': No such file or directory`, exitCode: 1 };

      const calcKb = (dirPath: string): number => {
        let bytes = 4096;
        for (const [p, n] of Object.entries(vm.vfs)) {
          if (p === dirPath || p.startsWith(dirPath === '/' ? '/' : dirPath + '/')) {
            bytes += Math.max(4096, n.size);
          }
        }
        return Math.max(4, Math.ceil(bytes / 1024));
      };
      const fmtSize = (kb: number) => (human ? (kb >= 1024 ? `${(kb / 1024).toFixed(1)}M` : `${kb}K`) : String(kb));

      if (summary || node.type !== 'dir') {
        return { stdout: `${fmtSize(calcKb(targetAbs))}\t${targetArg}`, stderr: '', exitCode: 0 };
      }
      const rows = (node.children || [])
        .map((c) => {
          const cp = targetAbs === '/' ? `/${c}` : `${targetAbs}/${c}`;
          return vm.vfs[cp]?.type === 'dir' ? `${fmtSize(calcKb(cp))}\t${targetArg === '.' ? `./${c}` : `${targetArg}/${c}`}` : null;
        })
        .filter((x): x is string => Boolean(x));
      rows.push(`${fmtSize(calcKb(targetAbs))}\t${targetArg}`);
      return { stdout: rows.join('\n'), stderr: '', exitCode: 0 };
    }

    case 'lsof': {
      const target = rest.find((a) => !a.startsWith('-'));
      const rows = [
        'COMMAND    PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME',
        'systemd      1 root  cwd    DIR  252,2      224  128 /',
        'rsyslogd   620 root    4w   REG  252,2     1024  512 /var/log/messages',
        'sshd      1024 root    3u  IPv4  18201      0t0  TCP *:ssh (LISTEN)',
      ];
      for (const b of vm.blockDevices) {
        if (b.mountpoint && b.mountpoint !== '/' && b.mountpoint !== '/boot') {
          rows.push(`bash      1410 ${vm.currentUser.padEnd(7, ' ')} cwd    DIR  252,17      64  256 ${b.mountpoint}`);
        }
      }
      const filtered = target ? rows.filter((r, i) => i === 0 || r.includes(target)) : rows;
      return { stdout: filtered.join('\n'), stderr: '', exitCode: 0 };
    }

    case 'id': {
      const targetUser = rest[0] || (asRoot ? 'root' : vm.currentUser);
      const u = vm.users[targetUser];
      if (!u) return { stdout: '', stderr: `id: '${targetUser}': no such user`, exitCode: 1 };
      const pGroup = Object.values(vm.groups).find((g) => g.gid === u.gid)?.name || u.username;
      const gList = [
        `${u.gid}(${pGroup})`,
        ...u.groups
          .map((gn) => {
            const grp = vm.groups[gn];
            return grp && grp.gid !== u.gid ? `${grp.gid}(${grp.name})` : null;
          })
          .filter(Boolean),
      ];
      return {
        stdout: `uid=${u.uid}(${u.username}) gid=${u.gid}(${pGroup}) groups=${gList.join(',')}`,
        stderr: '',
        exitCode: 0,
      };
    }

    case 'groups': {
      const targetUser = rest[0] || vm.currentUser;
      const u = vm.users[targetUser];
      if (!u) return { stdout: '', stderr: `groups: '${targetUser}': no such user`, exitCode: 1 };
      const pGroup = Object.values(vm.groups).find((g) => g.gid === u.gid)?.name || u.username;
      const all = Array.from(new Set([pGroup, ...u.groups]));
      return { stdout: `${targetUser} : ${all.join(' ')}`, stderr: '', exitCode: 0 };
    }

    case 'echo': {
      const noNewline = rest[0] === '-n';
      const args = noNewline ? rest.slice(1) : rest;
      return { stdout: args.join(' '), stderr: '', exitCode: 0 };
    }

    case 'env':
      return {
        stdout: Object.entries(vm.env)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),
        stderr: '',
        exitCode: 0,
      };

    case 'export': {
      for (const item of rest) {
        const idx = item.indexOf('=');
        if (idx > 0) {
          vm.env[item.slice(0, idx)] = item.slice(idx + 1);
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'history':
      return {
        stdout: vm.commandHistory.map((c, idx) => `${String(idx + 1).padStart(4, ' ')}  ${c}`).join('\n'),
        stderr: '',
        exitCode: 0,
      };

    case 'which': {
      const target = rest[0];
      if (!target) return { stdout: '', stderr: 'which: missing argument', exitCode: 1 };
      const candidates = [`/usr/bin/${target}`, `/usr/sbin/${target}`];
      const found = candidates.find((p) => vm.vfs[p]);
      if (found) return { stdout: found, stderr: '', exitCode: 0 };
      return { stdout: `/usr/bin/${target}`, stderr: '', exitCode: 0 };
    }

    case 'whatis': {
      const topic = rest[0];
      if (!topic) return { stdout: '', stderr: 'whatis what?', exitCode: 1 };
      const entry = MAN_PAGES[topic];
      if (!entry) return { stdout: '', stderr: `${topic}: nothing appropriate.`, exitCode: 16 };
      return { stdout: `${entry.name} (${entry.section}) - ${entry.summary}`, stderr: '', exitCode: 0 };
    }

    case 'apropos': {
      const kw = (rest[0] || '').toLowerCase();
      if (!kw) return { stdout: '', stderr: 'apropos what?', exitCode: 1 };
      const matches = Object.values(MAN_PAGES).filter(
        (m) => m.name.includes(kw) || m.summary.toLowerCase().includes(kw) || m.description.toLowerCase().includes(kw)
      );
      if (matches.length === 0) return { stdout: '', stderr: `${kw}: nothing appropriate.`, exitCode: 16 };
      return { stdout: matches.map((m) => `${m.name} (${m.section}) - ${m.summary}`).join('\n'), stderr: '', exitCode: 0 };
    }

    case 'man': {
      if (rest[0] === '-k') {
        return executeSingleCommand(vm, { ...parsed, args: ['apropos', ...rest.slice(1)] }, stdin, rawStage, elevatedBySudo, activeQuest);
      }
      if (rest[0] === '-f') {
        return executeSingleCommand(vm, { ...parsed, args: ['whatis', ...rest.slice(1)] }, stdin, rawStage, elevatedBySudo, activeQuest);
      }
      const topic = rest.find((r) => !/^\d+$/.test(r) && !r.startsWith('-'));
      if (!topic) return { stdout: '', stderr: 'What manual page do you want?', exitCode: 1 };
      const page = MAN_PAGES[topic];
      if (!page) return { stdout: '', stderr: `No manual entry for ${topic}`, exitCode: 16 };
      if (!vm.manPagesViewed.includes(topic)) vm.manPagesViewed.push(topic);
      return {
        stdout: `Opened manual page: ${page.name}(${page.section})`,
        stderr: '',
        exitCode: 0,
        openMan: { topic: page.name, section: page.section, content: formatManPage(page) },
      };
    }

    case 'cd': {
      const targetArg = rest[0] || home;
      const resolved = targetArg === '-' ? vm.previousCwd : normalizePath(targetArg, vm.cwd, home);
      const found = getNode(vm, resolved);
      if (!found) return { stdout: '', stderr: `bash: cd: ${targetArg}: No such file or directory`, exitCode: 1 };
      if (found.node.type !== 'dir') return { stdout: '', stderr: `bash: cd: ${targetArg}: Not a directory`, exitCode: 1 };
      if (!canUserAccess(vm, vm.currentUser, found.node, 'x', asRoot)) {
        return { stdout: '', stderr: `bash: cd: ${targetArg}: Permission denied`, exitCode: 1 };
      }
      vm.previousCwd = vm.cwd;
      vm.cwd = found.path;
      return { stdout: targetArg === '-' ? vm.cwd : '', stderr: '', exitCode: 0 };
    }

    case 'll':
      return executeSingleCommand(vm, { ...parsed, args: ['ls', '-l', ...rest] }, stdin, rawStage, elevatedBySudo, activeQuest);

    case 'ls': {
      let showAll = false;
      let longFmt = false;
      let dirOnly = false;
      let showInode = false;
      const targets: string[] = [];

      for (const arg of rest) {
        if (arg.startsWith('-') && arg.length > 1) {
          if (arg.includes('a')) showAll = true;
          if (arg.includes('l')) longFmt = true;
          if (arg.includes('d')) dirOnly = true;
          if (arg.includes('i')) showInode = true;
        } else {
          targets.push(arg);
        }
      }
      if (targets.length === 0) targets.push('.');

      const outLines: string[] = [];
      const errLines: string[] = [];

      for (let tIdx = 0; tIdx < targets.length; tIdx++) {
        const rawTarget = targets[tIdx];
        const abs = normalizePath(rawTarget, vm.cwd, home);
        const found = getNode(vm, abs, !dirOnly);
        if (!found) {
          errLines.push(`ls: cannot access '${rawTarget}': No such file or directory`);
          continue;
        }

        if (dirOnly || found.node.type !== 'dir') {
          if (longFmt) {
            outLines.push(formatPermissionsOutput(vm, abs, rawTarget, showInode));
          } else {
            outLines.push((showInode ? `${found.node.inodeId} ` : '') + rawTarget);
          }
          continue;
        }

        if (!canUserAccess(vm, vm.currentUser, found.node, 'r', asRoot)) {
          errLines.push(`ls: cannot open directory '${rawTarget}': Permission denied`);
          continue;
        }

        if (targets.length > 1) {
          if (tIdx > 0) outLines.push('');
          outLines.push(`${rawTarget}:`);
        }

        const children = [...(found.node.children || [])].sort();
        const visible = showAll ? ['.', '..', ...children] : children.filter((c) => !c.startsWith('.'));

        if (longFmt) {
          for (const child of visible) {
            if (child === '.' || child === '..') {
              const refPath = child === '.' ? found.path : splitParentChild(found.path).parent;
              outLines.push(formatPermissionsOutput(vm, refPath, child, showInode));
            } else {
              const childPath = found.path === '/' ? `/${child}` : `${found.path}/${child}`;
              outLines.push(formatPermissionsOutput(vm, childPath, child, showInode));
            }
          }
        } else {
          outLines.push(
            visible
              .map((c) => {
                if (!showInode) return c;
                const cp = found.path === '/' ? `/${c}` : `${found.path}/${c}`;
                return `${vm.vfs[cp]?.inodeId || found.node.inodeId} ${c}`;
              })
              .join('  ')
          );
        }
      }

      return {
        stdout: outLines.join('\n'),
        stderr: errLines.join('\n'),
        exitCode: errLines.length > 0 ? 2 : 0,
      };
    }

    case 'mkdir': {
      let parents = false;
      let modeArg: number | undefined;
      const dirs: string[] = [];

      for (let i = 0; i < rest.length; i++) {
        const arg = rest[i];
        if (arg === '-p' || arg === '--parents') {
          parents = true;
        } else if (arg === '-m' && rest[i + 1]) {
          modeArg = parseInt(rest[++i], 8);
        } else if (arg.startsWith('-')) {
          if (arg.includes('p')) parents = true;
        } else {
          dirs.push(arg);
        }
      }

      if (dirs.length === 0) return { stdout: '', stderr: 'mkdir: missing operand', exitCode: 1 };
      const errs: string[] = [];
      for (const d of dirs) {
        const abs = normalizePath(d, vm.cwd, home);
        const { parent } = splitParentChild(abs);
        const pNode = vm.vfs[parent];
        if (!parents && pNode && !canUserAccess(vm, vm.currentUser, pNode, 'w', asRoot)) {
          errs.push(`mkdir: cannot create directory '${d}': Permission denied`);
          continue;
        }
        const res = createVfsDir(vm, abs, asRoot ? 'root' : vm.currentUser, undefined, modeArg, parents);
        if (!res.ok && res.error) errs.push(`mkdir: ${res.error}`);
      }
      return { stdout: '', stderr: errs.join('\n'), exitCode: errs.length > 0 ? 1 : 0 };
    }

    case 'touch': {
      const files = rest.filter((a) => !a.startsWith('-'));
      if (files.length === 0) return { stdout: '', stderr: 'touch: missing file operand', exitCode: 1 };
      const errs: string[] = [];
      for (const f of files) {
        const abs = normalizePath(f, vm.cwd, home);
        const existing = vm.vfs[abs];
        if (existing) {
          existing.mtime = 'Nov 20 12:15';
        } else {
          const { parent } = splitParentChild(abs);
          const pNode = vm.vfs[parent];
          if (!pNode || pNode.type !== 'dir') {
            errs.push(`touch: cannot touch '${f}': No such file or directory`);
            continue;
          }
          if (!canUserAccess(vm, vm.currentUser, pNode, 'w', asRoot)) {
            errs.push(`touch: cannot touch '${f}': Permission denied`);
            continue;
          }
          createVfsFile(vm, abs, '', asRoot ? 'root' : vm.currentUser);
        }
      }
      return { stdout: '', stderr: errs.join('\n'), exitCode: errs.length > 0 ? 1 : 0 };
    }

    case 'cp': {
      let recursive = false;
      const paths: string[] = [];
      for (const a of rest) {
        if (a.startsWith('-')) {
          if (a.includes('r') || a.includes('R') || a.includes('a')) recursive = true;
        } else {
          paths.push(a);
        }
      }
      if (paths.length < 2) return { stdout: '', stderr: 'cp: missing file operand', exitCode: 1 };
      const destRaw = paths.pop()!;
      const destAbs = normalizePath(destRaw, vm.cwd, home);
      const errs: string[] = [];
      for (const srcRaw of paths) {
        const srcAbs = normalizePath(srcRaw, vm.cwd, home);
        const res = copyVfsPath(vm, srcAbs, destAbs, asRoot ? 'root' : vm.currentUser, recursive);
        if (!res.ok && res.error) errs.push(`cp: ${res.error}`);
      }
      return { stdout: '', stderr: errs.join('\n'), exitCode: errs.length > 0 ? 1 : 0 };
    }

    case 'mv': {
      const paths = rest.filter((a) => !a.startsWith('-'));
      if (paths.length < 2) return { stdout: '', stderr: 'mv: missing file operand', exitCode: 1 };
      const destRaw = paths.pop()!;
      const destAbs = normalizePath(destRaw, vm.cwd, home);
      const errs: string[] = [];
      for (const srcRaw of paths) {
        const srcAbs = normalizePath(srcRaw, vm.cwd, home);
        const srcNode = vm.vfs[srcAbs];
        if (!srcNode) {
          errs.push(`mv: cannot stat '${srcRaw}': No such file or directory`);
          continue;
        }
        const cpRes = copyVfsPath(vm, srcAbs, destAbs, srcNode.owner, true);
        if (!cpRes.ok) {
          errs.push(`mv: ${cpRes.error}`);
          continue;
        }
        deleteVfsPath(vm, srcAbs, true);
      }
      return { stdout: '', stderr: errs.join('\n'), exitCode: errs.length > 0 ? 1 : 0 };
    }

    case 'rm': {
      let recursive = false;
      const targets: string[] = [];
      for (const a of rest) {
        if (a.startsWith('-')) {
          if (a.includes('r') || a.includes('R')) recursive = true;
        } else {
          targets.push(a);
        }
      }
      if (targets.length === 0) return { stdout: '', stderr: 'rm: missing operand', exitCode: 1 };
      const errs: string[] = [];
      for (const t of targets) {
        const abs = normalizePath(t, vm.cwd, home);
        const node = vm.vfs[abs];
        if (!node) {
          if (!rest.some((r) => r.includes('f'))) errs.push(`rm: cannot remove '${t}': No such file or directory`);
          continue;
        }
        const { parent } = splitParentChild(abs);
        const parentNode = vm.vfs[parent];
        if (parentNode && !canUserAccess(vm, vm.currentUser, parentNode, 'w', asRoot)) {
          errs.push(`rm: cannot remove '${t}': Permission denied`);
          continue;
        }
        if (parentNode?.sticky && !asRoot && node.owner !== vm.currentUser && parentNode.owner !== vm.currentUser) {
          errs.push(`rm: cannot remove '${t}': Operation not permitted (sticky bit set)`);
          continue;
        }
        const res = deleteVfsPath(vm, abs, recursive);
        if (!res.ok && res.error) errs.push(`rm: ${res.error}`);
      }
      return { stdout: '', stderr: errs.join('\n'), exitCode: errs.length > 0 ? 1 : 0 };
    }

    case 'rmdir': {
      const target = rest[0];
      if (!target) return { stdout: '', stderr: 'rmdir: missing operand', exitCode: 1 };
      const abs = normalizePath(target, vm.cwd, home);
      const node = vm.vfs[abs];
      if (!node) return { stdout: '', stderr: `rmdir: failed to remove '${target}': No such file or directory`, exitCode: 1 };
      if (node.type !== 'dir') return { stdout: '', stderr: `rmdir: failed to remove '${target}': Not a directory`, exitCode: 1 };
      if (node.children && node.children.length > 0) {
        return { stdout: '', stderr: `rmdir: failed to remove '${target}': Directory not empty`, exitCode: 1 };
      }
      deleteVfsPath(vm, abs, false);
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'ln': {
      let symbolic = false;
      const paths: string[] = [];
      for (const a of rest) {
        if (a.startsWith('-')) {
          if (a.includes('s')) symbolic = true;
        } else {
          paths.push(a);
        }
      }
      if (paths.length < 2) return { stdout: '', stderr: 'ln: missing file operand', exitCode: 1 };
      const [targetRaw, linkRaw] = paths;
      const linkAbs = normalizePath(linkRaw, vm.cwd, home);
      const { parent, name } = splitParentChild(linkAbs);
      const pNode = vm.vfs[parent];
      if (!pNode || pNode.type !== 'dir') return { stdout: '', stderr: `ln: failed to create link '${linkRaw}': No such file or directory`, exitCode: 1 };

      if (symbolic) {
        vm.vfs[linkAbs] = {
          type: 'symlink',
          inodeId: vm.nextInode++,
          mode: 0o777,
          owner: asRoot ? 'root' : vm.currentUser,
          group: asRoot ? 'root' : vm.currentUser,
          target: targetRaw,
          mtime: 'Nov 20 12:15',
          size: targetRaw.length,
        };
        if (pNode.children && !pNode.children.includes(name)) pNode.children.push(name);
        return { stdout: '', stderr: '', exitCode: 0 };
      }

      const targetAbs = normalizePath(targetRaw, vm.cwd, home);
      const targetNode = vm.vfs[targetAbs];
      if (!targetNode) return { stdout: '', stderr: `ln: failed to access '${targetRaw}': No such file or directory`, exitCode: 1 };
      if (targetNode.type === 'dir') return { stdout: '', stderr: `ln: ${targetRaw}: hard link not allowed for directory`, exitCode: 1 };
      vm.vfs[linkAbs] = { ...targetNode };
      if (pNode.children && !pNode.children.includes(name)) pNode.children.push(name);
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'readlink': {
      const target = rest.find((a) => !a.startsWith('-'));
      if (!target) return { stdout: '', stderr: 'readlink: missing operand', exitCode: 1 };
      const abs = normalizePath(target, vm.cwd, home);
      const node = vm.vfs[abs];
      if (!node || node.type !== 'symlink') return { stdout: '', stderr: '', exitCode: 1 };
      return { stdout: node.target || '', stderr: '', exitCode: 0 };
    }

    case 'stat': {
      const target = rest[0];
      if (!target) return { stdout: '', stderr: 'stat: missing operand', exitCode: 1 };
      const abs = normalizePath(target, vm.cwd, home);
      const node = vm.vfs[abs];
      if (!node) return { stdout: '', stderr: `stat: cannot statx '${target}': No such file or directory`, exitCode: 1 };
      const permOctal = ((node.suid ? 4 : 0) + (node.sgid ? 2 : 0) + (node.sticky ? 1 : 0)) + (node.mode & 0o777).toString(8).padStart(3, '0');
      return {
        stdout: `  File: ${target}${node.type === 'symlink' ? ` -> ${node.target}` : ''}
  Size: ${node.size}\t\tInode: ${node.inodeId}\t\tLinks: ${countHardLinks(vm, node.inodeId)}
Access: (${permOctal}/${formatModeString(node)})  Uid: (${vm.users[node.owner]?.uid ?? 0}/${node.owner})   Gid: (${vm.groups[node.group]?.gid ?? 0}/${node.group})`,
        stderr: '',
        exitCode: 0,
      };
    }

    case 'tree': {
      const pkg = vm.packages['tree'];
      if (pkg && !pkg.installed) {
        return { stdout: '', stderr: 'bash: tree: command not found (install with: sudo dnf install -y tree)', exitCode: 127 };
      }
      const startPath = normalizePath(rest[0] || '.', vm.cwd, home);
      const startNode = vm.vfs[startPath];
      if (!startNode || startNode.type !== 'dir') {
        return { stdout: `${rest[0] || '.'} [error opening dir]`, stderr: '', exitCode: 1 };
      }
      const lines = [rest[0] || '.'];
      const walk = (dirPath: string, prefix: string) => {
        const node = vm.vfs[dirPath];
        const children = (node?.children || []).filter((c) => !c.startsWith('.')).sort();
        children.forEach((child, idx) => {
          const isLast = idx === children.length - 1;
          const cp = dirPath === '/' ? `/${child}` : `${dirPath}/${child}`;
          lines.push(`${prefix}${isLast ? '└── ' : '├── '}${child}`);
          if (vm.vfs[cp]?.type === 'dir') {
            walk(cp, `${prefix}${isLast ? '    ' : '│   '}`);
          }
        });
      };
      walk(startPath, '');
      return { stdout: lines.join('\n'), stderr: '', exitCode: 0 };
    }

    case 'find': {
      const searchRootRaw = rest[0] && !rest[0].startsWith('-') ? rest[0] : '.';
      const searchRoot = normalizePath(searchRootRaw, vm.cwd, home);
      if (!vm.vfs[searchRoot]) {
        return { stdout: '', stderr: `find: '${searchRootRaw}': No such file or directory`, exitCode: 1 };
      }

      let namePattern: RegExp | null = null;
      let typeFilter: string | null = null;
      let userFilter: string | null = null;
      let groupFilter: string | null = null;
      let permFilter: string | null = null;

      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '-name' && rest[i + 1]) {
          const pat = rest[++i].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
          namePattern = new RegExp(`^${pat}$`);
        } else if (rest[i] === '-iname' && rest[i + 1]) {
          const pat = rest[++i].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
          namePattern = new RegExp(`^${pat}$`, 'i');
        } else if (rest[i] === '-type' && rest[i + 1]) {
          typeFilter = rest[++i];
        } else if (rest[i] === '-user' && rest[i + 1]) {
          userFilter = rest[++i];
        } else if (rest[i] === '-group' && rest[i + 1]) {
          groupFilter = rest[++i];
        } else if (rest[i] === '-perm' && rest[i + 1]) {
          permFilter = rest[++i];
        }
      }

      const matches: string[] = [];
      for (const [path, node] of Object.entries(vm.vfs)) {
        if (searchRoot !== '/' && path !== searchRoot && !path.startsWith(searchRoot + '/')) continue;
        const base = path === '/' ? '/' : path.slice(path.lastIndexOf('/') + 1);
        if (namePattern && !namePattern.test(base)) continue;
        if (typeFilter === 'f' && node.type !== 'file') continue;
        if (typeFilter === 'd' && node.type !== 'dir') continue;
        if (typeFilter === 'l' && node.type !== 'symlink') continue;
        if (userFilter && node.owner !== userFilter) continue;
        if (groupFilter && node.group !== groupFilter) continue;
        if (permFilter) {
          const special = (node.suid ? 4 : 0) + (node.sgid ? 2 : 0) + (node.sticky ? 1 : 0);
          const fullOctal = `${special}${(node.mode & 0o777).toString(8).padStart(3, '0')}`;
          const shortOctal = (node.mode & 0o777).toString(8).padStart(3, '0');
          if (permFilter !== fullOctal && permFilter !== shortOctal) continue;
        }
        matches.push(path);
      }
      return { stdout: matches.sort().join('\n'), stderr: '', exitCode: 0 };
    }

    case 'cat':
    case 'less':
    case 'more': {
      if (rest.length === 0) return { stdout: stdin, stderr: '', exitCode: 0 };
      const outputs: string[] = [];
      const errs: string[] = [];
      for (const f of rest.filter((a) => !a.startsWith('-'))) {
        const abs = normalizePath(f, vm.cwd, home);
        const found = getNode(vm, abs);
        if (!found) {
          errs.push(`${cmd}: ${f}: No such file or directory`);
          continue;
        }
        if (found.node.type === 'dir') {
          errs.push(`${cmd}: ${f}: Is a directory`);
          continue;
        }
        if (!canUserAccess(vm, vm.currentUser, found.node, 'r', asRoot)) {
          errs.push(`${cmd}: ${f}: Permission denied`);
          continue;
        }
        outputs.push((found.node.content || '').replace(/\n$/, ''));
      }
      return { stdout: outputs.join('\n'), stderr: errs.join('\n'), exitCode: errs.length > 0 ? 1 : 0 };
    }

    case 'head':
    case 'tail': {
      let count = 10;
      const files: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '-n' && rest[i + 1]) {
          count = parseInt(rest[++i], 10) || 10;
        } else if (/^-\d+$/.test(rest[i])) {
          count = parseInt(rest[i].slice(1), 10) || 10;
        } else {
          files.push(rest[i]);
        }
      }
      let text = stdin;
      if (files.length > 0) {
        const abs = normalizePath(files[0], vm.cwd, home);
        const found = getNode(vm, abs);
        if (!found) return { stdout: '', stderr: `${cmd}: cannot open '${files[0]}': No such file or directory`, exitCode: 1 };
        if (!canUserAccess(vm, vm.currentUser, found.node, 'r', asRoot)) {
          return { stdout: '', stderr: `${cmd}: cannot open '${files[0]}': Permission denied`, exitCode: 1 };
        }
        text = found.node.content || '';
      }
      const lines = text.replace(/\n$/, '').split('\n');
      const sliced = cmd === 'head' ? lines.slice(0, count) : lines.slice(-count);
      return { stdout: sliced.join('\n'), stderr: '', exitCode: 0 };
    }

    case 'wc': {
      const flagL = rest.includes('-l');
      const flagW = rest.includes('-w');
      const flagC = rest.includes('-c');
      const files = rest.filter((a) => !a.startsWith('-'));
      let text = stdin;
      if (files.length > 0) {
        const abs = normalizePath(files[0], vm.cwd, home);
        const found = getNode(vm, abs);
        if (!found) return { stdout: '', stderr: `wc: ${files[0]}: No such file or directory`, exitCode: 1 };
        text = found.node.content || '';
      }
      const lines = text ? text.replace(/\n$/, '').split('\n').length : 0;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const bytes = text.length;
      if (flagL) return { stdout: `${lines}${files[0] ? ' ' + files[0] : ''}`, stderr: '', exitCode: 0 };
      if (flagW) return { stdout: `${words}${files[0] ? ' ' + files[0] : ''}`, stderr: '', exitCode: 0 };
      if (flagC) return { stdout: `${bytes}${files[0] ? ' ' + files[0] : ''}`, stderr: '', exitCode: 0 };
      return { stdout: ` ${lines}  ${words} ${bytes}${files[0] ? ' ' + files[0] : ''}`, stderr: '', exitCode: 0 };
    }

    case 'grep':
    case 'egrep': {
      let ignoreCase = false;
      let invert = false;
      let lineNumbers = false;
      let countOnly = false;
      const pos: string[] = [];

      for (const a of rest) {
        if (a.startsWith('-') && a.length > 1) {
          if (a.includes('i')) ignoreCase = true;
          if (a.includes('v')) invert = true;
          if (a.includes('n')) lineNumbers = true;
          if (a.includes('c')) countOnly = true;
        } else {
          pos.push(a);
        }
      }
      if (pos.length === 0) return { stdout: '', stderr: 'Usage: grep [OPTION]... PATTERNS [FILE]...', exitCode: 2 };
      const pattern = pos[0];
      const files = pos.slice(1);
      const regex = new RegExp(pattern, ignoreCase ? 'i' : '');

      let content = stdin;
      if (files.length > 0) {
        const abs = normalizePath(files[0], vm.cwd, home);
        const found = getNode(vm, abs);
        if (!found) return { stdout: '', stderr: `grep: ${files[0]}: No such file or directory`, exitCode: 2 };
        if (!canUserAccess(vm, vm.currentUser, found.node, 'r', asRoot)) {
          return { stdout: '', stderr: `grep: ${files[0]}: Permission denied`, exitCode: 2 };
        }
        content = found.node.content || '';
      }

      const lines = content.replace(/\n$/, '').split('\n');
      const matched: string[] = [];
      lines.forEach((line, idx) => {
        const isMatch = regex.test(line);
        if (invert ? !isMatch : isMatch) {
          matched.push(lineNumbers ? `${idx + 1}:${line}` : line);
        }
      });

      if (countOnly) return { stdout: String(matched.length), stderr: '', exitCode: matched.length > 0 ? 0 : 1 };
      return { stdout: matched.join('\n'), stderr: '', exitCode: matched.length > 0 ? 0 : 1 };
    }

    case 'sort': {
      const reverse = rest.includes('-r');
      const unique = rest.includes('-u');
      const numeric = rest.includes('-n');
      const file = rest.find((a) => !a.startsWith('-'));
      let text = stdin;
      if (file) {
        const found = getNode(vm, normalizePath(file, vm.cwd, home));
        if (!found) return { stdout: '', stderr: `sort: cannot read: ${file}: No such file or directory`, exitCode: 2 };
        text = found.node.content || '';
      }
      let lines = text.replace(/\n$/, '').split('\n').filter((l) => l !== '');
      lines.sort((a, b) => (numeric ? parseFloat(a) - parseFloat(b) : a.localeCompare(b)));
      if (reverse) lines.reverse();
      if (unique) lines = Array.from(new Set(lines));
      return { stdout: lines.join('\n'), stderr: '', exitCode: 0 };
    }

    case 'uniq': {
      const count = rest.includes('-c');
      const lines = stdin.replace(/\n$/, '').split('\n').filter((l) => l !== '');
      const result: string[] = [];
      for (const line of lines) {
        if (result.length === 0 || result[result.length - 1] !== line) {
          result.push(line);
        }
      }
      if (!count) return { stdout: result.join('\n'), stderr: '', exitCode: 0 };
      const counted: string[] = [];
      let prev = '';
      let n = 0;
      for (const line of lines) {
        if (line === prev) {
          n++;
        } else {
          if (n > 0) counted.push(`${String(n).padStart(7, ' ')} ${prev}`);
          prev = line;
          n = 1;
        }
      }
      if (n > 0) counted.push(`${String(n).padStart(7, ' ')} ${prev}`);
      return { stdout: counted.join('\n'), stderr: '', exitCode: 0 };
    }

    case 'cut': {
      let delim = '\t';
      let fields: number[] = [];
      const files: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '-d' && rest[i + 1]) {
          delim = rest[++i];
        } else if (rest[i].startsWith('-d') && rest[i].length > 2) {
          delim = rest[i].slice(2);
        } else if (rest[i] === '-f' && rest[i + 1]) {
          fields = rest[++i].split(',').map((n) => parseInt(n, 10));
        } else if (rest[i].startsWith('-f') && rest[i].length > 2) {
          fields = rest[i].slice(2).split(',').map((n) => parseInt(n, 10));
        } else {
          files.push(rest[i]);
        }
      }
      let text = stdin;
      if (files[0]) {
        const found = getNode(vm, normalizePath(files[0], vm.cwd, home));
        if (!found) return { stdout: '', stderr: `cut: ${files[0]}: No such file or directory`, exitCode: 1 };
        text = found.node.content || '';
      }
      const out = text
        .replace(/\n$/, '')
        .split('\n')
        .map((line) => {
          const cols = line.split(delim);
          return fields.map((f) => cols[f - 1] ?? '').join(delim);
        })
        .join('\n');
      return { stdout: out, stderr: '', exitCode: 0 };
    }

    case 'tr': {
      const args = rest.filter((a) => !a.startsWith('-'));
      if (args.length < 2) return { stdout: '', stderr: 'tr: missing operand', exitCode: 1 };
      const [fromSet, toSet] = args;
      let out = stdin;
      if (fromSet === '[:lower:]' && toSet === '[:upper:]') out = out.toUpperCase();
      else if (fromSet === '[:upper:]' && toSet === '[:lower:]') out = out.toLowerCase();
      else if (fromSet === 'a-z' && toSet === 'A-Z') out = out.toUpperCase();
      else if (fromSet === 'A-Z' && toSet === 'a-z') out = out.toLowerCase();
      else {
        for (let i = 0; i < fromSet.length; i++) {
          const rep = toSet[Math.min(i, toSet.length - 1)] || '';
          out = out.split(fromSet[i]).join(rep);
        }
      }
      return { stdout: out.replace(/\n$/, ''), stderr: '', exitCode: 0 };
    }

    case 'sed': {
      const inPlace = rest.includes('-i');
      const args = rest.filter((a) => a !== '-i');
      const expr = args[0] || '';
      const file = args[1];
      const match = expr.match(/^s(.)(.*?)\1(.*?)\1([g]?)$/);
      if (!match) return { stdout: '', stderr: `sed: invalid expression '${expr}'`, exitCode: 1 };
      const [, , findStr, replStr, flags] = match;
      let text = stdin;
      let absFile = '';
      if (file) {
        absFile = normalizePath(file, vm.cwd, home);
        const found = getNode(vm, absFile);
        if (!found) return { stdout: '', stderr: `sed: can't read ${file}: No such file or directory`, exitCode: 2 };
        text = found.node.content || '';
      }
      const regex = new RegExp(findStr, flags.includes('g') ? 'g' : '');
      const transformed = text
        .split('\n')
        .map((line) => line.replace(regex, replStr))
        .join('\n');
      if (inPlace && absFile) {
        const node = vm.vfs[absFile];
        if (!node || !canUserAccess(vm, vm.currentUser, node, 'w', asRoot)) {
          return { stdout: '', stderr: `sed: couldn't open temporary file: Permission denied`, exitCode: 4 };
        }
        node.content = transformed;
        node.size = transformed.length;
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      return { stdout: transformed.replace(/\n$/, ''), stderr: '', exitCode: 0 };
    }

    case 'tee': {
      const append = rest.includes('-a');
      const file = rest.find((a) => !a.startsWith('-'));
      if (file) {
        const err = writeRedirection(vm, file, stdin + '\n', append, asRoot);
        if (err) return { stdout: '', stderr: err, exitCode: 1 };
      }
      return { stdout: stdin, stderr: '', exitCode: 0 };
    }

    case 'vim':
    case 'vi':
    case 'nano': {
      const fileArg = rest.find((a) => !a.startsWith('-'));
      if (!fileArg) {
        return { stdout: '', stderr: `${cmd}: specify a file path (e.g. ${cmd} /etc/hosts)`, exitCode: 1 };
      }
      const abs = normalizePath(fileArg, vm.cwd, home);
      const found = getNode(vm, abs);
      if (found && found.node.type === 'dir') {
        return { stdout: '', stderr: `${cmd}: ${fileArg}: Is a directory`, exitCode: 1 };
      }
      const readOnly = found
        ? !canUserAccess(vm, vm.currentUser, found.node, 'w', asRoot)
        : !canUserAccess(vm, vm.currentUser, vm.vfs[splitParentChild(abs).parent] || vm.vfs['/'], 'w', asRoot);

      return {
        stdout: `Opened ${abs} in ${cmd === 'nano' ? 'nano' : 'vim'}${readOnly ? ' [readonly - use sudo to save]' : ''}`,
        stderr: '',
        exitCode: 0,
        openEditor: {
          mode: cmd === 'nano' ? 'nano' : 'vim',
          filePath: abs,
          content: found?.node.content || '',
          isNewFile: !found,
          readOnly,
          elevated: asRoot,
        },
      };
    }

    case 'groupadd': {
      if (!asRoot) return { stdout: '', stderr: 'groupadd: Permission denied. (use sudo)', exitCode: 1 };
      let customGid: number | undefined;
      let groupName = '';
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '-g' && rest[i + 1]) {
          customGid = parseInt(rest[++i], 10);
        } else if (!rest[i].startsWith('-')) {
          groupName = rest[i];
        }
      }
      if (!groupName) return { stdout: '', stderr: 'groupadd: missing group name', exitCode: 2 };
      if (vm.groups[groupName]) return { stdout: '', stderr: `groupadd: group '${groupName}' already exists`, exitCode: 9 };
      const gid = customGid ?? vm.nextGid++;
      vm.groups[groupName] = { name: groupName, gid, members: [] };
      syncSystemAuthFiles(vm);
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'useradd': {
      if (!asRoot) return { stdout: '', stderr: 'useradd: Permission denied. (use sudo)', exitCode: 1 };
      let uid: number | undefined;
      let shell = '/bin/bash';
      let comment = '';
      let customHome = '';
      let suppGroups: string[] = [];
      let username = '';

      for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === '-u' && rest[i + 1]) uid = parseInt(rest[++i], 10);
        else if (a === '-s' && rest[i + 1]) shell = rest[++i];
        else if (a === '-c' && rest[i + 1]) comment = rest[++i];
        else if (a === '-d' && rest[i + 1]) customHome = rest[++i];
        else if (a === '-G' && rest[i + 1]) suppGroups = rest[++i].split(',').filter(Boolean);
        else if (!a.startsWith('-')) username = a;
      }

      if (!username) return { stdout: '', stderr: 'useradd: missing username', exitCode: 2 };
      if (vm.users[username]) return { stdout: '', stderr: `useradd: user '${username}' already exists`, exitCode: 9 };

      for (const g of suppGroups) {
        if (!vm.groups[g]) return { stdout: '', stderr: `useradd: group '${g}' does not exist`, exitCode: 6 };
      }

      const newUid = uid ?? vm.nextUid++;
      const newGid = vm.groups[username]?.gid ?? (newUid >= 1000 ? newUid : vm.nextGid++);
      const userHome = customHome || `/home/${username}`;

      vm.groups[username] = vm.groups[username] || { name: username, gid: newGid, members: [username] };
      for (const g of suppGroups) {
        if (!vm.groups[g].members.includes(username)) vm.groups[g].members.push(username);
      }

      vm.users[username] = {
        username,
        uid: newUid,
        gid: newGid,
        home: userHome,
        shell,
        comment,
        passwordSet: false,
        locked: false,
        minDays: 0,
        maxDays: 99999,
        warnDays: 7,
        expireDate: '',
        groups: suppGroups,
      };

      createVfsDir(vm, userHome, username, username, 0o700, true);
      createVfsFile(vm, `${userHome}/.bashrc`, '# .bashrc\n', username, username, 0o644);
      syncSystemAuthFiles(vm);
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'usermod': {
      if (!asRoot) return { stdout: '', stderr: 'usermod: Permission denied. (use sudo)', exitCode: 1 };
      let append = false;
      let groupsArg: string[] | null = null;
      let shellArg: string | null = null;
      let lockFlag: boolean | null = null;
      let commentArg: string | null = null;
      let username = '';

      for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === '-a') append = true;
        else if (a === '-aG' && rest[i + 1]) {
          append = true;
          groupsArg = rest[++i].split(',').filter(Boolean);
        } else if (a === '-G' && rest[i + 1]) {
          groupsArg = rest[++i].split(',').filter(Boolean);
        } else if (a === '-s' && rest[i + 1]) {
          shellArg = rest[++i];
        } else if (a === '-c' && rest[i + 1]) {
          commentArg = rest[++i];
        } else if (a === '-L') {
          lockFlag = true;
        } else if (a === '-U') {
          lockFlag = false;
        } else if (!a.startsWith('-')) {
          username = a;
        }
      }

      const u = vm.users[username];
      if (!u) return { stdout: '', stderr: `usermod: user '${username}' does not exist`, exitCode: 6 };

      if (groupsArg) {
        for (const g of groupsArg) {
          if (!vm.groups[g]) return { stdout: '', stderr: `usermod: group '${g}' does not exist`, exitCode: 6 };
        }
        if (!append) {
          for (const oldG of u.groups) {
            if (vm.groups[oldG]) vm.groups[oldG].members = vm.groups[oldG].members.filter((m) => m !== username);
          }
          u.groups = [...groupsArg];
        } else {
          u.groups = Array.from(new Set([...u.groups, ...groupsArg]));
        }
        for (const g of groupsArg) {
          if (!vm.groups[g].members.includes(username)) vm.groups[g].members.push(username);
        }
      }

      if (shellArg) u.shell = shellArg;
      if (commentArg !== null) u.comment = commentArg;
      if (lockFlag !== null) u.locked = lockFlag;
      syncSystemAuthFiles(vm);
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'userdel': {
      if (!asRoot) return { stdout: '', stderr: 'userdel: Permission denied. (use sudo)', exitCode: 1 };
      const removeHome = rest.includes('-r');
      const username = rest.find((a) => !a.startsWith('-'));
      if (!username || !vm.users[username]) {
        return { stdout: '', stderr: `userdel: user '${username}' does not exist`, exitCode: 6 };
      }
      const userHome = vm.users[username].home;
      delete vm.users[username];
      for (const grp of Object.values(vm.groups)) {
        grp.members = grp.members.filter((m) => m !== username);
      }
      if (removeHome && vm.vfs[userHome]) deleteVfsPath(vm, userHome, true);
      syncSystemAuthFiles(vm);
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'passwd': {
      const targetUser = rest.find((a) => !a.startsWith('-')) || vm.currentUser;
      const u = vm.users[targetUser];
      if (!u) return { stdout: '', stderr: `passwd: Unknown user name '${targetUser}'.`, exitCode: 1 };
      if (!asRoot && targetUser !== vm.currentUser) {
        return { stdout: '', stderr: 'passwd: Only root can specify a user name.', exitCode: 1 };
      }
      if (rest.includes('-S')) {
        const status = u.locked ? 'LK' : u.passwordSet ? 'PS' : 'NP';
        return { stdout: `${u.username} ${status} 2026-11-20 ${u.minDays} ${u.maxDays} ${u.warnDays} -1`, stderr: '', exitCode: 0 };
      }
      if (rest.includes('-l')) {
        u.locked = true;
        syncSystemAuthFiles(vm);
        return { stdout: `Locking password for user ${targetUser}.\npasswd: Success`, stderr: '', exitCode: 0 };
      }
      if (rest.includes('-u')) {
        u.locked = false;
        syncSystemAuthFiles(vm);
        return { stdout: `Unlocking password for user ${targetUser}.\npasswd: Success`, stderr: '', exitCode: 0 };
      }
      u.passwordSet = true;
      u.locked = false;
      syncSystemAuthFiles(vm);
      return { stdout: `Changing password for user ${targetUser}.\npasswd: all authentication tokens updated successfully.`, stderr: '', exitCode: 0 };
    }

    case 'chage': {
      let listOnly = false;
      let maxDays: number | undefined;
      let minDays: number | undefined;
      let warnDays: number | undefined;
      let expireDate: string | undefined;
      let username = '';

      for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === '-l') listOnly = true;
        else if (a === '-M' && rest[i + 1]) maxDays = parseInt(rest[++i], 10);
        else if (a === '-m' && rest[i + 1]) minDays = parseInt(rest[++i], 10);
        else if (a === '-W' && rest[i + 1]) warnDays = parseInt(rest[++i], 10);
        else if (a === '-E' && rest[i + 1]) expireDate = rest[++i];
        else if (!a.startsWith('-')) username = a;
      }

      const u = vm.users[username];
      if (!u) return { stdout: '', stderr: `chage: user '${username}' does not exist in /etc/passwd`, exitCode: 1 };
      if (listOnly) {
        return {
          stdout: `Last password change\t\t\t\t\t: Nov 20, 2026
Password expires\t\t\t\t\t: ${u.maxDays < 99999 ? `${u.maxDays} days after last change` : 'never'}
Account expires\t\t\t\t\t\t: ${u.expireDate || 'never'}
Minimum number of days between password change\t\t: ${u.minDays}
Maximum number of days between password change\t\t: ${u.maxDays}
Number of days of warning before password expires\t: ${u.warnDays}`,
          stderr: '',
          exitCode: 0,
        };
      }
      if (!asRoot) return { stdout: '', stderr: 'chage: Permission denied.', exitCode: 1 };
      if (maxDays !== undefined) u.maxDays = maxDays;
      if (minDays !== undefined) u.minDays = minDays;
      if (warnDays !== undefined) u.warnDays = warnDays;
      if (expireDate !== undefined) u.expireDate = expireDate;
      syncSystemAuthFiles(vm);
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'su': {
      const targetUser = rest.find((a) => a !== '-') || 'root';
      const u = vm.users[targetUser];
      if (!u) return { stdout: '', stderr: `su: user ${targetUser} does not exist`, exitCode: 1 };
      if (!asRoot && targetUser === 'root') {
        return { stdout: '', stderr: 'su: Authentication failure (use sudo -i)', exitCode: 1 };
      }
      vm.currentUser = targetUser;
      vm.env.USER = targetUser;
      vm.env.HOME = u.home;
      if (rest.includes('-')) vm.cwd = u.home;
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'exit': {
      if (vm.sshStack.length > 0) {
        const closedHost = vm.hostname;
        const frame = vm.sshStack.pop()!;
        vm.activeHostKey = (frame.hostKey as 'workstation' | 'servera' | 'serverb') || 'workstation';
        vm.hostname = frame.hostname;
        vm.currentUser = frame.user;
        vm.cwd = frame.cwd;
        vm.env.USER = frame.user;
        vm.env.HOME = vm.users[frame.user]?.home || '/home/student';
        return { stdout: `logout\nConnection to ${closedHost} closed.`, stderr: '', exitCode: 0 };
      }
      if (vm.currentUser !== 'student') {
        vm.currentUser = 'student';
        vm.cwd = '/home/student';
        vm.env.USER = 'student';
        vm.env.HOME = '/home/student';
        return { stdout: 'logout', stderr: '', exitCode: 0 };
      }
      return { stdout: 'Use Reset VM in the top bar to restart your lab session.', stderr: '', exitCode: 0 };
    }

    case 'umask': {
      if (!rest[0]) {
        return { stdout: vm.umask.toString(8).padStart(4, '0'), stderr: '', exitCode: 0 };
      }
      if (!/^[0-7]{3,4}$/.test(rest[0])) {
        return { stdout: '', stderr: `bash: umask: ${rest[0]}: octal number out of range`, exitCode: 1 };
      }
      vm.umask = parseInt(rest[0], 8);
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'chmod': {
      let recursive = false;
      const pos: string[] = [];
      for (const a of rest) {
        if (a === '-R' || a === '--recursive') recursive = true;
        else pos.push(a);
      }
      if (pos.length < 2) return { stdout: '', stderr: 'chmod: missing operand', exitCode: 1 };
      const [modeExpr, ...targets] = pos;
      const errs: string[] = [];

      const applyToPath = (p: string) => {
        const node = vm.vfs[p];
        if (!node) {
          errs.push(`chmod: cannot access '${p}': No such file or directory`);
          return;
        }
        if (!asRoot && node.owner !== vm.currentUser) {
          errs.push(`chmod: changing permissions of '${p}': Operation not permitted`);
          return;
        }
        if (!applyChmodMode(node, modeExpr)) {
          errs.push(`chmod: invalid mode: '${modeExpr}'`);
          return;
        }
        if (recursive && node.type === 'dir' && node.children) {
          for (const child of node.children) {
            applyToPath(p === '/' ? `/${child}` : `${p}/${child}`);
          }
        }
      };

      for (const t of targets) {
        applyToPath(normalizePath(t, vm.cwd, home));
      }
      return { stdout: '', stderr: errs.join('\n'), exitCode: errs.length > 0 ? 1 : 0 };
    }

    case 'chown':
    case 'chgrp': {
      let recursive = false;
      const pos: string[] = [];
      for (const a of rest) {
        if (a === '-R' || a === '--recursive') recursive = true;
        else pos.push(a);
      }
      if (pos.length < 2) return { stdout: '', stderr: `${cmd}: missing operand`, exitCode: 1 };
      const [spec, ...targets] = pos;
      let newOwner: string | null = null;
      let newGroup: string | null = null;

      if (cmd === 'chgrp') {
        newGroup = spec;
      } else if (spec.includes(':')) {
        const [o, g] = spec.split(':');
        if (o) newOwner = o;
        if (g) newGroup = g;
      } else {
        newOwner = spec;
      }

      if (newOwner && !vm.users[newOwner]) return { stdout: '', stderr: `${cmd}: invalid user: '${newOwner}'`, exitCode: 1 };
      if (newGroup && !vm.groups[newGroup]) return { stdout: '', stderr: `${cmd}: invalid group: '${newGroup}'`, exitCode: 1 };
      if (!asRoot && newOwner) return { stdout: '', stderr: `${cmd}: changing ownership: Operation not permitted`, exitCode: 1 };

      const errs: string[] = [];
      const applyToPath = (p: string) => {
        const node = vm.vfs[p];
        if (!node) {
          errs.push(`${cmd}: cannot access '${p}': No such file or directory`);
          return;
        }
        if (newOwner) node.owner = newOwner;
        if (newGroup) node.group = newGroup;
        if (recursive && node.type === 'dir' && node.children) {
          for (const child of node.children) {
            applyToPath(p === '/' ? `/${child}` : `${p}/${child}`);
          }
        }
      };
      for (const t of targets) applyToPath(normalizePath(t, vm.cwd, home));
      return { stdout: '', stderr: errs.join('\n'), exitCode: errs.length > 0 ? 1 : 0 };
    }

    case 'ps': {
      const argStr = rest.join(' ');
      if (argStr.includes('ef') || argStr.includes('-e')) {
        const header = 'UID          PID    PPID  C STIME TTY          TIME CMD';
        const rows = vm.processes.map(
          (p) =>
            `${p.user.padEnd(12, ' ')} ${String(p.pid).padStart(5, ' ')} ${String(p.ppid).padStart(6, ' ')}  0 ${p.startTime} ?        00:00:00 ${p.command}`
        );
        return { stdout: [header, ...rows].join('\n'), stderr: '', exitCode: 0 };
      }
      const header = 'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND';
      const rows = vm.processes.map(
        (p) =>
          `${p.user.padEnd(12, ' ')} ${String(p.pid).padStart(4, ' ')} ${p.cpu.toFixed(1).padStart(4, ' ')} ${p.mem.toFixed(1).padStart(4, ' ')}  24512  5120 ?        ${p.stat.padEnd(4, ' ')} ${p.startTime}   0:00 ${p.command}`
      );
      return { stdout: [header, ...rows].join('\n'), stderr: '', exitCode: 0 };
    }

    case 'top': {
      const sorted = [...vm.processes].sort((a, b) => b.cpu - a.cpu).slice(0, 8);
      const header = `top - 12:15:32 up 3:15,  1 user,  load average: 0.08, 0.05, 0.01
Tasks: ${vm.processes.length} total,   ${vm.processes.filter((p) => p.stat.startsWith('R')).length} running,   ${vm.processes.length - vm.processes.filter((p) => p.stat.startsWith('R')).length} sleeping
%Cpu(s):  ${sorted[0]?.cpu > 10 ? '49.2' : '1.4'} us,  0.5 sy,  0.0 ni, ${sorted[0]?.cpu > 10 ? '50.3' : '98.1'} id
MiB Mem :   3891.2 total,   2150.4 free,    620.8 used,   1120.0 buff/cache

    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND`;
      const rows = sorted.map(
        (p) =>
          `${String(p.pid).padStart(7, ' ')} ${p.user.padEnd(9, ' ')} ${String(20 + p.nice).padStart(2, ' ')} ${String(p.nice).padStart(3, ' ')}   24512   5120   3100 ${p.stat[0]}  ${p.cpu.toFixed(1).padStart(4, ' ')}  ${p.mem.toFixed(1).padStart(4, ' ')}   0:01.42 ${p.command}`
      );
      return { stdout: [header, ...rows].join('\n'), stderr: '', exitCode: 0 };
    }

    case 'pgrep': {
      const showLong = rest.includes('-l');
      const pattern = rest.find((a) => !a.startsWith('-'));
      if (!pattern) return { stdout: '', stderr: 'pgrep: no matching criteria specified', exitCode: 2 };
      const re = new RegExp(pattern, 'i');
      const hits = vm.processes.filter((p) => re.test(p.command));
      if (hits.length === 0) return { stdout: '', stderr: '', exitCode: 1 };
      return {
        stdout: hits.map((p) => (showLong ? `${p.pid} ${p.command}` : String(p.pid))).join('\n'),
        stderr: '',
        exitCode: 0,
      };
    }

    case 'pkill': {
      const pattern = rest.find((a) => !a.startsWith('-'));
      if (!pattern) return { stdout: '', stderr: 'pkill: no matching criteria specified', exitCode: 2 };
      const re = new RegExp(pattern, 'i');
      const toKill = vm.processes.filter((p) => re.test(p.command) && !p.protected && (asRoot || p.user === vm.currentUser));
      if (toKill.length === 0) return { stdout: '', stderr: '', exitCode: 1 };
      const pids = new Set(toKill.map((p) => p.pid));
      vm.processes = vm.processes.filter((p) => !pids.has(p.pid));
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'kill': {
      if (rest[0] === '-l') {
        return { stdout: ' 1) SIGHUP   2) SIGINT   9) SIGKILL  15) SIGTERM  18) SIGCONT  19) SIGSTOP', stderr: '', exitCode: 0 };
      }
      const pidArg = rest.find((a) => /^\d+$/.test(a));
      if (!pidArg) return { stdout: '', stderr: 'kill: usage: kill [-s sigspec | -signum] pid', exitCode: 2 };
      const pid = parseInt(pidArg, 10);
      const target = vm.processes.find((p) => p.pid === pid);
      if (!target) return { stdout: '', stderr: `bash: kill: (${pid}) - No such process`, exitCode: 1 };
      if (!asRoot && target.user !== vm.currentUser) {
        return { stdout: '', stderr: `bash: kill: (${pid}) - Operation not permitted`, exitCode: 1 };
      }
      if (target.protected) {
        return { stdout: '', stderr: `kill: refusing to terminate critical system PID ${pid}`, exitCode: 1 };
      }
      vm.processes = vm.processes.filter((p) => p.pid !== pid);
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'nice': {
      let niceness = 10;
      const cmdParts: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '-n' && rest[i + 1]) {
          niceness = parseInt(rest[++i], 10);
        } else {
          cmdParts.push(rest[i]);
        }
      }
      if (!cmdParts.length) return { stdout: String(niceness), stderr: '', exitCode: 0 };
      if (niceness < 0 && !asRoot) return { stdout: '', stderr: 'nice: cannot set niceness: Permission denied', exitCode: 125 };
      const pid = vm.nextPid++;
      vm.processes.push({
        pid,
        ppid: 1410,
        user: asRoot ? 'root' : vm.currentUser,
        cpu: 0.2,
        mem: 0.1,
        stat: niceness > 0 ? 'SN' : 'S<',
        nice: niceness,
        command: cmdParts.join(' '),
        startTime: '12:16',
        isBackgroundJob: true,
        jobId: vm.processes.filter((p) => p.isBackgroundJob).length + 1,
      });
      return { stdout: `Started '${cmdParts.join(' ')}' with PID ${pid} (nice=${niceness})`, stderr: '', exitCode: 0 };
    }

    case 'renice': {
      let niceness = 0;
      let pid = 0;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '-n' && rest[i + 1]) niceness = parseInt(rest[++i], 10);
        else if (rest[i] === '-p' && rest[i + 1]) pid = parseInt(rest[++i], 10);
        else if (/^-?\d+$/.test(rest[i]) && niceness === 0) niceness = parseInt(rest[i], 10);
        else if (/^\d+$/.test(rest[i])) pid = parseInt(rest[i], 10);
      }
      const proc = vm.processes.find((p) => p.pid === pid);
      if (!proc) return { stdout: '', stderr: `renice: failed to get priority for ${pid}: No such process`, exitCode: 1 };
      if (niceness < proc.nice && !asRoot) return { stdout: '', stderr: 'renice: failed to set priority: Permission denied', exitCode: 1 };
      const oldNice = proc.nice;
      proc.nice = niceness;
      return { stdout: `${pid} (process ID) old priority ${oldNice}, new priority ${niceness}`, stderr: '', exitCode: 0 };
    }

    case 'jobs': {
      const bg = vm.processes.filter((p) => p.isBackgroundJob);
      if (bg.length === 0) return { stdout: '', stderr: '', exitCode: 0 };
      return {
        stdout: bg.map((p) => `[${p.jobId}]+  ${p.stopped ? 'Stopped' : 'Running'}                 ${p.command} &`).join('\n'),
        stderr: '',
        exitCode: 0,
      };
    }

    case 'systemctl': {
      const nowFlag = rest.includes('--now');
      const filtered = rest.filter((a) => !a.startsWith('-'));
      const subCmd = filtered[0];
      const rawUnit = filtered[1];
      const unitName = rawUnit ? (rawUnit.endsWith('.service') ? rawUnit : `${rawUnit}.service`) : '';

      if (!subCmd || subCmd === 'list-units') {
        const rows = Object.values(vm.units)
          .filter((u) => u.activeState === 'active')
          .map((u) => `  ${u.name.padEnd(24, ' ')} ${u.loadState.padEnd(8, ' ')} ${u.activeState.padEnd(8, ' ')} ${u.subState.padEnd(9, ' ')} ${u.description}`);
        return { stdout: ['  UNIT                     LOAD     ACTIVE   SUB       DESCRIPTION', ...rows].join('\n'), stderr: '', exitCode: 0 };
      }

      if (subCmd === 'list-unit-files') {
        const rows = Object.values(vm.units).map((u) => `${u.name.padEnd(28, ' ')} ${u.unitFileState}`);
        return { stdout: ['UNIT FILE                    STATE', ...rows].join('\n'), stderr: '', exitCode: 0 };
      }

      if (subCmd === 'daemon-reload') {
        if (!asRoot) return { stdout: '', stderr: 'Interactive authentication required.', exitCode: 1 };
        return { stdout: '', stderr: '', exitCode: 0 };
      }

      const unit = vm.units[unitName];
      if (!unit) {
        return { stdout: '', stderr: `Unit ${unitName} could not be found.`, exitCode: 4 };
      }

      if (subCmd === 'status') {
        return {
          stdout: `● ${unit.name} - ${unit.description}
     Loaded: ${unit.loadState} (${unit.unitFileState}; preset: disabled)
     Active: ${unit.activeState} (${unit.subState}) since Fri 2026-11-20 09:00:02 EST
   Main PID: ${unit.pid ?? '-'}`,
          stderr: '',
          exitCode: unit.activeState === 'active' ? 0 : 3,
        };
      }

      if (subCmd === 'is-active') {
        return { stdout: unit.activeState, stderr: '', exitCode: unit.activeState === 'active' ? 0 : 3 };
      }
      if (subCmd === 'is-enabled') {
        return { stdout: unit.unitFileState, stderr: '', exitCode: unit.unitFileState === 'enabled' ? 0 : 1 };
      }

      if (!asRoot) {
        return { stdout: '', stderr: `Failed to ${subCmd} ${unit.name}: Access denied (use sudo)`, exitCode: 1 };
      }

      if (subCmd === 'unmask') {
        unit.loadState = 'loaded';
        unit.unitFileState = 'disabled';
        return { stdout: `Removed "/etc/systemd/system/${unit.name}".`, stderr: '', exitCode: 0 };
      }

      if (subCmd === 'mask') {
        unit.loadState = 'masked';
        unit.unitFileState = 'masked';
        unit.activeState = 'inactive';
        unit.subState = 'dead';
        unit.pid = null;
        unit.ports = [];
        return { stdout: `Created symlink /etc/systemd/system/${unit.name} -> /dev/null.`, stderr: '', exitCode: 0 };
      }

      if (unit.loadState === 'masked' && (subCmd === 'start' || subCmd === 'enable' || subCmd === 'restart')) {
        return { stdout: '', stderr: `Failed to ${subCmd} ${unit.name}: Unit ${unit.name} is masked.`, exitCode: 1 };
      }

      if (unit.packageRequired && !vm.packages[unit.packageRequired]?.installed) {
        return {
          stdout: '',
          stderr: `Unit ${unit.name} not installed. Run: sudo dnf install -y ${unit.packageRequired}`,
          exitCode: 5,
        };
      }

      const startUnit = () => {
        unit.activeState = 'active';
        unit.subState = 'running';
        if (!unit.pid) unit.pid = vm.nextPid++;
        if (unit.name === 'httpd.service' || unit.name === 'nginx.service') unit.ports = ['0.0.0.0:80'];
        if (unit.name === 'sshd.service') {
          const sshdCfg = vm.vfs['/etc/ssh/sshd_config']?.content || '';
          const portMatch = sshdCfg.match(/^\s*Port\s+(\d+)/m);
          const port = portMatch ? portMatch[1] : '22';
          unit.ports = [`0.0.0.0:${port}`];
        }
        vm.journal.push({
          timestamp: 'Nov 20 12:16:01',
          unit: unit.name,
          priority: 'info',
          pid: unit.pid,
          message: `Started ${unit.description}.`,
        });
      };

      const stopUnit = () => {
        unit.activeState = 'inactive';
        unit.subState = 'dead';
        unit.pid = null;
        unit.ports = [];
      };

      if (subCmd === 'start') startUnit();
      else if (subCmd === 'stop') stopUnit();
      else if (subCmd === 'restart' || subCmd === 'reload') {
        stopUnit();
        startUnit();
      } else if (subCmd === 'enable') {
        unit.unitFileState = 'enabled';
        if (nowFlag) startUnit();
        return {
          stdout: `Created symlink /etc/systemd/system/multi-user.target.wants/${unit.name} -> /usr/lib/systemd/system/${unit.name}.`,
          stderr: '',
          exitCode: 0,
        };
      } else if (subCmd === 'disable') {
        unit.unitFileState = 'disabled';
        if (nowFlag) stopUnit();
        return {
          stdout: `Removed "/etc/systemd/system/multi-user.target.wants/${unit.name}".`,
          stderr: '',
          exitCode: 0,
        };
      } else {
        return { stdout: '', stderr: `Unknown operation ${subCmd}.`, exitCode: 1 };
      }

      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'ssh-keygen': {
      let keyType = 'ed25519';
      let outFile = `${home}/.ssh/id_ed25519`;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '-t' && rest[i + 1]) {
          keyType = rest[++i];
          if (!rest.includes('-f')) outFile = `${home}/.ssh/id_${keyType}`;
        } else if (rest[i] === '-f' && rest[i + 1]) {
          outFile = normalizePath(rest[++i], vm.cwd, home);
        }
      }
      createVfsDir(vm, `${home}/.ssh`, vm.currentUser, vm.currentUser, 0o700, true);
      createVfsFile(vm, outFile, `-----BEGIN OPENSSH PRIVATE KEY-----\n[simulated-${keyType}-private-key]\n-----END OPENSSH PRIVATE KEY-----\n`, vm.currentUser, vm.currentUser, 0o600);
      createVfsFile(vm, `${outFile}.pub`, `ssh-${keyType} AAAAC3NzaC1lZDI1NTE5AAAAIRH124LabKey ${vm.currentUser}@${vm.hostname}\n`, vm.currentUser, vm.currentUser, 0o644);
      vm.sshKeysGenerated[vm.currentUser] = Array.from(new Set([...(vm.sshKeysGenerated[vm.currentUser] || []), outFile]));
      return {
        stdout: `Generating public/private ${keyType} key pair.
Your identification has been saved in ${outFile}
Your public key has been saved in ${outFile}.pub`,
        stderr: '',
        exitCode: 0,
      };
    }

    case 'ssh-copy-id': {
      const target = rest.find((a) => !a.startsWith('-'));
      if (!target) return { stdout: '', stderr: 'Usage: ssh-copy-id [user@]hostname', exitCode: 1 };
      const keys = vm.sshKeysGenerated[vm.currentUser] || [];
      if (keys.length === 0) {
        return { stdout: '', stderr: 'ssh-copy-id: ERROR: No identities found (run ssh-keygen first)', exitCode: 1 };
      }
      const [remoteUser, remoteHost] = target.includes('@') ? target.split('@') : [vm.currentUser, target];
      const matchedRemote = Object.values(vm.remotes).find((r) => r.hostname === remoteHost || r.hostname.startsWith(remoteHost + '.') || r.ip === remoteHost);
      if (!matchedRemote) {
        return { stdout: '', stderr: `ssh: Could not resolve hostname ${remoteHost}`, exitCode: 255 };
      }
      const pubContent = vm.vfs[`${keys[0]}.pub`]?.content || '';
      matchedRemote.sshAuthorizedKeys[remoteUser] = matchedRemote.sshAuthorizedKeys[remoteUser] || [];
      matchedRemote.sshAuthorizedKeys[remoteUser].push(pubContent.trim());
      if (!vm.sshCopiedTo.includes(`${remoteUser}@${matchedRemote.hostname}`)) {
        vm.sshCopiedTo.push(`${remoteUser}@${matchedRemote.hostname}`);
      }
      return {
        stdout: `Number of key(s) added: 1\n\nNow try logging into the machine, with: "ssh '${target}'"`,
        stderr: '',
        exitCode: 0,
      };
    }

    case 'ssh': {
      const target = rest.find((a) => !a.startsWith('-'));
      if (!target) return { stdout: '', stderr: 'usage: ssh [user@]hostname [command]', exitCode: 255 };
      const [remoteUser, remoteHost] = target.includes('@') ? target.split('@') : [vm.currentUser, target];
      const matchedRemote = Object.values(vm.remotes).find((r) => r.hostname === remoteHost || r.hostname.startsWith(remoteHost + '.') || r.ip === remoteHost);
      if (!matchedRemote) {
        return { stdout: '', stderr: `ssh: Could not resolve hostname ${remoteHost}`, exitCode: 255 };
      }
      const hasKey = (matchedRemote.sshAuthorizedKeys[remoteUser] || []).length > 0;
      const remoteCmdIdx = rest.indexOf(target) + 1;
      const remoteCmd = rest.slice(remoteCmdIdx).join(' ');
      if (remoteCmd) {
        let remoteOut = matchedRemote.hostname;
        if (remoteCmd.trim() === 'id') {
          remoteOut = remoteUser === 'root' ? 'uid=0(root) gid=0(root) groups=0(root)' : `uid=1000(${remoteUser}) gid=1000(${remoteUser}) groups=1000(${remoteUser}),10(wheel)`;
        } else if (remoteCmd.startsWith('cat ')) {
          const rPath = remoteCmd.slice(4).trim();
          remoteOut = matchedRemote.files[rPath]?.trim() || `cat: ${rPath}: No such file or directory`;
        }
        return {
          stdout: `[${remoteUser}@${matchedRemote.hostname} ~]${hasKey ? ' (pubkey auth)' : ''}$ ${remoteCmd}\n${remoteOut}`,
          stderr: '',
          exitCode: 0,
        };
      }
      vm.sshStack.push({
        hostKey: vm.activeHostKey,
        hostname: vm.hostname,
        user: vm.currentUser,
        cwd: vm.cwd,
      });
      const shortKey = matchedRemote.hostname.split('.')[0] as 'servera' | 'serverb';
      vm.activeHostKey = shortKey === 'servera' ? 'servera' : 'serverb';
      vm.hostname = matchedRemote.hostname;
      vm.currentUser = remoteUser;
      const rHome = remoteUser === 'root' ? '/root' : `/home/${remoteUser}`;
      createVfsDir(vm, rHome, remoteUser, remoteUser, 0o700, true);
      vm.cwd = rHome;
      vm.env.USER = remoteUser;
      vm.env.HOME = rHome;
      return {
        stdout: `Last login: Fri Nov 20 12:10:00 2026 from 172.25.250.9\nConnected to ${matchedRemote.hostname} (${remoteUser}) via ${hasKey ? 'SSH public key authentication' : 'password authentication'}.\nType 'exit' to close the SSH session and return to ${vm.sshStack[vm.sshStack.length - 1].hostname}.`,
        stderr: '',
        exitCode: 0,
      };
    }

    case 'sftp': {
      const target = rest.find((a) => !a.startsWith('-'));
      if (!target) return { stdout: '', stderr: 'usage: sftp [user@]hostname', exitCode: 1 };
      const [, remoteHost] = target.includes('@') ? target.split('@') : [vm.currentUser, target];
      const matchedRemote = Object.values(vm.remotes).find((r) => r.hostname === remoteHost || r.hostname.startsWith(remoteHost + '.') || r.ip === remoteHost);
      if (!matchedRemote) return { stdout: '', stderr: `ssh: Could not resolve hostname ${remoteHost}`, exitCode: 255 };
      const remoteFiles = Object.keys(matchedRemote.files).join('\n  ');
      return {
        stdout: `Connected to ${matchedRemote.hostname}.\nsftp> ls\n  ${remoteFiles || '(empty)'}\n(Tip: use 'scp' or 'rsync' in non-interactive lab steps to transfer files.)`,
        stderr: '',
        exitCode: 0,
      };
    }

    case 'journalctl': {
      let unitFilter = '';
      let priorityFilter = '';
      let limit = 50;

      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '-u' && rest[i + 1]) unitFilter = rest[++i];
        else if (rest[i] === '-p' && rest[i + 1]) priorityFilter = rest[++i];
        else if (rest[i] === '-n' && rest[i + 1]) limit = parseInt(rest[++i], 10) || 10;
      }

      const prioOrder = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];
      const maxPrioIdx = priorityFilter ? prioOrder.indexOf(priorityFilter) : 7;

      const entries = vm.journal
        .filter((e) => {
          if (unitFilter && !e.unit.includes(unitFilter)) return false;
          if (priorityFilter && prioOrder.indexOf(e.priority) > maxPrioIdx) return false;
          return true;
        })
        .slice(-limit);

      const hostShort = vm.hostname.split('.')[0];
      return {
        stdout: entries.map((e) => `${e.timestamp} ${hostShort} ${e.unit}[${e.pid}]: [${e.priority.toUpperCase()}] ${e.message}`).join('\n'),
        stderr: '',
        exitCode: 0,
      };
    }

    case 'logger': {
      let prio = 'notice';
      const msgParts: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '-p' && rest[i + 1]) {
          const pVal = rest[++i];
          prio = pVal.includes('.') ? pVal.split('.')[1] : pVal;
        } else if (!rest[i].startsWith('-')) {
          msgParts.push(rest[i]);
        }
      }
      const msg = msgParts.join(' ');
      if (!msg) return { stdout: '', stderr: 'logger: missing message', exitCode: 1 };
      const hostShort = vm.hostname.split('.')[0];
      const line = `Nov 20 12:18:00 ${hostShort} ${vm.currentUser}: ${msg}`;
      const msgFile = vm.vfs['/var/log/messages'];
      if (msgFile) {
        msgFile.content = (msgFile.content || '') + line + '\n';
        msgFile.size = msgFile.content.length;
      }
      vm.journal.push({
        timestamp: 'Nov 20 12:18:00',
        unit: vm.currentUser,
        priority: (['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'].includes(prio) ? prio : 'notice') as 'notice',
        pid: 1410,
        message: msg,
      });
      return { stdout: '', stderr: '', exitCode: 0 };
    }

    case 'ip': {
      const sub = rest[0] || 'a';
      if (sub.startsWith('r')) {
        const active = Object.values(vm.connections).find((c) => c.device === 'ens160' && c.state === 'activated');
        return {
          stdout: active
            ? `default via ${active.gateway} dev ens160 proto static metric 100\n172.25.250.0/24 dev ens160 proto kernel scope link src ${active.ipv4Address.split('/')[0]} metric 100`
            : 'No default route configured',
          stderr: '',
          exitCode: 0,
        };
      }
      const activeEns = Object.values(vm.connections).find((c) => c.device === 'ens160' && c.state === 'activated');
      return {
        stdout: `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN
    inet 127.0.0.1/8 scope host lo
2: ens160: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state ${activeEns ? 'UP' : 'DOWN'}
    link/ether 52:54:00:1a:2b:3c brd ff:ff:ff:ff:ff:ff
    ${activeEns ? `inet ${activeEns.ipv4Address} brd 172.25.250.255 scope global ${activeEns.ipv4Method === 'auto' ? 'dynamic' : 'noprefixroute'} ens160` : 'inet (unassigned)'}`,
        stderr: '',
        exitCode: 0,
      };
    }

    case 'nmcli': {
      const obj = rest[0];
      const action = rest[1];
      if (!obj || (obj === 'dev' && action === 'status') || obj === 'device') {
        const activeEns = Object.values(vm.connections).find((c) => c.device === 'ens160' && c.state === 'activated');
        return {
          stdout: `DEVICE  TYPE      STATE         CONNECTION
ens160  ethernet  ${activeEns ? 'connected' : 'disconnected'}  ${activeEns ? activeEns.name : '--'}
lo      loopback  connected (externally)  lo`,
          stderr: '',
          exitCode: 0,
        };
      }
      if ((obj === 'con' || obj === 'connection') && action === 'show') {
        const header = 'NAME                UUID                                  TYPE      DEVICE';
        const rows = Object.values(vm.connections).map(
          (c) => `${c.name.padEnd(19, ' ')} ${c.uuid}  ${c.type.padEnd(9, ' ')} ${c.state === 'activated' ? c.device : '--'}`
        );
        return { stdout: [header, ...rows].join('\n'), stderr: '', exitCode: 0 };
      }
      if ((obj === 'con' || obj === 'connection') && action === 'add') {
        if (!asRoot) return { stdout: '', stderr: 'Error: Not authorized to control networking (use sudo).', exitCode: 1 };
        let conName = 'ethernet-ens160';
        let ifname = 'ens160';
        let method: 'auto' | 'manual' = 'auto';
        let ip = '';
        let gw = '';
        let dns = '';
        for (let i = 2; i < rest.length; i++) {
          if (rest[i] === 'con-name' && rest[i + 1]) conName = rest[++i];
          else if (rest[i] === 'ifname' && rest[i + 1]) ifname = rest[++i];
          else if (rest[i] === 'ipv4.method' && rest[i + 1]) method = rest[++i] as 'auto' | 'manual';
          else if (rest[i] === 'ipv4.addresses' && rest[i + 1]) ip = rest[++i];
          else if (rest[i] === 'ipv4.gateway' && rest[i + 1]) gw = rest[++i];
          else if (rest[i] === 'ipv4.dns' && rest[i + 1]) dns = rest[++i];
        }
        vm.connections[conName] = {
          name: conName,
          uuid: `a1b2c3d4-0000-4444-8888-${String(Object.keys(vm.connections).length + 10).padStart(12, '0')}`,
          type: 'ethernet',
          device: ifname,
          state: 'deactivated',
          ipv4Method: method,
          ipv4Address: ip || '172.25.250.9/24',
          gateway: gw,
          dns,
          autoconnect: true,
        };
        return { stdout: `Connection '${conName}' successfully added.`, stderr: '', exitCode: 0 };
      }
      if ((obj === 'con' || obj === 'connection') && (action === 'mod' || action === 'modify')) {
        if (!asRoot) return { stdout: '', stderr: 'Error: Not authorized (use sudo).', exitCode: 1 };
        const name = rest[2];
        const con = vm.connections[name];
        if (!con) return { stdout: '', stderr: `Error: unknown connection '${name}'.`, exitCode: 10 };
        for (let i = 3; i < rest.length; i += 2) {
          const prop = rest[i];
          const val = rest[i + 1];
          if (!val) break;
          if (prop === 'ipv4.method') con.ipv4Method = val as 'auto' | 'manual';
          if (prop === 'ipv4.addresses') con.ipv4Address = val;
          if (prop === 'ipv4.gateway') con.gateway = val;
          if (prop === 'ipv4.dns') con.dns = val;
          if (prop === 'connection.autoconnect') con.autoconnect = val === 'yes' || val === 'true';
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if ((obj === 'con' || obj === 'connection') && action === 'up') {
        if (!asRoot) return { stdout: '', stderr: 'Error: Not authorized (use sudo).', exitCode: 1 };
        const name = rest[2];
        const con = vm.connections[name];
        if (!con) return { stdout: '', stderr: `Error: unknown connection '${name}'.`, exitCode: 10 };
        for (const c of Object.values(vm.connections)) {
          if (c.device === con.device) c.state = 'deactivated';
        }
        con.state = 'activated';
        return { stdout: `Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/3)`, stderr: '', exitCode: 0 };
      }
      if ((obj === 'con' || obj === 'connection') && action === 'down') {
        if (!asRoot) return { stdout: '', stderr: 'Error: Not authorized (use sudo).', exitCode: 1 };
        const name = rest[2];
        if (vm.connections[name]) vm.connections[name].state = 'deactivated';
        return { stdout: `Connection '${name}' successfully deactivated.`, stderr: '', exitCode: 0 };
      }
      if ((obj === 'con' || obj === 'connection') && action === 'delete') {
        if (!asRoot) return { stdout: '', stderr: 'Error: Not authorized (use sudo).', exitCode: 1 };
        const name = rest[2];
        delete vm.connections[name];
        return { stdout: `Connection '${name}' successfully deleted.`, stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: 'Usage: nmcli [dev status | con show | con add ... | con mod ... | con up ...]', exitCode: 2 };
    }

    case 'ss': {
      const rows = ['Netid  State   Recv-Q  Send-Q   Local Address:Port    Peer Address:Port  Process'];
      for (const u of Object.values(vm.units)) {
        if (u.activeState === 'active' && u.ports.length > 0) {
          for (const port of u.ports) {
            rows.push(`tcp    LISTEN  0       128      ${port.padEnd(21, ' ')} 0.0.0.0:*          users:(("${u.name.replace('.service', '')}",pid=${u.pid || 1000},fd=3))`);
          }
        }
      }
      return { stdout: rows.join('\n'), stderr: '', exitCode: 0 };
    }

    case 'ping': {
      const host = rest.find((a) => !a.startsWith('-') && !/^\d+$/.test(a));
      if (!host) return { stdout: '', stderr: 'ping: usage error: Destination address required', exitCode: 1 };
      const hostsFile = vm.vfs['/etc/hosts']?.content || '';
      const activeEns = Object.values(vm.connections).find((c) => c.device === 'ens160' && c.state === 'activated');
      const isLocal = host === 'localhost' || host === '127.0.0.1' || host === vm.hostname;
      if (!isLocal && !activeEns) {
        return { stdout: '', stderr: `ping: connect: Network is unreachable`, exitCode: 2 };
      }
      const known =
        isLocal ||
        hostsFile.includes(host) ||
        host.startsWith('172.25.250.') ||
        host === 'serverb.lab.example.com' ||
        host === 'servera.lab.example.com';
      if (!known) {
        return { stdout: '', stderr: `ping: ${host}: Name or service not known`, exitCode: 2 };
      }
      return {
        stdout: `PING ${host} 56(84) bytes of data.
64 bytes from ${host}: icmp_seq=1 ttl=64 time=0.312 ms
64 bytes from ${host}: icmp_seq=2 ttl=64 time=0.289 ms
64 bytes from ${host}: icmp_seq=3 ttl=64 time=0.301 ms

--- ${host} ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2004ms`,
        stderr: '',
        exitCode: 0,
      };
    }

    case 'curl': {
      const url = rest.find((a) => !a.startsWith('-'));
      if (!url) return { stdout: '', stderr: 'curl: try "curl http://localhost"', exitCode: 2 };
      const httpd = vm.units['httpd.service'];
      const nginx = vm.units['nginx.service'];
      const webUp = httpd?.activeState === 'active' || nginx?.activeState === 'active';
      if (!webUp) {
        return { stdout: '', stderr: `curl: (7) Failed to connect to ${url} port 80: Connection refused`, exitCode: 7 };
      }
      const idxNode = vm.vfs['/var/www/html/index.html'];
      if (idxNode && !canUserAccess(vm, 'apache', idxNode, 'r', false)) {
        return { stdout: '403 Forbidden: Apache lacks read permission on /var/www/html/index.html', stderr: '', exitCode: 0 };
      }
      return { stdout: (idxNode?.content || '<h1>It works!</h1>').trim(), stderr: '', exitCode: 0 };
    }

    case 'tar': {
      const flags = rest[0]?.startsWith('-') ? rest[0] : '';
      const create = flags.includes('c');
      const extract = flags.includes('x');
      const list = flags.includes('t');
      const verbose = flags.includes('v');

      let archiveArg = '';
      let targetDir = vm.cwd;
      const sourceArgs: string[] = [];

      for (let i = 1; i < rest.length; i++) {
        if (rest[i] === '-C' && rest[i + 1]) {
          targetDir = normalizePath(rest[++i], vm.cwd, home);
        } else if (!archiveArg && !rest[i].startsWith('-')) {
          archiveArg = rest[i];
        } else if (!rest[i].startsWith('-')) {
          sourceArgs.push(rest[i]);
        }
      }

      if (!archiveArg) return { stdout: '', stderr: 'tar: You must specify an archive filename', exitCode: 2 };
      const archiveAbs = normalizePath(archiveArg, vm.cwd, home);

      if (create) {
        if (sourceArgs.length === 0) return { stdout: '', stderr: 'tar: Cowardly refusing to create an empty archive', exitCode: 2 };
        const entries: Record<string, string> = {};
        for (const s of sourceArgs) {
          const sAbs = normalizePath(s, vm.cwd, home);
          const sNode = vm.vfs[sAbs];
          if (!sNode) return { stdout: '', stderr: `tar: ${s}: Cannot stat: No such file or directory`, exitCode: 2 };
          if (sNode.type === 'file') {
            entries[s] = sNode.content || '';
          } else if (sNode.type === 'dir') {
            for (const [k, v] of Object.entries(vm.vfs)) {
              if ((k === sAbs || k.startsWith(sAbs + '/')) && v.type === 'file') {
                const rel = k.slice(sAbs.lastIndexOf('/') + 1);
                entries[rel] = v.content || '';
              }
            }
          }
        }
        const payload = JSON.stringify({ __tarArchive: true, entries });
        createVfsFile(vm, archiveAbs, payload, asRoot ? 'root' : vm.currentUser);
        return { stdout: verbose ? Object.keys(entries).join('\n') : '', stderr: '', exitCode: 0 };
      }

      const archNode = vm.vfs[archiveAbs];
      if (!archNode) return { stdout: '', stderr: `tar: ${archiveArg}: Cannot open: No such file or directory`, exitCode: 2 };
      let parsedArch: { entries?: Record<string, string> } = {};
      try {
        parsedArch = JSON.parse(archNode.content || '{}');
      } catch {
        return { stdout: '', stderr: 'tar: This does not look like a tar archive', exitCode: 2 };
      }
      const entries = parsedArch.entries || {};
      if (list) return { stdout: Object.keys(entries).join('\n'), stderr: '', exitCode: 0 };
      if (extract) {
        for (const [relPath, fileContent] of Object.entries(entries)) {
          const destFile = normalizePath(relPath, targetDir, home);
          const { parent } = splitParentChild(destFile);
          createVfsDir(vm, parent, asRoot ? 'root' : vm.currentUser, undefined, 0o755, true);
          createVfsFile(vm, destFile, fileContent, asRoot ? 'root' : vm.currentUser);
        }
        return { stdout: verbose ? Object.keys(entries).join('\n') : '', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: 'tar: specify -c, -x, or -t', exitCode: 2 };
    }

    case 'scp':
    case 'rsync': {
      const paths = rest.filter((a) => !a.startsWith('-'));
      if (paths.length < 2) return { stdout: '', stderr: `${cmd}: missing source or destination`, exitCode: 1 };
      const [src, dest] = paths;
      if (dest.includes(':')) {
        const [hostPart, remotePath] = dest.split(':');
        const hostName = hostPart.includes('@') ? hostPart.split('@')[1] : hostPart;
        const remote = Object.values(vm.remotes).find((r) => r.hostname === hostName || r.hostname.startsWith(hostName + '.') || r.ip === hostName);
        if (!remote) return { stdout: '', stderr: `ssh: Could not resolve hostname ${hostName}`, exitCode: 1 };
        const srcAbs = normalizePath(src, vm.cwd, home);
        const srcNode = vm.vfs[srcAbs];
        if (!srcNode) return { stdout: '', stderr: `${src}: No such file or directory`, exitCode: 1 };
        const targetKey = remotePath.endsWith('/') ? `${remotePath}${splitParentChild(srcAbs).name}` : remotePath;
        remote.files[targetKey] = srcNode.content || '';
        return {
          stdout: `${splitParentChild(srcAbs).name.padEnd(28, ' ')} 100%  ${srcNode.size}B   1.2MB/s   00:00`,
          stderr: '',
          exitCode: 0,
        };
      }
      if (src.includes(':')) {
        const [hostPart, remotePath] = src.split(':');
        const hostName = hostPart.includes('@') ? hostPart.split('@')[1] : hostPart;
        const remote = Object.values(vm.remotes).find((r) => r.hostname === hostName || r.hostname.startsWith(hostName + '.') || r.ip === hostName);
        if (!remote || remote.files[remotePath] === undefined) {
          return { stdout: '', stderr: `${cmd}: ${remotePath}: No such file or directory`, exitCode: 1 };
        }
        const destAbs = normalizePath(dest, vm.cwd, home);
        const finalDest = vm.vfs[destAbs]?.type === 'dir' ? `${destAbs}/${splitParentChild(remotePath).name}` : destAbs;
        createVfsFile(vm, finalDest, remote.files[remotePath], asRoot ? 'root' : vm.currentUser);
        return { stdout: `${splitParentChild(remotePath).name.padEnd(28, ' ')} 100%`, stderr: '', exitCode: 0 };
      }
      const srcAbs = normalizePath(src, vm.cwd, home);
      const destAbs = normalizePath(dest, vm.cwd, home);
      const res = copyVfsPath(vm, srcAbs, destAbs, asRoot ? 'root' : vm.currentUser, true);
      if (!res.ok) return { stdout: '', stderr: `${cmd}: ${res.error}`, exitCode: 1 };
      return { stdout: `sent ${src} -> ${dest} (100%)`, stderr: '', exitCode: 0 };
    }

    case 'dnf':
    case 'yum': {
      const sub = rest.find((a) => !a.startsWith('-'));
      const pkgNames = rest.filter((a) => !a.startsWith('-') && a !== sub);
      if (sub === 'search') {
        const kw = (pkgNames[0] || '').toLowerCase();
        const hits = Object.values(vm.packages).filter((p) => p.name.includes(kw) || p.summary.toLowerCase().includes(kw));
        return { stdout: hits.map((p) => `${p.name}.${p.arch} : ${p.summary}`).join('\n') || 'No matches found.', stderr: '', exitCode: 0 };
      }
      if (sub === 'info') {
        const pkg = vm.packages[pkgNames[0]];
        if (!pkg) return { stdout: '', stderr: `Error: No matching Packages to list`, exitCode: 1 };
        return {
          stdout: `Name         : ${pkg.name}\nVersion      : ${pkg.version}\nRelease      : ${pkg.release}\nArchitecture : ${pkg.arch}\nRepository   : ${pkg.installed ? '@System' : pkg.repo}\nSummary      : ${pkg.summary}`,
          stderr: '',
          exitCode: 0,
        };
      }
      if (sub === 'history') {
        return {
          stdout: ['ID | Command line             | Date and time    | Action', ...vm.dnfHistory.map((h) => `${String(h.id).padEnd(2, ' ')} | ${h.command.padEnd(24, ' ')} | ${h.date} | ${h.action}`)].join('\n'),
          stderr: '',
          exitCode: 0,
        };
      }
      if (sub === 'install' || sub === 'remove' || sub === 'update') {
        if (!asRoot) return { stdout: '', stderr: 'Error: This command has to be run with superuser privileges (use sudo).', exitCode: 1 };
        if (sub === 'update' && pkgNames.length === 0) {
          return { stdout: 'Dependencies resolved.\nNothing to do.\nComplete!', stderr: '', exitCode: 0 };
        }
        const pkgName = pkgNames[0];
        const pkg = vm.packages[pkgName];
        if (!pkg) return { stdout: '', stderr: `No match for argument: ${pkgName}\nError: Unable to find a match: ${pkgName}`, exitCode: 1 };
        pkg.installed = sub !== 'remove';
        pkg.repo = pkg.installed ? '@System' : 'rhel-9-appstream';
        if (pkg.installed) {
          for (const f of pkg.files) {
            if (!vm.vfs[f]) {
              const { parent } = splitParentChild(f);
              createVfsDir(vm, parent, 'root', 'root', 0o755, true);
              createVfsFile(vm, f, `[Installed by ${pkg.name}]\n`, 'root', 'root', f.includes('/bin') ? 0o755 : 0o644);
            }
          }
        }
        vm.dnfHistory.push({
          id: vm.dnfHistory.length + 1,
          command: `${sub} ${pkg.name}`,
          date: '2026-11-20 12:18',
          action: sub === 'install' ? 'Install' : sub === 'remove' ? 'Removed' : 'Upgrade',
        });
        return {
          stdout: `Dependencies resolved.\nPackage: ${pkg.name}-${pkg.version}-${pkg.release}.${pkg.arch}\n\n${sub === 'remove' ? 'Removed' : 'Installed'}:\n  ${pkg.name}-${pkg.version}-${pkg.release}.${pkg.arch}\n\nComplete!`,
          stderr: '',
          exitCode: 0,
        };
      }
      return { stdout: '', stderr: 'Usage: dnf [search|info|install|remove|update|history] [PACKAGE]', exitCode: 1 };
    }

    case 'rpm': {
      const flag = rest[0] || '';
      const arg = rest[1];
      if (flag === '-qa') {
        return {
          stdout: Object.values(vm.packages)
            .filter((p) => p.installed)
            .map((p) => `${p.name}-${p.version}-${p.release}.${p.arch}`)
            .join('\n'),
          stderr: '',
          exitCode: 0,
        };
      }
      if (flag === '-qf' && arg) {
        const abs = normalizePath(arg, vm.cwd, home);
        const ownerPkg = Object.values(vm.packages).find((p) => p.installed && p.files.includes(abs));
        if (!ownerPkg) return { stdout: '', stderr: `file ${abs} is not owned by any package`, exitCode: 1 };
        return { stdout: `${ownerPkg.name}-${ownerPkg.version}-${ownerPkg.release}.${ownerPkg.arch}`, stderr: '', exitCode: 0 };
      }
      if (flag === '-ql' && arg) {
        const pkg = vm.packages[arg];
        if (!pkg || !pkg.installed) return { stdout: '', stderr: `package ${arg} is not installed`, exitCode: 1 };
        return { stdout: pkg.files.join('\n'), stderr: '', exitCode: 0 };
      }
      if (flag === '-qi' && arg) {
        const pkg = vm.packages[arg];
        if (!pkg || !pkg.installed) return { stdout: '', stderr: `package ${arg} is not installed`, exitCode: 1 };
        return { stdout: `Name        : ${pkg.name}\nVersion     : ${pkg.version}\nRelease     : ${pkg.release}\nSummary     : ${pkg.summary}`, stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: 'Usage: rpm {-qa | -qi PKG | -ql PKG | -qf FILE}', exitCode: 1 };
    }

    case 'firewall-cmd': {
      if (rest.includes('--state')) {
        const active = vm.units['firewalld.service']?.activeState === 'active';
        return { stdout: active ? 'running' : 'not running', stderr: '', exitCode: active ? 0 : 252 };
      }
      if (rest.includes('--get-default-zone')) {
        return { stdout: vm.firewall.defaultZone, stderr: '', exitCode: 0 };
      }
      if (rest.includes('--list-services')) {
        return { stdout: vm.firewall.services.join(' '), stderr: '', exitCode: 0 };
      }
      if (rest.includes('--list-all') || rest.length === 0) {
        return {
          stdout: `${vm.firewall.defaultZone} (active)
  target: default
  icmp-block-inversion: no
  interfaces: ens160
  sources: 
  services: ${vm.firewall.services.join(' ')}
  ports: ${vm.firewall.ports.join(' ')}
  protocols: 
  forward: yes`,
          stderr: '',
          exitCode: 0,
        };
      }
      if (!asRoot) return { stdout: '', stderr: 'Authorization failed. (use sudo)', exitCode: 1 };
      const permanent = rest.includes('--permanent');
      if (rest.includes('--reload')) {
        vm.firewall.services = Array.from(new Set(vm.firewall.permanentServices));
        return { stdout: 'success', stderr: '', exitCode: 0 };
      }
      for (const arg of rest) {
        if (arg.startsWith('--add-service=')) {
          const svc = arg.split('=')[1];
          if (permanent) {
            if (!vm.firewall.permanentServices.includes(svc)) vm.firewall.permanentServices.push(svc);
          } else {
            if (!vm.firewall.services.includes(svc)) vm.firewall.services.push(svc);
          }
          return { stdout: 'success', stderr: '', exitCode: 0 };
        }
        if (arg.startsWith('--remove-service=')) {
          const svc = arg.split('=')[1];
          if (permanent) {
            vm.firewall.permanentServices = vm.firewall.permanentServices.filter((s) => s !== svc);
          } else {
            vm.firewall.services = vm.firewall.services.filter((s) => s !== svc);
          }
          return { stdout: 'success', stderr: '', exitCode: 0 };
        }
        if (arg.startsWith('--add-port=')) {
          const port = arg.split('=')[1];
          if (!vm.firewall.ports.includes(port)) vm.firewall.ports.push(port);
          return { stdout: 'success', stderr: '', exitCode: 0 };
        }
      }
      return { stdout: '', stderr: 'usage: firewall-cmd [--list-all | --add-service=<svc> [--permanent] | --reload]', exitCode: 2 };
    }

    case 'sos': {
      if (rest[0] !== 'report') {
        return { stdout: '', stderr: 'usage: sos report [--batch]', exitCode: 1 };
      }
      if (!asRoot) return { stdout: '', stderr: 'sos: root privileges are required (use sudo sos report --batch)', exitCode: 1 };
      const shortHost = vm.hostname.split('.')[0];
      const reportPath = `/var/tmp/sosreport-${shortHost}-2026-11-20-rh124.tar.xz`;
      createVfsFile(vm, reportPath, '[Red Hat sosreport diagnostic archive]\n', 'root', 'root', 0o600);
      if (!vm.sosReports.includes(reportPath)) vm.sosReports.push(reportPath);
      return {
        stdout: `sosreport (version 4.6.0)\n\nSetting up archive ...\nRunning plugins. Please wait ...\n\nYour sosreport has been generated and saved in:\n  ${reportPath}\n\nSize   14.2MiB\nPlease send this file to your support representative.`,
        stderr: '',
        exitCode: 0,
      };
    }

    case 'subscription-manager': {
      const sub = rest[0] || 'status';
      if (sub === 'status') {
        return {
          stdout: `+-------------------------------------------+
   System Status Details
+-------------------------------------------+
Overall Status: ${vm.subscriptionRegistered ? 'Current' : 'Unknown'}

System Purpose Status: Matched`,
          stderr: '',
          exitCode: 0,
        };
      }
      if (sub === 'identity') {
        return {
          stdout: `system identity: 9d8c7b6a-1234-4abc-9def-0123456789ab\nname: ${vm.hostname}\norg name: Red Hat Academy Lab`,
          stderr: '',
          exitCode: 0,
        };
      }
      if (sub === 'repos') {
        return {
          stdout: `Repo ID:   rhel-9-for-x86_64-baseos-rpms\nRepo Name: Red Hat Enterprise Linux 9 for x86_64 - BaseOS (RPMs)\nEnabled:   1\n\nRepo ID:   rhel-9-for-x86_64-appstream-rpms\nRepo Name: Red Hat Enterprise Linux 9 for x86_64 - AppStream (RPMs)\nEnabled:   1`,
          stderr: '',
          exitCode: 0,
        };
      }
      return { stdout: '', stderr: 'usage: subscription-manager [status | identity | repos --list-enabled]', exitCode: 1 };
    }

    case 'dig':
    case 'host': {
      const hostArg = rest.find((a) => !a.startsWith('-'));
      if (!hostArg) return { stdout: '', stderr: `${cmd}: missing hostname`, exitCode: 1 };
      const lookup: Record<string, string> = {
        'workstation.lab.example.com': '172.25.250.9',
        workstation: '172.25.250.9',
        'servera.lab.example.com': '172.25.250.10',
        servera: '172.25.250.10',
        'serverb.lab.example.com': '172.25.250.11',
        serverb: '172.25.250.11',
      };
      const ip = lookup[hostArg];
      if (!ip) return { stdout: cmd === 'host' ? `Host ${hostArg} not found: 3(NXDOMAIN)` : `;; status: NXDOMAIN`, stderr: '', exitCode: 1 };
      if (cmd === 'host') return { stdout: `${hostArg} has address ${ip}`, stderr: '', exitCode: 0 };
      return {
        stdout: `;; ANSWER SECTION:\n${hostArg}.\t\t86400\tIN\tA\t${ip}\n\n;; SERVER: 172.25.250.254#53(172.25.250.254)`,
        stderr: '',
        exitCode: 0,
      };
    }

    case 'traceroute': {
      const hostArg = rest.find((a) => !a.startsWith('-'));
      if (!hostArg) return { stdout: '', stderr: 'Specify "host" missing argument.', exitCode: 1 };
      return {
        stdout: `traceroute to ${hostArg}, 30 hops max, 60 byte packets\n 1  172.25.250.254 (172.25.250.254)  0.412 ms  0.391 ms  0.378 ms\n 2  ${hostArg}  0.684 ms  0.651 ms  0.629 ms`,
        stderr: '',
        exitCode: 0,
      };
    }

    default:
      return { stdout: '', stderr: `bash: ${cmd}: command not found`, exitCode: 127 };
  }
}

export function getAutocompleteSuggestions(vm: VmState, input: string): string[] {
  const parts = input.split(/\s+/);
  const commands = [
    'lab', 'ls', 'cd', 'pwd', 'mkdir', 'touch', 'cp', 'mv', 'rm', 'ln', 'find', 'stat',
    'cat', 'head', 'tail', 'grep', 'sort', 'uniq', 'cut', 'tr', 'sed', 'wc', 'vim',
    'man', 'whatis', 'apropos', 'useradd', 'usermod', 'userdel', 'groupadd', 'passwd',
    'chage', 'su', 'sudo', 'chmod', 'chown', 'chgrp', 'umask', 'ps', 'pgrep', 'pkill',
    'kill', 'top', 'jobs', 'nice', 'renice', 'systemctl', 'ssh-keygen', 'ssh-copy-id',
    'ssh', 'sftp', 'journalctl', 'logger', 'ip', 'nmcli', 'hostnamectl', 'ping', 'dig',
    'host', 'traceroute', 'ss', 'curl', 'tar', 'scp', 'rsync', 'dnf', 'rpm', 'timedatectl',
    'chronyc', 'lsblk', 'blkid', 'df', 'du', 'mount', 'umount', 'lsof', 'firewall-cmd',
    'sos', 'subscription-manager', 'clear', 'history', 'exit',
  ];

  if (parts.length <= 1) {
    const prefix = parts[0] || '';
    return commands.filter((c) => c.startsWith(prefix)).slice(0, 12);
  }

  const last = parts[parts.length - 1];
  const home = vm.users[vm.currentUser]?.home || '/home/student';
  const lastSlash = last.lastIndexOf('/');
  const dirPart = lastSlash >= 0 ? last.slice(0, lastSlash) || '/' : '';
  const namePart = lastSlash >= 0 ? last.slice(lastSlash + 1) : last;
  const searchDir = dirPart ? normalizePath(dirPart, vm.cwd, home) : vm.cwd;
  const node = vm.vfs[searchDir];
  if (!node || node.type !== 'dir' || !node.children) return [];

  return node.children
    .filter((c) => c.startsWith(namePart))
    .sort()
    .map((c) => (dirPart ? `${dirPart === '/' ? '' : dirPart}/${c}` : c))
    .slice(0, 12);
}

function analyzeCommandFeedback(
  rawCmd: string,
  exitCode: number,
  _stdout: string,
  stderr: string,
  vmBefore: VmState,
  vmAfter: VmState
): FeedbackEvent | undefined {
  // Detect common RH124 mistakes and provide immediate coaching
  if (stderr.includes('Permission denied') || stderr.includes('Access denied') || stderr.includes('superuser privileges')) {
    return {
      id: `${Date.now()}`,
      status: 'warning',
      title: 'Privilege Escalation Required',
      detail: 'Non-root users cannot modify system files or services. Prefix the command with sudo (e.g., sudo ' + rawCmd + ').',
      command: rawCmd,
    };
  }

  if (rawCmd.includes('usermod') && rawCmd.includes('-G') && !rawCmd.includes('-a')) {
    return {
      id: `${Date.now()}`,
      status: 'warning',
      title: 'RH124 Critical Warning: Missing -a Flag',
      detail: 'Running usermod -G without -a replaces all existing supplementary groups! Always use usermod -aG <group> <user> to append safely.',
      command: rawCmd,
    };
  }

  if (rawCmd.includes('chmod 777')) {
    return {
      id: `${Date.now()}`,
      status: 'warning',
      title: 'Overly Permissive Mode (777)',
      detail: 'Granting world-writable permissions (777) violates least-privilege security. Prefer group collaboration with SGID (2770) or sticky bit (1777).',
      command: rawCmd,
    };
  }

  if (stderr.includes('-r not specified; omitting directory')) {
    return {
      id: `${Date.now()}`,
      status: 'tip',
      title: 'Recursive Flag Needed',
      detail: 'cp omits directories by default. Add -r (or -a to preserve ownership and timestamps): cp -r <src> <dest>.',
      command: rawCmd,
    };
  }

  if (stderr.includes('is masked')) {
    return {
      id: `${Date.now()}`,
      status: 'tip',
      title: 'Unit is Masked',
      detail: 'A masked unit points to /dev/null and cannot start. Unmask it first with: sudo systemctl unmask <unit>.',
      command: rawCmd,
    };
  }

  if (rawCmd.includes('systemctl start') && exitCode === 0) {
    return {
      id: `${Date.now()}`,
      status: 'tip',
      title: 'Runtime Started — Check Boot Persistence',
      detail: 'systemctl start activates the service now, but does not enable it at boot. Combine both in one step with: sudo systemctl enable --now <service>.',
      command: rawCmd,
    };
  }

  if (vmBefore.vfs['/etc/ssh/sshd_config']?.content !== vmAfter.vfs['/etc/ssh/sshd_config']?.content) {
    return {
      id: `${Date.now()}`,
      status: 'tip',
      title: 'SSHD Config Modified',
      detail: 'Remember to reload the OpenSSH daemon with "sudo systemctl reload sshd" so your new sshd_config rules take effect.',
      command: rawCmd,
    };
  }

  if (exitCode === 127) {
    return {
      id: `${Date.now()}`,
      status: 'error',
      title: 'Command Not Found',
      detail: stderr || 'Check spelling or verify the package is installed using dnf search / dnf install.',
      command: rawCmd,
    };
  }

  return undefined;
}
