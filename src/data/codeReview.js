export const CR_CATEGORIES = [
  // ─────────────────────────────────────────────────────────────
  // 1. Concurrency Issues
  // ─────────────────────────────────────────────────────────────
  {
    id: "concurrency",
    title: "Concurrency Issues",
    icon: "🔒",
    problems: [
      {
        id: "goroutine-leak",
        title: "Goroutine Leak in Worker Pool",
        difficulty: "Medium",
        description:
          "A worker pool dispatches jobs to goroutines. Identify the goroutine leak, explain why it happens, and rewrite the pool correctly.",
        category: "Concurrency",
        buggyCode: `package main

import (
	"fmt"
	"sync"
)

type WorkerPool struct {
	jobs    chan int
	wg      sync.WaitGroup
	workers int
}

func NewWorkerPool(workers int) *WorkerPool {
	return &WorkerPool{
		jobs:    make(chan int),
		workers: workers,
	}
}

func (wp *WorkerPool) Start() {
	for i := 0; i < wp.workers; i++ {
		go func() {
			for job := range wp.jobs {
				fmt.Println("processing", job)
				wp.wg.Done()
			}
		}()
	}
}

func (wp *WorkerPool) Submit(job int) {
	wp.wg.Add(1)
	wp.jobs <- job
}

func (wp *WorkerPool) Wait() {
	wp.wg.Wait()
}

func main() {
	pool := NewWorkerPool(3)
	pool.Start()
	for i := 0; i < 10; i++ {
		pool.Submit(i)
	}
	pool.Wait()
}`,
        issues: [
          {
            severity: "Critical",
            title: "Channel never closed — goroutines leak forever",
            description:
              "Worker goroutines block on `range wp.jobs` indefinitely. `Wait()` returns when job count hits zero, but the channel is never closed, so all workers stay alive blocked — leaking for the process lifetime.",
          },
          {
            severity: "High",
            title: "wg.Add/Done split across goroutines — panic causes deadlock",
            description:
              "Add(1) is called in Submit (main goroutine), Done() is called inside the worker. If the worker panics, Done() is never called and Wait() blocks forever. Using defer wg.Done() inside workers with Add(1) before goroutine launch fixes this.",
          },
          {
            severity: "Medium",
            title: "No Stop/Shutdown method",
            description:
              "After Wait() returns there is no way to signal workers to exit. The pool is unusable but goroutines remain alive. A Stop() that closes the channel and waits for drain is required.",
          },
        ],
        annotatedCode: `package main

import (
	"fmt"
	"sync"
)

type WorkerPool struct {
	jobs    chan int
	wg      sync.WaitGroup
	workers int
}

func NewWorkerPool(workers int) *WorkerPool {
	return &WorkerPool{
		// ❌ ISSUE: unbuffered channel — Submit blocks caller until a worker is free.
		// Use a buffered channel so Submit doesn't stall the producer.
		jobs:    make(chan int),
		workers: workers,
	}
}

func (wp *WorkerPool) Start() {
	for i := 0; i < wp.workers; i++ {
		go func() {
			for job := range wp.jobs {
				fmt.Println("processing", job)
				// ❌ ISSUE: wg.Done() here is fragile.
				// If this goroutine panics, Done() is skipped → deadlock.
				// ✅ FIX: use defer wg.Done() at the top of the goroutine.
				wp.wg.Done()
			}
			// ❌ ISSUE: This line is NEVER reached.
			// wp.jobs is never closed, so range never exits.
			// Every worker goroutine leaks for the life of the process.
		}()
	}
}

func (wp *WorkerPool) Submit(job int) {
	// ❌ ISSUE: wg.Add(1) is called here (producer side),
	// but wg.Done() is called inside the worker goroutine.
	// Tight coupling — a future refactor can easily break the balance.
	// ✅ FIX: track workers, not jobs. Add(1) before go func, Done inside worker.
	wp.wg.Add(1)
	wp.jobs <- job
}

func (wp *WorkerPool) Wait() {
	wp.wg.Wait()
	// ❌ ISSUE: After Wait() returns, wp.jobs is still open.
	// All worker goroutines are blocked on range — they never exit.
	// ✅ FIX: close(wp.jobs) before or as part of stopping the pool.
}`,
        fixedCode: `package main

import (
	"fmt"
	"sync"
)

type WorkerPool struct {
	jobs    chan int
	wg      sync.WaitGroup
	workers int
}

func NewWorkerPool(workers int) *WorkerPool {
	return &WorkerPool{
		jobs:    make(chan int, 64), // buffered so Submit rarely blocks
		workers: workers,
	}
}

func (wp *WorkerPool) Start() {
	for i := 0; i < wp.workers; i++ {
		wp.wg.Add(1) // Add before launch — no race with Done
		go func() {
			defer wp.wg.Done() // fires even on panic
			for job := range wp.jobs {
				fmt.Println("processing", job)
			}
			// range exits cleanly when Stop() closes the channel
		}()
	}
}

func (wp *WorkerPool) Submit(job int) {
	wp.jobs <- job
}

// Stop drains the queue and waits for all workers to exit.
func (wp *WorkerPool) Stop() {
	close(wp.jobs) // signals workers to exit after draining
	wp.wg.Wait()
}

func main() {
	pool := NewWorkerPool(3)
	pool.Start()
	for i := 0; i < 10; i++ {
		pool.Submit(i)
	}
	pool.Stop() // replaces Wait(); properly terminates workers
}`,
        keyTakeaways: [
          "Always close channels when done sending — range loops never exit otherwise",
          "Call wg.Add(1) before launching the goroutine, not inside it",
          "Use defer wg.Done() inside goroutines so Done fires even on panic",
          "Expose a Stop()/Shutdown() that closes the channel then calls Wait()",
          "Buffer the jobs channel so the producer isn't blocked on slow consumers",
        ],
      },

      {
        id: "data-race-map",
        title: "Data Race on Shared Map",
        difficulty: "Medium",
        description:
          "A cache is accessed concurrently by multiple goroutines. Find all data races and fix them using the correct synchronization primitive.",
        category: "Concurrency",
        buggyCode: `package main

import (
	"fmt"
	"time"
)

type Cache struct {
	store map[string]string
}

func NewCache() *Cache {
	return &Cache{store: make(map[string]string)}
}

func (c *Cache) Set(key, value string) {
	c.store[key] = value
}

func (c *Cache) Get(key string) (string, bool) {
	v, ok := c.store[key]
	return v, ok
}

func (c *Cache) Delete(key string) {
	delete(c.store, key)
}

func main() {
	cache := NewCache()

	for i := 0; i < 10; i++ {
		go func(i int) {
			key := fmt.Sprintf("key-%d", i)
			cache.Set(key, fmt.Sprintf("val-%d", i))
		}(i)
	}

	time.Sleep(100 * time.Millisecond)

	for i := 0; i < 10; i++ {
		go func(i int) {
			key := fmt.Sprintf("key-%d", i)
			if v, ok := cache.Get(key); ok {
				fmt.Println(v)
			}
		}(i)
	}

	time.Sleep(100 * time.Millisecond)
}`,
        issues: [
          {
            severity: "Critical",
            title: "Concurrent map read/write — undefined behavior",
            description:
              "Go's map is NOT safe for concurrent use. Simultaneous Set + Get goroutines trigger 'concurrent map read and map write' — the runtime detects this and panics with a fatal error in Go 1.6+. Run with -race to catch this.",
          },
          {
            severity: "High",
            title: "time.Sleep used for synchronization",
            description:
              "Sleeping is not a synchronization mechanism. Under load or on a slow machine the goroutines may not finish in 100ms, causing a race or missed reads. Use sync.WaitGroup or channels to wait for goroutines to complete.",
          },
          {
            severity: "Medium",
            title: "sync.RWMutex preferred over sync.Mutex for read-heavy caches",
            description:
              "A plain Mutex serializes all readers. For a cache where reads >> writes, sync.RWMutex allows concurrent reads and only exclusive locks for writes — much better throughput.",
          },
        ],
        annotatedCode: `package main

import (
	"fmt"
	"time"
)

type Cache struct {
	// ❌ ISSUE: plain map with no synchronization.
	// Go maps are NOT goroutine-safe. Any concurrent read+write
	// causes a fatal runtime panic: "concurrent map read and map write".
	// ✅ FIX: embed sync.RWMutex and lock around every access.
	store map[string]string
}

func NewCache() *Cache {
	return &Cache{store: make(map[string]string)}
}

func (c *Cache) Set(key, value string) {
	// ❌ ISSUE: no lock — concurrent Set() calls race each other
	// and race with Get() and Delete().
	c.store[key] = value
}

func (c *Cache) Get(key string) (string, bool) {
	// ❌ ISSUE: no lock — reading while another goroutine writes
	// is a data race that can corrupt the map's internal structure.
	v, ok := c.store[key]
	return v, ok
}

func (c *Cache) Delete(key string) {
	// ❌ ISSUE: same — delete without lock races with all other ops.
	delete(c.store, key)
}

func main() {
	cache := NewCache()

	for i := 0; i < 10; i++ {
		go func(i int) {
			key := fmt.Sprintf("key-%d", i)
			cache.Set(key, fmt.Sprintf("val-%d", i))
		}(i)
	}

	// ❌ ISSUE: time.Sleep is NOT a synchronization primitive.
	// If goroutines are slow (high load, GC pause), reads below
	// start before writes finish — data race guaranteed.
	// ✅ FIX: use sync.WaitGroup to wait for goroutines to finish.
	time.Sleep(100 * time.Millisecond)

	for i := 0; i < 10; i++ {
		go func(i int) {
			key := fmt.Sprintf("key-%d", i)
			if v, ok := cache.Get(key); ok {
				fmt.Println(v)
			}
		}(i)
	}

	time.Sleep(100 * time.Millisecond)
}`,
        fixedCode: `package main

import (
	"fmt"
	"sync"
)

type Cache struct {
	mu    sync.RWMutex
	store map[string]string
}

func NewCache() *Cache {
	return &Cache{store: make(map[string]string)}
}

func (c *Cache) Set(key, value string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.store[key] = value
}

func (c *Cache) Get(key string) (string, bool) {
	c.mu.RLock() // multiple readers can hold RLock simultaneously
	defer c.mu.RUnlock()
	v, ok := c.store[key]
	return v, ok
}

func (c *Cache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.store, key)
}

func main() {
	cache := NewCache()
	var wg sync.WaitGroup

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			cache.Set(fmt.Sprintf("key-%d", i), fmt.Sprintf("val-%d", i))
		}(i)
	}
	wg.Wait() // deterministic — no sleep

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if v, ok := cache.Get(fmt.Sprintf("key-%d", i)); ok {
				fmt.Println(v)
			}
		}(i)
	}
	wg.Wait()
}`,
        keyTakeaways: [
          "Go maps are not goroutine-safe — always protect with a mutex",
          "Use sync.RWMutex for read-heavy workloads: RLock allows concurrent reads",
          "Never use time.Sleep for goroutine synchronization — use WaitGroup or channels",
          "Run tests with go test -race to catch data races early",
          "sync.Map is an alternative for concurrent maps with many independent keys",
        ],
      },

      {
        id: "closure-capture",
        title: "Loop Variable Capture in Goroutine",
        difficulty: "Easy",
        description:
          "A server spawns one goroutine per request to log the request index. The output is unexpected — diagnose the classic closure capture bug.",
        category: "Concurrency",
        buggyCode: `package main

import (
	"fmt"
	"sync"
)

func processRequests(n int) {
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// Logs the request index
			fmt.Printf("handling request %d\\n", i)
		}()
	}
	wg.Wait()
}

func main() {
	processRequests(5)
}`,
        issues: [
          {
            severity: "Critical",
            title: "Loop variable captured by reference, not value",
            description:
              "All goroutines share the same variable `i` from the enclosing scope. By the time they run, the loop has finished and `i == n` (or some later value). Every goroutine prints the same stale value — almost never 0-4 in order.",
          },
          {
            severity: "Medium",
            title: "Non-deterministic output order",
            description:
              "Goroutine scheduling is non-deterministic. Even with the fix, output order is random. If ordering matters, collect results and sort, or use a channel with index.",
          },
        ],
        annotatedCode: `package main

import (
	"fmt"
	"sync"
)

func processRequests(n int) {
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		// ❌ ISSUE: the goroutine closure captures the variable 'i'
		// by reference — it shares the same memory location as the
		// loop variable. By the time the goroutine runs, the loop
		// has already advanced i (often to n).
		// All goroutines typically print the same value: 5.
		go func() {
			defer wg.Done()
			// ❌ ISSUE: 'i' here refers to the loop variable,
			// not a snapshot of its value at goroutine launch time.
			// ✅ FIX option 1: pass i as a parameter: go func(i int) { ... }(i)
			// ✅ FIX option 2 (Go 1.22+): loop variable is per-iteration by default.
			fmt.Printf("handling request %d\\n", i)
		}()
	}
	wg.Wait()
}

func main() {
	processRequests(5)
}`,
        fixedCode: `package main

import (
	"fmt"
	"sync"
)

func processRequests(n int) {
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		// FIX: pass i as a parameter — each goroutine gets its own copy
		go func(reqIdx int) {
			defer wg.Done()
			fmt.Printf("handling request %d\\n", reqIdx)
		}(i)
	}
	wg.Wait()
}

func main() {
	processRequests(5)
}

// Alternative fix (idiomatic since Go 1.22):
// Loop variables are automatically per-iteration scoped,
// so capturing them in goroutines works correctly without
// the explicit parameter trick.`,
        keyTakeaways: [
          "Goroutine closures capture variables by reference, not by value",
          "Pass loop variables as goroutine parameters to snapshot the current value",
          "Go 1.22+ makes loop variables per-iteration, fixing this automatically",
          "Always run go vet — it catches some closure capture patterns",
          "This same bug appears in any loop that spawns goroutines or callbacks",
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 2. Memory & Performance
  // ─────────────────────────────────────────────────────────────
  {
    id: "memory-performance",
    title: "Memory & Performance",
    icon: "⚡",
    problems: [
      {
        id: "string-concat",
        title: "Inefficient String Concatenation",
        difficulty: "Easy",
        description:
          "A log formatter builds a long string by concatenating in a loop. Profile the allocations and rewrite it to be O(n) instead of O(n²).",
        category: "Memory & Performance",
        buggyCode: `package main

import (
	"fmt"
	"strings"
)

func buildReport(events []string) string {
	result := ""
	for i, e := range events {
		result += fmt.Sprintf("[%d] %s\\n", i, e)
	}
	return result
}

func main() {
	events := make([]string, 10000)
	for i := range events {
		events[i] = fmt.Sprintf("event-%d", i)
	}
	report := buildReport(events)
	_ = strings.Contains(report, "event-5000")
}`,
        issues: [
          {
            severity: "Critical",
            title: "O(n²) allocations — string is immutable in Go",
            description:
              "Each `result += ...` creates a brand-new string: it allocates a buffer len(result)+len(new), copies both strings in, and discards the old string. For 10,000 events this is ~50 million bytes copied. Use strings.Builder which pre-grows a single buffer.",
          },
          {
            severity: "Medium",
            title: "fmt.Sprintf inside hot loop adds extra allocations",
            description:
              "fmt.Sprintf allocates an intermediate string just for the format. Use strings.Builder.WriteString + strconv.Itoa for tight loops, or pre-estimate capacity with Builder.Grow().",
          },
        ],
        annotatedCode: `package main

import (
	"fmt"
	"strings"
)

func buildReport(events []string) string {
	// ❌ ISSUE: starting with "" means every += allocates a new string.
	// String immutability in Go means each concatenation is:
	//   alloc(len(result) + len(new)) + copy(result) + copy(new) + free(old)
	// Total copies: 0+1+2+...+n = O(n²). For 10k events = ~100MB of copies.
	result := ""
	for i, e := range events {
		// ❌ ISSUE: "result += X" allocates a new string every iteration.
		// After 10,000 events this has done ~50M bytes of copying.
		// ✅ FIX: use strings.Builder which maintains a []byte internally
		// and only converts to string once at the end.
		result += fmt.Sprintf("[%d] %s\\n", i, e)
	}
	return result
}

func main() {
	events := make([]string, 10000)
	for i := range events {
		events[i] = fmt.Sprintf("event-%d", i)
	}
	report := buildReport(events)
	_ = strings.Contains(report, "event-5000")
}`,
        fixedCode: `package main

import (
	"fmt"
	"strings"
)

func buildReport(events []string) string {
	var b strings.Builder
	// Pre-allocate: estimate ~20 bytes per event to avoid re-growth
	b.Grow(len(events) * 20)
	for i, e := range events {
		fmt.Fprintf(&b, "[%d] %s\\n", i, e)
	}
	return b.String() // single allocation at the end
}

func main() {
	events := make([]string, 10000)
	for i := range events {
		events[i] = fmt.Sprintf("event-%d", i)
	}
	report := buildReport(events)
	_ = strings.Contains(report, "event-5000")
}

// Benchmark comparison (10k events):
// BuggyCode:   ~45ms, 500+ allocations, ~100MB copied
// Fixed code:  ~0.5ms, 1 allocation, ~200KB total`,
        keyTakeaways: [
          "String concatenation with += is O(n²) — avoid in loops with many iterations",
          "strings.Builder maintains a []byte buffer; String() does a single copy at the end",
          "Call Builder.Grow() with an estimated size to avoid incremental re-growth",
          "fmt.Fprintf writes directly to a Builder — no intermediate string allocation",
          "Benchmark with go test -bench and profile with -memprofile to catch this",
        ],
      },

      {
        id: "slice-memory-leak",
        title: "Slice Memory Leak — Backing Array Retained",
        difficulty: "Medium",
        description:
          "A log processing pipeline takes the first 10 entries of large log batches and stores them. The service's memory grows unboundedly — find and fix the leak.",
        category: "Memory & Performance",
        buggyCode: `package main

import "fmt"

type LogBatch struct {
	entries []string
}

var recentHeads [][]string

func processLog(batch LogBatch) {
	// Keep only the first 10 entries for the dashboard
	head := batch.entries[:10]
	recentHeads = append(recentHeads, head)
}

func main() {
	for i := 0; i < 100; i++ {
		// Each batch has 100,000 entries
		entries := make([]string, 100_000)
		for j := range entries {
			entries[j] = fmt.Sprintf("log-%d-%d", i, j)
		}
		processLog(LogBatch{entries: entries})
	}
	// recentHeads holds 100 slices of 10 — but 100 * 100,000 strings
	// are kept alive in memory because of the shared backing arrays.
}`,
        issues: [
          {
            severity: "Critical",
            title: "Reslice retains the full backing array in memory",
            description:
              "batch.entries[:10] creates a new slice header (ptr, len=10, cap=100000) pointing into the SAME backing array as batch.entries. The GC cannot free the 100k-entry array because recentHeads holds a reference. 100 batches × 100k strings = all memory is pinned.",
          },
          {
            severity: "Medium",
            title: "No capacity enforcement — future appends corrupt adjacent data",
            description:
              "If anyone appends to `head` beyond cap=100000, it writes into the next batch's entries silently. Always copy when extracting a sub-slice meant to outlive the source.",
          },
        ],
        annotatedCode: `package main

import "fmt"

type LogBatch struct {
	entries []string
}

var recentHeads [][]string

func processLog(batch LogBatch) {
	// ❌ ISSUE: reslice — creates a new slice header but shares
	// the SAME underlying array as batch.entries.
	// Slice header: { ptr: &entries[0], len: 10, cap: 100000 }
	//
	// As long as recentHeads holds this slice, the GC cannot collect
	// the 100,000-entry backing array — even though we only need 10.
	// After 100 batches: 100 * 100,000 strings pinned in memory.
	head := batch.entries[:10]

	// ❌ ISSUE: appending head to recentHeads looks innocent but
	// pins the entire 100k backing array for each batch.
	recentHeads = append(recentHeads, head)
}

func main() {
	for i := 0; i < 100; i++ {
		entries := make([]string, 100_000)
		for j := range entries {
			entries[j] = fmt.Sprintf("log-%d-%d", i, j)
		}
		// ❌ ISSUE: each call to processLog leaks 100k strings worth of memory.
		// The "batch" variable goes out of scope here, but its backing
		// array is kept alive by recentHeads.
		processLog(LogBatch{entries: entries})
	}
}`,
        fixedCode: `package main

import "fmt"

type LogBatch struct {
	entries []string
}

var recentHeads [][]string

func processLog(batch LogBatch) {
	// FIX: copy into a new, right-sized slice.
	// The new slice owns its own backing array — batch.entries can be GC'd.
	head := make([]string, 10)
	copy(head, batch.entries[:10])
	recentHeads = append(recentHeads, head)
}

func main() {
	for i := 0; i < 100; i++ {
		entries := make([]string, 100_000)
		for j := range entries {
			entries[j] = fmt.Sprintf("log-%d-%d", i, j)
		}
		processLog(LogBatch{entries: entries})
		// After processLog returns, entries backing array is eligible for GC.
	}
	// recentHeads holds 100 slices, each with its own 10-element array.
	// Memory: 100 * 10 strings — not 100 * 100,000.
}`,
        keyTakeaways: [
          "Reslicing (a[m:n]) shares the backing array — the source cannot be GC'd",
          "Always copy when storing a sub-slice that outlives the source batch",
          "Use copy(dst, src[:n]) to create an independent, right-sized slice",
          "Use cap() and runtime/pprof heap profiles to detect backing array leaks",
          "The same issue applies to bytes.Buffer, []byte responses from io.ReadAll",
        ],
      },

      {
        id: "sync-pool-misuse",
        title: "Missing sync.Pool — Per-Request Allocations",
        difficulty: "Hard",
        description:
          "An HTTP handler allocates a large buffer on every request to build JSON responses. Under load the GC overhead is severe — add sync.Pool to reuse buffers.",
        category: "Memory & Performance",
        buggyCode: `package main

import (
	"bytes"
	"encoding/json"
	"net/http"
)

type Response struct {
	Data []string
}

func handler(w http.ResponseWriter, r *http.Request) {
	data := []string{"item1", "item2", "item3"}

	// Allocate a fresh buffer for every single request
	buf := &bytes.Buffer{}
	enc := json.NewEncoder(buf)

	if err := enc.Encode(Response{Data: data}); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(buf.Bytes())
}

func main() {
	http.HandleFunc("/api/data", handler)
	http.ListenAndServe(":8080", nil)
}`,
        issues: [
          {
            severity: "High",
            title: "Fresh allocation on every request — GC pressure at scale",
            description:
              "At 10k RPS each request allocates a bytes.Buffer and a json.Encoder. These are short-lived, triggering frequent GC cycles. Under load, GC pauses can push p99 latencies from 2ms to 50ms+. sync.Pool recycles the buffers across requests.",
          },
          {
            severity: "Medium",
            title: "Buffer capacity resets every request",
            description:
              "A recycled buffer from sync.Pool retains its allocated capacity from the previous request (hot path: capacity grows to optimal size and stays there). A fresh bytes.Buffer always starts at 0 capacity and re-grows on every request.",
          },
        ],
        annotatedCode: `package main

import (
	"bytes"
	"encoding/json"
	"net/http"
)

type Response struct {
	Data []string
}

// ❌ ISSUE: no pool — every request allocates fresh objects.
// At 10k RPS this is 10,000 bytes.Buffer allocs/sec going to GC.

func handler(w http.ResponseWriter, r *http.Request) {
	data := []string{"item1", "item2", "item3"}

	// ❌ ISSUE: new allocation on every request.
	// bytes.Buffer starts with 0 capacity and grows dynamically.
	// At 10k RPS = 10k allocs/sec, most <1ms lived → GC pressure.
	buf := &bytes.Buffer{}

	// ❌ ISSUE: json.Encoder also allocates internally.
	// If we reused the buffer via sync.Pool, we could also reset and reuse
	// the encoder (or just use json.Marshal into the existing buffer).
	enc := json.NewEncoder(buf)

	if err := enc.Encode(Response{Data: data}); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	// ❌ ISSUE: buf goes out of scope here and is eligible for GC.
	// The allocation just before this was wasted work per-request.
	w.Write(buf.Bytes())
}

func main() {
	http.HandleFunc("/api/data", handler)
	http.ListenAndServe(":8080", nil)
}`,
        fixedCode: `package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"sync"
)

type Response struct {
	Data []string
}

// Pool recycles *bytes.Buffer objects across requests.
// New() is called only on pool misses (cold start or high concurrency burst).
var bufPool = sync.Pool{
	New: func() interface{} {
		return &bytes.Buffer{}
	},
}

func handler(w http.ResponseWriter, r *http.Request) {
	data := []string{"item1", "item2", "item3"}

	// Get a recycled buffer — usually zero allocations
	buf := bufPool.Get().(*bytes.Buffer)
	buf.Reset() // clear previous content, but retain allocated capacity
	defer bufPool.Put(buf) // return to pool after response is sent

	if err := json.NewEncoder(buf).Encode(Response{Data: data}); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(buf.Bytes())
}

func main() {
	http.HandleFunc("/api/data", handler)
	http.ListenAndServe(":8080", nil)
}

// Result: allocation rate drops ~90% under sustained load.
// Buffer capacity stabilizes at the 95th-percentile response size
// (no re-growth after warmup). GC pauses drop significantly.`,
        keyTakeaways: [
          "sync.Pool recycles short-lived allocations — ideal for per-request buffers",
          "Always call buf.Reset() before reuse — Pool returns dirty objects",
          "Use defer poolVar.Put(obj) so objects return to pool even on error paths",
          "Pool objects are dropped during GC — don't store anything that must survive",
          "Profile with pprof -alloc_objects to find hot allocation sites first",
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 3. Error Handling
  // ─────────────────────────────────────────────────────────────
  {
    id: "error-handling",
    title: "Error Handling",
    icon: "⚠️",
    problems: [
      {
        id: "silent-error",
        title: "Silent Error Discard",
        difficulty: "Easy",
        description:
          "A file processing service silently discards errors. Find every discarded error and explain what could go wrong at runtime.",
        category: "Error Handling",
        buggyCode: `package main

import (
	"encoding/json"
	"fmt"
	"os"
)

type Config struct {
	Host string
	Port int
}

func loadConfig(path string) Config {
	data, _ := os.ReadFile(path)

	var cfg Config
	json.Unmarshal(data, &cfg)

	return cfg
}

func main() {
	cfg := loadConfig("config.json")
	fmt.Printf("connecting to %s:%d\\n", cfg.Host, cfg.Port)
}`,
        issues: [
          {
            severity: "Critical",
            title: "os.ReadFile error silently discarded",
            description:
              "If config.json doesn't exist or is unreadable, data is nil. json.Unmarshal on nil returns an error too (also discarded), and cfg is a zero-value Config{Host:'', Port:0}. The app connects to ':0' with no indication anything went wrong.",
          },
          {
            severity: "Critical",
            title: "json.Unmarshal error silently discarded",
            description:
              "If the file contains invalid JSON, unmarshal fails silently and cfg is partially zeroed. Partial state can be harder to debug than an early failure.",
          },
          {
            severity: "High",
            title: "Function returns zero-value on error instead of error signal",
            description:
              "loadConfig returns a Config with no way to distinguish success from failure. The caller cannot know whether the returned config is valid. Return (Config, error) instead.",
          },
        ],
        annotatedCode: `package main

import (
	"encoding/json"
	"fmt"
	"os"
)

type Config struct {
	Host string
	Port int
}

// ❌ ISSUE: returns only Config, no error.
// The caller cannot distinguish a valid config from a zero-value fallback.
// ✅ FIX: return (Config, error) so callers can handle failures explicitly.
func loadConfig(path string) Config {
	// ❌ ISSUE: error discarded with _.
	// If path doesn't exist: data = nil, err = *os.PathError — silently ignored.
	// ✅ FIX: if err != nil { return Config{}, fmt.Errorf("read config: %w", err) }
	data, _ := os.ReadFile(path)

	var cfg Config
	// ❌ ISSUE: json.Unmarshal error discarded.
	// If data is nil or invalid JSON: cfg is zero-value, error is gone.
	// Caller gets Config{Host:"", Port:0} with no idea anything failed.
	// ✅ FIX: check err and return it wrapped with context.
	json.Unmarshal(data, &cfg)

	return cfg
}

func main() {
	cfg := loadConfig("config.json")
	// ❌ ISSUE: if loadConfig silently failed, we connect to ":0".
	// No panic, no error — just subtly wrong behavior in production.
	fmt.Printf("connecting to %s:%d\\n", cfg.Host, cfg.Port)
}`,
        fixedCode: `package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
)

type Config struct {
	Host string
	Port int
}

func loadConfig(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("loadConfig: read %q: %w", path, err)
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, fmt.Errorf("loadConfig: parse %q: %w", path, err)
	}

	return cfg, nil
}

func main() {
	cfg, err := loadConfig("config.json")
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}
	fmt.Printf("connecting to %s:%d\\n", cfg.Host, cfg.Port)
}`,
        keyTakeaways: [
          "Never discard errors with _ unless you have an explicit reason and comment",
          "Functions that can fail should return (T, error) — not just T",
          "Wrap errors with fmt.Errorf(\"context: %w\", err) to preserve the chain",
          "Use log.Fatal or explicit error returns in main — never silently continue",
          "golangci-lint's errcheck linter catches discarded errors automatically",
        ],
      },

      {
        id: "panic-in-library",
        title: "Panic in Library Code",
        difficulty: "Medium",
        description:
          "A payment amount parser is used as a library. Review it for panic-inducing code paths that will crash callers unexpectedly.",
        category: "Error Handling",
        buggyCode: `package parser

import (
	"strconv"
	"strings"
)

// ParseAmount parses "$1,234.56" into cents (123456).
func ParseAmount(s string) int64 {
	if s == "" {
		panic("empty amount string")
	}

	s = strings.TrimPrefix(s, "$")
	s = strings.ReplaceAll(s, ",", "")

	parts := strings.Split(s, ".")
	dollars, _ := strconv.ParseInt(parts[0], 10, 64)

	if len(parts) == 1 {
		return dollars * 100
	}

	cents, _ := strconv.ParseInt(parts[1], 10, 64)
	if len(parts[1]) == 1 {
		cents *= 10
	}

	return dollars*100 + cents
}`,
        issues: [
          {
            severity: "Critical",
            title: "panic() in library code crashes the caller with no recovery path",
            description:
              "Library code must NEVER panic on bad input. The caller cannot recover from this without a recover() wrapper around every call. Return (int64, error) so callers can decide how to handle bad input.",
          },
          {
            severity: "High",
            title: "strconv.ParseInt errors silently discarded",
            description:
              "If parts[0] is non-numeric (e.g. 'abc'), ParseInt returns 0 and an error. The error is discarded, returning 0 silently — a payment of zero cents. This could cause incorrect transactions.",
          },
          {
            severity: "Medium",
            title: "No validation of decimal part length",
            description:
              "Only 1-digit decimals get a *10 correction. '1.5' → 50 cents (OK), but '1.123' → 12 cents (wrong). '1.5x' passes ParseInt as 5 cents. Decimal handling needs stricter validation.",
          },
        ],
        annotatedCode: `package parser

import (
	"strconv"
	"strings"
)

// ParseAmount parses "$1,234.56" into cents (123456).
func ParseAmount(s string) int64 {
	// ❌ ISSUE: panic in library code.
	// The caller cannot know this will panic without reading the source.
	// A panic unwinds the stack past every defer unless caught with recover().
	// In an HTTP server, one bad request crashes the whole goroutine — or worse.
	// ✅ FIX: return (int64, error) so the caller decides what to do.
	if s == "" {
		panic("empty amount string")
	}

	s = strings.TrimPrefix(s, "$")
	s = strings.ReplaceAll(s, ",", "")

	parts := strings.Split(s, ".")
	// ❌ ISSUE: error discarded — non-numeric input returns 0 silently.
	// ParseAmount("abc.50") returns 50 cents, not an error.
	dollars, _ := strconv.ParseInt(parts[0], 10, 64)

	if len(parts) == 1 {
		return dollars * 100
	}

	// ❌ ISSUE: error discarded again.
	cents, _ := strconv.ParseInt(parts[1], 10, 64)

	// ❌ ISSUE: only handles 1-digit decimals.
	// "1.5" → 50 cents ✓, "1.123" → 12 cents ✗ (should be error).
	// "1.50" → 50 cents ✓, "1.5x" → 5 cents ✗ (ParseInt("5x") = err, returns 0).
	if len(parts[1]) == 1 {
		cents *= 10
	}

	return dollars*100 + cents
}`,
        fixedCode: `package parser

import (
	"fmt"
	"strconv"
	"strings"
)

// ParseAmount parses "$1,234.56" into cents (123456).
// Returns an error for any malformed input — never panics.
func ParseAmount(s string) (int64, error) {
	if s == "" {
		return 0, fmt.Errorf("ParseAmount: empty string")
	}

	s = strings.TrimPrefix(s, "$")
	s = strings.ReplaceAll(s, ",", "")

	parts := strings.Split(s, ".")
	if len(parts) > 2 {
		return 0, fmt.Errorf("ParseAmount: invalid format %q", s)
	}

	dollars, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("ParseAmount: invalid dollars in %q: %w", s, err)
	}

	if len(parts) == 1 {
		return dollars * 100, nil
	}

	dec := parts[1]
	if len(dec) > 2 {
		return 0, fmt.Errorf("ParseAmount: too many decimal digits in %q", s)
	}
	if len(dec) == 1 {
		dec += "0" // normalize "5" → "50"
	}

	cents, err := strconv.ParseInt(dec, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("ParseAmount: invalid cents in %q: %w", s, err)
	}

	return dollars*100 + cents, nil
}`,
        keyTakeaways: [
          "Library code must NEVER panic on invalid input — return (T, error) instead",
          "panic is acceptable only for programmer errors (nil receiver, impossible state), not bad data",
          "Always check and propagate strconv.Parse* errors — silent 0 is worse than an error",
          "Validate input eagerly: length, format, range — before any computation",
          "Document the expected input format in the function comment",
        ],
      },

      {
        id: "error-context",
        title: "Error Context Lost in Call Chain",
        difficulty: "Easy",
        description:
          "A service calls a database function then an external API. When an error occurs in production, the logged error gives no hint where it originated — fix the error wrapping.",
        category: "Error Handling",
        buggyCode: `package main

import (
	"errors"
	"fmt"
	"log"
)

var ErrNotFound = errors.New("not found")

func getUser(id int) (string, error) {
	if id <= 0 {
		return "", ErrNotFound
	}
	return "alice", nil
}

func fetchProfile(userID int) (string, error) {
	name, err := getUser(userID)
	if err != nil {
		return "", err
	}
	return "profile:" + name, nil
}

func handleRequest(userID int) error {
	profile, err := fetchProfile(userID)
	if err != nil {
		return err
	}
	fmt.Println(profile)
	return nil
}

func main() {
	if err := handleRequest(-1); err != nil {
		log.Println("error:", err)
	}
}`,
        issues: [
          {
            severity: "High",
            title: "Errors returned bare — no context about where they occurred",
            description:
              "When handleRequest logs 'error: not found', there is no call stack info. In a large service with hundreds of 'not found' code paths, this is useless. Wrap each error with fmt.Errorf(\"context: %w\", err) to build a traceable error chain.",
          },
          {
            severity: "Medium",
            title: "errors.Is() works through the chain — wrapping does not break it",
            description:
              "A common misconception is that wrapping breaks errors.Is() checks. With %w, errors.Is(err, ErrNotFound) still returns true through any depth of wrapping. Always wrap — never sacrifice error identity for context.",
          },
        ],
        annotatedCode: `package main

import (
	"errors"
	"fmt"
	"log"
)

var ErrNotFound = errors.New("not found")

func getUser(id int) (string, error) {
	if id <= 0 {
		// ❌ ISSUE: bare sentinel error with no context.
		// Which user ID failed? What code path triggered this?
		// ✅ FIX: fmt.Errorf("getUser id=%d: %w", id, ErrNotFound)
		return "", ErrNotFound
	}
	return "alice", nil
}

func fetchProfile(userID int) (string, error) {
	name, err := getUser(userID)
	if err != nil {
		// ❌ ISSUE: re-returning err bare loses the call site context.
		// The caller sees "not found" with no idea it came from getUser.
		// ✅ FIX: return "", fmt.Errorf("fetchProfile userID=%d: %w", userID, err)
		return "", err
	}
	return "profile:" + name, nil
}

func handleRequest(userID int) error {
	profile, err := fetchProfile(userID)
	if err != nil {
		// ❌ ISSUE: again, bare return.
		// Final logged error: "error: not found" — no stack, no context.
		// ✅ FIX: return fmt.Errorf("handleRequest: %w", err)
		return err
	}
	fmt.Println(profile)
	return nil
}

func main() {
	if err := handleRequest(-1); err != nil {
		// Logs: "error: not found" — which not found? Where? Who called who?
		log.Println("error:", err)
	}
}`,
        fixedCode: `package main

import (
	"errors"
	"fmt"
	"log"
)

var ErrNotFound = errors.New("not found")

func getUser(id int) (string, error) {
	if id <= 0 {
		return "", fmt.Errorf("getUser id=%d: %w", id, ErrNotFound)
	}
	return "alice", nil
}

func fetchProfile(userID int) (string, error) {
	name, err := getUser(userID)
	if err != nil {
		return "", fmt.Errorf("fetchProfile userID=%d: %w", userID, err)
	}
	return "profile:" + name, nil
}

func handleRequest(userID int) error {
	profile, err := fetchProfile(userID)
	if err != nil {
		return fmt.Errorf("handleRequest: %w", err)
	}
	fmt.Println(profile)
	return nil
}

func main() {
	if err := handleRequest(-1); err != nil {
		// Now logs: "error: handleRequest: fetchProfile userID=-1: getUser id=-1: not found"
		// Full call chain visible in a single log line.
		log.Println("error:", err)

		// errors.Is still works through the wrapped chain:
		if errors.Is(err, ErrNotFound) {
			log.Println("resource not found — returning 404")
		}
	}
}`,
        keyTakeaways: [
          "Wrap errors at every layer: fmt.Errorf(\"context: %w\", err) adds call-site info",
          "Use %w (not %v or %s) to preserve the error chain for errors.Is / errors.As",
          "Include relevant IDs and parameters in the wrapper: getUser id=%d",
          "The wrapped chain forms a breadcrumb trail — handleRequest → fetchProfile → getUser",
          "For structured logs, use errors.As to extract typed error fields",
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 4. HTTP & Database
  // ─────────────────────────────────────────────────────────────
  {
    id: "http-database",
    title: "HTTP & Database",
    icon: "🌐",
    problems: [
      {
        id: "missing-timeout",
        title: "HTTP Client Without Timeout",
        difficulty: "Easy",
        description:
          "A microservice calls a downstream API using the default http.Client. Under a slow network or unresponsive upstream, the service hangs indefinitely — diagnose and fix.",
        category: "HTTP & Database",
        buggyCode: `package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type Quote struct {
	Symbol string
	Price  float64
}

func fetchQuote(symbol string) (*Quote, error) {
	url := fmt.Sprintf("https://api.example.com/quotes/%s", symbol)
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var q Quote
	if err := json.NewDecoder(resp.Body).Decode(&q); err != nil {
		return nil, err
	}
	return &q, nil
}

func main() {
	q, err := fetchQuote("AAPL")
	if err != nil {
		fmt.Println("error:", err)
		return
	}
	fmt.Printf("%s: $%.2f\\n", q.Symbol, q.Price)
}`,
        issues: [
          {
            severity: "Critical",
            title: "http.Get uses default client with no timeout",
            description:
              "http.DefaultClient has Timeout = 0, which means no timeout. If the upstream API hangs, this goroutine blocks forever, exhausting the thread pool. All downstream health checks start failing. Always create a named client with an explicit Timeout.",
          },
          {
            severity: "High",
            title: "No context propagation — caller cannot cancel the request",
            description:
              "http.Get does not accept a context. If the caller's HTTP request is cancelled (client disconnects), this downstream call continues running, wasting resources. Use http.NewRequestWithContext to propagate cancellation.",
          },
          {
            severity: "Medium",
            title: "Non-2xx responses treated as success",
            description:
              "If the API returns 404 or 500, resp.Body contains an error body but err is nil. json.Decode will fail (or decode partial data) and return a confusing error. Always check resp.StatusCode before decoding.",
          },
        ],
        annotatedCode: `package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type Quote struct {
	Symbol string
	Price  float64
}

func fetchQuote(symbol string) (*Quote, error) {
	url := fmt.Sprintf("https://api.example.com/quotes/%s", symbol)

	// ❌ ISSUE: http.Get uses http.DefaultClient which has Timeout = 0.
	// Zero means NO timeout — the call can block forever.
	// If the upstream is slow/down, this goroutine leaks indefinitely.
	// ✅ FIX: use a package-level http.Client with Timeout set,
	//         and pass a context for per-call cancellation.
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// ❌ ISSUE: resp.StatusCode is never checked.
	// A 404 or 500 response will reach json.Decode, which fails
	// with a confusing JSON parse error, not a "quote not found" error.
	// ✅ FIX: if resp.StatusCode != http.StatusOK { return nil, fmt.Errorf(...) }

	var q Quote
	if err := json.NewDecoder(resp.Body).Decode(&q); err != nil {
		return nil, err
	}
	return &q, nil
}

func main() {
	q, err := fetchQuote("AAPL")
	if err != nil {
		fmt.Println("error:", err)
		return
	}
	fmt.Printf("%s: $%.2f\\n", q.Symbol, q.Price)
}`,
        fixedCode: `package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Quote struct {
	Symbol string
	Price  float64
}

// Package-level client: reuse connections, explicit timeout.
var httpClient = &http.Client{
	Timeout: 5 * time.Second, // hard deadline on entire request lifecycle
}

func fetchQuote(ctx context.Context, symbol string) (*Quote, error) {
	url := fmt.Sprintf("https://api.example.com/quotes/%s", symbol)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("fetchQuote build request: %w", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetchQuote %s: %w", symbol, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetchQuote %s: unexpected status %d", symbol, resp.StatusCode)
	}

	var q Quote
	if err := json.NewDecoder(resp.Body).Decode(&q); err != nil {
		return nil, fmt.Errorf("fetchQuote %s decode: %w", symbol, err)
	}
	return &q, nil
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	q, err := fetchQuote(ctx, "AAPL")
	if err != nil {
		fmt.Println("error:", err)
		return
	}
	fmt.Printf("%s: $%.2f\\n", q.Symbol, q.Price)
}`,
        keyTakeaways: [
          "Never use http.DefaultClient in production — it has no timeout",
          "Create a package-level http.Client with an explicit Timeout field",
          "Use http.NewRequestWithContext so callers can cancel long requests",
          "Always check resp.StatusCode before decoding the body",
          "Reuse http.Client across calls — it manages a connection pool internally",
        ],
      },

      {
        id: "sql-injection",
        title: "SQL Injection via String Interpolation",
        difficulty: "Medium",
        description:
          "A user search endpoint builds SQL queries using fmt.Sprintf with user input. Demonstrate the injection, then fix it with parameterized queries.",
        category: "HTTP & Database",
        buggyCode: `package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"

	_ "github.com/lib/pq"
)

var db *sql.DB

func searchUsers(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")

	query := fmt.Sprintf(
		"SELECT id, name, email FROM users WHERE name LIKE '%%%s%%'",
		name,
	)

	rows, err := db.Query(query)
	if err != nil {
		http.Error(w, "query failed", 500)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var uname, email string
		rows.Scan(&id, &uname, &email)
		fmt.Fprintf(w, "%d %s %s\\n", id, uname, email)
	}
}

func main() {
	var err error
	db, err = sql.Open("postgres", "postgres://localhost/mydb")
	if err != nil {
		log.Fatal(err)
	}
	http.HandleFunc("/search", searchUsers)
	http.ListenAndServe(":8080", nil)
}`,
        issues: [
          {
            severity: "Critical",
            title: "SQL Injection — user input inserted directly into query string",
            description:
              "A request with name=' OR '1'='1 dumps the entire users table. name='; DROP TABLE users;-- deletes the table. name=' UNION SELECT password,login,null FROM admin_users-- exfiltrates credentials. Always use parameterized queries ($1 placeholder).",
          },
          {
            severity: "High",
            title: "rows.Scan errors silently discarded",
            description:
              "If Scan fails (type mismatch, null value), the error is ignored and zero-value variables are printed. Always check err from rows.Scan and rows.Err() after the loop.",
          },
          {
            severity: "Medium",
            title: "No input length limit — ReDoS / resource exhaustion",
            description:
              "An attacker can send a 1MB 'name' parameter. LIKE pattern matching on a large string can cause full table scans. Validate and limit input length at the handler boundary.",
          },
        ],
        annotatedCode: `package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"

	_ "github.com/lib/pq"
)

var db *sql.DB

func searchUsers(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")

	// ❌ CRITICAL: SQL INJECTION.
	// User-controlled 'name' is interpolated directly into the SQL string.
	//
	// Attack examples:
	//   name=' OR '1'='1      → dumps all users
	//   name='; DROP TABLE users;-- → destroys the table
	//   name=' UNION SELECT secret,token,null FROM api_keys-- → data exfil
	//
	// The database driver cannot distinguish query structure from data
	// when they are concatenated as a single string.
	// ✅ FIX: use parameterized query: db.Query("... WHERE name LIKE $1", "%"+name+"%")
	query := fmt.Sprintf(
		"SELECT id, name, email FROM users WHERE name LIKE '%%%s%%'",
		name,
	)

	rows, err := db.Query(query)
	if err != nil {
		http.Error(w, "query failed", 500)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var uname, email string
		// ❌ ISSUE: Scan error silently discarded.
		// If a column is NULL or the type doesn't match, scan fails
		// and id/uname/email are zero values — silently wrong output.
		rows.Scan(&id, &uname, &email)
		fmt.Fprintf(w, "%d %s %s\\n", id, uname, email)
	}
	// ❌ ISSUE: rows.Err() not checked.
	// If the server closed the connection mid-result, the loop exits
	// normally but rows.Err() is non-nil. Missing rows are silently dropped.
}

func main() {
	var err error
	db, err = sql.Open("postgres", "postgres://localhost/mydb")
	if err != nil {
		log.Fatal(err)
	}
	http.HandleFunc("/search", searchUsers)
	http.ListenAndServe(":8080", nil)
}`,
        fixedCode: `package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"

	_ "github.com/lib/pq"
)

var db *sql.DB

func searchUsers(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")

	// Validate input length — prevent resource exhaustion
	if len(name) > 100 {
		http.Error(w, "name too long", http.StatusBadRequest)
		return
	}

	// Parameterized query: $1 is a placeholder, not string interpolation.
	// The database driver sends query structure and data separately —
	// data can NEVER be interpreted as SQL syntax.
	rows, err := db.QueryContext(r.Context(),
		"SELECT id, name, email FROM users WHERE name ILIKE $1",
		"%"+name+"%", // value bound as data, not SQL
	)
	if err != nil {
		http.Error(w, "query failed", 500)
		log.Printf("searchUsers query: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var uname, email string
		if err := rows.Scan(&id, &uname, &email); err != nil {
			log.Printf("searchUsers scan: %v", err)
			http.Error(w, "scan failed", 500)
			return
		}
		fmt.Fprintf(w, "%d %s %s\\n", id, uname, email)
	}

	// Check for errors that occurred during iteration
	if err := rows.Err(); err != nil {
		log.Printf("searchUsers rows: %v", err)
		http.Error(w, "read failed", 500)
	}
}

func main() {
	var err error
	db, err = sql.Open("postgres", "postgres://localhost/mydb")
	if err != nil {
		log.Fatal(err)
	}
	http.HandleFunc("/search", searchUsers)
	http.ListenAndServe(":8080", nil)
}`,
        keyTakeaways: [
          "NEVER use fmt.Sprintf or string concatenation to build SQL — always parameterize",
          "Parameterized queries send SQL structure and data separately — injection is structurally impossible",
          "Use db.QueryContext with r.Context() to cancel DB queries when clients disconnect",
          "Always check rows.Err() after the loop — partial results are worse than errors",
          "Validate and limit all user input at the handler boundary before using it",
        ],
      },

      {
        id: "response-body-leak",
        title: "HTTP Response Body Not Closed",
        difficulty: "Easy",
        description:
          "A polling service makes frequent HTTP requests. Under load, the process hits 'too many open files' — find the resource leak and fix it.",
        category: "HTTP & Database",
        buggyCode: `package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type HealthStatus struct {
	Status string
}

func checkHealth(url string) (string, error) {
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("unhealthy: status %d", resp.StatusCode)
	}

	var status HealthStatus
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return "", err
	}

	return status.Status, nil
}

func main() {
	for {
		s, err := checkHealth("http://api.example.com/health")
		if err != nil {
			fmt.Println("error:", err)
		} else {
			fmt.Println("status:", s)
		}
		time.Sleep(1 * time.Second)
	}
}`,
        issues: [
          {
            severity: "Critical",
            title: "resp.Body never closed — file descriptor leak",
            description:
              "HTTP response bodies must always be closed to release the underlying TCP connection back to the pool. Without Close(), each request holds an open file descriptor. After ~1024 requests the OS hits the 'too many open files' limit and all new connections fail.",
          },
          {
            severity: "High",
            title: "Body not closed on non-200 status path",
            description:
              "The non-200 early return exits without closing resp.Body. Even if defer is added for the happy path, early returns must drain and close the body. Drain with io.Copy(io.Discard, resp.Body) before closing to reuse the TCP connection.",
          },
          {
            severity: "Medium",
            title: "Connection pool not reused when body is not drained",
            description:
              "Go's HTTP client reuses TCP connections only if the response body is fully read and closed. An undrained body forces a new TCP connection on every request — adding latency and burning ephemeral ports.",
          },
        ],
        annotatedCode: `package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type HealthStatus struct {
	Status string
}

func checkHealth(url string) (string, error) {
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	// ❌ ISSUE: resp.Body is NEVER closed.
	// Each call leaks one file descriptor (the TCP socket).
	// At 1 req/sec this hits the OS fd limit (~1024) in ~17 minutes.
	// ✅ FIX: add "defer resp.Body.Close()" immediately after checking err.

	if resp.StatusCode != http.StatusOK {
		// ❌ ISSUE: early return without closing body.
		// Even with a defer, if we return before defer is set up this leaks.
		// With defer in place, defer fires on this return too — that's correct.
		// But we should also drain: io.Copy(io.Discard, resp.Body)
		// so Go can reuse the TCP connection for the next request.
		return "", fmt.Errorf("unhealthy: status %d", resp.StatusCode)
	}

	var status HealthStatus
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		// ❌ ISSUE: early return on decode error — body not closed.
		return "", err
	}
	// ❌ ISSUE: function returns here without closing resp.Body.
	return status.Status, nil
}

func main() {
	for {
		s, err := checkHealth("http://api.example.com/health")
		if err != nil {
			fmt.Println("error:", err)
		} else {
			fmt.Println("status:", s)
		}
		time.Sleep(1 * time.Second)
	}
}`,
        fixedCode: `package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type HealthStatus struct {
	Status string
}

var httpClient = &http.Client{Timeout: 5 * time.Second}

func checkHealth(url string) (string, error) {
	resp, err := httpClient.Get(url)
	if err != nil {
		return "", fmt.Errorf("checkHealth GET: %w", err)
	}
	// FIX: defer Close() immediately after confirming resp is non-nil.
	// This fires on ALL return paths — happy path, error returns, panics.
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Drain the body so Go can reuse the TCP connection.
		io.Copy(io.Discard, resp.Body) //nolint:errcheck
		return "", fmt.Errorf("checkHealth: status %d", resp.StatusCode)
	}

	var status HealthStatus
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return "", fmt.Errorf("checkHealth decode: %w", err)
	}
	return status.Status, nil
}

func main() {
	for {
		s, err := checkHealth("http://api.example.com/health")
		if err != nil {
			fmt.Println("error:", err)
		} else {
			fmt.Println("status:", s)
		}
		time.Sleep(1 * time.Second)
	}
}`,
        keyTakeaways: [
          "Always defer resp.Body.Close() immediately after a successful http.Get/Do call",
          "defer fires on ALL return paths including error returns — place it early",
          "Drain non-2xx bodies with io.Copy(io.Discard, resp.Body) before closing to reuse connections",
          "Go reuses TCP connections only if the body is fully read AND closed",
          "Use a named http.Client with Timeout — never http.DefaultClient in production",
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 5. Go Idioms & Gotchas
  // ─────────────────────────────────────────────────────────────
  {
    id: "go-idioms",
    title: "Go Idioms & Gotchas",
    icon: "🐹",
    problems: [
      {
        id: "nil-map-write",
        title: "Write to Nil Map",
        difficulty: "Easy",
        description:
          "A session store initializes its struct but forgets to initialize the inner map. The first write panics at runtime — find the root cause and fix it.",
        category: "Go Idioms",
        buggyCode: `package main

import "fmt"

type SessionStore struct {
	sessions map[string]string
}

func NewSessionStore() *SessionStore {
	return &SessionStore{}
}

func (s *SessionStore) Set(id, value string) {
	s.sessions[id] = value
}

func (s *SessionStore) Get(id string) (string, bool) {
	v, ok := s.sessions[id]
	return v, ok
}

func main() {
	store := NewSessionStore()
	store.Set("user-1", "alice") // panic: assignment to entry in nil map
	fmt.Println(store.Get("user-1"))
}`,
        issues: [
          {
            severity: "Critical",
            title: "Nil map write causes runtime panic",
            description:
              "Reading from a nil map is safe (returns zero value + false). Writing to a nil map panics immediately: 'assignment to entry in nil map'. NewSessionStore() returns a struct with a zero-value map field, which is nil.",
          },
          {
            severity: "High",
            title: "Constructor does not initialize fields",
            description:
              "NewSessionStore() is the right pattern for constructors, but it returns an incomplete object. Any constructor that returns a struct with map/slice fields must initialize them with make().",
          },
        ],
        annotatedCode: `package main

import "fmt"

type SessionStore struct {
	sessions map[string]string
}

func NewSessionStore() *SessionStore {
	// ❌ ISSUE: &SessionStore{} creates a zero-value struct.
	// The zero value of a map is nil — NOT an empty map.
	// Reading nil map: safe, returns zero value.
	// Writing nil map: panic at runtime.
	// ✅ FIX: initialize with make: sessions: make(map[string]string)
	return &SessionStore{}
}

func (s *SessionStore) Set(id, value string) {
	// ❌ ISSUE: s.sessions is nil here — this line panics.
	// "panic: assignment to entry in nil map"
	s.sessions[id] = value
}

func (s *SessionStore) Get(id string) (string, bool) {
	// ✅ Reading a nil map is safe — returns "", false.
	// But it's still wrong design — sessions should always be initialized.
	v, ok := s.sessions[id]
	return v, ok
}

func main() {
	store := NewSessionStore()
	store.Set("user-1", "alice") // panics here
	fmt.Println(store.Get("user-1"))
}`,
        fixedCode: `package main

import (
	"fmt"
	"sync"
)

type SessionStore struct {
	mu       sync.RWMutex
	sessions map[string]string
}

func NewSessionStore() *SessionStore {
	return &SessionStore{
		sessions: make(map[string]string), // always initialize maps in constructors
	}
}

func (s *SessionStore) Set(id, value string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[id] = value
}

func (s *SessionStore) Get(id string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.sessions[id]
	return v, ok
}

func main() {
	store := NewSessionStore()
	store.Set("user-1", "alice")
	if v, ok := store.Get("user-1"); ok {
		fmt.Println(v) // alice
	}
}`,
        keyTakeaways: [
          "The zero value of a map is nil — reading is safe, writing panics",
          "Always use make(map[K]V) in constructors — never rely on zero-value maps",
          "Same applies to slices used as queues/stacks — initialize with make([]T, 0) or nil is OK since append handles nil slices",
          "Add a sync.RWMutex whenever a map is accessed from multiple goroutines",
          "go vet and -race catch some but not all nil map panics — unit tests are the best safety net",
        ],
      },

      {
        id: "interface-nil-trap",
        title: "Interface Nil Trap",
        difficulty: "Medium",
        description:
          "An error-checking helper returns nil but the caller's nil check passes even when an error exists — a classic Go interface gotcha. Explain why and fix it.",
        category: "Go Idioms",
        buggyCode: `package main

import "fmt"

type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

func validateAge(age int) *ValidationError {
	if age < 0 {
		return &ValidationError{Field: "age", Message: "must be >= 0"}
	}
	return nil
}

func validate(age int) error {
	return validateAge(age)
}

func main() {
	err := validate(10)
	if err != nil {
		fmt.Println("invalid:", err)
	} else {
		fmt.Println("valid") // we expect this
	}

	err2 := validate(-1)
	if err2 != nil {
		fmt.Println("invalid:", err2)
	} else {
		fmt.Println("valid") // bug: this prints even though age is -1
	}
}`,
        issues: [
          {
            severity: "Critical",
            title: "Typed nil returned as interface — interface is never nil",
            description:
              "validate() returns an error interface. validateAge() returns a *ValidationError (a concrete pointer type). When validateAge returns nil, it returns a typed nil (*ValidationError)(nil). When assigned to the error interface, the interface holds {type=*ValidationError, value=nil} — which is NOT equal to nil interface {type=nil, value=nil}. So err != nil is always true.",
          },
          {
            severity: "High",
            title: "validateAge should return error, not *ValidationError",
            description:
              "Functions that feed into an error interface should return error, not a concrete error type. This avoids the typed-nil trap entirely. The concrete type is only needed if the caller uses errors.As() to inspect it.",
          },
        ],
        annotatedCode: `package main

import "fmt"

type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

// ❌ ISSUE: returns *ValidationError (concrete pointer type), not error (interface).
// When this returns nil, it returns (*ValidationError)(nil) — a typed nil.
// A typed nil assigned to an interface creates a non-nil interface value.
func validateAge(age int) *ValidationError {
	if age < 0 {
		return &ValidationError{Field: "age", Message: "must be >= 0"}
	}
	return nil // this is (*ValidationError)(nil), NOT nil interface
}

func validate(age int) error {
	// ❌ ISSUE: assigning (*ValidationError)(nil) to error interface.
	// Result: error interface = { type: *ValidationError, value: nil }
	// This is NOT equal to nil (which is { type: nil, value: nil }).
	// So: err != nil is ALWAYS true, even for valid input.
	return validateAge(age)
}

func main() {
	err := validate(10)
	if err != nil {
		// ❌ BUG: this branch is taken for age=10 (valid input)
		// because the interface holds a typed nil, not a true nil.
		fmt.Println("invalid:", err) // prints "invalid: <nil>" — confusing
	}
}`,
        fixedCode: `package main

import "fmt"

type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

// FIX option 1: return error interface directly.
// nil return is now a true nil interface — no typed nil problem.
func validateAge(age int) error {
	if age < 0 {
		return &ValidationError{Field: "age", Message: "must be >= 0"}
	}
	return nil // true nil interface
}

func validate(age int) error {
	return validateAge(age)
}

// FIX option 2 (if caller needs concrete type):
// return (*ValidationError, bool) instead of error.
func validateAge2(age int) (*ValidationError, bool) {
	if age < 0 {
		return &ValidationError{Field: "age", Message: "must be >= 0"}, true
	}
	return nil, false
}

func main() {
	err := validate(10)
	if err != nil {
		fmt.Println("invalid:", err)
	} else {
		fmt.Println("valid") // correctly prints "valid"
	}

	err2 := validate(-1)
	if err2 != nil {
		fmt.Println("invalid:", err2) // correctly prints the error
	}
}`,
        keyTakeaways: [
          "An interface holds {type, value} — a typed nil gives {type=*T, value=nil} which != nil interface",
          "Functions returning errors should return the error interface, not concrete *ErrorType",
          "Rule: never return a concrete pointer type from a function that feeds into an error interface",
          "To extract the concrete type use errors.As() — it handles the typed nil case correctly",
          "This is one of the most common and subtle Go bugs in real codebases",
        ],
      },

      {
        id: "defer-in-loop",
        title: "Defer Inside a Loop",
        difficulty: "Medium",
        description:
          "A function opens and processes multiple files in a loop using defer to close them. Under load it exhausts file descriptors — explain why and fix it.",
        category: "Go Idioms",
        buggyCode: `package main

import (
	"bufio"
	"fmt"
	"os"
)

func processFiles(paths []string) error {
	for _, path := range paths {
		f, err := os.Open(path)
		if err != nil {
			return fmt.Errorf("open %s: %w", path, err)
		}
		defer f.Close() // intended to close after each iteration

		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			fmt.Println(scanner.Text())
		}
		if err := scanner.Err(); err != nil {
			return fmt.Errorf("scan %s: %w", path, err)
		}
	}
	return nil
}

func main() {
	files := []string{"a.txt", "b.txt", "c.txt"}
	if err := processFiles(files); err != nil {
		fmt.Println("error:", err)
	}
}`,
        issues: [
          {
            severity: "Critical",
            title: "defer in loop defers to function return, not loop iteration",
            description:
              "defer does not fire at the end of each loop iteration — it fires when the enclosing FUNCTION returns. With 1000 files, all 1000 file descriptors are open simultaneously until processFiles() returns. This exhausts the OS fd limit (~1024) mid-loop and causes open() to fail.",
          },
          {
            severity: "Medium",
            title: "File not closed on early error return",
            description:
              "When scanner.Err() triggers an early return, the defer is registered but the file for this iteration may have already been processed. The defer fires at function exit but all previous files are still open until then.",
          },
        ],
        annotatedCode: `package main

import (
	"bufio"
	"fmt"
	"os"
)

func processFiles(paths []string) error {
	for _, path := range paths {
		f, err := os.Open(path)
		if err != nil {
			return fmt.Errorf("open %s: %w", path, err)
		}
		// ❌ ISSUE: defer is scoped to the FUNCTION, not the loop body.
		// This does NOT close f at the end of this iteration.
		// Instead, all deferred closes queue up and fire when
		// processFiles() returns — potentially holding 1000s of open fds.
		// ✅ FIX: extract the loop body into a helper function so
		// defer fires correctly after each file.
		defer f.Close()

		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			fmt.Println(scanner.Text())
		}
		if err := scanner.Err(); err != nil {
			return fmt.Errorf("scan %s: %w", path, err)
		}
		// f is NOT closed here — it stays open for the entire function lifetime.
	}
	// All deferred f.Close() calls fire here — after all files were open simultaneously.
	return nil
}

func main() {
	files := []string{"a.txt", "b.txt", "c.txt"}
	if err := processFiles(files); err != nil {
		fmt.Println("error:", err)
	}
}`,
        fixedCode: `package main

import (
	"bufio"
	"fmt"
	"os"
)

// processOne handles a single file — defer fires when THIS function returns.
func processOne(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close() // fires correctly when processOne returns

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fmt.Println(scanner.Text())
	}
	return scanner.Err()
}

func processFiles(paths []string) error {
	for _, path := range paths {
		if err := processOne(path); err != nil {
			return fmt.Errorf("processFiles: %w", err)
		}
		// f is already closed here — only 1 fd open at a time
	}
	return nil
}

// Alternative: explicit close without defer (no helper needed).
func processFilesAlt(paths []string) error {
	for _, path := range paths {
		f, err := os.Open(path)
		if err != nil {
			return fmt.Errorf("open %s: %w", path, err)
		}

		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			fmt.Println(scanner.Text())
		}
		scanErr := scanner.Err()
		f.Close() // explicit close every iteration
		if scanErr != nil {
			return fmt.Errorf("scan %s: %w", path, scanErr)
		}
	}
	return nil
}

func main() {
	files := []string{"a.txt", "b.txt", "c.txt"}
	if err := processFiles(files); err != nil {
		fmt.Println("error:", err)
	}
}`,
        keyTakeaways: [
          "defer fires when the enclosing FUNCTION returns, not at the end of a block or loop",
          "Never use defer inside a loop to close resources — extract a helper function instead",
          "Alternative: explicit f.Close() at the bottom of the loop (no defer)",
          "With 1000 iterations, deferred closes open 1000 fds simultaneously — fd limit panic",
          "This applies to any resource: DB rows, network connections, mutexes (don't defer Unlock in loops)",
        ],
      },

      {
        id: "value-vs-pointer-receiver",
        title: "Value vs Pointer Receiver Mutation",
        difficulty: "Easy",
        description:
          "A counter struct uses value receivers to increment its count. Calls to Increment have no effect — explain Go's copy semantics and fix the receiver type.",
        category: "Go Idioms",
        buggyCode: `package main

import "fmt"

type Counter struct {
	count int
	name  string
}

func (c Counter) Increment() {
	c.count++
}

func (c Counter) Reset() {
	c.count = 0
}

func (c Counter) Value() int {
	return c.count
}

func (c Counter) SetName(name string) {
	c.name = name
}

func main() {
	c := Counter{name: "requests"}
	c.Increment()
	c.Increment()
	c.Increment()
	fmt.Println(c.Value()) // prints 0, not 3
	c.SetName("hits")
	fmt.Println(c.name) // prints "requests", not "hits"
}`,
        issues: [
          {
            severity: "Critical",
            title: "Value receiver — method operates on a copy, not the original",
            description:
              "Go passes a COPY of the struct to value receiver methods. c.count++ modifies the copy, which is discarded when the method returns. The original Counter is untouched. All mutating methods (Increment, Reset, SetName) must use pointer receivers.",
          },
          {
            severity: "Medium",
            title: "Mixing value and pointer receivers on the same type is confusing",
            description:
              "Go allows mixing, but it violates the convention: if any method mutates state, ALL methods should use pointer receivers. This ensures the method set is consistent and the type satisfies interfaces that include both mutating and read-only methods.",
          },
        ],
        annotatedCode: `package main

import "fmt"

type Counter struct {
	count int
	name  string
}

// ❌ ISSUE: value receiver — Go passes a copy of Counter.
// c.count++ modifies the LOCAL copy, not the caller's Counter.
// The increment is lost when the method returns.
// ✅ FIX: change to (c *Counter) to receive a pointer to the original.
func (c Counter) Increment() {
	c.count++ // modifies copy — caller sees no change
}

// ❌ ISSUE: same problem — Reset modifies a throwaway copy.
func (c Counter) Reset() {
	c.count = 0 // caller's c.count is unchanged
}

// ✅ Value receiver is OK here — Value() is read-only (no mutation).
// But for consistency with the rest of the type, pointer receiver is preferred.
func (c Counter) Value() int {
	return c.count
}

// ❌ ISSUE: SetName modifies a copy — c.name in caller is unchanged.
func (c Counter) SetName(name string) {
	c.name = name // lost on return
}

func main() {
	c := Counter{name: "requests"}
	c.Increment()
	c.Increment()
	c.Increment()
	fmt.Println(c.Value()) // 0 — all increments were discarded
	c.SetName("hits")
	fmt.Println(c.name) // "requests" — SetName had no effect
}`,
        fixedCode: `package main

import (
	"fmt"
	"sync"
)

type Counter struct {
	mu    sync.Mutex
	count int
	name  string
}

// All methods use pointer receivers — consistent and correct.

func (c *Counter) Increment() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.count++ // modifies the original Counter
}

func (c *Counter) Reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.count = 0
}

func (c *Counter) Value() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.count
}

func (c *Counter) SetName(name string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.name = name
}

func main() {
	c := &Counter{name: "requests"} // use pointer so methods work correctly
	c.Increment()
	c.Increment()
	c.Increment()
	fmt.Println(c.Value()) // 3
	c.SetName("hits")
	fmt.Println(c.name) // "hits"
}`,
        keyTakeaways: [
          "Value receivers receive a COPY — mutations are lost when the method returns",
          "Pointer receivers receive the address — mutations persist on the caller's struct",
          "Rule: if any method mutates state, all methods on that type should use pointer receivers",
          "Instantiate with &Counter{} (pointer) when your methods require pointer receivers",
          "Value receivers are fine for small, immutable structs (like time.Time) — use judgment",
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 6. Design Patterns
  // ─────────────────────────────────────────────────────────────
  {
    id: "design-patterns",
    title: "Design Patterns",
    icon: "🏗️",
    problems: [
      {
        id: "singleton-race",
        title: "Unsafe Singleton Initialization",
        difficulty: "Medium",
        description:
          "A config singleton uses a manual nil-check for lazy initialization. Under concurrent access it initializes multiple times — replace it with the correct Go idiom.",
        category: "Design Patterns",
        buggyCode: `package main

import (
	"fmt"
	"sync"
)

type Config struct {
	Host string
	Port int
}

var instance *Config

func GetConfig() *Config {
	if instance == nil {
		instance = &Config{Host: "localhost", Port: 8080}
		fmt.Println("Config initialized")
	}
	return instance
}

func main() {
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			cfg := GetConfig()
			_ = cfg
		}()
	}
	wg.Wait()
}`,
        issues: [
          {
            severity: "Critical",
            title: "Data race on nil check — multiple goroutines initialize simultaneously",
            description:
              "The if instance == nil check and the assignment instance = &Config{...} are not atomic. Two goroutines can both see nil and both create a Config. One overwrites the other, potentially discarding state. go test -race detects this as a data race.",
          },
          {
            severity: "High",
            title: "Double-checked locking without memory barriers is broken in Go",
            description:
              "Even wrapping with a mutex and re-checking inside is error-prone and verbose. Go's sync.Once is the idiomatic, safe, and efficient solution — it uses atomic operations internally and guarantees exactly-once execution.",
          },
        ],
        annotatedCode: `package main

import (
	"fmt"
	"sync"
)

type Config struct {
	Host string
	Port int
}

var instance *Config

func GetConfig() *Config {
	// ❌ ISSUE: DATA RACE.
	// Multiple goroutines read instance == nil concurrently.
	// Both can see nil and proceed to initialize.
	// This is a classic TOCTOU (time-of-check-time-of-use) race.
	// Detected by: go test -race
	if instance == nil {
		// ❌ ISSUE: two goroutines can both reach here simultaneously.
		// Both create a new Config, one overwrites the other.
		// If Config held state (DB connection, file handle), the
		// first one leaks — it's created and immediately discarded.
		instance = &Config{Host: "localhost", Port: 8080}
		fmt.Println("Config initialized") // may print multiple times
	}
	return instance
}

func main() {
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			cfg := GetConfig()
			_ = cfg
		}()
	}
	wg.Wait()
}`,
        fixedCode: `package main

import (
	"fmt"
	"sync"
)

type Config struct {
	Host string
	Port int
}

var (
	instance *Config
	once     sync.Once
)

func GetConfig() *Config {
	// sync.Once guarantees the function runs exactly once,
	// even under concurrent access. Internally uses atomic CAS.
	once.Do(func() {
		instance = &Config{Host: "localhost", Port: 8080}
		fmt.Println("Config initialized") // prints exactly once
	})
	return instance
}

// Alternative: initialize at package level (simplest for truly static config)
var globalConfig = &Config{Host: "localhost", Port: 8080}

func GetConfig2() *Config { return globalConfig }

func main() {
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			cfg := GetConfig()
			_ = cfg
		}()
	}
	wg.Wait()
}`,
        keyTakeaways: [
          "sync.Once is the idiomatic Go singleton — exactly-once, race-free, no boilerplate",
          "The nil-check pattern is a data race without a mutex protecting both check AND assignment",
          "Package-level var init runs once before main() — simplest option for static singletons",
          "For DB connection pools, prefer dependency injection over global singletons",
          "Always run go test -race in CI to catch initialization races early",
        ],
      },

      {
        id: "mutable-default-arg",
        title: "Shared Mutable Default in Options Struct",
        difficulty: "Medium",
        description:
          "A client library reuses a default Options struct across callers. One caller modifying options unexpectedly changes behavior for all other callers — find the aliasing bug.",
        category: "Design Patterns",
        buggyCode: `package main

import "fmt"

type Options struct {
	Headers map[string]string
	Timeout int
}

var defaultOptions = &Options{
	Headers: map[string]string{"Content-Type": "application/json"},
	Timeout: 30,
}

type Client struct {
	opts *Options
}

func NewClient(opts *Options) *Client {
	if opts == nil {
		opts = defaultOptions
	}
	return &Client{opts: opts}
}

func (c *Client) AddHeader(key, value string) {
	c.opts.Headers[key] = value
}

func main() {
	c1 := NewClient(nil) // uses defaultOptions
	c1.AddHeader("X-Request-ID", "abc-123")

	c2 := NewClient(nil) // also uses defaultOptions
	fmt.Println(c2.opts.Headers)
	// prints: map[Content-Type:application/json X-Request-ID:abc-123]
	// c2 was polluted by c1's mutation
}`,
        issues: [
          {
            severity: "Critical",
            title: "All nil-option clients share the same mutable map",
            description:
              "defaultOptions is a package-level pointer. All clients that pass nil receive the same *Options and the same Headers map. AddHeader on c1 mutates the shared map — c2, c3, and all future clients see c1's headers. This is a classic aliasing bug.",
          },
          {
            severity: "High",
            title: "Default should be copied, not shared",
            description:
              "When using a default Options, return a deep copy so each client has independent state. Maps and slices inside structs must be copied manually — a shallow struct copy still shares the inner map pointer.",
          },
        ],
        annotatedCode: `package main

import "fmt"

type Options struct {
	Headers map[string]string
	Timeout int
}

// ❌ ISSUE: package-level pointer to a mutable Options.
// All callers that receive this pointer share the SAME Headers map.
var defaultOptions = &Options{
	Headers: map[string]string{"Content-Type": "application/json"},
	Timeout: 30,
}

type Client struct {
	opts *Options
}

func NewClient(opts *Options) *Client {
	if opts == nil {
		// ❌ ISSUE: directly assigning the global pointer.
		// c.opts and defaultOptions.Headers point to the SAME map.
		// Any mutation via c.opts.Headers also mutates defaultOptions.Headers.
		// ✅ FIX: return a deep copy so each client owns its options.
		opts = defaultOptions
	}
	return &Client{opts: opts}
}

func (c *Client) AddHeader(key, value string) {
	// ❌ ISSUE: mutating the shared defaultOptions.Headers map.
	// All other clients that used nil opts now see this header.
	c.opts.Headers[key] = value
}

func main() {
	c1 := NewClient(nil)
	c1.AddHeader("X-Request-ID", "abc-123") // corrupts defaultOptions

	c2 := NewClient(nil)
	fmt.Println(c2.opts.Headers) // X-Request-ID appears — pollution from c1
}`,
        fixedCode: `package main

import "fmt"

type Options struct {
	Headers map[string]string
	Timeout int
}

func defaultOpts() *Options {
	return &Options{
		Headers: map[string]string{"Content-Type": "application/json"},
		Timeout: 30,
	}
}

// clone returns a deep copy of Options — each caller gets independent state.
func (o *Options) clone() *Options {
	headers := make(map[string]string, len(o.Headers))
	for k, v := range o.Headers {
		headers[k] = v
	}
	return &Options{Headers: headers, Timeout: o.Timeout}
}

type Client struct {
	opts *Options
}

func NewClient(opts *Options) *Client {
	if opts == nil {
		opts = defaultOpts() // fresh copy every time
	} else {
		opts = opts.clone() // defensive copy from caller-provided opts
	}
	return &Client{opts: opts}
}

func (c *Client) AddHeader(key, value string) {
	c.opts.Headers[key] = value // safe — c owns its own map
}

func main() {
	c1 := NewClient(nil)
	c1.AddHeader("X-Request-ID", "abc-123")

	c2 := NewClient(nil)
	fmt.Println(c2.opts.Headers)
	// map[Content-Type:application/json] — c2 is clean
}`,
        keyTakeaways: [
          "Structs containing maps or slices must be deep-copied — a struct copy only copies the pointer",
          "Default options should be functions (returning new instances), not package-level pointers",
          "Defensive copy: clone caller-provided options so internal mutations don't escape",
          "Immutable options pattern: build options once, then freeze — use functional options (WithX) instead of setters",
          "Document if a type is safe to share vs must be used by one owner",
        ],
      },

      {
        id: "observer-leak",
        title: "Observer Pattern — Listener Leak",
        difficulty: "Medium",
        description:
          "An event bus registers listeners but provides no way to unsubscribe. Long-running services accumulate stale listeners and memory grows unboundedly — design the fix.",
        category: "Design Patterns",
        buggyCode: `package main

import (
	"fmt"
	"sync"
)

type EventBus struct {
	mu        sync.RWMutex
	listeners map[string][]func(data interface{})
}

func NewEventBus() *EventBus {
	return &EventBus{listeners: make(map[string][]func(interface{}))}
}

func (b *EventBus) Subscribe(event string, fn func(interface{})) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.listeners[event] = append(b.listeners[event], fn)
}

func (b *EventBus) Publish(event string, data interface{}) {
	b.mu.RLock()
	fns := b.listeners[event]
	b.mu.RUnlock()
	for _, fn := range fns {
		fn(data)
	}
}

type Service struct {
	name string
}

func (s *Service) start(bus *EventBus) {
	bus.Subscribe("order.created", func(data interface{}) {
		fmt.Printf("[%s] order: %v\\n", s.name, data)
	})
}

func main() {
	bus := NewEventBus()
	for i := 0; i < 1000; i++ {
		svc := &Service{name: fmt.Sprintf("svc-%d", i)}
		svc.start(bus)
		// Service is done, but its listener lives in bus forever
	}
	bus.Publish("order.created", "order-42")
	// 1000 closures called — 999 are stale, holding svc references
}`,
        issues: [
          {
            severity: "Critical",
            title: "No Unsubscribe — listeners accumulate forever",
            description:
              "Every Subscribe call appends to a slice that is never trimmed. Even after a Service is no longer needed, its closure (and the *Service it captures) stays in the bus indefinitely. 1000 short-lived services = 1000 permanent listener entries and 1000 *Service allocations that cannot be GC'd.",
          },
          {
            severity: "High",
            title: "Publish holds RLock while calling listeners — blocks new subscriptions",
            description:
              "Publish takes RLock, copies the slice, then releases before calling handlers — that part is correct. But if a listener calls Subscribe inside its handler, it tries to acquire Lock while Publish holds RLock, causing a deadlock in the recursive case.",
          },
          {
            severity: "Medium",
            title: "No listener ID returned — impossible to unsubscribe specific listener",
            description:
              "Subscribe should return a unique token/ID that the caller can use to unsubscribe. Without an ID, you can only unsubscribe ALL listeners for an event, not a specific one.",
          },
        ],
        annotatedCode: `package main

import (
	"fmt"
	"sync"
)

type EventBus struct {
	mu        sync.RWMutex
	// ❌ ISSUE: listeners slice grows on every Subscribe and is never trimmed.
	// Each entry holds a closure which captures the subscriber struct.
	// GC cannot collect the subscriber as long as the bus holds the closure.
	listeners map[string][]func(data interface{})
}

func NewEventBus() *EventBus {
	return &EventBus{listeners: make(map[string][]func(interface{}))}
}

// ❌ ISSUE: Subscribe returns nothing.
// The caller has no handle to unsubscribe later.
// ✅ FIX: return a unique subscription ID (or an Unsubscribe func).
func (b *EventBus) Subscribe(event string, fn func(interface{})) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.listeners[event] = append(b.listeners[event], fn)
}

func (b *EventBus) Publish(event string, data interface{}) {
	b.mu.RLock()
	fns := b.listeners[event]
	b.mu.RUnlock()
	// ✅ Releasing lock before calling handlers is correct — avoids deadlock
	// if a handler calls Subscribe. But fns is a slice header pointing to
	// the backing array — if Subscribe grows the slice while we iterate,
	// we may call stale or new entries. Copy fns to be safe.
	for _, fn := range fns {
		fn(data)
	}
}

type Service struct {
	name string
}

func (s *Service) start(bus *EventBus) {
	// ❌ ISSUE: closure captures s (*Service).
	// Even after s goes out of scope in main, the closure in bus keeps s alive.
	bus.Subscribe("order.created", func(data interface{}) {
		fmt.Printf("[%s] order: %v\\n", s.name, data)
	})
}`,
        fixedCode: `package main

import (
	"fmt"
	"sync"
	"sync/atomic"
)

type subscription struct {
	id uint64
	fn func(interface{})
}

type EventBus struct {
	mu        sync.RWMutex
	listeners map[string][]*subscription
	nextID    atomic.Uint64
}

func NewEventBus() *EventBus {
	return &EventBus{listeners: make(map[string][]*subscription)}
}

// Subscribe returns an ID the caller uses to unsubscribe.
func (b *EventBus) Subscribe(event string, fn func(interface{})) uint64 {
	id := b.nextID.Add(1)
	b.mu.Lock()
	defer b.mu.Unlock()
	b.listeners[event] = append(b.listeners[event], &subscription{id: id, fn: fn})
	return id
}

// Unsubscribe removes the listener with the given ID.
func (b *EventBus) Unsubscribe(event string, id uint64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	subs := b.listeners[event]
	for i, s := range subs {
		if s.id == id {
			b.listeners[event] = append(subs[:i], subs[i+1:]...)
			return
		}
	}
}

func (b *EventBus) Publish(event string, data interface{}) {
	b.mu.RLock()
	// Copy the slice so we can release the lock before calling handlers.
	subs := make([]*subscription, len(b.listeners[event]))
	copy(subs, b.listeners[event])
	b.mu.RUnlock()

	for _, s := range subs {
		s.fn(data)
	}
}

type Service struct {
	name   string
	subID  uint64
	bus    *EventBus
}

func (s *Service) start() {
	s.subID = s.bus.Subscribe("order.created", func(data interface{}) {
		fmt.Printf("[%s] order: %v\\n", s.name, data)
	})
}

func (s *Service) stop() {
	s.bus.Unsubscribe("order.created", s.subID) // releases closure + *Service
}

func main() {
	bus := NewEventBus()
	svc := &Service{name: "svc-1", bus: bus}
	svc.start()
	bus.Publish("order.created", "order-42")
	svc.stop() // listener removed — svc can now be GC'd
}`,
        keyTakeaways: [
          "Always return an Unsubscribe handle (ID or func) from Subscribe — callers need a way out",
          "Listeners capture variables — a listener that outlives its owner prevents GC of that owner",
          "Copy the listener slice before releasing the lock, then call handlers without holding any lock",
          "Consider weak references or cleanup callbacks for auto-unsubscribe when subscriber is GC'd",
          "In production: use channel-based pubsub (NATS, Redis) rather than in-process buses for durability",
        ],
      },

      {
        id: "functional-options",
        title: "Constructor with Too Many Parameters",
        difficulty: "Easy",
        description:
          "A server constructor takes 8 positional parameters. Adding a 9th breaks all callers. Refactor using the functional options pattern — the standard Go idiom for optional config.",
        category: "Design Patterns",
        buggyCode: `package main

import "fmt"

type Server struct {
	host        string
	port        int
	timeout     int
	maxConns    int
	tls         bool
	logLevel    string
	readTimeout int
	writeTimeout int
}

func NewServer(
	host string,
	port int,
	timeout int,
	maxConns int,
	tls bool,
	logLevel string,
	readTimeout int,
	writeTimeout int,
) *Server {
	return &Server{
		host:         host,
		port:         port,
		timeout:      timeout,
		maxConns:     maxConns,
		tls:          tls,
		logLevel:     logLevel,
		readTimeout:  readTimeout,
		writeTimeout: writeTimeout,
	}
}

func main() {
	// ❌ All callers must pass ALL arguments in order — easy to mix up
	s := NewServer("localhost", 8080, 30, 100, false, "info", 5, 10)
	fmt.Printf("%+v\\n", s)
}`,
        issues: [
          {
            severity: "High",
            title: "Positional parameters — easy to mix up, impossible to have defaults",
            description:
              "NewServer(host, port, timeout, maxConns, tls, logLevel, readTimeout, writeTimeout) — passing 8 arguments in order is error-prone. Swapping timeout and maxConns compiles fine but produces wrong behavior. Adding a 9th param breaks every call site.",
          },
          {
            severity: "Medium",
            title: "No defaults — callers must always specify every option",
            description:
              "Most servers use the same timeout, maxConns, and logLevel. Positional constructors force every caller to re-specify them. Functional options let callers override only what differs from the default.",
          },
        ],
        annotatedCode: `package main

import "fmt"

type Server struct {
	host         string
	port         int
	timeout      int
	maxConns     int
	tls          bool
	logLevel     string
	readTimeout  int
	writeTimeout int
}

// ❌ ISSUE: 8 positional parameters — fragile, unreadable at call sites.
// Adding a 9th parameter means updating EVERY caller.
// Callers can't skip optional params or use defaults.
// What does NewServer("localhost", 8080, 30, 100, false, "info", 5, 10) mean?
// The reader must count args and match them to the parameter list.
func NewServer(
	host string,
	port int,
	timeout int,
	maxConns int,
	tls bool,
	logLevel string,
	readTimeout int,
	writeTimeout int,
) *Server {
	return &Server{
		host:         host,
		port:         port,
		timeout:      timeout,
		maxConns:     maxConns,
		tls:          tls,
		logLevel:     logLevel,
		readTimeout:  readTimeout,
		writeTimeout: writeTimeout,
	}
}

func main() {
	// ❌ ISSUE: Which is readTimeout, which is writeTimeout?
	// Which int is maxConns vs timeout? Impossible to tell from the call site.
	s := NewServer("localhost", 8080, 30, 100, false, "info", 5, 10)
	fmt.Printf("%+v\\n", s)
}`,
        fixedCode: `package main

import "fmt"

type Server struct {
	host         string
	port         int
	timeout      int
	maxConns     int
	tls          bool
	logLevel     string
	readTimeout  int
	writeTimeout int
}

// Option is a function that configures a Server.
type Option func(*Server)

// Each option is self-documenting at the call site.
func WithHost(host string) Option         { return func(s *Server) { s.host = host } }
func WithPort(port int) Option            { return func(s *Server) { s.port = port } }
func WithTimeout(t int) Option            { return func(s *Server) { s.timeout = t } }
func WithMaxConns(n int) Option           { return func(s *Server) { s.maxConns = n } }
func WithTLS(enabled bool) Option         { return func(s *Server) { s.tls = enabled } }
func WithLogLevel(level string) Option    { return func(s *Server) { s.logLevel = level } }
func WithReadTimeout(t int) Option        { return func(s *Server) { s.readTimeout = t } }
func WithWriteTimeout(t int) Option       { return func(s *Server) { s.writeTimeout = t } }

func NewServer(opts ...Option) *Server {
	// Sensible defaults — callers only specify what differs.
	s := &Server{
		host:         "localhost",
		port:         8080,
		timeout:      30,
		maxConns:     100,
		logLevel:     "info",
		readTimeout:  5,
		writeTimeout: 10,
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

func main() {
	// Call site is self-documenting — only override what you need.
	s := NewServer(
		WithHost("0.0.0.0"),
		WithPort(9090),
		WithTLS(true),
		WithLogLevel("debug"),
	)
	fmt.Printf("%+v\\n", s)
}`,
        keyTakeaways: [
          "Functional options (Option func(*T)) are the standard Go idiom for optional config",
          "Self-documenting at the call site — WithPort(9090) is clear, 9090 as 2nd arg is not",
          "Adding new options is backwards-compatible — no existing callers need updating",
          "Provide defaults in NewServer so callers only override what differs",
          "Used in stdlib (http.Server), gRPC, zap — well-understood by all Go engineers",
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 7. Database & Query Issues
  // ─────────────────────────────────────────────────────────────
  {
    id: "database-queries",
    title: "Database & Query Issues",
    icon: "🗄️",
    problems: [
      {
        id: "n-plus-one",
        title: "N+1 Query Problem",
        difficulty: "Medium",
        description:
          "An order listing endpoint executes one query per order to fetch user details. With 500 orders it fires 501 queries — identify the N+1 and rewrite with a JOIN or batch fetch.",
        category: "Database",
        buggyCode: `package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

type User struct {
	ID   int
	Name string
}

type Order struct {
	ID     int
	UserID int
	Amount float64
	User   *User
}

var db *sql.DB

func getOrders() ([]*Order, error) {
	rows, err := db.Query("SELECT id, user_id, amount FROM orders LIMIT 500")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []*Order
	for rows.Next() {
		o := &Order{}
		if err := rows.Scan(&o.ID, &o.UserID, &o.Amount); err != nil {
			return nil, err
		}

		// Fetch user for each order — 1 query per order = N+1 total
		var u User
		err := db.QueryRow(
			"SELECT id, name FROM users WHERE id = $1", o.UserID,
		).Scan(&u.ID, &u.Name)
		if err != nil {
			return nil, err
		}
		o.User = &u
		orders = append(orders, o)
	}
	return orders, rows.Err()
}

func main() {
	orders, err := getOrders()
	if err != nil {
		log.Fatal(err)
	}
	for _, o := range orders {
		fmt.Printf("Order %d by %s: $%.2f\\n", o.ID, o.User.Name, o.Amount)
	}
}`,
        issues: [
          {
            severity: "Critical",
            title: "N+1 queries — 1 list query + N per-row queries",
            description:
              "For 500 orders: 1 SELECT on orders + 500 SELECT on users = 501 round-trips. Each round-trip adds ~1ms latency. Total: ~500ms added to response time. A JOIN or batch IN-clause resolves all data in 1-2 queries.",
          },
          {
            severity: "High",
            title: "Same user may be fetched multiple times",
            description:
              "If 50 orders belong to the same user, that user is fetched 50 times. A user ID cache (map[int]*User) within the request cuts redundant fetches. A JOIN eliminates them entirely.",
          },
        ],
        annotatedCode: `package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

type User struct {
	ID   int
	Name string
}

type Order struct {
	ID     int
	UserID int
	Amount float64
	User   *User
}

var db *sql.DB

func getOrders() ([]*Order, error) {
	// ✅ 1 query to fetch all orders — this part is fine.
	rows, err := db.Query("SELECT id, user_id, amount FROM orders LIMIT 500")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []*Order
	for rows.Next() {
		o := &Order{}
		if err := rows.Scan(&o.ID, &o.UserID, &o.Amount); err != nil {
			return nil, err
		}

		// ❌ ISSUE: N+1 QUERY — one extra DB round-trip per order.
		// For 500 orders: 500 additional queries = 501 total.
		// Each query adds ~1ms latency: +500ms to response time.
		// If user 42 has 50 orders, user 42 is fetched 50 times.
		//
		// ✅ FIX option 1: JOIN in the main query
		//   SELECT o.id, o.user_id, o.amount, u.id, u.name
		//   FROM orders o JOIN users u ON u.id = o.user_id
		//
		// ✅ FIX option 2: batch fetch
		//   Collect all userIDs, then: SELECT * FROM users WHERE id = ANY($1)
		var u User
		err := db.QueryRow(
			"SELECT id, name FROM users WHERE id = $1", o.UserID,
		).Scan(&u.ID, &u.Name)
		if err != nil {
			return nil, err
		}
		o.User = &u
		orders = append(orders, o)
	}
	return orders, rows.Err()
}`,
        fixedCode: `package main

import (
	"database/sql"
	"fmt"
	"log"

	"github.com/lib/pq"
	_ "github.com/lib/pq"
)

type User struct{ ID int; Name string }
type Order struct {
	ID     int
	UserID int
	Amount float64
	User   *User
}

var db *sql.DB

// FIX: JOIN approach — 1 query, 0 N+1.
func getOrdersJoin() ([]*Order, error) {
	rows, err := db.Query(`+"`"+`
		SELECT o.id, o.user_id, o.amount, u.id, u.name
		FROM orders o
		JOIN users u ON u.id = o.user_id
		LIMIT 500`+"`"+`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []*Order
	for rows.Next() {
		o := &Order{User: &User{}}
		if err := rows.Scan(&o.ID, &o.UserID, &o.Amount, &o.User.ID, &o.User.Name); err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	return orders, rows.Err()
}

// FIX: batch fetch approach — 2 queries, deduplicates users.
func getOrdersBatch() ([]*Order, error) {
	rows, err := db.Query("SELECT id, user_id, amount FROM orders LIMIT 500")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []*Order
	userIDs := map[int]bool{}
	for rows.Next() {
		o := &Order{}
		rows.Scan(&o.ID, &o.UserID, &o.Amount)
		orders = append(orders, o)
		userIDs[o.UserID] = true
	}

	ids := make([]int, 0, len(userIDs))
	for id := range userIDs {
		ids = append(ids, id)
	}

	// Single query for all unique users
	urows, err := db.Query("SELECT id, name FROM users WHERE id = ANY($1)", pq.Array(ids))
	if err != nil {
		return nil, err
	}
	defer urows.Close()

	users := map[int]*User{}
	for urows.Next() {
		u := &User{}
		urows.Scan(&u.ID, &u.Name)
		users[u.ID] = u
	}

	for _, o := range orders {
		o.User = users[o.UserID]
	}
	return orders, nil
}

func main() {
	orders, err := getOrdersJoin()
	if err != nil {
		log.Fatal(err)
	}
	for _, o := range orders {
		fmt.Printf("Order %d by %s: $%.2f\\n", o.ID, o.User.Name, o.Amount)
	}
}`,
        keyTakeaways: [
          "N+1 = 1 list query + N per-row queries — O(N) round-trips, kills latency at scale",
          "Fix with JOIN (1 query) or batch IN/ANY (2 queries, deduplicates users)",
          "Use a request-scoped user cache map[int]*User to avoid re-fetching same user",
          "ORM tools (GORM, sqlx) have N+1 issues too — use Preload/Joins explicitly",
          "Detect with slow query logs: sudden jump from 1 to 501 queries per endpoint",
        ],
      },

      {
        id: "missing-transaction",
        title: "Multi-Step Operation Without Transaction",
        difficulty: "Medium",
        description:
          "A transfer function debits one account and credits another with two separate queries. If the process crashes between them, money is lost — add a transaction.",
        category: "Database",
        buggyCode: `package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

var db *sql.DB

func transfer(fromID, toID int, amount float64) error {
	// Step 1: debit source
	_, err := db.Exec(
		"UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND balance >= $1",
		amount, fromID,
	)
	if err != nil {
		return fmt.Errorf("debit: %w", err)
	}

	// ← process could crash here, money is debited but not credited

	// Step 2: credit destination
	_, err = db.Exec(
		"UPDATE accounts SET balance = balance + $1 WHERE id = $2",
		amount, toID,
	)
	if err != nil {
		return fmt.Errorf("credit: %w", err)
	}

	return nil
}

func main() {
	if err := transfer(1, 2, 500.00); err != nil {
		log.Fatal(err)
	}
	fmt.Println("transfer complete")
}`,
        issues: [
          {
            severity: "Critical",
            title: "No transaction — crash between steps loses money",
            description:
              "If the process crashes, network drops, or DB connection fails after the debit but before the credit, account 1 loses $500 with no corresponding credit to account 2. The two UPDATEs must be atomic — either both commit or both rollback.",
          },
          {
            severity: "High",
            title: "No check that debit actually affected a row",
            description:
              "If account fromID doesn't exist or has insufficient funds, the WHERE clause filters it out — 0 rows affected, no error. The credit still runs and adds money to toID from nowhere. Always check sql.Result.RowsAffected() after conditional updates.",
          },
          {
            severity: "Medium",
            title: "Deadlock risk when two transfers run concurrently",
            description:
              "transfer(A→B) and transfer(B→A) running concurrently: A locks row A, B locks row B, then each waits for the other's lock — deadlock. Fix: always lock accounts in consistent order (lower ID first) within the transaction.",
          },
        ],
        annotatedCode: `package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

var db *sql.DB

func transfer(fromID, toID int, amount float64) error {
	// ❌ ISSUE: NO TRANSACTION.
	// The debit and credit are separate, independent queries.
	// If anything fails between them: data inconsistency (money lost or created).
	// ✅ FIX: wrap both in db.BeginTx, defer tx.Rollback(), commit at end.

	// Step 1: debit
	result, err := db.Exec(
		"UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND balance >= $1",
		amount, fromID,
	)
	if err != nil {
		return fmt.Errorf("debit: %w", err)
	}

	// ❌ ISSUE: not checking RowsAffected.
	// If balance < amount, WHERE balance >= $1 filters the row out.
	// 0 rows affected, no error — but money was NOT debited.
	// The credit below still runs and adds money to toID out of thin air.
	_ = result

	// ← CRASH HERE: debit committed, credit never runs. $500 lost.

	// Step 2: credit
	_, err = db.Exec(
		"UPDATE accounts SET balance = balance + $1 WHERE id = $2",
		amount, toID,
	)
	if err != nil {
		return fmt.Errorf("credit: %w", err)
	}

	return nil
}`,
        fixedCode: `package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

var db *sql.DB

func transfer(ctx context.Context, fromID, toID int, amount float64) error {
	// Consistent lock order prevents deadlocks between concurrent transfers.
	if fromID > toID {
		fromID, toID = toID, fromID
	}

	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() // no-op if Commit already called

	// Debit with explicit row-level lock
	result, err := tx.ExecContext(ctx,
		"UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND balance >= $1",
		amount, fromID,
	)
	if err != nil {
		return fmt.Errorf("debit: %w", err)
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return fmt.Errorf("insufficient funds or account %d not found", fromID)
	}

	// Credit
	result, err = tx.ExecContext(ctx,
		"UPDATE accounts SET balance = balance + $1 WHERE id = $2",
		amount, toID,
	)
	if err != nil {
		return fmt.Errorf("credit: %w", err)
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return fmt.Errorf("destination account %d not found", toID)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

func main() {
	if err := transfer(context.Background(), 1, 2, 500.00); err != nil {
		log.Fatal(err)
	}
	fmt.Println("transfer complete")
}`,
        keyTakeaways: [
          "Multi-step mutations must be in a transaction — atomicity is non-negotiable for money",
          "Always defer tx.Rollback() immediately after BeginTx — it's a no-op after Commit",
          "Check RowsAffected() on conditional UPDATEs — 0 rows with no error is a silent failure",
          "Use Serializable isolation for financial transactions to prevent phantom reads",
          "Lock rows in consistent ID order to prevent deadlocks between concurrent transfers",
        ],
      },

      {
        id: "missing-index",
        title: "Unindexed Column in Hot Query Path",
        difficulty: "Hard",
        description:
          "An API endpoint filtering orders by status runs fine with 1k rows but causes full table scans at 10M rows. Identify the missing index and explain the query plan.",
        category: "Database",
        buggyCode: `package main

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "github.com/lib/pq"
)

var db *sql.DB

// Called on every page load — high frequency endpoint
func getPendingOrders(userID int) ([]int, error) {
	start := time.Now()

	rows, err := db.Query(
		"SELECT id FROM orders WHERE user_id = $1 AND status = 'pending'",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		rows.Scan(&id)
		ids = append(ids, id)
	}

	log.Printf("getPendingOrders took %v, found %d", time.Since(start), len(ids))
	return ids, rows.Err()
}

// Schema (missing critical index):
// CREATE TABLE orders (
//   id        SERIAL PRIMARY KEY,
//   user_id   INT NOT NULL,
//   status    VARCHAR(20) NOT NULL,
//   amount    DECIMAL,
//   created_at TIMESTAMP
// );`,
        issues: [
          {
            severity: "Critical",
            title: "Full table scan on 10M rows — no index on (user_id, status)",
            description:
              "Without an index, Postgres scans every row in the orders table to find matches. At 10M rows this is 100ms+ per query. A composite index on (user_id, status) allows an index scan returning results in <1ms. This is the most common production performance disaster.",
          },
          {
            severity: "High",
            title: "Composite index order matters — user_id must come first",
            description:
              "The query filters on both user_id and status. The index (user_id, status) lets Postgres go straight to user 42's rows, then filter by status. The index (status, user_id) is much less selective as 'pending' spans millions of rows across all users.",
          },
          {
            severity: "Medium",
            title: "No EXPLAIN ANALYZE in development — issues caught late in production",
            description:
              "EXPLAIN ANALYZE shows Seq Scan vs Index Scan, rows estimated vs actual, and cost. Running it before deployment catches missing indexes before they become production fires.",
          },
        ],
        annotatedCode: `package main

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "github.com/lib/pq"
)

var db *sql.DB

func getPendingOrders(userID int) ([]int, error) {
	start := time.Now()

	// ❌ ISSUE: This query runs fine on 1k rows.
	// On 10M rows without an index, Postgres does a SEQUENTIAL SCAN:
	// - Reads every page of the orders table from disk
	// - Filters each row for user_id=$1 AND status='pending'
	// - Cost: O(N) where N = total rows = ~100ms+ at 10M rows
	//
	// EXPLAIN ANALYZE output (no index, 10M rows):
	//   Seq Scan on orders (cost=0.00..250000 rows=1234 width=4)
	//   Actual time=0.042..198.231 rows=23 loops=1
	//
	// ✅ FIX: CREATE INDEX idx_orders_user_status ON orders(user_id, status);
	// EXPLAIN ANALYZE after index:
	//   Index Scan using idx_orders_user_status on orders
	//   Index Cond: ((user_id = 42) AND (status = 'pending'))
	//   Actual time=0.045..0.112 rows=23 loops=1
	rows, err := db.Query(
		"SELECT id FROM orders WHERE user_id = $1 AND status = 'pending'",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		// ❌ ISSUE: Scan error not checked
		rows.Scan(&id)
		ids = append(ids, id)
	}

	log.Printf("getPendingOrders took %v, found %d", time.Since(start), len(ids))
	return ids, rows.Err()
}

// ❌ ISSUE: Schema has no index on (user_id, status).
// CREATE TABLE orders (
//   id        SERIAL PRIMARY KEY,  -- B-tree index on id only
//   user_id   INT NOT NULL,        -- NO INDEX
//   status    VARCHAR(20) NOT NULL, -- NO INDEX
//   ...
// );`,
        fixedCode: `-- Migration: add the composite index
-- Run on the live DB (CONCURRENTLY avoids table lock):
CREATE INDEX CONCURRENTLY idx_orders_user_status
  ON orders(user_id, status)
  WHERE status != 'completed'; -- partial index: excludes bulk of rows

-- Why (user_id, status) and not (status, user_id)?
-- user_id is high-cardinality (1 per user), status is low-cardinality ('pending', 'paid', 'completed').
-- Leading with the high-cardinality column narrows results much faster.

-- EXPLAIN ANALYZE before index (10M rows):
-- Seq Scan on orders  (actual time=98..198 ms, rows=23)

-- EXPLAIN ANALYZE after index:
-- Index Scan using idx_orders_user_status  (actual time=0.08..0.12 ms, rows=23)
-- 1000x speedup.

-- For "pending" orders specifically, a partial index is even faster:
-- Only indexes rows WHERE status = 'pending' (smaller, faster, maintained only on relevant writes)`,
        keyTakeaways: [
          "Missing indexes are the #1 cause of production DB performance fires",
          "Always run EXPLAIN ANALYZE before deploying queries that touch large tables",
          "Composite index column order matters: high-cardinality (user_id) first, low-cardinality (status) second",
          "Use CREATE INDEX CONCURRENTLY in production to avoid locking the table",
          "Partial indexes (WHERE status != 'completed') are smaller and faster for skewed data",
        ],
      },

      {
        id: "connection-pool",
        title: "Database Connection Pool Misconfiguration",
        difficulty: "Hard",
        description:
          "A service opens a new DB connection per request and never limits the pool. Under load it exhausts Postgres's connection limit — configure the pool correctly.",
        category: "Database",
        buggyCode: `package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"

	_ "github.com/lib/pq"
)

func newDB() *sql.DB {
	db, err := sql.Open("postgres", "postgres://localhost/mydb")
	if err != nil {
		log.Fatal(err)
	}
	return db
}

func handler(w http.ResponseWriter, r *http.Request) {
	// Opens a new connection (or reuses from pool) on every request
	db := newDB()
	// ❌ ISSUE: db is never closed — connection pool leaks
	// ❌ ISSUE: no pool size limits configured

	row := db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM orders")
	var count int
	row.Scan(&count)
	fmt.Fprintf(w, "orders: %d\\n", count)
}

func main() {
	http.HandleFunc("/", handler)
	log.Fatal(http.ListenAndServe(":8080", nil))
}`,
        issues: [
          {
            severity: "Critical",
            title: "sql.Open called per request — creates a new pool each time, leaks connections",
            description:
              "sql.Open creates a new connection pool. Creating a pool per request means each request's connections are never returned to a shared pool — they leak. At 100 RPS, 100 pools are opened per second, quickly hitting Postgres's max_connections (default 100).",
          },
          {
            severity: "Critical",
            title: "No pool size limits — unconstrained connections exhaust Postgres",
            description:
              "Without SetMaxOpenConns, Go's sql.DB opens unlimited connections. Under load, 1000 goroutines each waiting for a query = 1000 open connections. Postgres hits max_connections and starts refusing new ones with 'too many connections'.",
          },
          {
            severity: "High",
            title: "No SetMaxIdleConns / ConnMaxLifetime — idle connections waste resources",
            description:
              "Without MaxIdleConns, Go keeps all opened connections idle after use. 1000 concurrent requests = 1000 idle connections after the burst, each consuming memory on both client and server. Set MaxIdleConns <= MaxOpenConns and ConnMaxLifetime to recycle stale connections.",
          },
        ],
        annotatedCode: `package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"

	_ "github.com/lib/pq"
)

// ❌ ISSUE: newDB() creates a NEW connection pool on every call.
// sql.Open allocates a new *sql.DB (a new pool manager).
// A pool is meant to be shared across the application — not per-request.
func newDB() *sql.DB {
	db, err := sql.Open("postgres", "postgres://localhost/mydb")
	if err != nil {
		log.Fatal(err)
	}
	// ❌ ISSUE: no pool limits configured.
	// Default: MaxOpenConns=0 (unlimited), MaxIdleConns=2.
	// Unlimited open connections under load = Postgres max_connections exceeded.
	return db
}

func handler(w http.ResponseWriter, r *http.Request) {
	// ❌ ISSUE: creating a new pool per request.
	// 1000 concurrent requests = 1000 separate pools.
	// Each pool has its own idle connections that never go away.
	db := newDB()
	// ❌ ISSUE: db.Close() never called — pool leaks permanently.
	// Even if Close was called, creating per-request pools is still wrong.

	row := db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM orders")
	var count int
	row.Scan(&count) // Scan error also discarded
	fmt.Fprintf(w, "orders: %d\\n", count)
}`,
        fixedCode: `package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"time"

	_ "github.com/lib/pq"
)

// Package-level singleton — ONE pool shared by all requests.
var db *sql.DB

func initDB() {
	var err error
	db, err = sql.Open("postgres", "postgres://localhost/mydb?sslmode=disable")
	if err != nil {
		log.Fatal("sql.Open:", err)
	}

	// Tuning guide:
	// MaxOpenConns: cap total connections to DB. Rule of thumb: num_cpu * 4, or
	// match Postgres max_connections / num_app_instances.
	db.SetMaxOpenConns(25)

	// MaxIdleConns: keep warm connections ready. Set <= MaxOpenConns.
	// Higher = faster response under burst. Lower = fewer idle resources.
	db.SetMaxIdleConns(10)

	// ConnMaxLifetime: rotate connections to avoid stale TCP sessions and
	// spread reconnect load. 5 minutes is a common production value.
	db.SetConnMaxLifetime(5 * time.Minute)

	// ConnMaxIdleTime: drop idle connections sooner than the lifetime.
	db.SetConnMaxIdleTime(1 * time.Minute)

	// Verify connectivity at startup — fail fast.
	if err := db.Ping(); err != nil {
		log.Fatal("db.Ping:", err)
	}
}

func handler(w http.ResponseWriter, r *http.Request) {
	// Borrow a connection from the shared pool — returns it automatically.
	row := db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM orders")
	var count int
	if err := row.Scan(&count); err != nil {
		http.Error(w, "query failed", 500)
		return
	}
	fmt.Fprintf(w, "orders: %d\\n", count)
}

func main() {
	initDB()
	http.HandleFunc("/", handler)
	log.Fatal(http.ListenAndServe(":8080", nil))
}`,
        keyTakeaways: [
          "sql.Open creates a pool — call it ONCE at startup, share the *sql.DB globally",
          "SetMaxOpenConns: prevents exhausting Postgres max_connections under load",
          "SetMaxIdleConns: keeps N warm connections ready for bursts, should be <= MaxOpenConns",
          "SetConnMaxLifetime: rotates connections to avoid stale TCP and distribute reconnects",
          "Call db.Ping() at startup to fail fast if DB is unreachable before traffic hits",
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 8. Observability & Production
  // ─────────────────────────────────────────────────────────────
  {
    id: "observability",
    title: "Observability & Production",
    icon: "📊",
    problems: [
      {
        id: "logging-secrets",
        title: "Sensitive Data in Logs",
        difficulty: "Easy",
        description:
          "An auth handler logs the full request body including passwords and tokens. Identify every leak and implement safe structured logging.",
        category: "Observability",
        buggyCode: `package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

type LoginRequest struct {
	Username string
	Password string
	Token    string
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("decode error: %v", err)
		http.Error(w, "bad request", 400)
		return
	}

	// Log the incoming request for debugging
	log.Printf("login attempt: %+v", req)

	// Validate
	if req.Username == "" || req.Password == "" {
		log.Printf("validation failed for user %s, password=%s", req.Username, req.Password)
		http.Error(w, "missing credentials", 400)
		return
	}

	// Simulate auth
	if req.Password != "secret" {
		log.Printf("auth failed: user=%s pass=%s token=%s", req.Username, req.Password, req.Token)
		http.Error(w, "unauthorized", 401)
		return
	}

	fmt.Fprintln(w, "ok")
}

func main() {
	http.HandleFunc("/login", loginHandler)
	http.ListenAndServe(":8080", nil)
}`,
        issues: [
          {
            severity: "Critical",
            title: "Password logged in plaintext — OWASP A09 Security Logging Failure",
            description:
              "log.Printf(\"login attempt: %+v\", req) dumps the full struct including Password and Token to logs. Logs are stored long-term, often shipped to ELK/Datadog/Splunk, and accessible to many engineers. Plaintext passwords in logs is a critical security violation and likely a compliance breach (PCI-DSS, SOC2).",
          },
          {
            severity: "Critical",
            title: "Token logged — session hijacking risk",
            description:
              "Auth tokens in logs allow any log reader to impersonate users. Logs should NEVER contain bearer tokens, API keys, session IDs, or any secret material. Always redact or omit these fields.",
          },
          {
            severity: "High",
            title: "Structured logging missing — hard to query, parse, and alert on",
            description:
              "fmt-style log strings are hard to index, filter, and alert on. Use structured logging (slog, zap, zerolog) with key-value pairs so logs are queryable: log.With('user', req.Username).Error('auth failed').",
          },
        ],
        annotatedCode: `package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

type LoginRequest struct {
	Username string
	Password string
	Token    string
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("decode error: %v", err)
		http.Error(w, "bad request", 400)
		return
	}

	// ❌ CRITICAL: logs password and token in plaintext.
	// "%+v" prints all struct fields including Password and Token.
	// This appears in every log shipper, every log archive, forever.
	// Anyone with log access can steal credentials.
	log.Printf("login attempt: %+v", req) // Password=secret Token=eyJhb...

	if req.Username == "" || req.Password == "" {
		// ❌ CRITICAL: explicitly logging the password in the message.
		// Even "validation failed" logs should never include credential values.
		log.Printf("validation failed for user %s, password=%s", req.Username, req.Password)
		http.Error(w, "missing credentials", 400)
		return
	}

	if req.Password != "secret" {
		// ❌ CRITICAL: three secrets logged in one line.
		// user= is OK. pass= and token= are critical violations.
		log.Printf("auth failed: user=%s pass=%s token=%s", req.Username, req.Password, req.Token)
		http.Error(w, "unauthorized", 401)
		return
	}

	fmt.Fprintln(w, "ok")
}`,
        fixedCode: `package main

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
)

type LoginRequest struct {
	Username string
	Password string // never log this
	Token    string // never log this
}

var logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
	Level: slog.LevelInfo,
}))

func loginHandler(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logger.Error("decode failed", "error", err)
		http.Error(w, "bad request", 400)
		return
	}

	// Log only non-sensitive fields: username, request_id, IP.
	// Never log: password, token, card number, SSN, email (depends on policy).
	logger.Info("login attempt", "username", req.Username, "ip", r.RemoteAddr)

	if req.Username == "" || req.Password == "" {
		logger.Warn("validation failed", "username", req.Username, "reason", "missing credentials")
		// Note: we log that credentials are missing but NOT their values.
		http.Error(w, "missing credentials", 400)
		return
	}

	if req.Password != "secret" {
		logger.Warn("auth failed", "username", req.Username)
		// Do NOT log the wrong password — it may be a typo of the real one.
		// Do NOT log the token — it may be valid for another user.
		http.Error(w, "unauthorized", 401)
		return
	}

	logger.Info("login success", "username", req.Username)
	fmt.Fprintln(w, "ok")
}

func main() {
	http.HandleFunc("/login", loginHandler)
	if err := http.ListenAndServe(":8080", nil); err != nil {
		logger.Error("server error", "error", err)
	}
}`,
        keyTakeaways: [
          "Never log: passwords, tokens, API keys, card numbers, SSNs, or raw PII",
          "Never use %+v or %v on structs that contain sensitive fields — log fields explicitly",
          "Use structured logging (slog, zap, zerolog) — key-value pairs are queryable and auditable",
          "Log the username (for audit) but never the credential value — even wrong passwords",
          "Add a log audit to your security review checklist before every release",
        ],
      },

      {
        id: "panic-recovery",
        title: "Missing Panic Recovery in HTTP Handler",
        difficulty: "Medium",
        description:
          "A nil pointer dereference in one handler crashes the entire HTTP server process. Add middleware-level panic recovery so one bad request cannot take down the service.",
        category: "Observability",
        buggyCode: `package main

import (
	"fmt"
	"net/http"
)

type User struct {
	Name string
}

func getUser(id string) *User {
	if id == "admin" {
		return &User{Name: "Admin"}
	}
	return nil // user not found
}

func profileHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	user := getUser(id)
	// No nil check — panics when user is nil
	fmt.Fprintf(w, "Hello, %s\\n", user.Name)
}

func adminHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, "admin page")
}

func main() {
	http.HandleFunc("/profile", profileHandler)
	http.HandleFunc("/admin", adminHandler)
	// GET /profile?id=unknown → panic → entire server crashes
	// All users lose access until the process is restarted
	http.ListenAndServe(":8080", nil)
}`,
        issues: [
          {
            severity: "Critical",
            title: "Nil pointer dereference crashes the entire server process",
            description:
              "user.Name on a nil *User panics. In Go's net/http, each request runs in its own goroutine. A panic in a handler goroutine that is not recovered propagates up and crashes the entire process. All in-flight requests are dropped and the service is down until restart.",
          },
          {
            severity: "High",
            title: "No nil check on pointer returned from getUser",
            description:
              "getUser can return nil (user not found). The caller must check before dereferencing. Returning (*User, error) or (*User, bool) forces the caller to handle the not-found case explicitly.",
          },
          {
            severity: "Medium",
            title: "No recovery middleware — panic from any handler brings down all handlers",
            description:
              "Even if this handler is fixed, the next nil dereference or index out of bounds in any handler would crash the server. A recovery middleware at the top of the handler chain catches any panic, logs it with stack trace, and returns 500 to the client.",
          },
        ],
        annotatedCode: `package main

import (
	"fmt"
	"net/http"
)

type User struct {
	Name string
}

func getUser(id string) *User {
	if id == "admin" {
		return &User{Name: "Admin"}
	}
	// ❌ ISSUE: returns nil with no indication of why.
	// Callers must remember to nil-check — easy to forget.
	// ✅ FIX: return (*User, error) or (*User, bool) to force callers to handle it.
	return nil
}

func profileHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	user := getUser(id)

	// ❌ ISSUE: no nil check before dereferencing user.
	// GET /profile?id=unknown: user == nil → user.Name panics.
	// The panic propagates up through net/http's goroutine.
	// net/http does NOT recover panics by default (before Go 1.22).
	// Result: the entire server process crashes.
	fmt.Fprintf(w, "Hello, %s\\n", user.Name)
}

func adminHandler(w http.ResponseWriter, r *http.Request) {
	// ❌ ISSUE: even this working handler becomes unavailable
	// when profileHandler panics — the whole process dies.
	fmt.Fprintln(w, "admin page")
}

func main() {
	http.HandleFunc("/profile", profileHandler)
	http.HandleFunc("/admin", adminHandler)
	// No recovery middleware — one panic = full outage.
	http.ListenAndServe(":8080", nil)
}`,
        fixedCode: `package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"runtime/debug"
)

var logger = slog.New(slog.NewJSONHandler(os.Stderr, nil))

type User struct {
	Name string
}

func getUser(id string) (*User, bool) {
	if id == "admin" {
		return &User{Name: "Admin"}, true
	}
	return nil, false // explicit not-found
}

// recoveryMiddleware catches any panic in downstream handlers,
// logs the stack trace, and returns 500 — server keeps running.
func recoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				stack := debug.Stack()
				logger.Error("handler panic",
					"error", fmt.Sprintf("%v", err),
					"stack", string(stack),
					"path", r.URL.Path,
				)
				http.Error(w, "internal server error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func profileHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	user, ok := getUser(id)
	if !ok {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	fmt.Fprintf(w, "Hello, %s\\n", user.Name)
}

func adminHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, "admin page")
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/profile", profileHandler)
	mux.HandleFunc("/admin", adminHandler)

	// Wrap all handlers with recovery middleware.
	http.ListenAndServe(":8080", recoveryMiddleware(mux))
}`,
        keyTakeaways: [
          "A panic in a handler goroutine crashes the entire server — always add recovery middleware",
          "Use recover() in a deferred function — recover() only works inside a deferred call",
          "Log the full stack trace with debug.Stack() so the panic source is traceable",
          "Return (*T, bool) or (*T, error) instead of *T to force callers to handle nil",
          "Add recovery middleware once at the top of the handler chain, not in every handler",
        ],
      },

      {
        id: "missing-context-deadline",
        title: "Context Without Deadline Propagation",
        difficulty: "Hard",
        description:
          "A service chains three downstream calls — DB, cache, and external API. The outer HTTP request has a 5s deadline but the downstream calls ignore context — they outlive the cancelled request.",
        category: "Observability",
        buggyCode: `package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"time"
)

var db *sql.DB

func fetchUserFromDB(userID int) (string, error) {
	// Uses context.Background() — ignores caller's deadline
	row := db.QueryRowContext(context.Background(),
		"SELECT name FROM users WHERE id = $1", userID,
	)
	var name string
	return name, row.Scan(&name)
}

func fetchFromCache(userID int) (string, bool) {
	// Simulates a cache call with no context
	time.Sleep(100 * time.Millisecond)
	return "", false
}

func callExternalAPI(userID int) error {
	// HTTP call with no timeout and no context
	resp, err := http.Get(fmt.Sprintf("https://api.example.com/user/%d", userID))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func userHandler(w http.ResponseWriter, r *http.Request) {
	// r.Context() has the server's 5s deadline set by middleware
	ctx := r.Context()
	_ = ctx // context is received but never passed to downstream calls

	name, err := fetchUserFromDB(1)
	if err != nil {
		http.Error(w, "db error", 500)
		return
	}

	if _, ok := fetchFromCache(1); !ok {
		if err := callExternalAPI(1); err != nil {
			http.Error(w, "api error", 500)
			return
		}
	}

	fmt.Fprintf(w, "user: %s\\n", name)
}`,
        issues: [
          {
            severity: "Critical",
            title: "Downstream calls use context.Background() — deadline not propagated",
            description:
              "r.Context() carries the client's cancellation signal and any server-imposed deadline. fetchUserFromDB uses context.Background() — if the client disconnects or the 5s deadline fires, the DB query keeps running, burning DB connections for dead requests. Pass ctx to every downstream call.",
          },
          {
            severity: "High",
            title: "ctx is received but immediately discarded with _ = ctx",
            description:
              "This is a common code smell: the context is passed in but never used. A linter (contextcheck, revive) catches this. If you accept a context parameter, you must pass it to all downstream calls.",
          },
          {
            severity: "High",
            title: "http.Get has no context — outlives request cancellation",
            description:
              "http.Get does not accept a context. If the downstream API is slow and the client disconnects, the HTTP call continues for its full timeout. Use http.NewRequestWithContext(ctx, ...) so the request is cancelled when ctx is cancelled.",
          },
        ],
        annotatedCode: `package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"time"
)

var db *sql.DB

func fetchUserFromDB(userID int) (string, error) {
	// ❌ ISSUE: context.Background() ignores the caller's deadline and cancellation.
	// If the HTTP request is cancelled at 5s, this DB query continues running.
	// It holds a DB connection, burns CPU on Postgres, and returns a result
	// that nobody will use. Under load: wasted connections = degraded DB.
	// ✅ FIX: accept ctx context.Context as first parameter, pass it to QueryRowContext.
	row := db.QueryRowContext(context.Background(),
		"SELECT name FROM users WHERE id = $1", userID,
	)
	var name string
	return name, row.Scan(&name)
}

func callExternalAPI(userID int) error {
	// ❌ ISSUE: http.Get has no context — cannot be cancelled.
	// Even if the caller's context is Done (deadline exceeded or client gone),
	// this HTTP call will run to completion (or its own timeout).
	// ✅ FIX: http.NewRequestWithContext(ctx, ...) so cancellation propagates.
	resp, err := http.Get(fmt.Sprintf("https://api.example.com/user/%d", userID))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func userHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context() // carries 5s server deadline
	// ❌ ISSUE: ctx is received but thrown away immediately.
	// None of the downstream functions receive it.
	// This is a code smell that contextcheck linter catches.
	_ = ctx

	// Downstream calls all use Background() or no context — deadline not propagated.
	name, err := fetchUserFromDB(1)
	_ = name
	_ = err
	_ = time.Second // unused import suppression
}`,
        fixedCode: `package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"time"
)

var db *sql.DB
var httpClient = &http.Client{Timeout: 3 * time.Second}

// FIX: accept context as first parameter (Go convention).
func fetchUserFromDB(ctx context.Context, userID int) (string, error) {
	row := db.QueryRowContext(ctx, // propagates caller's deadline
		"SELECT name FROM users WHERE id = $1", userID,
	)
	var name string
	return name, row.Scan(&name)
}

func fetchFromCache(ctx context.Context, userID int) (string, bool) {
	// In a real impl: redisClient.Get(ctx, key)
	// Simulated:
	select {
	case <-ctx.Done():
		return "", false // respect cancellation
	case <-time.After(10 * time.Millisecond):
		return "", false
	}
}

func callExternalAPI(ctx context.Context, userID int) error {
	url := fmt.Sprintf("https://api.example.com/user/%d", userID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("API call: %w", err)
	}
	defer resp.Body.Close()
	return nil
}

func userHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context() // 5s server deadline included

	// Check context before each step — fail fast if already cancelled
	if err := ctx.Err(); err != nil {
		http.Error(w, "request cancelled", http.StatusRequestTimeout)
		return
	}

	name, err := fetchUserFromDB(ctx, 1) // ctx passed through
	if err != nil {
		if ctx.Err() != nil {
			http.Error(w, "timeout", http.StatusGatewayTimeout)
			return
		}
		http.Error(w, "db error", 500)
		return
	}

	if _, ok := fetchFromCache(ctx, 1); !ok {
		if err := callExternalAPI(ctx, 1); err != nil {
			http.Error(w, "api error", 500)
			return
		}
	}

	fmt.Fprintf(w, "user: %s\\n", name)
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/user", userHandler)
	http.ListenAndServe(":8080", mux)
}`,
        keyTakeaways: [
          "Always propagate context through the entire call chain — every downstream call gets ctx",
          "context.Background() in a handler is almost always wrong — use r.Context()",
          "ctx as the first parameter is Go's convention for all functions that do I/O",
          "Use http.NewRequestWithContext for all outbound HTTP calls — not http.Get",
          "Install contextcheck linter to catch '_ = ctx' and context.Background() in handlers",
        ],
      },

      {
        id: "missing-metrics",
        title: "Handler with No Observability",
        difficulty: "Hard",
        description:
          "A payment handler has no latency tracking, error counting, or tracing. In production you cannot tell if it is slow, failing, or behaving abnormally — add structured observability.",
        category: "Observability",
        buggyCode: `package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

type PaymentRequest struct {
	UserID int
	Amount float64
}

func processPayment(req PaymentRequest) error {
	// Simulates payment processing
	return nil
}

func paymentHandler(w http.ResponseWriter, r *http.Request) {
	var req PaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", 400)
		return
	}

	if err := processPayment(req); err != nil {
		log.Printf("payment failed: %v", err)
		http.Error(w, "payment failed", 500)
		return
	}

	fmt.Fprintln(w, "payment ok")
}

func main() {
	http.HandleFunc("/pay", paymentHandler)
	http.ListenAndServe(":8080", nil)
}`,
        issues: [
          {
            severity: "High",
            title: "No latency tracking — cannot detect slowdowns",
            description:
              "Without timing, you cannot know if processPayment takes 5ms or 5s. When payments slow down at 3am, you have no data to debug. Record start/end time and emit a histogram or log duration on every request.",
          },
          {
            severity: "High",
            title: "No error rate metrics — cannot alert on payment failures",
            description:
              "Errors are logged but not counted. You cannot set an alert for 'error rate > 1%'. Use Prometheus counters or structured log fields that a log-based alert can trigger on.",
          },
          {
            severity: "Medium",
            title: "No request tracing — cannot follow a single payment across services",
            description:
              "Without a trace ID, you cannot correlate logs from the payment handler to downstream DB calls, fraud checks, and external gateway calls. Add a request ID to all log lines and propagate it via context.",
          },
          {
            severity: "Medium",
            title: "Unstructured log format — hard to query and alert on",
            description:
              "log.Printf produces plain strings. Splunk/Datadog/ELK need regex to parse them. Structured JSON logs (slog/zap) produce {\"level\":\"error\",\"handler\":\"payment\",\"error\":\"...\",\"user_id\":42} — directly queryable.",
          },
        ],
        annotatedCode: `package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

type PaymentRequest struct {
	UserID int
	Amount float64
}

func processPayment(req PaymentRequest) error {
	return nil
}

func paymentHandler(w http.ResponseWriter, r *http.Request) {
	// ❌ ISSUE: no start time recorded — cannot measure latency.
	// Is this handler p50=5ms or p99=3s? No way to know without timing.

	var req PaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// ❌ ISSUE: no metrics increment on 4xx error.
		// Cannot alert: "decode errors spiking — bad client deployment".
		http.Error(w, "bad request", 400)
		return
	}

	if err := processPayment(req); err != nil {
		// ❌ ISSUE: unstructured log — hard to query.
		// "payment failed: <error>" has no user_id, no request_id, no amount.
		// Correlating this log with the DB query that failed is impossible.
		log.Printf("payment failed: %v", err)

		// ❌ ISSUE: no error counter metric.
		// Cannot set alert: payment_errors_total > 10 per minute.
		http.Error(w, "payment failed", 500)
		return
	}

	// ❌ ISSUE: no success metric, no latency emitted.
	// On-call has no dashboard to verify the handler is healthy.
	fmt.Fprintln(w, "payment ok")
}`,
        fixedCode: `package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"
)

var logger = slog.New(slog.NewJSONHandler(os.Stdout, nil))

type PaymentRequest struct {
	UserID int
	Amount float64
}

func processPayment(ctx context.Context, req PaymentRequest) error {
	return nil
}

// requestIDMiddleware injects a unique request ID into every context and response.
func requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := r.Header.Get("X-Request-ID")
		if reqID == "" {
			reqID = fmt.Sprintf("%d", time.Now().UnixNano())
		}
		ctx := context.WithValue(r.Context(), "request_id", reqID)
		w.Header().Set("X-Request-ID", reqID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func paymentHandler(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	ctx := r.Context()
	reqID, _ := ctx.Value("request_id").(string)

	base := logger.With(
		"handler", "payment",
		"request_id", reqID,
		"method", r.Method,
	)

	var req PaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		base.Warn("decode failed", "error", err)
		// In production: increment payment_decode_errors_total counter here
		http.Error(w, "bad request", 400)
		return
	}

	base = base.With("user_id", req.UserID, "amount", req.Amount)
	base.Info("payment started")

	if err := processPayment(ctx, req); err != nil {
		duration := time.Since(start)
		base.Error("payment failed",
			"error", err,
			"duration_ms", duration.Milliseconds(),
		)
		// In production: increment payment_errors_total{reason="processing"} counter
		http.Error(w, "payment failed", 500)
		return
	}

	duration := time.Since(start)
	base.Info("payment success",
		"duration_ms", duration.Milliseconds(),
	)
	// In production: observe payment_duration_seconds histogram
	// In production: increment payment_success_total counter

	fmt.Fprintln(w, "payment ok")
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/pay", paymentHandler)
	// Prometheus metrics endpoint: /metrics
	http.ListenAndServe(":8080", requestIDMiddleware(mux))
}`,
        keyTakeaways: [
          "Record start := time.Now() at handler entry — emit duration on every code path",
          "Use structured logging (slog/zap) — key-value fields are queryable in any log system",
          "Add request_id to every log line — enables correlating logs across the full call chain",
          "Emit Prometheus counters for success, error, and latency histogram per handler",
          "Four golden signals: latency, traffic, errors, saturation — instrument all four",
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 9. Business Logic Bugs
  // ─────────────────────────────────────────────────────────────
  {
    id: "business-logic",
    title: "Business Logic Bugs",
    icon: "💼",
    problems: [
      {
        id: "discount-stacking",
        title: "Coupon Stacking Allows Unlimited Discounts",
        difficulty: "Medium",
        description:
          "An e-commerce checkout applies coupons one at a time. A customer combines a 'first order' coupon with a 'seasonal sale' coupon and gets the order for free — find the business rule gap.",
        category: "Business Logic",
        buggyCode: `package main

import "fmt"

type Coupon struct {
	Code           string
	DiscountPct    float64 // 0.10 = 10% off
	FirstOrderOnly bool
}

type Order struct {
	Subtotal   float64
	IsFirstOrder bool
}

func applyCoupon(order *Order, coupon Coupon) float64 {
	if coupon.FirstOrderOnly && !order.IsFirstOrder {
		return order.Subtotal // not eligible, no discount
	}
	discount := order.Subtotal * coupon.DiscountPct
	order.Subtotal -= discount
	return order.Subtotal
}

func checkout(order *Order, coupons []Coupon) float64 {
	for _, c := range coupons {
		applyCoupon(order, c)
	}
	return order.Subtotal
}

func main() {
	order := &Order{Subtotal: 1000, IsFirstOrder: true}
	coupons := []Coupon{
		{Code: "FIRST20", DiscountPct: 0.20, FirstOrderOnly: true},
		{Code: "SUMMER30", DiscountPct: 0.30},
		{Code: "FLASH25", DiscountPct: 0.25},
	}
	final := checkout(order, coupons)
	fmt.Printf("final total: %.2f\\n", final) // 315.00 — three coupons stacked!
}`,
        issues: [
          {
            severity: "Critical",
            title: "No limit on number of coupons applied — discounts compound multiplicatively",
            description:
              "checkout loops through ALL coupons and applies each one sequentially to the already-discounted subtotal. 1000 → 800 (20% off) → 560 (30% off of 800) → 420 (25% off of 560). Three coupons combine into an effective 58% discount. Most businesses allow exactly ONE coupon per order — this logic has no such guard.",
          },
          {
            severity: "High",
            title: "Discount applied to already-discounted subtotal (compounding)",
            description:
              "Even if multiple coupons were intentionally allowed, applying % discounts sequentially to a shrinking subtotal compounds them multiplicatively rather than additively. 20%+30%+25% should arguably mean 75% off the ORIGINAL price (capped at some max), not a compounded 58%.",
          },
          {
            severity: "Medium",
            title: "No floor on final price — order could become free or negative",
            description:
              "With enough stacked coupons, Subtotal can reach zero or go negative. There's no MinOrderValue or floor check. A customer could theoretically get paid to checkout.",
          },
        ],
        annotatedCode: `package main

import "fmt"

type Coupon struct {
	Code           string
	DiscountPct    float64
	FirstOrderOnly bool
}

type Order struct {
	Subtotal     float64
	IsFirstOrder bool
}

func applyCoupon(order *Order, coupon Coupon) float64 {
	if coupon.FirstOrderOnly && !order.IsFirstOrder {
		return order.Subtotal
	}
	// ❌ ISSUE: discount computed against the CURRENT (already discounted)
	// subtotal. Sequential application compounds discounts multiplicatively:
	// 1000 * 0.8 * 0.7 * 0.75 = 420 (58% off), not 1000 * (1 - 0.2 - 0.3 - 0.25) = 250
	// Neither interpretation may be intended — the real bug is allowing 3 at all.
	discount := order.Subtotal * coupon.DiscountPct
	order.Subtotal -= discount
	// ❌ ISSUE: no floor check — Subtotal could reach 0 or go negative
	// with enough coupons (e.g., a 4th 50% coupon on top of these).
	return order.Subtotal
}

func checkout(order *Order, coupons []Coupon) float64 {
	// ❌ CRITICAL: BUSINESS LOGIC GAP — no limit on coupon count.
	// Real checkout systems allow exactly ONE promotional code per order
	// (sometimes a small whitelist of "stackable" combos).
	// This loop blindly applies every coupon the client sends.
	// A malicious or confused customer can submit an array of ALL
	// known coupon codes and get the maximum possible discount.
	// ✅ FIX: validate at most one non-stackable coupon; explicitly
	// define which combinations are allowed to stack.
	for _, c := range coupons {
		applyCoupon(order, c)
	}
	return order.Subtotal
}

func main() {
	order := &Order{Subtotal: 1000, IsFirstOrder: true}
	coupons := []Coupon{
		{Code: "FIRST20", DiscountPct: 0.20, FirstOrderOnly: true},
		{Code: "SUMMER30", DiscountPct: 0.30},
		{Code: "FLASH25", DiscountPct: 0.25},
	}
	final := checkout(order, coupons)
	fmt.Printf("final total: %.2f\\n", final) // 315.00 — should likely be 800.00 (one coupon)
}`,
        fixedCode: `package main

import (
	"fmt"
	"sort"
)

type Coupon struct {
	Code           string
	DiscountPct    float64
	FirstOrderOnly bool
	Stackable      bool // explicitly marked — most coupons are NOT
}

type Order struct {
	Subtotal     float64
	IsFirstOrder bool
}

const minOrderValue = 50.00 // floor — order can never be discounted below this

// eligibleCoupons filters out coupons the order doesn't qualify for.
func eligibleCoupons(order *Order, coupons []Coupon) []Coupon {
	var eligible []Coupon
	for _, c := range coupons {
		if c.FirstOrderOnly && !order.IsFirstOrder {
			continue
		}
		eligible = append(eligible, c)
	}
	return eligible
}

// checkout applies AT MOST ONE coupon (the best one for the customer),
// unless coupons are explicitly marked Stackable.
func checkout(order *Order, coupons []Coupon) (float64, string) {
	eligible := eligibleCoupons(order, coupons)
	if len(eligible) == 0 {
		return order.Subtotal, ""
	}

	var stackable, single []Coupon
	for _, c := range eligible {
		if c.Stackable {
			stackable = append(stackable, c)
		} else {
			single = append(single, c)
		}
	}

	applied := []string{}
	original := order.Subtotal

	if len(stackable) > 0 {
		// Stackable coupons apply additively against the ORIGINAL subtotal —
		// not compounded against each other.
		var totalPct float64
		for _, c := range stackable {
			totalPct += c.DiscountPct
			applied = append(applied, c.Code)
		}
		if totalPct > 0.5 {
			totalPct = 0.5 // cap total stackable discount at 50%
		}
		order.Subtotal = original * (1 - totalPct)
	} else {
		// Pick the single BEST coupon for the customer — highest discount.
		sort.Slice(single, func(i, j int) bool {
			return single[i].DiscountPct > single[j].DiscountPct
		})
		best := single[0]
		order.Subtotal = original * (1 - best.DiscountPct)
		applied = append(applied, best.Code)
	}

	// Floor: never discount below minOrderValue
	if order.Subtotal < minOrderValue {
		order.Subtotal = minOrderValue
	}

	return order.Subtotal, fmt.Sprintf("%v", applied)
}

func main() {
	order := &Order{Subtotal: 1000, IsFirstOrder: true}
	coupons := []Coupon{
		{Code: "FIRST20", DiscountPct: 0.20, FirstOrderOnly: true},
		{Code: "SUMMER30", DiscountPct: 0.30},
		{Code: "FLASH25", DiscountPct: 0.25},
	}
	final, applied := checkout(order, coupons)
	fmt.Printf("final total: %.2f, coupons applied: %s\\n", final, applied)
	// final total: 700.00, coupons applied: [SUMMER30] — best single coupon only
}`,
        keyTakeaways: [
          "Always model business rules explicitly — 'one coupon per order' must be enforced in code, not assumed",
          "Mark which combinations are intentionally stackable; default to non-stackable",
          "Sequential percentage discounts compound multiplicatively — decide additive vs multiplicative explicitly",
          "Always add a floor/ceiling to discount calculations — never trust unbounded loops over user input",
          "When in doubt, pick the single best offer for the customer rather than applying all of them",
        ],
      },

      {
        id: "date-range-boundary",
        title: "Off-by-One in Date Range Filter",
        difficulty: "Easy",
        description:
          "A 'transactions this month' report silently excludes the last day's transactions. Customers report missing data at month-end — find the boundary bug.",
        category: "Business Logic",
        buggyCode: `package main

import (
	"fmt"
	"time"
)

type Transaction struct {
	ID     int
	Amount float64
	When   time.Time
}

// monthRange returns [start, end) for the given year/month.
func monthRange(year int, month time.Month) (time.Time, time.Time) {
	start := time.Date(year, month, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC) // last day of month
	return start, end
}

func transactionsInMonth(txs []Transaction, year int, month time.Month) []Transaction {
	start, end := monthRange(year, month)
	var result []Transaction
	for _, tx := range txs {
		if tx.When.After(start) && tx.When.Before(end) {
			result = append(result, tx)
		}
	}
	return result
}

func main() {
	txs := []Transaction{
		{ID: 1, Amount: 100, When: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)},
		{ID: 2, Amount: 200, When: time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC)},
		{ID: 3, Amount: 300, When: time.Date(2026, 1, 31, 23, 59, 0, 0, time.UTC)},
	}
	jan := transactionsInMonth(txs, 2026, time.January)
	fmt.Println(len(jan)) // 1 — should be 3! Jan 1 and Jan 31 are silently dropped
}`,
        issues: [
          {
            severity: "Critical",
            title: "tx.When.After(start) excludes transactions exactly at midnight on day 1",
            description:
              "After() is a strict inequality — a transaction timestamped exactly 2026-01-01 00:00:00 is NOT 'after' that same instant. Any transaction recorded at the precise start of the month is silently dropped from the report. Use !Before(start) (i.e. >=) for an inclusive lower bound.",
          },
          {
            severity: "Critical",
            title: "end computed as last day at 00:00 — entire last day excluded",
            description:
              "time.Date(year, month+1, 0, ...) yields the last DAY of the month at midnight (e.g. Jan 31 00:00:00). tx.When.Before(end) excludes anything on Jan 31 after midnight — i.e., the ENTIRE last day. The intended range [Jan 1, Feb 1) should use the first day of the NEXT month as the exclusive end.",
          },
          {
            severity: "High",
            title: "Mismatched comparison operators create an inconsistent half-open interval",
            description:
              "The code mixes After (exclusive) and Before (exclusive), producing an OPEN interval (start, end) when the comment claims [start, end). For date ranges, the standard, bug-resistant pattern is: !before(start) && before(end), i.e. [start, end).",
          },
        ],
        annotatedCode: `package main

import (
	"fmt"
	"time"
)

type Transaction struct {
	ID     int
	Amount float64
	When   time.Time
}

// monthRange returns [start, end) for the given year/month.
func monthRange(year int, month time.Month) (time.Time, time.Time) {
	start := time.Date(year, month, 1, 0, 0, 0, 0, time.UTC)
	// ❌ ISSUE: day=0 rolls back to the LAST DAY of the previous month
	// relative to 'month+1' — i.e., the last day of THIS month at 00:00:00.
	// For January: end = Jan 31 00:00:00.
	// Anything from Jan 31 00:00:01 onward is excluded — the whole last day!
	// ✅ FIX: end should be the FIRST day of the next month:
	//   end := time.Date(year, month+1, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC)
	return start, end
}

func transactionsInMonth(txs []Transaction, year int, month time.Month) []Transaction {
	start, end := monthRange(year, month)
	var result []Transaction
	for _, tx := range txs {
		// ❌ ISSUE: After(start) is a STRICT inequality (>).
		// A transaction at exactly start (Jan 1 00:00:00.000) is excluded
		// because it is not strictly "after" itself.
		// ❌ ISSUE: Before(end) is also strict (<), and combined with the
		// wrong 'end' value above, drops the entire last day.
		// ✅ FIX: use !tx.When.Before(start) && tx.When.Before(end)
		// This forms the standard half-open interval [start, end).
		if tx.When.After(start) && tx.When.Before(end) {
			result = append(result, tx)
		}
	}
	return result
}

func main() {
	txs := []Transaction{
		{ID: 1, Amount: 100, When: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)},
		{ID: 2, Amount: 200, When: time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC)},
		{ID: 3, Amount: 300, When: time.Date(2026, 1, 31, 23, 59, 0, 0, time.UTC)},
	}
	jan := transactionsInMonth(txs, 2026, time.January)
	fmt.Println(len(jan)) // 1 — txs 1 and 3 silently missing from the report
}`,
        fixedCode: `package main

import (
	"fmt"
	"time"
)

type Transaction struct {
	ID     int
	Amount float64
	When   time.Time
}

// monthRange returns a half-open interval [start, end):
// start = first instant of the month (inclusive)
// end   = first instant of the NEXT month (exclusive)
func monthRange(year int, month time.Month) (time.Time, time.Time) {
	start := time.Date(year, month, 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0) // first day of next month — robust across month lengths
	return start, end
}

// inRange checks the half-open interval [start, end) using only Before,
// which avoids the inclusive/exclusive mismatch entirely:
//   t in [start, end)  <=>  !t.Before(start) && t.Before(end)
func inRange(t, start, end time.Time) bool {
	return !t.Before(start) && t.Before(end)
}

func transactionsInMonth(txs []Transaction, year int, month time.Month) []Transaction {
	start, end := monthRange(year, month)
	var result []Transaction
	for _, tx := range txs {
		if inRange(tx.When, start, end) {
			result = append(result, tx)
		}
	}
	return result
}

func main() {
	txs := []Transaction{
		{ID: 1, Amount: 100, When: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)},
		{ID: 2, Amount: 200, When: time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC)},
		{ID: 3, Amount: 300, When: time.Date(2026, 1, 31, 23, 59, 0, 0, time.UTC)},
	}
	jan := transactionsInMonth(txs, 2026, time.January)
	fmt.Println(len(jan)) // 3 — correct, all transactions included
}`,
        keyTakeaways: [
          "Model date ranges as half-open intervals [start, end) — end is the start of the NEXT period",
          "Use t.AddDate(0, 1, 0) to get 'next month' — handles Dec→Jan rollover and varying month lengths",
          "Standard inclusive-lower/exclusive-upper check: !t.Before(start) && t.Before(end)",
          "Never mix After/Before inconsistently — pick one canonical comparison form and apply it uniformly",
          "Write boundary tests explicitly: first instant, last instant, and one tick past the end of every range",
        ],
      },

      {
        id: "inventory-race",
        title: "Check-Then-Act Race in Inventory Reservation",
        difficulty: "Hard",
        description:
          "A flash sale oversells a limited-stock item — 100 units in stock but 140 orders succeed. The 'check stock, then decrement' pattern has a classic TOCTOU race — fix it at the database level.",
        category: "Business Logic",
        buggyCode: `package main

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
)

var db *sql.DB

// reserveStock is called concurrently by hundreds of checkout requests
// during a flash sale for a product with limited stock.
func reserveStock(productID, qty int) error {
	var available int
	err := db.QueryRow(
		"SELECT stock FROM inventory WHERE product_id = $1", productID,
	).Scan(&available)
	if err != nil {
		return err
	}

	if available < qty {
		return fmt.Errorf("insufficient stock: have %d, want %d", available, qty)
	}

	// Decrement stock — separate statement from the check above
	_, err = db.Exec(
		"UPDATE inventory SET stock = stock - $1 WHERE product_id = $2",
		qty, productID,
	)
	return err
}

func main() {
	// Simulates 140 concurrent checkout attempts for 100 available units
	for i := 0; i < 140; i++ {
		go func(n int) {
			if err := reserveStock(101, 1); err != nil {
				fmt.Println("rejected:", n, err)
				return
			}
			fmt.Println("reserved:", n)
		}(i)
	}
	select {} // block forever for demo purposes
}`,
        issues: [
          {
            severity: "Critical",
            title: "Check-then-act (TOCTOU) race — read and write are not atomic",
            description:
              "Two goroutines can both SELECT stock=1, both see available=1 >= qty=1, and both proceed to UPDATE stock = stock - 1. The final stock can go to -1 (or worse at scale) and BOTH orders are accepted for the same single unit. This is the textbook overselling bug in flash sales and ticketing systems.",
          },
          {
            severity: "Critical",
            title: "No atomic conditional decrement — relies on app-level check",
            description:
              "The fix is to push the check into the SQL statement itself: UPDATE ... SET stock = stock - $1 WHERE product_id = $2 AND stock >= $1. This makes the check-and-decrement a single atomic operation enforced by the database, immune to races regardless of concurrency level.",
          },
          {
            severity: "High",
            title: "No verification that the UPDATE actually affected a row",
            description:
              "Even with the atomic UPDATE...WHERE pattern, you must check RowsAffected(). If 0 rows were affected, stock was insufficient at the moment of the update — return an 'out of stock' error instead of silently succeeding.",
          },
        ],
        annotatedCode: `package main

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
)

var db *sql.DB

func reserveStock(productID, qty int) error {
	// ❌ CRITICAL: STEP 1 — read current stock.
	var available int
	err := db.QueryRow(
		"SELECT stock FROM inventory WHERE product_id = $1", productID,
	).Scan(&available)
	if err != nil {
		return err
	}

	// ❌ CRITICAL: STEP 2 — check in application code.
	// Between this check and the UPDATE below, ANY NUMBER of other
	// goroutines can run the SAME check against the SAME stock value
	// (it hasn't changed yet — nobody has written anything).
	// Goroutine A: reads stock=1, passes check (1 >= 1)
	// Goroutine B: reads stock=1, passes check (1 >= 1)   ← same instant
	// Both proceed to decrement — stock ends at -1, both orders "succeed".
	if available < qty {
		return fmt.Errorf("insufficient stock: have %d, want %d", available, qty)
	}

	// ❌ CRITICAL: STEP 3 — decrement, in a SEPARATE statement.
	// This is the "act" in check-then-act. The race window is the gap
	// between the SELECT above and this UPDATE — easily microseconds,
	// but under flash-sale concurrency (thousands of simultaneous
	// requests) that's enough for massive overselling.
	// ✅ FIX: combine check + decrement into ONE atomic SQL statement:
	//   UPDATE inventory SET stock = stock - $1
	//   WHERE product_id = $2 AND stock >= $1
	// The database guarantees this read-modify-write is atomic per row.
	_, err = db.Exec(
		"UPDATE inventory SET stock = stock - $1 WHERE product_id = $2",
		qty, productID,
	)
	return err
}`,
        fixedCode: `package main

import (
	"context"
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
)

var db *sql.DB

// reserveStock performs an atomic conditional decrement.
// The database guarantees the read-check-write happens as one indivisible
// operation per row — no race window exists, regardless of concurrency.
func reserveStock(ctx context.Context, productID, qty int) error {
	result, err := db.ExecContext(ctx,
		`+"`"+`UPDATE inventory
		   SET stock = stock - $1
		 WHERE product_id = $2
		   AND stock >= $1`+"`"+`,
		qty, productID,
	)
	if err != nil {
		return fmt.Errorf("reserveStock: update failed: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("reserveStock: rows affected: %w", err)
	}
	if rows == 0 {
		// Either the product doesn't exist, or stock < qty at the moment
		// the database evaluated the WHERE clause — atomically determined.
		return fmt.Errorf("reserveStock: insufficient stock for product %d", productID)
	}

	return nil
}

// Alternative for very high contention: SELECT ... FOR UPDATE inside a
// transaction explicitly serializes access to the row.
func reserveStockWithLock(ctx context.Context, productID, qty int) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var available int
	// FOR UPDATE locks this row — other transactions block here until commit/rollback.
	err = tx.QueryRowContext(ctx,
		"SELECT stock FROM inventory WHERE product_id = $1 FOR UPDATE",
		productID,
	).Scan(&available)
	if err != nil {
		return err
	}
	if available < qty {
		return fmt.Errorf("insufficient stock: have %d, want %d", available, qty)
	}

	if _, err := tx.ExecContext(ctx,
		"UPDATE inventory SET stock = stock - $1 WHERE product_id = $2",
		qty, productID,
	); err != nil {
		return err
	}

	return tx.Commit()
}

func main() {
	ctx := context.Background()
	for i := 0; i < 140; i++ {
		go func(n int) {
			if err := reserveStock(ctx, 101, 1); err != nil {
				fmt.Println("rejected:", n, err)
				return
			}
			fmt.Println("reserved:", n)
		}(i)
	}
	select {}
}`,
        keyTakeaways: [
          "Check-then-act across two statements is NEVER safe under concurrency — collapse into one atomic operation",
          "Push the condition into the SQL WHERE clause: UPDATE ... SET x = x - $1 WHERE x >= $1",
          "Always check RowsAffected() — 0 rows means the atomic condition failed (e.g., out of stock)",
          "SELECT ... FOR UPDATE is the alternative for complex multi-row logic that can't be a single statement",
          "This exact bug pattern caused real-world overselling incidents at major e-commerce and ticketing platforms",
        ],
      },

      {
        id: "money-as-float",
        title: "Currency Stored as Floating Point",
        difficulty: "Medium",
        description:
          "An invoicing system computes totals using float64. Customers report invoices off by a cent — explain why floats are unsafe for money and migrate to integer cents.",
        category: "Business Logic",
        buggyCode: `package main

import "fmt"

type LineItem struct {
	Description string
	UnitPrice   float64 // dollars, e.g. 19.99
	Quantity    int
}

func lineTotal(item LineItem) float64 {
	return item.UnitPrice * float64(item.Quantity)
}

func invoiceTotal(items []LineItem, taxRate float64) float64 {
	var subtotal float64
	for _, item := range items {
		subtotal += lineTotal(item)
	}
	tax := subtotal * taxRate
	return subtotal + tax
}

func main() {
	items := []LineItem{
		{Description: "Widget", UnitPrice: 19.99, Quantity: 3},
		{Description: "Gadget", UnitPrice: 9.10, Quantity: 7},
	}
	total := invoiceTotal(items, 0.0825)
	fmt.Printf("Total: $%.2f\\n", total)

	// Demonstrates the precision problem directly:
	a := 0.1
	b := 0.2
	fmt.Println(a+b == 0.3)        // false!
	fmt.Printf("%.17f\\n", a+b)    // 0.30000000000000004
}`,
        issues: [
          {
            severity: "Critical",
            title: "float64 cannot represent most decimal fractions exactly",
            description:
              "0.1 and 0.2 have no exact binary floating-point representation. 0.1 + 0.2 == 0.30000000000000004, not 0.3. When you sum hundreds of line items and apply tax rates, these tiny errors accumulate and surface as 'invoice total off by $0.01' — a bug that erodes customer trust and fails financial audits (which require exact cent-level reconciliation).",
          },
          {
            severity: "High",
            title: "Comparing computed money values with == is fundamentally broken",
            description:
              "Anywhere this codebase compares a computed float total to an expected value with == (e.g., 'has the customer paid the exact amount?'), the comparison can spuriously fail due to representation error — rejecting valid payments or approving short payments.",
          },
          {
            severity: "High",
            title: "Rounding happens implicitly and inconsistently at print time",
            description:
              "fmt.Printf(\"%.2f\", total) rounds for DISPLAY but the underlying float still carries the imprecise value, which is used in subsequent calculations (e.g., next month's balance = this month's total - payment). Errors compound across statements/periods.",
          },
        ],
        annotatedCode: `package main

import "fmt"

type LineItem struct {
	Description string
	// ❌ ISSUE: float64 for currency. Decimal fractions like 19.99, 0.10, 0.0825
	// are stored as the NEAREST representable binary fraction — not the exact value.
	// Arithmetic on these approximations accumulates error.
	UnitPrice float64
	Quantity  int
}

func lineTotal(item LineItem) float64 {
	// ❌ ISSUE: multiplying an imprecise float by an int compounds the error.
	// 19.99 * 3 might not be exactly 59.97 in float64 representation.
	return item.UnitPrice * float64(item.Quantity)
}

func invoiceTotal(items []LineItem, taxRate float64) float64 {
	var subtotal float64
	for _, item := range items {
		// ❌ ISSUE: summing floats accumulates rounding error with every addition.
		// Order of summation can even change the final result (floats are not
		// associative: (a+b)+c != a+(b+c) in general).
		subtotal += lineTotal(item)
	}
	// ❌ ISSUE: multiplying by a fractional tax rate (0.0825) introduces
	// further representation error — the exact decimal 8.25% cannot be
	// stored exactly as a binary float.
	tax := subtotal * taxRate
	return subtotal + tax
}

func main() {
	items := []LineItem{
		{Description: "Widget", UnitPrice: 19.99, Quantity: 3},
		{Description: "Gadget", UnitPrice: 9.10, Quantity: 7},
	}
	total := invoiceTotal(items, 0.0825)
	fmt.Printf("Total: $%.2f\\n", total) // looks fine here, but...

	// ❌ This is the SAME class of bug, made obvious:
	a := 0.1
	b := 0.2
	fmt.Println(a+b == 0.3)     // false — direct proof floats can't represent money exactly
	fmt.Printf("%.17f\\n", a+b) // 0.30000000000000004
}`,
        fixedCode: `package main

import "fmt"

// Money represents an amount as an integer number of the smallest currency
// unit (cents for USD, paise for INR). Integer arithmetic is EXACT —
// no representation error, no accumulation, no surprises.
type Money int64 // cents

func Dollars(d int64, cents int64) Money {
	return Money(d*100 + cents)
}

func (m Money) String() string {
	sign := ""
	v := int64(m)
	if v < 0 {
		sign, v = "-", -v
	}
	return fmt.Sprintf("%s$%d.%02d", sign, v/100, v%100)
}

type LineItem struct {
	Description string
	UnitPrice   Money // e.g. Dollars(19, 99) == 1999 cents
	Quantity    int64
}

func lineTotal(item LineItem) Money {
	// Integer multiplication — exact, no rounding error possible.
	return item.UnitPrice * Money(item.Quantity)
}

// invoiceTotal computes tax using integer arithmetic with explicit,
// well-defined rounding (round-half-up) applied exactly ONCE, at the end.
func invoiceTotal(items []LineItem, taxBasisPoints int64) Money {
	var subtotal Money
	for _, item := range items {
		subtotal += lineTotal(item)
	}

	// taxBasisPoints: 825 means 8.25% (basis points = hundredths of a percent)
	// Compute tax in integer cents with explicit rounding:
	taxCents := (int64(subtotal)*taxBasisPoints + 5000) / 10000 // round-half-up
	return subtotal + Money(taxCents)
}

func main() {
	items := []LineItem{
		{Description: "Widget", UnitPrice: Dollars(19, 99), Quantity: 3},
		{Description: "Gadget", UnitPrice: Dollars(9, 10), Quantity: 7},
	}
	total := invoiceTotal(items, 825) // 8.25% == 825 basis points
	fmt.Println("Total:", total)      // exact, reproducible, audit-safe

	// Integer equality is exact — safe to use == for comparing money.
	a := Dollars(0, 10) // 10 cents
	b := Dollars(0, 20) // 20 cents
	c := Dollars(0, 30) // 30 cents
	fmt.Println(a+b == c) // true — always, exactly
}`,
        keyTakeaways: [
          "Never use float32/float64 for currency — binary floats cannot represent most decimal fractions exactly",
          "Store money as integers in the smallest unit (cents, paise) — integer arithmetic is exact",
          "Define rounding rules explicitly (round-half-up, banker's rounding) and apply them ONCE, at well-defined points",
          "For arbitrary precision needs, use a decimal library (shopspring/decimal) — never raw floats",
          "Equality comparisons on money (== ) are only safe with integer or decimal types, never floats",
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // 10. Type Errors & Conversions
  // ─────────────────────────────────────────────────────────────
  {
    id: "type-errors",
    title: "Type Errors & Conversions",
    icon: "🔢",
    problems: [
      {
        id: "type-assertion-panic",
        title: "Unchecked Type Assertion Panics",
        difficulty: "Easy",
        description:
          "A generic event processor reads typed fields out of a map[string]interface{} payload. A field of unexpected type crashes the entire worker — find every unsafe assertion.",
        category: "Type Errors",
        buggyCode: `package main

import "fmt"

type Event struct {
	Type    string
	Payload map[string]interface{}
}

func processEvent(e Event) {
	switch e.Type {
	case "order.created":
		// Direct type assertion — panics if the type doesn't match
		orderID := e.Payload["order_id"].(int)
		amount := e.Payload["amount"].(float64)
		userID := e.Payload["user_id"].(string)
		fmt.Printf("order %d for user %s: $%.2f\\n", orderID, userID, amount)

	case "user.updated":
		name := e.Payload["name"].(string)
		fmt.Println("user updated:", name)
	}
}

func main() {
	// Simulates events from an upstream system —
	// JSON numbers decode as float64, not int!
	events := []Event{
		{Type: "order.created", Payload: map[string]interface{}{
			"order_id": 1001, // a real int — works
			"amount":   49.99,
			"user_id":  "u-42",
		}},
		{Type: "order.created", Payload: map[string]interface{}{
			"order_id": float64(1002), // came from JSON — decoded as float64
			"amount":   49.99,
			"user_id":  "u-43",
		}},
	}
	for _, e := range events {
		processEvent(e) // second event panics: interface conversion
	}
}`,
        issues: [
          {
            severity: "Critical",
            title: "Direct type assertion x.(T) panics on mismatch — crashes the whole worker",
            description:
              "e.Payload[\"order_id\"].(int) panics with 'interface conversion: interface {} is float64, not int' if the underlying value isn't exactly an int. In Go, encoding/json decodes ALL JSON numbers into interface{} as float64 — never int. Any event sourced from JSON will panic on this line.",
          },
          {
            severity: "Critical",
            title: "JSON numbers always decode to float64 in interface{} — never int",
            description:
              "This is one of the most common Go production bugs: json.Unmarshal(data, &map[string]interface{}{}) decodes {\"order_id\": 1001} as map[\"order_id\"] = float64(1001), not int(1001). Code that asserts .(int) on JSON-derived data will always panic, while hand-constructed test data with literal ints will pass — masking the bug until production JSON arrives.",
          },
          {
            severity: "High",
            title: "No use of the comma-ok form — cannot gracefully handle malformed events",
            description:
              "v, ok := x.(T) returns ok=false instead of panicking on mismatch. This lets the processor log a malformed event and continue, rather than crashing and losing every subsequent event in the batch.",
          },
        ],
        annotatedCode: `package main

import "fmt"

type Event struct {
	Type    string
	Payload map[string]interface{}
}

func processEvent(e Event) {
	switch e.Type {
	case "order.created":
		// ❌ CRITICAL: x.(int) is an UNCHECKED type assertion.
		// If e.Payload["order_id"] is not EXACTLY an int (e.g. it's a
		// float64, which is what encoding/json produces for ALL numbers),
		// this PANICS: "interface conversion: interface {} is float64, not int"
		// One malformed/JSON-sourced event crashes the entire goroutine.
		// ✅ FIX: use the comma-ok form: v, ok := x.(int)
		orderID := e.Payload["order_id"].(int)

		// ❌ CRITICAL: same issue — what if amount is sent as a JSON string "49.99"?
		// Or as an int (49) instead of float (49.0)? Both panic here.
		amount := e.Payload["amount"].(float64)

		// ❌ CRITICAL: what if user_id is missing from the payload entirely?
		// e.Payload["user_id"] returns nil (interface{} zero value).
		// nil.(string) panics: "interface conversion: interface {} is nil, not string"
		userID := e.Payload["user_id"].(string)

		fmt.Printf("order %d for user %s: $%.2f\\n", orderID, userID, amount)

	case "user.updated":
		name := e.Payload["name"].(string)
		fmt.Println("user updated:", name)
	}
	// ❌ ISSUE: no default case — unknown event types are silently ignored,
	// which may itself be a business logic gap (should they be logged?).
}

func main() {
	events := []Event{
		{Type: "order.created", Payload: map[string]interface{}{
			"order_id": 1001, // hand-written literal — happens to be int
			"amount":   49.99,
			"user_id":  "u-42",
		}},
		{Type: "order.created", Payload: map[string]interface{}{
			// ❌ This is what REAL JSON-decoded data looks like:
			// encoding/json ALWAYS produces float64 for JSON numbers.
			"order_id": float64(1002),
			"amount":   49.99,
			"user_id":  "u-43",
		}},
	}
	for _, e := range events {
		processEvent(e) // second iteration panics — process crashes
	}
}`,
        fixedCode: `package main

import (
	"fmt"
	"log"
)

type Event struct {
	Type    string
	Payload map[string]interface{}
}

// getInt safely extracts an integer from a JSON-decoded interface{} value.
// JSON numbers decode as float64 — this handles both float64 and int
// so the function works whether the data came from JSON or was hand-built.
func getInt(m map[string]interface{}, key string) (int, bool) {
	v, ok := m[key]
	if !ok || v == nil {
		return 0, false
	}
	switch n := v.(type) {
	case float64:
		return int(n), true // JSON number → float64 → int
	case int:
		return n, true
	default:
		return 0, false
	}
}

func getFloat(m map[string]interface{}, key string) (float64, bool) {
	v, ok := m[key]
	if !ok || v == nil {
		return 0, false
	}
	switch n := v.(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	default:
		return 0, false
	}
}

func getString(m map[string]interface{}, key string) (string, bool) {
	v, ok := m[key]
	if !ok || v == nil {
		return "", false
	}
	s, ok := v.(string)
	return s, ok
}

func processEvent(e Event) error {
	switch e.Type {
	case "order.created":
		orderID, ok := getInt(e.Payload, "order_id")
		if !ok {
			return fmt.Errorf("processEvent: order.created missing/invalid order_id: %+v", e.Payload)
		}
		amount, ok := getFloat(e.Payload, "amount")
		if !ok {
			return fmt.Errorf("processEvent: order.created missing/invalid amount: %+v", e.Payload)
		}
		userID, ok := getString(e.Payload, "user_id")
		if !ok {
			return fmt.Errorf("processEvent: order.created missing/invalid user_id: %+v", e.Payload)
		}
		fmt.Printf("order %d for user %s: $%.2f\\n", orderID, userID, amount)
		return nil

	case "user.updated":
		name, ok := getString(e.Payload, "name")
		if !ok {
			return fmt.Errorf("processEvent: user.updated missing/invalid name: %+v", e.Payload)
		}
		fmt.Println("user updated:", name)
		return nil

	default:
		return fmt.Errorf("processEvent: unknown event type %q", e.Type)
	}
}

func main() {
	events := []Event{
		{Type: "order.created", Payload: map[string]interface{}{
			"order_id": float64(1002), // realistic: as decoded from JSON
			"amount":   49.99,
			"user_id":  "u-43",
		}},
		{Type: "order.created", Payload: map[string]interface{}{
			"order_id": float64(1003),
			"amount":   "not-a-number", // malformed — handled gracefully
			"user_id":  "u-44",
		}},
	}
	for _, e := range events {
		if err := processEvent(e); err != nil {
			log.Println("skipping malformed event:", err)
			continue // one bad event doesn't crash the worker
		}
	}
}`,
        keyTakeaways: [
          "Never use unchecked type assertions x.(T) on data from external sources — always use v, ok := x.(T)",
          "encoding/json decodes ALL JSON numbers into interface{} as float64 — never int, even for whole numbers",
          "Write a small set of safe getter helpers (getInt, getString) that normalize across JSON/native types",
          "A single malformed message should produce a logged error, not crash the entire worker/goroutine",
          "Prefer typed structs with json.Unmarshal over map[string]interface{} whenever the schema is known",
        ],
      },

      {
        id: "integer-overflow",
        title: "Integer Overflow in ID Generation",
        difficulty: "Medium",
        description:
          "A counter-based ID generator uses int32. After ~2.1 billion IDs it wraps to negative numbers, breaking database primary keys and URL routing — diagnose and fix the overflow.",
        category: "Type Errors",
        buggyCode: `package main

import (
	"fmt"
	"sync/atomic"
)

// IDGenerator produces sequential, monotonically increasing IDs.
type IDGenerator struct {
	counter int32
}

func (g *IDGenerator) Next() int32 {
	return atomic.AddInt32(&g.counter, 1)
}

func main() {
	gen := &IDGenerator{counter: 2_147_483_645} // close to int32 max

	for i := 0; i < 5; i++ {
		id := gen.Next()
		fmt.Println(id)
	}
	// 2147483646
	// 2147483647   <- int32 max
	// -2147483648  <- OVERFLOW: wraps to the most negative int32
	// -2147483647
	// -2147483646
}`,
        issues: [
          {
            severity: "Critical",
            title: "int32 overflow silently wraps to negative — no error, no panic",
            description:
              "Go integer overflow is well-defined (two's complement wraparound) and produces NO runtime error. counter+1 when counter == math.MaxInt32 (2147483647) silently becomes math.MinInt32 (-2147483648). IDs suddenly go negative. Any code assuming 'IDs are positive and increasing' (database PKs, URL paths, sort order, pagination cursors) breaks catastrophically and silently.",
          },
          {
            severity: "High",
            title: "int32 has insufficient range for a long-lived high-throughput counter",
            description:
              "int32 maxes out at ~2.1 billion. A service generating 1000 IDs/second exhausts this range in about 24 days. int64 (max ~9.2 * 10^18) would take hundreds of millions of years at the same rate — the right default for IDs and counters unless memory constraints are extreme.",
          },
          {
            severity: "Medium",
            title: "No detection or alerting as the counter approaches its limit",
            description:
              "Even with int64, it's good practice to monitor counters approaching their type's range (or a configured business limit) and alert well in advance, rather than discovering the wraparound in production.",
          },
        ],
        annotatedCode: `package main

import (
	"fmt"
	"sync/atomic"
)

type IDGenerator struct {
	// ❌ ISSUE: int32 — range is approximately -2.1 billion to +2.1 billion.
	// For an ID counter that should only ever increase, this is a ticking
	// time bomb: there is no error when it overflows, just silent wraparound.
	// ✅ FIX: use int64 (or uint64 if negative IDs are nonsensical anyway).
	counter int32
}

func (g *IDGenerator) Next() int32 {
	// ❌ ISSUE: atomic.AddInt32 performs wrapping arithmetic per Go spec.
	// math.MaxInt32 (2147483647) + 1 == math.MinInt32 (-2147483648).
	// This is NOT a panic, NOT an error — just a silently wrong value.
	// Downstream: a negative "ID" gets written to an auto-increment-style
	// PRIMARY KEY column, breaks URL routes like /orders/-2147483648,
	// breaks "ORDER BY id DESC" assumptions, breaks pagination cursors
	// that assume monotonic positive sequences.
	return atomic.AddInt32(&g.counter, 1)
}

func main() {
	gen := &IDGenerator{counter: 2_147_483_645}

	for i := 0; i < 5; i++ {
		id := gen.Next()
		fmt.Println(id)
		// 2147483646
		// 2147483647   <- int32 max — last VALID id
		// -2147483648  <- ❌ OVERFLOW — silent wraparound, no error raised
		// -2147483647
		// -2147483646
	}
}`,
        fixedCode: `package main

import (
	"fmt"
	"log"
	"math"
	"sync/atomic"
)

// alertThreshold triggers proactive monitoring well before any real limit.
const alertThreshold = math.MaxInt64 - 1_000_000_000

type IDGenerator struct {
	// FIX: int64 — range ~9.2 * 10^18. At 100,000 IDs/sec this lasts
	// for roughly 2.9 million years. Effectively unbounded for any
	// realistic system lifetime.
	counter int64
}

func (g *IDGenerator) Next() (int64, error) {
	id := atomic.AddInt64(&g.counter, 1)

	// Defensive check: even with int64, alert long before any real risk —
	// catches misconfiguration (e.g., counter seeded incorrectly) early.
	if id > alertThreshold {
		log.Printf("WARNING: ID generator approaching int64 limit: %d", id)
	}

	// Defensive check: a wrapped value would appear negative — reject it
	// outright rather than ever returning/persisting it.
	if id < 0 {
		return 0, fmt.Errorf("IDGenerator: counter overflowed (got %d) — system requires intervention", id)
	}

	return id, nil
}

func main() {
	gen := &IDGenerator{counter: 2_147_483_645} // far below int64's real limits

	for i := 0; i < 5; i++ {
		id, err := gen.Next()
		if err != nil {
			log.Fatal(err)
		}
		fmt.Println(id)
		// 2147483646
		// 2147483647
		// 2147483648   <- correctly continues past the old int32 boundary
		// 2147483649
		// 2147483650
	}
}

// Note: for distributed ID generation at scale, prefer dedicated schemes
// (Snowflake IDs, ULIDs, database sequences, UUID v7) over a single
// in-process counter — they avoid both overflow AND single-point
// coordination bottlenecks.`,
        keyTakeaways: [
          "Go integer overflow wraps silently (two's complement) — no panic, no error, just a wrong value",
          "Default to int64 for any counter, ID, or accumulator unless you have a proven memory constraint",
          "math.MaxInt32 (~2.1B) is reachable by real systems in weeks; math.MaxInt64 effectively never is",
          "Add defensive checks (id < 0, approaching threshold) for any long-lived monotonic counter",
          "For distributed/high-scale ID generation, use Snowflake, ULID, UUID v7, or DB sequences instead of a local counter",
        ],
      },

      {
        id: "float-equality",
        title: "Comparing Floats with Equality",
        difficulty: "Easy",
        description:
          "A pricing engine checks 'has the discount made this item free?' using ==. The check almost never triggers even when it logically should — explain floating-point comparison pitfalls.",
        category: "Type Errors",
        buggyCode: `package main

import "fmt"

type CartItem struct {
	Price        float64
	DiscountRate float64 // 1.0 = 100% off
}

func isFree(item CartItem) bool {
	finalPrice := item.Price - (item.Price * item.DiscountRate)
	return finalPrice == 0.0
}

func percentageRemaining(price, paid float64) float64 {
	return (price - paid) / price * 100
}

func main() {
	item := CartItem{Price: 49.99, DiscountRate: 1.0} // 100% off — should be free
	fmt.Println("is free:", isFree(item))             // false! (rounding artifact)

	// A second example showing the same root cause:
	price := 19.99
	paid := 19.99
	remaining := percentageRemaining(price, paid)
	fmt.Println("remaining %:", remaining)
	fmt.Println("fully paid:", remaining == 0.0) // also potentially false
}`,
        issues: [
          {
            severity: "Critical",
            title: "Direct == comparison on computed floats fails due to representation error",
            description:
              "item.Price - (item.Price * item.DiscountRate) for Price=49.99, DiscountRate=1.0 should mathematically be 0, but floating-point multiplication and subtraction can leave a tiny residual like 7.105427357601002e-15. The == 0.0 check then evaluates to false, and a customer who should get a free item is charged a near-zero (but nonzero) amount — a confusing and embarrassing checkout bug.",
          },
          {
            severity: "High",
            title: "No epsilon/tolerance used for floating-point comparisons",
            description:
              "The standard fix for comparing floats is to check whether the absolute difference is within a small tolerance (epsilon): math.Abs(a - b) < epsilon. The exact epsilon depends on the magnitude of the values and the precision needed (for money, prefer integer cents entirely — see the 'Currency Stored as Floating Point' problem).",
          },
        ],
        annotatedCode: `package main

import "fmt"

type CartItem struct {
	Price        float64
	DiscountRate float64
}

func isFree(item CartItem) bool {
	// ❌ ISSUE: this arithmetic on float64 does not produce an EXACT zero
	// even when the math says it should. 49.99 * 1.0 might evaluate to
	// 49.989999999999995 or similar due to binary floating-point representation,
	// making (Price - Price*Rate) a tiny nonzero residual like 7.1e-15.
	finalPrice := item.Price - (item.Price * item.DiscountRate)

	// ❌ CRITICAL: == on a computed float is almost never the right check.
	// finalPrice is "essentially zero" but not EXACTLY 0.0 in IEEE-754.
	// This returns false, and the customer is charged $0.0000000000000071.
	// ✅ FIX: use a tolerance: math.Abs(finalPrice) < epsilon
	// ✅ BETTER FIX: don't use floats for money at all — use integer cents.
	return finalPrice == 0.0
}

func percentageRemaining(price, paid float64) float64 {
	return (price - paid) / price * 100
}

func main() {
	item := CartItem{Price: 49.99, DiscountRate: 1.0}
	fmt.Println("is free:", isFree(item)) // false — should logically be true

	price := 19.99
	paid := 19.99
	remaining := percentageRemaining(price, paid)
	// ❌ ISSUE: (price - paid) should be exactly 0, but subtraction of two
	// equal-looking floats CAN still yield a nonzero result depending on
	// how each was originally computed/stored — the == check is fragile.
	fmt.Println("fully paid:", remaining == 0.0)
}`,
        fixedCode: `package main

import (
	"fmt"
	"math"
)

// epsilon is the tolerance for "close enough to equal" in float comparisons.
// Choosing the right epsilon depends on the magnitude and precision of your
// values — for currency, prefer integer cents and avoid this entirely.
const epsilon = 1e-9

func almostEqual(a, b float64) bool {
	return math.Abs(a-b) < epsilon
}

type CartItem struct {
	Price        float64
	DiscountRate float64
}

func isFree(item CartItem) bool {
	finalPrice := item.Price - (item.Price * item.DiscountRate)
	// FIX: tolerance-based comparison absorbs floating-point representation noise.
	return almostEqual(finalPrice, 0.0)
}

func percentageRemaining(price, paid float64) float64 {
	if price == 0 {
		return 0 // guard against division by zero
	}
	return (price - paid) / price * 100
}

func main() {
	item := CartItem{Price: 49.99, DiscountRate: 1.0}
	fmt.Println("is free:", isFree(item)) // true — correctly detects "essentially zero"

	price := 19.99
	paid := 19.99
	remaining := percentageRemaining(price, paid)
	fmt.Println("fully paid:", almostEqual(remaining, 0.0))
}

// BEST FIX for money specifically: don't use floats at all.
// type Money int64 // cents — integer equality is exact and safe:
//   isFree := finalPriceCents == 0   // always correct, no epsilon needed
// See the "Currency Stored as Floating Point" problem for the full pattern.`,
        keyTakeaways: [
          "Never compare computed float64 values with == — representation error makes exact equality unreliable",
          "Use an epsilon-based tolerance check: math.Abs(a - b) < epsilon",
          "Choosing epsilon requires understanding the magnitude and required precision of your values",
          "For money specifically, the real fix is to avoid floats entirely — use integer cents",
          "This bug class extends to any 'is this value zero/equal/done' check built on float arithmetic",
        ],
      },

      {
        id: "json-number-decoding",
        title: "JSON Numeric Type Mismatch on Unmarshal",
        difficulty: "Medium",
        description:
          "A webhook receiver decodes incoming JSON into a Go struct. A partner sends a quantity as a JSON string instead of a number, and the entire webhook payload is rejected — handle flexible numeric encodings gracefully.",
        category: "Type Errors",
        buggyCode: `package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type WebhookPayload struct {
	OrderID  int     \`json:"order_id"\`
	Quantity int     \`json:"quantity"\`
	Price    float64 \`json:"price"\`
	Status   string  \`json:"status"\`
}

func webhookHandler(w http.ResponseWriter, r *http.Request) {
	var payload WebhookPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		// Every malformed-type payload from any partner ends up here
		http.Error(w, fmt.Sprintf("invalid payload: %v", err), http.StatusBadRequest)
		return
	}

	fmt.Fprintf(w, "processed order %d, qty %d\\n", payload.OrderID, payload.Quantity)
}

// Example payloads received from different partner integrations:
//
// Partner A sends:  {"order_id": 1001, "quantity": 5,   "price": 9.99,  "status": "paid"}
// Partner B sends:  {"order_id": 1002, "quantity": "5", "price": "9.99","status": "paid"}
//                                       ^^^^^^^^^^^^             ^^^^^^^^
//                          numbers sent as JSON strings — common in legacy/PHP systems
//
// Partner B's payload fails to decode entirely:
// "json: cannot unmarshal string into Go struct field WebhookPayload.quantity of type int"

func main() {
	http.HandleFunc("/webhook", webhookHandler)
	http.ListenAndServe(":8080", nil)
}`,
        issues: [
          {
            severity: "Critical",
            title: "Strict struct typing rejects semantically-valid payloads with different JSON encodings",
            description:
              "encoding/json performs strict type checking: a JSON string \"5\" cannot decode into a Go int field, even though \"5\" unambiguously represents the integer 5. Partner B's entire webhook is rejected with a 400, even though the data is perfectly usable — just encoded differently (a very common real-world situation with legacy systems, PHP/JS clients that stringify numbers, etc.).",
          },
          {
            severity: "High",
            title: "One field's type mismatch fails the ENTIRE decode — no partial recovery",
            description:
              "json.Decode fails atomically: if any single field has a type mismatch, the whole struct fails to populate (in older Go versions) or only partially populates with an error (in others) — there's no clean way to process the 90% of the payload that IS well-typed while flagging just the problematic field.",
          },
          {
            severity: "Medium",
            title: "No custom UnmarshalJSON to normalize flexible encodings",
            description:
              "The idiomatic Go fix is a custom type with UnmarshalJSON that accepts both number and string JSON representations and normalizes them internally — isolating the messiness of 'numbers as strings' to one well-tested location instead of leaking it through the whole codebase.",
          },
        ],
        annotatedCode: `package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type WebhookPayload struct {
	OrderID int \`json:"order_id"\`
	// ❌ ISSUE: declared as int, but encoding/json requires the JSON value
	// to be a JSON *number* to decode into an int. If the partner sends
	// "quantity": "5" (a JSON string), decoding fails with:
	//   "json: cannot unmarshal string into Go struct field ...quantity of type int"
	// ✅ FIX: use a custom type with UnmarshalJSON that accepts both
	// number and string representations and normalizes to int internally.
	Quantity int \`json:"quantity"\`

	// ❌ ISSUE: same problem for float64 — "price": "9.99" (string) fails
	// to decode into a float64 field.
	Price  float64 \`json:"price"\`
	Status string  \`json:"status"\`
}

func webhookHandler(w http.ResponseWriter, r *http.Request) {
	var payload WebhookPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		// ❌ ISSUE: ANY type mismatch on ANY field — even one that doesn't
		// matter for this particular operation — rejects the entire webhook.
		// Partner B's orders never get processed; their integration appears
		// broken from their side, but the data was perfectly usable.
		http.Error(w, fmt.Sprintf("invalid payload: %v", err), http.StatusBadRequest)
		return
	}

	fmt.Fprintf(w, "processed order %d, qty %d\\n", payload.OrderID, payload.Quantity)
}`,
        fixedCode: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
)

// FlexInt decodes from either a JSON number (5) or a JSON string ("5"),
// normalizing both into a plain int. Isolates the messiness of
// "numbers sometimes arrive as strings" to a single, well-tested type.
type FlexInt int

func (f *FlexInt) UnmarshalJSON(data []byte) error {
	data = bytes.Trim(data, \`"\`) // strip quotes if it was a JSON string
	if len(data) == 0 || string(data) == "null" {
		*f = 0
		return nil
	}
	n, err := strconv.Atoi(string(data))
	if err != nil {
		return fmt.Errorf("FlexInt: cannot parse %q as integer: %w", data, err)
	}
	*f = FlexInt(n)
	return nil
}

// FlexFloat does the same for floating-point fields.
type FlexFloat float64

func (f *FlexFloat) UnmarshalJSON(data []byte) error {
	data = bytes.Trim(data, \`"\`)
	if len(data) == 0 || string(data) == "null" {
		*f = 0
		return nil
	}
	v, err := strconv.ParseFloat(string(data), 64)
	if err != nil {
		return fmt.Errorf("FlexFloat: cannot parse %q as float: %w", data, err)
	}
	*f = FlexFloat(v)
	return nil
}

type WebhookPayload struct {
	OrderID  FlexInt   \`json:"order_id"\`
	Quantity FlexInt   \`json:"quantity"\`
	Price    FlexFloat \`json:"price"\`
	Status   string    \`json:"status"\`
}

func webhookHandler(w http.ResponseWriter, r *http.Request) {
	var payload WebhookPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, fmt.Sprintf("invalid payload: %v", err), http.StatusBadRequest)
		return
	}

	// Both {"quantity": 5} and {"quantity": "5"} now decode identically.
	fmt.Fprintf(w, "processed order %d, qty %d\\n", int(payload.OrderID), int(payload.Quantity))
}

func main() {
	http.HandleFunc("/webhook", webhookHandler)
	http.ListenAndServe(":8080", nil)
}`,
        keyTakeaways: [
          "encoding/json enforces strict type matching — JSON string \"5\" will NOT decode into a Go int field",
          "Implement UnmarshalJSON on a custom type to normalize multiple valid JSON encodings into one Go type",
          "Isolate 'messy real-world data' handling into small, well-tested types rather than scattering string/number checks across business logic",
          "One malformed field shouldn't necessarily reject an entire payload — design for graceful degradation where the business allows it",
          "Always test decoders against the ACTUAL payloads partners send in production, not just your idealized schema",
        ],
      },
    ],
  },
];
