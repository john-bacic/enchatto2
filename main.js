// Listen for visibility changes to reinitialize the app when it becomes active
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    console.log('Page is visible—resuming app state.')
    // Call your reinitialization logic here.
    // For example, restart animations or timers:
    if (typeof reinitApp === 'function') {
      reinitApp()
    }
  }
})

// Listen for the pageshow event to catch pages restored from BFCache (common in iOS)
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    console.log('Page restored from cache—reloading for a clean state.')
    // Force a full page reload to avoid stale state/paused animations.
    window.location.reload()
  }
})

// Example reinitialization function (customize this to your app)
function reinitApp() {
  // Restart your animation loop, timers, or any paused tasks here.
  // Example:
  if (
    window.myAnimationLoop &&
    typeof window.myAnimationLoop.resume === 'function'
  ) {
    window.myAnimationLoop.resume()
  }
  // Other reinit code...
}
