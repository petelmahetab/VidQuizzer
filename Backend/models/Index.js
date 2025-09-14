// models/index.js
import mongoose from 'mongoose';

// Clear model cache in development to handle nodemon reloads
if (process.env.NODE_ENV === 'development') {
  mongoose.models = {};
  mongoose.modelSchemas = {};
}

// Define models
const models = {};

if (!mongoose.models.Analysis) {
  const AnalysisSchema = new mongoose.Schema({
    videoId: { type: String, required: true },
    analysisType: { type: String, default: 'general' },
    status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
    results: { type: Object },
    processedAt: { type: Date },
    processingTime: { type: Number },
  }, { collection: 'analyses' });
  models.Analysis = mongoose.model('Analysis', AnalysisSchema);
}

if (!mongoose.models.Enhancement) {
  const EnhancementSchema = new mongoose.Schema({
    videoId: { type: String, required: true },
    enhancementType: { type: String, default: 'quality' },
    status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
    settings: { type: Object },
    results: { type: Object },
    startedAt: { type: Date },
    completedAt: { type: Date },
    processingTime: { type: Number },
  }, { collection: 'enhancements' });
  models.Enhancement = mongoose.model('Enhancement', EnhancementSchema);
}

if (!mongoose.models.Transcription) {
  const TranscriptionSchema = new mongoose.Schema({
    videoId: { type: String, required: true },
    language: { type: String, default: 'en' },
    includeTimestamps: { type: Boolean, default: false },
    status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
    results: { type: Object },
    processedAt: { type: Date },
    processingTime: { type: Number },
  }, { collection: 'transcriptions' });
  models.Transcription = mongoose.model('Transcription', TranscriptionSchema);
}

// if (!mongoose.models.Summary) {
//   const SummarySchema = new mongoose.Schema({
//     video: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Video',
//       required: true,
//     },
//     user: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'User',
//       required: true,
//     },
//     type: {
//       type: String,
//       enum: ['brief', 'detailed', 'comprehensive', 'bullet_points', 'key_insights'],
//       required: true,
//     },
//     content: {
//       type: String,
//       required: true,
//     },
//     keyPoints: [
//       {
//         point: String,
//         timestamp: Number,
//         importance: {
//           type: Number,
//           min: 1,
//           max: 5,
//           default: 3,
//         },
//       },
//     ],
//     sentiment: {
//       overall: {
//         type: String,
//         enum: ['positive', 'negative', 'neutral'],
//         default: 'neutral',
//       },
//       confidence: {
//         type: Number,
//         min: 0,
//         max: 1,
//         default: 0,
//       },
//       emotions: [
//         {
//           emotion: String,
//           confidence: Number,
//         },
//       ],
//     },
//     topics: [
//       {
//         name: String,
//         relevance: Number,
//         mentions: Number,
//       },
//     ],
//     wordCount: {
//       type: Number,
//       default: 0,
//     },
//     readingTime: {
//       type: Number, // in minutes
//       default: 0,
//     },
//     language: {
//       type: String,
//       default: 'en',
//     },
//     aiModel: {
//       type: String,
//       default: 'gemini-pro', // Updated to match your Gemini API usage
//     },
//     processingTime: {
//       type: Number, // in seconds
//       default: 0,
//     },
//     quality: {
//       coherence: {
//         type: Number,
//         min: 0,
//         max: 1,
//         default: 0,
//       },
//       completeness: {
//         type: Number,
//         min: 0,
//         max: 1,
//         default: 0,
//       },
//       accuracy: {
//         type: Number,
//         min: 0,
//         max: 1,
//         default: 0,
//       },
//     },
//     userFeedback: {
//       rating: {
//         type: Number,
//         min: 1,
//         max: 5,
//       },
//       comment: String,
//       helpful: Boolean,
//     },
//     isShared: {
//       type: Boolean,
//       default: false,
//     },
//     sharedWith: [
//       {
//         user: {
//           type: mongoose.Schema.Types.ObjectId,
//           ref: 'User',
//         },
//         permission: {
//           type: String,
//           enum: ['read', 'comment'],
//           default: 'read',
//         },
//         sharedAt: {
//           type: Date,
//           default: Date.now,
//         },
//       },
//     ],
//   }, {
//     timestamps: true,
//     collection: 'summaries',
//   });

//   // Calculate reading time based on word count
//   SummarySchema.pre('save', function (next) {
//     if (this.content) {
//       this.wordCount = this.content.split(/\s+/).length;
//       this.readingTime = Math.ceil(this.wordCount / 200); // Average reading speed
//     }
//     next();
//   });

//   // Indexes
//   SummarySchema.index({ video: 1, type: 1 });
//   SummarySchema.index({ user: 1, createdAt: -1 });
//   SummarySchema.index({ isShared: 1 });

//   models.Summary = mongoose.model('Summary', SummarySchema);
// }

// // Add Video and User models (required by Summary schema)
// if (!mongoose.models.Video) {
//   const VideoSchema = new mongoose.Schema({
//     videoId: { type: String, required: true, unique: true }, // String ID for compatibility
//     title: { type: String },
//     url: { type: String },
//     duration: { type: Number },
//     uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//     uploadedAt: { type: Date, default: Date.now },
//   }, { collection: 'videos' });
//   models.Video = mongoose.model('Video', VideoSchema);
// }

// if (!mongoose.models.User) {
//   const UserSchema = new mongoose.Schema({
//     username: { type: String, required: true, unique: true },
//     email: { type: String, required: true, unique: true },
//     createdAt: { type: Date, default: Date.now },
//   }, { collection: 'users' });
//   models.User = mongoose.model('User', UserSchema);
// }

export default models;