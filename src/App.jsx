import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || ''
const HAS_WC_PROJECT_ID = Boolean(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID)
const CUSTOM_TOKEN_VALUE = '__custom_token__'

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

async function apiRequest(path, { method = 'GET', token, body } = {}) {
  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new Error('No se pudo conectar con la API. Verifica que el backend este corriendo.')
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    throw new Error(data?.error || 'Request failed')
  }
  return data
}

function AppLayout() {
  const navigate = useNavigate()
  const [auth, setAuth] = useState(() => {
    const raw = localStorage.getItem('auth')
    return raw ? JSON.parse(raw) : null
  })

  useEffect(() => {
    if (auth) {
      localStorage.setItem('auth', JSON.stringify(auth))
    } else {
      localStorage.removeItem('auth')
    }
  }, [auth])

  const logout = () => {
    setAuth(null)
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          ChainDesk
        </Link>
        <div className="topbar-right">
          <nav>
            <Link to="/">Inicio</Link>
            <Link to="/backoffice">Backoffice</Link>
            {!auth && <Link to="/login">Iniciar sesion</Link>}
            {!auth && <Link to="/register">Registro</Link>}
            {auth && (
              <button className="ghost" onClick={logout}>
                Cerrar sesion
              </button>
            )}
          </nav>
          <div className="wallet-area">
            <ConnectButton chainStatus="icon" showBalance={false} accountStatus="avatar" />
            {!HAS_WC_PROJECT_ID && (
              <p className="wallet-hint">Configura `VITE_WALLETCONNECT_PROJECT_ID` para WalletConnect completo.</p>
            )}
          </div>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/login"
          element={<AuthPage mode="login" setAuth={setAuth} auth={auth} />}
        />
        <Route
          path="/register"
          element={<AuthPage mode="register" setAuth={setAuth} auth={auth} />}
        />
        <Route
          path="/backoffice"
          element={<Backoffice auth={auth} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

function Landing() {
  const [offers, setOffers] = useState([])

  useEffect(() => {
    apiRequest('/api/p2p/offers')
      .then((data) => setOffers(data.offers || []))
      .catch(() => setOffers([]))
  }, [])

  return (
    <main>
      <section className="hero-block">
        <p className="eyebrow">Multired + P2P</p>
        <h1>Compra y vende crypto con liquidez global y panel operativo en tiempo real</h1>
        <p className="subtitle">
          Preparado para Bitcoin, Ethereum, BNB Chain, Polygon, Solana y Tron.
          Gestiona ofertas P2P, operaciones spot y usuarios desde un solo backoffice.
        </p>
        <div className="hero-actions">
          <Link className="cta" to="/register">
            Crear cuenta
          </Link>
          <Link className="ghost" to="/backoffice">
            Ir al backoffice
          </Link>
        </div>
      </section>

      <section className="grid-cards">
        <article className="card">
          <h3>Mercado Spot</h3>
          <p>Registro de operaciones de compra/venta con activo, red, monto y precio.</p>
        </article>
        <article className="card">
          <h3>Mercado P2P</h3>
          <p>Crea anuncios de compra o venta con limites, moneda fiat y metodos de pago.</p>
        </article>
        <article className="card">
          <h3>Backoffice</h3>
          <p>Metricas operativas y seguimiento de actividad para control comercial.</p>
        </article>
      </section>

      <section className="offers-preview">
        <div className="section-head">
          <h2>Ofertas P2P activas</h2>
          <span>{offers.length} publicadas</span>
        </div>
        <div className="offer-list">
          {offers.slice(0, 4).map((offer) => (
            <article className="offer" key={offer.id}>
              <strong>{offer.type.toUpperCase()}</strong>
              <p>{offer.asset} · {offer.network}</p>
              <p>{offer.price} {offer.fiat}</p>
            </article>
          ))}
          {!offers.length && <p>Aun no hay ofertas activas.</p>}
        </div>
      </section>
    </main>
  )
}

function AuthPage({ mode, setAuth, auth }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const isRegister = mode === 'register'

  if (auth) {
    return <Navigate to="/backoffice" replace />
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')

    try {
      const payload = isRegister ? { name, email, password } : { email, password }
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login'
      const data = await apiRequest(endpoint, { method: 'POST', body: payload })
      setAuth({ token: data.token, user: data.user })
      navigate('/backoffice')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="auth-wrap">
      <form className="panel auth" onSubmit={submit}>
        <h2>{isRegister ? 'Crear cuenta' : 'Iniciar sesion'}</h2>
        {isRegister && (
          <label>
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
        <label>
          Correo
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Contrasena
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="cta">{isRegister ? 'Registrarme' : 'Entrar'}</button>
      </form>
    </section>
  )
}

function Backoffice({ auth }) {
  const [networks, setNetworks] = useState([])
  const [assets, setAssets] = useState([])
  const [metrics, setMetrics] = useState({ users: 0, activeOffers: 0, pendingTrades: 0 })
  const [offers, setOffers] = useState([])
  const [trades, setTrades] = useState([])
  const [message, setMessage] = useState('')
  const [tradeForm, setTradeForm] = useState({
    mode: 'spot',
    type: 'buy',
    asset: 'BTC',
    network: 'Bitcoin',
    amount: 0.1,
    price: 0,
    customTokenAddress: '',
  })
  const [offerForm, setOfferForm] = useState({
    type: 'sell',
    asset: 'USDT',
    network: 'Tron',
    fiat: 'USD',
    price: 1,
    minAmount: 100,
    maxAmount: 5000,
    paymentMethods: 'Transferencia bancaria',
    customTokenAddress: '',
  })
  const [tradeTokenInfo, setTradeTokenInfo] = useState({ loading: false, symbol: '', name: '', error: '' })
  const [offerTokenInfo, setOfferTokenInfo] = useState({ loading: false, symbol: '', name: '', error: '' })

  const headersToken = useMemo(() => auth?.token || '', [auth?.token])

  const load = useCallback(async () => {
    try {
      const [networkData, metricsData, offersData, tradesData] = await Promise.all([
        apiRequest('/api/market/networks'),
        apiRequest('/api/backoffice/metrics', { token: headersToken }),
        apiRequest('/api/p2p/offers'),
        apiRequest('/api/trades/mine', { token: headersToken }),
      ])

      setNetworks(networkData.networks || [])
      setAssets(networkData.assets || [])
      setMetrics(metricsData)
      setOffers(offersData.offers || [])
      setTrades(tradesData.trades || [])
    } catch (err) {
      setMessage(err.message)
    }
  }, [headersToken])

  useEffect(() => {
    if (headersToken) {
      load()
    }
  }, [headersToken, load])

  const assetOptions = assets.length ? assets : ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL']
  const networkOptions = networks.length
    ? networks
    : ['Bitcoin', 'Ethereum', 'BNB Chain', 'Polygon', 'Solana', 'Tron']
  const networkTokenMap = {
    Bitcoin: ['BTC', 'USDT'],
    Ethereum: ['ETH', 'USDT', 'USDC'],
    'BNB Chain': ['BNB', 'USDT', 'USDC'],
    Polygon: ['MATIC', 'USDT', 'USDC'],
    Solana: ['SOL', 'USDC', 'USDT'],
    Tron: ['TRX', 'USDT'],
  }

  const getAssetsByNetwork = (network) => {
    const preferred = networkTokenMap[network] || []
    const available = preferred.filter((asset) => assetOptions.includes(asset) || ['MATIC', 'TRX'].includes(asset))
    const baseOptions = available.length ? available : assetOptions
    return [...baseOptions, CUSTOM_TOKEN_VALUE]
  }

  const tradeAssetOptions = getAssetsByNetwork(tradeForm.network)
  const offerAssetOptions = getAssetsByNetwork(offerForm.network)
  const fiatOptions = ['USD', 'EUR', 'COP', 'MXN', 'ARS', 'BRL']
  const paymentMethodOptions = [
    'Transferencia bancaria',
    'Binance Pay',
    'Nequi',
    'PayPal',
    'Mercado Pago',
  ]

  const createTrade = async (event) => {
    event.preventDefault()
    setMessage('')

    const isCustomToken = tradeForm.asset === CUSTOM_TOKEN_VALUE
    const resolvedAsset = isCustomToken ? tradeTokenInfo.symbol.trim().toUpperCase() : tradeForm.asset
    const resolvedTokenAddress = isCustomToken ? tradeForm.customTokenAddress.trim() : ''

    if (isCustomToken) {
      if (!resolvedAsset) {
        setMessage('No se pudo resolver el simbolo. Verifica el contrato y vuelve a intentar.')
        return
      }

      if (!isValidTokenAddressForNetwork(tradeForm.network, resolvedTokenAddress)) {
        setMessage('La direccion del token no es valida para la red seleccionada.')
        return
      }
    }

    try {
      await apiRequest('/api/trades', {
        method: 'POST',
        token: headersToken,
        body: {
          ...tradeForm,
          asset: resolvedAsset,
          tokenAddress: resolvedTokenAddress || null,
          amount: Number(tradeForm.amount),
          price: Number(tradeForm.price),
        },
      })
      setMessage('Operacion creada correctamente.')
      load()
    } catch (err) {
      setMessage(err.message)
    }
  }

  const createOffer = async (event) => {
    event.preventDefault()
    setMessage('')

    const isCustomToken = offerForm.asset === CUSTOM_TOKEN_VALUE
    const resolvedAsset = isCustomToken ? offerTokenInfo.symbol.trim().toUpperCase() : offerForm.asset
    const resolvedTokenAddress = isCustomToken ? offerForm.customTokenAddress.trim() : ''

    if (isCustomToken) {
      if (!resolvedAsset) {
        setMessage('No se pudo resolver el simbolo. Verifica el contrato y vuelve a intentar.')
        return
      }

      if (!isValidTokenAddressForNetwork(offerForm.network, resolvedTokenAddress)) {
        setMessage('La direccion del token no es valida para la red seleccionada.')
        return
      }
    }

    try {
      await apiRequest('/api/p2p/offers', {
        method: 'POST',
        token: headersToken,
        body: {
          ...offerForm,
          asset: resolvedAsset,
          tokenAddress: resolvedTokenAddress || null,
          price: Number(offerForm.price),
          minAmount: Number(offerForm.minAmount),
          maxAmount: Number(offerForm.maxAmount),
          paymentMethods: [offerForm.paymentMethods],
        },
      })
      setMessage('Oferta P2P publicada.')
      load()
    } catch (err) {
      setMessage(err.message)
    }
  }

  const resolveTradeToken = useCallback(async () => {
    const address = tradeForm.customTokenAddress.trim()
    if (!isValidTokenAddressForNetwork(tradeForm.network, address)) {
      setTradeTokenInfo({ loading: false, symbol: '', name: '', error: 'Contrato invalido para la red seleccionada.' })
      return
    }

    setTradeTokenInfo({ loading: true, symbol: '', name: '', error: '' })
    try {
      const data = await apiRequest(
        `/api/token/resolve?network=${encodeURIComponent(tradeForm.network)}&address=${encodeURIComponent(address)}`,
      )
      setTradeTokenInfo({
        loading: false,
        symbol: data.token.symbol || '',
        name: data.token.name || '',
        error: '',
      })
    } catch (err) {
      setTradeTokenInfo({ loading: false, symbol: '', name: '', error: err.message })
    }
  }, [tradeForm.customTokenAddress, tradeForm.network])

  const resolveOfferToken = useCallback(async () => {
    const address = offerForm.customTokenAddress.trim()
    if (!isValidTokenAddressForNetwork(offerForm.network, address)) {
      setOfferTokenInfo({ loading: false, symbol: '', name: '', error: 'Contrato invalido para la red seleccionada.' })
      return
    }

    setOfferTokenInfo({ loading: true, symbol: '', name: '', error: '' })
    try {
      const data = await apiRequest(
        `/api/token/resolve?network=${encodeURIComponent(offerForm.network)}&address=${encodeURIComponent(address)}`,
      )
      setOfferTokenInfo({
        loading: false,
        symbol: data.token.symbol || '',
        name: data.token.name || '',
        error: '',
      })
    } catch (err) {
      setOfferTokenInfo({ loading: false, symbol: '', name: '', error: err.message })
    }
  }, [offerForm.customTokenAddress, offerForm.network])

  useEffect(() => {
    if (tradeForm.asset !== CUSTOM_TOKEN_VALUE) {
      return
    }

    const address = tradeForm.customTokenAddress.trim()
    if (!address) {
      setTradeTokenInfo({ loading: false, symbol: '', name: '', error: '' })
      return
    }

    const timer = setTimeout(() => {
      resolveTradeToken()
    }, 450)

    return () => clearTimeout(timer)
  }, [tradeForm.asset, tradeForm.customTokenAddress, tradeForm.network, resolveTradeToken])

  useEffect(() => {
    if (offerForm.asset !== CUSTOM_TOKEN_VALUE) {
      return
    }

    const address = offerForm.customTokenAddress.trim()
    if (!address) {
      setOfferTokenInfo({ loading: false, symbol: '', name: '', error: '' })
      return
    }

    const timer = setTimeout(() => {
      resolveOfferToken()
    }, 450)

    return () => clearTimeout(timer)
  }, [offerForm.asset, offerForm.customTokenAddress, offerForm.network, resolveOfferToken])

  if (!auth) {
    return <Navigate to="/login" replace />
  }

  return (
    <main className="dashboard">
      <section className="metrics">
        <article className="panel"><h3>Usuarios</h3><p>{metrics.users}</p></article>
        <article className="panel"><h3>Ofertas Activas</h3><p>{metrics.activeOffers}</p></article>
        <article className="panel"><h3>Trades Pendientes</h3><p>{metrics.pendingTrades}</p></article>
      </section>

      {message && <p className="status">{message}</p>}

      <section className="forms-grid">
        <form className="panel" onSubmit={createTrade}>
          <h3>Nueva operacion</h3>
          <label>Modo<select value={tradeForm.mode} onChange={(e) => setTradeForm((s) => ({ ...s, mode: e.target.value }))}><option value="spot">Spot</option><option value="p2p">P2P</option></select></label>
          <label>Tipo<select value={tradeForm.type} onChange={(e) => setTradeForm((s) => ({ ...s, type: e.target.value }))}><option value="buy">Compra</option><option value="sell">Venta</option></select></label>
          <label>Red<select value={tradeForm.network} onChange={(e) => {
            const nextNetwork = e.target.value
            const nextAssets = getAssetsByNetwork(nextNetwork)
            setTradeForm((s) => ({
              ...s,
              network: nextNetwork,
              asset: nextAssets.includes(s.asset) ? s.asset : nextAssets[0],
            }))
            setTradeTokenInfo({ loading: false, symbol: '', name: '', error: '' })
          }}>{networkOptions.map((network) => <option key={network}>{network}</option>)}</select></label>
          <label>Activo<select value={tradeForm.asset} onChange={(e) => setTradeForm((s) => ({ ...s, asset: e.target.value }))}>{tradeAssetOptions.map((asset) => <option key={asset} value={asset}>{asset === CUSTOM_TOKEN_VALUE ? 'Token personalizado' : asset}</option>)}</select></label>
          {tradeForm.asset === CUSTOM_TOKEN_VALUE && (
            <>
              <label>Direccion token<input placeholder="Contrato del token" value={tradeForm.customTokenAddress} onChange={(e) => {
                const value = e.target.value
                setTradeForm((s) => ({ ...s, customTokenAddress: value }))
                setTradeTokenInfo({ loading: false, symbol: '', name: '', error: '' })
              }} /></label>
              <label>Nombre token<input value={tradeTokenInfo.name} placeholder="Se detecta automaticamente" readOnly /></label>
              <label>Simbolo token<input value={tradeTokenInfo.symbol} placeholder="Se detecta automaticamente" readOnly /></label>
              {tradeTokenInfo.loading && <p className="status">Buscando simbolo...</p>}
              {!tradeTokenInfo.loading && tradeTokenInfo.error && <p className="error">{tradeTokenInfo.error}</p>}
            </>
          )}
          <label>Monto<input type="number" min="0" step="0.0001" value={tradeForm.amount} onChange={(e) => setTradeForm((s) => ({ ...s, amount: e.target.value }))} /></label>
          <label>Precio<input type="number" min="0" step="0.01" value={tradeForm.price} onChange={(e) => setTradeForm((s) => ({ ...s, price: e.target.value }))} /></label>
          <button type="submit" className="cta">Guardar trade</button>
        </form>

        <form className="panel" onSubmit={createOffer}>
          <h3>Nueva oferta P2P</h3>
          <label>Tipo<select value={offerForm.type} onChange={(e) => setOfferForm((s) => ({ ...s, type: e.target.value }))}><option value="buy">Compra</option><option value="sell">Venta</option></select></label>
          <label>Red<select value={offerForm.network} onChange={(e) => {
            const nextNetwork = e.target.value
            const nextAssets = getAssetsByNetwork(nextNetwork)
            setOfferForm((s) => ({
              ...s,
              network: nextNetwork,
              asset: nextAssets.includes(s.asset) ? s.asset : nextAssets[0],
            }))
            setOfferTokenInfo({ loading: false, symbol: '', name: '', error: '' })
          }}>{networkOptions.map((network) => <option key={network}>{network}</option>)}</select></label>
          <label>Activo<select value={offerForm.asset} onChange={(e) => setOfferForm((s) => ({ ...s, asset: e.target.value }))}>{offerAssetOptions.map((asset) => <option key={asset} value={asset}>{asset === CUSTOM_TOKEN_VALUE ? 'Token personalizado' : asset}</option>)}</select></label>
          {offerForm.asset === CUSTOM_TOKEN_VALUE && (
            <>
              <label>Direccion token<input placeholder="Contrato del token" value={offerForm.customTokenAddress} onChange={(e) => {
                const value = e.target.value
                setOfferForm((s) => ({ ...s, customTokenAddress: value }))
                setOfferTokenInfo({ loading: false, symbol: '', name: '', error: '' })
              }} /></label>
              <label>Nombre token<input value={offerTokenInfo.name} placeholder="Se detecta automaticamente" readOnly /></label>
              <label>Simbolo token<input value={offerTokenInfo.symbol} placeholder="Se detecta automaticamente" readOnly /></label>
              {offerTokenInfo.loading && <p className="status">Buscando simbolo...</p>}
              {!offerTokenInfo.loading && offerTokenInfo.error && <p className="error">{offerTokenInfo.error}</p>}
            </>
          )}
          <label>Fiat<select value={offerForm.fiat} onChange={(e) => setOfferForm((s) => ({ ...s, fiat: e.target.value }))}>{fiatOptions.map((fiat) => <option key={fiat}>{fiat}</option>)}</select></label>
          <label>Precio<input type="number" min="0" step="0.01" value={offerForm.price} onChange={(e) => setOfferForm((s) => ({ ...s, price: e.target.value }))} /></label>
          <label>Min<input type="number" min="0" step="0.01" value={offerForm.minAmount} onChange={(e) => setOfferForm((s) => ({ ...s, minAmount: e.target.value }))} /></label>
          <label>Max<input type="number" min="0" step="0.01" value={offerForm.maxAmount} onChange={(e) => setOfferForm((s) => ({ ...s, maxAmount: e.target.value }))} /></label>
          <label>Metodo de pago<select value={offerForm.paymentMethods} onChange={(e) => setOfferForm((s) => ({ ...s, paymentMethods: e.target.value }))}>{paymentMethodOptions.map((method) => <option key={method}>{method}</option>)}</select></label>
          <button type="submit" className="cta">Publicar oferta</button>
        </form>
      </section>

      <section className="tables">
        <article className="panel">
          <h3>Ultimos trades</h3>
          <ul>{trades.map((trade) => <li key={trade._id}>{trade.type.toUpperCase()} {trade.amount} {trade.asset} en {trade.network} (${trade.price}) {trade.tokenAddress ? `· ${trade.tokenAddress}` : ''}</li>)}</ul>
        </article>
        <article className="panel">
          <h3>Ofertas activas</h3>
          <ul>{offers.map((offer) => <li key={offer.id}>{offer.type.toUpperCase()} {offer.asset} {offer.network} · {offer.price} {offer.fiat} {offer.tokenAddress ? `· ${offer.tokenAddress}` : ''}</li>)}</ul>
        </article>
      </section>
    </main>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  )
}

export default App
