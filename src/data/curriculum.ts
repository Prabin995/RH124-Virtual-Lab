import { Challenge, Quest, VmState } from '../types/rhel';
import { createVfsDir, createVfsFile } from '../engine/vfsUtils';
import { syncSystemAuthFiles } from '../engine/initialVmState';

export const QUESTS: Quest[] = [
  {
    id: 'quest-01-intro',
    number: 1,
    moduleCode: 'Chapter 1',
    labSlug: 'intro-navigate',
    rhcsaDomain: 'Understand and use essential tools',
    title: 'Get Started with Red Hat Enterprise Linux',
    subtitle: 'OS identity, kernel verification, and lab environment orientation',
    briefing:
      'You are logged into workstation.lab.example.com as student in a 3-host RHEL 9.3 classroom lab (workstation, servera, serverb). Run "lab start intro-navigate", inspect /etc/os-release, verify your identity, and record the kernel release to ~/sysinfo.txt. Verify with "lab grade".',
    xp: 120,
    difficulty: 'Foundational',
    concepts: ['lab CLI', '/etc/os-release', 'uname -r', 'id'],
    lesson: {
      summary:
        'Red Hat Enterprise Linux 9.3 provides predictable enterprise tools across multi-host classroom environments (workstation, servera, serverb) managed with the lab utility.',
      keyPoints: [
        {
          title: 'Red Hat Academy Lab Workflow',
          explanation:
            'Official RH124 labs use "lab start <exercise>" to prepare the lab, "lab grade" to verify objectives, and "lab finish <exercise>" when complete.',
          command: 'lab list',
        },
        {
          title: 'OS Release Identification',
          explanation:
            'RHEL stores distribution metadata in /etc/os-release (key=value format) and /etc/redhat-release (human-readable release string).',
          command: 'cat /etc/os-release',
        },
        {
          title: 'Kernel & Host Verification',
          explanation:
            'uname -r prints the active RHEL 9 kernel release, and id displays your UID, GID, and supplementary groups such as wheel.',
          command: 'uname -r',
        },
      ],
      checkQuestion: {
        prompt: 'Which file contains structured key-value metadata identifying Red Hat Enterprise Linux 9.3?',
        options: ['/etc/os-release', '/var/log/messages', '/home/student/.bashrc'],
        correctIndex: 0,
        explanation: '/etc/os-release stores structured OS identification fields such as NAME, VERSION="9.3 (Plow)", and ID="rhel".',
      },
    },
    objectives: [
      {
        id: 'q1-os',
        title: 'Inspect RHEL 9.3 OS release info',
        description: 'View /etc/os-release or /etc/redhat-release to verify RHEL 9.3.',
        hint: 'Run cat /etc/os-release or cat /etc/redhat-release.',
        commandExample: 'cat /etc/os-release',
        check: (vm) =>
          vm.commandHistory.some((c) => c.includes('/etc/os-release') || c.includes('/etc/redhat-release')),
      },
      {
        id: 'q1-id',
        title: 'Verify user identity and wheel membership',
        description: 'Run id or whoami to inspect your UID, GID, and groups.',
        hint: 'Run id in the terminal.',
        commandExample: 'id',
        check: (vm) => vm.commandHistory.some((c) => c.trim() === 'id' || c.startsWith('id ') || c.trim() === 'whoami'),
      },
      {
        id: 'q1-kernel',
        title: 'Save kernel release to ~/sysinfo.txt',
        description: 'Redirect uname -r output into /home/student/sysinfo.txt.',
        hint: 'Run uname -r > ~/sysinfo.txt',
        commandExample: 'uname -r > ~/sysinfo.txt',
        check: (vm) => {
          const content = vm.vfs['/home/student/sysinfo.txt']?.content || '';
          return content.includes('5.14.0') || content.includes('el9');
        },
      },
    ],
  },
  {
    id: 'quest-02-cli',
    number: 2,
    moduleCode: 'Chapter 2',
    labSlug: 'cli-basics',
    rhcsaDomain: 'Understand and use essential tools',
    title: 'Access the Command Line',
    subtitle: 'Bash shell syntax, environment variables, history, and remote SSH checks',
    briefing:
      'Practice Bash command-line fundamentals: inspect environment variables, export a custom lab variable, verify remote connectivity to servera.lab.example.com using ssh, and review command history.',
    xp: 140,
    difficulty: 'Foundational',
    concepts: ['Bash variables', 'export', 'history', 'ssh servera hostname'],
    lesson: {
      summary:
        'The Bash shell interprets commands, expands variables ($USER, $HOME, $PWD), tracks history, and connects administrators securely to remote lab hosts.',
      keyPoints: [
        {
          title: 'Shell & Environment Variables',
          explanation:
            'env lists exported environment variables. Use export VAR=value to define a variable and echo $VAR to expand it.',
          command: 'echo $USER $HOME',
        },
        {
          title: 'Command History & Recall',
          explanation:
            'Bash stores executed commands in history. Use Up/Down arrows or history to review and repeat previous commands.',
          command: 'history',
        },
        {
          title: 'Connecting Across Lab Hosts',
          explanation:
            'Use ssh student@servera to open an interactive session on servera (type exit to return) or pass a command directly.',
          command: 'ssh student@servera hostname',
        },
      ],
      checkQuestion: {
        prompt: 'How does Bash treat text enclosed in single quotes (\'...\') compared to double quotes ("...")?',
        options: [
          'Single quotes expand $VARIABLES; double quotes suppress all expansion',
          'Single quotes suppress all shell expansion literally; double quotes allow $VARIABLE expansion',
          'Both behave identically in Bash',
        ],
        correctIndex: 1,
        explanation: 'Single quotes preserve every character literally, while double quotes still expand variables like $USER.',
      },
    },
    objectives: [
      {
        id: 'q2-env',
        title: 'Inspect shell environment variables',
        description: 'Run env or echo $PATH to inspect your Bash environment.',
        hint: 'Run env',
        commandExample: 'env',
        check: (vm) => vm.commandHistory.some((c) => c === 'env' || c.startsWith('echo $')),
      },
      {
        id: 'q2-export',
        title: 'Export RH124_HOST=workstation',
        description: 'Set and export the environment variable RH124_HOST with value workstation.',
        hint: 'Run export RH124_HOST=workstation',
        commandExample: 'export RH124_HOST=workstation',
        check: (vm) => vm.env['RH124_HOST'] === 'workstation',
      },
      {
        id: 'q2-ssh-check',
        title: 'Run a remote check on servera',
        description: 'Connect to servera via ssh (e.g., ssh student@servera hostname).',
        hint: 'Run ssh student@servera hostname',
        commandExample: 'ssh student@servera hostname',
        check: (vm) => vm.commandHistory.some((c) => c.startsWith('ssh ') && c.includes('servera')),
      },
    ],
  },
  {
    id: 'quest-03-files',
    number: 3,
    moduleCode: 'Chapter 3',
    labSlug: 'files-manage',
    rhcsaDomain: 'Operate running systems',
    title: 'Manage Files from the Command Line',
    subtitle: 'Filesystem Hierarchy Standard (FHS), brace expansion, hard links, and symlinks',
    briefing:
      'Provision a structured workspace in /home/student/workspace using mkdir -p and brace expansion, copy /srv/data/app.conf, and create both a hard link and a symbolic link.',
    xp: 180,
    difficulty: 'Foundational',
    concepts: ['FHS', 'mkdir -p', 'Brace expansion', 'ln vs ln -s'],
    lesson: {
      summary:
        'Master the RHEL Filesystem Hierarchy Standard (/etc, /var, /srv, /tmp), shell brace expansion for rapid provisioning, and inode-based hard links vs path-based symbolic links.',
      keyPoints: [
        {
          title: 'Parent Creation & Brace Expansion',
          explanation:
            'mkdir -p creates missing parent directories automatically. Combining it with {a,b,c} or {1..3} expands multiple paths in one command.',
          command: 'ls -ld /etc /srv /var',
        },
        {
          title: 'Hard Links (Shared Inode)',
          explanation:
            'ln creates a hard link pointing directly to the same inode number on disk. Deleting the original name leaves the data intact until all links are removed.',
          command: 'ls -li ~/readme.txt',
        },
        {
          title: 'Symbolic Links (Path Pointer)',
          explanation:
            'ln -s creates a soft link storing a path reference. Symlinks can span filesystems and link to directories.',
          command: 'ls -l /bin',
        },
      ],
      checkQuestion: {
        prompt: 'Which statement accurately describes a hard link created with ln?',
        options: [
          'It can point to directories across different filesystems',
          'It shares the exact same inode number as the original file',
          'It breaks immediately if the original filename is deleted',
        ],
        correctIndex: 1,
        explanation: 'Hard links share the same inode and data blocks; symlinks (ln -s) point by path and can link directories.',
      },
    },
    objectives: [
      {
        id: 'q3-dirs',
        title: 'Create /home/student/workspace/{bin,conf,logs}',
        description: 'Create the nested directory structure using mkdir -p and brace expansion.',
        hint: 'Run mkdir -p ~/workspace/{bin,conf,logs}',
        commandExample: 'mkdir -p ~/workspace/{bin,conf,logs}',
        check: (vm) =>
          Boolean(
            vm.vfs['/home/student/workspace/bin'] &&
              vm.vfs['/home/student/workspace/conf'] &&
              vm.vfs['/home/student/workspace/logs']
          ),
      },
      {
        id: 'q3-brace-files',
        title: 'Generate log1.txt through log3.txt',
        description: 'Create log1.txt, log2.txt, and log3.txt inside ~/workspace/logs.',
        hint: 'Run touch ~/workspace/logs/log{1..3}.txt',
        commandExample: 'touch ~/workspace/logs/log{1..3}.txt',
        check: (vm) =>
          Boolean(
            vm.vfs['/home/student/workspace/logs/log1.txt'] &&
              vm.vfs['/home/student/workspace/logs/log2.txt'] &&
              vm.vfs['/home/student/workspace/logs/log3.txt']
          ),
      },
      {
        id: 'q3-copy',
        title: 'Copy /srv/data/app.conf to ~/workspace/conf/',
        description: 'Copy the application configuration into your workspace conf folder.',
        hint: 'Run cp /srv/data/app.conf ~/workspace/conf/',
        commandExample: 'cp /srv/data/app.conf ~/workspace/conf/',
        check: (vm) => Boolean(vm.vfs['/home/student/workspace/conf/app.conf']),
      },
      {
        id: 'q3-links',
        title: 'Create a hard link and a symlink',
        description:
          'Create hard link ~/workspace/app.hard -> ~/workspace/conf/app.conf, and symlink ~/workspace/app.sym -> /srv/data/app.conf.',
        hint: 'ln ~/workspace/conf/app.conf ~/workspace/app.hard && ln -s /srv/data/app.conf ~/workspace/app.sym',
        commandExample: 'ln -s /srv/data/app.conf ~/workspace/app.sym',
        check: (vm) => {
          const orig = vm.vfs['/home/student/workspace/conf/app.conf'];
          const hard = vm.vfs['/home/student/workspace/app.hard'];
          const sym = vm.vfs['/home/student/workspace/app.sym'];
          return Boolean(
            orig && hard && hard.type === 'file' && hard.inodeId === orig.inodeId && sym && sym.type === 'symlink'
          );
        },
      },
    ],
  },
  {
    id: 'quest-04-help',
    number: 4,
    moduleCode: 'Chapter 4',
    labSlug: 'help-man',
    rhcsaDomain: 'Understand and use essential tools',
    title: 'Get Help in Red Hat Enterprise Linux',
    subtitle: 'Manual sections (1, 5, 8), whatis/apropos, and /usr/share/doc',
    briefing:
      'Red Hat administrators rely on built-in manuals rather than memorization. Query the manual database with whatis/apropos, read Section 5 sshd_config documentation, and inspect /usr/share/doc/openssh/README.md.',
    xp: 150,
    difficulty: 'Foundational',
    concepts: ['man sections', 'whatis', 'man -k / apropos', '/usr/share/doc'],
    lesson: {
      summary:
        'Navigate RHEL manual pages by section number, search topics with man -k / apropos, and locate package READMEs in /usr/share/doc.',
      keyPoints: [
        {
          title: 'Manual Sections (1, 5, 8)',
          explanation:
            'Section 1 covers user commands, Section 5 covers config file formats (like sshd_config), and Section 8 covers admin commands (like useradd).',
          command: 'man 5 sshd_config',
        },
        {
          title: 'Fast Keyword Lookup',
          explanation:
            'whatis displays a one-line summary for a command, while man -k (or apropos) searches manual descriptions by keyword.',
          command: 'whatis useradd',
        },
        {
          title: 'Package Documentation',
          explanation:
            'Installed RPM packages place READMEs and sample configs under /usr/share/doc/<package>.',
          command: 'ls /usr/share/doc',
        },
      ],
      checkQuestion: {
        prompt: 'Which manual section documents system configuration file formats such as /etc/ssh/sshd_config?',
        options: ['Section 1', 'Section 5', 'Section 8'],
        correctIndex: 1,
        explanation: 'Section 5 covers file formats and conventions; Section 1 is user commands and Section 8 is system administration commands.',
      },
    },
    objectives: [
      {
        id: 'q4-whatis',
        title: 'Query command summary with whatis or man -k',
        description: 'Use whatis useradd or man -k ssh to search the manual database.',
        hint: 'Run whatis useradd or apropos ssh.',
        commandExample: 'whatis useradd',
        check: (vm) =>
          vm.commandHistory.some((c) => c.startsWith('whatis ') || c.startsWith('apropos ') || c.includes('man -k')),
      },
      {
        id: 'q4-man',
        title: 'Read the sshd_config manual page',
        description: 'Open man 5 sshd_config (press q to exit the pager).',
        hint: 'Type man 5 sshd_config and press Enter.',
        commandExample: 'man 5 sshd_config',
        check: (vm) => vm.manPagesViewed.includes('sshd_config'),
      },
      {
        id: 'q4-doc',
        title: 'Read /usr/share/doc/openssh/README.md',
        description: 'Display the installed package documentation under /usr/share/doc.',
        hint: 'Run cat /usr/share/doc/openssh/README.md.',
        commandExample: 'cat /usr/share/doc/openssh/README.md',
        check: (vm) => vm.commandHistory.some((c) => c.includes('/usr/share/doc/openssh/README.md')),
      },
    ],
  },
  {
    id: 'quest-05-text-vim',
    number: 5,
    moduleCode: 'Chapter 5',
    labSlug: 'text-vim',
    rhcsaDomain: 'Understand and use essential tools',
    title: 'Create, View, and Edit Text Files',
    subtitle: 'I/O redirection, grep/cut/sort pipelines, and Vim three-mode editing',
    briefing:
      'Analyze /home/student/server-inventory.csv using pipelines, extract production servers to ~/prod-hosts.txt, filter ERROR logs into ~/errors.log, and edit ~/motd.draft with vim.',
    xp: 200,
    difficulty: 'Foundational',
    concepts: ['grep / cut / sort', 'Pipes & Redirection', 'sed', 'Vim modes'],
    lesson: {
      summary:
        'Connect filtering commands with pipes (|), redirect stdout/stderr (> / >> / 2>), and edit configuration files reliably in Vim.',
      keyPoints: [
        {
          title: 'I/O Redirection',
          explanation:
            '> overwrites a file with stdout, >> appends, 2> redirects stderr errors, and &> captures both stdout and stderr.',
          command: 'head -n 3 ~/server-inventory.csv',
        },
        {
          title: 'Text Filtering Pipelines',
          explanation:
            'Chain grep (filter rows), cut -d, -f1 (extract comma-delimited columns), and sort (alphabetize) in one pipeline.',
          command: 'grep prod ~/server-inventory.csv | cut -d, -f1',
        },
        {
          title: 'Vim Three-Mode Workflow',
          explanation:
            'Vim opens in Normal mode. Press i to enter Insert mode, Esc to return to Normal mode, and :wq to write and quit.',
          command: 'man vim',
        },
      ],
      checkQuestion: {
        prompt: 'In Vim, what sequence saves your changes and exits the editor from Insert mode?',
        options: ['Ctrl+S then Ctrl+Q', 'Esc, then :wq, then Enter', ':exit! directly while typing'],
        correctIndex: 1,
        explanation: 'Press Esc to leave Insert mode back to Normal mode, then type :wq and press Enter.',
      },
    },
    objectives: [
      {
        id: 'q5-grep-prod',
        title: 'Extract production hostnames to ~/prod-hosts.txt',
        description: 'Filter lines containing "prod" from ~/server-inventory.csv, cut field 1 (-d, -f1), and sort into ~/prod-hosts.txt.',
        hint: 'grep prod ~/server-inventory.csv | cut -d, -f1 | sort > ~/prod-hosts.txt',
        commandExample: 'grep prod ~/server-inventory.csv | cut -d, -f1 | sort > ~/prod-hosts.txt',
        check: (vm) => {
          const txt = vm.vfs['/home/student/prod-hosts.txt']?.content || '';
          return txt.includes('web01.lab') && txt.includes('db01.lab') && !txt.includes('app01.lab');
        },
      },
      {
        id: 'q5-stderr',
        title: 'Capture ERROR lines from /srv/data/sample.log',
        description: 'Write all ERROR entries from /srv/data/sample.log into ~/errors.log.',
        hint: 'grep ERROR /srv/data/sample.log > ~/errors.log',
        commandExample: 'grep ERROR /srv/data/sample.log > ~/errors.log',
        check: (vm) => {
          const txt = vm.vfs['/home/student/errors.log']?.content || '';
          return txt.includes('Connection refused') && !txt.includes('INFO');
        },
      },
      {
        id: 'q5-vim',
        title: 'Create ~/motd.draft using vim',
        description: 'Open vim ~/motd.draft, press i to insert text containing "Authorized Only", press Esc, then type :wq.',
        hint: 'Run vim ~/motd.draft, press i, type "Authorized Only", press Esc, type :wq and Enter.',
        commandExample: 'vim ~/motd.draft',
        check: (vm) => {
          const txt = (vm.vfs['/home/student/motd.draft']?.content || '').toLowerCase();
          return txt.includes('authorized');
        },
      },
    ],
  },
  {
    id: 'quest-06-users',
    number: 6,
    moduleCode: 'Chapter 6',
    labSlug: 'users-groups',
    rhcsaDomain: 'Manage users and groups',
    title: 'Manage Local Users and Groups',
    subtitle: 'Local accounts, password aging policies, and /etc/sudoers.d/ delegation',
    briefing:
      'Onboard a new engineer named "devon". Create the "devops" group, provision devon with /bin/bash in devops, enforce a 90-day password expiration policy with chage, and grant %devops sudo rights in /etc/sudoers.d/devops.',
    xp: 240,
    difficulty: 'Intermediate',
    concepts: ['groupadd', 'useradd', 'usermod -aG', 'chage', '/etc/sudoers.d/'],
    lesson: {
      summary:
        'Local user and group accounts are stored in /etc/passwd, /etc/shadow, and /etc/group. Delegate superuser tasks cleanly via /etc/sudoers.d/ drop-in files.',
      keyPoints: [
        {
          title: 'Groups & Users',
          explanation:
            'Create supplementary groups with groupadd before assigning users via useradd -G <group> -s /bin/bash <user>.',
          command: 'tail -n 4 /etc/passwd',
        },
        {
          title: 'Appending Groups Safely (usermod -aG)',
          explanation:
            'Always pair -a with -G in usermod -aG. Omitting -a overwrites existing supplementary groups!',
          command: 'grep wheel /etc/group',
        },
        {
          title: 'Password Aging & Sudo Drop-ins',
          explanation:
            'Use chage -M 90 -W 7 <user> to enforce rotation policies, and place custom sudo rules in /etc/sudoers.d/ rather than editing /etc/sudoers directly.',
          command: 'sudo cat /etc/sudoers.d/student',
        },
      ],
      checkQuestion: {
        prompt: 'Why must you include -a when adding a supplementary group with usermod -G?',
        options: [
          'Without -a, existing supplementary groups are replaced',
          '-a automatically sets the user login shell to /bin/bash',
          '-a unlocks the account password in /etc/shadow',
        ],
        correctIndex: 0,
        explanation: 'usermod -G without -a replaces the user’s supplementary group list; always use usermod -aG.',
      },
    },
    objectives: [
      {
        id: 'q6-group',
        title: 'Create the devops group',
        description: 'Use sudo groupadd devops to create the supplementary group.',
        hint: 'sudo groupadd devops',
        commandExample: 'sudo groupadd devops',
        check: (vm) => Boolean(vm.groups['devops']),
      },
      {
        id: 'q6-user',
        title: 'Create user devon in group devops',
        description: 'Provision user devon with /bin/bash and supplementary group devops.',
        hint: 'sudo useradd -G devops -s /bin/bash devon',
        commandExample: 'sudo useradd -G devops -s /bin/bash devon',
        check: (vm) => {
          const u = vm.users['devon'];
          return Boolean(u && u.groups.includes('devops') && u.shell === '/bin/bash');
        },
      },
      {
        id: 'q6-chage',
        title: 'Enforce 90-day password expiration for devon',
        description: 'Set maximum password age to 90 days and warning to 7 days with chage.',
        hint: 'sudo chage -M 90 -W 7 devon',
        commandExample: 'sudo chage -M 90 -W 7 devon',
        check: (vm) => vm.users['devon']?.maxDays === 90,
      },
      {
        id: 'q6-sudoers',
        title: 'Configure /etc/sudoers.d/devops',
        description: 'Create /etc/sudoers.d/devops containing "%devops ALL=(ALL) NOPASSWD: ALL".',
        hint: 'echo "%devops ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/devops',
        commandExample: 'echo "%devops ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/devops',
        check: (vm) => (vm.vfs['/etc/sudoers.d/devops']?.content || '').includes('%devops'),
      },
    ],
  },
  {
    id: 'quest-07-permissions',
    number: 7,
    moduleCode: 'Chapter 7',
    labSlug: 'permissions-access',
    rhcsaDomain: 'Understand and use essential tools',
    title: 'Control Access to Files',
    subtitle: 'POSIX permissions, ownership, SGID collaboration (2770), and Sticky Bit (1777)',
    briefing:
      'Configure a shared engineering directory at /srv/devops owned by group devops with mode 2770 (SGID inheritance), and create a shared dropbox at /srv/dropbox protected with the sticky bit (1777).',
    xp: 260,
    difficulty: 'Intermediate',
    concepts: ['chmod octal & symbolic', 'chown :group', 'SGID (2770)', 'Sticky Bit (1777)', 'umask'],
    lesson: {
      summary:
        'POSIX permissions (r=4, w=2, x=1) govern access for User, Group, and Others. Special bits (SUID=4, SGID=2, Sticky=1) enable secure multi-user directories.',
      keyPoints: [
        {
          title: 'Octal & Symbolic Modes',
          explanation:
            'chmod 750 grants rwx to owner, r-x to group, and --- to others. Symbolic syntax like g+w,o-rwx adjusts specific bits incrementally.',
          command: 'ls -ld /srv/data /tmp',
        },
        {
          title: 'SGID on Directories (2xxx)',
          explanation:
            'Setting SGID (chmod 2770) on a shared directory forces all newly created files inside it to inherit the directory’s group ownership.',
          command: 'stat /tmp',
        },
        {
          title: 'Sticky Bit on Shared Dropboxes (1xxx)',
          explanation:
            'The sticky bit (chmod 1777, shown as t) ensures users in a shared directory can only delete files they personally own.',
          command: 'umask',
        },
      ],
      checkQuestion: {
        prompt: 'Which octal permission mode configures a shared directory so new files inherit the directory group and others have zero access?',
        options: ['1777', '2770', '4755'],
        correctIndex: 1,
        explanation: '2 = SGID (group inheritance), 7 = owner rwx, 7 = group rwx, 0 = others none (2770).',
      },
    },
    setupVm: (vm) => {
      if (!vm.groups['devops']) {
        vm.groups['devops'] = { name: 'devops', gid: vm.nextGid++, members: ['student'] };
        syncSystemAuthFiles(vm);
      }
      return vm;
    },
    objectives: [
      {
        id: 'q7-mkdir',
        title: 'Create /srv/devops and /srv/dropbox',
        description: 'Create both directories under /srv using sudo mkdir.',
        hint: 'sudo mkdir -p /srv/devops /srv/dropbox',
        commandExample: 'sudo mkdir -p /srv/devops /srv/dropbox',
        check: (vm) => Boolean(vm.vfs['/srv/devops'] && vm.vfs['/srv/dropbox']),
      },
      {
        id: 'q7-chown',
        title: 'Assign group devops to /srv/devops',
        description: 'Change group ownership of /srv/devops to devops.',
        hint: 'sudo chown :devops /srv/devops',
        commandExample: 'sudo chown :devops /srv/devops',
        check: (vm) => vm.vfs['/srv/devops']?.group === 'devops',
      },
      {
        id: 'q7-sgid',
        title: 'Set mode 2770 (rwxrws---) on /srv/devops',
        description: 'Apply SGID + full owner/group rwx and zero other permissions.',
        hint: 'sudo chmod 2770 /srv/devops',
        commandExample: 'sudo chmod 2770 /srv/devops',
        check: (vm) => {
          const n = vm.vfs['/srv/devops'];
          return Boolean(n && n.sgid && (n.mode & 0o777) === 0o770);
        },
      },
      {
        id: 'q7-sticky',
        title: 'Set sticky bit 1777 (rwxrwxrwt) on /srv/dropbox',
        description: 'Ensure users can add files to /srv/dropbox without deleting others’ files.',
        hint: 'sudo chmod 1777 /srv/dropbox',
        commandExample: 'sudo chmod 1777 /srv/dropbox',
        check: (vm) => {
          const n = vm.vfs['/srv/dropbox'];
          return Boolean(n && n.sticky && (n.mode & 0o777) === 0o777);
        },
      },
    ],
  },
  {
    id: 'quest-08-processes',
    number: 8,
    moduleCode: 'Chapter 8',
    labSlug: 'processes-monitor',
    rhcsaDomain: 'Operate running systems',
    title: 'Monitor and Manage Linux Processes',
    subtitle: 'Process inspection, scheduling niceness, background jobs, and signals',
    briefing:
      'A runaway CPU-bound job ("rogue-burn", PID 4412) is consuming 98.7% CPU on workstation. Identify its PID, terminate it cleanly, and launch a low-priority background job with nice.',
    xp: 250,
    difficulty: 'Intermediate',
    concepts: ['ps aux / top', 'pgrep', 'kill / pkill', 'nice / renice'],
    lesson: {
      summary:
        'Monitor CPU/memory utilization across running processes, control scheduling priority with nice/renice, and terminate misbehaving tasks via signals.',
      keyPoints: [
        {
          title: 'Inspecting Processes',
          explanation:
            'ps aux lists all processes with %CPU and %MEM, top sorts by resource load, and pgrep -l <name> quickly locates matching PIDs.',
          command: 'ps aux',
        },
        {
          title: 'Sending Signals (SIGTERM vs SIGKILL)',
          explanation:
            'kill <PID> sends SIGTERM (15) to request a graceful shutdown. Use kill -9 <PID> (SIGKILL) only if a process ignores SIGTERM.',
          command: 'kill -l',
        },
        {
          title: 'Process Priority (Niceness)',
          explanation:
            'Niceness ranges from -20 (highest priority, root only) to +19 (lowest priority). Launch low-priority batch jobs with nice -n 15 <cmd>.',
          command: 'top',
        },
      ],
      checkQuestion: {
        prompt: 'Which signal does the kill command send by default when no signal number is specified?',
        options: ['SIGKILL (9)', 'SIGTERM (15)', 'SIGHUP (1)'],
        correctIndex: 1,
        explanation: 'kill defaults to SIGTERM (15), allowing processes to clean up before exiting.',
      },
    },
    setupVm: (vm) => {
      vm.processes.push({
        pid: 4412,
        ppid: 1,
        user: 'student',
        cpu: 98.7,
        mem: 1.2,
        stat: 'R',
        nice: 0,
        command: '/usr/local/bin/rogue-burn --loops=inf',
        startTime: '11:42',
      });
      return vm;
    },
    objectives: [
      {
        id: 'q8-inspect',
        title: 'Inspect active processes',
        description: 'Run ps aux, top, or pgrep to locate the runaway process.',
        hint: 'Run ps aux or top or pgrep -l rogue.',
        commandExample: 'pgrep -l rogue',
        check: (vm) =>
          vm.commandHistory.some((c) => c.startsWith('ps') || c.startsWith('top') || c.startsWith('pgrep')),
      },
      {
        id: 'q8-kill',
        title: 'Terminate PID 4412 (rogue-burn)',
        description: 'Send a termination signal to kill the rogue-burn process.',
        hint: 'Run kill 4412 (or pkill rogue-burn).',
        commandExample: 'kill 4412',
        check: (vm) => !vm.processes.some((p) => p.pid === 4412 || p.command.includes('rogue-burn')),
      },
      {
        id: 'q8-nice',
        title: 'Start a low-priority background task (nice >= 10)',
        description: 'Run nice -n 15 sleep 600 (or any command with nice >= 10).',
        hint: 'Run nice -n 15 sleep 600',
        commandExample: 'nice -n 15 sleep 600',
        check: (vm) => vm.processes.some((p) => p.nice >= 10 && p.isBackgroundJob),
      },
    ],
  },
  {
    id: 'quest-09-systemd',
    number: 9,
    moduleCode: 'Chapter 9',
    labSlug: 'services-systemd',
    rhcsaDomain: 'Operate running systems',
    title: 'Control Services and Daemons',
    subtitle: 'Systemd unit states, unmasking, boot persistence, and socket verification',
    briefing:
      'Deploy the Apache HTTP Server (httpd). Notice httpd is currently masked and not installed. Install httpd via dnf, unmask httpd.service, enable and start it, and verify port 80 with ss or curl.',
    xp: 280,
    difficulty: 'Intermediate',
    concepts: ['systemctl unmask', 'systemctl enable --now', 'systemctl status', 'ss -tulpn', 'curl'],
    lesson: {
      summary:
        'systemd is PID 1 on RHEL 9 and manages service lifecycles, boot target dependencies, and unit masking.',
      keyPoints: [
        {
          title: 'Runtime vs Boot Persistence',
          explanation:
            'systemctl start activates a daemon right now; systemctl enable configures it to start at boot. Combine both with systemctl enable --now <unit>.',
          command: 'systemctl status sshd',
        },
        {
          title: 'Masked Units',
          explanation:
            'A masked unit is symlinked to /dev/null and cannot be started manually or automatically until you run systemctl unmask <unit>.',
          command: 'systemctl list-unit-files',
        },
        {
          title: 'Verifying Listening Sockets',
          explanation:
            'Use ss -tulpn to confirm a daemon is listening on its expected TCP/UDP port, and curl to test HTTP responses.',
          command: 'ss -tulpn',
        },
      ],
      checkQuestion: {
        prompt: 'What must you do before starting a systemd service whose load state is masked?',
        options: [
          'Run systemctl reload on the unit',
          'Run sudo systemctl unmask <unit>',
          'Reboot the server twice',
        ],
        correctIndex: 1,
        explanation: 'Masked units point to /dev/null; you must run systemctl unmask <unit> before starting or enabling them.',
      },
    },
    setupVm: (vm) => {
      vm.units['httpd.service'].loadState = 'masked';
      vm.units['httpd.service'].unitFileState = 'masked';
      return vm;
    },
    objectives: [
      {
        id: 'q9-install',
        title: 'Install the httpd package',
        description: 'Use sudo dnf install -y httpd.',
        hint: 'sudo dnf install -y httpd',
        commandExample: 'sudo dnf install -y httpd',
        check: (vm) => Boolean(vm.packages['httpd']?.installed),
      },
      {
        id: 'q9-unmask',
        title: 'Unmask httpd.service',
        description: 'Remove the mask symlink blocking httpd from starting.',
        hint: 'sudo systemctl unmask httpd',
        commandExample: 'sudo systemctl unmask httpd',
        check: (vm) => vm.units['httpd.service']?.loadState === 'loaded',
      },
      {
        id: 'q9-enable-now',
        title: 'Start and enable httpd.service',
        description: 'Ensure httpd is both active (running) and enabled at boot.',
        hint: 'sudo systemctl enable --now httpd',
        commandExample: 'sudo systemctl enable --now httpd',
        check: (vm) => {
          const u = vm.units['httpd.service'];
          return Boolean(u && u.activeState === 'active' && u.unitFileState === 'enabled');
        },
      },
      {
        id: 'q9-verify',
        title: 'Verify HTTP port 80 via ss or curl',
        description: 'Check listening sockets with ss -tulpn or fetch http://localhost with curl.',
        hint: 'curl http://localhost',
        commandExample: 'curl http://localhost',
        check: (vm) =>
          vm.commandHistory.some((c) => c.startsWith('curl') || c.startsWith('ss')),
      },
    ],
  },
  {
    id: 'quest-10-ssh',
    number: 10,
    moduleCode: 'Chapter 10',
    labSlug: 'openssh-secure',
    rhcsaDomain: 'Manage security',
    title: 'Configure and Secure SSH',
    subtitle: 'Ed25519 key pairs, ssh-copy-id, and sshd_config hardening',
    briefing:
      'Set up passwordless Ed25519 key authentication to serverb.lab.example.com, then harden /etc/ssh/sshd_config on workstation by disabling root login and password authentication, and reload sshd.',
    xp: 300,
    difficulty: 'Intermediate',
    concepts: ['ssh-keygen -t ed25519', 'ssh-copy-id', '/etc/ssh/sshd_config', 'systemctl reload sshd'],
    lesson: {
      summary:
        'OpenSSH provides encrypted remote administration across RHEL hosts. Production hardening replaces root and password logins with key-based auth.',
      keyPoints: [
        {
          title: 'Generating Ed25519 Keys',
          explanation:
            'ssh-keygen -t ed25519 creates a private key (~/.ssh/id_ed25519) and public key (~/.ssh/id_ed25519.pub). Never share the private key.',
          command: 'ls -la /etc/ssh',
        },
        {
          title: 'Deploying Public Keys',
          explanation:
            'ssh-copy-id user@host appends your public key to the remote host’s ~/.ssh/authorized_keys file with proper permissions.',
          command: 'man 1 ssh-copy-id',
        },
        {
          title: 'Hardening /etc/ssh/sshd_config',
          explanation:
            'Set PermitRootLogin no and PasswordAuthentication no in /etc/ssh/sshd_config, then run sudo systemctl reload sshd to apply.',
          command: 'cat /etc/ssh/sshd_config',
        },
      ],
      checkQuestion: {
        prompt: 'After modifying /etc/ssh/sshd_config, which command applies the changes without terminating active SSH sessions?',
        options: ['sudo systemctl reload sshd', 'ssh-keygen -t ed25519', 'sudo hostnamectl reload'],
        correctIndex: 0,
        explanation: 'systemctl reload sshd tells the SSH daemon to re-read /etc/ssh/sshd_config gracefully.',
      },
    },
    objectives: [
      {
        id: 'q10-keygen',
        title: 'Generate an Ed25519 SSH key pair',
        description: 'Create ~/.ssh/id_ed25519 and ~/.ssh/id_ed25519.pub using ssh-keygen.',
        hint: 'ssh-keygen -t ed25519',
        commandExample: 'ssh-keygen -t ed25519',
        check: (vm) => Boolean(vm.vfs['/home/student/.ssh/id_ed25519.pub']),
      },
      {
        id: 'q10-copy',
        title: 'Copy your public key to serverb.lab.example.com',
        description: 'Install your SSH key for student@serverb.lab.example.com.',
        hint: 'ssh-copy-id student@serverb.lab.example.com',
        commandExample: 'ssh-copy-id student@serverb.lab.example.com',
        check: (vm) => vm.sshCopiedTo.includes('student@serverb.lab.example.com'),
      },
      {
        id: 'q10-harden',
        title: 'Disable root & password auth in /etc/ssh/sshd_config',
        description: 'Set PermitRootLogin no and PasswordAuthentication no in /etc/ssh/sshd_config.',
        hint: 'sudo vim /etc/ssh/sshd_config (change yes to no for PermitRootLogin and PasswordAuthentication, then :wq).',
        commandExample: 'sudo vim /etc/ssh/sshd_config',
        check: (vm) => {
          const cfg = vm.vfs['/etc/ssh/sshd_config']?.content || '';
          return /^\s*PermitRootLogin\s+no/m.test(cfg) && /^\s*PasswordAuthentication\s+no/m.test(cfg);
        },
      },
      {
        id: 'q10-reload',
        title: 'Reload sshd.service',
        description: 'Apply your sshd_config changes without dropping active sessions.',
        hint: 'sudo systemctl reload sshd',
        commandExample: 'sudo systemctl reload sshd',
        check: (vm) =>
          vm.commandHistory.some((c) => c.includes('systemctl') && (c.includes('reload') || c.includes('restart')) && c.includes('sshd')),
      },
    ],
  },
  {
    id: 'quest-11-logs',
    number: 11,
    moduleCode: 'Chapter 11',
    labSlug: 'logging-journald',
    rhcsaDomain: 'Operate running systems',
    title: 'Analyze and Store Logs',
    subtitle: 'rsyslog files, journalctl filtering, persistent journald, and logger',
    briefing:
      'Investigate failed SSH login attempts using journalctl and /var/log/secure, record the attacking IP address to ~/attacker.txt, configure systemd-journald for persistent storage, and send a test syslog message with logger.',
    xp: 280,
    difficulty: 'Intermediate',
    concepts: ['journalctl -u / -p', '/var/log/secure', 'journald.conf Storage=persistent', 'logger'],
    lesson: {
      summary:
        'RHEL 9 combines rsyslog text logs under /var/log/ with the structured binary systemd journal queried by journalctl.',
      keyPoints: [
        {
          title: 'Rsyslog Files (/var/log)',
          explanation:
            '/var/log/messages stores general system events, while /var/log/secure records authentication, sudo, and SSH security events.',
          command: 'sudo tail -n 5 /var/log/secure',
        },
        {
          title: 'Filtering the Systemd Journal',
          explanation:
            'Use journalctl -u <unit> to isolate a specific service, and -p err to filter errors and higher severity events.',
          command: 'journalctl -p err',
        },
        {
          title: 'Enabling Persistent Journal Storage',
          explanation:
            'By default, journald stores logs in volatile /run/log/journal. Setting Storage=persistent in /etc/systemd/journald.conf preserves logs across reboots.',
          command: 'cat /etc/systemd/journald.conf',
        },
      ],
      checkQuestion: {
        prompt: 'Which /var/log file records SSH authentication attempts and sudo command usage on RHEL 9?',
        options: ['/var/log/dnf.log', '/var/log/secure', '/var/log/messages'],
        correctIndex: 1,
        explanation: '/var/log/secure captures security and authentication messages from sshd, sudo, and PAM.',
      },
    },
    objectives: [
      {
        id: 'q11-journal',
        title: 'Query sshd errors via journalctl',
        description: 'Inspect SSH unit logs or error priority entries using journalctl.',
        hint: 'journalctl -u sshd (or journalctl -p err)',
        commandExample: 'journalctl -u sshd',
        check: (vm) => vm.commandHistory.some((c) => c.startsWith('journalctl')),
      },
      {
        id: 'q11-attacker',
        title: 'Save attacker IP to ~/attacker.txt',
        description: 'Find the IP failing SSH login in /var/log/secure or journalctl and write it to ~/attacker.txt.',
        hint: 'sudo grep "Failed password" /var/log/secure -> IP is 198.51.100.77. Save with: echo 198.51.100.77 > ~/attacker.txt',
        commandExample: 'echo 198.51.100.77 > ~/attacker.txt',
        check: (vm) => (vm.vfs['/home/student/attacker.txt']?.content || '').includes('198.51.100.77'),
      },
      {
        id: 'q11-persist',
        title: 'Enable persistent journald storage',
        description: 'Uncomment and set Storage=persistent in /etc/systemd/journald.conf.',
        hint: 'sudo sed -i "s/#Storage=auto/Storage=persistent/" /etc/systemd/journald.conf (or use sudo vim)',
        commandExample: 'sudo vim /etc/systemd/journald.conf',
        check: (vm) => {
          const cfg = vm.vfs['/etc/systemd/journald.conf']?.content || '';
          return /^\s*Storage=persistent/m.test(cfg) || Boolean(vm.vfs['/var/log/journal']);
        },
      },
      {
        id: 'q11-logger',
        title: 'Write a test event with logger',
        description: 'Use logger to send a custom audit message to /var/log/messages.',
        hint: 'logger -p user.notice "RH124 audit complete"',
        commandExample: 'logger "RH124 audit complete"',
        check: (vm) => vm.commandHistory.some((c) => c.startsWith('logger ')),
      },
    ],
  },
  {
    id: 'quest-12-networking',
    number: 12,
    moduleCode: 'Chapter 12',
    labSlug: 'network-nmcli',
    rhcsaDomain: 'Configure basic networking',
    title: 'Manage Networking',
    subtitle: 'NetworkManager connection profiles (nmcli), hostnamectl, and DNS tests',
    briefing:
      'Set the static hostname to servera.lab.example.com, create and activate a static NetworkManager connection profile "static-ens160" on ens160 (172.25.250.10/24, gateway 172.25.250.254, DNS 172.25.250.254), and verify connectivity to serverb.',
    xp: 320,
    difficulty: 'Advanced',
    concepts: ['hostnamectl', 'nmcli con add', 'nmcli con up', 'ip addr / route', 'ping / dig'],
    lesson: {
      summary:
        'NetworkManager manages RHEL 9 interfaces through connection profiles (nmcli), distinct from the underlying kernel device name (ens160).',
      keyPoints: [
        {
          title: 'Inspecting Interfaces & Profiles',
          explanation:
            'ip addr and ip route show active IPv4 addresses and default routes; nmcli dev status and nmcli con show list NetworkManager profiles.',
          command: 'nmcli con show',
        },
        {
          title: 'Creating Static IPv4 Profiles',
          explanation:
            'Use nmcli con add type ethernet con-name <name> ifname ens160 ipv4.method manual ipv4.addresses <IP/CIDR> ipv4.gateway <GW> ipv4.dns <DNS>.',
          command: 'ip addr',
        },
        {
          title: 'Activating & Hostname Resolution',
          explanation:
            'New profiles remain inactive until you run nmcli con up <name>. Set permanent hostnames with hostnamectl set-hostname and test DNS with dig/host.',
          command: 'hostnamectl',
        },
      ],
      checkQuestion: {
        prompt: 'After running nmcli con add to create a new connection profile, what command activates it on the interface?',
        options: ['nmcli dev refresh', 'sudo nmcli con up <con-name>', 'systemctl restart sshd'],
        correctIndex: 1,
        explanation: 'nmcli con up <con-name> activates the newly added or modified connection profile.',
      },
    },
    objectives: [
      {
        id: 'q12-host',
        title: 'Set static hostname to servera.lab.example.com',
        description: 'Update the system hostname permanently using hostnamectl.',
        hint: 'sudo hostnamectl set-hostname servera.lab.example.com',
        commandExample: 'sudo hostnamectl set-hostname servera.lab.example.com',
        check: (vm) => vm.hostname === 'servera.lab.example.com',
      },
      {
        id: 'q12-nmcli-add',
        title: 'Create static-ens160 with 172.25.250.10/24',
        description: 'Add a manual IPv4 profile named static-ens160 on ens160 with gateway and DNS 172.25.250.254.',
        hint: 'sudo nmcli con add type ethernet con-name static-ens160 ifname ens160 ipv4.method manual ipv4.addresses 172.25.250.10/24 ipv4.gateway 172.25.250.254 ipv4.dns 172.25.250.254',
        commandExample:
          'sudo nmcli con add type ethernet con-name static-ens160 ifname ens160 ipv4.method manual ipv4.addresses 172.25.250.10/24 ipv4.gateway 172.25.250.254 ipv4.dns 172.25.250.254',
        check: (vm) => {
          const con = vm.connections['static-ens160'];
          return Boolean(
            con &&
              con.device === 'ens160' &&
              con.ipv4Method === 'manual' &&
              con.ipv4Address === '172.25.250.10/24' &&
              con.gateway === '172.25.250.254'
          );
        },
      },
      {
        id: 'q12-nmcli-up',
        title: 'Activate static-ens160',
        description: 'Bring up the new profile with nmcli con up.',
        hint: 'sudo nmcli con up static-ens160',
        commandExample: 'sudo nmcli con up static-ens160',
        check: (vm) => vm.connections['static-ens160']?.state === 'activated',
      },
      {
        id: 'q12-ping',
        title: 'Verify connectivity to serverb.lab.example.com',
        description: 'Test name resolution and ICMP reachability with ping or dig.',
        hint: 'ping serverb.lab.example.com',
        commandExample: 'ping serverb.lab.example.com',
        check: (vm) => vm.commandHistory.some((c) => (c.startsWith('ping ') || c.startsWith('dig ')) && c.includes('serverb')),
      },
    ],
  },
  {
    id: 'quest-13-archive',
    number: 13,
    moduleCode: 'Chapter 13',
    labSlug: 'archive-transfer',
    rhcsaDomain: 'Understand and use essential tools',
    title: 'Archive and Transfer Files',
    subtitle: 'Compressed tar archives, secure copy (scp), and incremental rsync',
    briefing:
      'Create a gzip-compressed tar archive of /etc/ssh at /tmp/ssh-backup.tar.gz, inspect its contents with tar -tf, and securely transfer it to serverb.lab.example.com:/tmp/ using scp or rsync.',
    xp: 260,
    difficulty: 'Intermediate',
    concepts: ['tar -czvf', 'tar -tf', 'scp', 'rsync'],
    lesson: {
      summary:
        'Administrators package directories with tar and compression flags (-z gzip, -j bzip2, -J xz), then transfer backups across hosts via scp, sftp, or rsync.',
      keyPoints: [
        {
          title: 'Creating & Listing Archives',
          explanation:
            'tar -czvf <archive.tar.gz> <paths> creates a gzip-compressed tarball; tar -tf <archive> lists contents without extracting.',
          command: 'ls -ld /etc/ssh',
        },
        {
          title: 'Secure Copy Across Hosts',
          explanation:
            'scp uses SSH encryption to copy files between workstation and remote hosts like student@serverb.lab.example.com:/tmp/.',
          command: 'man scp',
        },
        {
          title: 'Efficient Synchronization with rsync',
          explanation:
            'rsync transfers only changed deltas between source and destination, ideal for recurring backups.',
          command: 'man rsync',
        },
      ],
      checkQuestion: {
        prompt: 'Which tar option combination lists the contents of a compressed archive without extracting any files?',
        options: ['tar -xzvf archive.tar.gz', 'tar -tf archive.tar.gz', 'tar -czvf archive.tar.gz'],
        correctIndex: 1,
        explanation: '-t lists archive members without extracting them to disk.',
      },
    },
    objectives: [
      {
        id: 'q13-tar',
        title: 'Archive /etc/ssh into /tmp/ssh-backup.tar.gz',
        description: 'Create a gzipped tar archive of /etc/ssh.',
        hint: 'sudo tar -czvf /tmp/ssh-backup.tar.gz /etc/ssh',
        commandExample: 'sudo tar -czvf /tmp/ssh-backup.tar.gz /etc/ssh',
        check: (vm) => Boolean(vm.vfs['/tmp/ssh-backup.tar.gz']),
      },
      {
        id: 'q13-tar-list',
        title: 'Inspect archive contents with tar -tf',
        description: 'Verify the contents of /tmp/ssh-backup.tar.gz using tar -tf.',
        hint: 'tar -tf /tmp/ssh-backup.tar.gz',
        commandExample: 'tar -tf /tmp/ssh-backup.tar.gz',
        check: (vm) => vm.commandHistory.some((c) => c.includes('tar') && c.includes('-t') && c.includes('ssh-backup')),
      },
      {
        id: 'q13-transfer',
        title: 'Transfer backup to serverb.lab.example.com:/tmp/',
        description: 'Use scp or rsync to copy /tmp/ssh-backup.tar.gz to serverb.',
        hint: 'scp /tmp/ssh-backup.tar.gz student@serverb.lab.example.com:/tmp/',
        commandExample: 'scp /tmp/ssh-backup.tar.gz student@serverb.lab.example.com:/tmp/',
        check: (vm) => Boolean(vm.remotes['serverb.lab.example.com']?.files['/tmp/ssh-backup.tar.gz']),
      },
    ],
  },
  {
    id: 'quest-14-software',
    number: 14,
    moduleCode: 'Chapter 14',
    labSlug: 'software-dnf',
    rhcsaDomain: 'Deploy, configure, and maintain systems',
    title: 'Install and Update Software Packages',
    subtitle: 'DNF repositories, RPM file ownership queries, and time synchronization',
    briefing:
      'Search and install the "tmux" package with dnf, query which RPM owns /etc/ssh/sshd_config using rpm -qf, review dnf transaction history, and switch the system timezone to UTC with timedatectl.',
    xp: 280,
    difficulty: 'Intermediate',
    concepts: ['dnf install / history', 'rpm -qf / -qa', 'timedatectl', 'chronyc sources'],
    lesson: {
      summary:
        'RHEL 9 manages software through BaseOS and AppStream DNF repositories backed by RPM metadata, while timedatectl and chronyd keep system clocks accurate.',
      keyPoints: [
        {
          title: 'DNF Package Operations',
          explanation:
            'dnf search finds packages, dnf install -y <pkg> resolves dependencies, and dnf history audits past transactions.',
          command: 'dnf history',
        },
        {
          title: 'RPM Database Queries',
          explanation:
            'rpm -qf <file> identifies which installed RPM owns a configuration file, and rpm -ql <pkg> lists all files installed by a package.',
          command: 'rpm -qf /etc/ssh/sshd_config',
        },
        {
          title: 'Timezones & Chrony NTP',
          explanation:
            'timedatectl set-timezone <Zone> updates the system timezone, and chronyc sources verifies NTP synchronization.',
          command: 'timedatectl',
        },
      ],
      checkQuestion: {
        prompt: 'Which rpm query flag identifies which installed package owns a specific file on disk?',
        options: ['rpm -qa', 'rpm -qf /path/to/file', 'rpm -ql'],
        correctIndex: 1,
        explanation: 'rpm -qf queries the file owner; -qa lists all packages and -ql lists files inside a package.',
      },
    },
    objectives: [
      {
        id: 'q14-dnf',
        title: 'Install tmux via dnf',
        description: 'Install the tmux terminal multiplexer package.',
        hint: 'sudo dnf install -y tmux',
        commandExample: 'sudo dnf install -y tmux',
        check: (vm) => Boolean(vm.packages['tmux']?.installed),
      },
      {
        id: 'q14-rpm',
        title: 'Query /etc/ssh/sshd_config owner with rpm -qf',
        description: 'Identify the RPM package owning /etc/ssh/sshd_config.',
        hint: 'rpm -qf /etc/ssh/sshd_config',
        commandExample: 'rpm -qf /etc/ssh/sshd_config',
        check: (vm) => vm.commandHistory.some((c) => c.includes('rpm') && c.includes('-qf')),
      },
      {
        id: 'q14-time',
        title: 'Set system timezone to UTC',
        description: 'Use timedatectl to change the timezone to UTC.',
        hint: 'sudo timedatectl set-timezone UTC',
        commandExample: 'sudo timedatectl set-timezone UTC',
        check: (vm) => vm.timezone === 'UTC',
      },
    ],
  },
  {
    id: 'quest-15-filesystems',
    number: 15,
    moduleCode: 'Chapter 15',
    labSlug: 'filesystems-mount',
    rhcsaDomain: 'Configure local storage',
    title: 'Access Linux File Systems',
    subtitle: 'Block devices (lsblk/blkid), mounting XFS partitions, and disk usage (df/du)',
    briefing:
      'A 2G XFS partition (/dev/vdb1) is attached to workstation but unmounted. Inspect block devices and UUIDs with lsblk -f and blkid, mount /dev/vdb1 onto /mnt/data, verify disk space with df -h and du -sh /srv, and check open files with lsof.',
    xp: 310,
    difficulty: 'Intermediate',
    concepts: ['lsblk -f', 'blkid', 'mount / umount', 'df -h / du -sh', 'lsof'],
    lesson: {
      summary:
        'Before accessing secondary storage in RHEL 9, administrators identify block devices and UUIDs with lsblk/blkid, mount them onto directory mount points, and monitor capacity via df and du.',
      keyPoints: [
        {
          title: 'Block Device & UUID Discovery',
          explanation:
            'lsblk -f displays disks, partitions, filesystem types (xfs), UUIDs, and current mountpoints. blkid prints raw UUID attributes.',
          command: 'lsblk -f',
        },
        {
          title: 'Mounting & Unmounting File Systems',
          explanation:
            'sudo mount /dev/vdb1 /mnt/data attaches a formatted partition to an existing directory. Use sudo umount /mnt/data before detaching.',
          command: 'df -h',
        },
        {
          title: 'Directory Usage & Open Files',
          explanation:
            'df reports filesystem-level free space; du -sh <dir> summarizes directory usage; lsof reveals processes holding files open on a mountpoint.',
          command: 'du -sh /srv',
        },
      ],
      checkQuestion: {
        prompt: 'Which command displays block devices along with their filesystem types, UUIDs, and current mount points?',
        options: ['du -sh', 'lsblk -f', 'lsof /mnt/data'],
        correctIndex: 1,
        explanation: 'lsblk -f lists block devices with FSTYPE, UUID, and MOUNTPOINTS.',
      },
    },
    objectives: [
      {
        id: 'q15-lsblk',
        title: 'Inspect block devices and UUIDs',
        description: 'Run lsblk -f or blkid to identify /dev/vdb1.',
        hint: 'lsblk -f',
        commandExample: 'lsblk -f',
        check: (vm) => vm.commandHistory.some((c) => c.startsWith('lsblk') || c.startsWith('blkid')),
      },
      {
        id: 'q15-mount',
        title: 'Mount /dev/vdb1 onto /mnt/data',
        description: 'Mount the 2G XFS partition /dev/vdb1 at /mnt/data.',
        hint: 'sudo mount /dev/vdb1 /mnt/data',
        commandExample: 'sudo mount /dev/vdb1 /mnt/data',
        check: (vm) => vm.blockDevices.find((b) => b.name === 'vdb1')?.mountpoint === '/mnt/data',
      },
      {
        id: 'q15-df-du',
        title: 'Verify capacity with df and du',
        description: 'Run df -h and du -sh /srv to inspect filesystem and directory usage.',
        hint: 'df -h && du -sh /srv',
        commandExample: 'df -h && du -sh /srv',
        check: (vm) =>
          vm.commandHistory.some((c) => c.startsWith('df')) &&
          vm.commandHistory.some((c) => c.startsWith('du')),
      },
    ],
  },
  {
    id: 'quest-16-support',
    number: 16,
    moduleCode: 'Chapter 16',
    labSlug: 'support-review',
    rhcsaDomain: 'Manage security',
    title: 'Analyze Servers and Get Support',
    subtitle: 'Firewall rules, Red Hat subscription status, sosreport, and RH124 review',
    briefing:
      'Complete the final RH124 operational readiness lab: deploy nginx on port 80, permit http traffic permanently in firewalld and reload, verify Red Hat subscription status, and generate an sos diagnostic report in /var/tmp/.',
    xp: 450,
    difficulty: 'Advanced',
    concepts: ['firewall-cmd', 'subscription-manager', 'sos report', 'nginx & systemctl'],
    lesson: {
      summary:
        'Enterprise RHEL servers require firewalld service allowances, verified Red Hat subscriptions, and diagnostic sosreport bundles for Red Hat Support.',
      keyPoints: [
        {
          title: 'Managing Host Firewalls with firewall-cmd',
          explanation:
            'Inspect rules with firewall-cmd --list-all. Add persistent service access with --permanent --add-service=http followed by --reload.',
          command: 'firewall-cmd --list-all',
        },
        {
          title: 'Red Hat Subscription Verification',
          explanation:
            'subscription-manager status and repos --list-enabled confirm system entitlement to RHEL 9 BaseOS and AppStream updates.',
          command: 'subscription-manager status',
        },
        {
          title: 'Generating Diagnostic Archives (sosreport)',
          explanation:
            'sudo sos report --batch collects hardware, kernel, systemd, and configuration diagnostics into /var/tmp/ for Red Hat Support.',
          command: 'man sos',
        },
      ],
      checkQuestion: {
        prompt: 'After adding --add-service=http --permanent with firewall-cmd, what must you run for it to take effect in the active runtime rules?',
        options: ['sudo firewall-cmd --reload', 'sudo sos report --batch', 'sudo subscription-manager refresh'],
        correctIndex: 0,
        explanation: '--permanent writes to disk only; sudo firewall-cmd --reload activates permanent rules immediately.',
      },
    },
    objectives: [
      {
        id: 'q16-nginx',
        title: 'Install, enable, and start nginx.service',
        description: 'Install nginx with dnf and enable --now with systemctl.',
        hint: 'sudo dnf install -y nginx && sudo systemctl enable --now nginx',
        commandExample: 'sudo dnf install -y nginx && sudo systemctl enable --now nginx',
        check: (vm) => {
          const u = vm.units['nginx.service'];
          return Boolean(vm.packages['nginx']?.installed && u?.activeState === 'active' && u?.unitFileState === 'enabled');
        },
      },
      {
        id: 'q16-firewall',
        title: 'Permit http permanently in firewalld & reload',
        description: 'Add --add-service=http --permanent and reload firewalld.',
        hint: 'sudo firewall-cmd --permanent --add-service=http && sudo firewall-cmd --reload',
        commandExample: 'sudo firewall-cmd --permanent --add-service=http && sudo firewall-cmd --reload',
        check: (vm) =>
          vm.firewall.permanentServices.includes('http') && vm.firewall.services.includes('http'),
      },
      {
        id: 'q16-sub',
        title: 'Verify Red Hat subscription status',
        description: 'Run subscription-manager status to confirm entitlement.',
        hint: 'subscription-manager status',
        commandExample: 'subscription-manager status',
        check: (vm) => vm.commandHistory.some((c) => c.startsWith('subscription-manager')),
      },
      {
        id: 'q16-sos',
        title: 'Generate a Red Hat sosreport archive',
        description: 'Run sudo sos report --batch to collect system diagnostics into /var/tmp/.',
        hint: 'sudo sos report --batch',
        commandExample: 'sudo sos report --batch',
        check: (vm) => vm.sosReports.length > 0,
      },
    ],
  },
];

