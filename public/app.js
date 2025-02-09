const socket = io();
let currentRoom = null;
let username = null;

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

function sendMessage() {
    const message = messageInput.value.trim();
    if (message && currentRoom) {
        socket.emit('chat-message', currentRoom, message);
        messageInput.value = '';
    }
}

// Socket events
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