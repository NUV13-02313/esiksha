const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Load environment variables
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());


// Debug: Check if environment variables are loaded
console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Loaded' : 'NOT LOADED');
console.log('Port:', process.env.PORT || 5000);

// MongoDB Connection
if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI is not defined in .env file');
    process.exit(1);
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
    console.log('✅ MongoDB Connected Successfully');
    console.log(`Connected to database: ${mongoose.connection.name}`);
})
.catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.log('Please check:');
    console.log('1. Your MongoDB Atlas connection string');
    console.log('2. IP address is whitelisted in MongoDB Atlas');
    console.log('3. Database user has correct permissions');
    process.exit(1);
});

// User Schema
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Test endpoint to check if server is running
app.get('/api/test', (req, res) => {
    const dbStatus = mongoose.connection.readyState;
    let statusText = 'Unknown';
    switch(dbStatus) {
        case 0: statusText = 'Disconnected'; break;
        case 1: statusText = 'Connected'; break;
        case 2: statusText = 'Connecting'; break;
        case 3: statusText = 'Disconnecting'; break;
    }
    
    res.json({ 
        message: 'Backend server is running!',
        database: statusText,
        mongodbUri: process.env.MONGODB_URI ? 'Configured' : 'Missing',
        time: new Date().toISOString()
    });
});

// Test MongoDB query
app.get('/api/test-db', async (req, res) => {
    try {
        const count = await User.countDocuments();
        res.json({
            success: true,
            message: 'Database test successful',
            userCount: count,
            database: mongoose.connection.name
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Database test failed',
            error: error.message
        });
    }
});

// Registration Endpoint
app.post('/api/register', async (req, res) => {
    try {
        console.log('Registration request received:', req.body.email);
        
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
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false,
                message: 'User already exists with this email' 
            });
        }

        // Create new user
        const newUser = new User({
            fullName,
            email,
            password
        });

        await newUser.save();
        console.log('User created:', newUser.email);

        res.status(201).json({
            success: true,
            message: 'Registration successful!',
            user: {
                id: newUser._id,
                fullName: newUser.fullName,
                email: newUser.email
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        
        // Handle duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({ 
                success: false,
                message: 'Email already registered' 
            });
        }
        
        res.status(500).json({ 
            success: false,
            message: 'Server error during registration',
            error: error.message
        });
    }
});

// Login Endpoint
app.post('/api/login', async (req, res) => {
    try {
        console.log('Login request for:', req.body.email);
        
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                message: 'Email and password are required' 
            });
        }

        // Find user
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(401).json({ 
                success: false,
                message: 'Invalid email or password' 
            });
        }

        // Compare passwords
        if (user.password !== password) {
            return res.status(401).json({ 
                success: false,
                message: 'Invalid email or password' 
            });
        }

        res.json({
            success: true,
            message: 'Login successful!',
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error during login',
            error: error.message
        });
    }
});

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

// Health check endpoint
app.get('/api/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState;
    const isConnected = dbStatus === 1;
    
    res.json({
        status: isConnected ? 'Healthy' : 'Unhealthy',
        database: isConnected ? 'Connected' : 'Disconnected',
        databaseStatus: dbStatus,
        serverTime: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// 404 handler - FIXED: Use proper wildcard syntax
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        requestedUrl: req.originalUrl,
        availableEndpoints: [
            'GET /api/test',
            'GET /api/test-db',
            'GET /api/health',
            'POST /api/register',
            'POST /api/login',
            'GET /api/users'
        ]
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}`);
    console.log(`🔗 Test endpoints:`);
    console.log(`   http://localhost:${PORT}/api/test`);
    console.log(`   http://localhost:${PORT}/api/test-db`);
    console.log(`   http://localhost:${PORT}/api/health`);
});