import React from 'react';
import {
  GraduationCap,
  LayoutDashboard,
  BookOpen,
  FolderGit2,
  FileText,
  Briefcase,
  BotMessageSquare,
  FileSpreadsheet,
  ShieldCheck,
  Settings,
  Sparkles,
  LogOut,
  UserCheck,
  ClipboardCheck,
  Search
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type NavTab =
  | 'dashboard'
  | 'academic'
  | 'projects'
  | 'documents'
  | 'quizzes'
  | 'career'
  | 'jobs'
  | 'chat'
  | 'reports'
  | 'settings';

interface NavigationProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onOpenAuth: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onTabChange,
  onOpenAuth,
}) => {
  const { user, student, logout } = useAuth();

  const isAdmin = user?.role === 'admin';

  // The "dashboard" tab renders a genuinely different page depending on
  // role (see App.tsx) - an admin's landing page is platform telemetry and
  // user management, not a personal academic dashboard that would just be
  // full of empty states for an account that isn't really a student. The
  // nav entry reflects that instead of showing a generic label for both.
  const navItems: { id: NavTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'dashboard',
      label: isAdmin ? 'Admin Dashboard' : 'Executive Overview',
      icon: isAdmin ? <ShieldCheck className="w-4 h-4" /> : <LayoutDashboard className="w-4 h-4" />,
    },
    { id: 'academic', label: 'Academic & GPA', icon: <BookOpen className="w-4 h-4" />, badge: student ? `${student.gpa} GPA` : undefined },
    { id: 'projects', label: 'Project Code Scanner', icon: <FolderGit2 className="w-4 h-4" /> },
    { id: 'documents', label: 'Course Document Hub', icon: <FileText className="w-4 h-4" /> },
    { id: 'quizzes', label: 'Quiz Prep', icon: <ClipboardCheck className="w-4 h-4" /> },
    { id: 'career', label: 'Career & Internships', icon: <Briefcase className="w-4 h-4" /> },
    { id: 'jobs', label: 'Job Search & Apply', icon: <Search className="w-4 h-4" /> },
    { id: 'chat', label: 'Multi-Agent Assistant', icon: <BotMessageSquare className="w-4 h-4" /> },
    { id: 'reports', label: 'Report Generator', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <aside id="main-sidebar" className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 h-screen sticky top-0 text-slate-300">
      {/* Top Header & Brand */}
      <div>
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-xs">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-white text-base tracking-tight">UNiAGENT</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono border border-indigo-800/50">v0.1</span>
              </div>
              <p className="text-[11px] text-slate-400">AI University Student Agent</p>
            </div>
          </div>
        </div>

        {/* Active Account Banner */}
        <div className="px-3 pt-3">
          <div className="p-3 rounded-lg bg-slate-800 border border-slate-700/60 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-indigo-400" /> Signed In As
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold ${user?.role === 'admin' ? 'bg-amber-950 text-amber-300 border border-amber-800/60' : 'bg-indigo-950 text-indigo-300 border border-indigo-800/60'}`}>
                {user?.role || 'Guest'}
              </span>
            </div>
            <div className="text-white font-semibold truncate text-xs">{user?.full_name || 'Not signed in'}</div>
            <div className="text-[10px] text-slate-400 truncate">{user?.email}</div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-3 space-y-1 mt-1">
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <span className={isActive ? 'text-white' : 'text-slate-400'}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                      isActive
                        ? 'bg-indigo-700/80 text-indigo-100'
                        : 'bg-slate-800 text-slate-400 border border-slate-700/60'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer info & multi-agent status */}
      <div className="p-3 border-t border-slate-800 space-y-2.5">
        <div className="p-2.5 rounded-lg bg-slate-800 border border-slate-700/60">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="flex items-center space-x-1.5 text-indigo-300 font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Keyword-Routed Agents</span>
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            7 specialized agent personas, routed by keyword matching and backed by OpenAI or Gemini when configured.
          </p>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            id="btn-auth-action"
            type="button"
            onClick={user ? logout : onOpenAuth}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{user ? 'Sign Out' : 'Sign In / Register'}</span>
          </button>
          <span className="text-[10px] text-slate-500 font-mono">Node.js + React</span>
        </div>
      </div>
    </aside>
  );
};
