import { render } from 'preact';
import { App } from './App';
import { checkIdentityState, sendMessage, loadEdgeTypes } from './state';
import { api } from '../lib/api';
import './styles.css';

// Set up API client authentication
async function setupApiAuth() {
  const state = await sendMessage<{ fingerprint: string | null }>({ type: 'GET_STATE' });
  if (state.fingerprint) {
    // Get public key
    const pkResult = await sendMessage<{ publicKey?: string; error?: string }>({ type: 'GET_PUBLIC_KEY' });
    if (pkResult.publicKey) {
      api.setAuth(state.fingerprint, pkResult.publicKey, async (message: string) => {
        const result = await sendMessage<{ signature?: string; error?: string }>({
          type: 'SIGN_MESSAGE',
          payload: { message },
        });
        if (result.error) throw new Error(result.error);
        return result.signature!;
      });
    }
  }
}

// Initialize
setupApiAuth();
checkIdentityState();
loadEdgeTypes(); // Load available edge types from server

render(<App />, document.getElementById('app')!);
