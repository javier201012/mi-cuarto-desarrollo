import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { rateLimit } from 'express-rate-limit'

dotenv.config({ path: 'server/.env' })

const {
  PORT = 4000,
  MONGODB_URI,
  NODE_ENV = 'development',
  JWT_SECRET = 'change-me-in-production',
  CLIENT_ORIGINS = 'http://localhost:5173,http://localhost:5174',
} = process.env

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in server/.env')
  process.exit(1)
}

if (NODE_ENV === 'production' && (!JWT_SECRET || JWT_SECRET.length < 32 || JWT_SECRET === 'change-me-in-production')) {
  console.error('JWT_SECRET must be a strong value (>=32 chars) in production')
  process.exit(1)
}

const app = express()
app.set('trust proxy', 1)

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
)

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
})

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, try again later' },
})

const allowedOrigins = CLIENT_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .length > 0
  ? CLIENT_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : []

app.use(
  cors({
    origin(origin, callback) {
      // Always allow no origin (same-origin requests, Postman, etc.)
      if (!origin) {
        return callback(null, true)
      }

      // Allow localhost in any env
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      if (isLocalhost) {
        return callback(null, true)
      }

      // Allow configured origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true)
      }

      // Log rejected origins for debugging
      if (NODE_ENV === 'production') {
        console.warn(`[CORS] Rejected origin: ${origin}, allowed: ${allowedOrigins.join(', ')}`)
      }

      // In production, be lenient with netlify.app domains (still safe)
      if (NODE_ENV === 'production' && origin.includes('netlify.app')) {
        return callback(null, true)
      }

      // Reject
      callback(null, false)
    },
  }),
)
app.use('/api', apiLimiter)
app.use(express.json({ limit: '1mb' }))

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  { timestamps: true },
)

const offerSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['buy', 'sell'], required: true },
    asset: { type: String, required: true },
    tokenAddress: { type: String, default: null },
    network: { type: String, required: true },
    fiat: { type: String, default: 'USD' },
    price: { type: Number, required: true },
    minAmount: { type: Number, required: true },
    maxAmount: { type: Number, required: true },
    paymentMethods: [{ type: String }],
    status: { type: String, enum: ['active', 'paused'], default: 'active' },
  },
  { timestamps: true },
)

const tradeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mode: { type: String, enum: ['spot', 'p2p'], required: true },
    type: { type: String, enum: ['buy', 'sell'], required: true },
    asset: { type: String, required: true },
    tokenAddress: { type: String, default: null },
    network: { type: String, required: true },
    amount: { type: Number, required: true },
    price: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' },
  },
  { timestamps: true },
)

const User = mongoose.model('User', userSchema)
const Offer = mongoose.model('Offer', offerSchema)
const Trade = mongoose.model('Trade', tradeSchema)

function isValidTokenAddressForNetwork(network, tokenAddress) {
  const address = String(tokenAddress || '').trim()
  if (!address) {
    return false
  }

  if (['Ethereum', 'BNB Chain', 'Polygon'].includes(network)) {
    return /^0x[a-fA-F0-9]{40}$/.test(address)
  }

  if (network === 'Solana') {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
  }

  if (network === 'Tron') {
    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)
  }

  return false
}

const networkToDexChain = {
  Ethereum: 'ethereum',
  'BNB Chain': 'bsc',
  Polygon: 'polygon',
  Solana: 'solana',
  Tron: 'tron',
}

const evmRpcByNetwork = {
  Ethereum: 'https://rpc.ankr.com/eth',
  'BNB Chain': 'https://bsc-dataseed1.binance.org',
  Polygon: 'https://polygon-rpc.com',
}

