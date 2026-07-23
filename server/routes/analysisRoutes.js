import express from 'express'
import analyzeWebsite, { getUserAnalyses, getSingleAnalysis, deleteAnalysis } from '../controllers/analysisController.js'
import authMiddleware from '../middleware/authMiddleware.js'

const analysisRouter = express.Router()

analysisRouter.post('/analyze', authMiddleware, analyzeWebsite)
analysisRouter.get('/analyses', authMiddleware, getUserAnalyses)
analysisRouter.get('/analyses/:id', authMiddleware, getSingleAnalysis)
analysisRouter.delete('/analyses/:id', authMiddleware, deleteAnalysis)

export default analysisRouter
