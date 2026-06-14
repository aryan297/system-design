export const BOOKMYSHOW_HLD = {
  title: "BookMyShow — High Level Design",
  subtitle: "Movie & event ticketing — 100M+ users, 4,000+ screens, seat-level inventory, real-time booking under blockbuster-release load",
  overview: `BookMyShow is India's largest entertainment ticketing platform — movies, concerts, plays, comedy shows, and sports across 4,000+ screens and thousands of event venues in 650+ cities. Beyond ticketing, it runs a full Live Events vertical (festivals, concerts, stand-up tours) with its own demand patterns.

The core engineering problem is fundamentally a SEAT-LEVEL INVENTORY CONSISTENCY problem under extremely uneven demand. Unlike a marketplace where demand is roughly continuous (ride requests, food orders), BookMyShow's hardest traffic is SCHEDULED and BURSTY: a blockbuster's advance booking "opens" at a publicly announced time, and a seat map can go from 100% available to majority-booked within minutes — with up to a million people trying to lock the same few thousand seats simultaneously, and zero tolerance for selling the same physical seat twice.

Other hard problems: hyperlocal discovery across movies, events, and venues with real-time showtime availability; a booking saga that must atomically combine seat-lock + payment + confirmation under a strict expiring hold; pricing that is partly REGULATED (several states cap multiplex ticket prices) and partly dynamic (event tiers, convenience fees); and a virtual waiting room that absorbs a millions-strong concurrent spike at a known instant without taking down the rest of the platform.`,

  metrics: [
    { label: "Monthly active users",      value: "100M+",   note: "movies + events + sports" },
    { label: "Screens / cities",          value: "4,000+",  note: "across 650+ cities" },
    { label: "Tickets per year",          value: "200M+",   note: "≈ 550K/day average" },
    { label: "Shows per day",             value: "75,000+", note: "movies + live events" },
    { label: "Peak concurrent users",     value: "1M+",     note: "blockbuster booking-open" },
    { label: "Seat-hold (lock) TTL",      value: "8 min",   note: "480s, auto-release" },
    { label: "Booking confirmation SLA",  value: "< 5s",    note: "hold → pay → confirm" },
    { label: "Avg seats per booking",     value: "~3",      note: "drives convenience fee model" },
  ],

  diagram: `
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                               │
│     Mobile App (iOS/Android) · Web App · Cinema Partner POS / Kiosk     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │  HTTPS / WebSocket (live seat map + queue position)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      API GATEWAY (Kong / AWS ALB)                       │
│         SERVICE MESH — Envoy sidecar attached to every service          │
│    Auth (JWT) · Rate Limiting · Virtual Waiting Room · City Routing     │
│      mTLS · Load Balancing · Retries · Circuit Breaking · Tracing       │
└───────────┬────────────┬───────────┬───────────┬────────────┬───────────┘
            │            │           │           │            │
            ▼            ▼           ▼           ▼            ▼
┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌─────────┐
│ Search  │ │  Show   │ │   Seat   │ │ Booking │ │ Payment │
│ Service │ │ Service │ │ Lock Svc │ │ Service │ │ Service │
└────┬────┘ └────┬────┘ └─────┬────┘ └────┬────┘ └────┬────┘
     │           │            │           │           │
     ▼           ▼            ▼           ▼           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             KAFKA EVENT BUS                             │
│    seat.locked · booking.confirmed · payment.success · show.created     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                               DATA LAYER                                │
│ PostgreSQL (bookings, shows, venues) · Redis (seat locks, queue, cache) │
│   Elasticsearch (movie/event search) · S3 (posters, e-tickets) · CDN    │
└─────────────────────────────────────────────────────────────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Discovery & Show Listings",
      sections: [
        {
          title: "Hyperlocal Movie & Event Search",
          content: `City is the PRIMARY filter in BookMyShow — selected at app launch (or via GPS) before anything else loads. Everything downstream (movies, events, cinemas, showtimes) is scoped to that city, then optionally to a neighbourhood.

SEARCH ARCHITECTURE:
  Elasticsearch index \`shows\`, denormalised per (movie/event, venue, screen, date):
    GET /v1/discover?city=mumbai&date=2026-06-13&q=&format=IMAX&language=hindi

  Query execution:
    Step 1: filter by city_id + date (eliminates >99% of documents)
    Step 2: text match on movie/event title (fuzzy, multi-language transliteration:
            "avengers" matches "द एवेंजर्स")
    Step 3: filter by format (2D/3D/4DX/IMAX), language, genre
    Step 4: rank by: showtime proximity to "now" + venue rating + popularity (bookings/hr)

RESULT GROUPING (not a flat list):
  Movie → list of Cinemas in city → Showtimes grouped by format/language
  Event → Venue → list of Date/Time slots (single performance vs multi-date run)

"NOW SHOWING" vs "COMING SOON":
  Now Showing: shows with showtime > now, bookable immediately
  Coming Soon / Advance Booking: movie released for booking ahead of its public
  "booking opens" timestamp — this is the trigger for Phase 3's virtual waiting room

REAL-TIME AVAILABILITY BADGES:
  "Filling Fast" / "Few Seats Left" / "SOLD OUT" computed from Seat Lock
  Service's available-seat counters, cached in Redis with a 5-second refresh —
  NOT from Elasticsearch (too slow to reflect live seat-map changes)
  Hard filter: shows with 0 available seats are still shown but marked SOLD OUT
  (unlike Zomato hiding OOS items — here "sold out for THIS show" is useful
  information, since other showtimes for the same movie may have seats)

CACHING:
  City-level "Now Showing" list: Redis, 60s TTL (changes only when shows are added)
  Per-movie showtime grid: Redis, 10s TTL (availability badges shift quickly)
  Search-as-you-type suggestions: Redis-backed trie of movie/event titles per city`,
        },
        {
          title: "Show Listings & Showtime Management",
          content: `A "show" is the atomic bookable unit: (movie OR event) × venue × screen × date × time. Cinemas and event organisers manage shows through a partner portal that feeds the Show Service.

SHOW CREATION PIPELINE:
  1. Venue onboarding: each screen/hall has a SEAT MAP TEMPLATE — rows, seat
     numbers, and CATEGORY assignment (Recliner / Premium / Executive / Normal)
  2. Cinema partner creates a show: selects movie, screen, date, time, language,
     format → Show Service validates no time overlap with another show on
     that screen (with cleaning/changeover buffer, typically 15-30 min)
  3. On show creation: Show Service materialises a SEAT MAP INSTANCE for that
     show — a copy of the template with per-category pricing for this specific
     show (weekday matinee ≠ weekend prime-time pricing) and all seats AVAILABLE
  4. seat map instance is written to Postgres (durable) AND mirrored into Redis
     (the live, mutable copy used for locking — see Phase 2)

SHOW LIFECYCLE:
  DRAFT → PUBLISHED (bookable) → IN_PROGRESS (showtime reached, booking closes
  ~15 min before) → COMPLETED → ARCHIVED
  Side exit: CANCELLED (venue technical issue, censor/legal hold) — triggers
  bulk refund for all CONFIRMED bookings on that show

SCREEN & VENUE METADATA:
  Screen: total seats, category layout, accessibility seats (wheelchair),
  amenities (Dolby Atmos, recliner count)
  Venue: address, geo-coordinates (for hyperlocal search), operating hours,
  F&B menu (for combo upsells in Phase 4)

EVENT-SPECIFIC DIFFERENCES:
  Events (concerts, sports) often have GENERAL ADMISSION sections (no assigned
  seat, just a zone + capacity counter) alongside assigned seating — Seat Lock
  Service handles General Admission as a CAPACITY DECREMENT (atomic counter)
  rather than per-seat locks, since there's no individual seat identity to lock`,
        },
        {
          title: "Back-of-the-Envelope Estimation",
          content: `Before designing the seat-lock and virtual-waiting-room systems in later phases, it helps to separate the AVERAGE-DAY numbers (which are unremarkable) from the BLOCKBUSTER-RELEASE peak (which is the entire reason this system is hard).

ASSUMPTIONS:
  200M+ tickets/year ≈ 550K tickets/day average, ~3 seats/booking ≈ 183K bookings/day
  75,000 shows/day across 4,000+ screens + event venues
  Seat-hold (lock) TTL = 8 minutes (480s); typical user completes payment in ~90s
  A mega-release runs on ~1,500 screens on day 1, averaging ~300 seats/show
  At "booking opens" for a mega-release: ~1M concurrent users, ~500K total
  seats released for day-1 shows across the country

THE FIVE DERIVATIONS:

1. Average booking rate:
   183,000 bookings/day ÷ 86,400s ≈ 2.1 bookings/sec average
   → Tiny. This is the number that sizes BASELINE Booking Service / Postgres
   capacity — and it's roughly THREE ORDERS OF MAGNITUDE below what happens
   at a mega-release's booking-open instant.

2. Seat-lock concurrency via Little's Law — the headline number:
   At most 500,000 seats can ever be successfully locked for this release's
   day-1 shows. If the virtual waiting room admits users at a steady
   ~830 successful seat-locks/sec, draining all 500K takes ~600s (10 min).
   concurrent_locks = arrival_rate × avg_hold_time ≈ 830 × 150s ≈ 124,500
   → 124,500 simultaneous keys-with-TTL in Redis. This sounds huge, but for
   Redis it's NOTHING — a single node handles millions of keys. Redis was
   never going to be the bottleneck.

3. So what IS the bottleneck? Admission rate vs raw demand:
   ~1,000,000 users want in; the system can safely admit ~830-2,000/sec
   (calibrated to Booking/Payment Service capacity, not Redis).
   Draining 1M users at 2,000/sec ≈ 500s ≈ 8.3 minutes
   → THIS is the number that defines the user experience ("You are #214,302
   in line — estimated wait 8 min") and sizes the Admission Controller +
   WebSocket queue-position fanout, not the seat-lock store itself.

4. Payment gateway load at peak:
   Of ~830 successful locks/sec, ~70% complete payment within the hold →
   ~580 payment-intent calls/sec — comfortably within gateway limits, vs
   ~1.5/sec (2.1 bookings/sec × 70%) average. A ~400x spike, but gateways
   are provisioned for exactly this kind of scheduled spike.

5. Per-show seat-map fanout:
   For the FIRST few "prime" shows of a mega-release, thousands of admitted
   users may be viewing the SAME ~300-seat map simultaneously. Broadcasting
   seat-status DIFFS (not full re-renders) over the show's WebSocket channel
   keeps this to a handful of small messages/sec per viewer, not a
   300-seat payload on every tick.

INTERVIEW PUNCH LINE:
  "The '1M concurrent users' headline doesn't directly size anything — what
  it sizes is the ADMISSION RATE the virtual waiting room enforces (~2,000/sec
  in derivation #3), which is itself calibrated so that concurrent seat-locks
  (derivation #2, ~124,500) stay well inside Redis's comfort zone. Redis was
  never the constraint; the admission throttle IS the design."`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Seat Inventory & Booking — The Core Problem",
      sections: [
        {
          title: "Seat-Level Inventory — Real-Time Locking",
          content: `This is the problem BookMyShow is fundamentally built around: a seat map with a few hundred seats, where the system must guarantee NO TWO BOOKINGS ever hold or confirm the same seat — even when thousands of requests for that show arrive within the same second.

SEAT MAP MODEL:
  Each show's seat map is derived from its screen's seat-map TEMPLATE
  (rows × seats, category per seat: Recliner / Premium / Executive / Normal)
  with per-show, per-category pricing.
  Live state lives in Redis:
    HSET show:{show_id}:seats {seat_id} → AVAILABLE | LOCKED:{user_id}:{exp_ts} | BOOKED
  Durable confirmation lives in PostgreSQL — Redis is the fast "working" copy,
  Postgres is the source of truth ONLY for the final BOOKED state.

ATOMIC MULTI-SEAT LOCKING (all-or-nothing):
  A user selects N seats (avg 3) and must lock ALL of them together —
  partial success ("2 of 3 locked, seat 3 was taken") is unacceptable UX and
  a consistency hazard if not unwound correctly.

  Redis Lua script (atomic on a single node — all of a show's seat keys are
  co-located via the hash tag {show_id}):
    for each seat_id in requested_seats:
      if hash[seat_id] is not AVAILABLE: ABORT, return conflicting seat_ids
    for each seat_id in requested_seats:
      hash[seat_id] = "LOCKED:{user_id}:{now + 480}"
      EXPIRE that field via a companion sorted set for TTL sweeping
    return SUCCESS, hold_id

  Running this as ONE Lua script means there is no window where seat 1 is
  locked but seat 3's check hasn't happened yet — the entire decision is
  made atomically before any state changes.

REAL-TIME SEAT MAP UPDATES (WebSocket):
  Channel: show:{show_id}:seatmap
  On lock / release / book, publish a DIFF: { seat_id, status, locked_until }
  — never the full map. Every client viewing that show's seat picker sees
  seats turn grey (locked by someone else) or red (booked) within ~1 second,
  which is what stops users from repeatedly tapping seats that are already gone.

LOCK EXPIRY & RELEASE:
  TTL-based: a background sweeper (or Redis keyspace notifications) detects
  expired locks, flips the seat back to AVAILABLE, and publishes the diff.
  Early release: explicit unlock call when a user navigates away or changes
  their seat selection before completing checkout.

WHY NOT POSTGRES ROW LOCKS:
  A naive SELECT ... FOR UPDATE per seat row would serialise thousands of
  transactions/sec onto the same ~300 hot rows during a surge — lock
  contention and deadlocks. Redis Lua + TTL keeps the hot path entirely
  in-memory and lock-free from Postgres's perspective; Postgres only ever
  sees ONE INSERT per confirmed booking, never per hold attempt.`,
        },
        {
          title: "Booking Flow — From Seat Selection to Confirmation",
          content: `The booking flow is a short SAGA that must combine an expiring seat hold, a payment, and a durable confirmation — and unwind cleanly if any step fails.

HAPPY PATH:
  1. Client: GET seat map → selects seats → POST /v1/bookings/hold
     { show_id, seat_ids, idempotency_key }
  2. Seat Lock Service: Lua-locks all seat_ids for 480s → returns
     { hold_id, expires_at }
  3. Booking Service: creates booking row, status = PENDING_PAYMENT, computes
     final price (category price × seats + dynamic-pricing delta +
     convenience fee + GST)
  4. Client redirected to Payment Service → gateway (UPI / card / wallet / netbanking)
  5. Gateway webhook → payment.success → Booking Service runs the CONFIRM
     transaction atomically:
       a. Postgres: INSERT booking_seats rows, booking.status = CONFIRMED
       b. Redis: seat status LOCKED → BOOKED (permanent for this show)
       c. emit booking.confirmed → Kafka → e-ticket generation + notifications
  6. On payment failure, timeout, or explicit cancel: booking.status =
     CANCELLED; seats revert to AVAILABLE when the Redis TTL expires (or are
     explicitly released immediately for a faster UX)

IDEMPOTENCY:
  idempotency_key = device_id + show_id + hash(seat_ids) + 2-minute time bucket
  Redis SET NX on this key: a retried "Pay" tap (double-tap, network retry)
  returns the SAME booking_id instead of creating a second hold.

THE "LOCK EXPIRES MID-PAYMENT" RACE:
  Payment redirects (UPI intent apps, bank 3DS pages) occasionally exceed the
  8-minute hold. Mitigation: the instant a user is redirected to a payment
  gateway, Booking Service extends the Redis TTL ONCE by +120s — a single
  "payment in progress" grace extension, capped per booking to prevent a
  malicious client from holding seats indefinitely.

  If payment STILL succeeds after the lock fully expired and the seat was
  re-sold to someone else (rare but possible), the CONFIRM transaction's
  Postgres step detects the conflict (seat already BOOKED under a different
  booking_id) and falls into a COMPENSATING TRANSACTION: auto-refund +
  "seat reassignment" — offer an equivalent seat in the same show, or a full
  refund with priority rebooking for another showtime. This edge case is
  handled, not prevented — preventing it outright would mean holding seats
  indefinitely, which is worse for everyone else.

CANCELLATION & REFUNDS:
  Cancellation window is set per venue policy (commonly up to a few hours
  before showtime). A refund reverses the payment AND, if the show is still
  upcoming, flips the seat back to AVAILABLE in both Redis and Postgres —
  re-entering it into the bookable seat map immediately.`,
        },
        {
          title: "Service Mesh — Sidecar Proxy Pattern (Envoy/Istio)",
          content: `BookMyShow runs five core services behind the API Gateway: Search Service, Show Service, Seat Lock Service, Booking Service, and Payment Service (Notification Service sits off the Kafka event bus, async). Each gets an Envoy sidecar.

WHY A MESH FITS HERE:
  Seat Lock Service is THE hottest, most latency-sensitive hop in the system
  — every seat tap is a synchronous call to it, and its Redis-backed Lua
  script must return in single-digit milliseconds even during a mega-release.
  Booking Service orchestrates a multi-step saga (lock → price → pay →
  confirm) and is the natural place for canary rollouts of pricing logic.
  Show Service has high fan-out (every search result, every seat-map open
  reads show metadata) but is read-heavy and cacheable.
  Payment Service must be callable ONLY by Booking Service.

DATA PLANE: Envoy sidecar on Search, Show, Seat Lock, Booking, and Payment
Service.

CONTROL PLANE: Istio deployed PER REGION (North/West/South/East India) —
mirroring how cinema and event inventory is already regionally partitioned,
and containing a control-plane incident to one region's cities.

WHAT THIS BUYS, CONCRETELY:

1. Seat Lock Service — TIGHT circuit breaking (outlierDetection, interval:
   5s, baseEjectionTime: 15s). At mega-release peak this service must reject
   or reroute around a single bad replica in seconds — a slow replica here
   stalls the entire admission-controlled queue from Phase 3.

2. Booking Service — LOAD BALANCING ONLY, explicitly NO outlierDetection.
   Each in-flight booking holds saga state (a held seat lock, a pending
   payment) across multiple requests; ejecting a replica mid-saga would
   orphan that state. LEAST_REQUEST spreads new bookings without disturbing
   in-flight ones.

3. VirtualService canary on Booking Service — ships changes to the dynamic
   pricing formula (Phase 4) to 5% of traffic via a header-matched subset
   before full rollout, since a pricing bug directly affects revenue.

4. AuthorizationPolicy restricting Payment Service's charge/refund endpoints
   to Booking Service's mesh identity only — no other service can move money.

5. mTLS (STRICT) + distributed tracing across all 5 services — every hop in
   the hold → price → pay → confirm chain is traced, which matters when
   debugging the rare "lock expired mid-payment" compensating transactions.

WHAT STAYS OUT:
  Kafka, PostgreSQL, Redis (seat-lock store and queue), Elasticsearch, S3/CDN
  — Redis in particular sits directly on the seat-lock hot path where an
  extra hop is pure cost, and Envoy can't apply meaningful L7 policy to it anyway.

TRADE-OFFS:
  Sidecar adds ~1-2ms per hop. Against the <5s booking-confirmation SLA this
  is negligible in the steady state — but Seat Lock Service's own latency
  budget is closer to ~20-30ms at mega-release peak, so its ~1-2ms tax is a
  more material (if still small) fraction than anywhere else in this design.
  Control-plane-down means sidecars fail open on cached config — at
  per-region granularity, an incident in one region never touches another
  region's mega-release.`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "High-Demand Releases — Virtual Waiting Room",
      sections: [
        {
          title: "Thundering Herd at \"Booking Opens\"",
          content: `THE SCENARIO:
  A major film's advance booking "opens" at a publicly announced time (often
  midnight). Marketing has spent weeks driving awareness — millions of fans
  have the app open, finger on the refresh button, at T-0. Within seconds,
  demand for that movie's ~1,500 day-1 screens (each ~250-400 seats) is
  orders of magnitude above anything the steady-state system sees.

WHY THIS IS DIFFERENT FROM A DINNER-RUSH OR SURGE-PRICING SPIKE:
  A food-delivery dinner rush is a SMOOTH RAMP — demand builds over an hour
  and reactive autoscaling can keep pace. A mega-release booking-open is a
  STEP FUNCTION — demand goes from near-zero to peak in under a second, AT A
  PRECISELY KNOWN TIME. Because the time is known in advance, the system can
  PRE-ADMIT and PRE-SCALE in ways reactive autoscaling never could — but it
  also means there's no ramp-up period to absorb mistakes.

THE NAIVE FAILURE MODE:
  If every client is allowed to call Seat Lock Service's hold endpoint
  directly at T-0, Redis itself would likely survive (Lua scripts are fast)
  — but the SURROUNDING services don't. Connection pools to Booking Service,
  thread pools in the API Gateway, and the Payment Service's outbound
  connections to the gateway all saturate simultaneously. Once one shared
  resource (a connection pool, a thread pool, a rate-limited downstream
  dependency) saturates, requests for THIS movie start timing out — and
  because these resources are often SHARED across the platform, bookings for
  every OTHER movie and event start failing too. This is the actual
  historical failure mode for ticketing platforms during mega ticket sales:
  not "the database fell over," but "a shared resource pool for one hot item
  starved capacity for everything else."

THE FIX IS ADMISSION CONTROL, NOT MORE CAPACITY:
  You cannot provision your way out of a 1,000,000-user step function for a
  500,000-seat release — even infinite capacity doesn't change the fact that
  950,000 of those users are going to be disappointed. What CAN be controlled
  is the RATE at which users are allowed to compete for those seats, so that
  the competition itself never destabilises the platform. That's the virtual
  waiting room.`,
        },
        {
          title: "Token-Based Queue & Admission Control",
          content: `PRE-QUEUE (T-15min to T-0):
  Starting ~15 minutes before booking opens, any client requesting that
  show's booking page is placed into a Redis-backed FIFO queue rather than
  given direct access:
    ZADD waitingroom:{show_id} {enqueue_timestamp_with_jitter} {session_id}
  Each client receives a queue_token and opens a WebSocket (or polls) for
  their live position.

ADMISSION LOOP (T-0 onward):
  A dedicated Admission Controller pops the front of waitingroom:{show_id}
  at a fixed ADMISSION RATE — calibrated to downstream capacity (Seat Lock,
  Booking, Payment Service), e.g. ~2,000 admissions/sec, NOT to raw demand.
  Each admitted session receives a short-lived (~5 min) ADMISSION TOKEN
  (signed JWT, scoped to {show_id, user_id, exp}). Seat Lock Service's hold
  endpoint REJECTS any request for this show that lacks a valid admission
  token — this is enforced as an AuthorizationPolicy-style check, turning an
  unbounded concurrent spike into a smooth, bounded stream that downstream
  services were already provisioned for.

FAIRNESS & ANTI-BOT:
  FIFO ordering with per-session jitter at enqueue time prevents
  millisecond-precision scripted requests from systematically winning
  position over human users on slower connections.
  CAPTCHA / device-fingerprint checks gate ENTRY to the pre-queue itself for
  high-demand shows — bot mitigation happens before the queue, not after.
  Live position broadcast over WebSocket: "You are #214,302 in line —
  estimated wait ~8 min" (derived directly from queue depth ÷ admission rate).

GRACEFUL DEGRADATION (LOAD-SHEDDING FEEDBACK LOOP):
  The Admission Controller continuously monitors Seat Lock Service's p99
  latency. If it crosses a threshold, the admission rate is DYNAMICALLY
  REDUCED — trading a longer queue for this show against protecting platform
  stability. Other shows' booking flows (no active waiting room) are
  completely unaffected, because the waiting room — and any throttling — is
  scoped per show_id, never global.

PRE-WARMING:
  Because T-0 is known in advance, ~10 minutes before booking opens the
  platform pre-scales Seat Lock Service, Booking Service, and Payment Service
  pods specifically in the region/cell serving that release — a manual or
  scheduled scale-up, the same "known peak event → pre-scale 30 min before"
  pattern used for predictable demand elsewhere, but triggered by a publish
  date rather than a time-of-day pattern.

AFTER THE RUSH:
  Once waitingroom:{show_id} drains (or after a fixed window, e.g. 20
  minutes), the show reverts to normal direct-access booking — the virtual
  waiting room is a TEMPORARY admission gate for the first few minutes of
  extreme demand, not a permanent feature of the booking flow.`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Payments & Dynamic Pricing",
      sections: [
        {
          title: "Payment Processing & Seat-Hold Expiry",
          content: `Payment is the second half of the booking saga (Phase 2) — and unlike food delivery, BookMyShow has NO "Cash on Delivery" equivalent, because the thing being held (an exclusive seat lock) directly removes availability from everyone else for as long as it's held.

PAYMENT FLOW:
  1. Booking Service creates a payment intent for the FROZEN price computed
     at hold-time (category price × seats + dynamic-pricing delta +
     convenience fee + GST)
  2. Handoff to gateway (Razorpay / PayU / Juspay)
  3. Methods: UPI (dominant in India), cards, netbanking, wallets, BookMyShow
     gift vouchers / wallet credits
  4. UI shows a countdown mirroring the remaining hold time (8 min, plus the
     one-time +120s grace extension granted the instant the gateway redirect happens)
  5. Gateway webhook → payment.success → CONFIRM transaction (Phase 2)
  6. On failure/timeout → booking CANCELLED, seats revert to AVAILABLE

WHY NO "PAY LATER" / COD:
  In food delivery, letting an order sit unpaid briefly costs almost nothing.
  Here, every minute a seat is held without payment is a minute it's NOT
  available to the next person in the virtual waiting room — upfront payment
  isn't a fraud-prevention choice, it's an INVENTORY-FAIRNESS choice.

PAYMENT RETRY WITHOUT RE-LOCKING:
  If a payment attempt fails (bank decline) but the hold still has time
  remaining, the user can retry with a different method WITHOUT re-running
  the seat-lock Lua script — Booking Service keeps the booking in
  PENDING_PAYMENT and issues a new payment intent against the same hold_id.
  Re-locking would be both wasteful and risky (the seats could be gone by
  the second attempt).

GROUP BOOKINGS ("Bill My Friends"):
  One person locks the seats; the cost can be split via payment links sent
  to friends' phones. The LOCK belongs to a single booking_id — if not all
  participants pay within the hold window (including its grace extension),
  the ENTIRE booking fails and any partial payments already made are
  refunded. There is no "partially confirmed" booking — this is the same
  all-or-nothing principle as the seat lock itself, extended to payment.

WALLET & GIFT CARD CREDITS:
  BookMyShow wallet balance (refunds, promotional credits) is applied first
  at checkout from a PostgreSQL ledger, with any remainder charged via the
  gateway — mirroring the wallet-ledger pattern used for similar credit
  systems elsewhere in this series.`,
        },
        {
          title: "Dynamic Pricing — Regulated Caps, Tiers & Convenience Fees",
          content: `Pricing on BookMyShow is split into two very different regimes: movie ticket prices, which are partly REGULATED, and event ticket prices, which are genuinely dynamic.

MOVIE TICKETS — CATEGORY TIERING, NOT REAL-TIME SURGE:
  Several Indian states cap multiplex ticket prices by law (e.g., a maximum
  price per screen category). "Dynamic pricing" for movies is therefore
  mostly about the FIXED category tiers a cinema sets at show-creation time
  — Recliner > Premium > Executive > Normal — not algorithmic, real-time
  demand-based surge.
  Show Service VALIDATES a cinema's submitted prices against the relevant
  state's price-cap table at show-creation time and REJECTS shows that
  exceed it — a compliance check baked into the show-publishing pipeline,
  not an afterthought.

EVENT PRICING — TIERED RELEASE (genuinely dynamic):
  Concerts, sports, and large stage shows use a TIERED RELEASE model:
  Early-Bird → General → Last-Minute, each tier with a fixed seat allocation
  and price. Once a tier's allocation is exhausted, the NEXT tier's price
  becomes active automatically — a simple per-tier state machine, not
  continuous repricing.
  Tier-sellout VELOCITY (how fast the current tier is selling) is surfaced to
  organisers, who can choose to release an additional higher-priced tier —
  intentionally HUMAN-IN-THE-LOOP, because pricing decisions for live events
  carry brand and audience-perception implications an algorithm shouldn't own alone.

CONVENIENCE FEE — the platform's actual monetisation lever:
  A platform fee (flat or a percentage band based on ticket price), shown as
  a SEPARATE line item at checkout — this is BookMyShow's primary revenue on
  movie tickets, since the ticket price itself may be regulated/thin-margin.
  The fee can vary by payment method (UPI vs. card processing costs differ)
  and, for events, by tier (a small bump during Early-Bird) — but is always
  itemised transparently, both for consumer trust and regulatory expectations
  around hidden fees.

F&B / COMBO UPSELL:
  At checkout, the venue's food & beverage menu is offered as add-ons
  (popcorn combo, etc.) — a SEPARATE inventory system, not seat-locked, added
  to the cart like a simple line item and fulfilled at the venue counter via
  the e-ticket QR (Phase 5). F&B Service deliberately sits OUTSIDE the
  seat-lock critical path: if it's slow or down, booking confirmation
  proceeds without the add-on rather than blocking on it.

PRICE FREEZE DURING THE HOLD:
  The price quoted at hold-creation (Phase 2, step 3) is snapshotted onto the
  booking row and stays FROZEN for the lifetime of that hold — even if an
  event sells out its current tier (triggering a price increase for new
  holds) WHILE you're in the payment flow, YOUR booking completes at the
  price you were quoted. Implemented by storing price on the booking record
  at hold-time rather than recomputing it at confirm-time — a small detail
  that's the difference between "fair" and "bait-and-switch."`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "Tickets & Notifications",
      sections: [
        {
          title: "E-Ticket Generation, QR Codes & Venue Check-in",
          content: `On booking.confirmed (Kafka), the E-Ticket Service generates the artefact that gets a person into a seat — and the anti-fraud design here is less about the QR code itself and more about what happens when it's SCANNED.

E-TICKET GENERATION:
  Payload: booking_id, show details (movie/event, venue, screen, date/time),
  seat numbers, holder name.
  QR code encodes a SIGNED payload — HMAC-SHA256 over
  (booking_id + seat_ids + show_id), keyed with a venue-rotated secret.
  The signature proves AUTHENTICITY (you can't manufacture a valid QR for
  seats you didn't book, or edit seat numbers on a screenshot) — but it does
  NOT, by itself, prevent the SAME valid QR being shown at the door twice.

VENUE CHECK-IN — the real anti-fraud mechanism:
  Usher/turnstile app scans the QR:
    1. Verify HMAC signature (authenticity)
    2. Check booking.status == CONFIRMED
    3. Check ticket.redeemed == false
    4. On success: set ticket.redeemed = true, redeemed_at = now()
  A RE-SCAN of an already-redeemed QR (e.g., someone screenshots a valid
  ticket and shares it with multiple people) is REJECTED — the usher app
  shows "ALREADY USED at {redeemed_at}". The single-use REDEEMED FLAG, not
  the signature, is what stops ticket sharing — the signature only proves
  the QR is genuine, not that it's being used for the first time.

OFFLINE-TOLERANT VALIDATION:
  redeemed=true is written to Postgres AND cached in a venue-local Redis
  instance — if the venue's internet briefly drops, the local cache still
  enforces single-use for that venue, syncing the authoritative write to
  Postgres once connectivity returns.

M-TICKET vs. COUNTER PICKUP:
  M-ticket (QR on phone) is the default. Counter pickup (booking_id + ID
  proof) remains available for accessibility — and ALSO sets redeemed=true
  on issuance, preserving the same single-use guarantee regardless of channel.

GROUP BOOKINGS:
  A single booking with N seats generates ONE QR encoding ALL seat numbers,
  letting a group enter on one scan — or, where venue turnstile hardware
  supports it, each seat gets its own sub-QR for staggered individual arrivals.`,
        },
        {
          title: "Multi-Channel Notifications",
          content: `NOTIFICATION TRIGGERS (Kafka-driven, from booking and show lifecycle events):
  booking.confirmed → "Booking confirmed! 🎬 3 seats for [Movie], [Venue],
  13 Jun 9:30 PM" + e-ticket attached
  show.reminder (scheduled job, T-2hr) → "Your show starts in 2 hours —
  here's your ticket"
  show.cancelled (venue-initiated) → mass notification to every CONFIRMED
  booking for that show + auto-refund initiated
  show.rescheduled → notification with old/new time + one-tap "Keep my
  seats" or "Cancel for full refund"
  queue.position_update (Phase 3's virtual waiting room) → WebSocket
  primary, push notification fallback if the app is backgrounded

MULTI-CHANNEL DELIVERY:
  Push (FCM/APNs): primary, instant, deep-links straight to "My Tickets"
  Email: PDF e-ticket attachment — the channel people actually forward to a
  friend or print
  SMS: fallback for users without the app open / email configured, contains
  a short link to a mobile-web ticket view
  In-app "My Tickets": always reflects current state, independent of whether
  any notification was successfully delivered

CANCELLATION & REFUND NOTIFICATIONS:
  "Refund of ₹450 initiated — 5-7 business days" (or instant if refunded to
  BookMyShow wallet)
  Group booking partial-failure (Phase 4's "Bill My Friends" not fully paid
  within the hold) → ALL participants notified that the booking didn't go
  through and any partial charges were reversed — nobody is left wondering
  whether they have a seat or not.

BULK NOTIFICATION AT SCALE:
  A show.cancelled for a popular event may need to notify tens of thousands
  of bookings simultaneously. These are queued through Kafka with a
  dedicated consumer group and RATE-LIMITED against the push/SMS/email
  providers' own throughput ceilings — fired as a controlled stream, not all
  at once, the same load-levelling principle as the virtual waiting room
  applied to outbound traffic instead of inbound.`,
        },
      ],
    },
    {
      id: "phase6",
      label: "Phase 6",
      title: "Reviews, Ratings & Scale",
      sections: [
        {
          title: "Movie & Event Reviews",
          content: `REVIEW ELIGIBILITY:
  Only a "Verified Booking" — a CONFIRMED booking whose showtime has already
  passed — can leave a review, tied to booking_id. This prevents reviews
  (positive or negative) from people who never actually attended.
  Critics' reviews (BookMyShow's editorial team / partnered critics) are
  shown SEPARATELY from audience ratings, clearly labelled — keeping
  "critic score" and "audience score" as two distinct numbers avoids the
  perennial critic-vs-audience rating disputes that arise when they're blended.

RATING AGGREGATION:
  Bayesian-smoothed average: new releases with only a handful of ratings are
  pulled toward a global mean, so a coordinated burst of 1-star or 5-star
  reviews in the first hour can't single-handedly define a brand-new movie's
  score.
  Ratings can be tracked per FORMAT (IMAX vs. standard 2D experiences
  genuinely differ) but roll up to one headline score per movie for
  discovery ranking — format-level detail is available on the movie page,
  not surfaced as competing headline numbers.

REVIEW MODERATION:
  SPOILER DETECTION: reviews posted within 48 hours of a movie's release are
  auto-tagged "May contain spoilers" with a tap-to-reveal — a
  content-specific moderation feature with no analogue in, say, a food
  delivery review system.
  REVIEW-BOMBING DETECTION: a sudden, coordinated spike in 1-star reviews
  within hours of release (common around contentious releases) is flagged
  for human moderation rather than auto-removed — the goal is catching
  coordinated manipulation without suppressing genuine negative audience
  reaction, which is a legitimate signal.
  Standard fraud checks also apply: IP-velocity limits, review-text
  similarity clustering for templated/copy-paste reviews.`,
        },
        {
          title: "Reliability & Scale at Peak",
          content: `AUTO-SCALING + PRE-SCALING:
  Reactive: Kubernetes HPA absorbs normal day-to-day traffic variation.
  Scheduled: known mega-release dates trigger PRE-SCALING of Seat Lock,
  Booking, and Payment Service in the relevant region 10-15 minutes before
  booking opens (Phase 3) — a calendar-driven scale-up, not a
  metric-triggered one, because the trigger time is known weeks in advance.

CIRCUIT BREAKERS:
  Dynamic pricing service slow or down → Booking Service falls back to the
  LAST KNOWN price tier (the same frozen-price mechanism from Phase 4) rather
  than blocking the booking entirely.
  A specific show's seat-map Redis shard degraded → serve the last-known-good
  seat map with a "may be slightly outdated" banner, and TEMPORARILY BLOCK
  new locks for THAT show specifically until the shard recovers — preventing
  a stale-seat-map double-booking risk while every OTHER show on the platform
  remains fully bookable. The blast radius of a Redis issue is one show, not
  the platform.

DATABASE SHARDING:
  Bookings and shows are sharded by REGION, mirroring the per-region mesh
  control planes from Phase 2 — a regional database issue affects only that
  region's venues. Read replicas absorb search/discovery reads; the primary
  handles booking writes only.

CDN & STATIC ASSETS:
  Movie posters, trailers, and event banners: CDN-served with long TTLs.
  City "Now Showing" pages: server-side rendered + Redis-cached (60s TTL,
  tightened during high-traffic windows like a major release weekend).

QUEUE-BASED LOAD LEVELLING BEYOND THE VIRTUAL WAITING ROOM:
  Even for ordinary (non-mega-release) shows, if Booking Service detects
  elevated latency, new hold requests are briefly queued in Kafka rather than
  rejected outright — the user sees a "Confirming your seats..." spinner
  instead of an error. The virtual waiting room handles the EXTREME,
  known-in-advance case; this handles ordinary, unplanned load spikes with
  the same "informed wait beats an error" philosophy.`,
        },
      ],
    },
  ],
};

export const BOOKMYSHOW_LLD = {
  title: "BookMyShow — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of core BookMyShow services",

  components: [
    {
      id: "searchService",
      title: "Search & Discovery Service — LLD",
      description: "Elasticsearch-powered hyperlocal movie/event search with live Redis-backed availability badges",
      api: `GET /v1/discover?city=mumbai&date=2026-06-13&q=avengers&format=IMAX&language=hindi&lat=19.07&lng=72.87

Response 200:
{
  "movies": [
    {
      "movie_id": "mov_avengers_eternity",
      "title": "Avengers: Eternity",
      "poster_url": "https://cdn.bookmyshow.com/posters/avengers_eternity.jpg",
      "languages": ["English", "Hindi", "Tamil"],
      "formats": ["2D", "3D", "IMAX", "4DX"],
      "rating": 4.3,
      "cinemas": [
        {
          "venue_id": "ven_pvr_phoenix",
          "name": "PVR Phoenix Mills",
          "distance_km": 2.1,
          "showtimes": [
            { "show_id": "show_20260613_2130_scr4", "time": "21:30", "format": "IMAX",
              "language": "English", "availability": "FILLING_FAST" },
            { "show_id": "show_20260613_2200_scr2", "time": "22:00", "format": "2D",
              "language": "Hindi",   "availability": "AVAILABLE" }
          ]
        }
      ]
    }
  ],
  "events": [ /* same shape, grouped by venue + date/time performance slots */ ]
}

-- Elasticsearch index: shows --
PUT /shows/_doc/{show_id}
{
  "show_id": "show_20260613_2130_scr4",
  "movie_id": "mov_avengers_eternity",
  "title": "Avengers: Eternity",
  "title_translations": { "hi": "द एवेंजर्स: एटर्निटी" },
  "city_id": "city_mumbai",
  "venue_id": "ven_pvr_phoenix",
  "venue_location": { "lat": 19.1141, "lon": 72.8701 },
  "screen_id": "scr_4",
  "date": "2026-06-13",
  "time": "21:30",
  "format": "IMAX",
  "language": "English",
  "genre": ["Action", "Sci-Fi"],
  "popularity_score": 0.94,
  "status": "PUBLISHED"
}

-- Query (simplified) --
GET /shows/_search
{
  "query": {
    "bool": {
      "filter": [
        { "term": { "city_id": "city_mumbai" } },
        { "term": { "date": "2026-06-13" } },
        { "term": { "status": "PUBLISHED" } }
      ],
      "must": [
        { "multi_match": {
            "query": "avengers",
            "fields": ["title", "title_translations.*"],
            "fuzziness": "AUTO"
        }}
      ]
    }
  },
  "sort": [ { "_score": {} }, { "popularity_score": "desc" } ]
}

-- Availability badge cache (Redis, 5s TTL) --
GET availability:{show_id}  ->  "AVAILABLE" | "FILLING_FAST" | "SOLD_OUT"
  written by Seat Lock Service on every lock / release / book:
    available_seats / total_seats  >  0.3   -> AVAILABLE
    0 <  ratio <= 0.3                       -> FILLING_FAST
    ratio == 0                              -> SOLD_OUT

-- "Now Showing" city cache (Redis, 60s TTL) --
GET nowshowing:{city_id}:{date}  ->  JSON array of movie_ids with >= 1 PUBLISHED show`,
    },
    {
      id: "showService",
      title: "Show Service — LLD",
      description: "Show-creation pipeline, seat-map template/instance materialisation, and show lifecycle state machine",
      api: `-- Partner Portal: create a show --
POST /v1/partner/shows
Authorization: Bearer {partner_jwt}

{
  "movie_id": "mov_avengers_eternity",
  "venue_id": "ven_pvr_phoenix",
  "screen_id": "scr_4",
  "date": "2026-06-13",
  "time": "21:30",
  "language": "English",
  "format": "IMAX",
  "pricing": {
    "RECLINER":  600.00,
    "PREMIUM":   400.00,
    "EXECUTIVE": 280.00,
    "NORMAL":    200.00
  }
}

Validation (all three must pass before PUBLISHED):
  1. No overlapping show on scr_4 within
     [time - duration - buffer, time + duration + buffer]   (buffer ~15-30 min)
  2. pricing[category] <= price_cap[state][category]   -- regulatory check (Phase 4)
  3. movie_id is RELEASED, or has its advance-booking window open

Response 201:
{ "show_id": "show_20260613_2130_scr4", "status": "PUBLISHED" }

-- Seat map TEMPLATE (Postgres, one per screen) --
CREATE TABLE seat_map_templates (
  screen_id    UUID PRIMARY KEY,
  venue_id     UUID NOT NULL,
  layout       JSONB NOT NULL
  -- { "rows": ["A".."L"], "seats_per_row": 20,
  --   "categories": { "A-C": "RECLINER", "D-G": "PREMIUM",
  --                   "H-J": "EXECUTIVE", "K-L": "NORMAL" },
  --   "accessibility_seats": ["L18", "L19"] }
);

-- Seat map INSTANCE (Postgres, materialised per show at creation) --
CREATE TABLE seat_map_instances (
  show_id   TEXT PRIMARY KEY REFERENCES shows(show_id),
  screen_id UUID NOT NULL,
  seats     JSONB NOT NULL
  -- [ { "seat_id": "A1", "category": "RECLINER", "price": 600.00, "status": "AVAILABLE" }, ... ]
);

ON show creation (single transaction):
  1. INSERT INTO shows (...)
  2. seats = template.layout x pricing  ->  INSERT INTO seat_map_instances
  3. mirror into Redis:
       HSET show:{show_id}:seats {seat_id} "AVAILABLE"   -- one field per seat
       HSET show:{show_id}:meta total_seats {N}

-- Show lifecycle (Postgres) --
CREATE TABLE shows (
  show_id    TEXT PRIMARY KEY,
  movie_id   UUID,    -- NULL for events
  event_id   UUID,    -- NULL for movies
  venue_id   UUID NOT NULL,
  screen_id  UUID NOT NULL,
  date       DATE NOT NULL,
  time       TIME NOT NULL,
  language   TEXT,
  format     TEXT,
  status     TEXT DEFAULT 'DRAFT',
  -- DRAFT -> PUBLISHED -> IN_PROGRESS -> COMPLETED -> ARCHIVED
  --                                   \\-> CANCELLED
  booking_closes_at TIMESTAMPTZ,   -- showtime - 15 min
  created_at TIMESTAMPTZ DEFAULT now(),
  INDEX (venue_id, screen_id, date, time),
  INDEX (movie_id, date)
);

-- General Admission events: capacity counters, not per-seat rows --
CREATE TABLE ga_capacity (
  show_id TEXT REFERENCES shows(show_id),
  zone    TEXT,   -- e.g. "FLOOR", "STANDS_LOWER", "STANDS_UPPER"
  total   INT,
  PRIMARY KEY (show_id, zone)
);
-- Redis mirror, atomic decrement, no individual seat identity:
SET    ga:{show_id}:{zone}:available {total}
DECRBY ga:{show_id}:{zone}:available {quantity}`,
    },
    {
      id: "seatLockService",
      title: "Seat Lock Service — LLD",
      description: "Redis Lua atomic multi-seat locking with TTL holds, WebSocket diff broadcast, and a separate General Admission capacity-counter model",
      api: `-- Hold N seats atomically (all-or-nothing) --
POST /internal/seatlock/hold
{
  "show_id": "show_20260613_2130_scr4",
  "user_id": "usr_789",
  "seat_ids": ["G12", "G13", "G14"],
  "admission_token": "eyJhbGciOi..."   // required only during Phase 3 virtual waiting room
}

Response 200:
{ "hold_id": "hold_abc123", "expires_at": "2026-06-13T21:02:00Z", "seats": ["G12","G13","G14"] }

Response 409 (any seat unavailable -- nothing was locked):
{ "error": "SEATS_UNAVAILABLE", "conflicting_seats": ["G13"] }

-- Redis seat map (per show, co-located via hash tag {show_id}) --
HSET {show_id}:seats G12 "AVAILABLE"
HSET {show_id}:seats G13 "LOCKED:usr_456:1749848520"
HSET {show_id}:seats G14 "BOOKED:bms_20260613_998877"
ZADD {show_id}:lock_expiry 1749848520 "G13"   -- sorted set, used for TTL sweeping

-- Lua script: atomic multi-seat hold (loaded once, called via EVALSHA) --
-- KEYS[1] = "{show_id}:seats", KEYS[2] = "{show_id}:lock_expiry"
-- ARGV    = seat_id[1..N], user_id, now, ttl (480)

-- Pass 1: every seat must be AVAILABLE, or abort with no side effects
for i, seat_id in ipairs(seat_ids) do
  local current = redis.call('HGET', KEYS[1], seat_id)
  if current ~= 'AVAILABLE' then
    return { 'CONFLICT', seat_id }
  end
end

-- Pass 2: only reached if EVERY seat passed -- lock them all
local expires_at = now + ttl
for i, seat_id in ipairs(seat_ids) do
  redis.call('HSET', KEYS[1], seat_id, 'LOCKED:' .. user_id .. ':' .. expires_at)
  redis.call('ZADD', KEYS[2], expires_at, seat_id)
end
return { 'OK', expires_at }

-- Background TTL sweeper (runs every ~1s) --
expired = ZRANGEBYSCORE {show_id}:lock_expiry -inf {now}
for seat_id in expired:
  if HGET {show_id}:seats seat_id starts with "LOCKED:":
    HSET {show_id}:seats seat_id "AVAILABLE"
    ZREM {show_id}:lock_expiry seat_id
    publish diff { "seat_id": seat_id, "status": "AVAILABLE" }
    recompute availability:{show_id} badge (Search Service cache)

-- WebSocket seat-map diff broadcast --
wss://seatmap.bookmyshow.com/show/{show_id}
Server pushes ONE small message per change, never the full map:
{ "seat_id": "G13", "status": "LOCKED",    "locked_until": "2026-06-13T21:02:00Z" }
{ "seat_id": "G14", "status": "BOOKED" }
{ "seat_id": "G13", "status": "AVAILABLE" }   // on expiry, early release, or sweeper

-- General Admission: capacity decrement, no per-seat identity --
POST /internal/seatlock/hold-ga
{ "show_id": "show_concert_001", "zone": "FLOOR", "quantity": 4, "user_id": "usr_789" }

Lua:
  local available = redis.call('GET', KEYS[1])   -- ga:{show_id}:{zone}:available
  if tonumber(available) < quantity then return 'CONFLICT' end
  redis.call('DECRBY', KEYS[1], quantity)
  redis.call('SETEX', KEYS[2], 480, show_id .. ':' .. zone .. ':' .. quantity)  -- ga_hold:{hold_id}
  return 'OK'

-- Release on TTL expiry (sweeper) or explicit cancellation --
INCRBY ga:{show_id}:{zone}:available {quantity}`,
    },
    {
      id: "bookingService",
      title: "Booking Service — LLD",
      description: "Saga orchestration (hold -> price -> pay -> confirm) with idempotency, frozen pricing, and compensating transactions",
      api: `-- Create a hold + booking --
POST /v1/bookings/hold
Authorization: Bearer {jwt}
Idempotency-Key: device_abc_show_20260613_2130_scr4_G12G13G14_202606132054

{
  "show_id": "show_20260613_2130_scr4",
  "seat_ids": ["G12", "G13", "G14"],
  "fnb_addons": [{ "item_id": "combo_popcorn_large", "quantity": 1 }]
}

Response 201:
{
  "booking_id": "bms_20260613_998877",
  "status": "PENDING_PAYMENT",
  "hold_id": "hold_abc123",
  "expires_at": "2026-06-13T21:02:00Z",
  "pricing": {
    "seats_total": 1200.00,
    "convenience_fee": 60.00,
    "fnb_total": 250.00,
    "taxes": 95.40,
    "total": 1605.40
  },
  "payment_url": "https://pay.bookmyshow.com/intent/bms_20260613_998877"
}

-- Idempotency (Redis) --
SET idem:{idempotency_key} {booking_id} NX EX 120
  -- a retried "Pay" tap returns the SAME booking_id + current status
  -- instead of re-running the seat-lock Lua script a second time

-- Postgres schema --
CREATE TABLE bookings (
  booking_id      TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  user_id         UUID NOT NULL,
  show_id         TEXT NOT NULL REFERENCES shows(show_id),
  hold_id         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  -- PENDING_PAYMENT -> CONFIRMED
  --                 -> CANCELLED | EXPIRED
  seats_total      NUMERIC(10,2),
  convenience_fee   NUMERIC(8,2),
  fnb_total         NUMERIC(8,2),
  taxes             NUMERIC(8,2),
  total_amount      NUMERIC(10,2),
  payment_id        UUID,
  hold_expires_at   TIMESTAMPTZ NOT NULL,
  grace_extended    BOOLEAN DEFAULT false,   -- the one-time +120s extension
  created_at        TIMESTAMPTZ DEFAULT now(),
  confirmed_at      TIMESTAMPTZ,
  INDEX (user_id, created_at DESC),
  INDEX (show_id, status)
);

CREATE TABLE booking_seats (
  booking_id TEXT REFERENCES bookings(booking_id),
  seat_id    TEXT NOT NULL,
  category   TEXT NOT NULL,
  price      NUMERIC(8,2) NOT NULL,   -- FROZEN at hold time, see Phase 4
  PRIMARY KEY (booking_id, seat_id)
);

-- Confirm transaction (on payment.success webhook) --
BEGIN;
  UPDATE bookings SET status = 'CONFIRMED', confirmed_at = now(), payment_id = $1
    WHERE booking_id = $2 AND status = 'PENDING_PAYMENT';
  -- 0 rows updated => already confirmed/cancelled/expired -> abort, webhook is idempotent
COMMIT;

-- Redis seat transition (post-commit) --
for seat_id in seat_ids:
  HSET {show_id}:seats seat_id "BOOKED:{booking_id}"
  ZREM {show_id}:lock_expiry seat_id
emit booking.confirmed -> Kafka

-- One-time grace extension (server-side, on gateway redirect) --
POST /internal/bookings/{booking_id}/extend-hold
  if NOT grace_extended:
    re-ZADD {show_id}:lock_expiry seat_id (expires_at + 120) for each seat_id
    UPDATE bookings SET hold_expires_at = hold_expires_at + interval '120 seconds',
                         grace_extended = true
                    WHERE booking_id = $1 AND grace_extended = false

-- Lock-expiry-mid-payment compensating transaction --
if CONFIRM finds a seat already "BOOKED:<other_booking_id>":
  UPDATE bookings SET status = 'CANCELLED', cancel_reason = 'SEAT_REASSIGNMENT' WHERE booking_id = $1
  -> trigger Payment Service refund
  -> Notification Service: offer equivalent seat in same show, or priority rebooking`,
    },
    {
      id: "paymentService",
      title: "Payment Service — LLD",
      description: "Payment intent creation, gateway webhook handling, wallet/gift-card ledger, and refunds",
      api: `-- Create payment intent --
POST /internal/payments/intent
{
  "booking_id": "bms_20260613_998877",
  "amount": 1605.40,
  "currency": "INR",
  "methods": ["UPI", "CARD", "NETBANKING", "WALLET"],
  "wallet_balance_applied": 100.00   // deducted before the gateway charge
}

Response 200:
{
  "payment_id": "pay_5566",
  "gateway_order_id": "razorpay_order_xyz",
  "amount_due": 1505.40,
  "redirect_url": "https://pay.bookmyshow.com/intent/bms_20260613_998877"
}

-- Wallet ledger (Postgres, append-only) --
CREATE TABLE wallet_ledger (
  entry_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  booking_id    TEXT,
  amount        NUMERIC(8,2) NOT NULL,  -- positive = credit, negative = debit
  reason        TEXT,                  -- BOOKING_PAYMENT | REFUND | PROMO_CREDIT
  balance_after NUMERIC(10,2) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  INDEX (user_id, created_at DESC)
);

-- Gateway webhook (signature-verified) --
POST /internal/payments/webhook
{ "event": "payment.success", "gateway_order_id": "razorpay_order_xyz", "payment_id": "pay_5566" }

  SET NX webhook:{gateway_order_id}:{event} EX 86400   -- de-dupe retried webhooks
  UPDATE payments SET status = 'SUCCESS' WHERE payment_id = $1
  -> call Booking Service's CONFIRM transaction

-- Refund --
POST /internal/payments/refund
{ "booking_id": "bms_20260613_998877", "amount": 1605.40, "reason": "USER_CANCELLED" }

  if cancellation window still open AND show not yet started:
    for seat_id in booking_seats: HSET {show_id}:seats seat_id "AVAILABLE"
    UPDATE bookings SET status = 'CANCELLED'
  gateway.refund(payment_id, amount)   OR   INSERT wallet_ledger (instant credit)`,
    },
    {
      id: "notificationService",
      title: "Notification & E-Ticket Service — LLD",
      description: "Kafka-driven multi-channel notifications, signed QR e-ticket generation, and rate-limited bulk fan-out",
      api: `-- Kafka topics consumed --
booking.confirmed | booking.cancelled | show.cancelled | show.rescheduled
show.reminder | queue.position_update

-- Notification dispatch record (Postgres) --
CREATE TABLE notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  booking_id TEXT,
  type       TEXT NOT NULL,   -- BOOKING_CONFIRMED | SHOW_REMINDER | SHOW_CANCELLED | ...
  channels   TEXT[] NOT NULL, -- ['PUSH','EMAIL','SMS']
  payload    JSONB NOT NULL,
  status     TEXT DEFAULT 'QUEUED',  -- QUEUED -> SENT -> DELIVERED | FAILED
  created_at TIMESTAMPTZ DEFAULT now(),
  INDEX (user_id, created_at DESC)
);

-- Per-channel dispatch --
PUSH  -> FCM/APNs, deep_link "bookmyshow://ticket/{booking_id}"
EMAIL -> render PDF e-ticket (booking details + QR), send via SES/SendGrid
SMS   -> short link to mobile-web ticket view

-- E-ticket generation (on booking.confirmed) --
payload   = { booking_id, show_id, seat_ids, venue_id }
signature = HMAC_SHA256(JSON(payload), venue_secret_key)
qr_data   = base64(JSON(payload) + "." + signature)

CREATE TABLE tickets (
  ticket_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  TEXT REFERENCES bookings(booking_id),
  qr_data     TEXT NOT NULL,
  redeemed    BOOLEAN DEFAULT false,
  redeemed_at TIMESTAMPTZ,
  INDEX (booking_id)
);

-- Venue check-in scan --
POST /internal/tickets/{ticket_id}/redeem
  1. verify HMAC signature
  2. check booking.status == 'CONFIRMED'
  3. check ticket.redeemed == false
  4. UPDATE tickets SET redeemed = true, redeemed_at = now()
  -- re-scan of an already-redeemed ticket -> 409 "ALREADY USED at {redeemed_at}"

-- Bulk fan-out (e.g. show.cancelled for a sold-out event) --
1. SELECT booking_id, user_id FROM bookings WHERE show_id = $1 AND status = 'CONFIRMED'
2. INSERT INTO notifications (...) for each row, status = 'QUEUED'
3. producer batches onto notification.bulk, partitioned by user_id
4. dedicated consumer group drains at a RATE-LIMITED pace
     (e.g. 500/sec to push provider, 100/sec to SMS gateway)
   -- the same load-levelling principle as the Admission Controller
   (Phase 3), applied to outbound traffic instead of inbound`,
    },
    {
      id: "serviceMesh",
      title: "Service Mesh — Envoy/Istio Sidecar Configuration",
      description: "Per-region Istio mesh: Seat Lock Service circuit breaking, Booking Service LB-only, pricing canary on Booking Service, Payment AuthorizationPolicy",
      api: `# Istio configuration — applied per region
# (north-india-prod, west-india-prod, south-india-prod, east-india-prod)

# 1. Seat Lock Service — tight circuit breaking.
#    The hottest, most latency-sensitive hop in the system: every seat
#    tap is a synchronous Lua-script call that must return in single-digit
#    ms, even at mega-release admission-controller peak (~2,000/sec).
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: seat-lock-service-circuit-breaker
  namespace: west-india-prod
spec:
  host: seat-lock-service.west-india-prod.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 20000
      http:
        http1MaxPendingRequests: 10000
        maxRequestsPerConnection: 100
    loadBalancer:
      simple: LEAST_REQUEST
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 5s
      baseEjectionTime: 15s
      maxEjectionPercent: 50
---
# 2. Booking Service — load balancing ONLY, no outlier ejection.
#    Each in-flight booking carries saga state (an active seat hold, a
#    pending payment intent) across the hold -> price -> pay -> confirm
#    chain; ejecting a replica mid-saga would orphan that state.
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: booking-service-lb
  namespace: west-india-prod
spec:
  host: booking-service.west-india-prod.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 8000
      http:
        http1MaxPendingRequests: 4000
        maxRequestsPerConnection: 50
    loadBalancer:
      simple: LEAST_REQUEST
---
# 3. Canary the dynamic-pricing computation (Phase 4) on Booking Service
#    before full rollout — a pricing bug here affects the total charged
#    on every booking confirmed during the rollout window.
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: booking-service-pricing-canary
  namespace: west-india-prod
spec:
  hosts:
    - booking-service.west-india-prod.svc.cluster.local
  http:
    - match:
        - headers:
            x-pricing-canary:
              exact: "true"
      route:
        - destination:
            host: booking-service.west-india-prod.svc.cluster.local
            subset: v2
    - route:
        - destination:
            host: booking-service.west-india-prod.svc.cluster.local
            subset: v1
          weight: 95
        - destination:
            host: booking-service.west-india-prod.svc.cluster.local
            subset: v2
          weight: 5
      retries:
        attempts: 2
        perTryTimeout: 10s
        retryOn: 5xx,reset,connect-failure
---
# 4. Payment integrity — only Booking Service may create payment
#    intents or trigger refunds.
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: payment-service-access
  namespace: west-india-prod
spec:
  selector:
    matchLabels:
      app: payment-service
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/west-india-prod/sa/booking-service"]
      to:
        - operation:
            paths: ["/internal/payments/intent", "/internal/payments/refund"]
            methods: ["POST"]
---
# 5. mTLS within the region
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: west-india-prod
spec:
  mtls:
    mode: STRICT`,
      internals: `Sidecar injection scope (5 services, matching the LLD components above):
  IN MESH:  Search Service, Show Service, Seat Lock Service, Booking
            Service, Payment Service
  OUT:      Notification & E-Ticket Service (async, Kafka-consumer only —
            no synchronous mesh hop), Kafka, PostgreSQL, Redis (seat-lock
            store + waiting-room queue), Elasticsearch, S3/CDN. Redis in
            particular sits directly on the seat-lock hot path, where an
            extra Envoy hop is pure cost with no L7 policy benefit.

Seat Lock Service circuit breaking — sized against the admission rate:
  The Back-of-the-Envelope Estimation (Phase 1) calibrates the Admission
  Controller to ~2,000 admissions/sec, each issuing a seat-lock hold call.
  outlierDetection (interval: 5s / baseEjectionTime: 15s) ejects a single
  misbehaving replica within one interval — at this admission rate, a
  slow replica left in rotation for even a few seconds backs up the
  ENTIRE virtual-waiting-room queue from Phase 3, since admission itself
  is gated on this service's p99 latency. maxConnections: 20000 reflects
  derivation #2's ~124,500 concurrent locks spread across the replica pool.

Booking Service — LB-only, the same reasoning as the saga-orchestrating
services elsewhere in this series: every in-flight booking holds an
active 480s (+120s grace) seat lock and a pending payment intent across
multiple requests. outlierDetection would eject a replica based on 5xx
rate, but a replica mid-saga isn't "unhealthy" from the caller's
perspective — ejecting it orphans that booking, forcing Phase 2's
compensating-transaction (seat-reassignment) path unnecessarily.
LEAST_REQUEST spreads NEW holds across replicas without disturbing
in-flight ones.

Pricing canary — tied directly to Phase 4's regulated-vs-dynamic pricing
split: movie prices are validated against state price-cap tables, while
event prices follow the tiered-release state machine. Either computation
shipping a bug means every booking confirmed during that window carries
a wrong total. The 5% header-matched canary is validated against live
booking-success and refund-rate metrics before full rollout;
perTryTimeout: 10s sets the worst-case per-attempt budget, while the <5s
hold-to-confirm SLA remains the steady-state target this canary is
measured against.

Payment AuthorizationPolicy:
  Only Booking Service's mesh identity can call
  /internal/payments/intent and /internal/payments/refund — independent
  of application code. This is the mesh-level twin of the booking_seats
  uniqueness guarantee from Phase 2: Postgres guarantees no seat is
  double-booked; AuthorizationPolicy guarantees no service OTHER than
  Booking Service can ever trigger a charge or refund tied to that seat.

mTLS & control-plane topology:
  Istio runs PER REGION (north-india-prod, west-india-prod,
  south-india-prod, east-india-prod), mirroring both the per-region
  control planes introduced in Phase 2 and the regional database sharding
  in Phase 6 — a control-plane incident in one region's mesh never touches
  another region's mega-release. Sidecars fail open on last-known config,
  consistent with the <5s booking-confirmation SLA having ample headroom
  for the ~1-2ms sidecar tax — EXCEPT at Seat Lock Service, whose own
  latency budget under admission-controlled peak load is closer to
  20-30ms (Phase 2), making its tax a comparatively larger, if still
  small, fraction.`,
    },
  ],
};

export const BOOKMYSHOW_QNA = [
  {
    id: "bmsq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["BookMyShow", "Ticketmaster", "Amazon"],
    question: "Design a movie/event ticketing platform like BookMyShow. Walk through the key components.",
    answer: `BookMyShow is fundamentally a SEAT-LEVEL INVENTORY platform, not a marketplace — and that distinction shapes almost every architectural decision below.

CORE COMPONENTS:

1. DISCOVERY & SEARCH:
   City-scoped Elasticsearch index over (movie/event, venue, screen, date).
   Real-time "Filling Fast / Sold Out" badges come from a Redis cache
   written by Seat Lock Service — NOT from Elasticsearch, which is far too
   slow to reflect second-by-second seat-map changes.

2. SHOW SERVICE:
   Manages the show lifecycle (DRAFT -> PUBLISHED -> IN_PROGRESS ->
   COMPLETED) and materialises a SEAT MAP INSTANCE per show from a
   per-screen template, mirrored into Redis for the locking hot path.

3. SEAT LOCK SERVICE — the centerpiece:
   A Redis Lua script that atomically locks N seats with an 8-minute TTL,
   all-or-nothing. Real-time WebSocket diffs keep every viewer's seat
   picker in sync within ~1 second.

4. BOOKING SERVICE:
   Orchestrates the saga: hold -> price -> redirect to payment -> confirm.
   Idempotency keys prevent double-bookings from retried taps.

5. PAYMENT SERVICE:
   Gateway integration (UPI/cards/netbanking/wallet), webhook-driven
   confirmation, and refunds.

6. VIRTUAL WAITING ROOM (Admission Controller):
   For blockbuster releases, a Redis-backed FIFO queue plus admission
   tokens throttle the rate at which users can even REACH Seat Lock
   Service — turning a 1M-user spike into a bounded, manageable stream.

7. NOTIFICATION & E-TICKET SERVICE:
   Kafka-driven; generates signed-QR e-tickets and multi-channel
   notifications.

KEY INSIGHT:
   In a marketplace (Uber, Zomato), the hard problem is MATCHING supply to
   demand. Here, supply (seats) is FIXED and known in advance — the hard
   problem is CONCURRENCY CONTROL over a tiny, contended resource (a few
   hundred seats) under a demand spike that's orders of magnitude larger
   AND arrives at a precisely known instant. Search, pricing, and
   notifications are comparatively conventional; the seat-lock +
   admission-control pair is where nearly all the design difficulty lives.`,
    followups: [
      "How would the design change for a platform that ONLY sold General Admission tickets (no assigned seating) — which components become simpler or unnecessary?",
      "Where would a Redis cluster failure hurt most — which components degrade gracefully vs which ones must hard-stop bookings?",
      "How does BookMyShow's read:write ratio compare to a marketplace app like Zomato, and how does that change the caching strategy?",
    ],
  },
  {
    id: "bmsq2",
    category: "Concurrency",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["BookMyShow", "Ticketmaster", "IRCTC"],
    question: "How do you prevent two users from booking the same seat at the same time? Walk through the locking mechanism end to end.",
    answer: `This is the question that defines the entire system — get it wrong and you either oversell seats (refund nightmares, reputational damage) or undersell them (seats sit empty while the UI shows them as taken).

THE CORE GUARANTEE:
  No two bookings may ever simultaneously hold OR confirm the same seat for
  the same show — even when thousands of lock requests for that show arrive
  within the same second.

LOCKING MECHANISM:
  1. Each show's seat map lives in Redis as a hash:
     HSET show:{show_id}:seats {seat_id} -> AVAILABLE | LOCKED:{user}:{exp} | BOOKED
     All of a show's keys are co-located on one Redis node via the
     {show_id} hash tag, so a multi-seat operation can be ATOMIC.

  2. A user selecting N seats (avg 3) triggers ONE Lua script:
     PASS 1 — check every requested seat is AVAILABLE; if ANY isn't, ABORT
              with the conflicting seat IDs and make NO changes.
     PASS 2 — only reached if pass 1 fully succeeded: lock every seat as
              LOCKED:{user_id}:{expires_at} and add it to a TTL sorted set.

  This two-pass-in-one-script design is what makes it ALL-OR-NOTHING: there
  is no window where seat 1 is locked but seat 3's availability check hasn't
  happened yet, because Lua scripts run atomically on a single Redis node.

WHY NOT POSTGRES ROW LOCKS:
  SELECT ... FOR UPDATE on a few hundred hot seat rows during a surge
  serialises thousands of transactions/sec onto the SAME rows — lock
  contention and deadlocks. Redis Lua + TTL keeps the entire hot path
  in-memory; Postgres only ever sees ONE INSERT per CONFIRMED booking, never
  per hold attempt.

TTL EXPIRY & REAL-TIME UI:
  A background sweeper scans the TTL sorted set every ~1s, flips expired
  locks back to AVAILABLE, and publishes a WebSocket diff ({ seat_id, status })
  to everyone viewing that show's seat map — seats visibly turn
  grey/available within ~1 second, which stops users from repeatedly tapping
  seats that are already gone.

THE ONE RACE THAT CAN STILL HAPPEN:
  A payment redirect occasionally outlasts even the extended hold. If
  payment succeeds AFTER the lock expired and the seat was re-sold, the
  CONFIRM step detects "seat already BOOKED under a different booking_id"
  and falls into a COMPENSATING TRANSACTION: auto-refund plus an offer of an
  equivalent seat or full refund with priority rebooking. This is handled,
  not prevented — preventing it outright would mean holding seats
  indefinitely, which hurts everyone else far more often than this rare race
  hurts the one affected user.`,
    followups: [
      "What happens if the Redis node holding a show's seat map fails mid-lock — walk through the failure and recovery.",
      "How would you extend this to support 'Bill My Friends' group payment without breaking the all-or-nothing guarantee?",
      "Could Postgres SELECT ... FOR UPDATE SKIP LOCKED replace the Redis Lua approach? What would you gain or lose?",
    ],
  },
  {
    id: "bmsq3",
    category: "Scalability",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["BookMyShow", "Ticketmaster", "Eventbrite"],
    question: "A blockbuster's advance booking opens at midnight and a million users try to book in the first minute. How do you design for this without the platform falling over?",
    answer: `The naive instinct is "add more servers" — but the actual fix is admission control, and the reason is worth spelling out.

WHY THIS IS HARDER THAN A NORMAL TRAFFIC SPIKE:
  A dinner-rush spike is a RAMP — demand builds over an hour, autoscaling
  keeps pace. A mega-release booking-open is a STEP FUNCTION — near-zero to
  peak in under a second, AT A PUBLICLY ANNOUNCED, PRECISELY KNOWN TIME.

THE NAIVE FAILURE MODE:
  If every client calls Seat Lock Service's hold endpoint directly at T-0,
  Redis itself probably survives (Lua scripts are fast) — but the shared
  resources AROUND it don't: API Gateway thread pools, Booking Service
  connection pools, and Payment Service's outbound gateway connections all
  saturate together. Once ONE shared pool saturates, requests for THIS movie
  start failing — and because these pools are often shared platform-wide,
  bookings for every OTHER movie and event start failing too. The historical
  failure mode for ticketing platforms isn't "the database fell over" — it's
  "a shared resource pool for one hot item starved capacity for everything else."

THE FIX — ADMISSION CONTROL, NOT MORE CAPACITY:
  You cannot provision your way out of 1,000,000 users competing for 500,000
  seats — 500,000 of them are disappointed no matter what. What you CAN
  control is the RATE at which users compete, so the competition itself never
  destabilises the platform.

DESIGN:
  PRE-QUEUE (T-15min to T-0): every client requesting this show's booking
  page is placed in a Redis FIFO —
  ZADD waitingroom:{show_id} {ts+jitter} {session_id} — and given a
  queue_token plus a WebSocket for live position.

  ADMISSION LOOP (T-0+): an Admission Controller pops the front of the queue
  at a FIXED RATE calibrated to downstream capacity (~2,000/sec), NOT to raw
  demand. Each admitted session gets a short-lived signed JWT scoped to
  {show_id, user_id, exp}. Seat Lock Service REJECTS any hold request for
  this show without a valid token.

  FAIRNESS/ANTI-BOT: per-session jitter at enqueue time prevents scripted
  requests from systematically beating humans on slower connections;
  CAPTCHA/device-fingerprint checks gate entry to the PRE-QUEUE itself.

  LOAD-SHEDDING FEEDBACK LOOP: the controller watches Seat Lock Service's
  p99 and DYNAMICALLY REDUCES the admission rate if it degrades — trading a
  longer queue for THIS show against platform stability, scoped per show_id
  so every OTHER show's booking flow is unaffected.

  PRE-WARMING: because T-0 is known weeks in advance, Seat Lock/Booking/
  Payment Service are pre-scaled ~10 min before in the relevant region.

AFTER THE RUSH: the queue drains (or times out after ~20 min) and the show
reverts to normal direct-access booking — this is a TEMPORARY gate, not a
permanent feature.`,
    followups: [
      "How would you detect and handle a bot/scalper farm trying to game queue position in the pre-queue?",
      "What happens to a user's queue position if their WebSocket connection drops and reconnects mid-wait?",
      "How would the admission rate differ for a 50,000-seat stadium event vs a 300-seat cinema screen?",
    ],
  },
  {
    id: "bmsq4",
    category: "Search",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["BookMyShow", "Zomato", "Swiggy"],
    question: "How does BookMyShow show real-time seat availability ('Filling Fast', 'Sold Out') in search results without hammering the seat-lock store on every search request?",
    answer: `The trick is that Elasticsearch and Redis answer DIFFERENT questions, and conflating them is the mistake to avoid.

WHAT ELASTICSEARCH ANSWERS:
  "Which shows match this search/filter, in this city, on this date?" — a
  relatively SLOW-CHANGING question. A show's existence, language, format,
  and venue don't change second-to-second, so the \`shows\` index (filtered
  by city_id + date + status, ranked by text relevance + popularity), backed
  by a 60s-TTL Redis cache for the "Now Showing" list, is exactly the right
  tool.

WHAT REDIS ANSWERS:
  "How many seats are left RIGHT NOW for show X?" — a question that can
  change dozens of times per second during a surge. This comes directly from
  Seat Lock Service's live seat-map hash, NOT from Elasticsearch.

THE ARCHITECTURE:
  Every time Seat Lock Service locks, releases, or books a seat, it
  recomputes available_seats / total_seats for that show and writes a
  single small badge value:
    SET availability:{show_id} "FILLING_FAST"   (TTL 5s)
      ratio > 0.3        -> AVAILABLE
      0 < ratio <= 0.3   -> FILLING_FAST
      ratio == 0         -> SOLD_OUT

  When Search Service returns showtimes, it does a batch MGET across
  availability:{show_id} for every show_id in the result set — a handful of
  Redis reads, NOT N seat-map hash scans — and merges the badge into the
  Elasticsearch result. The 5s TTL means even under massive concurrent
  search load for the SAME viral show, the badge is served from Redis's
  in-memory cache, not recomputed per request.

WHY SOLD-OUT SHOWS STILL APPEAR:
  Unlike a food-delivery app hiding an out-of-stock item, a SOLD_OUT show is
  still USEFUL information — the user can pick a different showtime for the
  same movie. So Search Service shows it, badge and all, rather than
  filtering it out.

HYPERLOCAL SCOPING:
  City is selected BEFORE anything else loads and is baked into every query
  as a hard filter (a city_id term match) — this alone eliminates >99% of the
  index before text relevance or geo-scoring even runs, which is what keeps
  search fast even as the catalogue grows nationally.

MULTI-LANGUAGE:
  Title fields are indexed with transliteration mappings (e.g.
  title_translations.hi), so "avengers" matches "द एवेंजर्स" via a
  multi_match across all language variants with fuzziness: AUTO.`,
    followups: [
      "For a viral show with thousands of simultaneous searches, does the 5-second availability cache TTL hold up — what's the worst case?",
      "What's the cache invalidation path when a show gets CANCELLED — how fast does that propagate to search results?",
      "How would you extend the multi-language transliteration matching to handle a query typed in Hinglish, like 'avenjers ka show'?",
    ],
  },
  {
    id: "bmsq5",
    category: "Surge Pricing",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["BookMyShow", "Ticketmaster", "Insider"],
    question: "How does pricing work for movie tickets vs event tickets on BookMyShow, and why can't you just apply Uber-style surge pricing everywhere?",
    answer: `The short answer is: you CAN'T apply Uber-style surge pricing everywhere, because movie ticket prices in India are partly set by LAW, not by the platform or even the cinema.

MOVIE TICKETS — REGULATED, CATEGORY-TIERED:
  Several Indian states cap multiplex ticket prices by statute (a maximum
  price per screen category). So "pricing" for a movie show is really: the
  cinema sets FIXED prices per category (Recliner/Premium/Executive/Normal)
  AT SHOW-CREATION TIME, and Show Service VALIDATES those prices against the
  relevant state's price-cap table, REJECTING shows that exceed it. There's
  no real-time demand-based repricing for movies — the "dynamic" part is
  just that weekday-matinee vs weekend-prime-time shows can have different
  (still capped) prices set in advance.

EVENT TICKETS — GENUINELY DYNAMIC, BUT TIERED NOT CONTINUOUS:
  Concerts, sports, and plays use a TIERED RELEASE: Early-Bird -> General ->
  Last-Minute, each with a fixed allocation and price. When a tier sells out,
  the NEXT tier's price activates automatically — a simple per-tier state
  machine. Tier-sellout VELOCITY is surfaced to organisers, who can choose to
  release an additional higher tier. This is intentionally HUMAN-IN-THE-LOOP:
  a continuous algorithmic-repricing model (like ride-hailing surge) would
  create real brand/perception risk for a live event in a way it doesn't for
  a 10-minute cab ride.

THE ACTUAL MONETISATION LEVER — CONVENIENCE FEE:
  Since the TICKET price itself may be regulated/thin-margin (movies) or
  organiser-set (events), BookMyShow's primary revenue line is a separate,
  ITEMISED convenience fee at checkout — it can vary by payment method and,
  for events, by tier, but is always shown transparently as its own line item.

PRICE FREEZE DURING THE HOLD:
  Whatever price applies — capped category price or current event tier — is
  SNAPSHOTTED onto the booking row the moment the seat hold is created and
  stays frozen for that hold's lifetime. Even if an event's tier sells out
  WHILE you're paying, you complete at the price you were quoted. This is
  implemented by storing price on the booking record at hold-time rather
  than recomputing it at confirm-time — a small detail, but it's the
  difference between "fair" and "bait-and-switch," and it's exactly the kind
  of thing a pricing-canary rollout needs to get right before going to 100%.`,
    followups: [
      "If a state government changes its multiplex price cap overnight, how would that change propagate — which shows are affected, and how?",
      "How would you A/B test a new convenience-fee structure without it looking like a bait-and-switch to users mid-booking?",
      "For events, who decides when to release a new pricing tier, and what telemetry would you surface to them to support that decision?",
    ],
  },
  {
    id: "bmsq6",
    category: "Architecture",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["BookMyShow", "IRCTC", "MakeMyTrip"],
    question: "Walk through what happens between a user tapping 'Pay' and getting a confirmed ticket — including all the ways it can fail.",
    answer: `The booking flow is a short SAGA — and almost every interesting failure mode is about what happens when one of its steps doesn't complete cleanly.

HAPPY PATH:
  1. POST /v1/bookings/hold {show_id, seat_ids, idempotency_key}
  2. Seat Lock Service Lua-locks all seats for 480s -> hold_id
  3. Booking Service creates the booking row (PENDING_PAYMENT) and computes
     and FREEZES the price
  4. Client redirected to Payment Service -> gateway
  5. Gateway webhook (payment.success) -> CONFIRM transaction: Postgres
     INSERT booking_seats + status=CONFIRMED, Redis seats LOCKED->BOOKED,
     emit booking.confirmed -> Kafka
  6. On failure/timeout: booking CANCELLED, seats revert when the Redis TTL
     sweeper fires (or are released immediately for faster UX)

IDEMPOTENCY:
  idempotency_key = device_id + show_id + hash(seat_ids) + time bucket.
  SET idem:{key} {booking_id} NX EX 120 — a retried "Pay" tap (double-tap,
  network retry) returns the SAME booking_id instead of re-running the Lua
  lock script, which would otherwise surface a confusing "seats unavailable"
  error for the user's OWN seats.

PAYMENT RETRY WITHOUT RE-LOCKING:
  If a payment attempt fails but time remains on the hold, Booking Service
  keeps status=PENDING_PAYMENT and issues a NEW payment intent against the
  SAME hold_id — no re-locking, since the seats are already safely held.

THE GRACE EXTENSION:
  UPI intent apps and bank 3DS pages occasionally exceed the 8-minute hold.
  The instant a user is redirected to the gateway, Booking Service extends
  the Redis TTL ONCE by +120s — capped per booking so a malicious client
  can't hold seats indefinitely by repeatedly "starting" payment.

THE RARE RACE — LOCK EXPIRES MID-PAYMENT:
  If payment STILL succeeds after the (extended) hold fully expired and the
  seat was re-sold, the CONFIRM step's Postgres write finds the seat already
  BOOKED under a different booking_id. This triggers a COMPENSATING
  TRANSACTION: the now-failed booking is CANCELLED, payment is auto-refunded,
  and the user is offered an equivalent seat or full refund with priority
  rebooking — handled gracefully rather than prevented, because preventing
  it would require holding seats indefinitely.

GROUP BOOKINGS — ALL-OR-NOTHING EXTENDS TO PAYMENT:
  "Bill My Friends" splits cost across multiple people, but the lock belongs
  to ONE booking_id. If not everyone pays within the hold window (including
  its grace extension), the ENTIRE booking fails and any partial payments are
  reversed — there is no "2 of 3 friends paid, here are 2 seats" outcome.

GATEWAY CHARGED THE USER BUT THE WEBHOOK NEVER ARRIVES:
  If the gateway charged the user but the success webhook is lost, the hold
  expires and seats revert. A reconciliation job (matching gateway
  transaction logs against bookings) later detects the orphaned charge and
  triggers a refund — the same class of problem as the compensating
  transaction above, just triggered by infrastructure failure instead of a
  timing race.`,
    followups: [
      "What if the payment gateway charged the user but the success webhook never arrives — how does the system reconcile that?",
      "How do you handle a user who force-closes the app mid-redirect to the payment gateway and reopens it 10 minutes later?",
      "Why use a one-time +120s grace extension instead of simply making the base hold TTL 10 minutes?",
    ],
  },
  {
    id: "bmsq7",
    category: "Reliability",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["BookMyShow", "Hotstar", "IRCTC"],
    question: "What's your strategy for keeping the rest of the platform stable while one specific show is experiencing a massive booking surge?",
    answer: `The guiding principle is BLAST-RADIUS CONTAINMENT scoped to the smallest unit that makes sense — usually a single show_id or a single region, never "the platform."

PER-SHOW SCOPING OF THE VIRTUAL WAITING ROOM:
  The admission queue, its admission rate, and any load-shedding throttle
  are all keyed by show_id. If Seat Lock Service's p99 degrades because of
  ONE mega-release's queue, the controller reduces ONLY that show's
  admission rate — every other show's booking flow (no active waiting room)
  is completely unaffected.

PER-SHOW REDIS DEGRADATION:
  If the Redis shard holding a specific show's seat map degrades, the system
  serves the LAST-KNOWN-GOOD seat map with a "may be slightly outdated"
  banner AND temporarily BLOCKS NEW LOCKS for that show specifically until
  the shard recovers. This prevents a stale-seat-map double-booking risk
  while every OTHER show — on different shards — remains fully bookable. The
  blast radius of a Redis issue is one show, not the platform.

CIRCUIT BREAKERS WITH GRACEFUL FALLBACKS:
  Dynamic-pricing service slow/down -> Booking Service falls back to the last
  FROZEN price tier rather than blocking the booking. A pricing outage
  degrades to "slightly stale prices," not "can't book."

DATABASE SHARDING BY REGION:
  Bookings and shows are sharded by region (North/West/South/East India),
  mirroring the per-region Istio control planes. A regional Postgres issue
  affects only that region's venues; read replicas absorb search/discovery
  load so booking-write capacity isn't shared with read traffic.

PRE-SCALING VS REACTIVE AUTOSCALING:
  Reactive Kubernetes HPA handles ordinary variation. But mega-release dates
  are KNOWN WEEKS IN ADVANCE — so Seat Lock/Booking/Payment Service are
  PRE-SCALED in the relevant region ~10-15 min before booking opens, a
  calendar-driven scale-up rather than a metric-triggered one. Reactive
  autoscaling alone would react AFTER the step-function spike already hit,
  which is too late for a spike that goes from zero to peak in under a
  second.

QUEUE-BASED LOAD LEVELLING FOR ORDINARY SPIKES:
  Even for non-mega-release shows, if Booking Service detects elevated
  latency, new hold requests are briefly queued in Kafka rather than
  rejected — "Confirming your seats..." instead of an error. The virtual
  waiting room handles the EXTREME, known-in-advance case; this handles
  ordinary, unplanned spikes with the same "informed wait beats an error"
  philosophy, just without the explicit queue-position UI.`,
    followups: [
      "How do you decide WHICH shows get pre-scaled ahead of time vs relying on reactive autoscaling alone?",
      "If one region's database shard goes down, what's the user-facing impact in that region vs every other region?",
      "How would you test the 'blast radius contained to one show' guarantee before a real mega-release, without risking the real one?",
    ],
  },
  {
    id: "bmsq8",
    category: "Estimation",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["BookMyShow", "Ticketmaster", "Hotstar"],
    question: "BookMyShow says it has '1M concurrent users' during a blockbuster booking-open. How would you turn that into actual capacity numbers for your services?",
    answer: `This is a great estimation question, because taking the "1M concurrent users" number at face value would lead you to over-engineer the wrong component entirely — the real chain of reasoning has THREE steps.

ASSUMPTIONS:
  At "booking opens" for a mega-release: ~1,000,000 concurrent users, and
  ~500,000 total seats released across that release's day-1 shows
  nationally. Seat-hold TTL = 480s; a typical user (including ones who
  abandon partway) occupies a hold for ~150s on average.

STEP 1 — the headline number sizes NOTHING directly:
  "1M concurrent users" tells you "a lot of people showed up at once" — it
  does not, by itself, tell you how big Redis needs to be, how many Booking
  Service pods to run, or anything actionable.

STEP 2 — the REAL constraint is the admission rate:
  Only 500,000 seats can EVER be successfully locked, full stop — no amount
  of capacity changes that. The Admission Controller throttles entry to Seat
  Lock Service at a rate calibrated to Booking/Payment Service capacity —
  roughly 830-2,000 admissions/sec depending on how aggressively it's tuned.
  At the upper end, draining 1M users takes ~500s (~8.3 min). THIS is the
  number that defines the user experience ("You are #214,302 in line — ~8
  min wait") and sizes the Admission Controller and its WebSocket
  queue-position fanout.

STEP 3 — Little's Law as a SANITY CHECK on Redis, not a sizing input:
  Using the rate at which the 500K seats fully drain (~830/sec over ~600s):
    concurrent_locks = arrival_rate x avg_hold_time ~ 830 x 150s ~ 124,500
  ~124,500 simultaneous keys-with-TTL is NOTHING for a single Redis node — it
  handles millions of keys. Redis was NEVER going to be the bottleneck; this
  calculation exists to PROVE that, not to size anything.

INTERVIEW PUNCH LINE:
  "Don't size Redis off the 1M headline — size the Admission Controller's
  throttle off downstream Booking/Payment capacity (step 2), then use
  Little's Law (step 3) to confirm the resulting Redis load is trivially
  within bounds. The headline number's only real job is setting the
  customer-facing wait-time estimate."`,
    followups: [
      "If the admission rate were doubled to clear the queue faster, what OTHER number in the system would you need to re-check?",
      "How would you size the WebSocket fleet for queue-position updates given 1M users sitting in the pre-queue simultaneously?",
      "What if a 'mega-release' turns out LESS popular than expected — does the admission controller know to back off, or does it just under-fill?",
    ],
  },
  {
    id: "bmsq9",
    category: "Architecture",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["BookMyShow", "Uber", "Zomato"],
    question: "BookMyShow already has explicit app-level guards (idempotency keys, admission tokens). Would you add a service mesh, and what would it concretely buy you?",
    answer: `Yes — and the key framing is the same as elsewhere in this series: the mesh operates at a different layer than the app-level guards, COMPLEMENTING rather than replacing them.

WHAT THE MESH ADDS AT EACH LAYER:

1. SEAT LOCK SERVICE — tight circuit breaking (outlierDetection,
   interval: 5s, baseEjectionTime: 15s, maxEjectionPercent: 50):
   This is the hottest, most latency-sensitive hop — every seat tap is a
   synchronous Lua-script call gated by the Admission Controller's p99 check.
   A single slow replica left in rotation for even a few seconds would back
   up the ENTIRE virtual-waiting-room queue, since admission RATE itself
   depends on this service's latency. The mesh ejects that replica within
   one interval — far faster than app-level retry logic alone would react.

2. BOOKING SERVICE — load balancing ONLY, explicitly NO outlierDetection:
   Every in-flight booking holds saga state (an active seat lock, a pending
   payment intent) across multiple requests. Ejecting a replica based on 5xx
   rate would orphan that saga and trigger the compensating-transaction path
   unnecessarily — a replica mid-saga isn't "unhealthy," it's "busy."
   LEAST_REQUEST spreads NEW holds without disturbing in-flight ones.

3. VIRTUALSERVICE CANARY on Booking Service:
   Routes 5% of header-matched traffic to a new build before full rollout —
   specifically valuable for the dynamic-pricing computation, where a bug
   means every booking confirmed during the rollout window carries a wrong
   total.

4. AUTHORIZATIONPOLICY on Payment Service:
   Only Booking Service's mesh identity can call /internal/payments/intent
   and /internal/payments/refund — enforced at the INFRASTRUCTURE layer,
   independent of application code. This is the mesh-level twin of the
   booking_seats uniqueness guarantee: Postgres ensures no seat is
   double-booked; AuthorizationPolicy ensures no service but Booking Service
   can ever move money tied to that seat.

5. mTLS + TRACING across all 5 in-mesh services — every hop in the
   hold -> price -> pay -> confirm chain is traced, which matters when
   debugging the rare lock-expiry-mid-payment compensating transactions.

WHAT STAYS OUT:
  Kafka, Postgres, Redis (seat-lock store + waiting-room queue),
  Elasticsearch, S3/CDN — Redis especially sits on the seat-lock hot path,
  where an extra Envoy hop is pure cost with no L7 policy benefit.

WHY PER-REGION CONTROL PLANES:
  Istio runs per-region (North/West/South/East India), mirroring both the
  regional database sharding and the regional seat/show inventory
  partitioning. A control-plane incident in one region's mesh never touches
  another region's mega-release — and sidecars fail open on last-known
  config, so even a control-plane outage doesn't block bookings.

THE HONEST TRADE-OFF:
  ~1-2ms sidecar tax is negligible against the <5s booking-confirmation SLA
  in steady state — but Seat Lock Service's OWN latency budget under
  admission-controlled peak load is closer to 20-30ms, making its tax a
  comparatively larger (if still small) fraction. Worth it given what
  outlierDetection buys at exactly that service.`,
    followups: [
      "Seat Lock Service's outlierDetection caps ejection at maxEjectionPercent: 50 — what happens if MORE than half the replicas are genuinely unhealthy, e.g. during a botched deploy?",
      "How would the pricing canary differ for a movie show (regulated category pricing) vs an event show (tiered dynamic pricing), given they're different code paths in Booking Service?",
      "Why does per-region mTLS + control planes matter more here than it would for, say, a single global Istio deployment?",
    ],
  },
];
