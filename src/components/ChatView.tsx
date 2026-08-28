import React, { useState, useEffect, useRef } from 'react';
import {
  BotMessageSquare,
  Send,
  Sparkles,
  Plus,
  Trash2,
  BookOpen,
  FolderGit2,
  Briefcase,
  FileText,
  HeartHandshake,
  FileSpreadsheet,
  Cpu,
  Clock,
  ExternalLink,
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api } from '../services/api';
import { ChatSession, ChatMessage, AgentInfo } from '../types';

// The assistant (both the live AI responses, from whichever provider is configured, and the deterministic
// fallback templates) writes replies in Markdown - headings, **bold**,
// bullet lists. These overrides re-scale that down to the chat bubble's
// compact text size instead of react-markdown's browser-default heading
// sizes and margins, which would look oversized and out of place here.
const markdownComponents = {
  p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
  h1: ({ children }: any) => <h1 className="text-sm font-bold mb-1.5 mt-2 first:mt-0">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-sm font-bold mb-1.5 mt-2 first:mt-0">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 mb-1.5 mt-2 first:mt-0">{children}</h3>,
  ul: ({ children }: any) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }: any) => <li>{children}</li>,
  strong: ({ children }: any) => <strong className="font-semibold text-slate-900 dark:text-white">{children}</strong>,
  code: ({ children }: any) => <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-mono text-[11px]">{children}</code>,
  a: ({ children, href }: any) => <a href={href} target="_blank" rel="noreferrer" className="underline text-indigo-600 dark:text-indigo-400">{children}</a>,
};

