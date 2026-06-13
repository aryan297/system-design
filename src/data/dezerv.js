export const DEZERV_HLD = {
  title: "Dezerv — High Level Design",
  subtitle: "Wealth-tech platform for Indian HNIs — curated portfolios, MF investing, goal-based planning, SIP automation, NAV tracking",
  overview: `Dezerv is a SEBI-registered wealth management platform targeting India's high net worth individual (HNI) segment. Unlike mass-market brokers (Groww, Zerodha), Dezerv's core proposition is expert-curated portfolio baskets — pre-built allocations across equity, debt, and alternative assets, managed by professional fund managers.

Core engineering challenges: personalised recommendation engine matching investor risk profile to curated baskets, real-time NAV updates across thousands of mutual fund schemes, seamless KYC onboarding with SEBI compliance, NACH/UPI mandate management for SIP automation, and a goal-based planning engine that computes required SIP amounts to reach financial targets.

Architecture evolution:
  Phase 1 (MVP): Monolith on AWS EC2 — KYC onboarding, manual portfolio management, basic MF investment
  Phase 2 (Scale): Microservices on Kubernetes — Portfolio, Order, User, KYC, Notification split into independent services
  Phase 3 (Intelligence): Event-driven + ML — Recommendation engine, CQRS for portfolio reads, event sourcing for audit, AI Investment Advisor

Dezerv integrates with BSE StAR MF (mutual fund order routing), CAMS/KFintech (RTAs), CDSL/NSDL (depositories), NACH/UPI (payment mandates), and PAN/Aadhaar APIs for KYC.`,

  metrics: [
    { label: "AUM", value: "₹5,000Cr+", note: "assets under management" },
    { label: "Active investors", value: "1L+", note: "HNI segment focus" },
    { label: "NAV update latency", value: "< 5 min", note: "after AMFI publishes at 9 PM" },
    { label: "KYC completion", value: "< 10 min", note: "end-to-end digital via DigiLocker" },
    { label: "SIP mandates", value: "500K+", note: "monthly NACH/UPI auto-investments" },
    { label: "Portfolio baskets", value: "50+", note: "curated by expert fund managers" },
    { label: "Order routing SLA", value: "< 3 PM", note: "MF cut-off time enforcement" },
    { label: "Goal projections", value: "real-time", note: "SIP calculator with live NAV" },
  ],

  diagram: `
┌──────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                  │
│            iOS App · Android App · Web (React) · WhatsApp Bot        │
└────────────────────────┬─────────────────────────────────────────────┘
                         │  HTTPS / WebSocket
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│              API GATEWAY (AWS ALB + Kong)                            │
│        SERVICE MESH — Envoy sidecar attached to every service        │
│    JWT Auth · Rate Limiting · Routing · mTLS to services             │
│     mTLS · Load Balancing · Retries · Circuit Breaking · Tracing     │
└──┬──────────┬───────────┬──────────────┬──────────────┬──────────────┘
   │          │           │              │              │
   ▼          ▼           ▼              ▼              ▼
┌───────┐ ┌───────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐
│ Auth  │ │ User  │ │  KYC     │ │ Portfolio│ │  Recommendation      │
│Service│ │Service│ │ Service  │ │ Service  │ │  Engine              │
└───────┘ └───────┘ └──────────┘ └────┬─────┘ └──────────────────────┘
                                       │
                    ┌──────────────────┤
                    ▼                  ▼
             ┌──────────┐      ┌──────────────┐
             │  Order   │      │  Market Data │
             │  Service │      │  Service     │
             └────┬─────┘      └──────┬───────┘
                  │                   │
                  ▼                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      KAFKA EVENT BUS                                 │
│   order.placed · nav.updates · kyc.completed · portfolio.rebalanced  │
└─────────────────────────────────┬────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                   │
│  PostgreSQL (users, orders, portfolios) · MongoDB (KYC docs, goals)  │
│  Redis (NAV cache, sessions, rate limits) · ClickHouse (analytics)   │
│  Elasticsearch (fund search) · S3 (documents, statements, reports)   │
└──────────────────────────────────────────────────────────────────────┘
                                   │
              ┌────────────────────┼─────────────────────┐
              ▼                    ▼                      ▼
       ┌────────────┐     ┌──────────────┐     ┌──────────────────┐
       │ BSE StAR MF│     │  CAMS/KFin   │     │  AMFI NAV Feed   │
       │ (MF orders)│     │  (RTA)       │     │  (daily NAV)     │
       └────────────┘     └──────────────┘     └──────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Investor Onboarding & KYC",
      sections: [
        {
          title: "Digital KYC — HNI Onboarding in Under 10 Minutes",
          content: `Dezerv's target customer is the HNI segment (investable surplus > ₹25 lakh). Onboarding must feel premium yet stay fully digital — a 10-minute KYC vs traditional wealth managers' 2-week paper process is a key differentiator.

KYC FLOW:
  1. Mobile number + email OTP verification
  2. PAN entry → NSDL API validates PAN → fetches name, DOB, status
  3. Aadhaar-based eKYC:
     Option A: DigiLocker integration — Aadhaar XML fetched with consent
     Option B: Aadhaar OTP — UIDAI API validates biometric-free verification
     Option C: Video KYC — live call with Dezerv wealth advisor for high-ticket accounts
  4. Bank account linking → penny-drop verification (₹1 micro-deposit to validate IFSC + account)
  5. FATCA/CRS declaration (mandatory for HNIs — Foreign Account Tax Compliance Act)
  6. Risk profiling questionnaire (7 questions → Conservative / Balanced / Growth / Aggressive)
  7. CDSL/NSDL demat account creation if equity investment required

KYC MICROSERVICE DESIGN:
  Stateful document flow stored in MongoDB (flexible schema for varying doc types)
  Each KYC application: { applicant_id, pan, aadhaar_hash, status, documents[], created_at }
  Status FSM: INITIATED → PAN_VERIFIED → AADHAAR_VERIFIED → BANK_VERIFIED → KYC_COMPLETE
  Kafka event: kyc.completed → triggers welcome email, portfolio recommendation generation

REGULATORY COMPLIANCE:
  SEBI RIA (Registered Investment Advisor) regulations: risk disclosure, signed agreement required
  PMLA: AML/PEP screening against financial intelligence unit database
  Re-KYC: annual review for HNIs with AUM > ₹50 lakh (SEBI 2024 mandate)
  All documents archived to S3 with AES-256 encryption, 10-year retention`,
        },
        {
          title: "Risk Profiling & Investment Mandate",
          content: `Unlike retail brokers, Dezerv collects a detailed investment mandate — risk tolerance, time horizon, liquidity needs, tax bracket, and financial goals — to power the recommendation engine.

RISK ASSESSMENT:
  7-question psychometric questionnaire
  Dimensions: loss tolerance, investment horizon, liquidity needs, prior investing experience
  Output: Conservative / Balanced / Growth / Aggressive + numerical score 1–100
  Risk score stored in user profile → drives basket eligibility filtering

INVESTMENT MANDATE DOCUMENT:
  Created as a signed legal document (PDF, DocuSign-equivalent)
  Contains: investment objectives, risk appetite, asset class restrictions, exclusions
  Stored in S3; referenced in all portfolio recommendations for compliance traceability

PRODUCT ELIGIBILITY:
  Conservative (score < 30): debt funds, liquid funds, short-duration bonds only
  Balanced (score 30–60): balanced advantage funds, multi-asset, equity savings
  Growth (score 60–80): equity-heavy baskets (large-cap, flexi-cap, index)
  Aggressive (score 80–100): small-cap, international funds, factor-based ETFs, REIT/InvIT

GOAL CONFIGURATION:
  Investor sets goals: Retirement in 20 years (₹5Cr target), Child Education in 8 years (₹50L), Emergency Fund (3 months expenses)
  Each goal: { goal_id, type, target_amount, target_date, current_corpus, monthly_sip }
  Goal engine computes: required monthly SIP given target, date, expected CAGR, current corpus
  SIP amount = PMT(rate/12, n_months, -pv, fv) — standard financial formula`,
        },
        {
          title: "Back-of-the-Envelope Estimation",
          content: `Before drawing the microservices grid, pin down scale with rough
math — every box in the diagram exists because of one of these
numbers.

ASSUMPTIONS:
• Active investors: ~1L (100,000), AUM ₹5,000Cr+ → ~₹5L average portfolio
• SIP mandates: 500K+ monthly NACH/UPI auto-investments
• NAV universe: 10,000+ MF schemes published by AMFI at 9 PM daily
• Portfolio baskets: 50+, each with ~4-5 fund components
• Daily active users checking portfolio post-NAV update: ~20% of investors
• Cut-off enforcement: hard 3:00 PM IST, soft cut-off 2:45 PM

1. NAV fan-out — justifies the NAV Consumer + Redis cache design
   100K investors × ~8 funds held avg ≈ 800K (investor, fund) pairs
   revalued every night after the 9 PM AMFI publish
   → A single popular fund (e.g. a Nifty 50 index basket component
     held by 60% of investors) triggers ~60K portfolio recomputations
     from ONE NAV update — this is WHY NAV is cached in Redis
     (mf:nav:{isin}) and read millions of times/day vs written ~10K times/day

2. SIP scheduler throughput — justifies the 20-thread partitioned cron
   500K SIPs ÷ ~21 business days ≈ 24K executions/day average, but
   month-start concentration (1st/5th) can push 100K+ in a single day
   100K executions ÷ 20 parallel consumer threads ≈ 5,000/thread
   → At ~200ms/execution (mandate check + BSE order + payment), that's
     ~1,000s (~17 min) per thread — comfortably inside the 1 AM CronJob
     window before market hours

3. Cut-off burst — justifies the 2:45 PM soft cut-off buffer
   5% of 100K investors placing month-end lumpsum orders in the last
   15 min before 3 PM ≈ 5,000 orders ≈ ~5.5 orders/sec
   Each order fans out to ~4 basket components ≈ ~22 component orders/sec
   → This burst is WHY the soft cut-off at 2:45 PM exists — 15 minutes
     of buffer absorbs it before the hard 3 PM regulatory deadline

4. Portfolio read QPS — justifies the CQRS read model
   ~20K daily active investors, concentrated post-9:30PM notification
   and at market open ≈ peak ~50 reads/sec
   → Each naive read would JOIN holdings × nav_history × goals — at
     50 reads/sec with multi-table JOINs, Postgres contention is real;
     this is WHY portfolio_snapshot (a materialised view) exists

5. Capital gains scale — justifies ClickHouse for tax reports
   100K investors × ~36 SIP lots (3-year SIP) × multiple basket funds
   ≈ 3.6M+ purchase lots
   → FIFO redemption matching across millions of lots, computed for
     every investor at financial-year-end, is WHY tax report
     generation runs on ClickHouse, not PostgreSQL

Interview punch line: every number above maps to a box — 800K nightly
revaluations → NAV Consumer + Redis, 100K SIP executions/day →
20-thread scheduler, ~22 orders/sec burst → 2:45 PM soft cut-off, ~50
reads/sec → CQRS portfolio_snapshot, 3.6M+ lots → ClickHouse tax
reports. State the number, then name the component it justifies.`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Portfolio Baskets & Recommendations",
      sections: [
        {
          title: "Curated Basket System — Expert-Built Portfolios",
          content: `Dezerv's core product is pre-built portfolio baskets — curated by expert fund managers, not self-directed stock picking. This is the key architectural difference from Groww/Zerodha.

BASKET DEFINITION:
  Each basket: { basket_id, name, description, risk_level, category, components[], inception_date, benchmark }
  Components: [ { fund_isin, fund_name, allocation_pct, category }, ... ]

  Example: "Dezerv Equity Growth" basket:
    - 30% Axis Bluechip Fund (large-cap stability)
    - 25% Parag Parikh Flexi Cap (flexi-cap + international hedge)
    - 20% Mirae Asset Emerging Bluechip (mid-cap growth)
    - 15% ICICI Pru Short Term Fund (debt cushion)
    - 10% Nifty 50 Index Fund (low-cost core)

BASKET PERFORMANCE TRACKING:
  Basket NAV computed daily: Σ (fund_nav × allocation_pct) normalised to 100 at inception
  Historical performance vs benchmark (Nifty 500, custom)
  Stored in ClickHouse for efficient time-range analytics
  Metrics exposed: 1Y/3Y/5Y CAGR, Sharpe ratio, max drawdown, rolling returns

REBALANCING ENGINE:
  Quarterly rebalance: fund allocations drift with market movement
  Trigger: drift > 5% from target → rebalance event
  Kafka event: basket.rebalance_required → Order Service generates buy/sell orders for all investors in basket
  Investors notified 3 days in advance; can opt out of specific rebalance`,
        },
        {
          title: "Recommendation Engine — ML-Powered Basket Matching",
          content: `The recommendation engine matches investor profiles to baskets. Phase 3 evolved this from rule-based filtering to an ML scoring model.

PHASE 1 — RULE-BASED:
  Simple filter: risk_score → eligible_baskets (lookup table)
  Ranking: by 3Y CAGR descending
  Works well as baseline, no personalisation

PHASE 2 — COLLABORATIVE FILTERING:
  Input: investor_id, risk_score, investment_horizon, aum_range, goal_type
  Matrix: investors × baskets with engagement signals (views, investments, SIP continuations)
  Cosine similarity: find investors with similar profile → recommend their top baskets
  Limitation: cold start for new investors (no history)

PHASE 3 — ML SCORING MODEL:
  Features: risk_score, age, income_bracket, existing_portfolio_composition, goal_horizon, market_conditions
  Model: gradient boosted trees (XGBoost) trained on 100K investor journeys
  Output: probability of satisfaction for each basket → ranked list
  Served via FastAPI model server, responses cached in Redis (TTL: 1 hour)
  A/B tested: Model vs rule-based → 23% higher 90-day retention on recommended basket

API: POST /v1/recommendations
  Input: { investor_profile, constraints: { min_horizon_years, max_risk_level } }
  Output: [ { basket_id, match_score, reasoning, key_metrics }, ... ] (top 5)`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "MF Order Routing & NAV Processing",
      sections: [
        {
          title: "Investment Order Flow — MF Purchase via BSE StAR MF",
          content: `All mutual fund transactions at Dezerv flow through BSE StAR MF (Stock Exchange-based Transaction platform). This provides regulatory oversight, RTA connectivity, and T+1 settlement.

ORDER FLOW:
  1. Investor selects basket → specifies investment amount (e.g. ₹1,00,000)
  2. Amount split across basket components by allocation_pct:
     e.g. ₹1L → ₹30K in Axis Bluechip, ₹25K in Parag Parikh, etc.
  3. For each component: POST /v1/orders/mf { fund_isin, amount, payment_mode: "UPI" }
  4. Order Service validates: KYC complete? mandate active? cut-off time?
  5. Submits to BSE StAR MF API → gets bse_order_id
  6. Kafka: order.placed { order_id, fund_isin, amount, nav_date }
  7. BSE routes to AMC (Asset Management Company) via RTA (CAMS/KFintech)
  8. NAV allocated at EOD: AMC confirms units → Kafka: nav.allotted
  9. Portfolio Service updates holdings, sends push notification

CUT-OFF TIME ENFORCEMENT:
  3:00 PM IST for equity/hybrid/debt funds
  1:30 PM for liquid funds (same-day NAV)
  Server timestamps orders; client-submitted timestamps ignored
  Redis atomic flag: SET mf:cutoff_reached 1 EX 86400 (set at 15:00:00, auto-expires)
  Orders after flag: nav_date = next_business_day (T+1)
  Pre-3PM buffer: Dezerv's internal soft cut-off at 2:45 PM to ensure all queued orders reach BSE before 3PM

PAYMENT FLOW:
  UPI AutoPay: investor pre-authorises UPI mandate → debit on invest → instant
  NACH: bank mandate → T+1 debit → Dezerv advances funds same day (float management)
  Netbanking: real-time redirect, immediate debit confirmation`,
        },
        {
          title: "Real-Time NAV Update Pipeline",
          content: `NAV (Net Asset Value) is the price of each mutual fund unit — published by AMCs daily by 9 PM (SEBI mandate). Dezerv's portfolio valuations depend entirely on this daily feed.

NAV PIPELINE:
  External Feed → Kafka → NAV Consumer → Redis → Portfolio Revaluation → Push Notification

STEP BY STEP:
  1. AMFI publishes NAV file at ~9 PM (text file at amfiindia.com/nav-data)
  2. Dezerv's NAV fetcher service polls every 5 minutes from 6 PM (some AMCs publish early)
  3. Parse NAV file → extract {isin, scheme_name, nav, nav_date} for 10,000+ schemes
  4. Kafka: publish to topic nav.updates (partitioned by ISIN prefix)
  5. NAV Consumer:
     a. Redis: SET mf:nav:{isin} {nav_value} EX 86400 (24hr TTL, refreshed daily)
     b. PostgreSQL: INSERT INTO nav_history (isin, nav, date) for historical tracking
  6. Portfolio Revaluation Consumer:
     For each updated ISIN: find all investors holding this fund → recompute portfolio_value
     Portfolio value = Σ (units_held × current_nav) per holding
  7. Push Notification: "Your portfolio is updated. Current value: ₹4,82,450 (+₹3,200 today)"

DELTA NAV (intraday indicative):
  Some AMCs publish live indicative NAV during market hours (not official, for equity schemes)
  Used for intraday portfolio value display with disclaimer
  Sourced from AMC APIs or Bloomberg data feed (for premium users)

HISTORICAL NAV STORE:
  PostgreSQL table: nav_history(isin, nav_date, nav_value) — append-only
  10,000 schemes × 250 trading days = 2.5M rows/year — manageable
  Used for: historical performance charts, CAGR computation, tax P&L reports`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "SIP Engine & Goal Tracking",
      sections: [
        {
          title: "SIP Automation — Systematic Investment Plans at Scale",
          content: `SIP is the primary investment vehicle for Dezerv's HNI customers. Unlike Groww's mass-market SIPs, Dezerv's SIPs are linked to specific life goals (retirement, education, wealth creation) with dynamic amount adjustments.

SIP MANDATE CREATION:
  UPI AutoPay mandate: investor approves once via bank app → NPCI assigns mandate_id
  NACH mandate: signed mandate sent to bank → 7-10 day activation
  Mandate stored: { mandate_id, user_id, bank_account, max_amount, expiry, status, provider }
  Validation: mandate.max_amount >= sip.amount (prevents mandate breaches)

SIP SCHEDULER DESIGN:
  Kubernetes CronJob: runs daily at 1:00 AM IST
  Query: SELECT * FROM sips WHERE next_exec_date = CURRENT_DATE AND status = 'ACTIVE'
  Partition by user_id hash → 20 consumer threads → parallel processing
  Each SIP execution: validate mandate → submit MF order → debit payment → update next_exec_date

IDEMPOTENCY:
  Unique constraint: UNIQUE(sip_id, scheduled_date) in sip_executions table
  If scheduler runs twice (crash recovery), second insert fails gracefully → no duplicate order

GOAL-LINKED SIP ADJUSTMENTS:
  Annual Step-Up SIP: automatically increase SIP by 10% each year
  e.g. Start ₹20,000/month → Year 2: ₹22,000 → Year 3: ₹24,200
  Stored as: { step_up_pct: 10, step_up_frequency: "ANNUAL", base_amount: 20000 }
  Scheduler recalculates amount before each execution based on step-up schedule

FAILURE HANDLING:
  Payment failure (NSF): retry same day at 12 PM → 3 PM → mark FAILED
  Notification cascade: push → SMS → email on failure
  3 consecutive failures → SIP paused, investor prompted to refresh mandate
  Failed executions tracked in sip_executions.failure_reason for analytics`,
        },
        {
          title: "Goal-Based Planning & Projection Engine",
          content: `Goal-based investing is Dezerv's key narrative. The planning engine helps investors visualise the SIP amount needed to reach a target corpus by a target date.

GOAL PROJECTION FORMULA:
  Future Value = PV × (1+r)^n + PMT × [((1+r)^n - 1) / r] × (1+r)
  Where:
    PV = current corpus
    r  = expected monthly return (CAGR / 12)
    n  = months to goal
    PMT = monthly SIP amount
  Required SIP = solve PMT to achieve target FV

EXPECTED CAGR ESTIMATION:
  Conservative basket: 8% CAGR assumption
  Balanced basket: 10% CAGR
  Growth basket: 12% CAGR
  Aggressive basket: 14% CAGR
  Historical CAGR of assigned basket used where available (> 3 years data)
  Inflation-adjusted: real returns = nominal - 6% (India inflation assumption)

GOAL HEALTH MONITORING:
  Daily job: for each active goal → recompute projected corpus at goal date
  Status: ON_TRACK / AT_RISK / OFF_TRACK
  ON_TRACK: projected corpus >= target_amount
  AT_RISK: projected corpus 80–100% of target (buffer < 20%)
  OFF_TRACK: projected corpus < 80% of target
  AT_RISK/OFF_TRACK: push notification + in-app alert with suggested SIP increase

GOAL DASHBOARD:
  Progress ring: current_corpus / target_amount (percentage)
  Projection chart: current corpus growth curve + expected returns curve
  Milestones: "50% milestone reached!" push when corpus crosses 50% of target
  What-if simulator: investor adjusts SIP amount → chart rerenders in real-time (client-side computation, no API call)`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "Portfolio Service & Reporting",
      sections: [
        {
          title: "Portfolio Management — Holdings, Valuation & Rebalancing",
          content: `Portfolio service is the read-heavy core of Dezerv. Every time an investor opens the app, portfolio value, P&L, and allocation are fetched and computed.

HOLDINGS DATA MODEL:
  mf_holdings: { user_id, fund_isin, folio_number, units, avg_nav, invested_amount, purchase_date }
  Portfolio value on request:
    For each holding: current_value = units × Redis(mf:nav:{isin})
    Total value = Σ current_values
    Unrealised P&L = total_value - total_invested_amount

CQRS PATTERN (implemented in Phase 3):
  Write side: Order Service, NAV Consumer → events → event store
  Read side: Portfolio read model (pre-computed) updated by event consumers
  Read DB: PostgreSQL with materialised view refreshed on every nav.updated and order.executed event
  Benefit: portfolio GET is a single SELECT, no complex JOINs or computations at query time

EVENT SOURCING:
  Every portfolio state change stored as immutable event:
    { event_id, user_id, event_type, payload, created_at }
    event_types: MF_PURCHASED, MF_REDEEMED, NAV_UPDATED, DIVIDEND_RECEIVED, BASKET_REBALANCED
  Full portfolio history reconstructible from events
  Critical for: audit trails, tax computation, regulatory reporting (SEBI requires 7-year retention)

BASKET REBALANCING:
  Trigger: basket manager updates target allocations OR quarterly schedule
  Impact computation: for each investor in basket → compute buy/sell orders to reach new targets
  Approval flow: investors notified → can accept/modify/reject
  Auto-accept for investors with "auto-rebalance" preference
  Orders submitted as a batch to BSE StAR MF`,
        },
        {
          title: "Capital Gains & Tax Reporting",
          content: `HNI investors have complex tax situations — multiple funds, SIPs started at different times, partial redemptions. Tax computation requires FIFO at unit level.

CAPITAL GAINS CLASSIFICATION (India):
  Equity funds:
    STCG (< 1 year): 15% flat tax
    LTCG (> 1 year): 10% above ₹1.25 lakh/year (Budget 2024 change)
  Debt funds (purchased after April 1, 2023):
    Taxed at slab rate regardless of holding period (Finance Act 2023 change)
  Hybrid funds: depends on equity allocation percentage

FIFO COMPUTATION:
  Each SIP instalment is a separate purchase lot: { purchase_date, units, nav }
  Redemption: consume oldest lots first (FIFO as per income tax rules)
  Example: 3-year SIP with 36 instalments → 36 purchase lots → partial redemptions matched to oldest lots first

TAX HARVESTING (Dezerv Premium Feature):
  Annual scan for loss-making positions → suggest switching to similar fund to book LTCG losses
  LTCG offset: losses in one fund can offset gains in another (same year)
  Wash sale: switched-out fund not re-purchased for 30 days (tax rule)
  Estimated tax saving shown to investor before suggesting

TAX REPORTS:
  Downloadable PDF/Excel for each financial year (Apr–Mar)
  Capital gains statement: realised gains by fund, date, amount, tax liability
  Pre-filled for CA submission
  Generated by ClickHouse query (FIFO computation over 3+ years of history)
  Large portfolios (> 500 transactions): async generation, email when ready`,
        },
      ],
    },
    {
      id: "phase6",
      label: "Phase 6",
      title: "Security, Compliance & AI Advisor",
      sections: [
        {
          title: "Security Design & SEBI RIA Compliance",
          content: `Dezerv is a SEBI Registered Investment Advisor (RIA). This imposes strict technology requirements beyond standard fintech security.

AUTHENTICATION:
  JWT (RS256 asymmetric signing): access token 15 min TTL, refresh token 7 days
  Refresh token stored in Redis: SET refresh:{user_id}:{jti} 1 EX 604800
  Token revocation: DELETE key on logout → blacklisted JTI checked on every request
  2FA mandatory for transactions: OTP via SMS (TOTP optional for power users)
  Device binding: new device login triggers OTP + email confirmation

TRANSPORT SECURITY:
  TLS 1.3 minimum for all client connections
  mTLS between internal microservices (Istio service mesh)
  Certificate pinning in mobile apps (prevents MITM on public Wi-Fi)

DATA SECURITY:
  PAN, Aadhaar hash (not plaintext) stored in PostgreSQL with column-level encryption (pgcrypto)
  Bank account numbers: AES-256 encrypted at rest, masked in logs (show only last 4 digits)
  S3 documents: SSE-KMS encryption, presigned URLs with 15-min expiry for document access

SEBI RIA COMPLIANCE:
  Fee structure: Dezerv charges flat advisory fee (not commission) — requires transparent disclosure
  Investment advice log: every recommendation stored with rationale, risk warnings, investor acceptance
  Conflict of interest: Dezerv cannot receive commissions from AMCs (RIA regulation)
  Annual compliance audit: all communications, recommendations, trade records reviewed
  Grievance redressal: SEBI SCORES portal integration — investor complaints escalated within 30 days`,
        },
        {
          title: "Service Mesh — Sidecar Proxy Pattern (Envoy/Istio)",
          content: `The Security Design section above mentions "mTLS between internal
microservices (Istio service mesh)" — this section unpacks what that
means for Dezerv's fleet behind the API Gateway: Auth, User, KYC,
Portfolio, Recommendation, Order, and Market Data services.

WHY A MESH FITS DEZERV'S FLEET:
• Every cross-service call here touches regulated data (KYC docs,
  bank mandates, portfolio values) — mTLS in transit isn't optional,
  it's a SEBI RIA expectation
• Order Service calls Market Data Service and is called by Portfolio
  Service — one misbehaving downstream (e.g. Market Data Service
  timing out on a stale AMC feed) shouldn't cascade into Order
  Service failing investor SIPs
• KYC Service has the strictest audit requirements — a mesh gives
  uniform access logging for "who called the KYC service, when"
  without each service hand-rolling audit middleware

1. Data plane — one Envoy sidecar per service pod
   • Sidecar intercepts all in/out traffic via iptables — Auth, User,
     KYC, Portfolio, Recommendation, Order, and Market Data all get
     identical mTLS, retries, and circuit breaking with zero app code
   • Order Service → Market Data Service calls get a circuit breaker:
     if Market Data Service starts timing out on AMC feeds, Order
     Service fails fast instead of blocking SIP execution
   • Recommendation Engine (FastAPI/Python ML server) gets the SAME
     mTLS + tracing as the Go/Node services — polyglot uniformity

2. Control plane — Istio / Consul / AWS App Mesh
   • One mesh-wide PeerAuthentication STRICT policy satisfies the
     "all internal traffic encrypted" line item in a SEBI audit
   • Canary new Recommendation Engine model versions (the rule-based
     → ML scoring evolution) by shifting a % of /v1/recommendations
     traffic — the 23% retention-lift A/B test was run this way
   • Central audit log: every service-to-service call recorded with
     a SPIFFE identity, supporting "investment advice log" traceability

WHAT THIS BUYS DEZERV SPECIFICALLY:
• Compliance evidence — mTLS + access logs are exactly what a SEBI
  RIA annual audit asks for, generated automatically per-hop
• Blast radius containment — KYC Service or Order Service issues
  don't silently propagate; outlier detection ejects unhealthy
  instances
• Safe ML rollout — Recommendation Engine model updates ship behind
  a canary without touching Order/Portfolio service code

DIAGRAM: the "SERVICE MESH" band inside the API GATEWAY box
represents this — every service below it (Auth, User, KYC,
Portfolio, Recommendation, Order, Market Data) has an Envoy sidecar,
and the mTLS / load balancing / retry / circuit-breaking / tracing
capabilities in that band apply uniformly to all of them.

TRADE-OFFS:
• ~1-2ms per hop added to every internal call — negligible against
  the NAV pipeline's 5-minute SLA, but worth noting for the < 10 min
  KYC flow
• The mesh control plane becomes a new critical dependency — if it's
  down, sidecars keep enforcing their LAST KNOWN policy, but new
  deploys (including compliance-driven config changes) can't roll out
• Certificate rotation (~24h) must be monitored — an expired cert
  mid-trading-day would break Order → Market Data calls right when
  the 3 PM cut-off matters most`,
        },
        {
          title: "AI Investment Advisor — Phase 3 Feature",
          content: `Phase 3 introduced an AI-powered advisor that provides personalised investment guidance at scale — replicating the experience of a human wealth manager for each investor.

ARCHITECTURE:
  LLM backbone: fine-tuned model on financial domain (investment regulations, fund analysis, India-specific tax rules)
  RAG (Retrieval-Augmented Generation): investor profile + portfolio + fund research reports retrieved as context
  Context window: { investor_profile, portfolio_snapshot, recent_goals, relevant_fund_factsheets }
  Guardrails: output filtered for SEBI compliance (no guaranteed return promises, risk disclosures appended)

USE CASES:
  Portfolio health check: "Why is my portfolio underperforming?" → AI analyses allocation vs benchmark
  SIP advice: "Should I increase my SIP?" → computes gap to goal, suggests optimal increase
  Fund comparison: "Which is better — Axis Bluechip or Mirae Asset Large Cap?" → data-driven comparison
  Tax optimisation: "How can I reduce my tax liability this year?" → LTCG harvesting suggestions
  Market commentary: "How does RBI rate cut affect my debt fund?" → personalised impact analysis

COMPLIANCE LAYER:
  All AI responses tagged with source (RAG retrieval, model generation, hardcoded regulation)
  Disclaimer appended: "This is AI-generated guidance. Not a substitute for professional advice."
  Responses audited: random 5% reviewed by Dezerv compliance team weekly
  Escalation: high-risk queries (derivatives, very large redemptions) → routed to human advisor

LATENCY:
  RAG retrieval: ~200ms (Elasticsearch vector search on fund research embeddings)
  LLM inference: ~1-2 seconds (streaming response for perceived speed)
  Caching: common queries (RBI announcements, budget impact) pre-computed and cached`,
        },
      ],
    },
  ],
};

export const DEZERV_LLD = {
  title: "Dezerv — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of core Dezerv wealth-tech services",

  components: [
    {
      id: "kycService",
      title: "KYC Service — LLD",
      description: "Digital KYC onboarding with PAN/Aadhaar verification, document storage, and status FSM",
      api: `POST /v1/kyc/initiate
{
  "mobile": "9876543210",
  "email": "investor@example.com",
  "pan": "ABCDE1234F"
}

Response 200:
{
  "application_id": "KYC-2026-00123456",
  "status": "PAN_VERIFIED",
  "pan_details": {
    "name": "Aryan Sharma",
    "dob": "1988-04-15",
    "pan_status": "VALID"
  },
  "next_step": "aadhaar_verification"
}

POST /v1/kyc/aadhaar-otp
{ "application_id": "KYC-2026-00123456", "aadhaar_last4": "5678" }

POST /v1/kyc/aadhaar-verify
{ "application_id": "KYC-2026-00123456", "otp": "123456" }

Response 200:
{
  "status": "AADHAAR_VERIFIED",
  "address": { "line1": "...", "city": "Mumbai", "pincode": "400001", "state": "Maharashtra" },
  "next_step": "bank_verification"
}

POST /v1/kyc/bank-link
{
  "application_id": "KYC-2026-00123456",
  "account_number": "1234567890",
  "ifsc": "HDFC0001234",
  "account_type": "SAVINGS"
}

Response 200:
{
  "status": "BANK_VERIFIED",
  "penny_drop_ref": "PD20260430001234",
  "account_holder": "ARYAN SHARMA",
  "next_step": "risk_profiling"
}

-- KYC Application Schema (MongoDB) --
{
  "_id": "KYC-2026-00123456",
  "user_id": "usr_abc123",
  "pan": "ABCDE1234F",
  "pan_name": "Aryan Sharma",
  "aadhaar_hash": "sha256:...",  // never store plaintext Aadhaar
  "status": "KYC_COMPLETE",
  "bank_accounts": [
    {
      "account_number_enc": "AES256:...",
      "ifsc": "HDFC0001234",
      "is_primary": true,
      "verified_at": "2026-04-30T10:23:00Z"
    }
  ],
  "documents": [
    { "type": "PAN_CARD", "s3_key": "kyc/usr_abc123/pan.jpg", "verified_at": "..." },
    { "type": "AADHAAR_XML", "s3_key": "kyc/usr_abc123/aadhaar.xml.enc", "verified_at": "..." }
  ],
  "risk_profile": {
    "score": 72,
    "category": "GROWTH",
    "questionnaire_responses": [ ... ],
    "completed_at": "2026-04-30T10:45:00Z"
  },
  "created_at": "2026-04-30T10:00:00Z",
  "completed_at": "2026-04-30T10:48:00Z"
}

-- KYC Status Events (Kafka) --
Topic: kyc.status_changed
{
  "application_id": "KYC-2026-00123456",
  "user_id": "usr_abc123",
  "from_status": "AADHAAR_VERIFIED",
  "to_status": "BANK_VERIFIED",
  "timestamp": "2026-04-30T10:35:00Z"
}`,
    },
    {
      id: "portfolioService",
      title: "Portfolio Service — LLD",
      description: "MF holdings management, real-time valuation using NAV cache, CQRS read model, and basket composition tracking",
      api: `GET /v1/portfolio
Authorization: Bearer {jwt}

Response:
{
  "total_value": 1250000.00,
  "total_invested": 1000000.00,
  "total_pnl": 250000.00,
  "total_pnl_pct": 25.00,
  "day_change": 8500.00,
  "day_change_pct": 0.68,
  "xirr": 14.32,                   // annualised internal rate of return
  "holdings": [
    {
      "fund_isin": "INF209K01157",
      "fund_name": "Mirae Asset Emerging Bluechip - Direct Growth",
      "folio_number": "12345678/67",
      "units": 412.543,
      "avg_nav": 78.23,
      "current_nav": 102.45,
      "invested_amount": 32250.00,
      "current_value": 42264.00,
      "pnl": 10014.00,
      "pnl_pct": 31.05,
      "basket": "Dezerv Equity Growth"
    }
  ],
  "basket_summary": [
    {
      "basket_id": "equity-growth",
      "basket_name": "Dezerv Equity Growth",
      "invested": 500000.00,
      "current_value": 625000.00,
      "allocation_pct": 50.0
    }
  ],
  "asset_allocation": {
    "equity": 65.0,
    "debt": 25.0,
    "international": 8.0,
    "gold": 2.0
  }
}

-- Holdings Schema (PostgreSQL) --
CREATE TABLE mf_holdings (
  holding_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL,
  fund_isin      TEXT NOT NULL,
  folio_number   TEXT NOT NULL,
  units          NUMERIC(15,6) NOT NULL,       -- units held (up to 6 decimal places)
  avg_nav        NUMERIC(12,4) NOT NULL,        -- weighted average NAV at purchase
  invested_amount NUMERIC(14,2) NOT NULL,
  basket_id      TEXT REFERENCES baskets(basket_id),
  first_purchased_at TIMESTAMPTZ NOT NULL,
  last_updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, fund_isin, folio_number)
);

