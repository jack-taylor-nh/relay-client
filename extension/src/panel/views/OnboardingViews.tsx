import { useState } from 'preact/hooks';
import { onboardingStep, createIdentity, claimHandle, isLoading, showToast, completeOnboarding, currentIdentity, pendingPassphrase } from '../state';

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
    <div class="onboarding-screen welcome-screen">
      <div class="onboarding-logo">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="30" stroke="var(--accent)" stroke-width="2" />
          <path
            d="M20 32 L28 40 L44 24"
            stroke="var(--accent)"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </div>

      <h1 class="onboarding-title">Welcome to Relay</h1>
      
      <p class="onboarding-subtitle">
        Private, handle-based communication that you control.
      </p>

      <div class="feature-list">
        <div class="feature-item">
          <span class="feature-icon"><LockIcon size={20} /></span>
          <div class="feature-text">
            <strong>End-to-end encrypted</strong>
            <span>Messages are encrypted on your device</span>
          </div>
        </div>
        <div class="feature-item">
          <span class="feature-icon"><MailIcon size={20} /></span>
          <div class="feature-text">
            <strong>Email aliases</strong>
            <span>Generate disposable addresses</span>
          </div>
        </div>
        <div class="feature-item">
          <span class="feature-icon"><UserIcon size={20} /></span>
          <div class="feature-text">
            <strong>Your handle, your identity</strong>
            <span>Claim a unique &handle</span>
          </div>
        </div>
      </div>

      <button
        class="btn btn-primary btn-lg"
        onClick={() => { onboardingStep.value = 'create-passphrase'; }}
      >
        Get Started
      </button>

      <p class="onboarding-footer">
        Already have an identity? <a href="#" onClick={(e) => {
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
    <div class="onboarding-screen passphrase-screen">
      <button 
        class="back-btn"
        onClick={() => { onboardingStep.value = 'welcome'; }}
      >
        ← Back
      </button>

      <h1 class="onboarding-title">Create Passphrase</h1>
      
      <p class="onboarding-subtitle">
        Your passphrase encrypts your identity. You'll need it to unlock Relay.
      </p>

      <div class="form-group">
        <div class="label-row">
          <label class="form-label">Passphrase</label>
          <button 
            type="button" 
            class="generate-btn"
            onClick={handleGeneratePassphrase}
            title="Generate a secure random passphrase"
          >
            <DiceIcon size={14} />
            <span>Generate</span>
          </button>
        </div>
        <div class="input-wrapper">
          <input
            type={showPassphrase ? 'text' : 'password'}
            class="form-input"
            placeholder="Enter a strong passphrase"
            value={passphrase}
            onInput={(e) => setPassphrase((e.target as HTMLInputElement).value)}
            autoFocus
          />
          <button
            type="button"
            class="input-toggle"
            onClick={() => setShowPassphrase(!showPassphrase)}
          >
            {showPassphrase ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        <div class="input-hint">
          {passphrase.length > 0 && passphrase.length < 8 && (
            <span class="hint-error">At least 8 characters required</span>
          )}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Confirm Passphrase</label>
        <input
          type={showPassphrase ? 'text' : 'password'}
          class="form-input"
          placeholder="Confirm your passphrase"
          value={confirmPassphrase}
          onInput={(e) => setConfirmPassphrase((e.target as HTMLInputElement).value)}
        />
        <div class="input-hint">
          {confirmPassphrase.length > 0 && passphrase !== confirmPassphrase && (
            <span class="hint-error">Passphrases don't match</span>
          )}
        </div>
      </div>

      {error && <div class="error-message">{error}</div>}

      <div class="warning-box">
        <div class="warning-box-icon"><AlertIcon size={20} /></div>
        <div class="warning-box-content">
          <strong>Important</strong>
          <p>There's no way to recover your passphrase. If you forget it, you'll lose access to this identity forever—but you can always create a new one.</p>
        </div>
      </div>

      <button
        class="btn btn-primary btn-lg"
        onClick={handleCreate}
        disabled={!isValid || isLoading.value}
      >
        {isLoading.value ? 'Creating...' : 'Create Identity'}
      </button>
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
    onboardingStep.value = 'claim-handle';
  }

  return (
    <div class="onboarding-screen backup-screen">
      <div class="backup-icon">
        <ShieldIcon />
      </div>

      <h1 class="onboarding-title">Save Your Backup</h1>
      
      <p class="onboarding-subtitle">
        Download your recovery file now. This is the <strong>only way</strong> to recover your identity if you forget your passphrase.
      </p>

      <div class="backup-card">
        <div class="backup-card-header">
          <span>Recovery File</span>
          {hasDownloaded && (
            <span class="backup-downloaded-badge">
              <CheckCircleIcon size={14} /> Saved
            </span>
          )}
        </div>
        <div class="backup-card-content">
          <div class="backup-info-row">
            <span class="backup-label">Fingerprint</span>
            <code class="backup-value">{identity?.id?.slice(0, 16)}...</code>
          </div>
          <div class="backup-info-row">
            <span class="backup-label">Passphrase</span>
            <code class="backup-value passphrase-preview">{passphrase?.slice(0, 20)}{(passphrase?.length || 0) > 20 ? '...' : ''}</code>
          </div>
        </div>
        <button
          class="btn btn-secondary backup-download-btn"
          onClick={handleDownload}
        >
          <DownloadIcon size={18} />
          <span>{hasDownloaded ? 'Download Again' : 'Download Backup'}</span>
        </button>
      </div>

      <div class="warning-box">
        <div class="warning-box-icon"><AlertIcon size={20} /></div>
        <div class="warning-box-content">
          <strong>Store this file safely</strong>
          <p>Keep it in a secure location like a password manager or encrypted drive. Anyone with this file can access your Relay identity.</p>
        </div>
      </div>

      <button
        class="btn btn-primary btn-lg"
        onClick={handleContinue}
        disabled={!hasDownloaded}
      >
        {hasDownloaded ? 'Continue' : 'Download backup to continue'}
      </button>

      {!hasDownloaded && (
        <p class="skip-backup-note">
          <button class="link-btn" onClick={() => {
            if (confirm('Are you sure? Without a backup, you cannot recover your identity if you forget your passphrase.')) {
              pendingPassphrase.value = null;
              onboardingStep.value = 'claim-handle';
            }
          }}>
            I understand the risks, skip backup
          </button>
        </p>
      )}
    </div>
  );
}

export function ClaimHandleScreen() {
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Handle validation
  const cleanHandle = handle.toLowerCase().replace(/^&/, '').trim();
  const isValidFormat = /^[a-z][a-z0-9_]{2,23}$/.test(cleanHandle);

  async function handleClaim() {
    if (!isValidFormat) return;

    setError(null);
    setChecking(true);

    const result = await claimHandle(cleanHandle);
    
    setChecking(false);

    if (!result.success) {
      setError(result.error || 'Failed to claim handle');
    }
  }

  function handleSkip() {
    onboardingStep.value = 'complete';
  }

  return (
    <div class="onboarding-screen handle-screen">
      <h1 class="onboarding-title">Claim Your Handle</h1>
      
      <p class="onboarding-subtitle">
        Your handle is your public identity on Relay. Others can message you at &amp;{cleanHandle || 'yourname'}.
      </p>

      <div class="form-group">
        <label class="form-label">Handle</label>
        <div class="handle-input-wrapper">
          <span class="handle-prefix">&amp;</span>
          <input
            type="text"
            class="form-input handle-input"
            placeholder="yourname"
            value={handle}
            onInput={(e) => {
              setHandle((e.target as HTMLInputElement).value);
              setError(null);
            }}
            autoFocus
          />
        </div>
        <div class="input-hint">
          {handle.length > 0 && !isValidFormat && (
            <span class="hint-error">
              3-24 characters, starts with letter, letters/numbers/underscores only
            </span>
          )}
          {isValidFormat && (
            <span class="hint-success">✓ Valid format</span>
          )}
        </div>
      </div>

      {error && <div class="error-message">{error}</div>}

      <button
        class="btn btn-primary btn-lg"
        onClick={handleClaim}
        disabled={!isValidFormat || checking || isLoading.value}
      >
        {checking || isLoading.value ? 'Claiming...' : 'Claim Handle'}
      </button>

      <button
        class="btn btn-secondary"
        onClick={handleSkip}
      >
        Skip for now
      </button>

      <p class="onboarding-footer">
        You can claim a handle later from your wallet.
      </p>
    </div>
  );
}

export function CompleteScreen() {
  return (
    <div class="onboarding-screen complete-screen">
      <div class="success-animation">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <circle cx="40" cy="40" r="38" stroke="var(--success)" stroke-width="2" />
          <path
            d="M24 40 L35 51 L56 30"
            stroke="var(--success)"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </div>

      <h1 class="onboarding-title">You're All Set!</h1>
      
      <p class="onboarding-subtitle">
        Your Relay identity is ready.
      </p>

      <div class="identity-summary">
        {currentIdentity.value?.handle && (
          <div class="summary-item">
            <span class="summary-label">Handle</span>
            <span class="summary-value">&amp;{currentIdentity.value.handle}</span>
          </div>
        )}
        <div class="summary-item">
          <span class="summary-label">Fingerprint</span>
          <span class="summary-value fingerprint">{currentIdentity.value?.id.slice(0, 16)}...</span>
        </div>
      </div>

      <button
        class="btn btn-primary btn-lg"
        onClick={() => completeOnboarding()}
      >
        Start Using Relay
      </button>
    </div>
  );
}
