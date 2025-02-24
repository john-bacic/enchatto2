// Initialize socket with iOS-optimized configuration
const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  autoConnect: true,
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  forceNew: false,
  multiplex: true,
})

let currentRoom = null
let username = null
let lastKnownRoom = null
let lastKnownUsername = null
let lastKnownColor = null
let isHost = false
let reconnectAttempts = 0
let forceReconnectTimer = null
let keepAliveInterval = null
let lastInteraction = Date.now()

// Track connection state
let connectionState = {
  isConnected: false,
  lastConnectedAt: Date.now(),
  reconnecting: false,
  backgrounded: false,
}

// Device detection
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

// Track messages we've already handled to prevent duplicates
const handledMessageIds = new Set()

// Map to track message elements by ID for efficient updates
const messageElements = new Map()

// We'll use this flag to prevent adding translated messages immediately
let pendingMessages = new Set()

// Create a message tracking object to manage pending messages
const messageTracker = {
  pendingIds: new Set(),

  // Add a pending message and return a unique tracking ID
  addPending: function (username, message) {
    const trackingId = `${username}-${message}-${Date.now()}`
    this.pendingIds.add(trackingId)
    return trackingId
  },

  // Check if a message is one of our pending ones
  isPending: function (username, message) {
    return Array.from(this.pendingIds).some((id) =>
      id.startsWith(`${username}-${message}`)
    )
  },

  // Remove all pending messages for a given username/message combination
  removePending: function (username, message) {
    const toRemove = []
    this.pendingIds.forEach((id) => {
      if (id.startsWith(`${username}-${message}`)) {
        toRemove.push(id)
      }
    })

    toRemove.forEach((id) => this.pendingIds.delete(id))
  },
}

// Enhanced reconnection function with iOS optimization
function attemptReconnection(immediate = false) {
  if (forceReconnectTimer) {
    clearTimeout(forceReconnectTimer)
  }

  if (!connectionState.isConnected && !connectionState.reconnecting) {
    console.log('Attempting reconnection...')
    connectionState.reconnecting = true

    if (immediate) {
      performReconnect()
    } else {
      // Exponential backoff with max delay
      const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 10000)
      forceReconnectTimer = setTimeout(() => {
        performReconnect()
      }, delay)
    }

    reconnectAttempts++
  }
}

function performReconnect() {
  socket.connect()
}

// Keep-alive mechanism for iOS
function setupKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
  }

  keepAliveInterval = setInterval(() => {
    if (connectionState.isConnected && currentRoom) {
      socket.emit('keep-alive', currentRoom)
      console.log('Keep-alive sent for room:', currentRoom)
    }
  }, 30000)
}

// Enhanced visibility change handler
function handleVisibilityChange() {
  if (!document.hidden) {
    console.log('Page visible - checking connection')

    // Force reconnection if disconnected for more than 5 seconds
    if (
      !connectionState.isConnected &&
      Date.now() - connectionState.lastConnectedAt > 5000
    ) {
      attemptReconnection(true)
    }

    // Rejoin room if connected but not in room
    if (connectionState.isConnected && lastKnownRoom && !currentRoom) {
      console.log('Rejoining room:', lastKnownRoom)
      socket.emit(
        'join-room',
        lastKnownRoom,
        isHost,
        lastKnownUsername,
        lastKnownColor
      )
    }
  }
}

// Enhanced page lifecycle handlers
function handlePageShow(event) {
  console.log('Page shown, persisted:', event.persisted)
  if (event.persisted || isSafari) {
    handleVisibilityChange()
  }
}

function handlePageHide() {
  // Store connection state
  connectionState.lastConnectedAt = Date.now()

  // Clear any pending reconnection attempts
  if (forceReconnectTimer) {
    clearTimeout(forceReconnectTimer)
  }
}

// Connection event handlers
socket.on('connect', () => {
  console.log('Socket connected!', socket.id)
  connectionState.isConnected = true
  connectionState.lastConnectedAt = Date.now()
  connectionState.reconnecting = false
  reconnectAttempts = 0

  if (lastKnownRoom) {
    console.log('Rejoining room after connect:', lastKnownRoom)
    socket.emit(
      'join-room',
      lastKnownRoom,
      isHost,
      lastKnownUsername,
      lastKnownColor
    )
  }
})

