import { useState } from 'react';
import { Play, Search } from 'lucide-react';
import { COMMAND_GUIDE } from '../data/curriculum';

interface CommandReferenceProps {
  onTryCommand: (command: string) => void;
}

export function CommandReference({ onTryCommand }: CommandReferenceProps) {
  const [query, setQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState('All');

  const modules = ['All', ...Array.from(new Set(COMMAND_GUIDE.map((item) => item.module)))];

  const filtered = COMMAND_GUIDE.filter((item) => {
    const matchesModule = selectedModule === 'All' || item.module === selectedModule;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      item.command.toLowerCase().includes(q) ||
      item.purpose.toLowerCase().includes(q) ||
      item.example.toLowerCase().includes(q);
    return matchesModule && matchesQuery;
  });

  return (
    <div className="h-full overflow-y-auto p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#242E40] pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-white font-display">
            RH124 Command &amp; Concept Reference
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Essential Red Hat Enterprise Linux 9 utilities mapped across all 16 course chapters.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter commands or concepts..."
            className="w-full pl-9 pr-3 py-2 bg-[#121721] border border-[#242E40] rounded-md text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-slate-500"
          />
        </div>
      </div>

      {/* Chapter Filter Strip */}
      <div className="flex flex-wrap gap-1.5">
        {modules.map((mod) => (
          <button
            key={mod}
            type="button"
            onClick={() => setSelectedModule(mod)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              selectedModule === mod
                ? 'bg-[#EE0000] text-white'
                : 'bg-[#121721] text-slate-300 border border-[#242E40] hover:bg-[#19202E]'
            }`}
          >
            {mod}
          </button>
        ))}
      </div>

      {/* Clean Data Table */}
      <div className="bg-[#121721] border border-[#242E40] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#141A24] border-b border-[#242E40] text-xs text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Chapter</th>
                <th className="px-4 py-3 font-medium">Command</th>
                <th className="px-4 py-3 font-medium">Purpose</th>
                <th className="px-4 py-3 font-medium">Example</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C2433]">
              {filtered.map((entry, idx) => (
                <tr key={idx} className="hover:bg-[#161D2A] transition-colors">
                  <td className="px-4 py-3.5 text-xs text-slate-400 whitespace-nowrap">
                    {entry.module}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs font-semibold text-rose-400 whitespace-nowrap">
                    {entry.command}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-200 leading-relaxed">
                    {entry.purpose}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs text-sky-300 max-w-xs truncate">
                    {entry.example}
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onTryCommand(entry.example)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-100 bg-[#1B2332] hover:bg-[#253044] border border-[#2B374D] rounded transition-colors"
                    >
                      <Play className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                      Try in Terminal
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                    No matching commands found for &ldquo;{query}&rdquo;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
