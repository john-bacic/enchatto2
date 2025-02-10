const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 20000,
    pingInterval: 20000,
    transports: ['websocket', 'polling']
});
const path = require('path');
const QRCode = require('qrcode');
const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store rooms
const rooms = new Map();

// Generate random room number (6 digits)
function generateRoomNumber() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate random color
function generateColor() {
    // List of pleasant, distinct colors for guests
    const colors = [
        '#FF6B6B', // Coral Red
        '#4ECDC4', // Turquoise
        '#96CEB4', // Sage Green
        '#FFEEAD', // Cream Yellow
        '#D4A5A5', // Dusty Rose
        '#9B59B6', // Purple
        '#E67E22', // Orange
        '#27AE60', // Green
        '#F1C40F', // Yellow
        '#E74C3C', // Red
        '#16A085', // Teal
        '#3F5C78', // bright blue
        '#8E44AD', // Violet
        '#F39C12'  // Dark Orange
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Host color is always this blue
const HOST_COLOR = '#1877f2';

// Root route - host page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Host route
app.get('/room', (req, res) => {
    const roomNumber = generateRoomNumber();
    console.log('Creating new room:', roomNumber);
    res.redirect(`/room/${roomNumber}?host=true`);
});

// Room route
app.get('/room/:roomId', async (req, res) => {
    const roomId = req.params.roomId;
    const isHost = req.query.host === 'true';
    const hostName = req.query.hostName || 'Host';  // Default to 'Host' if no name provided
    
    // Validate room ID (6 digits)
    if (!roomId.match(/^\d{6}$/)) {
        console.log('Invalid room number format:', roomId);
        res.redirect('/room');
        return;
    }
    
    console.log('Room request:', roomId, 'Host:', isHost, 'Host Name:', hostName);
    
    try {
        // Create room if it doesn't exist
        if (!rooms.has(roomId)) {
            const protocol = req.get('x-forwarded-proto') || req.protocol;
            const roomUrl = `${protocol}://${req.get('host')}/room/${roomId}`;
            console.log('Generating QR code for URL:', roomUrl);
            
            const qrCode = await QRCode.toDataURL(roomUrl, {
                width: 300,
                margin: 2,
                errorCorrectionLevel: 'H',
                color: {
                    dark: '#1877f2',
                    light: '#ffffff'
                }
            });
            
            console.log('QR code generated successfully');
            rooms.set(roomId, {
                qrCode,
                users: new Map(),
                messages: [],
                guestCount: 0,
                colors: new Map(),
                hostId: null,  // Track the host's socket ID
                hostName: hostName,  // Store the host name
                disconnectedUsers: new Map() // Store data for disconnected users
            });
        }
        
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
        
    } catch (error) {
        console.error('Error in room route:', error);
        res.status(500).send('Internal server error');
    }
});

// API route for room info
app.get('/api/room/:roomId', async (req, res) => {
    const roomId = req.params.roomId;
    const isHost = req.query.host === 'true';
    
    // Get or create room
    let room = rooms.get(roomId);
    if (!room) {
        if (!isHost) {
            return res.status(404).json({ error: 'Room not found' });
        }
        // Create new room if host is joining
        room = {
            hostId: null,
            hostName: null,
            guestCount: 0,
            messages: [],
            users: new Map(),
            colors: new Map(),
            disconnectedUsers: new Map() // Store data for disconnected users
        };
        rooms.set(roomId, room);

        // Generate QR code for the room
        const roomUrl = `${req.protocol}://${req.get('host')}/room/${roomId}`;
        try {
            const qrCode = await QRCode.toDataURL(roomUrl, {
                errorCorrectionLevel: 'H',
                margin: 1,
                width: 200
            });
            room.qrCode = qrCode;
        } catch (error) {
            console.error('Error generating QR code:', error);
        }
    }
    
    res.json({ 
        success: true,
        qrCode: room.qrCode
    });
});

// Function to detect language
async function detectLanguage(text) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a language detector. Respond with 'en' for English, 'ja' for Japanese, or 'other' for other languages. Only respond with these exact values."
                },
                {
                    role: "user",
                    content: text
                }
            ],
            max_tokens: 5
        });
        return response.choices[0].message.content.trim().toLowerCase();
    } catch (error) {
        console.error('Language detection error:', error);
        return 'other';
    }
}

