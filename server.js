const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const QRCode = require('qrcode');
const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Constants
const HOST_COLOR = '#1877f2';  // Facebook blue for host
const GUEST_COLORS = [
    '#FF6B6B', // Coral Red
    '#4ECDC4', // Turquoise
    '#96CEB4', // Sage Green
    '#D4A5A5', // Dusty Rose
    '#9B59B6', // Purple
    '#E67E22', // Orange
    '#27AE60', // Green
    '#F1C40F', // Yellow
    '#E74C3C', // Red
    '#16A085', // Teal
    '#3F5C78', // Bright Blue
    '#8E44AD', // Violet
    '#F39C12'  // Dark Orange
];

// Store rooms
const rooms = new Map();

// Generate random room number (6 digits)
function generateRoomNumber() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Function to generate a random color for guests
function generateColor() {
    return GUEST_COLORS[Math.floor(Math.random() * GUEST_COLORS.length)];
}

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
                hostName: hostName  // Store the host name
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
            colors: new Map()
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

    socket.on('join-room', (roomId, isHost, storedName, storedColor) => {
        console.log('User joining room:', roomId, 'as host:', isHost);
        
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
                colors: new Map()
            };
            rooms.set(roomId, room);
        }
        
        // Set username and color based on host/guest status
        if (isHost) {
            // If this is the original host, let them rejoin as host
            const isOriginalHost = storedName === room.hostName;
            if (room.hostId === null || isOriginalHost) {
                username = storedName || 'Host';
                userColor = HOST_COLOR;  // Always blue for host
                room.hostId = socket.id;
                room.hostName = username;
            } else {
                // If someone else is host, join as guest
                username = storedName || `Guest ${room.guestCount + 1}`;
                userColor = storedColor;
                room.guestCount++;
            }
        } else {
            // Guest color handling
            username = storedName || `Guest ${room.guestCount + 1}`;
            userColor = storedColor || generateColor();
            room.guestCount++;
        }

        // Join the room
        socket.join(roomId);
        currentRoom = roomId;
        
        // Store user info
        room.colors.set(socket.id, userColor);
        
        console.log('Emitting username-assigned:', { username, color: userColor, isHost });
        
        // Send username and color to the client
        socket.emit('username-assigned', {
            username: username,
            color: userColor,
            isHost: isHost
        });

        // Notify others
        socket.to(roomId).emit('user-joined', {
            username: username,
            color: userColor,
            isHost: isHost
        });

        // Send recent messages
        const recentMessages = room.messages.slice(-50);
        socket.emit('recent-messages', recentMessages);
    });

    socket.on('set-username', (roomId, requestedUsername) => {
        if (roomId && rooms.get(roomId)) {
            const room = rooms.get(roomId);
            username = requestedUsername;
            userColor = room.colors.get(socket.id);
            room.users.set(socket.id, { username, color: userColor });
            
            // Update user list for all clients in the room
            io.to(roomId).emit('user-list-update', Array.from(room.users.values()));
        }
    });

    socket.on('chat-message', (message) => {
        if (!currentRoom) return;
        
        const room = rooms.get(currentRoom);
        if (!room) return;
        
        const messageData = {
            username: username,
            message: message,
            color: userColor,
            timestamp: new Date().toISOString()
        };
        
        // Store message
        room.messages.push(messageData);
        if (room.messages.length > 100) {
            room.messages.shift();
        }
        
        // Broadcast to room
        io.to(currentRoom).emit('chat-message', messageData);
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        if (currentRoom) {
            const room = rooms.get(currentRoom);
            if (room && room.users.has(socket.id)) {
                const user = room.users.get(socket.id);
                
                // If disconnecting user was host, clear host ID
                if (room.hostId === socket.id) {
                    room.hostId = null;
                }
                
                room.users.delete(socket.id);
                room.colors.delete(socket.id);
                
                if (user) {
                    socket.to(currentRoom).emit('user-left', { 
                        username: user.username, 
                        color: user.color 
                    });
                }
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
