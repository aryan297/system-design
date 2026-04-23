export const YOUTUBE_HLD = {
  title: "YouTube — High Level Design",
  subtitle: "Video platform serving 500 hours of upload/minute to 2.7B monthly users",
  overview: `YouTube is the world's largest video platform — a massive distributed system built around two core flows: upload (ingest, transcode, store) and playback (CDN delivery at global scale).

The key architectural split: the upload pipeline runs as an async job system (ingest → transcode → distribute), while playback is a real-time low-latency path (metadata + adaptive streaming from CDN).

Scale facts: 500 hours of video uploaded every minute, 1B+ hours watched daily, 500M+ mobile views/day, and recommendations must personalize for 2.7B users.`,

  diagram: `
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│        Web Browser · iOS · Android · Smart TV · Chromecast         │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  HTTPS (upload / metadata / search)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   API GATEWAY / CDN EDGE                            │
│         Auth · Rate Limiting · Routing · TLS Termination           │
└──┬──────────────┬──────────────┬─────────────────┬─────────────────┘
   │              │              │                 │
   ▼              ▼              ▼                 ▼
┌──────┐    ┌──────────┐  ┌──────────┐    ┌────────────────┐
│Upload│    │ Metadata │  │  Search  │    │ Recommendation │
│Service│   │ Service  │  │  Service │    │    Engine      │
└──┬───┘    └────┬─────┘  └────┬─────┘    └────────────────┘
   │             │             │
   ▼             ▼             ▼
┌──────────┐  ┌──────┐  ┌──────────────┐
│Transcode │  │MySQL │  │Elasticsearch │
│ Pipeline │  │(meta)│  │ (search idx) │
│(FFmpeg)  │  └──────┘  └──────────────┘
└────┬─────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     DISTRIBUTED STORAGE                             │
│         Google Cloud Storage (raw) · Bigtable (metadata)           │
│         Spanner (user data) · Memorystore/Redis (cache)            │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  Encoded video segments
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      GOOGLE CDN EDGE NETWORK                        │
│   PoP NY · PoP London · PoP Mumbai · PoP Tokyo · PoP Sydney         │
│        Anycast routing · 100+ edge locations globally               │
└─────────────────────────────────────────────────────────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Upload Pipeline",
      sections: [
        {
          title: "Video Upload — From Creator to CDN",
          content: `The upload pipeline is async and fault-tolerant. A 4K video can take 10+ minutes to transcode — it cannot be a synchronous HTTP request.

STEP 1 — RAW INGEST:
• Creator uploads via chunked HTTP (resumable upload API)
• Each chunk = 8 MB; client retries individual chunks on failure
• Chunks land in a raw blob store (Google Cloud Storage)
• Upload Service writes to MySQL: video_id, creator_id, status=PROCESSING
• Returns video_id to creator immediately — upload and processing are decoupled

STEP 2 — TRANSCODE PIPELINE (async, message-queue triggered):
• Upload Service publishes event to Pub/Sub: { video_id, raw_path }
• Transcode Orchestrator picks up event, spawns parallel FFmpeg workers
• Each worker produces one quality/resolution variant:
  - 2160p (4K), 1440p, 1080p, 720p, 480p, 360p, 240p, 144p
• Also generates: audio-only track, subtitle files, thumbnail sprites
• Output format: MPEG-DASH segments (for adaptive streaming) + HLS fallback
• Each segment = 2–10 seconds of video at one quality level

STEP 3 — DISTRIBUTION:
• Transcoded segments pushed to CDN edge nodes
• CDN pre-positions popular content at PoPs closest to predicted viewer regions
• Status updated: video_id → status=PUBLISHED, available_qualities=[...]

FAULT TOLERANCE:
• If transcode worker crashes → Pub/Sub redelivers message, job restarts from checkpoint
• Idempotent workers: re-processing same segment overwrites same output path safely`,
        },
        {
          title: "Adaptive Bitrate Streaming (ABR) — How YouTube Adjusts Quality",
          content: `YouTube never streams a single fixed-quality video. It dynamically adjusts quality based on bandwidth.

HOW IT WORKS:
1. Video is stored as small segments (2–10s) at each quality level
2. Client requests a manifest file (MPD for DASH or M3U8 for HLS)
3. Manifest lists: all quality variants, segment URLs, segment durations
4. Client player monitors available bandwidth every 2 seconds
5. Player selects quality tier: if bandwidth drops, switches to lower tier for next segment
6. Viewer experience: seamless — no buffering, just imperceptible quality shift

MANIFEST FILE (simplified DASH MPD):
  <MPD>
    <AdaptationSet>
      <Representation id="1080p" bandwidth="5000000" ...>
        <SegmentTemplate media="seg_1080p_$Number$.m4v" timescale="90000" />
      </Representation>
      <Representation id="720p" bandwidth="2500000" ...>
        <SegmentTemplate media="seg_720p_$Number$.m4v" timescale="90000" />
      </Representation>
      ...
    </AdaptationSet>
  </MPD>

BUFFER MANAGEMENT:
• Player maintains 30s of pre-buffered video ahead of playback
• If buffer drops below 10s: drop to lower quality immediately
• If buffer > 30s and bandwidth allows: step up quality for next segment

CDN INTERACTION:
• Every segment request = CDN hit (99%+ hit rate for popular videos)
• Cache key: video_id + quality + segment_number
• Cache miss → CDN fetches from origin GCS → caches for future viewers`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Metadata & Search",
      sections: [
        {
          title: "Metadata Service — Video Catalog at Scale",
          content: `YouTube has 800M+ videos. Metadata (title, description, tags, stats) must be fast to read and eventually consistent to update.

STORAGE SPLIT:
• MySQL / Cloud Spanner: source of truth for video metadata
  - Globally consistent (Spanner uses TrueTime API for external consistency)
  - Strong consistency for writes (title change visible everywhere in seconds)
  - Schema: videos, channels, playlists, thumbnails

• Bigtable: high-throughput counters (views, likes, dislikes, comments)
  - Not strongly consistent — eventually consistent is acceptable
  - "3.2M views" vs "3,201,847 views" — close enough, updates every few minutes
  - Handles billions of increment operations per day

• Redis / Memorystore: hot metadata cache
  - Popular video metadata cached at edge for sub-millisecond reads
  - TTL = 5 minutes; background refresh before TTL expires
  - Cache hit rate > 95% for top 1% of videos (which is 90%+ of traffic)

VIDEO METADATA SCHEMA (simplified):
  videos table:
    video_id      UUID PRIMARY KEY
    channel_id    UUID NOT NULL
    title         TEXT NOT NULL
    description   TEXT
    duration_sec  INT
    status        ENUM(PROCESSING, PUBLISHED, PRIVATE, DELETED)
    upload_time   TIMESTAMPTZ
    available_qualities  JSONB   -- ['144p','240p','360p','480p','720p','1080p']
    thumbnail_url TEXT
    category      TEXT
    tags          TEXT[]

  video_stats table (Bigtable, rowkey = video_id):
    view_count    COUNTER
    like_count    COUNTER
    dislike_count COUNTER
    comment_count COUNTER`,
        },
        {
          title: "Search — Finding Videos Among 800M",
          content: `YouTube search must be fast (< 200ms), relevant, and personalized across 800M+ videos.

INDEXING PIPELINE:
• When video published → metadata pushed to search index
• Elasticsearch cluster: inverted index on title, description, tags, transcript
• Also indexed: channel authority, engagement signals, freshness score

SEARCH RANKING — Multi-signal ranker:
  text_relevance   = BM25 score on title/description match
  quality_score    = channel subscriber count + video engagement rate
  freshness_score  = recency boost for news/trending queries
  personalization  = viewer's watch history × topic affinity model
  final_score      = weighted combination of above signals

WHY NOT JUST TEXT MATCH:
  Query: "how to cook pasta"
  Text-only: returns obscure videos with exact keywords
  YouTube: returns videos from authoritative cooking channels with high engagement
  → Channel quality + engagement are stronger signals than text match alone

AUTOCOMPLETE (< 50ms):
  Stored in Redis as prefix-sorted sorted set:
    ZADD autocomplete 0 "python tutorial"
    ZADD autocomplete 0 "python for beginners"
  Query: ZRANGEBYLEX autocomplete "[py" "[py\xff" LIMIT 0 10
  Score = 0 for all; tie-broken by search frequency (pre-populated from logs)

TRENDING TOPICS:
  Flink streaming job consumes search query events from Kafka
  Sliding window (1h): count queries per topic, rank by velocity (queries/min)
  Result: trending topics list updated every 5 minutes`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Recommendations",
      sections: [
        {
          title: "Recommendation Engine — The Homepage Algorithm",
          content: `YouTube's recommendation engine drives 70% of watch time. It must personalize for 2.7B users in < 100ms.

TWO-STAGE ARCHITECTURE (industry standard for this scale):

STAGE 1 — CANDIDATE GENERATION (narrow from 800M → ~500 candidates):
  Goal: fast, coarse filtering using cheap signals
  Method: matrix factorization on user × video interaction matrix
  Input: user's watch history, likes, search queries, subscriptions
  Output: ~500 video IDs likely relevant to this user
  Latency: ~20ms (pre-computed embeddings from offline model)

  The model learns: "users who watched A and B tend to also watch C"
  Embedding: each user and video is a vector in shared latent space
  Candidate = top-k videos by cosine similarity to user's embedding

STAGE 2 — RANKING (score each of the ~500 candidates):
  Goal: surface the best N videos for this session
  Method: deep neural network with many features per candidate
  Features per (user, video) pair:
    - watch probability: P(user watches > 50% of this video)
    - satisfaction signal: like rate, share rate, survey responses
    - diversity penalty: reduce score if too similar to already-selected items
    - freshness: prefer newer content, especially for subscriptions
    - context: time of day, device type, session length so far

ONLINE vs OFFLINE:
  Offline (daily retraining on Spark):
    - Update user embeddings from last 90 days of watch history
    - Retrain ranking model on engagement labels
  Online (real-time, during session):
    - User watches video A → embedding updated in real time
    - Next recommendation already accounts for video A`,
        },
        {
          title: "Engagement Signals — What YouTube Optimizes For",
          content: `YouTube optimizes for "satisfaction" not just clicks. The ranking model's target changed over time.

EARLY YOUTUBE (pre-2012): optimized for clicks
  Problem: clickbait thumbnails → user clicks → watches 10s → leaves
  Click-through rate went up. User satisfaction went down.

POST-2012: optimized for watch time
  Better: rewarded videos that held attention
  Problem: videos that played in background counted — not true engagement

CURRENT: multi-objective optimization
  Primary signals:
    • "Did the user finish the video?" (completion rate)
    • "Did the user like/share/comment?"
    • Survey signal: "Were you satisfied with this video?" (sampled from users)
    • "Did the user close the app or keep watching after?"

  Negative signals:
    • User closes app immediately after video → penalize recommendation
    • User explicitly says "Not interested" → strong negative signal
    • Dislike rate above threshold → reduce distribution

  Why surveys matter:
    • Watch time can be gamed (autoplay in background)
    • Surveys measure ground truth satisfaction
    • YouTube samples ~0.1% of sessions for survey rating

HOMEPAGE vs SIDEBAR vs SEARCH:
  Homepage: highest personalization, must hook viewer immediately
  Sidebar ("Up next"): continuation — what's the logical next video?
  Search: relevance first, then personalization overlay`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "CDN & Playback",
      sections: [
        {
          title: "CDN Architecture — Delivering 1B Hours/Day",
          content: `Video delivery is the highest-bandwidth operation on the internet. YouTube uses Google's global CDN with 100+ edge PoPs.

CDN TOPOLOGY:
• Level 1: Origin — Google Cloud Storage (raw encoded segments)
• Level 2: Regional Edge Caches — ~10 major geographic hubs (US-East, EU-West, etc.)
• Level 3: PoP Edge Nodes — 100+ locations inside or adjacent to ISP networks

REQUEST FLOW:
1. Client requests: GET /segment/abc123/1080p/seg_42.m4v
2. DNS resolves to nearest CDN PoP (Anycast routing)
3. PoP checks local cache (hit rate ~95% for top content)
4. Cache MISS → fetch from Regional Edge Cache
5. Regional Cache MISS → fetch from Origin GCS
6. Segment cached at both levels, served to client

CACHE STRATEGY:
• Long-Tail problem: 500M+ videos, most rarely watched
  - Top 1% videos: cache everywhere, always warm (>99% hit rate)
  - Mid tier: cache at regional level, evict on LRU basis
  - Long tail: no caching — direct from origin (acceptable; low traffic)

• Cache headers: Cache-Control: public, max-age=86400 (1 day)
  Video segments are immutable — segment 42 at 1080p never changes
  Immutability = perfect caching with no invalidation needed

BANDWIDTH OPTIMIZATION:
• Each PoP has 10–100 Gbps capacity
• Segment pre-fetching: CDN pre-fetches next 3 segments on cache miss
• Connection reuse: HTTP/2 multiplexing — single TCP connection serves multiple segment requests
• Protocol: QUIC (HTTP/3) on modern clients — reduced connection latency by ~20%`,
        },
        {
          title: "Playback Session — What Happens When You Press Play",
          content: `The full flow from pressing play to first video frame (target: < 200ms).

THE PLAYBACK FLOW:
1. Client sends: GET /watch?v=dQw4w9WgXcQ
2. Metadata Service: fetch video metadata from cache (~5ms)
   → title, description, duration, available qualities, thumbnail
3. Auth Service: validate session, check age restrictions (~10ms)
4. Playback Service: generate signed streaming manifest URL (~20ms)
   → URL includes: video_id, user_id, expiry, signature
   → Signed to prevent hotlinking / unauthorized sharing
5. Client fetches manifest (MPD/M3U8) from CDN
6. Client player: select initial quality based on current bandwidth estimate
7. Client fetches first 2–3 segments from CDN (buffer fill)
8. Playback begins

SIGNED URLS:
  manifest_url = CDN_BASE + "/manifest/" + video_id
                 + "?token=" + HMAC_SHA256(video_id + user_id + expiry, SECRET)
                 + "&expires=" + unix_timestamp
  CDN validates token on each request → prevents URL sharing abuse
  Expiry: 6 hours for standard users

SEEK HANDLING:
  User seeks to timestamp T:
  1. Player calculates: segment_number = floor(T / segment_duration)
  2. Player fetches segment N from CDN (may be cache miss if long seek)
  3. Player decodes and begins playback at offset within segment
  No server-side state needed — all math done client-side`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "View Counting & Comments",
      sections: [
        {
          title: "View Count System — Counting at Scale",
          content: `YouTube serves 1B+ video views per day. Naively updating a view_count column per view would destroy any database.

THE NAIVE APPROACH (broken):
  UPDATE videos SET view_count = view_count + 1 WHERE video_id = ?
  Problem: a viral video gets 1M views/hour = 277 writes/sec to the same row
  → Row-level lock contention → database becomes bottleneck

YOUTUBE'S APPROACH — Sharded Counters + Async Aggregation:

STEP 1 — Client fires view event:
  • Client player sends: POST /api/videoviewed { video_id, timestamp, watch_duration }
  • View Event Service validates (is this a real view? > 30s watched?)
  • Publishes to Kafka topic: video-view-events

STEP 2 — Stream aggregation (Dataflow / Flink):
  • Consumes video-view-events from Kafka
  • Sliding window: aggregate count per video_id per 1-minute window
  • Writes batch increments to Bigtable every 60 seconds (not per-view)
  • Result: 1M views/hour → 1 Bigtable write/min per video (vs 277/sec)

STEP 3 — Read path:
  • view_count = Bigtable counter + in-memory cache
  • Cache TTL: 5 minutes (count shown may lag by up to 5 min)
  • "1.2M views" is approximate — exact count not shown (unnecessary precision)

FAKE VIEW DETECTION:
  Flink streaming job checks:
  • Same IP → same video → > 10 views in 1 hour → deduplicate
  • Bot pattern: view events without seek/pause events → flag as bot
  • Suspicious spikes: 100× normal view rate in 1 min → hold count pending review
  • Held counts released after ML classifier confirms legitimate traffic`,
        },
        {
          title: "Comments — Threaded Discussion at Scale",
          content: `YouTube has billions of comments. The comment system must handle high write volume and flexible threading.

COMMENT DATA MODEL:
  CREATE TABLE comments (
    comment_id   UUID PRIMARY KEY,
    video_id     UUID NOT NULL,
    author_id    UUID NOT NULL,
    parent_id    UUID,           -- NULL = top-level, else reply
    body         TEXT NOT NULL,
    like_count   INT DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status       TEXT DEFAULT 'published'  -- published | held | removed
  );
  INDEX: (video_id, created_at DESC)     -- top-level comments by recency
  INDEX: (parent_id, created_at ASC)    -- replies to a comment

PAGINATION STRATEGY:
  Top-level comments: paginated by (video_id, cursor = created_at)
  Replies: lazy-loaded per comment thread on expand
  Sorting: "Top Comments" = weighted sort (like_count + recency)
            "Newest first" = simple DESC by created_at

COMMENT MODERATION:
  • AutoMod: every comment passes through ML classifier before publish
  • Classifier scores: hate speech, spam, personal attacks (0–1)
  • Score > 0.9: auto-remove
  • Score 0.7–0.9: hold for creator/human review
  • Score < 0.7: publish immediately
  • Training data: human-labeled comments from previous takedowns

HELD COMMENTS:
  Creator dashboard shows held comments for review
  Status transitions: held → approved (publish) | held → removed (delete)
  Held comments not visible to other viewers until approved`,
        },
      ],
    },
    {
      id: "phase6",
      label: "Phase 6",
      title: "Reliability & Scale",
      sections: [
        {
          title: "Handling 500 Hours/Minute of Uploads",
          content: `500 hours of video uploaded every minute = 30,000 hours/hour = ~10 petabytes/day of raw video.

SCALE MATH:
  500 hours/min of uploads
  Average video = 10 min → 50 uploads/min = ~0.83 uploads/sec
  But that's averages — peak upload times are 3–5× higher
  Average 1080p video (10 min) ≈ 2 GB raw → 1.6 GB/s peak ingest

CHUNKED UPLOAD PROTOCOL:
  1. Creator requests upload URL: POST /upload/initiate → returns upload_id
  2. Client splits file into 8 MB chunks
  3. Each chunk: PUT /upload/{upload_id}?chunk=N with Content-Range header
  4. Server acknowledges each chunk, stores to GCS
  5. On final chunk: server publishes transcode job to Pub/Sub
  Resume: if connection drops, client re-sends last unacknowledged chunk (idempotent)

TRANSCODE FLEET (horizontal scaling):
  Pub/Sub queue → pool of transcode workers (containerized, auto-scaling)
  Each worker transcodes one video into all quality variants
  Worker fleet auto-scales: more uploads → more workers spun up (Kubernetes HPA)
  Transcode time: 10-min 1080p video takes ~5 min to fully transcode
  Peak capacity: thousands of concurrent transcode workers

STORAGE TIERS:
  Hot (accessed within 30 days): Standard GCS — fast access, higher cost
  Warm (30–365 days): Nearline GCS — 3× cheaper, ~5ms access latency
  Cold (> 1 year, < 1% monthly access): Coldline GCS — 10× cheaper, no SLA
  Auto-tiering: lifecycle policy moves videos between tiers automatically`,
        },
        {
          title: "Global Availability & Disaster Recovery",
          content: `YouTube must be available 24/7 globally. A 1-minute outage affects millions of concurrent viewers.

REGIONAL DEPLOYMENT:
  • Active/active multi-region: US, Europe, Asia-Pacific each run full stack
  • Traffic routed by Anycast DNS to nearest healthy region
  • No single region handles all traffic — load naturally distributed
  • Regional failover: if US-East unhealthy, US-West takes over (auto, < 30s)

CDN RESILIENCE:
  • Video segments cached at 100+ edge PoPs independently
  • PoP failure: DNS TTL = 60s → new DNS lookup routes to next nearest PoP
  • Origin failure: PoPs serve cached content for hours before cache expiry
  • Most viewers never see an outage — CDN absorbs failures transparently

STATELESS SERVICES (easy to restart/scale):
  Upload Service, Metadata Service, Playback Service, Search Service
  → All stateless: crash and restart within 5s, load balancer re-routes
  → Kubernetes liveness probes: unhealthy pod replaced automatically

CHAOS ENGINEERING:
  YouTube (Google) runs Chaos Engineering continuously
  Random service instances terminated during business hours
  Tests: does traffic shift transparently? Do health checks catch failures fast enough?
  Goal: every team owns their service's failure modes before production discovers them

SLO TARGETS:
  Playback start time: p99 < 2s globally
  Upload ingestion: file appears in system within 30s of final chunk
  Search results: p99 < 500ms
  Metadata reads: p99 < 100ms`,
        },
      ],
    },
  ],

  metrics: [
    { label: "Monthly Active Users", value: "2.7B+", note: "as of 2024" },
    { label: "Video hours uploaded/min", value: "500+", note: "every minute of every day" },
    { label: "Daily watch time", value: "1B+ hrs", note: "across all devices" },
    { label: "Videos in catalog", value: "800M+", note: "all statuses" },
    { label: "Mobile views/day", value: "500M+", note: "50%+ of all traffic" },
    { label: "Countries/territories", value: "100+", note: "with local language support" },
    { label: "Recommendation share", value: "~70%", note: "of total watch time from recommendations" },
    { label: "CDN edge locations", value: "100+", note: "Google global PoP network" },
  ],
};

export const YOUTUBE_LLD = {
  title: "YouTube — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of core YouTube services",

  components: [
    {
      id: "uploadService",
      title: "Upload Service — LLD",
      description: "Resumable chunked upload + async transcode pipeline",
      api: `POST /upload/initiate
Request:
{
  "channel_id": "UC_abc123",
  "filename": "my_video.mp4",
  "file_size_bytes": 2147483648,
  "content_type": "video/mp4",
  "title": "My Awesome Video",
  "description": "...",
  "category": "Education",
  "tags": ["python", "tutorial"]
}
Response:
{
  "upload_id": "upload_xyz789",
  "video_id": "dQw4w9WgXcQ",
  "chunk_size_bytes": 8388608,   // 8 MB
  "upload_url": "https://upload.youtube.com/upload/upload_xyz789"
}

PUT /upload/{uploadId}
Headers:
  Content-Range: bytes 0-8388607/2147483648
  Content-Type: video/mp4
Body: <binary chunk>
Response 308 (Resume Incomplete):
  Range: bytes=0-8388607

Final chunk response 200:
{
  "video_id": "dQw4w9WgXcQ",
  "status": "PROCESSING",
  "message": "Video uploaded. Transcoding in progress."
}

GET /videos/{videoId}/status
Response:
{
  "video_id": "dQw4w9WgXcQ",
  "status": "PUBLISHED",          // PROCESSING | PUBLISHED | FAILED
  "available_qualities": ["144p","240p","360p","480p","720p","1080p"],
  "processing_progress": 100,
  "published_at": "2026-04-23T12:00:00Z"
}`,
      internals: `Resumable upload state (Redis):
  Key: upload:{upload_id}
  Fields: channel_id, video_id, file_size, chunks_received, last_chunk_at
  TTL: 7 days (creator can resume upload within 7 days)

Chunk idempotency:
  chunk_hash = SHA256(chunk_bytes)
  IF chunk already stored (hash match): return 308 with existing range
  ELSE: write chunk to GCS at path /raw/{video_id}/chunks/{chunk_n}

Completion detection:
  On each chunk write: SUM(stored chunk sizes) == total_file_size?
  YES → mark upload complete, publish to Pub/Sub:
        { video_id, raw_gcs_path, channel_id, upload_metadata }

Pub/Sub → Transcode Orchestrator:
  Message consumed by Transcode Orchestrator
  Spawns N parallel transcode jobs (one per quality level)
  Uses Google Cloud Transcoder API (managed) or custom FFmpeg workers

FFmpeg transcode command (conceptual):
  ffmpeg -i raw/{video_id}.mp4
    -vf scale=-2:1080 -c:v libx264 -crf 23 -preset medium
    -c:a aac -b:a 192k
    -f dash -seg_duration 6
    output/1080p/manifest.mpd

Completion:
  All quality workers complete → Orchestrator marks video PUBLISHED
  Updates MySQL: status=PUBLISHED, available_qualities=[...]
  Triggers: CDN pre-warm for channels with >100K subscribers`,
    },
    {
      id: "playbackService",
      title: "Playback Service — LLD",
      description: "Signed manifest generation + adaptive streaming session management",
      api: `GET /watch?v={videoId}
(Returns HTML page with initial metadata embedded)

GET /api/v1/videos/{videoId}/playback
Headers: Authorization: Bearer <session_token>
Response:
{
  "video_id": "dQw4w9WgXcQ",
  "title": "Never Gonna Give You Up",
  "channel": { "id": "UC_rick", "name": "Rick Astley", "subscribers": "4M" },
  "duration_sec": 213,
  "available_qualities": ["144p","240p","360p","480p","720p","1080p","1440p","2160p"],
  "manifest_url": "https://cdn.googlevideo.com/manifest/dQw4w9WgXcQ?token=abc&expires=1745503200",
  "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  "subtitles": [
    { "lang": "en", "url": "https://cdn.googlevideo.com/subs/dQw4w9WgXcQ/en.vtt" }
  ],
  "view_count": 1400000000,
  "like_count": 16000000,
  "recommended": [...]       // next 10 video suggestions
}

