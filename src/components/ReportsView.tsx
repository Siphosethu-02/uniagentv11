import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  Printer,
  Sparkles,
  BookOpen,
  FolderGit2,
  Briefcase,
  Layers,
  FileText
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const ReportsView: React.FC = () => {
  const { student, user } = useAuth();
  const [reportType, setReportType] = useState<string>('comprehensive');
  const [reportFormat, setReportFormat] = useState<string>('markdown');
  const [includeGpa, setIncludeGpa] = useState(true);
  const [includeProjects, setIncludeProjects] = useState(true);
  const [includeSkills, setIncludeSkills] = useState(true);
  const [includeInternships, setIncludeInternships] = useState(true);

  const [generatedReport, setGeneratedReport] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await api.generateReport({
        report_type: reportType,
        format: reportFormat,
        include_sections: {
          gpa: includeGpa,
          projects: includeProjects,
          skills: includeSkills,
          internships: includeInternships,
        },
      });
      setGeneratedReport(res.content);
    } catch (err: any) {
      setError(err.message || 'Failed to generate report. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!generatedReport) return;
    navigator.clipboard.writeText(generatedReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!generatedReport) return;
    const blob = new Blob([generatedReport], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `UNiAGENT_${reportType}_Report.${reportFormat === 'json' ? 'json' : reportFormat === 'html' ? 'html' : 'md'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Student Dossier & Report Generator</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Export verified transcripts, AST-verified project portfolios, and career readiness reports in Markdown, JSON, or Print formats
        </p>
      </div>

      {/* Generator Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Options Card */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Report Specifications</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Report Archetype</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none"
                >
                  <option value="comprehensive">Comprehensive Student Dossier</option>
                  <option value="academic">Academic Transcript & GPA Forecast</option>
                  <option value="projects">Technical Project & Architecture Portfolio</option>
                  <option value="career">Career Readiness & Skills Evaluation</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Export Format</label>
                <select
                  value={reportFormat}
                  onChange={(e) => setReportFormat(e.target.value)}
                  className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none"
                >
                  <option value="markdown">Markdown (.md)</option>
                  <option value="json">Structured JSON (.json)</option>
                  <option value="html">Styled HTML Document (.html)</option>
                </select>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] block">Include Sections:</span>
                
                <label className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeGpa}
                    onChange={(e) => setIncludeGpa(e.target.checked)}
                    className="accent-indigo-600 rounded"
                  />
                  <span>Academic Transcript & Distinctions</span>
                </label>

                <label className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeProjects}
                    onChange={(e) => setIncludeProjects(e.target.checked)}
                    className="accent-indigo-600 rounded"
                  />
                  <span>Scanned Projects & Heuristics</span>
                </label>

                <label className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSkills}
                    onChange={(e) => setIncludeSkills(e.target.checked)}
                    className="accent-indigo-600 rounded"
                  />
                  <span>Verified Skills & Competencies</span>
                </label>

                <label className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeInternships}
                    onChange={(e) => setIncludeInternships(e.target.checked)}
                    className="accent-indigo-600 rounded"
                  />
                  <span>Work-Integrated Learning (WIL) Log</span>
                </label>
              </div>

              {error && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 text-xs">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50 mt-4"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isGenerating ? 'Synthesizing Dossier...' : 'Generate Dossier'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Generated Output Preview Canvas */}
        <div className="lg:col-span-8 space-y-4">
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 min-h-[500px] flex flex-col justify-between transition-colors">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">Dossier Preview</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Student: {user?.full_name} ({student?.student_number})</p>
                </div>

                {generatedReport && (
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePrint}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print</span>
                    </button>
                  </div>
                )}
              </div>

              {generatedReport ? (
                <div className="mt-4 p-4 rounded-xl bg-slate-900 text-slate-200 font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-[550px] overflow-y-auto leading-relaxed border border-slate-800">
                  {generatedReport}
                </div>
              ) : (
                <div className="py-20 text-center text-slate-400 space-y-3">
                  <FileSpreadsheet className="w-12 h-12 mx-auto opacity-30 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No report generated yet</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                      Choose your desired report archetype on the left and click "Generate Dossier" to compile your verified data.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
