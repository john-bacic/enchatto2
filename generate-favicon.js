const { createCanvas } = require('canvas');
const fs = require('fs');

// Create a 32x32 canvas
const canvas = createCanvas(32, 32);
const ctx = canvas.getContext('2d');

// Draw a chat bubble
ctx.fillStyle = '#68B7CF';
ctx.beginPath();
ctx.moveTo(4, 4);
ctx.lineTo(28, 4);
ctx.quadraticCurveTo(32, 4, 32, 8);
ctx.lineTo(32, 20);
ctx.quadraticCurveTo(32, 24, 28, 24);
ctx.lineTo(12, 24);
ctx.lineTo(8, 30);
ctx.lineTo(8, 24);
ctx.lineTo(4, 24);
ctx.quadraticCurveTo(0, 24, 0, 20);
ctx.lineTo(0, 8);
ctx.quadraticCurveTo(0, 4, 4, 4);
ctx.fill();

// Convert to buffer
const buffer = canvas.toBuffer('image/png');

// Write to file
fs.writeFileSync('public/favicon.ico', buffer);