POST /api/v1/playback/event
{
  "video_id": "dQw4w9WgXcQ",
  "event_type": "VIEW",       // VIEW | PAUSE | SEEK | QUALITY_CHANGE | END
  "timestamp_sec": 45,        // position in video
  "quality": "720p",
  "session_id": "sess_xyz"
}`,
      internals: `Signed URL generation:
  secret = KMS-managed signing key (rotated weekly)
  payload = video_id + user_id + expiry_unix
  token = HMAC_SHA256(payload, secret)
  manifest_url = "https://cdn.googlevideo.com/manifest/{video_id}?token={token}&expires={expiry}"
  CDN validates: recompute HMAC, compare, check expiry

Metadata cache (Redis):
  Key: video:meta:{video_id}
  TTL: 5 minutes (background refresh thread updates before expiry)
  Contains: title, channel, duration, available_qualities, view_count (approx), thumbnail
  On cache miss: read from Cloud Spanner → populate cache → return

Adaptive quality selection (client-side algorithm):
  bandwidth_estimate = rolling average of last 3 segment download speeds
  buffer_level = buffered_seconds_ahead
  IF buffer < 10s: drop to quality where segment size < bandwidth × 4s
  IF buffer > 30s AND bandwidth supports higher: step up one quality tier
  Quality ladder step-up/down: hysteresis (don't switch if within 20% of threshold)

Playback events (Kafka → analytics pipeline):
  Every PAUSE/SEEK/QUALITY_CHANGE sent to Kafka: playback-events topic
  Consumers:
    • Watch history service (for recommendations)
    • Engagement analytics (creator studio stats)
    • Quality analytics (detect buffering issues by CDN region)`,
    },
    {
      id: "metadataService",
      title: "Metadata Service — LLD",
      description: "Video catalog — MySQL + Bigtable + Redis cache layer",
      api: `GET /api/v1/videos/{videoId}
Response:
{
  "video_id": "dQw4w9WgXcQ",
  "channel_id": "UC_rick",
  "title": "Never Gonna Give You Up",
  "description": "...",
  "duration_sec": 213,
  "status": "PUBLISHED",
  "upload_time": "2009-10-25T06:57:33Z",
  "category": "Music",
  "tags": ["rickroll","80s","pop"],
  "available_qualities": ["144p","240p","360p","480p","720p","1080p"],
  "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  "stats": {
    "view_count": 1400000000,
    "like_count": 16000000,
    "comment_count": 3500000
  }
}

