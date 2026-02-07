import { useEffect } from 'preact/hooks';
import { conversations, selectedConversationId, loadConversations, isRefreshing } from '../state';
import { ConversationItem } from '../components/ConversationItem';
import { ConversationDetailView } from './ConversationDetailView';
import { Button } from '../components/Button';
import { activeTab } from '../App';
import { Box, Flex, Heading, Text, IconButton } from '@radix-ui/themes';
import { EnvelopeClosedIcon, ReloadIcon } from '@radix-ui/react-icons';

export function InboxView() {
  const convos = conversations.value;
  const isEmpty = convos.length === 0;
  const hasSelection = selectedConversationId.value !== null;
  const refreshing = isRefreshing.value;

  // Load conversations when component mounts
  useEffect(() => {
    loadConversations();
  }, []);

  // Show conversation detail if one is selected
  if (hasSelection) {
    return <ConversationDetailView />;
  }

  if (isEmpty) {
    return (
      <Flex direction="column" align="center" justify="center" style={{ height: '100%' }} className="text-center px-5 py-10" p="5">
        <EnvelopeClosedIcon width="48" height="48" color="gray" style={{ opacity: 0.4, marginBottom: '16px' }} />
        <Heading as="h3" size="5" mb="2">No conversations yet</Heading>
        <Text size="2" color="gray" mb="4" style={{ maxWidth: '300px' }}>
          Start a chat with another handle or create an email alias to receive messages.
        </Text>
        <Button 
          variant="primary"
          onClick={() => { activeTab.value = 'new'; }}
        >
          Start a chat
        </Button>
      </Flex>
    );
  }

  return (
    <Box style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
            isSelected={selectedConversationId.value === convo.id}
            onClick={() => {
              selectedConversationId.value = convo.id;
            }}
          />
        ))}
      </Box>
    </Box>
  );
}
