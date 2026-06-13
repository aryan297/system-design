export const STRIPE_HLD = {
  title: "Stripe — High Level Design",
  subtitle: "Global payments infrastructure — $1T+ payment volume, 200+ countries, API-first developer platform",
  overview: `Stripe is the world's leading payment infrastructure company, processing over $1 trillion in payment volume annually for millions of businesses from solo founders to Fortune 500 companies.

Unlike PayPal which built a consumer wallet, Stripe's bet was always developer-first: a clean REST API, predictable JSON responses, idiomatic SDKs in every language, and documentation so good that engineers could go live without ever talking to sales. That insight built a $50B company.

Core engineering challenges: processing payments with exactly-once semantics (money cannot be double-charged or lost), fraud detection that runs in < 100ms without killing conversion, a multi-tenant platform where one noisy customer cannot degrade others, and a global network that routes payments through the optimal acquiring bank per country to maximise approval rates.`,

  metrics: [
    { label: "Payment volume", value: "$1T+", note: "annually (2023)" },
    { label: "Countries", value: "200+", note: "Stripe Checkout available" },
    { label: "API uptime", value: "99.9999%", note: "six nines — ~30s downtime/year" },
    { label: "Fraud detection", value: "< 100ms", note: "Radar ML inference" },
    { label: "API latency (P99)", value: "< 500ms", note: "charge creation globally" },
    { label: "Currencies", value: "135+", note: "supported for payouts" },
    { label: "Payment methods", value: "100+", note: "cards, wallets, BNPL, bank" },
    { label: "API requests/day", value: "500M+", note: "across all products" },
  ],

  diagram: `
┌────────────────────────────────────────────────────────────────────────┐
│                        MERCHANT LAYER                                  │
│  Stripe.js (browser) · Mobile SDKs · Server SDKs (Node/Python/Go/...) │
└──────────────────────────┬─────────────────────────────────────────────┘
                           │  HTTPS / TLS 1.3
                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   API GATEWAY (Edge — 200+ PoPs)                       │
│         SERVICE MESH — Envoy sidecar attached to every service         │
│    TLS Termination · Auth (API Key / Restricted Keys) · Rate Limiting  │
│    Request Routing · Idempotency Key Dedup · Versioning (?api=2024-11) │
│      mTLS · Load Balancing · Retries · Circuit Breaking · Tracing      │
└───┬──────────┬───────────┬──────────────┬───────────────┬──────────────┘
    │          │           │              │               │
    ▼          ▼           ▼              ▼               ▼
┌────────┐ ┌────────┐ ┌─────────┐ ┌──────────┐ ┌─────────────────┐
│Charges │ │Payment │ │ Stripe  │ │  Stripe  │ │  Stripe Billing │
│  API   │ │Intents │ │ Connect │ │  Radar   │ │  Subscriptions  │
└───┬────┘ └───┬────┘ └────┬────┘ └────┬─────┘ └─────────────────┘
    │          │            │           │
    └──────────┴────────────┘           │
                │                       │
                ▼                       ▼
┌──────────────────────────┐  ┌────────────────────────────────────────┐
│   PAYMENT ORCHESTRATOR   │  │         RADAR (Fraud Engine)           │
│  Network routing · Retry │  │  ML model · Rules engine · 3DS2 auth  │
│  Fallback acquiring      │  │  Chargeback prediction · Risk scoring  │
└──────────┬───────────────┘  └────────────────────────────────────────┘
           │
    ┌──────┴────────┐
    ▼               ▼
┌─────────┐   ┌──────────┐
│  Card   │   │  Bank /  │
│Networks │   │  ACH /   │
│Visa/MC  │   │  SEPA    │
└─────────┘   └──────────┘
           │
           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                                    │
│  PostgreSQL (charges, customers, plans) · Redis (idempotency, cache)   │
│  Kafka (event streaming) · S3 (receipts, exports) · ClickHouse (stats) │
│  Vault (card data PCI DSS) · ElasticSearch (dispute search, logs)      │
└────────────────────────────────────────────────────────────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "API Design & Payment Intents",
      sections: [
        {
          title: "The API-First Philosophy — Why Stripe Won",
          content: `Stripe's architectural advantage is not technical — every competitor can process a Visa card. The advantage is the API contract: predictable, versioned, composable.

API VERSIONING:
  Every request can specify api-version: 2024-11-20 in headers or per API key default
  Stripe maintains backward compatibility for EVERY version ever shipped
  A merchant on 2015-02-18 API today gets identical responses — no forced migrations
  This is enforced by version translation layers: new internal models map to old API shapes
  Cost: maintaining version adapters forever. Benefit: merchant trust → low churn

IDEMPOTENCY KEYS:
  Client sends Idempotency-Key: uuid in header
  Stripe stores: hash(api_key + idempotency_key) → {response, status, created_at} in Redis
  TTL: 24 hours
  If same key arrives again: return cached response immediately, no second charge
  Critical for mobile: "charge failed" on client but succeeded on server → retry is safe

PAYMENT INTENTS (vs old Charges API):
  Old Charges API: one-shot — either succeeds or fails
  Payment Intents: state machine — tracks the full authentication + capture lifecycle
  States: created → requires_payment_method → requires_confirmation →
          requires_action (3DS) → processing → succeeded / canceled

  Why it matters: Strong Customer Authentication (SCA) in EU requires 3DS2 for most payments
  Payment Intent holds state across the redirect dance, resuming exactly where it left off`,
        },
        {
          title: "Stripe.js & Elements — Keeping Card Data off Merchant Servers",
          content: `The biggest PCI DSS compliance burden for merchants is handling raw card numbers. Stripe's solution: the card never touches the merchant's server.

TOKENISATION FLOW:
  1. Merchant loads Stripe.js from Stripe's CDN (integrity-checked)
  2. Stripe.js renders card input fields as iframes hosted on stripe.com domain
     → Merchant's JS cannot read values inside the iframe (same-origin policy)
  3. On submit: Stripe.js collects card data directly, sends to Stripe's tokenisation endpoint
  4. Returns a PaymentMethod ID (pm_abc123) — a reference, not the card number
  5. Merchant sends pm_abc123 + amount to their own server → server calls Stripe API
  6. Card data never transits or touches merchant infrastructure

PCI SCOPE REDUCTION:
  Without Stripe.js: merchant is PCI DSS Level 1 — audit, pen test, quarterly scans
  With Stripe.js: merchant is SAQ A — just a self-assessment questionnaire
  This is a $50,000+ annual compliance cost difference — enormous merchant incentive

STRIPE CHECKOUT (hosted page):
  Stripe hosts the entire checkout page — merchant redirects to stripe.com/pay/...
  Stripe handles: card collection, 3DS, Apple Pay, Google Pay, Link autofill
  Even simpler: merchant is completely out of PCI scope
  Trade-off: less customisation (though CSS Variables API allows visual theming)`,
        },
        {
          title: "Back-of-the-Envelope Estimation",
          content: `"$1T/year, 500M+ API requests/day" sounds like one big number. It
decomposes into five very different numbers, each sizing a different
box in the diagram.

ASSUMPTIONS:
  • $1T+ payment volume/year, 500M+ API requests/day (all products)
  • Average charge size ≈ $50 (blend of micro-SaaS subscriptions and B2B invoices)
  • Idempotency keys: Redis, 24h TTL
  • Webhook retry window: 72 hours
  • Radar: <100ms total budget, 1000+ features per decision

1. API REQUEST THROUGHPUT (Gateway + Idempotency Redis):
   500M requests/day ÷ 86,400s ≈ 5,787 requests/sec average
   With a 24h idempotency-key TTL, steady-state Redis holds roughly
   one key per request seen in the last 24h:
   5,787/sec × 86,400s ≈ 500M keys resident at any moment
   → This is what sizes the idempotency-key Redis cluster — not the
     request RATE, but the resident KEY COUNT from a full day's traffic

2. PAYMENT VOLUME → CHARGE RATE (Payment Intents / Citus):
   $1T/year ÷ 365 ÷ 86,400s ≈ $31,700/sec in payment volume
   At ~$50/charge average: ≈ 634 charges/sec average, ~3,000+ TPS at
   Black Friday peak (5x average)
   → Sizes Payment Intents Service's distributed PostgreSQL (Citus)
     write throughput and the Payment Orchestrator's routing-decision rate

3. RADAR FEATURE STORE LOAD:
   Every charge triggers Radar's feature extraction: 20+ Redis keys
   pulled in one pipelined round trip
   At 3,000+ TPS peak → ~3,000 pipelined RTTs/sec to Radar's feature
   store — a SEPARATE Redis cluster from idempotency keys, tuned for
   sub-5ms p99 (it's inside the 100ms Radar budget, not the 24h-TTL
   dedup store)

4. WEBHOOK DELIVERY BACKLOG (per-merchant, not global):
   A mid-size platform processing 100 charges/sec generates ~100
   webhook_events/sec. If THAT merchant's endpoint is down for the full
   72h retry window:
   100/sec × 259,200s ≈ 26M pending webhook_deliveries rows — for ONE
   merchant
   → With thousands of merchants experiencing partial outages at any
     time, webhook_deliveries needs a (status, next_attempt_at) partial
     index, or the delivery worker's query becomes a full table scan

5. NETWORK TOKEN $ IMPACT (Card Networks):
   ~2% of charge attempts fail on "card expired" before tokenization
   On $1T/year, that's ~$20B/year in failed-then-retried volume
   Network tokens (auto-updated on reissue) cut "card expired" declines
   by ~30% → ~$6B/year in recovered approvals
   → Ties the Card Networks box (Visa VTS / Mastercard MDES) directly
     to revenue, not just reliability

INTERVIEW PUNCH LINE:
"$1T/year and 500M requests/day aren't the same number wearing different
clothes. 5,787 req/sec sizes the idempotency Redis at ~500M resident keys;
634-3,000 TPS sizes Payment Intents' Citus cluster; 3,000 pipelined RTTs/sec
sizes Radar's SEPARATE feature-store Redis; 26M backlog rows is a PER-MERCHANT
worst case that drives an index design, not a capacity number; and the
$6B/year network-token recovery shows that a reliability feature (auto card
updates) is also a revenue feature."`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Payment Orchestration & Network Routing",
      sections: [
        {
          title: "Smart Routing — Maximising Approval Rates",
          content: `A declined payment is lost revenue. Stripe's payment orchestrator routes each charge to maximise the probability of approval.

THE PROBLEM:
  Card networks (Visa, Mastercard) don't directly process payments — acquiring banks do
  Stripe has relationships with 40+ acquiring banks globally
  An Amex card issued in Australia processed through a US acquirer → lower approval rate
  Domestic routing (AU card → AU acquirer) → +5–8% approval rate improvement

STRIPE'S ROUTING LOGIC:
  For each payment, evaluate:
    card_country matches acquirer_country? (domestic routing preference)
    card_type: Amex → only Amex-certified acquirers
    currency: prefer acquirer that settles in same currency (avoids FX conversion loss)
    acquirer health: real-time success rates per acquirer (circuit-break failing acquirers)
    cost: interchange fees vary by acquirer — optimise for margin after approval

ADAPTIVE ROUTING:
  ML model trained on 100B+ transactions predicts: P(approve | card, acquirer, amount, merchant)
  Routes to highest-probability acquirer first
  On decline: smart retry with next acquirer (only if decline code suggests network issue, not fraud)
  Decline codes: do_not_honor → never retry. insufficient_funds → no retry. card_network_error → retry

NETWORK TOKENS:
  Replace raw PAN (card number) with a network-specific token per merchant
  Benefits: merchant-specific — token useless if stolen by another merchant
  Auto-updated when card expires or is reissued → reduces "card expired" declines by ~30%
  Issued by Visa (VTS), Mastercard (MDES), Amex`,
        },
        {
          title: "Exactly-Once Payment Processing",
          content: `The hardest guarantee in distributed payments: charge the customer exactly once, no matter what.

THE FAILURE MODES:
  1. Merchant server retries → Stripe receives same charge twice → double-charge (catastrophic)
  2. Stripe calls acquirer → network timeout → did the charge go through? → retry risk
  3. Stripe DB write succeeds but response never reaches merchant → merchant retries

STRIPE'S SOLUTION — LAYERED IDEMPOTENCY:

Layer 1 — Merchant to Stripe (already covered):
  Idempotency-Key header → Redis dedup → same response, no second processing

Layer 2 — Stripe to Acquirer:
  Every acquirer call has a unique transaction_id (Stripe-generated UUID)
  On timeout: query acquirer for status of that transaction_id before retrying
  Acquirer must support idempotent inquiry endpoints (contractual requirement)

Layer 3 — Stripe internal DB:
  Charge record written with status=processing before calling acquirer
  Acquirer response updates status to succeeded/failed
  If Stripe crashes between write and acquirer call: recovery job replays from processing state
  Two-phase commit avoided — Stripe uses the charge record itself as the coordination primitive

OUTBOX PATTERN for webhooks:
  Charge succeeds → write to charges table + webhook_events table in same DB transaction
  Separate webhook worker reads webhook_events, delivers, marks delivered
  On delivery failure: exponential backoff retry up to 72 hours
  Webhook endpoint must be idempotent (Stripe can deliver same event multiple times)`,
        },
        {
          title: "Service Mesh — Sidecar Proxy Pattern (Envoy/Istio)",
          content: `The "acquirer health: circuit-break failing acquirers" line in Smart
Routing is application-level logic the Payment Orchestrator already does
for EXTERNAL acquirer calls. A service mesh adds the same protection for
the INTERNAL hops — Charges API → Payment Intents → Payment Orchestrator
→ Radar — without every team re-implementing it.

WHY A MESH FITS:
  Payment Intents → Radar is the tightest internal hop: Radar's whole
  budget is 100ms (20ms features + 40ms ML + 10ms rules + 30ms decision).
  At ~3,000 TPS peak, one slow Radar replica can blow that budget for
  thousands of charges/sec before anyone notices.
  Stripe also runs blue/green deploys (1% → 5% → 25% → 100%) — today
  that's a deployment-pipeline concern; a mesh makes it a traffic-routing
  primitive any service can use, including Radar's ML model versions.

DATA PLANE:
  Envoy sidecars on Charges API, Payment Intents Service, Stripe Connect,
  Stripe Radar, Stripe Billing, Payment Orchestrator, and Vault.

CONTROL PLANE:
  Istio control plane, deployed per-region across the four active-active
  regions (US-East, US-West, EU-West, AP-Southeast) — matching the
  multi-region architecture in Phase 6.

WHAT THIS BUYS:
  1. Radar circuit breaking — tight outlierDetection (5s window) so a
     degrading Radar replica is ejected fast enough to protect the 100ms
     budget, mirroring the "Radar unavailable → allow with elevated risk
     flag" graceful-degradation path, but catching it BEFORE a full outage
  2. Payment Orchestrator load balancing — LEAST_REQUEST across replicas
     handling 634-3,000+ TPS of routing decisions
  3. Radar model canary — the existing blue/green percentages become a
     VirtualService weight, with a header-based override so the fraud
     team can force-route specific test traffic to a new model
  4. Vault access control — AuthorizationPolicy enforces "only Payment
     Intents Service and Tokenisation Service may call Vault" as a mesh
     rule, layered ON TOP of (not instead of) Vault's network-isolated VPC.
     Two independent enforcement points for the PCI DSS Level 1 boundary
  5. mTLS + tracing — every hop encrypted across all 4 regions; a single
     trace ID follows a charge from Charges API through Radar, useful for
     explaining a specific decision during a dispute

DIAGRAM:
  The SERVICE MESH band inside API GATEWAY extends down through Charges
  API, Payment Intents, Stripe Connect, Stripe Radar, Stripe Billing,
  the Payment Orchestrator, and Vault.

TRADE-OFFS:
  • Card Networks (Visa/Mastercard) and Bank/ACH/SEPA rails are EXTERNAL —
    OUT of the mesh. The Payment Orchestrator's acquirer-health scoring
    stays as application logic; mesh circuit breaking is a complementary,
    lower-level net for Stripe-internal hops, not a replacement for
    acquirer routing intelligence
  • PostgreSQL/Citus, Redis (both clusters), Kafka, S3, ClickHouse,
    Elasticsearch — OUT of the mesh, direct driver connections
  • Sidecar latency (~1-2ms) is real money inside a 100ms Radar budget —
    it's why Radar's own feature-extraction stays as pipelined Redis
    calls within ONE service, not further decomposed into more hops
  • Six-nines (99.9999%) leaves ~31.5s of downtime per YEAR — the control
    plane MUST fail open (sidecars keep last-known config); a control-plane
    blip becoming a payment outage would burn the entire annual budget
    in seconds`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Radar — Fraud Detection",
      sections: [
        {
          title: "ML Fraud Detection at 100ms Latency",
          content: `Radar processes every payment in real-time, computing a fraud risk score that influences the authorisation decision — all within 100ms.

RADAR ARCHITECTURE:

Feature extraction (< 20ms):
  From the payment event, extract 1000+ features including:
  - Card velocity: how many charges on this card in last 1h / 24h / 7d
  - Email velocity: charges on this email across all Stripe merchants
  - Device fingerprint: browser characteristics, IP, timezone consistency
  - Behavioural signals: time from page load to checkout (too fast = bot?)
  - Historical: has this card ever had a chargeback?
  - Network graph: is this card linked to known fraud rings? (graph features)

ML inference (< 40ms):
  Gradient boosted tree model (LightGBM) — chosen for interpretability + speed
  Stripe has 500B+ data points from all merchants → massive training advantage over per-merchant models
  Model outputs: fraud_score (0–100), chargeback_probability, card_testing_flag

Rules engine (< 10ms):
  Merchants write custom rules: "block if billing_country != card_country AND amount > $500"
  Rules evaluated against feature set using a custom DSL
  Pre-compiled to bytecode for deterministic sub-millisecond evaluation

Decision (< 30ms):
  Combine: ML score + rules engine output + 3DS authentication result
  Decision: allow / block / request_3ds (step-up authentication)
  3DS adds friction but shifts chargeback liability to card issuer — often worth it`,
        },
        {
          title: "Chargeback Management & Dispute Automation",
          content: `Chargebacks cost merchants $2–$5 per disputed dollar (fees + lost goods). Stripe automates evidence submission to win disputes.

CHARGEBACK LIFECYCLE:
  Customer disputes charge with their bank → bank sends retrieval request to card network
  Card network notifies Stripe → Stripe freezes funds from merchant balance
  Merchant has 7–21 days to submit evidence → bank reviews → rules for merchant or customer

STRIPE'S AUTOMATION:
  Stripe Sigma and Dashboard surface dispute details immediately
  Pre-populated evidence package for card-present / digital goods / physical goods:
    - Original charge details + IP address + device fingerprint
    - Email confirmation sent to customer
    - Delivery confirmation (if shipping integration active)
    - 3DS authentication result (if used — shifts liability away from merchant)
    - Customer's previous purchases (shows pattern of use)

CHARGEBACK PREDICTION:
  Radar scores each transaction with chargeback_probability
  High-probability transactions: prompt merchant to require 3DS or additional verification
  Post-dispute: outcome fed back to model — winning / losing patterns improve future predictions

EARLY FRAUD WARNINGS:
  Visa and Mastercard send EFW alerts 24–72h before formal chargeback
  Stripe auto-refunds if: merchant enables early refund setting + fraud_score is high
  Proactive refund = no chargeback fee, no dispute record → cheaper than fighting`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Stripe Connect — Marketplace Payments",
      sections: [
        {
          title: "The Marketplace Problem — Splitting Payments at Scale",
          content: `Marketplaces like Shopify, Lyft, and Airbnb collect money from customers and pay it out to sellers/drivers/hosts. This is fundamentally different from a single merchant accepting payments.

THREE CONNECT ACCOUNT TYPES:

Standard accounts:
  Sellers have their own Stripe account, connected to the platform
  Sellers see charges in their own Stripe Dashboard
  Platform charges application fees on transactions
  Use case: Shopify merchants

Express accounts:
  Stripe hosts an onboarding flow (KYC, bank account) embedded in the platform's UI
  Sellers do not have full Stripe Dashboard access
  Platform controls the branding and experience
  Use case: DoorDash drivers, Uber drivers

Custom accounts (Stripe previously called Managed):
  Platform owns the full UX — sellers never know Stripe is involved
  Platform responsible for all compliance, KYC, support
  Maximum control, maximum responsibility
  Use case: large platforms with dedicated payment teams

FUND FLOW OPTIONS:

Destination charges:
  Platform charges customer → immediately split to connected account → platform keeps fee
  "Customer charged → seller paid → platform takes cut" in one API call

Separate charges + transfers:
  Platform charges customer (full amount lands in platform account)
  Platform later initiates Transfer to connected accounts
  Useful: when split ratio is determined after charge (e.g. auction final price)`,
        },
        {
          title: "Connect Payouts & Treasury",
          content: `Paying out sellers globally — 135 currencies, 50+ countries, multiple payout methods.

PAYOUT TIMING:
  Standard: T+2 (charge cleared → 2 business days → funds in seller bank)
  Instant payouts: for an 0.5% fee, sellers receive funds within 30 minutes via push-to-card (Visa Direct / MC Send)
  Daily rolling reserve: Stripe may hold % of payouts for high-risk merchants as chargeback buffer

STRIPE TREASURY:
  Embedded banking-as-a-service: platforms can offer sellers a Stripe-managed bank account
  Sellers hold balance in Stripe Treasury account, get a virtual debit card
  Funds available immediately for spending without bank transfer lag
  Underwritten by Stripe Banking-as-a-Service partners (Thread Bank, CFSB)
  Use case: Shopify Balance — Shopify merchants spend revenue directly without withdrawal

GLOBAL PAYOUTS:
  Cross-border: charge in USD → payout in EUR → Stripe handles FX at near-interbank rates
  Local bank rails: SEPA (EU), BACS (UK), IMPS (India), PIX (Brazil) — per-country optimisation
  Payout currency: Stripe holds currency in that currency to avoid double conversion`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "Webhooks, Events & Developer Experience",
      sections: [
        {
          title: "Webhook Delivery — At-Least-Once with Deduplication",
          content: `Webhooks are Stripe's primary way of notifying merchants about asynchronous events — payment succeeded, dispute opened, subscription renewed.

EVENT ARCHITECTURE:
  Every state change in Stripe creates an Event object: charge.succeeded, invoice.paid, etc.
  Events are immutable and have stable IDs (evt_abc123)
  Events stored in PostgreSQL, replayed via Kafka consumer to webhook delivery workers

DELIVERY GUARANTEES:
  At-least-once: Stripe will retry until your endpoint returns 2xx
  Retry schedule: immediate → 5min → 30min → 2hr → 5hr → 10hr → 24hr (× 3 days)
  Total retry window: 72 hours
  After 72 hours: event marked as failed, merchant must query API to reconcile

MERCHANT RESPONSIBILITY:
  Must make webhook handler idempotent: same event may arrive multiple times
  Best practice: use event.id as idempotency key in merchant's own DB
  Check event.type before processing — never blindly trust event data, verify via API

WEBHOOK SECURITY:
  Stripe signs every webhook: Stripe-Signature header with HMAC-SHA256
  Signature = timestamp + "." + HMAC(secret, timestamp + "." + payload)
  Timestamp prevents replay attacks (reject if > 5 minutes old)
  Merchant verifies signature using their webhook signing secret

STRIPE CLI & LOCAL DEVELOPMENT:
  stripe listen --forward-to localhost:3000/webhooks
  Tunnels Stripe webhook events to local development server
  stripe trigger charge.succeeded — fire test events without real payments
  Significantly improves DX vs ngrok-based solutions`,
        },
        {
          title: "Stripe Sigma & Data Infrastructure",
          content: `Stripe gives merchants SQL access to their own payment data — a significant developer experience differentiator.

STRIPE SIGMA:
  Merchants write SQL queries against their own Stripe data in a sandboxed environment
  Table: charges, customers, subscriptions, invoices, disputes, payouts
  Refreshed daily; results downloadable as CSV or connectable to BI tools
  Use case: "Show me all failed charges in the last 30 days by decline code and country"

INTERNAL DATA INFRASTRUCTURE:

Event stream: every API action → Kafka topic → multiple consumers:
  - Webhook delivery worker
  - Radar feature computation (real-time fraud features)
  - Analytics pipeline → ClickHouse (merchant dashboards)
  - Audit log → Elasticsearch

Data warehouse: ClickHouse for analytical queries
  Columnar storage → fast aggregations on billions of rows
  Merchant-level aggregations computed and cached for Dashboard display
  Example query: sum of charge volume by day for last 90 days → < 100ms

PCI DATA ISOLATION:
  Card numbers, CVVs: stored in Stripe Vault — separate infrastructure, network-isolated
  Vault access: only Payment Service and Tokenisation Service can query
  All other services work only with PaymentMethod IDs — never raw card data
  HSMs (Hardware Security Modules) for card data encryption — FIPS 140-2 Level 3`,
        },
      ],
    },
    {
      id: "phase6",
      label: "Phase 6",
      title: "Reliability, Multi-Region & Scale",
      sections: [
        {
          title: "Six Nines Availability — How Stripe Achieves 99.9999%",
          content: `99.9999% uptime = 31.5 seconds of downtime per year. This is achieved through deep redundancy, not heroics.

MULTI-REGION ACTIVE-ACTIVE:
  Stripe runs in multiple AWS regions (US-East, US-West, EU-West, AP-Southeast)
  Traffic split across regions via latency-based DNS routing (Route 53)
  Each region is fully capable of processing all payments independently
  Database: distributed PostgreSQL (Citus / custom sharding) with cross-region replication

REGIONAL FAILOVER:
  Health checks every 10 seconds per region
  On region failure: DNS TTL 30s → traffic shifts to healthy regions within ~60 seconds
  Stateless API servers → no session state to migrate
  Critical: payment state (charges table) must be replicated before failover (RPO = seconds)

GRACEFUL DEGRADATION:
  Radar unavailable → allow payment with elevated risk flag (don't block entire checkout)
  3DS service slow → skip 3DS for low-risk transactions (Radar score < 20)
  Dashboard APIs throttled during incident → core payment processing unaffected

CAPACITY:
  API servers: auto-scaling EC2 fleet, target 60% CPU utilisation
  Peaks: Black Friday, end-of-month billing runs trigger pre-scaled capacity
  Load shedding: if queue depth exceeds threshold → return 429 to low-priority API keys first
  Tier 1 customers (high-volume) have reserved capacity that is never shed

TESTING:
  Chaos engineering: randomly terminate instances, inject latency between services
  Production shadow traffic: replay real transactions against new code before rollout
  Blue/green deployments: new version receives 1% → 5% → 25% → 100% traffic gradually`,
        },
        {
          title: "PCI DSS Compliance at Scale",
          content: `Every payment processor must comply with PCI DSS (Payment Card Industry Data Security Standard). At Stripe's scale this is a continuous engineering discipline.

PCI DSS SCOPE:
  Level 1 (highest): > 6M transactions/year → annual on-site audit by Qualified Security Assessor
  Stripe certifies as a Level 1 Service Provider — audited annually
  Audit scope: cardholder data environment (CDE) — every system that touches card data

KEY CONTROLS:
  Network segmentation: CDE in isolated VPC, no internet access, strict security group rules
  Encryption at rest: AES-256 for all stored card data, HSMs for key management
  Encryption in transit: TLS 1.2+ enforced, TLS 1.0/1.1 disabled
  Access control: MFA for all admin access, least-privilege IAM, PAM for production access
  Monitoring: every CDE access logged, anomaly detection on data access patterns
  Vulnerability management: weekly automated scans, quarterly pen tests, bug bounty

MERCHANT COMPLIANCE:
  Stripe's biggest value to merchants: taking most PCI scope off them
  Stripe publishes PCI Attestation of Compliance (AOC) that merchants share with their banks
  Merchants using Stripe.js + Stripe Checkout: SAQ A (simplest — just a questionnaire)
  Merchants with server-side card handling: SAQ D (full audit) — Stripe cannot help with this`,
        },
      ],
    },
  ],
};

export const STRIPE_LLD = {
  title: "Stripe — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of core Stripe services",

  components: [
    {
      id: "chargesService",
      title: "Payment Intents Service — LLD",
      description: "Stateful payment lifecycle manager handling auth, 3DS, capture and cancellation",
      api: `POST /v1/payment_intents
Authorization: Bearer sk_live_...

{
  "amount": 2000,                          // in smallest currency unit (cents)
  "currency": "usd",
  "customer": "cus_abc123",
  "payment_method": "pm_xyz789",
  "confirm": true,
  "return_url": "https://merchant.com/return",
  "idempotency_key": "order_9876_attempt_1",
  "metadata": { "order_id": "9876" },
  "statement_descriptor": "ACME STORE",
  "capture_method": "automatic"            // or "manual" for auth-only
}

Response 200 (success):
{
  "id": "pi_3OxK2eLkdIwHu7ix0abc1234",
  "object": "payment_intent",
  "amount": 2000,
  "currency": "usd",
  "status": "succeeded",
  "charges": {
    "data": [{
      "id": "ch_3OxK2eLkdIwHu7ix0xyz",
      "amount": 2000,
      "captured": true,
      "outcome": { "network_status": "approved_by_network", "type": "authorized" },
      "payment_method_details": {
        "card": { "brand": "visa", "last4": "4242", "exp_month": 12, "exp_year": 2026 }
      }
    }]
  },
  "created": 1714450000
}

Response 402 (requires action / 3DS):
{
  "status": "requires_action",
  "next_action": {
    "type": "use_stripe_sdk",
    "use_stripe_sdk": { "type": "three_d_secure_redirect", "stripe_js": "..." }
  }
}

-- State Machine --
created → requires_payment_method → requires_confirmation
       → requires_action (3DS) → processing → succeeded
                                             → requires_capture (manual capture)
       → canceled (at any pre-succeeded stage)`,
    },
    {
      id: "radarService",
      title: "Radar Fraud Service — LLD",
      description: "Real-time ML fraud scoring and rules engine running on every payment attempt",
      api: `-- Internal call from Payment Intents Service --
POST /internal/radar/evaluate
{
  "payment_intent_id": "pi_abc123",
  "amount": 2000,
  "currency": "usd",
  "card_fingerprint": "Xt5EWLLDS7FJjR1c",
  "card_country": "US",
  "billing_zip": "94107",
  "ip_address": "192.168.1.1",
  "device_fingerprint": "dv_abc...",
  "customer_id": "cus_abc123",
  "merchant_id": "acct_merchant_xyz",
  "user_agent": "Mozilla/5.0...",
  "session_age_seconds": 145
}

Response (< 100ms):
{
  "risk_score": 23,                  // 0-100, higher = more risky
  "risk_level": "normal",            // normal / elevated / highest
  "outcome": "allow",                // allow / block / request_3ds
  "fraud_signals": [],
  "chargeback_probability": 0.008,  // 0.8%
  "rule_matches": [
    { "rule_id": "rule_velocity_3", "name": "Card used 5+ times in 1h", "matched": false }
  ]
}

-- Feature Store Schema (Redis, computed in real-time) --
card_velocity_1h:    {card_fingerprint} → count of charges in last 1h across ALL Stripe merchants
email_velocity_24h:  {email_hash}       → count of charge attempts in last 24h
ip_charge_count_1h:  {ip_address}       → charge count from this IP last 1h
card_first_seen:     {card_fingerprint} → timestamp of first ever Stripe charge
card_chargeback_count: {card_fingerprint} → lifetime chargeback count

-- Rules Engine DSL --
:card_country: != :ip_country: AND :amount: > 50000
  → outcome: request_3ds

:risk_score: > 75
  → outcome: block

:card_velocity_1h: > 10
  → outcome: block, tag: card_testing`,
    },
    {
      id: "webhookService",
      title: "Webhook Delivery Service — LLD",
      description: "Reliable at-least-once event delivery with HMAC signing and exponential backoff",
      api: `-- Event Schema (PostgreSQL) --
CREATE TABLE events (
  id           TEXT PRIMARY KEY,             -- evt_abc123
  merchant_id  TEXT NOT NULL,
  type         TEXT NOT NULL,                -- charge.succeeded, invoice.paid, etc.
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  api_version  TEXT NOT NULL
);

CREATE TABLE webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        TEXT REFERENCES events(id),
  endpoint_url    TEXT NOT NULL,
  status          TEXT DEFAULT 'pending',    -- pending / delivered / failed
  attempts        INT DEFAULT 0,
  next_attempt_at TIMESTAMPTZ DEFAULT now(),
  last_http_status INT,
  last_error      TEXT,
  delivered_at    TIMESTAMPTZ
);

-- Delivery Worker (Kafka consumer) --
1. Consume from topic: webhook.pending
2. HTTP POST to merchant endpoint:
   Headers:
     Stripe-Signature: t=1714450000,v1=HMAC_SHA256(secret, "1714450000.{payload}")
     Content-Type: application/json
   Body: full Event JSON

3. On 2xx response → mark delivered
4. On non-2xx / timeout → schedule retry:
   Attempt 1:  0 min  (immediate)
   Attempt 2:  5 min
   Attempt 3:  30 min
   Attempt 4:  2 hr
   Attempt 5:  5 hr
   Attempt 6:  10 hr
   Attempt 7–9: 24 hr (×3 days)

-- Signature Verification (merchant side, Go) --
func verifyWebhook(payload []byte, sigHeader, secret string) error {
  parts := strings.Split(sigHeader, ",")
  ts := strings.TrimPrefix(parts[0], "t=")
  sig := strings.TrimPrefix(parts[1], "v1=")
  signed := ts + "." + string(payload)
  expected := hmac.New(sha256.New, []byte(secret))
  expected.Write([]byte(signed))
  if !hmac.Equal([]byte(sig), []byte(hex.EncodeToString(expected.Sum(nil)))) {
    return errors.New("invalid signature")
  }
  if time.Now().Unix()-toInt64(ts) > 300 { return errors.New("timestamp too old") }
  return nil
}`,
    },
    {
      id: "connectService",
      title: "Stripe Connect Service — LLD",
      description: "Marketplace fund flows, split payments, and cross-border payouts for platform businesses",
      api: `-- Create destination charge (platform charges customer, pays seller) --
POST /v1/payment_intents
Stripe-Account: acct_platform_xyz         // platform's API key

{
  "amount": 10000,                         // $100.00
  "currency": "usd",
  "payment_method": "pm_customer_card",
  "transfer_data": {
    "destination": "acct_seller_abc",      // connected account
    "amount": 8500                         // $85.00 to seller, $15.00 platform fee
  },
  "application_fee_amount": 1500          // $15.00 fee to platform
}

-- Payout to connected account --
POST /v1/payouts
Stripe-Account: acct_seller_abc

{
  "amount": 8500,
  "currency": "usd",
  "method": "instant",               // or "standard" (T+2)
  "destination": "ba_seller_bank"    // seller's bank account
}

-- Account Schema --
connected_accounts:
  account_id        TEXT PRIMARY KEY        -- acct_abc123
  platform_id       TEXT NOT NULL           -- acct_platform_xyz
  account_type      TEXT                    -- standard / express / custom
  charges_enabled   BOOLEAN DEFAULT false
  payouts_enabled   BOOLEAN DEFAULT false
  kyc_status        TEXT                    -- pending / verified / rejected
  business_type     TEXT                    -- individual / company
  created_at        TIMESTAMPTZ

account_balances:
  account_id        TEXT
  currency          TEXT
  available         BIGINT                  -- ready to payout (cents)
  pending           BIGINT                  -- in transit (T+2)
  reserved          BIGINT                  -- chargeback reserve hold
  PRIMARY KEY (account_id, currency)

transfers:
  transfer_id       TEXT PRIMARY KEY
  source_account    TEXT                    -- platform account
  destination_account TEXT                  -- seller account
  amount            BIGINT
  currency          TEXT
  charge_id         TEXT                    -- source payment intent
  created_at        TIMESTAMPTZ`,
    },
    {
      id: "billingService",
      title: "Stripe Billing — Subscriptions LLD",
      description: "Recurring revenue infrastructure — subscription lifecycle, proration, dunning, invoice generation",
      api: `-- Create subscription --
POST /v1/subscriptions

{
  "customer": "cus_abc123",
  "items": [{ "price": "price_monthly_pro_2900" }],   // $29/month
  "trial_period_days": 14,
  "payment_behavior": "default_incomplete",
  "expand": ["latest_invoice.payment_intent"]
}

Response:
{
  "id": "sub_abc123",
  "status": "trialing",
  "trial_end": 1715660000,
  "current_period_start": 1714450000,
  "current_period_end": 1717042000,
  "latest_invoice": {
    "id": "in_abc123",
    "amount_due": 0,
    "status": "paid"
  }
}

-- Subscription State Machine --
trialing → active → past_due → canceled
                 → paused (voluntary)
                 → unpaid (dunning exhausted)

-- Dunning (Smart Retries) --
Invoice payment fails → retry schedule:
  Day 0: first attempt (fails)
  Day 3: retry (Stripe Smart Retries picks optimal time based on card network signals)
  Day 5: retry
  Day 7: retry + send "update payment method" email
  Day 14: retry + send final warning
  Day 21+: subscription → canceled, send cancellation email

-- Invoice Schema --
invoices:
  invoice_id        TEXT PRIMARY KEY
  customer_id       TEXT NOT NULL
  subscription_id   TEXT
  status            TEXT       -- draft / open / paid / uncollectible / void
  amount_due        BIGINT
  amount_paid       BIGINT
  currency          TEXT
  period_start      TIMESTAMPTZ
  period_end        TIMESTAMPTZ
  due_date          TIMESTAMPTZ
  paid_at           TIMESTAMPTZ
  attempt_count     INT DEFAULT 0
  next_attempt_at   TIMESTAMPTZ`,
    },
    {
      id: "payoutService",
      title: "Payout & Settlement Service — LLD",
      description: "Merchant settlement across 50+ countries, 135+ currencies, with instant payout support",
      api: `-- Payout creation (automatic, runs nightly for merchants on standard payout schedule) --
POST /v1/payouts

{
  "amount": 85000,                    // $850.00 in cents
  "currency": "usd",
  "method": "standard",              // T+2 bank transfer
  "statement_descriptor": "STRIPE PAYOUT"
}

-- Instant payout (push-to-card, 30 min) --
POST /v1/payouts
{
  "amount": 85000,
  "currency": "usd",
  "method": "instant",               // 0.5% fee, Visa Direct / MC Send
  "destination": "ba_1OxK2e..."     // must be debit card, not bank account
}

-- Settlement Schema --
payouts:
  payout_id         TEXT PRIMARY KEY
  merchant_id       TEXT NOT NULL
  amount            BIGINT
  currency          TEXT
  method            TEXT             -- standard / instant
  status            TEXT             -- pending / in_transit / paid / failed / canceled
  arrival_date      DATE             -- estimated bank arrival
  bank_account_id   TEXT
  initiated_at      TIMESTAMPTZ
  arrived_at        TIMESTAMPTZ

balance_transactions:
  id                TEXT PRIMARY KEY
  merchant_id       TEXT NOT NULL
  type              TEXT             -- charge / refund / payout / fee / adjustment
  amount            BIGINT           -- positive = credit, negative = debit
  fee               BIGINT           -- Stripe fee deducted
  net               BIGINT           -- amount - fee
  currency          TEXT
  source_id         TEXT             -- charge/refund/payout ID
  available_on      DATE             -- when funds hit available balance (T+2 for charges)
  created_at        TIMESTAMPTZ

-- Balance Computation --
available_balance = SUM(net) WHERE available_on <= today AND type IN (charge, refund, transfer)
pending_balance   = SUM(net) WHERE available_on > today
// Updated in real-time via Kafka consumer on every balance_transaction event`,
    },
    {
      id: "serviceMesh",
      title: "Service Mesh — Sidecar Proxy Configuration (Istio)",
      description: "Circuit breaking, load balancing, canary rollouts, and Vault access policy for Stripe's internal service-to-service calls",
      api: `# DestinationRule — circuit breaker for Stripe Radar
# Radar's whole decision budget is 100ms; a degrading replica must be
# ejected fast enough that Payment Intents Service never sees it
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: radar-service-circuit-breaker
  namespace: prod
spec:
  host: radar-service.prod.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 5000
      http:
        http1MaxPendingRequests: 2000
        maxRequestsPerConnection: 50
    loadBalancer:
      simple: LEAST_REQUEST
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 5s
      baseEjectionTime: 15s
      maxEjectionPercent: 50
---
# DestinationRule — pure load balancing for Payment Orchestrator
# 634-3,000+ TPS of acquirer-routing decisions, no outlier ejection
# (acquirer-health scoring is handled at the application layer)
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: payment-orchestrator-lb
  namespace: prod
spec:
  host: payment-orchestrator.prod.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 3000
      http:
        http1MaxPendingRequests: 1500
        maxRequestsPerConnection: 50
    loadBalancer:
      simple: LEAST_REQUEST
---
# VirtualService — canary rollout for Radar ML model versions
# Formalizes the existing 1% -> 5% -> 25% -> 100% blue/green pattern
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: radar-service-canary
  namespace: prod
spec:
  hosts:
    - radar-service.prod.svc.cluster.local
  http:
    - match:
        - headers:
            x-radar-model-canary:
              exact: "true"
      route:
        - destination:
            host: radar-service.prod.svc.cluster.local
            subset: v2
    - route:
        - destination:
            host: radar-service.prod.svc.cluster.local
            subset: v1
          weight: 95
        - destination:
            host: radar-service.prod.svc.cluster.local
            subset: v2
          weight: 5
      retries:
        attempts: 2
        perTryTimeout: 40ms
        retryOn: 5xx,reset,connect-failure
---
# AuthorizationPolicy — Vault access restricted to two services
# Defense-in-depth: VPC network isolation (existing) + mesh-level AuthZ (new)
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: vault-service-access
  namespace: prod
spec:
  selector:
    matchLabels:
      app: vault-service
  action: ALLOW
  rules:
    - from:
        - source:
            principals:
              - cluster.local/ns/prod/sa/payment-intents-service
              - cluster.local/ns/prod/sa/tokenization-service
      to:
        - operation:
            paths: ["/internal/vault/*"]
            methods: ["GET", "POST"]
---
# PeerAuthentication — mTLS required cluster-wide, all 4 regions
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: prod
spec:
  mtls:
    mode: STRICT`,
      internals: `Sidecar injection scope:
  IN the mesh: Charges API, Payment Intents Service, Stripe Connect,
    Stripe Radar, Stripe Billing, Payment Orchestrator, Vault — every
    service the API Gateway fans out to, plus Vault (deliberately
    included so AuthorizationPolicy can restrict its callers)
  OUT of the mesh: Card Networks (Visa/Mastercard), Bank/ACH/SEPA rails
    (external partners — not Kubernetes services), PostgreSQL/Citus,
    Redis (idempotency AND Radar feature-store clusters), Kafka, S3,
    ClickHouse, Elasticsearch (direct driver connections)

Circuit breaking — Radar (the 100ms problem):
  Radar's budget is 20ms features + 40ms ML + 10ms rules + 30ms decision
  = 100ms total. At ~3,000 TPS peak, outlierDetection with a 5s window
  and 15s ejection (tighter than the standard 10s/30s) ejects a degrading
  replica fast enough that Payment Intents Service's callers stay inside
  budget. maxEjectionPercent: 50 ensures a bad deploy never takes out the
  whole Radar fleet — the remaining 50% absorbs traffic while ejected
  replicas recover or get rolled back

Load balancing — Payment Orchestrator:
  No outlierDetection here on purpose. The Payment Orchestrator's
  "acquirer health: circuit-break failing acquirers" logic is APPLICATION
  code — it scores 40+ acquiring banks on success rate, not HTTP 5xx
  count. Mesh-level outlier detection on the Orchestrator itself would be
  a second, conflicting circuit-breaking signal. LEAST_REQUEST LB is
  enough: spread the 634-3,000+ TPS routing-decision load evenly

Canary — Radar model versions:
  Stripe already does blue/green (1% → 5% → 25% → 100%) for code deploys.
  The VirtualService gives the SAME mechanism to ML model versions
  specifically: x-radar-model-canary lets the fraud team force-route
  test transactions to v2 for evaluation, while the 95/5 weight handles
  the gradual production rollout. perTryTimeout: 40ms matches Radar's
  ML-inference time budget exactly — a retry that can't complete within
  40ms isn't worth attempting inside the 100ms total

AuthorizationPolicy — Vault as defense-in-depth:
  Vault already sits in a network-isolated VPC (PCI DSS control). Putting
  Vault IN the mesh and adding an AuthorizationPolicy is a SECOND,
  independent enforcement layer: even if a misconfigured security group
  ever allowed an unexpected service into Vault's subnet, mTLS + the
  AuthorizationPolicy's principal allowlist (Payment Intents Service and
  Tokenisation Service only) would still block the call at L7

mTLS and six-nines control-plane fail-open:
  PeerAuthentication STRICT encrypts and mutually authenticates every
  hop across all 4 active-active regions. 99.9999% availability = ~31.5s
  of downtime per YEAR — if the Istio control plane (Pilot) goes down,
  sidecars MUST keep serving with last-known config (fail open). A
  control-plane blip becoming a payment-processing outage would consume
  the entire annual error budget in seconds`,
    },
  ],
};

export const STRIPE_QNA = [
  {
    id: "sq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Stripe", "Adyen", "Braintree"],
    question: "Design a payment processing system like Stripe. What are the core components?",
    answer: `Stripe's architecture is built around one guarantee: charge exactly once, never lose money.

CORE COMPONENTS:

1. API GATEWAY:
   Handles authentication (API keys), rate limiting, versioning, idempotency key dedup
   Idempotency-Key → Redis lookup → if exists return cached response, else process and cache

2. PAYMENT INTENTS SERVICE:
   Stateful machine tracking payment through auth → 3DS → capture
   States: created → requires_payment_method → requires_action → processing → succeeded
   Why stateful: 3DS2 requires redirect dance — must resume exactly where left off

3. PAYMENT ORCHESTRATOR:
   Routes each payment to optimal acquirer (40+ relationships globally)
   Factors: card country vs acquirer country (domestic routing), acquirer health, FX cost
   Adaptive routing: ML model predicts P(approve | card, acquirer) → routes to best

4. RADAR (FRAUD):
   1000+ feature extraction in < 20ms (card velocity, device fingerprint, IP signals)
   LightGBM inference in < 40ms → risk score 0-100
   Rules engine in < 10ms → merchant custom rules
   Decision: allow / block / request_3ds — all in under 100ms total

5. WEBHOOK SERVICE:
   Every state change → Event record in DB → Kafka → delivery worker
   At-least-once delivery, 72-hour retry window, HMAC-signed payloads

6. VAULT:
   Network-isolated service holding raw card numbers
   Only tokenisation and payment services can access
   HSM-encrypted, PCI DSS Level 1 audited`,
  },
  {
    id: "sq2",
    category: "Reliability",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Stripe", "Square", "PayPal"],
    question: "How do you guarantee a customer is never double-charged, even with network failures and retries?",
    answer: `Double charges are the worst failure mode in payments. Defence is layered.

LAYER 1 — CLIENT TO STRIPE (idempotency):
  Client sends Idempotency-Key: {uuid} with every charge request
  Stripe stores: HMAC(api_key + idempotency_key) → {response_body, http_status, created_at}
  TTL: 24 hours
  On duplicate: return stored response immediately — no processing occurs
  Implementation: Redis SET NX (set if not exists) with 24h TTL

LAYER 2 — STRIPE TO ACQUIRER:
  Every call to acquiring bank includes a unique reference_id (Stripe-generated)
  On network timeout: Stripe does NOT blindly retry — first queries acquirer:
    GET /transactions/{reference_id}/status
  If acquirer says "succeeded" → return that result (no retry)
  If acquirer says "not found" → safe to retry
  If acquirer says "declined" → return decline (no retry)
  Acquirer support for idempotent inquiry is a contractual requirement for Stripe partnerships

LAYER 3 — INTERNAL DB:
  Before calling acquirer: write charge record with status=processing
  After acquirer response: update status to succeeded/failed
  If Stripe crashes between write and acquirer call:
    Recovery job scans for processing charges older than 30s → queries acquirer for status
    "The DB record is the coordination primitive" — no two-phase commit needed

LAYER 4 — STRIPE TO MERCHANT (webhooks):
  Webhooks delivered at-least-once — merchant may receive charge.succeeded twice
  Merchant must be idempotent: use event.id as dedup key in their own DB
  Stripe documents this clearly — it is a known contract, not a bug`,
  },
  {
    id: "sq3",
    category: "Fraud",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Stripe", "Adyen", "Checkout.com"],
    question: "How does Stripe's Radar fraud system work and how does it run in under 100ms?",
    answer: `Radar is a real-time ML system that must make a fraud decision before the card network times out (~2 seconds). Target: 100ms.

TIME BUDGET BREAKDOWN:

Feature extraction (20ms):
  Pull from Redis (pre-computed features updated by background workers):
    - card_velocity_1h: charges on this card fingerprint across all Stripe merchants in last hour
    - email_velocity_24h: charge attempts for this email last 24h
    - ip_risk_score: historical fraud rate for this IP
    - device_seen_before: is this device fingerprint known?
    - card_first_seen_days_ago: brand new card = higher risk

  Redis lookups are O(1) and batched in a pipeline — < 5ms for 20+ features

ML inference (40ms):
  LightGBM gradient boosted tree — chosen for:
    Speed: tree traversal is cache-friendly, SIMD-optimised → microseconds per prediction
    Interpretability: can explain why a transaction was flagged (important for disputes)
  Model trained on Stripe's entire transaction history (500B+ data points)
  Feature vector of 1000+ dimensions → fraud_score output

Rules engine (10ms):
  Merchant-written rules compiled to bytecode at rule creation time
  Evaluation is pure tree traversal — no parsing at request time
  Example: ":card_country: != :ip_country: AND :amount: > 50000" → 3DS

Decision aggregation + response (30ms):
  Combine: ML score + rules + 3DS authentication status
  Outcome: allow / block / request_3ds
  Cache decision briefly in case of retry

KEY INSIGHT:
  Stripe has a data moat — it sees card velocity ACROSS ALL MERCHANTS, not just one
  A card used fraudulently at Merchant A is flagged at Merchant B within seconds
  No individual merchant can build this — it requires scale`,
  },
  {
    id: "sq4",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Stripe", "Square", "Adyen"],
    question: "How does Stripe achieve 99.9999% (six nines) availability?",
    answer: `Six nines = 31.5 seconds of downtime per year. This is achieved through architecture, not heroics.

MULTI-REGION ACTIVE-ACTIVE:
  Stripe runs in US-East, US-West, EU-West, AP-Southeast
  All regions accept live traffic simultaneously (not hot-standby)
  Latency-based DNS routing: user routed to nearest healthy region
  Each region is 100% self-sufficient — no cross-region calls on payment critical path

DATABASE REPLICATION:
  PostgreSQL with synchronous replication within region (no data loss on instance failure)
  Async replication cross-region (slight lag → RPO = seconds on regional failure)
  On regional failure: accept that last few seconds of cross-region data may be lost
  Transactions initiated in failed region are retried by client (idempotency handles this)

GRACEFUL DEGRADATION — not all features are equal:
  Tier 1 (never degrade): Payment processing API
  Tier 2 (degrade gracefully): Radar (skip for low-amount, known-good customers)
  Tier 3 (can go down): Dashboard, Sigma, reporting APIs
  Each service has explicit fallback behaviour for dependency unavailability

DEPLOYMENT SAFETY:
  Canary deployments: 1% → 5% → 25% → 100% traffic
  Automatic rollback if error rate increases > 0.1% at any canary stage
  Feature flags: every new code path behind a flag, off by default → gradual enablement

WHAT CAUSES MOST OUTAGES:
  Bad deploys (mitigated by canary + feature flags)
  Database query performance regression (mitigated by query plan monitoring)
  Dependency failures (mitigated by circuit breakers + graceful degradation)
  DDoS (mitigated by rate limiting at edge + CDN scrubbing)`,
  },
  {
    id: "sq5",
    category: "Estimation",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Stripe", "Adyen", "Square"],
    question: "Stripe processes $1T+/year and 500M+ API requests/day. Break those numbers down — what do they actually drive in the architecture?",
    answer: `$1T/year and 500M requests/day are two DIFFERENT numbers measuring
different things — one is money, one is calls — and they decompose into
five very different sizing problems.

ASSUMPTIONS:
  • $1T+ payment volume/year, 500M+ API requests/day
  • Average charge ≈ $50 (blend of micro-SaaS and B2B invoices)
  • Idempotency keys: Redis, 24h TTL. Webhook retry window: 72h
  • Radar: <100ms total (20ms features + 40ms ML + 10ms rules + 30ms decision)

1. API REQUESTS → IDEMPOTENCY REDIS SIZE:
   500M/day ÷ 86,400s ≈ 5,787 req/sec average
   With 24h TTL, steady state ≈ 5,787 × 86,400 ≈ 500M resident keys
   → The REQUEST RATE sizes Gateway compute; the RESIDENT KEY COUNT
     (a full day's worth) sizes the idempotency Redis cluster — two
     different numbers from the same input

2. PAYMENT VOLUME → CHARGE RATE:
   $1T/year ÷ 365 ÷ 86,400s ≈ $31,700/sec
   At ~$50/charge: ≈ 634 charges/sec average, ~3,000+ TPS at peak
   → Sizes Payment Intents' Citus write throughput and the Payment
     Orchestrator's routing-decision rate

3. RADAR FEATURE STORE:
   ~3,000 TPS peak × one pipelined batch of 20+ Redis reads ≈ 3,000
   RTTs/sec to a SEPARATE Redis cluster (not the idempotency one),
   tuned for sub-5ms p99 — it has to fit inside the 100ms total budget

4. WEBHOOK BACKLOG (per-merchant worst case):
   A merchant at 100 charges/sec, endpoint down for the full 72h window:
   100 × 259,200s ≈ 26M pending webhook_deliveries rows for ONE merchant
   → Drives a (status, next_attempt_at) partial index — this is an
     INDEX DESIGN number, not a capacity number

5. NETWORK TOKENS — RELIABILITY AS REVENUE:
   ~2% "card expired" decline rate on $1T/year ≈ $20B/year at risk
   Network tokens cut that ~30% → ~$6B/year recovered
   → A reliability feature (auto-updating tokens) is also worth $6B/year

PUNCH LINE:
"Don't let '$1T and 500M requests/day' collapse into one estimate. They
size five unrelated things: idempotency Redis (~500M keys), Citus write
throughput (634-3,000 TPS), Radar's feature-store Redis (~3,000 RTTs/sec),
a webhook index design (26M rows, per merchant), and — easy to forget —
$6B/year of recovered revenue from network tokens."`,
    followups: [
      "If average charge size dropped from $50 to $5 (a shift toward micro-transactions), which of these five numbers changes the most, and what would you re-architect first?",
      "The idempotency Redis holds ~500M keys at steady state with a 24h TTL. What happens to that number during a 3x Black-Friday traffic spike, and does the TTL need to change?",
      "Walk through how you'd validate the '~3,000 RTTs/sec to Radar's feature store' estimate using production metrics, without access to Stripe's actual dashboards.",
    ],
  },
  {
    id: "sq6",
    category: "Architecture",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Stripe", "Adyen", "PayPal"],
    question: "Stripe's Payment Orchestrator already does acquirer-level circuit breaking for external banks. Where does a service mesh fit in, and what would you explicitly keep OUT of it?",
    answer: `The Orchestrator's acquirer circuit breaking is APPLICATION logic for
EXTERNAL banks — it scores 40+ acquirers on approval rate, not HTTP
status codes. A service mesh adds a different, complementary layer for
Stripe's INTERNAL service-to-service calls.

WHY A MESH FITS:
  Payment Intents → Radar is the tightest internal hop — Radar's entire
  budget is 100ms (20/40/10/30ms split across features/ML/rules/decision).
  At ~3,000 TPS peak, ONE degrading Radar replica can blow that budget for
  thousands of charges/sec. The existing graceful-degradation path ("Radar
  unavailable → allow with elevated risk flag") is a LAST RESORT; a mesh
  catches the degradation earlier via outlierDetection, before full Radar
  unavailability.

DATA PLANE:
  Envoy sidecars on Charges API, Payment Intents Service, Stripe Connect,
  Stripe Radar, Stripe Billing, Payment Orchestrator, and Vault.

CONTROL PLANE:
  Istio, deployed per-region across all 4 active-active regions
  (US-East, US-West, EU-West, AP-Southeast).

WHAT THIS BUYS:
  1. Radar circuit breaking — tight 5s/15s outlierDetection window
     (vs the standard 10s/30s) because the SLO is 100ms, not seconds.
     maxEjectionPercent: 50 prevents one bad deploy from ejecting the
     whole Radar fleet
  2. Payment Orchestrator load balancing — LEAST_REQUEST for
     634-3,000+ TPS of routing decisions. Deliberately NO outlierDetection
     here — that would create a SECOND circuit breaker conflicting with
     the Orchestrator's own acquirer-health scoring
  3. Radar model canary — the existing blue/green (1%→5%→25%→100%)
     becomes a VirtualService weight; perTryTimeout: 40ms matches Radar's
     ML-inference budget exactly
  4. Vault AuthorizationPolicy — only Payment Intents Service and
     Tokenisation Service may call Vault, as a SECOND enforcement layer
     on top of (not instead of) Vault's existing VPC network isolation
  5. mTLS + tracing across all 4 regions — one trace ID follows a charge
     end-to-end, useful when explaining a Radar decision during a dispute

WHAT STAYS OUT:
  • Card Networks (Visa/Mastercard) and Bank/ACH/SEPA — external
    partners, not Kubernetes services. The Orchestrator's acquirer-health
    scoring stays as application logic; mesh circuit breaking is a LOWER
    layer for Stripe-internal hops, not a replacement
  • PostgreSQL/Citus, both Redis clusters (idempotency + Radar features),
    Kafka, S3, ClickHouse, Elasticsearch — direct driver connections, no
    sidecar applies

TRADE-OFFS:
  • Sidecar adds ~1-2ms/hop — real money inside Radar's 100ms budget.
    This is why Radar's feature extraction stays as ONE service doing
    pipelined Redis calls, rather than being decomposed into more hops
  • Six-nines (99.9999%) = ~31.5s downtime/YEAR. Control plane MUST fail
    open (sidecars retain last-known config) — a Pilot blip becoming a
    payment outage would burn the entire annual error budget in seconds
  • Two circuit breakers with different signals (Orchestrator's
    acquirer-health score vs mesh outlierDetection) must never be applied
    to the SAME hop — that's why the mesh's outlierDetection targets
    Radar (internal), not the Orchestrator's acquirer calls (external)`,
    followups: [
      "If you DID put outlierDetection on the Payment Orchestrator's calls to acquirers, what failure mode could that create alongside the existing acquirer-health scoring?",
      "Radar's outlierDetection uses a 5s/15s window instead of the standard 10s/30s. What concretely goes wrong if you left it at 10s/30s given the 100ms SLO?",
      "Vault has both VPC isolation AND an AuthorizationPolicy. Describe a concrete misconfiguration scenario where the second layer is the only thing that prevents a breach.",
    ],
  },
];
