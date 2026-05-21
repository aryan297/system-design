export const DESIGN_LAYERS = [
  // ──────────────────────────────────────────────────────────────────────────
  // LAYER 1 — Application Layer
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "layer-1",
    num: "01",
    title: "Application Layer",
    color: "#c084fc",
    topics: [
      {
        id: "whatsapp",
        tag: "Messaging",
        title: "How WhatsApp Works",
        description:
          "WhatsApp is a real-time messaging platform serving 2B+ users. Its architecture focuses on message reliability, end-to-end encryption, and offline delivery via push notifications.",
        concepts: [
          { label: "Protocol",   text: "XMPP-based (Ejabberd Erlang server) — highly concurrent" },
          { label: "Storage",    text: "Messages stored on device; server only holds undelivered msgs" },
          { label: "Encryption", text: "Signal Protocol — E2E, double ratchet algorithm" },
          { label: "Media",      text: "CDN-backed blob storage; URL shared, not the file itself" },
        ],
        flow: null,
        points: [
          "Persistent TCP connection per device keeps latency ultra-low",
          "Message queuing for offline users — delivered on reconnect",
          "Read receipts via ACK messages back to sender",
          "Group messaging: server fans out to N members individually",
        ],
      },
      {
        id: "reddit",
        tag: "Social / Feed",
        title: "How Reddit Works",
        description:
          "Reddit is a link aggregation + forum platform. Core challenges: vote ranking, feed generation, comment trees, and search at scale.",
        concepts: [
          { label: "Ranking",  text: "Hot score = f(score, time) — Wilson score for confidence" },
          { label: "Feed",     text: "Pre-computed feeds cached in Redis per subreddit + user" },
          { label: "Comments", text: "Adjacency list in DB; nested closure table for deep trees" },
          { label: "Search",   text: "Elasticsearch for full-text; separate indexing pipeline" },
        ],
        flow: null,
        points: [
          "Vote counters are eventually consistent — not exact real-time",
          "Subreddit fan-out: popular posts pushed to subscriber feeds",
          "PostgreSQL for posts, Cassandra for activity logs",
        ],
      },
      {
        id: "airbnb",
        tag: "Marketplace",
        title: "How Airbnb Works",
        description:
          "A two-sided marketplace (hosts + guests) with search, availability management, pricing, payments, and trust/safety layers.",
        concepts: [
          { label: "Search",       text: "Elasticsearch + geospatial index for location queries" },
          { label: "Availability", text: "Calendar as a bitset per listing; Redis for fast checks" },
          { label: "Pricing",      text: "ML-based dynamic pricing; aerosolve model" },
          { label: "Payments",     text: "Hold funds on booking; release to host after check-in" },
        ],
        flow: null,
        points: [
          "Double-booking prevention via optimistic locking on reservation",
          "Review system uses trust score to prevent fraud",
          "Images stored on S3 + CDN; perceptual hashing for duplicates",
        ],
      },
      {
        id: "pastebin",
        tag: "Storage / Sharing",
        title: "How Pastebin Works",
        description:
          "Text snippet sharing service. A classic system design problem: generate unique short URLs, store blobs, handle expiry.",
        concepts: null,
        flow: ["User Input", "Generate Key", "Store in Object DB", "Short URL"],
        points: [
          "Key generation: base62 encoding of random UUID (6–8 chars)",
          "Collision handled by pre-generating keys in a key DB",
          "Content stored in S3/object storage, metadata in SQL",
          "TTL index for auto-expiry; CDN cache for popular pastes",
        ],
      },
      {
        id: "bluesky",
        tag: "Decentralized Social",
        title: "How Bluesky Works",
        description:
          "Bluesky uses the AT Protocol — a federated social networking protocol allowing data portability across servers (Personal Data Servers).",
        concepts: [
          { label: "PDS",      text: "Personal Data Server — user owns their data + identity" },
          { label: "DID",      text: "Decentralized Identifier — portable account identity" },
          { label: "Lexicon",  text: "Schema system for defining record types (like app.bsky.feed.post)" },
          { label: "Firehose", text: "Event stream of all activity; consumed by relay nodes" },
        ],
        flow: null,
        points: [
          "Algorithm marketplace — users choose their feed algorithm",
          "Content-addressed records using CIDs (like IPFS)",
          "AppViews aggregate + index data from multiple PDSes",
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // LAYER 2 — Scale & Distribution
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "layer-2",
    num: "02",
    title: "Scale & Distribution",
    color: "#f9a8d4",
    topics: [
      {
        id: "youtube-scale",
        tag: "Video Streaming",
        title: "How YouTube Works",
        description:
          "YouTube handles 500 hours of video uploaded per minute. Core challenges: video ingestion pipeline, transcoding, CDN delivery, and recommendation at scale.",
        concepts: [
          { label: "Upload",    text: "Chunked upload → GCS → transcoding pipeline (Zencoder/Shaka)" },
          { label: "ABR",       text: "Adaptive Bitrate: DASH/HLS — quality adapts to bandwidth" },
          { label: "CDN",       text: "Google's Open Connect edge servers cache popular videos" },
          { label: "Recommend", text: "Two-tower neural network: candidate generation + ranking" },
        ],
        flow: null,
        points: [
          "Video encoded into 360p / 480p / 720p / 1080p / 4K simultaneously",
          "Thumbnails extracted and stored for seek previews",
          "View counts use approximate counters (HyperLogLog)",
          "Comment system backed by Spanner (globally distributed SQL)",
        ],
      },
      {
        id: "uber-eta",
        tag: "Geo / Routing",
        title: "How Uber Computes ETA",
        description:
          "ETA computation is critical to Uber's matching and pricing. It combines real-time traffic, historical patterns, and graph-based routing.",
        concepts: null,
        flow: ["GPS Data", "Road Graph", "Dijkstra/A*", "ML Adjust", "ETA"],
        points: [
          "Road network as a weighted directed graph (OpenStreetMap)",
          "Edge weights updated in real-time from driver GPS pings",
          "Historical ETA by time-of-day + day-of-week pattern matching",
          "H3 hexagonal grid for spatial indexing of supply/demand",
          "Surge pricing triggers when supply < demand in a hexagon",
        ],
      },
      {
        id: "url-shortener",
        tag: "Redirection",
        title: "How URL Shortener Works",
        description:
          "Classic interview problem. Maps a long URL to a 6–8 char alias, handles redirect at massive scale (100M+ daily reads).",
        concepts: [
          { label: "Encoding",  text: "MD5/SHA hash → take first 7 chars → base62 encode" },
          { label: "Collision", text: "Pre-generated key pool in a separate Key DB" },
          { label: "Redirect",  text: "301 (permanent cache) vs 302 (temporary, track clicks)" },
          { label: "Cache",     text: "Redis LRU — ~20% of URLs drive 80% of traffic" },
        ],
        flow: null,
        points: [
          "Write path: ~100M URLs/day → NoSQL (Cassandra) for durability",
          "Read path: 10:1 ratio → Redis cache hits 90%+ of traffic",
          "Custom aliases: check uniqueness before storing",
          "Analytics: Kafka stream → clickstream aggregation",
        ],
      },
      {
        id: "twitter-timeline",
        tag: "Feed Generation",
        title: "How Twitter Timeline Works",
        description:
          "Two models: Push (fan-out on write) for most users, Pull (fan-out on read) for celebrities. Twitter uses a hybrid approach.",
        concepts: [
          { label: "Fan-out Write", text: "Tweet → write to all follower timelines in Redis" },
          { label: "Fan-out Read",  text: "Merge celebrity tweets at read time (K-way merge)" },
          { label: "Timeline",      text: "Sorted sets in Redis per user (tweet_id as score)" },
          { label: "Threshold",     text: ">10K followers → pull model; else push model" },
        ],
        flow: null,
        points: [
          "Tweet stored once in tweet DB; timeline holds only tweet IDs",
          "Ranking layer re-scores timeline before serving (ML model)",
          "Notifications via separate Kafka topic",
        ],
      },
      {
        id: "nginx",
        tag: "Web Server / Proxy",
        title: "How Nginx Works",
        description:
          "Nginx is an event-driven, asynchronous web server and reverse proxy. Handles 10K+ concurrent connections on a single thread via non-blocking I/O.",
        concepts: [
          { label: "Model", text: "Master process + N worker processes (one per CPU core)" },
          { label: "I/O",   text: "epoll (Linux) — async event loop, no blocking threads" },
          { label: "Proxy", text: "Upstream pool + health checks + load balancing" },
          { label: "Cache", text: "Proxy cache with cache-control header respect" },
        ],
        flow: null,
        points: [
          "SSL termination — offloads TLS from app servers",
          "Rate limiting via leaky bucket / shared memory zone",
          "Gzip compression before sending to client",
          "Config: server blocks, location blocks, upstream blocks",
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // LAYER 3 — Infrastructure
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "layer-3",
    num: "03",
    title: "Infrastructure",
    color: "#fb923c",
    topics: [
      {
        id: "kafka",
        tag: "Message Queue",
        title: "How Kafka Works",
        description:
          "Apache Kafka is a distributed event streaming platform — a durable, ordered, replayable log. Used for decoupling producers from consumers at massive throughput.",
        concepts: [
          { label: "Topic",       text: "Named stream of events; split into partitions" },
          { label: "Partition",   text: "Ordered log on disk; key → partition for ordering" },
          { label: "Offset",      text: "Consumer tracks its position; re-read any time" },
          { label: "Replication", text: "N replicas per partition; leader election via ZooKeeper/KRaft" },
        ],
        flow: null,
        points: [
          "Producer: acks=all ensures durability across replicas",
          "Consumer group: N consumers share partitions (parallelism)",
          "Retention: time-based (7 days) or size-based",
          "Exactly-once semantics via idempotent producer + transactions",
          "Log compaction: keep only latest value per key",
        ],
      },
      {
        id: "google-search",
        tag: "Search Engine",
        title: "How Google Search Works",
        description:
          "Google Search crawls ~130T pages, builds an inverted index, and ranks results using 200+ signals including PageRank.",
        concepts: null,
        flow: ["Crawl", "Parse", "Index", "Rank", "Serve"],
        points: [
          "Googlebot: distributed crawler prioritizes high-quality seeds",
          "Inverted index: word → {docID, positions, frequency}",
          "PageRank: iterative algorithm, link = vote, rank propagates",
          "Query processing: spell-correct → tokenize → retrieve → rank → snippet",
          "BERT/MUM models for semantic understanding of query",
          "Bigtable stores crawled pages; GFS stores index shards",
        ],
      },
      {
        id: "airtags",
        tag: "IoT / Location",
        title: "How Apple AirTags Work",
        description:
          "AirTags leverage Apple's Find My network — 1B+ Apple devices crowdsource location tracking without revealing user identity.",
        concepts: [
          { label: "BLE",     text: "AirTag broadcasts Bluetooth; nearby iPhones detect it" },
          { label: "Privacy", text: "Rotating public keys — device encrypts location, only owner decrypts" },
          { label: "UWB",     text: "Ultra-wideband for precision finding (cm-level accuracy)" },
          { label: "Network", text: "Encrypted location reports uploaded anonymously to Apple" },
        ],
        flow: null,
        points: [
          "End-to-end encrypted — Apple cannot read location data",
          "Anti-stalking: alerts if unknown AirTag travels with you",
          "Offline finding: works without cellular via BLE mesh",
        ],
      },
      {
        id: "amazon-s3",
        tag: "Object Storage",
        title: "How Amazon S3 Works",
        description:
          "S3 is an infinitely scalable object storage service. Stores files as immutable objects in buckets with 11 nines of durability.",
        concepts: [
          { label: "Object",      text: "Key (path) + Value (bytes) + Metadata; up to 5TB per object" },
          { label: "Durability",  text: "3+ copies across ≥3 AZs; erasure coding for cost" },
          { label: "Consistency", text: "Strong read-after-write consistency (since 2020)" },
          { label: "Classes",     text: "Standard → IA → Glacier; lifecycle policies auto-tier" },
        ],
        flow: null,
        points: [
          "Multipart upload for files >5GB — parallel upload chunks",
          "Presigned URLs — temporary access without exposing credentials",
          "S3 Versioning — keeps history of every object version",
          "Event notifications — Lambda / SQS / SNS on object changes",
        ],
      },
      {
        id: "slack",
        tag: "Real-time Collaboration",
        title: "How Slack Works",
        description:
          "Slack is a team messaging platform where real-time delivery, search over message history, and workspace isolation are core design concerns.",
        concepts: [
          { label: "WebSocket", text: "Persistent connection per client for real-time push" },
          { label: "Channels",  text: "Messages stored in partitioned DB sharded by workspace_id" },
          { label: "Search",    text: "Elasticsearch per-workspace index; content + metadata" },
          { label: "Presence",  text: "Redis pub/sub for online/offline status fanout" },
        ],
        flow: null,
        points: [
          "Message delivery: client sends via HTTPS, server pushes to others via WS",
          "Flannel: Slack's channel membership service backed by MySQL",
          "File uploads go to S3, URL sent as message attachment",
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // LAYER 4 — Intelligence & Matching
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "layer-4",
    num: "04",
    title: "Intelligence & Matching",
    color: "#a8ff78",
    topics: [
      {
        id: "llms",
        tag: "AI / ML",
        title: "How LLMs Actually Work",
        description:
          "Large Language Models (GPT, Claude, Gemini) are Transformer-based neural nets trained to predict next tokens, emergently learning reasoning, coding, and language.",
        concepts: [
          { label: "Transformer", text: "Self-attention layers learn token relationships in parallel" },
          { label: "Training",    text: "Pre-train on internet text (predict next token) → RLHF fine-tune" },
          { label: "Inference",   text: "Autoregressive: generate one token at a time, left-to-right" },
          { label: "Context",     text: "KV cache stores attention state; window = max tokens" },
        ],
        flow: null,
        points: [
          "Attention: each token attends to all others — O(n²) complexity",
          "Embeddings: tokens → dense vectors in high-dim space",
          "Temperature controls randomness of sampling",
          "RAG: augment with retrieved docs to reduce hallucination",
          "Serving: tensor parallelism + pipeline parallelism across GPUs",
        ],
      },
      {
        id: "stock-exchange",
        tag: "Financial Systems",
        title: "How Stock Exchange Works",
        description:
          "Stock exchanges match buy and sell orders with microsecond latency. The Order Matching Engine (OME) is the heart — a deterministic, single-threaded state machine.",
        concepts: null,
        flow: ["Order", "Gateway", "Order Book", "Match", "Trade Feed"],
        points: [
          "Order book: two sorted lists — bids (desc) + asks (asc)",
          "Match: highest bid ≥ lowest ask → trade executed",
          "Order types: Market, Limit, Stop, IOC, FOK",
          "LMAX Disruptor pattern: ring buffer for lock-free concurrency",
          "Market data (Level 2) published via multicast UDP",
          "FIX protocol standard for order submission between firms",
        ],
      },
      {
        id: "tinder",
        tag: "Recommendation",
        title: "How Tinder Works",
        description:
          "Tinder shows you a ranked stack of profiles. Core challenges: geospatial filtering, ELO scoring, swipe recording, and match notification.",
        concepts: [
          { label: "ELO",   text: "Desirability score (like chess ELO) — updated per swipe" },
          { label: "Geo",   text: "Geohash/S2 cells filter candidates by radius" },
          { label: "Recs",  text: "Collaborative filtering + content signals → ranked stack" },
          { label: "Match", text: "Bidirectional like → mutual like event → push notification" },
        ],
        flow: null,
        points: [
          "Profile stack pre-computed per user — cached in Redis",
          "Swipe data written to Kafka → async ELO recomputation",
          "Images on CDN; face detection for best photo ordering",
        ],
      },
      {
        id: "serverless",
        tag: "Cloud Computing",
        title: "How Serverless Works",
        description:
          "Serverless computing (AWS Lambda / Meta's internal platforms) runs code without managing servers — event-driven, auto-scaled, pay-per-execution.",
        concepts: [
          { label: "Cold Start", text: "Container init on first invocation — latency spike" },
          { label: "Execution",  text: "Stateless function; max timeout (15 min for Lambda)" },
          { label: "Scaling",    text: "Auto: 0 → N instances in ms; concurrency limits apply" },
          { label: "Billing",    text: "100ms increments × GB-RAM × invocations" },
        ],
        flow: null,
        points: [
          "Warm container reuse reduces cold starts",
          "Provisioned concurrency: pre-warm for latency-sensitive apps",
          "Event sources: API Gateway, S3, DynamoDB Streams, SQS",
          "Limit: 15min max, 3GB RAM, 512MB /tmp — design around these",
        ],
      },
      {
        id: "chatgpt-apps",
        tag: "AI Product",
        title: "How ChatGPT Apps Work",
        description:
          "ChatGPT-style apps combine LLM inference, conversation state management, streaming output, and plugin/tool orchestration.",
        concepts: null,
        flow: ["User Msg", "Context Build", "LLM API", "Stream Tokens", "Render"],
        points: [
          "Conversation = array of messages with role + content",
          "Streaming via SSE (Server-Sent Events) — tokens arrive as generated",
          "System prompt sets behavior and constraints",
          "Tool use: model emits JSON function call → execute → return result",
          "Context window limit: truncate/summarize older messages",
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // LAYER 5 — Real-time Systems
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "layer-5",
    num: "05",
    title: "Real-time Systems",
    color: "#6bcfff",
    topics: [
      {
        id: "google-docs",
        tag: "Collaborative Editing",
        title: "How Google Docs Works",
        description:
          "Google Docs enables real-time collaborative editing by multiple users simultaneously. The core algorithm is Operational Transformation (OT).",
        concepts: [
          { label: "OT",      text: "Transform concurrent operations so all clients converge to same state" },
          { label: "CRDT",    text: "Alternative to OT — conflict-free replicated data type" },
          { label: "Sync",    text: "WebSocket per doc session; server is source of truth" },
          { label: "Storage", text: "Operational log + periodic snapshots; Bigtable backend" },
        ],
        flow: null,
        points: [
          "Each edit = an operation (insert/delete at position)",
          "OT: if A and B edit concurrently, transform B against A before applying",
          "Cursor positions broadcast to show collaborator presence",
          "Autosave: debounced writes every few seconds",
        ],
      },
      {
        id: "spotify-streaming",
        tag: "Audio Streaming",
        title: "How Spotify Works",
        description:
          "Spotify streams audio to 600M+ users. Key challenges: personalized recommendations, audio delivery, catalog management, and social features.",
        concepts: [
          { label: "Streaming", text: "Ogg Vorbis / AAC; CDN edge nodes; prefetch next track" },
          { label: "Discover",  text: "Collaborative filtering + audio analysis + NLP on playlists" },
          { label: "Data",      text: "Hadoop + Google Dataflow for listen event processing" },
          { label: "Storage",   text: "Cassandra for user data; GCS for audio files" },
        ],
        flow: null,
        points: [
          "BaRT model for personalized playlists (Bandits for Recommendations)",
          "Audio fingerprinting (Chromaprint) for duplicate detection",
          "Wrapped: yearly aggregate batch job over listen history",
        ],
      },
      {
        id: "chatgpt-infra",
        tag: "AI Infrastructure",
        title: "How ChatGPT Works (Infrastructure)",
        description:
          "Beyond the model itself — how OpenAI serves ChatGPT at scale: inference clusters, load balancing, and conversation state.",
        concepts: [
          { label: "Compute",   text: "A100/H100 GPU clusters; model sharded across GPUs" },
          { label: "Inference", text: "vLLM with PagedAttention — efficient KV cache memory" },
          { label: "Routing",   text: "Request → available GPU server → token stream back" },
          { label: "State",     text: "Conversation stored in DB; loaded into context per request" },
        ],
        flow: null,
        points: [
          "Continuous batching: process multiple requests on same GPU",
          "Speculative decoding: draft model + verifier for 2–3x speedup",
          "RLHF pipeline offline: collect feedback → fine-tune weekly",
        ],
      },
      {
        id: "leaderboard",
        tag: "Gaming / Rankings",
        title: "How Real-Time Leaderboard Works",
        description:
          "Leaderboards require sorted sets that update instantly and support rank queries. Redis Sorted Sets are the canonical solution.",
        concepts: [
          { label: "Data Structure", text: "Redis ZSET: member + score; O(log N) add/rank/range" },
          { label: "Add Score",      text: "ZADD lb:weekly user_id score (atomic increment)" },
          { label: "Get Rank",       text: "ZREVRANK lb:weekly user_id → position from top" },
          { label: "Top-K",          text: "ZREVRANGE lb:weekly 0 99 WITHSCORES" },
        ],
        flow: null,
        points: [
          "Score updates: ZINCRBY — atomic increment, no race condition",
          "Sharding: shard by game_id or league_id for horizontal scale",
          "Periodic snapshots to DB for persistence",
          "Sliding window: use time-bucketed ZSETs + ZUNIONSTORE",
        ],
      },
      {
        id: "live-comments",
        tag: "Fan-out / Pub-Sub",
        title: "How Live Comments Work",
        description:
          "Live commenting (YouTube Live, Twitch chat) delivers messages to thousands of concurrent viewers with sub-second latency.",
        concepts: null,
        flow: ["Comment", "Kafka", "Pub/Sub", "WS Servers", "Viewers"],
        points: [
          "SSE or WebSockets per viewer — WS preferred for true bidirectional",
          "Redis Pub/Sub: publish comment to channel → fan out to subscribers",
          "Rate limiting per user to prevent spam (token bucket)",
          "Moderation layer: ML classifier before publish",
          "At 100K viewers: horizontal WS server scaling + Redis cluster",
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // LAYER 6 — Data & Storage Core
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "layer-6",
    num: "06",
    title: "Data & Storage Core",
    color: "#e879f9",
    topics: [
      {
        id: "youtube-mysql",
        tag: "Database at Scale",
        title: "How YouTube Runs MySQL",
        description:
          "YouTube uses MySQL as its primary database despite massive scale — through Vitess, a sharding middleware that makes MySQL horizontally scalable.",
        concepts: [
          { label: "Vitess",      text: "Sharding layer on top of MySQL; routes queries to correct shard" },
          { label: "VTGate",      text: "Stateless proxy; scatter-gather for cross-shard queries" },
          { label: "Sharding",    text: "By video_id / channel_id; range or hash partitioning" },
          { label: "Replication", text: "Primary + multiple replicas; read replicas absorb read load" },
        ],
        flow: null,
        points: [
          "Vitess handles online schema migrations without downtime",
          "Connection pooling: Vitess manages MySQL's connection limit",
          "Memcached in front of MySQL for hot row caching",
          "Key lesson: optimize existing DB before migrating to NoSQL",
        ],
      },
      {
        id: "live-presence",
        tag: "Online Status",
        title: "How Live Presence Works",
        description:
          "Showing \"Active now\" or \"Last seen 2m ago\" requires tracking user heartbeats and fanning out status updates to their contacts.",
        concepts: [
          { label: "Heartbeat", text: "Client pings every 30s; server marks online in Redis" },
          { label: "TTL",       text: "Redis key expires after 60s with no heartbeat → offline" },
          { label: "Fan-out",   text: "Status change → Pub/Sub → all subscribed contacts" },
          { label: "Scale",     text: "Presence service sharded by user_id; millions of connections" },
        ],
        flow: null,
        points: [
          "Lazy propagation: only push presence to users currently online",
          "Subscription: user A subscribes to presence of their contacts on login",
          "WebSocket preferred over polling for real-time accuracy",
        ],
      },
      {
        id: "uber-nearby",
        tag: "Geospatial",
        title: "How Uber Finds Nearby Drivers",
        description:
          "When you request a ride, Uber must find all available drivers within radius in real-time with millions of drivers updating GPS every 4 seconds.",
        concepts: [
          { label: "Geohash",    text: "Encode (lat,lng) → alphanumeric string; prefix = region" },
          { label: "S2 Library", text: "Google's spherical geometry library; hierarchical cells" },
          { label: "Redis Geo",  text: "GEOADD / GEORADIUS commands; ZSETs under the hood" },
          { label: "H3",         text: "Uber's hexagonal grid; uniform area cells, no distortion" },
        ],
        flow: null,
        points: [
          "Driver location updates → Kafka → location service → Redis",
          "Nearby query: decode rider geohash → check same + adjacent cells",
          "Supply-demand matching runs per hexagon (surge pricing triggers)",
          "ETA pre-computed for top-N candidates before final selection",
        ],
      },
      {
        id: "vector-db",
        tag: "ML Storage",
        title: "How Vector Database Works",
        description:
          "Vector databases store high-dimensional embeddings and support Approximate Nearest Neighbor (ANN) search. Core to RAG, semantic search, and recommendations.",
        concepts: [
          { label: "Embedding", text: "Text/image → dense float vector (768–1536 dims)" },
          { label: "HNSW",      text: "Hierarchical Navigable Small World — fast ANN index" },
          { label: "IVF",       text: "Inverted File Index — cluster vectors, search only nearby cluster" },
          { label: "Products",  text: "Pinecone, Weaviate, Qdrant, pgvector, Milvus" },
        ],
        flow: null,
        points: [
          "Similarity: cosine similarity or dot product, not exact match",
          "HNSW: O(log N) search; trades recall for speed (ANN, not exact)",
          "Metadata filtering: pre-filter by category before vector search",
          "RAG pipeline: query → embed → ANN search → top-K docs → LLM context",
        ],
      },
      {
        id: "lyft",
        tag: "Ride Sharing",
        title: "How Lyft Works",
        description:
          "Lyft (and ride-sharing broadly) requires real-time matching, pricing, routing, and payment — a distributed system operating on physical-world constraints.",
        concepts: null,
        flow: ["Request", "Find Drivers", "ETA + Price", "Match", "Track"],
        points: [
          "Dispatch system: scores drivers by ETA + acceptance rate",
          "Dynamic pricing: ML model on supply/demand ratio per zone",
          "Ride state machine: REQUESTED → ACCEPTED → ARRIVED → IN_PROGRESS → COMPLETED",
          "GPS data stream: Kafka → location store with 4s update frequency",
          "Payments: deferred capture — authorize on request, capture on completion",
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // LAYER 7 — Foundations
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "layer-7",
    num: "07",
    title: "Foundations",
    color: "#f5c842",
    topics: [
      {
        id: "rate-limiter",
        tag: "Core Pattern",
        title: "Distributed Rate Limiter",
        description:
          "Rate limiting protects services from abuse. Algorithms: Token Bucket, Leaky Bucket, Fixed Window, Sliding Window. Redis enables distributed enforcement.",
        concepts: [
          { label: "Token Bucket",    text: "Tokens refilled at rate R; consume 1 per request; burst allowed" },
          { label: "Leaky Bucket",    text: "Queue drains at fixed rate; excess dropped; smooths bursts" },
          { label: "Fixed Window",    text: "Count per window; edge case: 2x burst at window boundary" },
          { label: "Sliding Window",  text: "Sorted set in Redis; count events in past N seconds" },
        ],
        flow: null,
        points: [
          "Redis INCR + EXPIRE for simple fixed window rate limiting",
          "Lua script for atomic check-and-increment (no race condition)",
          "Return 429 Too Many Requests with Retry-After header",
          "Shard by user_id for distributed scale; local counters + sync",
        ],
      },
      {
        id: "consistent-hashing",
        tag: "Core Pattern",
        title: "Consistent Hashing",
        description:
          "Consistent hashing minimizes key remapping when nodes are added/removed. Used in distributed caches, databases, and load balancers.",
        concepts: [
          { label: "Ring",   text: "Hash space 0..2³² arranged as a circle" },
          { label: "Node",   text: "Each server hashed to a position on the ring" },
          { label: "Key",    text: "Hash key → walk clockwise to first node" },
          { label: "Vnodes", text: "Virtual nodes per server — even distribution" },
        ],
        flow: null,
        points: [
          "Adding a node: only ~1/N keys remapped (not all)",
          "Removing a node: only that node's keys moved to successor",
          "Used in: Cassandra, DynamoDB, Memcached (ketama), Riak",
          "Vnodes solve hotspot problem of non-uniform physical placement",
        ],
      },
      {
        id: "cap-theorem",
        tag: "Theory",
        title: "CAP Theorem & BASE vs ACID",
        description:
          "CAP Theorem: a distributed system can only guarantee two of three — Consistency, Availability, Partition Tolerance. In practice, P is unavoidable, so choose C or A.",
        concepts: [
          { label: "CP Systems", text: "HBase, Zookeeper, Spanner — sacrifice availability for consistency" },
          { label: "AP Systems", text: "Cassandra, DynamoDB, CouchDB — sacrifice consistency for availability" },
          { label: "ACID",       text: "Atomicity, Consistency, Isolation, Durability — SQL DBs" },
          { label: "BASE",       text: "Basically Available, Soft state, Eventually consistent — NoSQL" },
        ],
        flow: null,
        points: [
          "PACELC extends CAP: even without partition, trade latency vs consistency",
          "Eventual consistency: all nodes converge given no new writes",
          "Quorum reads/writes: R + W > N for strong consistency",
        ],
      },
      {
        id: "caching",
        tag: "Performance",
        title: "Caching Strategies",
        description:
          "Caching is the #1 performance tool in distributed systems. Multiple patterns exist for different read/write tradeoffs.",
        concepts: [
          { label: "Cache-Aside",   text: "App checks cache; on miss, load from DB, populate cache" },
          { label: "Write-Through", text: "Write to cache + DB simultaneously; consistency, higher latency" },
          { label: "Write-Behind",  text: "Write to cache; async write to DB; fast writes, risk data loss" },
          { label: "Read-Through",  text: "Cache sits in front; auto-populates on miss transparently" },
        ],
        flow: null,
        points: [
          "Cache eviction: LRU (most common), LFU, TTL-based, FIFO",
          "Cache stampede: mutex/lock or probabilistic early expiry",
          "Hot key problem: local cache + replication of hot keys",
          "CDN = cache at the network edge for static content",
        ],
      },
      {
        id: "db-indexing",
        tag: "Databases",
        title: "Database Indexing Deep Dive",
        description:
          "Indexes are the single most impactful DB optimization. Understanding B-Tree, LSM-Tree, and index types is essential for system design interviews.",
        concepts: [
          { label: "B-Tree",    text: "Balanced tree; O(log N) reads; used by PostgreSQL, MySQL" },
          { label: "LSM-Tree",  text: "Log-Structured Merge; fast writes; used by Cassandra, RocksDB" },
          { label: "Composite", text: "Multi-column index; prefix rule — leftmost columns must be used" },
          { label: "Covering",  text: "Index includes all columns in query — no table lookup needed" },
        ],
        flow: null,
        points: [
          "B-Tree: great for range queries and equality; reads are O(log N)",
          "LSM: write to MemTable → flush to SSTable; compaction merges files",
          "Index selectivity: high cardinality = better selectivity = faster lookup",
          "Too many indexes → slow writes (update all indexes on INSERT)",
        ],
      },
    ],
  },
];