CREATE TABLE nav_history (
  isin           TEXT NOT NULL,
  nav_date       DATE NOT NULL,
  nav_value      NUMERIC(12,4) NOT NULL,
  scheme_name    TEXT,
  PRIMARY KEY (isin, nav_date)
);

-- Portfolio Read Model (CQRS) --
CREATE MATERIALIZED VIEW portfolio_snapshot AS
  SELECT
    h.user_id,
    h.fund_isin,
    h.units,
    h.avg_nav,
    h.invested_amount,
    n.nav_value AS current_nav,
    (h.units * n.nav_value) AS current_value,
    ((h.units * n.nav_value) - h.invested_amount) AS pnl
  FROM mf_holdings h
  JOIN nav_history n ON n.isin = h.fund_isin AND n.nav_date = CURRENT_DATE - 1;
  -- refreshed by NAV update consumer on each nav.updates event

-- Redis NAV Cache --
KEY: mf:nav:{isin}          VALUE: "102.4500"   TTL: 86400 (refreshed daily)
KEY: mf:nav_date:{isin}     VALUE: "2026-04-30" TTL: 86400`,
    },
    {
      id: "orderService",
      title: "MF Order Service — LLD",
      description: "MF purchase/redemption routing to BSE StAR MF, cut-off enforcement, payment integration, and order lifecycle events",
      api: `POST /v1/orders/invest
