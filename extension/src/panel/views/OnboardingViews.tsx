import { useState, useEffect } from 'preact/hooks';
import { onboardingStep, createIdentity, isLoading, showToast, completeOnboarding, currentIdentity, pendingPassphrase, edgeTypes, loadEdgeTypes, createEdge, sendMessage, handles } from '../state';

// ============================================
// Icons
// ============================================

function LockIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function MailIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function UserIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function AlertIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function EyeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function DiceIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
      <circle cx="16" cy="8" r="1.5" fill="currentColor" />
      <circle cx="8" cy="16" r="1.5" fill="currentColor" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function RelayGlyphIcon({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="20 20 216 216" fill="none" role="img" aria-label="Relay glyph">
      <defs>
        <linearGradient id="relayGradientOnboarding" x1="44" y1="28" x2="212" y2="232" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#38BDF8"/>
          <stop offset="0.55" stop-color="#60A5FA"/>
          <stop offset="1" stop-color="#A5B4FC"/>
        </linearGradient>
      </defs>
      <g transform="translate(128 128) scale(1.14) translate(-128 -128)">
        <path d="M92 176V86c0-10 8-18 18-18h30c22 0 40 18 40 40s-18 40-40 40h-22"
              fill="none"
              stroke="url(#relayGradientOnboarding)"
              stroke-width="18"
              stroke-linecap="round"
              stroke-linejoin="round"/>
        <path d="M118 148l52 28"
              fill="none"
              stroke="url(#relayGradientOnboarding)"
              stroke-width="18"
              stroke-linecap="round"/>
        <circle cx="188" cy="176" r="10" fill="url(#relayGradientOnboarding)"/>
      </g>
    </svg>
  );
}

// ============================================
// Passphrase Generator (cryptographically secure)
// ============================================

// Word list for passphrase generation (EFF short word list subset - common, easy to type)
const WORD_LIST = [
  'acid', 'acorn', 'acre', 'acts', 'afar', 'aged', 'agent', 'ajar', 'alarm', 'album',
  'alert', 'alley', 'allot', 'allow', 'alloy', 'aloft', 'alone', 'amend', 'amino', 'ample',
  'angel', 'anger', 'angle', 'ankle', 'apple', 'april', 'apron', 'arena', 'argue', 'arise',
  'armor', 'army', 'arrow', 'asset', 'atom', 'attic', 'audio', 'audit', 'avoid', 'awake',
  'award', 'bacon', 'badge', 'bagel', 'baker', 'balsa', 'bench', 'berry', 'bike', 'bird',
  'blade', 'blank', 'blast', 'blaze', 'blend', 'blimp', 'block', 'bloom', 'blues', 'blunt',
  'board', 'boat', 'bonus', 'booth', 'boots', 'boss', 'brain', 'brand', 'brass', 'brave',
  'bread', 'break', 'breed', 'brick', 'bride', 'brief', 'bring', 'brisk', 'brook', 'broom',
  'brush', 'buddy', 'buggy', 'build', 'bunch', 'bunny', 'cabin', 'cable', 'cache', 'cadet',
  'cage', 'cake', 'calm', 'camel', 'camp', 'canal', 'candy', 'canon', 'cape', 'card',
  'cargo', 'carol', 'carry', 'carve', 'case', 'cash', 'cause', 'cedar', 'chain', 'chair',
  'chalk', 'champ', 'chant', 'chaos', 'charm', 'chart', 'chase', 'cheap', 'check', 'cheek',
  'chess', 'chest', 'chief', 'child', 'chill', 'chip', 'chord', 'chunk', 'cider', 'cigar',
  'cinch', 'city', 'civic', 'civil', 'clamp', 'clap', 'clash', 'clasp', 'class', 'clean',
  'clear', 'clerk', 'click', 'cliff', 'climb', 'cling', 'clip', 'cloak', 'clock', 'clone',
  'cloth', 'cloud', 'clown', 'club', 'clue', 'coach', 'coast', 'coat', 'cobra', 'cocoa',
];

function generateSecurePassphrase(wordCount: number = 4): string {
  const words: string[] = [];
  const randomValues = new Uint32Array(wordCount);
  
  // Use Web Crypto API for cryptographically secure random values
  crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < wordCount; i++) {
    const index = randomValues[i] % WORD_LIST.length;
    words.push(WORD_LIST[index]);
  }
  
  // Add a random number for extra entropy
  const numArray = new Uint32Array(1);
  crypto.getRandomValues(numArray);
  const randomNum = (numArray[0] % 900) + 100; // 100-999
  
  return words.join('-') + '-' + randomNum;
}