PATCH /api/v1/videos/{videoId}
(Creator updates title/description/tags — requires channel ownership)
{
  "title": "Updated title",
  "description": "New description",
  "tags": ["updated","tags"]
}

GET /api/v1/channels/{channelId}/videos
Query: ?status=PUBLISHED&sort=upload_time&limit=20&cursor=<pagination_cursor>`,
      internals: `Cloud Spanner schema (metadata source of truth):
  videos: video_id, channel_id, title, description, duration_sec,
          status, upload_time, category, tags[], available_qualities[],
          thumbnail_url, default_language
  channels: channel_id, name, description, subscriber_count, created_at
  playlists: playlist_id, channel_id, title, video_ids[]

  Spanner provides: external consistency (TrueTime), global replication,
  automatic sharding — no manual shard management needed

Bigtable schema (counters, high write throughput):
  Table: video_stats
  Row key: video_id (padded to fixed width to avoid hotspots)
  Columns: views, likes, dislikes, comments, shares
  Write: Cell timestamp = event time; Bigtable counter columns
  Read: Bigtable returns latest value per column

Hotspot avoidance in Bigtable:
  Naive row key: video_id → viral video creates a hot tablet
  Solution: row key = REVERSE(video_id) — distributes writes across tablets
  Alternative: sharded counters — write to video_id#shard_N, read = SUM over shards

