// Gang-of-Four design patterns — grouped by Creational / Structural / Behavioral,
// each with an explanation, key points, gotchas, and a runnable Go example.
export const DESIGN_PATTERNS_CATEGORIES = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Creational Patterns
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "creational",
    icon: "🏗️",
    title: "Creational Patterns",
    topics: [
      {
        id: "singleton",
        title: "Singleton",
        summary: "Ensure a type has exactly one instance, with global access to it",
        explanation:
          "Singleton guarantees a single, shared instance of a type — typically a config object, connection pool, or logger — and provides one access point to it. In Go, the idiomatic way to build a lazily-initialized, thread-safe singleton is `sync.Once`: its `Do` method runs the initializer exactly once even if dozens of goroutines call it concurrently, and every subsequent call is a cheap no-op. This avoids both the classic double-checked-locking dance and the eager-init-at-package-load alternative (which forces initialization order and can't handle initialization errors gracefully).",
        keyPoints: [
          "`sync.Once.Do(f)` runs `f` exactly once across all goroutines — subsequent calls block until the first completes, then return immediately",
          "Prefer returning the singleton via a `GetInstance()` function over an exported package-level `var` — it lets you defer construction and keep the zero value private",
          "An alternative is package-level `var instance = &Config{...}` initialized at `init()` time — simpler, but runs even if unused and can't return an error",
          "Singletons make unit testing harder (shared global state) — prefer passing the instance explicitly via dependency injection once constructed",
        ],
        gotchas: [
          "A singleton holding mutable state is a hidden dependency for every caller — changes from one goroutine are visible to all others, so it must be safe for concurrent use",
          "`sync.Once` only guards the FIRST call — if initialization can fail, store the error alongside the instance so every caller observes the same failure rather than silently retrying",
        ],
        code: `package main

import (
\t"fmt"
\t"sync"
)

// Config is the type we want exactly one instance of.
type Config struct {
\tDBHost string
\tDBPort int
}

var (
\tinstance *Config
\tonce     sync.Once
)

// GetConfig returns the single shared Config, creating it on first use.
func GetConfig() *Config {
\tonce.Do(func() {
\t\tfmt.Println("initializing config (runs once)...")
\t\tinstance = &Config{DBHost: "localhost", DBPort: 5432}
\t})
\treturn instance
}

func main() {
\tvar wg sync.WaitGroup
\tfor i := 0; i < 5; i++ {
\t\twg.Add(1)
\t\tgo func(id int) {
\t\t\tdefer wg.Done()
\t\t\tcfg := GetConfig()
\t\t\tfmt.Printf("goroutine %d sees %s:%d\\n", id, cfg.DBHost, cfg.DBPort)
\t\t}(i)
\t}
\twg.Wait()
}

// Output (order of goroutine lines may vary, but the init line prints once):
// initializing config (runs once)...
// goroutine 0 sees localhost:5432
// goroutine 1 sees localhost:5432
// ...`,
      },
      {
        id: "factory-method",
        title: "Factory Method",
        summary: "Delegate object creation to a function that returns an interface",
        explanation:
          "Factory Method hides the concrete type behind a constructor function that returns an interface, so callers depend only on behavior (the interface) and never on a concrete struct name. In Go this is usually just a `New...` function with a `switch` on a kind parameter, returning the shared interface type. Adding a new variant means adding a new `case` and a new struct — every existing caller of the factory is untouched because they only ever held the interface.",
        keyPoints: [
          "The factory function's return type is an interface, not a concrete struct — callers can't accidentally depend on fields that only one variant has",
          "New product types are added by extending the `switch` in ONE place — the Open/Closed principle applied to construction logic",
          "Pairs naturally with Go's implicit interface satisfaction — a new struct needs no `implements` declaration, just the right method set",
          "Keep the factory's input a small enum-like string/const, not a struct — it should be a simple 'what kind do you want' decision point",
        ],
        gotchas: [
          "Don't let the factory itself become a god-function with business logic — its only job is to pick and construct; behavior belongs on the returned type",
          "Returning a nil interface value wrapped in a non-nil concrete type is a classic Go trap — return `nil` explicitly for the 'unknown kind' error case, not a `*ConcreteType(nil)`",
        ],
        code: `package main

import "fmt"

// Notifier is the product interface every concrete notifier implements.
type Notifier interface {
\tSend(message string) string
}

type EmailNotifier struct{ to string }

func (e *EmailNotifier) Send(message string) string {
\treturn fmt.Sprintf("Email to %s: %s", e.to, message)
}

type SMSNotifier struct{ phone string }

func (s *SMSNotifier) Send(message string) string {
\treturn fmt.Sprintf("SMS to %s: %s", s.phone, message)
}

type SlackNotifier struct{ channel string }

func (s *SlackNotifier) Send(message string) string {
\treturn fmt.Sprintf("Slack #%s: %s", s.channel, message)
}

// NewNotifier is the Factory Method — callers ask for a "kind" and a
// destination, and get back a Notifier without knowing the concrete type.
func NewNotifier(kind, destination string) (Notifier, error) {
\tswitch kind {
\tcase "email":
\t\treturn &EmailNotifier{to: destination}, nil
\tcase "sms":
\t\treturn &SMSNotifier{phone: destination}, nil
\tcase "slack":
\t\treturn &SlackNotifier{channel: destination}, nil
\tdefault:
\t\treturn nil, fmt.Errorf("unknown notifier kind: %q", kind)
\t}
}

func main() {
\tkinds := []struct{ kind, dest string }{
\t\t{"email", "ops@example.com"},
\t\t{"sms", "+1-555-0100"},
\t\t{"slack", "incidents"},
\t}

\tfor _, k := range kinds {
\t\tn, err := NewNotifier(k.kind, k.dest)
\t\tif err != nil {
\t\t\tfmt.Println("error:", err)
\t\t\tcontinue
\t\t}
\t\tfmt.Println(n.Send("service degraded"))
\t}
}

// Output:
// Email to ops@example.com: service degraded
// SMS to +1-555-0100: service degraded
// Slack #incidents: service degraded`,
      },
      {
        id: "abstract-factory",
        title: "Abstract Factory",
        summary: "Produce families of related objects without specifying their concrete types",
        explanation:
          "Abstract Factory is a 'factory of factories' — one interface declares methods that each create a DIFFERENT product, and each concrete factory implementation produces a matching FAMILY of products that are designed to work together. The classic example is cross-platform UI kits: a `DarkThemeFactory` produces a dark `Button` AND a dark `Checkbox`, while a `LightThemeFactory` produces the light versions of both — the calling code picks ONE factory and every widget it creates is automatically consistent.",
        keyPoints: [
          "One interface (`UIFactory`) declares a creation method per product (`CreateButton`, `CreateCheckbox`) — concrete factories implement all of them",
          "The caller selects a factory ONCE (e.g. based on config or OS) and then creates many products through it — consistency is enforced by construction, not convention",
          "Each product itself is typically also behind an interface (`Button`, `Checkbox`), so Abstract Factory often layers Factory Method underneath",
          "Use this when 'must match' families of objects exist — theming, database driver + dialect pairs, cloud-provider SDK clients (compute + storage + network from the same provider)",
        ],
        gotchas: [
          "Adding a brand-new PRODUCT (e.g. a `Slider` widget) requires changing the `UIFactory` interface AND every concrete factory — Abstract Factory makes adding FAMILIES easy but adding PRODUCT TYPES expensive",
          "Don't reach for this pattern for a single product — that's plain Factory Method; Abstract Factory only earns its complexity when two or more products must vary TOGETHER",
        ],
        code: `package main

import "fmt"

// ── Products ──
type Button interface{ Render() string }
type Checkbox interface{ Render() string }

// ── Dark family ──
type DarkButton struct{}

func (DarkButton) Render() string { return "[ Button: dark-bg/white-text ]" }

type DarkCheckbox struct{}

func (DarkCheckbox) Render() string { return "[x] Checkbox: dark-bg/white-tick" }

// ── Light family ──
type LightButton struct{}

func (LightButton) Render() string { return "[ Button: light-bg/black-text ]" }

type LightCheckbox struct{}

func (LightCheckbox) Render() string { return "[x] Checkbox: light-bg/black-tick" }

// ── Abstract Factory ──
type UIFactory interface {
\tCreateButton() Button
\tCreateCheckbox() Checkbox
}

type DarkThemeFactory struct{}

func (DarkThemeFactory) CreateButton() Button     { return DarkButton{} }
func (DarkThemeFactory) CreateCheckbox() Checkbox { return DarkCheckbox{} }

type LightThemeFactory struct{}

func (LightThemeFactory) CreateButton() Button     { return LightButton{} }
func (LightThemeFactory) CreateCheckbox() Checkbox { return LightCheckbox{} }

// renderForm builds a UI using whichever factory it's given — every widget
// it produces belongs to the SAME family automatically.
func renderForm(f UIFactory) {
\tfmt.Println(f.CreateButton().Render())
\tfmt.Println(f.CreateCheckbox().Render())
}

func main() {
\tuserPrefersDark := true

\tvar factory UIFactory
\tif userPrefersDark {
\t\tfactory = DarkThemeFactory{}
\t} else {
\t\tfactory = LightThemeFactory{}
\t}

\trenderForm(factory)
}

// Output:
// [ Button: dark-bg/white-text ]
// [x] Checkbox: dark-bg/white-tick`,
      },
      {
        id: "builder",
        title: "Builder",
        summary: "Construct a complex object step by step, separating construction from representation",
        explanation:
          "Builder solves the 'telescoping constructor' problem — a struct with many optional fields would otherwise need a constructor with a dozen parameters, most of which callers pass as zero values. Instead, a builder exposes chainable `With...` methods that set fields one at a time and return the builder itself, ending with a `Build()` that validates and returns the finished, immutable object. This is Go's idiomatic answer to 'optional named parameters', which the language doesn't have natively.",
        keyPoints: [
          "Each `With...` method returns the builder (`*ServerBuilder`) so calls chain fluently: `NewServerBuilder().WithHost(...).WithPort(...).Build()`",
          "`Build()` is the single place that validates required fields and applies defaults — it returns `(Server, error)` so invalid combinations fail at construction, not at use",
          "An alternative idiom for SIMPLER cases is the 'functional options' pattern — `NewServer(WithHost(...), WithTimeout(...))` where each option is a `func(*Server)` — less boilerplate for a handful of optional fields",
          "Builder is most worth its weight when construction has VALIDATION or ORDERING rules (e.g. 'TLS cert requires a key too') — for plain data bags, a struct literal with named fields is simpler and idiomatic Go",
        ],
        gotchas: [
          "A builder whose `With...` methods mutate and return the SAME pointer is not safe to reuse across goroutines or to 'fork' into two configurations — calling `Build()` twice on a shared builder can produce two objects that alias the same slice/map fields",
          "Don't let `Build()` silently swallow invalid input — return an error rather than a half-configured zero value, otherwise misconfiguration surfaces far from its cause",
        ],
        code: `package main

import (
\t"errors"
\t"fmt"
\t"time"
)

// Server is the complex object being constructed.
type Server struct {
\tHost         string
\tPort         int
\tReadTimeout  time.Duration
\tWriteTimeout time.Duration
\tTLSEnabled   bool
}

// ServerBuilder accumulates configuration before producing a Server.
type ServerBuilder struct {
\tserver Server
\terr    error
}

func NewServerBuilder() *ServerBuilder {
\t// Defaults live here — callers only override what they care about.
\treturn &ServerBuilder{server: Server{
\t\tHost:         "0.0.0.0",
\t\tPort:         8080,
\t\tReadTimeout:  5 * time.Second,
\t\tWriteTimeout: 10 * time.Second,
\t}}
}

func (b *ServerBuilder) WithHost(host string) *ServerBuilder {
\tb.server.Host = host
\treturn b
}

func (b *ServerBuilder) WithPort(port int) *ServerBuilder {
\tif port <= 0 || port > 65535 {
\t\tb.err = errors.New("port must be between 1 and 65535")
\t\treturn b
\t}
\tb.server.Port = port
\treturn b
}

func (b *ServerBuilder) WithTLS(enabled bool) *ServerBuilder {
\tb.server.TLSEnabled = enabled
\treturn b
}

// Build validates accumulated state and returns the finished Server.
func (b *ServerBuilder) Build() (Server, error) {
\tif b.err != nil {
\t\treturn Server{}, b.err
\t}
\treturn b.server, nil
}

func main() {
\tsrv, err := NewServerBuilder().
\t\tWithHost("api.internal").
\t\tWithPort(9443).
\t\tWithTLS(true).
\t\tBuild()
\tif err != nil {
\t\tfmt.Println("error:", err)
\t\treturn
\t}
\tfmt.Printf("%+v\\n", srv)

\t_, err = NewServerBuilder().WithPort(99999).Build()
\tfmt.Println("validation error:", err)
}

// Output:
// {Host:api.internal Port:9443 ReadTimeout:5s WriteTimeout:10s TLSEnabled:true}
// validation error: port must be between 1 and 65535`,
      },
      {
        id: "prototype",
        title: "Prototype",
        summary: "Create new objects by copying an existing instance instead of building from scratch",
        explanation:
          "Prototype clones an existing, fully-configured object to produce a new one — useful when constructing an instance from scratch is expensive (deep config, parsed templates, pre-warmed caches) or when you want a 'baseline' object that callers tweak slightly. In Go, this is a `Clone()` method that returns a deep copy: it must explicitly copy slices, maps, and pointers field-by-field, because Go's default struct assignment is a SHALLOW copy that would leave the clone sharing mutable backing arrays/maps with the original.",
        keyPoints: [
          "`Clone()` returns a new pointer with all VALUE fields copied automatically by struct assignment, but slices/maps/pointers need explicit deep-copy loops",
          "Useful for 'template' objects — a default `*HTTPRequest` or `*GameEnemy` config that's cloned and then customized per use, avoiding re-parsing/re-validating the base config each time",
          "Differs from Builder: Builder constructs from PARTS going forward; Prototype starts from a WHOLE existing object and forks it",
          "In concurrent code, cloning is often how you hand a goroutine its OWN copy of shared config so it can mutate freely without locking",
        ],
        gotchas: [
          "Forgetting to deep-copy a map or slice field means the 'clone' and the original share the same backing storage — mutating the clone's slice can silently corrupt the original",
          "If a field is itself a pointer to another struct, decide deliberately whether the clone should share that pointer (shallow) or get its own copy (deep) — document which for every pointer field",
        ],
        code: `package main

import "fmt"

// EnemyTemplate is an expensive-to-construct baseline configuration.
type EnemyTemplate struct {
\tName     string
\tHP       int
\tAbilities []string          // slice — needs deep copy
\tResist   map[string]float64 // map — needs deep copy
}

// Clone returns a deep copy so the caller can mutate it independently.
func (e *EnemyTemplate) Clone() *EnemyTemplate {
\tabilities := make([]string, len(e.Abilities))
\tcopy(abilities, e.Abilities)

\tresist := make(map[string]float64, len(e.Resist))
\tfor k, v := range e.Resist {
\t\tresist[k] = v
\t}

\treturn &EnemyTemplate{
\t\tName:      e.Name,
\t\tHP:        e.HP,
\t\tAbilities: abilities,
\t\tResist:    resist,
\t}
}

func main() {
\t// Expensive to build once: balancing numbers, ability list, resistances.
\tbaseGoblin := &EnemyTemplate{
\t\tName:      "Goblin",
\t\tHP:        50,
\t\tAbilities: []string{"slash", "throw-rock"},
\t\tResist:    map[string]float64{"fire": 0.0, "poison": 0.5},
\t}

\t// Spawn a tougher variant by cloning and tweaking — base is untouched.
\teliteGoblin := baseGoblin.Clone()
\teliteGoblin.Name = "Goblin Elite"
\teliteGoblin.HP = 120
\teliteGoblin.Abilities = append(eliteGoblin.Abilities, "battle-cry")
\teliteGoblin.Resist["fire"] = 0.25

\tfmt.Printf("base:  %+v\\n", baseGoblin)
\tfmt.Printf("elite: %+v\\n", eliteGoblin)
}

// Output:
// base:  &{Name:Goblin HP:50 Abilities:[slash throw-rock] Resist:map[fire:0 poison:0.5]}
// elite: &{Name:Goblin Elite HP:120 Abilities:[slash throw-rock battle-cry] Resist:map[fire:0.25 poison:0.5]}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Structural Patterns
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "structural",
    icon: "🧩",
    title: "Structural Patterns",
    topics: [
      {
        id: "adapter",
        title: "Adapter",
        summary: "Wrap an incompatible type so it satisfies the interface callers expect",
        explanation:
          "Adapter lets two incompatible interfaces work together by wrapping one of them in a small struct that translates calls from the shape the CALLER expects to the shape the EXISTING type provides. It's the pattern behind every '`*Adapter` struct embeds a third-party client and implements OUR interface' you write when integrating a vendor SDK, a legacy module, or a different API version — the rest of the codebase depends only on your interface and never sees the adaptee's signatures.",
        keyPoints: [
          "The adapter struct holds (embeds or wraps) the 'adaptee' and implements the TARGET interface your application already depends on",
          "Translation is usually just renaming methods, reordering arguments, or converting error/return types — the adapter has no business logic of its own",
          "Extremely common at integration boundaries: wrapping a third-party SDK so your code depends on a small interface YOU defined (and can mock in tests)",
          "Differs from Decorator: Adapter changes an interface to make two things COMPATIBLE; Decorator keeps the same interface and ADDS behavior",
        ],
        gotchas: [
          "Don't let the adapter accumulate business logic over time — if it starts making decisions instead of translating calls, that logic belongs in a separate layer",
          "An adapter around a STATEFUL legacy client (e.g. one with internal connection pooling) needs to forward `Close()`/lifecycle methods too, or resources leak",
        ],
        code: `package main

import "fmt"

// PaymentProcessor is the interface OUR application code depends on.
type PaymentProcessor interface {
\tPay(amountCents int64) error
}

// LegacyGateway is a third-party SDK type we don't control — its method
// signature doesn't match PaymentProcessor (different units, different name).
type LegacyGateway struct{}

func (g *LegacyGateway) ChargeInDollars(amount float64) (string, error) {
\tfmt.Printf("legacy gateway charged $%.2f\\n", amount)
\treturn "txn_12345", nil
}

// LegacyGatewayAdapter adapts LegacyGateway to our PaymentProcessor interface.
type LegacyGatewayAdapter struct {
\tgateway *LegacyGateway
}

func (a *LegacyGatewayAdapter) Pay(amountCents int64) error {
\tdollars := float64(amountCents) / 100.0
\t_, err := a.gateway.ChargeInDollars(dollars)
\treturn err
}

// checkout depends only on the interface — it has no idea LegacyGateway exists.
func checkout(p PaymentProcessor, amountCents int64) {
\tif err := p.Pay(amountCents); err != nil {
\t\tfmt.Println("payment failed:", err)
\t\treturn
\t}
\tfmt.Println("payment succeeded")
}

func main() {
\tadapter := &LegacyGatewayAdapter{gateway: &LegacyGateway{}}
\tcheckout(adapter, 2599) // $25.99
}

// Output:
// legacy gateway charged $25.99
// payment succeeded`,
      },
      {
        id: "bridge",
        title: "Bridge",
        summary: "Decouple an abstraction from its implementation so each can vary independently",
        explanation:
          "Bridge splits a feature into two hierarchies: an ABSTRACTION (what the caller uses — e.g. `Notification`) and an IMPLEMENTATION (how it actually happens — e.g. `MessageSender`). The abstraction holds a reference to an implementation INTERFACE rather than embedding a concrete type, so you can mix any abstraction with any implementation at runtime — N abstractions x M implementations without N*M concrete structs. In Go, this often looks like a struct field typed as an interface, set via constructor injection.",
        keyPoints: [
          "The abstraction (`Notification`) depends on an implementation INTERFACE (`MessageSender`), injected via its constructor — classic dependency injection",
          "New abstractions (e.g. `UrgentNotification`) and new implementations (e.g. `PushSender`) can each be added independently — neither hierarchy needs to know about the other's variants",
          "Distinguishes from Adapter: Bridge is designed UP FRONT to let two hierarchies vary independently; Adapter is a RETROFIT to make an existing type fit an existing interface",
          "In Go, plain interfaces + composition often make Bridge feel 'invisible' — it's less a special pattern and more 'inject an interface instead of hardcoding a concrete sender'",
        ],
        gotchas: [
          "If the abstraction ends up with only ONE implementation forever, the extra interface layer is unnecessary indirection — introduce Bridge when a SECOND implementation is realistically coming, not preemptively",
          "Keep the implementation interface narrow (one or two methods) — a wide interface here just re-creates tight coupling one level down",
        ],
        code: `package main

import "fmt"

// ── Implementation hierarchy: HOW a message is delivered ──
type MessageSender interface {
\tSend(to, body string) error
}

type EmailSender struct{}

func (EmailSender) Send(to, body string) error {
\tfmt.Printf("[email] to=%s body=%q\\n", to, body)
\treturn nil
}

type SMSSender struct{}

func (SMSSender) Send(to, body string) error {
\tfmt.Printf("[sms] to=%s body=%q\\n", to, body)
\treturn nil
}

// ── Abstraction hierarchy: WHAT kind of notification is being sent ──
type Notification interface {
\tNotify(to string) error
}

// StandardNotification bridges to whatever MessageSender it's given.
type StandardNotification struct {
\tsender MessageSender
}

func (n *StandardNotification) Notify(to string) error {
\treturn n.sender.Send(to, "Your order has shipped.")
}

// UrgentNotification reuses the SAME senders but changes the message —
// independent variation on the abstraction side.
type UrgentNotification struct {
\tsender MessageSender
}

func (n *UrgentNotification) Notify(to string) error {
\treturn n.sender.Send(to, "URGENT: action required on your account.")
}

func main() {
\tnotifications := []Notification{
\t\t&StandardNotification{sender: EmailSender{}},
\t\t&StandardNotification{sender: SMSSender{}},
\t\t&UrgentNotification{sender: SMSSender{}},
\t}

\tfor _, n := range notifications {
\t\t_ = n.Notify("user@example.com")
\t}
}

// Output:
// [email] to=user@example.com body="Your order has shipped."
// [sms] to=user@example.com body="Your order has shipped."
// [sms] to=user@example.com body="URGENT: action required on your account."`,
      },
      {
        id: "composite",
        title: "Composite",
        summary: "Treat individual objects and groups of objects through the same interface",
        explanation:
          "Composite represents part-whole hierarchies — files and folders, UI widgets and containers, org charts — by giving both LEAVES (individual objects) and COMPOSITES (groups) the SAME interface. A composite holds a slice of children (which are themselves the same interface, so they can be leaves OR nested composites) and implements each operation by delegating to every child and combining the results. Callers never need to check 'is this a leaf or a group' — they just call the shared method.",
        keyPoints: [
          "Both `File` (leaf) and `Folder` (composite) implement the same `Node` interface (e.g. `Size() int`, `Print(indent int)`) — recursion happens naturally through the interface",
          "A composite's method implementation is almost always 'do my own part, then call the same method on each child and combine' — the recursion IS the pattern",
          "Lets client code traverse arbitrarily deep trees with zero type-switching — `root.Size()` works whether `root` is a single file or a tree of nested folders",
          "Common in: filesystem trees, UI component trees, organization hierarchies, abstract-syntax-tree nodes (which also overlaps with Visitor and Interpreter)",
        ],
        gotchas: [
          "Don't give composites methods that only make sense for leaves (e.g. `ReadContents()` on a `Folder`) — keep the shared interface to operations that are MEANINGFUL for both",
          "Watch for cycles if children can reference ancestors — an unguarded recursive `Size()`/`Print()` will infinite-loop on a cyclic graph",
        ],
        code: `package main

import "fmt"

// Node is implemented by both leaves (File) and composites (Folder).
type Node interface {
\tName() string
\tSize() int
\tPrint(indent string)
}

// File is a leaf — no children, just a size.
type File struct {
\tname string
\tsize int
}

func (f *File) Name() string { return f.name }
func (f *File) Size() int    { return f.size }
func (f *File) Print(indent string) {
\tfmt.Printf("%s- %s (%d bytes)\\n", indent, f.name, f.size)
}

// Folder is a composite — its Size/Print delegate to every child.
type Folder struct {
\tname     string
\tchildren []Node
}

func (d *Folder) Name() string { return d.name }

func (d *Folder) Add(n Node) {
\td.children = append(d.children, n)
}

func (d *Folder) Size() int {
\ttotal := 0
\tfor _, child := range d.children {
\t\ttotal += child.Size() // works whether child is a File or another Folder
\t}
\treturn total
}

func (d *Folder) Print(indent string) {
\tfmt.Printf("%s+ %s/ (%d bytes total)\\n", indent, d.name, d.Size())
\tfor _, child := range d.children {
\t\tchild.Print(indent + "  ")
\t}
}

func main() {
\troot := &Folder{name: "project"}
\tsrc := &Folder{name: "src"}
\tsrc.Add(&File{name: "main.go", size: 1200})
\tsrc.Add(&File{name: "util.go", size: 800})

\tdocs := &Folder{name: "docs"}
\tdocs.Add(&File{name: "README.md", size: 450})

\troot.Add(src)
\troot.Add(docs)
\troot.Add(&File{name: "go.mod", size: 60})

\troot.Print("")
}

// Output:
// + project/ (2510 bytes total)
//   + src/ (2000 bytes total)
//     - main.go (1200 bytes)
//     - util.go (800 bytes)
//   + docs/ (450 bytes total)
//     - README.md (450 bytes)
//   - go.mod (60 bytes)`,
      },
      {
        id: "decorator",
        title: "Decorator",
        summary: "Wrap an object to add behavior while keeping the same interface",
        explanation:
          "Decorator wraps a value behind the SAME interface it implements, adding behavior before/after delegating to the wrapped value — and because the wrapper has the same interface, decorators STACK: `Logging(Retry(Metrics(client)))`. Go's standard library is built on this — `io.Reader` wrappers (`bufio.Reader`, `gzip.Reader`, `io.LimitReader`) all wrap another `io.Reader` and add buffering/decompression/limiting while remaining an `io.Reader` themselves. HTTP middleware (`func(http.Handler) http.Handler`) is the same idea applied to handlers.",
        keyPoints: [
          "A decorator struct embeds/holds the WRAPPED value as the SAME interface type it itself implements — `type LoggingClient struct { inner HTTPClient }`",
          "Each decorator does ONE thing (logging, retry, caching, rate-limiting) and calls `inner.Method()` to delegate the rest — single responsibility per layer",
          "Stacking order matters: `Retry(Logging(client))` logs every retry attempt; `Logging(Retry(client))` logs only the final outcome — be deliberate about nesting order",
          "In Go, the function-wrapping form (`func(Handler) Handler` middleware) is more idiomatic for HTTP/RPC layers than struct-based decorators — same pattern, lighter syntax",
        ],
        gotchas: [
          "A decorator that doesn't implement EVERY method of the wrapped interface (when embedding a concrete type, not an interface) silently falls back to the embedded type's method — easy to forget you didn't actually override something",
          "Deep decorator stacks make stack traces and debugging harder — each layer adds a frame; don't stack purely 'for symmetry'",
        ],
        code: `package main

import "fmt"

// DataStore is the interface every decorator and the real implementation share.
type DataStore interface {
\tGet(key string) (string, error)
}

// realStore simulates a slow backing store (e.g. a database).
type realStore struct {
\tdata map[string]string
}

func (s *realStore) Get(key string) (string, error) {
\tv, ok := s.data[key]
\tif !ok {
\t\treturn "", fmt.Errorf("key %q not found", key)
\t}
\tfmt.Printf("  [store] fetched %q from backing store\\n", key)
\treturn v, nil
}

// cachingDecorator wraps a DataStore and serves repeat reads from memory.
type cachingDecorator struct {
\tinner DataStore
\tcache map[string]string
}

func (c *cachingDecorator) Get(key string) (string, error) {
\tif v, ok := c.cache[key]; ok {
\t\tfmt.Printf("  [cache] hit for %q\\n", key)
\t\treturn v, nil
\t}
\tv, err := c.inner.Get(key)
\tif err != nil {
\t\treturn "", err
\t}
\tc.cache[key] = v
\treturn v, nil
}

// loggingDecorator wraps a DataStore and logs every call's outcome.
type loggingDecorator struct {
\tinner DataStore
}

func (l *loggingDecorator) Get(key string) (string, error) {
\tv, err := l.inner.Get(key)
\tfmt.Printf("  [log] Get(%q) -> (%q, %v)\\n", key, v, err)
\treturn v, err
}

func main() {
\tvar store DataStore = &realStore{data: map[string]string{"user:1": "alice"}}
\tstore = &cachingDecorator{inner: store, cache: map[string]string{}}
\tstore = &loggingDecorator{inner: store}

\tfmt.Println("first read:")
\tstore.Get("user:1")

\tfmt.Println("second read (served from cache):")
\tstore.Get("user:1")
}

// Output:
// first read:
//   [store] fetched "user:1" from backing store
//   [log] Get("user:1") -> ("alice", <nil>)
// second read (served from cache):
//   [cache] hit for "user:1"
//   [log] Get("user:1") -> ("alice", <nil>)`,
      },
      {
        id: "facade",
        title: "Facade",
        summary: "Provide a single simplified interface over a set of complex subsystems",
        explanation:
          "Facade introduces ONE simple type whose methods internally coordinate several lower-level subsystems — callers get a small, task-oriented API ('PlaceOrder') instead of needing to know that inventory, payment, and shipping are three separate services that must be called in the right order with the right error handling. The subsystems still exist and can still be used directly by code that needs fine control — the facade is an additional, optional, simplified entry point.",
        keyPoints: [
          "The facade's methods are named after USER GOALS ('PlaceOrder', 'Checkout'), not after the subsystems it calls internally — it's an API designed from the caller's perspective",
          "Subsystems remain independently usable — Facade doesn't hide or replace them, it just bundles common sequences of calls for the common case",
          "Reduces coupling: application code depends on the facade's small interface, not on the constructor signatures and call order of N subsystems",
          "Frequently the FIRST thing you build when wrapping a set of microservice clients into a single 'OrderService' your handlers call",
        ],
        gotchas: [
          "A facade that grows methods for every possible combination of subsystem calls becomes a god-object — keep it to the common, well-defined workflows and let advanced callers use subsystems directly",
          "Don't let the facade swallow errors from subsystems into a generic 'something went wrong' — propagate enough detail for callers to react (e.g. payment failed vs. inventory unavailable)",
        ],
        code: `package main

import "fmt"

// ── Subsystems — each has its own focused responsibility ──
type InventoryService struct{}

func (InventoryService) Reserve(sku string, qty int) error {
\tfmt.Printf("  [inventory] reserved %d x %s\\n", qty, sku)
\treturn nil
}

type PaymentService struct{}

func (PaymentService) Charge(cents int64) error {
\tfmt.Printf("  [payment] charged %d cents\\n", cents)
\treturn nil
}

type ShippingService struct{}

func (ShippingService) Schedule(sku string) error {
\tfmt.Printf("  [shipping] scheduled delivery for %s\\n", sku)
\treturn nil
}

// OrderFacade gives callers ONE method that coordinates all three subsystems
// in the right order, with shared error handling.
type OrderFacade struct {
\tinventory InventoryService
\tpayment   PaymentService
\tshipping  ShippingService
}

func NewOrderFacade() *OrderFacade {
\treturn &OrderFacade{}
}

func (f *OrderFacade) PlaceOrder(sku string, qty int, priceCents int64) error {
\tif err := f.inventory.Reserve(sku, qty); err != nil {
\t\treturn fmt.Errorf("reserve failed: %w", err)
\t}
\tif err := f.payment.Charge(priceCents * int64(qty)); err != nil {
\t\treturn fmt.Errorf("payment failed: %w", err)
\t}
\tif err := f.shipping.Schedule(sku); err != nil {
\t\treturn fmt.Errorf("shipping failed: %w", err)
\t}
\treturn nil
}

func main() {
\tfacade := NewOrderFacade()

\tfmt.Println("placing order:")
\tif err := facade.PlaceOrder("SKU-42", 2, 1999); err != nil {
\t\tfmt.Println("order failed:", err)
\t\treturn
\t}
\tfmt.Println("order placed successfully")
}

// Output:
// placing order:
//   [inventory] reserved 2 x SKU-42
//   [payment] charged 3998 cents
//   [shipping] scheduled delivery for SKU-42
// order placed successfully`,
      },
      {
        id: "flyweight",
        title: "Flyweight",
        summary: "Share immutable common state across many objects to cut memory use",
        explanation:
          "Flyweight separates an object's state into INTRINSIC (shared, immutable, e.g. a character glyph's shape/font) and EXTRINSIC (per-instance, e.g. its position on screen) parts. A factory keeps a pool of intrinsic-state objects keyed by their defining attributes and returns the SAME instance for the same key — callers then pair that shared instance with their own extrinsic state. This turns 'N objects with mostly-duplicate data' into 'a handful of shared objects + N small (key, extrinsic) pairs'.",
        keyPoints: [
          "A flyweight factory (`map[key]*Flyweight` + mutex, or `sync.Map`) returns an EXISTING instance for a known key instead of allocating a new one",
          "Intrinsic state on the flyweight must be IMMUTABLE after creation — it's shared by every caller, so mutating it would corrupt unrelated callers' view",
          "Extrinsic state (position, owner, timestamp) stays OUTSIDE the flyweight, passed in by the caller at use-time — the flyweight is stateless with respect to it",
          "Worth it when the number of DISTINCT intrinsic configurations is small relative to the number of OBJECTS — e.g. a handful of tile types rendered millions of times on a game map",
        ],
        gotchas: [
          "If 'intrinsic' state turns out to need per-instance customization later, you can't just add a field — that would break sharing; it has to move to extrinsic state (a parameter), which can be an invasive change",
          "The factory's cache grows unboundedly if keys are derived from unbounded input (e.g. arbitrary user strings) — bound it or use a cache with eviction if the key space isn't small and fixed",
        ],
        code: `package main

import "fmt"

// TileType is the INTRINSIC (shared, immutable) state — just a render glyph.
type TileType struct {
\tName  string
\tGlyph rune
}

// TileFactory caches TileType instances so identical tile kinds share one object.
type TileFactory struct {
\tcache map[string]*TileType
}

func NewTileFactory() *TileFactory {
\treturn &TileFactory{cache: make(map[string]*TileType)}
}

func (f *TileFactory) Get(name string, glyph rune) *TileType {
\tif t, ok := f.cache[name]; ok {
\t\treturn t // reuse existing flyweight — no new allocation
\t}
\tt := &TileType{Name: name, Glyph: glyph}
\tf.cache[name] = t
\tfmt.Printf("  [factory] created new TileType %q\\n", name)
\treturn t
}

// MapCell holds EXTRINSIC state (position) plus a reference to a shared TileType.
type MapCell struct {
\tX, Y int
\tTile *TileType
}

func main() {
\tfactory := NewTileFactory()

\t// A 4x4 map referencing only 2 distinct tile types — but 16 cells.
\tvar cells []MapCell
\tfor y := 0; y < 4; y++ {
\t\tfor x := 0; x < 4; x++ {
\t\t\tname, glyph := "grass", '.'
\t\t\tif (x+y)%5 == 0 {
\t\t\t\tname, glyph = "rock", '#'
\t\t\t}
\t\t\tcells = append(cells, MapCell{X: x, Y: y, Tile: factory.Get(name, glyph)})
\t\t}
\t}

\tfmt.Printf("cells: %d, distinct TileType objects: %d\\n", len(cells), len(factory.cache))
\tfmt.Printf("cell (0,0) and (1,1) share the same *TileType: %v\\n",
\t\tcells[0].Tile == cells[5].Tile)
}

// Output:
//   [factory] created new TileType "grass"
//   [factory] created new TileType "rock"
// cells: 16, distinct TileType objects: 2
// cell (0,0) and (1,1) share the same *TileType: true`,
      },
      {
        id: "proxy",
        title: "Proxy",
        summary: "Provide a stand-in for another object to control access, add caching, or defer cost",
        explanation:
          "Proxy implements the SAME interface as a 'real' object and sits in front of it, controlling access — lazily creating the real object on first use (virtual proxy), checking permissions before delegating (protection proxy), or caching results (caching proxy). The caller holds the proxy through the shared interface and can't tell it's not talking to the real thing directly. This looks similar to Decorator, but the INTENT differs: Decorator ADDS behavior to something that's always there; Proxy CONTROLS ACCESS to something that might be expensive, remote, or restricted.",
        keyPoints: [
          "Proxy and the real subject implement the SAME interface — the proxy is substitutable anywhere the real subject is expected",
          "Virtual proxy: defers expensive construction until the first real call ('lazy init') — useful for large resources (images, DB connections) that might never be used",
          "Protection proxy: checks authorization/role before delegating — the access-control check lives in the proxy, not scattered through the real object's methods",
          "Caching proxy: remembers previous results and only delegates on a cache miss — distinguish from Flyweight, which shares IDENTITY of objects; a caching proxy shares RESULTS of calls",
        ],
        gotchas: [
          "A lazy-init virtual proxy that's used concurrently needs its own synchronization (e.g. `sync.Once`) around the construction step, or two goroutines can race to build the real subject",
          "Don't let a protection proxy's checks diverge from the real object's actual requirements over time — keep the policy in one place (ideally the proxy delegates the CHECK to a shared authorizer, not duplicated logic)",
        ],
        code: `package main

import "fmt"

// ImageRenderer is the shared interface for the real subject and its proxy.
type ImageRenderer interface {
\tRender() string
}

// HighResImage is expensive to construct — simulating a large file load.
type HighResImage struct {
\tpath string
}

func NewHighResImage(path string) *HighResImage {
\tfmt.Printf("  [load] reading %s from disk (expensive)\\n", path)
\treturn &HighResImage{path: path}
}

func (i *HighResImage) Render() string {
\treturn fmt.Sprintf("rendering %s at full resolution", i.path)
}

// ImageProxy defers loading HighResImage until Render is first called.
type ImageProxy struct {
\tpath string
\treal  *HighResImage
}

func NewImageProxy(path string) *ImageProxy {
\treturn &ImageProxy{path: path} // no expensive work yet
}

func (p *ImageProxy) Render() string {
\tif p.real == nil {
\t\tp.real = NewHighResImage(p.path) // lazy init on first use
\t}
\treturn p.real.Render()
}

func main() {
\tfmt.Println("creating proxies (cheap):")
\timages := []ImageRenderer{
\t\tNewImageProxy("hero.png"),
\t\tNewImageProxy("banner.png"),
\t}

\tfmt.Println("only rendering the first image:")
\tfmt.Println(images[0].Render())
\tfmt.Println(images[0].Render()) // second call: no reload, real object already exists
}

// Output:
// creating proxies (cheap):
// only rendering the first image:
//   [load] reading hero.png from disk (expensive)
// rendering hero.png at full resolution
// rendering hero.png at full resolution`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Behavioral Patterns
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "behavioral",
    icon: "🎭",
    title: "Behavioral Patterns",
    topics: [
      {
        id: "chain-of-responsibility",
        title: "Chain of Responsibility",
        summary: "Pass a request along a chain of handlers until one handles it",
        explanation:
          "Chain of Responsibility links a series of handlers, each implementing the same interface, where every handler decides either to process a request itself or pass it to the next handler in the chain (or both). Neither the caller nor any handler needs to know the full chain — each link only knows 'my next'. This is precisely the shape of HTTP middleware in Go: `func(http.Handler) http.Handler` wraps a handler and either short-circuits (auth failure -> 401, never calls next) or does some work and calls `next.ServeHTTP(...)`.",
        keyPoints: [
          "Each handler holds a reference to the NEXT handler (often `next Handler`, possibly nil) and decides whether to call it — the chain is just a linked list of decisions",
          "A request can be handled by the FIRST matching handler, by SEVERAL handlers in sequence (each doing its part, like middleware), or by NONE (falls through to a default)",
          "Go's `net/http` middleware chaining (`Logging(Auth(RateLimit(handler)))`) is Chain of Responsibility — each layer can short-circuit by not calling `next`",
          "Adding/removing/reordering handlers doesn't require touching the handlers themselves — only the code that WIRES the chain together changes",
        ],
        gotchas: [
          "If NO handler in the chain handles the request and there's no explicit 'default/fallback' terminal handler, the request silently disappears — always terminate the chain with something that handles the 'nothing matched' case",
          "Order matters and is easy to get wrong — an auth check placed AFTER a logging handler that prints request bodies could log unauthenticated/sensitive payloads",
        ],
        code: `package main

import "fmt"

// Request flows through a chain of approval handlers (e.g. expense approval).
type Request struct {
\tAmount int
}

// Handler is implemented by every link in the chain.
type Handler interface {
\tHandle(r *Request) string
\tSetNext(h Handler)
}

// baseHandler provides the shared "next" plumbing for every concrete handler.
type baseHandler struct {
\tnext Handler
}

func (b *baseHandler) SetNext(h Handler) { b.next = h }

func (b *baseHandler) callNext(r *Request) string {
\tif b.next != nil {
\t\treturn b.next.Handle(r)
\t}
\treturn "no approver could handle this request"
}

type Manager struct{ baseHandler }

func (h *Manager) Handle(r *Request) string {
\tif r.Amount <= 1000 {
\t\treturn fmt.Sprintf("Manager approved $%d", r.Amount)
\t}
\treturn h.callNext(r)
}

type Director struct{ baseHandler }

func (h *Director) Handle(r *Request) string {
\tif r.Amount <= 10000 {
\t\treturn fmt.Sprintf("Director approved $%d", r.Amount)
\t}
\treturn h.callNext(r)
}

type VP struct{ baseHandler }

func (h *VP) Handle(r *Request) string {
\tif r.Amount <= 100000 {
\t\treturn fmt.Sprintf("VP approved $%d", r.Amount)
\t}
\treturn h.callNext(r)
}

func main() {
\tmanager := &Manager{}
\tdirector := &Director{}
\tvp := &VP{}

\t// Wire the chain: Manager -> Director -> VP
\tmanager.SetNext(director)
\tdirector.SetNext(vp)

\tfor _, amount := range []int{500, 5000, 50000, 500000} {
\t\tfmt.Println(manager.Handle(&Request{Amount: amount}))
\t}
}

// Output:
// Manager approved $500
// Director approved $5000
// VP approved $50000
// no approver could handle this request`,
      },
      {
        id: "command",
        title: "Command",
        summary: "Encapsulate a request as an object so it can be queued, logged, or undone",
        explanation:
          "Command turns 'do this action with these arguments' into an OBJECT implementing `Execute()` (and often `Undo()`). Instead of calling a method directly, callers construct a command and hand it to an invoker, which can queue it, log it, retry it, or push it onto an undo stack. This decouples WHO requests an action from WHO performs it and WHEN — a UI button doesn't call `document.Save()` directly, it creates and dispatches a `SaveCommand`.",
        keyPoints: [
          "A command struct captures everything needed to perform (and reverse) an action — the receiver plus whatever arguments/previous-state are needed for `Undo()`",
          "The invoker (e.g. a `TaskQueue` or `UndoStack`) depends only on the `Command` interface — it can execute, queue, retry, or log ANY command uniformly",
          "Undo/redo is just maintaining two stacks of commands: executing pushes onto the undo stack; undoing pops and calls `Undo()`, pushing onto the redo stack",
          "In Go, a `func()` closure is often a lighter-weight 'command' for simple fire-and-forget cases — reach for a struct when you need `Undo()`, serialization, or introspection (command name/args for logging)",
        ],
        gotchas: [
          "If `Execute()` mutates shared state, `Undo()` must capture enough information BEFORE the mutation to reverse it — capturing state lazily (at undo-time) is often too late",
          "A command queue that's persisted (for retries across restarts) needs commands to be SERIALIZABLE — closures can't be marshaled to JSON, but a struct with exported fields can",
        ],
        code: `package main

import "fmt"

// Document is the receiver that commands operate on.
type Document struct {
\tContent string
}

// Command is implemented by every undoable action.
type Command interface {
\tExecute()
\tUndo()
}

// AppendTextCommand appends text and remembers how much to remove on undo.
type AppendTextCommand struct {
\tdoc  *Document
\ttext string
}

func (c *AppendTextCommand) Execute() {
\tc.doc.Content += c.text
}

func (c *AppendTextCommand) Undo() {
\tc.doc.Content = c.doc.Content[:len(c.doc.Content)-len(c.text)]
}

// History is the invoker — it executes commands and maintains an undo stack.
type History struct {
\tdoc   *Document
\tstack []Command
}

func (h *History) Do(c Command) {
\tc.Execute()
\th.stack = append(h.stack, c)
}

func (h *History) Undo() {
\tif len(h.stack) == 0 {
\t\treturn
\t}
\tlast := h.stack[len(h.stack)-1]
\th.stack = h.stack[:len(h.stack)-1]
\tlast.Undo()
}

func main() {
\tdoc := &Document{}
\thistory := &History{doc: doc}

\thistory.Do(&AppendTextCommand{doc: doc, text: "Hello, "})
\thistory.Do(&AppendTextCommand{doc: doc, text: "World!"})
\tfmt.Printf("after edits: %q\\n", doc.Content)

\thistory.Undo()
\tfmt.Printf("after 1 undo: %q\\n", doc.Content)

\thistory.Undo()
\tfmt.Printf("after 2 undos: %q\\n", doc.Content)
}

// Output:
// after edits: "Hello, World!"
// after 1 undo: "Hello, "
// after 2 undos: ""`,
      },
      {
        id: "iterator",
        title: "Iterator",
        summary: "Provide sequential access to a collection's elements without exposing its internals",
        explanation:
          "Iterator gives callers a uniform way to walk through a collection — `HasNext()` / `Next()` — without exposing whether the underlying storage is a slice, a tree, a linked list, or comes from a paginated API. The collection doesn't need to expose its internal field layout; the caller doesn't need to know how traversal order is computed. Go's standard library increasingly favors a slightly different shape — a `func() (T, bool)` 'pull' iterator, or (Go 1.23+) `range`-over-func iterators (`func(yield func(T) bool)`) — but the goal is identical: decouple traversal from representation.",
        keyPoints: [
          "Classic shape: `HasNext() bool` + `Next() T` — caller loops `for it.HasNext() { v := it.Next(); ... }` without knowing the collection's internal structure",
          "Go 1.23+ range-over-func iterators (`func(yield func(V) bool)`) let a custom type support `for v := range myCollection.Items() { ... }` directly — the modern idiomatic form",
          "An iterator can represent something that ISN'T fully in memory — paginated API results, lines streamed from a file, a generator over an infinite sequence",
          "Multiple independent iterators over the same collection should not interfere with each other — each iterator holds its OWN position, not the collection",
        ],
        gotchas: [
          "Mutating a collection while an iterator over it is in progress is a classic bug source — decide and document whether your iterator tolerates concurrent modification (most don't, and should say so)",
          "An iterator that wraps a resource (file handle, DB cursor) needs an explicit `Close()` — forgetting to call it on early-exit (`break` out of a loop) leaks the resource",
        ],
        code: `package main

import "fmt"

// IntSet is the collection — internal storage (a map) is hidden from callers.
type IntSet struct {
\titems map[int]bool
}

func NewIntSet(values ...int) *IntSet {
\ts := &IntSet{items: make(map[int]bool)}
\tfor _, v := range values {
\t\ts.items[v] = true
\t}
\treturn s
}

// IntSetIterator walks the set's elements one at a time.
type IntSetIterator struct {
\tkeys []int
\tpos  int
}

// Iterator returns a fresh, independent iterator over the set.
func (s *IntSet) Iterator() *IntSetIterator {
\tkeys := make([]int, 0, len(s.items))
\tfor k := range s.items {
\t\tkeys = append(keys, k)
\t}
\treturn &IntSetIterator{keys: keys}
}

func (it *IntSetIterator) HasNext() bool {
\treturn it.pos < len(it.keys)
}

func (it *IntSetIterator) Next() int {
\tv := it.keys[it.pos]
\tit.pos++
\treturn v
}

// Items is a Go 1.23+ range-over-func iterator — enables "for v := range set.Items()".
func (s *IntSet) Items(yield func(int) bool) {
\tfor k := range s.items {
\t\tif !yield(k) {
\t\t\treturn
\t\t}
\t}
}

func main() {
\tset := NewIntSet(10, 20, 30)

\tsum := 0
\tit := set.Iterator()
\tfor it.HasNext() {
\t\tsum += it.Next()
\t}
\tfmt.Println("sum via classic iterator:", sum)

\t// Modern range-over-func form (Go 1.23+):
\t// for v := range set.Items() {
\t//     fmt.Println(v)
\t// }
}

// Output:
// sum via classic iterator: 60`,
      },
      {
        id: "mediator",
        title: "Mediator",
        summary: "Centralize how a set of objects interact, instead of letting them reference each other directly",
        explanation:
          "Mediator introduces a central object that participants talk to instead of talking to each other directly — turning an O(n^2) web of references (every participant knows every other participant) into a star topology where each participant only knows the mediator. The classic example is a chat room: `User.Send(msg)` calls `room.Broadcast(user, msg)`, and the `ChatRoom` mediator distributes the message to every OTHER user — no `User` holds a reference to any other `User`.",
        keyPoints: [
          "Participants hold a reference to the MEDIATOR's interface, never to each other — adding a new participant doesn't require updating existing participants",
          "The mediator centralizes coordination LOGIC (ordering, filtering, broadcast rules) that would otherwise be duplicated across every participant's interactions with every other",
          "Differs from Facade: Facade simplifies calls FROM outside INTO a subsystem; Mediator coordinates calls AMONG a set of peer objects that would otherwise call each other",
          "Useful for: chat rooms, UI dialogs where many widgets must react to each other's changes, air-traffic-control-style coordination, workflow engines",
        ],
        gotchas: [
          "The mediator can become a god-object that knows too much about every participant's internals — keep its interface to PARTICIPANT-FACING events/methods, not internal state pokes",
          "If the mediator itself holds growing per-participant state (e.g. unread counts), it becomes a bottleneck and a single point of failure — consider whether that state belongs in the participants instead",
        ],
        code: `package main

import "fmt"

// ChatRoom is the mediator — participants never reference each other directly.
type ChatRoom struct {
\tusers map[string]*User
}

func NewChatRoom() *ChatRoom {
\treturn &ChatRoom{users: make(map[string]*User)}
}

func (r *ChatRoom) Register(u *User) {
\tu.room = r
\tr.users[u.name] = u
}

// Broadcast delivers a message from "from" to every OTHER registered user.
func (r *ChatRoom) Broadcast(from *User, message string) {
\tfor name, u := range r.users {
\t\tif name == from.name {
\t\t\tcontinue
\t\t}
\t\tu.Receive(from.name, message)
\t}
}

// User is a participant — it only knows about the mediator (ChatRoom).
type User struct {
\tname string
\troom *ChatRoom
}

func (u *User) Send(message string) {
\tfmt.Printf("%s sends: %s\\n", u.name, message)
\tu.room.Broadcast(u, message)
}

func (u *User) Receive(from, message string) {
\tfmt.Printf("  %s received from %s: %s\\n", u.name, from, message)
}

func main() {
\troom := NewChatRoom()

\talice := &User{name: "Alice"}
\tbob := &User{name: "Bob"}
\tcarol := &User{name: "Carol"}

\troom.Register(alice)
\troom.Register(bob)
\troom.Register(carol)

\talice.Send("Hey everyone!")
}

// Output (Bob/Carol order may vary — map iteration is unordered):
// Alice sends: Hey everyone!
//   Bob received from Alice: Hey everyone!
//   Carol received from Alice: Hey everyone!`,
      },
      {
        id: "memento",
        title: "Memento",
        summary: "Capture and restore an object's internal state without violating encapsulation",
        explanation:
          "Memento lets you snapshot an object's state and restore it later — implementing undo/redo, checkpoints, or rollback — WITHOUT exposing that object's internal fields to the code managing the history. The 'originator' produces an opaque memento (often just a copy of its private state) and can later restore from one; a 'caretaker' stores mementos in a stack/list but never looks inside them. In Go, this is naturally just a method `Snapshot() Memento` and `Restore(Memento)`, where `Memento` can be an unexported struct returned as an interface or by value.",
        keyPoints: [
          "The originator owns BOTH the production (`Snapshot()`) and consumption (`Restore()`) of mementos — the caretaker only stores and hands them back, treating them as opaque",
          "Returning the memento by VALUE (a struct copy) is often enough in Go — value semantics give you an automatic, independent snapshot for free, as long as the state has no slices/maps/pointers that need deep copying",
          "Differs from Prototype: Prototype clones a WHOLE object to create a new, independent one going forward; Memento captures a snapshot specifically to RESTORE the SAME object to a PRIOR state later",
          "Pairs naturally with Command for undo systems: each executed command can also push a pre-execution memento, so undo is 'restore the memento' instead of 'reverse the command's effects'",
        ],
        gotchas: [
          "If the originator's state includes slices/maps, a shallow `Snapshot()` shares backing storage with the live object — later mutations to the live object can silently change 'saved' snapshots too; deep-copy when the state is mutable reference types",
          "An unbounded undo history (`[]Memento` that only grows) is a memory leak in long-running processes — cap it or evict the oldest entries",
        ],
        code: `package main

import "fmt"

// EditorState is the memento — an opaque snapshot of Editor's content.
type EditorState struct {
\tcontent string
}

// Editor is the originator.
type Editor struct {
\tcontent string
}

func (e *Editor) Type(text string) {
\te.content += text
}

// Snapshot captures the current state as a memento (plain value copy).
func (e *Editor) Snapshot() EditorState {
\treturn EditorState{content: e.content}
}

// Restore returns the editor to a previously captured state.
func (e *Editor) Restore(s EditorState) {
\te.content = s.content
}

// History is the caretaker — stores mementos without inspecting them.
type History struct {
\tsnapshots []EditorState
}

func (h *History) Save(s EditorState) {
\th.snapshots = append(h.snapshots, s)
}

func (h *History) Pop() (EditorState, bool) {
\tif len(h.snapshots) == 0 {
\t\treturn EditorState{}, false
\t}
\tlast := h.snapshots[len(h.snapshots)-1]
\th.snapshots = h.snapshots[:len(h.snapshots)-1]
\treturn last, true
}

func main() {
\teditor := &Editor{}
\thistory := &History{}

\thistory.Save(editor.Snapshot())
\teditor.Type("Hello")

\thistory.Save(editor.Snapshot())
\teditor.Type(", World!")

\tfmt.Printf("current: %q\\n", editor.content)

\tif s, ok := history.Pop(); ok {
\t\teditor.Restore(s)
\t}
\tfmt.Printf("after undo: %q\\n", editor.content)

\tif s, ok := history.Pop(); ok {
\t\teditor.Restore(s)
\t}
\tfmt.Printf("after 2nd undo: %q\\n", editor.content)
}

// Output:
// current: "Hello, World!"
// after undo: "Hello"
// after 2nd undo: ""`,
      },
      {
        id: "observer",
        title: "Observer",
        summary: "Notify a dynamic list of subscribers whenever a subject's state changes",
        explanation:
          "Observer lets a 'subject' broadcast events to any number of 'observers' that have registered interest, without the subject knowing anything about its observers beyond a shared notification interface. In Go, this is commonly built with a slice of callback functions or channels guarded by a mutex — `Subscribe(func(Event))` appends a listener, and `publish(event)` calls each registered listener (often in its own goroutine, to avoid one slow subscriber blocking the publisher or others).",
        keyPoints: [
          "The subject holds a slice/map of observer references (or callbacks) and a mutex protecting it — `Subscribe`/`Unsubscribe` mutate it, `publish` reads it",
          "Channels are a very Go-native alternative for the 1-subject-many-consumers case — each subscriber gets its own channel, and the publisher fans out (non-blockingly, e.g. via `select` with `default`)",
          "Decide SYNC vs ASYNC delivery deliberately: synchronous notification means a slow/panicking observer affects the publisher directly; async (goroutine per notification, or buffered channels) isolates them but loses ordering guarantees",
          "Unsubscribing matters — an observer that's never removed (e.g. a closed-over reference to a finished request) is a memory/goroutine leak ('lapsed listener' problem)",
        ],
        gotchas: [
          "Calling observer callbacks while HOLDING the subject's lock risks deadlock if an observer calls back into the subject (e.g. to unsubscribe itself) — copy the observer list out from under the lock before invoking callbacks",
          "A panic inside one observer's callback, if not recovered, can take down the publisher (and all other observers) if invoked synchronously and unguarded",
        ],
        code: `package main

import (
\t"fmt"
\t"sync"
)

// Event is what observers receive.
type Event struct {
\tName string
\tData string
}

// Subject manages a thread-safe list of subscriber callbacks.
type Subject struct {
\tmu        sync.Mutex
\tobservers []func(Event)
}

func (s *Subject) Subscribe(fn func(Event)) {
\ts.mu.Lock()
\tdefer s.mu.Unlock()
\ts.observers = append(s.observers, fn)
}

func (s *Subject) Publish(e Event) {
\ts.mu.Lock()
\tobservers := make([]func(Event), len(s.observers)) // copy to avoid holding lock during callbacks
\tcopy(observers, s.observers)
\ts.mu.Unlock()

\tfor _, fn := range observers {
\t\tfn(e)
\t}
}

func main() {
\tsubject := &Subject{}

\t// Two independent observers, neither knows the other exists.
\tsubject.Subscribe(func(e Event) {
\t\tfmt.Printf("  [audit-log] %s: %s\\n", e.Name, e.Data)
\t})
\tsubject.Subscribe(func(e Event) {
\t\tfmt.Printf("  [email] notifying admins about %s\\n", e.Name)
\t})

\tsubject.Publish(Event{Name: "user.created", Data: "id=42"})
}

// Output:
//   [audit-log] user.created: id=42
//   [email] notifying admins about user.created`,
      },
      {
        id: "state",
        title: "State",
        summary: "Let an object change its behavior by swapping out an internal state implementation",
        explanation:
          "State models an object whose behavior depends on which of several discrete STATES it's currently in — an order that's `Pending`, `Paid`, `Shipped`, or `Cancelled` behaves differently for the same method calls (`Cancel()`, `Ship()`). Rather than one giant `switch currentState` inside every method, each state is its OWN type implementing a shared interface, and the context object simply delegates to `current.Handle...()`. Transitioning state means swapping which implementation `current` points to — illegal transitions are caught by simply not providing them.",
        keyPoints: [
          "The context (`Order`) holds a `state OrderState` field (an interface) and delegates every state-dependent method to it — `o.state.Ship(o)`",
          "Each concrete state (`PendingState`, `PaidState`, ...) implements the shared interface and decides, for ITS state, what each transition does — including transitioning `o.state` to the NEXT state on success",
          "Illegal transitions become 'this state doesn't define that behavior usefully' — e.g. `CancelledState.Ship()` just returns an error, with no risk of accidentally mutating a cancelled order",
          "Differs from Strategy: both swap an interface implementation, but State implementations TRANSITION the context to OTHER state implementations as part of normal operation; Strategy implementations are typically chosen once and don't change each other",
        ],
        gotchas: [
          "If every state needs access to shared context data, pass the context (`*Order`) into each state method rather than duplicating fields across state structs — keep state structs stateless where possible (they can often be package-level singletons)",
          "Watch for 'temporal coupling' bugs — calling a method twice in a row before a transition completes (e.g. concurrent `Ship()` calls) can race on `o.state` without a mutex",
        ],
        code: `package main

import "fmt"

// Order is the context — its behavior is delegated to the current OrderState.
type Order struct {
\tstate OrderState
}

func NewOrder() *Order {
\treturn &Order{state: &PendingState{}}
}

func (o *Order) Pay() string  { return o.state.Pay(o) }
func (o *Order) Ship() string { return o.state.Ship(o) }
func (o *Order) Cancel() string { return o.state.Cancel(o) }

// OrderState is implemented by each state in the lifecycle.
type OrderState interface {
\tPay(o *Order) string
\tShip(o *Order) string
\tCancel(o *Order) string
}

type PendingState struct{}

func (PendingState) Pay(o *Order) string {
\to.state = &PaidState{}
\treturn "payment received, order is now Paid"
}
func (PendingState) Ship(o *Order) string  { return "cannot ship: payment not received" }
func (PendingState) Cancel(o *Order) string {
\to.state = &CancelledState{}
\treturn "order cancelled"
}

type PaidState struct{}

func (PaidState) Pay(o *Order) string { return "already paid" }
func (PaidState) Ship(o *Order) string {
\to.state = &ShippedState{}
\treturn "order shipped"
}
func (PaidState) Cancel(o *Order) string {
\to.state = &CancelledState{}
\treturn "order cancelled, refund issued"
}

type ShippedState struct{}

func (ShippedState) Pay(o *Order) string    { return "already paid" }
func (ShippedState) Ship(o *Order) string   { return "already shipped" }
func (ShippedState) Cancel(o *Order) string { return "cannot cancel: already shipped" }

type CancelledState struct{}

func (CancelledState) Pay(o *Order) string    { return "cannot pay: order cancelled" }
func (CancelledState) Ship(o *Order) string   { return "cannot ship: order cancelled" }
func (CancelledState) Cancel(o *Order) string { return "already cancelled" }

func main() {
\torder := NewOrder()

\tfmt.Println(order.Ship())  // illegal from Pending
\tfmt.Println(order.Pay())   // Pending -> Paid
\tfmt.Println(order.Ship())  // Paid -> Shipped
\tfmt.Println(order.Cancel()) // illegal from Shipped
}

// Output:
// cannot ship: payment not received
// payment received, order is now Paid
// order shipped
// cannot cancel: already shipped`,
      },
      {
        id: "strategy",
        title: "Strategy",
        summary: "Make an algorithm swappable by extracting it behind a common interface",
        explanation:
          "Strategy extracts an algorithm (how to compute shipping cost, how to compress data, how to sort) behind an interface, so the context that USES the algorithm doesn't need to know which variant is plugged in — and new variants can be added without touching the context. In Go this is often literally a single function-typed field (`type PriceStrategy func(items []Item) int`), since a one-method interface and a function type are interchangeable — pick whichever reads more clearly at the call site.",
        keyPoints: [
          "The context holds a strategy as an INTERFACE (or func type) field, set via constructor/setter — swapping strategies is just assigning a different value to that field",
          "Each strategy implementation is independently testable in isolation — no need to exercise the context to test a pricing rule",
          "A single-method interface (`type Strategy interface { Apply(...) ... }`) and a function type (`type Strategy func(...) ...`) are often EQUIVALENT in Go — prefer the func type when strategies are stateless, prefer the interface when a strategy needs its OWN fields/config",
          "Differs from Template Method: Strategy delegates the WHOLE algorithm to an interchangeable object; Template Method fixes the overall algorithm's SKELETON and only customizes specific STEPS",
        ],
        gotchas: [
          "Don't let the 'context' reach INTO a strategy's internals to special-case behavior (`if _, ok := strategy.(*PercentDiscount); ok { ... }`) — that defeats the purpose; if special-casing feels necessary, the interface is missing a method",
          "If strategies need shared helper logic, factor it into a separate helper function/type that strategies call — don't put it on the context, which would re-couple strategies to the context's internals",
        ],
        code: `package main

import "fmt"

// Item is what we're computing a shipping cost for.
type Item struct {
\tWeightKg float64
}

// ShippingStrategy computes a shipping cost for a set of items.
type ShippingStrategy interface {
\tCost(items []Item) float64
}

// StandardShipping: flat rate per kg.
type StandardShipping struct{}

func (StandardShipping) Cost(items []Item) float64 {
\ttotal := 0.0
\tfor _, i := range items {
\t\ttotal += i.WeightKg * 2.0
\t}
\treturn total
}

// ExpressShipping: higher per-kg rate plus a flat surcharge.
type ExpressShipping struct{}

func (ExpressShipping) Cost(items []Item) float64 {
\ttotal := 5.0 // flat surcharge
\tfor _, i := range items {
\t\ttotal += i.WeightKg * 5.0
\t}
\treturn total
}

// FreeShipping: always zero — e.g. for premium members.
type FreeShipping struct{}

func (FreeShipping) Cost(items []Item) float64 { return 0 }

// Checkout is the context — it knows nothing about HOW shipping is costed.
type Checkout struct {
\tstrategy ShippingStrategy
}

func (c *Checkout) SetStrategy(s ShippingStrategy) { c.strategy = s }

func (c *Checkout) ShippingCost(items []Item) float64 {
\treturn c.strategy.Cost(items)
}

func main() {
\titems := []Item{{WeightKg: 1.5}, {WeightKg: 2.0}}

\tcheckout := &Checkout{}

\tcheckout.SetStrategy(StandardShipping{})
\tfmt.Printf("standard: $%.2f\\n", checkout.ShippingCost(items))

\tcheckout.SetStrategy(ExpressShipping{})
\tfmt.Printf("express:  $%.2f\\n", checkout.ShippingCost(items))

\tcheckout.SetStrategy(FreeShipping{})
\tfmt.Printf("free:     $%.2f\\n", checkout.ShippingCost(items))
}

// Output:
// standard: $7.00
// express:  $22.50
// free:     $0.00`,
      },
      {
        id: "template-method",
        title: "Template Method",
        summary: "Fix the skeleton of an algorithm in one place, letting subtypes customize individual steps",
        explanation:
          "Template Method defines an algorithm's overall sequence of steps once, while letting specific steps vary per case. Go has no inheritance, so instead of a base class with abstract methods, the idiomatic translation is a struct holding STEP FUNCTIONS as fields (or an interface for the customizable steps), with one fixed `Run()` method that calls them in order. The 'template' (the order and glue between steps) lives in exactly one place — only the steps that genuinely differ are supplied per case.",
        keyPoints: [
          "The fixed algorithm (`Run()`) calls a sequence of steps — some shared/default, some supplied by the caller — in a specific order that NEVER varies",
          "In Go, customizable steps are typically `func` fields on a struct (`ParseFunc func([]byte) (Record, error)`) populated at construction — 'inject the varying parts', not 'override methods on a base class'",
          "Steps that are usually the SAME get a sensible default (assigned if the field is nil); only the steps that genuinely differ per case need to be supplied",
          "Common for: data import/export pipelines (open -> read -> parse -> validate -> write, where only 'parse' differs by format), request handlers (auth -> validate -> execute -> audit, where only 'execute' differs)",
        ],
        gotchas: [
          "If MOST steps end up overridden for MOST cases, Template Method isn't buying you much — that's a sign the 'algorithm' isn't actually shared and you'd be better off with independent functions or Strategy for the whole thing",
          "Forgetting to provide a required step function results in a nil-func panic at call time, not a compile error — validate required fields in the constructor and fail fast with a clear error",
        ],
        code: `package main

import (
\t"fmt"
\t"strings"
)

// Record is a single parsed row.
type Record struct {
\tFields []string
}

// ImportPipeline is the "template" — Run() is the fixed skeleton; ParseLine
// is the customizable step, injected per format.
type ImportPipeline struct {
\tParseLine func(line string) Record // the only step that varies by format
}

// Run executes the fixed sequence: split into lines, parse each, validate, summarize.
// This method NEVER changes regardless of input format.
func (p *ImportPipeline) Run(raw string) []Record {
\tvar records []Record
\tfor _, line := range strings.Split(strings.TrimSpace(raw), "\\n") {
\t\tif line == "" {
\t\t\tcontinue // shared "skip blank lines" step
\t\t}
\t\trec := p.ParseLine(line) // customizable step
\t\tif len(rec.Fields) > 0 { // shared "validate" step
\t\t\trecords = append(records, rec)
\t\t}
\t}
\treturn records
}

func main() {
\tcsvPipeline := &ImportPipeline{
\t\tParseLine: func(line string) Record {
\t\t\treturn Record{Fields: strings.Split(line, ",")}
\t\t},
\t}

\ttsvPipeline := &ImportPipeline{
\t\tParseLine: func(line string) Record {
\t\t\treturn Record{Fields: strings.Split(line, "\\t")}
\t\t},
\t}

\tcsvData := "a,b,c\\n\\nd,e,f"
\ttsvData := "x\\ty\\tz"

\tfmt.Println("CSV:", csvPipeline.Run(csvData))
\tfmt.Println("TSV:", tsvPipeline.Run(tsvData))
}

// Output:
// CSV: [{Fields:[a b c]} {Fields:[d e f]}]
// TSV: [{Fields:[x y z]}]`,
      },
      {
        id: "visitor",
        title: "Visitor",
        summary: "Add new operations to a family of types without modifying their definitions",
        explanation:
          "Visitor lets you define a NEW operation over a fixed family of types (e.g. AST nodes: `NumberNode`, `AddNode`, `MulNode`) by writing a single new visitor type, instead of adding a new method to every existing type. Each element type implements `Accept(v Visitor)`, which calls the matching `Visit...(self)` method on the visitor — this 'double dispatch' routes to the right combination of (element type, operation) without a type-switch scattered across the codebase. In Go, a type switch in ONE function is often simpler than full double-dispatch Visitor unless the element family is large or defined across packages.",
        keyPoints: [
          "Each element type (`NumberNode`, `AddNode`) implements `Accept(v Visitor)`, which calls `v.VisitNumber(self)` / `v.VisitAdd(self)` — this is 'double dispatch': the call resolves based on BOTH the element's type AND the visitor's type",
          "New OPERATIONS (e.g. `Evaluator`, `Printer`, `Optimizer`) are added by writing a new visitor type that implements `VisitX` for every element type — existing element types are untouched",
          "The TRADE-OFF is the opposite of a type switch: Visitor makes adding OPERATIONS easy but adding ELEMENT TYPES hard (every visitor needs a new method); a type switch makes adding element types easy but means every operation's switch needs a new case",
          "In Go, prefer a plain type switch (`switch n := node.(type) { case *NumberNode: ... }`) for SMALL, STABLE element families within one package — reach for full Visitor when the family is large, externally extensible, or operations are added far more often than element types",
        ],
        gotchas: [
          "Forgetting to implement one `VisitX` method on a new visitor is a COMPILE ERROR (good) only if the Visitor interface lists all of them — if `Accept` instead does its own type-switch internally, a missing case fails silently at runtime",
          "Visitor adds a layer of indirection that can make simple operations (like 'just print this node') harder to read than a direct type switch — don't reach for it reflexively",
        ],
        code: `package main

import "fmt"

// ── Element family: a tiny arithmetic expression AST ──
type Node interface {
\tAccept(v Visitor) int
}

type NumberNode struct{ Value int }

func (n *NumberNode) Accept(v Visitor) int { return v.VisitNumber(n) }

type AddNode struct{ Left, Right Node }

func (n *AddNode) Accept(v Visitor) int { return v.VisitAdd(n) }

type MulNode struct{ Left, Right Node }

func (n *MulNode) Accept(v Visitor) int { return v.VisitMul(n) }

// Visitor declares one method per element type.
type Visitor interface {
\tVisitNumber(n *NumberNode) int
\tVisitAdd(n *AddNode) int
\tVisitMul(n *MulNode) int
}

// Evaluator is ONE new operation over the whole AST family.
type Evaluator struct{}

func (e Evaluator) VisitNumber(n *NumberNode) int { return n.Value }
func (e Evaluator) VisitAdd(n *AddNode) int       { return n.Left.Accept(e) + n.Right.Accept(e) }
func (e Evaluator) VisitMul(n *MulNode) int       { return n.Left.Accept(e) * n.Right.Accept(e) }

// Printer is ANOTHER operation — added without touching NumberNode/AddNode/MulNode.
type Printer struct{}

func (p Printer) VisitNumber(n *NumberNode) int {
\tfmt.Print(n.Value)
\treturn 0
}
func (p Printer) VisitAdd(n *AddNode) int {
\tfmt.Print("(")
\tn.Left.Accept(p)
\tfmt.Print(" + ")
\tn.Right.Accept(p)
\tfmt.Print(")")
\treturn 0
}
func (p Printer) VisitMul(n *MulNode) int {
\tfmt.Print("(")
\tn.Left.Accept(p)
\tfmt.Print(" * ")
\tn.Right.Accept(p)
\tfmt.Print(")")
\treturn 0
}

func main() {
\t// (2 + 3) * 4
\texpr := &MulNode{
\t\tLeft:  &AddNode{Left: &NumberNode{Value: 2}, Right: &NumberNode{Value: 3}},
\t\tRight: &NumberNode{Value: 4},
\t}

\texpr.Accept(Printer{})
\tfmt.Println(" =", expr.Accept(Evaluator{}))
}

// Output:
// ((2 + 3) * 4) = 20`,
      },
      {
        id: "interpreter",
        title: "Interpreter",
        summary: "Represent a simple grammar as an object tree and evaluate it by walking that tree",
        explanation:
          "Interpreter defines a small language's grammar as a tree of node types — each implementing an `Interpret()`/`Eval()` method — and 'running' a program means recursively evaluating its root node. It's the natural conclusion of Composite (the tree structure) plus the per-node behavior also seen in Visitor: each node type knows how to evaluate ITSELF given its children's evaluated results. This pattern underlies rule engines, configuration expression languages, and toy calculators — anything with a small, fixed grammar that's worth representing as data rather than parsing-and-switching ad hoc every time.",
        keyPoints: [
          "Every grammar production becomes a `Node` type implementing `Eval(ctx) Result` — terminals (numbers, variable references) are leaves, operators are composites holding child nodes",
          "A separate PARSER turns text into this tree once; the tree can then be evaluated repeatedly (e.g. with different variable bindings) without re-parsing — separates 'understand the syntax' from 'run it'",
          "An `Eval(ctx)` parameter (e.g. `map[string]int` variable bindings) lets the SAME tree be evaluated against DIFFERENT inputs — this is what makes a parsed expression reusable",
          "For anything beyond a tiny grammar (more than a handful of operators/constructs), reach for a real parser generator or an existing expression-evaluation library — hand-rolled Interpreter trees get unwieldy fast",
        ],
        gotchas: [
          "Interpreter trees are easy to build but easy to make UNSAFE if 'the language' can express loops or recursion without bounds — a hand-rolled interpreter for a Turing-complete mini-language needs explicit step/time limits",
          "Don't conflate this with Go's own `interpreter`/`reflect`-based dynamic dispatch — this pattern is about YOUR domain-specific mini-language, evaluated by YOUR tree-walking code, with no relation to Go's runtime",
        ],
        code: `package main

import "fmt"

// Context provides variable bindings during evaluation.
type Context struct {
\tVars map[string]int
}

// Expr is implemented by every node in the expression tree.
type Expr interface {
\tEval(ctx *Context) int
}

// NumberExpr is a literal — a leaf node.
type NumberExpr struct{ Value int }

func (e NumberExpr) Eval(ctx *Context) int { return e.Value }

// VariableExpr looks up a name in the context — also a leaf node.
type VariableExpr struct{ Name string }

func (e VariableExpr) Eval(ctx *Context) int { return ctx.Vars[e.Name] }

// AddExpr and MulExpr are composite nodes — they evaluate their children
// and combine the results.
type AddExpr struct{ Left, Right Expr }

func (e AddExpr) Eval(ctx *Context) int { return e.Left.Eval(ctx) + e.Right.Eval(ctx) }

type MulExpr struct{ Left, Right Expr }

func (e MulExpr) Eval(ctx *Context) int { return e.Left.Eval(ctx) * e.Right.Eval(ctx) }

func main() {
\t// Represents the expression: (price * quantity) + shipping
\texpr := AddExpr{
\t\tLeft:  MulExpr{Left: VariableExpr{Name: "price"}, Right: VariableExpr{Name: "quantity"}},
\t\tRight: VariableExpr{Name: "shipping"},
\t}

\t// Same tree, evaluated against two different contexts — no re-parsing.
\torder1 := &Context{Vars: map[string]int{"price": 20, "quantity": 3, "shipping": 5}}
\torder2 := &Context{Vars: map[string]int{"price": 50, "quantity": 1, "shipping": 0}}

\tfmt.Println("order1 total:", expr.Eval(order1))
\tfmt.Println("order2 total:", expr.Eval(order2))
}

// Output:
// order1 total: 65
// order2 total: 50`,
      },
    ],
  },
];
