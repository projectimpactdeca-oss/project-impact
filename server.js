const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing.html'));
});

app.get('/user', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// In-memory storage
const users = {};        // socketId -> { id, name, messages: [] }
const adminSockets = new Set();

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Identify as user (fellow)
  socket.on('register-user', (userName) => {
    const name = userName || `Fellow-${Math.floor(Math.random() * 1000)}`;
    users[socket.id] = {
      id: socket.id,
      name: name,
      messages: []
    };
    // Notify admin about new user
    io.to('admin').emit('user-list', getUsersList());
    console.log(`User registered: ${name} (${socket.id})`);
  });

  // Identify as admin (coach)
  socket.on('register-admin', () => {
    adminSockets.add(socket.id);
    socket.join('admin');
    socket.emit('user-list', getUsersList());
    console.log('Admin connected:', socket.id);
  });

  // User sends a message to admin
  socket.on('user-message', (text) => {
    const user = users[socket.id];
    if (!user) return;
    const msg = {
      from: 'user',
      text: text,
      timestamp: Date.now(),
      userId: socket.id,
      userName: user.name
    };
    user.messages.push(msg);
    // Send to admin room
    io.to('admin').emit('new-message', msg);
  });

  // Admin sends a message to a specific user
  socket.on('admin-message', ({ userId, text }) => {
    const userSocket = io.sockets.sockets.get(userId);
    if (!userSocket) return;
    const msg = {
      from: 'admin',
      text: text,
      timestamp: Date.now(),
      userId: userId
    };
    if (users[userId]) {
      users[userId].messages.push(msg);
    }
    // Send to that user only
    userSocket.emit('admin-message', msg);
    // Also echo to admin's own chat window for consistency
    socket.emit('message-sent', msg);
  });

  // Admin requests chat history for a user
  socket.on('get-history', (userId) => {
    const user = users[userId];
    if (user) {
      socket.emit('chat-history', { userId, messages: user.messages });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (users[socket.id]) {
      delete users[socket.id];
      io.to('admin').emit('user-list', getUsersList());
    }
    if (adminSockets.has(socket.id)) {
      adminSockets.delete(socket.id);
    }
    console.log('Disconnected:', socket.id);
  });
});

function getUsersList() {
  return Object.values(users).map(u => ({ id: u.id, name: u.name }));
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
