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
          detailed: [
            "Vertical scaling means adding CPU/RAM/disk to one machine — it's simple (no code changes, no distributed-systems complexity) but has a hard ceiling (biggest instance type), a single point of failure, and usually means downtime to resize.",
            "Horizontal scaling means adding more machines behind a load balancer — it has near-unlimited headroom and gives you fault tolerance for free, but it forces you to confront state: sessions, caches, and DB connections must now work across N nodes, which is where sticky sessions, distributed caches, and connection pool sizing come in.",
            "The decision tree: (1) Is the bottleneck CPU/memory on a stateless service? → horizontal, it's usually a small code change plus a load balancer.",
            "(2) Is it a database or something inherently stateful? → vertical first (it buys time cheaply), then look at read replicas / sharding as the real horizontal fix.",
            "(3) Do you need to survive a single node dying? → horizontal is mandatory regardless of cost, because vertical scaling never solves availability.",
          ],
        },
        keyPoints: [
          {
            point: "Vertical = bigger box (fast, simple, capped, single point of failure); horizontal = more boxes (elastic, fault-tolerant, but needs statelessness)",
            example: "AWS lets you bump an RDS instance from db.r5.large to db.r5.4xlarge in minutes (vertical); adding read replicas or sharding (horizontal) needs real re-architecting.",
            bestApproach: "Design services stateless from day one so horizontal scaling stays available as an option even when you choose to scale vertically first for speed.",
          },
          {
            point: "Stateless services (API/web tiers) horizontally scale almost for free behind a load balancer",
            example: "An ALB + auto-scaling group in front of a Node.js API tier scales 2 → 200 instances on a CPU/RPS trigger with zero code changes.",
            bestApproach: "Push all session/user state into Redis or the DB so any instance can serve any request — verify by killing a random instance under load and confirming nothing breaks.",
          },
          {
            point: "Stateful systems (DBs, caches) need replication/sharding before they can scale out — vertical buys time",
            example: "A Postgres primary bumped from db.r5.xlarge to db.r5.4xlarge buys 6 months before a sharding project becomes mandatory.",
            bestApproach: "Treat vertical DB scaling as a deliberate, time-boxed stopgap — start the read-replica/sharding design before you're forced onto the largest instance size available.",
          },
          {
            point: "Horizontal scaling is the only real path to high availability — one big box is always one outage away from total downtime",
            example: "A single giant EC2 instance running the whole app goes dark during an AZ outage and takes the product down with it; a 3-AZ fleet of small instances doesn't.",
            bestApproach: "Deploy at least 3 replicas spread across availability zones for anything customer-facing, even when one box could technically handle current load.",
          },
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
          detailed: [
            "Latency = time for a single unit of work to complete (p50/p95/p99 response time). Throughput = total units of work completed per second (RPS, messages/sec, rows/sec).",
            "They're related but not the same — a system can have low latency and low throughput (a fast single-threaded service with no concurrency) or high latency and high throughput (a batched pipeline that processes huge volumes but each item waits in a queue).",
            "The classic tension: batching writes to a database (e.g., buffering 1000 events before a single bulk INSERT) dramatically improves throughput — fewer round trips, better disk I/O patterns — but it directly increases latency for any individual event, which now waits for the batch to fill or a timeout to fire.",
            "Same story with Nagle's algorithm on TCP (batches small packets, adds latency to save bandwidth) or async logging (great throughput, but a log line might not be visible for seconds).",
          ],
        },
        keyPoints: [
          {
            point: "Latency = time per request (p50/p95/p99); throughput = requests per second — different axes, often plotted together",
            example: "A payments API dashboard shows p99 = 180ms and 4,200 RPS side by side — two independent numbers describing the same system from different angles.",
            bestApproach: "Track both as separate SLOs (e.g., 'p99 < 200ms' and 'sustain 5,000 RPS') instead of one combined 'performance' metric — they can move in opposite directions.",
          },
          {
            point: "Little's Law ties them together: concurrency = throughput × latency — raising concurrency raises throughput until queueing inflates latency",
            example: "A connection pool capped at 50 concurrent DB connections caps throughput at 50/avg_latency — raising the pool size raises throughput until the DB itself becomes the bottleneck.",
            bestApproach: "Use Little's Law to size thread/connection pools deliberately from target throughput and measured latency, instead of guessing a pool size and tuning by trial and error.",
          },
          {
            point: "Batching/buffering is the textbook example of trading latency for throughput",
            example: "Buffering 1,000 analytics events before one bulk INSERT cuts DB round-trips 1000x but makes any single event wait up to the batch window before it's durable.",
            bestApproach: "Make the batch size/timeout configurable and pick it from the SLA backwards — 'events must be visible within 2s' caps how long you're allowed to buffer.",
          },
          {
            point: "Always ask 'which one does the user/SLA actually care about?' before optimizing — they can pull in opposite directions",
            example: "A checkout API needs low p99 latency (user waiting); a nightly ETL job needs high throughput (no one's watching it run).",
            bestApproach: "Write down the actual SLA in user-facing terms before touching code — 'fast enough to feel instant' vs 'cheap enough to process the full daily volume' lead to opposite designs.",
          },
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
          detailed: [
            "Step 1 — measure: profile the current system; find out whether the bottleneck is the app tier (CPU-bound serialization), the database (lock contention, slow queries), or the network (payload size, connection churn). Don't guess.",
            "Step 2 — cheap wins: add a CDN/edge cache for anything cacheable (product images, near-static listings); add an in-memory or Redis cache in front of the DB for hot reads with a sensible TTL and an invalidation strategy. This alone often absorbs an order of magnitude of read traffic.",
            "Step 3 — database: add read replicas and route reads through a load balancer/proxy (e.g., ProxySQL, PgBouncer) — writes still go to the primary, reads fan out.",
            "Step 4 — app tier: make the service stateless (move sessions to Redis) so you can horizontally scale behind a load balancer with auto-scaling rules tied to CPU/RPS.",
            "Step 5 — protect the system: add rate limiting and circuit breakers so the 10x doesn't cascade into an outage if one dependency slips.",
            "Step 6 — re-measure and iterate — scaling is never 'done', it's a loop of measure → fix the biggest bottleneck → re-measure.",
          ],
        },
        keyPoints: [
          {
            point: "Always start with measurement/profiling — scaling the wrong layer wastes money and adds complexity for nothing",
            example: "A team added read replicas to fix slow responses, but profiling later showed the real bottleneck was JSON serialization on the app tier — the replicas changed nothing.",
            bestApproach: "Run a profiler/APM (Datadog, pprof) under realistic load before proposing any scaling change, and require a flamegraph or query-time breakdown to justify the fix.",
          },
          {
            point: "Caching (CDN + application cache) usually gives the biggest bang-for-buck for read-heavy systems",
            example: "Adding a Redis cache in front of a product-listing endpoint with a 60s TTL cut DB read load by 95% with a single afternoon's work.",
            bestApproach: "Cache the hottest, most-repeated reads first (Pareto: the top 20% of keys usually account for 80% of traffic) before reaching for read replicas or sharding.",
          },
          {
            point: "Read replicas decouple read scaling from write scaling — the primary stays the bottleneck only for writes",
            example: "Routing all SELECT queries through PgBouncer to 3 read replicas let read throughput scale to 10K RPS while the primary still only handled the original write volume.",
            bestApproach: "Route reads through a proxy (PgBouncer, ProxySQL) that load-balances across replicas, and make replica lag observable so stale-read tolerance is a conscious choice, not a surprise.",
          },
          {
            point: "Statelessness is the prerequisite for horizontal auto-scaling — sessions/caches must move out of the app process",
            example: "An app storing user sessions in local memory breaks the moment auto-scaling adds a second instance — half the requests land on a server with no session.",
            bestApproach: "Move sessions to Redis (or signed JWTs) before introducing auto-scaling — verify by load-testing against 2+ instances behind the LB, not just one.",
          },
          {
            point: "Add guardrails (rate limiting, circuit breakers, timeouts) — more traffic without protection just means a bigger blast radius when something breaks",
            example: "10x traffic with no circuit breaker on a flaky payment-provider call turned one slow dependency into a full outage as request threads piled up waiting on it.",
            bestApproach: "Set explicit timeouts on every outbound call and wrap risky dependencies in a circuit breaker (Hystrix/resilience4j-style) before scaling traffic up, not after the first incident.",
          },
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
          detailed: [
            "Performance is a snapshot metric: latency and throughput measured at a specific load level (e.g., 'p99 is 50ms at 100 RPS').",
            "Scalability is about the *shape of the curve* as load increases: does p99 stay near 50ms at 1,000 RPS and 10,000 RPS, or does it explode because of lock contention, connection pool exhaustion, or O(n²) behavior somewhere?",
            "A system can be blazing fast in a demo (low load, warm cache, single user) and completely unscalable (falls over the moment concurrent users show up — e.g., a single SQLite file with global write locks).",
            "Conversely a system can have so-so per-request performance but scale beautifully because it's embarrassingly parallel and stateless.",
            "The interview-winning framing: 'performance answers how fast right now; scalability answers what happens to that answer as N grows.'",
          ],
        },
        keyPoints: [
          {
            point: "Performance = a point-in-time measurement; scalability = how that measurement changes with load",
            example: "'p99 is 50ms' is a performance number; 'p99 stays under 50ms from 100 RPS to 10,000 RPS' is a scalability claim — the first says nothing about the second.",
            bestApproach: "Always report a latency/throughput number paired with the load it was measured at, and re-measure at 10x that load before declaring a system 'fast.'",
          },
          {
            point: "A fast system can be unscalable (global locks, single-writer DB, in-memory session affinity)",
            example: "A SQLite-backed app responds in 5ms for one user, but a global write lock serializes every write once 500 concurrent users show up.",
            bestApproach: "Load-test for lock contention and single-writer bottlenecks specifically, not just average latency at low concurrency — concurrency, not raw speed, is what exposes scalability limits.",
          },
          {
            point: "A 'slower' system can scale better if it's stateless and horizontally distributable",
            example: "A 20ms-per-request stateless microservice that scales to 50 instances out-throughputs a 5ms single-instance monolith the moment load exceeds what one box can handle.",
            bestApproach: "When comparing two designs, evaluate total system throughput at target scale, not per-request latency on a single node in isolation.",
          },
          {
            point: "Always ask 'at what load?' when someone claims a system is fast",
            example: "A demo showing 5ms response times with one test user says nothing about behavior at the 10,000-concurrent-user mark the product actually needs to hit.",
            bestApproach: "Make 'at what load was this measured?' a standing question in design reviews and load-test reports — a latency number without a concurrency figure attached is incomplete.",
          },
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
          detailed: [
            "The interviewer isn't grading your arithmetic — they're grading whether you can translate a vague requirement into numbers that drive design decisions.",
            "(1) Assume a user base — e.g., '100M users, 10% daily active = 10M DAU.'",
            "(2) Derive request volume — 'each DAU creates 1 short URL/day → 10M writes/day ≈ 116 writes/sec average; reads are typically 100x writes for a URL shortener → ~11,600 reads/sec.' Always note peak vs average (peak is often 2-5x average).",
            "(3) Derive storage — 'each record is ~500 bytes (URL + metadata); 10M/day × 365 × 5 years × 500B ≈ 9TB' — and round generously.",
            "(4) Derive bandwidth — requests/sec × payload size gives you ingress/egress estimates that inform CDN/cache decisions.",
            "(5) Sanity check — '11K reads/sec is well within what a cache + a few read replicas handles; 9TB fits comfortably in a sharded relational store or even a single beefy instance with room to grow.'",
            "The punch line you want to land: these numbers directly justify *why* you'll propose a cache (read:write ratio is 100:1) and a particular storage engine (data size fits X).",
          ],
        },
        keyPoints: [
          {
            point: "State your assumptions out loud — the interviewer cares about the reasoning chain, not the final digit",
            example: "Saying '100M users, 10% DAU, 1 action/user/day' out loud lets the interviewer correct a wrong assumption mid-stream instead of silently judging a number they disagree with.",
            bestApproach: "Narrate each assumption as a short, falsifiable sentence ('I'll assume X because Y') so the interviewer can redirect you in seconds rather than after you've built on a bad number.",
          },
          {
            point: "Convert daily/monthly numbers to per-second — that's the unit your architecture actually has to handle",
            example: "'10M writes/day' sounds huge; converted it's ~116 writes/sec — well within a single Postgres primary, which immediately simplifies the rest of the design.",
            bestApproach: "Divide by 86,400 (seconds/day) as a reflex the moment any daily figure appears — the per-second number is what determines instance counts and database choice.",
          },
          {
            point: "Always distinguish average load from peak load (peak is commonly 2-5x average)",
            example: "An e-commerce API averaging 1,000 RPS can spike to 4,000+ RPS during a flash sale — sizing only for the average leaves zero headroom for the moment that actually matters.",
            bestApproach: "State both numbers explicitly ('116 RPS average, ~500 RPS peak') and size auto-scaling/capacity for the peak figure, not the average.",
          },
          {
            point: "Use the resulting numbers to *justify* design choices ('100:1 read:write ratio → we need a cache')",
            example: "Deriving '11.6K reads/sec vs 116 writes/sec' directly motivates 'we need a cache and read replicas' as a conclusion, not an assumption pulled from a generic template.",
            bestApproach: "Explicitly connect every estimation number to the design decision it drives — interviewers are scoring whether the math changes your architecture, not whether you can multiply.",
          },
          {
            point: "Round aggressively to powers of ten — 86,400 seconds/day ≈ 10^5 is a useful shortcut",
            example: "Approximating 86,400 as 10^5 turns '10M requests/day' into '10^7 / 10^5 = 100 RPS' as fast mental math, close enough (116 vs 100) for any architecture decision.",
            bestApproach: "Memorize the handful of standard conversions (seconds/day ≈ 10^5, seconds/year ≈ 3×10^7) so unit conversion never becomes the bottleneck in your reasoning under time pressure.",
          },
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
          detailed: [
            "A monolith is one deployable unit: simple to develop, test, deploy, and debug (one stack trace, one transaction, no network between modules).",
            "Its weaknesses show up at scale: the whole thing scales together even if only one piece is hot, a bug in one module can take down the whole app, and large teams step on each other in one codebase/release train.",
            "Microservices split the system into independently deployable services: teams can move independently, each service scales on its own, and a failure can be contained — but you now pay for that with network latency between what used to be function calls, distributed transactions (sagas instead of ACID), service discovery, distributed tracing/observability, and a much heavier DevOps/infra bill.",
            "The senior answer: 'Start with a modular monolith — clean internal boundaries (domain modules, clear interfaces) — so that if/when you need to split it, you're extracting well-defined modules, not performing surgery on a ball of mud. Move to microservices when you have a *specific* pain (a hot module that needs independent scaling, a team that needs to ship independently) — not because it's trendy.'",
            "This is literally what Shopify, Segment, and (initially) Amazon did.",
          ],
        },
        keyPoints: [
          {
            point: "Monolith: simple ops, ACID transactions, easy debugging — but couples scaling, deploys, and team velocity together",
            example: "A single Rails app with one Postgres database lets a 5-person startup ship features daily with one deploy pipeline and zero distributed-systems overhead.",
            bestApproach: "Enforce clean internal module boundaries (domain folders, no cross-module DB access) from day one so the monolith stays extractable later instead of becoming a ball of mud.",
          },
          {
            point: "Microservices: independent scaling/deploys/failure isolation — but you now own network latency, distributed transactions, service discovery, and observability",
            example: "Splitting checkout into 8 services let Amazon's teams deploy independently, but every checkout request now crosses several network hops that didn't exist as function calls in the monolith.",
            bestApproach: "Only split out a service when you have a specific, named pain (independent scaling need, independent deploy cadence for one team) — never split preemptively 'because microservices.'",
          },
          {
            point: "'Start with a modular monolith, split when you feel real pain' is the senior-level answer — not 'microservices because Netflix does it'",
            example: "Shopify deliberately stayed a modular Rails monolith for most of its core platform, extracting only Flash Sales infrastructure once it had a clear, measured independent-scaling need.",
            bestApproach: "Default new products to a modular monolith and revisit the decision only when a specific module's scaling, team-ownership, or reliability needs diverge sharply from the rest.",
          },
          {
            point: "Conway's Law matters: your service boundaries will mirror your team boundaries whether you plan it or not",
            example: "A company with separate frontend and backend teams (not separate product teams) often ends up with a frontend-tier/backend-tier split in services that doesn't map to actual business domains.",
            bestApproach: "Design team structure and service boundaries together — organize teams around business capabilities first, and let service boundaries follow, not the other way around.",
          },
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
          detailed: [
            "In a synchronous chain, checkout → inventory → shipping → notification means checkout's latency is the *sum* of all four, and its availability is the *product* of all four (if any one is down, checkout fails).",
            "Event-driven architecture flips this: checkout publishes an `OrderPlaced` event to a broker (Kafka/SNS/EventBridge) and returns immediately; inventory, shipping, and notification each subscribe and react independently, on their own schedule, with their own retry/backoff.",
            "Benefits: (1) temporal decoupling — consumers can be down and catch up later without checkout even noticing; (2) it's trivial to add a new consumer (e.g., analytics) without touching checkout's code; (3) natural buffering absorbs traffic spikes (the queue smooths bursts that would otherwise overload downstream services).",
            "The costs are real too: you trade strong consistency for eventual consistency (the user sees 'order placed' before shipping has actually been scheduled), debugging becomes harder (a single user action is now scattered across asynchronous logs that need correlation IDs and distributed tracing), and you must design for at-least-once delivery (idempotent consumers, dedup keys) because brokers can redeliver.",
          ],
        },
        keyPoints: [
          {
            point: "Sync chains couple latency (sum) and availability (product) across every hop — one slow link slows everything",
            example: "A checkout calling inventory (50ms) then shipping (80ms) then notification (200ms) synchronously takes 330ms minimum, and a notification-service blip fails the entire checkout.",
            bestApproach: "Map out the full synchronous call chain and ask 'does the user need to wait for this specific step?' for each hop — anything answered 'no' is a candidate to move behind an event.",
          },
          {
            point: "Events decouple producer and consumer in time, deployment cadence, and failure domain",
            example: "Uber's notification service can be redeployed or briefly down without affecting trip-matching, because it only reacts to a `trip.matched` event whenever it's able to.",
            bestApproach: "Publish events for state transitions that other teams/services care about, and let each consumer own its own retry/backoff policy rather than the producer tracking delivery per consumer.",
          },
          {
            point: "Trade-off: you give up strong consistency for resilience and independent scaling — eventual consistency becomes a UX concern, not just a backend detail",
            example: "A user sees 'Order placed!' before the shipping service has actually scheduled the shipment — the UI must be designed to tolerate that few-hundred-millisecond gap gracefully.",
            bestApproach: "Surface the eventual-consistency window in the UI explicitly (e.g., 'Confirming...' states) rather than pretending the system is instantaneous end-to-end.",
          },
          {
            point: "At-least-once delivery is the default for brokers — consumers must be idempotent (dedup keys, upserts) or they'll double-process",
            example: "A Kafka consumer crash-and-restart can redeliver an `OrderPlaced` event, and a non-idempotent inventory deduction would double-decrement stock for the same order.",
            bestApproach: "Carry a unique event/message ID through to every consumer and use it as a dedup key (DB unique constraint or a Redis SETNX check) before applying any side-effecting action.",
          },
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
          detailed: [
            "An API Gateway sits in front of all your services and centralizes concerns every request needs regardless of client: authentication/authorization, rate limiting, TLS termination, request routing, and basic request/response transformation. It's a single, generic front door.",
            "A Backend-for-Frontend goes further: it's a *dedicated* aggregation/orchestration layer per client type (one BFF for mobile, one for web, maybe one for partner APIs) that calls the underlying microservices and shapes the response exactly the way that client wants it — fewer round trips, payloads tailored to screen real estate and bandwidth (mobile gets a slimmed-down response; web gets the full one).",
            "The chattiness problem you're describing — client making 6 calls to render one screen — is *exactly* what a BFF solves: it does the fan-out server-side (where the network is fast) and returns one composed response.",
            "The gateway alone won't fix that because it's generic by design — it doesn't know that 'the mobile home screen needs user+orders+recommendations in one shot.'",
            "Layering: client → gateway (auth, rate limit, routing) → BFF (per-client composition) → microservices.",
          ],
        },
        keyPoints: [
          {
            point: "Gateway = shared, generic front door (auth, rate limiting, routing) — same for every client",
            example: "A Kong gateway terminates TLS and validates JWTs once for every request from mobile, web, and partner clients alike, before anything reaches a backend service.",
            bestApproach: "Keep the gateway's logic generic and client-agnostic — if you find yourself adding 'if client == mobile' branches in the gateway, that logic belongs in a BFF instead.",
          },
          {
            point: "BFF = per-client aggregation/orchestration shaped to that client's exact needs — solves chattiness and over-fetching",
            example: "Netflix's mobile BFF composes catalog + recommendations + continue-watching into one response tailored to a small screen, instead of the client making 3 separate calls and assembling them itself.",
            bestApproach: "Build one BFF per client family (not per individual client version) and have it call existing microservices read-only — never let it own its own source-of-truth data.",
          },
          {
            point: "They're complementary, not competing — gateway handles cross-cutting concerns, BFF handles client-specific composition",
            example: "A request flows client → gateway (auth, rate limit) → BFF (compose mobile home-screen payload) → 4 microservices in parallel — each layer doing a distinct job.",
            bestApproach: "Layer them explicitly in your architecture diagram and resist merging their responsibilities even when it seems like a shortcut for a small team.",
          },
          {
            point: "Watch for the anti-pattern: business logic leaking into the BFF, turning it into a second monolith",
            example: "A BFF that starts validating discount-eligibility rules itself (instead of delegating to the pricing service) becomes a second place that logic can drift out of sync.",
            bestApproach: "Restrict BFF code to composition, shaping, and caching — any rule that affects business outcomes belongs in the owning microservice, enforced via code review.",
          },
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
          detailed: [
            "A full rewrite ('big bang') is one of the riskiest moves in software — Netscape's multi-year rewrite famously let Internet Explorer eat their market share. The Strangler Fig pattern (named after the vine that slowly envelops a tree) avoids this:",
            "(1) Put a thin routing layer / facade (often the API gateway) in front of the monolith so all traffic flows through a single, controllable point.",
            "(2) Pick the *least risky, most isolated* capability first (e.g., 'send email notifications' rather than 'process payments') and rebuild it as a standalone service with its own datastore.",
            "(3) Update the facade to route that capability's traffic to the new service while everything else still goes to the monolith — the monolith and the new service coexist.",
            "(4) Use change-data-capture or dual-writes (carefully — see the dual-write consistency trap) to keep data in sync during the transition window.",
            "(5) Once the new service is proven in production, remove that code path from the monolith. (6) Repeat for the next capability. Over months or years, the monolith 'shrinks' until it's an empty husk you can retire.",
            "The key discipline: each step is independently shippable and reversible — if a new service misbehaves, flip the facade's routing back to the monolith instantly.",
          ],
        },
        keyPoints: [
          {
            point: "Never do a big-bang rewrite on a business-critical system — the Netscape rewrite is the canonical cautionary tale",
            example: "Netscape's multi-year ground-up rewrite shipped no improvements to users for years while Internet Explorer ate their market share out from under them.",
            bestApproach: "Reject any migration plan whose first deliverable is more than a few weeks away — insist on incremental, independently-shippable extractions instead.",
          },
          {
            point: "A routing facade (gateway) is the lever that lets you redirect traffic incrementally and revert instantly",
            example: "Routing `/notifications/*` to a new service while everything else still hits the monolith lets you flip that one route back in seconds if the new service misbehaves.",
            bestApproach: "Stand up the facade/gateway as the very first step of any strangler-fig migration, even before the first capability is extracted — it's the safety net for everything after.",
          },
          {
            point: "Extract the lowest-risk, most-isolated capability first to build confidence and muscle memory",
            example: "Extracting 'send email notifications' first (low blast radius if it breaks) before touching 'process payments' lets the team validate the extraction pattern safely.",
            bestApproach: "Rank candidate capabilities by blast radius if they fail, and order extractions from lowest to highest risk rather than by perceived technical interest.",
          },
          {
            point: "Data synchronization during the transition (CDC / dual writes) is usually the hardest part — harder than the code split",
            example: "Dual-writing orders to both the monolith's DB and a new orders-service DB risks the two silently drifting apart if one write succeeds and the other fails.",
            bestApproach: "Prefer CDC (change-data-capture, e.g. Debezium reading the monolith's write-ahead log) over application-level dual writes — it guarantees a single source of truth during the transition.",
          },
          {
            point: "Each migration step should be independently shippable AND reversible — that's what makes it 'safe'",
            example: "If the new inventory service starts returning wrong stock counts in production, flipping the facade's routing back to the monolith should be a config change, not a rollback deploy.",
            bestApproach: "Treat 'can we revert this step in under 5 minutes without a deploy' as a hard requirement for every extraction, not a nice-to-have.",
          },
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
          detailed: [
            "Layered (n-tier): presentation → business logic → data access, each layer only talks to the one below. Simple to understand and test in isolation; the classic default for CRUD apps. Risk: 'sinkhole anti-pattern' where layers just pass data through with no added value.",
            "Event-driven: producers emit events, consumers react asynchronously (covered above) — fits systems that need to scale independently and tolerate eventual consistency.",
            "CQRS (Command Query Responsibility Segregation): split the *write model* (optimized for consistency/validation) from the *read model* (optimized for fast, denormalized queries) — often paired with event sourcing. Fits systems where read and write patterns are wildly different (e.g., a write is one order, but the read is 50 different dashboards slicing that data differently).",
            "Microkernel (plug-in architecture): a minimal core with pluggable extensions — fits products that need deep customization per customer (IDEs, browsers with extensions, Salesforce-style platforms).",
            "The interview move isn't reciting definitions — it's mapping the *forces* in the prompt ('reads and writes have very different shapes' → CQRS; 'we need third parties to extend this' → microkernel; 'simple CRUD, small team' → layered) to the pattern that resolves them.",
          ],
        },
        keyPoints: [
          {
            point: "Layered/n-tier: simple, testable, the right default for straightforward CRUD — watch for the 'sinkhole' anti-pattern",
            example: "A typical Spring Boot app with controller → service → repository layers is easy for a new engineer to navigate and unit-test each layer in isolation.",
            bestApproach: "Default to a layered structure for CRUD-shaped features, but periodically audit for sinkhole layers (a 'service' method that just calls the repository with no added logic) and collapse them.",
          },
          {
            point: "CQRS: split read/write models when their shapes and scaling needs diverge sharply — usually paired with event sourcing",
            example: "LinkedIn's feed writes go through a validation/storage path while reads are served from a separately-scaled, heavily denormalized, pre-ranked store.",
            bestApproach: "Reach for CQRS only once you can point to a measured divergence between read and write shape/scale — applying it to a simple CRUD resource just doubles your code for no benefit.",
          },
          {
            point: "Microkernel/plugin: minimal core + extensions, for products that must be deeply customizable by others",
            example: "VS Code's core editor is small; almost all functionality (language support, themes, debuggers) ships as extensions running against a stable plugin API.",
            bestApproach: "Define a narrow, stable extension API surface early — the cost of a microkernel architecture is mostly in designing and committing to that interface contract.",
          },
          {
            point: "Don't recite definitions — map the *forces* in the problem statement to the pattern that resolves them",
            example: "Hearing 'reads and writes have wildly different access patterns' should trigger 'CQRS' in your head, not a memorized definition recited regardless of fit.",
            bestApproach: "Practice stating the force in the prompt out loud before naming a pattern ('reads need denormalized speed, writes need strict validation, so I'd split the models') — that ordering is the actual skill.",
          },
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
          detailed: [
            "CAP theorem (Brewer's theorem): in a distributed system, you can only guarantee two of Consistency, Availability, and Partition tolerance at once. But partition tolerance isn't really optional — networks *will* partition, so in practice the choice is CP (stay consistent, refuse requests you can't safely answer) vs AP (stay available, risk serving stale data) *during* a partition.",
            "The oversimplification critique: CAP only describes behavior *during* a network partition, which is a relatively rare event. The more useful everyday question is 'when there's no partition, do you trade consistency for lower latency?' — which is exactly what PACELC adds: 'else, Latency vs Consistency.'",
            "So a system is fully described as PA/EL (available during partitions, low-latency normally — e.g., Cassandra, DynamoDB) or PC/EC (consistent during partitions, willing to pay latency for it normally — e.g., traditional RDBMS with synchronous replication, HBase).",
            "The interview-winning move is naming PACELC unprompted — it signals you know CAP is necessary-but-incomplete.",
          ],
        },
        keyPoints: [
          {
            point: "CAP only binds during a network partition — pick C (refuse to answer if you can't be sure) or A (answer anyway, possibly with stale data)",
            example: "During a network split, a CP store like HBase returns an error rather than risk an inconsistent read; an AP store like Cassandra answers from whichever replica it can reach.",
            bestApproach: "Decide CP vs AP per data type, not per system — inventory counts might need CP while user preferences can stay AP, even within the same product.",
          },
          {
            point: "Partition tolerance is not optional in a real distributed system — so CAP really reduces to 'CP or AP when partitioned'",
            example: "Any multi-region deployment will eventually see a network partition between regions — assuming it 'won't happen' is how teams get paged for a split-brain incident.",
            bestApproach: "Design the partition-handling behavior explicitly during architecture review ('if region A and B can't talk, what happens?') rather than discovering it during an actual outage.",
          },
          {
            point: "PACELC extends CAP: even with no partition, you trade Latency vs Consistency — this is the trade-off you face *most* of the time",
            example: "A normally-functioning multi-region DB still must choose: wait for cross-region replica acks (consistent, slower) or return immediately from the local replica (fast, possibly stale).",
            bestApproach: "State your PACELC position explicitly in design docs ('PA/EL: available during partitions, low-latency normally') so the trade-off is a documented decision, not an implicit accident.",
          },
          {
            point: "Classify real systems as PA/EL (Cassandra, DynamoDB) or PC/EC (traditional RDBMS, HBase, Spanner-ish systems) to show depth",
            example: "DynamoDB defaults to PA/EL (eventually-consistent, fast reads) but offers an opt-in strongly-consistent read mode that shifts a specific query toward PC/EC.",
            bestApproach: "Memorize 2-3 reference systems per quadrant so you can classify any new system you encounter by analogy instead of reasoning from scratch every time.",
          },
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
          detailed: [
            "Strong consistency: every read reflects the most recent write, system-wide, the instant it commits — required for things like account balances, inventory counts, and seat reservations where stale reads cause real-world harm (double-booking, overdraft). It costs latency (often a quorum round-trip) and can reduce availability during partitions.",
            "Eventual consistency: writes propagate asynchronously; readers may see stale data for a window, but all replicas *converge* to the same value once propagation finishes — perfectly fine for profile pictures, like counts, view counts, search indexes. It buys you low latency and high availability.",
            "Causal consistency sits in between: it doesn't guarantee everyone sees updates instantly, but it *does* guarantee that if event B happened because of event A, no one ever sees B without having seen A first — critical for things like comment threads (you should never see a reply before the comment it replies to) or chat apps.",
            "The skill being tested is: can you look at a feature and say 'this needs strong / this can tolerate eventual / this needs causal ordering specifically' instead of defaulting to 'just make everything strongly consistent' (which kills your availability and latency).",
          ],
        },
        keyPoints: [
          {
            point: "Strong consistency = always-fresh reads, at the cost of latency/availability — reserve it for money, inventory, anything where staleness causes real harm",
            example: "A bank transfer reads the account balance with a quorum read before debiting, ensuring no two concurrent transfers both see the same stale balance and overdraw the account.",
            bestApproach: "Use SELECT FOR UPDATE or a quorum read only on the specific operations where staleness causes real-world harm — not as a blanket setting for the whole database.",
          },
          {
            point: "Eventual consistency = converges over time, cheap and available — perfect for likes, views, profile data, search indexes",
            example: "A YouTube view counter shown as '1.2M views' might lag the true count by a few seconds across replicas — invisible to any single viewer and harmless either way.",
            bestApproach: "Default high-volume, low-stakes counters and metadata to eventual consistency, and make the convergence window (seconds, not minutes) an explicit, monitored SLO.",
          },
          {
            point: "Causal consistency = preserves cause-and-effect ordering without requiring global freshness — the right fit for comment threads, chat, collaborative editing",
            example: "A Slack thread must never show a reply before the message it's replying to, even though the rest of the channel can lag by a moment without anyone noticing.",
            bestApproach: "Tag causally-related writes (a reply references its parent's version/timestamp) so the read path can enforce 'never show B before A' even under eventual replication.",
          },
          {
            point: "The senior move is matching the model to the feature's actual tolerance for staleness — not picking one model for the whole system",
            example: "Amazon's cart stays eventually consistent (never lose an item) while checkout's payment step uses strong consistency (never double-charge) — two models, one product.",
            bestApproach: "Make consistency model a per-feature design decision documented alongside the data model, not a single database-wide setting applied uniformly.",
          },
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
          detailed: [
            "Two canonical availability patterns: (1) Failover — active-passive: a standby replica takes over when the primary fails (simple, but the failover itself causes a brief outage and risks losing in-flight data); active-active: multiple nodes serve traffic simultaneously, so losing one doesn't interrupt service at all (harder — needs conflict resolution and careful data replication, but no failover gap).",
            "(2) Replication — master-slave (one writer, many readers — simple, but the master is still a single point of failure for writes) vs master-master (multiple writable nodes — eliminates that SPOF but opens the door to write conflicts that need resolution, e.g., last-write-wins or CRDTs).",
            "Beyond these two big levers: health checks + automated failover (detect failure in seconds, not minutes of paging a human), redundancy at *every* layer (load balancers, DNS, even across availability zones/regions — a redundant app tier behind a single-AZ database is still a SPOF).",
            "Also: graceful degradation (serve a cached/stale response or a reduced feature set instead of a hard error when a dependency is down), and circuit breakers (stop hammering a failing dependency so it can recover, and so your own thread pool doesn't exhaust).",
            "The 'nines' framing matters in interviews: each additional nine is roughly an order of magnitude harder and more expensive — know the napkin math (99.9% ≈ 8.7 hrs/yr down, 99.99% ≈ 52 min/yr, 99.999% ≈ 5 min/yr).",
          ],
        },
        keyPoints: [
          {
            point: "Memorize the 'nines' table — it's the fastest way to show you understand what the ask actually costs (99.9%≈8.7h/yr, 99.99%≈52min/yr, 99.999%≈5min/yr)",
            example: "Telling leadership '99.99% means we can be down a total of 52 minutes across the whole year' reframes a vague ask into a concrete, achievable (or alarming) target.",
            bestApproach: "Translate every availability target into its yearly/monthly downtime budget in the very first conversation, before any architecture discussion starts.",
          },
          {
            point: "Active-active eliminates failover gaps entirely but requires conflict resolution; active-passive is simpler but has a recovery window",
            example: "An active-active multi-region setup keeps serving traffic instantly if one region dies; an active-passive setup has a 30-90 second gap while the standby is promoted.",
            bestApproach: "Choose active-passive by default for stateful services unless you've specifically solved write-conflict resolution — active-active's complexity isn't worth it without that.",
          },
          {
            point: "Redundancy must exist at *every* layer — DNS, load balancer, app, cache, database, even the AZ/region — one weak link caps the whole chain",
            example: "A fully redundant 3-AZ app tier behind a single-AZ database still goes down completely the moment that one AZ has an outage.",
            bestApproach: "Walk the full request path layer by layer and ask 'what's the replica count here?' for each — your overall availability is bounded by the least-redundant layer.",
          },
          {
            point: "Graceful degradation (serve something instead of nothing) often buys more perceived availability than raw uptime numbers do",
            example: "Showing a product page with cached/stale recommendations when the recommendations service is down feels 'up' to the user, even though one dependency technically failed.",
            bestApproach: "Identify which dependencies are 'enhancing' vs 'essential' for each user-facing flow, and build a fallback path for every enhancing one.",
          },
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
          detailed: [
            "Master-slave (single-leader): all writes go to one master; it replicates (sync or async) to read replicas. Sync replication guarantees no data loss on failover but adds write latency (you wait for replicas to ack); async replication is fast but a master crash can lose the last few un-replicated writes.",
            "Either way, the master remains a single point of failure for writes — promoting a replica to master takes time (detection + election + DNS/connection updates) during which writes are unavailable.",
            "Master-master (multi-leader): multiple nodes accept writes and replicate to each other — no SPOF for writes, lower write latency for geographically distributed users (write to your nearest node). The cost: concurrent writes to the same record on different masters *will* conflict (e.g., two regions both update the same user's email simultaneously).",
            "Resolution strategies include last-write-wins (simple, but silently discards one update), version vectors (detect conflicts, surface them to the application), and CRDTs (conflict-free replicated data types — mathematically guaranteed to merge without conflict, but limited to certain data shapes like counters and sets).",
            "The interview answer should name the failure mode of *each* choice and tie the pick to the actual access pattern — 'if writes are naturally partitioned by region (each user's data is written from one region), master-master with regional ownership avoids most conflicts entirely.'",
          ],
        },
        keyPoints: [
          {
            point: "Master-slave: simple, consistent, but the master is a SPOF for writes and failover has a real recovery window",
            example: "A Postgres primary crashing triggers a 10-30 second window where writes fail entirely while a replica is promoted and DNS/connections are updated.",
            bestApproach: "Automate failover detection and promotion (Patroni, RDS Multi-AZ) rather than relying on a human to notice and promote a replica manually during an incident.",
          },
          {
            point: "Master-master: no write SPOF and lower latency for distributed writers, but introduces conflicts that must be resolved (LWW, version vectors, CRDTs)",
            example: "Two regions both updating the same user's email within milliseconds of each other produces a genuine conflict that last-write-wins resolves by silently discarding one update.",
            bestApproach: "Partition write ownership by a natural key (e.g., each user's data is always written from their home region) so multi-master conflicts become rare instead of routine.",
          },
          {
            point: "Sync replication = safer but slower; async replication = faster but risks losing the last few writes on a crash",
            example: "A financial ledger uses synchronous replication (wait for replica ack) specifically so a primary crash can never silently lose a committed transaction.",
            bestApproach: "Reserve synchronous replication for data where losing the last few seconds of writes is unacceptable — use async everywhere else to keep write latency low.",
          },
          {
            point: "Best answer ties the choice to the *access pattern* — e.g., regionally-partitioned ownership sidesteps most multi-master conflicts",
            example: "CockroachDB avoids classic multi-master conflicts by using Raft consensus per data range, so there's always exactly one leaseholder for any given range at a time.",
            bestApproach: "Before picking a replication topology, map out who actually writes which rows and from where — the access pattern usually makes the right topology obvious.",
          },
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
          detailed: [
            "Read Uncommitted: transactions can see other transactions' *uncommitted* changes — allows dirty reads (you might read data that gets rolled back a moment later, i.e., data that never 'really' existed). Almost never used in practice.",
            "Read Committed (Postgres/Oracle default): you only ever see committed data, but if you read the same row twice in one transaction, it might have changed in between (non-repeatable read) because each statement takes a fresh snapshot.",
            "Repeatable Read (MySQL/InnoDB default): your transaction sees a consistent snapshot for its whole duration — re-reading the same row always returns the same value — but new rows matching your filter can appear between queries (phantom reads), e.g., a range query returns 10 rows, then 12 on a re-run because someone inserted two more.",
            "Serializable: the strictest — transactions behave *as if* they ran one at a time, sequentially; prevents dirty reads, non-repeatable reads, and phantoms. The cost is real: it requires either heavy locking (which serializes contended workloads and tanks throughput) or optimistic concurrency control with abort-and-retry (which wastes work under contention).",
            "The practical answer: 'Read Committed is the right default for most OLTP — it's fast and prevents the worst anomaly (dirty reads). I reach for Serializable (or explicit row locks / SELECT FOR UPDATE) only for the specific operations where a race genuinely causes business harm — like decrementing inventory or transferring money — not for the whole system.'",
          ],
        },
        keyPoints: [
          {
            point: "Each level is defined by which anomalies it allows: dirty read → non-repeatable read → phantom read, in increasing strictness",
            example: "Read Uncommitted would let a fraud-check transaction read another transaction's not-yet-committed (possibly-to-be-rolled-back) balance update — a dirty read that's almost never acceptable.",
            bestApproach: "Memorize the anomaly each level prevents (not just the level names) so you can reason from 'which anomaly would hurt us here' to the right isolation level directly.",
          },
          {
            point: "Read Committed (Postgres default) is the pragmatic default for most OLTP — fast, and prevents the worst anomaly (dirty reads)",
            example: "Most CRUD applications (user profiles, content management) run fine at Read Committed because non-repeatable reads within a single transaction rarely matter for their workload.",
            bestApproach: "Leave the database at its default isolation level (usually Read Committed) and only raise it for specific transactions that have a proven race condition.",
          },
          {
            point: "Serializable prevents everything but can crater throughput — apply it surgically (specific transactions), not globally",
            example: "Running an entire e-commerce checkout flow at Serializable isolation can cause heavy lock contention and abort-retry storms during a flash sale.",
            bestApproach: "Scope Serializable (or explicit locking) to the smallest possible transaction boundary around the specific race-prone operation, not the whole request handler.",
          },
          {
            point: "SELECT FOR UPDATE / explicit row locks often solve the *specific* race you're worried about more cheaply than raising the global isolation level",
            example: "A targeted `SELECT ... FOR UPDATE` on the inventory row during checkout fixed a double-sell bug without touching the database's global isolation setting.",
            bestApproach: "Reach for `SELECT FOR UPDATE` on the specific contended row before reaching for Serializable isolation — it's cheaper and easier to reason about.",
          },
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
          detailed: [
            "Relational databases give you a fixed schema, ACID transactions, joins, and a mature query language — ideal when your data has clear relationships that you need to query flexibly and consistently (orders ↔ customers ↔ payments; anything where 'this number must always add up' matters).",
            "NoSQL is an umbrella for very different things: document stores (MongoDB — flexible nested schemas, good for content/catalogs), key-value stores (Redis/DynamoDB — blazing-fast lookups by key, great for sessions/caches), wide-column stores (Cassandra/HBase — write-heavy, time-series, massive scale with eventual consistency), and graph databases (Neo4j — relationship-heavy data like social graphs or fraud networks).",
            "The honest framing: relational databases *can* scale (sharding, read replicas, Vitess/Citus) — the difference is that many NoSQL stores are *designed scale-out from day one* and trade away joins/transactions/strict schema to get there more easily operationally.",
            "So the real questions are: 'does my data have relationships I need to query across?' (→ relational), 'is my access pattern simple key lookups at extreme scale?' (→ key-value/wide-column), 'does my schema change shape per record?' (→ document), 'am I querying relationships themselves (friends-of-friends)?' (→ graph).",
            "Many real systems are polyglot — Postgres for orders, Redis for sessions, Elasticsearch for search — picked per *workload*, not as a single system-wide religion.",
          ],
        },
        keyPoints: [
          {
            point: "'NoSQL scales better' is largely a myth — well-sharded Postgres/MySQL handle enormous scale; the real difference is what you give up to get there easily",
            example: "Vitess (sharded MySQL) powers YouTube's metadata at massive scale, proving a relational store can scale horizontally given the right sharding layer.",
            bestApproach: "Justify a NoSQL choice by data shape and access pattern, never by a 'NoSQL scales, SQL doesn't' claim — that claim alone should be treated as a red flag in a design review.",
          },
          {
            point: "Pick based on data shape and access pattern: relationships/joins → relational; flexible nested docs → document; pure key lookups at scale → key-value/wide-column; relationship traversal → graph",
            example: "A product catalog with category-specific varying attributes fits MongoDB's flexible schema far more naturally than a relational table full of nullable columns.",
            bestApproach: "Write out your top 5 actual queries before picking a database family — let the queries, not the entity diagram, decide.",
          },
          {
            point: "ACID transactions are relational DBs' superpower — don't give them up for a 'NoSQL is modern' vibe when you actually need them",
            example: "A double-entry ledger (every debit has a matching credit) genuinely needs multi-row ACID transactions — modeling it in a document store invites real correctness bugs.",
            bestApproach: "Keep money, inventory, and anything needing multi-row invariants in a relational store, even in an otherwise polyglot architecture.",
          },
          {
            point: "Polyglot persistence (different stores for different workloads) is normal and often the *right* senior answer",
            example: "A single e-commerce product reasonably uses Postgres for orders, Redis for sessions, and Elasticsearch for search — three stores, each matched to its workload.",
            bestApproach: "Don't force a single database to serve every workload in a system — introduce a second store only when a specific workload's access pattern genuinely doesn't fit the first.",
          },
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
          detailed: [
            "First, exhaust simpler options — better indexes, query optimization, read replicas, caching, archiving cold data — sharding is a one-way door that adds massive operational complexity, so it should be the *last* resort, not the first idea.",
            "(1) Pick a shard key — the column you'll partition by. The best key is the one most queries already filter by (e.g., `customer_id` if 90% of queries are 'get this customer's orders') — that makes most queries single-shard. A bad key (e.g., `created_at`) forces most queries to fan out across every shard.",
            "(2) Choose a partitioning scheme: range-based (shard A = IDs 1-1M, shard B = 1M-2M — simple, but creates hotspots when new data always lands on the newest shard); hash-based (hash(key) % N — spreads load evenly, but makes range queries and resharding painful); directory-based (a lookup service maps keys to shards — flexible and supports resharding, but the directory itself becomes a critical dependency).",
            "(3) Accept the new costs: cross-shard joins don't exist anymore — you either denormalize data so joins aren't needed, or do the join in the application by querying multiple shards and merging; cross-shard transactions need sagas or two-phase commit; resharding (adding shard N+1) is operationally hard — consistent hashing minimizes how much data must move when you do.",
            "The interview-winning instinct is naming *what breaks* (joins, transactions, resharding) just as confidently as naming the scheme.",
          ],
        },
        keyPoints: [
          {
            point: "Sharding is a last resort — exhaust indexing, caching, replicas, and archiving first; it's a one-way door operationally",
            example: "A team facing slow order queries fixed it with a missing composite index and archiving orders older than 2 years to cold storage — sharding was never needed.",
            bestApproach: "Require a written justification showing indexing/caching/replicas/archiving were tried and measured before approving a sharding project.",
          },
          {
            point: "Shard key choice is the single most important decision — pick the column your dominant query already filters by",
            example: "Instagram shards by user ID because 'get this user's posts' is the dominant query — a `created_at` shard key would have forced almost every query to fan out across all shards.",
            bestApproach: "List your top 3 queries by frequency before choosing a shard key, and pick the key that makes the most frequent query single-shard.",
          },
          {
            point: "Range sharding is simple but hotspot-prone; hash sharding balances load but kills range queries; directory-based is flexible but adds a dependency",
            example: "Range-sharding orders by creation date concentrates all new writes on the single 'latest' shard — a classic hotspot that hash sharding would have avoided.",
            bestApproach: "Default to hash-based sharding for write-heavy workloads unless you specifically need efficient range scans, in which case accept the hotspot risk and mitigate with time-bucketed sub-keys.",
          },
          {
            point: "Naming what *breaks* after sharding (cross-shard joins, transactions, resharding pain) shows more depth than naming the scheme itself",
            example: "After sharding orders by customer_id, a 'top 10 products this week across all customers' report now requires querying every shard and merging results in the application.",
            bestApproach: "Before sharding, inventory every cross-cutting query (reports, admin tools, analytics) that will break, and design a scatter-gather or separate analytics pipeline for them upfront.",
          },
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
          detailed: [
            "Cache-aside (lazy loading): app checks the cache first; on a miss, reads from the DB and populates the cache; writes go to the DB and either invalidate or update the cache entry. Most common pattern — simple, resilient to cache failures (just falls through to the DB), but has a window where cache and DB can disagree, and a 'thundering herd' risk where a popular key's expiry causes many requests to simultaneously hit the DB.",
            "Write-through: every write goes to the cache *and* the DB synchronously — readers always see fresh data, but writes are slower (two systems must ack) and you're caching data that might never be read (wasted memory).",
            "Write-behind (write-back): writes go to the cache immediately and are asynchronously flushed to the DB later — very fast writes, but a cache crash before the flush means real data loss, so it's only appropriate when some loss is tolerable (metrics, analytics counters) or the cache itself is durable (Redis with AOF).",
            "For a product catalog specifically: cache-aside with a TTL is the right default — reads vastly outnumber writes, staleness for a few seconds/minutes is harmless for product descriptions, and a cache outage degrades gracefully (falls through to the DB) rather than catastrophically.",
          ],
        },
        keyPoints: [
          {
            point: "Cache-aside: app-managed, resilient to cache failure, most common default — but has a staleness window and thundering-herd risk",
            example: "A product catalog cache that goes down simply falls through to Postgres for every request — slower, but the site stays up rather than erroring out.",
            bestApproach: "Default new caches to cache-aside with a sane TTL (seconds to minutes depending on staleness tolerance) unless a specific requirement calls for write-through or write-behind.",
          },
          {
            point: "Write-through: always-fresh reads, slower writes, risks caching data nobody reads — fits read-heavy + consistency-sensitive workloads",
            example: "A user-profile cache updated synchronously on every profile edit guarantees the next read is always fresh, at the cost of every edit waiting on two systems instead of one.",
            bestApproach: "Use write-through only for data that's both frequently read AND where staleness is unacceptable — for everything else the extra write latency isn't worth paying.",
          },
          {
            point: "Write-behind: fastest writes, real data-loss risk on crash — only for tolerant or durable-cache scenarios",
            example: "A view-counter using write-behind to Redis batches increments and flushes to Postgres every few seconds — losing a few seconds of counts on a crash is an acceptable trade.",
            bestApproach: "Reserve write-behind for metrics/counters where occasional small data loss is truly tolerable, and use a durable cache (Redis with AOF) if even that risk needs reducing.",
          },
          {
            point: "Always pair caching with an eviction policy (LRU/LFU/TTL) and a plan for the thundering-herd problem (request coalescing, jittered TTLs, locks)",
            example: "A hot product page's cache entry expiring exactly at noon caused 10,000 simultaneous requests to hit Postgres at once during a flash sale — a classic thundering herd.",
            bestApproach: "Add jitter to TTLs (e.g., 300s ± 30s randomized) and use request coalescing (a lock so only one request repopulates a missing key while others wait) for any high-traffic cache key.",
          },
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
          detailed: [
            "Normalization (splitting data into related tables, e.g., `posts`, `authors`, `comments`, `tags`, `post_tags`) eliminates duplication — an author's name lives in exactly one row, so updating it updates it everywhere instantly, and you can never have it disagree with itself. The cost is that reading a 'complete' view (a post with its author, comments, and tags) requires joins across 4-5 tables, which gets expensive at scale.",
            "Denormalization (duplicating data to avoid joins, e.g., storing `author_name` directly on the `posts` row, or pre-computing a `comment_count`) makes specific reads dramatically faster and simpler — at the cost of needing to keep duplicates in sync on every write (if an author changes their display name, you now must update every post they've written, or accept staleness).",
            "The senior framing: start normalized (correctness is cheap to get right early, expensive to retrofit later); denormalize *specific, measured* hot paths once you can show that joins are the actual bottleneck — and do it consciously, with a clear plan for keeping the duplicated data in sync (background jobs, event-driven updates, or accepting bounded staleness).",
            "Document databases push this further by *encouraging* denormalization/embedding by default — which is great for read performance on self-contained documents, but painful the moment you need to query or update the embedded data independently.",
          ],
        },
        keyPoints: [
          {
            point: "Normalize first — it makes write-side correctness close to free; you only pay at read time (joins)",
            example: "Storing an author's name only once in the `authors` table means a name change updates instantly everywhere, with zero risk of disagreement between rows.",
            bestApproach: "Start every new schema fully normalized (3NF), and treat any deviation as a deliberate, documented exception rather than a default.",
          },
          {
            point: "Denormalize deliberately and selectively — for *measured* hot read paths, with an explicit plan for keeping duplicates in sync",
            example: "Reddit denormalizes vote counts onto post rows (avoiding a COUNT(*) over millions of votes per page load) and reconciles them with a periodic background job.",
            bestApproach: "Denormalize only after profiling shows a specific join is the bottleneck, and pair every denormalized field with an explicit sync mechanism (trigger, event consumer, or background job) from day one.",
          },
          {
            point: "Every denormalized field is a promise you must keep on every future write — that promise has an ongoing maintenance cost",
            example: "A denormalized `author_name` on every post becomes stale the moment an author changes their display name, unless every post-write path also updates it.",
            bestApproach: "Document each denormalized field's 'source of truth' and update path explicitly in the schema comments so future engineers don't accidentally write around it.",
          },
          {
            point: "Document databases bias toward embedding by default — great for self-contained reads, painful for independent updates to embedded data",
            example: "Embedding comments inside a MongoDB blog-post document makes reading a post fast, but updating a single comment requires rewriting the whole document.",
            bestApproach: "Embed data that's always read together and rarely updated independently; reference (separate collection + ID) data that needs its own update lifecycle or is queried on its own.",
          },
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
          detailed: [
            "REST: resource-oriented over HTTP, leans on standard verbs/status codes, is naturally cacheable (GET is cacheable by CDNs/browsers for free), has the widest tooling and team familiarity — but suffers from over-fetching (client gets the whole resource even if it needs 2 fields) and under-fetching (client must make N follow-up calls to assemble a view), and versioning tends to be clunky (`/v1/`, `/v2/`).",
            "GraphQL: client specifies exactly the fields it needs in a single query — eliminates over/under-fetching and is brilliant when different clients (mobile vs web vs partner) need different shapes from the same underlying data. The costs: caching is much harder (no more free GET caching — everything is a POST to one endpoint), the N+1 query problem moves to the resolver layer (solved with DataLoader-style batching), and a poorly-designed schema lets clients construct expensive queries that hurt your backend (needs query cost analysis/depth limiting).",
            "gRPC: binary protocol over HTTP/2, code-generated strongly-typed clients/servers from `.proto` files, supports streaming (unary, server-streaming, client-streaming, bidirectional) — extremely fast and efficient, ideal for internal service-to-service calls where both ends are your own code. The costs: not browser-native (needs gRPC-Web + a proxy), harder to debug than JSON-over-HTTP (binary wire format, needs `grpcurl`), and the tight coupling via generated code means schema changes ripple across services.",
            "The senior answer names all three and where each actually wins — not a single winner.",
          ],
        },
        keyPoints: [
          {
            point: "REST: simple, cacheable, universally understood — but prone to over/under-fetching and clunky versioning",
            example: "A mobile client fetching `/users/123` gets back 40 fields when it only needs 3 (name, avatar, status) — classic over-fetching that wastes mobile bandwidth.",
            bestApproach: "Use REST for simple, cacheable resource APIs and partner-facing endpoints where broad tooling support and HTTP caching semantics matter more than payload precision.",
          },
          {
            point: "GraphQL: client-shaped responses eliminate over/under-fetching — at the cost of caching, N+1-at-the-resolver, and query-cost governance",
            example: "A GraphQL query naively resolving `posts { author { name } }` can trigger one DB query per post for the author — the N+1 problem, fixed with DataLoader batching.",
            bestApproach: "Adopt GraphQL for client-facing APIs with genuinely diverse client needs (web vs mobile vs partner), and budget engineering time for DataLoader batching and query-cost/depth limiting from day one.",
          },
          {
            point: "gRPC: fast, strongly-typed, streaming-capable — best for internal service-to-service calls; weak on browser support and debuggability",
            example: "Netflix uses gRPC for low-latency, strongly-typed calls between hundreds of internal services written in different languages, sharing a single .proto contract.",
            bestApproach: "Default to gRPC for internal service-to-service calls where both ends are your own code; avoid it at the browser-facing edge without a gRPC-Web proxy layer.",
          },
          {
            point: "Real systems mix all three by *boundary* — gRPC internally, GraphQL/REST at the client-facing edge — rather than picking one for everything",
            example: "Netflix runs gRPC internally but exposes a GraphQL-Federation-style API at the client edge, because each layer has a different consumer with different needs.",
            bestApproach: "Pick the protocol per architectural boundary (internal service mesh vs client-facing edge) rather than mandating one protocol company-wide.",
          },
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
          detailed: [
            "Why a queue at all: it breaks the synchronous chain (covered in event-driven architecture) — the producer doesn't wait for slow consumers, a burst of orders gets buffered instead of overwhelming downstream services, and a crashed consumer can restart and pick up where it left off instead of losing work.",
            "Kafka: a distributed log — messages are appended to partitioned, replicated topics and *retained* (not deleted on consumption), so multiple independent consumer groups can each read the full stream at their own pace, and you can replay history (reprocess the last 24 hours after fixing a bug). It shines for high-throughput event streaming, log aggregation, and stream processing — but has a steeper operational curve (Zookeeper/KRaft, partition rebalancing, consumer group management).",
            "RabbitMQ: a traditional message broker with rich routing (exchanges: direct, topic, fanout, headers) and strong per-message delivery guarantees (acks, dead-letter queues, priority queues) — fits complex routing topologies and task-queue patterns (worker pools) better than Kafka does, at lower throughput ceilings.",
            "SQS (or managed equivalents): fully-managed, nearly zero ops, simple at-least-once delivery with visibility timeouts — the right call when you want 'just works' over fine-grained control, and your routing needs are simple.",
            "The real interview signal is matching 'replay + high-throughput streaming' → Kafka, 'complex routing + strict per-message semantics' → RabbitMQ, 'minimal ops + simple task queue' → SQS.",
          ],
        },
        keyPoints: [
          {
            point: "Queues decouple producer/consumer in time and failure domain, absorb bursts, and enable retries — that's the 'why' before the 'which'",
            example: "Order placement publishes to a queue and returns instantly; a traffic spike just makes the queue longer instead of timing out the order API.",
            bestApproach: "Justify the queue's existence by naming the specific burst/decoupling/retry problem it solves before picking a vendor — the 'why' should survive even if the 'which' changes later.",
          },
          {
            point: "Kafka: retained, replayable, partitioned log — best for high-throughput streaming and multiple independent consumers",
            example: "LinkedIn's Kafka topics retain events so search-indexing, recommendations, and analytics can each consume the same page-view stream independently, at their own pace.",
            bestApproach: "Reach for Kafka when multiple independent consumer groups need the same event stream, or when you need to replay history after fixing a downstream bug.",
          },
          {
            point: "RabbitMQ: rich routing + strong per-message guarantees — best for complex topologies and worker-pool task queues",
            example: "A task queue routing 'high-priority' vs 'low-priority' jobs to different worker pools via topic exchanges is a natural fit for RabbitMQ's routing model.",
            bestApproach: "Pick RabbitMQ when you need complex routing logic (priority queues, topic-based fan-out) or strict per-message ack/dead-letter semantics that Kafka doesn't model as naturally.",
          },
          {
            point: "SQS/managed: near-zero ops, simple semantics — best when you want to stop thinking about infrastructure",
            example: "A small team building an MVP uses SQS for background email sending instead of standing up and operating a Kafka cluster they don't have headcount to run.",
            bestApproach: "Default to a managed queue (SQS/Cloud Tasks) unless you have a specific, named need (replay, complex routing, extreme throughput) that justifies the added operational ownership.",
          },
          {
            point: "All of them are at-least-once by default — your consumers must be idempotent regardless of which you pick",
            example: "An SQS message redelivered after a worker times out (but actually finished) would double-send a welcome email without an idempotency check.",
            bestApproach: "Build idempotency (dedup keys, upserts) into every consumer as a non-negotiable baseline, regardless of which queue technology is chosen.",
          },
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
          detailed: [
            "Long polling: client sends a request; the server holds it open until there's new data (or a timeout) and responds, then the client immediately re-requests. It's a hack on top of plain HTTP — works everywhere, needs no special infra — but wastes connections and adds latency (there's always a request/response round trip per update), and at scale you're holding open huge numbers of HTTP connections.",
            "Server-Sent Events (SSE): a single long-lived HTTP connection where the *server* streams events to the client as plain text (`text/event-stream`); the browser's `EventSource` API handles reconnection automatically. It's one-directional (server → client only), simple to implement (it's just HTTP — works through existing proxies/load balancers/firewalls without special handling), and perfect for status updates, live feeds, notifications — anything where the client doesn't need to talk back on the same channel.",
            "WebSockets: a full-duplex, persistent TCP-like connection established via an HTTP upgrade handshake — both sides can send messages anytime, with minimal per-message overhead. It's the right (and often only sane) choice for chat, multiplayer games, collaborative editing — anything genuinely bidirectional and low-latency. The cost: it needs special infrastructure handling (load balancers must support sticky connections or a shared pub/sub backplane like Redis to fan out messages across server instances), and it's overkill (and harder to scale/debug) for problems that are really one-directional.",
            "For 'push order status to the browser' specifically — that's one-directional, server→client — SSE is the simplest correct tool; reaching for WebSockets here is solving a one-way problem with a two-way hammer.",
          ],
        },
        keyPoints: [
          {
            point: "Match mechanism to *data direction*: one-way server→client → SSE; truly bidirectional → WebSockets; legacy compatibility fallback → long polling",
            example: "A live order-status tracker only needs the server to push updates — SSE is the simplest correct tool; a chat app needs both directions, so WebSockets fit.",
            bestApproach: "Ask 'does the client ever need to send data on this same channel mid-stream?' first — a 'no' answer should rule out WebSockets immediately.",
          },
          {
            point: "SSE is just HTTP — auto-reconnect built into the browser, works through normal infrastructure, far simpler to operate than WebSockets",
            example: "A delivery-tracking page using `EventSource` reconnects automatically after a brief network blip with zero custom reconnection code.",
            bestApproach: "Prefer SSE over WebSockets whenever the data flow is one-directional — it needs no special load-balancer configuration and degrades gracefully through existing infra.",
          },
          {
            point: "WebSockets need a fan-out story across server instances (sticky LB sessions or a shared pub/sub backplane) — that's real infra cost",
            example: "A chat app with 10 WebSocket server instances needs a Redis pub/sub backplane so a message from a user on server A reaches a recipient connected to server B.",
            bestApproach: "Plan the cross-instance fan-out mechanism (Redis pub/sub, or a dedicated routing layer) as part of the initial WebSocket design, not as a fix after the first multi-instance bug.",
          },
          {
            point: "Don't reach for the most powerful tool by default — a one-directional problem solved with WebSockets is needless complexity",
            example: "A team building a one-way notification feed chose WebSockets 'to be safe' and then had to build sticky-session load balancing they didn't actually need for SSE.",
            bestApproach: "Start with the simplest mechanism that satisfies the data-direction requirement, and only escalate to WebSockets when a genuine bidirectional need appears.",
          },
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
          detailed: [
            "The smell here is a request handler doing real work (transcoding — CPU-heavy, slow, possibly minutes long) inside the synchronous request/response cycle, where HTTP timeouts, connection limits, and thread-pool exhaustion are all working against you.",
            "(1) The API handler does the *minimum necessary* synchronously — validate the upload, store the raw file, write a `VideoUploaded` job/event, and return `202 Accepted` with a job ID immediately.",
            "(2) A pool of background workers (consuming from a queue) picks up the job and does the actual transcoding, retrying on failure with backoff, completely decoupled from any HTTP request's lifetime.",
            "(3) The client finds out when it's done via polling a status endpoint, a WebSocket/SSE push, or a webhook/email notification — whichever fits the UX.",
            "This pattern generalizes: anything slow (image/video processing, PDF generation, ML inference, bulk exports), anything that calls flaky external systems (sending emails, calling third-party APIs, webhooks), or anything that doesn't gate the user's immediate next action should move to the background.",
            "The discipline question to ask of every endpoint: 'does the user need to wait for this to *complete*, or just for it to be *durably accepted*?' If it's the latter, get it off the request path.",
          ],
        },
        keyPoints: [
          {
            point: "The question to ask per-operation: does the user need the result *now*, or just confirmation it was *accepted*? If the latter — go async",
            example: "A user uploading a video doesn't need the transcoded result instantly — they need confirmation 'upload received' instantly, which is a much cheaper promise to keep.",
            bestApproach: "Add this question as a standing checklist item in API design reviews — any endpoint doing real work synchronously should justify why it can't be split into accept-fast + process-later.",
          },
          {
            point: "Standard shape: validate + enqueue fast (return 202), process in background workers, notify via poll/push/webhook on completion",
            example: "YouTube's upload endpoint returns 'processing' the instant bytes land, while a worker fleet transcodes into a dozen resolutions over the following minutes.",
            bestApproach: "Return a job ID with the 202 response so the client has something concrete to poll or subscribe to for completion status.",
          },
          {
            point: "Background workers need their own retry/backoff/dead-letter strategy — decoupled from any single HTTP request's lifetime",
            example: "A transcoding worker that crashes mid-job should retry from a checkpoint or restart cleanly, without the original HTTP request (long gone) being involved at all.",
            bestApproach: "Design worker retry/backoff and dead-letter handling as a standalone concern, tested independently of the API layer that originally enqueued the job.",
          },
          {
            point: "Generalizes to: anything slow (transcoding, exports, ML), anything flaky (emails, third-party calls), anything non-blocking for the user's next step",
            example: "Sending a welcome email synchronously during signup means a flaky SMTP provider can fail the entire signup request — moving it to a queue decouples the two.",
            bestApproach: "Audit every external/third-party call in a request handler and ask 'would a 5-second outage here be acceptable to fail the whole request?' — if not, make it async.",
          },
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
          detailed: [
            "Round robin: requests go to servers in fixed rotation — dead simple, but assumes every request costs the same and every server is equally capable; one slow request (or one underpowered box) creates an uneven pile-up that round robin is blind to.",
            "Least connections: routes to whichever server currently has the fewest active connections — adapts to real-time load and handles uneven request costs much better, at the cost of needing the LB to track connection state.",
            "Weighted round robin / weighted least connections: lets you assign servers different capacities (a bigger box gets more traffic) — essential in heterogeneous fleets (mixed instance types during a gradual upgrade).",
            "IP hash (or consistent hashing on some request attribute): routes the same client to the same server consistently — gives you 'sticky sessions' for free (useful if a service keeps in-memory state per user), but can create hotspots if one IP (e.g., behind a corporate NAT) generates disproportionate traffic, and it complicates scaling the backend fleet up/down because the hash space shifts.",
            "The 'obvious choice goes wrong' scenario: round robin on a fleet where one endpoint (say, `/export`) is 100x more expensive than `/health` — round robin happily sends export requests evenly, but if they cluster on certain servers by chance, those servers get disproportionately loaded while round robin metrics show 'perfectly even' distribution by *request count*, hiding the real imbalance in *resource cost*.",
          ],
        },
        keyPoints: [
          {
            point: "Round robin assumes equal-cost requests and equal-capacity servers — both assumptions break in real systems",
            example: "A fleet mixing `/health` pings and expensive `/export` requests under round robin shows 'perfectly even' request counts while some servers are actually far more loaded.",
            bestApproach: "Default away from plain round robin for any API with heterogeneous endpoint costs — measure request-cost variance before assuming round robin is good enough.",
          },
          {
            point: "Least connections adapts to real-time load — the safer general-purpose default for heterogeneous workloads",
            example: "HAProxy and Envoy both recommend least-connections or weighted-least-request as the default for HTTP backends precisely because request costs vary in practice.",
            bestApproach: "Set least-connections (or weighted-least-request) as your load balancer's default algorithm unless you have a specific reason (session affinity) to deviate.",
          },
          {
            point: "IP/consistent hashing buys session affinity for free — at the cost of potential hotspots and harder elastic scaling",
            example: "Routing by client IP sends every request from a large corporate NAT to the same backend, overloading that one server while others sit idle.",
            bestApproach: "Use IP hashing only when you genuinely need sticky sessions and have moved session state to a shared store as the longer-term fix instead.",
          },
          {
            point: "Always separate 'requests distributed evenly' from 'load distributed evenly' — they're not the same thing when request costs vary",
            example: "A load balancer dashboard showing even request counts per server can mask one server being pinned at 90% CPU from a cluster of expensive requests it happened to receive.",
            bestApproach: "Monitor per-server resource utilization (CPU, latency) alongside request-count distribution — request-count parity alone is an incomplete health signal.",
          },
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
          detailed: [
            "Retries with backoff handle *transient* blips well — a single dropped packet, a momentary GC pause.",
            "But when a dependency is *genuinely* struggling (overloaded, degraded, down), every retry is one more request piling onto an already-drowning service — across thousands of your own callers, that's a self-inflicted DDoS on your dependency (and, via thread/connection pool exhaustion, on yourself too — this is how cascading failures happen).",
            "A circuit breaker adds a state machine on top: Closed (normal — requests flow through, failures are counted); when failures cross a threshold (e.g., 50% of the last 20 requests failed), it trips to Open (every request fails *immediately*, without even attempting the call — this is the 'fail fast' that protects both you and the dependency); after a cooldown period it moves to Half-Open (lets a small trickle of requests through as a probe — if they succeed, close the circuit and resume normal traffic; if they fail, reopen and wait longer).",
            "This gives the struggling dependency breathing room to recover instead of being kept underwater by a constant stream of retries, and it protects *your* service from exhausting its own resources waiting on a dependency that isn't going to answer.",
            "The combination that actually works in production is: timeouts (don't wait forever) + retries with backoff and jitter (handle transient blips) + circuit breaker (stop hammering a truly broken dependency) + fallback (serve a cached/default response when the circuit is open).",
          ],
        },
        keyPoints: [
          {
            point: "Retries alone can amplify load on a struggling dependency — turning a partial outage into a total one (self-inflicted thundering herd)",
            example: "Netflix postmortems describe a slow internal service whose retried callers filled their own thread pools waiting on it, eventually taking down the whole site.",
            bestApproach: "Cap total retry attempts per request and always pair retries with a circuit breaker — never let retries run unbounded against a struggling dependency.",
          },
          {
            point: "Circuit breaker states: Closed (normal, counting failures) → Open (fail fast, no calls attempted) → Half-Open (probe with a trickle, decide to close or reopen)",
            example: "After 50% of the last 20 fraud-check calls fail, the breaker trips Open — subsequent calls fail instantly for 30 seconds before a single probe request tests recovery.",
            bestApproach: "Tune the failure-rate threshold and cooldown duration from real traffic patterns (not defaults) — too sensitive trips on normal blips, too lax doesn't protect anything.",
          },
          {
            point: "'Fail fast' protects both the struggling dependency (gives it room to recover) and your own service (stops thread/connection pool exhaustion)",
            example: "An Open circuit breaker returns an error in microseconds instead of waiting out a 30-second timeout, freeing the calling service's threads immediately.",
            bestApproach: "Measure your circuit breaker's 'fail fast' latency in production dashboards — it should be near-zero, confirming no thread is wasted waiting on a known-broken dependency.",
          },
          {
            point: "The full resilience stack is layered: timeouts + backoff-with-jitter retries + circuit breaker + fallback — each solves a different failure mode",
            example: "A payment call with no timeout, no breaker, and no fallback turned one slow third-party API into a full checkout outage — each missing layer compounded the failure.",
            bestApproach: "Treat all four layers as a checklist for every external dependency call, not an either/or choice — each catches a different failure mode the others miss.",
          },
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
          detailed: [
            "With naive modulo hashing, the server responsible for a key is `hash(key) % N`. The moment N changes — you add a server to handle more load, or one crashes — almost *every* key now maps to a different server than before, because the modulo result shifts for nearly all inputs.",
            "For a cache, that's catastrophic: a near-total cache wipe right when you're scaling up (i.e., right when you can least afford a stampede of cache misses hammering your database).",
            "Consistent hashing fixes this by hashing both servers *and* keys onto the same circular space (a 'ring', typically 0 to 2^32-1): a key is owned by the first server clockwise from its position on the ring.",
            "When you add a server, it only takes over the keys in the arc between itself and the next server counter-clockwise — everything else stays put; roughly only `K/N` keys move (K = total keys, N = number of servers), not nearly all of them. When a server is removed, only its keys redistribute to its neighbor.",
            "The remaining wrinkle — uneven load if servers land unluckily close together on the ring — is solved with *virtual nodes*: each physical server is hashed to many points on the ring (e.g., 100-500 virtual nodes each), smoothing out the distribution so no single server gets an unlucky concentration of key ranges.",
          ],
        },
        keyPoints: [
          {
            point: "`hash(key) % N` reshuffles ~all keys when N changes — the worst possible behavior exactly when you're scaling (cache stampede risk)",
            example: "Adding one server to a 4-node modulo-hashed cache (4→5) remaps roughly 80% of keys, causing a flood of cache misses right when you're trying to add capacity.",
            bestApproach: "Never use plain `hash(key) % N` for anything that resizes (caches, sharded stores) — use consistent hashing from the very first implementation, not as a later fix.",
          },
          {
            point: "Consistent hashing places servers and keys on a ring; a key belongs to the next server clockwise — adding/removing a server only moves ~K/N keys",
            example: "Adding a 5th node to a consistent-hash ring of 4 only remaps the keys in the arc the new node claims — roughly 20% of keys move, not 80%.",
            bestApproach: "Implement consistent hashing using an established library (e.g., Ketama-style) rather than rolling your own ring math — the edge cases (wraparound, tie-breaking) are easy to get subtly wrong.",
          },
          {
            point: "Virtual nodes (each physical server hashed to many ring positions) smooth out uneven load that plain consistent hashing can still produce",
            example: "Without virtual nodes, an unlucky ring placement can give one physical server a disproportionately large arc; 100-500 virtual nodes per server smooths this out statistically.",
            bestApproach: "Use 100+ virtual nodes per physical server as a starting point, and monitor per-node load to confirm the distribution is actually even in practice.",
          },
          {
            point: "This is the mechanism behind Dynamo-style databases, CDNs, and distributed caches — knowing it cold signals real distributed-systems depth",
            example: "Cassandra, DynamoDB, and Riak all use consistent hashing with virtual nodes, directly descended from Amazon's 2007 Dynamo paper.",
            bestApproach: "When asked to design any horizontally-partitioned store or cache, name consistent hashing with virtual nodes by default rather than waiting to be prompted.",
          },
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
          detailed: [
            "Timeouts — every network call needs one; 'no timeout' means a single hung dependency can occupy a thread/connection forever, and enough hung threads exhausts your pool, taking down requests that have nothing to do with the slow dependency.",
            "Retries with exponential backoff *and jitter* — backoff prevents synchronized retry storms, jitter prevents many clients from retrying in lockstep and re-creating the storm anyway.",
            "Circuit breakers — stop calling a dependency that's clearly failing, both to protect it and yourself.",
            "Bulkheads — partition your resources (separate thread pools / connection pools per dependency) so that one slow dependency can't starve calls to a healthy one; named after ship compartments that contain flooding to one section.",
            "Fallbacks / graceful degradation — when a dependency is unavailable, can you serve a cached value, a default, or a reduced experience instead of a hard error?",
            "Idempotency — if you retry a write operation, does doing it twice cause harm (double-charging a card)? If yes, you need idempotency keys before retries are safe at all.",
            "The single most important question to ask: 'what happens when this dependency is *slow* — not down, just slow?' Most outages are caused by slow dependencies (which look healthy to simple up/down health checks) silently exhausting resources, not by clean, fast failures.",
          ],
        },
        keyPoints: [
          {
            point: "The stack, in order: timeouts → retries (backoff + jitter) → circuit breakers → bulkheads → fallbacks → idempotency",
            example: "A design doc missing timeouts on its fraud-check call is the single highest-priority gap to flag — every other layer is moot if a call can hang forever.",
            bestApproach: "Review design docs against this exact ordered checklist, flagging the first missing layer rather than listing all gaps unprioritized — timeouts first, always.",
          },
          {
            point: "Bulkheads (separate resource pools per dependency) stop one slow dependency from starving calls to healthy ones",
            example: "Separate thread pools for the fraud-check API and the shipping API mean a slow fraud-check call can't exhaust the threads needed to serve shipping calls.",
            bestApproach: "Give each external dependency its own thread/connection pool sized to its expected concurrency, rather than sharing one pool across all outbound calls.",
          },
          {
            point: "'Slow' is the dangerous failure mode, not 'down' — slow dependencies pass health checks while quietly exhausting your thread/connection pools",
            example: "AWS postmortems repeatedly cite 'a dependency became slow, not unavailable' as the root cause of cascading incidents that simple up/down health checks missed entirely.",
            bestApproach: "Chaos-test for injected latency (not just hard failures) on every critical dependency before shipping — a service that handles 'down' gracefully can still fall over on 'slow.'",
          },
          {
            point: "Idempotency keys are a prerequisite for safe retries on any write — otherwise a retry can cause real-world double effects (double charge, double email)",
            example: "A payment API without idempotency keys can double-charge a card when a client retries after a timeout that actually succeeded server-side.",
            bestApproach: "Require every write endpoint accepting client-driven retries to accept and enforce an idempotency key before retries are enabled at the client level.",
          },
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
          detailed: [
            "High-Level Design rounds hand you something broad ('design Twitter', 'design a ride-sharing app') and grade your ability to: ask clarifying questions to scope the problem, identify the core entities and APIs, choose the right storage and communication patterns, estimate scale, and reason about trade-offs (consistency vs availability, SQL vs NoSQL, sync vs async) — the output is usually a box-and-arrow diagram and a narrated set of decisions.",
            "Low-Level Design rounds hand you something narrower and deeper ('design a parking lot', 'design an elevator system', 'design a rate limiter as a library', 'design Splitwise') and grade: can you identify the right classes/interfaces and their responsibilities (single responsibility, not god-objects), do you reach for the right design patterns *because they fit* (not because you memorized GoF), can you model state transitions and concurrency correctly, and can you write code that's actually extensible (adding a new vehicle type or a new payment method shouldn't require rewriting half the system).",
            "The biggest mistake candidates make is treating LLD like a coding interview (just write a working class) — the bar is *design quality*: extensibility, separation of concerns, and the ability to explain *why* you modeled it this way and what would change if a new requirement showed up.",
          ],
        },
        keyPoints: [
          {
            point: "HLD = system decomposition, data flow, scale, trade-offs (boxes and arrows); LLD = object/class design, interfaces, patterns, state, concurrency (code-level)",
            example: "An HLD round for 'design Twitter' ends with services and data stores on a whiteboard; an LLD round for 'design a parking lot' ends with class diagrams and method signatures.",
            bestApproach: "Calibrate your output format to the round type from the first minute — diagram boxes-and-arrows for HLD, sketch classes/interfaces for LLD — don't mix the two.",
          },
          {
            point: "LLD is graded on extensibility and separation of concerns — not 'does it compile', but 'can I add a feature without rewriting half of it'",
            example: "A `Vehicle` interface with pluggable fee strategies lets a new vehicle type be added with one new class; a hardcoded if/else chain requires editing existing code everywhere.",
            bestApproach: "Pressure-test your own LLD design mid-interview by asking 'what changes if a new requirement X shows up?' — if the answer touches many existing classes, redesign before moving on.",
          },
          {
            point: "Design patterns should appear because they *fit the forces in the problem* — naming a pattern just to show you know it is a red flag, not a strength",
            example: "Reaching for Strategy because 'pricing varies by lot and might add new types' is earned; reaching for Strategy because it sounds impressive is not.",
            bestApproach: "State the variability/coupling problem in one sentence before naming any pattern — if you can't state the problem, don't reach for the pattern.",
          },
          {
            point: "Always narrate the 'why' — interviewers are grading your reasoning trail at least as much as the artifact you produce",
            example: "Saying 'I'm modeling Spot as owning its own status rather than having ParkingLot track it centrally, because spot state changes are local and frequent' shows reasoning, not just output.",
            bestApproach: "Practice narrating design decisions out loud as you make them, not just presenting the finished diagram — the trail is what's actually being graded.",
          },
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
          detailed: [
            "Core entities: `Vehicle` (abstract, with subclasses `Car`, `Motorcycle`, `Truck` — each knows its size requirement); `ParkingSpot` (has a type/size, an occupied flag, and a reference to the vehicle currently parked); `Level` (owns a collection of spots, knows how many free spots of each type remain — ideally maintained as counters, not by scanning); `ParkingLot` (owns levels, exposes `parkVehicle()` / `unparkVehicle()`, is the entry point gates talk to); `Ticket` (records entry time, assigned spot, vehicle — the receipt that ties a parking session together); `Gate`/`EntryPanel`/`ExitPanel` (the physical interaction points).",
            "Two design decisions are where this round is actually won: (1) Spot assignment — don't hardcode 'find the first free spot'; define a `SpotAssignmentStrategy` interface (nearest-to-entrance, by-vehicle-size-fit, load-balance-across-levels) so the lot owner can change policy without touching `ParkingLot`'s code — Strategy pattern, applied because the *forces* (different lots want different assignment policies) call for it.",
            "(2) Pricing — same idea: a `PricingStrategy` interface lets you support flat-rate, hourly, dynamic/surge pricing as interchangeable plug-ins.",
            "(3) Concurrency — `parkVehicle` must atomically check-and-reserve a spot; without locking (or an atomic compare-and-swap on the spot's state), two cars arriving simultaneously can both be assigned the same spot — exactly the kind of race condition an LLD interviewer is listening for you to mention unprompted.",
          ],
        },
        entities: [
          { name: "Vehicle", description: "Abstract base class; subclasses (Car, Motorcycle, Truck) each know their size requirement.", fields: ["id, license_plate", "type — car | motorcycle | truck", "size_requirement"] },
          { name: "ParkingSpot", description: "One physical spot, with atomic check-and-reserve to prevent double-assignment races.", fields: ["id, level_id", "type/size", "occupied — bool, current vehicle ref"] },
          { name: "Level", description: "Owns spots and maintains free-spot counts as counters, not by scanning.", fields: ["id, lot_id", "spots[]", "free_spot_counts — by type"] },
          { name: "ParkingLot", description: "Entry point gates talk to; exposes parkVehicle()/unparkVehicle().", fields: ["id, levels[]", "spotAssignmentStrategy", "pricingStrategy"] },
          { name: "SpotAssignmentStrategy", description: "Pluggable policy interface — nearest-to-entrance, by-size-fit, load-balanced.", fields: ["assign(vehicle, lot) → ParkingSpot"] },
          { name: "Ticket", description: "The receipt tying a parking session together; ties to fee calculation.", fields: ["id, vehicle_id, spot_id", "entry_time", "pricingStrategy ref"] },
        ],
        keyPoints: [
          {
            point: "Model domain nouns as classes with single, clear responsibilities — `Vehicle`, `Spot`, `Level`, `ParkingLot`, `Ticket`, each owning exactly one concern",
            example: "Giving `Ticket` sole ownership of `entry_time` (not duplicating it on `Vehicle` or `Spot`) makes fee calculation unambiguous — there's exactly one place to look.",
            bestApproach: "For each class you sketch, state its single responsibility in one sentence — if you can't, it's likely doing too much and should be split.",
          },
          {
            point: "Use Strategy for anything that varies by policy (spot assignment, pricing) — makes the system extensible without modifying core classes (Open/Closed Principle in action)",
            example: "Defining a `SpotAssignmentStrategy` interface lets a mall add a 'EV-charging-priority' policy without touching `ParkingLot`'s existing code at all.",
            bestApproach: "Identify the 1-2 genuinely variable policies in the problem (pricing, assignment) and isolate exactly those behind interfaces — don't Strategy-ify everything.",
          },
          {
            point: "Maintain free-spot counts incrementally (counters updated on park/unpark) rather than scanning — an easy win interviewers notice",
            example: "A `Level` object decrementing a `freeSpotCount` integer on every park is O(1); scanning all spots to count free ones on every display refresh is O(n) and visibly slower at scale.",
            bestApproach: "Default to incremental counters for any 'how many X are available' display value mentioned in the prompt — call it out explicitly as a deliberate choice.",
          },
          {
            point: "Call out the concurrency race in spot assignment unprompted — 'two cars arrive simultaneously, both must not get the same spot' is exactly the kind of detail that separates strong answers",
            example: "An atomic compare-and-swap on a spot's status (`UPDATE spots SET status='OCCUPIED' WHERE id=X AND status='FREE'`) prevents two simultaneous arrivals from both claiming the last spot.",
            bestApproach: "Mention the race condition and your fix for it before the interviewer asks — proactively naming concurrency issues is a stronger signal than answering when prompted.",
          },
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
          detailed: [
            "Algorithm choice — four candidates worth naming and ranking: Fixed window counter (simplest — count requests in discrete windows like '12:00:00-12:01:00'; the flaw is burst-at-the-boundary: a user can send N requests at 12:00:59 and another N at 12:01:00, doubling the intended limit in two seconds).",
            "Sliding window log (store a timestamp per request, count how many fall in the trailing window — perfectly accurate, but memory cost grows with request volume). Sliding window counter (a clever hybrid — weight the previous window's count by how much it overlaps the current sliding window; nearly as accurate as the log approach with fixed, small memory — this is what most production systems actually use).",
            "Token bucket (tokens refill at a fixed rate into a bucket of fixed capacity; a request consumes a token or is rejected — naturally allows controlled bursts up to the bucket size, which fixed/sliding windows don't model well). For a *library* meant to be dropped into many services, I'd default to token bucket (intuitive mental model, naturally supports bursts, simple to implement) or sliding window counter (smoother, no burst allowance) depending on whether bursts should be allowed.",
            "The harder problem — and the one that actually distinguishes a strong answer — is distribution: if your service runs on 10 instances, each holding its own in-memory counter, a user can get 10x the intended limit by hitting different instances.",
            "The fix is centralizing the counter state in a shared, fast store (Redis) and using atomic operations (`INCR` + `EXPIRE`, or a Lua script for token-bucket logic) so that check-and-increment happens as one atomic unit — without that atomicity, you reintroduce the exact race condition the rate limiter exists to prevent.",
          ],
        },
        entities: [
          { name: "RateLimiter", description: "The public library interface every algorithm strategy implements.", fields: ["allow(key) → boolean", "config — RateLimiterConfig"] },
          { name: "TokenBucketStrategy", description: "Allows controlled bursts up to a fixed capacity while enforcing a refill rate.", fields: ["capacity, refill_rate", "implements RateLimiter"] },
          { name: "SlidingWindowCounterStrategy", description: "Weights the previous window by overlap — near-log accuracy at fixed-window memory cost.", fields: ["window_size", "implements RateLimiter"] },
          { name: "RateLimiterConfig", description: "Per-route/tier configuration the library is initialized with.", fields: ["route, limit, window", "burst_capacity — nullable"] },
          { name: "DistributedStateStore", description: "Redis-backed shared state so counters are consistent across instances.", fields: ["incrementAndCheck(key) — atomic Lua script", "ttl"] },
        ],
        keyPoints: [
          {
            point: "Name and rank the algorithms: fixed window (simple, boundary-burst flaw) → sliding log (accurate, memory-heavy) → sliding window counter (the production sweet spot) → token bucket (naturally models controlled bursts)",
            example: "A fixed-window limiter lets a user send 2x the intended limit by timing requests at 11:59:59 and 12:00:00 — two separate windows, double the allowed volume in one second.",
            bestApproach: "Default to sliding-window-counter or token-bucket for any production rate limiter — only use fixed-window for genuinely low-stakes, rough throttling.",
          },
          {
            point: "The real design challenge isn't the algorithm — it's making counters *consistent across instances* without that becoming the new bottleneck",
            example: "Ten API server instances each holding an in-memory counter let a client get 10x the intended limit simply by hitting different instances round-robin.",
            bestApproach: "Centralize limiter state in Redis from the start — don't prototype with in-memory counters and plan to 'fix it later,' since the distributed-state problem is the actual design.",
          },
          {
            point: "Redis + atomic operations (INCR/EXPIRE or a Lua script) solves the distributed state problem — and the atomicity itself is the crux (a non-atomic check-then-increment reintroduces the race)",
            example: "A separate GET-then-SET in application code lets two concurrent requests both read 'under limit' and both proceed, exceeding the limit — a single Lua EVAL prevents this.",
            bestApproach: "Implement the check-and-decrement as one atomic Redis Lua script, never as two separate round trips, regardless of how rare the race seems.",
          },
          {
            point: "As a *library*, expose the algorithm as a pluggable strategy — different endpoints often need different limits and different burst tolerances",
            example: "A login endpoint might need a strict, no-burst limit (prevent credential stuffing) while a search endpoint can tolerate bursts via token bucket.",
            bestApproach: "Design the library's public API around a `RateLimitStrategy` interface configured per-route, rather than hardcoding one global algorithm for every endpoint.",
          },
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
          detailed: [
            "Core classes: `Elevator` (current floor, direction, door state, a queue of destination requests, and — critically — modeled as an explicit state machine: Idle → MovingUp/MovingDown → DoorsOpening → DoorsOpen → DoorsClosing → back to Idle or moving; this prevents the classic bug of 'doors open while moving'); `ElevatorController`/`ElevatorSystem` (owns all elevators, receives floor calls, and delegates to a scheduler); `Request` (floor + direction — an external hall call vs an internal car-button press, which behave slightly differently); `SchedulingStrategy` (the pluggable brain — given the current state of all elevators and a new request, decide which elevator should serve it).",
            "The scheduling decision is where the design is won or lost: a naive 'nearest elevator' strategy ignores direction (an elevator one floor away but moving *away* from the caller is a worse choice than one three floors away moving *toward* them).",
            "The real algorithm (similar to SCAN/elevator-disk-scheduling algorithms from OS theory) scores each elevator by: is it idle (best case — can be redirected freely), is it already moving toward the request in the same direction (good — minimal detour), or is it moving away (worst — would need to finish its current run first).",
            "Defining `SchedulingStrategy` as an interface means you can swap in 'minimize wait time' vs 'minimize energy use' vs 'priority floors for VIP access cards' without touching `Elevator` or `ElevatorController` — that pluggability, plus the explicit state machine preventing invalid states, is exactly what an interviewer is listening for.",
          ],
        },
        entities: [
          { name: "Elevator", description: "Modeled as an explicit state machine — prevents invalid states like moving with doors open.", fields: ["id, current_floor", "state — Idle | MovingUp | MovingDown | DoorsOpen | ...", "destination_queue[]"] },
          { name: "ElevatorController", description: "Owns all elevators, receives calls, delegates to the scheduler.", fields: ["elevators[]", "schedulingStrategy"] },
          { name: "HallCall", description: "An external request — floor plus direction, from outside the elevator.", fields: ["floor, direction"] },
          { name: "CarCall", description: "An internal request — just a floor, from inside the elevator.", fields: ["floor"] },
          { name: "SchedulingStrategy", description: "Pluggable brain deciding which elevator answers a call — scores by direction-and-proximity.", fields: ["selectElevator(call, elevators[]) → Elevator"] },
        ],
        keyPoints: [
          {
            point: "Model the elevator itself as an explicit state machine (Idle/MovingUp/MovingDown/DoorsOpen/...) — this single decision prevents a whole class of 'impossible state' bugs",
            example: "Without an explicit state machine, a bug could let an elevator receive a new destination while DoorsOpen, causing it to move with doors ajar — the state machine makes that transition illegal by construction.",
            bestApproach: "Enumerate every valid state and every valid transition between them before writing any scheduling logic — treat invalid transitions as compile-time or runtime errors, not silently ignored cases.",
          },
          {
            point: "Separate 'elevator state' from 'which elevator answers this call' — the latter is a pluggable `SchedulingStrategy`, not a pile of if-statements inside `Elevator`",
            example: "A `MinimizeWaitTimeStrategy` and an `EnergyEfficientStrategy` can both implement the same `SchedulingStrategy` interface, swappable without touching `Elevator`'s state machine code.",
            bestApproach: "Keep `Elevator` ignorant of scheduling policy entirely — it should only expose its current state and accept destination requests, never decide whether it 'should' take a given call.",
          },
          {
            point: "A good scheduling heuristic scores by direction-and-proximity (idle > moving toward in same direction > moving away) — borrowed from OS disk-scheduling (SCAN/LOOK algorithms)",
            example: "An elevator one floor away but moving down is a worse pick for an upward call than one three floors away already moving up — naive nearest-elevator logic gets this backwards.",
            bestApproach: "Score every elevator on (idle/same-direction/opposite-direction) before distance, and only use distance as a tiebreaker within the same direction-category.",
          },
          {
            point: "Distinguish hall calls (floor + direction, from outside) from car calls (just a floor, from inside) — they carry different information and are handled slightly differently",
            example: "A hall call of 'floor 5, going up' lets the scheduler match an elevator already heading up past floor 5; a car call from inside just says 'go to floor 8' with no direction ambiguity.",
            bestApproach: "Model `HallCall` and `CarCall` as distinct request types in your class diagram rather than collapsing them into one generic `Request` — the direction field on hall calls is load-bearing for scheduling.",
          },
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
          detailed: [
            "Patterns exist to resolve specific recurring forces — naming the force *first* and then the pattern is what reads as senior; naming the pattern first and retrofitting a justification reads as memorization.",
            "Quick force-to-pattern map worth having ready: 'this behavior needs to vary independently and be swapped at runtime' → Strategy (pricing, spot assignment, scheduling — all from the examples above); 'object construction is complex or needs to vary by type/config' → Factory / Builder (creating different `Vehicle` or `Notification` subtypes from a config flag, or building a complex object step-by-step).",
            "'many parts need to react to one thing changing, without tight coupling' → Observer (an elevator's arrival notifying floor displays, an order-status change notifying multiple subscribers — though in distributed systems this often becomes an event bus instead); 'exactly one instance must coordinate shared state' → Singleton (genuinely rare in well-designed systems — usually a sign that state should be passed explicitly instead; interviewers often consider reflexive Singleton use a yellow flag because it introduces global mutable state and makes testing harder).",
            "'you need to add behavior to objects without subclassing every combination' → Decorator (pricing add-ons, middleware chains).",
            "The discipline: state the problem ('different vehicle types need different fee calculations and new types will be added later') *before* naming the pattern ('...so I'd use Strategy here') — that ordering is the entire signal an interviewer is listening for.",
          ],
        },
        keyPoints: [
          {
            point: "Name the force/problem first, the pattern second — 'I need X to vary independently, so I'd use Strategy' beats 'I'll use Strategy here'",
            example: "'Different vehicle types need different fee calculations, and new types will be added' is the force; 'so I'd use Strategy' is the conclusion that should follow it, not precede it.",
            bestApproach: "Rehearse stating the problem-then-pattern sentence structure out loud before interviews — it's a verbal habit, not just a design principle, and it has to be automatic under pressure.",
          },
          {
            point: "Strategy: swap behavior at runtime. Factory/Builder: complex/varying construction. Observer: loose-coupled reactions to change. Decorator: compose behavior without subclass explosion",
            example: "A `NotificationFactory` that builds Email/SMS/Push objects from a config flag is Factory; a `Logger` that many unrelated components react to (without being tightly coupled to it) edges toward Observer.",
            bestApproach: "Keep a one-line mental map of force→pattern (like this list) ready to recall, but always verify the specific problem actually matches before applying it.",
          },
          {
            point: "Singleton is the pattern most often misused — reflexive use is a yellow flag (global mutable state, hard to test); ask 'could this just be passed explicitly instead?'",
            example: "A `ConfigManager` Singleton accessed globally throughout a codebase makes unit tests fragile — swapping it for dependency-injected config makes each test isolated and explicit.",
            bestApproach: "Default to passing shared objects explicitly via constructor injection; reach for Singleton only when you can articulate why explicit passing genuinely doesn't work here.",
          },
          {
            point: "If you can't articulate what breaks *without* the pattern, you probably don't need it — that's the test for whether it genuinely fits",
            example: "Asked 'why Strategy for spot assignment?', a strong answer is 'without it, adding a new assignment policy means editing ParkingLot's core method' — a concrete, specific breakage.",
            bestApproach: "Before committing to any pattern in an interview, silently ask yourself 'what exactly breaks if I don't use this?' — if the answer is vague, reconsider.",
          },
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
          detailed: [
            "Core entities: `User`, `Group` (a set of users), `Expense` (amount, payer, a list of `Split`s — each split says 'this user owes this amount', supporting equal/exact/percentage split strategies — Strategy pattern again, because split styles vary and new ones get added), and `Settlement` (a record of an actual payment between two users that reduces a balance).",
            "The key modeling decision: don't store 'Alice owes Bob $20' as mutable rows you update in place — store immutable `Expense` records (the source of truth, an audit trail that never changes) and *derive* current balances by summing splits across all expenses minus settlements.",
            "This makes the system auditable (you can always answer 'why do I owe this much?' by replaying the expense history) and avoids a whole class of bugs where balance-update code drifts out of sync with the expenses that justified it.",
            "The interesting algorithmic piece: naively, if Alice owes Bob $20 and Bob owes Charlie $20, the app could show two separate debts — but the *simplified* view should realize Alice can just pay Charlie directly, netting Bob out entirely.",
            "This is the 'simplify debts' problem: build a graph where edges are net pairwise balances, then greedily match the largest creditor with the largest debtor repeatedly until all balances are zero — minimizing the total number of transactions needed to settle the whole group.",
            "Surfacing that you know this is a real, named sub-problem (not just 'sum up the numbers') is what separates a strong Splitwise answer from a mediocre one.",
          ],
        },
        entities: [
          { name: "User", description: "A member of one or more groups.", fields: ["id, name", "default_currency"] },
          { name: "Group", description: "A set of users sharing expenses together.", fields: ["id, name", "member_ids[]"] },
          { name: "Expense", description: "Immutable source-of-truth record — balances are always derived from these, never mutated directly.", fields: ["id, group_id, amount", "payer_id", "splits[] — see Split", "created_at"] },
          { name: "Split", description: "One participant's share of an expense, via a pluggable split strategy.", fields: ["user_id, amount_owed", "strategy — equal | exact | percentage | shares"] },
          { name: "Settlement", description: "An actual payment between two users that reduces a derived balance.", fields: ["from_user_id, to_user_id", "amount, settled_at"] },
        ],
        keyPoints: [
          {
            point: "Model `Expense` as an immutable source-of-truth record; *derive* balances from it rather than mutating stored balances directly — gives you an audit trail and prevents drift bugs",
            example: "If a user disputes 'why do I owe $40?', replaying their expense history answers it directly; a mutated running-balance field can't explain itself after the fact.",
            bestApproach: "Never write directly to a 'balance' field — always insert a new immutable Expense/Settlement record and derive balances via a (cached) aggregation over the full history.",
          },
          {
            point: "Use Strategy for split types (equal / exact amounts / percentages / shares) — new split styles are a near-certain future requirement",
            example: "Splitwise added 'split by shares' (e.g., 2 shares vs 1 share) years after launch — a Strategy-based split model absorbs that as a new class, not a rewrite.",
            bestApproach: "Define a `SplitStrategy` interface with a single `computeSplits(amount, participants)` method up front, even if you only implement equal-split initially.",
          },
          {
            point: "The 'simplify debts' sub-problem (minimize the number of settlement transactions via greedy max-creditor/max-debtor matching) is the algorithmic heart of this question — name it explicitly",
            example: "Splitwise's real 'simplify debts' toggle collapses a tangled mesh of pairwise IOUs into the minimum number of actual payments needed to settle the whole group.",
            bestApproach: "Implement simplify-debts as a separate, optional computation over the derived balance graph — never bake it into the core balance-calculation logic, since users may want both views.",
          },
          {
            point: "Group balances should be computed incrementally/cached, not recomputed from the full expense history on every page load, once the group has real history",
            example: "A group with 5,000 expenses recomputing the full balance sum on every page load adds real, avoidable latency compared to maintaining a running cached balance updated per new expense.",
            bestApproach: "Cache per-pair balances and update them incrementally on each new Expense/Settlement event, falling back to full recomputation only for audits or cache invalidation.",
          },
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
          detailed: [
            "The single biggest differentiator between strong and weak HLD performances isn't the final diagram — it's whether the candidate *grounds* the design in explicit requirements before drawing anything.",
            "(1) Functional scope — 'Twitter is huge; should I focus on posting + timeline + follow, or include DMs, search, trends, ads too?' (forces the interviewer to hand you a bounded problem, and shows you understand that 'design Twitter' is not actually a spec).",
            "(2) Scale — 'roughly how many users, how many posts/day, what's the read:write ratio?' (this single question often *is* the design — a 100:1 read:write ratio screams 'cache and pre-compute timelines'; a write-heavy system screams 'partition and queue').",
            "(3) Non-functional priorities — 'should this favor consistency or availability if there's a partition? Is sub-second latency critical, or is eventual-consistency-with-good-UX acceptable?' (this tells you which trade-offs you're allowed to make later without re-litigating them).",
            "Skipping this and jumping straight to boxes-and-arrows is the single most common reason strong engineers underperform in these rounds — not because their design is bad, but because the interviewer can't tell *if* it's good without knowing what it was supposed to optimize for. Two minutes of scoping questions can be worth more to your score than ten minutes of diagramming.",
          ],
        },
        keyPoints: [
          {
            point: "Scope functional requirements out loud first — 'design Twitter' is not a spec; turning it into one is itself a graded skill",
            example: "Asking 'should I focus on posting + timeline + follow, or include DMs and trends too?' turns an impossibly broad prompt into a bounded, achievable 45-minute design.",
            bestApproach: "Open every HLD round with 2-3 scoping questions before drawing anything — treat the interviewer's answers as the actual spec you're designing against.",
          },
          {
            point: "Ask for scale (users, requests/day, read:write ratio) — that single ratio often determines your entire architecture direction",
            example: "A 100:1 read:write ratio immediately justifies aggressive caching and pre-computed timelines; a write-heavy system instead points toward partitioning and queuing.",
            bestApproach: "Make 'what's the read:write ratio?' a reflexive question in literally every HLD round — it's the single highest-leverage number you can extract early.",
          },
          {
            point: "Ask which non-functional property to optimize (consistency vs availability, latency vs throughput) — it licenses every trade-off you'll make later",
            example: "Hearing 'eventual consistency is fine, but sub-second latency is critical' immediately rules out synchronous cross-region quorum writes from the design.",
            bestApproach: "Get an explicit answer on the primary non-functional priority before designing, and refer back to it every time you justify a trade-off later in the round.",
          },
          {
            point: "An ungrounded design can't be graded — scoping isn't stalling, it's the part of the round that makes the rest of it evaluable",
            example: "A candidate who scopes for 8 minutes then designs a focused, defensible system often scores higher than one who diagrams 15 boxes for 'all of Twitter' with no clear priorities.",
            bestApproach: "Budget the first 15-20% of the round explicitly for scoping, and treat skipping it as a real risk to your score, not a time-saving shortcut.",
          },
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
          detailed: [
            "Core flow: `POST /shorten {longUrl}` → returns a short code; `GET /{code}` → 30x redirect to the long URL.",
            "(1) Code generation — base62-encoding an auto-incrementing ID is simple and collision-free but creates a central bottleneck (one counter) and makes URLs guessable/sequential (a privacy/abuse concern); hashing the long URL (MD5/SHA, truncated) avoids the central counter but creates collisions you must detect and handle (append a salt and retry); a pre-generated pool of random codes handed out by a dedicated key-generation service avoids both problems at the cost of an extra moving part. Naming this trade-off explicitly is the single highest-value thing you can do in this question.",
            "(2) Redirect type — 301 (permanent) lets browsers cache the redirect, reducing load on your service dramatically, but makes click analytics impossible (the browser never asks you again after the first visit); 302 (temporary) hits your service every time, enabling analytics, at higher load. This is a real trade-off with a business answer, not a technical one — 'do we need click analytics?' decides it.",
            "(3) Read:write ratio — shortenings are rare, redirects are extremely frequent (often 100:1 or higher) — this should visibly drive your design toward heavy caching (the long URL for a hot short code should almost never require a database hit) and toward optimizing the read path above all else.",
            "(4) Storage — a simple key-value mapping (short code → long URL) fits a key-value store perfectly; you rarely need relational features here, which is itself worth saying (shows you're matching the store to the access pattern, not defaulting to Postgres-for-everything).",
          ],
        },
        keyPoints: [
          {
            point: "Code generation is the crux: base62(counter) [simple, central bottleneck, guessable] vs hash-with-collision-handling vs pre-generated key pool — name the trade-off, don't just pick one silently",
            example: "Sequential base62 IDs make `bit.ly/abc123` followed by `bit.ly/abc124` guessable as adjacent links — a privacy concern a pre-generated random key pool avoids.",
            bestApproach: "State the code-generation trade-off explicitly even if you pick the simple option — 'I'll use base62(counter) for simplicity, accepting that codes are sequential/guessable' shows awareness either way.",
          },
          {
            point: "301 vs 302 redirect is a real business trade-off (caching/load vs analytics capability) — frame it as a question for the product, not a technical default",
            example: "Choosing 301 lets browsers cache the redirect (less server load) but means a repeat visitor's second click never hits your server, so you can't count it.",
            bestApproach: "Ask the interviewer 'do we need click analytics?' before defaulting to one redirect code — let the answer decide, rather than picking 301 or 302 by habit.",
          },
          {
            point: "The read:write ratio (often >100:1) should visibly steer your design toward aggressive caching on the read path — say so explicitly",
            example: "bit.ly's real traffic skews heavily toward a small set of trending links — a cache sized for the 'currently hot' subset absorbs the vast majority of redirect traffic.",
            bestApproach: "Size your cache around the Pareto-distributed access pattern (a small fraction of links get most clicks) rather than trying to cache the entire link space uniformly.",
          },
          {
            point: "Recognize this is a key-value access pattern — defaulting to a relational store here would be a (minor) signal you're not matching storage to access pattern",
            example: "Every lookup is an exact-match `short_code → long_url` — DynamoDB or any key-value store fits this perfectly, with no need for relational joins.",
            bestApproach: "Name the access pattern (exact-match key lookup) explicitly and let it justify the storage choice, rather than defaulting to Postgres out of habit.",
          },
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
          detailed: [
            "Naively, 'find nearby drivers' looks like `SELECT * FROM drivers WHERE distance(location, rider_location) < 5km` — this is a disaster at scale: it requires scanning huge numbers of rows, recomputing distance for each, and it has to run *continuously* as both rider and drivers move every few seconds.",
            "(1) Geospatial indexing — divide the map into cells using geohashing (encode lat/long into a string where nearby locations share string prefixes — 'find nearby' becomes 'find matching prefixes', a much cheaper operation) or quad-trees (recursively divide regions into quadrants, denser areas get finer subdivision). Either lets you answer 'who's in this region' in roughly constant time instead of scanning everything.",
            "(2) A real-time location pipeline — each driver's app streams location updates (every few seconds) into a system that updates their geospatial cell membership; this is itself a high-throughput write problem (millions of location pings per second in a big city) that benefits from a message queue and in-memory store (Redis supports geospatial commands like `GEOADD`/`GEORADIUS` natively, which is why many real systems use it for exactly this).",
            "(3) Matching logic — once you have a candidate set of nearby drivers, you still need to *rank* them: distance alone isn't enough — factor in driver rating, whether they're heading in a compatible direction, ETA (which depends on real road networks, not straight-line distance), and fairness (so the same driver isn't always picked).",
            "(4) The handoff — once matched, you need a reliable state machine for the ride lifecycle (requested → matched → driver-en-route → in-progress → completed) with timeouts and re-matching if a driver doesn't respond.",
            "Naming geospatial indexing unprompted is the single biggest signal in this question — most candidates default to a relational 'nearby query' and miss that it's fundamentally the wrong tool.",
          ],
        },
        keyPoints: [
          {
            point: "The crux is geospatial search at scale — naive distance queries over a relational table don't survive contact with real traffic; name geohashing or quad-trees explicitly",
            example: "A `SELECT * WHERE distance(...) < 5km` query scanning millions of driver rows every few seconds for every rider request would collapse the database almost immediately.",
            bestApproach: "Name geohashing or quad-tree indexing in the first few minutes of this question — most candidates default to a relational nearby-query and lose significant credit for missing it.",
          },
          {
            point: "Treat location updates as a high-throughput streaming problem (queue + in-memory geospatial store like Redis GEO commands), not as simple row updates",
            example: "Millions of driver GPS pings per second in a major city would overwhelm a relational table doing row UPDATEs — Redis GEOADD handles this as an in-memory, high-throughput operation.",
            bestApproach: "Route location pings through a queue into an in-memory geospatial store (Redis GEO commands or a custom geohash index), never directly as synchronous writes to a relational primary.",
          },
          {
            point: "Matching is ranking, not just filtering — distance, driver rating, direction compatibility, ETA (road-network-aware), and fairness all factor in",
            example: "The single nearest driver might be heading the opposite direction with a 15-minute road-network ETA, while a slightly farther driver heading toward the rider has a 4-minute ETA.",
            bestApproach: "Score candidate drivers as a weighted combination of factors (not distance alone) and explicitly call out road-network ETA as distinct from straight-line distance.",
          },
          {
            point: "Model the ride lifecycle as an explicit state machine with timeouts and re-matching — 'driver doesn't respond' is a normal case, not an edge case, at this scale",
            example: "If a matched driver doesn't accept within 10-15 seconds, the system must automatically re-match to the next-best driver rather than leaving the rider waiting indefinitely.",
            bestApproach: "Design the matched→driver-en-route transition with an explicit timeout and automatic re-matching fallback from the start, not as an afterthought bolted on later.",
          },
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
          detailed: [
            "Fan-out-on-write (push model): when a user posts, immediately write that post into the pre-computed feed/inbox of every follower. Reading a feed is then just 'fetch my pre-built list' — extremely fast, O(1)-ish.",
            "The cost shows up on the write side: a celebrity with 50M followers triggers 50M writes for a single post — a 'thundering herd' / hot-write problem that can overwhelm the system, and most of that fan-out work may be wasted (many followers won't check their feed before the post is buried by newer ones anyway).",
            "Fan-out-on-read (pull model): store posts once; when a user opens their feed, query all the people they follow, merge and rank results on the fly. Writes are trivial (O(1) — just store the post), but reads become expensive — a user following 5,000 accounts triggers a 5,000-way fan-in merge on every feed load, and that cost is paid on the much more frequent operation (people check feeds far more often than celebrities post).",
            "The production answer is a hybrid: fan-out-on-write for the vast majority of users (whose follower counts are modest, so the write cost is small and the read stays fast), and fan-out-on-read for celebrity/high-follower accounts (compute their contribution to a follower's feed at read time, merging it with the follower's pre-computed feed from everyone else).",
            "This hybrid is the single most-cited 'aha' answer in feed-design interviews — naming it (and explaining *why* — the asymmetry between celebrity post frequency and follower check frequency) is what separates a strong answer from a merely-correct one.",
          ],
        },
        keyPoints: [
          {
            point: "Fan-out-on-write: fast reads (pre-computed), but write amplification is brutal for high-follower accounts ('thundering herd' on every celebrity post)",
            example: "A celebrity with 50M followers posting once triggers 50M individual feed-list writes — most of which may never even be viewed before being buried by newer posts.",
            bestApproach: "Apply fan-out-on-write only below a follower-count threshold (e.g., 100K) where the write cost stays manageable and the read-speed benefit is worth it.",
          },
          {
            point: "Fan-out-on-read: trivial writes, but expensive reads — and reads happen far more often than celebrity posts, so you're optimizing the wrong side",
            example: "A user following 5,000 accounts triggers a 5,000-way fan-in merge on every single feed load if pure pull is used — paid on the much more frequent operation.",
            bestApproach: "Reserve pure fan-out-on-read for the rare high-follower-count accounts where push would be prohibitively expensive, not as the default for all users.",
          },
          {
            point: "The hybrid (push for normal users, pull-and-merge for celebrities) is the canonical 'I've thought about this deeply' answer — name it and explain the asymmetry that motivates it",
            example: "Twitter's real fanout service pre-computes timelines for most users via Redis-backed structures, while high-follower accounts are merged in at read time instead.",
            bestApproach: "Explicitly state the asymmetry that motivates the hybrid — celebrities post rarely but have huge fan-out cost; followers check feeds constantly but each celebrity-merge is cheap per-read.",
          },
          {
            point: "Ranking (not just chronological ordering) is a second major sub-problem — ML-based relevance scoring is its own system that this design must leave room to plug into",
            example: "A feed showing engagement-ranked posts (not pure recency) needs a separate ranking service that scores candidate posts before final ordering — distinct from the fan-out mechanism itself.",
            bestApproach: "Design the feed-assembly pipeline with an explicit ranking stage as a pluggable step, even if you default to chronological ordering for the core design.",
          },
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
          detailed: [
            "Two-phase commit (2PC) doesn't survive in microservices — it requires a coordinator to hold locks across all participants until everyone agrees to commit, which means any one slow/down service blocks all the others, defeating the entire point of splitting into independent services.",
            "The Saga pattern instead breaks the flow into a chain of local transactions, each of which is atomic *within its own service*, with the overall consistency achieved through choreography or orchestration: Choreography — each service publishes an event when it completes its step, and the next service subscribes and reacts (Order service creates a pending order → publishes `OrderCreated` → Inventory service reserves stock → publishes `InventoryReserved` → Payment service charges the card → publishes `PaymentCompleted` → Order service marks the order confirmed). It's decentralized and avoids a single point of control, but the overall flow's logic is scattered across services, making it hard to see 'what's the whole process' in one place.",
            "Orchestration — a central saga orchestrator explicitly calls each service in sequence and tracks the state of the whole flow — easier to understand, monitor, and debug (one place to look), at the cost of that orchestrator becoming a coordination hot-spot.",
            "Either way, the *crucial* design element is compensating transactions: if payment fails after inventory was reserved, you must explicitly run `ReleaseInventory` (and `CancelOrder`) — there's no automatic rollback like in a database transaction; you design the 'undo' for every step up front, as a first-class part of the design, not an afterthought.",
            "This is the single biggest mental shift from monolith thinking: consistency becomes something you *design and code for explicitly*, not something the database guarantees for free.",
          ],
        },
        keyPoints: [
          {
            point: "2PC doesn't survive microservices — its locking model defeats the independence that's the entire point of the split",
            example: "A 2PC coordinator holding locks across orders, inventory, and payment services means any one slow service blocks all three from committing — the exact coupling microservices were meant to remove.",
            bestApproach: "Rule out 2PC for any cross-service transaction by default in microservices architectures, and reach for Saga as the standard alternative from the start.",
          },
          {
            point: "Saga = a chain of local transactions + compensating transactions — choreography (event-driven, decentralized) vs orchestration (central coordinator, easier to observe)",
            example: "An orchestrated saga has one `OrderSagaCoordinator` explicitly calling inventory, then payment, then shipping in sequence — easy to see the whole flow in one place.",
            bestApproach: "Default to orchestration for sagas with more than 2-3 steps (easier to debug and monitor); choreography can work for simpler, 2-step flows where decentralization's benefits outweigh visibility loss.",
          },
          {
            point: "Compensating transactions must be designed explicitly for every step — there's no automatic rollback; 'how do we undo this?' is a first-class design question, not an afterthought",
            example: "If payment fails after inventory was reserved, an explicit `ReleaseInventory` compensating action must run — there's no database-level rollback spanning both services.",
            bestApproach: "Design the compensating action for every saga step at the same time as the forward action, and give compensations their own retry/idempotency handling as a first-class subsystem.",
          },
          {
            point: "This is the core mental shift from monolith to microservices: consistency moves from 'the database guarantees it' to 'we design and code for it' — eventual, not atomic",
            example: "A monolith's single transaction either fully commits or fully rolls back automatically; a saga can get stuck in a partially-completed state that someone must explicitly detect and resolve.",
            bestApproach: "Build saga state tracking and stuck-saga alerting into the system from day one — assume partial failures will happen in production and design observability for them upfront.",
          },
        ],
        followUps: [
          "What's the 'outbox pattern' and how does it prevent a service from publishing an event for a transaction that later rolls back?",
          "How would you debug a saga that got stuck halfway through, in production, at 2am?",
          "When would you choose choreography over orchestration, or vice versa?",
        ],
        example:
          "This is a famous, real production challenge — multiple e-commerce postmortems describe sagas that got stuck in inconsistent intermediate states (inventory reserved, payment failed, compensating transaction itself failed) during partial outages; the lesson the industry converged on is that compensating transactions need their *own* retry/idempotency/monitoring — they're not a one-line afterthought, they're a subsystem in their own right.",
      },
      {
        id: "hld-design-payment-system",
        title: "Design a payment processing system (Stripe / fintech)",
        difficulty: "Hard",
        category: "hld-interview-qa",
        question:
          "Design a payment processing system that handles card charges, refunds, and payouts reliably at scale. What makes payment system design different from most HLD problems?",
        answer: {
          short:
            "Build a double-entry ledger at the center, make every charge idempotent via client-generated keys, and separate the fast 'accept + validate' path from the slower 'authorize + settle' path so user-facing latency stays low regardless of how long card networks take.",
          detailed: [
            "Payment systems prioritize correctness over availability — it's better to return an error than to charge twice or miss a charge. This single constraint shapes every architectural decision and is what makes payment design different from most HLD questions.",
            "The ledger is double-entry: every 'charge $100' creates two entries (debit customer, credit merchant) in the same atomic transaction — you can never have a debit without a matching credit, which makes the books self-auditing and impossible to silently lose money in.",
            "The request flow has two tiers: (1) fast path — validate the request, write an idempotency record, return an immediate accepted response while async work proceeds; (2) slow path — call the card network (Visa/Mastercard via Stripe), await authorization (typically 1-3 seconds), write the ledger entry, and notify the merchant.",
            "Idempotency keys are the most load-bearing primitive: every charge request carries a client-generated UUID; the server writes it to a DB table (UNIQUE constraint) before any money movement — a duplicate request returns the original response without charging again. This is what makes 'retry on network failure' safe.",
            "Card networks use a two-phase model: an authorization hold (reserve funds) is created synchronously, then capture (actually move money) happens in a separate async step — the hold can be released without charging if the user cancels.",
            "Reconciliation runs continuously: a near-realtime job compares your ledger against the card network's settlement reports — any discrepancy (a charge the network says succeeded but your ledger has as pending) triggers an alert and becomes an incident, not background clean-up.",
          ],
        },
        keyPoints: [
          {
            point: "Double-entry ledger is non-negotiable — every debit has a matching credit in the same atomic transaction, making the books self-auditing",
            example: "Stripe's core data model is a double-entry ledger; a chargeback automatically creates compensating entries so the ledger always balances without manual correction.",
            bestApproach: "Model the ledger as append-only immutable rows (never UPDATE amounts) so every state transition is auditable by replaying the entry history.",
          },
          {
            point: "Idempotency keys are the most important primitive — every write endpoint requires one so retries on network failure never double-charge",
            example: "A mobile client that retries a timed-out charge (where the server actually succeeded) without an idempotency key double-charges the card — this is the most common fintech production incident.",
            bestApproach: "Require a client-generated idempotency key on every mutating API, store it with a UNIQUE constraint before executing any side effects, and return the original response on duplicate requests.",
          },
          {
            point: "Separate the 'accept fast' path from the 'authorize slow' path — user-facing latency must be decoupled from card network round trips",
            example: "Stripe returns a PaymentIntent status of 'processing' instantly while the authorization round-trip to Visa completes asynchronously — the user sees sub-100ms response regardless of network latency.",
            bestApproach: "Persist the accepted request synchronously, then process the card network call async and deliver the final outcome via webhook or polling — never block the user-facing response on a third-party network call.",
          },
          {
            point: "Reconciliation is a first-class system — mismatches between your ledger and network settlement reports are incidents, not background clean-up work",
            example: "A systematic bug that undercharges by $0.01 on every transaction is invisible without reconciliation; at 1M transactions/day that's $10K/day of undetected revenue leakage.",
            bestApproach: "Run reconciliation on every settlement window (not just nightly) and alert in real-time when the float discrepancy across a window exceeds a threshold.",
          },
        ],
        followUps: [
          "How would you handle a partial refund on a multi-item order where each item had a different tax rate?",
          "How do you prevent a race condition where two concurrent refund requests both succeed and refund more than the original charge?",
          "How would you design the system for a card network timeout — do you authorize optimistically or reject?",
        ],
        example:
          "Stripe's real architecture separates 'payment intents' (authorization holds) from 'charges' (captures) and stores both in a double-entry ledger — naming double-entry ledger and idempotency keys together is what interviewers at fintech companies are specifically listening for, because it signals you understand payments aren't just CRUD over a transactions table.",
      },
      {
        id: "hld-design-fraud-detection",
        title: "Design a real-time fraud detection system (fintech)",
        difficulty: "Hard",
        category: "hld-interview-qa",
        question:
          "Design a fraud detection system for a payments platform. It must evaluate every transaction in real time before authorization and block fraudulent ones — what's the architecture and what's the hardest problem to solve?",
        answer: {
          short:
            "Two-tier: a fast rule engine that blocks obvious fraud in milliseconds (velocity limits, blocklists, device fingerprints) before anything hits card networks, plus a slower ML scorer that evaluates subtle patterns — the hardest problem is not the ML, it's serving the behavioral features fast enough to meet the authorization latency window.",
          detailed: [
            "Fraud detection has a hard constraint: it must complete inside the payment authorization window (typically 200-500ms) or the payment times out and lets the transaction through by default. This makes it fundamentally different from batch fraud analytics — every signal lookup must be sub-millisecond.",
            "Tier 1 — rule engine (synchronous, < 5ms): evaluate hard-coded rules against request data in memory — known-bad card numbers (blocklist), impossible velocity (same card used in 3 countries in 10 minutes), device fingerprint on a known-fraud device, IP geolocation vs billing address country mismatch. A rule match is an immediate hard block.",
            "Tier 2 — ML scorer (synchronous, 50-200ms): a trained gradient-boosted model ingests 100+ features about the transaction (amount, merchant category, time-of-day, user historical behavior) and outputs a fraud probability 0-1. Above threshold → decline; in gray zone → step-up authentication (3DS challenge); below threshold → approve.",
            "The feature store is the most critical infrastructure piece: ML models are only as fast as their feature lookups. A real-time feature store (Redis, sub-ms lookups) caches pre-computed behavioral features (rolling velocity, 24-hour spend average, typical merchant categories) so the model gets pre-computed values at inference time, not raw DB queries.",
            "Model feedback loop: every chargeback on a transaction the model scored as low-risk is a labeled false negative — these flow back as training labels and trigger periodic retraining (typically daily or weekly). The gap between when a new fraud pattern emerges and when the model learns it is the system's fundamental limitation.",
            "Shadow mode for safe rollout: new fraud models always run in shadow mode first (score every transaction, log the result, don't act on it) against live traffic to calibrate thresholds — deploying an uncalibrated model that incorrectly blocks 1% more legitimate transactions is a real revenue event.",
          ],
        },
        keyPoints: [
          {
            point: "Latency is the first constraint — fraud scoring must complete inside the authorization window (< 200-500ms); if it times out, the default must be to approve, which means slow = no protection",
            example: "A model that takes 600ms to score means every transaction effectively bypasses fraud detection, because the payment network timeout fires before the score returns.",
            bestApproach: "Set a hard latency budget for each tier (rule engine < 5ms, ML scorer < 150ms, total < 200ms) and design the system to fail-open (approve) on timeout, not fail-closed — fail-closed on timeout means any latency spike blocks all legitimate payments.",
          },
          {
            point: "Two-tier architecture — fast rule engine (hard blocks) + ML scorer (probabilistic risk) — each catches what the other misses",
            example: "Rule engines catch obvious card-testing attacks (same card, 20 transactions in 60 seconds) instantly; ML catches sophisticated attackers who stay under velocity limits but show subtle behavioral anomalies.",
            bestApproach: "Run the rule engine synchronously first and short-circuit (block immediately) on a hard match — only run the ML scorer on transactions that pass rules, reducing the ML workload to the genuinely ambiguous cases.",
          },
          {
            point: "A real-time feature store (Redis-backed) is the load-bearing infrastructure piece — pre-computed behavioral features, not live DB queries, are what keep inference latency in-SLA",
            example: "Computing 'user's average transaction amount over the last 30 days' at inference time requires scanning hundreds of rows per transaction — pre-computing and caching this in Redis makes it a sub-millisecond lookup.",
            bestApproach: "Write a streaming pipeline (Kafka → Flink/Spark Streaming) that maintains rolling behavioral aggregates in Redis, updating them on every transaction event — this is the feature store's write path.",
          },
          {
            point: "Shadow mode and feedback loops are both mandatory — a fraud model without retraining degrades, and one that can't be calibrated safely against live traffic is too risky to deploy",
            example: "Stripe Radar runs new models in shadow mode against 100% of live transactions before enabling them, comparing predicted vs actual fraud rates to calibrate the approval threshold before the model affects real decisions.",
            bestApproach: "Treat model rollout as a controlled experiment (not a code deploy), with explicit metrics for false-positive rate (legitimate blocks) and false-negative rate (missed fraud) tracked at every traffic split level.",
          },
        ],
        followUps: [
          "How do you prevent the feedback loop from becoming self-reinforcing (the model learns to block patterns it's never seen succeed, creating a blindspot)?",
          "How would you handle a coordinated bot attack that deliberately spreads transactions below all velocity rule thresholds?",
          "Who decides the fraud threshold — engineering, risk, or business — and how do you make that trade-off explicit?",
        ],
        example:
          "Stripe Radar's published architecture describes using Gradient Boosted Trees ingesting ~1,000 features per transaction, fed by a pre-computed feature store, with the hard-rule tier filtering obvious cases before the model runs — the model only sees genuinely ambiguous cases, which is also why its precision is far higher than a model that runs on everything.",
      },
      {
        id: "hld-design-ml-serving",
        title: "Design a scalable ML model serving platform",
        difficulty: "Hard",
        category: "hld-interview-qa",
        question:
          "Design a platform that serves ML model predictions at low latency for production traffic. What are the key architectural decisions and what's the biggest production failure mode?",
        answer: {
          short:
            "Completely separate model training (offline, batch, GPU-heavy) from model inference (online, low-latency) — they have opposite requirements and should be different infrastructure. The biggest production failure mode is training-serving skew: the feature pipeline used during training differs from the one used at inference, so the model silently underperforms on live data.",
          detailed: [
            "The core split: training runs on large GPU clusters over hours or days, producing a serialized model artifact; inference serving is stateless HTTP/gRPC services that load the artifact and answer requests in milliseconds. These are different engineering problems requiring different infrastructure.",
            "Model registry: every trained model is versioned in a registry (MLflow, SageMaker) with metadata (training dataset hash, hyperparameters, evaluation metrics, training run lineage). The serving layer fetches artifacts by version — 'which model is currently in production and why' is a dashboard query, not an incident investigation.",
            "Inference serving tiers by latency: (1) real-time online (< 100ms p99) — model loaded in memory behind HTTP/gRPC, with server-side request batching to maximize GPU utilization without user-visible latency; (2) near-realtime (< 1s) — Kafka consumer-based streaming inference; (3) batch scoring — overnight jobs with no latency requirement. Match the tier to the business SLA.",
            "Training-serving skew is the most common and hardest-to-detect production ML bug: the feature computation in the offline training pipeline (Spark, pandas) computes features differently from the online serving pipeline (Redis lookups, real-time aggregations) — even tiny differences (timezone handling, null treatment, rounding) cause the model to perform significantly worse on live data than on held-out test data.",
            "Model rollouts use traffic splitting, not code deployments: the old model stays running alongside the new one at 10% → 25% → 50% → 100% traffic, with A/B experiment tracking comparing business metrics. A model making worse recommendations is a revenue event — you catch it at 10%, not after full rollout.",
            "GPU cost control: GPU instances are expensive; serving infra uses request batching (multiple requests share one GPU forward pass), fractional GPU allocation for small models, and scale-to-zero for low-traffic models. The per-prediction cost of GPU serving is 10-100x higher than CPU serving — this must be a first-class design concern.",
          ],
        },
        keyPoints: [
          {
            point: "Completely separate training infrastructure from serving infrastructure — they have opposite requirements (throughput vs latency, batch vs real-time, GPU-heavy vs cost-efficient)",
            example: "Netflix's Metaflow separates the 'science environment' (model development, training pipelines) from the 'production environment' (serving, feature computation) with explicit handoff contracts between them.",
            bestApproach: "Design the handoff between training and serving as a versioned artifact in a model registry — training produces an artifact, serving consumes it, and neither knows about the other's implementation.",
          },
          {
            point: "Training-serving skew is the most common and hardest-to-detect production ML bug — it must be an explicit architecture concern, not assumed away",
            example: "A feature computed as 'user's 7-day average spend' offline uses a full historical scan; online it reads from a Redis counter updated every transaction — if the counter has a rounding bug, the model sees different input distributions than it was trained on.",
            bestApproach: "Use a unified feature store (Feast, Tecton) where offline (training) and online (inference) feature computation share the same code path — eliminating skew by construction rather than by testing.",
          },
          {
            point: "Model rollouts are A/B experiments, not code deployments — traffic splitting + business metric comparison against the control model is the only safe validation method",
            example: "At Netflix, a recommendation model change that degrades click-through rate by 1% is detectable at 10% traffic split before it affects 90% of subscribers — full rollout without an experiment would lose that signal.",
            bestApproach: "Require every model rollout to have a defined primary metric (CTR, conversion rate, accuracy) and a pre-specified rollback trigger threshold — never roll out 100% without a measured improvement at a lower split.",
          },
          {
            point: "Per-prediction GPU cost is 10-100x higher than CPU — request batching and scale-to-zero are mandatory for production cost control",
            example: "A single GPU inference server processing requests one-at-a-time achieves 20% GPU utilization; the same server with a 10ms batch window can batch 50 requests per forward pass, achieving 80% utilization at the same latency.",
            bestApproach: "Instrument GPU utilization per model endpoint, set auto-scaling based on GPU utilization (not CPU), and enforce a maximum batch latency budget so batching doesn't add user-visible latency beyond the SLA.",
          },
        ],
        followUps: [
          "How would you detect model performance degradation (data drift) in production without waiting for labeled data to come back?",
          "How would you serve a 70B-parameter LLM to thousands of concurrent users with sub-second latency?",
          "How does a feature store handle the 'point-in-time correctness' problem — ensuring training features don't use data that wasn't available at the time of the historical label?",
        ],
        example:
          "Netflix's ML platform is one of the most-cited references for this pattern — they built explicit tooling to prevent training-serving skew from going undetected, because at Netflix's scale even a 1% recommendation quality degradation translates to measurable subscriber churn — the investment in skew prevention directly protects revenue.",
      },
      {
        id: "hld-design-rag-pipeline",
        title: "Design a RAG (Retrieval-Augmented Generation) pipeline",
        difficulty: "Hard",
        category: "hld-interview-qa",
        question:
          "Design a production RAG system that answers user questions using a private document corpus. What's the architecture, and what's the most underestimated design decision?",
        answer: {
          short:
            "RAG adds a retrieval step in front of an LLM: embed the query, fetch the most semantically similar document chunks from a vector store, inject those chunks into the LLM's context, and generate a grounded answer — the hardest problem isn't the LLM integration, it's the chunking strategy and retrieval quality that determine whether the system is useful or just fast.",
          detailed: [
            "RAG in three stages: (1) Indexing (offline) — chunk source documents, embed each chunk using an embedding model, store vectors in a vector DB (Pinecone, pgvector, Weaviate). (2) Retrieval (online) — embed the user's query, run ANN search for top-K most similar chunks. (3) Generation (online) — construct a prompt with retrieved chunks as context, call the LLM, return the grounded answer.",
            "Chunking strategy is the most underrated decision: too small (128 tokens) and chunks lose the surrounding context that makes them interpretable; too large (2048 tokens) and you use the entire context window on a few chunks, squeezing out diversity. Semantic chunking (split at paragraph or section boundaries rather than fixed token counts) consistently outperforms fixed-size chunking for real-world recall.",
            "Hybrid search dramatically outperforms pure vector ANN on real-world benchmarks: combining vector similarity (semantic meaning) with BM25 keyword search (exact term matching) then re-ranking the merged candidate set with a cross-encoder model typically improves recall@10 by 15-30% over pure ANN alone — at the cost of higher latency.",
            "Evaluate retrieval and generation separately: retrieval recall@K (does the right document appear in the top K?) and generation quality (faithfulness, answer relevance — does the LLM only say things the retrieved context supports?) are distinct failure modes requiring distinct fixes. Conflating them makes debugging impossible.",
            "Stale embeddings are the most common silent production RAG bug: a document is updated but its old vector remains in the index — the retrieval system confidently returns the outdated version. An incremental indexing pipeline (CDC or document-change events → re-embed → upsert) is mandatory, not optional.",
            "Context window budget management: retrieved chunks compete with the system prompt, conversation history, and the generated answer for the context window. A context budget manager prioritizes the most-relevant chunks first and truncates the least-relevant, tracking which chunks were included so attribution is possible.",
          ],
        },
        keyPoints: [
          {
            point: "Chunking strategy is the most consequential offline decision — bad chunking means perfect vector search still returns useless context to the LLM",
            example: "Chunking a legal contract at fixed 512-token boundaries splits clauses mid-sentence; semantic chunking at clause boundaries keeps each chunk self-contained and dramatically improves the LLM's answer quality.",
            bestApproach: "Use semantic chunking (paragraph/section boundaries + overlap) as the default, and measure retrieval recall@K before tuning LLM prompts — fixing retrieval is always higher leverage than prompt engineering.",
          },
          {
            point: "Evaluate retrieval and generation separately — retrieval recall@K and generation faithfulness are distinct failure modes requiring distinct metrics and fixes",
            example: "A system with poor retrieval (recall@5 of 60%) can't be fixed with better prompts; a system with perfect retrieval but a hallucinating LLM can't be fixed with better chunking — without separate metrics you can't tell which problem you have.",
            bestApproach: "Build a golden eval set of question-document pairs to measure retrieval recall@K independently, and use faithfulness metrics (RAGAS or human eval) to measure generation quality separately.",
          },
          {
            point: "Hybrid search (vector similarity + BM25 + re-ranking) significantly outperforms pure vector ANN for real-world recall, at the cost of higher latency — this is the production default for any quality-sensitive RAG",
            example: "A user asking 'what does Section 14.3 say?' has exact keyword intent that vector search may miss (it finds semantically similar text, not necessarily the exact section); BM25 catches the exact string match.",
            bestApproach: "Default to hybrid search (vector + BM25, merged with Reciprocal Rank Fusion) and add a cross-encoder re-ranker for the final top-5 — measure the latency overhead against recall improvement before committing.",
          },
          {
            point: "Stale embeddings (document updated, vector not refreshed) are the most common silent production RAG bug — incremental indexing on every document change is mandatory",
            example: "A company updates its benefits policy; RAG over the old embedding confidently answers with the outdated policy for weeks until someone notices the answers are wrong.",
            bestApproach: "Treat every document create/update/delete as an event that triggers re-embedding and vector upsert in the index — the indexing pipeline must be event-driven, not a nightly batch job.",
          },
        ],
        followUps: [
          "How would you handle a user asking about a document added 30 seconds ago that hasn't been indexed yet?",
          "How do you prevent the LLM from hallucinating beyond what the retrieved context says?",
          "How would you build attribution — showing the user exactly which source chunk each claim in the answer came from?",
        ],
        example:
          "Cursor (the AI coding editor) and GitHub Copilot Chat both use RAG over codebases — the specific insight is that code retrieval requires domain-specific chunking (at function/class boundaries, not token count) and code-tuned embedding models; the general RAG architecture is identical, but domain-specific tuning of chunking and embeddings is what separates useful code search from syntactically similar noise.",
      },
      {
        id: "hld-design-vector-search",
        title: "Design a scalable vector similarity search service",
        difficulty: "Hard",
        category: "hld-interview-qa",
        question:
          "Design a vector search service that finds the top-K most similar embeddings to a query vector across hundreds of millions of vectors in under 100ms. What's the core algorithm and what are the production pain points?",
        answer: {
          short:
            "Approximate Nearest Neighbor (ANN) search via HNSW is the production-default algorithm — it trades a small recall loss for orders-of-magnitude speed improvement. The production pain points are not the algorithm but filtered search (ANN + metadata filters), horizontal sharding (scatter-gather across shards), and embedding model upgrades (re-indexing the full corpus).",
          detailed: [
            "Exact nearest-neighbor search over 100M high-dimensional vectors (e.g., 1536-dim OpenAI embeddings) is O(N × D) per query — completely untenable at scale. ANN trades a few percent recall accuracy for orders-of-magnitude speed improvement, achieving 95-99% recall@10 at 10-100ms latency.",
            "HNSW (Hierarchical Navigable Small World) is the production-dominant ANN algorithm — used by Pinecone, Weaviate, pgvector. It builds a layered graph where upper layers have long-range connections and lower layers have fine-grained local connections; a query starts at the top and navigates downward, pruning the search space dramatically. The graph is built once offline and queried in-memory.",
            "Horizontal sharding requires scatter-gather: a HNSW index doesn't shard like a relational DB (nearest neighbors can be on any shard). The standard approach is partition the corpus into N shards, query all shards in parallel, and merge the top-K results from each shard. This multiplies read cost by the number of shards but is required for corpora too large for a single machine's RAM.",
            "Filtered search is the hardest operational challenge: 'find top-K similar to X, where category = legal AND created_after = 2024-01-01'. Post-filtering (retrieve top-1000 then filter) destroys recall for selective filters; pre-filtering (build a separate index per filter value) is impractical at many dimensions; in-filter ANN (HNSW with native metadata filtering) is the modern production approach (Weaviate, Pinecone namespaces).",
            "Embedding model upgrades are the most painful operational event: switching embedding models requires re-embedding the entire corpus (100M docs × inference cost = weeks of compute and expense) and rebuilding the entire index, all while keeping the current index live. The strategy: build the new index offline in parallel, validate recall@K and answer quality, then swap traffic atomically (blue-green index swap).",
            "Write path management: HNSW graph updates (inserting/deleting vectors) are expensive and can degrade query performance over time as the graph becomes unbalanced. Production systems often buffer writes (via Kafka) and batch-merge them periodically, accepting that new vectors aren't immediately searchable — the freshness SLA must be explicitly specified.",
          ],
        },
        keyPoints: [
          {
            point: "ANN (not exact NN) is the only viable algorithm at scale — HNSW is the production default, trading 1-5% recall for orders-of-magnitude speed improvement",
            example: "A 100M-vector corpus with 1536-dim embeddings requires ~576GB for the raw vectors alone — brute-force cosine similarity at query time is physically impossible; HNSW indexes allow sub-100ms search over the full corpus from a single server.",
            bestApproach: "Choose HNSW as the default index type and tune the M (graph connectivity) and ef_construction (index build quality) parameters based on your recall vs build-time vs query-latency trade-off — measure recall@K empirically, never assume it.",
          },
          {
            point: "Filtered search is the hardest production challenge — post-filtering on selective filters destroys recall; in-filter ANN (HNSW with native metadata filtering) is the production solution",
            example: "Filtering to 1% of the corpus after ANN retrieval means the ANN must return 100x more candidates to find K results — at high selectivity, this is effectively full scan.",
            bestApproach: "Use a vector DB with native in-filter ANN support (Weaviate, Pinecone namespaces, pgvector with partition pruning) for multi-attribute filtered search — post-filtering is only acceptable for low-selectivity filters (> 20% of corpus).",
          },
          {
            point: "Embedding model upgrades require re-indexing the full corpus — plan for a blue-green index strategy from day one so upgrades don't require downtime",
            example: "OpenAI deprecated text-embedding-ada-002 in favor of text-embedding-3-small — any team that didn't have a re-indexing pipeline had to take a weekend maintenance window to rebuild their entire vector index.",
            bestApproach: "Treat the embedding model version as a first-class part of the index metadata, build automated re-indexing pipelines that can run offline against the full corpus, and maintain the old index until the new one is fully validated.",
          },
          {
            point: "Sharding requires scatter-gather across all shards per query — partition the index with awareness of which shard will likely contain the query's nearest neighbors to minimize cross-shard traffic",
            example: "Random partitioning means every query fans out to all N shards; partitioning by document category means a query for 'legal contracts' mostly hits the legal shard, with only a small spillover fanout.",
            bestApproach: "Start with random partitioning for simplicity, then move to semantic partitioning (cluster documents by topic, shard by cluster) once query patterns are understood — semantic sharding can reduce fanout by 50-80%.",
          },
        ],
        followUps: [
          "How would you handle 100M+ vectors where even the HNSW index doesn't fit in a single machine's RAM?",
          "How do you measure and monitor recall@K degradation in production without knowing the ground-truth nearest neighbors?",
          "How would you design a multi-tenant vector search service where each tenant's data is fully isolated and billing is per-query?",
        ],
        example:
          "Pinecone, Weaviate, and pgvector are all HNSW-based in production — the insight interviewers are testing is that 'use a vector database' is the beginning of the answer; the interesting design problems are filtered search, sharding strategy, embedding model versioning, and write-path freshness SLAs, which differentiate a production service from a weekend proof of concept.",
      },
      {
        id: "hld-design-reconciliation",
        title: "Design a financial reconciliation system (fintech)",
        difficulty: "Hard",
        category: "hld-interview-qa",
        question:
          "Design a reconciliation system for a payments platform that compares every internal transaction against external settlement files from card networks and banks. What's the architecture and what's the hardest matching problem?",
        answer: {
          short:
            "Reconciliation answers one question: 'for every transaction we recorded, did the money actually move as expected?' — the architecture is a two-dataset join (internal ledger vs external settlement file) with a tiered matcher (exact → fuzzy → manual), an append-only exception log, and real-time alerting on float discrepancies.",
          detailed: [
            "Two sources of truth must match: (1) your internal ledger (every charge, refund, payout your system executed) and (2) external settlement files from Visa, Mastercard, or banks (T+1 or T+2 delivery, listing every transaction they actually processed and settled). Every row in one must match a row in the other.",
            "The pipeline: ingest settlement files into a staging area on receipt, extract internal ledger records for the same settlement window, join on a common key (transaction ID, authorization code), and compare field by field (amount, currency, timestamp, merchant). The result is: matched (all good), exception (discrepancy found), or orphan (in one source but not the other).",
            "Tiered matching handles real-world messiness: (1) exact match — same transaction ID, same amount; (2) fuzzy match — same merchant + timestamp within 24h + amount within $0.01 (FX rounding, fee adjustments); (3) manual review queue for anything unmatched after fuzzy matching. The hit rate of exact matching is typically 95-98%; the remaining 2-5% is where the real bugs hide.",
            "Append-only exception log: every reconciliation run writes immutable result rows — matched, discrepancy found, discrepancy resolved. You never update a prior record. This preserves a complete audit trail required by regulators (SOX, PCI-DSS) so every discrepancy and its resolution are permanently traceable.",
            "Float discrepancy alerting must be real-time: if your ledger shows you collected $1M but the settlement file shows the network settled $999,800, that $200 float discrepancy is an incident — alerting must fire within minutes of the settlement file arriving, not after a nightly batch. Near-realtime reconciliation via event-driven matching (each payment processor webhook event immediately matched against the internal ledger record) achieves sub-minute discrepancy detection.",
            "Two-way matching catches both directions of failure: every internal transaction must match an external settlement record (are we getting paid for everything we processed?) AND every external settlement record must match an internal transaction (is the network charging us for transactions we didn't process?). Orphan records in either direction are different but equally serious bugs.",
          ],
        },
        keyPoints: [
          {
            point: "Two-way matching — not one-way lookup — is the core insight: every internal record needs an external match AND every external record needs an internal match",
            example: "A one-way check finds 'charged but not settled'; a two-way check also finds 'settled by network but never charged internally' — the second direction is how you catch billing bugs that benefit users at your expense.",
            bestApproach: "Model reconciliation as a full outer join between the two datasets — left-only rows are charges with no settlement, right-only rows are settlements with no corresponding charge, both are different classes of incidents.",
          },
          {
            point: "A tiered fuzzy matcher for the unmatched 2-5% is what separates a production reconciliation system from a toy — the easy 95% is table stakes",
            example: "A FX-converted charge may show $99.99 internally and $100.01 in the settlement file due to network rounding — an exact match rejects it as a discrepancy; fuzzy matching within $0.10 correctly marks it as matched.",
            bestApproach: "Layer the matcher: exact first (fast, no false positives), then fuzzy with explicit tolerance per field (amount ± $0.10, timestamp ± 24h, merchant fuzzy string match), then route everything else to a human review queue with full context.",
          },
          {
            point: "The ledger and exception log must be append-only with immutable records — regulators and auditors require every discrepancy and its resolution to be permanently traceable",
            example: "Under SOX and PCI-DSS, a company must be able to show auditors every financial discrepancy and how it was resolved — a mutable reconciliation table that gets overwritten on resolution destroys this audit trail.",
            bestApproach: "Model exceptions as: exception_created (immutable), exception_investigated (append), exception_resolved (append) — resolution creates a new record alongside the original, never replacing it.",
          },
          {
            point: "Float discrepancy alerting must be real-time, not end-of-day — 24 hours of systematic discrepancy compounds the financial exposure significantly",
            example: "A bug that undercharges $0.10 on every transaction sounds trivial — at 1M transactions/day it's $100K/day of revenue leakage, and a T+1 batch reconciliation catches it 24 hours later instead of in minutes.",
            bestApproach: "Run event-driven reconciliation (match each webhook event immediately against the internal ledger) alongside the batch settlement file reconciliation — the event-driven path catches real-time anomalies, the batch path provides the final authoritative reconciliation.",
          },
        ],
        followUps: [
          "How would you reconcile across 40 currencies and handle FX rate differences between authorization and settlement (which can be days apart)?",
          "How would you detect a systematic code bug (a deploy that silently altered amounts for a specific merchant category) vs a one-off data entry error?",
          "How do you handle a card network that sends the same settlement file twice due to a delivery retry?",
        ],
        example:
          "Wise (TransferWise) has been public about running continuous reconciliation across 50+ banking partners — their engineering blog describes exactly this pattern: event-driven matching, append-only exception ledger, tiered matching strategy (exact → fuzzy → manual), and resolving 99.8% of transactions automatically with the rest going to a specialist operations team — the 0.2% that needs human review is where the interesting financial bugs live.",
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
          detailed: [
            "Latency ladder (orders of magnitude, not exact figures): L1 cache ~1ns, main memory ~100ns, SSD random read ~100µs, network round trip same-datacenter ~0.5ms, disk seek ~10ms, network round trip cross-continent ~150ms. The takeaway to *say out loud*: 'memory is ~100,000x faster than disk, and a same-datacenter round trip is ~100x faster than a cross-continent one — that's why caching and regional deployment are the two biggest levers in any design.'",
            "Availability ladder: 99% ≈ 3.65 days down/year, 99.9% (\"three nines\") ≈ 8.7 hours/year, 99.99% (\"four nines\") ≈ 52 minutes/year, 99.999% (\"five nines\") ≈ 5 minutes/year — each additional nine is roughly an order of magnitude harder and more expensive to achieve.",
            "Scale shortcuts: 1 million requests/day ≈ 11.6 requests/sec on average (10^6 ÷ 86,400 ≈ 11.6 — memorize 'seconds per day ≈ 10^5'); peak load is commonly 2-5x average load — always mention you're accounting for it.",
            "Storage shortcuts: 1 character ≈ 1 byte (UTF-8 ASCII), a UUID ≈ 16 bytes (36-char string form ≈ 36 bytes), a typical JSON API response row ≈ 0.5-2KB — useful for back-of-envelope storage estimates.",
          ],
        },
        keyPoints: [
          {
            point: "Latency ladder: memory ≈ 100,000x faster than disk; same-DC round trip ≈ 100x faster than cross-continent — say this to justify caching and regional deployment",
            example: "Citing 'main memory is ~100,000x faster than a disk seek' directly justifies why a Redis cache in front of a database is the highest-leverage first move for a slow read path.",
            bestApproach: "Keep this ladder memorized well enough to recite the relative multiples (not exact numbers) under pressure — the ratios are what justify design decisions, not the precise nanosecond figures.",
          },
          {
            point: "Availability ladder: 99.9% ≈ 8.7h/yr down, 99.99% ≈ 52min/yr, 99.999% ≈ 5min/yr — each nine costs roughly 10x more",
            example: "Telling a stakeholder '99.99% means 52 minutes of downtime budget for the whole year' turns an abstract SLA target into a concrete operational constraint.",
            bestApproach: "Convert any availability target mentioned in an interview into its yearly downtime budget out loud immediately — it shows you understand what the number actually costs to achieve.",
          },
          {
            point: "Scale shortcut: seconds-per-day ≈ 10^5, so 1M req/day ≈ 11.6 RPS average — and always multiply by 2-5x for peak",
            example: "Converting '50M requests/day' to '~580 RPS average, ~2,000 RPS at peak' in seconds lets you immediately judge whether a single service tier can handle it.",
            bestApproach: "Practice this conversion until it's instant mental math — being able to convert daily figures to RPS without pausing is a fluency signal interviewers notice.",
          },
          {
            point: "These numbers exist to let you reason live, not to be recited — use them to *justify* a design choice in the same breath",
            example: "Saying '11.6K reads/sec vs 116 writes/sec — that 100:1 ratio is why I'd add a cache' connects the math directly to the architecture decision in one breath.",
            bestApproach: "Never state an estimation number without immediately following it with the design decision it justifies — a number alone proves arithmetic, not design judgment.",
          },
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
          detailed: [
            "Relational (Postgres/MySQL): pick when you need ACID transactions, complex queries/joins across well-defined relationships, and a schema that's mostly stable. Strength: correctness guarantees and query flexibility. Watch-out: scaling writes requires sharding, which removes the cross-shard join/transaction guarantees you picked it for.",
            "Document (MongoDB/DynamoDB-document-mode): pick when records are naturally self-contained and their shape varies or evolves often (user profiles, content/CMS, product catalogs with category-specific fields). Watch-out: querying/updating deeply nested or embedded data gets awkward fast.",
            "Key-Value (Redis/DynamoDB/Memcached): pick for blazing-fast lookups by a known key — sessions, caches, feature flags, rate-limit counters. Watch-out: no querying by value, no relationships — it's a hashmap, treat it like one.",
            "Wide-Column (Cassandra/HBase/ScyllaDB): pick for write-heavy, time-series, or massive-scale append-style data with simple, partition-key-driven access patterns (chat messages, IoT telemetry, event logs). Watch-out: secondary-index queries and ad-hoc analytics are painful — you must design around your access pattern up front.",
            "Graph (Neo4j/Neptune): pick when the *relationships themselves* are the primary thing you query (social graphs, recommendation engines, fraud-ring detection — 'friends of friends who also did X'). Watch-out: overkill for data where relationships are shallow or rarely traversed.",
          ],
        },
        keyPoints: [
          {
            point: "Relational → joins + ACID + stable-ish schema. Document → self-contained, evolving-shape records. Key-Value → pure fast lookups by key.",
            example: "An orders-customers-payments domain with strict relational integrity needs fits Postgres; a product catalog with category-specific fields fits MongoDB.",
            bestApproach: "Run through this exact one-glance table mentally before answering any 'which database' question — it should take under 30 seconds to land on a family.",
          },
          {
            point: "Wide-Column → write-heavy/time-series/append-only at massive scale, simple access patterns. Graph → relationships ARE the query.",
            example: "Discord's billions of chat messages (append-heavy, partitioned by channel) fit Cassandra/ScyllaDB; a fraud-ring detection query ('friends of friends who also did X') fits Neo4j.",
            bestApproach: "Reach for wide-column only when your access pattern is genuinely simple (partition key + sort key); reach for graph only when relationship traversal is the primary query, not an occasional join.",
          },
          {
            point: "Every family is a trade — name what you're giving up, not just what you're gaining ('I'm choosing document for flexibility, accepting that cross-record queries get harder')",
            example: "Choosing MongoDB for catalog flexibility means accepting that 'find all products where related_accessory.price > $50' becomes an awkward, slow query.",
            bestApproach: "State the cost side of every database choice explicitly in the same sentence as the benefit — it demonstrates you're not just pattern-matching to a buzzword.",
          },
          {
            point: "Polyglot persistence (one store per workload) is normal in real systems — don't feel pressure to pick exactly one for an entire design",
            example: "A single e-commerce product uses Postgres (orders), MongoDB (catalog), Redis (sessions), Cassandra (logs), and Neo4j (recommendations) — five stores, each fit to its workload.",
            bestApproach: "Default to naming the right store per workload in a design rather than forcing the whole system onto one database 'to keep things simple.'",
          },
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
          detailed: [
            "Strong consistency — use when staleness causes tangible harm: account balances, inventory/seat counts, anything where two readers disagreeing could cause a double-spend or double-booking. Cost: higher latency (often a quorum round trip), reduced availability during partitions.",
            "Eventual consistency — use when staleness is invisible or harmless for the relevant time window: like counts, view counts, follower counts, search index freshness, profile updates. Cost: a (usually short) window where different readers see different answers — and you must design the UX to tolerate it gracefully.",
            "Causal consistency — use when *ordering* matters more than absolute freshness: comment threads, chat messages, collaborative editing — you must never see a reply before the message it replies to, even if you're fine seeing it a few seconds 'late'.",
            "Read-your-own-writes — a special, frequently-needed guarantee: a user should always see *their own* update immediately, even if the system is eventually consistent for everyone else (classic fix: route a user's reads to the same replica their write went to, for a short window after writing).",
          ],
        },
        keyPoints: [
          {
            point: "The one-question filter: 'what's the real-world cost of showing stale data here?' — that answer picks your model",
            example: "Showing a stale follower count costs nothing real; showing a stale '1 seat left' on a flight booking costs an actual double-sale — same question, opposite answers.",
            bestApproach: "Ask this exact question for every new feature's data model before defaulting to strong consistency 'to be safe' — safety has a real latency/availability cost too.",
          },
          {
            point: "Strong: money, inventory, safety. Eventual: social metrics, profiles, search freshness. Causal: anything with cause-and-effect ordering (threads, chat).",
            example: "A bank balance (strong), a like count (eventual), and a comment-reply thread (causal) might all coexist on one screen with three different consistency guarantees.",
            bestApproach: "Tag each data field in your schema with its required consistency model during design, rather than discovering the mismatch after a staleness bug ships.",
          },
          {
            point: "Read-your-own-writes is the guarantee users notice the most and complain about loudest when it's missing — design for it explicitly even in eventually-consistent systems",
            example: "A user who just posted a comment and doesn't see it on refresh (because they hit a lagging replica) files a bug report immediately — even though every other user's view is technically fine.",
            bestApproach: "Route a user's reads to the same replica their write went to for a short window post-write (sticky routing or a 'read your own write' cache layer) even in otherwise eventually-consistent systems.",
          },
          {
            point: "Don't pick one model for the whole system — mix per-feature based on each feature's actual tolerance for staleness",
            example: "Forcing strong consistency on a 'view count' feature just because the payments feature needs it wastes latency/availability budget for zero user benefit.",
            bestApproach: "Make consistency model a per-table or per-field design decision documented in the schema, not a single database-wide setting inherited by every feature.",
          },
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
          detailed: [
            "1) Timeouts — the foundation; without them, one hung call can occupy a thread/connection forever. Every network call gets one, sized to the operation (a cache lookup and a report-generation call shouldn't share a timeout).",
            "2) Retries with exponential backoff and jitter — handle transient blips (a dropped packet, a GC pause); jitter specifically prevents synchronized retry storms across many clients.",
            "3) Circuit breaker — stop calling a dependency that's clearly broken; protects both it (room to recover) and you (stop burning your own resources on calls that won't succeed).",
            "4) Bulkhead — isolate resource pools per dependency so one slow dependency can't starve calls to healthy ones (named for ship compartments containing flooding).",
            "5) Fallback / graceful degradation — when a dependency is unavailable, serve a cached value, a default, or a reduced feature set instead of a hard error.",
            "6) Idempotency — the prerequisite that makes retries *safe* for writes: an idempotency key ensures 'charge this card' executed twice has the same effect as once.",
          ],
        },
        keyPoints: [
          {
            point: "Timeouts are the foundation — nothing else in the stack matters if a single call can hang forever",
            example: "A payment call with no timeout can hold a request thread indefinitely, and enough hung threads eventually exhausts the pool for completely unrelated requests too.",
            bestApproach: "Audit every outbound network call in a codebase for an explicit timeout as a baseline hygiene check — treat a missing timeout as a release blocker, not a nice-to-have.",
          },
          {
            point: "Backoff handles 'how long to wait'; jitter handles 'don't all retry at the same instant' — both are needed, neither alone is enough",
            example: "1,000 clients all retrying at exactly t+1s, t+2s, t+4s (synchronized backoff with no jitter) recreate the exact same load spike they were trying to avoid.",
            bestApproach: "Always add randomized jitter (e.g., backoff_time × random(0.5, 1.5)) to any exponential backoff implementation — backoff alone is an incomplete fix.",
          },
          {
            point: "Circuit breakers and bulkheads solve different problems: 'stop calling a broken dependency' vs 'don't let one dependency's slowness exhaust shared resources'",
            example: "A circuit breaker stops calling a clearly-down fraud-check API; a bulkhead ensures that even while it's being called, it can't starve the thread pool serving shipping calls.",
            bestApproach: "Implement both independently — a circuit breaker without a bulkhead still lets a slow (not-yet-tripped) dependency exhaust shared resources before the breaker opens.",
          },
          {
            point: "Idempotency isn't optional once you have retries on writes — without it, a retried payment can become a double charge",
            example: "A client retry after a network timeout (where the original request actually succeeded server-side) without an idempotency key results in two charges for one purchase.",
            bestApproach: "Require an idempotency key on every write endpoint before enabling client-side or infrastructure-level retries against it — sequence this as a hard prerequisite, not parallel work.",
          },
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
          detailed: [
            "1) Measure first — find the actual bottleneck (CPU? DB locks? network? a slow downstream call?) before changing anything; scaling the wrong layer wastes effort and adds complexity for zero benefit.",
            "2) Cache — CDN for static/cacheable content, application-level cache (Redis) for hot reads; usually the highest-leverage, lowest-risk change for read-heavy systems.",
            "3) Read replicas — decouple read scaling from write scaling; route reads through a proxy/load balancer, keep writes on the primary.",
            "4) Statelessness + horizontal scaling — move sessions out of the app process (Redis), put the app tier behind a load balancer with auto-scaling.",
            "5) Asynchronous processing — move slow/non-critical work (emails, transcoding, exports, analytics) off the request path and into background workers via a queue.",
            "6) Sharding — the last resort: split data across multiple database instances by a carefully-chosen key; accept that joins, transactions, and resharding all get harder.",
            "Each step down this list is progressively more invasive, expensive, and risky to reverse — exhaust the cheap, low-risk wins before reaching for the operationally heavy ones.",
          ],
        },
        keyPoints: [
          {
            point: "Always measure before changing anything — 'what's actually slow?' beats any generic playbook",
            example: "A team that profiled before acting found JSON serialization, not the database, was their bottleneck — sharding (the 'obvious' fix) would have wasted months for zero benefit.",
            bestApproach: "Require a profiler/APM flamegraph or query-time breakdown as evidence before any scaling proposal moves forward, regardless of how confident the team feels about the cause.",
          },
          {
            point: "Caching and read replicas solve the vast majority of read-scaling problems cheaply — reach for them long before sharding",
            example: "Adding a Redis cache with a 60s TTL in front of a hot product-listing endpoint cut database load by 95% in an afternoon — far cheaper than any sharding project.",
            bestApproach: "Set an explicit bar (e.g., 'cache hit rate above 90% and still bottlenecked') that must be cleared before sharding is even considered as a next step.",
          },
          {
            point: "Statelessness is the prerequisite for horizontal auto-scaling — it has to happen before 'just add more servers' is even possible",
            example: "An app storing sessions in local memory can't safely auto-scale — half of requests would land on an instance with no knowledge of the user's session.",
            bestApproach: "Move all session/cache state out of the app process (to Redis or signed tokens) as an explicit, verified prerequisite before enabling auto-scaling rules.",
          },
          {
            point: "Sharding is a one-way door — it's last on this list because it's the hardest to undo and the most operationally expensive",
            example: "Once orders are sharded by customer_id, 'merge it back into one database' is a multi-month migration project, not a config change you can revert.",
            bestApproach: "Treat the decision to shard as requiring sign-off proportional to its irreversibility — document what's been exhausted first, and what breaks (joins, transactions) as part of the proposal.",
          },
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
          detailed: [
            "On consistency: 'I'm choosing eventual consistency here because the cost of a few seconds of staleness is near-zero, but the cost of unavailability during a partition is real lost revenue.'",
            "On caching: 'A cache turns a database problem into a cache-invalidation problem — which is usually the better problem to have, but it IS a new problem, not a free lunch.'",
            "On microservices: 'I'd start with a modular monolith — clean internal boundaries — so that splitting later is an extraction, not a rewrite.'",
            "On async: 'If the user doesn't need the result synchronously, they don't need to wait for it synchronously either — accept fast, process in the background, notify on completion.'",
            "On sharding: 'Sharding solves a scale problem by creating a join problem — I'd only reach for it once caching, replicas, and indexing are exhausted.'",
            "On security/secrets: 'Secrets belong in a vault with short-lived, automatically-rotated credentials — not in config files, and definitely not in logs.'",
            "On observability: 'If I can't see it, I can't fix it at 2am — every new service ships with metrics, structured logs, and tracing from day one, not as a follow-up ticket.'",
          ],
        },
        keyPoints: [
          {
            point: "A trade-off framed in one sentence, naming both the cost and the benefit, reads as more senior than a paragraph of hedging",
            example: "'I'm choosing eventual consistency because staleness costs near-zero here, but unavailability during a partition costs real revenue' lands faster than a rambling pros/cons list.",
            bestApproach: "Draft and rehearse 2-3 of these one-liners for your most likely trade-offs (consistency, caching, async) before any interview — fluency under pressure is built in advance, not improvised.",
          },
          {
            point: "'X turns a Y problem into a Z problem' is a powerful rhetorical shape — it shows you know nothing is free, only traded",
            example: "'A cache turns a database problem into a cache-invalidation problem' is memorable specifically because it names the new problem you've taken on, not just the old one you've solved.",
            bestApproach: "Practice this exact sentence template on your own designs — for every solution you propose, ask 'what new problem did this turn the old problem into?' and say it out loud.",
          },
          {
            point: "Practice saying these out loud — interviews are a spoken-word format, and fluency under pressure is itself part of the grade",
            example: "A candidate who's rehearsed their trade-off soundbites delivers them smoothly mid-design; one who hasn't stumbles through the same idea in a less confident, longer-winded way.",
            bestApproach: "Do mock interviews or solo rehearsal specifically practicing delivering these soundbites verbally, not just writing them down — spoken fluency is a distinct skill from written clarity.",
          },
          {
            point: "Tailor the soundbite to what the interviewer seems to care about (cost? latency? team velocity?) — the same trade-off can be framed multiple honest ways",
            example: "The same caching decision can be framed as 'saves database cost' to a cost-focused interviewer or 'cuts p99 latency by 10x' to a performance-focused one — both true, different emphasis.",
            bestApproach: "Listen for what the interviewer probes on (follow-up questions about cost vs latency vs team process) and adapt which angle of a trade-off you lead with accordingly.",
          },
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
          detailed: [
            "'Is there an existing system this needs to integrate with, or are we greenfield?' (shows you think about migration cost and integration surface, not just clean-slate design).",
            "'What's the team's operational maturity — do we have an SRE function, observability stack, on-call rotation?' (shows you know that a design's *operability* is as real a constraint as its architecture — a brilliant design an under-staffed team can't run is not actually a good design).",
            "'Which failure would be more costly: showing slightly stale data, or being briefly unavailable?' (this is the PACELC question in disguise — asking it shows you already know the trade-off exists and want the business context to resolve it correctly).",
            "'How do we expect this to evolve in a year — 10x growth? new feature surface? new regulatory requirements (data residency, GDPR)?' (shows you design for *change*, not just for the spec as given — today's clean design is tomorrow's legacy system if it can't absorb growth).",
            "Each of these questions does double duty: it gets you real information you need, *and* it signals to the interviewer that you think like someone who's shipped and operated systems, not just designed them on a whiteboard.",
          ],
        },
        keyPoints: [
          {
            point: "'Integrate with existing systems or greenfield?' — shows you think about migration and integration cost, the part real-world projects spend most of their time on",
            example: "Learning a design must integrate with a legacy billing system completely changes the API contract and data-migration plan compared to a truly greenfield build.",
            bestApproach: "Ask this question within the first few minutes of any HLD round — the answer can reshape the entire design, so get it before investing in a direction.",
          },
          {
            point: "'What's the team's operational maturity?' — operability is a real design constraint; a design the team can't run isn't actually a good design",
            example: "Proposing a Kafka-based event-driven architecture for a 3-person team with no on-call rotation or observability stack sets them up to fail operationally, however elegant the design.",
            bestApproach: "Calibrate design complexity to the team's stated operational capacity — a simpler design the team can actually run beats a sophisticated one they can't.",
          },
          {
            point: "'Stale-but-available, or correct-but-down — which costs more here?' — the PACELC question in business language; asking it shows you already see the trade-off",
            example: "For a social feed, stale-but-available is clearly right; for a flight-seat inventory system, correct-but-down might be the safer business call.",
            bestApproach: "Phrase the PACELC trade-off in business terms (revenue, trust, safety) rather than technical jargon when asking the interviewer — it shows you can translate for non-technical stakeholders too.",
          },
          {
            point: "'How does this evolve in a year?' — designing for change, not just for the spec as stated, is what separates senior thinking from junior thinking",
            example: "A design built only for today's 10K users might need a fundamentally different data model if the interviewer reveals 10x growth or new regulatory requirements are expected within a year.",
            bestApproach: "Ask about expected evolution before finalizing the design, and explicitly note which parts of your design would need to change under different growth/requirement scenarios.",
          },
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
          detailed: [
            "Core entities: Issue (type: story/bug/task/epic, fields, status, assignee), Project (owns a Workflow Scheme), Workflow (a directed graph of statuses and allowed transitions, e.g. TODO → IN_PROGRESS → IN_REVIEW → DONE, with role-gated edges), Board (a saved filter + column mapping over issues), Sprint (a time-boxed issue collection).",
            "Multi-tenancy: small/medium orgs share partitioned tables keyed by tenant_id with row-level isolation; very large orgs (10K+ seats) can be split to dedicated shards.",
            "The workflow engine is the trickiest part — instead of hardcoding statuses, model transitions as data (workflow_transitions table: from_status, to_status, required_role, post-functions like 'auto-assign on transition to IN_PROGRESS') so each team customizes without code changes.",
            "Every field change is appended to an immutable changelog table (issue_id, field, old_value, new_value, actor, timestamp) — this powers both the activity feed and audit/compliance requirements.",
            "Search (JQL) is served by Elasticsearch with a permission-aware index (each doc carries project_id + visible_role list so unauthorized issues never appear in results). Boards are materialized queries, refreshed via the same event stream that updates the changelog, so board state never drifts from issue state.",
          ],
        },
        entities: [
          { name: "Issue", description: "The core work item — story, bug, task, or epic.", fields: ["id — UUID, primary key", "type — story | bug | task | epic", "title, description", "status — current value from the project's Workflow", "project_id — owning project", "assignee_id, reporter_id"] },
          { name: "Project", description: "A container of issues that owns a workflow scheme.", fields: ["id, key (e.g. 'ENG')", "name", "workflow_scheme_id — FK to Workflow"] },
          { name: "Workflow", description: "A directed graph of statuses and allowed transitions for a project.", fields: ["id", "statuses — [TODO, IN_PROGRESS, IN_REVIEW, DONE, ...]", "transitions — see WorkflowTransition"] },
          { name: "WorkflowTransition", description: "One allowed edge in the workflow graph, modeled as data so teams customize without code changes.", fields: ["from_status, to_status", "required_role", "post_functions — e.g. 'auto-assign on entry'"] },
          { name: "Board", description: "A saved filter + column mapping over issues — a read projection, never a second source of truth.", fields: ["id, project_id", "filter_jql", "column_mapping — status → column"] },
          { name: "ChangelogEntry", description: "Immutable append-only record of every field change — powers audit trail and activity feed.", fields: ["issue_id, field", "old_value, new_value", "actor_id, timestamp"] },
        ],
        keyPoints: [
          {
            point: "One generic Issue entity + a data-driven workflow (state machine as rows, not code) is what makes per-team customization possible without N codepaths",
            example: "A workflow_transitions table letting one team add a 'Code Review' status between IN_PROGRESS and DONE requires zero code deploys, just new rows.",
            bestApproach: "Model status transitions as configurable data from day one, even for an MVP — retrofitting a data-driven workflow engine onto hardcoded status logic later is a major rewrite.",
          },
          {
            point: "Boards and sprints are projections/views over issues — never a second source of truth, or they will drift",
            example: "A board showing a card in 'In Progress' that doesn't match the issue's actual status field is a drift bug caused by treating the board as separately-stored state.",
            bestApproach: "Compute board/sprint views via queries or cached materializations refreshed from the same event stream that updates issues — never let UI state diverge from the issue's canonical fields.",
          },
          {
            point: "An append-only changelog table is non-negotiable — it's the audit trail, the activity feed, and the undo mechanism all at once",
            example: "Jira's 'View history' on any issue is a direct read of this changelog table — every field change, ever, with who and when.",
            bestApproach: "Write every field mutation to an append-only changelog as part of the same transaction as the mutation itself, never as a best-effort side effect that could be skipped.",
          },
          {
            point: "Permission-aware search (filtering at index time, not query time) is what keeps JQL-style search both fast and secure across multi-project orgs",
            example: "Embedding a `visible_role` array directly in each Elasticsearch document lets a single filtered query exclude unauthorized issues without a separate permission-check pass.",
            bestApproach: "Bake visibility/permission fields into the search index schema itself, and update them via the same event pipeline that updates project membership — never filter results after the fact in application code.",
          },
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
          detailed: [
            "Two competing techniques solve concurrent editing: Operational Transformation (OT) — each edit is an operation (insert/delete at position); when two operations arrive out of order, the server transforms one against the other so they still apply correctly (Google Docs' approach) — and CRDTs (Conflict-free Replicated Data Types) — each character/element gets a unique, order-preserving ID, so merges are commutative and don't need a central transform step (used by Figma, Notion).",
            "CRDTs are simpler to reason about and work better offline-first, but carry more metadata overhead per character.",
            "Architecture: a document is owned by exactly one 'document server' instance at a time (consistent hashing by doc_id), which holds the live in-memory state and the connected clients' WebSocket connections; this avoids needing distributed consensus for every keystroke.",
            "Edits go: client → owning server (apply + transform/merge) → broadcast to all other connected clients for that doc.",
            "Persistence: periodic snapshots to object storage plus an append-only operation log, so a server crash only loses the in-flight ops since the last snapshot, replayed from the log.",
            "Presence (cursors, who's viewing) is ephemeral pub/sub, not persisted. Reconnection: client sends its last-known version; server replays missed ops or sends a full snapshot if too far behind.",
          ],
        },
        entities: [
          { name: "Document", description: "A collaboratively-edited document, pinned to one owning server at a time.", fields: ["id, title", "current_version", "owning_server_id — consistent-hash assigned"] },
          { name: "Operation", description: "A single edit (insert/delete) applied to a document — the unit of OT/CRDT merging.", fields: ["id, doc_id", "type — insert | delete", "position, content", "author_id, version"] },
          { name: "Snapshot", description: "A periodic full-state checkpoint used to bound op-log replay time.", fields: ["id, doc_id, version", "content_blob", "created_at"] },
          { name: "PresenceSession", description: "Ephemeral pub/sub state for live cursors and viewers — never persisted durably.", fields: ["doc_id, user_id", "cursor_position", "connection_id, last_seen"] },
          { name: "DocumentServerAssignment", description: "Consistent-hash mapping of a document to its current owning server instance.", fields: ["doc_id, server_id", "assigned_at"] },
        ],
        keyPoints: [
          {
            point: "OT (Google Docs) needs a central authority to transform conflicting ops; CRDTs (Figma, Notion) make merges commutative so peers can apply ops in any order and converge — pick based on whether you need offline support",
            example: "Figma chose a CRDT-like model specifically because it makes conflict resolution embarrassingly simple compared to OT's transform matrices, and it tolerates brief offline edits naturally.",
            bestApproach: "Choose CRDTs by default for new collaborative editors unless you have existing OT infrastructure — the offline-tolerance and simpler reasoning usually outweigh the extra per-character metadata cost.",
          },
          {
            point: "Pin each document to one owning server via consistent hashing — keeps the hot path (apply + broadcast) in-memory and avoids per-keystroke consensus",
            example: "Every edit to a given Google Doc routes to the same server instance holding that doc's live state in memory, avoiding a distributed-consensus round trip on every keystroke.",
            bestApproach: "Use consistent hashing on document ID to route connections to the owning server, and design for ownership handoff (consistent hashing's small remap on node changes) as a first-class operation.",
          },
          {
            point: "Persist via snapshot + op log, not a write per keystroke to the primary DB — replay the log to reconstruct state after a crash",
            example: "A server holding a document crashes after 200 keystrokes since the last snapshot — replaying just those 200 ops from the log reconstructs exact state, no data lost.",
            bestApproach: "Snapshot periodically (e.g., every N ops or T seconds) to bound replay time, and always persist the op log durably (not just in memory) so a crash never loses unacknowledged edits.",
          },
          {
            point: "Presence (cursors, live viewers) is ephemeral and should never touch durable storage — it's pure pub/sub",
            example: "A collaborator's cursor position is broadcast to other connected clients via WebSocket but is never written to a database — it's meaningless the moment they disconnect.",
            bestApproach: "Keep presence data entirely in-memory/pub-sub (Redis pub/sub or a WebSocket fan-out layer) with no durability guarantee — persisting it would be wasted cost for zero benefit.",
          },
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
          detailed: [
            "Producers (any internal service — order service, social service) publish a notification event to a Kafka topic rather than calling a delivery API directly — this decouples business logic from delivery concerns and absorbs spikes.",
            "A Notification Orchestrator consumes the topic, resolves: (1) user preferences (which channels are enabled, quiet hours), (2) template (renders the message body per locale), (3) channel routing (push vs email vs SMS based on priority and user settings) — and emits one task per channel to channel-specific queues.",
            "Each channel has its own worker pool tuned to its provider's limits: FCM/APNs push workers can burst to thousands/sec, SMS workers via Twilio are rate-limited and cost real money so they get a strict token-bucket limiter, email workers batch via SES/SendGrid.",
            "Idempotency: every notification carries a dedup key (event_id + user_id + channel); workers check a Redis SET (or DB unique constraint) before sending, so a re-processed Kafka message after a worker crash never double-sends.",
            "Delivery tracking: provider webhooks (FCM delivery receipts, SES bounce/complaint events) feed back into a notification_log table for analytics and to auto-disable channels with high bounce/complaint rates per user.",
            "Low-priority notifications (weekly digest, recommendations) are batched and rate-shaped; high-priority (OTP, security alerts) bypass batching and go out immediately.",
          ],
        },
        entities: [
          { name: "NotificationEvent", description: "The semantic event published by a business service — never pre-rendered text.", fields: ["id, event_type", "user_id", "payload — structured data", "created_at"] },
          { name: "ChannelTask", description: "One per-channel delivery attempt fanned out from a NotificationEvent.", fields: ["id, event_id", "channel — push | sms | email", "status, attempts"] },
          { name: "UserPreference", description: "Per-category, per-channel opt-in/opt-out state.", fields: ["user_id, category", "channel", "enabled | digest"] },
          { name: "DeliveryReceipt", description: "Provider callback recording final delivery outcome.", fields: ["task_id, provider", "status — delivered | bounced | failed", "received_at"] },
          { name: "DeviceToken", description: "Push-token registry, purged automatically on provider bounce.", fields: ["user_id, device_id", "platform — FCM | APNs | Web", "token, updated_at"] },
        ],
        keyPoints: [
          {
            point: "A queue between 'event happened' and 'notification sent' is what absorbs traffic spikes and decouples business logic from delivery — never call provider APIs synchronously from request handlers",
            example: "An order-confirmation flow publishing to Kafka instead of calling SendGrid directly means a SendGrid outage never fails the order-placement request itself.",
            bestApproach: "Make 'publish an event' the only notification-related action any business-logic service performs — the actual send logic should live entirely in downstream consumers.",
          },
          {
            point: "Each channel (push/SMS/email) needs its own worker pool and rate limiter tuned to that provider's actual limits — one slow channel must never block another",
            example: "Twilio's SMS rate limits are far stricter than FCM's push limits — sharing one worker pool across both means SMS throttling backs up push notifications too.",
            bestApproach: "Give every channel its own dedicated queue, worker pool, and provider-specific rate limiter, sized independently against that provider's documented limits.",
          },
          {
            point: "Idempotency keys are mandatory — at-least-once delivery from Kafka means workers WILL occasionally see the same message twice",
            example: "A worker crash after sending a push but before committing its Kafka offset causes the same notification message to be redelivered and reprocessed.",
            bestApproach: "Dedup on (event_id, user_id, channel) via a Redis SET or DB unique constraint before sending, regardless of how rare double-delivery seems in testing.",
          },
          {
            point: "Feed delivery receipts (bounces, complaints, invalid tokens) back into user preference state — silently retrying a dead push token forever wastes capacity",
            example: "An FCM 410 (token expired) response that's ignored causes the system to keep attempting delivery to a device that uninstalled the app months ago.",
            bestApproach: "Wire provider webhook/receipt callbacks directly into a token-cleanup and preference-update pipeline, so dead endpoints are purged automatically rather than manually.",
          },
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
          detailed: [
            "Ingestion: a CDC (change data capture) pipeline or explicit publish-event listens for document create/update/delete and pushes to an indexing queue; an Indexer Worker tokenizes the content (stemming, stop-word removal, language detection), and writes to Elasticsearch with fields: title, body (analyzed for full-text), tags, last_updated, view_count, and — critically — acl: an array of role/group IDs allowed to view it.",
            "Query: incoming search request resolves the user's group memberships, and the ES query includes a 'filter: acl in [user's groups]' clause — this means permission checks happen inside the index lookup (fast, uses ES's filter cache) rather than as an application-layer filter after fetching results (which would require over-fetching to backfill a page after removing unauthorized hits).",
            "Ranking combines BM25 (term frequency/inverse document frequency relevance score) with a freshness decay (recently updated docs score higher — most useful in fast-moving wikis) and a popularity signal (view_count, or better, click-through rate from past searches, learned via periodic re-ranking).",
            "Typo tolerance and synonyms (e.g., 'k8s' → 'kubernetes') are handled via ES's fuzzy matching and a synonym filter maintained by the team.",
            "Reindexing on doc update is incremental (single-document upsert), not a full rebuild — full rebuilds are reserved for analyzer/schema changes and run as a blue-green index swap with zero downtime.",
          ],
        },
        entities: [
          { name: "Document", description: "A knowledge-base article — the source of truth, stored in the primary datastore.", fields: ["id, title, body", "tags[]", "last_updated", "acl — visible role/group list"] },
          { name: "IndexEntry", description: "The Elasticsearch document — tokenized content plus permission and ranking signals.", fields: ["doc_id", "tokenized fields (title, body)", "acl, freshness_score, popularity_score"] },
          { name: "SearchQuery", description: "A logged search request, used for ranking feedback and analytics.", fields: ["query_text, user_id", "filters, timestamp"] },
          { name: "SynonymRule", description: "Team-curated jargon/acronym mapping applied at query time.", fields: ["term", "synonyms[] — e.g. 'k8s' → 'kubernetes'"] },
          { name: "ClickEvent", description: "Click-through signal feeding the ranking model's popularity score.", fields: ["query_id, doc_id", "position, clicked_at"] },
        ],
        keyPoints: [
          {
            point: "Bake ACLs into the document's index entry and filter at query time inside Elasticsearch — never fetch-then-filter in application code, it breaks pagination and leaks document existence",
            example: "Filtering unauthorized results after fetching a page of 20 means a user might see only 12 results with no way to know 8 were silently removed, breaking pagination entirely.",
            bestApproach: "Add an `acl` field to every indexed document and include a `filter: acl in [user's groups]` clause directly in the Elasticsearch query — permission checks belong inside the search engine's filter cache.",
          },
          {
            point: "BM25 alone isn't enough for a living knowledge base — blend in freshness decay and click/popularity signals so stale-but-keyword-matchy docs don't outrank the current canonical one",
            example: "A 2-year-old onboarding doc with the exact keyword match can outrank last week's updated version under pure BM25 — freshness decay fixes this.",
            bestApproach: "Combine BM25 relevance score with a time-decay function and click-through-rate signal in your ranking formula, re-tuning the weights based on actual search-result click data.",
          },
          {
            point: "Incremental single-doc indexing on every update keeps the index fresh in seconds; reserve full reindexing for schema/analyzer changes via blue-green index swap",
            example: "Editing a Confluence page triggers a single-document upsert to Elasticsearch in seconds, while a synonym-dictionary update requires a full reindex behind a blue-green swap.",
            bestApproach: "Wire document updates to an incremental upsert via CDC or an explicit publish event, and reserve full reindexing exclusively for changes to the index schema or analyzers.",
          },
          {
            point: "Synonym and typo tolerance (fuzzy match, custom synonym dictionaries) matter enormously for internal jargon-heavy content — generic search tuning underperforms here",
            example: "A search for 'k8s' should surface documents containing 'Kubernetes' — generic out-of-the-box Elasticsearch tuning won't know that mapping without a custom synonym dictionary.",
            bestApproach: "Maintain a living, team-curated synonym dictionary for internal jargon/acronyms as part of the search index config, reviewed and updated as new terms enter common usage.",
          },
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
          detailed: [
            "Responsibilities, top to bottom of the request path: (1) TLS termination and request validation (size limits, malformed JSON rejected early, cheap to do at the edge).",
            "(2) AuthN: validate JWT/OAuth token signature and expiry once at the gateway — downstream services trust a signed internal header (e.g., X-User-Id, X-Tenant-Id) instead of re-validating tokens, saving redundant work across dozens of services.",
            "(3) AuthZ: coarse-grained checks (does this token have the right scope for this route) happen at the gateway; fine-grained, resource-level checks (can this user edit this specific issue) stay in the owning service, which has the domain context.",
            "(4) Routing: path-prefix or host-based routing (e.g., /jira/* → Jira service) resolved via a service registry (Consul/Eureka) or static config, with health-check-aware load balancing so traffic never routes to an unhealthy instance.",
            "(5) Rate limiting: token bucket per (tenant, route) pair backed by Redis (INCR + EXPIRE, or a Lua script for atomicity) — protects backend services from a single noisy tenant.",
            "(6) Resilience: circuit breaker per backend (trip after N consecutive failures, fail fast instead of piling up timeouts) and configurable per-route timeouts/retries with jitter.",
            "(7) Observability: every request gets a trace ID injected at the gateway and propagated downstream, plus uniform access logs and latency histograms — this is often the gateway's most underrated value, since it turns 'add tracing' from an N-service problem into a 1-service problem.",
          ],
        },
        entities: [
          { name: "Route", description: "A path-prefix-to-backend mapping the gateway uses for request routing.", fields: ["path_prefix", "target_service", "methods[]"] },
          { name: "ServiceRegistryEntry", description: "Health-aware record of a backend service's live instances.", fields: ["service_name", "instances[]", "health_status"] },
          { name: "RateLimitPolicy", description: "Per (tenant, route) token-bucket configuration.", fields: ["tenant_id, route", "limit, window"] },
          { name: "AuthContext", description: "Decoded identity attached to a request after the gateway validates its token once.", fields: ["user_id, tenant_id", "scopes[]", "exp"] },
          { name: "CircuitBreakerState", description: "Per-backend resilience state tracked at the gateway.", fields: ["service_name", "state — closed | open | half_open", "failure_count"] },
        ],
        keyPoints: [
          {
            point: "Centralize coarse authN/authZ and TLS termination at the gateway so services trust a signed internal header instead of each re-validating tokens",
            example: "Atlassian's gateway validates OAuth once and forwards a signed Atlassian-Account-Id header, letting every downstream product skip reimplementing token validation.",
            bestApproach: "Validate and decode tokens exactly once at the gateway, then propagate a signed internal identity header — never have both the gateway and every downstream service independently verify the same JWT.",
          },
          {
            point: "Keep fine-grained, resource-level authorization in the owning service — the gateway doesn't have the domain context to know if 'this user' can edit 'this specific issue'",
            example: "The gateway can confirm a token has 'jira:write' scope, but only the Jira service itself knows whether this specific user has edit rights on this specific issue's project.",
            bestApproach: "Draw the line explicitly: gateway enforces scope-level access, owning services enforce resource-level access — document this boundary so new services don't duplicate gateway logic.",
          },
          {
            point: "Rate limit per (tenant, route), not globally — one noisy tenant shouldn't be able to degrade service for everyone, and one hot route shouldn't starve quota for unrelated ones",
            example: "A single enterprise customer running a bulk export job shouldn't be able to exhaust the rate-limit budget that a free-tier customer's normal usage depends on.",
            bestApproach: "Implement rate limiting as a token bucket keyed by (tenant_id, route) in Redis, with separate budgets so no single dimension of traffic can starve another.",
          },
          {
            point: "Inject a trace ID at the gateway and propagate it downstream — this single change makes distributed tracing tractable across dozens of services",
            example: "A single slow checkout request can be traced end-to-end across 8 microservices by following one trace ID injected at the gateway and passed through every header.",
            bestApproach: "Generate a trace ID at the gateway for every inbound request and require every internal service to propagate it on outbound calls — enforce this via a shared middleware library, not convention alone.",
          },
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
          detailed: [
            "Two storage strategies, and real systems use a hybrid: (1) Full snapshot per version — simplest, fast reads (no reconstruction needed), but storage cost scales linearly with edit count × document size — wasteful for a page edited 500 times.",
            "(2) Diff-based — store only the delta (using a text diff algorithm like Myers diff, the same family git uses) between version N and N-1; cheap to store, but reconstructing version 1 of a 500-version document means replaying 499 diffs, which is slow.",
            "The practical hybrid: store a full snapshot every K versions (e.g., every 20th edit) and diffs in between — reconstruction never replays more than K diffs from the nearest snapshot. Schema: page_versions(id, page_id, version_number, author_id, created_at, content_snapshot NULLABLE, diff_from_previous NULLABLE, is_snapshot BOOLEAN).",
            "Diff rendering for the UI (showing 'added 3 lines, removed 1' between two versions) is computed on-demand at view time using the same diff algorithm, not stored redundantly.",
            "Revert is implemented as a new version whose content equals an old version's reconstructed content — never as deleting/rewriting history, which would break the audit trail and any links/permissions tied to specific version IDs.",
            "Concurrent edit conflicts (two users editing offline, both come back online) are resolved either with last-write-wins plus a conflict-version flag for manual merge, or — for richer collaborative cases — by funneling through the same OT/CRDT machinery used in real-time editors.",
          ],
        },
        entities: [
          { name: "Page", description: "A documentation page — the stable entity whose history is tracked.", fields: ["id, title", "current_version_id", "space_id"] },
          { name: "PageVersion", description: "One immutable point in a page's history — either a full snapshot or a diff.", fields: ["id, page_id, version_number", "content_snapshot — nullable", "diff_from_previous — nullable", "author_id, created_at, is_snapshot"] },
          { name: "Author", description: "The user who made a given version's edit.", fields: ["user_id, display_name"] },
          { name: "ConflictRecord", description: "Flags a detected concurrent-edit conflict for manual merge.", fields: ["page_id", "version_a, version_b", "status — unresolved | merged"] },
        ],
        keyPoints: [
          {
            point: "Hybrid storage — full snapshot every K versions, diffs in between — bounds both storage cost and reconstruction time; pure-snapshot or pure-diff each fail at scale in one direction",
            example: "Git stores full blobs but periodically packs them into delta-compressed packfiles, trading a little read-time CPU for much smaller repository size — the same hybrid trade-off.",
            bestApproach: "Pick a snapshot interval (e.g., every 20 versions) based on the actual read/write ratio of your document history feature — frequently-viewed-history docs want a smaller K.",
          },
          {
            point: "Revert creates a NEW version with old content; it never deletes or rewrites history — history must stay append-only for audit and stable permalink guarantees",
            example: "Reverting a Confluence page to version 5 creates version 12 with version 5's content — version 5 itself is never touched, so old permalinks still resolve correctly.",
            bestApproach: "Implement revert as 'fetch old content, save as new version' at the application layer — never expose a destructive 'rewrite history' operation in the API surface at all.",
          },
          {
            point: "Diffs for display (UI 'what changed') are computed on-demand, not stored twice — storing both the version diff and a display diff is redundant",
            example: "Viewing 'what changed between v3 and v7' runs the diff algorithm live at view time rather than maintaining a separately-stored diff for every possible version pair.",
            bestApproach: "Compute display diffs lazily via the same diff library used for storage, caching the rendered result briefly if a specific comparison is viewed repeatedly — don't precompute all pairs.",
          },
          {
            point: "Concurrent offline edits need an explicit conflict-resolution policy (last-write-wins + flag, or full OT/CRDT) — silently dropping one user's edit is the single most common bug in naive implementations",
            example: "Two users editing the same page offline and both syncing later can silently lose one user's paragraph if the system blindly overwrites without detecting the conflict.",
            bestApproach: "At minimum, detect conflicting concurrent edits and flag them for manual merge rather than silently picking a winner — reserve full OT/CRDT machinery for genuinely real-time collaborative cases.",
          },
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
          detailed: [
            "Ingestion: client/server SDKs send events to a collector service, which validates and writes to Kafka partitioned by a key that keeps related events together (e.g., user_id or session_id) for ordered processing.",
            "Stream processing: a Flink or Kafka Streams job consumes the topic and performs windowed aggregation — e.g., 'count of page_view events per page per 10-second tumbling window' — emitting pre-aggregated rows rather than raw events. This is the key design decision: dashboards query pre-aggregated rollups (by minute/hour), never raw events, because scanning billions of raw rows per dashboard refresh is a latency and cost disaster.",
            "Storage: pre-aggregated results land in a column-oriented OLAP store (ClickHouse or Druid) optimized for fast group-by/filter queries over time-series data; raw events also land in cheap, durable storage (S3 + Parquet via a separate batch sink) for the cases where someone needs to recompute a historical metric definition that didn't exist when the data was first ingested.",
            "Late/out-of-order events (a mobile client offline for 10 minutes) are handled via watermarks in the stream processor — a window stays open for a grace period after its nominal end time to admit slightly-late events before finalizing the aggregate.",
            "Dashboard reads hit the OLAP store directly with sub-second query latency; for true real-time (sub-5-second) metrics, a small in-memory layer (Redis counters) bypasses the OLAP store entirely for the handful of 'live counter' widgets that need it.",
          ],
        },
        entities: [
          { name: "RawEvent", description: "An individual ingested event, retained in cold storage for reprocessing.", fields: ["id, event_type", "properties — JSON payload", "user_id, timestamp"] },
          { name: "AggregateWindow", description: "A pre-computed rollup row — the only thing dashboards ever query.", fields: ["metric_name", "window_start, window_end", "value, dimensions"] },
          { name: "Dashboard", description: "A named collection of widgets shown to users.", fields: ["id, name", "widgets[]"] },
          { name: "Widget", description: "One chart/number on a dashboard, backed by a rollup query.", fields: ["id, dashboard_id", "metric_query", "refresh_interval"] },
          { name: "WatermarkState", description: "Tracks how far a stream's windows have been finalized, admitting late events within a grace period.", fields: ["stream_id", "current_watermark", "last_updated"] },
        ],
        keyPoints: [
          {
            point: "Never query raw events for a dashboard — pre-aggregate in the stream processor into rollups (per minute/hour) and query those; raw-event scans don't scale to 'second-level' latency requirements",
            example: "Mixpanel and Amplitude both compute pre-aggregated hourly/daily rollups during ingestion specifically so dashboard queries never scan raw event tables directly.",
            bestApproach: "Design the stream processor's windowed aggregation as the only thing dashboards ever query — keep raw events in cold storage purely for reprocessing, never for live reads.",
          },
          {
            point: "Two storage tiers solve two different needs: OLAP store (ClickHouse/Druid) for fast recent rollups, cold object storage (S3/Parquet) for cheap long-term raw retention and metric redefinition",
            example: "A team that needs to redefine 'active user' a year later can reprocess raw S3/Parquet events with the new definition — impossible if only pre-aggregated rollups were kept.",
            bestApproach: "Always retain raw events in cheap cold storage even after computing rollups — the rollup definition will eventually need to change, and only raw data supports that.",
          },
          {
            point: "Watermarks (a grace period before finalizing a time window) are mandatory — without them, a slightly-late event either gets dropped or corrupts an already-finalized aggregate",
            example: "A mobile client that was offline for 3 minutes sends delayed events that a watermark-aware window can still admit before finalizing, rather than silently dropping them.",
            bestApproach: "Set the watermark grace period based on observed client-side delay distribution (e.g., p99 mobile event delay), not an arbitrary default — too short drops real data, too long delays finalization.",
          },
          {
            point: "Reserve a separate in-memory counter path (Redis) only for the few truly sub-5-second 'live count' widgets — running the whole pipeline at that latency for everything is unnecessary cost",
            example: "A 'live viewers right now' counter on a streaming event uses a direct Redis INCR/DECR path, bypassing the minutes-latency stream-processing pipeline entirely.",
            bestApproach: "Identify the handful of genuinely real-time widgets explicitly and build them a separate, simple counter path — don't force the whole analytics pipeline to meet their latency bar.",
          },
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
          detailed: [
            "Authentication: a central Identity Service handles login (password + MFA, or SSO via SAML/OIDC against an enterprise IdP like Okta), and on success issues a short-lived JWT access token (5-15 min TTL) plus a longer-lived refresh token (stored securely, often httpOnly cookie).",
            "The JWT is signed (RS256) so any downstream service can verify it locally using a public key — no network call back to the identity service per request, which is what makes this scale.",
            "Refresh tokens are stored server-side (Redis or DB) so they can be revoked (e.g., on logout or compromise) — access tokens can't be revoked before expiry, which is exactly why their TTL is kept short.",
            "Authorization: two common models — RBAC (Role-Based: user has roles, roles have permissions — simple, fast, but coarse) and ABAC/ReBAC (Attribute or Relationship-Based: 'can user X edit document Y' depends on the relationship between X and Y, e.g., document owner or shared-with — needed for resource-level sharing like Google Drive).",
            "For ReBAC at scale, a dedicated authorization service (Google's Zanzibar is the reference architecture) stores relationship tuples (object, relation, subject) and answers 'check' queries with bounded staleness via a global logical clock, letting it scale to billions of objects without becoming a bottleneck for every single resource check.",
            "Services call this authorization service (or a local cache of recent decisions) rather than embedding permission logic themselves, keeping the policy centralized and auditable.",
          ],
        },
        entities: [
          { name: "User", description: "An account's core identity record.", fields: ["id, email", "password_hash", "mfa_enabled"] },
          { name: "AccessToken", description: "Short-lived signed JWT, verified locally by services — not stored, just issued.", fields: ["user_id, scopes[]", "exp", "signature (RS256)"] },
          { name: "RefreshToken", description: "Longer-lived, server-side-stored token that controls real session lifetime and revocation.", fields: ["id, user_id", "expires_at", "revoked"] },
          { name: "Role", description: "Coarse RBAC grouping of permissions.", fields: ["id, name", "permissions[]"] },
          { name: "RelationshipTuple", description: "Zanzibar-style fine-grained authorization edge for resource-level sharing.", fields: ["object — e.g. document:123", "relation — e.g. editor", "subject — e.g. user:456"] },
        ],
        keyPoints: [
          {
            point: "Authentication (who are you) and authorization (what can you do) are separate systems with separate scaling and revocation requirements — don't build one monolithic 'auth' service that does both",
            example: "A single 'AuthService' handling both login and 'can this user edit this document' checks becomes a bottleneck and a single point of failure for two very different concerns.",
            bestApproach: "Split identity (login, token issuance) from authorization (permission checks) into separate services or at least separate code modules from the initial design.",
          },
          {
            point: "Short-lived signed JWTs let every downstream service verify identity locally (no network round-trip) — the trade-off is they can't be revoked before expiry, so keep TTL short and put revocation power in the refresh token instead",
            example: "A 10-minute access token TTL bounds how long a stolen token remains useful, while the longer-lived refresh token (revocable server-side) controls the actual session lifetime.",
            bestApproach: "Set access token TTLs to the shortest value that doesn't create excessive refresh traffic (5-15 min is typical), and ensure refresh tokens are revocable via a server-side store.",
          },
          {
            point: "RBAC is fast and simple for coarse permissions (admin/editor/viewer); ReBAC (relationship-based, Zanzibar-style) is what you need for fine-grained resource sharing like 'this specific user can edit this specific document'",
            example: "Google Drive's 'share with specific people' feature can't be modeled by RBAC roles alone — it needs ReBAC relationship tuples like (document_X, editor, user_Y).",
            bestApproach: "Use RBAC for coarse, role-based access control and only introduce ReBAC once you have a genuine per-resource sharing requirement — don't build Zanzibar-style infrastructure prematurely.",
          },
          {
            point: "Centralize authorization decisions in one service/library even if you decentralize enforcement — scattering permission logic across services is how privilege-escalation bugs are born",
            example: "Two services independently reimplementing 'is this user an admin' checks can drift out of sync, creating a gap where one service grants access the other would have denied.",
            bestApproach: "Build a shared authorization library or sidecar that every service calls for permission checks, so the policy logic exists in exactly one place even though enforcement is distributed.",
          },
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
          detailed: [
            "A workflow is defined as a DAG: trigger node (webhook, schedule, event) feeding into a sequence/branch of action nodes (call API, transform data, conditional branch).",
            "The execution model is the crux of the design: a naive in-memory interpreter loses all progress if the worker process crashes mid-workflow. The durable approach (used by Temporal, AWS Step Functions, and internally by CI/CD engines) persists the execution state after every single step completes — not just at the end — to a workflow_execution_log (execution_id, step_id, status, output, completed_at).",
            "On crash/restart, the engine replays the log to reconstruct exactly where it left off and resumes from the next incomplete step, rather than restarting the whole workflow.",
            "Each action step must be idempotent (or the engine deduplicates via an idempotency key per step execution) because 'resume' inherently risks re-attempting a step whose effect already landed but whose completion record didn't get written before the crash.",
            "Long-running/async steps (wait for webhook callback, wait 24 hours) are modeled as the workflow suspending — the engine persists 'waiting for event X' and a separate dispatcher wakes it when that event arrives, rather than holding a thread/connection open for hours.",
            "Retries use exponential backoff with a max-attempt cap, and a dead-letter queue captures workflows that exhaust retries for human investigation. Branching/conditionals are evaluated against the step's output at execution time, so the DAG can have multiple possible paths defined once but only one taken per run.",
          ],
        },
        entities: [
          { name: "WorkflowDefinition", description: "The reusable DAG template a workflow execution is instantiated from.", fields: ["id, name, version", "steps[] — DAG nodes"] },
          { name: "StepDefinition", description: "One node in the DAG — an action, wait, or branch.", fields: ["id, workflow_id", "type — action | wait | branch", "config"] },
          { name: "WorkflowExecution", description: "One running instance of a WorkflowDefinition, with durably-checkpointed progress.", fields: ["id, workflow_id", "status, current_step_id", "started_at"] },
          { name: "ExecutionLog", description: "Append-only per-step completion record — the basis for crash-resume.", fields: ["execution_id, step_id", "status, output", "completed_at"] },
          { name: "Trigger", description: "What starts a workflow execution.", fields: ["workflow_id", "type — webhook | schedule | event", "config"] },
        ],
        keyPoints: [
          {
            point: "Persist execution state after every step (not just workflow completion) — this is what makes 'resume after crash' possible instead of forcing a full restart",
            example: "Temporal checkpoints state after every step transparently, so a worker crash mid-5-step workflow resumes from step 3, not from the very beginning.",
            bestApproach: "Write execution state to durable storage synchronously as part of completing each step, not asynchronously after-the-fact — a crash between 'step done' and 'state saved' loses the resume point.",
          },
          {
            point: "Every action step must be idempotent or deduplicated via a step-level idempotency key — a crash-and-resume model will occasionally re-attempt a step that already partially succeeded",
            example: "A 'charge customer' step that resumes after a crash might re-attempt a charge whose API call actually succeeded but whose completion record wasn't saved — idempotency keys prevent a double charge.",
            bestApproach: "Require every action-step implementation to accept and honor an idempotency key derived from the execution_id + step_id, enforced as a workflow-engine contract, not left to individual step authors.",
          },
          {
            point: "Long waits (webhook callback, scheduled delay) should suspend the workflow as persisted state, not hold a thread or connection open — a separate event dispatcher wakes the workflow later",
            example: "A workflow waiting 24 hours for a follow-up email doesn't hold a thread open — it persists 'waiting until timestamp T' and a scheduler wakes it when due.",
            bestApproach: "Model all waits (timers, webhook callbacks) as persisted suspension state with an external wake mechanism, never as a blocking sleep or held connection in a worker process.",
          },
          {
            point: "A dead-letter queue for workflows that exhaust retries is mandatory — silent infinite retry or silent failure are both unacceptable for something users built business processes on top of",
            example: "A workflow stuck retrying a permanently-broken third-party API call forever would silently waste resources with no one aware the underlying business process never completed.",
            bestApproach: "Cap retry attempts per step with exponential backoff, and route exhausted workflows to a monitored dead-letter queue with alerting, not a silent drop or infinite retry loop.",
          },
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
          detailed: [
            "Logs: each service writes structured (JSON) log lines locally; a lightweight agent (Fluentd/Filebeat/Vector) tails the log file and forwards to a buffered collector (often via Kafka, to absorb bursty write volume without losing logs if the indexing layer is briefly slow).",
            "An indexer consumes the buffer and writes to Elasticsearch with a time-based index strategy (one index per day, e.g., logs-2026-06-30) so old indices can be cheaply deleted/archived to meet retention policies, and so queries can be scoped to a time range without scanning the entire dataset.",
            "Metrics: services expose a /metrics endpoint (Prometheus-style) or push counters/gauges/histograms directly; a local agent scrapes/aggregates at fixed intervals (e.g., every 15s) BEFORE sending — this is the critical difference from logs, since sending every raw metric event would have catastrophic cardinality (a single counter incremented 10,000 times/sec must become one aggregated point per interval, not 10,000 rows).",
            "Aggregated points land in a time-series DB (Prometheus, InfluxDB, or M3) optimized for fast range-queries and downsampling (keep 15s resolution for a week, 5-min resolution for a year).",
            "Alerting: a rules engine evaluates metric queries on a schedule (e.g., 'p99 latency > 500ms for 5 consecutive minutes') and fires to an on-call system (PagerDuty) with deduplication so a flapping condition doesn't page someone 50 times.",
            "Cardinality control is the operational nightmare in practice — a label like user_id on a metric silently creates millions of unique time series and can take down the whole metrics backend, so label allowlisting/validation at the agent is a hard requirement, not a nice-to-have.",
          ],
        },
        entities: [
          { name: "LogEntry", description: "One structured log line, indexed into a time-bucketed index.", fields: ["id, service, level", "message, structured_fields", "timestamp"] },
          { name: "MetricDataPoint", description: "One pre-aggregated metric sample written to the time-series DB.", fields: ["metric_name", "labels — allowlisted only", "value, timestamp"] },
          { name: "AlertRule", description: "A scheduled query that fires to on-call when a condition holds.", fields: ["id, metric_query", "threshold, duration", "severity"] },
          { name: "Dashboard", description: "A saved collection of panels visualizing logs/metrics.", fields: ["id, name", "panels[]"] },
          { name: "AgentConfig", description: "Per-service collection settings for the local logging/metrics agent.", fields: ["service", "scrape_interval", "label_allowlist"] },
        ],
        keyPoints: [
          {
            point: "Logs and metrics need fundamentally different pipelines — logs are search-optimized (Elasticsearch, time-bucketed indices), metrics are aggregation-optimized (time-series DB, pre-aggregated before storage) — don't force one system to do both well",
            example: "Trying to store high-cardinality structured logs in Prometheus (a metrics-shaped TSDB) or trying to do fast full-text search in InfluxDB both fight the tool's core design.",
            bestApproach: "Run two purpose-built pipelines (Elasticsearch-family for logs, Prometheus-family for metrics) rather than picking one system and forcing both workloads through it.",
          },
          {
            point: "Buffer log ingestion through a queue (Kafka) so a slow or down indexer doesn't cause log loss or back-pressure on the application services producing logs",
            example: "An Elasticsearch cluster briefly overwhelmed during a traffic spike doesn't lose logs if Fluentd is buffering them in Kafka, which simply catches up once indexing recovers.",
            bestApproach: "Always place a durable buffer (Kafka or a local disk-backed queue) between log-shipping agents and the indexing backend, sized to absorb at least a few minutes of indexer downtime.",
          },
          {
            point: "Pre-aggregate metrics at the agent/collector before they hit the backend — sending every raw event for a high-frequency counter creates catastrophic write volume and cardinality",
            example: "A counter incremented 10,000 times/sec must become one aggregated point per 15-second scrape interval, not 10,000 individual rows shipped to the backend.",
            bestApproach: "Use a Prometheus-style pull/scrape model (or pre-aggregate at the StatsD agent) so the backend only ever receives already-aggregated data points, never raw per-event writes.",
          },
          {
            point: "Uncontrolled metric label cardinality (e.g., a user_id label) is the most common cause of a metrics backend falling over in production — validate/allowlist labels at ingestion",
            example: "Adding a user_id label to a request-count metric silently creates millions of unique time series, which can take down a Prometheus instance's memory entirely.",
            bestApproach: "Allowlist permitted label values (or label keys entirely) at the agent/collector level, rejecting or stripping unbounded-cardinality labels before they ever reach the metrics backend.",
          },
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
          detailed: [
            "Algorithms, ranked by what they actually solve: Fixed window (counter resets every N seconds) is simplest but has a boundary bug — a user can send 2x the limit by timing requests at the edge of two adjacent windows.",
            "Sliding window log (store a timestamp per request, count requests in the last N seconds) is accurate but memory-heavy at high volume. Sliding window counter (weighted average of current and previous fixed window) approximates sliding-log accuracy with fixed-window memory cost — good default.",
            "Token bucket (a bucket holds up to B tokens, refills at rate R/sec, each request consumes 1 token, request rejected if bucket empty) is the best choice when you want to allow bursts up to bucket size while still enforcing a long-term average rate — this is what most production rate limiters (Stripe, AWS API Gateway) actually use.",
            "Distributed enforcement: the bucket state (current token count, last refill timestamp) lives in Redis, not in-process — otherwise each of N API servers enforces its own independent limit, letting a client get N times the intended quota by hitting different servers.",
            "The check-and-decrement must be atomic to avoid a race where two concurrent requests both read '1 token left' and both proceed — implemented as a single Lua script executed atomically by Redis (EVAL), computing elapsed-time-based refill and decrementing in one round trip.",
            "Response: a rejected request gets HTTP 429 with a Retry-After header computed from the refill rate. For very high QPS, an optimization is to rate-limit at the edge/gateway (cheap, coarse) and again at the service level (precise, per-resource) rather than a single check trying to do both.",
          ],
        },
        entities: [
          { name: "Bucket", description: "Shared token-bucket state in Redis, keyed per client/route.", fields: ["key — e.g. user_id+route", "tokens", "last_refill_at"] },
          { name: "RateLimitPolicy", description: "Configured limit for a given route or tier.", fields: ["route", "limit, window_seconds", "burst_capacity"] },
          { name: "Client", description: "The rate-limited caller — a user or API key.", fields: ["id, tier", "custom_limits — nullable override"] },
          { name: "RateLimitDecision", description: "The per-request outcome, used to build the 429 response.", fields: ["key, allowed", "retry_after"] },
        ],
        keyPoints: [
          {
            point: "Token bucket allows controlled bursts up to a cap while enforcing a long-term average rate — this is the production-default algorithm for a reason; fixed-window has a real boundary-doubling bug",
            example: "Stripe's API rate limiter is token-bucket-like, allowing a short burst of requests after idle periods while still capping sustained throughput over time.",
            bestApproach: "Default to token bucket for public-facing APIs where legitimate clients sometimes need to burst (e.g., bulk imports), reserving sliding-window-counter for cases where bursts should never be allowed.",
          },
          {
            point: "Limiter state must live in a shared store (Redis) across all API server instances — per-instance in-memory counters let a client multiply their effective quota by the number of servers",
            example: "A client hitting 10 different API server instances behind a load balancer gets 10x the intended quota if each instance tracks its own in-memory counter independently.",
            bestApproach: "Centralize all rate-limit state in Redis (or another shared, fast store) from the first implementation — never start with in-memory counters 'for now' and plan to fix it later.",
          },
          {
            point: "The check-and-decrement operation must be atomic (Lua script / single Redis command) — doing a separate GET then SET creates a race condition under concurrent requests",
            example: "Two concurrent requests both reading '1 token left' via separate GET calls, then both decrementing, can both succeed when only one should have — exactly the race a Lua script prevents.",
            bestApproach: "Implement the check-and-decrement as a single atomic Redis Lua script (EVAL) from day one, never as separate read-then-write round trips, even under low traffic where the race seems unlikely.",
          },
          {
            point: "Return Retry-After on a 429 — it tells well-behaved clients exactly when to retry instead of hammering the limiter immediately",
            example: "Stripe's 429 responses include a Retry-After header, letting well-written client libraries back off automatically instead of retrying in a tight loop.",
            bestApproach: "Compute Retry-After from the actual token-bucket refill rate and include it on every 429 response — it's a small addition that meaningfully reduces retry storms from compliant clients.",
          },
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
          detailed: [
            "Class design: ParkingLot has many Floors; each Floor has many Spots (each Spot has a type: COMPACT/REGULAR/LARGE/HANDICAPPED and a status: FREE/OCCUPIED); a Vehicle has a type (MOTORCYCLE/CAR/TRUCK) and a license plate.",
            "On entry, a SpotAllocationStrategy (interface, so the policy is swappable — e.g., NearestSpotStrategy vs SameFloorPreferenceStrategy) finds a free, size-compatible spot — a motorcycle can park in any spot type, but a truck only fits LARGE. A Ticket is created (id, vehicle, spot, entry_time) and the spot is marked OCCUPIED.",
            "On exit, a FeeCalculator (also an interface — flat-rate vs per-hour vs progressive-rate strategies all implement it) computes the charge from (exit_time - entry_time) and the spot/vehicle type, a Payment is processed, and the spot is freed.",
            "Concurrency matters even in 'just OOD': two cars approaching the last free spot simultaneously must not both be allocated it — the spot's status transition (FREE → RESERVED → OCCUPIED) needs a DB-level row lock or an atomic compare-and-swap (UPDATE spots SET status='OCCUPIED' WHERE id=X AND status='FREE', check rows_affected).",
            "A real-time display ('floor 3: 12 spots free') is maintained as a denormalized counter per floor, decremented/incremented on each allocation/release rather than COUNT(*)-ing spots on every display refresh.",
            "Extensions interviewers often probe: reservations (pre-book a spot before arrival — needs a hold/expiry mechanism), EV charging spots (a spot subtype with extra constraints), and multiple entry/exit gates (each gate needs its own ticket-issuing terminal talking to the same shared spot inventory).",
          ],
        },
        entities: [
          { name: "Vehicle", description: "Abstract base for anything that can park; subclasses know their size requirement.", fields: ["id, license_plate", "type — car | motorcycle | truck"] },
          { name: "ParkingSpot", description: "One physical spot, tracked with an atomically-updated status.", fields: ["id, level_id", "type — size class", "status — free | occupied"] },
          { name: "Level", description: "A floor owning spots, maintaining an incremental free-spot counter.", fields: ["id, lot_id", "free_spot_count — incremental, not scanned"] },
          { name: "ParkingLot", description: "The entry point gates talk to; owns levels and exposes park/unpark.", fields: ["id, name", "levels[]"] },
          { name: "Ticket", description: "One parking session — the join point for fee calculation.", fields: ["id, vehicle_id, spot_id", "entry_time, exit_time"] },
        ],
        keyPoints: [
          {
            point: "Use a Strategy interface for spot allocation AND for fee calculation — interviewers are usually testing whether you decouple policy (which spot, what price) from structure (lot/floor/spot data model), not whether you hardcode one rule",
            example: "A mall wanting 'EV charging spots get priority allocation' should be a new SpotAllocationStrategy implementation, not a code change to ParkingLot's core logic.",
            bestApproach: "Identify the 2 genuinely variable policies in this problem (allocation, pricing) and isolate exactly those behind interfaces — resist over-applying Strategy to parts of the design that don't actually vary.",
          },
          {
            point: "Atomic spot-status transitions (compare-and-swap or DB row lock) are required even in a 'simple' OOD problem — two simultaneous arrivals for the last spot is the obvious race condition to call out",
            example: "Two cars approaching the last free spot simultaneously must not both be assigned it — an atomic `UPDATE spots SET status='OCCUPIED' WHERE id=X AND status='FREE'` with a rows-affected check prevents this.",
            bestApproach: "State this race condition out loud unprompted during the design, and show the specific atomic operation (CAS or row lock) that prevents it, rather than waiting for the interviewer to probe.",
          },
          {
            point: "Maintain a denormalized free-spot counter per floor rather than COUNT(*) querying spots on every display refresh — small detail, but shows you think about read-heavy access patterns",
            example: "A digital sign showing 'Floor 3: 12 spots free' reads a single integer counter instead of scanning and counting hundreds of spot rows on every refresh.",
            bestApproach: "Increment/decrement a per-floor free-spot counter atomically alongside every park/unpark operation, and have the display read that counter directly rather than computing it on demand.",
          },
          {
            point: "A Ticket (not the Vehicle or Spot) is the right place to record entry_time — it's the natural join point for fee calculation and decouples vehicle/spot lifecycle from a specific parking session",
            example: "Storing entry_time on Ticket means a Vehicle that parks 5 separate times has 5 separate Tickets, each with its own clean fee calculation, rather than overloading Vehicle with session-specific state.",
            bestApproach: "Model each parking visit as its own Ticket entity from the start — resist the temptation to store session-specific fields directly on the longer-lived Vehicle or Spot entities.",
          },
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
          detailed: [
            "Step 1 — identify entities and relationships from the domain (the obvious part: User, Order, Product, etc., with 1:1/1:N/N:M relationships).",
            "Step 2 — and this is the part juniors skip — list the actual queries the application needs to run, with rough frequency and latency requirements ('get a user's last 20 orders, p99 < 50ms, called on every page load' vs 'generate a monthly revenue report, can take 30 seconds, run once a day'). This determines everything downstream.",
            "Step 3 — normalize to 3NF first to eliminate update anomalies and redundancy, then deliberately denormalize specific hot paths once you know which ones are hot (e.g., storing a denormalized order_total on the Order row instead of summing order_items on every read, accepting the small risk of drift in exchange for avoiding a join on the most frequent query in the system).",
            "Step 4 — choose storage engine based on query shape: relational (Postgres/MySQL) for data with strong relationships and multi-row transactional consistency needs; a document store (MongoDB) when most reads fetch one self-contained entity (a product page bundling reviews/specs) and joins are rare; a wide-column store (Cassandra) when you have very high write throughput and look up by a known key (time-series, event logs); a key-value store (Redis/DynamoDB) for pure lookups by primary key needing single-digit-ms latency.",
            "Step 5 — indexing: add an index for every column in a frequent WHERE/JOIN/ORDER BY clause, but no more — every index speeds reads and slows every write, so indexing 'just in case' has a real, ongoing cost.",
            "Step 6 — plan for scale before you need it conceptually (read replicas for read-heavy, then sharding strategy and shard key chosen specifically to keep the most frequent queries single-shard) even if you don't implement it on day one.",
          ],
        },
        entities: [
          { name: "Table", description: "A normalized relation — the default starting point before any denormalization.", fields: ["name", "columns[]", "primary_key"] },
          { name: "Index", description: "An access-path structure justified by a specific frequent query, not added speculatively.", fields: ["table, columns[]", "type — btree | hash | gin"] },
          { name: "AccessPattern", description: "A documented query the schema must serve, with its frequency and latency target.", fields: ["description", "read_or_write", "frequency, latency_target"] },
          { name: "ShardKey", description: "The column chosen to partition a table once it outgrows a single node.", fields: ["table, key_column", "strategy — range | hash | directory"] },
        ],
        keyPoints: [
          {
            point: "Query patterns, not entity relationships alone, should drive schema decisions — the same ER diagram can justify wildly different physical designs depending on read/write frequency and latency needs",
            example: "An identical User-Order-Product ER diagram could be implemented as a normalized Postgres schema for a B2B admin tool or a denormalized DynamoDB single-table design for a high-traffic consumer app.",
            bestApproach: "Write your top 5-10 actual queries (with rough frequency) before drawing any schema — let those queries, not the conceptual entity diagram, drive the physical design.",
          },
          {
            point: "Normalize first (3NF, eliminates anomalies), then denormalize deliberately and only for proven hot paths — premature denormalization recreates update-anomaly bugs for no measured benefit",
            example: "Denormalizing a customer's address onto every order row before measuring whether the join is actually slow just creates N places that data can drift out of sync, with zero proven benefit.",
            bestApproach: "Ship the normalized version first, measure real query performance under realistic load, and denormalize only the specific paths that profiling proves are bottlenecks.",
          },
          {
            point: "SQL vs NoSQL is a query-shape decision, not a popularity contest: relational for multi-entity transactional consistency, document for self-contained-entity reads, wide-column for high-throughput key-based writes, key-value for pure latency-critical lookups",
            example: "Discord moved from MongoDB to Cassandra to ScyllaDB specifically because their actual access pattern (append-heavy, partitioned by channel) matched a wide-column store, not because NoSQL was trendier.",
            bestApproach: "Name the specific access pattern that justifies your database family choice in any design discussion — 'NoSQL is more scalable' alone should be treated as an incomplete answer.",
          },
          {
            point: "Every index has a cost on every write — justify each one against an actual frequent query, don't index speculatively",
            example: "Adding 8 indexes to a frequently-written orders table 'just in case' can slow down every INSERT/UPDATE noticeably while only 2 of those indexes are ever actually used by real queries.",
            bestApproach: "Review your database's slow-query log or query planner output periodically and drop indexes with zero or near-zero usage — treat unused indexes as technical debt, not free insurance.",
          },
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
          detailed: [
            "Core data structures: the snake's body is a Deque<Point> (double-ended queue) ordered head-to-tail; a parallel HashSet<Point> mirrors the same cells purely for fast 'is this cell occupied by the snake' lookups, since checking 'does the new head position collide with the body' by scanning a list is O(n) but a hash set lookup is O(1) — this duplication (deque + set, kept in sync on every move) is the key insight interviewers look for.",
            "Movement: on each tick, compute newHead = currentHead + directionVector; check boundary collision (newHead outside grid) and self-collision (newHead in the body hash set, with a subtle exception — if newHead equals the current tail position AND the snake isn't eating this tick, it's not a collision, because the tail is about to move away) — both are game-over conditions.",
            "If newHead matches the food's position: push newHead to the deque and hash set without popping the tail (snake grows), then spawn new food at a random empty cell (validated against the occupied-set so food never spawns on the snake). Otherwise: push newHead, then pop and remove the old tail from both structures (snake moves without growing).",
            "Food spawning at a guaranteed-empty cell on a near-full board needs care — for a grid that's mostly full, repeatedly generating random coordinates and checking 'is it free' degrades badly; better to maintain a set/list of currently-free cells and pick uniformly from that.",
            "Game loop runs on a fixed-interval timer (e.g., setInterval at a speed that may increase as score grows), re-rendering only the changed cells (old tail cleared, new head drawn) rather than redrawing the entire board each tick for performance.",
          ],
        },
        entities: [
          { name: "Snake", description: "The player entity — a deque of cells plus a mirrored hash set for O(1) collision checks.", fields: ["body — Deque<Cell>, head to tail", "occupied — HashSet<Cell>, kept in sync", "direction"] },
          { name: "Cell", description: "A single grid coordinate.", fields: ["x, y"] },
          { name: "Food", description: "The current target the snake grows by eating.", fields: ["position — Cell", "spawned_at"] },
          { name: "Board", description: "The grid, tracking free cells for fast food spawning.", fields: ["width, height", "free_cells — Set<Cell>"] },
          { name: "GameState", description: "Top-level run state driving the game loop.", fields: ["status — running | game_over", "score", "tick_interval"] },
        ],
        keyPoints: [
          {
            point: "Deque + HashSet kept in sync is the core trick — deque gives O(1) head-push/tail-pop for movement, hash set gives O(1) self-collision checks instead of an O(n) scan through the body",
            example: "Checking 'does the new head hit the body' via a 500-cell linear scan vs a single hash-set lookup is the difference between an O(n) and O(1) operation, every single tick.",
            bestApproach: "Maintain both structures in lockstep on every move (push/pop the deque, add/remove the same coordinate from the set) so neither ever drifts out of sync with the other.",
          },
          {
            point: "The tail cell is a collision exception: a new head landing exactly on the current tail is safe (not a collision) because the tail vacates that cell in the same tick, unless the snake just ate and the tail isn't moving",
            example: "A snake moving into the cell its own tail currently occupies is fine, since the tail moves away in the same tick — but this exception breaks if the snake just ate and the tail stays put.",
            bestApproach: "Special-case the tail-cell check explicitly in your collision logic, conditioning it on whether the snake grew this tick — this exact edge case is what separates a working solution from a buggy one.",
          },
          {
            point: "Eating food = push head without popping tail (grows by one); normal move = push head AND pop tail (length constant) — this single conditional is the entire 'growth' mechanic",
            example: "LeetCode's accepted solution to 'Design Snake Game' (#353) implements growth as exactly this one-line conditional around the tail-pop step.",
            bestApproach: "Isolate the entire growth mechanic into this single if/else around the pop step — resist the urge to track a separate 'length' or 'growing' flag that could drift out of sync with the deque's actual size.",
          },
          {
            point: "On a nearly-full board, maintaining an explicit free-cell set for food spawning avoids the random-rejection-sampling slowdown of repeatedly guessing occupied cells",
            example: "On a 90%-full board, randomly guessing coordinates and checking 'is it free' can take many rejected attempts before finding an open cell — an explicit free-cell set picks one in O(1).",
            bestApproach: "Maintain a set of currently-free cells (updated on every move/grow) and sample directly from it for food spawning, rather than rejection-sampling random coordinates against the occupied set.",
          },
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
          detailed: [
            "A support Ticket differs from a generic Jira issue in one crucial way: it carries SLA commitments tied to its state — e.g., 'first response within 1 hour of creation' and 'resolution within 8 business hours for Priority-1.' Model: Ticket(id, queue_id, priority, status, created_at, sla_policy_id); SLAClock(ticket_id, metric: FIRST_RESPONSE | RESOLUTION, target_at, paused_at NULLABLE, breached BOOLEAN).",
            "The clock pauses when a ticket enters a WAITING_ON_CUSTOMER status (you shouldn't be penalized for SLA while waiting on the reporter) and resumes on reply, which is the detail most naive designs miss.",
            "A scheduled job (or a delayed-message queue like SQS with per-message delay, or a min-heap of upcoming deadlines polled periodically) checks for clocks approaching/exceeding target_at and fires escalation events (notify manager, auto-reprioritize) — this must be efficient at scale (millions of open tickets), so indexing/querying by target_at with a covering index, or using a time-bucketed delay queue, beats a naive 'scan all open tickets every minute.'",
            "Auto-assignment: a routing engine assigns incoming tickets to an agent based on queue (which team owns this category), current load (agents with fewer open tickets get priority — round-robin or least-connections), and skill match (tagged skills vs ticket category) — implemented as a rules engine evaluated at ticket-creation time, falling back to an unassigned pool with manager-triggered manual assignment if no agent matches.",
            "Business-hours-aware SLA math (an 8-hour SLA submitted Friday at 5pm shouldn't breach over the weekend) requires a calendar service that converts wall-clock duration to business-hour duration per the support org's configured hours and holidays.",
          ],
        },
        entities: [
          { name: "Ticket", description: "A support request, carrying its own SLA policy reference.", fields: ["id, queue_id, priority", "status, created_at", "sla_policy_id"] },
          { name: "SLAClock", description: "A pausable timer tracking one SLA commitment for a ticket.", fields: ["ticket_id, metric — first_response | resolution", "target_at, paused_at", "breached"] },
          { name: "Queue", description: "A team-owned bucket tickets are routed into.", fields: ["id, name", "owning_team"] },
          { name: "Agent", description: "A support rep eligible for auto-assignment.", fields: ["id, skills[]", "current_load"] },
          { name: "EscalationEvent", description: "Fired when an SLA clock approaches or exceeds its target.", fields: ["ticket_id", "triggered_at, reason"] },
        ],
        keyPoints: [
          {
            point: "SLA clocks are first-class objects with their own pause/resume semantics (pausing while WAITING_ON_CUSTOMER) — this is the detail that separates a real support-ticketing design from a generic issue tracker",
            example: "A ticket waiting 3 days for the customer to reply shouldn't count those 3 days against the agent's resolution SLA — the clock pauses on WAITING_ON_CUSTOMER and resumes on reply.",
            bestApproach: "Model SLAClock as a separate entity with explicit pause/resume timestamps tied to status transitions, never as a simple created_at + duration calculation.",
          },
          {
            point: "Checking for SLA breaches must scale past 'a cron job scanning every open ticket' — index by target_at or use a delay queue so the check cost doesn't grow linearly with total open tickets",
            example: "A naive cron job scanning millions of open tickets every minute to find breaches becomes the system's biggest cost center as ticket volume grows.",
            bestApproach: "Index SLA clocks by target_at (or use a delayed-message queue like SQS with per-message delay) so checking for upcoming breaches is a cheap range query, not a full table scan.",
          },
          {
            point: "Auto-assignment is a rules engine evaluated at creation time (queue ownership + current agent load + skill match), with an explicit unassigned fallback — never silently drop a ticket no rule matches",
            example: "A ticket tagged with a skill no current agent has assigned should fall into a visible 'unassigned, needs manual review' queue, never silently disappear unrouted.",
            bestApproach: "Build the routing rules engine with an explicit, monitored fallback path for unmatched tickets, and alert when that fallback queue grows beyond a threshold.",
          },
          {
            point: "SLA timers must be business-hours-aware, not wall-clock — an 8-hour SLA submitted Friday evening should land Monday, not over the weekend; this needs an explicit calendar/holiday service",
            example: "Zendesk and Jira Service Management both implement business-hours-aware SLA math specifically so a Friday-evening ticket's 8-hour clock doesn't silently breach over the weekend.",
            bestApproach: "Build a dedicated calendar/business-hours service (per support org's configured hours and holidays) that all SLA math routes through, rather than doing raw wall-clock arithmetic.",
          },
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
          detailed: [
            "Code generation, two approaches: (1) Counter-based — a centralized (or sharded-range) auto-incrementing ID, base62-encoded (a-z, A-Z, 0-9) into a short string — id 125 encodes to a few characters, guarantees uniqueness by construction, no collision handling needed, but requires coordinating ID allocation (e.g., pre-allocate ranges of IDs to each app server so they don't need a synchronous call per request).",
            "(2) Hash-based — MD5/SHA hash of the long URL, take the first 7 characters — simpler conceptually but needs collision detection (check if that code already maps to a different URL; if so, append a salt and rehash) and doesn't guarantee uniqueness for free. Most production systems prefer counter-based for its collision-free guarantee.",
            "Storage: a simple key-value table/store (short_code → long_url, created_at, expiry, click_count) — this is an ideal fit for a key-value store (DynamoDB) or a simple indexed relational table, since lookups are always by exact primary key, never by range or complex query.",
            "Read path dominates by orders of magnitude (every redirect is a read; creation is rare by comparison) — so a Redis cache in front of the DB, populated on first access or pre-warmed for known-popular links, absorbs the vast majority of redirect traffic and keeps DB load low.",
            "Redirect status code matters: 301 (permanent) lets browsers cache the redirect and skip your server on repeat visits — great for server load, terrible if you need accurate click analytics; 302 (temporary) forces every click through your server, giving you complete click tracking at the cost of more redirect traffic to handle.",
            "Custom aliases and expiry are straightforward additions on top of the same schema. At billions-of-URLs scale, the underlying table is sharded by short_code's hash (consistent hashing) so no single node holds a disproportionate fraction of keys.",
          ],
        },
        entities: [
          { name: "ShortUrlMapping", description: "The core key-value record — exact-match lookup only.", fields: ["short_code — primary key", "long_url", "created_at, expiry"] },
          { name: "ClickEvent", description: "Logged on 302 redirects to power analytics — absent if pure 301 is used.", fields: ["short_code", "timestamp, referrer", "ip_hash"] },
          { name: "IDRange", description: "A pre-allocated counter range handed to one app server for collision-free local generation.", fields: ["server_id", "range_start, range_end"] },
          { name: "Account", description: "Optional owner for custom aliases.", fields: ["user_id", "custom_code, short_code"] },
        ],
        keyPoints: [
          {
            point: "Counter-based base62 encoding guarantees uniqueness by construction with no collision-handling complexity — prefer it over hash-based generation unless you have a specific reason not to coordinate ID allocation",
            example: "Pre-allocating ID ranges (e.g., server A gets IDs 1M-2M, server B gets 2M-3M) lets each app server generate unique base62 codes locally with zero coordination per request.",
            bestApproach: "Default to a counter-based key-generation service handing out pre-allocated ID ranges to app servers, avoiding both a single-counter bottleneck and hash collision handling.",
          },
          {
            point: "Reads (redirects) outnumber writes (shortens) by orders of magnitude — a cache (Redis) in front of the datastore is the single highest-leverage optimization, not a clever storage engine choice",
            example: "bit.ly's traffic is heavily Pareto-distributed — a small set of trending links accounts for most clicks, so a cache sized for the 'hot' subset absorbs the vast majority of redirect traffic.",
            bestApproach: "Add a Redis cache-aside layer for short_code lookups before optimizing anything else — it delivers the highest read-latency improvement for the least implementation effort.",
          },
          {
            point: "301 vs 302 is a real product decision, not a technical footnote: 301 reduces server load via browser caching but blinds you to repeat-click analytics; 302 gives full analytics at the cost of every click hitting your servers",
            example: "Choosing 301 means a user's second click on the same shortened link never reaches your server at all — the browser serves it from its own cache.",
            bestApproach: "Explicitly ask 'does the product need click analytics?' before defaulting to either redirect code — treat it as a product requirements question, not a default technical setting.",
          },
          {
            point: "The data access pattern (always exact-match lookup by short_code) makes this a textbook key-value store fit — no need for a relational database's join/query capabilities",
            example: "Every read is `GET short_code → long_url` with no joins or range queries ever needed — DynamoDB or any key-value store fits this access pattern perfectly.",
            bestApproach: "Name the access pattern (pure key lookup) explicitly when justifying a key-value store choice, rather than defaulting to a relational database out of habit.",
          },
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
          detailed: [
            "API contract: POST /notifications { event_type: 'order_shipped', user_id, data: { order_id, tracking_url } } — callers send semantic event data, never pre-rendered text. This indirection is the single most important design decision: it lets the notification team change wording, add a new language, or change which channel an event_type defaults to, without every calling service needing a deploy.",
            "Template system: each event_type maps to a TemplateSet (one template per locale per channel — push has a short title+body, email has subject+HTML body, SMS has a 160-char-budget plain text) stored with a version number; rendering substitutes {{data.fields}} into the template at send time.",
            "Preference center: NotificationPreference(user_id, event_category, channel, enabled) — granular enough that a user can disable marketing emails but keep security-alert emails, and the send path checks this table before dispatching to a given channel (with hard-coded exceptions for non-optional categories like security/legal notices, which bypass preference checks entirely by design).",
            "Delivery: the service itself doesn't necessarily talk to FCM/Twilio/SES directly — it can enqueue a rendered-message task to channel-specific delivery workers (this is the seam between 'notification service' and 'notification system' architecture), but the service's job ends at producing a correctly localized, correctly-targeted, preference-respecting message.",
            "Idempotency at the API boundary: callers pass an idempotency_key (often the business event's own ID) so retrying a failed HTTP call to /notifications never results in a duplicate send.",
            "Audit: every send attempt (rendered, suppressed-by-preference, failed) is logged for support/debugging ('why didn't this user get their order confirmation').",
          ],
        },
        entities: [
          { name: "NotificationEvent", description: "The API input — semantic event data, never pre-rendered text.", fields: ["event_type, user_id", "data — structured payload", "idempotency_key"] },
          { name: "Template", description: "Versioned per (event_type, locale, channel) — copy changes need no redeploy.", fields: ["event_type, locale, channel", "version, body"] },
          { name: "NotificationPreference", description: "Granular opt-in/opt-out, with non-optional categories hard-coded to bypass it.", fields: ["user_id, event_category", "channel, enabled"] },
          { name: "SendAttempt", description: "Audit log of every render+send, including suppressed-by-preference cases.", fields: ["event_id, channel", "status, rendered_at"] },
        ],
        keyPoints: [
          {
            point: "Calling services send semantic event data (event_type + structured payload), never pre-rendered text — this indirection is what lets wording/localization/channel-defaults change without redeploying every caller",
            example: "The order service sends `{event_type: 'order_shipped', data: {order_id, tracking_url}}` — the notification team can later rewrite the message copy without the order service ever deploying.",
            bestApproach: "Define the event-data contract (event_type + payload schema) as the API surface calling services integrate against, and treat the actual message text as an internal implementation detail of the notification service.",
          },
          {
            point: "Templates are versioned per event_type × locale × channel — email/push/SMS need fundamentally different formats (HTML body vs 160-char budget) from the same logical event",
            example: "An 'order_shipped' event renders as a full HTML email, a short push notification title+body, and a 160-character SMS — three different templates from one event.",
            bestApproach: "Store templates keyed by (event_type, locale, channel) in a versioned table, allowing copy/locale changes via a CMS-like flow rather than code deploys.",
          },
          {
            point: "Preferences are granular per (event_category, channel), with explicit hard-coded exceptions for non-optional categories (security, legal) that always bypass opt-out — silently respecting an opt-out on a fraud alert is a real security bug, not just a UX nitpick",
            example: "A user who's opted out of marketing emails should still receive a 'suspicious login detected' security alert — failing to hard-code this exception is a genuine security gap.",
            bestApproach: "Hard-code a non-optional flag on security/legal event categories at the schema level, enforced in code so no preference-check path can ever suppress them, even accidentally.",
          },
          {
            point: "Idempotency keys at the API boundary (not just in the delivery workers) prevent a caller's HTTP retry from producing a duplicate notification",
            example: "An order service retrying a timed-out call to `/notifications` (where the original request actually succeeded) without an idempotency key risks sending the same order-confirmation twice.",
            bestApproach: "Require an idempotency_key on every POST to the notification API, often the originating business event's own ID, checked before any processing begins.",
          },
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
          detailed: [
            "Topic & partitioning: a topic is split into P partitions, each an append-only log; a message's partition is chosen by hash(key) % P (or round-robin if no key) — this is why ordering is only guaranteed within a partition, not across the whole topic, and it's the single most important constraint to state explicitly, since most candidates wrongly assume global ordering.",
            "Producers choose a key that groups related messages (e.g., user_id) into the same partition specifically to get ordering where it matters.",
            "Replication: each partition has a leader broker and N-1 follower replicas; producers write to the leader, followers pull and replicate; a message is considered 'committed' once it's been replicated to a quorum (e.g., ISR — in-sync replica set) of followers, not just written to the leader — this is what survives a leader broker crashing immediately after a write.",
            "Consumer model: rather than the broker pushing to consumers (which requires tracking per-consumer state and slows down under a slow consumer), consumers pull and track their own offset (position) in each partition they read — this offset is itself stored durably (in a special internal topic, Kafka's actual approach) so a consumer can crash and resume from its last committed offset.",
            "Consumer groups: multiple consumer instances in a group split the partitions among themselves (each partition read by exactly one consumer in the group at a time) for parallel processing, while multiple distinct groups can each independently read the entire topic from their own offset — this is what lets the same event stream serve both a real-time analytics consumer and a slower batch-archival consumer without either affecting the other.",
            "Storage: logs are append-only and segmented into files; old segments are deleted/compacted per a configured retention policy (time-based or size-based), and sequential disk I/O for both writes (append) and reads (mostly sequential scan from an offset) is what gives a log-based design dramatically higher throughput than a random-access database for this workload.",
          ],
        },
        entities: [
          { name: "Topic", description: "A named, partitioned, replicated append-only log.", fields: ["name", "partition_count", "retention_policy"] },
          { name: "Partition", description: "One ordered shard of a topic — the unit of ordering and parallelism.", fields: ["topic, partition_id", "leader_broker, replica_set (ISR)"] },
          { name: "Message", description: "One record in a partition, addressed by offset.", fields: ["partition, offset", "key, value, timestamp"] },
          { name: "ConsumerGroup", description: "A set of consumers splitting a topic's partitions for parallel processing.", fields: ["group_id, topic", "member_consumers[]"] },
          { name: "ConsumerOffset", description: "Durably-tracked read position per group per partition — enables crash-resume.", fields: ["group_id, partition", "committed_offset"] },
        ],
        keyPoints: [
          {
            point: "Ordering is guaranteed only within a partition, never across an entire topic — producers must choose a partition key deliberately for any messages that need relative ordering",
            example: "Keying messages by user_id ensures all of one user's events land in the same partition and are processed in order, while different users' events may interleave across partitions freely.",
            bestApproach: "Choose the partition key based on which entities need relative ordering preserved, and explicitly document that cross-key ordering is never guaranteed.",
          },
          {
            point: "A write is 'durable' only once replicated to a quorum of followers, not merely written to the leader — acknowledging too early loses messages on a leader crash",
            example: "Kafka's acks=all setting waits for the in-sync replica set to acknowledge before confirming a write, so a leader crash immediately after doesn't silently lose that message.",
            bestApproach: "Configure producer acknowledgment level (acks=all for critical data) explicitly based on the data's durability requirements, rather than accepting the client library's default.",
          },
          {
            point: "Pull-based consumption with consumer-tracked offsets (not broker-pushed delivery) keeps the broker simple and lets slow consumers fall behind without affecting others or requiring the broker to track per-consumer state",
            example: "A slow batch-analytics consumer reading from an hour-old offset doesn't slow down a real-time consumer reading from the latest offset on the same topic.",
            bestApproach: "Design consumers to track and durably persist their own offset (committing only after successful processing) so a consumer crash resumes from the last safely-processed point.",
          },
          {
            point: "Consumer groups parallelize work (each partition read by one consumer in the group) while independent groups can each replay the whole stream from their own offset — this dual model is what supports many different downstream use cases off one event stream",
            example: "LinkedIn's page-view topic is read in parallel by a search-indexing consumer group and independently, in full, by a separate analytics consumer group — neither affects the other.",
            bestApproach: "Use one consumer group per independent downstream use case, and size each group's consumer count to match its target partition count for full parallelism.",
          },
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
          detailed: [
            "Connection layer: each client holds a long-lived WebSocket to one of many chat servers (load-balanced on connect); a routing table (Redis: user_id → server_id) tracks which server each online user is currently connected to — this is essential because the sender and recipient are very likely connected to different physical servers.",
            "Sending a message: client → sender's chat server → message is persisted (write to a message store, partitioned by conversation_id) → server looks up recipient's server_id in the routing table → if recipient is online, publish to a pub/sub channel that the recipient's chat server subscribes to, which then pushes over that recipient's WebSocket; if offline, skip the push and rely on the persisted message being delivered on next reconnect (chat history fetch).",
            "Delivery status (sent → delivered → read) is modeled as a small state machine per message per recipient (important for group chats — one message has a distinct delivery state per group member): 'sent' is set once persisted; 'delivered' is set when the recipient's client ACKs receipt over the WebSocket; 'read' is set when the recipient's client reports the message entered view. These ACKs flow back through the same server-to-server pub/sub path in reverse.",
            "Group chat fan-out: a message to a 200-person group is NOT fanned out to 200 individual rows at send time for huge groups — instead, store one message row plus per-recipient delivery-status rows lazily created/updated as ACKs arrive, avoiding a 200x write amplification on every single group message.",
            "Message storage is typically a wide-column store (Cassandra) partitioned by conversation_id and clustered by timestamp, since the dominant query is 'give me the last N messages in this conversation' — a perfect fit for that access pattern.",
            "Presence (online/offline/last-seen) is ephemeral state in Redis with a TTL/heartbeat, separate from message delivery entirely.",
          ],
        },
        entities: [
          { name: "Conversation", description: "A 1:1 or group thread.", fields: ["id, type — 1:1 | group", "member_ids[]"] },
          { name: "Message", description: "One sent message, persisted before fan-out.", fields: ["id, conversation_id", "sender_id, content", "sent_at"] },
          { name: "DeliveryStatus", description: "Per-message-per-recipient state — critical for group chats.", fields: ["message_id, recipient_id", "status — sent | delivered | read", "updated_at"] },
          { name: "ConnectionRouting", description: "Live mapping of which chat server a user is currently connected to.", fields: ["user_id, server_id", "connected_at"] },
          { name: "PresenceState", description: "Ephemeral online/offline/last-seen status, separate from message delivery.", fields: ["user_id", "status — online | offline", "last_seen"] },
        ],
        keyPoints: [
          {
            point: "A routing table mapping user_id → connected-server-id is the backbone of multi-server chat — without it, there's no way to deliver a message to a recipient connected to a different physical server than the sender",
            example: "A message from a user on chat-server-3 to a recipient connected to chat-server-7 routes through a Redis lookup (user_id → server_id) and a pub/sub hop between the two servers.",
            bestApproach: "Maintain the routing table in a fast, shared store (Redis) updated on every connect/disconnect, and treat it as the single source of truth for 'who's connected where' across the fleet.",
          },
          {
            point: "Delivery status (sent/delivered/read) is per-message-per-recipient, not per-message — this matters enormously for group chats where 200 people have 200 independent delivery states for one message",
            example: "In a 200-person group, one message can be 'read' by 50 members, 'delivered' to 100 more, and just 'sent' to the rest — 200 independent states from one message.",
            bestApproach: "Model delivery status as a separate (message_id, recipient_id) → status record, not a single field on the message, especially for group conversations.",
          },
          {
            point: "For large groups, avoid writing N delivery-status rows eagerly at send time — create/update them lazily as ACKs actually arrive, or fan-out cost dominates at scale",
            example: "Eagerly writing 200 delivery-status rows for every message in a 200-person group multiplies write volume 200x — lazy creation on actual ACK avoids this entirely.",
            bestApproach: "Create delivery-status records only when a recipient's client actually ACKs (delivered/read), rather than pre-creating a 'sent' row for every group member at send time.",
          },
          {
            point: "Message storage access pattern (recent messages in one conversation, time-ordered) is a textbook wide-column-store fit (Cassandra partitioned by conversation_id) — far better than a relational table for this specific query shape",
            example: "WhatsApp-scale message storage favors a wide-column store partitioned by conversation_id and clustered by timestamp, matching the dominant 'last N messages in this chat' query exactly.",
            bestApproach: "Partition message storage by conversation_id with timestamp as the clustering key from the start — this single schema decision directly optimizes the system's most frequent query.",
          },
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
          detailed: [
            "Job definition: Job(id, schedule — either a one-off run_at timestamp or a cron expression, next_run_at, status: PENDING/CLAIMED/RUNNING/SUCCEEDED/FAILED, payload, retry_policy).",
            "Scheduling loop: rather than one centralized scheduler process (a single point of failure and a throughput ceiling), run multiple identical scheduler instances that each periodically poll the DB for jobs WHERE next_run_at <= NOW() AND status = 'PENDING' — but if two instances poll at the same moment, both could see the same due job.",
            "The fix is an atomic claim: UPDATE jobs SET status='CLAIMED', claimed_by=instance_id WHERE id=X AND status='PENDING' and only proceed if the update actually affected a row (rows_affected = 1 means this instance won the race; 0 means another instance already claimed it) — this turns 'multiple schedulers' from a double-execution risk into a horizontal scaling feature.",
            "Execution: the claiming scheduler doesn't run the job inline — it pushes a task to an execution queue consumed by a separate worker pool, so a job that takes 10 minutes doesn't block that scheduler instance from claiming and dispatching the next thousand due jobs.",
            "Crash recovery: if a worker crashes mid-execution, the job is stuck in RUNNING — a reaper process periodically finds jobs RUNNING for longer than their expected max duration and requeues them (with a retry-count check to avoid infinite reprocessing of a poison-pill job). Retry policy: exponential backoff with jitter, configurable max attempts, then move to a dead-letter status for manual inspection.",
            "Recurring jobs: after a cron-scheduled job completes, the scheduler computes the next next_run_at from the cron expression and resets status to PENDING — never executes 'the next occurrence' eagerly, since that would require tracking unbounded future instances. At very high job volume, the 'poll the whole jobs table' step itself needs a covering index on (status, next_run_at) or, beyond a few million rows, a time-bucketed priority structure so the scan stays cheap regardless of total job count.",
          ],
        },
        entities: [
          { name: "Job", description: "A scheduled or one-off unit of work.", fields: ["id, schedule — cron | run_at", "next_run_at, status", "payload, retry_policy"] },
          { name: "JobExecution", description: "One claimed run of a job, atomically owned by a single scheduler/worker.", fields: ["id, job_id", "status — claimed | running | succeeded | failed", "started_at, claimed_by"] },
          { name: "Worker", description: "A process pulling claimed jobs from the execution queue and running them.", fields: ["id, status", "current_job_id"] },
          { name: "DeadLetterEntry", description: "A job that exhausted retries, routed for manual inspection.", fields: ["job_id, failure_reason", "attempts, moved_at"] },
        ],
        keyPoints: [
          {
            point: "Multiple scheduler instances polling the same job table is safe (and a scaling feature, not a bug) ONLY if claiming a job is a single atomic conditional UPDATE — checking rows_affected, not a separate read-then-write",
            example: "Two scheduler instances polling at the exact same moment both see the same due job, but only one's `UPDATE ... WHERE status='PENDING'` actually affects a row — the other sees rows_affected=0 and moves on.",
            bestApproach: "Implement job claiming as a single atomic conditional UPDATE checked via rows_affected, never as a separate SELECT-then-UPDATE, regardless of how rare the race seems at low scheduler-instance counts.",
          },
          {
            point: "Scheduling (deciding a job is due) and execution (actually running it) must be separate concerns — a slow job must never block the scheduler loop from claiming the next thousand due jobs",
            example: "A scheduler instance that runs a 10-minute job inline can't claim and dispatch the next thousand due jobs during that window — dispatching to a separate worker pool avoids this entirely.",
            bestApproach: "Have the scheduler only claim and enqueue jobs to a worker pool, never execute them inline — keep the scheduling loop's per-job cost constant regardless of job duration.",
          },
          {
            point: "A reaper process for jobs stuck in RUNNING past their expected duration is mandatory — without it, a crashed worker silently loses a job forever with no automatic retry",
            example: "A worker that crashes mid-job leaves it stuck in RUNNING status forever unless a reaper process periodically finds jobs RUNNING past their expected max duration and requeues them.",
            bestApproach: "Run a periodic reaper checking for jobs RUNNING beyond their expected duration, requeuing them with a retry-count check to avoid infinitely reprocessing a genuinely broken job.",
          },
          {
            point: "Recompute a recurring job's next_run_at lazily after each completion, not by pre-generating future occurrences — pre-generating is unbounded and unnecessary work",
            example: "A daily job pre-generating the next 10 years of occurrences creates thousands of rows that may never run if the job definition changes — lazy computation avoids this waste entirely.",
            bestApproach: "Compute next_run_at from the cron expression only after the current occurrence completes, resetting status to PENDING — never pre-generate future job instances ahead of time.",
          },
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