Authorization: Bearer {jwt}
{
  "type": "BASKET",                        // BASKET / FUND / LUMPSUM_BASKET
  "basket_id": "equity-growth",
  "amount": 100000.00,
  "payment_mode": "UPI_AUTOPAY",
  "mandate_id": "MND-2024-001234",
  "sip_config": {                          // null for lumpsum
    "frequency": "MONTHLY",
    "date": 5,
    "duration_months": 60
  }
}

Response 200:
{
  "investment_id": "INV-2026-001234",
  "type": "BASKET",
  "basket_id": "equity-growth",
  "total_amount": 100000.00,
  "component_orders": [
    {
      "order_id": "ORD-2026-00123401",
      "fund_isin": "INF209K01157",
      "fund_name": "Mirae Asset Emerging Bluechip",
      "amount": 20000.00,
      "bse_order_id": "BSESTARMF2026001",
      "status": "SUBMITTED",
      "nav_date": "2026-04-30",
      "nav_cutoff": "15:00 IST"
    }
    // ... more components
  ],
  "payment": {
    "mode": "UPI_AUTOPAY",
    "status": "DEBIT_INITIATED",
    "utr": "UPI2026043012345678"
  }
}

-- Order Schema --
CREATE TABLE mf_orders (
  order_id          TEXT PRIMARY KEY,         -- ORD-{YYYY}-{seq}
  investment_id     TEXT NOT NULL,            -- groups basket component orders
  user_id           UUID NOT NULL,
  fund_isin         TEXT NOT NULL,
  order_type        TEXT NOT NULL,            -- PURCHASE / REDEMPTION / SWITCH
  amount            NUMERIC(12,2),            -- for PURCHASE
  units             NUMERIC(15,6),            -- for REDEMPTION (null for PURCHASE)
  bse_order_id      TEXT UNIQUE,
  rta_order_id      TEXT,
  status            TEXT DEFAULT 'PENDING',
  -- PENDING→SUBMITTED→CONFIRMED→UNITS_ALLOTTED / FAILED / CANCELLED
  nav_date          DATE,                     -- applicable NAV date
  allotted_units    NUMERIC(15,6),            -- filled after EOD processing
  allotted_nav      NUMERIC(12,4),
  payment_ref       TEXT,
  basket_id         TEXT,
  placed_at         TIMESTAMPTZ DEFAULT now(),
  allotted_at       TIMESTAMPTZ,
  INDEX (user_id, placed_at DESC),
  INDEX (status, nav_date)                    -- for EOD batch processing
);

