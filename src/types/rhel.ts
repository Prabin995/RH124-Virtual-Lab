export type VfsNodeType = 'file' | 'dir' | 'symlink';

export interface VfsNode {
  type: VfsNodeType;
  inodeId: number;
  mode: number; // e.g. 0o755, 0o644
  suid?: boolean;
  sgid?: boolean;
  sticky?: boolean;
  owner: string;
  group: string;
  content?: string;
  target?: string; // for symlinks
  children?: string[]; // child names for directories
  mtime: string;
  size: number;
}

export interface UserAccount {
  username: string;
  uid: number;
  gid: number;
  home: string;
  shell: string;
  comment: string;
  passwordSet: boolean;
  locked: boolean;
  minDays: number;
  maxDays: number;
  warnDays: number;
  expireDate: string; // YYYY-MM-DD or ''
  groups: string[]; // supplementary groups
}

export interface GroupEntry {
  name: string;
  gid: number;
  members: string[];
}

export interface ProcessEntry {
  pid: number;
  ppid: number;
  user: string;
  cpu: number;
  mem: number;
  stat: string;
  nice: number;
  command: string;
  startTime: string;
  isBackgroundJob?: boolean;
  jobId?: number;
  stopped?: boolean;
  protected?: boolean;
}

export interface SystemdUnit {
  name: string;
  description: string;
  loadState: 'loaded' | 'masked' | 'not-found';
  activeState: 'active' | 'inactive' | 'failed';
  subState: 'running' | 'dead' | 'exited' | 'failed';
  unitFileState: 'enabled' | 'disabled' | 'masked' | 'static';
  pid: number | null;
  ports: string[];
  packageRequired?: string;
}

export interface NetworkConnection {
  name: string;
  uuid: string;
  type: 'ethernet' | 'loopback';
  device: string;
  state: 'activated' | 'deactivated';
  ipv4Method: 'auto' | 'manual';
  ipv4Address: string; // e.g. 172.25.250.10/24
  gateway: string;
  dns: string;
  autoconnect: boolean;
}

export interface PackageRecord {
  name: string;
  version: string;
  release: string;
  arch: string;
  summary: string;
  installed: boolean;
  repo: string;
  files: string[];
}

export interface JournalEntry {
  timestamp: string;
  unit: string;
  priority: 'emerg' | 'alert' | 'crit' | 'err' | 'warning' | 'notice' | 'info' | 'debug';
  pid: number;
  message: string;
}

export interface RemoteHost {
  hostname: string;
  ip: string;
  files: Record<string, string>;
  sshAuthorizedKeys: Record<string, string[]>; // username -> keys
}

export interface BlockDevice {
  name: string; // e.g. vda, vda1, vdb, vdb1
  size: string;
  type: 'disk' | 'part';
  fstype: string;
  uuid: string;
  mountpoint: string | null;
  parent?: string;
}

export interface FirewallState {
  defaultZone: string;
  services: string[];
  ports: string[];
  permanentServices: string[];
}

export interface SshSessionFrame {
  hostKey: string;
  hostname: string;
  user: string;
  cwd: string;
}

export interface VmState {
  activeHostKey: 'workstation' | 'servera' | 'serverb';
  hostname: string;
  currentUser: string;
  cwd: string;
  previousCwd: string;
  umask: number;
  nextInode: number;
  nextPid: number;
  nextUid: number;
  nextGid: number;
  env: Record<string, string>;
  vfs: Record<string, VfsNode>;
  users: Record<string, UserAccount>;
  groups: Record<string, GroupEntry>;
  processes: ProcessEntry[];
  units: Record<string, SystemdUnit>;
  connections: Record<string, NetworkConnection>;
  packages: Record<string, PackageRecord>;
  journal: JournalEntry[];
  blockDevices: BlockDevice[];
  firewall: FirewallState;
  subscriptionRegistered: boolean;
  sosReports: string[];
  remotes: Record<string, RemoteHost>;
  sshStack: SshSessionFrame[];
  sshKeysGenerated: Record<string, string[]>; // username -> key paths
  sshCopiedTo: string[]; // e.g. ["student@serverb.lab.example.com"]
  dnfHistory: Array<{ id: number; command: string; date: string; action: string }>;
  timezone: string;
  ntpSync: boolean;
  commandHistory: string[];
  lastExitCode: number;
  lastCommand: string;
  manPagesViewed: string[];
}

export interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'success' | 'info';
  prompt?: string;
  text: string;
}

export interface FeedbackEvent {
  id: string;
  status: 'passed' | 'tip' | 'warning' | 'error';
  title: string;
  detail: string;
  command?: string;
}

export interface Objective {
  id: string;
  title: string;
  description: string;
  hint: string;
  commandExample?: string;
  check: (vm: VmState) => boolean;
}

export interface LessonPoint {
  title: string;
  explanation: string;
  command?: string;
}

export interface LessonCheck {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface LessonContent {
  summary: string;
  keyPoints: LessonPoint[];
  checkQuestion: LessonCheck;
}

export interface Quest {
  id: string;
  number: number;
  moduleCode: string;
  labSlug: string;
  rhcsaDomain: string;
  title: string;
  subtitle: string;
  briefing: string;
  xp: number;
  difficulty: 'Foundational' | 'Intermediate' | 'Advanced';
  concepts: string[];
  lesson: LessonContent;
  setupVm?: (vm: VmState) => VmState;
  objectives: Objective[];
}

export interface Challenge {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  timeLimitSeconds: number;
  xp: number;
  difficulty: 'Standard' | 'Hard' | 'Exam Grade';
  scenario: string;
  concepts: string[];
  setupVm: (vm: VmState) => VmState;
  rubric: Objective[];
}

export interface EditorSession {
  mode: 'vim' | 'nano';
  filePath: string;
  content: string;
  isNewFile: boolean;
  readOnly: boolean;
  elevated?: boolean;
}

export interface ManSession {
  topic: string;
  section: string;
  content: string;
}

export type AppView = 'courses' | 'quests' | 'challenges' | 'state' | 'reference';

export interface PlayerProgress {
  xp: number;
  completedLessons: string[];
  completedQuests: string[];
  completedChallenges: string[];
  challengeBestScores: Record<string, number>;
}