socket.on('disconnect', (reason) => {
  console.log('Socket disconnected:', reason)
  connectionState.isConnected = false

  // Handle Safari-specific disconnects
  if (isSafari && reason === 'transport close') {
    attemptReconnection()
  }
})

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error)
  connectionState.isConnected = false
  attemptReconnection()
})

// Ping response handler
socket.on('pong', () => {
  lastInteraction = Date.now()
  if (isIOS) {
    // Connection is still alive, reset reconnection attempts
    reconnectAttempts = 0
  }
})

// Event listeners
document.addEventListener('visibilitychange', handleVisibilityChange)
window.addEventListener('pageshow', handlePageShow)
window.addEventListener('pagehide', handlePageHide)

// Safari-specific event listeners
if (isSafari) {
  // Handle app going to background/foreground
  window.addEventListener('focus', () => {
    connectionState.backgrounded = false
    handleVisibilityChange()
  })

  window.addEventListener('blur', () => {
    connectionState.backgrounded = true
  })

  // Handle device online/offline
  window.addEventListener('online', () => {
    connectionState.backgrounded = false
    attemptReconnection(true)
  })

  window.addEventListener('offline', () => {
    connectionState.backgrounded = true
  })
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
  }
})

// Add mobile background/foreground detection
let wasBackgrounded = false
let wasDisconnected = false
const reconnectModal = document.getElementById('reconnect-modal')
const refreshButton = document.getElementById('refresh-button')

// Handle refresh button click
refreshButton.addEventListener('click', () => {
  location.reload()
})

// Handle visibility change
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    wasBackgrounded = true
  } else if (document.visibilityState === 'visible') {
    if (wasBackgrounded && wasDisconnected) {
      // Show the reconnection modal
      reconnectModal.classList.add('show')
    }
    wasBackgrounded = false
  }
})

// Track socket disconnection
socket.on('disconnect', () => {
  wasDisconnected = true

  // If we're visible and were backgrounded, show the modal
  if (document.visibilityState === 'visible' && wasBackgrounded) {
    reconnectModal.classList.add('show')
  }

  // Show disconnection message
  const disconnectMessage = {
    type: 'system',
    content:
      'Disconnected from server. Tap "Refresh to Reconnect" to rejoin the chat.',
    timestamp: new Date().toISOString(),
  }
  displayMessage(disconnectMessage)
})

// Track reconnection attempts
socket.io.on('reconnect_attempt', () => {
  const reconnectMessage = {
    type: 'system',
    content: 'Attempting to reconnect...',
    timestamp: new Date().toISOString(),
  }
  displayMessage(reconnectMessage)
})

// Handle successful reconnection
socket.io.on('reconnect', () => {
  wasDisconnected = false
  reconnectModal.classList.remove('show')
  const reconnectedMessage = {
    type: 'system',
    content: 'Reconnected to server.',
    timestamp: new Date().toISOString(),
  }
  displayMessage(reconnectedMessage)
})

// Handle failed reconnection
socket.io.on('reconnect_failed', () => {
  // Show the modal if we're not already showing it
  reconnectModal.classList.add('show')
  const failedMessage = {
    type: 'system',
    content:
      'Failed to reconnect. Please tap "Refresh to Reconnect" to try again.',
    timestamp: new Date().toISOString(),
  }
  displayMessage(failedMessage)
})

// Reset disconnection flag when we reconnect
socket.on('connect', () => {
  wasDisconnected = false
  reconnectModal.classList.remove('show')
})

// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen')
const chatScreen = document.getElementById('chat-screen')
const createRoomBtn = document.getElementById('create-room-btn')
const joinRoomBtn = document.getElementById('join-room-btn')
const roomInput = document.getElementById('room-input')
const roomNumber = document.getElementById('room-number')
const messageInput = document.getElementById('message-text')
const sendBtn = document.getElementById('send-button')
const messages = document.getElementById('messages')

// Event Listeners
createRoomBtn.addEventListener('click', () => {
  socket.emit('create-room')
})

joinRoomBtn.addEventListener('click', () => {
  const roomId = roomInput.value.trim()
  if (roomId) {
    socket.emit('join-room', roomId)
  }
})

