const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the HTML, CSS, and JS files from the 'public' folder
app.use(express.static('public'));

// Store active users in memory
const activeUsers = {}; 

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // 1. User registers when they load the index.html page
    socket.on('register-user', (userData) => {
        activeUsers[socket.id] = userData;
        io.emit('update-users', activeUsers); // Update Admin dashboard
    });

    // 2. User sends a message to the Coach
    socket.on('user-message', (msg) => {
        io.emit('receive-user-message', {
            id: socket.id,
            name: activeUsers[socket.id]?.name || 'Unknown Fellow',
            msg: msg
        });
    });

    // 3. Coach sends a message to a specific User
    socket.on('admin-message', (data) => {
        io.to(data.userId).emit('coach-message', data.msg);
    });

    // Handle Disconnects
    socket.on('disconnect', () => {
        console.log('Disconnected:', socket.id);
        delete activeUsers[socket.id];
        io.emit('update-users', activeUsers);
    });
});

// Render provides the PORT dynamically. Default to 3000 for local testing.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
