const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();

// ========== MIDDLEWARE SETUP ==========
// 1. CORS - MUST BE FIRST
app.use(cors({
  origin: [
    'https://e-siksha.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// 2. Handle preflight requests
app.options('*', cors());

// 3. Body parsers with limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 10000 
}));

// 4. Request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// ========== DATABASE CONNECTION ==========
console.log('🔍 Checking environment...');
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('PORT:', process.env.PORT || 5000);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'NOT SET!');

if (!process.env.MONGODB_URI) {
  console.error('❌ ERROR: MONGODB_URI is not defined in environment variables');
  console.log('Please add MONGODB_URI to your Render environment variables');
}

// MongoDB connection with retry logic
const connectDB = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    };

    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/esiksha', options);
    
    console.log('✅ MongoDB Connected Successfully');
    console.log(`   Database: ${mongoose.connection.name}`);
    console.log(`   Host: ${mongoose.connection.host}`);
    console.log(`   Port: ${mongoose.connection.port}`);
    console.log(`   State: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
    
  } catch (error) {
    console.error('❌ MongoDB Connection Failed:', error.message);
    console.log('💡 Troubleshooting tips:');
    console.log('1. Check MONGODB_URI in Render environment variables');
    console.log('2. Ensure IP is whitelisted in MongoDB Atlas');
    console.log('3. Check MongoDB Atlas cluster is running');
    console.log('4. Verify database user credentials');
    
    // Don't exit in production - allow server to start without DB
    if (process.env.NODE_ENV === 'production') {
      console.log('⚠️ Running in production mode without database connection');
    } else {
      console.log('🔄 Retrying connection in 5 seconds...');
      setTimeout(connectDB, 5000);
    }
  }
};

connectDB();

// ========== DATABASE STATUS MIDDLEWARE ==========
app.use((req, res, next) => {
  const dbStatus = mongoose.connection.readyState;
  if (dbStatus !== 1) {
    console.warn(`⚠️ Database connection issue. State: ${dbStatus}`);
    
    // Allow GET requests but block POST/PUT/DELETE
    if (req.method !== 'GET') {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable. Please try again.',
        databaseStatus: getDBStatusText(dbStatus)
      });
    }
  }
  next();
});

function getDBStatusText(status) {
  switch(status) {
    case 0: return 'disconnected';
    case 1: return 'connected';
    case 2: return 'connecting';
    case 3: return 'disconnecting';
    default: return 'unknown';
  }
}

// ========== USER SCHEMA ==========
const userSchema = new mongoose.Schema({
  fullName: { 
    type: String, 
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters']
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: { 
    type: String, 
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  lastLogin: { 
    type: Date 
  }
});

const User = mongoose.model('User', userSchema);

// ========== TEST ENDPOINTS ==========
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '✅ Backend server is running!',
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET  /api/test',
      'GET  /api/health',
      'GET  /api/test-db',
      'POST /api/register',
      'POST /api/login',
      'GET  /api/users (dev only)'
    ]
  });
});

app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const isConnected = dbStatus === 1;
  
  res.json({
    status: isConnected ? 'Healthy' : 'Unhealthy',
    service: 'E-Siksha Backend API',
    version: '1.0.0',
    database: {
      status: getDBStatusText(dbStatus),
      connected: isConnected,
      host: isConnected ? mongoose.connection.host : null,
      name: isConnected ? mongoose.connection.name : null
    },
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/test-db', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    res.json({
      success: true,
      message: 'Database test successful',
      userCount,
      database: mongoose.connection.name,
      sampleData: userCount > 0 ? 'Data exists' : 'No users yet'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database test failed',
      error: error.message,
      databaseStatus: getDBStatusText(mongoose.connection.readyState)
    });
  }
});

// ========== REGISTRATION ENDPOINT ==========
app.post('/api/register', async (req, res) => {
  try {
    console.log('📝 Registration attempt received');
    console.log('Request body:', JSON.stringify(req.body));
    
    const { fullName, email, password, confirmPassword } = req.body;

    // Validation
    if (!fullName || !email || !password || !confirmPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required' 
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Passwords do not match' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 6 characters' 
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists with this email' 
      });
    }

    // Create new user
    const newUser = new User({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: password
    });

    await newUser.save();
    console.log('✅ User created:', newUser.email);

    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        createdAt: newUser.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false,
        message: 'Email already registered' 
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========== LOGIN ENDPOINT ==========
app.post('/api/login', async (req, res) => {
  try {
    console.log('🔐 Login attempt for:', req.body.email);
    
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log('Login failed: User not found');
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Compare passwords (plain text for now - in production use bcrypt)
    if (user.password !== password) {
      console.log('Login failed: Password mismatch');
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    console.log('✅ Login successful for:', user.email);

    res.json({
      success: true,
      message: 'Login successful!',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========== DEVELOPMENT ONLY ENDPOINTS ==========
if (process.env.NODE_ENV !== 'production') {
  // Get all users (for testing only)
  app.get('/api/users', async (req, res) => {
    try {
      const users = await User.find({}, '-password');
      res.json({
        success: true,
        count: users.length,
        users
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching users'
      });
    }
  });

  // Clear all users (for testing only)
  app.delete('/api/users/clear', async (req, res) => {
    try {
      await User.deleteMany({});
      res.json({
        success: true,
        message: 'All users deleted'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error clearing users'
      });
    }
  });
}

// ========== 404 HANDLER ==========
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    requestedUrl: req.originalUrl,
    availableEndpoints: [
      'GET    /api/test',
      'GET    /api/health',
      'GET    /api/test-db',
      'POST   /api/register',
      'POST   /api/login',
      'GET    /api/users (dev only)'
    ]
  });
});

// ========== ERROR HANDLER ==========
app.use((err, req, res, next) => {
  console.error('🔥 Server error:', err);
  console.error('Error stack:', err.stack);
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? {
      message: err.message,
      stack: err.stack
    } : undefined
  });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`
  🚀 Server started successfully!
  =================================
  🔗 Local: http://localhost:${PORT}
  🌐 Environment: ${process.env.NODE_ENV || 'development'}
  📅 Started: ${new Date().toISOString()}
  💾 Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}
  
  📍 Test endpoints:
     http://localhost:${PORT}/api/test
     http://localhost:${PORT}/api/health
     http://localhost:${PORT}/api/test-db
  =================================
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;