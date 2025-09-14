import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
// 44

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '.env') });
console.log('ASSEMBLYAI_API_KEY:', process.env.ASSEMBLYAI_API_KEY ? 'Loaded' : 'Not Loaded');
// Connect to MongoDB
connectDB();
console.log('From Server MONGODB_URI:', process.env.MONGODB_URI);

// Import routes

import aiRoutes from './routes/ai.routes.js';
import mediaRoutes from './routes/media.routes.js';


import authRoutes from './routes/auth.routes.js';
import questionRoutes from './routes/question.routes.js';
import summaryRoutes from './routes/summary.routes.js';

console.log('Starting server...');
// Create Express app
const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined'));

// Static files (for uploaded videos)
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    mongoConnected: mongoose.connection.readyState === 1
  });
});

app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    message: '✅ API is working. Try endpoints like /api/videos',
    availableRoutes: [
      '/api/videos',
     
    ]
  });
});

// API routes

app.use('/api/ai', aiRoutes);
app.use('/api/upload', mediaRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/summary', summaryRoutes);

// FIXED: Replace problematic '*' route with specific catch-all routes
// This is more compatible with Express 5 and path-to-regexp 8.x
app.get('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'GET route not found'
  });
});

app.post('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'P route not found'
  });
});

app.put('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'PUT route not found'
  });
});

app.delete('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'DELETE route not found'
  });
});

// Alternative: Use a more specific catch-all that's Express 5 compatible
// app.all('*', (req, res) => {
//   res.status(404).json({
//     success: false,
//     message: 'Route not found'
//   });
// });

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.errors
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format'
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'Duplicate entry'
    });
  }

  // Handle multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large'
      });
    }
    return res.status(400).json({
      success: false,
      message: 'Upload error',
      error: err.message
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
});

export default app;