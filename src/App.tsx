import { useCallback, useEffect, useState } from 'react';
import { CHALLENGES, QUESTS } from './data/curriculum';
import { cloneVmState, createInitialVmState } from './engine/initialVmState';
import { runShellCommand } from './engine/shellEngine';
import { createVfsFile } from './engine/vfsUtils';
import {
  AppView,
  EditorSession,
  FeedbackEvent,
  ManSession,
  PlayerProgress,
  TerminalLine,
  VmState,
} from './types/rhel';
import { Header } from './components/Header';
import { CoursesPortal } from './components/CoursesPortal';
import { TerminalWorkspace } from './components/TerminalWorkspace';
import { QuestPanel } from './components/QuestPanel';
import { ChallengeArena } from './components/ChallengeArena';
import { SystemStateExplorer } from './components/SystemStateExplorer';
import { CommandReference } from './components/CommandReference';

const PROGRESS_STORAGE_KEY = 'rh124_lab_progress_v1';

const DEFAULT_PROGRESS: PlayerProgress = {
  xp: 0,
  completedLessons: [],
  completedQuests: [],
  completedChallenges: [],
  challengeBestScores: {},
};

function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    return {
      ...DEFAULT_PROGRESS,
      ...parsed,
      completedLessons: parsed.completedLessons || [],
      completedQuests: parsed.completedQuests || [],
      completedChallenges: parsed.completedChallenges || [],
      challengeBestScores: parsed.challengeBestScores || {},
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

function buildQuestVm(questId: string): VmState {
  const vm = createInitialVmState();
  const quest = QUESTS.find((q) => q.id === questId);
  return quest?.setupVm ? quest.setupVm(vm) : vm;
}

function buildChallengeVm(challengeId: string): VmState {
  const vm = createInitialVmState();
  const challenge = CHALLENGES.find((c) => c.id === challengeId);
  return challenge ? challenge.setupVm(vm) : vm;
}

function createWelcomeLines(label: string): TerminalLine[] {
  return [
    {
      id: `welcome-1-${Date.now()}`,
      type: 'info',
      text: `Red Hat Enterprise Linux 9.3 (Plow) · Kernel 5.14.0-427.13.1.el9_4.x86_64 · Hosts: workstation, servera, serverb`,
    },
    {
      id: `welcome-2-${Date.now()}`,
      type: 'output',
      text: `Session ready: ${label}. Use "lab start <slug>", "lab grade", "man <command>", or "help".`,
    },
  ];
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('courses');
  const [progress, setProgress] = useState<PlayerProgress>(loadProgress);

  // Quest VM state
  const [activeQuestId, setActiveQuestId] = useState<string>(QUESTS[0].id);
  const [questVm, setQuestVm] = useState<VmState>(() => buildQuestVm(QUESTS[0].id));
  const [questLines, setQuestLines] = useState<TerminalLine[]>(() =>
    createWelcomeLines(`Quest 01 — ${QUESTS[0].title}`)
  );
  const [questFeedback, setQuestFeedback] = useState<FeedbackEvent | null>(null);
  const [questEditor, setQuestEditor] = useState<EditorSession | null>(null);
  const [questMan, setQuestMan] = useState<ManSession | null>(null);
  const [commandDraft, setCommandDraft] = useState<string>('');

  // Challenge VM state
  const [activeChallengeId, setActiveChallengeId] = useState<string>(CHALLENGES[0].id);
  const [challengeVm, setChallengeVm] = useState<VmState>(() =>
    buildChallengeVm(CHALLENGES[0].id)
  );
  const [challengeLines, setChallengeLines] = useState<TerminalLine[]>(() =>
    createWelcomeLines(`Trial 01 — ${CHALLENGES[0].title}`)
  );
  const [challengeFeedback, setChallengeFeedback] = useState<FeedbackEvent | null>(null);
  const [challengeEditor, setChallengeEditor] = useState<EditorSession | null>(null);
  const [challengeMan, setChallengeMan] = useState<ManSession | null>(null);

  const activeQuest = QUESTS.find((q) => q.id === activeQuestId) || QUESTS[0];
  const activeChallenge =
    CHALLENGES.find((c) => c.id === activeChallengeId) || CHALLENGES[0];

  useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // Ignore storage quota errors
    }
  }, [progress]);

  const checkQuestCompletion = useCallback(
    (nextVm: VmState, questId: string, overrideCompletedLessons?: string[]) => {
      const quest = QUESTS.find((q) => q.id === questId);
      if (!quest) return;
      const lessonsDone = overrideCompletedLessons ?? progress.completedLessons;
      if (!lessonsDone.includes(quest.id)) return;

      const allPassed = quest.objectives.every((obj) => obj.check(nextVm));
      if (allPassed) {
        setProgress((prev) => {
          if (prev.completedQuests.includes(quest.id)) return prev;
          return {
            ...prev,
            xp: prev.xp + quest.xp,
            completedQuests: [...prev.completedQuests, quest.id],
          };
        });
        setQuestFeedback({
          id: `quest-complete-${Date.now()}`,
          status: 'passed',
          title: `Lab ${String(quest.number).padStart(2, '0')} Completed (+${quest.xp} XP)`,
          detail: `Lesson and all ${quest.objectives.length} lab checkpoints passed. Advance to the next module when ready.`,
        });
      }
    },
    [progress.completedLessons]
  );

  const handleCompleteLesson = (questId: string) => {
    const quest = QUESTS.find((q) => q.id === questId);
    if (!quest) return;
    const nextLessons = progress.completedLessons.includes(questId)
      ? progress.completedLessons
      : [...progress.completedLessons, questId];

    setProgress((prev) => {
      if (prev.completedLessons.includes(questId)) return prev;
      return {
        ...prev,
        xp: prev.xp + 25,
        completedLessons: [...prev.completedLessons, questId],
      };
    });

    setQuestFeedback({
      id: `lesson-complete-${Date.now()}`,
      status: 'passed',
      title: `Lesson ${String(quest.number).padStart(2, '0')} Complete (+25 XP)`,
      detail: `Lab unlocked! Complete the ${quest.objectives.length} hands-on checkpoints in the terminal.`,
    });

    checkQuestCompletion(questVm, questId, nextLessons);
  };

  const formatPromptForVm = (vm: VmState) => {
    const shortHost = vm.hostname.split('.')[0];
    const home = vm.users[vm.currentUser]?.home || '/home/student';
    const displayCwd =
      vm.cwd === home
        ? '~'
        : vm.cwd === '/'
        ? '/'
        : vm.cwd.split('/').pop() || vm.cwd;
    const ch = vm.currentUser === 'root' ? '#' : '$';
    return `[${vm.currentUser}@${shortHost} ${displayCwd}]${ch}`;
  };

  const executeInQuestVm = (rawCommand: string) => {
    const prompt = formatPromptForVm(questVm);
    const result = runShellCommand(questVm, rawCommand, activeQuest);

    if (result.clearTerminal) {
      setQuestLines([]);
    } else {
      const newLines: TerminalLine[] = [
        {
          id: `in-${Date.now()}-${Math.random()}`,
          type: 'input',
          prompt,
          text: rawCommand,
        },
      ];
      if (result.stdout) {
        newLines.push({
          id: `out-${Date.now()}-${Math.random()}`,
          type: 'output',
          text: result.stdout,
        });
      }
      if (result.stderr) {
        newLines.push({
          id: `err-${Date.now()}-${Math.random()}`,
          type: 'error',
          text: result.stderr,
        });
      }
      setQuestLines((prev) => [...prev, ...newLines].slice(-300));
    }

    setQuestVm(result.vm);
    if (result.openEditor) setQuestEditor(result.openEditor);
    if (result.openMan) setQuestMan(result.openMan);
    setQuestFeedback(result.feedback || null);
    checkQuestCompletion(result.vm, activeQuestId);
  };

  const executeInChallengeVm = (rawCommand: string) => {
    const prompt = formatPromptForVm(challengeVm);
    const result = runShellCommand(challengeVm, rawCommand);

    if (result.clearTerminal) {
      setChallengeLines([]);
    } else {
      const newLines: TerminalLine[] = [
        {
          id: `cin-${Date.now()}-${Math.random()}`,
          type: 'input',
          prompt,
          text: rawCommand,
        },
      ];
      if (result.stdout) {
        newLines.push({
          id: `cout-${Date.now()}-${Math.random()}`,
          type: 'output',
          text: result.stdout,
        });
      }
      if (result.stderr) {
        newLines.push({
          id: `cerr-${Date.now()}-${Math.random()}`,
          type: 'error',
          text: result.stderr,
        });
      }
      setChallengeLines((prev) => [...prev, ...newLines].slice(-300));
    }

    setChallengeVm(result.vm);
    if (result.openEditor) setChallengeEditor(result.openEditor);
    if (result.openMan) setChallengeMan(result.openMan);
    setChallengeFeedback(result.feedback || null);
  };

  const handleSaveQuestEditor = (filePath: string, content: string) => {
    const nextVm = cloneVmState(questVm);
    const owner = questEditor?.elevated ? 'root' : nextVm.currentUser;
    createVfsFile(nextVm, filePath, content, owner);
    setQuestVm(nextVm);
    if (filePath === '/etc/ssh/sshd_config') {
      setQuestFeedback({
        id: `sshd-save-${Date.now()}`,
        status: 'tip',
        title: 'sshd_config Saved',
        detail: 'Run "sudo systemctl reload sshd" for OpenSSH daemon changes to take effect.',
      });
    }
    checkQuestCompletion(nextVm, activeQuestId);
  };

  const handleSaveChallengeEditor = (filePath: string, content: string) => {
    const nextVm = cloneVmState(challengeVm);
    const owner = challengeEditor?.elevated ? 'root' : nextVm.currentUser;
    createVfsFile(nextVm, filePath, content, owner);
    setChallengeVm(nextVm);
  };

  const handleSelectQuest = (questId: string) => {
    const q = QUESTS.find((item) => item.id === questId);
    if (!q) return;
    setActiveQuestId(questId);
    setQuestVm(buildQuestVm(questId));
    setQuestLines(
      createWelcomeLines(`Quest ${String(q.number).padStart(2, '0')} — ${q.title}`)
    );
    setQuestFeedback(null);
    setQuestEditor(null);
    setQuestMan(null);
  };

  const handleSelectChallenge = (challengeId: string) => {
    const c = CHALLENGES.find((item) => item.id === challengeId);
    if (!c) return;
    setActiveChallengeId(challengeId);
    setChallengeVm(buildChallengeVm(challengeId));
    setChallengeLines(
      createWelcomeLines(`Trial ${String(c.number).padStart(2, '0')} — ${c.title}`)
    );
    setChallengeFeedback(null);
    setChallengeEditor(null);
    setChallengeMan(null);
  };

  const handleResetVm = () => {
    if (activeView === 'challenges') {
      handleSelectChallenge(activeChallengeId);
    } else {
      handleSelectQuest(activeQuestId);
    }
  };

  const handleRecordChallengeScore = (
    challengeId: string,
    scorePct: number,
    xpEarned: number
  ) => {
    setProgress((prev) => {
      const prevBest = prev.challengeBestScores[challengeId] ?? 0;
      const alreadyDone = prev.completedChallenges.includes(challengeId);
      const nextBest = Math.max(prevBest, scorePct);
      const addXp = !alreadyDone && scorePct === 100 ? xpEarned : 0;
      return {
        ...prev,
        xp: prev.xp + addXp,
        completedChallenges:
          scorePct === 100 && !alreadyDone
            ? [...prev.completedChallenges, challengeId]
            : prev.completedChallenges,
        challengeBestScores: {
          ...prev.challengeBestScores,
          [challengeId]: nextBest,
        },
      };
    });
  };

  const handleKillProcessFromInspector = (pid: number) => {
    const nextVm = cloneVmState(questVm);
    nextVm.processes = nextVm.processes.filter((p) => p.pid !== pid || p.protected);
    setQuestVm(nextVm);
    checkQuestCompletion(nextVm, activeQuestId);
  };

  const handleTryCommandFromReference = (command: string) => {
    setCommandDraft(command);
    setActiveView('quests');
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0B0E14] text-slate-100 overflow-hidden">
      <Header
        activeView={activeView}
        onChangeView={setActiveView}
        onResetVm={handleResetVm}
      />

      <main className="flex-1 min-h-0 overflow-hidden">
        {activeView === 'courses' && (
          <CoursesPortal
            quests={QUESTS}
            challenges={CHALLENGES}
            activeQuestId={activeQuestId}
            progress={progress}
            onLaunchQuest={(questId) => {
              handleSelectQuest(questId);
              setActiveView('quests');
            }}
            onLaunchChallenge={(challengeId) => {
              handleSelectChallenge(challengeId);
              setActiveView('challenges');
            }}
          />
        )}

        {activeView === 'quests' && (
          <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 lg:p-5 overflow-hidden">
            <div className="lg:col-span-5 min-h-[340px] h-full overflow-hidden">
              <QuestPanel
                quests={QUESTS}
                activeQuest={activeQuest}
                vm={questVm}
                progress={progress}
                onSelectQuest={handleSelectQuest}
                onCompleteLesson={handleCompleteLesson}
                onInsertCommand={(cmd) => setCommandDraft(cmd)}
              />
            </div>

            <div className="lg:col-span-7 min-h-[380px] h-full overflow-hidden">
              <TerminalWorkspace
                vm={questVm}
                lines={questLines}
                feedback={questFeedback}
                editor={questEditor}
                manSession={questMan}
                onExecute={executeInQuestVm}
                onClear={() => setQuestLines([])}
                onSaveEditor={handleSaveQuestEditor}
                onCloseEditor={() => setQuestEditor(null)}
                onCloseMan={() => setQuestMan(null)}
                externalCommandDraft={commandDraft}
                onConsumeExternalDraft={() => setCommandDraft('')}
              />
            </div>
          </div>
        )}

        {activeView === 'challenges' && (
          <ChallengeArena
            challenges={CHALLENGES}
            activeChallenge={activeChallenge}
            vm={challengeVm}
            lines={challengeLines}
            feedback={challengeFeedback}
            editor={challengeEditor}
            manSession={challengeMan}
            bestScores={progress.challengeBestScores}
            onSelectChallenge={handleSelectChallenge}
            onExecute={executeInChallengeVm}
            onClear={() => setChallengeLines([])}
            onSaveEditor={handleSaveChallengeEditor}
            onCloseEditor={() => setChallengeEditor(null)}
            onCloseMan={() => setChallengeMan(null)}
            onResetChallenge={() => handleSelectChallenge(activeChallengeId)}
            onRecordChallengeScore={handleRecordChallengeScore}
          />
        )}

        {activeView === 'state' && (
          <SystemStateExplorer
            vm={questVm}
            onKillProcess={handleKillProcessFromInspector}
          />
        )}

        {activeView === 'reference' && (
          <CommandReference onTryCommand={handleTryCommandFromReference} />
        )}
      </main>
    </div>
  );
}