// Function to create a message element with consistent structure
function createMessageElement(msg) {
  const messageDiv = document.createElement('div')
  messageDiv.className = `message ${msg.username === username ? 'own' : ''}`

  if (msg.color) {
    messageDiv.style.borderColor = msg.color
  }

  // Add delete button
  const deleteButton = document.createElement('button')
  deleteButton.className = 'message-delete-btn'
  deleteButton.innerHTML = '&times;' // × symbol
  deleteButton.title = 'Delete message'
  deleteButton.addEventListener('click', function () {
    // Remove this message element
    messageDiv.remove()
  })

  const usernameElement = document.createElement('div')
  usernameElement.className = 'username'
  usernameElement.textContent = msg.username
  usernameElement.style.color = msg.color || '#68B7CF'

  const messageContent = document.createElement('div')
  messageContent.className = 'message-content'

  // Create text element for original message
  const textDiv = document.createElement('div')
  textDiv.className = 'text message-text'
  textDiv.textContent = msg.message

  // Add translation element if it exists
  if (msg.translation) {
    const translationDiv = document.createElement('div')
    translationDiv.className = 'text translation-text'
    translationDiv.textContent = msg.translation
    messageContent.appendChild(translationDiv)
  }

  // Add romanji element if it exists
  if (msg.romanji) {
    const romanjiDiv = document.createElement('div')
    romanjiDiv.className = 'text romanji-text'
    romanjiDiv.textContent = msg.romanji
    messageContent.appendChild(romanjiDiv)
  }

  // Assemble the elements
  messageContent.appendChild(textDiv)
  messageDiv.appendChild(deleteButton) // Add delete button first
  messageDiv.appendChild(usernameElement)
  messageDiv.appendChild(messageContent)

  return messageDiv
}

// Replace socket.off and socket.on handlers
// First, remove any existing chat-message handlers
socket.off('chat-message')
socket.off('chat-message-confirmation')

// Track sent messages to prevent duplicates
const sentMessages = new Set()

// Show initial message when sending for immediate feedback
function sendMessage() {
  const message = messageInput.value.trim()
  if (message && currentRoom) {
    // Generate a unique ID for this message
    const clientId = Date.now().toString()

    // Create a temporary message object
    const tempMsg = {
      username: username,
      message: message,
      color: lastKnownColor || '#68B7CF',
      timestamp: new Date().toISOString(),
      clientId: clientId,
      _temp: true, // Mark as temporary
    }

    // Display temporary message immediately
    displayMessage(tempMsg)

    // Track that we've sent this message
    sentMessages.add(message)

    // Send to server
    socket.emit('chat-message', currentRoom, message, clientId)

    // Reset input field
    messageInput.value = ''
    messageInput.style.height = '24px'
    messageInput.style.overflowY = 'auto'
    messageInput.setAttribute('rows', '1')
    updateSendButtonVisibility(messageInput)
  }
}

// Display a message - single source of truth
function displayMessage(msg) {
  console.log('Displaying message:', msg)

  // If this is a confirmation of our own message
  if (
    msg._temp ||
    (msg.username === username && sentMessages.has(msg.message))
  ) {
    // Remove all temporary versions of this message
    const allMessages = document.querySelectorAll('.message')
    allMessages.forEach((el) => {
      const usernameEl = el.querySelector('.username')
      const messageTextEl = el.querySelector('.message-text')

      if (
        usernameEl &&
        messageTextEl &&
        usernameEl.textContent === msg.username &&
        messageTextEl.textContent === msg.message
      ) {
        console.log('Removing duplicate message for update')
        el.remove()
      }
    })

    // If we've removed the temp message, also remove from sentMessages
    if (!msg._temp) {
      sentMessages.delete(msg.message)
    }
  }

  // Create and add the message
  const messageElement = createMessageElement(msg)

  // Add a special class if this is temporary
  if (msg._temp) {
    messageElement.classList.add('temp-message')
  }

  const chatMessages = document.querySelector('.chat-messages')
  chatMessages.appendChild(messageElement)
  scrollToBottom()
}

// Handler for messages from other users
socket.on('chat-message', (msg) => {
  // Only display messages from others
  if (msg.username !== username) {
    displayMessage(msg)
  }
})

