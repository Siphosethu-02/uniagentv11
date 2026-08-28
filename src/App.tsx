import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { Navigation, NavTab } from './components/Navigation';
import { DashboardView } from './components/DashboardView';
import { AcademicView } from './components/AcademicView';
import { ProjectsView } from './components/ProjectsView';
import { DocumentsView } from './components/DocumentsView';
import { QuizzesView } from './components/QuizzesView';
import { CareerView } from './components/CareerView';
import { JobSearchView } from './components/JobSearchView';
import { ChatView } from './components/ChatView';
import { ReportsView } from './components/ReportsView';
import { AdminView } from './components/AdminView';
import { SettingsView } from './components/SettingsView';
import { AuthModal } from './components/AuthModal';
import { Menu, X, Moon, Sun, GraduationCap, Loader2 } from 'lucide-react';

const MainApp: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isInitializing } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // No stored session, or the stored token didn't verify - every view below
  // needs a signed-in user, so prompt for sign-in instead of rendering
  // views that would just fail their API calls silently.
  useEffect(() => {
    if (!isInitializing && !user) {
      setIsAuthOpen(true);
    }
  }, [isInitializing, user]);

  // The "dashboard" tab's header title depends on role, same as its sidebar
  // label in Navigation.tsx - an admin's landing page is platform telemetry,
  // not a personal academic overview, so the title bar should say so.
  const tabDisplayTitles: Record<NavTab, string> = {
    dashboard: user?.role === 'admin' ? 'Admin Dashboard' : 'Executive Overview',
    academic: 'Academic Progression & GPA',
    projects: 'Project Code Scan',
    documents: 'Course Document Hub',
    quizzes: 'Quiz Prep',
    career: 'Career & WIL Tracker',
    jobs: 'Job Search & Apply',
    chat: 'Multi-Agent Assistant',
    reports: 'Student Dossier Generator',
    settings: 'Settings & Profile',
  };

  const renderContent = () => {
    if (!user) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center py-16 space-y-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Sign in to continue</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
              Your academic dashboard, chat, and career data are tied to your account.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAuthOpen(true)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition cursor-pointer shadow-xs"
          >
            Sign In
          </button>
        </div>
      );
    }
    switch (currentTab) {
      case 'dashboard':
        // Same nav slot, genuinely different page per role: admins get real
        // platform telemetry and user management, students get their
        // personal academic overview. See Navigation.tsx for the matching
        // sidebar label/icon logic.
        return user?.role === 'admin' ? <AdminView /> : <DashboardView onNavigate={(tab) => setCurrentTab(tab)} />;
      case 'academic':
        return <AcademicView />;
      case 'projects':
        return <ProjectsView />;
      case 'documents':
        return <DocumentsView />;
      case 'quizzes':
        return <QuizzesView />;
      case 'career':
        return <CareerView />;
      case 'jobs':
        return <JobSearchView />;
      case 'chat':
        return <ChatView />;
      case 'reports':
        return <ReportsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView onNavigate={(tab) => setCurrentTab(tab)} />;
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row antialiased font-sans transition-colors duration-200">
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">
            <GraduationCap className="w-4 h-4" />
          </div>
          <span className="font-bold text-slate-900 dark:text-white tracking-tight text-base">UNiAGENT</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            id="btn-mobile-theme-toggle"
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 transition cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 transition"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Sidebar for Desktop & Mobile drawer */}
      <div className={`${mobileMenuOpen ? 'block fixed inset-0 z-50' : 'hidden'} md:block`}>
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
        <Navigation
          currentTab={currentTab}
          onTabChange={(tab) => {
            setCurrentTab(tab);
            setMobileMenuOpen(false);
          }}
          onOpenAuth={() => setIsAuthOpen(true)}
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950">
        {/* Top App Header */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 md:px-8 flex items-center justify-between sticky top-0 z-30 transition-colors duration-200">
          <div className="flex items-center space-x-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {tabDisplayTitles[currentTab] || currentTab}
            </h2>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <div className="hidden sm:flex items-center space-x-2 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs">Node.js Server • Online</span>
            </div>

            {/* Dark Mode Toggle Button */}
            <button
              id="btn-theme-toggle"
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer flex items-center justify-center shadow-2xs"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
            </button>

            <button
              id="btn-header-auth"
              type="button"
              onClick={() => setIsAuthOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition cursor-pointer shadow-2xs"
            >
              {user ? user.full_name : 'Sign In'}
            </button>
          </div>
        </header>

        {/* Content Viewport */}
        <div className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          {renderContent()}
        </div>
      </main>

      {/* Global Auth Modal */}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ThemeProvider>
  );
}

