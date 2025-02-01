# Mobile Chat App

A real-time mobile chat application that allows users to create chat rooms and join them by scanning QR codes.

## Features

- Create chat rooms with unique QR codes
- Join rooms by scanning QR codes
- Real-time messaging using Socket.IO
- Mobile-friendly responsive design
- User presence tracking
- Message timestamps
- Clean and modern UI

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Create a Room:
   - Click "Create Room"
   - A QR code will be generated
   - Share this QR code with others to join

2. Join a Room:
   - Scan the QR code using your mobile device
   - Enter your username
   - Start chatting!

## Technologies Used

- Node.js
- Express
- Socket.IO
- QRCode.js
