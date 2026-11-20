import { useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  FlaskConical,
  HelpCircle,
  List,
  Lock,
  Play,
  Trophy,
} from 'lucide-react';
import { PlayerProgress, Quest, VmState } from '../types/rhel';
import { getRankForXp } from '../data/curriculum';

interface QuestPanelProps {
  quests: Quest[];
  activeQuest: Quest;
  vm: VmState;
  progress: PlayerProgress;
  onSelectQuest: (questId: string) => void;
  onCompleteLesson: (questId: string) => void;
  onInsertCommand: (cmd: string) => void;
}

export function QuestPanel({
  quests,
  activeQuest,
  vm,
  progress,
  onSelectQuest,
  onCompleteLesson,
  onInsertCommand,
}: QuestPanelProps) {
  const [showQuestList, setShowQuestList] = useState(false);
  const [expandedHintId, setExpandedHintId] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const isLessonCompleted = progress.completedLessons.includes(activeQuest.id);
  const isLabCompleted = progress.completedQuests.includes(activeQuest.id);

  // Default to Lesson first; if Lesson is already completed for this module, start on Lab
  const [stageTab, setStageTab] = useState<'lesson' | 'lab'>(
    isLessonCompleted ? 'lab' : 'lesson'
  );

  useEffect(() => {
    setSelectedOption(null);
    setExpandedHintId(null);
    setStageTab(progress.completedLessons.includes(activeQuest.id) ? 'lab' : 'lesson');
  }, [activeQuest.id, progress.completedLessons]);

  const rank = getRankForXp(progress.xp);
  const objectiveResults = activeQuest.objectives.map((obj) => ({
    obj,
    passed: obj.check(vm),
  }));
  const passedCount = objectiveResults.filter((r) => r.passed).length;
  const allLabPassed = isLessonCompleted && passedCount === activeQuest.objectives.length;

  const currentIdx = quests.findIndex((q) => q.id === activeQuest.id);
  const prevQuest = currentIdx > 0 ? quests[currentIdx - 1] : null;
  const nextQuest = currentIdx < quests.length - 1 ? quests[currentIdx + 1] : null;

  const checkQ = activeQuest.lesson.checkQuestion;
  const answeredCorrectly = selectedOption === checkQ.correctIndex;

  const handleFinishLesson = () => {
    onCompleteLesson(activeQuest.id);
    setStageTab('lab');
  };

  return (
    <aside className="flex flex-col h-full bg-[#121721] border border-[#242E40] rounded-lg overflow-hidden">
      {/* Rank & XP Summary Bar */}
      <div className="px-5 py-3 border-b border-[#242E40] bg-[#141A24] flex items-center justify-between gap-4 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="font-medium text-slate-200 truncate">{rank.title}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-amber-400 shrink-0">{progress.xp} XP</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums shrink-0">
              {progress.completedQuests.length}/{quests.length} Labs
            </span>
          </div>
          {rank.nextXp !== null && (
            <div className="mt-1.5 h-1.5 w-full bg-[#1E2636] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#EE0000] transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(((progress.xp - rank.minXp) / (rank.nextXp - rank.minXp)) * 100)
                  )}%`,
                }}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowQuestList((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#1B2230] hover:bg-[#232C3E] border border-[#2B374D] rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <List className="w-3.5 h-3.5" aria-hidden="true" />
          {showQuestList ? 'Back to Module' : 'All Modules'}
        </button>
      </div>

      {/* Curriculum Drawer or Side-by-Side Lesson / Lab */}
      {showQuestList ? (
        <div className="flex-1 overflow-y-auto divide-y divide-[#1E2636]">
          {quests.map((q) => {
            const lessonDone = progress.completedLessons.includes(q.id);
            const labDone = progress.completedQuests.includes(q.id);
            const isCurrent = q.id === activeQuest.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  onSelectQuest(q.id);
                  setShowQuestList(false);
                }}
                className={`w-full text-left px-5 py-3.5 transition-colors flex items-start justify-between gap-3 ${
                  isCurrent ? 'bg-[#1A2232]' : 'hover:bg-[#161D29]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <span className="font-mono tabular-nums">
                      {String(q.number).padStart(2, '0')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{q.moduleCode}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{q.xp} XP</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-100 mt-0.5 truncate">
                    {q.title}
                  </div>
                </div>
                <div className="shrink-0 mt-1 flex items-center gap-2 text-xs">
                  {labDone ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Lab Complete
                    </span>
                  ) : lessonDone ? (
                    <span className="text-sky-400 font-medium">Lab Ready</span>
                  ) : isCurrent ? (
                    <span className="text-amber-400 font-medium">In Lesson</span>
                  ) : (
                    <span className="text-slate-500">Lesson</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Module Header + Lesson/Lab Switcher */}
          <div className="px-5 pt-4 pb-3 border-b border-[#242E40] space-y-3 shrink-0">
            <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums text-slate-200 font-medium">
                  Module {String(activeQuest.number).padStart(2, '0')}/{quests.length}
                </span>
                <span aria-hidden="true">·</span>
                <span>{activeQuest.moduleCode}</span>
                <span aria-hidden="true">·</span>
                <span>{activeQuest.difficulty}</span>
              </div>
              <span className="font-mono tabular-nums text-amber-400 font-medium">
                +{activeQuest.xp} XP
              </span>
            </div>

            <h2 className="text-lg font-semibold text-white font-display leading-snug">
              {activeQuest.title}
            </h2>

            <div className="text-xs text-slate-400">
              RHCSA Domain: <span className="text-slate-200">{activeQuest.rhcsaDomain}</span>
            </div>

            {/* Two-Stage Lesson -> Lab Segmented Bar */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0D1117] border border-[#242E40] rounded-lg">
              <button
                type="button"
                onClick={() => setStageTab('lesson')}
                className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  stageTab === 'lesson'
                    ? 'bg-[#1D2637] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                <span>1. Lesson</span>
                {isLessonCompleted && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setStageTab('lab')}
                className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  stageTab === 'lab'
                    ? 'bg-[#1D2637] text-white'
                    : isLessonCompleted
                    ? 'text-slate-300 hover:text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {isLessonCompleted ? (
                  <FlaskConical className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                )}
                <span>2. Lab</span>
                {isLabCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                ) : !isLessonCompleted ? (
                  <span className="text-[11px] text-slate-500">(Locked)</span>
                ) : null}
              </button>
            </div>
          </div>

          {/* Stage 1: Guided Lesson View */}
          {stageTab === 'lesson' && (
            <div className="p-5 flex-1 overflow-y-auto space-y-5">
              <p className="text-sm text-slate-300 leading-relaxed">
                {activeQuest.lesson.summary}
              </p>

              {/* Key Concept Blocks with Try-in-Terminal buttons */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-200">
                  Core Concepts — Practice in the Terminal Alongside
                </div>
                <div className="divide-y divide-[#1E2636] border border-[#242E40] rounded-lg bg-[#0F141D]">
                  {activeQuest.lesson.keyPoints.map((kp, idx) => (
                    <div key={idx} className="p-3.5 space-y-2">
                      <div className="text-sm font-medium text-white">
                        {idx + 1}. {kp.title}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{kp.explanation}</p>
                      {kp.command && (
                        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#1A2130]">
                          <code className="font-mono text-xs text-sky-300 truncate">
                            {kp.command}
                          </code>
                          <button
                            type="button"
                            onClick={() => onInsertCommand(kp.command!)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-100 bg-[#1B2332] hover:bg-[#253044] rounded shrink-0 transition-colors"
                          >
                            <Play className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                            Try
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Interactive Concept Check */}
              <div className="p-4 rounded-lg border border-[#242E40] bg-[#0F141D] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-100">
                    Lesson Check to Unlock Lab
                  </span>
                  {isLessonCompleted && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Completed
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-200 leading-relaxed">{checkQ.prompt}</p>

                <div className="space-y-1.5">
                  {checkQ.options.map((opt, idx) => {
                    const isSelected = selectedOption === idx;
                    const isCorrect = idx === checkQ.correctIndex;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedOption(idx)}
                        className={`w-full text-left px-3 py-2 text-xs rounded-md border transition-colors ${
                          isSelected
                            ? isCorrect
                              ? 'bg-emerald-950/40 border-emerald-700 text-emerald-200'
                              : 'bg-rose-950/40 border-rose-700 text-rose-200'
                            : 'bg-[#141A24] border-[#242E40] text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>

                {selectedOption !== null && (
                  <div
                    className={`text-xs leading-relaxed ${
                      answeredCorrectly ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {answeredCorrectly
                      ? checkQ.explanation
                      : 'Not quite — review the lesson points above and try another option.'}
                  </div>
                )}

                <div className="pt-1 flex items-center justify-end gap-3">
                  {isLessonCompleted ? (
                    <button
                      type="button"
                      onClick={() => setStageTab('lab')}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#EE0000] hover:bg-rose-600 rounded-md transition-colors"
                    >
                      Go to Lab Exercises
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!answeredCorrectly}
                      onClick={handleFinishLesson}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#EE0000] hover:bg-rose-600 disabled:opacity-40 disabled:pointer-events-none rounded-md transition-colors"
                    >
                      Complete Lesson &amp; Start Lab
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Stage 2: Lab View (Locked until Lesson Completed) */}
          {stageTab === 'lab' && !isLessonCompleted && (
            <div className="p-6 flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-11 h-11 rounded-full bg-[#18202E] border border-[#2A364B] flex items-center justify-center">
                <Lock className="w-5 h-5 text-slate-400" aria-hidden="true" />
              </div>
              <div className="max-w-sm space-y-1.5">
                <h3 className="text-base font-semibold text-white">
                  Complete Lesson {String(activeQuest.number).padStart(2, '0')} First
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Review the concepts in 1. Lesson and answer the concept check to unlock the hands-on terminal lab checkpoints.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStageTab('lesson')}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#EE0000] hover:bg-rose-600 rounded-md transition-colors"
              >
                Open Lesson
              </button>
            </div>
          )}

          {stageTab === 'lab' && isLessonCompleted && (
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              <div>
                <div className="text-xs font-medium text-emerald-400 mb-1">
                  Lesson Complete — Now Complete Lab Objectives
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {activeQuest.briefing}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-[#0F141D] border border-[#242E40] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-mono text-slate-300">
                  <span className="text-slate-500">Lab CLI:</span>{' '}
                  <span className="text-sky-300">lab start {activeQuest.labSlug}</span>
                  <span className="text-slate-500 mx-1.5">·</span>
                  <span className="text-sky-300">lab grade</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onInsertCommand(`lab start ${activeQuest.labSlug}`)}
                    className="px-2.5 py-1 text-[11px] font-medium text-slate-100 bg-[#1B2332] hover:bg-[#253044] rounded transition-colors"
                  >
                    lab start
                  </button>
                  <button
                    type="button"
                    onClick={() => onInsertCommand('lab grade')}
                    className="px-2.5 py-1 text-[11px] font-medium text-white bg-[#EE0000] hover:bg-rose-600 rounded transition-colors"
                  >
                    lab grade
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Lab Verification Checkpoints
                  </h3>
                  <span className="text-xs font-mono tabular-nums text-slate-400">
                    {passedCount}/{activeQuest.objectives.length} Passed
                  </span>
                </div>

                <div className="divide-y divide-[#1E2636] border border-[#242E40] rounded-lg bg-[#0F141D]">
                  {objectiveResults.map(({ obj, passed }) => {
                    const hintOpen = expandedHintId === obj.id;
                    return (
                      <div key={obj.id} className="p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            {passed ? (
                              <CheckCircle2
                                className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"
                                aria-hidden="true"
                              />
                            ) : (
                              <Circle
                                className="w-4 h-4 text-slate-500 shrink-0 mt-0.5"
                                aria-hidden="true"
                              />
                            )}
                            <div className="min-w-0">
                              <div
                                className={`text-sm font-medium ${
                                  passed ? 'text-emerald-300' : 'text-slate-100'
                                }`}
                              >
                                {obj.title}
                              </div>
                              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                                {obj.description}
                              </p>
                            </div>
                          </div>

                          <span
                            className={`text-[11px] font-medium shrink-0 mt-0.5 ${
                              passed ? 'text-emerald-400' : 'text-slate-500'
                            }`}
                          >
                            {passed ? 'Passed' : 'Pending'}
                          </span>
                        </div>

                        {!passed && (
                          <div className="mt-2.5 pl-6.5 flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setExpandedHintId(hintOpen ? null : obj.id)}
                              className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors"
                            >
                              <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
                              {hintOpen ? 'Hide Hint' : 'Show Hint'}
                            </button>
                          </div>
                        )}

                        {hintOpen && !passed && (
                          <div className="mt-2.5 ml-6.5 p-3 rounded bg-[#141B27] border border-[#242E40] text-xs space-y-2">
                            <div className="text-slate-300 leading-relaxed">{obj.hint}</div>
                            {obj.commandExample && (
                              <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#1E2636]">
                                <code className="font-mono text-sky-300 truncate">
                                  {obj.commandExample}
                                </code>
                                <button
                                  type="button"
                                  onClick={() => onInsertCommand(obj.commandExample!)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-100 bg-[#1F293B] hover:bg-[#2A374E] rounded shrink-0 transition-colors"
                                >
                                  <Play className="w-3 h-3" aria-hidden="true" />
                                  Insert
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {allLabPassed && (
                <div className="p-4 rounded-lg bg-emerald-950/30 border border-emerald-800/60 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Trophy className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden="true" />
                    <div>
                      <div className="text-sm font-semibold text-emerald-200">
                        Lesson &amp; Lab Complete
                      </div>
                      <div className="text-xs text-emerald-300/80">
                        All {activeQuest.objectives.length} lab checkpoints verified on the VM.
                      </div>
                    </div>
                  </div>
                  {nextQuest && (
                    <button
                      type="button"
                      onClick={() => onSelectQuest(nextQuest.id)}
                      className="px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-600 rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      Next Module
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Module Navigation Footer */}
          <div className="px-5 py-3 border-t border-[#242E40] bg-[#141A24] flex items-center justify-between gap-4 shrink-0">
            <button
              type="button"
              disabled={!prevQuest}
              onClick={() => prevQuest && onSelectQuest(prevQuest.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Previous
            </button>

            <button
              type="button"
              disabled={!nextQuest}
              onClick={() => nextQuest && onSelectQuest(nextQuest.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              Next Module
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
