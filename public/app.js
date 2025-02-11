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
        const originalText = document.createElement('div');
        originalText.classList.add('text', data.sourceLang === 'en' ? 'en-text' : 'jp-text');
        originalText.textContent = data.message;
        originalText.style.display = document.getElementById(`${data.sourceLang}-toggle`).checked ? '' : 'none';
        textContainer.appendChild(originalText);

        // Translation and romanji
        if (data.translation) {
            // Translation text
            const translationText = document.createElement('div');
            translationText.classList.add('text', data.targetLang === 'en' ? 'en-text' : 'jp-text');
            translationText.textContent = data.translation;
            translationText.style.display = document.getElementById(`${data.targetLang}-toggle`).checked ? '' : 'none';
            textContainer.appendChild(translationText);

            // Add romanji if we have it
            if (data.romanji) {
                console.log('Adding romanji:', data.romanji);
                const rpText = document.createElement('div');
                rpText.classList.add('text', 'rp-text');
                rpText.textContent = data.romanji;
                rpText.style.display = document.getElementById('rp-toggle').checked ? '' : 'none';
                textContainer.appendChild(rpText);
            }
        }

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
    
    // Update visibility based on current toggle states
    updateMessageVisibility();
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

// Update message visibility function
function updateMessageVisibility() {
    console.log('=== START VISIBILITY UPDATE ===');
    const showEn = document.getElementById('en-toggle').checked;
    const showJp = document.getElementById('jp-toggle').checked;
    const showRp = document.getElementById('rp-toggle').checked;

    console.log('Toggle states:', { showEn, showJp, showRp });

    document.querySelectorAll('.message').forEach((message, index) => {
        console.log(`Processing message ${index}:`);
        const enText = message.querySelector('.en-text');
        const jpText = message.querySelector('.jp-text');
        const rpText = message.querySelector('.rp-text');

        if (enText) {
            console.log('English text:', {
                content: enText.textContent,
                visible: showEn
            });
            enText.style.display = showEn ? '' : 'none';
        }
        
        if (jpText) {
            console.log('Japanese text:', {
                content: jpText.textContent,
                visible: showJp
            });
            jpText.style.display = showJp ? '' : 'none';
        }
        
        if (rpText) {
            console.log('Romanji text:', {
                content: rpText.textContent,
                visible: showRp && rpText.textContent.trim() !== '',
                hasContent: rpText.textContent.trim() !== ''
            });
            rpText.style.display = showRp && rpText.textContent.trim() !== '' ? '' : 'none';
        } else {
            console.log('No romanji text element found');
        }
    });
    console.log('=== END VISIBILITY UPDATE ===');
}

// Event listeners for toggles
document.getElementById('en-toggle').addEventListener('change', updateMessageVisibility);
document.getElementById('jp-toggle').addEventListener('change', updateMessageVisibility);
document.getElementById('rp-toggle').addEventListener('change', updateMessageVisibility);

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