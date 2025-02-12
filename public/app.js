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

    if (lastKnownRoom) {
        console.log('Rejoining room after connect:', lastKnownRoom);
        socket.emit('join-room', lastKnownRoom, isHost, lastKnownUsername, lastKnownColor);
    }
});

socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    connectionState.isConnected = false;
    
    // Handle Safari-specific disconnects
    if (isSafari && reason === 'transport close') {
        attemptReconnection();
    }
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
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'username';
    nameSpan.style.color = color;
    nameSpan.textContent = username;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'timestamp';
    timeSpan.textContent = new Date(timestamp).toLocaleTimeString();
    
    header.appendChild(nameSpan);
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

// Function to send message
function sendMessage() {
    const messageInput = document.getElementById('message-text');
    const message = messageInput.value.trim();
    if (message && currentRoom) {
        socket.emit('chat-message', currentRoom, message);
        messageInput.value = '';
        // Reset the textarea height
        messageInput.style.height = '24px';
        messageInput.style.overflowY = 'hidden';
    }
}

// Function to auto-resize textarea and containers
function autoResizeTextarea(textarea) {
    const container = document.querySelector('.message-input-container');
    const messageInput = document.querySelector('.message-input');
    
    // Reset heights to get correct measurements
    textarea.style.height = '24px';
    
    // Get the new height
    const height = Math.min(textarea.scrollHeight, 200);
    
    // Set heights for all elements
    textarea.style.height = height + 'px';
    messageInput.style.height = (height + 16) + 'px'; // Add padding
    container.style.height = (height + 32) + 'px'; // Add container padding
    
    // Handle overflow if needed
    if (height >= 200) {
        textarea.style.overflowY = 'auto';
        textarea.scrollTop = textarea.scrollHeight;
    } else {
        textarea.style.overflowY = 'hidden';
    }
}

// Event listener for message input
const messageInput = document.getElementById('message-text');

// Auto-resize on input
messageInput.addEventListener('input', function() {
    autoResizeTextarea(this);
});

// Handle paste events
messageInput.addEventListener('paste', function() {
    // Use setTimeout to wait for the paste to complete
    setTimeout(() => autoResizeTextarea(this), 0);
});

// Handle keydown events for Enter
messageInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        if (!e.shiftKey) {
            e.preventDefault(); // Prevent default only when not using Shift+Enter
        }
        // Always resize after a line break
        setTimeout(() => autoResizeTextarea(this), 0);
    }
});

// Initialize textarea height
autoResizeTextarea(messageInput);

// Event listener for send button
document.querySelector('.send-button').addEventListener('click', function() {
    sendMessage();
    // Reset all heights after sending
    setTimeout(() => {
        const container = document.querySelector('.message-input-container');
        const messageInput = document.querySelector('.message-input');
        const textarea = document.getElementById('message-text');
        
        textarea.value = '';
        textarea.style.height = '24px';
        messageInput.style.height = '40px';
        container.style.height = '56px';
        textarea.style.overflowY = 'hidden';
    }, 0);
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