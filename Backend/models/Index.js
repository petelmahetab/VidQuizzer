import mongoose from 'mongoose';
const { Schema } = mongoose;

// Clear model cache in development
if (process.env.NODE_ENV === 'development') {
  mongoose.models = {};
  mongoose.modelSchemas = {};
}

// Define models
const models = {};



// Video Schema
if (!mongoose.models.Video) {
  const VideoSchema = new Schema({
    _id: { type: Schema.Types.ObjectId, auto: true }, // Use ObjectId
    title: { type: String },
    url: { type: String },
    duration: { type: Number },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now }
  }, { collection: 'videos' });
  models.Video = mongoose.model('Video', VideoSchema);
}

// Analysis Schema
if (!mongoose.models.Analysis) {
  const AnalysisSchema = new Schema({
    videoId: { type: Schema.Types.ObjectId, required: true, ref: 'Video' }, // Changed to ObjectId
    analysisType: { type: String, default: 'general' },
    status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
    results: { type: Object },
    processedAt: { type: Date },
    processingTime: { type: Number }
  }, { collection: 'analyses' });
  models.Analysis = mongoose.model('Analysis', AnalysisSchema);
}

// Enhancement Schema
if (!mongoose.models.Enhancement) {
  const EnhancementSchema = new Schema({
    videoId: { type: Schema.Types.ObjectId, required: true, ref: 'Video' }, // Changed to ObjectId
    enhancementType: { type: String, default: 'quality' },
    status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
    settings: { type: Object },
    results: { type: Object },
    startedAt: { type: Date },
    completedAt: { type: Date },
    processingTime: { type: Number }
  }, { collection: 'enhancements' });
  models.Enhancement = mongoose.model('Enhancement', EnhancementSchema);
}

// Transcription Schema
if (!mongoose.models.Transcription) {
  const TranscriptionSchema = new Schema({
    videoId: { type: Schema.Types.ObjectId, required: true, ref: 'Video' }, // Changed to ObjectId
    language: { type: String, default: 'en' },
    includeTimestamps: { type: Boolean, default: false },
    status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
    results: {
      id: String, // AssemblyAI UUID
      text: String,
      status: String,
      segments: [Schema.Types.Mixed]
    },
    processedAt: { type: Date },
    processingTime: { type: Number }
  }, { collection: 'transcriptions' });
  models.Transcription = mongoose.model('Transcription', TranscriptionSchema);
}

// Quota Schema
if (!mongoose.models.Quota) {
  const QuotaSchema = new Schema({
    api: { type: String, required: true },
    date: { type: String, required: true },
    count: { type: Number, default: 0 }
  }, { collection: 'quotas' });
  QuotaSchema.index({ api: 1, date: 1 }, { unique: true });
  models.Quota = mongoose.model('Quota', QuotaSchema);
}

// Summary Schema
if (!mongoose.models.Summary) {
  const SummarySchema = new Schema({
    videoId: { type: Schema.Types.ObjectId, required: true, ref: 'Video' },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    transcriptionId: { type: Schema.Types.ObjectId, required: true, ref: 'Transcription' },
    type: {
      type: String,
      enum: ['brief', 'detailed', 'comprehensive', 'bullet_points', 'key_insights'],
      required: true,
      default: 'brief'
    },
    content: { type: String, required: true },
    keyPoints: [
      {
        point: { type: String, required: true },
        timestamp: { type: Number, required: true },
        importance: { type: Number, min: 1, max: 5, default: 3 }
      }
    ],
    sentiment: {
      overall: { type: String, enum: ['positive', 'negative', 'neutral'], default: 'neutral' },
      confidence: { type: Number, min: 0, max: 1, default: 0.5 },
      emotions: [{ emotion: String, confidence: Number }]
    },
    topics: [{ name: String, relevance: Number, mentions: Number }],
    wordCount: { type: Number, default: 0 },
    readingTime: { type: Number, default: 0 },
    language: { type: String, default: 'en' },
    aiModel: { type: String, default: 'gemini-pro' },
    processingTime: { type: Number, default: 0 },
    quality: {
      coherence: { type: Number, min: 0, max: 1, default: 0 },
      completeness: { type: Number, min: 0, max: 1, default: 0 },
      accuracy: { type: Number, min: 0, max: 1, default: 0 }
    },
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'completed'
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }, { collection: 'summaries' });

  SummarySchema.pre('save', function (next) {
    if (this.content) {
      this.wordCount = this.content.split(/\s+/).length;
      this.readingTime = Math.ceil(this.wordCount / 200);
    }
    this.updatedAt = Date.now();
    next();
  });

  SummarySchema.index({ videoId: 1, type: 1 });
  SummarySchema.index({ userId: 1, createdAt: -1 });
  SummarySchema.index({ transcriptionId: 1 });

  models.Summary = mongoose.model('Summary', SummarySchema); // Assign to models
}

export default models;