import { useState, useEffect, useRef } from 'preact/hooks';
import * as preact from 'preact';
import { memo } from 'preact/compat';
import { signal, computed, effect } from '@preact/signals';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState } from '@/components/relay/EmptyState';
import { SecurityBadge } from '@/components/relay/SecurityBadge';
import { Bot, Send, Loader2, ChevronLeft, Info, Globe, FileText, BookOpen, CheckCircle2 } from 'lucide-react';
import { showToast, edges, sendMessage, conversations, saveLocalAIConversation } from '../state';
import { getOrCreateRelayAIEdge } from '../state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Conversation } from '../../types';

// Router URL (from environment or fallback)
const RELAY_AI_ROUTER_URL = import.meta.env.VITE_RELAY_AI_ROUTER_URL || 'https://ai.rlymsg.com';

// Model availability interface
interface ModelAvailability {
  model_id: string;
  model_name: string;
  display_name: string;
  description: string;
  is_available: boolean;
  operator_count: number;
  avg_response_time_ms: number | null;
  provider_family: string;
  supports_streaming?: boolean; // NEW: streaming capability
  context_length?: number; // NEW: model context window
}

// Special "Auto" model that lets the router decide
const AUTO_MODEL: ModelAvailability = {
  model_id: 'auto',
  model_name: 'auto',
  display_name: 'Auto',
  description: 'Let Relay automatically select the best available model',
  is_available: true,
  operator_count: 0,
  avg_response_time_ms: null,
  provider_family: 'relay',
  supports_streaming: true, // Auto mode supports streaming if selected model does
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  model?: string;
  isE2EE: boolean;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latency?: number;
  timeToFirstToken?: number; // NEW: time from request to first token (thinking time)
  isStreaming?: boolean; // NEW: indicates message is actively streaming
  streamStartTime?: number; // NEW: for calculating live tok/s
}

// Available models signal (populated from router)
export const availableModels = signal<ModelAvailability[]>([]);
export const selectedModel = signal<string>('auto'); // Default to Auto

// Conversation ID for this chat session (null until first message sent)
export const aiConversationId = signal<string | null>(null);

// Messages for current conversation
export const aiMessages = signal<Message[]>([]);

// ── Tool status during inference ──────────────────────────────────────────
interface ToolStatus {
  tool: string;   // 'web_search' | 'fetch_content' | 'deep_search'
  detail: string; // query / URL / etc.
  phase: 'running' | 'complete';
}
export const aiToolStatus = signal<ToolStatus | null>(null);

// Map tool names to human-readable labels and icons
const TOOL_UI: Record<string, { label: string; icon: preact.JSX.Element; color: string }> = {
  web_search:    { label: 'Searching',        icon: <Globe className="w-3.5 h-3.5" />,    color: 'text-blue-400' },
  fetch_content: { label: 'Reading page',     icon: <FileText className="w-3.5 h-3.5" />, color: 'text-purple-400' },
  deep_search:   { label: 'Researching',      icon: <BookOpen className="w-3.5 h-3.5" />, color: 'text-emerald-400' },
};

// Spinner that never re-renders after mount — zero props means memo() never invalidates it,
// so the CSS animation runs continuously without ever resetting mid-spin.
const PersistentSpinner = memo(function PersistentSpinner({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <Loader2
      class={size === 'md' ? 'w-4 h-4 opacity-80' : 'w-3 h-3 opacity-60'}
      style={{ animation: 'spin 1s linear infinite', willChange: 'transform', flexShrink: 0 }}
    />
  );
});

// Wrap in memo so parent re-renders from token streaming never touch this component.
// It re-renders only when aiToolStatus signal changes (2× per tool call).
const ToolStatusIndicator = memo(function ToolStatusIndicator() {
  // Read signal directly — this component only re-renders when aiToolStatus changes,
  // NOT on every streaming token from the parent. The spinner is isolated in PersistentSpinner.
  const status = aiToolStatus.value;
  const ui = status ? TOOL_UI[status.tool] : null;

  if (!status || !ui) {
    // Default: generic thinking state
    return (
      <div class="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
        <PersistentSpinner size="md" />
        <span class="text-sm">Thinking…</span>
      </div>
    );
  }

  if (status.phase === 'complete') {
    return (
      <div class="flex items-start gap-2">
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[hsl(var(--muted))/30] border border-[hsl(var(--border))] text-xs text-emerald-400">
          <CheckCircle2 class="w-3.5 h-3.5 flex-shrink-0" />
          <span>Got results — generating response…</span>
          <PersistentSpinner />
        </div>
      </div>
    );
  }

  // phase === 'running'
  const truncated = status.detail.length > 48
    ? status.detail.slice(0, 48) + '…'
    : status.detail;

  return (
    <div class="flex items-start gap-2">
      <div class={`flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[hsl(var(--muted))/30] border border-[hsl(var(--border))] text-xs ${ui.color}`}>
        <span class="flex-shrink-0 animate-pulse">{ui.icon}</span>
        <span class="font-medium">{ui.label}</span>
        {truncated && (
          <span class="text-[hsl(var(--muted-foreground))] truncate max-w-[180px]">“{truncated}”</span>
        )}
        <PersistentSpinner />
      </div>
    </div>
  );
});

// Token tracking for context management
export const totalContextTokens = signal<number>(0);

// Estimate tokens from text (rough approximation: ~4 chars per token)
const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

// Calculate total tokens in conversation
const calculateTotalTokens = (msgs: Message[]): number => {
  return msgs.reduce((total, msg) => {
    return total + (msg.totalTokens || estimateTokens(msg.content));
  }, 0);
};