// Translation cache
const translationCache = new Map();

// Function to get cache key
function getTranslationCacheKey(text, targetLang) {
    return `${text}:${targetLang}`;
}

// Function to translate text
async function translateText(text, targetLang) {
    const cacheKey = getTranslationCacheKey(text, targetLang);
    
    // Check cache first
    if (translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey);
    }

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
                {
                    role: "system",
                    content: `You are a translator. Translate the text to ${targetLang === 'ja' ? 'Japanese' : 'English'}. Preserve the tone and meaning. Only respond with the translation, nothing else.`
                },
                {
                    role: "user",
                    content: text
                }
            ]
        });
        const translation = response.choices[0].message.content.trim();
        
        // Store in cache
        translationCache.set(cacheKey, translation);
        
        return translation;
    } catch (error) {
        console.error('Translation error:', error);
        return text;
    }
}

// Socket.IO events
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    let currentRoom = null;
    let username = null;
    let userColor = null;

    // Handle ping for connection health check
    socket.on('ping', () => {
        socket.emit('pong');
    });

    // Handle explicit rejoin attempts
    socket.on('rejoin-room', (data) => {
        console.log('User attempting to rejoin room:', data);
        const { room, username: requestedUsername } = data;
        
        // Validate room exists
        const roomData = rooms.get(room);
        if (!roomData) {
            socket.emit('error', 'Room no longer exists');
            return;
        }

        // Restore user data if possible
        const previousUser = Array.from(roomData.users.values())
            .find(u => u.username === requestedUsername);

        username = requestedUsername;
        userColor = previousUser ? previousUser.color : generateColor();
        currentRoom = room;

        // Join room
        socket.join(room);
        roomData.users.set(socket.id, { username, color: userColor });

        // Send confirmation and recent messages
        socket.emit('room-joined', room, {
            username,
            color: userColor,
            isHost: roomData.hostId === socket.id
        });

        // Send recent messages
        const recentMessages = roomData.messages.slice(-50);
        socket.emit('recent-messages', recentMessages);

        // Notify others
        socket.to(room).emit('user-joined', {
            username,
            color: userColor,
            isHost: roomData.hostId === socket.id
        });

        console.log(`User ${username} successfully rejoined room ${room}`);
    });

    socket.on('join-room', (roomId, isHost, storedName, storedColor) => {
        console.log('User joining room:', roomId, 'as host:', isHost, 'with stored name:', storedName);
        
        // Leave current room if any
        if (currentRoom) {
            leaveCurrentRoom();
        }
        
        // Get or create room
        let room = rooms.get(roomId);
        if (!room) {
            room = {
                hostId: null,
                hostName: null,
                guestCount: 0,
                messages: [],
                users: new Map(),
                colors: new Map(),
                disconnectedUsers: new Map() // Store data for disconnected users
            };
            rooms.set(roomId, room);
        }
        
        // Check for existing user data
        const existingUser = room.disconnectedUsers.get(storedName);
        if (existingUser) {
            username = storedName;
            userColor = existingUser.color;
            room.disconnectedUsers.delete(storedName);
        } else {
            username = storedName || (isHost ? 'Host' : `Guest ${room.guestCount + 1}`);
            userColor = storedColor || (isHost ? HOST_COLOR : generateColor());
        }

        // Update room data
        if (isHost && !room.hostId) {
            room.hostId = socket.id;
            room.hostName = username;
        } else {
            room.guestCount++;
        }

        // Join room and store user data
        socket.join(roomId);
        currentRoom = roomId;
        room.users.set(socket.id, { username, color: userColor });

        // Send confirmation
        socket.emit('room-joined', roomId, {
            username,
            color: userColor,
            isHost: room.hostId === socket.id
        });

        // Send recent messages
        socket.emit('recent-messages', room.messages.slice(-50));

        // Notify others
        socket.to(roomId).emit('user-joined', {
            username,
            color: userColor,
            isHost: room.hostId === socket.id
        });
    });

    socket.on('set-username', (roomId, requestedUsername) => {
        if (roomId && rooms.get(roomId)) {
            const room = rooms.get(roomId);
            username = requestedUsername;
            userColor = room.users.get(socket.id)?.color || generateColor();
            room.users.set(socket.id, { username, color: userColor });
            
            // Update user list for all clients in the room
            io.to(roomId).emit('user-list-update', Array.from(room.users.values()));
        }
    });

    // Handle chat messages with acknowledgment
    socket.on('chat-message', (roomId, message, callback) => {
        console.log('Received message:', { roomId, message, from: username });
        
        // Validate room and user
        if (!roomId || !message) {
            console.log('Invalid message data');
            if (callback) callback('Invalid message data');
            return;
        }

        const room = rooms.get(roomId);
        if (!room) {
            console.log('Room not found:', roomId);
            if (callback) callback('Room not found');
            return;
        }

        if (!username) {
            console.log('No username found for socket:', socket.id);
            if (callback) callback('Not properly connected to room');
            return;
        }

        // Create message object
        const messageData = {
            username,
            message,
            color: userColor,
            timestamp: new Date().toISOString()
        };

        // Store in room history
        room.messages.push(messageData);
        if (room.messages.length > 100) {
            room.messages = room.messages.slice(-100);
        }

        // Broadcast to room
        io.to(roomId).emit('chat-message', messageData);

        // Acknowledge successful send
        if (callback) callback(null);
        
        console.log('Message broadcast to room:', roomId);
    });
    
    // Enhanced disconnect handling
    socket.on('disconnect', (reason) => {
        console.log(`User ${socket.id} disconnected:`, reason);
        
        if (currentRoom) {
            const room = rooms.get(currentRoom);
            if (room) {
                // Store disconnected user data for potential reconnection
                if (username) {
                    room.disconnectedUsers.set(username, {
                        color: userColor,
                        lastSeen: new Date(),
                        isHost: room.hostId === socket.id
                    });
                }

                // Clear host if needed
                if (room.hostId === socket.id) {
                    room.hostId = null;
                }

                // Remove from active users
                room.users.delete(socket.id);

                // Notify others
                socket.to(currentRoom).emit('user-left', {
                    username,
                    color: userColor
                });

                // Clean up room if empty
                if (room.users.size === 0) {
                    // Keep room data for a while in case of reconnection
                    setTimeout(() => {
                        if (room.users.size === 0) {
                            rooms.delete(currentRoom);
                            console.log(`Room ${currentRoom} cleaned up due to inactivity`);
                        }
                    }, 300000); // 5 minutes
                }
            }
        }
    });

    function leaveCurrentRoom() {
        if (currentRoom) {
            const room = rooms.get(currentRoom);
            if (room) {
                // Remove from active users
                room.users.delete(socket.id);

                // Notify others
                socket.to(currentRoom).emit('user-left', {
                    username,
                    color: userColor
                });

                // Clean up room if empty
                if (room.users.size === 0) {
                    // Keep room data for a while in case of reconnection
                    setTimeout(() => {
                        if (room.users.size === 0) {
                            rooms.delete(currentRoom);
                            console.log(`Room ${currentRoom} cleaned up due to inactivity`);
                        }
                    }, 300000); // 5 minutes
                }
            }
            currentRoom = null;
        }
    }
});

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});