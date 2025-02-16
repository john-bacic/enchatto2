// Detect if running on a mobile browser
const isMobile = /Mobi|Android/i.test(navigator.userAgent);

// Mobile-friendly page visibility handling
let visibilityTimeout;
const VISIBILITY_TIMEOUT_DELAY = 60000; // 1 minute

// Listen for visibility changes to manage app state
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('Page hidden—maintaining connection...');
    // Clear any existing timeout
    if (visibilityTimeout) {
      clearTimeout(visibilityTimeout);
    }
    
    // Set a new timeout
    visibilityTimeout = setTimeout(() => {
      console.log('Long background duration—preparing for reconnect...');
      // Store necessary state here if needed
      if (typeof storeAppState === 'function') {
        storeAppState();
      }
    }, VISIBILITY_TIMEOUT_DELAY);
    
  } else {
    console.log('Page visible—checking connection status...');
    // Clear timeout if it exists
    if (visibilityTimeout) {
      clearTimeout(visibilityTimeout);
      visibilityTimeout = null;
    }
    
    // Check socket connection
    if (typeof socket !== 'undefined' && socket) {
      if (!socket.connected) {
        console.log('Socket disconnected.');
        // On mobile browsers, refresh the page to update chats
        if (isMobile) {
          console.log('Mobile browser detected—refreshing page to update chats.');
          window.location.reload();
          return; // Stop further processing since the page will reload
        } else {
          console.log('Socket disconnected—attempting reconnect...');
          socket.connect();
        }
      } else {
        console.log('Socket already connected.');
      }
    }
    
    // Reinitialize app if needed
    if (typeof reinitApp === 'function') {
      reinitApp();
    }
  }
});

// Handle mobile-specific events
window.addEventListener('pagehide', (event) => {
  console.log('Page hide event—storing state...');
  if (typeof storeAppState === 'function') {
    storeAppState();
  }
});

window.addEventListener('pageshow', (event) => {
  console.log('Page show event detected.');
  if (event.persisted) {
    console.log('Page restored from cache—checking connection...');
    // Check socket connection
    if (typeof socket !== 'undefined' && socket) {
      if (!socket.connected) {
        console.log('Socket disconnected—attempting reconnect...');
        socket.connect();
      }
    }
  }
});

// Add storeAppState function to persist current room state
function storeAppState() {
  try {
    const state = {
      currentRoom: currentRoom || null,
      username: username || null,
      lastKnownColor: lastKnownColor || null
    };
    localStorage.setItem('appState', JSON.stringify(state));
    console.log('App state stored:', state);
  } catch (e) {
    console.error('Error storing app state:', e);
  }
}

// Modify reinitApp to restore state before rejoining room and refresh chat
function reinitApp() {
  try {
    const stateStr = localStorage.getItem('appState');
    if(stateStr) {
      const state = JSON.parse(stateStr);
      currentRoom = state.currentRoom || currentRoom;
      username = state.username || username;
      lastKnownColor = state.lastKnownColor || lastKnownColor;
      console.log('Restored app state:', state);
    }
  } catch(e) {
    console.error('Error restoring app state:', e);
  }
  if (typeof socket !== 'undefined' && socket) {
    if (!socket.connected) {
      socket.connect();
    }
    if(currentRoom) {
      console.log('Rejoining room:', currentRoom);
      socket.emit('join-room', currentRoom, typeof isHost !== 'undefined' ? isHost : false, username, lastKnownColor);
      // Refresh the chat: clear chat container so that new messages can be loaded
      const chatContainer = document.getElementById('chat-screen');
      if(chatContainer) {
        chatContainer.innerHTML = '';
        console.log('Chat window cleared for refresh.');
      }
    }
  }
  if (window.myAnimationLoop && typeof window.myAnimationLoop.resume === 'function') {
    window.myAnimationLoop.resume();
  }
}

// Safari-specific event listeners
if (isSafari) {
    window.addEventListener('focus', () => {
        connectionState.backgrounded = false;
        if (isIOS) {
            console.log('iOS Safari regained focus; refreshing page to load new chats.');
            window.location.reload();
        } else {
            handleVisibilityChange();
        }
    });
    
    window.addEventListener('blur', () => {
        connectionState.backgrounded = true;
    });
    
    // Handle device online/offline
    window.addEventListener('online', () => {
        connectionState.backgrounded = false;
        attemptReconnection(true);
    });
    
    window.addEventListener('offline', () => {
        connectionState.backgrounded = true;
    });
}
