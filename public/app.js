const socket = io();
let currentRoom = null;
let username = null;
let isHost = false;

// Get room ID from URL
function getRoomFromUrl() {
    return window.location.pathname.substring(1);
}

// Get stored values from localStorage
function getStoredUsername() {
    return localStorage.getItem('chatGuestUsername');
}

function getStoredHostname() {
    return localStorage.getItem('chatHostUsername');
}

function getStoredRoomId() {
    return localStorage.getItem('chatRoomId');
}

// Store values in localStorage
function storeUsername(name) {
    localStorage.setItem('chatGuestUsername', name);
}

function storeHostname(name) {
    localStorage.setItem('chatHostUsername', name);
}

function storeRoomId(roomId) {
    localStorage.setItem('chatRoomId', roomId);
}

// Initialize when page loads
window.addEventListener('load', async () => {
    const roomId = getRoomFromUrl();
    if (!roomId) {
        // Check if we have a stored room ID
        const storedRoomId = getStoredRoomId();
        if (storedRoomId) {
            window.location.href = `/room/${storedRoomId}`;
            return;
        }
        return;  // Will be redirected
    }
    
    currentRoom = roomId;
    storeRoomId(roomId);  // Store the room ID
    console.log('Room ID:', roomId);
    
    // Check if we have stored usernames
    const storedUsername = getStoredUsername();
    const storedHostname = getStoredHostname();
    
    if (storedUsername) {
        username = storedUsername;
        socket.emit('set-username', roomId, username);
    }
    
    if (storedHostname) {
        username = storedHostname;
        isHost = true;
        socket.emit('set-username', roomId, username);
    }
    
    try {
        // Get room info
        const response = await fetch(`/api/room/${roomId}`);
        const data = await response.json();
        
        if (!data || !data.qrCode) {
            console.error('No QR code received');
            return;
        }
        
        // Display QR code
        const qrCode = document.getElementById('qr-code');
        qrCode.innerHTML = `<img src="${data.qrCode}" alt="Room QR Code">`;
        
        // Display room info
        document.getElementById('room-id').textContent = roomId;
        document.getElementById('join-url').textContent = window.location.href;
        
        // Join room
        socket.emit('join-room', roomId);
        
    } catch (error) {
        console.error('Error:', error);
    }
});

// Send message
function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (message && currentRoom) {
        socket.emit('chat-message', currentRoom, message);
        input.value = '';
    }
}

// Handle incoming messages
socket.on('chat-message', (username, message) => {
    const messagesDiv = document.getElementById('messages');
    const messageElement = document.createElement('div');
    const storedHostName = localStorage.getItem('chatHostUsername');
    const isOwnMessage = isHost ? (username === storedHostName) : (username === username);
    messageElement.className = 'message' + (isOwnMessage ? ' own' : '');
    
    const usernameElement = document.createElement('div');
    usernameElement.className = 'username';
    usernameElement.textContent = username;  // Display the actual username
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-text';
    messageContent.textContent = message;
    
    messageElement.appendChild(usernameElement);
    messageElement.appendChild(messageContent);
    
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// Update user count
socket.on('user-count', (count) => {
    document.getElementById('user-count').textContent = count;
});

// Add system message handling with fade-out effect
function addSystemMessage(message) {
    // Don't show system messages if username is undefined
    if (message.includes('undefined')) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'system-message';
    messageElement.textContent = message;
    
    const messagesContainer = document.getElementById('messages');
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Start fade out after 1.5 seconds
    setTimeout(() => {
        messageElement.classList.add('fade-out');
        // Remove element after animation completes (0.5s)
        setTimeout(() => {
            messageElement.remove();
        }, 500);
    }, 1500);
}

socket.on('user-joined', (data) => {
    if (data && data.username) {
        addSystemMessage(`${data.username} joined the chat`);
    }
});

socket.on('user-left', (data) => {
    if (data && data.username) {
        addSystemMessage(`${data.username} left the chat`);
    }
});
