import { useState } from 'react';
import {
  FileText,
  Folder,
  Link2,
  Network,
  Server,
  Shield,
  Terminal,
  Users,
} from 'lucide-react';
import { VmState } from '../types/rhel';
import { formatModeString, getOctalString } from '../engine/vfsUtils';

interface SystemStateExplorerProps {
  vm: VmState;
  onKillProcess: (pid: number) => void;
}

type StateTab = 'filesystem' | 'users' | 'services' | 'network';

export function SystemStateExplorer({ vm, onKillProcess }: SystemStateExplorerProps) {
  const [tab, setTab] = useState<StateTab>('filesystem');
  const [selectedPath, setSelectedPath] = useState<string>('/etc/ssh/sshd_config');

  const allPaths = Object.keys(vm.vfs).sort();
  const selectedNode = vm.vfs[selectedPath];

  return (
    <div className="flex flex-col h-full p-4 lg:p-6 gap-5 overflow-hidden">
      {/* Segmented View Tabs + Host Metadata */}
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="inline-flex items-center gap-1 p-1 bg-[#141A24] border border-[#242E40] rounded-lg">
          <button
            type="button"
            onClick={() => setTab('filesystem')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'filesystem'
                ? 'bg-[#212B3D] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Folder className="w-3.5 h-3.5" aria-hidden="true" />
            Filesystem
          </button>
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'users' ? 'bg-[#212B3D] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            Users &amp; Groups
          </button>
          <button
            type="button"
            onClick={() => setTab('services')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'services'
                ? 'bg-[#212B3D] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" aria-hidden="true" />
            Services &amp; Processes
          </button>
          <button
            type="button"
            onClick={() => setTab('network')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === 'network'
                ? 'bg-[#212B3D] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Network className="w-3.5 h-3.5" aria-hidden="true" />
            Network, Storage &amp; Logs
          </button>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-2 font-mono">
          <span>{vm.hostname}</span>
          <span aria-hidden="true">·</span>
          <span>TZ: {vm.timezone}</span>
          <span aria-hidden="true">·</span>
          <span>umask {vm.umask.toString(8).padStart(4, '0')}</span>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'filesystem' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
            <div className="lg:col-span-6 bg-[#121721] border border-[#242E40] rounded-lg overflow-y-auto divide-y divide-[#1C2433]">
              {allPaths.map((p) => {
                const node = vm.vfs[p];
                const isSelected = p === selectedPath;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedPath(p)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 text-xs transition-colors ${
                      isSelected ? 'bg-[#1D2738] text-white' : 'hover:bg-[#161D2A] text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {node.type === 'dir' ? (
                        <Folder className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
                      ) : node.type === 'symlink' ? (
                        <Link2 className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                      )}
                      <span className="font-mono truncate">{p}</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400 shrink-0">
                      <span>{formatModeString(node)}</span>
                      <span>
                        {node.owner}:{node.group}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-6 bg-[#121721] border border-[#242E40] rounded-lg flex flex-col overflow-hidden">
              {selectedNode ? (
                <>
                  <div className="px-5 py-4 border-b border-[#242E40] bg-[#141A24]">
                    <div className="text-sm font-mono font-semibold text-white break-all">
                      {selectedPath}
                    </div>
                    <div className="mt-2 text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
                      <span>Type: {selectedNode.type}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Mode: {formatModeString(selectedNode)} ({getOctalString(selectedNode)})
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Owner: {selectedNode.owner}:{selectedNode.group}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Inode: {selectedNode.inodeId}</span>
                    </div>
                  </div>
                  <div className="flex-1 p-5 overflow-y-auto">
                    {selectedNode.type === 'dir' ? (
                      <div>
                        <div className="text-xs font-medium text-slate-400 mb-2">
                          Directory Entries ({selectedNode.children?.length || 0})
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
                          {(selectedNode.children || []).map((child) => {
                            const childPath =
                              selectedPath === '/' ? `/${child}` : `${selectedPath}/${child}`;
                            return (
                              <button
                                key={child}
                                type="button"
                                onClick={() => vm.vfs[childPath] && setSelectedPath(childPath)}
                                className="text-left px-3 py-2 rounded bg-[#0F141D] border border-[#242E40] hover:border-slate-500 text-slate-200 truncate transition-colors"
                              >
                                {child}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : selectedNode.type === 'symlink' ? (
                      <div className="text-xs font-mono text-amber-300">
                        Symbolic link target: {selectedNode.target}
                      </div>
                    ) : (
                      <pre className="font-mono text-xs leading-relaxed text-slate-200 whitespace-pre-wrap break-words">
                        {selectedNode.content || '(empty file)'}
                      </pre>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-6 text-sm text-slate-400">Select a path to inspect.</div>
              )}
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full overflow-y-auto">
            <div className="lg:col-span-8 bg-[#121721] border border-[#242E40] rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#242E40] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Local Users (/etc/passwd)</h2>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {Object.keys(vm.users).length} accounts
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#141A24] text-slate-400 border-b border-[#242E40]">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Username</th>
                      <th className="px-4 py-2.5 font-medium text-right">UID</th>
                      <th className="px-4 py-2.5 font-medium text-right">GID</th>
                      <th className="px-4 py-2.5 font-medium">Shell</th>
                      <th className="px-4 py-2.5 font-medium">Supplementary Groups</th>
                      <th className="px-4 py-2.5 font-medium text-right">Max Days</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1C2433] font-mono">
                    {Object.values(vm.users)
                      .sort((a, b) => a.uid - b.uid)
                      .map((u) => (
                        <tr key={u.username} className="hover:bg-[#161D2A]">
                          <td className="px-4 py-2.5 text-slate-100 font-medium">{u.username}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">
                            {u.uid}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">
                            {u.gid}
                          </td>
                          <td className="px-4 py-2.5 text-slate-300">{u.shell}</td>
                          <td className="px-4 py-2.5 text-sky-300">
                            {u.groups.length > 0 ? u.groups.join(', ') : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">
                            {u.maxDays}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={u.locked ? 'text-rose-400' : 'text-emerald-400'}>
                              {u.locked ? 'Locked' : 'Active'}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-4 bg-[#121721] border border-[#242E40] rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#242E40] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Local Groups (/etc/group)</h2>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {Object.keys(vm.groups).length} groups
                </span>
              </div>
              <div className="divide-y divide-[#1C2433]">
                {Object.values(vm.groups)
                  .sort((a, b) => a.gid - b.gid)
                  .map((g) => (
                    <div key={g.name} className="px-4 py-3 text-xs flex items-center justify-between gap-3">
                      <div>
                        <div className="font-mono font-medium text-slate-100">{g.name}</div>
                        <div className="font-mono text-slate-400 mt-0.5">
                          Members: {g.members.length > 0 ? g.members.join(', ') : 'none'}
                        </div>
                      </div>
                      <span className="font-mono tabular-nums text-slate-400">GID {g.gid}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'services' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full overflow-y-auto">
            <div className="lg:col-span-6 bg-[#121721] border border-[#242E40] rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#242E40] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Systemd Service Units</h2>
                <span className="text-xs text-slate-400">systemctl</span>
              </div>
              <div className="divide-y divide-[#1C2433]">
                {Object.values(vm.units).map((u) => (
                  <div key={u.name} className="px-4 py-3 flex items-center justify-between gap-4 text-xs">
                    <div className="min-w-0">
                      <div className="font-mono font-medium text-slate-100">{u.name}</div>
                      <div className="text-slate-400 truncate mt-0.5">{u.description}</div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <div
                        className={
                          u.activeState === 'active'
                            ? 'text-emerald-400'
                            : u.loadState === 'masked'
                            ? 'text-amber-400'
                            : 'text-slate-400'
                        }
                      >
                        {u.loadState === 'masked' ? 'masked' : u.activeState}
                      </div>
                      <div className="text-slate-500 mt-0.5">{u.unitFileState}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6 bg-[#121721] border border-[#242E40] rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#242E40] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Running Processes</h2>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {vm.processes.length} tasks
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#141A24] text-slate-400 border-b border-[#242E40]">
                    <tr>
                      <th className="px-4 py-2.5 font-medium text-right">PID</th>
                      <th className="px-4 py-2.5 font-medium">User</th>
                      <th className="px-4 py-2.5 font-medium text-right">%CPU</th>
                      <th className="px-4 py-2.5 font-medium">Command</th>
                      <th className="px-4 py-2.5 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1C2433] font-mono">
                    {vm.processes.map((p) => (
                      <tr key={p.pid} className="hover:bg-[#161D2A]">
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">
                          {p.pid}
                        </td>
                        <td className="px-4 py-2.5 text-slate-300">{p.user}</td>
                        <td
                          className={`px-4 py-2.5 text-right tabular-nums ${
                            p.cpu > 50 ? 'text-rose-400 font-semibold' : 'text-slate-300'
                          }`}
                        >
                          {p.cpu.toFixed(1)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-200 max-w-[200px] truncate">
                          {p.command}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {p.protected ? (
                            <span className="text-slate-500">Protected</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onKillProcess(p.pid)}
                              className="text-rose-400 hover:text-rose-300 font-sans font-medium"
                            >
                              Terminate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'network' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full overflow-y-auto">
            <div className="lg:col-span-6 space-y-4">
              <div className="bg-[#121721] border border-[#242E40] rounded-lg overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#242E40] flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">NetworkManager Profiles</h2>
                  <Shield className="w-4 h-4 text-slate-400" aria-hidden="true" />
                </div>
                <div className="divide-y divide-[#1C2433]">
                  {Object.values(vm.connections).map((c) => (
                    <div key={c.name} className="px-4 py-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-white">{c.name}</span>
                        <span
                          className={
                            c.state === 'activated' ? 'text-emerald-400' : 'text-slate-500'
                          }
                        >
                          {c.state}
                        </span>
                      </div>
                      <div className="font-mono text-slate-400">
                        Device: {c.device} · Method: {c.ipv4Method} · IP: {c.ipv4Address}
                      </div>
                      {c.gateway && (
                        <div className="font-mono text-slate-500">
                          GW: {c.gateway} {c.dns ? `· DNS: ${c.dns}` : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#121721] border border-[#242E40] rounded-lg overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#242E40] flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Block Devices &amp; Firewalld</h2>
                  <span className="text-xs font-mono text-slate-400">
                    Zone: {vm.firewall.defaultZone}
                  </span>
                </div>
                <div className="px-4 py-2.5 border-b border-[#1C2433] text-xs font-mono text-slate-300">
                  Allowed Services: {vm.firewall.services.join(', ') || 'none'}
                </div>
                <div className="divide-y divide-[#1C2433]">
                  {vm.blockDevices.map((b) => (
                    <div
                      key={b.name}
                      className="px-4 py-2.5 text-xs flex items-center justify-between gap-3 font-mono"
                    >
                      <span className="text-slate-100">
                        /dev/{b.name} ({b.size} {b.fstype || b.type})
                      </span>
                      <span className={b.mountpoint ? 'text-emerald-400' : 'text-slate-500'}>
                        {b.mountpoint || 'unmounted'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#121721] border border-[#242E40] rounded-lg overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#242E40]">
                  <h2 className="text-sm font-semibold text-white">DNF Package Status</h2>
                </div>
                <div className="divide-y divide-[#1C2433]">
                  {Object.values(vm.packages).map((pkg) => (
                    <div
                      key={pkg.name}
                      className="px-4 py-2.5 text-xs flex items-center justify-between gap-3"
                    >
                      <div>
                        <span className="font-mono font-medium text-slate-100">{pkg.name}</span>
                        <span className="text-slate-400 ml-2">{pkg.summary}</span>
                      </div>
                      <span
                        className={`font-medium shrink-0 ${
                          pkg.installed ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        {pkg.installed ? 'Installed' : 'Available'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 bg-[#121721] border border-[#242E40] rounded-lg overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 border-b border-[#242E40] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Systemd Journal Stream</h2>
                <Terminal className="w-4 h-4 text-slate-400" aria-hidden="true" />
              </div>
              <div className="p-4 overflow-y-auto space-y-2 font-mono text-xs">
                {vm.journal.map((entry, i) => (
                  <div key={i} className="border-b border-[#1C2433] pb-2 last:border-0">
                    <div className="text-slate-400">
                      {entry.timestamp} · {entry.unit}[{entry.pid}] ·{' '}
                      <span
                        className={
                          entry.priority === 'err' || entry.priority === 'crit'
                            ? 'text-rose-400'
                            : entry.priority === 'warning'
                            ? 'text-amber-400'
                            : 'text-sky-400'
                        }
                      >
                        {entry.priority}
                      </span>
                    </div>
                    <div className="text-slate-200 mt-0.5">{entry.message}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
