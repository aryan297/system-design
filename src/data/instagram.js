export const INSTAGRAM_HLD = {
  title: "Instagram — High Level Design",
  subtitle: "Photo/video sharing for 2B+ users — feed, stories, reels, and DMs at global scale",
  overview: `Instagram is Meta's highest-engagement social platform — 2B+ monthly users, 500M daily Stories users, and 100M+ Reels viewers. The core engineering challenges: media storage and delivery at petabyte scale, a feed ranking system that personalizes for each user in real time, and a social graph supporting follow relationships for users with millions of followers.

Three systems define Instagram's architecture: the media pipeline (upload, process, CDN delivery), the feed/ranking system (what posts to show which users), and the social graph (who follows whom, and the fan-out problem when celebrities post).

Instagram was originally built on Django/Python and moved to a distributed microservices architecture as it scaled from 1M to 2B users.`,

  diagram: `
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│              iOS · Android · Web · Threads (linked)                 │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  HTTPS / WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   API GATEWAY / LOAD BALANCER                       │
│         Auth · Rate Limiting · Routing · TLS Termination            │
└──┬──────────────┬──────────────┬─────────────────┬─────────────────┘
   │              │              │                 │
   ▼              ▼              ▼                 ▼
┌──────┐    ┌──────────┐  ┌──────────┐    ┌────────────────┐
│Media │    │  Feed    │  │  Social  │    │  Messaging     │
│Service│   │ Service  │  │  Graph   │    │  Service (DM)  │
└──┬───┘    └────┬─────┘  └──────────┘    └────────────────┘
   │             │
   ▼             ▼
┌──────────┐  ┌──────────────────────────────────────────────────┐
│ Media    │  │                 DATA LAYER                        │
│Processing│  │  PostgreSQL · Cassandra · Redis · TAO (Graph DB) │
│Pipeline  │  │  Kafka · Memcached · S3 / Blob Store             │
└────┬─────┘  └──────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        MEDIA CDN (Meta CDN)                         │
│   Instagram uses Meta's own CDN + Akamai — 100+ PoPs worldwide      │
│   Photo CDN (cdninstagram.com) · Video CDN (video.xx.fbcdn.net)     │
└─────────────────────────────────────────────────────────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Media Upload & Processing",
      sections: [
        {
          title: "Photo & Video Upload Pipeline",
          content: `When a user posts a photo or video, it goes through a multi-stage processing pipeline before being visible.

PHOTO UPLOAD PIPELINE:
1. Client compresses photo client-side (JPEG, quality adjusted to connection speed)
2. Upload to Media Service via multipart HTTP POST or chunked upload (for videos)
3. Validation: file type, file size limit (< 8MB photos, < 100MB videos)
4. Raw file stored in S3/Blob store immediately (async processing from here)
5. Post record created in DB: status=PROCESSING, media_url=null
6. Processing pipeline triggered:

   PHOTO PROCESSING:
   • Resize: generate thumbnail variants (150px, 240px, 320px, 480px, 640px, 1080px)
   • Format conversion: HEIC → JPEG, apply minimal compression
   • EXIF stripping: remove GPS coordinates, device metadata (privacy)
   • Content moderation: run ML classifier (nudity, violence, spam)
   • Perceptual hash: compare against known CSAM database
   • CDN pre-warm: push processed images to edge nodes

   VIDEO PROCESSING (more complex):
   • Transcode to multiple formats/bitrates (H.264 / H.265 / VP9)
   • Generate thumbnail at multiple timestamps
   • Extract audio track separately
   • Closed caption generation (Whisper ASR for accessibility)
   • Segment for adaptive streaming (HLS)

7. All variants complete → post status=PUBLISHED, media_urls=[variants]
8. Feed fanout begins (see Phase 2)`,
        },
        {
          title: "Stories Architecture — 24-Hour Ephemeral Content",
          content: `Stories are Instagram's highest-engagement format — 500M daily users. They expire after 24 hours.

STORIES vs POSTS — architectural differences:
  Posts: permanent, indexed, appear in feed ranking
  Stories: ephemeral (TTL=24h), ordered chronologically, shown to all followers

STORY UPLOAD:
  Same pipeline as photos/videos for media processing
  Additional metadata: expires_at = upload_time + 24h
  Story record: story_id, user_id, media_url, created_at, expires_at, viewers[]

STORY EXPIRY:
  Naive: cron job every hour, DELETE WHERE expires_at < NOW() → expensive full scan
  Better: TTL-based expiry
    • Redis: SET story:{story_id} {data} EX 86400 (86400s = 24h)
    • On expiry: Redis fires keyspace notification → Kafka event → DB soft-delete
    • DB: stories not deleted, just marked expired=true (needed for analytics, re-surfacing as Highlights)

STORY VIEWER TRACKING:
  "John saw your story" — must track which followers viewed each story
  Scale: celebrity has 50M followers, posts 10 stories → 500M potential view events

  Implementation:
  • Cassandra: story_views table
    PRIMARY KEY (story_id, viewer_id)
    Write on view: INSERT (story_id, viewer_id, viewed_at)
  • TTL on writes: 24h (auto-purge when story expires)
  • View count: pre-aggregated counter (not COUNT(*) query)

STORY ORDERING:
  Not ranked (unlike feed) — chronological within each user
  Story tray ordering (whose stories to show first): ML model
  Signals: who does this viewer interact with most? Recency of story?`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Feed & Ranking",
      sections: [
        {
          title: "Feed Generation — What You See When You Open Instagram",
          content: `The Instagram feed is ranked (not chronological). The ranking model decides which of the posts from accounts you follow should appear, and in what order.

TWO APPROACHES TO FEED GENERATION:

PUSH MODEL (Fan-out on write):
  When user A posts → immediately write post to feed of every follower
  On follower opens app: read pre-built feed from their personalized list
  Pros: fast feed load (already computed), simple read path
  Cons: writing to millions of followers' feeds = expensive for celebrities

PULL MODEL (Fan-out on read):
  When user opens feed: look up all accounts they follow → fetch recent posts → rank
  Pros: no write fan-out cost
  Cons: slow (N DB reads per user per feed load), hard to scale

INSTAGRAM'S APPROACH — HYBRID:
  Regular users (< 10K followers): push model — write to followers' feed cache on post
  Celebrities/influencers (> 10K followers): pull model — followers pull on feed load
  When user loads feed:
    1. Read pre-built feed cache (from push, for followed regular users)
    2. Fetch recent posts from followed celebrities (pull, up to 10 per celeb)
    3. Merge and rank all candidates

RANKING MODEL (ML, personalized per user):
  For each candidate post, score using:
  • Relationship signal: how often do you like/comment on this account?
  • Interest signal: does this post's topic match your engagement history?
  • Recency: posts from last hour score higher than 2-day-old posts
  • Post popularity: likes/comments/shares in first 30 min (velocity matters)
  • Format preference: do you engage more with videos or photos?

  Top 20 posts shown; more loaded on scroll`,
        },
        {
          title: "Reels — Short Video Discovery",
          content: `Reels is Instagram's TikTok competitor — algorithmically surfaced short videos, not limited to accounts you follow.

KEY DIFFERENCE FROM FEED:
  Feed: content from accounts you follow
  Reels: discovery-first — most content from accounts you don't follow

REELS RANKING SIGNALS:
  For each candidate reel, predict: P(user watches > 50%) and P(user shares)
  Features:
  • Completion rate of this reel for similar users
  • Audio track popularity (trending sounds boost reach)
  • User's historical engagement with: creator, topic, audio genre
  • Reels watched in current session (context)
  • Diversity: avoid showing same creator 3 times in a row

CANDIDATE RETRIEVAL (same two-stage as Spotify/YouTube):
  Stage 1: collaborative filtering → ~500 candidate reels
  Stage 2: deep ranking model → top 20 shown

CREATOR DISTRIBUTION:
  New creators: shown to small cohort (1,000 viewers) → if high completion → wider distribution
  Viral detection: reels with completion > threshold get amplified → next cohort = 10,000, etc.
  This is the "For You Page" equivalent — content quality (retention) determines reach

AVOID ECHO CHAMBERS:
  Diversity injection: 20% of reels from outside user's usual topics
  Prevents: users only seeing content they already agree with (political content especially)`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Social Graph",
      sections: [
        {
          title: "TAO — Meta's Social Graph Database",
          content: `Instagram's social graph is powered by TAO (The Associations and Objects) — Meta's custom graph database built for social data at planetary scale.

WHY A CUSTOM GRAPH DB:
  Social data is naturally graph-shaped: Users → follow → Users → like → Posts → tag → Users
  MySQL joins are expensive for multi-hop graph traversal
  TAO is optimized for: fast single-hop reads, high write throughput, geographically distributed

TAO DATA MODEL:
  Objects: { id, type, data }   e.g., type=user, type=post, type=comment
  Associations: { id1, type, id2, time, data }   e.g., (user1, FOLLOWS, user2)

  Common assoc types:
  • USER_FOLLOWS: (follower_id, FOLLOWS, followee_id)
  • USER_LIKES: (user_id, LIKES, post_id)
  • POST_HAS_COMMENT: (post_id, HAS_COMMENT, comment_id)
  • USER_IN_PHOTO: (user_id, TAGGED_IN, post_id)

TAO ARCHITECTURE:
  Two tiers:
  • Leaders: persistent storage (MySQL backing), one per region
  • Followers: read-through caches (Memcached), many per region, handle 99%+ of reads

  Read: Client → Follower cache (hit: return, miss: fetch from Leader → cache → return)
  Write: Client → Leader (write through, invalidate Follower caches)

  Why not just use Memcached directly?
  TAO adds: association queries (give me all users who liked this post),
            time-ordered associations (comments ordered by time),
            atomic counter updates (like count)`,
        },
        {
          title: "Fan-Out Problem — Posting as a Celebrity",
          content: `When Cristiano Ronaldo (600M followers) posts a photo, Instagram must notify and distribute to 600M users.

THE PROBLEM:
  Naive push: post → write to 600M users' feeds = 600M writes in seconds
  At 100K writes/sec: 6,000 seconds = 100 minutes for one post to propagate
  Not acceptable.

INSTAGRAM'S SOLUTION — HYBRID FAN-OUT:

For large accounts (> 10K followers):
  • Post stored in DB with creator_id
  • NO immediate fan-out to followers' caches
  • When a follower opens Instagram: pull recent posts from followed mega-accounts

For regular accounts (< 10K followers):
  • Post triggers fan-out worker
  • Fan-out worker writes post_id to each follower's feed cache (Redis list)
  • Feed cache = ordered list of post_ids for that user

FEED LOAD (combining both):
  1. Read feed cache: get recent post_ids from push fan-out (regular accounts)
  2. For each followed celebrity: fetch their last N posts (pull)
  3. Merge candidates, pass to ranking model
  4. Return ranked top 20

NOTIFICATIONS (separate from feed fan-out):
  Push notification: "Cristiano Ronaldo posted a new photo"
  This IS fanned out immediately (via FCM/APNs)
  But: aggregated — if celeb posts 3 times in 1 hour, 1 notification not 3
  Rate limited: max 1 push per user per account per hour`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Storage & Data",
      sections: [
        {
          title: "Storage Architecture — Photos at Petabyte Scale",
          content: `Instagram stores petabytes of photos and videos. Storage decisions directly impact cost and latency.

MEDIA STORAGE (S3 / Meta's own blob store):
  ~100M photos uploaded per day × ~2MB average = 200 TB/day of new media
  Total stored: exabytes of media (all historical Instagram photos since 2010)

  Meta runs its own storage infrastructure (not AWS S3):
  • Haystack: Meta's custom blob store optimized for small files (photos)
    - Traditional file system: each file = many metadata operations (open, seek, close)
    - Haystack: millions of photos stored in large "haystack" files
      → single metadata read for any photo (needle = offset in haystack)
    - 3× faster photo serving than ext4 at Instagram's scale

  • f4 (cold storage): photos accessed < 1%/month moved to erasure-coded storage
    - Normal: 3× replication (3 copies of each file) = 3× storage cost
    - Erasure coding: 14 data shards + 10 parity shards (RAID-like)
    - Can reconstruct from any 14 of 24 shards → tolerates 10 failures
    - Storage overhead: 1.71× (vs 3× for replication) — 57% cheaper
    - Acceptable: 100ms access latency for cold storage (vs 10ms hot)

PHOTO VARIANTS (stored per upload):
  150×150 px (thumbnail in grid view)
  240×240, 320×320 (grid views, different screen densities)
  480×480, 640×640 (feed view, various devices)
  1080×1080 (full resolution, high-DPI displays)
  Each variant served by CDN based on client's device pixel ratio`,
        },
        {
          title: "Database Architecture — PostgreSQL, Cassandra, Redis",
          content: `Instagram uses purpose-built storage for each data type.

POSTGRESQL (Posts, Users, Comments — relational data):
  Core tables: users, posts, comments, likes
  Sharded: horizontal sharding by user_id (hash-based)
  Each shard: primary + 2 read replicas
  Cross-shard queries: avoided (denormalize instead — store author_name on post)

CASSANDRA (Activity Feeds, Notifications, Direct Messages):
  Write-heavy, time-series patterns
  Activity feed schema:
    PRIMARY KEY (user_id, activity_time DESC, activity_id)
    → Efficient: "give me user X's last 50 activities" = single partition scan
  Notification storage: same pattern
  DM messages: partitioned by conversation_id

REDIS (Feed Cache, Sessions, Counters):
  Feed cache: ZADD feed:{user_id} timestamp post_id (sorted set, score = time)
    → Push: ZADD (add new post to followers' feeds)
    → Read: ZREVRANGE feed:{user_id} 0 49 (last 50 posts, newest first)
    → Trim: ZREMRANGEBYRANK to keep only last 1000 posts in cache
  Like counts: INCR likes:{post_id} (atomic counter)
  Session tokens: SET session:{token} {user_data} EX 86400

MEMCACHED (L1 cache for hot objects):
  User profile objects cached (name, follower count, profile photo)
  Popular post metadata: view in feed without hitting DB
  Cache-aside: miss → read from DB → populate cache (TTL = 5 min)`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "Direct Messages",
      sections: [
        {
          title: "DM Architecture — Real-Time Messaging at Scale",
          content: `Instagram Direct handles billions of messages per day, including text, photos, video, and voice messages.

MESSAGING ARCHITECTURE:
  Not simple request-response — needs real-time delivery, read receipts, typing indicators.

MESSAGE STORAGE (Cassandra):
  conversations table:
    PRIMARY KEY (conversation_id, message_time DESC)
    Stores: message_id, sender_id, content_type, content, delivered_to[], read_by[]

  Why Cassandra: write-heavy (millions of messages per second), time-range queries,
                 no complex joins needed

REAL-TIME DELIVERY (WebSocket):
  Each client maintains persistent WebSocket connection to Messaging Service
  Message sent → WebSocket server broadcasts to all online participants
  Offline participant → message stored in Cassandra → delivered when they reconnect

READ RECEIPTS AND TYPING INDICATORS:
  Delivered: when message reaches recipient's device → send delivery ACK via WebSocket
  Read: when user opens conversation → send read receipt event
  Typing: keypress events → debounced (send "typing" event every 3s while typing)
         → expires after 5s of no keypress (shows "typing..." to other party)

GROUP CHATS (fanout):
  Message in group of 50 → deliver to 49 other participants
  If most online: WebSocket fanout (parallel sends)
  If some offline: store-and-forward from Cassandra on reconnect

ENCRYPTION (End-to-End, opt-in):
  Signal Protocol (same as WhatsApp) for E2E encrypted chats
  Keys generated on device, never sent to Instagram servers
  Instagram cannot read E2E messages
  Standard chats: server-side encryption only (Instagram can read for moderation)`,
        },
      ],
    },
    {
      id: "phase6",
      label: "Phase 6",
      title: "Scale & Reliability",
      sections: [
        {
          title: "Handling 100M Photos Per Day",
          content: `100M photos uploaded daily = 1,157 photos/second average, 5×+ higher at peaks (concerts, holidays).

UPLOAD SCALE:
  Peak: ~6,000 uploads/sec
  Each upload: HTTP POST → API Gateway → Media Service → S3
  Media Service: stateless, horizontally scaled (auto-scaling based on request rate)
  S3 / Haystack: designed for high concurrent write throughput

PROCESSING SCALE:
  Each photo triggers 6–8 resize operations + ML classification
  Processing queue: SQS / Kafka → pool of photo processing workers
  Workers: containerized, auto-scale based on queue depth
  ML classification (NSFW, spam): GPU fleet, batched inference

CDN SCALE:
  100M photos/day × ~5 variants = 500M files served per day
  CDN hit rate: 90%+ (most viewed photos are recent/popular, stay cached)
  Cold storage bypass: photos > 1 year old served from f4 (cold store) via CDN proxy

LIKE COUNTER UNDER VIRAL LOAD:
  Post goes viral: 10M likes in 1 hour = 2,778 writes/sec on one counter
  Naive: UPDATE posts SET like_count = like_count + 1 → row lock contention
  Solution: Redis INCR (atomic, in-memory, sub-millisecond)
  Background sync: Redis counter → PostgreSQL every 60 seconds (batch update)

SEARCH AT SCALE (hashtags):
  #sunset: 600M+ tagged posts → index cannot store all
  Solution: store only recent/popular posts per hashtag in search index
  Top posts: ranked by engagement velocity (likes/hour in first 24h)`,
        },
        {
          title: "Content Moderation at Instagram Scale",
          content: `Instagram processes 100M+ uploads per day. Human review of every piece of content is impossible.

AUTOMATED PIPELINE (runs during photo processing):
  Every photo/video/caption passes through ML classifiers:
  • CSAM detection: PhotoDNA perceptual hash → compare against NCMEC database
    Match → immediate remove + automatic NCMEC report (legal requirement)
  • Nudity/graphic content: vision ML model → score 0-1
  • Hate speech: NLP on caption/comments → classifier
  • Spam: account behavior analysis + content similarity hashing
  • Misinformation: partnership with fact-checkers, flagged articles reduce distribution

CONFIDENCE TIERS:
  Score > 0.95 → auto-remove, account warning issued
  Score 0.7–0.95 → reduce distribution + queue for human review
  Score < 0.7 → publish normally
  User reports → add to priority review queue

HUMAN REVIEW (Meta Content Review teams, global):
  Reviewers work in 24/7 shifts, multiple regions
  Review UI: shows content + ML reasoning + policy reference
  SLA: < 24h for most; < 1h for violence/CSAM
  Reviewed content: update ML training labels → model improves over time

APPEALS:
  Creator can appeal removal via Help Center
  Human review of appeal within 14 days
  Transparency report: Meta publishes quarterly stats on content actions`,
        },
      ],
    },
  ],

  metrics: [
    { label: "Monthly Active Users", value: "2B+", note: "as of 2024" },
    { label: "Daily Stories users", value: "500M+", note: "Stories feature specifically" },
    { label: "Photos uploaded/day", value: "100M+", note: "photos and videos combined" },
    { label: "Daily likes", value: "4.2B+", note: "estimated" },
    { label: "Accounts followed per user", value: "avg 150", note: "median is much lower" },
    { label: "Reels plays/day", value: "140B+", note: "across Facebook + Instagram" },
    { label: "DMs sent/day", value: "1B+", note: "estimated" },
    { label: "CDN edge locations", value: "100+", note: "Meta CDN + Akamai" },
  ],
};

