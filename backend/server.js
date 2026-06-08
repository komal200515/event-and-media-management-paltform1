const express     = require('express');
const mongoose    = require('mongoose');
const cors        = require('cors');
const helmet      = require('helmet');
const compression = require('compression');
const morgan      = require('morgan');
const rateLimit   = require('express-rate-limit');
const { createServer } = require('http');
const { Server }       = require('socket.io');
require('dotenv').config();

const allowedOrigins = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
    'https://event-and-media-management-paltform.vercel.app',
];

const app        = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(morgan('dev'));

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// Rate Limiting
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// Socket.IO
const onlineUsers = new Map();

// ✅ Make io accessible in all route files
app.set('io', io);

// ✅ Socket.IO room system
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Frontend sends: socket.emit('register', userId)
  // Har user apne personal room me join karta hai
  socket.on('register', (userId) => {
    if (userId) {
      socket.join(`user_${userId}`);
      console.log(`✅ User ${userId} joined room user_${userId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

app.set('io', io);
app.set('onlineUsers', onlineUsers);

// Routes
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/events',        require('./routes/events'));
app.use('/api/media',         require('./routes/media'));
app.use('/api/social',        require('./routes/social'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/search',        require('./routes/search'));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running!', time: new Date() });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('❗ Error:', err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});

// Connect DB and Start Server
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/eventmedia')
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 Socket.IO ready`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });