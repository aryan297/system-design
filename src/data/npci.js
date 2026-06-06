export const NPCI_HLD = {
  title: "NPCI / UPI — High Level Design",
  subtitle: "How India's ₹20 lakh crore/month real-time payment switch handles 13 billion transactions",

  overview: `NPCI (National Payments Corporation of India) is the umbrella body for retail payment systems in India. Its flagship product, UPI (Unified Payments Interface), processes 13+ billion transactions per month across 300+ banks — making it the world's largest real-time payment network.

UPI is not a wallet. No money is stored at NPCI or in the app. Every UPI transaction is a direct, real-time debit from one bank account and credit to another. NPCI is the interoperability switch in the middle — it routes the payment, but never holds the funds.

Three design insights that define UPI's architecture:
1. NPCI as a dumb pipe — NPCI routes messages between banks but holds no money. Banks own the accounts; apps own the UX; NPCI owns the plumbing.
2. Virtual Payment Address (VPA) — "aryan@oksbi" decouples identity from the bank account. You never need to share an IFSC code or account number.
3. Device-bound, PIN-secured authentication — the UPI PIN is encrypted on-device with the bank's public key. It never travels in plaintext. NPCI never sees your PIN.`,

  diagram: `
┌──────────────────────────────────────────────────────────────────────────┐
│                           UPI ECOSYSTEM                                  │
│                                                                          │
│  ┌─────────────────┐                        ┌────────────────────────┐  │
│  │   PAYER SIDE    │                        │     PAYEE SIDE         │  │
│  │                 │                        │                        │  │
│  │  User on GPay   │                        │  Merchant QR / VPA     │  │
│  │  PhonePe/Paytm  │                        │  (aryan@ybl)           │  │
│  │  Bank App       │                        │                        │  │
│  └────────┬────────┘                        └──────────┬─────────────┘  │
│           │ HTTPS + TLS                                │                 │
│           ▼                                            ▼                 │
│  ┌─────────────────┐                        ┌────────────────────────┐  │
│  │  PAYER PSP      │                        │  PAYEE PSP             │  │
│  │  (Google, PhonePe│                       │  (Razorpay, PayU,      │  │
│  │   Axis Bank app)│                        │   HDFC merchant app)   │  │
│  └────────┬────────┘                        └──────────┬─────────────┘  │
│           │ ISO 8583 / UPI XML over TLS                │                 │
│           │                                            │                 │
│           └────────────────┬───────────────────────────┘                │
│                            ▼                                             │
│           ┌────────────────────────────────┐                            │
│           │       NPCI UPI SWITCH          │                            │
│           │  ─────────────────────────     │                            │
│           │  VPA Directory (resolve VPA)   │                            │
│           │  Transaction Router            │                            │
│           │  Fraud Engine (real-time)      │                            │
│           │  Idempotency Store             │                            │
│           │  Settlement Instruction Gen    │                            │
│           └──────────┬─────────────────────┘                            │
│                      │                                                   │
│          ┌───────────┴───────────┐                                       │
│          ▼                       ▼                                       │
│  ┌───────────────┐      ┌────────────────┐                              │
│  │  PAYER BANK   │      │  PAYEE BANK    │                              │
│  │  (SBI/HDFC/   │      │  (Kotak/ICICI/ │                              │
│  │   Axis CBS)   │      │   Yes Bank CBS)│                              │
│  │               │      │                │                              │
│  │ Debit ₹500    │      │  Credit ₹500   │                              │
│  └───────┬───────┘      └───────┬────────┘                              │
│          │                      │                                        │
│          └──────────┬───────────┘                                        │
│                     ▼                                                    │
│          ┌──────────────────────┐                                        │
│          │   RBI Settlement     │                                        │
│          │  (RTGS/NEFT/DNS)     │                                        │
│          │  Net settlement T+1  │                                        │
│          └──────────────────────┘                                        │
└──────────────────────────────────────────────────────────────────────────┘`,

  metrics: [
    { label: "Monthly transactions (2024)", value: "13+ billion" },
    { label: "Monthly value", value: "₹20+ lakh crore (~$240 billion)" },
    { label: "Active UPI users", value: "460+ million" },
    { label: "Banks on UPI", value: "300+" },
    { label: "Transaction success rate", value: ">99.5% (peak hours)" },
    { label: "End-to-end latency", value: "<3 seconds (P99)" },
    { label: "NPCI uptime SLA", value: "99.99% (< 52 min/year downtime)" },
    { label: "Transaction limit", value: "₹1 lakh/transaction (₹2 lakh for select categories)" },
    { label: "Peak TPS", value: "~5,000 TPS (IPL finals, festival days)" },
    { label: "Settlement", value: "Real-time debit/credit; net settlement via DNS at T+0/T+1" },
  ],

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "The Big Picture — UPI Payment Flow",
      sections: [
        {
          title: "End-to-End Payment: ₹500 from Aryan to a Merchant",
          content: `UPI has two types of transactions: Pay (payer initiates) and Collect (payee requests). The majority of consumer payments are Pay. Here is the exact flow:

STEP 1 — VPA resolution:
  User opens GPay, scans QR code / enters "merchant@ybl"
  GPay app → GPay PSP server → NPCI VPA Directory
  NPCI resolves "merchant@ybl" → {bank: "Yes Bank", ifsc: "YESB0000001", masked_account: "XXXX1234"}
  PSP displays merchant name and masked account to user for confirmation.

STEP 2 — PIN entry (on-device encryption):
  User enters ₹500 and their 4/6-digit UPI PIN.
  The PIN is NEVER sent as plaintext. The GPay app:
    a. Fetches the payer bank's (SBI) RSA public key from PSP server.
    b. Encrypts: RSA-OAEP(PIN + timestamp + device fingerprint, SBI_public_key)
    c. The encrypted block is sent to the PSP server. Only SBI can decrypt it.

STEP 3 — PSP → NPCI (Pay Request):
  GPay PSP server sends a UPI Pay Request (ISO 8583 / proprietary XML) to NPCI Switch:
  {
    txnId: "GPay-2026-XXXX",       // globally unique, idempotency key
    payer: { vpa: "aryan@oksbi", bank: "SBI" },
    payee: { vpa: "merchant@ybl", bank: "Yes Bank" },
    amount: 50000,                 // in paise (₹500 = 50000 paise)
    encryptedPin: "base64...",
    deviceFingerprint: "...",
    timestamp: "2026-06-02T10:00:00Z"
  }

STEP 4 — NPCI Switch routing:
  NPCI validates the request: duplicate txnId check, fraud score, daily limit check.
  Routes a DEBIT request to SBI (payer bank) via IMPS rails.
  SBI decrypts the PIN, validates it, checks balance ≥ ₹500, debits the account.
  SBI responds: {status: DEBIT_SUCCESS, rrn: "SBI-RRN-9876"}

STEP 5 — Credit to payee:
  NPCI routes a CREDIT request to Yes Bank (payee bank).
  Yes Bank credits the merchant account.
  Yes Bank responds: {status: CREDIT_SUCCESS}

STEP 6 — Response propagation:
  NPCI sends success response to GPay PSP: {status: SUCCESS, txnId: "...", rrn: "..."}
  GPay PSP notifies payer app: "₹500 paid to Merchant ✓"
  Payee PSP notifies merchant app: "₹500 received ✓"
  End-to-end: ~1.5–3 seconds.

STEP 7 — Settlement (deferred, not real-time):
  Actual money movement happens via DNS (Deferred Net Settlement).
  NPCI calculates net positions of all banks at end-of-day.
  Net settlement via RBI's RTGS. SBI owes Yes Bank ₹500 net of all UPI flows.`,
        },
        {
          title: "Why NPCI Doesn't Hold Money — The Interoperability Model",
          content: `UPI's killer insight: decouple the payment app (UX layer), the payment network (NPCI — routing layer), and the bank (money layer). Any app can use the network. Any bank can join. Money never leaves the banking system.

Compare to alternatives:
  Paytm Wallet (pre-UPI model):
    • User tops up wallet from bank → money sits in Paytm's account.
    • Paytm-to-Paytm: instant (internal transfer within Paytm).
    • Wallet-to-bank: slow (manual withdrawal process).
    • Problem: not interoperable. Can't pay a GPay user from Paytm wallet.

  UPI model:
    • No money stored at app or NPCI.
    • Every payment is a direct bank-to-bank transfer.
    • GPay user CAN pay PhonePe user CAN pay a bank-app user — all via NPCI switch.
    • Interoperability is a design principle, not an afterthought.

Why this matters at scale:
  India has 460M UPI users split across 200+ PSP apps and 300+ bank apps.
  Without interoperability: 200 × 200 = 40,000 bilateral integrations needed.
  With NPCI as hub: 200 + 200 = 400 integrations (each participant → NPCI only).
  Hub-and-spoke model is the only viable architecture for national payment scale.

PSP vs Bank on UPI:
  PSP (Payment Service Provider): Google (GPay), PhonePe, Paytm — they build the app/UX.
    They connect to NPCI as a "third-party application provider" (TPAP).
    They don't hold money; they just route payment instructions.
  Bank: SBI, HDFC, Axis — they hold the actual accounts and execute debits/credits.
    Some banks are also PSPs (HDFC's PayZapp, Axis's mobile app).
    Every UPI transaction involves at minimum 2 banks (payer + payee).`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "NPCI Switch Internals",
      sections: [
        {
          title: "VPA Directory — The UPI Phone Book",
          content: `A VPA (Virtual Payment Address) like "aryan@oksbi" is the alias for a bank account. NPCI's VPA Directory maps every VPA to its underlying bank account details.

VPA format: <user-handle>@<bank-handle>
  @oksbi   → State Bank of India
  @ybl     → Yes Bank (used by PhonePe)
  @okhdfcbank → HDFC Bank (used by GPay)
  @paytm   → Paytm Payments Bank
  @axl     → Axis Bank

VPA registration flow:
  1. User downloads GPay, links their SBI account.
  2. GPay PSP creates VPA "aryan@oksbi" on behalf of user.
  3. PSP sends VPA registration to NPCI:
     REGISTER { vpa: "aryan@oksbi", bank: "SBI", accountNumber: "XXXX", ifsc: "SBIN0001234" }
  4. NPCI VPA Directory stores: vpa → {pspId, bankId, encryptedAccountDetails}
  5. Account details encrypted — only the bank can see them. NPCI stores encrypted blobs.

Resolution (during payment):
  Payer's PSP sends: RESOLVE { vpa: "merchant@ybl" }
  NPCI returns: { bankId: "YES_BANK", name: "Merchant Store", maskedAccount: "XXXX5678" }
  Full account number NEVER returned to PSP — only the bank needs it for credit.

VPA collision handling:
  "aryan@oksbi" is unique at the NPCI level. If taken, NPCI suggests alternatives.
  VPAs are case-insensitive: "Aryan@oksbi" == "aryan@oksbi".
  VPAs can be deleted and re-registered (e.g. user changes bank).

Distributed VPA directory:
  NPCI stores VPA mappings in a distributed database (partitioned by @handle suffix).
  All reads are strongly consistent (incorrect resolution = payment to wrong person).
  Write-heavy only during initial registration, not during payments.
  Cached at PSP level: if GPay recently resolved "merchant@ybl", it caches for 24 hours.
  Cache invalidation: when a VPA is deregistered, NPCI pushes an invalidation event to all PSPs.`,
        },
        {
          title: "Transaction Routing & Idempotency",
          content: `NPCI Switch processes ~5,000 transactions per second at peak. Every transaction must be routed to the correct pair of banks and be idempotent (no double debits).

Routing logic:
  Each transaction has a payer bank and a payee bank (resolved from VPAs).
  NPCI maintains persistent TCP connections (connection pools) to every bank's IMPS endpoint.
  Routing table: bankId → connection pool to that bank's IMPS gateway.
  Connection health monitored every 30 seconds. Unhealthy bank → graceful error to PSP.

Message format:
  UPI uses a proprietary XML schema layered over ISO 8583 (financial messaging standard).
  Key fields: TxnId (globally unique), Amount, PayerVPA, PayeeVPA, EncryptedPIN, MsgType.
  Transport: Mutual TLS (mTLS) — both NPCI and the PSP/bank authenticate each other with certificates.
  Certificate rotation: every 12 months, out-of-band coordination with all participants.

Idempotency (preventing duplicate payments):
  Every transaction has a globally unique TxnId generated by the initiating PSP:
    Format: {PSP_CODE}-{YYYYMMDD}-{UUID}
    Example: "GPAY-20260602-550e8400-e29b-41d4-a716"
  NPCI stores TxnId in a distributed idempotency store (Redis cluster).
  On receiving a transaction:
    1. Check Redis: has this TxnId been seen before?
    2. If YES and status=SUCCESS → return cached success response. No re-processing.
    3. If YES and status=IN_PROGRESS → wait 500ms and re-check (concurrent request).
    4. If NO → acquire distributed lock on TxnId, process, store result, release lock.

  TxnId TTL in Redis: 90 days (UPI dispute window is 30 days; 90 days provides buffer).

Timeout handling:
  Network hiccup between NPCI and a bank? NPCI must not leave the transaction ambiguous.
  Timeout on DEBIT request: NPCI sends a REVERSAL to the payer bank. Payer NOT debited.
  Timeout on CREDIT request (after debit succeeded): NPCI retries the credit up to 3×.
  If all credit retries fail: transaction marked as "credit pending" — reconciliation team resolves within 4 hours.
  This is why "money debited but not credited" complaints exist — and why NPCI has a dispute resolution layer.`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Authentication & Fraud",
      sections: [
        {
          title: "UPI PIN Security — Device Binding + Encrypted PIN",
          content: `UPI PIN security has two factors: something you have (the registered SIM/device) and something you know (the PIN). Neither factor alone is sufficient.

Factor 1 — Device binding (SIM-based):
  When you register UPI on a new phone:
  1. App sends an SMS from the SIM to a short code. This proves you physically possess the SIM.
  2. NPCI / the bank verifies the SMS. Device-SIM combination is registered.
  3. Device fingerprint stored at bank: IMEI + SIM ICCID + app-generated device ID.
  A cloned SIM from a different device would fail Step 2 (different IMEI).

Factor 2 — UPI PIN (bank-encrypted):
  PIN is 4 or 6 digits, set by the user directly with their bank (not with GPay/NPCI).
  On every payment, PIN entry:
  1. App fetches the payer bank's RSA public key (2048-bit, rotated annually).
  2. PIN encrypted: RSA-OAEP(PIN_bytes, bank_pub_key, label=txnId+timestamp)
     Including txnId prevents replay attacks (same encrypted PIN ≠ same payment).
  3. Encrypted block sent to PSP → NPCI → bank.
  4. ONLY the payer bank can decrypt with its private key.
  5. Bank decrypts, hashes PIN, compares to stored hash. Never stored in plaintext.

Why NPCI cannot see the PIN:
  NPCI receives the encrypted blob but doesn't have the bank's private key.
  A compromised NPCI cannot extract PINs. This is a critical security design principle.
  Even a rogue NPCI employee cannot intercept PINs — they'd need the bank's HSM key.

UPI Lite (recent feature, for small payments):
  For transactions < ₹500, UPI Lite skips PIN entry entirely.
  User pre-loads a wallet on-device (up to ₹2,000) from their bank account.
  Payments deducted from on-device wallet; periodically reconciled with bank.
  Lower latency (no bank round-trip), but lower limit.`,
        },
        {
          title: "Real-Time Fraud Detection at NPCI",
          content: `13 billion transactions/month = ~5,000 TPS at peak. Fraud detection must be sub-100ms (transaction must complete in <3 seconds total).

NPCI's fraud detection runs as a synchronous step in the transaction flow:
  PSP → NPCI Switch → Fraud Engine (< 50ms budget) → Route to banks

Fraud signals evaluated per transaction:
  • Velocity: this payer made 10 transactions in the last 60 seconds. Flag.
  • Amount anomaly: payer's average transaction is ₹300. This is ₹50,000. Flag.
  • New VPA: payee VPA registered 2 hours ago. Higher risk score.
  • Device mismatch: payment from a device that isn't the registered device for this VPA.
  • Geographic anomaly: payer in Mumbai, transaction to a VPA flagged for Jharkhand scam patterns.
  • Merchant category: certain MCC codes (gaming, crypto) have lower limits.
  • Network graph: payee VPA has received 200 payments from 200 different payers today. Possible mule account.

Risk scoring:
  Each signal contributes a weighted score. Score thresholds:
  0–30:  Allow
  31–70: Allow with additional logging + flag for review
  71–90: Step-up authentication (ask user to confirm via SMS OTP)
  91+:   Block, return fraud code to PSP

Machine learning at NPCI:
  NPCI runs batch ML models (trained on historical fraud labels) updated daily.
  Real-time scoring uses gradient boosted trees (low latency, interpretable).
  Deep learning models run offline and feed score adjustments into the real-time model.
  Federated signals: RBI's central fraud registry feeds known fraudulent VPAs/accounts.

Bank-level fraud (beyond NPCI):
  Each bank also runs its own fraud checks independently.
  A transaction passing NPCI fraud can still be rejected by the payer bank.
  This is defence-in-depth — two independent fraud layers.`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Settlement & Scale",
      sections: [
        {
          title: "Settlement — How Money Actually Moves Between Banks",
          content: `A common misconception: UPI transfers money instantly. What actually happens instantly is the debit/credit accounting within each bank. The actual movement of funds between banks is settled via Deferred Net Settlement (DNS).

Real-time layer (what UPI does):
  SBI debits Aryan's account ₹500. This is an accounting entry in SBI's core banking.
  Yes Bank credits merchant's account ₹500. Another accounting entry in Yes Bank.
  Both happen in real-time (<3s). But no money has actually moved between SBI and Yes Bank yet.

Net settlement (deferred):
  At end-of-day (or multiple times per day), NPCI calculates net positions:
  SBI sent ₹1,000 crore to Yes Bank today via UPI.
  Yes Bank sent ₹800 crore to SBI today via UPI.
  Net: SBI owes Yes Bank ₹200 crore.
  This single ₹200 crore settlement via RTGS/RBI replaces 50 million bilateral transfers.

Why deferred net settlement is safe:
  Banks are required to maintain a settlement guarantee fund with NPCI.
  If SBI goes bankrupt before settling, the guarantee fund covers outstanding obligations.
  RBI oversees the entire settlement process — systemic risk is managed at the central bank level.

Settlement timeline:
  Intra-day net settlement: 3 times per day (8 AM, 1 PM, 6 PM).
  End-of-day settlement: final DNS settlement via RTGS at 11 PM.
  Cut-off: transactions after 11 PM settle next day (T+1 for late-night transactions).

UPI for Merchant Payments (MDR = 0):
  Merchants pay 0% MDR (Merchant Discount Rate) on UPI — mandated by RBI/NPCI.
  Compare: credit cards charge 1–2% MDR, debit cards 0.4%.
  This is why every kirana store in India accepts UPI — zero cost to accept.
  NPCI's business model: transaction fee charged to PSPs (not merchants), regulatory mandate.`,
        },
        {
          title: "Scale Architecture — 13 Billion Transactions/Month",
          content: `NPCI's architecture must handle India-scale: 13B transactions/month, with spikes during festivals (Diwali, IPL finals), salary days (1st of month), and GST payment deadlines.

Horizontal scaling:
  NPCI UPI Switch is stateless at the routing layer. Any switch node can handle any transaction.
  State (VPA directory, idempotency store, transaction status) lives in separate clustered databases.
  Load balancers distribute PSP connections across switch nodes (active-active, N+2 redundancy).

Peak day patterns:
  Normal day: ~400M transactions (4,600 TPS average, ~8,000 TPS peak).
  Festival day (Diwali): 2–3× spike. ~1,200M transactions.
  IPL final day: payment spike at match start and at 7:30 PM (food orders, bets).
  1st of month: salary day. 40% higher than average (rent payments, EMIs via UPI mandate).

Pre-scaling for known events:
  NPCI ops team manually pre-scales switch capacity 24 hours before known high-volume events.
  Same principle as Hotstar IPL: event is predictable, auto-scaling too slow for traffic cliff.
  Load testing: NPCI runs stress tests at 2× peak capacity every quarter.

Multi-datacenter active-active:
  NPCI runs two primary datacenters (Mumbai and Chennai) in active-active mode.
  Each handles ~50% of normal traffic. On failure, surviving DC takes 100%.
  RTO (Recovery Time Objective): < 30 seconds (automatic failover).
  RPO (Recovery Point Objective): 0 — synchronous replication means no data loss.

Bank connectivity resilience:
  Each bank connects to NPCI via two independent leased lines (primary + backup) from different ISPs.
  If SBI's primary link fails, NPCI switches to backup automatically.
  If ALL SBI connectivity fails: transactions to/from SBI VPAs return "Bank not available" within 10 seconds.
  PSP shows user: "SBI is temporarily unavailable. Try again in a few minutes."`,
        },
      ],
    },
  ],
};

export const NPCI_LLD = {
  title: "NPCI / UPI — Low Level Design",
  subtitle: "API contracts, schemas, and algorithms behind India's payment infrastructure",

  components: [
    {
      id: "upi-flow",
      title: "UPI Transaction API",
      description: "Pay request, collect request, and status check — the core transaction lifecycle",
      api: `// UPI Pay Request (PSP → NPCI)
// Transported over mTLS; XML or JSON depending on PSP integration version

POST https://upi.npci.org.in/api/v2/transactions/pay
mTLS: PSP certificate (issued by NPCI CA)
Content-Type: application/json

{
  "txnId":       "GPAY-20260602-550e8400-e29b-41d4",  // PSP-generated UUID, globally unique
  "msgId":       "MSG-20260602-100001",               // message-level ID (can retry same txn)
  "txnType":     "PAY",                               // PAY | COLLECT | REFUND
  "payer": {
    "vpa":       "aryan@oksbi",
    "name":      "Aryan Aman",
    "bankId":    "SBI",
    "encCredentials": {
      "type":    "PIN",
      "data":    "base64-encrypted-PIN-block"         // RSA-OAEP encrypted, only SBI can read
    }
  },
  "payee": {
    "vpa":       "merchant@ybl",
    "name":      "Merchant Store",                    // resolved from VPA directory
    "bankId":    "YESB"
  },
  "amount":      { "value": 50000, "currency": "INR" }, // in paise
  "remarks":     "Payment for order #ORD-999",
  "deviceInfo": {
    "appId":     "com.google.android.apps.nbu.paisa.user",
    "deviceId":  "sha256-of-IMEI+ICCID",             // device fingerprint
    "mobile":    "sha256-of-mobile-number"           // hashed, for fraud signals
  },
  "timestamp":   "2026-06-02T10:00:00.000Z",
  "refUrl":      "https://gpay.app/pay?txn=550e8400"
}

// NPCI → PSP Response (synchronous, within 3s)
{
  "txnId":       "GPAY-20260602-550e8400-e29b-41d4",
  "status":      "SUCCESS",              // SUCCESS | FAILURE | PENDING
  "responseCode":"00",                   // 00=success, see ISO 8583 response codes
  "rrn":         "620210001234",         // RRN: bank reference number for reconciliation
  "approvalNo":  "NPCI-20260602-00123",
  "timestamp":   "2026-06-02T10:00:02.145Z",
  "payer": { "amount": 50000, "status": "DEBITED" },
  "payee": { "amount": 50000, "status": "CREDITED" }
}

// NPCI Response Codes (subset):
// 00 → Transaction Approved
// 51 → Insufficient Funds
// 55 → Incorrect PIN
// 65 → Exceeds Daily Limit
// 91 → Bank Unavailable
// U30 → Fraud Suspected (NPCI fraud engine block)
// YF → Transaction In Progress (idempotent retry — same TxnId, still processing)

// Status Check (PSP polls if no response within 3s)
GET /api/v2/transactions/{txnId}/status
Response: { "txnId": "...", "status": "SUCCESS|FAILURE|PENDING", "rrn": "..." }`,

      internals: `Transaction lifecycle state machine:

  States: INITIATED → FRAUD_CHECK → DEBIT_SENT → DEBITED → CREDIT_SENT → COMPLETED
                                                         ↓ (timeout)
                                               CREDIT_PENDING → (retry 3×) → RECONCILE

  func processPayment(req PayRequest) PayResponse {
    // 1. Idempotency check
    if cached := idempotencyStore.Get(req.TxnId); cached != nil {
      return cached  // replay existing result, no re-processing
    }

    // Acquire distributed lock to prevent concurrent processing of same TxnId
    lock := redislock.Acquire(req.TxnId, ttl=30s)
    defer lock.Release()

    // 2. Fraud check (synchronous, < 50ms budget)
    riskScore := fraudEngine.Score(req)
    if riskScore > 90 { return failureResponse("U30", "Fraud Suspected") }

    // 3. Route debit request to payer bank
    debitResp := bankConnPool.Send(req.Payer.BankId, DebitRequest{
      accountVpa: req.Payer.VPA,
      encPin:     req.Payer.EncCredentials.Data,
      amount:     req.Amount,
      txnId:      req.TxnId,
    }, timeout=2000ms)

    if debitResp.Error != nil || debitResp.Status != "DEBITED" {
      idempotencyStore.Set(req.TxnId, failureResponse(debitResp.Code))
      return failureResponse(debitResp.Code)
    }

    // 4. Route credit to payee bank (with retry on failure)
    var creditResp BankResponse
    for attempt := 0; attempt < 3; attempt++ {
      creditResp = bankConnPool.Send(req.Payee.BankId, CreditRequest{
        accountVpa: req.Payee.VPA,
        amount:     req.Amount,
        txnId:      req.TxnId,
        rrn:        debitResp.RRN,
      }, timeout=1500ms)
      if creditResp.Status == "CREDITED" { break }
      time.Sleep(exponentialBackoff(attempt))
    }

    // 5. Handle credit failure after retries
    if creditResp.Status != "CREDITED" {
      // Mark for reconciliation — do NOT reverse debit yet (bank may have credited)
      reconciliationQueue.Enqueue(req.TxnId, debitResp.RRN, creditResp.Error)
      result := pendingResponse(req.TxnId, "CREDIT_PENDING")
      idempotencyStore.Set(req.TxnId, result)
      return result  // PSP notified; NPCI ops resolves within 4 hours
    }

    result := successResponse(req.TxnId, debitResp.RRN, creditResp.RRN)
    idempotencyStore.Set(req.TxnId, result, ttl=90*24*time.Hour)
    return result
  }`,
    },
    {
      id: "vpa-directory",
      title: "VPA Directory Service",
      description: "VPA registration, resolution, and distributed cache invalidation",
      api: `// VPA Registration (PSP → NPCI, during account linking)
POST /api/v2/vpa/register
{
  "vpa":        "aryan@oksbi",
  "pspId":      "GPAY",
  "bankId":     "SBI",
  "accountRef": "AES-256-GCM-encrypted-{ifsc+accountNumber}", // encrypted with NPCI-SBI shared key
  "mobileHash": "sha256(+919876543210)",
  "aadhaarRef": "sha256(Aadhaar-number)",  // optional; for Aadhaar-linked VPAs
  "timestamp":  "2026-06-02T09:00:00Z",
  "pspSignature": "PSP RSA signature over request body"
}
Response: { "status": "REGISTERED", "vpa": "aryan@oksbi" }

// VPA Resolution (PSP → NPCI, before showing confirmation screen)
GET /api/v2/vpa/resolve?vpa=merchant@ybl
Response:
{
  "vpa":           "merchant@ybl",
  "name":          "Merchant Store Pvt Ltd",
  "bankId":        "YESB",
  "maskedAccount": "XXXX5678",
  "type":          "MERCHANT",   // PERSONAL | MERCHANT
  "verified":      true          // Aadhaar/GST-verified merchant
}

// VPA Deregistration (PSP → NPCI, when user unlinks account)
DELETE /api/v2/vpa/aryan@oksbi
{ "pspId": "GPAY", "reason": "ACCOUNT_UNLINKED", "pspSignature": "..." }
Response: { "status": "DEREGISTERED" }
// Triggers cache invalidation event to all PSPs via webhook

// VPA Directory — Spanner-like schema
CREATE TABLE vpa_registry (
  vpa            STRING NOT NULL,                 -- "aryan@oksbi"
  psp_id         STRING NOT NULL,                 -- "GPAY"
  bank_id        STRING NOT NULL,                 -- "SBI"
  account_ref    BYTES,                           -- AES-256-GCM encrypted account details
  display_name   STRING,
  type           STRING,                          -- PERSONAL | MERCHANT
  status         STRING,                          -- ACTIVE | DEREGISTERED | FROZEN
  mobile_hash    STRING,
  created_at     TIMESTAMP,
  updated_at     TIMESTAMP,
) PRIMARY KEY (vpa);

CREATE INDEX vpa_by_mobile ON vpa_registry (mobile_hash, status);
CREATE INDEX vpa_by_bank   ON vpa_registry (bank_id, status);`,

      internals: `VPA resolution with PSP-side cache:

  PSP-side caching (in GPay's servers):
    On first resolution of a VPA:
      cache.set("vpa:merchant@ybl", {bankId, maskedAccount, name}, TTL=24h)
    On cache hit: return cached result (no NPCI call — saves ~50ms)
    On cache miss: call NPCI, populate cache

  Cache invalidation (push model):
    When NPCI processes a VPA deregistration:
      1. Marks vpa_registry row status=DEREGISTERED
      2. Publishes to Kafka topic "vpa.invalidations": {vpa: "aryan@oksbi"}
      3. NPCI webhook service fans out HTTP POST to all registered PSP webhook URLs:
         POST https://gpay.google.com/npci/webhooks/vpa-invalidation
         Body: { "vpa": "aryan@oksbi", "action": "DEREGISTERED" }
      4. GPay clears "vpa:aryan@oksbi" from its cache
      5. Next resolution attempt hits NPCI → 404 "VPA not found"

  VPA uniqueness enforcement:
    NPCI VPA registry is the authoritative source. Single writer per VPA.
    Registration uses a distributed lock (Redis): lock key = "vpa_reg:{vpa}"
    If two PSPs try to register the same VPA simultaneously:
      First acquires lock → registers → releases lock
      Second acquires lock → checks registry → finds existing → returns CONFLICT
    Conflict response: PSP suggests alternatives (aryan1@oksbi, aryan.aman@oksbi, etc.)

  Handle validation:
    Valid VPA format: [a-zA-Z0-9._-]{3,50}@[a-zA-Z]{2,20}
    Reserved handles: @upi (NPCI system VPAs), @rbi, @npci
    Profanity filter on user handle portion (NPCI-enforced word blocklist)`,
    },
    {
      id: "fraud-engine",
      title: "Real-Time Fraud Engine",
      description: "Velocity checks, ML risk scoring, and rule-based blocks under 50ms",
      api: `// Fraud Engine — internal service called synchronously in transaction flow

// Input (assembled by NPCI Switch before calling fraud engine)
FraudCheckRequest {
  txnId:        string
  payerVpa:     string
  payerBankId:  string
  payeeVpa:     string
  payeeBankId:  string
  amount:       int64     // paise
  deviceId:     string    // hashed device fingerprint
  mobileHash:   string
  ipAddress:    string    // payer's IP (passed by PSP)
  txnType:      "PAY" | "COLLECT"
  timestamp:    time.Time
}

// Output
FraudScore {
  score:        int       // 0–100
  action:       "ALLOW" | "STEP_UP" | "BLOCK"
  signals:      []string  // ["HIGH_VELOCITY", "NEW_PAYEE_VPA", ...]
  blockCode:    string    // populated if action=BLOCK ("U30", "U69", etc.)
}

// RBI Fraud Registry lookup (synchronous, < 5ms — local cache)
GET /api/v2/fraud/registry/check
  ?vpa=suspect@ybl&mobile=hash&account=hash
Response: {
  "listed": true,
  "severity": "HIGH",         // HIGH | MEDIUM | WATCH
  "reason": "MULE_ACCOUNT",
  "reportedBy": "SBI",
  "reportedAt": "2026-05-15T10:00:00Z"
}

// Fraud signals stored in Redis time-series
// Key pattern: fraud:velocity:{type}:{entity}:{window}
// Examples:
//   fraud:velocity:payer:aryan@oksbi:1m   → count of txns in last 1 min
//   fraud:velocity:payee:suspect@ybl:1h   → incoming txns in last 1 hour
//   fraud:velocity:device:sha256abc:15m   → txns from this device in 15 min`,

      internals: `Fraud scoring pipeline (< 50ms total budget):

  func scoreFraud(req FraudCheckRequest) FraudScore {
    signals := []string{}
    score := 0

    // 1. Hard blocks — check RBI fraud registry (local Redis cache, 15-min TTL)
    if isListed := fraudRegistry.Check(req.PayeeVpa, req.MobileHash); isListed {
      return FraudScore{Score: 100, Action: "BLOCK", BlockCode: "U69"}
    }

    // 2. Velocity checks (Redis pipeline — all executed in one round-trip)
    velocities := redis.Pipeline(
      INCR_EXPIRE("fraud:velocity:payer:"+req.PayerVpa+":1m",  60),
      INCR_EXPIRE("fraud:velocity:payer:"+req.PayerVpa+":1h",  3600),
      INCR_EXPIRE("fraud:velocity:payee:"+req.PayeeVpa+":1h",  3600),
      INCR_EXPIRE("fraud:velocity:device:"+req.DeviceId+":15m", 900),
    )

    if velocities[0] > 5  { signals = append(signals, "HIGH_PAYER_VELOCITY_1M"); score += 30 }
    if velocities[1] > 20 { signals = append(signals, "HIGH_PAYER_VELOCITY_1H"); score += 15 }
    if velocities[2] > 200{ signals = append(signals, "HIGH_PAYEE_INBOUND");     score += 25 }
    if velocities[3] > 10 { signals = append(signals, "HIGH_DEVICE_VELOCITY");   score += 20 }

    // 3. Amount anomaly (compare to payer's 30-day avg)
    avgTxn := payerProfile.Get30DayAvg(req.PayerVpa)  // cached in Redis, updated daily
    if req.Amount > avgTxn*10 && req.Amount > 1000000 {  // > 10× avg AND > ₹10,000
      signals = append(signals, "AMOUNT_ANOMALY")
      score += 20
    }

    // 4. New VPA flag
    vpaAge := vpaRegistry.GetAge(req.PayeeVpa)
    if vpaAge < 24*time.Hour { signals = append(signals, "NEW_PAYEE_VPA"); score += 10 }

    // 5. ML model score (pre-computed features, gradient boosted tree inference, < 5ms)
    mlScore := mlModel.Predict(MLFeatures{
      PayerVpa: req.PayerVpa, Amount: req.Amount,
      HourOfDay: req.Timestamp.Hour(), DayOfWeek: int(req.Timestamp.Weekday()),
      VpaAge: vpaAge, Velocity1m: velocities[0],
    })
    score = int(float64(score)*0.6 + float64(mlScore)*0.4)  // weighted blend

    // 6. Determine action
    action := "ALLOW"
    if score >= 71 && score <= 90 { action = "STEP_UP" }
    if score > 90                  { action = "BLOCK" }

    return FraudScore{Score: score, Action: action, Signals: signals}
  }`,
    },
    {
      id: "settlement",
      title: "Settlement Engine",
      description: "Deferred Net Settlement calculation, DNS file generation, RTGS instruction",
      api: `// Settlement positions — computed at end-of-settlement-cycle (3× per day + EOD)

// Per-transaction settlement record (written after each successful transaction)
CREATE TABLE settlement_records (
  txn_id         STRING NOT NULL,
  cycle_id       STRING NOT NULL,   -- "2026-06-02-CYCLE-3" (EOD cycle)
  payer_bank_id  STRING NOT NULL,
  payee_bank_id  STRING NOT NULL,
  amount         INT64  NOT NULL,   -- paise
  rrn            STRING,
  status         STRING,            -- SETTLED | PENDING | FAILED
  created_at     TIMESTAMP,
) PRIMARY KEY (txn_id);

CREATE INDEX settlement_by_cycle_bank ON settlement_records (cycle_id, payer_bank_id, payee_bank_id);

// DNS (Deferred Net Settlement) File — sent to RBI at cycle end
{
  "cycleId":    "2026-06-02-EOD",
  "generatedAt": "2026-06-02T23:00:00Z",
  "netPositions": [
    {
      "bankId":    "SBI",
      "netAmount": -120000000000,  // paise (SBI is net payer: owes ₹1,200 crore)
      "action":    "DEBIT"
    },
    {
      "bankId":    "HDFC",
      "netAmount": +85000000000,   // HDFC is net receiver: gets ₹850 crore
      "action":    "CREDIT"
    },
    {
      "bankId":    "YESB",
      "netAmount": +35000000000,
      "action":    "CREDIT"
    }
    // ... all 300+ banks
  ],
  "totalDebits":  "₹1,200 crore",
  "totalCredits": "₹1,200 crore",  // must balance to zero
  "signature":    "NPCI RSA signature over file hash"
}

// RBI RTGS instruction (one per net-debtor bank)
POST https://rtgs.rbi.org.in/api/settlement
{
  "instructingBank": "NPCI",
  "debitBank":       "SBI",
  "creditBank":      "RBI_SETTLEMENT_ACCOUNT",  // RBI redistributes to net creditors
  "amount":          120000000000,
  "reference":       "UPI-DNS-2026-06-02-EOD",
  "cycleId":         "2026-06-02-EOD"
}`,

      internals: `DNS calculation algorithm:

  func calculateNetSettlement(cycleId string) []NetPosition {
    // Sum all payer deductions and payee credits per bank pair
    // SELECT payer_bank_id, payee_bank_id, SUM(amount)
    // FROM settlement_records WHERE cycle_id = ? GROUP BY payer_bank_id, payee_bank_id
    flows := db.Query(
      "SELECT payer_bank_id, payee_bank_id, SUM(amount) as gross " +
      "FROM settlement_records WHERE cycle_id = ? AND status = 'SETTLED' " +
      "GROUP BY payer_bank_id, payee_bank_id", cycleId)

    // Build adjacency matrix: flows[payerBank][payeeBank] = gross amount
    netByBank := map[string]int64{}
    for _, flow := range flows {
      netByBank[flow.PayerBank] -= flow.Gross  // payer bank owes this much
      netByBank[flow.PayeeBank] += flow.Gross  // payee bank receives this much
    }

    // Validation: sum of all net positions must = 0
    total := int64(0)
    for _, net := range netByBank { total += net }
    if total != 0 { panic("DNS imbalance detected: " + total) }

    // Build settlement instructions
    positions := []NetPosition{}
    for bankId, net := range netByBank {
      positions = append(positions, NetPosition{
        BankId:    bankId,
        NetAmount: net,                  // negative = owe NPCI, positive = receive
        Action:    ternary(net < 0, "DEBIT", "CREDIT"),
      })
    }
    return positions
  }

  Settlement guarantee fund check (pre-settlement):
    Each bank maintains a collateral deposit with NPCI (T-bills/G-secs).
    Before sending RTGS instruction for bank X:
      collateral := guaranteeFund.GetBalance(bankId)
      if abs(netPosition) > collateral * 1.2 {
        // Bank's exposure exceeds collateral — escalate to RBI immediately
        alert.Page("SETTLEMENT_RISK", bankId, netPosition, collateral)
      }

  Dispute resolution (within settlement window):
    Disputed transactions (payer claims not paid) can be reversed within 30 days.
    Reversal creates offsetting records in the next settlement cycle.
    Net effect: the dispute shows up as a credit to the payer bank in the next DNS.`,
    },
    {
      id: "mandate",
      title: "UPI Mandate (AutoPay)",
      description: "Recurring payment mandates — for EMIs, SIPs, subscriptions",
      api: `// UPI Mandate — allows pre-authorized recurring debits (Netflix, EMIs, SIPs)

// Create mandate (one-time setup by payee/merchant)
POST /api/v2/mandates/create
{
  "mandateId":    "NETF-MAND-20260602-XYZ",
  "txnType":      "CREATE_MANDATE",
  "payer": {
    "vpa":        "aryan@oksbi",
    "name":       "Aryan Aman"
  },
  "payee": {
    "vpa":        "netflix@axl",
    "name":       "Netflix India"
  },
  "mandate": {
    "type":       "RECURRING",       // ONE_TIME | RECURRING | PRESENTMENT
    "pattern":    "MONTHLY",         // DAILY | WEEKLY | FORTNIGHTLY | MONTHLY | YEARLY
    "amount": {
      "type":     "FIXED",           // FIXED | MAX (up to ₹X)
      "value":    64900              // paise (₹649/month)
    },
    "validFrom":  "2026-06-05",
    "validUntil": "2027-06-05",
    "remarks":    "Netflix Standard Plan"
  }
}

// Payer approves mandate in their UPI app (same flow as a payment — PIN required)
// Payer bank creates standing instruction in their CBS

// Execute mandate (on billing date — triggered by Netflix/payee PSP)
POST /api/v2/mandates/execute
{
  "mandateId":  "NETF-MAND-20260602-XYZ",
  "txnId":      "NETF-EXEC-20260705-ABC",
  "amount":     64900,
  "remarks":    "Netflix July 2026 subscription",
  "executionDate": "2026-07-05"
}
// Note: NO PIN required for execution — pre-authorized during mandate creation
// NPCI sends notification to payer 24 hours before debit (UPI 2.0 mandate rules)

// Revoke mandate (user cancels)
POST /api/v2/mandates/{mandateId}/revoke
{ "payer": { "vpa": "aryan@oksbi" }, "reason": "CANCELLED_BY_USER" }

// Mandate table (NPCI mandate registry)
CREATE TABLE mandates (
  mandate_id      STRING NOT NULL,
  payer_vpa       STRING NOT NULL,
  payee_vpa       STRING NOT NULL,
  payer_bank_id   STRING NOT NULL,
  pattern         STRING NOT NULL,
  amount_type     STRING NOT NULL,
  amount_value    INT64,
  valid_from      DATE,
  valid_until     DATE,
  status          STRING NOT NULL,  -- CREATED | ACTIVE | PAUSED | REVOKED | EXPIRED
  last_executed   TIMESTAMP,
  execution_count INT NOT NULL DEFAULT 0,
) PRIMARY KEY (mandate_id);`,

      internals: `Mandate execution scheduler (runs daily at 6 AM):

  func executeDueMandates() {
    today := time.Now().Format("2006-01-02")

    // Find all mandates due today
    dueMandates := db.Query(\`
      SELECT * FROM mandates
      WHERE status = 'ACTIVE'
        AND valid_from <= ?
        AND valid_until >= ?
        AND (last_executed IS NULL OR DATE(last_executed) < ?)
        AND is_due_today(pattern, valid_from, ?)
    \`, today, today, today, today)

    // Execute in parallel batches of 1000
    for batch := range chunk(dueMandates, 1000) {
      wg.Add(1)
      go func(mandates []Mandate) {
        defer wg.Done()
        for _, m := range mandates {
          // Generate unique execution TxnId
          txnId := fmt.Sprintf("MANDATE-EXEC-%s-%s", today, m.MandateId)

          resp := processPayment(PayRequest{
            TxnId:   txnId,
            Payer:   {VPA: m.PayerVpa, BankId: m.PayerBankId},
            Payee:   {VPA: m.PayeeVpa},
            Amount:  m.AmountValue,
            IsMandateExecution: true,   // skip PIN requirement
          })

          db.Update("mandates SET last_executed=?, execution_count=execution_count+1 WHERE mandate_id=?",
            time.Now(), m.MandateId)

          if resp.Status != "SUCCESS" {
            // Notify payer and payee of failure
            notificationService.Send(m.PayerVpa, "Mandate execution failed: "+resp.StatusCode)
          }
        }
      }(batch)
    }
    wg.Wait()
  }

  Pre-debit notification (T-1 rule):
    For mandates > ₹15,000: NPCI sends notification 24 hours before debit
    Payer can block the debit by responding within the window
    This is a regulatory requirement (RBI circular) added in UPI 2.0`,
    },
  ],
};

export const NPCI_QNA = [
  {
    id: "npci-q1",
    category: "Architecture",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Razorpay", "PhonePe", "Paytm"],
    question: "Design the end-to-end UPI payment flow. How does money move from Aryan's SBI account to a Yes Bank merchant?",
    answer: `UPI is a hub-and-spoke model. NPCI is the hub. Banks and PSP apps are spokes. No money is held by NPCI or the app.

Six-step flow:
1. VPA resolution: GPay asks NPCI to resolve "merchant@ybl" → gets Yes Bank + masked account. User sees "Merchant Store, XXXX5678" before confirming.

2. PIN encryption: User enters PIN. GPay app fetches SBI's RSA public key, encrypts: RSA-OAEP(PIN + txnId + timestamp, SBI_pub_key). Only SBI can decrypt. NPCI never sees the PIN.

3. Pay request: GPay PSP sends a JSON/XML transaction request to NPCI over mTLS with a globally unique txnId.

4. Debit: NPCI routes the debit request to SBI. SBI decrypts PIN, validates, checks balance, debits account. SBI returns an RRN (bank reference number).

5. Credit: NPCI routes a credit request to Yes Bank with the RRN. Yes Bank credits the merchant. Yes Bank ACKs.

6. Response: NPCI returns SUCCESS to GPay PSP. Both payer and payee apps show confirmation.

Total time: 1.5–3 seconds. Actual bank-to-bank money movement happens via DNS (Deferred Net Settlement) at end of day — NPCI calculates net positions, one RTGS instruction per bank replaces millions of bilateral transfers.`,
    followups: ["What happens if the debit succeeds but the credit fails?", "How would you design the retry logic for the credit step?"],
  },
  {
    id: "npci-q2",
    category: "Architecture",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Razorpay", "Amazon", "Google"],
    question: "How does NPCI ensure idempotency in UPI — preventing the same payment from being processed twice?",
    answer: `Idempotency is critical in payments: a network retry must not cause a double debit.

Every UPI transaction has a globally unique TxnId generated by the initiating PSP: {PSP_CODE}-{YYYYMMDD}-{UUID}. This is the idempotency key.

NPCI implementation:
1. On receiving a Pay request, NPCI checks a distributed idempotency store (Redis cluster): "Has this TxnId been seen?"
2. If YES, status=SUCCESS → return the cached success response immediately. No re-processing.
3. If YES, status=IN_PROGRESS → the original request is still being processed. Return "YF" response code (Transaction In Progress). PSP polls /status endpoint.
4. If NO → acquire a distributed Redis lock on the TxnId (TTL=30s), process the transaction, store the result, release the lock.

TxnId TTL in Redis: 90 days (UPI dispute window is 30 days).

Why not database uniqueness constraint?
Redis lock + idempotency store is faster than a DB unique index write + lookup on every transaction at 5,000 TPS. The Redis check adds < 1ms vs a DB write that might add 5–10ms. At UPI scale, every millisecond matters.

PSP-side idempotency: PSPs also maintain their own idempotency to handle NPCI returning ambiguous responses. If PSP doesn't get a clear success/failure within 5 seconds, it polls NPCI's status endpoint using the same TxnId — never re-submits with a new TxnId.`,
    followups: ["What happens to the Redis lock if the NPCI node crashes mid-processing?", "How do you handle the case where NPCI returns a timeout but the debit actually succeeded at the bank?"],
  },
  {
    id: "npci-q3",
    category: "Security & DRM",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["PhonePe", "NPCI", "Juspay"],
    question: "How is the UPI PIN secured such that even NPCI cannot see it?",
    answer: `UPI PIN security uses asymmetric encryption so that only the payer's bank can ever decrypt the PIN.

Two-factor authentication:
1. Something you have: the registered SIM. During onboarding, the app sends an SMS from the SIM to verify physical possession. The device IMEI + SIM ICCID combination is registered with the bank.

2. Something you know: the 4/6-digit UPI PIN.

PIN encryption flow on each transaction:
1. GPay app fetches SBI's RSA public key (2048-bit, rotated annually via NPCI key management).
2. Constructs a PIN block: PIN bytes + transaction ID + timestamp (anti-replay binding).
3. Encrypts using RSA-OAEP: ciphertext = RSA-OAEP(PIN_block, SBI_public_key).
4. The ciphertext travels: GPay app → GPay PSP → NPCI → SBI.
5. Only SBI's HSM (Hardware Security Module), which holds the private key, can decrypt.
6. SBI decrypts, hashes the PIN, compares to the stored hash in CBS.

Why NPCI cannot see the PIN:
NPCI holds no private keys for any bank's PIN encryption. It forwards the encrypted blob opaquely. A compromised NPCI switch sees a ciphertext it cannot decrypt. This is defence-in-depth by design.

Binding txnId to the PIN encryption prevents replay attacks: the ciphertext encrypted for txn-A cannot be reused for txn-B because txnId is baked into the plaintext before encryption. Even if an attacker captures the encrypted blob, replaying it for a different transaction fails decryption at the bank.`,
    followups: ["How does the bank rotate its RSA key pair without breaking existing transactions?", "What is an HSM and why must the bank's private key be stored in one?"],
  },
  {
    id: "npci-q4",
    category: "Scale & Performance",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Razorpay", "PayU", "Cashfree"],
    question: "How does NPCI handle peak load — 13 billion transactions a month with spikes on Diwali and salary day?",
    answer: `NPCI uses a stateless switch architecture with active-active datacenters and pre-scaling for known events.

Stateless switch layer:
Each NPCI switch node handles any transaction for any bank. Routing state (VPA directory, idempotency store, fraud signals) lives in separate clustered databases (Redis + distributed SQL). Switch nodes behind load balancers. Adding 10 more switch nodes doubles throughput.

Multi-datacenter active-active:
Two primary DCs (Mumbai and Chennai) each handle ~50% of normal traffic. Synchronous replication for idempotency store and transaction status — no data loss on DC failure. Automatic failover in < 30 seconds: surviving DC takes 100% of traffic.

Bank connectivity:
Every bank maintains 2 independent leased lines to NPCI from different ISPs. NPCI maintains a persistent connection pool to each bank's IMPS gateway. Connection pool size is pre-scaled before peak events.

Pre-scaling playbook (known events — salary day, Diwali, IPL final):
• T-24 hours: double switch node count, expand Redis cluster, pre-warm VPA cache.
• T-2 hours: validate all bank connections, run synthetic transaction tests.
• T-0: all systems at 2× capacity. On-call SRE team active.
Auto-scaling: useful for gradual ramp-down after events. Cannot react fast enough to a cliff-edge spike (Diwali midnight 12:00 AM — millions of transactions in seconds).

Rate limiting per PSP:
Each PSP has a provisioned TPS limit. If GPay suddenly sends 3× their allocated TPS (misconfiguration or attack), NPCI returns HTTP 429 to throttle them. This prevents one PSP's traffic surge from affecting other PSPs' users.`,
    followups: ["How would you design NPCI's load shedding strategy if capacity is genuinely insufficient during a black swan event?", "What are the latency SLAs NPCI provides to PSPs, and how do you enforce them contractually?"],
  },
  {
    id: "npci-q5",
    category: "Fault Tolerance",
    difficulty: "Medium",
    round: "System Design Round",
    asked_at: ["Razorpay", "Juspay", "Amazon"],
    question: "What happens in UPI when the debit succeeds but the credit to the merchant fails?",
    answer: `This is the most dangerous state in payments: money leaves the payer but doesn't reach the payee. It's called a "partial settlement" or "credit pending" state.

NPCI's handling:
1. After a successful debit (SBI ACKed), NPCI sends a credit request to Yes Bank.
2. If Yes Bank times out or returns an error, NPCI retries up to 3 times with exponential backoff.
3. If all 3 credit attempts fail: NPCI marks the transaction as CREDIT_PENDING and enqueues it in the reconciliation queue.
4. NPCI returns "CREDIT_PENDING" to the PSP (not a clean SUCCESS or FAILURE).
5. The payer's money is debited. The merchant has not received it.

Resolution within 4 hours:
NPCI's reconciliation team investigates: Is Yes Bank actually down? Was the credit already applied but the ACK was lost? They contact Yes Bank's operations team directly.

Why NOT auto-reverse the debit immediately?
If Yes Bank actually processed the credit but the ACK was lost in transit, an auto-reversal would result in the payer getting their money back AND the merchant keeping the credit — a double payment to the merchant. So NPCI investigates before reversing.

PSP communication:
PSP shows user: "Transaction under review. Amount will be refunded within 4 hours if not settled."
If no resolution in 4 hours: NPCI issues a debit reversal to SBI, and both parties are notified.

This exact scenario is why UPI provides a dispute resolution portal — users can raise disputes and NPCI has an SLA to resolve them.`,
    followups: ["How would you design the reconciliation system for 100,000 credit-pending transactions per day?", "What data do you need to preserve during the debit to enable a safe reversal later?"],
  },
  {
    id: "npci-q6",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Round",
    asked_at: ["Razorpay", "Stripe", "Google"],
    question: "How does Deferred Net Settlement work in UPI? Why not settle every transaction in real-time via RTGS?",
    answer: `Real-time Gross Settlement (RTGS) settles each transaction individually. For UPI's 13 billion transactions/month, this would mean 13 billion RTGS instructions — far exceeding RBI's RTGS capacity and creating massive systemic overhead.

Deferred Net Settlement (DNS) approach:
• UPI debits and credits happen in real-time inside each bank's core banking system — accounting entries are immediate.
• Actual fund movement between banks is deferred and netted.
• NPCI accumulates all transactions across all bank pairs within a settlement cycle.
• At cycle end, NPCI computes each bank's net position: if SBI sent ₹1,200 crore to all other banks and received ₹1,000 crore, SBI's net position is -₹200 crore.
• One RTGS instruction of ₹200 crore from SBI replaces millions of bilateral transfers.
• Currently: 3 intra-day cycles + 1 end-of-day cycle.

Why it's safe despite not being real-time:
• Banks maintain a settlement guarantee fund (collateral) with NPCI — typically T-bills and G-secs.
• If SBI fails before settling, the guarantee fund covers outstanding obligations.
• RBI oversees the entire process and can step in as lender of last resort.
• The accounting entries are already in both banks' CBS — only the inter-bank cash movement is deferred.

Why not RTGS for everything?
• RTGS costs more per transaction and has capacity limits.
• RTGS minimum transaction amount is ₹2 lakh — below UPI's typical transaction sizes.
• Netting reduces total settlement value by 80–90% compared to gross settlement (most SBI-to-HDFC flows are offset by HDFC-to-SBI flows on the same day).`,
    followups: ["How would you design the DNS file generation to ensure it always balances to zero?", "What happens to the settlement guarantee fund if multiple large banks have simultaneous credit events?"],
  },
  {
    id: "npci-q7",
    category: "Scale & Performance",
    difficulty: "Medium",
    round: "Deep Dive",
    asked_at: ["PhonePe", "Paytm", "Razorpay"],
    question: "How does the VPA (Virtual Payment Address) directory scale to 460 million users across 300 banks?",
    answer: `The VPA directory must handle: registrations (one-time, write-heavy during app installs), resolutions (every payment, read-heavy), and invalidations (account closure, number porting).

Scale design:

Storage: partitioned by VPA handle suffix (@oksbi, @ybl, @paytm). Each bank's VPAs live on the same shard (natural partitioning). Data is account details encrypted with NPCI-bank shared key, so even NPCI admins can't read account numbers in plaintext.

Read path optimization (resolution is on the critical payment path):
• PSP-side cache: GPay caches recently resolved VPAs for 24 hours. Repeat payments to the same merchant never hit NPCI.
• NPCI-side cache: Redis in front of the VPA DB, TTL = 1 hour. First resolution hits DB; subsequent ones hit Redis.
• Cache hit rate: > 95% for consumer-facing payments (users pay the same merchants repeatedly).

Write path (registration):
• Write throughput is low (registration is a one-time event per VPA).
• Distributed lock per VPA during registration prevents duplicates.
• Synchronous replication between NPCI Mumbai and Chennai datacenters before ACK.

Invalidation (push model):
• VPA deregistration publishes to Kafka.
• Webhook service fans out to all 200+ registered PSPs.
• PSPs clear from their local cache.
• Stale cache window: max 24 hours (PSP cache TTL) — acceptable risk for deregistered VPAs.`,
    followups: ["What's the risk of a 24-hour stale cache for deregistered VPAs? How would you reduce that window?", "How would you handle number portability where a user's @oksbi VPA needs to move to a different bank?"],
  },
  {
    id: "npci-q8",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Round",
    asked_at: ["Razorpay", "Juspay", "PayU"],
    question: "What is UPI AutoPay (mandate) and how does it differ from a regular UPI payment architecturally?",
    answer: `UPI AutoPay (mandate) allows pre-authorized recurring debits — used for Netflix subscriptions, SIP investments, EMIs. The key difference: mandate execution requires no PIN entry from the payer at execution time.

How mandates work:
1. Setup (one-time, PIN required): payer creates a mandate via their UPI app with full authentication (PIN). The bank creates a standing instruction in its CBS. NPCI registers the mandate with mandateId, amount, frequency, validity.

2. Execution (recurring, no PIN): On the billing date, the payee PSP (Netflix) triggers execution with just the mandateId + txnId. NPCI routes to the payer bank using the pre-authorized standing instruction. No UPI PIN needed — it was pre-authorized at mandate creation.

NPCI's 24-hour pre-debit notification rule (RBI mandate for transactions > ₹15,000):
• NPCI sends a notification to the payer 24 hours before the debit.
• Payer can block the debit by responding "CANCEL" within that window.
• This gives the payer control over autopay without needing to pre-approve every execution.

Architectural difference from regular UPI:
• Regular payment: payer app initiates → real-time PIN → debit → credit.
• Mandate execution: payee PSP initiates → NPCI validates mandate (no PIN) → debit via standing instruction → credit.
• The mandate registry (NPCI) is the authority for whether a debit is authorized.
• Risk control: mandate amounts can be FIXED or MAX (up to a limit), giving banks clear authorization boundaries.`,
    followups: ["How would you design the mandate execution scheduler to handle 50 million SIP executions on the 1st of every month?", "What happens to active mandates when a user changes their bank or VPA?"],
  },
  {
    id: "npci-q9",
    category: "Security & DRM",
    difficulty: "Easy",
    round: "Screening",
    asked_at: ["Razorpay", "Cashfree", "Paytm"],
    question: "What is a VPA and why is it better than sharing a bank account number and IFSC code?",
    answer: `A VPA (Virtual Payment Address) is a human-readable alias for a bank account. Format: username@bankhandle (e.g. "aryan@oksbi"). It maps to an underlying bank account without exposing it.

Why VPAs are better than account + IFSC:

1. Privacy: sharing "aryan@oksbi" reveals nothing about the underlying bank account. Account numbers can be used for fraudulent debits (NACH mandates, ECS). VPAs have no such risk — they only work for incoming credits.

2. Portability: you can keep the same VPA even if you switch banks or phone numbers. A new mapping is registered at NPCI. Contrast: account + IFSC changes every time you change banks.

3. Simplicity: "aryan@oksbi" is memorable. "SBIN0001234 + 0012345678901" is not.

4. Interoperability: one VPA works across all 300 UPI-enabled banks and 200+ apps. No need to maintain separate account details for each institution.

5. Resolution confirms identity: NPCI resolution returns the account holder's name. Before paying, you see "Aryan Aman, SBI" — this prevents sending to a wrong account silently.

6. No account exposure during checkout: merchants display "pay to merchant@ybl" on their QR code. If this QR code is photographed or shared, no account number is exposed. With old NEFT transfers, merchants had to publicly post their account + IFSC.`,
    followups: ["Can a VPA be used to initiate a debit (pull payment) without the payer's approval?", "What prevents someone from creating thousands of fake VPAs as money mule accounts?"],
  },
  {
    id: "npci-q10",
    category: "Database Design",
    difficulty: "Easy",
    round: "Screening",
    asked_at: ["Razorpay", "PayU", "Amazon"],
    question: "Why does NPCI use a hub-and-spoke architecture instead of bilateral integrations between every bank and PSP?",
    answer: `Without a central hub, every bank would need a bilateral integration with every other bank and every PSP app.

Math of bilateral integrations:
• 300 banks + 200 PSP apps = 500 participants.
• Each pair needs a bilateral API integration, security certificate, settlement agreement.
• Bilateral model: 500 × 499 / 2 = 124,750 unique bilateral integrations.
• Each integration needs testing, maintenance, certificate rotation, SLA agreements.
• A new bank joining: needs 499 new integrations. Practically infeasible.

Hub-and-spoke (NPCI model):
• Each participant integrates with NPCI once.
• 500 participants × 1 integration each = 500 integrations total.
• A new bank joining: 1 integration with NPCI. Done. Immediately interoperable with all 499 others.
• Reduction: 124,750 → 500 integrations. 250× simpler.

Other benefits of central hub:
• Standardization: NPCI defines the API schema, security protocols, message format. All participants speak the same language.
• Single fraud layer: NPCI runs fraud detection once centrally rather than each PSP building independent (and inconsistent) fraud systems.
• Settlement: DNS works because NPCI sees all flows. In a bilateral model, each pair would need separate settlement — netting across the entire network is impossible.
• Regulatory oversight: RBI can monitor all UPI transactions through NPCI. In a bilateral model, visibility is fragmented.`,
    followups: ["What is the single point of failure risk in a hub-and-spoke model, and how does NPCI mitigate it?", "How does this hub-and-spoke compare to Visa/Mastercard's network architecture?"],
  },
];
