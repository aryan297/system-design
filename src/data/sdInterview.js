// System Design Interview Guide — topic Q&A, LLD/HLD rounds, and a cheat sheet.
// Each entry mirrors a real interview question with a model answer, the points
// a strong candidate hits, likely follow-ups, and a grounded real-world example.

export const SDI_CATEGORIES = [
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "scalability-performance",
    icon: "📈",
    title: "Scalability & Performance",
    color: "#f43f5e",
    problems: [
      {
        id: "vertical-vs-horizontal",
        title: "Vertical vs horizontal scaling — when do you pick which?",
        difficulty: "Easy",
        category: "scalability-performance",
        question:
          "We're hitting CPU limits on our order-processing service. Would you scale it up or scale it out — and how do you decide?",
        answer: {
          short:
            "Scale up (vertical) for quick wins on stateful, hard-to-partition workloads; scale out (horizontal) for anything that needs to survive node failure or grow past a single machine's ceiling.",
          detailed:
            "Vertical scaling means adding CPU/RAM/disk to one machine — it's simple (no code changes, no distributed-systems complexity) but has a hard ceiling (biggest instance type), a single point of failure, and usually means downtime to resize. Horizontal scaling means adding more machines behind a load balancer — it has near-unlimited headroom and gives you fault tolerance for free, but it forces you to confront state: sessions, caches, and DB connections must now work across N nodes, which is where sticky sessions, distributed caches, and connection pool sizing come in. The decision tree: (1) Is the bottleneck CPU/memory on a stateless service? → horizontal, it's usually a small code change plus a load balancer. (2) Is it a database or something inherently stateful? → vertical first (it buys time cheaply), then look at read replicas / sharding as the real horizontal fix. (3) Do you need to survive a single node dying? → horizontal is mandatory regardless of cost, because vertical scaling never solves availability.",
        },
        keyPoints: [
          "Vertical = bigger box (fast, simple, capped, single point of failure); horizontal = more boxes (elastic, fault-tolerant, but needs statelessness)",
          "Stateless services (API/web tiers) horizontally scale almost for free behind a load balancer",
          "Stateful systems (DBs, caches) need replication/sharding before they can scale out — vertical buys time",
          "Horizontal scaling is the only real path to high availability — one big box is always one outage away from total downtime",
        ],
        followUps: [
          "How would you make a stateful service horizontally scalable?",
          "What's the cost curve difference — when does vertical scaling stop being economical?",
          "How do you size an instance before deciding to scale at all?",
        ],
        example:
          "Stack Overflow famously ran on ~9 vertically-scaled SQL Server boxes for years (simplicity, low ops cost) — appropriate at their traffic profile. Netflix, by contrast, runs thousands of small horizontally-scaled instances on AWS because their scale and availability bar make a single powerful box a non-starter.",
      },
      {
        id: "latency-vs-throughput",
        title: "Latency vs throughput — and why optimizing one can hurt the other",
        difficulty: "Easy",
        category: "scalability-performance",
        question:
          "What's the difference between latency and throughput, and can you give an example where improving one makes the other worse?",
        answer: {
          short:
            "Latency is how long one request takes; throughput is how many requests the system handles per unit time. Batching is the classic example where boosting one hurts the other.",
          detailed:
            "Latency = time for a single unit of work to complete (p50/p95/p99 response time). Throughput = total units of work completed per second (RPS, messages/sec, rows/sec). They're related but not the same — a system can have low latency and low throughput (a fast single-threaded service with no concurrency) or high latency and high throughput (a batched pipeline that processes huge volumes but each item waits in a queue). The classic tension: batching writes to a database (e.g., buffering 1000 events before a single bulk INSERT) dramatically improves throughput — fewer round trips, better disk I/O patterns — but it directly increases latency for any individual event, which now waits for the batch to fill or a timeout to fire. Same story with Nagle's algorithm on TCP (batches small packets, adds latency to save bandwidth) or async logging (great throughput, but a log line might not be visible for seconds).",
        },
        keyPoints: [
          "Latency = time per request (p50/p95/p99); throughput = requests per second — different axes, often plotted together",
          "Little's Law ties them together: concurrency = throughput × latency — raising concurrency raises throughput until queueing inflates latency",
          "Batching/buffering is the textbook example of trading latency for throughput",
          "Always ask 'which one does the user/SLA actually care about?' before optimizing — they can pull in opposite directions",
        ],
        followUps: [
          "What is Little's Law and how do you use it in capacity planning?",
          "How would you reduce p99 latency without hurting throughput?",
          "Why does adding more threads sometimes reduce throughput?",
        ],
        example:
          "Kafka producers expose `linger.ms` and `batch.size` — set them higher and throughput climbs (fewer, bigger network requests) but each message waits longer before being sent, directly raising producer-side latency. Tuning that knob *is* the latency-vs-throughput trade-off in production.",
      },
      {
        id: "scale-read-heavy-10x",
        title: "Walk me through scaling a read-heavy API to 10x traffic",
        difficulty: "Medium",
        category: "scalability-performance",
        question:
          "Your product-listing API currently handles 1,000 RPS and you're told to prepare it for 10,000 RPS. Where do you start, and what do you change first?",
        answer: {
          short:
            "Measure first (where's the bottleneck — CPU, DB, network?), then layer in caching, read replicas, and horizontal scaling roughly in that order of cost-to-impact.",
          detailed:
            "Step 1 — measure: profile the current system; find out whether the bottleneck is the app tier (CPU-bound serialization), the database (lock contention, slow queries), or the network (payload size, connection churn). Don't guess. Step 2 — cheap wins: add a CDN/edge cache for anything cacheable (product images, near-static listings); add an in-memory or Redis cache in front of the DB for hot reads with a sensible TTL and an invalidation strategy. This alone often absorbs an order of magnitude of read traffic. Step 3 — database: add read replicas and route reads through a load balancer/proxy (e.g., ProxySQL, PgBouncer) — writes still go to the primary, reads fan out. Step 4 — app tier: make the service stateless (move sessions to Redis) so you can horizontally scale behind a load balancer with auto-scaling rules tied to CPU/RPS. Step 5 — protect the system: add rate limiting and circuit breakers so the 10x doesn't cascade into an outage if one dependency slips. Step 6 — re-measure and iterate — scaling is never 'done', it's a loop of measure → fix the biggest bottleneck → re-measure.",
        },
        keyPoints: [
          "Always start with measurement/profiling — scaling the wrong layer wastes money and adds complexity for nothing",
          "Caching (CDN + application cache) usually gives the biggest bang-for-buck for read-heavy systems",
          "Read replicas decouple read scaling from write scaling — the primary stays the bottleneck only for writes",
          "Statelessness is the prerequisite for horizontal auto-scaling — sessions/caches must move out of the app process",
          "Add guardrails (rate limiting, circuit breakers, timeouts) — more traffic without protection just means a bigger blast radius when something breaks",
        ],
        followUps: [
          "How do you keep a Redis cache consistent with the database on writes?",
          "How would your approach change if this were a write-heavy system instead?",
          "How do you decide cache TTL for product listings that change occasionally?",
        ],
        example:
          "Twitter's timeline read path is a real version of this: tweets are pre-computed and cached per user (fan-out-on-write) so reading a timeline is a cache hit, not a fan-in query across thousands of followees at request time — turning an O(followees) read into an O(1) cache lookup.",
      },
      {
        id: "scalability-vs-performance",
        title: "Aren't 'scalability' and 'performance' just the same thing?",
        difficulty: "Easy",
        category: "scalability-performance",
        question:
          "A junior engineer says 'if the system is fast, it's scalable.' How do you correct that, with an example?",
        answer: {
          short:
            "Performance is how fast the system is at a given load; scalability is how well that performance holds as load grows. A system can be fast at low load and fall over at 10x — that's a scalability problem, not a performance one.",
          detailed:
            "Performance is a snapshot metric: latency and throughput measured at a specific load level (e.g., 'p99 is 50ms at 100 RPS'). Scalability is about the *shape of the curve* as load increases: does p99 stay near 50ms at 1,000 RPS and 10,000 RPS, or does it explode because of lock contention, connection pool exhaustion, or O(n²) behavior somewhere? A system can be blazing fast in a demo (low load, warm cache, single user) and completely unscalable (falls over the moment concurrent users show up — e.g., a single SQLite file with global write locks). Conversely a system can have so-so per-request performance but scale beautifully because it's embarrassingly parallel and stateless. The interview-winning framing: 'performance answers how fast right now; scalability answers what happens to that answer as N grows.'",
        },
        keyPoints: [
          "Performance = a point-in-time measurement; scalability = how that measurement changes with load",
          "A fast system can be unscalable (global locks, single-writer DB, in-memory session affinity)",
          "A 'slower' system can scale better if it's stateless and horizontally distributable",
          "Always ask 'at what load?' when someone claims a system is fast",
        ],
        followUps: [
          "How would you load-test to expose a scalability problem that a quick benchmark would miss?",
          "What's the difference between scaling and 'scaling efficiently' (cost per request)?",
          "Give an example of a system that's fast but doesn't scale.",
        ],
        example:
          "A Flask app with SQLite can return a response in 5ms for one user — great performance. Put 500 concurrent users on it and the single-writer lock serializes every write; p99 latency goes from 5ms to 5 seconds. The performance number didn't change because the code got slower — it changed because the system doesn't scale.",
      },
      {
        id: "back-of-envelope-estimation",
        title: "How do you do back-of-the-envelope capacity estimation in an interview?",
        difficulty: "Medium",
        category: "scalability-performance",
        question:
          "Before designing a URL shortener, the interviewer asks you to estimate the storage and bandwidth needs. How do you approach that on the spot?",
        answer: {
          short:
            "Pick round numbers for scale (DAU, requests/user/day), derive RPS and storage with simple multiplication, and sanity-check against well-known reference points — precision doesn't matter, the *reasoning* does.",
          detailed:
            "The interviewer isn't grading your arithmetic — they're grading whether you can translate a vague requirement into numbers that drive design decisions. A repeatable method: (1) Assume a user base — e.g., '100M users, 10% daily active = 10M DAU.' (2) Derive request volume — 'each DAU creates 1 short URL/day → 10M writes/day ≈ 116 writes/sec average; reads are typically 100x writes for a URL shortener → ~11,600 reads/sec.' Always note peak vs average (peak is often 2-5x average). (3) Derive storage — 'each record is ~500 bytes (URL + metadata); 10M/day × 365 × 5 years × 500B ≈ 9TB' — and round generously. (4) Derive bandwidth — requests/sec × payload size gives you ingress/egress estimates that inform CDN/cache decisions. (5) Sanity check — '11K reads/sec is well within what a cache + a few read replicas handles; 9TB fits comfortably in a sharded relational store or even a single beefy instance with room to grow.' The punch line you want to land: these numbers directly justify *why* you'll propose a cache (read:write ratio is 100:1) and a particular storage engine (data size fits X).",
        },
        keyPoints: [
          "State your assumptions out loud — the interviewer cares about the reasoning chain, not the final digit",
          "Convert daily/monthly numbers to per-second — that's the unit your architecture actually has to handle",
          "Always distinguish average load from peak load (peak is commonly 2-5x average)",
          "Use the resulting numbers to *justify* design choices ('100:1 read:write ratio → we need a cache')",
          "Round aggressively to powers of ten — 86,400 seconds/day ≈ 10^5 is a useful shortcut",
        ],
        followUps: [
          "How would peak traffic during a marketing campaign change your numbers?",
          "How do these estimates change your choice between SQL and NoSQL?",
          "What numbers would make you reconsider a single-region deployment?",
        ],
        example:
          "A common interview shortcut: 1 million requests/day ≈ 11.6 requests/sec on average — derived from 10^6 / 86,400 ≈ 11.6. Memorizing that 'seconds per day ≈ 10^5' lets you convert any daily figure to RPS in your head almost instantly, which is exactly the kind of fluency interviewers are probing for.",
      },
    ],
  },
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "architecture-patterns",
    icon: "🏗️",
    title: "Architecture & Patterns",
    color: "#8b5cf6",
    problems: [
      {
        id: "monolith-vs-microservices",
        title: "Monolith vs microservices — how do you frame the trade-off?",
        difficulty: "Medium",
        category: "architecture-patterns",
        question:
          "A startup CTO asks whether they should build their new product as a monolith or microservices from day one. What do you tell them?",
        answer: {
          short:
            "Start with a well-modularized monolith unless you already have the org size and operational maturity microservices demand — the cost of microservices is paid in distributed-systems complexity, not in code structure.",
          detailed:
            "A monolith is one deployable unit: simple to develop, test, deploy, and debug (one stack trace, one transaction, no network between modules). Its weaknesses show up at scale: the whole thing scales together even if only one piece is hot, a bug in one module can take down the whole app, and large teams step on each other in one codebase/release train. Microservices split the system into independently deployable services: teams can move independently, each service scales on its own, and a failure can be contained — but you now pay for that with network latency between what used to be function calls, distributed transactions (sagas instead of ACID), service discovery, distributed tracing/observability, and a much heavier DevOps/infra bill. The senior answer: 'Start with a modular monolith — clean internal boundaries (domain modules, clear interfaces) — so that if/when you need to split it, you're extracting well-defined modules, not performing surgery on a ball of mud. Move to microservices when you have a *specific* pain (a hot module that needs independent scaling, a team that needs to ship independently) — not because it's trendy.' This is literally what Shopify, Segment, and (initially) Amazon did.",
        },
        keyPoints: [
          "Monolith: simple ops, ACID transactions, easy debugging — but couples scaling, deploys, and team velocity together",
          "Microservices: independent scaling/deploys/failure isolation — but you now own network latency, distributed transactions, service discovery, and observability",
          "'Start with a modular monolith, split when you feel real pain' is the senior-level answer — not 'microservices because Netflix does it'",
          "Conway's Law matters: your service boundaries will mirror your team boundaries whether you plan it or not",
        ],
        followUps: [
          "How would you migrate a monolith to microservices without downtime? (Strangler Fig pattern)",
          "How do distributed transactions work across microservices if you can't use 2PC?",
          "What's the 'distributed monolith' anti-pattern and how do you avoid it?",
        ],
        example:
          "Segment famously went from microservices back to a monolith in 2018 — they had ~140 services maintained by 6 engineers, and the operational overhead (each service needing its own queue, retries, monitoring) was crushing a small team. They consolidated into one service and cut their operational burden dramatically — a textbook case of microservices applied before the org was ready for the cost.",
      },
      {
        id: "event-driven-architecture",
        title: "When does event-driven architecture actually pay off?",
        difficulty: "Medium",
        category: "architecture-patterns",
        question:
          "Your checkout service currently calls inventory, shipping, and notification services synchronously. What problems does that create, and how would event-driven architecture help?",
        answer: {
          short:
            "Synchronous chains couple availability and latency across services — one slow/down dependency takes the whole flow with it. Publishing events decouples the producer from consumers in time, deployment, and failure domain.",
          detailed:
            "In a synchronous chain, checkout → inventory → shipping → notification means checkout's latency is the *sum* of all four, and its availability is the *product* of all four (if any one is down, checkout fails). Event-driven architecture flips this: checkout publishes an `OrderPlaced` event to a broker (Kafka/SNS/EventBridge) and returns immediately; inventory, shipping, and notification each subscribe and react independently, on their own schedule, with their own retry/backoff. Benefits: (1) temporal decoupling — consumers can be down and catch up later without checkout even noticing; (2) it's trivial to add a new consumer (e.g., analytics) without touching checkout's code; (3) natural buffering absorbs traffic spikes (the queue smooths bursts that would otherwise overload downstream services). The costs are real too: you trade strong consistency for eventual consistency (the user sees 'order placed' before shipping has actually been scheduled), debugging becomes harder (a single user action is now scattered across asynchronous logs that need correlation IDs and distributed tracing), and you must design for at-least-once delivery (idempotent consumers, dedup keys) because brokers can redeliver.",
        },
        keyPoints: [
          "Sync chains couple latency (sum) and availability (product) across every hop — one slow link slows everything",
          "Events decouple producer and consumer in time, deployment cadence, and failure domain",
          "Trade-off: you give up strong consistency for resilience and independent scaling — eventual consistency becomes a UX concern, not just a backend detail",
          "At-least-once delivery is the default for brokers — consumers must be idempotent (dedup keys, upserts) or they'll double-process",
        ],
        followUps: [
          "How do you guarantee exactly-once processing on top of an at-least-once broker?",
          "How would you debug a single user's order across five asynchronous services?",
          "What's the outbox pattern and why do you need it here?",
        ],
        example:
          "Uber's trip lifecycle is event-driven: 'trip requested', 'driver matched', 'trip started', 'trip completed' are each events that fan out to pricing, ETA, notifications, and analytics independently — none of which block the rider from seeing 'driver matched' the instant it happens, even if the analytics pipeline is backlogged by minutes.",
      },
      {
        id: "api-gateway-vs-bff",
        title: "API Gateway vs Backend-for-Frontend — what's the actual difference?",
        difficulty: "Medium",
        category: "architecture-patterns",
        question:
          "Your mobile app and web app both talk to a sprawl of 15 microservices and the client teams are complaining about chattiness and inconsistent payloads. What would you propose?",
        answer: {
          short:
            "An API Gateway is a single shared entry point handling cross-cutting concerns (auth, rate limiting, routing); a BFF is a *per-client* aggregation layer shaped around what each frontend specifically needs. Most real systems eventually need both.",
          detailed:
            "An API Gateway sits in front of all your services and centralizes concerns every request needs regardless of client: authentication/authorization, rate limiting, TLS termination, request routing, and basic request/response transformation. It's a single, generic front door. A Backend-for-Frontend goes further: it's a *dedicated* aggregation/orchestration layer per client type (one BFF for mobile, one for web, maybe one for partner APIs) that calls the underlying microservices and shapes the response exactly the way that client wants it — fewer round trips, payloads tailored to screen real estate and bandwidth (mobile gets a slimmed-down response; web gets the full one). The chattiness problem you're describing — client making 6 calls to render one screen — is *exactly* what a BFF solves: it does the fan-out server-side (where the network is fast) and returns one composed response. The gateway alone won't fix that because it's generic by design — it doesn't know that 'the mobile home screen needs user+orders+recommendations in one shot.' Layering: client → gateway (auth, rate limit, routing) → BFF (per-client composition) → microservices.",
        },
        keyPoints: [
          "Gateway = shared, generic front door (auth, rate limiting, routing) — same for every client",
          "BFF = per-client aggregation/orchestration shaped to that client's exact needs — solves chattiness and over-fetching",
          "They're complementary, not competing — gateway handles cross-cutting concerns, BFF handles client-specific composition",
          "Watch for the anti-pattern: business logic leaking into the BFF, turning it into a second monolith",
        ],
        followUps: [
          "How do you avoid duplicating logic across multiple BFFs?",
          "Where would GraphQL fit instead of (or alongside) a BFF?",
          "How does a gateway handle a downstream service timing out?",
        ],
        example:
          "Netflix popularized the BFF pattern: each device family (TV, mobile, web, game console) has wildly different rendering capabilities and bandwidth, so each gets its own BFF that composes the same underlying catalog/recommendation services into a payload shaped for that surface — instead of one bloated 'do everything for everyone' API.",
      },
      {
        id: "strangler-fig-migration",
        title: "How would you migrate a legacy monolith to microservices without downtime?",
        difficulty: "Hard",
        category: "architecture-patterns",
        question:
          "You've inherited a 10-year-old monolith that the business depends on 24/7. Leadership wants to move to microservices. How do you do this without a risky big-bang rewrite?",
        answer: {
          short:
            "Use the Strangler Fig pattern: put a routing facade in front of the monolith, peel off one capability at a time into a new service, and incrementally redirect traffic until the monolith does nothing — never a single cutover.",
          detailed:
            "A full rewrite ('big bang') is one of the riskiest moves in software — Netscape's multi-year rewrite famously let Internet Explorer eat their market share. The Strangler Fig pattern (named after the vine that slowly envelops a tree) avoids this: (1) Put a thin routing layer / facade (often the API gateway) in front of the monolith so all traffic flows through a single, controllable point. (2) Pick the *least risky, most isolated* capability first (e.g., 'send email notifications' rather than 'process payments') and rebuild it as a standalone service with its own datastore. (3) Update the facade to route that capability's traffic to the new service while everything else still goes to the monolith — the monolith and the new service coexist. (4) Use change-data-capture or dual-writes (carefully — see the dual-write consistency trap) to keep data in sync during the transition window. (5) Once the new service is proven in production, remove that code path from the monolith. (6) Repeat for the next capability. Over months or years, the monolith 'shrinks' until it's an empty husk you can retire. The key discipline: each step is independently shippable and reversible — if a new service misbehaves, flip the facade's routing back to the monolith instantly.",
        },
        keyPoints: [
          "Never do a big-bang rewrite on a business-critical system — the Netscape rewrite is the canonical cautionary tale",
          "A routing facade (gateway) is the lever that lets you redirect traffic incrementally and revert instantly",
          "Extract the lowest-risk, most-isolated capability first to build confidence and muscle memory",
          "Data synchronization during the transition (CDC / dual writes) is usually the hardest part — harder than the code split",
          "Each migration step should be independently shippable AND reversible — that's what makes it 'safe'",
        ],
        followUps: [
          "How do you keep the monolith's database and the new service's database consistent during the transition?",
          "How do you decide the order in which to extract services?",
          "What telemetry would tell you it's safe to fully cut over a capability?",
        ],
        example:
          "Shopify used a 'modular monolith → selective extraction' approach for their core platform: rather than ripping everything apart, they enforced strict module boundaries inside the Rails monolith first (so code was already organized like services), then extracted only the pieces that had genuine independent-scaling needs (like Flash Sales infrastructure) — keeping the bulk of the system as a well-structured monolith.",
      },
      {
        id: "common-architectural-patterns",
        title: "What architectural patterns should I know, and how do I pick between them?",
        difficulty: "Medium",
        category: "architecture-patterns",
        question:
          "Beyond monolith vs microservices, what other architectural patterns come up in interviews — layered, event-driven, CQRS, microkernel — and how do you know which one fits a given problem?",
        answer: {
          short:
            "Each pattern is a different answer to 'where do I put complexity?' — layered hides it in horizontal slices, event-driven spreads it across time, CQRS splits it by read/write shape, microkernel isolates it into plugins. Pick based on which axis of change your system needs to absorb.",
          detailed:
            "Layered (n-tier): presentation → business logic → data access, each layer only talks to the one below. Simple to understand and test in isolation; the classic default for CRUD apps. Risk: 'sinkhole anti-pattern' where layers just pass data through with no added value. Event-driven: producers emit events, consumers react asynchronously (covered above) — fits systems that need to scale independently and tolerate eventual consistency. CQRS (Command Query Responsibility Segregation): split the *write model* (optimized for consistency/validation) from the *read model* (optimized for fast, denormalized queries) — often paired with event sourcing. Fits systems where read and write patterns are wildly different (e.g., a write is one order, but the read is 50 different dashboards slicing that data differently). Microkernel (plug-in architecture): a minimal core with pluggable extensions — fits products that need deep customization per customer (IDEs, browsers with extensions, Salesforce-style platforms). The interview move isn't reciting definitions — it's mapping the *forces* in the prompt ('reads and writes have very different shapes' → CQRS; 'we need third parties to extend this' → microkernel; 'simple CRUD, small team' → layered) to the pattern that resolves them.",
        },
        keyPoints: [
          "Layered/n-tier: simple, testable, the right default for straightforward CRUD — watch for the 'sinkhole' anti-pattern",
          "CQRS: split read/write models when their shapes and scaling needs diverge sharply — usually paired with event sourcing",
          "Microkernel/plugin: minimal core + extensions, for products that must be deeply customizable by others",
          "Don't recite definitions — map the *forces* in the problem statement to the pattern that resolves them",
        ],
        followUps: [
          "When would you combine CQRS with event sourcing, and what does that buy you?",
          "What's the downside of CQRS for a simple CRUD app?",
          "How do plugin architectures handle versioning and security sandboxing?",
        ],
        example:
          "LinkedIn's news feed uses a CQRS-like split: writes (a new post) go through a validation/storage path, while reads are served from heavily denormalized, pre-ranked feed stores optimized purely for fast retrieval — the two paths are scaled, deployed, and even staffed completely independently because their performance characteristics are nothing alike.",
      },
    ],
  },
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "availability-consistency",
    icon: "🔄",
    title: "Availability & Consistency",
    color: "#06b6d4",
    problems: [
      {
        id: "cap-theorem",
        title: "Explain CAP theorem like you would to a teammate, with a real example",
        difficulty: "Medium",
        category: "availability-consistency",
        question:
          "What does CAP theorem actually say, and why do people argue that 'CP vs AP' is an oversimplification?",
        answer: {
          short:
            "CAP says that during a network partition, you must choose between Consistency (every read sees the latest write) and Availability (every request gets a response) — you can't have both. Outside of a partition, the real trade-off is consistency vs latency, which is what PACELC captures.",
          detailed:
            "CAP theorem (Brewer's theorem): in a distributed system, you can only guarantee two of Consistency, Availability, and Partition tolerance at once. But partition tolerance isn't really optional — networks *will* partition, so in practice the choice is CP (stay consistent, refuse requests you can't safely answer) vs AP (stay available, risk serving stale data) *during* a partition. The oversimplification critique: CAP only describes behavior *during* a network partition, which is a relatively rare event. The more useful everyday question is 'when there's no partition, do you trade consistency for lower latency?' — which is exactly what PACELC adds: 'else, Latency vs Consistency.' So a system is fully described as PA/EL (available during partitions, low-latency normally — e.g., Cassandra, DynamoDB) or PC/EC (consistent during partitions, willing to pay latency for it normally — e.g., traditional RDBMS with synchronous replication, HBase). The interview-winning move is naming PACELC unprompted — it signals you know CAP is necessary-but-incomplete.",
        },
        keyPoints: [
          "CAP only binds during a network partition — pick C (refuse to answer if you can't be sure) or A (answer anyway, possibly with stale data)",
          "Partition tolerance is not optional in a real distributed system — so CAP really reduces to 'CP or AP when partitioned'",
          "PACELC extends CAP: even with no partition, you trade Latency vs Consistency — this is the trade-off you face *most* of the time",
          "Classify real systems as PA/EL (Cassandra, DynamoDB) or PC/EC (traditional RDBMS, HBase, Spanner-ish systems) to show depth",
        ],
        followUps: [
          "Where does Google Spanner fit on the PACELC spectrum, and how does it cheat the trade-off?",
          "Give an example of a real outage caused by choosing AP when CP was needed (or vice versa).",
          "How do you design a system that behaves CP for some operations and AP for others?",
        ],
        example:
          "DynamoDB defaults to eventually-consistent reads (AP-leaning, low latency, might return slightly stale data) but offers strongly-consistent reads as an opt-in (pay more latency for correctness) — letting *you* pick the PACELC trade-off per query rather than baking one choice into the whole system.",
      },
      {
        id: "consistency-patterns",
        title: "Strong vs eventual vs causal consistency — when does each make sense?",
        difficulty: "Medium",
        category: "availability-consistency",
        question:
          "A user updates their profile picture and a friend says 'I still see your old photo.' Is that a bug? How do you reason about which consistency model a feature needs?",
        answer: {
          short:
            "Not necessarily a bug — it depends on what consistency guarantee that feature promised. Strong consistency guarantees every reader sees the latest write immediately; eventual consistency guarantees they'll *converge* eventually; causal consistency guarantees that causally-related events are seen in the right order. Match the model to the feature's actual requirement, not to a blanket policy.",
          detailed:
            "Strong consistency: every read reflects the most recent write, system-wide, the instant it commits — required for things like account balances, inventory counts, and seat reservations where stale reads cause real-world harm (double-booking, overdraft). It costs latency (often a quorum round-trip) and can reduce availability during partitions. Eventual consistency: writes propagate asynchronously; readers may see stale data for a window, but all replicas *converge* to the same value once propagation finishes — perfectly fine for profile pictures, like counts, view counts, search indexes. It buys you low latency and high availability. Causal consistency sits in between: it doesn't guarantee everyone sees updates instantly, but it *does* guarantee that if event B happened because of event A, no one ever sees B without having seen A first — critical for things like comment threads (you should never see a reply before the comment it replies to) or chat apps. The skill being tested is: can you look at a feature and say 'this needs strong / this can tolerate eventual / this needs causal ordering specifically' instead of defaulting to 'just make everything strongly consistent' (which kills your availability and latency).",
        },
        keyPoints: [
          "Strong consistency = always-fresh reads, at the cost of latency/availability — reserve it for money, inventory, anything where staleness causes real harm",
          "Eventual consistency = converges over time, cheap and available — perfect for likes, views, profile data, search indexes",
          "Causal consistency = preserves cause-and-effect ordering without requiring global freshness — the right fit for comment threads, chat, collaborative editing",
          "The senior move is matching the model to the feature's actual tolerance for staleness — not picking one model for the whole system",
        ],
        followUps: [
          "How would you implement read-your-own-writes consistency on top of an eventually-consistent store?",
          "What's a vector clock and how does it help with causal consistency?",
          "How do you explain eventual consistency to a non-technical stakeholder who's worried about it?",
        ],
        example:
          "Amazon's shopping cart famously used an eventually-consistent (AP) store — if you added an item on your phone and it didn't immediately show on your laptop, the system would *merge* both versions rather than lose either addition. They explicitly chose 'never lose a cart item' (availability) over 'always show the perfectly current cart' (strong consistency), because losing an add-to-cart costs more revenue than a few seconds of staleness.",
      },
      {
        id: "availability-patterns",
        title: "What patterns actually move the needle on availability — beyond 'add more servers'?",
        difficulty: "Medium",
        category: "availability-consistency",
        question:
          "Your service is at 99.9% availability and leadership wants 99.99% ('one more nine'). What concrete patterns get you there?",
        answer: {
          short:
            "Going from 99.9% to 99.99% means cutting allowed downtime from ~8.7 hours/year to ~52 minutes/year — that requires eliminating single points of failure through redundancy (active-active or active-passive failover) and designing for graceful degradation, not just 'more hardware.'",
          detailed:
            "Two canonical availability patterns: (1) Failover — active-passive: a standby replica takes over when the primary fails (simple, but the failover itself causes a brief outage and risks losing in-flight data); active-active: multiple nodes serve traffic simultaneously, so losing one doesn't interrupt service at all (harder — needs conflict resolution and careful data replication, but no failover gap). (2) Replication — master-slave (one writer, many readers — simple, but the master is still a single point of failure for writes) vs master-master (multiple writable nodes — eliminates that SPOF but opens the door to write conflicts that need resolution, e.g., last-write-wins or CRDTs). Beyond these two big levers: health checks + automated failover (detect failure in seconds, not minutes of paging a human), redundancy at *every* layer (load balancers, DNS, even across availability zones/regions — a redundant app tier behind a single-AZ database is still a SPOF), graceful degradation (serve a cached/stale response or a reduced feature set instead of a hard error when a dependency is down), and circuit breakers (stop hammering a failing dependency so it can recover, and so your own thread pool doesn't exhaust). The 'nines' framing matters in interviews: each additional nine is roughly an order of magnitude harder and more expensive — know the napkin math (99.9% ≈ 8.7 hrs/yr down, 99.99% ≈ 52 min/yr, 99.999% ≈ 5 min/yr).",
        },
        keyPoints: [
          "Memorize the 'nines' table — it's the fastest way to show you understand what the ask actually costs (99.9%≈8.7h/yr, 99.99%≈52min/yr, 99.999%≈5min/yr)",
          "Active-active eliminates failover gaps entirely but requires conflict resolution; active-passive is simpler but has a recovery window",
          "Redundancy must exist at *every* layer — DNS, load balancer, app, cache, database, even the AZ/region — one weak link caps the whole chain",
          "Graceful degradation (serve something instead of nothing) often buys more perceived availability than raw uptime numbers do",
        ],
        followUps: [
          "How do you test that your failover actually works before you need it in production?",
          "What's 'split-brain' in an active-active setup and how do you prevent it?",
          "How would you design graceful degradation for a product page if the recommendations service is down?",
        ],
        example:
          "Netflix's Chaos Monkey randomly kills production instances *during business hours* specifically to force every team to build for failure as a default, not an edge case — their philosophy is that the only way to trust your redundancy is to make failure routine and boring rather than rare and terrifying.",
      },
      {
        id: "replication-strategies",
        title: "Master-slave vs master-master replication — what breaks in each?",
        difficulty: "Medium",
        category: "availability-consistency",
        question:
          "You're choosing a replication strategy for a multi-region database. What are the failure modes of each option, and how would you pick?",
        answer: {
          short:
            "Master-slave is simple and consistent for writes but the master is a SPOF and failover risks data loss; master-master removes that SPOF but introduces write conflicts that someone — the database or your application — must resolve.",
          detailed:
            "Master-slave (single-leader): all writes go to one master; it replicates (sync or async) to read replicas. Sync replication guarantees no data loss on failover but adds write latency (you wait for replicas to ack); async replication is fast but a master crash can lose the last few un-replicated writes. Either way, the master remains a single point of failure for writes — promoting a replica to master takes time (detection + election + DNS/connection updates) during which writes are unavailable. Master-master (multi-leader): multiple nodes accept writes and replicate to each other — no SPOF for writes, lower write latency for geographically distributed users (write to your nearest node). The cost: concurrent writes to the same record on different masters *will* conflict (e.g., two regions both update the same user's email simultaneously). Resolution strategies include last-write-wins (simple, but silently discards one update), version vectors (detect conflicts, surface them to the application), and CRDTs (conflict-free replicated data types — mathematically guaranteed to merge without conflict, but limited to certain data shapes like counters and sets). The interview answer should name the failure mode of *each* choice and tie the pick to the actual access pattern — 'if writes are naturally partitioned by region (each user's data is written from one region), master-master with regional ownership avoids most conflicts entirely.'",
        },
        keyPoints: [
          "Master-slave: simple, consistent, but the master is a SPOF for writes and failover has a real recovery window",
          "Master-master: no write SPOF and lower latency for distributed writers, but introduces conflicts that must be resolved (LWW, version vectors, CRDTs)",
          "Sync replication = safer but slower; async replication = faster but risks losing the last few writes on a crash",
          "Best answer ties the choice to the *access pattern* — e.g., regionally-partitioned ownership sidesteps most multi-master conflicts",
        ],
        followUps: [
          "What is a CRDT and what kinds of data can/can't be modeled as one?",
          "How does Postgres streaming replication differ from logical replication?",
          "How would you detect and alert on replication lag before it causes user-visible issues?",
        ],
        example:
          "MySQL Group Replication and CockroachDB both support multi-master setups, but CockroachDB sidesteps the conflict problem by using a Raft-based consensus protocol per data range — there's always exactly one leaseholder for a given range at a time, giving you the write-availability benefits of distribution without classic multi-master conflict resolution.",
      },
      {
        id: "isolation-levels",
        title: "What are database isolation levels, and which one would you actually pick?",
        difficulty: "Hard",
        category: "availability-consistency",
        question:
          "Explain Read Uncommitted, Read Committed, Repeatable Read, and Serializable — and tell me which anomalies each one prevents.",
        answer: {
          short:
            "Each isolation level trades correctness guarantees for concurrency/throughput by allowing or preventing specific anomalies — dirty reads, non-repeatable reads, and phantom reads. Serializable prevents all three but can devastate throughput; Read Committed is the pragmatic default for most OLTP workloads.",
          detailed:
            "Read Uncommitted: transactions can see other transactions' *uncommitted* changes — allows dirty reads (you might read data that gets rolled back a moment later, i.e., data that never 'really' existed). Almost never used in practice. Read Committed (Postgres/Oracle default): you only ever see committed data, but if you read the same row twice in one transaction, it might have changed in between (non-repeatable read) because each statement takes a fresh snapshot. Repeatable Read (MySQL/InnoDB default): your transaction sees a consistent snapshot for its whole duration — re-reading the same row always returns the same value — but new rows matching your filter can appear between queries (phantom reads), e.g., a range query returns 10 rows, then 12 on a re-run because someone inserted two more. Serializable: the strictest — transactions behave *as if* they ran one at a time, sequentially; prevents dirty reads, non-repeatable reads, and phantoms. The cost is real: it requires either heavy locking (which serializes contended workloads and tanks throughput) or optimistic concurrency control with abort-and-retry (which wastes work under contention). The practical answer: 'Read Committed is the right default for most OLTP — it's fast and prevents the worst anomaly (dirty reads). I reach for Serializable (or explicit row locks / SELECT FOR UPDATE) only for the specific operations where a race genuinely causes business harm — like decrementing inventory or transferring money — not for the whole system.'",
        },
        keyPoints: [
          "Each level is defined by which anomalies it allows: dirty read → non-repeatable read → phantom read, in increasing strictness",
          "Read Committed (Postgres default) is the pragmatic default for most OLTP — fast, and prevents the worst anomaly (dirty reads)",
          "Serializable prevents everything but can crater throughput — apply it surgically (specific transactions), not globally",
          "SELECT FOR UPDATE / explicit row locks often solve the *specific* race you're worried about more cheaply than raising the global isolation level",
        ],
        followUps: [
          "How does Postgres implement Repeatable Read using MVCC instead of locking?",
          "What's a 'write skew' anomaly and which isolation level prevents it?",
          "How would you prevent two requests from both successfully booking the last seat on a flight?",
        ],
        example:
          "A real production bug pattern: an e-commerce service running at Read Committed reads `stock = 1`, then later in the same transaction re-reads it (now `stock = 0` because another request bought it), and ships two orders for the last item. The fix wasn't raising isolation globally (too slow) — it was a targeted `SELECT ... FOR UPDATE` on the inventory row for that specific decrement-and-check operation.",
      },
    ],
  },
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "databases-storage",
    icon: "🗄️",
    title: "Databases & Storage",
    color: "#22c55e",
    problems: [
      {
        id: "sql-vs-nosql",
        title: "SQL vs NoSQL — how do you make the call without it being a religious debate?",
        difficulty: "Easy",
        category: "databases-storage",
        question:
          "When would you reach for a relational database versus a NoSQL store, and what's wrong with the answer 'NoSQL scales better'?",
        answer: {
          short:
            "'NoSQL scales better' is a myth — modern Postgres/MySQL scale to massive sizes with the right sharding strategy. The real decision driver is your data's shape, your consistency needs, and your access patterns — not raw scalability.",
          detailed:
            "Relational databases give you a fixed schema, ACID transactions, joins, and a mature query language — ideal when your data has clear relationships that you need to query flexibly and consistently (orders ↔ customers ↔ payments; anything where 'this number must always add up' matters). NoSQL is an umbrella for very different things: document stores (MongoDB — flexible nested schemas, good for content/catalogs), key-value stores (Redis/DynamoDB — blazing-fast lookups by key, great for sessions/caches), wide-column stores (Cassandra/HBase — write-heavy, time-series, massive scale with eventual consistency), and graph databases (Neo4j — relationship-heavy data like social graphs or fraud networks). The honest framing: relational databases *can* scale (sharding, read replicas, Vitess/Citus) — the difference is that many NoSQL stores are *designed scale-out from day one* and trade away joins/transactions/strict schema to get there more easily operationally. So the real questions are: 'does my data have relationships I need to query across?' (→ relational), 'is my access pattern simple key lookups at extreme scale?' (→ key-value/wide-column), 'does my schema change shape per record?' (→ document), 'am I querying relationships themselves (friends-of-friends)?' (→ graph). Many real systems are polyglot — Postgres for orders, Redis for sessions, Elasticsearch for search — picked per *workload*, not as a single system-wide religion.",
        },
        keyPoints: [
          "'NoSQL scales better' is largely a myth — well-sharded Postgres/MySQL handle enormous scale; the real difference is what you give up to get there easily",
          "Pick based on data shape and access pattern: relationships/joins → relational; flexible nested docs → document; pure key lookups at scale → key-value/wide-column; relationship traversal → graph",
          "ACID transactions are relational DBs' superpower — don't give them up for a 'NoSQL is modern' vibe when you actually need them",
          "Polyglot persistence (different stores for different workloads) is normal and often the *right* senior answer",
        ],
        followUps: [
          "How would you model a social graph in a relational database, and why might that get painful at scale?",
          "What does 'schema-on-read vs schema-on-write' mean and which trade-offs come with each?",
          "When would you use both — e.g., Postgres as source of truth and Elasticsearch for search?",
        ],
        example:
          "Discord stores billions of chat messages — they started on MongoDB, then Cassandra, and eventually moved to ScyllaDB specifically because their access pattern (append-heavy, partitioned by channel, simple key lookups) matched a wide-column store far better than a relational one — a textbook 'pick based on access pattern, not hype' migration story they've written about publicly.",
      },
      {
        id: "sharding-partitioning",
        title: "How would you shard a database that's outgrown a single node?",
        difficulty: "Hard",
        category: "databases-storage",
        question:
          "Your `orders` table has 2 billion rows and queries are getting slow even with indexes and read replicas. Walk me through how you'd shard it.",
        answer: {
          short:
            "Pick a shard key that matches your dominant query pattern (so most queries hit one shard), choose a partitioning scheme (range, hash, or directory-based) that avoids hotspots, and accept that cross-shard queries and joins now require application-level orchestration.",
          detailed:
            "First, exhaust simpler options — better indexes, query optimization, read replicas, caching, archiving cold data — sharding is a one-way door that adds massive operational complexity, so it should be the *last* resort, not the first idea. When you do need it: (1) Pick a shard key — the column you'll partition by. The best key is the one most queries already filter by (e.g., `customer_id` if 90% of queries are 'get this customer's orders') — that makes most queries single-shard. A bad key (e.g., `created_at`) forces most queries to fan out across every shard. (2) Choose a partitioning scheme: range-based (shard A = IDs 1-1M, shard B = 1M-2M — simple, but creates hotspots when new data always lands on the newest shard); hash-based (hash(key) % N — spreads load evenly, but makes range queries and resharding painful); directory-based (a lookup service maps keys to shards — flexible and supports resharding, but the directory itself becomes a critical dependency). (3) Accept the new costs: cross-shard joins don't exist anymore — you either denormalize data so joins aren't needed, or do the join in the application by querying multiple shards and merging; cross-shard transactions need sagas or two-phase commit; resharding (adding shard N+1) is operationally hard — consistent hashing minimizes how much data must move when you do. The interview-winning instinct is naming *what breaks* (joins, transactions, resharding) just as confidently as naming the scheme.",
        },
        keyPoints: [
          "Sharding is a last resort — exhaust indexing, caching, replicas, and archiving first; it's a one-way door operationally",
          "Shard key choice is the single most important decision — pick the column your dominant query already filters by",
          "Range sharding is simple but hotspot-prone; hash sharding balances load but kills range queries; directory-based is flexible but adds a dependency",
          "Naming what *breaks* after sharding (cross-shard joins, transactions, resharding pain) shows more depth than naming the scheme itself",
        ],
        followUps: [
          "What is consistent hashing and how does it minimize data movement when resharding?",
          "How would you run an analytics query that needs to aggregate across all shards?",
          "How do you generate globally-unique IDs across shards without a single bottleneck?",
        ],
        example:
          "Instagram famously shards Postgres by user ID using a custom scheme that encodes the shard ID *into* the generated post ID itself (alongside a timestamp and a sequence number) — so given any post ID, they can compute which shard holds it without a directory lookup, turning 'which shard?' from a runtime query into pure arithmetic.",
      },
      {
        id: "caching-strategies",
        title: "Cache-aside vs write-through vs write-behind — which would you use where?",
        difficulty: "Medium",
        category: "databases-storage",
        question:
          "You're adding a cache in front of a product catalog database. Which caching strategy do you pick, and what could go wrong with it?",
        answer: {
          short:
            "Cache-aside is the most common default (app manages cache + DB explicitly); write-through trades write latency for read consistency; write-behind trades durability risk for write speed. Pick based on whether your workload is read-heavy, consistency-sensitive, or write-heavy.",
          detailed:
            "Cache-aside (lazy loading): app checks the cache first; on a miss, reads from the DB and populates the cache; writes go to the DB and either invalidate or update the cache entry. Most common pattern — simple, resilient to cache failures (just falls through to the DB), but has a window where cache and DB can disagree, and a 'thundering herd' risk where a popular key's expiry causes many requests to simultaneously hit the DB. Write-through: every write goes to the cache *and* the DB synchronously — readers always see fresh data, but writes are slower (two systems must ack) and you're caching data that might never be read (wasted memory). Write-behind (write-back): writes go to the cache immediately and are asynchronously flushed to the DB later — very fast writes, but a cache crash before the flush means real data loss, so it's only appropriate when some loss is tolerable (metrics, analytics counters) or the cache itself is durable (Redis with AOF). For a product catalog specifically: cache-aside with a TTL is the right default — reads vastly outnumber writes, staleness for a few seconds/minutes is harmless for product descriptions, and a cache outage degrades gracefully (falls through to the DB) rather than catastrophically.",
        },
        keyPoints: [
          "Cache-aside: app-managed, resilient to cache failure, most common default — but has a staleness window and thundering-herd risk",
          "Write-through: always-fresh reads, slower writes, risks caching data nobody reads — fits read-heavy + consistency-sensitive workloads",
          "Write-behind: fastest writes, real data-loss risk on crash — only for tolerant or durable-cache scenarios",
          "Always pair caching with an eviction policy (LRU/LFU/TTL) and a plan for the thundering-herd problem (request coalescing, jittered TTLs, locks)",
        ],
        followUps: [
          "How do you prevent a thundering herd when a hot cache key expires?",
          "How would you keep a Redis cache in sync with the database on updates?",
          "What's cache stampede and how does request coalescing solve it?",
        ],
        example:
          "Facebook's TAO (their social graph cache layer in front of MySQL) uses cache-aside with a twist: writes go through the cache tier, which then asynchronously propagates to the database and other regions — explicitly accepting a small staleness window because, at their scale, requiring every read to hit MySQL directly would be operationally impossible.",
      },
      {
        id: "relational-vs-document-modeling",
        title: "How do you decide between normalizing and denormalizing your schema?",
        difficulty: "Medium",
        category: "databases-storage",
        question:
          "You're modeling a blog platform — posts, authors, comments, tags. Would you normalize this fully, or denormalize parts of it? How do you decide?",
        answer: {
          short:
            "Normalize to protect write-side correctness (no duplicated data to get out of sync); denormalize specific read paths once you've measured that joins are the actual bottleneck — and always denormalize deliberately, not by accident.",
          detailed:
            "Normalization (splitting data into related tables, e.g., `posts`, `authors`, `comments`, `tags`, `post_tags`) eliminates duplication — an author's name lives in exactly one row, so updating it updates it everywhere instantly, and you can never have it disagree with itself. The cost is that reading a 'complete' view (a post with its author, comments, and tags) requires joins across 4-5 tables, which gets expensive at scale. Denormalization (duplicating data to avoid joins, e.g., storing `author_name` directly on the `posts` row, or pre-computing a `comment_count`) makes specific reads dramatically faster and simpler — at the cost of needing to keep duplicates in sync on every write (if an author changes their display name, you now must update every post they've written, or accept staleness). The senior framing: start normalized (correctness is cheap to get right early, expensive to retrofit later); denormalize *specific, measured* hot paths once you can show that joins are the actual bottleneck — and do it consciously, with a clear plan for keeping the duplicated data in sync (background jobs, event-driven updates, or accepting bounded staleness). Document databases push this further by *encouraging* denormalization/embedding by default — which is great for read performance on self-contained documents, but painful the moment you need to query or update the embedded data independently.",
        },
        keyPoints: [
          "Normalize first — it makes write-side correctness close to free; you only pay at read time (joins)",
          "Denormalize deliberately and selectively — for *measured* hot read paths, with an explicit plan for keeping duplicates in sync",
          "Every denormalized field is a promise you must keep on every future write — that promise has an ongoing maintenance cost",
          "Document databases bias toward embedding by default — great for self-contained reads, painful for independent updates to embedded data",
        ],
        followUps: [
          "How would you keep a denormalized `comment_count` field accurate under concurrent writes?",
          "What's the difference between embedding and referencing in a document database, and when do you pick each?",
          "How would materialized views help here, and what do they cost you?",
        ],
        example:
          "Reddit denormalizes vote/comment counts directly onto post records (rather than running `COUNT(*)` over millions of comment rows on every page view) and reconciles them with periodic background jobs — explicitly trading 'counts might be off by a few for a moment' for 'the front page loads in milliseconds.'",
      },
    ],
  },
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "communication-messaging",
    icon: "📨",
    title: "Communication & Messaging",
    color: "#f59e0b",
    problems: [
      {
        id: "rest-vs-graphql-vs-grpc",
        title: "REST vs GraphQL vs gRPC — how do you pick for a given API?",
        difficulty: "Medium",
        category: "communication-messaging",
        question:
          "You're designing the API layer for a new product with a web client, a mobile app, and internal service-to-service calls. Would you use REST, GraphQL, or gRPC — and would you mix them?",
        answer: {
          short:
            "Mixing is usually correct: gRPC for internal service-to-service calls (performance, strong typing, streaming), GraphQL for client-facing APIs with diverse, evolving data needs (mobile vs web), and REST where simplicity, cacheability, and broad tooling support matter most.",
          detailed:
            "REST: resource-oriented over HTTP, leans on standard verbs/status codes, is naturally cacheable (GET is cacheable by CDNs/browsers for free), has the widest tooling and team familiarity — but suffers from over-fetching (client gets the whole resource even if it needs 2 fields) and under-fetching (client must make N follow-up calls to assemble a view), and versioning tends to be clunky (`/v1/`, `/v2/`). GraphQL: client specifies exactly the fields it needs in a single query — eliminates over/under-fetching and is brilliant when different clients (mobile vs web vs partner) need different shapes from the same underlying data. The costs: caching is much harder (no more free GET caching — everything is a POST to one endpoint), the N+1 query problem moves to the resolver layer (solved with DataLoader-style batching), and a poorly-designed schema lets clients construct expensive queries that hurt your backend (needs query cost analysis/depth limiting). gRPC: binary protocol over HTTP/2, code-generated strongly-typed clients/servers from `.proto` files, supports streaming (unary, server-streaming, client-streaming, bidirectional) — extremely fast and efficient, ideal for internal service-to-service calls where both ends are your own code. The costs: not browser-native (needs gRPC-Web + a proxy), harder to debug than JSON-over-HTTP (binary wire format, needs `grpcurl`), and the tight coupling via generated code means schema changes ripple across services. The senior answer names all three and where each actually wins — not a single winner.",
        },
        keyPoints: [
          "REST: simple, cacheable, universally understood — but prone to over/under-fetching and clunky versioning",
          "GraphQL: client-shaped responses eliminate over/under-fetching — at the cost of caching, N+1-at-the-resolver, and query-cost governance",
          "gRPC: fast, strongly-typed, streaming-capable — best for internal service-to-service calls; weak on browser support and debuggability",
          "Real systems mix all three by *boundary* — gRPC internally, GraphQL/REST at the client-facing edge — rather than picking one for everything",
        ],
        followUps: [
          "How do you solve the N+1 problem in a GraphQL resolver?",
          "How would you add caching to a GraphQL API given that everything is a POST?",
          "When would you choose gRPC streaming over a message queue for service-to-service communication?",
        ],
        example:
          "Netflix uses gRPC extensively for internal service-to-service calls (low latency, strong typing across hundreds of services in different languages) but exposes GraphQL-like federated APIs (via GraphQL Federation / their Falcor predecessor) at the client edge — because mobile, TV, and web clients each need a different shape of the same catalog data.",
      },
      {
        id: "message-queues",
        title: "When would you reach for a message queue, and how do you pick between Kafka, RabbitMQ, and SQS?",
        difficulty: "Medium",
        category: "communication-messaging",
        question:
          "Your team wants to decouple order placement from inventory updates, email sending, and analytics. Why use a queue at all, and which one would you pick?",
        answer: {
          short:
            "Queues decouple producers from consumers in time and failure domain, smooth traffic spikes, and enable retries — pick Kafka for high-throughput event streams with replay, RabbitMQ for complex routing and per-message guarantees, and SQS/managed queues when you want zero operational overhead.",
          detailed:
            "Why a queue at all: it breaks the synchronous chain (covered in event-driven architecture) — the producer doesn't wait for slow consumers, a burst of orders gets buffered instead of overwhelming downstream services, and a crashed consumer can restart and pick up where it left off instead of losing work. Kafka: a distributed log — messages are appended to partitioned, replicated topics and *retained* (not deleted on consumption), so multiple independent consumer groups can each read the full stream at their own pace, and you can replay history (reprocess the last 24 hours after fixing a bug). It shines for high-throughput event streaming, log aggregation, and stream processing — but has a steeper operational curve (Zookeeper/KRaft, partition rebalancing, consumer group management). RabbitMQ: a traditional message broker with rich routing (exchanges: direct, topic, fanout, headers) and strong per-message delivery guarantees (acks, dead-letter queues, priority queues) — fits complex routing topologies and task-queue patterns (worker pools) better than Kafka does, at lower throughput ceilings. SQS (or managed equivalents): fully-managed, nearly zero ops, simple at-least-once delivery with visibility timeouts — the right call when you want 'just works' over fine-grained control, and your routing needs are simple. The real interview signal is matching 'replay + high-throughput streaming' → Kafka, 'complex routing + strict per-message semantics' → RabbitMQ, 'minimal ops + simple task queue' → SQS.",
        },
        keyPoints: [
          "Queues decouple producer/consumer in time and failure domain, absorb bursts, and enable retries — that's the 'why' before the 'which'",
          "Kafka: retained, replayable, partitioned log — best for high-throughput streaming and multiple independent consumers",
          "RabbitMQ: rich routing + strong per-message guarantees — best for complex topologies and worker-pool task queues",
          "SQS/managed: near-zero ops, simple semantics — best when you want to stop thinking about infrastructure",
          "All of them are at-least-once by default — your consumers must be idempotent regardless of which you pick",
        ],
        followUps: [
          "How does Kafka achieve ordering guarantees, and what does that imply about your partition key choice?",
          "How would you handle a 'poison pill' message that crashes every consumer that tries to process it?",
          "What's the difference between a queue (point-to-point) and a pub/sub topic (fan-out), and when do you need both?",
        ],
        example:
          "LinkedIn — where Kafka was born — uses it as the central nervous system for the entire site: every page view, profile edit, and connection request becomes an event on a Kafka topic that dozens of independent systems (search indexing, recommendations, monitoring, analytics) consume at their own pace from the same retained log, without any of them ever calling each other directly.",
      },
      {
        id: "realtime-communication",
        title: "Long polling vs WebSockets vs SSE — how do you choose for a real-time feature?",
        difficulty: "Medium",
        category: "communication-messaging",
        question:
          "You need to push live order-status updates to a customer's browser. Would you use long polling, WebSockets, or Server-Sent Events — and why?",
        answer: {
          short:
            "Match the *direction* of your data flow to the mechanism: SSE for one-way server→client streams (simplest, HTTP-native), WebSockets for true bidirectional real-time (chat, collaborative editing, gaming), and long polling only as a compatibility fallback.",
          detailed:
            "Long polling: client sends a request; the server holds it open until there's new data (or a timeout) and responds, then the client immediately re-requests. It's a hack on top of plain HTTP — works everywhere, needs no special infra — but wastes connections and adds latency (there's always a request/response round trip per update), and at scale you're holding open huge numbers of HTTP connections. Server-Sent Events (SSE): a single long-lived HTTP connection where the *server* streams events to the client as plain text (`text/event-stream`); the browser's `EventSource` API handles reconnection automatically. It's one-directional (server → client only), simple to implement (it's just HTTP — works through existing proxies/load balancers/firewalls without special handling), and perfect for status updates, live feeds, notifications — anything where the client doesn't need to talk back on the same channel. WebSockets: a full-duplex, persistent TCP-like connection established via an HTTP upgrade handshake — both sides can send messages anytime, with minimal per-message overhead. It's the right (and often only sane) choice for chat, multiplayer games, collaborative editing — anything genuinely bidirectional and low-latency. The cost: it needs special infrastructure handling (load balancers must support sticky connections or a shared pub/sub backplane like Redis to fan out messages across server instances), and it's overkill (and harder to scale/debug) for problems that are really one-directional. For 'push order status to the browser' specifically — that's one-directional, server→client — SSE is the simplest correct tool; reaching for WebSockets here is solving a one-way problem with a two-way hammer.",
        },
        keyPoints: [
          "Match mechanism to *data direction*: one-way server→client → SSE; truly bidirectional → WebSockets; legacy compatibility fallback → long polling",
          "SSE is just HTTP — auto-reconnect built into the browser, works through normal infrastructure, far simpler to operate than WebSockets",
          "WebSockets need a fan-out story across server instances (sticky LB sessions or a shared pub/sub backplane) — that's real infra cost",
          "Don't reach for the most powerful tool by default — a one-directional problem solved with WebSockets is needless complexity",
        ],
        followUps: [
          "How would you scale WebSocket connections across multiple server instances?",
          "How does SSE handle reconnection and missed messages, and how would you make it resumable?",
          "What happens to a long-lived WebSocket connection when you need to deploy a new version of the server?",
        ],
        example:
          "Gmail used long polling for years before WebSockets were widely supported — it was a pragmatic hack to get 'real-time-ish' inbox updates on the infrastructure of the time. Modern equivalents (Slack, Discord) use WebSockets because their problem is genuinely bidirectional (typing indicators, presence, live messages going both ways) — exactly the case where the complexity is justified.",
      },
      {
        id: "async-processing-patterns",
        title: "How do you decide what should be processed asynchronously vs in the request path?",
        difficulty: "Medium",
        category: "communication-messaging",
        question:
          "A user uploads a video and your API currently transcodes it synchronously before responding — and it times out under load. How would you redesign this?",
        answer: {
          short:
            "Anything that's slow, unreliable, or not needed for the immediate response should move out of the request path: accept the request fast, enqueue the heavy work, and let the client poll, subscribe, or get notified when it's done.",
          detailed:
            "The smell here is a request handler doing real work (transcoding — CPU-heavy, slow, possibly minutes long) inside the synchronous request/response cycle, where HTTP timeouts, connection limits, and thread-pool exhaustion are all working against you. The fix follows a standard shape: (1) the API handler does the *minimum necessary* synchronously — validate the upload, store the raw file, write a `VideoUploaded` job/event, and return `202 Accepted` with a job ID immediately; (2) a pool of background workers (consuming from a queue) picks up the job and does the actual transcoding, retrying on failure with backoff, completely decoupled from any HTTP request's lifetime; (3) the client finds out when it's done via polling a status endpoint, a WebSocket/SSE push, or a webhook/email notification — whichever fits the UX. This pattern generalizes: anything slow (image/video processing, PDF generation, ML inference, bulk exports), anything that calls flaky external systems (sending emails, calling third-party APIs, webhooks), or anything that doesn't gate the user's immediate next action should move to the background. The discipline question to ask of every endpoint: 'does the user need to wait for this to *complete*, or just for it to be *durably accepted*?' If it's the latter, get it off the request path.",
        },
        keyPoints: [
          "The question to ask per-operation: does the user need the result *now*, or just confirmation it was *accepted*? If the latter — go async",
          "Standard shape: validate + enqueue fast (return 202), process in background workers, notify via poll/push/webhook on completion",
          "Background workers need their own retry/backoff/dead-letter strategy — decoupled from any single HTTP request's lifetime",
          "Generalizes to: anything slow (transcoding, exports, ML), anything flaky (emails, third-party calls), anything non-blocking for the user's next step",
        ],
        followUps: [
          "How would the client find out when the video is ready — and what are the trade-offs between polling, WebSockets, and webhooks?",
          "How do you prevent the same video from being transcoded twice if the job gets redelivered?",
          "What would you monitor to know your background queue is falling behind?",
        ],
        example:
          "YouTube's upload flow is exactly this pattern made visible: you see 'Upload complete — processing...' the instant the bytes land, while transcoding into a dozen resolutions happens asynchronously across a fleet of workers — sometimes taking minutes for long videos — with the UI polling/pushing status updates until it's ready to publish.",
      },
    ],
  },
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "resiliency-scale",
    icon: "🛡️",
    title: "Resiliency & Scale",
    color: "#ef4444",
    problems: [
      {
        id: "load-balancing-algorithms",
        title: "What load balancing algorithms exist, and when does each one bite you?",
        difficulty: "Medium",
        category: "resiliency-scale",
        question:
          "Round robin, least connections, IP hash, weighted — walk me through these and tell me a scenario where the 'obvious' choice goes wrong.",
        answer: {
          short:
            "Round robin assumes all requests and all servers are equal — neither is usually true. Least-connections adapts to actual load; IP hash buys you session affinity at the cost of even distribution; weighted variants let you account for heterogeneous hardware.",
          detailed:
            "Round robin: requests go to servers in fixed rotation — dead simple, but assumes every request costs the same and every server is equally capable; one slow request (or one underpowered box) creates an uneven pile-up that round robin is blind to. Least connections: routes to whichever server currently has the fewest active connections — adapts to real-time load and handles uneven request costs much better, at the cost of needing the LB to track connection state. Weighted round robin / weighted least connections: lets you assign servers different capacities (a bigger box gets more traffic) — essential in heterogeneous fleets (mixed instance types during a gradual upgrade). IP hash (or consistent hashing on some request attribute): routes the same client to the same server consistently — gives you 'sticky sessions' for free (useful if a service keeps in-memory state per user), but can create hotspots if one IP (e.g., behind a corporate NAT) generates disproportionate traffic, and it complicates scaling the backend fleet up/down because the hash space shifts. The 'obvious choice goes wrong' scenario: round robin on a fleet where one endpoint (say, `/export`) is 100x more expensive than `/health` — round robin happily sends export requests evenly, but if they cluster on certain servers by chance, those servers get disproportionately loaded while round robin metrics show 'perfectly even' distribution by *request count*, hiding the real imbalance in *resource cost*.",
        },
        keyPoints: [
          "Round robin assumes equal-cost requests and equal-capacity servers — both assumptions break in real systems",
          "Least connections adapts to real-time load — the safer general-purpose default for heterogeneous workloads",
          "IP/consistent hashing buys session affinity for free — at the cost of potential hotspots and harder elastic scaling",
          "Always separate 'requests distributed evenly' from 'load distributed evenly' — they're not the same thing when request costs vary",
        ],
        followUps: [
          "How does a load balancer detect an unhealthy backend, and what happens to in-flight requests when it does?",
          "What's the difference between L4 and L7 load balancing, and when does that distinction matter?",
          "How would you load-balance across multiple regions, not just multiple servers in one region?",
        ],
        example:
          "HAProxy and Envoy both default to (or strongly recommend) least-connections or weighted-least-request algorithms for HTTP backends precisely because real-world request costs vary wildly — a health-check ping and a complex search query hitting the same fleet make naive round robin actively misleading as a load-balancing strategy.",
      },
      {
        id: "circuit-breakers",
        title: "How do circuit breakers work, and why aren't retries with backoff enough?",
        difficulty: "Medium",
        category: "resiliency-scale",
        question:
          "Your payment service occasionally times out calling a third-party fraud-check API. You've added retries with exponential backoff — why might that still cause an outage, and what would you add?",
        answer: {
          short:
            "Retries amplify load on a struggling dependency right when it's least able to handle it — a circuit breaker stops the bleeding by failing fast once a failure threshold is crossed, giving the dependency room to recover.",
          detailed:
            "Retries with backoff handle *transient* blips well — a single dropped packet, a momentary GC pause. But when a dependency is *genuinely* struggling (overloaded, degraded, down), every retry is one more request piling onto an already-drowning service — across thousands of your own callers, that's a self-inflicted DDoS on your dependency (and, via thread/connection pool exhaustion, on yourself too — this is how cascading failures happen). A circuit breaker adds a state machine on top: Closed (normal — requests flow through, failures are counted); when failures cross a threshold (e.g., 50% of the last 20 requests failed), it trips to Open (every request fails *immediately*, without even attempting the call — this is the 'fail fast' that protects both you and the dependency); after a cooldown period it moves to Half-Open (lets a small trickle of requests through as a probe — if they succeed, close the circuit and resume normal traffic; if they fail, reopen and wait longer). This gives the struggling dependency breathing room to recover instead of being kept underwater by a constant stream of retries, and it protects *your* service from exhausting its own resources waiting on a dependency that isn't going to answer. The combination that actually works in production is: timeouts (don't wait forever) + retries with backoff and jitter (handle transient blips) + circuit breaker (stop hammering a truly broken dependency) + fallback (serve a cached/default response when the circuit is open).",
        },
        keyPoints: [
          "Retries alone can amplify load on a struggling dependency — turning a partial outage into a total one (self-inflicted thundering herd)",
          "Circuit breaker states: Closed (normal, counting failures) → Open (fail fast, no calls attempted) → Half-Open (probe with a trickle, decide to close or reopen)",
          "'Fail fast' protects both the struggling dependency (gives it room to recover) and your own service (stops thread/connection pool exhaustion)",
          "The full resilience stack is layered: timeouts + backoff-with-jitter retries + circuit breaker + fallback — each solves a different failure mode",
        ],
        followUps: [
          "How would you choose the failure-rate threshold and cooldown duration for a circuit breaker?",
          "What's 'jitter' in retry backoff and why does it matter at scale?",
          "What fallback would you serve when the fraud-check circuit is open — block the payment, or allow it through?",
        ],
        example:
          "Netflix's Hystrix (and its spiritual successor, resilience4j) popularized circuit breakers in microservices — Netflix's own postmortems describe cascading failures where one slow internal service caused *every* upstream caller's thread pools to fill up waiting on it, eventually taking down the whole site; circuit breakers were built specifically to make that class of incident structurally impossible.",
      },
      {
        id: "consistent-hashing",
        title: "What problem does consistent hashing solve, and how does it actually work?",
        difficulty: "Hard",
        category: "resiliency-scale",
        question:
          "Why not just use `hash(key) % N` to distribute keys across cache servers? What goes wrong, and how does consistent hashing fix it?",
        answer: {
          short:
            "`hash(key) % N` reshuffles almost every key when N changes — adding or removing one server invalidates nearly your entire cache. Consistent hashing arranges servers and keys on a ring so that only a small fraction of keys move when membership changes.",
          detailed:
            "With naive modulo hashing, the server responsible for a key is `hash(key) % N`. The moment N changes — you add a server to handle more load, or one crashes — almost *every* key now maps to a different server than before, because the modulo result shifts for nearly all inputs. For a cache, that's catastrophic: a near-total cache wipe right when you're scaling up (i.e., right when you can least afford a stampede of cache misses hammering your database). Consistent hashing fixes this by hashing both servers *and* keys onto the same circular space (a 'ring', typically 0 to 2^32-1): a key is owned by the first server clockwise from its position on the ring. When you add a server, it only takes over the keys in the arc between itself and the next server counter-clockwise — everything else stays put; roughly only `K/N` keys move (K = total keys, N = number of servers), not nearly all of them. When a server is removed, only its keys redistribute to its neighbor. The remaining wrinkle — uneven load if servers land unluckily close together on the ring — is solved with *virtual nodes*: each physical server is hashed to many points on the ring (e.g., 100-500 virtual nodes each), smoothing out the distribution so no single server gets an unlucky concentration of key ranges.",
        },
        keyPoints: [
          "`hash(key) % N` reshuffles ~all keys when N changes — the worst possible behavior exactly when you're scaling (cache stampede risk)",
          "Consistent hashing places servers and keys on a ring; a key belongs to the next server clockwise — adding/removing a server only moves ~K/N keys",
          "Virtual nodes (each physical server hashed to many ring positions) smooth out uneven load that plain consistent hashing can still produce",
          "This is the mechanism behind Dynamo-style databases, CDNs, and distributed caches — knowing it cold signals real distributed-systems depth",
        ],
        followUps: [
          "How do virtual nodes affect the rebalancing cost when a server is added or removed?",
          "How does DynamoDB use consistent hashing for partitioning, and how does it handle replication on top of it?",
          "What would you do if certain keys are far 'hotter' than others, even with perfectly even hash distribution?",
        ],
        example:
          "Amazon's Dynamo paper (2007) introduced consistent hashing with virtual nodes to the mainstream — it's now the backbone of Cassandra, DynamoDB, Riak, and most distributed caches/CDNs, precisely because it turns 'we're adding a server' from a borderline-catastrophic cache-wipe event into a routine, low-impact operation.",
      },
      {
        id: "resiliency-patterns",
        title: "What's your mental checklist for making a service resilient to dependency failures?",
        difficulty: "Medium",
        category: "resiliency-scale",
        question:
          "You're reviewing a design doc for a service that calls three downstream APIs. What resiliency patterns would you expect to see, and what questions would you ask if they're missing?",
        answer: {
          short:
            "I'd look for timeouts, retries with backoff+jitter, circuit breakers, bulkheads, and graceful fallbacks — and I'd specifically ask 'what happens to *this* service when each dependency is slow (not just down)?' because slow is the failure mode that actually causes outages.",
          detailed:
            "The checklist, roughly in the order I'd scan a design doc for them: (1) Timeouts — every network call needs one; 'no timeout' means a single hung dependency can occupy a thread/connection forever, and enough hung threads exhausts your pool, taking down requests that have nothing to do with the slow dependency. (2) Retries with exponential backoff *and jitter* — backoff prevents synchronized retry storms, jitter prevents many clients from retrying in lockstep and re-creating the storm anyway. (3) Circuit breakers — stop calling a dependency that's clearly failing, both to protect it and yourself (detailed above). (4) Bulkheads — partition your resources (separate thread pools / connection pools per dependency) so that one slow dependency can't starve calls to a healthy one; named after ship compartments that contain flooding to one section. (5) Fallbacks / graceful degradation — when a dependency is unavailable, can you serve a cached value, a default, or a reduced experience instead of a hard error? (6) Idempotency — if you retry a write operation, does doing it twice cause harm (double-charging a card)? If yes, you need idempotency keys before retries are safe at all. The single most important question to ask: 'what happens when this dependency is *slow* — not down, just slow?' Most outages are caused by slow dependencies (which look healthy to simple up/down health checks) silently exhausting resources, not by clean, fast failures.",
        },
        keyPoints: [
          "The stack, in order: timeouts → retries (backoff + jitter) → circuit breakers → bulkheads → fallbacks → idempotency",
          "Bulkheads (separate resource pools per dependency) stop one slow dependency from starving calls to healthy ones",
          "'Slow' is the dangerous failure mode, not 'down' — slow dependencies pass health checks while quietly exhausting your thread/connection pools",
          "Idempotency keys are a prerequisite for safe retries on any write — otherwise a retry can cause real-world double effects (double charge, double email)",
        ],
        followUps: [
          "How would you implement a bulkhead in practice — separate thread pools, separate processes, or something else?",
          "How do idempotency keys work end-to-end for a payment API?",
          "How would you test that your fallbacks actually work before a real outage forces you to find out?",
        ],
        example:
          "AWS's own postmortems repeatedly cite 'a dependency became slow, not unavailable' as the root cause of cascading incidents — their internal guidance explicitly tells teams to design and chaos-test for *slow* responses (injecting artificial latency), not just hard failures, because that's the failure mode that actually takes down well-engineered systems.",
      },
    ],
  },
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "lld-interview-qa",
    icon: "💡",
    title: "LLD Interview Q&A",
    color: "#a78bfa",
    problems: [
      {
        id: "lld-vs-hld",
        title: "What's the actual difference between an LLD and HLD round, and what is each one grading?",
        difficulty: "Easy",
        category: "lld-interview-qa",
        question:
          "You have both an HLD and an LLD round for the same role. What is each interviewer actually trying to find out, and how should your approach differ?",
        answer: {
          short:
            "HLD grades whether you can decompose a vague problem into services, data flow, and trade-offs at the system level; LLD grades whether you can turn one of those boxes into clean, extensible, working object-oriented design — classes, interfaces, state machines, concurrency.",
          detailed:
            "High-Level Design rounds hand you something broad ('design Twitter', 'design a ride-sharing app') and grade your ability to: ask clarifying questions to scope the problem, identify the core entities and APIs, choose the right storage and communication patterns, estimate scale, and reason about trade-offs (consistency vs availability, SQL vs NoSQL, sync vs async) — the output is usually a box-and-arrow diagram and a narrated set of decisions. Low-Level Design rounds hand you something narrower and deeper ('design a parking lot', 'design an elevator system', 'design a rate limiter as a library', 'design Splitwise') and grade: can you identify the right classes/interfaces and their responsibilities (single responsibility, not god-objects), do you reach for the right design patterns *because they fit* (not because you memorized GoF), can you model state transitions and concurrency correctly, and can you write code that's actually extensible (adding a new vehicle type or a new payment method shouldn't require rewriting half the system). The biggest mistake candidates make is treating LLD like a coding interview (just write a working class) — the bar is *design quality*: extensibility, separation of concerns, and the ability to explain *why* you modeled it this way and what would change if a new requirement showed up.",
        },
        keyPoints: [
          "HLD = system decomposition, data flow, scale, trade-offs (boxes and arrows); LLD = object/class design, interfaces, patterns, state, concurrency (code-level)",
          "LLD is graded on extensibility and separation of concerns — not 'does it compile', but 'can I add a feature without rewriting half of it'",
          "Design patterns should appear because they *fit the forces in the problem* — naming a pattern just to show you know it is a red flag, not a strength",
          "Always narrate the 'why' — interviewers are grading your reasoning trail at least as much as the artifact you produce",
        ],
        followUps: [
          "How would you demonstrate extensibility in a 45-minute LLD interview without writing a full implementation?",
          "What's a red flag an interviewer watches for in an LLD round?",
          "How do you balance 'enough design upfront' against 'just start coding' in a time-boxed round?",
        ],
        example:
          "A classic LLD tell: two candidates design a parking lot. One hardcodes `if (vehicleType == \"car\") fee = 50 else if (vehicleType == \"bike\") fee = 20...` — works, but adding a new vehicle type means editing this function forever. The other defines a `Vehicle` interface with a `feeStrategy`, making new types pluggable without touching existing code — that's the difference an LLD round is actually measuring.",
      },
      {
        id: "lld-design-parking-lot",
        title: "Design a parking lot system — what classes and relationships would you sketch?",
        difficulty: "Medium",
        category: "lld-interview-qa",
        question:
          "Design the core classes for a multi-level parking lot that supports different vehicle types, multiple entry/exit gates, and dynamic pricing. Walk me through your design.",
        answer: {
          short:
            "Model the domain nouns as classes (`ParkingLot`, `Level`, `Spot`, `Vehicle`, `Ticket`), use the Strategy pattern for pluggable pricing/spot-assignment, and keep concurrency in mind — two cars must never be assigned the same spot.",
          detailed:
            "Core entities: `Vehicle` (abstract, with subclasses `Car`, `Motorcycle`, `Truck` — each knows its size requirement); `ParkingSpot` (has a type/size, an occupied flag, and a reference to the vehicle currently parked); `Level` (owns a collection of spots, knows how many free spots of each type remain — ideally maintained as counters, not by scanning); `ParkingLot` (owns levels, exposes `parkVehicle()` / `unparkVehicle()`, is the entry point gates talk to); `Ticket` (records entry time, assigned spot, vehicle — the receipt that ties a parking session together); `Gate`/`EntryPanel`/`ExitPanel` (the physical interaction points). Two design decisions are where this round is actually won: (1) Spot assignment — don't hardcode 'find the first free spot'; define a `SpotAssignmentStrategy` interface (nearest-to-entrance, by-vehicle-size-fit, load-balance-across-levels) so the lot owner can change policy without touching `ParkingLot`'s code — Strategy pattern, applied because the *forces* (different lots want different assignment policies) call for it. (2) Pricing — same idea: a `PricingStrategy` interface lets you support flat-rate, hourly, dynamic/surge pricing as interchangeable plug-ins. (3) Concurrency — `parkVehicle` must atomically check-and-reserve a spot; without locking (or an atomic compare-and-swap on the spot's state), two cars arriving simultaneously can both be assigned the same spot — exactly the kind of race condition an LLD interviewer is listening for you to mention unprompted.",
        },
        keyPoints: [
          "Model domain nouns as classes with single, clear responsibilities — `Vehicle`, `Spot`, `Level`, `ParkingLot`, `Ticket`, each owning exactly one concern",
          "Use Strategy for anything that varies by policy (spot assignment, pricing) — makes the system extensible without modifying core classes (Open/Closed Principle in action)",
          "Maintain free-spot counts incrementally (counters updated on park/unpark) rather than scanning — an easy win interviewers notice",
          "Call out the concurrency race in spot assignment unprompted — 'two cars arrive simultaneously, both must not get the same spot' is exactly the kind of detail that separates strong answers",
        ],
        followUps: [
          "How would you support reservations made in advance, on top of this design?",
          "How would you handle a vehicle that doesn't fit any available spot of its preferred size?",
          "How would your design change if this needed to support 1,000 parking lots across a city with centralized availability search?",
        ],
        example:
          "This exact 'don't hardcode the policy, inject a strategy' instinct is what separates a working toy from a design that survives requirement changes — real parking systems (SpotHero, ParkWhiz) support wildly different pricing per location/operator, which is only tractable if pricing was modeled as a pluggable concern from day one.",
      },
      {
        id: "lld-design-rate-limiter",
        title: "Design a rate limiter as a reusable library — what would you actually build?",
        difficulty: "Hard",
        category: "lld-interview-qa",
        question:
          "Design a rate limiter that can be dropped into any service to cap requests per user per time window. What algorithm would you pick, and how would you make it work across multiple service instances?",
        answer: {
          short:
            "Sliding-window-counter or token-bucket are the production-grade choices (smooth, accurate, memory-efficient); the harder design problem is making the *state* (counts/tokens) consistent across multiple instances — which pushes you toward a shared store like Redis with atomic operations.",
          detailed:
            "Algorithm choice — four candidates worth naming and ranking: Fixed window counter (simplest — count requests in discrete windows like '12:00:00-12:01:00'; the flaw is burst-at-the-boundary: a user can send N requests at 12:00:59 and another N at 12:01:00, doubling the intended limit in two seconds). Sliding window log (store a timestamp per request, count how many fall in the trailing window — perfectly accurate, but memory cost grows with request volume). Sliding window counter (a clever hybrid — weight the previous window's count by how much it overlaps the current sliding window; nearly as accurate as the log approach with fixed, small memory — this is what most production systems actually use). Token bucket (tokens refill at a fixed rate into a bucket of fixed capacity; a request consumes a token or is rejected — naturally allows controlled bursts up to the bucket size, which fixed/sliding windows don't model well). For a *library* meant to be dropped into many services, I'd default to token bucket (intuitive mental model, naturally supports bursts, simple to implement) or sliding window counter (smoother, no burst allowance) depending on whether bursts should be allowed. The harder problem — and the one that actually distinguishes a strong answer — is distribution: if your service runs on 10 instances, each holding its own in-memory counter, a user can get 10x the intended limit by hitting different instances. The fix is centralizing the counter state in a shared, fast store (Redis) and using atomic operations (`INCR` + `EXPIRE`, or a Lua script for token-bucket logic) so that check-and-increment happens as one atomic unit — without that atomicity, you reintroduce the exact race condition the rate limiter exists to prevent.",
        },
        keyPoints: [
          "Name and rank the algorithms: fixed window (simple, boundary-burst flaw) → sliding log (accurate, memory-heavy) → sliding window counter (the production sweet spot) → token bucket (naturally models controlled bursts)",
          "The real design challenge isn't the algorithm — it's making counters *consistent across instances* without that becoming the new bottleneck",
          "Redis + atomic operations (INCR/EXPIRE or a Lua script) solves the distributed state problem — and the atomicity itself is the crux (a non-atomic check-then-increment reintroduces the race)",
          "As a *library*, expose the algorithm as a pluggable strategy — different endpoints often need different limits and different burst tolerances",
        ],
        followUps: [
          "How would a Lua script in Redis make the token-bucket check-and-decrement atomic?",
          "What HTTP response and headers would you return when a client is rate-limited (429, Retry-After, X-RateLimit-*)?",
          "How would you rate-limit by multiple dimensions at once — per-user AND per-IP AND globally?",
        ],
        example:
          "Stripe's public API rate limiter is a textbook reference: it returns `429 Too Many Requests` with `Retry-After` headers, uses a token-bucket-like model that allows short bursts, and — crucially — they've written publicly about using Redis with atomic Lua scripts specifically to keep the bucket state correct across their horizontally-scaled API fleet.",
      },
      {
        id: "lld-design-elevator-system",
        title: "Design an elevator control system — how do you model the scheduling logic cleanly?",
        difficulty: "Hard",
        category: "lld-interview-qa",
        question:
          "Design the core classes for a multi-elevator system in a building. How would you decide which elevator answers a call, and how do you keep that decision logic from becoming a tangled mess of if-statements?",
        answer: {
          short:
            "Separate 'what state is each elevator in' (a state machine: idle, moving up, moving down, doors open) from 'which elevator should answer this call' (a pluggable scheduling strategy) — conflating the two is what produces the tangled-if-statement mess interviewers are watching for.",
          detailed:
            "Core classes: `Elevator` (current floor, direction, door state, a queue of destination requests, and — critically — modeled as an explicit state machine: Idle → MovingUp/MovingDown → DoorsOpening → DoorsOpen → DoorsClosing → back to Idle or moving; this prevents the classic bug of 'doors open while moving'); `ElevatorController`/`ElevatorSystem` (owns all elevators, receives floor calls, and delegates to a scheduler); `Request` (floor + direction — an external hall call vs an internal car-button press, which behave slightly differently); `SchedulingStrategy` (the pluggable brain — given the current state of all elevators and a new request, decide which elevator should serve it). The scheduling decision is where the design is won or lost: a naive 'nearest elevator' strategy ignores direction (an elevator one floor away but moving *away* from the caller is a worse choice than one three floors away moving *toward* them) — the real algorithm (similar to SCAN/elevator-disk-scheduling algorithms from OS theory) scores each elevator by: is it idle (best case — can be redirected freely), is it already moving toward the request in the same direction (good — minimal detour), or is it moving away (worst — would need to finish its current run first). Defining `SchedulingStrategy` as an interface means you can swap in 'minimize wait time' vs 'minimize energy use' vs 'priority floors for VIP access cards' without touching `Elevator` or `ElevatorController` — that pluggability, plus the explicit state machine preventing invalid states, is exactly what an interviewer is listening for.",
        },
        keyPoints: [
          "Model the elevator itself as an explicit state machine (Idle/MovingUp/MovingDown/DoorsOpen/...) — this single decision prevents a whole class of 'impossible state' bugs",
          "Separate 'elevator state' from 'which elevator answers this call' — the latter is a pluggable `SchedulingStrategy`, not a pile of if-statements inside `Elevator`",
          "A good scheduling heuristic scores by direction-and-proximity (idle > moving toward in same direction > moving away) — borrowed from OS disk-scheduling (SCAN/LOOK algorithms)",
          "Distinguish hall calls (floor + direction, from outside) from car calls (just a floor, from inside) — they carry different information and are handled slightly differently",
        ],
        followUps: [
          "How would you handle a power outage or emergency mode (e.g., all elevators must go to the ground floor)?",
          "How would you avoid starvation — a request on a rarely-visited floor waiting indefinitely?",
          "How would you extend this design to support a 'destination dispatch' system where you select your floor before entering the elevator?",
        ],
        example:
          "Real destination-dispatch systems (Schindler's PORT, KONE's systems found in modern skyscrapers) work exactly like the pluggable-strategy version of this design: the building's controller groups passengers heading to nearby floors into the same car *before* they board — a scheduling policy that would be impossible to bolt onto a design where 'which elevator answers' logic is hardwired into each car.",
      },
      {
        id: "lld-design-patterns-when",
        title: "How do you avoid the 'pattern soup' trap in an LLD interview?",
        difficulty: "Medium",
        category: "lld-interview-qa",
        question:
          "Candidates often shoehorn Singleton, Factory, Observer, and Strategy into every design whether or not they fit. How should you actually decide when a pattern belongs?",
        answer: {
          short:
            "Let the *forces in the problem* summon the pattern, not the other way around — name the specific variability or coupling problem first, then reach for the pattern that resolves exactly that problem, and say so explicitly.",
          detailed:
            "Patterns exist to resolve specific recurring forces — naming the force *first* and then the pattern is what reads as senior; naming the pattern first and retrofitting a justification reads as memorization. Quick force-to-pattern map worth having ready: 'this behavior needs to vary independently and be swapped at runtime' → Strategy (pricing, spot assignment, scheduling — all from the examples above); 'object construction is complex or needs to vary by type/config' → Factory / Builder (creating different `Vehicle` or `Notification` subtypes from a config flag, or building a complex object step-by-step); 'many parts need to react to one thing changing, without tight coupling' → Observer (an elevator's arrival notifying floor displays, an order-status change notifying multiple subscribers — though in distributed systems this often becomes an event bus instead); 'exactly one instance must coordinate shared state' → Singleton (genuinely rare in well-designed systems — usually a sign that state should be passed explicitly instead; interviewers often consider reflexive Singleton use a yellow flag because it introduces global mutable state and makes testing harder); 'you need to add behavior to objects without subclassing every combination' → Decorator (pricing add-ons, middleware chains). The discipline: state the problem ('different vehicle types need different fee calculations and new types will be added later') *before* naming the pattern ('...so I'd use Strategy here') — that ordering is the entire signal an interviewer is listening for.",
        },
        keyPoints: [
          "Name the force/problem first, the pattern second — 'I need X to vary independently, so I'd use Strategy' beats 'I'll use Strategy here'",
          "Strategy: swap behavior at runtime. Factory/Builder: complex/varying construction. Observer: loose-coupled reactions to change. Decorator: compose behavior without subclass explosion",
          "Singleton is the pattern most often misused — reflexive use is a yellow flag (global mutable state, hard to test); ask 'could this just be passed explicitly instead?'",
          "If you can't articulate what breaks *without* the pattern, you probably don't need it — that's the test for whether it genuinely fits",
        ],
        followUps: [
          "Give an example where Observer is the wrong choice and an event bus / message queue would serve better.",
          "When does Factory become an over-engineered abstraction for something that could just be a constructor?",
          "How would you refactor a Singleton-heavy design to remove the global state, and what would that cost you?",
        ],
        example:
          "A revealing interview moment: ask a candidate 'why Singleton for your `Logger`?' — a weak answer is 'so there's only one instance' (true, but doesn't explain *why that matters*); a strong answer is 'actually, I'd pass a logger instance through the constructor (dependency injection) instead — that keeps it testable and avoids hidden global state, even though in production there'd effectively be one instance anyway.' The strong answer shows the candidate understands the trade-off, not just the recipe.",
      },
      {
        id: "lld-design-splitwise",
        title: "Design Splitwise (expense-sharing app) — how do you model balances and settlements?",
        difficulty: "Hard",
        category: "lld-interview-qa",
        question:
          "Design the core domain model for an app like Splitwise where groups of people split expenses and the app tells you who owes whom. How do you keep the balance computation correct and efficient?",
        answer: {
          short:
            "Model `Expense` as the source of truth (immutable record of who paid and how it's split), derive pairwise balances from expenses rather than storing them directly, and use a 'simplify debts' graph algorithm so the app shows the minimum number of settlements instead of a tangled mesh.",
          detailed:
            "Core entities: `User`, `Group` (a set of users), `Expense` (amount, payer, a list of `Split`s — each split says 'this user owes this amount', supporting equal/exact/percentage split strategies — Strategy pattern again, because split styles vary and new ones get added), and `Settlement` (a record of an actual payment between two users that reduces a balance). The key modeling decision: don't store 'Alice owes Bob $20' as mutable rows you update in place — store immutable `Expense` records (the source of truth, an audit trail that never changes) and *derive* current balances by summing splits across all expenses minus settlements. This makes the system auditable (you can always answer 'why do I owe this much?' by replaying the expense history) and avoids a whole class of bugs where balance-update code drifts out of sync with the expenses that justified it. The interesting algorithmic piece: naively, if Alice owes Bob $20 and Bob owes Charlie $20, the app could show two separate debts — but the *simplified* view should realize Alice can just pay Charlie directly, netting Bob out entirely. This is the 'simplify debts' problem: build a graph where edges are net pairwise balances, then greedily match the largest creditor with the largest debtor repeatedly until all balances are zero — minimizing the total number of transactions needed to settle the whole group. Surfacing that you know this is a real, named sub-problem (not just 'sum up the numbers') is what separates a strong Splitwise answer from a mediocre one.",
        },
        keyPoints: [
          "Model `Expense` as an immutable source-of-truth record; *derive* balances from it rather than mutating stored balances directly — gives you an audit trail and prevents drift bugs",
          "Use Strategy for split types (equal / exact amounts / percentages / shares) — new split styles are a near-certain future requirement",
          "The 'simplify debts' sub-problem (minimize the number of settlement transactions via greedy max-creditor/max-debtor matching) is the algorithmic heart of this question — name it explicitly",
          "Group balances should be computed incrementally/cached, not recomputed from the full expense history on every page load, once the group has real history",
        ],
        followUps: [
          "How would you handle a user editing or deleting an expense after settlements have already happened against it?",
          "How would you extend this to support multiple currencies?",
          "How would you scale balance computation for a group with thousands of expenses — recompute on read, or maintain running balances?",
        ],
        example:
          "Splitwise's real product explicitly surfaces the 'simplify debts' feature as a named, user-facing setting — toggling it changes the app from showing every individual pairwise debt to showing the minimal settlement plan for the whole group, which is precisely the graph-matching problem this question is testing whether you can recognize and name.",
      },
    ],
  },
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "hld-interview-qa",
    icon: "🏛️",
    title: "HLD Interview Q&A",
    color: "#38bdf8",
    problems: [
      {
        id: "hld-clarifying-questions",
        title: "An interviewer says 'design Twitter.' What do you do in the first two minutes?",
        difficulty: "Easy",
        category: "hld-interview-qa",
        question:
          "You're given an intentionally vague prompt like 'design Twitter' or 'design Netflix.' What's your opening move, and why does it matter so much to the grade?",
        answer: {
          short:
            "Spend the first few minutes scoping the problem out loud — functional requirements, scale, and non-functional priorities — because an ungrounded design (one that doesn't know its own scale or priorities) can't be evaluated, and that uncertainty is what tanks scores, not the diagram itself.",
          detailed:
            "The single biggest differentiator between strong and weak HLD performances isn't the final diagram — it's whether the candidate *grounds* the design in explicit requirements before drawing anything. The opening sequence that works: (1) Functional scope — 'Twitter is huge; should I focus on posting + timeline + follow, or include DMs, search, trends, ads too?' (forces the interviewer to hand you a bounded problem, and shows you understand that 'design Twitter' is not actually a spec). (2) Scale — 'roughly how many users, how many posts/day, what's the read:write ratio?' (this single question often *is* the design — a 100:1 read:write ratio screams 'cache and pre-compute timelines'; a write-heavy system screams 'partition and queue'). (3) Non-functional priorities — 'should this favor consistency or availability if there's a partition? Is sub-second latency critical, or is eventual-consistency-with-good-UX acceptable?' (this tells you which trade-offs you're allowed to make later without re-litigating them). Skipping this and jumping straight to boxes-and-arrows is the single most common reason strong engineers underperform in these rounds — not because their design is bad, but because the interviewer can't tell *if* it's good without knowing what it was supposed to optimize for. Two minutes of scoping questions can be worth more to your score than ten minutes of diagramming.",
        },
        keyPoints: [
          "Scope functional requirements out loud first — 'design Twitter' is not a spec; turning it into one is itself a graded skill",
          "Ask for scale (users, requests/day, read:write ratio) — that single ratio often determines your entire architecture direction",
          "Ask which non-functional property to optimize (consistency vs availability, latency vs throughput) — it licenses every trade-off you'll make later",
          "An ungrounded design can't be graded — scoping isn't stalling, it's the part of the round that makes the rest of it evaluable",
        ],
        followUps: [
          "How do you handle an interviewer who says 'just use your best judgment, keep going'?",
          "How would your scoping questions differ for 'design Netflix' vs 'design Twitter'?",
          "How much time would you budget for scoping vs designing in a 45-minute round?",
        ],
        example:
          "A real difference in outcomes: one candidate spends 8 minutes nailing down 'we're optimizing for read-heavy timelines, eventual consistency is fine, ~200M DAU' and then designs a focused, defensible system around that; another jumps straight into drawing 15 boxes for 'the whole of Twitter' and runs out of time before reaching any meaningful trade-off discussion. The first candidate's *smaller* diagram usually scores higher.",
      },
      {
        id: "hld-design-url-shortener",
        title: "Design a URL shortener — what are the load-bearing decisions?",
        difficulty: "Medium",
        category: "hld-interview-qa",
        question:
          "Design a URL shortening service like bit.ly. Walk me through your approach — what decisions actually matter here versus what's just plumbing?",
        answer: {
          short:
            "The load-bearing decisions are: how you generate short codes (collision-free, no central bottleneck), the read:write ratio driving your caching strategy, and how redirects (301 vs 302) interact with analytics — everything else is comparatively standard CRUD plumbing.",
          detailed:
            "Core flow: `POST /shorten {longUrl}` → returns a short code; `GET /{code}` → 30x redirect to the long URL. The decisions that actually distinguish a strong answer: (1) Code generation — base62-encoding an auto-incrementing ID is simple and collision-free but creates a central bottleneck (one counter) and makes URLs guessable/sequential (a privacy/abuse concern); hashing the long URL (MD5/SHA, truncated) avoids the central counter but creates collisions you must detect and handle (append a salt and retry); a pre-generated pool of random codes handed out by a dedicated key-generation service avoids both problems at the cost of an extra moving part. Naming this trade-off explicitly is the single highest-value thing you can do in this question. (2) Redirect type — 301 (permanent) lets browsers cache the redirect, reducing load on your service dramatically, but makes click analytics impossible (the browser never asks you again after the first visit); 302 (temporary) hits your service every time, enabling analytics, at higher load. This is a real trade-off with a business answer, not a technical one — 'do we need click analytics?' decides it. (3) Read:write ratio — shortenings are rare, redirects are extremely frequent (often 100:1 or higher) — this should visibly drive your design toward heavy caching (the long URL for a hot short code should almost never require a database hit) and toward optimizing the read path above all else. (4) Storage — a simple key-value mapping (short code → long URL) fits a key-value store perfectly; you rarely need relational features here, which is itself worth saying (shows you're matching the store to the access pattern, not defaulting to Postgres-for-everything).",
        },
        keyPoints: [
          "Code generation is the crux: base62(counter) [simple, central bottleneck, guessable] vs hash-with-collision-handling vs pre-generated key pool — name the trade-off, don't just pick one silently",
          "301 vs 302 redirect is a real business trade-off (caching/load vs analytics capability) — frame it as a question for the product, not a technical default",
          "The read:write ratio (often >100:1) should visibly steer your design toward aggressive caching on the read path — say so explicitly",
          "Recognize this is a key-value access pattern — defaulting to a relational store here would be a (minor) signal you're not matching storage to access pattern",
        ],
        followUps: [
          "How would you handle custom short codes that users choose themselves?",
          "How would you prevent abuse (someone shortening malicious URLs at scale)?",
          "How would you shard the key-value store as it grows to billions of mappings?",
        ],
        example:
          "bit.ly's real architecture leans heavily on caching the hot redirect path (a small fraction of links account for the overwhelming majority of clicks — classic Pareto distribution) — meaning a cache sized for just the 'currently trending' subset of links absorbs the vast majority of traffic, letting the cold-storage tier stay comparatively small and slow.",
      },
      {
        id: "hld-design-rideshare",
        title: "Design a ride-sharing dispatch system — what's the genuinely hard part?",
        difficulty: "Hard",
        category: "hld-interview-qa",
        question:
          "Design the core of an Uber-like system: matching riders to nearby drivers in real time. What makes this hard, and how would you architect the matching?",
        answer: {
          short:
            "The hard part isn't the API surface — it's efficiently answering 'which drivers are near this rider, right now' at massive scale with constantly-moving entities, which pushes you toward geospatial indexing (geohashing/quad-trees) plus a real-time location pipeline, not a relational 'find nearby rows' query.",
          detailed:
            "Naively, 'find nearby drivers' looks like `SELECT * FROM drivers WHERE distance(location, rider_location) < 5km` — this is a disaster at scale: it requires scanning huge numbers of rows, recomputing distance for each, and it has to run *continuously* as both rider and drivers move every few seconds. The real architecture: (1) Geospatial indexing — divide the map into cells using geohashing (encode lat/long into a string where nearby locations share string prefixes — 'find nearby' becomes 'find matching prefixes', a much cheaper operation) or quad-trees (recursively divide regions into quadrants, denser areas get finer subdivision). Either lets you answer 'who's in this region' in roughly constant time instead of scanning everything. (2) A real-time location pipeline — each driver's app streams location updates (every few seconds) into a system that updates their geospatial cell membership; this is itself a high-throughput write problem (millions of location pings per second in a big city) that benefits from a message queue and in-memory store (Redis supports geospatial commands like `GEOADD`/`GEORADIUS` natively, which is why many real systems use it for exactly this). (3) Matching logic — once you have a candidate set of nearby drivers, you still need to *rank* them: distance alone isn't enough — factor in driver rating, whether they're heading in a compatible direction, ETA (which depends on real road networks, not straight-line distance), and fairness (so the same driver isn't always picked). (4) The handoff — once matched, you need a reliable state machine for the ride lifecycle (requested → matched → driver-en-route → in-progress → completed) with timeouts and re-matching if a driver doesn't respond. Naming geospatial indexing unprompted is the single biggest signal in this question — most candidates default to a relational 'nearby query' and miss that it's fundamentally the wrong tool.",
        },
        keyPoints: [
          "The crux is geospatial search at scale — naive distance queries over a relational table don't survive contact with real traffic; name geohashing or quad-trees explicitly",
          "Treat location updates as a high-throughput streaming problem (queue + in-memory geospatial store like Redis GEO commands), not as simple row updates",
          "Matching is ranking, not just filtering — distance, driver rating, direction compatibility, ETA (road-network-aware), and fairness all factor in",
          "Model the ride lifecycle as an explicit state machine with timeouts and re-matching — 'driver doesn't respond' is a normal case, not an edge case, at this scale",
        ],
        followUps: [
          "How would you handle the 'thundering herd' of ride requests during a surge event (e.g., a concert ending)?",
          "How would surge pricing be computed and propagated without causing rider/driver confusion?",
          "How would you make ETA predictions, and what data would you need beyond straight-line distance?",
        ],
        example:
          "Uber has published extensively on H3, their open-source hexagonal hierarchical geospatial indexing system — built specifically because geohash's rectangular cells produce uneven neighbor-distance distortions at certain latitudes, and hexagons have uniform adjacency, making 'find nearby' computations both faster and more geometrically accurate at global scale.",
      },
      {
        id: "hld-design-news-feed",
        title: "Design a news feed (like Facebook/Instagram/LinkedIn) — fan-out on write or fan-out on read?",
        difficulty: "Hard",
        category: "hld-interview-qa",
        question:
          "Design the system that generates a user's home feed from posts made by people they follow. What's the central architectural fork in the road, and how do you decide?",
        answer: {
          short:
            "The central fork is fan-out-on-write (pre-compute every follower's feed when a post is made — fast reads, expensive/wasteful writes) vs fan-out-on-read (assemble the feed at request time by querying all followees — cheap writes, expensive reads) — and the real-world answer is a hybrid that picks per-user based on follower count.",
          detailed:
            "Fan-out-on-write (push model): when a user posts, immediately write that post into the pre-computed feed/inbox of every follower. Reading a feed is then just 'fetch my pre-built list' — extremely fast, O(1)-ish. The cost shows up on the write side: a celebrity with 50M followers triggers 50M writes for a single post — a 'thundering herd' / hot-write problem that can overwhelm the system, and most of that fan-out work may be wasted (many followers won't check their feed before the post is buried by newer ones anyway). Fan-out-on-read (pull model): store posts once; when a user opens their feed, query all the people they follow, merge and rank results on the fly. Writes are trivial (O(1) — just store the post), but reads become expensive — a user following 5,000 accounts triggers a 5,000-way fan-in merge on every feed load, and that cost is paid on the much more frequent operation (people check feeds far more often than celebrities post). The production answer is a hybrid: fan-out-on-write for the vast majority of users (whose follower counts are modest, so the write cost is small and the read stays fast), and fan-out-on-read for celebrity/high-follower accounts (compute their contribution to a follower's feed at read time, merging it with the follower's pre-computed feed from everyone else). This hybrid is the single most-cited 'aha' answer in feed-design interviews — naming it (and explaining *why* — the asymmetry between celebrity post frequency and follower check frequency) is what separates a strong answer from a merely-correct one.",
        },
        keyPoints: [
          "Fan-out-on-write: fast reads (pre-computed), but write amplification is brutal for high-follower accounts ('thundering herd' on every celebrity post)",
          "Fan-out-on-read: trivial writes, but expensive reads — and reads happen far more often than celebrity posts, so you're optimizing the wrong side",
          "The hybrid (push for normal users, pull-and-merge for celebrities) is the canonical 'I've thought about this deeply' answer — name it and explain the asymmetry that motivates it",
          "Ranking (not just chronological ordering) is a second major sub-problem — ML-based relevance scoring is its own system that this design must leave room to plug into",
        ],
        followUps: [
          "How would you define the threshold for 'celebrity' that triggers the pull-model treatment?",
          "How would you incorporate ranking/relevance (not just chronological order) into this design?",
          "How would you handle a user who follows 10,000 accounts — does the hybrid model still hold up?",
        ],
        example:
          "This is a real, named problem in the industry — Twitter's engineering blog has described exactly this hybrid (their 'fanout service' pre-computes timelines for most users via Redis-backed structures, while high-follower accounts are merged in at read time) — it's not a hypothetical interview trick, it's how the actual system is built, which is why naming it lands so well.",
      },
      {
        id: "hld-microservices-data-consistency",
        title: "How do you keep data consistent across microservices without distributed transactions?",
        difficulty: "Hard",
        category: "hld-interview-qa",
        question:
          "An order-placement flow needs to update the orders service, reserve inventory, and charge a payment — each owned by a different service with its own database. You can't use a two-phase commit across them. How do you keep this consistent?",
        answer: {
          short:
            "Use the Saga pattern: break the flow into a sequence of local transactions, each publishing an event that triggers the next step, with explicit compensating transactions to undo prior steps if something downstream fails — trading atomicity for an explicit, designed-for rollback path.",
          detailed:
            "Two-phase commit (2PC) doesn't survive in microservices — it requires a coordinator to hold locks across all participants until everyone agrees to commit, which means any one slow/down service blocks all the others, defeating the entire point of splitting into independent services. The Saga pattern instead breaks the flow into a chain of local transactions, each of which is atomic *within its own service*, with the overall consistency achieved through choreography or orchestration: Choreography — each service publishes an event when it completes its step, and the next service subscribes and reacts (Order service creates a pending order → publishes `OrderCreated` → Inventory service reserves stock → publishes `InventoryReserved` → Payment service charges the card → publishes `PaymentCompleted` → Order service marks the order confirmed). It's decentralized and avoids a single point of control, but the overall flow's logic is scattered across services, making it hard to see 'what's the whole process' in one place. Orchestration — a central saga orchestrator explicitly calls each service in sequence and tracks the state of the whole flow — easier to understand, monitor, and debug (one place to look), at the cost of that orchestrator becoming a coordination hot-spot. Either way, the *crucial* design element is compensating transactions: if payment fails after inventory was reserved, you must explicitly run `ReleaseInventory` (and `CancelOrder`) — there's no automatic rollback like in a database transaction; you design the 'undo' for every step up front, as a first-class part of the design, not an afterthought. This is the single biggest mental shift from monolith thinking: consistency becomes something you *design and code for explicitly*, not something the database guarantees for free.",
        },
        keyPoints: [
          "2PC doesn't survive microservices — its locking model defeats the independence that's the entire point of the split",
          "Saga = a chain of local transactions + compensating transactions — choreography (event-driven, decentralized) vs orchestration (central coordinator, easier to observe)",
          "Compensating transactions must be designed explicitly for every step — there's no automatic rollback; 'how do we undo this?' is a first-class design question, not an afterthought",
          "This is the core mental shift from monolith to microservices: consistency moves from 'the database guarantees it' to 'we design and code for it' — eventual, not atomic",
        ],
        followUps: [
          "What's the 'outbox pattern' and how does it prevent a service from publishing an event for a transaction that later rolls back?",
          "How would you debug a saga that got stuck halfway through, in production, at 2am?",
          "When would you choose choreography over orchestration, or vice versa?",
        ],
        example:
          "This is a famous, real production challenge — multiple e-commerce postmortems describe sagas that got stuck in inconsistent intermediate states (inventory reserved, payment failed, compensating transaction itself failed) during partial outages; the lesson the industry converged on is that compensating transactions need their *own* retry/idempotency/monitoring — they're not a one-line afterthought, they're a subsystem in their own right.",
      },
    ],
  },
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "cheat-sheet",
    icon: "📋",
    title: "Cheat Sheet — Quick Reference",
    color: "#fbbf24",
    problems: [
      {
        id: "cheat-numbers-to-memorize",
        title: "Numbers every system design candidate should have memorized",
        difficulty: "Easy",
        category: "cheat-sheet",
        question: "What 'latency numbers every programmer should know' and availability/scale figures are worth memorizing cold for an interview?",
        answer: {
          short:
            "A handful of orders-of-magnitude facts let you do live capacity math and sanity-check any number an interviewer throws at you — the goal isn't precision, it's instant, confident estimation.",
          detailed:
            "Latency ladder (orders of magnitude, not exact figures): L1 cache ~1ns, main memory ~100ns, SSD random read ~100µs, network round trip same-datacenter ~0.5ms, disk seek ~10ms, network round trip cross-continent ~150ms. The takeaway to *say out loud*: 'memory is ~100,000x faster than disk, and a same-datacenter round trip is ~100x faster than a cross-continent one — that's why caching and regional deployment are the two biggest levers in any design.' Availability ladder: 99% ≈ 3.65 days down/year, 99.9% (\"three nines\") ≈ 8.7 hours/year, 99.99% (\"four nines\") ≈ 52 minutes/year, 99.999% (\"five nines\") ≈ 5 minutes/year — each additional nine is roughly an order of magnitude harder and more expensive to achieve. Scale shortcuts: 1 million requests/day ≈ 11.6 requests/sec on average (10^6 ÷ 86,400 ≈ 11.6 — memorize 'seconds per day ≈ 10^5'); peak load is commonly 2-5x average load — always mention you're accounting for it. Storage shortcuts: 1 character ≈ 1 byte (UTF-8 ASCII), a UUID ≈ 16 bytes (36-char string form ≈ 36 bytes), a typical JSON API response row ≈ 0.5-2KB — useful for back-of-envelope storage estimates.",
        },
        keyPoints: [
          "Latency ladder: memory ≈ 100,000x faster than disk; same-DC round trip ≈ 100x faster than cross-continent — say this to justify caching and regional deployment",
          "Availability ladder: 99.9% ≈ 8.7h/yr down, 99.99% ≈ 52min/yr, 99.999% ≈ 5min/yr — each nine costs roughly 10x more",
          "Scale shortcut: seconds-per-day ≈ 10^5, so 1M req/day ≈ 11.6 RPS average — and always multiply by 2-5x for peak",
          "These numbers exist to let you reason live, not to be recited — use them to *justify* a design choice in the same breath",
        ],
        followUps: [],
        example:
          "When an interviewer says 'we expect 50 million requests per day,' converting that instantly to '~580 RPS average, call it ~2,000 RPS at peak — that's comfortably within a single well-cached service tier, no need to shard yet' is the kind of fluent, on-the-spot reasoning these numbers are meant to enable.",
      },
      {
        id: "cheat-sql-vs-nosql-table",
        title: "SQL vs NoSQL — the one-glance decision table",
        difficulty: "Easy",
        category: "cheat-sheet",
        question: "If I need to choose a database family in 30 seconds, what's the fastest mental checklist?",
        answer: {
          short: "Ask: do I need joins/transactions (→ relational), flexible/nested schema (→ document), pure key lookups at extreme scale (→ key-value/wide-column), or relationship traversal (→ graph)?",
          detailed:
            "Relational (Postgres/MySQL): pick when you need ACID transactions, complex queries/joins across well-defined relationships, and a schema that's mostly stable. Strength: correctness guarantees and query flexibility. Watch-out: scaling writes requires sharding, which removes the cross-shard join/transaction guarantees you picked it for. Document (MongoDB/DynamoDB-document-mode): pick when records are naturally self-contained and their shape varies or evolves often (user profiles, content/CMS, product catalogs with category-specific fields). Watch-out: querying/updating deeply nested or embedded data gets awkward fast. Key-Value (Redis/DynamoDB/Memcached): pick for blazing-fast lookups by a known key — sessions, caches, feature flags, rate-limit counters. Watch-out: no querying by value, no relationships — it's a hashmap, treat it like one. Wide-Column (Cassandra/HBase/ScyllaDB): pick for write-heavy, time-series, or massive-scale append-style data with simple, partition-key-driven access patterns (chat messages, IoT telemetry, event logs). Watch-out: secondary-index queries and ad-hoc analytics are painful — you must design around your access pattern up front. Graph (Neo4j/Neptune): pick when the *relationships themselves* are the primary thing you query (social graphs, recommendation engines, fraud-ring detection — 'friends of friends who also did X'). Watch-out: overkill for data where relationships are shallow or rarely traversed.",
        },
        keyPoints: [
          "Relational → joins + ACID + stable-ish schema. Document → self-contained, evolving-shape records. Key-Value → pure fast lookups by key.",
          "Wide-Column → write-heavy/time-series/append-only at massive scale, simple access patterns. Graph → relationships ARE the query.",
          "Every family is a trade — name what you're giving up, not just what you're gaining ('I'm choosing document for flexibility, accepting that cross-record queries get harder')",
          "Polyglot persistence (one store per workload) is normal in real systems — don't feel pressure to pick exactly one for an entire design",
        ],
        followUps: [],
        example:
          "A single product can legitimately use all five: Postgres for orders (ACID), MongoDB for product catalog (varying attributes per category), Redis for sessions/cache (speed), Cassandra for activity logs (write-heavy scale), and Neo4j for 'people who bought this also bought' (relationship traversal) — naming this kind of polyglot mix unprompted is a strong signal.",
      },
      {
        id: "cheat-consistency-models-table",
        title: "Consistency models — the one-glance decision table",
        difficulty: "Easy",
        category: "cheat-sheet",
        question: "How do I quickly decide which consistency model a given feature needs?",
        answer: {
          short: "Ask one question: 'what's the real-world cost of a stale read here?' Money/inventory/safety → strong. Social/engagement metrics → eventual. Causally-linked content (replies, threads) → causal.",
          detailed:
            "Strong consistency — use when staleness causes tangible harm: account balances, inventory/seat counts, anything where two readers disagreeing could cause a double-spend or double-booking. Cost: higher latency (often a quorum round trip), reduced availability during partitions. Eventual consistency — use when staleness is invisible or harmless for the relevant time window: like counts, view counts, follower counts, search index freshness, profile updates. Cost: a (usually short) window where different readers see different answers — and you must design the UX to tolerate it gracefully. Causal consistency — use when *ordering* matters more than absolute freshness: comment threads, chat messages, collaborative editing — you must never see a reply before the message it replies to, even if you're fine seeing it a few seconds 'late'. Read-your-own-writes — a special, frequently-needed guarantee: a user should always see *their own* update immediately, even if the system is eventually consistent for everyone else (classic fix: route a user's reads to the same replica their write went to, for a short window after writing).",
        },
        keyPoints: [
          "The one-question filter: 'what's the real-world cost of showing stale data here?' — that answer picks your model",
          "Strong: money, inventory, safety. Eventual: social metrics, profiles, search freshness. Causal: anything with cause-and-effect ordering (threads, chat).",
          "Read-your-own-writes is the guarantee users notice the most and complain about loudest when it's missing — design for it explicitly even in eventually-consistent systems",
          "Don't pick one model for the whole system — mix per-feature based on each feature's actual tolerance for staleness",
        ],
        followUps: [],
        example:
          "A profile page might mix all three in one view: the user's own just-edited bio (read-your-own-writes), their friend's like count (eventual), and a comment thread (causal) — three different guarantees serving three different parts of one screen, each chosen deliberately.",
      },
      {
        id: "cheat-resilience-stack",
        title: "The resilience stack — what goes where, in order",
        difficulty: "Medium",
        category: "cheat-sheet",
        question: "If I'm asked 'how would you make this service resilient,' what's the ordered checklist I should run through?",
        answer: {
          short: "Timeouts → Retries (backoff + jitter) → Circuit breaker → Bulkhead → Fallback → Idempotency — each layer catches a failure mode the previous one doesn't.",
          detailed:
            "1) Timeouts — the foundation; without them, one hung call can occupy a thread/connection forever. Every network call gets one, sized to the operation (a cache lookup and a report-generation call shouldn't share a timeout). 2) Retries with exponential backoff and jitter — handle transient blips (a dropped packet, a GC pause); jitter specifically prevents synchronized retry storms across many clients. 3) Circuit breaker — stop calling a dependency that's clearly broken; protects both it (room to recover) and you (stop burning your own resources on calls that won't succeed). 4) Bulkhead — isolate resource pools per dependency so one slow dependency can't starve calls to healthy ones (named for ship compartments containing flooding). 5) Fallback / graceful degradation — when a dependency is unavailable, serve a cached value, a default, or a reduced feature set instead of a hard error. 6) Idempotency — the prerequisite that makes retries *safe* for writes: an idempotency key ensures 'charge this card' executed twice has the same effect as once.",
        },
        keyPoints: [
          "Timeouts are the foundation — nothing else in the stack matters if a single call can hang forever",
          "Backoff handles 'how long to wait'; jitter handles 'don't all retry at the same instant' — both are needed, neither alone is enough",
          "Circuit breakers and bulkheads solve different problems: 'stop calling a broken dependency' vs 'don't let one dependency's slowness exhaust shared resources'",
          "Idempotency isn't optional once you have retries on writes — without it, a retried payment can become a double charge",
        ],
        followUps: [],
        example:
          "Reciting this stack in order, and explaining *what specific failure mode each layer catches that the previous layer misses*, is one of the highest-density ways to demonstrate production experience in a single answer — it shows you've been paged for each of these failure modes individually.",
      },
      {
        id: "cheat-scaling-playbook",
        title: "The 'scale this system' playbook — the order operations usually pay off",
        difficulty: "Medium",
        category: "cheat-sheet",
        question: "When asked to scale an existing system, what's a sensible default order of moves before reaching for something drastic like sharding?",
        answer: {
          short: "Measure → Cache → Replicate reads → Make stateless + horizontally scale → Queue the slow stuff → Shard (last resort) — each step is cheaper and less risky than the next.",
          detailed:
            "1) Measure first — find the actual bottleneck (CPU? DB locks? network? a slow downstream call?) before changing anything; scaling the wrong layer wastes effort and adds complexity for zero benefit. 2) Cache — CDN for static/cacheable content, application-level cache (Redis) for hot reads; usually the highest-leverage, lowest-risk change for read-heavy systems. 3) Read replicas — decouple read scaling from write scaling; route reads through a proxy/load balancer, keep writes on the primary. 4) Statelessness + horizontal scaling — move sessions out of the app process (Redis), put the app tier behind a load balancer with auto-scaling. 5) Asynchronous processing — move slow/non-critical work (emails, transcoding, exports, analytics) off the request path and into background workers via a queue. 6) Sharding — the last resort: split data across multiple database instances by a carefully-chosen key; accept that joins, transactions, and resharding all get harder. Each step down this list is progressively more invasive, expensive, and risky to reverse — exhaust the cheap, low-risk wins before reaching for the operationally heavy ones.",
        },
        keyPoints: [
          "Always measure before changing anything — 'what's actually slow?' beats any generic playbook",
          "Caching and read replicas solve the vast majority of read-scaling problems cheaply — reach for them long before sharding",
          "Statelessness is the prerequisite for horizontal auto-scaling — it has to happen before 'just add more servers' is even possible",
          "Sharding is a one-way door — it's last on this list because it's the hardest to undo and the most operationally expensive",
        ],
        followUps: [],
        example:
          "Most 'design X at scale' interview answers that feel rushed skip straight to sharding because it sounds impressive — but naming the cheaper, lower-risk steps *first*, and explaining why you'd exhaust them before sharding, reads as far more senior than jumping to the most complex tool in the box.",
      },
      {
        id: "cheat-tradeoff-soundbites",
        title: "Trade-off soundbites — one-liners that land in any HLD/LLD round",
        difficulty: "Medium",
        category: "cheat-sheet",
        question: "What are some crisp one-line framings that show depth quickly when you're explaining a trade-off out loud?",
        answer: {
          short: "Short, precise framings that name *both sides* of a trade-off in one breath read as fluency — here are the highest-mileage ones worth having ready.",
          detailed:
            "On consistency: 'I'm choosing eventual consistency here because the cost of a few seconds of staleness is near-zero, but the cost of unavailability during a partition is real lost revenue.' On caching: 'A cache turns a database problem into a cache-invalidation problem — which is usually the better problem to have, but it IS a new problem, not a free lunch.' On microservices: 'I'd start with a modular monolith — clean internal boundaries — so that splitting later is an extraction, not a rewrite.' On async: 'If the user doesn't need the result synchronously, they don't need to wait for it synchronously either — accept fast, process in the background, notify on completion.' On sharding: 'Sharding solves a scale problem by creating a join problem — I'd only reach for it once caching, replicas, and indexing are exhausted.' On security/secrets: 'Secrets belong in a vault with short-lived, automatically-rotated credentials — not in config files, and definitely not in logs.' On observability: 'If I can't see it, I can't fix it at 2am — every new service ships with metrics, structured logs, and tracing from day one, not as a follow-up ticket.'",
        },
        keyPoints: [
          "A trade-off framed in one sentence, naming both the cost and the benefit, reads as more senior than a paragraph of hedging",
          "'X turns a Y problem into a Z problem' is a powerful rhetorical shape — it shows you know nothing is free, only traded",
          "Practice saying these out loud — interviews are a spoken-word format, and fluency under pressure is itself part of the grade",
          "Tailor the soundbite to what the interviewer seems to care about (cost? latency? team velocity?) — the same trade-off can be framed multiple honest ways",
        ],
        followUps: [],
        example:
          "'A cache turns a database problem into a cache-invalidation problem' is a real line that interviewers remember — not because it's clever, but because it's *true*, compact, and immediately invites the natural follow-up ('so how would you invalidate it?') that lets you keep demonstrating depth.",
      },
      {
        id: "cheat-questions-to-ask-back",
        title: "Questions to ask the interviewer — and why each one is itself a signal",
        difficulty: "Easy",
        category: "cheat-sheet",
        question: "Beyond basic scoping, what questions can I ask during the round that double as signals of seniority?",
        answer: {
          short: "Questions that reveal you're thinking about trade-offs, failure modes, and evolution over time — not just 'how big is it' — read as senior-level instincts in disguise.",
          detailed:
            "'Is there an existing system this needs to integrate with, or are we greenfield?' (shows you think about migration cost and integration surface, not just clean-slate design). 'What's the team's operational maturity — do we have an SRE function, observability stack, on-call rotation?' (shows you know that a design's *operability* is as real a constraint as its architecture — a brilliant design an under-staffed team can't run is not actually a good design). 'Which failure would be more costly: showing slightly stale data, or being briefly unavailable?' (this is the PACELC question in disguise — asking it shows you already know the trade-off exists and want the business context to resolve it correctly). 'How do we expect this to evolve in a year — 10x growth? new feature surface? new regulatory requirements (data residency, GDPR)?' (shows you design for *change*, not just for the spec as given — today's clean design is tomorrow's legacy system if it can't absorb growth). Each of these questions does double duty: it gets you real information you need, *and* it signals to the interviewer that you think like someone who's shipped and operated systems, not just designed them on a whiteboard.",
        },
        keyPoints: [
          "'Integrate with existing systems or greenfield?' — shows you think about migration and integration cost, the part real-world projects spend most of their time on",
          "'What's the team's operational maturity?' — operability is a real design constraint; a design the team can't run isn't actually a good design",
          "'Stale-but-available, or correct-but-down — which costs more here?' — the PACELC question in business language; asking it shows you already see the trade-off",
          "'How does this evolve in a year?' — designing for change, not just for the spec as stated, is what separates senior thinking from junior thinking",
        ],
        followUps: [],
        example:
          "Asking 'what's our on-call story for this?' mid-design is a small moment that often visibly shifts an interviewer's read on a candidate — it signals you've been the person woken up at 2am by a system someone designed without thinking about who'd have to run it.",
      },
    ],
  },
  // ────────────────────────────────────────────────────────────────────────
  {
    id: "classic-system-design-problems",
    icon: "🧩",
    title: "Classic System Design Problems",
    color: "#0EA5E9",
    problems: [
      {
        id: "jira-project-management",
        title: "Design a project management tool like Jira",
        difficulty: "Hard",
        category: "classic-system-design-problems",
        question:
          "Design a project management tool like Jira that supports boards, epics, custom workflows per team, and scales to millions of organizations.",
        answer: {
          short:
            "Model everything around one generic Issue entity with a pluggable per-project workflow (a state machine of statuses and transitions), and treat boards/sprints as read-side projections over that data, not separate sources of truth.",
          detailed:
            "Core entities: Issue (type: story/bug/task/epic, fields, status, assignee), Project (owns a Workflow Scheme), Workflow (a directed graph of statuses and allowed transitions, e.g. TODO → IN_PROGRESS → IN_REVIEW → DONE, with role-gated edges), Board (a saved filter + column mapping over issues), Sprint (a time-boxed issue collection). Multi-tenancy: small/medium orgs share partitioned tables keyed by tenant_id with row-level isolation; very large orgs (10K+ seats) can be split to dedicated shards. The workflow engine is the trickiest part — instead of hardcoding statuses, model transitions as data (workflow_transitions table: from_status, to_status, required_role, post-functions like 'auto-assign on transition to IN_PROGRESS') so each team customizes without code changes. Every field change is appended to an immutable changelog table (issue_id, field, old_value, new_value, actor, timestamp) — this powers both the activity feed and audit/compliance requirements. Search (JQL) is served by Elasticsearch with a permission-aware index (each doc carries project_id + visible_role list so unauthorized issues never appear in results). Boards are materialized queries, refreshed via the same event stream that updates the changelog, so board state never drifts from issue state.",
        },
        keyPoints: [
          "One generic Issue entity + a data-driven workflow (state machine as rows, not code) is what makes per-team customization possible without N codepaths",
          "Boards and sprints are projections/views over issues — never a second source of truth, or they will drift",
          "An append-only changelog table is non-negotiable — it's the audit trail, the activity feed, and the undo mechanism all at once",
          "Permission-aware search (filtering at index time, not query time) is what keeps JQL-style search both fast and secure across multi-project orgs",
        ],
        followUps: [
          "How would you support a workflow scheme shared across 50 projects but customized per-project?",
          "How do you handle a single organization with 500K issues without degrading search latency for everyone else?",
          "How would you implement real-time updates so two people viewing the same board see changes instantly?",
        ],
        example:
          "Atlassian's real architecture separates 'workflow schemes' (reusable graphs) from per-project overrides, and JQL is compiled down to an Elasticsearch query with an injected permission filter — exactly the pattern that keeps a 20-year-old product still able to onboard new customization without a rewrite.",
      },
      {
        id: "real-time-collaboration-platform",
        title: "Design a real-time collaboration platform (like Google Docs / Figma)",
        difficulty: "Hard",
        category: "classic-system-design-problems",
        question:
          "Design a real-time collaborative document editor where multiple users can type in the same document simultaneously and see each other's changes live.",
        answer: {
          short:
            "Route every document to one owning server that holds it in memory, broadcast operations over WebSockets, and resolve concurrent edits with Operational Transformation or a CRDT so every client converges to the same final state regardless of edit order.",
          detailed:
            "Two competing techniques solve concurrent editing: Operational Transformation (OT) — each edit is an operation (insert/delete at position); when two operations arrive out of order, the server transforms one against the other so they still apply correctly (Google Docs' approach) — and CRDTs (Conflict-free Replicated Data Types) — each character/element gets a unique, order-preserving ID, so merges are commutative and don't need a central transform step (used by Figma, Notion). CRDTs are simpler to reason about and work better offline-first, but carry more metadata overhead per character. Architecture: a document is owned by exactly one 'document server' instance at a time (consistent hashing by doc_id), which holds the live in-memory state and the connected clients' WebSocket connections; this avoids needing distributed consensus for every keystroke. Edits go: client → owning server (apply + transform/merge) → broadcast to all other connected clients for that doc. Persistence: periodic snapshots to object storage plus an append-only operation log, so a server crash only loses the in-flight ops since the last snapshot, replayed from the log. Presence (cursors, who's viewing) is ephemeral pub/sub, not persisted. Reconnection: client sends its last-known version; server replays missed ops or sends a full snapshot if too far behind.",
        },
        keyPoints: [
          "OT (Google Docs) needs a central authority to transform conflicting ops; CRDTs (Figma, Notion) make merges commutative so peers can apply ops in any order and converge — pick based on whether you need offline support",
          "Pin each document to one owning server via consistent hashing — keeps the hot path (apply + broadcast) in-memory and avoids per-keystroke consensus",
          "Persist via snapshot + op log, not a write per keystroke to the primary DB — replay the log to reconstruct state after a crash",
          "Presence (cursors, live viewers) is ephemeral and should never touch durable storage — it's pure pub/sub",
        ],
        followUps: [
          "How would you shard so one wildly popular shared doc doesn't overload a single server?",
          "How do you handle a client that's been offline for an hour and reconnects?",
          "What happens if the server owning a document crashes mid-edit?",
        ],
        example:
          "Figma's multiplayer engine uses a CRDT-like property graph synced over WebSockets, with a single Rust server process per file holding authoritative state in memory — explicitly chosen because it makes conflict resolution embarrassingly simple compared to OT's transform matrices.",
      },
      {
        id: "scalable-notification-system",
        title: "Design a scalable notification system",
        difficulty: "Medium",
        category: "classic-system-design-problems",
        question:
          "Design a notification system that can send push, email, SMS, and in-app notifications to hundreds of millions of users without overwhelming any single channel provider.",
        answer: {
          short:
            "Decouple 'a notification should be sent' from 'how it gets delivered' with a queue in between, fan out to per-channel workers that each respect their provider's rate limits, and make every send idempotent so retries never double-notify a user.",
          detailed:
            "Producers (any internal service — order service, social service) publish a notification event to a Kafka topic rather than calling a delivery API directly — this decouples business logic from delivery concerns and absorbs spikes. A Notification Orchestrator consumes the topic, resolves: (1) user preferences (which channels are enabled, quiet hours), (2) template (renders the message body per locale), (3) channel routing (push vs email vs SMS based on priority and user settings) — and emits one task per channel to channel-specific queues. Each channel has its own worker pool tuned to its provider's limits: FCM/APNs push workers can burst to thousands/sec, SMS workers via Twilio are rate-limited and cost real money so they get a strict token-bucket limiter, email workers batch via SES/SendGrid. Idempotency: every notification carries a dedup key (event_id + user_id + channel); workers check a Redis SET (or DB unique constraint) before sending, so a re-processed Kafka message after a worker crash never double-sends. Delivery tracking: provider webhooks (FCM delivery receipts, SES bounce/complaint events) feed back into a notification_log table for analytics and to auto-disable channels with high bounce/complaint rates per user. Low-priority notifications (weekly digest, recommendations) are batched and rate-shaped; high-priority (OTP, security alerts) bypass batching and go out immediately.",
        },
        keyPoints: [
          "A queue between 'event happened' and 'notification sent' is what absorbs traffic spikes and decouples business logic from delivery — never call provider APIs synchronously from request handlers",
          "Each channel (push/SMS/email) needs its own worker pool and rate limiter tuned to that provider's actual limits — one slow channel must never block another",
          "Idempotency keys are mandatory — at-least-once delivery from Kafka means workers WILL occasionally see the same message twice",
          "Feed delivery receipts (bounces, complaints, invalid tokens) back into user preference state — silently retrying a dead push token forever wastes capacity",
        ],
        followUps: [
          "How do you prevent a user from getting the same notification on 3 devices simultaneously?",
          "How would you implement 'quiet hours' without delaying a critical security alert?",
          "How do you handle a provider (e.g., FCM) being down for 10 minutes?",
        ],
        example:
          "Uber's notification platform routes hundreds of millions of daily events through Kafka into channel-specific workers, with a dedicated 'notification decision service' that resolves user preferences once per event so individual channel workers stay simple and stateless.",
      },
      {
        id: "knowledge-base-search-engine",
        title: "Design a search engine for knowledge base articles",
        difficulty: "Medium",
        category: "classic-system-design-problems",
        question:
          "Design a search system for an internal knowledge base (like Confluence search) that supports full-text search, ranking by relevance and freshness, and respects per-document access control.",
        answer: {
          short:
            "Index documents into Elasticsearch with an inverted index for full-text matching, rank with BM25 blended with freshness and click-through signals, and bake access control into the index itself so permission checks never happen as a slow post-query filter.",
          detailed:
            "Ingestion: a CDC (change data capture) pipeline or explicit publish-event listens for document create/update/delete and pushes to an indexing queue; an Indexer Worker tokenizes the content (stemming, stop-word removal, language detection), and writes to Elasticsearch with fields: title, body (analyzed for full-text), tags, last_updated, view_count, and — critically — acl: an array of role/group IDs allowed to view it. Query: incoming search request resolves the user's group memberships, and the ES query includes a 'filter: acl in [user's groups]' clause — this means permission checks happen inside the index lookup (fast, uses ES's filter cache) rather than as an application-layer filter after fetching results (which would require over-fetching to backfill a page after removing unauthorized hits). Ranking combines BM25 (term frequency/inverse document frequency relevance score) with a freshness decay (recently updated docs score higher — most useful in fast-moving wikis) and a popularity signal (view_count, or better, click-through rate from past searches, learned via periodic re-ranking). Typo tolerance and synonyms (e.g., 'k8s' → 'kubernetes') are handled via ES's fuzzy matching and a synonym filter maintained by the team. Reindexing on doc update is incremental (single-document upsert), not a full rebuild — full rebuilds are reserved for analyzer/schema changes and run as a blue-green index swap with zero downtime.",
        },
        keyPoints: [
          "Bake ACLs into the document's index entry and filter at query time inside Elasticsearch — never fetch-then-filter in application code, it breaks pagination and leaks document existence",
          "BM25 alone isn't enough for a living knowledge base — blend in freshness decay and click/popularity signals so stale-but-keyword-matchy docs don't outrank the current canonical one",
          "Incremental single-doc indexing on every update keeps the index fresh in seconds; reserve full reindexing for schema/analyzer changes via blue-green index swap",
          "Synonym and typo tolerance (fuzzy match, custom synonym dictionaries) matter enormously for internal jargon-heavy content — generic search tuning underperforms here",
        ],
        followUps: [
          "How would you handle a document whose permissions change after it's indexed?",
          "How do you keep search fast when the knowledge base has 10 million documents?",
          "How would you support 'search within this space/folder only'?",
        ],
        example:
          "Confluence's search indexes permission data alongside content and pushes group-membership filters down into the Lucene query itself — the same general pattern GitHub Code Search uses to make sure a private repo never surfaces in a public search result.",
      },
      {
        id: "api-gateway-design",
        title: "Design an API gateway for a suite of microservices",
        difficulty: "Medium",
        category: "classic-system-design-problems",
        question:
          "Design an API gateway that sits in front of dozens of internal microservices (like Atlassian's suite — Jira, Confluence, Bitbucket) handling auth, routing, and rate limiting.",
        answer: {
          short:
            "A stateless edge layer that terminates TLS, authenticates once, routes by path/host to the right backend via service discovery, enforces per-tenant rate limits with a token bucket, and emits uniform observability — so individual services don't each reimplement these cross-cutting concerns.",
          detailed:
            "Responsibilities, top to bottom of the request path: (1) TLS termination and request validation (size limits, malformed JSON rejected early, cheap to do at the edge). (2) AuthN: validate JWT/OAuth token signature and expiry once at the gateway — downstream services trust a signed internal header (e.g., X-User-Id, X-Tenant-Id) instead of re-validating tokens, saving redundant work across dozens of services. (3) AuthZ: coarse-grained checks (does this token have the right scope for this route) happen at the gateway; fine-grained, resource-level checks (can this user edit this specific issue) stay in the owning service, which has the domain context. (4) Routing: path-prefix or host-based routing (e.g., /jira/* → Jira service) resolved via a service registry (Consul/Eureka) or static config, with health-check-aware load balancing so traffic never routes to an unhealthy instance. (5) Rate limiting: token bucket per (tenant, route) pair backed by Redis (INCR + EXPIRE, or a Lua script for atomicity) — protects backend services from a single noisy tenant. (6) Resilience: circuit breaker per backend (trip after N consecutive failures, fail fast instead of piling up timeouts) and configurable per-route timeouts/retries with jitter. (7) Observability: every request gets a trace ID injected at the gateway and propagated downstream, plus uniform access logs and latency histograms — this is often the gateway's most underrated value, since it turns 'add tracing' from an N-service problem into a 1-service problem.",
        },
        keyPoints: [
          "Centralize coarse authN/authZ and TLS termination at the gateway so services trust a signed internal header instead of each re-validating tokens",
          "Keep fine-grained, resource-level authorization in the owning service — the gateway doesn't have the domain context to know if 'this user' can edit 'this specific issue'",
          "Rate limit per (tenant, route), not globally — one noisy tenant shouldn't be able to degrade service for everyone, and one hot route shouldn't starve quota for unrelated ones",
          "Inject a trace ID at the gateway and propagate it downstream — this single change makes distributed tracing tractable across dozens of services",
        ],
        followUps: [
          "How do you avoid the gateway itself becoming a single point of failure?",
          "How would you roll out a new version of a backend service with zero downtime through the gateway?",
          "What's the trade-off between a centralized gateway and a service-mesh sidecar model?",
        ],
        example:
          "Atlassian's edge gateway (Micros/Envoy-based) authenticates once and forwards a signed Atlassian-Account-Id header to every downstream call across Jira, Confluence, and Bitbucket — letting each product team skip reimplementing OAuth validation in every service.",
      },
      {
        id: "version-control-docs",
        title: "Design a version control system for documentation",
        difficulty: "Medium",
        category: "classic-system-design-problems",
        question:
          "Design a version control system for documentation pages (like Confluence's page history) that lets users see past versions, diff changes, and revert.",
        answer: {
          short:
            "Store every saved edit as an immutable version row holding either a full snapshot or a diff against the previous version, and reconstruct any version on read by replaying diffs from the nearest snapshot — never mutate history in place.",
          detailed:
            "Two storage strategies, and real systems use a hybrid: (1) Full snapshot per version — simplest, fast reads (no reconstruction needed), but storage cost scales linearly with edit count × document size — wasteful for a page edited 500 times. (2) Diff-based — store only the delta (using a text diff algorithm like Myers diff, the same family git uses) between version N and N-1; cheap to store, but reconstructing version 1 of a 500-version document means replaying 499 diffs, which is slow. The practical hybrid: store a full snapshot every K versions (e.g., every 20th edit) and diffs in between — reconstruction never replays more than K diffs from the nearest snapshot. Schema: page_versions(id, page_id, version_number, author_id, created_at, content_snapshot NULLABLE, diff_from_previous NULLABLE, is_snapshot BOOLEAN). Diff rendering for the UI (showing 'added 3 lines, removed 1' between two versions) is computed on-demand at view time using the same diff algorithm, not stored redundantly. Revert is implemented as a new version whose content equals an old version's reconstructed content — never as deleting/rewriting history, which would break the audit trail and any links/permissions tied to specific version IDs. Concurrent edit conflicts (two users editing offline, both come back online) are resolved either with last-write-wins plus a conflict-version flag for manual merge, or — for richer collaborative cases — by funneling through the same OT/CRDT machinery used in real-time editors.",
        },
        keyPoints: [
          "Hybrid storage — full snapshot every K versions, diffs in between — bounds both storage cost and reconstruction time; pure-snapshot or pure-diff each fail at scale in one direction",
          "Revert creates a NEW version with old content; it never deletes or rewrites history — history must stay append-only for audit and stable permalink guarantees",
          "Diffs for display (UI 'what changed') are computed on-demand, not stored twice — storing both the version diff and a display diff is redundant",
          "Concurrent offline edits need an explicit conflict-resolution policy (last-write-wins + flag, or full OT/CRDT) — silently dropping one user's edit is the single most common bug in naive implementations",
        ],
        followUps: [
          "How would you support branching (draft vs published versions)?",
          "How do you keep diff computation fast for a 50-page document?",
          "How would you implement 'who changed this paragraph last' (blame view)?",
        ],
        example:
          "Git itself uses exactly this hybrid: objects are stored as full blobs but packed into delta-compressed packfiles during garbage collection, trading a bit of read-time CPU for a large reduction in repository size — the same trade-off documentation version history makes at a page level.",
      },
      {
        id: "real-time-analytics-platform",
        title: "Design a real-time analytics platform",
        difficulty: "Hard",
        category: "classic-system-design-problems",
        question:
          "Design a real-time analytics platform that ingests millions of events per second and powers live dashboards with second-level latency.",
        answer: {
          short:
            "Split the pipeline into a fast streaming path (Kafka → stream processor → pre-aggregated OLAP store) for live dashboards and a slower batch path for deep historical analysis, because no single system is both cheap-at-scale and millisecond-fresh.",
          detailed:
            "Ingestion: client/server SDKs send events to a collector service, which validates and writes to Kafka partitioned by a key that keeps related events together (e.g., user_id or session_id) for ordered processing. Stream processing: a Flink or Kafka Streams job consumes the topic and performs windowed aggregation — e.g., 'count of page_view events per page per 10-second tumbling window' — emitting pre-aggregated rows rather than raw events. This is the key design decision: dashboards query pre-aggregated rollups (by minute/hour), never raw events, because scanning billions of raw rows per dashboard refresh is a latency and cost disaster. Storage: pre-aggregated results land in a column-oriented OLAP store (ClickHouse or Druid) optimized for fast group-by/filter queries over time-series data; raw events also land in cheap, durable storage (S3 + Parquet via a separate batch sink) for the cases where someone needs to recompute a historical metric definition that didn't exist when the data was first ingested. Late/out-of-order events (a mobile client offline for 10 minutes) are handled via watermarks in the stream processor — a window stays open for a grace period after its nominal end time to admit slightly-late events before finalizing the aggregate. Dashboard reads hit the OLAP store directly with sub-second query latency; for true real-time (sub-5-second) metrics, a small in-memory layer (Redis counters) bypasses the OLAP store entirely for the handful of 'live counter' widgets that need it.",
        },
        keyPoints: [
          "Never query raw events for a dashboard — pre-aggregate in the stream processor into rollups (per minute/hour) and query those; raw-event scans don't scale to 'second-level' latency requirements",
          "Two storage tiers solve two different needs: OLAP store (ClickHouse/Druid) for fast recent rollups, cold object storage (S3/Parquet) for cheap long-term raw retention and metric redefinition",
          "Watermarks (a grace period before finalizing a time window) are mandatory — without them, a slightly-late event either gets dropped or corrupts an already-finalized aggregate",
          "Reserve a separate in-memory counter path (Redis) only for the few truly sub-5-second 'live count' widgets — running the whole pipeline at that latency for everything is unnecessary cost",
        ],
        followUps: [
          "How do you handle a metric definition changing after a year of data has already been aggregated?",
          "How would you detect and handle a sudden 100x spike in event volume?",
          "What happens to in-flight aggregations if the stream processor crashes mid-window?",
        ],
        example:
          "Mixpanel and Amplitude both compute pre-aggregated daily/hourly rollups during ingestion specifically so a dashboard query never has to scan raw event tables — the raw events still exist in cold storage, but only for re-processing, never for live reads.",
      },
      {
        id: "scalable-authn-authz",
        title: "Design a scalable authentication & authorization system",
        difficulty: "Hard",
        category: "classic-system-design-problems",
        question:
          "Design an authentication and authorization system that supports millions of users, SSO, and fine-grained per-resource permissions across many services.",
        answer: {
          short:
            "Separate authentication (proving who you are, done once via a central identity service issuing short-lived signed tokens) from authorization (what you can do, checked independently by each resource owner) — conflating the two into one monolithic check is the most common design mistake.",
          detailed:
            "Authentication: a central Identity Service handles login (password + MFA, or SSO via SAML/OIDC against an enterprise IdP like Okta), and on success issues a short-lived JWT access token (5-15 min TTL) plus a longer-lived refresh token (stored securely, often httpOnly cookie). The JWT is signed (RS256) so any downstream service can verify it locally using a public key — no network call back to the identity service per request, which is what makes this scale. Refresh tokens are stored server-side (Redis or DB) so they can be revoked (e.g., on logout or compromise) — access tokens can't be revoked before expiry, which is exactly why their TTL is kept short. Authorization: two common models — RBAC (Role-Based: user has roles, roles have permissions — simple, fast, but coarse) and ABAC/ReBAC (Attribute or Relationship-Based: 'can user X edit document Y' depends on the relationship between X and Y, e.g., document owner or shared-with — needed for resource-level sharing like Google Drive). For ReBAC at scale, a dedicated authorization service (Google's Zanzibar is the reference architecture) stores relationship tuples (object, relation, subject) and answers 'check' queries with bounded staleness via a global logical clock, letting it scale to billions of objects without becoming a bottleneck for every single resource check. Services call this authorization service (or a local cache of recent decisions) rather than embedding permission logic themselves, keeping the policy centralized and auditable.",
        },
        keyPoints: [
          "Authentication (who are you) and authorization (what can you do) are separate systems with separate scaling and revocation requirements — don't build one monolithic 'auth' service that does both",
          "Short-lived signed JWTs let every downstream service verify identity locally (no network round-trip) — the trade-off is they can't be revoked before expiry, so keep TTL short and put revocation power in the refresh token instead",
          "RBAC is fast and simple for coarse permissions (admin/editor/viewer); ReBAC (relationship-based, Zanzibar-style) is what you need for fine-grained resource sharing like 'this specific user can edit this specific document'",
          "Centralize authorization decisions in one service/library even if you decentralize enforcement — scattering permission logic across services is how privilege-escalation bugs are born",
        ],
        followUps: [
          "How do you revoke access immediately when a JWT can't be invalidated before it expires?",
          "How would you design 'can user X view document Y, which is in folder Z, which is shared with X's team' efficiently?",
          "How do you handle authorization checks when the authorization service itself is briefly unavailable?",
        ],
        example:
          "Google's Zanzibar paper (powering authorization for Drive, Calendar, and Cloud) processes ~10 million authorization checks per second across the company by modeling permissions as a relationship graph rather than per-service ACL lists — it's the textbook answer for 'fine-grained authorization at scale.'",
      },
      {
        id: "workflow-automation-platform",
        title: "Design a workflow automation platform",
        difficulty: "Hard",
        category: "classic-system-design-problems",
        question:
          "Design a workflow automation platform (like Zapier or a CI/CD pipeline engine) where users chain triggers and actions, and the system reliably executes multi-step workflows.",
        answer: {
          short:
            "Model a workflow as a DAG of steps with explicit state persisted after every step, execute it via a durable workflow engine that can resume from the last completed step after a crash, and make every action idempotent so retries are always safe.",
          detailed:
            "A workflow is defined as a DAG: trigger node (webhook, schedule, event) feeding into a sequence/branch of action nodes (call API, transform data, conditional branch). The execution model is the crux of the design: a naive in-memory interpreter loses all progress if the worker process crashes mid-workflow. The durable approach (used by Temporal, AWS Step Functions, and internally by CI/CD engines) persists the execution state after every single step completes — not just at the end — to a workflow_execution_log (execution_id, step_id, status, output, completed_at). On crash/restart, the engine replays the log to reconstruct exactly where it left off and resumes from the next incomplete step, rather than restarting the whole workflow. Each action step must be idempotent (or the engine deduplicates via an idempotency key per step execution) because 'resume' inherently risks re-attempting a step whose effect already landed but whose completion record didn't get written before the crash. Long-running/async steps (wait for webhook callback, wait 24 hours) are modeled as the workflow suspending — the engine persists 'waiting for event X' and a separate dispatcher wakes it when that event arrives, rather than holding a thread/connection open for hours. Retries use exponential backoff with a max-attempt cap, and a dead-letter queue captures workflows that exhaust retries for human investigation. Branching/conditionals are evaluated against the step's output at execution time, so the DAG can have multiple possible paths defined once but only one taken per run.",
        },
        keyPoints: [
          "Persist execution state after every step (not just workflow completion) — this is what makes 'resume after crash' possible instead of forcing a full restart",
          "Every action step must be idempotent or deduplicated via a step-level idempotency key — a crash-and-resume model will occasionally re-attempt a step that already partially succeeded",
          "Long waits (webhook callback, scheduled delay) should suspend the workflow as persisted state, not hold a thread or connection open — a separate event dispatcher wakes the workflow later",
          "A dead-letter queue for workflows that exhaust retries is mandatory — silent infinite retry or silent failure are both unacceptable for something users built business processes on top of",
        ],
        followUps: [
          "How would you let a user pause a running workflow and resume it days later?",
          "How do you prevent one tenant's huge workflow fan-out from starving capacity for everyone else?",
          "How would you version a workflow definition so in-flight executions aren't broken by an edit?",
        ],
        example:
          "Temporal (and its predecessor, Uber's Cadence) makes this durable-execution model a first-class primitive — workflow code looks like a normal function, but the runtime transparently checkpoints every step so a worker crash mid-execution resumes exactly where it left off, which is why it's become the default answer to this exact interview question.",
      },
      {
        id: "logging-monitoring-system",
        title: "Design a logging & monitoring system",
        difficulty: "Medium",
        category: "classic-system-design-problems",
        question:
          "Design a centralized logging and monitoring system that ingests logs/metrics from thousands of services and lets engineers search logs and alert on metric anomalies.",
        answer: {
          short:
            "Split logs and metrics into two pipelines with different storage shapes — logs go through a buffered collector into a search-optimized store (Elasticsearch), metrics go through local pre-aggregation into a time-series database — because querying patterns and cardinality requirements are fundamentally different.",
          detailed:
            "Logs: each service writes structured (JSON) log lines locally; a lightweight agent (Fluentd/Filebeat/Vector) tails the log file and forwards to a buffered collector (often via Kafka, to absorb bursty write volume without losing logs if the indexing layer is briefly slow). An indexer consumes the buffer and writes to Elasticsearch with a time-based index strategy (one index per day, e.g., logs-2026-06-30) so old indices can be cheaply deleted/archived to meet retention policies, and so queries can be scoped to a time range without scanning the entire dataset. Metrics: services expose a /metrics endpoint (Prometheus-style) or push counters/gauges/histograms directly; a local agent scrapes/aggregates at fixed intervals (e.g., every 15s) BEFORE sending — this is the critical difference from logs, since sending every raw metric event would have catastrophic cardinality (a single counter incremented 10,000 times/sec must become one aggregated point per interval, not 10,000 rows). Aggregated points land in a time-series DB (Prometheus, InfluxDB, or M3) optimized for fast range-queries and downsampling (keep 15s resolution for a week, 5-min resolution for a year). Alerting: a rules engine evaluates metric queries on a schedule (e.g., 'p99 latency > 500ms for 5 consecutive minutes') and fires to an on-call system (PagerDuty) with deduplication so a flapping condition doesn't page someone 50 times. Cardinality control is the operational nightmare in practice — a label like user_id on a metric silently creates millions of unique time series and can take down the whole metrics backend, so label allowlisting/validation at the agent is a hard requirement, not a nice-to-have.",
        },
        keyPoints: [
          "Logs and metrics need fundamentally different pipelines — logs are search-optimized (Elasticsearch, time-bucketed indices), metrics are aggregation-optimized (time-series DB, pre-aggregated before storage) — don't force one system to do both well",
          "Buffer log ingestion through a queue (Kafka) so a slow or down indexer doesn't cause log loss or back-pressure on the application services producing logs",
          "Pre-aggregate metrics at the agent/collector before they hit the backend — sending every raw event for a high-frequency counter creates catastrophic write volume and cardinality",
          "Uncontrolled metric label cardinality (e.g., a user_id label) is the most common cause of a metrics backend falling over in production — validate/allowlist labels at ingestion",
        ],
        followUps: [
          "How would you implement log retention that's cheap for old data but fast for recent queries?",
          "How do you avoid alert fatigue from a metric that flaps above and below a threshold?",
          "How would you correlate a slow request across logs, metrics, and traces?",
        ],
        example:
          "Prometheus's entire data model is built around bounded cardinality and pull-based scraping specifically to prevent the 'one bad label tanks the whole system' failure mode — its documentation explicitly warns against using unbounded values (user IDs, email addresses) as label values for exactly this reason.",
      },
      {
        id: "rate-limiter",
        title: "Design a rate limiter",
        difficulty: "Medium",
        category: "classic-system-design-problems",
        question:
          "Design a rate limiter that can throttle requests per user/API-key across a distributed fleet of API servers, supporting bursts but enforcing a sustained average rate.",
        answer: {
          short:
            "Use a token bucket algorithm backed by a shared Redis store (atomic via a Lua script) so every server instance enforces the same limit consistently, and pick the algorithm based on whether bursts should be allowed (token bucket) or smoothed out (sliding window).",
          detailed:
            "Algorithms, ranked by what they actually solve: Fixed window (counter resets every N seconds) is simplest but has a boundary bug — a user can send 2x the limit by timing requests at the edge of two adjacent windows. Sliding window log (store a timestamp per request, count requests in the last N seconds) is accurate but memory-heavy at high volume. Sliding window counter (weighted average of current and previous fixed window) approximates sliding-log accuracy with fixed-window memory cost — good default. Token bucket (a bucket holds up to B tokens, refills at rate R/sec, each request consumes 1 token, request rejected if bucket empty) is the best choice when you want to allow bursts up to bucket size while still enforcing a long-term average rate — this is what most production rate limiters (Stripe, AWS API Gateway) actually use. Distributed enforcement: the bucket state (current token count, last refill timestamp) lives in Redis, not in-process — otherwise each of N API servers enforces its own independent limit, letting a client get N times the intended quota by hitting different servers. The check-and-decrement must be atomic to avoid a race where two concurrent requests both read '1 token left' and both proceed — implemented as a single Lua script executed atomically by Redis (EVAL), computing elapsed-time-based refill and decrementing in one round trip. Response: a rejected request gets HTTP 429 with a Retry-After header computed from the refill rate. For very high QPS, an optimization is to rate-limit at the edge/gateway (cheap, coarse) and again at the service level (precise, per-resource) rather than a single check trying to do both.",
        },
        keyPoints: [
          "Token bucket allows controlled bursts up to a cap while enforcing a long-term average rate — this is the production-default algorithm for a reason; fixed-window has a real boundary-doubling bug",
          "Limiter state must live in a shared store (Redis) across all API server instances — per-instance in-memory counters let a client multiply their effective quota by the number of servers",
          "The check-and-decrement operation must be atomic (Lua script / single Redis command) — doing a separate GET then SET creates a race condition under concurrent requests",
          "Return Retry-After on a 429 — it tells well-behaved clients exactly when to retry instead of hammering the limiter immediately",
        ],
        followUps: [
          "How would you rate-limit per IP when many users are behind the same corporate NAT?",
          "How do you avoid Redis becoming a bottleneck/single point of failure for every single request?",
          "How would you implement different limits for different API tiers (free vs paid)?",
        ],
        example:
          "Stripe's public rate limiter documentation describes exactly a token-bucket model with burst allowance, and their API responses include a Retry-After header — this is close to the canonical reference implementation interviewers expect you to arrive at.",
      },
      {
        id: "parking-lot-system",
        title: "Design a parking lot system",
        difficulty: "Medium",
        category: "classic-system-design-problems",
        question:
          "Design a parking lot system (object-oriented design) that supports multiple vehicle types, multiple floors, ticketing, and fee calculation.",
        answer: {
          short:
            "Model it as ParkingLot → Floor → Spot (typed by vehicle size), assign spots via a strategy interface so the allocation policy can change independently of the data model, and compute fees from a ticket that records entry time and spot type.",
          detailed:
            "Class design: ParkingLot has many Floors; each Floor has many Spots (each Spot has a type: COMPACT/REGULAR/LARGE/HANDICAPPED and a status: FREE/OCCUPIED); a Vehicle has a type (MOTORCYCLE/CAR/TRUCK) and a license plate. On entry, a SpotAllocationStrategy (interface, so the policy is swappable — e.g., NearestSpotStrategy vs SameFloorPreferenceStrategy) finds a free, size-compatible spot — a motorcycle can park in any spot type, but a truck only fits LARGE. A Ticket is created (id, vehicle, spot, entry_time) and the spot is marked OCCUPIED. On exit, a FeeCalculator (also an interface — flat-rate vs per-hour vs progressive-rate strategies all implement it) computes the charge from (exit_time - entry_time) and the spot/vehicle type, a Payment is processed, and the spot is freed. Concurrency matters even in 'just OOD': two cars approaching the last free spot simultaneously must not both be allocated it — the spot's status transition (FREE → RESERVED → OCCUPIED) needs a DB-level row lock or an atomic compare-and-swap (UPDATE spots SET status='OCCUPIED' WHERE id=X AND status='FREE', check rows_affected). A real-time display ('floor 3: 12 spots free') is maintained as a denormalized counter per floor, decremented/incremented on each allocation/release rather than COUNT(*)-ing spots on every display refresh. Extensions interviewers often probe: reservations (pre-book a spot before arrival — needs a hold/expiry mechanism), EV charging spots (a spot subtype with extra constraints), and multiple entry/exit gates (each gate needs its own ticket-issuing terminal talking to the same shared spot inventory).",
        },
        keyPoints: [
          "Use a Strategy interface for spot allocation AND for fee calculation — interviewers are usually testing whether you decouple policy (which spot, what price) from structure (lot/floor/spot data model), not whether you hardcode one rule",
          "Atomic spot-status transitions (compare-and-swap or DB row lock) are required even in a 'simple' OOD problem — two simultaneous arrivals for the last spot is the obvious race condition to call out",
          "Maintain a denormalized free-spot counter per floor rather than COUNT(*) querying spots on every display refresh — small detail, but shows you think about read-heavy access patterns",
          "A Ticket (not the Vehicle or Spot) is the right place to record entry_time — it's the natural join point for fee calculation and decouples vehicle/spot lifecycle from a specific parking session",
        ],
        followUps: [
          "How would you add a reservation feature where a spot is held for 15 minutes before a no-show releases it?",
          "How would you support electric vehicle charging spots with a maximum charging duration?",
          "How would you handle the lot being full and routing cars to a nearby overflow lot?",
        ],
        example:
          "This is one of the most common LLD/OOD interview questions precisely because the 'trick' isn't the parking domain — it's whether you reach for Strategy/Interface patterns for the two genuinely variable parts (allocation policy, pricing policy) instead of hardcoding if/else chains that fight every follow-up question.",
      },
      {
        id: "database-design-approach",
        title: "Database design — how do you approach it from a blank slate?",
        difficulty: "Medium",
        category: "classic-system-design-problems",
        question:
          "Given a new product requirement, walk through how you'd approach database design from scratch — entity modeling through to indexing and scaling decisions.",
        answer: {
          short:
            "Start from the access patterns (what queries will actually run, and how often) before drawing any schema — the right normalization level, indexes, and even SQL-vs-NoSQL choice all fall out of read/write patterns, not out of the entities alone.",
          detailed:
            "Step 1 — identify entities and relationships from the domain (the obvious part: User, Order, Product, etc., with 1:1/1:N/N:M relationships). Step 2 — and this is the part juniors skip — list the actual queries the application needs to run, with rough frequency and latency requirements ('get a user's last 20 orders, p99 < 50ms, called on every page load' vs 'generate a monthly revenue report, can take 30 seconds, run once a day'). This determines everything downstream. Step 3 — normalize to 3NF first to eliminate update anomalies and redundancy, then deliberately denormalize specific hot paths once you know which ones are hot (e.g., storing a denormalized order_total on the Order row instead of summing order_items on every read, accepting the small risk of drift in exchange for avoiding a join on the most frequent query in the system). Step 4 — choose storage engine based on query shape: relational (Postgres/MySQL) for data with strong relationships and multi-row transactional consistency needs; a document store (MongoDB) when most reads fetch one self-contained entity (a product page bundling reviews/specs) and joins are rare; a wide-column store (Cassandra) when you have very high write throughput and look up by a known key (time-series, event logs); a key-value store (Redis/DynamoDB) for pure lookups by primary key needing single-digit-ms latency. Step 5 — indexing: add an index for every column in a frequent WHERE/JOIN/ORDER BY clause, but no more — every index speeds reads and slows every write, so indexing 'just in case' has a real, ongoing cost. Step 6 — plan for scale before you need it conceptually (read replicas for read-heavy, then sharding strategy and shard key chosen specifically to keep the most frequent queries single-shard) even if you don't implement it on day one.",
        },
        keyPoints: [
          "Query patterns, not entity relationships alone, should drive schema decisions — the same ER diagram can justify wildly different physical designs depending on read/write frequency and latency needs",
          "Normalize first (3NF, eliminates anomalies), then denormalize deliberately and only for proven hot paths — premature denormalization recreates update-anomaly bugs for no measured benefit",
          "SQL vs NoSQL is a query-shape decision, not a popularity contest: relational for multi-entity transactional consistency, document for self-contained-entity reads, wide-column for high-throughput key-based writes, key-value for pure latency-critical lookups",
          "Every index has a cost on every write — justify each one against an actual frequent query, don't index speculatively",
        ],
        followUps: [
          "How would you choose a shard key for a multi-tenant SaaS database?",
          "When would you reach for a NoSQL document store over a relational table with a JSONB column?",
          "How do you evolve a schema (add a NOT NULL column) on a table with 100 million rows without downtime?",
        ],
        example:
          "Discord famously denormalized message storage and ultimately moved from MongoDB to Cassandra specifically because their actual access pattern — fetch messages for a channel ordered by time — was a wide-column-store's ideal case, a decision driven entirely by query shape rather than by the conceptual entity model of 'messages belong to channels.'",
      },
      {
        id: "snake-game",
        title: "Design the Snake game",
        difficulty: "Easy",
        category: "classic-system-design-problems",
        question:
          "Design the classic Snake game — data structures for the snake's body, movement, collision detection, and food spawning.",
        answer: {
          short:
            "Represent the snake as a deque of grid coordinates (head at one end, tail at the other) so movement is O(1) — push a new head, pop the tail unless food was eaten — and use a hash set of the same coordinates for O(1) collision checks instead of scanning the body list.",
          detailed:
            "Core data structures: the snake's body is a Deque<Point> (double-ended queue) ordered head-to-tail; a parallel HashSet<Point> mirrors the same cells purely for fast 'is this cell occupied by the snake' lookups, since checking 'does the new head position collide with the body' by scanning a list is O(n) but a hash set lookup is O(1) — this duplication (deque + set, kept in sync on every move) is the key insight interviewers look for. Movement: on each tick, compute newHead = currentHead + directionVector; check boundary collision (newHead outside grid) and self-collision (newHead in the body hash set, with a subtle exception — if newHead equals the current tail position AND the snake isn't eating this tick, it's not a collision, because the tail is about to move away) — both are game-over conditions. If newHead matches the food's position: push newHead to the deque and hash set without popping the tail (snake grows), then spawn new food at a random empty cell (validated against the occupied-set so food never spawns on the snake). Otherwise: push newHead, then pop and remove the old tail from both structures (snake moves without growing). Food spawning at a guaranteed-empty cell on a near-full board needs care — for a grid that's mostly full, repeatedly generating random coordinates and checking 'is it free' degrades badly; better to maintain a set/list of currently-free cells and pick uniformly from that. Game loop runs on a fixed-interval timer (e.g., setInterval at a speed that may increase as score grows), re-rendering only the changed cells (old tail cleared, new head drawn) rather than redrawing the entire board each tick for performance.",
        },
        keyPoints: [
          "Deque + HashSet kept in sync is the core trick — deque gives O(1) head-push/tail-pop for movement, hash set gives O(1) self-collision checks instead of an O(n) scan through the body",
          "The tail cell is a collision exception: a new head landing exactly on the current tail is safe (not a collision) because the tail vacates that cell in the same tick, unless the snake just ate and the tail isn't moving",
          "Eating food = push head without popping tail (grows by one); normal move = push head AND pop tail (length constant) — this single conditional is the entire 'growth' mechanic",
          "On a nearly-full board, maintaining an explicit free-cell set for food spawning avoids the random-rejection-sampling slowdown of repeatedly guessing occupied cells",
        ],
        followUps: [
          "How would you support multiplayer snakes on the same board?",
          "How would you detect collision efficiently if the board were a sparse, very large grid?",
          "How would you persist and resume game state if the player's connection drops?",
        ],
        example:
          "This exact deque+hashset combination is the accepted optimal solution on LeetCode's 'Design Snake Game' (#353) — it's a small problem, but it's a clean test of whether a candidate reaches for the right auxiliary data structure instead of brute-force scanning under time pressure.",
      },
      {
        id: "ticketing-system-itsm",
        title: "Design a ticketing system like Jira (ITSM / support-desk angle)",
        difficulty: "Medium",
        category: "classic-system-design-problems",
        question:
          "Design a ticketing system for IT support/customer service (think Jira Service Management or Zendesk) — focusing on ticket lifecycle, SLA tracking, and auto-assignment, distinct from a general project-management tool.",
        answer: {
          short:
            "Center the design on a Ticket state machine with SLA timers attached to specific states, an assignment engine that routes by queue/skill/load, and an escalation scheduler that fires when a timer expires — the ITSM angle is fundamentally about time-bound obligations, not just status tracking.",
          detailed:
            "A support Ticket differs from a generic Jira issue in one crucial way: it carries SLA commitments tied to its state — e.g., 'first response within 1 hour of creation' and 'resolution within 8 business hours for Priority-1.' Model: Ticket(id, queue_id, priority, status, created_at, sla_policy_id); SLAClock(ticket_id, metric: FIRST_RESPONSE | RESOLUTION, target_at, paused_at NULLABLE, breached BOOLEAN) — the clock pauses when a ticket enters a WAITING_ON_CUSTOMER status (you shouldn't be penalized for SLA while waiting on the reporter) and resumes on reply, which is the detail most naive designs miss. A scheduled job (or a delayed-message queue like SQS with per-message delay, or a min-heap of upcoming deadlines polled periodically) checks for clocks approaching/exceeding target_at and fires escalation events (notify manager, auto-reprioritize) — this must be efficient at scale (millions of open tickets), so indexing/querying by target_at with a covering index, or using a time-bucketed delay queue, beats a naive 'scan all open tickets every minute.' Auto-assignment: a routing engine assigns incoming tickets to an agent based on queue (which team owns this category), current load (agents with fewer open tickets get priority — round-robin or least-connections), and skill match (tagged skills vs ticket category) — implemented as a rules engine evaluated at ticket-creation time, falling back to an unassigned pool with manager-triggered manual assignment if no agent matches. Business-hours-aware SLA math (an 8-hour SLA submitted Friday at 5pm shouldn't breach over the weekend) requires a calendar service that converts wall-clock duration to business-hour duration per the support org's configured hours and holidays.",
        },
        keyPoints: [
          "SLA clocks are first-class objects with their own pause/resume semantics (pausing while WAITING_ON_CUSTOMER) — this is the detail that separates a real support-ticketing design from a generic issue tracker",
          "Checking for SLA breaches must scale past 'a cron job scanning every open ticket' — index by target_at or use a delay queue so the check cost doesn't grow linearly with total open tickets",
          "Auto-assignment is a rules engine evaluated at creation time (queue ownership + current agent load + skill match), with an explicit unassigned fallback — never silently drop a ticket no rule matches",
          "SLA timers must be business-hours-aware, not wall-clock — an 8-hour SLA submitted Friday evening should land Monday, not over the weekend; this needs an explicit calendar/holiday service",
        ],
        followUps: [
          "How would you handle SLA policies that differ per customer (enterprise vs free tier)?",
          "How do you avoid double-escalating a ticket whose SLA breach event fires twice due to an at-least-once queue?",
          "How would you report 'percentage of tickets meeting SLA this month' efficiently across millions of historical tickets?",
        ],
        example:
          "Zendesk and Jira Service Management both implement pausable SLA clocks exactly for the 'waiting on customer' case — it's frequently the first follow-up question interviewers ask if a candidate's initial design treats the SLA timer as a simple created_at + duration calculation.",
      },
      {
        id: "url-shortening-service",
        title: "Design a URL shortening service",
        difficulty: "Easy",
        category: "classic-system-design-problems",
        question:
          "Design a URL shortener (like bit.ly) that generates short codes for long URLs, redirects with low latency at high read volume, and handles billions of URLs.",
        answer: {
          short:
            "Generate the short code from a base62-encoded auto-incrementing ID (or a hash with collision handling) so lookups are a single indexed key fetch, cache the hot redirect mappings in Redis since reads vastly outnumber writes, and use a 301/302 choice deliberately based on whether you need click analytics.",
          detailed:
            "Code generation, two approaches: (1) Counter-based — a centralized (or sharded-range) auto-incrementing ID, base62-encoded (a-z, A-Z, 0-9) into a short string — id 125 encodes to a few characters, guarantees uniqueness by construction, no collision handling needed, but requires coordinating ID allocation (e.g., pre-allocate ranges of IDs to each app server so they don't need a synchronous call per request). (2) Hash-based — MD5/SHA hash of the long URL, take the first 7 characters — simpler conceptually but needs collision detection (check if that code already maps to a different URL; if so, append a salt and rehash) and doesn't guarantee uniqueness for free. Most production systems prefer counter-based for its collision-free guarantee. Storage: a simple key-value table/store (short_code → long_url, created_at, expiry, click_count) — this is an ideal fit for a key-value store (DynamoDB) or a simple indexed relational table, since lookups are always by exact primary key, never by range or complex query. Read path dominates by orders of magnitude (every redirect is a read; creation is rare by comparison) — so a Redis cache in front of the DB, populated on first access or pre-warmed for known-popular links, absorbs the vast majority of redirect traffic and keeps DB load low. Redirect status code matters: 301 (permanent) lets browsers cache the redirect and skip your server on repeat visits — great for server load, terrible if you need accurate click analytics; 302 (temporary) forces every click through your server, giving you complete click tracking at the cost of more redirect traffic to handle. Custom aliases and expiry are straightforward additions on top of the same schema. At billions-of-URLs scale, the underlying table is sharded by short_code's hash (consistent hashing) so no single node holds a disproportionate fraction of keys.",
        },
        keyPoints: [
          "Counter-based base62 encoding guarantees uniqueness by construction with no collision-handling complexity — prefer it over hash-based generation unless you have a specific reason not to coordinate ID allocation",
          "Reads (redirects) outnumber writes (shortens) by orders of magnitude — a cache (Redis) in front of the datastore is the single highest-leverage optimization, not a clever storage engine choice",
          "301 vs 302 is a real product decision, not a technical footnote: 301 reduces server load via browser caching but blinds you to repeat-click analytics; 302 gives full analytics at the cost of every click hitting your servers",
          "The data access pattern (always exact-match lookup by short_code) makes this a textbook key-value store fit — no need for a relational database's join/query capabilities",
        ],
        followUps: [
          "How would you pre-allocate ID ranges to multiple app servers without a synchronous coordination call per request?",
          "How would you implement link expiry without a background job scanning the entire table?",
          "How would you handle a celebrity's shortened link suddenly getting 1 million clicks/minute (hot key problem)?",
        ],
        example:
          "This is the most commonly asked 'warm-up' system design question precisely because it has a small, bounded scope but still surfaces real decisions (ID generation strategy, cache-aside pattern, 301 vs 302) that distinguish a candidate who's reasoned about trade-offs from one who's only memorized 'use a cache.'",
      },
      {
        id: "notification-service-internals",
        title: "Design a notification service (API & delivery internals)",
        difficulty: "Medium",
        category: "classic-system-design-problems",
        question:
          "Design the notification SERVICE itself — its API contract, template system, and per-user preference center — as a building block other services call into, distinct from the end-to-end multi-channel notification system architecture.",
        answer: {
          short:
            "Expose a single 'send' API that takes an event type and data payload (never raw message text), resolve the actual message from a versioned template at send-time, and store user channel preferences as structured opt-in/opt-out state the service consults before every send.",
          detailed:
            "API contract: POST /notifications { event_type: 'order_shipped', user_id, data: { order_id, tracking_url } } — callers send semantic event data, never pre-rendered text. This indirection is the single most important design decision: it lets the notification team change wording, add a new language, or change which channel an event_type defaults to, without every calling service needing a deploy. Template system: each event_type maps to a TemplateSet (one template per locale per channel — push has a short title+body, email has subject+HTML body, SMS has a 160-char-budget plain text) stored with a version number; rendering substitutes {{data.fields}} into the template at send time. Preference center: NotificationPreference(user_id, event_category, channel, enabled) — granular enough that a user can disable marketing emails but keep security-alert emails, and the send path checks this table before dispatching to a given channel (with hard-coded exceptions for non-optional categories like security/legal notices, which bypass preference checks entirely by design). Delivery: the service itself doesn't necessarily talk to FCM/Twilio/SES directly — it can enqueue a rendered-message task to channel-specific delivery workers (this is the seam between 'notification service' and 'notification system' architecture), but the service's job ends at producing a correctly localized, correctly-targeted, preference-respecting message. Idempotency at the API boundary: callers pass an idempotency_key (often the business event's own ID) so retrying a failed HTTP call to /notifications never results in a duplicate send. Audit: every send attempt (rendered, suppressed-by-preference, failed) is logged for support/debugging ('why didn't this user get their order confirmation').",
        },
        keyPoints: [
          "Calling services send semantic event data (event_type + structured payload), never pre-rendered text — this indirection is what lets wording/localization/channel-defaults change without redeploying every caller",
          "Templates are versioned per event_type × locale × channel — email/push/SMS need fundamentally different formats (HTML body vs 160-char budget) from the same logical event",
          "Preferences are granular per (event_category, channel), with explicit hard-coded exceptions for non-optional categories (security, legal) that always bypass opt-out — silently respecting an opt-out on a fraud alert is a real security bug, not just a UX nitpick",
          "Idempotency keys at the API boundary (not just in the delivery workers) prevent a caller's HTTP retry from producing a duplicate notification",
        ],
        followUps: [
          "How would you A/B test two different message templates for the same event_type?",
          "How would you support a new language without a code deploy?",
          "How would you let a calling service know whether a notification was actually delivered, not just accepted?",
        ],
        example:
          "This is the layer Twilio's and SendGrid's own internal 'notification orchestration' teams build above the raw send APIs — the raw API (send this exact SMS) is the easy part; the template/preference/idempotency layer in front of it is what most of this interview question is actually testing.",
      },
      {
        id: "distributed-messaging-system",
        title: "Design a distributed messaging system (like Kafka)",
        difficulty: "Hard",
        category: "classic-system-design-problems",
        question:
          "Design a distributed messaging/event-streaming system that guarantees ordered, durable delivery of messages to multiple consumers at very high throughput.",
        answer: {
          short:
            "Partition each topic across multiple brokers so throughput scales horizontally, guarantee ordering only within a partition (not across the whole topic), replicate each partition to multiple brokers for durability, and let consumers track their own read position so the broker stays simple.",
          detailed:
            "Topic & partitioning: a topic is split into P partitions, each an append-only log; a message's partition is chosen by hash(key) % P (or round-robin if no key) — this is why ordering is only guaranteed within a partition, not across the whole topic, and it's the single most important constraint to state explicitly, since most candidates wrongly assume global ordering. Producers choose a key that groups related messages (e.g., user_id) into the same partition specifically to get ordering where it matters. Replication: each partition has a leader broker and N-1 follower replicas; producers write to the leader, followers pull and replicate; a message is considered 'committed' once it's been replicated to a quorum (e.g., ISR — in-sync replica set) of followers, not just written to the leader — this is what survives a leader broker crashing immediately after a write. Consumer model: rather than the broker pushing to consumers (which requires tracking per-consumer state and slows down under a slow consumer), consumers pull and track their own offset (position) in each partition they read — this offset is itself stored durably (in a special internal topic, Kafka's actual approach) so a consumer can crash and resume from its last committed offset. Consumer groups: multiple consumer instances in a group split the partitions among themselves (each partition read by exactly one consumer in the group at a time) for parallel processing, while multiple distinct groups can each independently read the entire topic from their own offset — this is what lets the same event stream serve both a real-time analytics consumer and a slower batch-archival consumer without either affecting the other. Storage: logs are append-only and segmented into files; old segments are deleted/compacted per a configured retention policy (time-based or size-based), and sequential disk I/O for both writes (append) and reads (mostly sequential scan from an offset) is what gives a log-based design dramatically higher throughput than a random-access database for this workload.",
        },
        keyPoints: [
          "Ordering is guaranteed only within a partition, never across an entire topic — producers must choose a partition key deliberately for any messages that need relative ordering",
          "A write is 'durable' only once replicated to a quorum of followers, not merely written to the leader — acknowledging too early loses messages on a leader crash",
          "Pull-based consumption with consumer-tracked offsets (not broker-pushed delivery) keeps the broker simple and lets slow consumers fall behind without affecting others or requiring the broker to track per-consumer state",
          "Consumer groups parallelize work (each partition read by one consumer in the group) while independent groups can each replay the whole stream from their own offset — this dual model is what supports many different downstream use cases off one event stream",
        ],
        followUps: [
          "What happens to in-flight messages if a partition's leader broker crashes?",
          "How would a consumer handle 'poison pill' messages that repeatedly crash processing?",
          "How do you rebalance partitions across consumers when a new consumer joins the group?",
        ],
        example:
          "Kafka's actual architecture is essentially the reference answer to this question — partition-level ordering, ISR-based replication, and consumer-tracked offsets stored in an internal __consumer_offsets topic are not implementation trivia, they're the direct answers to the three hardest sub-problems (ordering, durability, delivery tracking) this design question is built around.",
      },
      {
        id: "scalable-chat-application",
        title: "Design a scalable chat application (like WhatsApp)",
        difficulty: "Hard",
        category: "classic-system-design-problems",
        question:
          "Design a chat application supporting 1:1 and group messaging, online presence, and message delivery guarantees (sent/delivered/read), at billions of messages per day.",
        answer: {
          short:
            "Maintain a persistent WebSocket connection per online user pinned to a specific chat server (tracked in a connection-routing table), route messages between servers via a pub/sub backbone when sender and recipient aren't on the same server, and queue messages for offline users so delivery is guaranteed once they reconnect.",
          detailed:
            "Connection layer: each client holds a long-lived WebSocket to one of many chat servers (load-balanced on connect); a routing table (Redis: user_id → server_id) tracks which server each online user is currently connected to — this is essential because the sender and recipient are very likely connected to different physical servers. Sending a message: client → sender's chat server → message is persisted (write to a message store, partitioned by conversation_id) → server looks up recipient's server_id in the routing table → if recipient is online, publish to a pub/sub channel that the recipient's chat server subscribes to, which then pushes over that recipient's WebSocket; if offline, skip the push and rely on the persisted message being delivered on next reconnect (chat history fetch). Delivery status (sent → delivered → read) is modeled as a small state machine per message per recipient (important for group chats — one message has a distinct delivery state per group member): 'sent' is set once persisted; 'delivered' is set when the recipient's client ACKs receipt over the WebSocket; 'read' is set when the recipient's client reports the message entered view. These ACKs flow back through the same server-to-server pub/sub path in reverse. Group chat fan-out: a message to a 200-person group is NOT fanned out to 200 individual rows at send time for huge groups — instead, store one message row plus per-recipient delivery-status rows lazily created/updated as ACKs arrive, avoiding a 200x write amplification on every single group message. Message storage is typically a wide-column store (Cassandra) partitioned by conversation_id and clustered by timestamp, since the dominant query is 'give me the last N messages in this conversation' — a perfect fit for that access pattern. Presence (online/offline/last-seen) is ephemeral state in Redis with a TTL/heartbeat, separate from message delivery entirely.",
        },
        keyPoints: [
          "A routing table mapping user_id → connected-server-id is the backbone of multi-server chat — without it, there's no way to deliver a message to a recipient connected to a different physical server than the sender",
          "Delivery status (sent/delivered/read) is per-message-per-recipient, not per-message — this matters enormously for group chats where 200 people have 200 independent delivery states for one message",
          "For large groups, avoid writing N delivery-status rows eagerly at send time — create/update them lazily as ACKs actually arrive, or fan-out cost dominates at scale",
          "Message storage access pattern (recent messages in one conversation, time-ordered) is a textbook wide-column-store fit (Cassandra partitioned by conversation_id) — far better than a relational table for this specific query shape",
        ],
        followUps: [
          "How would you support end-to-end encryption without breaking server-side search/backup features?",
          "How do you handle a user who's connected on 3 devices simultaneously (phone, web, desktop)?",
          "How would you implement 'typing...' indicators without persisting useless data?",
        ],
        example:
          "WhatsApp's original architecture (famously run on a tiny number of Erlang servers per user-million) used exactly this pattern — persistent connections pinned per server, a routing layer, and offline message queuing — and is the standard reference point interviewers expect when this question is asked.",
      },
      {
        id: "job-scheduler",
        title: "Design a job scheduler",
        difficulty: "Medium",
        category: "classic-system-design-problems",
        question:
          "Design a distributed job scheduler (like a cron-as-a-service or Airflow) that runs millions of scheduled and one-off jobs reliably, with retries and no double-execution across multiple scheduler instances.",
        answer: {
          short:
            "Store every job's next-run-time in a database, have multiple scheduler instances poll for due jobs but claim each one atomically (so exactly one instance executes it), and hand off actual execution to a separate worker pool so a long-running job never blocks the scheduler's polling loop.",
          detailed:
            "Job definition: Job(id, schedule — either a one-off run_at timestamp or a cron expression, next_run_at, status: PENDING/CLAIMED/RUNNING/SUCCEEDED/FAILED, payload, retry_policy). Scheduling loop: rather than one centralized scheduler process (a single point of failure and a throughput ceiling), run multiple identical scheduler instances that each periodically poll the DB for jobs WHERE next_run_at <= NOW() AND status = 'PENDING' — but if two instances poll at the same moment, both could see the same due job. The fix is an atomic claim: UPDATE jobs SET status='CLAIMED', claimed_by=instance_id WHERE id=X AND status='PENDING' and only proceed if the update actually affected a row (rows_affected = 1 means this instance won the race; 0 means another instance already claimed it) — this turns 'multiple schedulers' from a double-execution risk into a horizontal scaling feature. Execution: the claiming scheduler doesn't run the job inline — it pushes a task to an execution queue consumed by a separate worker pool, so a job that takes 10 minutes doesn't block that scheduler instance from claiming and dispatching the next thousand due jobs. Crash recovery: if a worker crashes mid-execution, the job is stuck in RUNNING — a reaper process periodically finds jobs RUNNING for longer than their expected max duration and requeues them (with a retry-count check to avoid infinite reprocessing of a poison-pill job). Retry policy: exponential backoff with jitter, configurable max attempts, then move to a dead-letter status for manual inspection. Recurring jobs: after a cron-scheduled job completes, the scheduler computes the next next_run_at from the cron expression and resets status to PENDING — never executes 'the next occurrence' eagerly, since that would require tracking unbounded future instances. At very high job volume, the 'poll the whole jobs table' step itself needs a covering index on (status, next_run_at) or, beyond a few million rows, a time-bucketed priority structure so the scan stays cheap regardless of total job count.",
        },
        keyPoints: [
          "Multiple scheduler instances polling the same job table is safe (and a scaling feature, not a bug) ONLY if claiming a job is a single atomic conditional UPDATE — checking rows_affected, not a separate read-then-write",
          "Scheduling (deciding a job is due) and execution (actually running it) must be separate concerns — a slow job must never block the scheduler loop from claiming the next thousand due jobs",
          "A reaper process for jobs stuck in RUNNING past their expected duration is mandatory — without it, a crashed worker silently loses a job forever with no automatic retry",
          "Recompute a recurring job's next_run_at lazily after each completion, not by pre-generating future occurrences — pre-generating is unbounded and unnecessary work",
        ],
        followUps: [
          "How would you support job dependencies (job B only runs after job A succeeds)?",
          "How do you prevent one tenant scheduling 10 million jobs from starving the scheduler for everyone else?",
          "How would you guarantee a job runs at-most-once even across a full datacenter failover?",
        ],
        example:
          "This is essentially how distributed cron implementations (Airflow's scheduler, or Kubernetes CronJob controllers) work under the hood — atomic claim-via-conditional-update is the load-bearing trick that turns 'avoid double execution' from a hard distributed-systems problem into a single SQL WHERE clause.",
      },
    ],
  },
];
