export const IRCTC_HLD = {
  title: "IRCTC — High Level Design",
  subtitle: "Indian Railway ticketing — 23M+ passengers/day, 14K+ trains, 800K+ online bookings/day, 1.5M concurrent Tatkal users at 10 AM",
  overview: `IRCTC (Indian Railway Catering and Tourism Corporation) is the world's largest railway ticketing platform by volume. It handles 800K–1.2M online ticket bookings per day across 14,000+ trains and 7,500+ stations, with a passenger base of 23M+ daily travellers.

The defining engineering challenge is the Tatkal booking window: at exactly 10:00 AM every day, 1.5M+ users simultaneously attempt to book limited-inventory premium tickets. This creates a write-heavy thundering herd problem on seat inventory — a few thousand seats must be safely allocated to millions of concurrent requests in seconds without double-booking.

Beyond Tatkal, IRCTC manages: real-time seat availability across 11 coach types (Sleeper, 3A, 2A, 1A, CC, EC, etc.), a complex waitlist/RAC system where cancelled tickets propagate down to waiting passengers, PNR tracking for every booking, and payment processing across UPI, credit cards, wallets, and IRCTC's own i-wallet at massive throughput during peak windows.`,

  metrics: [
    { label: "Daily passengers",       value: "23M+",     note: "across all Indian Railways trains" },
    { label: "Daily online bookings",  value: "800K–1.2M", note: "IRCTC portal + app + API partners" },
    { label: "Trains",                 value: "14,000+",  note: "including express, mail, local" },
    { label: "Stations",               value: "7,500+",   note: "across India" },
    { label: "Peak concurrent users",  value: "1.5M+",    note: "Tatkal window: 10:00–10:02 AM" },
    { label: "Tatkal seat fill time",  value: "< 5 min",  note: "most popular trains sold out" },
    { label: "Ticket booking SLA",     value: "< 4s",     note: "end-to-end including payment" },
    { label: "Cancellations/day",      value: "150K+",    note: "triggers waitlist propagation" },
  ],

  diagram: `
┌──────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                       │
│       IRCTC Web (React) · IRCTC App (iOS/Android) · API Partners (MakeMyTrip │
│       Paytm, RailYatri)  ·  Station kiosks  ·  Agent portal                 │
└─────────────────────────────┬────────────────────────────────────────────────┘
                              │  HTTPS / WebSocket
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                 API GATEWAY + RATE LIMITER (Kong / AWS ALB)                  │
│            SERVICE MESH — Envoy sidecar attached to every service            │
│   Auth (OTP/JWT) · Rate Limiting (captcha on booking) · DDoS protection      │
│   Tatkal queue: token bucket per user — 1 booking attempt per 5 seconds      │
│         mTLS · Load Balancing · Retries · Circuit Breaking · Tracing         │
└───────┬──────────┬──────────┬──────────┬──────────┬────────────────────────┘
        │          │          │          │          │
        ▼          ▼          ▼          ▼          ▼
┌────────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐
│  Search    │ │Booking │ │Payment │ │  PNR   │ │  Train Track │
│  Service   │ │Service │ │Service │ │Service │ │  Service     │
└─────┬──────┘ └───┬────┘ └───┬────┘ └────────┘ └──────────────┘
      │             │          │
      ▼             ▼          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          KAFKA EVENT BUS                                     │
│   booking.initiated · seat.locked · payment.success · ticket.confirmed      │
│   booking.cancelled · waitlist.promoted · train.chart.prepared              │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                            DATA LAYER                                        │
│  PostgreSQL (bookings, passengers, trains)  ·  Redis (seat inventory, locks) │
│  Cassandra (PNR audit trail, seat history)  ·  Elasticsearch (train search)  │
│  S3 (tickets, charts) · ClickHouse (analytics) · Oracle (legacy PRS sync)   │
└──────────────────────────────────────────────────────────────────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Train Search & Seat Availability",
      sections: [
        {
          title: "Train Search — Finding Trains Between Stations",
          content: `A user searching Delhi to Mumbai for a given date should instantly see all trains, current availability across quota types, and ETA — from a dataset of 14,000+ trains and 7,500+ stations.

SEARCH ARCHITECTURE:

Static schedule layer (Elasticsearch + PostgreSQL):
  All train routes, stops, timings, days of operation pre-indexed in Elasticsearch
  Query: source station code + destination station code + date
  Elasticsearch handles: fuzzy station name matching ("Bombay" → "Mumbai CST"), multi-stop routing

Route computation:
  Train 12951 Rajdhani: NDLS → ADI → BRC → BCT (Delhi → Ahmedabad → Vadodara → Mumbai)
  Source = NDLS, Destination = BCT → find: does this train stop at both? Is source stop before destination?
  Pre-computed route matrix: train_id + (source, destination) pairs stored in Redis hash
  Lookup: O(1) — "does 12951 go from NDLS to BCT?" → yes + sequence numbers

REAL-TIME AVAILABILITY CHECK:
  For each train in search results, availability query hits Redis:
    HMGET train:12951:2026-06-15:2A available_cnt waitlist_cnt rac_cnt
  Redis updated on every booking, cancellation, and chart preparation
  Why Redis and not PostgreSQL? 1.5M users hitting availability at 10 AM = need microsecond reads

QUOTA TYPES (India-specific complexity):
  Each train/class/date has multiple independent quotas:
  GN  — General quota (largest, 90%+ of seats)
  TQ  — Tatkal quota (premium seats, books at 10 AM, D-1 to journey)
  TQWL — Tatkal Waitlist
  CK  — Confirm Tatkal (higher price, guaranteed or full refund)
  HO  — Head Office quota (government officials)
  DF  — Defence quota
  Each quota has its own seat counter in Redis — completely separate pools`,
        },
        {
          title: "Seat Availability — Classes, Coaches & Berth Types",
          content: `Indian Railways has one of the world's most complex seat classification systems. A single train can have 20+ coaches, each with different classes and configurations.

COACH TYPES AND AVAILABILITY:
  1A — First AC (4 berths/cabin, most expensive)
  2A — Second AC (2-tier sleeper, 6 berths/cabin)
  3A — Third AC (3-tier, 8 berths/coupe)
  SL — Sleeper (non-AC, 8 berths/coupe, highest volume)
  CC — Chair Car (day trains, reclining seats)
  EC — Executive Chair Car (premium day travel)
  GEN — Unreserved general compartments (no reservation needed)

BERTH PREFERENCES:
  Per berth: Lower (LB), Middle (MB), Upper (UB), Side Lower (SL), Side Upper (SU)
  System tries to honour preference; if unavailable → auto-allocate
  Berth assignments are finalised at chart preparation (4 hours before departure), not at booking time
  This is key: booking just reserves a seat NUMBER in a coach, berth type is best-effort

AVAILABILITY DISPLAY:
  AVAILABLE  — seats open (shows count)
  RAC        — Reservation Against Cancellation (you get a berth to share until someone cancels)
  WL n       — Waitlist position n (no guaranteed travel, may get confirmed before chart prep)
  WL→RAC     — Waitlist likely to reach RAC before chart prep (predicted)
  REGRET     — No seats, no waitlist space (train fully booked including waiting)

FORECAST MODEL:
  Predict whether a WL 45 passenger will get confirmed before chart prep
  Features: historical cancellation rate for this train/class/date, days until departure, current WL depth
  Shown to user: "WL 12 — 73% chance of confirmation based on historical data"
  Trained on millions of past booking/cancellation/confirmation events`,
        },
        {
          title: "Back-of-the-Envelope Estimation",
          content: `Before drawing boxes, size the problem — every number here should map directly to a component in the architecture.

ASSUMPTIONS:
• 1.5M+ concurrent users in the Tatkal window (10:00:00–10:00:02 AM)
• 800K–1.2M total online bookings/day
• 150K+ cancellations/day
• 50M+ PNR status checks/day vs ~1M bookings/day (50:1 read:write)
• A popular train's Tatkal 3A quota ≈ 200 seats

1. Tatkal arrival rate: 1.5M concurrent users firing requests within a
   2-second window ≈ 750,000 req/sec instantaneous arrival rate.
   → No atomic Redis DECR can safely absorb this directly — this is
   exactly why the TATKAL QUEUE exists: append-only ZADD into a Redis
   sorted set can absorb hundreds of thousands of writes/sec, while the
   queue processor drains at a controlled 5,000 bookings/sec.

2. Seat-to-request ratio: ~200 Tatkal seats vs 400K–600K requests in the
   first 2 seconds → a >99.96% rejection rate.
   → This is why the queue processor fails FAST — "SORRY_NO_SEATS" is
   pushed via SSE the instant inventory hits zero, rather than letting
   hundreds of thousands of doomed requests sit in a 3-minute booking
   window.

3. PNR read amplification: 50M PNR checks/day ÷ 86,400s ≈ 580 reads/sec
   average, ~2,900/sec at evening peak (5x).
   → With an 85% Redis cache hit rate, only ~87–435 reads/sec reach the
   PostgreSQL read replicas — and each replica handles 5,000 reads/sec,
   so 1 replica comfortably serves all PNR read traffic even at peak.

4. Average vs peak booking rate: 800K–1.2M bookings/day ÷ 86,400s ≈
   9–14 bookings/sec average — but the Tatkal queue alone is provisioned
   for 5,000 bookings/sec for its 2-minute window.
   → The "average" number is almost meaningless for capacity planning
   here: IRCTC must provision for a >300x burst multiplier that arrives
   at a known time every single day, which is why pre-scaling (not
   autoscaling) governs the Tatkal Queue and Booking Service fleets.

5. Waitlist propagation load: 150K cancellations/day ÷ 86,400s ≈ 1.7/sec
   average, but festival peaks hit ~10,000/hour ≈ 2.8/sec.
   → Each cancellation triggers a promotion chain (WL→RAC→Confirmed)
   that must complete within 60 seconds — the Waitlist Promotion Service
   (single Kafka consumer per train/class/date) must keep consumer lag
   near zero even during these bursts, or SMS confirmations arrive late.

Interview punch line: 750,000 req/sec maps onto the TATKAL QUEUE's Redis
sorted set + 5,000/sec controlled drain; the 99.96% rejection rate is why
the queue fails fast; the 50M PNR reads/sec → 85% cache hit → ~435/sec to
Postgres maps onto the L1/L2/L3 PNR cache hierarchy; and the >300x burst
multiplier is the single number that explains why IRCTC pre-scales for
Tatkal instead of relying on autoscaling.`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Seat Reservation & Booking Flow",
      sections: [
        {
          title: "The Booking State Machine — Lock → Pay → Confirm",
          content: `Seat reservation is a two-phase commit problem: lock the seat before payment (so no one else books it), but release the lock if payment fails. The lock window must be tight to maximise seat utilisation.

BOOKING FLOW:

Step 1 — Seat Lock (< 200ms):
  User selects train, class, quota, passenger details → POST /v1/booking/initiate
  Booking Service:
    1. Check availability in Redis: DECRBY train:{id}:date:{d}:class:{c}:quota:{q}:available 1
       If result < 0 → INCRBY (rollback) → return "No seats available"
       If result >= 0 → seat locked (atomic Redis operation = no race condition)
    2. Create booking record in PostgreSQL: status = SEAT_LOCKED
    3. Set Redis expiry: booking:{booking_id}:lock EX 600 (10-minute payment window)
    4. Return booking_id + payment URL

Step 2 — Payment (user action, < 10 minutes):
  User completes payment via UPI/card/wallet
  Payment gateway webhooks result to Payment Service

Step 3 — Ticket Confirmation (< 500ms after payment webhook):
  Payment success:
    - PostgreSQL UPDATE bookings SET status = CONFIRMED, pnr = generate_pnr()
    - Generate PNR (10-digit), assign seats (or keep waitlist position)
    - Publish booking.confirmed to Kafka
    - Send SMS + email with ticket
  Payment failure:
    - INCRBY (release the locked seat back to inventory)
    - PostgreSQL UPDATE bookings SET status = PAYMENT_FAILED
    - User can retry within the 10-minute lock window

LOCK EXPIRY HANDLING:
  Redis key expires after 600 seconds → Kafka consumer detects expiry event → releases seat
  Cleanup job: every 5 minutes scan PAYMENT_PENDING bookings older than 11 minutes → release
  Two-pronged: Redis TTL for speed + background job for safety

IDEMPOTENCY:
  Mobile networks drop during Tatkal rush → user taps "Book" multiple times
  idempotency_key = user_id + train_id + travel_date + class + passenger_hash
  Redis SETNX on this key before proceeding → only one booking attempt wins
  Subsequent attempts return the existing booking_id`,
        },
        {
          title: "Waitlist & RAC — The Confirmation Queue",
          content: `WL (Waitlist) and RAC (Reservation Against Cancellation) are uniquely Indian Railway constructs. When a passenger cancels, their seat must automatically propagate to the next eligible waitlisted passenger.

WAITLIST MECHANICS:

Booking when seats unavailable:
  User can book a WL ticket (no guaranteed travel — they "join the queue")
  WL position assigned atomically: INCR train:{id}:date:{d}:class:{c}:waitlist_counter → position 45
  WL ticket can be purchased at lower fare + convenience fee
  WL passengers cannot board if WL position is not confirmed by chart prep time

RAC (Reservation Against Cancellation):
  A transitional state between WL and confirmed
  RAC 1 means: you have a berth to share (Side Lower typically) with RAC 2
  If one more confirmed passenger cancels: RAC 1 gets their own berth (fully confirmed)
  RAC passengers CAN board the train; they get half a berth guaranteed

CANCELLATION PROPAGATION:
  Passenger A (Confirmed) cancels their ticket:
  Kafka event: booking.cancelled for seat A

  Waitlist Promotion Service (Kafka consumer):
    1. WL → RAC promotion:
       Get RAC count for train/class/date
       If RAC slots available → move top WL to RAC
    2. RAC → Confirmed promotion:
       If confirmed seats freed → promote RAC 1 to confirmed status
    3. Update booking statuses for affected passengers
    4. Notify promoted passengers via SMS: "Congratulations! Your WL 3 ticket for 12951 is now CONFIRMED"

  This runs in real-time — a cancellation at 11 AM can confirm a WL passenger by 11:01 AM

CHART PREPARATION (4 hours before departure):
  Final state freeze: no more cancellations/upgrades after charting
  All remaining WL tickets: if not confirmed → auto-cancelled, full refund
  Physical chart printed at origin station showing confirmed passengers + RAC
  After charting: IRCTC updates train's carriage display boards in real-time`,
        },
        {
          title: "Service Mesh — Sidecar Proxy Pattern (Envoy/Istio)",
          content: `Behind the API Gateway sit five services — Search, Booking, Payment, PNR and Train Track — each calling several of the others and Kafka on the booking hot path. A service mesh gives every one of them a uniform Envoy sidecar for traffic management, security and observability, without touching their code.

WHY A MESH FITS IRCTC'S FLEET:
  Booking Service → Payment Service is the highest-stakes synchronous call
    in the system — a stuck payment gateway during Tatkal must not
    cascade into stuck booking workers holding seat locks.
  PNR Service is hammered by external API partners (MakeMyTrip, Paytm,
    RailYatri) — 50M checks/day, far more callers than just the app —
    so it needs the same isolation a public-facing service gets.
  Search Service and Train Track Service ship ranking/ETA model updates
    regularly; a bad deploy the night before a Tatkal morning is
    catastrophic, so canary rollouts matter more here than almost
    anywhere else in the stack.

DATA PLANE: an Envoy sidecar is injected next to every instance of
  Search, Booking, Payment, PNR and Train Track Service. All inter-service
  calls — Booking→Payment, Booking→PNR, Search→Train Track — are
  intercepted by these sidecars, which handle mTLS, retries, timeouts,
  load balancing and circuit breaking transparently.

CONTROL PLANE (Istio): a central control plane (istiod) pushes routing
  rules, TLS certificates and circuit-breaker thresholds to every sidecar.
  Engineers declare policy once — "Payment Service trips after 5
  consecutive 5xx" — and it applies fleet-wide without redeploying any
  service.

WHAT THIS BUYS IRCTC SPECIFICALLY:
  Circuit breaking on Payment Service: if the UPI/card gateway integration
    starts timing out, the sidecar's outlier detection ejects the
    unhealthy backend instances and Booking Service's call fails fast —
    the seat lock is released back to inventory within its TTL instead
    of holding it until a 30-second gateway timeout expires.
  Canary deploys for Search Service: a new ranking/availability algorithm
    is rolled out to 5% of traffic at 2-4 AM (the same low-traffic window
    used for PRS mainframe sync), validated against real queries, then
    promoted — all via traffic-split config, no extra infrastructure.
  mTLS everywhere: Aadhaar-linked passenger data moving between Booking,
    PNR and Payment Service is encrypted in transit by default, satisfying
    the same data-protection bar as the OTP/JWT layer at the gateway.
  AuthorizationPolicy: only Booking Service may call Payment Service —
    Search Service or Train Track Service calling the payment path
    directly (a bug or compromised pod) is rejected at the sidecar before
    it reaches the application.
  Tracing: a single Tatkal booking request — API Gateway → Booking Service
    → Inventory (Redis) → Payment Service → PNR Service → Kafka — gets one
    trace ID across all five hops, so a slow Tatkal booking can be
    attributed to the exact hop that's slow.

DIAGRAM: the "SERVICE MESH — Envoy sidecar attached to every service" band
  already sits inside the API GATEWAY + RATE LIMITER box at the top of the
  diagram — that line is this section. Every arrow fanning out to Search,
  Booking, Payment, PNR and Train Track Service is mesh-managed traffic.

TRADE-OFFS:
  Every hop adds ~1-2ms of sidecar latency — acceptable against the <4s
  end-to-end booking SLA, but tight against the <200ms internal seat-lock
  budget, so the mesh's own timeouts must be tuned per route.
  The control plane must be rock-solid during the Tatkal window — if
  istiod is unreachable, sidecars keep serving their last-known config
  (fail open on existing rules), but no policy changes can be pushed
  mid-surge, so any mesh config changes are frozen well before 10 AM.
  The Oracle PRS mainframe sync stays OUTSIDE the mesh entirely — it's a
  legacy batch integration, not a Kubernetes service, and is governed by
  its own nightly maintenance window instead.`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Tatkal — Handling the 10 AM Thundering Herd",
      sections: [
        {
          title: "Tatkal Booking Window — 1.5M Concurrent Users",
          content: `Tatkal (meaning "immediate" in Hindi) is a premium quota that opens exactly one day before departure at 10:00:00 AM. For popular trains (Mumbai Rajdhani, Chennai Mail), seats in a 3A class (≈ 200 seats) are gone within 60 seconds of opening.

THE PROBLEM:
  1.5M users have their browsers/apps on the booking page at 9:59:58 AM
  At 10:00:00 AM: all of them send booking requests simultaneously
  10:00:00 → 10:00:02: 400K–600K requests arrive
  Seats available: 50–300 depending on train/class
  Most requests must be rejected; the system must remain available

QUEUE-BASED FAIRNESS:
  At 10:00:00: all incoming Tatkal requests go into a booking queue (Kafka / Redis Queue)
  NOT processed directly — queued first
  Queue assigns a sequence number: user with sequence 1 gets processed first
  This is fairer than "whoever has the fastest network wins"

  Queue capacity: 500K per train (beyond this → "Queue full, try again")
  Processing rate: 5,000 bookings/second (controlled throughput)
  First 300 users in queue for a 300-seat Tatkal train → very high confirmation chance

RATE LIMITING PER USER:
  Token bucket per user_id: 1 Tatkal booking attempt per 5 seconds
  Prevents any single user from flooding the queue with retries
  CAPTCHA enforced at checkout page (added in 2012 after bot-driven scalping complaints)
  OTP verification mandatory for Tatkal (added friction to slow bots)

VIRTUAL WAITING ROOM:
  If queue is full: user placed in virtual waiting room with live position counter
  "You are #142,450 in queue — estimated wait: 8 minutes"
  Position updates every 30 seconds via Server-Sent Events (SSE)
  When it's their turn: "Proceed to booking" notification
  User has 3 minutes to complete booking or position is forfeited

SEAT LOCKING ATOMICITY:
  Redis Lua script (atomic):
    local available = redis.call('GET', seat_key)
    if tonumber(available) > 0 then
      redis.call('DECR', seat_key)
      redis.call('SETEX', lock_key, 600, booking_id)
      return 1  -- locked
    else
      return 0  -- full
    end
  Lua scripts execute atomically — no two concurrent requests can decrement the same seat`,
        },
        {
          title: "Anti-Scalping & Bot Prevention",
          content: `Railway ticket scalping (touts buying tickets to resell at markup) was rampant before IRCTC digitised. The system actively fights automated bulk-booking.

BOT PREVENTION LAYERS:

1. CAPTCHA (reCAPTCHA v3):
   Invisible score-based on Tatkal pages
   Score < 0.5 → show visual CAPTCHA challenge
   Score < 0.3 → temporary block + flag for review

2. OTP verification:
   Tatkal bookings require OTP on registered mobile number
   OTP valid for 5 minutes, one-time use
   Effectively prevents automated booking without phone access

3. Per-account Tatkal limits:
   Maximum 2 Tatkal tickets per user per day
   Maximum 6 passengers per Tatkal booking
   Agent quota: separate higher limit for authorised travel agents

4. Device fingerprinting:
   Track: browser fingerprint, screen resolution, timezone, installed fonts
   Multiple accounts from same device fingerprint → flag + CAPTCHA escalation
   Headless browser detection: missing browser APIs → block

5. IP-based rate limiting:
   Max 10 booking attempts per IP per hour (handles shared NAT scenarios)
   Known VPN/datacenter IP ranges → stricter limits

6. Booking velocity anomaly detection:
   ML model on: time-between-clicks, mouse movement patterns, form fill speed
   Human fills form in 30–90s; bots fill in < 3s
   Anomaly → shadow block (let them proceed to payment but silently fail at ticket generation)

AGENT SYSTEM:
  Authorised travel agents can book on behalf of passengers
  Agents get: higher daily booking limits, bulk booking API access, commission structure
  Agent fraud: agent books tickets without real passengers to sell to touts
  Detection: check PNR utilisation at boarding — if no one boards, agent demerited`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Payment & Ticketing",
      sections: [
        {
          title: "Payment Infrastructure — UPI, Cards & i-Wallet",
          content: `IRCTC processes millions of payment transactions during peak booking windows. The payment step is the most failure-prone in the booking flow — network drops, bank timeouts, and gateway failures must all be handled gracefully without losing the seat lock.

PAYMENT GATEWAY INTEGRATION:
  Primary: Razorpay / PayU / HDFC Payment Gateway (multiple for redundancy)
  Failover: if primary gateway returns error rate > 2% → auto-switch to secondary
  Payment methods:
    UPI (Google Pay, PhonePe, BHIM): 60%+ of transactions
    Credit/Debit cards (Visa/Mastercard/RuPay): 25%
    Net banking: 10%
    i-Wallet (IRCTC's own pre-loaded wallet): 5%

i-WALLET:
  User pre-loads ₹100–10,000 into IRCTC wallet
  Booking deducts from wallet instantly (no bank round-trip)
  This is the fastest payment method for Tatkal — bank redirects take 3–8 seconds
  i-Wallet payment: < 500ms
  Stored in PostgreSQL (double-entry ledger) + Redis (hot balance cache)

PAYMENT TIMEOUT HANDLING:
  Seat lock: 10 minutes. Bank redirect + OTP + bank processing = can take 3–7 minutes
  If user's bank is slow → they may timeout. What happens?
    1. Booking Service polls gateway status every 30 seconds
    2. If payment status still PENDING at 9 minutes → send user a "Complete payment now" notification
    3. At 10 minutes → lock expires → seat released → booking moves to EXPIRED state
    4. If payment settles AFTER lock expiry: full refund issued automatically (T+3 business days)

DOUBLE CHARGE PREVENTION:
  idempotency_key on payment gateway API: each booking attempt sends a unique key
  If network drops and user retries → same idempotency_key → gateway returns existing transaction
  At IRCTC side: payment_id marked as processed → duplicate webhook silently dropped

REFUND ENGINE:
  Cancellation before chart prep: refund per Railways cancellation policy
  Cancellation < 48 hours before: 25% of fare forfeited
  Cancellation < 12 hours: 50% forfeited; <4 hours: no refund
  Auto-cancelled WL (at charting): full refund
  Refund path: same payment method used (UPI refunds in < 2 hours; cards 5–7 days)
  i-Wallet refunds: instant`,
        },
        {
          title: "Ticket Generation & PNR",
          content: `Every confirmed booking gets a PNR (Passenger Name Record) — the 10-digit identifier that links the passenger to their journey. The PNR is the central entity in the IRCTC data model.

PNR GENERATION:
  PNR format: 10 digits, zone-encoded
  First digit: Railway zone (1=Northern, 2=Eastern, etc.)
  Remaining 9 digits: sequence number within zone
  Generated via: DB sequence (PostgreSQL SEQUENCE per zone) — guaranteed unique
  PNR creation is the commit point — only created on CONFIRMED status

TICKET GENERATION:
  PDF ticket generated server-side from booking data
  Contains: PNR, train number, date, source/destination, passenger details, fare breakup
  Berth numbers: NOT included at booking time (assigned at chart prep, 4 hours before departure)
  Ticket stored in S3 — customer gets download link valid for 30 days
  SMS ticket: abbreviated version sent to registered mobile (works offline)

E-TICKET vs I-TICKET:
  E-Ticket (electronic): passenger travels with phone/printout — no physical delivery
  I-Ticket (internet ticket): IRCTC posts a physical ticket to passenger's address (takes 2–3 days, only for advance booking)
  E-Ticket is 99%+ of all bookings today; I-Ticket is nearly obsolete

BOARDING VERIFICATION:
  TTE (Travelling Ticket Examiner) checks: ID proof + PNR printout/phone
  PNR lookup: TTE app fetches real-time passenger list from IRCTC
  Mobile network in remote areas: TTE app caches offline chart (downloaded at station before departure)
  E-Ticket: no QR code scan — PNR + government ID is sufficient (ID matching prevents transfers)

CHART PREPARATION (T-4 hours):
  Final passenger list generated and frozen
  Berth assignment algorithm runs:
    - Group passengers in same booking → adjacent berths (same coupe preferred)
    - Elderly/women passengers → lower berths (preference respected if available)
    - Remaining berths allocated sequentially
  Chart uploaded to station display boards
  After chart prep: cancellations possible but no berth reallocation (seat goes empty)`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "PNR Status & Real-Time Train Tracking",
      sections: [
        {
          title: "PNR Status System",
          content: `"Where is my PNR?" is the most queried endpoint on IRCTC. 50M+ PNR status checks per day — far exceeding booking volume.

PNR STATUS ARCHITECTURE:

Heavy read, light write:
  Bookings created: 1M/day (writes)
  PNR status checks: 50M+/day (reads)
  Read:Write ratio ≈ 50:1 → aggressive caching is mandatory

Cache strategy:
  L1: CDN edge cache (Cloudflare/CloudFront):
    PNR status for charts already prepared: cached for 2 hours (berths won't change)
    Cache-Control: public, max-age=7200
  L2: Redis (hot PNR cache):
    All PNR lookups from past 24 hours cached: TTL = 30 minutes
    Invalidated immediately on: booking status change, WL promotion, cancellation
  L3: PostgreSQL read replica (cache miss path)

PNR STATUS API:
  GET /v1/pnr/{pnr_number}
  Returns: current status, passenger names (last 2 chars masked), berth (if assigned),
           train details, and booking history events (when it moved from WL to confirmed)

External PNR checking (3rd party apps):
  RailYatri, Where is my Train, etc. make 5M+ PNR API calls/day
  Throttled at gateway: 1000 req/min per API key
  Separate read-only API service to isolate from booking workload

SMS INTEGRATION:
  On any PNR status change (WL→Confirmed, booking cancelled, chart prepared):
  Kafka consumer → SMS service → send notification within 60 seconds
  Passengers proactively know status without polling`,
        },
        {
          title: "Real-Time Train Running Status",
          content: `"Where is my train?" — knowing if the Rajdhani is on time, delayed, or cancelled before reaching the station. Indian Railways' National Train Enquiry System (NTES) is the authoritative data source.

DATA SOURCES:
  NTES (National Train Enquiry System): Indian Railways' internal system updated by station masters
  Stations report: actual arrival time, actual departure time, platform number
  Frequency: updated on every station arrival/departure event (≈ every 30–90 minutes depending on run)
  API: IRCTC polls NTES every 2 minutes for running trains

GPS-BASED TRACKING (newer trains):
  LHB coaches (Linke Hofmann Busch) have GPS units since 2018
  GPS pings every 30 seconds → more granular position (between stations)
  But: GPS coverage gaps in tunnels, remote areas
  Hybrid: GPS where available, station-based updates as fallback

TRAIN POSITION CALCULATION:
  Between stations: linear interpolation
  Known: departed Station A at 14:30, scheduled to reach Station B at 15:15 (45 min journey)
  Current time: 14:52 → elapsed: 22 min → estimated position: 22/45 = 48% of route segment
  With GPS: actual lat/lng shown on map

DELAY PREDICTION:
  Features: current delay (minutes late), station ahead, time of day, historical delay patterns
  "Rajdhani is 45 minutes late at Kota — will it recover to 20 minutes late at Mumbai?"
  Historical data: same train, same day of week, same delay at same station → what happened?
  ML model predicts terminal delay ± 15 minutes (better than just propagating current delay)

NOTIFICATION SERVICE:
  User sets: "Alert me when 12951 reaches Kota" → push notification when train departs Kota
  Train delayed > 30 minutes → proactive alert to all passengers on that train's active bookings
  Platform change → immediate push (helps passengers on crowded stations)
  Cancellation (rare) → emergency notification + auto-refund triggered`,
        },
      ],
    },
    {
      id: "phase6",
      label: "Phase 6",
      title: "Scale, Reliability & The Legacy Problem",
      sections: [
        {
          title: "Handling Tatkal Scale & Database Architecture",
          content: `IRCTC's scale challenge is unique: it's not sustained high throughput but extreme 2-minute bursts at predictable times, on top of a legacy Oracle-based PRS (Passenger Reservation System) that has been running since the 1980s.

INVENTORY ARCHITECTURE:

The core tension: seat inventory must be:
  - Consistent (no double-booking)
  - Fast (< 200ms lock at 1.5M concurrent)
  - Available (cannot go down during Tatkal)

Solution: Redis as the seat inventory primary store during booking:
  For each train + date + class + quota:
    Key: train:12951:2026-06-15:3A:GN:available → value: 234 (seat count)
    DECR is atomic → no race condition possible
    Persisted to PostgreSQL async (acceptable: Redis is durable with AOF/RDB)

  In a failure scenario (Redis down): degrade gracefully
    Read from PostgreSQL with SELECT FOR UPDATE (serialised writes, much slower but correct)
    This is the fallback — Redis should never go down (Sentinel + cluster mode)

POSTGRESQL PARTITIONING:
  bookings table: partitioned by travel_date (range partitioning)
  Hot partition: current month's bookings (active queries)
  Cold partitions: older months (archived to S3 Glacier after 1 year)
  This keeps query performance stable as bookings table grows to billions of rows

LEGACY PRS (Passenger Reservation System) INTEGRATION:
  The original Indian Railways system runs on IBM mainframes + Oracle
  IRCTC must sync with PRS for:
    - Authoritative seat inventory (PRS is the ground truth for Railways)
    - Coach composition changes (trains add/remove coaches based on demand)
    - Berth assignment (PRS does final physical allocation)
  Integration: IRCTC reservation service sends confirmed bookings to PRS via a message queue
  PRS responds with final berth assignment at chart preparation time
  This is the hardest part of IRCTC engineering: bridging a modern microservices stack with a 1980s mainframe

CACHING STRATEGY:
  Train schedule data: CDN + Redis, TTL 24 hours (changes rarely)
  Station list + names: Redis, TTL 7 days (almost never changes)
  Seat availability: Redis, TTL 0 (always current, updated on each booking/cancellation)
  PNR status: Redis, TTL 30 minutes (proactively invalidated on status change)
  User booking history: Redis, TTL 1 hour (users view repeatedly after booking)`,
        },
        {
          title: "Reliability, Circuit Breakers & Disaster Recovery",
          content: `IRCTC availability is a national priority. Downtime during Tatkal window costs passengers their bookings (non-recoverable since Tatkal is time-bound) and erodes trust in digital infrastructure.

AVAILABILITY TARGET:
  99.9% uptime = 8.7 hours downtime/year
  IRCTC historical reality: falls short during peak events (Tatkal rush, festival booking floods)
  Target architecture improvement: 99.95% (< 4.4 hours/year)

CIRCUIT BREAKERS:

Payment gateway:
  Error rate > 5% on primary gateway → circuit OPEN → route to secondary gateway
  Hystrix/Resilience4j implementation
  Fallback: if all gateways degraded → queue payment for retry in 30 seconds
  User sees: "Payment processing — please wait" (not an error)

PRS integration:
  PRS (mainframe) has planned downtime windows (maintenance, 2–4 AM)
  Circuit breaker detects PRS unavailability → queue bookings in Kafka
  Booking Service still accepts payments → holds confirmed status in IRCTC DB
  On PRS recovery → consume queue → replay bookings to PRS in order
  User experience: booking shows "Confirmed" in IRCTC; PRS sync happens in background

Search service degradation:
  Elasticsearch slow → return cached results (train schedules don't change minute-to-minute)
  Redis-cached availability from last 5 minutes (slightly stale but acceptable for search)
  Banner: "Availability may not reflect the last 5 minutes of bookings"

DATABASE FAILOVER:
  PostgreSQL: hot standby replica with streaming replication
  RTO (Recovery Time Objective): < 2 minutes (automated failover via Patroni)
  RPO (Recovery Point Objective): < 30 seconds (synchronous replication for bookings table)
  Redis: Sentinel mode with 3 nodes (automatic leader election on failure)

DATA CENTRE STRATEGY:
  Two data centres: primary (Delhi) + DR (Hyderabad)
  Bookings synchronously written to both (quorum write)
  If primary DC fails: DNS failover routes to DR → system continues with < 60 seconds interruption
  Annual DR drill: simulated primary DC failure, full failover test`,
        },
      ],
    },
  ],
};

export const IRCTC_LLD = {
  title: "IRCTC — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of IRCTC's core booking, inventory and PNR services",

  components: [
    {
      id: "bookingService",
      title: "Booking Service — LLD",
      description: "End-to-end ticket reservation with atomic seat locking, idempotency, and waitlist management",
      api: `POST /v1/booking/initiate
Authorization: Bearer {jwt}

{
  "idempotency_key": "user_abc_12951_20260615_3A_passenger_hash",
  "train_number": "12951",
  "travel_date": "2026-06-15",
  "source_station": "NDLS",
  "destination_station": "BCT",
  "class": "3A",
  "quota": "GN",
  "passengers": [
    {
      "name": "Ravi Kumar",
      "age": 34,
      "gender": "M",
      "id_type": "AADHAAR",
      "id_number": "XXXX-XXXX-1234",
      "berth_preference": "LB"
    },
    {
      "name": "Priya Kumar",
      "age": 30,
      "gender": "F",
      "id_type": "AADHAAR",
      "id_number": "XXXX-XXXX-5678",
      "berth_preference": "LB"
    }
  ],
  "contact_mobile": "9876543210",
  "contact_email": "ravi@example.com"
}

Response 200 (seat locked):
{
  "booking_id": "BK20260601123456",
  "status": "SEAT_LOCKED",
  "pnr": null,
  "lock_expires_at": "2026-06-01T10:15:00Z",
  "seat_info": {
    "class": "3A",
    "quota": "GN",
    "status": "AVAILABLE",    // AVAILABLE / RAC / WAITLIST
    "waitlist_number": null
  },
  "fare": {
    "base_fare": 1395.00,
    "reservation_charge": 40.00,
    "superfast_surcharge": 45.00,
    "catering": 0.00,
    "gst": 26.00,
    "total": 1506.00
  },
  "payment_url": "https://pay.irctc.co.in/gateway/BK20260601123456"
}

Response 409 (no seats):
{ "error": "NO_SEATS_AVAILABLE", "waitlist_position": 47, "rac_available": false }

-- Atomic seat lock (Redis Lua) --
local key = "train:12951:2026-06-15:3A:GN:available"
local lock_key = "booking:lock:" .. ARGV[1]
local available = tonumber(redis.call("GET", key))
if available and available > 0 then
  redis.call("DECR", key)
  redis.call("SETEX", lock_key, 600, ARGV[1])
  return 1
else
  return 0
end

-- Booking schema --
CREATE TABLE bookings (
  booking_id        TEXT PRIMARY KEY,
  idempotency_key   TEXT UNIQUE NOT NULL,
  pnr               CHAR(10) UNIQUE,
  user_id           UUID NOT NULL,
  train_number      TEXT NOT NULL,
  travel_date       DATE NOT NULL,
  source_station    CHAR(5) NOT NULL,
  destination_station CHAR(5) NOT NULL,
  class             TEXT NOT NULL,
  quota             TEXT NOT NULL DEFAULT 'GN',
  booking_status    TEXT NOT NULL DEFAULT 'SEAT_LOCKED',
  -- SEAT_LOCKED → PAYMENT_PENDING → CONFIRMED / PAYMENT_FAILED / WAITLIST / CANCELLED
  booking_type      TEXT NOT NULL DEFAULT 'E_TICKET',
  total_fare        NUMERIC(10,2),
  payment_id        UUID,
  chart_prepared    BOOLEAN DEFAULT FALSE,
  lock_expires_at   TIMESTAMPTZ,
  confirmed_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  INDEX (user_id, travel_date DESC),
  INDEX (train_number, travel_date, booking_status),
  INDEX (pnr)
) PARTITION BY RANGE (travel_date);

CREATE TABLE booking_passengers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        TEXT REFERENCES bookings(booking_id),
  passenger_name    TEXT NOT NULL,
  age               SMALLINT NOT NULL,
  gender            CHAR(1) NOT NULL,
  id_type           TEXT,
  id_number_last4   CHAR(4),
  berth_preference  TEXT,
  allotted_coach    TEXT,
  allotted_berth    TEXT,
  seat_status       TEXT DEFAULT 'PENDING',
  -- PENDING → CONFIRMED / RAC / WL / CANCELLED
  waitlist_number   INT,
  rac_number        INT
);`,
    },
    {
      id: "inventoryService",
      title: "Seat Inventory Service — LLD",
      description: "Redis-backed seat counter management with atomic operations for booking, cancellation and waitlist promotion",
      api: `-- Inventory key structure (Redis) --
train:{train_no}:{travel_date}:{class}:{quota}:available   → integer (available seat count)
train:{train_no}:{travel_date}:{class}:{quota}:rac          → integer (RAC berths available)
train:{train_no}:{travel_date}:{class}:{quota}:wl_count     → integer (total WL bookings)
train:{train_no}:{travel_date}:{class}:{quota}:wl_counter   → integer (next WL number to assign)

-- Query availability --
GET /internal/inventory/{train_no}/{travel_date}/{class}

Response:
{
  "train_number": "12951",
  "travel_date": "2026-06-15",
  "availability": {
    "1A": { "available": 2,  "rac": 0, "waitlist": 5,  "quota": "GN" },
    "2A": { "available": 0,  "rac": 2, "waitlist": 23, "quota": "GN" },
    "3A": { "available": 18, "rac": 0, "waitlist": 0,  "quota": "GN" },
    "SL": { "available": 234,"rac": 0, "waitlist": 0,  "quota": "GN" },
    "3A": { "available": 4,  "rac": 0, "waitlist": 0,  "quota": "TQ" }  // Tatkal
  }
}

-- On cancellation: release seat and promote waitlist --
POST /internal/inventory/release
{ "booking_id": "BK20260601123456", "class": "3A", "quota": "GN" }

Processing (atomic Lua script):
  1. INCR train:{id}:{date}:{class}:{quota}:available
  2. Check waitlist: LLEN wl_queue:{train}:{date}:{class}
  3. If waitlist > 0 AND available > 0:
       next_booking_id = LPOP wl_queue
       DECR available  (re-lock for this waitlist passenger)
       UPDATE bookings SET status = CONFIRMED WHERE booking_id = next_booking_id
       Publish: waitlist.promoted event
  4. Notify promoted passenger via SMS

-- Inventory initialisation (when train schedule is published) --
POST /internal/inventory/seed
{
  "train_number": "12951",
  "travel_date": "2026-06-15",
  "coach_composition": [
    { "coach": "H1",  "class": "3A", "quota": "GN",  "seats": 64 },
    { "coach": "H2",  "class": "3A", "quota": "GN",  "seats": 64 },
    { "coach": "A1",  "class": "2A", "quota": "GN",  "seats": 46 },
    { "coach": "HA1", "class": "3A", "quota": "TQ",  "seats": 20 },
    { "coach": "B1",  "class": "SL", "quota": "GN",  "seats": 72 }
  ]
}

-- Redis inventory for Tatkal seat lock --
MULTI
DECR  train:12951:2026-06-15:3A:TQ:available
SETEX booking:TQ:lock:BK_tatkal_001 600 BK_tatkal_001
EXEC
-- MULTI/EXEC ensures both operations happen atomically`,
    },
    {
      id: "pnrService",
      title: "PNR Service — LLD",
      description: "PNR generation, status tracking, chart preparation and legacy PRS synchronisation",
      api: `GET /v1/pnr/{pnr_number}
-- Public endpoint (no auth required, high cache hit rate)

Response 200:
{
  "pnr": "2456789012",
  "train_number": "12951",
  "train_name": "Mumbai Rajdhani Express",
  "travel_date": "2026-06-15",
  "source": { "code": "NDLS", "name": "New Delhi",  "departure": "16:25" },
  "destination": { "code": "BCT", "name": "Mumbai Central", "arrival": "08:15+1" },
  "booking_status": "CONFIRMED",
  "chart_prepared": true,
  "passengers": [
    {
      "number": 1,
      "name": "Ra** Ku***",      // masked for privacy
      "booking_status": "CNF",   // CNF / RAC1 / WL12 / REGRET
      "coach": "H1",
      "berth": "32",
      "berth_type": "LB"
    },
    {
      "number": 2,
      "name": "Pr*** Ku***",
      "booking_status": "CNF",
      "coach": "H1",
      "berth": "31",
      "berth_type": "LB"
    }
  ],
  "fare_paid": 3012.00,
  "booking_date": "2026-06-01",
  "class": "3A",
  "quota": "GN"
}

-- PNR generation --
CREATE SEQUENCE pnr_northern_seq START WITH 2000000000 INCREMENT BY 1;
-- Zone prefix: 1=CR, 2=ER, 3=NR, 4=NER, 5=NFR, 6=SR, 7=SCR, 8=SER, 9=WR, 0=WCR

FUNCTION generate_pnr(zone_code INT) RETURNS CHAR(10):
  seq = NEXTVAL('pnr_' || zone_name || '_seq')
  RETURN zone_code || LPAD(seq::text, 9, '0')

-- Chart preparation (runs T-4 hours) --
POST /internal/chart/prepare/{train_number}/{travel_date}

Algorithm:
1. Lock all WL/RAC bookings for this train/date (no new changes)
2. Identify confirmed passengers per coach
3. Run berth assignment:
   FOR each coach:
     Sort passengers by booking time (earliest booking → preference priority)
     For each passenger with berth preference:
       IF preferred berth type available in coach → assign
       ELSE assign next available berth sequentially
     Special rules:
       Passengers in same booking → same coupe/cabin preferred
       Female solo travellers → avoid Side Upper berth (rule from 2014)
       Senior citizens (60+) → lower berths mandatory if available
4. Cancel all remaining WL tickets (no RAC/confirmed slots available)
   Issue auto-refunds for cancelled WL bookings
5. Upload chart to S3: chart/{train}/{date}/chart.json
6. Update all booking_passengers records with allotted_coach + allotted_berth
7. Notify: "Chart prepared for 12951 on 15-Jun. Your berths: H1/32, H1/31"

-- PNR cache (Redis) --
SET pnr:2456789012 {serialised_response} EX 1800
-- Invalidate on: status change, chart preparation, cancellation
DEL pnr:2456789012  (on any booking mutation event via Kafka consumer)`,
    },
    {
      id: "searchService",
      title: "Train Search Service — LLD",
      description: "Multi-modal train search with real-time availability, quota visibility and route computation",
      api: `GET /v1/trains/search?from=NDLS&to=BCT&date=2026-06-15&class=3A&quota=GN

Response 200:
{
  "trains": [
    {
      "train_number": "12951",
      "train_name": "Mumbai Rajdhani Express",
      "type": "Rajdhani",
      "days_of_run": ["Mon", "Wed", "Thu", "Sat"],
      "source": {
        "station_code": "NDLS",
        "station_name": "New Delhi",
        "departure_time": "16:25",
        "day": 1,
        "distance_from_origin_km": 0
      },
      "destination": {
        "station_code": "BCT",
        "station_name": "Mumbai Central",
        "arrival_time": "08:15",
        "day": 2,
        "distance_from_origin_km": 1384
      },
      "duration": "15h 50m",
      "distance_km": 1384,
      "availability": {
        "1A":  { "status": "AVAILABLE", "count": 3,  "fare": 5085 },
        "2A":  { "status": "RAC",       "rac_count": 4, "fare": 3055 },
        "3A":  { "status": "AVAILABLE", "count": 18, "fare": 2130 },
        "3A_TQ": { "status": "AVAILABLE", "count": 8, "fare": 2855, "quota": "TQ" }
      },
      "pantry_car": true,
      "runs_on_date": true
    }
  ],
  "total": 12,
  "search_date": "2026-06-15"
}

-- Database schema --
CREATE TABLE trains (
  train_number    TEXT PRIMARY KEY,
  train_name      TEXT NOT NULL,
  train_type      TEXT,          -- Rajdhani, Shatabdi, Express, Mail, etc.
  days_of_run     TEXT[],        -- ["Mon","Wed","Thu","Sat"]
  origin_station  CHAR(5),
  destination_station CHAR(5),
  pantry_car      BOOLEAN DEFAULT FALSE,
  active          BOOLEAN DEFAULT TRUE
);

CREATE TABLE train_routes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  train_number    TEXT REFERENCES trains(train_number),
  station_code    CHAR(5) NOT NULL,
  sequence_number SMALLINT NOT NULL,      -- order of stops
  arrival_time    TIME,
  departure_time  TIME,
  day_number      SMALLINT DEFAULT 1,     -- for multi-day journeys
  halt_minutes    SMALLINT DEFAULT 2,
  distance_km     INT,
  INDEX (train_number, sequence_number),
  INDEX (station_code, train_number)
);

CREATE TABLE stations (
  station_code    CHAR(5) PRIMARY KEY,
  station_name    TEXT NOT NULL,
  city            TEXT,
  state           TEXT,
  zone            TEXT,
  latitude        NUMERIC(9,6),
  longitude       NUMERIC(9,6),
  INDEX USING GIN (to_tsvector('english', station_name))  -- for name search
);

-- Elasticsearch for search --
PUT /trains_routes
{
  "mappings": {
    "properties": {
      "train_number":    { "type": "keyword" },
      "train_name":      { "type": "text" },
      "station_pairs":   { "type": "keyword" },  // ["NDLS_BCT", "NDLS_ST", ...]
      "days_of_run":     { "type": "keyword" },
      "train_type":      { "type": "keyword" }
    }
  }
}
-- Query: find all trains with station_pair "NDLS_BCT" running on Monday
{
  "query": {
    "bool": {
      "filter": [
        { "term": { "station_pairs": "NDLS_BCT" } },
        { "term": { "days_of_run":   "Mon" } }
      ]
    }
  }
}`,
    },
    {
      id: "tatkalQueue",
      title: "Tatkal Queue Service — LLD",
      description: "Fair queue management for the 10 AM Tatkal booking surge with virtual waiting room",
      api: `-- Tatkal booking initiation (at 10:00:00 AM) --
POST /v1/booking/tatkal/queue
Authorization: Bearer {jwt}
{
  "train_number": "12951",
  "travel_date": "2026-06-15",
  "class": "3A",
  "passengers": [...],
  "captcha_token": "03AGdBq25XzRx...",
  "otp": "847291"
}

Response 202 (queued):
{
  "queue_token": "TQ_20260601_12951_3A_000142450",
  "queue_position": 142450,
  "estimated_wait_seconds": 480,
  "status": "QUEUED",
  "poll_url": "/v1/booking/tatkal/status/TQ_20260601_12951_3A_000142450"
}

Response 429 (queue full):
{
  "error": "QUEUE_FULL",
  "message": "Tatkal queue for 12951 3A is full. Try again in 2 minutes."
}

-- Queue position polling (SSE) --
GET /v1/booking/tatkal/status/{queue_token}
Accept: text/event-stream

data: {"position": 142450, "ahead": 142449, "estimated_wait_s": 480, "status": "QUEUED"}
data: {"position": 138200, "ahead": 138199, "estimated_wait_s": 350, "status": "QUEUED"}
data: {"position": 1,      "ahead": 0,      "estimated_wait_s": 0,   "status": "YOUR_TURN"}
data: {"position": 0, "status": "BOOKING_WINDOW_OPEN", "booking_token": "BT_abc123", "expires_in_s": 180}

-- Queue implementation --
Redis Sorted Set per train/class:
  Key: tatkal_queue:12951:3A:2026-06-15
  Score: timestamp_nanoseconds (arrival order)
  Member: queue_token

On request arrival:
  ZADD tatkal_queue:12951:3A:2026-06-15 {timestamp_ns} {queue_token}
  Position = ZRANK tatkal_queue:12951:3A:2026-06-15 {queue_token}

Queue processor (runs at 10:00:00 AM, 5000 bookings/second):
  WHILE seats_available:
    token = ZPOPMIN tatkal_queue:12951:3A:2026-06-15
    Publish via SSE: "YOUR_TURN" to token's SSE connection
    token gets 3 minutes to complete booking
    If no booking in 3 min: slot passes to next in queue

-- Rate limiting per user (Redis Token Bucket) --
FUNCTION check_rate_limit(user_id):
  key = "tatkal_rate:" + user_id
  current = GET key
  IF current IS NULL:
    SET key 1 EX 5    -- 1 attempt, expires in 5 seconds
    RETURN ALLOWED
  ELSE:
    RETURN RATE_LIMITED  -- already attempted in last 5 seconds

-- Anti-bot: per-account daily Tatkal limit --
FUNCTION check_daily_limit(user_id, date):
  key = "tatkal_daily:" + user_id + ":" + date
  count = INCR key
  IF count == 1: EXPIRE key 86400
  IF count > 2: RETURN LIMIT_EXCEEDED  -- max 2 Tatkal bookings per day
  RETURN ALLOWED`,
    },
    {
      id: "serviceMesh",
      title: "Service Mesh — Envoy/Istio Config (LLD)",
      description: "Istio configuration for circuit breaking on Payment Service, canary rollouts for Search Service, and zero-trust mTLS across Booking/Payment/PNR",
      api: `# DestinationRule — circuit breaking on Payment Service
# A stuck UPI/card gateway integration must not hold Tatkal seat locks
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: payment-service-circuit-breaker
  namespace: prod
spec:
  host: payment-service.prod.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 500
      http:
        http1MaxPendingRequests: 200
        maxRequestsPerConnection: 10
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
    loadBalancer:
      simple: LEAST_REQUEST

---
# VirtualService — canary rollout for Search Service ranking model
# Deployed in the 2-4 AM window, validated before the next Tatkal opening
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: search-service-canary
  namespace: prod
spec:
  hosts:
    - search-service.prod.svc.cluster.local
  http:
    - match:
        - headers:
            x-search-canary:
              exact: "true"
      route:
        - destination:
            host: search-service.prod.svc.cluster.local
            subset: v2
    - route:
        - destination:
            host: search-service.prod.svc.cluster.local
            subset: v1
          weight: 95
        - destination:
            host: search-service.prod.svc.cluster.local
            subset: v2
          weight: 5
      retries:
        attempts: 2
        perTryTimeout: 150ms
        retryOn: 5xx,reset,connect-failure

---
# AuthorizationPolicy — only Booking Service may call Payment Service
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: payment-service-access
  namespace: prod
spec:
  selector:
    matchLabels:
      app: payment-service
  action: ALLOW
  rules:
    - from:
        - source:
            principals:
              - "cluster.local/ns/prod/sa/booking-service"

---
# PeerAuthentication — mTLS STRICT across the booking namespace
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: prod
spec:
  mtls:
    mode: STRICT`,
      internals: `SIDECAR INJECTION SCOPE: Envoy sidecars are injected into Search,
Booking, Payment, PNR and Train Track Service — the five microservices
sitting behind the API Gateway. The Tatkal Queue runs inside Booking
Service's namespace and shares its sidecar configuration.

CIRCUIT BREAKING ON PAYMENT SERVICE: this is the highest-value breaker in
the entire fleet. outlierDetection ejects an unhealthy Payment Service
backend after 5 consecutive 5xx responses within a 10s window, for 30s,
capped at 50% of the pool. Without this, Booking Service workers would
block on a 30s gateway timeout while still holding a Redis seat lock —
during Tatkal, that's the difference between a seat being held for 200ms
vs 30 seconds, a 150x difference in lock contention.

CANARY FOR SEARCH SERVICE: ranking and availability-display changes are
the riskiest deploys because they run right before Tatkal opens. The
VirtualService routes traffic tagged x-search-canary: "true" (internal
QA traffic) to v2 first, then a 95/5 production split for a few hours
overnight, with automatic rollback if error rates rise — all without a
second load balancer or duplicate service.

mTLS + AUTHORIZATION POLICY: PeerAuthentication in STRICT mode encrypts
every Booking↔Payment↔PNR call carrying passenger PII (names, Aadhaar-
linked IDs, payment references). The AuthorizationPolicy on Payment
Service is a single-line statement of a critical invariant — "only
Booking Service initiates payments" — enforced at the network layer, so
a bug in Search Service or Train Track Service can never accidentally (or
maliciously) hit the payment path.

CONTROL-PLANE-DOWN FAILURE MODE: if istiod becomes unreachable during the
Tatkal window, every sidecar continues enforcing its last pushed
configuration — circuit breakers, mTLS and authorization rules all keep
working. What's lost is the ability to push NEW rules, which is why all
mesh config changes for a given day are frozen well before 9 AM, the same
discipline IRCTC already applies to its own deploy freeze around Tatkal.`,
    },
  ],
};

export const IRCTC_QNA = [
  {
    id: "irctcq1",
    category: "Architecture",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["IRCTC", "MakeMyTrip", "Cleartrip", "Amazon"],
    question: "Design a railway ticketing system like IRCTC. Walk through the key components.",
    answer: `IRCTC is fundamentally a seat inventory management system with two extreme constraints: Tatkal thundering herd (1.5M concurrent users for 200 seats) and legacy PRS (mainframe) integration.

CORE COMPONENTS:

1. SEARCH SERVICE:
   Elasticsearch: train schedules indexed with station_pair arrays (e.g. ["NDLS_BCT", "NDLS_ST"])
   Query: filter by station pair + day of week → fast because pair is pre-computed
   Real-time availability: Redis lookup per train/date/class/quota (separate from search)
   Cache search results: train schedules change rarely → CDN + Redis with 24-hour TTL

2. INVENTORY SERVICE (most critical):
   Seat counters in Redis: DECR is atomic → prevents race conditions at the 10 AM rush
   Each counter: train:{no}:{date}:{class}:{quota}:available
   On DECR → if result < 0 → INCR (rollback) → "No seats"
   Never read inventory from PostgreSQL during active booking — Redis only

3. BOOKING FLOW (two-phase):
   Phase 1 — Lock: atomic Redis DECR + create SEAT_LOCKED record in PostgreSQL (< 200ms)
   Phase 2 — Pay: 10-minute window for payment
   On payment success: assign PNR, send confirmation
   On payment failure/timeout: INCR (release) + promote next waitlist passenger

4. TATKAL QUEUE:
   At 10 AM: all requests go into Redis sorted set (ZADD with nanosecond timestamp)
   Queue processor drains at 5,000 req/second (controlled)
   Fair ordering: arrival time, not network speed
   Per-user: 1 attempt/5 seconds + 2 Tatkal bookings/day limit

5. WAITLIST PROMOTION:
   On cancellation: Kafka event → Inventory Service releases seat → promotes top WL to confirmed → SMS notification
   This propagation happens within 60 seconds of cancellation

6. PRS INTEGRATION:
   IRCTC is a layer on top of Railways' 1980s PRS (mainframe)
   Confirmed bookings queued via Kafka → sent to PRS for physical seat allocation
   Berth assignment: PRS computes at chart preparation (T-4 hours) → IRCTC updates records

KEY INSIGHT:
   Redis atomic operations (DECR, Lua scripts) are the entire foundation of seat locking.
   Without them, IRCTC would have double-booking at every Tatkal window.`,
  },
  {
    id: "irctcq2",
    category: "Concurrency",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["IRCTC", "Flipkart", "Amazon", "Meesho"],
    question: "How do you prevent double-booking of train seats when 1.5 million users hit the endpoint simultaneously?",
    answer: `This is a distributed inventory management problem. The naive solution (read availability → if available → book) has a classic TOCTOU (Time Of Check To Time Of Use) race condition.

THE RACE CONDITION:
  Thread A: reads available=1 → "seat available"
  Thread B: reads available=1 → "seat available"
  Thread A: books seat → available=0
  Thread B: books seat → available=-1 → DOUBLE BOOKING

SOLUTION: Redis atomic operations

Option 1 — DECR (simplest):
  DECR train:12951:2026-06-15:3A:GN:available
  Returns new value:
    ≥ 0 → seat locked (you got it)
    < 0 → INCR to rollback, return "no seats"
  Why this works: Redis is single-threaded. DECR is atomic. No two clients can DECR simultaneously.

Option 2 — Lua script (more complex logic):
  Redis Lua scripts execute atomically (like a DB transaction):
    local available = tonumber(redis.call("GET", seat_key))
    if available and available > 0 then
      redis.call("DECR", seat_key)
      redis.call("SETEX", lock_key, 600, booking_id)
      return 1  -- success
    end
    return 0  -- fail
  Lua: handles DECR + lock key creation as one atomic operation

Option 3 — SELECT FOR UPDATE (PostgreSQL fallback):
  BEGIN;
  SELECT available_count FROM seat_inventory WHERE ... FOR UPDATE;
  -- lock acquired, other transactions block here
  UPDATE SET available_count = available_count - 1 WHERE available_count > 0;
  COMMIT;
  Problem: serialised writes → 50-100 bookings/second max (unacceptable for Tatkal)
  Use only as fallback when Redis is down

TATKAL QUEUE (prevents the thundering herd entirely):
  Don't let 1.5M requests hit DECR simultaneously
  Queue all requests → process sequentially at 5,000/second
  Same atomic safety + much less pressure on Redis
  Bonus: fair ordering by arrival time

IDEMPOTENCY (prevents duplicate from user side):
  User taps "Book" twice (network stutter) → both requests carry same idempotency_key
  Redis SETNX on idempotency_key → only first request proceeds
  Second request: key already exists → return existing booking_id`,
  },
  {
    id: "irctcq3",
    category: "Waitlist",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["IRCTC", "BookMyShow", "OYO"],
    question: "How does the IRCTC waitlist and RAC system work? How do you propagate cancellations?",
    answer: `WL/RAC is a priority queue problem with complex promotion rules. A cancellation must instantly find the next eligible passenger and promote them.

STATE MACHINE:
  AVAILABLE → CONFIRMED (direct booking)
  CONFIRMED → RAC (if confirmed seat freed + RAC passengers present)
  RAC → CONFIRMED (if RAC berth freed)
  WL → RAC (if RAC berth freed)
  WL → WL position decrements (when ahead-of-you passenger gets confirmed)
  WL → CANCELLED + REFUND (at chart preparation if not confirmed)

DATA STRUCTURES:
  Per train/class/date:
    Redis: available_count, rac_count, wl_queue (list of booking_ids in WL order)
    PostgreSQL: booking_passengers table (current status, WL/RAC number)

ON CANCELLATION (event-driven):
  Kafka event: booking.cancelled → consumed by Waitlist Promotion Service

  Promotion algorithm (runs within 60 seconds):
  1. Determine what was freed:
       If CONFIRMED seat freed: available_count++ in Redis
       If RAC berth freed: rac_count++ in Redis

  2. Check promotion chain:
       If rac_count > 0 AND wl_queue not empty:
         → Pop top WL from queue → promote to RAC
         → Decrement rac_count
         → Notify passenger: "WL 3 → RAC 1 for train 12951"

       If available_count > 0 AND rac_count queue not empty:
         → Promote top RAC to CONFIRMED
         → available_count--
         → Free the RAC berth
         → Loop: now rac_count has a free slot → promote next WL to RAC

  3. Update PostgreSQL: UPDATE booking_passengers SET seat_status = new_status

CHART PREPARATION (T-4 hours):
  Freeze: no more changes accepted
  All remaining WL passengers: auto-cancelled + full refund
  Physical chart printed at station

KEY INTERVIEW POINTS:
  1. Cancellations are async (Kafka) — don't block the cancellation API on promotion
  2. Promotion is single-threaded per train/class/date (queue consumer) — no race conditions
  3. At peak festival times: 10,000 cancellations/hour → queue depth matters
  4. Passengers are notified within 60 seconds of promotion (SMS via async consumer)`,
  },
  {
    id: "irctcq4",
    category: "Scale",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["IRCTC", "Razorpay", "Zepto"],
    question: "Design the Tatkal booking system to handle 1.5 million concurrent users fairly without crashing.",
    answer: `Tatkal is the hardest engineering problem in IRCTC: a time-boxed inventory release where everyone shows up simultaneously.

PROBLEM CHARACTERISTICS:
  1.5M concurrent requests → few hundred seats available
  99.99% of requests will fail (no seats)
  Fairness: earlier arrival time should have priority over better network connection
  No double-booking under any load
  System must remain available throughout (not just for the lucky few)

SOLUTION: Virtual Queue + Controlled Draining

Phase 0 — Pre-Tatkal (9:50 AM – 10:00 AM):
  Users load the train/class/date selection page
  Page pre-loads: quota availability (from Redis), fare, passenger form
  Heavy caching: availability pages cached 30 seconds, form pre-rendered client-side
  Goal: no requests hitting origin until 10 AM

Phase 1 — Queue ingestion (10:00:00 AM):
  Endpoint: POST /v1/booking/tatkal/queue
  For each valid request (passed CAPTCHA + OTP):
    ZADD tatkal_queue:{train}:{date}:{class} {nanosecond_ts} {queue_token}
    Return 202: { queue_position, estimated_wait }
  Invalid requests (bot score, rate limit): 429 immediately
  Queue capacity: 500K per train/class (beyond this → 429 QUEUE_FULL)

Phase 2 — Controlled draining (10:00:00 AM onwards):
  Queue processor: single Kafka consumer per train/class/date (ensures ordering)
  Rate: 5,000 dequeues/second
  For each dequeued token:
    Atomic seat lock (Redis Lua DECR)
    If lock success: SSE push "YOUR_TURN" + booking_token (3-minute window)
    If no seats: SSE push "SORRY_NO_SEATS" (fail fast, stop processing queue)

Phase 3 — Booking completion (user's turn):
  User gets booking_token → 3 minutes to fill passenger details + pay
  Token expires → slot passes to next in queue
  If payment succeeds → CONFIRMED
  If payment fails → seat released → next in queue gets it

WHY THIS WORKS:
  Only 5,000 requests/second touch actual seat inventory (controlled)
  1.5M requests are absorbed by Redis queue (append-only ZADD is extremely fast)
  Fair: sorted set preserves arrival order
  Redis queue capacity: 500K × ~200 bytes per token = 100MB (trivial for Redis)

ANTI-PATTERNS TO AVOID:
  ❌ Let all 1.5M hit PostgreSQL → immediate DB death
  ❌ Let all 1.5M hit Redis DECR simultaneously → Redis struggles at this rate
  ❌ In-memory queue on a single server → single point of failure
  ✓ Redis sorted set: distributed, durable, ordered`,
  },
  {
    id: "irctcq5",
    category: "PNR",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["IRCTC", "MakeMyTrip", "Cleartrip"],
    question: "Design the PNR status system. It gets 50M queries/day but only 1M bookings/day. How do you handle the read amplification?",
    answer: `PNR status is a read-heavy workload with extreme read:write amplification — 50:1. Classic caching problem.

WHY SO MANY PNR READS?
  Each passenger checks PNR status multiple times:
    After booking: "Is it confirmed?"
    Next day: "Still confirmed?"
    Morning of travel: "What's my berth?"
    3rd party apps (WhatsApp bots, journey planners): automated polling
  1 booking → 50 reads on average

CACHE STRATEGY (layered):

L1 — CDN Edge Cache (Cloudflare/CloudFront):
  For chart-prepared trains (berths assigned, no more changes):
    Cache PNR response at CDN edge for 2 hours
    Cache-Control: public, max-age=7200
    This serves ~30% of all PNR queries from CDN, zero origin hits
  For active (not yet chart-prepared) PNRs:
    Cache-Control: no-store (content changes with WL promotions)

L2 — Redis (hot PNR store):
  Cache all PNR responses: SET pnr:{number} {json} EX 1800 (30 minutes)
  Invalidation: Kafka consumer listens for:
    booking.status_changed → DEL pnr:{number}
    waitlist.promoted → DEL pnr:{number}
    chart.prepared → update cache with berth details + extend TTL to 7200
  Cache hit rate: ~85% (most queries are for recently booked/checked PNRs)

L3 — PostgreSQL Read Replica:
  On cache miss: query read replica
  Write to Redis cache before returning response
  Read replicas: 3 dedicated for PNR queries, isolated from booking write path

WRITE-THROUGH ON STATUS CHANGE:
  When booking status changes: don't just DEL the cache key
  Immediately write new response to cache (write-through)
  This prevents cache stampede: 10,000 users checking same popular train's PNRs
  On chart preparation: all PNRs for that train bulk-updated in Redis pipeline

EXTERNAL API RATE LIMITING:
  3rd party apps (RailYatri, etc.) account for 30% of PNR queries
  Rate limit: 1,000 req/minute per API key
  Separate quota from web traffic (don't let API bots degrade user experience)
  Charge for API access above free tier (monetisation + natural throttle)

READ REPLICA SIZING:
  50M reads/day = 580 reads/second average
  With 85% cache hit: 87 reads/second to DB
  At peak (7-9 PM departure time): 5× = 430 reads/second to DB
  1 PostgreSQL read replica handles 5,000 reads/second → comfortably served by 1 replica`,
  },
  {
    id: "irctcq6",
    category: "Estimation",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["IRCTC", "MakeMyTrip", "Cleartrip"],
    question: "Walk through the back-of-the-envelope numbers for IRCTC's Tatkal window. How do they justify the queue + controlled-drain design?",
    answer: `Start from the headline numbers and derive what each architectural piece is actually absorbing.

ASSUMPTIONS:
  1.5M+ concurrent users in the Tatkal window (10:00:00–10:00:02 AM)
  800K–1.2M total online bookings/day
  150K+ cancellations/day
  50M+ PNR status checks/day vs ~1M bookings/day (50:1 read:write)
  A popular train's Tatkal 3A quota ≈ 200 seats

1. ARRIVAL RATE: 1.5M concurrent users firing within a 2-second window
   ≈ 750,000 req/sec instantaneous.
   → No atomic Redis DECR survives this directly. This is exactly why
   the Tatkal Queue exists: an append-only ZADD into a Redis sorted set
   absorbs hundreds of thousands of writes/sec, while the queue
   processor drains at a controlled 5,000 bookings/sec.

2. REJECTION RATE: ~200 seats vs 400K-600K requests in the first 2
   seconds → >99.96% of requests are doomed.
   → The queue processor fails FAST: the instant inventory hits zero,
   "SORRY_NO_SEATS" is pushed via SSE to everyone still waiting, instead
   of letting hundreds of thousands of requests sit in a 3-minute
   booking window for nothing.

3. PNR READ LOAD: 50M reads/day ÷ 86,400s ≈ 580/sec average, ~2,900/sec
   at evening peak (5x).
   → With 85% Redis cache hit rate, only ~87-435 reads/sec reach
   PostgreSQL — 1 read replica (5,000/sec capacity) easily covers it,
   which is why PNR reads are isolated onto their own replicas, away
   from the booking write path.

4. AVERAGE VS PEAK: 800K-1.2M bookings/day ÷ 86,400s ≈ 9-14
   bookings/sec average — vs the Tatkal Queue's provisioned 5,000/sec.
   → That's a >300x burst multiplier arriving at a known time every
   day. Average throughput is the wrong number to provision for; the
   Tatkal Queue and Booking Service fleets are pre-scaled for the burst,
   not autoscaled in response to it (autoscaling reacts too slowly for
   a 2-minute spike).

5. WAITLIST PROPAGATION: 150K cancellations/day ≈ 1.7/sec average, but
   festival peaks hit ~10,000/hour ≈ 2.8/sec, each triggering a WL→RAC→
   Confirmed promotion chain that must finish within 60 seconds.
   → The Waitlist Promotion Service (one Kafka consumer per
   train/class/date) must keep consumer lag near zero even during these
   bursts, or SMS confirmations arrive late.

Interview punch line: 750,000 req/sec maps onto the Tatkal Queue's Redis
sorted set + 5,000/sec controlled drain; the 99.96% rejection rate is why
it fails fast; 50M PNR reads/sec → 85% cache hit → ~435/sec to Postgres
maps onto the L1/L2/L3 PNR cache hierarchy; and the >300x burst multiplier
is the single number that explains why IRCTC pre-scales for Tatkal instead
of trusting autoscaling.`,
    followups: [
      "Why is pre-scaling preferred over autoscaling for the Tatkal window specifically?",
      "If the queue processor's 5,000/sec drain rate were doubled to 10,000/sec, what else in the system needs to scale with it?",
      "How would you validate these estimates in production without risking a real Tatkal window?",
    ],
  },
  {
    id: "irctcq7",
    category: "Architecture",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["IRCTC", "MakeMyTrip", "Razorpay"],
    question: "IRCTC has Search, Booking, Payment, PNR and Train Track Service all calling each other behind the gateway. Would you put these behind a service mesh? What would it actually buy you?",
    answer: `Yes — and the highest-value win is on the Booking → Payment hop, with PNR Service's external-partner traffic as the second.

WHY A MESH FITS HERE:
  Booking Service → Payment Service is the highest-stakes synchronous call
    in the system — a stuck payment gateway during Tatkal must not
    cascade into stuck booking workers holding seat locks.
  PNR Service is hammered by external API partners (MakeMyTrip, Paytm,
    RailYatri) — 50M checks/day, far more callers than just the app —
    so it needs the same network-level isolation a public-facing service
    gets.
  Search Service and Train Track Service ship ranking/ETA model updates
    regularly; a bad deploy the night before a Tatkal morning is
    catastrophic, so canary rollouts matter more here than almost
    anywhere else in the stack.

DATA PLANE: an Envoy sidecar sits next to every instance of Search,
  Booking, Payment, PNR and Train Track Service. All inter-service calls —
  Booking→Payment, Booking→PNR, Search→Train Track — are intercepted by
  these sidecars for mTLS, retries, timeouts, load balancing and circuit
  breaking, with zero application code changes.

CONTROL PLANE: istiod pushes routing rules, TLS certs and circuit-breaker
  thresholds to every sidecar. "Payment Service trips after 5 consecutive
  5xx" is declared once and applies fleet-wide.

WHAT THIS BUYS:
  Circuit breaking on Payment Service: outlier detection ejects an
    unhealthy backend after 5 consecutive 5xx in 10s. Without this,
    Booking Service workers block on a 30s gateway timeout while still
    holding a Redis seat lock — during Tatkal that's a 150x difference
    in lock-hold time (200ms vs 30s).
  Canary for Search Service: a new ranking model is rolled out to 5% of
    traffic at 2-4 AM, validated, then promoted via traffic-split config
    — no duplicate infrastructure.
  mTLS everywhere: Aadhaar-linked passenger data moving between Booking,
    PNR and Payment Service is encrypted in transit by default.
  AuthorizationPolicy: only Booking Service may call Payment Service — a
    bug in Search or Train Track Service hitting the payment path
    directly is rejected at the sidecar.
  Tracing: a single Tatkal booking — Gateway → Booking → Inventory (Redis)
    → Payment → PNR → Kafka — gets one trace ID across all hops.

TRADE-OFFS:
  ~1-2ms sidecar latency per hop is fine against the <4s booking SLA but
  tight against the <200ms internal seat-lock budget, so mesh timeouts
  need per-route tuning.
  The control plane must be frozen well before 9 AM — sidecars keep
  enforcing last-known config if istiod is unreachable, but can't accept
  new policy mid-surge.
  The Oracle PRS mainframe sync stays OUTSIDE the mesh entirely — it's a
  legacy batch integration governed by its own maintenance window, not a
  Kubernetes service.`,
    followups: [
      "How would you tune the mesh's own retry/timeout config differently for the Booking→Payment hop vs the Search→Train Track hop?",
      "What's your rollback plan if a circuit-breaker misconfiguration starts ejecting healthy Payment Service pods during Tatkal?",
      "Why exclude the PRS mainframe sync from the mesh — what would it take to bring it in, and is that worth doing?",
    ],
  },
];