// ============================================
// Screens
// ============================================

export function WelcomeScreen() {
  return (
    <div class="flex flex-col items-center justify-center min-h-screen bg-[var(--color-bg-sunken)] px-6 py-12">
      <div class="mb-8">
        <RelayGlyphIcon size={80} />
      </div>

      <h1 class="text-3xl font-bold text-[var(--color-text-primary)] mb-3">Welcome to Relay</h1>
      
      <p class="text-base text-[var(--color-text-secondary)] mb-10 text-center max-w-md">
        One identity. Every conversation. Zero exposure.
      </p>

      <div class="w-full max-w-md space-y-4 mb-10">
        <div class="flex items-start gap-3 p-4 bg-[var(--color-bg-elevated)] rounded-lg border border-[var(--color-border-default)]">
          <span class="text-[var(--color-text-secondary)] mt-0.5"><LockIcon size={20} /></span>
          <div class="flex flex-col gap-1">
            <strong class="text-sm font-semibold text-[var(--color-text-primary)]">Zero-knowledge encryption</strong>
            <span class="text-sm text-[var(--color-text-secondary)]">Your messages never touch our servers unencrypted</span>
          </div>
        </div>
        <div class="flex items-start gap-3 p-4 bg-[var(--color-bg-elevated)] rounded-lg border border-[var(--color-border-default)]">
          <span class="text-[var(--color-text-secondary)] mt-0.5"><MailIcon size={20} /></span>
          <div class="flex flex-col gap-1">
            <strong class="text-sm font-semibold text-[var(--color-text-primary)]">Disposable edges</strong>
            <span class="text-sm text-[var(--color-text-secondary)]">Email, links, and more — each connection is isolated</span>
          </div>
        </div>
        <div class="flex items-start gap-3 p-4 bg-[var(--color-bg-elevated)] rounded-lg border border-[var(--color-border-default)]">
          <span class="text-[var(--color-text-secondary)] mt-0.5"><UserIcon size={20} /></span>
          <div class="flex flex-col gap-1">
            <strong class="text-sm font-semibold text-[var(--color-text-primary)]">Claim your &handle</strong>
            <span class="text-sm text-[var(--color-text-secondary)]">A portable identity you own forever</span>
          </div>
        </div>
      </div>

      <button
        class="w-full max-w-md px-6 py-3 bg-[var(--color-primary)] text-[var(--color-text-inverse)] font-semibold rounded-lg hover:bg-[var(--color-primary-hover)] transition-colors text-base"
        onClick={() => { onboardingStep.value = 'create-passphrase'; }}
      >
        Get Started
      </button>

      <p class="text-sm text-[var(--color-text-secondary)] mt-6">
        Already have an identity? <a href="#" class="text-slate-700 hover:text-slate-900 font-medium underline" onClick={(e) => {
          e.preventDefault();
          // TODO: Import flow
          showToast('Import coming soon');
        }}>Import backup</a>
      </p>
    </div>
  );
}

