import { currentIdentity, lockWallet, showToast } from '../state';
import { CopyableField } from '../components/CopyableField';
import { Button } from '../components/Button';
import { Box, Flex, Heading, Text, Strong } from '@radix-ui/themes';
import { LockClosedIcon } from '@radix-ui/react-icons';

export function IdentityView() {
  const identity = currentIdentity.value;

  if (!identity) {
    return (
      <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Flex align="center" justify="center" style={{ height: '100%' }}>
          <Text color="gray">No identity loaded</Text>
        </Flex>
      </Box>
    );
  }

  async function handleLock() {
    await lockWallet();
    showToast('Identity locked');
  }

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Flex 
        align="center" 
        justify="between" 
        px="4" 
        py="4" 
        style={{ borderBottom: '1px solid var(--gray-6)' }}
      >
        <Heading as="h2" size="5" weight="medium">Identity</Heading>
        <Button variant="secondary" onClick={handleLock}>
          Lock
        </Button>
      </Flex>

      <Box style={{ flex: 1, overflow: 'auto' }} p="5">
        <Box mb="6">
          <Heading as="h3" size="4" mb="2">Your Identity</Heading>
          <Text size="2" color="gray" mb="4">
            Your identity is cryptographically secured. Only you can decrypt your messages.
          </Text>

          <Box style={{ backgroundColor: 'var(--gray-2)', border: '1px solid var(--gray-6)', borderRadius: 'var(--radius-3)' }} p="4">
            <CopyableField
              label="Fingerprint"
              value={identity.id}
              helperText="Your unique identity identifier"
              onCopy={() => showToast('Fingerprint copied')}
              className="mb-5"
            />

            {identity.publicKey && (
              <CopyableField
                label="Public Key"
                value={identity.publicKey}
                helperText="Share this with others to receive encrypted messages"
                onCopy={() => showToast('Public key copied')}
                className="mb-5"
              />
            )}

            {identity.handle && (
              <Box mb="0">
                <Text as="label" size="1" weight="medium" color="gray" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                  Primary Handle
                </Text>
                <Flex align="center" gap="2">
                  <Text size="4" weight="bold" style={{ color: 'var(--slate-700)' }}>&{identity.handle}</Text>
                </Flex>
                <Text size="1" color="gray" style={{ display: 'block', marginTop: '4px' }}>
                  Manage all handles in the Edges tab
                </Text>
              </Box>
            )}
          </Box>
        </Box>

        {/* Security highlights - same as onboarding complete screen */}
        <Box 
          style={{ 
            background: 'linear-gradient(to bottom right, var(--gray-2), var(--blue-2))', 
            border: '1px solid var(--gray-6)',
            borderRadius: 'var(--radius-3)'
          }} 
          p="5" 
          mb="6"
        >
          <Heading as="h3" size="3" mb="3" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LockClosedIcon width="16" height="16" />
            Your privacy, by design
          </Heading>
          <Flex direction="column" gap="3">
            <Flex align="start" gap="3">
              <Text style={{ color: 'var(--green-10)', marginTop: '2px' }}>✓</Text>
              <Box>
                <Strong>Zero-knowledge architecture</Strong>
                <Text as="p" size="1" color="gray" style={{ marginTop: '2px' }}>
                  We can't read your messages — ever. All encryption happens on your device.
                </Text>
              </Box>
            </Flex>
            <Flex align="start" gap="3">
              <Text style={{ color: 'var(--green-10)', marginTop: '2px' }}>✓</Text>
              <Box>
                <Strong>Disposable edges</Strong>
                <Text as="p" size="1" color="gray" style={{ marginTop: '2px' }}>
                  Every handle and email alias is isolated. Burn one, keep the rest.
                </Text>
              </Box>
            </Flex>
            <Flex align="start" gap="3">
              <Text style={{ color: 'var(--green-10)', marginTop: '2px' }}>✓</Text>
              <Box>
                <Strong>You own your identity</Strong>
                <Text as="p" size="1" color="gray" style={{ marginTop: '2px' }}>
                  Your cryptographic keys live on your device. No accounts, no passwords stored with us.
                </Text>
              </Box>
            </Flex>
          </Flex>
        </Box>
      </Box>
    </Box>
  );
}
