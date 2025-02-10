// Initialize socket with deployment-friendly settings
const socket = io({
    transports: ['websocket', 'polling'],
    upgrade: true,
    rememberUpgrade: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    autoConnect: true,
    forceNew: true
});

let currentRoom = null;
let username = null;
let lastKnownRoom = null;
let lastKnownUsername = null;
let reconnectAttempts = 0;
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

// Enhanced message sending with better error handling
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
        debugLog('Socket disconnected, attempting reconnection...');
        showSystemMessage("Reconnecting to server...");
        socket.connect();
        
        // Queue message
        const queuedMessage = message;
        let reconnectTimeout = setTimeout(() => {
            debugLog('Reconnection timeout, message not sent');
            showSystemMessage("Connection failed. Please try again.");
        }, 5000);

        socket.once('connect', () => {
            clearTimeout(reconnectTimeout);
            debugLog('Reconnected, sending queued message');
            
            // Rejoin room first
            socket.emit('rejoin-room', {
                room: currentRoom,
                username: username
            }, () => {
                // Send message after rejoining
                socket.emit('chat-message', currentRoom, queuedMessage, (error) => {
                    if (error) {
                        debugLog('Error sending queued message:', error);
                        showSystemMessage("Failed to send message. Please try again.");
                        return;
                    }
                    messageInput.value = '';
                    debugLog('Queued message sent successfully');
                });
            });
        });
        return;
    }

    // Normal send if connected
    socket.emit('chat-message', currentRoom, message, (error) => {
        if (error) {
            debugLog('Error sending message:', error);
            showSystemMessage("Error: " + error);
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

// Event Listeners for message sending
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Prevent default to avoid form submission
        sendMessage();
    }
});

// Ensure send button inherits color and works
sendBtn.addEventListener('click', (e) => {
    e.preventDefault(); // Prevent default to avoid form submission
    sendMessage();
});

// Store room information when joining
socket.on('room-joined', (roomId, userData) => {
    currentRoom = roomId;
    username = userData.username;
    userColor = userData.color;
    lastKnownRoom = roomId;
    lastKnownUsername = username;
    
    // Update send button color
    sendBtn.style.backgroundColor = userColor;
    sendBtn.style.borderColor = userColor;
    
    // Show chat interface
    welcomeScreen.style.display = 'none';
    chatScreen.style.display = 'block';
    
    debugLog('Joined room:', { roomId, userData });
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
    
    // Apply color to username
    messageElement.innerHTML = `
        <span class="username" style="color: ${data.color}">${data.username}</span>
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

// Keep connection alive with more frequent pings
setInterval(() => {
    if (socket.connected) {
        socket.emit('ping');
    } else {
        debugLog('Socket disconnected during ping, attempting reconnect');
        socket.connect();
    }
}, 10000);

socket.on('pong', () => {
    console.log('Connection alive - received pong');
});