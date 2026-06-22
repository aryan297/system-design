export const GO_MONOREPO_CATEGORIES = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Overview
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "overview",
    icon: "🏗️",
    title: "Overview",
    topics: [
      {
        id: "why-monorepo",
        title: "Why a Go Monorepo?",
        summary: "The case for a single repo over per-service repos in Go microservices",
        explanation:
          "A monorepo keeps all services, shared libraries, proto definitions, and deployment configs in one place. In a polyrepo world, updating a shared library means opening PRs across 10 repos, syncing versions, and praying CI stays green. With a Go workspace (go.work), changes to a shared lib are immediately visible to every service in the repo — no publish/bump cycle needed. This mirrors what Nx does for Node.js but uses Go's native tooling.",
        keyPoints: [
          "One `go.work` file replaces cross-repo `replace` directives — the Go toolchain resolves all modules locally",
          "Atomic commits: a breaking lib change and all its call-site fixes land in one PR",
          "Shared tooling: one Makefile, one CI pipeline, one linter config",
          "Services stay fully independent — each has its own `go.mod`, Dockerfile, and `cmd/main.go`",
          "Scales to 10–50 microservices without losing per-service autonomy",
        ],
        gotchas: [
          "`go.work` is for local development; production builds should vendor or use module proxies — never ship a workspace binary",
          "A huge monorepo can slow `go build ./...` — use `go build ./apps/my-service/...` to scope builds",
          "Don't put secrets in a monorepo `.env` at root — each service should own its own config",
        ],
        code: `// go.work — the root workspace file
// Run: go work init && go work use ./apps/... ./libs/...

go 1.24

use (
    // Services
    ./apps/api-gateway
    ./apps/auth-service
    ./apps/user-service
    ./apps/webhook-service
    ./apps/event-service
    ./apps/dispatcher-service
    ./apps/retry-service
    ./apps/notification-service

    // Shared libraries
    ./libs/logger
    ./libs/kafka
    ./libs/redis
    ./libs/grpc
    ./libs/jwt
    ./libs/middleware
    ./libs/response
    ./libs/errors
    ./libs/config
    ./libs/tracing
    ./libs/metrics
)`,
      },
      {
        id: "vs-nx",
        title: "Go Monorepo vs NestJS Nx",
        summary: "Mental model mapping between the two ecosystems",
        explanation:
          "If you come from NestJS/Nx, the Go monorepo maps almost 1-to-1. `libs/` in Go replaces Nx libraries. `apps/` replaces Nx apps. `go.work` is the Go equivalent of `nx.json` — it tells the toolchain which modules exist locally. The key difference: Nx has a build graph with caching; Go has incremental compilation baked in. Nx has generators; Go has `go generate` and Makefile targets.",
        keyPoints: [
          "Nx `@acme/logger` library → `github.com/you/go-mono/libs/logger` module",
          "Nx `affected` builds → `go build ./apps/my-service/...` (Go figures out what changed)",
          "Nx `project.json` per service → `go.mod` per service",
          "Nx `tsconfig paths` → `go.work use` directives",
          "Nx plugins/generators → Makefile targets or `go generate` directives",
          "Both share the same philosophy: independent deployable units + shared reusable code",
        ],
        gotchas: [
          "Go has no concept of 'affected' — you run tests per-service or write a script to detect changed modules from `git diff`",
          "Unlike Nx, Go's workspace doesn't enforce visibility — any module can import any other. Use code review to enforce boundaries",
        ],
        code: `// NestJS Nx import:
// import { Logger } from '@acme/logger';

// Equivalent Go import:
import (
    "github.com/aryan297/go-microservices/libs/logger"
    "github.com/aryan297/go-microservices/libs/kafka"
    "github.com/aryan297/go-microservices/libs/redis"
)

// go.work makes these local — no need to publish libs/logger to a registry.
// The toolchain resolves github.com/aryan297/go-microservices/libs/logger
// to ./libs/logger on your local filesystem.

func main() {
    log := logger.New("webhook-service")
    log.Info("service started")
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Root Structure
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "root-structure",
    icon: "📁",
    title: "Root Structure",
    topics: [
      {
        id: "top-level",
        title: "Top-Level Layout",
        summary: "The six root directories and what lives in each",
        explanation:
          "The root of the monorepo has exactly six directories plus a handful of root files. `apps/` holds independently deployable services. `libs/` holds shared packages imported by services. `proto/` holds Protobuf definitions that generate Go and client code. `deployments/` holds all infrastructure-as-code. `docs/` holds architecture decision records, diagrams, and API docs. `scripts/` holds shell scripts that automate common tasks.",
        keyPoints: [
          "`apps/` — every subdirectory is a service with its own `go.mod`",
          "`libs/` — every subdirectory is a shared Go module (no business logic, just infrastructure)",
          "`proto/` — single source of truth for all gRPC contracts",
          "`deployments/` — Docker, Kubernetes, Helm, Terraform; never hardcode env in source",
          "`docs/` — Architecture Decision Records (ADRs) track *why* decisions were made",
          "`scripts/` — all human-runnable automation; CI calls these same scripts",
          "Root files: `go.work`, `Makefile`, `docker-compose.yml`, `.env.example`, `.gitignore`",
        ],
        code: `go-microservices/
├── apps/
│   ├── api-gateway/
│   ├── auth-service/
│   ├── user-service/
│   ├── webhook-service/
│   ├── event-service/
│   ├── dispatcher-service/
│   ├── retry-service/
│   ├── dlq-service/
│   ├── notification-service/
│   └── analytics-service/
│
├── libs/
│   ├── config/
│   ├── logger/
│   ├── database/
│   ├── redis/
│   ├── kafka/
│   ├── grpc/
│   ├── jwt/
│   ├── middleware/
│   ├── response/
│   ├── validator/
│   ├── pagination/
│   ├── errors/
│   ├── tracing/
│   ├── metrics/
│   ├── eventbus/
│   ├── cache/
│   ├── auth/
│   ├── queue/
│   └── utils/
│
├── proto/
│   ├── auth/
│   ├── user/
│   ├── webhook/
│   └── notification/
│
├── deployments/
│   ├── docker/
│   ├── k8s/
│   ├── helm/
│   └── terraform/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── adr/
│   └── diagrams/
│
├── scripts/
│   ├── setup.sh
│   ├── migrate.sh
│   ├── seed.sh
│   ├── proto.sh
│   └── test.sh
│
├── Makefile
├── docker-compose.yml
├── go.work
├── .env.example
├── .gitignore
└── README.md`,
      },
      {
        id: "go-work",
        title: "go.work — The Workspace File",
        summary: "How go.work ties all modules together for local development",
        explanation:
          "The `go.work` file is the secret sauce that makes a Go monorepo feel like Nx. Without it, importing `libs/logger` from `apps/webhook-service` would require either publishing the lib or adding a `replace` directive to every service's `go.mod`. With `go.work`, you declare all modules once and the Go toolchain resolves them locally. This file lives at the repo root and is committed to version control.",
        keyPoints: [
          "Initialize: `go work init` at the root, then `go work use ./apps/webhook-service ./libs/logger`",
          "Add a module: `go work use ./apps/new-service`",
          "Run any Go command from the root and it respects the workspace",
          "`go.work.sum` is the workspace's sum database — commit it alongside `go.work`",
          "The `go.work` file does NOT replace each service's `go.mod` — both coexist",
          "In CI/CD, set `GOWORK=off` or use `go mod vendor` to build without workspace resolution",
        ],
        gotchas: [
          "Never commit a binary built with workspace resolution — always build with `GOWORK=off` or vendor mode in CI",
          "`go work sync` updates the sum file after adding/removing modules — run it after structural changes",
          "If a service imports a lib that isn't in `go.work use`, the build will fail with a confusing 'module not found' error",
        ],
        code: `// go.work
go 1.24

use (
    ./apps/api-gateway
    ./apps/auth-service
    ./apps/user-service
    ./apps/webhook-service
    ./apps/event-service
    ./apps/dispatcher-service
    ./apps/retry-service
    ./apps/dlq-service
    ./apps/notification-service
    ./apps/analytics-service

    ./libs/config
    ./libs/logger
    ./libs/database
    ./libs/redis
    ./libs/kafka
    ./libs/grpc
    ./libs/jwt
    ./libs/middleware
    ./libs/response
    ./libs/validator
    ./libs/errors
    ./libs/tracing
    ./libs/metrics
    ./libs/eventbus
    ./libs/utils
)

// ── Adding a new service ──
// 1. mkdir apps/my-service && cd apps/my-service
// 2. go mod init github.com/aryan297/go-microservices/apps/my-service
// 3. cd ../.. && go work use ./apps/my-service
// Done — the workspace immediately resolves all libs/ for the new service`,
      },
      {
        id: "makefile",
        title: "Makefile",
        summary: "Centralised build, test, lint, and migration targets",
        explanation:
          "The root Makefile is the single entry point for all developer operations. It wraps `go` commands, Docker builds, proto generation, and database migrations into named targets. Every CI pipeline calls these same targets, ensuring local and CI environments are identical. Service-specific targets use the service name as a prefix.",
        keyPoints: [
          "`make build SERVICE=webhook-service` builds a specific service",
          "`make test` runs tests for all services in parallel",
          "`make proto` regenerates all gRPC/proto code",
          "`make migrate SERVICE=webhook-service` runs database migrations for a service",
          "`make lint` runs `golangci-lint` across the whole monorepo",
          "`make docker-build SERVICE=webhook-service` builds and tags a Docker image",
        ],
        code: `# Makefile

SERVICE ?= webhook-service

.PHONY: build test lint proto migrate docker-build docker-up

# Build a single service
build:
\t@echo "Building $(SERVICE)..."
\tcd apps/$(SERVICE) && GOWORK=off go build -o bin/$(SERVICE) ./cmd/main.go

# Build all services
build-all:
\t@for svc in apps/*/; do \
\t\techo "Building $$svc..."; \
\t\tcd $$svc && GOWORK=off go build ./... && cd ../..; \
\tdone

# Test all services
test:
\tgo test ./apps/... ./libs/... -race -cover

# Test a specific service
test-one:
\tgo test ./apps/$(SERVICE)/... -v -race

# Lint everything
lint:
\tgolangci-lint run ./...

# Generate proto stubs
proto:
\t./scripts/proto.sh

# Run migrations for a service
migrate:
\t./scripts/migrate.sh $(SERVICE)

# Build Docker image
docker-build:
\tdocker build -t $(SERVICE):latest -f apps/$(SERVICE)/Dockerfile .

# Spin up the full stack locally
docker-up:
\tdocker-compose up -d

docker-down:
\tdocker-compose down -v

# Add a new service
new-service:
\t@read -p "Service name: " name; \
\tmkdir -p apps/$$name/cmd apps/$$name/internal apps/$$name/configs apps/$$name/migrations; \
\tcd apps/$$name && go mod init github.com/aryan297/go-microservices/apps/$$name; \
\tcd ../.. && go work use ./apps/$$name; \
\techo "Created apps/$$name — add it to docker-compose.yml and go.work"`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Apps — Services
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "apps",
    icon: "⚙️",
    title: "Apps — Services",
    topics: [
      {
        id: "service-structure",
        title: "Single Service Layout",
        summary: "The internal anatomy of one microservice",
        explanation:
          "Each service under `apps/` is a self-contained Go module. It has its own `go.mod`, `Dockerfile`, config file, and migration folder. Inside `internal/` the code is organised by domain feature — each domain has its own controller, service, repository, DTO, entity, mapper, and a `module.go` that wires them together. A `shared/` package within `internal/` holds constants and enums that are local to the service but used across its features.",
        keyPoints: [
          "`cmd/main.go` — only wires the app together (no business logic)",
          "`internal/` — Go enforces that code here cannot be imported by other modules",
          "`internal/<domain>/controller/` — HTTP/gRPC handlers, no business logic",
          "`internal/<domain>/service/` — business logic, calls repository",
          "`internal/<domain>/repository/` — database access, implements an interface",
          "`internal/<domain>/dto/` — request/response shapes (JSON/proto)",
          "`internal/<domain>/entity/` — database model structs (GORM/sqlc)",
          "`internal/<domain>/mapper/` — converts entity ↔ dto",
          "`internal/<domain>/module.go` — dependency injection wiring for that domain",
          "`internal/<domain>/routes.go` — registers HTTP routes or gRPC service",
        ],
        code: `apps/
└── webhook-service/
    ├── cmd/
    │   └── main.go           // entry point — wires app, starts server
    │
    ├── configs/
    │   └── config.yaml       // service-specific config (DB, Kafka topics, ports)
    │
    ├── internal/
    │   ├── webhook/
    │   │   ├── controller/
    │   │   │   ├── webhook_controller.go
    │   │   │   └── webhook_controller_test.go
    │   │   ├── service/
    │   │   │   ├── webhook_service.go
    │   │   │   └── webhook_service_test.go
    │   │   ├── repository/
    │   │   │   ├── webhook_repository.go
    │   │   │   └── webhook_repository_test.go
    │   │   ├── dto/
    │   │   │   ├── create_webhook_request.go
    │   │   │   └── webhook_response.go
    │   │   ├── entity/
    │   │   │   └── webhook.go
    │   │   ├── mapper/
    │   │   │   └── webhook_mapper.go
    │   │   ├── routes.go     // registers Gin/Echo/Fiber routes
    │   │   └── module.go     // wire: NewWebhookModule(db, kafka) → controller
    │   │
    │   └── shared/
    │       ├── constants/
    │       │   └── topics.go
    │       └── enums/
    │           └── webhook_status.go
    │
    ├── migrations/
    │   ├── 001_create_webhooks.up.sql
    │   └── 001_create_webhooks.down.sql
    │
    ├── Dockerfile
    └── go.mod`,
      },
      {
        id: "cmd-main",
        title: "cmd/main.go — The Entry Point",
        summary: "What belongs in main.go and what doesn't",
        explanation:
          "The `cmd/main.go` file is the composition root — it initialises infrastructure (DB, Kafka, Redis), wires dependencies together, and starts the HTTP/gRPC server. It must contain no business logic. Think of it as a wiring diagram: it knows what exists and how things connect, but delegates all behaviour to the layers below.",
        keyPoints: [
          "Load config first — everything else depends on it",
          "Initialize infrastructure clients (DB, Redis, Kafka) with the loaded config",
          "Pass dependencies down via constructors — no global state",
          "Register routes/modules in one place",
          "Handle OS signals for graceful shutdown",
          "`main()` should be readable in under 60 lines — if it's longer, extract a `bootstrap` package",
        ],
        code: `package main

import (
    "context"
    "os"
    "os/signal"
    "syscall"

    "github.com/aryan297/go-microservices/libs/config"
    "github.com/aryan297/go-microservices/libs/database"
    "github.com/aryan297/go-microservices/libs/kafka"
    "github.com/aryan297/go-microservices/libs/logger"
    "github.com/aryan297/go-microservices/libs/redis"

    "github.com/aryan297/go-microservices/apps/webhook-service/internal/webhook"

    "github.com/gin-gonic/gin"
)

func main() {
    // 1. Load config
    cfg := config.Load("configs/config.yaml")

    // 2. Init infrastructure
    log := logger.New("webhook-service")
    db  := database.Connect(cfg.Database)
    rdb := redis.Connect(cfg.Redis)
    kfk := kafka.NewProducer(cfg.Kafka)

    // 3. Wire domain modules
    webhookModule := webhook.NewModule(db, rdb, kfk, log)

    // 4. Register routes
    r := gin.New()
    r.Use(gin.Recovery())
    webhookModule.RegisterRoutes(r.Group("/api/v1"))

    // 5. Start server + graceful shutdown
    srv := &http.Server{Addr: cfg.Port, Handler: r}
    go func() { srv.ListenAndServe() }()

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    srv.Shutdown(ctx)
    log.Info("webhook-service shut down cleanly")
}`,
      },
      {
        id: "module-pattern",
        title: "module.go — Dependency Wiring",
        summary: "How module.go connects controller → service → repository",
        explanation:
          "Each domain inside a service has a `module.go` that is the only file allowed to know the concrete implementations. It wires the repository into the service, the service into the controller, and returns a struct that can register itself onto a router. This means `main.go` only calls `webhook.NewModule(...)` — it never imports individual layers. Changing a repository implementation (e.g. swapping Postgres for DynamoDB) only requires changing `module.go`.",
        keyPoints: [
          "`NewModule` accepts infrastructure clients and returns a `Module` struct",
          "The `Module` exposes only `RegisterRoutes(router)` — callers can't reach internals",
          "All interfaces are defined in the `service/` layer — repository implements the interface",
          "This pattern makes unit testing trivial: inject a mock repository into the service",
          "No global variables, no `init()` functions, no singletons",
        ],
        code: `// internal/webhook/module.go
package webhook

import (
    "github.com/gin-gonic/gin"
    "gorm.io/gorm"

    "github.com/aryan297/go-microservices/libs/kafka"
    "github.com/aryan297/go-microservices/libs/logger"
    "github.com/aryan297/go-microservices/libs/redis"

    "github.com/aryan297/go-microservices/apps/webhook-service/internal/webhook/controller"
    "github.com/aryan297/go-microservices/apps/webhook-service/internal/webhook/repository"
    "github.com/aryan297/go-microservices/apps/webhook-service/internal/webhook/service"
)

type Module struct {
    controller *controller.WebhookController
}

func NewModule(db *gorm.DB, rdb *redis.Client, kfk *kafka.Producer, log logger.Logger) *Module {
    repo := repository.NewWebhookRepository(db)
    svc  := service.NewWebhookService(repo, kfk, log)
    ctrl := controller.NewWebhookController(svc, log)
    return &Module{controller: ctrl}
}

func (m *Module) RegisterRoutes(rg *gin.RouterGroup) {
    rg.POST("/webhooks",     m.controller.Create)
    rg.GET("/webhooks/:id",  m.controller.GetByID)
    rg.GET("/webhooks",      m.controller.List)
    rg.DELETE("/webhooks/:id", m.controller.Delete)
}`,
      },
      {
        id: "all-services",
        title: "All Services — Webhook Platform",
        summary: "The 10 services in the webhook delivery platform",
        explanation:
          "For a webhook platform specifically, the service split follows the SRP (Single Responsibility Principle) at the microservice level. Each service owns one concern: receiving events, dispatching them, retrying failures, handling dead letters, notifying users, or analyzing delivery metrics. The API gateway routes all external traffic and handles auth.",
        keyPoints: [
          "`api-gateway` — single ingress point, rate limiting, auth, route forwarding",
          "`auth-service` — JWT issuance, token validation, API key management",
          "`tenant-service` — multi-tenancy, subscription plans, tenant config",
          "`webhook-service` — CRUD for webhook registrations and endpoint management",
          "`event-service` — ingests incoming events, validates schema, publishes to Kafka",
          "`dispatcher-service` — consumes events from Kafka, makes HTTP delivery attempts",
          "`retry-service` — exponential backoff retries for failed deliveries",
          "`dlq-service` — dead letter queue, manual replay, failure analysis",
          "`notification-service` — alerts (email/Slack) for repeated failures",
          "`analytics-service` — delivery metrics, success rates, latency percentiles",
        ],
        code: `apps/
├── api-gateway/       // Nginx/Go reverse proxy + rate limiting
│   └── go.mod: github.com/aryan297/go-microservices/apps/api-gateway
│
├── auth-service/      // JWT + API keys + RBAC
│   └── go.mod: github.com/aryan297/go-microservices/apps/auth-service
│
├── tenant-service/    // Multi-tenancy + billing plans
│   └── go.mod: github.com/aryan297/go-microservices/apps/tenant-service
│
├── webhook-service/   // Register/manage webhook endpoints
│   └── go.mod: github.com/aryan297/go-microservices/apps/webhook-service
│
├── event-service/     // Ingest events → validate → publish to Kafka
│   └── go.mod: github.com/aryan297/go-microservices/apps/event-service
│
├── dispatcher-service/ // Consume Kafka → HTTP delivery to subscriber
│   └── go.mod: github.com/aryan297/go-microservices/apps/dispatcher-service
│
├── retry-service/     // Exponential backoff retry worker
│   └── go.mod: github.com/aryan297/go-microservices/apps/retry-service
│
├── dlq-service/       // Dead letter queue + manual replay
│   └── go.mod: github.com/aryan297/go-microservices/apps/dlq-service
│
├── notification-service/ // Alert on failure streaks
│   └── go.mod: github.com/aryan297/go-microservices/apps/notification-service
│
└── analytics-service/ // Metrics aggregation + dashboards
    └── go.mod: github.com/aryan297/go-microservices/apps/analytics-service`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Libs — Shared Libraries
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "libs",
    icon: "📦",
    title: "Libs — Shared Libraries",
    topics: [
      {
        id: "libs-overview",
        title: "Libs Overview",
        summary: "What belongs in libs/ and what doesn't",
        explanation:
          "The `libs/` directory contains infrastructure-level packages that have no business logic. A lib knows nothing about webhooks, users, or tenants — it only knows about connecting to Kafka, writing structured logs, or validating a JWT. Business logic always lives in `apps/`. The rule: if you could open-source a lib with zero code changes, it belongs in `libs/`.",
        keyPoints: [
          "Each lib is its own Go module (`go.mod`) and therefore its own importable package",
          "A lib must have zero knowledge of any `apps/` code",
          "Libs expose interfaces, not concrete types — callers depend on abstractions",
          "Every lib gets its own unit tests; no integration tests that cross into app code",
          "Keep libs small and focused — one concern per lib",
          "Version each lib independently if needed (rare with monorepo, but possible)",
        ],
        gotchas: [
          "Don't put shared DTOs (request/response shapes) in libs — those are app concerns",
          "Circular imports between libs are a compile error in Go — design libs as a DAG",
          "A libs/ package that imports from apps/ is a design bug — reverse it with interfaces",
        ],
        code: `libs/
├── config/      // Viper-based config loader, env var binding
├── logger/      // Zerolog/Zap wrapper with structured fields
├── database/    // GORM connection pool + migrations helper
├── redis/       // go-redis client + helper methods
├── kafka/       // Sarama producer + consumer group abstractions
├── grpc/        // Shared gRPC server/client setup + interceptors
├── jwt/         // Token sign/verify, claims struct
├── middleware/  // Gin/Echo middlewares: auth, CORS, request-id, recovery
├── response/    // Standardised JSON response envelope
├── validator/   // go-playground/validator wrapper with custom rules
├── pagination/  // Page/offset/cursor pagination helpers
├── errors/      // Typed error codes + HTTP status mapping
├── tracing/     // OpenTelemetry tracer init + span helpers
├── metrics/     // Prometheus counters, histograms, gauges
├── eventbus/    // In-process event bus (for testing without Kafka)
├── cache/       // Generic Redis-backed cache with TTL + key builder
├── auth/        // Shared auth middleware (verifies JWT from auth-service)
├── queue/       // Generic job queue abstraction (Kafka or Redis Streams)
└── utils/       // String, time, pointer, slice helpers`,
      },
      {
        id: "logger-lib",
        title: "libs/logger",
        summary: "Structured logging wrapper used by every service",
        explanation:
          "The logger lib wraps a high-performance structured logger (zerolog or zap) and provides a consistent interface. Every log line emits `service`, `level`, `timestamp`, and a `trace_id` field automatically. Services never import zerolog/zap directly — they use `logger.Logger` interface, which makes testing trivial (swap in a test logger that writes to `bytes.Buffer`).",
        keyPoints: [
          "Returns a `Logger` interface, not a concrete struct — services depend on the abstraction",
          "Auto-injects `service` name and `trace_id` from context",
          "`logger.New(serviceName)` is the only constructor — called once in `main.go`",
          "Supports log levels: Debug, Info, Warn, Error, Fatal",
          "`logger.WithContext(ctx)` extracts the trace ID from context and adds it to all logs",
          "JSON output in production, pretty-print in development (controlled by env var)",
        ],
        code: `// libs/logger/logger.go
package logger

import (
    "context"
    "os"

    "github.com/rs/zerolog"
    "github.com/rs/zerolog/log"
)

type Logger interface {
    Debug(msg string, fields ...Field)
    Info(msg string, fields ...Field)
    Warn(msg string, fields ...Field)
    Error(msg string, err error, fields ...Field)
    WithContext(ctx context.Context) Logger
}

type Field struct {
    Key   string
    Value any
}

type zerologLogger struct {
    log     zerolog.Logger
    service string
}

func New(service string) Logger {
    var zl zerolog.Logger
    if os.Getenv("ENV") == "development" {
        zl = zerolog.New(zerolog.ConsoleWriter{Out: os.Stdout})
    } else {
        zl = zerolog.New(os.Stdout)
    }
    return &zerologLogger{
        log:     zl.With().Timestamp().Str("service", service).Logger(),
        service: service,
    }
}

func (l *zerologLogger) Info(msg string, fields ...Field) {
    e := l.log.Info()
    for _, f := range fields {
        e = e.Interface(f.Key, f.Value)
    }
    e.Msg(msg)
}

// usage in a service:
// log := logger.New("webhook-service")
// log.Info("webhook created", logger.Field{"webhook_id", id})`,
      },
      {
        id: "kafka-lib",
        title: "libs/kafka",
        summary: "Sarama-based Kafka producer and consumer group",
        explanation:
          "The kafka lib provides a thin abstraction over Sarama (or confluent-kafka-go). It exposes a `Producer` that serialises messages to JSON/Avro/proto and a `ConsumerGroup` that handles offset management. Services import this lib and configure it with a topic list from their config — they never deal with Sarama internals directly.",
        keyPoints: [
          "`kafka.NewProducer(cfg)` returns a `Producer` ready to publish",
          "`kafka.NewConsumerGroup(cfg, topics, handler)` manages the full consume loop",
          "Messages are serialised with the format specified in config (JSON default)",
          "Automatic retry on transient produce errors with exponential backoff",
          "Consumer groups commit offsets only after the handler returns nil — at-least-once semantics",
          "Graceful shutdown: `producer.Close()` flushes pending messages",
        ],
        code: `// libs/kafka/producer.go
package kafka

import (
    "context"
    "encoding/json"

    "github.com/IBM/sarama"
)

type Producer struct {
    producer sarama.SyncProducer
    topic    string
}

func NewProducer(cfg Config) *Producer {
    config := sarama.NewConfig()
    config.Producer.Return.Successes = true
    config.Producer.RequiredAcks = sarama.WaitForAll

    p, err := sarama.NewSyncProducer(cfg.Brokers, config)
    if err != nil {
        panic("kafka producer init failed: " + err.Error())
    }
    return &Producer{producer: p}
}

func (p *Producer) Publish(ctx context.Context, topic string, payload any) error {
    data, err := json.Marshal(payload)
    if err != nil {
        return err
    }
    msg := &sarama.ProducerMessage{
        Topic: topic,
        Value: sarama.ByteEncoder(data),
    }
    _, _, err = p.producer.SendMessage(msg)
    return err
}

func (p *Producer) Close() error {
    return p.producer.Close()
}

// ── Consumer ──
type Handler func(ctx context.Context, msg []byte) error

type ConsumerGroup struct {
    group   sarama.ConsumerGroup
    topics  []string
    handler Handler
}

// Usage in dispatcher-service:
// consumer := kafka.NewConsumerGroup(cfg.Kafka, []string{"webhook.events"}, func(ctx context.Context, msg []byte) error {
//     var event EventPayload
//     json.Unmarshal(msg, &event)
//     return dispatcher.Dispatch(ctx, event)
// })
// go consumer.Run(ctx)`,
      },
      {
        id: "response-lib",
        title: "libs/response",
        summary: "Standardised JSON response envelope for all services",
        explanation:
          "Every HTTP API in the platform returns the same response envelope: `{success, data, error, meta}`. The response lib provides helper functions that make writing this envelope trivial. Controllers call `response.OK(c, data)` or `response.Error(c, err)` — never construct JSON directly. This ensures all error messages, pagination metadata, and success shapes are consistent across every service.",
        keyPoints: [
          "`response.OK(ctx, data)` — 200 with `{success: true, data: ...}`",
          "`response.Created(ctx, data)` — 201",
          "`response.Error(ctx, err)` — maps typed errors to HTTP status codes automatically",
          "`response.Paginated(ctx, data, meta)` — 200 with `{success: true, data: [...], meta: {total, page, limit}}`",
          "Works with Gin, Echo, and Fiber — small adapter per framework",
          "Error codes are defined in `libs/errors` — response maps them to HTTP statuses",
        ],
        code: `// libs/response/response.go
package response

import (
    "net/http"

    "github.com/gin-gonic/gin"
    "github.com/aryan297/go-microservices/libs/errors"
)

type Envelope struct {
    Success bool   \`json:"success"\`
    Data    any    \`json:"data,omitempty"\`
    Error   *Err   \`json:"error,omitempty"\`
    Meta    any    \`json:"meta,omitempty"\`
}

type Err struct {
    Code    string \`json:"code"\`
    Message string \`json:"message"\`
}

func OK(c *gin.Context, data any) {
    c.JSON(http.StatusOK, Envelope{Success: true, Data: data})
}

func Created(c *gin.Context, data any) {
    c.JSON(http.StatusCreated, Envelope{Success: true, Data: data})
}

func Error(c *gin.Context, err error) {
    appErr, ok := errors.As(err)
    if !ok {
        c.JSON(http.StatusInternalServerError, Envelope{
            Error: &Err{Code: "INTERNAL", Message: "internal server error"},
        })
        return
    }
    c.JSON(appErr.HTTPStatus(), Envelope{
        Error: &Err{Code: appErr.Code(), Message: appErr.Error()},
    })
}

// Usage in a controller:
// func (ctrl *WebhookController) Create(c *gin.Context) {
//     webhook, err := ctrl.svc.Create(c.Request.Context(), req)
//     if err != nil {
//         response.Error(c, err)
//         return
//     }
//     response.Created(c, webhook)
// }`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Proto
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "proto",
    icon: "🔌",
    title: "Proto — gRPC Contracts",
    topics: [
      {
        id: "proto-structure",
        title: "proto/ Structure",
        summary: "One .proto file per service domain, auto-generated stubs",
        explanation:
          "The `proto/` directory is the single source of truth for all inter-service gRPC contracts. Each subdirectory corresponds to one service's public gRPC API. Generated Go stubs are committed alongside the proto files — this means you can always build without running `protoc`. Run `make proto` (or `./scripts/proto.sh`) to regenerate stubs after changing a proto file.",
        keyPoints: [
          "One `*.proto` file per service domain in its own subdirectory",
          "Generated `*_grpc.pb.go` and `*.pb.go` files are committed",
          "Services import the generated proto package from `proto/<domain>/`",
          "Use `buf` CLI instead of raw `protoc` — it handles imports, plugins, and linting",
          "Bump proto versions (v1, v2) in the package name for breaking changes",
          "REST ↔ gRPC: use `grpc-gateway` annotations in proto files to auto-generate REST endpoints",
        ],
        code: `proto/
├── auth/
│   ├── auth.proto
│   ├── auth.pb.go         // generated
│   └── auth_grpc.pb.go    // generated
│
├── user/
│   ├── user.proto
│   ├── user.pb.go
│   └── user_grpc.pb.go
│
├── webhook/
│   ├── webhook.proto
│   ├── webhook.pb.go
│   └── webhook_grpc.pb.go
│
└── notification/
    ├── notification.proto
    ├── notification.pb.go
    └── notification_grpc.pb.go

// ── webhook.proto ──
syntax = "proto3";
package webhook.v1;
option go_package = "github.com/aryan297/go-microservices/proto/webhook";

service WebhookService {
    rpc CreateWebhook(CreateWebhookRequest) returns (WebhookResponse);
    rpc GetWebhook(GetWebhookRequest)       returns (WebhookResponse);
    rpc ListWebhooks(ListWebhooksRequest)   returns (ListWebhooksResponse);
    rpc DeleteWebhook(DeleteWebhookRequest) returns (google.protobuf.Empty);
}

message CreateWebhookRequest {
    string tenant_id  = 1;
    string target_url = 2;
    repeated string events = 3;
}

message WebhookResponse {
    string id         = 1;
    string tenant_id  = 2;
    string target_url = 3;
    string status     = 4;
    string created_at = 5;
}`,
      },
      {
        id: "proto-generation",
        title: "Proto Generation Script",
        summary: "scripts/proto.sh — generating stubs with buf",
        explanation:
          "Rather than running `protoc` manually with a dozen flags, use the `buf` CLI. It reads `buf.yaml` and `buf.gen.yaml` at the root and generates all stubs in one command. The `scripts/proto.sh` wrapper also handles formatting and breaking change detection.",
        keyPoints: [
          "`buf generate` generates all Go stubs from all proto files",
          "`buf lint` checks proto style rules (field naming, package naming)",
          "`buf breaking --against .git#branch=main` detects breaking API changes",
          "`buf.yaml` declares the module and dependencies (googleapis, etc.)",
          "`buf.gen.yaml` configures output paths for Go and grpc-gateway plugins",
          "Add `buf breaking` to CI to prevent accidental breaking changes to gRPC contracts",
        ],
        code: `# scripts/proto.sh
#!/usr/bin/env bash
set -euo pipefail

echo "Running buf generate..."
buf generate

echo "Running buf lint..."
buf lint

echo "Checking for breaking changes against main..."
buf breaking --against ".git#branch=main" || echo "Warning: breaking changes detected"

echo "Proto generation complete."

# ── buf.gen.yaml ──
version: v2
plugins:
  - plugin: buf.build/protocolbuffers/go
    out: .
    opt: paths=source_relative

  - plugin: buf.build/grpc/go
    out: .
    opt:
      - paths=source_relative
      - require_unimplemented_servers=false

  - plugin: buf.build/grpc-ecosystem/gateway/v2
    out: .
    opt: paths=source_relative

# ── buf.yaml ──
version: v2
modules:
  - path: proto
deps:
  - buf.build/googleapis/googleapis
  - buf.build/grpc-ecosystem/grpc-gateway`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Deployments
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "deployments",
    icon: "🚀",
    title: "Deployments",
    topics: [
      {
        id: "docker",
        title: "Docker — Multi-Stage Builds",
        summary: "Minimal production images with multi-stage Dockerfiles",
        explanation:
          "Each service has its own `Dockerfile` that uses a two-stage build. The builder stage uses a Go image to compile a static binary with CGO disabled. The production stage copies only the binary into a distroless or Alpine image, resulting in images under 20 MB. The `docker-compose.yml` at the root spins up all services with their dependencies for local development.",
        keyPoints: [
          "Stage 1 (`builder`): full Go image, compiles `GOWORK=off go build -o /app ./cmd/main.go`",
          "Stage 2 (`production`): `gcr.io/distroless/static` or `alpine:3.20` — just the binary",
          "Set `CGO_ENABLED=0` and `GOOS=linux` for a fully static binary",
          "`docker-compose.yml` at root mounts configs and sets environment per service",
          "Build context is the monorepo root so `COPY libs/` works in the Dockerfile",
          "Tag images with git SHA for traceability: `make docker-build` uses `$(git rev-parse --short HEAD)`",
        ],
        code: `# apps/webhook-service/Dockerfile
# ── Stage 1: Build ──
FROM golang:1.24-alpine AS builder

WORKDIR /workspace

# Copy go.work and all modules first (better layer caching)
COPY go.work go.work.sum ./
COPY apps/webhook-service/go.mod apps/webhook-service/go.sum ./apps/webhook-service/
COPY libs/ ./libs/

# Download dependencies
RUN cd apps/webhook-service && go mod download

# Copy source
COPY apps/webhook-service/ ./apps/webhook-service/

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \\
    go build -ldflags="-w -s" \\
    -o /app/webhook-service \\
    ./apps/webhook-service/cmd/main.go

# ── Stage 2: Production ──
FROM gcr.io/distroless/static-debian12

COPY --from=builder /app/webhook-service /webhook-service
COPY apps/webhook-service/configs/ /configs/

EXPOSE 8080
ENTRYPOINT ["/webhook-service"]`,
      },
      {
        id: "docker-compose",
        title: "docker-compose.yml",
        summary: "Local development stack for all services",
        explanation:
          "The root `docker-compose.yml` defines the entire local development environment: all microservices, PostgreSQL (one database per service or shared), Redis, Kafka + Zookeeper, and any observability stack (Jaeger, Prometheus, Grafana). Each service reads its config from environment variables set in the compose file.",
        keyPoints: [
          "Each service is a separate `service:` block that builds from its Dockerfile",
          "Infrastructure services (postgres, redis, kafka) are pulled from official images",
          "Use named volumes for database data persistence across restarts",
          "`depends_on` with `condition: service_healthy` ensures infra is ready before services start",
          "All services share a `go-mono-net` bridge network",
          "Override with `docker-compose.override.yml` for developer-specific settings",
        ],
        code: `# docker-compose.yml (abbreviated)
version: "3.9"

networks:
  go-mono-net:
    driver: bridge

volumes:
  postgres-data:
  redis-data:

services:
  # ── Infrastructure ──
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: go_mono
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: go_mono
    volumes: [postgres-data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U go_mono"]
      interval: 5s
      retries: 5
    networks: [go-mono-net]

  redis:
    image: redis:7-alpine
    volumes: [redis-data:/data]
    networks: [go-mono-net]

  kafka:
    image: confluentinc/cp-kafka:7.6.0
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
    depends_on: [zookeeper]
    networks: [go-mono-net]

  # ── Services ──
  webhook-service:
    build:
      context: .
      dockerfile: apps/webhook-service/Dockerfile
    environment:
      DB_DSN: postgres://go_mono:secret@postgres:5432/webhooks?sslmode=disable
      REDIS_ADDR: redis:6379
      KAFKA_BROKERS: kafka:9092
      PORT: :8080
    ports: ["8081:8080"]
    depends_on:
      postgres: { condition: service_healthy }
    networks: [go-mono-net]

  dispatcher-service:
    build:
      context: .
      dockerfile: apps/dispatcher-service/Dockerfile
    environment:
      KAFKA_BROKERS: kafka:9092
      REDIS_ADDR: redis:6379
    depends_on: [kafka, redis]
    networks: [go-mono-net]`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Scripts & CI
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "scripts-ci",
    icon: "🛠️",
    title: "Scripts & CI",
    topics: [
      {
        id: "scripts",
        title: "scripts/ — Automation",
        summary: "Shell scripts for setup, migrations, proto, and seeding",
        explanation:
          "The `scripts/` directory holds shell scripts for tasks that are too complex for a single Makefile line. Makefile targets call these scripts. This separation keeps the Makefile readable and makes scripts independently testable. Every script begins with `set -euo pipefail` to fail fast on errors.",
        keyPoints: [
          "`setup.sh` — install tooling (buf, golangci-lint, migrate), create .env from .env.example",
          "`migrate.sh SERVICE=<name>` — runs golang-migrate for the given service",
          "`seed.sh SERVICE=<name>` — seeds test data for local dev",
          "`proto.sh` — runs buf generate + buf lint",
          "`test.sh` — runs all tests with race detector and coverage report",
          "All scripts use `set -euo pipefail` — fail on any error, undefined var, or pipe failure",
        ],
        code: `# scripts/migrate.sh
#!/usr/bin/env bash
set -euo pipefail

SERVICE=\${1:-""}
if [[ -z "$SERVICE" ]]; then
    echo "Usage: ./scripts/migrate.sh <service-name>"
    exit 1
fi

MIGRATION_DIR="apps/$SERVICE/migrations"
DB_DSN=\${DB_DSN:-"postgres://go_mono:secret@localhost:5432/$SERVICE?sslmode=disable"}

if [[ ! -d "$MIGRATION_DIR" ]]; then
    echo "No migrations found for $SERVICE at $MIGRATION_DIR"
    exit 1
fi

echo "Running migrations for $SERVICE..."
migrate -path "$MIGRATION_DIR" -database "$DB_DSN" up

echo "Migrations complete for $SERVICE"

# ── scripts/setup.sh ──
#!/usr/bin/env bash
set -euo pipefail

echo "Installing buf CLI..."
go install github.com/bufbuild/buf/cmd/buf@latest

echo "Installing golangci-lint..."
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

echo "Installing golang-migrate..."
go install -tags postgres github.com/golang-migrate/migrate/v4/cmd/migrate@latest

echo "Copying .env.example → .env..."
cp -n .env.example .env || echo ".env already exists, skipping"

echo "Setup complete. Run 'go work sync' to initialise the workspace."`,
      },
      {
        id: "ci-pipeline",
        title: "CI Pipeline",
        summary: "GitHub Actions workflow for the monorepo",
        explanation:
          "The CI pipeline runs on every PR. It uses Go's workspace mode with `GOWORK=on` for tests (so libs resolve locally) but builds production binaries with `GOWORK=off` (so each service is truly isolated). The pipeline is split into parallel jobs: lint, test, build, and proto-check.",
        keyPoints: [
          "Use `actions/cache` to cache the Go module download cache across runs",
          "Run `buf breaking` to catch proto API regressions on every PR",
          "Run `golangci-lint` once at the root — it understands workspace mode",
          "Build each service with `GOWORK=off` to validate it builds standalone",
          "Run tests with `-race` to detect data races early",
          "Matrix strategy: run tests for each service in parallel to cut pipeline time",
        ],
        code: `# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: "1.24" }
      - name: golangci-lint
        uses: golangci/golangci-lint-action@v6
        with: { args: --timeout 5m }

  proto-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bufbuild/buf-setup-action@v1
      - run: buf lint
      - run: buf breaking --against ".git#branch=main"

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [webhook-service, dispatcher-service, auth-service, event-service]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: "1.24" }
      - name: Cache modules
        uses: actions/cache@v4
        with:
          path: ~/go/pkg/mod
          key: \${{ runner.os }}-go-\${{ hashFiles('**/go.sum') }}
      - name: Test \${{ matrix.service }}
        run: go test ./apps/\${{ matrix.service }}/... -race -coverprofile=coverage.out

  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [webhook-service, dispatcher-service, auth-service, event-service]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: "1.24" }
      - name: Build \${{ matrix.service }}
        run: |
          cd apps/\${{ matrix.service }}
          GOWORK=off CGO_ENABLED=0 go build ./cmd/main.go`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Startup → Enterprise Evolution
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "evolution",
    icon: "📈",
    title: "Startup → Enterprise",
    topics: [
      {
        id: "evolution-overview",
        title: "The 6-Phase Evolution",
        summary: "How a Go backend grows from a single binary to a distributed system",
        explanation:
          "Every well-designed backend starts small and earns its complexity. The mistake is adopting microservices on day one — you pay the distributed systems tax before you understand your domain boundaries. The right path is: start with a modular monolith, introduce internal events to decouple modules without network overhead, apply DDD when the domain is well-understood, extract services only when scaling or team size demands it, then adopt Kafka and CQRS when consistency and query performance become separate concerns.",
        keyPoints: [
          "Phase 1 — Modular Monolith: one binary, clean internal module boundaries, shared DB",
          "Phase 2 — Internal Events: in-process eventbus decouples modules without network",
          "Phase 3 — DDD: explicit aggregates, value objects, and domain events for complex domains",
          "Phase 4 — Microservices Monorepo: extract services when teams or scaling demand it",
          "Phase 5 — Event-Driven Architecture: Kafka for async, durable inter-service messaging",
          "Phase 6 — CQRS + Event Sourcing: separate read/write models; full audit trail via events",
          "Never skip phases — each solves a real problem the previous phase created",
        ],
        gotchas: [
          "Extracting services too early is the #1 Go backend mistake — you split before domain boundaries are clear",
          "CQRS without event sourcing is fine; event sourcing without CQRS is painful",
          "Going from Phase 1 to Phase 6 overnight is a rewrite, not an evolution",
        ],
        code: `// The evolution path — each arrow is a deliberate decision, not a timeline

Phase 1: Modular Monolith
  backend/internal/{auth, user, payment, notification}
  One binary · One DB · Clean module boundaries
        ↓  trigger: modules need to react to each other's events

Phase 2: Internal Events
  + internal/eventbus/
  In-process pub/sub · No network · Easy to test
        ↓  trigger: domain model is complex, needs explicit invariants

Phase 3: Domain Driven Design
  internal/{identity, payment, booking}
  Aggregates · Value Objects · Domain Events · Bounded Contexts
        ↓  trigger: team splits or one service needs independent scaling

Phase 4: Microservices Monorepo
  apps/{api-gateway, auth-service, payment-service, ...}
  go.work · Independent deployments · gRPC/REST between services
        ↓  trigger: services need async communication / decoupled reliability

Phase 5: Event-Driven Architecture
  libs/kafka + Kafka topics between services
  Producer/Consumer · At-least-once delivery · Event replay
        ↓  trigger: read performance diverges from write performance

Phase 6: CQRS + Event Sourcing
  command/ · query/ · events/store/ · projections/ · readmodel/
  Separate read/write models · Full audit trail · Eventual consistency`,
      },
      {
        id: "when-to-evolve",
        title: "When to Evolve",
        summary: "The signals that tell you it's time to move to the next phase",
        explanation:
          "Architecture decisions should be driven by pain, not by aspiration. Each phase transition has a concrete trigger — a real problem that the current architecture can't solve cheaply. If you don't feel the pain, you're not ready. Premature evolution adds complexity without benefit.",
        keyPoints: [
          "Monolith → Internal Events: two modules need to react to each other but you don't want direct imports",
          "Internal Events → DDD: business logic is complex enough that implicit rules become bugs",
          "Monolith → Microservices: two teams need to deploy independently OR one service needs 10x the resources of others",
          "Sync HTTP → Kafka: a downstream service going down should not fail the upstream call",
          "Standard CRUD → CQRS: your read queries are too complex/slow with the same model you write to",
          "CQRS → Event Sourcing: you need full audit trail, time-travel, or event replay for business reasons",
        ],
        gotchas: [
          "Team size is a stronger signal than traffic — 2 engineers don't need microservices at any scale",
          "If you can solve it with a read replica and an index, don't add CQRS",
          "Kafka is operationally expensive — use Redis Streams or a job queue first",
        ],
        code: `// Decision checklist before each evolution

// ── Monolith → Microservices ──
// ✓ Do two teams need to deploy without coordinating?
// ✓ Does one module need 10x the CPU/memory of others?
// ✓ Are module boundaries stable and well-understood?
// ✗ NOT: "microservices are best practice"
// ✗ NOT: "we might need to scale someday"

// ── Sync → Kafka ──
// ✓ Can the caller tolerate eventual consistency?
// ✓ Does downstream failure need to be isolated?
// ✓ Do you need event replay or audit history?
// ✗ NOT: replacing a simple HTTP call with no reliability need

// ── CRUD → CQRS ──
// ✓ Do read queries require joining 5+ tables?
// ✓ Is read throughput 100x write throughput?
// ✓ Do different consumers need different shapes of the same data?
// ✗ NOT: "CQRS is cleaner architecture"

// ── CQRS → Event Sourcing ──
// ✓ Does the business need a full audit trail by law or product requirement?
// ✓ Do you need to rebuild projections from scratch?
// ✓ Is the current state less important than how you got there?
// ✗ NOT: just wanting immutable data`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 9. Modular Monolith
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "modular-monolith",
    icon: "🧱",
    title: "Modular Monolith",
    topics: [
      {
        id: "phase1-structure",
        title: "Phase 1 — Modular Monolith",
        summary: "One binary, one database, clean module boundaries via Go's internal/ rule",
        explanation:
          "The modular monolith is the ideal starting point. It's a single Go binary where each business domain lives in its own package under `internal/`. Go's `internal/` visibility rule enforces that nothing outside the module can import these packages — this gives you the same boundary enforcement that microservices give you with network calls, but with none of the operational cost. All domains share a single database but each domain owns its own tables. Migrations live at the root.",
        keyPoints: [
          "`internal/` is Go's built-in boundary enforcer — no package outside this module can import it",
          "Each domain (`auth/`, `user/`, `payment/`) follows the same layered structure: controller → service → repository",
          "`pkg/` holds code that IS intended for external import (utils, custom types)",
          "Shared infrastructure (middleware, response helpers, errors) lives in `internal/shared/`",
          "One `go.mod` at the root — no workspace file needed yet",
          "One database with schema namespacing per domain (e.g. `auth_users`, `payment_transactions`)",
          "`cmd/api/main.go` wires all modules and starts one HTTP server",
        ],
        gotchas: [
          "Don't let modules import each other's internal layers — only call via public service interfaces",
          "`internal/shared/` should have zero business logic — only infrastructure primitives",
          "If you're tempted to add a `utils/` package with 50 unrelated functions, you have a design smell",
        ],
        code: `backend/
├── cmd/
│   └── api/
│       └── main.go          // wires all modules, starts server
│
├── internal/
│   ├── auth/
│   │   ├── controller/      // HTTP handlers
│   │   ├── service/         // business logic
│   │   ├── repository/      // DB access
│   │   ├── dto/             // request/response structs
│   │   ├── entity/          // DB model structs
│   │   ├── routes.go        // registers routes on router
│   │   └── module.go        // dependency wiring: NewAuthModule(db) → controller
│   │
│   ├── user/
│   │   └── ... (same structure)
│   │
│   ├── payment/
│   │   └── ... (same structure)
│   │
│   ├── notification/
│   │   └── ... (same structure)
│   │
│   └── shared/
│       ├── middleware/       // auth, CORS, request-id middleware
│       ├── response/         // JSON response envelope helpers
│       └── errors/           // typed error codes + HTTP status mapping
│
├── pkg/
│   └── validator/            // custom validation rules (exported)
│
├── configs/
│   └── config.yaml
│
├── migrations/
│   ├── 001_create_users.up.sql
│   └── 001_create_users.down.sql
│
└── go.mod                    // single module, no go.work needed`,
      },
      {
        id: "phase2-eventbus",
        title: "Phase 2 — Internal Events",
        summary: "In-process pub/sub to decouple modules without a network hop",
        explanation:
          "Once your monolith grows, modules need to react to each other's state changes. The naive solution is direct calls: `notificationService.SendWelcomeEmail(user)` inside `authService.Register()`. This creates tight coupling — auth now imports notification. The better solution is an in-process eventbus: auth publishes `UserCreatedEvent`, notification subscribes to it. Auth doesn't know notification exists. This is the same decoupling Kafka gives you, but fully in-process — zero operational overhead, synchronous or async depending on your implementation.",
        keyPoints: [
          "`eventbus.Publish(UserCreatedEvent{})` — publisher has no knowledge of subscribers",
          "`eventbus.Subscribe(UserCreatedEvent{}, handler)` — subscriber registers at startup in `main.go`",
          "The eventbus lives in `internal/eventbus/` — a thin, reusable component",
          "Synchronous by default: the publish call blocks until all handlers return",
          "Add a goroutine pool inside the bus to make handlers async without changing the API",
          "In tests, replace the real bus with a spy bus to assert events were published",
          "This is the stepping stone to Kafka — same mental model, no infrastructure",
        ],
        gotchas: [
          "Don't use the eventbus as a replacement for proper return values — only for side-effects",
          "If a handler panics, recover in the bus dispatcher or it will crash the whole request",
          "Eventual consistency within a monolith is confusing — keep handlers synchronous until you have a reason not to",
        ],
        code: `backend/
└── internal/
    ├── auth/
    ├── user/
    ├── payment/
    ├── notification/
    │
    ├── eventbus/
    │   ├── bus.go          // registry of topic → []handler
    │   ├── dispatcher.go   // calls handlers, handles panics
    │   └── events.go       // shared event type definitions
    │
    └── shared/

// ── internal/eventbus/bus.go ──
package eventbus

import "sync"

type Event interface{ EventName() string }

type Handler func(event Event) error

type Bus struct {
    mu       sync.RWMutex
    handlers map[string][]Handler
}

func New() *Bus {
    return &Bus{handlers: make(map[string][]Handler)}
}

func (b *Bus) Subscribe(eventName string, h Handler) {
    b.mu.Lock()
    defer b.mu.Unlock()
    b.handlers[eventName] = append(b.handlers[eventName], h)
}

func (b *Bus) Publish(event Event) error {
    b.mu.RLock()
    handlers := b.handlers[event.EventName()]
    b.mu.RUnlock()
    for _, h := range handlers {
        if err := h(event); err != nil {
            return err
        }
    }
    return nil
}

// ── internal/eventbus/events.go ──
type UserCreatedEvent struct {
    UserID string
    Email  string
    Name   string
}
func (e UserCreatedEvent) EventName() string { return "user.created" }

// ── wiring in cmd/api/main.go ──
bus := eventbus.New()
bus.Subscribe("user.created", notificationModule.HandleUserCreated)
bus.Subscribe("user.created", analyticsModule.TrackSignup)

authModule := auth.NewModule(db, bus)  // auth receives the bus, publishes to it

// ── inside auth/service/auth_service.go ──
func (s *AuthService) Register(ctx context.Context, req dto.RegisterRequest) (*dto.UserResponse, error) {
    user := // ... create user in DB
    s.bus.Publish(eventbus.UserCreatedEvent{UserID: user.ID, Email: user.Email})
    return mapper.ToResponse(user), nil
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 10. Domain Driven Design
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "ddd",
    icon: "🏛️",
    title: "DDD — Phase 3",
    topics: [
      {
        id: "ddd-structure",
        title: "DDD Structure",
        summary: "Bounded contexts, aggregates, and domain events replace CRUD layers",
        explanation:
          "Domain Driven Design restructures your codebase around business concepts rather than technical layers. Instead of `internal/user/` (a technical noun), you have `internal/identity/` (a bounded context). Inside it, `aggregate/` holds the root entity that enforces invariants, `valueobject/` holds immutable descriptors (Email, Money), `events/` holds domain events emitted by the aggregate, and `application/` holds use-case handlers that orchestrate the aggregate. The repository is an interface — the aggregate never knows about databases.",
        keyPoints: [
          "Bounded Context: a named boundary inside which a domain model is consistent (e.g. `identity`, `payment`, `booking`)",
          "Aggregate: a cluster of objects treated as a unit — only the root is directly referenced from outside",
          "Value Object: immutable, identity-less (e.g. `Email`, `Money{amount, currency}`) — equality by value",
          "Domain Event: something that happened in the domain (`UserRegistered`, `PaymentCompleted`)",
          "`application/` = use cases (commands + queries) — this layer orchestrates, never has domain logic",
          "Repository interface lives in the domain layer; implementation lives in `infrastructure/`",
          "The aggregate emits domain events internally; the application layer publishes them to the eventbus",
        ],
        gotchas: [
          "Don't put DB tags (`gorm:\"column:...\"`) on aggregate structs — that couples domain to infrastructure",
          "An aggregate should never call another aggregate directly — communicate via domain events",
          "DDD is overkill for simple CRUD domains — only apply to genuinely complex business logic",
        ],
        code: `backend/
└── internal/
    │
    ├── identity/               // Bounded Context: user identity & auth
    │   ├── aggregate/
    │   │   └── user.go         // User aggregate root — enforces invariants
    │   ├── entity/
    │   │   └── session.go      // non-root entity inside the aggregate
    │   ├── valueobject/
    │   │   ├── email.go        // Email value object — validates on creation
    │   │   └── password.go     // HashedPassword value object
    │   ├── repository/
    │   │   └── user_repository.go  // interface — no SQL here
    │   ├── service/
    │   │   └── token_service.go    // pure domain service (stateless)
    │   ├── events/
    │   │   ├── user_registered.go
    │   │   └── password_changed.go
    │   └── application/
    │       ├── commands/
    │       │   ├── register_user.go   // RegisterUserCommand + Handler
    │       │   └── change_password.go
    │       └── queries/
    │           └── get_user.go        // GetUserQuery + Handler
    │
    ├── payment/                // Bounded Context: charges & refunds
    ├── booking/                // Bounded Context: reservations
    ├── notification/           // Bounded Context: alerts & messaging
    │
    └── shared/
        ├── domain/
        │   ├── aggregate.go    // base aggregate with domain event collection
        │   └── entity.go       // base entity with ID
        ├── kernel/
        │   └── money.go        // Money value object shared across contexts
        └── errors/`,
      },
      {
        id: "ddd-aggregate",
        title: "Aggregate + Value Objects",
        summary: "How to write a DDD aggregate in Go — invariants, events, value objects",
        explanation:
          "A Go aggregate is a plain struct with methods that enforce business rules. It never returns errors for domain violations — instead it returns typed domain errors. It collects domain events internally (by appending to a slice) — the application layer drains these events and publishes them after persisting. Value objects are created via constructors that validate on creation — once created, they're trusted.",
        keyPoints: [
          "The aggregate constructor validates all invariants — you can't create an invalid aggregate",
          "Methods on the aggregate represent commands (`Register`, `ChangePassword`, `Deactivate`)",
          "`domainEvents []DomainEvent` field collects events — never published directly from aggregate",
          "Value object constructor returns `(ValueObject, error)` — validity guaranteed by type system after construction",
          "Repository interface uses aggregate types, not DB types — mapping happens in the infrastructure layer",
          "`shared/domain/aggregate.go` provides the base struct with event collection helpers",
        ],
        code: `// internal/identity/valueobject/email.go
package valueobject

import (
    "fmt"
    "strings"
    "regexp"
)

var emailRegex = regexp.MustCompile(\`^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$\`)

type Email struct{ value string }

func NewEmail(raw string) (Email, error) {
    v := strings.TrimSpace(strings.ToLower(raw))
    if !emailRegex.MatchString(v) {
        return Email{}, fmt.Errorf("invalid email: %s", raw)
    }
    return Email{value: v}, nil
}

func (e Email) String() string { return e.value }
func (e Email) Equals(other Email) bool { return e.value == other.value }

// ──────────────────────────────────────────────────

// internal/identity/aggregate/user.go
package aggregate

import (
    "time"

    "github.com/google/uuid"
    "github.com/myapp/internal/identity/events"
    "github.com/myapp/internal/identity/valueobject"
    "github.com/myapp/internal/shared/domain"
)

type User struct {
    domain.BaseAggregate
    ID           string
    Email        valueobject.Email
    PasswordHash valueobject.HashedPassword
    IsActive     bool
    CreatedAt    time.Time
}

func Register(email valueobject.Email, password valueobject.HashedPassword) (*User, error) {
    u := &User{
        ID:           uuid.NewString(),
        Email:        email,
        PasswordHash: password,
        IsActive:     true,
        CreatedAt:    time.Now(),
    }
    u.AddEvent(events.UserRegistered{UserID: u.ID, Email: email.String()})
    return u, nil
}

func (u *User) Deactivate() error {
    if !u.IsActive {
        return domain.ErrAlreadyDeactivated
    }
    u.IsActive = false
    u.AddEvent(events.UserDeactivated{UserID: u.ID})
    return nil
}

// ──────────────────────────────────────────────────

// internal/identity/application/commands/register_user.go
package commands

type RegisterUserCommand struct {
    Email    string
    Password string
}

type RegisterUserHandler struct {
    repo   repository.UserRepository
    bus    eventbus.Bus
    hasher valueobject.PasswordHasher
}

func (h *RegisterUserHandler) Handle(ctx context.Context, cmd RegisterUserCommand) error {
    email, err := valueobject.NewEmail(cmd.Email)
    if err != nil { return err }

    hash, err := h.hasher.Hash(cmd.Password)
    if err != nil { return err }

    user, err := aggregate.Register(email, hash)
    if err != nil { return err }

    if err := h.repo.Save(ctx, user); err != nil { return err }

    // Drain and publish domain events AFTER persist
    for _, e := range user.DomainEvents() {
        h.bus.Publish(e)
    }
    return nil
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 11. Event-Driven Architecture
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "eda",
    icon: "⚡",
    title: "EDA — Phase 5",
    topics: [
      {
        id: "eda-structure",
        title: "Event-Driven Architecture Structure",
        summary: "Kafka replaces direct service calls for async, durable inter-service messaging",
        explanation:
          "Event-Driven Architecture (EDA) is Phase 5 — it comes after you've already split into microservices and identified which inter-service calls need to survive downstream failures. In EDA, services communicate by publishing and consuming events on Kafka topics. A producer service publishes an event and moves on — it doesn't wait for consumers. Consumers process events independently, at their own pace, and can replay from any offset if something fails.",
        keyPoints: [
          "`producer-service` publishes events to Kafka topics — no knowledge of consumers",
          "`consumer-service` runs a Kafka consumer group — processes events from a topic",
          "`libs/kafka/topics.go` defines all topic names as constants — prevents typos",
          "Each consumer group has its own offset — adding a new consumer doesn't affect existing ones",
          "Failed events go to a retry topic with exponential backoff, then to a DLQ topic",
          "The `libs/eventbus/` lib provides in-process routing for local dev (swap Kafka for tests)",
          "Schema registry (Confluent or Buf) enforces event shape — prevents producer/consumer drift",
        ],
        gotchas: [
          "At-least-once delivery means consumers must be idempotent — design for duplicate messages",
          "Don't put large payloads in Kafka messages — store in S3/DB and put only the ID in the event",
          "Ordering is guaranteed per partition only — use a consistent partition key (e.g. tenant_id)",
        ],
        code: `project/
├── apps/
│   ├── event-service/       // ingests HTTP events → publishes to Kafka
│   ├── dispatcher-service/  // consumes "webhook.events" → delivers via HTTP
│   ├── retry-service/       // consumes "webhook.failed" → retries with backoff
│   ├── notification-service/
│   └── analytics-service/
│
├── libs/
│   ├── kafka/
│   │   ├── producer.go      // SyncProducer wrapper
│   │   ├── consumer.go      // ConsumerGroup wrapper
│   │   ├── message.go       // typed Message[T] envelope
│   │   └── topics.go        // ALL topic names as constants
│   │
│   ├── eventbus/            // in-process bus for local dev / tests
│   └── logger/
│
├── proto/                   // event schemas (proto or JSON schema)
└── deployments/
    └── docker/
        └── kafka/           // Kafka + Zookeeper + Schema Registry

// ── libs/kafka/topics.go ──
package kafka

const (
    TopicWebhookEvents   = "webhook.events"
    TopicWebhookFailed   = "webhook.failed"
    TopicWebhookDLQ      = "webhook.dlq"
    TopicUserCreated     = "user.created"
    TopicPaymentComplete = "payment.completed"
)

// ── event-service: publishing ──
func (s *EventService) Ingest(ctx context.Context, req IngestRequest) error {
    event := WebhookEvent{
        ID:        uuid.NewString(),
        TenantID:  req.TenantID,
        EventType: req.EventType,
        Payload:   req.Payload,
        CreatedAt: time.Now(),
    }
    return s.producer.Publish(ctx, kafka.TopicWebhookEvents, event)
}

// ── dispatcher-service: consuming ──
func main() {
    consumer := kafka.NewConsumerGroup(cfg.Kafka, []string{kafka.TopicWebhookEvents}, dispatch)
    go consumer.Run(ctx)
    // ... signal handling
}

func dispatch(ctx context.Context, msg []byte) error {
    var event WebhookEvent
    if err := json.Unmarshal(msg, &event); err != nil {
        return err  // poison pill — send to DLQ after max retries
    }
    return httpClient.Deliver(ctx, event)
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 12. CQRS + Event Sourcing
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "cqrs",
    icon: "🔀",
    title: "CQRS + Event Sourcing — Phase 6",
    topics: [
      {
        id: "cqrs-structure",
        title: "CQRS Structure",
        summary: "Separate command and query models — writes and reads use different paths",
        explanation:
          "CQRS (Command Query Responsibility Segregation) splits your application into two paths: the command side (write) and the query side (read). Commands mutate state and return no data. Queries return data and never mutate state. This separation allows each side to be optimised independently — the write model can normalise aggressively for consistency; the read model can denormalise aggressively for query performance. In Go, this translates to two separate packages: `command/` and `query/`.",
        keyPoints: [
          "`internal/command/` — command structs, handlers, write-side service",
          "`internal/query/` — query structs, handlers, read-optimised repository",
          "Commands return only `error` — never data",
          "Queries return data only — never side effects",
          "Write DB: normalised Postgres for consistency",
          "Read DB: denormalised Postgres views, Redis, or Elasticsearch for fast queries",
          "Projections subscribe to domain events and update the read model",
          "Works without event sourcing — just two data models updated in sync",
        ],
        gotchas: [
          "CQRS adds two code paths for every feature — only justified when read/write shapes genuinely diverge",
          "Without event sourcing, keeping write and read models in sync requires explicit projection updates",
          "Don't blindly return the write model from commands — if callers need the created resource, use a follow-up query",
        ],
        code: `backend/
└── internal/
    │
    ├── command/
    │   ├── commands/
    │   │   ├── create_webhook.go      // CreateWebhookCommand struct
    │   │   ├── update_webhook.go
    │   │   └── delete_webhook.go
    │   ├── handlers/
    │   │   ├── create_webhook_handler.go  // Handle(ctx, cmd) error
    │   │   └── delete_webhook_handler.go
    │   └── service/
    │       └── command_service.go         // dispatches commands to handlers
    │
    ├── query/
    │   ├── queries/
    │   │   ├── get_webhook.go         // GetWebhookQuery{ID string}
    │   │   └── list_webhooks.go       // ListWebhooksQuery{TenantID, Page, Limit}
    │   ├── handlers/
    │   │   ├── get_webhook_handler.go
    │   │   └── list_webhooks_handler.go
    │   ├── projections/
    │   │   └── webhook_projection.go  // reads from read model
    │   └── repository/
    │       └── webhook_read_repo.go   // queries denormalised read DB
    │
    ├── events/
    │   ├── store/
    │   │   └── event_store.go         // append-only event log
    │   ├── publisher/
    │   │   └── event_publisher.go     // publishes events to Kafka
    │   └── subscriber/
    │       └── event_subscriber.go    // listens and updates projections
    │
    ├── projections/
    │   └── webhook_projection.go      // rebuilds read model from events
    │
    ├── readmodel/
    │   └── webhook_view.go            // denormalised read struct
    │
    └── shared/

// ── CQRS command handler ──
type CreateWebhookCommand struct {
    TenantID  string
    TargetURL string
    Events    []string
}

type CreateWebhookHandler struct {
    repo     WebhookWriteRepository
    eventBus EventBus
}

func (h *CreateWebhookHandler) Handle(ctx context.Context, cmd CreateWebhookCommand) error {
    webhook := aggregate.NewWebhook(cmd.TenantID, cmd.TargetURL, cmd.Events)
    if err := h.repo.Save(ctx, webhook); err != nil {
        return err
    }
    return h.eventBus.Publish(events.WebhookCreated{
        WebhookID: webhook.ID, TenantID: cmd.TenantID,
    })
}

// ── CQRS query handler ──
type ListWebhooksQuery struct {
    TenantID string
    Page, Limit int
}

type ListWebhooksHandler struct {
    readRepo WebhookReadRepository  // queries the denormalised read model
}

func (h *ListWebhooksHandler) Handle(ctx context.Context, q ListWebhooksQuery) ([]WebhookView, error) {
    return h.readRepo.ListByTenant(ctx, q.TenantID, q.Page, q.Limit)
}`,
      },
      {
        id: "event-sourcing",
        title: "Event Sourcing",
        summary: "State is derived from an append-only log of domain events",
        explanation:
          "Event Sourcing takes CQRS further: instead of storing the current state of an aggregate (a row in a table), you store every event that ever happened to it. To get the current state, you replay all events through the aggregate. The event store is append-only — nothing is ever updated or deleted. This gives you a complete audit trail, the ability to rebuild any projection from scratch, and time-travel debugging. The trade-off is complexity: you need projections to make data queryable.",
        keyPoints: [
          "Event store: append-only table with `(aggregate_id, version, event_type, payload, created_at)`",
          "To load an aggregate: `SELECT * FROM events WHERE aggregate_id = ? ORDER BY version` → replay",
          "To save an aggregate: `INSERT INTO events` the new domain events — optimistic concurrency via version",
          "Projections are event handlers that build read models — they can be rebuilt from scratch anytime",
          "Snapshotting: periodically save current state to avoid replaying 10,000 events on every load",
          "Event versioning: when event schemas change, use upcasters to transform old events to new shape",
          "CQRS is required with event sourcing — you can't query an event log directly for complex reads",
        ],
        gotchas: [
          "Deleting data is hard — GDPR 'right to erasure' requires encrypting PII and destroying the key",
          "Never change the meaning of a past event — old events are immutable historical facts",
          "Event sourcing is not a database replacement — you still need a projection DB for reads",
        ],
        code: `// ── Event Store schema ──
CREATE TABLE events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID        NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    version      INT         NOT NULL,
    event_type   VARCHAR(100) NOT NULL,
    payload      JSONB       NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (aggregate_id, version)  -- optimistic concurrency
);

// ── internal/events/store/event_store.go ──
package store

type EventStore interface {
    Append(ctx context.Context, aggregateID string, events []StoredEvent, expectedVersion int) error
    Load(ctx context.Context, aggregateID string) ([]StoredEvent, error)
}

type StoredEvent struct {
    AggregateID   string
    AggregateType string
    Version       int
    EventType     string
    Payload       []byte
    CreatedAt     time.Time
}

// ── Loading an aggregate from the event store ──
func (r *WebhookRepository) GetByID(ctx context.Context, id string) (*aggregate.Webhook, error) {
    storedEvents, err := r.store.Load(ctx, id)
    if err != nil { return nil, err }
    if len(storedEvents) == 0 {
        return nil, ErrNotFound
    }

    webhook := &aggregate.Webhook{}
    for _, se := range storedEvents {
        event, err := deserialize(se)  // event_type → struct
        if err != nil { return nil, err }
        webhook.Apply(event)           // mutates aggregate state
        webhook.Version = se.Version
    }
    return webhook, nil
}

// ── Saving an aggregate ──
func (r *WebhookRepository) Save(ctx context.Context, wh *aggregate.Webhook) error {
    events := toStoredEvents(wh.DomainEvents(), wh.ID, wh.Version)
    return r.store.Append(ctx, wh.ID, events, wh.Version)
}

// ── Projection: rebuilding the read model ──
func (p *WebhookProjection) HandleWebhookCreated(ctx context.Context, e events.WebhookCreated) error {
    return p.readDB.Insert(ctx, WebhookView{
        ID:        e.WebhookID,
        TenantID:  e.TenantID,
        TargetURL: e.TargetURL,
        Status:    "active",
        CreatedAt: e.OccurredAt,
    })
}

// Rebuild: drop read model table, replay all events from store, re-run all projections`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 13. Webhook Platform Evolution
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "webhook-evolution",
    icon: "🔗",
    title: "Webhook Platform — Evolution",
    topics: [
      {
        id: "webhook-start",
        title: "Starting Point",
        summary: "The webhook platform begins as a modular monolith with an internal eventbus",
        explanation:
          "For a webhook delivery platform, you start with a modular monolith because your domain boundaries aren't clear yet. You don't know if 'retry' belongs inside 'delivery' or if it's its own concern. Starting as a monolith lets you refactor boundaries cheaply. The internal eventbus handles the fan-out (event arrives → dispatch → notify → record analytics) without coupling modules together.",
        keyPoints: [
          "Start with one binary, one Postgres database",
          "`internal/webhook` — webhook CRUD (registration, endpoint management)",
          "`internal/delivery` — the actual HTTP delivery attempt + status tracking",
          "`internal/retry` — retry logic with exponential backoff (subscribes to delivery.failed event)",
          "`internal/analytics` — delivery metrics (subscribes to delivery events)",
          "`internal/auth` — API keys, JWT, tenant management",
          "Internal eventbus connects delivery → retry, delivery → analytics without direct imports",
          "All fit in one `go.mod` — no workspace file, no Docker compose complexity",
        ],
        code: `// Phase 1+2: Modular Monolith + Internal Events

webhook-platform/
├── cmd/
│   └── api/
│       └── main.go
│
├── internal/
│   ├── auth/          // API keys, JWT, tenant management
│   ├── webhook/       // webhook registration + endpoint CRUD
│   ├── delivery/      // HTTP delivery attempt, status updates
│   ├── retry/         // exponential backoff retry (reacts to delivery.failed)
│   ├── analytics/     // delivery metrics (reacts to delivery events)
│   │
│   ├── eventbus/
│   │   ├── bus.go
│   │   └── events.go  // DeliveryAttempted, DeliveryFailed, DeliverySucceeded
│   │
│   └── shared/
│       ├── middleware/
│       ├── response/
│       └── errors/
│
├── libs/             // empty at this phase — shared code lives in internal/shared
├── deployments/
│   └── docker-compose.yml  // app + postgres + redis
└── go.mod

// ── Event flow via internal eventbus ──
// delivery.Deliver() → publishes DeliveryAttempted
//   → analytics.HandleDeliveryAttempted() records metric
//   → if failed: publishes DeliveryFailed
//       → retry.HandleDeliveryFailed() schedules retry
//       → analytics.HandleDeliveryFailed() records failure metric`,
      },
      {
        id: "evolution-path",
        title: "Evolution Path",
        summary: "How the webhook platform evolves through each phase with concrete triggers",
        explanation:
          "Each step in the webhook platform's evolution is triggered by a real constraint — team growth, scaling pressure, or a reliability requirement. The evolution is not a big-bang rewrite — it's a series of targeted extractions, each one solving a specific problem while keeping everything else stable.",
        keyPoints: [
          "Phase 1+2: Monolith + eventbus — one team, one binary, fast iteration",
          "Extract Delivery: delivery service handles 10x more load than the rest — scale independently",
          "Extract Notification: notification team wants independent deploy cadence",
          "Add Kafka: dispatcher going down should not fail event ingestion — decouple with durable queue",
          "Add CQRS: analytics queries are complex and slow — separate read model in Elasticsearch",
          "Add Event Sourcing: customers demand full delivery audit trail with replay — event store solves it",
        ],
        code: `// ── Evolution triggered by real constraints ──

// ── Phase 1+2: Modular Monolith + Internal Events ──
// Team: 2 engineers. Traffic: <1k events/day. Deployment: one binary.
webhook-platform/internal/{auth, webhook, delivery, retry, analytics, eventbus}

        ↓  trigger: delivery service needs 5x more instances than auth/webhook
           (can't scale one part of a monolith independently)

// ── Extract Delivery Service ──
apps/api           // still a monolith: auth + webhook + analytics
apps/delivery      // extracted: handles HTTP dispatch + status tracking
// Communication: api → delivery via gRPC (sync — we need the delivery ID back)

        ↓  trigger: notification team (3 engineers) wants independent deploys

// ── Extract Notification Service ──
apps/api
apps/delivery
apps/notification  // extracted: email/Slack alerts on failure streaks

        ↓  trigger: delivery service going down loses events from event-service
           (synchronous HTTP call means event ingestion fails when delivery is down)

// ── Add Kafka ──
apps/event-service     // ingests events → publishes to kafka: "webhook.events"
apps/dispatcher        // consumes "webhook.events" → attempts HTTP delivery
apps/retry-service     // consumes "webhook.failed" → exponential backoff retry
// event-service no longer calls dispatcher — Kafka buffers events during outages

        ↓  trigger: analytics queries (delivery rate by tenant, p95 latency) are
           too slow on the write DB and joining 4 tables

// ── Add CQRS ──
apps/analytics-service  // separate read model in Elasticsearch or Postgres MATERIALIZED VIEW
// Command side: delivery events update write DB
// Query side: projections update denormalised analytics tables

        ↓  trigger: enterprise customers require full audit trail + replay
           ("show me every delivery attempt for webhook X in the last 90 days")

// ── Add Event Sourcing (delivery aggregate only) ──
apps/dispatcher     // now uses event store for Delivery aggregate
// Every attempt, failure, retry, success stored as immutable events
// Replay endpoint: rebuild delivery history from event store

// ── Final architecture ──
apps/
├── api-gateway        // routing, auth, rate limiting
├── event-service      // ingest → Kafka
├── dispatcher         // Kafka → HTTP delivery (event-sourced)
├── retry-service      // Kafka retry with backoff
├── dlq-service        // dead letter queue + manual replay
├── notification-service
└── analytics-service  // CQRS read model`,
      },
    ],
  },
];
