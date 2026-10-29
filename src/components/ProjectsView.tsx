import React, { useState, useEffect } from 'react';
import {
  FolderGit2,
  Plus,
  Trash2,
  ExternalLink,
  Code2,
  ShieldCheck,
  Zap,
  Sparkles,
  Layers,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  X
} from 'lucide-react';
import { api } from '../services/api';
import { Project } from '../types';

export const ProjectsView: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // New project scan modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newRepoUrl, setNewRepoUrl] = useState('');
  const [newProjectType, setNewProjectType] = useState('Full-Stack Web App');
  const [codeFileName, setCodeFileName] = useState('main.py');
  const [codeFileContent, setCodeFileContent] = useState(`# Paste one of your actual source files here.\n# The scanner reads the file name and content to detect the\n# language, frameworks, and whether tests/Docker config are present.\n\ndef example():\n    return "Replace this with real code from your project"`);

  const loadProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
      if (data.length > 0 && !selectedProject) {
        setSelectedProject(data[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreateAndScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsScanning(true);
    try {
      const payload = {
        title: newTitle,
        description: newDescription,
        repository_url: newRepoUrl || undefined,
        project_type: newProjectType,
        status: 'completed',
        // Only the file the user actually pasted in - injecting a fake
        // Dockerfile and test file here would make every project falsely
        // show up as containerized and tested, regardless of what was
        // really submitted.
        files: codeFileContent.trim() ? [{ name: codeFileName, content: codeFileContent }] : []
      };
      const created = await api.createProject(payload);
      setIsModalOpen(false);
      await loadProjects();
      setSelectedProject(created);
    } finally {
      setIsScanning(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this project record and associated scan analysis?')) {
      await api.deleteProject(id);
      setSelectedProject(null);
      await loadProjects();
    }
  };

  const copyToClipboard = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Project Code Scanner</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Detects languages, frameworks, tests, and Docker config from the files you submit - plus an AI-written review when an AI provider API key is configured
          </p>
        </div>
        <button
          id="btn-scan-new-project"
          type="button"
          onClick={() => {
            setNewTitle('');
            setNewDescription('');
            setNewRepoUrl('');
            setIsModalOpen(true);
          }}
          className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center space-x-1.5 transition shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Scan & Register Codebase</span>
        </button>
      </div>

      {/* Main Project Explorer Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Project Selector List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
            Registered Repositories ({projects.length})
          </div>

          <div className="space-y-2.5">
            {projects.map((proj) => {
              const isSelected = selectedProject?.id === proj.id;
              return (
                <div
                  key={proj.id}
                  onClick={() => setSelectedProject(proj)}
                  className={`p-4 rounded-xl border transition cursor-pointer text-left ${
                    isSelected
                      ? 'bg-slate-900 dark:bg-slate-800/90 text-white border-slate-800 dark:border-indigo-500 shadow-sm ring-1 ring-indigo-500'
                      : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h4 className="text-xs font-bold truncate text-slate-900 dark:text-white">{proj.title}</h4>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold shrink-0 ${
                        isSelected
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {proj.project_type}
                    </span>
                  </div>

                  <p className={`text-[11px] line-clamp-2 mb-2.5 ${isSelected ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                    {proj.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-1 mb-2">
                    {proj.technologies?.slice(0, 3).map((t, idx) => (
                      <span
                        key={idx}
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                          isSelected ? 'bg-slate-800 dark:bg-slate-700 text-indigo-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/50'
                        }`}
                      >
                        {t}
                      </span>
                    ))}
                    {(proj.technologies?.length || 0) > 3 && (
                      <span className="text-[9px] text-slate-400 font-mono">
                        +{(proj.technologies?.length || 0) - 3}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-200/40 dark:border-slate-800">
                    <span className="font-mono">{proj.code_metrics?.total_lines_of_code ?? 0} LOC</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-medium">Scanned</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Deep Project Analysis Dossier */}
        <div className="lg:col-span-8">
          {selectedProject ? (
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6 transition-colors">
              {/* Project Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center space-x-2 mb-1.5">
                    <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-mono text-[11px] font-semibold border border-indigo-100 dark:border-indigo-800/50">
                      {selectedProject.project_type}
                    </span>
                    <span className="text-slate-400 text-xs">•</span>
                    <span className="text-slate-500 dark:text-slate-400 text-xs font-mono">{selectedProject.status}</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {selectedProject.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {selectedProject.description}
                  </p>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {selectedProject.repository_url && (
                    <a
                      href={selectedProject.repository_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer"
                    >
                      <FolderGit2 className="w-3.5 h-3.5" />
                      <span>Repo</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedProject.id)}
                    className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition cursor-pointer"
                    title="Delete project"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Code Metrics Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Lines of Code</div>
                  <div className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                    {selectedProject.code_metrics?.total_lines_of_code ?? 0}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Scanned Files</div>
                  <div className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                    {selectedProject.code_metrics?.file_count ?? 0}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Docker Config</div>
                  {selectedProject.code_metrics?.has_docker ? (
                    <div className="text-base font-bold text-indigo-600 dark:text-indigo-400 font-mono mt-0.5 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Detected
                    </div>
                  ) : (
                    <div className="text-base font-bold text-slate-400 dark:text-slate-500 font-mono mt-0.5">Not found</div>
                  )}
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Test Files</div>
                  {selectedProject.code_metrics?.has_tests ? (
                    <div className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Detected
                    </div>
                  ) : (
                    <div className="text-base font-bold text-slate-400 dark:text-slate-500 font-mono mt-0.5">Not found</div>
                  )}
                </div>
              </div>

              {/* Technologies Stack */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Technologies & Frameworks
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedProject.technologies?.map((tech, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-mono border border-slate-200 dark:border-slate-700"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>

              {/* Architecture & System Design */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Architectural Pattern & Design
                </h4>
                <p className="text-xs text-slate-800 dark:text-slate-200 font-semibold mb-1">
                  {selectedProject.architecture || 'Not determined'}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {selectedProject.analysis_summary}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/60 text-[11px]">
                  <div>
                    <span className="text-slate-400 font-medium">Languages:</span>
                    <p className="text-slate-800 dark:text-slate-200">{selectedProject.backend_info || 'Not determined'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Database:</span>
                    <p className="text-slate-800 dark:text-slate-200">{selectedProject.database_info || 'Not determined'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Frontend:</span>
                    <p className="text-slate-800 dark:text-slate-200">{selectedProject.frontend_info || 'Not determined'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Security:</span>
                    <p className="text-slate-800 dark:text-slate-200">{selectedProject.security_info || 'Not assessed'}</p>
                  </div>
                </div>
              </div>

              {/* Strengths and Recommendations Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
                  <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Strengths
                  </h4>
                  {selectedProject.strengths?.length ? (
                    <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                      {selectedProject.strengths.map((s, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400 italic">None identified from the submitted files.</p>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
                  <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Suggested Improvements
                  </h4>
                  {selectedProject.improvements?.length ? (
                    <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                      {selectedProject.improvements.map((imp, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-amber-600 dark:text-amber-400 font-bold">•</span>
                          <span>{imp}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400 italic">None identified from the submitted files.</p>
                  )}
                </div>
              </div>

              {/* CV & Career Value Ready Section */}
              <div className="p-4 rounded-xl bg-slate-900 text-white border border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Professional Resume / CV Summary
                  </h4>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(selectedProject.professional_summary || '', 'cv_summary')}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition cursor-pointer"
                  >
                    {copiedSection === 'cv_summary' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSection === 'cv_summary' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-xs text-slate-300 italic leading-relaxed">
                  {selectedProject.professional_summary
                    ? `"${selectedProject.professional_summary}"`
                    : 'Add source files with a recognizable language or framework to get a CV bullet point suggestion.'}
                </p>

                <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap gap-1.5">
                  <span className="text-[10px] text-slate-400 mr-1 flex items-center">Demonstrated Skills:</span>
                  {selectedProject.skills_demonstrated?.map((sk, idx) => (
                    <span key={idx} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                      {sk}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-slate-400 shadow-sm">
              <FolderGit2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Select a project on the left or scan a new codebase.</p>
            </div>
          )}
        </div>
      </div>

      {/* Codebase Scan Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-xs p-4">
          <div className="my-auto w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto text-slate-900 dark:text-slate-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <FolderGit2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Scan & Register Student Project</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              We'll detect languages, frameworks, tests, and Docker config from the file you paste below, plus generate an AI-written review if an AI provider API key is configured on the server.
            </p>

            <form onSubmit={handleCreateAndScan} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Project Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Distributed Neural Search Engine"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Project Type</label>
                  <select
                    value={newProjectType}
                    onChange={(e) => setNewProjectType(e.target.value)}
                    className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2.5 py-2 text-slate-900 dark:text-white outline-none"
                  >
                    <option value="Full-Stack Web App">Full-Stack Web App</option>
                    <option value="AI & Vector Systems">AI & Vector Systems</option>
                    <option value="Robotics & Algorithms">Robotics & Algorithms</option>
                    <option value="Cloud Infrastructure">Cloud Infrastructure</option>
                    <option value="Mobile Application">Mobile Application</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Project Overview & Goal *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="A short description of what the project does and how it's built."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">GitHub / GitLab Repository URL</label>
                <input
                  type="url"
                  placeholder="https://github.com/alexchen/my-awesome-repo"
                  value={newRepoUrl}
                  onChange={(e) => setNewRepoUrl(e.target.value)}
                  className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none"
                />
              </div>

              {/* Code File Input for AST Scanning */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1.5">
                    <FileCode className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Primary Code File to Scan</span>
                  </label>
                  <input
                    type="text"
                    value={codeFileName}
                    onChange={(e) => setCodeFileName(e.target.value)}
                    className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700"
                  />
                </div>
                <textarea
                  rows={6}
                  value={codeFileContent}
                  onChange={(e) => setCodeFileContent(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 text-indigo-300 font-mono text-[11px] p-3 border border-slate-800 outline-none focus:ring-1 focus:ring-indigo-500"
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
                  disabled={isScanning}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isScanning ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Scanning files...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Execute Deep Analysis</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
