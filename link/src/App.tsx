import { Fragment } from 'preact';
import { signal } from '@preact/signals';
import { useState, useEffect, useRef } from 'preact/hooks';
import { LinkApiClient } from './lib/api';
import { deriveVisitorKeys, encryptState, decryptState } from './lib/crypto';
import { 
  RatchetInitVisitor, 
  RatchetEncrypt, 
  RatchetDecrypt, 
  serializeRatchetState, 
  deserializeRatchetState,
  fromBase64,
  type RatchetState,
  type EncryptedRatchetMessage,
} from './lib/ratchet';
import { WORDLIST } from './lib/wordlist';

// App state
type AppView = 'loading' | 'not-found' | 'seed-entry' | 'seed-save' | 'name-entry' | 'chat' | 'error';
const currentView = signal<AppView>('loading');
const errorMessage = signal<string | null>(null);
const linkInfo = signal<{ edgeId: string; x25519PublicKey: string } | null>(null);

// Session state - includes crypto keys
const visitorKeys = signal<{
  sharedSecret: Uint8Array;
  stateEncryptionKey: Uint8Array;
  publicKeyBase64: string;
  keypairSecretKey: Uint8Array;
} | null>(null);
const ratchetState = signal<RatchetState | null>(null);
const visitorName = signal<string>('');
const sessionId = signal<string | null>(null);
const conversationId = signal<string | null>(null);
const seedPhrase = signal<string>('');
const seedWordsForSave = signal<string[]>([]);

// Messages
interface ChatMessage {
  id: string;
  content: string;
  fromVisitor: boolean;
  timestamp: Date;
}
const messages = signal<ChatMessage[]>([]);

// Get link ID from URL
function getLinkId(): string | null {
  // Support both /linkId and /?l=linkId formats
  const path = window.location.pathname;
  const pathMatch = path.match(/^\/([a-zA-Z0-9_-]+)$/);
  if (pathMatch) return pathMatch[1];
  
  const params = new URLSearchParams(window.location.search);
  return params.get('l');
}

