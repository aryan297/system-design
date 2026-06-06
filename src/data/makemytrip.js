export const MAKEMYTRIP_HLD = {
  title: "MakeMyTrip",
  subtitle: "India's largest OTA — flights, hotels, holidays at scale",
  overview:
    "MakeMyTrip aggregates live inventory from 100+ airlines, 1M+ hotels, and bus/rail operators. The hard problems are sub-second multi-source search with stale-tolerant caching, distributed booking sagas across airline PSS and hotel PMS systems, dynamic pricing under yield-management constraints, and idempotent payment + refund flows across a fragmented supplier landscape.",
  diagram: `
┌──────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                  │
│   Web (React)  ·  iOS/Android App  ·  B2B API (Corporate Travel)    │
└────────────────────────────┬─────────────────────────────────────────┘
                             │  HTTPS / gRPC
┌────────────────────────────▼─────────────────────────────────────────┐
│                     API GATEWAY / BFF                                 │
│   Rate limiting  ·  Auth (JWT + OAuth2)  ·  Session routing          │
└──┬──────────┬──────────┬──────────┬──────────┬────────────────────────┘
   │          │          │          │          │
┌──▼──┐  ┌───▼──┐  ┌────▼──┐  ┌───▼──┐  ┌────▼─────┐
│Search│  │Book- │  │Price  │  │Pay-  │  │Customer  │
│Svc  │  │ing   │  │Engine │  │ment  │  │Support   │
│     │  │Svc   │  │       │  │Svc   │  │Svc       │
└──┬──┘  └──┬───┘  └───┬───┘  └───┬──┘  └────┬─────┘
   │         │          │          │           │
   │  ┌──────▼──────────▼──┐       │           │
   │  │   Inventory Cache   │       │           │
   │  │  (Redis 15-min TTL) │       │           │
   │  └─────────────────────┘       │           │
   │                                │           │
┌──▼────────────────────────────────▼───────────▼──────────────────────┐
│                       SUPPLIER INTEGRATION LAYER                      │
│  GDS: Amadeus / Sabre / Galileo  ·  Direct airline APIs (IndiGo API) │
│  Hotel: Expedia EPS  ·  Hotelbeds  ·  Direct chain APIs (Marriott)   │
│  Rail: IRCTC API  ·  Bus: AbhiBus, RedBus GDS                        │
└───────────────────────────────────────────────────────────────────────┘
   │          │          │          │          │
┌──▼──┐  ┌───▼──┐  ┌────▼──┐  ┌───▼──┐  ┌────▼──────┐
│Fare │  │Seat  │  │Hotel  │  │PNR   │  │Notification│
│Cache│  │Map   │  │Avail  │  │Store │  │Svc (SMS/  │
│Redis│  │Svc   │  │Cache  │  │MySQL │  │Email/Push)│
└─────┘  └──────┘  └───────┘  └──────┘  └───────────┘
`,
  metrics: [
    "Search: 50M+ searches/day, peak 500K concurrent during sales",
    "Inventory: 100+ airline connections, 1M+ hotel properties",
    "Booking: 200K+ flight PNRs/day, 99.95% booking success rate",
    "Latency: Search <800ms p99, fare lock <200ms, payment <3s",
    "Cancellation: 40% of bookings cancelled — refund SLA 5–7 biz days",
    "GDS call fan-out: 15–25 supplier calls per search, response within 600ms",
  ],
  phases: [
    {
      id: "search",
      title: "Phase 1: Search & Aggregation",
      concepts: [
        "Multi-source Fan-out",
        "Fare Cache",
        "Result Normalization",
        "Thundering Herd on Sale Launch",
      ],
      details: `
SEARCH AGGREGATION FLOW
───────────────────────
User searches BOM→DEL 15 Jun 2P1C
        │
        ▼
Search Service fans out SIMULTANEOUSLY to:
  • Amadeus GDS    → 400 fare families for 8 airlines
  • Sabre GDS      → consolidator fares + NDC offers
  • IndiGo Direct  → IndiGo-only exclusive fares
  • Air India API  → AI-branded codeshare fares
  • SpiceJet API   → bundle add-ons (seat+meal)

Timeout = 600ms → collect all responses within window
  Slow supplier? → use stale cache (15-min TTL)
  All suppliers timeout? → serve from 1-hour cold cache with "prices may vary" banner

FARE NORMALIZATION
──────────────────
Each supplier returns different formats:
  Amadeus → PriceQuoteRS XML (EDIFACT-based)
  IndiGo  → JSON REST
  GDS NDC → IATA NDC 17.3 OrderViewRS XML

Normalizer maps all to canonical FlightOffer:
{
  itineraryKey, origin, destination, departureAt,
  arrivalAt, carrier, flightNo, cabinClass,
  totalFare, breakup: { base, taxes[], surcharges[] },
  seatsLeft, fareFamily, isRefundable, baggage
}

FARE CACHE STRATEGY (Redis)
───────────────────────────
Key:  FARE:{origin}:{dest}:{date}:{pax}:{class}
TTL:  15 minutes (fares change frequently)
On miss → fan-out → populate cache + return results
On hit  → return cache + async refresh in background

THUNDERING HERD on SALE LAUNCH
───────────────────────────────
Problem: MMT announces "Sale at 12:00 PM" — 500K users hit search simultaneously
Solution:
  1. Pre-warm fare cache at 11:55 AM with sale fares from airlines
  2. Cache stampede protection: only one goroutine does fan-out per cache key
     (Redis SET NX "LOCK:{key}" EX 10 — lock while fetching)
  3. Jittered TTL: base 15min ± random 0–3min to spread expirations
  4. Auto-scale Search workers from 50 → 500 pods at 11:45 AM via KEDA
`,
    },
    {
      id: "booking",
      title: "Phase 2: Booking Saga & PNR Management",
      concepts: [
        "Distributed Saga",
        "Fare Lock (Hold)",
        "PNR State Machine",
        "Idempotency",
      ],
      details: `
BOOKING FLOW CHALLENGE
──────────────────────
Flight booking touches 4 external systems:
  1. Airline PSS (Passenger Service System) — Amadeus Altéa, Navitaire
  2. Payment Gateway — Razorpay / PayU
  3. Insurance Provider (optional)
  4. MMT Ledger & PNR Store

Any step can fail → need saga pattern with compensating transactions

SAGA STEPS (choreography-based)
─────────────────────────────────
Step 1: FARE LOCK (Hold)
  → Call airline PSS: HoldOrderRQ for 15 minutes
  → Airline returns: Hold token + price guarantee
  → On failure: return "seat taken" to user

Step 2: PAYMENT CAPTURE
  → Initiate payment with Hold token in metadata
  → Payment gateway webhooks back: CAPTURED / FAILED
  → Idempotency key = holdToken + userId + amount

Step 3: TICKET ISSUANCE
  → Call airline PSS: CreateOrderRQ (uses Hold token)
  → Airline returns: PNR (e.g. WXYZ12) + E-ticket
  → On failure: trigger REFUND saga (compensate step 2)

Step 4: CONFIRMATION
  → Store PNR in MySQL with state=CONFIRMED
  → Emit BookingConfirmed event → Kafka
  → Notification Svc: send email + SMS + push

PNR STATE MACHINE
──────────────────
                    ┌──────────┐
                    │  INIT    │
                    └────┬─────┘
                         │ fare locked
                    ┌────▼─────┐
                    │  HELD    │◄──── 15-min TTL → EXPIRED
                    └────┬─────┘
                         │ payment captured
                    ┌────▼─────┐
                    │ TICKETED │
                    └────┬─────┘
              ┌──────────┼──────────┐
       user   │          │ airline  │ no show
       cancel │          │ cancel   │
         ┌────▼───┐  ┌───▼────┐  ┌─▼────────┐
         │ USER_  │  │AIRLINE_│  │ NO_SHOW  │
         │CANCEL  │  │CANCEL  │  │          │
         └────┬───┘  └───┬────┘  └──────────┘
              └──────┬────┘
                ┌────▼────┐
                │ REFUND_ │
                │INITIATED│
                └────┬────┘
                ┌────▼────┐
                │REFUNDED │
                └─────────┘

IDEMPOTENCY
───────────
All booking RPCs carry X-Idempotency-Key header
Booking Svc stores: {idemKey → {status, result}} in Redis (24hr TTL)
Duplicate request within 24hr → return stored result, no re-execution
Prevents double-booking on client retry after network timeout
`,
    },
    {
      id: "pricing",
      title: "Phase 3: Dynamic Pricing & Inventory",
      concepts: [
        "Yield Management",
        "Markup Engine",
        "Fare Prediction",
        "Price Alerts",
      ],
      details: `
PRICING LAYERS
───────────────
Displayed price = Supplier base fare
                + MMT markup (dynamic)
                + Convenience fee
                + GST (5% domestic, 12% intl)
                - Coupon discount
                - Wallet cashback
                - Bank offer discount

MARKUP ENGINE
──────────────
MMT markup is NOT fixed — it varies by:
  • Route competitiveness (BOM-DEL → low markup; BOM-IXZ → higher)
  • Booking window (>30 days → higher markup; last-minute → lower)
  • User segment (new user → lower; loyal MMT Black → cashback instead)
  • Demand signal (high search-to-book ratio → increase markup)
  • Competitor price (real-time scrape of Cleartrip / Ixigo within ±5%)

Markup rules stored in feature store (Redis), evaluated in <5ms

FARE PREDICTION (ML)
──────────────────────
MMT "Price Trend" feature (Buy Now / Wait):
  Model: LightGBM trained on 3 years of fare history
  Features: route, days_to_departure, day_of_week, season,
            current_seats_left, historical_avg_fare, school_holiday
  Output: {prediction: "FALL", confidence: 0.78, expected_drop: ₹450}
  Served via feature store + model server (TorchServe)

PRICE ALERTS
─────────────
User sets alert: BOM→DEL ≤ ₹3,500
  → Store in Elasticsearch index: {route, pax, maxPrice, userId, expiresAt}
  → Every 30 min: Fare refresher job scans all live fares
  → Match: push "Fare dropped to ₹3,200!" → FCM/APNs

INVENTORY REFRESH
──────────────────
Real-time seat availability is critical:
  • Flight: seats_left updated via supplier push webhook OR 5-min poll
  • Hotel: availability via Expedia EPS channel manager push
  • Hot routes (BOM-DEL peak hour): 1-min refresh
  • Long-tail routes: 15-min refresh
  Stored in Redis sorted set: AVAIL:{flightKey} → seats_left
  TTL = 20 min; on expiry → sync job refreshes from supplier
`,
    },
    {
      id: "cancellation",
      title: "Phase 4: Cancellation, Refunds & Scale",
      concepts: [
        "Cancellation Policy Engine",
        "Refund Saga",
        "Peak Scale",
        "Observability",
      ],
      details: `
CANCELLATION POLICY ENGINE
───────────────────────────
Policy varies by: airline × fare family × hours before departure
Example IndiGo SAVER fare:
  >72 hours before departure: ₹3,500 cancellation charge
  24–72 hours:                ₹5,000 cancellation charge
  <24 hours:                  Non-refundable
  No show:                    Non-refundable

MMT stores all policies at booking time (supplier policies change post-booking)
Policy lookup: {pnrId} → CancellationRule[] stored in MySQL with booking

REFUND SAGA
────────────
Step 1: Validate cancellation eligibility (check policy)
Step 2: Call airline PSS CancelOrderRQ → get refund amount
Step 3: Initiate refund to original payment method
        Razorpay Refund API → bank processes in 5–7 days
Step 4: Credit MMT wallet instantly if user opts in (faster path)
Step 5: Update PNR state → REFUNDED + send confirmation

Compensating transaction: if step 3 fails, retry 3× with backoff
If all retries fail → dead-letter queue → ops team manual resolution

PEAK SCALE — DIWALI / NEW YEAR
────────────────────────────────
Pattern: search volume 10× normal, bookings 4× normal
  Pre-event:
    • KEDA auto-scales Search pods from 50 → 600 (watching Kafka lag)
    • Pre-warm fare cache for top 500 routes 30 min before midnight sale
    • DB read replicas scaled from 3 → 10
    • Circuit breakers: if Amadeus latency >2s → stop fan-out, serve cache only

  During peak:
    • Queue-based booking: user gets "Your booking is being processed"
    • Booking requests go into Kafka → processed by 200 worker pods
    • Priority queue: paid users processed ahead of browsing users

  Post-event:
    • Cancellation spike (buyer's remorse) within 24hr → scale refund workers

OBSERVABILITY STACK
────────────────────
Metrics:   Prometheus + Grafana dashboards
           Key metric: search_to_book_ratio (normal 8%, drops below 5% → pricing alert)
Tracing:   Jaeger distributed traces — every booking has trace ID in PNR
Logging:   ELK stack — all supplier API calls logged with latency + response code
Alerting:  PagerDuty: booking success rate <98% → P1 page
           Supplier error rate >5% → P2 page (failover to alternate GDS)
SLOs:
  Search availability: 99.9%  (44 min downtime/month)
  Booking success:     99.95% (21 min downtime/month)
  Payment success:     99.99% (4 min downtime/month)
`,
    },
  ],
};