export const INSTAGRAM_LLD = {
  title: "Instagram — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of core Instagram services",

  components: [
    {
      id: "postService",
      title: "Post Service — LLD",
      description: "Post creation, media attachment, and fan-out to followers' feeds",
      api: `POST /api/v1/media/upload
Content-Type: multipart/form-data
{
  "file": <binary>,
  "type": "IMAGE"   // IMAGE | VIDEO | REEL | STORY
}
Response:
{
  "upload_id": "upload_abc123",
  "media_id": "media_xyz",
  "status": "PROCESSING",
  "processing_eta_ms": 3000
}

POST /api/v1/posts
{
  "caption": "Sunset at Santorini #travel #sunset",
  "media_ids": ["media_xyz"],
  "location": { "name": "Santorini, Greece", "lat": 36.3932, "lng": 25.4615 },
  "tagged_users": ["user_123"],
  "accessibility_caption": "Orange sunset over white buildings",
  "disable_comments": false,
  "share_to_facebook": false
}
Response:
{
  "post_id": "3012345678901234567",
  "permalink": "https://www.instagram.com/p/abc123/",
  "status": "PUBLISHED",
  "created_at": "2026-04-23T12:00:00Z",
  "media": [
    {
      "media_id": "media_xyz",
      "url": "https://cdninstagram.com/v/...",
      "thumbnail_url": "https://cdninstagram.com/v/...thumb",
      "type": "IMAGE",
      "width": 1080,
      "height": 1080
    }
  ]
}

GET /api/v1/posts/{postId}
GET /api/v1/users/{userId}/posts?limit=12&cursor=<cursor>`,
      internals: `PostgreSQL schema:
CREATE TABLE posts (
  post_id       BIGINT PRIMARY KEY,          -- snowflake ID (timestamp + shard + seq)
  author_id     BIGINT NOT NULL,
  caption       TEXT,
  location_name TEXT,
  location_lat  DECIMAL(9,6),
  location_lng  DECIMAL(9,6),
  status        TEXT DEFAULT 'PUBLISHED',    -- DRAFT | PUBLISHED | DELETED | ARCHIVED
  like_count    INT DEFAULT 0,               -- synced from Redis every 60s
  comment_count INT DEFAULT 0,
  view_count    BIGINT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shard_id      INT NOT NULL                 -- which DB shard this lives on
);
CREATE INDEX posts_author_time ON posts (author_id, created_at DESC);

CREATE TABLE post_media (
  post_id     BIGINT NOT NULL,
  media_id    BIGINT NOT NULL,
  position    INT NOT NULL,    -- carousel ordering
  media_type  TEXT NOT NULL,   -- IMAGE | VIDEO
  s3_key      TEXT NOT NULL,
  width_px    INT,
  height_px   INT,
  duration_ms INT,             -- videos only
  PRIMARY KEY (post_id, position)
);

Snowflake ID generation (no UUID — sortable by time):
  post_id = timestamp_ms(41 bits) | shard_id(10 bits) | sequence(12 bits)
  Globally unique, time-sortable, embeds shard routing

Fan-out on post creation (background, async):
  1. Post published → Kafka: post-created event { post_id, author_id, created_at }
  2. Fan-out Service consumes event
  3. Query social graph: follower_ids = TAO.get_associations(author_id, FOLLOWED_BY)
  4. IF len(follower_ids) < 10_000:
       For each follower_id:
         ZADD feed:{follower_id} {created_at_unix} {post_id}
         ZREMRANGEBYRANK feed:{follower_id} 0 -1001  // keep latest 1000
  5. IF len(follower_ids) >= 10_000:
       No fan-out — followers pull on feed load

Hashtag indexing:
  Parse caption for #hashtags → extract tag list
  INSERT INTO hashtag_posts (tag, post_id, created_at)
  Elasticsearch index updated for search`,
    },
    {
      id: "feedService",
      title: "Feed Service — LLD",
      description: "Ranked feed generation — hybrid push/pull with ML ranking",
      api: `GET /api/v1/feed?limit=12&cursor=<cursor>
Headers: Authorization: Bearer <token>
Response:
{
  "items": [
    {
      "post_id": "3012345678901234567",
      "author": {
        "user_id": "12345",
        "username": "john_doe",
        "full_name": "John Doe",
        "profile_pic_url": "https://cdninstagram.com/...",
        "is_verified": false,
        "is_following": true
      },
      "caption": "Sunset at Santorini #travel",
      "media": [...],
      "like_count": 1842,
      "comment_count": 94,
      "is_liked": false,
      "is_saved": false,
      "created_at": "2026-04-23T10:30:00Z",
      "rank_score": 0.87,       // internal, may be omitted in response
      "reason": "from_following" // from_following | suggested | sponsored
    },
    ...
  ],
  "next_cursor": "eyJwb3N0X2lkIjogIjMw...",
  "has_more": true
}`,
      internals: `Feed generation pipeline:

STEP 1 — Candidate retrieval (target: < 50ms):

  a. From push cache (regular accounts user follows):
     candidates_push = ZREVRANGE feed:{user_id} 0 499  // last 500 post_ids from cache
     post_ids = candidates_push  // already in Redis, instant

  b. From pull (large accounts, > 10K followers):
     large_accounts = TAO.get_associations(user_id, FOLLOWS, filter=large_account)
     For each large_account:
       recent_posts = TAO.get_associations(large_account, POSTED, limit=5, since=48h_ago)
       candidates_pull += recent_posts
     // Pull up to 10 large accounts → up to 50 additional candidates

  c. Suggestions (optional, for new users or sparse feeds):
     candidates_suggested = Recommendation Service (collaborative filter, ~20 posts)

  Total candidates: ~570 posts

STEP 2 — Scoring (ML ranking model, target: < 80ms):
  For each candidate post, compute features:
  • relationship_score: how often user has liked/commented on this author
    (pre-computed and cached in Redis: user_affinity:{user_id}:{author_id})
  • recency_score: exp(-hours_since_post / 48)  // decays over 48h
  • interest_score: similarity of post topics to user's engagement history
  • popularity_velocity: likes + comments in first hour after post (trending signal)
  • format_preference: user's historical video vs photo engagement ratio

  Ranking model: gradient-boosted trees (fast inference, < 1ms per post)
  Predict: P(user will like or comment or save this post)

STEP 3 — Select and assemble:
  Sort by predicted engagement → take top 20
  Apply diversity: max 3 posts per author in top 20
  Insert sponsored post at position 3 and 8 (ad server call, parallel)
  Return to client with cursor for next page

Cursor pagination:
  cursor encodes: { last_post_id, last_score, retrieval_time }
  On next page: resume from cursor position in both push cache and pull sources
  Retrieval time: ensures consistency — second page pulls from same snapshot`,
    },
    {
      id: "storyService",
      title: "Story Service — LLD",
      description: "Ephemeral 24-hour content — upload, viewer tracking, story tray ordering",
      api: `POST /api/v1/stories
{
  "media_id": "media_abc",
  "story_type": "IMAGE",   // IMAGE | VIDEO | TEXT | BOOMERANG
  "duration_ms": 5000,     // for videos/boomerangs
  "stickers": [...],       // location, poll, question stickers
  "audience": "followers"  // followers | close_friends | custom
}
Response:
{
  "story_id": "story_xyz",
  "expires_at": "2026-04-24T12:00:00Z",
  "media_url": "https://cdninstagram.com/stories/...",
  "view_count": 0
}

GET /api/v1/stories/tray
(Returns list of users with unseen stories, ordered by relevance)
Response:
{
  "users": [
    {
      "user_id": "u_123",
      "username": "jane_doe",
      "profile_pic_url": "...",
      "story_count": 3,
      "has_unseen": true,
      "latest_story_time": "2026-04-23T11:30:00Z"
    },
    ...
  ]
}

GET /api/v1/users/{userId}/stories
(Fetch all active stories for a user, in chronological order)

POST /api/v1/stories/{storyId}/seen
{ "source": "story_tray" }
(Mark story as viewed by current user)

GET /api/v1/stories/{storyId}/viewers?limit=20&cursor=<cursor>
(Only accessible by story author)`,
      internals: `Story record (Redis + Cassandra):

Redis (hot, for active stories < 24h):
  Key: story:{story_id}
  Value: { user_id, media_url, created_at, expires_at, audience, view_count }
  TTL: 86400 (24 hours — auto-expires)
  Keyspace notification on expiry → cleanup job archives to DB

Cassandra (viewer tracking):
CREATE TABLE story_views (
  story_id   TEXT,
  viewer_id  BIGINT,
  viewed_at  TIMESTAMPTZ,
  PRIMARY KEY (story_id, viewer_id)
) WITH default_time_to_live = 86400;  -- rows expire with story

Write on view:
  INSERT INTO story_views (story_id, viewer_id, viewed_at) VALUES (...)
  Cassandra handles TTL cleanup — no cron job needed

View count (Redis):
  INCR story_view_count:{story_id}
  On story expiry: persist final count to stories archive table

Story tray ordering (ML model):
  For user U, order accounts-with-stories by:
  • interaction_frequency: how often U likes/replies to this account
  • recency: newer story → higher score
  • story_freshness: stories U hasn't seen > stories U has seen

  Pre-computed: story tray order cached per user (TTL 5 min)
  On cache miss: query TAO for accounts U follows, filter to those with active stories,
                 score with tray model, return ordered list

Unseen story detection (efficient):
  User's last-seen timestamps: Redis HASH story_seen:{user_id} → {account_id: last_seen_time}
  Account's latest story time: Redis story_latest:{account_id}
  Unseen: story_latest[account] > story_seen[user][account]
  O(N) comparison where N = accounts followed — cached per user per session`,
    },
    {
      id: "socialGraphService",
      title: "Social Graph Service — LLD",
      description: "Follow/unfollow, follower counts, and TAO-backed graph queries",
      api: `POST /api/v1/users/{userId}/follow
(Follow a user)
Response: { "following": true, "followed_back": false }

DELETE /api/v1/users/{userId}/follow
(Unfollow a user)

GET /api/v1/users/{userId}/followers?limit=50&cursor=<cursor>
GET /api/v1/users/{userId}/following?limit=50&cursor=<cursor>

GET /api/v1/users/{userId}/friendship-status
(Relationship between current user and target user)
Response:
{
  "following": true,
  "followed_by": false,
  "blocking": false,
  "muting": false,
  "is_private": false,
  "incoming_request": false
}

GET /api/v1/users/suggested?limit=20
(Suggested accounts to follow)
Response: list of users with reason: "followed by X people you follow"`,
      internals: `TAO associations for follow relationships:
  Association type: USER_FOLLOWS
  TAO.add_assoc(follower_id, USER_FOLLOWS, followee_id, { created_at })
  TAO.delete_assoc(follower_id, USER_FOLLOWS, followee_id)

  Query: who does user A follow?
    TAO.get_associations(user_a, USER_FOLLOWS, limit=50, after_cursor)
  Query: who follows user A?
    TAO.get_associations(user_a, FOLLOWED_BY, limit=50, after_cursor)
  Query: does user A follow user B?
    TAO.assoc_exists(user_a, USER_FOLLOWS, user_b)  // O(1)

Follower count (denormalized, approximate):
  Stored on user object: user.follower_count
  Updated: INCR on follow, DECR on unfollow → Redis counter
  Background sync: Redis → TAO user object every 60s
  Exact count: TAO.count_associations(user_id, FOLLOWED_BY) — slow, avoid on hot path

Private accounts (follow requests):
  Private account: follow → create FOLLOW_REQUEST association
  Target user approves: FOLLOW_REQUEST deleted, USER_FOLLOWS created + notification
  Target user denies: FOLLOW_REQUEST deleted

Suggested follows (collaborative filtering):
  "Friends of friends": TAO.get_associations(friends, USER_FOLLOWS) → intersect → rank by overlap
  "Similar interests": users who engage with same hashtags/accounts
  Pre-computed daily in batch job → cached per user (TTL 1 hour)

Blocking:
  TAO.add_assoc(blocker, BLOCKS, blocked)
  All feed, story, search queries include: filter out BLOCKS association
  Blocker disappears from blocked user's experience immediately`,
    },
    {
      id: "likeCommentService",
      title: "Like & Comment Service — LLD",
      description: "Billions of daily likes — atomic counters, notification fanout, comment threads",
      api: `POST /api/v1/posts/{postId}/like
Response: { "liked": true, "like_count": 18421 }

DELETE /api/v1/posts/{postId}/like
Response: { "liked": false, "like_count": 18420 }

GET /api/v1/posts/{postId}/likes?limit=50&cursor=<cursor>
Response:
{
  "users": [
    { "user_id": "...", "username": "jane_doe", "profile_pic_url": "..." },
    ...
  ],
  "count": 18421,
  "next_cursor": "..."
}

POST /api/v1/posts/{postId}/comments
{
  "text": "Beautiful view! 😍",
  "reply_to_comment_id": null    // null = top-level, else reply
}
Response:
{
  "comment_id": "17858893269000001",
  "text": "Beautiful view! 😍",
  "author": { "user_id": "...", "username": "john_doe" },
  "like_count": 0,
  "reply_count": 0,
  "created_at": "2026-04-23T12:01:00Z"
}

GET /api/v1/posts/{postId}/comments?sort=top&limit=20&cursor=<cursor>
DELETE /api/v1/comments/{commentId}   (author or post owner only)
POST /api/v1/comments/{commentId}/like`,
      internals: `Like storage (Redis + Cassandra):

Atomic counter (Redis):
  SADD likes:{post_id} {user_id}   -- O(1) check for "did I like this?"
  SCARD likes:{post_id}            -- O(1) total like count
  For viral posts (10M+ likes): SADD is too large for one Redis key
  Alternative for high-count posts: Cassandra SET + Redis approximate counter

Cassandra (persistent like records):
CREATE TABLE post_likes (
  post_id   BIGINT,
  user_id   BIGINT,
  liked_at  TIMESTAMPTZ,
  PRIMARY KEY (post_id, user_id)
);
Write: INSERT INTO post_likes (post_id, user_id, liked_at) VALUES (...)
Un-like: DELETE FROM post_likes WHERE post_id = ? AND user_id = ?

Like count sync:
  Redis INCR/DECR like_count:{post_id} on like/unlike
  Background job every 60s: SELECT COUNTER, UPDATE posts SET like_count = count

Comment schema (PostgreSQL):
CREATE TABLE comments (
  comment_id  BIGINT PRIMARY KEY,
  post_id     BIGINT NOT NULL,
  author_id   BIGINT NOT NULL,
  parent_id   BIGINT,              -- null = top-level
  text        TEXT NOT NULL CHECK (length(text) <= 2200),
  like_count  INT DEFAULT 0,
  reply_count INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  status      TEXT DEFAULT 'visible'  -- visible | removed | spam
);
CREATE INDEX comments_post_top ON comments (post_id, like_count DESC) WHERE parent_id IS NULL;
CREATE INDEX comments_post_new ON comments (post_id, created_at DESC) WHERE parent_id IS NULL;
CREATE INDEX comments_replies ON comments (parent_id, created_at ASC);

Notification on like (fan-out):
  User A likes User B's post → Kafka: like-event
  Notification Service consumes → push to User B
  Aggregation: if 5 likes in 1 min → "User A and 4 others liked your post"
  Rate limit: max 1 like notification per post per hour`,
    },
    {
      id: "searchService",
      title: "Search & Explore Service — LLD",
      description: "Hashtag search, user search, Explore grid — content discovery at scale",
      api: `GET /api/v1/search?q=santorini&type=all&limit=10
Response:
{
  "users": [
    { "user_id": "...", "username": "santorini_photographer", "follower_count": 120000 }
  ],
  "hashtags": [
    { "tag": "santorini", "post_count": 18400000 },
    { "tag": "santorinisunset", "post_count": 890000 }
  ],
  "places": [
    { "place_id": "loc_123", "name": "Santorini", "post_count": 3200000 }
  ],
  "recent_posts": [...]   // top posts with this hashtag
}

GET /api/v1/hashtags/{hashtag}/posts?sort=recent&limit=24&cursor=<cursor>
(sort = recent | top)
Response: paginated list of posts with this hashtag

GET /api/v1/explore?limit=30
(Personalized Explore grid)
Response: mix of posts, reels, and accounts suggested for discovery`,
      internals: `Hashtag index (PostgreSQL + Redis):

PostgreSQL:
CREATE TABLE hashtags (
  tag          TEXT PRIMARY KEY,
  post_count   BIGINT DEFAULT 0,
  updated_at   TIMESTAMPTZ
);
CREATE TABLE post_hashtags (
  tag      TEXT NOT NULL,
  post_id  BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tag, post_id)
);
CREATE INDEX post_hashtags_time ON post_hashtags (tag, created_at DESC);

Hashtag post count (Redis counter):
  INCR hashtag_count:{tag} on each post with this tag
  Background sync every 5 min → UPDATE hashtags SET post_count

Hashtag search ranking:
  Query: "santorini" → prefix match → candidate hashtags
  Rank by: post_count × recency_factor
  Return top 5 hashtags + top 9 recent posts per hashtag

User search (Elasticsearch):
  Index: username (exact + prefix), full_name, bio
  Boost: follower_count, verification status, relationship (do I follow this person?)
  Personalization: accounts user has interacted with previously ranked higher

Explore grid (personalized, ML-ranked):
  Candidate generation: posts from accounts similar to user's engagements
  Ranking signals: visual similarity to posts user has liked, topic affinity
  Content type mix: 50% photos, 30% reels, 20% accounts/hashtags
  Pre-computed per user: explore grid generated hourly in background
  On explore load: serve cached grid (fast) + inject real-time trending content

Top posts per hashtag:
  Not live computed — updated every 5 minutes
  Score: (likes + comments) within first 24h of post → velocity-ranked
  Stored: sorted set in Redis: ZADD hashtag_top:{tag} {score} {post_id}
  Cache TTL: 5 minutes`,
    },
  ],
};