export function App() {
  const linkId = getLinkId();
  
  useEffect(() => {
    if (!linkId) {
      currentView.value = 'not-found';
      return;
    }
    
    // Load link info
    const api = new LinkApiClient(linkId);
    api.getLinkInfo()
      .then(info => {
        linkInfo.value = {
          edgeId: info.edgeId,
          x25519PublicKey: info.x25519PublicKey,
        };
        currentView.value = 'seed-entry';
      })
      .catch(err => {
        console.error('Failed to load link:', err);
        if (err.message.includes('not found')) {
          currentView.value = 'not-found';
        } else {
          errorMessage.value = err.message;
          currentView.value = 'error';
        }
      });
  }, [linkId]);
  
  return (
    <div class="min-h-screen bg-gradient-to-br from-stone-100 to-sky-50 flex flex-col">
      <Header />
      <main class="flex-1 flex items-center justify-center p-4">
        {currentView.value === 'loading' && <LoadingView />}
        {currentView.value === 'not-found' && <NotFoundView />}
        {currentView.value === 'error' && <ErrorView />}
        {currentView.value === 'seed-entry' && linkId && <SeedEntryView linkId={linkId} />}
        {currentView.value === 'seed-save' && linkId && <SeedSaveView linkId={linkId} />}
        {currentView.value === 'name-entry' && linkId && <NameEntryView linkId={linkId} />}
        {currentView.value === 'chat' && linkId && <ChatView linkId={linkId} />}
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header class="px-4 py-3 bg-white/80 backdrop-blur border-b border-stone-200">
      <div class="max-w-2xl mx-auto flex items-center gap-2">
        <svg width="28" height="28" viewBox="20 20 216 216" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="relay-gradient" x1="44" y1="28" x2="212" y2="232" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#38BDF8"/>
              <stop offset="0.55" stop-color="#60A5FA"/>
              <stop offset="1" stop-color="#A5B4FC"/>
            </linearGradient>
          </defs>
          <g transform="translate(128 128) scale(1.14) translate(-128 -128)">
            <path d="M92 176V86c0-10 8-18 18-18h30c22 0 40 18 40 40s-18 40-40 40h-22"
                  fill="none" stroke="url(#relay-gradient)" stroke-width="18"
                  stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M118 148l52 28" fill="none" stroke="url(#relay-gradient)"
                  stroke-width="18" stroke-linecap="round"/>
            <circle cx="188" cy="176" r="10" fill="url(#relay-gradient)"/>
          </g>
        </svg>
        <span class="text-lg font-semibold text-stone-800">Relay</span>
        <span class="text-sm text-stone-500 ml-1">Contact Link</span>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer class="px-4 py-4 text-center text-xs text-stone-500">
      <p>
        Secured with end-to-end encryption.{' '}
        <a href="https://userelay.org" class="text-sky-600 hover:underline" target="_blank" rel="noopener">
          Learn more about Relay
        </a>
      </p>
    </footer>
  );
}

function LoadingView() {
  return (
    <div class="text-center">
      <div class="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p class="text-stone-600">Loading...</p>
    </div>
  );
}

function NotFoundView() {
  return (
    <div class="text-center max-w-md">
      <div class="w-16 h-16 bg-stone-200 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg class="w-8 h-8 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-stone-800 mb-2">Link Not Found</h2>
      <p class="text-stone-600">
        This contact link doesn't exist or has been disabled.
      </p>
    </div>
  );
}

function ErrorView() {
  return (
    <div class="text-center max-w-md">
      <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg class="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M15 9l-6 6M9 9l6 6" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-stone-800 mb-2">Something went wrong</h2>
      <p class="text-stone-600">{errorMessage.value || 'An unexpected error occurred.'}</p>
      <button 
        class="mt-4 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800"
        onClick={() => window.location.reload()}
      >
        Try Again
      </button>
    </div>
  );
}

const WORDSET = new Set(WORDLIST);

function generateSeedWords(count = 3): string[] {
  const randomValues = crypto.getRandomValues(new Uint32Array(count));
  return Array.from(randomValues, (value) => WORDLIST[value % WORDLIST.length]);
}

function initializeRatchet() {
  if (!linkInfo.value || !visitorKeys.value) return;
  const edgePublicKey = fromBase64(linkInfo.value.x25519PublicKey);
  // Use the visitor's deterministic keypair for DH-based shared secret
  const keypair = {
    publicKey: fromBase64(visitorKeys.value.publicKeyBase64),
    secretKey: visitorKeys.value.keypairSecretKey,
  };
  ratchetState.value = RatchetInitVisitor(keypair, edgePublicKey);
}

function SeedEntryView({ linkId }: { linkId: string }) {
  const [words, setWords] = useState<string[]>(['', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function updateWord(index: number, value: string) {
    const sanitized = value.replace(/[^a-z]/gi, '').toLowerCase();
    const updated = [...words];
    updated[index] = sanitized;
    setWords(updated);
  }

  function handleGenerateSeed() {
    const generated = generateSeedWords(3);
    setWords(generated);
    setError(null);
    // Focus last field so user can continue immediately
    requestAnimationFrame(() => inputRefs.current[2]?.focus());
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (isLoading) return;

    const normalized = words.map((w) => w.trim().toLowerCase());

    if (normalized.some((w) => !w)) {
      setError('Enter all three words.');
      const firstEmpty = normalized.findIndex((w) => !w);
      if (firstEmpty >= 0) inputRefs.current[firstEmpty]?.focus();
      return;
    }

    if (normalized.some((w) => !WORDSET.has(w))) {
      setError('One or more words are not in the word list.');
      return;
    }

    const seed = normalized.join(' ');

    setIsLoading(true);
    setError(null);

    try {
      const keys = await deriveVisitorKeys(seed, linkId);
      visitorKeys.value = {
        sharedSecret: keys.sharedSecret,
        stateEncryptionKey: keys.stateEncryptionKey,
        publicKeyBase64: keys.publicKeyBase64,
        keypairSecretKey: keys.keypair.secretKey,
      };

      const api = new LinkApiClient(linkId);
      const session = await api.getSession(keys.publicKeyBase64);

      if (session) {
        sessionId.value = session.sessionId;
        conversationId.value = session.conversationId;
        visitorName.value = session.displayName || '';

        if (session.encryptedRatchetState) {
          try {
            const serializedState = await decryptState(
              session.encryptedRatchetState,
              keys.stateEncryptionKey
            );
            ratchetState.value = deserializeRatchetState(serializedState);
          } catch (err) {
            console.error('Failed to decrypt ratchet state:', err);
            initializeRatchet();
          }
        } else {
          initializeRatchet();
        }
        
        // Restore message history if available
        if (session.encryptedMessageHistory) {
          try {
            const historyJson = await decryptState(
              session.encryptedMessageHistory,
              keys.stateEncryptionKey
            );
            const history = JSON.parse(historyJson) as Array<{
              id: string;
              content: string;
              fromVisitor: boolean;
              timestamp: string;
            }>;
            messages.value = history.map(m => ({
              id: m.id,
              content: m.content,
              fromVisitor: m.fromVisitor,
              timestamp: new Date(m.timestamp),
            }));
            console.log('[Link] Restored', messages.value.length, 'messages from history');
          } catch (err) {
            console.error('Failed to decrypt message history:', err);
            // Not critical - continue without history
          }
        }

        currentView.value = 'chat';
      } else {
        initializeRatchet();
        seedPhrase.value = seed;
        seedWordsForSave.value = normalized;
        currentView.value = 'seed-save';
      }
    } catch (err: any) {
      console.error('Seed verification error:', err);
      setError(err.message || 'Failed to verify seed phrase');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div class="w-full max-w-md">
      <div class="bg-white rounded-2xl shadow-lg p-6 border border-stone-200">
        <div class="text-center mb-6">
          <div class="w-14 h-14 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg class="w-7 h-7 text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 10V7a6 6 0 0112 0v3" />
              <rect x="4" y="10" width="16" height="10" rx="2" />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-stone-800">Secure Your Conversation</h2>
          <p class="text-sm text-stone-600 mt-1 leading-relaxed">
            Pick three words to create your private seed. You&apos;ll need this seed to return to the conversation.
          </p>
        </div>

        <form onSubmit={handleSubmit} class="space-y-4">
          <div class="flex items-stretch rounded-xl border border-stone-300 bg-white px-3 shadow-sm focus-within:border-transparent focus-within:ring-2 focus-within:ring-sky-500">
            {words.map((word, idx) => (
              <Fragment key={idx}>
                <input
                  ref={(el) => {
                    inputRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="text"
                  value={word}
                  onInput={(e) => updateWord(idx, (e.target as HTMLInputElement).value)}
                  class="flex-1 min-w-0 bg-transparent py-3 text-center text-lg font-mono uppercase tracking-[0.3em] placeholder:text-stone-300 focus:outline-none"
                  placeholder={`Word ${idx + 1}`}
                  autoCapitalize="off"
                  autoComplete="off"
                  spellcheck={false}
                  disabled={isLoading}
                />
                {idx < words.length - 1 && (
                  <span
                    aria-hidden="true"
                    class="px-3 text-xl font-semibold text-stone-300 select-none self-center"
                  >
                    -
                  </span>
                )}
              </Fragment>
            ))}
          </div>

          {error && <p class="text-sm text-red-600 text-center">{error}</p>}

          <div class="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleGenerateSeed}
              class="flex-1 py-3 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:border-slate-400 disabled:opacity-60"
              disabled={isLoading}
            >
              Generate Seed
            </button>
            <button
              type="submit"
              class="flex-1 py-3 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:bg-stone-300 disabled:cursor-not-allowed"
              disabled={isLoading || words.some((w) => !w.trim())}
            >
              {isLoading ? 'Checking…' : 'Continue'}
            </button>
          </div>
        </form>

        <p class="text-xs text-stone-500 text-center mt-4 leading-relaxed">
          Keep your seed phrase private—anyone with these words can read this conversation.
        </p>
      </div>

      <div class="mt-4 p-4 bg-sky-50 rounded-xl border border-sky-200">
        <div class="flex items-start gap-3">
          <svg class="w-5 h-5 text-sky-600 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <div>
            <p class="text-sm font-medium text-sky-900">End-to-End Encryption</p>
            <p class="text-xs text-sky-700 mt-0.5">
              Your messages are encrypted with keys derived from this seed. Remember it to resume securely.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SeedSaveView({ linkId }: { linkId: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!seedPhrase.value) {
      currentView.value = 'seed-entry';
    }
  }, []);

  const words = seedWordsForSave.value;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(seedPhrase.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy seed:', err);
    }
  }

  function handleDownload() {
    const seedText = `Relay Contact Seed\nLink ID: ${linkId}\nSeed Phrase: ${seedPhrase.value}\n\nKeep this file private. Anyone with these words can read your messages.`;
    const blob = new Blob([seedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relay-contact-seed-${linkId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleContinue() {
    currentView.value = 'name-entry';
  }

  if (!seedPhrase.value) {
    return null;
  }

  return (
    <div class="w-full max-w-md">
      <div class="bg-white rounded-2xl shadow-lg p-6 border border-stone-200">
        <div class="text-center mb-6">
          <div class="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg class="w-7 h-7 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3l7 4v6c0 4.97-3.58 9.74-7 11-3.42-1.26-7-6.03-7-11V7l7-4z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-stone-800">Save Your Seed</h2>
          <p class="text-sm text-stone-600 mt-1 leading-relaxed">
            Download or copy these words. You&apos;ll need them to reopen this conversation in the future.
          </p>
        </div>

        <div class="flex items-stretch rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
          {words.map((word, idx) => (
            <Fragment key={idx}>
              <div class="flex-1 min-w-0 px-1 text-center">
                <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Word {idx + 1}
                </p>
                <p class="font-mono text-base uppercase tracking-[0.18em] text-slate-900">{word}</p>
              </div>
              {idx < words.length - 1 && (
                <span
                  aria-hidden="true"
                  class="px-3 text-xl font-semibold text-slate-300 select-none self-center"
                >
                  -
                </span>
              )}
            </Fragment>
          ))}
        </div>

        <div class="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleDownload}
            class="py-3 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:border-slate-400"
          >
            Download Backup
          </button>
          <button
            type="button"
            onClick={handleCopy}
            class="py-3 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:border-slate-400"
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
          <button
            type="button"
            onClick={handleContinue}
            class="py-3 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-800"
          >
            I saved my seed
          </button>
        </div>

        <p class="text-xs text-stone-500 text-center mt-4 leading-relaxed">
          Keep your seed private. Anyone with these words can impersonate you in this conversation.
        </p>
      </div>
    </div>
  );
}

function NameEntryView({ linkId }: { linkId: string }) {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  
  async function handleSubmit(e: Event) {
    e.preventDefault();
    
    setIsLoading(true);
    setError(null);
    
    try {
      if (!visitorKeys.value || !linkInfo.value) {
        throw new Error('Session not properly initialized');
      }
      
      // Initialize the ratchet for this new conversation
      initializeRatchet();
      
      const api = new LinkApiClient(linkId);
      const session = await api.createSession(
        visitorKeys.value.publicKeyBase64,
        name.trim() || undefined
      );
      
      sessionId.value = session.sessionId;
      conversationId.value = session.conversationId;
      visitorName.value = name.trim();
      currentView.value = 'chat';
    } catch (err: any) {
      console.error('Session creation error:', err);
      setError(err.message || 'Failed to start conversation');
    } finally {
      setIsLoading(false);
    }
  }
  
  function handleSkip() {
    handleSubmit(new Event('submit'));
  }
  
  return (
    <div class="w-full max-w-sm">
      <div class="bg-white rounded-2xl shadow-lg p-6 border border-stone-200">
        <div class="text-center mb-6">
          <div class="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg class="w-7 h-7 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-stone-800">What's your name?</h2>
          <p class="text-sm text-stone-600 mt-1">
            This will be shown to the person you're contacting
          </p>
        </div>
        
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            class="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            placeholder="Your name (optional)"
            disabled={isLoading}
            maxLength={50}
          />
          
          {error && (
            <p class="text-sm text-red-600 text-center mt-2">{error}</p>
          )}
          
          <button
            type="submit"
            disabled={isLoading}
            class="w-full mt-4 py-3 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Starting...' : 'Start Conversation'}
          </button>
          
          <button
            type="button"
            onClick={handleSkip}
            disabled={isLoading}
            class="w-full mt-2 py-2 text-sm text-stone-600 hover:text-stone-800"
          >
            Skip, stay anonymous
          </button>
        </form>
      </div>
    </div>
  );
}

function ChatView({ linkId }: { linkId: string }) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasCompletedInitialPoll = useRef(false);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.value]);
  
  // Use SSE for real-time message updates, with fallback polling
  useEffect(() => {
    const api = new LinkApiClient(linkId);
    let lastCheck: string | undefined;
    let eventSource: EventSource | null = null;
    let pollInterval: number | null = null;
    let sseRetryTimeout: number | null = null;
    let retryCount = 0;
    
    async function processMessages(rawMessages: any[]) {
      if (!visitorKeys.value || !ratchetState.value || rawMessages.length === 0) return;
      
      // Decrypt each message using Double Ratchet
      const decryptedMessages: ChatMessage[] = [];
      let currentState = ratchetState.value;
      
      for (const msg of rawMessages) {
        try {
          // Parse the encrypted message
          // Messages can come in two formats:
          // 1. encryptedContent: base64-encoded JSON (legacy format)
          // 2. Direct fields: ciphertext, ephemeralPubkey, nonce, pn, n (from extension)
          let encryptedMsg: EncryptedRatchetMessage;
          
          if (msg.encryptedContent) {
            // Legacy format - parse from base64-encoded JSON
            encryptedMsg = JSON.parse(atob(msg.encryptedContent));
          } else if (msg.ciphertext && msg.nonce) {
            // Direct format from extension replies
            encryptedMsg = {
              ciphertext: msg.ciphertext,
              dh: msg.ephemeralPubkey,
              nonce: msg.nonce,
              pn: msg.pn ?? 0,
              n: msg.n ?? 0,
            };
          } else {
            throw new Error('Unknown message format');
          }
          
          console.log('[Link] Attempting to decrypt message:', {
            msgId: msg.id,
            dh: encryptedMsg.dh?.substring(0, 20) + '...',
            pn: encryptedMsg.pn,
            n: encryptedMsg.n,
          });
          
          const result = RatchetDecrypt(currentState, encryptedMsg);
          
          if (result) {
            console.log('[Link] Decryption successful');
            currentState = result.newState;
            decryptedMessages.push({
              id: msg.id,
              content: result.plaintext,
              fromVisitor: false,
              timestamp: new Date(msg.createdAt),
            });
          } else {
            console.log('[Link] Decryption returned null');
            decryptedMessages.push({
              id: msg.id,
              content: '[Unable to decrypt message]',
              fromVisitor: false,
              timestamp: new Date(msg.createdAt),
            });
          }
        } catch (err) {
          console.error('[Link] Decryption error:', err);
          decryptedMessages.push({
            id: msg.id,
            content: '[Decryption error]',
            fromVisitor: false,
            timestamp: new Date(msg.createdAt),
          });
        }
      }
      
      // Update ratchet state and save to server
      ratchetState.value = currentState;
      await saveRatchetState(api);
      
      // Add new messages (avoid duplicates)
      const existingIds = new Set(messages.value.map(m => m.id));
      const uniqueNew = decryptedMessages.filter(m => !existingIds.has(m.id));
      if (uniqueNew.length > 0) {
        messages.value = [...messages.value, ...uniqueNew].sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
        );

        if (hasCompletedInitialPoll.current && audioRef.current) {
          try {
            audioRef.current.currentTime = 0;
            void audioRef.current.play();
          } catch (err) {
            console.warn('Notification audio failed to play:', err);
          }
        }
      }
      
      lastCheck = rawMessages[0]?.createdAt;
    }
    
    async function pollMessages() {
      if (!visitorKeys.value || !ratchetState.value) return;
      
      try {
        const response = await api.getMessages(visitorKeys.value.publicKeyBase64, lastCheck);
        await processMessages(response.messages);
      } catch (err) {
        console.error('[Link] Poll error:', err);
      } finally {
        if (!hasCompletedInitialPoll.current) {
          hasCompletedInitialPoll.current = true;
        }
      }
    }
    
    function connectSSE() {
      if (!visitorKeys.value) return;
      
      const sseUrl = `${api.baseUrl}/link/${linkId}/stream/${encodeURIComponent(visitorKeys.value.publicKeyBase64)}`;
      console.log('[Link SSE] Connecting to:', sseUrl);
      
      eventSource = new EventSource(sseUrl);
      
      eventSource.addEventListener('connected', () => {
        console.log('[Link SSE] Connected');
        retryCount = 0;
        // Stop polling since SSE is active
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      });
      
      eventSource.addEventListener('message', async (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log('[Link SSE] Received message event:', data);
          
          // SSE event contains the new message(s)
          if (data.messages && Array.isArray(data.messages)) {
            await processMessages(data.messages);
          }
        } catch (err) {
          console.error('[Link SSE] Failed to process message event:', err);
        }
      });
      
      eventSource.addEventListener('ping', () => {
        // Keepalive ping - no action needed
      });
      
      eventSource.addEventListener('error', (e) => {
        console.error('[Link SSE] Connection error:', e);
        eventSource?.close();
        eventSource = null;
        
        // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        retryCount++;
        
        console.log(`[Link SSE] Retrying in ${delay}ms (attempt ${retryCount})`);
        sseRetryTimeout = setTimeout(() => {
          connectSSE();
        }, delay);
        
        // Fall back to polling while SSE is down
        if (!pollInterval) {
          console.log('[Link] Falling back to polling');
          pollInterval = setInterval(pollMessages, 30000); // Poll every 30s as backup
        }
      });
    }
    
    // Initial message fetch
    pollMessages();
    
    // Try to establish SSE connection
    connectSSE();
    
    // Cleanup on unmount
    return () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (sseRetryTimeout) {
        clearTimeout(sseRetryTimeout);
        sseRetryTimeout = null;
      }
    };
  }, [linkId]);
  
  async function saveRatchetState(api: LinkApiClient) {
    if (!visitorKeys.value || !ratchetState.value) return;
    
    try {
      // Serialize and encrypt the ratchet state
      const serialized = serializeRatchetState(ratchetState.value);
      const encryptedState = await encryptState(serialized, visitorKeys.value.stateEncryptionKey);
      
      // Serialize and encrypt message history
      const messageHistory = messages.value.map(m => ({
        id: m.id,
        content: m.content,
        fromVisitor: m.fromVisitor,
        timestamp: m.timestamp.toISOString(),
      }));
      const encryptedHistory = await encryptState(
        JSON.stringify(messageHistory), 
        visitorKeys.value.stateEncryptionKey
      );
      
      // Update on server
      await api.updateRatchetState(
        visitorKeys.value.publicKeyBase64, 
        encryptedState,
        encryptedHistory
      );
    } catch (err) {
      console.error('Failed to save ratchet state:', err);
    }
  }
  
  async function handleSend(e: Event) {
    e.preventDefault();
    if (!message.trim() || isSending || !visitorKeys.value || !ratchetState.value) return;
    
    setIsSending(true);
    
    try {
      const api = new LinkApiClient(linkId);
      
      // Encrypt message using Double Ratchet
      const { message: encryptedMsg, newState } = RatchetEncrypt(ratchetState.value, message.trim());
      ratchetState.value = newState;
      
      // Send the encrypted message with all ratchet fields
      const response = await api.sendMessage(visitorKeys.value.publicKeyBase64, {
        ciphertext: encryptedMsg.ciphertext,
        ephemeralPubkey: encryptedMsg.dh,
        nonce: encryptedMsg.nonce,
        pn: encryptedMsg.pn,
        n: encryptedMsg.n,
      });
      
      // Save updated ratchet state
      await saveRatchetState(api);
      
      // Add to local messages
      messages.value = [...messages.value, {
        id: response.messageId,
        content: message.trim(),
        fromVisitor: true,
        timestamp: new Date(response.createdAt),
      }];
      
      setMessage('');
      inputRef.current?.focus();
    } catch (err: any) {
      console.error('Send error:', err);
      alert(err.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  }
  
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }
  
  return (
    <div class="w-full max-w-2xl h-[600px] flex flex-col bg-white rounded-2xl shadow-lg border border-stone-200 overflow-hidden">
      <audio ref={audioRef} src="/sounds/notification.mp3" preload="auto" />
      {/* Chat header */}
      <div class="px-4 py-3 bg-stone-50 border-b border-stone-200 flex items-center gap-3">
        <div class="w-10 h-10 bg-sky-100 rounded-full flex items-center justify-center">
          <svg class="w-5 h-5 text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </div>
        <div>
          <h3 class="font-semibold text-stone-800">Secure Conversation</h3>
          <p class="text-xs text-stone-500 flex items-center gap-1">
            <svg class="w-3 h-3 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            E2EE (Seed-protected)
          </p>
        </div>
        {visitorName.value && (
          <span class="ml-auto text-sm text-stone-500">
            Chatting as <span class="font-medium text-stone-700">{visitorName.value}</span>
          </span>
        )}
      </div>
      
      {/* Messages area */}
      <div class="flex-1 overflow-y-auto p-4 space-y-3 bg-stone-50">
        {messages.value.length === 0 ? (
          <div class="text-center py-12">
            <svg class="w-12 h-12 text-stone-300 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <p class="text-stone-500">Send a message to start the conversation</p>
          </div>
        ) : (
          messages.value.map(msg => (
            <div
              key={msg.id}
              class={`flex ${msg.fromVisitor ? 'justify-end' : 'justify-start'}`}
            >
              <div
                class={`max-w-[75%] px-4 py-2 rounded-2xl ${
                  msg.fromVisitor
                    ? 'bg-sky-500 text-white rounded-br-sm'
                    : 'bg-white border border-stone-200 text-stone-800 rounded-bl-sm'
                }`}
              >
                <p class="text-sm whitespace-pre-wrap">{msg.content}</p>
                <p class={`text-xs mt-1 ${msg.fromVisitor ? 'text-sky-100' : 'text-stone-400'}`}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input area */}
      <form onSubmit={handleSend} class="p-3 bg-white border-t border-stone-200">
        <div class="flex gap-2">
          <textarea
            ref={inputRef}
            value={message}
            onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            class="flex-1 px-4 py-2.5 border border-stone-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={!message.trim() || isSending}
            class="px-4 py-2.5 bg-slate-700 text-white rounded-xl hover:bg-slate-800 disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors"
          >
            {isSending ? (
              <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
