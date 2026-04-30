export const GROWW_HLD = {
  title: "Groww — High Level Design",
  subtitle: "India's largest retail investment platform — 10M+ investors, stocks, mutual funds, F&O, real-time market data",
  overview: `Groww is India's largest retail investment platform with 10M+ active investors, processing lakhs of stock orders and SIP (Systematic Investment Plan) transactions daily. It democratised investing for first-time investors with a simple UX, zero-commission equity trading, and paperless KYC/account opening.

Core engineering challenges: real-time market data at microsecond granularity (NSE/BSE tick data), order management system (OMS) that interfaces with exchange trading APIs with strict latency SLAs, portfolio valuation running across millions of holdings with live prices, mutual fund NAV processing with cut-off time enforcement, and regulatory compliance (SEBI regulations, CDSL/NSDL depository integration for demat accounts).

Groww's stack is event-driven microservices on AWS, with Kafka at the centre for market data distribution and order event streaming.`,

  metrics: [
    { label: "Active investors", value: "10M+", note: "largest retail broker in India" },
    { label: "Daily order volume", value: "2M+", note: "equity + F&O orders" },
    { label: "Market data latency", value: "< 50ms", note: "tick-to-UI for NSE data" },
    { label: "SIP mandates", value: "5M+", note: "monthly auto-investments" },
    { label: "AUM (Mutual Funds)", value: "₹50,000Cr+", note: "assets under management" },
    { label: "Order placement SLA", value: "< 500ms", note: "client to exchange" },
    { label: "Portfolio refresh", value: "< 1s", note: "real-time during market hours" },
    { label: "Uptime (market hours)", value: "99.99%", note: "9:15 AM–3:30 PM IST" },
  ],

  diagram: `
┌──────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                  │
│            iOS App · Android App · Web (React) · API                 │
└────────────────────────┬─────────────────────────────────────────────┘
                         │  HTTPS / WebSocket (market data)
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  API GATEWAY (Kong / AWS ALB)                        │
│    Auth (JWT) · Rate Limiting · Routing · WebSocket Upgrade          │
└──┬──────────┬───────────┬──────────────┬─────────────────────────────┘
   │          │           │              │
   ▼          ▼           ▼              ▼
┌───────┐ ┌───────┐ ┌──────────┐ ┌────────────┐ ┌──────────────────┐
│ Order │ │ MF    │ │ Market   │ │ Portfolio  │ │ User & KYC       │
│  OMS  │ │Service│ │  Data    │ │  Service   │ │ Service          │
└───┬───┘ └───┬───┘ └────┬─────┘ └─────┬──────┘ └──────────────────┘
    │         │           │             │
    ▼         ▼           │             │
┌─────────────────┐       │             │
│  NSE / BSE      │       ▼             ▼
│  Exchange APIs  │ ┌─────────────────────────────────────────────┐
│  (FIX Protocol) │ │              KAFKA EVENT BUS                 │
└─────────────────┘ │  market.ticks · order.events · nav.updates  │
                    └─────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                   │
│  PostgreSQL (orders, holdings, users) · Redis (prices, sessions)     │
│  TimescaleDB / InfluxDB (tick data time-series) · S3 (statements)   │
│  Elasticsearch (fund search) · ClickHouse (analytics)               │
└──────────────────────────────────────────────────────────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "User Onboarding & KYC",
      sections: [
        {
          title: "Paperless KYC — Account Opening in 5 Minutes",
          content: `Opening a demat + trading account traditionally took 2 weeks of paperwork. Groww reduced it to 5 minutes with digital KYC.

KYC FLOW:
  1. Mobile number + email verification (OTP)
  2. PAN card entry → NSDL/CDSL API validates PAN → fetches basic details (name, DOB)
  3. Aadhaar-based eKYC:
     Option A: Aadhaar OTP (DigiLocker) — fastest, fully digital
     Option B: Aadhaar XML download → parse and verify offline
     Option C: Video KYC — live video call with Groww agent for verification
  4. Bank account linking → penny-drop verification (₹1 credit to verify IFSC + account number)
  5. Signature capture (digital, on-screen)
  6. Demat account creation at CDSL (Central Depository Services Limited) via API
  7. Trading account creation at NSE/BSE member level (Groww is a registered broker)

REGULATORY COMPLIANCE:
  SEBI mandates: re-KYC every 2 years, AML checks, risk profiling before derivatives trading
  PMLA compliance: politically exposed person (PEP) screening
  In-person verification (IPV) waived for Aadhaar-based eKYC (SEBI exemption)

DEMAT ACCOUNT:
  Each investor gets a unique DP ID + Client ID (16-digit Beneficiary Owner ID)
  Holdings stored at CDSL — Groww reads via CDSL API (not in own DB)
  Groww maintains shadow copy for portfolio display (synced nightly via CDSL reconciliation)`,
        },
        {
          title: "Risk Profiling & Product Eligibility",
          content: `SEBI mandates that brokers assess investor risk appetite before enabling certain products.

RISK ASSESSMENT QUESTIONNAIRE:
  6–8 questions: investment horizon, income, existing investments, loss tolerance
  Score maps to: Conservative / Moderate / Aggressive
  Conservative investors: only equity and debt mutual funds enabled
  Moderate: equity, MF, ETFs enabled
  Aggressive: all products including F&O enabled (after additional income proof)

F&O ACTIVATION:
  Futures & Options requires: annual income > ₹5 lakh (SEBI rule)
  Income proof: Form 16 / ITR / bank statement upload
  SEBI mandatory test: 20-question derivatives knowledge test (pass = 80%)
  Net-worth declaration for margin trading

PRODUCT ELIGIBILITY MATRIX:
  Equity delivery: all verified accounts
  Equity intraday: all accounts (margin auto-calculated)
  Mutual funds: all accounts, no extra step
  F&O: income proof + SEBI test
  IPO applications: linked bank account with ASBA mandate`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Real-Time Market Data",
      sections: [
        {
          title: "Tick Data Pipeline — NSE/BSE to Client in < 50ms",
          content: `Market data is the heartbeat of a trading platform. Every price displayed, every portfolio value computed, every order triggered — all depend on tick data.

DATA SOURCES:
  NSE (National Stock Exchange): primary exchange, ~90% of India's equity volume
  BSE (Bombay Stock Exchange): secondary, used for price discovery and some SME stocks
  MCX: commodity derivatives (gold, crude oil, etc.)

NSE DATA FEED:
  Groww connects to NSE's co-location facility (co-lo) in Mumbai for raw feed
  Protocol: FAST (FIX Adapted for STreaming) + UDP multicast
  Tick rate: ~50,000 messages/second during market peak (9:15–9:45 AM is highest)
  Fields per tick: symbol, LTP (last traded price), bid, ask, volume, open, high, low, close

PIPELINE:
  1. Feed handler (C++ process in co-lo): receives UDP multicast, decodes FAST messages
  2. Normaliser: maps NSE instrument tokens to Groww internal symbol IDs
  3. Kafka producer: publishes to topic market.ticks (partitioned by symbol)
     Throughput: 50K msgs/sec → Kafka handles easily
  4. Kafka consumers:
     a. Price cache writer → Redis HMSET symbol:{id} price:{ltp} bid:{bid} ask:{ask}
     b. Portfolio valuer → recomputes holdings value for investors holding this symbol
     c. Alert engine → checks price alerts set by investors
     d. Chart data writer → TimescaleDB for OHLC candle aggregation

CLIENT DELIVERY:
  WebSocket connections: one per active client (up to 2M concurrent during peak)
  Client subscribes to symbols on connect: {"subscribe": ["RELIANCE", "INFY", "NIFTY50"]}
  Server pushes on every tick for subscribed symbols
  Fan-out architecture: symbol update → Redis pub/sub → WebSocket servers → clients`,
        },
        {
          title: "Chart Data & Technical Indicators",
          content: `Charts are the most-viewed feature for active traders. OHLC data must be available from 1-minute to monthly timeframes.

CANDLE COMPUTATION:
  Intraday (1min, 5min, 15min, 1hr): computed from real-time ticks
  Each incoming tick: update the current open candle
    open  = first tick in interval
    high  = max(ticks in interval)
    low   = min(ticks in interval)
    close = last tick in interval
    volume = sum of traded quantities in interval

  Implementation: Redis sorted set per symbol per interval
    Key: candles:{symbol}:{interval}  Score: timestamp  Value: {O,H,L,C,V}
    Candle finalised at interval boundary → moved to TimescaleDB for persistence

HISTORICAL DATA:
  TimescaleDB (PostgreSQL extension): purpose-built for time-series
  Continuous aggregates: 1min candles auto-aggregate to 5min, 15min, 1hr, 1D
  Retention policy: 1-min data → 3 months. 1-hr data → 5 years. Daily → forever
  API: GET /v1/charts/{symbol}?interval=5m&from=2026-04-01&to=2026-04-30

TECHNICAL INDICATORS (server-side for consistency):
  SMA, EMA, RSI, MACD, Bollinger Bands computed from candle data
  Pre-computed for popular symbols and intervals, cached in Redis
  Custom indicators: computed on-demand from raw candle data`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Order Management System (OMS)",
      sections: [
        {
          title: "Order Placement to Exchange in Under 500ms",
          content: `An OMS is the critical path of a broker. Every order must reach the exchange within milliseconds — too slow and the price has moved.

ORDER TYPES:
  Market order: buy/sell at best available price immediately
  Limit order: buy/sell only at specified price or better
  Stop-loss: trigger a market/limit order when price crosses a threshold
  GTD (Good Till Date): limit order valid for multiple days
  AMO (After Market Order): placed after market hours, executed at open

ORDER LIFECYCLE:
  1. Client submits order (HTTP POST) → API Gateway → OMS
  2. OMS validates: funds available? (margin check) · symbol tradeable? · quantity valid?
  3. If valid: write order to DB with status=PENDING, publish to Kafka: order.placed
  4. Exchange Adapter receives from Kafka → sends to NSE/BSE via FIX protocol
  5. Exchange acknowledges: order status = OPEN (in order book)
  6. Exchange fills: order status = EXECUTED (or PARTIALLY_EXECUTED)
  7. Exchange adapter publishes: order.executed to Kafka
  8. OMS consumer: updates order status, updates holdings, releases/deducts funds
  9. Push notification to client: "Order executed at ₹2,450"

MARGIN MANAGEMENT:
  Cash equity: need 100% of order value in account (SEBI rule for delivery)
  Intraday equity: need ~20% margin (leverage, closes by 3:15 PM or auto-squared)
  F&O: SPAN + exposure margin as calculated by exchange daily
  Margin check is synchronous and must be < 50ms (Redis-based available-funds lookup)`,
        },
        {
          title: "FIX Protocol & Exchange Connectivity",
          content: `FIX (Financial Information eXchange) is the industry standard protocol for order routing to exchanges.

FIX SESSION:
  Groww maintains persistent FIX sessions with NSE/BSE
  Session-level messages: Logon, Heartbeat (30s), Logout
  Application-level: NewOrderSingle (place), OrderCancelRequest, ExecutionReport (fill)

NSE ORDER ENTRY API:
  Groww uses NSE's NEAT (National Exchange for Automated Trading) API
  Two paths:
    Primary: co-location link (lowest latency, < 1ms to exchange matching engine)
    Backup: standard leased line (< 5ms, used if co-lo fails)

EXECUTION REPORT (fill notification from exchange):
  Tag 39 (OrdStatus): 0=New, 1=PartialFill, 2=Filled, 4=Cancelled, 8=Rejected
  Tag 14 (CumQty): total quantity filled so far
  Tag 6 (AvgPx): average fill price

RISK CHECKS (pre-exchange):
  Price bands: NSE enforces circuit limits (±20% on most stocks)
  Quantity limits: max order quantity per symbol (to prevent fat-finger errors)
  Duplicate order check: same symbol, quantity, price within 1 second = potential duplicate, warn user

ORDER BOOK MANAGEMENT:
  Groww maintains its own copy of open orders per user
  Reconciled against NSE order dump at EOD (End of Day)
  Discrepancies trigger alert to operations team for manual resolution`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Mutual Funds & SIP Engine",
      sections: [
        {
          title: "Mutual Fund Transaction Processing",
          content: `Mutual fund (MF) transactions are fundamentally different from stock trades — they're processed once a day at NAV (Net Asset Value), not in real-time.

TRANSACTION FLOW:
  1. Investor places buy/redeem order via Groww app
  2. Groww submits to RTA (Registrar & Transfer Agent — CAMS or KFintech) via BSE StAR MF platform
  3. If order received before 3 PM: today's NAV applies
     If received after 3 PM: next business day's NAV applies (cut-off time enforcement is critical)
  4. RTA processes at EOD: confirms units allotted + allotment price (NAV)
  5. Debit from investor account (NACH/UPI mandate) processed T+1 or T+2
  6. Folio number created at AMC (Asset Management Company) — e.g. HDFC, SBI, Mirae

NAV PROCESSING:
  AMCs publish NAV daily by 9 PM (SEBI mandate)
  Groww ingests NAV feed from AMFI (Association of Mutual Funds of India) via API
  Kafka topic: nav.updates → consumers: portfolio valuer, order confirmation updater
  Redis updated: mf:nav:{isin} → latest NAV value

CUT-OFF TIME ENFORCEMENT:
  3:00 PM IST for liquid funds (same-day NAV)
  3:00 PM IST for equity/debt funds
  System clock-based enforcement: orders timestamped, server-side time authoritative
  Orders submitted at 2:59:59 PM vs 3:00:01 PM get different NAVs — precision matters`,
        },
        {
          title: "SIP Engine — 5 Million Auto-Investments Monthly",
          content: `SIP (Systematic Investment Plan) is the backbone of retail MF investing — a fixed amount invested every month automatically.

SIP MANDATE:
  Investor sets up: fund, amount, date, frequency (monthly/weekly/quarterly)
  Bank mandate created via NACH (National Automated Clearing House) or UPI AutoPay
  Mandate authorised once → bank auto-debits on schedule

SIP SCHEDULER:
  Distributed cron job running in Kubernetes CronJob
  Daily at 2 AM: query active SIPs due today → generate order events
  Partitioned processing: SIPs sharded by investor_id → no single point of contention
  Idempotency: SIP execution uses (sip_id + execution_date) as unique key

SIP EXECUTION PIPELINE:
  1. Scheduler emits sip.due events to Kafka
  2. Consumer validates mandate is active, fund is available, investor KYC valid
  3. Order submitted to RTA (same as manual MF purchase)
  4. Payment debit triggered (NACH or UPI collect request)
  5. On mandate failure (insufficient funds): retry after 3 days → 3 retries → notify investor
  6. Push notification: "Your ₹5,000 SIP in Mirae Asset Emerging Bluechip Fund is invested"

PAUSE/RESUME:
  Investor can pause SIP for 1–6 months without cancelling mandate
  Scheduler checks pause status before emitting sip.due
  Paused SIPs still show in dashboard with "Paused" status and next resume date`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "Portfolio & Holdings",
      sections: [
        {
          title: "Real-Time Portfolio Valuation at Scale",
          content: `10M investors × average 15 holdings each = 150M holdings to value in real-time during market hours.

THE CHALLENGE:
  Market hours: 9:15 AM – 3:30 PM IST
  Every tick update → portfolio value of everyone holding that stock changes
  Cannot compute all 150M valuations on every tick (thousands of ticks/second)

LAZY VALUATION (primary approach):
  Holdings stored in Redis: investor:{id}:holdings → {symbol: quantity, avg_cost}
  Current prices stored: price:{symbol} → {ltp, prev_close}
  Portfolio value = Σ (quantity × current_price) computed on-demand when investor opens app
  Redis MGET for all symbols in portfolio → one round trip → compute locally
  Result cached for 1 second (TTL) — stale by at most one price update

PUSH VALUATION (for active users):
  Investor has app open → WebSocket connection active
  On each tick for a subscribed symbol: compute P&L for holdings of that symbol
  Push to investor: {symbol, current_price, day_pnl, overall_pnl}
  Triggered only for symbols investor holds — no wasted computation

UNREALISED P&L COMPUTATION:
  Avg cost = weighted average of all buy transactions for a symbol (FIFO for tax)
  Unrealised P&L = (current_price - avg_cost) × quantity
  Day P&L = (current_price - previous_close) × quantity

HOLDINGS SOURCE OF TRUTH:
  CDSL is the actual source of truth (regulatory)
  Groww maintains a shadow copy in PostgreSQL (updated on every order execution)
  Nightly reconciliation: Groww holdings vs CDSL holdings → alert on discrepancy
  Discrepancy types: corporate actions (bonus, split, dividend) not yet processed`,
        },
        {
          title: "Corporate Actions & Tax Processing",
          content: `Corporate actions — stock splits, bonus issues, dividends, rights issues — require automated adjustment of holdings and cost basis.

CORPORATE ACTIONS:
  Stock split (e.g. 10:1): quantity × 10, avg_price / 10
  Bonus issue (e.g. 1:1): quantity × 2, avg_price / 2
  Dividend: cash credit to investor account (Groww wallet or bank)
  Rights issue: investor offered new shares at discount — must accept/decline within window
  Merger/demerger: complex — old holding replaced by new holding(s)

DATA SOURCE:
  NSE corporate action calendar (XML feed, updated daily)
  Kafka consumer: processes corporate action events → updates all affected holdings
  Audit log: every adjustment logged with reason, old value, new value

CAPITAL GAINS TAX:
  STCG (Short-term Capital Gains): < 1 year holding → taxed at 15%
  LTCG (Long-term Capital Gains): > 1 year holding → taxed at 10% above ₹1 lakh/year
  Mutual funds: different thresholds per fund type (equity vs debt)

TAX P&L REPORT:
  Generated on demand for each financial year (April–March in India)
  FIFO method: oldest units sold first for LTCG/STCG calculation
  Downloadable as PDF + Excel → pre-filled for CA submission
  Computed from full transaction history — expensive query, pre-computed nightly in ClickHouse`,
        },
      ],
    },
    {
      id: "phase6",
      label: "Phase 6",
      title: "IPO, Scale & Compliance",
      sections: [
        {
          title: "IPO Applications — ASBA Flow",
          content: `IPOs (Initial Public Offerings) attract massive traffic spikes — a popular IPO sees millions of applications in 3 days.

ASBA (Application Supported by Blocked Amount):
  Investor's money is blocked (not debited) in their bank account during the IPO subscription period
  If allotted: blocked amount debited on allotment date
  If not allotted: block released — no interest lost, no failed payment reconciliation
  Groww submits applications to exchange (BSE/NSE) via UPI mandate or ASBA bank

GROWW'S ROLE:
  Investor fills IPO application → Groww submits to exchange via UPI mandate
  Exchange collects applications → sends to registrar (e.g. KFintech/CAMS)
  Registrar runs lottery (oversubscribed IPOs) → allotment result
  Groww fetches allotment result → notifies investors → holdings updated

TRAFFIC SPIKE HANDLING:
  Popular IPO (Zomato, LIC, Hyundai India): millions of applications on day 1 and day 3
  Pre-scaled: Kubernetes HPA based on pending queue depth
  Queue-based architecture: application → Kafka → processor (rate-limited to exchange SLA)
  User sees: "Application submitted, processing..." → push notification when confirmed

LOAD PATTERN:
  Day 1 morning + Day 3 evening = peak load (10–50× normal traffic)
  Static pages (IPO details): CloudFront CDN, no origin hits
  Application submission: queued in Kafka, processed at sustainable rate`,
        },
        {
          title: "Compliance, Audit & System Reliability",
          content: `SEBI (Securities Exchange Board of India) regulation shapes every architectural decision at Groww.

REGULATORY REQUIREMENTS:
  Order audit trail: every order state change logged with timestamp, user, reason — stored 7 years
  Trade confirmation: email/SMS within 30 minutes of trade execution (SEBI mandate)
  Contract notes: legally binding trade confirmation issued T+1, stored in investor account
  Client fund segregation: client money kept separate from Groww's own funds (SEBI rule)
  Investor complaints: SCORES portal integration — complaints visible to SEBI

DATA RESIDENCY:
  All investor data stored in India (SEBI + RBI regulations)
  AWS Mumbai (ap-south-1) primary region
  AWS Hyderabad (ap-south-2) disaster recovery

MARKET HOURS RELIABILITY:
  9:15 AM–3:30 PM IST: all systems must be operational → no deployments during market hours
  Deployment windows: 5 PM–8 AM only (pre-market from 9 AM–9:15 AM is also frozen)
  Incident SLA: P0 (order placement broken) → page on-call within 2 minutes, resolve within 15 minutes
  Circuit breakers: if OMS error rate > 1% → auto-rollback to previous version

EOD PROCESSING:
  3:30 PM: market closes → EOD jobs kick off
  Holdings reconciliation with CDSL
  P&L computation for all investors
  Contract note generation and email delivery
  Risk report generation for compliance team
  Next-day margin file sent to exchange`,
        },
      ],
    },
  ],
};

export const GROWW_LLD = {
  title: "Groww — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of core Groww services",

  components: [
    {
      id: "omsService",
      title: "Order Management System (OMS) — LLD",
      description: "Order lifecycle from placement through exchange execution with margin enforcement and real-time status updates",
      api: `POST /v1/orders
Authorization: Bearer {jwt}

{
  "symbol": "NSE:RELIANCE",
  "transaction_type": "BUY",            // BUY / SELL
  "order_type": "LIMIT",               // MARKET / LIMIT / SL / SL-M
  "product": "CNC",                    // CNC (delivery) / MIS (intraday) / NRML (F&O)
  "quantity": 10,
  "price": 2450.00,                    // required for LIMIT orders
  "trigger_price": null,               // required for SL orders
  "validity": "DAY",                   // DAY / IOC / GTD
  "tag": "mobile_app"
}

Response 200:
{
  "order_id": "GRW20260430000123456",
  "exchange_order_id": "1100000012345678",
  "status": "OPEN",
  "message": "Order placed successfully",
  "placed_at": "2026-04-30T09:16:42.123Z"
}

Response 400 (insufficient funds):
{
  "error": "INSUFFICIENT_MARGIN",
  "required_margin": 24500.00,
  "available_margin": 18000.00,
  "shortfall": 6500.00
}

-- Order Schema --
CREATE TABLE orders (
  order_id          TEXT PRIMARY KEY,     -- GRW{YYYYMMDD}{sequence}
  exchange_order_id TEXT,                 -- assigned by NSE/BSE
  user_id           UUID NOT NULL,
  symbol            TEXT NOT NULL,
  exchange          TEXT NOT NULL,        -- NSE / BSE
  transaction_type  TEXT NOT NULL,        -- BUY / SELL
  order_type        TEXT NOT NULL,
  product           TEXT NOT NULL,
  quantity          INT NOT NULL,
  filled_quantity   INT DEFAULT 0,
  price             NUMERIC(12,2),
  trigger_price     NUMERIC(12,2),
  avg_price         NUMERIC(12,2),        -- weighted avg fill price
  status            TEXT DEFAULT 'PENDING',
  -- PENDING→OPEN→PARTIALLY_EXECUTED→EXECUTED / CANCELLED / REJECTED
  validity          TEXT DEFAULT 'DAY',
  tag               TEXT,
  placed_at         TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  INDEX (user_id, placed_at DESC),
  INDEX (status, placed_at)              -- for EOD reconciliation
);`,
    },
    {
      id: "marketDataService",
      title: "Market Data Service — LLD",
      description: "Real-time tick ingestion, WebSocket fan-out to millions of clients, and OHLC candle computation",
      api: `-- WebSocket Connection --
wss://data.groww.in/v1/stream
Authorization: Bearer {jwt}

-- Subscribe --
Client → Server:
{ "action": "subscribe", "symbols": ["NSE:RELIANCE", "NSE:INFY", "NSE:NIFTY50"] }

Server → Client (on every tick for subscribed symbols):
{
  "symbol": "NSE:RELIANCE",
  "ltp": 2451.50,
  "open": 2430.00,
  "high": 2460.00,
  "low": 2425.00,
  "prev_close": 2440.00,
  "change": 11.50,
  "change_pct": 0.47,
  "volume": 1234567,
  "bid": 2451.00,
  "ask": 2452.00,
  "timestamp": "2026-04-30T10:15:42.123Z"
}

-- REST: Historical OHLC --
GET /v1/market/candles?symbol=NSE:RELIANCE&interval=5m&from=2026-04-29T09:15:00Z&to=2026-04-30T15:30:00Z

Response:
{
  "symbol": "NSE:RELIANCE",
  "interval": "5m",
  "candles": [
    { "ts": "2026-04-29T09:15:00Z", "o": 2430, "h": 2440, "l": 2425, "c": 2438, "v": 456789 },
    { "ts": "2026-04-29T09:20:00Z", "o": 2438, "h": 2445, "l": 2435, "c": 2442, "v": 234567 }
  ]
}

-- Redis Price Cache --
HMSET market:price:NSE:RELIANCE
  ltp         2451.50
  open        2430.00
  high        2460.00
  low         2425.00
  prev_close  2440.00
  volume      1234567
  updated_at  1746000000000

-- TimescaleDB Candle Table --
CREATE TABLE candles (
  symbol    TEXT        NOT NULL,
  interval  TEXT        NOT NULL,   -- 1m, 5m, 15m, 1h, 1d
  ts        TIMESTAMPTZ NOT NULL,
  open      NUMERIC(12,4),
  high      NUMERIC(12,4),
  low       NUMERIC(12,4),
  close     NUMERIC(12,4),
  volume    BIGINT,
  PRIMARY KEY (symbol, interval, ts)
);
SELECT create_hypertable('candles', 'ts');`,
    },
    {
      id: "portfolioService",
      title: "Portfolio Service — LLD",
      description: "Holdings management, real-time P&L computation, and CDSL reconciliation",
      api: `GET /v1/portfolio
Authorization: Bearer {jwt}

Response:
{
  "total_value": 485230.50,
  "total_invested": 420000.00,
  "total_pnl": 65230.50,
  "total_pnl_pct": 15.53,
  "day_pnl": 2150.00,
  "day_pnl_pct": 0.45,
  "holdings": [
    {
      "symbol": "NSE:RELIANCE",
      "quantity": 20,
      "avg_cost": 2200.00,
      "current_price": 2451.50,
      "current_value": 49030.00,
      "invested_value": 44000.00,
      "pnl": 5030.00,
      "pnl_pct": 11.43,
      "day_pnl": 230.00,
      "day_pnl_pct": 0.47
    }
  ],
  "mutual_funds": [...]
}

-- Holdings Schema --
CREATE TABLE holdings (
  user_id       UUID        NOT NULL,
  symbol        TEXT        NOT NULL,
  exchange      TEXT        NOT NULL,
  quantity      INT         NOT NULL,
  avg_cost      NUMERIC(12,4) NOT NULL,
  isin          TEXT,
  last_updated  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, symbol, exchange)
);

