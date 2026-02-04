import { render } from 'preact';
import { WebhookDocsView } from '../panel/views/WebhookDocsView';

// Get parameters from URL
const params = new URLSearchParams(window.location.search);
const edgeId = params.get('edgeId') || '';
const webhookUrl = params.get('webhookUrl') || '';
const authToken = params.get('authToken') || '';

// Render the docs view fullscreen (no modal wrapper)
render(
  <WebhookDocsView
    edgeId={edgeId}
    webhookUrl={webhookUrl}
    authToken={authToken}
    onClose={() => window.close()}
  />,
  document.getElementById('root')!
);
