import { currentIdentity, lockWallet, showToast } from '../state';
import { CopyableField } from '../components/CopyableField';
import { Button } from '../components/Button';
import { Box, Flex, Heading, Text, Strong } from '@radix-ui/themes';
import { LockClosedIcon, CheckCircledIcon } from '@radix-ui/react-icons';

export function FullscreenIdentityView() {
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
      {/* Full-width Header */}
      <Flex 
        align="center" 
        justify="between" 
        px="6" 
        py="4" 
        style={{ borderBottom: '1px solid var(--gray-6)' }}
      >
        <Box>
          <Heading as="h2" size="6" weight="medium" mb="1">Identity</Heading>
          <Text size="2" color="gray">
            Your cryptographic identity is secured locally on your device.
          </Text>
        </Box>
        <Button variant="secondary" onClick={handleLock}>
          Lock Identity
        </Button>
      </Flex>

      {/* Two-column Grid Layout */}
      <Box style={{ flex: 1, overflow: 'auto' }} p="6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Your Identity */}
          <Box style={{ backgroundColor: 'var(--gray-2)', border: '1px solid var(--gray-6)', borderRadius: 'var(--radius-4)' }} p="6">
            <Heading as="h3" size="5" mb="2">Your Identity</Heading>
            <Text size="2" color="gray" mb="5">
              Your identity is cryptographically secured. Only you can decrypt your messages.
            </Text>

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

            {/* Primary Handle */}
            {identity.handle && (
              <Box>
                <Text as="label" size="1" weight="medium" color="gray" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                  Primary Handle
                </Text>
                <Flex align="center" gap="2">
                  <Text size="5" weight="bold" style={{ color: 'var(--slate-700)' }}>&{identity.handle}</Text>
                </Flex>
                <Text size="1" color="gray" style={{ display: 'block', marginTop: '6px' }}>
                  Manage all handles in the Edges tab
                </Text>
              </Box>
            )}
          </Box>

          {/* Right Column - Privacy by Design */}
          <Box 
            style={{ 
              background: 'linear-gradient(to bottom right, var(--gray-2), var(--blue-2))', 
              border: '1px solid var(--gray-6)',
              borderRadius: 'var(--radius-4)'
            }} 
            p="6"
          >
            <Heading as="h3" size="5" mb="4" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LockClosedIcon width="20" height="20" />
              Your privacy, by design
            </Heading>
            
            <Flex direction="column" gap="4">
              <Flex align="start" gap="4">
                <Box 
                  style={{ 
                    width: '32px', 
                    height: '32px', 
                    borderRadius: '50%', 
                    backgroundColor: 'var(--green-3)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  <CheckCircledIcon width="16" height="16" style={{ color: 'var(--green-10)' }} />
                </Box>
                <Box>
                  <Strong style={{ fontSize: '16px', display: 'block', marginBottom: '4px' }}>Zero-knowledge architecture</Strong>
                  <Text size="2" color="gray">We can't read your messages — ever. All encryption happens on your device.</Text>
                </Box>
              </Flex>
              
              <Flex align="start" gap="4">
                <Box 
                  style={{ 
                    width: '32px', 
                    height: '32px', 
                    borderRadius: '50%', 
                    backgroundColor: 'var(--green-3)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  <CheckCircledIcon width="16" height="16" style={{ color: 'var(--green-10)' }} />
                </Box>
                <Box>
                  <Strong style={{ fontSize: '16px', display: 'block', marginBottom: '4px' }}>Disposable edges</Strong>
                  <Text size="2" color="gray">Every handle and email alias is isolated. Burn one, keep the rest.</Text>
                </Box>
              </Flex>
              
              <Flex align="start" gap="4">
                <Box 
                  style={{ 
                    width: '32px', 
                    height: '32px', 
                    borderRadius: '50%', 
                    backgroundColor: 'var(--green-3)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  <CheckCircledIcon width="16" height="16" style={{ color: 'var(--green-10)' }} />
                </Box>
                <Box>
                  <Strong style={{ fontSize: '16px', display: 'block', marginBottom: '4px' }}>You own your identity</Strong>
                  <Text size="2" color="gray">Your cryptographic keys live on your device. No accounts, no passwords stored with us.</Text>
                </Box>
              </Flex>
            </Flex>

            {/* Security badge */}
            <Box mt="6" pt="4" style={{ borderTop: '1px solid var(--gray-6)' }}>
              <Flex align="center" gap="2">
                <LockClosedIcon width="16" height="16" color="gray" />
                <Text size="2" color="gray">End-to-end encrypted with X25519 + AES-GCM</Text>
              </Flex>
            </Box>
          </Box>
        </div>
      </Box>
    </Box>
  );
}