export const CHALLENGES: Challenge[] = [
  {
    id: 'trial-01-web-rescue',
    number: 1,
    title: 'Broken Web Stack Rescue',
    subtitle: 'Diagnose and restore a masked, permission-broken Apache server',
    timeLimitSeconds: 300,
    xp: 350,
    difficulty: 'Standard',
    scenario:
      'Production traffic to http://localhost is returning Connection Refused or 403 Forbidden. The httpd package is installed, but someone masked the service, stopped it, and broke read permissions (0600 owned by root) on /var/www/html/index.html. Restore service, enable it at boot, and fix permissions so curl http://localhost serves the HTML cleanly.',
    concepts: ['systemctl unmask', 'systemctl enable --now', 'chmod / chown', 'curl'],
    setupVm: (vm) => {
      vm.packages['httpd'].installed = true;
      vm.packages['httpd'].repo = '@System';
      vm.units['httpd.service'].loadState = 'masked';
      vm.units['httpd.service'].unitFileState = 'masked';
      vm.units['httpd.service'].activeState = 'inactive';
      vm.units['httpd.service'].subState = 'dead';
      vm.units['httpd.service'].pid = null;
      vm.vfs['/var/www/html/index.html'].mode = 0o600;
      vm.vfs['/var/www/html/index.html'].owner = 'root';
      return vm;
    },
    rubric: [
      {
        id: 't1-unmask',
        title: 'Unmask httpd.service',
        description: 'httpd.service loadState must be loaded (not masked).',
        hint: 'sudo systemctl unmask httpd',
        check: (vm) => vm.units['httpd.service']?.loadState === 'loaded',
      },
      {
        id: 't1-active',
        title: 'Start and enable httpd.service',
        description: 'httpd.service must be both active and enabled.',
        hint: 'sudo systemctl enable --now httpd',
        check: (vm) => {
          const u = vm.units['httpd.service'];
          return u?.activeState === 'active' && u?.unitFileState === 'enabled';
        },
      },
      {
        id: 't1-perms',
        title: 'Fix permissions on /var/www/html/index.html',
        description: 'Apache (user apache) must be able to read /var/www/html/index.html (e.g. chmod 644).',
        hint: 'sudo chmod 644 /var/www/html/index.html',
        check: (vm) => {
          const f = vm.vfs['/var/www/html/index.html'];
          return Boolean(f && ((f.mode & 0o004) !== 0 || f.owner === 'apache'));
        },
      },
    ],
  },
  {
    id: 'trial-02-collab-vault',
    number: 2,
    title: 'Engineering Collaboration Vault',
    subtitle: 'Provision group, accounts, aging policy, and SGID directory',
    timeLimitSeconds: 360,
    xp: 400,
    difficulty: 'Standard',
    scenario:
      'Create group "sysadmins" (GID 4500). Provision users "maria" and "kenji" with supplementary group "sysadmins". Set maria’s maximum password age to 60 days and lock kenji’s account. Finally, create /srv/vault owned by :sysadmins with mode 2770.',
    concepts: ['groupadd -g', 'useradd -G', 'chage -M', 'usermod -L', 'chmod 2770'],
    setupVm: (vm) => vm,
    rubric: [
      {
        id: 't2-group',
        title: 'Group sysadmins with GID 4500',
        description: 'Create group sysadmins with exact GID 4500.',
        hint: 'sudo groupadd -g 4500 sysadmins',
        check: (vm) => vm.groups['sysadmins']?.gid === 4500,
      },
      {
        id: 't2-users',
        title: 'Users maria & kenji in sysadmins',
        description: 'Both maria and kenji must exist and belong to sysadmins.',
        hint: 'sudo useradd -G sysadmins maria && sudo useradd -G sysadmins kenji',
        check: (vm) =>
          Boolean(
            vm.users['maria']?.groups.includes('sysadmins') &&
              vm.users['kenji']?.groups.includes('sysadmins')
          ),
      },
      {
        id: 't2-policy',
        title: 'Maria maxDays=60 and Kenji locked',
        description: 'Use chage -M 60 maria and usermod -L kenji.',
        hint: 'sudo chage -M 60 maria && sudo usermod -L kenji',
        check: (vm) => vm.users['maria']?.maxDays === 60 && vm.users['kenji']?.locked === true,
      },
      {
        id: 't2-vault',
        title: 'SGID directory /srv/vault (2770, :sysadmins)',
        description: 'Create /srv/vault with group sysadmins and permissions 2770.',
        hint: 'sudo mkdir -p /srv/vault && sudo chown :sysadmins /srv/vault && sudo chmod 2770 /srv/vault',
        check: (vm) => {
          const n = vm.vfs['/srv/vault'];
          return Boolean(n && n.group === 'sysadmins' && n.sgid && (n.mode & 0o777) === 0o770);
        },
      },
    ],
  },
  {
    id: 'trial-03-triage',
    number: 3,
    title: 'Rogue Process & Log Forensics',
    subtitle: 'Neutralize CPU spike and extract security evidence',
    timeLimitSeconds: 300,
    xp: 420,
    difficulty: 'Hard',
    scenario:
      'System load just spiked! A rogue "crypto-miner" process is consuming 99% CPU, and a suspicious IP triggered SSH failures in /var/log/secure. Kill the rogue process, write the offending IP (203.0.113.88) to /tmp/incident.txt, and enable persistent journald storage in /etc/systemd/journald.conf.',
    concepts: ['ps / pgrep', 'kill', 'grep /var/log/secure', 'journald.conf'],
    setupVm: (vm) => {
      vm.processes.push({
        pid: 6789,
        ppid: 1,
        user: 'root',
        cpu: 99.1,
        mem: 4.5,
        stat: 'R',
        nice: 0,
        command: '/tmp/.hidden/crypto-miner --threads=4',
        startTime: '12:10',
      });
      vm.vfs['/var/log/secure'].content +=
        'Nov 20 12:11:09 workstation sshd[2001]: Failed password for root from 203.0.113.88 port 59012 ssh2\n';
      vm.journal.push({
        timestamp: 'Nov 20 12:11:09',
        unit: 'sshd.service',
        priority: 'err',
        pid: 2001,
        message: 'Failed password for root from 203.0.113.88 port 59012 ssh2',
      });
      return vm;
    },
    rubric: [
      {
        id: 't3-kill',
        title: 'Kill crypto-miner process (PID 6789)',
        description: 'Terminate the root-owned rogue process using sudo kill.',
        hint: 'sudo kill -9 6789',
        check: (vm) => !vm.processes.some((p) => p.pid === 6789 || p.command.includes('crypto-miner')),
      },
      {
        id: 't3-report',
        title: 'Record offending IP in /tmp/incident.txt',
        description: 'Write 203.0.113.88 to /tmp/incident.txt.',
        hint: 'echo 203.0.113.88 > /tmp/incident.txt',
        check: (vm) => (vm.vfs['/tmp/incident.txt']?.content || '').includes('203.0.113.88'),
      },
      {
        id: 't3-journal',
        title: 'Set Storage=persistent in /etc/systemd/journald.conf',
        description: 'Configure persistent systemd journal storage.',
        hint: 'sudo sed -i "s/#Storage=auto/Storage=persistent/" /etc/systemd/journald.conf',
        check: (vm) => /^\s*Storage=persistent/m.test(vm.vfs['/etc/systemd/journald.conf']?.content || ''),
      },
    ],
  },
  {
    id: 'trial-04-net-ssh',
    number: 4,
    title: 'Network & SSH Lockdown',
    subtitle: 'Static IP cutover, hosts entry, and SSH hardening',
    timeLimitSeconds: 420,
    xp: 480,
    difficulty: 'Hard',
    scenario:
      'Reconfigure this workstation: set hostname to "node1.lab.example.com", create and activate static nmcli profile "prod-eth0" on ens160 with IP 172.25.250.50/24 and gateway 172.25.250.254, add "172.25.250.99 vault.lab" to /etc/hosts, and harden /etc/ssh/sshd_config (PermitRootLogin no, PasswordAuthentication no) then reload sshd.',
    concepts: ['hostnamectl', 'nmcli con add & up', '/etc/hosts', 'sshd_config'],
    setupVm: (vm) => vm,
    rubric: [
      {
        id: 't4-host',
        title: 'Hostname set to node1.lab.example.com',
        description: 'Use hostnamectl set-hostname.',
        hint: 'sudo hostnamectl set-hostname node1.lab.example.com',
        check: (vm) => vm.hostname === 'node1.lab.example.com',
      },
      {
        id: 't4-nmcli',
        title: 'Active static profile prod-eth0 (172.25.250.50/24)',
        description: 'Create and activate prod-eth0 on ens160 with manual IPv4 172.25.250.50/24 and gateway 172.25.250.254.',
        hint: 'sudo nmcli con add type ethernet con-name prod-eth0 ifname ens160 ipv4.method manual ipv4.addresses 172.25.250.50/24 ipv4.gateway 172.25.250.254 && sudo nmcli con up prod-eth0',
        check: (vm) => {
          const c = vm.connections['prod-eth0'];
          return Boolean(
            c && c.state === 'activated' && c.ipv4Method === 'manual' && c.ipv4Address === '172.25.250.50/24'
          );
        },
      },
      {
        id: 't4-hosts',
        title: 'Add 172.25.250.99 vault.lab to /etc/hosts',
        description: 'Append the host mapping to /etc/hosts.',
        hint: 'echo "172.25.250.99 vault.lab" | sudo tee -a /etc/hosts',
        check: (vm) => {
          const h = vm.vfs['/etc/hosts']?.content || '';
          return h.includes('172.25.250.99') && h.includes('vault.lab');
        },
      },
      {
        id: 't4-ssh',
        title: 'Harden sshd_config and reload sshd',
        description: 'Set PermitRootLogin no and PasswordAuthentication no, then reload sshd.',
        hint: 'Edit /etc/ssh/sshd_config and run sudo systemctl reload sshd',
        check: (vm) => {
          const cfg = vm.vfs['/etc/ssh/sshd_config']?.content || '';
          return (
            /^\s*PermitRootLogin\s+no/m.test(cfg) &&
            /^\s*PasswordAuthentication\s+no/m.test(cfg) &&
            vm.commandHistory.some((c) => c.includes('systemctl') && c.includes('sshd'))
          );
        },
      },
    ],
  },
  {
    id: 'trial-05-mock-exam',
    number: 5,
    title: 'RH124 Full Practical Mock Exam',
    subtitle: 'Comprehensive 6-task Red Hat administration assessment',
    timeLimitSeconds: 600,
    xp: 750,
    difficulty: 'Exam Grade',
    scenario:
      'Complete all 6 exam tasks before the timer expires: (1) Set hostname to exam-rhel9.lab.example.com; (2) Create user "auditor" with UID 2100 and shell /sbin/nologin; (3) Install "tree" and "nginx", and enable --now nginx; (4) Set timezone to UTC; (5) Create /srv/audit owned by student:wheel with mode 0750; (6) Archive /etc/ssh to /root/exam-ssh.tar.gz.',
    concepts: ['All RH124 Domains'],
    setupVm: (vm) => {
      createVfsDir(vm, '/srv/audit', 'root', 'root', 0o755, true);
      createVfsFile(vm, '/srv/audit/policy.txt', 'RHEL 9 Exam Policy\n', 'root', 'root', 0o644);
      return vm;
    },
    rubric: [
      {
        id: 't5-host',
        title: '1. Hostname: exam-rhel9.lab.example.com',
        description: 'Set static hostname via hostnamectl.',
        hint: 'sudo hostnamectl set-hostname exam-rhel9.lab.example.com',
        check: (vm) => vm.hostname === 'exam-rhel9.lab.example.com',
      },
      {
        id: 't5-user',
        title: '2. User auditor (UID 2100, /sbin/nologin)',
        description: 'Create non-interactive account auditor with UID 2100.',
        hint: 'sudo useradd -u 2100 -s /sbin/nologin auditor',
        check: (vm) => {
          const u = vm.users['auditor'];
          return Boolean(u && u.uid === 2100 && u.shell === '/sbin/nologin');
        },
      },
      {
        id: 't5-pkgs',
        title: '3. Install tree & nginx, enable --now nginx',
        description: 'Both packages installed and nginx.service active + enabled.',
        hint: 'sudo dnf install -y tree nginx && sudo systemctl enable --now nginx',
        check: (vm) =>
          Boolean(
            vm.packages['tree']?.installed &&
              vm.packages['nginx']?.installed &&
              vm.units['nginx.service']?.activeState === 'active' &&
              vm.units['nginx.service']?.unitFileState === 'enabled'
          ),
      },
      {
        id: 't5-tz',
        title: '4. System timezone set to UTC',
        description: 'Configure UTC via timedatectl.',
        hint: 'sudo timedatectl set-timezone UTC',
        check: (vm) => vm.timezone === 'UTC',
      },
      {
        id: 't5-perms',
        title: '5. /srv/audit owned by student:wheel, mode 0750',
        description: 'Update ownership and permissions on /srv/audit.',
        hint: 'sudo chown student:wheel /srv/audit && sudo chmod 0750 /srv/audit',
        check: (vm) => {
          const n = vm.vfs['/srv/audit'];
          return Boolean(n && n.owner === 'student' && n.group === 'wheel' && (n.mode & 0o777) === 0o750);
        },
      },
      {
        id: 't5-tar',
        title: '6. Archive /etc/ssh to /root/exam-ssh.tar.gz',
        description: 'Create compressed tarball at /root/exam-ssh.tar.gz.',
        hint: 'sudo tar -czvf /root/exam-ssh.tar.gz /etc/ssh',
        check: (vm) => Boolean(vm.vfs['/root/exam-ssh.tar.gz']),
      },
    ],
  },
];

