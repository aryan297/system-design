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

// Wallet holds a user's balance
type Wallet struct {
\tId      int
\tBalance float64
}

// WalletService manages all wallets in memory
type WalletService struct {
\twallets []Wallet
}

// AddWallet registers a new wallet
func (w *WalletService) AddWallet(wallet Wallet) {
\tw.wallets = append(w.wallets, wallet)
}

// SendMoney transfers amount from sender (from) to receiver (to)
func (w *WalletService) SendMoney(to int, from int, amount float64) error {
\tvar sender *Wallet
\tvar receiver *Wallet

\t// Use index-range to get addressable pointers
\t// range over value copies would not let us mutate balances
\tfor i := range w.wallets {
\t\tif w.wallets[i].Id == from {
\t\t\tsender = &w.wallets[i]
\t\t}
\t\tif w.wallets[i].Id == to {
\t\t\treceiver = &w.wallets[i]
\t\t}
\t}

\t// Both wallets must exist
\tif sender == nil || receiver == nil {
\t\treturn errors.New("user not found")
\t}

\t// Check sender has enough balance
\tif sender.Balance < amount {
\t\treturn errors.New("insufficient balance")
\t}

\t// Atomic transfer — debit sender, credit receiver
\tsender.Balance -= amount
\treceiver.Balance += amount
\treturn nil
}

