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
        brief: {
          what: "Real-time messaging for 2B+ users built on Ejabberd (Erlang/OTP) using XMPP. Each device holds a persistent TCP connection; messages are durably queued for offline users.",
          why: "Tests your knowledge of persistent connections vs polling, E2E encryption, offline delivery, and media decoupling — core themes in any chat-at-scale design.",
          how: "Client opens TCP to Ejabberd → message stored server-side until recipient ACKs → ACK triggers delivery event → read receipt sent back to sender. Media goes to CDN; only the URL is sent via the chat server.",
          tradeoffs: "Persistent TCP scales well with Erlang green threads but complicates NAT/firewall traversal. E2E encryption prevents server-side moderation. Server-side message queue is bounded — very long offline periods may drop messages.",
          interview: "Say: 'Ejabberd's actor model spawns one lightweight process per connection, so millions of users share a small server footprint. Media never travels through the chat server — only an encrypted URL does.'",
        },
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
        brief: {
          what: "Link aggregation + threaded discussion platform. Key systems: hot-score ranking, pre-computed Redis feeds, adjacency-list comment trees, and Elasticsearch full-text search.",
          why: "Classic feed design question — ranking algorithms, fan-out strategies, nested comment storage, and eventual consistency on vote counters all appear in senior interviews.",
          how: "Post submitted → hot score computed (log(votes) + time decay) → pushed to subreddit Redis sorted set → fan-out to subscriber feeds. Comments stored as adjacency list; closure table for O(1) subtree fetches.",
          tradeoffs: "Pre-computed feeds are fast but ~seconds stale. Vote counts are approximate (eventually consistent) — trade accuracy for write throughput. Full fan-out to all subscriber feeds is expensive for mega-subreddits.",
          interview: "Say: 'Reddit's hot score uses log₁₀ so 10K votes is only slightly better than 1K — prevents old viral posts dominating. Vote counts are eventually consistent by design, not a bug.'",
        },
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
        brief: {
          what: "Two-sided marketplace connecting hosts and guests. Core systems: geospatial Elasticsearch search, bitset availability calendar, optimistic-lock bookings, and deferred payment capture.",
          why: "Marketplace design tests two-sided system thinking: availability conflicts, double-booking prevention, geo search, dynamic pricing, and payment hold/release flows.",
          how: "Search → Elasticsearch geo_distance filter → availability check (Redis bitset per listing, 1 bit/day) → reserve with optimistic lock (version column) → authorise payment → release to host post-check-in.",
          tradeoffs: "Optimistic locking avoids global row locks but causes retry UX on conflicts. ES geo index may lag DB by seconds. Bitset calendar is O(1) but requires migration for multi-night queries spanning months.",
          interview: "Say: 'Double-booking uses optimistic locking — two users read version=7, only the first UPDATE WHERE version=7 succeeds; the second gets 0 rows updated and is shown a conflict.'",
        },
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
        brief: {
          what: "URL-shortened text blob service. Write-once, read-many. Core design: key generation service (KGS), object storage for blobs, SQL for metadata, CDN + Redis LRU for reads.",
          why: "Canonical beginner system design question covering unique key generation, collision avoidance, storage tiering, expiry, and the read-heavy caching pattern.",
          how: "KGS pre-generates base62 keys offline → on paste create, atomically move key from unused→used pool → store blob in S3 → metadata (key, TTL, owner) in MySQL → Redis LRU caches hot pastes → CDN serves top 1%.",
          tradeoffs: "KGS is a single point of failure (use master+standby). 301 redirect caches destination in browser (no analytics); 302 forces server hit (enables click tracking). S3 costs more than raw disk but is infinitely scalable.",
          interview: "Say: 'The KGS pattern solves race conditions — keys are pre-generated offline and claimed atomically, so two concurrent writes never get the same key.'",
        },
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
        brief: {
          what: "Federated social network on AT Protocol. Users own their data on a Personal Data Server (PDS); identity is a portable DID; a global Firehose streams all activity to AppView indexers.",
          why: "Tests federated/decentralized architecture thinking — data portability, content addressing, protocol design, and the trade-offs between centralized vs federated moderation.",
          how: "User posts to their PDS → PDS emits record to Firehose → AppViews consume Firehose and build indexed feeds/search → client queries AppView, not PDS directly. DID resolves to current PDS location, enabling server migration.",
          tradeoffs: "Decentralization gives portability but complicates moderation (no central authority). Firehose is a single relay bottleneck. CID-addressed records are tamper-evident but require tombstones for deletes.",
          interview: "Say: 'AT Protocol's key innovation is the DID — your identity is portable. Moving from one PDS to another is just a DID document update; followers' clients auto-resolve the new address.'",
        },
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
        brief: {
          what: "Video platform ingesting 500 hrs/min. Key systems: async transcoding pipeline, DASH/HLS adaptive bitrate, Google Open Connect CDN, and a two-tower recommendation neural network.",
          why: "Video design is a must-know — covers chunked upload, codec ladders, adaptive streaming, CDN edge serving, and approximate view counting. Appears in Netflix, YouTube, and video-at-scale questions.",
          how: "Upload → GCS raw storage → transcoding jobs produce codec ladder (H.264/VP9/AV1 at each resolution) → segments stored in CDN. ABR player picks quality every 2–10 s based on buffer health. Recommendation: candidate gen (millions→hundreds) → ranking model (hundreds→top 20).",
          tradeoffs: "AV1 saves 30% bandwidth but is 50× slower to encode — encode lower qualities first for fast availability. Open Connect CDN eliminates transit cost but requires ISP partnerships. Approximate view counts (HyperLogLog) trade exactness for O(1) updates at scale.",
          interview: "Say: 'YouTube encodes a codec ladder in parallel — lower resolutions first so videos are watchable within minutes. The Open Connect appliances sit inside ISPs; your player never hits the public internet.'",
        },
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
        brief: {
          what: "ETA = graph routing (Dijkstra/A*) on a real-time weighted road graph + ML correction layer. Driver GPS pings every 4s update edge weights; H3 hexagonal grid powers surge pricing.",
          why: "Geo + routing system design is common at Uber, Lyft, DoorDash. Tests graph algorithms, real-time data pipelines, spatial indexing, and how ML layers improve algorithmic outputs.",
          how: "GPS pings → Kafka → streaming job updates road graph edge weights (blended real-time + historical). On ride request: A* routing on graph → ML gradient-boost model corrects for signals/weather/events → ETA returned in <100ms.",
          tradeoffs: "Pure Dijkstra underestimates by 15–20% (ignores signals, turn delays). ML correction fixes this but adds model serving latency. H3 hexagons have uniform area unlike geohash squares — better for demand heat maps near poles.",
          interview: "Say: 'Edge weights blend real-time speed (from live GPS pings) with historical median for that road segment at that time-of-day — one slow driver doesn't skew the whole segment.'",
        },
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
        brief: {
          what: "Maps long URLs to 6–8 char base62 aliases. Extremely read-heavy (10:1 read/write). Key design decisions: key generation, collision avoidance, redirect type, and read-path caching.",
          why: "The most frequently asked beginner system design question — covers unique ID generation, caching strategy, storage choice, and the 301 vs 302 business decision.",
          how: "Auto-increment counter → base62 encode (no collision) → store in Cassandra. Read: CDN → Redis LRU → Cassandra. Respond with 302 redirect. Analytics events written async to Kafka.",
          tradeoffs: "Counter-based encoding is sequential (enumerable, less private) vs random key (private but needs collision check). 301 reduces server load but kills analytics. Cassandra is write-optimised but eventual consistency means a fresh URL may 404 briefly on non-primary replicas.",
          interview: "Say: '62⁷ = 3.5 trillion keys — at 100M URLs/day that's 95 years of capacity. I'd use a counter-based base62 encoding — deterministic, no collisions, no uniqueness check needed.'",
        },
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
        brief: {
          what: "Hybrid fan-out system: push model (write tweet IDs to all follower Redis sorted sets) for regular users; pull model (K-way merge at read time) for celebrities with >10K followers.",
          why: "The canonical feed design question. Fan-out on write vs read is the most important trade-off to understand for any social feed — Instagram, Facebook News Feed, Twitter all use variants of this.",
          how: "Tweet created → stored in tweet DB (tweet content, once) → fan-out worker writes tweet_id to each follower's Redis ZSET (scored by timestamp). Celebrities (>10K followers) are excluded from push — their tweets are merged at read time using K-way sorted merge.",
          tradeoffs: "Push model: O(followers) writes per tweet — @elonmusk's 150M followers would take minutes to fan out. Pull model: O(following) reads per page load — slower reads but instant writes. Hybrid balances both at the cost of complexity.",
          interview: "Say: 'Timelines store only tweet IDs (8 bytes each), not content. The tweet content lives once in the tweet store. This means edit/delete touches one row, not 150M timeline entries.'",
        },
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
        brief: {
          what: "Event-driven async web server/reverse proxy. One worker process per CPU core; each worker uses epoll (Linux) to handle thousands of concurrent connections without blocking threads.",
          why: "Understanding why Nginx outperforms Apache at high concurrency (event loop vs thread-per-connection) is a foundational systems question. Also covers SSL termination, rate limiting, and load balancing patterns.",
          how: "Master process spawns N workers (one/core). Each worker calls epoll_wait() → kernel returns ready FDs → process I/O synchronously → loop. No context switches. Upstream keepalive pool reuses TCP connections to backends, avoiding handshake overhead.",
          tradeoffs: "Single-threaded worker means one blocking operation stalls all connections on that worker — avoid slow upstream calls. Upstream keepalive pool saves ~50ms TLS handshake per request but pools idle connections. Rate limiting via shared memory zone works per-server but not across multiple Nginx instances without Redis.",
          interview: "Say: 'Apache prefork creates one OS thread per connection — at 10K connections that's 20GB of stack RAM. Nginx uses one epoll event loop per CPU core — zero threads, zero context switches, same throughput.'",
        },
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
        brief: {
          what: "Distributed append-only event log. Producers write to topic partitions; consumers read by offset in a consumer group. Durable, replayable, and horizontally scalable.",
          why: "Kafka is the backbone of virtually every large-scale event-driven system — appears in Uber, Netflix, LinkedIn, Stripe designs. Must-know for async processing, event sourcing, and stream processing questions.",
          how: "Producer hashes message key → partition number → appends to leader's log → ISR replicas acknowledge (acks=all for durability). Consumer group distributes partitions among members; each partition consumed by exactly one member. Offsets committed after processing.",
          tradeoffs: "More partitions = more parallelism but more ZooKeeper/KRaft metadata overhead. acks=all adds replica write latency. Exactly-once semantics requires idempotent producer + transactional consumer, adding complexity. Partition count is the hard ceiling on consumer group parallelism.",
          interview: "Say: 'Partition count is the maximum parallelism ceiling — 12 partitions, 4 consumers = 3 partitions each. Adding a 5th consumer leaves one idle. Design partition count based on your peak consumer scaling target.'",
        },
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
        brief: {
          what: "Web search engine: crawler → HTML parser → inverted index builder → multi-signal ranker. Index maps word → posting list of (docID, frequency, positions). PageRank scores pages by inbound link quality.",
          why: "Search engine design tests distributed crawling, inverted index construction, ranking algorithms, and semantic understanding — concepts directly applicable to internal search, e-commerce search, and Elasticsearch-based systems.",
          how: "Googlebot crawls → HTML parsed → text tokenized → words added to inverted index shards (partitioned by word hash). Query: spell-correct → tokenize → fetch posting lists from index shards in parallel → intersect/rank → BERT re-rank for semantics → snippets generated → results served.",
          tradeoffs: "Inverted index is O(docs × terms) to build but O(log N) to query. PageRank requires global graph computation (iterative, slow). BERT adds semantic accuracy but costs GPU inference time per query. Freshness vs crawl cost: re-crawling every page frequently is expensive.",
          interview: "Say: 'Inverted index maps each word to a posting list — sorted array of doc IDs. AND query = intersection; OR query = union. Position lists enable phrase matching. Index is sharded by word hash across thousands of machines.'",
        },
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
        brief: {
          what: "Crowdsourced Bluetooth tracker using 1B+ Apple devices as silent relays. AirTag broadcasts BLE; nearby iPhones upload encrypted location reports. Only the owner can decrypt them.",
          why: "Tests privacy-preserving system design, cryptographic key rotation, IoT at scale, and the challenge of building location sharing without a central authority seeing any data.",
          how: "AirTag broadcasts BLE advertisement every ~2s. Nearby iPhone detects it → encrypts AirTag's location with AirTag's current public key → uploads ciphertext to Apple anonymously. Owner's devices derive the private key schedule and decrypt. Public key rotates every 15 min to prevent third-party tracking.",
          tradeoffs: "Key rotation prevents tracking by third parties but requires the owner's devices to track which public key was active at each time. Apple receives millions of encrypted location blobs but cannot read any — privacy is mathematically guaranteed, not policy-based.",
          interview: "Say: 'The rotating public key scheme is the core privacy innovation. Fixed identifiers would let any Bluetooth scanner track the device — rotating keys every 15 minutes makes consecutive reports unlinkable to third parties.'",
        },
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
        brief: {
          what: "Infinitely scalable object store — key/value blob storage with 11 nines durability. Reed-Solomon erasure coding spreads data across ≥3 AZs. Strong read-after-write consistency since 2020.",
          why: "S3 is the default answer for unstructured data in any system design — images, videos, backups, logs. Tests your understanding of durability vs availability, storage tiering, presigned URLs, and multipart upload.",
          how: "PUT: object split into chunks → erasure coded (6 data + 3 parity) → distributed across AZs → metadata committed → 200 OK returned. GET: metadata lookup → fetch chunks from AZs → reconstruct → stream. Lifecycle policies auto-tier from Standard → IA → Glacier based on last-access time.",
          tradeoffs: "Erasure coding (1.5× overhead) vs full replication (3× overhead) — S3 uses erasure coding. Pre-2020 eventual consistency caused 404 on freshly uploaded objects; now strong. Glacier saves 10× cost but has 3–12h retrieval time — useless for live traffic.",
          interview: "Say: 'Presigned URLs are the clean pattern for user-generated uploads — never proxy files through your app server. Give the browser a time-limited signed URL and let it upload directly to S3.'",
        },
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
        brief: {
          what: "Team messaging with real-time WebSocket delivery, sharded MySQL message store (by workspace_id), per-workspace Elasticsearch search, and Redis pub/sub for presence fan-out.",
          why: "Covers real-time messaging architecture, WebSocket fan-out, sharding strategy, search over conversational data, and the Flannel pattern for membership at scale.",
          how: "Message sent via HTTPS → persisted to MySQL shard → published to Redis pub/sub channel → all WS servers subscribed to that channel push to their connected clients. Search indexed async to per-workspace Elasticsearch. File uploads bypass the message pipeline: client → S3 → URL sent as message.",
          tradeoffs: "Redis pub/sub is fast (~1ms) but has no persistence — a WS server restart means missed events (mitigated by client fetch-on-reconnect). Sharding by workspace_id means cross-workspace queries are impossible without scatter-gather. Flannel membership service in RAM is fast but must replicate to survive server restarts.",
          interview: "Say: 'The WS tier doesn't know which connections are on which server — that's why Redis pub/sub is the fan-out layer. Publish once to a channel; every WS server subscribed to it delivers to its local connections.'",
        },
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
        brief: {
          what: "Transformer-based neural networks trained to predict the next token. Self-attention (O(n²)) enables parallel context understanding. Inference is autoregressive — one token at a time, left to right.",
          why: "LLM internals are increasingly part of system design interviews at AI-forward companies. Understanding tokenization, context limits, KV cache, and serving infrastructure is essential for AI product roles.",
          how: "Input tokenized → embedded into vectors → N transformer layers apply multi-head self-attention (each token attends all others) + FFN → final layer outputs logits over vocabulary → sample token → append to context → repeat. KV cache stores past key/value matrices to avoid recomputing them every step.",
          tradeoffs: "Self-attention is O(n²) in sequence length — 128K token context uses massive GPU memory. KV cache trades memory for speed. RLHF gives alignment but can reduce capability breadth. Larger models: better quality but more GPUs, higher latency.",
          interview: "Say: 'The KV cache is what makes generation practical — without it, each new token would require recomputing attention over all previous tokens from scratch. With it, each step is one forward pass over just the new token.'",
        },
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
        brief: {
          what: "Order matching system using a price-time priority order book (max-heap bids + min-heap asks). Matching engine is single-threaded for determinism; LMAX Disruptor ring buffer achieves lock-free high throughput.",
          why: "Financial system design is common at trading firms, fintech companies, and exchanges. Tests low-latency system design, lock-free concurrency, deterministic state machines, and market data distribution.",
          how: "Order arrives via FIX protocol → gateway validates → enqueued in Disruptor ring buffer → matching engine dequeues (single thread, lock-free) → checks if highest bid ≥ lowest ask → if yes, trade executes → trade event published via UDP multicast to all Level-2 data subscribers.",
          tradeoffs: "Single-threaded OME eliminates all race conditions but is a throughput bottleneck — mitigated by the ring buffer pre-queue. Multicast UDP for market data is fast but unreliable (use sequence numbers + recovery service for gap fills). FIX protocol is verbose but universally adopted.",
          interview: "Say: 'The matching engine is deterministic and single-threaded — same input sequence always produces the same trades. This makes the audit log trivially correct. The Disruptor ring buffer feeds orders to it at millions/second without locks.'",
        },
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
        brief: {
          what: "Dating app with geo-filtered, ELO-ranked profile recommendation. Pre-computed stacks of ~100 candidate IDs cached in Redis per user. Swipes written async; ELO scores updated in background.",
          why: "Recommendation system + geo filtering + real-time event handling. Common for any app with personalized feeds, location-based discovery, or mutual-action matching (likes, follows).",
          how: "On open: fetch pre-computed stack from Redis (geo-filtered + ELO-sorted candidates). On swipe: write to Kafka → consumer updates swipe DB → ELO recomputation job runs → updates candidate scores. On mutual like: match event → push notification to both users.",
          tradeoffs: "Pre-computed stacks are ~minutes stale (freshness vs write cost). ELO recomputation is async — a brand-new user's score isn't reflected instantly. Geohash cells can have boundary issues (driver just across a cell line missed) — solved by querying center + 8 neighbor cells.",
          interview: "Say: 'The profile stack is computed and cached in Redis — sub-100ms swipe UX even though the recommendation model is expensive. The stack is refreshed in the background every few minutes or when exhausted.'",
        },
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
        brief: {
          what: "Event-driven compute model — no server management. Functions scale from 0 to N instances automatically. AWS Lambda charges per GB-second. Cold start penalty on first invocation (container init + runtime start).",
          why: "Tests when to use serverless vs containers, cold start mitigation, concurrency limits, and cost modelling. Appears in cloud architecture and backend design questions.",
          how: "Event triggers Lambda (API Gateway, S3 event, SQS, DynamoDB Stream, schedule) → Lambda control plane provisions/reuses warm container → executes function code → returns response → container kept warm briefly for reuse. Provisioned Concurrency pre-warms N containers permanently.",
          tradeoffs: "Cold starts: Python/Node.js ~100ms, JVM 2–10s. Cost: cheap for bursty traffic; expensive at sustained high scale (EC2 wins at >10M invocations/day sustained). Hard limits: 15min timeout, 3GB RAM, 512MB /tmp — not suitable for long-running jobs or large state.",
          interview: "Say: 'Serverless wins for bursty, event-driven, unpredictable traffic — you pay nothing at zero scale. EC2/containers win for sustained high-throughput where you can right-size. The decision is operational simplicity vs cost optimization.'",
        },
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
        brief: {
          what: "LLM-powered chat application. Conversation is a stateless array of messages (role + content) sent on every request. Tokens stream via SSE. Tools extend the model with external function calls.",
          why: "Building LLM apps is now a core engineering skill. Tests context management, streaming architecture, tool orchestration, and RAG pipelines — all hot interview topics at AI-forward companies.",
          how: "User sends message → app appends to message array → sends full array to LLM API → model streams tokens back via SSE → app renders incrementally → if model emits a tool call JSON, app executes the function → result appended as new message → second LLM call for final response.",
          tradeoffs: "Full conversation replay on every request — context window limits conversation length. Truncation loses early context; summarization preserves facts but costs an extra LLM call. Tool calls add round-trip latency per tool. RAG helps with knowledge cutoffs but adds retrieval latency.",
          interview: "Say: 'The model has no persistent state — every message including the entire history is sent fresh on each request. Context window management is therefore the core engineering challenge for long-running assistants.'",
        },
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
        brief: {
          what: "Multi-user collaborative text editor using Operational Transformation (OT) to reconcile concurrent edits. Server is the canonical ordering authority. Operations stored as an append-only log + periodic snapshots.",
          why: "Collaborative editing is one of the hardest real-time system design problems. Tests OT vs CRDT trade-offs, conflict resolution, WebSocket fan-out, and durable operation log design.",
          how: "Each edit is an insert/delete operation with position. Two concurrent edits are submitted to server → server applies first (canonical order) → transforms second operation against first (adjusting positions) → applies → broadcasts both to all connected clients. Clients apply in server-ordered sequence.",
          tradeoffs: "OT requires a central server for canonical ordering — prevents full P2P. CRDTs (Figma, Notion) work P2P but have higher metadata overhead per character and harder garbage collection. Snapshot + log = fast load (replay only since last snapshot) but snapshots add storage cost.",
          interview: "Say: 'OT's key insight: if user A inserts at position 2 and user B inserts at position 5 concurrently, when B's operation arrives after A's, B's position must shift to 6 because A's insert shifted everything right by 1.'",
        },
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
        brief: {
          what: "Music streaming platform with CDN-based audio delivery, pre-fetch buffering for gapless playback, and collaborative filtering recommendation (track2vec). Cassandra for user data; GCS for audio.",
          why: "Audio streaming design covers CDN delivery, adaptive quality, pre-fetching, recommendation systems (implicit feedback matrix factorisation), and large-scale batch analytics (Wrapped).",
          how: "Audio stored as Ogg Vorbis/AAC in GCS → cached at CDN edge nodes. On play: stream first 30s immediately; background job fetches and buffers next track for gapless switch. Recommendations: weekly batch collaborative filtering over 600M users × 100M tracks (ALS matrix factorisation + track2vec).",
          tradeoffs: "Pre-fetch wastes bandwidth if user skips early (common for algorithmic playlists). Collaborative filtering is a batch job (weekly) — new tracks without listen history suffer the cold-start problem. Audio fingerprinting deduplication adds pipeline complexity but prevents catalog bloat.",
          interview: "Say: 'Discover Weekly runs as a weekly batch job — real-time collaborative filtering over 600M × 100M would be cost-prohibitive. Track2vec embeds tracks in a playlist-context space: tracks that co-occur in many playlists become semantically nearby.'",
        },
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
        brief: {
          what: "LLM inference infrastructure: model sharded across GPU clusters (tensor + pipeline parallelism), vLLM's PagedAttention for KV cache efficiency, continuous batching for GPU utilisation, and speculative decoding for throughput.",
          why: "AI infra is a growing interview domain at ML platform teams. Tests GPU parallelism strategies, memory-bound vs compute-bound systems, and serving optimisations that make inference economically viable.",
          how: "Request arrives → routed to available GPU server cluster → conversation history loaded from DB → packed into context → model generates tokens autoregressively (speculative decoding uses small draft model for k tokens, large model verifies in one pass) → tokens streamed back via SSE → conversation saved.",
          tradeoffs: "Tensor parallelism adds all-reduce communication overhead between GPUs. Continuous batching raises GPU utilisation from ~30% to ~80% but increases tail latency for individual requests (must wait for others in the batch). Speculative decoding 2–3× faster only if draft model accuracy is high enough (~70%+ acceptance).",
          interview: "Say: 'Speculative decoding: a cheap draft model generates k tokens; the large verifier model checks all k in one forward pass — same cost as generating 1 token normally. For common phrases, acceptance rate is 70–80%, giving a 2–4× speedup.'",
        },
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
        brief: {
          what: "Real-time ranked scoreboard using Redis Sorted Sets (ZSETs). Internally a skip list + hash table. ZADD/ZINCRBY for updates (O(log N)), ZREVRANK for rank queries, ZREVRANGE for top-K — all atomic.",
          why: "Leaderboard is a classic question testing data structure selection, atomic operations under concurrent writes, horizontal sharding, and sliding window aggregation patterns.",
          how: "Score event arrives → ZINCRBY lb:game user_id delta (atomic increment in skip list) → ZREVRANK for user's current rank (O(log N)). Top-K: ZREVRANGE 0 K-1 WITHSCORES. Sliding window: one ZSET per time bucket + ZUNIONSTORE to merge windows. Async snapshot to DB for durability.",
          tradeoffs: "Single Redis instance handles ~100K ops/sec — fine for most games. At 100M+ concurrent players: shard by league/region. Global exact rank requires querying all shards and summing partial ranks — expensive for frequent lookups. Use approximate rank (cached every 30s) for non-competitive queries.",
          interview: "Say: 'Redis ZSET is the canonical answer — O(log N) for add and rank, O(K) for top-K. ZINCRBY is atomic so no race conditions on concurrent score updates. For sliding windows, maintain one ZSET per time bucket and ZUNIONSTORE to compute the rolling window.'",
        },
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
        brief: {
          what: "Sub-second comment delivery to thousands of concurrent viewers. Pattern: comment → Kafka → Redis Pub/Sub → WS servers → client WebSockets. Rate limiting and ML moderation applied before publish.",
          why: "Live fan-out is a core real-time design challenge — tests pub/sub architecture, WS server scaling, back-pressure handling, and the trade-off between Redis Pub/Sub (fast/no-history) and Kafka (slower/durable).",
          how: "User posts comment → API validates + rate limits → ML moderation (async) → publish to Kafka topic (stream_id as key) → consumer writes to DB + publishes to Redis Pub/Sub channel → all WS server instances subscribed to that channel push to their connected viewers.",
          tradeoffs: "Redis Pub/Sub: ~1ms latency, no persistence, max ~50K subscribers before bottleneck. Kafka: ~50ms latency, durable, parallelisable — use for >50K viewers or when comment history matters. WS connection limits: each server hosts ~50K connections; horizontal scale with consistent hashing to keep stream viewers on same server.",
          interview: "Say: 'At 500K viewers, Redis Pub/Sub becomes a single-broker bottleneck. Switch to Kafka with stream_id as partition key — consumer group of WS servers consumes partitions in parallel, giving linear throughput scaling.'",
        },
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
        brief: {
          what: "MySQL at petabyte scale via Vitess — a sharding proxy layer. VTGate is a stateless MySQL-protocol proxy that routes queries to the correct shard, handles scatter-gather, and manages connection pools.",
          why: "Demonstrates that you don't always need NoSQL to scale — proper sharding, indexing, and read replica routing can take SQL far. A key lesson for pragmatic system design.",
          how: "App connects to VTGate as if it were a single MySQL server → VTGate inspects SQL → determines target shards from keyspace config (e.g., hash(video_id) % N) → routes to VTTablet on each MySQL shard → merges results. Online schema changes via shadow table + row-based replication + atomic rename (no downtime).",
          tradeoffs: "Cross-shard queries (no shard key in WHERE) scatter to all shards — expensive. Vitess connection pooling stays within MySQL's max_connections limit. MySQL still has ACID guarantees that Cassandra/DynamoDB sacrifice. Trade-off vs NoSQL: relational power at the cost of sharding complexity.",
          interview: "Say: 'Vitess made YouTube stay on MySQL at massive scale. The key insight: VTGate speaks MySQL wire protocol — zero application changes. Vitess also handles online schema migrations via shadow tables, which vanilla MySQL can't do without hours of table locking.'",
        },
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
        brief: {
          what: "Online/offline tracking via Redis TTL heartbeats. Client pings every 30s → SET presence:{uid} 1 EX 60. Key expiry = implicit offline detection. Status changes fan out via Redis Pub/Sub to subscribed contacts.",
          why: "Presence is a deceptively complex sub-system — tests heartbeat design, TTL-based state management, pub/sub fan-out, and how to avoid N² subscription costs at scale.",
          how: "Client sends heartbeat every 30s via existing WebSocket → server runs SET presence:{uid} 1 EX 60 → if network drops, no heartbeats → key expires after 60s → keyspace notification triggers 'offline' event → presence service publishes to Pub/Sub → subscribed contacts receive status update.",
          tradeoffs: "30s heartbeat interval = up to 60s delay before offline detection. More frequent heartbeats (10s) give faster detection but 3× more Redis writes at scale. Lazy subscription (only subscribe when conversation opened) avoids N² fan-out but means contacts don't see real-time status unless actively chatting.",
          interview: "Say: 'Lazy subscription is the key scaling insight — user A with 5000 contacts would trigger 5000 deliveries on every login if we eagerly fan out. Instead, only contacts who have a conversation open subscribe. Disconnected contacts see presence on-demand when they open the chat.'",
        },
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
        brief: {
          what: "Geospatial driver lookup using geohash prefix search on Redis. Drivers push GPS every 4s → Kafka → location service → GEOADD in Redis. Rider query: decode geohash → search center + 8 neighbor cells for available drivers.",
          why: "Geo-spatial system design is a common question at ride-share, delivery, and location-based apps. Tests geohash encoding, neighbor cell lookup, spatial indexing, and how to handle boundary edge cases.",
          how: "Driver GPS ping → Kafka → location service consumes → GEOADD drivers lat lng driver_id → rider requests ride → GEORADIUS or geohash prefix query for center + 8 neighbors → candidates filtered (availability, car type) → ETA pre-computed for top N → best match dispatched.",
          tradeoffs: "Geohash cells distort at high latitudes; H3 hexagons have uniform area (Uber's preference for analytics). Querying only center cell misses drivers just across a boundary — 9-cell query fixes this but is 9× the work. Redis Geo under the hood is just a ZSET with geohash as score — all standard ZSET complexity applies.",
          interview: "Say: 'The 9-cell neighbor query is the critical detail. If a driver is 1 meter across a geohash boundary from the rider, querying only the center cell misses them. Always query center + all 8 neighbors to handle boundary cases.'",
        },
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
        brief: {
          what: "Database optimised for Approximate Nearest Neighbor search over high-dimensional float vectors (embeddings). HNSW index gives O(log N) search with tunable recall. Used in RAG, semantic search, and recommendation.",
          why: "Vector databases are the foundational infrastructure for LLM-powered features. Understanding HNSW, recall vs speed tuning, RAG chunking strategy, and metadata filtering is essential for AI/ML system design.",
          how: "Index time: embed documents → upsert (id, vector, metadata) → HNSW builds hierarchical layer graph. Query time: embed query → HNSW greedy search from top layer down → returns top-K candidates → optional cross-encoder re-rank → inject into LLM context.",
          tradeoffs: "ANN (approximate) trades perfect recall for speed — at ef_search=200 you get 99% recall in ~1ms; ef_search=10 gives 90% recall in ~0.1ms. Exact search (brute force) is O(N) — unusable at >1M vectors. Metadata pre-filtering reduces search space but can hurt recall if filter is too aggressive.",
          interview: "Say: 'HNSW builds a highway graph — upper layers skip large distances, lower layers refine locally. O(log N) average search. For RAG, chunk at ~500 tokens with 50-token overlap so semantic context doesn't get cut at chunk boundaries.'",
        },
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
        brief: {
          what: "Ride-sharing platform with real-time driver matching, dynamic pricing, GPS tracking, event-driven ride state machine, and deferred payment capture. Geo indexing and ETA calculation are core systems.",
          why: "Comprehensive system design question covering geo search, real-time matching, event-driven state machines, dynamic pricing, and payment flows. Common at Uber/Lyft/DoorDash interviews.",
          how: "Ride request → nearby driver query (geohash/H3) → score candidates (ETA + acceptance rate) → send offer to best driver → on accept: ACCEPTED event → Kafka → billing service authorises card. GPS pings stream every 4s: driver → Kafka → location service → Redis. Ride completes → COMPLETED event → billing captures final fare.",
          tradeoffs: "Deferred capture (authorise on request, capture on completion) enables tip prompts and exact fare calculation but requires handling auth expiry (7-day limit) for very long trips. Event-driven state machine (Kafka) decouples services but makes saga rollback complex on failures mid-ride.",
          interview: "Say: 'The ride state machine is event-driven — each transition publishes to Kafka. Billing, notifications, and analytics are independent consumers. Adding a loyalty points service means adding one new consumer, zero changes to the ride service.'",
        },
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
        brief: {
          what: "Traffic control layer that caps request rates per user/IP/API key. Token Bucket allows bursts; Sliding Window is most accurate. Redis enforces limits atomically across multiple app servers using Lua scripts.",
          why: "Rate limiting appears in virtually every API design question. Tests algorithm trade-offs, distributed atomicity (Lua scripts), response design (429 + headers), and back-pressure patterns.",
          how: "On each request: Redis Lua script atomically reads counter, increments if under limit, sets TTL on first increment. Returns new count. App checks: if > limit → 429 with Retry-After header. Token Bucket: HINCRBY on token field + timestamp field, compute available tokens from elapsed time + refill rate.",
          tradeoffs: "Fixed Window: simple (INCR + EXPIRE) but allows 2× burst at window boundaries. Sliding Window Log: precise but O(requests_in_window) memory. Sliding Window Counter: O(1) with ~1% error at boundaries — best practical trade-off. Local counters: fast but miss distributed burst; Redis: consistent but adds ~1ms latency per request.",
          interview: "Say: 'Fixed window has a boundary attack — 100 requests at 11:59pm + 100 at 12:00am = 200 requests in 2 seconds against a 100/min limit. Sliding window counter interpolates between two windows to fix this with O(1) space and only ~1% inaccuracy.'",
        },
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
        brief: {
          what: "Hashing scheme for distributed systems where adding/removing nodes remaps only 1/N keys (vs modular hashing which remaps nearly all). Keys walk clockwise on a hash ring to find their node. Virtual nodes ensure even key distribution.",
          why: "Consistent hashing is the foundation of Cassandra, DynamoDB, and Memcached. Any question involving distributed caches or sharded databases will benefit from explaining this — it shows deep distributed systems knowledge.",
          how: "Hash each node name to a position on a 0..2³² ring. Hash each key to a position → walk clockwise to first node. With K=150 virtual nodes per physical node, keys distribute evenly. Adding a node: insert K new virtual positions → only keys between new positions and their predecessors remapped.",
          tradeoffs: "Without virtual nodes, Poisson distribution of random positions causes hotspots (some nodes get 3× more keys). Virtual nodes fix distribution but add routing table size (K×N entries). Replication: Cassandra replicates to next RF-1 clockwise nodes — failing nodes are still served by replicas.",
          interview: "Say: 'Modular hashing (key % N): adding one node remaps ~N-1/N of all keys — cache miss avalanche. Consistent hashing: adding one node remaps only ~1/N keys. That's the difference between a restart-proof cache and a cache that becomes useless on every scaling event.'",
        },
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
        brief: {
          what: "CAP Theorem: distributed systems must choose between Consistency and Availability during a network Partition (P is unavoidable). PACELC extends this: even without partitions, there's a Latency vs Consistency trade-off.",
          why: "Understanding CAP is the baseline for all distributed systems interviews — it frames every database choice. Correctly classifying systems as CP vs AP and explaining quorum math signals distributed systems maturity.",
          how: "During a partition: CP systems stop accepting writes to avoid stale reads (return errors). AP systems continue accepting writes and reconcile diverged state later (eventual consistency). Quorum formula: R + W > N guarantees at least one node overlaps between the last write and the read set.",
          tradeoffs: "CP: strong consistency but reduced availability during partitions — bad for user-facing services. AP: always available but stale reads possible — bad for financial systems. Cassandra tunable: ONE (AP) vs QUORUM (CP-ish) per query. Spanner achieves CP with Paxos consensus + TrueTime atomic clocks.",
          interview: "Say: 'Partition tolerance is non-negotiable in any multi-machine system — networks fail. The real choice is CP vs AP. For a banking system: CP (never serve stale balance). For a social feed: AP (slightly stale feed is fine). For a shopping cart: AP with merge-on-conflict (Dynamo style).'",
        },
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
        brief: {
          what: "Multiple caching patterns for different read/write trade-offs. Cache-Aside is the most common (lazy population). Write-Through prioritises consistency. Write-Behind prioritises write speed. Each has different failure characteristics.",
          why: "Caching is asked in almost every system design interview. You must know when to use each pattern, how to handle stampedes and hot keys, and how to reason about cache invalidation.",
          how: "Cache-Aside: read → check Redis → miss → query DB → write to Redis with TTL → return. Write-Through: write → update DB + Redis atomically. Write-Behind: write → Redis only → background job flushes to DB (async). Cache invalidation: TTL-based (simple, stale risk) or event-driven (pub/sub on DB change, complex but fresh).",
          tradeoffs: "Cache-Aside: simple but cold-start problem (all misses on deploy). Write-Through: consistent but extra write latency. Write-Behind: fast writes but data loss on cache crash before async flush. Hot keys: one Redis key getting millions of req/s — mitigate with local in-process cache (Caffeine/Guava) or key replication.",
          interview: "Say: 'Cache stampede is when a hot key expires and thousands of requests all miss simultaneously, overwhelming the DB. Fix with probabilistic early expiry (XFetch) — requests probabilistically rebuild the cache slightly before expiry, preventing the synchronized rush.'",
        },
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
        brief: {
          what: "B-Tree indexes (MySQL/PostgreSQL) give O(log N) reads with in-place updates — optimised for mixed read/write. LSM-Tree indexes (Cassandra/RocksDB) convert all writes to sequential I/O — optimised for write-heavy workloads. Covering indexes eliminate heap fetches entirely.",
          why: "Indexing strategy is the highest-leverage database optimisation. Understanding B-Tree vs LSM trade-offs, composite index prefix rule, and covering indexes differentiates senior engineers from juniors in interviews.",
          how: "B-Tree: write navigates tree to leaf page, updates in place (random I/O). Read: O(log N) traversal. LSM: write to in-memory MemTable → when full, flush to immutable SSTable on disk (sequential I/O) → reads check MemTable + all SSTables (Bloom filter prunes false paths) → compaction merges SSTables periodically.",
          tradeoffs: "B-Tree: fast reads, slower writes (random I/O, must update all indexes on INSERT). LSM: fast writes, slower reads (multiple SSTable levels, write amplification during compaction). Composite index prefix rule: INDEX(a,b,c) used for WHERE a=?, WHERE a=? AND b=?, but NOT WHERE b=?. Covering index: no heap fetch but larger index size and slower writes.",
          interview: "Say: 'LSM-Tree has write amplification — data is written once to MemTable then re-written during each compaction level. But each write is sequential I/O which is 10–100× faster than the random I/O B-Trees use. That's why Cassandra can sustain millions of writes/sec per node.'",
        },
      },
    ],
  },
];
