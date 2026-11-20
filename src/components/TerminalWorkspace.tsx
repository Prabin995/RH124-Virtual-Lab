import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileCode2,
  Info,
  Terminal as TerminalIcon,
  Trash2,
  X,
} from 'lucide-react';
import {
  EditorSession,
  FeedbackEvent,
  ManSession,
  TerminalLine,
  VmState,
} from '../types/rhel';
import { getAutocompleteSuggestions } from '../engine/shellEngine';

interface TerminalWorkspaceProps {
  vm: VmState;
  lines: TerminalLine[];
  feedback: FeedbackEvent | null;
  editor: EditorSession | null;
  manSession: ManSession | null;
  onExecute: (command: string) => void;
  onClear: () => void;
  onSaveEditor: (filePath: string, content: string) => void;
  onCloseEditor: () => void;
  onCloseMan: () => void;
  externalCommandDraft?: string;
  onConsumeExternalDraft?: () => void;
}

export function TerminalWorkspace({
  vm,
  lines,
  feedback,
  editor,
  manSession,
  onExecute,
  onClear,
  onSaveEditor,
  onCloseEditor,
  onCloseMan,
  externalCommandDraft,
  onConsumeExternalDraft,
}: TerminalWorkspaceProps) {
  const [input, setInput] = useState('');
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [tabSuggestions, setTabSuggestions] = useState<string[]>([]);

  // Vim / Nano editor state
  const [editorText, setEditorText] = useState('');
  const [vimMode, setVimMode] = useState<'NORMAL' | 'INSERT' | 'COMMAND'>('NORMAL');
  const [vimCmd, setVimCmd] = useState('');
  const [vimMessage, setVimMessage] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);
  const vimCommandRef = useRef<HTMLInputElement>(null);

  const shortHost = vm.hostname.split('.')[0];
  const home = vm.users[vm.currentUser]?.home || '/home/student';
  const displayCwd =
    vm.cwd === home
      ? '~'
      : vm.cwd === '/'
      ? '/'
      : vm.cwd.split('/').pop() || vm.cwd;
  const promptChar = vm.currentUser === 'root' ? '#' : '$';
  const promptLabel = `[${vm.currentUser}@${shortHost} ${displayCwd}]${promptChar}`;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, feedback]);

  useEffect(() => {
    if (externalCommandDraft) {
      setInput(externalCommandDraft);
      onConsumeExternalDraft?.();
      inputRef.current?.focus();
    }
  }, [externalCommandDraft, onConsumeExternalDraft]);

  useEffect(() => {
    if (editor) {
      setEditorText(editor.content);
      setVimMode(editor.mode === 'nano' ? 'INSERT' : 'NORMAL');
      setVimCmd('');
      setVimMessage(
        editor.readOnly
          ? 'Read-only file (launch with sudo to save changes)'
          : editor.mode === 'vim'
          ? 'NORMAL mode — press i to edit, Esc for Normal, :wq to save & exit'
          : 'Nano mode — edit text directly, click Save & Exit when done'
      );
    }
  }, [editor]);

  useEffect(() => {
    if (vimMode === 'COMMAND') {
      vimCommandRef.current?.focus();
    } else if (editor && vimMode === 'INSERT') {
      editorTextareaRef.current?.focus();
    }
  }, [vimMode, editor]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input;
    setInput('');
    setHistoryIdx(-1);
    setTabSuggestions([]);
    onExecute(cmd);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (vm.commandHistory.length === 0) return;
      const nextIdx =
        historyIdx === -1 ? vm.commandHistory.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(nextIdx);
      setInput(vm.commandHistory[nextIdx]);
      setTabSuggestions([]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx === -1) return;
      if (historyIdx >= vm.commandHistory.length - 1) {
        setHistoryIdx(-1);
        setInput('');
      } else {
        const nextIdx = historyIdx + 1;
        setHistoryIdx(nextIdx);
        setInput(vm.commandHistory[nextIdx]);
      }
      setTabSuggestions([]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const matches = getAutocompleteSuggestions(vm, input);
      if (matches.length === 1) {
        const parts = input.split(/\s+/);
        parts[parts.length - 1] = matches[0];
        setInput(parts.join(' ') + (parts.length === 1 ? ' ' : ''));
        setTabSuggestions([]);
      } else if (matches.length > 1) {
        setTabSuggestions(matches);
      }
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      onClear();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      setInput('');
      setTabSuggestions([]);
    }
  };

  const applySuggestion = (sug: string) => {
    const parts = input.split(/\s+/);
    parts[parts.length - 1] = sug;
    setInput(parts.join(' ') + (parts.length === 1 ? ' ' : ''));
    setTabSuggestions([]);
    inputRef.current?.focus();
  };

  const handleVimCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editor) return;
    const cmd = vimCmd.trim();
    if (cmd === 'q' || cmd === 'q!') {
      onCloseEditor();
      return;
    }
    if (cmd === 'w') {
      if (editor.readOnly) {
        setVimMessage('E45: readonly option is set (exit with :q! and retry with sudo)');
        setVimMode('NORMAL');
        setVimCmd('');
        return;
      }
      onSaveEditor(editor.filePath, editorText);
      setVimMessage(`"${editor.filePath}" written`);
      setVimMode('NORMAL');
      setVimCmd('');
      return;
    }
    if (cmd === 'wq' || cmd === 'x') {
      if (editor.readOnly) {
        setVimMessage('E45: readonly option is set (exit with :q! and retry with sudo)');
        setVimMode('NORMAL');
        setVimCmd('');
        return;
      }
      onSaveEditor(editor.filePath, editorText);
      onCloseEditor();
      return;
    }
    setVimMessage(`E492: Not an editor command: ${cmd}`);
    setVimMode('NORMAL');
    setVimCmd('');
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editor || editor.mode === 'nano') return;
    if (vimMode === 'NORMAL') {
      if (e.key === 'i' || e.key === 'a') {
        e.preventDefault();
        setVimMode('INSERT');
        setVimMessage('-- INSERT --');
      } else if (e.key === ':') {
        e.preventDefault();
        setVimMode('COMMAND');
        setVimCmd('');
      } else if (e.key === 'd') {
        // Quick dd simulation: delete last non-empty line or current line
        e.preventDefault();
        const textLines = editorText.split('\n');
        if (textLines.length > 1) {
          textLines.pop();
          setEditorText(textLines.join('\n'));
          setVimMessage('Deleted line');
        }
      }
    } else if (vimMode === 'INSERT' && e.key === 'Escape') {
      e.preventDefault();
      setVimMode('NORMAL');
      setVimMessage('NORMAL mode — type :wq to save and quit');
    } else if (vimMode === 'COMMAND' && e.key === 'Escape') {
      e.preventDefault();
      setVimMode('NORMAL');
      setVimCmd('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0D1117] border border-[#242E40] rounded-lg overflow-hidden">
      {/* Terminal Top Bar */}
      <div className="h-10 px-4 bg-[#141A24] border-b border-[#242E40] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <TerminalIcon className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
          <span className="text-xs font-mono text-slate-200 truncate">
            {vm.currentUser}@{vm.hostname}
          </span>
          <span className="text-xs text-slate-500 hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-mono text-slate-400 truncate hidden sm:inline">
            {vm.cwd}
          </span>
          {vm.sshStack.length > 0 && (
            <>
              <span className="text-xs text-slate-500 hidden md:inline" aria-hidden="true">
                ·
              </span>
              <span className="text-xs font-mono text-amber-300 hidden md:inline">
                SSH ({vm.activeHostKey})
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-[#1C2433] hover:bg-[#253044] border border-[#2B374D] rounded transition-colors whitespace-nowrap"
          >
            <Trash2 className="w-3 h-3" aria-hidden="true" />
            Clear
          </button>
        </div>
      </div>

      {/* Interactive Man Page Pager */}
      {manSession && (
        <div className="flex-1 flex flex-col bg-[#0A0E14] overflow-hidden">
          <div className="px-4 py-2.5 bg-[#161E2B] border-b border-[#242E40] flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono text-sky-400">
              <BookOpen className="w-4 h-4" aria-hidden="true" />
              <span>
                Manual page {manSession.topic}({manSession.section})
              </span>
            </div>
            <button
              type="button"
              onClick={onCloseMan}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-200 bg-[#212B3D] hover:bg-[#2B3850] rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              Quit (q)
            </button>
          </div>
          <pre
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'q' || e.key === 'Escape') onCloseMan();
            }}
            className="flex-1 p-5 overflow-y-auto font-mono text-[13px] leading-relaxed text-slate-200 whitespace-pre-wrap focus:outline-none"
          >
            {manSession.content}
          </pre>
        </div>
      )}

      {/* Interactive Vim / Nano Editor */}
      {!manSession && editor && (
        <div
          className="flex-1 flex flex-col bg-[#0A0E14] overflow-hidden"
          onKeyDown={handleEditorKeyDown}
        >
          <div className="px-4 py-2.5 bg-[#161E2B] border-b border-[#242E40] flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <FileCode2 className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              <span className="text-xs font-mono text-slate-100 truncate">
                {editor.mode.toUpperCase()} — {editor.filePath}
              </span>
              <span className="text-xs text-slate-400 shrink-0">
                {vimMode}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {editor.mode === 'vim' && vimMode === 'NORMAL' && (
                <button
                  type="button"
                  onClick={() => {
                    setVimMode('INSERT');
                    setVimMessage('-- INSERT --');
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-sky-300 bg-sky-950/60 border border-sky-800/60 rounded hover:bg-sky-900/60 transition-colors"
                >
                  Insert Mode (i)
                </button>
              )}
              {!editor.readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    onSaveEditor(editor.filePath, editorText);
                    onCloseEditor();
                  }}
                  className="px-3 py-1 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-600 rounded transition-colors"
                >
                  Save &amp; Quit (:wq)
                </button>
              )}
              <button
                type="button"
                onClick={onCloseEditor}
                className="px-2.5 py-1 text-xs font-medium text-slate-300 bg-[#212B3D] hover:bg-[#2B3850] rounded transition-colors"
              >
                Discard (:q!)
              </button>
            </div>
          </div>

          <textarea
            ref={editorTextareaRef}
            value={editorText}
            readOnly={editor.readOnly || (editor.mode === 'vim' && vimMode !== 'INSERT')}
            onChange={(e) => setEditorText(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full p-4 bg-[#0A0E14] text-slate-100 font-mono text-[13px] leading-relaxed resize-none focus:outline-none"
            aria-label="File editor content"
          />

          <div className="px-4 py-2 bg-[#141A24] border-t border-[#242E40] flex items-center justify-between gap-4 font-mono text-xs">
            {vimMode === 'COMMAND' ? (
              <form onSubmit={handleVimCommandSubmit} className="flex items-center gap-1 flex-1">
                <span className="text-amber-400">:</span>
                <input
                  ref={vimCommandRef}
                  type="text"
                  value={vimCmd}
                  onChange={(e) => setVimCmd(e.target.value)}
                  placeholder="wq, w, q, or q!"
                  className="flex-1 bg-transparent text-slate-100 focus:outline-none"
                />
              </form>
            ) : (
              <span className="text-slate-400">{vimMessage}</span>
            )}
            <span className="text-slate-500 shrink-0">
              {editorText.split('\n').length} lines
            </span>
          </div>
        </div>
      )}

      {/* Standard Terminal Output + Prompt */}
      {!manSession && !editor && (
        <>
          <div
            ref={scrollRef}
            onClick={() => inputRef.current?.focus()}
            className="flex-1 p-4 overflow-y-auto font-mono text-[13px] leading-[1.6] space-y-1.5 cursor-text"
          >
            {lines.map((line) => {
              if (line.type === 'input') {
                return (
                  <div key={line.id} className="flex items-start gap-2 break-all">
                    <span
                      className={`shrink-0 font-semibold ${
                        line.prompt?.includes('#') ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {line.prompt}
                    </span>
                    <span className="text-slate-100">{line.text}</span>
                  </div>
                );
              }
              if (line.type === 'error') {
                return (
                  <pre
                    key={line.id}
                    className="text-rose-400 whitespace-pre-wrap break-words font-mono"
                  >
                    {line.text}
                  </pre>
                );
              }
              if (line.type === 'info') {
                return (
                  <pre
                    key={line.id}
                    className="text-sky-300/90 whitespace-pre-wrap break-words font-mono"
                  >
                    {line.text}
                  </pre>
                );
              }
              return (
                <pre
                  key={line.id}
                  className="text-slate-300 whitespace-pre-wrap break-words font-mono"
                >
                  {line.text}
                </pre>
              );
            })}

            {/* Active Command Prompt Line */}
            <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-1">
              <label
                htmlFor="rhel-terminal-input"
                className={`shrink-0 font-semibold ${
                  vm.currentUser === 'root' ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {promptLabel}
              </label>
              <input
                id="rhel-terminal-input"
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (tabSuggestions.length > 0) setTabSuggestions([]);
                }}
                onKeyDown={handleKeyDown}
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Type a RHEL command (e.g., lab start ..., lsblk -f, man ls, help)..."
                className="flex-1 bg-transparent text-slate-100 placeholder:text-slate-600 focus:outline-none font-mono text-[13px]"
              />
            </form>
          </div>

          {/* Tab Autocomplete Suggestions */}
          {tabSuggestions.length > 0 && (
            <div className="px-4 py-2 bg-[#141A24] border-t border-[#242E40] flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono text-slate-400 mr-1">Completions:</span>
              {tabSuggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => applySuggestion(sug)}
                  className="px-2 py-0.5 text-xs font-mono text-sky-300 bg-[#1B2433] hover:bg-[#243045] rounded border border-[#2C3A52] transition-colors"
                >
                  {sug}
                </button>
              ))}
            </div>
          )}

          {/* Real-Time Terminal Feedback / Coach */}
          {feedback && (
            <div
              className={`px-4 py-2.5 border-t flex items-start gap-3 text-xs ${
                feedback.status === 'passed'
                  ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200'
                  : feedback.status === 'warning'
                  ? 'bg-amber-950/30 border-amber-800/50 text-amber-200'
                  : feedback.status === 'error'
                  ? 'bg-rose-950/30 border-rose-800/50 text-rose-200'
                  : 'bg-sky-950/30 border-sky-800/50 text-sky-200'
              }`}
            >
              {feedback.status === 'passed' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              {feedback.status === 'warning' && (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              {feedback.status === 'error' && (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              {feedback.status === 'tip' && (
                <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <div className="font-semibold">{feedback.title}</div>
                <div className="text-slate-300 mt-0.5 leading-relaxed">{feedback.detail}</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
