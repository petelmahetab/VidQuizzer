import mongoose from 'mongoose';

const videoSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    default: '',
    maxlength: 500,
  },
  url: {
    type: String,
    default: null,
  },
  youtubeId: {
    type: String,
    default: null,
  },
  filePath: {
    type: String,
    default: null,
  },
  cloudinaryUrl: {
    type: String,
    default: null,
  },
  duration: {
    type: Number,
    default: 0,
  },
  fileSize: {
    type: Number,
    default: 0,
  },
  thumbnail: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ['uploading', 'processing', 'completed', 'failed'],
    default: 'uploading',
  },
  processingStage: {
    type: String,
    enum: ['transcription', 'summarization', 'question_generation', 'completed'],
    default: 'transcription',
  },
  transcript: {
    text: {
      type: String,
      default: '',
    },
    timestamped: [{
      start: Number,
      end: Number,
      text: String,
      confidence: Number,
    }],
    language: {
      type: String,
      default: 'en',
    },
  },
  metadata: {
    format: String,
    codec: String,
    bitrate: Number,
    resolution: String,
    fps: Number,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 50,
  }],
  isPublic: {
    type: Boolean,
    default: false,
  },
  views: {
    type: Number,
    default: 0,
  },
  likes: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

videoSchema.index({ user: 1, createdAt: -1 });
videoSchema.index({ status: 1 });
videoSchema.index({ tags: 1 });
videoSchema.index({ isPublic: 1, createdAt: -1 });

videoSchema.virtual('formattedDuration').get(function () {
  const hours = Math.floor(this.duration / 3600);
  const minutes = Math.floor((this.duration % 3600) / 60);
  const seconds = this.duration % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

videoSchema.virtual('formattedFileSize').get(function () {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (this.fileSize === 0) return '0 Bytes';
  const i = Math.floor(Math.log(this.fileSize) / Math.log(1024));
  return `${(this.fileSize / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
});

videoSchema.methods.incrementViews = async function () {
  this.views += 1;
  return this.save();
};

const Video =
  mongoose.models.Video || mongoose.model('Video', videoSchema);

export default Video;