Redis cache hierarchy:
  L1: In-process cache (LRU, 10K entries per service instance, < 1ms)
  L2: Redis cluster (100M entries, < 5ms, shared across instances)
  Miss: Spanner read (~20ms) → populate L2 → populate L1
  Invalidation: on video update → DELETE redis key (cache-aside pattern)`,
    },
    {
      id: "searchService",
      title: "Search Service — LLD",
      description: "Elasticsearch-backed video search with personalization ranking",
      api: `GET /api/v1/search?q=python+tutorial&type=video&sort=relevance&limit=20&page=1
Response:
{
  "query": "python tutorial",
  "total_results": 4800000,
  "results": [
    {
      "video_id": "abc123",
      "title": "Python Tutorial for Beginners — Full Course",
      "channel": { "name": "Corey Schafer", "verified": true },
      "duration_sec": 11352,
      "view_count": 45000000,
      "upload_time": "2019-06-15T...",
      "thumbnail_url": "...",
      "score": 0.94    // internal ranking score
    },
    ...
  ],
  "suggestions": ["python tutorial for beginners", "python tutorial 2024"]
}

GET /api/v1/search/autocomplete?q=py&limit=10
Response:
{
  "suggestions": [
    "python tutorial",
    "python for beginners",
    "pycon 2024",
    ...
  ]
}`,
      internals: `Elasticsearch index mapping (videos):
{
  "mappings": {
    "properties": {
      "video_id":    { "type": "keyword" },
      "title":       { "type": "text", "analyzer": "english", "boost": 3 },
      "description": { "type": "text", "analyzer": "english" },
      "tags":        { "type": "keyword", "boost": 2 },
      "transcript":  { "type": "text", "analyzer": "english" },
      "channel_authority": { "type": "float" },
      "view_count":  { "type": "long" },
      "like_rate":   { "type": "float" },
      "upload_time": { "type": "date" }
    }
  }
}