CREATE TABLE transactions (
  txn_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  order_id      TEXT REFERENCES orders(order_id),
  symbol        TEXT NOT NULL,
  exchange      TEXT NOT NULL,
  txn_type      TEXT NOT NULL,         -- BUY / SELL / BONUS / SPLIT / DIVIDEND
  quantity      INT  NOT NULL,
  price         NUMERIC(12,4),
  amount        NUMERIC(14,2),
  charges       NUMERIC(10,2),         -- brokerage + STT + GST + stamp duty
  executed_at   TIMESTAMPTZ,
  settlement_date DATE,                -- T+1 for equity delivery
  INDEX (user_id, executed_at DESC)
);

-- Real-time P&L (Redis, computed on holding update) --
HMSET portfolio:{user_id}:holding:NSE:RELIANCE
  quantity      20
  avg_cost      2200.00
  day_pnl       230.00
  total_pnl     5030.00
  updated_at    1746000000000`,
    },
    {
      id: "mfService",
      title: "Mutual Fund Service — LLD",
      description: "MF order routing to RTA, NAV processing, SIP scheduling and folio management",
      api: `POST /v1/mf/orders
{
  "fund_isin": "INF209K01157",         // Mirae Asset Emerging Bluechip - Direct Growth
  "transaction_type": "PURCHASE",     // PURCHASE / REDEMPTION / SWITCH
  "amount": 5000.00,                  // for PURCHASE (in rupees)
  "units": null,                      // or specify units for REDEMPTION
  "folio_number": "12345678/67",      // null if first purchase
  "payment_mode": "UPI"              // UPI / NETBANKING / NACH
}

