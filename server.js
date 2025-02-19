const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    connectTimeout: 45000,
    upgradeTimeout: 30000,
    maxHttpBufferSize: 1e8
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

// Store rooms with enhanced user tracking
const rooms = new Map();

// Store disconnected users with grace period
const disconnectedUsers = new Map();

// Grace period for reconnection (5 minutes)
const GRACE_PERIOD = 5 * 60 * 1000;

// Host color is always this blue
const HOST_COLOR = '#1877f2';

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

// Store user state before disconnect
function storeDisconnectedUser(room, socket) {
    const user = room.users.get(socket.id);
    if (user) {
        const isHost = room.hostId === socket.id;
        const userState = {
            username: user.username,
            color: user.color,
            isHost: isHost,
            roomId: room.roomId,
            disconnectedAt: Date.now()
        };
        disconnectedUsers.set(user.username, userState);
        return userState;
    }
    return null;
}

// Try to restore disconnected user
function restoreUser(username, roomId) {
    const userState = disconnectedUsers.get(username);
    if (userState && 
        userState.roomId === roomId && 
        (Date.now() - userState.disconnectedAt) < GRACE_PERIOD) {
        disconnectedUsers.delete(username);
        return userState;
    }
    return null;
}

// Clean up disconnected users periodically
setInterval(() => {
    const now = Date.now();
    for (const [username, state] of disconnectedUsers.entries()) {
        if (now - state.disconnectedAt > GRACE_PERIOD) {
            disconnectedUsers.delete(username);
        }
    }
}, GRACE_PERIOD);

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
                hostUsername: null,
                roomId: roomId
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
            hostUsername: null,
            guestCount: 0,
            messages: [],
            users: new Map(),
            colors: new Map(),
            roomId: roomId
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

// Function to convert Japanese text to romanji
async function toRomanji(text) {
    try {
        console.log('\n=== Starting Romanji Translation ===');
        console.log('Input text:', text);
        
        if (!process.env.OPENAI_API_KEY) {
            console.error('OpenAI API key is missing!');
            return '';
        }
        
        console.log('Making OpenAI API request...');
        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a Japanese to Romanji translator. Convert the given Japanese text to Romanji using the Hepburn system. Only respond with the romanji, nothing else. Do not include any arrows or other symbols. Example input: こんにちは Example output: konnichiwa"
                },
                {
                    role: "user",
                    content: text
                }
            ],
            temperature: 0.3,
            max_tokens: 100
        });
        
        console.log('OpenAI API response received');
        console.log('Full response:', JSON.stringify(response, null, 2));
        
        const romanji = response.choices[0].message.content.trim();
        console.log('Extracted romanji:', romanji);
        console.log('=== End Romanji Translation ===\n');
        
        return romanji;
    } catch (error) {
        console.error('Error in toRomanji:', error);
        if (error.response) {
            console.error('OpenAI API Error:', error.response.data);
        }
        return '';
    }
}

// Function to convert Japanese text to romanji
// async function toRomanji(text) {
//     try {
//         const response = await openai.chat.completions.create({
//             model: "gpt-3.5-turbo",
//             messages: [
//                 {
//                     role: "system",
//                     content: "You are a Japanese to Romanji translator. Convert the given Japanese text to Romanji. Only respond with the romanji, nothing else."
//                 },
//                 {
//                     role: "user",
//                     content: text
//                 }
//             ],
//             temperature: 0.3,
//             max_tokens: 100
//         });
//         return response.choices[0].message.content.trim();
//     } catch (error) {
//         console.error('Error converting to romanji:', error);
//         return null;
//     }
// }

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

