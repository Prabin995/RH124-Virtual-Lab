import { VmState, VfsNode } from '../types/rhel';

const NOW_MTIME = 'Nov 20 12:00';

export function makeDir(inodeId: number, owner = 'root', group = 'root', mode = 0o755, children: string[] = []): VfsNode {
  return {
    type: 'dir',
    inodeId,
    mode,
    owner,
    group,
    children,
    mtime: NOW_MTIME,
    size: 4096,
  };
}

export function makeFile(
  inodeId: number,
  content: string,
  owner = 'root',
  group = 'root',
  mode = 0o644
): VfsNode {
  return {
    type: 'file',
    inodeId,
    mode,
    owner,
    group,
    content,
    mtime: NOW_MTIME,
    size: content.length,
  };
}

export function serializePasswd(vm: VmState): string {
  return Object.values(vm.users)
    .sort((a, b) => a.uid - b.uid)
    .map((u) => `${u.username}:x:${u.uid}:${u.gid}:${u.comment}:${u.home}:${u.shell}`)
    .join('\n') + '\n';
}

export function serializeGroup(vm: VmState): string {
  return Object.values(vm.groups)
    .sort((a, b) => a.gid - b.gid)
    .map((g) => `${g.name}:x:${g.gid}:${g.members.join(',')}`)
    .join('\n') + '\n';
}

export function serializeShadow(vm: VmState): string {
  return Object.values(vm.users)
    .sort((a, b) => a.uid - b.uid)
    .map((u) => {
      const hash = u.locked ? '!$6$locked' : u.passwordSet ? '$6$rhel9lab$hashed' : '!!';
      return `${u.username}:${hash}:19950:${u.minDays}:${u.maxDays}:${u.warnDays}::${u.expireDate}:`;
    })
    .join('\n') + '\n';
}

export function syncSystemAuthFiles(vm: VmState): void {
  const passwdContent = serializePasswd(vm);
  const groupContent = serializeGroup(vm);
  const shadowContent = serializeShadow(vm);

  if (vm.vfs['/etc/passwd']) {
    vm.vfs['/etc/passwd'] = { ...vm.vfs['/etc/passwd'], content: passwdContent, size: passwdContent.length };
  }
  if (vm.vfs['/etc/group']) {
    vm.vfs['/etc/group'] = { ...vm.vfs['/etc/group'], content: groupContent, size: groupContent.length };
  }
  if (vm.vfs['/etc/shadow']) {
    vm.vfs['/etc/shadow'] = { ...vm.vfs['/etc/shadow'], content: shadowContent, size: shadowContent.length };
  }
}