function decodeHexStringResult(resultHex) {
  if (!resultHex || resultHex === '0x') {
    return ''
  }

  const hex = resultHex.startsWith('0x') ? resultHex.slice(2) : resultHex
  if (!hex) {
    return ''
  }

  // Dynamic ABI string encoding.
  if (hex.length >= 192) {
    const lengthHex = hex.slice(64, 128)
    const length = Number.parseInt(lengthHex, 16)
    if (Number.isFinite(length) && length > 0) {
      const dataHex = hex.slice(128, 128 + length * 2)
      if (dataHex) {
        try {
          return Buffer.from(dataHex, 'hex').toString('utf8').replaceAll('\0', '').trim()
        } catch {
          return ''
        }
      }
    }
  }

  // bytes32 fallback encoding.
  const bytes32Hex = hex.slice(0, 64)
  if (!bytes32Hex) {
    return ''
  }

  try {
    return Buffer.from(bytes32Hex, 'hex').toString('utf8').replaceAll('\0', '').trim()
  } catch {
    return ''
  }
}

async function evmCall(network, to, data) {
  const rpcUrl = evmRpcByNetwork[network]
  if (!rpcUrl) {
    return null
  }

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  })

  if (!response.ok) {
    return null
  }

  const payload = await response.json()
  if (payload.error || !payload.result) {
    return null
  }

  return payload.result
}

async function resolveEvmTokenFromChain(network, tokenAddress) {
  const symbolResult = await evmCall(network, tokenAddress, '0x95d89b41')
  const nameResult = await evmCall(network, tokenAddress, '0x06fdde03')

  const symbol = decodeHexStringResult(symbolResult).slice(0, 24)
  const name = decodeHexStringResult(nameResult).slice(0, 80)

  if (!symbol) {
    return null
  }

  return {
    symbol,
    name: name || symbol,
    address: tokenAddress,
    source: 'onchain',
  }
}

