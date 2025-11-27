import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import { prisma } from '@zeroedin/db'

import { productsRouter } from './routes/products'
import { adsRouter } from './routes/ads'
import { alertsRouter } from './routes/alerts'
import { paymentsRouter } from './routes/payments'
import { dataRouter } from './routes/data'
import { sourcesRouter } from './routes/sources'
import { executionsRouter } from './routes/executions'
import { logsRouter } from './routes/logs'
import { harvesterRouter } from './routes/harvester'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 8000

app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/products', productsRouter)
app.use('/api/ads', adsRouter)
app.use('/api/alerts', alertsRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/data', dataRouter)
app.use('/api/sources', sourcesRouter)
app.use('/api/executions', executionsRouter)
app.use('/api/logs', logsRouter)
app.use('/api/harvester', harvesterRouter)

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Something went wrong!' })
})

app.listen(PORT, () => {
  console.log(`🚀 API server running on port ${PORT}`)
})

export default app
