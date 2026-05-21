// Deep-dive sections for every topic in layers.js
// Each entry: array of { heading, body } shown below the key-points list.

export const LAYER_DETAILS = {

  // ── Layer 1: Application ──────────────────────────────────────────────────

  "whatsapp": [
    {
      heading: "Why persistent TCP instead of HTTP polling?",
      body: "WhatsApp keeps a single long-lived TCP connection open per device, implemented on Ejabberd — an Erlang OTP server that spawns a lightweight green thread per connection at near-zero cost. Because Erlang can hold millions of concurrent processes in a few GB of RAM, a single cluster handles 2 B+ users. HTTP polling would require each device to hit the server every few seconds just to check for new messages, multiplying server load by 10–100× with no latency improvement.",
    },
    {
      heading: "Signal Protocol — how double ratchet works",
      body: "Every session uses two ratchets layered together. The Diffie-Hellman ratchet generates a new shared secret each time either party sends a message, providing forward secrecy — past session keys are deleted and cannot be recovered even if the current key is compromised. The symmetric-key ratchet derives message keys from a chain key, so each message uses a unique key. Keys are never stored on the server. WhatsApp uploads one-time prekey bundles so a sender can initiate an encrypted session with an offline recipient without any prior exchange.",
    },
    {
      heading: "Media delivery without burdening the chat server",
      body: "Photos and videos are encrypted client-side before upload, then pushed to WhatsApp's CDN-backed blob store. The server receives only an HTTPS URL plus the encryption key, which it forwards as a tiny message to the recipient. The recipient fetches and decrypts the media directly from the CDN edge. This keeps the Ejabberd cluster handling only small control messages (< 1 KB each) while petabytes of media travel over cheap object storage infrastructure.",
    },
  ],

  "reddit": [
    {
      heading: "The hot-score formula explained",
      body: "Reddit's hot ranking is: score = log₁₀(max(|ups − downs|, 1)) + sign × seconds / 45000. The logarithm compresses vote counts so 10 000 upvotes is only marginally better than 1 000 — preventing old viral posts from dominating forever. Dividing seconds by 45 000 means roughly one upvote equals one hour of age, so fresh posts naturally rise. The epoch is Jan 1 2006 (Reddit's founding), giving all posts a large positive baseline that prevents negative scores on new posts.",
    },
    {
      heading: "Feed pre-computation and fan-out",
      body: "Computing a personalised feed on every page load by querying all subscribed subreddits is O(subscriptions × posts). Reddit pre-computes and caches feeds in Redis sorted sets keyed by user_id. When a popular post is voted on, background workers re-rank the affected subreddit caches and fan out the update to subscriber feeds. For users with thousands of subscriptions, full fan-out is skipped — instead feeds are rebuilt lazily on the next request from a combination of subreddit caches.",
    },
    {
      heading: "Storing and rendering nested comments",
      body: "Comments are stored as an adjacency list — each row has a parent_comment_id. Fetching an entire thread naively requires N+1 queries. Reddit fetches the full flat list in one query and reconstructs the tree in application memory. For very deep threads the closure-table pattern pre-materialises ancestor paths so entire subtrees can be fetched with a single WHERE ancestor_id = ? query. Comment collapse state is stored client-side in localStorage, not on the server.",
    },
  ],

  "airbnb": [
    {
      heading: "Geospatial search pipeline",
      body: "The search box hits Elasticsearch with a geo_distance filter around the map bounding box. ES uses a geohash grid index to prune the search space before scoring. Results are re-ranked by a separate pricing and availability service backed by Redis bitmaps — one bit per calendar day per listing stored as a BITSET, allowing O(1) availability checks for any night. The final ranked list is cached per search region and invalidated when any listing in that region changes availability.",
    },
    {
      heading: "Preventing double-bookings with optimistic locking",
      body: "Pessimistic row locks would serialise all bookings globally and destroy throughput during peak periods. Instead Airbnb uses a version column on the reservation record. Both users who race on the same listing will read version = 7 and attempt UPDATE … WHERE version = 7. The database atomically accepts only the first and the second fails with 0 rows updated — a version mismatch. The loser retries and discovers the dates are now taken. This achieves strong correctness with no lock contention.",
    },
    {
      heading: "Dynamic pricing with Aerosolve",
      body: "Airbnb's open-source ML framework Aerosolve powers the Smart Pricing feature. Features fed to the model include: day-of-week, local public holidays, nearby events (concerts, conferences), competitor listing prices in a 2 km radius, historical acceptance rate for the host, and listing quality score. Rather than outputting a single price, the model returns a probability-weighted distribution so hosts see a range with expected occupancy at each price point — turning pricing into an explicit trade-off they understand.",
    },
  ],

  "pastebin": [
    {
      heading: "Key Generation Service (KGS) pattern",
      body: "The naive approach — hash content and take 7 characters — fails when two different pastes produce the same prefix. Pastebin's canonical design uses a dedicated KGS that pre-generates millions of random base62 keys offline and stores them in an unused_keys table. When a paste is created, a key is atomically moved to used_keys in a single SQL transaction. This eliminates race conditions entirely and decouples key generation (a batch job) from paste creation (a hot write path).",
    },
    {
      heading: "Read-optimised storage tiering",
      body: "The read:write ratio for Pastebin is roughly 100:1 — pastes are created once and read many times. The read path goes CDN → Redis LRU → object storage (S3). The CDN handles the top 1% of pastes by traffic at near-zero compute cost. Redis LRU captures the popular long tail. Only cache misses hit object storage. Metadata (title, expiry, view count) lives in MySQL with a TTL index for auto-expiry; the blob is in cheap object storage. These two concerns are deliberately separated so each can scale independently.",
    },
  ],

  "bluesky": [
    {
      heading: "Decentralised identity via DIDs",
      body: "A Bluesky DID (Decentralised Identifier) is a globally unique string like did:plc:abc123 that is not tied to any single server. It resolves to a DID document listing your current Personal Data Server (PDS) address and your public signing key. Moving to a different PDS is just an update to the DID document — your followers' clients resolve the new address automatically. This portability is the core technical advantage over centralised platforms where your account is inseparable from the company's servers.",
    },
    {
      heading: "Content-addressed records and the Firehose",
      body: "Every post, like, follow and profile update in AT Protocol is a CID-referenced record stored in a per-user Merkle tree (similar to a Git commit tree). A CID is a hash of the content, making records tamper-evident. AppViews — the indexing servers that power search, feeds, and notifications — consume the global Firehose, an event stream of every record change across all PDSes. Because the Firehose is public and deterministic, any developer can build a competing client or feed algorithm over the same raw data without special permission.",
    },
  ],

  // ── Layer 2: Scale & Distribution ─────────────────────────────────────────

  "youtube-scale": [
    {
      heading: "Transcoding pipeline and codec ladder",
      body: "Uploaded video is stored raw in GCS then asynchronously fed into a distributed transcoding pipeline. Each video is encoded into a codec ladder: H.264 at 360p/480p/720p/1080p for broad device compatibility, plus VP9 and AV1 at higher resolutions for ~30% better compression. AV1 encoding is 10–50× slower than H.264, so YouTube encodes lower qualities first so the video becomes watchable within minutes of upload. Thumbnail sprites (a sheet of frames every few seconds) are generated for hover previews.",
    },
    {
      heading: "Adaptive Bitrate Streaming (DASH/HLS)",
      body: "The video is segmented into 2–10 second chunks, each available at every quality level. The player's ABR algorithm monitors download throughput and buffer occupancy every segment. If buffer drops below 10 seconds, it switches to a lower quality for upcoming segments while already-buffered higher-quality frames continue playing. DASH (Dynamic Adaptive Streaming over HTTP) is used for desktop and Android; HLS for iOS/Safari. The manifest file (MPD or m3u8) lists all segment URLs across all quality levels — the player fetches segments directly from the nearest OCA.",
    },
    {
      heading: "Open Connect CDN — avoiding transit costs",
      body: "YouTube's peak traffic is hundreds of terabits per second — routing all of it through commercial CDNs would cost billions annually in egress fees. Google built Open Connect: custom hardware appliances placed directly inside ISPs and internet exchange points worldwide. When your browser requests a video segment, the AWS control plane selects the nearest OCA using BGP prefix matching and returns its IP in the manifest. Your player connects directly to the OCA inside your ISP's network, never traversing the public internet. This slashes both cost and latency.",
    },
  ],

  "uber-eta": [
    {
      heading: "Real-time road graph edge weights",
      body: "Uber models the road network as a weighted directed graph (OpenStreetMap as the base). Edge weights represent expected travel time in seconds. Every 4 seconds, each active driver sends a GPS ping. A streaming job aggregates these pings per road segment and computes a current speed. This current speed is blended with the historical median for that segment at that hour-of-day/day-of-week, preventing a single slow driver from distorting the entire edge weight. The graph is stored in a custom in-memory data structure that supports sub-millisecond routing queries.",
    },
    {
      heading: "H3 hexagonal grid for surge pricing",
      body: "H3 partitions the Earth into uniform hexagonal cells. Hexagons outperform squares because all 6 neighbors are equidistant from the center — there is no diagonal neighbor that is √2 farther away. Resolution-9 cells cover ~0.1 km² each. Driver supply (available cars) and rider demand (open requests) are aggregated per cell every 30 seconds. The surge multiplier for a cell is a function of demand/supply ratio. Surge propagates to adjacent cells when demand spills over. Because all cells are equal area, the surge calculation is geographically fair.",
    },
    {
      heading: "ML correction layer on top of Dijkstra",
      body: "Pure Dijkstra routing underestimates real ETAs by ignoring traffic signals, turn restriction timing, driver route preference, and weather. Uber trains a gradient-boosted model on historical trip completions. For every completed trip, the ground-truth travel time is compared to the Dijkstra estimate, producing a labelled dataset of (graph_ETA, features) → actual_time. Features include: time of day, day of week, origin/destination area, current weather, and nearby event flags. The model's correction factor reduces median ETA absolute error by 15–20% over graph-only routing.",
    },
  ],

  "url-shortener": [
    {
      heading: "301 vs 302 redirect — a business decision",
      body: "HTTP 301 (Permanent Redirect) instructs the browser to cache the destination URL forever. Subsequent clicks skip the shortener entirely, reducing server load. But the shortener can no longer track clicks or update the destination. HTTP 302 (Temporary Redirect) forces every click through the shortener server, enabling analytics, A/B testing, and destination updates. Bit.ly, TinyURL, and every commercial shortener use 302 because click analytics is the monetisation mechanism. Only use 301 for permanent aliases where tracking is irrelevant.",
    },
    {
      heading: "Base62 encoding math and capacity",
      body: "Base62 uses characters a-z, A-Z, 0-9 — 62 symbols per position. With 7 characters, capacity = 62⁷ ≈ 3.5 trillion unique keys. At 100 M new URLs/day, you'd exhaust the keyspace in ~95 years. The most collision-free approach is to use a global auto-increment counter and convert it to base62 — a counter of 1 billion (10⁹) produces a 5-character code. This is deterministic, produces no collisions, and requires no uniqueness check. The trade-off: keys are predictable and enumerable, which matters for private paste services but not for public URL shorteners.",
    },
    {
      heading: "Caching strategy for the hot read path",
      body: "URL lookups follow Zipf's law — the top 20% of URLs receive ~80% of traffic. A Redis LRU cache with ~20% of total URL capacity captures this majority with sub-millisecond latency. The cache key is the short code; the value is the full destination URL. Cache TTL is set to match the expected lifetime of the short URL (often indefinite). Cache misses fall through to Cassandra, which is well-suited for this write-once, read-many, key-based access pattern. Analytics events (click timestamps, referrers, geo) are written asynchronously to Kafka and aggregated separately.",
    },
  ],

  "twitter-timeline": [
    {
      heading: "Fan-out on write vs fan-out on read — the hybrid",
      body: "Fan-out on write: when any user tweets, Twitter pre-writes the tweet ID into each follower's Redis timeline sorted set. Reads are O(1) — just fetch the pre-built list. But for @elonmusk with 150 M followers, one tweet triggers 150 M Redis writes, taking minutes and creating a write storm. Fan-out on read: merge each followed account's recent tweets at read time — O(following_count) per page load. Twitter uses a hybrid: fan-out on write for accounts with under ~10 K followers; fan-out on read for celebrities. Celebrity tweets are merged at read time using a K-way merge of per-user sorted sets.",
    },
    {
      heading: "Timeline storage — sorted sets of IDs, not content",
      body: "Each user's Redis timeline is a sorted set of tweet IDs (64-bit integers, 8 bytes each), scored by tweet creation timestamp. The set is capped at ~800 entries. Actual tweet content (text, media URLs, author info) is stored in a separate Manhattan (Twitter's distributed KV store) entry keyed by tweet ID. This indirection means a tweet edit or deletion requires changing only one record — all 150 M timelines that contain that tweet ID automatically serve the updated content. The timeline is a thin index; the content store is the source of truth.",
    },
    {
      heading: "ML re-ranking for the Home timeline",
      body: "Chronological feeds have low engagement because users miss tweets from accounts they care about most. Twitter's Home tab takes the raw candidate set (~800 tweet IDs from the pre-built timeline) and scores each with a neural network that predicts the probability of each engagement type (like, reply, retweet, click). Features include: relationship strength (reply history, mutual follows), topic affinity, content freshness, media presence, and author credibility score. The top 50 scored tweets are returned. This adds ~50 ms latency per request but significantly increases time-on-site.",
    },
  ],

  "nginx": [
    {
      heading: "Event loop and epoll — why threads don't scale",
      body: "Apache in prefork mode spawns one OS thread per connection. At 10 K concurrent connections, that's 10 K threads × 2 MB default stack = 20 GB RAM just for stacks, plus the kernel spending significant CPU on context switching. Nginx uses one worker process per CPU core. Each worker runs a tight event loop: call epoll_wait() → kernel returns a list of file descriptors with pending I/O → process each one synchronously → loop. No threads, no context switches. A single worker handles thousands of concurrent connections in a few MB of RAM.",
    },
    {
      heading: "Upstream connection pooling",
      body: "Every time Nginx proxies a request without connection reuse, it pays the cost of a TCP + TLS handshake (~3 roundtrips, ~50 ms on LAN). With keepalive enabled on the upstream pool, Nginx keeps idle connections open to each backend. A new proxied request grabs an idle connection from the pool in microseconds. Pool size, keepalive timeout, and max idle connections per upstream server are configurable. Failed health checks trigger passive circuit-breaking: the upstream is removed from rotation until it recovers, preventing request pile-ups on a degraded backend.",
    },
  ],

  // ── Layer 3: Infrastructure ───────────────────────────────────────────────

  "kafka": [
    {
      heading: "Append-only log — the core abstraction",
      body: "Kafka's fundamental data structure is a partitioned, replicated, append-only log stored on disk. Producers append to the end; consumers read sequentially from an offset. Sequential disk I/O on modern SSDs achieves 500+ MB/s — far faster than the random I/O that traditional databases rely on. Because messages are never updated or deleted during retention, the OS page cache is maximally effective: the same pages are read repeatedly by multiple consumers, staying warm in RAM without Kafka-level caching logic.",
    },
    {
      heading: "Replication, ISR, and producer acks",
      body: "Each partition has one leader and N−1 followers. The leader writes to its own log and waits for ISR (In-Sync Replicas) acknowledgment before confirming to the producer. acks=0: fire and forget, maximum throughput, data loss risk. acks=1: leader acknowledged, follower lag risk. acks=all: all ISR members acknowledged, strongest durability. If a leader dies, ZooKeeper (or KRaft) promotes an ISR member to leader within seconds. Non-ISR replicas are not eligible for leadership — they may be too far behind and would cause data loss.",
    },
    {
      heading: "Consumer groups and partition parallelism",
      body: "A consumer group distributes partitions across its members — each partition is consumed by exactly one member at a time. With 12 partitions and 4 consumers, each consumer handles 3 partitions in parallel. Adding a 5th consumer would leave one idle; adding a 13th would mean one consumer gets 0 partitions. Partition count is therefore the maximum parallelism ceiling for a consumer group. Key-based partitioning (messages with the same key always go to the same partition) guarantees per-key ordering — essential for stateful stream processing like user session events.",
    },
    {
      heading: "Exactly-once semantics — idempotence + transactions",
      body: "At-least-once delivery retries failed produces but creates duplicates downstream. Exactly-once uses two mechanisms together: (1) The idempotent producer tags each message with a sequence number and producer ID. The broker deduplicates retried messages within a session — a retry with the same sequence number is a no-op. (2) Kafka transactions atomically write to multiple partitions and commit consumer offsets in a single transactional unit. A transaction either fully commits or fully aborts, making consume-transform-produce pipelines atomic.",
    },
  ],

  "google-search": [
    {
      heading: "Inverted index internals",
      body: "The inverted index maps every word to a posting list: a sorted array of (docID, term_frequency, position_list) tuples. To answer 'system design', the engine fetches both posting lists and computes their intersection — documents containing both terms. Position lists enable phrase matching: 'system design' requires the words to appear within N positions of each other. The index is sharded by docID range across thousands of machines. A query fan-outs to all shards in parallel, each returning its top-K results, which are then merged and re-ranked by a central scorer.",
    },
    {
      heading: "PageRank — links as votes",
      body: "PageRank models a random web surfer who follows links. A page's rank is the probability that the surfer lands on it after infinitely many random clicks. Mathematically: PR(A) = (1-d)/N + d × Σ PR(T)/C(T), where d=0.85 is the damping factor, T ranges over pages linking to A, and C(T) is T's out-degree. A link from a high-PR page (like Wikipedia) transfers more rank than a link from an obscure blog. The algorithm runs iteratively until convergence (~50 iterations). PageRank is now one of 200+ signals — content quality and user engagement signals carry equal or greater weight.",
    },
    {
      heading: "BERT and semantic understanding",
      body: "Before BERT (2019), Google matched queries to documents lexically — the same words had to appear. BERT (Bidirectional Encoder Representations from Transformers) represents both query and document as dense vectors capturing semantic meaning. 'Jaguar speed car' and 'how fast does a jaguar run' map to nearby points in vector space despite sharing no words. Google runs BERT inference on ~10% of queries where traditional lexical matching struggles — particularly long-tail, conversational, and natural language queries. MUM (Multitask Unified Model, 2021) extends this to multimodal and multilingual understanding.",
    },
  ],

  "airtags": [
    {
      heading: "Privacy-preserving crowdsourced location",
      body: "Each AirTag broadcasts a Bluetooth advertisement every ~2 seconds. Nearby iPhone owners (who opted into the Find My network at setup) silently detect it, encrypt the AirTag's location with the AirTag's current public key, and upload the ciphertext to Apple's servers. Only the AirTag owner holds the private key and can decrypt the location. Apple receives millions of encrypted location reports but cannot read any of them — the system is cryptographically end-to-end private even from Apple itself.",
    },
    {
      heading: "Rotating public keys prevent tracking",
      body: "If the AirTag broadcast the same identifier indefinitely, any Bluetooth scanner could track its movements over time — enabling stalking even without Apple's involvement. AirTags rotate their broadcast public key every 15 minutes. The rotation schedule is derived from the owner's private key using a deterministic algorithm, so the owner's devices can always decrypt location reports regardless of which public key was active when the report was uploaded. Third parties see a stream of apparently unrelated random identifiers and cannot correlate them to a single device.",
    },
  ],

  "amazon-s3": [
    {
      heading: "Erasure coding vs full replication",
      body: "S3 Standard stores objects across at least 3 Availability Zones. Full 3× replication (3 copies of every byte) provides 3× storage overhead. S3 instead uses Reed-Solomon erasure coding: for a 6+3 scheme, an object is split into 6 data fragments and 3 parity fragments. Any 6 of the 9 fragments can reconstruct the original — tolerating loss of any 3 simultaneous fragments. Storage overhead is only 1.5× vs 3×, and the 11-nines durability spec models the probability of losing more than 3 AZs simultaneously over 10 years, which is essentially zero.",
    },
    {
      heading: "Strong consistency (post-2020) and how it works",
      body: "Pre-2020, S3 offered only eventual consistency for overwrite PUTs and DELETEs — a freshly uploaded object could return HTTP 404 for a few seconds due to read-path caching. AWS fixed this by introducing per-object read-after-write consistency using a distributed metadata locking layer. A PUT is now only confirmed to the client after the new object's metadata has been propagated to all read replicas in the region. The extra roundtrip adds single-digit milliseconds to PUT latency but eliminates an entire class of application-level retry logic.",
    },
  ],

  "slack": [
    {
      heading: "WebSocket fan-out via Pub/Sub",
      body: "When you send a message, it hits Slack's API servers over HTTPS, is persisted to the message store (sharded MySQL by workspace_id), and then published to a channel-specific Redis Pub/Sub topic. Each WebSocket server subscribes to topics for all users it currently hosts. The WS server receives the event and pushes it to the relevant open connections. This decouples the API tier (which doesn't know which WS server holds which connection) from the delivery tier. Redis Pub/Sub can fan out to thousands of WS server subscribers in under 1 ms.",
    },
    {
      heading: "Flannel — channel membership at scale",
      body: "To deliver a channel message, the server needs the full member list. For a #general channel with 50 K members, a MySQL lookup on every message is prohibitively slow. Flannel is Slack's in-memory channel membership service, built on top of MySQL with a write-through cache sharded by workspace ID. Channel membership is kept in RAM as bitsets or sorted arrays; join/leave events update MySQL asynchronously. Flannel resolves membership lookups in under 1 ms at peak load, compared to 10–50 ms for a MySQL query.",
    },
  ],

  // ── Layer 4: Intelligence & Matching ──────────────────────────────────────

  "llms": [
    {
      heading: "Transformer self-attention — the O(n²) bottleneck",
      body: "Self-attention computes, for each token, a weighted sum over all other tokens: Attention(Q, K, V) = softmax(QKᵀ / √dₖ) × V. The QKᵀ matrix is n × n where n is the sequence length — 128 K tokens means a 128 K × 128 K attention matrix, consuming 128 GB of VRAM just for the attention scores. This is why context window expansion is expensive. FlashAttention rewrites the attention kernel to tile the computation across GPU SRAM instead of materialising the full matrix in HBM, reducing memory usage from O(n²) to O(n) and achieving 2–4× faster training.",
    },
    {
      heading: "Pre-training + RLHF — two separate objectives",
      body: "Pre-training on ~1 trillion tokens of internet text teaches the model to predict the next token. This makes it good at completing text in the style of its training data — including generating toxic, biased, or misleading content that appears online. RLHF (Reinforcement Learning from Human Feedback) fine-tunes the model on human preferences: labellers rank model outputs, a reward model is trained on those rankings, and the LLM is further trained with PPO to maximise the reward signal. Pre-training gives capability; RLHF gives alignment. Modern LLMs use DPO (Direct Preference Optimisation) instead of PPO for greater stability.",
    },
    {
      heading: "KV cache and continuous batching in production",
      body: "During inference, each new token requires the attention mechanism to attend over all previously generated tokens. Without caching, this recomputes all key-value pairs from scratch on each step — O(n) extra compute per token. The KV cache stores all past key and value tensors, reducing each new token to one attention forward pass. Continuous batching (used by vLLM) processes multiple in-flight requests on the same GPU simultaneously by packing their token-generation steps into the same forward pass. This raises GPU utilisation from ~30% (naive, one-at-a-time serving) to ~80%+, reducing cost-per-token dramatically.",
    },
  ],

  "stock-exchange": [
    {
      heading: "Order book data structure",
      body: "The order book stores all outstanding limit orders. Bids (buy orders) are stored in a max-indexed price-level map; asks (sell orders) in a min-indexed map. Each price level holds a doubly-linked list of orders for O(1) queue-order insertion and cancellation. When a new order arrives, the engine checks if the best bid ≥ best ask — if yes, a match occurs. Price-time priority means earlier orders at the same price execute first. The entire matching loop is single-threaded and deterministic, making the engine auditable: given the same order stream, it always produces the same trade log.",
    },
    {
      heading: "LMAX Disruptor — lock-free ring buffer",
      body: "Traditional blocking queues use mutexes. When two threads compete for the same lock, the kernel must context-switch, invalidating CPU caches. The Disruptor pattern pre-allocates a ring buffer of fixed size (power of 2). Producers claim the next sequence slot with a CAS (compare-and-swap) operation — a single CPU instruction, no kernel involvement. Consumers follow via their own sequence number. Because the buffer never reallocates, the entire ring stays resident in CPU L1/L2 cache. LMAX demonstrated 6 M+ orders/second on a single core — the kind of deterministic throughput regulated exchanges require.",
    },
    {
      heading: "Market data distribution via multicast",
      body: "After a trade executes, price and book updates must reach thousands of subscribers simultaneously. Unicast TCP would require the exchange to maintain and write to thousands of separate connections. Multicast UDP solves this: the exchange sends one UDP packet to a multicast group address; the network switches fan it out to all subscribers who have joined that group via IGMP. Subscribers use sequence numbers to detect gaps and request retransmission from a separate recovery service. The wire protocol is binary-encoded (ITCH, FIX FAST) to minimise bytes — every microsecond of decode time matters in HFT.",
    },
  ],

  "tinder": [
    {
      heading: "ELO scoring — desirability as a dynamic rank",
      body: "Tinder's ELO variant works as follows: every profile starts with a baseline score. When user A right-swipes on user B, the expected match probability is computed from score difference (high-ranked users are less likely to match low-ranked ones). If A and B mutually match, both scores increase proportionally to how unexpected the match was. If B rejects A, A's score decreases slightly. Over millions of interactions, profiles cluster into natural tiers that tend to match each other, surfacing highly-compatible candidates and reducing rejection rates.",
    },
    {
      heading: "Pre-computed profile stacks in Redis",
      body: "Computing a ranked candidate set on every swipe — geo-filter → age/preference filter → ELO sort → deduplication — is too slow for the sub-100 ms swipe UX. Tinder pre-computes a stack of ~100 candidate profile IDs per user and caches it in Redis. The stack is refreshed in the background every few minutes or when exhausted. Swipes are written asynchronously to Kafka and consumed by the ELO recomputation job, which feeds updated scores back into the candidate generation pipeline. The user always sees a ready stack; the freshness lag is acceptable because profiles don't change in seconds.",
    },
  ],

  "serverless": [
    {
      heading: "Cold start anatomy and mitigation",
      body: "A Lambda cold start has four stages: (1) provision a container from the worker pool (~10 ms), (2) download and unpack the deployment package from S3 (~50–500 ms depending on size), (3) start the runtime — JVM takes 2–10 s, Python/Node.js ~100 ms, (4) run your initialisation code (DB connections, config loading). Total cold start for a JVM function can be 5–15 s. Mitigations: Provisioned Concurrency keeps N containers pre-warmed at a fixed additional cost; SnapStart captures a post-init JVM snapshot for near-instant restore; Lambda layers cache shared dependencies; keeping functions small and stateless minimises init code.",
    },
    {
      heading: "Economic model — when serverless costs more",
      body: "Lambda charges per GB-second. A 512 MB function running 1 s = 0.5 GB-s. At $0.0000166667 per GB-s, that's ~$0.000008 per invocation — tiny. But at 1 billion invocations/month (common for a large API), the compute cost is $8 000/month, often more expensive than a fleet of EC2 instances running at 30% utilisation. Serverless wins for: bursty, unpredictable traffic; scheduled jobs; event-driven webhooks. EC2/containers win for: sustained high-throughput traffic where you can justify right-sizing. The real value of serverless is operational simplicity, not cost.",
    },
  ],

  "chatgpt-apps": [
    {
      heading: "Context window management strategies",
      body: "Every message in a ChatGPT conversation is included in every subsequent API call — the model has no persistent state. As conversations grow past the context limit, three strategies apply: (1) Sliding window — drop oldest messages. Simple but loses early context. (2) Summarisation — periodically replace older messages with a dense summary generated by the model itself. More expensive but preserves key facts. (3) RAG over conversation history — embed all past messages in a vector store and retrieve only the most relevant ones per query. Strategy choice depends on conversation type: customer support favours sliding window; coding assistants need full context.",
    },
    {
      heading: "Tool use — turning LLMs into agents",
      body: "When the model is given a tool (function) definition, it can output a structured JSON object like {\"name\": \"search_web\", \"args\": {\"query\": \"latest Go release\"}} instead of plain text. The application executes the function and returns the result as a new user message. The model continues reasoning with the tool output. Crucially, tool execution happens entirely on the application side — the model has no ability to run code itself; it only outputs structured requests. ReAct (Reason + Act) prompting chains multiple tool calls with intermediate reasoning steps, enabling complex multi-step tasks like 'research a topic, summarise findings, and write a report'.",
    },
  ],

  // ── Layer 5: Real-time Systems ────────────────────────────────────────────

  "google-docs": [
    {
      heading: "Operational Transformation — step by step",
      body: "Two users edit 'hello' simultaneously. User A inserts 'X' at index 2 → 'heXllo'. User B deletes character at index 4 → 'hell'. Both operations are sent to the server. The server applies A first. Now B's delete (index 4) must be transformed against A's insert (index 2 < 4, so shift index by +1) → delete at index 5 of 'heXllo' = 'l' → 'heXllo'. Without transformation, B's delete would hit the wrong character. OT requires a central server to establish a canonical ordering of concurrent operations — this is its fundamental limitation compared to CRDTs.",
    },
    {
      heading: "CRDTs as a peer-to-peer alternative",
      body: "Conflict-free Replicated Data Types define merge operations that are commutative, associative, and idempotent — any two replicas can be merged in any order and always converge. For text editing, a CRDT assigns each character a globally unique fractional position (like 1.5 between characters at 1 and 2). Insertions are always non-conflicting because positions are unique. Deletions are marked as tombstones rather than removed. CRDTs enable fully peer-to-peer collaboration with no central ordering server — used by Figma (vector graphics), Automerge (JSON), and Yjs (text). The cost: larger metadata overhead per character and harder garbage collection of tombstones.",
    },
    {
      heading: "Operation log + snapshot storage",
      body: "Google Docs stores every edit as a named operation in an append-only log keyed by (docID, revision_number). Reconstructing a document from revision 0 means replaying all operations, which is prohibitively slow for a 3-year-old document with millions of edits. Periodic snapshots capture the full document state at a given revision. Reconstruction becomes: load latest snapshot + replay only operations since that snapshot. Snapshots are stored in Bigtable keyed by (docID, snapshot_revision). The snapshot interval is adaptive — busier documents get more frequent snapshots to keep reconstruction fast.",
    },
  ],

  "spotify-streaming": [
    {
      heading: "Prefetching and gapless playback",
      body: "Spotify starts fetching the next track when you are ~30 seconds from the end of the current one. The decision of which track to prefetch uses the current queue, the autoplay recommendation, or the radio model. The prefetched audio is buffered in a local LRU cache on the device. When the current track ends, playback switches to the already-buffered next track with zero gap — no loading spinner, no silence. Prefetch accuracy (did we prefetch the right track?) is a key metric. Skipping before the 30-second threshold means the prefetch was wasted bandwidth.",
    },
    {
      heading: "Discover Weekly — collaborative filtering at scale",
      body: "Spotify trains collaborative filtering over an implicit feedback matrix: 600 M users × 100 M tracks, where each cell is a listen-count proxy. Matrix factorisation (ALS or word2vec on playlists — 'track2vec') produces low-dimensional embeddings for each user and track. Users with similar taste vectors are clustered; what cluster-mates have listened to that you haven't is a strong recommendation signal. The 'track2vec' approach treats playlists as sentences and tracks as words, learning that tracks co-occurring in many playlists are semantically similar. Discover Weekly runs as a weekly batch job because the full training loop takes hours even on Spotify's cluster.",
    },
  ],

  "chatgpt-infra": [
    {
      heading: "GPU parallelism strategies",
      body: "A GPT-4-class model has hundreds of billions of parameters — far more than fits on a single 80 GB A100. Tensor parallelism splits each weight matrix column-wise across multiple GPUs; each GPU computes a partial matrix multiply and an all-reduce synchronises the result. Pipeline parallelism assigns different transformer layers to different GPUs — GPU 0 handles layers 1–8, GPU 1 layers 9–16, etc., with micro-batches flowing through the pipeline. Expert parallelism (Mixture of Experts models like GPT-4) routes each token to different GPU-resident expert networks, requiring sparse all-to-all communication.",
    },
    {
      heading: "Speculative decoding — k tokens for the cost of 1",
      body: "Standard autoregressive decoding generates one token per full model forward pass. Each pass loads all model weights from HBM (~80 GB for a 40B model) — memory bandwidth is the bottleneck, not compute. Speculative decoding uses a small draft model (~7B params, runs 5–10× faster) to generate k candidate tokens. The full model then verifies all k in a single forward pass — same compute cost as generating 1 token normally, because the full model processes them in parallel. Accepted tokens count as k outputs. For predictable phrases ('The answer is'), the draft model is often correct 70–80% of the time, yielding a 2–4× effective speedup.",
    },
  ],

  "leaderboard": [
    {
      heading: "Redis sorted set internals — skip list + hash table",
      body: "Redis ZSET uses two data structures simultaneously. A skip list (O(log N) insert, delete, rank) maintains the sorted order — each node has multiple forward pointers at geometric levels, allowing searches to skip over large spans. A hash table (O(1) lookup) maps member → score for fast score retrieval. ZADD inserts into both. ZRANK traverses the skip list counting nodes before the target. ZRANGE navigates the skip list to return a range. ZINCRBY atomically increments a score in the hash table and repositions the node in the skip list — critical for concurrent score updates without races.",
    },
    {
      heading: "Sharding for 100 M+ concurrent players",
      body: "A single Redis instance handles ~100 K sorted-set operations/second. A global leaderboard with 100 M players needs horizontal sharding. Shard by league or region: each Redis instance owns one shard; application routing sends updates to the correct shard based on the player's league ID. For global ranking, use a two-level approach: each shard maintains a local top-1000; a coordinator merges local top lists into a global top list every 30 seconds. Exact rank for a random player requires querying all shards for their rank in that shard, summing partial ranks — acceptable for infrequent global rank lookups.",
    },
  ],

  "live-comments": [
    {
      heading: "Redis Pub/Sub vs Kafka — picking the right fan-out",
      body: "Redis Pub/Sub delivers messages to all current subscribers in ~1 ms with no persistence. For a 10 K viewer stream, the WS server fleet subscribes to the stream's channel and instantly delivers comments. At 500 K viewers (large Twitch event), Redis Pub/Sub becomes the bottleneck — the single broker must write to potentially thousands of WS server sockets. Kafka with stream_id as the partition key allows a consumer group of WS servers to consume in parallel. The trade-off: Kafka adds ~50 ms latency vs Redis's ~1 ms. Use Redis for < 50 K viewers; Kafka beyond that.",
    },
    {
      heading: "Thundering herd on reconnect",
      body: "When a popular live stream starts (or a WS server restarts), millions of clients may attempt to reconnect simultaneously. A naive server would accept all connections at once, overwhelming the backend. Mitigations: (1) Exponential backoff with jitter — clients wait a random delay before reconnecting, spreading the reconnect wave over seconds. (2) Connection rate limiting at the load balancer layer — accept at most N new WS connections per second per server. (3) Pre-scaled capacity: for known events (product launches, sports finals), pre-provision WS server capacity before the stream goes live based on expected audience size.",
    },
  ],

  // ── Layer 6: Data & Storage Core ─────────────────────────────────────────

  "youtube-mysql": [
    {
      heading: "Vitess architecture — VTGate and VTTablet",
      body: "Vitess inserts two components between application and MySQL. VTTablet runs alongside each MySQL instance, managing health, connection pooling, and row-based replication monitoring. VTGate is a stateless proxy that speaks the MySQL wire protocol — your application connects to VTGate as if it were a single MySQL server. VTGate inspects the SQL, determines which shards the query targets (based on the keyspace configuration, e.g., range-shard by video_id), and routes accordingly. Scatter queries (no shard key) are sent to all shards in parallel; results are merged before returning to the application.",
    },
    {
      heading: "Online schema migrations — zero downtime at scale",
      body: "ALTER TABLE on a 1-billion-row table in vanilla MySQL locks the entire table for hours, making it unusable in production. Vitess's Online Schema Change (OSC) creates a shadow table with the new schema, sets up row-based replication triggers to capture writes to both tables during migration, copies existing rows in small configurable batches (e.g., 1 000 rows/s to avoid overloading replicas), and then atomically renames tables. The application sees no downtime — writes continue throughout. This same pattern underpins GitHub's gh-ost and pt-online-schema-change.",
    },
  ],

  "live-presence": [
    {
      heading: "Heartbeat TTL — implicit offline detection",
      body: "The client sends a lightweight heartbeat to the presence server every 30 seconds via the existing WebSocket connection. The server executes SET presence:{user_id} 1 EX 60 in Redis — a key with 60-second expiry. If the client loses network, no more heartbeats arrive and the Redis key expires naturally after 60 seconds. No explicit disconnect handling needed. The 30-second heartbeat interval provides a two-miss grace period before declaring the user offline. Redis keyspace notifications can trigger a callback when the key expires, allowing the presence service to push an 'offline' event to subscribers immediately.",
    },
    {
      heading: "Lazy subscription fan-out",
      body: "When Alice comes online, all of her contacts should see 'Active now'. If Alice has 5 000 contacts and all are online, that's 5 000 delivery operations on every login — prohibitively expensive at scale. Lazy fan-out defers this: contacts only subscribe to Alice's presence when they open a conversation with her. The presence server maintains a subscription map (user → set of subscribers) per shard. On login, Alice's presence event is published only to her current subscriber set — typically a small fraction of total contacts. Non-subscribed contacts will fetch presence on-demand when they open the conversation.",
    },
  ],

  "uber-nearby": [
    {
      heading: "Geohash prefix lookup and the 9-cell trick",
      body: "A geohash is a base32 string encoding latitude/longitude as a space-filling Z-order curve. Longer strings represent smaller areas; shared prefixes represent parent regions. To find drivers within 1 km, compute the geohash of the rider's location at precision 5 (the cell is ~4.9 × 4.9 km at that level) and query all 9 cells: the center cell plus 8 neighbors. Querying only the center cell misses drivers just across a cell boundary — the 9-cell query avoids this edge case. Each cell query is a prefix scan on the Redis GEOHASH sorted set, returning all driver IDs in that cell.",
    },
    {
      heading: "H3 advantages over geohash",
      body: "Uber replaced geohash with H3 (Hexagonal Hierarchical Spatial Index) for supply-demand analytics. H3 cells are hexagonal, meaning all 6 neighbors are exactly equidistant from the center — no diagonal neighbor at √2 distance as in square grids. Resolution-9 hexagons cover ~0.1 km² with near-uniform area across latitudes (unlike geohash cells which distort at high latitudes). H3 cells at resolution N contain exactly 7 cells at resolution N+1, enabling clean multi-resolution hierarchical aggregation. The anti-meridian and poles are handled correctly, which geohash does not.",
    },
  ],

  "vector-db": [
    {
      heading: "HNSW — how the multi-layer graph search works",
      body: "HNSW builds a hierarchical graph. Layer 0 contains all vectors with short-range edges. Each successive layer contains a random subset of vectors with longer-range edges — like a road hierarchy (local streets → highways → motorways). To find the nearest neighbor of a query: start at the top layer's entry point, greedily navigate to the closest node, descend to the next layer at that node's position, repeat until layer 0. This exploits the small-world property: any two nodes are reachable in O(log N) hops. Construction assigns each new vector to layers using an exponential distribution — most vectors are only in layer 0, ensuring the upper layers stay sparse.",
    },
    {
      heading: "Recall vs speed — the tuning knobs",
      body: "HNSW has two key parameters: ef_construction (search depth during index build, higher = better index quality but slower build) and ef_search (candidate pool size during query, higher = better recall but slower query). With ef_search=200, you typically get 99% recall at ~1 ms latency for 1 M vectors on a CPU. With ef_search=10, recall drops to ~90% but latency is ~0.1 ms — useful for recommendation systems where approximate results are acceptable. For RAG (Retrieval-Augmented Generation), 95%+ recall is effectively indistinguishable from exact in practice because the LLM is forgiving of slightly suboptimal context.",
    },
    {
      heading: "RAG pipeline — chunking, embedding, retrieval",
      body: "Offline indexing: chunk documents into ~500-token segments with 50-token overlap (to avoid splitting key context at boundaries), embed each chunk with a model like text-embedding-3-large (1536 dims), upsert into the vector DB. Online retrieval: embed the user query with the same model, run top-K ANN search (K=5–20), optionally re-rank results with a cross-encoder (higher precision, slower), inject retrieved chunks into the LLM context as 'Here is relevant context: …'. Key tuning: chunk size (smaller = more precise but may miss multi-paragraph context), K (larger = better recall, longer prompt, higher cost), and re-ranker threshold (cut low-scoring chunks before sending to LLM).",
    },
  ],

  "lyft": [
    {
      heading: "Ride state machine and event-driven architecture",
      body: "Every ride is a finite-state machine: REQUESTED → ACCEPTED → ARRIVED → IN_PROGRESS → COMPLETED (with CANCELLED possible at multiple transitions). Each state transition is an event published to Kafka. Downstream services consume these events independently: the billing service authorises the card on ACCEPTED; the notifications service sends 'driver arriving' on ARRIVED; the analytics service records trip start on IN_PROGRESS. This event-driven approach decouples services — adding a new downstream action (e.g., loyalty points) requires only a new consumer, not modifying the core ride service.",
    },
    {
      heading: "Deferred payment capture — authorise then capture",
      body: "Lyft separates the credit card authorisation (on trip request) from the capture (on trip completion). Authorisation verifies the card is valid and reserves the estimated fare amount. The actual charge is captured only after completion, when the exact fare based on distance and time is known. If the trip is cancelled, the authorisation is released (reversed) without any funds movement. Authorisations expire automatically (typically 7 days) if never captured — handling edge cases like app crashes mid-trip. This deferred model also enables tip prompts after completion before the final amount is captured.",
    },
  ],

  // ── Layer 7: Foundations ──────────────────────────────────────────────────

  "rate-limiter": [
    {
      heading: "Token Bucket vs Sliding Window — when to use each",
      body: "Token Bucket refills at a fixed rate; each request consumes one token. It allows bursts up to the bucket capacity — a client that was idle for 10 seconds can make 10 requests instantly. This is ideal for APIs where occasional bursts are acceptable. Sliding Window Log stores a Redis sorted set of request timestamps; on each request, old entries outside the window are pruned and the count checked. It is perfectly accurate but O(window_size) in memory. Sliding Window Counter is a compromise: track counts in two adjacent fixed windows and weight-interpolate for the current window boundary — O(1) space with ~1% inaccuracy at window edges, acceptable for most rate limiting.",
    },
    {
      heading: "Distributed rate limiting with Redis Lua scripts",
      body: "On a single server, INCR + EXPIRE is atomic. Across multiple app servers, a race exists: two servers read count=9, both increment, result is 11 exceeding limit=10. The fix: use a Redis Lua script that reads and increments atomically on the Redis server itself — Lua scripts execute as a single unit with no interleaving. Example: EVAL 'local c = redis.call(\"incr\", KEYS[1]); if c == 1 then redis.call(\"expire\", KEYS[1], ARGV[1]) end; return c' 1 rate:{user} 60. The Lua script guarantees the check-and-increment is atomic regardless of how many app servers are running.",
    },
    {
      heading: "Client-side handling of 429 — exponential backoff with jitter",
      body: "A rate-limited response should include Retry-After (seconds until retry), X-RateLimit-Limit, X-RateLimit-Remaining, and X-RateLimit-Reset headers. On the client side, naive retry (all clients retry at the same instant when the window resets) creates a thundering herd — all rate-limited clients hammer the server simultaneously. Exponential backoff with jitter solves this: wait_time = min(cap, base × 2^attempt + random_jitter). The random jitter (0–2 s) spreads retries across the reset window, preventing the synchronized burst. AWS SDKs, Stripe clients, and most production HTTP clients implement this pattern by default.",
    },
  ],

  "consistent-hashing": [
    {
      heading: "The ring and why adding a node remaps only 1/N keys",
      body: "Hash the node name to a position on a 0..2³² ring. A key maps to the first node clockwise from its hash. With 3 nodes at positions 100, 200, 300 on a 360-unit ring, adding a node at position 150 only affects keys that were previously routed to the node at 200 (those between 100 and 200). All other keys are unaffected. In general, adding one node remaps approximately 1/N of all keys, compared to modular hashing (key % N) where almost all keys remap when N changes — causing a thundering herd to the database as the cache is effectively wiped.",
    },
    {
      heading: "Virtual nodes — fixing uneven distribution",
      body: "Without virtual nodes, actual node positions on the ring follow a Poisson distribution — some nodes cover 3× more of the ring than others due to random hash clustering. This creates hot spots. Virtual nodes (vnodes) assign each physical node K=150 random positions on the ring. Keys are distributed uniformly across the K×N virtual node positions, averaging out hot spots. Adding a physical node now takes a proportional share of keys from all existing nodes (not just the clockwise neighbor). Cassandra defaults to 256 vnodes per physical node; the slight routing overhead (finding the correct vnode) is negligible compared to the load-balancing benefit.",
    },
    {
      heading: "Failure handling and replication on the ring",
      body: "In Cassandra, data is replicated to the next RF-1 nodes clockwise from the primary node. If node B fails, its data is still available on nodes C and D (for RF=3). The cluster coordinator (any node handling the request) detects the failure via gossip protocol and reads from the available replicas. Hinted handoff: while B is down, writes destined for B are stored as 'hints' on the next healthy node. When B recovers, hints are replayed to bring it back in sync. Anti-entropy repair (using Merkle tree comparison) periodically reconciles any diverged replicas to ensure eventual consistency.",
    },
  ],

  "cap-theorem": [
    {
      heading: "Why Partition Tolerance is non-negotiable",
      body: "A network partition means some messages between nodes are lost or delayed. In any multi-machine system, network partitions are not a theoretical concern — switches fail, cables are cut, datacenter links saturate. You cannot build a distributed system that is immune to partitions without reducing it to a single machine. Therefore every distributed system must be Partition Tolerant — the real choice is what the system does during a partition: stop accepting writes and return errors (CP) to preserve consistency, or continue accepting writes at the risk of serving stale or diverging data (AP) to preserve availability.",
    },
    {
      heading: "PACELC — consistency vs latency even without partitions",
      body: "CAP only describes behaviour during partitions. PACELC extends it: even when the network is healthy (Else case), there is a trade-off between Latency and Consistency. Achieving strong consistency requires synchronous replication — the write is not confirmed until the slowest replica acknowledges it, adding the replica write roundtrip to every operation latency. DynamoDB offers both: eventual consistency (low latency, AP) and strongly-consistent reads (higher latency, CP) selectable per request. Google Spanner achieves external consistency by using TrueTime hardware clocks — it waits out the clock uncertainty window (~7 ms) to guarantee global commit ordering.",
    },
    {
      heading: "Quorum formula — tunable consistency in Cassandra",
      body: "With replication factor N, you can tune reads (R replicas) and writes (W replicas) per operation. Strong consistency requires R + W > N. For N=3: QUORUM (R=2, W=2) gives R+W=4 > 3 — any replica that served the write will also serve the read. ONE (R=1) + ALL (W=3) also satisfies R+W > N. The lowest latency with eventual consistency is ONE + ONE (R+W=2 ≤ 3). Cassandra exposes these as consistency levels per query. IoT telemetry typically uses ONE for high write throughput; financial transactions use QUORUM or LOCAL_QUORUM for correctness. There is no universal answer — the right level depends on your data's staleness tolerance.",
    },
  ],

  "caching": [
    {
      heading: "Cache-aside — lazy population and cold starts",
      body: "The application checks the cache; on a miss, it fetches from the DB, writes to the cache, and returns the result. Only frequently read data ever enters the cache — hot data auto-populates, cold data never wastes cache memory. The weakness: after a deployment or cache flush, the cache is empty (cold). Every request misses and hits the DB, which may be overwhelmed if traffic is high. Mitigations: (1) Pre-warm the cache with a batch job reading the top-N most popular keys before cutover. (2) Blue-green deployment with cache pre-warming — new servers warm their local caches before receiving traffic. (3) Request coalescing — deduplicate concurrent DB fetches for the same cold key.",
    },
    {
      heading: "Cache stampede — probabilistic early expiry",
      body: "When a hot key expires, thousands of simultaneous requests all miss the cache and rush to the DB simultaneously. Mutex-based solutions (lock the key, one request rebuilds, others wait) reduce DB load but add latency. Probabilistic early expiry (XFetch algorithm) is lock-free: each request computes a random re-fetch probability that increases as the key approaches its TTL. A request that 'wins' the probabilistic check rebuilds the cache slightly before expiry, before the thundering herd forms. Formally: refetch if current_time - last_fetch_time > TTL - β × ln(random()), where β is tuned to the rebuild time.",
    },
    {
      heading: "Write-behind — absorbing write bursts at the cost of durability",
      body: "Write-behind (write-back) caching accepts writes to the cache immediately and acknowledges the client, then asynchronously persists to the database. This decouples the client from DB write latency — critical for workloads like gaming leaderboards or social counters that generate millions of small writes per second. Risk: if the cache server crashes before async flush, the writes are lost. Mitigations: (1) Write-ahead log in the cache tier — each write is logged to durable storage before acknowledgement. (2) Multiple in-memory replicas with synchronous replication before acknowledgement. This is exactly how NVMe SSDs work — a supercapacitor-backed DRAM write buffer absorbs writes and persists to NAND flash asynchronously.",
    },
  ],

  "db-indexing": [
    {
      heading: "B-Tree vs LSM-Tree — the fundamental read/write trade-off",
      body: "B-Tree updates data in-place: a write navigates the tree to the leaf page and updates it directly, requiring random disk I/O. B-Trees are optimised for reads (O(log N)) and suited for OLTP workloads with mixed reads and writes. LSM-Trees (Log-Structured Merge) convert all writes to sequential I/O: writes first go to an in-memory MemTable; when full, it flushes to an immutable SSTable on disk. Reads must check the MemTable and all SSTables, mitigated by Bloom filters (O(1) probabilistic membership check). LSM-Trees provide 10–100× better write throughput but require periodic compaction — merging SSTables — that causes write amplification (the same bytes written multiple times).",
    },
    {
      heading: "Index selectivity and the query planner",
      body: "The query planner decides whether to use an index based on the estimated fraction of rows it would return (selectivity). An index on a boolean column (is_active: T/F, ~50% true) has low selectivity — a full table scan with sequential I/O is often faster than the random-I/O index-to-heap lookups. An index on email (unique, 100% selective) is always used. The planner uses column statistics (histograms of value distribution, computed by ANALYZE / VACUUM ANALYZE) to estimate selectivity. Stale statistics cause bad query plans — ANALYZE should run automatically or after bulk inserts that significantly change data distribution.",
    },
    {
      heading: "Covering indexes — eliminating heap fetches",
      body: "A covering index includes all columns referenced in a query, allowing the DB to answer entirely from the index without touching the table heap. Example: SELECT user_id, email FROM users WHERE created_at > '2024-01-01'. Without a covering index, the planner scans the created_at index, then fetches each matching row from the heap (random I/O per row). With INDEX(created_at, user_id, email), the index contains all needed columns — zero heap fetches. For queries scanning millions of rows (analytics, reporting), covering indexes reduce I/O by 10–100×. Cost: the index is larger and slower to update. Only add covering indexes for the hottest, most critical query patterns.",
    },
  ],
};