func main() {
\tservice := &WalletService{}
\tservice.AddWallet(Wallet{1, 2000})
\tservice.AddWallet(Wallet{2, 500})

\t// Transfer ₹300 from wallet 1 → wallet 2
\tif err := service.SendMoney(2, 1, 300); err != nil {
\t\tfmt.Println("error:", err)
\t\treturn
\t}
\tfmt.Println(service.wallets)
\t// [{1 1700} {2 800}]

\t// Try sending more than available balance
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

// Node represents one cache entry
type Node struct {
\tKey   int
\tValue int

\tPrev *Node // Previous node in DLL
\tNext *Node // Next node in DLL
}

// LRU Cache Structure
type LRUCache struct {
\tCapicity int

\t// HashMap
\t// Example:
\t// 1 -> Node(1,1)
\t// 2 -> Node(2,2)
\tCache map[int]*Node

\t// Dummy head and tail
\tHead *Node
\tTail *Node
}

// Constructor
func NewLruCache(capicity int) LRUCache {

\t// Create dummy nodes
\thead := &Node{}
\ttail := &Node{}

\t// Connect head and tail
\thead.Next = tail
\ttail.Prev = head

\treturn LRUCache{
\t\tCapicity: capicity,
\t\tCache:    make(map[int]*Node),
\t\tHead:     head,
\t\tTail:     tail,
\t}
}

// Get value from cache
func (l *LRUCache) Get(key int) int {

\t// Check key exists
\tif node, ok := l.Cache[key]; ok {

\t\t// Move to front
\t\t// because it became recently used
\t\tl.addToFront(node)

\t\treturn node.Value
\t}

\t// Not found
\treturn -1
}

// Insert or Update
func (l *LRUCache) Put(key int, value int) {

\t// Existing key
\tif node, ok := l.Cache[key]; ok {

\t\t// Update value
\t\tnode.Value = value

\t\t// Move to front
\t\tl.addToFront(node)

\t\treturn
\t}

\t// Cache full
\tif len(l.Cache) == l.Capicity {

\t\t// Remove least recently used
\t\tl.removeTail()
\t}

\t// Create new node
\tnewNode := &Node{
\t\tKey:   key,
\t\tValue: value,
\t}

\t// Store in hashmap
\tl.Cache[key] = newNode

\t// Insert at front
\tl.addToFront(newNode)
}

// Remove node from DLL
func (l *LRUCache) removeNode(node *Node) {

\t// Example:
\t// 1 <-> 2 <-> 3
\t//
\t// Remove 2

\tnode.Prev.Next = node.Next
\tnode.Next.Prev = node.Prev

\t// Result:
\t// 1 <-> 3
}

// Move node to front
func (l *LRUCache) addToFront(node *Node) {

\t// Existing node
\tif node.Prev != nil || node.Next != nil {

\t\t// Remove from old position
\t\tl.removeNode(node)
\t}

\t// Insert after Head

\tnode.Prev = l.Head

\tnode.Next = l.Head.Next

\tl.Head.Next.Prev = node

\tl.Head.Next = node

\t/*
\t\tBefore:

\t\tHead <-> 1 <-> 2 <-> Tail

\t\tAdd 3

\t\tAfter:

\t\tHead <-> 3 <-> 1 <-> 2 <-> Tail
\t*/
}

// Remove least recently used node
func (l *LRUCache) removeTail() {

\t// Tail.Prev is LRU node

\ttail := l.Tail.Prev

\t/*
\t\tHead <-> 3 <-> 1 <-> 2 <-> Tail

\t\tLRU = 2
\t*/

\tl.removeNode(tail)

\tdelete(l.Cache, tail.Key)
}

func main() {

\tcacheData := NewLruCache(2)

\t// Head <-> Tail

\tcacheData.Put(1, 1)

\t// Head <-> 1 <-> Tail

\tcacheData.Put(2, 2)

\t// Head <-> 2 <-> 1 <-> Tail

\tcacheData.Put(3, 3)

\t/*
\t\tCapacity = 2

\t\tHead <-> 3 <-> 2 <-> 1 <-> Tail

\t\tRemove LRU = 1

\t\tHead <-> 3 <-> 2 <-> Tail
\t*/

\tfmt.Println(cacheData.Get(3))

\t// Move 3 to front
\t// Output: 3

\tfmt.Println(cacheData.Get(2))

\t// Move 2 to front
\t// Output: 2

\tfmt.Println(cacheData.Get(1))

\t// Not found
\t// Output: -1
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

// bucket holds per-user token state
type bucket struct {
\ttokens     float64   // current available tokens
\tcapacity   float64   // maximum tokens allowed
\trefillRate float64   // tokens added per second
\tlastRefill time.Time // time of last refill (used for lazy refill)
}

// RateLimiter manages one bucket per user
type RateLimiter struct {
\tmu      sync.Mutex
\tbuckets map[string]*bucket
\tcap     float64
\trate    float64
}

// NewRateLimiter creates a limiter with given capacity and refill rate
func NewRateLimiter(capacity, ratePerSec float64) *RateLimiter {
\treturn &RateLimiter{
\t\tbuckets: make(map[string]*bucket),
\t\tcap:     capacity,
\t\trate:    ratePerSec,
\t}
}

// Allow consumes one token for the user, returns false if bucket is empty
func (rl *RateLimiter) Allow(userID string) bool {
\trl.mu.Lock()
\tdefer rl.mu.Unlock()

\tb, ok := rl.buckets[userID]
\tif !ok {
\t\t// First request — create bucket at full capacity
\t\tb = &bucket{tokens: rl.cap, capacity: rl.cap, refillRate: rl.rate, lastRefill: time.Now()}
\t\trl.buckets[userID] = b
\t}

\t// Lazy refill — compute how many tokens to add since last call
\t// This avoids a background goroutine entirely
\telapsed := time.Since(b.lastRefill).Seconds()
\tb.tokens += elapsed * b.refillRate

\t// Cap tokens at bucket capacity
\tif b.tokens > b.capacity {
\t\tb.tokens = b.capacity
\t}
\tb.lastRefill = time.Now()

\t// Not enough tokens — reject request
\tif b.tokens < 1 {
\t\treturn false
\t}

\t// Consume one token and allow the request
\tb.tokens--
\treturn true
}

func main() {
\t// 3 tokens capacity, refills at 1 token/sec
\trl := NewRateLimiter(3, 1)

\t// Burst: first 3 allowed, 4 and 5 denied
\tfor i := 0; i < 5; i++ {
\t\tfmt.Printf("request %d: allowed=%v\\n", i+1, rl.Allow("user-1"))
\t}
\t// requests 1-3 allowed, 4-5 denied

\t// Wait 2 seconds → 2 tokens refilled
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

// EventBus routes published messages to all topic subscribers
type EventBus struct {
\tmu   sync.RWMutex
\tsubs map[string][]chan interface{} // topic → subscriber channels
}

// NewEventBus creates an empty event bus
func NewEventBus() *EventBus {
\treturn &EventBus{subs: make(map[string][]chan interface{})}
}

// Subscribe registers a new subscriber for a topic
// Returns a buffered read-only channel for receiving messages
func (eb *EventBus) Subscribe(topic string) <-chan interface{} {
\teb.mu.Lock()
\tdefer eb.mu.Unlock()

\t// Buffered channel prevents publisher blocking on slow subscriber
\tch := make(chan interface{}, 10)
\teb.subs[topic] = append(eb.subs[topic], ch)
\treturn ch
}

// Publish sends a message to all subscribers of the topic
func (eb *EventBus) Publish(topic string, msg interface{}) {
\teb.mu.RLock()
\tdefer eb.mu.RUnlock()

\tfor _, ch := range eb.subs[topic] {
\t\t// Non-blocking send — skip slow consumers instead of blocking the publisher
\t\tselect {
\t\tcase ch <- msg:
\t\tdefault: // slow consumer — drop message
\t\t}
\t}
}

// Unsubscribe removes a subscriber channel from the topic and closes it
func (eb *EventBus) Unsubscribe(topic string, unsub <-chan interface{}) {
\teb.mu.Lock()
\tdefer eb.mu.Unlock()

\tlist := eb.subs[topic]
\tfor i, ch := range list {
\t\tif ch == unsub {
\t\t\tclose(ch)
\t\t\t// Remove by replacing with last element and truncating
\t\t\teb.subs[topic] = append(list[:i], list[i+1:]...)
\t\t\treturn
\t\t}
\t}
}

func main() {
\tbus := NewEventBus()

\t// Two independent subscribers on the same topic
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

\t// Publish fans out to both ch1 and ch2
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

// entry holds a stored value with optional expiry
type entry struct {
\tvalue     string
\texpiresAt time.Time // expiry timestamp (zero value if no TTL)
\thasTTL    bool      // false means the key lives forever
}

// KVStore is a thread-safe in-memory key-value store with TTL support
type KVStore struct {
\tmu   sync.RWMutex
\tdata map[string]entry
}

// NewKVStore creates a store and starts the background eviction goroutine
func NewKVStore() *KVStore {
\tk := &KVStore{data: make(map[string]entry)}
\tgo k.evictLoop()
\treturn k
}

// Set stores a key with an optional TTL (ttl=0 means no expiry)
func (k *KVStore) Set(key, value string, ttl time.Duration) {
\tk.mu.Lock()
\tdefer k.mu.Unlock()

\te := entry{value: value}
\tif ttl > 0 {
\t\t// Record when this key should expire
\t\te.expiresAt = time.Now().Add(ttl)
\t\te.hasTTL = true
\t}
\tk.data[key] = e
}

// Get retrieves a value; returns ("", false) if missing or expired
func (k *KVStore) Get(key string) (string, bool) {
\tk.mu.RLock()
\tdefer k.mu.RUnlock()

\te, ok := k.data[key]
\tif !ok {
\t\treturn "", false
\t}

\t// Inline expiry check — expired keys are invisible even before eviction runs
\tif e.hasTTL && time.Now().After(e.expiresAt) {
\t\treturn "", false
\t}
\treturn e.value, true
}

// Delete removes a key immediately
func (k *KVStore) Delete(key string) {
\tk.mu.Lock()
\tdefer k.mu.Unlock()
\tdelete(k.data, key)
}

// evictLoop runs every second and removes expired entries
// Prevents unbounded memory growth from keys that are never read again
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

\t// "name" has no expiry — lives forever
\tstore.Set("name", "Alice", 0)

\t// "session" expires after 2 seconds
\tstore.Set("session", "tok-xyz", 2*time.Second)

\tv, ok := store.Get("session")
\tfmt.Println(v, ok) // tok-xyz true

\t// Wait for TTL to expire
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

// State represents ATM states in the FSM
type State int

const (
\tNoCard     State = iota // waiting for card
\tHasCard                 // card inserted, PIN not entered
\tAuthorized              // PIN verified, ready for transactions
)

type Account struct {
\tPIN     string
\tBalance float64
}

// ATM enforces operation order via state machine
// NoCard → HasCard → Authorized → (transaction) → Authorized / NoCard
type ATM struct {
\tstate    State
\taccounts map[string]*Account
\tcurrent  *Account // currently active account
}

// NewATM creates an ATM with pre-loaded test accounts
func NewATM() *ATM {
\treturn &ATM{
\t\tstate: NoCard,
\t\taccounts: map[string]*Account{
\t\t\t"ACC001": {PIN: "1234", Balance: 5000},
\t\t\t"ACC002": {PIN: "9999", Balance: 1200},
\t\t},
\t}
}

// InsertCard accepts a card — transitions NoCard → HasCard
func (a *ATM) InsertCard(accountID string) error {
\t// Guard: cannot insert if card already in machine
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

// EnterPIN verifies PIN — transitions HasCard → Authorized
func (a *ATM) EnterPIN(pin string) error {
\t// Guard: must have card inserted first
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

// Withdraw dispenses cash — requires Authorized state
func (a *ATM) Withdraw(amount float64) error {
\t// Guard: must be authorized before withdrawing
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

// Deposit adds funds — requires Authorized state
func (a *ATM) Deposit(amount float64) error {
\t// Guard: must be authorized before depositing
\tif a.state != Authorized {
\t\treturn errors.New("not authorized")
\t}
\ta.current.Balance += amount
\tfmt.Printf("deposited %.2f, balance=%.2f\\n", amount, a.current.Balance)
\treturn nil
}

// EjectCard resets ATM to NoCard state — clears current account
func (a *ATM) EjectCard() {
\ta.state = NoCard
\ta.current = nil
\tfmt.Println("card ejected")
}

func main() {
\tatm := NewATM()

\t// Happy path: insert → PIN → withdraw → deposit → eject
\tatm.InsertCard("ACC001")
\tatm.EnterPIN("1234")
\tatm.Withdraw(200)
\tatm.Deposit(500)
\tatm.EjectCard()

\t// Guard test: withdrawing after eject returns to NoCard
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

// Side indicates whether an order is a buy or sell
type Side bool

const (
\tBuy  Side = true
\tSell Side = false
)

// Order represents a single buy or sell order
type Order struct {
\tID    int
\tSide  Side
\tPrice float64
\tQty   int // remaining unfilled quantity
}

// Trade records an executed match between a buy and sell order
type Trade struct {
\tBuyID, SellID int
\tPrice         float64
\tQty           int
}

// OrderBook maintains buy/sell queues and records all trades
type OrderBook struct {
\tbuys   []*Order // sorted: highest price first (best bid)
\tsells  []*Order // sorted: lowest price first (best ask)
\tnextID int
\tTrades []Trade
}

// AddOrder adds an order to the book and immediately attempts to match
func (ob *OrderBook) AddOrder(side Side, price float64, qty int) {
\tob.nextID++
\torder := &Order{ID: ob.nextID, Side: side, Price: price, Qty: qty}

\tif side == Buy {
\t\tob.buys = append(ob.buys, order)
\t} else {
\t\tob.sells = append(ob.sells, order)
\t}

\t// Try to match after every new order
\tob.match()
}

// match executes trades using price-time priority
func (ob *OrderBook) match() {
\t// Best bid = highest buy price (first after sort descending)
\tsort.Slice(ob.buys, func(i, j int) bool { return ob.buys[i].Price > ob.buys[j].Price })

\t// Best ask = lowest sell price (first after sort ascending)
\tsort.Slice(ob.sells, func(i, j int) bool { return ob.sells[i].Price < ob.sells[j].Price })

\t// Keep matching while best bid >= best ask
\tfor len(ob.buys) > 0 && len(ob.sells) > 0 {
\t\tbid := ob.buys[0]
\t\task := ob.sells[0]

\t\t// No match possible — bid is lower than lowest ask
\t\tif bid.Price < ask.Price {
\t\t\tbreak
\t\t}

\t\t// Trade executes at sell price, for min(bid.qty, ask.qty)
\t\tqty := bid.Qty
\t\tif ask.Qty < qty {
\t\t\tqty = ask.Qty
\t\t}
\t\tob.Trades = append(ob.Trades, Trade{bid.ID, ask.ID, ask.Price, qty})

\t\t// Reduce remaining quantities
\t\tbid.Qty -= qty
\t\task.Qty -= qty

\t\t// Remove fully filled orders from the book
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

\t// Sell orders: 10 @ 100, 5 @ 99
\tob.AddOrder(Sell, 100, 10)
\tob.AddOrder(Sell, 99, 5)

\t// Buy order: 8 @ 101 — willing to buy up to 101
\t// Matches: 5 @ 99 (cheapest sell first), then 3 @ 100
\tob.AddOrder(Buy, 101, 8)

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

// Expense records a payment made by one person split among others
type Expense struct {
\tPaidBy string
\tAmount float64
\tSplit  []string // members sharing this expense equally
}

// Group manages members and their shared expenses
type Group struct {
\tmembers  map[string]bool
\texpenses []Expense
}

// NewGroup creates an empty group
func NewGroup() *Group {
\treturn &Group{members: make(map[string]bool)}
}

// AddMember registers a member in the group
func (g *Group) AddMember(name string) {
\tg.members[name] = true
}

// AddExpense records a payment made by one person split equally among the list
func (g *Group) AddExpense(paidBy string, amount float64, splitAmong []string) {
\tg.expenses = append(g.expenses, Expense{paidBy, amount, splitAmong})
}

// Balances computes net balance per person
// Positive = owed money (creditor), Negative = owes money (debtor)
func (g *Group) Balances() map[string]float64 {
\tbal := make(map[string]float64)
\tfor _, e := range g.expenses {
\t\tshare := e.Amount / float64(len(e.SplitAmong))

\t\t// Payer gets credited the full amount
\t\tbal[e.PaidBy] += e.Amount

\t\t// Each person in the split is debited their share
\t\tfor _, m := range e.SplitAmong {
\t\t\tbal[m] -= share
\t\t}
\t}
\treturn bal
}

// Settle returns the minimum transactions needed to zero all balances
// Uses greedy two-pointer: pair largest creditor with largest debtor
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
\t\t\tdebtors = append(debtors, person{name, -amt}) // store as positive
\t\t}
\t}

\t// Sort both descending so largest amounts get matched first
\tsort.Slice(creditors, func(i, j int) bool { return creditors[i].amt > creditors[j].amt })
\tsort.Slice(debtors, func(i, j int) bool { return debtors[i].amt > debtors[j].amt })

\tvar txns []string
\ti, j := 0, 0

\t// Greedily settle: move min(creditor, debtor) amount per transaction
\tfor i < len(creditors) && j < len(debtors) {
\t\tamount := math.Min(creditors[i].amt, debtors[j].amt)
\t\ttxns = append(txns, fmt.Sprintf("%s pays %s ₹%.2f", debtors[j].name, creditors[i].name, amount))

\t\t// Reduce both sides by the settled amount
\t\tcreditors[i].amt -= amount
\t\tdebtors[j].amt -= amount

\t\t// Advance pointer when fully settled
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

\t// Alice paid ₹300 split 3 ways → each owes ₹100
\tg.AddExpense("Alice", 300, []string{"Alice", "Bob", "Carol"})

\t// Bob paid ₹150 split 2 ways → Carol owes Bob ₹75
\tg.AddExpense("Bob", 150, []string{"Bob", "Carol"})

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

// SpotType categorises parking spots by vehicle size
type SpotType string

const (
\tSmall  SpotType = "small"
\tMedium SpotType = "medium"
\tLarge  SpotType = "large"
)

// Spot represents one physical parking space
type Spot struct {
\tID       int
\tType     SpotType
\tOccupied bool
}

// Ticket is issued on entry and used for fee calculation on exit
type Ticket struct {
\tSpotID    int
\tPlate     string
\tEntryTime time.Time
}

// ParkingLot manages spots and active tickets
type ParkingLot struct {
\tspots   []*Spot
\ttickets map[string]*Ticket // plate → ticket for O(1) leave lookup
\trate    float64            // fee per hour
}

// NewParkingLot creates a lot with the given counts of each spot type
func NewParkingLot(small, medium, large int, rate float64) *ParkingLot {
\tpl := &ParkingLot{tickets: make(map[string]*Ticket), rate: rate}
\tid := 1

\t// Create small spots first, then medium, then large
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

// Park assigns the first available spot of the requested type
func (pl *ParkingLot) Park(plate string, t SpotType) (*Ticket, error) {
\t// Prevent duplicate parking of same vehicle
\tif _, ok := pl.tickets[plate]; ok {
\t\treturn nil, errors.New("vehicle already parked")
\t}

\t// Linear scan for first free spot of matching type
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

// Leave calculates the fee and frees the spot
func (pl *ParkingLot) Leave(plate string) (float64, error) {
\ttkt, ok := pl.tickets[plate]
\tif !ok {
\t\treturn 0, errors.New("vehicle not found")
\t}

\t// Minimum 1 hour; ceil to nearest hour for partial hours
\thours := math.Ceil(time.Since(tkt.EntryTime).Hours())
\tif hours < 1 {
\t\thours = 1
\t}
\tfee := hours * pl.rate

\t// Free up the spot
\tfor _, s := range pl.spots {
\t\tif s.ID == tkt.SpotID {
\t\t\ts.Occupied = false
\t\t\tbreak
\t\t}
\t}
\tdelete(pl.tickets, plate)
\treturn fee, nil
}

// Available returns count of free spots of the given type
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

\t// Leave immediately — charged minimum 1 hour
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

// Booking holds one reservation for a room
type Booking struct {
\tID       int
\tGuest    string
\tCheckIn  time.Time
\tCheckOut time.Time
}

// Room holds all bookings for one room number
type Room struct {
\tNumber   int
\tType     string
\tBookings []Booking
}

// Hotel manages rooms and auto-incrementing booking IDs
type Hotel struct {
\trooms  map[int]*Room
\tnextID int
}

// NewHotel creates a hotel with preset rooms
func NewHotel() *Hotel {
\th := &Hotel{rooms: make(map[int]*Room)}
\th.rooms[101] = &Room{Number: 101, Type: "Standard"}
\th.rooms[102] = &Room{Number: 102, Type: "Deluxe"}
\th.rooms[201] = &Room{Number: 201, Type: "Suite"}
\treturn h
}

// overlaps returns true if date ranges [a,b) and [c,d) intersect
// Two ranges overlap when: start1 < end2 AND start2 < end1
func overlaps(a, b, c, d time.Time) bool {
\treturn a.Before(d) && c.Before(b)
}

// IsAvailable checks if a room is free for the given date range
func (h *Hotel) IsAvailable(roomNum int, checkIn, checkOut time.Time) bool {
\troom, ok := h.rooms[roomNum]
\tif !ok {
\t\treturn false
\t}

\t// Room is unavailable if any existing booking overlaps
\tfor _, b := range room.Bookings {
\t\tif overlaps(checkIn, checkOut, b.CheckIn, b.CheckOut) {
\t\t\treturn false
\t\t}
\t}
\treturn true
}

// Book creates a reservation if the room is available for the dates
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

// Cancel removes a booking by ID from a room
func (h *Hotel) Cancel(roomNum, bookingID int) error {
\troom, ok := h.rooms[roomNum]
\tif !ok {
\t\treturn errors.New("room not found")
\t}

\t// Find and remove booking (slice deletion pattern)
\tfor i, b := range room.Bookings {
\t\tif b.ID == bookingID {
\t\t\troom.Bookings = append(room.Bookings[:i], room.Bookings[i+1:]...)
\t\t\treturn nil
\t\t}
\t}
\treturn errors.New("booking not found")
}

// ListBookings prints all reservations for a room
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

\t// Alice books Dec 1–5
\tid1, _ := h.Book(101, "Alice", d("2024-12-01"), d("2024-12-05"))

\t// Bob tries Dec 3–7 — overlaps with Alice's booking
\t_, err := h.Book(101, "Bob", d("2024-12-03"), d("2024-12-07"))
\tfmt.Println("conflict:", err) // not available

\t// Bob books Dec 6–10 — no overlap with Alice
\tid2, _ := h.Book(101, "Bob", d("2024-12-06"), d("2024-12-10"))
\tfmt.Println("booking IDs:", id1, id2)
\th.ListBookings(101)

\t// Alice cancels her booking
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

// Seat represents one seat in the theater grid
type Seat struct {
\tBooked bool
\tUser   string // username who booked this seat
}

// Show holds the movie name and its 2D seat grid
type Show struct {
\tID    int
\tMovie string
\tSeats [][]Seat // [row][col]
}

// Theater manages multiple shows
type Theater struct {
\tshows  map[int]*Show
\tnextID int
}

// NewTheater creates an empty theater
func NewTheater() *Theater {
\treturn &Theater{shows: make(map[int]*Show)}
}

// AddShow creates a new show with a rows×cols seat grid
func (t *Theater) AddShow(movie string, rows, cols int) int {
\tt.nextID++

\t// Build 2D grid: outer slice = rows, inner = columns
\tseats := make([][]Seat, rows)
\tfor i := range seats {
\t\tseats[i] = make([]Seat, cols)
\t}
\tt.shows[t.nextID] = &Show{ID: t.nextID, Movie: movie, Seats: seats}
\treturn t.nextID
}

// seat returns a pointer to the seat at [row][col] with bounds checking
func (t *Theater) seat(showID, row, col int) (*Seat, error) {
\ts, ok := t.shows[showID]
\tif !ok {
\t\treturn nil, errors.New("show not found")
\t}

\t// Validate row and column are within grid bounds
\tif row < 0 || row >= len(s.Seats) || col < 0 || col >= len(s.Seats[0]) {
\t\treturn nil, errors.New("invalid seat position")
\t}
\treturn &s.Seats[row][col], nil
}

// Book reserves a seat for a user
func (t *Theater) Book(showID, row, col int, user string) error {
\tseat, err := t.seat(showID, row, col)
\tif err != nil {
\t\treturn err
\t}

\t// Check seat is not already taken
\tif seat.Booked {
\t\treturn fmt.Errorf("seat [%d,%d] already booked by %s", row, col, seat.User)
\t}
\tseat.Booked = true
\tseat.User = user
\treturn nil
}

// Cancel releases a seat — only the booking user can cancel their own seat
func (t *Theater) Cancel(showID, row, col int, user string) error {
\tseat, err := t.seat(showID, row, col)
\tif err != nil {
\t\treturn err
\t}

\t// Ownership check: only the original booker can cancel
\tif !seat.Booked || seat.User != user {
\t\treturn errors.New("cannot cancel: not your booking")
\t}
\tseat.Booked = false
\tseat.User = ""
\treturn nil
}

// AvailableSeats returns all unbooked [row, col] positions
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
\tshow := th.AddShow("Inception", 3, 4) // 3 rows × 4 cols = 12 seats

\tth.Book(show, 0, 0, "Alice")
\tth.Book(show, 0, 1, "Bob")

\t// Attempt to double-book an already-taken seat
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

// vmState represents the current state of the vending machine
type vmState int

const (
\tIdle       vmState = iota // no money inserted
\tHasMoney                  // coins inserted, item not yet selected
\tDispensing                // item being dispensed
)

// Item holds the product details stored in a slot
type Item struct {
\tName  string
\tPrice float64
\tStock int
}

// VendingMachine is a finite state machine
// Transitions: Idle → HasMoney → Dispensing → Idle
type VendingMachine struct {
\tstate   vmState
\tbalance float64          // total coins inserted so far
\titems   map[string]*Item // slot code → item
}

// NewVM creates a vending machine starting in Idle state
func NewVM() *VendingMachine {
\treturn &VendingMachine{
\t\tstate: Idle,
\t\titems: make(map[string]*Item),
\t}
}

// Restock adds or replaces an item in a slot
func (vm *VendingMachine) Restock(code, name string, price float64, qty int) {
\tvm.items[code] = &Item{Name: name, Price: price, Stock: qty}
}

// InsertCoin adds money and moves to HasMoney state
func (vm *VendingMachine) InsertCoin(amount float64) error {
\t// Guard: cannot insert while item is being dispensed
\tif vm.state == Dispensing {
\t\treturn errors.New("please wait, dispensing")
\t}
\tvm.balance += amount
\tvm.state = HasMoney
\tfmt.Printf("balance: ₹%.2f\\n", vm.balance)
\treturn nil
}

// SelectItem picks an item to purchase — requires HasMoney state
func (vm *VendingMachine) SelectItem(code string) error {
\t// Guard: must have coins inserted first
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

\t// Transition: HasMoney → Dispensing → Idle
\tvm.state = Dispensing
\tchange := vm.balance - item.Price
\titem.Stock--
\tvm.balance = 0
\tvm.state = Idle // back to Idle after dispensing
\tfmt.Printf("dispensing %s — change: ₹%.2f\\n", item.Name, change)
\treturn nil
}

// Refund returns all inserted money and resets to Idle
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

\t// Insert ₹10 + ₹20 = ₹30, select Chips (₹20) → change ₹10
\tvm.InsertCoin(10)
\tvm.InsertCoin(20)
\tvm.SelectItem("A1") // dispensing Chips — change: ₹10.00

\t// Guard test: selecting without inserting money returns to Idle
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

// Direction represents elevator movement direction
type Direction int

const (
\tUp   Direction = 1
\tDown Direction = -1
\tIdle Direction = 0
)

// Elevator tracks one elevator's floor, direction, and pending targets
type Elevator struct {
\tID      int
\tFloor   int
\tDir     Direction
\tTargets []int // sorted list of floors to visit
}

// AddTarget queues a floor request — deduplicates and keeps list sorted
func (e *Elevator) AddTarget(floor int) {
\t// Skip if already in the target list
\tfor _, t := range e.Targets {
\t\tif t == floor {
\t\t\treturn // already queued
\t\t}
\t}
\te.Targets = append(e.Targets, floor)

\t// Keep targets sorted — elevator visits closest floor first
\tsort.Ints(e.Targets)
}

// Step moves the elevator one floor toward the next target
func (e *Elevator) Step() {
\tif len(e.Targets) == 0 {
\t\te.Dir = Idle
\t\treturn
\t}

\tnext := e.Targets[0]

\t// Move one floor in the direction of the next target
\tif e.Floor < next {
\t\te.Floor++
\t\te.Dir = Up
\t} else if e.Floor > next {
\t\te.Floor--
\t\te.Dir = Down
\t}

\t// Arrived at target floor — dequeue it
\tif e.Floor == next {
\t\tfmt.Printf("  elevator %d arrived at floor %d\\n", e.ID, e.Floor)
\t\te.Targets = e.Targets[1:]
\t}
}

// ElevatorSystem manages multiple elevators
type ElevatorSystem struct {
\televators []*Elevator
}

// NewSystem creates N elevators all starting at floor 0
func NewSystem(count int) *ElevatorSystem {
\tes := &ElevatorSystem{}
\tfor i := 1; i <= count; i++ {
\t\tes.elevators = append(es.elevators, &Elevator{ID: i, Floor: 0, Dir: Idle})
\t}
\treturn es
}

// RequestFloor assigns the floor request to the nearest elevator
func (es *ElevatorSystem) RequestFloor(floor int) {
\tvar best *Elevator
\tbestDist := math.MaxInt32

\t// Nearest-neighbor: pick elevator with minimum distance to requested floor
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

// Step advances all elevators one floor each
func (es *ElevatorSystem) Step() {
\tfor _, e := range es.elevators {
\t\te.Step()
\t}
}

// Status prints the current floor and pending targets of each elevator
func (es *ElevatorSystem) Status() {
\tfor _, e := range es.elevators {
\t\tfmt.Printf("elevator %d at floor %d, targets=%v\\n", e.ID, e.Floor, e.Targets)
\t}
}

func main() {
\tsys := NewSystem(2)

\t// Assign three floor requests — distributed to two elevators
\tsys.RequestFloor(3)
\tsys.RequestFloor(5)
\tsys.RequestFloor(1)

\t// Simulate 6 time steps to watch elevators move
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
\t"time"
)

// Task is a unit of work with a priority level
type Task struct {
\tName     string
\tPriority int    // higher number = runs first
\tFn       func()
\tindex    int    // position in the heap (maintained by heap.Interface)
}

// TaskHeap implements heap.Interface for a max-priority queue
// Less returns true when i has HIGHER priority than j (max-heap)
type TaskHeap []*Task

func (h TaskHeap) Len() int           { return len(h) }
func (h TaskHeap) Less(i, j int) bool { return h[i].Priority > h[j].Priority }
func (h TaskHeap) Swap(i, j int) {
\th[i], h[j] = h[j], h[i]
\th[i].index = i
\th[j].index = j
}

// Push adds a task to the end of the slice (heap package calls this)
func (h *TaskHeap) Push(x interface{}) { *h = append(*h, x.(*Task)) }

// Pop removes the last element — heap package swaps max to end before calling
func (h *TaskHeap) Pop() interface{} {
\told := *h
\tn := old[len(old)-1]
\t*h = old[:len(old)-1]
\treturn n
}

// Scheduler dispatches tasks in priority order to a worker pool
type Scheduler struct {
\tmu   sync.Mutex
\tpq   TaskHeap
\tjobs chan func()    // buffered channel consumed by workers
\twg   sync.WaitGroup
\tdone chan struct{}  // closed when Stop() is called
}

// NewScheduler creates a scheduler with a 50-slot job buffer
func NewScheduler() *Scheduler {
\treturn &Scheduler{jobs: make(chan func(), 50), done: make(chan struct{})}
}

// Submit adds a task to the priority queue under a mutex
func (s *Scheduler) Submit(name string, priority int, fn func()) {
\ts.mu.Lock()
\theap.Push(&s.pq, &Task{Name: name, Priority: priority, Fn: fn})
\ts.mu.Unlock()
}

// Start launches N worker goroutines and the dispatcher
func (s *Scheduler) Start(workers int) {
\t// Workers pull from the jobs channel until it is closed
\tfor i := 0; i < workers; i++ {
\t\ts.wg.Add(1)
\t\tgo func() {
\t\t\tdefer s.wg.Done()
\t\t\tfor fn := range s.jobs {
\t\t\t\tfn()
\t\t\t}
\t\t}()
\t}

\t// Dispatcher moves tasks from heap → jobs channel in priority order
\tgo s.dispatch()
}

// dispatch pops tasks from the heap and feeds them to workers
func (s *Scheduler) dispatch() {
\tfor {
\t\tselect {
\t\tcase <-s.done:
\t\t\t// Stop signal — close jobs so workers drain and exit
\t\t\tclose(s.jobs)
\t\t\treturn
\t\tdefault:
\t\t\ts.mu.Lock()
\t\t\tif s.pq.Len() > 0 {
\t\t\t\t// Pop highest-priority task and send to a worker
\t\t\t\ttask := heap.Pop(&s.pq).(*Task)
\t\t\t\ts.mu.Unlock()
\t\t\t\ts.jobs <- task.Fn
\t\t\t} else {
\t\t\t\ts.mu.Unlock()
\t\t\t}
\t\t}
\t}
}

// Stop signals shutdown and waits for all workers to finish
func (s *Scheduler) Stop() {
\tclose(s.done)
\ts.wg.Wait()
}

func main() {
\tsched := NewScheduler()

\t// Submit tasks with different priorities — higher number runs first
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

// Game tracks the board state and whose turn it is
type Game struct {
\tboard   [][]byte // NxN grid; 0 = empty, 'X' or 'O'
\tsize    int
\tcurrent byte // 'X' or 'O'
\tmoves   int  // total moves made (for draw detection)
}

// NewGame creates an NxN board with X going first
func NewGame(size int) *Game {
\tboard := make([][]byte, size)
\tfor i := range board {
\t\tboard[i] = make([]byte, size)
\t}
\treturn &Game{board: board, size: size, current: 'X'}
}

// Move places the current player's mark and returns the result
func (g *Game) Move(row, col int) (string, error) {
\t// Bounds check
\tif row < 0 || row >= g.size || col < 0 || col >= g.size {
\t\treturn "", errors.New("out of bounds")
\t}

\t// 0 is the zero byte — means empty cell
\tif g.board[row][col] != 0 {
\t\treturn "", errors.New("cell already taken")
\t}

\tg.board[row][col] = g.current
\tg.moves++

\t// Only check win for the row/col just played — O(N) not O(N²)
\tif g.checkWin(row, col) {
\t\treturn fmt.Sprintf("%c wins", g.current), nil
\t}

\t// All cells filled with no winner → draw
\tif g.moves == g.size*g.size {
\t\treturn "draw", nil
\t}

\t// Toggle turn: X → O → X
\tif g.current == 'X' {
\t\tg.current = 'O'
\t} else {
\t\tg.current = 'X'
\t}
\treturn "continue", nil
}

// checkWin checks if the last move at [r,c] completed a winning line
func (g *Game) checkWin(r, c int) bool {
\tp := g.current
\tn := g.size

\t// Check row r
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

\t// Check column c
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

\t// Main diagonal (top-left → bottom-right): only relevant if r == c
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

\t// Anti-diagonal (top-right → bottom-left): only relevant if r+c == n-1
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

// Print displays the board — '.' for empty cells
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

\t// X wins top row: (0,0) (0,1) (0,2); O plays (1,0) (1,1)
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

// base62Chars is the character set used for short code generation
const base62Chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

// toBase62 converts an integer counter to a short alphanumeric code
// e.g. 1 → "1", 62 → "A0", 3844 → "A00"
func toBase62(n int) string {
\tif n == 0 {
\t\treturn "0"
\t}
\tres := []byte{}
\tfor n > 0 {
\t\t// Build code right-to-left via prepend, then result is already in order
\t\tres = append([]byte{base62Chars[n%62]}, res...)
\t\tn /= 62
\t}
\treturn string(res)
}

// URLShortener maps short codes ↔ long URLs with click tracking
type URLShortener struct {
\tmu      sync.RWMutex
\tstore   map[string]string // short → long
\treverse map[string]string // long → short (prevents duplicate codes for same URL)
\tclicks  map[string]int
\tcounter int // auto-incrementing seed for short code generation
}

// NewShortener creates a new in-memory URL shortener
func NewShortener() *URLShortener {
\treturn &URLShortener{
\t\tstore:   make(map[string]string),
\t\treverse: make(map[string]string),
\t\tclicks:  make(map[string]int),
\t}
}

// Shorten returns the short code for a URL — idempotent for the same URL
func (us *URLShortener) Shorten(long string) string {
\tus.mu.Lock()
\tdefer us.mu.Unlock()

\t// Return existing code if URL was already shortened
\tif short, ok := us.reverse[long]; ok {
\t\treturn short // idempotent
\t}

\t// Generate a new unique short code from the auto-incrementing counter
\tus.counter++
\tshort := toBase62(us.counter)
\tus.store[short] = long
\tus.reverse[long] = short
\treturn short
}

// Resolve looks up the long URL for a short code
func (us *URLShortener) Resolve(short string) (string, error) {
\tus.mu.RLock()
\tdefer us.mu.RUnlock()
\tlong, ok := us.store[short]
\tif !ok {
\t\treturn "", errors.New("short URL not found")
\t}
\treturn long, nil
}

// Click increments the hit counter for a short code
func (us *URLShortener) Click(short string) {
\tus.mu.Lock()
\tdefer us.mu.Unlock()
\tus.clicks[short]++
}

// Stats returns the total click count for a short code
func (us *URLShortener) Stats(short string) int {
\tus.mu.RLock()
\tdefer us.mu.RUnlock()
\treturn us.clicks[short]
}

func main() {
\ts := NewShortener()
\tcode := s.Shorten("https://www.example.com/very/long/url")
\tfmt.Println("short:", code) // 1

\t// Same URL returns the same code — idempotent
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

// Book represents a library book with availability status
type Book struct {
\tISBN      string
\tTitle     string
\tAuthor    string
\tAvailable bool // false when currently borrowed by a member
}

// Member tracks a registered library member and their borrowed books
type Member struct {
\tID       int
\tName     string
\tBorrowed []string // slice of ISBNs currently borrowed
}

// Library manages books and members with borrowing rules
type Library struct {
\tbooks   map[string]*Book // ISBN → Book for O(1) lookup
\tmembers map[int]*Member  // memberID → Member
}

// NewLibrary creates an empty library
func NewLibrary() *Library {
\treturn &Library{
\t\tbooks:   make(map[string]*Book),
\t\tmembers: make(map[int]*Member),
\t}
}

// AddBook adds a new book to the collection (available by default)
func (l *Library) AddBook(isbn, title, author string) {
\tl.books[isbn] = &Book{ISBN: isbn, Title: title, Author: author, Available: true}
}

// RegisterMember adds a new member to the library
func (l *Library) RegisterMember(id int, name string) {
\tl.members[id] = &Member{ID: id, Name: name}
}

// Borrow lends a book to a member — fails if book is already borrowed
func (l *Library) Borrow(memberID int, isbn string) error {
\tmember, ok := l.members[memberID]
\tif !ok {
\t\treturn errors.New("member not found")
\t}
\tbook, ok := l.books[isbn]
\tif !ok {
\t\treturn errors.New("book not found")
\t}

\t// Only one borrower at a time
\tif !book.Available {
\t\treturn fmt.Errorf("'%s' is currently borrowed", book.Title)
\t}

\t// Mark book unavailable and track on member's list
\tbook.Available = false
\tmember.Borrowed = append(member.Borrowed, isbn)
\tfmt.Printf("%s borrowed '%s'\\n", member.Name, book.Title)
\treturn nil
}

// Return accepts a book back — verifies the member actually borrowed it
func (l *Library) Return(memberID int, isbn string) error {
\tmember, ok := l.members[memberID]
\tif !ok {
\t\treturn errors.New("member not found")
\t}
\tbook, ok := l.books[isbn]
\tif !ok {
\t\treturn errors.New("book not found")
\t}

\t// Find and remove ISBN from member's borrowed list
\tfor i, b := range member.Borrowed {
\t\tif b == isbn {
\t\t\t// Slice deletion: overwrite element with tail, truncate
\t\t\tmember.Borrowed = append(member.Borrowed[:i], member.Borrowed[i+1:]...)
\t\t\tbook.Available = true
\t\t\tfmt.Printf("%s returned '%s'\\n", member.Name, book.Title)
\t\t\treturn nil
\t\t}
\t}
\treturn fmt.Errorf("%s did not borrow this book", member.Name)
}

// MemberBooks lists all ISBNs currently borrowed by a member
func (l *Library) MemberBooks(memberID int) []string {
\treturn l.members[memberID].Borrowed
}

func main() {
\tlib := NewLibrary()
\tlib.AddBook("978-0", "Clean Code", "Robert Martin")
\tlib.AddBook("978-1", "The Go Programming Language", "Donovan")
\tlib.RegisterMember(1, "Alice")
\tlib.RegisterMember(2, "Bob")

\t// Alice borrows Clean Code
\tlib.Borrow(1, "978-0")

\t// Bob tries to borrow the same book — already taken
\tif err := lib.Borrow(2, "978-0"); err != nil {
\t\tfmt.Println("error:", err)
\t}

\t// Alice returns it — now Bob can borrow
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

import "fmt"

// Product is a catalog item with an ID, name, and price
type Product struct {
\tID    string
\tName  string
\tPrice float64
}

// CartItem holds a product and how many units are in the cart
type CartItem struct {
\tProduct  Product
\tQuantity int
}

// LineItem is one row on the checkout receipt
type LineItem struct {
\tName      string
\tQty       int
\tUnitPrice float64
\tSubtotal  float64
}

// Receipt is the final checkout summary
type Receipt struct {
\tItems    []LineItem
\tDiscount float64 // total discount amount in ₹
\tTotal    float64
}

// Cart stores items and an optional discount multiplier
type Cart struct {
\titems    map[string]*CartItem // productID → CartItem for O(1) add/remove
\tdiscount float64              // 0.10 = 10% off
}

// NewCart creates an empty cart with no discount
func NewCart() *Cart {
\treturn &Cart{items: make(map[string]*CartItem)}
}

// AddItem adds a product to the cart or increases quantity if already present
func (c *Cart) AddItem(p Product, qty int) {
\tif item, ok := c.items[p.ID]; ok {
\t\t// Product already in cart — just increment quantity
\t\titem.Quantity += qty
\t} else {
\t\tc.items[p.ID] = &CartItem{Product: p, Quantity: qty}
\t}
}

// RemoveItem deletes a product from the cart entirely
func (c *Cart) RemoveItem(productID string) error {
\tif _, ok := c.items[productID]; !ok {
\t\treturn fmt.Errorf("item %s not in cart", productID)
\t}
\tdelete(c.items, productID)
\treturn nil
}

// ApplyDiscount sets a percentage discount (e.g. 10 means 10% off)
func (c *Cart) ApplyDiscount(pct float64) {
\tc.discount = pct / 100 // store as multiplier
}

// Total returns the discounted cart total
func (c *Cart) Total() float64 {
\tvar total float64
\tfor _, item := range c.items {
\t\ttotal += item.Product.Price * float64(item.Quantity)
\t}
\t// Multiply by (1 - discount): e.g. 10% off → × 0.90
\treturn total * (1 - c.discount)
}

// Checkout freezes the cart into a Receipt with line items and final total
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
\t\tDiscount: c.discount * subtotal, // discount amount in ₹
\t\tTotal:    c.Total(),
\t}
}

func main() {
\tcart := NewCart()
\tcart.AddItem(Product{"P1", "Laptop", 80000}, 1)
\tcart.AddItem(Product{"P2", "Mouse", 1500}, 2)

\t// Adding same product again accumulates quantity: Laptop qty → 2
\tcart.AddItem(Product{"P1", "Laptop", 80000}, 1)
\tcart.ApplyDiscount(10) // 10% off

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

// Channel is the delivery medium — typed string so invalid channels fail at compile time
type Channel string

const (
\tEmail Channel = "email"
\tSMS   Channel = "sms"
\tPush  Channel = "push"
)

// NotificationHandler is the Strategy interface — each channel implements Send independently
type NotificationHandler interface {
\tSend(to, message string) error
}

// ─── concrete handlers ───────────────────────────────────────────────────────

// EmailHandler sends full-length messages; no truncation needed for email
type EmailHandler struct{}

func (e *EmailHandler) Send(to, msg string) error {
\tfmt.Printf("[EMAIL → %s] %s\\n", to, msg)
\treturn nil
}

// SMSHandler truncates to 60 chars — SMS has a 160-char hard limit per segment
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

// min returns the smaller of two ints — used for safe slice truncation
func min(a, b int) int {
\tif a < b {
\t\treturn a
\t}
\treturn b
}

// ─── service ─────────────────────────────────────────────────────────────────

// NotificationService wires handlers (how to send) to user preferences (where to send)
type NotificationService struct {
\thandlers    map[Channel]NotificationHandler // channel → concrete strategy
\tpreferences map[string][]Channel            // userID → preferred channels
}

// NewNotificationService creates the service with empty registries
func NewNotificationService() *NotificationService {
\treturn &NotificationService{
\t\thandlers:    make(map[Channel]NotificationHandler),
\t\tpreferences: make(map[string][]Channel),
\t}
}

// Register plugs in a handler for a channel — call before any Notify
func (ns *NotificationService) Register(ch Channel, h NotificationHandler) {
\tns.handlers[ch] = h
}

// SetPreference stores which channels a user wants to receive notifications on
func (ns *NotificationService) SetPreference(userID string, channels []Channel) {
\tns.preferences[userID] = channels
}

// Notify dispatches message to all of the user's preferred channels
func (ns *NotificationService) Notify(userID, message string) {
\tchannels, ok := ns.preferences[userID]
\tif !ok {
\t\t// Unknown user — fall back to email rather than silently dropping
\t\tchannels = []Channel{Email}
\t}
\tvar errs []string
\tfor _, ch := range channels {
\t\th, ok := ns.handlers[ch]
\t\tif !ok {
\t\t\t// Handler not registered for this channel — log and continue to other channels
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
\t// Register all available transport strategies
\tns.Register(Email, &EmailHandler{})
\tns.Register(SMS, &SMSHandler{})
\tns.Register(Push, &PushHandler{})

\tns.SetPreference("alice", []Channel{Email, Push})
\tns.SetPreference("bob", []Channel{SMS})

\tns.Notify("alice", "Your order has been shipped!")
\t// Output: [EMAIL → alice] Your order has been shipped!
\t//         [PUSH → alice] Your order has been shipped!

\tns.Notify("bob", "OTP: 482910 — valid for 10 minutes")
\t// Output: [SMS → bob] OTP: 482910 — valid for 10 minute  (truncated at 60)

\tns.Notify("carol", "Welcome to the platform") // carol has no preference → default email
\t// Output: [EMAIL → carol] Welcome to the platform
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

// SocialNetwork stores follows as a nested map — O(1) follow/unfollow and membership check
type SocialNetwork struct {
\tfollows map[string]map[string]bool // follower → set of followees
\ttweets  []*Tweet                   // global append-only log (real system: per-user sharded)
\tnextID  int
}

func NewSocialNetwork() *SocialNetwork {
\treturn &SocialNetwork{follows: make(map[string]map[string]bool)}
}

// Follow adds followee to follower's set, lazily creating the inner map on first follow
func (sn *SocialNetwork) Follow(follower, followee string) {
\tif sn.follows[follower] == nil {
\t\t// First time this user follows anyone — initialize the inner set
\t\tsn.follows[follower] = make(map[string]bool)
\t}
\tsn.follows[follower][followee] = true
}

// Unfollow removes followee from follower's set; safe to call even if not following
func (sn *SocialNetwork) Unfollow(follower, followee string) {
\tdelete(sn.follows[follower], followee)
}

// Post appends a new tweet to the global log and returns a pointer to it
func (sn *SocialNetwork) Post(userID, content string) *Tweet {
\tsn.nextID++
\tt := &Tweet{ID: sn.nextID, AuthorID: userID, Content: content, CreatedAt: time.Now()}
\tsn.tweets = append(sn.tweets, t)
\treturn t
}

// Timeline returns the latest \`limit\` tweets from users that userID follows (plus own posts)
// This is fanout-on-read: O(total tweets). A real system uses fanout-on-write (push to inbox).
func (sn *SocialNetwork) Timeline(userID string, limit int) []*Tweet {
\tfollowing := sn.follows[userID] // map lookup returns nil map if user has no follows — safe
\tvar feed []*Tweet
\tfor _, t := range sn.tweets {
\t\t// Include tweet if author is followed OR if it's the user's own post
\t\tif following[t.AuthorID] || t.AuthorID == userID {
\t\t\tfeed = append(feed, t)
\t\t}
\t}
\t// Sort newest-first so feed[:limit] gives the most recent N tweets
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
\ttime.Sleep(time.Millisecond) // ensure distinct timestamps for deterministic sort
\tsn.Post("carol", "Building systems in Go")
\ttime.Sleep(time.Millisecond)
\tsn.Post("alice", "My own tweet")
\ttime.Sleep(time.Millisecond)
\tsn.Post("dave", "You don't follow me") // dave not followed — excluded from alice's feed

\tfeed := sn.Timeline("alice", 5)
\tfor _, t := range feed {
\t\tfmt.Printf("[%s] %s\\n", t.AuthorID, t.Content)
\t}
\t// [alice] My own tweet
\t// [carol] Building systems in Go
\t// [bob] Go is awesome!
\t// dave excluded — not in alice's follows
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

// WorkerPool runs a fixed number of goroutines draining a shared buffered job channel
type WorkerPool struct {
\tjobs chan func()    // buffered channel acts as the work queue
\twg   sync.WaitGroup // tracks when all workers have exited
}

// NewWorkerPool starts \`workers\` goroutines each looping on the jobs channel
func NewWorkerPool(workers, queueSize int) *WorkerPool {
\twp := &WorkerPool{jobs: make(chan func(), queueSize)} // buffered so Submit rarely blocks
\tfor i := 0; i < workers; i++ {
\t\twp.wg.Add(1) // increment before goroutine starts to avoid race with Shutdown
\t\tgo func(id int) {
\t\t\tdefer wp.wg.Done() // signal exit when channel is drained and closed
\t\t\t// range over channel: blocks waiting for jobs, exits when channel is closed
\t\t\tfor job := range wp.jobs {
\t\t\t\tjob()
\t\t\t}
\t\t}(i + 1)
\t}
\treturn wp
}

// Submit enqueues a job — blocks if the buffered queue is full
func (wp *WorkerPool) Submit(job func()) {
\twp.jobs <- job
}

// Shutdown closes the jobs channel (no new submissions) then waits for all workers to drain
func (wp *WorkerPool) Shutdown() {
\tclose(wp.jobs) // signals all workers to exit after draining remaining jobs
\twp.wg.Wait()   // blocks until every goroutine calls wg.Done()
}

func main() {
\tpool := NewWorkerPool(3, 10) // 3 concurrent workers, queue depth 10

\tvar mu sync.Mutex
\tresults := []int{}

\tfor i := 1; i <= 8; i++ {
\t\tval := i // capture loop var — closures capture by reference without this
\t\tpool.Submit(func() {
\t\t\ttime.Sleep(10 * time.Millisecond) // simulate work
\t\t\tmu.Lock()
\t\t\tresults = append(results, val*val)
\t\t\tmu.Unlock()
\t\t})
\t}

\tpool.Shutdown() // waits for all 8 jobs to finish before proceeding
\tfmt.Println("results:", results) // 8 squared values, arrival order non-deterministic
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
\tfileNode nodeType = iota // 0 — leaf node with text content
\tdirNode                  // 1 — internal node with children map
)

// fsNode is a single tree node — either a file (content set) or directory (children set)
type fsNode struct {
\tname     string
\tkind     nodeType
\tcontent  string             // non-empty only for fileNode
\tchildren map[string]*fsNode // non-nil only for dirNode
}

type FileSystem struct {
\troot *fsNode // always a dirNode representing "/"
}

// NewFS creates the filesystem with an empty root directory
func NewFS() *FileSystem {
\treturn &FileSystem{root: &fsNode{name: "/", kind: dirNode, children: make(map[string]*fsNode)}}
}

// navigate walks path segments from root; if create=true, missing dirs are created (mkdir -p)
func (fs *FileSystem) navigate(parts []string, create bool) (*fsNode, error) {
\tcur := fs.root
\tfor _, part := range parts {
\t\tif part == "" {
\t\t\tcontinue // skip empty segments from leading/trailing slashes
\t\t}
\t\tchild, ok := cur.children[part]
\t\tif !ok {
\t\t\tif !create {
\t\t\t\treturn nil, fmt.Errorf("'%s' not found", part)
\t\t\t}
\t\t\t// Auto-create intermediate directory — equivalent to mkdir -p behaviour
\t\t\tchild = &fsNode{name: part, kind: dirNode, children: make(map[string]*fsNode)}
\t\t\tcur.children[part] = child
\t\t}
\t\tcur = child
\t}
\treturn cur, nil
}

// split separates a path into parent segments and the final component name
// e.g. "/home/alice/readme.txt" → (["home","alice"], "readme.txt")
func split(path string) ([]string, string) {
\tparts := strings.Split(strings.Trim(path, "/"), "/")
\tif len(parts) == 1 {
\t\treturn nil, parts[0] // top-level entry — parent is root
\t}
\treturn parts[:len(parts)-1], parts[len(parts)-1]
}

// Mkdir creates the directory at path and all missing parents (mkdir -p)
func (fs *FileSystem) Mkdir(path string) error {
\tparts := strings.Split(strings.Trim(path, "/"), "/")
\t_, err := fs.navigate(parts, true) // create=true makes all intermediate dirs
\treturn err
}

// Touch creates a file at path with content, overwriting if it already exists
func (fs *FileSystem) Touch(path, content string) error {
\tdir, name := split(path)
\tparent, err := fs.navigate(dir, true) // ensure parent dirs exist
\tif err != nil {
\t\treturn err
\t}
\t// Overwrite any existing entry — no children map needed for a file node
\tparent.children[name] = &fsNode{name: name, kind: fileNode, content: content}
\treturn nil
}

// Read returns the content of a file; returns error if path is a directory
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

// Ls returns sorted child names of a directory
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
\tsort.Strings(names) // deterministic order like real ls
\treturn names, nil
}

// Rm deletes a file or an empty directory; refuses to remove non-empty dirs
func (fs *FileSystem) Rm(path string) error {
\tdir, name := split(path)
\tparent, err := fs.navigate(dir, false) // parent must already exist
\tif err != nil {
\t\treturn err
\t}
\tnode, ok := parent.children[name]
\tif !ok {
\t\treturn errors.New("not found")
\t}
\tif node.kind == dirNode && len(node.children) > 0 {
\t\t// Safety guard — prevent accidental recursive delete (use Rmdir -r for that)
\t\treturn errors.New("directory not empty")
\t}
\tdelete(parent.children, name) // unlink node from parent's map
\treturn nil
}

func main() {
\tfs := NewFS()
\tfs.Mkdir("/home/alice/docs") // creates /home, /home/alice, /home/alice/docs in one call
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
