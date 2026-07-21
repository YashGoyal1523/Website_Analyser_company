import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import 'dotenv/config'
import connectDB from './config/mongodb.js'
import analysisRouter from './routes/analysisRoutes.js'
import authRouter from './routes/authRoutes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

app.use('/api/auth', authRouter)
app.use('/api', analysisRouter)

app.use(express.static(path.join(__dirname, 'public')))
app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')))

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
    if (process.platform === 'win32') {
      exec(`start http://localhost:${PORT}`)
    }
  })
})
