export const NETFLIX_HLD = {
  title: "Netflix — High Level Design",
  subtitle: "How 300M users stream 15% of global internet traffic",
  overview: `Netflix operates on two clouds: AWS (all backend logic) and Open Connect (custom global CDN).
The core insight — AWS handles control, Open Connect handles video bytes. They never mix.`,

  diagram: `
┌──────────────────────────────────────────────────────────────────┐
│                          CLIENT (any device)                     │
│           TV · Mobile · Web · Console · Streaming Stick          │
└──────────────────────────┬───────────────────────────────────────┘
                           │  API calls (auth, metadata, manifest)
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                        AWS CLOUD (Brain)                         │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │  Zuul    │  │   Auth   │  │ Playback │  │ Recommendation │  │
│  │ Gateway  │  │ Service  │  │ Service  │  │    Engine      │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │ Billing  │  │   DRM    │  │ Metadata │  │  Data Pipeline │  │
│  │ Service  │  │ License  │  │ Service  │  │  Kafka+Spark   │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘  │
│                                                                  │
│              Cassandra · S3 · EVCache · MySQL                    │
└──────────────────────────┬───────────────────────────────────────┘
                           │  "Fetch video from OCA-BLR-3"
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    OPEN CONNECT CDN (Muscle)                     │
│                                                                  │
│   [OCA Mumbai]   [OCA Bengaluru]   [OCA Delhi]   [OCA NY]       │
│   [OCA London]   [OCA Singapore]   [OCA Tokyo]   [OCA LA]       │
│                                                                  │
│        6,000+ locations · Inside ISPs · 100 Gbps each           │
└──────────────────────────────────────────────────────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "The Big Picture",
      sections: [
        {
          title: "How Netflix Works — Press Play to Pixel",
          content: `Every video request travels through two distinct zones:

1. BEFORE Play → AWS handles everything
   • App opens → API Gateway (Zuul) authenticates session
   • Homepage fetched — personalized per user via ML
   • Every scroll, hover, click logged for recommendations

2. HITTING PLAY — Two parallel tracks:
   • Control plane (AWS): Auth → DRM license → OCA selection → Manifest
   • Manifest contains: OCA server URL, all chunk URLs, quality levels, DRM endpoint

3. AFTER Play → Open Connect takes over
   • Client connects directly to nearest OCA (inside your ISP)
   • AWS is OUT of the video path entirely
   • ABR (Adaptive Bitrate) adjusts quality every few seconds

4. WHILE WATCHING
   • Client pre-buffers 15–30 seconds ahead
   • Sends telemetry (rebuffer rate, bitrate, startup time) to AWS
   • DRM keys refreshed silently in background

5. STOP WATCHING
   • Position saved to Cassandra
   • Resumes on any device next session`,
        },
        {
          title: "The Two Clouds — Why Separate?",
          content: `AWS = Brain (logic, auth, billing, ML)
Open Connect = Muscle (raw video bytes at petabit scale)

Why separation is critical:
• 300M users × 10 Mbps avg = 3 Petabits/sec of video
• Routing ALL of that through AWS would collapse the network
• AWS egress costs at that volume = billions/year

Open Connect insight — OCA servers sit INSIDE ISPs:
• Video bytes never leave the ISP's network
• Near-zero latency for video start
• ISP saves backbone bandwidth costs too → mutual benefit
• Netflix provides hardware free; ISP provides rack space + power`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Core Architecture",
      sections: [
        {
          title: "Microservices Architecture",
          content: `Netflix runs 1000+ loosely coupled microservices on AWS.

Why microservices (moved from monolith ~2008–2016):
• Failure isolation — one service fails, rest keep running
• Independent deploy — 100s of deploys per day
• Technology freedom — each team picks their stack
• Horizontal scaling — scale only what's under load

Key services:
• Zuul — API Gateway: routing, auth, rate limiting, A/B traffic split
• Eureka — Service Discovery: services register themselves, find each other
• Ribbon — Client-side load balancing: smart routing to healthy instances
• Hystrix — Circuit breaker: if service fails, return fallback, stop cascading`,
        },
        {
          title: "API Gateway — Zuul",
          content: `Zuul is Netflix's edge service — every client request enters through it.

Responsibilities:
• Authentication — validate session token before any request gets through
• Rate limiting — protect downstream services from traffic spikes
• Routing — direct /api/v1/titles → Title Service, /api/v1/play → Playback Service
• A/B testing — route 5% of users to experimental service version
• SSL termination — decrypt HTTPS at edge, internal calls use HTTP
• Request logging — every request logged for debugging + analytics

Scale: Handles all traffic from 300M users across 190 countries`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Video Pipeline",
      sections: [
        {
          title: "Content Ingestion & Transcoding",
          content: `Before any title is watchable, it goes through Netflix's encoding pipeline:

1. INGEST — Studios upload raw footage to AWS S3
   • Raw files: 100s of GB per title, often ProRes or RAW format

2. TRANSCODING — Convert to 1200+ format variations
   • Resolutions: 240p, 360p, 480p, 720p, 1080p, 4K
   • Codecs: H.264, H.265/HEVC, AV1, VP9
   • HDR: HDR10, Dolby Vision, HLG
   • Audio: Stereo, 5.1, 7.1, Dolby Atmos
   • Subtitles + Audio tracks for every language

3. CHUNKING — Split into 4–10 second segments
   • Enables ABR — client can switch quality at chunk boundary
   • Enables seeking — jump to any chunk directly
   • Enables parallel download — prefetch multiple chunks

4. AI ENCODING (2025) — AV1 + film grain synthesis
   • 20–30% bandwidth saving vs previous pipeline
   • AI reconstructs film grain post-decode (not encoded)
   • Perceptual quality preserved at lower bitrate`,
        },
        {
          title: "Adaptive Bitrate Streaming (ABR)",
          content: `ABR is why Netflix never shows a spinner on good connections.

How it works:
• Client monitors download speed of each chunk
• Maintains a bandwidth estimator (moving average)
• Before requesting next chunk, predicts safe quality level

Example:
  Network good  → [4K] → [4K] → [4K]
  Network dips  → [4K] → [720p] → [1080p]
  Buffer drains → drop to 480p → recover fast → ramp back up

Buffer zones:
• Panic zone (< 5s buffer)  → drop to lowest quality
• Steady zone (5–30s)       → maintain current quality
• Greedy zone (> 30s)       → opportunistically upgrade

Netflix KPI: rebuffer rate — % of playback time spent buffering
Target: < 0.1% rebuffer rate globally`,
        },
        {
          title: "Open Connect CDN — OCA Architecture",
          content: `OCA = Open Connect Appliance — Netflix's custom video server hardware.

Hardware spec per OCA:
• Storage: 100s TB SSD + HDD (cached video files)
• Network: 100 Gbps NIC
• CPU: Minimal — just serves files, no compute
• OS: Custom FreeBSD, optimized for sequential file reads

3 tiers of OCA placement:
• Tier 1 — Internet Exchange Points (IXPs): serves multiple ISPs
• Tier 2 — Inside large ISPs (Jio, Airtel, Comcast): lowest latency
• Tier 3 — Netflix PoPs: backup when ISP OCAs overloaded

Nightly fill process:
• AWS S3 (master) → fill algorithm → push to OCAs globally
• Algorithm inputs: historical viewing by region, upcoming releases,
  trailer view counts, search spikes, OCA storage capacity
• Popular titles → every OCA worldwide
• Regional titles → regional OCAs only
• Niche/old → hub OCAs or S3 fallback only`,
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
          content: `Netflix uses purpose-built storage for each data type:

CASSANDRA — User data, viewing history, event metrics
• Wide-column NoSQL, no single point of failure
• Cross-region replication — active-active globally
• Viewing history split:
  LiveVH — recent history, uncompressed, frequent reads/writes
  CompressedVH — older records, single compressed column per user

S3 — Video master files + encoded chunks
• Object storage, unlimited scale
• Source of truth for all video content

EVCache — Distributed cache layer (Memcached-based)
• Caches session data, user preferences, title metadata
• Sub-millisecond reads — never hits DB for hot data

MySQL — Billing, subscriptions, user accounts
• ACID compliance needed for financial transactions
• Sharded and replicated across regions`,
        },
        {
          title: "Kafka — 500B Events/Day",
          content: `Kafka is Netflix's data nervous system — everything flows through it.

What gets published to Kafka:
• UI events (clicks, hovers, scrolls, searches)
• Playback events (play, pause, seek, quality changes)
• Error logs from every microservice
• Performance metrics (CPU, memory, latency)
• Business events (signup, cancel, billing)

Scale:
• 500 billion events per day
• 8 million events per second at peak (prime time)
• 1.3 petabytes consumed per day

Downstream consumers:
• Apache Spark — batch ML training jobs
• Flink — real-time stream processing
• Elasticsearch — log search and debugging
• Data warehouse — long-term analytics`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "Personalization & ML",
      sections: [
        {
          title: "Recommendation Engine",
          content: `Netflix's homepage looks different for every user — driven by ML.

Two core algorithms:
1. Collaborative Filtering
   • "Users like you also watched X"
   • Matrix factorization on user-item interaction matrix
   • Identifies latent taste clusters

2. Content-Based Filtering
   • "Because you watched Stranger Things (sci-fi, mystery, 80s)"
   • Tag/embedding similarity between titles
   • Works for new users with sparse history

Infrastructure:
• Apache Spark on AWS — batch model training on full history
• Models retrained daily on 500B events
• Served via low-latency serving layer (sub-50ms at query time)

Artwork Personalization:
• Different thumbnail shown per user based on watch history
• Action fan sees action scene; romance fan sees romance scene
• Same title, different artwork → improves click-through rate`,
        },
        {
          title: "A/B Testing at Scale",
          content: `Netflix runs 100s of A/B tests simultaneously.

How it works:
• Users bucketed into test/control groups at signup (sticky assignment)
• Feature flag service reads bucket → serves correct experience
• Metrics collected per bucket: engagement, rebuffer, cancellation rate

Test examples:
• UI layout changes (where is the search bar?)
• Recommendation algorithm variants
• Thumbnail artwork per title
• Autoplay delay duration
• Download quality defaults

Guardrails:
• Tests run minimum 2 weeks (account for weekly viewing cycles)
• Statistical significance threshold before shipping
• Rollback on any negative signal to core metrics`,
        },
      ],
    },
    {
      id: "phase6",
      label: "Phase 6",
      title: "Reliability",
      sections: [
        {
          title: "Chaos Engineering — Simian Army",
          content: `Netflix deliberately breaks their own systems to find weaknesses before users do.

The Simian Army:
• Chaos Monkey — randomly kills production service instances
• Latency Monkey — injects artificial network delays
• Conformity Monkey — shuts down instances that violate best practices
• Chaos Gorilla — simulates failure of an entire AWS Availability Zone
• Chaos Kong — simulates failure of an entire AWS Region

Philosophy: "Break things on purpose in a controlled way, so you're
ready when they break on their own in an uncontrolled way."

Result: Netflix can survive an entire AWS region failure with no user impact.`,
        },
        {
          title: "Hystrix — Circuit Breaker Pattern",
          content: `Circuit breaking prevents one failing service from cascading failures.

States:
• CLOSED (normal) — requests flow through, failures counted
• OPEN (tripped) — requests blocked, fallback returned immediately
• HALF-OPEN (testing) — let one request through, check if service recovered

Netflix fallback examples:
• Recommendation fails → serve generic popular titles instead
• Search fails → show trending titles
• Personalization fails → show default homepage layout
• Never: show an error screen when a fallback exists

Bulkhead Pattern (Complementary):
• Isolate thread pools per service
• One slow service can't exhaust threads for all services
• Critical path (Play button) gets dedicated threads`,
        },
      ],
    },
  ],

  metrics: [
    { label: "Subscribers", value: "300M+", note: "across 190 countries" },
    { label: "Peak bandwidth", value: "~15%", note: "of global internet traffic" },
    { label: "Video formats per title", value: "1,200+", note: "resolutions × codecs × audio" },
    { label: "Events/day", value: "500B", note: "through Kafka" },
    { label: "Peak events/sec", value: "8M", note: "during prime time" },
    { label: "OCA locations", value: "6,000+", note: "globally, inside ISPs" },
    { label: "Microservices", value: "1,000+", note: "on AWS" },
    { label: "% video from OCA", value: "~95%", note: "AWS only for control plane" },
  ],
};

export const NETFLIX_LLD = {
  title: "Netflix — Low Level Design",
  subtitle: "Data models, APIs, and component-level design decisions",

  components: [
    {
      id: "playback",
      title: "Playback Service — LLD",
      description: "Selects optimal OCA for a given user + title + device",
      api: `POST /api/v2/playback
Request:
{
  "userId": "u_12345",
  "titleId": "t_stranger_things_s5e1",
  "deviceId": "d_samsung_tv_2023",
  "deviceCapabilities": {
    "maxResolution": "4K",
    "codecs": ["H.264", "H.265", "AV1"],
    "drm": "Widevine-L1",
    "audioFormats": ["Dolby_Atmos", "5.1", "Stereo"]
  },
  "clientIp": "49.36.X.X"
}

Response:
{
  "manifestUrl": "https://oca-bng-jio-3.netflix.com/manifest/...",
  "drmLicenseUrl": "https://license.netflix.com/widevine",
  "expiresAt": "2026-04-21T21:00:00Z",
  "chunks": [
    {
      "index": 1,
      "duration": 4,
      "qualities": {
        "4K_AV1": "https://oca-bng-jio-3.netflix.com/chunks/t123/4k/1.mp4",
        "1080p_H265": "https://oca-bng-jio-3.netflix.com/chunks/t123/1080/1.mp4",
        "720p_H264": "https://oca-bng-jio-3.netflix.com/chunks/t123/720/1.mp4"
      }
    }
  ],
  "audioTracks": [{"lang": "en", "format": "Dolby_Atmos"}, {"lang": "hi", "format": "5.1"}],
  "subtitleTracks": ["en", "hi", "ta", "te"]
}`,
      internals: `OCA Selection Algorithm:

1. Geo-lookup: clientIp → city (Bengaluru, KA, India)

2. Query OCA health map (updated every 5s):
   SELECT ocas WHERE
     title_id IN cached_titles
     AND geo_region = 'KA-IN'
     AND load_pct < 80
     AND status = 'healthy'
   ORDER BY latency_to_region ASC, load_pct ASC
   LIMIT 3

3. Score = (1/latency_ms) * (1 - load_pct) * cache_hit_bonus

4. Return top OCA; fallback chain:
   local OCA → regional OCA → hub OCA → S3 direct`,
    },
    {
      id: "viewingHistory",
      title: "Viewing History — Data Model",
      description: "LiveVH + CompressedVH split for optimal read/write performance",
      api: `Cassandra Schema — LiveVH (recent, hot data):

CREATE TABLE live_viewing_history (
  user_id     UUID,
  watched_at  TIMESTAMP,
  title_id    UUID,
  profile_id  UUID,
  position_ms BIGINT,       -- resume position
  duration_ms BIGINT,       -- total title duration
  completed   BOOLEAN,
  device_type TEXT,
  PRIMARY KEY (user_id, watched_at)
) WITH CLUSTERING ORDER BY (watched_at DESC)
  AND default_time_to_live = 7776000; -- 90 days TTL

Cassandra Schema — CompressedVH (historical):

CREATE TABLE compressed_viewing_history (
  user_id      UUID,
  year_month   TEXT,         -- partition by month
  history_blob BLOB,         -- compressed JSON of all watches that month
  PRIMARY KEY (user_id, year_month)
);`,
      internals: `Read path:
GET /api/v1/users/{userId}/history

1. Check EVCache → if HIT return cached result
2. Query LiveVH (last 90 days) from Cassandra
3. If full history requested: decompress CompressedVH blobs
4. Merge, sort by watched_at DESC
5. Write merged result back to EVCache (TTL: 10min)

Write path (after watching):
1. Write to Kafka topic: viewing-events
2. Consumer writes to LiveVH immediately
3. Nightly job: compact LiveVH > 90 days → CompressedVH
4. Invalidate EVCache entry for user`,
    },
    {
      id: "ocaHealth",
      title: "OCA Health Map — Design",
      description: "Real-time global map of every OCA's health, load, and cached content",
      api: `OCA Health Record (stored in Redis + EVCache):

{
  "oca_id": "oca-bng-jio-3",
  "region": "KA-IN",
  "isp": "Reliance-Jio",
  "tier": 2,
  "status": "healthy",               // healthy | degraded | down
  "load_pct": 45,
  "network_gbps": 67.3,              // current throughput
  "capacity_gbps": 100,
  "cached_titles": ["t_001", "t_002", ...],  // bloom filter in practice
  "storage_used_tb": 87.4,
  "storage_total_tb": 120,
  "latency_ms": {
    "KA-IN": 3,
    "TN-IN": 8,
    "MH-IN": 18
  },
  "last_heartbeat": "2026-04-21T15:00:00Z",
  "updated_at": "2026-04-21T15:00:05Z"
}`,
      internals: `Update mechanism:
• Each OCA sends heartbeat every 5 seconds to AWS collector
• Collector writes to Redis (TTL: 30s — auto-expires dead OCAs)
• Playback service reads from Redis at query time
• EVCache layer reduces Redis load for repeated queries

Bloom filter for cached_titles:
• Storing full title list per OCA is too large (millions of titles)
• Bloom filter: O(1) lookup "is title X cached on this OCA?"
• False positive rate < 0.1% (OCA cache miss handled by fallback)
• Size: ~10MB per OCA for 500K titles`,
    },
    {
      id: "drmFlow",
      title: "DRM License Flow — LLD",
      description: "Device-bound decryption key issuance with subscription validation",
      api: `POST /license/widevine
Request (from client):
{
  "userId": "u_12345",
  "deviceId": "d_samsung_tv_2023",
  "deviceFingerprint": "hw_fingerprint_sha256_...",
  "titleId": "t_stranger_things_s5e1",
  "licenseRequest": "<Widevine PSSH blob>"
}

Response:
{
  "license": "<encrypted Widevine license>",
  "expiresAt": "2026-04-22T03:00:00Z",  // 12h TTL
  "offlineExpiry": null,                  // null = streaming only
  "allowedDevices": 1                     // bound to this device only
}`,
      internals: `License issuance steps:

1. Validate session token → userId is authenticated
2. Check subscription service → active plan in this region?
3. Check geo-rights service → title licensed in user's country?
4. Check device trust level:
   Widevine L1 (hardware) → allow 4K, HDR, Dolby Vision
   Widevine L3 (software) → cap at 1080p
   Rooted/modified device → cap at 720p or reject
5. Generate content key encrypted with device's hardware ID
6. Log license issuance to audit trail (compliance requirement)
7. Return signed license — valid only on that device hardware

Key rotation:
• Streaming licenses: 12h expiry, auto-renewed during playback
• Download licenses: 30 day expiry, 48h once playback starts
• Cancellation: batch revocation job kills all licenses within 1h`,
    },
    {
      id: "kafka",
      title: "Event Pipeline — Kafka Design",
      description: "500B events/day at 8M events/sec peak throughput",
      api: `Topic Design:

viewing-events          → partitioned by userId (ordering per user)
playback-quality        → partitioned by deviceId
ui-interactions         → partitioned by sessionId
service-errors          → partitioned by serviceId
billing-events          → partitioned by userId (exactly-once semantics)

Event Schema (viewing-events):
{
  "eventId": "ev_uuid_v4",
  "eventType": "PLAYBACK_STARTED | PLAYBACK_PAUSED | QUALITY_CHANGED | BUFFERING",
  "userId": "u_12345",
  "sessionId": "sess_abc",
  "titleId": "t_001",
  "timestamp": "2026-04-21T20:00:00.123Z",
  "payload": {
    "positionMs": 245000,
    "qualityLevel": "4K",
    "bitrateKbps": 24000,
    "bufferLevelMs": 22000,
    "ocaId": "oca-bng-jio-3"
  }
}`,
      internals: `Partitioning strategy:
• viewingEvents by userId → guarantees event order per user
• 1200 partitions on viewing-events topic
• Each partition = 1 Kafka consumer in Spark Streaming job

Consumer groups:
• spark-ml-trainer       → batch, reads last 24h for model training
• flink-realtime         → streaming, detects quality degradation in real-time
• cassandra-writer       → writes viewing history to LiveVH
• anomaly-detector       → triggers OCA health alerts

Retention:
• Hot topics (viewing-events): 7 days
• Billing topics: 90 days (compliance)
• Error topics: 30 days`,
    },
    {
      id: "recommendations",
      title: "Recommendation Engine — LLD",
      description: "Collaborative filtering + content-based filtering on Spark",
      api: `GET /api/v1/recommendations/{userId}?context=home&limit=20&profileId={profileId}

Response:
{
  "userId": "u_12345",
  "profileId": "p_001",
  "rows": [
    {
      "rowTitle": "Continue Watching",
      "algorithm": "resume_watching",
      "titles": [{ "titleId": "t_001", "positionMs": 2400000, "thumbnailVariant": "action" }]
    },
    {
      "rowTitle": "Because you watched Stranger Things",
      "algorithm": "item_item_cf",
      "seedTitleId": "t_stranger_things",
      "titles": [{ "titleId": "t_dark", "score": 0.94 }, ...]
    },
    {
      "rowTitle": "Top Picks for You",
      "algorithm": "user_item_cf",
      "titles": [...]
    }
  ]
}`,
      internals: `Model pipeline (runs daily on Spark):

1. Load interaction matrix from Cassandra
   rows = users, cols = titles, values = implicit feedback score
   score = watch% * recency_weight * explicit_rating

2. ALS (Alternating Least Squares) matrix factorization
   Decompose: R ≈ U × V^T
   U = user embeddings (300M × 200 latent factors)
   V = title embeddings (50K × 200 latent factors)

3. For each user: top-K titles = argmax(U_user · V^T)
   Approximate nearest neighbor search (FAISS index)

4. Post-filters:
   - Remove already watched (completed)
   - Apply country licensing filter
   - Apply parental control filter
   - Diversity injection (prevent genre echo chamber)

5. Write ranked list to EVCache per user (TTL: 1h)
6. Homepage fetch reads from EVCache → sub-10ms response`,
    },
  ],
};

export const NETFLIX_QNA = [
  // ─── ROUND 1: SYSTEM DESIGN SCREEN ───────────────────────────────────────
  {
    id: "q1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Netflix", "Meta", "Amazon"],
    question: "Design Netflix at a high level. Where would you start?",
    answer: `Start with clarifying questions first:
• Scale: 300M users, 190 countries, 15% of global internet traffic
• Core features: Browse, Search, Play, Download, Resume
• Non-functional: < 200ms startup, no rebuffering on stable 4G, 99.99% uptime

Then split the system into two planes:

CONTROL PLANE (AWS):
• API Gateway (Zuul) — auth, routing, rate limiting
• Auth Service — session validation, subscription check
• Playback Service — selects the best CDN node for the user
• DRM Service — issues device-bound decryption keys
• Metadata Service — title info, thumbnails, availability by region
• Recommendation Engine — personalized homepage rows

DATA PLANE (Open Connect CDN):
• 6,000+ OCA servers placed inside ISPs globally
• Serves all video bytes — no video ever flows through AWS
• Pre-loaded nightly with content predicted popular in each region

The key design insight to state upfront:
"AWS handles logic. Open Connect handles bytes. Mixing them doesn't scale."

Why this split wins:
• 300M × 10 Mbps = 3 Petabits/sec. AWS can't absorb that.
• OCA inside ISPs = video bytes never cross the public internet backbone
• ISP pays no transit costs → mutual incentive to host OCA hardware`,
    followups: [
      "How does the client know which OCA server to talk to?",
      "What happens if the nearest OCA doesn't have the requested title?",
      "How do you handle a complete AWS region failure?",
    ],
  },
  {
    id: "q2",
    category: "CDN & Streaming",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Netflix", "Google", "Apple"],
    question: "Design the video streaming pipeline — from the user clicking Play to the first frame appearing.",
    answer: `Full flow in two phases:

PHASE 1 — Control (AWS, ~100-300ms):
1. Client POSTs to /api/v2/playback with userId, titleId, deviceId, capabilities
2. Auth Service: valid session? active subscription? ✓
3. Geo-rights Service: title licensed in user's country? ✓
4. DRM Service: generate content key encrypted with device hardware fingerprint
5. OCA Selection (Playback Service):
   a. Geo-lookup from client IP → city
   b. Query OCA health map (Redis, updated every 5s):
      - Has this title cached?
      - Load < 80%?
      - Closest by latency?
   c. Score = (1/latency) × (1 - load) → pick winner
6. Return manifest: OCA URL + chunk map + quality levels + DRM license URL

PHASE 2 — Streaming (Open Connect, ongoing):
1. Client fetches DRM license from license server (device-bound, 12h TTL)
2. Client connects directly to selected OCA — AWS is now OUT of path
3. ABR selects starting quality based on current bandwidth estimate
4. Requests chunk 1 → decrypts in hardware → renders frame 1
5. Simultaneously pre-buffers chunks 2,3,4... (15-30s ahead)
6. Every 2-4s: re-estimates bandwidth → adjusts quality up/down
7. Telemetry events sent back to AWS every few seconds

Startup latency optimizations:
• Manifest cached in EVCache — no DB hit on popular titles
• DRM license can be pre-fetched before user hits Play (prefetch on hover)
• OCA returns first chunk in < 50ms (sitting inside user's ISP)
• ABR starts at medium quality, ramps up — avoids buffering on first load`,
    followups: [
      "What is in the manifest file specifically?",
      "How does ABR decide when to switch quality levels?",
      "What happens if the OCA goes down mid-stream?",
    ],
  },
  {
    id: "q3",
    category: "Database Design",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["Netflix", "Uber", "LinkedIn"],
    question: "Design the data model for Netflix's viewing history. How do you handle 300M users with years of history?",
    answer: `The problem: naive approach — one row per watch event — creates massive read amplification for a user with years of history.

Netflix's actual solution: LiveVH + CompressedVH split

LiveVH (Cassandra) — recent 90 days, hot path:
  Partition key: user_id
  Clustering key: watched_at DESC (newest first)
  Columns: title_id, profile_id, position_ms, duration_ms, completed, device_type
  TTL: 90 days (auto-expire)
  Read: O(1) for resume position, O(N) for recent history

CompressedVH (Cassandra) — older than 90 days:
  Partition key: user_id
  Clustering key: year_month
  Columns: history_blob (compressed JSON of all watches that month)
  One row per user per month = massive space savings
  Rarely read (only "full history" page or ML training)

Why Cassandra:
• No single point of failure — rings, replication factor 3
• Active-active multi-region — write anywhere, read anywhere
• Linear horizontal scale — add nodes, capacity grows
• Wide-column model — user_id as partition key means one user's data stays on same node

Cache layer (EVCache):
• Resume position cached per user per title (TTL: 10 min)
• 95% of "where did I leave off?" hits cache, never reaches Cassandra

Write path:
1. Watch event → Kafka topic viewing-events
2. Consumer writes to LiveVH (async, within ~1 second)
3. Nightly compaction job: moves LiveVH > 90 days → CompressedVH
4. Invalidate EVCache entry for that user`,
    followups: [
      "How do you handle a user watching the same title across multiple devices simultaneously?",
      "How do you design the resume feature to work across devices instantly?",
      "What happens during a Cassandra node failure?",
    ],
  },
  {
    id: "q4",
    category: "Fault Tolerance",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Netflix", "Amazon", "Microsoft"],
    question: "How would you design Netflix to survive a complete AWS region failure?",
    answer: `Netflix's answer: Active-Active multi-region deployment.

Core principle: No region is primary. Any region can serve all traffic.

Architecture:

1. THREE AWS REGIONS (us-east-1, eu-west-1, ap-southeast-1):
   • Every microservice deployed in all 3 regions simultaneously
   • Each region fully capable of serving global traffic
   • No region is "standby" — all are live

2. DATA REPLICATION:
   • Cassandra: active-active replication across regions (QUORUM writes)
   • EVCache: region-local (stale on failover, acceptable — it's a cache)
   • Kafka: cross-region mirroring for critical topics (billing, auth)
   • S3: cross-region replication for master video files

3. TRAFFIC ROUTING (Route 53 + custom health checks):
   • DNS-based geo-routing: users normally go to nearest region
   • Health check every 10s per region
   • On region failure: DNS TTL of 60s → traffic drains to other regions
   • Client retry logic handles the 60s gap

4. OPEN CONNECT INDEPENDENCE:
   • OCAs never depended on AWS for video delivery
   • Even during full AWS outage, users already watching continue uninterrupted
   • Only new Play requests fail (control plane is down)
   • Pre-buffered content plays from local OCA

5. CHAOS GORILLA TESTING:
   • Netflix regularly simulates full region failure in production
   • Ensures runbook actually works — not just theoretically

Recovery time: < 5 minutes for traffic reroute via DNS
Zero data loss: Cassandra QUORUM writes ensure at least 2/3 regions confirmed before ack`,
    followups: [
      "What is the tradeoff between QUORUM vs EVENTUAL consistency for viewing history?",
      "How do you prevent split-brain during a network partition?",
      "What gets degraded vs what stays fully functional during a region failure?",
    ],
  },
  {
    id: "q5",
    category: "Scale & Performance",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Netflix", "Google", "Meta"],
    question: "A new season of a top show drops Friday midnight. 50M users hit Play in the first minute. How does Netflix handle this?",
    answer: `This is a thundering herd problem. Netflix solves it at every layer:

LAYER 1 — Pre-positioning (days before release):
• Content calendar: Netflix knows release date weeks ahead
• 48h before: Fill algorithm calculates per-region demand from:
  - Trailer view counts by city
  - Search query spikes for the title
  - "Remind Me" button clicks
  - Historical data for similar shows
• Content pushed to OCAs globally during off-peak (3am local)
• By midnight Friday: content already sitting on OCA inside every major ISP

LAYER 2 — Control plane (AWS) at Play spike:
• Playback Service is stateless + horizontally scaled
• Auto-scaling group pre-warmed before release (Netflix uses scheduled scaling)
• Manifest is cacheable — 50M identical manifest requests hit EVCache, not DB
• DRM license generation is the only per-user unique computation

LAYER 3 — Database protection:
• Title metadata served from EVCache (TTL: 5min) — DB not touched
• OCA health map in Redis — pre-computed, not re-queried per request
• Rate limiting at Zuul: 1000 req/sec per client IP — bot protection

LAYER 4 — OCA at streaming spike:
• Each OCA: 100 Gbps capacity
• Load balancer in Playback Service distributes across multiple OCAs
• If one OCA > 80% load → next best OCA selected
• OCA health map updated every 5s — overloaded OCAs deprioritized fast

LAYER 5 — Client-side:
• Staggered retry with jitter — if manifest fetch fails, retry at T + random(0, 3s)
• Prevents synchronized retry storm (all 50M retrying at same millisecond)

Result: Release spike looks like a gradual ramp to the system because:
1. Video bytes were already cached on OCAs before midnight
2. Manifest responses come from cache — no DB hotspot
3. Load distributed across thousands of OCAs worldwide`,
    followups: [
      "What if a title becomes unexpectedly viral (not on the content calendar)?",
      "How does Netflix handle cache eviction when a new popular title displaces old content?",
      "Design the fill algorithm — how do you decide what % of OCA storage per title?",
    ],
  },
  {
    id: "q6",
    category: "Recommendations",
    difficulty: "Medium",
    round: "Onsite — ML System Design",
    asked_at: ["Netflix", "Spotify", "YouTube"],
    question: "Design Netflix's recommendation system. How does the homepage get personalized for 300M users?",
    answer: `Two-phase design: Offline training + Online serving

OFFLINE PHASE (Apache Spark, runs daily):

1. Build interaction matrix from Cassandra:
   rows = users, cols = titles
   value = implicit feedback score:
   score = watch_percentage × recency_weight × explicit_rating_bonus

2. ALS (Alternating Least Squares) matrix factorization:
   Decompose R ≈ U × V^T
   U = user embeddings (300M users × 200 latent factors)
   V = title embeddings (50K titles × 200 latent factors)
   Latent factors capture taste dimensions (genre, tone, pacing, etc.)

3. For each user: compute top-K candidates:
   scores = U[user] · V^T (dot product with all titles)
   Use FAISS approximate nearest neighbor — O(log N) not O(N)

4. Post-filter candidates:
   • Remove completed watches
   • Apply geo-rights filter (title available in user's country?)
   • Apply parental controls
   • Diversity injection (no more than 3 titles of same genre in a row)

5. Write ranked list to EVCache per user (TTL: 1h)

ONLINE PHASE (at homepage load, < 50ms budget):

1. Read EVCache for userId → pre-computed ranked list hits
2. Assemble homepage rows:
   • "Continue Watching" → query LiveVH for in-progress titles
   • "Because you watched X" → item-item CF from seed title
   • "Top Picks" → top of pre-computed ALS list
   • "Trending in [Country]" → global popularity score for region
3. Artwork personalization: pick thumbnail variant per user taste profile
4. Return assembled rows

Cold start problem (new user, no history):
• Show globally popular titles for their region
• After 3 watches: enough signal to start personalizing
• Explicit genre preferences during onboarding used as seed`,
    followups: [
      "How do you handle the cold start problem for a brand new title?",
      "How does Netflix A/B test recommendation algorithm changes?",
      "Why use implicit feedback (watch%) instead of explicit ratings?",
    ],
  },
  {
    id: "q7",
    category: "API Design",
    difficulty: "Medium",
    round: "Onsite — LLD / API Design",
    asked_at: ["Netflix", "Amazon", "Flipkart"],
    question: "Design the REST API for the Netflix playback service. What endpoints, request/response shape, and error handling?",
    answer: `Core endpoints:

1. INITIATE PLAYBACK
POST /api/v2/playback
Headers: Authorization: Bearer {session_token}
Body: {
  titleId, profileId, deviceId,
  deviceCapabilities: { maxResolution, codecs, drm, audioFormats },
  resumePosition: true/false
}
Response 200: {
  manifestUrl, drmLicenseUrl, expiresAt,
  resumePositionMs, chunks[], audioTracks[], subtitleTracks[]
}
Errors:
  401 → session expired (client must re-auth)
  403 → title not available in your country
  403 → subscription required / expired
  404 → title not found
  503 → playback service degraded (client shows retry UI)

2. REPORT PLAYBACK EVENTS (telemetry)
POST /api/v2/playback/events  (batched, fire-and-forget)
Body: { events: [{ type, titleId, positionMs, bitrateKbps, bufferMs, timestamp }] }
Response: 204 No Content
(Client doesn't block on this — sent in background)

3. SAVE POSITION (on pause/exit)
PUT /api/v2/playback/position
Body: { titleId, profileId, positionMs, completed: bool }
Response: 204 No Content

4. GET RESUME POSITION
GET /api/v2/titles/{titleId}/position?profileId={id}
Response: { positionMs, lastWatchedAt, completed }

Design decisions:
• POST for playback initiation (not GET) — it creates a DRM session (side effect)
• Manifest URL is short-lived (15 min) — client must call this again after expiry
• Telemetry is batched + async — don't make users wait for analytics
• 503 on playback must include Retry-After header so client backs off gracefully`,
    followups: [
      "How do you version this API when you need to add new fields?",
      "How do you handle 50M concurrent requests to this endpoint?",
      "Should the manifest URL be signed? Why?",
    ],
  },
  {
    id: "q8",
    category: "Chaos Engineering",
    difficulty: "Medium",
    round: "Behavioral / System Design",
    asked_at: ["Netflix", "Amazon", "Stripe"],
    question: "What is chaos engineering and how does Netflix use it? How would you test the resilience of a distributed system?",
    answer: `Chaos engineering = deliberately injecting failures in production to discover weaknesses before users do.

Netflix's philosophy:
"The system will fail. The question is whether it fails on your terms (controlled test) or the user's terms (surprise outage)."

Netflix's Simian Army:

Chaos Monkey:
• Randomly kills production EC2 instances during business hours
• Forces every service to be built assuming any instance can die at any time
• Result: no single instance is ever a SPOF

Latency Monkey:
• Injects artificial delays in service-to-service calls
• Reveals synchronous dependencies that should be async
• Exposes missing timeouts and circuit breakers

Conformity Monkey:
• Scans instances for violations of best practices
  (no auto-scaling group, no health check endpoint, stale AMI)
• Terminates non-conforming instances

Chaos Gorilla:
• Simulates failure of an entire AWS Availability Zone
• Tests whether traffic reroutes cleanly to other AZs

Chaos Kong (most extreme):
• Simulates failure of an entire AWS Region
• All services must continue from remaining 2 regions
• Netflix runs this regularly — they've done it in production

How to implement in a new system:
1. Start with canary: kill 1 instance of non-critical service
2. Define steady-state metrics: error rate, p99 latency, rebuffer rate
3. Form hypothesis: "killing 1/10 recommendation instances won't increase error rate"
4. Run experiment: kill it
5. Compare metrics to steady-state
6. Roll back if hypothesis fails, fix the weakness, repeat

The key discipline:
• Run in production — staging environments don't expose real traffic patterns
• Run during business hours — you need engineers awake to respond
• Automate rollback — chaos experiments must be stoppable in < 30 seconds`,
    followups: [
      "How do you ensure chaos experiments don't cascade into a real outage?",
      "What's the difference between chaos engineering and load testing?",
      "How do you convince leadership to run chaos experiments in production?",
    ],
  },
  {
    id: "q9",
    category: "Security & DRM",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["Netflix", "Disney+", "Apple"],
    question: "How does Netflix prevent video piracy? Explain the DRM system design.",
    answer: `DRM (Digital Rights Management) = encrypted video + device-bound key + license server verification.

The three-part lock:

PART 1 — Encrypted content (at rest and in transit):
• All video chunks encrypted with AES-128 (content key)
• Content key itself is encrypted with a master key (stored in HSM)
• Encrypted chunks on OCA = useless without the content key
• Even if someone intercepts OCA traffic → only gets encrypted bytes

PART 2 — Device-bound license:
• Content key is re-encrypted with device's hardware fingerprint:
  device_license = encrypt(content_key, hardware_id)
• hardware_id = unique identifier from device's TEE (Trusted Execution Environment)
• License only works on the specific hardware that requested it
• Stolen license + different device = decryption fails

PART 3 — License server validation:
• Client must hit Netflix license server before each play session
• License server checks:
  1. Valid session token (active subscription)
  2. Title available in user's geo-region
  3. Device trust level (Widevine L1/L2/L3, FairPlay, PlayReady)
  4. Not a revoked device (rooted/jailbroken detection)
• License is time-bound: streaming = 12h, download = 30 days

DRM by device:
• Android/Chrome/FireTV → Widevine (Google)
• iPhone/Safari/Apple TV → FairPlay (Apple)
• Windows/Xbox → PlayReady (Microsoft)

Security levels:
• L1 (hardware TEE): decryption in secure hardware enclave → qualifies for 4K
• L3 (software only): decryption in software → capped at 1080p (easier to intercept)

Why software piracy is hard:
• Raw video frames are only decrypted inside the TEE
• They go directly from TEE → GPU → screen
• Never exist as a file or in accessible memory
• Screen recording captures compressed pixels, not source frames

Why it's not perfect:
• HDMI capture cards can record screen output (analog hole problem)
• This is why Netflix disables screen recording APIs on mobile
• Hardware-level capture still possible — Netflix accepts this as residual risk`,
    followups: [
      "How does Netflix handle device revocation? (e.g., a Widevine key gets leaked)",
      "Why can't you screen-record Netflix on iOS but can take screenshots of other apps?",
      "How would you design the license server to handle 50M concurrent license requests?",
    ],
  },
  {
    id: "q10",
    category: "Observability",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["Netflix", "Datadog", "Cloudflare"],
    question: "How does Netflix monitor streaming quality across 300M users in real time? Design the observability system.",
    answer: `Netflix uses a 3-layer observability stack: client telemetry → Kafka pipeline → real-time + batch consumers.

LAYER 1 — Client telemetry (every device is a sensor):

Every Netflix client emits events every 2-4 seconds during playback:
{
  userId, sessionId, titleId, ocaId,
  positionMs, qualityLevel, bitrateKbps,
  bufferLevelMs, rebufferCount, startupTimeMs,
  networkType, bandwidth_estimate_kbps
}

Key Quality of Experience (QoE) metrics per session:
• startup_time_ms: time from Play click → first frame
• rebuffer_rate: % of playback time spent buffering (target < 0.1%)
• bitrate_switches: how often ABR changed quality
• peak_bitrate: highest quality achieved

LAYER 2 — Kafka pipeline (real-time stream):

Client → Kafka topic: playback-quality (partitioned by ocaId)
                      viewing-events (partitioned by userId)

Two consumer paths:
A. Real-time (Apache Flink, < 30 second latency):
   • Aggregate rebuffer_rate by ocaId, ISP, region
   • Alert if any OCA shows rebuffer spike > 3× baseline
   • Trigger OCA load rebalancing (deprioritize overloaded OCA)

B. Batch (Apache Spark, hourly):
   • Build QoE dashboards per region, device, ISP, title
   • Feed ML models (rebuffer prediction, ABR algorithm training)
   • SLA reporting

LAYER 3 — Atlas (Netflix's metrics system, like Prometheus):

• All microservices push dimensional metrics to Atlas
• Dimensions: region, service, instance, error_code
• Example: playback.error.rate[region=IN, error=DRM_FAILED] = 0.001%
• Alerts: PagerDuty integration for SLO breaches

Alerting thresholds:
• rebuffer_rate > 0.5% for any OCA → auto deprioritize + page on-call
• startup_time p99 > 3s for any region → investigate CDN routing
• DRM error rate > 0.1% → investigate license server

Zipkin for distributed tracing:
• Every Play request gets a trace_id
• Each microservice leg annotated with timing
• P99 latency breakdown: Zuul + Auth + Playback + DRM + manifest assembly`,
    followups: [
      "How do you distinguish between a bad OCA vs a bad ISP link vs a bad user connection?",
      "How do you handle telemetry from 300M devices without overwhelming Kafka?",
      "What is the difference between metrics, logs, and traces? When do you use each?",
    ],
  },
];

