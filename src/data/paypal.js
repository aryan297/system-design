export const PAYPAL_HLD = {
  title: "PayPal — High Level Design",
  subtitle: "Global payments platform — 430M accounts, $1.5T payment volume, 45M merchants",
  overview: `PayPal is the world's largest independent digital payments platform — 430M consumer and merchant accounts, $1.5 trillion in annual payment volume (2023), and operations in 200+ markets. Unlike Revolut (neobank focused on consumers), PayPal sits at the intersection of consumers and merchants — a two-sided marketplace where both must trust the platform.

The core engineering challenges: processing payments at massive scale while maintaining exactly-once semantics, fraud detection for both consumer and merchant fraud, a checkout flow that must convert (every extra second of latency loses sales), and compliance across 200+ regulatory jurisdictions.

PayPal's stack is largely Java-based microservices on their own infrastructure (not primarily cloud), with a globally distributed Oracle database cluster at the core — one of the largest Oracle deployments in the world.`,

  diagram: `
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│    Consumer App (iOS/Android/Web) · Merchant SDK · Checkout.js     │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  HTTPS / REST
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   API GATEWAY / CDN (Akamai)                        │
│         Auth · Rate Limiting · DDoS Protection · Routing            │
└──┬──────────────┬──────────────┬─────────────────┬─────────────────┘
   │              │              │                 │
   ▼              ▼              ▼                 ▼
┌──────────┐ ┌──────────┐ ┌──────────┐    ┌────────────────┐
│ Payment  │ │Checkout  │ │Dispute & │    │ Fraud &        │
│ Service  │ │ Service  │ │Resolution│    │ Risk Service   │
└────┬─────┘ └──────────┘ └──────────┘    └────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PAYMENT PROCESSOR LAYER                          │
│      Visa · Mastercard · ACH · SWIFT · Venmo · Local Wallets        │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       DATA LAYER                                    │
│  Oracle DB (financial records) · PostgreSQL · Cassandra             │
│  Kafka (event bus) · Redis (cache) · Hadoop/Spark (analytics)       │
└─────────────────────────────────────────────────────────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Payment Processing",
      sections: [
        {
          title: "Payment Flow — Consumer to Merchant",
          content: `A PayPal payment touches multiple systems that must all agree on the outcome. The flow must be atomic — either the buyer pays and the merchant gets paid, or nothing happens.

PAYMENT TYPES:
  PayPal balance: instant, internal ledger transfer
  Bank account (ACH): T+1 to T+3 settlement, reversible
  Credit/debit card: real-time authorization, T+1 settlement
  PayPal Credit: consumer financing, PayPal funds merchant immediately

THE CHECKOUT FLOW:
  1. Buyer clicks "Pay with PayPal" on merchant site
  2. Redirect to PayPal checkout (or in-context popup on Checkout.js)
  3. Buyer logs in / authenticates (or guest checkout with card)
  4. Buyer reviews: merchant name, amount, payment method
  5. Buyer confirms payment
  6. PayPal creates payment record: status=PENDING
  7. Fraud check (< 500ms): approve, decline, or flag for review
  8. Fund movement:
     a. Deduct from buyer's source (balance or card hold)
     b. Credit merchant's PayPal balance (immediate)
     c. Settle source in background (ACH: T+1, card: T+1)
  9. Notify buyer (email + push) and merchant (IPN/webhook)
  10. Redirect buyer back to merchant with payment confirmation token

HELD FUNDS (new sellers):
  New merchants: funds held for 21 days before released to bank
  Why: chargeback window is 180 days; PayPal holds enough to cover disputes
  Once merchant proves delivery track record: hold reduced to 5 days, then removed

PAYMENT STATES:
  PENDING → COMPLETED | FAILED | REVERSED | REFUNDED | DISPUTED`,
        },
        {
          title: "ACH & Bank Transfers — The Slow Path",
          content: `ACH (Automated Clearing House) is the US bank transfer network. PayPal uses it for bank account funding and withdrawal. It's fundamentally different from card payments: slower, cheaper, and not guaranteed.

ACH CHARACTERISTICS:
  Settlement: T+1 (Same Day ACH) or T+2/T+3 (standard ACH)
  Cost: $0.20–$1.50 per transaction (vs 1.5–3% for cards)
  Reversibility: ACH can be reversed (NSF, unauthorized) for up to 60 days
  Guaranteed? No — ACH returns mean the payment fails after apparently succeeding

THE FLOAT PROBLEM:
  User pays merchant with bank account (ACH)
  Merchant needs money now, not in T+3
  PayPal solution: fund merchant immediately from PayPal's own balance (float)
  PayPal then collects from buyer's bank via ACH
  If ACH returns (insufficient funds): PayPal absorbs the loss, pursues buyer for recovery

ACH RETURN FRAUD:
  Bad actor: fund PayPal balance with bank ACH → spend money → ACH returns (NSF)
  PayPal loses the spent amount
  Mitigation:
    • New users: hold funds for 3–5 days before crediting (absorbs ACH return window)
    • Verify bank account ownership before accepting payments (micro-deposit verification)
    • ML model: predict ACH return probability based on bank, account age, user history
    • High-risk ACH: longer hold, lower limit

MICRO-DEPOSIT VERIFICATION:
  PayPal sends two small deposits (e.g., $0.13 and $0.47) to the bank account
  User confirms the amounts in PayPal app → bank account verified
  Without verification: can only receive, not send via ACH`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Fraud & Risk",
      sections: [
        {
          title: "Fraud Detection — Protecting Both Buyers and Sellers",
          content: `PayPal handles two-sided fraud: buyers committing fraud against merchants, and merchants committing fraud against buyers.

BUYER FRAUD:
  Stolen account: credentials stolen, fraudster drains balance
  Stolen card: fraudster uses stolen card to load PayPal balance
  Chargeback fraud: buyer claims payment was unauthorized → bank reverses → merchant loses goods
  Friendly fraud: buyer receives goods, claims not received → dispute wins → gets refund + keeps goods

MERCHANT FRAUD:
  Non-delivery: merchant charges buyer, never ships
  Counterfeit goods: merchant sells fake products
  Triangle fraud: merchant takes orders using stolen cards as the payment source
  High chargeback rate: merchant has systematic quality issues → PayPal holds/closes account

FRAUD SCORING (every payment):
  ML model runs on every transaction: 400+ features
  Key features:
    • Device fingerprint: browser/device characteristics, IP address
    • Behavioral biometrics: typing speed, mouse movement, login pattern
    • Network signals: IP reputation, VPN/proxy detection, geolocation vs shipping address
    • Transaction history: first time with this merchant? Unusual amount?
    • Social graph: is this merchant or buyer linked to known fraud accounts?
    • Time patterns: 3am transaction in a timezone where user never transacts before

  Output: risk_score 0–1000
  < 300: auto-approve
  300–700: step-up authentication (SMS OTP, security questions)
  > 700: auto-decline, flag for manual review

BUYER PROTECTION (trust mechanism):
  PayPal's key differentiator: buyers protected against "item not as described" and "item not received"
  Funded by: a portion of merchant fees goes into buyer protection reserve
  Dispute process: buyer disputes → PayPal investigates → refund or reject claim
  Seller protection: if seller follows rules (tracking, no prohibited items), protected against unauth chargebacks`,
        },
        {
          title: "Chargeback Management — When Buyers Dispute with Their Bank",
          content: `A chargeback is when a buyer asks their bank to reverse a card payment. For PayPal, managing chargebacks is a major operational challenge.

THE CHARGEBACK FLOW:
  1. Buyer contacts their bank: "I didn't authorize this charge"
  2. Bank reverses the transaction → debits PayPal's merchant account
  3. PayPal now has a loss: merchant already received funds, buyer was refunded by bank
  4. PayPal pursues one of:
     a. Merchant (if seller protection criteria not met → debit merchant's PayPal balance)
     b. Absorb the loss (if merchant has no funds, PayPal buyer protection covers it)

CHARGEBACK ECONOMICS:
  Average chargeback: $150 including processing fees
  PayPal volume: millions of transactions/day → even 0.1% chargeback rate = huge cost
  Card network rules: > 1% chargeback rate → merchant put on monitoring program → higher fees
  > 2% → merchant account terminated by Visa/Mastercard

CHARGEBACK RESPONSE AUTOMATION:
  Each chargeback requires a response to the card network within 10–30 days
  Automated evidence compilation:
    • Login logs: did buyer's IP/device log in near transaction time?
    • Shipping confirmation: tracking number from merchant → proof of delivery
    • IP geolocation match: buyer's IP matches shipping address location
    • Historical pattern: has this buyer disputed before?
  Evidence package auto-submitted to card network
  Win rate: automated responses win ~40% of chargebacks; human-reviewed win ~60%

RESERVE ACCOUNTS:
  Merchants with elevated chargeback risk: PayPal holds 10–15% of monthly volume in reserve
  Reserve released after 180-day chargeback window closes with clean record
  High-risk merchants: indefinite reserve (travel, subscriptions, digital goods)`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Checkout & Merchant",
      sections: [
        {
          title: "Checkout Experience — Conversion is the Product",
          content: `PayPal's checkout flow is a product in itself. Every millisecond of latency, every extra click, reduces conversion. A 1-second delay = 7% fewer completions.

CHECKOUT.JS — EMBEDDED CHECKOUT:
  Old flow: redirect buyer to PayPal site → buyer leaves merchant site → friction
  New flow: PayPal button embedded on merchant page via Checkout.js
  Pop-up: buyer logs into PayPal in a popup, approves, popup closes → stays on merchant site
  One-click checkout: buyer pre-approved → payment completes without login
  Result: 60% fewer steps vs redirect flow → higher conversion

ONE-TOUCH (Frictionless Payment):
  Trusted devices: PayPal remembers device + buyer → skip login for subsequent payments
  How: persistent cookie + device fingerprint → pre-auth token
  Buyer taps "One Touch" button → payment completes in < 2 seconds
  Risk: if device stolen → fraudster can make purchases
  Mitigation: amount limit ($2,000), high-risk merchant categories excluded

SMART PAYMENT BUTTONS:
  Checkout.js dynamically shows: PayPal, Venmo, Pay Later, Credit Card, BNPL
  Personalization: show Venmo button only if buyer's account has Venmo linked
  A/B tested continuously: button color, label, order → optimize conversion rate

PAYPAL'S LATENCY BUDGET:
  Target: checkout completes in < 3 seconds (page load → payment confirmation)
  Breakdown:
    • Button rendering (Checkout.js): < 200ms
    • User authentication: < 500ms (cached session)
    • Fraud check: < 300ms (synchronous, must complete before confirmation)
    • Fund movement: < 500ms (ledger write)
    • Redirect/callback to merchant: < 200ms
  Total: ~1.7s p50, < 3s p99`,
        },
        {
          title: "Merchant Onboarding & Webhooks",
          content: `Merchants need two things: easy integration and reliable payment notifications.

MERCHANT ONBOARDING:
  REST API: merchant registers → client_id + client_secret issued
  OAuth2: merchant exchanges credentials for access token (Bearer token for API calls)
  Capabilities: basic payments → advanced (subscriptions, marketplace, lending)
  KYB (Know Your Business): verify business entity, bank account, industry, volume

WEBHOOKS — PAYMENT NOTIFICATIONS:
  Merchant receives notification when payment status changes
  Event types: PAYMENT.COMPLETED, PAYMENT.REVERSED, DISPUTE.OPENED, etc.

  Delivery guarantee: at-least-once with exponential backoff
  Retry schedule: immediately → 5s → 30s → 5m → 30m → 2h → 12h → 24h → 3 days
  Merchant must: respond 200 within 30s, idempotently process events (may receive duplicates)

  Webhook payload:
  {
    "event_type": "PAYMENT.CAPTURE.COMPLETED",
    "event_id": "evt_abc123",    // idempotency key for merchant
    "create_time": "2026-04-23T12:00:00Z",
    "resource": {
      "id": "pay_xyz789",
      "amount": { "value": "150.00", "currency_code": "USD" },
      "status": "COMPLETED",
      "custom_id": "merchant_order_123"   // merchant's own order ID
    }
  }

IPN (LEGACY — Instant Payment Notification):
  PayPal's original notification system (still used by millions of merchants)
  PayPal POSTs to merchant URL → merchant validates + processes → responds "VERIFIED"
  Less reliable than webhooks (no event model, raw POST)
  Recommended: migrate to modern webhooks API`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Dispute Resolution",
      sections: [
        {
          title: "Dispute Resolution — When Things Go Wrong",
          content: `Disputes are when buyers claim something went wrong: item not received, item not as described, unauthorized transaction.

DISPUTE LIFECYCLE:
  Open dispute (buyer files) → Seller responds → PayPal investigates → Resolution
  Timeline: buyer has 180 days to open dispute; escalation to claim within 20 days of dispute

DISPUTE TYPES AND RESOLUTION:
  "Item Not Received" (INR):
    Seller provides tracking: delivered → seller wins (if correct address)
    No tracking / not delivered → buyer wins → refund from seller's balance

  "Significantly Not As Described" (SNAD):
    Buyer returns item → seller's responsibility to provide return shipping
    Item returned → buyer refunded; seller gets item back
    Digital goods: PayPal reviews description vs delivered product

  "Unauthorized Transaction":
    Buyer claims they didn't make the transaction
    Fraud investigation: did buyer's device/IP make the payment?
    If genuinely unauthorized → buyer refunded, account investigation
    If buyer is lying (friendly fraud) → dispute rejected

AUTOMATED RESOLUTION (< 5 minutes):
  Pattern-match against known resolutions:
    Seller has tracking showing delivered to buyer's address → auto-close (seller wins)
    Seller has 0 prior disputes + instant delivery proof → auto-close
    Repeat buyer from same seller → suspicious (buyer winning too many disputes) → flag
  ~60% of disputes auto-resolved without human review

HUMAN REVIEW (40% of disputes):
  Dispute analyst reviews: transaction history, communications, evidence
  Tools: internal case management system, message search, device graph
  SLA: resolution within 10 days (Buyer Protection requirement)

SELLER PROTECTION ELIGIBILITY:
  Transaction qualifies if:
  • Payment from verified PayPal account
  • Item shipped to confirmed address
  • Tracking shows delivery to buyer's address
  • No prohibited item categories (digital goods, tickets, vehicles)
  Ineligible: significantly not as described claims (policy excludes these)`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "Venmo & P2P",
      sections: [
        {
          title: "Venmo — Social Payments at Scale",
          content: `Venmo (acquired 2013) is PayPal's social payment app — primarily P2P payments between individuals with a social feed.

VENMO'S DIFFERENTIATOR — THE SOCIAL FEED:
  "Alice paid Bob for 🍕 pizza" — visible to all Venmo friends
  This social visibility was Venmo's growth engine (network effects)
  Privacy settings: public (default for transactions) | friends only | private
  The social feed is fundamentally different from PayPal (business-focused)

VENMO ARCHITECTURE:
  Separate app, separate brand, but shares PayPal's payment infrastructure
  Venmo accounts backed by PayPal's ledger
  Users can: P2P transfer, pay merchants (Venmo at checkout), cash out to bank

P2P PAYMENT FLOW:
  Bob sends Alice $20:
  1. Venmo App → Payment Service (Bob's Venmo balance or bank ACH or card)
  2. Fraud check (same ML pipeline as PayPal)
  3. Ledger: DEBIT Bob's account, CREDIT Alice's account (instant, internal)
  4. Social feed event: Kafka → Social Feed Service → publish to Bob and Alice's feeds
  5. Push notification to Alice: "Bob sent you $20 for 🍕"

FUNDING SOURCES HIERARCHY:
  Venmo balance (fastest, free) → Bank account (free, T+1–T+3 ACH) → Debit card (1.75% fee) → Credit card (3% fee)
  Users choose default; payment processed against default unless overridden

INSTANT TRANSFER (out to bank):
  Standard: free, 1–3 business days (ACH)
  Instant: 1.75% fee (min $0.25), < 30 minutes (via Visa/Mastercard push-to-card rails)
  Revenue model: the instant transfer fee is a significant Venmo revenue source

SOCIAL FEED ARCHITECTURE:
  Activity on Venmo → Kafka: venmo-transaction-events
  Social Feed Service: fan-out to friends' feeds (push model)
  Feed stored: Cassandra (activity_feed table, partition by user_id)
  Retrieval: GET /feed → Cassandra read → return last 20 activities`,
        },
      ],
    },
    {
      id: "phase6",
      label: "Phase 6",
      title: "Scale & Reliability",
      sections: [
        {
          title: "Processing $1.5 Trillion/Year — Infrastructure at Scale",
          content: `$1.5 trillion/year = $47,500/second average, much higher at peak (Black Friday, Cyber Monday).

SCALE MATH:
  $1.5T/year ÷ 365 ÷ 24 ÷ 3600 = $47,564/second average
  Peak (Black Friday): 10–20× average = ~$700K/second of payment volume
  Transactions: 250+ transactions/second average, 2,500+/second at peak

WHAT MAKES PAYPAL'S INFRASTRUCTURE UNIQUE:
  Not primarily AWS/GCP — PayPal runs largely on its own data centers
  Oracle RAC (Real Application Clusters): multi-node Oracle cluster for financial data
  One of the largest Oracle deployments globally: handles core payment records
  Java-based microservices: thousands of Java services coordinating payments
  Active-active data centers: two geographically separate DCs, both serving traffic

ACTIVE-ACTIVE DATA CENTERS:
  DC1 (Arizona) and DC2 (Nevada): both active simultaneously
  Traffic split: 50/50 normally, 100/0 during maintenance
  Synchronous replication for financial data between DCs (zero data loss)
  If DC1 fails: DNS failover to DC2 in < 60 seconds
  Financial data: no replication lag allowed (ACID, synchronous, Oracle Data Guard)

BLACK FRIDAY PREPARATION:
  Start scaling 6 weeks before: load tests, capacity planning
  Pre-scale: 3× normal instance count in place before Black Friday
  Auto-scaling: Kubernetes HPA for stateless services (fraud, notification, checkout)
  Traffic shaping: rate limiting per merchant to protect against one merchant causing overload
  War room: 24/7 on-call during peak period with all hands available`,
        },
        {
          title: "Global Compliance — Operating in 200+ Markets",
          content: `PayPal operates in 200+ countries, each with its own financial regulations, currency rules, and data laws.

LICENSING STRUCTURE:
  US: state-by-state money transmitter licenses (50 states × different rules)
  EU: e-money institution license from Luxembourg (covers all EU markets)
  UK: FCA e-money institution license (post-Brexit separate from EU)
  India: RBI Payment Aggregator license (strict domestic data storage requirements)
  China: operates through domestic partnerships (GoPay)

DATA RESIDENCY:
  India: all Indian transaction data must stay in India (RBI circular 2018)
  GDPR: EU personal data cannot leave EU without adequate protections
  China: Chinese transaction data must stay in China
  Solution: regional data centers per regulatory zone, strict data classification

OFAC SANCTIONS SCREENING:
  Every transaction: screen sender + receiver against OFAC SDN list
  Real-time API call to screening service (< 50ms, on payment path)
  Match → block transaction, freeze account, file SAR
  False positives (common names): human review within 24h

PCI-DSS COMPLIANCE:
  Card data never stored on PayPal servers: tokenized via card networks
  PayPal stores: token (reference), last4, expiry — never raw card number
  Annual audit: Qualified Security Assessor certifies compliance
  Penetration testing: quarterly automated + annual manual

AML MONITORING (same as Revolut but larger scale):
  Transaction monitoring rules + ML model running on all payment flows
  SAR filing: automated detection → human review → filing to FinCEN (US) or equivalent
  Enhanced due diligence: merchants processing > $10K/day get additional review`,
        },
      ],
    },
  ],

  metrics: [
    { label: "Active Accounts", value: "430M+", note: "consumers and merchants" },
    { label: "Annual Payment Volume", value: "$1.5T+", note: "2023" },
    { label: "Countries", value: "200+", note: "operational markets" },
    { label: "Transactions/second", value: "250+ avg", note: "2,500+ at peak" },
    { label: "Merchant accounts", value: "45M+", note: "businesses using PayPal" },
    { label: "Currencies", value: "25+", note: "supported for payments" },
    { label: "Checkout conversion", value: "60% higher", note: "vs guest checkout" },
    { label: "Buyer Protection", value: "$0 liability", note: "for eligible unauthorized transactions" },
  ],
};

export const PAYPAL_LLD = {
  title: "PayPal — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of core PayPal services",

  components: [
    {
      id: "paymentService",
      title: "Payment Service — LLD",
      description: "Order creation, payment capture, and multi-source fund orchestration",
      api: `POST /v2/checkout/orders  (Create order — merchant server)
Headers: Authorization: Bearer <access_token>
{
  "intent": "CAPTURE",
  "purchase_units": [{
    "amount": { "currency_code": "USD", "value": "150.00" },
    "description": "Order #12345",
    "custom_id": "order_12345",    // merchant's own order ID
    "shipping": {
      "address": {
        "address_line_1": "123 Main St",
        "admin_area_2": "San Jose",
        "admin_area_1": "CA",
        "postal_code": "95131",
        "country_code": "US"
      }
    }
  }],
  "application_context": {
    "return_url": "https://merchant.com/success",
    "cancel_url": "https://merchant.com/cancel"
  }
}
Response: { "id": "order_abc123", "status": "CREATED", "links": [...] }

POST /v2/checkout/orders/{orderId}/capture  (Capture after buyer approval)
Response:
{
  "id": "order_abc123",
  "status": "COMPLETED",
  "purchase_units": [{
    "payments": {
      "captures": [{
        "id": "cap_xyz789",
        "status": "COMPLETED",
        "amount": { "currency_code": "USD", "value": "150.00" },
        "seller_receivable_breakdown": {
          "gross_amount": { "value": "150.00", "currency_code": "USD" },
          "paypal_fee": { "value": "4.65", "currency_code": "USD" },  // 2.99% + $0.49
          "net_amount": { "value": "145.35", "currency_code": "USD" }
        },
        "create_time": "2026-04-23T12:00:00Z"
      }]
    }
  }]
}`,
      internals: `Order state machine:
  CREATED → APPROVED (buyer approves) → COMPLETED (captured) | VOIDED

Database schema (Oracle / PostgreSQL):
CREATE TABLE orders (
  order_id          VARCHAR(36) PRIMARY KEY,
  merchant_id       VARCHAR(36) NOT NULL,
  buyer_id          VARCHAR(36),          -- null until buyer logs in
  status            VARCHAR(20) NOT NULL, -- CREATED|APPROVED|COMPLETED|VOIDED
  currency_code     CHAR(3) NOT NULL,
  amount_cents      BIGINT NOT NULL,
  custom_id         VARCHAR(127),         -- merchant's reference
  intent            VARCHAR(10) NOT NULL, -- CAPTURE | AUTHORIZE
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at       TIMESTAMP,
  completed_at      TIMESTAMP,
  idempotency_key   VARCHAR(64) UNIQUE    -- prevents duplicate orders
);

CREATE TABLE captures (
  capture_id        VARCHAR(36) PRIMARY KEY,
  order_id          VARCHAR(36) NOT NULL REFERENCES orders,
  status            VARCHAR(20) NOT NULL,
  amount_cents      BIGINT NOT NULL,
  fee_cents         BIGINT NOT NULL,
  net_amount_cents  BIGINT NOT NULL,
  funding_source    VARCHAR(20),          -- PAYPAL_BALANCE | ACH | CARD
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

Capture flow:
  1. Validate order: status=APPROVED, not expired (order expires after 3 hours)
  2. Fraud check: buyer profile + merchant profile + transaction signals → risk_score
  3. Fund movement based on buyer's funding source:
     PAYPAL_BALANCE:
       Ledger: DEBIT buyer_account, CREDIT merchant_account (instant)
     BANK_ACCOUNT (ACH):
       Ledger: DEBIT paypal_float_account, CREDIT merchant_account (instant)
       Background: initiate ACH debit from buyer's bank (T+1 to T+3)
     CARD:
       Card network: send capture request to acquirer
       On approval: Ledger: DEBIT card_settlement_account, CREDIT merchant_account
  4. Publish to Kafka: payment-captured event
  5. Webhook to merchant: PAYMENT.CAPTURE.COMPLETED

Fee calculation:
  standard_rate = 0.0299  // 2.99%
  fixed_fee_USD = 0.49
  fee = max(amount_cents * standard_rate + fixed_fee_cents, minimum_fee_cents)
  Rates vary by: country, currency, merchant volume, payment method, card type`,
    },
    {
      id: "fraudService",
      title: "Fraud & Risk Service — LLD",
      description: "400+ feature ML model protecting buyers and merchants from fraud",
      api: `POST /internal/risk/score
{
  "event_type": "PAYMENT_CAPTURE",
  "buyer": {
    "account_id": "buyer_abc",
    "account_age_days": 1460,
    "verified_email": true,
    "verified_phone": true,
    "kyc_level": 2,
    "location": { "country": "US", "state": "CA", "ip": "1.2.3.4" }
  },
  "merchant": {
    "merchant_id": "merchant_xyz",
    "account_age_days": 730,
    "chargeback_rate": 0.003,
    "category": "ELECTRONICS"
  },
  "transaction": {
    "amount_cents": 15000,
    "currency": "USD",
    "item_type": "PHYSICAL_GOODS",
    "shipping_address_country": "US"
  },
  "device": {
    "fingerprint": "dev_abc123",
    "ip_address": "1.2.3.4",
    "user_agent": "Mozilla/5.0...",
    "is_vpn": false,
    "is_datacenter_ip": false
  },
  "session": {
    "login_time": "2026-04-23T11:55:00Z",
    "checkout_duration_sec": 45,
    "typing_cadence_score": 0.85   // behavioral biometrics
  }
}
Response:
{
  "risk_score": 285,              // 0–1000 scale
  "decision": "APPROVE",          // APPROVE | REVIEW | DECLINE
  "decline_code": null,
  "signals": ["new_device", "high_value"],
  "step_up_required": false,
  "recommended_holds_days": 0
}`,
      internals: `Feature engineering (400+ features):

Device intelligence:
  • Device fingerprint: browser/OS/screen/timezone/plugins hash → unique device ID
  • IP reputation: IPQS/MaxMind → fraud score, VPN/proxy/TOR detection
  • Geolocation match: IP country vs billing address country
  • Device age: first seen 2 hours ago = higher risk

Behavioral biometrics:
  • Typing cadence: time between keystrokes → human pattern vs bot pattern
  • Mouse movement: straight lines = bot; curved = human
  • Checkout duration: too fast (< 10s) or too slow (> 30 min) = anomaly
  • Copy-paste detection: credentials pasted (vs typed) → account takeover signal

Account signals:
  • Account age, verified contacts, transaction history
  • Days since last login, last payment, last address change
  • Number of failed login attempts (last 24h, 7d)
  • Payment velocity: transactions in last 1h, 24h, 7d by count and amount

Social graph signals:
  • Is buyer connected to known fraud accounts? (BFS on transaction graph)
  • Is merchant connected to other merchants with high chargeback rates?
  • Has this email domain been associated with fraud?

Model architecture:
  Gradient-boosted trees (LightGBM): handles tabular features well, fast inference
  Embedding layers: for high-cardinality features (merchant_id, device_id)
  Ensemble: LightGBM + neural net → weighted average of predictions
  Inference time: < 20ms on GPU-backed serving infrastructure
  Threshold tuning: different thresholds per payment type (card > ACH for auth rate)

Feedback and retraining:
  Labels: chargebacks → fraud label; buyer/merchant confirms fraud
  Nightly Spark job: feature computation on labeled dataset
  Model training: 2-hour job on distributed GPU cluster
  A/B evaluation: new model on 5% traffic → compare AUC, chargeback rate, false decline
  Deployment: if metrics improve → staged rollout (5% → 25% → 100%)`,
    },
    {
      id: "disputeService",
      title: "Dispute & Resolution Service — LLD",
      description: "180-day dispute window, automated evidence gathering, chargeback response",
      api: `POST /v1/customer/disputes  (Buyer opens dispute)
Headers: Authorization: Bearer <buyer_token>
{
  "disputed_transaction_id": "cap_xyz789",
  "reason": "ITEM_NOT_RECEIVED",   // ITEM_NOT_RECEIVED | NOT_AS_DESCRIBED | UNAUTHORIZED
  "description": "Package never arrived, tracking shows delivered but I never got it",
  "desired_outcome": "REFUND"
}
Response:
{
  "dispute_id": "disp_abc123",
  "status": "OPEN",
  "reason": "ITEM_NOT_RECEIVED",
  "disputed_amount": { "value": "150.00", "currency_code": "USD" },
  "created_time": "2026-04-23T12:00:00Z",
  "seller_response_due": "2026-05-03T12:00:00Z",  // seller has 10 days to respond
  "buyer_escalation_eligible": "2026-05-13T12:00:00Z"  // buyer can escalate after 20 days
}

POST /v1/customer/disputes/{disputeId}/provide-evidence  (Seller responds)
{
  "evidences": [
    {
      "evidence_type": "PROOF_OF_DELIVERY",
      "notes": "FedEx tracking shows delivered 2026-04-20",
      "documents": [{ "name": "tracking_proof.pdf", "url": "s3://paypal-disputes/..." }]
    }
  ]
}

POST /v1/customer/disputes/{disputeId}/escalate  (Buyer escalates to PayPal claim)
GET /v1/customer/disputes/{disputeId}
GET /v1/customer/disputes?status=OPEN&limit=20`,
      internals: `Dispute data model (PostgreSQL):
CREATE TABLE disputes (
  dispute_id          VARCHAR(36) PRIMARY KEY,
  transaction_id      VARCHAR(36) NOT NULL,
  buyer_id            VARCHAR(36) NOT NULL,
  seller_id           VARCHAR(36) NOT NULL,
  dispute_reason      VARCHAR(30) NOT NULL,
  status              VARCHAR(20) NOT NULL,   -- OPEN|WAITING_SELLER|WAITING_BUYER|UNDER_REVIEW|RESOLVED
  disputed_amount_cents BIGINT NOT NULL,
  currency_code       CHAR(3) NOT NULL,
  resolution          VARCHAR(20),            -- BUYER_FAVOR|SELLER_FAVOR|PARTIAL_REFUND
  opened_at           TIMESTAMP NOT NULL,
  seller_due_at       TIMESTAMP,
  escalated_at        TIMESTAMP,
  resolved_at         TIMESTAMP
);

CREATE TABLE dispute_evidence (
  evidence_id     VARCHAR(36) PRIMARY KEY,
  dispute_id      VARCHAR(36) NOT NULL REFERENCES disputes,
  submitted_by    VARCHAR(10) NOT NULL,   -- BUYER | SELLER
  evidence_type   VARCHAR(30) NOT NULL,
  notes           TEXT,
  s3_document_key TEXT,
  submitted_at    TIMESTAMP NOT NULL
);

Automated resolution engine:
  On dispute open: run auto-resolve rules (before human review)
  Rule: ITEM_NOT_RECEIVED + tracking shows delivered to correct address
    → auto-close in seller's favor
  Rule: UNAUTHORIZED + buyer's device/IP match transaction
    → flag as possible friendly fraud, still investigate
  Rule: UNAUTHORIZED + account takeover signals (new device, geo-anomaly)
    → auto-refund buyer, investigate compromised account

Chargeback response workflow:
  Bank files chargeback → PayPal notified (ISO 8583 message from acquirer)
  PayPal system:
    1. Look up original transaction → match to dispute if exists
    2. Compile evidence package automatically:
       - Transaction details (timestamp, IP, device fingerprint)
       - Shipping tracking data (API call to FedEx/UPS/USPS)
       - Login logs (did buyer's account access PayPal near transaction?)
       - Delivery confirmation API (carriers provide delivery events)
    3. If seller qualifies for Seller Protection:
       Submit evidence to card network within deadline (10–28 days)
    4. Win/loss notification → update dispute status → credit/debit seller account

Seller protection evaluation:
  eligible = (
    payment_from_verified_account AND
    item_shipped_to_confirmed_address AND
    tracking_uploaded_within_7_days AND
    not in prohibited_categories
  )
  If eligible: PayPal submits chargeback response + absorbs if we lose
  If not eligible: debit merchant's balance for chargeback amount + fee`,
    },
    {
      id: "walletService",
      title: "Wallet & Funding Service — LLD",
      description: "PayPal balance management, funding source selection, and ACH orchestration",
      api: `GET /v1/wallet/balance
Response:
{
  "total_balance": { "value": "245.67", "currency_code": "USD" },
  "available_balance": { "value": "220.67", "currency_code": "USD" },
  "pending_balance": { "value": "25.00", "currency_code": "USD" },
  "currencies": [
    { "currency": "USD", "balance": "245.67", "available": "220.67" },
    { "currency": "EUR", "balance": "50.00", "available": "50.00" }
  ]
}

GET /v1/wallet/funding-sources
Response:
{
  "funding_sources": [
    {
      "id": "fs_balance",
      "type": "PAYPAL_BALANCE",
      "currency": "USD",
      "available_amount": "220.67",
      "is_default": true
    },
    {
      "id": "fs_bank_abc",
      "type": "BANK_ACCOUNT",
      "bank_name": "Chase",
      "last4": "4321",
      "is_verified": true,
      "confirmation_status": "CONFIRMED"
    },
    {
      "id": "fs_card_xyz",
      "type": "DEBIT_CARD",
      "brand": "Visa",
      "last4": "1234",
      "expiry": "12/27"
    }
  ]
}

POST /v1/wallet/transfer  (withdraw to bank)
{
  "funding_source_id": "fs_bank_abc",
  "amount": { "value": "100.00", "currency_code": "USD" },
  "transfer_type": "INSTANT"  // STANDARD (free, 1-3 days) | INSTANT (1.75% fee, < 30 min)
}`,
      internals: `Ledger schema:
CREATE TABLE wallet_accounts (
  account_id    VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL,
  currency      CHAR(3) NOT NULL,
  account_type  VARCHAR(20) DEFAULT 'PERSONAL',
  UNIQUE (user_id, currency, account_type)
);

CREATE TABLE ledger_entries (
  entry_id       VARCHAR(36) PRIMARY KEY,
  transaction_id VARCHAR(36) NOT NULL,
  account_id     VARCHAR(36) NOT NULL REFERENCES wallet_accounts,
  entry_type     CHAR(6) NOT NULL CHECK (entry_type IN ('DEBIT', 'CREDIT')),
  amount_cents   BIGINT NOT NULL CHECK (amount_cents > 0),
  currency       CHAR(3) NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (transaction_id, account_id, entry_type)   -- idempotency
);
CREATE INDEX le_account_time ON ledger_entries (account_id, created_at DESC);

Balance query:
  SELECT
    SUM(CASE WHEN entry_type='CREDIT' THEN amount_cents ELSE -amount_cents END) AS balance_cents
  FROM ledger_entries WHERE account_id = $1 AND currency = $2;
  (Cached in Redis; recomputed from ledger during reconciliation)

ACH initiation (bank withdrawal):
  Standard: NACHA ACH file generated (batch, sent 3x/day to Federal Reserve)
    File format: 94-character fixed-width records per NACHA specification
    Sent: 10am, 1pm, 4pm ET (Federal Reserve processing windows)
  Instant: Visa Direct / Mastercard Send (push to debit card)
    API call to Visa/MC → funds pushed to debit card in < 30 minutes
    Cost to PayPal: $0.25 per transaction; charged 1.75% to user

Bank account verification:
  Option 1 — Micro-deposits (1-3 days):
    PayPal sends 2 small deposits (e.g., $0.13, $0.47) to bank account
    User confirms amounts in app → verified
  Option 2 — Instant verification (Plaid/Finicity):
    User logs into their bank via Plaid → PayPal gets read access to verify account
    Immediate verification, no waiting for micro-deposits
  Without verification: cannot initiate ACH debits (only receive)`,
    },
    {
      id: "checkoutService",
      title: "Checkout Service — LLD",
      description: "Buyer approval flow, One Touch, and Checkout.js integration",
      api: `GET /v2/checkout/orders/{orderId}  (Buyer approval page data)
Response:
{
  "order_id": "order_abc123",
  "merchant": { "name": "Acme Store", "logo_url": "..." },
  "amount": { "value": "150.00", "currency_code": "USD" },
  "items": [{ "name": "Laptop Stand", "quantity": 1, "unit_amount": { "value": "150.00" } }],
  "buyer_funding_options": [
    { "type": "PAYPAL_BALANCE", "available": "220.67", "recommended": true },
    { "type": "BANK_ACCOUNT", "bank_name": "Chase", "last4": "4321" },
    { "type": "PAY_LATER", "monthly_payment": "12.50", "term_months": 12 }
  ],
  "one_touch_eligible": true,   // can skip login?
  "shipping_required": true,
  "shipping_address": { ... }   // pre-filled from PayPal account
}

POST /v2/checkout/orders/{orderId}/approve  (Buyer approves)
{
  "funding_source_id": "fs_balance",
  "shipping_address_id": "addr_abc",
  "one_touch": false
}
Response: { "status": "APPROVED", "redirect_url": "merchant_return_url?token=..." }

POST /v1/identity/one-touch/enable  (Opt into One Touch)
POST /v1/identity/one-touch/disable`,
      internals: `One Touch implementation:
  Enrollment: user opts in → PayPal stores: device_id + user_id → one_touch_token
  Token: signed JWT { user_id, device_id, expires_at: now + 180 days }
  Stored in: browser localStorage + PayPal server (revocable)

  On checkout: Checkout.js detects one_touch_token in localStorage
  If valid + device fingerprint matches → skip login, pre-approve
  Risk check on every One Touch transaction (even if pre-approved)
  If risk_score > 300 → require step-up authentication anyway

  Risk limits:
    Max transaction: $2,000
    Max daily: $3,000
    Excluded: first transaction with merchant, high-risk merchant categories

Checkout.js event flow:
  1. Merchant page loads Checkout.js: <script src="https://www.paypal.com/sdk/js?client-id=...">
  2. PayPal SDK renders Smart Payment Button
  3. Buyer clicks button → SDK opens popup (PayPal login/approval page)
  4. Buyer approves in popup → SDK fires onApprove callback with orderID
  5. Merchant server: POST /v2/checkout/orders/{orderId}/capture
  6. On capture response: merchant fulfills order

Funding source selection logic (buyer side):
  Priority: user's default funding source
  Fallback waterfall: PayPal balance → bank account → debit card → credit card
  Insufficient balance: if PayPal balance < amount → next source in waterfall
  Split funding: if balance = $50, payment = $100 → PayPal asks: use $50 balance + $50 bank?
  Currency mismatch: automatic FX conversion if merchant currency ≠ account currency

Session management:
  Buyer session in checkout: Redis SET session:{token} {user_id, order_id} EX 3600
  Session tied to order: one session per order (prevents session reuse)
  Approval token (passed back to merchant): signed JWT { order_id, approved: true, exp }
  Merchant validates token before capture (prevents forged approvals)`,
    },
    {
      id: "webhookService",
      title: "Webhook Service — LLD",
      description: "Reliable at-least-once webhook delivery with exponential backoff",
      api: `POST /v1/notifications/webhooks  (Merchant registers webhook)
{
  "url": "https://merchant.com/paypal/webhooks",
  "event_types": [
    { "name": "PAYMENT.CAPTURE.COMPLETED" },
    { "name": "PAYMENT.CAPTURE.REVERSED" },
    { "name": "CUSTOMER.DISPUTE.CREATED" },
    { "name": "CUSTOMER.DISPUTE.RESOLVED" }
  ]
}
Response:
{
  "id": "wh_abc123",
  "url": "https://merchant.com/paypal/webhooks",
  "event_types": [...],
  "status": "ENABLED"
}

Outgoing webhook payload (POST to merchant URL):
{
  "id": "evt_xyz789",              // idempotency key for merchant
  "event_version": "1.0",
  "create_time": "2026-04-23T12:00:01Z",
  "resource_type": "capture",
  "event_type": "PAYMENT.CAPTURE.COMPLETED",
  "summary": "Payment completed for $ 150.00 USD",
  "resource": {
    "id": "cap_xyz789",
    "status": "COMPLETED",
    "amount": { "value": "150.00", "currency_code": "USD" },
    "custom_id": "order_12345"
  },
  "links": [
    { "href": "https://api.paypal.com/v1/notifications/webhooks-events/evt_xyz789",
      "rel": "self", "method": "GET" }
  ]
}

GET /v1/notifications/webhooks-events?event_type=PAYMENT.CAPTURE.COMPLETED&limit=20
POST /v1/notifications/webhooks-events/{eventId}/resend  (manual retry)`,
      internals: `Webhook delivery pipeline:

Event source: Kafka topic payment-events → Webhook Consumer Service
  Consumer reads event → look up registered webhooks for merchant + event_type
  For each matching webhook: enqueue delivery job

Delivery job (stored in PostgreSQL):
CREATE TABLE webhook_deliveries (
  delivery_id     VARCHAR(36) PRIMARY KEY,
  webhook_id      VARCHAR(36) NOT NULL,
  event_id        VARCHAR(36) NOT NULL,
  merchant_url    TEXT NOT NULL,
  payload_json    JSONB NOT NULL,
  status          VARCHAR(20) DEFAULT 'PENDING',  -- PENDING|DELIVERED|FAILED|EXHAUSTED
  attempt_count   INT DEFAULT 0,
  next_retry_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMP,
  last_http_status INT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
INDEX: (status, next_retry_at) WHERE status = 'PENDING'  -- polling query

Delivery worker:
  SELECT ... WHERE status='PENDING' AND next_retry_at <= NOW() LIMIT 100 FOR UPDATE SKIP LOCKED
  For each: HTTP POST to merchant URL with 30s timeout
  Response 2xx: UPDATE status=DELIVERED
  Response 4xx/5xx / timeout:
    attempt_count++
    IF attempt_count >= 8: UPDATE status=EXHAUSTED (give up)
    ELSE: next_retry_at = NOW() + backoff_seconds[attempt_count]
    backoff: [5s, 30s, 5min, 30min, 2h, 12h, 24h, 3days]

Webhook signature verification (for merchant to validate authenticity):
  PayPal signs payload: HMAC_SHA256(payload_json, webhook_secret)
  Header: PayPal-Transmission-Sig: <signature>
  Header: PayPal-Cert-Url: https://api.paypal.com/v1/notifications/certs/{cert_id}
  Merchant validates:
    1. Fetch PayPal's public cert (cache it, rarely changes)
    2. Verify signature against cert
    3. Check PayPal-Transmission-Time not too old (replay protection)

At-least-once guarantee:
  Kafka: event never lost (replication factor 3)
  DB: delivery job persisted before attempting delivery
  Retry: exhaustive retry schedule (max 8 attempts over 3 days)
  Manual resend API: merchant can trigger re-delivery if their server was down`,
    },
    {
      id: "merchantService",
      title: "Merchant Service — LLD",
      description: "Merchant onboarding, KYB verification, fee calculation, and payout",
      api: `POST /v1/customer/partner-referrals  (Onboard a new merchant)
{
  "customer_data": {
    "customer_type": "MERCHANT",
    "email_address": "merchant@example.com",
    "business_entity": {
      "business_type": "SOLE_PROPRIETORSHIP",
      "business_name": "Acme Store",
      "business_industry": "RETAIL",
      "business_incorporation_country_code": "US",
      "annual_sales_volume_range": { "minimum_amount": { "value": "10000", "currency_code": "USD" } }
    }
  },
  "requested_capabilities": ["CUSTOM_CARD_PROCESSING"],
  "web_experience_preference": { "return_url": "https://merchant.com/onboard/success" }
}

GET /v1/reporting/balances?currency_code=USD&as_of_time=2026-04-23
Response:
{
  "balances": [
    {
      "currency": "USD",
      "total_balance": { "value": "1245.67" },
      "available_balance": { "value": "1220.67" },
      "withheld_balance": { "value": "25.00" }  // held for dispute reserve
    }
  ]
}

GET /v1/reporting/transactions?start_date=2026-04-01&end_date=2026-04-23&page_size=100`,
      internals: `Merchant risk model:
  Every merchant has: risk_tier (LOW | STANDARD | ELEVATED | HIGH)
  Factors: business category (MCC), chargeback rate, transaction volume, account age, KYB status

  HIGH risk categories: travel, digital goods, subscriptions, event tickets, adult content
  → Higher reserve requirements (15% of monthly volume)
  → Manual review of large transactions
  → Lower chargeback threshold before remediation action

Reserve calculation:
  rolling_chargeback_rate = chargebacks_last_90d / transactions_last_90d
  IF rolling_chargeback_rate > 0.01 (1%):
    reserve_pct = min(0.30, rolling_chargeback_rate × 10)  // up to 30%
    reserve_hold_days = 180  // full chargeback window

  Reserve implementation:
    On each settlement: deduct reserve_pct from merchant's settlement
    Store in: merchant_reserve_account (separate ledger account)
    Release: after hold_days, sweep from reserve → merchant's main account

Merchant fee structure:
  Standard: 2.99% + $0.49 per transaction (US, cards)
  Micropayments: 4.99% + $0.09 (for transactions < $10)
  Volume discounts: negotiated for merchants > $3,000/month
  International: +1.5% for cross-border card transactions

Settlement payout (daily):
  Nightly batch job: aggregate all COMPLETED captures from previous day
  Calculate: gross_amount - fees - chargebacks - reserves = net_settlement
  If net_settlement > 0: credit merchant's bank account via ACH
  If net_settlement < 0 (too many chargebacks): debit merchant's bank account
  Settlement file: NACHA ACH file generated → sent to Federal Reserve morning batch`,
    },
  ],
};

export const PAYPAL_QNA = [
  {
    id: "pq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["PayPal", "Stripe", "Square"],
    question: "Design PayPal's payment system at a high level. What happens when a buyer pays a merchant?",
    answer: `PayPal is a three-party system: buyer, merchant, and PayPal in the middle guaranteeing the transaction.

THE PAYMENT FLOW:
1. Merchant creates order → GET order_id back
2. Buyer approves: logs into PayPal, selects funding source, confirms
3. Merchant captures payment → PayPal funds merchant immediately
4. Background settlement: ACH/card network settles with buyer's bank (T+0 to T+3)

THREE CRITICAL PROPERTIES:
a) ATOMIC: buyer debited ↔ merchant credited — both happen or neither
   Two-phase commit within PayPal's ledger: DEBIT buyer → CREDIT merchant → COMMIT
   If either fails: rollback both → payment fails cleanly

b) IDEMPOTENT: network retries must not double-charge
   Every request: X-Idempotency-Key header
   Server: Redis check → DB UNIQUE constraint → return cached result if duplicate

c) EXACTLY-ONCE: payment captured exactly once even if merchant retries capture
   Order state machine: CREATED → APPROVED → COMPLETED
   Once COMPLETED: subsequent capture requests return the same completed response

KEY INSIGHT:
"PayPal funds the merchant immediately from its own balance, then collects from the buyer's bank via ACH. This is the float model — PayPal bears the risk that ACH returns. The float model is what allows instant payment confirmation even though bank settlement takes days."`,
    followups: [
      "What happens if the buyer's bank ACH debit fails (NSF) after the merchant has already been paid?",
      "How do you handle the case where the buyer's PayPal session expires during the approval step?",
      "How do you prevent a merchant from capturing a payment multiple times?",
    ],
  },
  {
    id: "pq2",
    category: "Payments",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["PayPal", "Stripe", "Adyen"],
    question: "Design an exactly-once payment processing system. How do you prevent a user from being charged twice?",
    answer: `Exactly-once requires idempotency at the API layer AND the storage layer — defense in depth.

THE FAILURE MODES:
  1. Client sends request, server processes, server crashes before responding → client retries → double charge
  2. Server processes request twice due to load balancer retry → double charge
  3. Message queue delivers event twice → double processing → double charge

LAYER 1 — API IDEMPOTENCY (Redis):
  Client generates UUID before every payment request
  Sends: X-Idempotency-Key: <UUID>
  Server receives:
    result = Redis GET idempotency:{key}
    IF result exists → return cached response (do not process)
    IF not exists → SET idempotency:{key} "PROCESSING" EX 300 NX
    (NX = only set if not exists, atomic — prevents race between two servers)

  After processing:
    SET idempotency:{key} {full_response_json} EX 86400
  Second request with same key: returns cached response, no DB touch

LAYER 2 — STORAGE IDEMPOTENCY (DB):
  Payments table: UNIQUE(idempotency_key)
  INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING *
  If conflict: return existing row (idempotent)

  Ledger table: UNIQUE(transaction_id, account_id, entry_type)
  If ledger entry already exists: silently skip → same ledger state

LAYER 3 — OUTBOX PATTERN (prevents event loss):
  DB transaction:
    INSERT payment (status=COMPLETED)
    INSERT outbox (event=PAYMENT_COMPLETED, payload=...)
  Both committed atomically
  CDC connector reads outbox → publishes to Kafka (exactly-once producer)
  Guarantees: payment committed ↔ event published

LAYER 4 — IDEMPOTENT CONSUMERS:
  Webhook handler: check event_id before processing
    IF event_id seen before → skip (return 200 to PayPal to stop retries)
    IF new → process → store event_id`,
    followups: [
      "What's the difference between idempotency and exactly-once? Can you have one without the other?",
      "How long should you retain idempotency keys? What happens if a client retries after the key expires?",
      "How do you handle idempotency across microservices (payment service, ledger service, notification service)?",
    ],
  },
  {
    id: "pq3",
    category: "Fraud",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["PayPal", "Stripe", "Visa"],
    question: "Design PayPal's fraud detection system. How do you protect both buyers and merchants from different types of fraud?",
    answer: `PayPal has two-sided fraud: buyer fraud against merchants, and merchant fraud against buyers.

BUYER FRAUD (most common):
  Stolen account: credentials compromised → fraudster drains balance/makes purchases
  Stolen card: card used to fund PayPal, then spend
  Friendly fraud: buyer receives goods → disputes with bank claiming unauthorized

MERCHANT FRAUD:
  Non-delivery: charge buyer, never ship
  Triangle fraud: use stolen cards to fulfill legitimate orders (buyer gets goods, card owner gets chargeback)
  High-risk categories: subscriptions → cancel after trial, dispute all charges

ML FRAUD MODEL (400+ features):
  Device intelligence: IP reputation, VPN/TOR detection, device fingerprint age, geo-vs-shipping mismatch
  Behavioral: typing cadence, checkout duration, copy-paste detection (account takeover signal)
  Account signals: age, velocity, dispute history, linked accounts
  Social graph: transaction network — is this account connected to known fraud nodes?

DECISION TIERS:
  score < 300: auto-approve (98%+ of legitimate transactions)
  300–700: step-up authentication (SMS OTP)
  > 700: decline + manual review
  Threshold tuned per payment type (card fraud higher threshold than balance transfers)

CHARGEBACK FRAUD DETECTION:
  Buyer claims not authorized → check: did buyer's device/IP match transaction?
  If match → friendly fraud suspect → dispute rejected (or limited to partial)
  Pattern: buyer wins > 3 disputes in 90 days → flag for enhanced review

MERCHANT PROTECTION:
  Seller protection: if merchant follows rules (tracking, confirmed address) → PayPal absorbs chargeback
  High chargeback rate (> 1%): warning → hold funds → terminate if no improvement`,
    followups: [
      "How do you balance fraud prevention (false positives blocking legitimate payments) vs revenue (false negatives letting fraud through)?",
      "How do you detect new fraud patterns that your model hasn't been trained on?",
      "How do you handle a merchant who suddenly starts processing 10× their normal volume?",
    ],
  },
  {
    id: "pq4",
    category: "Dispute Resolution",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["PayPal", "Stripe", "Shopify"],
    question: "Design PayPal's buyer protection and dispute resolution system.",
    answer: `Dispute resolution is PayPal's trust mechanism — the reason buyers choose PayPal over direct card payment.

DISPUTE TYPES AND SLA:
  "Item Not Received": buyer claims package never arrived → 45-day investigation window
  "Not As Described": buyer received wrong/damaged item → return required
  "Unauthorized": buyer didn't make the purchase → fraud investigation

THREE-PHASE LIFECYCLE:
  Phase 1 — Negotiation (10–20 days):
    Buyer files dispute → seller notified → both can message through PayPal
    Many resolved here (seller refunds voluntarily to avoid escalation)

  Phase 2 — Claim (buyer escalates):
    PayPal becomes mediator
    Seller must provide evidence: tracking, delivery confirmation, photos
    Buyer must provide evidence: photos, communication showing issue

  Phase 3 — Resolution (PayPal decides):
    Review evidence → rule for buyer (refund) or seller (case closed)
    Resolution in buyer's favor: merchant's PayPal balance debited
    If insufficient balance: merchant's bank account debited via ACH

AUTOMATION (60% of cases auto-resolved):
  INR + tracking shows delivered to correct address → auto-close (seller wins)
  UNAUTHORIZED + device/IP matches transaction → flag as friendly fraud
  Repeat buyer filing too many disputes → pattern detection → enhanced scrutiny

EVIDENCE COMPILATION (automatic):
  PayPal auto-fetches: shipping tracking, delivery confirmation, login logs
  Reduces manual evidence burden for sellers with good records
  Merchant with Seller Protection + tracking → auto-submit to card network for chargebacks`,
    followups: [
      "How do you handle a dispute for a digital goods purchase where there's no shipping proof?",
      "A seller has no funds in their PayPal account — how do you enforce a dispute decision against them?",
      "How do you prevent a buyer from abusing the dispute system to get free goods repeatedly?",
    ],
  },
  {
    id: "pq5",
    category: "Checkout",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["PayPal", "Stripe", "Shopify"],
    question: "Design PayPal's checkout experience. How do you maximize conversion rate while maintaining security?",
    answer: `Every friction point in checkout reduces conversion. PayPal's answer: One Touch, Smart Buttons, and contextual flow.

CONVERSION KILLERS (and PayPal's fixes):
  Full redirect: buyer leaves merchant site → anxiety → abandonment
  Fix: Checkout.js popup — buyer stays on merchant site, PayPal opens in overlay

  Login required: buyer doesn't remember PayPal password
  Fix: One Touch — trusted device + persistent token → skip login for trusted devices

  Long form: card details, billing address, shipping
  Fix: PayPal pre-fills from stored account data → buyer just confirms

  Unknown final price: shipping/tax shown late
  Fix: Show full breakdown before buyer confirms → no surprise at confirmation

ONE TOUCH IMPLEMENTATION:
  Enrollment: user opts in on desktop/mobile
  Stores: device fingerprint + signed JWT (180-day expiry) in localStorage
  On checkout: SDK detects token → skip login → show "One Touch" button
  Risk check still runs: every One Touch transaction scored
  If risk_score high: step-up auth regardless of One Touch status
  Limits: $2,000/transaction, $3,000/day, excluded merchant categories

LATENCY BUDGET (< 3 seconds end-to-end):
  Button render (Checkout.js): 200ms
  User auth (cached session): 500ms
  Risk score: 300ms (synchronous, blocks approval)
  Fund movement (ledger write): 500ms
  Merchant callback: 200ms
  Total target: 1.7s p50, < 3s p99

SMART PAYMENT BUTTONS:
  Dynamically render based on buyer's account: PayPal, Venmo, Pay Later, Card
  Venmo button: only shown if buyer has Venmo in their PayPal account
  A/B tested continuously: button order, colors, labels → optimize conversion`,
    followups: [
      "How do you handle a One Touch payment on a device that the user hasn't logged into PayPal on?",
      "How do you ensure the Checkout.js script doesn't slow down the merchant's page load?",
      "How do you handle checkout for a guest who doesn't have a PayPal account?",
    ],
  },
  {
    id: "pq6",
    category: "Webhooks",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["PayPal", "Stripe", "Twilio"],
    question: "Design a reliable webhook delivery system. How do you guarantee merchants receive payment notifications?",
    answer: `Webhooks are at-least-once delivery — merchants must handle duplicates, PayPal must handle failures.

DELIVERY GUARANTEE REQUIREMENTS:
  Never lose an event (must eventually deliver)
  Tolerate merchant downtime (retry until delivered or give up)
  Order not guaranteed (merchants process events idempotently)
  Latency: < 30 seconds for first attempt on successful events

ARCHITECTURE:
  Payment completes → Kafka event → Webhook Service (Kafka consumer)
  Webhook Service: look up merchant's registered webhooks + event filter
  Match found: write delivery job to PostgreSQL (persisted before HTTP attempt)
  Delivery worker: poll pending jobs → HTTP POST to merchant URL → update status

RETRY SCHEDULE (exponential backoff):
  Attempt 1: immediate
  Attempt 2: 5 seconds
  Attempt 3: 30 seconds
  Attempt 4: 5 minutes
  Attempt 5: 30 minutes
  Attempt 6: 2 hours
  Attempt 7: 12 hours
  Attempt 8: 24 hours
  After 8 attempts (3+ days): mark EXHAUSTED, merchant can manually resend

IDEMPOTENT MERCHANT HANDLING:
  Merchant receives same event twice (retry after their 5xx):
  Merchant checks: IF event_id seen before → return 200 (already processed)
  PayPal provides: event_id in every payload (use as idempotency key)

SIGNATURE VERIFICATION (merchant validates authenticity):
  Header: PayPal-Transmission-Sig
  HMAC_SHA256(payload + timestamp + cert_id, webhook_secret)
  Merchant fetches PayPal's public cert → verifies signature
  Prevents: fake webhooks from attackers who know merchant URL`,
    followups: [
      "A merchant's server is down for 4 days. What happens to events generated during that time?",
      "How do you handle a webhook URL that returns 200 but the merchant processed nothing (silent failure)?",
      "How do you scale webhook delivery to 50 million events per day?",
    ],
  },
  {
    id: "pq7",
    category: "Scale",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["PayPal", "Visa", "Mastercard"],
    question: "PayPal processes $1.5 trillion per year. How do you design the system to handle peak Black Friday load?",
    answer: `Black Friday is PayPal's Super Bowl — 10–20× normal transaction volume in a compressed window.

SCALE MATH:
  Normal: ~250 transactions/second average
  Black Friday peak: 2,500–5,000 transactions/second (10–20× spike in 4-hour window)
  Preparation must start weeks before

CAPACITY PLANNING (6 weeks before):
  Load test: replay last year's Black Friday traffic pattern against staging
  Identify bottleneck: usually the database (Oracle RAC) or external card networks
  Scale stateless services: spin up 5× normal instances (Kubernetes auto-scaling pre-warmed)
  Database: add read replicas; Oracle RAC configured for peak IOPS
  Card network quota: negotiate higher TPS limits with Visa/Mastercard weeks in advance

TRAFFIC SHAPING (prevent one merchant taking down system):
  Rate limit per merchant: max 500 TPS per merchant (prevents single merchant overload)
  Queue-based smoothing: burst requests queued → processed at controlled rate
  Merchant notification: "Your checkout is experiencing high volume, brief delays expected"

LOAD SHEDDING (graceful degradation under extreme load):
  Tier 1 (never shed): payment processing, fraud checks
  Tier 2 (shed if necessary): real-time analytics, recommendation engine, non-critical notifications
  Tier 3 (shed first): reporting queries, historical data access, batch jobs
  Circuit breakers: auto-shed tier 2/3 when system health drops below threshold

STATELESS SCALING (easy wins):
  API Gateway, Checkout Service, Webhook Service: fully stateless → scale to 50× instantly
  Fraud service: GPU fleet auto-scaled → more scoring capacity pre-provisioned
  Notification service: queue-based → notifications may be delayed, but not lost

FINANCIAL DATA (cannot shed):
  Oracle RAC: pre-warmed, standby nodes promoted to active
  Redis Cluster: pre-scaled, additional shards added week before
  Kafka: extra partitions added, consumer groups pre-scaled`,
    followups: [
      "The card network (Visa) is having an outage on Black Friday. What's your fallback?",
      "How do you communicate to merchants that their payment success rates are temporarily reduced?",
      "After Black Friday, how do you scale back down without disrupting ongoing transactions?",
    ],
  },
  {
    id: "pq8",
    category: "Compliance",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["PayPal", "Stripe", "Wise"],
    question: "PayPal operates in 200+ countries. How do you design the system to handle cross-border compliance, data residency, and sanctions screening?",
    answer: `Global compliance is architecture, not just policy. The system must enforce rules automatically.

DATA RESIDENCY:
  India (RBI 2018): all transaction data must be stored and processed in India
  EU (GDPR): EU personal data cannot leave EU without adequacy agreement
  China: strict local data requirements
  Solution:
    Every user/transaction tagged with residency region at creation
    Database routing: Indian transactions → India-region DB only
    No cross-region replication of restricted data
    Analytics: aggregate statistics can cross borders, not raw personal data

SANCTIONS SCREENING (every transaction):
  Sources: OFAC SDN list, EU sanctions, UN sanctions, UK HMT, Australian DFAT
  Updated: OFAC updates daily → automated refresh pipeline → hot-load into screening service
  Flow: on every payment, screen both sender and receiver
    Name match → risk score (fuzzy match handles different spellings)
    High confidence match → block transaction + freeze account + file SAR
    Low confidence match → human review queue (24h SLA)
  False positive management: John Smith is a common name → additional attributes needed (DOB, address, ID number)

AML TRANSACTION MONITORING:
  Not real-time (too slow) — streaming batch on Kafka
  Flink job: 30-day sliding window per user, detect:
    • Structuring: multiple transactions just below $10,000 (reporting threshold)
    • Round-trip: money out → back in via different path → layering indicator
    • Velocity spike: 10× normal transaction volume in one day → alert

PCI-DSS:
  Never store raw card PANs → tokenize via card network vault
  Store: token + last4 + expiry (for display only)
  Annual QSA audit + quarterly penetration testing
  Card data processors in isolated network segment (CDE — Cardholder Data Environment)

LICENSING COMPLIANCE:
  Each country has different allowed activities, fee caps, KYC requirements
  Config-driven: per-country ruleset stored in configuration service
  Fee caps: e.g., India limits card surcharges → fee calculation reads country config
  KYC levels: India requires Aadhaar-based eKYC for payments > ₹10,000`,
    followups: [
      "How do you handle a sanctions list update that matches 1,000 existing PayPal accounts — all must be frozen simultaneously?",
      "A customer moves from the US to the EU. How do you migrate their data to comply with GDPR residency rules?",
      "How do you design the system to add a new country (with unique regulatory requirements) without a full rewrite?",
    ],
  },
];
