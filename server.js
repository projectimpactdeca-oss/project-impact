const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve all files in the /public folder
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('A user connected');

    // Relay messages from Client to Coach
    socket.on('clientMessage', (data) => {
        io.emit('clientMessage', data); 
    });

    // Relay messages from Coach to Client
    socket.on('coachMessage', (data) => {
        io.emit('coachMessage', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
