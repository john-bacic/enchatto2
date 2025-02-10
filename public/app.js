const socket = io({
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    autoConnect: true
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

// Debug logging
function debugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
    console.log(`[${timestamp}] ${logMessage}`);
}

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

// Enhanced message sending with connection check and logging
function sendMessage() {
    const message = messageInput.value.trim();
    debugLog('Attempting to send message:', { message, currentRoom, connected: socket.connected });

    if (!message) {
        debugLog('Message empty, not sending');
        return;
    }

    if (!currentRoom) {
        debugLog('No current room, cannot send message');
        showSystemMessage("Error: Not connected to a room");
        return;
    }

    if (!socket.connected) {
        debugLog('Socket disconnected, queueing message');
        showSystemMessage("Cannot send message - attempting to reconnect...");
        
        const queuedMessage = message;
        socket.once('reconnect', () => {
            debugLog('Reconnected, sending queued message');
            socket.emit('chat-message', currentRoom, queuedMessage);
            messageInput.value = '';
        });
        return;
    }

    debugLog('Emitting chat message');
    socket.emit('chat-message', currentRoom, message, (error) => {
        if (error) {
            debugLog('Error sending message:', error);
            showSystemMessage("Error sending message. Please try again.");
            return;
        }
        debugLog('Message sent successfully');
        messageInput.value = '';
    });
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

sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    sendMessage();
});

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

// Socket event handlers with logging
socket.on('chat-message', (data) => {
    debugLog('Received chat message:', data);
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.innerHTML = `
        <span class="username">${data.username}</span>
        <span class="message-text">${data.message}</span>
    `;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('connect', () => {
    debugLog('Socket connected:', socket.id);
    showSystemMessage("Connected to chat server");
    if (lastKnownRoom) {
        debugLog('Attempting to rejoin room:', lastKnownRoom);
        socket.emit('rejoin-room', {
            room: lastKnownRoom,
            username: lastKnownUsername
        });
    }
});

socket.on('disconnect', (reason) => {
    debugLog('Socket disconnected:', reason);
    showSystemMessage("Disconnected from chat server");
});

socket.on('error', (error) => {
    debugLog('Socket error:', error);
    showSystemMessage("Error: " + error);
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

// Keep connection alive with ping/pong
setInterval(() => {
    if (socket.connected) {
        socket.emit('ping');
    }
}, 20000);

socket.on('pong', () => {
    console.log('Connection alive - received pong');
});