Response:
{
  "order_id": "MFO20260430001234",
  "bse_order_id": "BSESTARMF123456",
  "status": "SUBMITTED",
  "applicable_nav_date": "2026-04-30",
  "nav_cutoff": "15:00:00 IST",
  "estimated_units": null,            // confirmed after NAV published (by 9 PM)
  "estimated_amount": 5000.00
}

-- SIP Schema --
CREATE TABLE sips (
  sip_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL,
  fund_isin      TEXT NOT NULL,
  folio_number   TEXT,
  amount         NUMERIC(10,2) NOT NULL,
  frequency      TEXT NOT NULL,         -- MONTHLY / WEEKLY / QUARTERLY
  sip_date       INT  NOT NULL,         -- day of month (1-28)
  start_date     DATE NOT NULL,
  end_date       DATE,                  -- null = perpetual
  status         TEXT DEFAULT 'ACTIVE', -- ACTIVE / PAUSED / CANCELLED
  mandate_id     TEXT,                  -- NACH/UPI mandate reference
  next_exec_date DATE,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sip_executions (
  exec_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sip_id         UUID REFERENCES sips(sip_id),
  scheduled_date DATE NOT NULL,
  order_id       TEXT,
  amount         NUMERIC(10,2),
  status         TEXT DEFAULT 'PENDING', -- PENDING / SUCCESS / FAILED / SKIPPED
  failure_reason TEXT,
  executed_at    TIMESTAMPTZ,
  UNIQUE (sip_id, scheduled_date)       -- idempotency: one execution per SIP per date
);`,
    },
    {
      id: "marginService",
      title: "Margin Service — LLD",
      description: "Real-time margin computation, funds ledger and intraday auto-square-off",
      api: `GET /v1/margin
Authorization: Bearer {jwt}

Response:
{
  "available_margin": 18500.00,
  "used_margin": 6500.00,
  "total_margin": 25000.00,
  "collateral_margin": 0.00,          // from pledged securities
  "breakdown": {
    "equity_delivery_blocked": 0,
    "equity_intraday_blocked": 4500.00,
    "fno_span_margin": 2000.00
  }
}

POST /v1/margin/check
{
  "symbol": "NSE:RELIANCE",
  "transaction_type": "BUY",
  "quantity": 10,
  "order_type": "LIMIT",
  "price": 2450,
  "product": "MIS"
}

Response:
{
  "required_margin": 4900.00,
  "available_margin": 18500.00,
  "is_sufficient": true,
  "margin_after_order": 13600.00
}

-- Funds Ledger Schema --
CREATE TABLE ledger_entries (
  entry_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  type          TEXT NOT NULL,
  -- DEPOSIT / WITHDRAWAL / TRADE_BUY / TRADE_SELL / CHARGE / DIVIDEND / REFUND
  amount        NUMERIC(14,2) NOT NULL,  -- positive = credit, negative = debit
  balance_after NUMERIC(14,2) NOT NULL,
  reference_id  TEXT,                    -- order_id / txn_id / bank_ref
  narration     TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  INDEX (user_id, created_at DESC)
);

-- Available margin (Redis, real-time) --
KEY: margin:{user_id}:available  VALUE: 18500.00  (float, updated on every ledger entry)
KEY: margin:{user_id}:blocked    VALUE: 6500.00   (sum of open order margin holds)

-- Intraday Auto-Squareoff (3:15 PM) --
1. Query all open MIS positions
2. For each: place MARKET SELL order if BUY, MARKET BUY if SELL
3. Track execution → update holdings and margin
4. Penalty charged if position auto-squared (SEBI rule: broker must square off)`,
    },
    {
      id: "notificationService",
      title: "Notification & Alert Service — LLD",
      description: "Price alerts, order notifications, SIP reminders and compliance trade confirmations",
      api: `-- Set Price Alert --
POST /v1/alerts
{
  "symbol": "NSE:RELIANCE",
  "condition": "ABOVE",              // ABOVE / BELOW / PERCENT_CHANGE
  "value": 2500.00,
  "notification_channel": ["push", "email"]
}

-- Alert Engine (Kafka consumer) --
Topic: market.ticks
For each tick:
  1. GET active_alerts:{symbol} from Redis → list of {user_id, condition, value}
  2. For each alert: evaluate condition against tick price
  3. If triggered:
     - Mark alert as fired: SET alert:{alert_id}:fired 1 EX 86400
     - Publish to Kafka: alert.triggered
     - Consumer: send push + email

-- Order Notification (SEBI mandated, within 30 min of execution) --
Kafka consumer: order.executed
  1. Fetch order details
  2. Push notification: "Order EXECUTED: Bought 10 RELIANCE @ ₹2,451.50"
  3. Email: trade confirmation with all charges breakdown
  4. Generate contract note (legal document): PDF → S3 → linked in investor account

-- Alert Schema (Redis) --
SET alerts:NSE:RELIANCE  [
  { "alert_id": "alrt_abc", "user_id": "uuid", "condition": "ABOVE", "value": 2500 },
  { "alert_id": "alrt_xyz", "user_id": "uuid", "condition": "BELOW", "value": 2400 }
]
-- Stored as JSON in Redis sorted set, keyed by symbol for O(1) lookup on tick --

-- Notification Log (PostgreSQL) --
CREATE TABLE notification_log (
  notif_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  type          TEXT NOT NULL,   -- ORDER_EXEC / PRICE_ALERT / SIP_EXECUTED / MARGIN_CALL
  channel       TEXT NOT NULL,   -- push / email / sms
  title         TEXT,
  body          TEXT,
  reference_id  TEXT,
  sent_at       TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  status        TEXT DEFAULT 'PENDING'
);`,
    },
  ],
};

export const GROWW_QNA = [
  {
    id: "gq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Groww", "Zerodha", "Upstox"],
    question: "Design a stock trading platform like Groww. What are the key components?",
    answer: `A stock trading platform has two distinct worlds: real-time (market data, order execution) and batch (portfolio, tax, settlements).

KEY COMPONENTS:

1. MARKET DATA SERVICE:
   NSE tick feed (FAST protocol) → Feed handler → Kafka → Redis price cache
   WebSocket server pushes price updates to subscribed clients
   Candle computation: Redis for live candles, TimescaleDB for historical
   Fan-out challenge: 2M connected users × subscribed symbols = careful design needed

2. ORDER MANAGEMENT SYSTEM (OMS):
   Order placement → margin check (Redis) → Kafka → Exchange adapter → FIX to NSE
   Exchange sends execution report → Kafka → holdings update → push notification
   Exactly-once: every order has unique ID, exchange acknowledges all state transitions

3. PORTFOLIO SERVICE:
   Holdings: shadow copy in PostgreSQL, source of truth at CDSL
   Real-time valuation: lazy (compute on request from Redis prices) + push for active users
   Nightly: reconcile with CDSL, compute P&L, generate tax reports

4. MUTUAL FUND SERVICE:
   Routes to RTA via BSE StAR MF platform
   Cut-off time enforcement: 3 PM IST — orders before get today's NAV
   SIP scheduler: distributed cron, Kafka-based, idempotent execution

5. MARGIN SERVICE:
   Redis-based available margin: updated on every order placement and execution
   Intraday auto-square-off at 3:15 PM: forced market orders on all open MIS positions

REGULATORY CONSTRAINTS (drive architecture):
   No deployments during market hours (9:15 AM–3:30 PM)
   Order audit trail: 7-year retention
   Trade confirmation: SEBI mandates within 30 minutes of execution`,
  },
  {
    id: "gq2",
    category: "Real-time Systems",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Groww", "Zerodha", "Angel One"],
    question: "How do you distribute real-time stock prices to 2 million concurrent users with low latency?",
    answer: `This is a pub-sub fan-out problem at scale. The key insight: most users are interested in a small subset of the 2000+ tradeable symbols.

ARCHITECTURE:

Tick ingestion:
  NSE co-location → UDP multicast → Feed handler (C++) → Kafka topic: market.ticks
  Partitioned by symbol → parallel consumption
  Throughput: ~50,000 ticks/second at market open

Price cache:
  Kafka consumer → Redis HMSET market:price:{symbol} → LTP, bid, ask, O/H/L/C, volume
  Redis as the central price store — all services read from here

WebSocket tier:
  Stateful WebSocket servers (not HTTP servers)
  Each server maintains: Map<symbol, Set<websocket_connection>>
  On client subscribe message: add connection to symbol's subscription set
  On Redis pub/sub message for symbol: push to all connections in that set

Redis pub/sub bridge:
  Kafka consumer (separate from price cache consumer) → Redis PUBLISH market:tick:{symbol} {data}
  Each WebSocket server subscribes to channels for symbols its clients care about
  SUBSCRIBE market:tick:RELIANCE → pushed when any RELIANCE tick arrives

SCALING:
  Problem: 2M connections × average 5 subscribed symbols = 10M subscriptions
  Solution: Consistent hashing of symbols to WebSocket servers
    RELIANCE ticks → server shard 3 (all RELIANCE subscribers must connect here)
  Client connection: GET /v1/stream/endpoint?symbols=RELIANCE,INFY → returns correct server URL

BACK-PRESSURE:
  Slow clients (mobile on 2G): server-side buffer with max 100 messages
  If buffer full: drop oldest tick (price data is always superseded by newer)
  Client reconnect: pulls latest price via REST to catch up`,
  },
  {
    id: "gq3",
    category: "Data Modelling",
    difficulty: "Medium",
    round: "Technical Interview",
    asked_at: ["Groww", "Zerodha", "Upstox"],
    question: "How do you compute portfolio P&L for 10 million investors in real-time?",
    answer: `This is a read-heavy, latency-sensitive computation. The answer is lazy evaluation + push for active sessions.

APPROACH 1 — LAZY (used for most investors):
  Holdings: Redis hash per investor (symbol → quantity, avg_cost)
  Prices: Redis hash per symbol (LTP, prev_close)
  On request: MGET all prices for investor's symbols → compute P&L locally
  Total: 1–2 Redis round trips regardless of portfolio size
  Cache result for 1 second (TTL) — investor doesn't need millisecond freshness

APPROACH 2 — PUSH (for active app users):
  Client has WebSocket open → server knows which investors are active
  Active investor subscribes to their holding symbols
  On every tick for a symbol:
    Fetch all investors holding that symbol (small set — < 5000 per symbol)
    Compute incremental P&L change for each: Δpnl = (new_ltp - old_ltp) × quantity
    Push update to those investors via WebSocket

HOLDINGS INDEX (for push):
  For each symbol, maintain: SET holders:{symbol} → {user_id, quantity} (Redis sorted set)
  Updated on every order execution
  On tick: SMEMBERS holders:{symbol} → get affected investors → push updates

SCALE ANALYSIS:
  2000 symbols × 5000 holders average = 10M holdings
  1000 ticks/second × 5000 holders = 5M computations/second
  Each computation: multiplication + subtraction → microseconds
  50 WebSocket servers × 100K connections each = 5M concurrent connections
  Feasible: dedicated push tier, no DB reads on tick path

TRADE-OFF:
  Lazy: simpler, scales infinitely, slightly stale (1s)
  Push: complex, hot path must be fast, always fresh
  Use lazy by default, push only when WebSocket is active`,
  },
  {
    id: "gq4",
    category: "Reliability",
    difficulty: "Hard",
    round: "System Design Screen",
    asked_at: ["Groww", "Zerodha", "HDFC Securities"],
    question: "What happens if Groww's OMS goes down during market hours?",
    answer: `OMS downtime during market hours means investors cannot place or cancel orders — potentially catastrophic if they have open positions.

PREVENTION:

High availability:
  OMS: 3+ instances behind load balancer, Kubernetes with pod disruption budget (max 1 unavailable)
  Exchange connectivity: dual paths to NSE (co-location primary + leased line backup)
  No single-instance services on order critical path — everything runs ≥ 3 replicas

Database: PostgreSQL Multi-AZ, automatic failover < 60 seconds
Kafka: 3-broker cluster with replication factor 3

DETECTION:
  Health checks every 5 seconds (order placement latency > 500ms → unhealthy)
  PagerDuty alert: P0 page if order error rate > 0.5% over 1 minute
  Exchange heartbeat monitoring: if FIX session drops → immediate alert

RECOVERY:

Scenario A — OMS instance failure:
  Load balancer health check removes failed instance automatically
  Other instances absorb traffic (designed for 50% overhead capacity)
  Pending orders in Kafka are processed by surviving instances
  Recovery: < 30 seconds, investor may experience brief slowness

Scenario B — Full OMS outage (all instances):
  Investors cannot place new orders — show banner: "Order placement temporarily unavailable"
  Existing open orders remain at exchange (not affected by Groww outage)
  Investors can call Groww support to cancel orders via exchange's risk management system
  Exchange has dealer terminals accessible to Groww's risk team for emergency order management

Scenario C — Exchange connectivity loss:
  Orders queued in Kafka with in-flight state
  On reconnect: replay queued orders
  If reconnect delayed > 5 minutes: automatic cancellation of queued orders, notify investors

COMMUNICATION:
  Status page (status.groww.in) updated within 2 minutes of incident
  In-app banner shown to all users during known degradation
  Post-incident: SEBI notification required for exchange connectivity failures`,
  },
  {
    id: "gq5",
    category: "Scale",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Groww", "Zerodha", "Paytm Money"],
    question: "How do you handle 5 million SIPs executing on the same date (1st of every month)?",
    answer: `The 1st of every month is Groww's highest load event — more SIPs trigger on the 1st than any other date (most investors default to 1st or 5th).

THE PROBLEM:
  5M SIPs × all triggering at midnight or 9 AM = thundering herd
  BSE StAR MF platform has rate limits (~500 orders/second)
  Processing 5M orders serially at 500/s = 10,000 seconds = 2.8 hours — too slow

SOLUTION — DISTRIBUTED SCHEDULER WITH RATE LIMITING:

Pre-computation (night before):
  Query: SELECT * FROM sips WHERE next_exec_date = tomorrow AND status = 'ACTIVE'
  Result: 5M SIP records
  Partition into buckets: 500 buckets of 10,000 SIPs each

Staggered execution (midnight to 2 PM — before 3 PM cut-off):
  Publish 10,000 sip.due events every 10 seconds to Kafka
  Rate: 1,000 events/second
  Processing rate: 500 MF orders/second to RTA (matches their SLA)
  Total time: 5M / 500 = 10,000 seconds ≈ 2.8 hours → starts at midnight, done by 3 AM

Consumer pool:
  50 SIP consumers processing from Kafka
  Each consumer: validate → check mandate → submit to BSE StAR MF → write result to DB
  Idempotency: unique key (sip_id + execution_date) prevents double-submission on retry

MANDATE FAILURE HANDLING:
  Bank returns: insufficient funds → mark execution FAILED
  Retry: same day at 12 PM → then 2 PM → then mark as missed
  Notification: "Your SIP payment of ₹5,000 failed — please add funds" push at failure

PAYMENT PROCESSING:
  UPI AutoPay: bank debits automatically on collect request — high success rate
  NACH: settled T+1 → funds blocked day before, released if mandate bounces
  Debit happens independent of order submission — even if order fails, debit is separate reconciliation`,
  },
  {
    id: "gq6",
    category: "Data Modelling",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Groww", "Zerodha", "Fyers"],
    question: "Design the database schema for a trading platform's order and holdings system.",
    answer: `The schema must support: real-time order tracking, accurate holdings (for SEBI compliance), P&L computation (FIFO for tax), and high-frequency reads during market hours.

ORDERS TABLE:
CREATE TABLE orders (
  order_id          TEXT PRIMARY KEY,      -- GRW{YYYYMMDD}{seq}
  exchange_order_id TEXT UNIQUE,           -- assigned by NSE
  user_id           UUID NOT NULL,
  symbol            TEXT NOT NULL,
  exchange          TEXT NOT NULL,         -- NSE / BSE
  transaction_type  TEXT NOT NULL,         -- BUY / SELL
  order_type        TEXT NOT NULL,         -- MARKET / LIMIT / SL
  product           TEXT NOT NULL,         -- CNC / MIS / NRML
  quantity          INT NOT NULL,
  filled_quantity   INT DEFAULT 0,
  price             NUMERIC(12,2),
  avg_price         NUMERIC(12,2),
  status            TEXT NOT NULL,
  placed_at         TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL,
  INDEX (user_id, placed_at DESC),        -- user order history
  INDEX (status) WHERE status = 'OPEN'   -- open order monitoring
);

TRANSACTIONS (immutable trade record):
CREATE TABLE transactions (
  txn_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  order_id      TEXT REFERENCES orders,
  symbol        TEXT NOT NULL,
  txn_type      TEXT NOT NULL,            -- BUY / SELL / BONUS / SPLIT
  quantity      INT  NOT NULL,
  price         NUMERIC(12,4) NOT NULL,
  amount        NUMERIC(14,2) NOT NULL,
  charges       NUMERIC(10,2),            -- STT + brokerage + GST
  executed_at   TIMESTAMPTZ NOT NULL,
  settlement_date DATE NOT NULL,
  INDEX (user_id, symbol, executed_at)   -- FIFO tax computation
);

HOLDINGS (snapshot, updated on execution):
CREATE TABLE holdings (
  user_id    UUID        NOT NULL,
  symbol     TEXT        NOT NULL,
  exchange   TEXT        NOT NULL,
  quantity   INT         NOT NULL,
  avg_cost   NUMERIC(12,4) NOT NULL,     -- weighted average purchase price
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, symbol, exchange)
);