// Context squishing: Remove oldest message pairs when approaching limit
const squishContext = (msgs: Message[], contextLimit: number): Message[] => {
  const totalTokens = calculateTotalTokens(msgs);
  const threshold = contextLimit * 0.8; // Start squishing at 80%
  
  if (totalTokens <= threshold) {
    return msgs; // No squishing needed
  }
  
  console.log(`[AI Chat] Context squishing: ${totalTokens} tokens > ${threshold} threshold (limit: ${contextLimit})`);
  
  // Keep first user message (important context) and last N messages
  const firstUserIndex = msgs.findIndex(m => m.role === 'user');
  if (firstUserIndex === -1) return msgs;
  
  const firstUserMessage = msgs[firstUserIndex];
  const firstUserTokens = firstUserMessage.totalTokens || estimateTokens(firstUserMessage.content);
  
  // Calculate how many recent messages we can keep
  let recentTokens = 0;
  let recentCount = 0;
  
  for (let i = msgs.length - 1; i >= 0; i--) {
    const msgTokens = msgs[i].totalTokens || estimateTokens(msgs[i].content);
    if (recentTokens + msgTokens + firstUserTokens > threshold) {
      break;
    }
    recentTokens += msgTokens;
    recentCount++;
  }
  
  const recentMessages = msgs.slice(-recentCount);
  
  // Check if first message is already in recent
  const firstIsInRecent = recentMessages.some(m => m.id === firstUserMessage.id);
  
  const squished = firstIsInRecent 
    ? recentMessages 
    : [firstUserMessage, ...recentMessages];
  
  const removedCount = msgs.length - squished.length;
  console.log(`[AI Chat] Squished ${removedCount} messages, kept ${squished.length} (${calculateTotalTokens(squished)} tokens)`);
  
  return squished;
};

// Persist conversation to chrome.storage.sync (cross-device persistence)
const saveConversation = async (conversationId: string, msgs: Message[]) => {
  if (!conversationId) return;
  
  try {
    await chrome.storage.sync.set({
      [`ai_conversation_${conversationId}`]: {
        id: conversationId,
        messages: msgs.map(m => ({
          ...m,
          timestamp: m.timestamp.toISOString(),
        })),
        model: selectedModel.value,
        updatedAt: new Date().toISOString(),
      },
    });
    console.log(`[AI Chat] Saved conversation ${conversationId} with ${msgs.length} messages to sync storage`);
  } catch (err) {
    console.warn('[AI Chat] Failed to persist conversation:', err);
  }
};

// Load conversation from chrome.storage.sync (exported for ConversationDetailView)
export const loadConversation = async (conversationId: string): Promise<Message[]> => {
  if (!conversationId) return [];
  
  try {
    const result = await chrome.storage.sync.get(`ai_conversation_${conversationId}`);
    const data = result[`ai_conversation_${conversationId}`];
    if (data?.messages) {
      console.log(`[AI Chat] Loaded conversation ${conversationId} with ${data.messages.length} messages from sync storage`);
      return data.messages.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
    }
  } catch (err) {
    console.warn('[AI Chat] Failed to load conversation:', err);
  }
  return [];
};

// Load conversation when conversationId changes
effect(() => {
  const convId = aiConversationId.value;
  if (convId && aiMessages.value.length === 0) {
    // Call async function inside effect (not awaited)
    loadConversation(convId).then(msgs => {
      if (msgs.length > 0) {
        aiMessages.value = msgs;
        console.log(`[AI Chat] Restored ${msgs.length} messages from sync storage`);
      }
    });
  }
});

// ============================================
// Markdown Rendering (real-time, works during streaming)
// ============================================

function renderMarkdown(text: string): preact.JSX.Element {
  if (!text) return <></>;

  // Split by fenced code blocks first
  const parts: Array<{ type: 'text' | 'codeblock'; content: string; language?: string }> = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'codeblock', content: match[2].trimEnd(), language: match[1] || undefined });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'codeblock') {
          return (
            <pre key={i} className="my-2 rounded-lg bg-black/40 border border-white/10 overflow-x-auto">
              {part.language && (
                <div className="px-3 py-1 text-[11px] font-mono text-white/40 border-b border-white/10">{part.language}</div>
              )}
              <code className="block p-3 text-[13px] font-mono leading-relaxed text-white/90 whitespace-pre">{part.content}</code>
            </pre>
          );
        }
        return <span key={i}>{renderInlineMarkdown(part.content)}</span>;
      })}
    </>
  );
}

function renderInlineMarkdown(text: string): preact.JSX.Element {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, lineIndex) => {
        // Numbered list
        const numberedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
        if (numberedMatch) {
          return (
            <div key={lineIndex} className="flex gap-2 my-0.5" style={{ paddingLeft: `${numberedMatch[1].length * 8}px` }}>
              <span className="text-[hsl(var(--muted-foreground))] min-w-[1.2em] text-right">{numberedMatch[2]}.</span>
              <span>{processInlineFormatting(numberedMatch[3])}</span>
            </div>
          );
        }

        // Bullet list
        const bulletMatch = line.match(/^(\s*)[•\-\*]\s+(.*)$/);
        if (bulletMatch) {
          return (
            <div key={lineIndex} className="flex gap-2 my-0.5" style={{ paddingLeft: `${bulletMatch[1].length * 8}px` }}>
              <span className="text-[hsl(var(--muted-foreground))] mt-0.5">•</span>
              <span>{processInlineFormatting(bulletMatch[2])}</span>
            </div>
          );
        }

        // Heading (### ## #)
        const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const cls = level === 1
            ? 'text-base font-bold mt-2 mb-1'
            : level === 2
            ? 'text-sm font-semibold mt-1.5 mb-0.5'
            : 'text-sm font-medium mt-1 mb-0.5';
          return <div key={lineIndex} className={cls}>{processInlineFormatting(headingMatch[2])}</div>;
        }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
          return <hr key={lineIndex} className="my-2 border-white/10" />;
        }

        // Regular line
        return (
          <span key={lineIndex}>
            {processInlineFormatting(line)}
            {lineIndex < lines.length - 1 && <br />}
          </span>
        );
      })}
    </>
  );
}

