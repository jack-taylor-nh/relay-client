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

// App state
type AppView = 'loading' | 'not-found' | 'pin-entry' | 'name-entry' | 'chat' | 'error';
const currentView = signal<AppView>('loading');
const errorMessage = signal<string | null>(null);
const linkInfo = signal<{ edgeId: string; x25519PublicKey: string } | null>(null);

// Session state - includes crypto keys
const visitorKeys = signal<{
  sharedSecret: Uint8Array;
  stateEncryptionKey: Uint8Array;
  publicKeyBase64: string;
} | null>(null);
const ratchetState = signal<RatchetState | null>(null);
const visitorName = signal<string>('');
const sessionId = signal<string | null>(null);
const conversationId = signal<string | null>(null);

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
        currentView.value = 'pin-entry';
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
        {currentView.value === 'pin-entry' && linkId && <PinEntryView linkId={linkId} />}
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

function PinEntryView({ linkId }: { linkId: string }) {
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  
  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (pin.length !== 6) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Derive deterministic keys from PIN + linkId
      const keys = await deriveVisitorKeys(pin, linkId);
      visitorKeys.value = {
        sharedSecret: keys.sharedSecret,
        stateEncryptionKey: keys.stateEncryptionKey,
        publicKeyBase64: keys.publicKeyBase64,
      };
      
      // Check if session exists
      const api = new LinkApiClient(linkId);
      const session = await api.getSession(keys.publicKeyBase64);
      
      if (session) {
        // Existing session - decrypt and restore ratchet state
        sessionId.value = session.sessionId;
        conversationId.value = session.conversationId;
        visitorName.value = session.displayName || '';
        
        // Decrypt stored ratchet state
        if (session.encryptedRatchetState) {
          try {
            const serializedState = await decryptState(
              session.encryptedRatchetState, 
              keys.stateEncryptionKey
            );
            ratchetState.value = deserializeRatchetState(serializedState);
          } catch (err) {
            console.error('Failed to decrypt ratchet state:', err);
            // State corrupted - need to reinitialize
            initializeRatchet(keys);
          }
        } else {
          initializeRatchet(keys);
        }
        
        currentView.value = 'chat';
      } else {
        // New visitor - ask for name
        currentView.value = 'name-entry';
      }
    } catch (err: any) {
      console.error('PIN verification error:', err);
      setError(err.message || 'Failed to verify PIN');
    } finally {
      setIsLoading(false);
    }
  }
  
  function initializeRatchet(keys: { sharedSecret: Uint8Array }) {
    if (!linkInfo.value) return;
    const edgePublicKey = fromBase64(linkInfo.value.x25519PublicKey);
    ratchetState.value = RatchetInitVisitor(keys.sharedSecret, edgePublicKey);
  }
  
  return (
    <div class="w-full max-w-sm">
      <div class="bg-white rounded-2xl shadow-lg p-6 border border-stone-200">
        <div class="text-center mb-6">
          <div class="w-14 h-14 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg class="w-7 h-7 text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <h2 class="text-xl font-semibold text-stone-800">Enter Your PIN</h2>
          <p class="text-sm text-stone-600 mt-1">
            Create a 6-digit PIN to secure your conversation
          </p>
        </div>
        
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onInput={(e) => {
              const value = (e.target as HTMLInputElement).value.replace(/\D/g, '');
              setPin(value);
            }}
            class="w-full text-center text-2xl tracking-[0.5em] font-mono py-4 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            placeholder="••••••"
            disabled={isLoading}
          />
          
          {error && (
            <p class="text-sm text-red-600 text-center mt-2">{error}</p>
          )}
          
          <button
            type="submit"
            disabled={pin.length !== 6 || isLoading}
            class="w-full mt-4 py-3 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Verifying...' : 'Continue'}
          </button>
        </form>
        
        <p class="text-xs text-stone-500 text-center mt-4">
          Remember this PIN to return to your conversation later.
        </p>
      </div>
      
      <div class="mt-4 p-4 bg-sky-50 rounded-xl border border-sky-200">
        <div class="flex items-start gap-3">
          <svg class="w-5 h-5 text-sky-600 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <div>
            <p class="text-sm font-medium text-sky-900">E2EE (PIN-protected)</p>
            <p class="text-xs text-sky-700 mt-0.5">
              Your messages are encrypted end-to-end. Your PIN never leaves your device.
            </p>
          </div>
        </div>
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
      const edgePublicKey = fromBase64(linkInfo.value.x25519PublicKey);
      ratchetState.value = RatchetInitVisitor(visitorKeys.value.sharedSecret, edgePublicKey);
      
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
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.value]);
  
  // Poll for new messages and decrypt them
  useEffect(() => {
    const api = new LinkApiClient(linkId);
    let lastCheck: string | undefined;
    
    async function pollMessages() {
      if (!visitorKeys.value || !ratchetState.value) return;
      
      try {
        const response = await api.getMessages(visitorKeys.value.publicKeyBase64, lastCheck);
        if (response.messages.length > 0) {
          // Decrypt each message using Double Ratchet
          const decryptedMessages: ChatMessage[] = [];
          let currentState = ratchetState.value;
          
          for (const msg of response.messages) {
            try {
              // Parse the encrypted message
              const encryptedMsg: EncryptedRatchetMessage = JSON.parse(atob(msg.encryptedContent));
              const result = RatchetDecrypt(currentState, encryptedMsg);
              
              if (result) {
                currentState = result.newState;
                decryptedMessages.push({
                  id: msg.id,
                  content: result.plaintext,
                  fromVisitor: false,
                  timestamp: new Date(msg.createdAt),
                });
              } else {
                decryptedMessages.push({
                  id: msg.id,
                  content: '[Unable to decrypt message]',
                  fromVisitor: false,
                  timestamp: new Date(msg.createdAt),
                });
              }
            } catch {
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
          }
          
          lastCheck = response.messages[0]?.createdAt;
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }
    
    pollMessages();
    const interval = setInterval(pollMessages, 5000);
    return () => clearInterval(interval);
  }, [linkId]);
  
  async function saveRatchetState(api: LinkApiClient) {
    if (!visitorKeys.value || !ratchetState.value) return;
    
    try {
      // Serialize and encrypt the ratchet state
      const serialized = serializeRatchetState(ratchetState.value);
      const encrypted = await encryptState(serialized, visitorKeys.value.stateEncryptionKey);
      
      // Update on server
      await api.updateRatchetState(visitorKeys.value.publicKeyBase64, encrypted);
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
      
      // Send the encrypted message
      const response = await api.sendMessage(visitorKeys.value.publicKeyBase64, {
        ciphertext: btoa(JSON.stringify(encryptedMsg)),
        ephemeralPubkey: encryptedMsg.dh,
        nonce: encryptedMsg.nonce,
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
            E2EE (PIN-protected)
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
