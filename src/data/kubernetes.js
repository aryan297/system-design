export const KUBERNETES_HLD = {
  title: "Docker & Kubernetes Platform — High Level Design",
  subtitle: "Container orchestration at scale — image registry & runtime, declarative control-plane reconciliation, scheduling & auto-scaling, networking, and a full Docker/Kubernetes observability (APM) stack",
  overview: `Docker and Kubernetes turned "run my application somewhere reliable" into a single declarative API. Underneath that simplicity sits a distributed system: containerd runtimes on thousands of nodes, an API server fronting a Raft-replicated key-value store (etcd), and a swarm of independent controllers that never stop comparing "what should be running" against "what is actually running."

The hard system-design problem isn't packaging an app into a container — it's DECLARATIVE STATE RECONCILIATION AT SCALE: every Deployment, Service, and ConfigMap a user submits is just a desired-state record in etcd. A web of controllers (Deployment, ReplicaSet, Node, HPA, ...) each watch a slice of that state, diff it against reality, and issue the minimal set of API calls to close the gap — repeatedly, forever, without coordinating with each other, and without ever assuming their last action succeeded.

On top of that core loop, three more hard problems compound: SCHEDULING is a continuous bin-packing problem — placing ~150K pods onto 5K nodes while respecting CPU/memory requests, affinity rules, taints, and topology spread, fast enough that a mass rollout doesn't stall. NETWORKING has to give every one of those pods a routable IP in a flat address space and then provide stable virtual IPs (Services) that keep working as pods are constantly created and destroyed underneath them. And OBSERVABILITY/APM has to work in a world where the unit of compute — a container — typically lives for minutes, not months: metrics, traces, and logs all have to be collected, labeled with the right pod/namespace/deployment metadata, and correlated BEFORE that container disappears and takes its identity with it.

This design walks the full stack: how a container image is built and distributed (Docker/OCI), how the control plane stores and reconciles desired state (Kubernetes core), how pods get placed and scaled, how traffic finds them, and — the section asked about most often in interviews — exactly how APM tooling (Prometheus, OpenTelemetry, Fluent Bit) instruments Docker containers running inside Kubernetes, in depth.`,

  metrics: [
    { label: "Worker nodes / cluster",  value: "5,000",        note: "across multiple AZs/regions" },
    { label: "Running pods / cluster",  value: "~150K",        note: "avg ~30 pods per node (max 110/node)" },
    { label: "Containers / cluster",    value: "~225K",        note: "app + sidecars (mesh, APM agent)" },
    { label: "API server QPS",          value: "~50K/sec",     note: "watch streams + status/lease writes" },
    { label: "etcd write latency",      value: "< 10ms p99",   note: "Raft-replicated, 3–5 member quorum" },
    { label: "Scheduling latency",      value: "< 1s p99",     note: "per pod — filter, score, bind" },
    { label: "Prometheus ingestion",    value: "~2M samples/s", note: "cAdvisor + kube-state-metrics + node-exporter" },
    { label: "Image pulls / day",       value: "1M+",          note: "across registry + per-AZ pull-through caches" },
  ],

  diagram: `
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                               │
│       kubectl / Helm / CI-CD Pipelines · Grafana & APM Dashboards       │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │  HTTPS / gRPC — kubectl apply, image pull (OCI), watch stream, metrics scrape
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                kube-apiserver  (REST API + Watch Stream)                │
│         SERVICE MESH — Envoy sidecar attached to every service          │
│       AuthN (RBAC) · Admission Webhooks · API Priority & Fairness       │
│      mTLS · Load Balancing · Retries · Circuit Breaking · Tracing       │
└──────────┬────────────┬────────────┬────────────┬────────────┬──────────┘
           │            │            │            │            │
           ▼            ▼            ▼            ▼            ▼
     ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
     │ Registry │ │Scheduler │ │Controller│ │ Network  │ │   APM    │
     │ Service  │ │ Service  │ │ Manager  │ │  (CNI)   │ │  Agent   │
     └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
           │            │            │            │            │
           ▼            ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             KAFKA EVENT BUS                             │
│ pod.scheduled · pod.running · node.notready · hpa.scaled · alert.fired  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                               DATA LAYER                                │
│      etcd (cluster state) · Prometheus TSDB (metrics, time-series)      │
│    Loki / Elasticsearch (logs) · OCI Registry / S3 (images & layers)    │
└─────────────────────────────────────────────────────────────────────────┘`,

  phases: [
    {
      id: "phase1",
      label: "Phase 1",
      title: "Container Runtime & Image Management",
      sections: [
        {
          title: "Docker Images, Layers & the OCI Registry",
          content: `A container image is NOT a single file — it's a manifest (JSON) pointing at a config blob and an ORDERED LIST OF LAYER BLOBS, each a gzipped tarball, each named by the SHA-256 digest of its own contents (content-addressed storage, defined by the OCI Image Spec). At runtime, an overlay filesystem (overlayfs) stacks the read-only image layers and adds one writable "container layer" on top — this is why starting a container is fast (no copying) and why "docker commit" only ever captures that thin top layer.

PUSH/PULL — REGISTRY HTTP API V2:
  PUSH: for each layer, the client sends a HEAD request for its digest —
  if the registry already has a blob with that digest (from ANY image,
  ANY user), the upload is skipped entirely. This is GLOBAL, CONTENT-
  ADDRESSED DEDUPLICATION: a "FROM node:20-alpine" base layer used by
  10,000 different application images is stored exactly once.
  PULL: the client resolves a TAG (e.g. "checkout-service:v42", a mutable
  pointer) to a MANIFEST DIGEST (immutable), then downloads each layer
  blob it doesn't already have cached locally, then unpacks them into
  overlayfs snapshots in order.

WHY LAYER ORDERING MATTERS (BUILD CACHE):
  Each Dockerfile instruction produces one layer, cached by the hash of
  (parent layer + instruction + build context). Ordering instructions
  from LEAST-often-changed to MOST-often-changed — install OS packages,
  then language dependencies (package.json / requirements.txt), then
  application source — means a source-code change only invalidates the
  final layer; the dependency layers (often 90%+ of image size) are
  reused from cache on every build.

MULTI-STAGE BUILDS:
  A Dockerfile can have multiple FROM stages — compilers, build tools,
  and source code live in an early stage; only the COMPILED ARTIFACT is
  COPY'd into a minimal final-stage base image (e.g. "distroless" or
  "alpine"). The build toolchain never ships to production, shrinking the
  image that actually has to be pulled onto 5,000 nodes.

REGISTRY AS A SCALE PROBLEM, NOT JUST STORAGE:
  Every node pull is a multi-hundred-MB-to-multi-GB read. A single origin
  registry serving 5,000 nodes directly — especially during a Cluster
  Autoscaler scale-up burst (Phase 1's estimation below) — saturates
  cross-region links. The registry is therefore fronted by PER-AZ PULL-
  THROUGH CACHES: a local cache that proxies to the origin on first miss,
  then serves every subsequent pull in that AZ from local storage.

SUPPLY-CHAIN GATE:
  On push, an image scanner (Trivy/Clair-style) inspects every layer for
  known-CVE packages and writes a scan_status. Admission policy in the
  cluster (Phase 2) can refuse to schedule any pod whose image digest
  hasn't been marked PASSED — turning "don't run vulnerable images" from
  a process into an enforced invariant.`,
        },
        {
          title: "Container Runtime — containerd, CRI & the Pod Sandbox",
          content: `"Docker" and "Kubernetes" are not the same layer. kubelet (the per-node agent) never talks to Docker directly — it speaks the CONTAINER RUNTIME INTERFACE (CRI), a gRPC API implemented by containerd (or CRI-O). containerd in turn shells out to runc, the low-level OCI runtime that makes the actual clone()/unshare()/cgroup syscalls. Docker Desktop/Engine is itself just a friendlier wrapper around the same containerd.

THE POD SANDBOX — WHY CONTAINERS IN A POD SHARE AN IP:
  When kubelet creates a Pod, the FIRST thing CRI does is RunPodSandbox —
  this creates an infrastructure "pause" container whose only job is to
  hold open the Pod's NETWORK, IPC, and UTS namespaces. EVERY application
  container in that Pod is then created with "join the sandbox's
  namespaces" instead of creating its own — which is exactly why two
  containers in one Pod can reach each other on localhost and share one
  IP address. Killing and recreating an app container never disturbs the
  Pod's IP, because the pause container — not the app container — owns
  the network namespace.

ISOLATION PRIMITIVES — "WHAT YOU SEE" VS "HOW MUCH YOU GET":
  Linux NAMESPACES answer "what can this process see": PID (its own
  process tree), NET (its own interfaces/routes — or the sandbox's),
  MNT (its own filesystem view), UTS (hostname), IPC, USER (UID
  remapping for rootless containers).
  CGROUPS (v2) answer "how much can this process use": cpu.max (quota —
  hard throttling once exceeded), cpu.weight (relative shares under
  contention), memory.max (hit this and the kernel OOM-kills the
  CONTAINER, not the node), pids.max (fork-bomb protection).

IMAGE PULL TO RUNNING CONTAINER:
  containerd's snapshotter pulls each image layer (Phase 1, Section 1)
  and materializes it as an overlayfs snapshot; a final writable snapshot
  is created per container. containerd then generates an OCI runtime spec
  (config.json) — translating the Pod's resource requests/limits into
  cgroup paths, its securityContext into namespace/capability flags, its
  volumes into bind mounts — and hands that spec to runc, which performs
  the actual namespace/cgroup setup and execs the container's entrypoint.

PROBES RUN OUTSIDE THE CONTAINER:
  Liveness/readiness/startup probes are executed BY KUBELET itself (an
  HTTP GET, TCP dial, or exec into the container's namespace) — not by
  the runtime or the app. A failed liveness probe makes kubelet restart
  the container; a failed readiness probe removes the Pod's IP from every
  Service's EndpointSlice (Phase 4) WITHOUT restarting anything — the
  container keeps running, it's just taken out of rotation.`,
        },
        {
          title: "Back-of-the-Envelope Estimation",
          content: `ASSUMPTIONS:
  - 5,000 worker nodes, ~30 pods/node average (hard cap 110/node)
    -> ~150,000 running pods cluster-wide
  - ~1.5 containers/pod average (app + a sidecar — mesh proxy or APM
    agent — on roughly half of all pods) -> ~225,000 containers
  - etcd: 3–5 member Raft quorum (odd number, majority commit)

1. ETCD WRITE RATE:
   Every kubelet renews a Lease (node heartbeat) every 10s
   -> 5,000 nodes / 10s = 500 writes/sec just for liveness.
   Assume ~5% of all pods change phase/condition per minute under normal
   churn (deploys, restarts, OOM-kills, autoscaling)
   -> 150,000 * 0.05 / 60 ≈ 125 writes/sec.
   TOTAL ≈ 1,000–2,000 writes/sec including ConfigMap/Secret/Event churn
   -> well inside etcd's ~10K writes/sec ceiling at <10ms p99. The REAL
   ceiling at this scale isn't write throughput — it's etcd's DEFAULT 8GB
   DATABASE SIZE LIMIT, hit via object COUNT (especially un-TTL'd Events),
   forcing periodic compaction + defragmentation.

2. API SERVER QPS:
   Every kubelet and controller holds a long-lived WATCH connection
   (Phase 2) — not a poll loop. Steady QPS is dominated by periodic full
   resyncs (every ~30min per watcher by default) plus node heartbeats
   plus ad-hoc kubectl/CI traffic
   -> ~50K req/sec aggregate read+write across ~5,000 kubelets and
      hundreds of controller/operator replicas
   -> API server is stateless and horizontally scaled behind a load
      balancer, with a shared WATCH CACHE so N watchers don't mean N
      separate etcd reads.

3. SCHEDULING THROUGHPUT:
   A mass rollout (e.g. a 5,000-pod Deployment) floods the scheduler queue
   at once. percentageOfNodesToScore (default ≈ 50% − (nodes−50)/125,
   floored at 5%) means a 5,000-node cluster scores roughly 250–2,500
   nodes per pod, NOT all 5,000
   -> filter+score+bind stays < 1s p99 per pod
   -> ~100+ pods/sec scheduling throughput
   -> a 5,000-pod rollout schedules in well under a minute — it's IMAGE
      PULLS (next derivation), not the scheduler, that gate how fast pods
      actually reach Running.

4. PROMETHEUS INGESTION:
   cAdvisor exposes ~80–100 metrics per container, scraped every 15s
   -> 225,000 containers * 90 / 15 ≈ 1.35M samples/sec.
   + kube-state-metrics (~10 metrics * ~a few hundred thousand K8s
     objects, scraped every 30s) ≈ 100–150K samples/sec.
   + node-exporter (~1,000 host metrics * 5,000 nodes / 15s) ≈ 330K
     samples/sec.
   TOTAL ≈ ~2M samples/sec -> exceeds a single Prometheus instance's
   practical ceiling (~1–2M active series) -> forces FUNCTIONAL SHARDING
   (one Prometheus per team/namespace-group) remote-writing into a
   horizontally-scalable store (Thanos/Cortex/Mimir). This number is the
   central capacity-planning input for Phase 5's APM pipeline.

5. IMAGE PULL BURST:
   Cluster Autoscaler adds, say, 200 nodes during a traffic spike. Each
   new node needs ~5–8 unique images after layer dedup, ~300MB avg layer
   -> ~1.5–2.5GB/node -> 200 * ~2GB ≈ 400GB pulled inside the ~2–3 minute
   scale-up window -> ~2–3GB/sec sustained against the registry -> the
   per-AZ pull-through cache (Phase 1, Section 1 / registryService) exists
   specifically to absorb THIS burst locally instead of hammering the
   origin across a region.

INTERVIEW PUNCH LINE: "etcd's write QPS is almost never the bottleneck —
its DATABASE SIZE (default 8GB) and the API server's WATCH CACHE memory
are what you hit first at this scale; and Prometheus's bottleneck is never
disk throughput, it's ACTIVE SERIES CARDINALITY driven by per-pod labels."`,
        },
      ],
    },
    {
      id: "phase2",
      label: "Phase 2",
      title: "Kubernetes Control Plane — Declarative State Reconciliation",
      sections: [
        {
          title: "API Server, etcd & the Watch Model",
          content: `etcd is a distributed, Raft-replicated key-value store (3 or 5 members for quorum) holding EVERY object in the cluster under keys like /registry/pods/{namespace}/{name}, /registry/deployments/{namespace}/{name}, and so on. Every write goes through Raft consensus — the leader appends to its log, replicates to followers, and commits once a MAJORITY have acknowledged — which is why write latency scales with member count and payload size, not request rate.

THE API SERVER IS THE ONLY ETCD CLIENT:
  kubectl, controllers, kubelets, schedulers — NOTHING talks to etcd
  directly. They all go through kube-apiserver's typed, versioned REST
  API (with OpenAPI/CRD schemas). This single choke point is what makes
  RBAC, admission control, and audit logging possible at all.

OPTIMISTIC CONCURRENCY — resourceVersion:
  Every object carries a resourceVersion (etcd's mod-revision for that
  key). A client that wants to update an object must read it first (which
  returns its current resourceVersion) and submit that version with the
  write. If another writer changed the object in between, etcd's
  compare-and-swap fails -> API server returns 409 Conflict -> the client
  GETs the new version, re-applies its intended change, and retries. This
  is how THOUSANDS of independent controllers mutate shared objects
  without any distributed lock.

LIST + WATCH — THE EVENT MODEL EVERYTHING ELSE IS BUILT ON:
  A client first LISTs a resource (gets the current full set + a
  resourceVersion), then opens a WATCH from that resourceVersion. The API
  server streams every subsequent ADDED / MODIFIED / DELETED event (with
  occasional BOOKMARK events to checkpoint progress) over that same
  connection — fed by etcd's own internal watch/MVCC mechanism, fanned out
  to every interested watcher. This is why Kubernetes feels event-driven
  even though every controller is "just" running a reconcile loop
  (Section 2): the loop is TRIGGERED by watch events, not by polling.

THE ADMISSION CHAIN — WHERE POLICY AND SIDECAR INJECTION HAPPEN:
  Every write request passes through, in order:
  AuthN (who are you) -> AuthZ/RBAC (are you allowed this verb on this
  resource) -> MUTATING admission webhooks (can REWRITE the object — this
  is how the service mesh and OTel auto-instrumentation, Phase 5, inject
  sidecars/env-vars without the client knowing) -> schema validation ->
  VALIDATING admission webhooks (can only ACCEPT or REJECT, e.g. OPA/
  Gatekeeper enforcing "no image without a passing scan", Phase 1) ->
  persisted to etcd.

API PRIORITY AND FAIRNESS (APF):
  Protects the API server itself from the ~50K QPS derived in Phase 1.
  Requests are bucketed by FlowSchema into PriorityLevelConfigurations,
  each with its own queue and concurrency limit — so a runaway controller
  hammering LIST calls can be throttled into its own lane without ever
  delaying kubelet heartbeat renewals, which would otherwise cascade into
  false NotReady markings (Section 2).`,
        },
        {
          title: "Controllers & Reconciliation Loops — Self-Healing by Design",
          content: `Every built-in controller — and every custom Operator — implements the SAME generic pattern:

GENERIC CONTROLLER LOOP:
  informer = List+Watch(ResourceType)     — maintains a local cache; never
                                             re-reads etcd per reconcile
  on (Add/Update/Delete event):
    workqueue.Add(object.key)

  loop forever:
    key = workqueue.Get()
    obj    = informer.cache.Get(key)      — DESIRED state, from cache
    actual = observe_actual_state(obj)    — e.g. list Pods owned by this RS
    diff   = desired - actual
    if diff:
      take_corrective_action(diff)        — idempotent Create/Delete/Patch
    workqueue.Done(key)
    if error: workqueue.AddRateLimited(key)  — exponential backoff retry

LEVEL-BASED, NOT EDGE-BASED:
  A controller does NOT care WHY desired and actual diverged — a crash, a
  manual "kubectl delete pod", a node dying. It only acts on the CURRENT
  diff, and it re-evaluates on ANY relevant event PLUS a periodic full
  resync (Section 1). Miss an event entirely (a watch connection drops)
  and the next resync still converges the cluster — this is what
  "self-healing" actually means at the code level: there is no special
  "recovery" code path, just the same reconcile function running again.

DEPLOYMENT -> REPLICASET -> POD, AND THE ROLLING UPDATE:
  The Deployment controller owns ReplicaSets: a spec change creates a NEW
  ReplicaSet and scales the OLD one toward zero. The ReplicaSet controller
  owns Pods: it ensures exactly "replicas" Pods matching its selector
  exist, creating or deleting individual Pods as needed. The ROLLING
  UPDATE is just the Deployment controller incrementally adjusting both
  ReplicaSets' replica counts, bounded by:
    maxSurge       — extra Pods allowed ABOVE "replicas" during rollout
    maxUnavailable — how many Pods may be NotReady at once
  e.g. 100 replicas, maxSurge=25%, maxUnavailable=25% -> at most 125 Pods
  exist and at least 75 are Ready at any instant during the rollout.

NODE CONTROLLER — THE CANONICAL "SELF-HEALING" EXAMPLE:
  kubelet renews a Lease object every 10s (Phase 1's 500 writes/sec). If
  the API server sees no renewal for node-monitor-grace-period (default
  40s), it sets the Node's Ready condition to Unknown. After
  pod-eviction-timeout (default 5min) with no recovery, the Node
  controller EVICTS (deletes) every Pod on that node. Those Pods' owning
  ReplicaSets immediately notice "actual < desired" and create replacement
  Pods — which the scheduler (Phase 3) places on healthy nodes. No human
  intervention, no alert required for the cluster to recover capacity —
  though an alert (Phase 5) absolutely should fire so a human investigates
  the dead node itself.

HPA — A CONTROLLER FEEDING ANOTHER CONTROLLER:
  The HorizontalPodAutoscaler controller polls the metrics.k8s.io
  aggregated API every 15s, computes:
    desiredReplicas = ceil(currentReplicas * currentMetricValue / targetMetricValue)
  applies a stabilization window (default 5min for scale-DOWN, 0 for
  scale-UP, to avoid flapping on noisy metrics), and PATCHes the
  Deployment's spec.replicas — which simply re-enters the rolling-update
  loop above. HPA never touches Pods directly; it only ever changes a
  number that the Deployment/ReplicaSet controllers then act on.`,
        },
      ],
    },
    {
      id: "phase3",
      label: "Phase 3",
      title: "Scheduling, Bin-Packing & Auto-Scaling",
      sections: [
        {
          title: "Pod Scheduling — Filtering, Scoring & Bin-Packing",
          content: `kube-scheduler is itself just another controller: it watches for Pods with an empty spec.nodeName and, for each one, runs a two-phase pipeline against its cached view of all Nodes.

PHASE A — FILTER (predicates): eliminate every node that CANNOT run this
pod —
  - Allocatable CPU/memory/ephemeral-storage minus the sum of REQUESTS
    (not limits) of pods already bound there is >= this pod's requests
  - nodeSelector / nodeAffinity rules match the node's labels
  - the pod's tolerations cover every taint on the node (e.g. a GPU node
    tainted "nvidia.com/gpu=present:NoSchedule" only accepts pods that
    explicitly tolerate it)
  - requested hostPorts aren't already bound on that node
  - any PersistentVolume the pod needs is in a zone reachable from that
    node (volume topology)
  - PodAntiAffinity rules are satisfied (e.g. "never co-locate two
    replicas of this Deployment on the same node")

PHASE B — SCORE (priorities): rank the SURVIVING nodes 0–100 via weighted
plugins —
  - NodeResourcesFit: "LeastAllocated" favors emptier nodes (spreads
    load, more headroom for spikes); "MostAllocated" favors fuller nodes
    (packs tightly, leaving whole nodes empty for Cluster Autoscaler to
    remove — Section 2)
  - PodTopologySpreadConstraints: spreads a Deployment's replicas across
    zones/nodes for availability
  - ImageLocality: a node that ALREADY HAS the pod's image cached scores
    higher — directly reduces the pull burst from Phase 1
  - InterPodAffinity: e.g. "prefer nodes already running my cache
    sidecar's pod"

BIND: the highest-scoring node wins. The scheduler makes an OPTIMISTIC
Bind call (writes spec.nodeName via the API server) without locking the
node — if two scheduling decisions race onto the same now-insufficient
resources (rare, but possible with multiple scheduler profiles), kubelet
on that node rejects the pod and it's rescheduled, no different from any
other reconciliation failure (Phase 2).

SAMPLING AT SCALE — percentageOfNodesToScore:
  Scoring all 5,000 nodes for every pod would make scheduling latency
  scale with cluster size. Instead, the scheduler stops as soon as it has
  scored "enough" feasible nodes — by default roughly 50% minus
  (numNodes − 50) / 125, floored at 5%. At 5,000 nodes that's ~250–600
  nodes scored per pod, not 5,000 — trading a small optimality loss for
  the <1s p99 scheduling latency derived in Phase 1.

PREEMPTION:
  If NO node is feasible for a Pod with a high PriorityClass, the
  scheduler looks for a node where evicting one or more LOWER-priority
  Pods would make it feasible — and evicts them. This is how a
  business-critical rollout "jumps the queue" ahead of best-effort batch
  jobs without an operator manually killing anything.`,
        },
        {
          title: "Auto-Scaling — HPA, VPA & Cluster Autoscaler",
          content: `Three autoscalers operate independently, on different axes, watching different signals — and they CAN fight each other if combined carelessly.

HORIZONTAL POD AUTOSCALER (HPA):
  Adjusts spec.replicas based on average CPU/memory utilization OR
  custom/external metrics (via the Prometheus Adapter — e.g. queue depth,
  requests/sec). desiredReplicas = ceil(currentReplicas * currentMetric /
  targetMetric). Scale-UP applies no stabilization by default (react
  fast to load); scale-DOWN applies a 5-minute stabilization window so a
  brief dip doesn't immediately shed capacity it'll need again seconds
  later.

VERTICAL POD AUTOSCALER (VPA):
  Adjusts resources.requests/limits on the Pod template itself, based on
  a percentile model of historical usage (its Recommender watches actual
  usage the same way metrics-server does — Phase 5, Section 1). In
  "Auto" mode it EVICTS and recreates Pods to apply new requests.

THE CLASSIC CONFLICT — HPA-ON-CPU + VPA ON THE SAME WORKLOAD:
  CPU "utilization" is a RATIO: usage / request. If VPA changes the
  denominator (request) while HPA is scaling on that same ratio, the two
  controllers can oscillate — VPA raises the request (utilization drops),
  HPA reads lower utilization and scales DOWN replica count, per-replica
  load rises, utilization climbs again, HPA scales back UP. Standard
  mitigation: HPA on a metric VPA doesn't influence (requests-per-second,
  queue depth) and VPA on resources — never both on CPU for the same
  Deployment.

CLUSTER AUTOSCALER (CA) — THE SLOW ONE:
  Watches for Pods stuck Pending because NO node has enough allocatable
  resources (Section 1's Filter phase rejected every node), and for nodes
  that have been underutilized for >10min with all their Pods evictable
  elsewhere.
  SCALE-UP: picks the node group that would fit the pending pod and calls
  the cloud provider's API (e.g. ASG SetDesiredCapacity). The new node
  then needs 1–3 minutes to boot, register as a Node (kubelet heartbeat,
  Phase 2), AND pull its images (Phase 1's pull-burst derivation) before
  it's schedulable. CA's scale-up latency is therefore dominated by NODE
  BOOTSTRAP + IMAGE PULL, not by anything in the scheduler.
  SCALE-DOWN: cordons (marks unschedulable) then drains an underutilized
  node — evicting its Pods one at a time, respecting PodDisruptionBudgets
  — before terminating it.

PODDISRUPTIONBUDGET — THE THROTTLE ON VOLUNTARY DISRUPTION:
  A PDB with minAvailable: 2 on a 3-replica Deployment means CA (or a node
  drain for maintenance) can evict at most 1 of those Pods at a time —
  directly capping how fast scale-down (or upgrades) can proceed, by
  design: availability over speed.`,
        },
      ],
    },
    {
      id: "phase4",
      label: "Phase 4",
      title: "Networking & Service Discovery",
      sections: [
        {
          title: "Pod Networking (CNI) & the Service Abstraction",
          content: `KUBERNETES NETWORKING MODEL — three non-negotiable invariants:
  1. Every Pod gets its own IP from a flat, routable address space.
  2. Any Pod can reach any other Pod's IP directly — no NAT — regardless
     of which node either is on.
  3. A Pod sees its own IP as the SAME IP everyone else sees it as.

CNI — HOW A POD ACTUALLY GETS THAT IP:
  When kubelet creates the pod sandbox (Phase 1, Section 2), it invokes a
  CNI plugin's ADD command with the pod's network namespace. The plugin:
  allocates an IP from its node-local IPAM pool, creates a veth pair (one
  end inside the pod's namespace, one on the host bridge), and programs
  routes so traffic to that IP reaches the veth. DEL on pod deletion
  releases the IP back to the pool. Implementations differ in the DATA
  PLANE: Flannel (simple VXLAN overlay — easy, adds encapsulation
  overhead), Calico (BGP-advertised routes between nodes — no overlay,
  needs L3 reachability), Cilium (eBPF — bypasses iptables/netfilter
  entirely for both routing AND NetworkPolicy enforcement).

THE STABLE-IP PROBLEM — WHY SERVICES EXIST:
  Pod IPs are EPHEMERAL — every Deployment rollout (Phase 2) replaces
  every Pod, each getting a brand-new IP. A Service provides a stable
  VIRTUAL IP (ClusterIP, from a separate non-routable CIDR) that load-
  balances across whatever Pod IPs CURRENTLY match its label selector.
  The EndpointSlice controller watches Pods matching that selector and
  keeps the live IP list current — updated within one reconcile cycle of
  a Pod's readiness probe (Phase 1) flipping.

KUBE-PROXY — THE DATA PLANE FOR ClusterIP:
  Watches Services + EndpointSlices and programs the actual translation.
  iptables mode: DNAT rules — traffic to the ClusterIP hits a KUBE-SVC
  chain, which jumps (via weighted --probability) into one of several
  KUBE-SEP chains, each DNAT'ing to one Pod IP:port. This is O(n) rule
  evaluation per packet and becomes a measurable bottleneck above roughly
  5,000 Services. ipvs mode uses the kernel's IPVS load balancer — O(1)
  hash-table lookup, more LB algorithm choices — preferred at this scale.
  Cilium replaces kube-proxy ENTIRELY with eBPF programs attached at the
  socket layer, skipping the netfilter path altogether.

DNS — COREDNS:
  Runs as a Deployment (itself fronted by a Service!) that watches
  Services and answers <service>.<namespace>.svc.cluster.local with that
  Service's ClusterIP. Every Pod's /etc/resolv.conf is pointed at
  CoreDNS's ClusterIP by kubelet at pod creation — service discovery is
  "just DNS" from the application's point of view, but the records behind
  it are kept live by the same watch mechanism (Phase 2) as everything
  else.`,
        },
        {
          title: "Ingress, Network Policies & Multi-Tenancy",
          content: `INGRESS — L7 ROUTING IN FRONT OF SERVICES:
  A ClusterIP Service handles L4 routing INSIDE the cluster, but external
  HTTP(S) traffic needs host/path-based routing and TLS termination — an
  Ingress Controller (NGINX, or the same Envoy used by the service mesh,
  acting as a Gateway under the newer Gateway API) watches Ingress/Gateway
  objects and reconfigures itself accordingly. It's exposed to the outside
  world via a LoadBalancer-type Service, which provisions an actual cloud
  L4 load balancer (ELB/NLB) pointed at the node IPs (or, with newer CNIs,
  directly at pod IPs).

NETWORKPOLICY — DEFAULT-ALLOW UNTIL YOU SAY OTHERWISE:
  Out of the box, any Pod can reach any other Pod (invariant #2 above). A
  NetworkPolicy with a podSelector + ingress/egress rules flips THAT pod
  to default-deny, then permits only the matching traffic. Crucially, this
  is enforced by the CNI's DATA PLANE (Calico/Cilium iptables or eBPF
  rules), NOT by the API server — the policy object is just desired state;
  the CNI agent on each node is the controller that reconciles it into
  actual packet-filtering rules.

NAMESPACES AS THE MULTI-TENANCY UNIT:
  A single cluster serves many teams/tenants by giving each a Namespace,
  combined with:
  - ResourceQuota: caps total CPU/memory/object-count PER NAMESPACE.
    Without this, one tenant's runaway Deployment can consume capacity
    the SCHEDULER (Phase 3) sees as simply "no nodes have room" for
    everyone else — a noisy-neighbor problem that looks like a cluster
    outage but is really one namespace's missing quota.
  - LimitRange: default/min/max requests-limits applied to containers that
    don't specify their own — prevents a forgotten "no resources:" block
    from being scheduled as if it needs nothing (and therefore being
    OOM-killed under any real load).
  - RBAC RoleBinding scoped to the namespace — a team's kubectl access
    literally cannot see or modify other namespaces' objects.
  - NetworkPolicy (above) — "this namespace's Pods are reachable only from
    this namespace and the ingress controller."

  None of this requires a SEPARATE CLUSTER per tenant — but ResourceQuota
  in particular is treated as MANDATORY at this scale, not optional,
  precisely because its absence breaks an invariant (Phase 3's scheduler
  having room) that every OTHER tenant depends on too.`,
        },
      ],
    },
    {
      id: "phase5",
      label: "Phase 5",
      title: "Observability & APM — Monitoring Docker & Kubernetes in Depth",
      sections: [
        {
          title: "The Metrics Pipeline — cAdvisor, kube-state-metrics & Prometheus",
          content: `Walking ONE CPU metric from a container to a Grafana dashboard, end to end:

1. INSIDE THE NODE — cAdvisor:
   cAdvisor is built INTO kubelet (not a separate pod). It reads each
   container's resource usage straight from its cgroup files
   (cpu.stat, memory.current, etc. — Phase 1, Section 2) plus network
   stats from its network namespace, polling roughly every 10s.

2. EXPOSED BY KUBELET:
   kubelet exposes these as Prometheus-format metrics at
   https://<node-ip>:10250/metrics/cadvisor — every series carries pod,
   namespace, container, and image labels.

3. SCRAPED BY PROMETHEUS — Kubernetes-native service discovery:
   Prometheus's kubernetes_sd_configs queries the API server with the
   SAME List+Watch mechanism from Phase 2 to auto-generate its scrape
   target list — as pods come and go, targets appear and disappear with
   no static config. relabel_configs filter/rewrite labels BEFORE the
   scrape (e.g. only scrape pods annotated prometheus.io/scrape=true);
   metric_relabel_configs filter AFTER — this is the PRIMARY tool for
   controlling cardinality (Phase 1's ~2M samples/sec ceiling), e.g.
   dropping high-cardinality container_id / pod_uid labels before they
   ever hit storage.

4. KUBE-STATE-METRICS — a SEPARATE Deployment, NOT cAdvisor:
   Does its OWN List+Watch on the API server and turns OBJECT STATE into
   metrics: kube_deployment_status_replicas, kube_pod_status_phase,
   kube_node_status_condition. This is how you alert on "Deployment
   checkout has 0/3 Ready replicas" — that's not a resource-usage number,
   it's the CONTROL PLANE's own desired-vs-actual view (Phase 2) exposed
   as a time series.

5. METRICS-SERVER — the HPA's data source:
   A slimmed-down, in-memory-only aggregation of cAdvisor data, exposed
   via the metrics.k8s.io aggregated API. THIS is what HPA (Phase 3)
   polls every 15s — deliberately with NO history; Prometheus owns
   history, metrics-server owns "right now."

6. STORAGE & QUERY:
   Prometheus TSDB keeps ~2h in memory plus on-disk blocks compacted over
   time. Recording rules pre-aggregate expensive queries (e.g.
   sum(rate(container_cpu_usage_seconds_total[5m])) by (namespace)) on a
   schedule, so Grafana dashboards query cheap pre-computed series instead
   of raw cAdvisor data at render time. Alertmanager evaluates alert rules
   (also PromQL) and handles dedup, grouping, and routing to PagerDuty/
   Slack.

7. SHARDING AT SCALE:
   A single Prometheus tops out around 1–2M active series. At the ~2M
   samples/sec from Phase 1, the standard pattern is FUNCTIONAL SHARDING —
   one Prometheus per team/namespace-group, each remote-writing into a
   horizontally-scalable long-term store (Thanos/Cortex/Mimir) that
   presents ONE global PromQL view across every shard.`,
        },
        {
          title: "Distributed Tracing & APM Agents — Auto-Instrumentation in Containers",
          content: `THE PROBLEM METRICS CAN'T ANSWER:
  A single user request fans out across 10–20 microservices, each in its
  own Pod, often on different nodes. Metrics tell you "checkout-service
  p99 latency spiked" but not WHICH downstream call caused it. Distributed
  tracing answers that by propagating a traceparent header (W3C Trace
  Context: trace-id + span-id + flags) on every hop, with each service
  emitting a SPAN — start time, duration, tags — tagged with that trace-id.

AUTO-INSTRUMENTATION VIA OPERATOR + ADMISSION WEBHOOK:
  The OpenTelemetry Operator watches for an Instrumentation custom
  resource plus a pod annotation (e.g.
  instrumentation.opentelemetry.io/inject-java: "true"). On Pod CREATE,
  its MUTATING ADMISSION WEBHOOK (Phase 2's admission chain) injects an
  init-container that copies a language-specific OTel agent into a shared
  volume, plus environment variables that point the runtime at it. THE
  APPLICATION GETS TRACED WITHOUT A SINGLE CODE CHANGE OR REBUILD — purely
  by the pod spec being rewritten at admission time, the exact same
  mechanism the service mesh uses to inject its own sidecar.

COLLECTION — THE OTEL COLLECTOR DAEMONSET:
  Each instrumented Pod sends spans (OTLP, gRPC/HTTP) to a Collector
  running as a DaemonSet — one per node, reached at the node's IP, so
  spans never cross a node boundary on their first hop. This Collector
  batches spans, enriches them with k8s.pod.name / k8s.namespace /
  k8s.node.name (the SAME metadata join used by kube-state-metrics in
  Section 1), and forwards to a central Collector Deployment, which
  exports to the tracing backend (Jaeger/Tempo).

THE SERVICE MESH IS ALSO A TRACING SOURCE:
  Every Envoy sidecar (the serviceMesh component) emits its OWN span for
  every proxied request — even for a completely uninstrumented legacy
  binary. That gives a "front door" span with latency/status-code per hop
  for EVERY service, regardless of app-level instrumentation. App-level
  OTel spans (business-logic detail) plus mesh-level spans (network-truth,
  uniform coverage) together give full-fidelity traces without requiring
  every team to instrument their code.

SAMPLING — YOU CANNOT KEEP EVERYTHING:
  Tracing every request at this platform's request volume is prohibitively
  expensive to store. HEAD-BASED sampling (decide at the FIRST span — e.g.
  keep 1% of all traces) is cheap but likely misses rare errors entirely.
  TAIL-BASED sampling buffers ALL spans for a trace for a few seconds, then
  decides — keep 100% of error/high-latency traces, 1% of "boring"
  successful ones. This requires a Collector to see EVERY span for a given
  trace before deciding, so tail-sampling Collectors are deployed
  CENTRALLY (not per-node) with consistent hashing on trace-id, routing all
  of one trace's spans to the same Collector replica.

EXEMPLARS — THE BRIDGE BACK TO METRICS:
  Prometheus can attach a trace_id "exemplar" to a histogram bucket sample
  at scrape time. In Grafana, clicking a spike on a LATENCY METRIC graph
  (Section 1) jumps DIRECTLY to a real TRACE that fell in that bucket — the
  first link in the metrics -> traces -> logs chain completed in Section 3.`,
        },
        {
          title: "Log Aggregation & The Three Pillars Correlation",
          content: `WHERE LOGS ACTUALLY COME FROM:
  A container's stdout/stderr is captured by the container runtime
  (containerd, Phase 1) and written to
  /var/log/pods/<namespace>_<pod>_<uid>/<container>/0.log as JSON lines —
  this happens for EVERY container regardless of whether anything is
  "collecting" logs; it's the runtime's job, entirely separate from
  Kubernetes itself.

COLLECTION — FLUENT BIT DAEMONSET:
  Fluent Bit runs as a DaemonSet (one pod per node, mirroring the OTel
  Collector in Section 2) with a tail input watching
  /var/log/pods/**/*.log. For EACH line, its kubernetes filter plugin
  extracts namespace/pod/container FROM THE FILE PATH and queries the
  kubelet (or a local cache of the API server's pod list) to enrich the
  line with labels, annotations, and owner references (which Deployment/
  ReplicaSet it belongs to) — the SAME metadata join kube-state-metrics
  and the OTel Collector both perform, just applied to log lines.

SHIPPING & STORAGE — LOKI VS ELASTICSEARCH:
  Enriched, structured (JSON) lines are batched and shipped to either
  Loki (indexes ONLY labels — namespace/pod/container — and stores log
  content as compressed chunks; cheap at this volume) or Elasticsearch
  (full-text indexed everything; more expensive, more ad-hoc-queryable).
  Loki's label-only indexing deliberately MIRRORS Prometheus's label
  model: {namespace="checkout", pod="checkout-7f8b9-xk2p1"} is valid as
  both a Prometheus series selector AND a Loki stream selector.

THE PAYOFF — TYING SECTIONS 1, 2 AND 3 TOGETHER:
  Once a Pod is auto-instrumented (Section 2), the OTel SDK injects the
  active trace_id/span_id into the application's LOGGING CONTEXT
  automatically — so every structured log line ALREADY carries the
  trace_id that ties it to a specific request. The on-call flow becomes:
  a Grafana ALERT fires from a PromQL rule (Section 1, e.g.
  rate(http_requests_total{status=~"5.."}[5m]) > threshold) -> the
  dashboard shows the spike with an EXEMPLAR linking to a sample TRACE
  (Section 2) -> the trace shows WHICH span/service errored -> one click
  pivots to LOGS (this section) filtered to that exact pod AND trace_id ->
  the actual stack trace. Three pillars, one pane of glass — and the only
  reason it works end to end is that namespace / pod / trace_id are
  threaded as COMMON LABELS through metrics, traces, AND logs from the
  moment the container starts.`,
        },
      ],
    },
  ],
};

