import { useState, useEffect } from 'preact/hooks';
import { CodeBlock as SharedCodeBlock } from '../components/CodeBlock';
import { CopyableField } from '../components/CopyableField';
import { AlertCard } from '../components/AlertCard';
import { Box, Flex, Heading, Text, IconButton, Button as RadixButton, Code, Strong, Separator, Table } from '@radix-ui/themes';
import { Cross2Icon, CheckIcon, CopyIcon } from '@radix-ui/react-icons';

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
      <Box style={{ position: 'relative' }} mb="4">
        <Text 
          size="1" 
          color="gray" 
          style={{ 
            position: 'absolute', 
            top: '8px', 
            left: '12px', 
            fontFamily: 'monospace', 
            textTransform: 'uppercase', 
            letterSpacing: '0.05em',
            zIndex: 10 
          }}
        >
          {language}
        </Text>
        <button
          onClick={handleCopy}
          class="absolute top-2 right-2 p-1.5 border rounded cursor-pointer transition-all duration-200 z-10"
          style={{
            backgroundColor: copied ? 'var(--green-3)' : 'var(--gray-3)',
            borderColor: copied ? 'var(--green-8)' : 'var(--gray-7)',
            color: copied ? 'var(--green-11)' : 'var(--gray-11)'
          }}
          title={copied ? 'Copied!' : 'Copy'}
        >
          {copied ? (
            <CheckIcon width="16" height="16" />
          ) : (
            <CopyIcon width="16" height="16" />
          )}
        </button>
        <Box pt="6">
          <SharedCodeBlock code={code} language={language} showLanguageLabel={false} />
        </Box>
      </Box>
    );
  };

  return (
    <Box style={{ position: 'fixed', inset: 0, zIndex: 50, overflow: 'auto' }}>
      {/* Header */}
      <Box style={{ borderBottom: '1px solid var(--gray-6)', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--gray-2)' }}>
        <Flex 
          align="center" 
          justify="between" 
          px="6" 
          py="4" 
          style={{ maxWidth: '1280px', margin: '0 auto' }}
        >
          <Flex align="center" gap="3">
            <RelayLogo className="w-8 h-8" />
            <Box>
              <Heading as="h1" size="6" weight="bold" mb="1">Webhook Edge Documentation</Heading>
              <Text size="2" color="gray">Technical Reference for Edge {edgeId.slice(0, 8)}...</Text>
            </Box>
          </Flex>
          <button
            onClick={onClose}
            class="px-4 py-2 rounded-lg transition-colors font-medium"
            style={{ color: 'var(--gray-11)', backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            ✕ Close
          </button>
        </Flex>
      </Box>

      {/* Content */}
      <Box style={{ maxWidth: '1280px', margin: '0 auto' }} px="6" py="8">
        {/* Overview */}
        <Box mb="8">
          <Heading as="h2" size="7" weight="bold" mb="4">Overview</Heading>
          <Text size="3" style={{ lineHeight: '1.6', display: 'block' }} mb="4">
            This webhook edge allows external services to send messages directly to your Relay inbox. 
            When a webhook is triggered, the message appears instantly in your conversations, encrypted 
            end-to-end with your identity.
          </Text>
          <AlertCard type="info" title="Use Cases">
            <ul class="space-y-1">
              <li>• GitHub push notifications, PR comments, workflow results</li>
              <li>• Stripe payment confirmations, failed charges, subscriptions</li>
              <li>• CI/CD pipeline alerts (build failures, deployments)</li>
              <li>• Server monitoring and alerting systems</li>
              <li>• Custom application notifications</li>
            </ul>
          </AlertCard>
        </Box>

        <Separator size="4" mb="8" />

        {/* Quick Start */}
        <Box mb="8">
          <Heading as="h2" size="7" weight="bold" mb="4">Quick Start</Heading>
          <Flex direction="column" gap="4">
            <CopyableField
              label="Webhook URL"
              value={webhookUrl}
              helperText="Use this URL to send messages to your inbox"
            />
            <Box>
              <AlertCard type="warning" title="Keep this token secret!" className="mb-3">
                <Text size="1" weight="medium">
                  Anyone with this token can send messages to your inbox.
                </Text>
              </AlertCard>
              <CopyableField
                label="Authentication Token"
                value={authToken}
                helperText="Include this token in your requests"
              />
            </Box>
          </Flex>
        </Box>

        <Separator size="4" mb="8" />

        {/* Authentication */}
        <Box mb="8">
          <Heading as="h2" size="7" weight="bold" mb="4">Authentication</Heading>
          <Text size="3" mb="4">
            Include your authentication token in <Strong>one</Strong> of these ways:
          </Text>
          <Flex direction="column" gap="4">
            <Box>
              <Heading as="h3" size="2" weight="bold" mb="2">Option 1: Authorization Header (Recommended)</Heading>
              <CodeBlock
                language="http"
                section="auth-header"
                code={`
POST ${webhookUrl.split('?')[0]} HTTP/1.1
Authorization: Bearer ${authToken}
Content-Type: application/json
`}
              />
            </Box>
            <Box>
              <Heading as="h3" size="2" weight="bold" mb="2">Option 2: Query Parameter</Heading>
              <CodeBlock
                language="http"
                section="auth-query"
                code={`
POST ${webhookUrl}?auth=${authToken} HTTP/1.1
Content-Type: application/json
`}
              />
            </Box>
          </Flex>
        </Box>

        <Separator size="4" mb="8" />

        {/* Request Format */}
        <Box mb="8">
          <Heading as="h2" size="7" weight="bold" mb="4">Request Format</Heading>
          <Text size="3" mb="4">
            Send a POST request with <Strong>any valid JSON payload</Strong>. Relay intelligently extracts 
            message content from your payload, with special support for popular services.
          </Text>

          {/* Service Auto-Detection */}
          <AlertCard type="success" title="Automatic Service Detection" className="mb-6">
            <Text mb="2">
              Just point your service's webhook directly at this URL! Relay automatically detects and formats:
            </Text>
            <Flex gap="2" wrap="wrap">
              <Box px="2" py="1" style={{ backgroundColor: 'var(--gray-3)', border: '1px solid var(--gray-6)', borderRadius: 'var(--radius-2)' }}>
                <Text size="1" weight="medium">GitHub</Text>
              </Box>
              <Box px="2" py="1" style={{ backgroundColor: 'var(--gray-3)', border: '1px solid var(--gray-6)', borderRadius: 'var(--radius-2)' }}>
                <Text size="1" weight="medium">Stripe</Text>
              </Box>
              <Box px="2" py="1" style={{ backgroundColor: 'var(--gray-3)', border: '1px solid var(--gray-6)', borderRadius: 'var(--radius-2)' }}>
                <Text size="1" weight="medium">Slack</Text>
              </Box>
              <Box px="2" py="1" style={{ backgroundColor: 'var(--gray-3)', border: '1px solid var(--gray-6)', borderRadius: 'var(--radius-2)' }}>
                <Text size="1" weight="medium">Discord</Text>
              </Box>
              <Box px="2" py="1" style={{ backgroundColor: 'var(--gray-3)', border: '1px solid var(--gray-6)', borderRadius: 'var(--radius-2)' }}>
                <Text size="1" weight="medium">Linear</Text>
              </Box>
            </Flex>
          </AlertCard>
          
          <Heading as="h3" size="5" weight="bold" mb="3">Recommended Format</Heading>
          <Text size="2" mb="4">
            For the best display, use our structured format. All fields are optional:
          </Text>
          
          <Box style={{ overflow: 'auto' }} mb="6">
            <Table.Root variant="surface" size="2">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Field</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Description</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                <Table.Row>
                  <Table.Cell><Code color="blue">sender</Code></Table.Cell>
                  <Table.Cell>string</Table.Cell>
                  <Table.Cell>Sender name (falls back to edge name or service detection)</Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.Cell><Code color="blue">title</Code></Table.Cell>
                  <Table.Cell>string</Table.Cell>
                  <Table.Cell>Message title/subject (supports **bold** and *italic*)</Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.Cell><Code color="blue">body</Code></Table.Cell>
                  <Table.Cell>string</Table.Cell>
                  <Table.Cell>Message body (supports markdown: bold, italic, code, links, bullets)</Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.Cell><Code color="blue">data</Code></Table.Cell>
                  <Table.Cell>object</Table.Cell>
                  <Table.Cell>Structured key-value data displayed below the message</Table.Cell>
                </Table.Row>
              </Table.Body>
            </Table.Root>
          </Box>

          <Text size="2" mb="4">
            You can also set a custom sender via the <Code color="blue">X-Webhook-Sender</Code> header.
          </Text>

          <Heading as="h3" size="2" weight="bold" mb="2">Example: Structured Payload</Heading>
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

          <Heading as="h3" size="2" weight="bold" mb="2" mt="6">Example: Any JSON (Auto-Formatted)</Heading>
          <Text size="2" color="gray" mb="2">Any valid JSON works - it will be displayed as structured data:</Text>
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
        </Box>

        <Separator size="4" mb="8" />

        {/* Code Examples */}
        <Box mb="8">
          <Flex align="center" justify="between" mb="4">
            <Heading as="h2" size="7" weight="bold">Code Examples</Heading>
            <button
              onClick={testWebhook}
              disabled={testStatus === 'loading'}
              class="px-4 py-2 rounded-lg font-medium text-sm transition-all duration-150 flex items-center gap-2"
              style={{
                backgroundColor: testStatus === 'loading' 
                  ? 'var(--gray-9)' 
                  : testStatus === 'success' 
                  ? 'var(--green-9)' 
                  : testStatus === 'error' 
                  ? 'var(--red-9)' 
                  : 'var(--blue-9)',
                color: 'white',
                border: 'none',
                cursor: testStatus === 'loading' ? 'not-allowed' : 'pointer',
                boxShadow: 'var(--shadow-2)'
              }}
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
          </Flex>

          {/* Test Status Message */}
          {testMessage && (
            <Box 
              mb="4" 
              p="3" 
              style={{ 
                borderRadius: 'var(--radius-3)',
                backgroundColor: testStatus === 'success' ? 'var(--green-3)' : 'var(--red-3)',
                color: testStatus === 'success' ? 'var(--green-11)' : 'var(--red-11)',
                border: `1px solid ${testStatus === 'success' ? 'var(--green-8)' : 'var(--red-8)'}`
              }}
            >
              <Text size="2" weight="medium">{testMessage}</Text>
            </Box>
          )}
          
          {/* Language Tabs */}
          <Flex gap="2" mb="4" style={{ borderBottom: '1px solid var(--gray-6)', flexWrap: 'wrap' }}>
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
                class="px-4 py-2 font-medium text-sm transition-colors duration-150"
                style={{
                  color: activeLanguageTab === lang.id ? 'var(--blue-11)' : 'var(--gray-11)',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: activeLanguageTab === lang.id ? '2px solid var(--blue-9)' : '2px solid transparent',
                  cursor: 'pointer'
                }}
              >
                {lang.label}
              </button>
            ))}
          </Flex>

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
        </Box>

        <Separator size="4" mb="8" />

        {/* Response Format */}
        <Box mb="8">
          <Heading as="h2" size="7" weight="bold" mb="4">Response Format</Heading>
          <Text size="3" mb="4">Successful webhook requests return a 200 OK status with the following response:</Text>
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
        </Box>

        <Separator size="4" mb="8" />

        {/* Error Handling */}
        <Box mb="8">
          <Heading as="h2" size="7" weight="bold" mb="4">Error Handling</Heading>
          <Box style={{ overflow: 'auto' }}>
            <Table.Root variant="surface" size="2">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Status Code</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Meaning</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Resolution</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                <Table.Row>
                  <Table.Cell><Code color="red">401</Code></Table.Cell>
                  <Table.Cell>Unauthorized</Table.Cell>
                  <Table.Cell>Check your authentication token</Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.Cell><Code color="red">400</Code></Table.Cell>
                  <Table.Cell>Bad Request</Table.Cell>
                  <Table.Cell>Ensure payload is valid JSON</Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.Cell><Code color="red">413</Code></Table.Cell>
                  <Table.Cell>Payload Too Large</Table.Cell>
                  <Table.Cell>Reduce body or data size (max 10KB body, 5KB data)</Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.Cell><Code color="red">429</Code></Table.Cell>
                  <Table.Cell>Too Many Requests</Table.Cell>
                  <Table.Cell>Implement exponential backoff and retry logic</Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.Cell><Code color="red">500</Code></Table.Cell>
                  <Table.Cell>Server Error</Table.Cell>
                  <Table.Cell>Retry with exponential backoff</Table.Cell>
                </Table.Row>
              </Table.Body>
            </Table.Root>
          </Box>
        </Box>

        <Separator size="4" mb="8" />

        {/* Best Practices */}
        <Box mb="8">
          <Heading as="h2" size="7" weight="bold" mb="4">Best Practices</Heading>
          <Flex direction="column" gap="4">
            <Box style={{ borderLeft: '4px solid var(--blue-9)', paddingLeft: '16px' }}>
              <Heading as="h3" size="3" weight="bold" mb="1">Use Environment Variables</Heading>
              <Text size="2">
                Never hardcode your authentication token in source code. Store it as an environment 
                variable or in a secure secrets manager.
              </Text>
            </Box>
            <Box style={{ borderLeft: '4px solid var(--blue-9)', paddingLeft: '16px' }}>
              <Heading as="h3" size="3" weight="bold" mb="1">Implement Retry Logic</Heading>
              <Text size="2">
                Use exponential backoff for retries on 5xx errors and rate limits. Start with 1 second, 
                then 2s, 4s, 8s, etc.
              </Text>
            </Box>
            <Box style={{ borderLeft: '4px solid var(--blue-9)', paddingLeft: '16px' }}>
              <Heading as="h3" size="3" weight="bold" mb="1">Use Structured Format When Possible</Heading>
              <Text size="2">
                While any JSON works, using our structured format (sender, title, body) gives you the 
                best display with markdown support and clean formatting.
              </Text>
            </Box>
            <Box style={{ borderLeft: '4px solid var(--blue-9)', paddingLeft: '16px' }}>
              <Heading as="h3" size="3" weight="bold" mb="1">Connect Services Directly</Heading>
              <Text size="2">
                For GitHub, Stripe, and other supported services, just paste the webhook URL directly into 
                their settings. Relay auto-detects and formats the messages intelligently.
              </Text>
            </Box>
            <Box style={{ borderLeft: '4px solid var(--yellow-9)', paddingLeft: '16px' }}>
              <Heading as="h3" size="3" weight="bold" mb="1">Rotate Tokens Periodically</Heading>
              <Text size="2">
                For security, regenerate your authentication token periodically and update all services 
                using the webhook.
              </Text>
            </Box>
          </Flex>
        </Box>

        <Separator size="4" mb="8" />

        {/* Security */}
        <Box mb="8">
          <Heading as="h2" size="7" weight="bold" mb="4">Security</Heading>
          <AlertCard type="error" title="Important Security Considerations" className="mb-4">
            <ul class="space-y-1">
              <li>• <Strong>Never commit tokens to version control</Strong> - Use .gitignore for config files</li>
              <li>• <Strong>Use HTTPS only</Strong> - The webhook URL is already HTTPS, never downgrade</li>
              <li>• <Strong>Limit token scope</Strong> - Each webhook edge has its own token with isolated access</li>
              <li>• <Strong>Monitor for abuse</Strong> - Check your inbox for unexpected webhook messages</li>
              <li>• <Strong>Dispose if compromised</Strong> - If a token leaks, immediately dispose the edge and create a new one</li>
            </ul>
          </AlertCard>
          <Text size="3">
            All webhook messages are encrypted end-to-end before storage. The webhook worker encrypts 
            your message with your public key, ensuring only you can decrypt and read it. Even Relay's 
            servers cannot access your webhook content.
          </Text>
        </Box>

        <Separator size="4" mb="8" />

        {/* Support */}
        <Box mb="8">
          <Heading as="h2" size="7" weight="bold" mb="4">Support & Troubleshooting</Heading>
          <Text size="3" mb="4">
            If you encounter issues with your webhook edge, check the following:
          </Text>
          <ul class="space-y-2" style={{ marginBottom: '16px' }}>
            <Text as="li" size="3">• Verify the webhook URL and authentication token are correct</Text>
            <Text as="li" size="3">• Check that Content-Type is set to "application/json"</Text>
            <Text as="li" size="3">• Ensure your payload is valid JSON (any structure works)</Text>
            <Text as="li" size="3">• For custom senders, use the X-Webhook-Sender header or sender field</Text>
            <Text as="li" size="3">• Large payloads may be truncated - keep total size reasonable</Text>
          </ul>
          <Box p="4" style={{ backgroundColor: 'var(--gray-3)', border: '1px solid var(--gray-7)', borderRadius: 'var(--radius-3)' }}>
            <Text size="2">
              <Strong>Edge ID:</Strong> <Code color="blue">{edgeId}</Code>
            </Text>
            <Text size="2" mt="2">
              For additional support, refer to the main Relay documentation or contact support with this Edge ID.
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}


