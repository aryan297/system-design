export const TIKTOK_HLD = {
  title: "TikTok — High Level Design",
  subtitle: "Short-video platform — 1.7B users, 1B daily active, For You Page recommendation, 34 min/day avg session",
  overview: `TikTok is the world's fastest-growing social platform, reaching 1 billion monthly active users in under 5 years — faster than any platform in history. Unlike Facebook or Instagram where the feed is driven by social graph (who you follow), TikTok's core innovation is the For You Page (FYP): a fully interest-based feed where a brand-new account with zero followers immediately sees highly relevant content.

This shifts the hard problem from "grow your social graph" to "predict what content a user will engage with given almost no history." TikTok solves this with a two-tower deep learning recommendation model that uses implicit signals (watch time, replay, share, skip) rather than explicit ones (likes, follows), combined with a multi-stage candidate pipeline that goes from billions of videos to the 300 served per session in milliseconds.

Core engineering challenges: video transcoding at scale (500M videos uploaded per day), low-latency global CDN for 15-second to 3-minute videos, real-time recommendation inference for 1B users, live streaming at < 1-second latency, and content moderation at petabyte scale.`,

  metrics: [
    { label: "Monthly active users", value: "1.7B",    note: "as of 2024" },
    { label: "Daily active users",   value: "1B+",     note: "~60% of MAU" },
    { label: "Avg session length",   value: "34 min",  note: "highest of any social app" },
    { label: "Videos uploaded/day",  value: "500M+",   note: "estimated" },
    { label: "FYP refresh latency",  value: "< 200ms", note: "recommendation serving" },
    { label: "Video delivery CDN",   value: "99.9%",   note: "availability target" },
    { label: "Live stream latency",  value: "< 1s",    note: "end-to-end" },
    { label: "Content moderation",   value: "< 24hr",  note: "human review SLA" },
  ],

  diagram: `
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                    │
│              iOS · Android · Web · Creator Studio                      │
└────────────────────────┬───────────────────────────────────────────────┘
                         │  HTTPS / WebRTC (live) / WebSocket (realtime)
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│              API GATEWAY (Global — 150+ PoPs)                          │
│    Auth (JWT) · Rate Limiting · Geo-routing · CDN Token Signing        │
└──┬──────────┬────────────┬──────────────┬────────────────┬─────────────┘
   │          │            │              │                │
   ▼          ▼            ▼              ▼                ▼
┌───────┐ ┌───────┐ ┌──────────┐ ┌────────────┐ ┌─────────────────┐
│Upload │ │  FYP  │ │  Social  │ │   Live     │ │   Moderation    │
│Service│ │Engine │ │  Graph   │ │  Streaming │ │   Service       │
└───┬───┘ └───┬───┘ └────┬─────┘ └─────┬──────┘ └─────────────────┘
    │         │           │             │
    ▼         ▼           │             │
┌──────────────────┐      │             │
│ Transcoding Farm │      ▼             ▼
│ (FFmpeg cluster) │ ┌────────────────────────────────────────────┐
└──────────────────┘ │              KAFKA EVENT BUS               │
         │           │  video.uploaded · user.action · live.start  │
         ▼           └────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                     │
│  Object Storage / S3 (raw + transcoded video) · Redis (feed, sessions) │
│  MySQL (user, social graph) · HBase / Cassandra (interactions at scale)│
│  Elasticsearch (video search) · ClickHouse (analytics)                 │
│  Feature Store (Redis + offline) · Model Registry (recommendation ML)  │
└────────────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    GLOBAL CDN (Akamai / custom)                        │
│    Edge caches transcoded video segments · Token-auth for private      │
└────────────────────────────────────────────────────────────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Video Upload & Processing Pipeline",
      sections: [
        {
          title: "Upload Pipeline — From Phone to CDN in Under 5 Minutes",
          content: `500 million videos uploaded daily. The pipeline must be reliable, resumable, and produce multiple quality variants without blocking the creator.

RESUMABLE UPLOAD:
  Large files (up to 10 GB for 10-minute creator videos) need resumable upload
  Protocol: TUS (open standard) or chunk-based with client-side retry
  1. Client requests upload URL: POST /v1/upload/init → {upload_id, presigned_s3_urls[]}
  2. Client chunks video into 4 MB parts → uploads to S3 directly (bypasses TikTok servers)
  3. On completion: POST /v1/upload/complete → triggers processing pipeline
  4. On resume (network drop): GET /v1/upload/{upload_id}/status → resume from last chunk

WHY UPLOAD DIRECTLY TO S3:
  Bandwidth: 500M videos × average 50 MB = 25 PB/day ingress → TikTok servers would be overwhelmed
  S3 multi-part upload: client uploads in parallel chunks → 10× faster on good connection
  Server only handles metadata, not bytes

RAW STORAGE:
  Every uploaded video stored in raw form first (preservation before processing)
  S3 bucket: tiktok-raw-uploads/{creator_id}/{video_id}/{timestamp}.mp4
  Retention: raw stored 30 days → deleted after all transcoded versions confirmed good

METADATA ON UPLOAD:
  Client sends alongside video: caption, hashtags, sound_id, privacy, filter_ids, location
  Stored in MySQL: videos table (draft status until processing completes)
  Draft is not surfaced in FYP until processing pipeline marks it ready`,
        },
        {
          title: "Transcoding — One Upload, 12 Output Formats",
          content: `A single uploaded video must be converted to multiple resolutions and codecs to serve every device and network condition on the planet.

OUTPUT FORMATS PRODUCED:
  Resolution variants: 1080p, 720p, 480p, 360p, 240p
  Codec variants: H.264 (universal compatibility), H.265/HEVC (50% smaller at same quality), AV1 (newest, best compression)
  HDR version if source is HDR
  Audio: AAC-LC (standard), Opus (for WebRTC/live)
  Thumbnails: 3 frames extracted (0.5s, 25%, 75% of duration)
  Animated preview GIF: 3-second loop for hover preview

TRANSCODING ARCHITECTURE:
  Kafka consumer: video.uploaded event → transcoding job dispatcher
  Job queue: per-priority queues (verified creators = high priority, new accounts = standard)
  Worker pool: GPU-accelerated FFmpeg instances on auto-scaling EC2/K8s pods
  Output: each variant uploaded to S3: tiktok-cdn/{video_id}/{quality}/{segment}.ts
  HLS segmentation: 2-second segments for adaptive streaming

ADAPTIVE BITRATE (ABR):
  Video segmented into 2-second HLS (.ts) chunks
  Master playlist (.m3u8) lists all quality variants with bandwidth hints
  Player monitors bandwidth in real-time → switches to appropriate quality tier
  Target: smooth playback > no buffering, even at 1 quality step lower

PROCESSING SLA:
  Short videos (< 60s): < 2 minutes to processing complete, CDN warm
  Long videos (> 5 min): < 10 minutes
  Verified creator with 1M+ followers: priority queue, < 1 minute for any length

THUMBNAIL SELECTION:
  3 auto-generated candidates shown to creator to choose cover frame
  If creator doesn't choose: ML selects "most engaging" thumbnail
  Engagement model trained on CTR data per thumbnail type (faces, action, text overlay)`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "For You Page — Recommendation Engine",
      sections: [
        {
          title: "The FYP Algorithm — From Billions of Videos to 300 Per Session",
          content: `The For You Page is TikTok's core product differentiator. It serves hyper-relevant content to users who follow nobody, using only implicit engagement signals.

THE FUNNEL (billions → 300):

Stage 1 — CANDIDATE RETRIEVAL (billions → 10,000):
  Goal: narrow the universe to a manageable set without being too restrictive
  Techniques:
    a. Collaborative filtering: "Users similar to you engaged with these videos" — embedding lookup
    b. Content-based: "You watched 3 cooking videos → retrieve more cooking content" — category index
    c. Social graph: "Creators you follow just posted" — push-based from creator's followers
    d. Trending: globally and locally trending videos (Kafka-computed, updated hourly)
    e. New content injection: fresh uploads (< 24h) given a chance to prove themselves
  Output: ~10,000 candidate video IDs fetched from inverted indexes in milliseconds

Stage 2 — LIGHTWEIGHT RANKING (10,000 → 500):
  Fast neural network (2-layer MLP) to score each of 10K candidates
  Features: video metadata + user history summary (category affinities)
  Runs on CPU — must complete in < 50ms for the whole set
  Output: top 500 by predicted engagement score

Stage 3 — DEEP RANKING (500 → 50):
  Full two-tower deep learning model — more expensive, but only 500 candidates
  User tower: embeddings of watch history, likes, shares, skips (last 200 interactions)
  Video tower: embeddings of audio, visual features, caption, hashtags, engagement velocity
  Dot product of user × video vectors → similarity score
  Additional signals: predicted completion rate, predicted share rate, predicted comment rate
  Runs on GPU inference cluster — < 100ms for 500 candidates

Stage 4 — RE-RANKING & DIVERSIFICATION (50 → served):
  Business rules applied on top of model scores:
    - No two consecutive videos from same creator
    - Insert sponsored content (ads) at positions 3, 8, 15, ...
    - Ensure category diversity: not 8 cooking videos in a row
    - Freshness boost: recently uploaded videos get +5% score
    - Safety filter: remove videos flagged by moderation in last 24h
  Output: ordered list of 30 videos pre-fetched, 300 queued for the session`,
        },
        {
          title: "User Signals & Feature Engineering",
          content: `TikTok uses implicit signals, not explicit ones. This is the key insight — what you do matters more than what you say you like.

SIGNAL HIERARCHY (strongest to weakest):

1. COMPLETION RATE (strongest):
   Watched 100% of a 60-second video → very strong positive signal
   Rewatched: played again without swiping → extremely strong
   Watched 50% then swiped → mild negative
   Swiped within 2 seconds → strong negative (content type to avoid)
   Why: completion is hard to fake, directly measures value delivered

2. SHARE:
   Shared to WhatsApp / Twitter / iMessage → strong positive
   Implies: "I found this valuable enough to bother my contacts with"

3. COMMENT:
   Typed a comment → strong engagement
   Comment sentiment (NLP): positive comment = stronger signal than negative

4. LIKE:
   Positive but weaker than completion + share
   Easy to give → slightly inflated signal

5. FOLLOW:
   Followed creator → strong interest signal for that creator's content type

REAL-TIME SIGNAL PROCESSING:
  Every user action → Kafka event → two consumers:
    a. Online feature store (Redis): update user's real-time feature vector (last 50 actions)
    b. Offline feature store: batch processed → retrain models nightly

COLD START (new user):
  0 signals → show globally trending content in user's locale
  After 5 videos watched: first signal detected → begin personalization
  After 20 videos: meaningful preference model available
  After 100 videos: full FYP personalisation active
  TikTok's cold start is best-in-class because completion rate signal kicks in immediately`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Video Delivery & CDN",
      sections: [
        {
          title: "Global Video Delivery — Pre-fetching Before You Swipe",
          content: `TikTok's video delivery feels instant because the next video is already on your device before you finish the current one.

CDN ARCHITECTURE:
  3-tier CDN:
    Edge PoPs (500+ locations): serve cached segments globally, < 20ms to nearest PoP
    Regional nodes (50 locations): origin shield, cache miss fills from here
    Origin (S3): source of truth, rarely hit directly

  Cache strategy per tier:
    Popular videos (top 1% by views): edge nodes, pre-warmed globally
    Normal videos: regional nodes on first request, edge on repeat
    Unpopular / old videos: origin-only, streamed on demand with regional cache on first play

PRE-FETCH STRATEGY:
  While user watches video N: client downloads first 5 seconds of video N+1 and N+2 in background
  On swipe to N+1: already buffered → instant playback
  Bandwidth tradeoff: ~30% of video downloaded is pre-fetched but never watched (user skips)
  Acceptable: the instant-play experience is TikTok's core UX differentiator

TOKEN-SIGNED URLS:
  Video URLs are time-limited and user-specific (prevents sharing private video CDN links)
  Token = HMAC(video_id + user_id + expiry + cdn_secret)
  CDN edge validates token before serving segment — invalid token → 403

ADAPTIVE BITRATE (HLS):
  Player measures effective bandwidth every 2 seconds
  If bandwidth drops: switch to lower quality tier
  Hysteresis: must sustain lower bandwidth for 4 seconds before downgrade (prevent oscillation)
  Rule: always prefer smooth playback over highest quality

REGIONAL COMPLIANCE:
  Videos of creators banned in certain countries: geo-blocked at CDN edge
  CDN PoP knows user's country from IP → checks block list → serves 403 + redirect to country-specific content`,
        },
        {
          title: "Storage Architecture at Petabyte Scale",
          content: `TikTok stores approximately 1 exabyte of video — the storage architecture must be cheap, durable, and globally accessible.

STORAGE TIERS:

Hot tier (< 30 days old or > 1M views):
  AWS S3 Standard or equivalent
  Instantly accessible, highest cost
  All transcoded variants stored

Warm tier (30–365 days, < 1M views):
  S3 Standard-IA (Infrequent Access) — 40% cheaper
  Same durability (11 nines), retrieval cost per GB

Cold tier (> 1 year, < 100K views):
  S3 Glacier — 80% cheaper than Standard
  4–12 hour retrieval time — acceptable for old/unpopular content
  Pre-warm on trending: if old video goes viral → auto-migrate back to hot tier

DEDUPLICATION:
  Creator uploads same video twice: perceptual hash comparison detects near-duplicates
  Store only once, reference by hash — significant storage saving (reposted content)
  Also used for copyright detection: known copyrighted content has registered perceptual hash

DELETION POLICY:
  User deletes video → soft delete (hide from FYP, not served)
  Hard delete: 30 days after soft delete (allows account recovery)
  Legal hold: some videos retained longer for law enforcement compliance
  Moderation-removed videos: kept in separate store for appeals and audit`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Social Graph & Real-Time Interactions",
      sections: [
        {
          title: "Social Graph — Follows, Fans, and Feed Generation",
          content: `TikTok's social graph is directional (follow ≠ friend) and must handle celebrity accounts with 100M+ followers.

GRAPH STORAGE:
  Adjacency list in MySQL (for OLTP):
    follows: (follower_id, followee_id, created_at) — indexed both directions
  Graph database (for traversal — Neo4j or custom):
    "Friends of friends" recommendations — who do popular people similar to you follow?

CELEBRITY PROBLEM:
  Charli D'Amelio has 150M followers
  Naive approach: on Charli's new post → fan-out to 150M follow-feeds → 150M writes
  This would take hours and consume enormous resources

HYBRID PUSH-PULL FEED STRATEGY:
  Accounts < 10K followers: push model
    On new post → write to all followers' feed queues (Kafka → Redis per-user feed list)
    Feed list: Redis LPUSH user:{id}:feed {video_id}, capped at 500 entries
  Accounts > 10K followers (celebrities): pull model
    On feed load: check which celebrities user follows → fetch their latest posts on-demand
    Merge celebrity posts with push-delivered posts from non-celebrity follows
  Result: celebrities never cause mass fan-out writes

INTERACTION COUNTERS (likes, views, comments):
  Naive: UPDATE videos SET like_count = like_count + 1 WHERE id = X
  Problem: Billie Eilish video gets 1M likes/hour → 1M DB writes/hour on single row
  Solution: Redis counter with periodic flush
    Redis INCR video:{id}:likes → in-memory, < 1ms
    Background job every 60 seconds: flush Redis counters to MySQL
    Reads: serve from Redis (fast, slightly eventual) → MySQL for exact count

COMMENT SYSTEM:
  Top-level comments: Cassandra (write-heavy, time-ordered retrieval)
  Nested replies: stored with parent_comment_id reference, max 2 levels
  Pagination: cursor-based on created_at timestamp
  Pinned comments: creator can pin top comment → separate column, always first in response`,
        },
        {
          title: "Duet, Stitch & Sound Graph",
          content: `TikTok's viral mechanics — Duet, Stitch, and reused sounds — create a content graph far richer than Instagram's simple reposts.

DUET:
  Creator records video side-by-side with original video
  Storage: Duet video stored as a new video with parent_video_id reference
  Rendering: client plays both videos in split-screen sync
  Attribution: original video gets view credit when duet is watched
  Viral loop: popular duet drives views back to original → creator benefits from others duetting them

STITCH:
  Creator clips up to 5 seconds from another video → adds their response
  Implementation: clip reference (video_id + start_ms + end_ms) stored, not re-encoded
  On play: stream original video clip first, then creator's response
  Copyright: original creator's likes/views count duet views — incentive alignment

SOUND GRAPH:
  Every video references a sound_id (original audio or licensed track)
  Sound trends propagate faster than any other signal — a new dance challenge spreads via sound
  Sound index: Cassandra table (sound_id → [video_ids using this sound], ordered by views)
  Recommendation: if sound X is trending → inject more videos using sound X into FYP
  Trending sounds page: pre-computed hourly from Kafka stream of sound usage events

HASHTAG SYSTEM:
  Hashtag challenge: brand pays TikTok → featured hashtag + challenge page
  Hashtag index: Elasticsearch with real-time count updates
  Trending: sliding window view count over last 24h → rank → serve trending hashtags page`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "Live Streaming",
      sections: [
        {
          title: "Sub-Second Live Streaming at Global Scale",
          content: `TikTok LIVE serves millions of concurrent streams globally with end-to-end latency under 1 second — a far harder problem than VOD delivery.

WHY LIVE IS HARDER:
  VOD: pre-encode → cache → serve (latency doesn't matter)
  Live: encode → transmit → decode → display — every millisecond counts
  Viewers must see the same moment within ~1 second — gifting, comments, reactions are synchronous

STREAMING STACK:

Ingest (Creator → Server):
  Protocol: RTMP (Real-Time Messaging Protocol) from creator's phone
  Alternative: SRT (Secure Reliable Transport) for unstable networks
  Creator's phone encodes: H.264 video @ 2–4 Mbps + AAC audio @ 128 kbps
  Nearest ingest PoP receives stream (latency to ingest: < 30ms from creator's phone)

Transcoding (Real-time, < 200ms):
  GPU transcoding cluster receives RTMP stream
  Produces: 1080p, 720p, 480p variants simultaneously (separate FFmpeg workers)
  Segmentation: 1-second HLS segments (vs 2-second for VOD) for lower latency
  Thumbnail: snapshot every 3 seconds for stream preview cards

Delivery (Server → Viewer):
  Protocol: CMAF (Common Media Application Format) low-latency HLS
  Target latency: 1–2 seconds end-to-end (vs 15–30 seconds for standard HLS)
  CDN: live origin → regional nodes → edge → viewer
  Viewer joins: receives last 3 seconds of buffer, then real-time

SCALE MANAGEMENT:
  Popular streamer (1M concurrent viewers): CDN fan-out handles delivery
  But: ingest point = single origin → must be highly available
  Ingest clustering: primary + standby ingest servers, automatic failover < 5 seconds
  Adaptive viewer quality: live stream viewer on 3G → 480p variant → good experience`,
        },
        {
          title: "Virtual Gifts & Creator Monetisation",
          content: `TikTok LIVE's monetisation model is virtual gifting — viewers send digital gifts (bought with real money) to creators in real-time.

GIFT FLOW:
  1. Viewer taps "Send Gift" (Rose = 1 coin, Universe = 34,999 coins)
  2. Deduct coins from viewer's wallet (Redis atomic decrement)
  3. Award Diamonds to creator (1 Diamond ≈ 0.05 USD)
  4. Send gift animation to all viewers in that live stream in real-time (WebSocket broadcast)
  5. Kafka event: gift.sent → leaderboard update, creator notification

COIN ECONOMY:
  Viewer purchases coins: 100 coins ≈ $1 USD (varies by region)
  TikTok takes ~50% cut on coin redemption (creator gets 50 cents per $1 gift value)
  Coin purchases processed via Stripe/App Store/Google Play

REAL-TIME GIFT DISPLAY:
  Popular streams: hundreds of gifts/second → must be efficient
  WebSocket message: {gift_type, sender_name, count} broadcast to all viewers
  If > 100 gifts/second: batch and send aggregated count every 500ms (prevent UI overload)
  Top gifter leaderboard: Redis sorted set ZADD stream:{id}:gifters {coin_amount} {user_id}
    → ZREVRANGE stream:{id}:gifters 0 2 → top 3 gifters always visible in stream UI

CREATOR DASHBOARD:
  Real-time viewer count: Redis SCARD stream:{id}:viewers (set of active viewer IDs)
  Peak concurrent: ClickHouse analytics
  Earnings: running Diamond total updated per gift, payout processed weekly`,
        },
      ],
    },
    {
      id: "phase6",
      label: "Phase 6",
      title: "Content Moderation & Safety",
      sections: [
        {
          title: "Automated Moderation at Petabyte Scale",
          content: `TikTok receives 500M video uploads per day. Human review of everything is impossible — automated systems must catch the vast majority.

MODERATION PIPELINE (runs on every upload):

Stage 1 — Hash matching (< 100ms):
  PhotoDNA / perceptual hash comparison against databases:
    - CSAM (Child Sexual Abuse Material): NCMEC hash database — mandatory, immediate removal + law enforcement report
    - Known terrorist content: GIFCT hash database — immediate removal
    - Repeat policy violations: TikTok's own hash DB of previously removed content
  Hash match = instant block, no human review needed
  Handles: exact copies and near-duplicates of known bad content

Stage 2 — ML classifiers (< 5 seconds):
  Computer vision models running on GPU:
    - NSFW detector: nudity, sexual content score (0–1)
    - Violence detector: graphic violence, gore score
    - Hate speech: text overlay OCR → NLP classifier for hate speech
    - Spam/Scam detector: video patterns common in financial scams, MLM
  Audio: speech-to-text → NLP for policy violations in spoken content
  Each classifier produces confidence score → threshold determines auto-remove vs human queue

Stage 3 — Human review (< 24 hours):
  Videos scoring 0.3–0.7 on any classifier: queued for human reviewer
  Human reviewers: follow country-specific guidelines (legal and cultural context)
  Reviewer decision: approve / remove / age-restrict / limited distribution
  Limited distribution: video exists but FYP won't amplify it (soft suppression)

APPEALS:
  Creator can appeal any removal → second human reviewer
  If appealed: target 72-hour review SLA
  Repeat wrongful removal: account-level flag, more conservative moderation thresholds`,
        },
        {
          title: "Privacy, Data Governance & Regulatory Compliance",
          content: `TikTok operates under intense regulatory scrutiny in multiple jurisdictions. Data handling is a first-class engineering concern.

PROJECT TEXAS (US data):
  Response to US Congress concerns about ByteDance (Chinese parent) accessing US user data
  All US user data stored exclusively on Oracle Cloud Infrastructure in US
  Access controls: no ByteDance engineer outside US can access US user data without US-based approval
  Data routing: US users' traffic routed to US-only infrastructure
  Audit: third-party auditors monitor access logs in real-time

GDPR (EU):
  Data residency: EU user data stored in Ireland and Norway data centres
  Right to deletion: user data purged within 30 days of account deletion request
  Portability: users can download their data archive (JSON export of all data)
  Consent management: granular consent for each data use case (ads personalisation, research)
  DPA (Data Processing Agreement) with every third-party vendor

MINOR PROTECTION:
  Age gate: users under 13 not permitted
  13–15: default privacy = friends only, no DM, no live streaming
  16–17: no live gifts (cannot spend money), restricted messaging
  Age verification: challenged by difficulty of reliable age verification at scale
  Family pairing: parent links their account to teen's → controls screen time, content filter

DATA MINIMISATION:
  Location: city-level only by default (not precise GPS)
  Face recognition: opt-in only in jurisdictions where legally permitted
  Ad targeting: interest-based allowed, sensitive categories (health, religion, race) excluded`,
        },
      ],
    },
  ],
};

export const TIKTOK_LLD = {
  title: "TikTok — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of core TikTok services",

  components: [
    {
      id: "uploadService",
      title: "Video Upload Service — LLD",
      description: "Resumable multipart upload to object storage with metadata capture and processing pipeline trigger",
      api: `-- Step 1: Initialise upload --
POST /v1/upload/init
Authorization: Bearer {jwt}

{
  "filename": "dance_video.mp4",
  "file_size_bytes": 52428800,         // 50 MB
  "duration_ms": 29500,
  "caption": "New dance trend 🔥 #fyp #dance",
  "hashtags": ["fyp", "dance", "trending"],
  "sound_id": "snd_7abc123",
  "privacy": "PUBLIC",                 // PUBLIC / FRIENDS / PRIVATE
  "allow_duet": true,
  "allow_stitch": true,
  "allow_download": false
}

Response 200:
{
  "upload_id": "upl_9876xyz",
  "video_id": "vid_20260430_abc123",   // pre-assigned, used throughout
  "upload_urls": [
    { "part": 1, "url": "https://s3.../vid_abc123/part1?signature=...", "expires_at": "..." },
    { "part": 2, "url": "https://s3.../vid_abc123/part2?signature=...", "expires_at": "..." }
  ],
  "chunk_size_bytes": 5242880          // 5 MB chunks
}

-- Step 2: Client uploads each chunk directly to S3 (presigned URL) --

-- Step 3: Complete upload --
POST /v1/upload/complete
{
  "upload_id": "upl_9876xyz",
  "parts": [
    { "part": 1, "etag": "abc123" },
    { "part": 2, "etag": "def456" }
  ]
}

Response 200:
{
  "video_id": "vid_20260430_abc123",
  "status": "PROCESSING",
  "estimated_ready_at": "2026-04-30T10:17:00Z"
}

-- Resume interrupted upload --
GET /v1/upload/{upload_id}/status
Response: { "uploaded_parts": [1, 3, 5], "missing_parts": [2, 4] }

-- Video Schema --
CREATE TABLE videos (
  video_id         TEXT PRIMARY KEY,
  creator_id       UUID NOT NULL,
  status           TEXT DEFAULT 'PROCESSING',
  -- PROCESSING / READY / FAILED / DELETED / MODERATION_HOLD
  caption          TEXT,
  sound_id         TEXT,
  privacy          TEXT DEFAULT 'PUBLIC',
  allow_duet       BOOLEAN DEFAULT true,
  allow_stitch     BOOLEAN DEFAULT true,
  allow_download   BOOLEAN DEFAULT false,
  parent_video_id  TEXT,               -- for duets/stitches
  duration_ms      INT,
  raw_s3_key       TEXT,
  width            INT,
  height           INT,
  view_count       BIGINT DEFAULT 0,
  like_count       BIGINT DEFAULT 0,
  comment_count    BIGINT DEFAULT 0,
  share_count      BIGINT DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now(),
  published_at     TIMESTAMPTZ,
  INDEX (creator_id, created_at DESC),
  INDEX (status, created_at)
);`,
    },
    {
      id: "transcodingService",
      title: "Transcoding Service — LLD",
      description: "Distributed FFmpeg cluster producing HLS multi-quality output from uploaded raw video",
      api: `-- Kafka event triggers transcoding --
Topic: video.uploaded
{
  "video_id": "vid_20260430_abc123",
  "creator_id": "usr_xyz789",
  "raw_s3_key": "raw/vid_20260430_abc123/original.mp4",
  "duration_ms": 29500,
  "priority": "STANDARD"              // HIGH (verified) / STANDARD / LOW (new account)
}

-- Transcoding Job --
1. Download raw video from S3 to local SSD
2. Probe video: resolution, codec, duration, has_audio, frame_rate
3. Launch parallel FFmpeg processes:

   -- 1080p H.264 --
   ffmpeg -i input.mp4 -vf scale=1920:1080 -c:v libx264 -crf 23 -preset fast
     -c:a aac -b:a 128k -hls_time 2 -hls_segment_type mpegts
     -hls_list_size 0 output_1080p.m3u8

   -- 720p H.264 --
   ffmpeg -i input.mp4 -vf scale=1280:720 -c:v libx264 -crf 24 -preset fast ...

   -- 480p H.265 (HEVC, 50% smaller) --
   ffmpeg -i input.mp4 -vf scale=854:480 -c:v libx265 -crf 28 ...

   -- Thumbnail extraction --
   ffmpeg -i input.mp4 -ss 00:00:01 -vframes 1 thumb_1.jpg
   ffmpeg -i input.mp4 -ss 25% -vframes 1 thumb_2.jpg

4. Upload all output files to S3: cdn/{video_id}/{quality}/{segment_n}.ts
5. Upload master playlist: cdn/{video_id}/master.m3u8

-- Master Playlist (HLS) --
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480
480p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360
360p/playlist.m3u8

-- On completion: publish --
Topic: video.transcoded
{
  "video_id": "vid_20260430_abc123",
  "master_playlist": "https://cdn.tiktok.com/vid_20260430_abc123/master.m3u8",
  "thumbnails": ["https://cdn.tiktok.com/.../thumb_1.jpg", ...],
  "duration_ms": 29500,
  "qualities_available": ["1080p", "720p", "480p", "360p"]
}

-- Transcoding Jobs Schema --
CREATE TABLE transcoding_jobs (
  job_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id    TEXT NOT NULL,
  status      TEXT DEFAULT 'QUEUED',  -- QUEUED / RUNNING / DONE / FAILED
  priority    INT  DEFAULT 5,         -- 1=highest, 10=lowest
  worker_id   TEXT,
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error       TEXT,
  retry_count INT DEFAULT 0
);`,
    },
    {
      id: "fypService",
      title: "FYP Recommendation Service — LLD",
      description: "Multi-stage candidate retrieval and ranking pipeline serving personalised video feeds in < 200ms",
      api: `GET /v1/feed/foryou?count=15&cursor=eyJsYXN0X3ZpZGVvIjoiYWJjIn0=
Authorization: Bearer {jwt}

Response 200:
{
  "videos": [
    {
      "video_id": "vid_abc123",
      "creator": { "id": "usr_xyz", "username": "dancequeen99", "avatar_url": "...", "verified": false },
      "video_url": "https://cdn.tiktok.com/vid_abc123/master.m3u8",
      "thumbnail_url": "https://cdn.tiktok.com/vid_abc123/thumb_1.jpg",
      "caption": "New dance challenge 🔥 #fyp",
      "sound": { "id": "snd_abc", "title": "Original Sound - dancequeen99" },
      "stats": { "views": 1240000, "likes": 89000, "comments": 3400, "shares": 12000 },
      "duration_ms": 29500,
      "ad": false
    }
  ],
  "next_cursor": "eyJsYXN0X3ZpZGVvIjoieHl6In0=",
  "has_more": true
}

-- Recommendation Pipeline (internal) --

Step 1 — Candidate Retrieval (< 50ms total):
  Parallel retrieval from multiple sources:
  a. Collaborative filtering:
     user_embedding = FeatureStore.get(user_id)  // 256-dim vector
     ANN search in video embedding index (FAISS / ScaNN):
       SEARCH TOP 2000 FROM video_index WHERE dot_product(user_embedding, video_embedding) > threshold
  b. Category affinity index:
     user_categories = Redis HGETALL user:{id}:category_weights
     → Fetch top 500 videos per top-3 categories from inverted index
  c. Social follow feed:
     Redis LRANGE user:{id}:follow_feed 0 500
  d. Trending: Redis ZREVRANGE trending:global 0 200
  Total candidates: deduplicated to ~10,000

Step 2 — Lightweight Ranking (< 30ms):
  Feature vector for each candidate: [category_match, creator_follow, freshness_score, video_popularity]
  Lightweight MLP inference (CPU): score each of 10,000 candidates
  Keep top 500

Step 3 — Deep Ranking (< 100ms):
  Two-tower model inference on GPU:
    user_vector = UserTower(user_history_embeddings)
    video_vectors = VideoTower(batch of 500 video features)
    scores = dot_product(user_vector, video_vectors)
  Predicted metrics: completion_rate, like_probability, share_probability
  Combined score: 0.5×completion + 0.3×share + 0.2×like

Step 4 — Re-ranking + Business Rules (< 20ms):
  diversity_filter(results)    // no 2 consecutive same creator
  insert_ads(results, positions=[3,8,15])
  freshness_boost(results)     // videos < 24h old get +5%
  moderation_filter(results)   // remove any flagged in last hour
  Return top 30 to client, queue 300 for session

-- User Action Logging --
POST /v1/actions (called from client on every interaction)
{
  "video_id": "vid_abc123",
  "action_type": "WATCH_COMPLETE",    // WATCH_COMPLETE / LIKE / SHARE / COMMENT / SKIP / FOLLOW
  "watch_duration_ms": 29500,
  "session_id": "sess_xyz"
}`,
    },
    {
      id: "interactionService",
      title: "Interaction Service — LLD",
      description: "High-throughput like, comment and share counters with Redis buffering and async MySQL persistence",
      api: `-- Like a video --
POST /v1/videos/{video_id}/like
Authorization: Bearer {jwt}

Response 200:
{
  "liked": true,
  "like_count": 89001           // current count (from Redis)
}

-- Unlike --
DELETE /v1/videos/{video_id}/like
Response 200: { "liked": false, "like_count": 89000 }

-- Like Implementation --
1. Check if user already liked: Redis SISMEMBER video:{id}:likers {user_id}
2. If not liked:
   MULTI
     SADD   video:{id}:likers {user_id}
     INCR   video:{id}:like_count
   EXEC
3. Kafka event: user.liked → notification service, recommendation feature update
4. Background flush (every 60s): UPDATE videos SET like_count = {redis_count} WHERE id = {id}

-- Comment on a video --
POST /v1/videos/{video_id}/comments
{
  "text": "This is so good! 🔥",
  "reply_to_comment_id": null      // null for top-level, comment_id for reply
}

Response 201:
{
  "comment_id": "cmt_abc123",
  "text": "This is so good! 🔥",
  "author": { "username": "user123", "avatar_url": "..." },
  "like_count": 0,
  "created_at": "2026-04-30T10:15:00Z"
}

-- Comments Schema (Cassandra) --
CREATE TABLE comments (
  video_id         TEXT,
  created_at       TIMESTAMP,
  comment_id       UUID,
  user_id          TEXT,
  text             TEXT,
  parent_id        UUID,            -- null for top-level
  like_count       INT,
  is_pinned        BOOLEAN,
  is_deleted       BOOLEAN,
  PRIMARY KEY ((video_id), created_at, comment_id)
) WITH CLUSTERING ORDER BY (created_at DESC);

-- Get comments (paginated) --
GET /v1/videos/{video_id}/comments?cursor={cursor}&limit=20

Response:
{
  "comments": [...],
  "pinned_comment": { ... },       // creator-pinned comment always first
  "next_cursor": "base64_cursor",
  "total_count": 3400
}

-- Share --
POST /v1/videos/{video_id}/share
{ "platform": "WHATSAPP" }         // WHATSAPP / TWITTER / INSTAGRAM / LINK_COPY
Response: { "share_url": "https://vm.tiktok.com/shortcode", "share_count": 12001 }`,
    },
    {
      id: "liveService",
      title: "Live Streaming Service — LLD",
      description: "RTMP ingest, real-time transcoding, sub-second HLS delivery and virtual gift processing",
      api: `-- Start a live stream --
POST /v1/live/start
Authorization: Bearer {jwt}
{
  "title": "Q&A with my fans 💬",
  "category": "CHAT",
  "allow_gifts": true
}

Response 200:
{
  "stream_id": "live_abc123",
  "rtmp_url": "rtmp://ingest.tiktok.com/live/abc123?key=secret_stream_key",
  "stream_key": "secret_stream_key",
  "playback_url": "https://live-cdn.tiktok.com/live_abc123/master.m3u8",
  "started_at": "2026-04-30T10:00:00Z"
}

-- Creator streams via OBS/mobile app using rtmp_url + stream_key --

-- Viewer joins live --
GET /v1/live/{stream_id}
Response:
{
  "stream_id": "live_abc123",
  "title": "Q&A with my fans 💬",
  "creator": { "username": "creator99", "verified": true },
  "viewer_count": 48293,
  "playback_url": "https://live-cdn.tiktok.com/live_abc123/master.m3u8",
  "top_gifters": [
    { "username": "fan1", "diamonds_sent": 5000 },
    { "username": "fan2", "diamonds_sent": 3200 }
  ],
  "allow_gifts": true
}

-- Send gift --
POST /v1/live/{stream_id}/gift
{
  "gift_id": "gift_universe",        // Universe = 34,999 coins
  "quantity": 1
}

Response 200 / 402 (insufficient coins)

-- Gift Processing --
1. Deduct coins: Redis DECRBY user:{id}:coins 34999
   If result < 0: INCRBY (rollback), return 402
2. Award diamonds: Redis INCRBY creator:{id}:diamonds 17499  // 50% of gift value
3. Update leaderboard: Redis ZADD live:{stream_id}:gifters 34999 {user_id}
4. Kafka: gift.sent → broadcast gift animation to all viewers (WebSocket)
5. Periodic flush: MySQL diamonds table updated every 60s

-- Live Stream Schema --
CREATE TABLE live_streams (
  stream_id      TEXT PRIMARY KEY,
  creator_id     UUID NOT NULL,
  title          TEXT,
  status         TEXT DEFAULT 'ACTIVE',  -- ACTIVE / ENDED
  started_at     TIMESTAMPTZ,
  ended_at       TIMESTAMPTZ,
  peak_viewers   INT DEFAULT 0,
  total_viewers  BIGINT DEFAULT 0,
  total_diamonds BIGINT DEFAULT 0
);

-- Live viewer set (Redis, TTL = stream duration + 60s) --
SADD  live:{stream_id}:viewers {user_id}
SCARD live:{stream_id}:viewers            -- current viewer count
-- Viewer removed when WebSocket disconnects (TTL on member not supported → periodic cleanup)`,
    },
    {
      id: "moderationService",
      title: "Content Moderation Service — LLD",
      description: "ML classifier pipeline, hash matching, human review queue and appeals management",
      api: `-- Moderation triggered on video.transcoded Kafka event --

-- Internal moderation check --
POST /internal/moderation/evaluate
{
  "video_id": "vid_abc123",
  "creator_id": "usr_xyz",
  "video_url": "https://cdn.tiktok.com/vid_abc123/480p/playlist.m3u8",
  "thumbnail_url": "https://cdn.tiktok.com/vid_abc123/thumb_1.jpg",
  "caption": "check this out",
  "hashtags": ["fyp", "viral"],
  "duration_ms": 29500,
  "creator_trust_score": 0.92     // higher = more trusted (fewer past violations)
}

Response (< 10 seconds):
{
  "decision": "APPROVED",         // APPROVED / REMOVED / HUMAN_REVIEW / AGE_RESTRICTED
  "flags": [],
  "classifier_scores": {
    "nsfw": 0.03,
    "violence": 0.01,
    "hate_speech": 0.00,
    "spam": 0.02
  },
  "hash_matches": [],
  "moderation_id": "mod_abc123"
}

-- Moderation Pipeline (internal) --
Phase 1: Hash matching (< 100ms)
  perceptual_hash = compute_phash(video_frames)
  check against: NCMEC_DB, GIFCT_DB, internal_removed_DB
  if match → REMOVED + law_enforcement_report (for CSAM)

Phase 2: ML classifiers (< 5 seconds, GPU)
  Run in parallel:
  - nsfw_model.predict(video_frames_sample)    → score 0-1
  - violence_model.predict(video_frames_sample) → score 0-1
  - audio_transcription → hate_speech_model.predict(transcript)
  - ocr(thumbnail) → hate_speech_model.predict(text)

Decision logic:
  if any_score > 0.9:   → REMOVED (automated, high confidence)
  if any_score > 0.4:   → HUMAN_REVIEW (queue for reviewer)
  if NSFW score > 0.2 AND creator_age < 18: → REMOVED
  if all_scores < 0.1:  → APPROVED

Phase 3: Human review queue (async)
  Kafka: video.needs_review → human review dashboard
  Reviewer decisions: APPROVE / REMOVE / AGE_RESTRICT / LIMITED_DISTRIBUTION

-- Moderation Schema --
CREATE TABLE moderation_decisions (
  moderation_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id        TEXT NOT NULL,
  decision        TEXT NOT NULL,
  method          TEXT NOT NULL,        -- AUTO_HASH / AUTO_ML / HUMAN / APPEAL
  reviewer_id     UUID,
  nsfw_score      NUMERIC(4,3),
  violence_score  NUMERIC(4,3),
  hate_score      NUMERIC(4,3),
  removal_reason  TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  INDEX (video_id)
);`,
    },
  ],
};

export const TIKTOK_QNA = [
  {
    id: "tq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["TikTok", "Instagram", "YouTube Shorts"],
    question: "Design a short video platform like TikTok. Walk through the key components.",
    answer: `TikTok's architecture has three distinct planes: content (upload/transcode), delivery (CDN/playback), and intelligence (recommendations).

UPLOAD PIPELINE:
  Resumable chunked upload → S3 directly (presigned URLs, bypass servers)
  Transcoding: FFmpeg cluster → 5 quality variants (1080p to 240p) + HLS segmentation (2s chunks)
  Processing SLA: < 2 minutes for videos under 60 seconds

FYP RECOMMENDATION (4-stage funnel):
  Stage 1: Candidate retrieval — 10K videos via collaborative filtering + trending + social follows
  Stage 2: Lightweight ranking — 10K → 500 via fast CPU-based MLP
  Stage 3: Deep ranking — 500 → 50 via two-tower neural network (user vector × video vector)
  Stage 4: Re-ranking — diversity rules + ads insertion + freshness boost
  Total latency: < 200ms

VIDEO DELIVERY:
  HLS adaptive bitrate: client switches quality based on bandwidth
  Pre-fetch: next 2 videos pre-downloaded while watching current → instant swipe
  CDN: 3-tier (edge PoP → regional → origin S3), popular videos pre-warmed globally

SOCIAL GRAPH:
  Push-pull hybrid: < 10K followers = push to fan feeds. > 10K = pull on load (celebrity problem)
  Interaction counters: Redis INCR per like/view → async flush to MySQL every 60s

LIVE STREAMING:
  RTMP ingest → real-time GPU transcoding → CMAF low-latency HLS (1s segments)
  End-to-end latency: < 1 second
  Gifts: Redis atomic coin deduction + diamond award + WebSocket broadcast animation`,
  },
  {
    id: "tq2",
    category: "Recommendation",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["TikTok", "Netflix", "Spotify"],
    question: "How does TikTok's For You Page algorithm work? Design the recommendation system.",
    answer: `The FYP is a multi-stage funnel that narrows billions of videos to ~30 shown per session.

THE KEY INSIGHT:
  TikTok uses implicit signals (watch time, replay, share) not explicit ones (likes, follows)
  Watch completion is the strongest signal — hard to fake, directly measures value
  This enables personalisation for new users who haven't liked or followed anything yet

FOUR-STAGE FUNNEL:

Stage 1 — Candidate Retrieval (billions → 10,000):
  a. Two-tower ANN (Approximate Nearest Neighbour):
     User embedding (from watch history) × Video embeddings → cosine similarity search
     Using FAISS or ScaNN for sub-millisecond ANN over billions of vectors
  b. Category affinity: user's top-3 interest categories → fetch top videos per category
  c. Social: videos from followed creators (push-based, Redis list)
  d. Trending: real-time Kafka-computed trending (top 200, globally + regionally)
  Deduplicated → ~10,000 unique candidates

Stage 2 — Lightweight Scoring (10,000 → 500, < 30ms):
  Small MLP (2 layers, 256 hidden units) on CPU
  Input: sparse features (category match, creator affinity, video age, popularity)
  Keep top 500 by predicted score

Stage 3 — Deep Ranking (500 → 50, < 100ms, GPU):
  Full two-tower model inference:
    UserTower: embeds last 200 watched video features → 256-dim user vector
    VideoTower: embeds audio + visual + caption + hashtag features → 256-dim video vector
    Score = dot product (cosine similarity)
  Multi-task learning: simultaneously predict watch_completion, like_prob, share_prob
  Weighted sum: score = 0.5×completion + 0.3×share + 0.2×like

Stage 4 — Re-ranking (50 → served):
  No 2 consecutive same-creator videos (diversity)
  Ad insertion at positions 3, 8, 15
  Freshness boost: < 24h old → +5% score
  Safety filter: moderation holds removed

COLD START:
  New user (0 signals): serve globally trending in user's locale
  After 5 interactions: begin personalisation
  After 20: meaningful profile established`,
  },
  {
    id: "tq3",
    category: "Scale",
    difficulty: "Hard",
    round: "System Design Screen",
    asked_at: ["TikTok", "YouTube", "Instagram"],
    question: "How do you handle video uploads from 500 million creators per day?",
    answer: `500M videos × average 50 MB = 25 petabytes of ingress per day. Servers cannot handle this directly.

ARCHITECTURE: PRESIGNED DIRECT-TO-S3 UPLOAD

Why not upload to app servers:
  25 PB/day through servers = unsustainable bandwidth cost + latency
  S3 multi-part upload: parallel chunks → 10× faster for creators

Flow:
  1. Creator's client → POST /v1/upload/init → server validates and returns presigned S3 URLs
  2. Client chunks video (5 MB parts), uploads each directly to S3 in parallel
  3. Server sees nothing except metadata — video never traverses server
  4. Client POSTs completion → server triggers transcoding pipeline

RESUMABLE UPLOADS:
  Mobile networks drop → client needs to resume
  Server tracks uploaded parts: GET /v1/upload/{id}/status → {uploaded_parts, missing_parts}
  Client re-uploads only missing chunks — efficient on expensive mobile data

TRANSCODING:
  S3 event → Kafka → transcoding job queue (priority by creator tier)
  GPU FFmpeg workers: auto-scaling, 10 parallel quality variants per worker
  Output: 5 quality variants + HLS segments (2s) uploaded back to CDN S3 bucket
  SLA: < 2 min for short videos, < 10 min for long-form

STORAGE TIERING:
  Hot (< 30d, high views): S3 Standard
  Warm (30d–1yr): S3 Infrequent Access (40% cheaper)
  Cold (> 1yr, < 100K views): Glacier (80% cheaper, 4h retrieval)
  Auto-migration: S3 Lifecycle rules + custom promoter job (old video goes viral → move to hot)

DEDUPLICATION:
  Perceptual hash on every upload → check against hash DB
  Duplicate → don't transcode, reuse existing CDN URLs
  Saves ~15% storage and processing cost (reposted content is common)`,
  },
  {
    id: "tq4",
    category: "Real-time",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["TikTok", "Twitch", "YouTube Live"],
    question: "How do you design TikTok LIVE with sub-second latency for millions of concurrent viewers?",
    answer: `Standard HLS has 15–30s latency. TikTok LIVE targets < 1s. This requires a different stack.

THE LATENCY STACK:

Standard HLS (not suitable):
  10s segments → 15–30s end-to-end latency → comments/gifts feel disconnected

Low-latency HLS (CMAF):
  1-second segments → 1–3s latency → gifts feel real-time
  Cost: more origin requests (1/s vs 1/10s), higher CDN origin load

RTMP for ingest:
  Creator's OBS/mobile app → RTMP to nearest ingest PoP (< 30ms from creator)
  RTMP handles variable network (TCP-based, handles packet loss)

Pipeline timing:
  Creator encodes frame → RTMP → ingest (< 30ms)
  Real-time transcoding (< 200ms) → HLS segment generation
  CDN propagation (< 200ms) → viewer buffer (< 500ms)
  Total: < 1 second end-to-end

SCALE FOR POPULAR STREAMERS:
  1M concurrent viewers for a celebrity stream
  CDN fan-out: ingest server → CDN origin → 500+ edge PoPs → viewers
  No single server sees 1M connections — CDN distributes load

GIFTS AT SCALE:
  1M viewers sending gifts → WebSocket message fan-out challenge
  Solution: WebSocket servers subscribed to Redis pub/sub channel per stream
    Creator's stream → Kafka: gift.sent → Redis PUBLISH stream:{id}:events {gift_json}
    All WebSocket servers subscribed → push to their viewer connections
  Rate limiting: batch gifts if > 100/second, send aggregated count (UI can't display faster anyway)

RECONNECT & BUFFERING:
  Viewer loses connection → client buffers 3 seconds locally
  On reconnect: join at live edge (not from disconnection point — too much catch-up)
  Viewer count: Redis SCARD stream:{id}:viewers, heartbeat every 30s to stay in set`,
  },
];