export const KUBERNETES_LLD = {
  title: "Docker & Kubernetes Platform — Low Level Design",
  subtitle: "Data models, APIs, and component-level design of the registry, control plane, scheduler, networking, and observability/APM stack",

  components: [
    {
      id: "registryService",
      title: "Container Registry Service — LLD",
      description: "OCI image storage (content-addressed blobs + manifests), tag resolution, vulnerability-scan gate, per-AZ pull-through cache for node scale-up bursts",
      api: `# Registry HTTP API V2 (OCI Distribution Spec)

HEAD /v2/{name}/blobs/{digest}
  200 -> blob already exists ANYWHERE in the registry (global, content-
         addressed dedup — client skips uploading this layer entirely)
  404 -> client must upload

POST /v2/{name}/blobs/uploads/
  -> 202 Accepted, Location: /v2/{name}/blobs/uploads/{uuid}
  client PATCHes layer bytes to that location in chunks, then PUTs to
  finalize -> blob stored under its own sha256 digest

PUT /v2/{name}/manifests/{reference}
  body: { "config": {"digest": "sha256:..."},
          "layers": [{"digest": "sha256:..."}, ...] }
  ADMISSION GATE: every layer digest in this manifest must have
  scan_status == "PASSED" (Phase 1's vulnerability scanner) before the tag
  is marked promotable — otherwise 202 Accepted but the tag stays
  "pending-scan" and is invisible to pull traffic.

GET /v2/{name}/manifests/{reference}
  reference = a TAG (mutable — "checkout-service:v42") or a DIGEST
  (immutable). Tag lookups resolve via the images table below, then return
  the immutable manifest for that digest.

GET /v2/{name}/blobs/{digest}        — PULL, served by the per-AZ cache
  1. local-AZ cache HIT  -> stream from local object storage
  2. local-AZ cache MISS -> fetch from origin registry, write-through to
     local cache, stream to client
  This is the path that absorbs Phase 1's ~2–3GB/sec node-scale-up burst
  without every new node hitting the origin across a region.

POSTGRES — images TABLE:
  repository, tag, digest (sha256), size_bytes, layer_digests[],
  scan_status (PENDING | PASSED | FAILED), pushed_at, pushed_by

GARBAGE COLLECTION (nightly mark-and-sweep):
  any blob digest not referenced by ANY manifest, across ANY repo/tag, is
  marked eligible and deleted after a 7-day grace period — long enough to
  cover a pull that started just before a tag was retargeted to a new
  digest.`,
    },
    {
      id: "apiServerEtcd",
      title: "API Server & etcd — LLD",
      description: "Typed REST + Watch API, resourceVersion optimistic concurrency, admission webhook chain, etcd key schema and Raft write/watch path",
      api: `# etcd key schema (every cluster object lives here)
/registry/pods/{namespace}/{name}          -> protobuf-encoded Pod
/registry/deployments/{namespace}/{name}   -> protobuf-encoded Deployment
/registry/leases/kube-node-lease/{node}    -> kubelet heartbeat (Phase 1)
each key's stored value carries etcd's mod_revision == the object's
resourceVersion exposed over the API.

# WRITE PATH — optimistic concurrency
PATCH /api/v1/namespaces/{ns}/pods/{name}
Headers: If-Match: "98231"                  (resourceVersion just read)

1. AuthN -> AuthZ (RBAC) -> MUTATING admission webhooks (rewrite the
   object — sidecar/agent injection) -> schema validation -> VALIDATING
   admission webhooks (accept/reject only — e.g. OPA/Gatekeeper enforcing
   Phase 1's "image must be scan-PASSED")
2. apiserver issues an etcd Txn:
     compare(mod_revision(key) == 98231)
     then put(key, newValue)
3. etcd leader appends to its Raft log, replicates to followers, commits
   on majority ack -> apiserver returns 200 + resourceVersion: "98235"
4. compare fails (someone else wrote first) -> 409 Conflict -> client
   re-GETs, re-applies its change on top of the new version, retries.

# READ PATH — served from the watch cache, not etcd
GET /api/v1/namespaces/{ns}/pods?resourceVersion=0
  -> apiserver's in-memory watch cache answers directly: { items: [...],
     metadata: { resourceVersion: "98231" } } — etcd is NOT read per LIST.

# WATCH PATH
GET /api/v1/namespaces/{ns}/pods?watch=true&resourceVersion=98231
  -> chunked response, one event per chunk:
     { "type": "MODIFIED", "object": {..., "resourceVersion":"98235"} }
     { "type": "BOOKMARK", "object": {"resourceVersion":"99000"} }
  backed by etcd's own MVCC watch on /registry/pods/{ns}/, fanned out to
  every connected watcher from one underlying etcd watch stream.

# ADMISSION WEBHOOK REGISTRATION — how sidecar injection plugs in
MutatingWebhookConfiguration:
  rules: [{operations:["CREATE"], resources:["pods"]}]
  clientConfig: { service: { name: "otel-operator-webhook", path: "/mutate" } }
  failurePolicy: Ignore   # a webhook outage must not block ALL pod creation
  -> apiserver calls this webhook SYNCHRONOUSLY (timeout default 10s)
     before the Pod is ever persisted to etcd.

# API PRIORITY AND FAIRNESS (APF)
FlowSchema "kubelet-heartbeats"  -> PriorityLevelConfiguration "system"        (highest)
FlowSchema "controller-watches"  -> PriorityLevelConfiguration "workload-high"
FlowSchema "kubectl-default"     -> PriorityLevelConfiguration "global-default" (lowest)
-> a runaway "kubectl get pods --watch" loop is queued in global-default and
   CANNOT delay lease renewals in "system" — directly protects Phase 2's
   Node-eviction timeline from false positives.`,
    },
    {
      id: "schedulerService",
      title: "kube-scheduler — LLD",
      description: "Filter -> Score -> Bind scheduling loop, percentageOfNodesToScore sampling, preemption, pluggable scheduling-framework extension points",
      api: `# Scheduling loop — one pod popped off the priority queue at a time

function schedulePod(pod):
  nodes = nodeCache.list()                       # cached via Phase 2 watch
  feasible = []
  for node in sample(nodes, percentageOfNodesToScore(len(nodes))):
    if passesAllFilters(pod, node):              # Phase 3 predicates
      feasible.append(node)
    if len(feasible) >= minFeasibleNodesToFind: break

  if feasible is empty:
    return tryPreemption(pod)

  scores = {}
  for node in feasible:
    scores[node] = sum(plugin.score(pod, node) * plugin.weight
                        for plugin in scoringPlugins)
  best = argmax(scores)
  apiserver.Bind(pod, best.name)   # POST /api/v1/namespaces/{ns}/pods/{name}/binding

# percentageOfNodesToScore — Phase 1 derivation #3
function percentageOfNodesToScore(numNodes):
  if numNodes <= 50: return 100
  pct = 50 - (numNodes - 50) / 125
  return max(pct, 5)               # floor at 5%

# Preemption (PostFilter extension point)
function tryPreemption(pod):
  for node in nodes:
    victims = [p for p in podsOn(node) if priority(p) < priority(pod)]
    if removing(victims) makes node feasible for pod:
      sort victims by priority ascending
      for v in victims: apiserver.Delete(v, gracePeriod=v.terminationGracePeriod)
      pod.status.nominatedNodeName = node.name
      return PENDING   # re-enters the queue once victims terminate
  return UNSCHEDULABLE

# SCHEDULING FRAMEWORK EXTENSION POINTS (in order):
QueueSort -> PreFilter -> Filter -> PostFilter(preemption) -> PreScore ->
Score -> Reserve -> Permit -> PreBind -> Bind -> PostBind

A "scheduler-v2" Deployment running a NEW scoring plugin (e.g. a power-
aware bin-packing strategy) deploys ALONGSIDE the default scheduler; pods
opt in via spec.schedulerName: "scheduler-v2" — this is the canary path
the serviceMesh component below routes traffic for.`,
    },
    {
      id: "controllerManager",
      title: "Controller Manager — LLD",
      description: "Generic informer/workqueue reconciliation pattern, Deployment rolling-update state machine, Node lease/eviction timeline, HPA polling loop",
      api: `# Generic reconciler — every built-in controller and custom Operator

function Reconcile(key):
  obj, exists = informer.cache.Get(key)
  if !exists: return                     # already deleted — idempotent no-op
  desired = obj.spec
  actual  = listOwned(obj)                # e.g. Pods with ownerReference == obj.uid
  plan    = diff(desired, actual)
  for action in plan: apiserver.apply(action)   # Create / Patch / Delete
  return requeueAfter(resyncPeriod)       # default 30min full resync

# Deployment rolling-update state machine
on Deployment.spec.template change:
  newRS = createOrGet ReplicaSet(hash(spec.template))
  loop:
    surgeRoom = maxSurge - (newRS.replicas - spec.replicas)
    scale newRS up by min(surgeRoom, remaining)
    wait until newRS's new Pods pass readiness probes (Phase 1)
    unavailRoom = maxUnavailable - (spec.replicas - readyCount(oldRS, newRS))
    scale oldRS down by min(unavailRoom, oldRS.replicas)
    if newRS.replicas == spec.replicas and oldRS.replicas == 0: done
    else: requeue

# Node lease & eviction timeline (Phase 1's 500 writes/sec, Phase 2 self-heal)
t=0s     kubelet PUTs /registry/leases/kube-node-lease/{node} every 10s
t=40s    no renewal -> node controller sets Node.status.conditions[Ready] = Unknown
t=40s+   owning controllers do NOT yet act (grace period — avoid flapping)
t=300s   pod-eviction-timeout elapsed -> node controller DELETES every Pod
         object scheduled on this node
         -> owning ReplicaSets see actual < desired
         -> create replacement Pods -> scheduler places them on healthy nodes

# HPA reconciler — runs every syncPeriod (default 15s)
for hpa in list(HorizontalPodAutoscalers):
  metric  = metricsClient.GetResourceMetric(hpa.spec.metricName, hpa.spec.scaleTargetRef)
  desired = ceil(currentReplicas * metric.current / hpa.spec.targetValue)
  desired = clamp(desired, hpa.spec.minReplicas, hpa.spec.maxReplicas)
  if withinStabilizationWindow(desired, direction): desired = currentReplicas
  if desired != currentReplicas:
    apiserver.Patch(hpa.spec.scaleTargetRef, {spec: {replicas: desired}})`,
    },
    {
      id: "cniNetworkService",
      title: "CNI & Service Networking — LLD",
      description: "CNI ADD/DEL IPAM allocation at pod-sandbox creation, EndpointSlice-driven kube-proxy rule programming, CoreDNS resolution path",
      api: `# CNI ADD — invoked by the container runtime at pod sandbox creation
stdin (CNI spec JSON):
  {"cniVersion":"1.0.0","name":"cluster-cni","type":"calico",
   "ipam":{"type":"calico-ipam"}}
env: CNI_COMMAND=ADD, CNI_CONTAINERID=<sandbox-id>,
     CNI_NETNS=/proc/<pid>/ns/net, CNI_IFNAME=eth0

plugin steps:
  1. ipam.Allocate(node_subnet) -> 10.244.14.37/32
  2. create veth pair: cali1234 (host namespace) <-> eth0 (pod namespace)
  3. add host route: 10.244.14.37 dev cali1234
  4. (Calico) BGP-advertise this node's whole block (10.244.14.0/24) to peers
stdout: {"ips":[{"address":"10.244.14.37/32"}], "routes":[...]}

# CNI DEL — reverse: remove veth, release IP to IPAM pool, withdraw route

# EndpointSlice -> kube-proxy -> iptables
EndpointSlice "checkout-abc123" for Service "checkout" (ClusterIP 10.96.12.4):
  endpoints: [
    {addresses: ["10.244.14.37"], conditions: {ready: true}},
    {addresses: ["10.244.9.12"],  conditions: {ready: true}}
  ]

kube-proxy reconciles (nat table):
  -A KUBE-SERVICES -d 10.96.12.4/32 -p tcp --dport 80 -j KUBE-SVC-CHECKOUT
  -A KUBE-SVC-CHECKOUT -m statistic --mode random --probability 0.5 -j KUBE-SEP-1
  -A KUBE-SVC-CHECKOUT                                              -j KUBE-SEP-2
  -A KUBE-SEP-1 -j DNAT --to-destination 10.244.14.37:8080
  -A KUBE-SEP-2 -j DNAT --to-destination 10.244.9.12:8080

A Pod failing its readiness probe (Phase 1) is removed from the
EndpointSlice -> kube-proxy's next sync (sub-second) deletes its KUBE-SEP
rule -> traffic stops landing on it WITHOUT any Pod or Service object
changing.

# CoreDNS resolution
Pod queries "checkout.prod.svc.cluster.local"
  -> CoreDNS's kubernetes plugin looks up Service "checkout" in namespace
     "prod" via its own informer cache (Phase 2) -> returns A record
     10.96.12.4 (the ClusterIP)
  -> for HEADLESS Services (clusterIP: None, used by StatefulSets), CoreDNS
     instead returns ALL pod IPs from the EndpointSlice directly — used when
     a client must address a SPECIFIC replica (e.g. a database primary).`,
    },
    {
      id: "observabilityAgent",
      title: "Observability & APM Agent — LLD",
      description: "Prometheus scrape configs (cAdvisor/kube-state-metrics/node-exporter), OTel Collector DaemonSet pipeline with auto-instrumentation webhook, Fluent Bit log enrichment, example alert rule",
      api: `# Prometheus scrape config — kubernetes_sd_configs auto-discovers targets
scrape_configs:
  - job_name: "kubernetes-cadvisor"
    kubernetes_sd_configs: [{role: node}]
    scheme: https
    tls_config: {ca_file: /var/run/secrets/.../ca.crt}
    bearer_token_file: /var/run/secrets/.../token
    relabel_configs:
      - source_labels: [__meta_kubernetes_node_name]
        target_label: __metrics_path__
        replacement: /api/v1/nodes/\${1}/proxy/metrics/cadvisor
    metric_relabel_configs:
      - source_labels: [container_id]
        action: labeldrop          # cardinality control — Phase 1 deriv. #4

  - job_name: "kube-state-metrics"
    kubernetes_sd_configs: [{role: endpoints}]
    relabel_configs:
      - source_labels: [__meta_kubernetes_service_name]
        regex: kube-state-metrics
        action: keep

# kube-state-metrics — object state AS metrics
kube_deployment_status_replicas{namespace="checkout",deployment="checkout"} 3
kube_deployment_status_replicas_available{namespace="checkout",deployment="checkout"} 0
kube_pod_status_phase{namespace="checkout",pod="checkout-7f8b9-xk2p1",phase="CrashLoopBackOff"} 1

# Alert rule (PromQL, evaluated by Alertmanager)
- alert: DeploymentReplicasMismatch
  expr: kube_deployment_status_replicas_available
        != kube_deployment_spec_replicas
  for: 10m
  labels: {severity: page}
  annotations:
    summary: "{{ $labels.deployment }} has {{ $value }} available replicas"

# OTel Collector DaemonSet config (per-node)
receivers:
  otlp: {protocols: {grpc: {endpoint: "0.0.0.0:4317"}}}
processors:
  k8sattributes:        # enriches spans with k8s.pod.name, k8s.namespace, etc.
    passthrough: false
    extract: {metadata: ["k8s.pod.name","k8s.namespace.name","k8s.node.name"]}
  batch: {timeout: 5s}
exporters:
  otlp/central: {endpoint: "otel-collector-central.observability:4317"}
service:
  pipelines:
    traces: {receivers: [otlp], processors: [k8sattributes, batch], exporters: [otlp/central]}

# Auto-instrumentation mutating webhook (OTel Operator, on Pod CREATE)
function Mutate(pod):
  if pod.annotations["instrumentation.opentelemetry.io/inject-java"] == "true":
    pod.spec.initContainers.append({
      name: "otel-agent-init",
      image: "otel/autoinstrumentation-java",
      command: ["cp","/javaagent.jar","/otel-auto/javaagent.jar"],
      volumeMounts: [{name:"otel-auto", mountPath:"/otel-auto"}],
    })
    for c in pod.spec.containers:
      c.env += [
        {name:"JAVA_TOOL_OPTIONS", value:"-javaagent:/otel-auto/javaagent.jar"},
        {name:"OTEL_EXPORTER_OTLP_ENDPOINT", value:"http://$(HOST_IP):4317"},
      ]
      c.volumeMounts += [{name:"otel-auto", mountPath:"/otel-auto"}]
  return pod   # apiserver persists the MUTATED spec (Phase 2 admission chain)

# Fluent Bit DaemonSet config (excerpt)
[INPUT]
  Name tail
  Path /var/log/pods/*/*/*.log
  Tag  kube.*
[FILTER]
  Name      kubernetes
  Match     kube.*
  Kube_URL  https://kubernetes.default.svc:443
  Merge_Log On                       # parses JSON app logs into structured fields
[OUTPUT]
  Name   loki
  Match  kube.*
  Labels $namespace, $pod, $container`,
    },
    {
      id: "serviceMesh",
      title: "Service Mesh — Envoy/Istio Sidecar Configuration",
      description: "Control-plane mesh: API server circuit breaking, controller-manager LB-only (leader election), OTel Collector canary, registry-push AuthorizationPolicy, namespace-wide mTLS",
      api: `# Istio configuration — namespace "platform-control-plane"

# 1. API server — tight circuit breaking.
#    The single most-depended-upon service in the cluster: ~5,000 kubelets
#    plus hundreds of controller/operator replicas, ~50K QPS (Phase 1,
#    derivation #2). Stateless replicas behind a shared watch cache, so
#    ejecting one slow replica is cheap and safe.
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: api-server-circuit-breaker
  namespace: platform-control-plane
spec:
  host: api-server.platform-control-plane.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 20000
      http:
        http1MaxPendingRequests: 10000
        maxRequestsPerConnection: 100
    loadBalancer:
      simple: LEAST_REQUEST
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 5s
      baseEjectionTime: 15s
      maxEjectionPercent: 50
---
# 2. Controller Manager — load balancing ONLY, no outlier ejection.
#    Runs as 3 replicas under leader election (Phase 2); standbys
#    deliberately return not-leader on work endpoints. Ejecting them — or
#    worse, ejecting the active leader mid-reconcile — would force a full
#    informer resync across ~150K pods to rebuild workqueue state.
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: controller-manager-lb
  namespace: platform-control-plane
spec:
  host: controller-manager.platform-control-plane.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 4000
      http:
        http1MaxPendingRequests: 2000
        maxRequestsPerConnection: 50
    loadBalancer:
      simple: LEAST_REQUEST
---
# 3. Canary a new OTel Collector tail-sampling policy (Phase 5) before
#    fleet-wide rollout — a bad policy can silently drop error traces with
#    no alert (absence of data doesn't page anyone).
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: observability-agent-collector-canary
  namespace: platform-control-plane
spec:
  hosts:
    - otel-collector-central.platform-control-plane.svc.cluster.local
  http:
    - match:
        - headers:
            x-otel-canary:
              exact: "true"
      route:
        - destination:
            host: otel-collector-central.platform-control-plane.svc.cluster.local
            subset: v2
    - route:
        - destination:
            host: otel-collector-central.platform-control-plane.svc.cluster.local
            subset: v1
          weight: 95
        - destination:
            host: otel-collector-central.platform-control-plane.svc.cluster.local
            subset: v2
          weight: 5
      retries:
        attempts: 2
        perTryTimeout: 10s
        retryOn: 5xx,reset,connect-failure
---
# 4. Registry push integrity — only the CI/CD pipeline identity may PUSH;
#    every other mesh identity (including application pods pulling their
#    own images) is pull-only.
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: registry-push-restriction
  namespace: platform-control-plane
spec:
  selector:
    matchLabels:
      app: registry-service
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/ci-cd/sa/build-pipeline"]
      to:
        - operation:
            methods: ["PUT", "POST", "PATCH", "DELETE"]
            paths: ["/v2/*/manifests/*", "/v2/*/blobs/*"]
    - from:
        - source:
            principals: ["*"]
      to:
        - operation:
            methods: ["GET", "HEAD"]
---
# 5. mTLS within the control-plane namespace
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: platform-control-plane
spec:
  mtls:
    mode: STRICT`,
      internals: `Sidecar injection scope (5 services, matching the LLD components above):
  IN MESH:  API Server & etcd (front door only — etcd itself is NOT meshed),
            kube-scheduler, Controller Manager, Registry Service,
            Observability & APM Agent (the central OTel Collector and
            Prometheus/Alertmanager Deployments — the per-node DaemonSets
            run with hostNetwork and sit outside the mesh by necessity, see
            below).
  OUT:      CNI & Service Networking — operates BELOW the mesh layer: it
            programs the very network namespaces, veth pairs, and iptables/
            eBPF rules that a sidecar needs to exist in the first place. A
            sidecar can't proxy traffic for the component that wires up its
            own pod network — the same bootstrapping/layering reason the CNI
            agent itself runs with hostNetwork: true. Also OUT: etcd (only
            the API server talks to it directly — Phase 2's "API server is
            the only etcd client" invariant — so meshing it would add a hop
            with no policy benefit and a new failure mode for the cluster's
            single source of truth), Kafka, and the data layer (Postgres,
            Prometheus TSDB, Loki, S3/object storage).

API server circuit breaking — sized against Phase 1's derivation #2:
  ~50K req/sec aggregate across ~5,000 kubelet watch connections plus
  hundreds of controller/operator replicas, all hitting a small, stateless,
  horizontally-scaled set of API server replicas behind a shared watch
  cache. outlierDetection (interval: 5s / baseEjectionTime: 15s) ejects a
  replica stuck rebuilding its watch cache after a GC pause within one
  interval — at this QPS, leaving a 5xx'ing replica in rotation for even a
  few seconds means thousands of kubelets retry simultaneously, themselves
  adding load to the remaining healthy replicas. maxConnections: 20000
  gives headroom over the steady-state long-lived-connection count.

Controller Manager — LB-only, the leader-election argument:
  Exactly the same reasoning as the saga/allocation-state services elsewhere
  in this series, applied to a SINGLETON-WITH-STANDBYS pattern instead of an
  in-flight-transaction pattern: of the 3 replicas, only the lease holder
  (Phase 2) is doing real work — the other 2 return 503/not-leader BY
  DESIGN. outlierDetection based on consecutive5xxErrors would eject those
  2 healthy standbys forever (no benefit — they were never going to serve
  anyway) and, far worse, could eject the ACTIVE LEADER during a slow
  reconcile burst, discarding its in-memory workqueue and forcing every
  controller to rebuild state via a full List+Watch resync across ~150K pods
  (Phase 1) — minutes of "everything looks fine but nothing is reconciling."
  LEAST_REQUEST just routes to whichever replica is currently answering.

OTel Collector canary — tied directly to Phase 5, Section 2:
  A tail-sampling POLICY CHANGE is the highest-blast-radius config in the
  observability stack: get the keep/drop logic wrong and you silently lose
  error traces fleet-wide for the rollout window — and because the FAILURE
  MODE IS MISSING DATA, no alert fires on its own. The 5% header-matched
  canary lets the platform team validate v2 against their OWN synthetic
  traffic (x-otel-canary: true) before the 95/5 weighted split exposes real
  traffic to it; perTryTimeout: 10s bounds a single export call so a stuck
  v2 collector can't backpressure the whole pipeline.

Registry push AuthorizationPolicy — the mesh-level twin of Phase 1's scan
gate:
  The vulnerability-scan admission gate (Phase 1) only matters if the ONLY
  way to push an image is through the path that triggers it. This policy
  makes that true at the network level: only the CI/CD pipeline's mesh
  identity may PUT/POST/PATCH/DELETE against /v2/*/manifests/* or
  /v2/*/blobs/* — every other identity, including Controller Manager and
  every application Pod pulling its own image, is GET/HEAD (pull) only.
  Independent of any application code, RBAC, or registry-side auth — a
  compromised in-cluster workload simply cannot push, full stop.

mTLS & the platform-as-its-own-first-tenant:
  STRICT mTLS covers the 5 meshed control-plane services above. Every one
  of their Envoy sidecars emits RED-method metrics and trace spans for free
  (Phase 5, Sections 1–2) — a scheduling decision, a controller reconcile's
  API calls, a registry pull, and the OTel Collector's own export calls all
  flow into the SAME Prometheus/Tempo stack they help operate. The
  platform's control plane is, deliberately, the first and best-instrumented
  "tenant" of its own observability product.`,
    },
  ],
};

