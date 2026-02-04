// Offscreen document script for playing notification sounds
// Service workers cannot play audio directly, so messages are sent here

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PLAY_NOTIFICATION_SOUND' && message.target === 'offscreen') {
    playSound();
    sendResponse({ success: true });
  }
  return false;
});

function playSound() {
  const audio = document.getElementById('notification-sound');
  if (audio) {
    audio.currentTime = 0;
    audio.volume = 0.5; // 50% volume - not too jarring
    audio.play().catch(err => {
      console.error('[Offscreen] Failed to play sound:', err);
    });
  }
}
