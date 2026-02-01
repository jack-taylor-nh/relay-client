import { signal } from '@preact/signals';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { InboxView } from './views/InboxView';
import { NewView } from './views/NewView';
import { WalletView } from './views/WalletView';
import { EdgesView } from './views/EdgesView';
import { LockScreen } from './views/LockScreen';
import {
  WelcomeScreen,
  CreatePassphraseScreen,
  BackupIdentityScreen,
  ClaimHandleScreen,
  CompleteScreen,
} from './views/OnboardingViews';
import { appState, onboardingStep, toastMessage } from './state';

export type Tab = 'inbox' | 'new' | 'edges' | 'wallet';

export const activeTab = signal<Tab>('inbox');

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
    case 'claim-handle':
      return <ClaimHandleScreen />;
    case 'complete':
      return <CompleteScreen />;
    default:
      return <WelcomeScreen />;
  }
}

function MainApp() {
  return (
    <div class="app-container">
      <Header />
      <main class="app-main">
        {activeTab.value === 'inbox' && <InboxView />}
        {activeTab.value === 'new' && <NewView />}
        {activeTab.value === 'edges' && <EdgesView />}
        {activeTab.value === 'wallet' && <WalletView />}
      </main>
      <TabBar />
    </div>
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
