import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  MapPin,
  Wifi,
  Loader2,
  ExternalLink,
  Wand2,
  CheckCircle2,
  AlertCircle,
  BookmarkPlus,
  Clock,
  X,
  FileText,
  Upload,
  ScanSearch,
  XCircle,
  MinusCircle
} from 'lucide-react';
import { api } from '../services/api';
import { JobListing, UploadedDoc, CvMatchResult } from '../types';

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

interface DraftState {
  loading: boolean;
  text: string | null;
  error: string | null;
}

interface MatchState {
  loading: boolean;
  result: CvMatchResult | null;
  error: string | null;
}

export const JobSearchView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<JobListing[] | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');

  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  const [cvDoc, setCvDoc] = useState<UploadedDoc | null>(null);
  const [cvLoading, setCvLoading] = useState(true);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [matches, setMatches] = useState<Record<string, MatchState>>({});
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);

  const loadCv = async () => {
    try {
      const docs = await api.getDocuments();
      const cv = docs.find((d) => d.document_type === 'cv') || null;
      setCvDoc(cv);
    } catch (e) {
      console.error(e);
    } finally {
      setCvLoading(false);
    }
  };

  useEffect(() => {
    loadCv();
  }, []);

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSearching(true);
    setSearchError(null);
    try {
      const res = await api.searchJobs(query.trim(), remoteOnly);
      setResults(res.results);
      setSourceLabel(res.source);
    } catch (err: any) {
      setSearchError(err.message || 'Could not reach the live jobs listing service right now. Try again in a moment.');
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const handleCvUpload = async (file: File) => {
    setCvUploading(true);
    setCvError(null);
    try {
      const doc = await api.uploadDocumentFile(file, 'cv');
      setCvDoc(doc);
    } catch (err: any) {
      setCvError(err.message || 'Could not read that file.');
    } finally {
      setCvUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDraft = async (job: JobListing) => {
    setDrafts((d) => ({ ...d, [job.id]: { loading: true, text: null, error: null } }));
    setExpandedDraftId(job.id);
    try {
      const res = await api.draftCoverLetter({ title: job.title, company: job.company, location: job.location, description: job.description });
      if (!res.cover_letter) {
        setDrafts((d) => ({ ...d, [job.id]: { loading: false, text: null, error: res.message } }));
      } else {
        setDrafts((d) => ({ ...d, [job.id]: { loading: false, text: res.cover_letter, error: null } }));
      }
    } catch (err: any) {
      setDrafts((d) => ({ ...d, [job.id]: { loading: false, text: null, error: err.message || 'Could not draft a cover letter right now.' } }));
    }
  };

  const handleMatch = async (job: JobListing) => {
    if (!cvDoc) return;
    setMatches((m) => ({ ...m, [job.id]: { loading: true, result: null, error: null } }));
    setExpandedMatchId(job.id);
    try {
      const res = await api.matchCv(cvDoc.id, { title: job.title, company: job.company, description: job.description });
      if (!res.result) {
        setMatches((m) => ({ ...m, [job.id]: { loading: false, result: null, error: res.message } }));
      } else {
        setMatches((m) => ({ ...m, [job.id]: { loading: false, result: res.result, error: null } }));
      }
    } catch (err: any) {
      setMatches((m) => ({ ...m, [job.id]: { loading: false, result: null, error: err.message || 'Could not analyze your CV against this job right now.' } }));
    }
  };

  const handleSave = async (job: JobListing, withDraft: boolean) => {
    setSavingId(job.id);
    try {
      const draftText = drafts[job.id]?.text || undefined;
      await api.createInternship({
        company_name: job.company,
        role_title: job.title,
        status: withDraft && draftText ? 'applied' : 'wishlist',
        location: job.location,
        application_url: job.url,
        cover_letter: draftText,
        source: 'job_search',
        notes: `Saved from job search${job.remote ? ' (remote)' : ''}.`,
      });
      setSavedIds((s) => new Set(s).add(job.id));
    } catch (err: any) {
      console.error(err);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Job Search & Apply</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Real, currently open South African postings — never invented listings. Upload your CV to see how it matches a role, draft an AI cover letter grounded in your actual profile, then apply on the real employer site and track it here.
        </p>
      </div>

      {/* CV upload panel */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Your CV</h3>
              {cvLoading ? (
                <p className="text-[11px] text-slate-400">Checking...</p>
              ) : cvDoc ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{cvDoc.original_name} — ready to match against job descriptions</p>
              ) : (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Upload a PDF, DOCX, or TXT of your real CV to unlock "Match My CV" on any job below</p>
              )}
            </div>
          </div>
          <div>
            <input
              ref={fileInputRef}
              id="cv-upload-input"
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleCvUpload(e.target.files[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={cvUploading}
              className="px-3.5 py-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {cvUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              <span>{cvDoc ? 'Replace CV' : 'Upload CV'}</span>
            </button>
          </div>
        </div>
        {cvError && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 text-xs mt-3">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{cvError}</span>
          </div>
        )}
      </div>

      <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <form onSubmit={runSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="job-search-input"
              type="text"
              placeholder="e.g. software engineer, marketing intern, data analyst..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 pl-9 pr-3 py-2.5 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 shrink-0 px-1 cursor-pointer">
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={(e) => setRemoteOnly(e.target.checked)}
              className="accent-indigo-600 cursor-pointer"
            />
            <Wifi className="w-3.5 h-3.5" /> Remote only
          </label>
          <button
            id="btn-search-jobs"
            type="submit"
            disabled={searching}
            className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-40 cursor-pointer shadow-xs shrink-0"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>Search</span>
          </button>
        </form>
        {sourceLabel && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2.5">Source: {sourceLabel}</p>
        )}
      </div>

      {searchError && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 text-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{searchError}</span>
        </div>
      )}

      {results !== null && results.length === 0 && !searchError && (
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-center text-xs text-slate-500 dark:text-slate-400">
          No open roles matched that search right now. Try a broader keyword, or turn off "Remote only".
        </div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-3">
          {results.map((job) => {
            const draft = drafts[job.id];
            const isDraftExpanded = expandedDraftId === job.id;
            const match = matches[job.id];
            const isMatchExpanded = expandedMatchId === job.id;
            const isSaved = savedIds.has(job.id);
            return (
              <div key={job.id} className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{job.title}</h3>
                      {job.remote && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-medium flex items-center gap-1">
                          <Wifi className="w-2.5 h-2.5" /> Remote
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{job.company}</span>
                      {job.location && (
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {job.location}</span>
                      )}
                      {job.posted_at && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {relativeTime(job.posted_at)}</span>
                      )}
                    </div>
                    {job.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {job.tags.slice(0, 6).map((t) => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">
                      {job.description}
                    </p>
                  </div>

                  <div className="flex sm:flex-col items-stretch gap-1.5 shrink-0 w-full sm:w-auto">
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-medium flex items-center justify-center gap-1.5 transition shadow-xs whitespace-nowrap"
                    >
                      <ExternalLink className="w-3 h-3" /> View & Apply
                    </a>
                    <button
                      type="button"
                      onClick={() => handleMatch(job)}
                      disabled={!cvDoc}
                      title={!cvDoc ? 'Upload your CV above first' : undefined}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ScanSearch className="w-3 h-3" /> Match My CV
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDraft(job)}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                    >
                      <Wand2 className="w-3 h-3" /> Draft Cover Letter
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSave(job, false)}
                      disabled={isSaved || savingId === job.id}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      {isSaved ? (
                        <><CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Saved</>
                      ) : savingId === job.id ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</>
                      ) : (
                        <><BookmarkPlus className="w-3 h-3" /> Save to Tracker</>
                      )}
                    </button>
                  </div>
                </div>

                {isMatchExpanded && match && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                    {match.loading && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Comparing your CV against this job description...
                      </div>
                    )}
                    {match.error && (
                      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 text-xs">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>{match.error}</span>
                      </div>
                    )}
                    {match.result && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">CV Match Analysis</span>
                          <button
                            type="button"
                            onClick={() => setExpandedMatchId(null)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{match.result.match_summary}</p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 flex items-center gap-1 mb-1.5">
                              <CheckCircle2 className="w-3 h-3" /> Strengths
                            </span>
                            <ul className="space-y-1">
                              {match.result.strengths.map((s, i) => (
                                <li key={i} className="text-[11px] text-slate-700 dark:text-slate-300">• {s}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-400 flex items-center gap-1 mb-1.5">
                              <XCircle className="w-3 h-3" /> Gaps
                            </span>
                            <ul className="space-y-1">
                              {match.result.gaps.map((g, i) => (
                                <li key={i} className="text-[11px] text-slate-700 dark:text-slate-300">• {g}</li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {match.result.missing_keywords.length > 0 && (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1.5">
                              <MinusCircle className="w-3 h-3" /> Missing Keywords
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {match.result.missing_keywords.map((k, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                  {k}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 flex items-center gap-1 mb-1.5">
                            <Wand2 className="w-3 h-3" /> Suggested Edits for Your CV
                          </span>
                          <ul className="space-y-1.5">
                            {match.result.suggested_edits.map((s, i) => (
                              <li key={i} className="text-[11px] text-slate-700 dark:text-slate-300 pl-3 border-l-2 border-indigo-200 dark:border-indigo-800">{s}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {isDraftExpanded && draft && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                    {draft.loading && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Drafting a cover letter from your profile...
                      </div>
                    )}
                    {draft.error && (
                      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 text-xs">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>{draft.error}</span>
                      </div>
                    )}
                    {draft.text && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Draft Cover Letter (editable)</span>
                          <button
                            type="button"
                            onClick={() => setExpandedDraftId(null)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <textarea
                          rows={10}
                          value={draft.text}
                          onChange={(e) => setDrafts((d) => ({ ...d, [job.id]: { ...d[job.id], text: e.target.value } }))}
                          className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2.5 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed"
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleSave(job, true)}
                            disabled={isSaved || savingId === job.id}
                            className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Save to Tracker with this Letter (marks as Applied)</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
