// models/index.js
import mongoose from 'mongoose';

// Prevent model redefinition
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

if (!mongoose.models.Summary) {
  const SummarySchema = new mongoose.Schema({
    videoId: { type: String, required: true },
    summaryType: { type: String, default: 'brief' },
    maxLength: { type: Number, default: 200 },
    status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
    results: { type: Object },
    processedAt: { type: Date },
    processingTime: { type: Number },
  }, { collection: 'summaries' });
  models.Summary = mongoose.model('Summary', SummarySchema);
}

export default models;