export const MAKEMYTRIP_LLD = {
  title: "MakeMyTrip — Low Level Design",
  subtitle: "Search Aggregator · Booking Engine · Pricing · Refund Saga",
  components: [
    {
      id: "search-aggregator",
      title: "Search Aggregator Service",
      description:
        "Fan-out to 5+ suppliers in parallel, normalize heterogeneous formats, apply fare cache, rank and deduplicate results.",
      api: `// Search request
POST /api/v2/flights/search
{
  "origin": "BOM", "destination": "DEL",
  "departureDate": "2024-12-15",
  "returnDate": null,
  "adults": 2, "children": 1, "infants": 0,
  "cabinClass": "ECONOMY",
  "currency": "INR"
}

// Search response (top 3 of ~120 results)
{
  "searchId": "srch_8f3a2b1c",
  "cachedAt": "2024-11-20T10:45:00Z",
  "isCached": false,
  "results": [
    {
      "itineraryKey": "6E-123-BOM-DEL-20241215-E",
      "carrier": "IndiGo",
      "flightNo": "6E 123",
      "departureAt": "2024-12-15T06:00:00",
      "arrivalAt": "2024-12-15T08:10:00",
      "duration": "2h10m",
      "stops": 0,
      "totalFare": 8450,
      "breakup": {
        "baseFare": 5800,
        "taxes": [
          {"code": "K3", "name": "Fuel Surcharge", "amount": 1800},
          {"code": "YQ", "name": "Airline YQ", "amount": 450},
          {"code": "GST", "amount": 400}
        ],
        "convenienceFee": 0,
        "mmtMarkup": 0
      },
      "seatsLeft": 4,
      "fareFamily": "SAVER",
      "isRefundable": false,
      "baggageAllowance": {"cabin": "7kg", "checkin": "15kg"},
      "supplier": "INDIGO_DIRECT",
      "priceGuaranteeUntil": "2024-11-20T11:00:00Z"
    }
  ],
  "priceTrend": {"direction": "FALL", "confidence": 0.72, "expectedDrop": 320},
  "filtersApplied": {},
  "totalResults": 118
}`,
      internals: `// Go — Search Aggregator Core
type SearchRequest struct {
  Origin, Destination, Date string
  Adults, Children, Infants int
  CabinClass, Currency      string
}

func (s *SearchAggregator) Search(ctx context.Context, req SearchRequest) (*SearchResponse, error) {
  // 1. Check fare cache
  cacheKey := fareKey(req)
  if cached, ok := s.redis.Get(ctx, cacheKey); ok {
    go s.asyncRefresh(cacheKey, req) // refresh in background
    return cached, nil
  }

  // 2. Fan-out to suppliers with 600ms deadline
  ctx, cancel := context.WithTimeout(ctx, 600*time.Millisecond)
  defer cancel()

  type supplierResult struct {
    offers []FlightOffer
    err    error
  }
  ch := make(chan supplierResult, len(s.suppliers))

  for _, supplier := range s.suppliers {
    go func(sup Supplier) {
      offers, err := sup.Search(ctx, req)
      ch <- supplierResult{offers, err}
    }(supplier)
  }

  // 3. Collect within timeout
  var allOffers []FlightOffer
  for range s.suppliers {
    select {
    case r := <-ch:
      if r.err == nil {
        allOffers = append(allOffers, r.offers...)
      }
    case <-ctx.Done():
      // partial results OK — log missing suppliers
    }
  }

  // 4. Normalize + deduplicate
  normalized := s.normalizer.NormalizeAll(allOffers)
  deduped := deduplicateByItinerary(normalized) // keep cheapest per itinerary key

  // 5. Apply pricing (markup + discounts)
  priced := s.pricingEngine.ApplyMarkup(ctx, deduped, req)

  // 6. Cache + return
  s.redis.SetEx(ctx, cacheKey, priced, fareJitteredTTL())
  return &SearchResponse{Results: priced}, nil
}

func fareJitteredTTL() time.Duration {
  base := 15 * time.Minute
  jitter := time.Duration(rand.Intn(180)) * time.Second
  return base + jitter
}

// Normalization — Amadeus EDIFACT → canonical FlightOffer
func (n *AmadeusNormalizer) Normalize(raw AmadeusRS) []FlightOffer {
  var offers []FlightOffer
  for _, pricedItinerary := range raw.PricedItineraries {
    offer := FlightOffer{
      ItineraryKey: buildKey(pricedItinerary),
      TotalFare:    pricedItinerary.AirItineraryPricingInfo.ItinTotalFare.TotalFare.Amount,
      SeatsLeft:    min(pricedItinerary.SeatsRemaining.Number, 9), // cap at 9 for display
      Supplier:     "AMADEUS",
    }
    offers = append(offers, offer)
  }
  return offers
}`,
    },
    {
      id: "booking-engine",
      title: "Booking Engine & PNR Service",
      description:
        "Orchestrates the booking saga: fare hold → payment → ticket issuance. Maintains PNR state machine. Handles idempotency, retries, and compensating transactions.",
      api: `// Step 1: Initiate booking (fare lock)
POST /api/v2/bookings/initiate
{
  "searchId": "srch_8f3a2b1c",
  "itineraryKey": "6E-123-BOM-DEL-20241215-E",
  "travellers": [
    {"type": "ADULT", "title": "Mr", "firstName": "Rahul", "lastName": "Sharma",
     "dob": "1990-05-15", "passport": null},
    {"type": "ADULT", "title": "Ms", "firstName": "Priya", "lastName": "Sharma",
     "dob": "1992-03-22", "passport": null}
  ],
  "contactEmail": "rahul@example.com",
  "contactPhone": "+919876543210",
  "addOns": [{"type": "MEAL", "code": "VJML", "travellerId": 0}]
}
Response: {
  "bookingId": "bkg_x9k2m4p",
  "holdToken": "HL_6E_abc123",
  "heldFare": 8450,
  "holdExpiresAt": "2024-11-20T11:00:00Z",
  "paymentRequired": 8450,
  "status": "HELD"
}

// Step 2: Complete payment (Payment Svc callback)
POST /api/v2/bookings/bkg_x9k2m4p/confirm
X-Idempotency-Key: pay_rz_ch_abc789
{
  "paymentId": "pay_rz_ch_abc789",
  "paymentMethod": "UPI",
  "amountPaid": 8450
}
Response: {
  "bookingId": "bkg_x9k2m4p",
  "pnr": "WXYZ12",
  "airline": "IndiGo",
  "status": "CONFIRMED",
  "eTicketUrl": "https://cdn.mmt.com/tickets/bkg_x9k2m4p.pdf",
  "cancellationPolicy": {
    "freeCancellationBefore": null,
    "charges": [
      {"hoursBeforeDep": 72, "charge": 3500},
      {"hoursBeforeDep": 24, "charge": 5000},
      {"hoursBeforeDep": 0, "charge": "NON_REFUNDABLE"}
    ]
  }
}`,
      internals: `// Booking Saga Orchestrator (Go)
func (b *BookingEngine) ConfirmBooking(ctx context.Context, bookingID, paymentID string) (*PNR, error) {
  // Idempotency check
  if result := b.idempotencyStore.Get(ctx, paymentID); result != nil {
    return result.PNR, nil
  }

  booking := b.pnrRepo.GetByID(ctx, bookingID)
  if booking.Status != StatusHeld {
    return nil, ErrInvalidState
  }
  if time.Now().After(booking.HoldExpiresAt) {
    return nil, ErrHoldExpired
  }

  // Issue ticket with airline PSS
  pnr, err := b.airlineClient.CreateOrder(ctx, CreateOrderReq{
    HoldToken:  booking.HoldToken,
    Travellers: booking.Travellers,
  })
  if err != nil {
    // Compensate: refund payment
    b.paymentSvc.Refund(ctx, paymentID, booking.TotalFare, "ISSUANCE_FAILED")
    b.pnrRepo.SetStatus(ctx, bookingID, StatusIssuanceFailed)
    return nil, err
  }

  // Persist confirmation
  b.pnrRepo.Confirm(ctx, bookingID, pnr)
  b.idempotencyStore.Set(ctx, paymentID, &IdempotencyResult{PNR: pnr}, 24*time.Hour)

  // Emit event for notifications
  b.kafka.Publish(ctx, "booking.confirmed", BookingConfirmedEvent{
    BookingID: bookingID, PNR: pnr.Code, UserID: booking.UserID,
  })
  return pnr, nil
}

// PNR MySQL schema
CREATE TABLE pnrs (
  id           VARCHAR(36) PRIMARY KEY,
  booking_id   VARCHAR(36) UNIQUE NOT NULL,
  airline_pnr  VARCHAR(10),
  user_id      VARCHAR(36) NOT NULL,
  status       ENUM('HELD','TICKETED','CANCELLED','REFUNDED','EXPIRED') NOT NULL,
  hold_token   VARCHAR(100),
  hold_expires_at DATETIME,
  total_fare   DECIMAL(10,2) NOT NULL,
  currency     CHAR(3) DEFAULT 'INR',
  itinerary    JSON NOT NULL,
  travellers   JSON NOT NULL,
  cancel_policy JSON NOT NULL, -- snapshot at booking time
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_status_created (status, created_at)
);`,
    },
    {
      id: "pricing-engine",
      title: "Pricing & Markup Engine",
      description:
        "Computes final display price by layering supplier base fare with dynamic markup, applied discounts (coupons, bank offers, wallet cashback), and taxes. Evaluates 50+ pricing rules in <5ms.",
      api: `// Internal pricing RPC (called by Search Aggregator)
POST /internal/pricing/apply
{
  "offers": [...],
  "userId": "usr_abc123",
  "sessionId": "sess_xyz",
  "appliedCoupon": null,
  "paymentMethod": null
}
Response: {
  "pricedOffers": [
    {
      "itineraryKey": "6E-123-BOM-DEL-20241215-E",
      "supplierFare": 7600,
      "mmtMarkup": 450,
      "convenienceFee": 400,
      "taxes": 800,
      "grossFare": 9250,
      "discounts": [
        {"type": "BANK_OFFER", "code": "HDFC10", "amount": 800},
        {"type": "WALLET_CASHBACK", "code": "MMTWALLET", "cashback": 200}
      ],
      "displayFare": 8450,
      "effectiveFare": 8250
    }
  ]
}`,
      internals: `// Pricing rule evaluation engine
type PricingContext struct {
  Route          string  // "BOM-DEL"
  DaysToDeparture int
  SeatsLeft       int
  UserSegment     string  // "NEW", "LOYAL", "MMT_BLACK"
  CompetitorFare  float64 // scraped Cleartrip price
  DemandScore     float64 // search-to-book ratio last 1hr
}

func (pe *PricingEngine) ComputeMarkup(ctx context.Context, c PricingContext) float64 {
  rules := pe.featureStore.GetMarkupRules(ctx, c.Route) // Redis, <1ms

  var markup float64 = rules.BaseMarkup

  // Competitive adjustment
  if c.CompetitorFare > 0 && markup+baseFare > c.CompetitorFare {
    markup = c.CompetitorFare - baseFare - 50 // undercut by ₹50
  }

  // Demand surge
  if c.DemandScore > 0.85 { // high search, low conversion → price sensitive
    markup *= 0.9
  }

  // User segment
  switch c.UserSegment {
  case "MMT_BLACK":
    markup = 0 // loyalty — revenue via cashback instead
  case "NEW":
    markup *= 0.7 // acquisition pricing
  }

  // Last-minute
  if c.DaysToDeparture <= 3 {
    markup *= 1.2 // low elasticity travelers
  }

  return markup
}

// Coupon validation
func (pe *PricingEngine) ValidateCoupon(ctx context.Context, code, userID string, fare float64) (*Discount, error) {
  coupon := pe.couponRepo.Get(ctx, code)
  if coupon == nil || time.Now().After(coupon.ExpiresAt) {
    return nil, ErrInvalidCoupon
  }
  if coupon.MinBookingValue > fare {
    return nil, ErrBelowMinValue
  }
  // Check per-user redemption limit
  redemptions := pe.couponRepo.CountUserRedemptions(ctx, code, userID)
  if redemptions >= coupon.PerUserLimit {
    return nil, ErrCouponLimitReached
  }
  discount := min(fare * coupon.DiscountPct / 100, coupon.MaxDiscount)
  return &Discount{Amount: discount, Code: code}, nil
}`,
    },
    {
      id: "cancellation-refund",
      title: "Cancellation & Refund Engine",
      description:
        "Looks up cancellation policy snapshotted at booking time, calls airline PSS to cancel, calculates refund, initiates payment reversal, and handles failure via dead-letter queue.",
      api: `// Cancel booking
POST /api/v2/bookings/bkg_x9k2m4p/cancel
{
  "reason": "CHANGE_OF_PLANS",
  "refundPreference": "WALLET"  // or "ORIGINAL_SOURCE"
}
Response: {
  "bookingId": "bkg_x9k2m4p",
  "cancellationCharges": 3500,
  "refundAmount": 4950,
  "refundTo": "MMT_WALLET",
  "refundETA": "INSTANT",
  "refundId": "rfnd_k7p3q",
  "status": "CANCELLATION_INITIATED"
}

// Refund status
GET /api/v2/refunds/rfnd_k7p3q
{
  "refundId": "rfnd_k7p3q",
  "amount": 4950,
  "status": "PROCESSED",
  "creditedAt": "2024-11-20T12:05:00Z",
  "creditedTo": "MMT_WALLET",
  "txnId": "wallet_txn_98321"
}`,
      internals: `// Cancellation policy evaluation
func (ce *CancellationEngine) CalculateCharges(booking *PNR) CancellationResult {
  hoursLeft := time.Until(booking.DepartureAt).Hours()

  // Policy was snapshot at booking time — never re-fetch from supplier
  policy := booking.CancelPolicy

  var charge float64
  for _, tier := range policy.Tiers {
    if hoursLeft >= float64(tier.HoursBeforeDep) {
      charge = tier.Charge
      break
    }
  }

  if policy.IsNonRefundable || hoursLeft < 0 {
    return CancellationResult{Charge: booking.TotalFare, Refund: 0}
  }
  return CancellationResult{
    Charge: charge,
    Refund: booking.TotalFare - charge,
  }
}

// Refund saga with dead-letter queue
func (re *RefundEngine) ProcessRefund(ctx context.Context, bookingID, refundPref string) error {
  booking := re.pnrRepo.GetByID(ctx, bookingID)
  result := re.calcEngine.CalculateCharges(booking)

  // Step 1: Cancel with airline
  if err := re.airlineClient.CancelOrder(ctx, booking.HoldToken); err != nil {
    return fmt.Errorf("airline cancel failed: %w", err)
  }

  // Step 2: Credit refund
  var err error
  switch refundPref {
  case "WALLET":
    err = re.walletSvc.Credit(ctx, booking.UserID, result.Refund)
  case "ORIGINAL_SOURCE":
    err = re.paymentGW.Refund(ctx, booking.PaymentID, result.Refund)
  }

  if err != nil {
    // Retry 3x with exponential backoff
    for attempt := 1; attempt <= 3; attempt++ {
      time.Sleep(time.Duration(attempt*attempt) * time.Second)
      if err = re.retryRefund(ctx, booking, result.Refund, refundPref); err == nil {
        break
      }
    }
    if err != nil {
      // Send to dead-letter queue for manual resolution
      re.kafka.Publish(ctx, "refunds.dlq", RefundDLQEvent{BookingID: bookingID, Error: err.Error()})
      return ErrRefundQueued
    }
  }

  re.pnrRepo.SetStatus(ctx, bookingID, StatusRefunded)
  return nil
}`,
    },
    {
      id: "supplier-integration",
      title: "Supplier Integration Layer",
      description:
        "Adapters for GDS (Amadeus, Sabre), direct airline APIs, and hotel channel managers. Handles protocol translation (EDIFACT/SOAP → JSON), circuit breaking, failover, and per-supplier rate limiting.",
      api: `// GDS Amadeus adapter — internal interface
type FlightSupplier interface {
  Search(ctx context.Context, req SearchRequest) ([]FlightOffer, error)
  HoldOrder(ctx context.Context, req HoldRequest) (*HoldResponse, error)
  CreateOrder(ctx context.Context, req CreateOrderRequest) (*PNRResponse, error)
  CancelOrder(ctx context.Context, holdToken string) error
  GetSeatMap(ctx context.Context, flightKey string) (*SeatMap, error)
}

// Circuit breaker per supplier
type SupplierStatus {
  Amadeus:   "CLOSED",    // healthy
  Sabre:     "HALF_OPEN", // recovering
  IndigoDirect: "CLOSED"
}

// Failover: if primary GDS errors >5% in 60s window
// → route traffic to secondary GDS automatically`,
      internals: `// Amadeus GDS adapter (SOAP/XML)
func (a *AmadeusAdapter) Search(ctx context.Context, req SearchRequest) ([]FlightOffer, error) {
  // Build EDIFACT OTA_AirLowFareSearchRQ XML
  soapReq := a.builder.BuildSearchRQ(req)

  resp, err := a.httpClient.PostXML(ctx, a.endpoint+"/AirLowFareSearch", soapReq)
  if err != nil {
    a.circuitBreaker.RecordFailure()
    return nil, err
  }
  a.circuitBreaker.RecordSuccess()

  // Parse OTA_AirLowFareSearchRS
  parsed := a.parser.ParseSearchRS(resp)
  return a.normalizer.Normalize(parsed), nil
}

// Circuit breaker (sliding window)
type CircuitBreaker struct {
  failures  []time.Time
  threshold int           // 5% of calls
  window    time.Duration // 60 seconds
  state     State         // CLOSED, OPEN, HALF_OPEN
  mu        sync.Mutex
}

func (cb *CircuitBreaker) Allow() bool {
  cb.mu.Lock()
  defer cb.mu.Unlock()
  if cb.state == Open {
    if time.Since(cb.openedAt) > 30*time.Second {
      cb.state = HalfOpen
      return true // probe request
    }
    return false
  }
  return true
}

// Per-supplier rate limiting (airline APIs have strict quotas)
// Amadeus: 10K calls/min for search, 500/min for booking
var amadeusLimiter = rate.NewLimiter(rate.Every(6*time.Millisecond), 10)

func (a *AmadeusAdapter) rateLimit(ctx context.Context) error {
  return amadeusLimiter.Wait(ctx) // blocks if quota exceeded
}

// Hotel channel manager (Expedia EPS)
func (h *ExpediaAdapter) GetAvailability(ctx context.Context, req HotelSearchReq) ([]HotelOffer, error) {
  // Expedia EPS Rapid API — REST/JSON (simpler than GDS)
  url := fmt.Sprintf("%s/properties/availability?checkin=%s&checkout=%s&occupancy=%s&property_id=%s",
    h.baseURL, req.CheckIn, req.CheckOut, req.Occupancy, req.PropertyID)

  resp, err := h.httpClient.Get(ctx, url)
  if err != nil {
    return nil, err
  }
  return h.normalizer.NormalizeEPS(resp), nil
}`,
    },
  ],
};

