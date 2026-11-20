import { useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FlaskConical,
  Layers,
  Terminal,
} from 'lucide-react';
import { Challenge, PlayerProgress, Quest } from '../types/rhel';
import { getRankForXp } from '../data/curriculum';

interface CoursesPortalProps {
  quests: Quest[];
  challenges: Challenge[];
  activeQuestId: string;
  progress: PlayerProgress;
  onLaunchQuest: (questId: string) => void;
  onLaunchChallenge: (challengeId: string) => void;
}

type PortalTab = 'course' | 'learning-path' | 'assignment';

export function CoursesPortal({
  quests,
  challenges,
  activeQuestId,
  progress,
  onLaunchQuest,
  onLaunchChallenge,
}: CoursesPortalProps) {
  const [tab, setTab] = useState<PortalTab>('course');

  // Compute live course completion across all Lessons + Labs (2 units per module)
  const totalSteps = quests.length * 2;
  const completedSteps =
    progress.completedLessons.length + progress.completedQuests.length;
  const coursePercent = Math.round((completedSteps / totalSteps) * 100);
  const rank = getRankForXp(progress.xp);

  // Resume next incomplete module, or activeQuestId
  const nextIncompleteQuest =
    quests.find((q) => !progress.completedQuests.includes(q.id)) ||
    quests.find((q) => q.id === activeQuestId) ||
    quests[0];

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header Row matching Red Hat My Courses */}
      <div className="bg-[#121721] border border-[#242E40] rounded-lg px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white font-display">My Courses</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Red Hat Academy &amp; RHCSA Curriculum Standard · {rank.title} ·{' '}
            <span className="font-mono tabular-nums text-amber-400">{progress.xp} XP</span>
          </p>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-3 font-mono tabular-nums">
          <span>
            Lessons: {progress.completedLessons.length}/{quests.length}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Labs: {progress.completedQuests.length}/{quests.length}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Trials: {progress.completedChallenges.length}/{challenges.length}
          </span>
        </div>
      </div>

      {/* Course / Learning Path / Assignment Tab Strip */}
      <div>
        <div className="flex items-end border-b border-[#242E40]">
          <button
            type="button"
            onClick={() => setTab('course')}
            className={`px-5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'course'
                ? 'bg-[#121721] text-white border-t-2 border-t-[#EE0000] border-x border-x-[#242E40] -mb-px'
                : 'text-sky-400 hover:text-sky-300'
            }`}
          >
            Course
          </button>
          <button
            type="button"
            onClick={() => setTab('learning-path')}
            className={`px-5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'learning-path'
                ? 'bg-[#121721] text-white border-t-2 border-t-[#EE0000] border-x border-x-[#242E40] -mb-px'
                : 'text-sky-400 hover:text-sky-300'
            }`}
          >
            Learning Path
          </button>
          <button
            type="button"
            onClick={() => setTab('assignment')}
            className={`px-5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'assignment'
                ? 'bg-[#121721] text-white border-t-2 border-t-[#EE0000] border-x border-x-[#242E40] -mb-px'
                : 'text-sky-400 hover:text-sky-300'
            }`}
          >
            Assignment
          </button>
        </div>

        {/* Tab 1: Course Card + Official RH124 9.3 Syllabus */}
        {tab === 'course' && (
          <div className="bg-[#121721] border-x border-b border-[#242E40] rounded-b-lg p-6 space-y-6">
            {/* Official RH124 9.3 Course Card */}
            <div className="p-5 bg-[#0F141D] border border-[#242E40] rounded-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-full bg-[#169CB5] flex items-center justify-center shrink-0 text-white"
                    aria-hidden="true"
                  >
                    <Terminal className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white font-display">
                      Red Hat System Administration I 9.3
                    </h2>
                    <div className="text-sm text-slate-300 mt-0.5">
                      RH124 - September 16, 2026 - September 16, 2027
                    </div>
                    <div className="text-xs font-mono text-slate-400 mt-1">
                      Classroom Hosts: workstation (172.25.250.9) · servera (172.25.250.10) · serverb (172.25.250.11)
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onLaunchQuest(nextIncompleteQuest.id)}
                  className="text-sm font-semibold text-sky-400 hover:text-sky-300 px-4 py-2 rounded border border-[#242E40] bg-[#141B27] hover:bg-[#1B2435] transition-colors whitespace-nowrap shrink-0"
                >
                  Launch
                </button>
              </div>

              {/* Diagonal-Striped Progress Bar matching Red Hat Portal */}
              <div className="w-full h-5 bg-[#1D2533] rounded-sm overflow-hidden relative">
                <div
                  className="h-full transition-all duration-300 flex items-center justify-end pr-2"
                  style={{
                    width: `${Math.max(coursePercent, 4)}%`,
                    backgroundColor: '#169CB5',
                    backgroundImage:
                      'repeating-linear-gradient(-45deg, rgba(255,255,255,0.14), rgba(255,255,255,0.14) 6px, transparent 6px, transparent 12px)',
                  }}
                >
                  <span className="text-[11px] font-mono font-semibold tabular-nums text-white drop-shadow">
                    {coursePercent}%
                  </span>
                </div>
              </div>
            </div>

            {/* Official RH124 9.3 Chapter Modules */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-100">
                  RH124 (RHEL 9.3) Course Modules — Lesson &amp; Guided Lab
                </h3>
                <span className="text-xs text-slate-400">
                  Complete each Lesson to unlock its Lab
                </span>
              </div>

              <div className="border border-[#242E40] rounded-md divide-y divide-[#1D2535] bg-[#0F141D]">
                {quests.map((q) => {
                  const lessonDone = progress.completedLessons.includes(q.id);
                  const labDone = progress.completedQuests.includes(q.id);
                  return (
                    <div
                      key={q.id}
                      className="px-4 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-[#141B27] transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                          <span className="font-mono tabular-nums text-slate-300">
                            {String(q.number).padStart(2, '0')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{q.moduleCode}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-sky-300/90">{q.labSlug}</span>
                          <span aria-hidden="true">·</span>
                          <span>{q.rhcsaDomain}</span>
                        </div>
                        <div className="text-sm font-medium text-white mt-0.5">
                          {q.title}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{q.subtitle}</div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="flex items-center gap-3 text-xs">
                          <span
                            className={`inline-flex items-center gap-1 ${
                              lessonDone ? 'text-emerald-400' : 'text-slate-400'
                            }`}
                          >
                            <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                            {lessonDone ? 'Lesson Passed' : 'Lesson Pending'}
                          </span>
                          <span aria-hidden="true" className="text-slate-600">
                            ·
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 ${
                              labDone
                                ? 'text-emerald-400'
                                : lessonDone
                                ? 'text-sky-400'
                                : 'text-slate-500'
                            }`}
                          >
                            <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />
                            {labDone
                              ? 'Lab Passed'
                              : lessonDone
                              ? 'Lab Ready'
                              : 'Lab Locked'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onLaunchQuest(q.id)}
                          className="text-xs font-semibold text-sky-400 hover:text-sky-300 px-3 py-1.5 rounded border border-[#242E40] bg-[#161E2C] hover:bg-[#1E293B] transition-colors whitespace-nowrap"
                        >
                          Launch
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Learning Path */}
        {tab === 'learning-path' && (
          <div className="bg-[#121721] border-x border-b border-[#242E40] rounded-b-lg p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white font-display">
                Red Hat Certified System Administrator (RHCSA) Learning Path
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Standard Red Hat Enterprise Linux 9.3 certification progression track.
              </p>
            </div>

            <div className="divide-y divide-[#1D2535] border border-[#242E40] rounded-md bg-[#0F141D]">
              <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-full bg-[#169CB5] flex items-center justify-center text-white shrink-0">
                    <Layers className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xs text-emerald-400 font-medium">
                      Step 1 · Active Enrollment ({coursePercent}% Complete)
                    </div>
                    <div className="text-base font-semibold text-white mt-0.5">
                      RH124: Red Hat System Administration I (RHEL 9.3)
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      All 16 official RHEL 9.3 chapters: command line fluency, file management, local users/groups, POSIX permissions, processes, systemd services, OpenSSH, journald logging, NetworkManager, archives/DNF, local file systems (lsblk/mount), firewalld, and sosreport diagnostics.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onLaunchQuest(nextIncompleteQuest.id)}
                  className="text-xs font-semibold text-sky-400 hover:text-sky-300 px-4 py-2 rounded border border-[#242E40] bg-[#161E2C] hover:bg-[#1E293B] transition-colors shrink-0"
                >
                  Launch
                </button>
              </div>

              <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-full bg-[#1E2738] border border-[#2E3C54] flex items-center justify-center text-slate-300 shrink-0">
                    <Award className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 font-medium">
                      Step 2 · Practical Readiness Assessment
                    </div>
                    <div className="text-base font-semibold text-white mt-0.5">
                      EX200 Skill Trials — Timed Hands-On Scenarios
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Validate your RH124 command mastery under timed exam conditions with automated Grade Lab verification ({progress.completedChallenges.length}/{challenges.length} passed).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onLaunchChallenge(challenges[0].id)}
                  className="text-xs font-semibold text-sky-400 hover:text-sky-300 px-4 py-2 rounded border border-[#242E40] bg-[#161E2C] hover:bg-[#1E293B] transition-colors shrink-0"
                >
                  Launch Trials
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Assignment */}
        {tab === 'assignment' && (
          <div className="bg-[#121721] border-x border-b border-[#242E40] rounded-b-lg p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-white font-display">
                Assigned Practical Labs &amp; Assessments
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Complete these graded RHEL 9.3 practical exercises to validate exam readiness.
              </p>
            </div>

            <div className="divide-y divide-[#1D2535] border border-[#242E40] rounded-md bg-[#0F141D]">
              {challenges.map((c) => {
                const best = progress.challengeBestScores[c.id];
                const passed = progress.completedChallenges.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#141B27] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs text-slate-400 flex items-center gap-2">
                        <span className="font-mono tabular-nums">Trial {c.number}</span>
                        <span aria-hidden="true">·</span>
                        <span>{c.difficulty}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          {Math.round(c.timeLimitSeconds / 60)} min
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-amber-400">+{c.xp} XP</span>
                      </div>
                      <div className="text-sm font-semibold text-white mt-0.5">{c.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{c.subtitle}</div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-xs font-medium">
                        {passed ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            Passed (100%)
                          </span>
                        ) : best !== undefined ? (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />
                            Best: {best}%
                          </span>
                        ) : (
                          <span className="text-slate-500">Not Attempted</span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onLaunchChallenge(c.id)}
                        className="text-xs font-semibold text-sky-400 hover:text-sky-300 px-3 py-1.5 rounded border border-[#242E40] bg-[#161E2C] hover:bg-[#1E293B] transition-colors whitespace-nowrap"
                      >
                        Launch
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