Query construction (Elasticsearch DSL):
{
  "query": {
    "function_score": {
      "query": {
        "multi_match": {
          "query": "python tutorial",
          "fields": ["title^3", "tags^2", "description", "transcript"]
        }
      },
      "functions": [
        { "field_value_factor": { "field": "channel_authority", "factor": 1.5 } },
        { "field_value_factor": { "field": "like_rate", "factor": 1.2 } },
        { "gauss": { "upload_time": { "scale": "30d", "decay": 0.5 } } }
      ]
    }
  }
}

Personalization layer (post-search reranking):
  1. Get top 100 results from Elasticsearch
  2. For each result: personalization_score = user_topic_affinity[video.category]
  3. Final score = 0.7 × text_score + 0.3 × personalization_score
  4. Re-rank and return top 20

Index update pipeline:
  Video published → Kafka event → search-indexer consumer → ES bulk index
  Latency: video available in search within ~2 minutes of publish`,
    },
    {
      id: "commentService",
      title: "Comment Service — LLD",
      description: "Threaded comments with ML moderation — billions of comments",
      api: `POST /api/v1/videos/{videoId}/comments
{
  "body": "Great video! Really helpful.",
  "parent_id": null    // null for top-level, comment_id for reply
}
Response:
{
  "comment_id": "Ugx_abc123",
  "video_id": "dQw4w9WgXcQ",
  "author": { "channel_id": "UC_user1", "name": "John Doe" },
  "body": "Great video! Really helpful.",
  "parent_id": null,
  "like_count": 0,
  "reply_count": 0,
  "created_at": "2026-04-23T12:00:00Z",
  "status": "published"    // or "held_for_review"
}

GET /api/v1/videos/{videoId}/comments?sort=top&limit=20&cursor=<cursor>
(sort = top | newest)

GET /api/v1/comments/{commentId}/replies?limit=10&cursor=<cursor>

POST /api/v1/comments/{commentId}/like
DELETE /api/v1/comments/{commentId}  (author or channel owner only)`,
      internals: `PostgreSQL schema:
