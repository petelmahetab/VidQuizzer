import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    default: 'Untitled Document',
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500,
  },
  filePath: {
    type: String,
    required: true,
  },
  fileSize: {
    type: Number,
    required: true,
  },
  isPublic: {
    type: Boolean,
    default: false,
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 50,
  }],
  metadata: {
    extension: { type: String },
    format: { type: String },
    sizeFormatted: { type: String },
    pageCount: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
  },
  status: {
    type: String,
    enum: ['uploading', 'processing', 'completed', 'failed'],
    default: 'uploading',
  },
  processingStage: {
    type: String,
    enum: ['uploading', 'text_extraction', 'summarization', 'completed', 'failed'],
    default: 'uploading',
  },
  textContent: {
    text: { type: String },
    extractedAt: { type: Date },
  },
  summary: {
    text: { type: String },
    generatedAt: { type: Date },
    model: { type: String },
  },
  error: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('Document', documentSchema);