export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'student' | 'admin' | 'advisor';
  is_active: boolean;
}

export interface Student {
  id: string;
  user_id: string;
  student_number: string;
  university: string;
  degree: string;
  major: string;
  year_of_study: number;
  gpa: number;
  target_gpa: number;
  credits_earned: number;
  credits_required: number;
  status: string;
}

export interface Module {
  id: string;
  code: string;
  name: string;
  credits: number;
  semester: string;
  year: number;
  lecturer?: string;
  status: 'completed' | 'in_progress' | 'planned';
  target_mark: number;
  final_mark?: number;
  grade?: string;
  is_distinction: boolean;
  syllabus_summary?: string;
}

export interface AcademicStats {
  gpa: number;
  target_gpa: number;
  credits_earned: number;
  credits_required: number;
  average_mark: number;
  total_modules: number;
  completed_modules: number;
  in_progress_modules: number;
  planned_modules: number;
  distinctions: number;
  distinction_rate_percent: number;
  trends: {
    semester: string;
    average: number;
    credits: number;
  }[];
}

export interface ProjectMetrics {
  file_count: number;
  total_lines_of_code: number;
  detected_languages: string[];
  detected_frameworks?: string[];
  has_docker: boolean;
  has_tests: boolean;
  has_database?: boolean;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  repository_url?: string;
  live_url?: string | null;
  project_type: string;
  status: string;
  analysis_summary?: string;
  technologies: string[];
  architecture?: string;
  main_features: string[];
  functionality?: string;
  database_info?: string;
  api_info?: string;
  frontend_info?: string;
  backend_info?: string;
  ai_components?: string;
  security_info?: string;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  skills_demonstrated: string[];
  career_value?: string;
  professional_summary?: string;
  code_metrics?: ProjectMetrics;
  created_at?: string;
}

export interface UploadedDocChunk {
  chunk_index: number;
  content: string;
  token_count: number;
  match_score?: number;
}

export interface UploadedDoc {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  total_chunks: number;
  document_type: string;
  status: string;
  created_at?: string;
  chunks?: UploadedDocChunk[];
}

export interface Skill {
  id: string;
  name: string;
  category: 'technical' | 'soft' | 'domain' | 'tool';
  proficiency_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  proficiency_percent: number;
  verified?: boolean;
  source?: string;
}

export interface CareerProfile {
  target_roles: string[];
  desired_industries: string[];
  preferred_locations: string[];
  target_salary_range?: string;
  bio?: string;
  linkedin_url?: string;
  github_url?: string;
  career_readiness_score: number;
}

export interface Internship {
  id: string;
  company_name: string;
  role_title: string;
  status: 'wishlist' | 'applied' | 'interviewing' | 'offered' | 'rejected' | 'accepted' | 'completed';
  location: string;
  notes?: string;
  salary_stipend?: string;
  deadline?: string;
  created_at?: string;
  application_url?: string;
  cover_letter?: string;
  source?: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  status?: string;
  tools?: string[];
  capabilities: string[];
}

export interface ChatMessageSource {
  type: string;
  title: string;
  match_score?: number;
  chunk_index?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  sender_agent: string;
  content: string;
  sources_json?: ChatMessageSource[];
  latency_ms?: number;
  tokens_used?: number;
  created_at?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  active_agent: string;
  created_at: string;
  updated_at: string;
  messages?: ChatMessage[];
}

export interface AgentRun {
  id: string;
  agent_name: string;
  status: string;
  input_prompt: string;
  output_result?: string;
  duration_ms: number;
  created_at: string;
}

export interface GeneratedReport {
  title: string;
  report_type: string;
  content: string;
  markdown_content?: string;
  metadata?: Record<string, any>;
}

export interface AdminTelemetry {
  total_users: number;
  active_students: number;
  projects_scanned: number;
  vector_embeddings_stored: number;
  chat_sessions: number;
  agent_runs_logged: number;
  system_health?: SystemHealth;
}

export interface SystemHealth {
  status: string;
  database: string;
  checkpointer: string;
  multi_agent_system: string;
  total_users: number;
  total_students: number;
  total_projects: number;
  total_documents: number;
  total_agent_runs: number;
}

// Quiz prep - a question here never carries the correct answer or
// explanation; those only come back from the server after submitting,
// so taking a quiz can't be gamed by reading the network response.
export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface Quiz {
  id: string;
  module_id: string;
  module_code: string;
  module_name: string;
  topic: string;
  source: 'documents' | 'topic_only';
  created_at: string;
  questions: QuizQuestion[];
}

export interface QuizListItem {
  id: string;
  module_id: string;
  module_code: string;
  module_name: string;
  topic: string;
  question_count: number;
  source: 'documents' | 'topic_only';
  created_at: string;
}

export interface QuizGenerateResponse {
  ai_configured: boolean;
  quiz: Quiz | null;
  message: string;
}

export interface QuizAnswerResult {
  question_id: string;
  question: string;
  options: string[];
  selected_index: number | null;
  correct_index: number;
  correct: boolean;
  explanation: string;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  module_id: string;
  module_code: string;
  module_name: string;
  topic: string;
  source: 'documents' | 'topic_only';
  score: number;
  total: number;
  percentage: number;
  taken_at: string;
  results: QuizAnswerResult[];
}

// Job search - real, currently-open postings from a free public job board
// API. See server.ts for the honest-search and no-fabrication rules.
export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  tags: string[];
  job_types: string[];
  description: string;
  url: string;
  posted_at: string | null;
  source: string;
  match_score?: number;
}

export interface JobSearchResponse {
  query: string;
  remote_only: boolean;
  total_matches: number;
  results: JobListing[];
  source: string;
}

export interface CoverLetterResponse {
  ai_configured: boolean;
  cover_letter: string | null;
  message: string;
}

// CV match - a student's uploaded CV compared against one job's real
// description. Grounded strictly in the CV's actual extracted text.
export interface CvMatchResult {
  match_summary: string;
  strengths: string[];
  gaps: string[];
  missing_keywords: string[];
  suggested_edits: string[];
}

export interface CvMatchResponse {
  ai_configured: boolean;
  result: CvMatchResult | null;
  message: string;
}
