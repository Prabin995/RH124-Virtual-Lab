import { RotateCcw } from 'lucide-react';
import { AppView } from '../types/rhel';

interface HeaderProps {
  activeView: AppView;
  onChangeView: (view: AppView) => void;
  onResetVm: () => void;
}

const NAV_ITEMS: Array<{ id: AppView; label: string }> = [
  { id: 'courses', label: 'My Courses' },
  { id: 'quests', label: 'Lesson & Lab' },
  { id: 'challenges', label: 'Challenges' },
  { id: 'state', label: 'System State' },
  { id: 'reference', label: 'Command Guide' },
];

export function Header({ activeView, onChangeView, onResetVm }: HeaderProps) {
  return (
    <header className="h-14 border-b border-[#242E40] bg-[#0F141D] px-6 flex items-center justify-between gap-8 shrink-0">
      <button
        type="button"
        onClick={() => onChangeView('courses')}
        className="text-lg font-semibold tracking-tight text-white whitespace-nowrap shrink-0 font-display focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
      >
        RH124 Virtual Lab
      </button>

      <nav className="flex items-center gap-6 overflow-x-auto" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeView(item.id)}
              className={`relative py-4 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
                isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
              {isActive && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#EE0000]" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="shrink-0">
        <button
          type="button"
          onClick={onResetVm}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-100 bg-[#18202E] border border-[#2A364B] rounded-md hover:bg-[#202B3D] hover:border-slate-500 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <RotateCcw className="w-3.5 h-3.5 text-rose-500" aria-hidden="true" />
          Reset VM
        </button>
      </div>
    </header>
  );
}