CREATE TABLE comments (
  comment_id  TEXT PRIMARY KEY,     -- YouTube-style ID (Ugx_...)
  video_id    UUID NOT NULL,
  author_id   UUID NOT NULL,
  parent_id   TEXT REFERENCES comments(comment_id),
  body        TEXT NOT NULL CHECK (length(body) <= 10000),
  like_count  INT DEFAULT 0,
  reply_count INT DEFAULT 0,
  status      TEXT DEFAULT 'published',  -- published|held|removed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX comments_video_top ON comments (video_id, like_count DESC, created_at DESC)
  WHERE parent_id IS NULL AND status = 'published';
CREATE INDEX comments_replies ON comments (parent_id, created_at ASC)
  WHERE status = 'published';

Moderation pipeline:
  1. POST comment received
  2. ML classifier runs synchronously (< 50ms):
     - Model: fine-tuned BERT on YouTube comment dataset
     - Outputs: hate_score, spam_score, adult_score (each 0–1)
  3. Decision:
     MAX(hate_score, spam_score) > 0.9 → status='removed', return 200 (silent remove)
     MAX score 0.6–0.9            → status='held', appears in creator review queue
     MAX score < 0.6              → status='published', returned in API response
  4. Creator review: GET /creator/comments/held → approve or remove

Like counter (eventual consistency):
  POST /comments/{id}/like → write to Redis: INCR comment:likes:{id}
  Background job every 60s: flush Redis counts → PostgreSQL UPDATE
  Read: like_count from PostgreSQL (may lag by up to 60s)
  Acceptable: comment likes don't need real-time accuracy`,
    },
    {
      id: "viewCountService",
      title: "View Count Service — LLD",
      description: "Counting 1B+ views/day — sharded counters + bot filtering",
      api: `POST /api/v1/playback/view
(Fired by client player after 30 seconds of watch time)
{
  "video_id": "dQw4w9WgXcQ",
  "session_id": "sess_xyz",
  "client_ip_hash": "SHA256(ip)",    // hashed client-side for privacy
  "device_type": "mobile",
  "watch_duration_sec": 45,
  "quality": "720p"
}
Response: { "status": "accepted" }
(Fire-and-forget — client doesn't wait for validation result)

GET /api/v1/videos/{videoId}/stats
Response:
{
  "video_id": "dQw4w9WgXcQ",
  "view_count": 1400000000,     // approximate, updated every ~5 min
  "like_count": 16000000,
  "dislike_count": null,        // YouTube removed public dislike counts in 2021
  "comment_count": 3500000,
  "stats_updated_at": "2026-04-23T11:55:00Z"
}`,
      internals: `View validation pipeline (Kafka consumer, Flink):
  Event consumed from: video-view-events topic
  Validation rules:
    • watch_duration_sec < 30 → discard (minimum for valid view)
    • Same session_id + video_id within 1 hour → deduplicate
    • Same ip_hash → same video → > 10 events/hour → bot suspect → flag
    • Events without matching playback start event → discard

Sharded counter architecture (Bigtable):
  Row key: video_id + "#" + shard_id (shard_id = random 0–99)
  On view event: SHARD = rand(0,99), increment row video_id#SHARD
  Read total: SUM over all 100 shards for video_id
  Why: 100 shards → each shard gets 1/100 of write load
       viral video: 10K views/min → 100 writes/min per shard (manageable)

Aggregation flow:
  Flink window: 60-second tumbling window per video_id
  Output: (video_id, count_delta) batch
  Writer: Bigtable ATOMIC INCREMENT on shard cells
  Read-path: Bigtable ReadRow → sum columns → cache in Redis (TTL 5 min)

Creator Studio stats (more accurate, slower):
  Separate pipeline: exact counts with deduplication, updated every 15 min
  Viewer sees "approximate" public count; creator sees accurate analytics
  Difference: creator analytics = true deduplicated count
             public view count = fast approximate count (may differ by ~1–2%)`,
    },
  ],
};

