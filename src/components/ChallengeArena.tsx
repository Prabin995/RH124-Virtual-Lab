import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import {
  Challenge,
  EditorSession,
  FeedbackEvent,
  ManSession,
  TerminalLine,
  VmState,
} from '../types/rhel';
import { TerminalWorkspace } from './TerminalWorkspace';

interface ChallengeArenaProps {
  challenges: Challenge[];
  activeChallenge: Challenge;
  vm: VmState;
  lines: TerminalLine[];
  feedback: FeedbackEvent | null;
  editor: EditorSession | null;
  manSession: ManSession | null;
  bestScores: Record<string, number>;
  onSelectChallenge: (challengeId: string) => void;
  onExecute: (command: string) => void;
  onClear: () => void;
  onSaveEditor: (filePath: string, content: string) => void;
  onCloseEditor: () => void;
  onCloseMan: () => void;
  onResetChallenge: () => void;
  onRecordChallengeScore: (challengeId: string, scorePct: number, xpEarned: number) => void;
}

export function ChallengeArena({
  challenges,
  activeChallenge,
  vm,
  lines,
  feedback,
  editor,
  manSession,
  bestScores,
  onSelectChallenge,
  onExecute,
  onClear,
  onSaveEditor,
  onCloseEditor,
  onCloseMan,
  onResetChallenge,
  onRecordChallengeScore,
}: ChallengeArenaProps) {
  const [secondsLeft, setSecondsLeft] = useState(activeChallenge.timeLimitSeconds);
  const [timerRunning, setTimerRunning] = useState(true);
  const [gradeReport, setGradeReport] = useState<Array<{
    id: string;
    title: string;
    description: string;
    hint: string;
    passed: boolean;
  }> | null>(null);

  useEffect(() => {
    setSecondsLeft(activeChallenge.timeLimitSeconds);
    setTimerRunning(true);
    setGradeReport(null);
  }, [activeChallenge]);

  useEffect(() => {
    if (!timerRunning || secondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning, secondsLeft]);

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  const handleGradeLab = () => {
    const results = activeChallenge.rubric.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      hint: item.hint,
      passed: item.check(vm),
    }));
    setGradeReport(results);
    const passedCount = results.filter((r) => r.passed).length;
    const scorePct = Math.round((passedCount / results.length) * 100);
    if (scorePct === 100) {
      setTimerRunning(false);
    }
    const xpEarned = scorePct === 100 ? activeChallenge.xp : Math.round((activeChallenge.xp * scorePct) / 200);
    onRecordChallengeScore(activeChallenge.id, scorePct, xpEarned);
  };

  const passedCount = gradeReport ? gradeReport.filter((r) => r.passed).length : 0;
  const totalCount = activeChallenge.rubric.length;

  return (
    <div className="flex flex-col h-full gap-4 p-4 lg:p-5 overflow-hidden">
      {/* Challenge Selector & Timer Strip */}
      <div className="bg-[#121721] border border-[#242E40] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto">
          {challenges.map((c) => {
            const isSelected = c.id === activeChallenge.id;
            const best = bestScores[c.id];
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectChallenge(c.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
                  isSelected
                    ? 'bg-[#EE0000] text-white'
                    : 'bg-[#18202E] text-slate-300 hover:text-white hover:bg-[#202B3D]'
                }`}
              >
                <span>
                  Trial {c.number}: {c.title}
                </span>
                {best !== undefined && (
                  <span className="font-mono tabular-nums opacity-85">({best}%)</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div
            className={`inline-flex items-center gap-2 font-mono text-sm tabular-nums ${
              secondsLeft < 60 ? 'text-rose-400' : 'text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <span>
              {mins}:{secs}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setTimerRunning((r) => !r)}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-[#18202E] hover:bg-[#222D40] border border-[#2A364B] rounded transition-colors whitespace-nowrap"
          >
            {timerRunning ? 'Pause' : 'Resume'}
          </button>

          <button
            type="button"
            onClick={() => {
              onResetChallenge();
              setSecondsLeft(activeChallenge.timeLimitSeconds);
              setTimerRunning(true);
              setGradeReport(null);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-[#18202E] hover:bg-[#222D40] border border-[#2A364B] rounded transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reset Trial
          </button>
        </div>
      </div>

      {/* Main Split Area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
        <div className="lg:col-span-7 min-h-[380px] h-full overflow-hidden">
          <TerminalWorkspace
            vm={vm}
            lines={lines}
            feedback={feedback}
            editor={editor}
            manSession={manSession}
            onExecute={onExecute}
            onClear={onClear}
            onSaveEditor={onSaveEditor}
            onCloseEditor={onCloseEditor}
            onCloseMan={onCloseMan}
          />
        </div>

        <aside className="lg:col-span-5 bg-[#121721] border border-[#242E40] rounded-lg flex flex-col overflow-hidden">
          <div className="p-5 border-b border-[#242E40]">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-200">
                  Practical Trial {activeChallenge.number}
                </span>
                <span aria-hidden="true">·</span>
                <span>{activeChallenge.difficulty}</span>
              </div>
              <span className="font-mono tabular-nums text-amber-400">
                +{activeChallenge.xp} XP
              </span>
            </div>

            <h2 className="text-xl font-semibold text-white mt-2 font-display">
              {activeChallenge.title}
            </h2>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">
              {activeChallenge.scenario}
            </p>
          </div>

          <div className="p-5 flex-1 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Automated Grading Rubric</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure the VM in the terminal, then run Grade Lab to verify.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGradeLab}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#EE0000] hover:bg-rose-600 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
                Grade Lab
              </button>
            </div>

            {!gradeReport ? (
              <div className="border border-[#242E40] rounded-lg bg-[#0F141D] divide-y divide-[#1E2636]">
                {activeChallenge.rubric.map((item) => (
                  <div key={item.id} className="p-3.5">
                    <div className="text-sm font-medium text-slate-200">{item.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{item.description}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div
                  className={`p-4 rounded-lg border flex items-center justify-between ${
                    passedCount === totalCount
                      ? 'bg-emerald-950/30 border-emerald-800/60'
                      : 'bg-amber-950/25 border-amber-800/50'
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {passedCount === totalCount
                        ? 'Exam Trial Passed'
                        : 'Partial Completion — Review Failed Criteria'}
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5">
                      Verified {passedCount} of {totalCount} system requirements
                    </div>
                  </div>
                  <div className="text-lg font-mono font-semibold tabular-nums text-white">
                    {Math.round((passedCount / totalCount) * 100)}%
                  </div>
                </div>

                <div className="border border-[#242E40] rounded-lg bg-[#0F141D] divide-y divide-[#1E2636]">
                  {gradeReport.map((item) => (
                    <div key={item.id} className="p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          {item.passed ? (
                            <CheckCircle2
                              className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                          ) : (
                            <XCircle
                              className="w-4 h-4 text-rose-400 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                          )}
                          <div>
                            <div
                              className={`text-sm font-medium ${
                                item.passed ? 'text-emerald-300' : 'text-rose-300'
                              }`}
                            >
                              {item.title}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {item.passed ? item.description : `Remediation hint: ${item.hint}`}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`text-xs font-medium shrink-0 ${
                            item.passed ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {item.passed ? 'Passed' : 'Failed'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