-- SIP Schema --
CREATE TABLE sips (
  sip_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  fund_isin        TEXT NOT NULL,
  basket_id        TEXT,
  folio_number     TEXT,
  amount           NUMERIC(10,2) NOT NULL,
  frequency        TEXT NOT NULL,
  sip_date         INT NOT NULL,              -- 1-28
  start_date       DATE NOT NULL,
  end_date         DATE,
  status           TEXT DEFAULT 'ACTIVE',    -- ACTIVE/PAUSED/CANCELLED
  mandate_id       TEXT NOT NULL,
  step_up_pct      NUMERIC(5,2) DEFAULT 0,   -- annual step-up %
  base_amount      NUMERIC(10,2),
  next_exec_date   DATE NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (sip_id)
);

CREATE TABLE sip_executions (
  exec_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sip_id           UUID NOT NULL REFERENCES sips(sip_id),
  scheduled_date   DATE NOT NULL,
  order_id         TEXT REFERENCES mf_orders(order_id),
  amount           NUMERIC(10,2),
  status           TEXT DEFAULT 'PENDING',
  failure_reason   TEXT,
  executed_at      TIMESTAMPTZ,
  UNIQUE (sip_id, scheduled_date)             -- idempotency key
);`,
    },
    {
      id: "basketService",
      title: "Basket & Recommendation Service — LLD",
      description: "Curated basket definitions, basket NAV computation, rebalancing engine, and ML recommendation API",
      api: `GET /v1/baskets
