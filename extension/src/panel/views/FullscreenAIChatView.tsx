import { AIChatView } from './AIChatView';

/**
 * Fullscreen version of AI Chat view
 * Uses the same component as the panel version since the chat interface
 * is already optimized for both small and large viewports
 */
export function FullscreenAIChatView() {
  return <AIChatView />;
}
