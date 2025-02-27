/**
 * Translation spinner functionality
 * Shows a spinner while waiting for translations and hides it when they arrive
 */

document.addEventListener('DOMContentLoaded', function() {
  // CSS is now in styles.css
  
  // Track which messages are newly sent vs. from page load
  const sentMessageIds = new Set();
  
  // Modified sendMessage to track newly sent messages
  if (typeof window.sendMessage === 'function') {
    const originalSendMessage = window.sendMessage;
    window.sendMessage = function() {
      // Call original function
      originalSendMessage.apply(this, arguments);
      
      // Get the latest message element (the one we just added)
      setTimeout(() => {
        const messagesDiv = document.getElementById('messages');
        const allMessages = messagesDiv.querySelectorAll('.message');
        const latestMessage = allMessages[allMessages.length - 1];
        
        if (latestMessage) {
          const messageId = latestMessage.getAttribute('data-message-id');
          if (messageId) {
            sentMessageIds.add(messageId);
            
            // Mark our own messages for translation (not guest or system)
            const isOwnMessage = latestMessage.classList.contains('own');
            const isSystemMessage = latestMessage.classList.contains('system-message');
            
            if (isOwnMessage && !isSystemMessage) {
              // Add translation spinner
              addSpinnerToMessage(latestMessage);
              
              // Add 'translating' class to show the spinner
              latestMessage.classList.add('translating');
            }
          }
        }
      }, 10); // Short timeout to ensure DOM is updated
    };
  }
  
  // Function to add spinner to a message
  function addSpinnerToMessage(messageElement) {
    // Only add spinner if message doesn't already have one
    if (!messageElement.querySelector('.translation-loading')) {
      const translationLoading = document.createElement('div');
      translationLoading.className = 'translation-loading';
      
      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      translationLoading.appendChild(spinner);
      
      const loadingText = document.createElement('span');
      loadingText.textContent = '•••';
      translationLoading.appendChild(loadingText);
      
      messageElement.appendChild(translationLoading);
    }
  }
  
  // Hook into translation update event
  if (typeof socket !== 'undefined') {
    socket.on('translation-update', (data) => {
      // Remove 'translating' class and hide spinner when translation arrives
      const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
      if (messageElement) {
        messageElement.classList.remove('translating');
      }
    });
  }
});
