import React, { useState, useEffect, useRef } from 'react';
import {
  Briefcase,
  Plus,
  Trash2,
  CheckCircle2,
  Sparkles,
  BotMessageSquare,
  Building,
  MapPin,
  DollarSign,
  Award,
  Layers,
  ChevronRight,
  X,
  FileText,
  Upload,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { api } from '../services/api';
import { Skill, CareerProfile, Internship, UploadedDoc } from '../types';

function relativeTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

export const CareerView: React.FC = () => {
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [internships, setInternships] = useState<Internship[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals & form states
  const [isSkillModalOpen, setIsSkillModalOpen] = useState(false);
  const [isInternModalOpen, setIsInternModalOpen] = useState(false);

  const [skillName, setSkillName] = useState('');
  const [skillCategory, setSkillCategory] = useState<'technical' | 'soft' | 'domain' | 'tool'>('technical');
  const [skillProficiency, setSkillProficiency] = useState(85);

  const [internCompany, setInternCompany] = useState('');
  const [internRole, setInternRole] = useState('');
  const [internStatus, setInternStatus] = useState<Internship['status']>('applied');
  const [internLocation, setInternLocation] = useState('Remote / Cape Town');
  const [internStipend, setInternStipend] = useState('');
  const [internNotes, setInternNotes] = useState('');

  // AI Interview & Career Advice State
  const [adviceQuestion, setAdviceQuestion] = useState('What should I focus on to prepare for a technical interview in my field?');
  const [aiAdviceResponse, setAiAdviceResponse] = useState<string | null>(null);
  const [isGeneratingAdvice, setIsGeneratingAdvice] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);

  // CV tracking - the same uploaded document (document_type: 'cv') that
  // Job Search & Apply uses for CV-vs-job matching. It's surfaced here too
  // because the AI Career Coach below is grounded in it (see server.ts's
  // career-agent system prompt) - a student should be able to see, right
  // where the coaching happens, whether a CV is actually on file to ground
  // it, without having to go check the Job Search tab.
  const [cvDoc, setCvDoc] = useState<UploadedDoc | null>(null);
  const [cvLoading, setCvLoading] = useState(true);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const cvFileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      const [profData, skillsData, internData, docs] = await Promise.all([
        api.getCareerProfile(),
        api.getSkills(),
        api.getInternships(),
        api.getDocuments().catch(() => []),
      ]);
      setProfile(profData);
      setSkills(skillsData);
      setInternships(internData);
      setCvDoc(docs.find((d) => d.document_type === 'cv') || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setCvLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
      if (cvFileInputRef.current) cvFileInputRef.current.value = '';
    }
  };

  const handleAddSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName) return;
    await api.createSkill({
      name: skillName,
      category: skillCategory,
      proficiency_level: skillProficiency >= 90 ? 'expert' : skillProficiency >= 75 ? 'advanced' : 'intermediate',
      proficiency_percent: skillProficiency,
    });
    setSkillName('');
    setIsSkillModalOpen(false);
    loadData();
  };

  const handleDeleteSkill = async (id: string) => {
    await api.deleteSkill(id);
    loadData();
  };

  const handleAddInternship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!internCompany || !internRole) return;
    await api.createInternship({
      company_name: internCompany,
      role_title: internRole,
      status: internStatus,
      location: internLocation,
      salary_stipend: internStipend || undefined,
      notes: internNotes || undefined,
    });
    setInternCompany('');
    setInternRole('');
    setInternNotes('');
    setIsInternModalOpen(false);
    loadData();
  };

  const handleUpdateInternStatus = async (id: string, status: Internship['status']) => {
    await api.updateInternship(id, { status });
    loadData();
  };

  const handleDeleteInternship = async (id: string) => {
    await api.deleteInternship(id);
    loadData();
  };

  const handleGetAiAdvice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingAdvice(true);
    setAdviceError(null);
    try {
      // Use (or create) a real chat session rather than a hardcoded id -
      // 'sess-1' breaks permanently the moment that particular session is
      // deleted from the Chat tab.
      const existingSessions = await api.getChatSessions().catch(() => []);
      const session = existingSessions[0] || await api.createChatSession('Career Advice', 'career');
      const res = await api.sendChatMessage(session.id, adviceQuestion, 'career');
      setAiAdviceResponse(res.assistant_message.content);
    } catch (err: any) {
      console.error(err);
      setAdviceError(err?.message || 'Failed to get advice. Please try again.');
    } finally {
      setIsGeneratingAdvice(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Career Development & WIL Tracker</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Skills verification, job application pipelines, and AI-driven technical interview preparation
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            id="btn-add-skill"
            type="button"
            onClick={() => setIsSkillModalOpen(true)}
            className="px-3 py-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Skill</span>
          </button>
          <button
            id="btn-add-internship"
            type="button"
            onClick={() => setIsInternModalOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center space-x-1.5 transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Track Application</span>
          </button>
        </div>
      </div>

      {/* Profile & Target Roles Banner */}
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Target Job Profiles</span>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {profile?.target_roles.map((role, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium text-xs border border-indigo-100 dark:border-indigo-800/60"
                >
                  {role}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-6 text-xs text-slate-500 dark:text-slate-400">
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Target Range</span>
              <span className="font-mono text-slate-900 dark:text-white font-bold">
                {profile?.target_salary_range || <span className="text-slate-400 italic font-sans font-normal">Not set</span>}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Active Applications</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                {internships.filter((i) => ['applied', 'interviewing', 'offered'].includes(i.status)).length} / {internships.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Skills Matrix & Internships Kanban */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Skills Inventory */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Verified Skills Matrix</span>
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{skills.length} Skills</span>
            </div>

            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800"
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-900 dark:text-white">{skill.name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 uppercase font-mono font-semibold">
                        {skill.category}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-slate-700 dark:text-slate-300 font-bold">{skill.proficiency_percent}%</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteSkill(skill.id)}
                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full ${
                        skill.proficiency_percent >= 90
                          ? 'bg-indigo-600 dark:bg-indigo-500'
                          : skill.proficiency_percent >= 80
                          ? 'bg-blue-600 dark:bg-blue-500'
                          : 'bg-slate-600 dark:bg-slate-400'
                      }`}
                      style={{ width: `${skill.proficiency_percent}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Internships Tracker & AI Career Coach */}
        <div className="lg:col-span-7 space-y-6">
          {/* Applications Table */}
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Internship & WIL Application Tracker</span>
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{internships.length} Active</span>
            </div>

            <div className="space-y-3">
              {internships.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">{item.company_name}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-700 dark:text-slate-300 text-xs font-medium">{item.role_title}</span>
                    </div>

                    <div className="flex items-center space-x-4 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {item.location}
                      </span>
                      {item.salary_stipend && (
                        <span className="flex items-center gap-1 font-mono text-slate-700 dark:text-slate-300">
                          <DollarSign className="w-3 h-3" /> {item.salary_stipend}
                        </span>
                      )}
                    </div>

                    {item.notes && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 italic mt-1">
                        "{item.notes}"
                      </p>
                    )}

                    {(item.application_url || item.cover_letter) && (
                      <div className="flex items-center gap-3 text-[11px] pt-0.5">
                        {item.application_url && (
                          <a
                            href={item.application_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            View original posting ↗
                          </a>
                        )}
                        {item.cover_letter && (
                          <span className="text-slate-500 dark:text-slate-400">Cover letter saved</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 self-end sm:self-center shrink-0">
                    <select
                      value={item.status}
                      onChange={(e) => handleUpdateInternStatus(item.id, e.target.value as any)}
                      className="text-[11px] font-mono rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2 py-1 text-slate-800 dark:text-slate-200 outline-none"
                    >
                      <option value="wishlist">Wishlist</option>
                      <option value="applied">Applied</option>
                      <option value="interviewing">Interviewing</option>
                      <option value="offered">Offered</option>
                      <option value="accepted">Accepted</option>
                      <option value="rejected">Rejected</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleDeleteInternship(item.id)}
                      className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                      title="Delete application"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Career Coach & Interview Assistant */}
          <div className="p-5 rounded-xl bg-slate-900 dark:bg-slate-900/90 text-white border border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold">AI Technical Interview & Career Coach</h4>
                <p className="text-[11px] text-slate-400">
                  Grounded in your real modules, skills, projects, and the CV on file below - never generic advice about a student it doesn't actually know.
                </p>
              </div>
            </div>

            {/* CV tracking - same document Job Search & Apply uses */}
            <div className="p-3 rounded-lg bg-slate-800 border border-slate-700">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-lg bg-slate-700 text-slate-300 shrink-0">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    {cvLoading ? (
                      <p className="text-[11px] text-slate-400">Checking for a CV on file...</p>
                    ) : cvDoc ? (
                      <>
                        <p className="text-xs font-medium text-white truncate">{cvDoc.original_name}</p>
                        <p className="text-[10px] text-slate-400">On file{cvDoc.created_at ? ` · uploaded ${relativeTime(cvDoc.created_at)}` : ''} · used to ground the coach below</p>
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-400">No CV on file yet - upload one so the coach below can give CV-specific advice instead of generic tips</p>
                    )}
                  </div>
                </div>
                <div>
                  <input
                    ref={cvFileInputRef}
                    id="career-cv-upload-input"
                    type="file"
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleCvUpload(e.target.files[0])}
                  />
                  <button
                    type="button"
                    onClick={() => cvFileInputRef.current?.click()}
                    disabled={cvUploading}
                    className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {cvUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    <span>{cvDoc ? 'Replace CV' : 'Upload CV'}</span>
                  </button>
                </div>
              </div>
              {cvError && (
                <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-amber-950/60 border border-amber-800/60 text-amber-400 text-[11px] mt-2.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{cvError}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleGetAiAdvice} className="flex gap-2">
              <input
                type="text"
                value={adviceQuestion}
                onChange={(e) => setAdviceQuestion(e.target.value)}
                placeholder="Ask about mock interview questions, CV bullet points..."
                className="flex-1 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={isGeneratingAdvice}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition cursor-pointer disabled:opacity-50"
              >
                {isGeneratingAdvice ? 'Analyzing...' : 'Get Advice'}
              </button>
            </form>

            {adviceError && (
              <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-400 text-xs">
                {adviceError}
              </div>
            )}

            {aiAdviceResponse && (
              <div className="p-4 rounded-xl bg-slate-800 border border-slate-700 text-xs leading-relaxed space-y-2 max-h-60 overflow-y-auto">
                <div className="text-indigo-400 font-semibold text-[11px] flex items-center gap-1.5">
                  <BotMessageSquare className="w-3.5 h-3.5" /> Career Agent Response
                </div>
                <div className="text-slate-200 whitespace-pre-wrap font-sans">
                  {aiAdviceResponse}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Skill Modal */}
      {isSkillModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl relative text-slate-900 dark:text-white">
            <button
              type="button"
              onClick={() => setIsSkillModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">Add Skill to Matrix</h3>

            <form onSubmit={handleAddSkill} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Skill Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PyTorch / CUDA"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Category</label>
                <select
                  value={skillCategory}
                  onChange={(e) => setSkillCategory(e.target.value as any)}
                  className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2.5 py-2 text-slate-900 dark:text-white outline-none"
                >
                  <option value="technical">Technical</option>
                  <option value="domain">Domain / Theory</option>
                  <option value="tool">Tool / DevOps</option>
                  <option value="soft">Soft / Communication</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between font-medium mb-1">
                  <label className="text-slate-700 dark:text-slate-300">Proficiency Level: {skillProficiency}%</label>
                </div>
                <input
                  type="range"
                  min="40"
                  max="100"
                  value={skillProficiency}
                  onChange={(e) => setSkillProficiency(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSkillModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-xs cursor-pointer"
                >
                  Add Skill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Internship Modal */}
      {isInternModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl relative text-slate-900 dark:text-white">
            <button
              type="button"
              onClick={() => setIsInternModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">Track Internship / WIL Opportunity</h3>

            <form onSubmit={handleAddInternship} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Company Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ByteDance / TikTok"
                    value={internCompany}
                    onChange={(e) => setInternCompany(e.target.value)}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Role Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AI Platform Intern"
                    value={internRole}
                    onChange={(e) => setInternRole(e.target.value)}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Status</label>
                  <select
                    value={internStatus}
                    onChange={(e) => setInternStatus(e.target.value as any)}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2.5 py-2 text-slate-900 dark:text-white outline-none"
                  >
                    <option value="wishlist">Wishlist</option>
                    <option value="applied">Applied</option>
                    <option value="interviewing">Interviewing</option>
                    <option value="offered">Offered</option>
                    <option value="accepted">Accepted</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Location / Modality</label>
                  <input
                    type="text"
                    value={internLocation}
                    onChange={(e) => setInternLocation(e.target.value)}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Salary / Stipend (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. £4,000 / mo or R35,000 / mo"
                  value={internStipend}
                  onChange={(e) => setInternStipend(e.target.value)}
                  className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Interview Notes / Next Rounds</label>
                <textarea
                  rows={2}
                  placeholder="Technical Round 1 passed. Preparing for System Design and Concurrency round..."
                  value={internNotes}
                  onChange={(e) => setInternNotes(e.target.value)}
                  className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsInternModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-xs cursor-pointer"
                >
                  Save Opportunity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
