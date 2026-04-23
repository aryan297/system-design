export const SPOTIFY_HLD = {
  title: "Spotify — High Level Design",
  subtitle: "Music streaming for 600M users — 100M tracks, sub-200ms playback start",
  overview: `Spotify connects 600M listeners to a catalog of 100M+ tracks across 180+ countries. The core engineering challenge splits into two planes: the catalog plane (store, transcode, deliver audio at scale) and the intelligence plane (recommendations that feel personally curated for each listener).

Unlike YouTube, Spotify owns the licensing relationships with labels — so every stream is metered, every play must be counted exactly for royalty payouts. Accuracy in play counts is not optional.

Key architectural bets: event-driven microservices (hundreds of services, all communicating via events), Kafka as the central nervous system, and the Discover Weekly ML pipeline that redefined music discovery.`,

  diagram: `
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│     iOS · Android · Web Player · Desktop · Smart Speaker · Car     │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  HTTPS / WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   API GATEWAY (Apollo / Envoy)                      │
│         Auth · Rate Limiting · Routing · Protocol Translation       │
└──┬──────────────┬──────────────┬─────────────────┬─────────────────┘
   │              │              │                 │
   ▼              ▼              ▼                 ▼
┌──────┐    ┌──────────┐  ┌──────────┐    ┌────────────────┐
│Track │    │ Metadata │  │  Search  │    │ Recommendation │
│Service│   │ Service  │  │  Service │    │    Engine      │
└──┬───┘    └────┬─────┘  └──────────┘    └────────────────┘
   │             │
   ▼             ▼
┌──────────┐  ┌──────────────────────────────────────────┐
│  Audio   │  │          DATA LAYER                       │
│ Storage  │  │  PostgreSQL · Cassandra · Redis           │
│  (GCS)   │  │  Kafka · BigQuery · Google Bigtable       │
└────┬─────┘  └──────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        AUDIO CDN                                    │
│   Akamai / Cloudfront PoPs — 200+ edge locations worldwide          │
│        Pre-encoded: 24kbps / 96kbps / 160kbps / 320kbps            │
└─────────────────────────────────────────────────────────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Audio Delivery",
      sections: [
        {
          title: "Track Ingestion — From Label to Listener",
          content: `Spotify receives audio from labels in multiple formats (WAV, FLAC, MP3). Before a listener hears a track, it goes through the ingestion pipeline.

INGEST PIPELINE:
1. Label uploads audio file (WAV/FLAC) via content delivery portal
2. Ingestion Service validates: file integrity, metadata completeness (ISRC code, artist, album)
3. Audio transcoder produces all quality variants:
   • 24 kbps  OGG Vorbis — very low bandwidth (Spotify Free on 2G)
   • 96 kbps  OGG Vorbis — low quality (Free, mobile data saving)
   • 160 kbps OGG Vorbis — normal quality (Free default)
   • 320 kbps OGG Vorbis — high quality (Premium)
   • 256 kbps AAC         — Apple ecosystem fallback
   • FLAC lossless        — Spotify HiFi (premium tier, selective rollout)
4. Each encoded file chunked into ~10-second segments (for streaming)
5. Segments pushed to GCS (origin) and pre-positioned on CDN edge nodes
6. Metadata written to catalog database; track marked as AVAILABLE

WHY OGG VORBIS:
• Better quality-per-bit than MP3 at equivalent bitrate
• No per-track royalty (unlike MP3 codec license)
• Widely supported in Spotify's own players
• 320 kbps OGG ≈ 320 kbps MP3 quality at ~30% smaller file size`,
        },
        {
          title: "Streaming Architecture — Gapless Playback",
          content: `Spotify's core UX promise: tracks start instantly, transitions between tracks are gapless.

STREAMING PROTOCOL:
• Spotify uses its own protocol (not DASH/HLS) over HTTPS
• Track pre-fetching: while Track N plays, client downloads Track N+1 fully
• Result: track-to-track transition feels instant (buffered, no network wait)
• Gapless: next track pre-decoded, queued in audio buffer — zero gap on transition

PLAYBACK URL FLOW:
1. Client requests: GET /track/{trackId}/playback-url
2. Track Service validates: user subscription level → select quality tier
3. Returns CDN signed URL:
   https://audio-ak.scdn.co/audio/{trackId}_320?token=HMAC&expires=unix
4. Client connects directly to CDN PoP — Track Service no longer in path
5. CDN streams segments; client decodes and plays

ADAPTIVE QUALITY (Free users on mobile):
• Monitor available bandwidth during playback
• If bandwidth drops below 96 kbps threshold: switch to lower quality
• Spotify doesn't do per-segment ABR like YouTube
• Instead: switch quality tier at track boundary (gapless transition)

OFFLINE MODE (Premium only):
• Client downloads full track file (not segments) to device storage
• Encrypted with device-specific key (DRM — prevents file sharing)
• On playback: decrypt in-memory, stream to audio output
• Key stored in Spotify's license server — if subscription lapses, keys revoked`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Recommendations",
      sections: [
        {
          title: "Discover Weekly — The Algorithm Behind the Playlist",
          content: `Discover Weekly drops every Monday with 30 tracks. It's Spotify's most-loved feature and the best example of collaborative filtering at scale.

COLLABORATIVE FILTERING — "Users like you also listen to":
  Core insight: listening patterns across 600M users reveal taste clusters
  If users A, B, C all listen to artists X, Y, Z → user D (who likes X, Y) probably likes Z

  Implementation — Matrix Factorization:
  • Build a giant matrix: rows = users, columns = tracks, values = play count
  • Matrix is 600M × 100M = 60 quadrillion cells (99.9%+ empty — sparse)
  • Factorize into: user_embeddings (600M × 50 dimensions) × track_embeddings (100M × 50 dimensions)
  • Training: Apache Spark on ~petabyte of streaming history data
  • Output: every user and every track is a 50-dimensional vector

AUDIO ANALYSIS — "What does the track sound like?":
  • Spotify's Echo Nest acquisition (2014) brought audio analysis at scale
  • Features extracted per track: tempo, key, mode, danceability, energy, acousticness, valence
  • ML model: analyze audio waveform → predict: "this sounds like [genre cluster]"
  • Enables cold-start: recommend new tracks before anyone has played them

DISCOVER WEEKLY GENERATION (runs every Sunday night):
  For each user:
  1. Get user's listening vector (from collaborative filtering)
  2. Find 50 "taste twin" users — most similar embedding cosine distance
  3. Aggregate: what did taste twins listen to that this user hasn't heard?
  4. Score candidates by: audio feature match + social graph weight
  5. Exclude: tracks user has already heard, explicitly skipped multiple times
  6. Select 30 tracks with diversity constraints (not all same artist/genre)

SCALE:
  600M users × weekly computation = cannot run sequentially
  Batch computation on Spark cluster (hundreds of machines)
  Pre-compute all 600M playlists between Friday night and Sunday midnight`,
        },
        {
          title: "Real-Time Personalization — Radio & Autoplay",
          content: `Discover Weekly is weekly batch. Radio and Autoplay need real-time next-track selection.

RADIO — "Endless stream based on a seed":
  Seed = any track, artist, playlist, or genre
  1. Find seed's embedding in track latent space
  2. k-NN query: nearest N tracks in embedding space = acoustically/stylistically similar
  3. Filter: tracks user has recently heard (last 30 days), recently skipped
  4. Score: acoustic similarity × user taste match × freshness
  5. Return next 10 tracks; pre-fetch as user listens

REAL-TIME SIGNALS (updated per session, not weekly batch):
  • Current session: tracks played vs skipped (immediate preference signal)
  • Skip within 30s: strong negative signal — remove from session queue
  • Play-through + replay: strong positive signal — serve more like this
  • These signals update session recommendations, not the weekly model
    (Model retrains weekly; session personalization is heuristic)

SPOTIFY'S BANDIT ALGORITHM (Explore vs Exploit):
  Problem: always play known-good tracks → user never discovers anything new
  Solution: multi-armed bandit — balance exploitation (familiar) with exploration (new)
  Explore rate: 30% of radio tracks are "exploration" (outside user's usual taste)
  If exploration track played-through: confirm as new taste, serve more like it
  If skipped: back to exploitation mode

NLP ON PLAYLISTS (word2vec on track sequences):
  Treat listening sessions as sentences, tracks as words
  word2vec on billions of sessions → track embeddings from co-occurrence patterns
  "Tracks that appear together in listening sessions" = similar embedding
  Advantage: captures context (workout playlist vs sleep playlist → different clusters)`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Search & Discovery",
      sections: [
        {
          title: "Search — Finding Tracks, Artists, Albums, Podcasts",
          content: `Spotify search must handle: track names, artist names, lyrics, podcast titles, and natural language queries across 100M+ items.

SEARCH INDEX (Lucene / Elasticsearch):
  Indexed entity types: tracks, albums, artists, playlists, podcasts, episodes, users

  Track document example:
  {
    "track_id": "4iV5W9uYEdYUVa79Axb7Rh",
    "title": "Bohemian Rhapsody",
    "title_phonetic": "BOH-hee-mee-an RAP-soh-dee",  // for typo tolerance
    "artist": "Queen",
    "album": "A Night at the Opera",
    "genres": ["rock", "classic rock", "arena rock"],
    "popularity": 98,                                // 0-100 Spotify score
    "release_year": 1975,
    "play_count_30d": 85000000,
    "acoustic_features": { "energy": 0.72, "valence": 0.56, ... }
  }

RANKING SIGNALS:
  text_match    = BM25 score (exact > partial > phonetic)
  popularity    = Spotify's pre-computed popularity score (play count weighted by recency)
  personalization = user's listening history affinity to this track's artist/genre
  freshness     = slight boost for tracks released in last 30 days

QUERY TYPES HANDLED:
  "bohemian rhapsody" → exact title match (trivial)
  "queen 1975 rock opera" → multi-field match, no exact title match
  "that one song go go go queen" → fuzzy match + phonetic
  "sad songs for a rainy day" → mood/genre intent detection → curated playlist
  Last case: NLP classifier detects "mood query" → serve curated editorial content`,
        },
        {
          title: "Podcast Discovery & Indexing",
          content: `Spotify acquired podcast hosting (Anchor/Megaphone) and invested heavily in podcast search and recommendations.

PODCAST INGESTION:
  RSS feed → Podcast Ingestion Service → audio file download
  Speech-to-text: every episode transcribed (Whisper / internal ASR model)
  Transcript indexed in Elasticsearch → enables full-text search inside episodes
  Chapters detected from transcript: "Chapter 2 — Building at Scale"

SEARCH INSIDE PODCASTS:
  User searches: "microservices kubernetes scaling"
  Results: not just podcast titles, but specific episode + timestamp
  "The Engineering Podcast, Episode 42 — at 12:34: '...microservices on Kubernetes...'"
  Deep link: opens episode and seeks to that timestamp

PODCAST RECOMMENDATIONS:
  Similar to music: collaborative filtering on listen history
  Key difference: podcast episodes are sequential — don't recommend Ep5 before Ep1
  Series awareness: "You've listened to 3 episodes of 'How I Built This' → continue series"
  Completion rate as engagement signal (finishing an episode >> starting and abandoning)`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Data & Storage",
      sections: [
        {
          title: "Storage Architecture — Right Database for Each Job",
          content: `Spotify runs hundreds of microservices, each choosing the right storage for its access patterns.

POSTGRESQL (User Accounts, Playlists, Subscriptions):
  • Source of truth for: user profiles, subscription state, playlist metadata
  • ACID compliance for billing (subscription charges)
  • Sharded by user_id range across regional clusters
  • Read replicas per region: EU, US, APAC

CASSANDRA (Listening History, Stream Events):
  • 600M users × listening history = billions of rows
  • Write pattern: high throughput inserts (every track play = insert)
  • Read pattern: "give me user X's last 90 days" = single partition scan
  • Schema: PRIMARY KEY (user_id, played_at DESC)
  • Cross-region replication: listening history accessible globally
  • Eventual consistency acceptable: play history doesn't need ACID

REDIS (Session State, Feature Flags, Cache):
  • Active playback sessions: current track, queue, shuffle state
  • Feature flag cache: A/B test assignments per user
  • Popular track metadata: top 1M tracks cached for sub-millisecond reads
  • Rate limiting counters: API request limits per user/client

GOOGLE BIGTABLE (Audio Feature Store, ML Features):
  • Pre-computed ML features per (user, track) pair
  • Updated nightly by ML batch jobs
  • Row key: user_id → scan all tracks for a user efficiently
  • High read throughput for recommendation serving

KAFKA (Event Bus — the central nervous system):
  Key topics:
  • stream-events: every play, skip, pause, seek → consumed by 10+ services
  • user-actions: likes, follows, playlist edits
  • royalty-events: exact play events → billing pipeline (exactly-once delivery)
  • recommendation-feedback: skip/play signals → model retraining pipeline`,
        },
        {
          title: "Royalty Processing — Exact Play Counting",
          content: `Unlike view counts (approximate is fine), Spotify's royalty play counts must be exactly correct. Labels are paid per stream.

WHAT COUNTS AS A STREAM:
  • Track must be played for > 30 seconds
  • Playback initiated by user intent (not autoplay of a 2-second interstitial)
  • Offline plays counted when device reconnects (stored locally, synced)
  • One play per user per 24 hours per track counted toward artist royalties

THE PIPELINE (exactly-once semantics):
  1. Client fires stream-event after 30s play
  2. Stream Event Service: validate (>30s? user authenticated? track exists?)
  3. Write to Kafka topic: royalty-events with exactly-once producer
     (Kafka transactions: either committed or not — no duplicates)
  4. Royalty Aggregator (Kafka consumer, Flink):
     • Deduplication window: same user + track + 24h → count once
     • Aggregate: (track_id, date) → play_count
     • Write to royalty ledger (PostgreSQL, ACID) every 15 minutes
  5. Monthly batch: calculate each artist's royalties from ledger
     royalty = play_count × per_stream_rate × label_share × tier_weight

AUDIT TRAIL:
  Every royalty-event stored permanently in S3 (cold storage)
  Labels can request audit: "show me every stream of track X in March"
  Dispute resolution: raw event log is the source of truth`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "Social & Playlists",
      sections: [
        {
          title: "Playlist Architecture — Collaborative & Social",
          content: `Spotify has 4B+ playlists. Collaborative playlists allow multiple users to edit simultaneously.

PLAYLIST DATA MODEL:
  PostgreSQL:
  playlists table:
    playlist_id   UUID PRIMARY KEY
    owner_id      UUID NOT NULL
    name          TEXT NOT NULL
    description   TEXT
    is_public     BOOLEAN DEFAULT true
    is_collaborative BOOLEAN DEFAULT false
    follower_count INT DEFAULT 0
    created_at    TIMESTAMPTZ

  playlist_tracks table:
    playlist_id   UUID
    track_id      TEXT
    position      INT              -- display order
    added_by      UUID             -- which user added (for collaborative)
    added_at      TIMESTAMPTZ
    PRIMARY KEY (playlist_id, position)

COLLABORATIVE PLAYLIST CONCURRENCY:
  Problem: two users add tracks to same playlist simultaneously → position conflict

  Solution — Operational Transform (simplified):
  • Each edit has a position and a lamport clock (logical timestamp)
  • Last-write-wins per position: higher clock wins
  • Conflict: both users insert at position 5 → higher clock goes to 5, other shifts to 6
  • Client reconciles: fetch current state → re-apply local edit → show merged result

EDITORIAL PLAYLISTS (Today's Top Hits, RapCaviar):
  Curated by Spotify's editorial team — not algorithmic
  High-follower playlists: 30M+ followers for Today's Top Hits
  Being on an editorial playlist = career-changing for artists
  Access-controlled: only editors can modify; cached aggressively

PLAYLIST RECOMMENDATIONS:
  "People who follow this playlist also follow..."
  Collaborative filtering on playlist-follow graph
  "Add to playlist" suggestion: based on context of target playlist's tracks`,
        },
        {
          title: "Social Graph — Following & Friend Activity",
          content: `Spotify's social layer: follow artists, follow users, see what friends are listening to.

SOCIAL GRAPH STORAGE:
  Graph DB (or adjacency list in PostgreSQL for this scale):
  follows table:
    follower_id   UUID
    followee_id   UUID
    followee_type TEXT   -- 'user' | 'artist' | 'podcast'
    followed_at   TIMESTAMPTZ
    PRIMARY KEY (follower_id, followee_id)
  INDEX: (followee_id) — "who follows this artist?" queries

FRIEND ACTIVITY FEED:
  "John is listening to Bohemian Rhapsody by Queen"
  Real-time: WebSocket connection per client receives activity updates
  Fan-out on write: when user X starts a track → publish to X's followers

  Implementation:
  • User starts track → stream-events Kafka topic
  • Social Feed Service consumes → fan-out to follower list
  • For each follower: push via WebSocket (if online) or store in Redis feed
  • Follower comes online → fetch latest 20 friend activities from Redis

ARTIST FOLLOW NOTIFICATIONS:
  Artist releases new album → notify all followers
  Scale: Ed Sheeran has 80M+ followers on Spotify
  Fan-out challenge: 80M push notifications in one batch
  Solution: prioritized queue + rate limiting — notifications spread over 10 minutes
  Not real-time (acceptable: "new album" notification doesn't need sub-second delivery)`,
        },
      ],
    },
    {
      id: "phase6",
      label: "Phase 6",
      title: "Scale & Reliability",
      sections: [
        {
          title: "Event-Driven Microservices — Spotify's Architecture Philosophy",
          content: `Spotify runs 800+ microservices. Their core architectural bet: services communicate through events, not direct calls.

WHY EVENT-DRIVEN:
  Direct call: Service A calls Service B → A is coupled to B's availability
  Event-driven: A publishes to Kafka → B consumes when ready → decoupled

  Real example:
  User plays track →
    Stream Event published to Kafka
    → Royalty Service: count the stream
    → Recommendations: update user model
    → Social Feed: notify followers
    → Analytics: update dashboards
  All happen independently, in parallel, without Stream Event Service knowing about them

KAFKA AS CENTRAL NERVOUS SYSTEM:
  Every user action produces an event
  Services subscribe to events they care about
  Adding a new service = add a new Kafka consumer (no changes to producers)
  Spotify runs one of the world's largest Kafka deployments (~trillion events/day)

CIRCUIT BREAKER PATTERN:
  Service A calls Service B 100 times, 50 fail → circuit opens
  Circuit OPEN: A stops calling B for 30s (returns cached/default response)
  Circuit HALF-OPEN: A tries 1 call → if success, circuit closes
  Result: cascading failures don't propagate; failing service gets recovery time

SLO TARGETS:
  Track playback start: p99 < 250ms
  Search results: p99 < 300ms
  Discover Weekly generation: all 600M playlists by Monday 00:00 UTC
  Royalty accuracy: zero missed streams (exactly-once guaranteed)
  API availability: 99.95% per month`,
        },
        {
          title: "Global Deployment — Serving 180+ Countries",
          content: `Spotify serves listeners across 180+ countries with consistent sub-200ms playback start.

REGIONAL DEPLOYMENT:
  Active/active: US-East, US-West, EU-West, EU-Central, APAC
  Each region runs: API Gateway, Track Service, Metadata Service, Search Service
  User data replicated: Cassandra multi-region, PostgreSQL regional primaries
  CDN: Akamai + Cloudfront — 200+ PoPs, audio segments cached globally

LATENCY OPTIMIZATION:
  API requests: GeoDNS routes to nearest regional cluster
  Audio: CDN PoP located inside major ISPs → zero-hop audio delivery
  Pre-warming: new tracks pushed to CDN edge when published
    Top 1M tracks permanently cached at all major PoPs
    Long-tail tracks: cached at regional hub, fetched from GCS on miss

SPOTIFY ON GOOGLE CLOUD:
  Spotify migrated from own data centers to Google Cloud (~2016 migration)
  GCS: audio file storage
  Bigtable: ML feature store
  BigQuery: analytics warehouse (100+ TB queries per day)
  Dataflow (Apache Beam): streaming ML pipeline for recommendations

CHAOS ENGINEERING:
  Spotify runs persistent chaos experiments (similar to Netflix Chaos Monkey)
  Random service instance failures during business hours
  Goal: every team owns their failure modes — on-call must be able to handle any failure
  Result: 99.95% availability despite 800+ services`,
        },
      ],
    },
  ],

  metrics: [
    { label: "Monthly Active Users", value: "600M+", note: "as of 2024" },
    { label: "Premium Subscribers", value: "240M+", note: "paying users" },
    { label: "Tracks in catalog", value: "100M+", note: "music + podcasts" },
    { label: "Daily streams", value: "30B+", note: "estimated, music + podcasts" },
    { label: "Countries", value: "180+", note: "available markets" },
    { label: "Playlists", value: "4B+", note: "user-created" },
    { label: "Microservices", value: "800+", note: "independent services" },
    { label: "Playback start", value: "< 250ms", note: "p99 globally" },
  ],
};

export const SPOTIFY_LLD = {
  title: "Spotify — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of core Spotify services",

  components: [
    {
      id: "trackService",
      title: "Track Service — LLD",
      description: "Playback URL generation, DRM, quality selection, and streaming session management",
      api: `GET /api/v1/tracks/{trackId}
Response:
{
  "track_id": "4iV5W9uYEdYUVa79Axb7Rh",
  "name": "Bohemian Rhapsody",
  "artists": [{ "id": "1dfeR4HaWDbWqFHLkxsg1d", "name": "Queen" }],
  "album": { "id": "6i6folBtxKV28WX3msQ4FE", "name": "A Night at the Opera" },
  "duration_ms": 354320,
  "explicit": false,
  "popularity": 98,
  "preview_url": "https://p.scdn.co/mp3-preview/...",  // 30s preview, free
  "available_markets": ["US", "GB", "DE", ...],
  "track_number": 11
}

GET /api/v1/tracks/{trackId}/playback
Headers: Authorization: Bearer <access_token>
Query: ?quality=high&device_id=abc123&format=ogg
Response:
{
  "stream_url": "https://audio-ak.scdn.co/audio/{fileId}?token=HMAC&expires=1745503200",
  "cdn_url": "https://audio4.scdn.co/audio/{fileId}?...",   // fallback CDN
  "format": "ogg",
  "bitrate": 320,
  "duration_ms": 354320,
  "file_size_bytes": 14172800,
  "expires_at": "2026-04-23T14:00:00Z",
  "stream_event_id": "se_xyz"    // for royalty tracking
}

POST /api/v1/playback/stream-event
{
  "stream_event_id": "se_xyz",
  "track_id": "4iV5W9uYEdYUVa79Axb7Rh",
  "played_ms": 45000,           // how many ms actually played
  "reason_start": "clickrow",   // clickrow | appload | trackdone | backbtn
  "reason_end":   "trackdone",  // trackdone | fwdbtn | endplay | logout
  "shuffle": false,
  "offline": false
}`,
      internals: `Quality selection logic:
  IF user.subscription == 'free':
    quality = 'normal'  (160 kbps)
    IF bandwidth_estimate < 96 kbps: quality = 'low'
  ELIF user.subscription == 'premium':
    quality = user.preference  (default 'high' = 320 kbps)
    IF device == 'mobile' AND user.data_saver: quality = 'normal'
  ELIF user.subscription == 'hifi':
    quality = 'lossless' (FLAC)

Signed URL generation:
  file_id = track_quality_map[track_id][quality]
  secret = KMS-managed key (rotated daily)
  token = HMAC_SHA256(file_id + user_id + device_id + expires, secret)
  url = "https://audio-ak.scdn.co/audio/{file_id}?token={token}&expires={ts}"
  CDN validates token on each byte-range request

Pre-fetching protocol:
  Client maintains queue: [current_track, next_track, track_after]
  While current track plays: client fetches next_track in background
  Result: next track starts playing from local cache (zero latency)
  Queue updates: user skips → invalidate prefetch, fetch new next track

Offline DRM:
  Download request → Track Service issues DRM license
  License encrypted with device-specific key (hardware-backed on mobile)
  Audio file downloaded and encrypted at rest
  Playback: decrypt in-memory → stream to audio output
  License server check on app launch: if subscription lapsed → revoke licenses`,
    },
    {
      id: "streamCountService",
      title: "Stream Count Service — LLD",
      description: "Exactly-once royalty counting — 30B+ streams/day, no missed plays",
      api: `POST /api/v1/playback/stream-event
(Fired by client when track played > 30 seconds)
{
  "stream_event_id": "se_xyz",    // client-generated UUID (idempotency key)
  "track_id": "4iV5W9uYEdYUVa79Axb7Rh",
  "user_id": "u_abc123",
  "played_ms": 185000,
  "context_type": "playlist",     // playlist | album | artist | radio | search
  "context_id": "pl_xyz",
  "shuffle": false,
  "offline": false,
  "offline_timestamp": null,      // if offline: when was it actually played?
  "country": "US"
}
Response: { "status": "accepted", "royalty_eligible": true }

GET /internal/royalty/streams?track_id={trackId}&date={YYYY-MM-DD}
Response:
{
  "track_id": "...",
  "date": "2026-04-23",
  "stream_count": 4820000,
  "royalty_eligible_streams": 4750000,  // after dedup and validation
  "breakdown_by_country": { "US": 2100000, "GB": 580000, ... }
}`,
      internals: `Validation rules (synchronous, before Kafka publish):
  1. played_ms >= 30000 (30 seconds) → required for royalty eligibility
  2. stream_event_id (UUID) not seen in last 24h → deduplication check (Redis SET)
  3. user authenticated and subscription valid at time of play
  4. track is licensed in user's country
  5. rate limit: same user + same track within 1 hour → not counted twice for royalties
     (counted for analytics, not royalties)

Kafka exactly-once producer config:
  enable.idempotence = true
  acks = all
  transactional.id = "stream-event-producer-{pod-id}"
  → Kafka guarantees no duplicate messages even on retry after broker failure

Flink consumer (royalty aggregation):
  Watermark: event_time with 5 min allowed lateness (handle clock skew, offline plays)
  Window: tumbling 1-hour window per (track_id, country)
  Dedup: keyed state on stream_event_id within 24h window
  Output: (track_id, date, country, stream_count) → royalty ledger

Royalty ledger schema (PostgreSQL):
CREATE TABLE royalty_streams (
  track_id     TEXT NOT NULL,
  date         DATE NOT NULL,
  country      CHAR(2) NOT NULL,
  stream_count BIGINT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ,
  PRIMARY KEY (track_id, date, country)
);
-- Upsert every 15 minutes from Flink:
INSERT INTO royalty_streams VALUES (...)
ON CONFLICT (track_id, date, country)
DO UPDATE SET stream_count = royalty_streams.stream_count + EXCLUDED.stream_count;

Offline stream reconciliation:
  Offline play stored locally with offline_timestamp
  On reconnect: client sends stream-events with offline_timestamp set
  Service accepts events up to 30 days old
  Beyond 30 days: rejected (royalty window closed)`,
    },
    {
      id: "recommendationService",
      title: "Recommendation Service — LLD",
      description: "Collaborative filtering + audio features — Discover Weekly and Radio",
      api: `GET /api/v1/recommendations/discover-weekly?user_id={userId}
Response:
{
  "playlist_id": "dw_u_abc123_20260421",
  "name": "Discover Weekly",
  "tracks": [
    {
      "track_id": "...",
      "name": "...",
      "artists": [...],
      "reason": "Based on your taste",
      "confidence": 0.87
    },
    ... // 30 tracks total
  ],
  "generated_at": "2026-04-21T00:00:00Z",
  "expires_at": "2026-04-28T00:00:00Z"
}

GET /api/v1/radio/next?seed_track_id={trackId}&user_id={userId}&exclude_track_ids=[...]
Response:
{
  "tracks": [
    { "track_id": "...", "similarity_score": 0.91, "reason": "Similar energy" },
    ...   // 10 tracks
  ]
}

POST /api/v1/recommendations/feedback
{
  "user_id": "u_abc123",
  "track_id": "...",
  "feedback_type": "skip",       // skip | like | dislike | save | share
  "position_in_session": 3,
  "played_ms": 12000             // skipped after 12s
}`,
      internals: `Collaborative filtering pipeline (weekly Spark job):

Matrix Factorization (ALS — Alternating Least Squares):
  Input: user_track_play_matrix (600M × 100M, sparse)
         entry = log(1 + play_count) for (user, track) pairs
  Output: user_factors (600M × 50), item_factors (100M × 50)

  ALS alternates:
  FIX item_factors → solve for user_factors (linear regression per user)
  FIX user_factors → solve for item_factors (linear regression per track)
  Repeat 20 iterations → convergence

  Implementation: Spark MLlib on 200-node cluster
  Runtime: ~12 hours (Friday night → Sunday morning)
  Output stored: Bigtable (user_embeddings), GCS (item_embeddings)

Discover Weekly generation (Sunday night batch):
  For user U:
  1. Fetch user_embedding[U] from Bigtable
  2. ANN (Approximate Nearest Neighbor) lookup: ScaNN / Faiss
     → top 200 similar users (cosine similarity in 50D space)
  3. Aggregate: union of last-month listens of 200 similar users
  4. Remove: tracks U has played in last 6 months OR skipped 2+ times
  5. Score remaining by: collaborative score × audio feature match
  6. Apply diversity: max 2 tracks per artist, max 4 per genre
  7. Select top 30

Radio/Autoplay (real-time, < 100ms):
  Input: seed track embedding (pre-computed, cached in Redis)
  ANN query: ScaNN approximate search → top 50 acoustically similar tracks
  Filter: recently heard by user (check Cassandra listen history, last 30 days)
  Re-rank: collaborative score × acoustic similarity × novelty score
  Return top 10 candidates

Session feedback processing (real-time):
  Skip event → temporarily downweight skipped track's genre in session
  Like/Save → upweight similar tracks for rest of session
  Implemented as: in-memory session state in Radio Service
  Persisted: Kafka feedback-events → weekly model retraining input`,
    },
    {
      id: "playlistService",
      title: "Playlist Service — LLD",
      description: "4B+ playlists — CRUD, collaborative editing, follower fanout",
      api: `POST /api/v1/playlists
{
  "name": "Morning Run",
  "description": "High energy tracks for morning runs",
  "public": true,
  "collaborative": false
}
Response: { "playlist_id": "pl_abc123", ... }

POST /api/v1/playlists/{playlistId}/tracks
{
  "track_ids": ["4iV5W9uYEdYUVa79Axb7Rh", "..."],
  "position": 0    // 0 = insert at start, null = append
}

DELETE /api/v1/playlists/{playlistId}/tracks
{
  "track_ids": ["4iV5W9uYEdYUVa79Axb7Rh"],
  "snapshot_id": "snap_xyz"   // optimistic concurrency token
}

PUT /api/v1/playlists/{playlistId}/tracks/reorder
{
  "range_start": 3,       // move tracks starting at position 3
  "insert_before": 1,     // to before position 1
  "range_length": 2,      // move 2 tracks
  "snapshot_id": "snap_xyz"
}

GET /api/v1/playlists/{playlistId}?fields=tracks,metadata
GET /api/v1/playlists/{playlistId}/followers/contains?user_ids=[u1,u2]
PUT /api/v1/playlists/{playlistId}/followers  (follow)
DELETE /api/v1/playlists/{playlistId}/followers  (unfollow)`,
      internals: `PostgreSQL schema:
CREATE TABLE playlists (
  playlist_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  is_public         BOOLEAN DEFAULT true,
  is_collaborative  BOOLEAN DEFAULT false,
  snapshot_id       TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  follower_count    INT DEFAULT 0,
  track_count       INT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE playlist_tracks (
  playlist_id   UUID NOT NULL REFERENCES playlists,
  track_id      TEXT NOT NULL,
  position      INT NOT NULL,
  added_by      UUID NOT NULL,
  added_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (playlist_id, position)
);
CREATE UNIQUE INDEX playlist_track_unique ON playlist_tracks (playlist_id, track_id);

Snapshot ID (optimistic concurrency):
  Every write generates new snapshot_id = UUID
  Client includes snapshot_id in delete/reorder requests
  IF current snapshot_id != provided → 409 Conflict (playlist changed since you read it)
  Client: re-fetch playlist, re-apply operation, retry

Track reorder (position management):
  Naive: shift all positions after insert point → O(N) updates
  Better: use floating-point positions (position = 1.5 between 1 and 2)
  After 50 reorders, positions get too close → rebalance: assign integers 0,1,2...

Follower count update:
  follower_count: updated by background job, not synchronously
  Real-time count not critical — eventual consistency acceptable
  Background job: COUNT followers every 5 minutes → UPDATE playlists SET follower_count

Collaborative playlist conflicts:
  Two users add tracks simultaneously:
  • Both succeed: positions assigned by DB sequence (auto-increment)
  • No conflict: inserts are at different positions (both appended)
  Reorder conflicts: snapshot_id check → first writer wins, second gets 409`,
    },
    {
      id: "searchService",
      title: "Search Service — LLD",
      description: "Elasticsearch-backed catalog search with popularity and personalization ranking",
      api: `GET /api/v1/search?q=bohemian+rhapsody&type=track,artist&limit=20&market=US
Response:
{
  "tracks": {
    "total": 8,
    "items": [
      {
        "id": "4iV5W9uYEdYUVa79Axb7Rh",
        "name": "Bohemian Rhapsody",
        "artists": [{ "name": "Queen" }],
        "album": { "name": "A Night at the Opera" },
        "duration_ms": 354320,
        "popularity": 98,
        "explicit": false
      },
      ...
    ]
  },
  "artists": {
    "total": 2,
    "items": [{ "id": "1dfeR4HaWDbWqFHLkxsg1d", "name": "Queen", "popularity": 87 }]
  }
}

GET /api/v1/search/autocomplete?q=bohem&type=all&limit=5
Response:
{
  "suggestions": [
    { "type": "track", "display": "Bohemian Rhapsody — Queen" },
    { "type": "artist", "display": "Bohemia" }
  ]
}`,
      internals: `Elasticsearch index (tracks):
{
  "settings": { "number_of_shards": 20, "number_of_replicas": 2 },
  "mappings": {
    "properties": {
      "track_id":    { "type": "keyword" },
      "name":        { "type": "text", "analyzer": "english", "boost": 5,
                       "fields": { "exact": { "type": "keyword" } } },
      "name_suggest":{ "type": "completion" },   // for autocomplete
      "artist_name": { "type": "text", "analyzer": "english", "boost": 3 },
      "album_name":  { "type": "text", "analyzer": "english", "boost": 1 },
      "lyrics":      { "type": "text", "analyzer": "english" },
      "popularity":  { "type": "integer" },
      "play_count_30d": { "type": "long" },
      "release_date":{ "type": "date" },
      "genres":      { "type": "keyword" },
      "available_markets": { "type": "keyword" }
    }
  }
}

Query pipeline:
  Step 1: Elasticsearch multi-match + function_score
    multi_match: ["name^5", "artist_name^3", "album_name", "lyrics"]
    function_score: multiply by log(popularity + 1)
    filter: available_markets contains user.market

  Step 2: Personalization reranking (post-ES, in-memory)
    For top 50 results:
      affinity = user_artist_affinity[result.artist_id]  (from Redis)
      final_score = 0.6 × es_score + 0.4 × affinity
    Re-sort → return top 20

Autocomplete (Elasticsearch Completion Suggester):
  Dedicated completion field pre-analyzed into prefix tokens
  Query: suggest.name_suggest prefix "bohem" → returns completions
  Results sorted by popularity (built into completion field weight)
  Latency: < 20ms (completion suggester uses in-memory FST data structure)

Market filtering:
  Every track has available_markets array
  All queries include: filter: { term: { available_markets: user.country } }
  Tracks not licensed in user's country don't appear in search results`,
    },
    {
      id: "userService",
      title: "User & Auth Service — LLD",
      description: "OAuth2 PKCE, subscription management, and session handling",
      api: `POST /api/v1/auth/token   (OAuth2 token exchange)
{
  "grant_type": "authorization_code",
  "code": "auth_code_from_redirect",
  "code_verifier": "pkce_verifier",    // PKCE — prevents code interception
  "client_id": "client_app_id",
  "redirect_uri": "spotify://callback"
}
Response:
{
  "access_token": "BQA...",      // JWT, valid 1 hour
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "AQA...",    // long-lived, used to get new access_token
  "scope": "user-read-playback-state playlist-modify-public"
}

GET /api/v1/me
Headers: Authorization: Bearer <access_token>
Response:
{
  "user_id": "u_abc123",
  "display_name": "John Doe",
  "email": "john@example.com",
  "subscription": {
    "type": "premium",           // free | premium | hifi
    "expires_at": "2026-05-23",
    "is_trial": false
  },
  "country": "US",
  "followers": { "total": 142 }
}`,
      internals: `JWT structure:
  Header: { "alg": "RS256", "kid": "key-id-2026-04" }
  Payload: {
    "sub": "u_abc123",
    "scope": "user-read-playback-state playlist-modify-public",
    "plan": "premium",
    "iat": 1745503200,
    "exp": 1745506800    // 1 hour
  }
  Signature: RS256 with Spotify's private key
  Verification: services fetch public key from JWKS endpoint → verify locally (no auth round-trip)

Subscription state (PostgreSQL):
CREATE TABLE subscriptions (
  user_id       UUID PRIMARY KEY,
  plan          TEXT NOT NULL,     -- free | premium | hifi
  status        TEXT NOT NULL,     -- active | cancelled | past_due | trialing
  current_period_end TIMESTAMPTZ,
  stripe_customer_id TEXT,         -- payment processor reference
  updated_at    TIMESTAMPTZ
);

Premium check (on every protected API call):
  JWT claim "plan" used for fast check (no DB query)
  But JWT valid for 1 hour — if user cancels, JWT still claims "premium" for up to 1h
  Mitigation: critical endpoints (download, HiFi) do synchronous DB check
  Regular playback: JWT claim acceptable (1h lag on plan change)

Refresh token rotation:
  Access token expires → client sends refresh_token
  New access_token issued + new refresh_token (old one invalidated)
  Refresh tokens stored in Redis (SET with TTL = 90 days)
  On refresh: lookup old token → if not found (revoked/expired) → re-auth required`,
    },
  ],
};

export const SPOTIFY_QNA = [
  {
    id: "sq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Spotify", "Apple", "Amazon"],
    question: "Design Spotify at a high level. How does a track go from being uploaded by a label to playing in a user's ear?",
    answer: `Two distinct flows: ingest (label to CDN) and playback (CDN to user).

INGEST PIPELINE (async, minutes to hours):
1. Label uploads WAV/FLAC via content portal
2. Validation: file integrity + metadata completeness (ISRC code required for royalties)
3. Transcoder produces quality variants: 24/96/160/320 kbps OGG Vorbis + FLAC
4. Segments (~10s each) pushed to GCS (origin) and pre-positioned on CDN
5. Metadata written to catalog DB; track marked AVAILABLE

PLAYBACK FLOW (real-time, target < 250ms):
1. User taps track → client sends GET /track/{id}/playback
2. Track Service: check subscription → select quality tier → generate signed CDN URL
3. Client connects directly to CDN PoP — Spotify backend no longer in path
4. CDN streams audio; client buffers and decodes
5. After 30s: client fires stream-event → royalty counting pipeline

KEY INSIGHT:
"Pre-fetching is Spotify's secret to instant playback. While track N plays, client fully downloads track N+1. When user presses next, track N+1 plays from local cache — zero network wait. Gapless playback is possible because next track is already decoded in the audio buffer."`,
    followups: [
      "How does Spotify handle the case where a track is removed from the catalog mid-playback?",
      "What's the tradeoff between pre-fetching more tracks vs battery/data usage on mobile?",
      "How do you ensure signed URLs can't be shared to give free access to premium tracks?",
    ],
  },
  {
    id: "sq2",
    category: "Recommendations",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Spotify", "Netflix", "Google"],
    question: "Design Discover Weekly. How does Spotify generate a personalized 30-track playlist for 600 million users every week?",
    answer: `Discover Weekly is collaborative filtering at planetary scale — 600M users × weekly regeneration.

CORE TECHNIQUE — Collaborative Filtering (Matrix Factorization):
• Build user-track interaction matrix: 600M × 100M (sparse — most entries empty)
• Matrix Factorization (ALS): decompose into user_vectors (600M × 50) × track_vectors (100M × 50)
• Result: each user and track is a 50-dimensional embedding in shared latent space
• "Similar users" = users with similar embedding vectors (cosine similarity)

WEEKLY GENERATION (runs Sunday night on Spark):
For each of 600M users:
1. Fetch user embedding from Bigtable
2. ANN search: find 200 "taste twin" users (most similar embedding vectors)
3. Collect what taste twins listened to that this user hasn't heard
4. Score candidates: collaborative_score × audio_feature_similarity
5. Filter: exclude heard in last 6 months, exclude skipped 2+ times
6. Diversity constraints: max 2 tracks per artist, max 4 per genre
7. Select 30 → store as playlist in PostgreSQL

ADDITIONAL SIGNAL — Audio Analysis:
• Echo Nest analyzed every track: tempo, energy, danceability, valence, acousticness
• Enables cold-start: new tracks recommended before anyone plays them
• "User likes high-energy electronic music" → new track with matching features scores high

SCALE:
600M playlists generated in ~12 hours (Friday night start)
Spark cluster: 200+ machines, ALS iteration × 20 passes over petabytes of data`,
    followups: [
      "How do you handle a new user with zero listening history? (Cold start problem)",
      "Discover Weekly drops Monday. What if the Spark job fails at 11pm Sunday?",
      "How would you A/B test a new recommendation algorithm without degrading UX for control group?",
    ],
  },
  {
    id: "sq3",
    category: "Royalties",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Spotify", "Apple", "Tidal"],
    question: "Design a royalty counting system. How do you count 30 billion streams per day and ensure no stream is missed or double-counted?",
    answer: `Royalty counting is the most critical data pipeline at Spotify — labels can audit every stream.

THE CONSTRAINT: Unlike YouTube view counts (approximate is fine), royalties must be EXACTLY correct. One missed stream = unpaid royalty = legal/contract violation.

WHAT COUNTS AS A ROYALTY-ELIGIBLE STREAM:
• Track played for > 30 seconds
• One play per user per track per 24 hours counted for royalties
• Offline plays counted when device reconnects
• Not counted: repeated plays by bots, plays from own device (some markets)

PIPELINE (exactly-once semantics):

INGESTION (client → Kafka):
  Client fires stream-event after 30s with idempotency key (UUID)
  Stream Event Service validates: >30s? authenticated? licensed in country?
  Publishes to Kafka royalty-events topic with exactly-once producer
  (Kafka transactions guarantee: no duplicates even on broker failure + retry)

AGGREGATION (Flink streaming):
  Dedup state: stream_event_id in keyed state, 24h window → reject duplicates
  24h dedup: same user + same track within 24h → count once for royalties
  Tumbling 1h window: aggregate per (track_id, country, date)
  Output: batch increments to royalty ledger every 15 minutes

ROYALTY LEDGER (PostgreSQL — ACID):
  INSERT ... ON CONFLICT DO UPDATE SET count = count + EXCLUDED.count
  Upsert is idempotent: safe to replay Flink output on failure
  Permanent audit log: every raw event stored in S3 forever

MONTHLY PAYOUT:
  royalty = stream_count × per_stream_rate × label_share
  per_stream_rate varies by country, subscription tier (premium streams worth more)`,
    followups: [
      "A device was offline for 3 days. How do you handle 3 days of offline plays arriving at once?",
      "How do you detect and filter bot streams without false-positiving on legitimate super-fans?",
      "A label disputes the stream count for one of their tracks. How do you investigate?",
    ],
  },
  {
    id: "sq4",
    category: "Storage",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["Spotify", "SoundCloud", "Apple"],
    question: "How does Spotify store and serve 100 million tracks at 5 quality levels each without going broke on storage costs?",
    answer: `Storage tiering + CDN caching. The math: 100M tracks × 5 qualities × ~10MB/quality = 5 PB total. Not all equal.

WHAT'S STORED PER TRACK:
• 5 quality variants: 24/96/160/320 kbps OGG + FLAC = ~50MB total per track
• 10-second segments for streaming (or full file for offline download)
• Raw original WAV/FLAC (preserved for future re-encoding, never deleted)
• Total: ~100MB per track including original → 10 PB for full catalog

STORAGE TIERS (GCS):
  Hot (top 1M tracks, ~monthly access): Standard tier — fast, $0.02/GB/month
  Warm (1M–10M tracks): Nearline — $0.01/GB/month, ~5ms access
  Cold (rarely accessed long tail): Coldline — $0.004/GB/month
  Long tail (99%+ of catalog): rarely streamed → cheap cold storage is fine

CDN AS CACHE:
  Top 1% of tracks = 90%+ of streams (power law distribution)
  Top 1M tracks permanently cached at all major CDN PoPs
  CDN hit rate: 95%+ for streamed content (most users listen to popular music)
  Long tail: CDN miss → fetch from GCS origin → cache at edge for 24h

COST OPTIMIZATION:
  New codec (Vorbis → Opus): 25% smaller at same quality → 25% storage savings
  Re-encode old catalog: raw originals preserved → re-encode to Opus anytime
  Deduplication: same track released on multiple compilations → store once, reference many

BANDWIDTH MATH:
  30B streams/day × 4 minutes × 320 kbps = 115 PB/day of audio served
  Almost all from CDN edge — origin serves only ~5% (CDN misses)`,
    followups: [
      "How do you handle a new album drop where millions of users want the same track simultaneously?",
      "How do you manage CDN cache invalidation when a track is removed due to copyright dispute?",
      "Should Spotify store the original WAV files forever? What's the cost/benefit tradeoff?",
    ],
  },
  {
    id: "sq5",
    category: "Search",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Spotify", "Shazam", "SoundCloud"],
    question: "Design Spotify Search. How do you search 100M tracks, artists, albums, and podcasts in < 300ms?",
    answer: `Standard Elasticsearch + popularity ranking + light personalization.

INDEX STRUCTURE:
  Separate indices for: tracks, artists, albums, playlists, podcasts, episodes
  Key fields per track: name (boost 5×), artist_name (boost 3×), album_name, lyrics
  Pre-computed: popularity score (0–100, based on 30-day weighted play count)

QUERY PIPELINE (< 300ms target):
  Step 1 — Elasticsearch (< 100ms):
    multi_match query: "bohemian rhapsody" across indexed text fields
    function_score: multiply BM25 score by log(popularity + 1)
    filter: available_markets contains user.country
    Returns top 50 candidates per entity type

  Step 2 — Personalization rerank (< 50ms, in-memory):
    For each result: affinity = user's historical affinity to that artist (from Redis)
    final_score = 0.6 × text_score + 0.4 × artist_affinity
    Re-sort, return top 20

  Step 3 — Merge entity types (< 20ms):
    Interleave tracks, artists, albums, podcasts by score
    Lead with most likely entity type for this query

AUTOCOMPLETE (< 50ms, Elasticsearch completion suggester):
  completion field pre-indexed as prefix FST (Finite State Transducer)
  Weighted by track popularity → "Bohemian" suggests "Bohemian Rhapsody" first
  In-memory data structure → single-digit millisecond latency`,
    followups: [
      "How do you handle searches for song lyrics when you don't index full lyrics by default?",
      "How would you implement voice search (Siri-style) on top of text search?",
      "How do you handle search in languages with no spaces (Chinese, Japanese)?",
    ],
  },
  {
    id: "sq6",
    category: "Real-Time",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Spotify", "Apple", "Amazon"],
    question: "Design Spotify's real-time friend activity feed. How do you show 'John is listening to X' to all of John's followers in real time?",
    answer: `Real-time fan-out via WebSocket + Kafka. The challenge: fan-out at scale when popular users have millions of followers.

ARCHITECTURE:

PRODUCER SIDE:
  User starts track → stream-event published to Kafka
  Social Feed Service consumes stream-events
  Looks up follower list: SELECT follower_id FROM follows WHERE followee_id = user_id
  (Cached in Redis for active users — follower list hot for users with recent activity)

FAN-OUT STRATEGY (depends on follower count):

  Small follower count (< 1,000):
  • Fan-out on write: immediately push to each follower's WebSocket connection
  • Simple, low latency, works fine at small scale

  Large follower count (popular user, >100K):
  • Fan-out on read: write activity to single "activity:{user_id}" Redis key
  • Followers' feed service pulls when they request their feed
  • Avoids writing 100K messages on every track change

  Hybrid (most real systems):
  • threshold = 10,000 followers
  • < 10K: fan-out on write
  • > 10K: write to activity store, followers pull on feed request

REAL-TIME DELIVERY (WebSocket):
  Each client maintains persistent WebSocket to Feed Service
  Feed Service: receives pushed activity → write to WebSocket buffer
  Client offline: activity stored in Redis feed:{follower_id} (last 20 activities)
  Client reconnects: fetch stored activities from Redis

ACTIVITY FORMAT:
  { user_id: "...", display_name: "John", track_id: "...", track_name: "...",
    artist_name: "...", timestamp: "...", action: "playing" }`,
    followups: [
      "Ed Sheeran has 80M Spotify followers. When he starts a new track, how do you fan-out the activity?",
      "How do you handle privacy — what if John doesn't want to share his listening activity?",
      "How do you handle a WebSocket connection dropping mid-session?",
    ],
  },
  {
    id: "sq7",
    category: "Offline Mode",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["Spotify", "Apple", "Netflix"],
    question: "Design Spotify's offline mode for Premium users. How do you let users download and play music without an internet connection while preventing piracy?",
    answer: `Offline mode is a DRM problem as much as a storage problem.

WHAT DRM SOLVES:
  Without DRM: downloaded OGG file could be extracted and shared → labels won't allow it
  With DRM: file is encrypted with a device-specific key → useless on another device

DOWNLOAD FLOW:
1. User marks playlist/album for download
2. Client requests license from License Server:
   POST /license { track_id, device_id, user_id }
   License Server checks: user has active Premium subscription?
   Returns: encrypted content key specific to this device
3. Client downloads audio file from CDN (same signed URL as streaming)
4. Client encrypts audio file using content key → stores on device
5. Content key stored in secure device storage (iOS Keychain / Android Keystore)
   → Hardware-backed, cannot be extracted even with root access

OFFLINE PLAYBACK:
  Client decrypts audio in-memory using stored content key → stream to audio output
  Key never written to disk unencrypted

LICENSE VALIDATION ON RECONNECT:
  App connects to internet → License Server checks: subscription still active?
  If subscription lapsed: License Server marks keys as revoked
  Next app launch: client attempts key validation → revoked → downloads deleted
  Grace period: 30 days offline before forced re-validation (for travelers)

OFFLINE STREAM COUNTING:
  Plays stored locally: { track_id, played_at, played_ms }
  On reconnect: batch upload to Stream Event Service with offline_timestamp
  Server accepts events up to 30 days old → royalties credited retroactively

STORAGE LIMITS:
  10,000 songs max per device (licensing requirement)
  User can manage downloads — delete individual tracks or playlists`,
    followups: [
      "How do you handle a user who has 5 devices? Are licenses per-device or per-account?",
      "What happens if the user's device is stolen — can they revoke the license remotely?",
      "How do you handle DRM for podcasts, which don't have the same licensing requirements as music?",
    ],
  },
  {
    id: "sq8",
    category: "Scale",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Spotify", "Apple", "Amazon"],
    question: "Taylor Swift drops a surprise album at midnight. 10 million users try to listen simultaneously. How does Spotify handle the load?",
    answer: `New album drops are Spotify's thundering herd scenario. Three problems: metadata load, CDN cold start, and royalty spike.

PROBLEM 1 — METADATA STAMPEDE:
  10M users simultaneously fetch: GET /albums/{albumId}/tracks
  All 10M hit metadata service at the same time → cache is cold (new album)

  Solution:
  • Pre-warm cache: Spotify knows album releases in advance (artists submit weeks early)
  • 1 hour before midnight: pre-load album metadata into Redis at all regional clusters
  • At midnight: all 10M requests hit warm Redis cache → ~1ms response, no DB load

PROBLEM 2 — CDN COLD START:
  New tracks have zero CDN cache — everyone would fetch from origin
  10M listeners × 4 min × 320 kbps = 38 Gbps against origin → collapse

  Solution:
  • Pre-distribute to CDN edge: starting 30 min before release
  • Signed URL with release_time restriction: CDN caches files but rejects requests before midnight
  • At midnight: cache is warm at all PoPs, 10M simultaneous requests hit CDN (not origin)

PROBLEM 3 — ROYALTY SPIKE:
  10M stream events fired simultaneously after 30s of playback
  Stream Event Service: horizontal auto-scaling handles ingestion spike
  Kafka: partitioned → no bottleneck (add more partitions for the event)
  Flink: auto-scales consumers → aggregation catches up within minutes

PRE-RELEASE PREPARATION CHECKLIST:
  • Album metadata pre-warmed ✓
  • Audio files pre-distributed to CDN ✓
  • Track Service instances pre-scaled to 5× normal ✓
  • Artist page cached (expect huge traffic) ✓
  • Social feed service: fan-out throttled (not all 80M followers get push in 1s) ✓`,
    followups: [
      "Taylor Swift un-lists her entire back catalog again. How do you remove 400 tracks from CDN across 200+ PoPs?",
      "How would you handle exclusive release windows (e.g., first 24 hours on Spotify only)?",
      "What if the album was accidentally released 1 hour early? How do you roll it back?",
    ],
  },
];
