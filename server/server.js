import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import dns from 'dns'
import 'dotenv/config'
import connectDB from './config/mongodb.js'
import analysisRouter from './routes/analysisRoutes.js'
import authRouter from './routes/authRoutes.js'

// Some ISPs/routers fail to resolve the DNS SRV record MongoDB Atlas's
// mongodb+srv:// URIs depend on, even though normal DNS works fine.
// Pointing Node's resolver at a public DNS server avoids that regardless
// of the end user's network/router.
dns.setServers(['8.8.8.8', '1.1.1.1'])

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
}).catch((err) => {
  console.error('Failed to connect to the database. Check your MONGODB_URI.')
  console.error(err.message)
  process.exit(1)
})