export function CreatePassphraseScreen() {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = passphrase.length >= 8 && passphrase === confirmPassphrase;

  function handleGeneratePassphrase() {
    const generated = generateSecurePassphrase(4);
    setPassphrase(generated);
    setConfirmPassphrase(generated);
    setShowPassphrase(true); // Show it so user can see and save it
  }

  async function handleCreate() {
    if (!isValid) return;

    setError(null);
    const result = await createIdentity(passphrase);
    
    if (!result.success) {
      setError(result.error || 'Failed to create identity');
    }
  }

  return (
    <div class="flex flex-col min-h-screen bg-[var(--color-bg-sunken)] px-6 py-8">
      <button 
        class="self-start mb-6 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded transition-colors"
        onClick={() => { onboardingStep.value = 'welcome'; }}
      >
        ← Back
      </button>

      <div class="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <h1 class="text-3xl font-bold text-[var(--color-text-primary)] mb-3">Create Passphrase</h1>
        
        <p class="text-base text-[var(--color-text-secondary)] mb-8">
          Your passphrase encrypts your identity. You'll need it to unlock Relay.
        </p>

        <div class="mb-6">
          <div class="flex items-center justify-between mb-2">
            <label class="text-sm font-medium text-[var(--color-text-primary)]">Passphrase</label>
            <button 
              type="button" 
              class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-slate-100 rounded transition-colors"
              onClick={handleGeneratePassphrase}
              title="Generate a secure random passphrase"
            >
              <DiceIcon size={14} />
              <span>Generate</span>
            </button>
          </div>
          <div class="relative">
            <input
              type={showPassphrase ? 'text' : 'password'}
              class="w-full px-3 py-2.5 pr-10 text-sm border border-[var(--color-border-strong)] rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              placeholder="Enter a strong passphrase"
              value={passphrase}
              onInput={(e) => setPassphrase((e.target as HTMLInputElement).value)}
              autoFocus
            />
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] rounded transition-colors"
              onClick={() => setShowPassphrase(!showPassphrase)}
            >
              {showPassphrase ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          <div class="mt-1.5 min-h-[20px]">
            {passphrase.length > 0 && passphrase.length < 8 && (
              <span class="text-xs text-red-600">At least 8 characters required</span>
            )}
          </div>
        </div>

        <div class="mb-6">
          <label class="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Confirm Passphrase</label>
          <input
            type={showPassphrase ? 'text' : 'password'}
            class="w-full px-3 py-2.5 text-sm border border-[var(--color-border-strong)] rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            placeholder="Confirm your passphrase"
            value={confirmPassphrase}
            onInput={(e) => setConfirmPassphrase((e.target as HTMLInputElement).value)}
          />
          <div class="mt-1.5 min-h-[20px]">
            {confirmPassphrase.length > 0 && passphrase !== confirmPassphrase && (
              <span class="text-xs text-red-600">Passphrases don't match</span>
            )}
          </div>
        </div>

        {error && <div class="mb-6 p-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-lg">{error}</div>}

        <div class="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
          <div class="text-amber-600 mt-0.5"><AlertIcon size={20} /></div>
          <div class="flex-1">
            <strong class="text-sm font-semibold text-amber-900 block mb-1">Important</strong>
            <p class="text-sm text-amber-800">There's no way to recover your passphrase. If you forget it, you'll lose access to this identity forever—but you can always create a new one.</p>
          </div>
        </div>

        <button
          class="w-full px-6 py-3 bg-[var(--color-primary)] text-[var(--color-text-inverse)] font-semibold rounded-lg hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-text-tertiary)] disabled:cursor-not-allowed transition-colors text-base"
          onClick={handleCreate}
          disabled={!isValid || isLoading.value}
        >
          {isLoading.value ? 'Creating...' : 'Create Identity'}
        </button>
      </div>
    </div>
  );
}

// ============================================
// Backup Icon
// ============================================

function DownloadIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CheckCircleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ShieldIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function BackupIdentityScreen() {
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const passphrase = pendingPassphrase.value;
  const identity = currentIdentity.value;

  function generateBackupFile(): string {
    const backupData = {
      version: 1,
      type: 'relay-identity-backup',
      createdAt: new Date().toISOString(),
      identity: {
        fingerprint: identity?.id || '',
        publicKey: identity?.publicKey || '',
      },
      // The passphrase itself - user must keep this safe
      passphrase: passphrase || '',
      instructions: [
        'This file contains your Relay identity backup.',
        'Store it securely - anyone with this file can access your identity.',
        'Your passphrase is included for recovery purposes.',
        'To restore: Import this file in Relay settings.',
      ],
    };
    return JSON.stringify(backupData, null, 2);
  }

  function handleDownload() {
    const content = generateBackupFile();
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `relay-backup-${identity?.id?.slice(0, 8) || 'identity'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setHasDownloaded(true);
    showToast('Backup downloaded!');
  }

  function handleContinue() {
    // Clear the pending passphrase from memory
    pendingPassphrase.value = null;
    onboardingStep.value = 'create-edge';
  }

  return (
    <div class="flex flex-col min-h-screen bg-[var(--color-bg-sunken)] px-6 py-8">
      <div class="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full">
        <div class="mb-8 text-[var(--color-text-secondary)]">
          <ShieldIcon />
        </div>

        <h1 class="text-3xl font-bold text-[var(--color-text-primary)] mb-3 text-center">Save Your Backup</h1>
        
        <p class="text-base text-[var(--color-text-secondary)] mb-8 text-center">
          Download your recovery file now. This is the <strong class="font-semibold text-[var(--color-text-primary)]">only way</strong> to recover your identity if you forget your passphrase.
        </p>

        <div class="w-full bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg overflow-hidden mb-6">
          <div class="px-4 py-3 bg-[var(--color-bg-sunken)] border-b border-[var(--color-border-default)] flex items-center justify-between">
            <span class="text-sm font-medium text-[var(--color-text-primary)]">Recovery File</span>
            {hasDownloaded && (
              <span class="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <CheckCircleIcon size={14} /> Saved
              </span>
            )}
          </div>
          <div class="px-4 py-3 space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-xs font-medium text-[var(--color-text-secondary)]">Fingerprint</span>
              <code class="text-xs font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-hover)] px-2 py-1 rounded">{identity?.id?.slice(0, 16)}...</code>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-xs font-medium text-[var(--color-text-secondary)]">Passphrase</span>
              <code class="text-xs font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-hover)] px-2 py-1 rounded max-w-[180px] truncate">{passphrase?.slice(0, 20)}{(passphrase?.length || 0) > 20 ? '...' : ''}</code>
            </div>
          </div>
          <button
            class="w-full px-4 py-3 bg-[var(--color-bg-hover)] hover:bg-[var(--color-bg-active)] text-[var(--color-text-primary)] font-medium text-sm flex items-center justify-center gap-2 transition-colors"
            onClick={handleDownload}
          >
            <DownloadIcon size={18} />
            <span>{hasDownloaded ? 'Download Again' : 'Download Backup'}</span>
          </button>
        </div>

        <div class="w-full p-4 bg-amber-50 border border-amber-200 rounded-lg flex gap-3 mb-8">
          <div class="text-amber-600 mt-0.5"><AlertIcon size={20} /></div>
          <div class="flex-1">
            <strong class="text-sm font-semibold text-amber-900 block mb-1">Store this file safely</strong>
            <p class="text-sm text-amber-800">Keep it in a secure location like a password manager or encrypted drive. Anyone with this file can access your Relay identity.</p>
          </div>
        </div>

        <button
          class="w-full px-6 py-3 bg-[var(--color-primary)] text-[var(--color-text-inverse)] font-semibold rounded-lg hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-text-tertiary)] disabled:cursor-not-allowed transition-colors text-base mb-4"
          onClick={handleContinue}
          disabled={!hasDownloaded}
        >
          {hasDownloaded ? 'Continue' : 'Download backup to continue'}
        </button>

        {!hasDownloaded && (
          <p class="text-sm text-center">
            <button class="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline" onClick={() => {
              if (confirm('Are you sure? Without a backup, you cannot recover your identity if you forget your passphrase.')) {
                pendingPassphrase.value = null;
                onboardingStep.value = 'create-edge';
              }
            }}>
              I understand the risks, skip backup
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

// Icons for edge types
function LinkIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function AtSignIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
    </svg>
  );
}

function HandleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function CreateFirstEdgeScreen() {
  const [selectedEdgeType, setSelectedEdgeType] = useState<string>('email');
  const [handleName, setHandleName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load edge types on mount
  useEffect(() => {
    loadEdgeTypes();
  }, []);

  const availableEdgeTypes = edgeTypes.value;
  const selectedType = availableEdgeTypes.find(t => t.id === selectedEdgeType);

  // Handle validation for native edges
  const cleanHandle = handleName.toLowerCase().replace(/^&/, '').trim();
  const isValidHandle = /^[a-z][a-z0-9_]{2,23}$/.test(cleanHandle);

  async function handleCreateNativeEdge() {
    if (!isValidHandle) {
      setError('Invalid handle format');
      return;
    }

    setLoading(true);
    setError(null);

    const result = await createEdge(
      'native',
      undefined, // label not used for handles
      cleanHandle, // customAddress = the handle name
      displayName.trim() || undefined
    );
    
    setLoading(false);

    if (result.success) {
      showToast(`Handle &${cleanHandle} created!`);
      onboardingStep.value = 'complete';
    } else {
      setError(result.error || 'Failed to create handle');
    }
  }

  async function handleCreateEmailEdge() {
    setLoading(true);
    setError(null);

    const result = await createEdge('email', label || undefined);
    
    setLoading(false);

    if (result.success) {
      showToast(`Email edge created: ${result.edge.address}`);
      onboardingStep.value = 'complete';
    } else {
      setError(result.error || 'Failed to create email edge');
    }
  }

  function handleCreate() {
    if (selectedEdgeType === 'native') {
      handleCreateNativeEdge();
    } else {
      handleCreateEmailEdge();
    }
  }

  function handleSkip() {
    completeOnboarding();
  }

  // Default edge type descriptions if not loaded from server
  const edgeTypeInfo = [
    {
      id: 'native',
      icon: <HandleIcon size={22} />,
      name: 'Native Handle',
      description: 'Claim a unique &handle for private, end-to-end encrypted messaging with other Relay users.',
      securityBadge: 'E2E Encrypted',
      example: '&yourname',
    },
    {
      id: 'email',
      icon: <AtSignIcon size={22} />,
      name: 'Email Edge',
      description: 'Generate a disposable email address. Forward emails through Relay while keeping your real address private.',
      securityBadge: 'Gateway Secured',
      example: 'abc123@rlymsg.com',
    },
  ];

  return (
    <div class="flex flex-col min-h-screen bg-[var(--color-bg-sunken)] px-6 py-8">
      <div class="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div class="mb-6 text-[var(--color-text-secondary)] flex justify-center">
          <LinkIcon size={48} />
        </div>

        <h1 class="text-3xl font-bold text-[var(--color-text-primary)] mb-3 text-center">Create Your First Edge</h1>
        
        <p class="text-base text-[var(--color-text-secondary)] mb-6 text-center">
          Edges are your communication surfaces — each one is isolated and disposable, protecting your core identity.
        </p>

        {/* Educational blurb */}
        <div class="mb-6 p-4 bg-sky-50 border border-sky-200 rounded-lg">
          <h3 class="text-sm font-semibold text-sky-900 mb-2">What are edges?</h3>
          <p class="text-sm text-sky-800">
            Think of edges as aliases that connect you to the outside world. You can create unlimited edges, share them freely, and burn them anytime — all without exposing your true identity.
          </p>
        </div>

        {/* Edge type selection */}
        <div class="space-y-3 mb-6">
          {edgeTypeInfo.map(edgeType => (
            <label 
              key={edgeType.id}
              class={`flex items-start gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all duration-150 ${
                selectedEdgeType === edgeType.id
                  ? 'border-slate-600 bg-slate-50' 
                  : 'border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-sunken)]'
              }`}
            >
              <input
                type="radio"
                name="edgeType"
                value={edgeType.id}
                checked={selectedEdgeType === edgeType.id}
                onChange={() => {
                  setSelectedEdgeType(edgeType.id);
                  setError(null);
                }}
                class="mt-1 cursor-pointer w-[18px] h-[18px] flex-shrink-0"
              />
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class={selectedEdgeType === edgeType.id ? 'text-slate-700' : 'text-[var(--color-text-secondary)]'}>
                    {edgeType.icon}
                  </span>
                  <span class={`font-semibold ${selectedEdgeType === edgeType.id ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-primary)]'}`}>
                    {edgeType.name}
                  </span>
                  <span class={`text-xs px-2 py-0.5 rounded-full ${
                    edgeType.securityBadge === 'E2E Encrypted' 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {edgeType.securityBadge}
                  </span>
                </div>
                <p class="text-sm text-[var(--color-text-secondary)] mb-2">{edgeType.description}</p>
                <code class="text-xs font-mono bg-[var(--color-bg-hover)] px-2 py-1 rounded text-[var(--color-text-primary)]">{edgeType.example}</code>
              </div>
            </label>
          ))}
        </div>

        {/* Dynamic input based on edge type */}
        {selectedEdgeType === 'native' && (
          <div class="space-y-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Your Handle</label>
              <div class="flex border border-[var(--color-border-strong)] rounded-lg overflow-hidden">
                <span class="px-3 py-2.5 bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] font-semibold border-r border-[var(--color-border-strong)]">&</span>
                <input
                  type="text"
                  value={handleName}
                  onInput={(e) => {
                    setHandleName((e.target as HTMLInputElement).value);
                    setError(null);
                  }}
                  placeholder="yourname"
                  pattern="[a-z0-9_]{3,24}"
                  maxLength={24}
                  class="flex-1 px-3 py-2.5 text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-sky-500"
                  autoFocus
                />
              </div>
              <div class="mt-1.5 min-h-[20px]">
                {handleName.length > 0 && !isValidHandle && (
                  <span class="text-xs text-red-600">
                    3-24 characters, starts with letter, letters/numbers/underscores only
                  </span>
                )}
                {isValidHandle && (
                  <span class="text-xs text-emerald-600">✓ Valid handle</span>
                )}
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Display Name <span class="text-[var(--color-text-tertiary)]">(optional)</span></label>
              <input
                type="text"
                value={displayName}
                onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                placeholder="Your Name"
                maxLength={50}
                class="w-full px-3 py-2.5 border border-[var(--color-border-strong)] rounded-lg text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>
        )}

        {selectedEdgeType === 'email' && (
          <div class="mb-6">
            <label class="block text-sm font-medium text-[var(--color-text-primary)] mb-2">Label <span class="text-[var(--color-text-tertiary)]">(optional)</span></label>
            <input
              type="text"
              value={label}
              onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
              placeholder="e.g., Shopping, Newsletters"
              class="w-full px-3 py-2.5 border border-[var(--color-border-strong)] rounded-lg text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <p class="text-xs text-[var(--color-text-tertiary)] mt-2">
              A random email address will be generated for you.
            </p>
          </div>
        )}

        {error && <div class="mb-4 p-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-lg">{error}</div>}

        <button
          class="w-full px-6 py-3 bg-[var(--color-primary)] text-[var(--color-text-inverse)] font-semibold rounded-lg hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-text-tertiary)] disabled:cursor-not-allowed transition-colors text-base mb-3"
          onClick={handleCreate}
          disabled={loading || (selectedEdgeType === 'native' && !isValidHandle)}
        >
          {loading ? 'Creating...' : `Create ${selectedEdgeType === 'native' ? 'Handle' : 'Email Edge'}`}
        </button>

        <button
          class="w-full px-6 py-3 bg-[var(--color-bg-active)] text-[var(--color-text-primary)] font-semibold rounded-lg hover:bg-[var(--color-bg-active)] transition-colors text-base"
          onClick={handleSkip}
        >
          Skip for now
        </button>

        <p class="text-sm text-[var(--color-text-secondary)] text-center mt-6">
          You can create more edges anytime from the Edges tab.
        </p>
      </div>
    </div>
  );
}

export function CompleteScreen() {
  return (
    <div class="flex flex-col items-center justify-center min-h-screen bg-[var(--color-bg-sunken)] px-6 py-12">
      <div class="mb-6">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <circle cx="40" cy="40" r="38" stroke="#10B981" stroke-width="2" />
          <path
            d="M24 40 L35 51 L56 30"
            stroke="#10B981"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </div>

      <h1 class="text-3xl font-bold text-[var(--color-text-primary)] mb-3">You're All Set!</h1>
      
      <p class="text-base text-[var(--color-text-secondary)] mb-6 text-center max-w-sm">
        Your Relay identity is ready. You're now in control.
      </p>

      {/* Security highlights */}
      <div class="w-full max-w-md bg-gradient-to-br from-slate-50 to-sky-50 border border-slate-200 rounded-xl p-5 mb-6">
        <h3 class="text-sm font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Your privacy, by design
        </h3>
        <div class="space-y-3 text-sm">
          <div class="flex items-start gap-3">
            <span class="text-emerald-600 mt-0.5">✓</span>
            <div>
              <strong class="text-[var(--color-text-primary)]">Zero-knowledge architecture</strong>
              <p class="text-[var(--color-text-secondary)] text-xs mt-0.5">We can't read your messages — ever. All encryption happens on your device.</p>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <span class="text-emerald-600 mt-0.5">✓</span>
            <div>
              <strong class="text-[var(--color-text-primary)]">Disposable edges</strong>
              <p class="text-[var(--color-text-secondary)] text-xs mt-0.5">Every handle and email alias is isolated. Burn one, keep the rest.</p>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <span class="text-emerald-600 mt-0.5">✓</span>
            <div>
              <strong class="text-[var(--color-text-primary)]">You own your identity</strong>
              <p class="text-[var(--color-text-secondary)] text-xs mt-0.5">Your cryptographic keys live on your device. No accounts, no passwords stored with us.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="w-full max-w-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg p-4 space-y-3 mb-8">
        {currentIdentity.value?.handle && (
          <div class="flex justify-between items-center">
            <span class="text-sm font-medium text-[var(--color-text-secondary)]">Handle</span>
            <span class="text-sm font-semibold text-[var(--color-text-primary)]">&amp;{currentIdentity.value.handle}</span>
          </div>
        )}
        <div class="flex justify-between items-center">
          <span class="text-sm font-medium text-[var(--color-text-secondary)]">Fingerprint</span>
          <span class="text-xs font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-hover)] px-2 py-1 rounded">{currentIdentity.value?.id.slice(0, 16)}...</span>
        </div>
      </div>

      <button
        class="w-full max-w-md px-6 py-3 bg-[var(--color-primary)] text-[var(--color-text-inverse)] font-semibold rounded-lg hover:bg-[var(--color-primary-hover)] transition-colors text-base"
        onClick={() => completeOnboarding()}
      >
        Start Using Relay
      </button>
    </div>
  );
}