export const INSTAGRAM_QNA = [
  {
    id: "iq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Meta", "Snap", "Pinterest"],
    question: "Design Instagram at a high level. What happens when a user posts a photo?",
    answer: `Two flows: media processing (photo → CDN) and social distribution (post → followers' feeds).

PHOTO UPLOAD FLOW:
1. Client compresses photo, uploads via multipart HTTP POST to Media Service
2. Raw file stored in S3/Haystack immediately
3. Post record created: status=PROCESSING
4. Async processing pipeline:
   • Generate 6 size variants (150px to 1080px)
   • Strip EXIF metadata (GPS privacy)
   • Run ML classifiers (NSFW, spam, CSAM hash check)
   • Push variants to CDN edge nodes
5. status=PUBLISHED → feed fanout begins

FEED FANOUT:
   Fan-out on write (< 10K followers): write post_id to each follower's Redis feed cache
   Fan-out on read (> 10K followers): followers pull on feed load (no write fanout)
   Hybrid merge at feed read time: push cache + pull from large accounts + ranking

KEY INSIGHT:
"Instagram doesn't fan-out to all followers for large accounts — it's too expensive. Cristiano Ronaldo posting to 600M followers would require 600M Redis writes. Instead, large-account posts are pulled when followers load their feed. The feed service merges push cache (regular accounts) and pull results (large accounts), then runs an ML ranking model over combined candidates."`,
    followups: [
      "How do you handle a video post vs a photo post differently in the pipeline?",
      "What happens if the ML classifier flags a legitimate photo as NSFW?",
      "How do you handle carousel posts (multiple photos in one post)?",
    ],
  },
  {
    id: "iq2",
    category: "Feed Design",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Meta", "Twitter", "LinkedIn"],
    question: "Design Instagram's news feed. How do you generate a personalized, ranked feed for 2 billion users?",
    answer: `Feed generation is a three-stage pipeline: candidate retrieval, ML ranking, and assembly.

THE HYBRID PUSH/PULL PROBLEM:
  Pure push (precompute feed): great read latency, but fan-out to 600M-follower accounts is impossible
  Pure pull (compute on load): no fan-out cost, but N DB reads per load is too slow
  Solution: push for regular accounts (< 10K followers), pull for celebrities (> 10K)

CANDIDATE RETRIEVAL (< 50ms):
  a. Read Redis feed cache (post_ids pushed from regular accounts followed)
  b. For each followed celebrity: fetch last 5 posts from TAO graph DB
  c. Optionally: 5–10 suggested posts (collaborative filtering, for new users)
  Total: ~570 candidate posts

RANKING (ML model, < 80ms):
  For each candidate, predict: P(user engages with this post)
  Features:
  • Relationship: user's historical like/comment rate on this author
  • Recency: exponential decay over 48 hours
  • Popularity: likes+comments velocity in first hour
  • Format preference: video vs photo engagement history
  • Interest: topic match with user's engagement history

  Model: gradient-boosted trees (fast inference, interpretable)
  Top 20 selected; diversity filter: max 3 posts per author

ASSEMBLY:
  Inject ad at position 3 and 8 (parallel ad server call)
  Return with cursor for pagination (encodes retrieval timestamp — ensures stable next pages)`,
    followups: [
      "How do you prevent the feed from becoming a \"celebrity echo chamber\" where only popular accounts get shown?",
      "A user follows 2,000 accounts. How do you avoid slow feed loads from too many pull queries?",
      "How would you A/B test a change to the ranking model without degrading experience for control users?",
    ],
  },
  {
    id: "iq3",
    category: "Social Graph",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Meta", "Twitter", "LinkedIn"],
    question: "Design Instagram's social graph. How do you store follow relationships for 2 billion users efficiently?",
    answer: `Instagram uses TAO (Meta's custom graph DB) — purpose-built for social graph queries.

WHY NOT JUST USE MYSQL:
  "Who does user A follow?" = SELECT * FROM follows WHERE follower_id = A — fine
  "Do A and B have any mutual follows?" = set intersection across millions of rows — very slow
  TAO handles these patterns with built-in association query semantics

TAO DATA MODEL:
  Objects: {id, type, data} — users, posts, comments, media
  Associations: {id1, type, id2, time, data}
  USER_FOLLOWS(follower_id → followee_id)
  LIKED_BY(post_id → user_id)
  HAS_COMMENT(post_id → comment_id)

TAO ARCHITECTURE:
  Leaders: MySQL-backed persistent storage (one cluster per region)
  Followers: Memcached read-through caches (handle 99%+ of reads)
  Write path: client → Leader → invalidate Followers
  Read path: client → Follower (hit) / Leader (miss then cache)

FOLLOW COUNT (the scalability detail):
  Storing exact count: SELECT COUNT FROM follows WHERE followee_id = X
  At Kylie Jenner scale (400M followers): COUNT is expensive
  Solution: denormalize — store follower_count on user object
  Update: INCR Redis counter on each follow/unfollow → async flush to TAO user object
  Approximate is fine for display (400,012,847 → "400M" shown anyway)

MUTUAL FOLLOWS ("Friends"):
  "Does user A follow user B AND user B follow user A?"
  TAO: two O(1) assoc_exists checks — instant`,
    followups: [
      "How do you handle the case where a user blocks another — what needs to be filtered across the system?",
      "How do you efficiently compute 'suggested follows' (friends of friends)?",
      "What's the consistency model of TAO? Can a user see stale follow data?",
    ],
  },
  {
    id: "iq4",
    category: "Stories",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Meta", "Snap", "TikTok"],
    question: "Design Instagram Stories. How do you implement 24-hour expiring content at scale?",
    answer: `Stories have three unique requirements: 24-hour TTL, viewer tracking, and ordered tray display.

STORY STORAGE WITH TTL:
  Redis: SET story:{story_id} {data} EX 86400 → auto-expires after 24 hours
  On Redis expiry: keyspace notification → Kafka → archive to cold storage (for Highlights feature)
  Cassandra for viewer tracking also has TTL: default_time_to_live = 86400

VIEWER TRACKING:
  Scale: celebrity has 50M followers, posts 10 stories → 500M potential view events
  Cassandra: INSERT story_views(story_id, viewer_id, viewed_at) WITH TTL 86400
  Why Cassandra: high write throughput, partition by story_id, auto-TTL
  View count: Redis INCR story_view_count:{story_id} (fast, atomic)

STORY TRAY ORDERING (who shows up first in the tray):
  Not chronological — ML-ranked by relationship strength
  Signals: recent interactions (DMs, likes, comments) with that account
  Pre-computed per user (TTL 5 min) — not computed on every tray open

UNSEEN DETECTION (efficient):
  Redis HASH: story_seen:{user_id} → {account_id: last_seen_time}
  Compare against: story_latest:{account_id} in Redis
  Unseen: latest story time > user's last seen time for that account
  O(N) comparison across followed accounts — all in Redis, fast

CLOSE FRIENDS:
  Separate audience: only close friends see these stories
  TAO: CLOSE_FRIEND association type
  Story fetch filters by: viewer is in author's close friends list`,
    followups: [
      "How do you implement the Instagram 'Highlights' feature where users can save stories past 24 hours?",
      "How do you handle the 'who viewed my story' list — can you show it for all 50M viewers?",
      "How do you implement story replies (DM-style response to a story)?",
    ],
  },
  {
    id: "iq5",
    category: "Media Storage",
    difficulty: "Medium",
    round: "Onsite — System Design",
    asked_at: ["Meta", "Imgur", "Pinterest"],
    question: "Design a photo storage system for Instagram. How do you store 100 million photos per day cost-effectively?",
    answer: `Photo storage is a cost optimization problem. Most photos are rarely accessed after the first few days.

WHAT'S STORED PER PHOTO:
  6 size variants: 150px, 240px, 320px, 480px, 640px, 1080px
  Total: ~4MB per photo across all variants
  100M photos/day × 4MB = 400 TB/day new storage added

META'S HAYSTACK (custom blob store):
  Problem with standard file systems: each file open = many metadata operations (stat, open, seek, close)
  At Instagram scale: metadata I/O becomes the bottleneck
  Haystack: millions of photos packed into large "haystack" files
    → Single metadata read: "photo X is at offset Y in haystack file Z"
    → Eliminates per-photo metadata overhead
    → 3× faster reads vs ext4 at this scale

STORAGE TIERS:
  Hot (0–30 days, ~90% of reads): Fast NVMe SSD-backed haystack
  Warm (30–180 days): HDD-backed haystack (slower, cheaper)
  Cold (> 180 days, < 1% access/month): f4 erasure-coded storage
    - Erasure coding: 14 data + 10 parity chunks → reconstruct from any 14 of 24
    - Storage overhead: 1.71× (vs 3× replication) — 57% cost reduction
    - Access latency: ~100ms (acceptable for rarely accessed photos)
  Auto-tiering: lifecycle policy moves photos between tiers based on access patterns

CDN LAYER (absorbs 90%+ of read traffic):
  Recent/popular photos cached at CDN edge → origin rarely hit
  Photos > 1 year old: served from cold storage via CDN proxy on cache miss`,
    followups: [
      "How do you handle photo deletion — GDPR requires permanent erasure across all replicas?",
      "How do you implement image deduplication to avoid storing the same meme 1M times?",
      "How does the CDN cache invalidation work when a user deletes a post?",
    ],
  },
  {
    id: "iq6",
    category: "Notifications",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Meta", "Twitter", "LinkedIn"],
    question: "Design Instagram's notification system. How do you deliver billions of notifications per day efficiently?",
    answer: `Notifications have three challenges: fan-out, aggregation, and multi-channel delivery.

NOTIFICATION TYPES (different handling):
  • Like on post: low priority, aggregate ("John and 5 others liked your post")
  • Comment on post: medium priority, deliver within 30s
  • DM received: high priority, deliver within 5s (WebSocket first, push fallback)
  • New follower: low priority, batch hourly
  • Story view: very low priority (creator sees list, not push per view)

PIPELINE:
  Event → Kafka (activity-events topic)
  → Notification Aggregator: groups events by type + target user in 30s window
  → Notification Store: Cassandra, PRIMARY KEY (user_id, created_at DESC)
  → Delivery Router: push (FCM/APNs) + in-app (WebSocket if online)

AGGREGATION (prevents notification spam):
  Raw events: "User A liked post X", "User B liked post X", "User C liked post X"
  Aggregated: "User A and 2 others liked your post"
  Window: 1-minute tumbling window per (target_user, post_id, event_type)
  After window: single aggregated notification sent

DELIVERY CHANNELS:
  Priority 1: WebSocket (if user online — immediate in-app badge + notification)
  Priority 2: FCM (Android) / APNs (iOS) push
  Priority 3: Email (for important events like account security only)

  If push delivery fails (device offline): notification stored → delivered on app open

NOTIFICATION FEED (in-app, what you see in the heart tab):
  Cassandra table: (user_id, created_at DESC, notif_id)
  Last 60 days of notifications returned paginated
  Unread count: Redis COUNTER unread_notifs:{user_id}
  On feed open: mark as read → DECRBY unread count by number shown`,
    followups: [
      "Selena Gomez has 400M followers. When she likes your post, you get notified — but she's also a follower. How does the fan-out work?",
      "How do you implement notification preferences ('notify me for everyone' vs 'notify me for people I follow back')?",
      "How do you handle the case where a push notification is sent but the user has disabled push permissions?",
    ],
  },
  {
    id: "iq7",
    category: "Reels",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Meta", "TikTok", "Snap"],
    question: "Design Instagram Reels — how do you build a TikTok-style discovery feed for short videos?",
    answer: `Reels is different from the feed: it's discovery-first (not limited to followed accounts) and optimized for watch completion, not likes.

KEY DIFFERENCE FROM FEED:
  Feed: content from accounts you follow → social graph drives curation
  Reels: algorithmic discovery → ML drives curation, social graph is secondary signal

WHAT REELS OPTIMIZES FOR:
  Primary: video completion rate (watched > 80% of video)
  Secondary: share rate (shares = strong positive signal, indicates "I want others to see this")
  Negative: early swipe (watched < 20% then swiped) = strong dislike signal
  NOT primary: like count (likes are inflated, completion is harder to fake)

TWO-STAGE RANKING:
  Stage 1 — Candidate generation (~500 reels):
    Collaborative filtering: what did users with similar taste watch?
    Topic affinity: match reel topics to user's engagement history
    Social boost: reels from accounts user follows slightly boosted

  Stage 2 — Deep ranking (~500 → top 20):
    Neural network: predict P(completion) and P(share) per (user, reel) pair
    Features: user history, reel engagement stats from first 100 viewers, audio trend
    Diversity: max 2 reels from same creator, force topic variety

VIRAL DISTRIBUTION (how new creators get discovered):
  New reel posted → shown to seed cohort of 1,000 highly-interested users
  Completion rate > threshold → expand: 10,000 users
  High completion again → 100,000 → 1M → global distribution
  Low completion at any stage → distribution capped (reel stays small)

PRE-FETCHING FOR SCROLL:
  Client pre-fetches reels 2–3 positions ahead
  Goal: swipe up → next reel plays instantly (no buffering pause)
  CDN segment caching: 320kbps HLS for initial load, switch to higher quality while playing`,
    followups: [
      "How do you prevent the Reels algorithm from creating filter bubbles or reinforcing harmful content?",
      "How would you design the system to support audio trends — making a sound go viral across millions of reels?",
      "A creator's reel gets 10M views. How does the system handle the storage and bandwidth spike?",
    ],
  },
  {
    id: "iq8",
    category: "Direct Messages",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Meta", "Telegram", "Discord"],
    question: "Design Instagram Direct Messaging. How do you support real-time messaging for 1B+ daily messages?",
    answer: `DMs need: real-time delivery, message persistence, read receipts, and group chat support.

CORE ARCHITECTURE:
  Not request-response — needs persistent connection for real-time delivery
  WebSocket: each client maintains persistent connection to Messaging Service
  Message sent → Messaging Service → persist to Cassandra + deliver via WebSocket to online recipients

MESSAGE STORAGE (Cassandra):
  Schema:
    CREATE TABLE messages (
      conversation_id  UUID,
      message_id       BIGINT,    -- snowflake (time-ordered)
      sender_id        BIGINT,
      message_type     TEXT,      -- TEXT | IMAGE | VIDEO | VOICE | REACTION | STICKER
      content          TEXT,      -- text or media reference
      delivered_to     SET<BIGINT>,
      read_by          SET<BIGINT>,
      created_at       TIMESTAMPTZ,
      PRIMARY KEY (conversation_id, message_id DESC)
    );
  Partition by conversation_id → all messages for a conversation in one partition
  message_id DESC → most recent messages loaded first

DELIVERY GUARANTEE:
  1. Message saved to Cassandra first (guaranteed persistence)
  2. Deliver to online participants via WebSocket
  3. Offline participant → message sits in Cassandra
  4. On reconnect: client sends last_seen_message_id → server sends all newer messages

READ RECEIPTS:
  Client opens conversation → fires read-receipt event
  Server: UPDATE messages SET read_by = read_by + {user_id} WHERE message_id <= last_read
  Other participants see: ✓✓ (delivered) → shown in blue when read

ENCRYPTION:
  Standard DMs: server-side encryption — Instagram can decrypt (for moderation)
  Vanish mode / E2E encrypted chats: Signal Protocol
    Keys generated on device, never leave device
    Server stores ciphertext only — cannot decrypt
    Trade-off: no message recovery if device lost, no server-side moderation`,
    followups: [
      "How do you implement group chats with 250 members efficiently?",
      "How do you handle message ordering if two users send simultaneously?",
      "How would you implement disappearing messages (messages that delete after X seconds)?",
    ],
  },
];
