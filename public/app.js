const socket = io({
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
    autoConnect: true
});

let currentRoom = null;
let username = null;
let lastKnownRoom = null;
let lastKnownUsername = null;
let userColor = null;

// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const chatScreen = document.getElementById('chat-screen');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomInput = document.getElementById('room-input');
const roomNumber = document.getElementById('room-number');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');

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
    console.log('Socket connected:', socket.id);
    if (lastKnownRoom) {
        console.log('Rejoining room after reconnect:', lastKnownRoom);
        socket.emit('join-room', lastKnownRoom, false, lastKnownUsername);
    }
});

socket.on('disconnect', () => {
    console.log('Socket disconnected');
});

socket.on('connect_error', (error) => {
    console.log('Connection error:', error);
    // Try to reconnect
    setTimeout(() => {
        if (!socket.connected) {
            console.log('Attempting to reconnect...');
            socket.connect();
        }
    }, 2000);
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

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);

// Store room information when joining
socket.on('room-joined', (roomId, userData) => {
    currentRoom = roomId;
    lastKnownRoom = roomId;
    username = userData.username;
    lastKnownUsername = userData.username;
    userColor = userData.color;
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

// Function to create message element
function createMessageElement(data, isTranslation = false) {
    if (isTranslation) {
        // Find existing message and add translation
        const messageId = data.messageId;
        const existingMessage = document.querySelector(`[data-message-id="${messageId}"]`);
        if (existingMessage) {
            const translationDiv = document.createElement('div');
            translationDiv.classList.add('message-translation');
            translationDiv.textContent = `${data.targetLang === 'en' ? '🇺🇸' : '🇯🇵'} ${data.translation}`;
            existingMessage.querySelector('.message-content').appendChild(translationDiv);
        }
        return;
    }

    // Create new message element
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    if (data.username === username) {
        messageElement.classList.add('own-message');
    }
    
    // Generate unique message ID
    const messageId = Date.now() + Math.random().toString(36).substr(2, 9);
    messageElement.setAttribute('data-message-id', messageId);
    
    messageElement.innerHTML = `
        <span class="username" style="color: ${data.color}">${data.username}</span>
        <div class="message-content">
            <div class="message-text">${data.message}</div>
        </div>
        <span class="timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    `;
    
    return { element: messageElement, messageId };
}

// Function to send message with connection check
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    if (!socket.connected) {
        console.log('Socket disconnected, attempting to reconnect...');
        socket.connect();
        
        // Show reconnecting message to user
        const messageElement = document.createElement('div');
        messageElement.classList.add('system-message');
        messageElement.textContent = 'Reconnecting...';
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Wait for reconnection
        socket.once('connect', () => {
            // Rejoin room and then send message
            socket.emit('join-room', lastKnownRoom, false, lastKnownUsername, () => {
                sendMessageWithId(message);
                messageInput.value = '';
            });
        });
        return;
    }

    // Normal send if connected
    if (currentRoom) {
        sendMessageWithId(message);
        messageInput.value = '';
    }
}

// Send message with ID for tracking
function sendMessageWithId(message) {
    const messageData = {
        message,
        username,
        color: userColor,
        messageId: Date.now() + Math.random().toString(36).substr(2, 9)
    };
    
    // Show message immediately
    const { element, messageId } = createMessageElement(messageData);
    chatMessages.appendChild(element);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Send to server
    socket.emit('chat-message', currentRoom, messageData);
}

// Handle incoming messages
socket.on('chat-message', (data) => {
    if (data.isTranslation) {
        // Handle translation update
        createMessageElement(data, true);
    } else {
        // Handle new message
        const { element } = createMessageElement(data);
        chatMessages.appendChild(element);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});

socket.on('user-joined', (username) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('system-message');
    messageElement.textContent = `${username} joined the room`;
    chatMessages.appendChild(messageElement);
});

socket.on('user-left', (username) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('system-message');
    messageElement.textContent = `${username} left the room`;
    chatMessages.appendChild(messageElement);
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