function processInlineFormatting(text: string): preact.JSX.Element {
  // Encode inline formatting to tokens
  let s = text;
  s = s.replace(/\*\*(.+?)\*\*/g, (_, c) => `\x00B${c}\x00`);
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, c) => `\x00I${c}\x00`);
  s = s.replace(/`([^`]+)`/g, (_, c) => `\x00C${c}\x00`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `\x00L${t}\x01${u}\x00`);

  // Split using capture group so format tokens retain their \x00 prefix —
  // plain text segments can never be mistaken for format tokens.
  const tokens = s.split(/(\x00[BICL][^\x00]*\x00)/);
  return (
    <>
      {tokens.map((token, i) => {
        if (token.startsWith('\x00B')) return <strong key={i}>{token.slice(2, -1)}</strong>;
        if (token.startsWith('\x00I')) return <em key={i}>{token.slice(2, -1)}</em>;
        if (token.startsWith('\x00C')) return <code key={i} className="px-1 py-0.5 rounded bg-black/30 text-[12px] font-mono text-sky-300">{token.slice(2, -1)}</code>;
        if (token.startsWith('\x00L')) {
          const [linkText, url] = token.slice(2, -1).split('\x01');
          return <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-sky-400 underline hover:text-sky-300">{linkText}</a>;
        }
        return <span key={i}>{token}</span>;
      })}
    </>
  );
}

// Computed: Available models
const MODELS = computed(() => availableModels.value);

// Curated list of top models to show in dropdown (based on popularity and quality)
const CURATED_MODELS = [
  'auto', // Always show Auto first
  'llama3.2',
  'llama3.1',
  'deepseek-r1',
  'qwen2.5-coder',
  'mistral',
  'gemma2',
  'phi4',
  'qwen2.5',
];

// Computed: Curated models only (for dropdown), filtered to online only
const curatedModels = computed(() => {
  const all = [AUTO_MODEL, ...availableModels.value]; // Add Auto to the list
  
  // Filter to curated models (show all, regardless of availability)
  const curated = all.filter(m => CURATED_MODELS.includes(m.model_name));
  
  // Sort: Auto first, then by availability, then by curated list order
  return curated.sort((a, b) => {
    if (a.model_name === 'auto') return -1;
    if (b.model_name === 'auto') return 1;
    if (a.is_available && !b.is_available) return -1;
    if (!a.is_available && b.is_available) return 1;
    return CURATED_MODELS.indexOf(a.model_name) - CURATED_MODELS.indexOf(b.model_name);
  });
});

// Computed: Selected model data
const selectedModelData = computed(() => {
  const selected = selectedModel.value;
  
  // Check if Auto is selected
  if (selected === 'auto') {
    return AUTO_MODEL;
  }
  
  // Otherwise find in available models
  const models = MODELS.value;
  return models.find(m => m.model_name === selected) || AUTO_MODEL;
});

interface AIChatViewProps {
  onBack?: () => void;
  /** Custom title shown in the header instead of "AI Chat" (e.g. conversation name from Inbox) */
  conversationTitle?: string;
  /** Pre-load a specific conversation by ID (used when opening from Inbox) */
  initialConversationId?: string;
}

export function AIChatView({ onBack, conversationTitle, initialConversationId }: AIChatViewProps) {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showBrowseModal, setShowBrowseModal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // When opened from Inbox with a specific conversation, load it into the AI chat signals
  useEffect(() => {
    if (initialConversationId && aiConversationId.value !== initialConversationId) {
      aiMessages.value = []; // Clear so the module-level effect re-fetches
      aiConversationId.value = initialConversationId;
    }
  }, [initialConversationId]);

  // Load model availability on mount
  useEffect(() => {
    loadModelAvailability();
    
    // Poll availability every 10 seconds
    const interval = setInterval(loadModelAvailability, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [aiMessages.value]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSendMessage() {
    if (!prompt.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt.trim(),
      timestamp: new Date(),
      isE2EE: true,
    };

    // Display optimistically but DON'T add to history yet (will be included in request)
    const displayMessages = [...aiMessages.value, userMessage];
    aiMessages.value = displayMessages;
    
    setPrompt('');
    setIsLoading(true);
    aiToolStatus.value = null; // Clear any previous tool status

    try {
      // Don't create assistant message yet - wait for first token
      // This keeps the "Thinking..." spinner visible

      // Send E2EE AI request - history already includes userMessage from above
      const startTime = Date.now();
      const response = await sendE2EEAIRequest({
        model: selectedModel.value,
        prompt: userMessage.content,
      });
      const latency = Date.now() - startTime;

      // Find the assistant message (may have been created during streaming)
      const lastMessage = aiMessages.value[aiMessages.value.length - 1];
      const assistantMessageExists = lastMessage?.role === 'assistant';

      if (assistantMessageExists) {
        // Update existing assistant message with final metadata
        aiMessages.value = aiMessages.value.map((msg, idx) => 
          idx === aiMessages.value.length - 1
            ? {
                ...msg,
                content: response.content,
                model: response.model,
                promptTokens: response.promptTokens,
                completionTokens: response.completionTokens,
                totalTokens: response.tokensUsed,
                latency: response.latency || latency,
                timeToFirstToken: response.timeToFirstToken, // Preserve thinking time
                isStreaming: false, // Clear streaming flag
                streamStartTime: undefined,
              }
            : msg
        );
      } else {
        // Create assistant message (non-streaming case)
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.content,
          timestamp: new Date(),
          model: response.model,
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens,
          totalTokens: response.tokensUsed,
          latency: response.latency || latency,
          isE2EE: true,
        };
        aiMessages.value = [...aiMessages.value, assistantMessage];
      }
      
      // Update token count for context wheel
      totalContextTokens.value = calculateTotalTokens(aiMessages.value);
      
      // Persist conversation to storage
      const convId = aiConversationId.value;
      if (convId) {
        await saveConversation(convId, aiMessages.value);
        
        // Update conversation in inbox (title and preview)
        await createAIConversation(convId, selectedModel.value, response.model || 'unknown');
      }
    } catch (error) {
      console.error('Failed to send AI request:', error);
      showToast(error instanceof Error ? error.message : 'Failed to send AI request');
      
      // Remove the user message if request failed
      aiMessages.value = aiMessages.value.filter(msg => msg.id !== userMessage.id);
    } finally {
      setIsLoading(false);
      aiToolStatus.value = null; // Always clear on completion
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  function clearHistory() {
    aiMessages.value = [];
    aiConversationId.value = null;
    showToast('Chat history cleared');
  }

  const selectedModelInfo = selectedModelData.value;
  const models = curatedModels.value; // Use curated list for dropdown

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--background))]">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors mb-3 bg-transparent border-none p-0 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        )}
        
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
              {conversationTitle ?? 'AI Chat'}
            </h2>
            <SecurityBadge level="e2ee" variant="solid" size="sm" />
          </div>
          <div className="flex items-center gap-2">
            {aiMessages.value.length > 0 && (
              <ContextWheel 
                currentTokens={totalContextTokens.value}
                maxTokens={8192}
                messageCount={aiMessages.value.length}
              />
            )}
          </div>
        </div>

        {/* Model selection dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-[hsl(var(--muted-foreground))]">Model:</label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="justify-between min-w-[200px]">
                <span className="text-sm font-medium">
                  {selectedModelInfo ? selectedModelInfo.display_name : 'Select model...'}
                </span>
                {selectedModelInfo && selectedModelInfo.is_available && (
                  <span className="ml-2 text-xs text-green-600">●</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[300px] max-h-[400px] overflow-y-auto">
              {models.length === 0 && (
                <div className="px-2 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                  Loading models...
                </div>
              )}
              {models.map((model) => (
                <DropdownMenuItem
                  key={model.model_id}
                  onClick={() => model.is_available ? (selectedModel.value = model.model_name) : null}
                  disabled={!model.is_available}
                  className={cn(
                    "cursor-pointer",
                    !model.is_available && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="flex flex-col gap-0.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{model.display_name}</span>
                      {model.is_available ? (
                        <span className="text-xs text-green-600">●</span>
                      ) : (
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">Offline</span>
                      )}
                    </div>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">{model.description}</span>
                  </div>
                </DropdownMenuItem>
              ))}
              
              {/* Browse All Models Button */}
              {models.length > 0 && (
                <>
                  <div className="my-1 border-t border-[hsl(var(--border))]"></div>
                  <DropdownMenuItem
                    onClick={() => setShowBrowseModal(true)}
                    className="cursor-pointer font-medium text-primary"
                  >
                    <div className="flex items-center gap-2 w-full justify-center">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                      <span>Browse All Models ({availableModels.value.length})</span>
                    </div>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {aiMessages.value.length === 0 ? (
          <EmptyState
            icon={<Bot className="w-12 h-12" />}
            title="Start a Conversation"
            description="Ask anything. Your messages are end-to-end encrypted and routed through zero-knowledge relays."
          />
        ) : (
          aiMessages.value.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        {isLoading && !aiMessages.value.some(m => m.isStreaming) && (
          <ToolStatusIndicator />
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 flex items-center gap-3 p-4 bg-[hsl(var(--card))] border-t border-[hsl(var(--border))]">
        <textarea
          ref={inputRef}
          className="flex-1 px-3 py-2 text-sm bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md resize-none max-h-32 min-h-10 leading-normal text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] transition-colors"
          placeholder="Type a message..."
          rows={1}
          value={prompt}
          onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <Button
          variant="accent"
          size="icon"
          onClick={handleSendMessage}
          disabled={!prompt.trim() || isLoading}
          aria-label="Send message"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
      
      {/* Browse All Models Modal */}
      {showBrowseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowBrowseModal(false)}>
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="border-b border-[hsl(var(--border))] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">All Available Models</h2>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                    {availableModels.value.length} models • {availableModels.value.filter(m => m.is_available).length} online
                  </p>
                </div>
                <button
                  onClick={() => setShowBrowseModal(false)}
                  className="p-1.5 hover:bg-[hsl(var(--accent))] rounded transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                {availableModels.value.map((model) => (
                  <div
                    key={model.model_id}
                    onClick={() => {
                      if (model.is_available) {
                        selectedModel.value = model.model_name;
                        setShowBrowseModal(false);
                      }
                    }}
                    className={cn(
                      "p-3 border rounded-lg transition-all",
                      model.is_available 
                        ? "cursor-pointer border-[hsl(var(--border))] hover:border-primary hover:shadow-md" 
                        : "opacity-50 cursor-not-allowed border-[hsl(var(--border))]",
                      selectedModel.value === model.model_name && "border-primary bg-primary/5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-sm text-[hsl(var(--foreground))]">{model.display_name}</span>
                          {model.is_available ? (
                            <span className="text-xs text-green-600 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-green-600 rounded-full"></span>
                              {model.operator_count} online
                            </span>
                          ) : (
                            <span className="text-xs text-[hsl(var(--muted-foreground))]">Offline</span>
                          )}
                        </div>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] line-clamp-2">{model.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Context Wheel Component
// ============================================================================

interface ContextWheelProps {
  currentTokens: number;
  maxTokens: number;
  messageCount: number;
}

function ContextWheel({ currentTokens, maxTokens, messageCount }: ContextWheelProps) {
  const percentage = Math.min((currentTokens / maxTokens) * 100, 100);
  const circumference = 2 * Math.PI * 16; // radius = 16
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  // Color based on usage
  const color = percentage > 80 
    ? 'stroke-red-500' 
    : percentage > 60 
    ? 'stroke-yellow-500' 
    : 'stroke-green-500';
  
  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <div className="relative inline-flex items-center justify-center cursor-help">
            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
              {/* Background circle */}
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                className="stroke-[hsl(var(--muted))]"
                strokeWidth="3"
              />
              {/* Progress circle */}
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                className={cn("transition-all duration-300", color)}
                strokeWidth="3"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <Info className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <div className="font-semibold">Context Window</div>
            <div className="text-[hsl(var(--muted-foreground))]">
              {currentTokens.toLocaleString()} / {maxTokens.toLocaleString()} tokens ({percentage.toFixed(0)}%)
            </div>
            <div className="text-[hsl(var(--muted-foreground))]">
              {messageCount} message{messageCount !== 1 ? 's' : ''} in context
            </div>
            {percentage > 80 && (
              <div className="text-red-400 pt-1">
                ⚠️ Approaching limit - oldest messages will be removed to maintain context
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================================================
// Message Bubble Component
// ============================================================================

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  // Liquid glass effect styles matching ConversationDetailView
  const glassStyles = {
    sent: [
      "bg-gradient-to-br from-[hsl(var(--accent))] via-[hsl(var(--accent)/0.92)] to-[hsl(var(--accent)/0.85)]",
      "text-white",
      "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),inset_0_-1px_2px_0_rgba(0,0,0,0.15),0_4px_12px_-4px_rgba(0,0,0,0.2),0_0_0_0.5px_rgba(255,255,255,0.1)]",
      "backdrop-blur-md backdrop-saturate-150",
      "border border-white/10",
    ].join(" "),
    received: [
      "bg-gradient-to-br from-[hsl(var(--muted)/0.9)] via-[hsl(var(--muted)/0.85)] to-[hsl(var(--muted)/0.8)]",
      "text-[hsl(var(--foreground))]",
      "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_2px_0_rgba(0,0,0,0.05),0_4px_12px_-4px_rgba(0,0,0,0.08),0_0_0_0.5px_rgba(255,255,255,0.15)]",
      "backdrop-blur-md backdrop-saturate-125",
      "border border-[hsl(var(--border)/0.3)]",
    ].join(" "),
  };

  // Format metadata for assistant messages
  const visibleMetadata: string[] = [];
  const detailedStats: string[] = [];
  
  // Time (HH:MM format) - always visible
  const timeStr = message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  visibleMetadata.push(timeStr);
  
  // Model name (for assistant messages) - always visible
  if (!isUser && message.model) {
    visibleMetadata.push(message.model);
  }
  
  // Detailed stats - shown in tooltip
  if (!isUser) {
    // Latency/generation time
    if (message.latency !== undefined) {
      // latency = total end-to-end time; timeToFirstToken = thinking/TTFT.
      // "Generated in" should be just the token generation phase, not the thinking phase.
      const generationMs = (message.timeToFirstToken !== undefined)
        ? Math.max(0, message.latency - message.timeToFirstToken)
        : message.latency;
      const generatedSec = (generationMs / 1000).toFixed(1);
      detailedStats.push(`Generated in ${generatedSec}s`);
      
      // Show thinking time if available
      if (message.timeToFirstToken !== undefined) {
        const thinkingSec = (message.timeToFirstToken / 1000).toFixed(2);
        detailedStats.push(`Thought for ${thinkingSec}s`);
      }
    } else if (message.isStreaming && message.streamStartTime) {
      // Show live elapsed time while streaming
      const elapsed = Date.now() - message.streamStartTime;
      const elapsedSec = (elapsed / 1000).toFixed(1);
      detailedStats.push(`Streaming ${elapsedSec}s...`);
    }
    
    // Tokens
    if (message.totalTokens !== undefined) {
      detailedStats.push(`${message.totalTokens} tokens`);
      
      // Tokens per second
      if (message.latency !== undefined && message.latency > 0) {
        // Final tok/s (after completion)
        const tokensPerSec = ((message.totalTokens / message.latency) * 1000).toFixed(1);
        detailedStats.push(`${tokensPerSec} tok/s`);
      } else if (message.isStreaming && message.streamStartTime) {
        // Live tok/s (while streaming)
        const elapsed = Date.now() - message.streamStartTime;
        if (elapsed > 100) { // Only show after 100ms
          const tokensPerSec = ((message.totalTokens / elapsed) * 1000).toFixed(1);
          detailedStats.push(`${tokensPerSec} tok/s`);
        }
      }
    } else if (message.isStreaming && message.content) {
      // Estimate tokens while streaming (before final count arrives)
      const estimatedTokens = Math.ceil(message.content.length / 4);
      detailedStats.push(`~${estimatedTokens} tokens`);
      
      if (message.streamStartTime) {
        const elapsed = Date.now() - message.streamStartTime;
        if (elapsed > 100) {
          const tokensPerSec = ((estimatedTokens / elapsed) * 1000).toFixed(1);
          detailedStats.push(`~${tokensPerSec} tok/s`);
        }
      }
    }
  }

  return (
    <div className={cn(
      "flex",
      isUser ? "justify-end" : "justify-start"
    )}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2",
          isUser 
            ? cn("rounded-br-md ml-[20%]", glassStyles.sent)
            : cn("rounded-bl-md mr-[20%]", glassStyles.received)
        )}
      >
        <div className="relative">
          <div className={cn("text-sm break-words", isUser ? "whitespace-pre-wrap" : "")}>
            {isUser ? message.content : renderMarkdown(message.content)}
            {/* Blinking cursor while streaming */}
            {!isUser && message.isStreaming && (
              <span className="inline-block w-[2px] h-4 ml-0.5 bg-current animate-pulse" />
            )}
          </div>
        </div>
        <div className={cn(
          "mt-1 text-xs flex items-center gap-1",
          isUser ? "text-white/70" : "text-[hsl(var(--muted-foreground))]"
        )}>
          <span>{visibleMetadata.join(' • ')}</span>
          {/* Info icon with detailed stats tooltip for assistant messages */}
          {!isUser && detailedStats.length > 0 && (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="inline-flex items-center justify-center hover:text-[hsl(var(--foreground))] transition-colors">
                    <Info className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="text-xs space-y-0.5">
                    {detailedStats.map((stat, idx) => (
                      <div key={idx}>{stat}</div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Model Availability
// ============================================================================

/**
 * Load available models from router
 */
async function loadModelAvailability(): Promise<void> {
  try {
    const response = await fetch(`${RELAY_AI_ROUTER_URL}/v1/models/availability`);
    
    if (!response.ok) {
      console.error('Failed to load model availability:', response.status);
      return;
    }
    
    const data = await response.json();
    availableModels.value = data.models || [];
    
    // Default to Auto if none selected
    if (!selectedModel.value) {
      selectedModel.value = 'auto';
    }
    
    console.log(`[AI Chat] Loaded ${data.models.length} models (${data.models.filter((m: ModelAvailability) => m.is_available).length} available)`);
  } catch (error) {
    console.error('[AI Chat] Failed to load model availability:', error);
  }
}

// ============================================================================
// E2EE AI Request Implementation
// ============================================================================

interface E2EEAIRequest {
  model: string;
  prompt: string;
}

interface E2EEAIResponse {
  content: string;
  model: string;
  tokensUsed?: number;
  promptTokens?: number;
  completionTokens?: number;
  latency?: number;
  timeToFirstToken?: number; // Time to first token (thinking time)
}

/**
 * Send an E2EE AI request through Relay Protocol
 * Automatically chooses streaming or non-streaming based on model capabilities
 */
async function sendE2EEAIRequest(request: E2EEAIRequest): Promise<E2EEAIResponse> {
  // Step 1: Check if selected model supports streaming
  const selectedModelName = request.model === 'auto' ? undefined : request.model;
 const modelInfo = availableModels.value.find(m => m.model_name === selectedModelName);
  
  // Use streaming if:
  // 1. Model explicitly supports streaming
  // 2. Or "auto" mode (let router decide, assume streaming is available)
  const useStreaming = request.model === 'auto' || modelInfo?.supports_streaming !== false;
  
  if (useStreaming) {
    console.log('[AI Chat] Using streaming mode for', request.model);
    return await sendStreamingRequest(request);
  } else {
    console.log('[AI Chat] Using non-streaming mode for', request.model);
    return await sendNonStreamingRequest(request);
  }
}

/**
 * Send streaming E2EE AI request
 */
async function sendStreamingRequest(request: E2EEAIRequest): Promise<E2EEAIResponse> {
  // Step 1: Get optimal operator from smart router
  const requestModel = request.model === 'auto' ? undefined : request.model;
  
  const routeResponse = await fetch(`${RELAY_AI_ROUTER_URL}/v1/models/smart-route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: requestModel,
      user_region: Intl.DateTimeFormat().resolvedOptions().timeZone.split('/')[0].toLowerCase(),
      preferences: { min_latency: true },
    }),
  });
  
  if (!routeResponse.ok) {
    const error = await routeResponse.json();
    throw new Error(error.message || `No operators available${requestModel ? ` for model: ${requestModel}` : ''}`);
  }
  
  const routeData = await routeResponse.json();
  const operatorEdgeId = routeData.operator_edge_id;
  const operatorPublicKey = routeData.x25519_public_key;
  const actualModel = routeData.model || requestModel;
  
  console.log(`[AI Stream] Smart router selected: ${operatorEdgeId.slice(0, 8)}, model: ${actualModel}`);
  
  // Step 2: Prepare and encrypt request payload
  const contextLimit = 8192; // TODO: Get from model metadata
  const squished = squishContext(aiMessages.value, contextLimit);
  const conversationHistory = squished.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));
  
  totalContextTokens.value = calculateTotalTokens(squished);
  
  const requestPayload = {
    model: actualModel,
    messages: conversationHistory,
    temperature: 0.7,
    max_tokens: 2048,
  };
  
  // Encrypt
  const encrypted = await sendMessage<{
    success: boolean;
    ciphertext?: string;
    ephemeralPublicKey?: string;
    nonce?: string;
    error?: string;
  }>({
    type: 'ENCRYPT_E2EE',
    payload: {
      plaintext: JSON.stringify(requestPayload),
      recipientPublicKey: operatorPublicKey,
    },
  });
  
  if (!encrypted.success || !encrypted.ciphertext) {
    throw new Error(encrypted.error || 'Failed to encrypt request');
  }
  
  // Step 3: Generate IDs and get client keys
  const streamId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  
  let conversationId = aiConversationId.value;
  if (!conversationId) {
    conversationId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    aiConversationId.value = conversationId;
  }
  
  const edgeResult = await getOrCreateRelayAIEdge();
  if (!edgeResult.success || !edgeResult.edge) {
    throw new Error('Failed to create anonymous AI edge: ' + (edgeResult.error || 'Unknown error'));
  }
  
  const clientEdgeId = edgeResult.edge.id;
  
  const storage = await chrome.storage.local.get(['edgeKeys']);
  const clientKeys = storage.edgeKeys?.[clientEdgeId];
  if (!clientKeys?.publicKey) {
    throw new Error('Client edge keys not found. Please try again.');
  }
  
  const clientX25519PublicKey = clientKeys.publicKey;
  const clientSecretKey = clientKeys.secretKey;
  
  console.log(`[AI Stream] Opening SSE subscription for stream ${streamId}`);
  
  // Step 4: Open SSE connection FIRST (subscribe-first pattern)
  const response = await fetch(`${RELAY_AI_ROUTER_URL}/v1/ai/stream/${streamId}`, {
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to open SSE connection: ${response.statusText}`);
  }
  
  if (!response.body) {
    throw new Error('SSE response body is null');
  }
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let metadata: any = {};
  const startTime = Date.now();
  let firstTokenTime: number | undefined; // Track time to first token
  let sseReady = false;
  let firstTokenReceived = false; // Track when to create assistant message
  let assistantMessageId: string | null = null;
  
  // Don't create assistant message yet - will be created on first token
  // This keeps the "Thinking..." spinner visible during latency
  
  // Force periodic UI updates for live stats (every 100ms)
  let statsInterval: number | null = null;
  
  // Timeout if no data received for 60 seconds
  let lastDataTime = Date.now();
  const timeoutInterval = setInterval(() => {
    if (Date.now() - lastDataTime > 60000) {
      console.error('[AI Stream] Timeout - no data received for 60s');
      reader.cancel();
      clearInterval(timeoutInterval);
    }
  }, 5000);
  
  try {
    // Step 5: Wait for "ready" event before sending message
    console.log('[AI Stream] Waiting for ready event...');
    
    // Read stream until we get the ready event
    while (!sseReady) {
      const { done, value } = await reader.read();
      if (done) throw new Error('SSE connection closed before ready event');
      
      lastDataTime = Date.now();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.startsWith(':')) continue; // Skip comments
        
        if (line.startsWith('event: ready')) {
          // Next line should be the data
          continue;
        }
        
        if (line.startsWith('data: ')) {
          try {
            const chunk = JSON.parse(line.replace('data: ', ''));
            if (chunk.stream_id === streamId) {
              sseReady = true;
              console.log('[AI Stream] SSE connection ready, sending message');
              break;
            }
          } catch (e) {
            // Ignore parse errors during ready phase
          }
        }
      }
    }
    
    // Step 6: Now that SSE is ready, send the message
    const aiRequest = {
      type: 'ai_request',
      stream_id: streamId, // Use stream_id instead of request_id
      conversation_id: conversationId,
      client_edge_id: clientEdgeId,
      client_x25519_public_key: clientX25519PublicKey,
      operator_edge_id: operatorEdgeId,
      timestamp: Date.now(),
      encrypted_payload: {
        ciphertext: encrypted.ciphertext,
        ephemeral_pubkey: encrypted.ephemeralPublicKey,
        nonce: encrypted.nonce,
      },
    };
    
    const messageResponse = await fetch(`${RELAY_AI_ROUTER_URL}/v1/ai/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aiRequest),
    });
    
    if (!messageResponse.ok) {
      const errorData = await messageResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `Message send failed: ${messageResponse.statusText}`);
    }
    
    console.log('[AI Stream] Message sent, listening for chunks...');
    
    // Step 7: Continue reading SSE stream for chunks
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      lastDataTime = Date.now(); // Reset timeout
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        // Skip SSE comments (keep-alive pings)
        if (line.startsWith(':')) continue;
        
        if (!line.startsWith('data: ')) continue;
        
        try {
          const chunk = JSON.parse(line.replace('data: ', ''));
          
          if (chunk.type === 'chunk') {
            // Decrypt token chunk
            const decrypted = await sendMessage<{
              success: boolean;
              plaintext?: string;
              error?: string;
            }>({
              type: 'DECRYPT_E2EE',
              payload: {
                ciphertext: chunk.encrypted_chunk.ciphertext,
                ephemeralPublicKey: chunk.encrypted_chunk.ephemeral_pubkey,
                nonce: chunk.encrypted_chunk.nonce,
                recipientPrivateKey: clientSecretKey,
              },
            });
            
            if (decrypted.success && decrypted.plaintext) {
              const tokenData = JSON.parse(decrypted.plaintext);
              const token = tokenData.content;
              
              // Skip if content is undefined (metadata chunk)
              if (token === undefined) {
                continue;
              }
              
              fullContent += token;
              
              // Create assistant message on first token
              if (!firstTokenReceived) {
                firstTokenReceived = true;
                firstTokenTime = Date.now() - startTime; // Record thinking time
                assistantMessageId = crypto.randomUUID();
                
                const assistantMessage: Message = {
                  id: assistantMessageId,
                  role: 'assistant',
                  content: fullContent,
                  timestamp: new Date(),
                  isE2EE: true,
                  isStreaming: true,
                  streamStartTime: startTime,
                  timeToFirstToken: firstTokenTime, // Set thinking time
                };
                aiMessages.value = [...aiMessages.value, assistantMessage];
                
                // Start stats update interval now that message exists
                const lastIdx = aiMessages.value.length - 1;
                statsInterval = setInterval(() => {
                  if (aiMessages.value[lastIdx]?.isStreaming) {
                    aiMessages.value = [...aiMessages.value]; // Trigger re-render
                  }
                }, 100);
              } else {
                // Update existing assistant message
                const lastMessageIndex = aiMessages.value.length - 1;
                const updated = [...aiMessages.value];
                updated[lastMessageIndex] = {
                  ...updated[lastMessageIndex],
                  content: fullContent,
                };
                aiMessages.value = updated;
              }
              // Note: Auto-scroll handled by useEffect watching aiMessages
            }
          } else if (chunk.type === 'tool_status') {
            // Live tool call status — update the indicator without touching message content
            aiToolStatus.value = {
              tool: chunk.tool || 'unknown',
              detail: chunk.detail || '',
              phase: chunk.phase === 'complete' ? 'complete' : 'running',
            };

          } else if (chunk.type === 'done') {
            // Final metadata chunk
            if (chunk.metadata) {
              metadata = chunk.metadata;
            }
          } else if (chunk.type === 'error') {
            throw new Error(chunk.error || 'Streaming error');
          }
        } catch (parseErr) {
          console.warn('[AI Stream] Failed to parse chunk:', parseErr);
        }
      }
    }
  } finally {
    // Clean up intervals
    if (statsInterval) clearInterval(statsInterval);
    clearInterval(timeoutInterval);
  }
  
  const latency = Date.now() - startTime;
  
  // Create conversation after first message
  if (aiMessages.value.length === 2) { // User + assistant
    await createAIConversation(conversationId, request.model, operatorEdgeId);
  }
  
  return {
    content: fullContent,
    model: metadata.model || actualModel,
    tokensUsed: metadata.tokens_used,
    promptTokens: metadata.prompt_tokens,
    completionTokens: metadata.completion_tokens,
    latency: metadata.processing_time_ms || latency,
    timeToFirstToken: firstTokenTime, // Include thinking time
  };
}

