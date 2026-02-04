import { useState, useEffect } from 'preact/hooks';

// Inline RelayLogo component
function RelayLogo({ className }: { className?: string }) {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M16 4L4 10v12l12 6 12-6V10L16 4z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="4" fill="currentColor" />
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
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = async (text: string, section: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const CopyButton = ({ text, section }: { text: string; section: string }) => (
    <button
      onClick={() => copyToClipboard(text, section)}
      class="absolute top-2 right-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-md transition-colors duration-150 font-medium"
    >
      {copiedSection === section ? '✓ Copied' : 'Copy'}
    </button>
  );

  const CodeBlock = ({ code, language, section }: { code: string; language: string; section: string }) => (
    <div class="relative mb-4">
      <div class="absolute top-2 left-3 text-xs text-slate-500 font-mono uppercase tracking-wide">
        {language}
      </div>
      <CopyButton text={code.trim()} section={section} />
      <pre class="bg-slate-900 text-slate-100 p-4 pt-8 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed">
        <code>{code.trim()}</code>
      </pre>
    </div>
  );

  return (
    <div class="fixed inset-0 bg-stone-100 z-50 overflow-y-auto">
      {/* Header */}
      <div class="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <RelayLogo className="w-8 h-8 text-sky-600" />
            <div>
              <h1 class="text-xl font-bold text-stone-900">Webhook Edge Documentation</h1>
              <p class="text-sm text-stone-600">Technical Reference for Edge {edgeId.slice(0, 8)}...</p>
            </div>
          </div>
          <button
            onClick={onClose}
            class="px-4 py-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors font-medium"
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Content */}
      <div class="max-w-5xl mx-auto px-6 py-8">
        {/* Overview */}
        <section class="bg-white rounded-lg shadow-sm border border-stone-200 p-6 mb-6">
          <h2 class="text-2xl font-bold text-stone-900 mb-4">Overview</h2>
          <p class="text-stone-700 leading-relaxed mb-4">
            This webhook edge allows external services to send messages directly to your Relay inbox. 
            When a webhook is triggered, the message appears instantly in your conversations, encrypted 
            end-to-end with your identity.
          </p>
          <div class="bg-sky-50 border border-sky-200 rounded-lg p-4">
            <h3 class="text-sm font-semibold text-sky-900 mb-2">Use Cases</h3>
            <ul class="text-sm text-sky-800 space-y-1">
              <li>• GitHub push notifications, PR comments, workflow results</li>
              <li>• Stripe payment confirmations, failed charges, subscriptions</li>
              <li>• CI/CD pipeline alerts (build failures, deployments)</li>
              <li>• Server monitoring and alerting systems</li>
              <li>• Custom application notifications</li>
            </ul>
          </div>
        </section>

        {/* Quick Start */}
        <section class="bg-white rounded-lg shadow-sm border border-stone-200 p-6 mb-6">
          <h2 class="text-2xl font-bold text-stone-900 mb-4">Quick Start</h2>
          <div class="space-y-4">
            <div>
              <h3 class="text-sm font-semibold text-stone-900 mb-2">Webhook URL</h3>
              <div class="relative">
                <CopyButton text={webhookUrl} section="url" />
                <code class="block bg-slate-900 text-slate-100 px-4 py-3 pr-20 rounded-lg text-sm font-mono break-all">
                  {webhookUrl}
                </code>
              </div>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-stone-900 mb-2">Authentication Token</h3>
              <div class="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-3">
                <p class="text-xs text-amber-800 font-medium">
                  ⚠️ <strong>Keep this token secret!</strong> Anyone with this token can send messages to your inbox.
                </p>
              </div>
              <div class="relative">
                <CopyButton text={authToken} section="token" />
                <code class="block bg-slate-900 text-slate-100 px-4 py-3 pr-20 rounded-lg text-sm font-mono break-all">
                  {authToken}
                </code>
              </div>
            </div>
          </div>
        </section>

        {/* Authentication */}
        <section class="bg-white rounded-lg shadow-sm border border-stone-200 p-6 mb-6">
          <h2 class="text-2xl font-bold text-stone-900 mb-4">Authentication</h2>
          <p class="text-stone-700 mb-4">
            Include your authentication token in <strong>one</strong> of these ways:
          </p>
          <div class="space-y-4">
            <div>
              <h3 class="text-sm font-semibold text-stone-900 mb-2">Option 1: Authorization Header (Recommended)</h3>
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
              <h3 class="text-sm font-semibold text-stone-900 mb-2">Option 2: Query Parameter</h3>
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

        {/* Request Format */}
        <section class="bg-white rounded-lg shadow-sm border border-stone-200 p-6 mb-6">
          <h2 class="text-2xl font-bold text-stone-900 mb-4">Request Format</h2>
          <p class="text-stone-700 mb-4">
            Send a POST request with a JSON payload containing the following fields:
          </p>
          
          <div class="overflow-x-auto mb-4">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="border-b-2 border-stone-300">
                  <th class="text-left py-2 px-3 font-semibold text-stone-900">Field</th>
                  <th class="text-left py-2 px-3 font-semibold text-stone-900">Type</th>
                  <th class="text-left py-2 px-3 font-semibold text-stone-900">Required</th>
                  <th class="text-left py-2 px-3 font-semibold text-stone-900">Description</th>
                </tr>
              </thead>
              <tbody class="text-stone-700">
                <tr class="border-b border-stone-200">
                  <td class="py-2 px-3"><code class="text-sky-600 font-mono">sender</code></td>
                  <td class="py-2 px-3">string</td>
                  <td class="py-2 px-3"><span class="text-red-600 font-semibold">Yes</span></td>
                  <td class="py-2 px-3">Identifier for the sender (alphanumeric, max 64 chars)</td>
                </tr>
                <tr class="border-b border-stone-200">
                  <td class="py-2 px-3"><code class="text-sky-600 font-mono">title</code></td>
                  <td class="py-2 px-3">string</td>
                  <td class="py-2 px-3"><span class="text-red-600 font-semibold">Yes</span></td>
                  <td class="py-2 px-3">Message title/subject (max 200 chars)</td>
                </tr>
                <tr class="border-b border-stone-200">
                  <td class="py-2 px-3"><code class="text-sky-600 font-mono">body</code></td>
                  <td class="py-2 px-3">string</td>
                  <td class="py-2 px-3"><span class="text-red-600 font-semibold">Yes</span></td>
                  <td class="py-2 px-3">Message body/content (max 10KB)</td>
                </tr>
                <tr class="border-b border-stone-200">
                  <td class="py-2 px-3"><code class="text-sky-600 font-mono">data</code></td>
                  <td class="py-2 px-3">object</td>
                  <td class="py-2 px-3"><span class="text-stone-500">No</span></td>
                  <td class="py-2 px-3">Optional structured data (max 5KB JSON)</td>
                </tr>
                <tr class="border-b border-stone-200">
                  <td class="py-2 px-3"><code class="text-sky-600 font-mono">timestamp</code></td>
                  <td class="py-2 px-3">string</td>
                  <td class="py-2 px-3"><span class="text-stone-500">No</span></td>
                  <td class="py-2 px-3">ISO 8601 timestamp (defaults to current time)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 class="text-sm font-semibold text-stone-900 mb-2">Example Payload</h3>
          <CodeBlock
            language="json"
            section="example-payload"
            code={`
{
  "sender": "github-actions",
  "title": "Deploy succeeded",
  "body": "Production deployment completed successfully in 2m 34s",
  "data": {
    "repository": "mycompany/api-server",
    "branch": "main",
    "commit": "a1b2c3d",
    "duration_seconds": 154
  },
  "timestamp": "2026-02-04T14:30:00Z"
}
`}
          />
        </section>

        {/* Code Examples */}
        <section class="bg-white rounded-lg shadow-sm border border-stone-200 p-6 mb-6">
          <h2 class="text-2xl font-bold text-stone-900 mb-4">Code Examples</h2>
          
          {/* cURL */}
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-stone-900 mb-3">cURL</h3>
            <CodeBlock
              language="bash"
              section="curl"
              code={`
curl -X POST "${webhookUrl.split('?')[0]}" \\
  -H "Authorization: Bearer ${authToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "sender": "my-service",
    "title": "Test notification",
    "body": "This is a test message from cURL"
  }'
`}
            />
          </div>

          {/* JavaScript/Node.js */}
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-stone-900 mb-3">JavaScript / Node.js</h3>
            <CodeBlock
              language="javascript"
              section="javascript"
              code={`
// Using fetch (Node.js 18+ or browser)
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
);
`}
            />
          </div>

          {/* Python */}
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-stone-900 mb-3">Python</h3>
            <CodeBlock
              language="python"
              section="python"
              code={`
import requests
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
)
`}
            />
          </div>

          {/* Go */}
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-stone-900 mb-3">Go</h3>
            <CodeBlock
              language="go"
              section="go"
              code={`
package main

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
}
`}
            />
          </div>

          {/* Ruby */}
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-stone-900 mb-3">Ruby</h3>
            <CodeBlock
              language="ruby"
              section="ruby"
              code={`
require 'net/http'
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
)
`}
            />
          </div>
        </section>

        {/* Response Format */}
        <section class="bg-white rounded-lg shadow-sm border border-stone-200 p-6 mb-6">
          <h2 class="text-2xl font-bold text-stone-900 mb-4">Response Format</h2>
          <p class="text-stone-700 mb-4">Successful webhook requests return a 200 OK status with the following response:</p>
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

        {/* Error Handling */}
        <section class="bg-white rounded-lg shadow-sm border border-stone-200 p-6 mb-6">
          <h2 class="text-2xl font-bold text-stone-900 mb-4">Error Handling</h2>
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="border-b-2 border-stone-300">
                  <th class="text-left py-2 px-3 font-semibold text-stone-900">Status Code</th>
                  <th class="text-left py-2 px-3 font-semibold text-stone-900">Meaning</th>
                  <th class="text-left py-2 px-3 font-semibold text-stone-900">Resolution</th>
                </tr>
              </thead>
              <tbody class="text-stone-700">
                <tr class="border-b border-stone-200">
                  <td class="py-2 px-3"><code class="text-red-600 font-mono">401</code></td>
                  <td class="py-2 px-3">Unauthorized</td>
                  <td class="py-2 px-3">Check your authentication token</td>
                </tr>
                <tr class="border-b border-stone-200">
                  <td class="py-2 px-3"><code class="text-red-600 font-mono">400</code></td>
                  <td class="py-2 px-3">Bad Request</td>
                  <td class="py-2 px-3">Validate payload format and field requirements</td>
                </tr>
                <tr class="border-b border-stone-200">
                  <td class="py-2 px-3"><code class="text-red-600 font-mono">413</code></td>
                  <td class="py-2 px-3">Payload Too Large</td>
                  <td class="py-2 px-3">Reduce body or data size (max 10KB body, 5KB data)</td>
                </tr>
                <tr class="border-b border-stone-200">
                  <td class="py-2 px-3"><code class="text-red-600 font-mono">429</code></td>
                  <td class="py-2 px-3">Too Many Requests</td>
                  <td class="py-2 px-3">Implement exponential backoff and retry logic</td>
                </tr>
                <tr class="border-b border-stone-200">
                  <td class="py-2 px-3"><code class="text-red-600 font-mono">500</code></td>
                  <td class="py-2 px-3">Server Error</td>
                  <td class="py-2 px-3">Retry with exponential backoff</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Best Practices */}
        <section class="bg-white rounded-lg shadow-sm border border-stone-200 p-6 mb-6">
          <h2 class="text-2xl font-bold text-stone-900 mb-4">Best Practices</h2>
          <div class="space-y-4">
            <div class="border-l-4 border-sky-500 pl-4">
              <h3 class="font-semibold text-stone-900 mb-1">Use Environment Variables</h3>
              <p class="text-sm text-stone-700">
                Never hardcode your authentication token in source code. Store it as an environment 
                variable or in a secure secrets manager.
              </p>
            </div>
            <div class="border-l-4 border-sky-500 pl-4">
              <h3 class="font-semibold text-stone-900 mb-1">Implement Retry Logic</h3>
              <p class="text-sm text-stone-700">
                Use exponential backoff for retries on 5xx errors and rate limits. Start with 1 second, 
                then 2s, 4s, 8s, etc.
              </p>
            </div>
            <div class="border-l-4 border-sky-500 pl-4">
              <h3 class="font-semibold text-stone-900 mb-1">Validate Payloads</h3>
              <p class="text-sm text-stone-700">
                Validate your payload before sending to catch errors early. Ensure sender is alphanumeric, 
                title ≤ 200 chars, body ≤ 10KB.
              </p>
            </div>
            <div class="border-l-4 border-sky-500 pl-4">
              <h3 class="font-semibold text-stone-900 mb-1">Use Meaningful Senders</h3>
              <p class="text-sm text-stone-700">
                Messages from the same sender are grouped into conversations. Use consistent, descriptive 
                sender identifiers like "github-actions", "stripe-billing", or "monitoring-system".
              </p>
            </div>
            <div class="border-l-4 border-amber-500 pl-4">
              <h3 class="font-semibold text-stone-900 mb-1">Rotate Tokens Periodically</h3>
              <p class="text-sm text-stone-700">
                For security, regenerate your authentication token periodically and update all services 
                using the webhook.
              </p>
            </div>
          </div>
        </section>

        {/* Security */}
        <section class="bg-white rounded-lg shadow-sm border border-stone-200 p-6 mb-6">
          <h2 class="text-2xl font-bold text-stone-900 mb-4">Security</h2>
          <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <h3 class="text-sm font-semibold text-red-900 mb-2">⚠️ Important Security Considerations</h3>
            <ul class="text-sm text-red-800 space-y-1">
              <li>• <strong>Never commit tokens to version control</strong> - Use .gitignore for config files</li>
              <li>• <strong>Use HTTPS only</strong> - The webhook URL is already HTTPS, never downgrade</li>
              <li>• <strong>Limit token scope</strong> - Each webhook edge has its own token with isolated access</li>
              <li>• <strong>Monitor for abuse</strong> - Check your inbox for unexpected webhook messages</li>
              <li>• <strong>Dispose if compromised</strong> - If a token leaks, immediately dispose the edge and create a new one</li>
            </ul>
          </div>
          <p class="text-stone-700">
            All webhook messages are encrypted end-to-end before storage. The webhook worker encrypts 
            your message with your public key, ensuring only you can decrypt and read it. Even Relay's 
            servers cannot access your webhook content.
          </p>
        </section>

        {/* Support */}
        <section class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
          <h2 class="text-2xl font-bold text-stone-900 mb-4">Support & Troubleshooting</h2>
          <p class="text-stone-700 mb-4">
            If you encounter issues with your webhook edge, check the following:
          </p>
          <ul class="text-stone-700 space-y-2 mb-4">
            <li>• Verify the webhook URL and authentication token are correct</li>
            <li>• Ensure your request payload matches the required format</li>
            <li>• Check that Content-Type is set to "application/json"</li>
            <li>• Verify your sender field contains only alphanumeric characters</li>
            <li>• Confirm body and data fields are within size limits</li>
          </ul>
          <div class="bg-stone-100 border border-stone-300 rounded-lg p-4">
            <p class="text-sm text-stone-700">
              <strong>Edge ID:</strong> <code class="font-mono text-sky-600">{edgeId}</code>
            </p>
            <p class="text-sm text-stone-700 mt-2">
              For additional support, refer to the main Relay documentation or contact support with this Edge ID.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
