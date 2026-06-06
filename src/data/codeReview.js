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
];
