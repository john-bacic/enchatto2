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

socket.on('chat-message', (username, message) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.innerHTML = `
        <span class="username">${username}</span>
        <span class="message-text">${message}</span>
    `;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
                socket.emit('chat-message', lastKnownRoom, message);
                messageInput.value = '';
            });
        });
        return;
    }

    // Normal send if connected
    if (currentRoom) {
        socket.emit('chat-message', currentRoom, message);
        messageInput.value = '';
    }
}

// Keep socket alive
setInterval(() => {
    if (socket.connected) {
        socket.emit('ping');
    }
}, 25000);

socket.on('pong', () => {
    console.log('Received pong from server');
});