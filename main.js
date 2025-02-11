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
        console.log('Socket disconnected—attempting reconnect...');
        socket.connect();
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

// Example reinitialization function (customize this to your app)
function reinitApp() {
  // Check socket connection
  if (typeof socket !== 'undefined' && socket) {
    if (!socket.connected) {
      console.log('Socket disconnected during reinit—attempting reconnect...');
      socket.connect();
    }
  }
  
  // Restart your animation loop, timers, or any paused tasks here
  if (window.myAnimationLoop && typeof window.myAnimationLoop.resume === 'function') {
    window.myAnimationLoop.resume();
  }
}
