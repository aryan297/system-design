export const MC_CATEGORIES = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Core Patterns
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "core-patterns",
    icon: "⚙️",
    title: "Core Patterns",
    problems: [
      {
        id: "wallet-system",
        title: "Wallet Transfer System",
        difficulty: "Easy",
        description:
          "Design an in-memory wallet service that supports creating wallets and transferring money between them. Handle edge cases like missing wallets and insufficient funds.",
        requirements: [
          "Wallet struct with unique ID and balance",
          "AddWallet to register a new wallet",
          "SendMoney(to, from, amount) transfers money atomically",
          "Return descriptive errors for missing user or insufficient balance",
        ],
        concepts: ["Structs", "Pointer receivers", "Error handling", "Slice iteration"],
        approach:
          "Store wallets in a slice. SendMoney iterates to find both wallets by ID, then mutates their balances via pointers. Using range with index (for i := range) gives addressable pointers — ranging over value copies would not work.",
        code: `package main

import (
\t"errors"
\t"fmt"
)

type Wallet struct {
\tId      int
\tBalance float64
}

type WalletService struct {
\twallets []Wallet
}

func (w *WalletService) AddWallet(wallet Wallet) {
\tw.wallets = append(w.wallets, wallet)
}

func (w *WalletService) SendMoney(to int, from int, amount float64) error {
\tvar sender *Wallet
\tvar receiver *Wallet

\tfor i := range w.wallets {
\t\tif w.wallets[i].Id == from {
\t\t\tsender = &w.wallets[i]
\t\t}
\t\tif w.wallets[i].Id == to {
\t\t\treceiver = &w.wallets[i]
\t\t}
\t}

\tif sender == nil || receiver == nil {
\t\treturn errors.New("user not found")
\t}
\tif sender.Balance < amount {
\t\treturn errors.New("insufficient balance")
\t}

\tsender.Balance -= amount
\treceiver.Balance += amount
\treturn nil
}

func main() {
\tservice := &WalletService{}
\tservice.AddWallet(Wallet{1, 2000})
\tservice.AddWallet(Wallet{2, 500})

\tif err := service.SendMoney(2, 1, 300); err != nil {
\t\tfmt.Println("error:", err)
\t\treturn
\t}
\tfmt.Println(service.wallets)
\t// [{1 1700} {2 800}]

\tif err := service.SendMoney(1, 2, 10000); err != nil {
\t\tfmt.Println("error:", err) // insufficient balance
\t}
}`,
      },
      {
        id: "lru-cache",
        title: "LRU Cache",
        difficulty: "Medium",
        description:
          "Implement a Least Recently Used cache with O(1) Get and Put. On capacity overflow, evict the least recently used entry.",
        requirements: [
          "NewLRUCache(capacity int) constructor",
          "Get(key int) int — returns -1 if not found",
          "Put(key, value int) — evicts LRU on overflow",
          "Both operations must be O(1)",
        ],
        concepts: ["Doubly linked list", "Hash map", "Sentinel nodes", "Pointer manipulation"],
        approach:
          "Combine a hash map (key → node pointer) with a doubly linked list. The list maintains access order: most-recent at head, LRU at tail. On Get/Put, move the accessed node to the head. On overflow, remove the tail node. Two sentinel nodes (head/tail) eliminate edge-case nil checks.",
        code: `package main

import "fmt"

type node struct {
\tkey, val   int
\tprev, next *node
}

type LRUCache struct {
\tcap        int
\tcache      map[int]*node
\thead, tail *node // sentinels
}

func NewLRUCache(cap int) *LRUCache {
\th, t := &node{}, &node{}
\th.next = t
\tt.prev = h
\treturn &LRUCache{cap: cap, cache: make(map[int]*node), head: h, tail: t}
}

func (c *LRUCache) remove(n *node) {
\tn.prev.next = n.next
\tn.next.prev = n.prev
}

func (c *LRUCache) insertFront(n *node) {
\tn.next = c.head.next
\tn.prev = c.head
\tc.head.next.prev = n
\tc.head.next = n
}

func (c *LRUCache) Get(key int) int {
\tif n, ok := c.cache[key]; ok {
\t\tc.remove(n)
\t\tc.insertFront(n)
\t\treturn n.val
\t}
\treturn -1
}

func (c *LRUCache) Put(key, val int) {
\tif n, ok := c.cache[key]; ok {
\t\tn.val = val
\t\tc.remove(n)
\t\tc.insertFront(n)
\t\treturn
\t}
\tn := &node{key: key, val: val}
\tc.cache[key] = n
\tc.insertFront(n)
\tif len(c.cache) > c.cap {
\t\tlru := c.tail.prev
\t\tc.remove(lru)
\t\tdelete(c.cache, lru.key)
\t}
}

func main() {
\tlru := NewLRUCache(2)
\tlru.Put(1, 10)
\tlru.Put(2, 20)
\tfmt.Println(lru.Get(1)) // 10  — 1 is now most-recent
\tlru.Put(3, 30)          // evicts key 2 (LRU)
\tfmt.Println(lru.Get(2)) // -1  — evicted
\tfmt.Println(lru.Get(3)) // 30
}`,
      },
      {
        id: "rate-limiter",
        title: "Rate Limiter (Token Bucket)",
        difficulty: "Medium",
        description:
          "Build a per-user rate limiter using the token bucket algorithm. Each user has a bucket that refills at a fixed rate. Requests are allowed only if a token is available.",
        requirements: [
          "Allow(userID string) bool — consumes one token, returns false if bucket empty",
          "Each user bucket: capacity N, refills R tokens/sec",
          "Lazy refill on each Allow call (no background goroutine needed)",
          "Thread-safe with sync.Mutex",
        ],
        concepts: ["Token bucket algorithm", "sync.Mutex", "time.Since", "Map of structs"],
        approach:
          "Store a bucket per user in a map. On each Allow call: compute elapsed seconds since last refill, add elapsed*rate tokens (capped at capacity), then consume one token if available. Lazy refill avoids a background goroutine entirely.",
        code: `package main

import (
\t"fmt"
\t"sync"
\t"time"
)

type bucket struct {
\ttokens     float64
\tcapacity   float64
\trefillRate float64 // tokens per second
\tlastRefill time.Time
}

type RateLimiter struct {
\tmu      sync.Mutex
\tbuckets map[string]*bucket
\tcap     float64
\trate    float64
}

func NewRateLimiter(capacity, ratePerSec float64) *RateLimiter {
\treturn &RateLimiter{
\t\tbuckets: make(map[string]*bucket),
\t\tcap:     capacity,
\t\trate:    ratePerSec,
\t}
}

func (rl *RateLimiter) Allow(userID string) bool {
\trl.mu.Lock()
\tdefer rl.mu.Unlock()

\tb, ok := rl.buckets[userID]
\tif !ok {
\t\tb = &bucket{tokens: rl.cap, capacity: rl.cap, refillRate: rl.rate, lastRefill: time.Now()}
\t\trl.buckets[userID] = b
\t}

\t// lazy refill
\telapsed := time.Since(b.lastRefill).Seconds()
\tb.tokens += elapsed * b.refillRate
\tif b.tokens > b.capacity {
\t\tb.tokens = b.capacity
\t}
\tb.lastRefill = time.Now()

\tif b.tokens < 1 {
\t\treturn false
\t}
\tb.tokens--
\treturn true
}

func main() {
\t// 3 tokens capacity, refills at 1 token/sec
\trl := NewRateLimiter(3, 1)

\tfor i := 0; i < 5; i++ {
\t\tfmt.Printf("request %d: allowed=%v\\n", i+1, rl.Allow("user-1"))
\t}
\t// requests 1-3 allowed, 4-5 denied

\ttime.Sleep(2 * time.Second)
\tfmt.Println("after 2s:", rl.Allow("user-1")) // allowed (2 tokens refilled)
}`,
      },
      {
        id: "pubsub",
        title: "Pub/Sub Event Bus",
        difficulty: "Medium",
        description:
          "Implement an in-memory publish/subscribe event bus where multiple subscribers can listen to a topic and receive published messages asynchronously via channels.",
        requirements: [
          "Subscribe(topic) returns a read-only channel",
          "Publish(topic, message) fans out to all subscribers of that topic",
          "Unsubscribe(topic, ch) removes a specific subscriber",
          "Thread-safe with sync.RWMutex",
        ],
        concepts: ["Channels", "sync.RWMutex", "Goroutines", "Fan-out pattern"],
        approach:
          "Map each topic to a slice of channels. Subscribe appends a new buffered channel. Publish iterates the slice and non-blocking sends (select with default) to each channel — prevents slow consumers from blocking the publisher.",
        code: `package main

import (
\t"fmt"
\t"sync"
)

type EventBus struct {
\tmu   sync.RWMutex
\tsubs map[string][]chan interface{}
}

func NewEventBus() *EventBus {
\treturn &EventBus{subs: make(map[string][]chan interface{})}
}

func (eb *EventBus) Subscribe(topic string) <-chan interface{} {
\teb.mu.Lock()
\tdefer eb.mu.Unlock()
\tch := make(chan interface{}, 10)
\teb.subs[topic] = append(eb.subs[topic], ch)
\treturn ch
}

func (eb *EventBus) Publish(topic string, msg interface{}) {
\teb.mu.RLock()
\tdefer eb.mu.RUnlock()
\tfor _, ch := range eb.subs[topic] {
\t\tselect {
\t\tcase ch <- msg:
\t\tdefault: // slow consumer — skip
\t\t}
\t}
}

func (eb *EventBus) Unsubscribe(topic string, unsub <-chan interface{}) {
\teb.mu.Lock()
\tdefer eb.mu.Unlock()
\tlist := eb.subs[topic]
\tfor i, ch := range list {
\t\tif ch == unsub {
\t\t\tclose(ch)
\t\t\teb.subs[topic] = append(list[:i], list[i+1:]...)
\t\t\treturn
\t\t}
\t}
}

func main() {
\tbus := NewEventBus()

\tch1 := bus.Subscribe("orders")
\tch2 := bus.Subscribe("orders")

\tvar wg sync.WaitGroup
\tfor _, ch := range []<-chan interface{}{ch1, ch2} {
\t\twg.Add(1)
\t\tgo func(c <-chan interface{}) {
\t\t\tdefer wg.Done()
\t\t\tfmt.Println("received:", <-c)
\t\t}(ch)
\t}

\tbus.Publish("orders", "order-123 placed")
\twg.Wait()
\t// both subscribers print: received: order-123 placed
}`,
      },
      {
        id: "kv-store-ttl",
        title: "In-Memory KV Store with TTL",
        difficulty: "Medium",
        description:
          "Build a key-value store that supports optional TTL (time-to-live) per key. Expired keys are invisible on Get and cleaned up by a background goroutine.",
        requirements: [
          "Set(key, value string, ttl time.Duration) — ttl=0 means no expiry",
          "Get(key string) returns value and bool (false if missing or expired)",
          "Delete(key string)",
          "Background goroutine evicts expired keys every second",
        ],
        concepts: ["time.Duration", "time.Now()", "sync.RWMutex", "Background goroutine", "Struct embedding"],
        approach:
          "Each entry stores the value plus an optional expiry timestamp. Get checks expiry inline. A ticker-based goroutine sweeps expired keys every second — this avoids unbounded growth from entries that are never read again.",
        code: `package main

import (
\t"fmt"
\t"sync"
\t"time"
)

type entry struct {
\tvalue     string
\texpiresAt time.Time
\thasTTL    bool
}

type KVStore struct {
\tmu   sync.RWMutex
\tdata map[string]entry
}

func NewKVStore() *KVStore {
\tk := &KVStore{data: make(map[string]entry)}
\tgo k.evictLoop()
\treturn k
}

func (k *KVStore) Set(key, value string, ttl time.Duration) {
\tk.mu.Lock()
\tdefer k.mu.Unlock()
\te := entry{value: value}
\tif ttl > 0 {
\t\te.expiresAt = time.Now().Add(ttl)
\t\te.hasTTL = true
\t}
\tk.data[key] = e
}

func (k *KVStore) Get(key string) (string, bool) {
\tk.mu.RLock()
\tdefer k.mu.RUnlock()
\te, ok := k.data[key]
\tif !ok {
\t\treturn "", false
\t}
\tif e.hasTTL && time.Now().After(e.expiresAt) {
\t\treturn "", false
\t}
\treturn e.value, true
}

func (k *KVStore) Delete(key string) {
\tk.mu.Lock()
\tdefer k.mu.Unlock()
\tdelete(k.data, key)
}

func (k *KVStore) evictLoop() {
\tticker := time.NewTicker(time.Second)
\tfor range ticker.C {
\t\tk.mu.Lock()
\t\tnow := time.Now()
\t\tfor key, e := range k.data {
\t\t\tif e.hasTTL && now.After(e.expiresAt) {
\t\t\t\tdelete(k.data, key)
\t\t\t}
\t\t}
\t\tk.mu.Unlock()
\t}
}

func main() {
\tstore := NewKVStore()
\tstore.Set("name", "Alice", 0)              // no expiry
\tstore.Set("session", "tok-xyz", 2*time.Second) // 2s TTL

\tv, ok := store.Get("session")
\tfmt.Println(v, ok) // tok-xyz true

\ttime.Sleep(3 * time.Second)

\tv, ok = store.Get("session")
\tfmt.Println(v, ok) // "" false — expired

\tv, ok = store.Get("name")
\tfmt.Println(v, ok) // Alice true — no TTL
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Financial Systems
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "financial-systems",
    icon: "💳",
    title: "Financial Systems",
    problems: [
      {
        id: "atm-machine",
        title: "ATM Machine (State Machine)",
        difficulty: "Medium",
        description:
          "Model an ATM as a finite state machine with states: NoCard → HasCard → Authorized. Enforce state transitions — you cannot withdraw without being authorized first.",
        requirements: [
          "InsertCard(accountID string) error",
          "EnterPIN(pin string) error",
          "Withdraw(amount float64) error",
          "Deposit(amount float64) error",
          "EjectCard() resets to NoCard state",
        ],
        concepts: ["State machine", "iota enum", "Method guards", "Error-driven flow"],
        approach:
          "Use an iota-based State type. Each method checks the current state before doing anything — e.g., Withdraw requires state == Authorized. This makes invalid transitions explicit errors rather than silent bugs.",
        code: `package main

import (
\t"errors"
\t"fmt"
)

type State int

const (
\tNoCard     State = iota
\tHasCard
\tAuthorized
)

type Account struct {
\tPIN     string
\tBalance float64
}

type ATM struct {
\tstate    State
\taccounts map[string]*Account
\tcurrent  *Account
}

func NewATM() *ATM {
\treturn &ATM{
\t\tstate: NoCard,
\t\taccounts: map[string]*Account{
\t\t\t"ACC001": {PIN: "1234", Balance: 5000},
\t\t\t"ACC002": {PIN: "9999", Balance: 1200},
\t\t},
\t}
}

func (a *ATM) InsertCard(accountID string) error {
\tif a.state != NoCard {
\t\treturn errors.New("card already inserted")
\t}
\tacc, ok := a.accounts[accountID]
\tif !ok {
\t\treturn errors.New("account not found")
\t}
\ta.current = acc
\ta.state = HasCard
\tfmt.Println("card accepted")
\treturn nil
}

func (a *ATM) EnterPIN(pin string) error {
\tif a.state != HasCard {
\t\treturn errors.New("insert card first")
\t}
\tif a.current.PIN != pin {
\t\treturn errors.New("wrong PIN")
\t}
\ta.state = Authorized
\tfmt.Println("authorized")
\treturn nil
}

func (a *ATM) Withdraw(amount float64) error {
\tif a.state != Authorized {
\t\treturn errors.New("not authorized")
\t}
\tif a.current.Balance < amount {
\t\treturn errors.New("insufficient funds")
\t}
\ta.current.Balance -= amount
\tfmt.Printf("dispensed %.2f, balance=%.2f\\n", amount, a.current.Balance)
\treturn nil
}

func (a *ATM) Deposit(amount float64) error {
\tif a.state != Authorized {
\t\treturn errors.New("not authorized")
\t}
\ta.current.Balance += amount
\tfmt.Printf("deposited %.2f, balance=%.2f\\n", amount, a.current.Balance)
\treturn nil
}

func (a *ATM) EjectCard() {
\ta.state = NoCard
\ta.current = nil
\tfmt.Println("card ejected")
}

func main() {
\tatm := NewATM()
\tatm.InsertCard("ACC001")
\tatm.EnterPIN("1234")
\tatm.Withdraw(200)
\tatm.Deposit(500)
\tatm.EjectCard()

\t// guard test
\tif err := atm.Withdraw(100); err != nil {
\t\tfmt.Println("error:", err) // not authorized
\t}
}`,
      },
      {
        id: "order-book",
        title: "Order Book (Stock Exchange)",
        difficulty: "Hard",
        description:
          "Implement a price-time priority order book. Buy orders match against the lowest-priced sell orders. When a buy price ≥ lowest sell price, a trade executes at the sell price.",
        requirements: [
          "Order struct: ID, side (buy/sell), price, quantity",
          "AddOrder(order) — matches immediately if possible, otherwise queues",
          "Match buy orders against sell orders by price-time priority",
          "Return list of executed trades",
        ],
        concepts: ["Heap / priority queue", "sort.Slice", "Greedy matching", "Struct slices"],
        approach:
          "Maintain buy orders sorted descending by price (best bid first) and sell orders sorted ascending (best ask first). After each add, run the matcher: while best bid ≥ best ask, execute a trade for min(bid.qty, ask.qty), reduce quantities, remove filled orders.",
        code: `package main

import (
\t"fmt"
\t"sort"
)

type Side bool

const (
\tBuy  Side = true
\tSell Side = false
)

type Order struct {
\tID    int
\tSide  Side
\tPrice float64
\tQty   int
}

type Trade struct {
\tBuyID, SellID int
\tPrice         float64
\tQty           int
}

type OrderBook struct {
\tbuys   []*Order
\tsells  []*Order
\tnextID int
\tTrades []Trade
}

func (ob *OrderBook) AddOrder(side Side, price float64, qty int) {
\tob.nextID++
\torder := &Order{ID: ob.nextID, Side: side, Price: price, Qty: qty}
\tif side == Buy {
\t\tob.buys = append(ob.buys, order)
\t} else {
\t\tob.sells = append(ob.sells, order)
\t}
\tob.match()
}

func (ob *OrderBook) match() {
\t// best bid: highest price first
\tsort.Slice(ob.buys, func(i, j int) bool { return ob.buys[i].Price > ob.buys[j].Price })
\t// best ask: lowest price first
\tsort.Slice(ob.sells, func(i, j int) bool { return ob.sells[i].Price < ob.sells[j].Price })

\tfor len(ob.buys) > 0 && len(ob.sells) > 0 {
\t\tbid := ob.buys[0]
\t\task := ob.sells[0]
\t\tif bid.Price < ask.Price {
\t\t\tbreak // no match
\t\t}
\t\tqty := bid.Qty
\t\tif ask.Qty < qty {
\t\t\tqty = ask.Qty
\t\t}
\t\tob.Trades = append(ob.Trades, Trade{bid.ID, ask.ID, ask.Price, qty})
\t\tbid.Qty -= qty
\t\task.Qty -= qty
\t\tif bid.Qty == 0 {
\t\t\tob.buys = ob.buys[1:]
\t\t}
\t\tif ask.Qty == 0 {
\t\t\tob.sells = ob.sells[1:]
\t\t}
\t}
}

func main() {
\tob := &OrderBook{}
\tob.AddOrder(Sell, 100, 10)
\tob.AddOrder(Sell, 99, 5)
\tob.AddOrder(Buy, 101, 8) // matches sell@99 (5) + sell@100 (3)

\tfor _, t := range ob.Trades {
\t\tfmt.Printf("trade: buy#%d × sell#%d @ %.0f qty=%d\\n", t.BuyID, t.SellID, t.Price, t.Qty)
\t}
\t// trade: buy#3 × sell#2 @ 99 qty=5
\t// trade: buy#3 × sell#1 @ 100 qty=3
}`,
      },
      {
        id: "split-expenses",
        title: "Split Expenses (Splitwise)",
        difficulty: "Medium",
        description:
          "Build a group expense splitter. Members add expenses paid by one person. The system calculates the minimum set of transactions to settle all debts.",
        requirements: [
          "AddMember(name string)",
          "AddExpense(paidBy string, amount float64, splitAmong []string)",
          "Balances() map[string]float64 — positive means owed to you",
          "Settle() []string — minimum transactions to zero all balances",
        ],
        concepts: ["Map arithmetic", "Greedy two-pointer settlement", "Floating point", "Slice sorting"],
        approach:
          "Track net balance per person (positive = creditor, negative = debtor). To minimize transactions: sort creditors and debtors, greedily pair the largest creditor with the largest debtor, transfer the minimum of |creditor| and |debtor|, repeat.",
        code: `package main

import (
\t"fmt"
\t"math"
\t"sort"
)

type Expense struct {
\tPaidBy string
\tAmount float64
\tSplit  []string
}

type Group struct {
\tmembers  map[string]bool
\texpenses []Expense
}

func NewGroup() *Group {
\treturn &Group{members: make(map[string]bool)}
}

func (g *Group) AddMember(name string) {
\tg.members[name] = true
}

func (g *Group) AddExpense(paidBy string, amount float64, splitAmong []string) {
\tg.expenses = append(g.expenses, Expense{paidBy, amount, splitAmong})
}

func (g *Group) Balances() map[string]float64 {
\tbal := make(map[string]float64)
\tfor _, e := range g.expenses {
\t\tshare := e.Amount / float64(len(e.SplitAmong))
\t\tbal[e.PaidBy] += e.Amount
\t\tfor _, m := range e.SplitAmong {
\t\t\tbal[m] -= share
\t\t}
\t}
\treturn bal
}

func (g *Group) Settle() []string {
\tbal := g.Balances()

\ttype person struct {
\t\tname string
\t\tamt  float64
\t}
\tvar creditors, debtors []person
\tfor name, amt := range bal {
\t\tif amt > 0.001 {
\t\t\tcreditors = append(creditors, person{name, amt})
\t\t} else if amt < -0.001 {
\t\t\tdebtors = append(debtors, person{name, -amt})
\t\t}
\t}
\tsort.Slice(creditors, func(i, j int) bool { return creditors[i].amt > creditors[j].amt })
\tsort.Slice(debtors, func(i, j int) bool { return debtors[i].amt > debtors[j].amt })

\tvar txns []string
\ti, j := 0, 0
\tfor i < len(creditors) && j < len(debtors) {
\t\tamount := math.Min(creditors[i].amt, debtors[j].amt)
\t\ttxns = append(txns, fmt.Sprintf("%s pays %s ₹%.2f", debtors[j].name, creditors[i].name, amount))
\t\tcreditors[i].amt -= amount
\t\tdebtors[j].amt -= amount
\t\tif creditors[i].amt < 0.001 {
\t\t\ti++
\t\t}
\t\tif debtors[j].amt < 0.001 {
\t\t\tj++
\t\t}
\t}
\treturn txns
}

func main() {
\tg := NewGroup()
\tg.AddMember("Alice")
\tg.AddMember("Bob")
\tg.AddMember("Carol")

\tg.AddExpense("Alice", 300, []string{"Alice", "Bob", "Carol"}) // Alice paid ₹300
\tg.AddExpense("Bob", 150, []string{"Bob", "Carol"})            // Bob paid ₹150

\tfor name, bal := range g.Balances() {
\t\tfmt.Printf("%s: %.2f\\n", name, bal)
\t}
\tfmt.Println("--- settle ---")
\tfor _, t := range g.Settle() {
\t\tfmt.Println(t)
\t}
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Booking Systems
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "booking-systems",
    icon: "🎫",
    title: "Booking Systems",
    problems: [
      {
        id: "parking-lot",
        title: "Parking Lot",
        difficulty: "Medium",
        description:
          "Design a multi-level parking lot that parks vehicles in the nearest available spot matching the vehicle size. Issue tickets on entry and calculate fees on exit.",
        requirements: [
          "Spot types: Small, Medium, Large",
          "Park(plate, spotType) → Ticket or error",
          "Leave(plate) → fee (₹10/hour) or error",
          "Available(spotType) int — count of free spots",
        ],
        concepts: ["Struct composition", "time.Since", "Map lookup", "Enum with string type"],
        approach:
          "Each Spot has a type and occupied flag. ParkingLot keeps a map[plate]→Ticket for O(1) leave lookups. Park scans for the first free matching spot. Fee is calculated as ceil(hours) × rate.",
        code: `package main

import (
\t"errors"
\t"fmt"
\t"math"
\t"time"
)

type SpotType string

const (
\tSmall  SpotType = "small"
\tMedium SpotType = "medium"
\tLarge  SpotType = "large"
)

type Spot struct {
\tID       int
\tType     SpotType
\tOccupied bool
}

type Ticket struct {
\tSpotID    int
\tPlate     string
\tEntryTime time.Time
}

type ParkingLot struct {
\tspots   []*Spot
\ttickets map[string]*Ticket // plate → ticket
\trate    float64            // per hour
}

func NewParkingLot(small, medium, large int, rate float64) *ParkingLot {
\tpl := &ParkingLot{tickets: make(map[string]*Ticket), rate: rate}
\tid := 1
\tfor i := 0; i < small; i++ {
\t\tpl.spots = append(pl.spots, &Spot{ID: id, Type: Small})
\t\tid++
\t}
\tfor i := 0; i < medium; i++ {
\t\tpl.spots = append(pl.spots, &Spot{ID: id, Type: Medium})
\t\tid++
\t}
\tfor i := 0; i < large; i++ {
\t\tpl.spots = append(pl.spots, &Spot{ID: id, Type: Large})
\t\tid++
\t}
\treturn pl
}

func (pl *ParkingLot) Park(plate string, t SpotType) (*Ticket, error) {
\tif _, ok := pl.tickets[plate]; ok {
\t\treturn nil, errors.New("vehicle already parked")
\t}
\tfor _, s := range pl.spots {
\t\tif s.Type == t && !s.Occupied {
\t\t\ts.Occupied = true
\t\t\ttkt := &Ticket{SpotID: s.ID, Plate: plate, EntryTime: time.Now()}
\t\t\tpl.tickets[plate] = tkt
\t\t\treturn tkt, nil
\t\t}
\t}
\treturn nil, fmt.Errorf("no %s spot available", t)
}

func (pl *ParkingLot) Leave(plate string) (float64, error) {
\ttkt, ok := pl.tickets[plate]
\tif !ok {
\t\treturn 0, errors.New("vehicle not found")
\t}
\thours := math.Ceil(time.Since(tkt.EntryTime).Hours())
\tif hours < 1 {
\t\thours = 1
\t}
\tfee := hours * pl.rate
\t// free spot
\tfor _, s := range pl.spots {
\t\tif s.ID == tkt.SpotID {
\t\t\ts.Occupied = false
\t\t\tbreak
\t\t}
\t}
\tdelete(pl.tickets, plate)
\treturn fee, nil
}

func (pl *ParkingLot) Available(t SpotType) int {
\tcount := 0
\tfor _, s := range pl.spots {
\t\tif s.Type == t && !s.Occupied {
\t\t\tcount++
\t\t}
\t}
\treturn count
}

func main() {
\tlot := NewParkingLot(2, 2, 1, 10) // 10₹/hr

\ttkt, err := lot.Park("KA01AB1234", Small)
\tif err != nil {
\t\tfmt.Println("error:", err)
\t\treturn
\t}
\tfmt.Printf("parked at spot %d\\n", tkt.SpotID)
\tfmt.Println("small available:", lot.Available(Small)) // 1

\tfee, _ := lot.Leave("KA01AB1234")
\tfmt.Printf("fee: ₹%.2f\\n", fee) // ₹10.00 (min 1 hour)
}`,
      },
      {
        id: "hotel-booking",
        title: "Hotel Room Booking",
        difficulty: "Medium",
        description:
          "Build a hotel room booking system. Multiple bookings per room are allowed as long as their date ranges don't overlap. Support cancellation by booking ID.",
        requirements: [
          "Book(roomNum int, guest string, checkIn, checkOut time.Time) → bookingID or error",
          "Cancel(roomNum, bookingID int) error",
          "IsAvailable(roomNum int, checkIn, checkOut time.Time) bool",
          "ListBookings(roomNum int) — print all active bookings",
        ],
        concepts: ["Time overlap detection", "Slice filtering for cancellation", "Struct composition", "Sequential ID"],
        approach:
          "Overlap check: two ranges [a, b] and [c, d] overlap if a < d && c < b. Book scans all existing bookings for conflicts. Cancel filters the booking slice by ID. Both are O(N) over bookings per room.",
        code: `package main

import (
\t"errors"
\t"fmt"
\t"time"
)

type Booking struct {
\tID       int
\tGuest    string
\tCheckIn  time.Time
\tCheckOut time.Time
}

type Room struct {
\tNumber   int
\tType     string
\tBookings []Booking
}

type Hotel struct {
\trooms  map[int]*Room
\tnextID int
}

func NewHotel() *Hotel {
\th := &Hotel{rooms: make(map[int]*Room)}
\th.rooms[101] = &Room{Number: 101, Type: "Standard"}
\th.rooms[102] = &Room{Number: 102, Type: "Deluxe"}
\th.rooms[201] = &Room{Number: 201, Type: "Suite"}
\treturn h
}

func overlaps(a, b, c, d time.Time) bool {
\treturn a.Before(d) && c.Before(b)
}

func (h *Hotel) IsAvailable(roomNum int, checkIn, checkOut time.Time) bool {
\troom, ok := h.rooms[roomNum]
\tif !ok {
\t\treturn false
\t}
\tfor _, b := range room.Bookings {
\t\tif overlaps(checkIn, checkOut, b.CheckIn, b.CheckOut) {
\t\t\treturn false
\t\t}
\t}
\treturn true
}

func (h *Hotel) Book(roomNum int, guest string, checkIn, checkOut time.Time) (int, error) {
\troom, ok := h.rooms[roomNum]
\tif !ok {
\t\treturn 0, errors.New("room not found")
\t}
\tif !h.IsAvailable(roomNum, checkIn, checkOut) {
\t\treturn 0, errors.New("room not available for those dates")
\t}
\th.nextID++
\troom.Bookings = append(room.Bookings, Booking{h.nextID, guest, checkIn, checkOut})
\treturn h.nextID, nil
}

func (h *Hotel) Cancel(roomNum, bookingID int) error {
\troom, ok := h.rooms[roomNum]
\tif !ok {
\t\treturn errors.New("room not found")
\t}
\tfor i, b := range room.Bookings {
\t\tif b.ID == bookingID {
\t\t\troom.Bookings = append(room.Bookings[:i], room.Bookings[i+1:]...)
\t\t\treturn nil
\t\t}
\t}
\treturn errors.New("booking not found")
}

func (h *Hotel) ListBookings(roomNum int) {
\troom := h.rooms[roomNum]
\tfor _, b := range room.Bookings {
\t\tfmt.Printf("  #%d %s: %s → %s\\n", b.ID, b.Guest,
\t\t\tb.CheckIn.Format("Jan 2"), b.CheckOut.Format("Jan 2"))
\t}
}

func main() {
\th := NewHotel()
\td := func(s string) time.Time { t, _ := time.Parse("2006-01-02", s); return t }

\tid1, _ := h.Book(101, "Alice", d("2024-12-01"), d("2024-12-05"))
\t_, err := h.Book(101, "Bob", d("2024-12-03"), d("2024-12-07"))
\tfmt.Println("conflict:", err) // not available

\tid2, _ := h.Book(101, "Bob", d("2024-12-06"), d("2024-12-10"))
\tfmt.Println("booking IDs:", id1, id2)
\th.ListBookings(101)

\th.Cancel(101, id1)
\tfmt.Println("after cancel:")
\th.ListBookings(101)
}`,
      },
      {
        id: "movie-booking",
        title: "Movie Ticket Booking",
        difficulty: "Medium",
        description:
          "Implement a movie seat booking system. A theater has rows and columns of seats. Users can book or cancel specific seats for a show.",
        requirements: [
          "AddShow(movie string, rows, cols int) → showID",
          "Book(showID, row, col int, user string) error",
          "Cancel(showID, row, col int, user string) error",
          "AvailableSeats(showID int) → list of [row,col]",
        ],
        concepts: ["2D slice", "Bounds checking", "Map of structs", "String formatting"],
        approach:
          "Each Show has a 2D grid of Seat structs. Book validates bounds, checks Booked flag, and sets the user. Cancel checks ownership before releasing — a user can only cancel their own seat.",
        code: `package main

import (
\t"errors"
\t"fmt"
)

type Seat struct {
\tBooked bool
\tUser   string
}

type Show struct {
\tID    int
\tMovie string
\tSeats [][]Seat // [row][col]
}

type Theater struct {
\tshows  map[int]*Show
\tnextID int
}

func NewTheater() *Theater {
\treturn &Theater{shows: make(map[int]*Show)}
}

func (t *Theater) AddShow(movie string, rows, cols int) int {
\tt.nextID++
\tseats := make([][]Seat, rows)
\tfor i := range seats {
\t\tseats[i] = make([]Seat, cols)
\t}
\tt.shows[t.nextID] = &Show{ID: t.nextID, Movie: movie, Seats: seats}
\treturn t.nextID
}

func (t *Theater) seat(showID, row, col int) (*Seat, error) {
\ts, ok := t.shows[showID]
\tif !ok {
\t\treturn nil, errors.New("show not found")
\t}
\tif row < 0 || row >= len(s.Seats) || col < 0 || col >= len(s.Seats[0]) {
\t\treturn nil, errors.New("invalid seat position")
\t}
\treturn &s.Seats[row][col], nil
}

func (t *Theater) Book(showID, row, col int, user string) error {
\tseat, err := t.seat(showID, row, col)
\tif err != nil {
\t\treturn err
\t}
\tif seat.Booked {
\t\treturn fmt.Errorf("seat [%d,%d] already booked by %s", row, col, seat.User)
\t}
\tseat.Booked = true
\tseat.User = user
\treturn nil
}

func (t *Theater) Cancel(showID, row, col int, user string) error {
\tseat, err := t.seat(showID, row, col)
\tif err != nil {
\t\treturn err
\t}
\tif !seat.Booked || seat.User != user {
\t\treturn errors.New("cannot cancel: not your booking")
\t}
\tseat.Booked = false
\tseat.User = ""
\treturn nil
}

func (t *Theater) AvailableSeats(showID int) [][2]int {
\ts := t.shows[showID]
\tvar available [][2]int
\tfor r, row := range s.Seats {
\t\tfor c, seat := range row {
\t\t\tif !seat.Booked {
\t\t\t\tavailable = append(available, [2]int{r, c})
\t\t\t}
\t\t}
\t}
\treturn available
}

func main() {
\tth := NewTheater()
\tshow := th.AddShow("Inception", 3, 4) // 3 rows, 4 cols = 12 seats

\tth.Book(show, 0, 0, "Alice")
\tth.Book(show, 0, 1, "Bob")

\tif err := th.Book(show, 0, 0, "Carol"); err != nil {
\t\tfmt.Println("error:", err)
\t}

\tfmt.Println("available:", th.AvailableSeats(show)) // 10 seats
\tth.Cancel(show, 0, 1, "Bob")
\tfmt.Println("after cancel:", len(th.AvailableSeats(show)), "free") // 11
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Simulators
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "simulators",
    icon: "🤖",
    title: "Simulators",
    problems: [
      {
        id: "vending-machine",
        title: "Vending Machine (State Machine)",
        difficulty: "Medium",
        description:
          "Model a vending machine using a state machine: Idle → HasMoney → Dispensing → Idle. State guards enforce valid operation sequences.",
        requirements: [
          "InsertCoin(amount float64) error",
          "SelectItem(code string) error — deducts price, transitions to Dispensing",
          "Refund() float64 — returns inserted amount, resets to Idle",
          "Restock(code string, qty int, price float64)",
        ],
        concepts: ["State machine", "iota", "Map of items", "Float64 balance tracking"],
        approach:
          "Three states: Idle (no money), HasMoney (coins inserted), Dispensing (item selected, dispensing). Each method checks the current state first. SelectItem deducts the price and returns change if any. Refund always resets to Idle.",
        code: `package main

import (
\t"errors"
\t"fmt"
)

type vmState int

const (
\tIdle       vmState = iota
\tHasMoney
\tDispensing
)

type Item struct {
\tName  string
\tPrice float64
\tStock int
}

type VendingMachine struct {
\tstate   vmState
\tbalance float64
\titems   map[string]*Item
}

func NewVM() *VendingMachine {
\treturn &VendingMachine{
\t\tstate: Idle,
\t\titems: make(map[string]*Item),
\t}
}

func (vm *VendingMachine) Restock(code, name string, price float64, qty int) {
\tvm.items[code] = &Item{Name: name, Price: price, Stock: qty}
}

func (vm *VendingMachine) InsertCoin(amount float64) error {
\tif vm.state == Dispensing {
\t\treturn errors.New("please wait, dispensing")
\t}
\tvm.balance += amount
\tvm.state = HasMoney
\tfmt.Printf("balance: ₹%.2f\\n", vm.balance)
\treturn nil
}

func (vm *VendingMachine) SelectItem(code string) error {
\tif vm.state != HasMoney {
\t\treturn errors.New("insert coins first")
\t}
\titem, ok := vm.items[code]
\tif !ok {
\t\treturn errors.New("item not found")
\t}
\tif item.Stock == 0 {
\t\treturn errors.New("out of stock")
\t}
\tif vm.balance < item.Price {
\t\treturn fmt.Errorf("insufficient balance (need ₹%.2f, have ₹%.2f)", item.Price, vm.balance)
\t}
\tvm.state = Dispensing
\tchange := vm.balance - item.Price
\titem.Stock--
\tvm.balance = 0
\tvm.state = Idle
\tfmt.Printf("dispensing %s — change: ₹%.2f\\n", item.Name, change)
\treturn nil
}

func (vm *VendingMachine) Refund() float64 {
\tamount := vm.balance
\tvm.balance = 0
\tvm.state = Idle
\tfmt.Printf("refunded ₹%.2f\\n", amount)
\treturn amount
}

func main() {
\tvm := NewVM()
\tvm.Restock("A1", "Chips", 20, 5)
\tvm.Restock("B2", "Water", 15, 3)

\tvm.InsertCoin(10)
\tvm.InsertCoin(20)
\tvm.SelectItem("A1") // dispensing Chips — change: ₹10.00

\tif err := vm.SelectItem("A1"); err != nil {
\t\tfmt.Println("error:", err) // insert coins first
\t}

\tvm.InsertCoin(5)
\tvm.Refund() // refunded ₹5.00
}`,
      },
      {
        id: "elevator",
        title: "Elevator System",
        difficulty: "Hard",
        description:
          "Simulate a multi-elevator system. When a floor button is pressed, the system assigns the nearest idle (or same-direction) elevator. Step() moves each elevator one floor toward its next target.",
        requirements: [
          "RequestFloor(floor int) — assigns nearest elevator",
          "Step() — advances each elevator one floor",
          "AddDestination(elevatorID, floor int) — internal floor selection",
          "Status() — print position of all elevators",
        ],
        concepts: ["Sorted requests", "Direction enum", "Nearest neighbor heuristic", "Simulation loop"],
        approach:
          "Each elevator has a sorted list of target floors. Step moves one floor toward the next target. RequestFloor picks the elevator with minimum distance to the requested floor. SCAN/LOOK algorithm: elevator services floors in one direction before reversing.",
        code: `package main

import (
\t"fmt"
\t"math"
\t"sort"
)

type Direction int

const (
\tUp   Direction = 1
\tDown Direction = -1
\tIdle Direction = 0
)

type Elevator struct {
\tID       int
\tFloor    int
\tDir      Direction
\tTargets  []int // sorted
}

func (e *Elevator) AddTarget(floor int) {
\tfor _, t := range e.Targets {
\t\tif t == floor {
\t\t\treturn // already queued
\t\t}
\t}
\te.Targets = append(e.Targets, floor)
\tsort.Ints(e.Targets)
}

func (e *Elevator) Step() {
\tif len(e.Targets) == 0 {
\t\te.Dir = Idle
\t\treturn
\t}
\tnext := e.Targets[0]
\tif e.Floor < next {
\t\te.Floor++
\t\te.Dir = Up
\t} else if e.Floor > next {
\t\te.Floor--
\t\te.Dir = Down
\t}
\tif e.Floor == next {
\t\tfmt.Printf("  elevator %d arrived at floor %d\\n", e.ID, e.Floor)
\t\te.Targets = e.Targets[1:]
\t}
}

type ElevatorSystem struct {
\televators []*Elevator
}

func NewSystem(count int) *ElevatorSystem {
\tes := &ElevatorSystem{}
\tfor i := 1; i <= count; i++ {
\t\tes.elevators = append(es.elevators, &Elevator{ID: i, Floor: 0, Dir: Idle})
\t}
\treturn es
}

func (es *ElevatorSystem) RequestFloor(floor int) {
\tvar best *Elevator
\tbestDist := math.MaxInt32
\tfor _, e := range es.elevators {
\t\td := int(math.Abs(float64(e.Floor - floor)))
\t\tif d < bestDist {
\t\t\tbestDist = d
\t\t\tbest = e
\t\t}
\t}
\tbest.AddTarget(floor)
\tfmt.Printf("floor %d → assigned to elevator %d (currently at %d)\\n", floor, best.ID, best.Floor)
}

func (es *ElevatorSystem) Step() {
\tfor _, e := range es.elevators {
\t\te.Step()
\t}
}

func (es *ElevatorSystem) Status() {
\tfor _, e := range es.elevators {
\t\tfmt.Printf("elevator %d at floor %d, targets=%v\\n", e.ID, e.Floor, e.Targets)
\t}
}

func main() {
\tsys := NewSystem(2)
\tsys.RequestFloor(3)
\tsys.RequestFloor(5)
\tsys.RequestFloor(1)

\tfor i := 0; i < 6; i++ {
\t\tfmt.Printf("-- step %d --\\n", i+1)
\t\tsys.Step()
\t\tsys.Status()
\t}
}`,
      },
      {
        id: "task-scheduler",
        title: "Priority Task Scheduler",
        difficulty: "Medium",
        description:
          "Build a concurrent task scheduler using a worker pool and a priority queue. Higher-priority tasks execute before lower-priority ones.",
        requirements: [
          "Submit(name string, priority int, fn func()) — enqueues a task",
          "Start(workers int) — launches N goroutines",
          "Stop() — drains and shuts down",
          "Tasks with higher priority number run first",
        ],
        concepts: ["heap.Interface", "sync.WaitGroup", "Goroutines", "Channel-based worker pool"],
        approach:
          "Implement a min-heap (negate priority for max-heap behavior) that satisfies heap.Interface. Workers pull tasks from a buffered channel. Submit pushes to the heap under a mutex. A dispatcher goroutine transfers heap items into the worker channel.",
        code: `package main

import (
\t"container/heap"
\t"fmt"
\t"sync"
)

type Task struct {
\tName     string
\tPriority int
\tFn       func()
\tindex    int
}

type TaskHeap []*Task

func (h TaskHeap) Len() int           { return len(h) }
func (h TaskHeap) Less(i, j int) bool { return h[i].Priority > h[j].Priority } // max-heap
func (h TaskHeap) Swap(i, j int) {
\th[i], h[j] = h[j], h[i]
\th[i].index = i
\th[j].index = j
}
func (h *TaskHeap) Push(x interface{}) { *h = append(*h, x.(*Task)) }
func (h *TaskHeap) Pop() interface{} {
\told := *h
\tn := old[len(old)-1]
\t*h = old[:len(old)-1]
\treturn n
}

type Scheduler struct {
\tmu   sync.Mutex
\tpq   TaskHeap
\tjobs chan func()
\twg   sync.WaitGroup
\tdone chan struct{}
}

func NewScheduler() *Scheduler {
\treturn &Scheduler{jobs: make(chan func(), 50), done: make(chan struct{})}
}

func (s *Scheduler) Submit(name string, priority int, fn func()) {
\ts.mu.Lock()
\theap.Push(&s.pq, &Task{Name: name, Priority: priority, Fn: fn})
\ts.mu.Unlock()
}

func (s *Scheduler) Start(workers int) {
\tfor i := 0; i < workers; i++ {
\t\ts.wg.Add(1)
\t\tgo func() {
\t\t\tdefer s.wg.Done()
\t\t\tfor fn := range s.jobs {
\t\t\t\tfn()
\t\t\t}
\t\t}()
\t}
\tgo s.dispatch()
}

func (s *Scheduler) dispatch() {
\tfor {
\t\tselect {
\t\tcase <-s.done:
\t\t\tclose(s.jobs)
\t\t\treturn
\t\tdefault:
\t\t\ts.mu.Lock()
\t\t\tif s.pq.Len() > 0 {
\t\t\t\ttask := heap.Pop(&s.pq).(*Task)
\t\t\t\ts.mu.Unlock()
\t\t\t\ts.jobs <- task.Fn
\t\t\t} else {
\t\t\t\ts.mu.Unlock()
\t\t\t}
\t\t}
\t}
}

func (s *Scheduler) Stop() {
\tclose(s.done)
\ts.wg.Wait()
}

func main() {
\tsched := NewScheduler()
\tsched.Submit("low-priority", 1, func() { fmt.Println("task: low") })
\tsched.Submit("high-priority", 10, func() { fmt.Println("task: HIGH") })
\tsched.Submit("medium-priority", 5, func() { fmt.Println("task: medium") })

\tsched.Start(2)

\t// give dispatcher time to move tasks into the job channel
\ttime.Sleep(50 * time.Millisecond)
\tsched.Stop()
\t// Output order: HIGH → medium → low
}`,
      },
      {
        id: "tic-tac-toe",
        title: "Tic Tac Toe",
        difficulty: "Easy",
        description:
          "Implement a 2-player Tic Tac Toe game. Validate moves, detect wins (rows, columns, diagonals) and draws. The board can be any N×N size.",
        requirements: [
          "NewGame(size int) — N×N board",
          "Move(row, col int) (result string, err error)",
          "Result: 'X wins', 'O wins', 'draw', or 'continue'",
          "Reject out-of-bounds or already-filled cells",
        ],
        concepts: ["2D array", "Turn tracking", "Win condition checking", "Byte comparison"],
        approach:
          "Track whose turn it is with a current byte ('X'/'O'). After each move check the row, column, and both diagonals for a winning line. If all cells are filled and no winner, return 'draw'.",
        code: `package main

import (
\t"errors"
\t"fmt"
\t"strings"
)

type Game struct {
\tboard   [][]byte
\tsize    int
\tcurrent byte
\tmoves   int
}

func NewGame(size int) *Game {
\tboard := make([][]byte, size)
\tfor i := range board {
\t\tboard[i] = make([]byte, size)
\t}
\treturn &Game{board: board, size: size, current: 'X'}
}

func (g *Game) Move(row, col int) (string, error) {
\tif row < 0 || row >= g.size || col < 0 || col >= g.size {
\t\treturn "", errors.New("out of bounds")
\t}
\tif g.board[row][col] != 0 {
\t\treturn "", errors.New("cell already taken")
\t}
\tg.board[row][col] = g.current
\tg.moves++

\tif g.checkWin(row, col) {
\t\treturn fmt.Sprintf("%c wins", g.current), nil
\t}
\tif g.moves == g.size*g.size {
\t\treturn "draw", nil
\t}
\tif g.current == 'X' {
\t\tg.current = 'O'
\t} else {
\t\tg.current = 'X'
\t}
\treturn "continue", nil
}

func (g *Game) checkWin(r, c int) bool {
\tp := g.current
\tn := g.size
\t// row
\twin := true
\tfor j := 0; j < n; j++ {
\t\tif g.board[r][j] != p {
\t\t\twin = false
\t\t\tbreak
\t\t}
\t}
\tif win {
\t\treturn true
\t}
\t// col
\twin = true
\tfor i := 0; i < n; i++ {
\t\tif g.board[i][c] != p {
\t\t\twin = false
\t\t\tbreak
\t\t}
\t}
\tif win {
\t\treturn true
\t}
\t// main diagonal
\tif r == c {
\t\twin = true
\t\tfor i := 0; i < n; i++ {
\t\t\tif g.board[i][i] != p {
\t\t\t\twin = false
\t\t\t\tbreak
\t\t\t}
\t\t}
\t\tif win {
\t\t\treturn true
\t\t}
\t}
\t// anti-diagonal
\tif r+c == n-1 {
\t\twin = true
\t\tfor i := 0; i < n; i++ {
\t\t\tif g.board[i][n-1-i] != p {
\t\t\t\twin = false
\t\t\t\tbreak
\t\t\t}
\t\t}
\t\tif win {
\t\t\treturn true
\t\t}
\t}
\treturn false
}

func (g *Game) Print() {
\tfor _, row := range g.board {
\t\tcells := make([]string, len(row))
\t\tfor i, c := range row {
\t\t\tif c == 0 {
\t\t\t\tcells[i] = "."
\t\t\t} else {
\t\t\t\tcells[i] = string(c)
\t\t\t}
\t\t}
\t\tfmt.Println(strings.Join(cells, " "))
\t}
}

func main() {
\tg := NewGame(3)
\tmoves := [][2]int{{0, 0}, {1, 0}, {0, 1}, {1, 1}, {0, 2}}
\tfor _, m := range moves {
\t\tresult, err := g.Move(m[0], m[1])
\t\tif err != nil {
\t\t\tfmt.Println("error:", err)
\t\t\tcontinue
\t\t}
\t\tfmt.Printf("move [%d,%d]: %s\\n", m[0], m[1], result)
\t}
\tg.Print()
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Data Services
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "data-services",
    icon: "🗄️",
    title: "Data Services",
    problems: [
      {
        id: "url-shortener",
        title: "URL Shortener (in-memory)",
        difficulty: "Easy",
        description:
          "Design an in-memory URL shortener. Long URLs map to a short code. Track click counts per short URL. Prevent duplicate shortening of the same URL.",
        requirements: [
          "Shorten(longURL string) string — returns short code",
          "Resolve(shortCode string) (string, error)",
          "Click(shortCode string) — increments counter",
          "Stats(shortCode string) int — returns click count",
        ],
        concepts: ["Base62 encoding", "Reverse map", "sync.RWMutex", "Atomic counter"],
        approach:
          "Maintain two maps: short→long and long→short. short→long uses a reverse map to avoid creating duplicate shorts for the same URL. Short codes are generated by base62-encoding an auto-incrementing counter.",
        code: `package main

import (
\t"errors"
\t"fmt"
\t"sync"
)

const base62Chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

func toBase62(n int) string {
\tif n == 0 {
\t\treturn "0"
\t}
\tres := []byte{}
\tfor n > 0 {
\t\tres = append([]byte{base62Chars[n%62]}, res...)
\t\tn /= 62
\t}
\treturn string(res)
}

type URLShortener struct {
\tmu      sync.RWMutex
\tstore   map[string]string // short → long
\treverse map[string]string // long → short
\tclicks  map[string]int
\tcounter int
}

func NewShortener() *URLShortener {
\treturn &URLShortener{
\t\tstore:   make(map[string]string),
\t\treverse: make(map[string]string),
\t\tclicks:  make(map[string]int),
\t}
}

func (us *URLShortener) Shorten(long string) string {
\tus.mu.Lock()
\tdefer us.mu.Unlock()
\tif short, ok := us.reverse[long]; ok {
\t\treturn short // idempotent
\t}
\tus.counter++
\tshort := toBase62(us.counter)
\tus.store[short] = long
\tus.reverse[long] = short
\treturn short
}

func (us *URLShortener) Resolve(short string) (string, error) {
\tus.mu.RLock()
\tdefer us.mu.RUnlock()
\tlong, ok := us.store[short]
\tif !ok {
\t\treturn "", errors.New("short URL not found")
\t}
\treturn long, nil
}

func (us *URLShortener) Click(short string) {
\tus.mu.Lock()
\tdefer us.mu.Unlock()
\tus.clicks[short]++
}

func (us *URLShortener) Stats(short string) int {
\tus.mu.RLock()
\tdefer us.mu.RUnlock()
\treturn us.clicks[short]
}

func main() {
\ts := NewShortener()
\tcode := s.Shorten("https://www.example.com/very/long/url")
\tfmt.Println("short:", code) // 1

\t// idempotent
\tsame := s.Shorten("https://www.example.com/very/long/url")
\tfmt.Println("same code:", same == code) // true

\tlong, _ := s.Resolve(code)
\tfmt.Println("resolved:", long)

\ts.Click(code)
\ts.Click(code)
\tfmt.Println("clicks:", s.Stats(code)) // 2
}`,
      },
      {
        id: "library-management",
        title: "Library Management System",
        difficulty: "Easy",
        description:
          "Build a library system where members can borrow and return books. A book can only be borrowed by one member at a time. Track each member's borrowed books.",
        requirements: [
          "AddBook(isbn, title, author string)",
          "RegisterMember(id int, name string)",
          "Borrow(memberID int, isbn string) error",
          "Return(memberID int, isbn string) error",
          "MemberBooks(memberID int) []string",
        ],
        concepts: ["Struct maps", "Slice operations", "Business rule validation", "Pointer dereferencing"],
        approach:
          "Books and Members stored in maps for O(1) lookup. Borrow checks availability and member existence, marks the book unavailable, and appends the ISBN to the member's borrowed list. Return reverses both operations.",
        code: `package main

import (
\t"errors"
\t"fmt"
)

type Book struct {
\tISBN      string
\tTitle     string
\tAuthor    string
\tAvailable bool
}

type Member struct {
\tID       int
\tName     string
\tBorrowed []string // ISBNs
}

type Library struct {
\tbooks   map[string]*Book
\tmembers map[int]*Member
}

func NewLibrary() *Library {
\treturn &Library{
\t\tbooks:   make(map[string]*Book),
\t\tmembers: make(map[int]*Member),
\t}
}

func (l *Library) AddBook(isbn, title, author string) {
\tl.books[isbn] = &Book{ISBN: isbn, Title: title, Author: author, Available: true}
}

func (l *Library) RegisterMember(id int, name string) {
\tl.members[id] = &Member{ID: id, Name: name}
}

func (l *Library) Borrow(memberID int, isbn string) error {
\tmember, ok := l.members[memberID]
\tif !ok {
\t\treturn errors.New("member not found")
\t}
\tbook, ok := l.books[isbn]
\tif !ok {
\t\treturn errors.New("book not found")
\t}
\tif !book.Available {
\t\treturn fmt.Errorf("'%s' is currently borrowed", book.Title)
\t}
\tbook.Available = false
\tmember.Borrowed = append(member.Borrowed, isbn)
\tfmt.Printf("%s borrowed '%s'\\n", member.Name, book.Title)
\treturn nil
}

func (l *Library) Return(memberID int, isbn string) error {
\tmember, ok := l.members[memberID]
\tif !ok {
\t\treturn errors.New("member not found")
\t}
\tbook, ok := l.books[isbn]
\tif !ok {
\t\treturn errors.New("book not found")
\t}
\t// remove from member's list
\tfor i, b := range member.Borrowed {
\t\tif b == isbn {
\t\t\tmember.Borrowed = append(member.Borrowed[:i], member.Borrowed[i+1:]...)
\t\t\tbook.Available = true
\t\t\tfmt.Printf("%s returned '%s'\\n", member.Name, book.Title)
\t\t\treturn nil
\t\t}
\t}
\treturn fmt.Errorf("%s did not borrow this book", member.Name)
}

func (l *Library) MemberBooks(memberID int) []string {
\treturn l.members[memberID].Borrowed
}

func main() {
\tlib := NewLibrary()
\tlib.AddBook("978-0", "Clean Code", "Robert Martin")
\tlib.AddBook("978-1", "The Go Programming Language", "Donovan")
\tlib.RegisterMember(1, "Alice")
\tlib.RegisterMember(2, "Bob")

\tlib.Borrow(1, "978-0")
\tif err := lib.Borrow(2, "978-0"); err != nil {
\t\tfmt.Println("error:", err) // already borrowed
\t}
\tlib.Return(1, "978-0")
\tlib.Borrow(2, "978-0")
\tfmt.Println("Bob has:", lib.MemberBooks(2))
}`,
      },
      {
        id: "shopping-cart",
        title: "Shopping Cart",
        difficulty: "Easy",
        description:
          "Implement a shopping cart with item add/remove, quantity updates, discount application, and checkout that returns an itemized receipt.",
        requirements: [
          "AddItem(product, qty int) — accumulates quantity",
          "RemoveItem(productID string) error",
          "ApplyDiscount(percent float64)",
          "Total() float64 — after discount",
          "Checkout() Receipt with line items and total",
        ],
        concepts: ["Map as cart store", "Struct methods", "Float64 arithmetic", "Slice construction"],
        approach:
          "Store items in map[productID]→CartItem for O(1) add/remove. AddItem increments existing quantity. Discount is stored as a multiplier applied at Total() time. Checkout freezes the cart state into a Receipt.",
        code: `package main

import (
\t"fmt"
)

type Product struct {
\tID    string
\tName  string
\tPrice float64
}

type CartItem struct {
\tProduct  Product
\tQuantity int
}

type LineItem struct {
\tName     string
\tQty      int
\tUnitPrice float64
\tSubtotal  float64
}

type Receipt struct {
\tItems    []LineItem
\tDiscount float64
\tTotal    float64
}

type Cart struct {
\titems    map[string]*CartItem
\tdiscount float64 // e.g. 0.10 = 10%
}

func NewCart() *Cart {
\treturn &Cart{items: make(map[string]*CartItem)}
}

func (c *Cart) AddItem(p Product, qty int) {
\tif item, ok := c.items[p.ID]; ok {
\t\titem.Quantity += qty
\t} else {
\t\tc.items[p.ID] = &CartItem{Product: p, Quantity: qty}
\t}
}

func (c *Cart) RemoveItem(productID string) error {
\tif _, ok := c.items[productID]; !ok {
\t\treturn fmt.Errorf("item %s not in cart", productID)
\t}
\tdelete(c.items, productID)
\treturn nil
}

func (c *Cart) ApplyDiscount(pct float64) {
\tc.discount = pct / 100
}

func (c *Cart) Total() float64 {
\tvar total float64
\tfor _, item := range c.items {
\t\ttotal += item.Product.Price * float64(item.Quantity)
\t}
\treturn total * (1 - c.discount)
}

func (c *Cart) Checkout() Receipt {
\tvar lines []LineItem
\tvar subtotal float64
\tfor _, item := range c.items {
\t\ts := item.Product.Price * float64(item.Quantity)
\t\tsubtotal += s
\t\tlines = append(lines, LineItem{item.Product.Name, item.Quantity, item.Product.Price, s})
\t}
\treturn Receipt{
\t\tItems:    lines,
\t\tDiscount: c.discount * subtotal,
\t\tTotal:    c.Total(),
\t}
}

func main() {
\tcart := NewCart()
\tcart.AddItem(Product{"P1", "Laptop", 80000}, 1)
\tcart.AddItem(Product{"P2", "Mouse", 1500}, 2)
\tcart.AddItem(Product{"P1", "Laptop", 80000}, 1) // quantity becomes 2
\tcart.ApplyDiscount(10)                           // 10% off

\tr := cart.Checkout()
\tfor _, line := range r.Items {
\t\tfmt.Printf("%-10s ×%d @ ₹%.0f = ₹%.0f\\n", line.Name, line.Qty, line.UnitPrice, line.Subtotal)
\t}
\tfmt.Printf("discount: -₹%.2f\\ntotal: ₹%.2f\\n", r.Discount, r.Total)
}`,
      },
      {
        id: "notification-service",
        title: "Notification Service",
        difficulty: "Medium",
        description:
          "Build a multi-channel notification service. Different channels (Email, SMS, Push) implement a common interface. Users can have preferences for which channels to use.",
        requirements: [
          "NotificationHandler interface with Send(msg) error",
          "Register(channel, handler) — plug in handlers",
          "SetPreference(userID string, channels []Channel)",
          "Notify(userID, message string) — sends via user's preferred channels",
        ],
        concepts: ["Interface", "Map of interfaces", "Strategy pattern", "Multi-dispatch"],
        approach:
          "Define a NotificationHandler interface. Each channel (Email, SMS, Push) implements it. The service holds a registry of channel→handler and a user→channels preference map. Notify looks up user preferences then dispatches to each registered handler.",
        code: `package main

import (
\t"fmt"
\t"strings"
)

type Channel string

const (
\tEmail Channel = "email"
\tSMS   Channel = "sms"
\tPush  Channel = "push"
)

type NotificationHandler interface {
\tSend(to, message string) error
}

// ─── concrete handlers ───────────────────────────────────────────────────────

type EmailHandler struct{}

func (e *EmailHandler) Send(to, msg string) error {
\tfmt.Printf("[EMAIL → %s] %s\\n", to, msg)
\treturn nil
}

type SMSHandler struct{}

func (s *SMSHandler) Send(to, msg string) error {
\tfmt.Printf("[SMS → %s] %s\\n", to, msg[:min(60, len(msg))])
\treturn nil
}

type PushHandler struct{}

func (p *PushHandler) Send(to, msg string) error {
\tfmt.Printf("[PUSH → %s] %s\\n", to, msg)
\treturn nil
}

func min(a, b int) int {
\tif a < b {
\t\treturn a
\t}
\treturn b
}

// ─── service ─────────────────────────────────────────────────────────────────

type NotificationService struct {
\thandlers    map[Channel]NotificationHandler
\tpreferences map[string][]Channel // userID → channels
}

func NewNotificationService() *NotificationService {
\treturn &NotificationService{
\t\thandlers:    make(map[Channel]NotificationHandler),
\t\tpreferences: make(map[string][]Channel),
\t}
}

func (ns *NotificationService) Register(ch Channel, h NotificationHandler) {
\tns.handlers[ch] = h
}

func (ns *NotificationService) SetPreference(userID string, channels []Channel) {
\tns.preferences[userID] = channels
}

func (ns *NotificationService) Notify(userID, message string) {
\tchannels, ok := ns.preferences[userID]
\tif !ok {
\t\tchannels = []Channel{Email} // default
\t}
\tvar errs []string
\tfor _, ch := range channels {
\t\th, ok := ns.handlers[ch]
\t\tif !ok {
\t\t\terrs = append(errs, fmt.Sprintf("no handler for %s", ch))
\t\t\tcontinue
\t\t}
\t\tif err := h.Send(userID, message); err != nil {
\t\t\terrs = append(errs, err.Error())
\t\t}
\t}
\tif len(errs) > 0 {
\t\tfmt.Println("errors:", strings.Join(errs, "; "))
\t}
}

func main() {
\tns := NewNotificationService()
\tns.Register(Email, &EmailHandler{})
\tns.Register(SMS, &SMSHandler{})
\tns.Register(Push, &PushHandler{})

\tns.SetPreference("alice", []Channel{Email, Push})
\tns.SetPreference("bob", []Channel{SMS})

\tns.Notify("alice", "Your order has been shipped!")
\tns.Notify("bob", "OTP: 482910 — valid for 10 minutes")
\tns.Notify("carol", "Welcome to the platform") // uses default: email
}`,
      },
      {
        id: "social-feed",
        title: "Social Media Feed",
        difficulty: "Medium",
        description:
          "Build a simplified Twitter-like system. Users can post tweets, follow others, and fetch their timeline (most recent posts from followed users).",
        requirements: [
          "Follow(follower, followee string)",
          "Unfollow(follower, followee string)",
          "Post(userID, content string) — creates a tweet",
          "Timeline(userID string, limit int) — latest N tweets from followed users",
        ],
        concepts: ["Map of sets (follows)", "Slice merging and sorting", "sort.Slice", "Struct slices"],
        approach:
          "Store follows as map[user]→set(follows). Posts stored in a global slice with timestamp. Timeline collects all posts from followed users, sorts by timestamp descending, and returns the top N. A real system would use fanout-on-write.",
        code: `package main

import (
\t"fmt"
\t"sort"
\t"time"
)

type Tweet struct {
\tID        int
\tAuthorID  string
\tContent   string
\tCreatedAt time.Time
}

type SocialNetwork struct {
\tfollows map[string]map[string]bool // follower → set of followees
\ttweets  []*Tweet
\tnextID  int
}

func NewSocialNetwork() *SocialNetwork {
\treturn &SocialNetwork{follows: make(map[string]map[string]bool)}
}

func (sn *SocialNetwork) Follow(follower, followee string) {
\tif sn.follows[follower] == nil {
\t\tsn.follows[follower] = make(map[string]bool)
\t}
\tsn.follows[follower][followee] = true
}

func (sn *SocialNetwork) Unfollow(follower, followee string) {
\tdelete(sn.follows[follower], followee)
}

func (sn *SocialNetwork) Post(userID, content string) *Tweet {
\tsn.nextID++
\tt := &Tweet{ID: sn.nextID, AuthorID: userID, Content: content, CreatedAt: time.Now()}
\tsn.tweets = append(sn.tweets, t)
\treturn t
}

func (sn *SocialNetwork) Timeline(userID string, limit int) []*Tweet {
\tfollowing := sn.follows[userID]
\tvar feed []*Tweet
\tfor _, t := range sn.tweets {
\t\tif following[t.AuthorID] || t.AuthorID == userID {
\t\t\tfeed = append(feed, t)
\t\t}
\t}
\tsort.Slice(feed, func(i, j int) bool {
\t\treturn feed[i].CreatedAt.After(feed[j].CreatedAt)
\t})
\tif limit > 0 && len(feed) > limit {
\t\treturn feed[:limit]
\t}
\treturn feed
}

func main() {
\tsn := NewSocialNetwork()

\tsn.Follow("alice", "bob")
\tsn.Follow("alice", "carol")

\tsn.Post("bob", "Go is awesome!")
\ttime.Sleep(time.Millisecond)
\tsn.Post("carol", "Building systems in Go")
\ttime.Sleep(time.Millisecond)
\tsn.Post("alice", "My own tweet")
\ttime.Sleep(time.Millisecond)
\tsn.Post("dave", "You don't follow me")

\tfeed := sn.Timeline("alice", 5)
\tfor _, t := range feed {
\t\tfmt.Printf("[%s] %s\\n", t.AuthorID, t.Content)
\t}
\t// carol, alice, bob — dave excluded
}`,
      },
      {
        id: "worker-pool",
        title: "Concurrent Worker Pool",
        difficulty: "Medium",
        description:
          "Implement a fixed-size worker pool that processes submitted jobs concurrently. Support graceful shutdown — drain all queued jobs before stopping.",
        requirements: [
          "NewWorkerPool(workers int) — starts N goroutines",
          "Submit(job func()) — enqueues a job",
          "Shutdown() — stops accepting, waits for all jobs to finish",
          "Jobs must execute concurrently up to the pool size",
        ],
        concepts: ["Goroutines", "Buffered channels", "sync.WaitGroup", "Graceful shutdown"],
        approach:
          "A buffered job channel acts as the work queue. Each worker goroutine loops on the channel until it's closed. Submit sends to the channel. Shutdown closes the channel (no more submits) and WaitGroup.Wait() blocks until all workers drain and exit.",
        code: `package main

import (
\t"fmt"
\t"sync"
\t"time"
)

type WorkerPool struct {
\tjobs chan func()
\twg   sync.WaitGroup
}

func NewWorkerPool(workers, queueSize int) *WorkerPool {
\twp := &WorkerPool{jobs: make(chan func(), queueSize)}
\tfor i := 0; i < workers; i++ {
\t\twp.wg.Add(1)
\t\tgo func(id int) {
\t\t\tdefer wp.wg.Done()
\t\t\tfor job := range wp.jobs {
\t\t\t\tjob()
\t\t\t}
\t\t}(i + 1)
\t}
\treturn wp
}

func (wp *WorkerPool) Submit(job func()) {
\twp.jobs <- job
}

func (wp *WorkerPool) Shutdown() {
\tclose(wp.jobs)
\twp.wg.Wait()
}

func main() {
\tpool := NewWorkerPool(3, 10) // 3 workers, queue of 10

\tvar mu sync.Mutex
\tresults := []int{}

\tfor i := 1; i <= 8; i++ {
\t\tval := i
\t\tpool.Submit(func() {
\t\t\ttime.Sleep(10 * time.Millisecond) // simulate work
\t\t\tmu.Lock()
\t\t\tresults = append(results, val*val)
\t\t\tmu.Unlock()
\t\t})
\t}

\tpool.Shutdown()
\tfmt.Println("results:", results) // 8 squared numbers, order may vary
}`,
      },
      {
        id: "in-memory-fs",
        title: "In-Memory File System",
        difficulty: "Hard",
        description:
          "Build an in-memory hierarchical file system supporting directories and files. Implement standard shell-like operations with proper error handling.",
        requirements: [
          "Mkdir(path string) error — create directory (including parents)",
          "Touch(path, content string) error — create or overwrite file",
          "Read(path string) (string, error)",
          "Ls(path string) ([]string, error) — list directory contents",
          "Rm(path string) error — remove file or empty directory",
        ],
        concepts: ["Recursive tree traversal", "Path splitting", "strings.Split", "Pointer tree"],
        approach:
          "Each node is either a file or directory. Directories have a children map. navigate(path) walks the path segments to find a node. Mkdir creates intermediate directories on the way (mkdir -p behavior). Ls returns sorted child names.",
        code: `package main

import (
\t"errors"
\t"fmt"
\t"sort"
\t"strings"
)

type nodeType int

const (
\tfileNode nodeType = iota
\tdirNode
)

type fsNode struct {
\tname     string
\tkind     nodeType
\tcontent  string
\tchildren map[string]*fsNode
}

type FileSystem struct {
\troot *fsNode
}

func NewFS() *FileSystem {
\treturn &FileSystem{root: &fsNode{name: "/", kind: dirNode, children: make(map[string]*fsNode)}}
}

func (fs *FileSystem) navigate(parts []string, create bool) (*fsNode, error) {
\tcur := fs.root
\tfor _, part := range parts {
\t\tif part == "" {
\t\t\tcontinue
\t\t}
\t\tchild, ok := cur.children[part]
\t\tif !ok {
\t\t\tif !create {
\t\t\t\treturn nil, fmt.Errorf("'%s' not found", part)
\t\t\t}
\t\t\tchild = &fsNode{name: part, kind: dirNode, children: make(map[string]*fsNode)}
\t\t\tcur.children[part] = child
\t\t}
\t\tcur = child
\t}
\treturn cur, nil
}

func split(path string) ([]string, string) {
\tparts := strings.Split(strings.Trim(path, "/"), "/")
\tif len(parts) == 1 {
\t\treturn nil, parts[0]
\t}
\treturn parts[:len(parts)-1], parts[len(parts)-1]
}

func (fs *FileSystem) Mkdir(path string) error {
\tparts := strings.Split(strings.Trim(path, "/"), "/")
\t_, err := fs.navigate(parts, true)
\treturn err
}

func (fs *FileSystem) Touch(path, content string) error {
\tdir, name := split(path)
\tparent, err := fs.navigate(dir, true)
\tif err != nil {
\t\treturn err
\t}
\tparent.children[name] = &fsNode{name: name, kind: fileNode, content: content}
\treturn nil
}

func (fs *FileSystem) Read(path string) (string, error) {
\tparts := strings.Split(strings.Trim(path, "/"), "/")
\tnode, err := fs.navigate(parts, false)
\tif err != nil {
\t\treturn "", err
\t}
\tif node.kind != fileNode {
\t\treturn "", errors.New("is a directory")
\t}
\treturn node.content, nil
}

func (fs *FileSystem) Ls(path string) ([]string, error) {
\tparts := strings.Split(strings.Trim(path, "/"), "/")
\tnode, err := fs.navigate(parts, false)
\tif err != nil {
\t\treturn nil, err
\t}
\tif node.kind != dirNode {
\t\treturn nil, errors.New("not a directory")
\t}
\tvar names []string
\tfor name := range node.children {
\t\tnames = append(names, name)
\t}
\tsort.Strings(names)
\treturn names, nil
}

func (fs *FileSystem) Rm(path string) error {
\tdir, name := split(path)
\tparent, err := fs.navigate(dir, false)
\tif err != nil {
\t\treturn err
\t}
\tnode, ok := parent.children[name]
\tif !ok {
\t\treturn errors.New("not found")
\t}
\tif node.kind == dirNode && len(node.children) > 0 {
\t\treturn errors.New("directory not empty")
\t}
\tdelete(parent.children, name)
\treturn nil
}

func main() {
\tfs := NewFS()
\tfs.Mkdir("/home/alice/docs")
\tfs.Touch("/home/alice/docs/readme.txt", "Hello, world!")
\tfs.Touch("/home/alice/notes.txt", "Go is fun")

\tcontent, _ := fs.Read("/home/alice/docs/readme.txt")
\tfmt.Println(content) // Hello, world!

\tentries, _ := fs.Ls("/home/alice")
\tfmt.Println(entries) // [docs notes.txt]

\tfs.Rm("/home/alice/notes.txt")
\tentries, _ = fs.Ls("/home/alice")
\tfmt.Println(entries) // [docs]
}`,
      },
    ],
  },
];
