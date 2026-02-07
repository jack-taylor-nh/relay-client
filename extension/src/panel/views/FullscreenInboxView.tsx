import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { conversations, selectedConversationId, loadConversations, isRefreshing, sendMessage } from '../state';
import { ConversationItem } from '../components/ConversationItem';
import { ConversationDetailView } from './ConversationDetailView';
import { activeTab } from '../App';
import { Box, Flex, Heading, Text, IconButton } from '@radix-ui/themes';
import { EnvelopeClosedIcon, ReloadIcon } from '@radix-ui/react-icons';

// Track if we're showing the detail panel in fullscreen
const showDetailPanel = signal(false);

export function FullscreenInboxView() {
  const convos = conversations.value;
  const isEmpty = convos.length === 0;
  const selectedId = selectedConversationId.value;
  const refreshing = isRefreshing.value;

  // Load conversations when component mounts
  useEffect(() => {
    loadConversations();
  }, []);

  // When a conversation is selected, show the detail panel
  useEffect(() => {
    if (selectedId) {
      showDetailPanel.value = true;
    }
  }, [selectedId]);

  function handleSelectConversation(id: string) {
    selectedConversationId.value = id;
    showDetailPanel.value = true;
    // Mark as seen when opened
    sendMessage({ type: 'MARK_CONVERSATION_SEEN', payload: { conversationId: id } });
  }

  function handleCloseDetail() {
    showDetailPanel.value = false;
    selectedConversationId.value = null;
  }

  if (isEmpty) {
    return (
      <Flex style={{ height: '100%' }}>
        {/* Empty state - full width */}
        <Flex 
          direction="column" 
          align="center" 
          justify="center" 
          style={{ flex: 1, textAlign: 'center', padding: '40px 20px' }}
        >
          <EnvelopeClosedIcon width="64" height="64" color="gray" style={{ opacity: 0.4, marginBottom: '16px' }} />
          <Heading as="h3" size="6" mb="2">No conversations yet</Heading>
          <Text size="3" color="gray" mb="6" style={{ maxWidth: '500px' }}>
            Start a chat with another handle or create an edge to receive messages from email, Discord, and more.
          </Text>
          <button 
            class="px-6 py-3 text-base font-semibold rounded-lg transition-colors duration-150"
            style={{ 
              color: 'white', 
              backgroundColor: 'var(--blue-9)', 
              border: 'none', 
              cursor: 'pointer' 
            }}
            onClick={() => { activeTab.value = 'new'; }}
          >
            Start a conversation
          </button>
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex style={{ height: '100%' }}>
      {/* Conversation List - Left Panel */}
      <Box 
        style={{ 
          width: '320px', 
          flexShrink: 0, 
          display: 'flex', 
          flexDirection: 'column', 
          borderRight: '1px solid var(--gray-6)' 
        }}
      >
        {/* Header with refresh button */}
        <Flex 
          align="center" 
          justify="between" 
          px="4" 
          py="3" 
          style={{ borderBottom: '1px solid var(--gray-6)' }}
        >
          <Heading as="h2" size="5" weight="medium">Inbox</Heading>
          <IconButton
            variant="ghost"
            color={refreshing ? 'blue' : 'gray'}
            onClick={() => loadConversations()}
            disabled={refreshing}
            title="Refresh conversations"
            className={refreshing ? 'animate-spin' : ''}
          >
            <ReloadIcon width="18" height="18" />
          </IconButton>
        </Flex>

        {/* Conversation list */}
        <Box style={{ flex: 1, overflow: 'auto' }}>
          {convos.map((convo) => (
            <ConversationItem
              key={convo.id}
              conversation={convo}
              isSelected={selectedId === convo.id}
              onClick={() => handleSelectConversation(convo.id)}
            />
          ))}
        </Box>
      </Box>

      {/* Message Detail - Right Panel */}
      <Box style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {showDetailPanel.value && selectedId ? (
          <FullscreenConversationDetail onClose={handleCloseDetail} />
        ) : (
          <Flex direction="column" align="center" justify="center" style={{ flex: 1, textAlign: 'center', padding: '20px' }}>
            <svg class="w-12 h-12 mb-4" style={{ color: 'var(--gray-9)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <Text color="gray">Select a conversation to view messages</Text>
          </Flex>
        )}
      </Box>
    </Flex>
  );
}

// Wrapper for ConversationDetailView with close button for fullscreen
function FullscreenConversationDetail({ onClose }: { onClose: () => void }) {
  return (
    <div class="flex-1 flex flex-col h-full">
      {/* Close button bar at top */}
      <div class="flex items-center justify-end px-4 py-2 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border-default)]">
        <button
          class="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] rounded-md transition-all"
          onClick={onClose}
          title="Close conversation"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div class="flex-1 overflow-hidden">
        <ConversationDetailView />
      </div>
    </div>
  );
}
