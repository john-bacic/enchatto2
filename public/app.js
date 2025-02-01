const socket = io();
let currentRoom = null;
let username = null;

// Get room ID from URL
function getRoomFromUrl() {
    return window.location.pathname.substring(1);
}

// Get stored username from localStorage
function getStoredUsername() {
    return localStorage.getItem('chatGuestUsername');
}

// Store username in localStorage
function storeUsername(name) {
    localStorage.setItem('chatGuestUsername', name);
}

// Initialize when page loads
window.addEventListener('load', async () => {
    const roomId = getRoomFromUrl();
    if (!roomId) return;  // Will be redirected
    
    currentRoom = roomId;
    console.log('Room ID:', roomId);
    
    // Check if we have a stored username
    const storedUsername = getStoredUsername();
    if (storedUsername) {
        username = storedUsername;
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
    messageElement.className = 'message' + (username === 'Host' ? ' own' : '');
    
    const usernameElement = document.createElement('div');
    usernameElement.className = 'username';
    usernameElement.textContent = username;
    
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
