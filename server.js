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
        '#2C3E50', // Navy
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
app.get('/api/room/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    const isHost = req.query.host === 'true';
    console.log('API request for room:', roomId, 'Host:', isHost);
    
    // Validate room ID
    if (!roomId.match(/^\d{6}$/)) {
        console.log('Invalid room number format in API request:', roomId);
        res.status(400).json({ error: 'Invalid room number format' });
        return;
    }
    
    const room = rooms.get(roomId);
    if (!room) {
        console.log('Room not found:', roomId);
        res.status(404).json({ error: 'Room not found' });
        return;
    }
    
    // If someone is trying to be host but there's already a host
    if (isHost && room.hostId !== null) {
        res.status(403).json({ error: 'Room already has a host' });
        return;
    }
    
    console.log('Sending room data');
    res.json({
        roomId,
        qrCode: room.qrCode,
        isHost
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

// Function to translate text
async function translateText(text, targetLang) {
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
        return response.choices[0].message.content.trim();
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
        console.log('User joining room:', roomId, 'as host:', isHost, 'with stored name:', storedName, 'color:', storedColor);
        
        // Leave current room if any
        if (currentRoom) {
            leaveCurrentRoom();
        }
        
        // Get or create room
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        // Check if trying to join as host when room already has one
        if (isHost && room.hostId !== null && room.hostId !== socket.id) {
            socket.emit('error', 'Room already has a host');
            return;
        }
        
        // Reset user state before joining new room
        username = null;
        userColor = null;
        
        // Set new username based on host/guest status
        if (isHost) {
            if (room.hostId === null) {
                username = storedName;
                userColor = HOST_COLOR;
                room.hostId = socket.id;
                room.hostName = storedName;
            } else {
                // If there's already a host, join as guest instead
                if (storedName && storedName !== 'Guest') {
                    username = storedName;
                    userColor = storedColor || generateColor();
                } else {
                    room.guestCount++;
                    username = `Guest ${room.guestCount}`;
                    userColor = generateColor();
                }
                while (Array.from(room.colors.values()).includes(userColor)) {
                    userColor = generateColor();
                }
            }
        } else {
            // For guests, use their stored name and color if available
            if (storedName && storedName !== 'Guest') {
                username = storedName;
                userColor = storedColor || generateColor();
            } else {
                room.guestCount++;
                username = `Guest ${room.guestCount}`;
                userColor = generateColor();
            }
            while (Array.from(room.colors.values()).includes(userColor)) {
                userColor = generateColor();
            }
        }
        
        // Join new room and update room state
        currentRoom = roomId;
        socket.join(roomId);
        room.users.set(socket.id, { username, color: userColor });
        
        // Notify user of their assigned name and color
        socket.emit('username-assigned', { username, color: userColor });
        
        // Notify others
        socket.to(roomId).emit('user-joined', { username, color: userColor });
        
        // Send recent messages
        const recentMessages = room.messages.slice(-50);
        socket.emit('recent-messages', recentMessages);
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

    socket.on('chat-message', async (roomId, message) => {
        if (!currentRoom || !username) return;
        
        const room = rooms.get(roomId);
        if (!room) return;

        // Detect the language of the message
        const detectedLang = await detectLanguage(message);
        
        // Initialize translation object
        const translations = {
            original: message,
            translated: null,
            sourceLang: detectedLang
        };

        // Translate if the message is in English or Japanese
        if (detectedLang === 'en' || detectedLang === 'ja') {
            const targetLang = detectedLang === 'en' ? 'ja' : 'en';
            translations.translated = await translateText(message, targetLang);
        }

        // Add message to room history
        room.messages.push({
            username,
            message: translations.original,
            translation: translations.translated,
            sourceLang: translations.sourceLang,
            color: userColor,
            timestamp: new Date()
        });

        // Trim message history if needed
        if (room.messages.length > 100) {
            room.messages = room.messages.slice(-100);
        }

        // Broadcast message to all users in the room
        io.to(roomId).emit('chat-message', {
            username,
            message: translations.original,
            translation: translations.translated,
            sourceLang: translations.sourceLang,
            color: userColor
        });
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