export interface CommandGuideEntry {
  module: string;
  command: string;
  purpose: string;
  example: string;
}

export const COMMAND_GUIDE: CommandGuideEntry[] = [
  { module: 'Lab Environment', command: 'lab start / grade / finish', purpose: 'Prepare, grade, and reset Red Hat Academy lab exercises', example: 'lab start intro-navigate && lab grade' },
  { module: 'Ch 1–2 · CLI Basics', command: 'cat /etc/os-release · uname -r · id', purpose: 'Inspect RHEL 9.3 version, kernel release, and user UID/GID/groups', example: 'cat /etc/os-release && uname -r && id' },
  { module: 'Ch 3 · Files & Links', command: 'mkdir -p / ln -s / find', purpose: 'Create parent directories, symbolic/hard links, and locate files', example: 'mkdir -p ~/proj/{src,bin} && ln -s /etc/hosts ~/hosts.sym' },
  { module: 'Ch 4 · Getting Help', command: 'man / whatis / apropos', purpose: 'Read official manual sections (1: cmds, 5: configs, 8: admin)', example: 'man 5 sshd_config' },
  { module: 'Ch 5 · Text & Vim', command: 'grep / cut / sort / vim', purpose: 'Filter, slice, sort text streams and edit files across Vim modes', example: 'grep prod ~/server-inventory.csv | cut -d, -f1 | sort' },
  { module: 'Ch 6 · Users & Groups', command: 'useradd / usermod -aG / chage', purpose: 'Create accounts, append supplementary groups (-aG), and set password aging', example: 'sudo useradd -G devops alice && sudo chage -M 90 -W 7 alice' },
  { module: 'Ch 7 · Permissions', command: 'chmod / chown', purpose: 'Set octal/symbolic POSIX modes including SGID (2770) & Sticky (1777)', example: 'sudo chown :devops /srv/devops && sudo chmod 2770 /srv/devops' },
  { module: 'Ch 8 · Processes', command: 'ps aux / pgrep / kill / nice', purpose: 'Inspect running processes, adjust priority, and send signals', example: 'pgrep -l rogue && kill -15 4412' },
  { module: 'Ch 9 · Systemd', command: 'systemctl', purpose: 'Start, stop, reload, unmask, and enable services at boot', example: 'sudo systemctl unmask httpd && sudo systemctl enable --now httpd' },
  { module: 'Ch 10 · OpenSSH', command: 'ssh-keygen / ssh-copy-id / ssh', purpose: 'Generate Ed25519 keys, deploy public keys, and switch hosts via SSH', example: 'ssh-keygen -t ed25519 && ssh-copy-id student@serverb.lab.example.com' },
  { module: 'Ch 11 · System Logs', command: 'journalctl / logger', purpose: 'Filter systemd journal by unit (-u) or priority (-p) and send logs', example: 'journalctl -u sshd -p err' },
  { module: 'Ch 12 · Networking', command: 'nmcli / hostnamectl / ip / dig', purpose: 'Configure static IPv4 profiles, hostnames, and verify DNS/routes', example: 'sudo nmcli con add type ethernet con-name static-ens160 ifname ens160 ipv4.method manual ipv4.addresses 172.25.250.10/24 ipv4.gateway 172.25.250.254' },
  { module: 'Ch 13 · Archive & Transfer', command: 'tar / scp / rsync / sftp', purpose: 'Create compressed archives and transfer files securely across hosts', example: 'sudo tar -czvf /tmp/ssh-backup.tar.gz /etc/ssh && scp /tmp/ssh-backup.tar.gz student@serverb.lab.example.com:/tmp/' },
  { module: 'Ch 14 · Software & Time', command: 'dnf / rpm / timedatectl / chronyc', purpose: 'Manage RPM packages, query file ownership, and configure NTP/timezones', example: 'sudo dnf install -y tmux && rpm -qf /etc/ssh/sshd_config' },
  { module: 'Ch 15 · File Systems', command: 'lsblk / blkid / mount / df / du / lsof', purpose: 'Inspect block devices & UUIDs, mount filesystems, and analyze disk usage', example: 'lsblk -f && sudo mount /dev/vdb1 /mnt/data && df -h' },
  { module: 'Ch 16 · Support & Security', command: 'firewall-cmd / subscription-manager / sos', purpose: 'Configure persistent firewalld rules, check RHEL subscriptions, and generate sosreports', example: 'sudo firewall-cmd --permanent --add-service=http && sudo firewall-cmd --reload && sudo sos report --batch' },
];

export interface RankInfo {
  title: string;
  minXp: number;
  nextXp: number | null;
}

export function getRankForXp(xp: number): RankInfo {
  const tiers = [
    { title: 'RH124 Foundations', minXp: 0 },
    { title: 'RH124 Core Operations', minXp: 300 },
    { title: 'RH124 Systems & Security', minXp: 900 },
    { title: 'RH124 Networking & Storage', minXp: 1600 },
    { title: 'RH124 Exam Ready', minXp: 2500 },
    { title: 'RHCSA Candidate', minXp: 3600 },
  ];
  let currentIdx = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (xp >= tiers[i].minXp) currentIdx = i;
  }
  return {
    title: tiers[currentIdx].title,
    minXp: tiers[currentIdx].minXp,
    nextXp: tiers[currentIdx + 1]?.minXp ?? null,
  };
}
