export const REVOLUT_HLD = {
  title: "Revolut — High Level Design",
  subtitle: "Neobank serving 45M+ customers — multi-currency accounts, instant transfers, real-time fraud detection",
  overview: `Revolut is a UK-based neobank (digital-only bank) serving 45M+ customers across 38 countries. Unlike traditional banks, Revolut has no branches — everything runs through a mobile app and an API-first backend.

The core engineering challenges: a ledger that must be 100% accurate (money cannot be created or lost), real-time fraud detection on every transaction, multi-currency exchange at interbank rates, and compliance across 38 different regulatory regimes.

Revolut's architecture is event-driven microservices on Kubernetes, with a double-entry ledger at the center of everything. Every money movement is an immutable event appended to a ledger — nothing is ever updated or deleted.`,

  diagram: `
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│              iOS · Android · Web Dashboard · Business API           │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  HTTPS / REST / GraphQL
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   API GATEWAY (Kong)                                │
│         Auth (JWT) · Rate Limiting · Routing · TLS                  │
└──┬──────────────┬──────────────┬─────────────────┬─────────────────┘
   │              │              │                 │
   ▼              ▼              ▼                 ▼
┌──────────┐ ┌──────────┐ ┌──────────┐    ┌────────────────┐
│ Account  │ │ Payment  │ │ FX       │    │ Fraud &        │
│ Service  │ │ Service  │ │ Service  │    │ Risk Service   │
└────┬─────┘ └────┬─────┘ └────┬─────┘    └────────────────┘
     │            │            │
     ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    LEDGER SERVICE (Core)                            │
│          Double-Entry · Immutable · Append-Only · PostgreSQL        │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       DATA LAYER                                     │
│   PostgreSQL (ledger, accounts) · Kafka (event bus)                  │
│   Redis (cache, sessions, rate limits) · Cassandra (audit logs)      │
│   Vault (secrets) · S3 (documents, statements)                       │
└──────────────────────────────────────────────────────────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Ledger & Accounts",
      sections: [
        {
          title: "Double-Entry Ledger — The Core of Any Financial System",
          content: `Every financial system is built on double-entry bookkeeping — a 700-year-old accounting principle that makes money impossible to create or destroy accidentally.

THE PRINCIPLE:
  Every transaction has at least two entries: one debit and one credit
  The sum of all debits must always equal the sum of all credits
  If they don't balance → something is wrong (bug, fraud, data corruption)

REVOLUT'S LEDGER:
  Single source of truth for all money in the system
  Append-only: entries are never updated or deleted
  Immutable: once written, a ledger entry cannot change

Example: Alice sends £100 to Bob
  DEBIT  alice_account   £100  (alice's balance decreases)
  CREDIT bob_account     £100  (bob's balance increases)
  ────────────────────────────
  Net:                   £0    ← must always balance

Example: Alice tops up £50 from her Visa card
  DEBIT  visa_card_gateway   £50  (external source)
  CREDIT alice_account       £50  (alice's balance increases)

BALANCE CALCULATION:
  Never store "current balance" as a mutable field — it gets out of sync
  Balance = SUM(credits) - SUM(debits) for all entries for this account
  Cached in Redis for fast reads; recomputed from ledger for reconciliation

WHY APPEND-ONLY:
  UPDATE/DELETE-based systems: if a bug sets balance to wrong value, audit trail is lost
  Append-only: every wrong entry is visible; correct with a reversing entry
  Regulatory requirement: banks must produce a complete transaction audit trail`,
        },
        {
          title: "Multi-Currency Accounts — Holding 30+ Currencies",
          content: `Revolut allows users to hold balances in 30+ currencies simultaneously. This is architecturally non-trivial.

ACCOUNT STRUCTURE:
  One user → multiple "pockets" (one per currency)
  alice_user → { GBP_pocket: £500, EUR_pocket: €200, USD_pocket: $150, ... }

  Each pocket is a separate ledger account:
  account_id: alice_GBP_account → balance: £500
  account_id: alice_EUR_account → balance: €200

CURRENCY EXCHANGE (FX):
  Alice converts £100 to USD:
  1. FX Service fetches current rate: GBP/USD = 1.2650 (interbank rate, Revolut margin added)
  2. Debit alice_GBP_account £100
  3. Credit alice_USD_account $126.50
  4. Debit revolut_USD_reserve_account $126.50 (Revolut's own reserve)
  5. Credit revolut_GBP_revenue_account £100 (Revolut's FX desk settles later)

  Why internal accounts: the FX desk settles positions end-of-day through interbank markets
  During the day: Revolut is counterparty to all FX trades (holds the risk)

EXCHANGE RATE SOURCING:
  Revolut streams rates from multiple FX providers: Bloomberg, Reuters, interbank
  Rate refresh: every 250ms during market hours
  Rates cached in Redis with 250ms TTL
  On weekend/off-hours: different rate schedule (markets closed, spread is wider)

FAIR USAGE LIMITS (Free plan):
  Free users: £1,000/month FX conversion at interbank rate → beyond limit: 1.5% markup
  Premium: unlimited at interbank rate
  Tracked: Redis counter per user per month, resets on 1st of month`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Payments",
      sections: [
        {
          title: "Payment Flows — Card, Bank Transfer, Peer-to-Peer",
          content: `Revolut handles three fundamentally different payment types, each with different latency, reversibility, and risk profiles.

1. PEER-TO-PEER (Revolut to Revolut) — Instant:
   Both parties have Revolut accounts → internal ledger transfer only
   No external network, no settlement delay
   Latency: < 500ms end-to-end
   Reversibility: requires both parties' consent

2. BANK TRANSFER (SWIFT / SEPA / Faster Payments):
   SEPA (Europe): T+0 to T+1 settlement
   Faster Payments (UK): typically < 2 hours, sometimes instant
   SWIFT (international): T+1 to T+5 depending on correspondent banks
   Latency: varies by rail; Revolut pre-funds destination so user sees instant credit

3. CARD PAYMENT (Mastercard / Visa network):
   User pays merchant with Revolut card → Mastercard network → Revolut as issuing bank
   Authorization: real-time (< 3 seconds) — Revolut must approve/decline instantly
   Settlement: T+1 to T+2 (net settlement with Mastercard)
   Revolut pre-funds the hold on authorization; settles at end of day

PAYMENT STATE MACHINE:
  PENDING → PROCESSING → COMPLETED | FAILED | REVERSED
  Each state transition: append entry to ledger + publish Kafka event
  Kafka consumers: Notification Service, Fraud Service, Analytics, Compliance

PRE-AUTHORIZATION (card payments):
  Merchant charges £45 → Revolut receives authorization request
  Revolut: deduct £45 from available balance (hold) → send approval
  Merchant settles 24–48h later: hold released, actual settlement applied
  If merchant never settles: hold released after 7 days`,
        },
        {
          title: "Card Authorization — Real-Time Decision in < 100ms",
          content: `Every Revolut card tap triggers an authorization request that Revolut must approve or decline within 3 seconds (Mastercard SLA).

THE AUTHORIZATION FLOW:
  1. User taps card at merchant terminal
  2. Merchant → Acquirer → Mastercard network → Revolut (issuing bank)
  3. Revolut's Authorization Service receives the request
  4. Decision pipeline (must complete in < 100ms):
     a. Authenticate: is this card valid? Not expired? Not cancelled?
     b. Balance check: does user have sufficient available balance?
     c. Fraud check: does this transaction look suspicious?
     d. Spending limits: within daily/monthly limits? Merchant category allowed?
     e. Compliance: not a sanctioned merchant or country?
  5. Approve → deduct hold from available balance → respond to Mastercard
  6. Decline → respond with decline code (insufficient funds, fraud, etc.)

AVAILABLE BALANCE vs LEDGER BALANCE:
  Ledger balance: settled transactions only
  Available balance = ledger balance - pending holds
  User taps twice accidentally: second authorization declined (available balance already reduced)

SYNCHRONOUS FRAUD CHECK (< 10ms budget):
  Full ML fraud model takes 50ms → too slow for authorization path
  Solution: lightweight rules engine for authorization (< 5ms)
    • Transaction amount > 10× average for this user → decline
    • Merchant country blacklisted → decline
    • Card flagged for review → decline
    • Velocity check: > 5 transactions in 1 minute → hold
  Full ML model runs async in background → used to block future transactions

DECLINE CODES:
  51: Insufficient funds
  54: Expired card
  59: Suspected fraud (generic, not shown as "fraud" to avoid tipping off fraudster)
  57: Merchant not permitted (gambling on basic plan, etc.)`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Fraud & Risk",
      sections: [
        {
          title: "Real-Time Fraud Detection",
          content: `Revolut processes millions of transactions per day. Fraud detection must be fast (< 100ms for authorization), accurate, and continuously learning.

FRAUD TYPES DETECTED:
  Card fraud: stolen card used by unauthorized person
  Account takeover: credentials stolen, fraudster logs in as victim
  Money mule: account used to launder money from other fraud
  APP fraud (Authorized Push Payment): victim tricked into sending money voluntarily
  Identity fraud: fake documents used to open account

TWO-TIER FRAUD DETECTION:

TIER 1 — SYNCHRONOUS (on every transaction, < 10ms):
  Rules engine (Drools / custom):
  • Velocity rules: > 3 declined transactions in 5 min → block
  • Geo-anomaly: transaction in country user has never visited + never set up travel → flag
  • Amount anomaly: > 3× user's largest ever transaction → flag
  • Merchant blacklist: known fraud merchants → decline
  • Device fingerprint: new device + large transaction → step-up auth

  Action: approve, decline, or require 2FA step-up challenge

TIER 2 — ASYNCHRONOUS ML MODEL (within 5 seconds, post-transaction):
  Features (300+): transaction amount, merchant category, location delta, time of day,
                   device fingerprint, velocity over 1h/24h/7d, peer comparison,
                   graph features (is payee a known mule account?)
  Model: gradient-boosted trees + neural network ensemble
  Output: fraud_score 0.0 – 1.0

  Actions by score:
  fraud_score > 0.9  → freeze card, push alert, require re-verification
  fraud_score 0.7–0.9 → flag for manual review, soft block
  fraud_score < 0.7  → monitor, no action

FEEDBACK LOOP:
  User reports fraud → label retroactively applied to transaction
  Chargeback received → negative label
  Labeled data → nightly model retraining on Spark
  Model updates deployed daily (not weekly — fraud patterns change fast)`,
        },
        {
          title: "AML — Anti-Money Laundering Compliance",
          content: `As a regulated bank, Revolut must detect and report money laundering. Failure to comply = license revocation.

WHAT AML MONITORING LOOKS FOR:
  Structuring: splitting large transactions into smaller ones to avoid reporting thresholds
    (e.g., 10× £9,000 transfers instead of one £90,000 transfer)
  Layering: money moved through multiple accounts to obscure origin
  Round-tripping: money sent out and received back through different paths
  Unusual patterns: dormant account suddenly receiving large amounts

AML MONITORING PIPELINE:
  Not real-time (unlike fraud detection) — batch monitoring on transaction history
  Flink streaming: sliding window analysis on transaction patterns
    • 30-day cumulative inflows/outflows per user
    • Velocity: 10× normal deposit pattern in single day → alert
    • Structuring detector: multiple transactions just below reporting thresholds
    • Network graph: transaction flow between accounts → detect money mule rings

SAR (Suspicious Activity Report) WORKFLOW:
  AML model flags user → case created in compliance review system
  Compliance analyst reviews: transaction history, KYC documents, customer profile
  Decision: escalate to SAR (report to HMRC/FinCEN) or dismiss
  SAR filing: mandatory within 30 days of suspicion
  "Tipping off" prohibition: cannot tell customer they've been reported

KYC (Know Your Customer):
  Every Revolut customer must verify identity before using payments:
  Document upload → OCR extraction → liveness check → watchlist screening
  Watchlist: OFAC sanctions, PEP (Politically Exposed Persons), adverse media
  Enhanced due diligence: high-value customers or high-risk jurisdictions`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "FX & Treasury",
      sections: [
        {
          title: "Foreign Exchange Engine — Interbank Rates at Scale",
          content: `Revolut's FX offering (interbank rates, low fees) is its core differentiator vs traditional banks. The FX engine must handle rate streaming, position management, and end-of-day settlement.

RATE SOURCING:
  Revolut streams FX rates from: Bloomberg API, Reuters Eikon, multiple liquidity providers
  Aggregation: best bid/ask across providers → mid-rate
  Revolut margin: small percentage added on top of mid-rate (revenue model)
  Update frequency: every 250ms during market hours (London/NY overlap: highest liquidity)
  Stored in Redis with 250ms TTL: "GBP/USD": { rate: 1.2650, timestamp: ... }

INTRADAY POSITION MANAGEMENT:
  All day: customers exchange GBP→USD, USD→EUR, EUR→GBP, etc.
  Revolut is counterparty to all trades (buys from customer, sells to them)
  Net position at end of day: Revolut is short USD, long GBP (net of all trades)
  Treasury desk: hedges position continuously using FX forwards/swaps
  Goal: be as close to flat (no net FX exposure) as possible

WHY REVOLUT CAN'T JUST BE A PASS-THROUGH:
  Each customer trade is too small for interbank market (min size: $1M)
  Revolut batches: aggregate all GBP→USD trades during the day → single interbank trade
  Risk: if GBP/USD moves 1% during the day, Revolut absorbs the mark-to-market loss
  Hedge: FX forward contract locks in rate → eliminates currency risk

SETTLEMENT:
  End of day: Revolut nets all positions → settles via CLS (Continuous Linked Settlement)
  CLS: multi-currency settlement system used by all major banks
  Bilateral settlement: Revolut owes Bank X $5M, Bank X owes Revolut €4.2M → net settlement`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "Reliability & Compliance",
      sections: [
        {
          title: "Idempotency — Never Charge Twice, Never Miss a Charge",
          content: `In financial systems, idempotency is not optional. Network retries are normal; charging a customer twice is catastrophic.

THE DOUBLE-CHARGE PROBLEM:
  Client sends payment request → server processes → server crashes before responding
  Client retries (timed out) → server processes again → customer charged twice

SOLUTION — Idempotency Keys:
  Client generates UUID before payment: idempotency_key = UUID()
  Client includes in every request: X-Idempotency-Key: <UUID>
  Server: before processing, check Redis: GET idempotency:{key}
  If exists: return cached response (don't process again)
  If not exists: process, store result in Redis (TTL 24h), return result

IMPLEMENTATION DETAILS:
  SET idempotency:{key} "PROCESSING" EX 300 NX  ← atomic, only succeeds if key doesn't exist
  If SET succeeds → this server owns the request, proceed
  If SET fails → another server is processing (or already processed) → wait and check

  After processing:
  SET idempotency:{key} {result_json} EX 86400  ← store result for 24h
  Return result

  Why 24h TTL: clients may retry up to 24h after initial failure
  Why NX (set if not exists): prevents race condition between two servers processing same key

LEDGER IDEMPOTENCY:
  Additionally: every ledger entry has a transaction_id (UUID)
  INSERT INTO ledger_entries ... ON CONFLICT (transaction_id) DO NOTHING
  Even if payment service processes twice: second DB insert is silently ignored
  Two layers of idempotency: API layer (Redis) + storage layer (DB constraint)`,
        },
        {
          title: "Regulatory Compliance — Operating in 38 Countries",
          content: `Revolut holds banking licenses (or e-money licenses) in multiple jurisdictions. Each has different rules.

LICENSE TYPES:
  E-money license (most markets): can hold customer money, issue cards, facilitate transfers
  Banking license (Lithuania, UK in progress): can lend money, offer interest-bearing accounts
  Different licenses → different capabilities and regulatory requirements

DATA RESIDENCY:
  GDPR (EU): EU customer data must stay in EU
  UK: UK customer data after Brexit has its own rules
  India, Brazil: strict local data residency laws
  Solution: regional deployments, data classified by residency requirement
  EU customer → data only written to EU region databases

TRANSACTION REPORTING:
  CFTC/FCA/ECB: daily transaction reports for large transfers
  Automated: pipeline reads from ledger → generates regulatory reports → submits via API
  SWIFT gpi: real-time tracking of cross-border transfers (required in many markets)

CAPITAL REQUIREMENTS:
  E-money regulation: customer funds must be "safeguarded"
  Safeguarding: customer balances held in segregated accounts at top-tier banks
  Not mixed with Revolut's operating funds
  If Revolut goes bankrupt: customer funds protected (separate legal estate)
  Reconciliation: every night, sum of all customer balances = safeguarding account balance

CARD SCHEME COMPLIANCE:
  Mastercard/Visa: PCI-DSS certification required (annual audit)
  Card data never stored on Revolut servers: tokenized via Mastercard's vault
  Revolut stores: token, last4, expiry — never raw PAN`,
        },
      ],
    },
    {
      id: "phase6",
      label: "Phase 6",
      title: "Scale & Architecture",
      sections: [
        {
          title: "Event-Driven Architecture — Kafka as the Financial Event Bus",
          content: `Revolut's microservices communicate primarily through events, with Kafka as the central event bus.

KEY KAFKA TOPICS:
  transaction-events: every payment, transfer, card auth → consumed by 10+ services
  fraud-signals: fraud scores, flags, and freezes
  notification-events: push, email, SMS triggers
  compliance-events: AML alerts, SAR triggers, reporting pipeline
  ledger-entries: every double-entry ledger write (append-only)
  fx-rates: real-time rate updates (every 250ms during market hours)

WHY EVENT-DRIVEN FOR FINANCE:
  Auditability: every action is an event with timestamp → immutable audit log
  Decoupling: Fraud Service doesn't need to know about Notification Service
  Replay: if Compliance Service has a bug → replay historical events to reprocess
  Exactly-once delivery: Kafka transactions ensure financial events processed exactly once

OUTBOX PATTERN (critical for consistency):
  Problem: Payment Service writes to DB, then publishes to Kafka
    If service crashes between DB write and Kafka publish → event lost
  Solution: Outbox table in PostgreSQL
    1. BEGIN transaction
    2. INSERT payment into payments table
    3. INSERT event into outbox table (same transaction)
    4. COMMIT → both writes atomic
    5. Background poller reads outbox → publishes to Kafka → deletes from outbox
    6. If step 5 fails → retry (idempotent Kafka publish with exactly-once producer)

SAGA PATTERN (distributed transactions):
  Cross-service payment: debit sender → credit receiver (two separate services)
  If debit succeeds but credit fails → need to reverse debit
  Saga: each step publishes event, next step triggered by event
  Compensating transaction: if any step fails → execute reverse steps
  Choreography-based (not orchestrator) → no single point of failure`,
        },
        {
          title: "High Availability — Zero Downtime for a Bank",
          content: `Bank downtime means users can't access their money — this is unacceptable. Revolut targets 99.99% uptime.

MULTI-REGION ACTIVE-ACTIVE:
  Regions: EU (primary), US, Singapore, UK
  Each region serves local customers (data residency compliance)
  Active-active: all regions serve reads and writes
  Global routing: GeoDNS → nearest healthy region

DATABASE HIGH AVAILABILITY:
  PostgreSQL: Patroni + etcd for automatic failover
  Primary fails → Patroni promotes standby in < 30 seconds
  Multi-AZ deployment: primary and standby in different availability zones
  Point-in-time recovery: WAL archive to S3, can restore to any point in last 30 days

LEDGER CONSISTENCY ACROSS REGIONS:
  Problem: active-active with writes to any region can cause split-brain on ledger
  Solution: ledger writes are single-region (primary region is authoritative)
  Other regions: read replicas for balance lookups
  Cross-region payment: routed to primary region for atomic ledger write

GRACEFUL DEGRADATION:
  FX Service unavailable → card payments still work (no FX needed for same-currency)
  Notification Service unavailable → payments still process, user notified later
  Fraud Service unavailable (circuit open) → fall back to rules engine only
  Ledger Service unavailable → all payments halt (this is the one single point of failure we accept)

CHAOS ENGINEERING:
  Revolut deliberately kills service instances during business hours
  Tests: does traffic shift seamlessly? Do health checks fire in time?
  Results: every service owns its failure modes before production discovers them`,
        },
      ],
    },
  ],

  metrics: [
    { label: "Customers", value: "45M+", note: "across 38 countries" },
    { label: "Transactions/day", value: "500M+", note: "estimated" },
    { label: "Currencies supported", value: "30+", note: "hold and exchange" },
    { label: "Countries", value: "38", note: "licensed operations" },
    { label: "Card auth latency", value: "< 100ms", note: "Mastercard SLA is 3s" },
    { label: "FX rate refresh", value: "250ms", note: "during market hours" },
    { label: "Uptime target", value: "99.99%", note: "< 1 hour downtime/year" },
    { label: "Fraud detection", value: "< 10ms", note: "synchronous rules engine" },
  ],
};

export const REVOLUT_LLD = {
  title: "Revolut — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of core Revolut services",

  components: [
    {
      id: "ledgerService",
      title: "Ledger Service — LLD",
      description: "Double-entry append-only ledger — the source of truth for all money",
      api: `POST /internal/ledger/entries
(Internal only — never exposed to clients directly)
{
  "transaction_id": "txn_abc123",       // idempotency key
  "entries": [
    {
      "account_id": "acc_alice_GBP",
      "entry_type": "DEBIT",
      "amount_minor": 10000,            // £100.00 in pence
      "currency": "GBP"
    },
    {
      "account_id": "acc_bob_GBP",
      "entry_type": "CREDIT",
      "amount_minor": 10000,
      "currency": "GBP"
    }
  ],
  "metadata": {
    "type": "P2P_TRANSFER",
    "initiator_id": "user_alice",
    "description": "Lunch money",
    "reference": "REF123"
  }
}
Response:
{
  "ledger_transaction_id": "lt_xyz789",
  "status": "COMMITTED",
  "committed_at": "2026-04-23T12:00:00.123Z",
  "balance_snapshots": {
    "acc_alice_GBP": { "available": 40000, "ledger": 40000 },
    "acc_bob_GBP":   { "available": 60000, "ledger": 60000 }
  }
}

GET /internal/ledger/accounts/{accountId}/balance
Response:
{
  "account_id": "acc_alice_GBP",
  "currency": "GBP",
  "ledger_balance_minor": 40000,     // sum(credits) - sum(debits)
  "available_balance_minor": 35000,  // ledger - pending holds
  "pending_holds_minor": 5000,
  "as_of": "2026-04-23T12:00:01Z"
}`,
      internals: `PostgreSQL schema:
CREATE TABLE ledger_entries (
  entry_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   UUID NOT NULL,           -- groups related entries
  account_id       TEXT NOT NULL,
  entry_type       TEXT NOT NULL,           -- DEBIT | CREDIT
  amount_minor     BIGINT NOT NULL CHECK (amount_minor > 0),
  currency         CHAR(3) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata         JSONB,
  CONSTRAINT ledger_entries_txn_account UNIQUE (transaction_id, account_id, entry_type)
);
CREATE INDEX le_account_time ON ledger_entries (account_id, created_at DESC);
CREATE INDEX le_transaction ON ledger_entries (transaction_id);

-- Transactions must balance: enforced at application layer + periodic reconciliation
-- Constraint: SUM(DEBIT amounts) = SUM(CREDIT amounts) per transaction_id

Balance calculation:
  SELECT
    COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_minor ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount_minor ELSE 0 END), 0)
    AS balance_minor
  FROM ledger_entries WHERE account_id = $accountId;

Balance cache (Redis):
  Key: balance:{account_id}
  Updated: on every ledger write (atomic with DB write via Lua script)
  TTL: none (invalidated on write, not time-based)
  On cache miss: compute from ledger DB → repopulate cache

Idempotency at storage layer:
  ON CONFLICT (transaction_id, account_id, entry_type) DO NOTHING
  Second write of same transaction → silently ignored
  Ensures: double-processing never corrupts ledger

Reconciliation (runs nightly):
  For every transaction: SUM(DEBIT amounts) == SUM(CREDIT amounts)
  Sum of all account balances == sum of safeguarding accounts at partner banks
  Discrepancy → alert on-call team immediately`,
    },
    {
      id: "paymentService",
      title: "Payment Service — LLD",
      description: "P2P transfers, bank transfers, and card payment orchestration",
      api: `POST /api/v1/payments/transfer
Headers: Authorization: Bearer <jwt>
         X-Idempotency-Key: <client-uuid>
{
  "from_account_id": "acc_alice_GBP",
  "to": {
    "type": "REVOLUT_USER",           // REVOLUT_USER | BANK_ACCOUNT | PHONE | EMAIL
    "revolut_tag": "@bob"
  },
  "amount": {
    "value": "100.00",
    "currency": "GBP"
  },
  "description": "Lunch money",
  "scheduled_at": null                // null = immediate, or ISO datetime for scheduled
}
Response:
{
  "payment_id": "pay_abc123",
  "status": "COMPLETED",             // PENDING | PROCESSING | COMPLETED | FAILED
  "amount": { "value": "100.00", "currency": "GBP" },
  "fee": { "value": "0.00", "currency": "GBP" },
  "exchange_rate": null,             // set if cross-currency
  "completed_at": "2026-04-23T12:00:00Z",
  "reference": "REV-2026-001234"
}

GET /api/v1/payments/{paymentId}
GET /api/v1/payments?limit=20&cursor=<cursor>  (transaction history)`,
      internals: `Payment state machine:
  CREATED → FRAUD_CHECK → BALANCE_CHECK → PROCESSING → COMPLETED | FAILED | REVERSED

PostgreSQL schema:
CREATE TABLE payments (
  payment_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key   UUID UNIQUE NOT NULL,
  initiator_id      UUID NOT NULL,
  from_account_id   TEXT NOT NULL,
  to_account_id     TEXT,                    -- null for external bank transfers
  to_bank_details   JSONB,                   -- for SWIFT/SEPA
  payment_type      TEXT NOT NULL,           -- P2P | BANK_TRANSFER | CARD_AUTH | FX
  amount_minor      BIGINT NOT NULL,
  currency          CHAR(3) NOT NULL,
  exchange_rate     DECIMAL(18,8),           -- for FX payments
  status            TEXT NOT NULL DEFAULT 'CREATED',
  failure_reason    TEXT,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

P2P transfer flow (Revolut to Revolut):
  1. Check idempotency (Redis + DB UNIQUE constraint)
  2. Resolve recipient (look up @bob tag → account_id)
  3. Fraud check (sync rules engine, < 10ms)
  4. Balance check: available_balance >= amount
  5. Begin transaction:
     INSERT payment (status=PROCESSING)
     POST /internal/ledger/entries [DEBIT sender, CREDIT recipient]
     UPDATE payment SET status=COMPLETED
  6. Publish to Kafka: payment-events
  7. Return result

Outbox pattern (prevents event loss):
  In same DB transaction as step 5:
    INSERT INTO outbox (event_type='PAYMENT_COMPLETED', payload={...})
  Background Debezium CDC connector reads outbox → publishes to Kafka
  Guarantees: payment committed → event always published (no crash-between gap)

External bank transfer (SEPA):
  1–4 same as P2P
  5. Create SEPA credit transfer file (pain.001 XML format)
  6. Submit to Revolut's banking partner via API
  7. Status: PROCESSING (async — may take hours)
  8. Bank partner sends webhook when settled → update to COMPLETED`,
    },
    {
      id: "cardAuthService",
      title: "Card Authorization Service — LLD",
      description: "< 100ms card authorization — balance, fraud, limits, compliance checks",
      api: `POST /internal/card/authorize
(Received from Mastercard network via ISO 8583 message, translated to JSON internally)
{
  "authorization_id": "auth_xyz",
  "card_id": "card_abc123",
  "merchant": {
    "id": "merchant_xyz",
    "name": "Tesco Express",
    "mcc": "5411",              // Merchant Category Code
    "country": "GB",
    "city": "London"
  },
  "amount": {
    "value": "45.99",
    "currency": "GBP"
  },
  "transaction_type": "PURCHASE",   // PURCHASE | CASH_ADVANCE | REFUND
  "pos_entry_mode": "CONTACTLESS"
}
Response (must be fast — < 100ms total):
{
  "decision": "APPROVED",          // APPROVED | DECLINED
  "decline_code": null,            // 51=insufficient_funds, 54=expired, 57=not_permitted, 59=fraud
  "auth_code": "AUTH123",          // 6-digit approval code
  "available_balance_after_minor": 35401
}`,
      internals: `Authorization decision pipeline (budget: 100ms total):

Step 1 — Card lookup (5ms):
  Redis GET card:{card_id} → { user_id, account_id, status, limits, settings }
  Cache miss: read PostgreSQL, repopulate Redis (TTL 5 min)
  If card status != ACTIVE: return DECLINED (54 or 57)

Step 2 — Fraud rules check (5ms):
  Rules engine (in-memory, pre-compiled):
  • amount > user's 3-month 99th percentile × 2.0 → decline (59)
  • country in user's never-visited list AND high-risk country → decline (59)
  • same merchant charged > 3 times in last 10 min → decline (59)
  • card flagged for review → decline (59)
  Rules stored in Redis, hot-loaded in memory → no DB read needed

Step 3 — Balance check (5ms):
  available_balance = Redis GET balance:{account_id} (cached)
  Convert amount to account currency if needed (FX inline, cached rate)
  amount_in_account_currency > available_balance → DECLINED (51)

Step 4 — Spending limits check (5ms):
  Redis counters: daily_spend:{card_id}:{date} → compare to card limits
  Merchant category check: user set "block gambling" (MCC 7995) → decline (57)

Step 5 — Hold deduction (10ms):
  APPROVED: deduct hold from available balance
    Redis: DECRBY balance_available:{account_id} {amount_minor}
    Write hold: INSERT INTO card_holds (card_id, amount, merchant_id, expires_at)
  Kafka: publish auth-event (async, doesn't block response)

Step 6 — Async ML fraud score (separate, doesn't block authorization):
  Kafka consumer picks up auth-event
  Full ML model runs: 300+ features → fraud_score
  If fraud_score > 0.9: freeze card, push alert to user (post-authorization)`,
    },
    {
      id: "fxService",
      title: "FX Service — LLD",
      description: "Real-time rate streaming, currency conversion, position management",
      api: `GET /api/v1/fx/rate?from=GBP&to=USD&amount=100.00
Response:
{
  "from": "GBP",
  "to": "USD",
  "rate": 1.2650,
  "interbank_rate": 1.2668,
  "revolut_margin_pct": 0.14,
  "amount_from": 100.00,
  "amount_to": 126.50,
  "fee": 0.00,
  "rate_valid_until": "2026-04-23T12:00:30Z",   // rate locked for 30 seconds
  "fair_usage_remaining_minor": 50000,            // GBP 500 remaining this month (free plan)
  "fair_usage_reset_at": "2026-05-01T00:00:00Z"
}

POST /api/v1/fx/exchange
Headers: X-Idempotency-Key: <uuid>
{
  "from_account_id": "acc_alice_GBP",
  "to_account_id": "acc_alice_USD",
  "from_amount": 100.00,
  "from_currency": "GBP",
  "rate_token": "rate_token_xyz",    // locked rate from GET /fx/rate
  "rate_expiry": "2026-04-23T12:00:30Z"
}
Response:
{
  "exchange_id": "fx_abc123",
  "status": "COMPLETED",
  "from": { "amount": 100.00, "currency": "GBP" },
  "to": { "amount": 126.50, "currency": "USD" },
  "rate": 1.2650,
  "fee_charged": 0.00,
  "completed_at": "2026-04-23T12:00:01Z"
}`,
      internals: `Rate storage and refresh:
  Rate provider connections: Bloomberg B-PIPE, Reuters Eikon (persistent streams)
  On rate update: SET fx_rate:GBP:USD 1.2650 PX 250  (250ms TTL)
  Revolut margin applied at read time (not stored):
    display_rate = raw_rate × (1 - margin_pct)
    margin_pct: configurable per currency pair, per plan tier

Rate token (30-second lock):
  Client requests rate → server generates rate_token:
    token = JWT { from, to, rate, expires_at: now+30s }
    signed with server secret
  On exchange: validate token signature + expiry
  If expired: reject → client must get new rate
  Prevents: user getting old favorable rate after market moved

Fair usage tracking (free plan limit):
  Key: fair_usage:{user_id}:{year_month}
  On exchange: INCRBY fair_usage:{user_id}:{year_month} {amount_GBP_minor}
  Key expires at end of month (EXPIREAT first of next month)
  If total > limit (e.g., £1000/month): apply 1.5% surcharge on remaining conversions

FX ledger entries:
  GBP → USD exchange of £100 at 1.2650:
  DEBIT  acc_alice_GBP       £100.00
  CREDIT acc_alice_USD        $126.50
  DEBIT  revolut_usd_reserve  $126.50   (Revolut's internal USD pool)
  CREDIT revolut_gbp_revenue  £100.00   (offset — Revolut's FX desk settles at day end)

  Internal Revolut accounts balance throughout the day
  End of day: treasury desk executes interbank trades to net positions

Position tracking (real-time):
  Kafka consumer: FX-trades topic
  Flink aggregation: net position per currency pair, updated on each trade
  Dashboard: treasury team monitors live exposure
  Alert: if position exceeds hedging threshold → auto-hedge trigger`,
    },
    {
      id: "fraudService",
      title: "Fraud Detection Service — LLD",
      description: "Rules engine + async ML scoring — protecting every transaction",
      api: `POST /internal/fraud/check
{
  "event_type": "CARD_AUTH",    // CARD_AUTH | P2P_TRANSFER | LOGIN | ACCOUNT_CHANGE
  "user_id": "u_abc123",
  "transaction": {
    "amount_minor": 4599,
    "currency": "GBP",
    "merchant_id": "merchant_xyz",
    "merchant_country": "GB",
    "merchant_mcc": "5411"
  },
  "device": {
    "device_id": "dev_xyz",
    "ip_address": "10.1.2.3",
    "user_agent": "Revolut/8.24 iOS/17"
  },
  "context": {
    "recent_transactions": [...],   // last 5 transactions for velocity check
    "user_profile": {
      "avg_transaction_amount": 3500,
      "usual_countries": ["GB", "FR"],
      "account_age_days": 720
    }
  }
}
Response (synchronous, < 10ms):
{
  "decision": "ALLOW",             // ALLOW | BLOCK | STEP_UP
  "reason": null,                  // populated if BLOCK or STEP_UP
  "risk_signals": ["new_country"], // non-blocking signals for async ML
  "async_score_requested": true    // will ML model score this async?
}`,
      internals: `Rules engine (synchronous, < 10ms):

Rules stored in Redis as compiled decision tree:
  Loaded into service memory at startup, hot-reloaded every 60s (no restart needed)
  Rule evaluation: in-memory, no I/O during evaluation

Example rules (simplified):
  IF transaction.amount > user_profile.p99_amount × 3.0 THEN STEP_UP
  IF merchant_country NOT IN user_profile.usual_countries
     AND merchant_country IN HIGH_RISK_COUNTRIES THEN BLOCK
  IF velocity.declined_count_last_5min > 3 THEN BLOCK
  IF device_id NOT in user_known_devices AND amount > 500 THEN STEP_UP
  IF merchant_mcc IN user_blocked_categories THEN BLOCK

Velocity counters (Redis, per user):
  Key: velocity:{user_id}:{window}  e.g., velocity:u_123:1min
  Type: Redis sorted set (timestamp → event)
  ZADD velocity:{user_id}:1min {timestamp} {event_id}
  ZREMRANGEBYSCORE ... {now-60s} {now}  ← trim old events
  ZCARD → count in window
  TTL: auto-expires if user is inactive

Async ML scoring (Kafka consumer, < 5 seconds):
  Receives auth-event from Kafka
  Feature extraction: 300+ features including graph features (is payee mule?)
  Graph features: BFS on transaction graph, look for known fraud patterns
  Model: XGBoost + neural net ensemble → fraud_score 0.0–1.0
  If fraud_score > threshold:
    Kafka: fraud-actions topic { action: FREEZE_CARD, user_id, reason }
  Fraud Action Consumer:
    UPDATE card SET status=FROZEN
    Push notification: "We've temporarily frozen your card for security"
    Create case in fraud review system

Model retraining pipeline (nightly, Spark):
  Input: labeled transactions (user confirmed fraud, chargebacks, SAR cases)
  Features: same 300+ as online serving
  Training: distributed XGBoost on Spark (8h job)
  Validation: AUC-ROC, precision/recall on holdout set
  Deploy: if metrics better than current → promote to production (canary first)`,
    },
    {
      id: "accountService",
      title: "Account Service — LLD",
      description: "Customer accounts, KYC verification, multi-currency pockets",
      api: `POST /api/v1/accounts  (Onboarding — create account)
{
  "email": "alice@example.com",
  "phone": "+447700900123",
  "date_of_birth": "1990-01-15",
  "nationality": "GB",
  "country_of_residence": "GB",
  "referral_code": "ALICE123"
}
Response: { "user_id": "u_abc123", "status": "KYC_PENDING" }

POST /api/v1/kyc/verify  (KYC document upload)
{
  "document_type": "PASSPORT",
  "front_image_base64": "...",
  "back_image_base64": null,   // passports don't have a back
  "selfie_video_base64": "..."  // liveness check
}
Response: { "kyc_status": "UNDER_REVIEW", "eta_minutes": 5 }

GET /api/v1/accounts/me
Response:
{
  "user_id": "u_abc123",
  "display_name": "Alice Smith",
  "plan": "premium",
  "kyc_status": "APPROVED",
  "accounts": [
    { "account_id": "acc_alice_GBP", "currency": "GBP", "balance": "500.00", "available": "450.00" },
    { "account_id": "acc_alice_EUR", "currency": "EUR", "balance": "200.00", "available": "200.00" }
  ],
  "cards": [{ "card_id": "card_abc", "last4": "4242", "status": "ACTIVE" }]
}`,
      internals: `PostgreSQL schema:
CREATE TABLE users (
  user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  phone           TEXT UNIQUE NOT NULL,
  full_name       TEXT,
  date_of_birth   DATE,
  nationality     CHAR(2),
  country_of_residence CHAR(2),
  plan            TEXT DEFAULT 'free',  -- free | premium | metal
  kyc_status      TEXT DEFAULT 'PENDING', -- PENDING | UNDER_REVIEW | APPROVED | REJECTED
  kyc_tier        INT DEFAULT 0,        -- 0=none, 1=basic, 2=full, 3=enhanced
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  risk_rating     TEXT DEFAULT 'STANDARD' -- STANDARD | ELEVATED | HIGH
);

CREATE TABLE accounts (
  account_id   TEXT PRIMARY KEY,          -- e.g., "acc_alice_GBP"
  user_id      UUID NOT NULL REFERENCES users,
  currency     CHAR(3) NOT NULL,
  account_type TEXT DEFAULT 'PERSONAL',   -- PERSONAL | SAVINGS | VAULT
  status       TEXT DEFAULT 'ACTIVE',     -- ACTIVE | FROZEN | CLOSED
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, currency, account_type)
);

KYC pipeline:
  Document upload → S3 (encrypted at rest with KMS)
  OCR extraction: AWS Textract or internal model → extract name, DOB, document number
  Liveness check: video analyzed → is face in video a live person? Match to document photo?
  Watchlist screening:
    • OFAC SDN list (US sanctions)
    • EU consolidated sanctions list
    • UK HMT sanctions list
    • PEP (Politically Exposed Persons) database
    • Adverse media (news articles mentioning fraud, crime)
  If any match: escalate to compliance analyst
  Pass all checks: KYC approved, kyc_tier updated, account limits raised

Spending limits by KYC tier:
  Tier 0 (unverified): no payments
  Tier 1 (email + phone): £100/day top-up, £50/day card spend
  Tier 2 (document verified): £5,000/day, £25,000/month
  Tier 3 (enhanced due diligence): custom limits for high-value customers`,
    },
  ],
};

export const REVOLUT_QNA = [
  {
    id: "rq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Revolut", "Monzo", "Stripe"],
    question: "Design a digital banking system like Revolut. What are the core components and how do they interact?",
    answer: `Revolut's architecture centers on one principle: money cannot be created or lost. Everything flows from the ledger.

CORE COMPONENTS:

1. LEDGER SERVICE (center of everything):
   Double-entry bookkeeping — every money movement has equal debits and credits
   Append-only: entries never updated or deleted
   Balance = SUM(credits) - SUM(debits) for an account

2. PAYMENT SERVICE:
   Orchestrates: P2P transfers, bank transfers, FX exchanges
   Uses Outbox pattern: DB write + event publish in same transaction → no lost events
   Idempotency: X-Idempotency-Key on every request + DB UNIQUE constraint

3. CARD AUTHORIZATION SERVICE:
   Real-time: < 100ms decision on every card tap
   Pipeline: card lookup → rules engine (fraud) → balance check → limits check → hold deduction
   All in-memory/Redis — no DB reads on critical path

4. FRAUD SERVICE:
   Sync (< 10ms): rules engine for authorization-time decisions
   Async (< 5s): ML model for post-transaction scoring → freeze if high risk

5. FX SERVICE:
   Streams rates every 250ms from Bloomberg/Reuters
   Rate token: locks rate for 30 seconds (prevents rate-change gaming)
   Position management: Revolut is counterparty to all trades, hedges via treasury

KEY INSIGHT:
"The ledger is immutable — you never UPDATE a balance. You compute balance = SUM(entries). This makes audit trivial, prevents corruption, and is a regulatory requirement. The tradeoff: reads require aggregation, so you cache the computed balance in Redis."`,
    followups: [
      "How do you handle a race condition where two transfers try to debit the same account simultaneously?",
      "What happens if the card authorization service is down — do all card payments fail?",
      "How do you roll back a payment if step 3 succeeds but step 4 fails?",
    ],
  },
  {
    id: "rq2",
    category: "Ledger Design",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Revolut", "Stripe", "Square"],
    question: "Design a financial ledger that is 100% accurate. How do you ensure money is never created or lost?",
    answer: `Double-entry bookkeeping + append-only storage + continuous reconciliation.

DOUBLE-ENTRY:
  Every transaction has balanced debits and credits
  Alice sends Bob £100:
    DEBIT  alice_account  £100
    CREDIT bob_account    £100
    Net = 0 ← always true

  Conservation law: SUM(all debits) = SUM(all credits) always
  This is enforced at: application layer, DB constraint, nightly reconciliation

APPEND-ONLY (immutable):
  Never UPDATE balances — compute them from entries
  balance = SUM(credits) - SUM(debits) for account_id
  Mistake? Add a reversing entry, never delete
  Why: full audit trail preserved, no balance drift from concurrent updates

IDEMPOTENCY (prevents double-processing):
  Every transaction has a UUID (transaction_id)
  DB: UNIQUE constraint on (transaction_id, account_id, entry_type)
  Second write of same transaction → silently ignored
  API layer: Redis idempotency key → return cached result without reprocessing

BALANCE CACHE (Redis):
  Computing balance from millions of entries on every read is slow
  Cache: balance:{account_id} updated atomically on every ledger write
  On cache miss: full recompute from DB → repopulate

RECONCILIATION (nightly):
  1. For each transaction: assert SUM(debits) = SUM(credits)
  2. For each account: assert cached_balance = computed_from_entries
  3. Sum of all customer account balances = partner bank safeguarding account balance
  4. Any discrepancy → wake on-call team immediately`,
    followups: [
      "How do you handle multi-currency transactions in the ledger?",
      "What's the tradeoff between computing balance from ledger entries vs maintaining a balance column?",
      "How do you handle scheduled payments — debit now, credit settles in T+2?",
    ],
  },
  {
    id: "rq3",
    category: "Payments",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Revolut", "Monzo", "Wise"],
    question: "Design an idempotent payment system. How do you ensure a transfer is processed exactly once even with network failures and retries?",
    answer: `Idempotency requires two layers: API deduplication and storage constraint.

THE FAILURE SCENARIO:
  Client sends transfer → server processes → deducts balance → crashes before responding
  Client retries (timeout) → server processes again → balance deducted twice
  Without idempotency: customer loses money

SOLUTION — TWO-LAYER IDEMPOTENCY:

LAYER 1 — API LEVEL (Redis):
  Client generates UUID before request: X-Idempotency-Key: <uuid>
  Server on receive:
    SET idempotency:{key} "PROCESSING" EX 300 NX  ← atomic, fails if key exists
  If SET fails → another server handling or already processed → wait and return cached result
  After processing:
    SET idempotency:{key} {result_json} EX 86400

LAYER 2 — STORAGE LEVEL (DB constraint):
  payments table: UNIQUE(idempotency_key)
  ledger_entries: UNIQUE(transaction_id, account_id, entry_type)
  Even if API layer fails, second INSERT into DB → rejected by unique constraint
  Result: same payment always produces same ledger state

OUTBOX PATTERN (guarantees event publication):
  In single DB transaction:
    INSERT payment (status=COMPLETED)
    INSERT outbox (event=PAYMENT_COMPLETED, payload=...)
  Both committed atomically
  CDC connector (Debezium) reads outbox → publishes to Kafka → deletes row
  If CDC fails → retry (Kafka producer has exactly-once semantics)
  Guarantees: payment committed ↔ event published (no gap)

SAGA FOR CROSS-SERVICE TRANSACTIONS:
  Debit sender → credit receiver (two services)
  If credit fails after debit → compensating transaction: credit sender back
  Each step publishes event → next step triggered by event
  Retry with backoff until all steps complete or compensate`,
    followups: [
      "What's the difference between idempotency and exactly-once processing?",
      "How long should idempotency keys be retained? What if a client retries after 48 hours?",
      "How do you handle the case where the idempotency key Redis store goes down?",
    ],
  },
  {
    id: "rq4",
    category: "Fraud Detection",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Revolut", "Stripe", "PayPal"],
    question: "Design Revolut's real-time fraud detection system for card transactions.",
    answer: `Fraud detection is a latency vs accuracy tradeoff. Card authorization needs < 100ms; full ML takes 50ms+.

TWO-TIER APPROACH:

TIER 1 — SYNCHRONOUS RULES ENGINE (< 10ms, in authorization path):
  Rules compiled to in-memory decision tree — no DB reads
  What it catches: obvious fraud patterns
  Examples:
  • Amount > user's 99th percentile × 3 → STEP_UP (require 2FA)
  • Merchant country user has never visited + high-risk country → DECLINE
  • 3+ declined transactions in last 5 min → BLOCK
  • Card flagged for review → DECLINE
  Rules stored in Redis, hot-reloaded every 60s (no restart)

TIER 2 — ASYNC ML MODEL (< 5 seconds, post-authorization):
  Does NOT block the payment decision
  300+ features: amount, velocity, geo-delta, device fingerprint, graph features
  Graph feature: is the payee in a known money mule network? (BFS on transaction graph)
  Model: XGBoost + neural net ensemble → fraud_score 0.0–1.0
  Actions:
    > 0.9: freeze card + push notification + create review case
    0.7–0.9: flag for manual review, soft block
    < 0.7: monitor

FEEDBACK LOOP (model stays current):
  Labels: user reports fraud → label retroapplied; chargeback received → negative label
  Nightly Spark retraining on labeled data
  Deploy: canary (5% traffic) → if precision/recall improves → full deploy
  Fraud patterns change weekly — daily retraining considered for high-velocity patterns

VELOCITY COUNTERS (Redis, critical for rules):
  ZADD velocity:{user_id}:1min {ts} {event_id}
  ZREMRANGEBYSCORE (prune old) → ZCARD = count in window
  Atomic, fast, expires automatically`,
    followups: [
      "How do you avoid false positives that freeze legitimate users' cards while traveling?",
      "How do you detect authorized push payment fraud (victim tricked into sending money)?",
      "How do you handle an attacker who learns your rules and stays just below the thresholds?",
    ],
  },
  {
    id: "rq5",
    category: "FX & Concurrency",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Revolut", "Wise", "OFX"],
    question: "Design Revolut's FX exchange system. How do you handle currency conversion for millions of users while managing exchange rate risk?",
    answer: `FX is three problems: rate sourcing (accuracy), rate locking (user experience), and position management (risk).

RATE SOURCING:
  Stream from Bloomberg/Reuters via persistent connections (WebSocket/FIXML)
  Aggregate: best bid/ask across multiple liquidity providers → mid-rate
  Apply Revolut margin: display_rate = mid_rate × (1 - margin)
  Store: Redis SET fx_rate:GBP:USD 1.2650 PX 250 (250ms TTL)
  Update frequency: 250ms during London/NY overlap (highest liquidity)

RATE LOCKING (30-second window):
  Problem: user sees rate → confirms → rate has changed → unfair
  Solution: rate token (signed JWT)
    GET /fx/rate → server returns rate + signed token (expires in 30s)
    POST /fx/exchange → client includes token
    Server validates: signature valid? not expired?
    If valid: execute at locked rate (Revolut absorbs movement)
    If expired: reject → client must get new rate

POSITION MANAGEMENT (Revolut bears intraday FX risk):
  Revolut is counterparty to all trades (buys GBP, sells USD)
  Throughout the day: net position accumulates (e.g., short $5M, long £3.9M)
  Treasury monitoring: Flink aggregates all trades → real-time net position dashboard
  Auto-hedge trigger: if position exceeds threshold → auto-execute interbank forward
  End-of-day: full netting + settlement via CLS (Continuous Linked Settlement)

FAIR USAGE (free plan £1,000/month at interbank rate):
  Redis counter: INCRBY fair_usage:{user_id}:{YYYY_MM} {amount_minor}
  EXPIREAT: set to first of next month (auto-reset)
  Over limit: apply 1.5% surcharge on remaining conversions in the month`,
    followups: [
      "FX markets close on weekends. How do you handle currency conversion requests on Saturday?",
      "How do you handle a sudden 5% GBP/USD move in 10 minutes (flash crash)?",
      "How do you reconcile Revolut's internal positions against the actual interbank settlement?",
    ],
  },
  {
    id: "rq6",
    category: "Compliance",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["Revolut", "N26", "Monzo"],
    question: "Design the KYC (Know Your Customer) verification system for a neobank.",
    answer: `KYC is a regulatory requirement — cannot onboard customers without it. Speed matters for conversion.

WHAT KYC VERIFIES:
  Identity: is this a real person? (not a fake identity)
  Liveness: is this person present right now? (not a stolen photo)
  Watchlists: sanctions, PEP, adverse media screening
  Age: must be 18+ in most markets

THREE-STAGE PIPELINE:

STAGE 1 — DOCUMENT EXTRACTION (automated, < 30s):
  User photos passport/driving license → upload to S3 (encrypted)
  OCR model: extract name, DOB, document number, expiry
  Document authenticity check: fonts, holograms, MRZ checksum validation
  Liveness video: ML model detects live face (not static photo, not deepfake)
  Face match: compare selfie face to document photo → similarity score

STAGE 2 — WATCHLIST SCREENING (automated, < 5s):
  Extracted name → fuzzy match against:
    OFAC SDN list (US Treasury sanctions)
    EU consolidated sanctions list
    UN sanctions list
    PEP database (politicians, their family members)
    Adverse media API (news mentions of fraud/crime)
  Exact match → reject immediately
  Fuzzy match → human review queue

STAGE 3 — HUMAN REVIEW (if flagged, SLA < 5 min):
  Analyst sees: document images, selfie, extracted data, watchlist hits
  Decision: APPROVE, REJECT, REQUEST_MORE_INFO
  Escalation: suspicious cases → compliance team (potential SAR)

TIERED LIMITS:
  Unverified: no payments
  Stage 1 complete (basic): £100/day
  All stages complete: £5,000/day
  Enhanced (additional income documents): £25,000+/day`,
    followups: [
      "How do you handle KYC for customers from high-risk countries with poor document quality?",
      "How do you keep watchlists up to date — OFAC can add names any day?",
      "How do you handle name variations (e.g., John vs Johnny vs Jonathan)?",
    ],
  },
  {
    id: "rq7",
    category: "Reliability",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Revolut", "Monzo", "Stripe"],
    question: "How do you design a payment system for 99.99% availability? What happens when the database goes down?",
    answer: `99.99% = < 53 minutes downtime per year. Every component must have a fallback.

AVAILABILITY STRATEGY BY COMPONENT:

LEDGER DATABASE (most critical — single point of failure we accept):
  PostgreSQL with Patroni + etcd auto-failover
  Primary fails → standby promoted in < 30 seconds
  30 seconds × N failures/year → budget carefully
  Multi-AZ: primary and standby in different data centers
  If both fail: payments HALT (correct — money safety > availability)
  Point-in-time recovery: WAL shipped to S3, can restore to any second

CARD AUTHORIZATION (must be always on):
  All critical data in Redis (card status, balance, limits) — persisted to DB async
  Redis Cluster: 3 primary + 3 replica shards → any shard failure → automatic failover
  If Redis fails: fall back to rules engine with cached data (degrade gracefully)
  If all Redis fails: decline all transactions (safer than approving without balance check)

FRAUD SERVICE:
  Rules engine: in-memory, no external dependencies → never fails
  ML model: async → if unavailable, fall back to rules-only (higher false negative rate)
  Circuit breaker: if ML model times out 10 times → open circuit, stop calling for 30s

PAYMENT SERVICE:
  Stateless: crash and restart in < 5s (Kubernetes pod restart)
  Idempotency: client retries are safe (duplicate detection prevents double-charge)
  If payment service crashes mid-transfer: Saga's compensating transactions reverse partial work

GRACEFUL DEGRADATION HIERARCHY:
  1. All systems healthy: full feature set
  2. FX down: P2P and card payments work, FX exchange disabled
  3. Fraud ML down: rules engine only (accept more fraud risk temporarily)
  4. Notification down: payments work, notifications delayed
  5. Ledger DB down: all payments halt (non-negotiable)`,
    followups: [
      "How do you test that your failover actually works before a real failure?",
      "How do you communicate to customers during an outage that payments are temporarily unavailable?",
      "What's your strategy for a prolonged outage (> 1 hour) of the ledger database?",
    ],
  },
  {
    id: "rq8",
    category: "Scale",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["Revolut", "Stripe", "Adyen"],
    question: "How do you scale a financial ledger from 1 million to 100 million customers?",
    answer: `Scaling a ledger has unique constraints: you can't shard arbitrarily (transfers cross shards), and you can't lose data.

EVOLUTION OF THE LEDGER:

STAGE 1 — Single PostgreSQL (0–1M customers):
  Single primary + read replica
  All ledger entries in one table
  Works fine — ledger is append-only (insert-heavy, not update-heavy)
  Balance from cache (Redis) — DB used for reconciliation only

STAGE 2 — Read scaling (1M–10M customers):
  Multiple read replicas (3–5) with load-balanced reads
  Write still to single primary — this is the bottleneck
  Connection pooling (PgBouncer): 10K connections → pool → 100 real DB connections

STAGE 3 — Write scaling via sharding (10M–100M customers):
  Shard by user_id (hash-based): user's accounts and entries in same shard
  P2P transfer between users on different shards:
    Option A: XA distributed transaction (2PC) — slow, complex, partial failures
    Option B: Saga pattern — debit on shard A (with hold), credit on shard B, confirm or compensate
    Revolut chooses: Saga (more complex but more available than 2PC)
  Cross-shard reconciliation: each shard reconciles independently + global reconciliation

IMMUTABLE LEDGER ARCHIVAL:
  Entries older than 7 years (legal requirement) → S3 glacier (cold storage)
  Recent entries: hot PostgreSQL
  Historical queries: Athena/Spark on S3 parquet files
  Split: < 7 years = fast DB, > 7 years = cold archive

CACHING STRATEGY AT SCALE:
  Balance cache: Redis Cluster (not single Redis)
  100M users × 3 currencies × 16 bytes = ~5 GB → fits in Redis comfortably
  Cache invalidation: write-through on every ledger commit`,
    followups: [
      "How do you migrate from a single-shard to multi-shard ledger without downtime?",
      "How do you handle account statement generation for a user with 10,000 transactions/year?",
      "At 100M customers, how do you ensure nightly reconciliation completes in time?",
    ],
  },
];
