import React, { useState, useEffect } from 'react';
import {
  Activity,
  Cpu,
  Server,
  Database,
  MessagesSquare,
  RefreshCw,
  Terminal,
  Clock,
  Users,
  KeyRound,
  UserX,
  UserCheck2,
  Copy,
  Check,
  X
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AdminTelemetry, AgentInfo, AgentRun, User } from '../types';

export const AdminView: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [telemetry, setTelemetry] = useState<AdminTelemetry | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [recentRuns, setRecentRuns] = useState<AgentRun[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [userActionError, setUserActionError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [revealedPassword, setRevealedPassword] = useState<{ userId: string; email: string; password: string } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [tel, agList, runs, userList] = await Promise.all([
        api.getAdminTelemetry().catch(() => null),
        api.getAgentsList().catch(() => []),
        api.getAgentTelemetry().catch(() => []),
        api.getAdminUsers().catch(() => []),
      ]);
      setTelemetry(tel);
      setAgents(agList);
      setRecentRuns(runs);
      setUsers(userList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleResetPassword = async (u: User) => {
    if (!confirm(`Generate a new temporary password for ${u.email}? This signs them out of any existing session.`)) return;
    setUserActionError(null);
    setPendingUserId(u.id);
    try {
      const res = await api.resetUserPassword(u.id);
      setRevealedPassword({ userId: u.id, email: u.email, password: res.temporary_password });
    } catch (err: any) {
      setUserActionError(err?.message || 'Failed to reset password.');
    } finally {
      setPendingUserId(null);
    }
  };

  const handleToggleActive = async (u: User) => {
    const nextActive = !u.is_active;
    if (!confirm(`${nextActive ? 'Reactivate' : 'Deactivate'} ${u.email}?`)) return;
    setUserActionError(null);
    setPendingUserId(u.id);
    try {
      await api.updateUserStatus(u.id, nextActive);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_active: nextActive } : x)));
    } catch (err: any) {
      setUserActionError(err?.message || 'Failed to update account status.');
    } finally {
      setPendingUserId(null);
    }
  };

  const handleRoleChange = async (u: User, role: string) => {
    setUserActionError(null);
    setPendingUserId(u.id);
    try {
      await api.updateAdminUserRole(u.id, role);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: role as User['role'] } : x)));
    } catch (err: any) {
      setUserActionError(err?.message || 'Failed to update role.');
    } finally {
      setPendingUserId(null);
    }
  };

  const copyPassword = () => {
    if (!revealedPassword) return;
    navigator.clipboard.writeText(revealedPassword.password);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  // Every number below is either a real live figure, or an em dash while it
  // hasn't loaded yet - never a plausible-looking placeholder. `telemetry`
  // fields are real counts that can legitimately be 0 (a fresh platform with
  // no students yet), so this only falls back on `telemetry` itself being
  // null, never on an individual field being falsy.
  const stat = (value: number | undefined) => (telemetry ? value ?? 0 : '—');

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-mono text-[10px] font-bold border border-amber-200 dark:border-amber-800/60">
              ADMIN CONTROL PANEL
            </span>
            <span className="text-slate-400 text-xs">•</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Platform Telemetry</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">System Health & Activity</h2>
        </div>

        <button
          type="button"
          onClick={loadAdminData}
          className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-xs self-start"
          title="Refresh Metrics"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Platform Totals Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Total Users</div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">{stat(telemetry?.total_users)}</div>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Active Students</div>
          <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">{stat(telemetry?.active_students)}</div>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Projects Logged</div>
          <div className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">{stat(telemetry?.projects_scanned)}</div>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Document Chunks</div>
          <div className="text-xl font-bold font-mono text-purple-600 dark:text-purple-400 mt-1">{stat(telemetry?.vector_embeddings_stored)}</div>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Agent Runs Logged</div>
          <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">{stat(telemetry?.agent_runs_logged)}</div>
        </div>
      </div>

      {/* System Health Status Banner - built from real values returned by
          the server, not static claims about infrastructure that isn't
          actually running. */}
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>What's Actually Running</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5" /> API Server
              </span>
              <span className={`w-2 h-2 rounded-full ${telemetry ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              {telemetry ? 'Node.js / Express, responding normally.' : 'Not reachable.'}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" /> Data Store
              </span>
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              {telemetry?.system_health?.database || 'Loading…'}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" /> Chat & Agents
              </span>
              <span className={`w-2 h-2 rounded-full ${telemetry ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              {telemetry?.system_health?.multi_agent_system || 'Loading…'}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Session Persistence
              </span>
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              {telemetry?.system_health?.checkpointer || 'Loading…'}
            </p>
          </div>
        </div>
      </div>

      {/* User Management - no email provider is configured on this server,
          so there's no self-service password reset flow yet. This is the
          honest stand-in: an admin generates a one-time temporary password
          and relays it to the student directly. */}
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>User Management</span>
          </h3>
          <span className="text-[11px] text-slate-400">{users.length} account{users.length === 1 ? '' : 's'}</span>
        </div>

        {userActionError && (
          <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 text-xs">
            {userActionError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="pb-2 pr-3">Name</th>
                <th className="pb-2 pr-3">Email</th>
                <th className="pb-2 pr-3">Role</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => (
                <tr key={u.id} className="text-slate-700 dark:text-slate-300">
                  <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-white">{u.full_name}</td>
                  <td className="py-2.5 pr-3 text-slate-500 dark:text-slate-400">{u.email}</td>
                  <td className="py-2.5 pr-3">
                    <select
                      value={u.role}
                      disabled={pendingUserId === u.id}
                      onChange={(e) => handleRoleChange(u, e.target.value)}
                      className="text-[11px] rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-slate-900 dark:text-white outline-none disabled:opacity-50"
                    >
                      <option value="student">student</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold ${u.is_active ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                      {u.is_active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={pendingUserId === u.id}
                        onClick={() => handleResetPassword(u)}
                        title="Generate a temporary password"
                        className="p-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer disabled:opacity-40"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={pendingUserId === u.id || u.id === currentUser?.id}
                        onClick={() => handleToggleActive(u)}
                        title={u.is_active ? 'Deactivate account' : 'Reactivate account'}
                        className="p-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer disabled:opacity-40"
                      >
                        {u.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agents List */}
      <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <Cpu className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>Agent Roster</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((ag) => (
            <div
              key={ag.id}
              className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900 dark:text-white">{ag.name}</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">
                {ag.description}
              </p>
              <div className="flex flex-wrap gap-1 pt-1">
                {ag.capabilities?.map((cap, idx) => (
                  <span
                    key={idx}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Agent Activity - real runs from every account on the
          platform, most recent first. No activity yet is shown honestly
          rather than backfilled with fabricated log lines. */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-mono text-xs space-y-3 shadow-sm">
        <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-white text-xs">Recent Agent Activity (all accounts)</span>
          </div>
          <MessagesSquare className="w-3.5 h-3.5 text-slate-500" />
        </div>

        <div className="space-y-1.5 text-[11px] max-h-48 overflow-y-auto">
          {recentRuns.length === 0 ? (
            <div className="text-slate-500 py-2">No agent activity recorded yet.</div>
          ) : (
            recentRuns.slice(0, 20).map((run) => (
              <div key={run.id} className="flex items-start gap-2">
                <span className="text-slate-600 shrink-0">
                  {run.created_at ? new Date(run.created_at).toLocaleTimeString() : '—'}
                </span>
                <span className={run.status === 'success' ? 'text-emerald-400' : 'text-rose-400'}>
                  [{run.agent_name}]
                </span>
                <span className="text-slate-300 truncate">{run.input_prompt}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Temporary password reveal - shown exactly once, matching what the
          server actually does: it never stores or logs the plaintext value
          anywhere else, so this is the only place to see it. */}
      {revealedPassword && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-xs p-4">
          <div className="my-auto w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl relative text-slate-900 dark:text-slate-100">
            <button
              type="button"
              onClick={() => setRevealedPassword(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Temporary Password</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              For <strong>{revealedPassword.email}</strong>. Share this with them directly - it won't be shown again, and their previous session has been signed out.
            </p>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-sm">
              <span className="flex-1 select-all">{revealedPassword.password}</span>
              <button
                type="button"
                onClick={copyPassword}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer shrink-0"
              >
                {copiedPassword ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPassword ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setRevealedPassword(null)}
              className="mt-4 w-full py-2 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-medium transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
