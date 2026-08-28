import React, { useState } from 'react';
import {
  Settings,
  User,
  GraduationCap,
  Save,
  CheckCircle2,
  AlertCircle,
  Shield,
  Key,
  Server
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export const SettingsView: React.FC = () => {
  const { user, student, logout } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [university, setUniversity] = useState(student?.university || '');
  const [degree, setDegree] = useState(student?.degree || '');
  const [major, setMajor] = useState(student?.major || '');
  const [studentNumber, setStudentNumber] = useState(student?.student_number || '');
  const [targetGpa, setTargetGpa] = useState(student?.target_gpa || 4.00);
  const [yearOfStudy, setYearOfStudy] = useState(student?.year_of_study || 1);
  const [saved, setSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateStudentProfile({
        full_name: fullName,
        university,
        degree,
        major,
        student_number: studentNumber,
        target_gpa: Number(targetGpa),
        year_of_study: Number(yearOfStudy),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setPasswordChanging(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPasswordChanged(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      // Changing the password invalidates every existing session for this
      // account server-side, including this browser tab's - so this tab's
      // token is already dead. Sign out locally too and let the sign-in
      // modal reopen, rather than leaving the UI pointing at a session that
      // will fail the moment it makes its next request.
      setTimeout(() => logout(), 2000);
    } catch (err: any) {
      setPasswordError(err?.message || 'Could not change password.');
    } finally {
      setPasswordChanging(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Account & Academic Settings</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Manage your university enrollment credentials, target graduation milestones, and platform preferences
        </p>
      </div>

      {saved && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Academic profile settings updated successfully.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Personal & University Credentials */}
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Student Identity & Degree Information</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Full Legal Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Student ID / Number</label>
              <input
                type="text"
                value={studentNumber}
                onChange={(e) => setStudentNumber(e.target.value)}
                className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white font-mono uppercase outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">University / Institution</label>
              <input
                type="text"
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
                className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Degree Program</label>
              <input
                type="text"
                value={degree}
                onChange={(e) => setDegree(e.target.value)}
                className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Major Specialization</label>
              <input
                type="text"
                value={major}
                onChange={(e) => setMajor(e.target.value)}
                className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Year of Study</label>
                <input
                  type="number"
                  min="1"
                  max="6"
                  value={yearOfStudy}
                  onChange={(e) => setYearOfStudy(Number(e.target.value))}
                  className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Target GPA</label>
                <input
                  type="number"
                  step="0.05"
                  min="3.0"
                  max="4.0"
                  value={targetGpa}
                  onChange={(e) => setTargetGpa(Number(e.target.value))}
                  className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs flex items-center space-x-2 transition shadow-xs cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Profile Changes</span>
          </button>
        </div>
      </form>

      {/* Change Password - its own form, separate from the profile form
          above, since submitting it does something very different (ends
          the current session on success rather than just saving a field). */}
      <form onSubmit={handleChangePassword} className="space-y-4">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Key className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Change Password</span>
          </h3>

          {passwordChanged ? (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Password changed. Signing you out so you can log back in with it&hellip;</span>
            </div>
          ) : (
            <>
              {passwordError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Current Password</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">New Password</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                    minLength={8}
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                At least 8 characters. Changing your password signs you out of every session on this account - you'll need to log back in with the new one right after.
              </p>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={passwordChanging}
                  className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium text-xs flex items-center space-x-2 transition shadow-xs cursor-pointer"
                >
                  <Key className="w-4 h-4" />
                  <span>{passwordChanging ? 'Changing…' : 'Change Password'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </form>

      {/* Security & System Info - purely informational, no form needed */}
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <Server className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>Architecture & Security Environment</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Authentication:</span>
            <p className="text-slate-900 dark:text-white font-semibold mt-0.5">Opaque random session tokens (not JWTs) with scrypt-hashed passwords</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 font-medium">AI Backend:</span>
            <p className="text-slate-900 dark:text-white font-semibold mt-0.5">OpenAI or Google Gemini, whichever API key is configured on the server (falls back to templated responses if neither is set)</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Data Storage:</span>
            <p className="text-slate-900 dark:text-white font-semibold mt-0.5">Local JSON file on the server (single instance, no concurrent-write protection)</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Project Code Scan:</span>
            <p className="text-slate-900 dark:text-white font-semibold mt-0.5">File-extension and keyword heuristics, with an optional AI-written review</p>
          </div>
        </div>
      </div>
    </div>
  );
};
