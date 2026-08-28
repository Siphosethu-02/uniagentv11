import React, { useState, useEffect } from 'react';
import {
  Award,
  TrendingUp,
  BookOpen,
  FolderGit2,
  Sparkles,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Briefcase,
  BotMessageSquare,
  FileSpreadsheet,
  ChevronRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { AcademicStats, Project, Module, Internship } from '../types';
import { NavTab } from './Navigation';

interface DashboardViewProps {
  onNavigate: (tab: NavTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { user, student } = useAuth();
  const [stats, setStats] = useState<AcademicStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [internships, setInternships] = useState<Internship[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [statsData, projectsData, modulesData, internData] = await Promise.all([
          api.getAcademicStats().catch(() => null),
          api.getProjects().catch(() => []),
          api.getModules().catch(() => []),
          api.getInternships().catch(() => []),
        ]);
        if (statsData) setStats(statsData);
        setProjects(projectsData);
        setModules(modulesData);
        setInternships(internData);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, []);

  const gpa = stats?.gpa ?? student?.gpa ?? 0;
  const targetGpa = stats?.target_gpa ?? student?.target_gpa ?? 4.0;
  const creditsEarned = stats?.credits_earned ?? student?.credits_earned ?? 0;
  const creditsRequired = stats?.credits_required ?? student?.credits_required ?? 360;
  const creditPercent = creditsRequired ? Math.round((creditsEarned / creditsRequired) * 100) : 0;

  // Real per-semester trend only - no sample/fake history is shown when a
  // fresh account has no completed modules yet.
  const trendData = stats?.trends || [];

  const applicationsInProgress = internships.filter(i => i.status === 'interviewing' || i.status === 'offered').length;

  // Recommendations below are computed from this account's actual data, not
  // canned copy shown to every account regardless of what's really in it.
  const belowTargetModules = modules.filter(m => m.status === 'completed' && m.final_mark != null && m.target_mark != null && m.final_mark < m.target_mark);
  const inProgressModules = modules.filter(m => m.status === 'in_progress');
  const academicInsight = belowTargetModules.length
    ? `${belowTargetModules.length} completed module${belowTargetModules.length === 1 ? '' : 's'} finished below its target mark: ${belowTargetModules.map(m => m.code || m.name).join(', ')}.`
    : inProgressModules.length
      ? `${inProgressModules.length} module${inProgressModules.length === 1 ? ' is' : 's are'} in progress. Stay at or above your target mark to protect your GPA goal.`
      : 'Add your modules in the Academic tab to get real academic insights here.';

  const careerInsight = applicationsInProgress > 0
    ? `${applicationsInProgress} application${applicationsInProgress === 1 ? ' is' : 's are'} in interview or offer stage - good time to prepare.`
    : internships.length > 0
      ? `${internships.length} application${internships.length === 1 ? '' : 's'} tracked, none in interview stage yet.`
      : 'Add internship applications in the Career tab to track your progress here.';

  const projectsWithoutTests = projects.filter(p => p.code_metrics && !p.code_metrics.has_tests);
  const projectInsight = projects.length === 0
    ? 'Add a project in the Projects tab to get a real code scan and CV bullet suggestions.'
    : projectsWithoutTests.length > 0
      ? `${projectsWithoutTests.length} of ${projects.length} scanned project${projects.length === 1 ? '' : 's'} had no test files detected.`
      : 'All scanned projects include detected test files.';

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 text-white relative overflow-hidden shadow-sm">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-medium border border-indigo-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> UNiAGENT Dashboard
              </span>
              <span className="text-slate-500 text-xs">•</span>
              <span className="text-slate-400 text-xs font-mono">{student?.student_number || 'No Student ID set'}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Welcome back, {user?.full_name || 'Student'}
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              {student?.degree || 'Add your degree in Settings'} • {student?.university || 'Add your university'} • Year {student?.year_of_study || 1}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              id="btn-quick-chat"
              type="button"
              onClick={() => onNavigate('chat')}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs flex items-center space-x-2 transition shadow-xs cursor-pointer"
            >
              <BotMessageSquare className="w-4 h-4" />
              <span>Ask AI Agent</span>
            </button>
            <button
              id="btn-quick-scan"
              type="button"
              onClick={() => onNavigate('projects')}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs flex items-center space-x-2 transition cursor-pointer"
            >
              <FolderGit2 className="w-4 h-4" />
              <span>Scan a Project</span>
            </button>
            <button
              id="btn-quick-report"
              type="button"
              onClick={() => onNavigate('reports')}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs flex items-center space-x-2 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Generate Dossier</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* GPA Metric */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Cumulative GPA</span>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{gpa.toFixed(2)}</span>
            <span className="text-xs text-slate-400 font-mono">/ {targetGpa.toFixed(2)} Target</span>
          </div>
          <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${(gpa / targetGpa) * 100}%` }}
            ></div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            {(stats?.completed_modules ?? 0) === 0
              ? 'No completed modules yet'
              : gpa >= targetGpa
                ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">On track for target GPA</span>
                : <span className="text-amber-600 dark:text-amber-400 font-medium">{(targetGpa - gpa).toFixed(2)} below target GPA</span>}
          </p>
        </div>

        {/* Distinction Rate */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Distinction Rate</span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/50">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
              {stats?.distinction_rate_percent ?? 0}%
            </span>
            <span className="text-xs text-slate-400">
              ({stats?.distinctions ?? 0} of {stats?.completed_modules ?? 0} Modules)
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${stats?.distinction_rate_percent ?? 0}%` }}
            ></div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            Average module score: <strong className="text-slate-800 dark:text-slate-200 font-mono">{stats?.average_mark ?? '—'}{stats?.average_mark != null ? '%' : ''}</strong>
          </p>
        </div>

        {/* Degree Progress */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Degree Credits</span>
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/50">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{creditsEarned}</span>
            <span className="text-xs text-slate-400 font-mono">/ {creditsRequired} NQF Credits</span>
          </div>
          <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${creditPercent}%` }}
            ></div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 flex justify-between">
            <span>{creditPercent}% Complete</span>
            <span>{creditsRequired - creditsEarned} Remaining</span>
          </p>
        </div>

        {/* Career Activity */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Career Activity</span>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-800/50">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{internships.length}</span>
            <span className="text-xs text-slate-400">Tracked Application{internships.length === 1 ? '' : 's'}</span>
          </div>
          <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${internships.length ? Math.round((applicationsInProgress / internships.length) * 100) : 0}%` }}></div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            {applicationsInProgress} in interview/offer stage
          </p>
        </div>
      </div>

      {/* Charts & AI Recommendations Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Academic Performance Trend Chart */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Academic Semester Trends</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Historical weighted averages and credit progression</p>
              </div>
              <button
                id="btn-view-all-academic"
                type="button"
                onClick={() => onNavigate('academic')}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 font-medium cursor-pointer"
              >
                View Modules <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="h-64 w-full">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="markGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis dataKey="semester" stroke="#94a3b8" fontSize={11} />
                    <YAxis domain={[60, 100]} stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                      formatter={(value: any) => [`${value}%`, 'Average Mark']}
                    />
                    <Area type="monotone" dataKey="average" stroke="#4f46e5" strokeWidth={2.5} fillOpacity={1} fill="url(#markGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-center text-xs text-slate-400 dark:text-slate-500 px-6">
                  Complete a module with a final mark to see your semester trend here.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-4 mt-2 border-t border-slate-100 dark:border-slate-800 text-center">
            <div>
              <div className="text-xs text-slate-400">Total Modules</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white font-mono">{modules.length}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">In Progress</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white font-mono">{modules.filter(m => m.status === 'in_progress').length}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Target GPA</div>
              <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 font-mono">{targetGpa.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* AI Action Plan & Autonomous Insights */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <div className="p-1.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                <Sparkles className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Recommendations</h3>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Academic</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {academicInsight}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">
                  <Briefcase className="w-3.5 h-3.5 shrink-0" />
                  <span>Career</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {careerInsight}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400 mb-1">
                  <FolderGit2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Projects</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {projectInsight}
                </p>
              </div>
            </div>
          </div>

          <button
            id="btn-dash-interact-agent"
            type="button"
            onClick={() => onNavigate('chat')}
            className="mt-4 w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition flex items-center justify-center space-x-2 cursor-pointer shadow-xs"
          >
            <span>Ask the Assistant</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Featured Projects & RAG Knowledge Quick View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Flagship Projects */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Recent Projects</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">File-extension and keyword scan of submitted code</p>
            </div>
            <button
              id="btn-view-all-projects"
              type="button"
              onClick={() => onNavigate('projects')}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 font-medium cursor-pointer"
            >
              Analyze New <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {projects.slice(0, 2).map((proj) => (
              <div
                key={proj.id}
                className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 transition"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{proj.title}</h4>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-medium shrink-0 border border-indigo-100 dark:border-indigo-800/60">
                    {proj.project_type}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mb-3">
                  {proj.description}
                </p>

                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {proj.technologies?.slice(0, 5).map((tech, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono"
                    >
                      {tech}
                    </span>
                  ))}
                  {(proj.technologies?.length || 0) > 5 && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      +{(proj.technologies?.length || 0) - 5} more
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                  <span>Lines of code: <strong className="font-mono text-slate-800 dark:text-slate-200">{proj.code_metrics?.total_lines_of_code ?? 0}</strong></span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Scanned</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Internships & WIL tracker */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Internship & WIL Tracker</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Industry applications and technical interview status</p>
            </div>
            <button
              id="btn-view-all-career"
              type="button"
              onClick={() => onNavigate('career')}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 font-medium cursor-pointer"
            >
              Career Hub <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {internships.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{item.company_name}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600 dark:text-slate-300 font-normal">{item.role_title}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-sm">
                    {item.notes || item.location}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium font-mono uppercase ${
                      item.status === 'offered'
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                        : item.status === 'interviewing'
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {item.status}
                  </span>
                  {item.salary_stipend && (
                    <div className="text-[10px] text-slate-400 font-mono mt-1">{item.salary_stipend}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
