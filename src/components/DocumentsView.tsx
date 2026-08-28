import React, { useState, useEffect } from 'react';
import {
  FileText,
  UploadCloud,
  Search,
  Trash2,
  Sparkles,
  Layers,
  CheckCircle2,
  Database,
  FileCode,
  FileSpreadsheet,
  BookOpen
} from 'lucide-react';
import { api } from '../services/api';
import { UploadedDoc } from '../types';

export const DocumentsView: React.FC = () => {
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<UploadedDoc | null>(null);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [uploadFilename, setUploadFilename] = useState('');
  const [uploadType, setUploadType] = useState('syllabus');
  const [uploadContent, setUploadContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Search tester
  const [searchQuery, setSearchQuery] = useState('How are distinctions calculated in CSC3002F?');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadDocuments = async () => {
    try {
      // CVs are uploaded through this same endpoint (from the Job Search
      // tab) but aren't course material - keep them out of this list so
      // they don't show up mixed in with syllabi and course notes.
      const docs = (await api.getDocuments()).filter((d) => d.document_type !== 'cv');
      setDocuments(docs);
      if (docs.length > 0 && !selectedDoc) {
        setSelectedDoc(docs[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    if (!uploadFile && (!uploadFilename || !uploadContent)) return;
    setIsUploading(true);
    try {
      if (uploadFile) {
        await api.uploadDocumentFile(uploadFile, uploadType);
        setUploadFile(null);
        setFileInputKey((k) => k + 1);
      } else {
        await api.uploadDocument(uploadFilename, uploadContent, uploadType);
      }
      setUploadFilename('');
      setUploadContent('');
      await loadDocuments();
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document and its saved chunks?')) return;
    setDeleteError(null);
    try {
      await api.deleteDocument(id);
      setSelectedDoc(null);
      await loadDocuments();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete document.');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await api.searchDocuments(searchQuery);
      setSearchResults(res.results || []);
    } catch (err: any) {
      setSearchError(err.message || 'Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const totalChunks = documents.reduce((sum, d) => sum + (d.total_chunks || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Course Document Hub</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Save course materials as text and search across them by keyword. This uses keyword matching, not vector embeddings or semantic search.
        </p>
      </div>

      {/* Document Store Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Saved Documents</span>
            <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{documents.length}</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Pasted text content</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Text Chunks</span>
            <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{totalChunks}</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Split by paragraph, not embedded</p>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Search Method</span>
            <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white font-mono mt-1">Keyword matching</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">In-memory, top 5 results</p>
        </div>
      </div>

      {/* Main Grid: Upload & Document List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Upload New Course Document */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-1 flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Add Course Material</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Upload a PDF or Word document, or paste text directly below.
            </p>

            <form onSubmit={handleUpload} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Upload a File</label>
                <input
                  key={fileInputKey}
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-[11px] text-slate-600 dark:text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-50 dark:file:bg-indigo-950/60 file:text-indigo-700 dark:file:text-indigo-300 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-900/60 cursor-pointer"
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">PDF, DOCX, TXT, or MD - up to 20MB</p>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Document Category</label>
                <select
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
                  className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2.5 py-2 text-slate-900 dark:text-white outline-none"
                >
                  <option value="syllabus">Course Syllabus / Overview</option>
                  <option value="notes">Lecture Notes / Slides</option>
                  <option value="assignment">Assignment & Rubric</option>
                  <option value="handbook">University Handbook</option>
                </select>
              </div>

              {!uploadFile && (
                <>
                  <div className="pt-1 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">
                    Or paste text instead
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Filename</label>
                    <input
                      type="text"
                      placeholder="e.g. CSC3003S_Assignment_1_Brief.txt"
                      value={uploadFilename}
                      onChange={(e) => setUploadFilename(e.target.value)}
                      className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Text Content</label>
                    <textarea
                      rows={5}
                      placeholder="Paste syllabus text, grading rubrics, exam instructions, or reading materials here..."
                      value={uploadContent}
                      onChange={(e) => setUploadContent(e.target.value)}
                      className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-[11px]"
                    />
                  </div>
                </>
              )}

              {uploadError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 text-xs">
                  {uploadError}
                </div>
              )}

              <button
                type="submit"
                disabled={isUploading || (!uploadFile && (!uploadFilename || !uploadContent))}
                className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isUploading ? 'Saving & Chunking...' : 'Save Document'}</span>
              </button>
            </form>
          </div>

          {deleteError && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 text-xs">
              {deleteError}
            </div>
          )}

          {/* Document List */}
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              Uploaded Documents ({documents.length})
            </h4>

            <div className="space-y-2">
              {documents.map((doc) => {
                const isSelected = selectedDoc?.id === doc.id;
                return (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDoc(doc)}
                    className={`p-3 rounded-lg border transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-slate-900 dark:bg-slate-800 text-white border-slate-800 dark:border-indigo-500 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 overflow-hidden">
                      <FileText className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`} />
                      <div className="truncate">
                        <div className="text-xs font-semibold truncate text-slate-900 dark:text-white">{doc.original_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {doc.total_chunks} chunks • {doc.document_type}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(doc.id);
                      }}
                      className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition ml-2 cursor-pointer"
                      title="Purge document"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Vector Semantic Search & Chunk Inspector */}
        <div className="lg:col-span-7 space-y-6">
          {/* Semantic Search Sandbox */}
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-1 flex items-center gap-2">
                <Search className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Search Your Documents</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Keyword search across the documents you've saved - a text match, not a semantic vector search.
              </p>
            </div>

            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                placeholder="Ask any question about your course materials..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition flex items-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{isSearching ? 'Searching...' : 'Search'}</span>
              </button>
            </form>

            {searchError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 text-xs">
                {searchError}
              </div>
            )}

            {/* Search Results Display */}
            {searchResults.length > 0 && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Matched Chunks ({searchResults.length})
                </div>
                {searchResults.map((res, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>{res.document_name}</span>
                        <span className="text-slate-400 font-mono text-[10px]">(Chunk #{res.chunk_index})</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-mono font-bold border border-emerald-200 dark:border-emerald-800/60">
                        Match: {typeof res.match_score === 'number' ? (res.match_score * 100).toFixed(0) : '—'}%
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-mono bg-white dark:bg-slate-900 p-2.5 rounded border border-slate-200 dark:border-slate-700 leading-relaxed">
                      "{res.content}"
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected Document Chunks Inspector */}
          {selectedDoc && (
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Text Chunk Breakdown: {selectedDoc.original_name}</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Total Chunks: {selectedDoc.total_chunks} • Category: {selectedDoc.document_type}
                  </p>
                </div>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {selectedDoc.chunks?.map((chunk, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs"
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1 font-mono">
                      <span>Chunk #{chunk.chunk_index}</span>
                      <span>{chunk.token_count} tokens (approx.)</span>
                    </div>
                    <p className="text-slate-800 dark:text-slate-200 font-mono text-[11px] leading-relaxed">
                      {chunk.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
