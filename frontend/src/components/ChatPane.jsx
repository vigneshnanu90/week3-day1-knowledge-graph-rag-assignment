import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Send,
  Bot,
  User,
  Code2,
  ExternalLink,
  Sparkles,
  GitFork,
  Loader2,
} from 'lucide-react';

const STARTER_PROMPTS = [
  'Which schemes give subsidies for solar pump sets or micro irrigation?',
  'What schemes require Chitta / Adangal and target small farmers?',
  'Compare farm machinery subsidy vs Kuruvai cultivation package.',
  'Are there any schemes for agriculture graduates or youth entrepreneurs?',
];

export default function ChatPane({ messages, onSendMessage, isLoading, onSelectSubgraph }) {
  const [input, setInput] = useState('');
  const [openCypherIdx, setOpenCypherIdx] = useState({});
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    onSendMessage(trimmed);
  };

  const toggleCypher = (idx) => {
    setOpenCypherIdx((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="flex h-full flex-col border-r border-slate-800 bg-slate-900">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/95 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">
              TN Govt Schemes GraphRAG Assistant
            </h1>
            <p className="text-xs text-slate-400">
              Agriculture & Farmers Welfare Dept · Powered by Neo4j AuraDB
            </p>
          </div>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-4 text-xs leading-relaxed text-slate-300">
              <div className="flex items-center gap-1.5 font-semibold text-sky-400 mb-1">
                <Sparkles className="h-4 w-4" />
                Ask across connected scheme entities
              </div>
              Query eligibility rules, subsidy percentages, beneficiary groups, and required
              documents. Every answer updates the live Knowledge Graph on the right.
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Try a sample query
              </p>
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => onSendMessage(prompt)}
                  className="block w-full rounded-xl border border-slate-800 bg-slate-800/40 px-3.5 py-2.5 text-left text-xs text-slate-200 transition hover:border-sky-500/50 hover:bg-slate-800"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-sky-600 text-white'
                    : 'border border-slate-800 bg-slate-800/80 text-slate-100'
                }`}
              >
                {msg.role === 'user' ? (
                  <p>{msg.content}</p>
                ) : (
                  <div className="space-y-3">
                    <div className="prose prose-invert prose-xs max-w-none space-y-2">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>

                    {/* Action Bar: Subgraph Focus & Cypher Trace */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-700/70 pt-2.5">
                      {msg.subgraph?.nodes?.length > 0 && (
                        <button
                          onClick={() => onSelectSubgraph(msg.subgraph)}
                          className="inline-flex items-center gap-1 rounded-lg bg-sky-500/15 border border-sky-500/30 px-2.5 py-1 text-[11px] font-medium text-sky-300 hover:bg-sky-500/25"
                        >
                          <GitFork className="h-3 w-3" />
                          Focus {msg.subgraph.nodes.length} Nodes
                        </button>
                      )}

                      {msg.generated_cypher && (
                        <button
                          onClick={() => toggleCypher(idx)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-700/60 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700"
                        >
                          <Code2 className="h-3 w-3" />
                          {openCypherIdx[idx] ? 'Hide Cypher' : 'View Cypher'}
                        </button>
                      )}
                    </div>

                    {openCypherIdx[idx] && msg.generated_cypher && (
                      <pre className="overflow-x-auto rounded-lg bg-slate-950 p-2.5 font-mono text-[11px] text-emerald-400 border border-slate-800">
                        {msg.generated_cypher}
                      </pre>
                    )}

                    {/* Official Portal Sources */}
                    {msg.sources?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {msg.sources.map((src, sIdx) => (
                          <a
                            key={sIdx}
                            href={src.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-slate-900/90 px-2 py-1 text-[10px] text-slate-300 hover:text-sky-400 border border-slate-700/60"
                          >
                            {src.title.slice(0, 38)}
                            {src.title.length > 38 ? '...' : ''}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-slate-200">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex items-center gap-2.5 text-xs text-slate-400 px-2">
            <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
            Traversing Neo4j Knowledge Graph & synthesizing answer...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Composer */}
      <form onSubmit={handleSubmit} className="border-t border-slate-800 bg-slate-900 p-3.5">
        <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 focus-within:border-sky-500">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about subsidies, eligibility, documents..."
            className="flex-1 bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="inline-flex items-center justify-center rounded-lg bg-sky-600 p-2 text-white transition hover:bg-sky-500 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}