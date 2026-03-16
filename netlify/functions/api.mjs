import serverless from 'serverless-http'
import { app, mongoose, MONGODB_URI } from '../../server/index.js'

let isConnected = false
const serverlessHandler = serverless(app)

export async function handler(event, context) {
  context.callbackWaitsForEmptyEventLoop = false
  if (!isConnected) {
    await mongoose.connect(MONGODB_URI)
    isConnected = true
  }
  return serverlessHandler(event, context)
}