/**
 * Send non-streaming E2EE AI request (original implementation)
 */
async function sendNonStreamingRequest(request: E2EEAIRequest): Promise<E2EEAIResponse> {
  // Step 1: Get optimal operator from smart router
  const requestModel = request.model === 'auto' ? undefined : request.model; // Let router decide if auto
  
  const routeResponse = await fetch(`${RELAY_AI_ROUTER_URL}/v1/models/smart-route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: requestModel, // undefined = router picks best model automatically
      user_region: Intl.DateTimeFormat().resolvedOptions().timeZone.split('/')[0].toLowerCase(), // Rough region from timezone
      preferences: {
        min_latency: true,
      },
    }),
  });
  
  if (!routeResponse.ok) {
    const error = await routeResponse.json();
    throw new Error(error.message || `No operators available${requestModel ? ` for model: ${requestModel}` : ''}`);
  }
  
  const routeData = await routeResponse.json();
  const operatorEdgeId = routeData.operator_edge_id;
  const operatorPublicKey = routeData.x25519_public_key;
  const actualModel = routeData.model || requestModel; // Router returns the model it selected
  
  console.log(`[AI Chat] Smart router selected operator: ${operatorEdgeId.slice(0, 8)}, model: ${actualModel}, estimated latency: ${routeData.estimated_latency_ms}ms`);
  console.log(`[DEBUG] Operator public key from router: ${operatorPublicKey?.slice(0, 16)}...${operatorPublicKey?.slice(-8)}`);
  console.log(`[DEBUG] Operator public key length: ${operatorPublicKey?.length}`);
  
  // Step 2: Encrypt request payload with operator's public key
  // Prepare request payload (to be encrypted) in OpenAI format
  // Include full conversation history for multi-turn context
  
  // Apply context squishing if needed (default 8192 token limit for now)
  const contextLimit = 8192; // TODO: Get from model metadata
  const squished = squishContext(aiMessages.value, contextLimit);
  
  // aiMessages.value already includes the current user message (added in handleSendMessage)
  // So we don't need to append it again - just use the squished history as-is
  const conversationHistory = squished.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));
  
  // Update token count signal
  totalContextTokens.value = calculateTotalTokens(squished);
  
  const requestPayload = {
    model: actualModel, // Use the model selected by router (if auto was requested)
    messages: conversationHistory, // Already includes current user message
    temperature: 0.7,
    max_tokens: 2048,
  };
  
  console.log(`[AI Chat] Sending ${requestPayload.messages.length} messages, ${totalContextTokens.value} tokens`);
  
  // Encrypt the payload using background crypto
  const encrypted = await sendMessage<{
    success: boolean;
    ciphertext?: string;
    ephemeralPublicKey?: string;
    nonce?: string;
    error?: string;
  }>({
    type: 'ENCRYPT_E2EE',
    payload: {
      plaintext: JSON.stringify(requestPayload),
      recipientPublicKey: operatorPublicKey,
    },
  });
  
  if (!encrypted.success || !encrypted.ciphertext) {
    throw new Error(encrypted.error || 'Failed to encrypt request');
  }
  
  // Step 3: Generate request ID and conversation ID
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  
  let conversationId = aiConversationId.value;
  if (!conversationId) {
    conversationId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    aiConversationId.value = conversationId;
  }
  
  // Step 4: Get or create relay-ai edge for client identity
  const edgeResult = await getOrCreateRelayAIEdge();
  if (!edgeResult.success || !edgeResult.edge) {
    throw new Error('Failed to create anonymous AI edge: ' + (edgeResult.error || 'Unknown error'));
  }
  
  const clientEdgeId = edgeResult.edge.id;
  console.log(`[AI Chat] Using client edge ID: ${clientEdgeId.slice(0, 8)}...`);
  
  // Get client's X25519 public key from storage
  const storage = await chrome.storage.local.get(['edgeKeys']);
  const clientKeys = storage.edgeKeys?.[clientEdgeId];
  if (!clientKeys?.publicKey) {
    throw new Error('Client edge keys not found. Please try again.');
  }
  
  const clientX25519PublicKey = clientKeys.publicKey;
  console.log(`[AI Chat] Client X25519 public key: ${clientX25519PublicKey.slice(0, 16)}...${clientX25519PublicKey.slice(-8)}`);
  
  // Step 5: Send encrypted request to router
  const aiRequest = {
    type: 'ai_request',
    request_id: requestId,
    conversation_id: conversationId,
    client_edge_id: clientEdgeId, // Anonymous relay-ai edge for this client
    client_x25519_public_key: clientX25519PublicKey, // For encrypting response
    operator_edge_id: operatorEdgeId, // Operator selected by smart router
    timestamp: Date.now(),
    encrypted_payload: {
      ciphertext: encrypted.ciphertext,
      ephemeral_pubkey: encrypted.ephemeralPublicKey,
      nonce: encrypted.nonce,
    },
  };
  
  // Send directly to router via HTTP for now
  try {
    const response = await fetch(`${RELAY_AI_ROUTER_URL}/v1/ai/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(aiRequest),
    });
    
    if (!response.ok) {
      throw new Error(`Router error: ${response.statusText}`);
    }
    
    const responseData = await response.json();
    
    // Decrypt the response
    if (!responseData.encrypted_payload) {
      throw new Error('Response missing encrypted payload');
    }
    
    // Get client edge's secret key for decryption
    const clientSecretKey = clientKeys.secretKey;
    
    const decrypted = await sendMessage<{
      success: boolean;
      plaintext?: string;
      error?: string;
    }>({
      type: 'DECRYPT_E2EE',
      payload: {
        ciphertext: responseData.encrypted_payload.ciphertext,
        ephemeralPublicKey: responseData.encrypted_payload.ephemeral_pubkey,
        nonce: responseData.encrypted_payload.nonce,
        recipientPrivateKey: clientSecretKey, // Use client edge's X25519 private key
      },
    });
    
    if (!decrypted.success || !decrypted.plaintext) {
      throw new Error(decrypted.error || 'Failed to decrypt response');
    }
    
    const responsePayload = JSON.parse(decrypted.plaintext);
    
    console.log('[AI Chat] Decrypted response:', {
      hasContent: !!responsePayload.content,
      tokensUsed: responsePayload.tokens_used,
      promptTokens: responsePayload.prompt_tokens,
      completionTokens: responsePayload.completion_tokens,
      latency: responsePayload.processing_time_ms,
      model: responsePayload.model,
    });
    
    // Create conversation in inbox after first successful message
    if (aiMessages.value.length === 1) {
      await createAIConversation(conversationId, request.model, operatorEdgeId);
    }
    
    return {
      content: responsePayload.content || 'No response',
      model: responsePayload.model || request.model,
      tokensUsed: responsePayload.tokens_used,
      promptTokens: responsePayload.prompt_tokens,
      completionTokens: responsePayload.completion_tokens,
      latency: responsePayload.processing_time_ms,
    };
  } catch (error) {
    console.error('[AI Chat] Request failed:', error);
    throw new Error('AI request failed. Router may not be running or operator is offline.');
  }
}

