import { useState, type FormEvent } from "react";
import { ExternalLink, MessageSquare, Send, Trash2 } from "lucide-react";
import { enqueueSequential, fetchJsonWithBackoff } from "../lib/apiClient.ts";
import type { AuditReport, ChatMessage, ChatSource } from "../types/audit.ts";

interface GeminiChatbotProps {
  report: AuditReport | null;
}

const DEFAULT_PROMPTS = [
  "What makes an 'eco-friendly' claim deceptive under CCPA & ASCI?",
  "Which metrics are mandatory in SEBI BRSR Principle 6?",
  "How does the EU Green Claims Directive treat carbon-neutral offsets?",
];

export function GeminiChatbot({ report }: GeminiChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const suggestedPrompts = report
    ? [
        `Verify the latest sustainability filings and greenwashing news for ${report.company}.`,
        `How could ${report.company} rewrite this claim to comply with ${report.jurisdictionLabel}?`,
        "Explain why the detected Category A buzzwords lowered the Evidence Strength Index.",
      ]
    : DEFAULT_PROMPTS;

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isSending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setChatError(null);
    setRetryNotice(null);
    setIsSending(true);

    try {
      const result = await enqueueSequential(() =>
        fetchJsonWithBackoff<{ reply: string; sources?: ChatSource[] }>(
          "/api/chat",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: nextMessages.map((m) => ({ role: m.role, text: m.text })),
              auditContext: report
                ? {
                    company: report.company,
                    claim: report.claim,
                    jurisdictionLabel: report.jurisdictionLabel,
                    evidenceStrengthIndex: report.evidenceStrengthIndex,
                    overallVerdict: report.overallVerdict,
                    categoryAMatches: report.point1.categoryAMatches.map((b) => b.term),
                    categoryBMatches: report.point1.categoryBMatches.map((m) => m.matchedText),
                    watchdogTitles: report.point4.records.map((r) => r.title),
                  }
                : null,
            }),
          },
          {
            maxRetries: 3,
            baseDelayMs: 2000,
            onRetry: (attempt, maxRetries, delayMs) => {
              setRetryNotice(
                `Rate limit reached — retrying automatically in ${Math.round(
                  delayMs / 1000
                )}s (attempt ${attempt}/${maxRetries})...`
              );
            },
          }
        )
      );

      setRetryNotice(null);

      if (!result.ok || !result.data) {
        if (result.rateLimited) {
          const fallbackMsg: ChatMessage = {
            id: `model-${Date.now()}`,
            role: "model",
            text: "The live AI assistant temporarily hit its API quota limit after automatic retries. Please review the verified corporate disclosures and statutory breakdown shown in the report, or try again in a few moments.",
          };
          setMessages((prev) => [...prev, fallbackMsg]);
          return;
        }
        throw new Error(result.errorText || `Assistant error (${result.status})`);
      }

      const modelMsg: ChatMessage = {
        id: `model-${Date.now()}`,
        role: "model",
        text: result.data.reply,
        sources: Array.isArray(result.data.sources) ? result.data.sources : [],
      };
      setMessages((prev) => [...prev, modelMsg]);
    } catch (err) {
      setRetryNotice(null);
      setChatError(
        err instanceof Error ? err.message : "Unable to reach the Gemini research assistant."
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  return (
    <section
      id="ai-assistant"
      aria-label="VeriClaim AI Research Assistant"
      className="border border-neutral-200 dark:border-neutral-800 rounded-md bg-white dark:bg-neutral-950 flex flex-col lg:max-h-[calc(100vh-3rem)]"
    >
      <div className="p-4 lg:p-5 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-500 dark:text-neutral-400">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Search-Grounded Research Assistant</span>
          </div>
          <h2 className="text-base lg:text-lg font-semibold tracking-tight text-neutral-950 dark:text-neutral-100">
            Ask VeriClaim AI
          </h2>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
            Ask follow-up questions about sustainability claims, SEBI BRSR Principle 6 disclosures, EU/FTC rules, or live news verification using Gemini with Google Search grounding.
          </p>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setChatError(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-300 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Clear Chat</span>
          </button>
        )}
      </div>

      <div className="p-4 lg:p-5 flex-1 min-h-0 flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="space-y-2.5 overflow-y-auto pr-1">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Suggested research prompts:
            </div>
            <div className="flex flex-col gap-2">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                  disabled={isSending}
                  className="text-left px-3 py-2 text-xs border border-neutral-200 dark:border-neutral-800 rounded text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors duration-150 cursor-pointer leading-relaxed"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 flex-1 min-h-[160px] max-h-[380px] lg:max-h-none overflow-y-auto pr-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`border rounded p-3 space-y-2 ${
                  msg.role === "user"
                    ? "border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/60"
                    : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
                }`}
              >
                <div className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                  {msg.role === "user" ? "You" : "VeriClaim AI"}
                </div>
                <div className="text-xs lg:text-sm text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap leading-relaxed">
                  {msg.text}
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center gap-2.5">
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Sources:
                    </span>
                    {msg.sources.map((src, idx) => (
                      <a
                        key={`${src.url}-${idx}`}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-neutral-100 underline underline-offset-2"
                      >
                        <span className="truncate max-w-[190px]">{src.title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isSending && (
              <div className="border border-neutral-200 dark:border-neutral-800 rounded p-3 text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                {retryNotice || "Searching public records and verifying response..."}
              </div>
            )}
          </div>
        )}

        {retryNotice && !isSending && (
          <div
            aria-live="polite"
            className="border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 text-neutral-700 dark:text-neutral-300 rounded px-3 py-2 text-xs shrink-0"
          >
            {retryNotice}
          </div>
        )}

        {chatError && (
          <div
            role="alert"
            className="border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-300 rounded px-3 py-2 text-xs shrink-0"
          >
            {chatError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-1 shrink-0">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              report
                ? `Ask a follow-up about ${report.company}...`
                : "Ask about a sustainability claim..."
            }
            aria-label="Ask VeriClaim AI"
            className="flex-1 min-w-0 px-3 py-2 text-xs lg:text-sm bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded text-neutral-950 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-950 dark:focus:ring-neutral-200"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs lg:text-sm font-medium bg-neutral-950 text-white dark:bg-neutral-100 dark:text-neutral-950 rounded hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{isSending ? "Sending..." : "Ask AI"}</span>
          </button>
        </form>
      </div>
    </section>
  );
}