async function resolveTokenFromAddress(network, tokenAddress) {
  const dexChain = networkToDexChain[network]
  if (dexChain) {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`)
    if (response.ok) {
      const data = await response.json()
      const pairs = Array.isArray(data.pairs) ? data.pairs : []
      const normalizedAddress = String(tokenAddress).toLowerCase()

      const match = pairs.find((pair) => {
        const chainOk = pair.chainId === dexChain
        const baseAddress = String(pair.baseToken?.address || '').toLowerCase()
        return chainOk && baseAddress === normalizedAddress && pair.baseToken?.symbol
      })

      if (match) {
        return {
          symbol: match.baseToken.symbol,
          name: match.baseToken.name || match.baseToken.symbol,
          address: match.baseToken.address,
          source: 'dexscreener',
        }
      }
    }
  }

  if (evmRpcByNetwork[network]) {
    return resolveEvmTokenFromChain(network, tokenAddress)
  }

  return null
}

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' },
  )
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    req.auth = jwt.verify(token, JWT_SECRET)
    return next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

app.get('/api/health', (_, res) => {
  res.json({ ok: true, service: 'crypto-exchange-api' })
})

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body

    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Invalid payload' })
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() })
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
    })

    const token = signToken(user)
    return res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    })
  } catch {
    return res.status(500).json({ error: 'Internal error' })
  }
})

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await User.findOne({ email: String(email || '').toLowerCase().trim() })
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password || '', user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = signToken(user)
    return res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    })
  } catch {
    return res.status(500).json({ error: 'Internal error' })
  }
})

app.get('/api/auth/me', authRequired, async (req, res) => {
  const user = await User.findById(req.auth.sub).select('_id name email role createdAt')
  if (!user) {
    return res.status(404).json({ error: 'User not found' })
  }
  return res.json({ user })
})

app.get('/api/market/networks', (_, res) => {
  res.json({
    networks: ['Bitcoin', 'Ethereum', 'BNB Chain', 'Polygon', 'Solana', 'Tron'],
    assets: ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL'],
  })
})

app.get('/api/token/resolve', async (req, res) => {
  try {
    const network = String(req.query.network || '')
    const tokenAddress = String(req.query.address || '').trim()

    if (!network || !tokenAddress) {
      return res.status(400).json({ error: 'Missing network or address' })
    }

    if (!isValidTokenAddressForNetwork(network, tokenAddress)) {
      return res.status(400).json({ error: 'Token address is not valid for selected network' })
    }

    const token = await resolveTokenFromAddress(network, tokenAddress)
    if (!token) {
      return res.status(404).json({ error: 'Token not found on market index and could not be resolved on-chain' })
    }

    return res.json({ token })
  } catch {
    return res.status(502).json({ error: 'Unable to resolve token symbol right now' })
  }
})

app.get('/api/p2p/offers', async (req, res) => {
  const { type } = req.query
  const filter = { status: 'active' }
  if (type === 'buy' || type === 'sell') {
    filter.type = type
  }

  const offers = await Offer.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('ownerId', 'name')

  res.json({
    offers: offers.map((offer) => ({
      id: offer._id,
      owner: offer.ownerId?.name || 'Trader',
      type: offer.type,
      asset: offer.asset,
      tokenAddress: offer.tokenAddress,
      network: offer.network,
      fiat: offer.fiat,
      price: offer.price,
      minAmount: offer.minAmount,
      maxAmount: offer.maxAmount,
      paymentMethods: offer.paymentMethods,
      createdAt: offer.createdAt,
    })),
  })
})

app.post('/api/p2p/offers', authRequired, async (req, res) => {
  try {
    const {
      type,
      asset,
      tokenAddress,
      network,
      fiat = 'USD',
      price,
      minAmount,
      maxAmount,
      paymentMethods = [],
    } = req.body

    if (!['buy', 'sell'].includes(type) || !asset || !network || !price || !minAmount || !maxAmount) {
      return res.status(400).json({ error: 'Invalid payload' })
    }

    const cleanTokenAddress = String(tokenAddress || '').trim()
    if (cleanTokenAddress && !isValidTokenAddressForNetwork(network, cleanTokenAddress)) {
      return res.status(400).json({ error: 'Token address is not valid for selected network' })
    }

    const offer = await Offer.create({
      ownerId: req.auth.sub,
      type,
      asset,
      tokenAddress: cleanTokenAddress || null,
      network,
      fiat,
      price,
      minAmount,
      maxAmount,
      paymentMethods,
    })

    return res.status(201).json({ offer })
  } catch {
    return res.status(500).json({ error: 'Internal error' })
  }
})

app.post('/api/trades', authRequired, async (req, res) => {
  try {
    const { mode = 'spot', type, asset, tokenAddress, network, amount, price } = req.body

    if (!['spot', 'p2p'].includes(mode) || !['buy', 'sell'].includes(type) || !asset || !network) {
      return res.status(400).json({ error: 'Invalid payload' })
    }

    const cleanTokenAddress = String(tokenAddress || '').trim()
    if (cleanTokenAddress && !isValidTokenAddressForNetwork(network, cleanTokenAddress)) {
      return res.status(400).json({ error: 'Token address is not valid for selected network' })
    }

    if (!amount || !price || amount <= 0 || price <= 0) {
      return res.status(400).json({ error: 'Invalid trade values' })
    }

    const trade = await Trade.create({
      userId: req.auth.sub,
      mode,
      type,
      asset,
      tokenAddress: cleanTokenAddress || null,
      network,
      amount,
      price,
    })

    return res.status(201).json({ trade })
  } catch {
    return res.status(500).json({ error: 'Internal error' })
  }
})

app.get('/api/trades/mine', authRequired, async (req, res) => {
  const trades = await Trade.find({ userId: req.auth.sub }).sort({ createdAt: -1 }).limit(20)
  res.json({ trades })
})

app.get('/api/backoffice/metrics', authRequired, async (_, res) => {
  const [users, activeOffers, pendingTrades] = await Promise.all([
    User.countDocuments(),
    Offer.countDocuments({ status: 'active' }),
    Trade.countDocuments({ status: 'pending' }),
  ])

  res.json({ users, activeOffers, pendingTrades })
})

async function bootstrap() {
  try {
    await mongoose.connect(MONGODB_URI)
    app.listen(PORT, () => {
      console.log(`API running on http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('Failed to start API', error.message)
    process.exit(1)
  }
}

// Export for Netlify Functions (serverless)
export { app, mongoose, MONGODB_URI }

// Only start the HTTP server when running locally (not in Netlify Functions / Lambda)
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  bootstrap()
}
