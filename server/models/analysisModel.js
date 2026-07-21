import mongoose from 'mongoose'

const analysisSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  url:           { type: String, required: true },
  totalRuns:     Number,
  totalDuration: Number,
  lighthouseData: {
    lcp:                Number,
    cls:                Number,
    ttfb:               Number,
    fcp:                Number,
    tbt:                Number,
    speedIndex:         Number,
    seoScore:           Number,
    accessibilityScore: Number,
  },
  runtimeData: [{
    run:              Number,
    timestamp:        String,
    url:              String,
    scriptDuration:   Number,
    taskDuration:     Number,
    layoutDuration:   Number,
    jsHeapUsedSize:   Number,
    domNodes:         Number,
    jsEventListeners: Number,
    processMemoryMB:  Number,
  }],
  sequence: { type: [mongoose.Schema.Types.Mixed], default: [] },
  mode: { type: String, enum: ['auto', 'manual'], default: 'auto' },
  createdAt: { type: Date, default: Date.now }
})

const analysisModel = mongoose.models.analysis || mongoose.model('analysis', analysisSchema)
export default analysisModel