KEY DESIGN DECISIONS:
1. avg_cost in holdings = weighted average, updated atomically on every buy/sell
2. Full transaction log kept for FIFO P&L — never delete transactions
3. Holdings are a cached view, transactions are the source of truth
4. Open orders indexed separately to avoid full table scan for margin computation`,
  },
  {
    id: "gq7",
    category: "Market Data",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Groww", "Zerodha", "5Paisa"],
    question: "How do you build and store OHLC (candlestick) data from real-time tick data?",
    answer: `Candle computation is a streaming aggregation problem. Every incoming tick must update the current open candle without blocking the main tick pipeline.

CANDLE COMPUTATION (real-time):

Current candle state in Redis:
  KEY: candle:{symbol}:{interval}:current
  VALUE: { open, high, low, close, volume, start_ts, end_ts }
  TTL: interval duration + 10s buffer

On each tick for symbol S at timestamp T:
  1. Determine which candle bucket T falls in:
     interval_start = floor(T / interval_seconds) × interval_seconds
  2. GET current candle from Redis
  3. If candle doesn't exist or start_ts < interval_start:
     → Current candle is finalised (closed)
     → Publish to Kafka: candle.closed (for TimescaleDB persistence)
     → Create new candle: {open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: tick.volume}
  4. If candle exists and start_ts == interval_start:
     → Update: high = max(high, tick.price), low = min(low, tick.price), close = tick.price, volume += tick.volume
     → Redis HMSET (atomic)

