import React, { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertCircle,
  History,
  Sparkles,
  FileText,
  BookOpen
} from 'lucide-react';
import { api } from '../services/api';
import { Module, Quiz, QuizAttempt } from '../types';

type ViewMode = 'setup' | 'taking' | 'result';

export const QuizzesView: React.FC = () => {
  const [modules, setModules] = useState<Module[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [topic, setTopic] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [generateNotice, setGenerateNotice] = useState<{ tone: 'info' | 'warning'; text: string } | null>(null);

  const [view, setView] = useState<ViewMode>('setup');
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizAttempt | null>(null);

  const loadData = async () => {
    try {
      const [mods, pastAttempts] = await Promise.all([
        api.getModules(),
        api.getQuizAttempts(),
      ]);
      setModules(mods);
      setAttempts(pastAttempts);
      if (mods.length && !selectedModuleId) setSelectedModuleId(mods[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModuleId || !topic.trim()) return;
    setGenerating(true);
    setGenerateNotice(null);
    try {
      const res = await api.generateQuiz(selectedModuleId, topic.trim(), questionCount);
      if (!res.quiz) {
        setGenerateNotice({ tone: res.ai_configured ? 'warning' : 'info', text: res.message });
        return;
      }
      setActiveQuiz(res.quiz);
      setAnswers({});
      setResult(null);
      setView('taking');
      if (res.message) setGenerateNotice({ tone: 'info', text: res.message });
    } catch (err: any) {
      setGenerateNotice({ tone: 'warning', text: err.message || 'Could not generate a quiz right now.' });
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!activeQuiz) return;
    setSubmitting(true);
    try {
      const payload = activeQuiz.questions.map((q) => ({
        question_id: q.id,
        selected_index: answers[q.id],
      })).filter((a) => typeof a.selected_index === 'number');
      const graded = await api.submitQuiz(activeQuiz.id, payload);
      setResult(graded);
      setView('result');
      const pastAttempts = await api.getQuizAttempts();
      setAttempts(pastAttempts);
    } catch (err: any) {
      setGenerateNotice({ tone: 'warning', text: err.message || 'Could not submit the quiz.' });
    } finally {
      setSubmitting(false);
    }
  };

  const resetToSetup = () => {
    setView('setup');
    setActiveQuiz(null);
    setAnswers({});
    setResult(null);
    setGenerateNotice(null);
    setTopic('');
  };

  const viewPastAttempt = (attempt: QuizAttempt) => {
    setResult(attempt);
    setActiveQuiz(null);
    setView('result');
  };

  const allAnswered = activeQuiz ? activeQuiz.questions.every((q) => typeof answers[q.id] === 'number') : false;

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Quiz Prep</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Pick a module and a topic to generate a short multiple-choice quiz for test prep. Questions are grounded in your uploaded course documents when there's a match, otherwise written from general subject knowledge.
        </p>
      </div>

      {modules.length === 0 ? (
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-center space-y-2">
          <BookOpen className="w-6 h-6 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-900 dark:text-white">No modules yet</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Add a course module in the Academic tab first, then come back here to generate a quiz for one of its topics.
          </p>
        </div>
      ) : (
        <>
          {view === 'setup' && (
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                  <ClipboardCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Generate a Quiz</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Choose a module and tell us what topic to focus on</p>
                </div>
              </div>

              <form onSubmit={handleGenerate} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Module *</label>
                    <select
                      id="quiz-module-select"
                      required
                      value={selectedModuleId}
                      onChange={(e) => setSelectedModuleId(e.target.value)}
                      className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {modules.map((m) => (
                        <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1"># of Questions</label>
                    <select
                      value={questionCount}
                      onChange={(e) => setQuestionCount(Number(e.target.value))}
                      className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value={3}>3 (quick check)</option>
                      <option value={5}>5</option>
                      <option value={10}>10 (full review)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Topic *</label>
                  <input
                    id="quiz-topic-input"
                    type="text"
                    required
                    placeholder="e.g. Linked Lists, Photosynthesis, Contract Law basics..."
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {generateNotice && (
                  <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs border ${
                    generateNotice.tone === 'warning'
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400'
                      : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-400'
                  }`}>
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{generateNotice.text}</span>
                  </div>
                )}

                <button
                  id="btn-generate-quiz"
                  type="submit"
                  disabled={generating || !topic.trim()}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-40 cursor-pointer shadow-xs"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating quiz...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Generate Quiz</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {view === 'taking' && activeQuiz && (
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{activeQuiz.module_code}: {activeQuiz.topic}</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                    {activeQuiz.source === 'documents' ? (
                      <><FileText className="w-3 h-3" /> Grounded in your uploaded course documents</>
                    ) : (
                      <><Sparkles className="w-3 h-3" /> Generated from general topic knowledge (no matching documents found)</>
                    )}
                  </p>
                </div>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {Object.keys(answers).length} / {activeQuiz.questions.length} answered
                </span>
              </div>

              <div className="space-y-4">
                {activeQuiz.questions.map((q, qi) => (
                  <div key={q.id} className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                    <p className="text-xs font-medium text-slate-900 dark:text-white mb-2.5">
                      {qi + 1}. {q.question}
                    </p>
                    <div className="space-y-1.5">
                      {q.options.map((opt, oi) => (
                        <label
                          key={oi}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition ${
                            answers[q.id] === oi
                              ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-200'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-200 dark:hover:border-indigo-800'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            checked={answers[q.id] === oi}
                            onChange={() => setAnswers({ ...answers, [q.id]: oi })}
                            className="accent-indigo-600 cursor-pointer"
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={resetToSetup}
                  className="px-3.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-quiz"
                  type="button"
                  onClick={handleSubmitQuiz}
                  disabled={!allAnswered || submitting}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-40 cursor-pointer shadow-xs"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{allAnswered ? 'Submit Quiz' : `Answer all ${activeQuiz.questions.length} to submit`}</span>
                </button>
              </div>
            </div>
          )}

          {view === 'result' && result && (
            <div className="space-y-4">
              <div className="p-5 rounded-xl bg-slate-900 text-white border border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">{result.module_code} · {result.topic}</p>
                  <div className="text-2xl font-bold font-mono mt-1">
                    {result.score} / {result.total} <span className="text-base text-slate-400">({result.percentage}%)</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetToSetup}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>New Quiz</span>
                </button>
              </div>

              <div className="space-y-3">
                {result.results.map((r, i) => (
                  <div
                    key={r.question_id}
                    className={`p-4 rounded-lg border text-xs ${
                      r.correct
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                        : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60'
                    }`}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      {r.correct ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                      )}
                      <p className="font-medium text-slate-900 dark:text-white">{i + 1}. {r.question}</p>
                    </div>
                    <div className="pl-6 space-y-1">
                      {r.options.map((opt, oi) => (
                        <div
                          key={oi}
                          className={`px-2.5 py-1.5 rounded ${
                            oi === r.correct_index
                              ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 font-medium'
                              : oi === r.selected_index
                              ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-300 line-through'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {opt}
                        </div>
                      ))}
                      {r.selected_index === null && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">Not answered</p>
                      )}
                      {r.explanation && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 pt-1 italic">{r.explanation}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Attempt history / prep progress */}
      {view === 'setup' && attempts.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Recent Attempts</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Your quiz prep history for this account</p>
            </div>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {attempts.slice(0, 8).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => viewPastAttempt(a)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 transition text-left cursor-pointer"
              >
                <div>
                  <div className="font-medium text-slate-900 dark:text-white">{a.module_code}: {a.topic}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{new Date(a.taken_at).toLocaleString()}</div>
                </div>
                <span className={`font-mono font-semibold px-2 py-0.5 rounded ${
                  a.percentage >= 70
                    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                    : 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'
                }`}>
                  {a.score}/{a.total} ({a.percentage}%)
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
