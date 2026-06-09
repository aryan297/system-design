export const DISTRICT_HLD = {
  title: "District — High Level Design",
  subtitle: "Hyperlocal community social platform — connecting neighbourhoods at scale",
  overview: `District is a hyperlocal social networking platform that connects people within the same neighbourhood, apartment complex, or locality. Unlike national social networks (Instagram, Twitter) where you follow people you know, District is proximity-first: your feed, events, alerts, and neighbours are all scoped to your verified physical address.

The core engineering challenge is partitioning everything by location — not by user-ID — while still delivering the performance users expect from consumer social apps. A post about a water outage in Sector 22 Gurugram must only appear in Sector 22 feeds. A lost dog alert must reach every device within a 2 km radius in under 5 seconds. A local business listing must surface in search only when the searcher is within the business's service zone.

Key technical problems:
  - Verified identity by address: users prove they live in a locality (OTP on bill/GPS polygon) without exposing exact address publicly
  - Dynamic geofencing: radius-based notification blasts; polygonal neighbourhood boundaries that can overlap
  - Hyperlocal feed: ranked reverse-chronological feed scoped to a configurable neighbourhood radius (500 m → 5 km)
  - Near-real-time local alerts: safety alerts, civic issues (pothole, power cut), events — latency SLA < 5 s to all neighbours
  - Local business discovery: service providers searchable by category + proximity, review aggregation, booking
  - Community moderation: locality-level trust scoring, reputation without global scale content policy`,

  diagram: `
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                   │
│             iOS App · Android App · Web · Watchman Portal               │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │  HTTPS / WebSocket (real-time alerts)
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              API GATEWAY  (Kong / AWS ALB + WAF)                        │
│   JWT Auth · Rate Limit · Geo-IP Header Injection · TLS Termination     │
└──┬─────────┬──────────┬──────────┬───────────┬──────────┬──────────────┘
   │         │          │          │           │          │
   ▼         ▼          ▼          ▼           ▼          ▼
┌───────┐ ┌──────┐ ┌────────┐ ┌───────┐ ┌──────────┐ ┌──────────────┐
│ Auth  │ │ Feed │ │  Post  │ │ Event │ │  Alert   │ │  Discovery   │
│Service│ │Engine│ │Service │ │Service│ │ Service  │ │   Service    │
└───┬───┘ └──┬───┘ └───┬────┘ └───┬───┘ └────┬─────┘ └──────┬───────┘
    │        │          │          │           │               │
    └────────┴──────────┴──────────┴───────────┴───────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       EVENT BUS (Kafka)                                 │
│  post.created · alert.triggered · user.verified · reaction.added       │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                     ▼
  ┌──────────────┐   ┌─────────────────┐   ┌────────────────────┐
  │ Feed Fanout  │   │  Notif Worker   │   │  Search Indexer    │
  │  Consumer    │   │  (FCM/APNs)     │   │  (Elasticsearch)   │
  └──────────────┘   └─────────────────┘   └────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA LAYER                                    │
│  PostgreSQL (users, posts, addresses)  ·  Redis (feeds, sessions, geo)  │
│  Elasticsearch (post & business search) ·  Cassandra (notification log) │
│  PostGIS (neighbourhood polygons, GEO queries) ·  S3 (media)           │
│  ClickHouse (analytics)  ·  Kafka (event stream)                        │
└─────────────────────────────────────────────────────────────────────────┘`,

  metrics: [
    { label: "Verified users", value: "5M+", note: "address-verified active accounts" },
    { label: "Neighbourhoods", value: "50K+", note: "geofenced locality polygons" },
    { label: "Posts per day", value: "500K", note: "across all localities" },
    { label: "Alert delivery SLA", value: "< 5 s", note: "safety/civic alerts to all neighbours" },
    { label: "Feed p99 latency", value: "< 300 ms", note: "pre-computed fan-out" },
    { label: "Notification open rate", value: "38%", note: "3× national average — local relevance" },
    { label: "Local businesses", value: "2M+", note: "listed with geo-tagged service zones" },
    { label: "DAU / MAU", value: "42%", note: "high retention from civic utility posts" },
  ],

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Identity, Address Verification & Neighbourhood Assignment",
      sections: [
        {
          title: "Verified Local Identity — Proving You Actually Live There",
          content: `District's trust model depends on verified physical address. Unlike Twitter where anyone can claim to be from anywhere, a post in "Sector 22 RWA Gurugram" should only come from a resident of Sector 22.

ADDRESS VERIFICATION FLOW:
  Option A — GPS polygon check:
    1. User grants location permission
    2. App sends GPS coordinates to Location Service
    3. PostGIS query: ST_Within(user_point, neighbourhood_polygon)
    4. If within polygon, mark address as GPS-verified (soft verification)
    5. Limitation: can be spoofed — used for read-only access initially

  Option B — Document/bill OTP (strong verification):
    1. User enters home address manually
    2. District posts a physical postcard with a 6-digit OTP (like Google/Stripe)
    3. User enters OTP in app within 14 days → address marked as POSTAL_VERIFIED
    4. One address per account; changing address requires re-verification with 30-day cooldown

  Option C — Telecom carrier binding:
    1. User's phone number SIM is verified against telecom operator's address records
    2. API call to carrier (Jio/Airtel/Vi API) to confirm billing address matches claimed address
    3. Instant but requires carrier partnership

VERIFICATION TIERS:
  UNVERIFIED   → can browse feed, cannot post or comment
  GPS_SOFT     → can comment; cannot create posts or alerts
  POSTAL_HARD  → full access: post, alert, vote, business listing
  TRUSTED      → 6+ months tenure, 10+ posts, community upvotes — bypass moderation queue`,
        },
        {
          title: "Neighbourhood Polygon Engine — Dynamic Geofencing",
          content: `Every post, event, and alert belongs to one or more neighbourhood polygons. Getting this right is foundational.

NEIGHBOURHOOD HIERARCHY:
  Level 1 — Microlocality: apartment complex, gated community (radius ~200 m)
    Example: "DLF Phase 4 Vipul Greens"
  Level 2 — Locality: sector/area (radius ~1 km)
    Example: "Sector 22, Gurugram"
  Level 3 — Suburb: larger area (radius ~5 km)
    Example: "DLF Cyber City Area"
  Level 4 — City: entire city
    Example: "Gurugram"

POLYGON STORAGE (PostGIS):
  Table: neighbourhoods
    id UUID, name TEXT, level INT, polygon GEOMETRY(POLYGON, 4326), parent_id UUID
  Spatial index: CREATE INDEX ON neighbourhoods USING GIST(polygon)
  Query (find all neighbourhoods for a point):
    SELECT * FROM neighbourhoods
    WHERE ST_Within(ST_Point(lng, lat), polygon)
    ORDER BY level ASC;  -- microlocality first

POST SCOPING:
  When user creates a post, they choose scope:
    - "Just my building" → Level 1 polygon only
    - "My neighbourhood" → Level 2 polygon (default)
    - "Nearby area" → Level 3 polygon
    - "Whole city" → Level 4 (restricted to Trusted users for safety)

  System records post_id → [neighbourhood_id, ...] in post_neighbourhoods table
  Fan-out consumer reads this mapping and writes to feed lists for all affected users

BOUNDARY UPDATES:
  Neighbourhood polygons are curated (admin + community feedback)
  PostGIS allows polygon modification — spatial index rebuilds incrementally
  Version-controlled with effective_date so historical queries remain correct`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Feed Engine & Content Graph",
      sections: [
        {
          title: "Hyperlocal Feed — Fan-Out by Geography Not Social Graph",
          content: `District's feed is fundamentally different from Instagram's: you don't follow people, you follow places. Every resident of Sector 22 shares the same base feed, personalised by interaction signals on top.

PUSH MODEL (fan-out on write):
  When post is created:
    1. Post Service writes post record to PostgreSQL
    2. Publishes post.created event to Kafka
    3. Feed Fanout Consumer:
       a. Queries post_neighbourhoods to get all polygon IDs for this post
       b. For each polygon: looks up all active user IDs in that polygon from user_neighbourhood_index
       c. Writes post_id to each user's Redis feed list (LPUSH):
          LPUSH feed:{user_id} {post_id}
          LTRIM feed:{user_id} 0 999  -- keep latest 1000 items

PULL MODEL (fallback for cold start / large radii):
  For city-level posts (potentially millions of users), push fan-out is too expensive
  Pull model: query post_neighbourhoods with user's polygon IDs directly at read time
  Merge with pre-pushed personal feed via cursor-based pagination

FEED READ PATH:
  GET /v1/feed (user_id from JWT):
    1. Fetch post IDs from Redis: LRANGE feed:{user_id} 0 49
    2. Multi-get post metadata from Redis post cache
    3. Cache miss → batch fetch from PostgreSQL
    4. Rank: recency × engagement_score × distance_decay (closer post → higher rank)
    5. Apply filters: muted users, hidden categories, reported posts
    6. Return paginated response with cursor

ENGAGEMENT SCORING:
  engagement_score = (reactions × 2 + comments × 3 + shares × 5) / age_hours^1.2
  Exponential time decay ensures fresh hyperlocal content always surfaces
  Pinned posts (from RWA admin) bypass ranking — always shown at top

WRITE AMPLIFICATION GUARD:
  If post creator's neighbourhood has > 100K users → use pull model instead of push
  "Supernode" localities: pre-computed neighbourhood timeline, users pull from shared list`,
        },
        {
          title: "Post Types & Media Pipeline",
          content: `District supports several post types each with different processing pipelines.

POST TYPES:
  GENERAL_POST   → text + up to 5 images, scoped to neighbourhood
  LOST_FOUND     → structured: item type, photo, last-seen location, contact
  FOR_SALE       → structured listing: price, category, condition, photos
  CIVIC_ISSUE    → geo-tagged report: pothole, garbage, streetlight — forwards to civic body APIs
  EVENT          → start/end time, venue, RSVP cap, cover photo
  SAFETY_ALERT   → high-priority, triggers push to ALL neighbours (bypasses notification prefs)
  RECOMMENDATION → "looking for a plumber" → service providers can respond

MEDIA PIPELINE:
  Upload flow:
    1. Client requests presigned S3 URL from Post Service
    2. Client uploads directly to S3 (bypasses app servers)
    3. S3 trigger → Lambda → MediaProcessor:
       a. Virus scan (ClamAV)
       b. NSFW classification (AWS Rekognition)
       c. Generate thumbnails: 100×100, 400×400, 800×800
       d. Strip EXIF (location privacy — remove GPS metadata from photos)
       e. Store CDN URL in post record
    4. Post Service marks media as PROCESSED, publishes post.created event

EXIF STRIPPING (critical for privacy):
  User posts photo of broken streetlight → photo may contain GPS coordinates
  District strips ALL EXIF data before storing/serving — users should not be locatable by photo metadata
  Implemented via ImageMagick in Lambda: convert input.jpg -strip output.jpg`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Real-Time Alerts & Notifications",
      sections: [
        {
          title: "Alert Service — Sub-5-Second Delivery to All Neighbours",
          content: `Safety alerts (robbery nearby, gas leak, flood warning) are District's highest-value feature. They must reach every resident in a radius within 5 seconds regardless of whether they have the app open.

ALERT CREATION:
  Only Trusted users can create Safety Alerts (anti-abuse)
  Alert Service receives POST /v1/alerts with:
    - type: SAFETY | CIVIC | WEATHER | MISSING_PERSON
    - radius_meters: 500 | 1000 | 2000 | 5000
    - message: text (max 280 chars)
    - location: lat/lng (centred on creator's verified address)

  Alert Service:
    1. Validates user's Trusted status
    2. Records alert in PostgreSQL with PostGIS point + radius circle
    3. Publishes alert.triggered to Kafka (high-priority topic)
    4. Alert Fanout Consumer runs immediately

ALERT FANOUT (geo-radius push):
  Redis GEO commands:
    GEOADD user_locations {lng} {lat} {user_id}  (updated on login / location refresh)
    GEORADIUS user_locations {lng} {lat} {radius} m ASC COUNT 50000
  Returns all user IDs within radius → batch push via FCM/APNs

PUSH DELIVERY:
  FCM (Android) + APNs (iOS) high-priority push:
    - Android: FCM high-priority → bypasses Doze mode, wakes screen
    - iOS: APNs critical alert (requires special entitlement) → overrides mute switch
    - Web: Web Push (VAPID) → shows browser notification even if tab not open
  Fallback: SMS via Twilio for users with notifications disabled (Safety only)

DELIVERY RECEIPT & RETRY:
  Push tokens stored in Cassandra: user_id → [device_id, fcm_token, platform, updated_at]
  On FCM 410 (token expired): purge token, remove from future sends
  Retry queue: failed pushes retried 3× with exponential backoff (1s → 4s → 16s)
  Dead-letter: after 3 failures, log for next-open delivery (inbox-style)

WEBSOCKET PATH (app is open):
  For users with app open, alert is delivered via persistent WebSocket < 1 s:
    Server-sent: { type: "ALERT", payload: { ... } }
  Client renders full-screen modal for Safety type alerts`,
        },
        {
          title: "Notification Preferences & Digest Engine",
          content: `Outside of safety alerts, District sends contextual notifications without becoming spam.

NOTIFICATION CATEGORIES:
  SAFETY_ALERT   → always on (cannot disable in Trusted tier)
  NEIGHBOUR_REPLY → someone replied to your post or comment
  NEARBY_EVENT   → new event within your neighbourhood
  CIVIC_UPDATE   → status update on your reported civic issue (pothole fixed, etc.)
  WEEKLY_DIGEST  → Sunday morning summary of top posts from your neighbourhood
  LOCAL_DEALS    → optional, businesses offering deals to verified residents

PREFERENCE STORAGE:
  Redis HSET notification_prefs:{user_id} {category} {on|off|digest}
  "digest" mode: don't send immediately, include in next weekly digest batch

DIGEST ENGINE:
  Sunday 8 AM (localised to user timezone) scheduled job:
    1. Pull all users with at least one category set to "digest"
    2. For each user: fetch top 10 posts from last 7 days ranked by engagement
    3. Render email/push digest via template engine
    4. Send via SES (email) + FCM (push summary card)

QUIET HOURS:
  Per-user quiet hours stored in preference: { start: "22:00", end: "07:00", tz: "Asia/Kolkata" }
  Notification Worker checks quiet hours before sending
  Exception: Safety Alerts always delivered, quiet hours ignored`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Local Business Discovery & Community Trust",
      sections: [
        {
          title: "Local Business Listing & Geo-Aware Discovery",
          content: `District's local business directory differentiates from Google Maps/Justdial by requiring business owners to be verified residents or have a verified physical premises in the locality.

BUSINESS PROFILE:
  Fields: business_name, category (plumber|electrician|...), service_zones [polygon_ids],
          phone, whatsapp, photos, tagline, working_hours, pricing_range
  Verification: Owner must have POSTAL_HARD address in or adjacent to service zone
  Enhanced listing: pincode-verified physical address → "Verified Local Business" badge

SEARCH (Elasticsearch):
  Index: district_businesses
    Fields: name (text), category (keyword), service_zones (keyword array),
            neighbourhood_level2 (keyword), geo_point (geo_point),
            rating (float), review_count (int), verified (boolean)

  Query anatomy for "best plumber near me":
    bool:
      must:   multi_match on "plumber" across name, category
      filter: geo_distance: { distance: "5km", location: user_geo_point }
              term: service_zones contains user's neighbourhood_id
    sort:     [ { verified: desc }, { rating: desc }, { _score: desc } ]

REVIEW SYSTEM:
  Only verified residents can leave reviews for local businesses
  Review carries reviewer's verified neighbourhood → "Review from Sector 22 resident"
  Review score components: quality (1-5), punctuality (1-5), price_fairness (1-5)
  Aggregate: weighted average, recency bias (last 30 days weight 2×)
  Anti-fraud: max 1 review per user per business, 48h delay after service_date claim

BOOKING (lightweight):
  Business can enable booking: service_type + time_slots
  User books via in-app → WhatsApp notification to business (most Indian SMBs prefer WhatsApp)
  No payment processing at v1 — cash/UPI handled off-platform`,
        },
        {
          title: "Community Trust & Moderation",
          content: `Hyperlocal content moderation is harder than global platforms: what's appropriate to post in a gated community RWA may differ from a general neighbourhood, and local moderators understand context better than centralised ML systems.

TRUST SCORE:
  Each user has a trust_score (0–100) recomputed daily:
    base:               20 (account creation)
    +30 postal_verified: one-time on verification
    +2  per month tenure (max +24)
    +1  per upvote received on posts (max +20)
    -5  per confirmed report against user
    -20 per ban event

  Trust thresholds:
    0–30:   UNVERIFIED  (read only)
    31–49:  GPS_SOFT    (comment, react)
    50–74:  POSTAL_HARD (full access)
    75+:    TRUSTED     (alert creation, community mod powers)

MODERATION PIPELINE:
  Automated (ML first pass):
    - Text: fine-tuned BERT for hate speech, spam, personal info exposure
    - Image: AWS Rekognition NSFW + custom model for doxxing (ID cards, address photos)
    - Threshold: score > 0.85 → auto-remove; 0.6–0.85 → human queue

  Community moderation:
    - Any Trusted user can flag a post
    - 3 independent flags from Trusted users in same neighbourhood → auto-hide pending review
    - Neighbourhood moderator (elected by residents, 90-day term) → can remove + 24h temp ban

  Escalation:
    - District Trust & Safety team reviews appeals and escalations
    - Severe (illegal content, threats): immediate remove + account freeze + report to authorities

NEIGHBOURHOOD GOVERNANCE:
  RWA admins have verified owner status → can pin announcements, set community rules
  Community polls: any Trusted user can create a neighbourhood poll (max 4 options, 7-day voting)
  Annual moderator election: residents vote for 2 moderators per neighbourhood from candidates
  All governance actions are logged in an immutable audit trail (append-only Cassandra table)`,
        },
      ],
    },
  ],
};

export const DISTRICT_LLD = {
  title: "District — Low Level Design",
  subtitle: "Data models, APIs, and component internals for core District services",

  components: [
    {
      id: "locationService",
      title: "Location Service — LLD",
      description: "Address verification, neighbourhood polygon assignment, and geo-radius queries",
      api: `POST /v1/location/verify-gps
{
  "latitude": 28.4595,
  "longitude": 77.0266
}
Response 200:
{
  "verified_type": "GPS_SOFT",
  "neighbourhoods": [
    { "id": "nbh_sector22_gurgaon", "name": "Sector 22, Gurugram", "level": 2 },
    { "id": "nbh_dlf_cyber", "name": "DLF Cyber City Area", "level": 3 }
  ],
  "primary_neighbourhood_id": "nbh_sector22_gurgaon"
}

POST /v1/location/initiate-postal-verification
{
  "address_line1": "B-402, Vipul Greens",
  "address_line2": "Sector 48, Gurugram",
  "pincode": "122018",
  "state": "Haryana"
}
Response 202:
{
  "verification_id": "pv_abc123",
  "status": "POSTCARD_DISPATCHED",
  "estimated_delivery": "2026-06-14"
}

POST /v1/location/confirm-postal-otp
{ "verification_id": "pv_abc123", "otp": "384721" }
Response 200:
{ "status": "POSTAL_HARD", "neighbourhood_id": "nbh_sector22_gurgaon" }

-- Data Model --
TABLE users (
  id UUID PRIMARY KEY,
  phone VARCHAR(15) UNIQUE NOT NULL,
  display_name TEXT,
  verification_type ENUM('UNVERIFIED','GPS_SOFT','POSTAL_HARD','TRUSTED'),
  primary_neighbourhood_id UUID REFERENCES neighbourhoods(id),
  trust_score INT DEFAULT 20,
  created_at TIMESTAMPTZ,
  last_active TIMESTAMPTZ
);

TABLE neighbourhoods (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug VARCHAR(100) UNIQUE,
  level INT CHECK (level BETWEEN 1 AND 4),
  polygon GEOMETRY(POLYGON, 4326) NOT NULL,
  parent_id UUID REFERENCES neighbourhoods(id),
  resident_count INT DEFAULT 0,
  created_at TIMESTAMPTZ
);
CREATE INDEX ON neighbourhoods USING GIST(polygon);

TABLE user_neighbourhood_memberships (
  user_id UUID REFERENCES users(id),
  neighbourhood_id UUID REFERENCES neighbourhoods(id),
  is_primary BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, neighbourhood_id)
);`,
    },
    {
      id: "postService",
      title: "Post Service — LLD",
      description: "Post creation, media handling, and neighbourhood fan-out via Kafka",
      api: `POST /v1/posts
Authorization: Bearer <jwt>
{
  "type": "GENERAL_POST",
  "text": "Anyone know when the RWA meeting is?",
  "media_keys": ["s3://district-media/uploads/abc123.jpg"],
  "scope": "NEIGHBOURHOOD",
  "neighbourhood_id": "nbh_sector22_gurgaon"
}
Response 201:
{
  "post_id": "pst_20260609_xyz",
  "status": "PUBLISHED",
  "scope_description": "Visible to Sector 22, Gurugram residents",
  "created_at": "2026-06-09T10:15:00Z"
}

-- Civic Issue post type --
POST /v1/posts
{
  "type": "CIVIC_ISSUE",
  "text": "Large pothole outside Sector 22 park gate, dangerous",
  "media_keys": ["..."],
  "geo_point": { "lat": 28.4601, "lng": 77.0271 },
  "civic_category": "ROAD_POTHOLE"
}
Response 201:
{
  "post_id": "pst_civic_789",
  "civic_ticket_id": "MCG-2026-38291",  // forwarded to municipality API
  "status": "PUBLISHED_AND_REPORTED"
}

GET /v1/posts/{post_id}
GET /v1/feed?limit=25&cursor=<opaque>

POST /v1/posts/{post_id}/react   { "type": "HELPFUL" | "AGREE" | "THANKS" }
POST /v1/posts/{post_id}/comments { "text": "..." }
POST /v1/posts/{post_id}/report  { "reason": "SPAM" | "MISINFORMATION" | "INAPPROPRIATE" }

-- Data Model --
TABLE posts (
  id UUID PRIMARY KEY,
  author_id UUID REFERENCES users(id),
  type ENUM('GENERAL_POST','LOST_FOUND','FOR_SALE','CIVIC_ISSUE','EVENT','SAFETY_ALERT','RECOMMENDATION'),
  text TEXT,
  status ENUM('PENDING_MODERATION','PUBLISHED','HIDDEN','REMOVED'),
  scope ENUM('MICROLOCALITY','NEIGHBOURHOOD','SUBURB','CITY'),
  neighbourhood_id UUID REFERENCES neighbourhoods(id),
  geo_point GEOMETRY(POINT, 4326),
  engagement_score FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
CREATE INDEX ON posts(neighbourhood_id, created_at DESC);

TABLE post_media (
  id UUID PRIMARY KEY,
  post_id UUID REFERENCES posts(id),
  s3_key TEXT,
  cdn_url TEXT,
  thumbnail_url TEXT,
  media_type ENUM('IMAGE','VIDEO'),
  exif_stripped BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ
);

-- Redis feed structure --
Key:   feed:{user_id}                          (List)
Op:    LPUSH feed:{user_id} {post_id}
       LTRIM feed:{user_id} 0 999
TTL:   7 days (EXPIRE on last write)`,
    },
    {
      id: "alertService",
      title: "Alert Service — LLD",
      description: "Sub-5-second geo-radius push delivery for safety and civic alerts",
      api: `POST /v1/alerts
Authorization: Bearer <jwt>  (must be TRUSTED tier)
{
  "type": "SAFETY",
  "message": "Chain snatching reported near Sector 22 park exit. Stay alert.",
  "radius_meters": 2000,
  "severity": "HIGH"
}
Response 202:
{
  "alert_id": "alrt_20260609_abc",
  "status": "BROADCASTING",
  "estimated_recipients": 3842,
  "sla_target_seconds": 5
}

GET /v1/alerts?neighbourhood_id=nbh_sector22_gurgaon&since=2026-06-01T00:00:00Z
Response 200:
{
  "alerts": [
    {
      "alert_id": "alrt_abc",
      "type": "SAFETY",
      "message": "...",
      "radius_meters": 2000,
      "created_by": { "display_name": "Rahul S.", "trust_score": 88 },
      "recipient_count": 3842,
      "created_at": "2026-06-09T10:00:00Z"
    }
  ]
}

-- Fanout internals --
Kafka Consumer (alert.triggered):
  1. Deserialise alert event: { alert_id, lat, lng, radius_m, message, type }
  2. Redis GEORADIUS:
     GEORADIUS user_locations {lng} {lat} {radius_m} m ASC COUNT 100000
  3. Chunk user_ids into batches of 500
  4. For each batch: fetch FCM tokens from Cassandra user_devices
  5. FCM Batch Send (max 500/req):
     { registration_ids: [...], priority: "high", notification: { title, body }, data: { alert_id, type } }
  6. Handle responses:
     - success: record delivery receipt
     - invalid_registration: delete stale token from Cassandra
     - quota_exceeded: back off + retry

-- Data Model --
TABLE alerts (
  id UUID PRIMARY KEY,
  created_by UUID REFERENCES users(id),
  type ENUM('SAFETY','CIVIC','WEATHER','MISSING_PERSON'),
  severity ENUM('LOW','MEDIUM','HIGH','CRITICAL'),
  message TEXT NOT NULL,
  geo_point GEOMETRY(POINT, 4326) NOT NULL,
  radius_meters INT,
  status ENUM('BROADCASTING','DELIVERED','EXPIRED'),
  recipient_count INT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

-- Cassandra: push token store (high write, wide column) --
CREATE TABLE user_devices (
  user_id UUID,
  device_id TEXT,
  platform TEXT,        -- FCM | APNS | WEB
  push_token TEXT,
  updated_at TIMESTAMP,
  PRIMARY KEY (user_id, device_id)
);`,
    },
    {
      id: "discoveryService",
      title: "Business Discovery Service — LLD",
      description: "Geo-aware local business search, reviews, and verified listing management",
      api: `GET /v1/businesses/search?q=plumber&lat=28.4595&lng=77.0266&radius=5000&sort=rating
Response 200:
{
  "results": [
    {
      "business_id": "biz_plumber_sharma",
      "name": "Sharma Plumbing Works",
      "category": "PLUMBER",
      "verified_local": true,
      "neighbourhood": "Sector 22, Gurugram",
      "distance_meters": 420,
      "rating": { "overall": 4.7, "quality": 4.8, "punctuality": 4.6, "price": 4.7 },
      "review_count": 34,
      "available_today": true,
      "whatsapp": "91-9876543210"
    }
  ],
  "total": 12
}

POST /v1/businesses                         (register business)
{
  "name": "Sharma Plumbing Works",
  "category": "PLUMBER",
  "service_zone_neighbourhood_ids": ["nbh_sector22_gurgaon", "nbh_sector21_gurgaon"],
  "phone": "9876543210",
  "working_hours": { "mon-sat": "08:00-20:00", "sun": "closed" },
  "pricing_range": "₹300-₹800 per visit"
}

POST /v1/businesses/{business_id}/reviews
{
  "quality": 5, "punctuality": 4, "price_fairness": 5,
  "text": "Fixed my leaking pipe in 30 minutes. Highly recommend.",
  "service_date": "2026-06-07"
}

-- Elasticsearch mapping --
PUT /district_businesses/_mapping
{
  "properties": {
    "name":           { "type": "text", "analyzer": "standard" },
    "category":       { "type": "keyword" },
    "service_zones":  { "type": "keyword" },
    "geo_point":      { "type": "geo_point" },
    "verified":       { "type": "boolean" },
    "rating_overall": { "type": "float" },
    "review_count":   { "type": "integer" }
  }
}

-- Review Data Model --
TABLE business_reviews (
  id UUID PRIMARY KEY,
  business_id UUID REFERENCES businesses(id),
  reviewer_id UUID REFERENCES users(id),
  quality_score INT CHECK (quality_score BETWEEN 1 AND 5),
  punctuality_score INT CHECK (punctuality_score BETWEEN 1 AND 5),
  price_score INT CHECK (price_score BETWEEN 1 AND 5),
  overall_score FLOAT GENERATED ALWAYS AS
    ((quality_score + punctuality_score + price_score) / 3.0) STORED,
  review_text TEXT,
  service_date DATE,
  created_at TIMESTAMPTZ,
  UNIQUE (business_id, reviewer_id)  -- one review per user per business
);`,
    },
  ],
};

export const DISTRICT_QNA = [
  {
    id: "dq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Round 1",
    asked_at: ["District", "Nextdoor", "Local Social Startups"],
    question: "Design a hyperlocal social network like District. What are the core architectural challenges compared to a national social network?",
    answer: `The fundamental difference is partitioning by geography, not social graph.

NATIONAL SOCIAL NETWORK (Instagram):
  - Feed built from follow graph: user A → user B's posts
  - Fan-out based on follower lists (user IDs)
  - Content is universal — any post can go viral globally
  - CDN + consistent hash routing works well

HYPERLOCAL NETWORK (District):
  - Feed built from location: everyone in Sector 22 shares same base feed
  - Fan-out based on neighbourhood polygon membership (geo containment queries)
  - Content is locality-scoped — a post about a water cut is irrelevant 5 km away
  - Location verification is a first-class concern

KEY ARCHITECTURAL DECISIONS:

1. ADDRESS VERIFICATION (no equivalent on Instagram):
   - GPS is spoofable → soft tier only
   - Postal OTP is ground truth → full access tier
   - Trust scoring prevents abuse without requiring KYC

2. NEIGHBOURHOOD POLYGON ENGINE:
   - PostGIS for polygon containment queries
   - Hierarchy: microlocality → locality → suburb → city
   - Post scope selected at creation time → determines fan-out width

3. GEO-SHARDED DATA:
   - Users, posts, feed lists all tagged with neighbourhood_id
   - Can shard Postgres/Cassandra by geo_hash or neighbourhood_id
   - Redis geo index (GEOADD/GEORADIUS) for alert radius queries

4. ALERT DELIVERY (no equivalent on most social apps):
   - Safety alerts must reach 50K users within 5 seconds
   - FCM high-priority + APNs critical alert + SMS fallback
   - Redis GEO for sub-millisecond radius lookup before push fanout

TRAFFIC PATTERNS (different from national apps):
  - Spike at morning commute (7–9 AM) with hyperlocal commute alerts
  - Sunday evening RWA meeting posts — predictable locality-wide spikes
  - Event-driven spikes (power cut, flooding) — unpredictable, highest priority`,
  },
  {
    id: "dq2",
    category: "Feed Design",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["District", "Nextdoor", "Community Platform Interviews"],
    question: "How do you generate a hyperlocal feed for millions of users when posts are scoped to geographic polygons rather than a follow graph?",
    answer: `Two-tier approach: push fan-out for neighbourhood-level posts, pull for city-level.

TIER 1 — PUSH FAN-OUT (neighbourhood scope, < 10K recipients):
  1. Post created → Kafka event: { post_id, neighbourhood_id, scope: NEIGHBOURHOOD }
  2. Feed Consumer:
     SELECT user_id FROM user_neighbourhood_memberships
     WHERE neighbourhood_id = X AND is_active = TRUE
  3. For each user_id:
     LPUSH feed:{user_id} {post_id}
     LTRIM feed:{user_id} 0 999

  Cost: if neighbourhood has 5K users, that's 5K Redis writes — acceptable

TIER 2 — PULL (city/suburb scope, millions of recipients):
  Push fan-out to 500K users for a city-level post is expensive (500K Redis writes per post)
  Instead: materialise a shared city feed list → each user pulls from it at read time

  Shared list:
    LPUSH city_feed:{city_id} {post_id}
    LTRIM city_feed:{city_id} 0 4999

  Read path: merge personal feed (push) + city feed (pull) → deduplicate → rank

READ PATH (both tiers):
  1. Fetch post IDs: LRANGE feed:{user_id} 0 49  (personal feed)
  2. Fetch post IDs: LRANGE city_feed:{city_id} 0 49 (city feed)
  3. Merge + deduplicate
  4. Rank by: recency × engagement_score × distance_decay
     (posts from microlocality outrank posts from 4 km away)
  5. Filter: muted users, hidden categories, already-seen posts
  6. Hydrate post details (Redis cache → PostgreSQL fallback)

PAGINATION:
  Cursor = { timestamp, post_id } (avoid page-number drift as new posts arrive)
  Infinite scroll: client sends cursor on scroll → next 25 posts starting after cursor

RANKING FORMULA:
  score = (reactions × 2 + comments × 3 + shares × 5)
          / (age_hours + 2)^1.2
          × distance_decay(post_neighbourhood, user_neighbourhood)

  distance_decay:
    same microlocality → 1.0
    same locality       → 0.9
    same suburb         → 0.7
    same city           → 0.5`,
  },
  {
    id: "dq3",
    category: "Notifications",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["District", "Emergency Alert Systems", "Hyperlocal Apps"],
    question: "Design the alert delivery system. A safety alert must reach all residents within 2 km in under 5 seconds. How do you architect this?",
    answer: `This is a geo-fan-out problem with a strict latency SLA. Three layers required.

STEP 1 — GEO LOOKUP (< 100 ms):
  Redis GEO index maintained per city:
    GEOADD user_locations:{city_id} {lng} {lat} {user_id}
    — updated on each login/location refresh (TTL 48h)

  On alert creation:
    GEORADIUS user_locations:{city_id} {alert_lng} {alert_lat} 2000 m COUNT 100000
  Returns all user_ids within radius in < 100 ms (Redis GEORADIUS is O(N+log(M)))

STEP 2 — TOKEN FETCH + BATCH PUSH (< 2 s):
  user_ids → batch Cassandra read for FCM/APNs tokens
  Chunk into batches of 500 (FCM multicast limit)
  Parallel HTTP calls to FCM/APNs for each batch

  FCM request:
    POST https://fcm.googleapis.com/fcm/send
    {
      "registration_ids": ["token1", ..., "token500"],
      "priority": "high",
      "notification": { "title": "⚠️ Safety Alert — Sector 22", "body": "Chain snatching reported..." },
      "data": { "alert_id": "alrt_abc", "type": "SAFETY" }
    }

  With 10K users at 500/batch = 20 parallel FCM calls → ~300 ms per wave

STEP 3 — IN-APP (WebSocket, < 1 s):
  For users with app open, WebSocket server sends immediately:
    { type: "SAFETY_ALERT", payload: { ... } }
  WebSocket connection pool managed by sticky load balancer (user_id → server affinity)

FALLBACK — SMS (critical alerts only):
  If FCM returns device_not_registered for a user and no web socket:
    Twilio SMS sent as last resort (cost: ~₹0.25/SMS → only for CRITICAL severity)

FAILURE MODES:
  FCM throttling: back off + retry with exponential delay; alert expires after 30 min
  Redis GEO stale: user_ids without recent location → fall back to neighbourhood membership query from Postgres
  Token fetch slow: Cassandra multi-get with 200ms timeout, proceed without missing tokens

DELIVERY TRACKING:
  FCM response includes per-token success/failure
  Store in ClickHouse: alert_id, user_id, platform, sent_at, delivered_at (from FCM receipt)
  SLA dashboard: p50/p99 delivery latency per alert type`,
  },
  {
    id: "dq4",
    category: "Privacy & Trust",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["District", "Community Apps", "Privacy-First Startups"],
    question: "How do you verify that users actually live in a neighbourhood without exposing their exact home address to the public or even to other users?",
    answer: `Privacy-preserving address verification is a core trust mechanic.

THE CORE TENSION:
  - Platform needs strong proof of address to prevent fake accounts and spam
  - Users must not expose their home address — that's a safety risk
  - Other users/businesses should see "resident of Sector 22" not "B-402, Vipul Greens"

THREE VERIFICATION METHODS:

1. GPS polygon check (soft, no privacy risk):
   - Device sends GPS coordinates
   - Backend does PostGIS polygon containment check
   - Never stored permanently; result is just neighbourhood_id membership
   - Privacy: latitude/longitude of a 1 sq km locality tells an adversary nothing useful

2. Postal OTP (strong, privacy-preserving implementation):
   - User enters address → stored encrypted at rest (AES-256, KMS-managed key)
   - Physical postcard sent with OTP → user enters OTP → address_verified = TRUE
   - Address record is then HASHED (SHA-256 + salt) → stored only as hash for deduplication
   - Raw address purged after hash is stored — no one (not even District employees) can retrieve it
   - Profile shows only: "Verified resident of Sector 22, Gurugram" (neighbourhood name, not address)

3. Telecom carrier API:
   - Carrier confirms phone number billing address matches claimed locality
   - District receives "address_in_locality: TRUE/FALSE" — never the actual address

PUBLIC PROFILE VISIBILITY:
  Profile shows:       "Sector 22 resident since Jan 2026"
  Never shown:         street address, building name, flat number
  Even moderators see: neighbourhood + verification tier, not address
  Exception: user chooses to self-disclose address in a post (their choice, their risk)

DATA HANDLING:
  GDPR/DPDP compliance: user can request address data deletion → postal address hash deleted,
  neighbourhood membership retained (neighbourhood is not PII)
  Audit log: who accessed verification data, when — append-only Cassandra log`,
  },
  {
    id: "dq5",
    category: "Scalability",
    difficulty: "Hard",
    round: "Senior Level Deep Dive",
    asked_at: ["District", "Nextdoor", "Scaling Hyperlocal Apps"],
    question: "How do you scale the feed fan-out when a neighbourhood suddenly spikes — e.g., a major civic incident triggers 100K posts and reactions in one hour?",
    answer: `Three problems compound: write amplification, Kafka lag, and Redis memory pressure.

SCENARIO: Major flooding in a locality → 100K posts + reactions in 1 hour in same neighbourhood.

PROBLEM 1 — WRITE AMPLIFICATION:
  If neighbourhood has 50K users, each of 100K posts triggers 50K Redis writes
  = 5 billion Redis writes in an hour → LPUSH queue depth explodes

MITIGATIONS:
  A) Supernode threshold: if neighbourhood exceeds 25K active users in last 1h,
     switch to pull model automatically:
       - Posts written to shared_neighbourhood_feed:{nbh_id} instead
       - Users pull from shared list at read time (no per-user fan-out)
       - Redis memory: 1 list × 1000 entries × 8 bytes = 8 KB vs 25K × 8 KB = 200 MB

  B) Debounce high-frequency actors: if user > 5 posts/hour, fan-out is delayed 60s
     (most flood updates from same user → batch into one fan-out)

  C) Engagement-gate: if post gets < 2 reactions in 10 min, skip fan-out to dormant users
     (users who haven't opened app in 7 days don't need real-time feed update)

PROBLEM 2 — KAFKA LAG:
  Normal: feed-fanout consumer processes 1K events/sec
  Spike: 100K events/sec → consumer lag builds up

  Scaling: auto-scale consumer group (Kubernetes HPA on consumer_lag metric)
  Partition key = neighbourhood_id → fan-out for same neighbourhood stays ordered
  Circuit breaker: if lag > 60s, switch neighbourhood to pull model immediately

PROBLEM 3 — REDIS MEMORY:
  Each active user feed = 1000 post IDs × 8 bytes = 8 KB
  5M active users = 40 GB Redis memory (manageable with cluster)

  Optimisations:
    - LTRIM to 200 (not 1000) during spikes — users rarely scroll past 200 posts
    - Evict feed lists for users inactive > 7 days (EXPIRE 7d, rebuild on next login)
    - Use Redis Cluster with neighbourhood-based key distribution

LOAD SHEDDING:
  If Kafka lag > 5 min: temporarily drop fan-out for engagement events (reactions, view counts)
    → only fan-out new posts + safety alerts
  Resume engagement fan-out when lag < 30s
  Users won't notice reaction counts are briefly stale; they will notice missing posts`,
  },
];