Response:
{
  "baskets": [
    {
      "basket_id": "equity-growth",
      "name": "Dezerv Equity Growth",
      "risk_level": "GROWTH",
      "category": "Equity",
      "min_investment": 5000,
      "inception_date": "2021-01-01",
      "performance": {
        "cagr_1y": 18.4,
        "cagr_3y": 14.2,
        "cagr_since_inception": 16.1,
        "sharpe_ratio": 1.23,
        "max_drawdown_pct": -14.5
      },
      "components": [
        { "fund_isin": "INF209K01157", "fund_name": "Mirae Asset Emerging Bluechip", "allocation_pct": 25 },
        { "fund_isin": "INF090I01239", "fund_name": "Axis Bluechip Fund", "allocation_pct": 30 },
        { "fund_isin": "INF879O01027", "fund_name": "Parag Parikh Flexi Cap", "allocation_pct": 25 },
        { "fund_isin": "INF109K01Z13", "fund_name": "HDFC Short Duration Debt", "allocation_pct": 20 }
      ],
      "benchmark": "Nifty 500 TRI",
      "suitable_for": ["GROWTH", "AGGRESSIVE"]
    }
  ]
}

POST /v1/recommendations
{
  "risk_category": "GROWTH",
  "investment_horizon_years": 10,
  "goal_type": "WEALTH_CREATION",
  "existing_basket_ids": []
}

Response:
{
  "recommendations": [
    {
      "basket_id": "equity-growth",
      "match_score": 0.92,
      "reasoning": "High equity allocation matches your Growth risk profile. 10-year horizon absorbs market volatility.",
      "projected_cagr": 13.5,
      "key_differentiator": "International exposure via Parag Parikh provides currency hedge"
    }
  ]
}