// Handler for confirmations of our own messages
socket.on('chat-message-confirmation', (msg) => {
  // This will replace our temporary message
  displayMessage(msg)
})

// Handle recent messages when joining a room
socket.on('recent-messages', (messages) => {
  console.log('Received recent messages:', messages.length)
  const messagesDiv = document.getElementById('messages')

  // Clear existing messages
  messagesDiv.innerHTML = ''

  // Add all messages
  messages.forEach((msg) => {
    const messageElement = createMessageElement(msg)
    messagesDiv.appendChild(messageElement)
  })

  // Scroll to bottom
  messagesDiv.scrollTop = messagesDiv.scrollHeight
})

// Event listeners for toggles
document.getElementById('en-toggle').addEventListener('change', () => {
  // Update message visibility
  const showEn = document.getElementById('en-toggle').checked
  const enTexts = messages.querySelectorAll('.en-text')
  enTexts.forEach((text) => {
    text.style.display = showEn ? '' : 'none'
  })
})

document.getElementById('jp-toggle').addEventListener('change', () => {
  // Update message visibility
  const showJp = document.getElementById('jp-toggle').checked
  const jpTexts = messages.querySelectorAll('.jp-text')
  jpTexts.forEach((text) => {
    text.style.display = showJp ? '' : 'none'
  })

  // Update placeholder text
  const messageInput = document.getElementById('message-text')
  messageInput.placeholder = showJp ? 'メッセージ...' : 'Message...'
})

document.getElementById('rp-toggle').addEventListener('change', () => {
  // Update message visibility
  const showRp = document.getElementById('rp-toggle').checked
  const rpTexts = messages.querySelectorAll('.rp-text')
  rpTexts.forEach((text) => {
    text.style.display = showRp && text.textContent.trim() !== '' ? '' : 'none'
  })
})

// Initialize placeholder on page load
document.addEventListener('DOMContentLoaded', function () {
  const jpToggle = document.getElementById('jp-toggle')
  const messageInput = document.getElementById('message-text')
  messageInput.placeholder = jpToggle.checked ? 'メッセージ...' : 'Message...'
})

// Function to auto-resize textarea and containers
function autoResizeTextarea(textarea) {
  // Reset height to get correct scrollHeight
  textarea.style.height = '24px'

  // Calculate new height
  const scrollHeight = textarea.scrollHeight
  const maxHeight = 200
  const newHeight = Math.min(scrollHeight, maxHeight)

  // Count line breaks and update rows
  const lineBreaks = (textarea.value.match(/\n/g) || []).length
  textarea.setAttribute('rows', String(lineBreaks + 1))

  // Apply new height
  textarea.style.height = newHeight + 'px'

  // Always enable scrolling
  textarea.style.overflowY = 'auto'

  // If at max height, scroll to cursor position
  if (scrollHeight > maxHeight) {
    // Use requestAnimationFrame to ensure the scroll happens after the height change
    requestAnimationFrame(() => {
      const cursorPosition = textarea.selectionStart
      const text = textarea.value

      // Calculate lines before cursor
      const linesBeforeCursor = text
        .substr(0, cursorPosition)
        .split('\n').length
      const totalLines = text.split('\n').length

      // Scroll to keep cursor in view
      const lineHeight = 24 // Approximate line height
      const scrollPosition = Math.max(0, (linesBeforeCursor - 2) * lineHeight)
      textarea.scrollTop = scrollPosition
    })
  }
}

// Function to update send button visibility
// function updateSendButtonVisibility(input) {
//     const sendButton = document.querySelector('.send-button');
//     const hasContent = input.value.trim().length > 0;

//     if (hasContent) {
//         sendButton.classList.add('visible');
//     } else {
//         sendButton.classList.remove('visible');
//     }
// }

// Event listener for message input
// Handle touch events to prevent scrolling issues
messageInput.addEventListener(
  'touchstart',
  function (e) {
    if (this.scrollHeight > this.clientHeight) {
      e.stopPropagation()
    }
  },
  { passive: true }
)

messageInput.addEventListener(
  'touchmove',
  function (e) {
    if (this.scrollHeight > this.clientHeight) {
      e.stopPropagation()
    }
  },
  { passive: true }
)

