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
];