/**
 * Create or update AI conversation in inbox
 */
async function createAIConversation(conversationId: string, model: string, operatorEdgeId: string): Promise<void> {
  try {
    // Get the first user message as the conversation title
    const firstUserMessage = aiMessages.value.find(m => m.role === 'user');
    const conversationTitle = firstUserMessage 
      ? firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '')
      : 'AI Chat';
    
    // Get last assistant message as preview
    const lastAssistantMessage = [...aiMessages.value].reverse().find(m => m.role === 'assistant');
    const lastPreview = lastAssistantMessage
      ? lastAssistantMessage.content.slice(0, 100) + (lastAssistantMessage.content.length > 100 ? '...' : '')
      : '';
    
    // Get client edge ID
    const edgeResult = await getOrCreateRelayAIEdge();
    const clientEdgeId = edgeResult.edge?.id;
    
    const existingConv = conversations.value.find(c => c.id === conversationId);
    
    const conversationData: Conversation = {
      id: conversationId,
      type: 'local-llm',
      securityLevel: 'e2ee',
      participants: [operatorEdgeId],
      counterpartyName: conversationTitle,
      lastMessagePreview: lastPreview,
      lastActivityAt: new Date().toISOString(),
      createdAt: existingConv?.createdAt ?? new Date().toISOString(),
      unreadCount: 0,
      myEdgeId: clientEdgeId,
      counterpartyEdgeId: operatorEdgeId,
    };
    
    // Persist to chrome.storage.local index + update conversations signal
    await saveLocalAIConversation(conversationData);
    
    console.log('[AI Chat] Created/updated conversation:', conversationId);
  } catch (error) {
    console.error('[AI Chat] Failed to create conversation:', error);
  }
}