// Auto-resize on input and update send button
messageInput.addEventListener('input', function () {
  autoResizeTextarea(this)
  updateSendButtonVisibility(this)
})

// Handle paste events
messageInput.addEventListener('paste', function () {
  // Use setTimeout to wait for the paste to complete
  setTimeout(() => {
    autoResizeTextarea(this)
    updateSendButtonVisibility(this)
  }, 0)
})

// Handle keydown events for Enter
messageInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    if (!e.shiftKey) {
      e.preventDefault()
      sendMessage()
    } else {
      // For Shift+Enter, update rows after the line break is added
      setTimeout(() => autoResizeTextarea(this), 0)
    }
  }
})

// Initialize textarea height and button visibility
autoResizeTextarea(messageInput)
updateSendButtonVisibility(messageInput)

// Event listener for send button
document.querySelector('.send-button').addEventListener('click', function () {
  sendMessage()
})

socket.on('user-joined', (data) => {
  const messageElement = createMessageElement(
    `${data.username} joined the room`,
    true
  )
  messages.appendChild(messageElement)
})

socket.on('user-left', (data) => {
  const messageElement = createMessageElement(
    `${data.username} left the room`,
    true
  )
  messages.appendChild(messageElement)
})

// Keep socket alive
setInterval(() => {
  if (socket.connected) {
    socket.emit('ping')
  }
}, 25000)

socket.on('pong', () => {
  console.log('Received pong from server')
})

// Basic language detection for client-side
function detectLanguageSimple(text) {
  // Check for Japanese characters
  const japaneseRegex =
    /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/
  return japaneseRegex.test(text) ? 'ja' : 'en'
}

// Handle join success
socket.on('join-success', (data) => {
  console.log('Successfully joined room:', data)
  connectionState.isConnected = true
  connectionState.lastConnectedAt = Date.now()
  connectionState.reconnecting = false
  reconnectAttempts = 0

  username = data.username
  lastKnownUsername = username
  lastKnownColor = data.color
  isHost = data.isHost

  // Update UI elements
  document.getElementById('username-display').textContent = username
  document.querySelector('.chat-container').style.display = 'flex'
  document.querySelector('.welcome-screen').style.display = 'none'

  // Add existing messages
  if (data.messages && data.messages.length > 0) {
    const chatMessages = document.querySelector('.chat-messages')
    chatMessages.innerHTML = ''
    data.messages.forEach((msg) => {
      const messageElement = createMessageElement(msg)
      chatMessages.appendChild(messageElement)
    })
    scrollToBottom()
  }

  setupKeepAlive()
})

// Handle join failure
socket.on('join-failed', (error) => {
  console.error('Failed to join room:', error)
  connectionState.isConnected = false
  connectionState.reconnecting = false

  // Show error to user
  const errorElement = document.getElementById('error-message')
  if (errorElement) {
    errorElement.textContent = error
    errorElement.style.display = 'block'
    setTimeout(() => {
      errorElement.style.display = 'none'
    }, 5000)
  }

  // Reset room state
  currentRoom = null
  username = null

  // Show welcome screen
  document.querySelector('.chat-container').style.display = 'none'
  document.querySelector('.welcome-screen').style.display = 'flex'
})

// Add CSS for the sending indicator
document.head.insertAdjacentHTML(
  'beforeend',
  `
  <style>
    .sending-indicator {
      font-style: italic;
      opacity: 0.7;
      color: var(--color-text-subtle);
      font-size: 0.85em;
    }
    .message-sending {
      opacity: 0.8;
    }
  </style>
`
)

// Add CSS for the delete button
document.head.insertAdjacentHTML(
  'beforeend',
  `
  <style>
    .message-delete-btn {
      position: absolute;
      top: 4px;
      right: 4px;
      background: none;
      border: none;
      color: #999;
      font-size: 16px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 5;
      padding: 2px 6px;
      border-radius: 50%;
    }
    
    .message:hover .message-delete-btn {
      opacity: 0.7;
    }
    
    .message-delete-btn:hover {
      opacity: 1 !important;
      background-color: rgba(0,0,0,0.1);
      color: #333;
    }
    
    /* Ensure messages have relative positioning for absolute button positioning */
    .message {
      position: relative;
    }
  </style>
`
)
