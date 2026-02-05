import { signal } from '@preact/signals';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { InboxView } from './views/InboxView';
import { FullscreenInboxView } from './views/FullscreenInboxView';
import { FullscreenNewView } from './views/FullscreenNewView';
import { FullscreenEdgesView } from './views/FullscreenEdgesView';
import { FullscreenIdentityView } from './views/FullscreenIdentityView';
import { NewView } from './views/NewView';
import { IdentityView } from './views/IdentityView';
import { EdgesView } from './views/EdgesView';
import { LockScreen } from './views/LockScreen';
import {
  WelcomeScreen,
  CreatePassphraseScreen,
  BackupIdentityScreen,
  CreateFirstEdgeScreen,
  CompleteScreen,
} from './views/OnboardingViews';
import { appState, onboardingStep, toastMessage } from './state';

export type Tab = 'inbox' | 'new' | 'edges' | 'identity';

export const activeTab = signal<Tab>('inbox');

// Detect if we're in fullscreen mode
export function isFullscreenMode(): boolean {
  return window.location.pathname.includes('fullscreen') || 
         new URLSearchParams(window.location.search).has('fullscreen');
}

function LoadingScreen() {
  return (
    <div class="loading-screen">
      <div class="loading-spinner"></div>
      <p>Loading...</p>
    </div>
  );
}

function OnboardingFlow() {
  switch (onboardingStep.value) {
    case 'welcome':
      return <WelcomeScreen />;
    case 'create-passphrase':
      return <CreatePassphraseScreen />;
    case 'backup-identity':
      return <BackupIdentityScreen />;
    case 'create-edge':
      return <CreateFirstEdgeScreen />;
    case 'complete':
      return <CompleteScreen />;
    default:
      return <WelcomeScreen />;
  }
}

function MainApp() {
  const isFullscreen = isFullscreenMode();
  
  if (isFullscreen) {
    return <FullscreenMainApp />;
  }
  
  return (
    <div class="flex flex-col h-screen">
      <Header />
      <main class="flex-1 overflow-y-auto">
        {activeTab.value === 'inbox' && <InboxView />}
        {activeTab.value === 'new' && <NewView />}
        {activeTab.value === 'edges' && <EdgesView />}
        {activeTab.value === 'identity' && <IdentityView />}
      </main>
      <TabBar />
    </div>
  );
}

function FullscreenMainApp() {
  return (
    <div class="flex flex-col h-screen bg-[var(--color-bg-hover)]">
      <Header />
      <div class="flex-1 flex overflow-hidden">
        {/* Sidebar navigation for fullscreen */}
        <nav class="w-16 flex-shrink-0 bg-[var(--color-bg-elevated)] border-r border-[var(--color-border-default)] flex flex-col items-center py-4 gap-2">
          <NavButton 
            tab="inbox" 
            icon={<InboxIcon />} 
            label="Inbox"
          />
          <NavButton 
            tab="new" 
            icon={<ComposeIcon />} 
            label="New"
          />
          <NavButton 
            tab="edges" 
            icon={<EdgeIcon />} 
            label="Edges"
          />
          <NavButton 
            tab="identity" 
            icon={<UserIcon />} 
            label="Identity"
          />
        </nav>
        
        {/* Main content area */}
        <main class="flex-1 overflow-hidden">
          {activeTab.value === 'inbox' && <FullscreenInboxView />}
          {activeTab.value === 'new' && <FullscreenNewView />}
          {activeTab.value === 'edges' && <FullscreenEdgesView />}
          {activeTab.value === 'identity' && <FullscreenIdentityView />}
        </main>
      </div>
    </div>
  );
}

// Fullscreen sidebar navigation button
function NavButton({ tab, icon, label }: { tab: Tab; icon: preact.JSX.Element; label: string }) {
  const isActive = activeTab.value === tab;
  
  return (
    <button
      class={`w-12 h-12 flex flex-col items-center justify-center rounded-lg transition-all duration-150 cursor-pointer group ${
        isActive 
          ? 'bg-sky-50 text-sky-600' 
          : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
      }`}
      onClick={() => { activeTab.value = tab; }}
      title={label}
    >
      {icon}
      <span class={`text-[10px] mt-0.5 font-medium ${isActive ? 'text-sky-600' : 'text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-primary)]'}`}>
        {label}
      </span>
    </button>
  );
}

// Navigation icons
function InboxIcon() {
  return (
    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M22 12h-6l-2 3H10l-2-3H2" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </svg>
  );
}

function ComposeIcon() {
  return (
    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M12 5v14M5 12h14" stroke-linecap="round" />
    </svg>
  );
}

function EdgeIcon() {
  return (
    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function Toast() {
  if (!toastMessage.value) return null;
  
  return (
    <div class="toast">
      {toastMessage.value}
    </div>
  );
}

export function App() {
  return (
    <>
      {appState.value === 'loading' && <LoadingScreen />}
      {appState.value === 'onboarding' && <OnboardingFlow />}
      {appState.value === 'locked' && <LockScreen />}
      {appState.value === 'unlocked' && <MainApp />}
      <Toast />
    </>
  );
}
