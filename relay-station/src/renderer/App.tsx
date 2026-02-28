import { useState, useEffect } from 'react';
import { ModelManager } from './components/ModelManager';
import { OllamaSetup } from './components/OllamaSetup';
import { RelayAIOperator } from './components/RelayAIOperator';
import type { AppConfig, LLMProvider } from '../shared/types';

type View = 'dashboard' | 'models' | 'relayai';

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [llmProviders, setLlmProviders] = useState<LLMProvider[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ollamaReady, setOllamaReady] = useState(false);
  const [hardwareSpecs, setHardwareSpecs] = useState<any>(null);

  // Startup sequence
  const [startupDone, setStartupDone] = useState(false);
  const [startupPhase, setStartupPhase] = useState<{ phase: string; message: string; step: number; total: number }>({
    phase: 'init',
    message: 'Preparing AI runtime...',
    step: 0,
    total: 4,
  });

  // On mount: subscribe to status events from main, then trigger the boot cleanup.
  // restartClean() kills orphaned Ollama runners (which silently hold VRAM across sessions)
  // and starts a fresh instance so models load fully onto GPU.
  useEffect(() => {
    window.electronAPI.onStartupStatus?.((data) => {
      setStartupPhase(data);
    });

    const init = async () => {
      try {
        await window.electronAPI.startupClean?.();
        setOllamaReady(true);
      } catch {
        // Cleanup failed — check if Ollama is at least reachable
        try {
          const status = await window.electronAPI.ollamaStatus();
          setOllamaReady(status.running);
        } catch {
          setOllamaReady(false);
        }
      }
      setStartupDone(true);
    };
    init();
  }, []);

  useEffect(() => {
    if (!ollamaReady) return;
    loadData();
    
    window.electronAPI.onLLMStatusChange((providers) => {
      setLlmProviders(providers);
    });

    const interval = setInterval(async () => {
      const newStats = await window.electronAPI.getStats();
      setStats(newStats);
    }, 5000);

    return () => clearInterval(interval);
  }, [ollamaReady]);

  const loadData = async () => {
    try {
      const [configData, providers, statsData, hardware] = await Promise.all([
        window.electronAPI.getConfig(),
        window.electronAPI.detectLLMs(),
        window.electronAPI.getStats(),
        window.electronAPI.hardwareDetect?.() || Promise.resolve(null),
      ]);
      
      setConfig(configData);
      setLlmProviders(providers);
      setStats(statsData);
      setHardwareSpecs(hardware);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load data:', error);
      setLoading(false);
    }
  };

  // Boot startup — show friendly phase-by-phase screen while Ollama is
  // being restarted clean and VRAM is being freed
  if (!startupDone) {
    return <StartupScreen phase={startupPhase} />;
  }

  if (!ollamaReady) {
    return (
      <OllamaSetup
        onComplete={() => {
          setOllamaReady(true);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-border border-t-primary mx-auto mb-3"></div>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-card border-r border-border flex flex-col">
        {/* Logo / Brand */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <svg width="40" height="40" viewBox="20 20 216 216" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="relay-gradient" x1="44" y1="28" x2="212" y2="232" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#38BDF8"></stop>
                  <stop offset="0.55" stopColor="#60A5FA"></stop>
                  <stop offset="1" stopColor="#A5B4FC"></stop>
                </linearGradient>
              </defs>
              <g transform="translate(128 128) scale(1.14) translate(-128 -128)">
                <path d="M92 176V86c0-10 8-18 18-18h30c22 0 40 18 40 40s-18 40-40 40h-22" fill="none" stroke="url(#relay-gradient)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M118 148l52 28" fill="none" stroke="url(#relay-gradient)" strokeWidth="18" strokeLinecap="round"></path>
                <circle cx="188" cy="176" r="10" fill="url(#relay-gradient)"></circle>
              </g>
            </svg>
            <div>
              <h1 className="font-semibold text-lg">Relay Station</h1>
              <p className="text-xs text-muted-foreground">Local AI Platform</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3">
          <NavItem
            icon={<HomeIcon />}
            label="Dashboard"
            active={currentView === 'dashboard'}
            onClick={() => setCurrentView('dashboard')}
          />
          <NavItem
            icon={<ModelsIcon />}
            label="My Models"
            active={currentView === 'models'}
            onClick={() => setCurrentView('models')}
          />
          <NavItem
            icon={<CloudIcon />}
            label="AI Network"
            active={currentView === 'relayai'}
            onClick={() => setCurrentView('relayai')}
          />
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <div className="text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${ollamaReady ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span>{ollamaReady ? 'Ollama Running' : 'Ollama Offline'}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {currentView === 'dashboard' && (
          <DashboardView hardwareSpecs={hardwareSpecs} stats={stats} config={config} onNavigate={setCurrentView} />
        )}
        {currentView === 'models' && (
          <ModelManager />
        )}
        {currentView === 'relayai' && (
          <RelayAIOperator onNavigate={setCurrentView} />
        )}
      </main>
    </div>
  );
}

// Startup Screen — shown while main process kills stale Ollama runners and boots fresh
function StartupScreen({ phase }: {
  phase: { phase: string; message: string; step: number; total: number };
}) {
  const steps = [
    { label: 'Checking for previous sessions' },
    { label: 'Freeing GPU memory' },
    { label: 'Starting AI runtime' },
    { label: 'All systems ready' },
  ];

  const subtitles: Record<string, string> = {
    init:     'Just a moment…',
    checking: 'Looking for any leftover AI processes from your last session',
    clearing: 'Releasing GPU memory so your model loads at full speed',
    killing:  'Releasing GPU memory so your model loads at full speed',
    waiting:  'Waiting for memory to fully clear',
    starting: 'Launching a fresh instance of your AI runtime',
    ready:    "Your AI backbone is online and ready",
  };

  const subtitle = subtitles[phase.phase] ?? 'Just a moment…';

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center select-none">
      {/* Logo with soft pulse rings */}
      <div className="relative flex items-center justify-center mb-10">
        <div
          className="absolute w-28 h-28 rounded-full border border-primary/15 animate-ping"
          style={{ animationDuration: '2.8s' }}
        />
        <div
          className="absolute w-22 h-22 rounded-full border border-primary/20 animate-ping"
          style={{ animationDuration: '2.8s', animationDelay: '0.5s', width: '5.5rem', height: '5.5rem' }}
        />
        <div className="relative w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center shadow-lg">
          <svg width="36" height="36" viewBox="20 20 216 216" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="ss-gradient" x1="44" y1="28" x2="212" y2="232" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#38BDF8" />
                <stop offset="0.55" stopColor="#60A5FA" />
                <stop offset="1" stopColor="#A5B4FC" />
              </linearGradient>
            </defs>
            <g transform="translate(128 128) scale(1.14) translate(-128 -128)">
              <path d="M92 176V86c0-10 8-18 18-18h30c22 0 40 18 40 40s-18 40-40 40h-22" fill="none" stroke="url(#ss-gradient)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M118 148l52 28" fill="none" stroke="url(#ss-gradient)" strokeWidth="18" strokeLinecap="round" />
              <circle cx="188" cy="176" r="10" fill="url(#ss-gradient)" />
            </g>
          </svg>
        </div>
      </div>

      {/* Title + subtitle */}
      <h1 className="text-2xl font-bold mb-1.5">Relay Station</h1>
      <p className="text-sm text-muted-foreground mb-10 text-center max-w-xs leading-relaxed">
        {subtitle}
      </p>

      {/* Step checklist */}
      <div className="space-y-4 w-72">
        {steps.map((step, i) => {
          const stepNum = i + 1;
          const isDone = phase.step > stepNum;
          const isActive = phase.step === stepNum;
          const isPending = phase.step < stepNum;
          return (
            <div
              key={step.label}
              className={`flex items-center gap-3 transition-opacity duration-500 ${
                isPending ? 'opacity-25' : 'opacity-100'
              }`}
            >
              {/* Status icon */}
              <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                {isDone ? (
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : isActive ? (
                  <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-border mx-auto" />
                )}
              </div>
              {/* Label */}
              <span className={`text-sm transition-colors duration-300 ${
                isDone
                  ? 'text-muted-foreground line-through decoration-muted-foreground/40'
                  : isActive
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Navigation Item Component
function NavItem({ icon, label, active, onClick, badge }: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors mb-0.5 ${
        active
          ? 'bg-accent text-foreground font-medium'
          : 'text-muted-foreground hover:bg-accent/50'
      }`}
    >
      <span className={active ? '' : 'text-muted-foreground'}>{icon}</span>
      <span className="flex-1 text-left text-sm">{label}</span>
      {badge && (
        <span className="px-1.5 py-0.5 text-[10px] border border-border bg-muted text-muted-foreground rounded">
          {badge}
        </span>
      )}
    </button>
  );
}

// Dashboard View
function DashboardView({ hardwareSpecs, stats, config, onNavigate }: {
  hardwareSpecs: any;
  stats: any;
  config: AppConfig | null;
  onNavigate: (view: View) => void;
}) {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Manage your local AI infrastructure</p>
      </div>

      {/* Hardware Stats Card */}
      {hardwareSpecs && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CpuIcon />
            System Specifications
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* CPU */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Processor</p>
                <p className="font-medium text-sm">{hardwareSpecs.cpu.brand}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {hardwareSpecs.cpu.physicalCores} cores @ {hardwareSpecs.cpu.speed}GHz
                </p>
              </div>
            </div>

            {/* RAM */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Memory</p>
                <p className="font-medium text-sm">{hardwareSpecs.ram.total}GB RAM</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {hardwareSpecs.ram.available}GB available
                </p>
                <div className="w-full bg-accent rounded-full h-1.5 mt-2">
                  <div
                    className="bg-green-600 h-1.5 rounded-full"
                    style={{ width: `${((hardwareSpecs.ram.total - hardwareSpecs.ram.used) / hardwareSpecs.ram.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* GPU */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-accent rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Graphics</p>
                {hardwareSpecs.gpu ? (
                  <>
                    <p className="font-medium text-sm">{hardwareSpecs.gpu.model}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {hardwareSpecs.gpu.vram}GB VRAM
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No dedicated GPU</p>
                )}
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="mt-6 pt-4 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-2">RECOMMENDED MODELS</p>
            <div className="flex flex-wrap gap-2">
              {hardwareSpecs.ram.total >= 32 ? (
                <>
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 rounded text-xs font-medium">
                    70B+ Models
                  </span>
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 rounded text-xs font-medium">
                    High Performance
                  </span>
                </>
              ) : hardwareSpecs.ram.total >= 16 ? (
                <>
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded text-xs font-medium">
                    13B Models
                  </span>
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded text-xs font-medium">
                    Balanced
                  </span>
                </>
              ) : (
                <>
                  <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 rounded text-xs font-medium">
                    3B-7B Models
                  </span>
                  <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 rounded text-xs font-medium">
                    Lightweight
                  </span>
                </>
              )}
              {hardwareSpecs.gpu && (
                <span className="px-2 py-1 border border-border bg-accent/50 text-muted-foreground rounded text-xs font-medium">
                  GPU Accelerated
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => onNavigate('models')}
          className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-all text-left group"
        >
          <ModelsIcon className="w-8 h-8 text-primary mb-3" />
          <h3 className="font-semibold mb-1">Browse Models</h3>
          <p className="text-sm text-muted-foreground">Explore and download AI models</p>
        </button>

        <button
          onClick={() => onNavigate('relayai')}
          className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-all text-left group"
        >
          <CloudIcon className="w-8 h-8 text-primary mb-3" />
          <h3 className="font-semibold mb-1">Become an Operator</h3>
          <p className="text-sm text-muted-foreground">Join RelayAI network and earn</p>
        </button>

        <button
          className="bg-card border border-border rounded-lg p-6 opacity-50 cursor-not-allowed text-left"
          disabled
        >
          <svg className="w-8 h-8 text-muted-foreground mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h3 className="font-semibold mb-1">Coming Soon</h3>
          <p className="text-sm text-muted-foreground">More features in development</p>
        </button>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Activity</h2>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Requests</p>
              <p className="text-2xl font-bold">{stats.totalRequests || 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Active Connections</p>
              <p className="text-2xl font-bold">{stats.activeConnections || 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Uptime</p>
              <p className="text-2xl font-bold">{stats.uptime || '0h'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function HomeIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function ModelsIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function BridgesIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function CloudIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  );
}

function SettingsIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function CpuIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  );
}

export default App;
