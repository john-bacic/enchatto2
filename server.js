const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 30000,
    pingInterval: 25000,
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

// Function to convert Japanese text to romanji using OpenAI
async function toRomanji(text) {
    try {
        console.log('Converting to romanji:', text);
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a Japanese language expert. Convert the Japanese text to romanji. Only respond with the romanji, nothing else."
                },
                {
                    role: "user",
                    content: text
                }
            ],
            temperature: 0,
            max_tokens: 100
        });

        const romanji = completion.choices[0].message.content.trim();
        console.log('Romanji conversion result:', romanji);
        return romanji;
    } catch (error) {
        console.error('Error converting to romanji:', error);
        return null;
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

    // Handle ping
    socket.on('ping', () => {
        socket.emit('pong');
    });

    socket.on('join-room', (roomId, isHost, storedName, storedColor) => {
        console.log('User joining room:', roomId, 'as host:', isHost, 'with stored name:', storedName, 'color:', storedColor);
        
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
        
        // Reset user state before joining new room
        username = null;
        userColor = null;
        
        // Set new username based on host/guest status
        if (isHost) {
            // If this is the original host (based on stored name), let them rejoin as host
            const isOriginalHost = storedName === room.hostName;
            if (room.hostId === null || isOriginalHost) {
                username = storedName || 'Host';
                userColor = HOST_COLOR;
                room.hostId = socket.id;
                room.hostName = storedName; // Store host name for future checks
            } else {
                // If someone else is host, join as guest
                username = storedName || `Guest ${room.guestCount + 1}`;
                userColor = storedColor || generateColor();
                room.guestCount++;
            }
        } else {
            username = storedName || `Guest ${room.guestCount + 1}`;
            userColor = storedColor || generateColor();
            room.guestCount++;
        }

        // Join the room
        socket.join(roomId);
        currentRoom = roomId;

        // Send username and color to the client
        socket.emit('username-assigned', {
            username,
            color: userColor,
            isHost: username === room.hostName // Tell client if they're the host
        });

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

            console.log('\n=== Translation Process START ===');
            console.log('Original message:', message);
            console.log('Detected language:', detectedLang);

            try {
                // Translate if the message is in English or Japanese
                if (detectedLang === 'en' || detectedLang === 'ja') {
                    console.log('\n=== Translation Flow ===');
                    console.log('1. Input:', message);
                    console.log('2. Detected Language:', detectedLang);
                    
                    const targetLang = detectedLang === 'en' ? 'ja' : 'en';
                    console.log('3. Target Language:', targetLang);
                    
                    // Get the translation
                    translations.translated = await translateText(message, targetLang);
                    translations.targetLang = targetLang;
                    console.log('4. Translation:', translations.translated);

                    // Always generate romanji for Japanese text
                    if (detectedLang === 'ja') {
                        // If original is Japanese, generate romanji from original
                        console.log('5a. Generating romanji from ORIGINAL Japanese text');
                        translations.romanji = await toRomanji(message);
                        console.log('   Original text:', message);
                        console.log('   Generated romanji:', translations.romanji);
                    } else if (targetLang === 'ja' && translations.translated) {
                        // If translation is Japanese, generate romanji from translation
                        console.log('5b. Generating romanji from Japanese TRANSLATION');
                        translations.romanji = await toRomanji(translations.translated);
                        console.log('   Translation text:', translations.translated);
                        console.log('   Generated romanji:', translations.romanji);
                    } else if (detectedLang === 'en') {
                        // For English messages, include a romanji placeholder
                        console.log('5c. Adding romanji placeholder for English text');
                        translations.romanji = '(romanji)';
                        console.log('   Added placeholder romanji');
                    }
                    
                    console.log('6. Final translations object:', translations);
                    console.log('=== End Translation Flow ===\n');
                }

                // Log the final state
                console.log('\nFinal translation state:');
                console.log('- Original:', translations.original);
                console.log('- Source Lang:', translations.sourceLang);
                console.log('- Translation:', translations.translated);
                console.log('- Target Lang:', translations.targetLang);
                console.log('- Romanji:', translations.romanji);

                // Emit the message with translations
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

                console.log('\n=== Emitting Message Data ===');
                console.log('Message:', messageData.message);
                console.log('Translation:', messageData.translation);
                console.log('Romanji:', messageData.romanji);
                console.log('Source Lang:', messageData.sourceLang);
                console.log('Target Lang:', messageData.targetLang);
                console.log('============================\n');

                io.to(roomId).emit('chat-message', messageData);
                console.log('=== Translation Process COMPLETE ===\n');
            } catch (error) {
                console.error('Error during translation:', error);
                socket.emit('error', 'Translation failed');
            }

            // Add message to room history
            room.messages.push(messageData);

            // Trim message history if needed
            if (room.messages.length > 100) {
                room.messages = room.messages.slice(-100);
            }

            // Broadcast message to all users in the room
            // io.to(roomId).emit('chat-message', messageData);
            console.log('=== Message Processing Complete ===\n');
        } catch (error) {
            console.error('Error processing message:', error);
        }
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