export const YOUTUBE_QNA = [
  {
    id: "yq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Google", "Meta", "Netflix"],
    question: "Design YouTube at a high level. Walk me through what happens when a creator uploads a video and when a viewer watches it.",
    answer: `Start with scale: 2.7B users, 500 hours uploaded/minute, 1B hours watched/day. Two separate flows.

UPLOAD FLOW (async pipeline):
1. Creator uploads via chunked HTTP (8 MB chunks, resumable)
2. Raw video lands in blob store (GCS)
3. Pub/Sub event triggers Transcode Orchestrator
4. Parallel FFmpeg workers produce: 144p/240p/360p/480p/720p/1080p/4K variants
5. Output: DASH segments (2–10s each) + HLS fallback + thumbnails
6. Segments pushed to CDN edge nodes; video status → PUBLISHED

WATCH FLOW (real-time, target < 200ms to first frame):
1. Client fetches video metadata (Redis cache → Spanner fallback)
2. Auth validated, signed manifest URL generated (HMAC, 6h expiry)
3. Client fetches DASH manifest from CDN
4. Player selects initial quality based on bandwidth estimate
5. Client fetches first 3 segments from CDN → playback begins
6. Player continuously monitors bandwidth; steps quality up/down per segment

KEY INSIGHT TO STATE:
"Upload and playback are completely decoupled. The upload pipeline is async — creator sees status=PROCESSING immediately. Video segments are immutable CDN objects — Cache-Control: max-age=86400. Perfect cache hit rate for popular content. The CDN does the heavy lifting, not our origin."`,
    followups: [
      "How do you handle a video that goes viral immediately after upload?",
      "What happens if a transcode worker crashes mid-job?",
      "How do you ensure a creator's video is only accessible to their intended audience?",
    ],
  },
  {
    id: "yq2",
    category: "Video Streaming",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["Google", "Amazon", "Twitch"],
    question: "How does YouTube serve video to millions of concurrent viewers without buffering?",
    answer: `Three systems working together: ABR, CDN, and pre-fetching.

ADAPTIVE BITRATE (ABR) — the client-side protocol:
• Video stored as 2–10 second segments at each quality (144p to 4K)
• Client player monitors bandwidth every 2s
• If bandwidth drops → switch to smaller segment for next chunk
• Viewer experience: imperceptible quality change vs hard stutter/buffer
• Key: no server state — all quality decisions made client-side from manifest

CDN ARCHITECTURE — the delivery network:
• Google operates 100+ PoPs globally
• Anycast DNS: request resolves to nearest healthy PoP
• Segment cache key: video_id + quality + segment_number
• Segments are immutable → perfect caching, no invalidation needed
• Popular content hit rate: 99%+ (top 1% of videos = 90%+ of traffic)
• Long-tail: low-traffic videos served from origin (few requests, cache inefficient)

PRE-FETCHING — hide latency:
• CDN pre-fetches segments N+1, N+2, N+3 when serving segment N
• Client buffers 30s ahead at all times
• Result: even if CDN round-trip takes 100ms, viewer never notices (buffer absorbs)

PROTOCOL:
• HTTP/2: multiplexed requests, single TCP connection for multiple segments
• QUIC (HTTP/3): 20% latency reduction vs TCP for mobile (no head-of-line blocking)`,
    followups: [
      "How do you handle live streaming differently from VOD?",
      "What's the tradeoff between shorter segments (better ABR) and longer segments (better cache efficiency)?",
      "How does YouTube handle a CDN PoP going down while viewers are mid-stream?",
    ],
  },
  {
    id: "yq3",
    category: "Scale",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Google", "YouTube", "Meta"],
    question: "Design the view count system for YouTube. How do you count 1 billion views per day without destroying your database?",
    answer: `This is a write-throughput problem. 1B views/day = ~11,500 views/sec average, much higher at peaks.

THE NAIVE APPROACH (broken):
  UPDATE videos SET view_count = view_count + 1 WHERE video_id = ?
  For a viral video: 100K views/hour = 28 writes/sec on a single row
  Row-level locking → serialized writes → throughput ceiling

SOLUTION — Three-stage pipeline:

STAGE 1 — Async event ingestion (no DB involved):
  Client fires POST /playback/view after 30s watch (fire-and-forget)
  Validation: < 30s → discard; same session + same video → deduplicate
  Valid event → Kafka: video-view-events topic
  Return 200 immediately (no DB write on hot path)

STAGE 2 — Stream aggregation (Flink, 60-second windows):
  Flink consumes Kafka events
  Tumbling 60s window per video_id → produces (video_id, count_delta)
  Writes batch increments to Bigtable (not per-event)
  Sharded counters: row key = video_id#shard(0-99)
  → 10K views/min on viral video = 100 Bigtable writes/min per shard (trivial)

STAGE 3 — Read path (cache):
  Read: SUM across 100 shards for video_id → cache in Redis (TTL 5 min)
  Public display: approximate, may lag by 5 min — "1.2M views" is fine
  Creator analytics: separate exact-count pipeline (15 min lag, fully deduplicated)

BOT DETECTION (Flink streaming):
  Same IP → same video → >10 events/hour → flag, hold increments
  Events without matching playback start → discard
  Flagged counts released after ML classifier confirms legitimate traffic`,
    followups: [
      "How do you ensure the count is consistent — no views are double-counted or missed?",
      "How does YouTube handle view count manipulation (e.g., coordinated fake views)?",
      "How would you design the creator analytics dashboard to show exact view counts vs the public approximate count?",
    ],
  },
  {
    id: "yq4",
    category: "Recommendations",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Google", "Netflix", "Spotify"],
    question: "Design YouTube's recommendation system. How do you personalize the homepage for 2.7 billion users?",
    answer: `Personalization at this scale requires a two-stage pipeline — you cannot run a deep ML model over 800M videos per user per page load.

SCALE CONSTRAINT:
  2.7B users × homepage request every session
  800M videos × ranking model = impossible to score all videos per user

TWO-STAGE ARCHITECTURE:

STAGE 1 — CANDIDATE GENERATION (fast, cheap: 800M → ~500):
  Offline: matrix factorization on user × video interaction matrix
  Each user has an embedding vector; each video has an embedding vector
  Candidate = top-k videos by cosine similarity to user embedding
  Pre-compute: user embeddings updated daily on Spark (90-day watch history)
  Latency: ~20ms (ANN lookup, not full matrix multiplication)

  Multiple candidate sources (diversify):
  • Watch history continuation: "you watched A, B, C — here's D, E"
  • Subscriptions: latest from channels user follows
  • Topic similarity: videos similar to recent watches (same embedding space)
  • Trending: top videos globally × topic filter

STAGE 2 — RANKING (expensive model on small candidate set: 500 → 20):
  Deep NN with features per (user, video) pair:
  • watch_probability: P(watches > 50%)
  • satisfaction_score: P(user likes/shares/rates positively)
  • diversity_penalty: penalize if too similar to already-selected items
  • freshness_boost: newer content preferred, especially from subscriptions
  • context features: time of day, device, session length so far
  → Scores all 500 candidates in < 50ms

WHAT YOUTUBE OPTIMIZES FOR:
  NOT just clicks (clickbait problem)
  NOT just watch time (background autoplay inflates this)
  Multi-objective: watch probability + satisfaction survey signal + session retention`,
    followups: [
      "How do you avoid filter bubbles where users only see content they already agree with?",
      "How do you handle a brand new user with no watch history (cold start)?",
      "How would you A/B test a recommendation algorithm change affecting billions of users?",
    ],
  },
  {
    id: "yq5",
    category: "Storage",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["Google", "Amazon", "Microsoft"],
    question: "Design the storage system for YouTube. How do you store and serve 800 million videos across all quality levels?",
    answer: `Storage is a multi-tier problem: what to store, at what quality, on what medium.

STORAGE TIERS (cost optimization):
  Hot (< 30 days or top 1% by traffic): Standard GCS — fast, expensive
  Warm (30–365 days): Nearline GCS — 3× cheaper, acceptable ~5ms access
  Cold (> 1 year, < 1% monthly access): Coldline GCS — 10× cheaper, no SLA
  Auto-tiering: lifecycle policies move videos automatically

SCALE MATH:
  500 hours uploaded/minute
  10-min 1080p video ≈ 2 GB raw; all qualities ≈ 3 GB total
  500 hours/min = 3,000 videos/min × 3 GB = 9 TB/min = 13 PB/day raw
  After compression and dedup: practical ~3–4 PB/day added storage

WHAT'S STORED PER VIDEO:
  • Raw original (never deleted — needed for future re-encoding)
  • Transcoded DASH segments per quality: ~8 quality levels × N segments
  • Audio-only track (for viewers switching to audio-only)
  • Thumbnail sprites (one image containing all thumbnail frames)
  • Subtitles (VTT format per language)
  • Metadata in Spanner (title, description, tags, status)

CDN AS CACHE LAYER:
  Only popular segments cached at edge (~1% of content = 90% of traffic)
  CDN doesn't store originals — only transcoded segments
  Long-tail video requests serve from GCS origin directly (cost-efficient)

RE-ENCODING STRATEGY:
  YouTube periodically re-encodes old videos with newer codecs (VP9, AV1)
  AV1 → 30–50% smaller file size vs H.264 at same quality
  Raw original preserved → re-encode any time without quality loss`,
    followups: [
      "How do you handle the case where a codec update requires re-encoding 800M videos?",
      "How do you handle DMCA takedowns — remove a video from CDN and all caches?",
      "How would you design geo-restricted video delivery (available only in certain countries)?",
    ],
  },
  {
    id: "yq6",
    category: "Search",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Google", "LinkedIn", "Airbnb"],
    question: "Design YouTube Search. How do you return relevant results in < 200ms across 800 million videos?",
    answer: `Search is a pipeline: index offline, query online in parallel, rank and personalize.

INDEX BUILDING (offline, not on query path):
  When video published → index worker reads metadata → bulk index to Elasticsearch
  Fields indexed: title (boost 3×), tags (boost 2×), description, transcript (auto-generated via speech-to-text)
  Channel authority pre-computed: function of subscriber count + average engagement rate
  Index update latency: video searchable within ~2 minutes of publish

QUERY EXECUTION (< 100ms target):
  Elasticsearch multi-match query across indexed fields
  BM25 text scoring + field boosts
  Function scoring: multiply by channel_authority + like_rate + freshness decay
  Result: top 100 videos by combined score

PERSONALIZATION LAYER (post-search, < 50ms):
  For each of top 100 results:
    personalization_score = user_topic_affinity_model[video.category]
  Final score = 0.7 × text_score + 0.3 × personalization_score
  Re-rank → return top 20

AUTOCOMPLETE (< 50ms, Redis):
  Prefix sorted set per first-letter bucket
  Populated from: historical search frequency (top 1M queries)
  Query: ZRANGEBYLEX autocomplete "[py" "[py\\xff" LIMIT 0 10

CACHING:
  Popular queries cached: "python tutorial" → same results for 5 min
  Cache key = query_text (without user ID — personalization applied after)
  Hit rate: top 0.1% of queries account for ~30% of search volume

RANKING SIGNALS (not just text match):
  Text relevance (BM25): necessary but not sufficient
  Channel authority: verified, large channels rank higher on ambiguous queries
  Engagement rate: like/view ratio signals quality
  Freshness: news/tutorial queries prefer recent videos`,
    followups: [
      "How do you handle multi-language search when the query is in Hindi but video is in English?",
      "How would you implement 'filter by duration' or 'filter by upload date' efficiently?",
      "How do you prevent low-quality channels from gaming search rankings with keyword stuffing?",
    ],
  },
  {
    id: "yq7",
    category: "Live Streaming",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Google", "Twitch", "Amazon"],
    question: "How would you extend YouTube's architecture to support live streaming? What changes vs VOD?",
    answer: `Live streaming flips the upload pipeline upside down — latency matters more than throughput optimization.

KEY DIFFERENCES (Live vs VOD):

1. NO TRANSCODE QUEUE — must be real-time:
   VOD: transcode async in 5–10 min, that's fine
   Live: transcode must happen in < 2s or stream falls behind real time
   Solution: dedicated live transcoder with hardware acceleration (GPU/ASIC)
   Software FFmpeg too slow — use NVENC (NVIDIA) or VideoToolbox (Apple) for < 500ms transcode

2. INGEST PROTOCOL — RTMP not HTTP:
   VOD: chunked HTTP upload (latency doesn't matter)
   Live: RTMP (Real-Time Messaging Protocol) — persistent TCP connection, constant stream
   Creator streams from OBS/encoder → YouTube Live Ingest servers
   Ingest server receives continuous video → slices into short segments (1–2s for live vs 6–10s for VOD)

3. SEGMENT DISTRIBUTION — push not pull:
   VOD: segments exist on CDN, clients pull on demand
   Live: new segments created every 1–2s → must be pushed to CDN immediately
   Live segment pipeline: Ingest → Transcode → Push to CDN edge → Update live manifest
   End-to-end latency: 10–30s (acceptable for live; "ultra-low latency" mode = 3–5s)

4. MANIFEST IS MUTABLE:
   VOD manifest: static file, cached forever
   Live manifest: updated every 1–2s with new segment URLs
   CDN cache TTL = 2s for live manifests (short TTL to get new segments)
   Client polls manifest every 1–2s to discover new segments

5. CHAT (new component):
   WebSocket-based, persistent connection per viewer
   Pub/Sub fanout: 1 message → broadcast to millions of viewers
   Rate limiting: max 1 message/3s per user
   Moderation: same ML pipeline as comments

ARCHITECTURE ADDITION:
  RTMP Ingest → GPU Transcode → Live Segment Store → CDN Push → Viewer
                                                   ↓
                                           Live Manifest Server (updates every 1–2s)`,
    followups: [
      "How do you handle 100,000 concurrent viewers all starting to watch at the same moment (stream launch)?",
      "How do you detect and handle a stream going offline mid-broadcast?",
      "What are the tradeoffs between lower latency and better stream quality?",
    ],
  },
  {
    id: "yq8",
    category: "Content Safety",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["Google", "Meta", "TikTok"],
    question: "Design YouTube's content moderation system. How do you review 500 hours of new video every minute?",
    answer: `Impossible to watch every video. Solution: ML classifiers, automated actions, and human review as the final tier.

SCALE CONTEXT:
  500 hours/minute = 720K hours/day
  At 8 hours/day, you'd need 90,000 human reviewers to watch everything
  (And that's just 1× playback, no analysis time)
  → ML must handle the bulk, humans review edge cases

THREE-TIER PIPELINE:

TIER 1 — AUTOMATED DETECTION (runs during transcode, before publish):
  Vision ML model: sample every 30s of video
  Audio ML model: speech-to-text → classify transcript
  Signals detected: nudity, graphic violence, hate speech, child safety, spam
  Action on high-confidence violation (score > 0.95): auto-remove, creator notified
  Volume: handles ~99% of clear violations without human review

TIER 2 — HUMAN REVIEW QUEUE (ambiguous cases):
  Score 0.7–0.95: video published with limited distribution (not in search/recommendations)
  Queued for human reviewer within 24 hours
  Reviewer UI: video + ML explanation + policy reference
  Decision: approve (full distribution) | remove | age-restrict | monetize-disable

TIER 3 — REACTIVE (user reports):
  Any viewer can report: Report button → category selection
  High-report-velocity videos (many reports in short time) → priority queue
  Trusted Flagger program: NGOs, experts, government partners with elevated report weight

HASH-BASED DETECTION (PhotoDNA equivalent):
  Known CSAM content: perceptual hash database (shared industry-wide)
  Every frame hashed → compare against known-bad hash list
  Match → immediate remove + report to NCMEC (legal requirement)
  Advantage: catches re-uploads of known content instantly, no ML needed

APPEALS:
  Creator can appeal automated removal
  Human reviewer re-evaluates with full context
  SLA: response within 7 days (CSAM and terrorism: no appeal)`,
    followups: [
      "How do you avoid false positives that remove legitimate educational or news content?",
      "How do you handle content that is legal in some countries but illegal in others?",
      "How would you design the reviewer's work queue to prioritize the most harmful content?",
    ],
  },
];
