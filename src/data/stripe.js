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
│    TLS Termination · Auth (API Key / Restricted Keys) · Rate Limiting  │
│    Request Routing · Idempotency Key Dedup · Versioning (?api=2024-11) │
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
];
