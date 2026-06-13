export const HOTSTAR_HLD = {
  title: "Hotstar — High Level Design",
  subtitle: "How 32M+ concurrent viewers watch IPL live — the world record for live streaming",

  overview: `Hotstar is India's largest streaming platform and holds the world record for concurrent live viewers: 32.5 million watching the IPL 2023 final simultaneously. 50 crore+ (500M+) total views per IPL season.

The fundamental challenge: live streaming is nothing like on-demand. Netflix pre-positions content. Hotstar must deliver a broadcast that doesn't exist yet to 32 million people — all joining within minutes of each other, all expecting the same latency, all on India's wildly varied networks (4G, 3G, Jio, rural broadband).

Three hard problems that make IPL different from everything else:
1. Thundering Herd — 20M+ viewers join in the first 10 minutes. Origin servers would die without CDN pre-warming.
2. Live latency — viewers are chatting on WhatsApp. If your stream is 30s behind your neighbour, it's unusable.
3. India's network diversity — the same adaptive player must work on Mumbai 5G and Bihar 2G simultaneously.`,

  diagram: `
┌───────────────────────────────────────────────────────────────────────────┐
│              BROADCAST SOURCE (Stadium / OB Van)                          │
│         RTMP/SRT feed → Satellite uplink OR dedicated fibre               │
└─────────────────────────────────┬─────────────────────────────────────────┘
                                  │  Raw RTMP stream (1 feed)
                                  ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    INGEST & TRANSCODE LAYER (AWS Mumbai)                  │
│                                                                           │
│  ┌──────────────┐    ┌────────────────────────────────────────────────┐  │
│  │  Ingest Edge │    │          Transcode Farm (GPU workers)          │  │
│  │  (RTMP/SRT)  │──► │  360p · 480p · 720p · 1080p · 1080p60 · 4K   │  │
│  │  redundant   │    │  2s HLS/DASH segments · parallel workers       │  │
│  │  ingest pair │    └──────────────────────┬─────────────────────────┘  │
│  └──────────────┘                           │ segments (every 2s)        │
└────────────────────────────────────────────-┼───────────────────────────-┘
                                              │ push segments to origin store
                                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      SEGMENT ORIGIN (S3 + Custom Cache)                 │
│    segments/{matchId}/{quality}/seg_{N}.ts  written every 2 seconds     │
│    playlist.m3u8 rewritten every 2 seconds (rolling 5-segment window)   │
└────────────────────┬────────────────────────────────────────────────────┘
                     │  CDN pulls (origin shield) + active segment push
                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    MULTI-CDN TIER (Akamai + Fastly + CloudFront)        │
│                                                                         │
│   [Mumbai PoP]  [Delhi PoP]  [Chennai PoP]  [Kolkata PoP]              │
│   [Hyderabad]   [Pune]       [Bengaluru]    [Jaipur]                   │
│   [Singapore]   [London]     [Dubai]        [New York]                 │
│                                                                         │
│   Segment cache TTL: 60s (live) · Manifest TTL: 2s · Auth: edge JWT    │
└────────────────────┬────────────────────────────────────────────────────┘
                     │  HLS/DASH segments + manifest
                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                   │
│  Android · iOS · Web · Smart TV · Jio STB · Airtel XStream             │
│  Custom ABR player "Starburst" — bandwidth probing every 2s             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           SUPPORTING SERVICES                           │
│         SERVICE MESH — Envoy sidecar attached to every service          │
│          ┌──────────────────┐   ┌────────────────────────────┐          │
│          │  Auth Service    │   │  Engagement Services       │          │
│          │  JWT + DRM       │   │  Live score · Poll · Chat  │          │
│          │  Entitlement     │   │  Kafka + Redis Pub/Sub     │          │
│          └──────────────────┘   └────────────────────────────┘          │
│      mTLS · Load Balancing · Retries · Circuit Breaking · Tracing       │
└─────────────────────────────────────────────────────────────────────────┘`,

  metrics: [
    { label: "Peak concurrent viewers (IPL 2023 final)", value: "32.5 million (world record)" },
    { label: "Total IPL season views", value: "50 crore+ (500M+)" },
    { label: "Segment size", value: "2 seconds of video per chunk" },
    { label: "Transcode variants per stream", value: "6+ quality levels (360p to 1080p60)" },
    { label: "CDN PoPs in India", value: "8+ major cities, Tier-2 via ISP partnerships" },
    { label: "Live latency target", value: "10–30 seconds (LL-HLS target: < 5s)" },
    { label: "Peak bandwidth served", value: "~10 Tbps across all CDN edges during finals" },
    { label: "ABR adaptation interval", value: "Every 2 seconds (per segment)" },
    { label: "Pre-scale lead time", value: "Capacity provisioned 2 weeks before IPL season" },
    { label: "DRM", value: "Widevine (Android/Web) + FairPlay (iOS/macOS)" },
  ],

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Live vs On-Demand — Why IPL Is Harder",
      sections: [
        {
          title: "The Thundering Herd Problem",
          content: `On-demand streaming (Netflix, YouTube VOD): content is pre-transcoded and pre-cached on CDN before any viewer requests it. Cache hit rate approaches 100%. Origin is rarely touched.

Live streaming (IPL): the video segment doesn't exist until 2 seconds ago. You can't warm the cache before the content is created. And 20 million people all request the same new segment at the same instant.

Without mitigation, what happens at 7:30 PM on IPL match day:
• 20M viewers hit Play simultaneously
• All 20M request playlist.m3u8 (the manifest) → CDN serves from cache ✓
• Manifest returns URL for segment_001.ts → CDN cache MISS (new segment, never cached)
• 20M requests fan back to origin → origin dies

How Hotstar solves thundering herd:
1. CDN request coalescing: when 1,000 viewers at the same CDN PoP all request the same segment simultaneously, the CDN sends ONE request to origin, waits for the response, then fans it out to all 1,000 viewers. This is "request collapsing" or "coalescing" — native feature in Akamai and Fastly.
2. Active segment push: Transcode farm doesn't wait for CDN to pull — it PUSHes each new segment to CDN origin shield the moment it's ready. By the time viewers request segment_N, it's already at the CDN edge.
3. Manifest polling stagger: clients are instructed to poll for the new manifest with a ±1s jitter. This spreads 20M manifest requests over 2 seconds instead of a single spike.`,
        },
        {
          title: "Why Live Latency Matters (and How to Control It)",
          content: `During IPL, millions of viewers are on WhatsApp with family. If your stream is 45 seconds behind and your uncle spoils the wicket, the product is broken. Latency is a product requirement, not a technical footnote.

Latency budget breakdown:
  Camera → encoder:           0.1s   (hardware latency)
  Encoder → ingest edge:      0.2s   (network)
  Transcode:                  1–2s   (GPU, real-time encode)
  Segment packaging (2s):     2.0s   (waiting for full segment)
  Segment upload to origin:   0.3s
  CDN propagation to edge:    0.5s
  Client buffer (3 segments): 6.0s
  ─────────────────────────────────
  Total typical HLS latency:  ~10–12s (best case), often 20–30s at scale

Low-Latency HLS (LL-HLS) — Apple's protocol to reduce this to < 5s:
  • Partial segments: client can request a "part" of a segment before it's complete
  • Blocking playlist request: client long-polls the manifest server — server holds the connection open and responds the moment the new manifest is ready (no polling jitter)
  • Preload hints: manifest tells the player "the next segment URL will be X" so the client can pre-connect to CDN

Hotstar's approach: standard HLS for most users (10–30s latency, more stable), LL-HLS opt-in for premium subscribers on good networks.

Latency vs stability tradeoff:
  Lower latency = smaller client buffer = more rebuffering on bad networks
  Hotstar picks 10s for most users (India's 4G has jitter) — better to be 10s late than to buffer every over.`,
        },
        {
          title: "Back-of-the-Envelope Estimation",
          content: `Before drawing boxes, size the problem — every number here should map directly to something in the diagram.

ASSUMPTIONS:
• 32.5M peak concurrent viewers (IPL 2023 final, world record)
• 2-second HLS segments, 6 quality variants (360p → 4K) + audio-only fallback
• Every client polls the manifest every 2 seconds and pulls 1 segment every 2 seconds
• 8 major CDN PoPs in India (Multi-CDN: Akamai + Fastly + CloudFront)
• ~10 Tbps peak bandwidth served across all CDN edges

1. Manifest request rate: 32.5M viewers ÷ 2s ≈ 16.25M manifest requests/sec.
   → With ±1s jitter spreading this over a 2-second window and a 2s CDN
   TTL + active manifest push, this MUST be served almost entirely from
   CDN edge cache — even 0.1% origin fallthrough is 16,250 req/sec hitting
   the origin shield.

2. Segment request rate: same math, ~16.25M segment requests/sec. Combined
   with manifest polling, total CDN edge load ≈ 32.5M req/sec.
   → Spread across 8 major PoPs ≈ 4M req/sec/PoP at peak — Mumbai (Jio
   headquarters city, 8 Tbps capacity) absorbs a disproportionate share.

3. Average bitrate per viewer: ~10 Tbps ÷ 32.5M viewers ≈ 308 kbps average
   — below even the 360p tier (400 kbps).
   → This is the single most revealing number in the whole estimate: it
   confirms a large fraction of India's IPL audience is on 240p/360p or
   audio-only. The 32 kbps audio-only mode isn't an edge case — it's load-
   bearing for the average.

4. Active CDN push volume: 6 quality variants × 1 push/2s × 3 CDNs = 9
   push API calls/sec.
   → 9 pushes/sec eliminate the 32.5M pulls/sec that would otherwise hit
   origin on cache miss — a >3,000,000x leverage ratio, and the entire
   justification for the active segment push pipeline.

5. Origin shield load: with active push + request coalescing, origin sees
   roughly 1 write per segment per quality variant regardless of viewer
   count — 6 qualities ÷ 2s ≈ 3 req/sec for segments + ~0.5 req/sec for
   manifest rewrites ≈ 3.5 req/sec total origin load.
   → Versus the 32.5M req/sec that would hit origin without these
   mitigations — roughly a 10-million-times reduction.

Interview punch line: 16.25M manifest + segment requests/sec map onto the
MULTI-CDN TIER's 8 PoPs; the 308 kbps average bitrate maps onto the ABR
quality ladder (and explains why audio-only mode exists); the 9 push
calls/sec map onto the active segment push pipeline; and the ~3.5 req/sec
origin load is the number that proves the SEGMENT ORIGIN never sees the
32M-viewer thundering herd at all.`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Ingest & Transcode Pipeline",
      sections: [
        {
          title: "From OB Van to Segment Store",
          content: `The broadcast pipeline is the most latency-sensitive part — every millisecond here adds to viewer delay.

Ingest layer:
• Star Sports (broadcast partner) sends RTMP or SRT feed from stadium OB van
• Two independent ingest endpoints in AWS Mumbai (primary + hot standby)
• Ingest Edge receives raw H.264/H.265 stream at 20–50 Mbps
• Redundant ingest pair: if primary drops mid-over, hot standby takes over in < 1 second

Transcode Farm (real-time, parallel):
• Single incoming stream is fan-out to N transcode workers simultaneously
• Each worker produces one quality variant:
  - 360p  @ 400 kbps   (2G/edge users)
  - 480p  @ 800 kbps   (3G users)
  - 720p  @ 1.5 Mbps   (average 4G)
  - 1080p @ 3.0 Mbps   (good 4G / WiFi)
  - 1080p60 @ 5.0 Mbps (premium, 5G)
  - 4K    @ 15 Mbps    (Smart TV, premium subscribers)
• Codec: H.264 for compatibility, H.265/HEVC for bandwidth savings on premium tiers

Segmenter:
• Each quality stream is cut into 2-second .ts segments (MPEG-TS container)
• Segment naming: /live/{matchId}/{quality}/seg_{N}.ts
• Segment N is pushed to S3 origin store immediately on completion
• m3u8 playlist updated: rolling window of last 5 segments (10 seconds of buffer)

Why 2-second segments?
• 6s segments (old YouTube standard): lower latency impact but coarser ABR switching
• 1s segments: LL-HLS, much lower latency but higher request rate (20M × 1 req/sec is brutal)
• 2s is Hotstar's balance: ~10s latency, manageable CDN request volume`,
        },
        {
          title: "Fault Tolerance in the Ingest Pipeline",
          content: `A dropped stream mid-match is a P0 incident. Every stage has redundancy.

Redundant ingest:
• Two separate RTMP endpoints in different AWS AZs receive the same broadcast feed
• Health monitor checks both every 500ms
• Automatic failover: if primary misses 3 consecutive heartbeats, switch to backup in ~1.5s
• Viewer impact: max 1.5s freeze (buffered video absorbs this)

Transcode worker failure:
• Workers are stateless — each segment is processed independently
• Worker crash → job requeued in SQS with a 3-second visibility timeout
• New worker picks up the segment job and re-encodes from the buffered raw input
• Input buffering: raw stream is mirrored to S3 in real-time; re-encode can replay from buffer

Segment gaps:
• If segment N is missing (worker died mid-segment), player gets a manifest gap
• Player behaviour: hold last frame, show buffering indicator
• Hotstar's SLA: max 2 dropped segments per match (4 seconds of freeze), target 0

Origin shield:
• A dedicated caching tier sits between S3 and CDN edges
• Shield absorbs repeated origin pulls during the first-viewer CDN cache miss
• Without shield: 50 CDN PoPs × 1 cache miss each = 50 origin requests per new segment
• With shield: 1 origin request per segment regardless of how many PoPs need it`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "CDN Architecture & Fan-out",
      sections: [
        {
          title: "Multi-CDN Strategy for India",
          content: `No single CDN covers India adequately. Hotstar uses a multi-CDN approach to maximize hit rates across India's fragmented ISP landscape.

Why multi-CDN?
• Jio (350M users): Akamai has deep Jio peering → use Akamai for Jio traffic
• BSNL/MTNL: Fastly has better PoP placement in Tier-2 cities
• Airtel: CloudFront performs better in metro corridors
• International (UK, US Indian diaspora): Fastly edges closest to them

CDN selection per request:
1. Client resolves hotstar.com → Global Load Balancer (Cloudflare or AWS Route53 latency routing)
2. Balancer returns a CDN-specific manifest URL based on user's IP geolocation + CDN health
3. Client fetches manifest from e.g. akamai-hotstar.com/{matchId}/playlist.m3u8
4. Segment URLs in manifest also point to the selected CDN

CDN failover:
• Player monitors segment download speed every 2 seconds
• If 3 consecutive segment downloads take > 5s: switch to secondary CDN manifest URL
• This is player-side multi-CDN — no server involvement, instant failover

PoP placement in India (Akamai partnership):
  Mumbai   — 8 Tbps capacity  (western India + Jio headquarters city)
  Delhi    — 6 Tbps capacity  (NCR + north India)
  Chennai  — 4 Tbps capacity  (TN + south India + undersea cable landing)
  Bengaluru— 4 Tbps capacity  (tech city, high premium subscriber density)
  Hyderabad— 3 Tbps capacity
  Kolkata  — 3 Tbps capacity  (east India)
  Pune     — 2 Tbps capacity
  Jaipur   — 1 Tbps capacity  (Tier-2 coverage)`,
        },
        {
          title: "Active Segment Push — Solving the First-Viewer Problem",
          content: `The root cause of thundering herd: first viewer to request a new segment from a CDN PoP causes a cache miss → origin request → slow response → all coalesced requests wait.

Active push inverts this: don't wait for CDN to pull, PUSH segments to CDN as they're created.

How it works:
  Transcode farm finishes segment_N at time T:
    1. Writes seg_N.ts to S3 origin (T + 0ms)
    2. Simultaneously issues HTTP PUT to Akamai's Fast Purge / Preposition API (T + 50ms)
    3. Akamai propagates segment to all PoPs before any viewer requests it (T + 200ms)
    4. First viewer request at T + 2000ms hits cache → zero origin requests

Push API call (per segment, per CDN):
  PUT https://api.akamai.com/preposition/v1/objects
  Body: { urls: ["https://origin.hotstar.com/live/{matchId}/360p/seg_042.ts",
                 "https://origin.hotstar.com/live/{matchId}/480p/seg_042.ts", ...] }

Cost of active push:
  6 quality variants × 1 CDN push API call per 2 seconds = 3 push calls/sec (per CDN)
  Manageable. The alternative (origin hits from 32M viewers on cache miss) is catastrophic.

Manifest push (most critical):
  The m3u8 playlist file is tiny (< 1 KB) but every player polls it every 2 seconds
  32M concurrent viewers × 1 request/2s = 16M requests/second for manifests
  Manifest MUST be at CDN edge — even 1% origin fallthrough = 160K req/s origin load
  Manifest TTL at CDN: 2 seconds (matches segment duration)
  Active push: new manifest pushed to CDN the moment it's rewritten`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Scale, Surge & Graceful Degradation",
      sections: [
        {
          title: "Pre-scaling for IPL — Provisioning Weeks Ahead",
          content: `IPL is not a surprise. Hotstar knows every match date months in advance. The engineering team runs a pre-scale playbook.

Pre-scale timeline:
  T-14 days: Reserve EC2 spot/reserved instances for transcode farm, auth service, engagement services
  T-7 days:  Load test the full stack at 120% of expected peak (chaos engineering: kill random workers)
  T-3 days:  Warm CDN caches with match metadata, thumbnail images, ad creatives
  T-1 day:   Double database connection pools, enable Redis cluster auto-sharding
  T-4 hours: Transcode farm at 200% normal capacity (burst headroom)
  T-1 hour:  Auth service scaled to 10× normal (login spike at match start)
  T-0:       Match starts. All systems at max capacity. SRE on war room call.
  T+3 hours: Ramp down 30 minutes after match end (graceful scale-down)

Auto-scaling limits:
• Most services scale on CPU/request-rate metrics via Kubernetes HPA
• Problem: auto-scaling takes 2–3 minutes to spin up new pods
• IPL thundering herd arrives in 0–5 minutes — you cannot auto-scale to it
• Solution: pre-scale to peak capacity manually before match. Auto-scaling is for after-match scale-down.

Cost:
• Hotstar runs near-zero cost outside IPL (< 1M concurrent viewers during normal days)
• IPL doubles Hotstar's monthly AWS bill in a 7-week window
• Pre-reserved instances reduce IPL compute cost by ~40% vs on-demand pricing`,
        },
        {
          title: "Graceful Degradation — When 32M Is Not Enough",
          content: `Despite all preparation, IPL finals push every system to its limit. Graceful degradation ensures video keeps playing even when ancillary services fail.

Priority hierarchy (what must work vs what can fail):
  MUST WORK:     Segment delivery (CDN) — video playback
  MUST WORK:     Auth/JWT validation — prevent freeloaders, enforce entitlements
  MUST WORK:     Playback manifest — without this players can't find segments
  NICE TO HAVE:  Live score overlay — can fail silently, player hides it
  NICE TO HAVE:  Polls and engagement — disabled at > 90% auth service load
  NICE TO HAVE:  Personalized recommendations — show generic content at overload
  CAN SKIP:      Watch party / social features — first to be shed

Circuit breakers per service:
  Each service has a circuit breaker with thresholds:
  • Auth: > 50ms p99 latency → skip re-validation for active sessions (use cached JWT)
  • Score service: connection error → player hides score widget, silent fail
  • Engagement: > 500ms → drop poll updates, stop showing new comments
  • Recommendation: > 1s → return static "popular matches" list

Quality ladder shedding:
  If origin bandwidth is saturated, temporarily remove the 4K tier from manifests.
  Viewers on Smart TVs step down to 1080p automatically (ABR handles it).
  This reduces bandwidth by 30% with minimal viewer impact (very few viewers use 4K).

Admission control (last resort):
  If all else fails: new session requests get a "wait and retry" response (HTTP 503 + Retry-After: 30)
  Existing sessions with valid JWTs are never dropped — only new logins are throttled
  A "virtual queue" page with real-time position display (seen during IPL ticket sales for Zomato/BookMyShow, same principle)`,
        },
        {
          title: "Service Mesh — Sidecar Proxy Pattern (Envoy/Istio)",
          content: `A service mesh moves cross-cutting networking concerns OUT of
application code and INTO a sidecar proxy (Envoy) deployed next
to every service instance. All traffic in/out of a service passes
through its sidecar first.

WHY A MESH FITS HOTSTAR'S FLEET — WITH A CAVEAT:
Hotstar's architecture has two very different planes:
• The VIDEO DELIVERY PATH (Ingest, Transcode Farm, Segment Origin,
  Multi-CDN) is a media pipeline + CDN, not request/response
  microservices — a mesh adds no value here and would add latency
  to the most latency-sensitive path in the system
• The SUPPORTING SERVICES plane (Auth Service, Engagement Services)
  IS a classic microservices fleet that calls each other and gets
  called by clients — THIS is where the mesh lives

1. Data plane — Envoy sidecar attached to every Auth Service and
   Engagement Service pod
   • Applies retries, timeouts, circuit breaking, mTLS
   • Emits uniform metrics/traces for both services

2. Control plane — Istio / Consul / AWS App Mesh
   • Pushes policy centrally: "Auth Service p99 > 50ms → eject pod"
   • "Engagement Service v2 gets 5% canary during a low-stakes
     league match before the IPL final"
   • "Only the API edge and Engagement Service may call Auth
     Service's internal validation endpoint"

WHAT THIS BUYS HOTSTAR SPECIFICALLY:
• The circuit breakers from the priority hierarchy above — "Auth
  p99 > 50ms → use cached JWT", "Score service error → hide widget"
  — become outlierDetection policy at the mesh layer instead of
  bespoke per-service code, applied uniformly and tunable centrally
  during a live match without a redeploy
• Canary rollouts for Auth Service changes (new token-validation
  logic, signing-key rotation) tested at 5% traffic during a regular-
  season match, weeks before the IPL final where a bug would be
  catastrophic
• mTLS between Auth Service and Engagement Services — subscription
  tier and entitlement data encrypted in transit
• AuthorizationPolicy restricts Auth Service's internal endpoints to
  only the API edge and Engagement Services — zero-trust even inside
  the "Supporting Services" plane
• End-to-end tracing for "issue playback token" — from API edge →
  Auth Service → Redis subscription cache → JWT signing

DIAGRAM: the "SERVICE MESH" band inside the SUPPORTING SERVICES box
represents this — only Auth Service and Engagement Services sit
behind it. The Ingest/Transcode/Segment Origin/Multi-CDN path above
is intentionally NOT part of the mesh.

TRADE-OFFS:
• ~1-2ms extra latency per hop — negligible against Auth's 50ms p99
  budget, but it's still a number that must be measured, not assumed
• Control plane becomes a new dependency for Auth/Engagement (sidecars
  cache last-known config if it goes down)
• Discipline required to keep the video delivery path OUT of the
  mesh — the moment someone "helpfully" injects a sidecar into the
  transcode farm, IPL's tightest latency budget gets an unplanned tax`,
        },
        {
          title: "Adaptive Bitrate — Handling India's Network Diversity",
          content: `India has the world's most heterogeneous mobile network. The same IPL match is watched on Mumbai 5G and Bihar 2G simultaneously. ABR is what makes this possible.

Hotstar's custom ABR player "Starburst":
  • Built in-house (not vanilla ExoPlayer or AVPlayer defaults)
  • Bandwidth estimator: EWMA of last 5 segment download times (exponentially weighted)
  • Hysteresis: don't switch quality up until bandwidth sustains for 3 consecutive segments
  • Aggressive quality drop: if bandwidth drops 30% → immediately step down 1 tier
  • Buffer recovery: target 15s buffer. If buffer < 5s, drop to lowest quality until recovered.

Quality ladder decision:
  bandwidth > 5 Mbps    → 1080p60
  bandwidth 3–5 Mbps   → 1080p
  bandwidth 1.5–3 Mbps → 720p
  bandwidth 0.8–1.5 Mbps → 480p
  bandwidth 0.4–0.8 Mbps → 360p
  bandwidth < 0.4 Mbps  → audio-only mode (Hotstar's killer feature for low-bandwidth users)

Audio-only mode:
  • Unique to Indian streaming platforms: play live commentary as audio when video is impossible
  • 32 kbps AAC stream — works on 2G (GPRS at 40 kbps)
  • Shows static scorecard UI alongside audio
  • Users on village Jio 2G can follow the match in real time
  • This segment of users is non-trivial: ~10–15% of IPL viewers are on sub-1 Mbps connections

Per-device tuning:
  Smart TV:    start at 1080p, conservative downgrade (user expects quality)
  Mobile:      start at 480p, aggressive adaptation (expects variation)
  Low-end Android (< 2GB RAM): max 480p to avoid decoder stutter
  Jio STB:     forced 720p (fixed hardware decoder, no ABR needed)`,
        },
      ],
    },
  ],
};

export const HOTSTAR_LLD = {
  title: "Hotstar — Low Level Design",
  subtitle: "API contracts, schemas, and algorithms for live streaming at IPL scale",

  components: [
    {
      id: "ingest",
      title: "Ingest & Transcode Service",
      description: "RTMP ingest, real-time transcode pipeline, segment packaging",
      api: `// Internal transcode orchestrator API (not public)

// Register a new live stream
POST /ingest/v1/streams
Body: {
  matchId: "ipl-2026-mi-csk-final",
  sourceUrl: "rtmp://ingest1.hotstar.internal/live/ipl-final",
  backupUrl: "rtmp://ingest2.hotstar.internal/live/ipl-final",
  qualities: ["360p","480p","720p","1080p","1080p60","4k"],
  segmentDurationSecs: 2,
  startAt: "2026-05-31T19:30:00+05:30"
}
Response: {
  streamId: "stream_abc123",
  ingestEndpoint: "rtmp://ingest1.hotstar.com/live/ipl-final?key=secret",
  status: "WAITING"
}

// Stream health (polled by monitoring every 5s)
GET /ingest/v1/streams/{streamId}/health
Response: {
  status: "LIVE",             // WAITING | LIVE | DEGRADED | FAILED
  activeIngest: "primary",   // primary | backup
  currentSegment: 4823,
  transcodeWorkers: {
    "360p": { status: "OK", lag_ms: 180 },
    "1080p": { status: "OK", lag_ms: 220 },
    "4k":    { status: "OK", lag_ms: 890 }
  },
  dropCount: 0
}

// Segment store (S3 object layout)
s3://hotstar-live/{matchId}/{quality}/seg_{N:08d}.ts
s3://hotstar-live/{matchId}/{quality}/playlist.m3u8

// HLS manifest (updated every 2s)
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:4819
#EXTINF:2.000,
seg_00004819.ts
#EXTINF:2.000,
seg_00004820.ts
#EXTINF:2.000,
seg_00004821.ts
#EXTINF:2.000,
seg_00004822.ts
#EXTINF:2.000,
seg_00004823.ts`,

      internals: `Transcode pipeline (one worker per quality per stream):

  func transcodeWorker(streamId, quality string, input chan RawChunk) {
    ffmpegArgs := buildFFmpegArgs(quality)  // resolution, bitrate, codec flags
    cmd := exec.Command("ffmpeg", ffmpegArgs...)
    stdin := cmd.StdinPipe()
    stdout := cmd.StdoutPipe()

    go func() {
      for chunk := range input {
        stdin.Write(chunk.Data)       // feed raw frames
      }
    }()

    segmentWriter := NewSegmentWriter(streamId, quality)
    for {
      seg := segmentWriter.ReadNextSegment(stdout)  // blocks until 2s ready
      s3.PutObject("hotstar-live", segPath(streamId, quality, seg.N), seg.Data)
      cdnPusher.Push(segCDNUrl(streamId, quality, seg.N))  // active CDN push
      playlistWriter.Append(seg.N)                         // rewrite m3u8
    }
  }

Playlist writer (lock-free ring buffer):
  Maintains last 5 segment numbers in a circular buffer
  On each new segment: atomically swap pointer to new playlist bytes
  Playlist served directly from memory by a lightweight HTTP server — no disk I/O
  Single goroutine writes; many goroutines read (read-copy-update pattern)

Failover to backup ingest:
  healthMonitor runs every 500ms:
    if primary.lastHeartbeat > 1500ms:
      log.Alert("Primary ingest down, switching to backup")
      atomicSwap(&activeIngest, backupIngest)
      // raw buffer in S3 allows re-encode of dropped frames from backup
      replayBuffer(primary.lastGoodFrame, backup.currentFrame)`,
    },
    {
      id: "playback-auth",
      title: "Playback Auth Service",
      description: "JWT entitlement, DRM license issuance, subscription validation",
      api: `// Step 1: Get playback token (before player starts)
POST /v1/playback/token
Authorization: Bearer {user_access_token}
Body: {
  contentId: "ipl-2026-mi-csk-final",
  deviceId: "device_xyz",
  deviceType: "MOBILE_ANDROID",
  drmType: "WIDEVINE"           // WIDEVINE | FAIRPLAY | PLAYREADY
}
Response: {
  playbackToken: "eyJ...",      // short-lived JWT (15 min)
  manifestUrl: "https://akamai-hotstar.com/live/ipl-final/master.m3u8?token=eyJ...",
  drmLicenseUrl: "https://drm.hotstar.com/widevine/license",
  expiresAt: "2026-05-31T20:00:00Z"
}

// JWT payload (signed HS256 with rotating secret)
{
  "sub":        "user_123456",
  "contentId":  "ipl-2026-mi-csk-final",
  "deviceId":   "device_xyz",
  "tier":       "PREMIUM",          // FREE | PREMIUM | PREMIUM_PLUS
  "maxQuality": "1080p60",          // enforced at CDN edge via token claim
  "iat":        1748695200,
  "exp":        1748696100,          // 15 minute window
  "jti":        "one-time-nonce-abc" // prevents token replay
}

// CDN token validation (Akamai EdgeAuth)
// CDN edge validates JWT signature before serving any segment
// Invalid/expired token → 403 Forbidden
// CDN never calls origin for auth — JWT is self-contained

// DRM license request (Widevine)
POST /drm/widevine/license
Authorization: Bearer {playbackToken}
Body: {widevine_challenge: "<base64 challenge from player>"}
Response: {license: "<base64 widevine license bytes>"}

// Token refresh (before expiry)
POST /v1/playback/token/refresh
Authorization: Bearer {playbackToken}  // still valid token
Response: { playbackToken: "eyJ...", expiresAt: "..." }`,

      internals: `Token validation at scale (32M concurrent viewers):

  Auth service is stateless — JWT carries all entitlement info.
  No database lookup needed for segment requests — CDN validates locally.
  Only /token endpoint hits the database (once per 15 min per viewer).

  Token generation:
    func generatePlaybackToken(userId, contentId, deviceId string) (string, error) {
      sub, tier, err := subscriptionDB.GetUser(userId)  // Redis cache first, then MySQL
      if err != nil { return "", err }

      if !isEntitled(tier, contentId) {
        return "", ErrNotSubscribed
      }

      claims := PlaybackClaims{
        Sub: userId, ContentId: contentId, DeviceId: deviceId,
        Tier: tier, MaxQuality: tierToMaxQuality(tier),
        IssuedAt: time.Now(), ExpiresAt: time.Now().Add(15 * time.Minute),
        JTI: uuid.New().String(),
      }
      return jwt.Sign(claims, currentSigningKey())
    }

Redis caching for auth at IPL scale:
  Key: "user:{userId}:subscription"
  Value: {tier, expiry, deviceLimit}
  TTL: 5 minutes
  Cache hit rate during IPL: > 99% (same users re-validate every 15 min)
  Redis cluster: 6 nodes, each handling ~5M cache lookups/min during peak

DRM license caching:
  Widevine licenses are valid for 1 hour (configurable)
  Player caches license locally — only re-requests on expiry
  DRM service is low traffic compared to auth (1 license per hour vs 1 token per 15 min)

Device concurrency enforcement:
  Premium: 2 screens simultaneously
  Tracked via Redis: SADD "active_devices:{userId}" {deviceId}  (TTL: 30s, refreshed by heartbeat)
  If |active_devices| >= limit: reject new token with HTTP 429 "device limit reached"`,
    },
    {
      id: "cdn-orchestrator",
      title: "CDN Segment Orchestrator",
      description: "Active segment push, multi-CDN routing, cache management",
      api: `// Internal segment pusher (called by transcode pipeline on each new segment)
POST /cdn/v1/push
Body: {
  matchId: "ipl-2026-mi-csk-final",
  segmentNumber: 4823,
  qualities: ["360p","480p","720p","1080p","1080p60"],
  s3Paths: {
    "360p":   "s3://hotstar-live/ipl-final/360p/seg_00004823.ts",
    "1080p":  "s3://hotstar-live/ipl-final/1080p/seg_00004823.ts"
  },
  playlistUpdated: true
}
// CDN Orchestrator fans this out to all CDN providers simultaneously

// CDN health check (polled every 10s by traffic router)
GET /cdn/v1/health
Response: {
  cdns: {
    "akamai":  { status: "healthy", p95LatencyMs: 38, errorRate: 0.001 },
    "fastly":  { status: "healthy", p95LatencyMs: 42, errorRate: 0.002 },
    "cloudfront": { status: "degraded", p95LatencyMs: 280, errorRate: 0.08 }
  }
}

// Traffic routing table (updated by orchestrator based on CDN health)
GET /cdn/v1/routing?userId=123&ip=49.x.x.x
Response: {
  primaryCdn:   "akamai",
  fallbackCdn:  "fastly",
  manifestBase: "https://akamai-hs.akamaized.net/live/ipl-final",
  fallbackBase: "https://hotstar.global.ssl.fastly.net/live/ipl-final"
}`,

      internals: `Active push pipeline (zero thundering herd):

  func onNewSegmentReady(matchId, segN string, qualities []string) {
    // Fan out push to all CDN providers in parallel
    var wg sync.WaitGroup
    for _, cdn := range []string{"akamai", "fastly", "cloudfront"} {
      wg.Add(1)
      go func(cdn string) {
        defer wg.Done()
        urls := buildSegmentURLs(matchId, segN, qualities, cdn)
        err := cdnClients[cdn].Preposition(urls)
        if err != nil {
          log.Warn("CDN push failed", "cdn", cdn, "seg", segN, "err", err)
          // Non-fatal: CDN will pull on first viewer request (slower but works)
        }
      }(cdn)
    }
    wg.Wait()  // wait for all pushes (timeout: 800ms, must complete before next segment)
  }

Multi-CDN traffic routing (weighted random with health gating):
  weights = {
    akamai:     50%  (best Jio peering)
    fastly:     35%  (Tier-2 cities)
    cloudfront: 15%  (diaspora / international)
  }
  if cdn.errorRate > 5% || cdn.p95 > 500ms:
    remove from pool, alert on-call, drain traffic to other CDNs

Cache TTL strategy:
  Segment (.ts):  TTL = 3600s   (immutable — seg_N never changes once written)
  Manifest (.m3u8): TTL = 2s   (changes every segment, must stay fresh)
  Master playlist: TTL = 30s   (quality variants list, changes rarely)
  DRM license URLs: TTL = 300s

Manifest TTL race condition mitigation:
  Problem: CDN caches old manifest for 2s, new segment not in it yet → player requests seg not found
  Solution: manifest includes EXT-X-MEDIA-SEQUENCE so player knows WHICH segments to expect
  Player waits: if requested seg_N returns 404, retry after 500ms (segment still propagating)`,
    },
    {
      id: "engagement",
      title: "Live Engagement Service",
      description: "Live score, viewer count, polls, and commentary at 32M concurrent users",
      api: `// Live score SSE stream (Server-Sent Events — one-way push)
GET /engagement/v1/live/{matchId}/score
Accept: text/event-stream
Authorization: Bearer {playbackToken}

// Server pushes on each over/wicket/boundary
data: {"over": 18.3, "score": "MI 142/3", "ball": "SIX! Rohit Sharma", "ts": 1748695812}
data: {"over": 18.4, "score": "MI 148/3", "ball": "Dot ball", "ts": 1748695830}

// Viewer count (approximate, updated every 10s)
GET /engagement/v1/live/{matchId}/stats
Response: { concurrentViewers: 31847293, peakToday: 32541000 }

// Live poll
POST /engagement/v1/live/{matchId}/polls/{pollId}/vote
Body: { optionId: "option_a" }
Response: { success: true, currentResults: { "option_a": 58, "option_b": 42 } }

// Commentary feed (WebSocket — bidirectional for chat)
WS wss://engagement.hotstar.com/live/{matchId}/commentary
  Client sends: { type: "ping" }             // keepalive every 30s
  Server sends: { type: "commentary", text: "Bumrah bowls a yorker!", ts: 1748695832 }
  Server sends: { type: "wicket", batsman: "Kohli", runs: 45 }
  Server sends: { type: "boundary", batsman: "Rohit", value: 4 }`,

      internals: `Score fan-out at 32M viewers — the hardest part of engagement:

  Problem: cricket score changes every 5–10 seconds. 32M × 1 update every 10s =
           3.2M pushes/second. No single service handles that.

  Architecture: broadcast bus pattern
    1. Score source: ball-by-ball data feed from official BCCI data provider (TCP socket)
    2. Score ingestor: single Go process consumes the feed, publishes to Kafka topic "live.scores"
    3. Score fan-out workers (100 instances): each consumes Kafka, maintains SSE connection pool
       Each worker handles 320,000 SSE connections (32M / 100 workers)
    4. Push: on Kafka event, worker iterates its connection pool and writes score update

  SSE connection affinity:
    • Consistent hash of userId → fan-out worker ID
    • Same user always routes to same worker (connection stickiness)
    • Worker failure: clients reconnect, get redistributed via load balancer

  Viewer count (approximate, not exact):
    Exact count at 32M requires a distributed counter — expensive and unnecessary
    Approximation: each fan-out worker reports its connection count every 10s to Redis
    Aggregator sums all workers → approximate total (accurate to ±50K)
    HyperLogLog considered but connection count per worker is simpler and accurate enough

  Poll result aggregation:
    Vote arrives at any API server → Redis ZINCRBY "poll:{pollId}" 1 "option_a"
    Result fetch: ZRANGE with WITHSCORES → percentage calculation client-side
    Write path: Redis pipeline batches 1000 votes before flushing (reduces ZINCRBY calls)
    At 32M viewers, even 1% voting = 320K votes → Redis handles this easily (writes < 100K/s)

  Circuit breaker for engagement:
    if scoreService.latency_p99 > 500ms:
      disable_live_score_overlay()   // player hides score widget
    if pollService.errorRate > 10%:
      disable_polls()                // return cached last result
    // Video playback NEVER affected by engagement service failures`,
    },
    {
      id: "abr-player",
      title: "ABR Player & Playback Logic",
      description: "Adaptive bitrate, buffer management, startup optimisation for India",
      api: `// Master playlist (one per match, returned to player on session start)
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-INDEPENDENT-SEGMENTS

#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=640x360,CODECS="avc1.4d001e,mp4a.40.2"
/live/ipl-final/360p/playlist.m3u8?token=eyJ...

#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=854x480,CODECS="avc1.4d001f,mp4a.40.2"
/live/ipl-final/480p/playlist.m3u8?token=eyJ...

#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720,CODECS="avc1.640020,mp4a.40.2"
/live/ipl-final/720p/playlist.m3u8?token=eyJ...

#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
/live/ipl-final/1080p/playlist.m3u8?token=eyJ...

#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=3840x2160,CODECS="hvc1.1.6.L150,mp4a.40.2"
/live/ipl-final/4k/playlist.m3u8?token=eyJ...

// Audio-only fallback (2G mode)
#EXT-X-STREAM-INF:BANDWIDTH=32000,CODECS="mp4a.40.2"
/live/ipl-final/audio/playlist.m3u8?token=eyJ...`,

      internals: `Starburst ABR algorithm (Hotstar's custom player logic):

  Bandwidth estimation (EWMA):
    func estimateBandwidth(segSize bytes, downloadTime ms) float64 {
      instantBw := (segSize * 8) / downloadTime  // bits per ms = Kbps
      α := 0.3  // EWMA weight (lower = smoother, slower to react)
      smoothedBw = α*instantBw + (1-α)*smoothedBw
      return smoothedBw * 0.85  // 15% safety margin for bandwidth estimate
    }

  Quality selection (called before requesting next segment):
    func selectQuality(estimatedBw float64, bufferLevel float64) Quality {
      // Buffer-based override: if buffer critically low, force lowest quality
      if bufferLevel < 5.0 {
        return QUALITY_360P
      }
      // Bandwidth-based selection with hysteresis
      target := qualityForBandwidth(estimatedBw)
      if target > currentQuality {
        // Upgrading: require 3 consecutive segments at higher bandwidth
        upgradeConfidence++
        if upgradeConfidence >= 3 { currentQuality = target; upgradeConfidence = 0 }
      } else if target < currentQuality {
        // Downgrading: immediate, no hysteresis (avoid rebuffering)
        currentQuality = target
        upgradeConfidence = 0
      }
      return currentQuality
    }

  Startup optimisation (time-to-first-frame < 2s):
    1. Start at 360p regardless of bandwidth (smallest segment to fetch = fastest start)
    2. After first segment plays, run bandwidth probe (background fetch of 720p segment)
    3. If probe succeeds within 1s: switch up to 720p on next segment
    4. This gives fast start + quick quality upgrade vs starting high and buffering

  Live edge synchronisation:
    • Player targets "live edge minus 3 segments" (6 second buffer behind live)
    • If playback position drifts > 10s behind live: fast-forward by increasing playback speed to 1.1×
    • Viewer barely notices 10% speed increase; catches up to live edge in ~60s
    • Never skip segments (would cause audio/video artifacts)

  Multi-CDN failover at player:
    segDownloadAttempt:
      try primaryCDN segment URL (timeout: 3s)
      if timeout/error:
        try fallbackCDN segment URL (timeout: 3s)
        if success: switch all future requests to fallback CDN
        persist CDN preference to localStorage (survives page reload)`,
    },
    {
      id: "serviceMesh",
      title: "Service Mesh — Envoy/Istio Config (LLD)",
      description: "Sidecar proxy configuration for the Supporting Services plane: circuit breaking on Playback Auth, canary rollout for Engagement Service, mTLS and zero-trust access",
      api: `# DestinationRule — circuit breaking for Playback Auth Service
# Every player checks/refreshes its JWT against this service;
# the priority hierarchy demands p99 < 50ms or fall back to cached JWT
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: playback-auth-circuit-breaker
  namespace: supporting-services
spec:
  host: playback-auth.supporting-services.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 1000
      http:
        http1MaxPendingRequests: 500
        maxRequestsPerConnection: 20
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
    loadBalancer:
      simple: LEAST_REQUEST

---
# VirtualService — canary rollout for Engagement Service
# New score/poll logic tested at low traffic during a regular-season
# match, weeks before it has to survive the IPL final
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: engagement-service-canary
  namespace: supporting-services
spec:
  hosts:
    - engagement-service.supporting-services.svc.cluster.local
  http:
    - match:
        - headers:
            x-engagement-canary:
              exact: "true"
      route:
        - destination:
            host: engagement-service.supporting-services.svc.cluster.local
            subset: v2
    - route:
        - destination:
            host: engagement-service.supporting-services.svc.cluster.local
            subset: v1
          weight: 95
        - destination:
            host: engagement-service.supporting-services.svc.cluster.local
            subset: v2
          weight: 5
      retries:
        attempts: 1
        perTryTimeout: 100ms
        retryOn: 5xx,reset,connect-failure

---
# AuthorizationPolicy — only the API edge and Engagement Service
# may call Playback Auth's internal validation endpoints
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: playback-auth-access
  namespace: supporting-services
spec:
  selector:
    matchLabels:
      app: playback-auth
  action: ALLOW
  rules:
    - from:
        - source:
            principals:
              - "cluster.local/ns/edge/sa/api-gateway"
              - "cluster.local/ns/supporting-services/sa/engagement-service"

---
# PeerAuthentication — mTLS enforced within the Supporting Services plane
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: supporting-services
spec:
  mtls:
    mode: STRICT`,
      internals: `WHERE THE MESH STOPS:
Sidecars are injected ONLY into pods in the "supporting-services"
namespace — Playback Auth and Engagement Service. The Ingest,
Transcode Farm, Segment Origin, and CDN orchestrator run in a
separate "media-pipeline" namespace with NO sidecar injection
webhook enabled. This is a deliberate boundary: the video path's
latency budget (sub-100ms per hop in places) can't absorb even the
1-2ms a sidecar adds, and its traffic pattern (S3 writes, CDN push
APIs) doesn't benefit from mesh features anyway.

CIRCUIT BREAKING ON PLAYBACK AUTH (the hot path):
Every player calls Playback Auth for a token every 15 minutes
(32M viewers ÷ 900s ≈ 36,000 token requests/sec sustained). The
graceful-degradation policy says "if Auth p99 > 50ms, use cached
JWT for active sessions." outlierDetection implements the mechanical
half of this: if Playback Auth pods start returning 5xx (e.g., Redis
subscription cache miss storm), 5 consecutive errors in 10s ejects
that pod for 30s, capped at 50% of the fleet. Combined with the
app-level fallback (serve from cached JWT claims), this means a
struggling Auth Service degrades gracefully instead of cascading
into "every player thinks it's logged out."

CANARY ROLLOUT FOR ENGAGEMENT SERVICE:
New live-score or poll logic is deployed with 0% traffic (reachable
only via the x-engagement-canary header), tested during a regular-
season match at 5% live traffic, then ramped to 100% — all via
control-plane config pushes with no redeploy. Crucially, because
"video playback is NEVER affected by engagement service failures"
(per the graceful degradation policy), a bad canary here degrades to
"score widget hidden," never to "stream stops."

mTLS + AUTHORIZATION POLICY:
Subscription tier, entitlement, and JWT-claim data flowing between
Playback Auth and Engagement Service is encrypted via STRICT mTLS.
AuthorizationPolicy further restricts Playback Auth's internal
endpoints to only the API edge and Engagement Service — a stray pod
in another namespace cannot call Auth's validation endpoint even if
it discovers the hostname.

CONTROL-PLANE-DOWN FAILURE MODE:
If istiod becomes unavailable mid-match, existing sidecars continue
operating on cached config — circuit breaking and mTLS keep working
for Auth and Engagement. This matters because a control-plane outage
during the IPL final must NEVER be the reason 32M JWTs stop
validating.`,
    },
  ],
};

export const HOTSTAR_QNA = [
  {
    id: "hs-q1",
    category: "Scale & Performance",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Hotstar", "Netflix", "Amazon"],
    question: "How does Hotstar prevent origin servers from getting overwhelmed when 20 million viewers all press play at 7:30 PM?",
    answer: `Three-layer thundering herd mitigation:

1. Active segment push: the transcode farm PUSHes each new 2-second segment to CDN edges the moment it's ready — before any viewer requests it. By the time viewers request segment N, it's already cached at the CDN edge nearest to them. No origin hit.

2. CDN request coalescing: when the first viewer at a PoP triggers a cache miss, the CDN holds all subsequent requests for the same segment and sends exactly ONE request to origin. All waiting viewers get the response simultaneously. This collapses 50,000 concurrent cache misses into 1 origin request.

3. Manifest jitter: the m3u8 playlist is updated every 2 seconds. Clients are instructed to poll with ±1 second random jitter. This spreads 20M manifest requests over a 2-second window instead of a synchronized spike.

Without these: 32M viewers × 1 cache miss each = 32M origin requests in seconds → instant death.`,
    followups: ["How would you test this at scale before IPL begins?", "What's the failure mode if active segment push is delayed by 3+ seconds?"],
  },
  {
    id: "hs-q2",
    category: "Architecture",
    difficulty: "Hard",
    round: "System Design Round",
    asked_at: ["Hotstar", "Twitter", "ESPN"],
    question: "Design the live score fan-out system for 32 million concurrent IPL viewers.",
    answer: `Broadcast bus pattern with horizontal fan-out workers:

1. Score ingestor: single Go process receives ball-by-ball data via TCP from BCCI data feed → publishes to Kafka topic "live.scores".

2. Fan-out workers (100 instances): each Kafka consumer maintains a pool of ~320,000 SSE (Server-Sent Events) connections. On each Kafka message, it iterates the pool and pushes to all connections. Connection affinity via consistent hashing of userId ensures a user always connects to the same worker.

3. Why SSE over WebSocket? Score is server-to-client only. SSE is simpler, uses HTTP/2 multiplexing, and is more CDN-friendly.

Key math: 32M viewers × 1 update per 10 seconds = 3.2M pushes/second across all workers = 32K pushes/second per worker. Manageable.

Circuit breaker: if score service latency > 500ms, player hides score widget. Video delivery is completely independent — score service failure cannot affect playback.`,
    followups: ["What happens to the fan-out worker's connections if it crashes mid-match?", "How would you scale beyond 100 fan-out workers without losing connection affinity?"],
  },
  {
    id: "hs-q3",
    category: "CDN & Streaming",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Hotstar", "Netflix", "YouTube"],
    question: "How does Hotstar handle the tradeoff between live latency and buffering stability for Indian mobile users?",
    answer: `Hotstar runs different latency profiles based on subscriber tier and network quality:

Standard HLS (10–30s latency): used for most users. Larger client buffer (15–30 seconds of pre-buffered video) absorbs India's notoriously jittery mobile networks (Jio congestion, BSNL packet loss). A viewer on 4G in a crowded stadium won't rebuffer even with 10-second bandwidth spikes. Cost: they're 20 seconds behind WhatsApp.

Low-Latency HLS (< 5s latency): opt-in for premium subscribers on good connections. Uses partial segments (player requests fragments of a segment before it's complete) and blocking playlist requests (server holds HTTP connection open, responds the instant new manifest is ready — no polling jitter).

Starburst player prioritizes stability over latency:
• Buffer target: 15 seconds
• Quality drop triggers immediately on buffer < 5s (no hysteresis on downgrade)
• Quality upgrade requires 3 consecutive segments at higher bandwidth (conservative)
• Live edge drift correction: 1.1× playback speed to catch up, not skip

Audio-only mode: for < 0.4 Mbps users (rural 2G), the player falls back to 32 kbps AAC audio + static scorecard. A unique Indian use case that significantly expands the total addressable audience.`,
    followups: ["How do you measure whether a viewer is experiencing rebuffering in production?", "Design an A/B test to validate that LL-HLS is better for premium users."],
  },
  {
    id: "hs-q4",
    category: "Scale & Performance",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Hotstar", "Amazon", "Google"],
    question: "How would you pre-scale Hotstar's infrastructure for IPL without wasting money on idle capacity all year?",
    answer: `Key insight: IPL is predictable — every match date is known months ahead. Use a tiered provisioning strategy.

Outside IPL: ~1M peak concurrent viewers. Autoscaling handles normal day/night variation. Minimal reserved capacity.

IPL pre-scale playbook:
• T-14 days: purchase 6-month reserved instances (40% cheaper than on-demand) for transcode farm, auth service, and fan-out workers.
• T-7 days: load test at 120% expected peak. Run chaos engineering — kill random transcode workers and fan-out pods during a "dress rehearsal" stream.
• T-4 hours: manually scale transcode farm to 200% capacity. Auth service to 10× (login surge at match start). Redis cluster to 6 nodes.
• T-0: everything at max capacity. SRE war room call active. No autoscaling needed — everything already provisioned.

Why not autoscale to peak?
• Kubernetes HPA takes 2–3 minutes to spin up pods. Thundering herd arrives in 0–5 minutes. You cannot scale to IPL peak — you must be at peak before the first viewer arrives.

Cost optimization: reserved instances + spot instances for fault-tolerant batch jobs (transcode re-runs, segment validation). Post-match, aggressively scale down 30 minutes after match ends. Annual AWS bill spike is 2× for 7 weeks, then back to baseline.`,
    followups: ["How do you run a realistic load test before the actual IPL season?"],
  },
  {
    id: "hs-q5",
    category: "CDN & Streaming",
    difficulty: "Medium",
    round: "System Design Round",
    asked_at: ["Hotstar", "Netflix", "Cloudflare"],
    question: "What is CDN request coalescing and why is it critical for live streaming?",
    answer: `Request coalescing (also called request collapsing) is a CDN feature where concurrent cache miss requests for the same object are collapsed into a single origin fetch.

Without coalescing: segment_001.ts is new (just created by transcode farm). 50,000 viewers at the Mumbai CDN PoP all request it simultaneously. CDN has no cache entry → all 50,000 requests fan back to origin → origin gets 50,000 concurrent hits for the same 2-second video file. Multiplied across 8 PoPs in India alone = 400,000 origin requests per 2-second segment cycle.

With coalescing: CDN receives 50,000 requests, sees they're all for the same URL, sends ONE request to origin. Holds the other 49,999 requests in a queue. Origin responds with the segment. CDN caches it and serves all 49,999 queued requests instantly.

For live streaming it's critical because: segments are created continuously (every 2s), they're never in cache when first created, and the entire audience requests each new segment within the same 2-second window. Coalescing plus active push is what prevents origin implosion at IPL scale.`,
    followups: ["What's the maximum queue wait time for a coalesced request, and how does that affect perceived latency?"],
  },
  {
    id: "hs-q6",
    category: "Security & DRM",
    difficulty: "Medium",
    round: "Deep Dive",
    asked_at: ["Hotstar", "Netflix", "Amazon"],
    question: "How does JWT-based auth work at CDN edge for live streaming? Why not call an auth service per segment?",
    answer: `Calling an auth service per segment at 32M viewers × 1 segment per 2 seconds = 16M auth calls/second. No auth service survives that.

JWT self-contained auth:
1. User authenticates and calls Playback Auth Service (POST /playback/token) — one call.
2. Auth service validates subscription, generates a signed JWT containing: userId, contentId, tier, maxQuality, expiry (15 min), device ID.
3. JWT is appended to the manifest URL as a query parameter: playlist.m3u8?token=eyJ...
4. All segment URLs in the manifest also include the same token.
5. CDN edge validates the JWT signature locally using a public key — no network call, pure computation. Valid → serve segment. Invalid/expired → 403.

Token refresh: player calls /token/refresh every 12 minutes (before the 15-minute expiry). This is the ONLY database call in the entire playback lifecycle — once per 12 minutes per viewer.

CDN never calls origin for auth validation. The JWT is self-validating. This is what makes 32M concurrent viewers feasible.`,
    followups: ["How do you revoke a JWT before its 15-minute expiry (e.g., user cancels subscription mid-match)?", "What are the security risks of embedding tokens in URLs?"],
  },
  {
    id: "hs-q7",
    category: "Fault Tolerance",
    difficulty: "Medium",
    round: "System Design Round",
    asked_at: ["Hotstar", "Netflix", "Google"],
    question: "How does Hotstar implement graceful degradation when systems start struggling under IPL peak load?",
    answer: `Priority hierarchy: video delivery > auth > live score > polls > social features.

Circuit breakers per service:
• Auth service p99 > 50ms: stop re-validating active sessions, use cached JWT for next 5 minutes. Worst case: a cancelled subscription watches an extra 5 minutes.
• Score service errors: player hides score overlay widget. Video unaffected.
• Engagement services (polls, chat): disabled when auth load > 90%. Return 503 with "Paused during peak" message.
• Recommendation engine: return static "popular matches" list instead of personalised.

Quality ladder shedding: temporarily remove 4K tier from master playlist when CDN bandwidth is saturated. ABR players step down to 1080p automatically. 4K viewers are a tiny minority; removing them frees 30% of total bandwidth.

Admission control (last resort): new login attempts get HTTP 503 + Retry-After: 30. Existing sessions with valid JWTs are NEVER dropped. This protects the viewers already watching while throttling new joiners during extreme spikes. Combined with a visual queue counter to manage user expectation.`,
    followups: ["How do you decide the thresholds for each circuit breaker in production?"],
  },
  {
    id: "hs-q8",
    category: "CDN & Streaming",
    difficulty: "Medium",
    round: "Screening",
    asked_at: ["Hotstar", "Netflix", "YouTube"],
    question: "Explain HLS adaptive bitrate streaming and how Hotstar tunes it for India.",
    answer: `HLS works by splitting video into small segments (2 seconds for Hotstar live). Each segment is stored at multiple quality levels (360p to 4K). The master playlist lists all quality variant URLs. The player chooses which quality to request next based on available bandwidth.

Standard ABR flow:
1. Measure download time of last segment → estimate bandwidth.
2. Apply 15% safety margin (network is never exactly what it measures).
3. Pick highest quality that fits comfortably within estimated bandwidth.
4. Apply hysteresis: require 3 segments at higher bandwidth before upgrading (avoid yo-yo switching).
5. Downgrade immediately — no hysteresis (rebuffering is worse than lower quality).

Hotstar tunes for India:
• Startup at 360p regardless of bandwidth → first frame in < 2 seconds on any network.
• Background probe after first frame: download 720p segment silently, measure time, upgrade if fast.
• Audio-only fallback at < 0.4 Mbps — unique feature for 2G users (rural India, crowded stadiums).
• Live edge correction: if playback drifts > 10s behind live, play at 1.1× speed to catch up — seamless to viewers.
• Per-device quality caps: low-end Android (< 2GB RAM) capped at 480p to prevent decoder stutter.`,
    followups: ["What metric would you use to measure ABR algorithm quality? How would you A/B test it?"],
  },
  {
    id: "hs-q9",
    category: "CDN & Streaming",
    difficulty: "Easy",
    round: "Screening",
    asked_at: ["Hotstar", "Akamai", "Fastly"],
    question: "Why does Hotstar use 2-second HLS segments instead of longer (6–10s) segments?",
    answer: `Tradeoff: shorter segments = lower latency + finer ABR granularity, but higher request volume and CDN pressure.

6-second segments (YouTube/Netflix default for VOD):
• Only 10 requests/minute per viewer — low CDN load
• ABR can only switch quality every 6 seconds — coarse
• Latency: minimum ~18–30 seconds (3 segments buffered × 6s each)
• Fine for on-demand where latency doesn't matter

2-second segments (Hotstar live):
• 30 requests/minute per viewer — 3× more CDN requests
• ABR switches quality every 2 seconds — rapid adaptation to network changes
• Latency: minimum 6–10 seconds — viewers roughly in sync
• Critical for live: WhatsApp spoilers happen on 30-second lag, not 10-second lag

The CDN cost is manageable because:
• 2-second segments are served entirely from CDN cache (never origin)
• CDN request volume scales linearly with viewers but not with origin cost
• Manifest polling (every 2s) is the more significant load — 32M × 0.5 req/s = 16M/s, which is why manifest active push is critical`,
    followups: ["At what point does reducing segment size below 2s become counterproductive?"],
  },
  {
    id: "hs-q10",
    category: "Scale & Performance",
    difficulty: "Easy",
    round: "Screening",
    asked_at: ["Hotstar", "Amazon", "Netflix"],
    question: "Why does Hotstar pre-scale to peak capacity before an IPL match instead of relying on auto-scaling?",
    answer: `Auto-scaling works well for gradual ramp-up over minutes or hours. IPL thundering herd is a cliff edge.

What auto-scaling does:
• Monitors CPU/request rate → triggers pod scaling when threshold crossed.
• Kubernetes HPA spins up new pods in ~2–3 minutes (image pull, health check, warm-up).

What IPL looks like:
• 7:30:00 PM: match starts. 0 new viewers.
• 7:30:30 PM: 5 million viewers. Auto-scaler triggered.
• 7:32:00 PM: auto-scaler spinning up pods. 15M viewers already on the system.
• 7:33:00 PM: new pods ready. 20M viewers — but the service already struggled for 2.5 minutes.

Pre-scaling solution: manually scale to peak capacity at T-4 hours. The cost of over-provisioning for 4 hours is negligible compared to the revenue and reputation damage of a broken match stream. Reserved instances reduce per-hour cost. Auto-scaling is used after the match to ramp DOWN over 30 minutes — which is exactly the gradual ramp-down auto-scaling handles well.`,
    followups: ["How would you automate the pre-scale playbook so SREs don't have to do it manually before every match?"],
  },
  {
    id: "hs-q11",
    category: "Estimation",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Hotstar", "Netflix", "Amazon"],
    question: "Before drawing any boxes, walk me through a back-of-the-envelope estimation for Hotstar's IPL traffic at peak.",
    answer: `This is the "size the system before you design it" step — every number should map to a component in the architecture.

STATE YOUR ASSUMPTIONS FIRST:
• 32.5M peak concurrent viewers (IPL 2023 final, world record)
• 2-second HLS segments, 6 quality variants (360p → 4K) + audio-only
• Every client polls the manifest every 2s and pulls 1 segment every 2s
• 8 major CDN PoPs in India across 3 CDNs (Akamai, Fastly, CloudFront)
• ~10 Tbps peak bandwidth served across all CDN edges

1. Manifest request rate: 32.5M ÷ 2s ≈ 16.25M manifest requests/sec. With
   ±1s jitter spreading this over the 2-second window and a 2s CDN TTL
   plus active manifest push, this MUST be served almost entirely from
   CDN edge — even 0.1% origin fallthrough is 16,250 req/sec hitting the
   origin shield.

2. Segment request rate: same math gives another ~16.25M segment
   requests/sec, for a combined ~32.5M req/sec CDN edge load. Spread
   across 8 major PoPs ≈ 4M req/sec/PoP at peak, with Mumbai (8 Tbps
   capacity, Jio's headquarters city) absorbing a disproportionate share.

3. Average bitrate per viewer: ~10 Tbps ÷ 32.5M viewers ≈ 308 kbps —
   below even the 360p tier (400 kbps). This is the most revealing
   number: a large fraction of India's audience is on 240p/360p or
   audio-only, which is why the 32 kbps audio-only mode is load-bearing,
   not an edge case.

4. Active CDN push volume: 6 quality variants × 1 push/2s × 3 CDNs = 9
   push API calls/sec. Those 9 calls/sec eliminate the 32.5M pulls/sec
   that would otherwise hit origin on cache miss — a >3,000,000x
   leverage ratio.

5. Origin shield load: with active push + request coalescing, origin
   sees roughly 1 write per segment per quality variant regardless of
   viewer count — about 3.5 req/sec total, versus the 32.5M req/sec
   that would hit it without these mitigations.

INTERVIEW PUNCH LINE: 16.25M manifest + segment requests/sec map onto the
MULTI-CDN TIER's 8 PoPs; the 308 kbps average bitrate maps onto the ABR
quality ladder and explains why audio-only mode exists; the 9 push
calls/sec map onto the active segment push pipeline; and ~3.5 req/sec of
origin load is the number that proves SEGMENT ORIGIN never sees the
32M-viewer thundering herd. If your numbers don't land on a diagram box,
the estimation was just arithmetic, not design.`,
    followups: [
      "How would these numbers change if Hotstar dropped 2-second segments to 1-second LL-HLS for everyone?",
      "If the average bitrate is only 308 kbps, why does Hotstar still provision for 10 Tbps rather than less?",
      "How would you estimate the Redis cluster size needed for 36,000 token validations/sec (32.5M ÷ 15-min refresh)?",
    ],
  },
  {
    id: "hs-q12",
    category: "Architecture",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Hotstar", "Netflix", "Disney+"],
    question: "Hotstar's Auth Service and Engagement Services call each other and get called by 32M clients, while the video pipeline (ingest, transcode, CDN) is an entirely different kind of system. How would you manage reliability and security for the service-to-service traffic without slowing down the video path?",
    answer: `This is the classic case for a SERVICE MESH — but the interesting
part of this answer is knowing where NOT to put it.

THE TWO PLANES:
• VIDEO DELIVERY PATH (Ingest, Transcode Farm, Segment Origin, Multi-CDN)
  — a media pipeline + CDN, not request/response microservices. A
  sidecar here adds 1-2ms to the most latency-sensitive path in the
  whole system for zero benefit.
• SUPPORTING SERVICES PLANE (Auth Service, Engagement Services) — a
  classic microservices fleet calling each other and serving 32M
  clients. THIS is where the mesh belongs.

1. Data plane — Envoy sidecar on every Auth Service and Engagement
   Service pod, applying retries, timeouts, circuit breaking, and mTLS
   with zero app code changes.

2. Control plane — Istio/Consul pushes policy: "Auth Service p99 > 50ms
   → eject pod", "Engagement Service v2 gets 5% canary traffic during a
   regular-season match", "only the API edge and Engagement Service may
   call Auth's internal validation endpoint".

WHAT THIS BUYS HOTSTAR:
• The existing circuit-breaker policy ("Auth p99 > 50ms → use cached
  JWT") becomes outlierDetection at the mesh layer — tunable centrally,
  mid-match, with no redeploy
• Canary rollouts for Auth Service changes (token validation, signing-
  key rotation) tested at low traffic weeks before the IPL final
• mTLS between Auth and Engagement encrypts subscription/entitlement
  data in transit
• AuthorizationPolicy ensures only the API edge and Engagement Service
  can reach Auth's internal endpoints — zero-trust even within this plane
• End-to-end tracing for "issue playback token": API edge → Auth Service
  → Redis subscription cache → JWT signing

TRADE-OFFS:
• ~1-2ms extra latency per hop — negligible against the 50ms p99 budget,
  but must be measured
• Control plane becomes a new dependency (sidecars cache last-known
  config if istiod goes down — critical during the IPL final)
• The real engineering discipline is keeping sidecar injection OUT of
  the media-pipeline namespace — the moment someone injects a sidecar
  into the transcode farm "for consistency," IPL's tightest latency
  budget gets an unplanned tax`,
    followups: [
      "Walk through what happens, step by step, if Playback Auth starts returning 5xx errors during the IPL final — from the outlierDetection ejection to the player's experience.",
      "Why would injecting Envoy sidecars into the transcode farm be a bad idea even if the team standardizes on a mesh everywhere else?",
      "How would you extend mTLS and AuthorizationPolicy to cover the CDN orchestrator, which sits between the media pipeline and the CDN providers?",
    ],
  },
];