FINALISATION:
  Kafka consumer: candle.closed → INSERT INTO candles (TimescaleDB)
  TimescaleDB continuous aggregates auto-roll 1m → 5m → 15m → 1h → 1d

SERVING:
  Intraday: serve live candle from Redis + historical candles from TimescaleDB
  Client request: GET /candles?symbol=X&interval=5m&from=T1&to=T2
    → TimescaleDB for closed candles (T1 to T2-interval)
    → Redis for current open candle (latest partial candle)
    → Merge and return

STORAGE ESTIMATES:
  2000 symbols × 375 minutes/day × 1 min candles = 750,000 rows/day
  One year: 750,000 × 250 trading days = 187.5M rows
  TimescaleDB with compression: ~1 GB/year for 1-minute data — very manageable`,
  },
  {
    id: "gq8",
    category: "Trade-offs",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Groww", "Zerodha", "INDmoney"],
    question: "How do you enforce the 3 PM mutual fund cut-off time at scale?",
    answer: `The 3 PM cut-off is a hard regulatory requirement. An order submitted at 2:59:59 PM gets today's NAV; one at 3:00:01 PM gets tomorrow's. This is not a UX detail — it's a compliance boundary.

THE PROBLEM:
  Under load (many SIPs triggering, server-side delays), an order submitted at 2:59 PM might not be stamped until 3:01 PM due to processing lag
  Investors could lose one day's NAV — small financially but large regulatory risk

