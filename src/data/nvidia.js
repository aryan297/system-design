export const NVIDIA_HLD = {
  title: "NVIDIA Cloud Platform — High Level Design",
  subtitle: "Shared GPU fleet across GeForce NOW cloud gaming, DGX Cloud AI training, and CUDA/driver distribution — 100K+ GPUs, 25M+ gamers, 500M+ devices",
  overview: `NVIDIA's cloud platform sits on top of a single shared resource: a global fleet of physical GPUs (A100s, H100s, and newer) spread across data centers worldwide. Three very different products compete for that same fleet. GeForce NOW streams AAA games to 25M+ subscribers with sub-30ms interactive latency. DGX Cloud rents out multi-GPU clusters for AI training and inference to enterprises. And the CUDA/driver/NGC distribution pipeline pushes software updates to the 500M+ GPUs already in customers' hands.

The hard system-design problem isn't any one of these in isolation — it's GPU FLEET ALLOCATION: how do you partition a scarce, power-constrained, heterogeneous resource across a real-time interactive workload (gaming, evening peaks, zero-tolerance for mid-session preemption), a long-running batch workload (training, hours-to-days, preemptible if checkpointed), and a pure software-distribution workload (drivers/CUDA, doesn't need a GPU at all but must respect a GPU-architecture compatibility matrix) — while keeping fleet utilization high and honoring very different SLAs for each.

Other hard problems threaded through this design: Multi-Instance GPU (MIG) partitioning for safe multi-tenancy on a single card; gang-scheduling multi-GPU training jobs across NVLink/InfiniBand topology; checkpoint-and-resume as the mechanism that makes preemption survivable; staged, telemetry-gated rollouts for driver/firmware updates reaching hundreds of millions of devices; and a power budget — not GPU count — as the true ceiling on data-center capacity.`,

  metrics: [
    { label: "GeForce NOW members",       value: "25M+",       note: "Free, Priority, Ultimate tiers" },
    { label: "Peak concurrent sessions",  value: "~150K",      note: "simultaneous streams, evening peak" },
    { label: "DGX Cloud GPU fleet",       value: "100K+",      note: "H100/A100-class accelerators" },
    { label: "Training jobs / day",       value: "50K+",       note: "across DGX Cloud clusters" },
    { label: "CUDA-enabled devices",      value: "500M+",      note: "receive driver/CUDA/NGC updates" },
    { label: "Driver/NGC downloads",      value: "10M+/day",   note: "served via multi-tier CDN" },
    { label: "Session start latency",     value: "< 15s",      note: "P95, queue-to-first-frame, paid tiers" },
    { label: "GPU power draw",            value: "~700W",      note: "H100 SXM — power, not count, caps capacity" },
  ],

  diagram: `
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                               │
│  GeForce NOW App · DGX Cloud SDK / Notebook · GPU Driver / NGC Client   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │  HTTPS / gRPC / WebRTC — session signaling, job submission, driver checks
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      API GATEWAY (Kong / AWS ALB)                       │
│         SERVICE MESH — Envoy sidecar attached to every service          │
│  Auth (JWT/API Key) · Rate Limiting · Region Routing · Session Resume   │
│      mTLS · Load Balancing · Retries · Circuit Breaking · Tracing       │
└──────────┬────────────┬────────────┬────────────┬────────────┬──────────┘
           │            │            │            │            │
           ▼            ▼            ▼            ▼            ▼
     ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
     │ Session  │ │  Stream  │ │ Training │ │ Driver / │ │GPU Fleet │
     │Queue Svc │ │ Service  │ │Scheduler │ │ NGC Dist │ │ Manager  │
     └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
           │            │            │            │            │
           ▼            ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             KAFKA EVENT BUS                             │
│   session.assigned · job.scheduled · gpu.allocated · driver.released    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                               DATA LAYER                                │
│      PostgreSQL (jobs, sessions, fleet) · Redis (GPU slots, queue)      │
│  Time-series DB (telemetry) · S3/CDN (driver/NGC images, checkpoints)   │
└─────────────────────────────────────────────────────────────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "GPU Fleet — The Shared Resource Layer",
      sections: [
        {
          title: "GPU Inventory & Multi-Instance GPU (MIG) Partitioning",
          content: `NVIDIA's cloud platform — GeForce NOW, DGX Cloud, and the driver/CUDA distribution pipeline — all sit on top of one shared substrate: a global fleet of physical GPUs (A100, H100, L40S, and newer) spread across data centers worldwide. The GPU Fleet Manager is the system of record for this fleet.

FLEET INVENTORY (per physical GPU):
  gpu_id, sku (H100-SXM5-80GB / A100-80GB / L40S / ...), datacenter_id,
  rack_id, nvlink_domain_id (which GPUs share an NVSwitch fabric),
  status: AVAILABLE | ALLOCATED | DRAINING | FAULTY | RESERVED
  mig_mode: ENABLED | DISABLED, mig_profile (if enabled)

MULTI-INSTANCE GPU (MIG):
  A single H100 can be partitioned into up to 7 isolated instances
  (profiles 1g.10gb ... 7g.80gb), each with dedicated memory, a slice of
  L2 cache and memory bandwidth, and its own hardware fault domain — a
  crash in one tenant's slice cannot affect another tenant's slice on the
  same physical card.

TWO POOLS, ONE FLEET:
  WHOLE-GPU POOL (MIG disabled): GeForce NOW sessions (need a full GPU for
  frame-rate guarantees) and large multi-GPU DGX Cloud training jobs (need
  NVLink between GPUs — MIG slices can't span physical cards, so MIG is
  irrelevant/disabled here).
  MIG-SLICED POOL (MIG enabled): DGX Cloud inference, dev/notebook
  workloads, internal CI — many small tenants packed onto one card.

  Switching a GPU between pools requires a MIG-mode change, which needs a
  full GPU reset — this is a SLOW, capacity-planning-time decision, not
  something a scheduler can do per-request. The Fleet Manager exposes this
  split as two largely-separate capacity pools, resized on a daily/weekly
  cadence based on demand forecasts, not in real time.`,
        },
        {
          title: "Workload Classification & Fleet Allocation Strategy",
          content: `Three workload classes compete for the whole-GPU pool, each with a very different SLA:

INTERACTIVE (GeForce NOW):
  Allocation latency: sub-second to low-tens-of-seconds
  Locality: must be in a data center within ~30ms RTT of the player
  Duration: minutes to a few hours
  Preemption: NOT ALLOWED mid-session — preempting a paying gamer's GPU
  mid-game is a refund-and-churn event, not a retry

BATCH (DGX Cloud training):
  Allocation: gang-scheduled, topology-co-located (same NVLink/NVSwitch
  domain for single-node multi-GPU, same InfiniBand leaf for multi-node)
  Duration: hours to days
  Preemption: ALLOWED if the job checkpoints (Phase 3)

DISTRIBUTION (driver/CUDA/NGC):
  Doesn't consume fleet GPU capacity at all — it's a CDN/object-storage
  problem (Phase 4). The only coupling to the fleet is the GPU-architecture
  COMPATIBILITY MATRIX that determines which driver/CUDA build a given
  physical GPU can run.

FLEET ALLOCATION STRATEGY — THE SPILLOVER POOL:
  Data centers are tagged with a primary affinity: GAMING-OPTIMIZED (near
  population centers, low-latency network) or TRAINING-OPTIMIZED (high-
  bisection-bandwidth fabric, often cheaper power/land). But within any
  given data center, a SPILLOVER POOL of whole-GPUs is shared:

  - GeForce NOW's demand curve peaks evenings/weekends in each region
    (consumer gaming hours)
  - DGX Cloud training demand is comparatively flat across the day but
    FLEXIBLE on when it runs

  During a region's GeForce NOW evening peak, the Fleet Manager preempts
  Spot-tier DGX Cloud jobs in that region's spillover pool and reassigns
  those GPUs to gaming sessions. During the day, the same GPUs serve
  training jobs. Priority order for the spillover pool:

    GeForce NOW Priority/Ultimate session
      > GeForce NOW Free session (queued, not killed)
      > DGX Cloud Reserved job (never touched)
      > DGX Cloud On-Demand job
      > DGX Cloud Spot job (first to be preempted)`,
        },
        {
          title: "Back-of-the-Envelope Estimation",
          content: `Before designing the queueing, scheduling, and distribution systems in later phases, it helps to convert NVIDIA's headline membership/fleet numbers into the actual rates and pool sizes that drive design decisions.

ASSUMPTIONS:
  25M GeForce NOW members; peak concurrent streaming sessions ~150,000
  Avg GeForce NOW session length ~40 min = 2,400s
  ~70% of concurrent sessions need a "whole-GPU-equivalent" (Priority/
  Ultimate); the rest (Free tier) run on MIG-shared slices
  DGX Cloud whole-GPU fleet: 100,000 GPUs
  ~500M CUDA-enabled devices, checking for updates ~weekly, avg payload
  (driver + CUDA delta) ~700MB

THE FOUR DERIVATIONS:

1. GeForce NOW session arrival rate via Little's Law:
   concurrent = arrival_rate × avg_session_length
   150,000 = arrival_rate × 2,400s
   → arrival_rate ≈ 62.5 sessions/sec at peak
   → the Session Queue Service must assign a GPU roughly every 16ms at
   peak — THIS is the number that sizes the queue/assignment hot path,
   not the 25M membership figure.

2. Whole-GPU demand from GeForce NOW at peak:
   150,000 concurrent × ~70% whole-GPU-equivalent ≈ 105,000 GPUs
   → GeForce NOW provisions a DEDICATED whole-GPU pool sized with
   headroom for this peak (≈120,000 GPUs), separate from DGX Cloud's
   100,000-GPU fleet.

3. Sizing the spillover pool — the number that actually matters:
   The spillover pool only needs to cover the GAP during transition
   hours and unexpected spikes, not the full peak. If DGX Cloud's Spot
   tier is contractually sized to be <= the spillover pool, and Spot
   typically represents ~10-15% of the 100,000-GPU DGX fleet
   → spillover pool ≈ 10,000-15,000 GPUs, shared between the two
   products.
   → THIS is the number platform engineers actually argue about — not
   "how many GPUs total," but "how big does the shared pool need to be
   before Reserved-tier DGX Cloud SLAs are ever at risk during a
   GeForce NOW peak."

4. Driver/CUDA distribution load:
   500,000,000 devices × ~700MB ÷ 7 days ≈ 50 PB/day of egress
   → an origin store could never survive this; it MUST be served from
   CDN edge caches with content-addressed, delta-only payloads
   (Phase 4) — origin (S3-equivalent) only serves true cache misses.

INTERVIEW PUNCH LINE:
  "25M GeForce NOW members" sounds like it should size the GPU fleet —
  it doesn't. Little's Law (derivation #1) converts membership into an
  ARRIVAL RATE, which is what actually sizes the Session Queue Service.
  And even the resulting ~105,000-GPU peak demand (derivation #2) isn't
  the interesting number — what matters is the much smaller SPILLOVER
  POOL (derivation #3, ~10-15K GPUs), which determines whether GeForce
  NOW's evening peak can be absorbed by better SCHEDULING of the
  existing fleet, or whether NVIDIA needs to buy more GPUs.`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "GeForce NOW — Cloud Gaming Sessions",
      sections: [
        {
          title: "Session Queueing & GPU Instance Assignment",
          content: `GAME LAUNCH FLOW:
  1. User taps Play → Session Queue Service reads subscription tier:
       FREE:     1hr sessions, MIG-shared GPU class, lowest queue priority
       PRIORITY: 6hr sessions, dedicated mid-tier GPU (e.g. RTX 4080-class)
       ULTIMATE: 6hr sessions, dedicated top-tier GPU, 4K/120fps eligible
  2. Client reports approximate location → Fleet Manager queried for an
     AVAILABLE whole-GPU of the required class in the nearest 1-2 regions
     (cross-region adds 40-80ms — enough to blow the <30ms interactive
     budget from Phase 1)
  3. GPU available now? → instant assignment, target <15s queue-to-first-
     frame for paid tiers (P95, see metrics)
  4. GPU not available? → ZADD into a Redis FIFO queue keyed by
     (region, gpu_class); queue position pushed to the client over
     WebSocket every few seconds

MULTI-QUEUE, NOT SINGLE-QUEUE:
  Free tier sits in its OWN queue behind Priority/Ultimate — paid tiers
  have a separate, higher-priority queue that's drained first. A Free
  user can watch their position barely move during a Priority/Ultimate
  surge; this is intentional, not a bug.

PRE-WARMED INSTANCE POOL:
  Game-install-on-demand would take minutes — unacceptable against a
  <15s target. Each data center maintains a "game library cache": VM/
  container images with the top N games (by regional popularity,
  refreshed daily) pre-installed on local NVMe, ready to attach to any
  freed GPU instance within seconds.

STICKY SESSIONS:
  Once assigned, a session is pinned to that specific GPU instance for
  its duration. A reconnect within a ~5 minute grace window resumes the
  SAME instance — preserving in-memory game state. This is the same
  "session affinity" idea as a sticky load balancer, except the stakes
  are an entire in-progress game session, not just a shopping cart.`,
        },
        {
          title: "Real-Time Game Streaming — Video & Input Pipeline",
          content: `VIDEO PIPELINE:
  The assigned GPU renders the game locally; NVENC (the GPU's hardware
  encoder) compresses each frame to H.264/AV1; frames are pushed to the
  client over WebRTC. Target glass-to-glass latency: <30ms (render +
  encode + network + decode) — roughly two orders of magnitude tighter
  than a VOD platform's multi-second buffering window.

WHY WebRTC, NOT HLS/DASH:
  Chunk-based HTTP streaming (the Hotstar/Netflix pattern elsewhere in
  this series) buffers several seconds of segments to smooth playback —
  fine for passive video, unplayable for a twitch-reflex game. WebRTC's
  UDP-based transport accepts occasional frame loss in exchange for NEVER
  waiting on a retransmit.

ADAPTIVE BITRATE — LATENCY FIRST:
  Under network degradation, the encoder drops resolution and/or
  framerate BEFORE adding any buffer. This is the OPPOSITE priority order
  from a VOD ABR ladder, which buffers a bit to avoid a visible quality
  drop. Here, a visible quality drop is preferable to ANY added latency.

INPUT PATH — A SEPARATE LOW-LATENCY CHANNEL:
  Keyboard/mouse/controller input is captured client-side and sent over
  its own low-latency UDP channel, independent of the video stream. The
  GPU instance injects these events into a virtual input device
  (uinput/vJoy-equivalent) and renders them in the next frame. Decoupling
  input from video means a dropped/retransmitted video frame never blocks
  input delivery — the single most important property for perceived
  "responsiveness."

PER-SESSION TELEMETRY & REGIONAL FAILOVER:
  RTT, jitter, frame-drop rate, and encode time stream continuously to a
  time-series store. If RTT degrades persistently, the client is offered
  a "switch to a closer data center" prompt — a per-session analogue of
  Phase 1's region-level spillover decision, but triggered by network
  quality rather than fleet capacity.`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "DGX Cloud — AI Training & Inference",
      sections: [
        {
          title: "Distributed Training Job Scheduling — Gang Scheduling & Bin-Packing",
          content: `JOB SUBMISSION:
  A training job spec includes: container image, framework (PyTorch DDP/
  FSDP, etc.), GPU count, and priority tier (Reserved / On-Demand / Spot).

THE DEFINING CONSTRAINT — GANG SCHEDULING:
  A multi-GPU job needs ALL its GPUs allocated SIMULTANEOUSLY and
  TOPOLOGICALLY CO-LOCATED:
    - same NVLink/NVSwitch domain for single-node multi-GPU
    - same InfiniBand leaf switch / rack for multi-node
  Cross-domain GPU communication for gradient all-reduce is 10-100x
  slower, turning a compute-bound job into a network-bound one. Partial
  allocation is WORSE than no allocation — a job with 7 of 8 requested
  GPUs simply cannot start.

ALL-OR-NOTHING, JUST LIKE A SEAT LOCK:
  This "all-or-nothing, topology-aware" allocation is conceptually the
  same shape as BookMyShow's multi-seat lock elsewhere in this series:
  the scheduler reserves a topologically-valid set of N GPUs ATOMICALLY
  (or queues the whole job), rather than incrementally claiming GPUs one
  at a time and risking a partial, useless allocation.

BIN-PACKING ACROSS THE TOPOLOGY GRAPH:
  The scheduler maintains a topology graph (which GPUs share an NVSwitch
  / which nodes share an IB leaf switch) and searches for a contiguous-
  enough free block:
    - small jobs (1-8 GPUs) bin-pack into leftover slivers
    - large jobs (256+ GPUs) may need to wait for a full rack/pod to
      free up

PRIORITY TIERS — QUEUE ORDER AND PREEMPTION RIGHTS:
  RESERVED:   contractually guaranteed capacity, never queues
  ON-DEMAND:  queues FIFO within its priority class
  SPOT:       runs opportunistically, first to be preempted (Phase 1's
              spillover mechanism)`,
        },
        {
          title: "Checkpointing, Preemption & Spot Capacity",
          content: `PREEMPTION PROTOCOL:
  1. Scheduler sends a preemption signal with a grace period (typically
     30-120s)
  2. The training framework's checkpoint callback flushes optimizer +
     model state to durable object storage (S3-compatible)
  3. Job marked REQUEUED
  4. When GPUs free up again — anywhere in the fleet, not necessarily the
     same physical cards — the job resumes from the latest checkpoint

CHECKPOINT FREQUENCY TRADEOFF:
  Too frequent (e.g. every step): I/O overhead can dominate runtime for
  large models
  Too rare (e.g. every few hours): hours of lost compute on preemption
  Typical practice: checkpoint every N minutes, tuned so checkpoint-write
  time is <5% of total runtime, PLUS an immediate forced checkpoint the
  moment a preemption signal arrives (if the grace period allows it)

THE RELEASE VALVE FROM PHASE 1:
  GeForce NOW's evening peak doesn't "ask permission" — it preempts
  Spot-tier DGX Cloud jobs in the shared spillover pool, and because
  those jobs checkpoint on preemption, the worst case is "resume from N
  minutes ago," not "lose the whole job."

SPOT PRICING REFLECTS THE RISK:
  Spot GPU-hours are priced significantly below On-Demand specifically
  because the customer accepts preemption risk. DGX Cloud's economics
  depend on Spot capacity being used precisely BECAUSE it's the buffer
  that makes high fleet-wide utilization possible without over-
  provisioning for GeForce NOW's peak.

GANG JOBS PREEMPT AS A UNIT:
  If even one node in a gang-scheduled job is preempted, the WHOLE job
  stalls — all-reduce can't proceed with a missing rank. The scheduler
  therefore treats a gang-scheduled job as a SINGLE preemption unit, not
  per-GPU: preempting "3 of 64 GPUs" isn't a thing — it's "preempt the
  job," full stop.`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "CUDA / Driver / NGC Distribution at Scale",
      sections: [
        {
          title: "Driver & Container Image Distribution Pipeline",
          content: `TWO ARTIFACT TYPES:
  1. GPU DRIVERS — Game Ready Driver (consumer GPUs), Studio/Enterprise
     drivers (workstation/datacenter GPUs); each a few hundred MB
  2. NGC CONTAINER IMAGES — pre-built ML framework containers (PyTorch,
     TensorRT, Triton); multi-GB

CONTENT-ADDRESSED, DELTA-ONLY:
  Container images use standard OCI layer hashing — an unchanged base
  layer is NEVER re-downloaded (a framework point-release might only
  change a 50MB top layer of a 10GB image). Drivers ship as binary deltas
  against the previous version where possible.

A PURE CDN / OBJECT-STORAGE PROBLEM:
  Origin lives in S3-equivalent object storage, fronted by a multi-tier
  CDN. This matches Phase 1's back-of-the-envelope: ~500M devices × ~weekly
  checks × hundreds of MB ≈ tens of PB/day — only edge caching makes this
  feasible. Origin only serves true cache misses (a brand-new release's
  first wave of requests per edge POP).

THE ONE FLEET TOUCHPOINT — THE COMPATIBILITY MATRIX:
  A driver build declares which GPU architectures (Turing / Ampere /
  Hopper / Blackwell) and CUDA toolkit versions it supports. The client
  (game client, GPU driver updater, or NGC client) reports its GPU model
  + current driver version; the Distribution Service's compatibility
  service returns ONLY the set of updates valid for that hardware — this
  prevents, e.g., shipping a Blackwell-only CUDA 13 toolkit to a machine
  with a Pascal-era GPU.`,
        },
        {
          title: "Staged Rollouts, Compatibility Matrix & Telemetry-Driven Rollback",
          content: `STAGED ROLLOUT — SAME SHAPE AS A CANARY DEPLOY:
  internal dogfood
    → opt-in "Beta/New Feeds" channel (small % of enthusiasts)
    → general availability for the relevant compatibility-matrix segment
    → staged percentage ramp (e.g. 5% → 25% → 100% of eligible devices
      over several days)

TELEMETRY-DRIVEN CANARY ANALYSIS:
  Driver-level crash dumps, GPU reset events, and BSOD/kernel-panic
  signals are correlated with the specific driver version that was active.
  If the crash rate for a new version among the rollout cohort exceeds a
  threshold relative to the baseline (previous version):
    - rollout AUTOMATICALLY PAUSED at the current percentage
    - beyond a higher threshold, the "recommended update" flag is pulled
  Devices already updated are NOT forcibly rolled back — drivers aren't
  auto-uninstalled — but no NEW devices receive that version until a fix
  ships.

TWO RELEASE TRACKS, MATCHING PHASE 1'S WORKLOAD SPLIT:
  GAME READY DRIVER: frequent releases, often timed to major game
  launches, prioritizing latest-game support and accepting a higher
  iteration rate
  DATA CENTER / LTS: DGX Cloud and enterprise customers pin to long-term-
  support branches that update on a much slower, heavily regression-
  tested cadence — an unplanned driver update mid-training-run on a
  512-GPU job is far more costly than a consumer hitting a bug in a
  single-player game

SAME IDEA, DIFFERENT ARTIFACT:
  This mirrors the service-mesh canary pattern used elsewhere in this
  series (header-based weighted traffic routing) but applied to firmware/
  driver rollout instead of API traffic — the same "statistical
  confidence before 100% ramp" discipline, just on a much longer
  timescale (days, not minutes).`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "Multi-Tenancy, Reliability & Scale",
      sections: [
        {
          title: "Multi-Tenant Isolation & Quota Enforcement (MIG, GPU-Hours)",
          content: `TWO DIFFERENT MULTI-TENANCY STORIES:
  GeForce NOW sessions are SINGLE-TENANT-PER-GPU — gaming needs the whole
  GPU's compute and the security isolation of a full hypervisor boundary;
  no two players ever share a physical GPU.
  DGX Cloud inference/dev workloads use MIG (Phase 1) to pack MULTIPLE
  tenants onto one physical GPU.

WHY MIG ISOLATION IS QUALITATIVELY DIFFERENT:
  Each MIG instance gets dedicated memory (with ECC), a dedicated slice of
  L2 cache and memory bandwidth, and its own fault domain — a process
  crash or even a hardware fault in one tenant's slice doesn't affect
  another tenant's slice on the same card. This is a HARDWARE guarantee,
  unlike software-level cgroup/process isolation, which shares the memory
  controller and can suffer noisy-neighbor bandwidth contention.

QUOTA ENFORCEMENT:
  DGX Cloud: GPU-hour quotas. Reserved tier = committed capacity, billed
  whether used or not. On-Demand/Spot = metered.
  GeForce NOW: subscription tiers cap session LENGTH and GPU CLASS rather
  than GPU-hours — Free gets 1hr sessions on shared/MIG-class hardware,
  Ultimate gets 6hr sessions on dedicated top-tier GPUs.

WHEN QUOTAS ARE CHECKED:
  At ADMISSION TIME — Session Queue Service / Training Job Scheduler
  reject or queue requests exceeding quota — AND CONTINUOUSLY: a long-
  running job that has consumed its Reserved allocation and is now
  running on On-Demand capacity gets re-tagged mid-flight for billing
  and preemption purposes.`,
        },
        {
          title: "Reliability & Scale at Peak — Cross-Workload Load Balancing & Power Limits",
          content: `THE CROSS-PRODUCT LOAD-BALANCING LOOP (CONTINUOUS):
  As GeForce NOW's regional evening peak rolls across timezones (roughly
  follows local 6pm-midnight), the Fleet Manager shifts Spot-tier DGX
  Cloud capacity in each region accordingly. A training job queued in
  US-West during US evening peak might get scheduled in EU or APAC data
  centers currently in their daytime off-peak — IF the job's data/
  checkpoints are accessible there. Data gravity, not GPU availability,
  is the real constraint on this kind of cross-region shift.

GPU FAILURE HANDLING:
  Continuous health checks (ECC error rates, thermal throttling, Xid
  errors from the NVIDIA driver). A GPU crossing a fault threshold is
  marked DRAINING:
    - in-flight GeForce NOW sessions on that GPU → forced reconnect to a
      new instance (brief freeze, then resume — same sticky-session pool,
      different physical GPU)
    - in-flight training work on that GPU → triggers the Phase 3
      preemption/checkpoint path

THE REAL CEILING IS POWER, NOT GPU COUNT:
  An H100 SXM draws ~700W, and a data center's substation has a fixed
  power budget. "Add more GPUs" isn't always possible even with empty
  rack space — fleet capacity planning is fundamentally a POWER-
  ALLOCATION problem. This is exactly why the spillover/preemption
  mechanisms in Phases 1 and 3 matter: squeezing more utilization out of
  ALREADY-POWERED GPUs is often cheaper and faster than building new
  power-delivery capacity.

THE DEGRADATION LADDER UNDER EXTREME LOAD:
  1. GeForce NOW Free tier queues lengthen first (cheapest to shed)
  2. Free tier sessions capped to lower GPU classes
  3. DGX Cloud Spot fully preempted, fleet-wide
  4. (last resort) DGX Cloud On-Demand queue grows
  Reserved-tier SLAs for both products are the last thing to give.`,
        },
      ],
    },
  ],
};

export const NVIDIA_LLD = {
  title: "NVIDIA Cloud Platform — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of core NVIDIA cloud platform services",

  components: [
    {
      id: "gpuFleetManager",
      title: "GPU Fleet Manager — LLD",
      description: "Global GPU inventory, MIG mode management, allocate/release/preempt API, spillover reassignment, health & draining",
      api: `POST /internal/fleet/allocate
{
  "workload_type": "INTERACTIVE" | "BATCH",
  "gpu_class": "RTX4080-CLOUD" | "H100-SXM5-80GB" | "A100-80GB" | "MIG_3G_40GB",
  "count": 1,
  "topology": "SINGLE" | "NVLINK_8" | "MULTI_NODE_IB",
  "region": "us-west",
  "priority_tier": "INTERACTIVE_ULTIMATE" | "INTERACTIVE_PRIORITY" |
                   "INTERACTIVE_FREE" | "RESERVED" | "ON_DEMAND" | "SPOT"
}

Response 200:
{
  "allocation_id": "alloc_8f21c",
  "gpu_ids": ["gpu_h100_uswest-dc3-r12-04", "gpu_h100_uswest-dc3-r12-05", ...],
  "nvlink_domain_id": "nvswitch_uswest-dc3-r12"
}

Response 202 (no capacity right now):
{ "status": "QUEUED" }

-- GPU inventory (Postgres, system of record) --
CREATE TABLE gpu_inventory (
  gpu_id            TEXT PRIMARY KEY,
  sku               TEXT NOT NULL,            -- 'H100-SXM5-80GB','A100-80GB','RTX4080-CLOUD'
  datacenter_id     TEXT NOT NULL,
  rack_id           TEXT NOT NULL,
  nvlink_domain_id  TEXT,
  mig_mode          TEXT NOT NULL DEFAULT 'DISABLED',  -- ENABLED | DISABLED
  mig_profile       TEXT,                      -- e.g. '3g.40gb', if sliced
  status            TEXT NOT NULL DEFAULT 'AVAILABLE',
                     -- AVAILABLE | ALLOCATED | DRAINING | FAULTY | RESERVED
  allocation_id     TEXT,
  power_watts       INT NOT NULL DEFAULT 700,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gpu_lookup ON gpu_inventory (datacenter_id, sku, mig_mode, status);

-- Redis mirror of AVAILABLE GPUs (hot path — Session Queue / Scheduler claim from here) --
SADD avail:{datacenter_id}:{sku}:{mig_mode}  {gpu_id}
SPOP avail:uswest-dc3:H100-SXM5-80GB:DISABLED   -- atomically claim one whole-GPU

-- Spillover reassignment (Phase 1 priority order, called by the
-- region's continuous load-balancing loop) --
POST /internal/fleet/preempt-spillover
{ "region": "us-west", "gpu_class": "H100-SXM5-80GB", "count": 40, "reason": "GFN_PEAK" }

  1. SELECT gpu_id FROM gpu_inventory
       WHERE region = ? AND sku = ? AND status = 'ALLOCATED'
         AND allocation_id IN (SELECT allocation_id FROM training_jobs
                                WHERE priority_tier = 'SPOT')
       LIMIT 40
  2. for each gpu_id -> Training Job Scheduler.preempt(job for gpu_id)
  3. on confirmation: status = 'AVAILABLE', allocation_id = NULL
  4. SADD avail:{datacenter_id}:{sku}:DISABLED {gpu_id}
     -> Session Queue Service's next SPOP picks these up

-- Health / draining --
PATCH /internal/fleet/gpu/{gpu_id}/status
{ "status": "DRAINING", "reason": "XID_79_ECC_DBE" }

  -> SREM from every avail:* set immediately (no new work scheduled)
  -> if ALLOCATED: notify owning service (Session Queue -> forced
     reconnect elsewhere, Training Scheduler -> preempt+checkpoint)
  -> once drained: status = 'FAULTY', flagged for hardware replacement`,
    },
    {
      id: "sessionQueueService",
      title: "Session Queue Service — LLD",
      description: "GeForce NOW launch flow — tier-aware multi-queue admission, GPU instance assignment, sticky-session reconnect",
      api: `POST /v1/sessions/launch
Authorization: Bearer <user_jwt>
{ "game_id": "g_cyberpunk2077", "region_hint": "us-west" }

Response 200 (assigned immediately):
{
  "status": "ASSIGNED",
  "session_id": "sess_8f2e1a",
  "instance_id": "gfn-inst-uswest-dc3-0451",
  "stream_token": "eyJhbGciOiJIUzI1NiJ9...",
  "expires_at": "2026-06-13T21:30:00Z"
}

Response 202 (queued):
{
  "status": "QUEUED",
  "queue_id": "queue:us-west:RTX4080-CLOUD:priority",
  "queue_position": 214,
  "eta_seconds": 95
}

-- Redis multi-queue, one ZSET per (region, gpu_class, tier_band) --
ZADD queue:us-west:RTX4080-CLOUD:priority <enqueued_at_epoch> sess_8f2e1a
ZADD queue:us-west:RTX4080-CLOUD:free      <enqueued_at_epoch> sess_91ab02
ZRANK queue:us-west:RTX4080-CLOUD:priority sess_8f2e1a   -- live queue position

-- Draining loop (per region+gpu_class, ticks every 1s) --
loop:
  1. drain queue:{region}:{gpu_class}:priority FIRST (Priority/Ultimate)
  2. only if empty, drain queue:{region}:{gpu_class}:free
  3. gpu_id = SPOP avail:{datacenter}:{gpu_class}:DISABLED   (Fleet Manager)
  4. if gpu_id: attach pre-warmed instance, write sessions row,
     push WebSocket { type: "ASSIGNED", instance_id, stream_token }
  5. else: leave at head of queue, retry next tick

-- sessions table (Postgres) --
CREATE TABLE sessions (
  session_id   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  game_id      TEXT NOT NULL,
  tier         TEXT NOT NULL,        -- FREE | PRIORITY | ULTIMATE
  gpu_id       TEXT,
  instance_id  TEXT,
  status       TEXT NOT NULL,        -- QUEUED|ASSIGNED|ACTIVE|DISCONNECTED|ENDED
  started_at   TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,          -- tier session-length cap (1hr/6hr)
  last_seen_at TIMESTAMPTZ
);

-- Sticky reconnect (5 min grace window) --
POST /v1/sessions/{session_id}/reconnect

  if status == 'DISCONNECTED'
     AND now() - last_seen_at < 5 min
     AND gpu_inventory.status(gpu_id) == 'ALLOCATED'   -- still ours
    -> status = 'ACTIVE', return SAME instance_id + fresh stream_token
  else
    -> status = 'ENDED', client calls /v1/sessions/launch from scratch`,
    },
    {
      id: "streamingService",
      title: "Streaming Service — LLD",
      description: "WebRTC signaling, NVENC encode pipeline, latency-first adaptive bitrate, separate input channel, per-session telemetry",
      api: `-- WebRTC signaling (SDP exchange) --
POST /v1/stream/{session_id}/offer
{ "sdp": "v=0\\r\\no=- 4611... ", "stream_token": "eyJhbGciOiJIUzI1NiJ9..." }

Response 200:
{
  "sdp": "v=0\\r\\no=- 9982... (answer)",
  "ice_servers": [{ "urls": "stun:stun.gfn.nvidia.com:3478" }],
  "input_channel": "udp://10.2.4.18:50112"
}

-- Encode ladder, keyed by GPU class / tier (latency-first ABR) --
ENCODE_LADDER = [
  { tier: "ULTIMATE", resolution: "3840x2160", fps: 120, bitrate_mbps: 80, codec: "AV1"  },
  { tier: "PRIORITY", resolution: "2560x1440", fps: 60,  bitrate_mbps: 35, codec: "H264" },
  { tier: "FREE",     resolution: "1280x720",  fps: 60,  bitrate_mbps: 12, codec: "H264" },
]

-- ABR adjustment loop (per session, every 500ms) --
if rtt_ms > target_rtt_ms * 1.3 or frame_drop_rate > 0.02:
    step DOWN the ladder  -- resolution/fps drop BEFORE any buffering
elif rtt healthy for last 10s and ladder_index > 0:
    step UP one level

-- Input channel (separate UDP stream, never blocked by video retransmits) --
client input event -> udp://input_channel -> uinput injection on instance
  { "type": "KEY_DOWN", "code": 87, "ts_client_ms": 182933110 }

-- Per-session telemetry (Time-series DB, 1 row/sec) --
{ session_id, ts, rtt_ms, jitter_ms, frame_drop_rate, encode_ms,
  bitrate_mbps, ladder_tier }

-- Regional failover prompt --
if p95(rtt_ms, last_30s) > 60ms:   -- 2x the <30ms interactive target
    push WebSocket { type: "SUGGEST_REGION_SWITCH", candidate_region: "us-central" }`,
    },
    {
      id: "trainingJobScheduler",
      title: "Training Job Scheduler — LLD",
      description: "DGX Cloud job submission, topology-aware gang-scheduling & bin-packing, priority queues, preemption hooks",
      api: `POST /v1/jobs
{
  "job_id": "job_llm_ft_8821",
  "image": "nvcr.io/org/pytorch-ddp:24.05",
  "gpu_count": 64,
  "required_sku": "H100-SXM5-80GB",
  "topology": "MULTI_NODE_IB",        -- SINGLE | NVLINK_8 | MULTI_NODE_IB
  "priority_tier": "ON_DEMAND",       -- RESERVED | ON_DEMAND | SPOT
  "checkpoint_uri": "s3://dgx-checkpoints/org/job_llm_ft_8821/"
}

Response 202:
{ "job_id": "job_llm_ft_8821", "status": "QUEUED", "queue_position": 7 }

-- training_jobs table (Postgres) --
CREATE TABLE training_jobs (
  job_id             TEXT PRIMARY KEY,
  org_id             TEXT NOT NULL,
  gpu_count          INT NOT NULL,
  required_sku       TEXT NOT NULL,
  topology           TEXT NOT NULL,
  priority_tier      TEXT NOT NULL,
  status             TEXT NOT NULL,   -- QUEUED|RUNNING|CHECKPOINTING|PREEMPTED|COMPLETED|FAILED
  allocation_id      TEXT,
  checkpoint_uri     TEXT NOT NULL,
  last_checkpoint_at TIMESTAMPTZ,
  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Priority queues (Redis ZSETs, drained on every capacity-change event) --
ZADD jobs:queue:RESERVED   <submitted_at> job_id   -- pre-carved, rarely queues
ZADD jobs:queue:ON_DEMAND  <submitted_at> job_id
ZADD jobs:queue:SPOT       <submitted_at> job_id

-- Gang-scheduling / bin-packing (topology graph search) --
function schedule(job):
  candidates = topology_graph.find_blocks(
      gpu_count = job.gpu_count,
      sku       = job.required_sku,
      topology  = job.topology
      -- e.g. MULTI_NODE_IB: N nodes x 8 GPUs all on one IB leaf switch
      -- e.g. NVLINK_8: 8 GPUs on one NVSwitch domain
  )
  if candidates is empty:
      enqueue(job, "jobs:queue:" + job.priority_tier)
      return QUEUED

  block = candidates[0]   -- best-fit by remaining fragmentation
  GPUFleetManager.allocate(gpu_ids = block.gpu_ids, allocation_id = job.job_id)
  training_jobs.status = 'RUNNING'
  training_jobs.allocation_id = block.allocation_id
  return RUNNING

-- Scheduler tick order: RESERVED queue first, then ON_DEMAND, then SPOT --

-- Preemption hook (called by GPU Fleet Manager's spillover reassignment) --
internal: TrainingJobScheduler.preempt(job_id, grace_period_seconds)
  -> delegates to Checkpoint & Preemption Service (next component)`,
    },
    {
      id: "checkpointService",
      title: "Checkpoint & Preemption Service — LLD",
      description: "Preemption signaling with grace period, checkpoint write/resume API, object-storage layout",
      api: `-- Preemption signal --
POST /internal/jobs/{job_id}/preempt
{ "grace_period_seconds": 60, "reason": "GFN_SPILLOVER_RECLAIM" }

  1. training_jobs.status = 'CHECKPOINTING'
  2. send SIGTERM-equivalent to job's rank-0 control sidecar
  3. job's framework checkpoint callback flushes optimizer + model state
     to checkpoint_uri within the grace period
  4. on completion (or grace-period expiry):
       training_jobs.status = 'PREEMPTED'
       GPUFleetManager.release(allocation_id)
       -> gpu_inventory rows for this allocation: status = 'AVAILABLE'

-- Checkpoint write notification (called by the framework callback) --
POST /internal/jobs/{job_id}/checkpoints
{ "uri": "s3://dgx-checkpoints/org/job_llm_ft_8821/step_48200/", "step": 48200 }

-- job_checkpoints table (Postgres) --
CREATE TABLE job_checkpoints (
  job_id     TEXT NOT NULL REFERENCES training_jobs(job_id),
  step       BIGINT NOT NULL,
  uri        TEXT NOT NULL,
  written_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, step)
);
UPDATE training_jobs SET last_checkpoint_at = now() WHERE job_id = ?;

-- Resume (called when the scheduler re-allocates a PREEMPTED/QUEUED job) --
GET /internal/jobs/{job_id}/checkpoints/latest
-> { "uri": "s3://dgx-checkpoints/org/job_llm_ft_8821/step_48200/", "step": 48200 }
-> injected into the new container as CHECKPOINT_RESUME_URI

-- Checkpoint cadence (set at submission, tuned per job) --
checkpoint_interval_seconds = max(60, step_time_seconds * N)
  where N is chosen so:  checkpoint_write_time / (N * step_time) < 0.05
  PLUS: an immediate forced checkpoint fires the instant a /preempt
  signal arrives, if grace_period_seconds allows it`,
    },
    {
      id: "distributionService",
      title: "Driver / NGC Distribution Service — LLD",
      description: "Compatibility-matrix-aware update checks, staged rollout percentages, telemetry-driven canary pause/rollback",
      api: `GET /v1/updates/check?device_id=dev_abc123&gpu_model=RTX4070&current_driver=551.23&os=win11

Response 200:
{
  "driver_updates": [
    { "version": "560.10", "channel": "GAME_READY", "rollout_pct": 25,
      "url": "https://cdn.nvidia.com/drivers/560.10/win11/ada/delta_from_551.23.bin",
      "size_bytes": 412000000 }
  ],
  "ngc_updates": []
}

-- Compatibility matrix (Postgres) --
CREATE TABLE driver_compatibility (
  driver_version    TEXT NOT NULL,
  gpu_architecture  TEXT NOT NULL,  -- AMPERE | ADA_LOVELACE | HOPPER | BLACKWELL
  min_cuda          TEXT NOT NULL,
  max_cuda          TEXT,
  channel           TEXT NOT NULL,  -- GAME_READY | STUDIO | DATACENTER_LTS
  PRIMARY KEY (driver_version, gpu_architecture)
);

-- /v1/updates/check resolution --
  1. arch = lookup_architecture(gpu_model)               -- 'RTX4070' -> ADA_LOVELACE
  2. candidates = driver_compatibility WHERE gpu_architecture = arch
                    AND driver_version > current_driver
  3. for each candidate: rollout = HGETALL rollout:{driver_version}
       skip if rollout.status IN ('PAUSED','RECALLED')
       include only if hash(device_id) % 100 < rollout.pct   -- staged ramp

-- Rollout config (Redis, one hash per driver version) --
HSET rollout:560.10  pct 25  status ACTIVE  baseline_version 551.23

-- Crash telemetry ingestion (async, via Kafka — not synchronous mesh traffic) --
topic: driver.crash_reported
{ "device_id": "...", "driver_version": "560.10", "gpu_model": "RTX4070",
  "crash_type": "XID_79", "ts": "2026-06-13T20:14:02Z" }

-- Canary analysis (runs every 5 min per ACTIVE rollout) --
crash_rate_new      = crashes(560.10, last_1h) / installs(560.10)
crash_rate_baseline = crashes(551.23, last_1h) / installs(551.23)

if crash_rate_new > crash_rate_baseline * 3:
    rollout:560.10.status = 'PAUSED'       -- halt percentage ramp
if crash_rate_new > crash_rate_baseline * 10:
    rollout:560.10.status = 'RECALLED'     -- drop from /v1/updates/check entirely
                                            -- (already-updated devices keep it)`,
    },
    {
      id: "serviceMesh",
      title: "Service Mesh — Envoy/Istio Sidecar Configuration",
      description: "Per-region Istio mesh: Session Queue circuit breaking, Training Scheduler LB-only, bin-packing canary, GPU Fleet Manager AuthorizationPolicy",
      api: `# Istio configuration — applied per region
# (us-west-prod, us-east-prod, eu-west-prod, apac-prod)

# 1. Session Queue Service — tight circuit breaking.
#    The hottest, most latency-sensitive hop for GeForce NOW: every
#    "Play" tap is a synchronous queue/assignment call that must return
#    in low tens of ms, even at the ~62.5 sessions/sec peak arrival rate
#    (Phase 1, derivation #1).
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: session-queue-service-circuit-breaker
  namespace: us-west-prod
spec:
  host: session-queue-service.us-west-prod.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 15000
      http:
        http1MaxPendingRequests: 8000
        maxRequestsPerConnection: 100
    loadBalancer:
      simple: LEAST_REQUEST
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 5s
      baseEjectionTime: 15s
      maxEjectionPercent: 50
---
# 2. Training Job Scheduler — load balancing ONLY, no outlier ejection.
#    A gang-scheduled job's allocation state (which GPUs, which
#    NVLink/IB block) lives across the submit -> schedule -> allocate ->
#    running chain; ejecting a replica mid-allocation would orphan a
#    partially-reserved topology block.
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: training-job-scheduler-lb
  namespace: us-west-prod
spec:
  host: training-job-scheduler.us-west-prod.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 6000
      http:
        http1MaxPendingRequests: 3000
        maxRequestsPerConnection: 50
    loadBalancer:
      simple: LEAST_REQUEST
---
# 3. Canary a new bin-packing algorithm (Phase 3) before full rollout —
#    a regression here fragments the NVLink/IB topology graph
#    fleet-wide, degrading utilization for every job size.
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: training-job-scheduler-binpack-canary
  namespace: us-west-prod
spec:
  hosts:
    - training-job-scheduler.us-west-prod.svc.cluster.local
  http:
    - match:
        - headers:
            x-scheduler-canary:
              exact: "true"
      route:
        - destination:
            host: training-job-scheduler.us-west-prod.svc.cluster.local
            subset: v2
    - route:
        - destination:
            host: training-job-scheduler.us-west-prod.svc.cluster.local
            subset: v1
          weight: 95
        - destination:
            host: training-job-scheduler.us-west-prod.svc.cluster.local
            subset: v2
          weight: 5
      retries:
        attempts: 2
        perTryTimeout: 10s
        retryOn: 5xx,reset,connect-failure
---
# 4. Fleet integrity — only Session Queue Service and Training Job
#    Scheduler may mutate GPU allocation state.
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: gpu-fleet-manager-access
  namespace: us-west-prod
spec:
  selector:
    matchLabels:
      app: gpu-fleet-manager
  action: ALLOW
  rules:
    - from:
        - source:
            principals:
              - "cluster.local/ns/us-west-prod/sa/session-queue-service"
              - "cluster.local/ns/us-west-prod/sa/training-job-scheduler"
      to:
        - operation:
            paths: ["/internal/fleet/allocate", "/internal/fleet/release",
                     "/internal/fleet/preempt-spillover"]
            methods: ["POST"]
---
# 5. mTLS within the region
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: us-west-prod
spec:
  mtls:
    mode: STRICT`,
      internals: `Sidecar injection scope (5 services, matching the LLD components above):
  IN MESH:  Session Queue Service, Streaming Service (signaling only —
            the WebRTC media itself is UDP and bypasses the mesh),
            Training Job Scheduler, Checkpoint & Preemption Service,
            GPU Fleet Manager
  OUT:      Driver/NGC Distribution Service (CDN/object-storage-fronted,
            crash telemetry arrives via Kafka — no synchronous mesh hop
            on the bulk-download path), Kafka, PostgreSQL, Redis (queue +
            avail:* sets), Time-series DB, S3/CDN. Redis in particular
            sits on the Session Queue draining-loop hot path, where an
            extra Envoy hop is pure cost with no L7 policy benefit.

Session Queue Service circuit breaking — sized against the admission rate:
  Phase 1's back-of-the-envelope puts GeForce NOW's peak arrival rate at
  ~62.5 sessions/sec (derivation #1) and peak concurrency at ~150,000
  sessions (derivation #2). outlierDetection (interval: 5s /
  baseEjectionTime: 15s) ejects a misbehaving replica within one
  interval — at this admission rate, a slow replica left in rotation for
  even a few seconds visibly lengthens the <15s queue-to-first-frame
  target across BOTH the priority and free queues. maxConnections: 15000
  gives headroom over the steady-state concurrency this service tracks
  (one open connection per active/queued session in its region).

Training Job Scheduler — LB-only, the same reasoning as the saga-
orchestrating services elsewhere in this series: a gang-scheduled job's
allocation_id and reserved topology block exist mid-flight across
multiple scheduler calls. outlierDetection would eject a replica based
on 5xx rate, but a replica mid-allocation isn't "unhealthy" from the
caller's perspective — ejecting it would leave a partially-reserved
NVLink/IB block that the GPU Fleet Manager has to detect and reclaim out
of band. LEAST_REQUEST spreads NEW job submissions across replicas
without disturbing in-flight gang allocations.

Bin-packing canary — tied directly to Phase 3's topology-aware
scheduling: the algorithm decides which physical GPUs satisfy a job's
NVLINK_8 / MULTI_NODE_IB requirement. A regression doesn't just affect
one job — it can fragment the topology graph for every job submitted
during the rollout window, the training-fleet equivalent of BookMyShow's
pricing-canary blast radius. The 5% header-matched canary is validated
against fleet utilization and job-queue-depth metrics before full
rollout; perTryTimeout: 10s bounds the worst case for a single
scheduling decision.

GPU Fleet Manager AuthorizationPolicy:
  Only Session Queue Service and Training Job Scheduler's mesh identities
  can call /internal/fleet/allocate, /internal/fleet/release, and
  /internal/fleet/preempt-spillover — independent of application code.
  This is the mesh-level twin of Phase 1's "two pools, one fleet"
  inventory model: Postgres's gpu_inventory.status is the source of
  truth for WHICH GPU is allocated to WHOM; AuthorizationPolicy guarantees
  no service OTHER than the two designated allocators can ever change
  that status — including the Distribution Service, which has no
  business touching fleet state at all.

mTLS & control-plane topology:
  Istio runs PER REGION (us-west-prod, us-east-prod, eu-west-prod,
  apac-prod), mirroring Phase 1's data-center affinity tagging and
  Phase 5's cross-region spillover loop — a control-plane incident in one
  region's mesh never affects another region's GPU allocation decisions.
  Sidecars fail open on last-known config, which is safe for the <15s
  session-assignment SLA's ample headroom over the ~1-2ms sidecar tax —
  EXCEPT for Session Queue Service under peak admission load, where (as
  with BookMyShow's seat-lock service) that small tax is a comparatively
  larger fraction of an already-tight budget.`,
    },
  ],
};

export const NVIDIA_QNA = [
  {
    id: "nvq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["NVIDIA", "AWS", "Google Cloud"],
    question: "Design NVIDIA's cloud platform — covering GeForce NOW cloud gaming, DGX Cloud AI training, and driver/CUDA distribution. Walk through the key components.",
    answer: `NVIDIA's cloud platform is fundamentally a GPU FLEET ALLOCATION problem, not three separate products bolted together — and that shared-substrate framing drives almost every component below.

CORE COMPONENTS:

1. GPU FLEET MANAGER:
   System of record for every physical GPU — inventory, MIG mode,
   AVAILABLE/ALLOCATED/DRAINING/FAULTY status. Exposes allocate/release/
   preempt APIs and runs the cross-product SPILLOVER reassignment loop.

2. SESSION QUEUE SERVICE (GeForce NOW):
   Tier-aware multi-queue admission (Free vs Priority/Ultimate), sticky
   GPU-instance assignment, pre-warmed game-library pools.

3. STREAMING SERVICE:
   WebRTC signaling + NVENC encode pipeline, latency-first adaptive
   bitrate, separate low-latency input channel.

4. TRAINING JOB SCHEDULER (DGX Cloud):
   Gang-scheduling + topology-aware bin-packing across NVLink/InfiniBand
   domains, priority tiers (Reserved/On-Demand/Spot).

5. CHECKPOINT & PREEMPTION SERVICE:
   Grace-period preemption protocol, checkpoint-to-object-storage,
   resume-anywhere-in-fleet — the mechanism that makes Spot capacity safe
   to reclaim.

6. DRIVER/NGC DISTRIBUTION SERVICE:
   CDN-fronted, content-addressed delivery to 500M+ devices, gated by a
   GPU-architecture COMPATIBILITY MATRIX and staged, telemetry-monitored
   rollouts.

7. SERVICE MESH:
   Per-region Istio — circuit breaking on the Session Queue hot path,
   LB-only on the Training Scheduler (saga-like allocation state),
   AuthorizationPolicy locking down who can mutate GPU Fleet Manager state.

KEY INSIGHT:
   In a typical marketplace (Uber, Zomato), supply and demand are both
   roughly continuous and independently scalable. Here, THREE PRODUCTS
   SHARE ONE PHYSICAL RESOURCE POOL with wildly different SLAs — GeForce
   NOW can't tolerate preemption, DGX Cloud Spot can if it checkpoints,
   and driver distribution doesn't touch the fleet at all. The entire
   design is really one question answered three different ways: "who
   gets this GPU right now, and what happens to whoever had it a moment
   ago?"`,
    followups: [
      "How would the design change if GeForce NOW and DGX Cloud ran on completely separate, non-shared GPU fleets — what gets simpler, and what gets more expensive?",
      "Where does this design break down if a single data center loses power — which workload degrades first, and why?",
      "How would you extend this to a fourth product, e.g. NVIDIA Omniverse (real-time 3D collaboration) — does it fit the INTERACTIVE or BATCH bucket from Phase 1, or neither?",
    ],
  },
  {
    id: "nvq2",
    category: "Concurrency",
    difficulty: "Hard",
    round: "System Design Deep Dive",
    asked_at: ["NVIDIA", "Google", "Databricks"],
    question: "How do you guarantee a 512-GPU training job gets ALL 512 GPUs, topologically co-located on one InfiniBand fabric, without deadlocking the scheduler or starving smaller jobs?",
    answer: `The 512-GPU job needs ALL 512 GPUs allocated SIMULTANEOUSLY and on a single InfiniBand fabric (or a small number of well-connected leaf switches) — otherwise gradient all-reduce becomes network-bound and the "win" from more GPUs evaporates.

ATOMIC ALL-OR-NOTHING ALLOCATION:
  The Training Job Scheduler's topology graph search either finds a valid
  512-GPU block in ONE search, or it doesn't — there's no "allocate 300,
  queue for 212 more." The GPU Fleet Manager's /internal/fleet/allocate
  call is a single Postgres transaction:
    UPDATE gpu_inventory SET status='ALLOCATED', allocation_id=?
      WHERE gpu_id IN (...512 ids...) AND status='AVAILABLE'
  If the row count returned != 512 (another scheduler tick grabbed one
  first), the transaction rolls back entirely and the job stays QUEUED —
  the same all-or-nothing guarantee as BookMyShow's multi-seat Lua
  script, just expressed as a SQL transaction instead of a Lua script,
  because the contention rate here (job submissions/sec) is orders of
  magnitude lower than BookMyShow's seat-taps/sec.

AVOIDING DEADLOCK:
  Because allocation is a single atomic operation — not "lock GPU 1, then
  GPU 2, ..." — there's no lock-ordering deadlock to avoid. The real risk
  is LIVELOCK: two 512-GPU jobs each repeatedly almost-fitting and
  starving each other as smaller jobs constantly shuffle in and out of
  the gaps.

STARVATION PREVENTION — CONSERVATIVE BACKFILL:
  Once a job has queued longer than a threshold, the scheduler RESERVES
  the next topology block that will become large enough for it at a
  predicted future time. Smaller jobs (1-8 GPUs) are only backfilled into
  the gaps if they can COMPLETE before that reserved start time — capping
  how much a stream of small jobs can delay an already-reserved large
  job, typically to zero. This is the same technique HPC schedulers
  (Slurm, etc.) use for the identical problem.`,
    followups: [
      "What happens if, immediately after the scheduler reserves a topology block for a 512-GPU job, one of those 512 GPUs is reported FAULTY before the job actually starts?",
      "How would you prevent a steady stream of small (1-8 GPU) jobs from starving a queued 512-GPU job indefinitely, beyond conservative backfill?",
      "Does the all-or-nothing allocation need to stay consistent across the GPU Fleet Manager's Postgres table AND its Redis avail:* mirror — how do you keep those two in sync under this transaction?",
    ],
  },
  {
    id: "nvq3",
    category: "Scalability",
    difficulty: "Hard",
    round: "System Design Deep Dive",
    asked_at: ["NVIDIA", "Microsoft", "Twitch"],
    question: "GeForce NOW's evening peak in a region causes session-queue wait times to spike from <15s to several minutes. How would you design the queueing system to degrade gracefully?",
    answer: `GeForce NOW's queueing system is structurally similar to BookMyShow's virtual waiting room elsewhere in this series, but with one critical difference: a gaming SESSION, once started, occupies a GPU for its full duration — there's no equivalent of "seat released back to the pool in 30 seconds if payment fails."

GRACEFUL DEGRADATION LADDER (Phase 5):

1. MULTI-QUEUE ISOLATION:
   Free tier and Priority/Ultimate are SEPARATE Redis ZSETs per
   (region, gpu_class). A Free-tier surge can never delay a Priority/
   Ultimate assignment — they're drained from completely different
   queues, in priority order.

2. SPILLOVER POOL RECLAIM (FIRST AUTOMATIC LEVER):
   The GPU Fleet Manager's continuous load-balancing loop preempts
   Spot-tier DGX Cloud jobs in the region (Phases 1 & 3) and feeds those
   GPUs into the avail:* sets — invisible to GeForce NOW users entirely.

3. PRE-WARMED POOL SIZING:
   Each data center's game-library cache and idle-instance pool is sized
   to that REGION's typical evening peak plus headroom, derived from
   historical demand curves (same region, same day-of-week, trailing N
   weeks) — not a single global number.

4. QUEUE-POSITION TRANSPARENCY:
   WebSocket pushes of queue_position and eta_seconds every few seconds.
   Even when wait times spike, users see a moving number — which
   measurably reduces abandonment versus a static spinner, the same
   lesson BookMyShow's waiting room applies.

5. LAST RESORT — GPU CLASS DOWNGRADE:
   If even the spillover pool is exhausted, Free-tier sessions can be
   offered a lower (more MIG-shareable) GPU class sooner rather than a
   full dedicated GPU later — trading quality for wait time. Priority/
   Ultimate never downgrades; that SLA is the last thing to give.

WHY GAMING CAN'T "REQUEUE":
  BookMyShow can re-offer a seat if a hold expires mid-payment. A
  GeForce NOW session that's been ACTIVE for 20 minutes can't be
  "returned to the queue" without ending the user's game — so every
  lever above operates BEFORE assignment, never after.`,
    followups: [
      "How would you size the pre-warmed instance pool per data center — what signals would you use to predict tomorrow's evening peak versus today's?",
      "If the spillover pool is fully reclaimed and Free-tier wait times are still climbing, what's the next lever, and what user-facing tradeoff does it represent?",
      "How does this queueing design compare to BookMyShow's virtual waiting room — what's structurally the same, and what's different given that a gaming session can't be requeued once started?",
    ],
  },
  {
    id: "nvq4",
    category: "Video Streaming",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["NVIDIA", "Microsoft", "Amazon"],
    question: "Why does cloud gaming use WebRTC instead of the HLS/DASH approach used by video streaming platforms, and how does adaptive bitrate differ?",
    answer: `VOD platforms (Hotstar, Netflix elsewhere in this series) optimize for SMOOTH playback of pre-rendered content — a multi-second buffer hides network jitter entirely, and viewers don't notice. Cloud gaming optimizes for RESPONSIVENESS of content rendered in real time, RIGHT NOW, in response to input the player just gave — any buffer directly becomes input lag.

LATENCY BUDGET COMPARISON:
  VOD:           multi-second segment buffer is INVISIBLE to the viewer
  Cloud gaming:  target <30ms glass-to-glass; even 100ms is perceptible
                 as "laggy" to a player

WHY UDP (WebRTC), NOT CHUNKED HTTP (HLS/DASH):
  HLS/DASH deliver fixed-duration segments (2-6s typical) over HTTP —
  even with the smallest segment size, you're adding a segment's worth of
  latency just for the container format, before network transit. WebRTC
  streams raw encoded frames over UDP/SRTP — a frame can be delivered (or
  dropped) the instant it's encoded, with no segment boundary to wait for.

ADAPTIVE BITRATE — INVERTED PRIORITY:
  VOD ABR ladder: under congestion, drop bitrate/resolution gradually
  while the buffer absorbs the transition — the viewer barely notices.
  Cloud gaming ABR: under congestion, drop resolution/framerate
  IMMEDIATELY and aggressively — a visibly blockier frame NOW is
  preferable to a smooth frame that arrives 200ms late, because that
  200ms is exactly when the player pressed a button.

INPUT/VIDEO DECOUPLING:
  A separate, independent low-latency UDP channel carries input apart
  from video. If a video frame is lost and needs retransmission, input
  delivery is completely unaffected — the game server keeps responding to
  clicks even while a frame is being repaired, the opposite of how a
  video player would behave (pause until the buffer recovers).`,
    followups: [
      "How would you handle a player whose network briefly drops packets for 200ms — what happens to the video stream versus the input stream during that gap?",
      "Could a VOD platform like Hotstar use WebRTC instead of HLS — what would it gain, and what would it lose?",
      "How could NVENC hardware encoding latency itself become the bottleneck inside the <30ms budget, and what would you do about it?",
    ],
  },
  {
    id: "nvq5",
    category: "Resource Management",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["NVIDIA", "AWS", "CoreWeave"],
    question: "Explain Multi-Instance GPU (MIG) and how it enables safe multi-tenancy on a shared GPU fleet. When would you NOT use it?",
    answer: `MULTI-INSTANCE GPU (MIG) lets one physical GPU (e.g. an H100) be partitioned into up to 7 instances, each with its OWN dedicated memory (with ECC), its own slice of L2 cache and memory bandwidth, and its own hardware fault domain.

WHY THIS MATTERS FOR MULTI-TENANCY:
  Without MIG, sharing a GPU across tenants means software-level
  isolation — separate processes/containers sharing one memory
  controller. A memory-bandwidth-hungry neighbor can silently degrade
  another tenant's throughput ("noisy neighbor"), and in the worst case a
  driver-level fault in one tenant's context can affect the whole card.
  MIG makes these HARDWARE guarantees instead of software best-efforts:
  tenant A's slice cannot be starved or crashed by tenant B's slice.

WHEN NOT TO USE MIG:

1. GeForce NOW sessions — gaming needs the FULL GPU's compute AND the
   security isolation of a complete hypervisor boundary. A MIG slice
   still shares the same physical card's PCIe/NVLink fabric and firmware
   with other slices — fine for cooperative DGX Cloud tenants, not
   appropriate for a consumer session where NVIDIA owns the trust
   boundary end to end.

2. Multi-GPU NVLink training jobs — MIG slices CANNOT span physical
   GPUs. A job that needs NVLink between GPUs needs WHOLE GPUs with MIG
   DISABLED; slicing would make NVLink unavailable to the job entirely.

3. Anything where the mode-switch cost matters — changing a GPU's MIG
   mode requires a full GPU reset (Phase 1). A GPU can't be "half in MIG
   mode for this one request" — the whole-GPU-pool vs MIG-sliced-pool
   split is a capacity-planning-time decision (daily/weekly), not a
   scheduling-time one.`,
    followups: [
      "A DGX Cloud customer's MIG-sliced inference workload suddenly needs to scale to a multi-GPU NVLink job — how does the Fleet Manager handle this transition?",
      "How would you decide the SPLIT between the whole-GPU pool and the MIG-sliced pool, and how often would you re-balance it?",
      "What's the blast radius if a MIG mode-change is triggered on a GPU that gpu_inventory still believes is ALLOCATED to a running job?",
    ],
  },
  {
    id: "nvq6",
    category: "Fault Tolerance",
    difficulty: "Hard",
    round: "System Design Deep Dive",
    asked_at: ["NVIDIA", "Google Cloud", "AWS"],
    question: "Design the preemption and checkpointing protocol that lets DGX Cloud Spot jobs be reclaimed for GeForce NOW's evening peak without losing significant work.",
    answer: `PROTOCOL:
  1. GPU Fleet Manager identifies a Spot-tier job's GPUs as needed for
     spillover, calls /internal/jobs/{job_id}/preempt with a grace period
     (typically 30-120s)
  2. Training Job Scheduler marks the job CHECKPOINTING and signals the
     job's rank-0 control sidecar
  3. The framework's checkpoint callback flushes optimizer + model state
     to S3-compatible object storage, writes a job_checkpoints row
  4. On completion (or grace-period expiry): job → PREEMPTED, GPUs
     released back to AVAILABLE
  5. When capacity frees up anywhere in the fleet, the scheduler re-runs
     gang-scheduling for the job and injects the latest checkpoint URI as
     CHECKPOINT_RESUME_URI

BOUNDING LOST WORK:
  checkpoint_interval is tuned so checkpoint-write time stays <5% of
  total runtime — frequent enough that a preemption never loses much more
  than ~checkpoint_interval of compute, infrequent enough that
  checkpointing itself isn't the bottleneck. PLUS an out-of-band forced
  checkpoint fires the instant the preemption signal arrives, if the
  grace period allows it — the difference between losing "N minutes" and
  losing "N minutes plus however long since the last scheduled
  checkpoint."

GANG PREEMPTION AS A UNIT:
  All-reduce across 512 GPUs stalls completely if even ONE rank
  disappears, so the scheduler treats the entire job as one preemption
  unit. Even if spillover strictly needs only 8 of the 512 GPUs back, the
  other 504 are released too and re-requested as a fresh allocation on
  resume — partial preemption would leave 504 idle, billed GPUs doing
  nothing while rank assignments are renegotiated, strictly worse than a
  clean stop/resume.

SPOT PRICING AS THE INCENTIVE ALIGNMENT:
  Spot GPU-hours are priced well below On-Demand specifically because the
  customer is pricing in this preemption risk — DGX Cloud's overall
  utilization economics depend on enough workload running on Spot that
  the spillover pool (Phase 1) has something to reclaim during GeForce
  NOW's peak.`,
    followups: [
      "What if the grace period expires before the checkpoint write completes — what's the recovery story for that job?",
      "How would you avoid a 'checkpoint storm' where many Spot jobs are preempted at once and all try to write multi-GB checkpoints to the same object store simultaneously?",
      "Multi-node jobs preempt as a unit — but what if only the checkpoint-writing rank (rank 0) is the GPU being reclaimed, and the other 511 GPUs are otherwise fine?",
    ],
  },
  {
    id: "nvq7",
    category: "Reliability",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["NVIDIA", "Microsoft", "Google"],
    question: "Design a staged rollout system for GPU driver updates reaching 500M+ devices, with automatic rollback based on crash telemetry.",
    answer: `STAGED ROLLOUT PIPELINE:
  internal dogfood → opt-in Beta channel (small % of enthusiasts) → GA for
  the compatible architecture segment → percentage ramp (5% → 25% → 100%
  over days), gated by the COMPATIBILITY MATRIX so a Blackwell-only build
  never reaches a Pascal-era card.

PERCENTAGE GATING — DETERMINISTIC, PER-DEVICE:
  hash(device_id) % 100 < rollout.pct
  Deterministic hashing means a device that's IN the 5% cohort stays in
  it as the percentage ramps to 25% (5% is a subset of 25% under the same
  hash function) — so canary-cohort telemetry remains comparable across
  ramp stages instead of being diluted by a constantly-shuffling
  population.

CRASH-RATE CANARY ANALYSIS (every 5 minutes, per active rollout):
  crash_rate_new      = crashes(new_version)     / installs(new_version)
  crash_rate_baseline = crashes(previous_version) / installs(previous_version)
  >3x baseline  → rollout PAUSED (percentage ramp halts; existing devices
                  keep the version, no NEW devices receive it)
  >10x baseline → rollout RECALLED (pulled from /v1/updates/check entirely
                  for new installs)
  Already-updated devices are NEVER force-rolled-back — drivers aren't
  silently uninstalled — but the bleeding stops immediately for everyone
  else.

TWO TRACKS FOR TWO RISK TOLERANCES:
  GAME READY DRIVER: frequent, often tied to game launches — consumers
  tolerate occasional rough patches in exchange for day-one game support.
  DATA CENTER / LTS: DGX Cloud pins to slow, heavily regression-tested
  branches — an unplanned driver change mid-training-run on a 512-GPU job
  is vastly more expensive than a single-player game bug, so this track's
  rollout cadence is measured in months, with an even smaller initial
  cohort.

SAME PATTERN AS A TRAFFIC CANARY, DIFFERENT TIMESCALE:
  This is structurally identical to the service mesh's header-based
  weighted-traffic canary (Service Mesh component) — gate a small cohort,
  watch an error-rate signal, ramp or roll back based on a statistical
  threshold. The only real difference is the unit (devices, not requests)
  and the timescale (days, not minutes).`,
    followups: [
      "How do you distinguish a crash caused by the NEW driver from a crash caused by an unrelated, coincidentally-timed game patch?",
      "A driver update is RECALLED after reaching 25% rollout — what happens to the 25% of devices that already installed it?",
      "How would the rollout strategy differ for a security-critical driver patch versus a routine Game Ready release?",
    ],
  },
  {
    id: "nvq8",
    category: "Estimation",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["NVIDIA", "CoreWeave", "Meta"],
    question: "Walk through how you'd estimate the size of the GPU 'spillover pool' shared between GeForce NOW and DGX Cloud.",
    answer: `ASSUMPTIONS:
  25M GeForce NOW members, peak concurrent sessions ~150,000, avg session
  length ~40 min (2,400s). ~70% of concurrent sessions need a whole-GPU-
  equivalent. DGX Cloud whole-GPU fleet: 100,000 GPUs, Spot tier ~10-15%
  of that.

STEP 1 — ARRIVAL RATE (Little's Law):
  concurrent = arrival_rate × avg_session_length
  150,000 = arrival_rate × 2,400s → arrival_rate ≈ 62.5 sessions/sec
  → sizes the Session Queue Service's per-second assignment throughput,
  NOT the fleet size.

STEP 2 — PEAK WHOLE-GPU DEMAND:
  150,000 concurrent × 70% ≈ 105,000 whole-GPU-equivalents
  → GeForce NOW provisions a DEDICATED pool with headroom (≈120,000 GPUs)
  sized to this number, kept separate from DGX Cloud's 100,000.

STEP 3 — THE SPILLOVER POOL (the number that actually matters):
  The spillover pool doesn't need to cover the full 105,000 — only the
  GAP between GeForce NOW's dedicated pool and an unexpected spike, plus
  whatever DGX Cloud's Spot tier can absorb being preempted. If Spot is
  ~10-15% of DGX's 100,000-GPU fleet → spillover pool ≈ 10,000-15,000
  GPUs.
  → THIS is the number that determines whether GeForce NOW's evening
  peak threatens DGX Cloud's Reserved-tier SLAs, and it's roughly an
  ORDER OF MAGNITUDE smaller than either headline fleet number.

STEP 4 — SANITY-CHECK AGAINST DRIVER DISTRIBUTION:
  500M devices × ~700MB ÷ 7 days ≈ 50 PB/day — a completely different
  axis (egress bandwidth, not GPU-hours), included to show these three
  products are sized along THREE INDEPENDENT DIMENSIONS (session
  concurrency, GPU-hours, network egress) that share one physical fleet
  only on the GPU-hours axis.

PUNCH LINE:
  Don't size a shared resource pool to either product's headline number —
  size it to the DELTA between dedicated-pool headroom and worst-case
  peak, bounded by how much of the OTHER product's capacity is
  contractually preemptible. ~10-15K GPUs, not ~100K or ~150K, is the
  number worth debating.`,
    followups: [
      "How would these numbers change if GeForce NOW's average session length doubled — e.g. because longer single-player campaigns became popular?",
      "If DGX Cloud eliminated the Spot tier entirely, what would that do to GeForce NOW's required dedicated whole-GPU pool?",
      "The 50 PB/day driver-distribution estimate assumes weekly checks — how would a forced emergency security patch change CDN capacity planning?",
    ],
  },
  {
    id: "nvq9",
    category: "Architecture",
    difficulty: "Hard",
    round: "System Design Deep Dive",
    asked_at: ["NVIDIA", "Uber", "Netflix"],
    question: "Given that the GPU Fleet Manager already enforces allocation correctness via its own API and database transactions, what does the service mesh's AuthorizationPolicy actually add?",
    answer: `The GPU Fleet Manager's Postgres transaction already guarantees a GPU can't be double-allocated — so what does AuthorizationPolicy add on top of that?

1. DEFENSE AGAINST YOUR OWN BUGS, NOT JUST ATTACKERS:
   The Postgres transaction prevents two CORRECT allocate calls from
   racing each other. It does NOTHING to stop a service that has NO
   business calling /internal/fleet/release from calling it anyway — e.g.
   a bug in the Distribution Service that accidentally constructs a
   release request. AuthorizationPolicy enforces WHO can call these
   endpoints at the network layer, independent of whether the request
   body would otherwise be "valid."

2. ZERO-TRUST REGARDLESS OF APPLICATION-LAYER CORRECTNESS:
   If Training Job Scheduler's code today correctly only releases GPUs it
   owns, that's an application-layer invariant — true until the next
   refactor introduces a bug. AuthorizationPolicy is a SECOND, independent
   layer that doesn't degrade when application code changes; it's
   enforced by Envoy before the request ever reaches the service's
   business logic.

3. CIRCUIT BREAKING AND CANARY INFRASTRUCTURE ARE REUSED, NOT BESPOKE:
   The same Istio control plane that enforces AuthorizationPolicy also
   provides the Session Queue circuit breaker and the bin-packing canary —
   this isn't a separate system bolted on for security; it's the SAME
   mesh doing traffic management AND access control with one set of YAML
   resources per region.

4. mTLS MAKES THE IDENTITY CHECK MEANINGFUL:
   AuthorizationPolicy's principals field is only trustworthy because
   PeerAuthentication enforces STRICT mTLS — every service's identity is a
   cryptographically-verified SPIFFE identity from its sidecar
   certificate, not a header any service could spoof.

WHAT IT DOESN'T REPLACE:
   AuthorizationPolicy is coarse — it answers "can Training Job Scheduler
   call /internal/fleet/release AT ALL," not "can it release THIS specific
   GPU it doesn't own." That finer-grained check still belongs in the GPU
   Fleet Manager's application logic (verify allocation_id matches the
   caller's job before releasing). The mesh and the application enforce
   DIFFERENT GRANULARITIES of the same principle — neither alone is
   sufficient.`,
    followups: [
      "If a bug in Training Job Scheduler's code accidentally called /internal/fleet/release on GPUs it doesn't own, would AuthorizationPolicy catch that — why or why not?",
      "How would you test that the AuthorizationPolicy is actually enforced, without waiting for a real incident to find out?",
      "Running Istio control planes per-region (Phase 5's cross-region spillover) — does this create any coordination problem when a job is rescheduled from us-west to apac mid-run?",
    ],
  },
];
