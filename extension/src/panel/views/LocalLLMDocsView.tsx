import { useState } from 'preact/hooks';
import { CopyableField } from '../components/CopyableField';
import { AlertCard } from '../components/AlertCard';

// Inline RelayLogo component
function RelayLogo({ className }: { className?: string }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="20 20 216 216"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="relay-gradient-llm" x1="44" y1="28" x2="212" y2="232" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#A78BFA"></stop>
          <stop offset="0.55" stop-color="#C084FC"></stop>
          <stop offset="1" stop-color="#E879F9"></stop>
        </linearGradient>
      </defs>
      <g transform="translate(128 128) scale(1.14) translate(-128 -128)">
        <path d="M92 176V86c0-10 8-18 18-18h30c22 0 40 18 40 40s-18 40-40 40h-22" fill="none" stroke="url(#relay-gradient-llm)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"></path>
        <path d="M118 148l52 28" fill="none" stroke="url(#relay-gradient-llm)" stroke-width="18" stroke-linecap="round"></path>
        <circle cx="188" cy="176" r="10" fill="url(#relay-gradient-llm)"></circle>
      </g>
    </svg>
  );
}

interface LocalLLMDocsViewProps {
  myEdgeId: string;
  myAuthToken: string;
  onClose: () => void;
  onBridgeEdgeIdSubmit?: (bridgeEdgeId: string) => void;
}

