import React, { useState, useEffect } from 'react';

interface OllamaSetupProps {
  onComplete: () => void;
}

type SetupStep = 'checking' | 'not-found' | 'downloading' | 'installing' | 'complete' | 'error';

export function OllamaSetup({ onComplete }: OllamaSetupProps) {
  const [step, setStep] = useState<SetupStep>('checking');
  const [autoDownload, setAutoDownload] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    checkOllamaStatus();
  }, []);

  const checkOllamaStatus = async () => {
    setStep('checking');
    try {
      const status = await window.electronAPI.ollamaStatus();
      
      if (status.running) {
        setStep('complete');
        setTimeout(onComplete, 500);
      } else {
        setStep('not-found');
      }
    } catch (error) {
      console.error('Failed to check Ollama status:', error);
      setStep('not-found');
    }
  };

  const handleAutoDownload = async () => {
    setStep('downloading');
    setErrorMessage('');

    try {
      // Start download with progress updates
      window.electronAPI.onOllamaDownloadProgress?.((progress) => {
        setDownloadProgress(progress);
      });

      const success = await window.electronAPI.downloadOllama?.();

      if (success) {
        setStep('installing');
        // Give it a moment to install
        setTimeout(async () => {
          await window.electronAPI.ollamaRestart();
          setStep('complete');
          setTimeout(onComplete, 1000);
        }, 2000);
      } else {
        setStep('error');
        setErrorMessage('Download failed. Please try the manual installation.');
      }
    } catch (error) {
      console.error('Download error:', error);
      setStep('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  };

  const handleManualDownload = () => {
    window.electronAPI.openExternal?.('https://ollama.com/download');
  };

  const handleBrowseForOllama = async () => {
    try {
      const path = await window.electronAPI.selectOllamaPath?.();
      if (path) {
        // Restart with custom path
        await window.electronAPI.ollamaRestart();
        await checkOllamaStatus();
      }
    } catch (error) {
      console.error('Failed to select Ollama path:', error);
    }
  };

  if (step === 'checking') {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Checking for Ollama...</p>
        </div>
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="inline-block p-4 bg-green-100 dark:bg-green-900/30 rounded-full">
            <svg className="w-12 h-12 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-xl font-medium">Ollama is ready!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-8">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-block p-4 bg-card border border-border rounded-2xl shadow-sm">
            <svg width="64" height="64" viewBox="20 20 216 216" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="relay-gradient-setup" x1="44" y1="28" x2="212" y2="232" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#38BDF8"></stop>
                  <stop offset="0.55" stopColor="#60A5FA"></stop>
                  <stop offset="1" stopColor="#A5B4FC"></stop>
                </linearGradient>
              </defs>
              <g transform="translate(128 128) scale(1.14) translate(-128 -128)">
                <path d="M92 176V86c0-10 8-18 18-18h30c22 0 40 18 40 40s-18 40-40 40h-22" fill="none" stroke="url(#relay-gradient-setup)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M118 148l52 28" fill="none" stroke="url(#relay-gradient-setup)" strokeWidth="18" strokeLinecap="round"></path>
                <circle cx="188" cy="176" r="10" fill="url(#relay-gradient-setup)"></circle>
              </g>
            </svg>
          </div>
          <h1 className="text-3xl font-bold">Welcome to Relay Station</h1>
          <p className="text-muted-foreground text-lg">
            Ollama is required to run local AI models on your computer
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-card border border-border rounded-xl p-8 space-y-6 shadow-sm">
          {step === 'not-found' && (
            <>
              {/* Auto Download Option */}
              <div className="space-y-4">
                <div className="flex items-start space-x-4 p-5 bg-accent/50 rounded-lg border border-border">
                  <input
                    type="checkbox"
                    id="autoDownload"
                    checked={autoDownload}
                    onChange={(e) => setAutoDownload(e.target.checked)}
                    className="mt-1.5 h-4 w-4 text-primary rounded border-border focus:ring-2 focus:ring-primary/50"
                  />
                  <label htmlFor="autoDownload" className="flex-1 cursor-pointer">
                    <div className="font-medium text-sm mb-1">
                      Automatically download and install Ollama
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Recommended • ~500 MB download • Installs to default location
                    </div>
                  </label>
                </div>

                <button
                  onClick={autoDownload ? handleAutoDownload : handleManualDownload}
                  className="w-full py-3.5 px-4 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {autoDownload ? (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Quick Setup (Recommended)
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      Visit Download Page
                    </>
                  )}
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-3 text-muted-foreground font-medium">Other Options</span>
                </div>
              </div>

              {/* Manual Options */}
              <div className="space-y-3">
                <button
                  onClick={handleManualDownload}
                  className="w-full py-3 px-4 border border-border hover:bg-accent rounded-lg text-sm transition-colors text-left flex items-center justify-between group"
                >
                  <span className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-muted-foreground group-hover:text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download from ollama.com
                  </span>
                  <svg className="w-4 h-4 text-muted-foreground group-hover:text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>

                <button
                  onClick={handleBrowseForOllama}
                  className="w-full py-3 px-4 border border-border hover:bg-accent rounded-lg text-sm transition-colors text-left flex items-center gap-3 group"
                >
                  <svg className="w-5 h-5 text-muted-foreground group-hover:text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  Already installed? Browse for Ollama
                </button>

                <button
                  onClick={checkOllamaStatus}
                  className="w-full py-3 px-4 border border-border hover:bg-accent rounded-lg text-sm transition-colors flex items-center justify-center gap-2 group"
                >
                  <svg className="w-5 h-5 text-muted-foreground group-hover:text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh - Check Again
                </button>
              </div>
            </>
          )}

          {step === 'downloading' && (
            <div className="space-y-6 py-4">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent mb-4"></div>
                <p className="font-semibold text-lg mb-2">Downloading Ollama...</p>
                <p className="text-sm text-muted-foreground">
                  {downloadProgress}% complete • This may take a few minutes
                </p>
              </div>
              
              <div className="w-full bg-accent rounded-full h-3 overflow-hidden shadow-inner">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                ></div>
              </div>
              
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Please keep this window open</span>
              </div>
            </div>
          )}

          {step === 'installing' && (
            <div className="text-center space-y-4 py-4">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent"></div>
              <p className="font-semibold text-lg">Installing Ollama...</p>
              <p className="text-sm text-muted-foreground">Almost done!</p>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm text-red-800 dark:text-red-400 font-medium">Setup Failed</p>
                    <p className="text-xs text-red-700 dark:text-red-500 mt-1">{errorMessage}</p>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => setStep('not-found')}
                className="w-full py-2.5 px-4 border border-border hover:bg-accent rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Setup Options
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Ollama runs entirely on your computer. No cloud services.</span>
          </div>
          <p className="text-sm">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.electronAPI.openExternal?.('https://ollama.com');
              }}
              className="text-primary hover:underline"
            >
              Learn more about Ollama →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
