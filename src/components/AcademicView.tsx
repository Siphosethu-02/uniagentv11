import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit2,
  Award,
  TrendingUp,
  CheckCircle2,
  Calculator,
  AlertCircle,
  X
} from 'lucide-react';
import { api } from '../services/api';
import { Module, AcademicStats } from '../types';
import { useAuth } from '../context/AuthContext';

export const AcademicView: React.FC = () => {
  const { student } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [stats, setStats] = useState<AcademicStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterSemester, setFilterSemester] = useState<string>('all');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    credits: 18,
    semester: 'Semester 1',
    year: 2024,
    lecturer: '',
    status: 'in_progress' as 'completed' | 'in_progress' | 'planned',
    target_mark: 80,
    final_mark: '' as any,
    is_distinction: false,
    syllabus_summary: '',
  });

  // GPA Target Calculator State
  const [simulatedTargetGpa, setSimulatedTargetGpa] = useState<number>(3.90);

  const loadData = async () => {
    try {
      const [mods, st] = await Promise.all([
        api.getModules(),
        api.getAcademicStats(),
      ]);
      setModules(mods);
      setStats(st);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingModule(null);
    setFormData({
      code: '',
      name: '',
      credits: 18,
      semester: 'Semester 2',
      year: 2024,
      lecturer: '',
      status: 'in_progress',
      target_mark: 85,
      final_mark: '',
      is_distinction: false,
      syllabus_summary: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (mod: Module) => {
    setEditingModule(mod);
    setFormData({
      code: mod.code,
      name: mod.name,
      credits: mod.credits,
      semester: mod.semester,
      year: mod.year,
      lecturer: mod.lecturer || '',
      status: mod.status,
      target_mark: mod.target_mark,
      final_mark: mod.final_mark ?? '',
      is_distinction: mod.is_distinction,
      syllabus_summary: mod.syllabus_summary || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      code: formData.code.toUpperCase(),
      credits: Number(formData.credits),
      target_mark: Number(formData.target_mark),
      final_mark: formData.final_mark !== '' ? Number(formData.final_mark) : undefined,
      is_distinction: formData.final_mark !== '' ? Number(formData.final_mark) >= 75 : formData.is_distinction,
    };

    if (editingModule) {
      await api.updateModule(editingModule.id, payload);
    } else {
      await api.createModule(payload);
    }
    setIsModalOpen(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this module?')) {
      await api.deleteModule(id);
      loadData();
    }
  };

  const filteredModules = filterSemester === 'all'
    ? modules
    : modules.filter(m => `${m.year} ${m.semester}`.toLowerCase().includes(filterSemester.toLowerCase()));

  // Calculator calculations
  const totalCompletedCredits = modules
    .filter(m => m.status === 'completed' && m.final_mark)
    .reduce((sum, m) => sum + m.credits, 0);

  const currentWeightedSum = modules
    .filter(m => m.status === 'completed' && m.final_mark)
    .reduce((sum, m) => sum + (m.final_mark! * m.credits), 0);

  const remainingCredits = Math.max(0, 360 - totalCompletedCredits);

  // Target calculation for remaining modules
  // Target GPA on 4.0 scale mapped to % (approx 80% = 3.7, 85% = 4.0)
  const targetMarkPercentage = Math.min(100, Math.max(50, Math.round(70 + (simulatedTargetGpa - 3.0) * 15)));

  return (
    <div className="space-y-6">
      {/* Top Academic Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Academic Progression & Modules</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Track coursework distinctions, weighted GPA projections, and university syllabus requirements
          </p>
        </div>
        <button
          id="btn-add-module"
          type="button"
          onClick={handleOpenAdd}
          className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center space-x-1.5 transition shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Course Module</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Distinction Rate</span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/50">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
            {stats?.distinctions ?? 4} / {stats?.completed_modules ?? 5}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {stats?.distinction_rate_percent ?? 80}% of completed modules are First-Class (≥75%)
          </p>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Cumulative Average</span>
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/50">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
            {stats?.average_mark ?? 84.8}%
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Weighted across {stats?.credits_earned ?? 288} total earned credits
          </p>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Target Graduation GPA</span>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
              <Calculator className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
            {stats?.gpa ?? 3.86} <span className="text-sm text-slate-400">/ {stats?.target_gpa ?? 4.00}</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Required average in active modules: <strong className="text-indigo-600 dark:text-indigo-400">≥ 85.0%</strong>
          </p>
        </div>
      </div>

      {/* Interactive GPA Simulator Drawer / Box */}
      <div className="p-5 rounded-xl bg-slate-900 text-white border border-slate-800 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-indigo-400 mb-1">
              <Calculator className="w-4 h-4" />
              <span>Interactive GPA Target Forecaster</span>
            </div>
            <p className="text-xs text-slate-300">
              Adjust your target GPA to see the required minimum marks across your remaining {remainingCredits} credits.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-xs text-slate-400">Target GPA:</span>
            <input
              type="range"
              min="3.5"
              max="4.0"
              step="0.05"
              value={simulatedTargetGpa}
              onChange={(e) => setSimulatedTargetGpa(parseFloat(e.target.value))}
              className="w-32 accent-indigo-500 cursor-pointer"
            />
            <span className="text-sm font-bold font-mono px-2.5 py-1 rounded bg-slate-800 text-indigo-400 border border-slate-700">
              {simulatedTargetGpa.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-800 border border-slate-700/60">
            <span className="text-slate-400">Required Remaining Mark:</span>
            <div className="text-base font-bold text-indigo-400 font-mono mt-0.5">≥ {targetMarkPercentage}%</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-800 border border-slate-700/60">
            <span className="text-slate-400">Distinctions Required:</span>
            <div className="text-base font-bold text-white font-mono mt-0.5">At least 3 more</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-800 border border-slate-700/60">
            <span className="text-slate-400">Academic Standing:</span>
            <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">Summa Cum Laude Track</div>
          </div>
        </div>
      </div>

      {/* Modules Table & List */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Coursework Modules</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Official transcript records and enrolled semesters</p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Filter:</span>
            <select
              value={filterSemester}
              onChange={(e) => setFilterSemester(e.target.value)}
              className="text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All Semesters</option>
              <option value="2024">2024 Courses</option>
              <option value="2023">2023 Courses</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase font-medium">
              <tr>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Module Name</th>
                <th className="py-3 px-4">Credits</th>
                <th className="py-3 px-4">Semester</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Mark</th>
                <th className="py-3 px-4">Standing</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredModules.map((mod) => (
                <tr key={mod.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                    {mod.code}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900 dark:text-white">{mod.name}</div>
                    {mod.lecturer && <div className="text-[11px] text-slate-400">Lecturer: {mod.lecturer}</div>}
                    {mod.syllabus_summary && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 italic">
                        {mod.syllabus_summary}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">{mod.credits}</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{mod.year} {mod.semester}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium font-mono uppercase ${
                        mod.status === 'completed'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                          : mod.status === 'in_progress'
                          ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {mod.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold">
                    {mod.final_mark !== undefined && mod.final_mark !== null ? (
                      <span className={mod.final_mark >= 75 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}>
                        {mod.final_mark}%
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Target: {mod.target_mark}%</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {mod.is_distinction || (mod.final_mark && mod.final_mark >= 75) ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold border border-emerald-200 dark:border-emerald-800/60">
                        <Award className="w-3 h-3" /> Distinction
                      </span>
                    ) : mod.status === 'completed' ? (
                      <span className="text-slate-500 dark:text-slate-400 text-[11px]">Pass</span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400 text-[11px]">In Progress</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end space-x-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(mod)}
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                        title="Edit Module"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(mod.id)}
                        className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                        title="Delete Module"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-xs p-4">
          <div className="my-auto w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl relative text-slate-900 dark:text-slate-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {editingModule ? 'Edit Course Module' : 'Add Course Module'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Enter course information, target mark, and credit weighting.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Course Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CSC3003S"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white font-mono uppercase focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">NQF Credits *</label>
                  <input
                    type="number"
                    required
                    value={formData.credits}
                    onChange={(e) => setFormData({ ...formData, credits: Number(e.target.value) })}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Module Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Reinforcement Learning & Transformers"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Semester</label>
                  <select
                    value={formData.semester}
                    onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2.5 py-2 text-slate-900 dark:text-white outline-none"
                  >
                    <option value="Semester 1">Semester 1</option>
                    <option value="Semester 2">Semester 2</option>
                    <option value="Year Course">Year Course</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Year</label>
                  <input
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2.5 py-2 text-slate-900 dark:text-white outline-none"
                  >
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="planned">Planned</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Target Mark (%)</label>
                  <input
                    type="number"
                    value={formData.target_mark}
                    onChange={(e) => setFormData({ ...formData, target_mark: Number(e.target.value) })}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Final Mark (% if completed)</label>
                  <input
                    type="number"
                    placeholder="e.g. 88.5"
                    value={formData.final_mark}
                    onChange={(e) => setFormData({ ...formData, final_mark: e.target.value })}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Lecturer / Convenor</label>
                <input
                  type="text"
                  placeholder="e.g. Prof. David Thorne"
                  value={formData.lecturer}
                  onChange={(e) => setFormData({ ...formData, lecturer: e.target.value })}
                  className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Syllabus Summary / Key Topics</label>
                <textarea
                  rows={2}
                  placeholder="Kernel structures, synchronization, virtual memory..."
                  value={formData.syllabus_summary}
                  onChange={(e) => setFormData({ ...formData, syllabus_summary: e.target.value })}
                  className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-xs cursor-pointer"
                >
                  {editingModule ? 'Update Module' : 'Create Module'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
