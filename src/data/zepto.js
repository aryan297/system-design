export const ZEPTO_HLD = {
  title: "Zepto — High Level Design",
  subtitle: "Quick commerce platform — 10-minute grocery delivery, dark store model, hyperlocal fulfillment",
  overview: `Zepto is an Indian quick commerce (q-commerce) startup promising 10-minute grocery delivery. Unlike traditional e-commerce with large warehouses on city outskirts, Zepto operates a network of small dark stores (500–2000 sq ft) placed every 2–3 km inside residential neighbourhoods.

The 10-minute promise is not a marketing stunt — it is a hard engineering constraint that shapes every architectural decision: inventory must be accurate to the unit (no out-of-stock surprises at pick time), orders must be assigned to a delivery partner within seconds of placement, and the entire pick-pack-dispatch pipeline must complete in under 6 minutes leaving 4 minutes for last-mile delivery.

Core challenges: real-time inventory reservation across thousands of SKUs per dark store, hyperlocal routing to select the optimal dark store per order, ML-driven demand forecasting to ensure the right stock is at the right store before demand hits, and a dispatch engine that matches delivery partners and computes live ETAs.`,

  diagram: `
┌───────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                   │
│               iOS App · Android App · Web · Partner App               │
└─────────────────────────┬─────────────────────────────────────────────┘
                          │  HTTPS / REST / WebSocket (live tracking)
                          ▼
┌───────────────────────────────────────────────────────────────────────┐
│                  API GATEWAY (Kong / AWS ALB)                         │
│        SERVICE MESH — Envoy sidecar attached to every service         │
│      Auth (JWT) · Rate Limiting · Routing · TLS Termination           │
│     mTLS · Load Balancing · Retries · Circuit Breaking · Tracing      │
└──┬──────────┬────────────┬──────────────┬────────────────┬────────────┘
   │          │            │              │                │
   ▼          ▼            ▼              ▼                ▼
┌───────┐ ┌───────┐ ┌──────────┐ ┌────────────┐ ┌──────────────────┐
│Catalog│ │ Order │ │Inventory │ │  Dispatch  │ │ Notification     │
│Service│ │Service│ │ Service  │ │  Service   │ │ Service          │
└───┬───┘ └───┬───┘ └────┬─────┘ └─────┬──────┘ └──────────────────┘
    │         │           │             │
    ▼         ▼           ▼             ▼
┌───────────────────────────────────────────────────────────────────────┐
│                        EVENT BUS (Kafka)                              │
│   order.placed · inventory.reserved · order.picked · order.dispatched │
└───────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                    │
│  PostgreSQL (orders, inventory) · Redis (stock cache, sessions, ETA)  │
│  Elasticsearch (catalog search) · Cassandra (location history)        │
│  S3 (product images) · Kafka (event stream) · ClickHouse (analytics)  │
└───────────────────────────────────────────────────────────────────────┘`,

  metrics: [
    { label: "Delivery promise", value: "10 min", note: "avg actual ~8.5 min" },
    { label: "Dark stores", value: "700+", note: "across 10 Indian cities" },
    { label: "Orders per day", value: "1M+", note: "and growing" },
    { label: "SKUs per store", value: "~4,000", note: "curated vs Amazon's millions" },
    { label: "Pick + pack SLA", value: "< 6 min", note: "leaves 4 min for last mile" },
    { label: "Inventory accuracy", value: "> 99.5%", note: "OOS at pick < 0.5%" },
    { label: "On-time delivery", value: "> 95%", note: "within promised window" },
    { label: "Order fill rate", value: "> 98%", note: "items successfully fulfilled" },
  ],

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Catalog, Search & Order Placement",
      sections: [
        {
          title: "Hyperlocal Catalog — What You See Depends on Where You Are",
          content: `Unlike Amazon showing the same catalog to everyone, Zepto's catalog is hyperlocal. The 4000 SKUs visible to a customer in Andheri differ from those in Bandra because each dark store stocks different items.

CATALOG SERVICE:
  Global catalog: master product database (name, description, images, category, brand)
  Store-level inventory overlay: which SKUs are available at which store with what quantity
  Dynamic pricing layer: prices can vary by store (cost of local procurement differs)

HOW DARK STORE IS SELECTED:
  1. Customer opens app → device sends GPS coordinates
  2. Geospatial query: find all dark stores within configurable radius (usually 2–3 km)
  3. Score stores by: distance, current capacity, stock availability for cart items
  4. Assign customer to optimal store — this selection is sticky for the session

SEARCH (Elasticsearch):
  Tokenised and fuzzy search across ~4000 SKUs per store
  Synonyms: "curd" → "yogurt", "dahi" → "curd"
  Search results filtered by: in-stock at assigned dark store only
  Typo tolerance: "tomatoe" matches "tomato"
  Ranking: relevance × availability × margin × personalisation score`,
        },
        {
          title: "Cart & Checkout — Race Against Out-of-Stock",
          content: `The biggest failure mode in q-commerce: item shows as available in cart but goes out of stock between add-to-cart and checkout.

SOFT RESERVATION (cart stage):
  No hard lock on inventory — cart items are not reserved
  Stock counts cached in Redis with a TTL; high-velocity items refresh every 5 seconds
  Stale stock warning shown if an item's count drops below a threshold while in cart

HARD RESERVATION (checkout):
  On "Place Order", call Inventory Service to atomically decrement stock for all cart items
  Use Redis MULTI/EXEC (atomic transaction) to prevent overselling
  If any item is out of stock: return partial availability to user (remove OOS items or suggest substitute)
  Only after successful reservation does the order record get committed to PostgreSQL

IDEMPOTENCY:
  Every order placement carries an idempotency key (device-generated UUID)
  Stored in a DB table with UNIQUE constraint — duplicate requests return the same order_id
  Critical for mobile: user taps "Order" twice on bad network → only one order created`,
        },
        {
          title: "Back-of-the-Envelope Estimation",
          content: `Five numbers, derived from the headline metrics, explain why the dark-store
capacity limits, Redis sizing, and forecasting batch job look the way they do.

ASSUMPTIONS:
• 5M+ orders/day (2024 scale), 3× peak during evening rush / festive seasons
• 700+ dark stores across 10 cities, ~4,000 SKUs/store
• Pick + pack SLA < 6 min (360s); dark-store capacity = 30-50 simultaneous active orders
• Avg basket ≈ 5 items/order
• Delivery partner GPS ping every 5s; tracking WebSocket pushes every 15s
• Demand forecasting: XGBoost retrained nightly, one model per SKU-store pair

1. ORDER RATE vs DARK-STORE CAPACITY — A CONSISTENCY CHECK
   5M/day ÷ 86,400s ≈ 58 orders/sec globally ÷ 700 stores ≈ 0.083 orders/sec/store
   ≈ 1 order arriving every 12 seconds, per store, on average.
   Little's Law: concurrent orders/store ≈ arrival_rate × time_in_system
     ≈ 0.083/sec × 360s ≈ 30 — exactly the LOWER bound of the documented
     "30-50 simultaneous active orders" capacity.
   At 3× peak (174 orders/sec globally, ~0.25/sec/store) → concurrent ≈ 90/store
   → blows past the 50-order cap, which is precisely why "Burst handling: if
     demand exceeds capacity, orders overflow to adjacent dark store" exists.

2. GPS INGEST & TRACKING FAN-OUT
   Assume ~40% of a store's concurrent orders are currently "en route"
   (dispatched, not yet delivered) → 30-50 × 0.4 ≈ 12-20 active partners/store
   × 700 stores ≈ 8,400-14,000 partners pinging GPS every 5s
   ≈ ~1,700-2,800 location pings/sec globally → Kafka → Location Service → Cassandra
   WebSocket pushes every 15s to the same set of orders ≈ ~560-930 pushes/sec
   → Sizes Cassandra's partner_locations write rate and the WebSocket fanout tier.

3. INVENTORY RESERVATION THROUGHPUT
   5M orders/day × ~5 items/order = 25M reservation decrements/day
   ÷ 86,400s ≈ 290 ops/sec average, ~870 ops/sec at 3× peak
   Each is a Redis WATCH/MULTI/DECRBY/EXEC round trip
   → Sizes the Redis Cluster's sustained command rate for inventory_cache —
     comfortably inside a single Redis Cluster's typical 100K+ ops/sec ceiling,
     confirming Redis (not Postgres) is the right choice for the hot path.

4. CATALOG & SEARCH LOAD PER STORE INDEX
   Each order session involves ~4 catalog/search requests on average before
   checkout → 5M × 4 = 20M requests/day ÷ 86,400s ≈ 230 req/sec globally
   Category pages are cached (60s TTL) — assume ~20% of requests are
   uncached searches hitting Elasticsearch directly ≈ 46 search QPS
   Spread across 700 PER-STORE indices ≈ ~0.066 QPS/index average
   → Confirms per-store Elasticsearch indices are viable even though there
     are 700 of them — each index sees a trickle of traffic, not a flood.

5. DEMAND FORECASTING BATCH SIZE
   700 stores × ~4,000 SKUs/store ≈ 2.8M SKU-store pairs, each needing its
   own XGBoost model retrained nightly in the 1-3 AM window (≈2 hours)
   2.8M ÷ 7,200s ≈ 389 models/sec sustained training throughput required
   → This is the number that makes "retrained nightly" a distributed Spark
     batch job across hundreds of executors, not a single-machine cron job.

Interview punch line: "58 orders/sec ÷ 700 stores reproduces the documented
30-50 concurrent-order capacity via Little's Law — and explains exactly when
overflow-to-adjacent-store kicks in. ~290-870 reservation ops/sec confirms
Redis over Postgres for the hot inventory path. ~1,700-2,800 GPS pings/sec
sizes Cassandra's write rate. And 2.8M SKU-store pairs is why nightly
forecasting is a Spark cluster job, not a script."`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Inventory & Dark Store Management",
      sections: [
        {
          title: "Real-Time Inventory — The Hardest Problem in Q-Commerce",
          content: `Zepto's 10-minute promise dies if a picker walks to a shelf and the item isn't there. Inventory accuracy is the foundation everything else is built on.

TWO-LAYER INVENTORY:
  PostgreSQL: source of truth — exact stock per SKU per store (updated on every pick, receipt, adjustment)
  Redis: hot cache of current stock levels, read by catalog service in milliseconds
  Sync: Kafka event on every inventory change → consumer updates Redis cache
  Discrepancy handling: periodic reconciliation job compares Redis to PostgreSQL; alerts on drift > 2%

STOCK OPERATIONS:
  Reserve:   atomic decrement at order placement (prevents overselling)
  Release:   increment back if order is cancelled before picking starts
  Pick:      confirmed decrement when picker scans item at shelf
  Receive:   increment when supplier delivery arrives and is counted/scanned
  Adjust:    manual correction for damaged goods, theft, miscounts — every adjustment logged

EXPIRY & FIFO:
  Each batch of perishables tagged with expiry date at receive time
  FIFO enforced: picker app shows which shelf/batch to pick from (oldest first)
  Automated write-off: nightly job marks expired stock as waste, decrements inventory

SHRINKAGE DETECTION:
  If pick confirmations consistently fail (item not on shelf) → shrinkage alert
  Store manager investigates: theft, miscounting, damage not reported
  ML model tracks shrinkage rate per SKU per store → flags anomalies`,
        },
        {
          title: "Dark Store Operations — The Physical Constraint",
          content: `A dark store is a micro-fulfillment center, not a regular store. It is optimised for speed of pick, not browsing.

LAYOUT OPTIMISATION:
  High-velocity items (milk, bread, bananas) placed nearest to packing station
  ABC analysis: A-items (top 20% by order frequency) = front zone, B/C = back zones
  Layout updated weekly based on sales velocity data

CAPACITY MANAGEMENT:
  Each dark store has a max concurrent order capacity (typically 30–50 simultaneous active orders)
  Order throttling: if store is at capacity, new incoming orders are queued (shown as +2 min ETA)
  Burst handling: if demand exceeds capacity, orders overflow to adjacent dark store (if within SLA distance)

STORE HEALTH METRICS:
  Pick accuracy rate (target > 99.5%)
  Average pick time per item (target < 20 seconds)
  OOS rate at pick time (target < 0.5%)
  On-time dispatch rate (target > 95%)`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Order Fulfillment Pipeline",
      sections: [
        {
          title: "Pick → Pack → QC → Handoff in Under 6 Minutes",
          content: `Once an order is placed, the clock starts. The internal SLA: order ready for dispatch within 6 minutes.

FULFILLMENT PIPELINE:
  1. Order Placed (t=0):
     → Kafka event: order.placed
     → Order Management System assigns order to picker (least-loaded picker in store)
     → Picker app vibrates with new order notification

  2. Picking (t=0 to t=3 min):
     → Picker app shows optimised pick path (shelf locations sorted to minimise walking)
     → Picker scans each item barcode — confirms pick or reports OOS
     → OOS handling: substitute suggestion shown, customer notified via push in real-time
     → All items scanned → pick confirmed → Kafka: order.picked

  3. Packing (t=3 to t=5 min):
     → Packer assembles items into bag, adds ice pack for cold chain items
     → Scans bag label (links bag to order_id)
     → Kafka: order.packed

  4. Quality Check & Handoff (t=5 to t=6 min):
     → QC scan: verify bag label matches assigned delivery partner
     → Delivery partner scans acceptance on their app → Kafka: order.dispatched
     → Customer receives "Your order is on the way" push + live tracking link

PICKER ASSIGNMENT:
  Greedy assignment: order goes to the picker with fewest pending items in current batch
  Batch picking: if two orders share SKUs, one picker handles both (reduces total walking)
  Batch size capped at 3 orders to prevent complexity from blowing past the 6-min SLA`,
        },
        {
          title: "Substitution & OOS Handling",
          content: `An out-of-stock item during picking is the most common failure mode. Handling it well is the difference between a refund and a retained customer.

SUBSTITUTION ENGINE:
  Every SKU has a ranked list of substitutes (pre-computed offline by category managers + ML)
  Ranking factors: similarity score, price delta, same brand preference, margin
  Example: Amul Full Cream Milk 1L → Amul Toned Milk 1L → Mother Dairy Full Cream 1L

REAL-TIME CUSTOMER NOTIFICATION:
  When picker marks item as OOS → immediate push notification to customer
  Customer sees: "X is unavailable — we suggest Y (same price / +₹5 / -₹5)"
  Customer can: Accept substitute / Remove item (refund) / Cancel order entirely
  Response window: 60 seconds — if no response, default action applied (accept substitute if price ≤ original)

PARTIAL FULFILMENT:
  If multiple items are OOS and customer cancels them, order proceeds with remaining items
  Refund for removed items processed immediately to Zepto wallet (instant) or original payment method (T+2)`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Dispatch, Routing & Delivery",
      sections: [
        {
          title: "Delivery Partner Assignment — The Last-Mile Problem",
          content: `Zepto maintains a fleet of gig delivery partners, each assigned to a dark store zone. The dispatch engine must match the right partner to each order in real-time.

PARTNER STATES:
  Available: at dark store, ready to accept order
  Assigned: order dispatched, heading to store to pick up
  En-route: picked up order, heading to customer
  Returning: delivered, heading back to store zone

ASSIGNMENT ALGORITHM:
  1. Order is packed → dispatch engine triggered
  2. Find all available partners in the store zone (Redis geo lookup)
  3. Rank by: distance to store + predicted delivery time + acceptance rate score
  4. Offer order to top-ranked partner (30-second timeout)
  5. If declined or timeout → offer to next in ranking
  6. If no partners available → queue order, alert store manager, show customer updated ETA

ROUTE OPTIMISATION:
  Google Maps Platform API for routing (real-time traffic)
  Last-mile routes: dark store → customer address
  Delivery partner app shows turn-by-turn navigation
  ETA continuously recalculated as partner deviates from predicted path

SURGE MANAGEMENT:
  During peak hours (8–9 AM, 1–2 PM, 7–9 PM) partner availability drops
  Dynamic incentives: bonus ₹ per delivery during high-demand windows → partners stay active
  ETA shown to customer adjusts upward during surge (transparency > broken promise)`,
        },
        {
          title: "Live Tracking & ETA Engine",
          content: `"10 minutes" is a promise — the tracking experience must reinforce it, or it destroys trust.

GPS PIPELINE:
  Delivery partner app pings GPS location every 5 seconds
  Location events → Kafka → Location Service → Cassandra (time-series storage)
  Customer-facing tracking API: polls location via WebSocket, no polling overhead

ETA COMPUTATION:
  Not a simple distance/speed formula — accounts for:
  - Current traffic conditions (Maps API)
  - Time remaining in pick/pack pipeline (based on picker progress)
  - Historical delivery time for that partner in that zone at that time of day
  ETA recalculated every 30 seconds and pushed to customer via WebSocket

ORDER STATE MACHINE:
  PLACED → CONFIRMED → PICKING → PACKED → DISPATCHED → DELIVERED
  Each state transition fires a Kafka event → Notification Service sends push/SMS
  Customer sees a visual progress tracker in the app (like a flight tracker)

DELIVERY CONFIRMATION:
  Partner scans QR code on customer's door (or customer scans partner's code)
  If no confirmation after arrival geofence triggered → call attempt → auto-confirm after 2 min
  Photo proof of delivery available for unattended delivery`,
        },
        {
          title: "Service Mesh — Sidecar Proxy Pattern (Envoy/Istio)",
          content: `The API Gateway secures EDGE traffic. Behind it, the order-to-delivery
pipeline is a chain of internal calls — Order Service → Inventory Service
(checkout reservation) → Dispatch Service (partner assignment) → Tracking
Service (live GPS/ETA) → Notification Service (push/SMS/WhatsApp) — each
with a very different latency and reliability profile.

WHY A MESH FITS HERE:
• Order Service → Inventory Service is the single hottest internal hop:
  every order's confirmation depends on the Redis MULTI/EXEC reservation
  completing inside the order-confirmation SLA.
• Dispatch Service holds a 30-second partner-offer window per order — the
  same "in-flight offer state, don't eject mid-loop" shape as a ride-hailing
  dispatch engine.
• Tracking Service ingests GPS pings every 5s and pushes WebSocket updates
  every 15s per active delivery — stateful connections, not request/response.
• Notification Service's channel-priority cascade (FCM → WhatsApp → SMS)
  means a slow downstream channel shouldn't block the others.

DATA PLANE:
Envoy sidecar attached to: Order Service, Inventory Service, Catalog
Service, Dispatch Service, Tracking Service, and Notification Service —
6 services, matching the LLD components.

CONTROL PLANE:
Istio, deployed PER CITY — mirroring the "Database per city" option from
the multi-city scaling discussion. Mumbai's istiod is independent of
Delhi's; a control-plane issue in one city never touches dispatch in another.

WHAT THIS BUYS:
1. Inventory Service gets TIGHT circuit breaking (outlierDetection,
   interval: 5s / baseEjectionTime: 15s). This is a DIFFERENT layer from
   the existing application-level circuit breaker (see "What happens if
   the inventory service goes down during peak hours?"): the mesh breaker
   ejects a single unhealthy REPLICA and reroutes to healthy ones —
   transparent to Order Service. The app-level breaker only fires when
   the WHOLE service is degraded, falling back to direct Redis reads. The
   two are complementary, not conflicting: per-instance health (mesh) vs
   whole-dependency fallback (app).
2. Dispatch Service gets LOAD BALANCING ONLY — no outlierDetection. Each
   replica holds in-flight 30-second partner-offer state; an
   Envoy-triggered ejection mid-offer would orphan it and force a
   re-assignment, exactly like a ride-hailing dispatch engine.
3. Tracking Service also gets LB-only, no outlier ejection — its
   connections are GPS-ingest + WebSocket-push, both stateful. Ejecting a
   replica would drop active location streams for in-flight deliveries.
4. A VirtualService canary on Dispatch Service lets the team A/B-test new
   partner-scoring weights (currently 0.5 × proximity + 0.3 × acceptance +
   0.2 × rating) against live acceptance-rate and on-time-delivery metrics.
5. An AuthorizationPolicy on Inventory Service restricts
   /internal/inventory/reserve and /internal/inventory/release to Order
   Service ONLY — formalizing the exactly-once reservation invariant from
   "How do you prevent overselling": no other service (Dispatch, Tracking,
   Notification) can ever mutate stock directly, by mistake or otherwise.
6. mTLS + distributed tracing across all 6 services — when an order takes
   9 minutes instead of the promised ~8.5, tracing shows whether the time
   went to reservation, picking, dispatch, or delivery.

DIAGRAM:
The SERVICE MESH band sits inside API GATEWAY at the top — Catalog
Service, Order Service, Inventory Service, Dispatch Service, and
Notification Service (shown) plus Tracking Service (LLD-level, called
internally) all run an Envoy sidecar. The EVENT BUS (Kafka) and DATA LAYER
(PostgreSQL, Redis, Elasticsearch, Cassandra, S3, ClickHouse) are untouched.

TRADE-OFFS:
• EVENT BUS (Kafka) and DATA LAYER — out, same reasoning as every file in
  this series: not HTTP/gRPC, mesh policy doesn't apply.
• Redis Cluster (inventory_cache, partner state, ETA cache) — direct
  client connections stay OUT. At ~290-870 reservation ops/sec, adding a
  sidecar hop to the hottest path in the system buys nothing.
• Sidecar latency (~1-2ms/hop) is negligible against the <6min pick-pack
  SLA — but Dispatch's 30-second offer timeout means retries must not
  stack: perTryTimeout on the canary route is set well under 30s.
• Control-plane-down fail-open is required: with a 99.99% order-placement
  availability target, sidecars must keep routing on cached config. This
  mirrors the existing "dark store can operate offline for 10 min, queuing
  orders locally" precedent — graceful degradation is already a design value.`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "Demand Forecasting & Replenishment",
      sections: [
        {
          title: "Predicting What to Stock Before Demand Hits",
          content: `A dark store running out of milk at 8 AM is a catastrophic failure. Replenishment must be proactive, not reactive.

DEMAND FORECASTING MODEL:
  Input features:
    - Historical sales per SKU per store per hour (last 90 days)
    - Day of week, time of day, public holidays, local events
    - Weather (cold → hot beverages, rain → comfort food)
    - Promotional calendar (featured SKU demand spikes 3–5x)
    - Competitor pricing signals

  Model: Gradient boosting (XGBoost) per SKU-store pair, retrained nightly
  Horizon: 24-hour ahead forecast in hourly buckets
  Output: predicted demand per SKU per store → drives replenishment orders to suppliers

REPLENISHMENT PIPELINE:
  Replenishment runs twice daily (3 AM and 3 PM, outside peak hours)
  Target stock level = forecasted demand × safety multiplier (1.3–2× for A-items)
  Purchase orders auto-generated for supplier partners (via EDI or Supplier Portal API)
  Supplier delivers to store within 4-hour replenishment window → received and scanned into inventory

SAFETY STOCK FORMULA:
  safety_stock = Z × σ_demand × √lead_time
  Z = 1.65 for 95% service level
  σ_demand = standard deviation of daily demand for SKU
  lead_time = supplier delivery lead time in days`,
        },
        {
          title: "Dark Store Network Expansion",
          content: `Every new dark store is a capital and operational commitment. Site selection must be data-driven.

SITE SELECTION MODEL:
  Input: population density, demographic data, competitor store locations, delivery success rates for that pin code, average basket size of existing customers in that area
  Output: predicted revenue per store + break-even time
  Decision: approve if break-even < 18 months at target basket size

CATCHMENT AREA MANAGEMENT:
  Each dark store serves a defined catchment polygon (2–3 km radius, adjusted for roads)
  Catchment polygons are re-drawn when a new store opens to avoid cannibalisation
  Order routing respects catchment boundaries — customer always served by their catchment store unless it is at capacity

STORE DENSITY STRATEGY:
  High-density urban areas: stores every 1.5 km → most orders < 10 min
  Medium-density: stores every 3 km → some orders 10–15 min
  The 10-minute SLA is maintained by adjusting store density, not delivery speed`,
        },
      ],
    },
    {
      id: "phase6",
      label: "Phase 6",
      title: "Notifications, Payments & Scale",
      sections: [
        {
          title: "Payment Infrastructure & Zepto Pass",
          content: `Zepto integrates with India's payment ecosystem: UPI, cards, wallets, and COD.

PAYMENT FLOW:
  1. Customer initiates checkout → Payment Service creates payment intent
  2. Payment Service calls payment gateway (Razorpay / Juspay) → returns payment link/UPI intent
  3. Customer completes payment → gateway webhooks Zepto → Payment Service updates order
  4. Idempotent webhook processing: each payment_id processed at most once (Redis SET NX lock)

ZEPTO PASS (subscription):
  ₹149/month → free delivery + member-only discounts
  Subscription state stored in User Service; checked at checkout for delivery fee waiver
  Renewal handled via auto-debit mandate (UPI AutoPay)

COD HANDLING:
  Cash on delivery available but capped per pin code based on fraud risk score
  Delivery partner collects cash → remits to Zepto via UPI at end of shift
  Reconciliation: daily job matches COD orders against partner remittances; flags discrepancies

REFUND ENGINE:
  Cancelled order → immediate Zepto wallet credit (sub-second) or bank refund (T+2 via NEFT)
  Partial refund for OOS items processed inline during order fulfilment
  All refunds emit Kafka events → audit trail → Finance reporting`,
        },
        {
          title: "Scale, Reliability & Multi-Region",
          content: `Zepto operates across 10+ Indian cities with strict durability and availability requirements.

SCALE NUMBERS (2024):
  5M+ orders per day across all stores
  ~10,000 dark stores across 10 cities
  Peak: 3× normal order rate during evening rush + festive seasons

RELIABILITY TARGETS:
  Order placement API: 99.99% availability
  Inventory reservation: exactly-once semantics (no double-deducts, no double-refunds)
  Live tracking: 99.9% availability (degraded gracefully — shows last known location)

DATABASE STRATEGY:
  PostgreSQL (RDS Multi-AZ): orders, inventory, user accounts
  Redis Cluster: hot inventory counts, session tokens, ETA cache
  Cassandra: GPS location history (write-heavy, time-series, high volume)
  Elasticsearch: product catalog search
  ClickHouse: analytics — sales reports, demand forecasting feature store

DISASTER RECOVERY:
  RPO: 1 minute (Kafka replication lag)
  RTO: 5 minutes (ECS service auto-recovery)
  Inventory counts replicated across 3 Redis replicas; primary failure → automatic failover
  Dark store can operate in offline mode for 10 min if connectivity lost — queues orders locally`,
        },
      ],
    },
  ],
};

export const ZEPTO_LLD = {
  title: "Zepto — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of core Zepto services",

  components: [
    {
      id: "orderService",
      title: "Order Service — LLD",
      description: "Manages full order lifecycle from placement to delivery confirmation",
      api: `POST /v1/orders
{
  "idempotency_key": "device_uuid_timestamp",
  "customer_id": "cust_abc123",
  "dark_store_id": "store_andheri_w_01",
  "items": [
    { "sku_id": "sku_milk_amul_1l", "quantity": 2 },
    { "sku_id": "sku_bread_britannia", "quantity": 1 }
  ],
  "delivery_address_id": "addr_xyz789",
  "payment_method": { "type": "UPI", "upi_id": "user@okaxis" },
  "coupon_code": "FIRST10"
}

Response 201:
{
  "order_id": "ord_20260429_abc123",
  "status": "CONFIRMED",
  "dark_store_id": "store_andheri_w_01",
  "items_confirmed": [...],
  "items_oos": [],
  "total_amount": 189.00,
  "delivery_fee": 0,
  "eta_minutes": 9,
  "tracking_url": "https://zepto.com/track/ord_abc123",
  "created_at": "2026-04-29T08:15:00.123Z"
}

GET /v1/orders/{order_id}
GET /v1/orders?customer_id=X&status=DELIVERED&limit=20
PATCH /v1/orders/{order_id}/cancel  { "reason": "CUSTOMER_REQUEST" }

-- Order State Machine --
PLACED → CONFIRMED → PICKING → PACKED → DISPATCHED → DELIVERED
                  ↘                              ↗
               CANCELLED (at any pre-dispatch stage)`,
    },
    {
      id: "inventoryService",
      title: "Inventory Service — LLD",
      description: "Real-time stock management with atomic reservation and FIFO expiry tracking",
      api: `POST /internal/inventory/reserve
{
  "order_id": "ord_abc123",
  "store_id": "store_andheri_w_01",
  "items": [
    { "sku_id": "sku_milk_amul_1l", "quantity": 2 },
    { "sku_id": "sku_bread_britannia", "quantity": 1 }
  ]
}

Response 200 (full reservation):
{
  "reservation_id": "res_xyz789",
  "status": "FULLY_RESERVED",
  "reserved_items": [
    { "sku_id": "sku_milk_amul_1l", "quantity": 2, "batch_id": "batch_042901" },
    { "sku_id": "sku_bread_britannia", "quantity": 1, "batch_id": "batch_042802" }
  ],
  "oos_items": []
}

Response 206 (partial):
{
  "status": "PARTIALLY_RESERVED",
  "reserved_items": [...],
  "oos_items": [
    { "sku_id": "sku_bread_britannia", "available": 0, "substitutes": ["sku_bread_harvest"] }
  ]
}

-- Redis Atomic Reservation --
WATCH store:andheri_w_01:sku:milk_amul_1l
MULTI
  DECRBY store:andheri_w_01:sku:milk_amul_1l 2
EXEC   -- fails if key changed since WATCH (retry)

-- Schema --
inventory_batches (PostgreSQL — source of truth):
  batch_id, store_id, sku_id, quantity_received, quantity_remaining,
  received_at, expiry_date, supplier_id, cost_price

inventory_cache (Redis):
  KEY: store:{store_id}:sku:{sku_id}  VALUE: current_stock (integer)
  Updated on every pick, receive, adjustment via Kafka consumer`,
    },
    {
      id: "catalogService",
      title: "Catalog & Search Service — LLD",
      description: "Hyperlocal product catalog with Elasticsearch-powered search filtered by store availability",
      api: `GET /v1/catalog?store_id=store_andheri_w_01&category=dairy&limit=50&offset=0

Response 200:
{
  "store_id": "store_andheri_w_01",
  "products": [
    {
      "sku_id": "sku_milk_amul_1l",
      "name": "Amul Full Cream Milk",
      "brand": "Amul",
      "weight": "1L",
      "price": 68.00,
      "mrp": 68.00,
      "discount_pct": 0,
      "in_stock": true,
      "stock_level": "HIGH",   // HIGH / LOW / LAST_FEW (not exact count)
      "image_url": "https://cdn.zepto.com/products/amul_milk_1l.webp",
      "category": "dairy",
      "tags": ["milk", "full-cream", "amul"]
    }
  ],
  "total": 124,
  "next_cursor": "eyJvZmZzZXQiOjUwfQ=="
}

GET /v1/search?q=tomatoe&store_id=store_andheri_w_01

-- Elasticsearch Index (per store) --
{
  "sku_id": "sku_tomato_local_1kg",
  "name": "Fresh Tomatoes",
  "brand": "Local",
  "tokens": ["tomato", "tomatoe", "tamatar"],  // synonyms for typo tolerance
  "category": "vegetables",
  "in_stock": true,
  "score_boost": 1.4,   // boosted if high margin or promotional
  "updated_at": "2026-04-29T08:00:00Z"
}

-- Cache Strategy --
Category page: Redis cache 60s TTL (high traffic, tolerate slight staleness)
Search results: no cache (real-time stock status mandatory)
Product images: CloudFront CDN (long TTL, immutable URLs)`,
    },
    {
      id: "dispatchService",
      title: "Dispatch & Routing Service — LLD",
      description: "Delivery partner assignment, route optimisation, and ETA computation",
      api: `POST /internal/dispatch/assign
{
  "order_id": "ord_abc123",
  "store_id": "store_andheri_w_01",
  "packed_at": "2026-04-29T08:20:45Z",
  "delivery_address": {
    "lat": 19.1136, "lng": 72.8697,
    "full_address": "302, Shanti Niwas, Azad Nagar, Andheri West"
  }
}

Response 200:
{
  "partner_id": "partner_raju_9876",
  "partner_name": "Raju K.",
  "partner_phone": "+91-98765-XXXXX",
  "partner_location": { "lat": 19.1141, "lng": 72.8701 },
  "eta_to_store_seconds": 45,
  "eta_to_customer_minutes": 8,
  "route_polyline": "encoded_polyline_string"
}

-- Partner Selection Logic --
1. Redis GEO: GEORADIUS store_lat store_lng 1.5 km → available partner IDs
2. For each candidate:
     score = 0.5 × (1 / distance_to_store) + 0.3 × acceptance_rate + 0.2 × ratings
3. Offer to top scorer (30-sec window) → on decline try next
4. On 3 consecutive declines → escalate to store manager

-- Partner State in Redis --
KEY: partner:{partner_id}:state   VALUE: AVAILABLE | ASSIGNED | EN_ROUTE | RETURNING
KEY: partner:{partner_id}:location  VALUE: {lat, lng, updated_at}  TTL: 30s
ZSET: store:{store_id}:available_partners  SCORE: timestamp (recency of going available)`,
    },
    {
      id: "trackingService",
      title: "Live Tracking & ETA Service — LLD",
      description: "Real-time GPS ingestion, ETA recomputation, and WebSocket delivery to customer",
      api: `-- Partner App → Location Ingestion --
POST /internal/location/ping  (called every 5 seconds by partner app)
{
  "partner_id": "partner_raju_9876",
  "order_id": "ord_abc123",
  "lat": 19.1138, "lng": 72.8699,
  "accuracy_meters": 5,
  "timestamp": "2026-04-29T08:22:10Z"
}

-- Customer Tracking WebSocket --
ws://zepto.com/track/ord_abc123

Server pushes every 15 seconds:
{
  "order_id": "ord_abc123",
  "status": "EN_ROUTE",
  "partner_location": { "lat": 19.1138, "lng": 72.8699 },
  "eta_seconds": 240,
  "distance_remaining_meters": 850,
  "order_steps": [
    { "step": "PLACED",     "done": true,  "time": "08:15:00" },
    { "step": "PICKING",    "done": true,  "time": "08:16:30" },
    { "step": "PACKED",     "done": true,  "time": "08:20:45" },
    { "step": "DISPATCHED", "done": true,  "time": "08:21:00" },
    { "step": "DELIVERED",  "done": false, "time": null }
  ]
}

-- ETA Recomputation --
Every 30 seconds:
  directions_api_response = GoogleMaps.directions(partner_location, customer_location)
  traffic_adjusted_seconds = directions_api_response.duration_in_traffic
  eta = max(traffic_adjusted_seconds, 60)  // minimum 1 minute
  Redis SET order:{order_id}:eta {eta} EX 60

-- Location History Storage --
Cassandra table (write-optimised time-series):
  CREATE TABLE partner_locations (
    partner_id TEXT,
    order_id   TEXT,
    ts         TIMESTAMP,
    lat        DOUBLE,
    lng        DOUBLE,
    PRIMARY KEY ((partner_id, order_id), ts)
  ) WITH CLUSTERING ORDER BY (ts DESC);`,
    },
    {
      id: "notificationService",
      title: "Notification Service — LLD",
      description: "Multi-channel (push, SMS, WhatsApp) notification pipeline triggered by order state changes",
      api: `-- Kafka Consumer (Order Events) --
Topic: order.state_changed
{
  "order_id": "ord_abc123",
  "customer_id": "cust_abc123",
  "old_status": "PICKING",
  "new_status": "PACKED",
  "timestamp": "2026-04-29T08:20:45Z"
}

-- Notification Templates --
CONFIRMED  → Push: "Order confirmed! Picking started. ETA 9 min 🛵"
OOS_ALERT  → Push: "Bread unavailable — we suggest Harvest Gold Bread (+₹2). Tap to decide."
DISPATCHED → Push: "Your order is on the way! Track live 📍"
DELIVERED  → Push: "Delivered! Rate your experience ⭐"

-- Channel Priority --
1. Firebase FCM push (primary — free, instant)
2. WhatsApp (if FCM delivery fails after 10s — higher open rate)
3. SMS via Twilio (fallback — paid, guaranteed delivery)

-- Deduplication --
Redis SET nx:notif:{order_id}:{event_type} 1 EX 300
If SET returns 0 (key exists) → duplicate event, skip sending

-- Schema --
notification_log (PostgreSQL):
  notif_id, order_id, customer_id, channel, template_id,
  sent_at, delivered_at, opened_at, status (SENT/DELIVERED/FAILED)`,
    },
    {
      id: "serviceMesh",
      title: "Service Mesh — Envoy/Istio Sidecar Configuration",
      description: "Per-city Istio mesh: Inventory circuit breaking, Dispatch/Tracking LB-only, scoring canary, reservation-integrity AuthorizationPolicy",
      api: `# Istio configuration — applied per city (mumbai-prod, delhi-prod, ...)

# 1. Inventory Service — tight circuit breaking.
#    Every order's confirmation depends on the Redis MULTI/EXEC
#    reservation completing fast. Complementary to (not a replacement
#    for) the existing app-level "open circuit → fall back to cached
#    Redis reads" breaker — this one ejects a single bad REPLICA.
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: inventory-service-circuit-breaker
  namespace: mumbai-prod
spec:
  host: inventory-service.mumbai-prod.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 8000
      http:
        http1MaxPendingRequests: 4000
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
#    Each replica holds in-flight 30-second partner-offer state; an
#    Envoy-triggered ejection mid-offer would orphan it and force a
#    re-assignment.
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: dispatch-service-lb
  namespace: mumbai-prod
spec:
  host: dispatch-service.mumbai-prod.svc.cluster.local
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
#    GPS-ingest (every 5s) and WebSocket pushes (every 15s) are stateful
#    connections per active delivery; ejecting a replica drops live
#    location streams.
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: tracking-service-lb
  namespace: mumbai-prod
spec:
  host: tracking-service.mumbai-prod.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 5000
      http:
        http1MaxPendingRequests: 2500
        maxRequestsPerConnection: 200
    loadBalancer:
      simple: LEAST_REQUEST
---
# 4. Canary new partner-scoring weights (currently 0.5 proximity / 0.3
#    acceptance / 0.2 rating) against live acceptance-rate and
#    on-time-delivery metrics.
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: dispatch-service-canary
  namespace: mumbai-prod
spec:
  hosts:
    - dispatch-service.mumbai-prod.svc.cluster.local
  http:
    - match:
        - headers:
            x-dispatch-scoring-canary:
              exact: "true"
      route:
        - destination:
            host: dispatch-service.mumbai-prod.svc.cluster.local
            subset: v2
    - route:
        - destination:
            host: dispatch-service.mumbai-prod.svc.cluster.local
            subset: v1
          weight: 95
        - destination:
            host: dispatch-service.mumbai-prod.svc.cluster.local
            subset: v2
          weight: 5
      retries:
        attempts: 2
        perTryTimeout: 10s
        retryOn: 5xx,reset,connect-failure
---
# 5. Reservation integrity — only Order Service may reserve or release
#    inventory. No other service can mutate stock, by mistake or otherwise.
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: inventory-service-reserve-restricted
  namespace: mumbai-prod
spec:
  selector:
    matchLabels:
      app: inventory-service
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/mumbai-prod/sa/order-service"]
      to:
        - operation:
            paths: ["/internal/inventory/reserve", "/internal/inventory/release"]
            methods: ["POST"]
---
# 6. mTLS within the city
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: mumbai-prod
spec:
  mtls:
    mode: STRICT`,
      internals: `Sidecar injection scope (6 services, matching the LLD components):
  IN MESH:  Order Service, Inventory Service, Catalog Service, Dispatch
            Service, Tracking Service, Notification Service
  OUT:      Kafka (Event Bus), PostgreSQL, Redis Cluster, Elasticsearch,
            Cassandra, S3, ClickHouse — none are HTTP/gRPC services Envoy
            can apply L7 policy to, and Redis in particular sits on the
            ~290-870 ops/sec hot reservation path where a sidecar hop
            buys nothing.

Inventory Service circuit breaking — two layers, two granularities:
  From Back-of-the-Envelope Estimation: ~290 reservation ops/sec average,
  ~870/sec at 3× peak, each a synchronous Order Service → Inventory
  Service → Redis round trip inside the order-confirmation SLA.
  MESH LAYER (this DestinationRule): if ONE replica starts returning 5xx,
  outlierDetection (interval: 5s / baseEjectionTime: 15s) ejects it —
  Order Service transparently retries against a healthy replica. No
  application code involved.
  APP LAYER (existing, see "What happens if the inventory service goes
  down during peak hours?"): if errors exceed 5% over 10s ACROSS THE WHOLE
  SERVICE (mesh-level LB can't find a healthy replica either), Order
  Service's own circuit breaker opens and falls back to direct cached
  Redis reads — degraded but available.
  These don't conflict because they trigger on different scopes:
  per-replica health (mesh) vs whole-dependency exhaustion (app).

Dispatch & Tracking — LB-only, the same reasoning as Uber's Dispatch
Engine and Location Service in this series: both hold per-order or
per-delivery STATE across multiple requests (a 30s offer window; a
multi-minute GPS/WebSocket session). outlierDetection would eject based on
5xx rate, but a replica mid-offer or mid-stream isn't "unhealthy" from the
caller's perspective — ejecting it actively breaks an in-flight operation.
LEAST_REQUEST spreads NEW offers/connections without touching active ones.

Canary — tied to the scoring formula:
  score = 0.5 × proximity_score + 0.3 × acceptance_rate + 0.2 × avg_rating
  Changing these weights changes which partner gets offered first — a
  high-risk change to ship blind. perTryTimeout: 10s leaves 20s of margin
  inside Dispatch's 30-second offer window for a single retry.

Reservation-integrity AuthorizationPolicy:
  "How do you prevent overselling" describes idempotent, exactly-once
  reservation via Order Service. This policy makes Order Service the ONLY
  mesh principal that can call /internal/inventory/reserve or /release —
  independent of application code. A bug in Dispatch, Tracking, or
  Notification that somehow constructs a reservation request is blocked
  at the mesh layer before it reaches Inventory Service's listener.

mTLS & control-plane topology:
  Istio runs PER CITY (mumbai-prod, delhi-prod, ...), mirroring the
  "Database per city" option from the multi-city expansion strategy — a
  control-plane issue in Mumbai never touches Delhi's dispatch. With a
  99.99% order-placement availability target, sidecars MUST fail open on
  cached config if their local control plane briefly drops — this mirrors
  the existing "dark store operates offline for 10 min" precedent.`,
    },
  ],
};

export const ZEPTO_QNA = [
  {
    id: "zq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Zepto", "Blinkit", "Swiggy Instamart"],
    question: "Design a 10-minute grocery delivery system like Zepto. Walk through the key components.",
    answer: `The 10-minute promise is an end-to-end systems problem, not just a logistics problem.

CONSTRAINT BREAKDOWN — 10 minutes splits as:
  Order placement + confirmation: < 30 seconds
  Pick + pack at dark store: < 6 minutes
  Last-mile delivery: < 4 minutes (requires dark store within 2 km of customer)

KEY COMPONENTS:

1. HYPERLOCAL CATALOG SERVICE:
   Customer's catalog is scoped to their nearest dark store
   GPS → find dark store within 2 km → show only that store's in-stock SKUs
   Elasticsearch for search (typo-tolerant, synonym-aware, filtered by in-stock)

2. INVENTORY SERVICE (hardest part):
   Two layers: Redis (hot cache for speed) + PostgreSQL (source of truth)
   Atomic reservation at checkout using Redis MULTI/EXEC — prevents overselling
   Pick confirmation = second decrement (catches shrinkage between reservation and pick)

3. ORDER FULFILLMENT ENGINE:
   Picker receives order within seconds of placement via app notification
   Optimised pick path shown (minimise walking distance in store)
   OOS during pick → real-time substitute notification to customer (60-second decision window)
   SLA alert if pick + pack takes > 5 minutes

4. DISPATCH ENGINE:
   After packing, offer order to nearest available delivery partner (Redis GEO lookup)
   ETA calculated via Google Maps Directions API with live traffic
   Partner tracked via GPS every 5 seconds → WebSocket push to customer

5. DEMAND FORECASTING:
   XGBoost model per SKU per store, predicts next 24 hours hourly demand
   Replenishment orders auto-generated and sent to suppliers twice daily
   Without this, dark stores run OOS on A-items during peak hours`,
  },
  {
    id: "zq2",
    category: "Inventory",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Zepto", "Blinkit", "Amazon Fresh"],
    question: "How do you prevent overselling when thousands of customers can add the same item to their cart simultaneously?",
    answer: `This is the classic inventory race condition problem. There are two distinct stages with different requirements.

STAGE 1 — CART (soft, read-heavy):
  We do NOT reserve inventory when items are added to cart
  Reason: reservation would require releasing on cart abandonment (most sessions abandon)
  Instead: Redis cache of stock counts, refreshed every 5 seconds for high-velocity items
  Show "Low stock" warning when count < threshold — sets user expectation
  Accept that two users may see the same item as "available" simultaneously

STAGE 2 — CHECKOUT (hard, must be atomic):
  On "Place Order", reserve inventory atomically for all items:

  Redis MULTI/EXEC pattern:
    WATCH store:{store_id}:sku:{sku_id}
    current = GET store:{store_id}:sku:{sku_id}
    if current < requested_qty: return OOS
    MULTI
      DECRBY store:{store_id}:sku:{sku_id} {qty}
    EXEC   -- returns nil if WATCH key changed → retry (optimistic locking)

  If EXEC fails (concurrent modification): retry up to 3 times, then return OOS to customer

EXACTLY-ONCE GUARANTEE:
  Idempotency key in order request → DB UNIQUE constraint on (idempotency_key)
  Duplicate checkout request (network retry) → returns existing order, does NOT double-reserve

RECONCILIATION:
  Nightly job: PostgreSQL inventory_batches sum vs Redis cache
  Drift > 2% triggers alert and Redis refresh from PostgreSQL
  Pick confirmation is the second decrement — catches shrinkage between reservation and physical pick`,
  },
  {
    id: "zq3",
    category: "Dispatch",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Zepto", "Dunzo", "Porter"],
    question: "How does Zepto's dispatch engine assign delivery partners and compute ETA?",
    answer: `Dispatch is a real-time matching problem with a hard latency requirement: partner must be assigned within 30 seconds of packing.

PARTNER ASSIGNMENT:

Step 1 — Find candidates:
  Redis GEO command: GEORADIUS {store_lat} {store_lng} 1.5 km
  Returns partner IDs currently marked as AVAILABLE in that radius

Step 2 — Score candidates:
  score = 0.5 × proximity_score + 0.3 × acceptance_rate + 0.2 × avg_rating
  proximity_score = 1 / (distance_to_store_meters + 1)  [higher = closer]

Step 3 — Offer with timeout:
  Send push notification to #1 ranked partner
  30-second window to accept
  On decline or timeout → offer to #2, then #3
  After 3 declines → alert store manager, show customer "Slight delay" + updated ETA

ETA COMPUTATION:
  Two components:
  1. Store-to-customer travel time: Google Maps Directions API with in_traffic model
  2. Remaining fulfillment time: estimated from pick progress (avg 20s per item × items remaining)

  ETA = remaining_fulfillment_time + partner_travel_to_store + store_to_customer_travel
  Recalculated every 30 seconds using live partner GPS location
  Shown as range to customer: "8–11 minutes" (P50–P90 from historical data)

SURGE HANDLING:
  High demand + low partner supply → incentive multiplier activates automatically
  ETA shown to customer adjusts to realistic value — better to show 15 min than promise 10 and fail`,
  },
  {
    id: "zq4",
    category: "Forecasting",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Zepto", "BigBasket", "Blinkit"],
    question: "How do you ensure a dark store never runs out of milk at 8 AM?",
    answer: `This is the demand forecasting and replenishment problem. Running OOS on an A-item like milk during breakfast rush is unacceptable.

DEMAND FORECASTING:

Feature engineering:
  - Historical hourly sales per SKU per store (last 90 days)
  - Day of week (Saturday milk demand ~40% higher than Tuesday)
  - Time of day (8–10 AM and 6–8 PM are peak for dairy)
  - Weather (cold weather → more tea/coffee → more milk)
  - Local events (IPL match → snacks spike, next morning → hangover food)
  - Promotions: featured SKUs see 3–5× demand spike

Model: XGBoost per SKU-store pair
  Output: predicted units per hour for next 24 hours
  Retrained nightly (1–3 AM) on previous day's actuals
  MAPE target: < 15% for A-items (high-velocity)

REPLENISHMENT:

Target stock = forecast × safety_multiplier
  safety_multiplier = 1.5 for A-items (high velocity, short shelf life)
  safety_multiplier = 2.0 for B-items, 3.0 for C-items (lower velocity, longer shelf life)

Replenishment schedule:
  3 AM run: covers morning peak (8 AM–12 PM)
  3 PM run: covers evening peak (6 PM–10 PM)
  Supplier delivers within 4-hour window, receives and scans items into inventory

EARLY WARNING SYSTEM:
  Intraday monitoring: if actual sales pace > forecast by 30% → trigger ad-hoc restock alert
  "Flash restock" protocol: store manager calls backup supplier for emergency delivery
  Cross-store transfer: if adjacent store has surplus, transfer can be arranged (15-min buffer)`,
  },
  {
    id: "zq5",
    category: "Reliability",
    difficulty: "Hard",
    round: "System Design Screen",
    asked_at: ["Zepto", "Swiggy", "Zomato"],
    question: "What happens if the inventory service goes down during peak hours? How do you handle it gracefully?",
    answer: `Inventory service downtime during peak hours is catastrophic — orders cannot be placed, revenue stops. Defence-in-depth is required.

LAYER 1 — HIGH AVAILABILITY:
  Inventory Service: 3 instances minimum, auto-scaling on CPU/RPS
  Redis Cluster: 3-node cluster with automatic failover (Sentinel or Redis Cluster mode)
  PostgreSQL: RDS Multi-AZ with automatic failover (< 60 seconds RTO)

LAYER 2 — CIRCUIT BREAKER:
  If Inventory Service returns errors > 5% over 10 seconds → open circuit
  Open circuit behaviour: return cached stock levels from Redis directly
  This allows order placement to continue with slightly stale stock data
  Risk: slight overselling — acceptable for a short window, handled by OOS-at-pick flow

LAYER 3 — GRACEFUL DEGRADATION:
  If Redis is also unavailable: fall back to "allow but flag"
    Orders placed without inventory reservation
    Picker reconciles at pick time — OOS items handled as normal substitution flow
    Slightly higher OOS rate but orders keep flowing

LAYER 4 — RECOVERY:
  On Inventory Service recovery: replay Kafka events from the downtime window
  Recompute current stock from event log (event sourcing)
  Reconcile Redis cache against PostgreSQL
  Alert operations team: orders placed during degraded mode need manual review

MONITORING:
  Alert thresholds: OOS rate > 2% at pick time, reservation failure rate > 0.5%
  PagerDuty escalation within 2 minutes of circuit breaker opening`,
  },
  {
    id: "zq6",
    category: "Data Modelling",
    difficulty: "Medium",
    round: "Technical Interview",
    asked_at: ["Zepto", "Blinkit", "BigBasket"],
    question: "Design the database schema for Zepto's order and inventory system.",
    answer: `Core tables span three domains: orders, inventory, and fulfilment.

ORDERS DOMAIN:

orders:
  order_id         UUID PRIMARY KEY  DEFAULT gen_random_uuid()
  idempotency_key  TEXT UNIQUE NOT NULL
  customer_id      UUID NOT NULL
  store_id         UUID NOT NULL
  status           ENUM(PLACED,CONFIRMED,PICKING,PACKED,DISPATCHED,DELIVERED,CANCELLED)
  total_amount     NUMERIC(10,2)
  delivery_fee     NUMERIC(6,2)
  payment_id       UUID
  delivery_address JSONB
  created_at       TIMESTAMPTZ DEFAULT now()
  updated_at       TIMESTAMPTZ

order_items:
  item_id     UUID PRIMARY KEY
  order_id    UUID REFERENCES orders(order_id)
  sku_id      UUID NOT NULL
  quantity    INT NOT NULL
  unit_price  NUMERIC(8,2)
  status      ENUM(RESERVED, PICKED, OOS, SUBSTITUTED)
  batch_id    UUID  -- which physical batch was picked

INVENTORY DOMAIN:

inventory_batches:
  batch_id           UUID PRIMARY KEY
  store_id           UUID NOT NULL
  sku_id             UUID NOT NULL
  quantity_received  INT NOT NULL
  quantity_remaining INT NOT NULL  -- decremented on every pick
  received_at        TIMESTAMPTZ
  expiry_date        DATE
  cost_price         NUMERIC(8,2)
  INDEX (store_id, sku_id, expiry_date)  -- FIFO query

inventory_reservations:
  reservation_id  UUID PRIMARY KEY
  order_id        UUID REFERENCES orders(order_id)
  batch_id        UUID REFERENCES inventory_batches(batch_id)
  sku_id          UUID
  quantity        INT
  status          ENUM(RESERVED, CONFIRMED, RELEASED)
  reserved_at     TIMESTAMPTZ
  released_at     TIMESTAMPTZ

FULFILMENT DOMAIN:

dispatch_assignments:
  assignment_id  UUID PRIMARY KEY
  order_id       UUID REFERENCES orders(order_id)
  partner_id     UUID NOT NULL
  assigned_at    TIMESTAMPTZ
  picked_up_at   TIMESTAMPTZ
  delivered_at   TIMESTAMPTZ
  eta_seconds    INT

INDEXING STRATEGY:
  orders: INDEX (customer_id, created_at DESC)  -- customer order history
  orders: INDEX (store_id, status, created_at)  -- store operations dashboard
  inventory_batches: INDEX (store_id, sku_id, expiry_date)  -- FIFO pick queries`,
  },
  {
    id: "zq7",
    category: "Scale",
    difficulty: "Hard",
    round: "System Design Screen",
    asked_at: ["Zepto", "Blinkit", "Amazon Fresh"],
    question: "Zepto is launching in 5 new cities simultaneously. How do you scale the platform?",
    answer: `Multi-city expansion is primarily a data isolation and operational problem, not a technical scaling problem — the architecture must accommodate city-level configuration without code changes.

DATA ISOLATION STRATEGY:

Option A — Shared database, city as a dimension:
  All tables have store_id column → store has city_id
  Queries filtered by store_id automatically scope to city
  Simpler operationally, but blast radius of a schema migration = all cities
  Recommended for initial expansion (< 10 cities)

Option B — Database per city (chosen at 10+ cities):
  Each city gets its own PostgreSQL cluster and Redis cluster
  API Gateway routes based on store_id → city prefix → correct DB connection pool
  Failure in Mumbai DB doesn't affect Delhi
  Cross-city queries (reporting, forecasting) go through ClickHouse (data warehouse)

CONFIGURATION PER CITY:
  city_config table: delivery radius, surge multipliers, OOS substitution rules, COD limits
  Config Service with Redis cache — each microservice reads city config at startup and on change events

DARK STORE ONBOARDING:
  Each dark store onboarded via an admin tool: lat/lng, catchment polygon, capacity, operating hours
  Inventory bootstrapped by receiving initial stock (scan all items into inventory_batches)
  Catalog mapped: which of the 40,000 master SKUs this store carries
  Picker app configured: shelf layout, zone mapping for optimised pick paths

DEMAND FORECASTING FOR NEW CITIES:
  New store = no historical data → cold start problem
  Solution: use nearest comparable city's models for first 2–4 weeks
  Fallback to category-level averages (dairy basket = X units/day for population density Y)
  Model specialises to local demand patterns within ~2 weeks of data

ROLLOUT STRATEGY:
  Soft launch: limited pin codes + waitlist → builds up demand signal before full launch
  Hard launch: all pin codes activated once operational readiness confirmed (OOS < 2%, on-time > 90%)`,
  },
  {
    id: "zq8",
    category: "Trade-offs",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Zepto", "Dunzo", "Swiggy Instamart"],
    question: "How do you handle the trade-off between showing accurate stock and showing a good selection to customers?",
    answer: `This is a fundamental q-commerce UX tension: showing accurate stock minimises disappointment at checkout but showing more items maximises basket size.

THE PROBLEM:
  If you show only guaranteed in-stock items: catalog feels thin, customers don't find what they want
  If you show all items that might be in stock: customers add items that are OOS → bad checkout experience
  Most competitors fail here — showing OOS items at checkout is one of the top-rated negative experiences

ZEPTO'S APPROACH — Three stock visibility tiers:

Tier 1 — Definitely in stock (Redis count > 5):
  Show normally with "Add" button
  Confident enough not to reserve until checkout

Tier 2 — Low stock (Redis count 1–5):
  Show with "Only X left!" badge
  Creates urgency AND sets expectation
  Higher-priority reservation at checkout

Tier 3 — Out of stock (Redis count = 0):
  Hide from default browse — do NOT show (reduces catalog depth but eliminates disappointment)
  Still accessible via search with "Unavailable" label + notify-me option
  This is the key differentiator: Zepto chose honesty over apparent selection

SUBSTITUTE-FIRST MINDSET:
  When item goes OOS during picking (after order confirmed), substitute is offered immediately
  Substitute list pre-computed and ranked offline — not real-time (avoids latency)
  Customer can pre-configure preferences: "always accept substitute if ≤ ₹10 more expensive"
  This allows picker to substitute without interrupting customer — faster fulfilment

RESULT:
  Higher checkout conversion rate (fewer "sorry, OOS" moments)
  Higher NPS (customers trust what they see)
  Lower picker failure rate (items shown as available actually are available)`,
  },
  {
    id: "zq9",
    category: "Estimation",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Zepto", "Swiggy Instamart", "Blinkit"],
    question: "Walk through the back-of-the-envelope math for Zepto's scale — does the 30-50 concurrent order capacity per dark store actually add up to 5M orders/day?",
    answer: `Yes — and the nice part is that it's a two-way check: you can derive the headline number from the per-store capacity, or derive the per-store capacity from the headline number, and they should land in the same place.

ASSUMPTIONS:
  5M+ orders/day (2024 scale, with ~3x multiplier at peak hours)
  700+ dark stores across ~10 cities
  Pick + pack target < 6 minutes (360 seconds) per order
  Each store handles 30-50 simultaneous active orders (documented capacity)
  Average basket ≈ 5 items
  GPS ping every 5s, WebSocket location push every 15s per active delivery

THE FIVE DERIVATIONS:

1. Order rate vs documented capacity — Little's Law consistency check:
   5,000,000 orders/day ÷ 86,400s ≈ 58 orders/sec globally
   58 ÷ 700 stores ≈ 0.083 orders/sec/store
   Concurrent orders in system = arrival rate × time in system
   0.083 × 360s ≈ 30 concurrent orders/store
   → This lands almost exactly on the documented LOWER bound (30-50)!
   The headline "5M orders/day" and the operational "30-50 concurrent"
   aren't two independent facts — one falls out of the other via Little's Law.

2. What happens at 3x peak:
   58 × 3 ≈ 174 orders/sec globally → ~0.25 orders/sec/store
   0.25 × 360s ≈ 90 concurrent orders/store
   → This EXCEEDS the 50-order cap by ~2x — which is exactly why the
   overflow-to-adjacent-store logic exists. The capacity numbers and the
   overflow design aren't separate decisions; the math forces the overflow path.

3. GPS ingest & WebSocket fanout:
   ~40% of concurrent orders are en-route at any moment
   At peak: 90 × 700 × 0.4 ≈ 25,200 active deliveries
   GPS pings: 25,200 ÷ 5s ≈ 5,040/sec → Cassandra write tier
   WebSocket pushes: 25,200 ÷ 15s ≈ 1,680/sec → Tracking Service fanout
   → Sizes the Cassandra + WebSocket tier independently of the order-placement path.

4. Inventory reservation throughput:
   5M orders/day × 5 items/basket ÷ 86,400s ≈ 290 reservation ops/sec average
   At 3x peak: ~870 ops/sec
   → Both comfortably inside Redis Cluster's 100K+ ops/sec ceiling — confirms
   Redis (not Postgres) was the right choice for the hot reservation path.

5. Demand forecasting batch job:
   700 stores × ~4,000 SKUs ≈ 2.8M SKU-store pairs to retrain nightly
   2.8M ÷ (2-hour batch window × 3,600s) ≈ 389 models/sec
   → A single-machine job can't hit this; justifies the distributed Spark
   batch architecture rather than a simpler per-store cron job.

INTERVIEW PUNCH LINE:
  "The most useful thing here isn't any single number — it's that the
  5M orders/day headline and the 30-50 concurrent-order dark-store
  capacity are the SAME fact expressed two ways, connected by Little's
  Law. If an interviewer gives you one, you can derive the other — and
  if they don't match, that's a sign one of your assumptions is wrong."`,
    followups: [
      "If a city's order volume doubled overnight, which number in this chain breaks first — store capacity, Redis throughput, or the forecasting batch window?",
      "How would the GPS-ingest number change if delivery partners pinged every 2 seconds instead of every 5?",
      "The 3x peak multiplier is doing a lot of work here — how would you actually measure it from production data rather than assuming it?",
    ],
  },
  {
    id: "zq10",
    category: "Architecture",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Zepto", "Swiggy Instamart", "Uber"],
    question: "Zepto's services already have circuit breakers and retries at the application layer (e.g. the Inventory Service fallback). Would you add a service mesh on top, and what would it actually do differently?",
    answer: `Yes — but the key is framing it correctly: the mesh doesn't replace the app-level resilience that's already there, it adds a layer underneath at a different granularity. Conflating the two is the most common mistake.

WHY A MESH FITS HERE:
  Order Service → Inventory Service is the hottest, most latency-sensitive
  hop in the system (checkout reservation, ~290-870 ops/sec).
  Dispatch Service holds a 30-second in-flight partner-offer window — very
  similar shape to ride-hailing dispatch.
  Tracking Service is stateful (GPS ingest every 5s, WebSocket push every 15s).
  Notification Service has a channel-priority cascade (push → SMS → WhatsApp).

DATA PLANE: Envoy sidecar attached to all 6 core services — Order,
Inventory, Catalog, Dispatch, Tracking, Notification.

CONTROL PLANE: Istio deployed PER CITY (mumbai-prod, delhi-prod, ...),
mirroring the "Database per city" sharding model from the multi-city
expansion strategy — a control-plane blip in one city can't touch another.

WHAT THIS BUYS, CONCRETELY:

1. Inventory Service — TIGHT circuit breaking (outlierDetection,
   interval: 5s, baseEjectionTime: 15s). This is the layer that catches a
   SINGLE BAD REPLICA and reroutes around it transparently — before the
   existing app-level breaker (which trips on whole-service error rate)
   ever sees a problem. Two layers, two granularities, not a conflict:
   per-replica health (mesh) vs whole-dependency exhaustion (app).

2. Dispatch Service and Tracking Service — LOAD BALANCING ONLY, explicitly
   NO outlierDetection. Both hold per-request state (a 30s offer; a live
   GPS/WebSocket session) that an Envoy-triggered ejection would orphan.
   LEAST_REQUEST spreads new work without disturbing in-flight state — the
   same pattern used for Uber's Dispatch Engine and Location Service.

3. VirtualService canary on Dispatch Service — ships changes to the
   0.5/0.3/0.2 proximity/acceptance/rating scoring weights to 5% of
   traffic via a header-matched subset before a full rollout.

4. AuthorizationPolicy restricting /internal/inventory/reserve and
   /release to Order Service's identity ONLY — this formalizes the
   exactly-once reservation invariant as an INFRASTRUCTURE-ENFORCED rule,
   not just an application convention. A bug anywhere else literally
   cannot call these endpoints.

5. mTLS (STRICT) + distributed tracing across all 6 services — every
   request, including the 290-870/sec reservation path, is automatically
   encrypted and traced without app code changes.

WHAT STAYS OUT:
  Kafka (Event Bus), PostgreSQL, Redis Cluster, Elasticsearch, Cassandra,
  S3, ClickHouse — none are mesh-manageable HTTP/gRPC services, and Redis
  in particular sits directly on the hot reservation path where an extra
  hop is pure cost.

TRADE-OFFS:
  Sidecar adds ~1-2ms per hop — negligible against the 6-minute pick+pack
  SLA, but Dispatch's 30s offer window means retry budgets must be
  coordinated so they don't stack into a timeout.
  Control-plane-down means sidecars fail open on last-known config — at a
  99.99% order-placement target this mirrors the existing "dark store
  operates offline for up to 10 minutes" precedent already in the design.`,
    followups: [
      "Walk through exactly what happens — at both the mesh layer and the app layer — when one Inventory Service replica starts timing out under peak load.",
      "Why does the AuthorizationPolicy on Inventory Service matter if Order Service is the only caller in the code today anyway?",
      "If you were rolling this mesh out city-by-city, which city would you pick first and what would you watch before expanding to the next?",
    ],
  },
];
