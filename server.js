const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY; // Must be set in Render env

// Serve static files
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
const users = {};        // socketId -> { id, name, messages: [], aiMessages: [] }
const adminSockets = new Set();

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Identify as user (fellow)
  socket.on('register-user', (userName) => {
    const name = userName || `Fellow-${Math.floor(Math.random() * 1000)}`;
    users[socket.id] = {
      id: socket.id,
      name: name,
      messages: [],       // coach chat
      aiMessages: []      // AI chat history
    };
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

  // User sends a message to admin (coach)
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
    userSocket.emit('admin-message', msg);
    socket.emit('message-sent', msg);
  });

  // Admin requests coach chat history for a user
  socket.on('get-history', (userId) => {
    const user = users[userId];
    if (user) {
      socket.emit('chat-history', { userId, messages: user.messages });
    }
  });

  // ----- AI Assistant (via OpenRouter) -----
  socket.on('user-ai-message', async (text) => {
    const user = users[socket.id];
    if (!user) return;

    // Store user's question
    const userMsg = {
      role: 'user',
      text: text,
      timestamp: Date.now()
    };
    user.aiMessages.push(userMsg);

    try {
      const reply = await callOpenRouterAPI(text, user.aiMessages);
      const aiMsg = {
        role: 'assistant',
        text: reply,
        timestamp: Date.now()
      };
      user.aiMessages.push(aiMsg);
      socket.emit('ai-response', aiMsg);
    } catch (error) {
      console.error('=== OpenRouter API Error ===');
      console.error('Message:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
      } else if (error.request) {
        console.error('No response received:', error.request);
      } else {
        console.error('Error details:', error);
      }
      socket.emit('ai-response', {
        role: 'assistant',
        text: 'Sorry, I encountered an error. Please try again later.',
        timestamp: Date.now()
      });
    }
  });

  // User requests AI chat history
  socket.on('get-ai-history', () => {
    const user = users[socket.id];
    if (user) {
      socket.emit('ai-history', user.aiMessages);
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

// Helper: return list of active users for admin
function getUsersList() {
  return Object.values(users).map(u => ({ id: u.id, name: u.name }));
}

// Call OpenRouter API (Gemma 3 12B free model)
async function callOpenRouterAPI(userMessage, history) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not set in environment');
  }

  // Format conversation for OpenRouter
  const messages = history.map(msg => ({
    role: msg.role,
    content: msg.text
  }));

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'google/gemma-3-12b-it',  // free model
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
    },
    {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        // Required by OpenRouter: identify your app
        'HTTP-Referer': 'https://your-app-name.onrender.com', // replace with your actual URL
        'X-Title': 'Project IMPACT' // your app name
      }
    }
  );

  return response.data.choices[0].message.content;
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