export const KUBERNETES_QNA = [
  {
    id: "kq1",
    category: "Architecture",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Google", "Amazon", "Microsoft"],
    question: "Design a container orchestration platform on top of Docker and Kubernetes. Walk me through exactly what happens, end to end, when you run 'kubectl apply -f deployment.yaml'.",
    answer: `One write fans out through about nine independently-running components, none of which talk to each other directly — every one of them just reacts to a watch event on an object some OTHER component wrote.

1. kubectl sends the Deployment manifest to the API SERVER (apiServerEtcd).
   It passes AuthN -> RBAC -> MUTATING admission webhooks (this is where the
   service mesh and OTel auto-instrumentation sidecars get injected into the
   POD TEMPLATE, even though no Pod exists yet) -> schema validation ->
   VALIDATING webhooks (e.g. "every image must be scan-PASSED") -> an etcd
   Raft-committed write under /registry/deployments/{ns}/{name}.

2. The DEPLOYMENT CONTROLLER's informer gets a watch event, sees a Deployment
   with no matching ReplicaSet, and creates one (another etcd write, another
   admission pass).

3. The REPLICASET CONTROLLER's informer sees a ReplicaSet with 0/N Pods and
   creates N Pod objects — each with spec.nodeName empty.

4. KUBE-SCHEDULER's informer sees Pods with no nodeName, runs Filter -> Score
   -> Bind for each (sampling ~5-50% of nodes via percentageOfNodesToScore at
   this scale), and writes spec.nodeName via the Binding subresource.

5. The KUBELET on that node sees a Pod bound to it. Via CRI it calls
   RunPodSandbox (creates the pause container, CNI ADD allocates a pod IP),
   pulls the image (registryService — local AZ pull-through cache on a cache
   hit), then CreateContainer/StartContainer for each container (containerd
   -> runc, namespaces + cgroups from the Pod's resource requests).

6. kubelet starts running the READINESS PROBE. Once it passes, the
   ENDPOINTSLICE CONTROLLER adds this Pod's IP to every Service whose
   selector matches it; KUBE-PROXY's next sync programs the iptables/IPVS
   DNAT rules — traffic starts arriving.

7. Meanwhile, cAdvisor (in kubelet) is already exposing this container's
   metrics; Prometheus's kubernetes_sd_configs picks it up as a new scrape
   target automatically; if it was auto-instrumented in step 1, its first
   trace spans and structured logs (carrying trace_id) are already flowing
   to the OTel Collector and Fluent Bit DaemonSets.

KEY INSIGHT: there is no orchestrator-of-orchestrators. "Deploying an app" is
really "writing one object and letting eight separately-running, idempotent,
level-based reconciliation loops each notice their own small slice of the
resulting diff."`,
    followups: [
      "What happens if the scheduler successfully binds the pod, but the kubelet on that node can't pull the image because the registry is down? Walk through the failure and what eventually recovers it.",
      "How would this sequence differ for a StatefulSet instead of a Deployment — what changes, and what stays exactly the same?",
      "If the OTel auto-instrumentation mutating webhook (step 1) is down when this Deployment is created, what happens to the Pods — do they fail to start, or just go untraced? Why?",
    ],
  },
  {
    id: "kq2",
    category: "Concurrency",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Google", "Red Hat", "VMware"],
    question: "Dozens of controllers can read and update the same Kubernetes object around the same time — a Pod's status alone is written by kubelet, the scheduler, and multiple controllers. How does Kubernetes avoid lost updates without a distributed lock?",
    answer: `Three mechanisms layer together — none of them is a lock.

1. OPTIMISTIC CONCURRENCY (resourceVersion):
   Every object carries etcd's mod_revision as resourceVersion. A writer
   reads the object (gets resourceVersion N), computes its change, and
   writes back "only if resourceVersion is still N" (etcd compare-and-swap
   inside a Txn). If someone else wrote in between, the Txn's compare fails,
   apiserver returns 409, and the writer GETs the new version, RE-APPLIES
   its intended change on top, and retries. The retry is cheap because
   controllers are IDEMPOTENT — "ensure 3 replicas exist" computed against a
   slightly newer base state still produces the right action.

2. SERVER-SIDE APPLY — FIELD-LEVEL OWNERSHIP:
   Different controllers often want to own DIFFERENT FIELDS of the SAME
   object (e.g. the HPA owns spec.replicas, the user's kubectl apply owns
   spec.template, the Deployment controller owns status.*). Server-side
   apply tracks WHICH MANAGER last set WHICH FIELD (managedFields metadata)
   and merges on a per-field basis — two managers writing DIFFERENT fields
   never conflict at all; only a genuine same-field conflict triggers a 409
   that surfaces to the user, not silently overwritten.

3. LEADER ELECTION FOR SINGLETON DECISIONS:
   For decisions that genuinely must NOT be made twice (e.g. "should this
   Deployment's rolling update advance to the next step"), the relevant
   controller runs N replicas but only ONE — the Lease holder — acts at a
   time (Phase 2 / the serviceMesh component's controller-manager LB-only
   rationale). This isn't a per-object lock; it's a per-CONTROLLER-TYPE
   lock, which is a much coarser (and cheaper) thing to coordinate.

WHY THIS IS ENOUGH:
   Combine optimistic retries (cheap, idempotent) with level-based
   reconciliation (Phase 2 — a controller re-derives its action from current
   state every time, never from "what I remember I last did") and you get
   correctness without ever blocking a reader OR a writer waiting for a lock
   — at the cost of occasional wasted work on a 409 retry, which at this
   platform's etcd write rate (~1-2K/sec, Phase 1) is noise.`,
    followups: [
      "Two controllers both try to set the SAME field on the same object in the same reconcile cycle — what does server-side apply actually do, and which one 'wins'?",
      "If etcd's Raft cluster loses quorum (2 of 5 members reachable), what happens to in-flight optimistic-concurrency writes — do they fail loudly, hang, or silently succeed against stale data?",
      "How is this fundamentally different from optimistic locking with a version column in a SQL database — or is it the same idea wearing different clothes?",
    ],
  },
  {
    id: "kq3",
    category: "Scalability",
    difficulty: "Hard",
    round: "Onsite — System Design",
    asked_at: ["Google", "Uber", "Amazon"],
    question: "This platform's metrics describe a 5,000-node, 150,000-pod cluster. What's the FIRST thing that breaks as you keep growing it, and how do you fix each bottleneck in turn?",
    answer: `Scaling a single cluster hits a sequence of DIFFERENT bottlenecks, roughly in this order — and the eventual fix is "stop scaling one cluster."

1. ETCD DATABASE SIZE (not write throughput):
   Write QPS (~1-2K/sec, Phase 1) stays comfortably under etcd's ~10K/sec
   ceiling. What actually fills up is the default 8GB DB size — driven by
   OBJECT COUNT, especially un-TTL'd Events. FIX: aggressive Event TTLs,
   scheduled compaction + defragmentation, and moving high-volume CRDs to
   their OWN etcd cluster behind a separate apiserver (apiserver
   aggregation) so the core object types don't compete for space.

2. API SERVER WATCH CACHE MEMORY:
   Each apiserver replica keeps an in-memory cache of (roughly) every object
   it serves watches for. More replicas = more COPIES of that cache, so
   "scale out the apiserver" has a memory cost that grows with both cluster
   size AND replica count. FIX: increase replica memory limits, and reduce
   the number of distinct watched types under heavy load (e.g. move
   high-churn CRDs to the separate apiserver from #1).

3. KUBE-PROXY IPTABLES RULE COUNT:
   O(n) rule evaluation per packet starts showing up in p99 latency around a
   few thousand Services. FIX: switch to IPVS (O(1) hash lookup) or, better,
   an eBPF dataplane (Cilium) that bypasses netfilter entirely.

4. SCHEDULER THROUGHPUT UNDER A SINGLE ACTIVE INSTANCE:
   Only one scheduler replica is ever "the" scheduler for a given profile
   (leader election). percentageOfNodesToScore keeps PER-POD latency bounded
   even at 5,000 nodes, but aggregate THROUGHPUT (pods/sec during a mass
   rollout) is still bounded by one process. FIX: multiple scheduler
   profiles (Phase 3's schedulerService) partition the pod population by
   schedulerName, running in parallel — not a single scheduler scaling out,
   but the WORKLOAD splitting across multiple independent schedulers.

5. PROMETHEUS ACTIVE SERIES (Phase 1's ~2M samples/sec):
   Functional sharding + remote-write to Thanos/Cortex/Mimir, as covered in
   Phase 5.

THE EVENTUAL ANSWER — MULTI-CLUSTER:
   Past roughly this scale, the standard answer stops being "make this
   cluster bigger" and becomes "run multiple clusters with a thin fleet
   layer on top." The cost is real: cross-cluster service discovery,
   duplicated control-plane overhead, and a scheduling layer ABOVE
   Kubernetes that decides WHICH cluster a workload lands in. The benefit is
   blast-radius isolation — an etcd incident in one cluster takes down ONE
   cluster's capacity, not the whole fleet.`,
    followups: [
      "At what cluster size would you actually recommend splitting into multiple clusters, and what concretely gets harder on day 1 after the split?",
      "You add etcd members hoping for 'more availability' — does write latency get better, worse, or stay the same, and why?",
      "Switching kube-proxy from iptables to an eBPF dataplane (Cilium) — what specifically improves, and what do you give up or need to re-validate (e.g. NetworkPolicy behavior)?",
    ],
  },
  {
    id: "kq4",
    category: "Observability",
    difficulty: "Hard",
    round: "Deep Dive",
    asked_at: ["Datadog", "Grafana Labs", "Google"],
    question: "Design the metrics pipeline for this platform end-to-end — how does a single container's CPU usage become a number on a Grafana dashboard, and how do you stop that pipeline from collapsing under its own cardinality at 150K pods?",
    answer: `THE HAPPY PATH (Phase 5, Section 1):
   cgroup cpu.stat (inside the container) -> cAdvisor (built into kubelet,
   polls every ~10s) -> exposed at https://<node>:10250/metrics/cadvisor,
   labeled with pod/namespace/container/image -> Prometheus discovers this
   target via kubernetes_sd_configs (List+Watch on the API server, same
   mechanism every controller uses) -> scraped every 15s into the TSDB ->
   a RECORDING RULE pre-aggregates
   sum(rate(container_cpu_usage_seconds_total[5m])) by (namespace) on a
   schedule -> Grafana queries that cheap pre-aggregated series.
   In parallel, kube-state-metrics (a separate Deployment) exposes the
   CONTROL PLANE's view — replica counts, pod phases — as its own metrics,
   and metrics-server provides the no-history "right now" view that HPA
   polls.

WHY THIS COLLAPSES AT SCALE — CARDINALITY, NOT VOLUME:
   ~225,000 containers * ~90 metrics each / 15s ≈ 1.35M samples/sec from
   cAdvisor alone (Phase 1, derivation #4). The problem isn't disk
   throughput — it's ACTIVE SERIES COUNT. Every metric name is multiplied by
   every UNIQUE COMBINATION of its label values, and "pod" is a label on
   almost everything. Every Deployment rollout creates Pods with brand-new
   names — so EVERY rollout creates a fresh set of time series for EVERY
   metric, for EVERY replica, while the OLD series linger until their
   retention window expires. A single Prometheus tops out around 1-2M active
   series; this platform's steady state is already near that BEFORE counting
   the churn from constant rollouts.

MITIGATIONS, IN ORDER OF IMPACT:
   1. metric_relabel_configs DROP high-cardinality labels that add no
      analytical value at the dashboard level — container_id, pod_uid.
   2. Recording rules aggregate BY DEPLOYMENT/NAMESPACE, not by pod —
      dashboards and alerts should almost never need a per-pod series; the
      pod-level data can have much shorter retention than the aggregated
      series.
   3. FUNCTIONAL SHARDING — split Prometheus instances by team/namespace-
      group, each remote-writing to Thanos/Cortex/Mimir, which presents one
      global query view and can enforce PER-TENANT SERIES LIMITS so one
      team's bad label choice can't take down everyone's metrics.
   4. Tiered retention: raw high-cardinality series for hours/days,
      aggregated series for weeks/months.

THE ON-CALL DETECTION STORY:
   Cortex/Mimir's per-tenant series limits mean a bad label choice causes
   THAT TENANT's new series to be REJECTED (with a clear error in their
   scrape target's "up" status and a corresponding alert) rather than
   silently degrading the shared TSDB for everyone — cardinality problems
   become a visible, attributable, per-team issue instead of a platform-wide
   incident.`,
    followups: [
      "A new microservice adds a label containing a user_id, and Prometheus memory triples overnight. How do you DETECT this quickly, and what's your mitigation — without forcing every team to ship a code fix immediately?",
      "How would this design change if the platform needed 1-second-resolution metrics for autoscaling instead of 15-second — what gets more expensive, and where would you draw the line on what gets that resolution?",
      "metrics-server and Prometheus both ultimately read cAdvisor data — why maintain two separate paths instead of having HPA query Prometheus directly?",
    ],
  },
  {
    id: "kq5",
    category: "Observability",
    difficulty: "Medium",
    round: "System Design Round 1",
    asked_at: ["NVIDIA", "Datadog", "New Relic"],
    question: "How do you get distributed tracing working across a fleet of microservices running on this Kubernetes platform — without asking every team to add a tracing library to their code?",
    answer: `AUTO-INSTRUMENTATION VIA ADMISSION WEBHOOK (Phase 5, Section 2):
   The OpenTelemetry Operator watches for Pods carrying an annotation like
   instrumentation.opentelemetry.io/inject-java: "true". Its MUTATING
   ADMISSION WEBHOOK (the same admission-chain mechanism every Pod create
   passes through, Phase 2) rewrites the Pod spec at creation time: an
   init-container copies a language-specific OTel agent into a shared
   volume, and environment variables (e.g. JAVA_TOOL_OPTIONS=-javaagent:...)
   point the runtime at it. The TEAM CHANGES NOTHING — they add one
   annotation, or a platform team adds it for them via policy.

THE SERVICE MESH AS A TRACING FLOOR:
   Even for a Pod that ISN'T annotated (a legacy binary nobody wants to
   touch), its Envoy sidecar still emits a span for every proxied request —
   a "front door" span with latency and status code. So tracing coverage has
   TWO LAYERS: a uniform, app-agnostic mesh-level layer (every service, zero
   config), plus a richer app-level layer (business-logic detail) for
   anything that opts in. You get a usable trace across a chain of mixed
   instrumented/uninstrumented services either way.

SAMPLING — THE NECESSARY EVIL:
   At this platform's traffic volume, tracing 100% of requests is too
   expensive to store. HEAD-BASED sampling (decide at the first span, e.g.
   keep 1%) is cheap but likely misses the rare error you actually care
   about. TAIL-BASED sampling buffers all of a trace's spans for a few
   seconds and decides AFTER seeing the outcome — keep 100% of errors/slow
   traces, 1% of boring ones — but requires routing every span of one trace
   to the SAME Collector replica (consistent hashing on trace-id), so
   tail-sampling Collectors run centrally, not per-node.

CLOSING THE LOOP WITH METRICS AND LOGS:
   Once instrumented, the OTel SDK injects the active trace_id into both
   Prometheus EXEMPLARS (so a latency-graph spike links directly to a
   sample trace) and the application's structured LOG output (so a trace
   can pivot directly to the exact log lines for that request) — Phase 5,
   Section 3's "three pillars, one pane of glass."`,
    followups: [
      "What's the actual resource and pod-startup-latency cost of injecting an init-container + Java agent into every pod — how would you measure whether that cost is acceptable platform-wide?",
      "The OTel Collector DaemonSet on one node crashes for two minutes. What happens to traces from pods on that node during that window — are they lost, and does it matter for this design?",
      "If most cross-service calls hop between availability zones, how does that affect tail-based sampling's consistent-hash routing, and what would you change?",
    ],
  },
  {
    id: "kq6",
    category: "Networking",
    difficulty: "Medium",
    round: "System Design Round 1",
    asked_at: ["Amazon", "Cisco", "Cloudflare"],
    question: "A client sends a request to a Kubernetes Service's ClusterIP. Trace exactly how that packet reaches a healthy pod — and what changes one second later if that pod fails its readiness probe?",
    answer: `GETTING AN IP IN THE FIRST PLACE (CNI, Phase 4):
   Each backing Pod got its IP at creation time via the CNI plugin's ADD
   call — IPAM allocates an address from the node's subnet, a veth pair
   connects the Pod's network namespace to the host, and a route is
   installed so traffic to that IP reaches the veth.

THE PACKET'S PATH (iptables mode):
   1. Client sends to ClusterIP 10.96.12.4:80.
   2. On the node handling that packet, KUBE-SERVICES matches destination
      10.96.12.4:80 and jumps to KUBE-SVC-CHECKOUT.
   3. KUBE-SVC-CHECKOUT has one KUBE-SEP rule per ready backend, selected via
      "-m statistic --mode random --probability X" — effectively random
      weighted selection across N backends.
   4. The chosen KUBE-SEP rule DNATs to a specific Pod IP:port
      (e.g. 10.244.14.37:8080).
   5. Return traffic is un-DNAT'd by conntrack, so the client never sees the
      Pod's real IP.
   (ipvs mode replaces steps 2-4 with an O(1) IPVS hash-table lookup; an eBPF
   dataplane like Cilium skips iptables/netfilter and routing decisions are
   made in-kernel at the socket layer.)

ONE SECOND LATER — THE POD FAILS ITS READINESS PROBE:
   1. kubelet (Phase 1) marks the container NotReady — it does NOT restart
      it; readiness != liveness.
   2. The EndpointSlice controller's informer sees the Pod's condition
      change and removes its address from the relevant EndpointSlice.
   3. kube-proxy's watch on EndpointSlices fires; its next sync (sub-second)
      deletes the KUBE-SEP-N rule for that Pod.
   4. New connections to the ClusterIP simply never get DNAT'd to that Pod
      again. EXISTING established connections are NOT forcibly torn down by
      this alone — the app itself usually needs to stop accepting new work
      and let in-flight requests drain.
   NOTHING about the Pod object, the Service object, or the Deployment
   changed — the only state that moved is the EndpointSlice and the
   iptables/IPVS rules derived from it.`,
    followups: [
      "A client cached the ClusterIP's DNS resolution (or holds a long-lived connection) before the pod went NotReady — where in this flow does it still end up at the bad pod, and how do you mitigate that?",
      "If the destination namespace has a default-deny NetworkPolicy, at which step does this packet actually get dropped, and by what component?",
      "How does this entire flow change for a headless Service (clusterIP: None) backing a StatefulSet?",
    ],
  },
  {
    id: "kq7",
    category: "Scalability",
    difficulty: "Medium",
    round: "System Design Round 1",
    asked_at: ["Google", "Microsoft", "Spotify"],
    question: "Design auto-scaling for this platform using HPA, VPA, and Cluster Autoscaler. How do the three interact, and where do they actively conflict?",
    answer: `THREE AXES, THREE TIMESCALES:
   HPA changes REPLICA COUNT (seconds), VPA changes per-Pod RESOURCE
   REQUESTS (minutes, via eviction+recreate), Cluster Autoscaler changes
   NODE COUNT (minutes, gated by cloud-provider boot time).

HPA:
   desiredReplicas = ceil(currentReplicas * currentMetric / targetMetric),
   polled every 15s against metrics-server or the Prometheus Adapter for
   custom metrics (queue depth, RPS). Scale-up is immediate; scale-down has
   a 5-minute stabilization window to avoid flapping.

VPA:
   Its Recommender watches the SAME usage data (metrics-server) and, in
   "Auto" mode, evicts and recreates Pods with updated
   resources.requests/limits based on a percentile model of recent usage.

THE CONFLICT — CPU UTILIZATION IS A RATIO:
   If HPA scales on CPU UTILIZATION (usage/request) and VPA is ALSO
   adjusting the request for the same workload, the two can oscillate: VPA
   raises the request -> utilization (the ratio) drops -> HPA reads "lower
   utilization" and scales DOWN replicas -> remaining replicas take more
   load -> utilization rises again -> HPA scales back up. NEITHER controller
   is "wrong" — they're just both reacting to a number the OTHER one just
   changed. FIX: HPA on a metric VPA doesn't influence (RPS, queue depth),
   VPA on resources — never both on CPU for the same workload.

CLUSTER AUTOSCALER — THE SLOWEST LAYER, AND WHY:
   CA reacts to Pods stuck Pending (no node has room). Its scale-up isn't
   slow because of CA's logic — it's slow because a NEW NODE must boot,
   register via kubelet's first heartbeat (Phase 2), AND pull every image
   its first batch of Pods needs (Phase 1's pull-burst derivation, mitigated
   by the per-AZ registry cache) before it's schedulable. 1-3 minutes is
   typical. HPA can ask for new replicas in 15 seconds; if there's no room,
   those Pods sit Pending for that 1-3 minute gap — a real, user-visible
   latency that has to be accounted for in SLOs, not hidden.

PODDISRUPTIONBUDGET — THE BRAKE ON SCALE-DOWN:
   minAvailable: 2 on a 3-replica Deployment caps how many of those Pods CA
   (or a node drain) can evict AT ONCE to 1 — explicitly trading scale-down/
   maintenance speed for availability.`,
    followups: [
      "During that 1-3 minute Cluster Autoscaler gap, HPA-requested pods sit Pending. How would you design around this for a latency-sensitive service — over-provisioning, priority classes, something else?",
      "Why doesn't HPA support minReplicas: 0 by default, and how would you design 'scale to zero' for a rarely-used batch workload on top of this platform?",
      "VPA's Recommender needs historical usage data to make a recommendation — what does it do for a brand-new Deployment with zero history, and what's the risk during that bootstrap period?",
    ],
  },
  {
    id: "kq8",
    category: "Estimation",
    difficulty: "Medium",
    round: "System Design Screen",
    asked_at: ["Google", "Datadog", "Amazon"],
    question: "Back-of-the-envelope: for a 5,000-node cluster running ~150,000 pods, estimate (a) etcd write throughput, (b) API server QPS, and (c) Prometheus ingestion rate — and tell me what actually limits each one.",
    answer: `(a) ETCD WRITE THROUGHPUT:
   Node heartbeats: 5,000 nodes / 10s lease renewal ≈ 500 writes/sec.
   Pod churn: assume ~5% of 150,000 pods change phase/condition per minute
   ≈ 125 writes/sec.
   TOTAL ≈ 1,000-2,000 writes/sec including Events/ConfigMaps — well under
   etcd's ~10K/sec ceiling at <10ms p99.
   ACTUAL LIMIT: not throughput — etcd's default 8GB DB SIZE, driven by
   OBJECT COUNT (especially un-TTL'd Events), forcing periodic compaction.

(b) API SERVER QPS:
   Dominated NOT by per-write traffic but by ~5,000 kubelets + hundreds of
   controller/operator replicas each holding long-lived WATCH connections
   plus periodic full resyncs (~every 30min per watcher) ≈ ~50K req/sec
   aggregate.
   ACTUAL LIMIT: the per-replica WATCH CACHE's memory footprint — more
   apiserver replicas means more COPIES of that cache, so horizontal scaling
   has a real memory cost, not just a CPU one.

(c) PROMETHEUS INGESTION RATE:
   ~225,000 containers (150K pods * ~1.5) * ~90 cAdvisor metrics / 15s ≈
   1.35M samples/sec, plus kube-state-metrics and node-exporter pushing the
   total to roughly ~2M samples/sec.
   ACTUAL LIMIT: NOT disk write throughput — ACTIVE SERIES CARDINALITY.
   A single Prometheus tops out around 1-2M active series; constant pod
   churn from rollouts means cardinality grows even faster than raw sample
   rate, forcing functional sharding + a horizontally-scalable remote-write
   backend (Thanos/Cortex/Mimir).

THE PATTERN ACROSS ALL THREE:
   In every case, the naive "requests per second" number is comfortably
   within range — the REAL constraint is a SIZE or CARDINALITY dimension
   (etcd DB size, watch-cache memory, active series count) that scales with
   OBJECT COUNT and CHURN, not with raw request rate. This is the recurring
   lesson for capacity-planning any Kubernetes control plane.`,
    followups: [
      "If this cluster doubled to 10,000 nodes / 300,000 pods, which of these three numbers scales roughly linearly, and which scales WORSE than linearly — and why?",
      "If average pods-per-node dropped from 30 to 10 (more, smaller nodes) while keeping total pod count fixed at 150,000, how does each of (a), (b), (c) change?",
      "If you could only put ONE alert on this control plane's dashboard, which of these three would you choose to page on first, and why?",
    ],
  },
  {
    id: "kq9",
    category: "Architecture",
    difficulty: "Hard",
    round: "Senior Level Deep Dive",
    asked_at: ["NVIDIA", "Uber", "Lyft"],
    question: "This design adds a service mesh (Istio/Envoy) on top of Kubernetes, which already provides Services, kube-proxy, and NetworkPolicy. What does the mesh actually buy you — and what does it cost at 225,000 containers?",
    answer: `WHAT KUBERNETES ALREADY GIVES YOU (Phase 4):
   - Services/kube-proxy: L4 load balancing, random or round-robin, across
     whatever's in an EndpointSlice.
   - NetworkPolicy: L3/L4 allow/deny — "namespace A can talk to namespace B
     on port 8080" — enforced by the CNI's data plane.
   Neither of these is AWARE of the traffic's content, identity, or outcome.

WHAT THE MESH ADDS:

1. mTLS WITHOUT APPLICATION CHANGES:
   PeerAuthentication: STRICT gives every meshed service cryptographic
   identity and encrypts ALL traffic between them — NetworkPolicy can say
   WHO may connect, but says nothing about WHETHER that traffic is
   encrypted or who it cryptographically proves to be.

2. L7 TRAFFIC MANAGEMENT:
   DestinationRule outlierDetection (circuit breaking on 5xx rate),
   VirtualService weighted/header-based canary routing, per-try timeouts and
   retry policies on specific error classes (5xx, reset, connect-failure).
   kube-proxy's L4 load balancing has NO concept of "this backend is
   returning errors, stop sending it traffic" — that's an L7 decision the
   mesh makes that Kubernetes natively cannot.

3. FINE-GRAINED, L7 AUTHORIZATION:
   AuthorizationPolicy restricts by HTTP METHOD AND PATH per service
   identity — e.g. this design's registry-push-restriction: only the CI/CD
   identity may PUT/POST/PATCH/DELETE /v2/*/manifests/*, everyone else is
   GET/HEAD only. NetworkPolicy's L3/L4 model can say "the registry is
   reachable from this namespace" but CANNOT distinguish "reachable to PULL"
   from "reachable to PUSH" — that distinction doesn't exist below L7.

4. UNIFORM OBSERVABILITY (THE BIGGEST MULTIPLIER, Phase 5):
   Every Envoy sidecar emits RED-method metrics and trace spans for EVERY
   proxied request — for free, regardless of the application's language or
   whether it's instrumented at all. This is the "tracing floor" from
   kq5 — without the mesh, an uninstrumented legacy service is a black hole
   in your traces; with it, you at least get latency/status-code per hop.

THE COST:
   ~1-2ms latency per hop, plus a sidecar process per Pod — at ~225,000
   containers (Phase 1), even a modest 50-100MB memory footprint per sidecar
   is tens of terabytes of aggregate memory cluster-wide. This is EXACTLY
   why this design's serviceMesh component explicitly scopes the mesh to 5
   control-plane services and excludes the CNI agent, etcd, and the data
   layer — meshing EVERYTHING is rarely worth the cost; meshing the services
   where L7 policy or canary/circuit-breaking actually matters is.`,
    followups: [
      "Given the aggregate sidecar cost at 225,000 containers, how would you decide, for an arbitrary NEW service, whether it belongs in the mesh — what's your decision rule?",
      "AuthorizationPolicy gives L7 method+path restrictions 'for free' once a service is in the mesh — what would it take to achieve the SAME registry-push restriction WITHOUT a service mesh?",
      "If Istiod (the mesh control plane) goes down for 10 minutes, what happens to EXISTING connections between meshed services — do they keep working, degrade, or fail immediately, and why?",
    ],
  },
];
