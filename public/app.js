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
    multiplex: true
});

let currentRoom = null;
let username = null;
let lastKnownRoom = null;
let lastKnownUsername = null;
let lastKnownColor = null;
let isHost = false;
let reconnectAttempts = 0;
let forceReconnectTimer = null;
let keepAliveInterval = null;
let lastInteraction = Date.now();

// Track connection state
let connectionState = {
    isConnected: false,
    lastConnectedAt: Date.now(),
    reconnecting: false,
    backgrounded: false
};

// Device detection
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Enhanced reconnection function with iOS optimization
function attemptReconnection(immediate = false) {
    if (forceReconnectTimer) {
        clearTimeout(forceReconnectTimer);
    }

    if (!connectionState.isConnected && !connectionState.reconnecting) {
        console.log('Attempting reconnection...');
        connectionState.reconnecting = true;

        if (immediate) {
            performReconnect();
        } else {
            // Exponential backoff with max delay
            const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 10000);
            forceReconnectTimer = setTimeout(() => {
                performReconnect();
            }, delay);
        }

        reconnectAttempts++;
    }
}

function performReconnect() {
    socket.connect();
}

// Keep-alive mechanism for iOS
function setupKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }
    
    keepAliveInterval = setInterval(() => {
        if (connectionState.isConnected && currentRoom) {
            socket.emit('keep-alive', currentRoom);
            console.log('Keep-alive sent for room:', currentRoom);
        }
    }, 30000);
}

// Enhanced visibility change handler
function handleVisibilityChange() {
    if (!document.hidden) {
        console.log('Page visible - checking connection');
        
        // Force reconnection if disconnected for more than 5 seconds
        if (!connectionState.isConnected && 
            (Date.now() - connectionState.lastConnectedAt > 5000)) {
            attemptReconnection(true);
        }
        
        // Rejoin room if connected but not in room
        if (connectionState.isConnected && lastKnownRoom && !currentRoom) {
            console.log('Rejoining room:', lastKnownRoom);
            socket.emit('join-room', lastKnownRoom, isHost, lastKnownUsername, lastKnownColor);
        }
    }
}

// Enhanced page lifecycle handlers
function handlePageShow(event) {
    console.log('Page shown, persisted:', event.persisted);
    if (event.persisted || isSafari) {
        handleVisibilityChange();
    }
}

function handlePageHide() {
    // Store connection state
    connectionState.lastConnectedAt = Date.now();
    
    // Clear any pending reconnection attempts
    if (forceReconnectTimer) {
        clearTimeout(forceReconnectTimer);
    }
}

// Connection event handlers
socket.on('connect', () => {
    console.log('Socket connected!', socket.id);
    connectionState.isConnected = true;
    connectionState.lastConnectedAt = Date.now();
    connectionState.reconnecting = false;
    reconnectAttempts = 0;

    document.querySelectorAll('.connection-dot').forEach(dot => {
        dot.style.backgroundColor = '#2ecc71';  // A nice green color
    });

    if (lastKnownRoom) {
        console.log('Rejoining room after connect:', lastKnownRoom);
        socket.emit('join-room', lastKnownRoom, isHost, lastKnownUsername, lastKnownColor);
    }
    document.querySelectorAll('.connection-dot').forEach(dot => {
        dot.style.backgroundColor = 'green';
    });
});

socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    connectionState.isConnected = false;
    document.querySelectorAll('.connection-dot').forEach(dot => {
        dot.style.backgroundColor = '#95a5a6';  // A nice grey color
    });
    showReconnectOverlay();
});

socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    connectionState.isConnected = false;
    attemptReconnection();
});

// Ping response handler
socket.on('pong', () => {
    lastInteraction = Date.now();
    if (isIOS) {
        // Connection is still alive, reset reconnection attempts
        reconnectAttempts = 0;
    }
});

// Event listeners
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('pageshow', handlePageShow);
window.addEventListener('pagehide', handlePageHide);

// Safari-specific event listeners
if (isSafari) {
    // Handle app going to background/foreground
    window.addEventListener('focus', () => {
        connectionState.backgrounded = false;
        handleVisibilityChange();
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

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }
});

// Refresh chat on mobile platforms when returning to chat
if (/Mobi|Android/i.test(navigator.userAgent)) {
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            // Refresh chat for both Host and Guest
            // This implementation reloads the page; customize if a partial refresh is desired
            location.reload();
        }
    });
}

// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const chatScreen = document.getElementById('chat-screen');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomInput = document.getElementById('room-input');
const roomNumber = document.getElementById('room-number');
const messageInput = document.getElementById('message-text');
const sendBtn = document.getElementById('send-button');
const messages = document.getElementById('messages');

// Event Listeners
createRoomBtn.addEventListener('click', () => {
    socket.emit('create-room');
});

joinRoomBtn.addEventListener('click', () => {
    const roomId = roomInput.value.trim();
    if (roomId) {
        socket.emit('join-room', roomId);
    }
});

// Function to create a message element with consistent structure
function createMessageElement(data, isSystem = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    if (isSystem) {
        messageDiv.classList.add('system-message');
        messageDiv.textContent = data;
        return messageDiv;
    }

    const { username, message, color, timestamp } = data;
    const isOwn = username === window.username;

    if (isOwn) {
        messageDiv.classList.add('own-message');
    }

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    const header = document.createElement('div');
    header.className = 'message-header';
    
    const usernameSpan = document.createElement('span');
    usernameSpan.className = 'username';
    usernameSpan.style.color = color;
    usernameSpan.textContent = username;
    
    const dot = document.createElement('span');
    dot.className = 'connection-dot';
    dot.style.display = 'inline-block';
    dot.style.width = '8px';
    dot.style.height = '8px';
    dot.style.borderRadius = '50%';
    dot.style.marginLeft = '5px';
    dot.style.backgroundColor = connectionState.isConnected ? 'green' : 'darkgrey';
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'timestamp';
    timeSpan.textContent = new Date(timestamp).toLocaleTimeString();
    
    header.appendChild(usernameSpan);
    header.appendChild(dot);
    header.appendChild(timeSpan);
    
    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    // Replace newlines with <br> tags for proper display
    textDiv.innerHTML = message.split('\n').map(line => {
        // Escape HTML to prevent XSS
        const escapedLine = line
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        return escapedLine;
    }).join('<br>');
    
    messageContent.appendChild(header);
    messageContent.appendChild(textDiv);
    messageDiv.appendChild(messageContent);
    
    return messageDiv;
}

// Add connection dot to chat bubbles next to username
function addConnectionDot(usernameElement, isConnected) {
    // If no dot exists already, create one
    if (!usernameElement.querySelector('.connection-dot')) {
        let dot = document.createElement('span');
        dot.className = 'connection-dot';
        dot.style.display = 'inline-block';
        dot.style.width = '8px';
        dot.style.height = '8px';
        dot.style.borderRadius = '50%';
        dot.style.marginLeft = '5px';
        dot.style.backgroundColor = isConnected ? 'green' : 'darkgrey';
        usernameElement.appendChild(dot);
    } else {
        // Update existing dot's color
        let dot = usernameElement.querySelector('.connection-dot');
        dot.style.backgroundColor = isConnected ? 'green' : 'darkgrey';
    }
}

function updateConnectionDots(isConnected) {
    const usernameElems = document.querySelectorAll('.chat-bubble .username');
    usernameElems.forEach(el => {
        addConnectionDot(el, isConnected);
    });
}

// Listen to websocket events (using 'ws' as the connection variable if defined)
if (typeof ws !== 'undefined') {
    ws.addEventListener('open', function() {
        updateConnectionDots(true);
    });
    ws.addEventListener('close', function() {
        updateConnectionDots(false);
    });
}

// Socket event handlers
socket.on('chat-message', (data) => {
    console.log('Received message data:', JSON.stringify(data, null, 2));
    const messageElement = createMessageElement(data);
    messages.appendChild(messageElement);
    messages.scrollTop = messages.scrollHeight;
});