export const MAKEMYTRIP_QNA = [
  {
    id: "mmt-q1",
    question:
      "How does MakeMyTrip handle the thundering herd problem when a flight sale goes live at midnight?",
    answer:
      "Three layers: pre-warming (fare cache populated 30 minutes before sale from airline APIs), stampede protection (Redis SET NX lock per cache key — only one goroutine fans out to suppliers at a time, others wait for the result), and jittered TTL (base 15 min ± random 0–3 min to spread cache expirations). KEDA auto-scales Search pods from 50 → 600 before the sale using a scheduled HPA. Circuit breakers prevent a slow GDS from taking down the entire search flow.",
    category: "Scale & Performance",
    difficulty: "hard",
    round: "system-design",
    asked_at: ["Flipkart", "Paytm", "Cleartrip"],
    followups: [
      "How do you pre-warm without showing non-sale prices in cache?",
      "What happens if the pre-warming job fails?",
    ],
  },
  {
    id: "mmt-q2",
    question:
      "Explain the booking saga pattern. What happens if ticket issuance fails after payment is captured?",
    answer:
      "The booking saga has 3 steps: (1) Fare Hold — call airline PSS for a 15-min price lock, (2) Payment Capture — Razorpay charges user, (3) Ticket Issuance — call airline PSS CreateOrder with hold token. If step 3 fails after step 2, the compensating transaction triggers: Booking Engine calls Razorpay Refund API with the payment ID and sets the PNR to ISSUANCE_FAILED. An idempotency key (hold token + user ID + amount) ensures the refund is not doubled on retry. Failed issuances go to a dead-letter topic for ops review.",
    category: "Architecture",
    difficulty: "hard",
    round: "system-design",
    asked_at: ["Razorpay", "PhonePe", "Swiggy"],
    followups: [
      "How do you handle the case where the airline returns PNR but the confirmation SMS fails to send?",
      "What if the user loses connectivity between payment and confirmation?",
    ],
  },
  {
    id: "mmt-q3",
    question: "How does MakeMyTrip normalize fare data from Amadeus (EDIFACT/SOAP) vs IndiGo's direct REST API?",
    answer:
      "Each supplier has an adapter implementing the FlightSupplier interface. The Amadeus adapter parses OTA_AirLowFareSearchRS XML, mapping EDIFACT fare families to a canonical FlightOffer struct. IndiGo's REST JSON adapter maps their proprietary field names to the same struct. The canonical FlightOffer contains: itineraryKey, totalFare, breakup (base + taxes[] + surcharges[]), seatsLeft, fareFamily, isRefundable, baggageAllowance, and supplier tag. This ensures the pricing engine and ranking layer work identically regardless of supplier.",
    category: "Architecture",
    difficulty: "medium",
    round: "system-design",
    asked_at: ["Amadeus", "MakeMyTrip", "Ixigo"],
    followups: [
      "How do you deduplicate the same flight offered by both GDS and direct API?",
    ],
  },
  {
    id: "mmt-q4",
    question:
      "How does the dynamic markup engine decide how much to charge over the supplier base fare?",
    answer:
      "The markup engine evaluates 5 signals: (1) Route competitiveness — competitive routes like BOM-DEL get lower markup, scraped Cleartrip price is a ceiling, (2) Booking window — last-minute travelers (≤3 days) are less price-sensitive, markup increases 20%, (3) User segment — MMT Black loyalty users get 0 markup, new users get 30% discount on markup for acquisition, (4) Demand score — high search-to-book ratio (>85%) signals price sensitivity, markup reduced 10%, (5) Inventory — <5 seats left, markup can increase (captive audience). All rules sit in Redis feature store, evaluated in <5ms.",
    category: "Architecture",
    difficulty: "hard",
    round: "system-design",
    asked_at: ["Booking.com", "Airbnb", "MakeMyTrip"],
    followups: [
      "How do you A/B test markup changes without revenue leakage?",
      "What prevents the pricing engine from pricing out loyal users?",
    ],
  },
  {
    id: "mmt-q5",
    question:
      "How does MakeMyTrip handle cancellation policies, especially when airline policies change after booking?",
    answer:
      "The cancellation policy is snapshotted as JSON into the PNR row at booking time and never re-fetched from the supplier. This protects the user — if IndiGo changes its policy from ₹3,500 to ₹4,000 cancellation charge after the user booked, MMT honors the original policy. The snapshot includes all tier rules (hours_before_departure → charge). Refund calculation then runs purely against this stored policy, not any live API call.",
    category: "Architecture",
    difficulty: "medium",
    round: "system-design",
    asked_at: ["Agoda", "Cleartrip", "IRCTC"],
    followups: [
      "What if the airline mandates a force-majeure full refund — how do you override the snapshot?",
    ],
  },
  {
    id: "mmt-q6",
    question: "How do you design the price alert system for 10M+ active alerts efficiently?",
    answer:
      "Price alerts are stored in Elasticsearch indexed by {route, pax_config, max_price}. A scheduled Fare Refresher job runs every 30 minutes, pulling live fares for the top 5,000 active routes and running an ES query: 'route=X AND max_price >= live_fare'. Matched alerts are published to a Kafka topic, consumed by the Notification Service (FCM/APNs for push, SMS via Kaleyra). To avoid alert spam, a per-user cooldown of 4 hours is enforced in Redis before sending a second alert for the same route.",
    category: "Scale & Performance",
    difficulty: "medium",
    round: "system-design",
    asked_at: ["Ixigo", "MakeMyTrip", "Booking.com"],
    followups: [
      "How do you handle the refresher job failing for 2 hours — do alerts fire in a burst?",
    ],
  },
  {
    id: "mmt-q7",
    question: "How does MakeMyTrip guarantee idempotency for payments to prevent double-charging?",
    answer:
      "Every payment confirmation carries an X-Idempotency-Key header (Razorpay payment ID). Before processing, the Booking Engine looks up this key in Redis: if found, it returns the stored result immediately without re-executing. The idempotency record has a 24-hour TTL. The key also appears in the CreateOrder call to the airline PSS so that a network retry of ticket issuance doesn't create a duplicate PNR. Razorpay's own API is also idempotent on payment ID, providing a second layer.",
    category: "Fault Tolerance",
    difficulty: "medium",
    round: "system-design",
    asked_at: ["Razorpay", "PayU", "PhonePe"],
    followups: ["What if the Redis idempotency store goes down?"],
  },
  {
    id: "mmt-q8",
    question: "How does MakeMyTrip design its fare cache to handle stale prices and real-time booking conflicts?",
    answer:
      "Fare cache uses Redis with 15-minute TTL (jittered ±3 min). On a cache hit, results are served immediately and an async goroutine refreshes the cache in the background. The displayed price includes a disclaimer 'Prices updated X minutes ago.' The hold flow resolves staleness: when a user clicks Book, MMT calls airline PSS for a real-time fare lock — if the price has changed, the booking flow shows the new price before payment. This two-phase approach (serve stale for browsing, real-time for booking) balances performance and accuracy.",
    category: "Database Design",
    difficulty: "medium",
    round: "system-design",
    asked_at: ["Expedia", "Booking.com", "Cleartrip"],
    followups: [
      "How do you handle the case where fare lock returns a price 30% higher than displayed?",
    ],
  },
  {
    id: "mmt-q9",
    question: "How does MakeMyTrip implement circuit breakers for GDS supplier failures?",
    answer:
      "Each supplier adapter has a circuit breaker with a sliding window (60 seconds). If the failure rate exceeds 5%, the breaker trips to OPEN state and all calls to that supplier return an error immediately without hitting the network. After 30 seconds in OPEN, it enters HALF_OPEN — one probe request is allowed. If it succeeds, the breaker resets to CLOSED. While a supplier is OPEN, the search aggregator falls back to stale fare cache for that supplier, or routes to the secondary GDS (e.g., Amadeus fails → use Sabre). Metrics on breaker state are published to Prometheus for dashboarding.",
    category: "Fault Tolerance",
    difficulty: "hard",
    round: "system-design",
    asked_at: ["Expedia", "Agoda", "MakeMyTrip"],
    followups: [
      "What if all GDS suppliers are simultaneously degraded?",
      "How do you set the 5% threshold without too many false positives?",
    ],
  },
  {
    id: "mmt-q10",
    question: "How would you design the refund dead-letter queue and operations dashboard for failed refunds?",
    answer:
      "Failed refunds after 3 retries are published to a Kafka topic `refunds.dlq` with structured payload: {booking_id, user_id, amount, payment_method, failure_reason, attempt_count, last_error}. An Ops Dashboard (internal React app) reads from this topic and displays pending cases with SLA timers. Ops can trigger manual refund via a secured API endpoint (RBAC-protected, requires ops-admin role). All manual actions are audit-logged. The DLQ is also monitored by Prometheus — if >10 events accumulate within 5 minutes, a PagerDuty P2 alert fires for on-call.",
    category: "Fault Tolerance",
    difficulty: "medium",
    round: "system-design",
    asked_at: ["Razorpay", "Paytm", "Flipkart"],
    followups: [
      "How do you prevent duplicate manual refunds if two ops agents process the same DLQ entry?",
    ],
  },
];
