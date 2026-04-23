export const UBER_HLD = {
  title: "Uber — High Level Design",
  subtitle: "Real-time ride matching for 130M monthly users across 70+ countries",
  overview: `Uber is a real-time marketplace that matches riders to drivers within seconds.
The core engineering challenge: location updates from millions of moving vehicles, sub-second matching decisions, and consistent pricing — all at global scale.

Three planes: Control (trip lifecycle, auth, billing), Real-Time (location tracking, matching), and Communication (notifications, maps/ETA).`,

  diagram: `
┌──────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                  │
│             Rider App (iOS/Android)  ·  Driver App (iOS/Android)     │
└────────────────────────┬────────────────────┬────────────────────────┘
                         │  REST / WebSocket  │  WebSocket (location)
                         ▼                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    API GATEWAY  (Kong / Envoy)                       │
│           Auth · Rate Limiting · Routing · Load Balancing            │
└──┬──────────────┬───────────────┬────────────────┬───────────────────┘
   │              │               │                │
   ▼              ▼               ▼                ▼
┌──────┐    ┌──────────┐   ┌──────────┐    ┌──────────────┐
│ Trip │    │ Location │   │ Matching │    │   Pricing    │
│Service│   │ Service  │   │ Service  │    │   Service    │
└──────┘    └────┬─────┘   └────┬─────┘    └──────────────┘
                 │              │
                 ▼              ▼
           ┌──────────┐  ┌──────────────┐
           │  Redis   │  │   Dispatch   │
           │(geo idx) │  │   Engine     │
           └──────────┘  └──────────────┘
   │              │               │                │
   ▼              ▼               ▼                ▼
┌──────────┐ ┌────────┐  ┌─────────────┐  ┌──────────────┐
│  Payment │ │  Maps  │  │Notification │  │   Analytics  │
│  Service │ │  ETA   │  │   Service   │  │ Kafka+Flink  │
└──────────┘ └────────┘  └─────────────┘  └──────────────┘
                         │               │
                         ▼               ▼
                 ┌──────────────────────────────┐
                 │        DATA LAYER            │
                 │  PostgreSQL · Cassandra      │
                 │  Redis · S3 · Kafka          │
                 └──────────────────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Core Architecture",
      sections: [
        {
          title: "How Uber Works — Booking to Drop-off",
          content: `The 6-step lifecycle of every Uber trip:

1. RIDER REQUESTS TRIP
   • Rider opens app → GPS location sent to Location Service
   • Rider selects pickup → fare estimate from Pricing Service
   • Rider confirms → Trip Service creates trip record (state: REQUESTED)

2. MATCHING — Driver Assignment (< 30 seconds)
   • Dispatch Engine queries nearby available drivers from Redis geo-index
   • Scores candidates: distance + acceptance rate + rating
   • Sends push notification to best driver
   • Driver accepts → trip state: ACCEPTED
   • If driver rejects/no response → next driver in queue

3. EN ROUTE TO PICKUP
   • Driver location streamed via WebSocket every 4 seconds
   • Rider app shows real-time driver movement on map
   • ETA Service continuously recalculates arrival time
   • Trip state: DRIVER_EN_ROUTE

4. PICKUP CONFIRMATION
   • Driver marks "Arrived" → push notification to rider
   • Driver marks "Started Trip" → trip state: IN_PROGRESS
   • Fare meter starts

5. TRIP IN PROGRESS
   • Driver location tracked continuously
   • Route compared to Maps API — deviation detection
   • Fare accumulates: base_fare + (time_rate × minutes) + (distance_rate × km)

6. DROP-OFF & PAYMENT
   • Driver marks "End Trip" → trip state: COMPLETED
   • Final fare calculated, payment charged
   • Rating prompts sent to both parties
   • Driver earnings settled (weekly batch or instant payout)`,
        },
        {
          title: "Real-Time Location Tracking — The Core Problem",
          content: `Location tracking is Uber's hardest systems problem.

Scale:
• 5M+ active drivers globally during peak
• Each driver sends location every 4 seconds
• 5M ÷ 4s = 1.25M location updates/second

Naive approach (write to DB every update):
1.25M writes/sec to PostgreSQL → impossible

Uber's solution — Redis geospatial index:

1. Driver app sends: { driver_id, lat, lng, timestamp } every 4s
2. Location Service writes to Redis:
   GEOADD city:drivers:available <lng> <lat> <driver_id>
   (O(log N) insert, expires if not updated within 30s → driver appears offline)

3. Matching queries:
   GEORADIUS city:drivers:available <pickup_lng> <pickup_lat> 5km ASC
   Returns sorted list of available drivers within 5km

4. Simultaneously → Kafka topic: driver-locations
   • Consumed by trip tracking (show driver on rider's map)
   • Consumed by analytics (heatmaps, supply forecasting)
   • Consumed by fraud detection (impossible speed checks)`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Matching & Dispatch",
      sections: [
        {
          title: "Dispatch Engine — Driver Assignment Algorithm",
          content: `The Dispatch Engine is Uber's real-time optimization core.

Inputs:
• Trip request: pickup lat/lng, product type (UberX/Pool/Black)
• Available drivers: from Redis geo-index
• Driver attributes: rating, acceptance rate, distance, vehicle type

Scoring function per candidate driver:
  score = w1 × (1/ETA_seconds)        ← closer is better
        + w2 × acceptance_rate         ← reliable drivers preferred
        + w3 × driver_rating           ← quality signal
        + w4 × trip_acceptance_bonus   ← reward drivers who accept quickly
        - penalty if on surge boundary ← avoid split-surge confusion

Dispatch algorithm (simplified):
1. GEORADIUS → get all available drivers within 5km
2. Filter: vehicle_type matches, driver_status = available
3. Score each driver using above function
4. Send offer to top-scored driver with 15s timeout
5. If declined/timeout → send to next driver in list
6. Repeat until accepted or no drivers found (→ show "no drivers" to rider)

ETA calculation:
• Not straight-line distance — uses actual road network
• Mapbox/Google Maps API for real turn-by-turn ETA
• Uber's own routing engine (H3 hexagonal grid + precomputed paths) for sub-100ms lookups`,
        },
        {
          title: "H3 Hexagonal Grid — Geospatial Indexing",
          content: `Uber built H3, an open-source hexagonal geographic grid system.

Why hexagons over squares or circles?
• All 6 neighbors are equidistant from center (unlike square grids)
• No overlaps, no gaps — perfect tesselation of Earth's surface
• Hierarchical: resolution 0 (huge) → resolution 15 (1m²)
• Resolution 8 (avg area: 0.74 km²) used for supply/demand heatmaps

How Uber uses H3:
1. Divide city into H3 hexagons at resolution 8
2. Count available drivers per hexagon → supply map
3. Count open trip requests per hexagon → demand map
4. Supply/demand ratio → surge multiplier per hexagon
5. Driver app shows heatmap: "Go here, demand is high"

Benefits:
• Consistent cell sizes globally (vs lat/lng which vary by latitude)
• Fast polygon lookup: "which hexagon is this coordinate in?" = O(1)
• Hierarchical aggregation: resolution 8 → 7 → 6 for zooming out`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Pricing & Surge",
      sections: [
        {
          title: "Surge Pricing — Dynamic Pricing Algorithm",
          content: `Surge pricing balances supply and demand in real time.

Core formula:
  surge_multiplier = f(demand / supply)

  demand = open trip requests in area (last 5 min)
  supply = available drivers in area (last 5 min)

Multiplier tiers (Uber's actual logic is ML-based, conceptually):
  ratio < 1.0   → 1.0×  (normal, supply > demand)
  ratio 1.0-1.5 → 1.25×
  ratio 1.5-2.0 → 1.5×
  ratio 2.0-2.5 → 2.0×
  ratio > 2.5   → 2.5× or higher (capped by region regulations)

Update frequency: Every 1 minute per H3 hexagon

Why surge works (economic theory):
• High price → riders who need it most continue; casual riders wait
• High price → more drivers come online (earnings incentive)
• Natural rebalancing: surge falls as supply rises / demand falls

Anti-gaming safeguards:
• Minimum 15 min before surge activates (prevents instant spikes)
• Upfront pricing: rider sees exact fare at booking (no surprise at end)
• Surge cap: max multiplier is region-specific (often 5.9× max)
• Events pricing: pre-announced surge for concerts/sports games`,
        },
        {
          title: "Fare Calculation & Upfront Pricing",
          content: `Uber moved from metered pricing to upfront pricing in 2016.

Upfront pricing components:
  base_fare       = fixed per product (UberX: $1.20)
  booking_fee     = fixed ($2.75 in US)
  distance_cost   = estimated_km × per_km_rate
  time_cost       = estimated_minutes × per_min_rate
  surge_multiplier = H3 hex surge at time of request
  ─────────────────────────────────────────────────
  total_fare      = (base + distance_cost + time_cost) × surge

Route estimation at booking:
• Mapbox API: best-guess route + ETA (not live traffic yet)
• If actual trip is significantly longer (detour): fare adjusted up
• If traffic was worse than predicted: Uber absorbs the difference

Why upfront pricing?
• Rider anxiety: "how much will this cost?" eliminated
• Surge clarity: rider knows exact multiplier before accepting
• Better conversion: pricing transparency = more bookings

Dynamic fare adjustments:
• Major detour by driver: auto-detection via GPS vs route
• Traffic delay: Uber's policy absorbs minor overruns
• Long wait at pickup: wait time fee after 2-minute grace period`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Data & Storage",
      sections: [
        {
          title: "Storage Architecture",
          content: `Purpose-built storage for each data type:

POSTGRESQL (Trips, Users, Payments):
• Source of truth for all financial transactions
• ACID compliance for payment consistency
• Sharded by city/region → each shard serves one geography
• Read replicas for analytics queries

REDIS (Location, Sessions, Surge):
• Driver geo-index: GEOADD / GEORADIUS (sub-millisecond)
• Session cache: active trip state, driver availability
• Surge multiplier cache: per-hexagon, updated every 60s
• TTL-based expiry: driver disappears from index after 30s without update

CASSANDRA (Trip History, Driver Earnings, Ratings):
• Write-heavy: millions of trip completions per day
• Time-series queries: "all trips by driver in last 30 days"
• Cross-region replication — trip history accessible globally
• Wide-column model: partition by driver_id or user_id

KAFKA (Event Stream):
• All location updates → driver-locations topic
• All trip state changes → trip-events topic
• All payment events → payment-events topic
• Flink consumers: real-time analytics, fraud detection, supply forecasting

S3 (Documents, Receipts, Maps Data):
• Driver onboarding documents (license, insurance)
• Trip receipts (PDF)
• Pre-computed routing graphs for cities`,
        },
        {
          title: "Kafka — Event-Driven Architecture",
          content: `Every Uber action produces an event consumed by multiple services.

Key topics:
• driver-locations (partitioned by city)
  → Consumer: Trip tracking (rider sees driver moving)
  → Consumer: Fraud detection (impossible speed check)
  → Consumer: Supply analytics (driver density heatmaps)
  → Consumer: ETA recalculation

• trip-events (partitioned by trip_id)
  → Consumer: Notification Service (push alerts)
  → Consumer: Payment Service (charge on COMPLETED)
  → Consumer: Driver earnings (update balance)
  → Consumer: Rating Service (prompt after COMPLETED)

• payment-events (partitioned by user_id, exactly-once)
  → Consumer: Fraud detection
  → Consumer: Receipts Service (send email/SMS)
  → Consumer: Finance reconciliation

Why event-driven?
• Services are decoupled — Notification Service doesn't need to know about Trips
• Easy to add new consumers (A/B test, new feature) without changing producers
• Replay capability — re-process historical events for ML training`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "Reliability & Scale",
      sections: [
        {
          title: "Handling 1.25M Location Updates/Second",
          content: `Location service is the highest-throughput component in Uber.

Problem:
• 5M drivers × 1 update/4s = 1.25M writes/sec
• Cannot write to DB directly — no DB handles this

Solution — Write Aggregation Pipeline:

1. Driver App → WebSocket connection to Location Service
2. Location Service (stateless, horizontally scaled):
   • Validates the update (auth check, sanity check on speed)
   • Writes to Redis geospatial index (< 1ms)
   • Publishes to Kafka (async, fire-and-forget)
   • Returns 200 immediately — doesn't wait for anything downstream

3. Redis handles the "where are drivers right now?" query
   • GEOADD = O(log N) per insert
   • Auto-expiry: if no update for 30s → driver removed from index
   • All-in-memory → sub-millisecond reads

4. Kafka handles "what did drivers do?" queries (persistence)
   • Trip tracking consumer: updates trip's last-known-location
   • Writes to Cassandra every 30s (batched) for historical record

Scale math:
  1.25M updates/sec × 100 bytes = 125 MB/sec into Kafka
  Kafka handles this easily with 50 partitions on driver-locations topic`,
        },
        {
          title: "Cell Architecture — City-Level Isolation",
          content: `Uber uses a Cell Architecture to prevent global failures.

Design:
• Each major city is an independent "cell"
• Mumbai cell: own DB shard, own Redis cluster, own Kafka cluster
• London cell: completely separate infrastructure
• Cross-cell: only for user account data (login works globally)

Benefits:
• Blast radius isolation: Mumbai outage doesn't affect London
• Regulatory compliance: trip data stays in country (GDPR, India data laws)
• Latency: Mumbai users hit Mumbai infrastructure — no cross-continent hops
• Independent scaling: surge pricing in London doesn't affect Mumbai resources

Global services (shared across cells):
• Auth Service — login must work globally
• User profile — account data travels with user
• Payment Service — cross-border payments, multi-currency

Cell routing:
• Client IP → nearest cell endpoint via Anycast DNS
• If rider travels internationally: home cell migrates session to new cell`,
        },
      ],
    },
    {
      id: "phase6",
      label: "Phase 6",
      title: "Maps & ETA",
      sections: [
        {
          title: "ETA Prediction — More Than Just Google Maps",
          content: `Uber's ETA is a core product feature — accuracy directly impacts trust.

Why ETA is hard:
• Road network is dynamic — accidents, construction, rush hour
• Google Maps ETA = typical conditions
• Uber needs: "ETA given THIS driver, THIS route, THIS exact moment"

Uber's ETA stack:

Layer 1 — Base graph:
• Road network as directed weighted graph
• Nodes = intersections, Edges = road segments
• Edge weight = travel time in normal conditions
• Pre-computed shortest paths (Dijkstra's algorithm, H3-partitioned)

Layer 2 — Real-time traffic:
• Uber drivers are passive traffic sensors
• Actual speed of Uber drivers on each road segment → traffic model
• Updates road segment weights every 5 minutes
• "Crowd-sourced Waze" — Uber has millions of vehicles reporting

Layer 3 — ML model:
• Input: route, time of day, day of week, weather, local events
• Historical ETA accuracy → model learns that "route X on Friday 6pm = 30% longer"
• Trained on billions of historical trips
• Output: probabilistic ETA (p50 = 8 min, p90 = 12 min)

Layer 4 — Pickup complexity:
• ETA to pickup includes: "will driver find parking?"
• Airport arrivals: terminal complexity, traffic restrictions
• Model trained on historical pickup delay by location type`,
        },
      ],
    },
  ],

  metrics: [
    { label: "Monthly Active Users", value: "130M+", note: "riders globally" },
    { label: "Trips per day", value: "25M+", note: "at peak" },
    { label: "Countries", value: "70+", note: "across 10,000+ cities" },
    { label: "Location updates/sec", value: "1.25M", note: "peak, 5M active drivers" },
    { label: "Match time", value: "< 30s", note: "rider to driver assignment" },
    { label: "ETA accuracy", value: "p90 ±2min", note: "within 2 min of actual" },
    { label: "Availability", value: "99.99%", note: "booking API SLA" },
    { label: "Payment processing", value: "< 2s", note: "end-of-trip charge time" },
  ],
};

export const UBER_LLD = {
  title: "Uber — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of core Uber services",

  components: [
    {
      id: "tripService",
      title: "Trip Service — LLD",
      description: "Trip lifecycle state machine — from REQUEST to COMPLETED",
      api: `Trip State Machine:
REQUESTED → ACCEPTED → DRIVER_EN_ROUTE →
DRIVER_ARRIVED → IN_PROGRESS → COMPLETED | CANCELLED

PostgreSQL Schema:

CREATE TABLE trips (
  trip_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id      UUID NOT NULL,
  driver_id     UUID,                   -- null until matched
  status        trip_status NOT NULL,   -- enum above
  product_type  TEXT NOT NULL,          -- UberX, UberBlack, etc.

  -- Location
  pickup_lat    DECIMAL(9,6) NOT NULL,
  pickup_lng    DECIMAL(9,6) NOT NULL,
  pickup_addr   TEXT,
  dropoff_lat   DECIMAL(9,6),           -- null until driver sets
  dropoff_lng   DECIMAL(9,6),
  dropoff_addr  TEXT,

  -- Timing
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at   TIMESTAMPTZ,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,

  -- Fare
  estimated_fare_cents  INT NOT NULL,
  actual_fare_cents     INT,            -- set on COMPLETED
  surge_multiplier      DECIMAL(3,2) NOT NULL DEFAULT 1.0,
  currency              CHAR(3) NOT NULL DEFAULT 'USD',

  -- City cell routing
  city_id       TEXT NOT NULL,          -- 'mumbai', 'new_york', etc.

  CONSTRAINT trips_driver_required CHECK (
    status = 'REQUESTED' OR driver_id IS NOT NULL
  )
);

CREATE INDEX trips_rider_status ON trips (rider_id, status, requested_at DESC);
CREATE INDEX trips_driver_status ON trips (driver_id, status, requested_at DESC);
CREATE INDEX trips_city_requested ON trips (city_id, requested_at DESC);

-- State transition API
PATCH /api/v1/trips/{tripId}/status
Body: { "status": "ACCEPTED", "driverId": "d_123" }
Response: { "trip": {...}, "previousStatus": "REQUESTED" }

-- Optimistic locking on status transitions:
UPDATE trips SET status = $newStatus, driver_id = $driverId
WHERE trip_id = $tripId AND status = $expectedPreviousStatus
RETURNING *;
-- Returns 0 rows → conflict, retry or return 409`,
      internals: `State transition validation:
• Only valid transitions allowed (enforced in service layer + DB constraint):
  REQUESTED   → ACCEPTED | CANCELLED
  ACCEPTED    → DRIVER_EN_ROUTE | CANCELLED
  DRIVER_EN_ROUTE → DRIVER_ARRIVED | CANCELLED
  DRIVER_ARRIVED  → IN_PROGRESS | CANCELLED
  IN_PROGRESS → COMPLETED

• Each transition publishes event to Kafka trip-events topic
• Consumers react: Notifications (push to rider/driver),
  Payment (charge on COMPLETED), Rating (prompt after COMPLETED)

• Optimistic concurrency: every status update checks previous state
  Prevents race condition: two drivers can't both accept same trip

Cancellation policy:
• Rider cancels after driver accepted → cancellation fee if > 5 min
• Driver cancels → trip re-dispatched immediately to next driver
• Auto-cancel: trip in REQUESTED state for > 5 min → no drivers available`,
    },
    {
      id: "locationService",
      title: "Location Service — LLD",
      description: "1.25M location updates/sec — Redis geo-index + Kafka fanout",
      api: `WebSocket Protocol (Driver → Server):

Connection: wss://location.uber.com/driver/{driverId}
Auth: Bearer token in header

// Driver sends every 4 seconds:
{
  "type": "LOCATION_UPDATE",
  "lat": 12.9716,
  "lng": 77.5946,
  "bearing": 245,         // direction of travel (degrees)
  "speed_kmh": 34,
  "accuracy_m": 8,        // GPS accuracy
  "timestamp": "2026-04-23T10:00:00.123Z",
  "trip_id": "t_abc"      // null if not on trip
}

// Server acknowledges every 5th update (reduces ACK overhead):
{ "type": "ACK", "seq": 5 }

// Server pushes to driver:
{ "type": "TRIP_OFFER", "trip_id": "t_xyz", "pickup": {...}, "ttl_sec": 15 }

Redis Commands:
// Add/update driver in geo-index:
GEOADD city:mumbai:drivers:available 77.5946 12.9716 "driver_123"
EXPIRE city:mumbai:drivers:available:driver_123 30  // TTL

// Query drivers near pickup:
GEORADIUS city:mumbai:drivers:available 77.5900 12.9700 5 km
  ASC COUNT 20 WITHCOORD WITHDIST

// Mark driver unavailable (on trip):
ZREM city:mumbai:drivers:available driver_123
GEOADD city:mumbai:drivers:on_trip 77.5946 12.9716 "driver_123"`,
      internals: `Write path (4s update cycle):
1. WebSocket server receives update
2. Validate: auth token valid? speed < 200 km/h? lat/lng in valid range?
3. Redis GEOADD → geo-index updated (< 1ms, non-blocking)
4. Publish to Kafka driver-locations topic (async)
5. Return ACK (every 5th message to reduce traffic)

WebSocket connection management:
• Sticky sessions: each driver connection persists to same server node
• Connection ID → driver_id mapping in Redis (for server-sent events)
• Heartbeat: server pings every 10s, closes connection on no pong in 15s
• Reconnect: driver app reconnects with exponential backoff (1s, 2s, 4s, max 30s)

Fraud detection (real-time, Flink consumer):
• Speed > 200 km/h between consecutive updates → flag as GPS spoof
• Location teleports (> 50 km in 4s) → flag trip for review
• Pattern: GPS signal suddenly perfect circles → suspected bot
• Actions: warn driver, hold payment, escalate to safety team

Driver availability state machine:
  OFFLINE → AVAILABLE (driver goes online)
  AVAILABLE → ON_TRIP (trip accepted)
  ON_TRIP → AVAILABLE (trip completed)
  AVAILABLE → OFFLINE (driver goes offline, or 30s TTL expires)`,
    },
    {
      id: "pricingService",
      title: "Pricing Service — LLD",
      description: "Upfront fare estimation + real-time surge calculation per H3 hexagon",
      api: `POST /api/v1/pricing/estimate
Request:
{
  "pickup": { "lat": 12.9716, "lng": 77.5946 },
  "dropoff": { "lat": 12.9352, "lng": 77.6245 },
  "product_type": "UberX",
  "rider_id": "r_123"    // for promotions lookup
}

Response:
{
  "fare_breakdown": {
    "base_fare_cents": 120,
    "distance_cents": 340,      // estimated_km × per_km_rate
    "time_cents": 180,          // estimated_min × per_min_rate
    "booking_fee_cents": 275,
    "surge_multiplier": 1.5,
    "surge_active": true,
    "promo_discount_cents": 0
  },
  "total_fare_cents": 1373,
  "currency": "INR",
  "eta_minutes": 4,
  "route": { "polyline": "encoded_route_string", "distance_km": 5.2 },
  "fare_expires_at": "2026-04-23T10:05:00Z"    // 5 min to confirm
}

Surge data structure (Redis):
// Stored per H3 hexagon at resolution 8:
SET surge:city:mumbai:hex:8928308280fffff  1.5  EX 120
// Refreshed every 60 seconds by Surge Calculator job

// Surge Calculator reads:
HGET supply:city:mumbai:hex:8928308280fffff  // available drivers count
HGET demand:city:mumbai:hex:8928308280fffff  // open requests count`,
      internals: `Pricing formula (simplified):
  base = config[city][product_type].base_fare
  distance_cost = route_km × config[city][product_type].per_km_rate
  time_cost = route_min × config[city][product_type].per_min_rate
  surge = get_surge(pickup_h3_hex)
  promo = check_promotions(rider_id)
  total = (base + distance_cost + time_cost) × surge - promo

  Minimum fare enforced: max(total, config[city][product_type].min_fare)

H3 hex lookup (O(1)):
  pickup_h3 = h3.from_geo(lat, lng, resolution=8)
  surge = redis.GET("surge:city:{city}:hex:{pickup_h3}") or 1.0

Surge Calculator (runs every 60s per city, cron job):
  For each H3 hex in city:
    supply = count GEORADIUS drivers within hex bounds (last 5 min)
    demand = count trip requests within hex bounds (last 5 min)
    ratio  = demand / max(supply, 1)
    surge  = surge_table[ratio_bucket]    // step function
    redis.SETEX(hex_key, surge, 120)      // 2 min TTL

Price locking:
  Rider sees $12.50 → confirms booking → fare locked for 5 minutes
  If driver takes longer route, Uber absorbs overrun up to 20%
  Beyond 20%: rider charged actual fare (shown in app with explanation)`,
    },
    {
      id: "matchingService",
      title: "Dispatch Engine — LLD",
      description: "Sub-30 second driver assignment — scoring, offering, and fallback",
      api: `POST /internal/dispatch/assign
(Called by Trip Service when trip created)

Request:
{
  "trip_id": "t_abc123",
  "pickup": { "lat": 12.9716, "lng": 77.5946, "h3_hex": "8928308280fffff" },
  "product_type": "UberX",
  "rider_id": "r_123",
  "estimated_fare_cents": 1373,
  "city_id": "mumbai"
}

Response (async — result via Kafka trip-events):
{ "status": "DISPATCHING", "dispatch_id": "disp_xyz" }

// Driver offer (sent via WebSocket push):
{
  "type": "TRIP_OFFER",
  "trip_id": "t_abc123",
  "pickup": { "lat": 12.9716, "lng": 77.5946, "address": "MG Road" },
  "pickup_eta_minutes": 4,
  "estimated_fare_cents": 1373,
  "expires_at": "2026-04-23T10:00:15Z"   // 15 second window
}

// Driver accepts:
POST /api/v1/driver/trips/{tripId}/accept
{ "driver_id": "d_456" }

// Driver declines:
POST /api/v1/driver/trips/{tripId}/decline
{ "driver_id": "d_456", "reason": "too_far" }`,
      internals: `Dispatch loop (runs per trip request):

1. CANDIDATE FETCH:
   candidates = GEORADIUS pickup 5km ASC COUNT 50
   If < 5 candidates: expand radius to 10km

2. FILTER:
   Remove drivers: not UberX certified, on another trip,
                   acceptance_rate < 0.4, previously declined this rider

3. SCORE each candidate:
   eta_score = 1 / max(road_eta_seconds, 1)         // inverse ETA
   quality_score = driver.rating / 5.0
   reliability_score = driver.acceptance_rate
   score = 0.5 × eta_score + 0.3 × reliability_score + 0.2 × quality_score

4. OFFER to top driver:
   Send WebSocket push → 15 second TTL
   Store in Redis: dispatch:{trip_id} = {driver_id, expires_at}

5. ON ACCEPT:
   SREM city:drivers:available driver_id   // remove from pool
   GEOADD city:drivers:on_trip ...         // move to on-trip index
   Publish trip-events: ACCEPTED
   Notify rider (push notification + WebSocket update)

6. ON DECLINE / TIMEOUT:
   offer_count++
   If offer_count < 10: go to step 3, next driver
   If offer_count = 10: expand radius, restart from step 1
   If no driver found after 5 min: notify rider, cancel trip

Parallel dispatch (UberPool):
  Multiple passengers share → dispatch runs for each independently
  Post-match: routes merged if pickups within 3km and routes overlap > 40%`,
    },
    {
      id: "notificationService",
      title: "Notification Service — LLD",
      description: "Multi-channel real-time alerts — push, SMS, in-app for 130M users",
      api: `POST /internal/notifications/send
{
  "recipient_id": "r_123",
  "recipient_type": "rider",         // rider | driver
  "event_type": "DRIVER_ACCEPTED",   // determines template
  "data": {
    "driver_name": "Rahul",
    "driver_rating": 4.8,
    "vehicle": "Swift Dzire • KA01AB1234",
    "eta_minutes": 4,
    "trip_id": "t_abc123"
  },
  "channels": ["push", "in_app"],    // SMS only for critical events
  "priority": "high"                  // high | normal | low
}

Event → Template mapping:
  TRIP_REQUESTED     → "Looking for a driver nearby..."
  DRIVER_ACCEPTED    → "{name} is on the way · {eta} min"
  DRIVER_ARRIVED     → "Your driver has arrived!"
  TRIP_STARTED       → "Enjoy your ride to {destination}"
  TRIP_COMPLETED     → "You've arrived! Rate {name}"
  PAYMENT_CHARGED    → "₹{amount} charged to {card_last4}"
  DRIVER_CANCELLED   → "Your driver cancelled. Finding a new one..."

Push payload (FCM / APNs):
{
  "to": "{device_fcm_token}",
  "priority": "high",
  "notification": {
    "title": "Rahul is on the way",
    "body": "4 min away · Swift Dzire · KA01AB1234"
  },
  "data": {
    "trip_id": "t_abc123",
    "screen": "trip_tracking",       // deep link
    "driver_lat": "12.9800",
    "driver_lng": "77.5900"
  }
}`,
      internals: `Channel priority logic:
• PUSH first (instant, free, requires app installed + permission)
• SMS fallback if push fails (device offline, no permission) — costs money
• In-app always sent (shown on next app open if push missed)

Push infrastructure:
• FCM (Android) + APNs (iOS): both support 4KB payload
• Device tokens stored in Redis: user:{id}:push_token → token
• Token rotation: device generates new token → app updates Redis on launch
• Batch sends: Notification Service → FCM batch API (up to 500/request)

SMS via Twilio (fallback only):
  Trigger: push delivery receipt not received within 30s
  Priority events only: DRIVER_ARRIVED, PAYMENT_FAILED, SAFETY_ALERT

Rate limiting:
  Max 10 notifications per rider per trip (prevents spam)
  Silent push (no sound) for low-priority: driver location updates
  DRIVER_EN_ROUTE: push every 2 min (not every 4s location update)

Kafka consumer (trip-events topic):
  ON DRIVER_ACCEPTED:  → push to rider (driver details + ETA)
                       → push to driver (navigation start)
  ON DRIVER_ARRIVED:   → push to rider (high priority)
  ON TRIP_COMPLETED:   → push to both (receipt + rating prompt)
  ON PAYMENT_CHARGED:  → push + email receipt to rider`,
    },
    {
      id: "paymentService",
      title: "Payment Service — LLD",
      description: "Idempotent payment processing — exactly-once charges, multi-method",
      api: `POST /internal/payments/charge
{
  "trip_id": "t_abc123",
  "rider_id": "r_123",
  "amount_cents": 1373,
  "currency": "INR",
  "idempotency_key": "trip_t_abc123_charge_1",   // prevents double-charge
  "payment_method": {
    "type": "card",
    "token": "pm_stripe_token_xyz"               // tokenized, never raw card
  }
}

Response:
{
  "charge_id": "ch_abc",
  "status": "succeeded",           // succeeded | failed | pending
  "amount_charged_cents": 1373,
  "payment_method_last4": "4242",
  "charged_at": "2026-04-23T10:30:00Z"
}

Payment methods table (PostgreSQL):
CREATE TABLE payment_methods (
  method_id    UUID PRIMARY KEY,
  user_id      UUID NOT NULL,
  type         TEXT NOT NULL,       -- card | upi | cash | wallet
  provider     TEXT NOT NULL,       -- stripe | razorpay | braintree
  token        TEXT NOT NULL,       -- provider's tokenized reference
  last4        CHAR(4),
  is_default   BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

Charges table:
CREATE TABLE charges (
  charge_id        UUID PRIMARY KEY,
  trip_id          UUID NOT NULL REFERENCES trips(trip_id),
  idempotency_key  TEXT UNIQUE NOT NULL,    -- prevents double charge
  amount_cents     INT NOT NULL,
  currency         CHAR(3) NOT NULL,
  status           TEXT NOT NULL,           -- pending|succeeded|failed|refunded
  provider_charge_id TEXT,                  -- Stripe/Razorpay charge ID
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
      internals: `Idempotency (most critical property):
  Every charge has an idempotency_key = "trip_{id}_charge_{attempt}"
  Before charging:
    existing = SELECT FROM charges WHERE idempotency_key = $key
    IF existing: return existing result (don't charge again)
    ELSE: proceed with charge

  This prevents double-charge if:
  - Network retry after payment gateway timeout
  - Server crash after charge but before response saved
  - Client retry on 5xx response

Payment flow (exactly-once semantics):
1. INSERT charges(idempotency_key, status='pending') — reserve the slot
2. Call payment provider API (Stripe/Razorpay)
3. UPDATE charges SET status='succeeded', provider_charge_id=...
4. Publish payment-events to Kafka
5. IF provider call fails: UPDATE charges SET status='failed'
6. Return result

Driver payout architecture:
  Uber collects fare → holds in escrow
  Weekly batch: sum all driver trips → transfer to driver bank account
  Instant cashout (optional): driver requests → Uber charges 1.5% fee

Refund flow:
  POST /internal/payments/refund
  { charge_id, amount_cents, reason }
  → Stripe refund API → UPDATE charges SET status='refunded'
  → Publish to payment-events for reconciliation`,
    },
  ],
};

export const UBER_QNA = [
  {
    id: "uq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Uber", "Lyft", "DoorDash"],
    question: "Design Uber at a high level. How does a ride request get matched to a driver?",
    answer: `Start with clarifying questions:
• Scale: 25M trips/day, 5M active drivers, 130M monthly users
• Features in scope: request, match, track, pay, rate
• Non-functional: match < 30s, location accuracy < 10m, 99.99% uptime

Then structure the answer around the trip lifecycle:

THE 4-COMPONENT CORE:
1. Location Service — real-time position of all drivers (Redis geo-index)
2. Dispatch Engine — matches trip request to best available driver
3. Trip Service — state machine managing trip lifecycle
4. Pricing Service — upfront fare + surge calculation

THE MATCHING FLOW (what interviewers focus on):
a. Rider submits pickup → Trip Service creates trip (state: REQUESTED)
b. Dispatch Engine: GEORADIUS pickup_location 5km → candidate drivers
c. Score each driver: 0.5×(1/ETA) + 0.3×acceptance_rate + 0.2×rating
d. Send offer to #1 driver via WebSocket, 15s TTL
e. Accept → trip state: ACCEPTED, driver removed from available pool
f. Decline/timeout → offer next driver

KEY DESIGN INSIGHT TO STATE:
"Location data lives in Redis, not a DB. 5M drivers × 1 update/4s = 1.25M writes/sec. No SQL DB handles that. Redis GEOADD is sub-millisecond and auto-expires stale drivers."

Cell Architecture:
• Each city is an independent cell — Mumbai outage doesn't affect London
• Global services: Auth, User Profile (shared)
• Local services: Matching, Location, Pricing (per city cell)`,
    followups: [
      "What happens if no driver accepts within 5 minutes?",
      "How does the system handle a driver accepting two trips simultaneously?",
      "How would you scale the Location Service to 10× current load?",
    ],
  },
  {
    id: "uq2",
    category: "Real-Time Systems",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Uber", "Google", "Meta"],
    question: "Design the real-time location tracking system for 5 million active drivers.",
    answer: `This is a write-heavy, read-heavy, low-latency problem. No single system handles all three — you need layers.

SCALE MATH FIRST:
5M drivers × 1 update/4s = 1.25M writes/sec
Each update = ~100 bytes → 125 MB/sec ingest

THREE WRONG ANSWERS (show you know the pitfalls):
• Write directly to PostgreSQL → max ~10K TPS, would collapse
• Write directly to Cassandra → handles writes, but geo-queries are terrible
• Polling (server requests location) → 1.25M outgoing connections, not scalable

THE RIGHT ARCHITECTURE:

Layer 1 — Ingestion (WebSocket, not REST):
• WebSocket because: persistent connection, server can push offers to driver
• REST is request-response — driver app would need to poll, wastes bandwidth
• Each driver = 1 WebSocket connection to Location Service cluster
• Sticky sessions: same driver always hits same server node

Layer 2 — Redis Geo-Index (serves matching queries):
• GEOADD city:{name}:drivers:available lon lat driver_id → O(log N) insert
• 30s TTL auto-expires drivers who disconnect
• GEORADIUS for dispatch: top 50 drivers near pickup in sub-millisecond
• All in-memory → no disk I/O

Layer 3 — Kafka (async fanout to consumers):
• Publish every update to driver-locations topic
• Consumer 1: Trip Service → update rider's live map
• Consumer 2: Fraud detection → speed/location anomaly checks
• Consumer 3: Analytics → supply heatmaps, demand forecasting
• Consumer 4: Cassandra writer → batched persistence (every 30s)

Layer 4 — Cassandra (historical, not hot path):
• Trip history: where was driver at each minute of trip
• Batch writes only — never on hot path
• Used for: disputes, investigations, ML training data

AVAILABILITY:
• Redis fails → fall back to DB geo-query (slower but works)
• Location Service node fails → driver reconnects via exponential backoff
• WebSocket disconnects are normal (tunnels, elevators) — 30s TTL means driver stays in pool briefly`,
    followups: [
      "How do you handle the thundering herd when a new driver comes online in a surge area?",
      "How would you detect GPS spoofing/fraud in real time?",
      "How do you ensure a driver's location update is processed in order?",
    ],
  },
  {
    id: "uq3",
    category: "Surge Pricing",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["Uber", "Lyft", "Instacart"],
    question: "Design Uber's surge pricing system. How does the surge multiplier get calculated and applied in real time?",
    answer: `Surge pricing is a real-time supply/demand balancing system.

WHAT IT NEEDS TO DO:
• Calculate surge multiplier per geographic area every ~60 seconds
• Apply surge to fare estimates instantly (< 100ms)
• Be consistent: same area shows same multiplier to all users simultaneously

GEOGRAPHIC INDEXING — H3 HEXAGONS:
• Divide city into H3 hexagons at resolution 8 (~0.74 km² each)
• Hexagons better than squares: all 6 neighbors equidistant, no edge artifacts
• Each hexagon gets its own surge value

SURGE CALCULATOR (background job, runs per city every 60s):
  For each H3 hexagon in city:
    supply = active drivers in hex (from Redis geo-index)
    demand = open trip requests in hex (last 5 min, from Kafka)
    ratio  = demand / max(supply, 1)
    surge  = step_function(ratio):
             ratio < 1.0  → 1.0×
             1.0 - 1.5   → 1.25×
             1.5 - 2.5   → 1.5×
             2.5 - 4.0   → 2.0×
             > 4.0        → 2.5× or higher

STORAGE:
  Redis: SET surge:city:mumbai:hex:{h3_id} 1.5 EX 120
  Key expires in 2 min → if calculator dies, surge gracefully decays to 1.0

READING SURGE (fare estimate path, < 1ms):
  h3_hex = h3_index(pickup_lat, pickup_lng, resolution=8)   // O(1)
  surge  = redis.GET("surge:city:mumbai:hex:{h3_hex}") or 1.0

CONSISTENCY GUARANTEE:
  Fare estimated at t=0 with surge=1.5 → rider confirms at t=60s
  Fare is locked at booking time — rider never sees surge increase mid-booking
  Surge cached in trip row: trips.surge_multiplier = 1.5 (immutable after booking)

FAIRNESS & REGULATION:
  • Upfront pricing: rider sees exact fare before confirming
  • Surge cap: configured per city (often 4.9× max in regulated markets)
  • Safety events: surge capped at 1.0× during declared emergencies (some markets)`,
    followups: [
      "How do you handle the boundary between two hexagons with different surge levels?",
      "How would you test that the surge calculation is correct without affecting production?",
      "A competitor shows lower surge — how does the system detect and react?",
    ],
  },
  {
    id: "uq4",
    category: "Database Design",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["Uber", "Grab", "Ola"],
    question: "Design the data model for Uber's trip and driver location history. What databases and why?",
    answer: `Different data types need different databases. Using one DB for everything is the wrong answer.

1. ACTIVE TRIP STATE — Redis
   Why: need sub-millisecond reads for driver availability, location queries
   What: current driver locations, trip state cache, session data
   Key structure:
     city:{name}:drivers:available → geo-sorted set (GEOADD)
     trip:{id}:state → hash (status, driver_id, rider_id)
     dispatch:{trip_id} → offer state, expires in 15s
   TTL: 30s for driver location (auto-expire offline drivers)

2. TRIP RECORDS — PostgreSQL
   Why: ACID needed for financial data (fare, payment)
   What: trips table, charges table, users table
   Key design:
     - Sharded by city_id (Mumbai shard, NY shard)
     - Optimistic locking on status transitions (no double-accept)
     - Created_at indexes for time-range queries
   Scale: ~25M rows/day → ~9B rows/year per city → partition by month

3. LOCATION HISTORY — Cassandra
   Why: write-heavy (1.25M/sec), time-series queries, no joins needed
   What: driver_location_history table
   Schema:
     CREATE TABLE driver_location_history (
       driver_id   UUID,
       trip_id     UUID,
       recorded_at TIMESTAMPTZ,
       lat         DECIMAL(9,6),
       lng         DECIMAL(9,6),
       PRIMARY KEY (driver_id, trip_id, recorded_at)
     ) WITH CLUSTERING ORDER BY (recorded_at ASC);
   Write pattern: batch every 30s from Kafka consumer (not hot path)
   Read pattern: "show me driver's path for trip t_abc" → single partition scan

4. RATINGS & REVIEWS — PostgreSQL
   Why: relatively low volume, ACID for fairness, simple queries
   JOIN: ratings join to trips join to users — relational makes sense

5. ANALYTICS — Data Warehouse (Redshift/BigQuery)
   Why: OLAP queries ("hourly trip count by city by product type")
   Source: Kafka → ETL pipeline → DW
   Not queried in real time — batch updated`,
    followups: [
      "How do you handle a PostgreSQL shard becoming too large as the city grows?",
      "How do you join trip data (PostgreSQL) with location history (Cassandra) for dispute resolution?",
      "What consistency guarantees does Cassandra give, and is that acceptable for location history?",
    ],
  },
  {
    id: "uq5",
    category: "Payments",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Uber", "Stripe", "PayPal"],
    question: "Design a fault-tolerant payment system for Uber. How do you ensure a rider is never charged twice?",
    answer: `Idempotency is the core answer. State every operation as: "if this runs twice, it produces the same result."

THE DOUBLE-CHARGE PROBLEM:
Scenario: Payment gateway call succeeds, but our server crashes before saving the result.
On restart/retry: we call the gateway again → rider gets charged twice.

SOLUTION — Idempotency Keys:
1. Generate idempotency_key = "trip_{trip_id}_charge_1" before calling gateway
2. INSERT INTO charges (idempotency_key, status='pending') first
   → This is a write-once, UUID-keyed row
3. Call Stripe/Razorpay: charge_session.create(idempotency_key=key)
   → Payment gateway also de-dupes on idempotency_key
4. UPDATE charges SET status='succeeded' / 'failed'
5. IF we crash after step 3 and retry:
   → SELECT from charges WHERE idempotency_key = key → find pending/succeeded
   → If succeeded: return success (no re-charge)
   → If pending: call gateway.retrieve(charge_id) to check status

FULL FAULT-TOLERANT FLOW:
  Phase 1 — Pre-charge:
    • Check rider has valid payment method
    • Hold/pre-authorize amount (some gateways) — no actual charge yet
    • Pre-auth expires in 15 min if trip not completed

  Phase 2 — Final charge (triggered by TRIP_COMPLETED event):
    • Calculate actual fare (might differ slightly from estimate)
    • Capture pre-auth or issue new charge with idempotency key
    • Retry with exponential backoff if gateway timeout

  Phase 3 — Post-charge:
    • Write to charges table (succeeded)
    • Kafka payment-events published
    • Receipt generated asynchronously
    • Driver earnings updated (separate transaction)

PAYMENT METHOD SECURITY:
  • Never store raw card numbers — Stripe/Razorpay tokenize
  • Store only: token, last4, expiry (for display)
  • PCI DSS compliance: payment servers in separate network segment

DRIVER PAYOUT:
  • Not real-time — weekly batch reconciliation
  • Uber holds escrow, transfers ACH to driver bank account
  • Instant Pay: driver requests same-day → Uber charges 1.5% fee`,
    followups: [
      "What happens if Stripe is down at end-of-trip? How do you handle delayed payment?",
      "How do you handle currency conversion for international trips?",
      "Design the refund flow — what DB state changes and what events are published?",
    ],
  },
  {
    id: "uq6",
    category: "ETA & Maps",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Uber", "Google", "Apple"],
    question: "How does Uber calculate ETA? Design a system that's more accurate than Google Maps for Uber trips.",
    answer: `Standard map routing (Dijkstra's on a road graph) is just the baseline. Uber's ETA is a multi-layer ML system.

WHY MAPS ALONE ISN'T ENOUGH:
• Google Maps: "typical conditions at this time of day"
• Uber needs: "ETA given this driver, this vehicle, this exact road state RIGHT NOW"
• Pickup complexity: Google doesn't know about airport terminal confusion, gated communities
• Driver behavior: experienced driver takes shortcuts Google doesn't know about

UBER'S ETA STACK (4 layers):

Layer 1 — Base road graph:
• City modeled as directed weighted graph
• Nodes = intersections, edges = road segments
• Edge weight = travel time in seconds (baseline, no traffic)
• Pre-computed: Contraction Hierarchies algorithm → fast shortest path queries
• Stored: H3-partitioned in Redis/S3 per city

Layer 2 — Real-time traffic (Uber's secret weapon):
• Every Uber vehicle is a probe — reports actual speed every 4s
• Actual_speed on edge E = median speed of last 20 vehicles in last 10 min
• Update road graph edge weights every 5 min with real probe data
• Coverage: Uber has 5M probes in major cities → denser than any sensor network
• Effect: edge Mumbai-Pune highway shows 15 km/h instead of 80 km/h during accident

Layer 3 — Historical ML model:
• Input features: route, time of day, day of week, weather, local event (IPL match)
• Training data: billions of historical trips with actual vs predicted ETA
• Model learns: "Route R on Friday 6pm is consistently 35% longer than baseline"
• Output: P50 ETA (median), P90 ETA (90th percentile)
• Framework: XGBoost / LightGBM, retrained weekly on new trip data

Layer 4 — Pickup complexity model:
• Separate model for: "how long from driver parks to rider in car?"
• Features: location type (airport, mall, residential), time of day, weather
• Trained on: time from driver marks "arrived" to trip starts
• This is often the biggest ETA error source — ignored by standard maps

SERVING (< 100ms latency):
• Pre-compute: popular routes cached with TTL = 5 min
• On-demand: A* search on H3-partitioned graph + ML feature lookup
• Parallel: base graph + ML model run concurrently, combine results`,
    followups: [
      "How do you handle ETA accuracy for a new city where you have no historical trip data?",
      "How do you measure and improve ETA accuracy over time?",
      "What happens to ETA if Uber's probe data is sparse at 3am?",
    ],
  },
  {
    id: "uq7",
    category: "Scale & Performance",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Uber", "Amazon", "Netflix"],
    question: "It's New Year's Eve midnight in New York. 100× normal demand spikes instantly. How does Uber handle this?",
    answer: `This is a thundering herd + surge + infrastructure elasticity problem. Answer all three.

WHAT HAPPENS AT MIDNIGHT NYE:
• 10× - 50× normal trip requests in Manhattan in 60 seconds
• Dispatch Engine must match all riders before they cancel (< 60s timeout)
• Surge calculator must update prices immediately (high demand signal)
• All microservices spike simultaneously

PRE-PLANNING (most important — not just reactive):

1. Capacity pre-scaling (days before):
   • Uber knows NYE is coming — it's on the calendar
   • Auto-scaling target: 5× normal instance count for NY cell by 11:45pm
   • Pre-warm connection pools, caches, and DB read replicas
   • Cost: overpaying for idle capacity for 15 min is worth it

2. Driver supply incentives (days before):
   • Guaranteed earnings for drivers online in Manhattan from 11pm-1am
   • More supply = surge multiplier stays manageable = better conversion

AT MIDNIGHT — WHAT EACH SERVICE DOES:

Location Service:
   • WebSocket servers horizontally scale (K8s HPA on connection count)
   • Redis Cluster: each shard handles subset of hexagons
   • No bottleneck: each connection is independent

Dispatch Engine:
   • Stateless — scale horizontally to 50× instances
   • Redis geo-index serves GEORADIUS queries unchanged (it's built for this)
   • Surge activates → some riders see 3.5× price → self-selection reduces load

Surge Calculator:
   • Rapid update: runs every 30s instead of 60s during declared surge events
   • Demand signal from Kafka: trip request rate spikes → surge activates within 30s
   • Manhattan hex cells split into smaller sub-hexagons at resolution 9 (finer granularity)

PostgreSQL Trip Table:
   • Spike in inserts (trip creations)
   • Handled by connection pooler (PgBouncer) + horizontal sharding by city
   • NY has its own shard — no cross-city contention

Notifications:
   • FCM/APNs have their own rate limits
   • Notification Service uses priority queues: DRIVER_ARRIVED > DRIVER_ACCEPTED > receipts
   • SMS fallback disabled during event (cost control + FCM can handle it)

LOAD SHEDDING (if overwhelmed):
   • Trip requests queued, not dropped — FIFO per city
   • If queue > 5 min deep: show rider "High demand — expected wait 8 min"
   • Sacrifice: some riders wait longer, none get errors

POST-EVENT:
   • Auto-scaling scales back 30 min after peak
   • Post-mortem: SLO breach? latency spike? → tune scaling thresholds`,
    followups: [
      "How do you test that your scaling works before the actual event?",
      "What is your circuit breaker strategy if the payment service falls behind?",
      "How do you prioritize which riders get matched first during extreme demand?",
    ],
  },
  {
    id: "uq8",
    category: "Safety & Fraud",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["Uber", "Lyft", "Airbnb"],
    question: "Design Uber's real-time safety and fraud detection system.",
    answer: `Safety and fraud detection are separate problems that share the same event stream.

FRAUD TYPES TO DETECT:

Driver-side fraud:
• GPS spoofing: driver fakes location to avoid long trips
• Trip padding: driver takes unnecessarily long route to inflate fare
• Fake completions: driver marks trip complete without picking up rider
• Account sharing: multiple drivers sharing one account

Rider-side fraud:
• Chargeback fraud: complete trip then dispute charge ("I wasn't there")
• Promo abuse: create multiple accounts for new-user promotions
• Rating manipulation: coordinate negative ratings on competitors

REAL-TIME DETECTION (Flink, streaming on driver-location events):

GPS spoof detection:
  consecutive_updates = [loc_t0, loc_t1, loc_t2]
  speed = distance(loc_t0, loc_t2) / (t2 - t0)
  IF speed > 250 km/h: flag GPS_ANOMALY
  → If 3 anomalies in one trip: auto-hold payout, flag for review

Trip padding detection:
  expected_route = Mapbox optimal route (computed at trip start)
  actual_path = GPS trace during trip
  deviation_pct = (actual_distance - expected_distance) / expected_distance
  IF deviation_pct > 30%: flag ROUTE_DEVIATION
  → Automatic partial refund to rider + notify driver

Impossible location:
  last_trip_end_location = Mumbai (10 min ago)
  new_trip_start_location = Delhi
  IF travel_time < minimum_possible_travel_time: flag TELEPORT

BATCH FRAUD (ML model, runs nightly on Spark):
  Features per driver account: trip count, unique rider count,
    route similarity, GPS trace variability, payout patterns
  Anomaly detection: isolation forest on driver behavior vectors
  Output: fraud_score per driver (0-1), flags above 0.85 for review

ACCOUNT FRAUD (new user sign-up):
  Device fingerprint: same device → multiple accounts → block
  IP address: datacenter IP → suspect → verify phone
  Phone number: used before on banned account → reject

ACTIONS (graduated response):
  fraud_score 0.5-0.7: monitoring, no action
  fraud_score 0.7-0.85: hold payout pending review
  fraud_score > 0.85: suspend account, human review queue
  Confirmed fraud: permanent ban, report to payment processor`,
    followups: [
      "How do you avoid false positives that punish legitimate drivers?",
      "How would you design the human review queue for flagged accounts?",
      "GPS signals are unreliable in tunnels — how do you distinguish tunnel gaps from fraud?",
    ],
  },
];