// Handle recent messages when joining a room
socket.on('recent-messages', (messages) => {
    console.log('Received recent messages:', messages.length);
    const messagesDiv = document.getElementById('messages');
    
    // Clear existing messages
    messagesDiv.innerHTML = '';
    
    // Add all messages
    messages.forEach(msg => {
        const messageElement = createMessageElement(msg);
        messagesDiv.appendChild(messageElement);
    });
    
    // Scroll to bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// Event listeners for toggles
document.getElementById('en-toggle').addEventListener('change', () => {
    // Update message visibility
    const showEn = document.getElementById('en-toggle').checked;
    const enTexts = messages.querySelectorAll('.en-text');
    enTexts.forEach(text => {
        text.style.display = showEn ? '' : 'none';
    });
});

document.getElementById('jp-toggle').addEventListener('change', () => {
    // Update message visibility
    const showJp = document.getElementById('jp-toggle').checked;
    const jpTexts = messages.querySelectorAll('.jp-text');
    jpTexts.forEach(text => {
        text.style.display = showJp ? '' : 'none';
    });
});

document.getElementById('rp-toggle').addEventListener('change', () => {
    // Update message visibility
    const showRp = document.getElementById('rp-toggle').checked;
    const rpTexts = messages.querySelectorAll('.rp-text');
    rpTexts.forEach(text => {
        text.style.display = showRp && text.textContent.trim() !== '' ? '' : 'none';
    });
});

// Function to auto-resize textarea and containers
function autoResizeTextarea(textarea) {
    // Reset height to get correct scrollHeight
    textarea.style.height = '24px';
    
    // Calculate new height
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 200;
    const newHeight = Math.min(scrollHeight, maxHeight);
    
    // Count line breaks and update rows
    const lineBreaks = (textarea.value.match(/\n/g) || []).length;
    textarea.setAttribute('rows', String(lineBreaks + 1));
    
    // Apply new height
    textarea.style.height = newHeight + 'px';
    
    // Always enable scrolling
    textarea.style.overflowY = 'auto';
    
    // If at max height, scroll to cursor position
    if (scrollHeight > maxHeight) {
        // Use requestAnimationFrame to ensure the scroll happens after the height change
        requestAnimationFrame(() => {
            const cursorPosition = textarea.selectionStart;
            const text = textarea.value;
            
            // Calculate lines before cursor
            const linesBeforeCursor = text.substr(0, cursorPosition).split('\n').length;
            const totalLines = text.split('\n').length;
            
            // Scroll to keep cursor in view
            const lineHeight = 24; // Approximate line height
            const scrollPosition = Math.max(0, (linesBeforeCursor - 2) * lineHeight);
            textarea.scrollTop = scrollPosition;
        });
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
messageInput.addEventListener('touchstart', function(e) {
    if (this.scrollHeight > this.clientHeight) {
        e.stopPropagation();
    }
}, { passive: true });

messageInput.addEventListener('touchmove', function(e) {
    if (this.scrollHeight > this.clientHeight) {
        e.stopPropagation();
    }
}, { passive: true });

// Auto-resize on input and update send button
messageInput.addEventListener('input', function() {
    autoResizeTextarea(this);
    // updateSendButtonVisibility(this);
});

// Handle paste events
messageInput.addEventListener('paste', function() {
    // Use setTimeout to wait for the paste to complete
    setTimeout(() => {
        autoResizeTextarea(this);
        // updateSendButtonVisibility(this);
    }, 0);
});

// Handle keydown events for Enter
messageInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        if (!e.shiftKey) {
            e.preventDefault();
            sendMessage();
        } else {
            // For Shift+Enter, update rows after the line break is added
            setTimeout(() => autoResizeTextarea(this), 0);
        }
    }
});

// Initialize textarea height and button visibility
autoResizeTextarea(messageInput);
// updateSendButtonVisibility(messageInput);

// Event listener for send button
document.querySelector('.send-button').addEventListener('click', function() {
    sendMessage();
});

socket.on('user-joined', (data) => {
    const messageElement = createMessageElement(`${data.username} joined the room`, true);
    messages.appendChild(messageElement);
});

socket.on('user-left', (data) => {
    const messageElement = createMessageElement(`${data.username} left the room`, true);
    messages.appendChild(messageElement);
});

// Keep socket alive
setInterval(() => {
    if (socket.connected) {
        socket.emit('ping');
    }
}, 25000);

socket.on('pong', () => {
    console.log('Received pong from server');
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (message && currentRoom) {
        socket.emit('chat-message', currentRoom, message);
        messageInput.value = '';
        // Reset the textarea height and rows
        messageInput.style.height = '24px';
        messageInput.style.overflowY = 'auto';
        messageInput.setAttribute('rows', '1');
        // Hide send button
        // updateSendButtonVisibility(messageInput);
    }
}

// Connection lost overlay for disconnect events
function showReconnectOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'reconnect-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '1000';
    
    const button = document.createElement('button');
    button.innerText = 'Reconnect';
    button.style.padding = '1em 2em';
    button.style.fontSize = '1.5em';
    button.style.cursor = 'pointer';
    button.onclick = function() {
        location.reload();
    };
    
    overlay.appendChild(button);
    document.body.appendChild(overlay);
}