export function createInitialVmState(): VmState {
  let inode = 100;
  const nextInode = () => ++inode;

  const vfs: Record<string, VfsNode> = {
    '/': makeDir(nextInode(), 'root', 'root', 0o755, [
      'bin',
      'boot',
      'dev',
      'etc',
      'home',
      'mnt',
      'opt',
      'root',
      'run',
      'sbin',
      'srv',
      'tmp',
      'usr',
      'var',
    ]),
    '/bin': {
      type: 'symlink',
      inodeId: nextInode(),
      mode: 0o777,
      owner: 'root',
      group: 'root',
      target: 'usr/bin',
      mtime: NOW_MTIME,
      size: 7,
    },
    '/sbin': {
      type: 'symlink',
      inodeId: nextInode(),
      mode: 0o777,
      owner: 'root',
      group: 'root',
      target: 'usr/sbin',
      mtime: NOW_MTIME,
      size: 8,
    },
    '/boot': makeDir(nextInode(), 'root', 'root', 0o555, ['vmlinuz-5.14.0-427.el9.x86_64']),
    '/boot/vmlinuz-5.14.0-427.el9.x86_64': makeFile(nextInode(), '[Linux kernel binary image]', 'root', 'root', 0o600),
    '/dev': makeDir(nextInode(), 'root', 'root', 0o755, ['null', 'zero', 'urandom', 'vda', 'vda1', 'vda2', 'vdb', 'vdb1']),
    '/dev/null': makeFile(nextInode(), '', 'root', 'root', 0o666),
    '/dev/zero': makeFile(nextInode(), '', 'root', 'root', 0o666),
    '/dev/urandom': makeFile(nextInode(), '', 'root', 'root', 0o666),
    '/dev/vda': makeFile(nextInode(), '', 'root', 'root', 0o660),
    '/dev/vda1': makeFile(nextInode(), '', 'root', 'root', 0o660),
    '/dev/vda2': makeFile(nextInode(), '', 'root', 'root', 0o660),
    '/dev/vdb': makeFile(nextInode(), '', 'root', 'root', 0o660),
    '/dev/vdb1': makeFile(nextInode(), '', 'root', 'root', 0o660),
    '/etc': makeDir(nextInode(), 'root', 'root', 0o755, [
      'os-release',
      'redhat-release',
      'hostname',
      'hosts',
      'passwd',
      'group',
      'shadow',
      'sudoers',
      'sudoers.d',
      'ssh',
      'systemd',
      'chrony.conf',
      'fstab',
      'motd',
    ]),
    '/etc/os-release': makeFile(
      nextInode(),
      `NAME="Red Hat Enterprise Linux"
VERSION="9.3 (Plow)"
ID="rhel"
ID_LIKE="fedora"
VERSION_ID="9.3"
PLATFORM_ID="platform:el9"
PRETTY_NAME="Red Hat Enterprise Linux 9.3 (Plow)"
ANSI_COLOR="0;31"
CPE_NAME="cpe:/o:redhat:enterprise_linux:9::baseos"
HOME_URL="https://www.redhat.com/"
REDHAT_SUPPORT_PRODUCT="Red Hat Enterprise Linux"
REDHAT_SUPPORT_PRODUCT_VERSION="9.3"\n`
    ),
    '/etc/redhat-release': makeFile(nextInode(), 'Red Hat Enterprise Linux release 9.3 (Plow)\n'),
    '/etc/hostname': makeFile(nextInode(), 'workstation.lab.example.com\n'),
    '/etc/hosts': makeFile(
      nextInode(),
      `127.0.0.1   localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6
172.25.250.9   workstation.lab.example.com workstation
172.25.250.10  servera.lab.example.com servera
172.25.250.11  serverb.lab.example.com serverb\n`
    ),
    '/etc/passwd': makeFile(nextInode(), ''),
    '/etc/group': makeFile(nextInode(), ''),
    '/etc/shadow': makeFile(nextInode(), '', 'root', 'root', 0o000),
    '/etc/sudoers': makeFile(
      nextInode(),
      `## Sudoers allows particular users to run various commands as root
Defaults   !visiblepw
Defaults   env_reset
root    ALL=(ALL)       ALL
%wheel  ALL=(ALL)       ALL
#includedir /etc/sudoers.d\n`,
      'root',
      'root',
      0o440
    ),
    '/etc/sudoers.d': makeDir(nextInode(), 'root', 'root', 0o750, ['student']),
    '/etc/sudoers.d/student': makeFile(nextInode(), 'student ALL=(ALL) NOPASSWD: ALL\n', 'root', 'root', 0o440),
    '/etc/ssh': makeDir(nextInode(), 'root', 'root', 0o755, ['sshd_config', 'ssh_config']),
    '/etc/ssh/sshd_config': makeFile(
      nextInode(),
      `# OpenSSH Server Configuration (RHEL 9)
Port 22
ListenAddress 0.0.0.0
PermitRootLogin yes
PubkeyAuthentication yes
PasswordAuthentication yes
ChallengeResponseAuthentication no
UsePAM yes
X11Forwarding yes
Subsystem sftp /usr/libexec/openssh/sftp-server\n`,
      'root',
      'root',
      0o600
    ),
    '/etc/ssh/ssh_config': makeFile(nextInode(), 'Host *\n  GSSAPIAuthentication no\n  ServerAliveInterval 60\n'),
    '/etc/systemd': makeDir(nextInode(), 'root', 'root', 0o755, ['journald.conf', 'system']),
    '/etc/systemd/journald.conf': makeFile(
      nextInode(),
      `[Journal]
#Storage=auto
#Compress=yes
#SystemMaxUse=
#MaxRetentionSec=\n`
    ),
    '/etc/systemd/system': makeDir(nextInode(), 'root', 'root', 0o755, []),
    '/etc/chrony.conf': makeFile(
      nextInode(),
      `pool 2.rhel.pool.ntp.org iburst
driftfile /var/lib/chrony/drift
makestep 1.0 3
rtcsync
logdir /var/log/chrony\n`
    ),
    '/etc/fstab': makeFile(
      nextInode(),
      `UUID=9a2b3c4d-1122-3344-5566-778899aabbcc / xfs defaults 0 0
UUID=11223344-aabb-ccdd-eeff-001122334455 /boot xfs defaults 0 0\n`
    ),
    '/etc/motd': makeFile(nextInode(), 'Welcome to Red Hat Enterprise Linux 9.3 (RH124 Lab Environment)\n'),
    '/home': makeDir(nextInode(), 'root', 'root', 0o755, ['student']),
    '/home/student': makeDir(nextInode(), 'student', 'student', 0o700, [
      '.bashrc',
      '.bash_profile',
      'readme.txt',
      'server-inventory.csv',
    ]),
    '/home/student/.bashrc': makeFile(
      nextInode(),
      `# .bashrc
alias ll='ls -l --color=auto'
export PATH=$PATH:/usr/local/bin\n`,
      'student',
      'student',
      0o644
    ),
    '/home/student/.bash_profile': makeFile(
      nextInode(),
      `# .bash_profile
if [ -f ~/.bashrc ]; then
  . ~/.bashrc
fi\n`,
      'student',
      'student',
      0o644
    ),
    '/home/student/readme.txt': makeFile(
      nextInode(),
      `RH124 Lab Workstation Notes
===========================
Host: workstation.lab.example.com
Remote target: serverb.lab.example.com (172.25.250.11)
Use 'man <command>' to inspect official documentation.
Use 'sudo' when modifying system directories like /etc or /srv.\n`,
      'student',
      'student',
      0o644
    ),
    '/home/student/server-inventory.csv': makeFile(
      nextInode(),
      `hostname,role,ip,env,owner
web01.lab,httpd,172.25.250.21,prod,ops
web02.lab,httpd,172.25.250.22,prod,ops
db01.lab,postgresql,172.25.250.31,prod,dba
app01.lab,nodejs,172.25.250.41,staging,developers
cache01.lab,redis,172.25.250.51,staging,developers
web03.lab,httpd,172.25.250.23,dev,developers\n`,
      'student',
      'student',
      0o644
    ),
    '/mnt': makeDir(nextInode(), 'root', 'root', 0o755, ['data']),
    '/mnt/data': makeDir(nextInode(), 'root', 'root', 0o755, []),
    '/opt': makeDir(nextInode(), 'root', 'root', 0o755, []),
    '/root': makeDir(nextInode(), 'root', 'root', 0o550, ['.bashrc', 'anaconda-ks.cfg']),
    '/root/.bashrc': makeFile(nextInode(), '# root .bashrc\n', 'root', 'root', 0o644),
    '/root/anaconda-ks.cfg': makeFile(nextInode(), '# Kickstart file generated by Anaconda\nlang en_US.UTF-8\n', 'root', 'root', 0o600),
    '/run': makeDir(nextInode(), 'root', 'root', 0o755, ['systemd']),
    '/run/systemd': makeDir(nextInode(), 'root', 'root', 0o755, []),
    '/srv': makeDir(nextInode(), 'root', 'root', 0o755, ['data']),
    '/srv/data': makeDir(nextInode(), 'root', 'root', 0o755, ['app.conf', 'sample.log']),
    '/srv/data/app.conf': makeFile(nextInode(), 'listen_port=8080\nenv=production\nlog_level=info\n'),
    '/srv/data/sample.log': makeFile(
      nextInode(),
      `2026-11-20 08:12:01 INFO Service initialized
2026-11-20 08:14:22 WARNING Disk usage at 78%
2026-11-20 08:19:45 ERROR Connection refused to 172.25.250.31:5432
2026-11-20 08:21:10 INFO Retry succeeded\n`
    ),
    '/tmp': {
      ...makeDir(nextInode(), 'root', 'root', 0o777, []),
      sticky: true,
    },
    '/usr': makeDir(nextInode(), 'root', 'root', 0o755, ['bin', 'sbin', 'share']),
    '/usr/bin': makeDir(nextInode(), 'root', 'root', 0o755, ['bash', 'ls', 'grep', 'vim', 'systemctl', 'nmcli']),
    '/usr/bin/bash': makeFile(nextInode(), '[ELF binary]', 'root', 'root', 0o755),
    '/usr/bin/ls': makeFile(nextInode(), '[ELF binary]', 'root', 'root', 0o755),
    '/usr/bin/grep': makeFile(nextInode(), '[ELF binary]', 'root', 'root', 0o755),
    '/usr/bin/vim': makeFile(nextInode(), '[ELF binary]', 'root', 'root', 0o755),
    '/usr/bin/systemctl': makeFile(nextInode(), '[ELF binary]', 'root', 'root', 0o755),
    '/usr/bin/nmcli': makeFile(nextInode(), '[ELF binary]', 'root', 'root', 0o755),
    '/usr/sbin': makeDir(nextInode(), 'root', 'root', 0o755, ['useradd', 'usermod', 'sshd']),
    '/usr/sbin/useradd': makeFile(nextInode(), '[ELF binary]', 'root', 'root', 0o755),
    '/usr/sbin/usermod': makeFile(nextInode(), '[ELF binary]', 'root', 'root', 0o755),
    '/usr/sbin/sshd': makeFile(nextInode(), '[ELF binary]', 'root', 'root', 0o755),
    '/usr/share': makeDir(nextInode(), 'root', 'root', 0o755, ['doc']),
    '/usr/share/doc': makeDir(nextInode(), 'root', 'root', 0o755, ['openssh', 'bash']),
    '/usr/share/doc/openssh': makeDir(nextInode(), 'root', 'root', 0o755, ['README.md']),
    '/usr/share/doc/openssh/README.md': makeFile(
      nextInode(),
      'OpenSSH Portable Documentation\nRefer to sshd_config(5) for daemon hardening directives.\n'
    ),
    '/usr/share/doc/bash': makeDir(nextInode(), 'root', 'root', 0o755, ['FAQ']),
    '/usr/share/doc/bash/FAQ': makeFile(nextInode(), 'GNU Bash Frequently Asked Questions\n'),
    '/var': makeDir(nextInode(), 'root', 'root', 0o755, ['log', 'www', 'tmp']),
    '/var/log': makeDir(nextInode(), 'root', 'root', 0o755, ['messages', 'secure', 'dnf.log']),
    '/var/log/messages': makeFile(
      nextInode(),
      `Nov 20 09:00:01 workstation systemd[1]: Started System Logging Service.
Nov 20 09:00:02 workstation chronyd[812]: Selected source 172.25.250.254
Nov 20 09:15:18 workstation kernel: eth0: Link is Up - 10Gbps/Full
Nov 20 10:02:44 workstation systemd[1]: Started OpenSSH server daemon.\n`,
      'root',
      'root',
      0o600
    ),
    '/var/log/secure': makeFile(
      nextInode(),
      `Nov 20 09:12:03 workstation sshd[1042]: Accepted publickey for student from 172.25.250.1 port 51204 ssh2
Nov 20 09:44:19 workstation sudo[1188]: student : TTY=pts/0 ; PWD=/home/student ; USER=root ; COMMAND=/usr/bin/systemctl status sshd
Nov 20 10:18:02 workstation sshd[1290]: Failed password for invalid user admin from 198.51.100.77 port 44812 ssh2
Nov 20 10:18:05 workstation sshd[1290]: Failed password for invalid user admin from 198.51.100.77 port 44812 ssh2\n`,
      'root',
      'root',
      0o600
    ),
    '/var/log/dnf.log': makeFile(nextInode(), '2026-11-20T09:00:05+0000 INFO DNF 4.14.0 initialized.\n', 'root', 'root', 0o644),
    '/var/www': makeDir(nextInode(), 'root', 'root', 0o755, ['html']),
    '/var/www/html': makeDir(nextInode(), 'root', 'root', 0o755, ['index.html']),
    '/var/www/html/index.html': makeFile(nextInode(), '<h1>Workstation Web Server</h1>\n', 'root', 'root', 0o644),
    '/var/tmp': {
      ...makeDir(nextInode(), 'root', 'root', 0o777, []),
      sticky: true,
    },
  };

  const vm: VmState = {
    activeHostKey: 'workstation',
    hostname: 'workstation.lab.example.com',
    currentUser: 'student',
    cwd: '/home/student',
    previousCwd: '/home/student',
    umask: 0o022,
    nextInode: inode + 1,
    nextPid: 2100,
    nextUid: 1001,
    nextGid: 1001,
    env: {
      USER: 'student',
      HOME: '/home/student',
      SHELL: '/bin/bash',
      PATH: '/home/student/.local/bin:/usr/local/bin:/usr/bin:/usr/sbin',
      LANG: 'en_US.UTF-8',
      TERM: 'xterm-256color',
    },
    vfs,
    users: {
      root: {
        username: 'root',
        uid: 0,
        gid: 0,
        home: '/root',
        shell: '/bin/bash',
        comment: 'root',
        passwordSet: true,
        locked: false,
        minDays: 0,
        maxDays: 99999,
        warnDays: 7,
        expireDate: '',
        groups: ['root'],
      },
      apache: {
        username: 'apache',
        uid: 48,
        gid: 48,
        home: '/usr/share/httpd',
        shell: '/sbin/nologin',
        comment: 'Apache',
        passwordSet: false,
        locked: true,
        minDays: 0,
        maxDays: 99999,
        warnDays: 7,
        expireDate: '',
        groups: [],
      },
      sshd: {
        username: 'sshd',
        uid: 74,
        gid: 74,
        home: '/usr/share/empty.sshd',
        shell: '/sbin/nologin',
        comment: 'Privilege-separated SSH',
        passwordSet: false,
        locked: true,
        minDays: 0,
        maxDays: 99999,
        warnDays: 7,
        expireDate: '',
        groups: [],
      },
      student: {
        username: 'student',
        uid: 1000,
        gid: 1000,
        home: '/home/student',
        shell: '/bin/bash',
        comment: 'Lab Student',
        passwordSet: true,
        locked: false,
        minDays: 0,
        maxDays: 99999,
        warnDays: 7,
        expireDate: '',
        groups: ['wheel'],
      },
    },
    groups: {
      root: { name: 'root', gid: 0, members: ['root'] },
      wheel: { name: 'wheel', gid: 10, members: ['student'] },
      apache: { name: 'apache', gid: 48, members: [] },
      sshd: { name: 'sshd', gid: 74, members: [] },
      student: { name: 'student', gid: 1000, members: ['student'] },
    },
    processes: [
      { pid: 1, ppid: 0, user: 'root', cpu: 0.1, mem: 0.5, stat: 'Ss', nice: 0, command: '/usr/lib/systemd/systemd --switched-root', startTime: '09:00', protected: true },
      { pid: 620, ppid: 1, user: 'root', cpu: 0.0, mem: 0.4, stat: 'Ss', nice: 0, command: '/usr/sbin/rsyslogd -n', startTime: '09:00', protected: true },
      { pid: 785, ppid: 1, user: 'root', cpu: 0.2, mem: 0.8, stat: 'Ssl', nice: 0, command: '/usr/sbin/NetworkManager --no-daemon', startTime: '09:00', protected: true },
      { pid: 812, ppid: 1, user: 'chrony', cpu: 0.0, mem: 0.2, stat: 'S', nice: 0, command: '/usr/sbin/chronyd -F 2', startTime: '09:00' },
      { pid: 1024, ppid: 1, user: 'root', cpu: 0.0, mem: 0.3, stat: 'Ss', nice: 0, command: 'sshd: /usr/sbin/sshd -D [listener]', startTime: '09:00' },
      { pid: 1150, ppid: 1, user: 'root', cpu: 0.0, mem: 0.4, stat: 'Ss', nice: 0, command: '/usr/sbin/crond -n', startTime: '09:00' },
      { pid: 1410, ppid: 1024, user: 'student', cpu: 0.0, mem: 0.2, stat: 'Ss', nice: 0, command: '-bash', startTime: '11:55', protected: true },
    ],
    units: {
      'sshd.service': {
        name: 'sshd.service',
        description: 'OpenSSH server daemon',
        loadState: 'loaded',
        activeState: 'active',
        subState: 'running',
        unitFileState: 'enabled',
        pid: 1024,
        ports: ['0.0.0.0:22', '[::]:22'],
      },
      'chronyd.service': {
        name: 'chronyd.service',
        description: 'NTP client/server',
        loadState: 'loaded',
        activeState: 'active',
        subState: 'running',
        unitFileState: 'enabled',
        pid: 812,
        ports: ['127.0.0.1:323'],
      },
      'rsyslog.service': {
        name: 'rsyslog.service',
        description: 'System Logging Service',
        loadState: 'loaded',
        activeState: 'active',
        subState: 'running',
        unitFileState: 'enabled',
        pid: 620,
        ports: [],
      },
      'crond.service': {
        name: 'crond.service',
        description: 'Command Scheduler',
        loadState: 'loaded',
        activeState: 'active',
        subState: 'running',
        unitFileState: 'enabled',
        pid: 1150,
        ports: [],
      },
      'NetworkManager.service': {
        name: 'NetworkManager.service',
        description: 'Network Manager',
        loadState: 'loaded',
        activeState: 'active',
        subState: 'running',
        unitFileState: 'enabled',
        pid: 785,
        ports: [],
      },
      'firewalld.service': {
        name: 'firewalld.service',
        description: 'firewalld - dynamic firewall daemon',
        loadState: 'loaded',
        activeState: 'active',
        subState: 'running',
        unitFileState: 'enabled',
        pid: 790,
        ports: [],
      },
      'httpd.service': {
        name: 'httpd.service',
        description: 'The Apache HTTP Server',
        loadState: 'loaded',
        activeState: 'inactive',
        subState: 'dead',
        unitFileState: 'disabled',
        pid: null,
        ports: [],
        packageRequired: 'httpd',
      },
      'nginx.service': {
        name: 'nginx.service',
        description: 'The nginx HTTP and reverse proxy server',
        loadState: 'loaded',
        activeState: 'inactive',
        subState: 'dead',
        unitFileState: 'disabled',
        pid: null,
        ports: [],
        packageRequired: 'nginx',
      },
    },
    connections: {
      'System ens160': {
        name: 'System ens160',
        uuid: '5fb06bd0-0bb0-7ffb-45f1-d6edd65f3e03',
        type: 'ethernet',
        device: 'ens160',
        state: 'activated',
        ipv4Method: 'auto',
        ipv4Address: '172.25.250.9/24',
        gateway: '172.25.250.254',
        dns: '172.25.250.254',
        autoconnect: true,
      },
      lo: {
        name: 'lo',
        uuid: 'c7913e9b-3f3f-4c28-8f98-99b4f2123456',
        type: 'loopback',
        device: 'lo',
        state: 'activated',
        ipv4Method: 'manual',
        ipv4Address: '127.0.0.1/8',
        gateway: '',
        dns: '',
        autoconnect: true,
      },
    },
    packages: {
      bash: {
        name: 'bash',
        version: '5.1.8',
        release: '9.el9',
        arch: 'x86_64',
        summary: 'The GNU Bourne Again shell',
        installed: true,
        repo: '@System',
        files: ['/usr/bin/bash', '/usr/share/doc/bash/FAQ'],
      },
      openssh: {
        name: 'openssh',
        version: '8.7p1',
        release: '38.el9',
        arch: 'x86_64',
        summary: 'An open source implementation of SSH protocol versions 2',
        installed: true,
        repo: '@System',
        files: ['/etc/ssh/sshd_config', '/usr/sbin/sshd', '/usr/share/doc/openssh/README.md'],
      },
      httpd: {
        name: 'httpd',
        version: '2.4.57',
        release: '8.el9',
        arch: 'x86_64',
        summary: 'Apache HTTP Server',
        installed: false,
        repo: 'rhel-9-appstream',
        files: ['/usr/sbin/httpd', '/etc/httpd/conf/httpd.conf', '/var/www/html/index.html'],
      },
      nginx: {
        name: 'nginx',
        version: '1.20.1',
        release: '16.el9',
        arch: 'x86_64',
        summary: 'A high performance web server and reverse proxy server',
        installed: false,
        repo: 'rhel-9-appstream',
        files: ['/usr/sbin/nginx', '/etc/nginx/nginx.conf'],
      },
      tmux: {
        name: 'tmux',
        version: '3.2a',
        release: '5.el9',
        arch: 'x86_64',
        summary: 'A terminal multiplexer',
        installed: false,
        repo: 'rhel-9-baseos',
        files: ['/usr/bin/tmux'],
      },
      tree: {
        name: 'tree',
        version: '1.8.0',
        release: '10.el9',
        arch: 'x86_64',
        summary: 'File system tree viewer',
        installed: false,
        repo: 'rhel-9-baseos',
        files: ['/usr/bin/tree'],
      },
      'vim-enhanced': {
        name: 'vim-enhanced',
        version: '8.2.2637',
        release: '20.el9',
        arch: 'x86_64',
        summary: 'A version of the VIM editor which includes recent enhancements',
        installed: true,
        repo: '@System',
        files: ['/usr/bin/vim'],
      },
      'bind-utils': {
        name: 'bind-utils',
        version: '9.16.23',
        release: '18.el9',
        arch: 'x86_64',
        summary: 'Utilities for querying DNS name servers',
        installed: false,
        repo: 'rhel-9-appstream',
        files: ['/usr/bin/dig', '/usr/bin/host'],
      },
    },
    journal: [
      { timestamp: 'Nov 20 09:00:01', unit: 'systemd', priority: 'info', pid: 1, message: 'Reached target Multi-User System.' },
      { timestamp: 'Nov 20 09:00:02', unit: 'chronyd.service', priority: 'info', pid: 812, message: 'System clock synchronized to 172.25.250.254.' },
      { timestamp: 'Nov 20 10:02:44', unit: 'sshd.service', priority: 'info', pid: 1024, message: 'Server listening on 0.0.0.0 port 22.' },
      { timestamp: 'Nov 20 10:18:02', unit: 'sshd.service', priority: 'err', pid: 1290, message: 'Failed password for invalid user admin from 198.51.100.77 port 44812 ssh2' },
      { timestamp: 'Nov 20 10:18:05', unit: 'sshd.service', priority: 'warning', pid: 1290, message: 'Disconnecting authenticating user admin 198.51.100.77 port 44812: Too many authentication failures' },
    ],
    blockDevices: [
      { name: 'vda', size: '20G', type: 'disk', fstype: '', uuid: '', mountpoint: null },
      { name: 'vda1', size: '1G', type: 'part', fstype: 'xfs', uuid: '11223344-aabb-ccdd-eeff-001122334455', mountpoint: '/boot', parent: 'vda' },
      { name: 'vda2', size: '19G', type: 'part', fstype: 'xfs', uuid: '9a2b3c4d-1122-3344-5566-778899aabbcc', mountpoint: '/', parent: 'vda' },
      { name: 'vdb', size: '5G', type: 'disk', fstype: '', uuid: '', mountpoint: null },
      { name: 'vdb1', size: '2G', type: 'part', fstype: 'xfs', uuid: '778899aa-bcde-4123-9876-554433221100', mountpoint: null, parent: 'vdb' },
    ],
    firewall: {
      defaultZone: 'public',
      services: ['cockpit', 'dhcpv6-client', 'ssh'],
      ports: [],
      permanentServices: ['cockpit', 'dhcpv6-client', 'ssh'],
    },
    subscriptionRegistered: true,
    sosReports: [],
    remotes: {
      'servera.lab.example.com': {
        hostname: 'servera.lab.example.com',
        ip: '172.25.250.10',
        files: {
          '/etc/redhat-release': 'Red Hat Enterprise Linux release 9.3 (Plow)\n',
          '/home/student/welcome.txt': 'Welcome to servera.lab.example.com\n',
        },
        sshAuthorizedKeys: {
          student: [],
          root: [],
        },
      },
      'serverb.lab.example.com': {
        hostname: 'serverb.lab.example.com',
        ip: '172.25.250.11',
        files: {
          '/etc/redhat-release': 'Red Hat Enterprise Linux release 9.3 (Plow)\n',
          '/home/student/welcome.txt': 'Welcome to serverb.lab.example.com\n',
        },
        sshAuthorizedKeys: {
          student: [],
          root: [],
        },
      },
    },
    sshStack: [],
    sshKeysGenerated: {},
    sshCopiedTo: [],
    dnfHistory: [
      { id: 1, command: 'install vim-enhanced', date: '2026-11-20 08:45', action: 'Install' },
    ],
    timezone: 'America/New_York',
    ntpSync: true,
    commandHistory: [],
    lastExitCode: 0,
    lastCommand: '',
    manPagesViewed: [],
  };

  syncSystemAuthFiles(vm);
  return vm;
}

export function cloneVmState(vm: VmState): VmState {
  return JSON.parse(JSON.stringify(vm)) as VmState;
}
