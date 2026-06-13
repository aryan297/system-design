export const ZOMATO_HLD = {
  title: "Zomato — High Level Design",
  subtitle: "Food delivery & restaurant discovery — 100M+ users, 350K+ restaurants, 3M+ orders/day, real-time delivery tracking",
  overview: `Zomato is India's largest food delivery platform, connecting 100M+ customers with 350K+ restaurant partners across 800+ cities, fulfilled by a fleet of 350K+ delivery partners. Beyond delivery, Zomato operates restaurant discovery, table reservations, gold/pro subscription, and hyperpure (B2B ingredient supply to restaurants).

The core engineering challenge in food delivery is fundamentally different from ride-hailing: you have a three-sided marketplace (customer + restaurant + delivery partner) where the order lifecycle involves a physical production constraint — the restaurant must prepare the food before dispatch. This means ETA = food preparation time + delivery time, both of which are variable and must be estimated accurately.

Other hard problems: hyperlocal search (relevant restaurants within delivery radius with real-time availability), delivery partner dispatch optimisation (minimise delivery time across thousands of concurrent orders), and surge handling (dinner rush means 5× normal order volume hitting the system in a 2-hour window).`,

  metrics: [
    { label: "Monthly active users", value: "100M+",   note: "as of 2024" },
    { label: "Restaurant partners",  value: "350K+",   note: "across 800+ cities" },
    { label: "Delivery partners",    value: "350K+",   note: "gig workers" },
    { label: "Orders per day",       value: "3M+",     note: "average; 5M+ on peak days" },
    { label: "Cities",               value: "800+",    note: "India + international" },
    { label: "Order placement SLA",  value: "< 2s",    note: "end-to-end confirmation" },
    { label: "Avg delivery time",    value: "30 min",  note: "target; actual varies" },
    { label: "Tracking update freq", value: "5 sec",   note: "GPS ping interval" },
  ],

  diagram: `
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                    │
│     Customer App (iOS/Android) · Restaurant App · Delivery Partner App  │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │  HTTPS / WebSocket (live tracking)
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  API GATEWAY (Kong / AWS ALB)                           │
│         SERVICE MESH — Envoy sidecar attached to every service          │
│     Auth (JWT/OTP) · Rate Limiting · Geo-routing · WebSocket Upgrade    │
│      mTLS · Load Balancing · Retries · Circuit Breaking · Tracing       │
└───┬──────────┬───────────┬──────────────┬────────────────┬──────────────┘
    │          │           │              │                │
    ▼          ▼           ▼              ▼                ▼
┌───────┐ ┌───────┐ ┌──────────┐ ┌────────────┐ ┌─────────────────┐
│ Order │ │Search │ │Dispatch  │ │  Payment   │ │  Restaurant     │
│Service│ │Service│ │Service   │ │  Service   │ │  Service        │
└───┬───┘ └───┬───┘ └────┬─────┘ └────────────┘ └─────────────────┘
    │         │           │
    ▼         ▼           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        KAFKA EVENT BUS                                  │
│   order.placed · order.accepted · partner.assigned · order.delivered   │
└─────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                      │
│  PostgreSQL (orders, users, restaurants) · Redis (sessions, geo, cache) │
│  Elasticsearch (restaurant/menu search) · Cassandra (location history)  │
│  S3 (food photos, menus) · ClickHouse (analytics) · Kafka (event stream)│
└─────────────────────────────────────────────────────────────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Restaurant Discovery & Search",
      sections: [
        {
          title: "Hyperlocal Search — Relevant Restaurants Within Your Delivery Radius",
          content: `Unlike Google Search which is global, Zomato search is hyperlocal — a search for "biryani" in Andheri should return different results than the same search in Bandra, even if they're 3 km apart.

SEARCH ARCHITECTURE:

Geo-filtering (first, before any text matching):
  User's GPS coordinates → find all restaurants within delivery radius (typically 5–8 km)
  Elasticsearch geo_distance query:
    GET /restaurants/_search {
      "query": { "bool": {
        "filter": [{ "geo_distance": { "distance": "7km", "location": { "lat": 19.11, "lon": 72.87 } } }]
      }}
    }
  Result: ~200–500 candidate restaurants in the user's serviceable area

Text + intent matching (on filtered set):
  Query: "biryani" → tokenised → match against: restaurant name, cuisine tags, menu item names
  Fuzzy matching: "biriyani" (common misspelling) still matches
  Synonym expansion: "north indian" → expands to: "punjabi", "mughlai", "awadhi"
  Field weights: menu item name (highest) > restaurant name > cuisine tag > dish description

RANKING SIGNALS:
  Base relevance score (Elasticsearch BM25) +
  Distance penalty (farther = lower rank) +
  Rating (4.5 stars > 3.8 stars) +
  Popularity (order volume last 7 days) +
  Real-time availability (is restaurant open and accepting orders RIGHT NOW?) +
  Personalisation (if you ordered Chinese 3 times, Chinese restaurants get a boost) +
  Promoted (paid placement — clearly labelled "Ad")

REAL-TIME AVAILABILITY:
  Restaurant goes offline (app crash, tablet dead, kitchen overwhelmed): must be hidden instantly
  Restaurant heartbeat: tablet pings /v1/restaurant/heartbeat every 60 seconds
  If no heartbeat for 90 seconds: Redis SET restaurant:{id}:online 0
  Search filters out restaurant:{id}:online = 0 from results
  This is a hard filter — no point showing a restaurant that can't accept orders`,
        },
        {
          title: "Menu Catalogue & Item Availability",
          content: `A restaurant's menu is not static — dishes sell out, prices change, items are seasonally available.

MENU STORAGE:
  Menu hierarchy: Restaurant → Category (Starters, Mains, Desserts) → Item → Variants + Customisations
  Stored in PostgreSQL (source of truth) + Elasticsearch (search index) + Redis (hot cache for display)
  Menu updates: restaurant uses partner app → change propagated via Kafka → Elasticsearch reindex (< 30s)

ITEM AVAILABILITY:
  "Sold out today": Restaurant marks item unavailable → Redis SET item:{id}:available 0
  Auto-reset: midnight job resets all sold-out items to available (new day's supply)
  Partial availability: some items on/off during split shifts (lunch vs dinner menu)

MENU PHOTOS:
  Uploaded by restaurant → stored in S3 → served via CloudFront CDN
  Zomato has a "food styling" team: professionally photographed dishes get a badge
  Photos A/B tested: dish photos increase conversion by 35% vs text-only menus

CUSTOMISATIONS:
  Example: "Butter Chicken" → size (half/full) → spice level (mild/medium/spicy) → extras (extra butter, no onion)
  Each customisation is a nested structure with price delta
  Cart serialises the full customisation object alongside item_id

INTELLIGENT MENU CURATION:
  Popular items section: top 5 ordered items from that restaurant in your area
  Trending dishes: items frequently ordered together (frequently bought together graph)
  Previously ordered: if you ordered from this restaurant before, your past items shown first`,
        },
        {
          title: "Back-of-the-Envelope Estimation",
          content: `Before designing the dispatch and tracking pipelines in later phases, it helps to derive the actual request rates these systems must sustain — both on an average day and during the 7-9 PM dinner rush.

ASSUMPTIONS:
  100M monthly active users, 3M+ orders/day average (5M+ on peak days)
  Dinner rush (7-9 PM) generates ~5x the off-peak instantaneous order rate
  350K delivery partners, GPS ping every 5 seconds while on a delivery
  350K restaurants, heartbeat every 60 seconds
  Avg total delivery cycle (assignment → delivered) ≈ 30 minutes (1,800s)
  ~3 search queries per placed order (browsing before deciding)

THE FIVE DERIVATIONS:

1. Order placement rate:
   3,000,000 orders/day ÷ 86,400s ≈ 34.7 orders/sec average
   At 5x dinner-rush rate ≈ 173.5 orders/sec
   → Sizes Order Service's Postgres write throughput — and lines up with
   the "170 writes/sec at peak" figure used for database write-pressure planning.

2. Concurrent active deliveries — Little's Law:
   concurrent_orders = arrival_rate × time_in_system
   Average: 34.7 × 1,800s ≈ 62,460 orders simultaneously "in flight"
   At 5x dinner peak: 173.5 × 1,800s ≈ 312,300 — against a fleet of only
   350K delivery partners!
   → This is the real reason "partner slots" (guaranteed-supply incentive
   contracts) and surge pricing exist: at dinner peak, nearly the ENTIRE
   partner fleet needs to be simultaneously engaged just to keep up.

3. GPS ping ingestion at peak:
   ~312,300 partners actively delivering ÷ 5s ping interval ≈ 62,460 pings/sec
   → This is remarkably close to the documented "70K writes/second" figure
   for Cassandra (350K partners × 12 pings/min), confirming that figure
   already assumes near-total fleet utilisation at peak — exactly the
   scenario derivation #2 predicts.

4. Customer WebSocket fanout:
   Assume ~60% of customers with an active order keep the tracking screen open
   312,300 × 0.6 ≈ 187,400 concurrent WebSocket connections at peak
   Each receiving a push every 5s → ~37,480 messages/sec
   → Sizes the WebSocket server fleet and the number of Redis pub/sub
   channels (order:{order_id}:location) active simultaneously.

5. Search query load:
   3M orders/day × ~3 searches/order ≈ 9M searches/day ≈ 104 QPS average
   At 5x dinner peak ≈ 520 QPS
   → Comfortably inside the <50ms total query budget (geo-filter + text
   match + availability filter + ranking) described in the search architecture.

INTERVIEW PUNCH LINE:
  "The single most useful number here is #2 — at dinner-rush peak, Little's
  Law says ~312K of Zomato's 350K delivery partners need to be simultaneously
  mid-delivery just to clear the order backlog. That's not a side detail —
  it's WHY partner-slot incentive contracts and zone-based surge pricing are
  load-bearing parts of the design, not just nice-to-have UX features. And it
  cross-checks: derivation #3 reproduces the documented 70K writes/sec
  Cassandra figure almost exactly, starting from the order-rate headline alone."`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Order Management",
      sections: [
        {
          title: "Order Lifecycle — From Cart to Delivered",
          content: `An order passes through 4 stakeholders: customer → Zomato platform → restaurant → delivery partner. Each transition is a state change with real-time notifications.

ORDER STATE MACHINE:
  PLACED → ACCEPTED (restaurant confirms) → FOOD_READY → PARTNER_ASSIGNED →
  PARTNER_PICKED_UP → OUT_FOR_DELIVERY → DELIVERED
  Side exits: CANCELLED (by customer, restaurant, or Zomato) → REFUND

RESTAURANT ACCEPTANCE:
  On order.placed Kafka event: push notification to restaurant's tablet app
  Restaurant has 3 minutes to accept → accept OR decline (busy, ingredient unavailable)
  If no response in 3 minutes: auto-cancel + notify customer + attempt alternate restaurant (if configured)
  Acceptance rate tracked per restaurant: consistently low = rank penalty + potential offboarding

PREPARATION TIME ESTIMATION:
  Restaurant sets "average prep time" per category: Biryani = 25 min, Rolls = 10 min
  ML refinement: actual prep completion times → train model → predict per item combo per restaurant per time-of-day
  Restaurant can override: "extra busy right now, add 10 min" button in partner app
  This feeds the customer-facing ETA alongside delivery time

CANCELLATION POLICY:
  Before restaurant accepts: free cancellation, full refund
  After acceptance (restaurant cooking): ₹50–100 partial cancellation fee (restaurant compensation)
  After pickup: no cancellation (delivery partner already moving)

IDEMPOTENT ORDER PLACEMENT:
  Mobile networks drop at checkout → user may tap "Order" twice
  idempotency_key = device_id + cart_hash + timestamp_bucket (5-minute bucket)
  Redis SET NX: if key exists → return existing order_id
  Prevents double-orders and double-charges`,
        },
        {
          title: "ETA — Combining Prep Time + Delivery Time",
          content: `The promised delivery time is the single most important number a customer sees. Underestimate → angry customer. Overestimate → fewer orders placed.

ETA FORMULA:
  ETA = max(prep_time_estimate, partner_travel_to_restaurant) + restaurant_to_customer_travel
  "Max" because: if partner arrives before food is ready, they wait — so prep time is the bottleneck

PREP TIME MODEL:
  Features:
    - Item types ordered (biryani vs roll — vastly different cook times)
    - Quantity ordered (10 items takes longer than 2)
    - Restaurant kitchen load right now (how many concurrent orders?)
    - Time of day (dinner rush = slower kitchen)
    - Historical actual prep times for this restaurant per item type
  Output: predicted minutes until FOOD_READY state
  Model: gradient boosted regression, trained on historical order-to-ready timestamps

DELIVERY TIME MODEL:
  Google Maps Directions API: partner_location → restaurant → customer (with real traffic)
  Adjusted by:
    - Time of day traffic patterns (Zomato's own historical data often better than Maps for hyperlocal)
    - Rain penalty: +5–8 minutes if it's raining in city (delivery slows down)
    - Apartment building complexity: some buildings add 3–5 min (gated societies, lifts, etc.)

DYNAMIC ETA UPDATE:
  ETA shown to customer is recomputed every 2 minutes and on each order state change
  If ETA extends by > 5 minutes: push notification to customer with updated ETA
  SLA: Zomato credits issued automatically if delivery exceeds promised ETA by > 10 minutes (configurable per city)`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Delivery Partner Dispatch",
      sections: [
        {
          title: "Matching Orders to Delivery Partners in Real-Time",
          content: `The dispatch engine must match each new order to an available delivery partner within 2 minutes of order placement — before the restaurant finishes cooking.

PARTNER STATES:
  AVAILABLE: in the zone, no active order
  GOING_TO_RESTAURANT: assigned, heading to pick up
  WAITING_AT_RESTAURANT: arrived, waiting for food
  OUT_FOR_DELIVERY: food picked up, heading to customer
  RETURNING: delivered, heading back to zone

ASSIGNMENT ALGORITHM:

Step 1 — Find candidates (Redis GEO):
  GEORADIUS restaurant_lat restaurant_lng 3km → available partner IDs
  Redis stores: partner location updated every 5 seconds from partner app GPS

Step 2 — Score candidates:
  score = 0.4 × (1/distance_to_restaurant)
        + 0.3 × on_time_delivery_rate          // historical reliability
        + 0.2 × acceptance_rate                // doesn't decline orders often
        + 0.1 × customer_rating                // quality metric

Step 3 — Offer with timeout:
  Notify top-ranked partner via push notification (30-second window)
  If declined/timeout → offer to next candidate
  After 3 declines → escalate: widen radius to 5 km, re-score

BATCH ASSIGNMENT (efficiency optimisation):
  If partner is currently at Restaurant A (waiting for order X to be ready) AND
  a new order comes in from Restaurant B nearby (< 500m): assign both orders
  Partner picks up both, delivers first customer then second
  Savings: fewer partners needed, lower platform cost
  Risk: increased ETA for second customer — system only batches if ETA impact < 5 minutes

DEMAND-SUPPLY IMBALANCE:
  Dinner rush: more orders than partners → surge pricing activated
  Surge signals: queue_depth > threshold, average assignment_wait > 3 minutes
  Surge: higher delivery fee → more incentive for partners to come online
  Partners shown "High demand in your area" notification → more join
  Customer sees: "High demand — delivery fee ₹50 (usually ₹30)" — transparent`,
        },
        {
          title: "Delivery Partner Experience & Incentives",
          content: `Delivery partners are gig workers. Their supply behaviour is elastic — incentive design directly impacts platform reliability.

INCENTIVE STRUCTURE:
  Base pay: ₹25–35 per order (varies by distance, city)
  Peak hour bonus: ₹10–15 extra per order during 12–2 PM and 7–10 PM
  Streak incentive: complete 5 orders in 2 hours → ₹100 bonus
  Login incentive: "First 100 partners to login by 7 PM get guaranteed 8 orders" → predictable supply

PARTNER APP FEATURES:
  Live earnings tracker (real-time, not end-of-day)
  Navigation: Google Maps embedded with optimised route to restaurant + customer
  "Going online" switch: partner activates when ready to take orders
  Availability zone: partner can see demand heatmap — where orders are concentrated

FRAUD PREVENTION:
  GPS spoofing: partner fakes being near restaurant but isn't
  Detection: GPS consistency check — distance/time must be physically possible
  Restaurant verification: partner must scan QR code at restaurant on pickup (confirms physical presence)
  Delivery confirmation: OTP-based delivery (customer gives 4-digit OTP to partner) OR photo proof

PARTNER PERFORMANCE METRICS:
  On-time rate: % orders delivered within promised ETA
  Acceptance rate: % order offers accepted (low = penalised in assignment ranking)
  Customer rating: average rating from customers (below 3.5 → warned, below 3.0 → deactivated)
  Cancellation rate: post-acceptance cancellations (worst metric — food wasted, customer angry)`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Real-Time Order Tracking",
      sections: [
        {
          title: "Live GPS Tracking — Partner Location to Customer Screen",
          content: `"Where is my order?" is the most common customer query. Real-time tracking eliminates it entirely and reduces anxiety around delivery.

GPS PIPELINE:

Partner app → Location Ingestion:
  Partner app pings GPS every 5 seconds → POST /internal/location/ping
  Payload: {partner_id, order_id, lat, lng, accuracy, bearing, speed, timestamp}
  Receiver: lightweight Golang service, no heavy processing on ingestion path
  Kafka: location.ping topic (partitioned by partner_id, preserving order)

Location Processing (Kafka consumers):
  Consumer 1 — Map matching:
    Raw GPS is noisy (jumps between buildings, signal loss)
    Snap GPS point to nearest road using OSRM (Open Source Routing Machine)
    Smoothed location published to: location.smoothed topic
  Consumer 2 — Redis update:
    Redis HMSET partner:{id}:location lat lng bearing speed updated_at
    TTL: 30 seconds (if partner goes offline, stale location auto-expires)
  Consumer 3 — Cassandra write:
    Append to time-series: partner_locations (partner_id, order_id, ts, lat, lng)
    Used for: post-delivery route replay, dispute resolution ("partner went out of route")

Customer WebSocket Push:
  Customer app opens order tracking page → WebSocket connection established
  Server subscribes to: order:{order_id}:location channel in Redis pub/sub
  On each location.smoothed event for that partner: Redis PUBLISH → WebSocket server → customer
  Frequency: once per 5 seconds (matches GPS ping rate)

ETA RECOMPUTATION:
  Every 30 seconds: OSRM route from current partner location → restaurant (if pre-pickup) / customer (if post-pickup)
  New ETA pushed via WebSocket if changed by > 1 minute`,
        },
        {
          title: "Order Status Notifications",
          content: `Beyond GPS tracking, customers need clear milestone notifications as the order progresses through each state.

NOTIFICATION TRIGGERS (Kafka-driven):
  order.placed → "Order placed! Looking for a delivery partner 🛵"
  order.accepted → "Restaurant accepted your order and is preparing food 🍳"
  partner.assigned → "Arjun is heading to pick up your order"
  order.picked_up → "Your order is on the way! Track in real-time 📍"
  order.near_delivery → "Arjun is 2 minutes away" (triggered when ETA < 3 min)
  order.delivered → "Order delivered! How was your experience? ⭐"
  order.delayed → "Running a bit late — updated ETA is 8:45 PM. Sorry for the wait!"

MULTI-CHANNEL DELIVERY:
  Push notification (FCM/APNs): primary, instant
  WhatsApp (if FCM delivery fails): higher read rate than SMS
  SMS (fallback): guaranteed delivery
  In-app: status bar in app always reflects current state (not just notifications)

RESTAURANT NOTIFICATIONS (partner tablet):
  New order → loud sound alert + screen flash (kitchen can't miss it)
  Delivery partner arriving (ETA < 5 min) → "Partner arriving soon, please pack order"
  This reduces partner wait time at restaurant — food should be ready on arrival

CANCELLATION NOTIFICATIONS:
  Customer cancels after restaurant started cooking → restaurant notified immediately
  Reason shown: customer's cancellation reason (changed mind, wrong order, etc.)
  If auto-cancelled (restaurant didn't respond): restaurant gets low responsiveness mark`,
        },
        {
          title: "Service Mesh — Sidecar Proxy Pattern (Envoy/Istio)",
          content: `Zomato runs six core services behind the API Gateway: Order Service, Search Service, Dispatch Service, Restaurant Service, Tracking Service, and Payment Service. Each gets an Envoy sidecar, turning cross-service networking concerns (retries, mTLS, load balancing, circuit breaking) into infrastructure config instead of per-service code.

WHY A MESH FITS HERE:
  Restaurant Service has the highest fan-in — every search result, every
  menu fetch, and the 3-minute order-acceptance flow all hit it.
  Dispatch Service holds a 30-second in-flight partner-offer window — the
  same "don't eject a replica mid-offer" shape seen in ride-hailing dispatch.
  Tracking Service is stateful: GPS ingestion + WebSocket pushes every 5
  seconds, the same shape as a live-location service.
  Payment Service should only ever be called by Order Service — a clean
  case for mesh-level access control, not just code review discipline.

DATA PLANE: Envoy sidecar on all 6 services — Order, Search, Dispatch,
Restaurant, Tracking, Payment. (Review Service stays out — it's an async,
non-latency-critical write path.)

CONTROL PLANE: Istio deployed PER METRO CLUSTER (West: Mumbai/Pune/
Ahmedabad, North: Delhi-NCR, South: Bangalore/Chennai/Hyderabad, East:
Kolkata, ...) — with 800+ cities, per-city control planes would be
unmanageable, but a single global one would make Delhi's control plane
issue take down Bangalore too. Metro clusters group nearby cities that
already share delivery-partner and restaurant pools.

WHAT THIS BUYS, CONCRETELY:

1. Restaurant Service — TIGHT circuit breaking (outlierDetection,
   interval: 5s, baseEjectionTime: 15s). With the highest fan-in of any
   service, a single bad replica needs to be ejected fast — before Search
   Service's <50ms budget or the order-acceptance flow's 3-minute window
   start absorbing retries against it.

2. Dispatch Service — LOAD BALANCING ONLY, explicitly NO outlierDetection.
   Each replica holds in-flight 30-second partner-offer state; an
   Envoy-triggered ejection would orphan that offer mid-flight. Same
   pattern as the dispatch/matching services in the ride-hailing and
   q-commerce designs in this series.

3. Tracking Service — also LOAD BALANCING ONLY, no outlierDetection.
   GPS ingestion (every 5s) and WebSocket pushes (every 5s) are
   long-lived, stateful connections per active delivery — ejecting a
   replica drops live tracking sessions for everyone connected to it.

4. VirtualService canary on Dispatch Service — ships changes to the
   partner-scoring formula (distance_score and reliability_score, where
   reliability = 0.4×on_time_rate + 0.3×acceptance_rate + 0.3×rating) to
   5% of assignment traffic via a header-matched subset before full rollout.

5. AuthorizationPolicy restricting Payment Service's intent-creation and
   charge/refund endpoints to Order Service's identity ONLY — independent
   of application code, no other service can move money.

6. mTLS (STRICT) + distributed tracing across all 6 services — every
   internal hop, including the dispatch and tracking hot paths, is
   encrypted and traced automatically.

WHAT STAYS OUT:
  Kafka (Event Bus), PostgreSQL, Redis, Elasticsearch, Cassandra, S3,
  ClickHouse, and Review Service — none are mesh-manageable synchronous
  hops on the order-placement or tracking critical paths.

TRADE-OFFS:
  Sidecar adds ~1-2ms per hop. Against the < 2s order-placement SLA this
  is negligible — unlike some services in this series where the sidecar
  tax eats a double-digit percentage of the budget, here it's noise.
  Existing app-level circuit breakers ("if restaurant service has error
  rate > 5% → circuit open → return cached menu") operate at a different
  granularity than mesh-level outlierDetection: the app-level breaker
  trips on whole-service error rate and falls back to a cached response;
  the mesh-level breaker ejects a single bad REPLICA and transparently
  retries against a healthy one. They're complementary, not redundant.
  Control-plane-down means sidecars fail open on last-known config — at
  metro-cluster granularity, this limits the blast radius of any single
  control-plane incident to one region's cities.`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "Payments, Wallet & Zomato Gold",
      sections: [
        {
          title: "Payment Infrastructure",
          content: `Zomato processes millions of transactions daily across UPI, cards, wallets, and COD. Each payment method has different latency, reliability, and fraud characteristics.

PAYMENT FLOW:
  1. Customer places order → Payment Service creates payment intent
  2. Redirect to payment gateway (Razorpay / PayU / Juspay)
  3. Customer pays via UPI/card/wallet
  4. Gateway webhooks Zomato with payment result
  5. On success: order confirmed. On failure: order stays in PENDING_PAYMENT state
  6. Payment intent expires after 5 minutes → order auto-cancelled

ZOMATO CREDITS / WALLET:
  Credits issued for: late delivery compensation, referral bonuses, promotional offers
  Stored in: Redis (real-time balance) + PostgreSQL (ledger for audit)
  Applied at checkout: credits_applied = min(order_total × 0.3, user_credit_balance)
  Max 30% of order value payable in credits (ensures some real-money transaction per order)

RESTAURANT SETTLEMENT:
  Zomato collects full order value from customer
  Settles to restaurant: order_value - platform_commission - payment_gateway_fee
  Commission: 18–25% of order value (negotiated per restaurant, volume-based)
  Settlement schedule: weekly (small restaurants) or daily (high-volume partners)
  Settlement via NEFT/IMPS to registered bank account

COD HANDLING:
  Partner collects cash → remits to Zomato via daily settlement
  Fraud risk: partner pockets cash, marks as delivered
  Mitigation: GPS + OTP delivery confirmation; if OTP not entered, order flagged for review
  COD disabled in high-fraud cities or for new customers

REFUND ENGINE:
  Auto-refund triggers: restaurant cancelled, delivery failed, item missing (customer complaint)
  Refund path: to original payment method (T+5 for cards) or Zomato wallet (instant)
  Partial refund: missing item = refund for that item value only
  Dispute resolution: customer uploads photo of missing item → ops team reviews → refund approved/rejected`,
        },
        {
          title: "Zomato Gold / Pro — Subscription Commerce",
          content: `Zomato Gold (now Zomato Pro) is a subscription that offers free delivery + exclusive discounts. It drives loyalty and increases order frequency.

SUBSCRIPTION BENEFITS:
  Free delivery on all orders above ₹149 (eliminates the #1 friction point)
  Exclusive discounts at partner restaurants: up to 40% off
  Priority customer support
  Early access to new restaurant launches

BUSINESS MODEL:
  ₹199/month or ₹699/year
  Subscriber LTV: 3× non-subscriber (order frequency increases from 2× to 6× per month average)
  Restaurant co-funded: restaurants pay for the Gold discount (shared cost model)
  Zomato subsidises delivery waiver from incremental order volume

SUBSCRIPTION MANAGEMENT:
  State stored in User Service with active_until timestamp
  Checked at checkout: is user.gold_expiry > now()? → waive delivery fee
  Auto-renewal: UPI AutoPay mandate on subscription start
  Grace period: 7 days post-expiry before benefits removed (handles payment failures)

PERSONALISED RECOMMENDATIONS FOR GOLD:
  Gold users see "Gold partner restaurants" prominently featured
  Recommendations biased toward restaurants with active Gold discounts
  Goal: Gold user orders from Gold restaurants → restaurant pays for discount → Zomato benefits from both`,
        },
      ],
    },
    {
      id: "phase6",
      label: "Phase 6",
      title: "Reviews, Ratings & Scale",
      sections: [
        {
          title: "Reviews & Rating System",
          content: `Zomato started as a restaurant review site before adding delivery. Reviews drive restaurant discovery — a 0.2-point rating difference can mean 20% fewer orders.

REVIEW ELIGIBILITY:
  Only verified purchasers can leave delivery reviews (tied to order_id)
  Dine-in reviews: any user who visited (check-in via Zomato or GPS verification)
  This prevents fake reviews from non-customers

REVIEW COMPONENTS:
  Overall star rating: 1–5
  Food rating, Delivery rating, Value rating (separate dimensions)
  Free-text review
  Food photos (optional, verified against food content via CV model)
  Tags: "fast delivery", "portion size small", "packaging good"

RATING COMPUTATION:
  Not a simple average — Bayesian-smoothed toward global mean for new restaurants
  Formula: bayesian_rating = (C × m + Σ ratings) / (C + n)
    C = confidence factor (e.g. 25 reviews worth of prior)
    m = global mean rating (~3.8)
    n = number of reviews
  New restaurant with 2 reviews of 5 stars → 3.95 (not 5.0) — prevents gaming
  Well-established restaurant with 10,000 reviews → approaches true average

REVIEW MODERATION:
  ML classifier: detects fake/spam reviews, competitor attacks, offensive language
  Flagged reviews → human moderation queue (24-hour SLA)
  Restaurant response: can reply to any review (drives engagement and trust)

FRAUD DETECTION:
  IP velocity: 10 reviews from same IP in 1 hour → block + flag
  Text similarity: copy-paste reviews from same template → cluster detection → bulk remove
  Rating manipulation: sudden spike in 1-star or 5-star reviews → ML anomaly detection → investigation`,
        },
        {
          title: "Surge Handling & Reliability at Scale",
          content: `Zomato's dinner rush (7–9 PM) generates 5× normal order volume. The system must handle this without degradation.

TRAFFIC PATTERNS:
  Daily: sharp peaks at 12–2 PM (lunch) and 7–10 PM (dinner)
  Weekly: Sunday lunch is highest single hour of the week
  Seasonal: Diwali, New Year's Eve → 8–10× normal (and everyone orders at exactly the same time)

AUTO-SCALING:
  Kubernetes HPA: CPU > 60% → scale out (target 2-minute scale-up time)
  Pre-scaling: known peak events → manual scale-up 30 min before (e.g. Sunday 11:30 AM)
  Database: read replicas scale independently of primary

CIRCUIT BREAKERS:
  Per-dependency: if restaurant service has error rate > 5% → circuit open → return cached menu
  Search degradation: if Elasticsearch is slow → return cached results with "results may be slightly outdated" banner
  Order acceptance: if payment service is down → queue orders (30-second retry) → user sees "processing"

DATABASE WRITE LOAD:
  Location pings: 350K partners × 12 pings/min = 4.2M writes/minute = 70K writes/second
  Cannot go to PostgreSQL — use Cassandra (write-optimised) for location history
  Orders: write to PostgreSQL primary, read from replica (eventual consistency acceptable for history pages)

CDN & STATIC ASSETS:
  Restaurant photos, menu images: CloudFront CDN, long TTL (content-addressable URLs)
  Homepage, restaurant cards: SSR with Redis cache (15s TTL during peak, 60s off-peak)
  City-level restaurant index: pre-computed and cached in Redis, refreshed every 5 minutes

QUEUE-BASED LOAD LEVELLING:
  During extreme surge: order placement queued in Kafka
  Consumer processes at sustainable rate
  Customer sees: "Order queued, confirming in a moment..." (instead of timeout error)
  Better UX: informed wait > unexplained failure`,
        },
      ],
    },
  ],
};

export const ZOMATO_LLD = {
  title: "Zomato — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of core Zomato services",

  components: [
    {
      id: "orderService",
      title: "Order Service — LLD",
      description: "Full order lifecycle from cart checkout to delivery with idempotency and state machine",
      api: `POST /v1/orders
Authorization: Bearer {jwt}

{
  "idempotency_key": "device_uuid_cart_hash_timestamp",
  "restaurant_id": "rest_abc123",
  "items": [
    {
      "item_id": "item_butter_chicken",
      "quantity": 1,
      "customisations": [
        { "group": "spice", "choice": "medium" },
        { "group": "portion", "choice": "full" }
      ],
      "unit_price": 320.00
    },
    { "item_id": "item_garlic_naan", "quantity": 2, "unit_price": 60.00 }
  ],
  "delivery_address_id": "addr_xyz789",
  "payment_method": { "type": "UPI", "upi_id": "user@okaxis" },
  "coupon_code": "SAVE50",
  "tip_amount": 30.00,
  "instructions": "Extra spicy please, ring bell on arrival"
}

Response 201:
{
  "order_id": "ZO20260430001234",
  "status": "PLACED",
  "restaurant": { "name": "Spice Garden", "eta_minutes": 35 },
  "items": [...],
  "pricing": {
    "items_total": 440.00,
    "delivery_fee": 30.00,
    "platform_fee": 5.00,
    "discount": -50.00,
    "tip": 30.00,
    "taxes": 22.50,
    "total": 477.50
  },
  "payment_url": "https://pay.zomato.com/intent/abc123",
  "estimated_delivery_at": "2026-04-30T20:45:00Z"
}

-- Order Schema --
CREATE TABLE orders (
  order_id          TEXT PRIMARY KEY,
  idempotency_key   TEXT UNIQUE NOT NULL,
  customer_id       UUID NOT NULL,
  restaurant_id     UUID NOT NULL,
  partner_id        UUID,
  status            TEXT NOT NULL DEFAULT 'PLACED',
  -- PLACED→ACCEPTED→FOOD_READY→PARTNER_ASSIGNED→PICKED_UP→DELIVERED / CANCELLED
  items_total       NUMERIC(10,2),
  delivery_fee      NUMERIC(6,2),
  discount          NUMERIC(8,2),
  total_amount      NUMERIC(10,2),
  payment_id        UUID,
  delivery_address  JSONB,
  instructions      TEXT,
  estimated_prep_min  INT,
  estimated_delivery_at TIMESTAMPTZ,
  accepted_at       TIMESTAMPTZ,
  picked_up_at      TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  INDEX (customer_id, created_at DESC),
  INDEX (restaurant_id, status, created_at),
  INDEX (partner_id, status)
);

CREATE TABLE order_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         TEXT REFERENCES orders(order_id),
  item_id          UUID NOT NULL,
  item_name        TEXT NOT NULL,
  quantity         INT  NOT NULL,
  unit_price       NUMERIC(8,2),
  customisations   JSONB,
  status           TEXT DEFAULT 'PENDING'  -- PENDING / PREPARED / CANCELLED
);`,
    },
    {
      id: "searchService",
      title: "Restaurant Search Service — LLD",
      description: "Elasticsearch-powered hyperlocal search with real-time availability filtering and personalised ranking",
      api: `GET /v1/restaurants/search?q=biryani&lat=19.1136&lng=72.8697&sort=relevance&page=1&limit=20

Response 200:
{
  "restaurants": [
    {
      "restaurant_id": "rest_abc123",
      "name": "Biryani Blues",
      "cuisine": ["Biryani", "North Indian"],
      "rating": 4.3,
      "rating_count": 12840,
      "delivery_time_min": 32,
      "delivery_fee": 30,
      "min_order": 149,
      "distance_km": 1.8,
      "image_url": "https://cdn.zomato.com/rest_abc123/cover.jpg",
      "promoted": false,
      "offers": ["50% off up to ₹100"],
      "is_open": true,
      "veg_only": false,
      "tags": ["bestseller", "fast delivery"]
    }
  ],
  "total": 47,
  "next_page": 2
}

-- Elasticsearch Index --
PUT /restaurants
{
  "mappings": {
    "properties": {
      "restaurant_id": { "type": "keyword" },
      "name":          { "type": "text", "analyzer": "standard" },
      "cuisine_tags":  { "type": "text" },
      "menu_items":    { "type": "text" },     // denormalised for search
      "location":      { "type": "geo_point" },
      "rating":        { "type": "float" },
      "is_open":       { "type": "boolean" },
      "delivery_time": { "type": "integer" },
      "order_count_7d":{ "type": "integer" }   // popularity signal
    }
  }
}

-- Search Query --
{
  "query": {
    "bool": {
      "must": [{ "multi_match": { "query": "biryani", "fields": ["name^3", "cuisine_tags^2", "menu_items"] } }],
      "filter": [
        { "geo_distance": { "distance": "7km", "location": { "lat": 19.11, "lon": 72.87 } } },
        { "term": { "is_open": true } }
      ]
    }
  },
  "sort": [
    { "_score": {} },
    { "rating": { "order": "desc" } },
    { "_geo_distance": { "location": { "lat": 19.11, "lon": 72.87 }, "order": "asc" } }
  ]
}

-- Real-time availability update --
POST /internal/restaurants/{id}/availability
{ "is_open": false, "reason": "KITCHEN_CLOSED" }
→ Redis SET restaurant:{id}:online 0 EX 3600
→ Elasticsearch update: { "doc": { "is_open": false } }  (async, eventual)
→ Immediate: Redis filter blocks restaurant from appearing in search`,
    },
    {
      id: "dispatchService",
      title: "Dispatch Service — LLD",
      description: "Delivery partner assignment using geospatial scoring with batch order support",
      api: `-- Triggered by order.food_ready Kafka event --
POST /internal/dispatch/assign
{
  "order_id": "ZO20260430001234",
  "restaurant_id": "rest_abc123",
  "restaurant_location": { "lat": 19.1141, "lng": 72.8701 },
  "customer_location":   { "lat": 19.1089, "lng": 72.8654 },
  "food_ready_at": "2026-04-30T20:30:00Z",
  "order_value": 477.50
}

Response 200:
{
  "partner_id": "partner_arjun_5432",
  "partner_name": "Arjun S.",
  "partner_phone": "+91-9876XXXXXX",
  "eta_to_restaurant_min": 3,
  "eta_to_customer_min": 18,
  "assignment_type": "SINGLE"      // SINGLE or BATCH
}

-- Partner Selection --
1. GEORADIUS restaurant_lat restaurant_lng 3 km
   Redis: ZRANGEBYSCORE available_partners:{zone_id} -inf +inf → list of available partner IDs

2. For each candidate partner fetch from Redis:
   HMGET partner:{id}:profile on_time_rate acceptance_rate rating location

3. Score:
   distance_score     = 1 / (haversine(partner, restaurant) + 0.1)
   reliability_score  = 0.4×on_time_rate + 0.3×acceptance_rate + 0.3×customer_rating
   final_score        = 0.4×distance_score + 0.6×reliability_score

4. Offer to top scorer (30s timeout), then 2nd, then 3rd
5. If no taker → widen radius to 5 km, re-score

-- Partner State (Redis) --
HMSET partner:{id}:state
  status          AVAILABLE
  current_order   null
  location_lat    19.1141
  location_lng    72.8701
  last_seen       1746000000
  on_time_rate    0.94
  acceptance_rate 0.88
  rating          4.6

GEOADD available_partners:{zone_id} 72.8701 19.1141 {partner_id}
GEODIST available_partners:{zone_id} {partner_id} {restaurant_id} km

-- Batch Assignment --
Check before assignment: is any partner currently WAITING_AT_RESTAURANT within 500m?
If yes AND batch ETA impact < 5 min for both customers:
  → assign second order to same partner
  → partner picks up both bags, delivers closer address first`,
    },
    {
      id: "trackingService",
      title: "Live Tracking Service — LLD",
      description: "GPS ingestion pipeline, map-matching, WebSocket push to customer and ETA recomputation",
      api: `-- Partner app location ping --
POST /internal/location/ping   (called every 5 seconds by partner app)
{
  "partner_id": "partner_arjun_5432",
  "order_id":   "ZO20260430001234",
  "lat": 19.1138,
  "lng": 72.8699,
  "accuracy_m": 5,
  "bearing":    180,
  "speed_kmh":  22,
  "timestamp":  "2026-04-30T20:32:10Z"
}
Response: 200 OK  (< 10ms, no heavy processing)

-- Customer tracking WebSocket --
wss://track.zomato.com/order/ZO20260430001234

Server pushes every 5 seconds:
{
  "order_id": "ZO20260430001234",
  "status": "OUT_FOR_DELIVERY",
  "partner": {
    "name": "Arjun S.",
    "phone_masked": "+91-98XXXXXX32",
    "rating": 4.6,
    "location": { "lat": 19.1138, "lng": 72.8699 },
    "bearing": 180
  },
  "eta_minutes": 12,
  "distance_remaining_m": 1850,
  "steps": [
    { "label": "Order Placed",          "done": true,  "time": "20:15" },
    { "label": "Restaurant Accepted",   "done": true,  "time": "20:17" },
    { "label": "Food Being Prepared",   "done": true,  "time": "20:17" },
    { "label": "Partner Assigned",      "done": true,  "time": "20:28" },
    { "label": "Out for Delivery",      "done": true,  "time": "20:31" },
    { "label": "Delivered",             "done": false, "time": null }
  ]
}

-- ETA Computation (every 30s) --
1. GET partner location from Redis: HMGET partner:{id}:state location_lat location_lng
2. If status == GOING_TO_RESTAURANT:
     route = OSRM.route(partner_location, restaurant_location)
     delivery_route = OSRM.route(restaurant_location, customer_location)
     eta = route.duration + max(0, prep_time_remaining) + delivery_route.duration
3. If status == OUT_FOR_DELIVERY:
     route = OSRM.route(partner_location, customer_location)
     eta = route.duration
4. If ETA changed by > 1 min: push update via WebSocket

-- Location Storage --
Cassandra (append-only time-series):
CREATE TABLE partner_locations (
  partner_id  TEXT,
  order_id    TEXT,
  ts          TIMESTAMP,
  lat         DOUBLE,
  lng         DOUBLE,
  bearing     FLOAT,
  speed_kmh   FLOAT,
  PRIMARY KEY ((partner_id, order_id), ts)
) WITH CLUSTERING ORDER BY (ts DESC);`,
    },
    {
      id: "restaurantService",
      title: "Restaurant & Menu Service — LLD",
      description: "Menu management, real-time item availability, preparation time estimation and restaurant onboarding",
      api: `GET /v1/restaurants/{restaurant_id}/menu

Response 200:
{
  "restaurant": {
    "id": "rest_abc123",
    "name": "Spice Garden",
    "cuisine": ["North Indian", "Mughlai"],
    "rating": 4.3,
    "delivery_time_min": 30,
    "min_order": 149,
    "is_open": true,
    "next_open": null
  },
  "menu": [
    {
      "category_id": "cat_mains",
      "category_name": "Main Course",
      "items": [
        {
          "item_id": "item_butter_chicken",
          "name": "Butter Chicken",
          "description": "Tender chicken in rich tomato-butter gravy",
          "price": 320.00,
          "is_veg": false,
          "is_available": true,
          "image_url": "https://cdn.zomato.com/items/butter_chicken.jpg",
          "tags": ["bestseller", "must-try"],
          "rating": 4.6,
          "order_count": 12450,
          "customisation_groups": [
            {
              "group_id": "grp_spice",
              "name": "Spice Level",
              "required": true,
              "min_select": 1,
              "max_select": 1,
              "options": [
                { "id": "opt_mild",   "name": "Mild",   "extra_price": 0 },
                { "id": "opt_medium", "name": "Medium", "extra_price": 0 },
                { "id": "opt_spicy",  "name": "Spicy",  "extra_price": 0 }
              ]
            }
          ]
        }
      ]
    }
  ]
}

-- Restaurant Schema --
CREATE TABLE restaurants (
  restaurant_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  owner_id          UUID NOT NULL,
  location          POINT NOT NULL,
  address           JSONB,
  cuisine_tags      TEXT[],
  rating            NUMERIC(3,2),
  rating_count      INT DEFAULT 0,
  commission_pct    NUMERIC(4,2),    -- platform commission %
  is_active         BOOLEAN DEFAULT true,
  operating_hours   JSONB,
  avg_prep_time_min INT DEFAULT 25,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE menu_items (
  item_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID REFERENCES restaurants(restaurant_id),
  category_id       UUID NOT NULL,
  name              TEXT NOT NULL,
  price             NUMERIC(8,2) NOT NULL,
  is_veg            BOOLEAN,
  is_available      BOOLEAN DEFAULT true,
  image_url         TEXT,
  order_count       INT DEFAULT 0,
  customisations    JSONB,
  INDEX (restaurant_id, is_available)
);

-- Toggle item availability --
PATCH /v1/restaurant/menu/items/{item_id}
{ "is_available": false }
→ PostgreSQL UPDATE + Redis SET item:{id}:available 0 + Elasticsearch partial update`,
    },
    {
      id: "reviewService",
      title: "Review & Rating Service — LLD",
      description: "Verified purchase reviews, Bayesian rating aggregation, fraud detection and photo moderation",
      api: `POST /v1/reviews
Authorization: Bearer {jwt}

{
  "order_id": "ZO20260430001234",     // links to verified purchase
  "restaurant_id": "rest_abc123",
  "ratings": {
    "overall": 4,
    "food": 5,
    "delivery": 4,
    "value": 4
  },
  "text": "Amazing butter chicken! Delivery was quick. Packaging could be better.",
  "tags": ["fast delivery", "great taste", "portion size good"],
  "photos": ["photo_upload_id_abc", "photo_upload_id_def"]
}

Response 201:
{
  "review_id": "rev_xyz789",
  "status": "PUBLISHED",    // PUBLISHED / UNDER_REVIEW (if flagged)
  "helpful_count": 0
}

GET /v1/restaurants/{restaurant_id}/reviews?sort=recent&page=1&limit=10

-- Rating Update (atomic) --
On new review submission:
  new_rating = ((old_rating × old_count) + review_rating) / (old_count + 1)
  But use Bayesian smoothing:
    C = 50  (prior strength)
    m = 3.8 (global mean)
    bayesian = (C × m + sum_of_ratings) / (C + total_count)

  PostgreSQL UPDATE restaurants SET
    rating = bayesian_rating,
    rating_count = rating_count + 1
  WHERE restaurant_id = X

  Redis HMSET restaurant:{id}:rating value:{new_rating} count:{new_count}

-- Review Schema --
CREATE TABLE reviews (
  review_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        TEXT REFERENCES orders(order_id) UNIQUE,  -- one review per order
  customer_id     UUID NOT NULL,
  restaurant_id   UUID NOT NULL,
  overall_rating  SMALLINT CHECK (overall_rating BETWEEN 1 AND 5),
  food_rating     SMALLINT,
  delivery_rating SMALLINT,
  value_rating    SMALLINT,
  text            TEXT,
  tags            TEXT[],
  photos          TEXT[],
  helpful_count   INT DEFAULT 0,
  status          TEXT DEFAULT 'PUBLISHED',
  -- PUBLISHED / UNDER_REVIEW / REMOVED / FLAGGED
  moderation_note TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  INDEX (restaurant_id, created_at DESC),
  INDEX (customer_id, created_at DESC)
);`,
    },
    {
      id: "serviceMesh",
      title: "Service Mesh — Envoy/Istio Sidecar Configuration",
      description: "Per-metro-cluster Istio mesh: Restaurant Service circuit breaking, Dispatch/Tracking LB-only, partner-scoring canary, payment-access AuthorizationPolicy",
      api: `# Istio configuration — applied per metro cluster (west-prod, north-prod, ...)

# 1. Restaurant Service — tight circuit breaking.
#    Highest fan-in of any service: every search result, menu fetch, and
#    the 3-minute order-acceptance flow depends on it.
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: restaurant-service-circuit-breaker
  namespace: west-prod
spec:
  host: restaurant-service.west-prod.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 10000
      http:
        http1MaxPendingRequests: 5000
        maxRequestsPerConnection: 100
    loadBalancer:
      simple: LEAST_REQUEST
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 5s
      baseEjectionTime: 15s
      maxEjectionPercent: 50
---
# 2. Dispatch Service — load balancing ONLY, no outlier ejection.
#    Each replica holds in-flight 30-second partner-offer state; ejecting
#    a replica mid-offer would orphan it and force re-assignment.
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: dispatch-service-lb
  namespace: west-prod
spec:
  host: dispatch-service.west-prod.svc.cluster.local
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
# 3. Tracking Service — load balancing ONLY, no outlier ejection.
#    GPS ingestion and WebSocket pushes (every 5s) are stateful
#    connections per active delivery; ejecting a replica drops live
#    tracking sessions.
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: tracking-service-lb
  namespace: west-prod
spec:
  host: tracking-service.west-prod.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 6000
      http:
        http1MaxPendingRequests: 3000
        maxRequestsPerConnection: 200
    loadBalancer:
      simple: LEAST_REQUEST
---
# 4. Canary new partner-scoring weights (distance_score vs reliability_score,
#    where reliability = 0.4×on_time_rate + 0.3×acceptance_rate + 0.3×rating)
#    against live acceptance-rate and on-time-delivery metrics.
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: dispatch-service-canary
  namespace: west-prod
spec:
  hosts:
    - dispatch-service.west-prod.svc.cluster.local
  http:
    - match:
        - headers:
            x-dispatch-scoring-canary:
              exact: "true"
      route:
        - destination:
            host: dispatch-service.west-prod.svc.cluster.local
            subset: v2
    - route:
        - destination:
            host: dispatch-service.west-prod.svc.cluster.local
            subset: v1
          weight: 95
        - destination:
            host: dispatch-service.west-prod.svc.cluster.local
            subset: v2
          weight: 5
      retries:
        attempts: 2
        perTryTimeout: 10s
        retryOn: 5xx,reset,connect-failure
---
# 5. Payment integrity — only Order Service may create payment intents
#    or trigger charges/refunds.
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: payment-service-access
  namespace: west-prod
spec:
  selector:
    matchLabels:
      app: payment-service
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/west-prod/sa/order-service"]
      to:
        - operation:
            paths: ["/internal/payments/intent", "/internal/payments/charge", "/internal/payments/refund"]
            methods: ["POST"]
---
# 6. mTLS within the metro cluster
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: west-prod
spec:
  mtls:
    mode: STRICT`,
      internals: `Sidecar injection scope (6 services, matching the LLD components):
  IN MESH:  Order Service, Search Service, Dispatch Service, Restaurant
            Service, Tracking Service, Payment Service
  OUT:      Review Service (async, non-latency-critical write path),
            Kafka (Event Bus), PostgreSQL, Redis, Elasticsearch, Cassandra,
            S3, ClickHouse — none are synchronous hops Envoy can apply L7
            policy to.

Restaurant Service circuit breaking — sized against fan-in:
  From Back-of-the-Envelope Estimation: ~104 search QPS average (~520 QPS
  at 5x dinner peak), each search hitting Restaurant Service's
  availability/menu data, PLUS every order-acceptance call during the
  3-minute restaurant-response window. outlierDetection (interval: 5s /
  baseEjectionTime: 15s) ejects a single bad replica fast — before retries
  against it eat into either the <50ms search budget or the 3-minute
  acceptance SLA.
  This is COMPLEMENTARY to the existing app-level breaker ("if restaurant
  service has error rate > 5% → circuit open → return cached menu"): the
  mesh layer handles per-replica health and transparent reroute; the app
  layer handles whole-service exhaustion and falls back to a cached
  response. Different granularities, same goal.

Dispatch & Tracking — LB-only, the same reasoning as the dispatch and
location services elsewhere in this series: both hold per-order or
per-delivery STATE across multiple requests (a 30-second partner offer; a
live GPS/WebSocket session). outlierDetection would eject a replica based
on 5xx rate, but a replica mid-offer or mid-stream isn't "unhealthy" from
the caller's perspective — ejecting it actively breaks an in-flight
operation. LEAST_REQUEST spreads NEW offers/connections without disturbing
active ones. Tracking Service's connection pool (maxConnections: 6000) is
sized larger than Dispatch's, reflecting derivation #4's ~187,400
concurrent WebSocket connections at peak spread across many replicas.

Canary — tied to the two-stage scoring formula in the Dispatch Service LLD:
  final_score = 0.4 × distance_score + 0.6 × reliability_score
  reliability_score = 0.4×on_time_rate + 0.3×acceptance_rate + 0.3×rating
  Re-weighting any of these five coefficients changes which partner gets
  offered first — a high-risk change to ship blind. perTryTimeout: 10s
  leaves headroom for one retry within the 30-second offer window.

Payment AuthorizationPolicy:
  Only Order Service's mesh identity can create payment intents or trigger
  charges/refunds — independent of application code. This closes off an
  entire class of "some other service accidentally calls the payment API"
  bugs at the infrastructure layer.

mTLS & control-plane topology:
  Istio runs PER METRO CLUSTER (west-prod, north-prod, south-prod,
  east-prod, ...), grouping the 800+ cities into a handful of regional
  control planes — granular enough to contain a control-plane incident to
  one region, coarse enough to be operable. Sidecars fail open on
  last-known config if the local control plane drops, consistent with the
  < 2s order-placement SLA having ample headroom for the ~1-2ms sidecar tax.`,
    },
  ],
};

export const ZOMATO_QNA = [
  {
    id: "zomq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Zomato", "Swiggy", "DoorDash"],
    question: "Design a food delivery platform like Zomato. Walk through the key components.",
    answer: `Food delivery is a three-sided marketplace: customer + restaurant (production constraint) + delivery partner. The production constraint (restaurant must cook food) is what makes it architecturally different from ride-hailing.

CORE COMPONENTS:

1. DISCOVERY & SEARCH:
   Hyperlocal: only restaurants within delivery radius (5–7 km) are shown
   Elasticsearch: geo_distance filter + BM25 text relevance + personalisation boosting
   Real-time availability: restaurant heartbeat → Redis → Elasticsearch filter
   Ranking: relevance × distance × rating × popularity × personalised affinity

2. ORDER MANAGEMENT:
   Idempotent placement (idempotency_key prevents double orders)
   State machine: PLACED→ACCEPTED→FOOD_READY→PARTNER_ASSIGNED→PICKED_UP→DELIVERED
   ETA = max(prep_time, partner_travel_to_restaurant) + restaurant_to_customer_travel

3. DISPATCH ENGINE:
   Geo-lookup (Redis GEORADIUS) for available partners near restaurant
   Score by: distance + on-time rate + acceptance rate + customer rating
   Offer with 30-second timeout → cascade to next if declined
   Batch orders: assign 2 nearby orders to same partner if ETA impact < 5 min

4. LIVE TRACKING:
   Partner app GPS ping every 5 seconds → Kafka → Redis + Cassandra
   Map matching: snap GPS to road via OSRM (smooth out noise)
   WebSocket push to customer: location update every 5 seconds

5. PAYMENTS:
   Razorpay/Juspay gateway + Zomato wallet credits
   Restaurant settlement: weekly/daily NEFT after deducting 18–25% commission

KEY INSIGHT:
   The preparation time estimation is as hard as delivery routing — a biryani
   takes 25 min to cook, a roll takes 5 min. Getting this wrong breaks ETA promises.`,
  },
  {
    id: "zomq2",
    category: "Dispatch",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Zomato", "Swiggy", "Uber Eats"],
    question: "How does the delivery partner dispatch algorithm work? How do you handle surge?",
    answer: `Dispatch is a real-time assignment problem with a hard SLA: partner must be assigned before the restaurant finishes cooking (typically 15–25 minutes).

ASSIGNMENT ALGORITHM:

Step 1 — Find candidates:
  Redis GEORADIUS restaurant_lat restaurant_lng 3km → available partner IDs
  Only AVAILABLE partners (not GOING_TO_RESTAURANT or OUT_FOR_DELIVERY)

Step 2 — Score:
  For each candidate:
    distance_to_restaurant = haversine(partner_loc, restaurant_loc)
    score = 0.4 × (1/distance) + 0.3 × on_time_rate + 0.2 × acceptance_rate + 0.1 × rating

Step 3 — Offer cascade:
  Push notification to #1 partner (30-second window)
  Decline or timeout → offer to #2 → #3
  After 3 declines → widen to 5 km radius, re-score
  After 5 km fails → surge mode: increase payout → attract more partners to come online

BATCH ASSIGNMENT (efficiency):
  Partner waiting at Restaurant A → new order from Restaurant B 400m away
  If batch ETA impact for both customers < 5 min → assign both
  Partner picks up both → delivers closer first → saves 1 partner movement
  Platform economics: fewer partners needed at same supply level

SURGE HANDLING:
  Triggers: order queue depth > threshold OR average assignment wait > 3 minutes
  Response chain:
    1. Increase per-order payout by ₹10–20 (attracts idle partners back online)
    2. Show "High demand in your area" to partners in adjacent zones
    3. Increase delivery fee shown to customer (demand-side suppression)
    4. Show increased ETA estimates (manage expectations)
  Predictive surge: known events (IPL final, Diwali) → pre-scale 30 min before
  This is different from Uber: food delivery surge is zone-based, not citywide

PARTNER SUPPLY MANAGEMENT:
  "Partner slots": time-based incentives to guarantee minimum supply during peaks
  Example: "Be online 7–9 PM and earn guaranteed ₹300 minimum" → commitment contract
  Reduces uncertainty for partners → more partners plan their schedules around peak hours`,
  },
  {
    id: "zomq3",
    category: "Search",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Zomato", "Swiggy", "Yelp"],
    question: "How do you design a hyperlocal restaurant search that returns relevant results in under 100ms?",
    answer: `Hyperlocal search has two constraints that global search doesn't: geo-filtering MUST happen first, and real-time availability must be respected.

ARCHITECTURE:

Elasticsearch as the search engine:
  Why not just SQL? Elasticsearch handles: full-text fuzzy matching, geo queries, ranking by multiple signals, relevance scoring — all in one query
  Why not Redis? Full-text search and multi-signal ranking are hard in Redis

INDEX STRUCTURE:
  One index for restaurants (not one per city — Elasticsearch handles geo natively)
  Denormalised: popular menu items embedded in restaurant document for search
  Updated: on menu change → async reindex (< 30 seconds via Kafka consumer)

QUERY EXECUTION:
  Step 1 (< 5ms): geo_distance filter — eliminates 99.9% of restaurants (not in radius)
  Step 2 (< 20ms): text matching on filtered set (only ~200–500 restaurants)
  Step 3 (< 5ms): availability filter — is_open=true (Redis-backed, refreshed every 90s)
  Step 4 (< 10ms): scoring and ranking
  Total: < 50ms for complex queries

RANKING SIGNALS:
  text_relevance (BM25) × 0.3 +
  rating × 0.2 +
  order_popularity × 0.2 +
  distance_penalty × 0.15 +
  personalisation_boost × 0.15

PERSONALISATION:
  User's past order history → category affinities (ordered Chinese 5× → Chinese restaurants boosted)
  Stored in Redis per user: HMGET user:{id}:affinities → cuisine → weight
  Applied as a boost query in Elasticsearch: multiply score by (1 + affinity_weight)

CACHING:
  Popular queries (city + category combinations): Redis cache with 60s TTL
  City homepage restaurant list: Redis cache with 5-minute TTL
  User-specific results: no caching (personalised)

REAL-TIME AVAILABILITY:
  Hard filter — don't show closed restaurants, ever
  Restaurant heartbeat every 60s → if missed for 90s → Redis SET restaurant:{id}:online 0
  Elasticsearch does NOT have sub-second updates → availability check done via Redis lookup
  Post-Elasticsearch: filter result list against Redis availability keys`,
  },
  {
    id: "zomq4",
    category: "ETA",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Zomato", "Swiggy", "Uber Eats"],
    question: "How do you accurately estimate food delivery time? ETA = prep time + delivery time — how do you compute each?",
    answer: `ETA accuracy is a major driver of customer satisfaction. Overestimate → fewer orders. Underestimate → angry customers and late deliveries.

ETA FORMULA:
  ETA = max(prep_time_estimate, partner_travel_to_restaurant) + restaurant_to_customer_travel
  "Max" handles: if partner arrives before food is ready, they wait — the constraint is whichever takes longer

PREP TIME ESTIMATION:

Naive approach (what most platforms do): restaurant's self-declared average prep time
Problem: wildly inaccurate — "Biryani takes 25 min" but rolls take 5 min

Better: item-level prep time model
  Training data: (order_id, items, actual PLACED→FOOD_READY time) from millions of orders
  Features:
    - Item types and their historical cook times (LSTM on item sequences learns combinations)
    - Quantity multiplier (10 items ≠ 1 item)
    - Restaurant kitchen load right now (how many concurrent active orders?)
    - Time of day (dinner rush: 7–9 PM adds 8–12 min to any estimate)
    - Day of week (Sunday lunch = busiest, +5 min baseline)

  Model output: P50, P80 estimates (show P50 to customer, use P80 for internal SLA)

DELIVERY TIME:
  OSRM (self-hosted routing engine): real-time route from restaurant to customer
  Better than Google Maps API for high-volume because:
    - No per-query cost (self-hosted)
    - Can be tuned for motorcycle routing (different from car routing)
  Adjustments:
    - Rain penalty: if it's raining → +6 minutes (measured from historical data)
    - Complex buildings: gated societies, high-rises → +3–5 min (address-level lookup)
    - Traffic patterns: Zomato's own delivery-time history per route × time-of-day

CONTINUOUS CALIBRATION:
  Every completed delivery: compare predicted ETA vs actual delivery time
  Running error tracking per restaurant, per zone, per time-of-day
  If a restaurant consistently delivers 8 min later than predicted → apply correction factor
  Model retrained weekly with fresh actuals`,
  },
  {
    id: "zomq5",
    category: "Scale",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Zomato", "Swiggy", "Deliveroo"],
    question: "How does Zomato handle 5× traffic spike during dinner rush and special events?",
    answer: `The dinner rush (7–9 PM) is predictable. New Year's Eve at midnight is extreme (8–10× normal). Each requires a different strategy.

PREDICTABLE PEAKS (dinner rush):
  Auto-scaling: Kubernetes HPA triggers scale-out at 60% CPU → 2-min scale-up
  Pre-scaling: known dinner rush → scale at 6:30 PM before demand hits (not reactive)
  Database: read replicas absorb search/read load, primary only for writes

EXTREME PEAKS (New Year, Diwali):
  Manual pre-scaling: ops team scales up 6-12 hours before event
  Target: provision for 8× normal → absorbs any spike
  Cost: accepting higher cloud bill for 2–3 hours vs risking outage

LOAD SHEDDING (last resort):
  If overwhelmed despite scaling: queue incoming orders in Kafka
  Customer sees: "Order queued, confirming in ~30 seconds" (informed wait > unexplained error)
  This is better than HTTP 503 — at least customer knows their order is in the system

STATELESS SERVICES:
  All API servers are stateless (session in Redis, not in-process)
  Any instance can handle any request → easy horizontal scaling
  No sticky sessions → load balancer distributes freely

DATABASE WRITE PRESSURE:
  3M orders/day = 35 writes/second average → 170 writes/second at peak (5× surge)
  PostgreSQL primary can handle this — connection pooling via PgBouncer is the real constraint
  Location pings: 350K partners × 12/min = 70K writes/second → Cassandra handles this

CDN FOR STATIC CONTENT:
  Restaurant photos, food images: CloudFront CDN, zero origin hits during surge
  City landing pages, restaurant cards: Redis-cached, 15s TTL during peak
  The App itself (JS/CSS): S3+CloudFront, indefinitely cached with content-addressed URLs

CIRCUIT BREAKERS:
  If Elasticsearch is slow → return Redis-cached restaurant list for the user's zone
  If payment service is down → queue orders, retry every 5s, inform customer
  If dispatch service is slow → hold orders in FOOD_READY state with manual ops escalation`,
  },
  {
    id: "zomq6",
    category: "Estimation",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Zomato", "Swiggy", "DoorDash"],
    question: "Walk through the back-of-the-envelope math for Zomato's scale — how many delivery partners are actually active during dinner rush, and what does that tell you about the design?",
    answer: `This is a Little's Law problem dressed up as a capacity question, and the answer ends up explaining why two specific design choices exist.

ASSUMPTIONS:
  100M MAU, 3M+ orders/day average (5M+ on peak days)
  Dinner rush (7-9 PM) generates ~5x the off-peak instantaneous order rate
  350K delivery partners, GPS ping every 5 seconds while on a delivery
  Avg total delivery cycle (assignment → delivered) ≈ 30 minutes (1,800s)
  ~3 search queries per placed order

THE FIVE DERIVATIONS:

1. Order placement rate:
   3,000,000 ÷ 86,400s ≈ 34.7 orders/sec average
   At 5x dinner rush ≈ 173.5 orders/sec
   → Sizes Order Service's Postgres writes; matches the "170 writes/sec at
   peak" figure used elsewhere for database write-pressure planning.

2. Concurrent active deliveries (Little's Law) — the headline result:
   concurrent = arrival_rate × time_in_system
   Average: 34.7 × 1,800s ≈ 62,460 orders in flight
   At 5x dinner peak: 173.5 × 1,800s ≈ 312,300 — against a total fleet of
   only 350K delivery partners.
   → At dinner peak, ~89% of the ENTIRE partner fleet needs to be
   simultaneously mid-delivery. That's not a detail — it's the reason
   "partner slots" (guaranteed-supply contracts for peak hours) and
   zone-based surge pricing exist as core design elements, not optional polish.

3. GPS ping ingestion at peak:
   312,300 ÷ 5s ≈ 62,460 pings/sec
   → Nearly identical to the documented "70K writes/second" Cassandra
   figure (350K partners × 12/min) — that figure already assumes
   near-total fleet utilisation, which derivation #2 shows is exactly
   what happens at dinner peak.

4. Customer WebSocket fanout:
   ~60% of active-order customers keep tracking open: 312,300 × 0.6 ≈ 187,400
   Each pushed every 5s → ~37,480 messages/sec
   → Sizes the WebSocket server fleet and Redis pub/sub channel count.

5. Search query load:
   3M × 3 ÷ 86,400s ≈ 104 QPS average, ~520 QPS at 5x peak
   → Comfortably inside the <50ms search latency budget.

INTERVIEW PUNCH LINE:
  "Derivation #2 is the one to lead with: at dinner-rush peak, ~89% of the
  entire 350K-partner fleet is simultaneously mid-delivery. Once you see
  that number, 'partner slots' and zone-based surge pricing stop looking
  like UX features and start looking like load-bearing capacity planning —
  without them, there's no way to clear the backlog. And derivation #3
  shows the math is self-consistent: it reproduces the documented 70K
  writes/sec Cassandra figure starting from nothing but the order-rate headline."`,
    followups: [
      "If the average delivery cycle dropped from 30 minutes to 22 minutes (faster dispatch + better routing), how would that change the concurrent-partner number — and would it actually relieve the dinner-rush crunch?",
      "How would you validate the '~60% of customers keep tracking open' assumption from production data, and what would you do differently if it were actually 90%?",
      "The 70K writes/sec Cassandra figure assumes near-total fleet utilisation — what happens to that pipeline during OFF-PEAK hours when utilisation is much lower? Is there a cost concern?",
    ],
  },
  {
    id: "zomq7",
    category: "Architecture",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Zomato", "Swiggy", "Uber Eats"],
    question: "Zomato already has app-level circuit breakers (e.g. 'if restaurant service error rate > 5%, return cached menu'). Would you put a service mesh on top, and what would it concretely change?",
    answer: `Yes — and the key is that the mesh operates at a different granularity than the existing app-level breakers, not as a replacement for them.

WHY A MESH FITS HERE:
  Restaurant Service has the highest fan-in of any service — every search
  result, menu fetch, and the 3-minute order-acceptance flow depends on it.
  Dispatch Service holds a 30-second in-flight partner-offer window.
  Tracking Service is stateful: GPS ingestion + WebSocket pushes every 5s.
  Payment Service should only ever be called by Order Service.

DATA PLANE: Envoy sidecar on 6 services — Order, Search, Dispatch,
Restaurant, Tracking, Payment. Review Service stays out (async, not
latency-critical).

CONTROL PLANE: Istio PER METRO CLUSTER (West, North, South, East, ...) —
with 800+ cities, per-city control planes don't scale, but a single global
one makes one region's incident everyone's incident. Metro clusters group
cities that already share delivery-partner and restaurant pools.

WHAT THIS CONCRETELY CHANGES:

1. Restaurant Service — TIGHT circuit breaking (outlierDetection,
   interval: 5s, baseEjectionTime: 15s). A single bad replica gets ejected
   in seconds, before its errors compound across search, menu fetch, and
   acceptance flows simultaneously.

2. Dispatch Service and Tracking Service — LOAD BALANCING ONLY, explicitly
   NO outlierDetection. Both hold per-request state (a 30s offer; a live
   GPS/WebSocket session) that ejection would orphan. LEAST_REQUEST
   spreads new work without touching in-flight operations.

3. VirtualService canary on Dispatch Service — ships changes to the
   partner-scoring formula (0.4×distance_score + 0.6×reliability_score) to
   5% of traffic via header-matched subsets, with perTryTimeout: 10s
   leaving room for one retry inside the 30s offer window.

4. AuthorizationPolicy on Payment Service — restricts intent-creation and
   charge/refund endpoints to Order Service's mesh identity only,
   independent of application code.

5. mTLS (STRICT) + tracing across all 6 services automatically.

HOW THIS RELATES TO THE EXISTING APP-LEVEL BREAKER:
  "If restaurant service error rate > 5% → circuit open → return cached
  menu" operates on WHOLE-SERVICE error rate and falls back to a cached
  response — a business-logic decision about what to show the user.
  The mesh-level outlierDetection operates on PER-REPLICA health and
  transparently reroutes to a healthy replica — an infrastructure decision
  the application never sees. These are complementary: the mesh layer
  usually prevents the app-level breaker from ever tripping, by routing
  around bad replicas before whole-service error rate climbs.

WHAT STAYS OUT:
  Kafka, PostgreSQL, Redis, Elasticsearch, Cassandra, S3, ClickHouse,
  Review Service.

TRADE-OFFS:
  ~1-2ms sidecar tax per hop is negligible against the <2s order-placement
  SLA. Control-plane-down means sidecars fail open on cached config — at
  metro-cluster granularity, a control-plane incident is contained to one
  region's cities, not all 800+.`,
    followups: [
      "Walk through what happens — at both the mesh layer and the app layer — when one Restaurant Service replica starts timing out during dinner rush.",
      "Why explicitly exclude Review Service from the mesh? What would change if review submissions started showing up in production incident timelines?",
      "If you were rolling this mesh out metro-cluster by metro-cluster, which one would you pick first, and what would you watch before expanding to the next?",
    ],
  },
];