export const ChatView: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [targetAgent, setTargetAgent] = useState<string>('orchestrator');
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const promptStarters = [
    { label: "GPA Forecast", query: "What mark do I need in my remaining assignments to reach my target GPA?", agent: "academic" },
    { label: "Scan My Project", query: "What technologies and testing were detected in my most recently registered project?", agent: "project" },
    { label: "Interview Coaching", query: "Generate 3 technical interview questions for the roles in my career profile.", agent: "career" },
    { label: "Syllabus Retrieval", query: "According to my uploaded syllabus, what is the weight of the midterm vs final capstone?", agent: "document" },
  ];

  const agentIcons: Record<string, React.ReactNode> = {
    orchestrator: <Cpu className="w-3.5 h-3.5 text-emerald-400" />,
    academic: <BookOpen className="w-3.5 h-3.5 text-blue-400" />,
    project: <FolderGit2 className="w-3.5 h-3.5 text-indigo-400" />,
    career: <Briefcase className="w-3.5 h-3.5 text-amber-400" />,
    document: <FileText className="w-3.5 h-3.5 text-purple-400" />,
    support: <HeartHandshake className="w-3.5 h-3.5 text-rose-400" />,
    report: <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />,
  };

  const loadSessions = async () => {
    try {
      const [sessList, agList] = await Promise.all([
        api.getChatSessions(),
        api.getAgentsList(),
      ]);
      setSessions(sessList);
      setAgents(agList);
      if (sessList.length > 0) {
        const active = sessList[0].id;
        setActiveSessionId(active);
        const msgs = await api.getChatMessages(active);
        setMessages(msgs);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSelectSession = async (id: string) => {
    setActiveSessionId(id);
    const msgs = await api.getChatMessages(id);
    setMessages(msgs);
  };

  const handleNewSession = async () => {
    const newSess = await api.createChatSession(`Academic Session #${sessions.length + 1}`, targetAgent);
    setSessions([newSess, ...sessions]);
    setActiveSessionId(newSess.id);
    setMessages([]);
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.deleteChatSession(id);
    const remaining = sessions.filter(s => s.id !== id);
    setSessions(remaining);
    if (remaining.length > 0) {
      handleSelectSession(remaining[0].id);
    } else {
      // No sessions left - clear the stale active id too, otherwise the
      // next send silently posts to a session that no longer exists.
      setActiveSessionId('');
      setMessages([]);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || inputText;
    if (!query.trim() || isLoading) return;

    setInputText('');
    setIsLoading(true);
    setSendError(null);

    // Optimistic user message
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      sender_agent: 'user',
      content: query,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      // If the last session was deleted there's nothing to post to yet -
      // start a fresh one before sending.
      let sessionId = activeSessionId;
      if (!sessionId) {
        const newSess = await api.createChatSession(`Academic Session #${sessions.length + 1}`, targetAgent);
        setSessions((prev) => [newSess, ...prev]);
        setActiveSessionId(newSess.id);
        sessionId = newSess.id;
      }

      const res = await api.sendChatMessage(
        sessionId,
        query,
        targetAgent === 'orchestrator' ? undefined : targetAgent
      );
      setMessages((prev) => [...prev.filter(m => m.id !== tempUserMsg.id), res.user_message, res.assistant_message]);
    } catch (err: any) {
      console.error(err);
      // Don't leave a phantom "sent" message with no reply and no
      // indication anything went wrong.
      setMessages((prev) => prev.filter(m => m.id !== tempUserMsg.id));
      setSendError(err?.message || 'Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="h-[calc(100vh-7.5rem)] flex flex-col md:flex-row rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
      {/* Left Column: Sessions List */}
      <div className="w-full md:w-64 border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3 flex flex-col justify-between shrink-0">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Chat Sessions</span>
            <button
              id="btn-new-chat-session"
              type="button"
              onClick={handleNewSession}
              className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs transition cursor-pointer shadow-xs"
              title="New Session"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {sessions.map((sess) => {
              const isSelected = sess.id === activeSessionId;
              return (
                <div
                  key={sess.id}
                  onClick={() => handleSelectSession(sess.id)}
                  className={`p-2.5 rounded-lg text-xs font-medium cursor-pointer transition flex items-center justify-between group ${
                    isSelected
                      ? 'bg-slate-900 dark:bg-slate-800 text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <BotMessageSquare className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`} />
                    <span className="truncate">{sess.title}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleDeleteSession(sess.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition p-0.5 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Multi-Agent status indicator */}
        <div className="p-2.5 rounded-lg bg-slate-900 dark:bg-slate-900/90 text-slate-300 text-[11px] border border-slate-800 space-y-1 shadow-xs">
          <div className="flex items-center justify-between text-indigo-400 font-semibold">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Keyword Router
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
          <p className="text-slate-400 text-[10px] leading-tight">
            Queries are dynamically classified and routed to the optimal specialized sub-agent.
          </p>
        </div>
      </div>

      {/* Right Column: Chat Dialogue Canvas */}
      <div className="flex-1 flex flex-col justify-between bg-white dark:bg-slate-900 text-slate-900 dark:text-white overflow-hidden transition-colors">
        {/* Agent Selector Bar */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center space-x-1.5 text-xs">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider whitespace-nowrap">Agent Target:</span>
            {agents.map((ag) => {
              const isSelected = targetAgent === ag.id;
              return (
                <button
                  key={ag.id}
                  type="button"
                  onClick={() => setTargetAgent(ag.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium flex items-center space-x-1.5 transition whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {agentIcons[ag.id] || <Sparkles className="w-3 h-3" />}
                  <span>{ag.name.replace(' Agent', '')}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-5 bg-slate-50/30 dark:bg-slate-950/20">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4 text-slate-500 dark:text-slate-400 py-8">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs">
                <BotMessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">How can UNiAGENT assist your studies today?</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Ask questions about academic graduation requirements, analyze code repositories, practice for technical interviews, or query uploaded syllabi.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full pt-2">
                {promptStarters.map((starter, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setTargetAgent(starter.agent);
                      handleSendMessage(starter.query);
                    }}
                    className="p-3 rounded-xl bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-left transition cursor-pointer shadow-xs"
                  >
                    <div className="text-indigo-600 dark:text-indigo-400 font-semibold text-[11px] flex items-center gap-1 mb-0.5">
                      {agentIcons[starter.agent]}
                      <span>{starter.label}</span>
                    </div>
                    <div className="text-[11px] text-slate-700 dark:text-slate-300 line-clamp-2">
                      "{starter.query}"
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start space-x-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-1">
                      {agentIcons[msg.sender_agent] || <Sparkles className="w-4 h-4" />}
                    </div>
                  )}

                  <div
                    className={`max-w-2xl rounded-xl p-4 text-xs leading-relaxed ${
                      isUser
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 shadow-xs'
                    }`}
                  >
                    {/* Header with agent badge & latency */}
                    {!isUser && (
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-700/60 text-[10px]">
                        <span className="font-mono uppercase font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                          {agentIcons[msg.sender_agent]}
                          <span>{msg.sender_agent.toUpperCase()} AGENT</span>
                        </span>
                        <div className="flex items-center space-x-3 text-slate-400 font-mono">
                          {msg.latency_ms && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {msg.latency_ms}ms
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.content, msg.id)}
                            className="hover:text-slate-700 dark:hover:text-slate-200 transition flex items-center gap-0.5 cursor-pointer"
                          >
                            {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="font-sans text-xs">
                      {isUser ? (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      ) : (
                        <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
                      )}
                    </div>

                    {/* Source Citations */}
                    {msg.sources_json && msg.sources_json.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Grounded Citations:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources_json.map((src, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 font-mono border border-slate-200 dark:border-slate-700"
                            >
                              {src.title} {src.match_score ? `(${(src.match_score * 100).toFixed(0)}% match)` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {isLoading && (
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-2 shadow-xs">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                <span>Routing to the right agent and generating a response...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 md:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {sendError && (
            <div className="mb-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 text-xs">
              {sendError}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder={`Message ${targetAgent === 'orchestrator' ? 'UNiAGENT Multi-Agent System' : `${targetAgent.toUpperCase()} Agent`}...`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={isLoading || !inputText.trim()}
              className="p-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition disabled:opacity-40 cursor-pointer shadow-xs"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
