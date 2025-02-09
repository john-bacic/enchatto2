const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
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
app.use(express.json());

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

// Function to create a new room
function createRoom(roomId) {
    return {
        hostId: null,
        hostName: null,
        guestCount: 0,
        messages: [],
        users: new Map(),
        colors: new Map()
    };
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
        room = createRoom(roomId);
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
        console.log(`Socket ${socket.id} joining room ${roomId} as ${isHost ? 'host' : 'guest'}`);
        
        // Leave current room if any
        if (currentRoom) {
            socket.leave(currentRoom);
        }

        // Get or create room
        let room = rooms.get(roomId);
        if (!room) {
            room = createRoom(roomId);
            rooms.set(roomId, room);
            console.log(`Created new room ${roomId}`);
        }

        // Set username and color
        if (isHost) {
            username = storedName || 'Host';
            userColor = HOST_COLOR;  // Always blue for host
            room.hostId = socket.id;
            room.hostName = username;
            console.log('Host joined:', username, 'with color:', userColor);
        } else {
            username = storedName || `Guest ${room.guestCount + 1}`;
            userColor = storedColor || generateColor();
            room.guestCount++;
            console.log('Guest joined:', username, 'with color:', userColor);
        }

        // Join room and store user data
        socket.join(roomId);
        currentRoom = roomId;
        room.users.set(socket.id, { username, color: userColor });
        room.colors.set(socket.id, userColor);

        // Send user info to client
        socket.emit('username-assigned', {
            username,
            color: userColor,
            isHost
        });

        // Send recent messages
        console.log(`Sending ${room.messages.length} recent messages to ${username} in room ${roomId}`);
        socket.emit('recent-messages', room.messages);

        // Broadcast to others
        socket.to(roomId).emit('user-joined', {
            username,
            color: userColor,
            isHost
        });
    });

    // Handle chat messages
    socket.on('chat-message', (message) => {
        if (!currentRoom || !username) {
            console.log(`Message rejected from ${socket.id}: no room or username`);
            return;
        }

        const room = rooms.get(currentRoom);
        if (!room) {
            console.log(`Message rejected from ${socket.id}: room ${currentRoom} not found`);
            return;
        }

        const messageData = {
            username,
            message: message,
            color: userColor,
            timestamp: new Date().toISOString()
        };

        console.log(`Broadcasting message in room ${currentRoom} from ${username}:`, messageData);

        // Store message in room history
        room.messages.push(messageData);
        if (room.messages.length > 100) {
            room.messages.shift();
        }

        // Broadcast to everyone in the room
        io.to(currentRoom).emit('chat-message', messageData);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Socket ${socket.id} disconnected`);
        if (currentRoom) {
            const room = rooms.get(currentRoom);
            if (room) {
                if (room.hostId === socket.id) {
                    room.hostId = null;
                    room.hostName = null;
                    console.log(`Host left room ${currentRoom}`);
                }
                room.users.delete(socket.id);
                room.colors.delete(socket.id);
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
