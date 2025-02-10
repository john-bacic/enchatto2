const socket = io({
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
});

let currentRoom = null;
let username = null;
let lastKnownRoom = null;
let lastKnownUsername = null;
let reconnectAttempts = 0;

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

// Handle visibility change with improved logging
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        console.log("App is back in focus, checking socket connection...");
        if (!socket.connected) {
            console.log("Socket disconnected, attempting to reconnect...");
            socket.connect();
            
            // Show reconnecting message to user
            showSystemMessage("Reconnecting to chat...");
            
            // Attempt to rejoin room
            if (lastKnownRoom) {
                socket.emit('rejoin-room', {
                    room: lastKnownRoom,
                    username: lastKnownUsername
                });
            }
        } else {
            console.log("Socket already connected");
        }
    }
});

// Enhanced disconnect handling
socket.on("disconnect", (reason) => {
    console.warn("Socket disconnected:", reason);
    showSystemMessage("Connection lost. Attempting to reconnect...");
    
    if (reason === "transport close" || reason === "ping timeout") {
        reconnectAttempts++;
        setTimeout(() => {
            console.log(`Attempting to reconnect... (Attempt ${reconnectAttempts})`);
            socket.connect();
        }, Math.min(1000 * reconnectAttempts, 5000));
    }
});

// Handle successful reconnection
socket.on("reconnect", (attemptNumber) => {
    console.log(`Reconnected after ${attemptNumber} attempts`);
    showSystemMessage("Reconnected to chat!");
    reconnectAttempts = 0;
    
    // Rejoin room if we have the information
    if (lastKnownRoom) {
        socket.emit('rejoin-room', {
            room: lastKnownRoom,
            username: lastKnownUsername
        });
    }
});

// Handle reconnect error
socket.on("reconnect_error", (error) => {
    console.error("Reconnection error:", error);
    showSystemMessage("Failed to reconnect. Please refresh the page.");
});

// Handle reconnect failed
socket.on("reconnect_failed", () => {
    console.error("Failed to reconnect after all attempts");
    showSystemMessage("Connection lost. Please refresh the page.");
});

// Utility function to show system messages
function showSystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('system-message');
    messageElement.textContent = message;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

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

// Enhanced message sending with connection check
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    if (!socket.connected) {
        console.log("Cannot send message - socket disconnected");
        showSystemMessage("Cannot send message - attempting to reconnect...");
        
        // Queue message to be sent after reconnection
        const queuedMessage = message;
        socket.once('reconnect', () => {
            if (currentRoom) {
                socket.emit('chat-message', currentRoom, queuedMessage);
                messageInput.value = '';
                console.log("Queued message sent after reconnection");
            }
        });
        return;
    }

    if (currentRoom) {
        socket.emit('chat-message', currentRoom, message);
        messageInput.value = '';
    }
}

// Keep connection alive with ping/pong
setInterval(() => {
    if (socket.connected) {
        socket.emit('ping');
    }
}, 20000);

socket.on('pong', () => {
    console.log('Connection alive - received pong');
});