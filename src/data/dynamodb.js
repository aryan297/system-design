export const DYNAMODB_HLD = {
  title: "DynamoDB — High Level Design",
  subtitle: "How Amazon built a key-value store with single-digit millisecond latency at any scale",

  overview: `DynamoDB is Amazon's fully managed, serverless NoSQL database. It powers Amazon.com's shopping cart, Prime Video, and thousands of AWS customers at millions of requests per second with consistent single-digit millisecond latency.

The foundational paper: "Dynamo: Amazon's Highly Available Key-value Store" (SOSP 2007) introduced the core ideas — consistent hashing, virtual nodes, quorum-based replication, and eventual consistency — that influenced every modern distributed database (Cassandra, Riak, ScyllaDB).

Three design decisions that define everything:
1. Partition by key hash — data is automatically sharded across storage nodes using consistent hashing. No manual sharding ever.
2. Sacrifice strong consistency for availability and latency — reads can be eventually consistent (faster) or strongly consistent (1 extra round-trip). You choose per-request.
3. LSM Tree storage engine — writes go to an in-memory buffer first (never disk on the critical path). This is what makes single-digit ms writes possible.`,

  diagram: `
┌─────────────────────────────────────────────────────────────────────────┐
│                             CLIENT                                      │
│          SDK (Java/Python/Go/JS)  ·  AWS CLI  ·  Console               │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │  HTTPS + SigV4 auth
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       REQUEST ROUTER LAYER                              │
│                                                                         │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐ │
│   │  Auth &      │  │  Request     │  │  Partition Metadata Cache    │ │
│   │  SigV4 Check │  │  Router      │  │  (key → storage node map)    │ │
│   └──────────────┘  └──────┬───────┘  └──────────────────────────────┘ │
└────────────────────────────┼────────────────────────────────────────────┘
                             │  Routes to correct storage node
                             │  (consistent hash of partition key)
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
┌─────────────────┐ ┌──────────────┐ ┌─────────────────┐
│  Storage Node A │ │Storage Node B│ │  Storage Node C │
│  ─────────────  │ │ ───────────  │ │  ─────────────  │
│  WAL (commit)   │ │ WAL (commit) │ │  WAL (commit)   │
│  MemTable       │ │ MemTable     │ │  MemTable       │
│  L0 SSTable     │ │ L0 SSTable   │ │  L0 SSTable     │
│  L1 SSTable     │ │ L1 SSTable   │ │  L1 SSTable     │
│  (LSM Tree)     │ │ (LSM Tree)   │ │  (LSM Tree)     │
└────────┬────────┘ └──────┬───────┘ └────────┬────────┘
         │                 │                  │
         └─────────────────┼──────────────────┘
                           │  Each partition replicated
                           │  to 3 AZs (synchronous)
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   SUPPORTING SERVICES                                   │
│         SERVICE MESH — Envoy sidecar attached to every service          │
│  ┌───────────────┐  ┌──────────────┐  ┌────────────────────────────┐  │
│  │  DynamoDB     │  │ Auto Scaling │  │    Global Tables           │  │
│  │  Streams      │  │  (RCU / WCU) │  │  (multi-region replication)│  │
│  │  (CDC log)    │  │              │  │                            │  │
│  └───────────────┘  └──────────────┘  └────────────────────────────┘  │
│      mTLS · Load Balancing · Retries · Circuit Breaking · Tracing       │
└─────────────────────────────────────────────────────────────────────────┘`,

  metrics: [
    { label: "Latency (p99)", value: "Single-digit milliseconds (< 5ms reads, < 5ms writes)" },
    { label: "Throughput", value: "Millions of requests/second per table" },
    { label: "Replication", value: "3 synchronous replicas across 3 AZs" },
    { label: "Durability", value: "11 nines (99.999999999%) — WAL + multi-AZ replication" },
    { label: "Availability SLA", value: "99.999% (< 5 min downtime/year)" },
    { label: "Max item size", value: "400 KB per item" },
    { label: "Partition capacity", value: "3,000 RCU + 1,000 WCU per partition (10 GB max)" },
    { label: "Global Tables RPO", value: "~1 second replication lag across regions" },
    { label: "DynamoDB Streams retention", value: "24 hours" },
  ],

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Data Model & Partitioning",
      sections: [
        {
          title: "The Data Model — Tables, Items, Keys",
          content: `DynamoDB is a key-value store with optional document-style attributes. Understanding the key model is everything.

Table: a collection of items (like a SQL table, but schemaless except for keys).
Item: a single record (like a SQL row) — up to 400 KB of attributes.
Attribute: a name-value pair (like a SQL column) — but schema is NOT enforced except on keys.

The two key types:
  1. Partition Key (PK): required. DynamoDB hashes this to determine which storage node holds the item.
     Example: userId, orderId, productId
  2. Sort Key (SK): optional. When used alongside PK, forms a "composite key".
     Items with the same PK but different SKs are stored together, sorted by SK.
     This enables powerful range queries: "give me all orders for user_123 after 2024-01-01".

Access pattern example (e-commerce):
  Table: Orders
  PK=userId, SK=orderDate#orderId
  GetItem: exact fetch by userId + orderId → O(1)
  Query:   all orders for userId in 2024 → range scan on SK within a partition → O(k)
  Scan:    full table scan → O(n) — avoid in production

Why no joins?
• DynamoDB is designed for known, predictable access patterns.
• You model data to fit your queries, not normalize to 3NF.
• Single-table design: store multiple entity types in one table using PK/SK patterns.
  user#123 / profile → user record
  user#123 / order#456 → order record
  user#123 / order#789 → another order
  → one Query fetches user + all orders in a single request.`,
        },
        {
          title: "Consistent Hashing — How DynamoDB Partitions Data",
          content: `DynamoDB uses consistent hashing to distribute items across storage nodes with minimal reshuffling when nodes are added or removed.

The ring:
• Imagine a ring of integers 0 → 2^32 (4 billion positions).
• Each storage node is assigned multiple positions on the ring (virtual nodes / vnodes).
• A partition key is hashed (MurmurHash) to a position on the ring.
• The item is stored on the nearest node clockwise from that hash position.

Why virtual nodes?
• Without vnodes: each physical node owns one arc of the ring. Adding a node reshuffles 50% of data.
• With vnodes: each physical node owns 100+ small arcs. Adding a node takes small slices from many existing nodes → balanced load, minimal data movement.
• Hot key isolation: if one partition key generates huge traffic, that vnode can be moved to a dedicated node.

DynamoDB partition limits (the #1 gotcha):
• Each partition handles: 3,000 RCU + 1,000 WCU max.
• DynamoDB auto-splits a partition when it exceeds 10 GB or hits the throughput ceiling.
• Hot partitions: if 90% of your reads/writes go to the same PK, you hit partition limits even with massive total provisioned capacity.
• Solution: add a random suffix to the PK (shard hot keys) or use a composite key that distributes load.

Partition key selection rules:
  High cardinality: userId ✓   country ✗ (only 200 values, all load on 200 partitions)
  Uniform access:   orderId ✓  "latest" ✗ (everyone reads the newest item)
  No hot keys:      use write sharding if needed (append random 0–9 suffix, query all 10)`,
        },
        {
          title: "Back-of-the-Envelope Estimation",
          content: `Before designing a partition layout, pin down scale with rough
math — every box in the diagram exists because of one of these
numbers.

ASSUMPTIONS:
• A single large table: ~100 TB of data, 1M requests/sec sustained
  (within the "millions of requests/second per table" metric)
• Average item size: ~1 KB (well under the 400 KB item limit)
• Per-partition limits: 10 GB storage, 3,000 RCU + 1,000 WCU
• Replication factor: 3 (synchronous, across 3 AZs)
• MemTable flush threshold: ~64 MB
• Global Tables cross-region replication lag target: ~1 second

1. Partition count — justifies the Partition Manager / consistent-hashing ring
   100 TB ÷ 10 GB per partition ≈ 10,000 partitions
   → A routing table with 10,000 entries needs O(log p) binary
     search, not a linear scan — exactly the Partition Metadata
     Cache, refreshed every ~30s

2. Aggregate read ceiling — justifies "millions of requests/second" and write sharding
   10,000 partitions × 3,000 RCU ≈ 30M RCU/sec theoretical ceiling
   → 1M req/sec average uses only ~3% of that capacity, but ANY
     single partition over 3,000 RCU throttles regardless of
     table-wide headroom — this is WHY write sharding exists

3. MemTable flush cadence — justifies continuous background compaction
   1,000 WCU × ~1 KB/write ≈ ~1 MB/sec sustained writes per partition
   64 MB MemTable ÷ 1 MB/sec ≈ ~64 seconds between flushes
   → Each storage node flushes a new L0 SSTable roughly once a
     minute under load — compaction must run continuously, not as a
     rare maintenance job

4. Replication fan-out — justifies the 3-AZ synchronous quorum design
   1M writes/sec × 2 follower replicas ≈ 2M replication RPCs/sec
   → Cross-AZ bandwidth, not CPU, becomes the bottleneck for W=2 —
     this is WHY Global Tables settle for ~1s cross-region lag instead
     of synchronous replication

5. Streams volume — justifies idempotent, at-least-once consumer design
   1M writes/sec × 86,400 sec/day × 24h retention ≈ 86.4B records/day
   → A consumer that falls more than 24h behind permanently loses
     data — this is WHY Streams consumers (Lambda, in the Supporting
     Services box) must be idempotent, not just "eventually catch up"

Interview punch line: every number above maps to a box — 10,000
partitions → Partition Manager, 30M RCU ceiling → Request Router's
partition cache, 1 MB/sec/partition → MemTable flush → compaction,
2M RPCs/sec → 3-AZ quorum replicas, 86.4B records/day → Streams 24h
retention. State the number, then name the component it justifies.`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Storage Engine — The LSM Tree",
      sections: [
        {
          title: "Why LSM Tree? Write Path Explained",
          content: `DynamoDB's storage engine is built on a Log-Structured Merge Tree (LSM Tree). This is the same engine used by Cassandra, RocksDB, LevelDB, and BigTable.

The core insight: random writes to disk are catastrophically slow. Sequential writes are 10–100× faster. LSM turns random writes into sequential writes.

Write path (how PutItem works):
  1. Request arrives at storage node.
  2. Write to WAL (Write-Ahead Log) on disk — sequential append, extremely fast (~0.1ms).
     This is the durability guarantee: even if the node crashes, WAL can replay.
  3. Write to MemTable — an in-memory sorted data structure (usually a red-black tree or skip list).
     MemTable write: < 1ms.
  4. ACK returned to client. Write is "durable" because WAL is persisted.

Background: MemTable flush to disk:
  When MemTable reaches ~64 MB, it's flushed to disk as an immutable SSTable (Sorted String Table).
  SSTable: a file of sorted key-value pairs. Fast sequential reads. Immutable — never modified.
  Flushed SSTables are organized into levels (L0, L1, L2...).

Compaction (background, keeps read performance sane):
  Problem: as more SSTables accumulate, reads must check all of them for a key.
  Solution: compaction merges multiple SSTables into one larger sorted file.
  L0 → L1 → L2 compaction: each level is 10× larger than the previous.
  Compaction removes deleted (tombstoned) items and keeps only the latest version.

Write amplification vs read amplification tradeoff:
  LSM excels at writes (fast MemTable + WAL). Reads can check multiple SSTables (bloom filters help).
  B-tree (MySQL, PostgreSQL): excellent reads, painful random writes (page splits, random I/O).
  DynamoDB chose LSM because writes must be < 5ms even under load.`,
        },
        {
          title: "Read Path — MemTable + SSTable + Bloom Filters",
          content: `Read path (how GetItem works):
  1. Request arrives at storage node.
  2. Check MemTable first (in-memory, O(log n) binary search). Found? Return immediately.
  3. If not in MemTable: check L0 SSTables (newest on disk). Multiple L0 files, check all.
  4. If not found: check L1 SSTables, then L2...
  5. Once found: return item to router → client.

The problem: checking every SSTable for a missing key is O(files) — very slow.
Solution: Bloom filters.

Bloom filter per SSTable:
  A probabilistic data structure that answers "is key X in this SSTable?" in O(1) time.
  False positives possible (it says YES but key isn't there) → read SSTable anyway (wasted I/O).
  False negatives impossible (if it says NO, key is definitely not there) → skip SSTable entirely.
  Typical false positive rate: 1% with a reasonable filter size.
  Result: 99% of "not found" checks skip the SSTable entirely — massive read speedup.

Block cache:
  Frequently accessed SSTable blocks are cached in memory.
  DynamoDB allocates a large block cache on each storage node.
  Hot items stay in cache → reads served from RAM without any disk I/O.
  Cache miss: read from local SSD (NVMe) — still fast (< 0.5ms).

Strongly consistent reads:
  Default reads in DynamoDB are eventually consistent (may read from a replica slightly behind).
  Strongly consistent read: routes to the leader replica only.
  Cost: 2× the RCU of an eventually consistent read.
  Latency: slightly higher (must wait for leader, not nearest replica).
  Use when: reading your own writes, financial calculations, any "read-modify-write" sequence.`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Replication & Consistency",
      sections: [
        {
          title: "Multi-AZ Replication — Quorum Writes",
          content: `Every DynamoDB partition is replicated across 3 Availability Zones. This is synchronous replication — a write isn't ACKed until the quorum is reached.

Quorum model (W=2, R=1 for eventually consistent; R=2 for strongly consistent):
  N = 3 replicas total
  W = 2 (write must be acknowledged by 2 of 3 replicas before returning success)
  R = 1 (eventually consistent read: ask any 1 replica, return immediately)
  R = 2 (strongly consistent read: ask 2 replicas, return only if they agree)

Why W=2 guarantees durability:
  If 1 AZ goes down: 2 replicas still alive. Writes continue. Reads continue.
  If 2 AZs go down: DynamoDB suspends writes (can't reach W=2). Prevents split-brain.
  Recovery: when AZ comes back, leader pushes missed writes to recovering replica.

Leader election (Paxos):
  One of the 3 replicas is elected leader (using Paxos consensus).
  All writes go to the leader first → leader forwards to 2 replicas → ACK.
  Leader failure: remaining 2 replicas elect a new leader via Paxos in < 1 second.
  Client impact: ~1 second of elevated latency during leader failover (transparent).

Replication lag (eventual consistency window):
  After a write ACK, the 3rd replica may lag by 1–10 milliseconds.
  Eventually consistent read hitting the lagging replica: returns stale data.
  In practice: lag is usually < 10ms. For most applications, invisible.
  When stale data is unacceptable: use ConsistentRead=true (strongly consistent).`,
        },
        {
          title: "Global Tables — Multi-Region Active-Active",
          content: `DynamoDB Global Tables extends replication to multiple AWS regions. Every region is a fully writable primary — active-active multi-region.

How it works:
  • DynamoDB Streams captures every write in a region as a change event.
  • A replication service reads the stream and applies changes to all other regions.
  • Conflict resolution: last-writer-wins using timestamp from the originating region.

Replication lag: ~1 second between regions (cross-ocean network latency).
This means: a write in us-east-1 appears in ap-south-1 within ~1 second.
During that 1 second: a user reading from ap-south-1 may see stale data.

Conflict scenario:
  • User A writes item (PK=123, value="X") from India → ap-south-1.
  • User B writes item (PK=123, value="Y") from USA → us-east-1.
  • Both writes happen within the same 1-second replication lag window.
  • Conflict: both regions have different values for the same key.
  • Resolution: whichever write has the later timestamp wins. Loser is discarded.
  • This is last-write-wins — no merge, no conflict notification to app.

Use cases for Global Tables:
  • Gaming leaderboards: player data must be low-latency regardless of geography.
  • E-commerce: session data, cart — user always routes to nearest region.
  • Disaster recovery: if us-east-1 goes dark, us-west-2 takes over with < 1s data loss (RPO).

Global Tables cost: you pay for storage and I/O in every region. Replicated data costs N× for N regions.`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Indexing, Streams & Operations",
      sections: [
        {
          title: "Secondary Indexes — GSI and LSI",
          content: `The primary key supports only one access pattern. Secondary indexes let you query by different attributes.

Local Secondary Index (LSI):
  • Same partition key as the main table, different sort key.
  • Must be defined at table creation time (cannot add later).
  • Shares the 10 GB partition limit with the main table.
  • Use case: "get all orders for user_123 sorted by price" (same PK=userId, SK=price instead of date).

Global Secondary Index (GSI):
  • Completely different partition key and/or sort key.
  • Can be added to an existing table at any time.
  • Separate throughput capacity from the main table.
  • Eventually consistent with the main table (replication lag).
  • Use case: "get all orders with status=SHIPPED" — a different PK entirely.
  • Sparse index trick: only items that have the indexed attribute appear in the GSI.
    Put the attribute only on items you want to query → the GSI is small and cheap.

GSI fan-out (write amplification):
  Every write to the main table also writes to all GSIs.
  Table with 5 GSIs: each PutItem triggers 6 writes (1 table + 5 GSIs).
  Each GSI has its own WCU allocation — if any GSI runs out, writes to the table throttle.
  This is a common production pitfall: table WCU is fine, but a GSI is under-provisioned.

Overloading GSI for multi-access patterns:
  Use a generic GSI-PK attribute and GSI-SK attribute on items.
  Different entities set these to different values → same GSI serves many query types.
  This is the "single-table design" pattern — fewer tables, fewer GSIs, lower cost.`,
        },
        {
          title: "DynamoDB Streams & Event-Driven Architecture",
          content: `DynamoDB Streams is a time-ordered log of every change (INSERT, MODIFY, REMOVE) to a table. It's the change data capture (CDC) system for DynamoDB.

Stream record contents (configurable):
  KEYS_ONLY:      just the PK and SK of the changed item.
  NEW_IMAGE:      the new state of the item after the change.
  OLD_IMAGE:      the old state before the change.
  NEW_AND_OLD_IMAGES: both — useful for diff-based processing.

How it works:
  • Each table partition has its own stream shard.
  • Stream shards retain records for 24 hours.
  • Lambda can poll stream shards via event source mapping (serverless CDC).
  • Ordering guaranteed within a shard (partition) — across partitions, no ordering.

Common patterns:
  1. Replication: sync DynamoDB changes to Elasticsearch for full-text search.
     DynamoDB → Stream → Lambda → Elasticsearch index update.

  2. Aggregation: maintain a running count/sum without a scan.
     Order created → Stream → Lambda → atomically increment counter in another table.

  3. Audit log: capture every change to a compliance table (immutable append-only).

  4. Cross-region sync: Global Tables uses Streams internally for inter-region replication.

  5. Cache invalidation: item updated → Stream → Lambda → evict from Redis/ElastiCache.

Limitations:
  • 24-hour retention: consumer must keep up or records are lost.
  • Ordering: events from different partitions can arrive out of global order.
  • At-least-once delivery: Lambda may process the same record twice. Make consumers idempotent.`,
        },
        {
          title: "Service Mesh — Sidecar Proxy Pattern (Envoy/Istio)",
          content: `DynamoDB itself is fully managed and opaque — you never deploy
a sidecar inside it. But two layers around DynamoDB are very much
"your microservices," and both benefit from a mesh: (1) the client
services that call DynamoDB over the SDK, and (2) the Supporting
Services — Streams consumers, the Auto Scaling controller, and the
Global Tables replicator — which are themselves a fleet calling
each other and calling this table.

WHY A MESH FITS AROUND DYNAMODB:
• ProvisionedThroughputExceededException (DynamoDB's throttling
  error) is just another "backend overloaded, back off" signal from
  the mesh's point of view — the sidecar's retry + circuit-breaking
  policy handles it with zero application code change
• Connection pooling to the DynamoDB endpoint (HTTP/2 keep-alive,
  SigV4 signing overhead) is fiddly to get right per language — a
  sidecar terminates and reuses connections uniformly for every
  service
• The Supporting Services talk to each other AND to the table's
  endpoint — a mesh gives them service discovery and mTLS without
  each one re-implementing it

1. Data plane — one Envoy sidecar per calling service
   • Sidecar wraps every DynamoDB SDK call leaving the pod
   • Retries with backoff on throttling — the same idea as the AWS
     SDK's own retry logic, but now visible and tunable centrally
   • Circuit-breaks calls to a table/GSI that's consistently
     throttling, so one hot caller doesn't queue thousands of
     doomed requests
   • mTLS between the Supporting Services themselves (Streams
     consumer → aggregation service → cache-invalidation service)

2. Control plane — Istio / Consul / AWS App Mesh
   • Pushes "retry with backoff on throttling" as ONE policy to
     every service that touches this table
   • Maintains a live dependency map — "what breaks if Table X gets
     hot" — by tracking which services call which tables
   • Canary a new Streams-consumer version (e.g. a new Elasticsearch
     indexer) by shifting a % of stream-processing traffic

WHAT THIS BUYS AT FLEET SCALE:
• Uniform throttling behavior — every team backs off the same way,
  instead of 50 different retry implementations with different
  jitter/backoff bugs
• One signal for "DynamoDB is throttling us" — outlier detection on
  the sidecar surfaces it as a circuit-breaker trip before it
  cascades into the calling service's own latency SLA
• Zero-trust between the Supporting Services — Streams consumers,
  the Auto Scaling controller, and the Global Tables replicator
  authenticate to each other via mTLS, not shared IAM roles alone

DIAGRAM: the "SERVICE MESH" band inside the SUPPORTING SERVICES box
represents this — DynamoDB Streams, Auto Scaling, and Global Tables
are each their own service with an Envoy sidecar, and the mTLS /
load balancing / retry / circuit-breaking / tracing capabilities
apply uniformly across them and the client microservices that depend
on this table.

TRADE-OFFS:
• DynamoDB's own internal replication (Paxos quorum writes between
  storage nodes) is never meshed — that's AWS-managed and invisible
  to you; the mesh only covers YOUR services around it
• Sidecar retries can mask a genuinely under-provisioned table —
  alert on circuit-breaker trips, don't let retries silently absorb
  sustained throttling
• Adds ~1-2ms per hop to every DynamoDB call — negligible next to
  DynamoDB's own single-digit-ms latency, but worth knowing it's there`,
        },
      ],
    },
  ],
};

export const DYNAMODB_LLD = {
  title: "DynamoDB — Low Level Design",
  subtitle: "API contracts, schemas, and algorithms for DynamoDB's core internals",

  components: [
    {
      id: "data-model",
      title: "Table & Key Design",
      description: "DynamoDB API, single-table design patterns, access pattern modelling",
      api: `// Create table
aws dynamodb create-table \\
  --table-name Orders \\
  --attribute-definitions \\
      AttributeName=PK,AttributeType=S \\
      AttributeName=SK,AttributeType=S \\
      AttributeName=GSI1PK,AttributeType=S \\
      AttributeName=GSI1SK,AttributeType=S \\
  --key-schema \\
      AttributeName=PK,KeyType=HASH \\
      AttributeName=SK,KeyType=RANGE \\
  --global-secondary-indexes '[{
      "IndexName": "GSI1",
      "KeySchema": [
        {"AttributeName":"GSI1PK","KeyType":"HASH"},
        {"AttributeName":"GSI1SK","KeyType":"RANGE"}
      ],
      "Projection": {"ProjectionType":"ALL"}
  }]' \\
  --billing-mode PAY_PER_REQUEST

// Single-table design — multiple entity types in one table
// Entity: User
{
  "PK": "USER#u_123",
  "SK": "PROFILE",
  "name": "Aryan Aman",
  "email": "aryan@example.com",
  "GSI1PK": "EMAIL#aryan@example.com",  // enables: lookup user by email
  "GSI1SK": "USER#u_123"
}

// Entity: Order (child of User)
{
  "PK": "USER#u_123",           // same PK as user → co-located
  "SK": "ORDER#2026-06-01#o_456",
  "status": "SHIPPED",
  "total": 2499,
  "GSI1PK": "STATUS#SHIPPED",   // enables: "get all SHIPPED orders" via GSI
  "GSI1SK": "2026-06-01#o_456"
}

// Access patterns enabled by this design:
// 1. GetItem(PK=USER#u_123, SK=PROFILE)             → fetch user profile
// 2. Query(PK=USER#u_123, SK begins_with ORDER#)    → all orders for user
// 3. Query(GSI1, PK=EMAIL#aryan@example.com)        → lookup user by email
// 4. Query(GSI1, PK=STATUS#SHIPPED, SK > 2026-01-01)→ all shipped orders in 2026`,

      internals: `Partition key selection algorithm:

  Good partition key:
    - High cardinality (millions of distinct values)
    - Uniform access distribution (no one key is "hot")
    - Stable (doesn't change after creation — changing PK requires delete + reinsert)

  Detecting hot partitions:
    CloudWatch metric: ConsumedWriteCapacityUnits per partition (via Contributor Insights)
    If any single partition > 50% of total WCU → hot partition problem

  Write sharding (hot key mitigation):
    // Spread writes across N shards
    const SHARD_COUNT = 10
    func shardedKey(userId string) string {
      shard := hash(userId) % SHARD_COUNT
      return \`USER#\${userId}#\${shard}\`
    }
    // Read: must query all 10 shard keys and merge results
    // Tradeoff: reads are N× more expensive but writes are distributed

  Composite sort key patterns:
    SK = "ORDER#2026-06-01#shipped#o_456"

    Query with begins_with:   SK begins_with "ORDER#2026"   → all 2026 orders
    Query with between:       SK between "ORDER#2026-01-01" AND "ORDER#2026-03-31"
    Query with filter:        SK begins_with "ORDER#" AND filter status = SHIPPED
    (Note: filter is post-fetch — doesn't reduce read cost, only the result set)`,
    },
    {
      id: "lsm-engine",
      title: "LSM Tree Storage Engine",
      description: "Write path, MemTable, SSTable, compaction, and bloom filters",
      api: `// Internal storage node interface (not public — illustrates the engine)

// WAL entry (appended on every write, binary format)
struct WALEntry {
  sequence_number: uint64   // monotonically increasing
  operation:       uint8    // PUT=1, DELETE=2
  partition_key:   []byte
  sort_key:        []byte
  value:           []byte   // full item JSON, compressed (LZ4)
  checksum:        uint32   // CRC32 of above fields
  timestamp:       int64    // Unix nanoseconds
}

// MemTable (in-memory, one per storage node, ~64 MB target)
// Backed by a skip list — O(log n) insert, O(log n) lookup, O(n) sorted iteration
MemTable {
  skiplist: SkipList<Key, Value>
  size_bytes: int
  max_size: 64 * 1024 * 1024  // 64 MB
}

// SSTable file layout (on NVMe SSD)
SSTable {
  data_blocks: []DataBlock       // sorted key-value pairs, 4 KB blocks
  index_block: []IndexEntry      // {first_key → file_offset} for binary search
  bloom_filter: []byte           // 10 bits/key, 1% false positive rate
  metadata: {
    min_key, max_key,
    entry_count, file_size,
    level, sequence_range
  }
}

// Compaction (Level 0 → Level 1 merge)
func compact(l0Files []SSTable, l1File SSTable) SSTable {
  // k-way merge of sorted files (like merge sort)
  iterators := []*SSTIterator{}
  for _, f := range append(l0Files, l1File) {
    iterators = append(iterators, f.Iterator())
  }
  heap := NewMinHeap(iterators)   // heap-based k-way merge: O(n log k)
  output := NewSSTableWriter()
  for !heap.Empty() {
    entry := heap.Pop()
    if entry.IsDelete() { continue }  // drop tombstones during compaction
    output.Write(entry)
  }
  return output.Finish()
}`,

      internals: `Write path (full trace of a PutItem):

  func PutItem(pk, sk string, item map[string]Value) error {
    // 1. Write to WAL (synchronous, sequential I/O — fastest possible write)
    seq := wal.Append(WALEntry{Op: PUT, PK: pk, SK: sk, Value: encode(item)})

    // 2. Write to MemTable (in-memory skip list, O(log n))
    memTable.Put(compositeKey(pk, sk), item)

    // 3. Replicate to 2 other AZ replicas (parallel, wait for 2/3 ACK)
    acks := 0
    for _, replica := range replicas[1:] {
      go func(r Replica) {
        r.Replicate(seq, pk, sk, item)
        acks++
      }(replica)
    }
    waitFor(acks >= 2, timeout=5ms)

    // 4. Return success to client
    return nil
  }

  Background: MemTable flush trigger:
    if memTable.SizeBytes() > 64*MB {
      frozen = memTable          // freeze current, accept writes to new one
      go flushToSSTable(frozen)  // async flush — doesn't block writes
    }

  Bloom filter construction (during SSTable flush):
    filter = NewBloomFilter(entries=len(items), falsePositiveRate=0.01)
    for item in sorted_items {
      filter.Add(compositeKey(item.PK, item.SK))
    }
    // Size: ~10 bits per key at 1% FPR
    // 10M items → 12.5 MB filter (fits in RAM easily)

  Read path with bloom filter:
    func GetItem(pk, sk string) (Value, error) {
      key := compositeKey(pk, sk)
      // Check MemTable first (most recent writes)
      if v, ok := memTable.Get(key); ok { return v, nil }
      // Check SSTables newest-first
      for level := 0; level <= maxLevel; level++ {
        for _, sst := range levels[level] {
          if !sst.bloomFilter.MayContain(key) { continue }  // skip if definitely absent
          if !sst.KeyInRange(key) { continue }               // skip if outside min/max key
          if v, ok := sst.Get(key); ok { return v, nil }    // binary search in index block
        }
      }
      return nil, ErrNotFound
    }`,
    },
    {
      id: "consistent-hashing",
      title: "Partition Manager",
      description: "Consistent hashing ring, virtual nodes, partition splits",
      api: `// Partition metadata (stored in a central metadata service)
Partition {
  partition_id:    string          // UUID
  key_range_start: []byte         // inclusive lower bound of hash range
  key_range_end:   []byte         // exclusive upper bound
  leader_node:     string          // current leader (AZ-a storage node)
  replica_nodes:   []string        // 2 followers (AZ-b, AZ-c)
  size_bytes:      int64
  rcu_consumed:    int             // last-minute rolling average
  wcu_consumed:    int
  status:          string          // ACTIVE | SPLITTING | MERGING
}

// Routing table (cached at request router, refreshed every 30s)
// Maps hash range → partition metadata
RoutingTable {
  entries: []RoutingEntry{
    { start: 0x0000, end: 0x1FFF, partitionId: "p_001", leaderNode: "node_az_a_01" },
    { start: 0x2000, end: 0x3FFF, partitionId: "p_002", leaderNode: "node_az_a_05" },
    ...
  }
}

// Request router looks up partition for a given PK:
func routeRequest(partitionKey string) Node {
  hash := murmur3(partitionKey) % RING_SIZE
  entry := routingTable.BinarySearch(hash)  // O(log p) where p = number of partitions
  return entry.leaderNode
}`,

      internals: `Consistent hashing ring with virtual nodes:

  Ring size: 2^32 positions (0 to 4,294,967,295)
  Virtual nodes per physical node: 256 (default)
  Physical nodes in a region: hundreds to thousands

  Node join:
    newNode = StorageNode{id: "node_az_a_99"}
    vnodes = pickVNodePositions(newNode.id, count=256)  // deterministic hash of node ID
    for each vnode in vnodes:
      // Steal a slice of the ring from the current owner
      currentOwner = ring.FindOwner(vnode.position)
      transferData(from=currentOwner, to=newNode, range=vnode.keyRange)
      ring.Insert(vnode)
    // Only 1/N of total data moves (N = number of nodes in ring)

  Partition split (triggered when partition exceeds 10 GB or throughput limit):
    func splitPartition(p Partition) {
      midpoint := (p.KeyRangeStart + p.KeyRangeEnd) / 2
      // Create two child partitions
      left  = Partition{Start: p.Start,    End: midpoint, replicas: ...}
      right = Partition{Start: midpoint+1, End: p.End,    replicas: ...}
      // Copy data: leader streams its SSTable to new partition leaders
      streamData(p.Leader, left.Leader, range=[p.Start, midpoint])
      streamData(p.Leader, right.Leader, range=[midpoint+1, p.End])
      // Atomic swap in routing table
      routingTable.Replace(p, [left, right])
      // Old partition remains active during split (zero downtime)
      decommission(p)
    }

  Adaptive capacity (burst handling):
    Each partition has a token bucket for RCU and WCU.
    DynamoDB "borrows" unused capacity from colder partitions during spikes.
    Up to 5 minutes of burst capacity can be accumulated.
    After burst is exhausted: throttle with ProvisionedThroughputExceededException.`,
    },
    {
      id: "replication",
      title: "Replication & Consensus",
      description: "Paxos leader election, quorum writes, failure handling",
      api: `// Replication protocol (internal, per-partition)
// Leader receives all writes, forwards to followers

// Write replication message
ReplicationMsg {
  sequence: uint64           // WAL sequence number (monotonic)
  operation: PUT | DELETE
  pk, sk:   string
  value:    []byte
  timestamp: int64
  checksum: uint32
}

// Quorum write (W=2 of N=3)
func leaderWrite(msg ReplicationMsg) error {
  // Write locally first
  localStorage.Append(msg)
  ackCount := 1  // leader counts as one ACK

  // Replicate to followers in parallel
  results := make(chan error, 2)
  for _, follower := range followers {
    go func(f Follower) {
      results <- f.Replicate(msg, timeout=5ms)
    }(follower)
  }

  // Wait for at least 1 follower ACK (total = 2 = quorum)
  for i := 0; i < 2; i++ {
    err := <-results
    if err == nil {
      ackCount++
      if ackCount >= 2 { return nil }  // quorum reached
    }
  }
  return ErrQuorumFailed  // both followers failed — very rare
}

// Strongly consistent read
func strongRead(pk, sk string) (Value, error) {
  // Leader serves read from its own storage (already has latest write)
  // Follower reads check they're not lagging behind leader
  leaderSeq := leader.GetLatestSequence()
  if localSeq < leaderSeq {
    waitForReplication(leaderSeq)  // catch up before serving
  }
  return localStorage.Get(pk, sk)
}`,

      internals: `Paxos leader election (simplified):

  States: FOLLOWER | CANDIDATE | LEADER
  Each replica has an election timeout: random 150–300ms

  Normal operation:
    Leader sends heartbeat to followers every 50ms.
    Follower resets its election timeout on each heartbeat.

  Leader failure detection:
    Follower misses 3 heartbeats (150ms) → assumes leader dead → becomes CANDIDATE
    CANDIDATE sends RequestVote to all replicas:
      RequestVote{ term: currentTerm+1, candidateId: self, lastLogSeq: mySeq }
    Replica votes YES if:
      candidate's term > my term AND candidate's log is at least as up-to-date as mine
    CANDIDATE wins election if it gets votes from 2/3 replicas (quorum)
    New leader immediately sends heartbeats to assert leadership

  Log replication after failover:
    New leader may be missing some writes (follower that was slightly behind).
    Leader compares its log with followers'.
    Followers that are ahead: leader catches up from them.
    Followers that are behind: leader sends missing entries (replay).
    Log convergence guaranteed before serving any new writes.

  Split-brain prevention:
    Terms: each election increments the term number.
    Old leader (if it somehow wakes up) has a lower term → rejected by all replicas.
    Only the latest-term node can be leader.

  Client impact of failover:
    Writes during election: client gets timeout → retries → new leader accepts.
    Reads during election: temporarily unavailable (< 300ms).
    DynamoDB SDK: built-in retry with exponential backoff — handles this transparently.`,
    },
    {
      id: "gsi",
      title: "GSI & Streams Engine",
      description: "Global Secondary Index fan-out, DynamoDB Streams CDC pipeline",
      api: `// GSI write fan-out (triggered on every table write)
// Happens synchronously within the write path

func applyGSIUpdate(tablePK, tableSK string, oldItem, newItem Item, gsis []GSI) {
  for _, gsi := range gsis {
    oldGsiPK := oldItem.GetAttr(gsi.PKAttr)
    newGsiPK := newItem.GetAttr(gsi.PKAttr)

    if oldGsiPK != nil && oldGsiPK != newGsiPK {
      // Remove old entry from GSI partition
      gsiPartition(gsi, oldGsiPK).Delete(oldItem.GetAttr(gsi.SKAttr), tablePK, tableSK)
    }
    if newGsiPK != nil {
      // Insert/update in GSI partition
      projectedItem := project(newItem, gsi.ProjectionType, gsi.ProjectedAttrs)
      gsiPartition(gsi, newGsiPK).Put(newItem.GetAttr(gsi.SKAttr), tablePK, tableSK, projectedItem)
    }
  }
}

// DynamoDB Streams shard (one per table partition)
StreamShard {
  shard_id:         string
  partition_id:     string         // linked table partition
  sequence_start:   string
  sequence_end:     string         // open if shard still active
  parent_shard_id:  string         // set when parent split into children
}

// Stream record (what consumers receive)
StreamRecord {
  eventID:      string             // unique per event
  eventName:    "INSERT" | "MODIFY" | "REMOVE"
  dynamodb: {
    keys:       {PK: ..., SK: ...}
    newImage:   {... full new item ...}  // if NEW_IMAGE or NEW_AND_OLD_IMAGES
    oldImage:   {... full old item ...}  // if OLD_IMAGE or NEW_AND_OLD_IMAGES
    sequenceNumber: "123456789"
    sizeBytes:  int
    streamViewType: "NEW_AND_OLD_IMAGES"
    approximateCreationDateTime: timestamp
  }
}

// Lambda event source mapping (polling interval: 100ms)
// Lambda function triggered with batch of up to 10,000 records per shard`,

      internals: `GSI consistency model:

  GSI writes are synchronous with the table write (same transaction):
    PutItem(table) → atomically also writes to all GSI partitions
    If GSI write fails: entire PutItem fails (atomicity preserved)
    But GSI partition lives on different storage nodes → it's "eventually consistent"
    In practice: GSI lag is milliseconds (same datacenter, different partition)

  GSI hot partition risk:
    Table PK: userId (high cardinality, uniform)
    GSI PK: status (3 values: PENDING, ACTIVE, CLOSED)
    → ALL writes go to one of 3 GSI partitions
    → GSI partitions become hot (WCU bottleneck)
    Solution: add cardinality to GSI PK: status#shard (status#0 ... status#9)
    Query: must query all 10 shards, merge results client-side

  DynamoDB Streams internals:
    Each table partition maintains an append-only change log alongside the SSTable.
    Change log entry written atomically with WAL entry (same I/O operation).
    Streams service reads change log, serializes into StreamRecords.
    Shard splits mirror table partition splits (parent shard closed, two child shards open).
    Consumers must process parent shard to completion before child shards (ordering guarantee).

  Idempotent stream processing:
    Streams guarantees at-least-once delivery.
    Consumer must handle duplicate events:
      Strategy 1: use eventID as idempotency key in target store (Elasticsearch, Redis)
      Strategy 2: conditional write — "only update if version < stream record's sequence"
      Strategy 3: make the operation naturally idempotent (set, not increment)`,
    },
    {
      id: "serviceMesh",
      title: "Service Mesh — Envoy/Istio Config (LLD)",
      description: "Sidecar traffic policy for services calling DynamoDB: circuit breaking on throttling, retries, canary Streams consumers, and mTLS between the Supporting Services",
      api: `# === Part 1: calls FROM your services TO DynamoDB ===

# ServiceEntry — registers the DynamoDB endpoint in the mesh's
# service registry (DynamoDB is MESH_EXTERNAL — AWS-managed)
apiVersion: networking.istio.io/v1beta1
kind: ServiceEntry
metadata:
  name: dynamodb-orders-table
spec:
  hosts: ["dynamodb.us-east-1.amazonaws.com"]
  location: MESH_EXTERNAL
  ports: [{ number: 443, name: https, protocol: TLS }]
  resolution: DNS

---
# DestinationRule — circuit-break on sustained throttling
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: dynamodb-orders-table
spec:
  host: dynamodb.us-east-1.amazonaws.com
  trafficPolicy:
    connectionPool:
      tcp: { maxConnections: 200 }
      http: { http1MaxPendingRequests: 100, maxRequestsPerConnection: 0 }
    outlierDetection:            # ProvisionedThroughputExceededException
      consecutive5xxErrors: 5    # remapped 400→5xx via EnvoyFilter
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50

---
# VirtualService — bounded retry-with-backoff on throttling
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: dynamodb-orders-table
spec:
  hosts: ["dynamodb.us-east-1.amazonaws.com"]
  http:
    - route:
        - destination: { host: dynamodb.us-east-1.amazonaws.com }
      retries:
        attempts: 3
        perTryTimeout: 50ms
        retryOn: 5xx,reset,connect-failure

---
# === Part 2: traffic BETWEEN your services around the table ===

# DestinationRule — canary a new Streams-consumer version
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: streams-consumer
spec:
  host: streams-consumer.prod.svc.cluster.local
  trafficPolicy:
    loadBalancer:
      simple: LEAST_REQUEST
  subsets:
    - name: v1
      labels: { version: v1 }
    - name: v2
      labels: { version: v2 }

---
# VirtualService — shift 5% of stream records to the new indexer
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: streams-consumer
spec:
  hosts: ["streams-consumer.prod.svc.cluster.local"]
  http:
    - route:
        - destination: { host: streams-consumer.prod.svc.cluster.local, subset: v1 }
          weight: 95
        - destination: { host: streams-consumer.prod.svc.cluster.local, subset: v2 }
          weight: 5

---
# PeerAuthentication — mTLS between YOUR services; DynamoDB itself
# sits outside the mesh and is reached over SigV4-signed TLS
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: prod
spec:
  mtls: { mode: STRICT }`,
      internals: `Sidecar injection:
• Every pod (order-service, streams-consumer, aggregation-service)
  gets an Envoy sidecar auto-injected via a Kubernetes mutating
  webhook
• The ServiceEntry above is what lets the sidecar apply policy to
  calls that LEAVE the mesh toward dynamodb.us-east-1.amazonaws.com
  — without it, Envoy treats the call as opaque TCP passthrough

Why outlierDetection on a 400, not a 5xx:
• DynamoDB returns HTTP 400 + ProvisionedThroughputExceededException
  for throttling — NOT a 5xx
• An EnvoyFilter (Lua or WASM) inspects the response body and
  remaps this specific 400 to a 5xx BEFORE outlierDetection
  evaluates it, so the circuit breaker ejects the endpoint the same
  way it would for a real backend 5xx

Retry-with-backoff vs. the AWS SDK's built-in retries:
• The AWS SDK already retries with exponential backoff + jitter —
  the mesh's retries are a SECOND layer, capped at perTryTimeout:
  50ms so a retry storm can't compound with the SDK's own retries
• In practice teams pick ONE layer to own retries (usually the SDK)
  and set the mesh's retries.attempts to 0 for DynamoDB calls — the
  ServiceEntry + outlierDetection (circuit breaking) is the part
  that earns its keep here

Canary rollout flow (streams-consumer v2):
  1. Deploy streams-consumer:v2 alongside v1 (same K8s Service)
  2. VirtualService routes 5% of stream records to v2
  3. Watch v2's error rate / processing lag on its own dashboard
  4. Shift weight 5% → 25% → 100%, or roll back to 0% instantly

mTLS scope:
• PeerAuthentication STRICT covers order-service ↔ streams-consumer
  ↔ aggregation-service — all YOUR traffic
• DynamoDB itself is outside the mesh's CA — calls to it are
  authenticated via SigV4 + AWS-managed TLS, a separate trust domain

Control-plane-down failure mode:
• Sidecars cache the last-known DestinationRule/VirtualService and
  keep enforcing it — a control-plane outage doesn't stop existing
  traffic to DynamoDB or between streams-consumer versions
• New pods can't fetch policy until the control plane recovers, but
  the canary split already in effect remains stable`,
    },
  ],
};

export const DYNAMODB_QNA = [
  {
    id: "ddb-q1",
    category: "Architecture",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Amazon", "Meta", "Google"],
    question: "Explain consistent hashing and why DynamoDB uses virtual nodes.",
    answer: `Consistent hashing places both data keys and storage nodes on a conceptual ring of hash values (0 to 2^32). A key is hashed to a position on the ring and stored on the nearest node clockwise.

Why it's better than modular hashing:
With modular hashing (key % N nodes), adding one node rehashes and moves ~50% of all data. With consistent hashing, adding one node only moves 1/N of data — just the keys in its new arc.

Why virtual nodes (vnodes)?
Without vnodes, each physical node owns one large arc. A new node takes exactly one arc from one neighbour → unbalanced load. With vnodes (DynamoDB uses ~256 per node), each physical node owns 256 small arcs scattered around the ring. When a node joins, it takes small slices from many neighbours → load distributes evenly. When a node fails, its 256 arcs are redistributed across 256 different neighbours — no single node becomes a hotspot.

Additional benefit: hot partition isolation. If one key range is overwhelmingly popular, its vnode can be migrated to a dedicated, high-capacity storage node without moving other data.`,
    followups: ["How does consistent hashing behave when a node fails vs when one is added?", "What is the minimum number of vnodes needed to ensure uniform distribution?"],
  },
  {
    id: "ddb-q2",
    category: "Database Design",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Amazon", "Google", "Facebook"],
    question: "How does DynamoDB's LSM Tree achieve single-digit millisecond write latency?",
    answer: `The key insight: disk random writes are slow (~1ms per operation). LSM Tree avoids them entirely on the write path.

Write path:
1. WAL append: sequential write to a log file (~0.1ms). Sequential I/O is 10-100× faster than random I/O on HDD; near-instant on NVMe SSD.
2. MemTable insert: in-memory skip list update (~0.01ms). Pure RAM operation.
3. Replicate to 2 of 3 followers in parallel and await quorum.
4. ACK client.

Total write time: dominated by network replication (cross-AZ RTT ~1-2ms) + WAL (~0.1ms). No disk random I/O on the critical path.

The tradeoff: reads are more complex. Data may be in MemTable, L0, L1, or deeper SSTables — requires checking multiple locations. Bloom filters (probabilistic, O(1) per SSTable) eliminate most unnecessary SSTable reads. Block caching keeps hot data in RAM. Hot item reads effectively become pure RAM operations matching write speed.

Compaction (background): merges SSTables to reduce read amplification. Happens asynchronously, doesn't affect write or read latency in the foreground.`,
    followups: ["How does compaction affect read and write latency when it's running?", "Compare LSM Tree vs B-Tree for a read-heavy vs write-heavy workload."],
  },
  {
    id: "ddb-q3",
    category: "Fault Tolerance",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Amazon", "Microsoft", "Google"],
    question: "Design DynamoDB's quorum replication. What happens during a leader failure?",
    answer: `Quorum configuration: N=3 replicas, W=2 (write quorum), R=1 or R=2 (eventually/strongly consistent reads).

Normal write flow:
1. Client → Request Router → Leader node (in primary AZ).
2. Leader writes to WAL locally, then replicates to 2 follower nodes in parallel.
3. Leader waits for ACK from at least 1 follower (total = 2 = quorum). Returns success.
4. 3rd replica catches up asynchronously.

Leader failure detection and election (Paxos):
1. Followers monitor heartbeats (every 50ms). After missing 3 heartbeats (~150ms), a follower becomes candidate.
2. Candidate increments its term and broadcasts RequestVote.
3. Replicas vote YES if: candidate's term > theirs AND candidate's log is as up-to-date as theirs.
4. Candidate needs 2/3 votes (quorum). New leader immediately sends heartbeats.

Log reconciliation: new leader may be missing the last few writes (if it was the lagging replica). It catches up from the other follower before accepting new writes. This ensures no committed write is lost — committed means ACKed by quorum, so at least 2 nodes have it, and the new leader is one of the remaining 2.

Client impact: ~150-300ms of write unavailability during failover. DynamoDB SDK retries with backoff, making this transparent to most applications.`,
    followups: ["What is split-brain and how does the term-based Paxos approach prevent it?", "Can a write be ACKed to the client but then lost? Under what conditions?"],
  },
  {
    id: "ddb-q4",
    category: "Database Design",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Amazon", "Netflix", "Lyft"],
    question: "What is the single-table design pattern and when should you use it?",
    answer: `Single-table design stores multiple entity types in one DynamoDB table by overloading the PK and SK with entity-type prefixes. A user, their orders, and their addresses all live in one table.

Example:
  PK=USER#123, SK=PROFILE → user record
  PK=USER#123, SK=ORDER#2026-01-15#o_456 → order
  PK=USER#123, SK=ADDR#home → address

This lets one Query fetch the user and all their orders in a single request — eliminating the need for application-level joins.

When to use:
• Access patterns are well-known and stable (model data around queries, not around entities).
• You need to co-locate related entities for efficient single-request retrieval.
• You want to minimize GSIs and cost.

When NOT to use:
• Access patterns are highly variable or evolving — schema changes require table rebuilds.
• Multiple teams own different entities — a single table creates coupling and access control complexity.
• You're doing analytics or ad-hoc queries — DynamoDB is a poor fit regardless of schema style.

The pattern requires discipline: you must know all access patterns upfront and design PK/SK to satisfy them. Retrofitting a poorly designed table is painful (requires a full data migration since you can't change PK/SK on existing items).`,
    followups: ["How do you handle a new access pattern that wasn't anticipated in the original single-table design?"],
  },
  {
    id: "ddb-q5",
    category: "Scale & Performance",
    difficulty: "Medium",
    round: "System Design Round",
    asked_at: ["Amazon", "Netflix", "Uber"],
    question: "What is a hot partition in DynamoDB and how do you fix it?",
    answer: `A hot partition occurs when a disproportionate share of read/write traffic goes to a single partition key, exhausting that partition's throughput (3,000 RCU or 1,000 WCU) while other partitions sit idle.

Common causes:
• Low-cardinality PK: status (PENDING/ACTIVE/CLOSED) — all writes land on 3 partitions.
• Time-based PK: "today" or "latest" — everyone reads/writes the same recent partition.
• Celebrity problem: one userId generates 10,000× more reads than average.

Solutions:

1. Write sharding: append a random suffix (0–9) to the PK.
   Original: PK = "STATUS#PENDING"
   Sharded:  PK = "STATUS#PENDING#3"  (random 0-9)
   Write: pick random shard. Read: query all 10 shards, merge results. 10× throughput.

2. Caching: for read-heavy hot keys, put Redis/ElastiCache in front. The hot item is served from cache — DynamoDB never sees the volume.

3. Adaptive capacity: DynamoDB automatically borrows unused capacity from cold partitions to hot ones (up to 5 minutes of burst). Not a long-term fix.

4. Redesign the access pattern: if status is always queried, use a GSI with a sharded PK. If a specific item is always hot, cache it.`,
    followups: ["How would you detect a hot partition before it causes throttling in production?", "With write sharding, how do you efficiently query across all shards?"],
  },
  {
    id: "ddb-q6",
    category: "Architecture",
    difficulty: "Medium",
    round: "Deep Dive",
    asked_at: ["Amazon", "Netflix", "Airbnb"],
    question: "Explain DynamoDB Streams and three real-world use cases.",
    answer: `DynamoDB Streams is a time-ordered, 24-hour log of every change (INSERT/MODIFY/REMOVE) to a table. Each table partition has its own stream shard. Stream records are delivered at-least-once — consumers must be idempotent.

Three use cases:

1. Search indexing (DynamoDB → Elasticsearch):
   Lambda consumes the stream. On INSERT/MODIFY, Lambda indexes the new item in Elasticsearch. On REMOVE, Lambda deletes from the index. Users get DynamoDB's write speed plus Elasticsearch's full-text search — two query models from one write.

2. Event-driven aggregation (no scan needed):
   Order created → stream record → Lambda increments daily revenue counter in a separate DynamoDB table using a conditional atomic write. Maintains a live dashboard counter without ever running an expensive Scan.

3. Cache invalidation:
   Item updated in DynamoDB → stream → Lambda → Redis DEL for that item's cache key. Ensures Redis cache never serves stale data. The stream is the bridge between the source of truth and the cache.

Ordering caveat: events within a single partition are ordered by sequence number. Events across different partitions have no global ordering guarantee. Design consumers to tolerate out-of-order cross-partition events.`,
    followups: ["How do you handle a Lambda consumer that falls behind and risks losing 24h-old stream records?", "How do you ensure exactly-once processing when Streams guarantees at-least-once?"],
  },
  {
    id: "ddb-q7",
    category: "Database Design",
    difficulty: "Medium",
    round: "System Design Round",
    asked_at: ["Amazon", "Lyft", "Stripe"],
    question: "What is the difference between GSI and LSI in DynamoDB? When do you choose each?",
    answer: `Local Secondary Index (LSI):
• Same partition key as the base table, different sort key.
• Must be created at table creation time — cannot add later.
• Shares the 10 GB partition limit with the base table (data co-located).
• Strongly consistent reads supported (data is local to the same partition).
• Use when: you need to sort/filter items within the same partition by a different attribute.
  Example: PK=userId, SK=price (instead of date) — "get all orders for user sorted by price".

Global Secondary Index (GSI):
• Completely different partition key (and optional sort key).
• Can be added to an existing table at any time.
• Separate storage (different partitions, possibly different nodes).
• Eventually consistent only (replication lag from base table).
• Has its own provisioned throughput (separate RCU/WCU allocation).
• Use when: you need to query by a totally different attribute across all partitions.
  Example: PK=status, SK=createdAt — "get all PENDING orders from last 7 days".

Key pitfall with GSI: every write to the base table also writes to all GSIs. Each GSI consumes WCU. A GSI with a low-cardinality PK (like status) will have hot partitions — same problem as a hot base table.`,
    followups: ["A table has 5 GSIs. What's the write amplification and how does it affect cost?", "Can you add an LSI to a table after it has data in it? Why or why not?"],
  },
  {
    id: "ddb-q8",
    category: "Database Design",
    difficulty: "Medium",
    round: "Screening",
    asked_at: ["Amazon", "Meta", "Twitter"],
    question: "How does DynamoDB handle eventual vs strong consistency and what's the cost?",
    answer: `DynamoDB defaults to eventually consistent reads. You opt into strongly consistent reads per-request.

Eventually consistent (default):
• Read routed to any of the 3 replicas (usually the nearest for low latency).
• Possible to read stale data if the replica is slightly behind the leader (lag: typically < 10ms).
• Cost: 1 RCU per 4 KB read.
• Use for: most reads where millisecond-old data is acceptable (feeds, recommendations, counters).

Strongly consistent:
• Read routed exclusively to the leader replica.
• Leader has the latest write — no stale data possible.
• Cost: 2 RCU per 4 KB read (double the cost).
• Latency: slightly higher (must reach leader specifically, not nearest replica).
• Use for: read-your-own-writes, financial balances, inventory counts, any read-modify-write pattern.

Read-modify-write atomicity:
  If you read a value and update based on it, eventually consistent reads can cause lost updates:
    Thread A reads count=5, Thread B reads count=5 → both write 6 → lost an increment.
  Solution: use DynamoDB's conditional writes:
    UpdateItem with ConditionExpression="count = :expected"
    → fails if count changed since read → retry
  This gives optimistic concurrency control without needing strong reads.`,
    followups: ["Name three operations in an e-commerce app where you would always use strongly consistent reads."],
  },
  {
    id: "ddb-q9",
    category: "Architecture",
    difficulty: "Easy",
    round: "Screening",
    asked_at: ["Amazon", "Google", "Microsoft"],
    question: "What happens to a DynamoDB partition when it exceeds 10 GB or hits throughput limits?",
    answer: `DynamoDB automatically splits the partition — no manual intervention, no downtime.

Trigger conditions:
• Partition exceeds 10 GB of data, OR
• Partition consistently hits its throughput ceiling (3,000 RCU or 1,000 WCU).

Split process:
1. DynamoDB finds the midpoint of the partition's key hash range.
2. Creates two child partitions: lower half and upper half.
3. Data is streamed from the original partition's leader to the two new partition leaders.
4. Original partition remains active and serves requests during the split.
5. Routing table atomically updated: original entry replaced with two new entries.
6. Original partition decommissioned after traffic drains to children.

Throughput after split:
• Each child gets half the key range but also half the previously concentrated load.
• Each child has its own full throughput allocation (3,000 RCU + 1,000 WCU).
• Effective throughput doubles for that key range.

Important: DynamoDB never merges partitions back. Once split, always split. This means if you had a temporary spike, you keep the extra partition capacity — which is actually beneficial (more headroom), but also means partition count grows monotonically over time.`,
    followups: ["If DynamoDB never merges partitions, what's the long-term implication for a table that had one big spike years ago?"],
  },
  {
    id: "ddb-q10",
    category: "Database Design",
    difficulty: "Easy",
    round: "Screening",
    asked_at: ["Amazon", "Google", "Meta"],
    question: "What is a bloom filter and how does DynamoDB use it to speed up reads?",
    answer: `A bloom filter is a probabilistic data structure that answers "is this key in this set?" in O(1) time using a fixed-size bit array.

How it works:
• On build: for each key, hash it with K different hash functions, set K bits in the array.
• On query: hash the lookup key with the same K functions, check if all K bits are set.
  If any bit is 0 → key DEFINITELY NOT in the set (no false negatives).
  If all bits are 1 → key PROBABLY in the set (false positives possible at ~1% rate).

DynamoDB's use: each SSTable (on-disk sorted file) has a bloom filter built from all keys it contains. Before reading an SSTable to look up a key:
  1. Check bloom filter: O(1) bit checks.
  2. If filter says NO: skip this SSTable entirely. No disk I/O.
  3. If filter says MAYBE: read the SSTable (binary search via index block).

Without bloom filters: a GetItem for a non-existent key would read every SSTable at every level until giving up. With bloom filters: 99% of "key doesn't exist in this SSTable" checks require zero disk I/O.

Tradeoff: bloom filter size. 10 bits per key gives ~1% false positive rate. At 10M keys per SSTable, the filter is 12.5 MB — easily kept in RAM. False positives waste one SSTable read; they never return wrong data.`,
    followups: ["Can you ever get a false negative from a bloom filter? What does that imply about its safety for this use case?"],
  },
  {
    id: "ddb-q11",
    category: "Estimation",
    difficulty: "Medium",
    round: "System Design Round",
    asked_at: ["Amazon", "Google", "Microsoft"],
    question: "Before designing a table's partition layout, walk me through a back-of-the-envelope estimation for a large DynamoDB table.",
    answer: `This is the "size before you design" step — every partitioning
and throughput decision downstream depends on these numbers.

STATE YOUR ASSUMPTIONS OUT LOUD:
• Table size: ~100 TB, sustained 1M requests/sec
• Average item size: ~1 KB (well under the 400 KB limit)
• Per-partition limits: 10 GB storage, 3,000 RCU + 1,000 WCU
• Replication: 3 synchronous replicas across 3 AZs
• MemTable flush threshold: ~64 MB
• Global Tables cross-region lag target: ~1 second

DERIVE THE NUMBERS THAT MATTER:

1. Partition count (decides the routing table size)
   100 TB ÷ 10 GB per partition ≈ 10,000 partitions
   → The Partition Metadata Cache needs O(log p) binary search over
     10,000 entries — this is WHY it's a cached, periodically
     refreshed routing table, not a live lookup per request

2. Aggregate throughput ceiling (decides why hot partitions matter)
   10,000 partitions × 3,000 RCU ≈ 30M RCU/sec theoretical ceiling
   → 1M req/sec average is only ~3% of that, but a SINGLE partition
     over 3,000 RCU throttles regardless of table-wide headroom —
     this is WHY write sharding exists

3. MemTable flush rate (decides compaction load)
   1,000 WCU × ~1 KB/write ≈ ~1 MB/sec sustained writes/partition
   64 MB ÷ 1 MB/sec ≈ ~64 seconds between flushes
   → Each storage node flushes a new L0 SSTable roughly every
     minute under load — compaction is continuous, not occasional

4. Replication fan-out (decides why cross-region lag is ~1s, not 0)
   1M writes/sec × 2 follower replicas ≈ 2M replication RPCs/sec
   → That's the ceiling for synchronous same-region replication;
     cross-region adds RTT, so Global Tables accept ~1s lag instead

5. Streams volume (decides consumer design)
   1M writes/sec × 86,400s × 24h retention ≈ 86.4B records/day
   → Any consumer (Lambda, Elasticsearch indexer) that falls behind
     by more than 24h loses data permanently — consumers must be
     idempotent AND keep up, not just "eventually catch up"

WHY THIS MATTERS IN THE INTERVIEW:
The interviewer is checking whether you connect "10,000 partitions"
→ "routing table needs binary search" → "Partition Metadata Cache",
and "30M RCU ceiling but 1M avg" → "a single hot partition still
throttles" → "write sharding". State the number, then name the
component or design decision it justifies.`,
    followups: [
      "How would these numbers change for a table with a much smaller average item size, like 100 bytes?",
      "If write traffic suddenly concentrates on 1% of partition keys, which number breaks first and what's the fix?",
      "How do you estimate the GSI write amplification cost for a table with 3 GSIs at this scale?",
    ],
  },
  {
    id: "ddb-q12",
    category: "Architecture",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Amazon", "Netflix", "Stripe"],
    question: "Your microservices call DynamoDB heavily and occasionally get throttled. How would a service mesh help, given DynamoDB itself is a managed AWS service you can't put a sidecar inside?",
    answer: `DynamoDB is fully managed and opaque — you can't inject a sidecar
inside it. But the mesh doesn't need to go INSIDE DynamoDB; it goes
around the services that CALL it.

MAP THE PROBLEM TO MESH PRIMITIVES:
• ProvisionedThroughputExceededException is an HTTP 400, not a 5xx
  — but functionally it's "the backend is overloaded, back off,"
  exactly what circuit breaking and retries exist to handle
• Register the DynamoDB endpoint as a ServiceEntry (MESH_EXTERNAL) —
  this makes it a first-class "service" the mesh can apply policy
  to, even though AWS operates it
• An EnvoyFilter remaps the 400 + ProvisionedThroughputExceeded
  response to a 5xx so outlierDetection can eject the endpoint the
  same way it would for any unhealthy backend

ARCHITECTURE:

1. Data plane — Envoy sidecar on every calling service
   • DestinationRule on the DynamoDB ServiceEntry: outlierDetection
     trips a circuit breaker after 5 consecutive throttling errors
     in 10s, ejecting calls for 30s
   • VirtualService retries (attempts: 3, perTryTimeout: 50ms) as a
     SECOND layer below the AWS SDK's own retry/backoff — usually
     teams pick one layer to own retries and set the other to 0
   • mTLS (PeerAuthentication STRICT) secures traffic BETWEEN your
     services (order-service → streams-consumer → aggregation
     service) — DynamoDB itself sits in a separate trust domain,
     authenticated via SigV4

2. Control plane — Istio / Consul / AWS App Mesh
   • One outlierDetection policy on the ServiceEntry applies to
     every service calling this table — no per-team retry config
   • Canary a new Streams-consumer version (e.g. a new Elasticsearch
     indexer) by shifting 5% of stream records via VirtualService
     weighted routing, with no redeploy of the old version

WHY THIS MATTERS AT FLEET SCALE:
• Uniform throttling response — 50 services no longer have 50
  different (and differently-buggy) backoff implementations
• Outlier detection on the DynamoDB ServiceEntry becomes a single
  dashboard signal: "we are being throttled," before it cascades
  into 50 services' own latency SLAs
• mTLS + canary apply to the Supporting Services fleet (Streams
  consumers, Auto Scaling controller, Global Tables replicator)
  exactly like any other microservice fleet

TRADE-OFFS TO MENTION:
• DynamoDB's OWN internal replication (Paxos quorum writes between
  storage nodes) is never meshed — that's AWS's problem, not yours
• Sidecar retries can mask a genuinely under-provisioned table;
  alert on circuit-breaker trips rather than letting retries hide
  sustained throttling
• Adds ~1-2ms per hop — negligible against DynamoDB's own
  single-digit-ms latency, but it's there`,
    followups: [
      "How would you remap a DynamoDB 400 ProvisionedThroughputExceededException to a 5xx for outlierDetection — what does that EnvoyFilter actually look like?",
      "If both the AWS SDK and the mesh retry independently, what failure mode does that create under sustained throttling?",
      "How would you extend this mesh setup to also cover a service calling DynamoDB Accelerator (DAX) in front of the table?",
    ],
  },
];
