import { useState, useEffect } from 'preact/hooks';
import { CodeBlock as SharedCodeBlock } from '../components/CodeBlock';
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
        <linearGradient id="relay-gradient-header" x1="44" y1="28" x2="212" y2="232" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#38BDF8"></stop>
          <stop offset="0.55" stop-color="#60A5FA"></stop>
          <stop offset="1" stop-color="#A5B4FC"></stop>
        </linearGradient>
      </defs>
      <g transform="translate(128 128) scale(1.14) translate(-128 -128)">
        <path d="M92 176V86c0-10 8-18 18-18h30c22 0 40 18 40 40s-18 40-40 40h-22" fill="none" stroke="url(#relay-gradient-header)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"></path>
        <path d="M118 148l52 28" fill="none" stroke="url(#relay-gradient-header)" stroke-width="18" stroke-linecap="round"></path>
        <circle cx="188" cy="176" r="10" fill="url(#relay-gradient-header)"></circle>
      </g>
    </svg>
  );
}

interface WebhookDocsViewProps {
  edgeId: string;
  webhookUrl: string;
  authToken: string;
  onClose: () => void;
}

export function WebhookDocsView({ edgeId, webhookUrl, authToken, onClose }: WebhookDocsViewProps) {
  const [activeLanguageTab, setActiveLanguageTab] = useState<'curl' | 'javascript' | 'python' | 'go' | 'ruby'>('curl');
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  const testWebhook = async () => {
    setTestStatus('loading');
    setTestMessage('');

    try {
      const response = await fetch(webhookUrl.split('?')[0], {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: 'relay-docs-test',
          title: 'Test from Documentation',
          body: `This is a test message sent from the Relay webhook documentation page at ${new Date().toLocaleTimeString()}!`,
          data: {
            source: 'webhook-docs',
            timestamp: new Date().toISOString(),
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setTestStatus('success');
      setTestMessage(`✓ Success! Message sent (ID: ${result.messageId || 'N/A'}). Check your inbox!`);
    } catch (error) {
      setTestStatus('error');
      setTestMessage(`✗ Error: ${error instanceof Error ? error.message : 'Failed to send webhook'}`);
    }

    setTimeout(() => {
      setTestStatus('idle');
      setTestMessage('');
    }, 5000);
  };

  const CodeBlock = ({ code, language, section }: { code: string; language: string; section: string }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(code.trim());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error('Failed to copy:', error);
      }
    };

    return (
      <div class="relative mb-4">
        <div class="absolute top-2 left-3 text-xs text-[var(--color-text-tertiary)] font-mono uppercase tracking-wide z-10">
          {language}
        </div>
        <button
          onClick={handleCopy}
          class={`absolute top-2 right-2 p-1.5 border rounded cursor-pointer transition-all duration-200 z-10 ${
            copied 
              ? 'bg-[var(--color-success-subtle)] border-[var(--color-success)] text-[var(--color-success)]' 
              : 'bg-[var(--color-bg-hover)] border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-active)] hover:text-[var(--color-text-primary)]'
          }`}
          title={copied ? 'Copied!' : 'Copy'}
        >
          {copied ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          )}
        </button>
        <div class="pt-6">
          <SharedCodeBlock code={code} language={language} showLanguageLabel={false} />
        </div>
      </div>
    );
  };

  return (
    <div class="fixed inset-0 bg-[var(--color-bg-hover)] z-50 overflow-y-auto">
      {/* Header */}
      <div class="bg-[var(--color-bg-elevated)] border-b border-[var(--color-border-default)] sticky top-0 z-10">
        <div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <RelayLogo className="w-8 h-8" />
            <div>
              <h1 class="text-xl font-bold text-[var(--color-text-primary)]">Webhook Edge Documentation</h1>
              <p class="text-sm text-[var(--color-text-secondary)]">Technical Reference for Edge {edgeId.slice(0, 8)}...</p>
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
            This webhook edge allows external services to send messages directly to your Relay inbox. 
            When a webhook is triggered, the message appears instantly in your conversations, encrypted 
            end-to-end with your identity.
          </p>
          <AlertCard type="info" title="Use Cases">
            <ul class="space-y-1">
              <li>• GitHub push notifications, PR comments, workflow results</li>
              <li>• Stripe payment confirmations, failed charges, subscriptions</li>
              <li>• CI/CD pipeline alerts (build failures, deployments)</li>
              <li>• Server monitoring and alerting systems</li>
              <li>• Custom application notifications</li>
            </ul>
          </AlertCard>
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* Quick Start */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Quick Start</h2>
          <div class="space-y-4">
            <CopyableField
              label="Webhook URL"
              value={webhookUrl}
              helperText="Use this URL to send messages to your inbox"
            />
            <div>
              <AlertCard type="warning" title="Keep this token secret!" className="mb-3">
                <p class="text-xs font-medium">
                  Anyone with this token can send messages to your inbox.
                </p>
              </AlertCard>
              <CopyableField
                label="Authentication Token"
                value={authToken}
                helperText="Include this token in your requests"
              />
            </div>
          </div>
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* Authentication */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Authentication</h2>
          <p class="text-[var(--color-text-primary)] mb-4">
            Include your authentication token in <strong>one</strong> of these ways:
          </p>
          <div class="space-y-4">
            <div>
              <h3 class="text-sm font-semibold text-[var(--color-text-primary)] mb-2">Option 1: Authorization Header (Recommended)</h3>
              <CodeBlock
                language="http"
                section="auth-header"
                code={`
POST ${webhookUrl.split('?')[0]} HTTP/1.1
Authorization: Bearer ${authToken}
Content-Type: application/json
`}
              />
            </div>
            <div>
              <h3 class="text-sm font-semibold text-[var(--color-text-primary)] mb-2">Option 2: Query Parameter</h3>
              <CodeBlock
                language="http"
                section="auth-query"
                code={`
POST ${webhookUrl} HTTP/1.1
Content-Type: application/json
`}
              />
            </div>
          </div>
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* Request Format */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Request Format</h2>
          <p class="text-[var(--color-text-primary)] mb-4">
            Send a POST request with <strong>any valid JSON payload</strong>. Relay intelligently extracts 
            message content from your payload, with special support for popular services.
          </p>

          {/* Service Auto-Detection */}
          <AlertCard type="success" title="Automatic Service Detection" className="mb-6">
            <p class="mb-2">
              Just point your service's webhook directly at this URL! Relay automatically detects and formats:
            </p>
            <div class="flex flex-wrap gap-2">
              <span class="px-2 py-1 bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] text-xs font-medium rounded">GitHub</span>
              <span class="px-2 py-1 bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] text-xs font-medium rounded">Stripe</span>
              <span class="px-2 py-1 bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] text-xs font-medium rounded">Slack</span>
              <span class="px-2 py-1 bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] text-xs font-medium rounded">Discord</span>
              <span class="px-2 py-1 bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] text-xs font-medium rounded">Linear</span>
            </div>
          </AlertCard>
          
          <h3 class="text-lg font-semibold text-[var(--color-text-primary)] mb-3">Recommended Format</h3>
          <p class="text-[var(--color-text-primary)] mb-4 text-sm">
            For the best display, use our structured format. All fields are optional:
          </p>
          
          <div class="overflow-x-auto mb-6">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="border-b-2 border-[var(--color-border-strong)]">
                  <th class="text-left py-2 px-3 font-semibold text-[var(--color-text-primary)]">Field</th>
                  <th class="text-left py-2 px-3 font-semibold text-[var(--color-text-primary)]">Type</th>
                  <th class="text-left py-2 px-3 font-semibold text-[var(--color-text-primary)]">Description</th>
                </tr>
              </thead>
              <tbody class="text-[var(--color-text-primary)]">
                <tr class="border-b border-[var(--color-border-default)]">
                  <td class="py-2 px-3"><code class="text-[var(--color-accent)] font-mono">sender</code></td>
                  <td class="py-2 px-3">string</td>
                  <td class="py-2 px-3">Sender name (falls back to edge name or service detection)</td>
                </tr>
                <tr class="border-b border-[var(--color-border-default)]">
                  <td class="py-2 px-3"><code class="text-[var(--color-accent)] font-mono">title</code></td>
                  <td class="py-2 px-3">string</td>
                  <td class="py-2 px-3">Message title/subject (supports **bold** and *italic*)</td>
                </tr>
                <tr class="border-b border-[var(--color-border-default)]">
                  <td class="py-2 px-3"><code class="text-[var(--color-accent)] font-mono">body</code></td>
                  <td class="py-2 px-3">string</td>
                  <td class="py-2 px-3">Message body (supports markdown: bold, italic, code, links, bullets)</td>
                </tr>
                <tr class="border-b border-[var(--color-border-default)]">
                  <td class="py-2 px-3"><code class="text-[var(--color-accent)] font-mono">data</code></td>
                  <td class="py-2 px-3">object</td>
                  <td class="py-2 px-3">Structured key-value data displayed below the message</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="text-[var(--color-text-primary)] mb-4 text-sm">
            You can also set a custom sender via the <code class="text-[var(--color-accent)] font-mono">X-Webhook-Sender</code> header.
          </p>

          <h3 class="text-sm font-semibold text-[var(--color-text-primary)] mb-2">Example: Structured Payload</h3>
          <CodeBlock
            language="json"
            section="example-payload"
            code={`{
  "sender": "deploy-bot",
  "title": "Deploy succeeded ✓",
  "body": "Production deployment completed in **2m 34s**\\n\\n- Commit: \`a1b2c3d\`\\n- Branch: main",
  "data": {
    "repository": "mycompany/api-server",
    "duration": "154s"
  }
}`}
          />

          <h3 class="text-sm font-semibold text-[var(--color-text-primary)] mb-2 mt-6">Example: Any JSON (Auto-Formatted)</h3>
          <p class="text-[var(--color-text-secondary)] text-sm mb-2">Any valid JSON works - it will be displayed as structured data:</p>
          <CodeBlock
            language="json"
            section="example-raw"
            code={`{
  "event": "user_signup",
  "user_id": 12345,
  "email": "user@example.com",
  "plan": "premium"
}`}
          />
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* Code Examples */}
        <section class="mb-8">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-2xl font-bold text-[var(--color-text-primary)]">Code Examples</h2>
            <button
              onClick={testWebhook}
              disabled={testStatus === 'loading'}
              class={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-150 flex items-center gap-2 ${
                testStatus === 'loading'
                  ? 'bg-[var(--color-text-tertiary)] text-[var(--color-text-inverse)] cursor-not-allowed'
                  : testStatus === 'success'
                  ? 'bg-[var(--color-success)] text-[var(--color-text-inverse)] hover:bg-[var(--color-success)]'
                  : testStatus === 'error'
                  ? 'bg-[var(--color-error)] text-[var(--color-text-inverse)] hover:bg-[var(--color-error)]'
                  : 'bg-[var(--color-accent)] text-[var(--color-text-inverse)] hover:bg-[var(--color-accent-hover)] shadow-sm'
              }`}
            >
              {testStatus === 'loading' ? (
                <>
                  <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Testing...
                </>
              ) : testStatus === 'success' ? (
                <>✓ Sent!</>
              ) : testStatus === 'error' ? (
                <>✗ Failed</>
              ) : (
                <>▶ Run Example</>
              )}
            </button>
          </div>

          {/* Test Status Message */}
          {testMessage && (
            <div class={`mb-4 p-3 rounded-lg text-sm font-medium ${
              testStatus === 'success'
                ? 'bg-[var(--color-success-subtle)] text-[var(--color-success)] border border-[var(--color-success)]'
                : 'bg-[var(--color-error-subtle)] text-[var(--color-error)] border border-[var(--color-error)]'
            }`}>
              {testMessage}
            </div>
          )}
          
          {/* Language Tabs */}
          <div class="flex flex-wrap gap-2 mb-4 border-b border-[var(--color-border-default)]">
            {[
              { id: 'curl', label: 'cURL' },
              { id: 'javascript', label: 'JavaScript' },
              { id: 'python', label: 'Python' },
              { id: 'go', label: 'Go' },
              { id: 'ruby', label: 'Ruby' },
            ].map((lang) => (
              <button
                key={lang.id}
                onClick={() => setActiveLanguageTab(lang.id as any)}
                class={`px-4 py-2 font-medium text-sm transition-colors duration-150 border-b-2 ${
                  activeLanguageTab === lang.id
                    ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                    : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)]'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>

          {/* Code Content */}
          {activeLanguageTab === 'curl' && (
            <CodeBlock
              language="bash"
              section="curl"
              code={`curl -X POST "${webhookUrl.split('?')[0]}" \\
  -H "Authorization: Bearer ${authToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "sender": "my-service",
    "title": "Test notification",
    "body": "This is a test message from cURL"
  }'`}
            />
          )}

          {activeLanguageTab === 'javascript' && (
            <CodeBlock
              language="javascript"
              section="javascript"
              code={`// Using fetch (Node.js 18+ or browser)
async function sendWebhook(title, body, data = {}) {
  const response = await fetch("${webhookUrl.split('?')[0]}", {
    method: "POST",
    headers: {
      "Authorization": "Bearer ${authToken}",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: "my-app",
      title: title,
      body: body,
      data: data,
      timestamp: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(\`Webhook failed: \${response.status}\`);
  }

  return await response.json();
}

// Example usage
await sendWebhook(
  "Payment received",
  "Customer paid $99.00 for Premium Plan",
  { amount: 99.00, plan: "premium" }
);`}
            />
          )}

          {activeLanguageTab === 'python' && (
            <CodeBlock
              language="python"
              section="python"
              code={`import requests
from datetime import datetime

def send_webhook(title: str, body: str, data: dict = None):
    """Send a notification to Relay webhook"""
    
    payload = {
        "sender": "python-script",
        "title": title,
        "body": body,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
    
    if data:
        payload["data"] = data
    
    response = requests.post(
        "${webhookUrl.split('?')[0]}",
        headers={
            "Authorization": f"Bearer ${authToken}",
            "Content-Type": "application/json"
        },
        json=payload
    )
    
    response.raise_for_status()
    return response.json()

# Example usage
send_webhook(
    title="Backup completed",
    body="Database backup finished successfully",
    data={"size_mb": 1024, "duration_seconds": 45}
)`}
            />
          )}

          {activeLanguageTab === 'go' && (
            <CodeBlock
              language="go"
              section="go"
              code={`package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

type WebhookPayload struct {
    Sender    string                 \`json:"sender"\`
    Title     string                 \`json:"title"\`
    Body      string                 \`json:"body"\`
    Data      map[string]interface{} \`json:"data,omitempty"\`
    Timestamp string                 \`json:"timestamp"\`
}

func sendWebhook(title, body string, data map[string]interface{}) error {
    payload := WebhookPayload{
        Sender:    "go-service",
        Title:     title,
        Body:      body,
        Data:      data,
        Timestamp: time.Now().UTC().Format(time.RFC3339),
    }

    jsonData, err := json.Marshal(payload)
    if err != nil {
        return err
    }

    req, err := http.NewRequest("POST", "${webhookUrl.split('?')[0]}", bytes.NewBuffer(jsonData))
    if err != nil {
        return err
    }

    req.Header.Set("Authorization", "Bearer ${authToken}")
    req.Header.Set("Content-Type", "application/json")

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return fmt.Errorf("webhook failed: %d", resp.StatusCode)
    }

    return nil
}

// Example usage
func main() {
    data := map[string]interface{}{
        "severity": "high",
        "host": "api-server-01",
    }
    
    err := sendWebhook(
        "Server alert",
        "CPU usage above 90% for 5 minutes",
        data,
    )
    
    if err != nil {
        panic(err)
    }
}`}
            />
          )}

          {activeLanguageTab === 'ruby' && (
            <CodeBlock
              language="ruby"
              section="ruby"
              code={`require 'net/http'
require 'json'
require 'time'

def send_webhook(title:, body:, data: nil)
  uri = URI("${webhookUrl.split('?')[0]}")
  
  payload = {
    sender: 'ruby-script',
    title: title,
    body: body,
    timestamp: Time.now.utc.iso8601
  }
  
  payload[:data] = data if data
  
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  
  request = Net::HTTP::Post.new(uri.path)
  request['Authorization'] = "Bearer ${authToken}"
  request['Content-Type'] = 'application/json'
  request.body = payload.to_json
  
  response = http.request(request)
  
  raise "Webhook failed: #{response.code}" unless response.is_a?(Net::HTTPSuccess)
  
  JSON.parse(response.body)
end

# Example usage
send_webhook(
  title: 'Deployment started',
  body: 'Deploying version 2.4.1 to production',
  data: { version: '2.4.1', environment: 'production' }
)`}
            />
          )}
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* Response Format */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Response Format</h2>
          <p class="text-[var(--color-text-primary)] mb-4">Successful webhook requests return a 200 OK status with the following response:</p>
          <CodeBlock
            language="json"
            section="response"
            code={`
{
  "success": true,
  "messageId": "msg_a1b2c3d4e5f6",
  "timestamp": "2026-02-04T14:30:00.123Z"
}
`}
          />
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* Error Handling */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Error Handling</h2>
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="border-b-2 border-[var(--color-border-strong)]">
                  <th class="text-left py-2 px-3 font-semibold text-[var(--color-text-primary)]">Status Code</th>
                  <th class="text-left py-2 px-3 font-semibold text-[var(--color-text-primary)]">Meaning</th>
                  <th class="text-left py-2 px-3 font-semibold text-[var(--color-text-primary)]">Resolution</th>
                </tr>
              </thead>
              <tbody class="text-[var(--color-text-primary)]">
                <tr class="border-b border-[var(--color-border-default)]">
                  <td class="py-2 px-3"><code class="text-red-600 font-mono">401</code></td>
                  <td class="py-2 px-3">Unauthorized</td>
                  <td class="py-2 px-3">Check your authentication token</td>
                </tr>
                <tr class="border-b border-[var(--color-border-default)]">
                  <td class="py-2 px-3"><code class="text-red-600 font-mono">400</code></td>
                  <td class="py-2 px-3">Bad Request</td>
                  <td class="py-2 px-3">Ensure payload is valid JSON</td>
                </tr>
                <tr class="border-b border-[var(--color-border-default)]">
                  <td class="py-2 px-3"><code class="text-red-600 font-mono">413</code></td>
                  <td class="py-2 px-3">Payload Too Large</td>
                  <td class="py-2 px-3">Reduce body or data size (max 10KB body, 5KB data)</td>
                </tr>
                <tr class="border-b border-[var(--color-border-default)]">
                  <td class="py-2 px-3"><code class="text-red-600 font-mono">429</code></td>
                  <td class="py-2 px-3">Too Many Requests</td>
                  <td class="py-2 px-3">Implement exponential backoff and retry logic</td>
                </tr>
                <tr class="border-b border-[var(--color-border-default)]">
                  <td class="py-2 px-3"><code class="text-red-600 font-mono">500</code></td>
                  <td class="py-2 px-3">Server Error</td>
                  <td class="py-2 px-3">Retry with exponential backoff</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* Best Practices */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Best Practices</h2>
          <div class="space-y-4">
            <div class="border-l-4 border-[var(--color-accent)] pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">Use Environment Variables</h3>
              <p class="text-sm text-[var(--color-text-primary)]">
                Never hardcode your authentication token in source code. Store it as an environment 
                variable or in a secure secrets manager.
              </p>
            </div>
            <div class="border-l-4 border-[var(--color-accent)] pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">Implement Retry Logic</h3>
              <p class="text-sm text-[var(--color-text-primary)]">
                Use exponential backoff for retries on 5xx errors and rate limits. Start with 1 second, 
                then 2s, 4s, 8s, etc.
              </p>
            </div>
            <div class="border-l-4 border-[var(--color-accent)] pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">Use Structured Format When Possible</h3>
              <p class="text-sm text-[var(--color-text-primary)]">
                While any JSON works, using our structured format (sender, title, body) gives you the 
                best display with markdown support and clean formatting.
              </p>
            </div>
            <div class="border-l-4 border-[var(--color-accent)] pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">Connect Services Directly</h3>
              <p class="text-sm text-[var(--color-text-primary)]">
                For GitHub, Stripe, and other supported services, just paste the webhook URL directly into 
                their settings. Relay auto-detects and formats the messages intelligently.
              </p>
            </div>
            <div class="border-l-4 border-[var(--color-warning)] pl-4">
              <h3 class="font-semibold text-[var(--color-text-primary)] mb-1">Rotate Tokens Periodically</h3>
              <p class="text-sm text-[var(--color-text-primary)]">
                For security, regenerate your authentication token periodically and update all services 
                using the webhook.
              </p>
            </div>
          </div>
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* Security */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Security</h2>
          <AlertCard type="error" title="Important Security Considerations" className="mb-4">
            <ul class="space-y-1">
              <li>• <strong>Never commit tokens to version control</strong> - Use .gitignore for config files</li>
              <li>• <strong>Use HTTPS only</strong> - The webhook URL is already HTTPS, never downgrade</li>
              <li>• <strong>Limit token scope</strong> - Each webhook edge has its own token with isolated access</li>
              <li>• <strong>Monitor for abuse</strong> - Check your inbox for unexpected webhook messages</li>
              <li>• <strong>Dispose if compromised</strong> - If a token leaks, immediately dispose the edge and create a new one</li>
            </ul>
          </AlertCard>
          <p class="text-[var(--color-text-primary)]">
            All webhook messages are encrypted end-to-end before storage. The webhook worker encrypts 
            your message with your public key, ensuring only you can decrypt and read it. Even Relay's 
            servers cannot access your webhook content.
          </p>
        </section>

        <hr class="border-t border-[var(--color-border-default)] mb-8" />

        {/* Support */}
        <section class="mb-8">
          <h2 class="text-2xl font-bold text-[var(--color-text-primary)] mb-4">Support & Troubleshooting</h2>
          <p class="text-[var(--color-text-primary)] mb-4">
            If you encounter issues with your webhook edge, check the following:
          </p>
          <ul class="text-[var(--color-text-primary)] space-y-2 mb-4">
            <li>• Verify the webhook URL and authentication token are correct</li>
            <li>• Check that Content-Type is set to "application/json"</li>
            <li>• Ensure your payload is valid JSON (any structure works)</li>
            <li>• For custom senders, use the X-Webhook-Sender header or sender field</li>
            <li>• Large payloads may be truncated - keep total size reasonable</li>
          </ul>
          <div class="bg-[var(--color-bg-hover)] border border-[var(--color-border-strong)] rounded-lg p-4">
            <p class="text-sm text-[var(--color-text-primary)]">
              <strong>Edge ID:</strong> <code class="font-mono text-[var(--color-accent)]">{edgeId}</code>
            </p>
            <p class="text-sm text-[var(--color-text-primary)] mt-2">
              For additional support, refer to the main Relay documentation or contact support with this Edge ID.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}


