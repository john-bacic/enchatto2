const socket = io({
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
    autoConnect: true,
    transports: ['websocket', 'polling']
});

console.log('Initializing socket connection...');

let currentRoom = null;
let username = null;
let lastKnownRoom = null;
let lastKnownUsername = null;

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

// Handle visibility change
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        // Reconnect if needed
        if (!socket.connected) {
            console.log('Reconnecting on visibility change...');
            socket.connect();
            
            // Rejoin room if we have the information
            if (lastKnownRoom) {
                console.log('Rejoining room:', lastKnownRoom);
                socket.emit('join-room', lastKnownRoom, false, lastKnownUsername);
            }
        }
    }
});

// Handle socket reconnection
socket.on('connect', () => {
    console.log('Socket connected!', socket.id);
    if (lastKnownRoom) {
        console.log('Rejoining room after reconnect:', lastKnownRoom);
        socket.emit('join-room', lastKnownRoom, false, lastKnownUsername);
    }
});

socket.on('disconnect', () => {
    console.log('Socket disconnected');
});

socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    // Try to reconnect
    setTimeout(() => {
        if (!socket.connected) {
            console.log('Attempting to reconnect...');
            socket.connect();
        }
    }, 2000);
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
});

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
    console.log('\n=== Creating Message Element ===');
    console.log('Source Lang:', data.sourceLang);
    console.log('Has Translation:', !!data.translation);
    console.log('Has Romanji:', !!data.romanji);
    console.log('Romanji Value:', data.romanji);

    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    
    if (isSystem) {
        messageElement.classList.add('system-message');
    } else if (data.username === username) {
        messageElement.classList.add('own-message');
    }

    // Create message content container
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');

    if (!isSystem) {
        // Add username with color
        const usernameSpan = document.createElement('span');
        usernameSpan.classList.add('username');
        usernameSpan.style.color = data.color;
        usernameSpan.textContent = data.username;
        messageContent.appendChild(usernameSpan);

        // Create text container for better spacing
        const textContainer = document.createElement('div');
        textContainer.classList.add('text-container');

        // Original message (English or Japanese)
        const originalText = document.createElement('span');
        originalText.classList.add('text', data.sourceLang === 'en' ? 'en-text' : 'jp-text');
        originalText.textContent = data.message;
        textContainer.appendChild(originalText);
        console.log('1. Added original text:', data.message);

        // Always create the translation container so romanji always appears
        const translationContainer = document.createElement('div');
        translationContainer.classList.add('translation-container');

        if (data.sourceLang === 'en') {
            // For English input:
            // If a Japanese translation exists, add it.
            if (data.translation) {
                console.log('2. Adding Japanese translation for English input:', data.translation);
                const jpText = document.createElement('span');
                jpText.classList.add('text', 'translation-text', 'jp-text');
                jpText.textContent = data.translation;
                translationContainer.appendChild(jpText);
            }
            // Always add romanji text for English input.
            console.log('3. Adding romanji for English input');
            const rpText = document.createElement('span');
            rpText.classList.add('text', 'rp-text');
            rpText.style.cssText =
              'display: block !important; color: #666 !important; margin-top: 4px !important; font-style: italic !important;';
            rpText.textContent = data.romanji || '(romanji)';
            translationContainer.appendChild(rpText);
        } else {
            // For Japanese input:
            // Always add romanji text first.
            console.log('2. Adding romanji for Japanese input');
            const rpText = document.createElement('span');
            rpText.classList.add('text', 'rp-text');
            rpText.style.cssText =
              'display: block !important; color: #666 !important; margin-top: 4px !important; font-style: italic !important;';
            rpText.textContent = data.romanji || '(romanji)';
            translationContainer.appendChild(rpText);

            // Then, if an English translation exists, add it.
            if (data.translation) {
                console.log('3. Adding English translation for Japanese input:', data.translation);
                const enText = document.createElement('span');
                enText.classList.add('text', 'translation-text', 'en-text');
                enText.textContent = data.translation;
                translationContainer.appendChild(enText);
            }
        }

        textContainer.appendChild(translationContainer);
        console.log('5. Final container HTML:', textContainer.innerHTML);

        messageContent.appendChild(textContainer);
    } else {
        // System message
        const enText = document.createElement('div');
        enText.classList.add('text', 'en-text');
        enText.textContent = data;
        messageContent.appendChild(enText);
    }

    messageElement.appendChild(messageContent);
    return messageElement;
}

// Socket event handlers
socket.on('chat-message', (data) => {
    console.log('\n=== Received Chat Message Data ===');
    console.log('Message:', data.message);
    console.log('Source Lang:', data.sourceLang);
    console.log('Translation:', data.translation);
    console.log('Target Lang:', data.targetLang);
    console.log('Romanji:', data.romanji);
    console.log('================================\n');

    const messageElement = createMessageElement(data);
    document.getElementById('messages').appendChild(messageElement);
    messages.scrollTop = messages.scrollHeight;
});

socket.on('room-joined', (roomId, userData) => {
    currentRoom = roomId;
    lastKnownRoom = roomId;
    username = userData.username;
    lastKnownUsername = userData.username;
    console.log('Joined room:', roomId, 'as:', userData.username);
    roomNumber.textContent = roomId;
    welcomeScreen.style.display = 'none';
    chatScreen.style.display = 'block';
});

socket.on('room-created', (roomId) => {
    currentRoom = roomId;
    lastKnownRoom = roomId;
    roomNumber.textContent = roomId;
    welcomeScreen.style.display = 'none';
    chatScreen.style.display = 'block';
});

// Initialize toggle states
document.getElementById('en-toggle').checked = true;
document.getElementById('jp-toggle').checked = true;
document.getElementById('rp-toggle').checked = true;

// Add toggle event listeners
document.getElementById('en-toggle').addEventListener('change', (e) => {
    console.log('English toggle changed:', e.target.checked);
    document.querySelectorAll('.en-text').forEach(el => {
        el.style.display = e.target.checked ? '' : 'none';
    });
});

document.getElementById('jp-toggle').addEventListener('change', (e) => {
    console.log('Japanese toggle changed:', e.target.checked);
    document.querySelectorAll('.jp-text').forEach(el => {
        el.style.display = e.target.checked ? '' : 'none';
    });
});

document.getElementById('rp-toggle').addEventListener('change', (e) => {
    console.log('Romanji toggle changed:', e.target.checked);
    document.querySelectorAll('.rp-text').forEach(el => {
        el.style.display = e.target.checked ? '' : 'none';
    });
});

// Function to send message
function sendMessage() {
    const messageText = messageInput.value.trim();
    if (messageText && socket.connected) {
        socket.emit('chat-message', currentRoom, messageText);
        messageInput.value = '';
    }
}

// Event listener for message input
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

socket.on('user-joined', (username) => {
    const messageElement = createMessageElement(`${username} joined the room`, true);
    messages.appendChild(messageElement);
});

socket.on('user-left', (username) => {
    const messageElement = createMessageElement(`${username} left the room`, true);
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
