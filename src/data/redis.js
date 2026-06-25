export const REDIS_HLD = {
  title: "Redis — High Level Design",
  subtitle: "How Redis delivers sub-millisecond latency as an in-memory data structure server",

  overview: `Redis (Remote Dictionary Server) is an open-source, in-memory data structure store used as a database, cache, message broker, and streaming engine. It powers session stores, leaderboards, rate limiters, real-time analytics, and pub/sub systems at companies like Twitter, GitHub, Snapchat, and Airbnb.

Three design decisions that define everything:
1. Everything in RAM — data lives in memory, not on disk. This is why Redis is 10–100× faster than disk-based databases. Persistence (RDB snapshots, AOF logs) is a background concern, not the critical path.
2. Single-threaded event loop — one thread handles all commands sequentially. No locks, no deadlocks, no context switching on the hot path. This is why Redis throughput is predictable and why long-running commands (KEYS, SMEMBERS on huge sets) are dangerous.
3. Rich data structures — not just key-value. Strings, Hashes, Lists, Sets, Sorted Sets, Streams, HyperLogLog, Bitmaps. Each structure has O(1) or O(log n) operations, making Redis a Swiss Army knife for real-time problems.`,

  diagram: `
┌─────────────────────────────────────────────────────────────────────────┐
│                             CLIENTS                                     │
│          Application Servers · Redis CLI · SDK (Go/Java/Python)         │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │  TCP (RESP protocol)
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      REDIS SERVER PROCESS                               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              SINGLE-THREADED EVENT LOOP (epoll)                 │   │
│  │  Accept → Parse RESP → Execute Command → Send Response          │   │
│  └────────────────────────────┬────────────────────────────────────┘   │
│                               │                                         │
│  ┌────────────────────────────▼────────────────────────────────────┐   │
│  │                    IN-MEMORY DATA STORE                         │   │
│  │  String  Hash  List  Set  Sorted Set  Stream  HLL  Bitmap       │   │
│  │              (all backed by optimized C structures)             │   │
│  └────────────────────────────┬────────────────────────────────────┘   │
│                               │                                         │
│  ┌──────────────┐  ┌──────────▼───────┐  ┌──────────────────────────┐ │
│  │  TTL / Expiry│  │   Persistence    │  │  Pub/Sub & Streams       │ │
│  │  (lazy +     │  │  RDB Snapshot    │  │  Channels · Consumer     │ │
│  │   periodic)  │  │  AOF Log         │  │  Groups · XADD/XREAD     │ │
│  └──────────────┘  └──────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────────────┐
│   REPLICATION    │ │    SENTINEL       │ │        REDIS CLUSTER         │
│                  │ │                  │ │                              │
│  Primary         │ │  Monitor health  │ │  16384 hash slots split      │
│     │            │ │  Auto-failover   │ │  across N primary nodes      │
│  Replica 1       │ │  Notify clients  │ │  Each primary has replicas   │
│  Replica 2       │ │  of new primary  │ │  Gossip protocol (PING/PONG) │
└──────────────────┘ └──────────────────┘ └──────────────────────────────┘`,

  metrics: [
    { label: "Latency (p99)", value: "< 1ms for GET/SET on a single instance" },
    { label: "Throughput", value: "100,000+ ops/sec on a single core; millions with cluster" },
    { label: "Data types", value: "10+ (String, Hash, List, Set, Sorted Set, Stream, HLL, Bitmap, Geo, JSON)" },
    { label: "Max key size", value: "512 MB (strings and values too)" },
    { label: "Persistence", value: "RDB (point-in-time snapshot) + AOF (append-only log)" },
    { label: "Replication lag", value: "< 10ms (async by default; WAIT command for sync)" },
    { label: "Cluster max nodes", value: "1000 nodes (recommended < 100 for ops simplicity)" },
    { label: "Hash slots", value: "16384 (fixed, distributed across cluster nodes)" },
    { label: "Expiry precision", value: "Millisecond-level TTL with PEXPIRE" },
  ],

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Data Structures & Core Commands",
      sections: [
        {
          title: "The Seven Core Data Types — Choosing the Right One",
          content: `Redis is not just a key-value store. Each data type has O(1) or O(log n) operations and maps directly to real-world problems.

STRING — binary-safe, up to 512 MB
  Use for: counters, session tokens, feature flags, simple caches
  Commands: GET, SET, INCR, DECR, APPEND, GETSET, SETNX
  Example: rate limiting counter — INCR user:123:requests → atomic increment, no race condition

HASH — field-value pairs inside a key (like a row in a table)
  Use for: user profile, product metadata, config objects
  Commands: HGET, HSET, HMGET, HDEL, HGETALL, HINCRBY
  Example: HSET user:123 name "Alice" age 30 city "NY" — fetch single field without deserializing entire object

LIST — doubly-linked list, ordered insertion
  Use for: message queues, activity feeds, recent items
  Commands: LPUSH, RPUSH, LPOP, RPOP, LRANGE, BLPOP (blocking pop)
  Example: LPUSH feed:user:123 post_id → prepend; LRANGE feed:user:123 0 49 → last 50 posts

SET — unordered collection of unique strings
  Use for: unique visitors, tag systems, friend lists
  Commands: SADD, SREM, SMEMBERS, SINTER, SUNION, SDIFF, SISMEMBER
  Example: SINTER friends:alice friends:bob → mutual friends in O(min(|A|,|B|)) time

SORTED SET (ZSET) — set with a float score per member, ordered by score
  Use for: leaderboards, priority queues, time-series indexes
  Commands: ZADD, ZRANGE, ZRANGEBYSCORE, ZRANK, ZINCRBY, ZREVRANGE
  Example: ZADD leaderboard 9500 "player:alice" — ZRANGE leaderboard 0 9 REV → top 10

STREAM — append-only log with consumer groups
  Use for: event sourcing, message broker, audit logs
  Commands: XADD, XREAD, XREADGROUP, XACK, XLEN, XRANGE
  Example: XADD events:orders * order_id 456 status PLACED → auto-generated ID "1720000000000-0"

HYPERLOGLOG — probabilistic cardinality estimator (12 KB regardless of set size)
  Use for: unique visitor count, distinct query count
  Commands: PFADD, PFCOUNT, PFMERGE
  Example: PFCOUNT page:home → approximate unique visitors with ±0.81% error`,
        },
        {
          title: "Back-of-the-Envelope Estimation",
          content: `Before designing a Redis topology, establish scale numbers — each decision maps to a component.

ASSUMPTIONS (session store + leaderboard for a mid-size product):
• 10 million active users
• Average session object: 2 KB (user ID, auth token, preferences)
• Session TTL: 24 hours
• Leaderboard: 1 million players, score updated on every game end
• Write throughput: 10,000 session writes/sec + 5,000 leaderboard updates/sec
• Read throughput: 100,000 reads/sec (10× write ratio, cache-heavy)
• Redis single-node throughput: ~100,000 ops/sec (conservative estimate)

1. Memory for sessions
   10M users × 2 KB = 20 GB RAM just for sessions
   → Exceeds a single comfortable Redis instance (recommend < 25 GB per node for replication lag)
   → Justifies either a large instance (r6g.2xlarge, 64 GB) or a cluster with 3+ shards

2. Memory for leaderboard
   1M players × ZSET entry (~80 bytes: score + member string + pointer) ≈ 80 MB
   → Fits comfortably in a single instance alongside sessions

3. Write throughput check
   15,000 writes/sec is well under 100,000 ops/sec single-node limit
   → Single primary can handle writes; replicas serve reads

4. Read throughput check
   100,000 reads/sec ≈ single-node limit (but actual Redis benchmarks 200–500K ops/sec)
   → Single primary + 2 replicas with read routing handles comfortably

5. Persistence overhead (AOF fsync)
   15,000 writes/sec with AOF everysec policy: one fsync per second batches all writes
   → < 1ms latency impact; AOF file grows ~15,000 × avg-entry-size ≈ ~1 MB/sec
   → AOF rewrite needed every ~1 GB (every ~17 minutes) — schedule during off-peak

Interview punch line: 20 GB session RAM → justifies instance sizing;
100K reads/sec → justifies replicas for read scaling;
1 MB/sec AOF → justifies rewrite schedule; 80 MB ZSET → trivial, no sharding needed.`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Persistence — RDB & AOF",
      sections: [
        {
          title: "RDB Snapshots — Point-in-Time Backups",
          content: `RDB (Redis Database) is a compact, binary snapshot of the entire in-memory dataset at a point in time.

How it works:
  Redis forks the server process (copy-on-write). The child process writes all in-memory data to a temporary file, then atomically replaces the old dump.rdb. The parent process continues serving traffic uninterrupted.

Configuration (redis.conf):
  save 900 1       # save if at least 1 key changed in 900 seconds
  save 300 10      # save if at least 10 keys changed in 300 seconds
  save 60 10000    # save if at least 10,000 keys changed in 60 seconds

Pros:
• Compact binary file — fast to load on restart (seconds vs. minutes for AOF replay)
• No performance impact on the parent process (fork + copy-on-write)
• Ideal for disaster recovery backups (ship dump.rdb to S3 every hour)

Cons:
• Data loss window = time since last snapshot (up to 15 minutes by default)
• Fork is expensive at large memory sizes: forking a 50 GB Redis takes ~1–2 seconds of elevated latency (copy-on-write page table duplication). Schedule saves during low-traffic windows.
• Not suitable when you can't afford to lose any writes (use AOF instead)

When to use RDB only:
  Caches where data can be rebuilt from the source of truth. The latency of a fork is acceptable and RPO of minutes is fine.`,
        },
        {
          title: "AOF — Append-Only File for Durability",
          content: `AOF (Append-Only File) logs every write command Redis executes, in order. On restart, Redis replays the AOF to rebuild state.

fsync policies (the durability vs. performance knob):
  appendfsync no         → OS decides when to flush (fastest, can lose up to 30s of writes)
  appendfsync everysec   → fsync every second (recommended: lose at most 1 second of writes)
  appendfsync always     → fsync after every command (fully durable, ~10× slower writes)

AOF rewrite (compaction):
  Over time, AOF contains redundant commands: SET x 1, SET x 2, SET x 3. Only the final state matters.
  Redis rewrites AOF in the background: forks a child, generates a minimal AOF from current in-memory state, atomically swaps in the new file. No data loss — writes during rewrite go to a rewrite buffer.
  Trigger: auto-aof-rewrite-percentage 100 (rewrite when AOF doubles in size vs. last rewrite)

Hybrid persistence (recommended for production):
  rdbchecklsum yes + AOF enabled
  Redis 7+: RDB snapshot embedded at the start of AOF file (aof-use-rdb-preamble yes)
  Restart: load the embedded RDB (fast), then replay only AOF entries since the snapshot (few seconds).
  This gives you both fast restarts (RDB benefit) and low data loss (AOF benefit).

RPO summary:
  No persistence:  0 seconds data loss guarantee but all data lost on restart
  RDB only:        5–15 minutes data loss (configurable)
  AOF everysec:    ~1 second data loss
  AOF always:      0 data loss (but 10× write cost — rarely used)`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Replication, Sentinel & High Availability",
      sections: [
        {
          title: "Primary-Replica Replication",
          content: `Redis replication is asynchronous by default: the primary ACKs the client immediately after writing to its in-memory store, then propagates the command to replicas in the background.

Initial sync (full resync):
  1. Replica connects to primary and sends PSYNC.
  2. Primary forks, generates RDB snapshot, sends it to replica.
  3. During RDB transfer, primary buffers incoming writes in the replication buffer.
  4. Replica loads RDB, then applies the buffered commands to catch up.
  5. From this point, replication is incremental (streaming command log).

Incremental resync (partial resync):
  If a replica briefly disconnects and reconnects, it sends its replication offset.
  Primary checks if that offset is still in its replication backlog (configurable ring buffer, default 1 MB).
  If yes: send only the missed commands (no full RDB needed).
  If no (offset too old, ring buffer overflowed): full resync.

Replication lag:
  Async: replica may lag by 1–100ms depending on network and write rate.
  To check: INFO replication → lag in seconds per replica.
  For stricter durability: WAIT numreplicas timeout — blocks until N replicas acknowledge.

Read scaling with replicas:
  Route read-only queries to replicas (replica-read-only yes, default).
  Client-side: use a connection pool that round-robins across replicas.
  Caveat: reads from replicas may return stale data (lag). Use primary for read-your-own-writes.`,
        },
        {
          title: "Redis Sentinel — Automatic Failover",
          content: `Sentinel is a distributed system of monitoring processes that provide automatic failover for a Redis primary-replica setup.

What Sentinel does:
  1. Monitoring: each Sentinel pings the primary every second.
  2. Notification: if primary is unreachable, Sentinel notifies clients.
  3. Automatic failover: if the primary is down, Sentinel elects a new primary from the replicas.
  4. Configuration provider: clients ask Sentinel for the current primary address (Sentinel is the service discovery layer).

Failover process:
  1. Sentinel A can't reach the primary → marks it as "subjectively down" (SDOWN).
  2. Sentinel A asks other Sentinels — if a quorum (e.g., 2 of 3) agree → "objectively down" (ODOWN).
  3. The Sentinels elect a leader Sentinel among themselves (Raft-based).
  4. Leader Sentinel picks the best replica (least replication lag, highest priority).
  5. Leader sends REPLICAOF NO ONE to the chosen replica → it becomes the new primary.
  6. Other replicas are reconfigured to replicate from the new primary.
  7. Sentinel notifies clients of the new primary address via PUBLISH channel.

Client impact: ~10–30 seconds of elevated latency during failover (Sentinel detection timeout = 30s default).
Set sentinel down-after-milliseconds 5000 to detect faster (tradeoff: more false positives from network blips).

Minimum Sentinel deployment: 3 Sentinels on separate machines (requires 2 to agree for ODOWN). Never 2 Sentinels — split-brain risk.`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Redis Cluster — Horizontal Scaling",
      sections: [
        {
          title: "Hash Slots — How Cluster Partitions Data",
          content: `Redis Cluster divides the key space into 16,384 hash slots. Each primary node owns a contiguous range of slots. A key belongs to slot = CRC16(key) % 16384.

Example with 3 primary nodes:
  Node A: slots 0–5460
  Node B: slots 5461–10922
  Node C: slots 10923–16383

Hash tags — grouping related keys on the same node:
  Problem: a MGET spanning multiple nodes fails in cluster mode (no cross-slot operations).
  Solution: hash tags — only the part inside {} is hashed.
  user:{123}:session and user:{123}:profile → same slot (hash of "123") → same node.
  order:{456}:items and order:{456}:total → same slot → can MGET or use MULTI/EXEC together.

Cluster topology and resharding:
  CLUSTER ADDSLOTS / CLUSTER RESHARD moves slots between nodes with zero downtime.
  During migration, keys are served from the source node until fully moved.
  Clients get MOVED redirects (permanent) or ASK redirects (mid-migration) and retry.

Gossip protocol:
  Nodes exchange heartbeat messages (PING/PONG) every second.
  Each PING carries info about a random subset of other nodes (cluster state propagates quickly).
  Node failure detected: a node is marked as PFAIL by one node, FAIL by a quorum of nodes.
  Replica promotion: when a primary fails, its replicas hold an election (vote from other primaries), and the winner becomes the new primary.

Cluster limitations:
  • Multi-key commands only work if all keys share the same hash slot (use hash tags).
  • Transactions (MULTI/EXEC) limited to single slot.
  • Pub/Sub messages don't fan out across cluster nodes automatically.`,
        },
        {
          title: "Service Mesh Around Redis — Traffic Policy",
          content: `Redis itself is a single process — you can't inject a sidecar inside it. But the services that call Redis benefit from mesh-level retry and circuit-breaking.

Why a mesh around Redis matters:
  Redis can become temporarily unavailable during failover (Sentinel: ~30s; Cluster: ~10s).
  Without a mesh: every calling service implements its own retry-with-backoff, with different bugs.
  With a mesh: one DestinationRule defines the retry policy for ALL services calling Redis.

Practical mesh setup:
  ServiceEntry: register Redis endpoint as MESH_EXTERNAL (or in-cluster if self-managed).
  DestinationRule: circuit break after 3 consecutive connection errors in 10s (eject for 30s).
  VirtualService: retry once on TCP connect failure with 50ms timeout.
  mTLS (PeerAuthentication STRICT): secure traffic between your microservices calling Redis.

What the mesh CANNOT fix:
  Cache stampede (many services miss cache simultaneously, all hit the DB): use probabilistic early expiry or a Redis lock (SETNX) to let only one service refill the cache.
  Data loss during AOF rewrite: a mesh sidecar can't see inside Redis's persistence layer.
  Hot key: all traffic to one key goes to one Redis node — mesh routing doesn't help; you need application-level key sharding or a local in-process cache.

Trade-offs:
  Adds ~1ms per hop. For Redis (< 1ms latency), this is significant — test under load.
  Service mesh retries on Redis can amplify load during degradation; set low retry counts (1–2) with short timeouts.`,
        },
      ],
    },
  ],
};

export const REDIS_LLD = {
  title: "Redis — Low Level Design",
  subtitle: "Internal data structures, command internals, patterns, and Go implementation",

  components: [
    {
      id: "data-encoding",
      title: "Internal Encodings",
      description: "How Redis represents data types internally to minimize memory",
      api: `// Redis automatically switches encoding based on size/value thresholds
// These are transparent to the client — same commands work regardless of encoding

// STRING encoding
// int:    if value is an integer fitting in long → INCR/DECR are O(1) add
// embstr: if value <= 44 bytes → single allocation (string + robj in one malloc)
// raw:    if value > 44 bytes → two allocations (robj + SDS string)
127.0.0.1:6379> SET counter 42
127.0.0.1:6379> OBJECT ENCODING counter   → "int"
127.0.0.1:6379> SET name "Alice"
127.0.0.1:6379> OBJECT ENCODING name      → "embstr"
127.0.0.1:6379> SET bio "Alice is a..."   # > 44 bytes
127.0.0.1:6379> OBJECT ENCODING bio       → "raw"

// HASH encoding (hash-max-listpack-entries 128, hash-max-listpack-value 64)
// listpack (compact): used when field count <= 128 AND each value <= 64 bytes
//   → fields stored sequentially in memory; iteration is cache-friendly
// hashtable: used when above thresholds exceeded
127.0.0.1:6379> HSET user:1 name "Alice"
127.0.0.1:6379> OBJECT ENCODING user:1    → "listpack"  (small hash)
// after adding many fields:
127.0.0.1:6379> OBJECT ENCODING user:1    → "hashtable" (large hash)

// SORTED SET encoding (zset-max-listpack-entries 128, zset-max-listpack-value 64)
// listpack: when entries <= 128 AND each element <= 64 bytes
// skiplist + hashtable: otherwise
//   skiplist provides O(log n) ZADD, ZRANK, ZRANGE by score
//   hashtable provides O(1) ZSCORE (member → score lookup)
127.0.0.1:6379> ZADD leaderboard 9500 "alice"
127.0.0.1:6379> OBJECT ENCODING leaderboard → "listpack" (few members)
// after 200 members:
127.0.0.1:6379> OBJECT ENCODING leaderboard → "skiplist"`,

      internals: `SDS — Simple Dynamic String (replaces C strings in Redis):

  struct sdshdr64 {
    uint64_t len;      // actual string length (O(1) STRLEN)
    uint64_t alloc;    // allocated capacity (no realloc on every append)
    char     flags;    // encoding type
    char     buf[];    // actual bytes + null terminator
  }

  Why not C strings?
  • Binary-safe: can store \0 bytes inside a string (C strings can't)
  • O(1) length (stored in header, not computed by scanning for \0)
  • Append: if len < alloc, no malloc — just write into existing buffer

Skip list (sorted set backbone):
  Levels: each node has a random number of forward pointers (1 to 32)
  Probability: each level is added with p=0.25 (Redis default)
  Expected levels: 1/p = 4 levels on average
  Expected nodes examined per ZRANGE: O(log n) nodes, O(k) outputs

  struct zskiplistNode {
    sds  ele;          // member string
    double score;      // sort key
    struct zskiplistNode *backward; // doubly-linked for reverse range
    struct zskiplistLevel {
      struct zskiplistNode *forward;
      unsigned long span;  // number of nodes skipped — enables O(log n) ZRANK
    } level[];
  }

Expiry implementation (TTL):
  Redis maintains a separate hash table: key → expiry timestamp (Unix ms).
  Lazy expiry: when a key is accessed, check if expired → delete and return nil.
  Active expiry (background): every 100ms, sample 20 random keys with TTL.
    If > 25% of sampled keys are expired, repeat immediately (adaptive rate).
    This bounds memory usage from expired keys without a full scan.
  Memory impact: expired-but-not-yet-evicted keys consume memory. Large TTL sets
  with skewed access patterns (cold keys never accessed) → use active expiry tuning.`,
    },
    {
      id: "patterns",
      title: "Common Redis Patterns",
      description: "Rate limiting, distributed locks, caching, leaderboards — with Go code",
      api: `// ── Pattern 1: Rate Limiting (Sliding Window Counter) ──────────────────────
// Goal: allow at most 100 requests per user per 60 seconds

func isRateLimited(ctx context.Context, rdb *redis.Client, userID string) (bool, error) {
    key := fmt.Sprintf("rl:%s", userID)
    now := time.Now().UnixMilli()
    windowStart := now - 60_000 // 60 seconds ago

    pipe := rdb.Pipeline()
    // Remove requests older than the window
    pipe.ZRemRangeByScore(ctx, key, "0", strconv.FormatInt(windowStart, 10))
    // Count requests in the current window
    countCmd := pipe.ZCard(ctx, key)
    // Add current request with timestamp as score
    pipe.ZAdd(ctx, key, redis.Z{Score: float64(now), Member: now})
    // Set TTL so key auto-expires (no cleanup needed)
    pipe.Expire(ctx, key, 70*time.Second)
    _, err := pipe.Exec(ctx)
    if err != nil { return false, err }

    return countCmd.Val() >= 100, nil // true = rate limited
}

// ── Pattern 2: Distributed Lock (Redlock — single node simplified) ──────────
// Goal: only one server runs a cron job at a time

func acquireLock(ctx context.Context, rdb *redis.Client, lockKey, token string, ttl time.Duration) (bool, error) {
    // SET key token NX PX ttl — atomic: only set if key does NOT exist
    ok, err := rdb.SetNX(ctx, lockKey, token, ttl).Result()
    return ok, err
}

func releaseLock(ctx context.Context, rdb *redis.Client, lockKey, token string) error {
    // Lua script: only delete if the value matches our token (atomic check-and-delete)
    script := redis.NewScript(\`
        if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
        else
            return 0
        end
    \`)
    return script.Run(ctx, rdb, []string{lockKey}, token).Err()
}

// ── Pattern 3: Cache-Aside Pattern ──────────────────────────────────────────
func getUser(ctx context.Context, rdb *redis.Client, db *sql.DB, userID string) (*User, error) {
    key := "user:" + userID
    // Try cache first
    val, err := rdb.Get(ctx, key).Bytes()
    if err == nil {
        var u User
        json.Unmarshal(val, &u)
        return &u, nil
    }
    // Cache miss: load from DB
    u := loadFromDB(db, userID)
    // Write to cache with TTL
    data, _ := json.Marshal(u)
    rdb.Set(ctx, key, data, 5*time.Minute)
    return u, nil
}

// ── Pattern 4: Leaderboard (Sorted Set) ─────────────────────────────────────
func updateScore(ctx context.Context, rdb *redis.Client, playerID string, delta float64) error {
    return rdb.ZIncrBy(ctx, "leaderboard:global", delta, playerID).Err()
}

func getTopN(ctx context.Context, rdb *redis.Client, n int) ([]redis.Z, error) {
    return rdb.ZRevRangeWithScores(ctx, "leaderboard:global", 0, int64(n-1)).Result()
}

func getRank(ctx context.Context, rdb *redis.Client, playerID string) (int64, error) {
    rank, err := rdb.ZRevRank(ctx, "leaderboard:global", playerID).Result()
    return rank + 1, err // 1-indexed rank
}`,

      internals: `Pipeline vs. Transaction vs. Lua Script:

  PIPELINE (not atomic):
    Groups multiple commands into one TCP round trip.
    Server executes them in order but not atomically — other clients can interleave.
    Use for: bulk reads/writes where atomicity is NOT required.
    Speedup: 10,000 GETs in one pipeline vs. 10,000 round trips = 10–100× faster.

  MULTI/EXEC (optimistic transaction):
    MULTI queues commands; EXEC executes them atomically.
    WATCH key: if key is modified between WATCH and EXEC, EXEC returns nil (abort).
    Not "ACID" transactions — no rollback if one command fails, others still execute.
    Use for: read-modify-write sequences (check-then-set) on a single Redis node.

    WATCH user:123:balance
    val = GET user:123:balance
    if val < amount: abort
    MULTI
      DECRBY user:123:balance amount
      INCRBY merchant:456:balance amount
    EXEC   → nil if balance was touched since WATCH (retry)

  LUA SCRIPT (truly atomic, general-purpose):
    Redis executes the entire script atomically in the event loop.
    No other client command runs until the script finishes.
    Use for: complex conditional logic that must be atomic (e.g., rate limiter, lock release).
    Caution: a slow Lua script blocks ALL Redis clients — keep scripts short.
    Scripts are cached by SHA1: SCRIPT LOAD → EVALSHA avoids re-sending script bytes.

  When to pick which:
    • Multiple reads, no write: PIPELINE
    • Simple read-modify-write: WATCH/MULTI/EXEC
    • Complex atomic logic: LUA SCRIPT
    • Just want latency reduction: PIPELINE`,
    },
    {
      id: "streams",
      title: "Redis Streams — Event Log",
      description: "XADD, consumer groups, exactly-once-style processing",
      api: `// Redis Streams — persistent, append-only log with consumer groups
// Think: lightweight Kafka inside Redis

// Producer: append events
XADD events:orders * order_id 456 user_id 123 total 2499 status PLACED
// Returns: "1720000000000-0" (millisecond timestamp + sequence)

// Consumer group: multiple consumers share the workload
XGROUP CREATE events:orders order-processor $ MKSTREAM
// $ = start reading new messages only; 0 = read from beginning

// Consumer reads messages (non-destructive — message stays in stream)
XREADGROUP GROUP order-processor consumer-1 COUNT 10 BLOCK 5000 STREAMS events:orders >
// > = "give me undelivered messages" (PEL: Pending Entry List tracks these)

// Acknowledge: message removed from PEL (won't be redelivered)
XACK events:orders order-processor 1720000000000-0

// Claim stuck messages (consumer-1 crashed, consumer-2 takes over)
// Messages pending > 30 seconds are considered stuck
XAUTOCLAIM events:orders order-processor consumer-2 30000 0-0 COUNT 10

// Trim stream to keep last N messages (or by time)
XTRIM events:orders MAXLEN ~ 100000  // ~ = approximate trim (faster)`,

      internals: `Stream internals — why it's not just a List:

  LIST-based queue (LPUSH/RPOP):
    • Message is deleted when consumed — no redelivery if consumer crashes
    • No consumer groups — one consumer per queue
    • No message ID — can't seek to a specific point
    • No pending tracking — fire-and-forget

  Redis Stream:
    • Message stays after reading (only XDEL or XTRIM removes it)
    • Consumer groups: each group gets its OWN cursor → same stream consumed by multiple groups
    • PEL (Pending Entry List): tracks which messages are delivered but not ACKed per consumer
    • On consumer crash: messages in PEL are redelivered after timeout (XAUTOCLAIM)
    • Seekable: XRANGE events:orders 1720000000000-0 + → replay from any offset

  Exactly-once processing (achieved by application, not Redis):
    Redis gives at-least-once delivery (redelivery on crash).
    For exactly-once: use the message ID as an idempotency key in the target store.
    Example: HSET processed-events 1720000000000-0 1 (NX = only if not already processed)
    If SET succeeds: process the message. If SET fails: message already processed, skip.

  Delivery guarantee comparison:
    PubSub:    at-most-once (missed if consumer is offline when message published)
    List queue: at-most-once (message gone after RPOP, even if consumer crashes)
    Stream:    at-least-once (redelivered from PEL on crash + XAUTOCLAIM)
    Stream + idempotency key: effectively-exactly-once`,
    },
    {
      id: "eviction",
      title: "Memory Management & Eviction",
      description: "maxmemory policies, LRU/LFU, cache sizing",
      api: `// redis.conf — memory settings
maxmemory 4gb                     // hard cap; Redis refuses writes when exceeded (no policy)
maxmemory-policy allkeys-lru      // evict least-recently-used keys when maxmemory hit

// Eviction policies:
// noeviction       → return error on writes when full (safe for durable stores, bad for caches)
// allkeys-lru      → evict any key by LRU (good general-purpose cache policy)
// volatile-lru     → evict only keys with TTL set, by LRU (hybrid: some keys permanent)
// allkeys-lfu      → evict by frequency (better for skewed access patterns — hot keys stay)
// volatile-ttl     → evict keys with shortest TTL first (expires soonest go first)
// allkeys-random   → random eviction (bad — only use if access is truly uniform)

// Check current memory usage
127.0.0.1:6379> INFO memory
used_memory_human: 3.72G
used_memory_peak_human: 3.90G
mem_fragmentation_ratio: 1.12   // 1.0 ideal; >1.5 means fragmentation issue; <1.0 means swap
maxmemory_human: 4.00G
maxmemory_policy: allkeys-lru

// Per-key memory usage
127.0.0.1:6379> MEMORY USAGE user:123     → 256  (bytes including metadata)
127.0.0.1:6379> MEMORY USAGE leaderboard → 4096

// Find big keys (run on replica to avoid blocking production)
redis-cli --bigkeys
// Outputs: top 5 largest keys per type`,

      internals: `LRU implementation — approximate, not exact:

  True LRU requires a doubly-linked list tracking access order for ALL keys.
  At millions of keys, this list becomes a bottleneck (pointer chasing, cache misses).

  Redis uses approximate LRU:
    Each key's robj stores an lru field (Unix timestamp, 24-bit, ~97-day resolution).
    On eviction: Redis samples maxmemory-samples (default 5) random keys.
    The key with the oldest lru timestamp is evicted.
    Increasing maxmemory-samples improves LRU accuracy at the cost of CPU.
    samples=10: very close to true LRU; samples=5: good enough for most caches.

  LFU (Least Frequently Used):
    Stored in the same lru field: upper 16 bits = last decay time, lower 8 bits = log counter.
    Counter is logarithmic: INCR probability decreases as counter grows (cap at 255).
    Decay: counter decays over time if key isn't accessed (lfu-decay-time 1 = 1 minute).
    LFU advantage: a key accessed 1000 times yesterday but not today won't evict a key
    accessed once today — LRU would wrongly prefer today's key.

  Memory fragmentation:
    Redis uses jemalloc. Fragmentation occurs when many small keys are deleted and new
    larger allocations can't fit the freed space.
    Active defragmentation (activedefrag yes): background thread moves data to reduce
    fragmentation. Safe to enable; slight CPU overhead.
    mem_fragmentation_ratio > 1.5: consider restart or active defrag.
    mem_fragmentation_ratio < 1.0: Redis is using swap — critical, add memory immediately.`,
    },
  ],
};

export const REDIS_QNA = [
  {
    id: "redis-q1",
    category: "Architecture",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Google", "Meta", "Uber", "Airbnb"],
    question: "Redis is single-threaded. How does it achieve 100,000+ ops/sec?",
    answer: `Redis is single-threaded for command execution, but this is a strength, not a weakness. Here's why:

1. Everything is in RAM. A GET or SET is just a hash table lookup followed by a memcpy — no disk I/O, no syscall to fetch data. A RAM operation takes ~100 nanoseconds. At 100 ns per operation, a single core can theoretically handle 10 million ops/sec. Real-world throughput of 100,000–500,000 ops/sec is bounded by network, not CPU.

2. No lock contention. Multi-threaded databases spend enormous time on mutex acquisition, cache-line bouncing, and context switches. Redis eliminates ALL of this — the event loop processes one command at a time, in order, with no synchronization overhead.

3. Efficient I/O multiplexing. Redis uses epoll (Linux) / kqueue (BSD) to handle thousands of connections without one thread per connection. A single epoll call returns all readable sockets at once. The event loop reads, parses, executes, and responds in tight, cache-friendly loops.

4. Non-blocking I/O. Redis never blocks on network I/O. All reads/writes use non-blocking sockets. A slow client can't stall other clients — it just fills up its output buffer.

Where single-threaded HURTS:
• Long-running commands (KEYS *, SMEMBERS on a huge set, SORT) block ALL clients.
• CPU-bound workloads (large Lua scripts, many OBJECT operations) become bottlenecks.
• Solution: Redis 6.0 introduced threaded I/O (multi-threaded network, single-threaded commands). I/O threads handle read/write, but command execution remains single-threaded.`,
    followups: [
      "What command would you NEVER run on a production Redis and why?",
      "How does Redis 6.0's threaded I/O model differ from making command execution multi-threaded?",
    ],
  },
  {
    id: "redis-q2",
    category: "Architecture",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Amazon", "LinkedIn", "Twitter", "Stripe"],
    question: "Design a rate limiter using Redis. What are the trade-offs between different approaches?",
    answer: `Three approaches, increasing accuracy:

1. Fixed Window Counter (simplest):
   Key: rl:{userID}:{currentMinute}
   INCR key; EXPIRE key 60
   Problem: burst attack at window boundary — 100 requests at 11:59:59 + 100 requests at 12:00:00 = 200 requests in 2 seconds.

2. Sliding Window Log (most accurate, most memory):
   Key: rl:{userID} (ZSET, score = timestamp)
   ZREMRANGEBYSCORE (remove entries older than 60s) → ZADD (add current request) → ZCARD (count) → compare to limit.
   Problem: stores one entry per request. At 100 req/min × 10M users = 1B entries = ~80 GB RAM.

3. Sliding Window Counter (best balance — use this):
   Approximates sliding window using two fixed windows.
   Current window count + (previous window count × overlap fraction):
     weight = (60 - seconds_elapsed_in_current_window) / 60
     estimated_count = current_count + prev_count × weight
   Uses only 2 keys per user. Error is bounded (< 1% in practice).
   Implementation: atomic via Lua script or pipeline.

Redis pipeline ensures atomicity for the sliding window log:
   ZREMRANGEBYSCORE, ZADD, ZCARD, EXPIRE — all in one pipeline. Not fully atomic (pipeline isn't MULTI/EXEC), so use a Lua script for true atomicity if you need strict enforcement.

Production considerations:
   • Redis failure → fail open (allow all) or fail closed (block all)? Usually fail open for rate limiters.
   • Distributed setup (multiple Redis nodes): rate limit state is per-shard; exact counts require a central Redis or an approximation.`,
    followups: [
      "How would you implement a token bucket rate limiter in Redis?",
      "If your Redis rate limiter goes down, what's your fallback strategy?",
    ],
  },
  {
    id: "redis-q3",
    category: "Reliability",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Amazon", "Google", "Netflix", "Coinbase"],
    question: "What is cache stampede (thundering herd) and how do you prevent it in Redis?",
    answer: `Cache stampede (thundering herd) occurs when a popular cached item expires and thousands of concurrent requests simultaneously find a cache miss, all hit the database at once, overwhelming it — while each one is also trying to refill the cache.

Why it happens:
  Popular item expires at T=0. 10,000 concurrent users hit the cache. All get a miss. All query the DB. DB gets 10,000 simultaneous queries for the same item (instead of 1). DB crashes or slows significantly. All 10,000 cache refills happen, 9,999 of them redundant.

Prevention strategies:

1. Mutex / Lock (SETNX pattern):
   On cache miss, try to SET a lock key with NX (only set if not exists) and a short TTL.
   Only the thread that acquired the lock fetches from DB and refills cache.
   Other threads spin-wait or return stale data (if available) while the lock holder works.
   Risk: lock holder crashes → lock TTL expires → next thread takes over. Safe.

2. Probabilistic Early Expiry (PER — best for read-heavy):
   Instead of expiring at a fixed time, each read slightly before expiry has a probability of proactively refreshing.
   Probability = exp(−β × TTL_remaining). Higher β = more aggressive early refresh.
   One process refreshes early while the key is still valid — no stampede, no stale data gap.

3. Background refresh:
   Key never expires (no TTL). A background job periodically refreshes it.
   On miss (key deleted externally or first boot): use mutex.
   Works well for slow-changing data (configs, feature flags).

4. Stale-while-revalidate:
   Serve stale data immediately. Trigger async refresh. Client never waits.
   Set two TTLs: soft TTL (serve stale after this) and hard TTL (delete after this).`,
    followups: [
      "How does probabilistic early expiry compare to a mutex approach in terms of tail latency?",
      "If you have a leaderboard that 100,000 users refresh simultaneously at midnight, how do you avoid cache stampede?",
    ],
  },
  {
    id: "redis-q4",
    category: "Reliability",
    difficulty: "Medium",
    round: "Deep Dive",
    asked_at: ["Amazon", "Uber", "Stripe", "Shopify"],
    question: "Explain Redis persistence options. Which would you choose for a session store?",
    answer: `Redis has two persistence mechanisms:

RDB (Redis Database Backup — snapshots):
  Forks the process and writes a compact binary snapshot of all data to disk.
  Configuration: save 60 10000 = snapshot if 10,000 keys change in 60 seconds.
  Pros: fast restart (load binary file), compact file (good for backups), no performance impact on parent.
  Cons: data loss window = time since last snapshot (up to 5–15 minutes).

AOF (Append-Only File):
  Logs every write command (SET, HSET, LPUSH) as it happens.
  fsync policies: everysec (lose at most 1 second) | always (lose nothing) | no (OS decides).
  Pros: low data loss (everysec ≈ 1 second RPO), human-readable log.
  Cons: AOF file grows large (rewrite needed), slower restart than RDB.

Hybrid (recommended):
  AOF file starts with an embedded RDB snapshot, then only new commands follow.
  Fast restart (load RDB portion) + low data loss (AOF tail). Best of both worlds.
  Enable: aof-use-rdb-preamble yes (default in Redis 7+).

For a session store:
  RPO matters but is not zero-tolerance (losing 1 second of sessions is acceptable).
  Recommendation: AOF with appendfsync everysec + hybrid persistence.
  Rationale: sessions that are lost (user gets logged out) is annoying but not data-corrupting. 1-second RPO is fine. Fast restart ensures minimal downtime after a crash.

  Alternatively for a pure cache (sessions can be re-created from DB): no persistence at all. Faster, simpler, no disk writes.`,
    followups: [
      "What happens to Redis performance during an RDB fork on a 50 GB dataset?",
      "If AOF replay on restart is too slow (AOF file is 10 GB), what do you do?",
    ],
  },
  {
    id: "redis-q5",
    category: "Architecture",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Google", "Uber", "Meta", "Twitter"],
    question: "Design a real-time leaderboard system for 1 million players using Redis.",
    answer: `Redis Sorted Sets are the perfect primitive for leaderboards — ZADD is O(log n), ZRANGE/ZREVRANGE is O(log n + k) for k results, ZRANK is O(log n).

Data model:
  ZADD leaderboard:global <score> <playerID>
  One sorted set holds all 1M players, sorted by score. Redis handles this efficiently — a ZSET with 1M entries uses ~80 MB RAM (80 bytes per entry: score + member + pointers).

Key operations:
  Update score:    ZINCRBY leaderboard:global +100 "player:123"       → O(log n)
  Top 100:         ZREVRANGE leaderboard:global 0 99 WITHSCORES       → O(log n + 100)
  Player rank:     ZREVRANK leaderboard:global "player:123"           → O(log n)
  Score:           ZSCORE leaderboard:global "player:123"             → O(1)
  Players in range: ZRANGEBYSCORE leaderboard:global 9000 10000      → score-filtered range

Time-windowed leaderboards (daily/weekly):
  Use separate keys per time bucket:
    leaderboard:2026-06-24  (daily)
    leaderboard:2026-W26    (weekly)
  On score update, write to all active buckets atomically (pipeline).
  Set TTL on each bucket: EXPIRE leaderboard:2026-06-24 86400

Friends leaderboard (relative ranking):
  Store friends list in a SET: SET friends:123 = {456, 789, ...}
  No single ZSET can serve this efficiently for all users.
  Two options:
    1. Fan-out: maintain a per-user friends leaderboard (ZADD leaderboard:user:123 ...) — write amplification but O(log n) read.
    2. Read-time computation: ZMSCORE leaderboard:global [friend1, friend2, ...] → sort in app — simpler but O(k) network.

Scale to 10M players:
  Single ZSET handles 10M entries (~800 MB). Redis Cluster if RAM is insufficient.
  With Cluster: use hash tags — {leaderboard}:global to ensure all operations on one slot.
  Alternatively: shard by score range (leaderboard:shard:0-100000), merge in application for top-N.`,
    followups: [
      "How do you handle tie-breaking (same score, different players) in the leaderboard?",
      "How would you implement a 'players near me in rank' feature efficiently?",
    ],
  },
  {
    id: "redis-q6",
    category: "Reliability",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Amazon", "Stripe", "Cloudflare", "HashiCorp"],
    question: "How would you implement a distributed lock in Redis? What are the failure modes?",
    answer: `Single-node distributed lock (basic):
  Acquire: SET lock:resource_name <unique_token> NX PX 30000
    NX = only set if key does NOT exist (atomic check + set)
    PX 30000 = auto-expire in 30 seconds (prevents deadlock if holder crashes)
  Release: Lua script: GET → compare token → DEL (atomic check-and-delete)
    Must compare token before deleting! Otherwise, if lock expired and was re-acquired by another client, you'd delete the new client's lock.

Why the Lua script for release is critical:
  Without it: GET key → (lock expires here, new client acquires) → DEL → deleted wrong client's lock.
  With Lua: Redis executes GET + compare + DEL atomically — no interleaving possible.

Failure modes:
  1. Lock holder crashes before release: TTL expires, lock auto-released. Next requester gets it. Safe.
  2. Lock holder is slow (GC pause): lock expires, new holder acquires, original holder wakes up and thinks it still holds lock. Both holders in critical section simultaneously (false safety).
     Mitigation: lock holder should check if it still holds the lock before any critical action (re-GET and compare token). Or use fencing tokens (monotonically increasing counter added to lock).
  3. Redis primary crashes before replicating lock to replica: new primary (post-failover) doesn't have the lock, another client acquires it. Two holders simultaneously.
     Mitigation for this: Redlock algorithm.

Redlock (multi-node):
  Acquire lock on N/2+1 independent Redis nodes (majority quorum). Lock is valid only if acquired on majority within time limit. Eliminates single-node failure risk.
  Controversy: Martin Kleppmann argued Redlock is unsafe for distributed systems requiring strong fencing. Antirez (Redis creator) disagreed. For most practical use cases (cron deduplication, resource locking), single-node is sufficient.`,
    followups: [
      "What is a fencing token and how does it make distributed locks safer?",
      "When would you use Redlock vs. a single-node lock?",
    ],
  },
  {
    id: "redis-q7",
    category: "Scale & Performance",
    difficulty: "Medium",
    round: "System Design Round",
    asked_at: ["Google", "Amazon", "Netflix", "Lyft"],
    question: "What is a hot key in Redis and how do you solve it?",
    answer: `A hot key is a Redis key that receives a disproportionate share of traffic — for example, a celebrity's profile or a viral post. Because Redis is single-threaded, all requests for that key go to ONE node, and the CPU on that node becomes the bottleneck regardless of how many nodes are in the cluster.

Symptoms:
  • One Redis node at 100% CPU while others are idle.
  • Latency spikes for all keys on that node (single-threaded blocking).
  • redis-cli --hotkeys (Redis 4.0+ with LFU eviction policy) shows the offending key.

Solutions:

1. Local in-process cache (best for read-heavy hot keys):
   Cache the hot item in application memory (Go: sync.Map or a small TTL cache).
   Reads never hit Redis. TTL of 100ms–1s is enough to absorb a spike.
   Tradeoff: stale data window; each app server has its own copy (memory use × N servers).

2. Key replication (Redis-side):
   Create N copies: hot_key:0, hot_key:1, ..., hot_key:N-1 on different slots/nodes.
   Reads randomly pick a shard: GET hot_key:{rand.Intn(N)}
   Writes update all N shards (pipeline): O(N) writes, O(1) read from any shard.
   Tradeoff: write amplification; all copies must be updated atomically (Lua or pipeline).

3. Read replicas:
   Route reads to replicas. Redis Cluster: replica-read-only + client-side routing.
   Tradeoff: eventual consistency (replica lag). Acceptable for feeds, profiles, not for counters.

4. Compression + smaller payloads:
   Large values (> 1KB) spend more CPU time on network serialization.
   Store only the frequently-read fields (HGET instead of HGETALL), compress with snappy/LZ4 at the application layer.`,
    followups: [
      "How do you detect a hot key in production before it causes an outage?",
      "If you choose local in-process caching, how do you handle cache invalidation across all app servers?",
    ],
  },
  {
    id: "redis-q8",
    category: "Architecture",
    difficulty: "Medium",
    round: "Screening",
    asked_at: ["Amazon", "Flipkart", "Razorpay", "Groww"],
    question: "What's the difference between Redis Pub/Sub and Redis Streams? When do you use each?",
    answer: `Redis Pub/Sub — fire-and-forget messaging:
  PUBLISH channel message → sends to all current subscribers.
  SUBSCRIBE channel → receive messages while subscribed.
  Guarantee: at-most-once. If a subscriber is offline when a message is published, the message is LOST. No persistence, no replay.
  Use for: real-time notifications where missing a message is acceptable — live dashboards, chat typing indicators, presence updates.

Redis Streams — persistent event log:
  XADD stream * field value → appends to the stream, returns a unique message ID.
  XREADGROUP GROUP grp consumer COUNT 10 → consume messages; they stay in the stream.
  XACK → acknowledge processing; message removed from the consumer's PEL.
  Guarantee: at-least-once (message redelivered if consumer crashes before XACK).
  Messages persist until XDEL or XTRIM — consumers can replay from any offset.
  Consumer groups: multiple consumers share load; each message goes to exactly one consumer per group.
  Use for: order processing, audit logs, event sourcing, anywhere you can't afford to miss a message.

Decision table:
  Can I afford to miss messages if a consumer is down?   → Pub/Sub
  Need to replay events after a consumer restart?        → Streams
  Need fan-out to multiple independent consumers?        → Pub/Sub (or Streams with multiple groups)
  Need load balancing across consumer instances?         → Streams (consumer groups)
  Need delivery guarantees (at-least-once)?              → Streams

Practical rule: if "what if I miss a message?" ever has a non-trivial answer → use Streams.`,
    followups: [
      "How would you migrate from a Redis List-based queue to Redis Streams without downtime?",
      "How does Redis Streams compare to Kafka for a small-scale event pipeline?",
    ],
  },
  {
    id: "redis-q9",
    category: "Architecture",
    difficulty: "Easy",
    round: "Screening",
    asked_at: ["Amazon", "Flipkart", "Paytm", "Swiggy"],
    question: "Explain Redis Cluster. How does it partition data and handle node failures?",
    answer: `Redis Cluster horizontally partitions data across multiple nodes using 16,384 hash slots.

Slot assignment:
  slot = CRC16(key) % 16384
  Slots are assigned to nodes: Node A: 0–5460, Node B: 5461–10922, Node C: 10923–16383.
  Each node also has 1–2 replicas for HA.

Hash tags — controlling slot assignment:
  {user:123}:session and {user:123}:orders both hash the substring "user:123" → same slot → same node.
  Without hash tags, MGET across multiple keys may hit different nodes → error.

Client routing:
  Each Redis Cluster node knows the full slot map.
  On wrong node: node returns MOVED 5460 <correct-node-ip>:<port>. Client redirects permanently.
  Mid-migration: node returns ASK redirect (temporary, don't cache this routing).
  Smart clients (redis-py, go-redis) maintain a local slot map and route directly — zero redirects in steady state.

Node failure and recovery:
  Detection: every node pings every other node every second (gossip). If a node misses CLUSTER_NODE_TIMEOUT (default 15s) worth of pings → marked PFAIL.
  PFAIL → FAIL: when a majority of primaries agree a node is down → FAIL.
  Replica promotion: the failing node's replicas hold an election. Each replica asks other primaries to vote. The replica with least replication lag wins. Promotion takes CLUSTER_NODE_TIMEOUT / 2 (default 7.5s).
  Client impact: ~7–15 seconds of failures for keys on the failed node's slots during promotion.`,
    followups: [
      "What happens to a Cluster operation if it targets a key in a slot that is currently being migrated?",
      "How does Redis Cluster handle a network partition that splits the cluster into two halves?",
    ],
  },
  {
    id: "redis-q10",
    category: "Database Design",
    difficulty: "Medium",
    round: "System Design Round",
    asked_at: ["Meta", "Twitter", "Snap", "Pinterest"],
    question: "How would you use Redis to implement a social graph's feed (activity feed)?",
    answer: `An activity feed shows a user's timeline — posts from people they follow, in reverse chronological order.

Redis data model for feeds:

1. Fan-out on write (push model):
   When Alice posts, push her post ID to every follower's feed list.
   Key: feed:{userID} → LIST (sorted by time, newest first)
   LPUSH feed:follower1 postID → O(1) insert
   LRANGE feed:bob 0 49 → fetch 50 newest posts for Bob → O(k)
   LTRIM feed:bob 0 999 → keep only last 1000 posts → O(n) but background

   Pros: reads are O(k) — instant feed fetch.
   Cons: fan-out writes — if Alice has 10M followers (celebrity), one post = 10M LPUSH operations. Write amplification is severe.

2. Fan-out on read (pull model):
   When Bob opens his feed, fetch Alice's posts, Charlie's posts, ... and merge.
   Key: posts:{userID} → ZSET (member=postID, score=timestamp)
   On read: ZRANGE posts:alice -inf +inf → for each followee → merge sort in app.
   Pros: one write per post regardless of follower count.
   Cons: read is slow for users following 1000 people (1000 Redis lookups + merge).

3. Hybrid (Twitter-style — production solution):
   Celebrities (followers > 1M): fan-out on READ (don't push their posts).
   Normal users: fan-out on WRITE (push to followers' feeds).
   On read: user's pre-computed feed LIST + real-time celebrity posts merged in app.

TTL on feed keys:
  EXPIRE feed:bob 86400 × 30 → feed expires after 30 days of inactivity.
  Inactive users' feeds are evicted; active users always have a warm feed.`,
    followups: [
      "How would you handle the case where a user unfollows someone — their posts should disappear from the feed?",
      "How do you paginate a feed efficiently in Redis when users scroll down?",
    ],
  },
  {
    id: "redis-q11",
    category: "Database Design",
    difficulty: "Medium",
    round: "System Design Round",
    asked_at: ["Amazon", "Google", "Stripe", "Twilio"],
    question: "Compare Redis, Memcached, and a CDN for caching. When would you choose each?",
    answer: `All three reduce latency by serving data from fast storage close to the requester. Their trade-offs determine which to use.

Memcached:
  Pros: simpler, slightly faster for pure string caching (no data structure overhead), multi-threaded (better CPU utilization on multi-core).
  Cons: no persistence (data gone on restart), no replication, no cluster data structures, limited to string key-value, no pub/sub, no Lua scripting.
  Use when: pure string cache, you already have it, simplicity matters, and you don't need any of Redis's advanced features.

Redis:
  Pros: rich data structures (sorted sets for leaderboards, hashes for user objects, streams for queues), optional persistence, replication + Sentinel/Cluster, pub/sub, atomic operations, Lua scripts.
  Cons: single-threaded command execution (CPU bottleneck on complex scripts), more operational complexity than Memcached.
  Use when: you need more than a string cache — counters, queues, leaderboards, session stores, rate limiters, distributed locks.

CDN (CloudFront, Fastly, Cloudflare):
  Pros: globally distributed (milliseconds from any geography), handles massive traffic spikes (absorbs DDoS), no server-side infrastructure to manage, great for static assets.
  Cons: can't cache personalized or private data, cache invalidation is slow (TTL-based or explicit purge), no programmatic data structures, cache key is the URL.
  Use when: public static assets (images, CSS, JS), API responses that are the same for all users, edge-level caching to offload origin servers.

Decision tree:
  Global, public, static content → CDN
  Application-level cache with rich structures → Redis
  Simple string cache, multi-threaded performance needed → Memcached
  Often: CDN + Redis (CDN handles static, Redis handles dynamic session/state).`,
    followups: [
      "How do you invalidate CDN cache entries immediately after a content update?",
      "If you had to choose just one between Redis and Memcached for a new project, which and why?",
    ],
  },
  {
    id: "redis-q12",
    category: "Scale & Performance",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Amazon", "Google", "Netflix", "Cloudflare"],
    question: "Walk me through a back-of-the-envelope analysis for sizing a Redis deployment for a high-traffic e-commerce platform.",
    answer: `STATE ASSUMPTIONS FIRST:
• 50M registered users, 5M daily active users
• Session store: user sessions, 2 KB each, 24-hour TTL
• Product cache: 500K products, average 1 KB per product object, 1-hour TTL
• Cart cache: 500K active carts (10% of DAU), 5 KB per cart, 2-hour TTL
• Rate limiter: sliding window counter per user, 2 keys × ~100 bytes each
• Peak read throughput: 500,000 ops/sec; peak write: 50,000 ops/sec

1. MEMORY SIZING:
   Sessions: 5M active sessions × 2 KB = 10 GB
   Products: 500K × 1 KB = 500 MB
   Carts: 500K × 5 KB = 2.5 GB
   Rate limiters: 5M DAU × 200 bytes = 1 GB (ZSET overhead for sliding window)
   Metadata overhead (Redis internal structures): ~30%
   Total: (10 + 0.5 + 2.5 + 1) × 1.3 ≈ 18.2 GB RAM needed

   → A single r6g.2xlarge (64 GB) is sufficient with headroom.
   → Or two r6g.xlarge (32 GB each) with cluster sharding for redundancy.

2. THROUGHPUT SIZING:
   Peak 500K reads/sec > single Redis instance limit (~200K–500K depending on payload size).
   Solution: 1 primary + 2 read replicas. Route reads round-robin across replicas.
   Each replica handles ~167K reads/sec — well within limits.
   50K writes/sec → single primary handles easily (at 200K+ write ops/sec capacity).

3. PERSISTENCE:
   50K writes/sec × 200 bytes avg = ~10 MB/sec AOF growth
   AOF rewrite at 1 GB: every 100 seconds — too frequent.
   → Use appendfsync everysec (1-second RPO acceptable for cache).
   → Set AOF rewrite threshold higher: auto-aof-rewrite-min-size 4gb.

4. FAILOVER TIME:
   Sentinel timeout: 30s (default). Reduce to 5s for faster failover.
   Tradeoff: more false-positive failovers on network blips.
   RPO during failover: up to 1 second of writes lost (async replication).

INTERVIEW PUNCH LINE: 18 GB RAM → single large instance or two-node cluster;
500K reads/sec → primary + 2 replicas with read routing;
10 MB/sec AOF → rewrite threshold 4 GB (not default 64 MB).`,
    followups: [
      "If DAU spikes 10× during a flash sale, how does your Redis deployment handle it?",
      "How do you handle the 30-second Sentinel failover window — what happens to user requests?",
    ],
  },
];