// Test endpoint for OpenAI
app.get('/test-openai', async (req, res) => {
    try {
        console.log('Testing OpenAI connection...');
        const text = 'こんにちは';
        const romanji = await toRomanji(text);
        console.log('Test result:', { text, romanji });
        res.json({ text, romanji });
    } catch (error) {
        console.error('OpenAI test error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Socket.IO events
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    let currentRoom = null;
    let username = null;
    let userColor = null;

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (currentRoom && username) {
            const room = rooms.get(currentRoom);
            if (room) {
                // Notify all users in the room about the disconnection
                io.to(currentRoom).emit('user-left', {
                    username: username
                });
                
                // Remove user from room
                room.users.delete(socket.id);
                
                // Clean up empty rooms
                if (room.users.size === 0) {
                    rooms.delete(currentRoom);
                }
            }
        }
    });

    // Handle room joining
    socket.on('join-room', async (roomId, isHost = false, requestedUsername = null, requestedColor = null) => {
        console.log('User joining room:', roomId);
        
        // Get or create room
        let room = rooms.get(roomId);
        if (!room) {
            room = { 
                users: new Map(), 
                messages: [], 
                hostId: null,
                hostUsername: null 
            };
            rooms.set(roomId, room);
        }

        // Set up user info
        username = requestedUsername || (isHost ? 'Host' : `Guest ${room.users.size + 1}`);
        userColor = isHost ? HOST_COLOR : (requestedColor || generateColor());
        currentRoom = roomId;

        // Update host info if this is the host
        if (isHost) {
            room.hostId = socket.id;
            room.hostUsername = username;
        }

        // Join the room
        socket.join(roomId);
        room.users.set(socket.id, { username, color: userColor, isHost });

        // Notify all users about the new connection
        io.to(roomId).emit('user-joined', {
            username: username
        });

        // Send room info back to the user
        socket.emit('room-joined', {
            roomId,
            username,
            color: userColor,
            isHost,
            hostUsername: room.hostUsername
        });

        // Get list of connected users, ensuring host is included if they exist
        const connectedUsers = Array.from(room.users.values())
            .map(u => u.username);
        
        // Always include host in connected users list if they exist
        if (room.hostUsername && !connectedUsers.includes(room.hostUsername)) {
            connectedUsers.push(room.hostUsername);
        }

        // Send connected users list to everyone
        io.to(roomId).emit('connected-users', connectedUsers);
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

        console.log('\n=== Processing New Message ===');
        console.log('Message:', message);
        console.log('Room:', roomId);
        console.log('Username:', username);

        try {
            // Detect the language of the message
            const detectedLang = await detectLanguage(message);
            console.log('Detected language:', detectedLang);
            
            // Initialize translation object
            const translations = {
                original: message,
                translated: null,
                romanji: null,
                sourceLang: detectedLang,
                targetLang: null
            };

            console.log('\n=== Translation Process ===');
            console.log('Original message:', message);
            console.log('Detected language:', detectedLang);

            // Translate if the message is in English or Japanese
            if (detectedLang === 'en' || detectedLang === 'ja') {
                const targetLang = detectedLang === 'en' ? 'ja' : 'en';
                console.log('Target language:', targetLang);
                
                translations.translated = await translateText(message, targetLang);
                translations.targetLang = targetLang;
                console.log('Translated text:', translations.translated);

                // Get romanji for Japanese text
                if (targetLang === 'ja') {
                    // English to Japanese case
                    console.log('Converting Japanese translation to romanji:', translations.translated);
                    translations.romanji = await toRomanji(translations.translated);
                } else if (detectedLang === 'ja') {
                    // Japanese to English case
                    console.log('Converting original Japanese text to romanji:', message);
                    translations.romanji = await toRomanji(message);
                }
                console.log('Generated romanji:', translations.romanji);
            }

            console.log('Final translations:', JSON.stringify(translations, null, 2));

            // Add message to room history
            const messageData = {
                username: username,
                message: translations.original,
                translation: translations.translated,
                romanji: translations.romanji,
                sourceLang: translations.sourceLang,
                targetLang: translations.targetLang,
                color: userColor,
                timestamp: new Date().toISOString()
            };

            console.log('Emitting message data:', JSON.stringify(messageData, null, 2));

            room.messages.push(messageData);

            // Trim message history if needed
            if (room.messages.length > 100) {
                room.messages = room.messages.slice(-100);
            }

            // Broadcast message to all users in the room
            io.to(roomId).emit('chat-message', messageData);
            console.log('=== Message Processing Complete ===\n');
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});