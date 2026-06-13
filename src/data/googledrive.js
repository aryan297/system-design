export const GOOGLE_DRIVE_HLD = {
  title: "Google Drive — High Level Design",
  subtitle: "How 1B+ users store, sync, and collaborate on files across every device",

  overview: `Google Drive is a cloud file storage platform built on three pillars: Upload (chunked, deduplicated writes to GFS/Colossus), Sync (delta-based change propagation across all devices), and Collaborate (real-time co-editing via Google Docs/Sheets/Slides built on Operational Transformation).

The core insight — files are broken into 256 KB chunks and content-addressed by hash. Identical chunks stored once, globally. This is why uploading a popular PDF is near-instant: the chunks already exist.`,

  diagram: `
┌───────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Web / Mobile / Desktop)                │
│            Drive Web  ·  Drive Android/iOS  ·  Drive Sync daemon      │
└───────────┬───────────────────────────────────────────────────────────┘
            │  HTTPS (REST / gRPC)
            ▼
┌───────────────────────────────────────────────────────────────────────┐
│                         EDGE / API GATEWAY                            │
│        SERVICE MESH — Envoy sidecar attached to every service         │
│          Cloud Load Balancer  ·  TLS termination  ·  Auth (OAuth2)   │
│     mTLS · Load Balancing · Retries · Circuit Breaking · Tracing      │
└────┬──────────┬──────────┬──────────┬──────────┬────────────────────┘
     │          │          │          │          │
     ▼          ▼          ▼          ▼          ▼
┌─────────┐ ┌────────┐ ┌───────┐ ┌───────┐ ┌──────────┐
│ Upload  │ │Metadata│ │ Sync  │ │Search │ │ Sharing  │
│ Service │ │Service │ │Engine │ │Service│ │& Perms   │
└────┬────┘ └───┬────┘ └───┬───┘ └───┬───┘ └──────────┘
     │          │          │         │
     ▼          ▼          │         ▼
┌──────────┐ ┌──────────┐  │    ┌──────────┐
│Colossus  │ │  Cloud   │  │    │  Cloud   │
│(GFS v2)  │ │ Spanner  │  │    │Search/   │
│Chunk     │ │File Meta │  │    │Elasticsearch│
│Store     │ │& Tree    │  │    └──────────┘
└──────────┘ └──────────┘  │
                           ▼
                  ┌─────────────────┐
                  │  Pub/Sub        │
                  │  Change Log     │──► Notification Service
                  │  (Kafka-like)   │        │
                  └─────────────────┘        ▼
                                    ┌─────────────────┐
                                    │ WebSocket Push  │
                                    │ (all devices)   │
                                    └─────────────────┘`,

  metrics: [
    { label: "Total users", value: "1B+" },
    { label: "Free storage per user", value: "15 GB (shared across Gmail, Photos, Drive)" },
    { label: "Max file size", value: "5 TB" },
    { label: "Chunk size", value: "256 KB (content-addressed SHA-256)" },
    { label: "Data durability", value: "99.999999999% (11 nines) via erasure coding" },
    { label: "Upload throughput", value: "Petabytes/day across all users" },
    { label: "Sync latency (delta)", value: "<1 second on fast network" },
    { label: "Uptime SLA", value: "99.9% (< 8.7 hrs/year downtime)" },
    { label: "Colossus replication", value: "3× across zones + erasure coding" },
  ],

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "The Big Picture",
      sections: [
        {
          title: "How Google Drive Works — Upload to Sync",
          content: `Every file operation flows through two distinct planes:

1. UPLOAD — User drags a file into Drive web or desktop:
   • Client splits file into 256 KB chunks
   • Each chunk is SHA-256 hashed → chunk fingerprint
   • Client sends chunk fingerprints to Upload Service first
   • Upload Service checks Colossus — only MISSING chunks are uploaded
   • This is content-addressed deduplication: popular files upload in milliseconds
   • Once all chunks are present, Metadata Service records the file entry

2. METADATA WRITE — After all chunks land:
   • Spanner row created: fileId, ownerId, parentFolderId, chunkList[], version, mtime
   • Change event published to Pub/Sub change log
   • Event includes: fileId, changeType=CREATE, version, affected_users[]

3. SYNC TO OTHER DEVICES — Near-instant propagation:
   • Notification Service reads Pub/Sub, finds all devices of affected_users
   • Pushes lightweight "hey, file X changed" notification via WebSocket
   • Desktop sync daemon wakes up, calls Metadata Service for diff since last_sync_token
   • Daemon downloads only NEW/CHANGED chunks (delta sync, not full file)

4. DOWNLOAD — User opens a file:
   • Metadata Service returns chunk list + Colossus chunk URLs
   • Client downloads chunks in parallel (up to 32 concurrent)
   • Chunks reassembled locally in order
   • CDN (Google's edge network) serves popular chunks from cache

5. COLLABORATION — User opens a Google Doc:
   • Doc opens in browser, connects to Operational Transformation (OT) server
   • Every keystroke = an operation (insert/delete at position)
   • OT server serializes concurrent edits, transforms conflicting ops
   • All collaborators receive transformed ops in real-time via WebSocket
   • The Drive file itself is a pointer to the Doc's native storage — not Colossus chunks`,
        },
        {
          title: "Why Chunking + Content Addressing?",
          content: `The killer insight of Google Drive's storage: store bytes once, reference many times.

Content-addressed storage (CAS):
• Every 256 KB chunk has a fingerprint = SHA-256 hash of its bytes
• Chunk store (Colossus) is a giant key-value store: hash → bytes
• Two different files sharing a paragraph? Same chunk. Stored once.
• Uploading a 1 GB ISO that 10,000 users already have? 0 bytes transferred.

Why 256 KB chunk size?
• Too small (4 KB) → millions of metadata entries per file, lookup overhead
• Too large (10 MB) → resumable uploads need big re-uploads on failure, slow tail latency
• 256 KB is the sweet spot: reasonable seek granularity, cheap re-upload on retry

Resumable uploads:
• Large file upload interrupted (network drop)?
• Client resumes from last successful chunk — no restart from zero
• Upload Service tracks per-session "chunks received" state in Bigtable
• This is why Drive reliably handles 5 TB uploads over flaky connections`,
        },
        {
          title: "Back-of-the-Envelope Estimation",
          content: `Before drawing boxes, pin down scale with rough math — numbers
aren't graded for precision, they're graded for whether they
justify the design decisions that follow.

ASSUMPTIONS:
• 1B total users, ~5 GB average used of the 15 GB free quota
• Chunk size: 256 KB, content-addressed by SHA-256
• Colossus bloom filter sized for ~100B unique chunks (existing
  design constant from the dedup handshake)
• ~2 PB/day requested upload throughput platform-wide
• 200M DAU, each generates ~5 sync-relevant change events/day
• Search index lag target: ~5 seconds

1. Logical vs physical storage — justifies content-addressed dedup
   1B users × 5 GB = 5 exabytes of "logical" storage if nothing
   were deduplicated
   5 EB ÷ 256 KB ≈ 20 trillion logical chunk references
   → Colossus's bloom filter is sized for ~100B UNIQUE chunks —
     implying a ~200x dedup ratio (20T references → 100B blobs)
   → this 200x ratio is why "uploading a popular file transfers 0
     bytes" is the dominant storage-saving mechanism, not a footnote

2. Unique chunk storage — justifies Colossus capacity planning
   100B unique chunks × 256 KB ≈ 25.6 PB of unique chunk data
   × 3 (sync replicas) + erasure-coding overhead (~1.5x) ≈ ~115 PB
   physical storage
   → Colossus must hold ~115 PB while absorbing new unique chunks
     at multi-PB/day — this is the number behind "Petabytes/day"

3. Upload throughput vs dedup savings — justifies the checksum handshake
   2 PB/day requested uploads, but only NEW unique chunks are
   physically written
   At ~200x dedup, actual NEW bytes written ≈ 2 PB ÷ 200 ≈ 10 TB/day
   → this 200x reduction is why Upload Service runs the
     POST /checksums handshake BEFORE any byte transfer — it saves
     bandwidth, not just storage

4. Sync fan-out QPS — justifies Pub/Sub + WebSocket push design
   200M DAU × 5 events/day = 1B change events/day ≈ 11,600 events/sec
   Each event fans out to ~3 devices/user (phone, laptop, tablet)
   → ~35,000 WebSocket pushes/sec steady state, peak (~3x) ≈ 100K/sec
   → justifies Pub/Sub (not DB polling) for the change log, and why
     pushes carry only a "something changed" signal, not the payload

5. Search index lag — justifies the async indexing pipeline
   1B change events/day ≈ 11,600 events/sec must reach Elasticsearch
   within the 5-second lag SLA
   At ~1,000 docs/bulk-index request → ~12 bulk requests/sec
   → comfortably horizontal-scalable with a small Search Indexer
     consumer pool

Interview punch line: every number maps to a box — 100B unique
chunks → Colossus + bloom filter, ~115 PB → erasure-coded chunk
store, 11,600 events/sec → Pub/Sub change log, ~35K pushes/sec →
Notification Service / WebSocket fleet. State the number, then name
the component it justifies.`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Core Architecture",
      sections: [
        {
          title: "Metadata Service & File Tree",
          content: `All file metadata lives in Cloud Spanner — Google's globally consistent relational database.

Why Spanner?
• File moves, renames, sharing changes must be ACID — a file can't be in two folders
• Spanner provides global strong consistency with low latency (external consistency)
• Scale to billions of rows without sharding headaches

Schema (simplified):
  files:   fileId, ownerId, name, mimeType, size, chunkRefs[], version, trashed, mtime
  folders: folderId, ownerId, name, parentId, children[]
  shares:  fileId, granteeId, role (VIEWER/EDITOR/OWNER), sharedAt

Key operations:
• List folder: SELECT * FROM files WHERE parentFolderId = ? AND trashed = false
• Move file: UPDATE files SET parentFolderId = ? WHERE fileId = ? — single Spanner tx
• Share: INSERT INTO shares (fileId, granteeId, role) — fan-out to notification

Version history:
• Every write bumps version counter (monotonic)
• Old chunk lists stored in versions table → enables "restore previous version"
• Drive retains 30 days of version history by default`,
        },
        {
          title: "Colossus — The Chunk Store",
          content: `Colossus is Google's second-generation distributed file system (successor to GFS).

Key properties:
• Stores chunks as immutable 256 KB blobs, keyed by SHA-256 hash
• 3× synchronous replication within a zone
• Erasure coding (6+3 Reed-Solomon) across zones for durability
• 11 nines durability — you'd need a continent-scale disaster to lose data

Write path:
1. Upload Service receives raw chunk bytes
2. Computes SHA-256 hash, checks if chunk already exists (bloom filter first)
3. If missing: writes to primary Colossus node, replicates to 2 secondaries
4. Returns ACK only after 2/3 replicas confirmed — strong write durability

Read path:
1. Client requests chunk by hash
2. Colossus routes to nearest replica (same zone preferred)
3. If chunk is "hot" (many reads), served from CDN edge cache instead
4. CDN caches chunks by hash — naturally content-addressed, never stale

Garbage collection:
• Chunks are immutable and reference-counted
• When all file versions referencing a chunk are deleted, chunk is GC'd
• Lazy deletion: GC runs periodically, not on every delete (avoids write amplification)`,
        },
        {
          title: "Upload Service — Chunked Resumable Uploads",
          content: `The Upload Service orchestrates the upload lifecycle.

Protocol — resumable upload session:
1. Client: POST /upload/drive/v3/files?uploadType=resumable → gets upload session URL
2. Client: PUT {session-url} with Content-Range: bytes 0-262143/totalSize → chunk 1
3. Client: PUT {session-url} with Content-Range: bytes 262144-524287/totalSize → chunk 2
4. ... repeat until all chunks uploaded
5. Client: PUT {session-url} with Content-Range: bytes {last}/totalSize → triggers finalize
6. Upload Service: calls Metadata Service to create file entry in Spanner

Deduplication check (before any chunk transfer):
• Client computes all chunk hashes upfront
• POST /upload/checksums {chunkHashes: [...]} → server returns {missing: [...]}
• Client uploads ONLY the missing chunks
• This "existence check" call saves 90%+ of bandwidth for popular file types

Session state:
• Stored in Bigtable: sessionId → {chunks received, total expected, expiry}
• Sessions expire after 7 days of inactivity
• Client can query "how many chunks received?" to resume after crash`,
        },
        {
          title: "Service Mesh — Sidecar Proxy Pattern (Envoy/Istio)",
          content: `A service mesh moves cross-cutting networking concerns OUT of
application code and INTO a sidecar proxy (Envoy) deployed next
to every service instance. All traffic in/out of a service passes
through its sidecar first.

WHY A MESH FITS DRIVE'S FLEET:
• Five core services (Upload, Metadata, Sync, Search, Sharing &
  Perms) sit behind the Edge/API Gateway and call each other —
  e.g. every download/view request hits Sharing & Perms before
  Metadata can return chunk URLs
• Sharing & Perms is the hottest internal dependency in the system
  — Spanner ACL lookups back EVERY file access across all 1B users
• Search Service's BM25 ranking weights change often and need a
  safe canary rollout, just like Feed/Recommendation rollouts
  elsewhere

1. Data plane — one Envoy sidecar per service instance
   • iptables transparently redirects all in/out traffic through it
   • Applies load balancing, retries, timeouts, circuit breaking
   • Wraps every call in mTLS — zero-trust between services
   • Emits identical metrics, logs, traces for every service

2. Control plane — Istio / Consul / AWS App Mesh
   • Pushes routing rules + policy to every sidecar centrally
   • "Retry Sharing & Perms 2x with 30ms timeout on 503"
   • "Search ranking v2 gets 5% canary traffic"
   • "Only Metadata, Search, Upload may call Sharing & Perms"

WHAT THIS BUYS DRIVE SPECIFICALLY:
• Circuit breaking on Sharing & Perms — if Spanner ACL queries slow
  down under load, outlierDetection ejects unhealthy Perms pods
  after 5 consecutive 5xx in 10s; callers fall back to the existing
  5-minute Redis ACL cache instead of queuing on a slow dependency
• Canary ranking rollouts — deploy search:v2 alongside v1, route a
  5% weighted slice via VirtualService, watch click-through and p99
  latency, then shift to 25% → 100% or roll back instantly
• Zero-trust for ACL data — PeerAuthentication STRICT enforces mTLS
  on every hop, and an AuthorizationPolicy on Sharing & Perms limits
  callers to Metadata, Search, and Upload — even a compromised Sync
  Engine pod can't query another user's permissions
• End-to-end tracing — a single "open file" request spans Edge
  Gateway → Metadata → Sharing & Perms → Colossus chunk URLs; Envoy
  gives one trace ID across every hop, which is invaluable when p99
  latency regresses

DIAGRAM: the "SERVICE MESH" band inside the EDGE / API GATEWAY box
represents this — every arrow from the gateway down to Upload,
Metadata, Sync, Search, and Sharing & Perms passes through an Envoy
sidecar, with mTLS / load balancing / retries / circuit breaking /
tracing applied uniformly to all five.

TRADE-OFFS:
• ~1-2ms extra latency per hop — negligible against the <1s sync
  latency and 5s search-index lag budgets
• Control plane becomes a new critical dependency, though sidecars
  cache last-known config if it goes down
• Pub/Sub-based async paths (change log, notifications) bypass the
  mesh entirely — it only governs synchronous service-to-service
  calls`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Sync & Collaboration",
      sections: [
        {
          title: "Delta Sync — Efficient Cross-Device Propagation",
          content: `The sync engine is what makes Drive feel magical — changes appear on all devices in <1 second.

Sync token model:
• Every device holds a sync token = Spanner timestamp of last successful sync
• On wake-up: GET /changes?pageToken={lastToken} → list of changes since that point
• Server returns: [{fileId, changeType, version, chunkDeltas}, ...], nextPageToken
• Device processes changes, updates local index, stores nextPageToken

Change log:
• Every write to Spanner publishes an event to Pub/Sub topic "drive.changes"
• Event: {userId, fileId, changeType, version, timestamp}
• Notification Service consumes Pub/Sub, fans out to user's active WebSocket sessions
• Desktop daemon receives push → immediately calls /changes API → applies delta

What is a "delta"?
• For small files: full file content (fast, simple)
• For large files: rsync-style rolling checksum diff
   – Old chunk list: [A, B, C, D]
   – New chunk list: [A, B', C, D, E]
   – Delta: {replace chunk 1 with B', append chunk E}
   – Only 2 chunks transferred, not 5

Conflict resolution (two devices edit offline simultaneously):
• Drive detects conflict when version vectors diverge
• Strategy: last-write-wins for Drive binary files
• For Google Docs: OT (Operational Transformation) handles conflicts in the doc layer
• For binary conflicts: Drive creates a "conflicted copy" alongside original`,
        },
        {
          title: "Real-Time Collaboration via OT",
          content: `Google Docs/Sheets/Slides achieve real-time multi-user editing via Operational Transformation.

Architecture:
• Each open document = a persistent OT session on a dedicated server
• Every user keystroke = an Operation: {type: INSERT|DELETE, position: N, chars: "hello"}
• Operations flow: Client → OT Server → transformed op → all other clients

Why OT is needed:
• Alice inserts "X" at position 5 while Bob deletes char at position 3 (concurrent)
• If Bob's delete is applied first, Alice's "position 5" is now wrong (off by 1)
• OT transforms Alice's op relative to Bob's: INSERT at position 4 instead

Operation log:
• OT server maintains total ordered log of all operations (revision history)
• Client reconnects after network drop: "I'm at revision 42, give me ops 43–60"
• Catches up by replaying transforms — same result as if connected the whole time

Integration with Drive:
• Google Docs file in Drive = a pointer to a doc ID, not raw bytes in Colossus
• When you "download" a Doc as DOCX, Drive converts on the fly
• Autosave creates periodic snapshots in Spanner, not on every keystroke
• Snapshot trigger: every 30 seconds OR when the last user closes the doc`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Scale & Reliability",
      sections: [
        {
          title: "Sharing, Permissions & Access Control",
          content: `Google Drive has a fine-grained ACL system supporting individual, group, and link-based sharing.

Permission model:
• Roles: OWNER > ORGANIZER > FILE_ORGANIZER > EDITOR > COMMENTER > VIEWER
• Each file/folder has an ACL list: [(principal, role), ...]
• Inheritance: folder ACL flows down to children (computed at query time, not materialized)

Implementation:
• ACLs stored in Spanner: shares table with (resourceId, principalId, role)
• Principal can be: userId, Google Group ID, domain ("anyone@acme.com"), "anyoneWithLink"
• Sharing fan-out: sharing a folder with 10,000 users → Spanner batch insert, async notification

"Anyone with link" (public sharing):
• File gets a signed URL token: /view?id={fileId}&token={HMAC-signed-secret}
• No auth required — token itself proves access
• Token stored in Spanner; can be revoked by rotating the secret

Download auth check:
• Every /download request passes through Auth Middleware
• Middleware checks Spanner ACL: does this user have VIEWER+ on this fileId?
• Result cached in Redis for 5 minutes (ACL hot cache) to reduce Spanner load

Shared drives (Team Drives):
• Files owned by the organization, not an individual
• Membership-based access — when someone leaves, files stay
• Separate quota pool from individual storage`,
        },
        {
          title: "Reliability, Durability & Disaster Recovery",
          content: `Google Drive must never lose a file. Here is how they guarantee it.

Durability stack:
• Layer 1 — Colossus: 3 synchronous replicas within a zone
• Layer 2 — Erasure coding: 6+3 Reed-Solomon across zones (survives 3 zone failures)
• Layer 3 — Cross-region: periodic async replication to geographically distant region
• Result: 11 nines — losing data requires simultaneous multi-region catastrophe

Availability design (99.9% SLA):
• Regional isolation: each Google Cloud region runs independent Drive stack
• Global load balancer routes users to nearest healthy region
• Degraded mode: if Spanner metadata is down, serve cached file listings (stale reads OK)
• Uploads queue locally on client during outage, sync resumes automatically

Soft delete & recovery:
• Delete moves to Trash; metadata marked trashed=true, Colossus chunks NOT deleted
• Trash auto-purges after 30 days
• Admin restore: un-delete via Drive API up to 25 days after permanent delete
• Version history allows rolling back individual files

Abuse prevention:
• Virus scanning on upload via Google's SafeBrowsing integration
• CSAM detection via PhotoDNA hash matching on image/video chunks
• Rate limiting: max upload speed per user, max API calls per OAuth app
• Large files (>100 MB) scanned async post-upload; flagged files quarantined`,
        },
      ],
    },
  ],
};

export const GOOGLE_DRIVE_LLD = {
  title: "Google Drive — Low Level Design",
  subtitle: "API contracts, schemas, and algorithms for core Drive components",

  components: [
    {
      id: "upload",
      title: "Upload Service",
      description: "Chunked resumable upload protocol with deduplication",
      api: `// 1. Initiate resumable upload session
POST /upload/drive/v3/files?uploadType=resumable
Authorization: Bearer {access_token}
Content-Type: application/json
X-Upload-Content-Type: video/mp4
X-Upload-Content-Length: 1073741824   // 1 GB

Body: { name: "myvideo.mp4", parents: ["folderId123"] }

Response 200:
Location: https://www.googleapis.com/upload/drive/v3/files?uploadId=abc123

// 2. Check which chunks are missing (dedup handshake)
POST /upload/drive/v3/files/checksums
Body: {
  uploadId: "abc123",
  chunkHashes: ["sha256-aaa", "sha256-bbb", "sha256-ccc", ...]
}
Response: { missing: ["sha256-bbb"], existingCount: 3998 }

// 3. Upload a single chunk
PUT /upload/drive/v3/files?uploadId=abc123
Content-Range: bytes 262144-524287/1073741824
Content-Length: 262144
Body: <raw bytes>
Response 308 Resume Incomplete (more chunks needed)
Response 200 OK (last chunk — file created)

// 4. Query upload progress (after crash)
PUT /upload/drive/v3/files?uploadId=abc123
Content-Range: bytes */1073741824
Content-Length: 0
Response 308: { range: "bytes=0-524287" }  // 2 chunks received

// Upload Session — Bigtable Schema
Row key: uploadId (UUID)
Columns:
  meta:ownerId        → userId
  meta:fileName       → "myvideo.mp4"
  meta:totalSize      → 1073741824
  meta:mimeType       → "video/mp4"
  meta:parentId       → folderId123
  meta:expiresAt      → Unix timestamp (7 days from init)
  chunks:received     → bitmask or set of chunk indices confirmed
  chunks:total        → 4096  (ceil(1GB / 256KB))`,

      internals: `Chunk deduplication algorithm:

1. Client computes SHA-256 for each 256 KB window BEFORE uploading
2. Client sends all hashes in single POST /checksums request
3. Upload Service queries Colossus bloom filter: O(1) per hash, batched
   - Bloom filter: 100 billion entries, 1% false positive rate (fast "probably exists" check)
   - False positive → chunk transmitted unnecessarily but never corrupts data
4. Colossus confirms actual existence for "probably exists" entries (eliminates false positives)
5. Upload Service returns only truly missing hashes to client

Chunk write to Colossus:
  func writeChunk(hash string, data []byte) error {
    // Check Colossus index (fast path — bloom filter)
    if colossus.Exists(hash) { return nil }
    // Slow path — write to 3 replicas
    return colossus.Write(hash, data, ReplicationFactor=3)
  }

Finalize:
  func finalizeUpload(sessionId string) (fileId string, err error) {
    session := bigtable.Get(sessionId)
    if session.ChunksReceived != session.TotalChunks { return "", ErrIncomplete }

    fileId = uuid.New()
    spanner.InsertFile(File{
      FileId:    fileId,
      OwnerId:   session.OwnerId,
      Name:      session.FileName,
      Size:      session.TotalSize,
      ChunkRefs: session.ChunkHashes,  // ordered list of SHA-256 hashes
      Version:   1,
      MTime:     time.Now(),
      ParentId:  session.ParentId,
    })
    pubsub.Publish("drive.changes", ChangeEvent{
      UserId: session.OwnerId, FileId: fileId, Type: "CREATE",
    })
    bigtable.Delete(sessionId)  // cleanup session
    return fileId, nil
  }`,
    },
    {
      id: "metadata",
      title: "Metadata Service",
      description: "File tree, versioning, and Spanner-backed file index",
      api: `// File record — Spanner schema
CREATE TABLE files (
  file_id     STRING(36) NOT NULL,   -- UUID
  owner_id    STRING(36) NOT NULL,
  name        STRING(512) NOT NULL,
  mime_type   STRING(128),
  size        INT64,
  chunk_refs  ARRAY<STRING(64)>,     -- ordered SHA-256 hashes
  version     INT64 NOT NULL DEFAULT 1,
  parent_id   STRING(36),            -- NULL for root
  trashed     BOOL NOT NULL DEFAULT false,
  created_at  TIMESTAMP NOT NULL,
  modified_at TIMESTAMP NOT NULL,
) PRIMARY KEY (file_id);

CREATE INDEX files_by_owner_parent
  ON files (owner_id, parent_id, trashed)
  STORING (name, mime_type, size, modified_at, version);

CREATE TABLE file_versions (
  file_id     STRING(36) NOT NULL,
  version     INT64 NOT NULL,
  chunk_refs  ARRAY<STRING(64)>,
  modified_at TIMESTAMP NOT NULL,
  modified_by STRING(36),
) PRIMARY KEY (file_id, version DESC);

// REST API
GET  /drive/v3/files/{fileId}                    -- get file metadata
GET  /drive/v3/files?q=name+contains+'report'    -- search / list
POST /drive/v3/files                             -- create (metadata-only, no content)
PATCH /drive/v3/files/{fileId}                   -- update name, parent, etc.
DELETE /drive/v3/files/{fileId}                  -- trash

// List folder contents
GET /drive/v3/files?q='folderId'+in+parents&fields=files(id,name,mimeType,size,modifiedTime)

// Get changes since token
GET /drive/v3/changes?pageToken={token}&includeRemoved=true
Response: {
  nextPageToken: "...",
  newStartPageToken: "...",
  changes: [{ fileId, file, removed, time }]
}`,

      internals: `File tree traversal (list folder):

  func listFolder(folderId, userId string, pageSize int, pageToken string) ([]File, string, error) {
    // Spanner index scan: O(children_in_folder), not O(all_files)
    query := \`SELECT file_id, name, mime_type, size, modified_at
               FROM files@{FORCE_INDEX=files_by_owner_parent}
               WHERE owner_id = @uid AND parent_id = @parent AND trashed = false
               ORDER BY name ASC
               LIMIT @limit OFFSET @offset\`
    return spanner.Query(query, {uid: userId, parent: folderId, ...})
  }

Version snapshot on update:
  func updateFile(fileId string, newChunks []string, userId string) error {
    return spanner.ReadWriteTransaction(func(txn *spanner.ReadWriteTransaction) error {
      file := txn.Read("files", fileId)
      // Archive current version
      txn.Insert("file_versions", {
        FileId: fileId, Version: file.Version,
        ChunkRefs: file.ChunkRefs, ModifiedAt: file.ModifiedAt, ModifiedBy: userId,
      })
      // Bump version and update chunks
      txn.Update("files", {
        FileId: fileId, ChunkRefs: newChunks,
        Version: file.Version + 1, ModifiedAt: time.Now(),
      })
      return nil
    })
  }

Change token (sync cursor):
  • Spanner timestamp used directly as page token (Spanner supports time-based reads)
  • GET /changes?pageToken={spanner_timestamp}
    → SELECT * FROM change_log WHERE ts > @token ORDER BY ts ASC LIMIT 500
  • Returned nextPageToken = timestamp of last change in this batch`,
    },
    {
      id: "sync",
      title: "Sync Engine",
      description: "Delta sync, change notification, and conflict resolution",
      api: `// WebSocket notification channel
// Client connects on app launch, stays alive
WS wss://notifications.drive.googleapis.com/v1/connect
  Auth: Bearer {access_token}

// Server push on file change
{
  "kind": "drive#change",
  "fileId": "1abc...",
  "type": "UPDATE",         // CREATE | UPDATE | DELETE | MOVE
  "version": 42,
  "changeToken": "...",
  "syncTimestamp": "2026-05-31T10:00:00Z"
}

// Client responds by fetching actual diff
GET /drive/v3/files/{fileId}/diff?fromVersion=41&toVersion=42
Response: {
  changedChunks: [
    { index: 3, newHash: "sha256-xyz" },  // chunk 3 replaced
    { index: 7, newHash: "sha256-abc" }   // chunk 7 replaced
  ],
  addedChunks:  [{ index: 8, hash: "sha256-new" }],
  removedChunks: [],
  newSize: 1073742848
}

// Conflict detection
PATCH /drive/v3/files/{fileId}
If-Match: "etag-v41"        // optimistic concurrency — fails if version != 41
Response 412 Precondition Failed → conflict detected → create conflicted copy

// Batch changes fetch (reconnect after offline period)
GET /drive/v3/changes?pageToken={lastSyncToken}&spaces=drive
Response: {
  changes: [...],
  nextPageToken: "...",
  newStartPageToken: "..."   // use this after exhausting all pages
}`,

      internals: `Delta sync algorithm (desktop daemon):

  On WebSocket push received:
    1. Daemon checks local version for fileId
    2. If local_version < server_version:
       a. Call /files/{id}/diff?fromVersion={local}&toVersion={server}
       b. Download only changedChunks from Colossus (by hash)
       c. Apply patches to local file in-place (mmap + pwrite per chunk offset)
       d. Update local SQLite index: (fileId → version, chunkList, mtime)
    3. If local_version == server_version: no-op (already synced)
    4. If local_version > server_version: local has offline edits — trigger conflict flow

Conflict resolution:
  func handleConflict(fileId string, localFile, serverFile File) {
    if localFile.MimeType == "application/vnd.google-apps.document" {
      // Google Docs: handled by OT server, never a conflict here
      return
    }
    // Binary files: last-write-wins with conflicted copy fallback
    if serverFile.ModifiedAt.After(localFile.ModifiedAt) {
      // Server wins — overwrite local
      applyServerVersion(fileId, serverFile)
    } else {
      // Local wins AND create conflicted copy of server version
      uploadLocal(fileId, localFile)  // bumps server version
      createConflictedCopy(fileId, serverFile, suffix="(conflicted copy "+date+")")
    }
  }

Sync state machine (desktop daemon):
  IDLE → [file change detected] → DIFF_FETCH → DOWNLOADING → APPLYING → IDLE
  IDLE → [WebSocket push] → DIFF_FETCH → ...
  OFFLINE → [network restored] → BATCH_SYNC → (replay all changes) → IDLE`,
    },
    {
      id: "search",
      title: "Search Service",
      description: "Full-text and semantic file search across Drive",
      api: `// Drive search API
GET /drive/v3/files?q={query}&orderBy=modifiedTime+desc&pageSize=30
  q examples:
    name contains 'quarterly'
    mimeType = 'application/pdf'
    'me' in owners
    modifiedTime > '2026-01-01T00:00:00'
    fullText contains 'machine learning'
    sharedWithMe = true

Response: {
  files: [{
    id, name, mimeType, size, modifiedTime,
    owners, parents, webViewLink, thumbnailLink,
    highlights: ["...quarterly <em>report</em>..."]  // snippet with match
  }],
  nextPageToken: "..."
}

// Suggest (autocomplete)
GET /drive/v3/files/suggest?q=repo&maxResults=5
Response: {
  suggestions: [
    { fileId: "...", name: "report-q1.pdf", snippet: "...revenue report..." },
    { fileId: "...", name: "repo-backup.zip" }
  ]
}`,

      internals: `Search indexing pipeline:

On file CREATE/UPDATE:
  1. Metadata Service publishes to Pub/Sub: {fileId, ownerId, changeType}
  2. Search Indexer consumer:
     a. Fetch file metadata from Spanner
     b. For indexable types (PDF, DOCX, TXT): extract text via Cloud Document AI
     c. For images: run OCR + label detection (Vision API)
     d. Index document into Elasticsearch:
        {
          fileId, ownerId, name, fullText, mimeType,
          sharedWith: [userId...],  // for permission-aware search
          modifiedAt, size
        }
  3. Elasticsearch update is async — search index lags metadata by ~5 seconds

Permission-aware search:
  • Search query always scoped to requesting user's visible files
  • Elasticsearch query adds filter:
    { bool: { should: [
        { term: { ownerId: userId } },
        { term: { sharedWith: userId } }
    ]}}
  • This prevents users from finding files they no longer have access to

Ranking signals (BM25 + personalization):
  • BM25 text relevance score (base)
  • Recency boost: modifiedAt within 7 days → +20% score
  • Frequency boost: files opened often by this user → personalized ranking
  • Exact name match → 3× boost over fullText match
  • Final score = BM25 × recencyBoost × personalBoost

Thumbnail generation:
  • On upload complete: Thumbnail Worker fetches first chunk of file
  • Generates 256×256 JPEG preview via Cloud Vision / ffmpeg
  • Stores in GCS: gs://drive-thumbnails/{fileId}/{version}.jpg
  • Served via CDN with long cache TTL (thumbnail is versioned)`,
    },
    {
      id: "permissions",
      title: "Permissions & Sharing",
      description: "ACL model, link sharing, and inherited folder permissions",
      api: `// Sharing API
POST /drive/v3/files/{fileId}/permissions
Body: {
  role: "writer",          // owner | organizer | fileOrganizer | writer | commenter | reader
  type: "user",            // user | group | domain | anyone
  emailAddress: "bob@example.com",
  sendNotificationEmail: true,
  expirationTime: "2026-12-31T23:59:59Z"  // optional time-limited access
}
Response 200: { id: "permId123", role: "writer", type: "user", emailAddress: "..." }

// List permissions on a file
GET /drive/v3/files/{fileId}/permissions
Response: {
  permissions: [
    { id: "perm1", role: "owner",  type: "user", emailAddress: "alice@example.com" },
    { id: "perm2", role: "writer", type: "user", emailAddress: "bob@example.com" },
    { id: "perm3", role: "reader", type: "anyone" }   // public link
  ]
}

// Revoke permission
DELETE /drive/v3/files/{fileId}/permissions/{permissionId}

// Spanner schema
CREATE TABLE shares (
  resource_id   STRING(36) NOT NULL,   -- fileId or folderId
  perm_id       STRING(36) NOT NULL,
  principal_id  STRING(256) NOT NULL,  -- userId | groupId | "anyoneWithLink"
  role          STRING(20)  NOT NULL,
  expires_at    TIMESTAMP,
  link_token    STRING(64),            -- HMAC token for anyoneWithLink
  created_at    TIMESTAMP NOT NULL,
) PRIMARY KEY (resource_id, perm_id);

CREATE INDEX shares_by_principal ON shares (principal_id, resource_id);`,

      internals: `Permission check hot path (every download/view request):

  func hasAccess(userId, fileId string, requiredRole Role) bool {
    // 1. Check Redis ACL cache (TTL: 5 min)
    cacheKey := fmt.Sprintf("acl:%s:%s", fileId, userId)
    if cached := redis.Get(cacheKey); cached != nil {
      return roleGTE(cached.Role, requiredRole)
    }

    // 2. Cache miss → query Spanner
    // Check direct permission on this file
    direct := spanner.Query(\`
      SELECT role FROM shares
      WHERE resource_id = @fileId
        AND (principal_id = @userId OR principal_id IN @userGroups OR principal_id = 'anyoneWithLink')
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      LIMIT 1\`, {fileId, userId, userGroups: getGroupIds(userId)})

    if direct.HasRows() {
      redis.Set(cacheKey, direct.Role, 5*time.Minute)
      return roleGTE(direct.Role, requiredRole)
    }

    // 3. Walk up folder tree (inherited permissions)
    // Spanner WITH RECURSIVE would be ideal but Drive uses iterative traversal
    parentId := getParentId(fileId)
    for parentId != "" {
      inherited := queryDirectPermission(parentId, userId)
      if inherited != nil {
        redis.Set(cacheKey, inherited.Role, 5*time.Minute)
        return roleGTE(inherited.Role, requiredRole)
      }
      parentId = getParentId(parentId)
    }

    redis.Set(cacheKey, NoAccess, 5*time.Minute)
    return false
  }

Role hierarchy (ordered):
  OWNER > ORGANIZER > FILE_ORGANIZER > EDITOR > COMMENTER > VIEWER

Link token generation (anyoneWithLink):
  token = HMAC-SHA256(secret_key, fileId + ":anyoneWithLink")
  • Secret rotated per file (stored in Spanner)
  • Revoking "anyone with link" = delete shares row, rotate secret
  • Old tokens immediately invalid — no need to invalidate CDN (CDN auth check calls Drive)`,
    },
    {
      id: "serviceMesh",
      title: "Service Mesh — Envoy/Istio Config (LLD)",
      description: "Sidecar traffic policy: mTLS, circuit breaking, retries, and canary routing between Drive's core services",
      api: `# DestinationRule — circuit-break Sharing & Perms under load
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: permissions
spec:
  host: permissions.prod.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp: { maxConnections: 500 }
      http:
        http1MaxPendingRequests: 200
        maxRequestsPerConnection: 50
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
    loadBalancer:
      simple: LEAST_REQUEST

---
# VirtualService — retries + canary for Search ranking v2
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: search
spec:
  hosts: ["search.prod.svc.cluster.local"]
  http:
    - match: [{ headers: { x-ranking-canary: { exact: "true" } } }]
      route:
        - destination: { host: search.prod.svc.cluster.local, subset: v2 }
    - route:
        - destination: { host: search.prod.svc.cluster.local, subset: v1 }
          weight: 95
        - destination: { host: search.prod.svc.cluster.local, subset: v2 }
          weight: 5
      retries:
        attempts: 2
        perTryTimeout: 100ms
        retryOn: 5xx,reset,connect-failure

---
# AuthorizationPolicy — only these services may call Sharing & Perms
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: permissions-access
  namespace: prod
spec:
  selector:
    matchLabels: { app: permissions }
  action: ALLOW
  rules:
    - from:
        - source:
            principals:
              - "cluster.local/ns/prod/sa/metadata"
              - "cluster.local/ns/prod/sa/search"
              - "cluster.local/ns/prod/sa/upload"

---
# PeerAuthentication — mesh-wide mTLS
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: prod
spec:
  mtls: { mode: STRICT }`,
      internals: `Sidecar injection:
• Every pod (Upload, Metadata, Sync Engine, Search, Sharing &
  Perms) gets an Envoy sidecar auto-injected via a Kubernetes
  mutating webhook — zero application code change
• Sidecar intercepts traffic via iptables rules in the pod's
  network namespace

Circuit breaking on Sharing & Perms (the hottest dependency):
• Every download/view across 1B users calls Sharing & Perms before
  Metadata returns chunk URLs
• outlierDetection ejects pods returning >= 5 consecutive 5xx in
  10s for 30s, with at most 50% of the fleet ejected at once
• Callers (Metadata, Search, Upload) get fast failures instead of
  queued timeouts, and fall back to the existing 5-minute Redis ACL
  cache while Spanner recovers

Canary rollout — Search ranking v2:
1. Deploy search:v2 alongside v1 (same Kubernetes Service)
2. Internal testers send x-ranking-canary: true header → routed
   straight to v2 for manual QA
3. VirtualService then routes 5% of real traffic to v2
4. Watch click-through rate + p99 latency in Prometheus/Grafana
5. Shift weight 5% → 25% → 100%, or roll back to 0% by editing one
   resource — no redeploy either way

mTLS + AuthorizationPolicy for ACL data:
• PeerAuthentication STRICT rejects any plaintext traffic between
  meshed pods — Sharing & Perms only accepts mTLS connections
• AuthorizationPolicy further restricts WHO can call it: only
  metadata, search, and upload service accounts are allowed — Sync
  Engine is denied even though it's on the same mesh
• This enforces "ACL data is need-to-know" at the network layer, on
  top of the application-level Spanner row-level checks

Failure mode — control plane down:
• Sidecars cache the LAST KNOWN DestinationRule/VirtualService/
  AuthorizationPolicy and keep enforcing it
• New pods can't fetch sidecar config until the control plane
  recovers, but existing traffic (including the permission-check
  hot path) is unaffected — data plane is decoupled from control
  plane by design`,
    },
  ],
};

export const GOOGLE_DRIVE_QNA = [
  {
    id: "gdrive-q1",
    category: "Architecture",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Google", "Dropbox", "Box"],
    question: "How does Google Drive achieve deduplication across billions of files?",
    answer: `Content-addressed storage (CAS): every 256 KB chunk is SHA-256 hashed. The chunk store (Colossus) is a key-value store from hash → bytes. Before uploading, the client sends all chunk hashes to the Upload Service. The service checks a bloom filter first (fast O(1) membership test), then confirms with the actual index. Only truly missing chunks are transferred. This means two users uploading the same popular PDF transfer 0 bytes after the first upload — the chunks already exist. Deduplication happens transparently at the chunk level, not the file level.`,
    followups: ["How would you handle dedup across users who don't share files?", "What are the privacy implications of cross-user deduplication?"],
  },
  {
    id: "gdrive-q2",
    category: "Architecture",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Google", "Dropbox", "Microsoft"],
    question: "Design the sync protocol for Google Drive. How do devices stay in sync efficiently?",
    answer: `Three-layer sync:
1. Change log: every Spanner write publishes an event to Pub/Sub with {fileId, userId, version}.
2. Push notification: Notification Service fans out WebSocket pushes to all active devices of the affected user — lightweight "something changed" signal, not the actual diff.
3. Delta fetch: device receives push, calls GET /changes?pageToken={lastSyncToken} to get ordered change list, then GET /files/{id}/diff?fromVersion=N&toVersion=M to fetch only changed chunks.

Key insight: the push is a signal, not the payload. Device pulls diffs on demand. Offline device reconnects, provides its last sync token, and replays changes sequentially. Chunk delta means only modified 256 KB windows are downloaded, not the full file.`,
    followups: ["How does the sync token prevent missing changes after a long offline period?", "What happens if a device's sync token expires?"],
  },
  {
    id: "gdrive-q3",
    category: "Architecture",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Google", "Notion", "Atlassian"],
    question: "How does Google Drive handle real-time concurrent editing in Google Docs?",
    answer: `Google Docs/Sheets use Operational Transformation (OT), not Drive's chunk storage. The file in Drive is just a pointer to a Doc ID.

OT server maintains a total-ordered log of all operations. When Alice and Bob edit simultaneously, their operations are transformed relative to each other before application. Example: Alice inserts at position 5, Bob deletes at position 3. If Bob's delete lands first, Alice's insert position is transformed to 4.

Every operation carries a revision number. Reconnecting clients send their local revision and receive all ops since then — they replay transforms to reach the current state. Autosave takes periodic Spanner snapshots (every 30s or on last-user-close) rather than writing every keystroke.`,
    followups: ["How does OT differ from CRDT? Which is better for collaborative editing?", "How do you handle a user who has been offline for hours reconnecting to a doc?"],
  },
  {
    id: "gdrive-q4",
    category: "Fault Tolerance",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Google", "Amazon", "Microsoft"],
    question: "How does Google Drive ensure durability of 11 nines (99.999999999%)?",
    answer: `Three durability layers stacked:
1. Colossus synchronous replication: 3 replicas within the same zone, write only ACKed after 2/3 confirm.
2. Erasure coding across zones: 6+3 Reed-Solomon encoding means the original data is recoverable even if 3 out of 9 zone-level shards are lost. Surviving 3 full zone failures is extremely unlikely.
3. Cross-region async replication: periodic copies to a geographically distant region (e.g., US-EAST to EU-WEST) to survive regional catastrophes.

Chunks are immutable — once written, never modified. GC only runs when all file versions referencing a chunk are permanently deleted. This immutability makes replication simple and prevents write-after-write hazards.`,
    followups: ["What is the difference between availability (nines of uptime) and durability (nines of data safety)?", "How does erasure coding compare to simple 3× replication in cost?"],
  },
  {
    id: "gdrive-q5",
    category: "Fault Tolerance",
    difficulty: "Medium",
    round: "System Design Round",
    asked_at: ["Google", "Dropbox", "Apple"],
    question: "How does Google Drive handle conflicts when two clients edit the same file offline?",
    answer: `For Google Docs: OT handles it — no Drive-level conflict since Docs has its own operation log.

For binary files (PDFs, images, etc.):
• Optimistic concurrency via ETags. PATCH request includes If-Match: "etag-v41". If the server version is already v42, returns 412 Precondition Failed.
• Conflict detected: Drive compares modification timestamps.
• Last-write-wins: if server is newer, overwrite local with server version.
• Tie/local-wins: upload local version AND create a "conflicted copy" of the server version (filename suffixed with date/device name).
• User sees both files and manually resolves.

This "conflicted copy" strategy is the same as Dropbox — it trades automatic resolution for explicit user awareness.`,
    followups: ["Can you design a merge strategy better than last-write-wins for structured files like JSON?"],
  },
  {
    id: "gdrive-q6",
    category: "Security & DRM",
    difficulty: "Medium",
    round: "Deep Dive",
    asked_at: ["Google", "Box", "Dropbox"],
    question: "How does Drive's permission system prevent one user from searching another's private files?",
    answer: `Permission-aware search indexing: when a file is indexed into Elasticsearch, its document includes a sharedWith array listing all user IDs and group IDs with access. Every search query adds a mandatory filter:

{ bool: { should: [{ term: { ownerId: userId } }, { term: { sharedWith: userId } }] }}

This means Elasticsearch only returns documents the querying user can access. When access is revoked, the indexer updates the sharedWith array for the affected file (async, within ~5 seconds).

For downloading, there's a separate ACL check: Auth Middleware queries Spanner shares table (with Redis cache, 5 min TTL) on every /download request — Elasticsearch results are just suggestions, the actual file serve always re-verifies permissions.`,
    followups: ["What's the risk of the ~5 second search index lag after revoking access?", "How would you handle a user with access via a Google Group that they just left?"],
  },
  {
    id: "gdrive-q7",
    category: "API Design",
    difficulty: "Medium",
    round: "System Design Round",
    asked_at: ["Google", "Amazon", "Meta"],
    question: "How does Google Drive's resumable upload work? Why is it important?",
    answer: `Resumable uploads solve two problems: large files over unreliable connections, and efficiency via deduplication.

Protocol:
1. Client POSTs metadata → gets a session URL with uploadId.
2. Client sends all chunk hashes first (dedup handshake) — server returns which chunks are already in Colossus.
3. Client PUTs only missing chunks, each with a Content-Range header.
4. On network failure, client queries "how many chunks received?" and resumes from there.
5. Session state stored in Bigtable (expires after 7 days of inactivity).

Why it matters: without this, a 4 GB video that drops on the last 256 KB restarts from zero. With it, it restarts from the last successful chunk. The dedup handshake also means uploading a file that 1,000 users already have costs 0 bytes of transfer — just metadata.`,
    followups: ["How would you handle a session that expires mid-upload?", "What's the tradeoff of keeping session state in Bigtable vs a relational DB?"],
  },
  {
    id: "gdrive-q8",
    category: "Scale & Performance",
    difficulty: "Medium",
    round: "Deep Dive",
    asked_at: ["Google", "Meta", "Pinterest"],
    question: "How would you design Google Drive's thumbnail generation pipeline?",
    answer: `Event-driven, async pipeline:

1. Upload finalize publishes event to Pub/Sub: {fileId, mimeType, chunkRef[0]}.
2. Thumbnail Worker pool consumes events (Pub/Sub pull subscription, N workers).
3. Worker fetches first chunk from Colossus (enough for images; for video, first I-frame).
4. Generate 256×256 JPEG: image → Cloud Vision API resize for images; ffmpeg first-frame for video; pdf2image for PDFs.
5. Upload thumbnail to GCS: gs://drive-thumbnails/{fileId}/{version}.jpg.
6. Update Spanner file record: thumbnailLink = signed GCS URL.
7. Served via CDN (immutable URL since versioned — cache forever until file update).

This is fire-and-forget. Users see a placeholder while the thumbnail generates. For updated files, version in URL changes, CDN cache naturally invalidates.`,
    followups: ["How do you handle thumbnail generation for a 2-hour 4K video efficiently?", "What happens if the thumbnail worker crashes mid-job?"],
  },
  {
    id: "gdrive-q9",
    category: "Database Design",
    difficulty: "Easy",
    round: "Screening",
    asked_at: ["Google", "Amazon", "Microsoft"],
    question: "What database does Google Drive use for file metadata and why?",
    answer: `Cloud Spanner — Google's globally distributed, externally consistent relational database.

Why Spanner over alternatives:
• ACID transactions: moving a file between folders must be atomic. NoSQL (Cassandra, DynamoDB) can't do this reliably across rows.
• Global consistency: a file shared with someone in Tokyo must immediately be visible to them — not eventually.
• Scale: Spanner handles billions of rows with automatic sharding, no manual shard management.
• SQL: complex queries like "list all files in folder X modified after date Y" use standard SQL.

Alternative considered: Bigtable is used for upload session state (append-heavy, no transactions needed). Redis is the ACL hot cache (5 min TTL). But the source of truth for the file tree is always Spanner.`,
    followups: ["Could you use DynamoDB instead of Spanner? What would you lose?"],
  },
  {
    id: "gdrive-q10",
    category: "Security & DRM",
    difficulty: "Easy",
    round: "Screening",
    asked_at: ["Google", "Dropbox", "Box"],
    question: "How does Google Drive implement the 'Anyone with link' sharing feature?",
    answer: `HMAC-signed token embedded in the share URL:

1. When user enables "anyone with link", Drive generates: token = HMAC-SHA256(secretKey, fileId + ":anyoneWithLink")
2. The secret key is stored per-file in Spanner (shares table, link_token column).
3. The share URL contains this token as a URL parameter.
4. On access: server recomputes HMAC with stored secret, compares — if match, grants access.

Revocation: delete the shares row and rotate the per-file secret key. Old tokens immediately fail HMAC verification — no need to invalidate CDN caches because every request re-validates the token with Drive.

This avoids the need for a user account to access the file while still allowing instant revocation.`,
    followups: ["What prevents someone from brute-forcing the HMAC token?", "How would you add expiry to a shared link?"],
  },
  {
    id: "gdrive-q11",
    category: "Estimation",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Google", "Dropbox", "Amazon"],
    question: "Before drawing any boxes, walk me through a back-of-the-envelope estimation for Google Drive's scale.",
    answer: `This is the "size the system before you design it" step — every number should map to a component in the architecture.

STATE YOUR ASSUMPTIONS FIRST:
• 1B total users, ~5 GB average used of the 15 GB free quota
• Chunk size: 256 KB, content-addressed by SHA-256
• Colossus bloom filter sized for ~100B unique chunks
• ~2 PB/day requested upload throughput
• 200M DAU, each generating ~5 sync-relevant change events/day

1. Logical vs physical storage: 1B users × 5 GB = 5 exabytes of "logical" storage if nothing were deduplicated. At 256 KB/chunk that's ~20 trillion logical chunk references. Colossus's bloom filter is sized for only ~100B UNIQUE chunks — a ~200x dedup ratio. This is why "uploading a popular file transfers 0 bytes" is the dominant storage-saving mechanism, not a footnote.

2. Unique chunk storage: 100B unique chunks × 256 KB ≈ 25.6 PB before replication. ×3 sync replicas + ~1.5x erasure-coding overhead ≈ ~115 PB physical. This is the number behind Colossus's "Petabytes/day" throughput requirement.

3. Upload throughput vs dedup: 2 PB/day requested, but at ~200x dedup the actual NEW bytes written ≈ 10 TB/day. This 200x reduction is exactly why Upload Service runs the checksum handshake BEFORE any byte transfer.

4. Sync fan-out: 200M DAU × 5 events/day = 1B events/day ≈ 11,600 events/sec. Fan out to ~3 devices/user ≈ 35,000 WebSocket pushes/sec steady state, peak ~100K/sec — this justifies Pub/Sub over DB polling for the change log.

5. Search index lag: the same 11,600 events/sec must reach Elasticsearch within the 5-second lag SLA, at ~1,000 docs/bulk request → ~12 bulk requests/sec — comfortably scalable.

Tie it together: 100B unique chunks → Colossus + bloom filter, ~115 PB → erasure-coded chunk store, 11,600 events/sec → Pub/Sub change log, ~35K pushes/sec → Notification Service. Always close by pointing back at the diagram.`,
    followups: [
      "How would these numbers change if Drive dropped the free 15 GB tier to 5 GB?",
      "If the dedup ratio dropped from 200x to 50x overnight (e.g. more encrypted/unique content), which component breaks first?",
      "How do you estimate the Pub/Sub partition count needed for the 1B events/day change log?",
    ],
  },
  {
    id: "gdrive-q12",
    category: "Architecture",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Google", "Dropbox", "Box"],
    question: "Drive's Sharing & Perms service is called by Upload, Metadata, Sync, and Search on nearly every request — it's the hottest internal dependency in the system. How would you make calls to it resilient, and how would you control who can call it, without every team hand-rolling retries and ACL checks?",
    answer: `Push these cross-cutting concerns into a service mesh — an Envoy sidecar deployed next to every service instance, with a central control plane (Istio/Consul/AWS App Mesh) pushing policy to all of them.

WHY THIS FITS DRIVE:
• Five core services (Upload, Metadata, Sync, Search, Sharing & Perms) sit behind the Edge/API Gateway and call each other constantly
• Sharing & Perms backs every download/view across 1B users — a slow Spanner ACL query anywhere becomes a system-wide latency spike
• Search's BM25 ranking weights change often and need safe canary rollout

1. DATA PLANE — Envoy sidecar per pod:
   • iptables transparently redirects in/out traffic through it
   • Load balancing (LEAST_REQUEST), retries, timeouts, circuit breaking, mTLS — all uniform, zero app code change
   • Emits identical metrics/logs/traces for every service

2. CONTROL PLANE — Istio pushes policy centrally:
   • "Retry Sharing & Perms 2x with 30ms timeout on 503"
   • "Search ranking v2 gets 5% canary traffic"
   • "Only Metadata, Search, Upload may call Sharing & Perms"

WHAT THIS BUYS:
• Circuit breaking — outlierDetection ejects unhealthy Sharing & Perms pods after 5 consecutive 5xx in 10s; callers fall back to the existing 5-minute Redis ACL cache instead of piling up requests on a struggling Spanner-backed service
• Canary ranking rollouts — deploy search:v2 alongside v1, route a 5% weighted slice via VirtualService, watch click-through and p99 latency, then shift to 25% → 100% or roll back instantly
• Zero-trust for ACL data — PeerAuthentication STRICT enforces mTLS everywhere, and an AuthorizationPolicy on Sharing & Perms allows only metadata, search, and upload principals — even a compromised Sync Engine pod can't query another user's permissions
• End-to-end tracing — one trace ID follows an "open file" request across Edge Gateway → Metadata → Sharing & Perms → Colossus chunk URLs

TRADE-OFFS:
• ~1-2ms extra latency per hop — negligible vs the <1s sync latency and 5s search-index lag budgets
• Control plane becomes a new critical dependency, though sidecars cache last-known config if it's down
• Pub/Sub-based async paths (change log, notifications) bypass the mesh — it only governs synchronous calls`,
    followups: [
      "How would you roll the mesh out incrementally across five services without a big-bang migration?",
      "If outlierDetection ejects 50% of Sharing & Perms pods, what happens to the requests that were already in flight to those pods?",
      "How would you extend this mTLS/AuthorizationPolicy model to cover Spanner and Colossus themselves, not just the services in front of them?",
    ],
  },
];
