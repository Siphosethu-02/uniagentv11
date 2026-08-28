import {
  User, Student, Module, AcademicStats, Project, UploadedDoc,
  Skill, CareerProfile, Internship, AgentInfo, ChatSession,
  ChatMessage, AgentRun, GeneratedReport, SystemHealth, AdminTelemetry,
  QuizListItem, Quiz, QuizGenerateResponse, QuizAttempt,
  JobSearchResponse, CoverLetterResponse, CvMatchResponse
} from '../types';

const API_BASE = '/api/v1';

class ApiService {
  private token: string | null = null;

  constructor() {
    // No fallback demo token - an absent token means "not logged in" and
    // should get a real 401 from the server, not a request that looks
    // authenticated but was never actually validated.
    this.token = localStorage.getItem('uniagent_token');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('uniagent_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('uniagent_token');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Without a timeout, a hung request leaves loading state stuck forever
    // with no error shown - abort and surface a real error instead.
    const controller = new AbortController();
    const REQUEST_TIMEOUT_MS = 20000;
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(errorData.detail || `HTTP Error ${response.status}`);
      }

      return await response.json();
    } catch (err: any) {
      const message = err?.name === 'AbortError' ? 'Request timed out. Please try again.' : err.message;
      console.warn(`API Error [${endpoint}]:`, message);
      throw new Error(message);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Auth
  async login(email: string, password: string) {
    const res = await this.request<{ access_token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(res.access_token);
    return res;
  }

  async register(data: {
    email: string;
    password: string;
    full_name: string;
    student_number?: string;
    university?: string;
    degree?: string;
    major?: string;
    year_of_study?: number;
    target_gpa?: number;
  }) {
    const res = await this.request<{ access_token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(res.access_token);
    return res;
  }

  async getMe() {
    return this.request<{ id: string; email: string; full_name: string; role: string; student: Student }>('/auth/me');
  }

  // Changing your own password invalidates the current session server-side
  // (see server.ts), so the caller should clear the token and prompt the
  // user to sign back in right after this resolves - it isn't done here
  // automatically since the caller (SettingsView) needs to show a
  // confirmation message first.
  async changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  }

  async updateStudentProfile(data: Partial<Student> & { full_name?: string }) {
    return this.request<{ message: string }>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Academic
  async getModules() {
    return this.request<Module[]>('/academic/modules');
  }

  async createModule(data: Partial<Module>) {
    return this.request<Module>('/academic/modules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateModule(id: string, data: Partial<Module>) {
    return this.request<Module>(`/academic/modules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteModule(id: string) {
    return this.request<{ message: string }>(`/academic/modules/${id}`, {
      method: 'DELETE',
    });
  }

  async getAcademicStats() {
    return this.request<AcademicStats>('/academic/stats');
  }

  // Quiz prep
  async getQuizzes() {
    return this.request<QuizListItem[]>('/quizzes');
  }

  async getQuizAttempts() {
    return this.request<QuizAttempt[]>('/quizzes/attempts');
  }

  async getQuiz(id: string) {
    return this.request<Quiz>(`/quizzes/${id}`);
  }

  async generateQuiz(module_id: string, topic: string, question_count: number = 5) {
    return this.request<QuizGenerateResponse>('/quizzes/generate', {
      method: 'POST',
      body: JSON.stringify({ module_id, topic, question_count }),
    });
  }

  async submitQuiz(id: string, answers: { question_id: string; selected_index: number }[]) {
    return this.request<QuizAttempt>(`/quizzes/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });
  }

  // Projects
  async getProjects() {
    return this.request<Project[]>('/projects');
  }

  async getProject(id: string) {
    return this.request<Project>(`/projects/${id}`);
  }

  async createProject(data: Partial<Project> & { files?: { name: string; content: string }[] }) {
    return this.request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string) {
    return this.request<{ message: string }>(`/projects/${id}`, {
      method: 'DELETE',
    });
  }

  // Documents & RAG
  async getDocuments() {
    return this.request<UploadedDoc[]>('/documents');
  }

  async uploadDocument(filename: string, content: string, document_type: string = 'syllabus') {
    return this.request<UploadedDoc>('/documents/upload', {
      method: 'POST',
      body: JSON.stringify({ filename, content, document_type }),
    });
  }

  // Real file upload (PDF/DOCX/TXT/MD) - uses FormData, so this bypasses
  // the JSON-only `request()` helper above rather than forcing a
  // Content-Type: application/json header onto a multipart body.
  async uploadDocumentFile(file: File, document_type: string = 'syllabus') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', document_type);

    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const controller = new AbortController();
    const REQUEST_TIMEOUT_MS = 30000;
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE}/documents/upload-file`, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(errorData.detail || `HTTP Error ${response.status}`);
      }
      return await response.json() as UploadedDoc;
    } catch (err: any) {
      const message = err?.name === 'AbortError' ? 'Upload timed out. Please try again.' : err.message;
      throw new Error(message);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async searchDocuments(query: string) {
    return this.request<{ query: string; total_matches: number; results: any[] }>('/documents/search', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  }

  async deleteDocument(id: string) {
    return this.request<{ message: string }>(`/documents/${id}`, {
      method: 'DELETE',
    });
  }

  // Career
  async getCareerProfile() {
    return this.request<CareerProfile>('/career/profile');
  }

  async updateCareerProfile(data: Partial<CareerProfile>) {
    return this.request<CareerProfile>('/career/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getSkills() {
    return this.request<Skill[]>('/career/skills');
  }

  async createSkill(data: Partial<Skill>) {
    return this.request<Skill>('/career/skills', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteSkill(id: string) {
    return this.request<{ message: string }>(`/career/skills/${id}`, {
      method: 'DELETE',
    });
  }

  async getInternships() {
    return this.request<Internship[]>('/career/internships');
  }

  async createInternship(data: Partial<Internship>) {
    return this.request<Internship>('/career/internships', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateInternship(id: string, data: Partial<Internship>) {
    return this.request<Internship>(`/career/internships/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteInternship(id: string) {
    return this.request<{ message: string }>(`/career/internships/${id}`, {
      method: 'DELETE',
    });
  }

  // Job Search & Application Assistant
  async searchJobs(query: string, remoteOnly: boolean = false) {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (remoteOnly) params.set('remote_only', 'true');
    return this.request<JobSearchResponse>(`/jobs/search?${params.toString()}`);
  }

  async draftCoverLetter(job: { title: string; company: string; location?: string; description?: string }) {
    return this.request<CoverLetterResponse>('/jobs/draft-cover-letter', {
      method: 'POST',
      body: JSON.stringify({ job }),
    });
  }

  async matchCv(documentId: string, job: { title: string; company: string; description?: string }) {
    return this.request<CvMatchResponse>('/cv/match', {
      method: 'POST',
      body: JSON.stringify({ document_id: documentId, job }),
    });
  }

  // Chat & Multi-Agent
  async getAgentsList() {
    return this.request<AgentInfo[]>('/agents/list');
  }

  async getAgentRuns() {
    return this.request<AgentRun[]>('/agents/runs');
  }

  async getChatSessions() {
    return this.request<ChatSession[]>('/chat/sessions');
  }

  async createChatSession(title: string, active_agent: string = 'orchestrator') {
    return this.request<ChatSession>('/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ title, active_agent }),
    });
  }

  async deleteChatSession(id: string) {
    return this.request<{ message: string }>(`/chat/sessions/${id}`, {
      method: 'DELETE',
    });
  }

  async getChatMessages(sessionId: string) {
    return this.request<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`);
  }

  async sendChatMessage(sessionId: string, content: string, targetAgentOverride?: string) {
    return this.request<{
      user_message: ChatMessage;
      assistant_message: ChatMessage;
      routed_agent: string;
      sources: any[];
    }>(`/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        target_agent_override: targetAgentOverride || null,
      }),
    });
  }

  // Reports
  async generateReport(options: {
    report_type: string;
    format?: string;
    include_sections?: Record<string, boolean>;
    project_id?: string;
  }) {
    return this.request<GeneratedReport>('/reports/generate', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  // Admin & Telemetry
  async getAdminUsers() {
    return this.request<User[]>('/admin/users');
  }

  async updateAdminUserRole(userId: string, role: string) {
    return this.request<{ message: string }>(`/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  }

  async resetUserPassword(userId: string) {
    return this.request<{ message: string; temporary_password: string }>(`/admin/users/${userId}/reset-password`, {
      method: 'POST',
    });
  }

  async updateUserStatus(userId: string, is_active: boolean) {
    return this.request<{ message: string }>(`/admin/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ is_active }),
    });
  }

  async getSystemHealth() {
    return this.request<SystemHealth>('/admin/system-health');
  }

  async getAdminTelemetry(): Promise<AdminTelemetry> {
    return this.request<AdminTelemetry>('/admin/telemetry');
  }

  async getAgentTelemetry(): Promise<AgentRun[]> {
    return this.request<AgentRun[]>('/admin/agent-telemetry');
  }
}

export const api = new ApiService();
