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
          <div className="text-6xl">✅</div>
          <p className="text-xl font-medium">Ollama is ready!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-8">
      <div className="max-w-lg w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-block p-4 bg-primary/10 rounded-full">
            <svg
              className="w-16 h-16 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold">Ollama Required</h1>
          <p className="text-muted-foreground">
            Relay Station needs Ollama to run local AI models on your computer.
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-6">
          {step === 'not-found' && (
            <>
              {/* Auto Download Option */}
              <div className="space-y-4">
                <div className="flex items-start space-x-3 p-4 bg-accent/50 rounded-lg border border-border">
                  <input
                    type="checkbox"
                    id="autoDownload"
                    checked={autoDownload}
                    onChange={(e) => setAutoDownload(e.target.checked)}
                    className="mt-1 h-4 w-4 text-primary rounded border-border focus:ring-2 focus:ring-primary"
                  />
                  <label htmlFor="autoDownload" className="flex-1 cursor-pointer">
                    <div className="font-medium text-sm">
                      Automatically download and install Ollama
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Recommended • ~500 MB download • Installs to default location
                    </div>
                  </label>
                </div>

                <button
                  onClick={autoDownload ? handleAutoDownload : handleManualDownload}
                  className="w-full py-3 px-4 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-medium transition-colors"
                >
                  {autoDownload ? '⚡ Quick Setup (Recommended)' : '🌐 Visit Download Page'}
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              {/* Manual Options */}
              <div className="space-y-3">
                <button
                  onClick={handleManualDownload}
                  className="w-full py-2 px-4 border border-border hover:bg-accent rounded-lg text-sm transition-colors text-left flex items-center justify-between"
                >
                  <span>📥 Download from ollama.com</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>

                <button
                  onClick={handleBrowseForOllama}
                  className="w-full py-2 px-4 border border-border hover:bg-accent rounded-lg text-sm transition-colors text-left"
                >
                  📁 Already installed? Browse for Ollama
                </button>

                <button
                  onClick={checkOllamaStatus}
                  className="w-full py-2 px-4 border border-border hover:bg-accent rounded-lg text-sm transition-colors"
                >
                  🔄 Refresh - Check Again
                </button>
              </div>
            </>
          )}

          {step === 'downloading' && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent mb-3"></div>
                <p className="font-medium">Downloading Ollama...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {downloadProgress}% complete • This may take a few minutes
                </p>
              </div>
              
              <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {step === 'installing' && (
            <div className="text-center space-y-3">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></div>
              <p className="font-medium">Installing Ollama...</p>
              <p className="text-xs text-muted-foreground">Almost done!</p>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-4">
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive font-medium">Setup Failed</p>
                <p className="text-xs text-muted-foreground mt-1">{errorMessage}</p>
              </div>
              
              <button
                onClick={() => setStep('not-found')}
                className="w-full py-2 px-4 border border-border hover:bg-accent rounded-lg text-sm transition-colors"
              >
                ← Back to Setup Options
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground space-y-1">
          <p>Ollama runs entirely on your computer. No cloud services.</p>
          <p>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.electronAPI.openExternal?.('https://ollama.com');
              }}
              className="text-primary hover:underline"
            >
              Learn more about Ollama
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