SOLUTION:

Client-side cut-off display:
  App shows countdown timer: "Cut-off in 3 min 42 sec"
  At T-2 minutes: "Hurry! Cut-off approaching" warning
  At T=0: UI disables new MF orders with message "Today's cut-off reached. Your order will get tomorrow's NAV."

Authoritative server timestamp:
  The timestamp on the Order record (submitted_at) is set by the server, not the client
  Client-provided timestamps are ignored for cut-off purposes
  Server clock synced via NTP to sub-millisecond accuracy

Cut-off enforcement in API:
  At exactly 15:00:00.000 IST, server-side flag flips: cutoff_reached = true (Redis atomic SET)
  All MF purchase/redemption requests after this flag: nav_date = next_business_day
  Orders before flag: nav_date = today

Soft cut-off (15 minutes buffer):
  Internal cut-off: 2:45 PM (stops accepting high-risk orders — large amounts, new funds)
  Hard cut-off: 3:00 PM (regulatory)
  Buffer used to: submit all queued orders to RTA before 3 PM, handle RTA connectivity issues
  If RTA connectivity lost at 2:55 PM: all queued orders automatically deferred to next day

COMMUNICATION:
  Investors shown exact nav_date at order confirmation: "Order placed. NAV date: April 30, 2026"
  If deferred: "Order placed after cut-off. NAV date: May 2, 2026 (next business day)"
  Never ambiguous — regulatory clarity required`,
  },
];
