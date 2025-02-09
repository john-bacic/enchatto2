const socket = io({
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    transports: ['websocket', 'polling']
});

let currentRoom = null;
let username = null;
let userColor = null; 
let isHost = false;

// Get room ID from URL
const roomId = window.location.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
console.log('Room ID:', roomId);

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
const guestNameInput = document.getElementById('guest-name');

// Function to send message
function sendMessage() {
    const messageText = messageInput.value.trim();
    if (messageText && roomId) {
        console.log('Sending message in room:', roomId, messageText);
        socket.emit('chat-message', messageText);
        messageInput.value = '';
    }
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

// Initialize guest name input color and observer
if (guestNameInput) {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const borderColor = guestNameInput.style.borderColor;
                if (borderColor) {
                    guestNameInput.style.color = borderColor;
                }
            }
        });
    });

    observer.observe(guestNameInput, {
        attributes: true,
        attributeFilter: ['style']
    });
}

// Function to update guest input colors
function updateGuestInputColors(color) {
    if (guestNameInput) {
        if (color) {
            guestNameInput.style.borderColor = color;
            guestNameInput.style.color = color;
        } else {
            const currentBorderColor = guestNameInput.style.borderColor;
            if (currentBorderColor) {
                guestNameInput.style.color = currentBorderColor;
            }
        }
    }
}

// Function to convert hex to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : null;
}

// Function to update button color
function updateButtonColor(color) {
    const sendButton = document.querySelector('.send-button');
    if (sendButton) {
        sendButton.style.backgroundColor = color;
    }
}

// Socket events
socket.on('connect', () => {
    console.log('Connected to server, socket id:', socket.id);
    // Re-join room after reconnection if we have a roomId
    if (roomId) {
        const isGuestPrompt = document.getElementById('guest-name-prompt');
        const isGuest = isGuestPrompt && isGuestPrompt.style.display !== 'none';
        if (!isGuest) {
            console.log('Rejoining as host');
            socket.emit('join-room', roomId, true);
        }
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
});

socket.on('username-assigned', (data) => {
    console.log('Username assigned:', data);
    username = data.username;
    userColor = data.color;
    isHost = data.isHost;
    
    // Update send button color to match username color
    const sendButton = document.getElementById('send-button');
    if (sendButton) {
        sendButton.style.backgroundColor = userColor;
    }
    
    // Update welcome message with user's color
    const welcomeMessage = document.getElementById('welcome-message');
    if (welcomeMessage) {
        welcomeMessage.innerHTML = `Welcome, <span style="color: ${userColor}">${username}</span>!`;
    }
    
    // If this is a guest, also update the input border and text color
    if (!isHost && guestNameInput) {
        guestNameInput.style.borderColor = userColor;
        guestNameInput.style.color = userColor;
    }
});

socket.on('room-created', (roomId) => {
    currentRoom = roomId;
    roomNumber.textContent = roomId;
    welcomeScreen.style.display = 'none';
    chatScreen.style.display = 'block';
});

socket.on('room-joined', (roomId) => {
    currentRoom = roomId;
    roomNumber.textContent = roomId;
    welcomeScreen.style.display = 'none';
    chatScreen.style.display = 'block';
});

socket.on('chat-message', (data) => {
    console.log('Received message:', data);
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    
    if (data.username === username) {
        messageElement.classList.add('own-message');
        // Update send button color to match our username color
        const sendButton = document.getElementById('send-button');
        if (sendButton) {
            sendButton.style.backgroundColor = data.color;
        }
    }
    
    messageElement.innerHTML = `
        <span style="color: ${data.color}">${data.username}</span>
        <div class="message-content">${data.message}</div>
        <span class="timestamp">${formatTimestamp(data.timestamp)}</span>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('user-joined', (data) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('system-message');
    messageElement.innerHTML = `<span style="color: ${data.color}">${data.username}</span> joined the room`;
    chatMessages.appendChild(messageElement);
});

socket.on('user-left', (data) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('system-message');
    messageElement.innerHTML = `<span style="color: ${data.color}">${data.username}</span> left the room`;
    chatMessages.appendChild(messageElement);
});

socket.on('recent-messages', (messages) => {
    console.log('Received recent messages:', messages);
    // Clear existing messages
    chatMessages.innerHTML = '';
    
    // Add each message to the chat
    messages.forEach(data => {
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        if (data.username === username) {
            messageElement.classList.add('own-message');
        }
        
        messageElement.innerHTML = `
            <span style="color: ${data.color}">${data.username}</span>
            <div class="message-content">${data.message}</div>
            <span class="timestamp">${formatTimestamp(data.timestamp)}</span>
        `;
        
        chatMessages.appendChild(messageElement);
    });
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Function to join as guest
function joinAsGuest() {
    const guestName = guestNameInput.value.trim() || `Guest ${Math.floor(Math.random() * 1000)}`;
    const storedInfo = getGuestInfo(guestName);
    
    console.log('Joining as guest:', guestName, 'in room:', roomId);
    // Join room with stored color if available
    socket.emit('join-room', roomId, false, guestName, storedInfo?.color);
    
    // Hide prompt and show chat
    document.getElementById('guest-name-prompt').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
}

// Function to handle selecting a previous guest
function selectPreviousGuest() {
    const select = document.getElementById('previous-guests');
    const selectedName = select.value;
    
    if (selectedName && guestNameInput) {
        guestNameInput.value = selectedName;
        const info = getGuestInfo(selectedName);
        if (info && info.color) {
            socket.emit('join-room', roomId, false, selectedName, info.color);
        }
    }
}

// Initialize as host on page load
document.addEventListener('DOMContentLoaded', () => {
    const isGuestPrompt = document.getElementById('guest-name-prompt');
    if (isGuestPrompt && isGuestPrompt.style.display !== 'none') {
        // We're on the guest prompt screen
        console.log('Initializing as guest prompt for room:', roomId);
    } else {
        // We're on the host screen
        console.log('Initializing as host for room:', roomId);
        socket.emit('join-room', roomId, true);
    }
});

// Helper function to store guest info
function storeGuestInfo(name, color) {
    const guestInfo = JSON.parse(localStorage.getItem('chatGuestInfo') || '{}');
    guestInfo[name] = { color, lastUsed: new Date().toISOString() };
    localStorage.setItem('chatGuestInfo', JSON.stringify(guestInfo));
    updateGuestSelect();
    updateGuestInputColors(color);
}

// Function to update guest select
function updateGuestSelect() {
    const select = document.getElementById('previous-guests');
    const guestInfo = JSON.parse(localStorage.getItem('chatGuestInfo') || '{}');
    const options = Object.keys(guestInfo).sort((a, b) => {
        return new Date(guestInfo[b].lastUsed) - new Date(guestInfo[a].lastUsed);
    }).map((name) => {
        return `<option value="${name}">${name}</option>`;
    });
    select.innerHTML = options.join('');
}

// Initialize button color on page load
document.addEventListener('DOMContentLoaded', () => {
    // Removed default color assignment
});

// Helper functions
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getGuestInfo(name) {
    const guestInfo = JSON.parse(localStorage.getItem('chatGuestInfo') || '{}');
    return guestInfo[name];
}