export function LocalLLMDocsView({ myEdgeId, myAuthToken, onClose, onBridgeEdgeIdSubmit }: LocalLLMDocsViewProps) {
  const [bridgeEdgeInput, setBridgeEdgeInput] = useState('');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success'>('idle');

  const handleSubmit = () => {
    if (bridgeEdgeInput.trim() && onBridgeEdgeIdSubmit) {
      onBridgeEdgeIdSubmit(bridgeEdgeInput.trim());
      setSubmitStatus('success');
      setTimeout(() => {
        onClose();
      }, 1500);
    }
  };

  return (
    <div class="fixed inset-0 bg-[var(--color-bg-hover)] z-50 overflow-y-auto">
      {/* Header */}
      <div class="bg-[var(--color-bg-elevated)] border-b border-[var(--color-border-default)] sticky top-0 z-10">
        <div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <RelayLogo className="w-8 h-8" />
            <div>
              <h1 class="text-xl font-bold text-[var(--color-text-primary)]">Local LLM Bridge Setup Guide</h1>
              <p class="text-sm text-[var(--color-text-secondary)]">Connect your local AI models to Relay</p>
            </div>
          </div>
          <button
            onClick={onClose}
            class="px-4 py-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded-lg transition-colors font-medium"
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Content */}
      <div class="max-w-5xl mx-auto px-6 py-8">
        {/* Overview */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Overview</h2>
          <p class="text-[var(--color-text-primary)] leading-relaxed mb-4">
            The Local LLM Bridge connects your locally-running AI models (via Ollama, LM Studio, or other providers) 
            to Relay, allowing you to chat with AI directly in your encrypted inbox. Messages are routed through 
            Relay's gateway but processed entirely on your machine—keeping your conversations private.
          </p>
          <AlertCard type="info" title="Use Cases">
            <ul class="space-y-1">
              <li>• Private AI conversations without sending data to cloud providers</li>
              <li>• Code assistance and technical questions with local models</li>
              <li>• Document analysis and summarization on your own hardware</li>
              <li>• Creative writing and brainstorming with full privacy</li>
              <li>• Multi-model conversations (switch between different local models)</li>
            </ul>
          </AlertCard>
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* Prerequisites */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Prerequisites</h2>
          <p class="text-[var(--color-text-primary)] mb-4">Before setting up the Local LLM Bridge, ensure you have:</p>
          
          <div class="space-y-4">
            <div class="border-l-4 border-[var(--color-accent)] pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">1. Ollama Installed</h3>
              <p class="text-sm text-[var(--color-text-primary)] mb-2">
                Download and install Ollama from <a href="https://ollama.ai" target="_blank" class="text-[var(--color-accent)] hover:underline">ollama.ai</a>
              </p>
              <p class="text-xs text-[var(--color-text-secondary)]">
                Supports macOS, Linux, and Windows. Ollama manages model downloads and inference.
              </p>
            </div>

            <div class="border-l-4 border-[var(--color-accent)] pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">2. At Least One Model Downloaded</h3>
              <p class="text-sm text-[var(--color-text-primary)] mb-2">
                Run: <code class="bg-[var(--color-bg-hover)] px-2 py-1 rounded font-mono text-sm">ollama pull qwen2.5-coder:latest</code>
              </p>
              <p class="text-xs text-[var(--color-text-secondary)]">
                Popular models: <code>llama3.3</code>, <code>qwen2.5-coder</code>, <code>deepseek-r1</code>, <code>mistral</code>
              </p>
            </div>

            <div class="border-l-4 border-[var(--color-accent)] pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">3. Relay Local LLM Bridge App</h3>
              <p class="text-sm text-[var(--color-text-primary)] mb-2">
                Download the bridge desktop app from your Relay dashboard or GitHub releases.
              </p>
              <p class="text-xs text-[var(--color-text-secondary)]">
                Available for macOS, Windows, and Linux. This app runs locally and connects your models to Relay.
              </p>
            </div>
          </div>
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* Setup Steps */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Setup Steps</h2>
          <p class="text-[var(--color-text-primary)] mb-6">
            Connecting to a Local LLM Bridge is simple: just get the bridge edge ID from the bridge operator 
            and paste it here. No credentials to share!
          </p>

          {/* Step 1 */}
          <div class="mb-8">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold flex items-center justify-center">1</div>
              <h3 class="text-lg font-semibold text-[var(--color-text-primary)]">Get Bridge Edge ID</h3>
            </div>
            <div class="ml-11">
              <p class="text-[var(--color-text-primary)] mb-4">
                Obtain the <strong>Bridge Edge ID</strong> from whoever is running the Local LLM Bridge you want to connect to. 
                This could be:
              </p>
              <ul class="text-[var(--color-text-primary)] space-y-2 mb-4">
                <li>• <strong>Your own bridge:</strong> If you're running the bridge app on this computer or another device</li>
                <li>• <strong>A friend's bridge:</strong> Someone sharing their local AI models with you</li>
                <li>• <strong>A business service:</strong> A company offering private LLM access through Relay</li>
              </ul>
              <AlertCard type="info" title="No Credentials Needed">
                <p class="text-xs">
                  You don't need to share any of your account credentials! The bridge edge ID is public information, 
                  like someone's Relay handle. The bridge operator controls who can connect through access management.
                </p>
              </AlertCard>
            </div>
          </div>

          {/* Step 2 */}
          <div class="mb-8">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold flex items-center justify-center">2</div>
              <h3 class="text-lg font-semibold text-[var(--color-text-primary)]">Paste Bridge Edge ID</h3>
            </div>
            <div class="ml-11">
              <p class="text-[var(--color-text-primary)] mb-4">
                Enter the <strong>Bridge Edge ID</strong> below to connect to the bridge:
              </p>
              <div class="space-y-3">
                <div>
                  <label class="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                    Bridge Edge ID
                  </label>
                  <input
                    type="text"
                    value={bridgeEdgeInput}
                    onInput={(e) => setBridgeEdgeInput((e.target as HTMLInputElement).value)}
                    placeholder="01ABCD1234EFGH5678JKLM9012"
                    class="w-full px-3 py-2 border border-[var(--color-border-default)] rounded-lg bg-[var(--color-bg-default)] text-[var(--color-text-primary)] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p class="text-xs text-[var(--color-text-secondary)] mt-1">
                    26-character alphanumeric ID provided by the bridge operator
                  </p>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={!bridgeEdgeInput.trim() || submitStatus === 'success'}
                  class={`px-4 py-2 rounded-lg font-medium transition-all ${
                    submitStatus === 'success'
                      ? 'bg-gradient-to-r from-green-600 to-green-700 text-white cursor-default'
                      : bridgeEdgeInput.trim()
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 cursor-pointer'
                      : 'bg-[var(--color-bg-hover)] text-[var(--color-text-tertiary)] cursor-not-allowed'
                  }`}
                >
                  {submitStatus === 'success' ? '✓ Connected! Closing...' : 'Connect to Bridge'}
                </button>
              </div>
              <AlertCard type="info" title="Access Control" className="mt-4">
                <p class="text-xs">
                  If the bridge operator hasn't granted you access, your messages may not be processed. 
                  Contact them to request access if needed.
                </p>
              </AlertCard>
            </div>
          </div>

          {/* Step 3 */}
          <div class="mb-8">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold flex items-center justify-center">3</div>
              <h3 class="text-lg font-semibold text-[var(--color-text-primary)]">Start Chatting!</h3>
            </div>
            <div class="ml-11">
              <p class="text-[var(--color-text-primary)] mb-3">
                Once connected, you can start conversations with the bridge's AI models:
              </p>
              <ol class="text-[var(--color-text-primary)] space-y-2 ml-4 list-decimal">
                <li>Close this guide (it will close automatically after connecting)</li>
                <li>Go to the New Conversation menu</li>
                <li>Select the Local AI option and choose this bridge</li>
                <li>Start sending messages—responses will come from the bridge's local AI!</li>
              </ol>
              <AlertCard type="success" title="Setup Complete!" className="mt-4">
                <p class="text-xs">
                  Your connection is ready! All messages are gateway-secured: encrypted to the bridge, 
                  processed on their machine, and responses encrypted back to you. Neither Relay servers 
                  nor the bridge operator can read your message content.
                </p>
              </AlertCard>
            </div>
          </div>
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* Supported Models */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Supported Models</h2>
          <p class="text-[var(--color-text-primary)] mb-4">
            The Local LLM Bridge works with any model supported by Ollama. Here are some popular options:
          </p>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="border border-[var(--color-border-default)] rounded-lg p-4 bg-[var(--color-bg-default)]">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-2">Code & Technical</h3>
              <ul class="text-sm text-[var(--color-text-primary)] space-y-1">
                <li>• <code class="text-[var(--color-accent)]">qwen2.5-coder:latest</code> - Excellent for coding tasks</li>
                <li>• <code class="text-[var(--color-accent)]">deepseek-coder-v2</code> - Strong code understanding</li>
                <li>• <code class="text-[var(--color-accent)]">codellama</code> - Meta's code-focused model</li>
              </ul>
            </div>

            <div class="border border-[var(--color-border-default)] rounded-lg p-4 bg-[var(--color-bg-default)]">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-2">General Chat</h3>
              <ul class="text-sm text-[var(--color-text-primary)] space-y-1">
                <li>• <code class="text-[var(--color-accent)]">llama3.3</code> - Meta's latest, highly capable</li>
                <li>• <code class="text-[var(--color-accent)]">mistral</code> - Fast and efficient</li>
                <li>• <code class="text-[var(--color-accent)]">phi3</code> - Compact, runs on most hardware</li>
              </ul>
            </div>

            <div class="border border-[var(--color-border-default)] rounded-lg p-4 bg-[var(--color-bg-default)]">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-2">Reasoning</h3>
              <ul class="text-sm text-[var(--color-text-primary)] space-y-1">
                <li>• <code class="text-[var(--color-accent)]">deepseek-r1</code> - Advanced reasoning capabilities</li>
                <li>• <code class="text-[var(--color-accent)]">qwen-plus</code> - Strong analytical skills</li>
              </ul>
            </div>

            <div class="border border-[var(--color-border-default)] rounded-lg p-4 bg-[var(--color-bg-default)]">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-2">Lightweight</h3>
              <ul class="text-sm text-[var(--color-text-primary)] space-y-1">
                <li>• <code class="text-[var(--color-accent)]">tinyllama</code> - Fast on low-end hardware</li>
                <li>• <code class="text-[var(--color-accent)]">phi3:mini</code> - Efficient small model</li>
              </ul>
            </div>
          </div>

          <p class="text-sm text-[var(--color-text-secondary)] mt-4">
            Install models with: <code class="bg-[var(--color-bg-hover)] px-2 py-1 rounded font-mono text-sm">ollama pull &lt;model-name&gt;</code>
          </p>
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* Security */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Security & Privacy</h2>
          
          <AlertCard type="info" title="Gateway-Secured Communication" className="mb-4">
            <p class="text-xs mb-2">
              Local LLM conversations are <strong>gateway-secured</strong>: messages are encrypted to the bridge 
              edge, ensuring secure delivery and privacy:
            </p>
            <ul class="text-xs space-y-1">
              <li>• Messages encrypted in transit using the bridge's public key</li>
              <li>• Only the bridge can decrypt your messages (not Relay servers)</li>
              <li>• Bridge processes messages locally with AI models</li>
              <li>• Responses encrypted back to you before being sent</li>
              <li>• Relay servers only route encrypted data, never see message content</li>
            </ul>
          </AlertCard>

          <div class="space-y-4">
            <div class="border-l-4 border-[var(--color-success)] pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">Privacy Benefits</h3>
              <p class="text-sm text-[var(--color-text-primary)]">
                Unlike cloud AI services (ChatGPT, Claude, etc.), your conversations are processed on the bridge 
                operator's machine, not cloud servers. For maximum privacy, run your own bridge—this ensures your 
                prompts never leave hardware you control.
              </p>
            </div>

            <div class="border-l-4 border-[var(--color-warning)] pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">Bridge Trust Model</h3>
              <p class="text-sm text-[var(--color-text-primary)] mb-2">
                You're trusting the bridge operator to:
              </p>
              <ul class="text-xs space-y-1 ml-4">
                <li>• Process your messages responsibly</li>
                <li>• Not log or store conversations</li>
                <li>• Maintain secure infrastructure</li>
              </ul>
              <p class="text-sm text-[var(--color-text-primary)] mt-2">
                <strong>For sensitive conversations:</strong> Only use bridges you run yourself or from trusted sources.
              </p>
            </div>

            <div class="border-l-4 border-[var(--color-success)] pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">No Credential Sharing</h3>
              <p class="text-sm text-[var(--color-text-primary)]">
                You never share your account credentials with anyone. The bridge edge ID is like a public address—
                the bridge operator can't access your Relay account, read your other messages, or impersonate you.
              </p>
            </div>

            <div class="border-l-4 border-[var(--color-accent)] pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">Network Requirements</h3>
              <p class="text-sm text-[var(--color-text-primary)]">
                The bridge requires internet connectivity to receive messages from Relay's servers via SSE. 
                However, the actual AI processing happens offline—models don't need internet access.
              </p>
            </div>
          </div>
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* How to Run Your Own Bridge */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Running Your Own Bridge</h2>
          <p class="text-[var(--color-text-primary)] mb-4">
            Want to run your own bridge? This gives you maximum privacy and lets you share access with friends or customers.
          </p>
          
          <AlertCard type="success" title="Benefits of Running Your Own Bridge" className="mb-4">
            <ul class="text-xs space-y-1">
              <li>• Complete control over your data and AI processing</li>
              <li>• Share access with friends, family, or customers</li>
              <li>• Monetize by offering AI services through Relay</li>
              <li>• Choose which models to offer and manage access control</li>
            </ul>
          </AlertCard>

          <div class="space-y-3">
            <div class="border-l-4 border-gradient-to-r from-purple-600 to-pink-600 pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">1. Install Bridge Desktop App</h3>
              <p class="text-sm text-[var(--color-text-primary)]">
                Download the Relay LLM Bridge desktop app for your platform (Windows, macOS, or Linux).
              </p>
            </div>

            <div class="border-l-4 border-gradient-to-r from-purple-600 to-pink-600 pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">2. Create Bridge Edge</h3>
              <p class="text-sm text-[var(--color-text-primary)]">
                Open the bridge app and click "Create Bridge Edge". The app will generate credentials and create 
                an edge identity on Relay servers.
              </p>
            </div>

            <div class="border-l-4 border-gradient-to-r from-purple-600 to-pink-600 pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">3. Share Your Bridge Edge ID</h3>
              <p class="text-sm text-[var(--color-text-primary)]">
                Copy your bridge edge ID from the app and share it with anyone you want to grant access. 
                You can manage allowed clients in the bridge app's access control panel.
              </p>
            </div>

            <div class="border-l-4 border-gradient-to-r from-purple-600 to-pink-600 pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">4. Manage Access</h3>
              <p class="text-sm text-[var(--color-text-primary)]">
                The bridge app lets you whitelist/blacklist clients, set rate limits, and monitor usage. 
                Revoke access anytime by removing clients from the allowed list.
              </p>
            </div>
          </div>
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* Troubleshooting */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Troubleshooting</h2>
          
          <div class="space-y-4">
            <div>
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-2">Can't Connect to Bridge</h3>
              <ul class="text-sm text-[var(--color-text-primary)] space-y-1 ml-4 list-disc">
                <li>Verify you entered the correct <strong>Bridge Edge ID</strong></li>
                <li>Check with the bridge operator that your client has been granted access</li>
                <li>Confirm the bridge app is running and shows "Connected" status</li>
                <li>Try removing and re-adding the connection</li>
              </ul>
            </div>

            <div>
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-2">Messages Not Getting Responses</h3>
              <ul class="text-sm text-[var(--color-text-primary)] space-y-1 ml-4 list-disc">
                <li>Check that the bridge operator's app is running and connected</li>
                <li>Verify the bridge has models available (ask the operator)</li>
                <li>Try sending a simple test message like "hello"</li>
                <li>Contact the bridge operator to check their logs</li>
              </ul>
            </div>

            <div>
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-2">Access Denied Errors</h3>
              <ul class="text-sm text-[var(--color-text-primary)] space-y-1 ml-4 list-disc">
                <li>The bridge operator hasn't granted you access yet</li>
                <li>Your access may have been revoked—contact the operator</li>
                <li>Check that you're using the correct bridge edge ID</li>
              </ul>
            </div>

            <div>
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-2">Slow Responses</h3>
              <ul class="text-sm text-[var(--color-text-primary)] space-y-1 ml-4 list-disc">
                <li>Response speed depends on the bridge operator's hardware</li>
                <li>Large language models require powerful hardware</li>
                <li>Consider asking the operator to offer smaller, faster models</li>
                <li>Some bridges may rate-limit during high usage</li>
              </ul>
            </div>
          </div>
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* Support */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Support</h2>
          <p class="text-[var(--color-text-primary)] mb-4">
            Need help? Here are some resources:
          </p>
          <ul class="text-[var(--color-text-primary)] space-y-2 mb-4">
            <li>• Check the bridge app logs for detailed error messages</li>
            <li>• Visit the Relay documentation for more guides</li>
            <li>• Join the Relay community for help from other users</li>
            <li>• Contact support with your Client Edge ID for assistance</li>
          </ul>
          <div class="bg-[var(--color-bg-hover)] border border-[var(--color-border-strong)] rounded-lg p-4">
            <p class="text-sm text-[var(--color-text-primary)]">
              <strong>Client Edge ID:</strong> <code class="font-mono text-[var(--color-accent)]">{myEdgeId}</code>
            </p>
            <p class="text-sm text-[var(--color-text-primary)] mt-2">
              Include this ID when contacting support for faster assistance.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
