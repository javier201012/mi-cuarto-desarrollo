# ChainDesk MVP (Landing + Backoffice + Auth + P2P)

Proyecto full-stack con:

- Frontend: React + Vite
- Backend: Node.js + Express
- Base de datos: MongoDB Atlas (Mongoose)
- Auth: JWT + bcrypt

## Funcionalidades implementadas

- Landing page comercial para compra/venta crypto.
- Registro e inicio de sesion.
- Backoffice privado con metricas.
- Publicacion de ofertas P2P (buy/sell).
- Registro de operaciones (spot/p2p).
- Soporte base de redes principales: Bitcoin, Ethereum, BNB Chain, Polygon, Solana y Tron.

## Configuracion de entorno

1. Copia el archivo de ejemplo y crea `server/.env`:

```bash
cp server/.env.example server/.env
```

2. Define estas variables:

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
JWT_SECRET=replace-with-a-strong-secret
MONGODB_URI=your-mongodb-uri
```

Nota: si tu password de Mongo contiene `@`, debes codificarlo como `%40` en la URI.

## Scripts

- `npm run dev`: frontend Vite
- `npm run server`: backend API
- `npm run dev:full`: frontend + backend en paralelo
- `npm run build`: build frontend
- `npm run lint`: lint frontend + backend

## Ejecucion local

```bash
npm install
npm run dev:full
```

Frontend: `http://localhost:5173`
API: `http://localhost:4000`

## Endpoints principales

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/market/networks`
- `GET /api/p2p/offers`
- `POST /api/p2p/offers`
- `POST /api/trades`
- `GET /api/trades/mine`
- `GET /api/backoffice/metrics`

## Alcance del MVP

Este MVP cubre la capa de producto y operacion (landing + panel + auth + flujo de datos). No ejecuta swaps on-chain reales ni custodio de fondos. Para pasar a produccion debes integrar:

- Proveedor de liquidez/swap por red.
- Custodia o wallets conectadas.
- Motor de matching y escrow P2P.
- KYC/AML, seguridad avanzada y cumplimiento legal.