-- Basket Schema --
CREATE TABLE baskets (
  basket_id       TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  risk_level      TEXT NOT NULL,      -- CONSERVATIVE/BALANCED/GROWTH/AGGRESSIVE
  category        TEXT NOT NULL,      -- Equity/Debt/Hybrid/Multi-asset
  min_investment  NUMERIC(10,2),
  inception_date  DATE,
  status          TEXT DEFAULT 'ACTIVE',
  created_by      TEXT,               -- fund manager ID
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE basket_components (
  basket_id       TEXT NOT NULL REFERENCES baskets(basket_id),
  fund_isin       TEXT NOT NULL,
  allocation_pct  NUMERIC(5,2) NOT NULL,
  effective_from  DATE NOT NULL,
  effective_to    DATE,               -- null = current
  PRIMARY KEY (basket_id, fund_isin, effective_from)
);

-- Basket NAV (ClickHouse, for analytics) --
CREATE TABLE basket_nav (
  basket_id       String,
  nav_date        Date,
  basket_nav      Float64,           -- normalised to 100 at inception
  benchmark_nav   Float64,
  PRIMARY KEY (basket_id, nav_date)
) ENGINE = MergeTree() ORDER BY (basket_id, nav_date);`,
    },
    {
      id: "goalService",
      title: "Goal Planning Service — LLD",
      description: "Financial goal creation, SIP projection calculator, goal health monitoring, and step-up SIP configuration",
      api: `POST /v1/goals
{
  "goal_type": "RETIREMENT",         // RETIREMENT / EDUCATION / HOUSE / WEALTH / EMERGENCY
  "name": "Retirement Fund",
  "target_amount": 50000000,         // ₹5 Crore
  "target_date": "2045-04-01",
  "current_corpus": 2000000,         // ₹20 Lakh existing savings
  "risk_tolerance": "GROWTH"
}

Response 200:
{
  "goal_id": "goal_xyz789",
  "recommended_monthly_sip": 42500,
  "projected_corpus": 52340000,
  "projection_cagr_assumption": 13.5,
  "months_to_goal": 228,
  "milestones": [
    { "milestone_pct": 25, "projected_date": "2030-06", "corpus": 12500000 },
    { "milestone_pct": 50, "projected_date": "2035-02", "corpus": 25000000 }
  ],
  "recommended_basket": {
    "basket_id": "equity-growth",
    "basket_name": "Dezerv Equity Growth"
  }
}

GET /v1/goals/{goal_id}/health
Response:
{
  "goal_id": "goal_xyz789",
  "status": "ON_TRACK",
  "current_corpus": 3850000,
  "projected_corpus_at_goal": 51200000,
  "target_amount": 50000000,
  "projection_gap": 1200000,
  "months_remaining": 208,
  "recommended_sip_increase": 0,     // null if ON_TRACK
  "sip_current": 42500,
  "last_computed_at": "2026-04-30T09:15:00Z"
}

-- Goal Schema --
CREATE TABLE goals (
  goal_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  goal_type         TEXT NOT NULL,
  name              TEXT NOT NULL,
  target_amount     NUMERIC(14,2) NOT NULL,
  target_date       DATE NOT NULL,
  current_corpus    NUMERIC(14,2) DEFAULT 0,
  status            TEXT DEFAULT 'ACTIVE',  -- ACTIVE / ACHIEVED / PAUSED / ABANDONED
  risk_tolerance    TEXT NOT NULL,
  linked_basket_id  TEXT REFERENCES baskets(basket_id),
  linked_sip_ids    UUID[],                 -- PostgreSQL array of sip_ids
  created_at        TIMESTAMPTZ DEFAULT now(),
  last_health_check TIMESTAMPTZ,
  INDEX (user_id, status)
);

CREATE TABLE goal_projections (
  projection_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id           UUID NOT NULL REFERENCES goals(goal_id),
  computed_at       TIMESTAMPTZ NOT NULL,
  current_corpus    NUMERIC(14,2),
  projected_corpus  NUMERIC(14,2),
  monthly_sip       NUMERIC(10,2),
  cagr_assumption   NUMERIC(5,2),
  status            TEXT NOT NULL,      -- ON_TRACK / AT_RISK / OFF_TRACK
  UNIQUE (goal_id, DATE_TRUNC('day', computed_at))  -- one projection per day per goal
);`,
    },
    {
      id: "notificationService",
      title: "Notification Service — LLD",
      description: "Multi-channel notifications for NAV updates, SIP executions, goal milestones, and portfolio rebalancing",
      api: `-- Notification Events (Kafka consumers) --

Topic: nav.updates → Portfolio Update Notification
  Trigger: daily after NAV consumer processes all updates (~9:30 PM)
  Aggregated: one notification per investor (not per fund)
  Message: "Portfolio updated: ₹12,52,340 (+₹3,200 today, +0.26%)"
  Channel: push (all investors) + email (weekly digest)

Topic: sip.executed → SIP Confirmation
  Message: "₹20,000 invested in Dezerv Equity Growth. Units allotted at NAV ₹102.45"
  Channel: push + email

Topic: sip.failed → SIP Failure Alert
  Message: "Your SIP payment of ₹20,000 failed. Check your bank mandate."
  Channel: push + SMS (critical, SMS for fallback)

Topic: goal.health_computed → Goal Status Alert
  Trigger: only when status is AT_RISK or OFF_TRACK
  Message: "Your Retirement Fund goal needs attention. Increase SIP by ₹3,500/month to stay on track."
  Channel: push + email with detailed projection

Topic: basket.rebalance_required → Rebalance Alert
  Message: "Your Dezerv Equity Growth portfolio is due for rebalancing. Tap to review changes."
  Channel: push + email with allocation comparison table

-- Notification Schema --
CREATE TABLE notifications (
  notif_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  type            TEXT NOT NULL,
  -- NAV_UPDATE / SIP_EXECUTED / SIP_FAILED / GOAL_AT_RISK / REBALANCE_DUE
  channel         TEXT NOT NULL,          -- push / email / sms
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  metadata        JSONB,                  -- { goal_id, basket_id, amount, etc. }
  status          TEXT DEFAULT 'PENDING', -- PENDING/SENT/DELIVERED/FAILED
  reference_id    TEXT,
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  INDEX (user_id, sent_at DESC),
  INDEX (status, scheduled_at) WHERE status = 'PENDING'
);

-- Push Token Registry (Redis) --
KEY: push:tokens:{user_id}  VALUE: ["fcm_token_ios", "fcm_token_android"]
TYPE: Set (auto-deduplication, multi-device support)

-- Notification Preferences --
CREATE TABLE notification_preferences (
  user_id         UUID PRIMARY KEY,
  nav_updates     BOOLEAN DEFAULT true,
  sip_alerts      BOOLEAN DEFAULT true,
  goal_alerts     BOOLEAN DEFAULT true,
  rebalance_alerts BOOLEAN DEFAULT true,
  marketing       BOOLEAN DEFAULT false,
  push_enabled    BOOLEAN DEFAULT true,
  email_enabled   BOOLEAN DEFAULT true,
  sms_enabled     BOOLEAN DEFAULT false   -- opt-in only for critical alerts
);`,
    },
    {
      id: "serviceMesh",
      title: "Service Mesh — Envoy/Istio Config (LLD)",
      description: "Sidecar traffic policy: circuit breaking Order→Market Data calls, canary Recommendation Engine model versions, and mesh-wide mTLS for SEBI compliance",
      api: `# DestinationRule — circuit-break Order Service's calls to Market Data Service
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: market-data-service
spec:
  host: market-data-service.prod.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp: { maxConnections: 100 }
      http:
        http1MaxPendingRequests: 50
        maxRequestsPerConnection: 10
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
    loadBalancer:
      simple: LEAST_REQUEST

---
# VirtualService — canary the Recommendation Engine's ML model server
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: recommendation-engine
spec:
  hosts: ["recommendation-engine.prod.svc.cluster.local"]
  http:
    - match: [{ headers: { x-model-canary: { exact: "true" } } }]
      route:
        - destination: { host: recommendation-engine.prod.svc.cluster.local, subset: v2 }
    - route:
        - destination: { host: recommendation-engine.prod.svc.cluster.local, subset: v1 }
          weight: 95
        - destination: { host: recommendation-engine.prod.svc.cluster.local, subset: v2 }
          weight: 5
      retries:
        attempts: 2
        perTryTimeout: 500ms
        retryOn: 5xx,reset,connect-failure

---
# PeerAuthentication — mesh-wide mTLS for SEBI "data in transit" compliance
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: prod
spec:
  mtls: { mode: STRICT }`,
      internals: `Sidecar injection:
• Every service pod (auth, user, kyc, portfolio, recommendation,
  order, market-data) gets an Envoy sidecar via a Kubernetes
  mutating webhook at deploy time — zero application code change

Circuit breaking Order → Market Data:
• Market Data Service depends on AMC/exchange feeds it doesn't
  control
• outlierDetection ejects market-data-service instances after 5
  consecutive 5xx in 10s, for 30s — Order Service's calls to it fail
  fast instead of hanging on a 10s timeout, so SIP execution proceeds
  even if intraday market data is temporarily unavailable

Canary rollout — Recommendation Engine v2 (XGBoost model):
  1. Deploy recommendation-engine:v2 alongside v1 (same K8s Service)
  2. VirtualService routes 5% of /v1/recommendations to v2
  3. Internal QA sets x-model-canary: true to force-route to v2
  4. Compare v2 vs v1: match_score distribution, downstream 90-day
     retention (the 23% lift mentioned in Phase 2 was validated this way)
  5. Shift weight 5% → 25% → 100%, or roll back to 0% instantly

mTLS and SEBI compliance:
• PeerAuthentication STRICT means every hop — Order Service to
  Market Data Service, KYC Service to Notification Service, etc. —
  is mTLS-encrypted by default
• Cert issuance/rotation (Istio Citadel, ~24h rotation) generates an
  audit trail of which service identity called which service, when —
  directly supporting the "investment advice log" and annual
  compliance audit requirements

Control-plane-down failure mode:
• Sidecars cache the last-known DestinationRule/VirtualService/
  PeerAuthentication and keep enforcing it
• A control-plane outage at, say, 2:50 PM does NOT stop Order
  Service → Market Data Service traffic before the 3 PM cut-off —
  only NEW policy rollouts (e.g. a recommendation-engine canary
  shift) are blocked until the control plane recovers`,
    },
  ],
};

export const DEZERV_QNA = [
  {
    id: "dq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Dezerv", "Groww", "INDmoney"],
    question: "Design a wealth management platform like Dezerv. How does it differ from a retail broker like Groww?",
    answer: `Dezerv and Groww are both investment platforms, but they serve different segments with fundamentally different architectures.

KEY DIFFERENCES:

1. PRODUCT MODEL:
   Groww: self-directed investing (user picks stocks/funds) → platform is execution engine
   Dezerv: advisor-led investing (curated baskets) → platform is recommendation + execution engine

   Architectural impact: Dezerv needs a recommendation engine, basket NAV computation, and rebalancing engine that Groww doesn't need.

2. ASSET CLASSES:
   Groww: stocks, ETFs, futures, options (real-time market data, OMS, FIX protocol critical)
   Dezerv: mutual funds primarily (no real-time market data needed, BSE StAR MF for routing)

   Impact: Dezerv doesn't need co-location, FIX protocol, or millisecond-latency OMS.

3. DATA COMPLEXITY:
   Groww: tick data (50K msgs/sec), candle computation, real-time order book
   Dezerv: daily NAV (10K schemes × 1 value/day), goal projections, tax P&L

   Dezerv's compute is batch-oriented; Groww's is stream-oriented.

4. COMPLIANCE PROFILE:
   Groww: SEBI broker regulations (exchange member, circuit limits, margin rules)
   Dezerv: SEBI RIA regulations (advisory fee disclosure, conflict of interest rules, suitability)

SHARED ARCHITECTURE:
   Both need: KYC (PAN/Aadhaar), NACH/UPI mandates for SIP, portfolio holdings DB, notification service
   Dezerv uses MF-only stack: BSE StAR MF + CAMS/KFintech RTAs + AMFI NAV feed`,
  },
  {
    id: "dq2",
    category: "Real-time Systems",
    difficulty: "Medium",
    round: "Technical Interview",
    asked_at: ["Dezerv", "Groww", "Fisdom"],
    question: "Design the NAV update pipeline for a mutual fund platform. How do you handle 10,000 scheme updates daily?",
    answer: `NAV updates are batch events (once daily at ~9 PM) but must be processed and reflected across millions of investor portfolios quickly.

PIPELINE DESIGN:

Ingestion:
  Poll AMFI endpoint every 5 minutes from 6 PM (some AMCs publish early)
  Parse text file: each line = "ISIN|Scheme Name|NAV|NAV Date"
  ~10,000 schemes → process in single batch
  Idempotency: skip if nav_history already has (isin, nav_date) entry

Kafka publish:
  Batch → individual nav.updates events per ISIN
  Partitioned by ISIN → ordering guaranteed per fund
  10,000 events published in ~500ms → downstream consumers process in parallel

Redis cache update:
  Consumer 1: SET mf:nav:{isin} {nav} EX 86400
  All portfolio reads use Redis → no DB hit for current NAV

Portfolio revaluation:
  Consumer 2: for each updated ISIN → query investors holding that fund → update portfolio_snapshot
  PostgreSQL materialized view refresh (bulk update, not per-investor query)
  Or event-sourced read model: append nav_updated event → read model consumer re-derives portfolio value

Push notifications:
  Consumer 3: after all NAVs processed → aggregate daily P&L per investor → send notification
  One batch push at ~9:30 PM (not per-ISIN push — would spam investors)
  Aggregation: Σ (units × new_nav) - Σ (units × yesterday_nav) = day_change

LATENCY TARGET:
  AMFI publishes → investors see updated portfolio: under 30 minutes
  Achieved by: parallel Kafka consumers (not sequential), Redis for reads (not DB)

FAILURE HANDLING:
  NAV fetch fails: retry every 5 minutes until midnight
  If NAV not available by midnight: show "as of {yesterday}" with stale flag in UI
  Partial updates: if 9000/10000 schemes updated → show updated values, stale flag for missing`,
  },
  {
    id: "dq3",
    category: "Data Modelling",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Dezerv", "Groww", "Zerodha"],
    question: "How do you compute capital gains tax for mutual fund investors using FIFO? Design the data model.",
    answer: `FIFO capital gains computation is complex because: SIPs create many purchase lots, partial redemptions must match oldest lots, and tax rates differ by fund type and holding period.

DATA MODEL:

Purchase lots (immutable):
CREATE TABLE mf_lots (
  lot_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL,
  fund_isin      TEXT NOT NULL,
  folio_number   TEXT NOT NULL,
  units          NUMERIC(15,6) NOT NULL,       -- units in this lot
  purchase_nav   NUMERIC(12,4) NOT NULL,       -- NAV at purchase
  purchase_date  DATE NOT NULL,
  order_id       TEXT REFERENCES mf_orders,
  remaining_units NUMERIC(15,6) NOT NULL,      -- units not yet redeemed
  INDEX (user_id, fund_isin, purchase_date ASC)  -- ASC for FIFO
);

On purchase: INSERT one row per lot (each SIP = one row)
On redemption: consume lots FIFO by purchase_date

FIFO REDEMPTION:
  Redeem 100 units of fund X:
  1. SELECT lots ORDER BY purchase_date ASC WHERE remaining_units > 0 AND fund_isin = X
  2. Consume lots greedily:
     Lot A (50 units, purchased 2021-01-01): consume all 50 → remaining = 0
     Lot B (80 units, purchased 2022-06-15): consume 50 → remaining = 30
  3. For each consumed portion: compute capital gain
     gain = (redemption_nav - purchase_nav) × units_consumed
     holding_period = redemption_date - purchase_date
     tax_type = LTCG if holding_period > 365 else STCG
     tax_rate = fund_type == EQUITY ? (LTCG: 10%, STCG: 15%) : SLAB_RATE

ANNUAL REPORT GENERATION:
  For each (user_id, financial_year):
    SELECT all redemptions in the year
    For each: join with lots (already consumed, tracked in redemption_lots table)
    Aggregate: short_term_gains, long_term_gains, total_tax_liability
  Pre-computed nightly in ClickHouse (too slow for PostgreSQL at scale)

EDGE CASES:
  Switch transactions: redemption from one fund + purchase of another (same AMC, tax event still occurs)
  Dividend: adds to income not capital gains (taxation differs)
  STP (Systematic Transfer Plan): monthly switch = monthly capital gain event (complex tax trail)`,
  },
  {
    id: "dq4",
    category: "Reliability",
    difficulty: "Hard",
    round: "System Design Screen",
    asked_at: ["Dezerv", "INDmoney", "ETMoney"],
    question: "How do you ensure SIP executions are idempotent and recover from failures?",
    answer: `SIP execution involves money movement — a duplicate execution charges the investor twice. Idempotency is non-negotiable.

IDEMPOTENCY DESIGN:

Unique key: (sip_id, scheduled_date)
  Database constraint: UNIQUE (sip_id, scheduled_date) on sip_executions table
  Before processing: INSERT INTO sip_executions (...) ON CONFLICT DO NOTHING
  If conflict: already processed (or currently being processed) → skip

Distributed lock (for concurrent schedulers):
  Redis SET NX: SET lock:sip:{sip_id}:{date} 1 EX 300 (5-minute lock)
  Only acquires lock before processing → second scheduler instance sees lock → skips
  Lock TTL prevents deadlock if first instance crashes mid-execution

STATUS MACHINE:
  PENDING → PAYMENT_INITIATED → PAYMENT_CONFIRMED → ORDER_SUBMITTED → SUCCESS
                              ↘ PAYMENT_FAILED → RETRY_SCHEDULED
                                                → FAILED (after max retries)

FAILURE RECOVERY:

Payment failure:
  Bank returns: NSF (insufficient funds) → mark PAYMENT_FAILED
  Retry schedule: same day at 12 PM, 3 PM (before cut-off), then FAILED
  Idempotency on retry: use same execution record (update status, don't insert new)

Order submission failure (BSE StAR MF unavailable):
  Retry with exponential backoff: 1min, 5min, 30min, 2hr
  If retry successful within cut-off time: same NAV date
  If cut-off missed due to BSE outage: investor notified, execution deferred to next SIP date

Kafka failure:
  SIP scheduler writes sip.due events with at-least-once semantics
  Consumer is idempotent (unique constraint) → duplicate events handled
  Order Service also idempotent: (sip_execution_id, order_attempt) as unique key

RECONCILIATION:
  EOD job: compare sip_executions (SUCCESS) with BSE StAR MF order confirmations
  Discrepancies: manual review queue for finance team
  Critical alerts: Slack + PagerDuty if > 1% SIP executions unconfirmed by midnight`,
  },
  {
    id: "dq5",
    category: "Architecture",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Dezerv", "Groww", "Scripbox"],
    question: "Explain CQRS and Event Sourcing in the context of a mutual fund portfolio service.",
    answer: `CQRS (Command Query Responsibility Segregation) and Event Sourcing are patterns that Dezerv adopted in Phase 3 for the portfolio service.

WHY CQRS FOR PORTFOLIO:

Problem without CQRS:
  Every portfolio read (GET /v1/portfolio) requires:
    JOIN mf_holdings with nav_history → compute current_value
    JOIN with goals → compute goal progress
    JOIN with transactions → compute XIRR
  Complex JOINs + real-time computation = slow reads at scale

With CQRS:
  Write side: process commands (MF_PURCHASE, MF_REDEMPTION, NAV_UPDATED)
  Read side: pre-computed portfolio_snapshot table, refreshed by event consumers
  Portfolio read = single SELECT on portfolio_snapshot → milliseconds

WRITE SIDE (Command Handlers):
  PlaceOrderCommand → validates, writes to mf_orders, publishes OrderPlacedEvent
  UpdateNavCommand → writes to nav_history, publishes NavUpdatedEvent
  Both events go to Kafka

READ SIDE (Event Consumers):
  OrderPlacedConsumer: updates mf_holdings, adds lot to mf_lots
  NavUpdatedConsumer: refreshes portfolio_snapshot (bulk UPDATE via materialized view)
  Read DB can be a separate read replica or denormalised cache

EVENT SOURCING:
  Every state change stored as immutable event in event_store table:
  { event_id, user_id, aggregate_id, event_type, payload, created_at }

  Benefits:
  - Full audit trail (SEBI requires 7 years) — reconstruct state at any point in time
  - Debugging: replay events to see what happened before a discrepancy
  - New projections: add new consumers to build new read models from existing events
  - Tax computation: FIFO lots derived from ordered stream of PURCHASE/REDEMPTION events

TRADE-OFFS:
  Eventual consistency: portfolio_snapshot may be 1-2 seconds stale vs write side
  Complexity: two databases, event schema evolution is hard
  Storage: event log grows forever (solved by snapshots + compaction)
  When to use: high read:write ratio, complex read models, audit requirements — all apply here`,
  },
  {
    id: "dq6",
    category: "Scale",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Dezerv", "ETMoney", "INDmoney"],
    question: "How does Dezerv handle the 3 PM mutual fund cut-off time under load?",
    answer: `The 3 PM cut-off is a hard regulatory boundary. Missing it by even 1 second means the investor gets tomorrow's NAV — a compliance and trust risk.

THE PROBLEM UNDER LOAD:
  Month-end (30th/31st): high investment activity (year-end tax planning, bonus deployment)
  Large SIP batch + manual lumpsum orders → thousands of concurrent submissions
  Each order: validate mandate → BSE StAR MF API call → DB write
  If API bottleneck at 2:58 PM: orders may queue past 3 PM

SOLUTION:

Authoritative timestamp (server-side):
  Request timestamped at API Gateway entry: X-Request-Time header set by Kong
  This timestamp used for NAV date determination — not DB write time, not BSE submission time
  Even if DB write happens at 3:01 PM, investor gets today's NAV if request arrived at 2:59:58 PM

Two-phase write:
  Phase 1 (< 3 PM): Accept order → write to staging table with nav_date = today, timestamp = now()
  Phase 2 (async): Submit to BSE StAR MF, update to mf_orders table
  Cut-off enforcement is at Phase 1 entry — completely decoupled from BSE API latency

Internal soft cut-off (2:45 PM):
  At 2:45 PM: alert ops team, slow down new order acceptance, drain queued orders to BSE
  At 3:00 PM: flip Redis flag cutoff_reached = 1 → all new orders get nav_date = tomorrow
  15-minute buffer: even if BSE API is slow, all pre-3PM staged orders have 15 min to be submitted

UI enforcement:
  App shows countdown: "Cut-off in 3 min 42 sec"
  At T-5min: warning banner — "Hurry! Invest before today's cut-off"
  At T=0: submit button disabled, message: "Next investment will get tomorrow's NAV"

RECONCILIATION:
  EOD job: verify all staged orders with nav_date = today were submitted before 3 PM actual timestamp
  Any discrepancy (order staged at 2:59 PM but BSE response late) → escalate to ops
  Investor communication: if NAV date assignment was wrong due to system error → manual correction with AMC`,
  },
  {
    id: "dq7",
    category: "Security",
    difficulty: "Medium",
    round: "Technical Interview",
    asked_at: ["Dezerv", "Groww", "Zerodha"],
    question: "How do you secure financial data in a wealth management platform? Walk through authentication, authorization, and data protection.",
    answer: `Financial platforms handle the most sensitive personal data — PAN, Aadhaar, bank accounts, net worth. Security must be multi-layered.

AUTHENTICATION:

JWT strategy:
  Access token: 15-minute TTL, RS256 signed (asymmetric — verify with public key, no private key needed in services)
  Refresh token: 7-day TTL, stored in Redis SET refresh:{user_id}:{jti} 1 EX 604800
  On logout: DEL refresh:{user_id}:{jti} → token immediately invalidated (Redis blacklist)
  New device: additional OTP challenge → 2FA enforced

Mobile-specific:
  Certificate pinning: app rejects connections to non-pinned certs → prevents MITM
  Biometric auth for transactions > ₹50,000 (FaceID/fingerprint as second factor)
  App-level PIN: separate from phone unlock, enforced after 5-minute background

AUTHORIZATION:

RBAC at API Gateway:
  Roles: INVESTOR / ADVISOR / ADMIN / COMPLIANCE
  Kong plugin validates JWT claims → role-based route access
  Investors cannot access other investors' data (enforced by user_id from JWT, not request param)

Resource ownership check (service-level):
  Every query: WHERE user_id = $jwt.user_id — injected by service, never from request
  Even if investor sends another user_id in payload: ignored, JWT user_id used

DATA PROTECTION:

At rest:
  PAN: encrypted with pgcrypto (AES-256), key in AWS KMS
  Aadhaar: never stored plaintext — only SHA-256 hash for deduplication
  Bank accounts: encrypted, last 4 digits for display, full number only for mandate creation
  All S3 documents: SSE-KMS with separate KMS key per document type

In transit:
  TLS 1.3 for all client connections
  mTLS between microservices (Istio service mesh with auto-rotated certificates)

Logging/monitoring:
  PII scrubbed from logs (regex masks for PAN, phone, email patterns)
  AWS CloudTrail for all KMS key usage
  Alerts on: > 5 failed login attempts (brute force), bulk data export by any service (exfiltration detection)`,
  },
  {
    id: "dq8",
    category: "Data Modelling",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Dezerv", "INDmoney", "Scripbox"],
    question: "Design the goal-based planning engine. How do you compute required SIP and monitor goal health?",
    answer: `Goal-based planning transforms abstract financial goals ("retire comfortably") into concrete actionable SIPs. The math is well-defined but the system design around it is non-trivial.

CORE MATH:

Required SIP (PMT formula):
  Given: target_amount (FV), current_corpus (PV), months_to_goal (n), expected_monthly_return (r)
  r = annual_cagr / 12

  FV = PV × (1+r)^n + PMT × [((1+r)^n - 1) / r] × (1+r)
  Solve for PMT:
  PMT = (FV - PV×(1+r)^n) / ([((1+r)^n - 1) / r] × (1+r))

  Example: ₹5Cr target in 20 years, ₹20L existing corpus, 13.5% CAGR
  r = 0.135/12 = 0.01125, n = 240
  Required SIP ≈ ₹42,500/month

CAGR ASSUMPTION:
  Basket-specific: use actual historical CAGR if basket has > 3 years of data
  Otherwise: Conservative=8%, Balanced=10%, Growth=12%, Aggressive=14%
  Inflation-adjusted version shown separately: real_cagr = nominal_cagr - 6%
  Monte Carlo variant (advanced): run 10,000 simulations with return distribution → P10/P50/P90 outcomes

GOAL HEALTH MONITORING:

Daily computation (CronJob at 10 PM after NAV update):
  For each active goal:
    current_corpus = Σ (holdings in linked basket × current NAV)
    months_remaining = DATEDIFF(target_date, today) / 30
    required_sip_now = recalculate PMT with current_corpus, months_remaining
    projected_corpus = project current_corpus + monthly SIP at expected_cagr for months_remaining
    status = projected_corpus >= target ? ON_TRACK : (>= 0.8 × target ? AT_RISK : OFF_TRACK)

  Store in goal_projections table (one row per goal per day)
  AT_RISK or OFF_TRACK: push notification + email with suggested SIP increase

STEP-UP SIP:
  Annual step-up: amount = base_amount × (1 + step_up_pct/100)^years_elapsed
  Scheduler reads step_up_pct and base_amount from SIP record → computes current period amount
  UI shows "Your SIP increases to ₹22,000 next month (10% annual step-up)"

MILESTONE NOTIFICATIONS:
  Tracked in goal_milestones table: { goal_id, pct: 25/50/75/100, notified: bool }
  Daily job: if current_corpus crosses milestone threshold → push + mark notified
  One-time notifications (notified flag prevents repeat)`,
  },
  {
    id: "dq9",
    category: "Estimation",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Dezerv", "INDmoney", "ETMoney"],
    question: "Before designing the NAV pipeline and SIP scheduler, walk me through a back-of-the-envelope estimation for Dezerv's scale.",
    answer: `This is the "size before you design" step — the numbers decide
whether a single Postgres instance is fine or whether you need
caching, partitioned schedulers, and a CQRS read model.

STATE YOUR ASSUMPTIONS OUT LOUD:
• ~1L (100,000) active investors, ₹5,000Cr+ AUM → ~₹5L avg portfolio
• 500K+ monthly SIP mandates across 50+ curated baskets
• 10,000+ MF schemes get a NAV update from AMFI every night at 9 PM
• ~20% of investors check their portfolio after the nightly NAV update
• Hard MF cut-off at 3 PM IST, soft internal cut-off at 2:45 PM

DERIVE THE NUMBERS THAT MATTER:

1. NAV fan-out (decides caching strategy)
   100K investors × ~8 funds held avg ≈ 800K (investor, fund) pairs
   revalued every night
   → ONE NAV update for a popular fund (held by 60% of investors)
     triggers ~60K portfolio recomputations — this is WHY NAV is
     cached in Redis (mf:nav:{isin}), read millions of times/day but
     written only ~10K times/day

2. SIP scheduler load (decides the 20-thread partitioned cron design)
   500K SIPs ÷ ~21 business days ≈ 24K/day average, but 1st/5th
   concentration can push 100K+ in a single day
   100K ÷ 20 parallel threads ≈ 5,000 executions/thread × ~200ms
   ≈ ~17 min/thread — fits inside the 1 AM CronJob window

3. Cut-off burst (decides the 2:45 PM soft cut-off)
   5% of 100K investors placing month-end orders in the last 15 min
   ≈ 5,000 orders ≈ ~5.5/sec, × ~4 basket components ≈ ~22 orders/sec
   → That burst, hitting BSE StAR MF right before a hard regulatory
     deadline, is WHY a 15-minute internal buffer exists

4. Portfolio read QPS (decides CQRS)
   ~20K daily active investors, peak ≈ ~50 reads/sec
   → At 50 reads/sec with multi-table JOINs (holdings × nav_history
     × goals), Postgres contention is real — this is WHY
     portfolio_snapshot (a materialised view) exists

5. Tax computation scale (decides ClickHouse)
   100K investors × ~36 SIP lots (3-year SIP) × multiple basket funds
   ≈ 3.6M+ purchase lots
   → FIFO matching across millions of lots at financial-year-end is
     WHY tax reports run on ClickHouse, not PostgreSQL

WHY THIS MATTERS IN THE INTERVIEW:
The interviewer is checking whether you connect "800K nightly
revaluations" → "Redis NAV cache", and "~22 orders/sec burst before a
hard deadline" → "soft cut-off buffer". State the number, then name
the component or design decision it justifies.`,
    followups: [
      "How would these numbers change if Dezerv's average investor held 50 funds instead of 8?",
      "If a new release causes a 10x spike in portfolio reads right after the 9:30 PM notification, which number breaks first?",
      "How do you estimate the storage growth rate of the event_store table over 5 years?",
    ],
  },
  {
    id: "dq10",
    category: "Architecture",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Dezerv", "Groww", "Stripe"],
    question: "Dezerv's microservices (Auth, KYC, Portfolio, Order, Market Data, Recommendation) all touch regulated financial data. How would you put a service mesh between them, and what does it buy you for SEBI compliance?",
    answer: `The Security Design section already says "mTLS between internal
microservices (Istio service mesh)" — this question is about what
that actually delivers operationally and for compliance.

MAP THE REQUIREMENT TO MESH PRIMITIVES:
• SEBI RIA expects encrypted "data in transit" for regulated data
  (KYC docs, bank mandates, portfolio values) — PeerAuthentication
  STRICT mTLS satisfies this mesh-wide, in one resource
• "Investment advice log" traceability — the mesh's access logs
  capture caller identity (SPIFFE ID) for every hop, for free
• Order Service depends on Market Data Service, which depends on
  external AMC feeds Dezerv doesn't control — that's exactly what
  outlierDetection circuit breaking is for

ARCHITECTURE — DATA PLANE + CONTROL PLANE:

1. Data plane — Envoy sidecar per service pod
   • DestinationRule on market-data-service: outlierDetection ejects
     it after 5 consecutive 5xx in 10s — Order Service fails fast on
     a bad AMC feed instead of blocking SIP execution
   • VirtualService on recommendation-engine: weighted canary routing
     (95/5 v1/v2) plus retries (attempts: 2, perTryTimeout: 500ms) for
     the ML model server
   • mTLS (PeerAuthentication STRICT) on every hop — Auth, User, KYC,
     Portfolio, Recommendation, Order, Market Data

2. Control plane — Istio / Consul / AWS App Mesh
   • One outlierDetection + mTLS policy applies to the whole fleet —
     no per-service config drift across 7 services
   • Canary rollouts for Recommendation Engine model versions (the
     rule-based → ML scoring transition) ship via VirtualService
     weight changes, not redeploys

WHY THIS MATTERS FOR DEZERV SPECIFICALLY:
• Compliance evidence — mTLS + per-hop access logs are exactly the
  artifact a SEBI RIA annual audit asks for
• Blast radius containment — a KYC Service incident or a Market Data
  Service outage doesn't cascade into Order Service failing SIPs
• Safe ML iteration — Recommendation Engine ships new model versions
  behind a canary without touching Order/Portfolio code

TRADE-OFFS TO MENTION:
• ~1-2ms per hop — negligible vs. the 5-minute NAV SLA, but worth
  flagging for the < 10 min KYC flow
• Cert rotation (~24h) must be monitored — an expired cert at 2:55 PM
  breaking Order → Market Data right before the 3 PM cut-off is the
  worst-case failure mode
• Control-plane outage: sidecars keep enforcing last-known policy, so
  existing traffic (including pre-cut-off orders) is unaffected, but
  new canary shifts can't roll out until it recovers`,
    followups: [
      "If the mesh control plane goes down at 2:50 PM, what happens to in-flight 3 PM cut-off orders?",
      "How would you extend mTLS identity (SPIFFE) to also cover the AI Investment Advisor's RAG retrieval calls to Elasticsearch?",
      "Where does the mesh's mTLS end and BSE StAR MF / CAMS/KFintech's external API security begin?",
    ],
  },
];
