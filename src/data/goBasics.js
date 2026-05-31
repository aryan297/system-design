export const GO_BASICS_CATEGORIES = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Getting Started
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "getting-started",
    icon: "🚀",
    title: "Getting Started",
    topics: [
      {
        id: "hello-world",
        title: "Hello World",
        summary: "The smallest complete Go program",
        explanation:
          "Every Go program starts with a package declaration. The special package name `main` tells the Go toolchain this is an executable program (not a library). The `main()` function is the entry point — execution begins here. `fmt.Println` writes to stdout and appends a newline. Import paths like `\"fmt\"` are module-qualified paths that the compiler resolves from your module's dependency graph.",
        keyPoints: [
          "`package main` marks an executable; any other name is a library package",
          "Unused imports are a compile error in Go — the compiler enforces cleanliness",
          "`fmt.Println` vs `fmt.Printf` vs `fmt.Print`: Println adds newline and spaces between args; Printf uses format verbs; Print adds spaces only between non-string args",
          "Run with `go run main.go` or build a binary with `go build`",
        ],
        code: `package main

import "fmt"

func main() {
\tfmt.Println("Hello, World!")

\t// fmt.Printf uses format verbs
\tname := "Go"
\tfmt.Printf("Hello, %s!\\n", name)

\t// fmt.Sprintf returns a formatted string (doesn't print)
\tgreeting := fmt.Sprintf("Welcome to %s %d", "Go", 2024)
\tfmt.Println(greeting)
}

// Output:
// Hello, World!
// Hello, Go!
// Welcome to Go 2024`,
      },
      {
        id: "variables",
        title: "Variables",
        summary: "Declaring and initializing variables — three styles",
        explanation:
          "Go offers three ways to declare variables. `var x int = 5` is the full explicit form — useful at package level or when the type matters for clarity. `var x = 5` lets the compiler infer the type from the right-hand side. `:=` is the short declaration (only inside functions) — it declares AND assigns in one step. The zero value system means every variable has a safe default: `0` for numbers, `false` for booleans, `\"\"` for strings, `nil` for pointers/slices/maps/channels. This eliminates uninitialized-variable bugs.",
        keyPoints: [
          "`:=` is only valid inside functions; `var` works anywhere",
          "Go initializes every variable to its zero value — no garbage values",
          "Multiple assignment: `a, b := 1, 2` — common for function returns",
          "Blank identifier `_` discards a value: `_, err := doSomething()`",
          "Block-level `var` with parentheses groups related declarations neatly",
        ],
        gotchas: [
          "`:=` creates a NEW variable in the current scope — it doesn't update an outer-scope variable",
          "Declared-but-unused local variables are compile errors",
        ],
        code: `package main

import "fmt"

// Package-level variable (must use var, not :=)
var globalCounter int = 0

func main() {
\t// Style 1: explicit type
\tvar age int = 25
\tvar name string = "Alice"

\t// Style 2: type inferred from value
\tvar score = 98.6
\tvar active = true

\t// Style 3: short declaration (most common inside functions)
\tcity := "Mumbai"
\tprice := 299.99

\t// Multiple assignment in one line
\tx, y := 10, 20

\t// Swap without temp variable
\tx, y = y, x

\t// Zero values — no initialization needed
\tvar count int     // 0
\tvar flag bool     // false
\tvar label string  // ""
\tvar ptr *int      // nil

\t// Blank identifier discards a value
\t_, secondVal := "first", "second"

\tfmt.Println(age, name, score, active, city, price)
\tfmt.Println(x, y)
\tfmt.Println(count, flag, label, ptr)
\tfmt.Println(secondVal)

\t// Block-style var declaration
\tvar (
\t\twidth  = 1920
\t\theight = 1080
\t)
\tfmt.Println(width, height)
}`,
      },
      {
        id: "constants",
        title: "Constants",
        summary: "Compile-time values and the iota enumerator",
        explanation:
          "Constants are immutable values evaluated at compile time. Unlike variables, they cannot be assigned to later. The `iota` identifier is a counter that resets to 0 in each `const` block and increments by 1 for each constant spec — perfect for enumerations. You can use expressions with `iota` to build bit-flag masks, byte-size constants, or any arithmetic sequence. Typed vs untyped constants: an untyped constant adapts to whatever context it's used in (so `const MaxSize = 1024` can be assigned to `int32`, `int64`, `float64` without casting).",
        keyPoints: [
          "`iota` starts at 0 and increments per line in a const block",
          "You can skip values with blank identifier: `_ = iota` skips 0",
          "Untyped constants are more flexible — they fit any numeric type",
          "Typed constants (`const x int32 = 10`) lock the type at declaration",
          "Constants can be strings, booleans, runes, and numeric types",
        ],
        code: `package main

import "fmt"

// Simple constants
const Pi = 3.14159
const AppName = "GoApp"

// Grouped constants
const (
\tMaxRetries = 3
\tTimeout    = 30
)

// iota — auto-incrementing enumerator
type Weekday int

const (
\tSunday Weekday = iota // 0
\tMonday                // 1
\tTuesday               // 2
\tWednesday             // 3
\tThursday              // 4
\tFriday                // 5
\tSaturday              // 6
)

// iota with expressions — byte size constants
const (
\t_           = iota             // skip 0
\tKB          = 1 << (10 * iota) // 1024
\tMB                             // 1048576
\tGB                             // 1073741824
)

// iota for bit flags
type Permission uint

const (
\tRead    Permission = 1 << iota // 1 (001)
\tWrite                          // 2 (010)
\tExecute                        // 4 (100)
)

func main() {
\tfmt.Println(Pi, AppName)
\tfmt.Println("Day:", Wednesday) // 3
\tfmt.Println("KB:", KB, "MB:", MB, "GB:", GB)

\t// Combining bit flags
\tperm := Read | Write
\tfmt.Println("Has Read:", perm&Read != 0)   // true
\tfmt.Println("Has Execute:", perm&Execute != 0) // false
}`,
      },
      {
        id: "basic-types",
        title: "Basic Types",
        summary: "Go's type system — integers, floats, booleans, strings, runes",
        explanation:
          "Go is statically typed — every value has a fixed type known at compile time. Integer types come in signed (int8–int64, int) and unsigned (uint8–uint64, uint) flavors. `int` and `uint` are platform-sized (32 or 64 bits). `byte` is an alias for `uint8`; `rune` is an alias for `int32` and represents a Unicode code point. Strings in Go are immutable byte slices in UTF-8 encoding — `len(s)` gives bytes, not characters. To iterate characters properly, use `range` which yields runes. Type conversion is always explicit in Go — no silent coercions.",
        keyPoints: [
          "`int` size is platform-dependent; use `int64` when exact size matters",
          "`string` is immutable; modification returns a new string",
          "`rune` (int32) holds one Unicode code point; `byte` (uint8) is one raw byte",
          "Type conversion syntax: `float64(x)` — always explicit, never implicit",
          "`len()` on a string = byte count, not character count",
        ],
        gotchas: [
          "Iterating `for i, c := range str` gives runes (Unicode), not bytes",
          "`string(65)` gives `\"A\"` (rune→string), not `\"65\"` — use `strconv.Itoa` for numbers",
        ],
        code: `package main

import (
\t"fmt"
\t"math"
\t"strconv"
)

func main() {
\t// Integer types
\tvar i8 int8 = 127
\tvar i32 int32 = 2147483647
\tvar i64 int64 = 9223372036854775807
\tvar u uint = 42        // unsigned
\tvar b byte = 255       // alias for uint8

\t// Float types
\tvar f32 float32 = 3.14
\tvar f64 float64 = math.Pi // 15 decimal digits of precision

\t// Boolean
\tvar flag bool = true

\t// String — immutable UTF-8 byte sequence
\ts := "Hello, 世界"
\tfmt.Println("Bytes:", len(s))       // 13 bytes (world uses 3 bytes each)
\tfmt.Println("Chars:", len([]rune(s))) // 9 characters

\t// Iterate by character (rune)
\tfor i, r := range s {
\t\tif i < 3 {
\t\t\tfmt.Printf("index %d: %c (U+%04X)\\n", i, r, r)
\t\t}
\t}

\t// Type conversion — always explicit
\tvar x int = 42
\tvar xf float64 = float64(x)
\tvar xi int = int(xf * 1.5) // truncates, not rounds

\t// String ↔ int conversion
\tnum := 123
\tstr := strconv.Itoa(num)            // int → string
\tparsed, _ := strconv.Atoi("456")    // string → int

\tfmt.Println(i8, i32, i64, u, b, f32, f64, flag)
\tfmt.Println(x, xf, xi)
\tfmt.Println(str, parsed)
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Control Flow
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "control-flow",
    icon: "🔀",
    title: "Control Flow",
    topics: [
      {
        id: "for-loops",
        title: "For Loops",
        summary: "Go's only loop construct — but it does everything",
        explanation:
          "Go has one loop keyword: `for`. It covers three patterns: the classic C-style `for init; condition; post {}`, the while-style `for condition {}`, and the infinite `for {}`. The `range` keyword iterates over arrays, slices, maps, strings, and channels — it returns index+value pairs. You can use `break` to exit a loop early and `continue` to skip to the next iteration. Label+break lets you break out of nested loops in one step. There is no `while` or `do-while` in Go.",
        keyPoints: [
          "`for range` over a map gives unordered key-value pairs",
          "`for i, v := range slice` — use `_` if you don't need index or value",
          "`for range slice` (no variables) just runs body N times",
          "Labels allow breaking/continuing outer loops: `outer: for { for { break outer } }`",
          "Infinite loop idiom: `for {}` or `for true {}`",
        ],
        code: `package main

import "fmt"

func main() {
\t// 1. Classic C-style for
\tfor i := 0; i < 5; i++ {
\t\tfmt.Print(i, " ")
\t}
\tfmt.Println()

\t// 2. While-style (condition only)
\tn := 1
\tfor n < 100 {
\t\tn *= 2
\t}
\tfmt.Println("First power of 2 >= 100:", n)

\t// 3. range over slice
\tfruits := []string{"apple", "banana", "cherry"}
\tfor i, fruit := range fruits {
\t\tfmt.Printf("%d: %s\\n", i, fruit)
\t}

\t// 4. range over map (order not guaranteed)
\tscores := map[string]int{"Alice": 95, "Bob": 87}
\tfor name, score := range scores {
\t\tfmt.Printf("%s: %d\\n", name, score)
\t}

\t// 5. range over string (iterates runes, not bytes)
\tfor i, r := range "Go!" {
\t\tfmt.Printf("%d: %c\\n", i, r)
\t}

\t// 6. break and continue
\tfor i := 0; i < 10; i++ {
\t\tif i%2 == 0 {
\t\t\tcontinue // skip even numbers
\t\t}
\t\tif i > 7 {
\t\t\tbreak // stop at 7
\t\t}
\t\tfmt.Print(i, " ") // prints: 1 3 5 7
\t}
\tfmt.Println()

\t// 7. Labeled break — exits outer loop
outer:
\tfor i := 0; i < 3; i++ {
\t\tfor j := 0; j < 3; j++ {
\t\t\tif i+j == 3 {
\t\t\t\tbreak outer
\t\t\t}
\t\t\tfmt.Printf("(%d,%d) ", i, j)
\t\t}
\t}
\tfmt.Println()
}`,
      },
      {
        id: "if-else",
        title: "If / Else",
        summary: "Conditionals with an optional initialization statement",
        explanation:
          "Go's `if` statement is mostly like other languages with two notable differences. First, parentheses around the condition are not required (and gofmt removes them). Second, Go allows an initialization statement before the condition: `if val, err := compute(); err != nil { ... }`. Variables declared in the init statement are scoped to the entire if/else chain — they don't leak into the surrounding block. This pattern is idiomatic for error-checked function calls.",
        keyPoints: [
          "No parentheses around conditions — gofmt enforces this",
          "Init statement `if x := f(); x > 0 {}` — x lives only in the if/else chain",
          "There is no ternary operator in Go — always write full if/else",
          "Braces `{}` are mandatory even for single-line bodies",
        ],
        code: `package main

import (
\t"fmt"
\t"math"
)

func classify(n int) string {
\tif n < 0 {
\t\treturn "negative"
\t} else if n == 0 {
\t\treturn "zero"
\t} else {
\t\treturn "positive"
\t}
}

func safeSqrt(x float64) (float64, error) {
\tif x < 0 {
\t\treturn 0, fmt.Errorf("cannot take sqrt of negative: %v", x)
\t}
\treturn math.Sqrt(x), nil
}

func main() {
\tfmt.Println(classify(-5)) // negative
\tfmt.Println(classify(0))  // zero
\tfmt.Println(classify(7))  // positive

\t// Init statement — result scoped to if/else chain
\tif val, err := safeSqrt(16); err != nil {
\t\tfmt.Println("Error:", err)
\t} else {
\t\tfmt.Printf("sqrt(16) = %.2f\\n", val) // 4.00
\t}

\t// Init statement — error case
\tif _, err := safeSqrt(-4); err != nil {
\t\tfmt.Println("Error:", err) // Error: cannot take sqrt of negative: -4
\t}

\t// No ternary — use full if/else
\tage := 20
\tvar status string
\tif age >= 18 {
\t\tstatus = "adult"
\t} else {
\t\tstatus = "minor"
\t}
\tfmt.Println(status)
}`,
      },
      {
        id: "switch",
        title: "Switch",
        summary: "Pattern matching without fall-through by default",
        explanation:
          "Go's `switch` is cleaner than C/Java. Cases don't fall through automatically — no `break` needed at the end of each case. Use `fallthrough` explicitly if you want C-style behavior. Cases can match multiple values with commas. Switch can be used without an expression (it becomes `switch true {}`) which is a clean alternative to long if-else chains. Type switches (`switch v := x.(type)`) extract the dynamic type from an interface — essential when working with `interface{}`.",
        keyPoints: [
          "No implicit fallthrough — each case ends automatically",
          "Use `fallthrough` to explicitly continue to the next case",
          "Multiple values per case: `case 1, 2, 3:`",
          "Expressionless switch: `switch {}` is equivalent to `switch true {}`",
          "Type switch: `switch v := x.(type)` for interface type inspection",
          "Cases can contain arbitrary expressions, not just constants",
        ],
        code: `package main

import "fmt"

func dayType(day string) string {
\tswitch day {
\tcase "Saturday", "Sunday":
\t\treturn "weekend"
\tcase "Monday", "Tuesday", "Wednesday", "Thursday", "Friday":
\t\treturn "weekday"
\tdefault:
\t\treturn "unknown"
\t}
}

func grade(score int) string {
\t// Expressionless switch — cleaner than long if-else chain
\tswitch {
\tcase score >= 90:
\t\treturn "A"
\tcase score >= 80:
\t\treturn "B"
\tcase score >= 70:
\t\treturn "C"
\tdefault:
\t\treturn "F"
\t}
}

// Type switch — inspect interface value's dynamic type
func describe(i interface{}) string {
\tswitch v := i.(type) {
\tcase int:
\t\treturn fmt.Sprintf("int: %d", v)
\tcase string:
\t\treturn fmt.Sprintf("string: %q", v)
\tcase bool:
\t\treturn fmt.Sprintf("bool: %t", v)
\tcase []int:
\t\treturn fmt.Sprintf("[]int with %d elements", len(v))
\tdefault:
\t\treturn fmt.Sprintf("unknown type: %T", v)
\t}
}

func main() {
\tfmt.Println(dayType("Monday"))   // weekday
\tfmt.Println(dayType("Saturday")) // weekend

\tfmt.Println(grade(95)) // A
\tfmt.Println(grade(73)) // C

\tfmt.Println(describe(42))           // int: 42
\tfmt.Println(describe("hello"))      // string: "hello"
\tfmt.Println(describe([]int{1,2,3})) // []int with 3 elements
}`,
      },
      {
        id: "defer",
        title: "Defer",
        summary: "Schedule cleanup to run when the surrounding function returns",
        explanation:
          "A `defer` statement pushes a function call onto a stack. Deferred calls execute in LIFO (last-in, first-out) order when the surrounding function returns — whether by a normal return, a `return` statement, or even a `panic`. This guarantees cleanup logic runs, making it perfect for closing files, unlocking mutexes, or ending spans. Arguments to deferred functions are evaluated immediately when `defer` is called, not when the deferred call executes. This distinction matters for loop variables and closures.",
        keyPoints: [
          "Multiple defers run in LIFO order (last deferred = first to run)",
          "Defer arguments are evaluated at the defer statement, not at execution time",
          "Deferred closures capture variables by reference — useful for named return values",
          "Defers run even when a panic occurs — critical for cleanup guarantees",
          "Common pattern: `defer file.Close()` immediately after opening a file",
        ],
        gotchas: [
          "Deferring in a loop — defers accumulate per function call, not per iteration; use an inner function",
          "Using a deferred closure to modify named return values is a valid (but subtle) pattern",
        ],
        code: `package main

import "fmt"

func main() {
\t// 1. Basic defer — runs after main returns
\tdefer fmt.Println("main: last defer (runs 1st)")
\tdefer fmt.Println("main: second defer (runs 2nd)")
\tdefer fmt.Println("main: first defer (runs 3rd)")
\t// Prints in LIFO: first → second → last

\t// 2. Arguments evaluated immediately
\tx := 10
\tdefer fmt.Println("deferred x:", x) // captures x=10 now
\tx = 20
\tfmt.Println("current x:", x) // 20

\t// 3. Resource cleanup pattern
\tcleanupDemo()

\t// 4. Deferred closure can access modified variables
\tresult := deferredReturn()
\tfmt.Println("named return result:", result)
}

func cleanupDemo() {
\tfmt.Println("opening resource")
\tdefer fmt.Println("closing resource") // guaranteed to run
\tfmt.Println("using resource")
\t// "closing resource" prints even if panic or early return
}

// Deferred closures can modify named return values
func deferredReturn() (result int) {
\tdefer func() {
\t\tresult *= 2 // doubles whatever result was set to
\t}()
\tresult = 5
\treturn // returns 10, not 5
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Data Structures
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "data-structures",
    icon: "🗂️",
    title: "Data Structures",
    topics: [
      {
        id: "arrays",
        title: "Arrays",
        summary: "Fixed-size, value-type sequences — rarely used directly",
        explanation:
          "Arrays in Go have a fixed length that is part of their type: `[3]int` and `[4]int` are different types. This is unlike most languages. Arrays are value types — assigning an array copies all elements. Because of this inflexibility, arrays are seldom used directly in Go code. Their main role is as the backing store for slices. You'll mostly reach for slices instead. However, arrays are useful when the size is truly constant and you want stack allocation.",
        keyPoints: [
          "Array size is part of the type: `[5]int != [6]int`",
          "Arrays are values — assignment copies the entire array",
          "Use `[...]int{1,2,3}` to let the compiler count elements",
          "Multi-dimensional arrays: `[3][3]int` is a 3×3 matrix",
          "Rarely used directly — slices are almost always preferred",
        ],
        code: `package main

import "fmt"

func main() {
\t// Declare with zero values
\tvar a [5]int
\tfmt.Println(a) // [0 0 0 0 0]

\t// Initialize with literal
\tb := [3]int{10, 20, 30}
\tfmt.Println(b[0], b[1], b[2])

\t// Let compiler count elements
\tc := [...]string{"go", "rust", "python"}
\tfmt.Println("len:", len(c)) // 3

\t// Arrays are VALUES — assignment copies
\td := b
\td[0] = 99
\tfmt.Println("b:", b) // b unchanged: [10 20 30]
\tfmt.Println("d:", d) // d modified: [99 20 30]

\t// 2D array — 3x3 matrix
\tmatrix := [3][3]int{
\t\t{1, 2, 3},
\t\t{4, 5, 6},
\t\t{7, 8, 9},
\t}
\tfor _, row := range matrix {
\t\tfor _, val := range row {
\t\t\tfmt.Printf("%d ", val)
\t\t}
\t\tfmt.Println()
\t}
}`,
      },
      {
        id: "slices",
        title: "Slices",
        summary: "Dynamic, reference-type windows over arrays — Go's workhorse",
        explanation:
          "A slice is a descriptor with three fields: pointer to the backing array, length, and capacity. Slices are reference types — two slices pointing to the same array share data. `append` grows the slice and may allocate a new backing array when capacity is exceeded (it doubles approximately). The slice expression `s[low:high]` creates a new slice header sharing the same array. `make([]T, len, cap)` allocates a backing array directly. Understanding this model prevents surprising bugs where modifying a slice affects another.",
        keyPoints: [
          "Slice = (pointer, length, capacity) — three-word header",
          "`append` may return a NEW slice if it reallocates — always assign back: `s = append(s, x)`",
          "`s[a:b]` shares the backing array — mutations are visible in both slices",
          "`copy(dst, src)` copies min(len(dst), len(src)) elements into a NEW array",
          "`make([]int, 5, 10)` creates a slice with len=5, cap=10",
        ],
        gotchas: [
          "Slice from large array keeps the whole array alive in memory — use `copy` to avoid memory leaks",
          "Appending to a sub-slice can overwrite elements of the original",
        ],
        code: `package main

import "fmt"

func main() {
\t// Create with literal
\tnums := []int{1, 2, 3, 4, 5}
\tfmt.Println(nums, "len:", len(nums), "cap:", cap(nums))

\t// make — allocate backing array directly
\ts := make([]int, 3, 6)  // len=3, cap=6
\tfmt.Println(s, "cap:", cap(s))

\t// append — may reallocate
\ts = append(s, 10, 20, 30)
\tfmt.Println(s, "cap:", cap(s))

\t// Slice expression — shares backing array!
\ta := []int{10, 20, 30, 40, 50}
\tb := a[1:3] // {20, 30}
\tb[0] = 99   // modifies a too!
\tfmt.Println("a:", a) // [10 99 30 40 50]
\tfmt.Println("b:", b) // [99 30]

\t// copy — independent array
\tsrc := []int{1, 2, 3}
\tdst := make([]int, len(src))
\tcopy(dst, src)
\tdst[0] = 999
\tfmt.Println("src:", src) // unchanged
\tfmt.Println("dst:", dst) // [999 2 3]

\t// Delete element at index i (without preserving order)
\ti := 2
\tnums[i] = nums[len(nums)-1]
\tnums = nums[:len(nums)-1]
\tfmt.Println("after delete:", nums)

\t// 2D slice (slice of slices)
\tgrid := make([][]int, 3)
\tfor i := range grid {
\t\tgrid[i] = make([]int, 3)
\t\tfor j := range grid[i] {
\t\t\tgrid[i][j] = i*3 + j
\t\t}
\t}
\tfmt.Println(grid)
}`,
      },
      {
        id: "maps",
        title: "Maps",
        summary: "Hash maps — Go's built-in key-value store",
        explanation:
          "Maps are Go's built-in hash table. Keys can be any comparable type (bool, int, string, structs without slices/maps/funcs). Values can be any type. Maps must be initialized with `make` or a literal before use — a nil map panics on write. The two-value lookup `val, ok := m[key]` is idiomatic: `ok` is `false` if the key is absent, preventing confusion with a zero value for a missing key. Maps are NOT safe for concurrent reads+writes — use `sync.Map` or a mutex when goroutines share a map.",
        keyPoints: [
          "Always initialize: `make(map[K]V)` or `map[K]V{...}` — nil map panics on write",
          "Two-value lookup distinguishes 'key absent' from 'key present with zero value'",
          "`delete(m, key)` removes a key; no-op if key doesn't exist",
          "Map iteration order is randomized by design",
          "Maps are NOT thread-safe — use `sync.RWMutex` or `sync.Map` for concurrency",
        ],
        code: `package main

import (
\t"fmt"
\t"sort"
)

func main() {
\t// Create with make
\tscores := make(map[string]int)
\tscores["Alice"] = 95
\tscores["Bob"] = 87
\tscores["Charlie"] = 91

\t// Create with literal
\tcapitals := map[string]string{
\t\t"India":  "New Delhi",
\t\t"Japan":  "Tokyo",
\t\t"France": "Paris",
\t}

\t// Access — returns zero value if key missing
\tfmt.Println(scores["Alice"])    // 95
\tfmt.Println(scores["Unknown"])  // 0 (zero value, NOT an error)

\t// Two-value lookup — check existence
\tval, ok := scores["Bob"]
\tfmt.Printf("Bob: %d, found: %t\\n", val, ok)

\t_, exists := scores["Nobody"]
\tfmt.Println("Nobody exists:", exists) // false

\t// Delete a key
\tdelete(scores, "Charlie")
\tfmt.Println("after delete:", scores)

\t// Iterate — order is random
\tfor city, capital := range capitals {
\t\t_ = city + ": " + capital
\t}

\t// For deterministic order, sort the keys first
\tkeys := make([]string, 0, len(capitals))
\tfor k := range capitals {
\t\tkeys = append(keys, k)
\t}
\tsort.Strings(keys)
\tfor _, k := range keys {
\t\tfmt.Printf("%s → %s\\n", k, capitals[k])
\t}

\t// Map of slices — group by category
\tgroups := map[string][]string{}
\tgroups["fruit"] = append(groups["fruit"], "apple", "banana")
\tgroups["veggie"] = append(groups["veggie"], "carrot")
\tfmt.Println(groups)
}`,
      },
      {
        id: "structs",
        title: "Structs",
        summary: "Composite types that group related fields together",
        explanation:
          "Structs are Go's primary way to define custom data types. They group named fields of potentially different types. Struct fields are accessed with dot notation. Structs are value types — assigning a struct copies all fields. To share or mutate a struct, use a pointer to it. Anonymous fields (embedding) enable struct composition — one of Go's key OOP mechanisms. Struct tags (backtick annotations) are metadata used by packages like `encoding/json` and database ORM libraries.",
        keyPoints: [
          "Structs are values — use pointers (`*MyStruct`) to share or mutate",
          "Exported fields start with uppercase; unexported fields start with lowercase",
          "Embedding: `type Dog struct { Animal }` gives Dog all Animal fields/methods",
          "Struct tags: `` `json:\"name,omitempty\"` `` control JSON serialization",
          "Struct literal: `Person{Name: \"Alice\", Age: 30}` — always use field names",
          "Zero value of a struct has all fields at their zero values — safe default",
        ],
        code: `package main

import (
\t"encoding/json"
\t"fmt"
)

// Basic struct
type Point struct {
\tX, Y float64
}

// Nested struct
type Address struct {
\tStreet string
\tCity   string
\tPin    string
}

// Struct tags for JSON
type User struct {
\tID       int     \`json:"id"\`
\tName     string  \`json:"name"\`
\tEmail    string  \`json:"email,omitempty"\` // omit if empty
\tPassword string  \`json:"-"\`              // never serialized
\tAddress  Address \`json:"address"\`
}

// Embedded struct (composition)
type Animal struct {
\tName string
}

func (a Animal) Speak() string {
\treturn a.Name + " makes a sound"
}

type Dog struct {
\tAnimal       // embedded — Dog inherits Name field and Speak method
\tBreed string
}

func main() {
\t// Struct literal — use field names
\tp := Point{X: 3.0, Y: 4.0}
\tfmt.Println(p.X, p.Y)

\t// Pointer to struct — both syntaxes work
\tpp := &Point{X: 1.0, Y: 2.0}
\tpp.X = 10.0 // Go auto-dereferences: (*pp).X = 10
\tfmt.Println(*pp)

\t// Structs are values — assignment copies
\tp2 := p
\tp2.X = 99
\tfmt.Println(p.X)  // unchanged: 3
\tfmt.Println(p2.X) // modified: 99

\t// Nested struct
\tu := User{
\t\tID:   1,
\t\tName: "Alice",
\t\tAddress: Address{City: "Mumbai", Pin: "400001"},
\t}

\t// JSON serialization using struct tags
\tdata, _ := json.Marshal(u)
\tfmt.Println(string(data))

\t// Embedded struct
\td := Dog{Animal: Animal{Name: "Rex"}, Breed: "Labrador"}
\tfmt.Println(d.Name)    // promoted from Animal
\tfmt.Println(d.Speak()) // promoted method
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Functions
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "functions",
    icon: "⚡",
    title: "Functions",
    topics: [
      {
        id: "functions-basics",
        title: "Functions",
        summary: "First-class functions with multiple return values",
        explanation:
          "Functions in Go are first-class — they can be stored in variables, passed as arguments, and returned from other functions. Go supports multiple return values, which eliminates the need for out-parameters or exception-like error signaling. Named return values pre-declare the return variables and allow a bare `return` (though explicit returns are usually clearer). Functions can be assigned to variables of function type, enabling higher-order patterns.",
        keyPoints: [
          "Multiple return values: `func f() (int, error)` — idiomatic for error handling",
          "Named returns: `func f() (result int, err error)` — useful in complex functions",
          "Functions are first-class: `fn := myFunc; fn()` is valid",
          "Function types: `type Handler func(string) error`",
          "Bare `return` uses named return values — avoid in long functions for clarity",
        ],
        code: `package main

import (
\t"errors"
\t"fmt"
)

// Basic function
func add(a, b int) int {
\treturn a + b
}

// Multiple return values
func divide(a, b float64) (float64, error) {
\tif b == 0 {
\t\treturn 0, errors.New("division by zero")
\t}
\treturn a / b, nil
}

// Named return values
func minMax(arr []int) (min, max int) {
\tmin, max = arr[0], arr[0]
\tfor _, v := range arr[1:] {
\t\tif v < min {
\t\t\tmin = v
\t\t}
\t\tif v > max {
\t\t\tmax = v
\t\t}
\t}
\treturn // bare return — uses named min, max
}

// Functions as values
type Transformer func(int) int

func apply(nums []int, fn Transformer) []int {
\tresult := make([]int, len(nums))
\tfor i, n := range nums {
\t\tresult[i] = fn(n)
\t}
\treturn result
}

func main() {
\tfmt.Println(add(3, 4)) // 7

\t// Multiple returns — always check error
\tresult, err := divide(10, 3)
\tif err != nil {
\t\tfmt.Println("Error:", err)
\t} else {
\t\tfmt.Printf("%.4f\\n", result) // 3.3333
\t}

\t// Named returns
\tnums := []int{3, 1, 4, 1, 5, 9, 2, 6}
\tmin, max := minMax(nums)
\tfmt.Printf("min=%d, max=%d\\n", min, max)

\t// Functions as first-class values
\tdouble := func(n int) int { return n * 2 }
\tsquare := func(n int) int { return n * n }

\tfmt.Println(apply([]int{1, 2, 3, 4}, double)) // [2 4 6 8]
\tfmt.Println(apply([]int{1, 2, 3, 4}, square)) // [1 4 9 16]
}`,
      },
      {
        id: "variadic-functions",
        title: "Variadic Functions",
        summary: "Functions that accept a variable number of arguments",
        explanation:
          "A variadic function accepts zero or more arguments of a given type. Inside the function, the variadic parameter is a slice. Call a variadic function normally (`f(1, 2, 3)`) or spread an existing slice with `...`: `f(slice...)`. This is how `fmt.Println` and `append` work. Variadic parameters must be the last parameter. When spreading a slice, no copy is made — the function receives the same underlying array, so modifications inside the function affect the original slice.",
        keyPoints: [
          "Variadic parameter is received as a slice inside the function",
          "Use `args...` to spread a slice into variadic call",
          "Variadic param must be the last parameter",
          "`fmt.Println`, `fmt.Printf`, `append` are all variadic",
        ],
        code: `package main

import "fmt"

// Sum any number of integers
func sum(nums ...int) int {
\ttotal := 0
\tfor _, n := range nums {
\t\ttotal += n
\t}
\treturn total
}

// Mixed params — variadic must be last
func greet(greeting string, names ...string) {
\tfor _, name := range names {
\t\tfmt.Printf("%s, %s!\\n", greeting, name)
\t}
}

// Generic logger
func log(level string, parts ...interface{}) {
\tfmt.Printf("[%s] ", level)
\tfmt.Println(parts...)
}

func main() {
\t// Call with individual args
\tfmt.Println(sum(1, 2, 3))     // 6
\tfmt.Println(sum(1, 2, 3, 4, 5)) // 15
\tfmt.Println(sum())              // 0

\t// Spread a slice with ...
\tnums := []int{10, 20, 30, 40}
\tfmt.Println(sum(nums...)) // 100

\tgreet("Hello", "Alice", "Bob", "Charlie")

\tlog("INFO", "server started on port", 8080)
\tlog("ERROR", "connection refused:", "timeout")
}`,
      },
      {
        id: "closures",
        title: "Closures",
        summary: "Functions that capture and carry their surrounding scope",
        explanation:
          "A closure is a function value that captures variables from the enclosing scope. The captured variables are shared by reference — changes inside the closure are visible outside and vice versa. This allows closures to maintain state between calls. Common uses: factory functions that return customized function values, iterator generators, and middleware chains. The classic gotcha is capturing a loop variable — all closures in a loop share the SAME variable unless you shadow it.",
        keyPoints: [
          "Closures capture variables by reference, not by value",
          "Each call to a factory function creates an independent closure with its own state",
          "Loop variable gotcha: capture by value with `:= v` or pass as argument",
          "Closures are the foundation of functional patterns in Go",
        ],
        gotchas: [
          "In a goroutine inside a loop: `go func(v int) { ... }(v)` — pass v by value to avoid stale captures",
        ],
        code: `package main

import "fmt"

// Counter factory — returns a new independent counter each call
func makeCounter() func() int {
\tcount := 0
\treturn func() int {
\t\tcount++ // captures count by reference
\t\treturn count
\t}
}

// Adder factory
func makeAdder(base int) func(int) int {
\treturn func(n int) int {
\t\treturn base + n // captures base
\t}
}

// Middleware-style closure
func withLogging(fn func(int) int) func(int) int {
\treturn func(n int) int {
\t\tfmt.Printf("calling fn with %d\\n", n)
\t\tresult := fn(n)
\t\tfmt.Printf("result: %d\\n", result)
\t\treturn result
\t}
}

func main() {
\t// Each makeCounter() call creates independent state
\tc1 := makeCounter()
\tc2 := makeCounter()

\tfmt.Println(c1(), c1(), c1()) // 1 2 3
\tfmt.Println(c2())             // 1 (independent)

\t// Adder closures
\tadd5 := makeAdder(5)
\tadd10 := makeAdder(10)
\tfmt.Println(add5(3))  // 8
\tfmt.Println(add10(3)) // 13

\t// Loop variable gotcha — capture correctly
\tfuncs := make([]func(), 3)
\tfor i := 0; i < 3; i++ {
\t\ti := i // shadow i — each closure gets its own i
\t\tfuncs[i] = func() { fmt.Print(i, " ") }
\t}
\tfor _, f := range funcs {
\t\tf() // prints: 0 1 2 (correct)
\t}
\tfmt.Println()

\t// Compose with middleware
\tsquare := func(n int) int { return n * n }
\tloggedSquare := withLogging(square)
\tloggedSquare(4)
}`,
      },
      {
        id: "recursion",
        title: "Recursion",
        summary: "Functions that call themselves — memoize for efficiency",
        explanation:
          "Go supports recursion but doesn't optimize tail calls. For deeply recursive problems, an iterative approach or explicit stack may be needed to avoid stack overflows. Memoization is a common technique to avoid redundant recursive calls — a map caches already-computed results. `init()` functions and `sync.Once` are alternatives for one-time initialization.",
        keyPoints: [
          "Go does not optimize tail calls — deep recursion can stack overflow",
          "Memoization with a map caches results to avoid redundant calls",
          "For tree/graph traversal, recursion is idiomatic",
          "Mutual recursion (A calls B, B calls A) requires forward declarations or closures",
        ],
        code: `package main

import "fmt"

// Naive fibonacci — exponential time
func fib(n int) int {
\tif n <= 1 {
\t\treturn n
\t}
\treturn fib(n-1) + fib(n-2)
}

// Memoized fibonacci — linear time
func fibMemo(n int, memo map[int]int) int {
\tif n <= 1 {
\t\treturn n
\t}
\tif v, ok := memo[n]; ok {
\t\treturn v
\t}
\tresult := fibMemo(n-1, memo) + fibMemo(n-2, memo)
\tmemo[n] = result
\treturn result
}

// Tree traversal
type TreeNode struct {
\tVal   int
\tLeft  *TreeNode
\tRight *TreeNode
}

func inorder(node *TreeNode) {
\tif node == nil {
\t\treturn
\t}
\tinorder(node.Left)
\tfmt.Print(node.Val, " ")
\tinorder(node.Right)
}

func main() {
\t// Naive — only practical for small n
\tfmt.Println(fib(10)) // 55

\t// Memoized — fast for large n
\tmemo := make(map[int]int)
\tfmt.Println(fibMemo(40, memo)) // 102334155

\t// Tree traversal
\troot := &TreeNode{5,
\t\t&TreeNode{3, &TreeNode{1, nil, nil}, &TreeNode{4, nil, nil}},
\t\t&TreeNode{8, &TreeNode{7, nil, nil}, &TreeNode{9, nil, nil}},
\t}
\tinorder(root)  // 1 3 4 5 7 8 9
\tfmt.Println()
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Methods & Interfaces
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "methods-interfaces",
    icon: "🔌",
    title: "Methods & Interfaces",
    topics: [
      {
        id: "methods",
        title: "Methods",
        summary: "Functions with a receiver — Go's approach to OOP",
        explanation:
          "A method is a function with a receiver argument. The receiver appears between `func` and the method name. Value receivers (`func (t T) Method()`) operate on a copy — the original is unaffected. Pointer receivers (`func (t *T) Method()`) mutate the original. Go automatically takes the address (`p.Method()` → `(&p).Method()`) for pointer receivers if `p` is addressable. Choose pointer receivers when the method mutates the struct OR when the struct is large (avoids copying). For consistency, if any method has a pointer receiver, all methods on that type usually should too.",
        keyPoints: [
          "Value receiver = copy; pointer receiver = original",
          "Go auto-addresses for pointer receivers when the variable is addressable",
          "Methods can be defined on any named type (even `type Celsius float64`)",
          "Cannot define methods on built-in types directly — use type aliases",
          "Pointer receiver methods cannot be called on unaddressable values (e.g., map values)",
        ],
        code: `package main

import (
\t"fmt"
\t"math"
)

type Circle struct {
\tRadius float64
}

// Value receiver — read-only
func (c Circle) Area() float64 {
\treturn math.Pi * c.Radius * c.Radius
}

func (c Circle) Perimeter() float64 {
\treturn 2 * math.Pi * c.Radius
}

// Pointer receiver — mutates
func (c *Circle) Scale(factor float64) {
\tc.Radius *= factor
}

// Methods on non-struct types
type Celsius float64
type Fahrenheit float64

func (c Celsius) ToFahrenheit() Fahrenheit {
\treturn Fahrenheit(c*9/5 + 32)
}

func (f Fahrenheit) ToCelsius() Celsius {
\treturn Celsius((f - 32) * 5 / 9)
}

// String method — used by fmt automatically
func (c Circle) String() string {
\treturn fmt.Sprintf("Circle(r=%.2f)", c.Radius)
}

func main() {
\tc := Circle{Radius: 5}
\tfmt.Println(c)                          // Circle(r=5.00) via String()
\tfmt.Printf("Area: %.2f\\n", c.Area())    // 78.54
\tfmt.Printf("Perimeter: %.2f\\n", c.Perimeter())

\t// Pointer receiver — modify original
\tc.Scale(2)
\tfmt.Printf("After scale: %.2f\\n", c.Radius) // 10.00

\t// Type alias methods
\ttemp := Celsius(100)
\tfmt.Printf("%.1f°C = %.1f°F\\n", temp, temp.ToFahrenheit()) // 100°C = 212°F

\tfahrenheit := Fahrenheit(98.6)
\tfmt.Printf("%.1f°F = %.2f°C\\n", fahrenheit, fahrenheit.ToCelsius())
}`,
      },
      {
        id: "interfaces",
        title: "Interfaces",
        summary: "Implicit satisfaction — the backbone of Go's polymorphism",
        explanation:
          "An interface in Go is a set of method signatures. A type implements an interface by implementing all its methods — no `implements` keyword needed. This is structural (duck) typing. The empty interface `interface{}` (or `any` in Go 1.18+) matches every type. Interface values hold a (type, value) pair internally. A nil interface is different from an interface holding a nil pointer — a common source of bugs. Interfaces enable dependency injection, testable code, and polymorphism without inheritance.",
        keyPoints: [
          "Implicit implementation — no `implements` keyword; if methods match, the type satisfies the interface",
          "`interface{}` / `any` accepts any type",
          "A nil interface is different from an interface containing a nil pointer",
          "Prefer small interfaces: `io.Reader` has 1 method, `io.Writer` has 1 method",
          "Interface composition: `type ReadWriter interface { Reader; Writer }`",
          "Type assertion: `v, ok := i.(ConcreteType)` — safe extraction",
        ],
        gotchas: [
          "An interface holding a nil *T pointer is NOT nil — the interface itself is non-nil",
        ],
        code: `package main

import (
\t"fmt"
\t"math"
)

// Define interface
type Shape interface {
\tArea() float64
\tPerimeter() float64
}

// Stringer interface (like fmt.Stringer)
type Stringer interface {
\tString() string
}

// Rectangle satisfies Shape
type Rectangle struct {
\tWidth, Height float64
}

func (r Rectangle) Area() float64      { return r.Width * r.Height }
func (r Rectangle) Perimeter() float64 { return 2 * (r.Width + r.Height) }
func (r Rectangle) String() string     { return fmt.Sprintf("Rect(%.0fx%.0f)", r.Width, r.Height) }

// Circle satisfies Shape
type Circle struct {
\tRadius float64
}

func (c Circle) Area() float64      { return math.Pi * c.Radius * c.Radius }
func (c Circle) Perimeter() float64 { return 2 * math.Pi * c.Radius }

// Polymorphic function
func printShape(s Shape) {
\tfmt.Printf("Area: %.2f, Perimeter: %.2f\\n", s.Area(), s.Perimeter())
}

// Interface composition
type Describer interface {
\tShape
\tStringer
}

func describe(d Describer) {
\tfmt.Printf("%s → area=%.2f\\n", d.String(), d.Area())
}

func main() {
\tshapes := []Shape{
\t\tRectangle{Width: 10, Height: 5},
\t\tCircle{Radius: 3},
\t}

\tfor _, s := range shapes {
\t\tprintShape(s)
\t}

\t// Rectangle satisfies Describer (has both Shape and String())
\tdescribe(Rectangle{4, 6})

\t// Type assertion — safe form
\tvar s Shape = Circle{Radius: 7}
\tif c, ok := s.(Circle); ok {
\t\tfmt.Printf("It's a circle with radius %.0f\\n", c.Radius)
\t}

\t// Empty interface / any
\tvar anything interface{} = "hello"
\tanything = 42
\tanything = []int{1, 2, 3}
\tfmt.Println(anything)
}`,
      },
      {
        id: "pointers",
        title: "Pointers",
        summary: "Memory addresses — sharing and mutation without copying",
        explanation:
          "A pointer stores the memory address of a value. `&x` gives the address of `x`; `*p` dereferences a pointer to get or set the underlying value. Pointers allow functions to mutate values owned by callers, share large structs without copying, and represent optional/nullable values (nil pointer = absent). Go has no pointer arithmetic (unlike C) — you cannot add offsets to pointers manually. `new(T)` allocates a zero-value T and returns a pointer to it. For slices, maps, and channels use `make` instead.",
        keyPoints: [
          "`&x` address-of; `*p` dereference — read or write through the pointer",
          "nil pointer dereference panics — always check before use",
          "No pointer arithmetic in Go — safety by design",
          "`new(T)` allocates zero-value T, returns `*T`; rarely used (prefer struct literal `&T{}`)",
          "Go's GC manages heap objects — pointers to heap are safe across function calls",
        ],
        code: `package main

import "fmt"

func increment(n *int) {
\t*n++ // modify caller's variable
}

func newValue(v int) *int {
\treturn &v // safe: v escapes to heap
}

type Config struct {
\tHost string
\tPort int
}

func applyDefaults(cfg *Config) {
\tif cfg.Host == "" {
\t\tcfg.Host = "localhost"
\t}
\tif cfg.Port == 0 {
\t\tcfg.Port = 8080
\t}
}

func main() {
\t// Basic pointer
\tx := 10
\tp := &x
\tfmt.Println("x =", x)      // 10
\tfmt.Println("*p =", *p)    // 10
\tfmt.Println("addr =", p)   // 0x...

\t// Mutate via pointer
\t*p = 99
\tfmt.Println("x after *p=99:", x) // 99

\t// Pass pointer to function
\tcount := 5
\tincrement(&count)
\tincrement(&count)
\tfmt.Println("count:", count) // 7

\t// Return pointer — value escapes to heap
\tptr := newValue(42)
\tfmt.Println("*ptr:", *ptr) // 42

\t// Pointer to struct — auto-dereference
\tcfg := &Config{}
\tapplyDefaults(cfg)
\tfmt.Printf("Host: %s, Port: %d\\n", cfg.Host, cfg.Port)

\t// new — allocates and zero-initializes
\tq := new(int) // *int pointing to 0
\t*q = 123
\tfmt.Println(*q)
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Error Handling
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "error-handling",
    icon: "🛡️",
    title: "Error Handling",
    topics: [
      {
        id: "errors",
        title: "Errors",
        summary: "Explicit error values — no exceptions, no surprises",
        explanation:
          "Go uses explicit error values instead of exceptions. Functions signal failure by returning an `error` as the last return value. `error` is a built-in interface: `type error interface { Error() string }`. The caller must explicitly check and handle errors — ignoring them requires explicit use of `_`. `errors.New` creates simple error values; `fmt.Errorf` formats a message and optionally wraps an underlying error with `%w`. `errors.Is` checks if an error (or any in its chain) matches a target; `errors.As` extracts a specific type from the chain.",
        keyPoints: [
          "`error` is an interface — any type with an `Error() string` method is an error",
          "`errors.New(\"msg\")` for simple errors; `fmt.Errorf(\"ctx: %w\", err)` for wrapping",
          "`errors.Is(err, target)` checks the chain; `errors.As(err, &target)` extracts type",
          "Sentinel errors: package-level `var ErrNotFound = errors.New(\"not found\")`",
          "Never silently ignore errors with `_` in production code",
        ],
        code: `package main

import (
\t"errors"
\t"fmt"
)

// Sentinel error — callers can check identity with errors.Is
var ErrNotFound = errors.New("not found")
var ErrInvalidInput = errors.New("invalid input")

// Custom error type — carries extra context
type ValidationError struct {
\tField   string
\tMessage string
}

func (e *ValidationError) Error() string {
\treturn fmt.Sprintf("validation failed on %s: %s", e.Field, e.Message)
}

func findUser(id int) (string, error) {
\tif id <= 0 {
\t\treturn "", fmt.Errorf("findUser(%d): %w", id, ErrInvalidInput)
\t}
\tif id > 100 {
\t\treturn "", fmt.Errorf("findUser(%d): %w", id, ErrNotFound)
\t}
\treturn fmt.Sprintf("User%d", id), nil
}

func validateAge(age int) error {
\tif age < 0 || age > 150 {
\t\treturn &ValidationError{Field: "age", Message: "must be between 0 and 150"}
\t}
\treturn nil
}

func main() {
\t// Basic error check
\tname, err := findUser(42)
\tif err != nil {
\t\tfmt.Println("Error:", err)
\t} else {
\t\tfmt.Println("Found:", name)
\t}

\t// errors.Is — check for sentinel through the chain
\t_, err = findUser(999)
\tif errors.Is(err, ErrNotFound) {
\t\tfmt.Println("User doesn't exist")
\t}

\t_, err = findUser(-1)
\tif errors.Is(err, ErrInvalidInput) {
\t\tfmt.Println("Bad input:", err)
\t}

\t// errors.As — extract typed error
\terr = validateAge(-5)
\tvar vErr *ValidationError
\tif errors.As(err, &vErr) {
\t\tfmt.Printf("Field: %s, Message: %s\\n", vErr.Field, vErr.Message)
\t}
}`,
      },
      {
        id: "panic-recover",
        title: "Panic & Recover",
        summary: "Go's last-resort error mechanism — reserve for truly unrecoverable states",
        explanation:
          "A `panic` stops normal execution and begins unwinding the stack, running deferred functions. If the panic reaches the top of a goroutine without being recovered, the program crashes with a stack trace. `recover` inside a deferred function catches a panic and returns the value passed to `panic()`. The `recover` call returns `nil` if there's no active panic. Use panic only for programmer errors (like nil pointer, index out of bounds), not for expected errors. Libraries should never let panics escape to callers — wrap with recover in public APIs.",
        keyPoints: [
          "`panic(value)` stops normal execution; deferred functions still run",
          "`recover()` inside a `defer` catches the panic — must be called directly in a deferred function",
          "`recover()` returns `nil` when called outside of panic context",
          "Standard library panics on programming errors (nil map write, index out of bounds)",
          "Pattern: `defer func() { if r := recover(); r != nil { ... } }()`",
        ],
        code: `package main

import "fmt"

// Safe division — recovers from panic
func safeDiv(a, b int) (result int, err error) {
\tdefer func() {
\t\tif r := recover(); r != nil {
\t\t\terr = fmt.Errorf("recovered from panic: %v", r)
\t\t}
\t}()
\t// This will panic if b == 0 (integer division by zero)
\tresult = a / b
\treturn
}

// mustPositive panics for invalid input (programmer error)
func mustPositive(n int) int {
\tif n <= 0 {
\t\tpanic(fmt.Sprintf("expected positive number, got %d", n))
\t}
\treturn n
}

// Stack-safe wrapper for library functions
func runSafely(fn func()) (err error) {
\tdefer func() {
\t\tif r := recover(); r != nil {
\t\t\terr = fmt.Errorf("panic: %v", r)
\t\t}
\t}()
\tfn()
\treturn nil
}

func main() {
\t// Normal operation
\tresult, err := safeDiv(10, 2)
\tfmt.Println(result, err) // 5 <nil>

\t// Recovered panic
\tresult, err = safeDiv(10, 0)
\tfmt.Println(result, err) // 0 recovered from panic: ...

\t// Panic in normal use
\tfmt.Println(mustPositive(5)) // 5

\t// Recovering from a panicking function
\terr = runSafely(func() {
\t\tvar s []int
\t\t_ = s[0] // index out of range
\t})
\tfmt.Println("caught:", err)

\t// Deferred functions run even during panic
\tdefer fmt.Println("deferred: always runs")
\tfmt.Println("normal execution")
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Concurrency
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "concurrency",
    icon: "⚙️",
    title: "Concurrency",
    topics: [
      {
        id: "goroutines",
        title: "Goroutines",
        summary: "Lightweight threads — Go's concurrency primitive",
        explanation:
          "A goroutine is a lightweight thread managed by the Go runtime, not the OS. Starting a goroutine costs ~2KB of stack (vs ~1MB for an OS thread) and goroutines are multiplexed onto OS threads by the Go scheduler (M:N threading). Start a goroutine with `go functionCall()`. The `main` goroutine must not exit before spawned goroutines finish — use `sync.WaitGroup` to wait for a collection of goroutines. The Go mantra is 'Don't communicate by sharing memory; share memory by communicating' — prefer channels over shared variables.",
        keyPoints: [
          "`go f()` starts f in a new goroutine — returns immediately to the caller",
          "Goroutines are cheap: ~2KB initial stack, millions can run concurrently",
          "If `main` returns, all goroutines are killed regardless of their state",
          "`sync.WaitGroup`: `Add(n)` before starting, `Done()` in each goroutine, `Wait()` to block",
          "Anonymous goroutines: `go func() { ... }()` — IIFE pattern",
        ],
        gotchas: [
          "Loop variable capture: pass loop var as argument to the goroutine function, not by closure",
        ],
        code: `package main

import (
\t"fmt"
\t"sync"
\t"time"
)

func worker(id int, wg *sync.WaitGroup) {
\tdefer wg.Done() // signal completion when this function returns
\tfmt.Printf("Worker %d starting\\n", id)
\ttime.Sleep(time.Millisecond * 100) // simulate work
\tfmt.Printf("Worker %d done\\n", id)
}

func main() {
\t// Basic goroutine
\tgo fmt.Println("I run concurrently")

\t// WaitGroup — wait for multiple goroutines
\tvar wg sync.WaitGroup
\tfor i := 1; i <= 5; i++ {
\t\twg.Add(1)      // increment BEFORE launching goroutine
\t\tgo worker(i, &wg) // pass wg by pointer
\t}
\twg.Wait() // block until all workers call Done()
\tfmt.Println("All workers finished")

\t// Anonymous goroutine — common for one-off tasks
\tvar wg2 sync.WaitGroup
\tfor i := 0; i < 3; i++ {
\t\twg2.Add(1)
\t\ti := i // capture by value to avoid race
\t\tgo func() {
\t\t\tdefer wg2.Done()
\t\t\tfmt.Printf("goroutine %d\\n", i)
\t\t}()
\t}
\twg2.Wait()
}`,
      },
      {
        id: "channels",
        title: "Channels",
        summary: "Typed pipes for goroutine communication",
        explanation:
          "A channel is a typed, goroutine-safe communication pipe. `make(chan T)` creates an unbuffered channel — send and receive block until both sides are ready (synchronization point). `make(chan T, n)` creates a buffered channel with capacity n — sends block only when the buffer is full, receives block when the buffer is empty. Close a channel with `close(ch)` to signal no more values. A `for range` loop on a channel reads until it's closed. Directional channels (`chan<- T` send-only, `<-chan T` receive-only) express intent in function signatures.",
        keyPoints: [
          "Unbuffered: both sender and receiver must be ready — perfect synchronization",
          "Buffered: decouples sender/receiver; blocks only at capacity (send) or empty (receive)",
          "`close(ch)` signals done — receivers get zero value after close",
          "`for v := range ch` reads until channel is closed",
          "Two-value receive: `v, ok := <-ch` — ok is false when channel is closed and empty",
          "Only the sender should close a channel — closing from receiver side panics",
        ],
        gotchas: [
          "Sending to a closed channel panics",
          "Never close a channel from a receiver goroutine",
        ],
        code: `package main

import (
\t"fmt"
\t"sync"
)

// Pipeline: generator → square → print
func generate(nums ...int) <-chan int {
\tout := make(chan int)
\tgo func() {
\t\tfor _, n := range nums {
\t\t\tout <- n
\t\t}
\t\tclose(out) // signal: no more values
\t}()
\treturn out
}

func square(in <-chan int) <-chan int {
\tout := make(chan int)
\tgo func() {
\t\tfor n := range in { // reads until in is closed
\t\t\tout <- n * n
\t\t}
\t\tclose(out)
\t}()
\treturn out
}

// Fan-out: distribute work to N workers
func fanOut(jobs <-chan int, numWorkers int) <-chan int {
\tresults := make(chan int, numWorkers)
\tvar wg sync.WaitGroup
\tfor i := 0; i < numWorkers; i++ {
\t\twg.Add(1)
\t\tgo func() {
\t\t\tdefer wg.Done()
\t\t\tfor j := range jobs {
\t\t\t\tresults <- j * 2
\t\t\t}
\t\t}()
\t}
\tgo func() {
\t\twg.Wait()
\t\tclose(results)
\t}()
\treturn results
}

func main() {
\t// Pipeline
\tnums := generate(2, 3, 4, 5)
\tsquares := square(nums)
\tfor s := range squares {
\t\tfmt.Print(s, " ") // 4 9 16 25
\t}
\tfmt.Println()

\t// Buffered channel
\tbuf := make(chan string, 3)
\tbuf <- "one"
\tbuf <- "two"
\tbuf <- "three"
\t// No goroutine needed — buffer absorbs the sends
\tfmt.Println(<-buf) // one
\tfmt.Println(<-buf) // two

\t// Fan-out
\tjobs := make(chan int, 5)
\tfor _, v := range []int{10, 20, 30, 40, 50} {
\t\tjobs <- v
\t}
\tclose(jobs)
\tfor r := range fanOut(jobs, 3) {
\t\tfmt.Print(r, " ")
\t}
\tfmt.Println()
}`,
      },
      {
        id: "select",
        title: "Select",
        summary: "Wait on multiple channel operations simultaneously",
        explanation:
          "The `select` statement is like a switch for channels — it waits until one of its cases can proceed, then executes that case. If multiple cases are ready simultaneously, one is chosen at random (fair selection). A `default` case makes select non-blocking. `select {}` (empty select) blocks forever — used to keep a goroutine alive. Timeouts are implemented with `time.After`, which returns a channel that receives after the given duration.",
        keyPoints: [
          "`select` blocks until at least one case is ready",
          "If multiple cases are ready, one is chosen uniformly at random",
          "`default` case runs immediately if no channel is ready — non-blocking",
          "Timeout pattern: `case <-time.After(d):`",
          "Done/cancel pattern: `case <-ctx.Done():` — works with `context.Context`",
        ],
        code: `package main

import (
\t"fmt"
\t"time"
)

func fibonacci(c, quit chan int) {
\tx, y := 0, 1
\tfor {
\t\tselect {
\t\tcase c <- x: // try to send
\t\t\tx, y = y, x+y
\t\tcase <-quit: // quit signal received
\t\t\tfmt.Println("quitting fibonacci")
\t\t\treturn
\t\t}
\t}
}

func main() {
\t// Basic select
\tc1 := make(chan string)
\tc2 := make(chan string)

\tgo func() {
\t\ttime.Sleep(1 * time.Millisecond)
\t\tc1 <- "one"
\t}()
\tgo func() {
\t\ttime.Sleep(2 * time.Millisecond)
\t\tc2 <- "two"
\t}()

\tfor i := 0; i < 2; i++ {
\t\tselect {
\t\tcase msg1 := <-c1:
\t\t\tfmt.Println("Received from c1:", msg1)
\t\tcase msg2 := <-c2:
\t\t\tfmt.Println("Received from c2:", msg2)
\t\t}
\t}

\t// Fibonacci with quit channel
\tc := make(chan int)
\tquit := make(chan int)
\tgo func() {
\t\tfor i := 0; i < 8; i++ {
\t\t\tfmt.Print(<-c, " ")
\t\t}
\t\tquit <- 0
\t}()
\tfibonacci(c, quit)
\tfmt.Println()

\t// Timeout pattern
\tch := make(chan int)
\tselect {
\tcase v := <-ch:
\t\tfmt.Println("received:", v)
\tcase <-time.After(10 * time.Millisecond):
\t\tfmt.Println("timeout — no value received")
\t}

\t// Non-blocking with default
\tselect {
\tcase msg := <-ch:
\t\tfmt.Println("got:", msg)
\tdefault:
\t\tfmt.Println("no message ready (non-blocking)")
\t}
}`,
      },
      {
        id: "mutex",
        title: "Mutex & sync",
        summary: "Protect shared state when channels aren't the right tool",
        explanation:
          "While channels are idiomatic for communication, sometimes you genuinely need shared memory — a counter, a cache, a set. `sync.Mutex` provides mutual exclusion: `Lock()` acquires it; `Unlock()` releases it. Always defer Unlock immediately after Lock to guarantee release even on panics. `sync.RWMutex` allows multiple concurrent readers but only one writer — ideal for read-heavy scenarios. `sync.Once` ensures a function runs exactly once across all goroutines — perfect for lazy initialization. `sync.atomic` provides lock-free operations on integers.",
        keyPoints: [
          "Always `defer mu.Unlock()` immediately after `mu.Lock()` — prevents deadlocks on panics",
          "`sync.RWMutex`: `RLock/RUnlock` for reads, `Lock/Unlock` for writes",
          "`sync.Once.Do(fn)` — fn runs exactly once even across goroutines",
          "`sync/atomic` for simple counters: `atomic.AddInt64(&n, 1)`",
          "The Go race detector (`go run -race`) finds data races at runtime",
        ],
        code: `package main

import (
\t"fmt"
\t"sync"
\t"sync/atomic"
)

// Thread-safe counter with Mutex
type SafeCounter struct {
\tmu    sync.Mutex
\tvalue int
}

func (c *SafeCounter) Inc() {
\tc.mu.Lock()
\tdefer c.mu.Unlock()
\tc.value++
}

func (c *SafeCounter) Get() int {
\tc.mu.Lock()
\tdefer c.mu.Unlock()
\treturn c.value
}

// Read-heavy cache with RWMutex
type Cache struct {
\tmu   sync.RWMutex
\tdata map[string]string
}

func (c *Cache) Set(key, val string) {
\tc.mu.Lock()         // exclusive write lock
\tdefer c.mu.Unlock()
\tc.data[key] = val
}

func (c *Cache) Get(key string) (string, bool) {
\tc.mu.RLock()          // shared read lock
\tdefer c.mu.RUnlock()
\tv, ok := c.data[key]
\treturn v, ok
}

func main() {
\t// Safe counter
\tvar wg sync.WaitGroup
\tcounter := &SafeCounter{}
\tfor i := 0; i < 1000; i++ {
\t\twg.Add(1)
\t\tgo func() {
\t\t\tdefer wg.Done()
\t\t\tcounter.Inc()
\t\t}()
\t}
\twg.Wait()
\tfmt.Println("Counter:", counter.Get()) // 1000

\t// sync.Once — initialize exactly once
\tvar once sync.Once
\tvar config string
\tfor i := 0; i < 5; i++ {
\t\tonce.Do(func() {
\t\t\tconfig = "initialized"
\t\t\tfmt.Println("config initialized (runs once)")
\t\t})
\t}
\tfmt.Println("config:", config)

\t// atomic counter — lock-free
\tvar atomicCount int64
\tfor i := 0; i < 1000; i++ {
\t\twg.Add(1)
\t\tgo func() {
\t\t\tdefer wg.Done()
\t\t\tatomic.AddInt64(&atomicCount, 1)
\t\t}()
\t}
\twg.Wait()
\tfmt.Println("Atomic counter:", atomic.LoadInt64(&atomicCount)) // 1000
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Standard Library Essentials
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "stdlib",
    icon: "📦",
    title: "Standard Library",
    topics: [
      {
        id: "string-formatting",
        title: "String Formatting",
        summary: "fmt verbs — the complete formatting toolkit",
        explanation:
          "The `fmt` package's formatting verbs let you control exactly how values are printed. `%v` is the default for any value; `%+v` adds field names for structs; `%#v` gives Go syntax representation. `%T` prints the type. String-specific: `%s` for plain string, `%q` for quoted. Numeric: `%d` decimal, `%b` binary, `%x` hex, `%f` float, `%e` scientific, `%g` compact. `Sprintf` returns a formatted string (doesn't print). `Fprintf` writes to an `io.Writer`. The `%w` verb in `fmt.Errorf` wraps an error for `errors.Is/As` unwrapping.",
        keyPoints: [
          "`%v` default; `%+v` struct with field names; `%#v` Go syntax",
          "`%T` prints the type of a value",
          "`%d` decimal; `%b` binary; `%o` octal; `%x` lowercase hex; `%X` uppercase hex",
          "`%f` fixed-point float; `%e` scientific; `%g` shortest representation",
          "`%.2f` — precision: 2 decimal places; `%8d` — width 8, right-aligned; `%-8d` left-aligned",
          "`%w` in Errorf wraps an error — only verb that changes error semantics",
        ],
        code: `package main

import "fmt"

type Person struct {
\tName string
\tAge  int
}

func main() {
\tp := Person{"Alice", 30}

\t// General verbs
\tfmt.Printf("%v\\n", p)   // {Alice 30}
\tfmt.Printf("%+v\\n", p)  // {Name:Alice Age:30}
\tfmt.Printf("%#v\\n", p)  // main.Person{Name:"Alice", Age:30}
\tfmt.Printf("%T\\n", p)   // main.Person

\t// Boolean
\tfmt.Printf("%t\\n", true) // true

\t// Integer verbs
\tn := 42
\tfmt.Printf("%d %b %o %x %X\\n", n, n, n, n, n)
\t// 42 101010 52 2a 2A

\t// Width and padding
\tfmt.Printf("[%8d]\\n", n)   // [      42] right-aligned
\tfmt.Printf("[%-8d]\\n", n)  // [42      ] left-aligned
\tfmt.Printf("[%08d]\\n", n)  // [00000042] zero-padded

\t// Float verbs
\tf := 3.14159265
\tfmt.Printf("%.2f\\n", f)   // 3.14
\tfmt.Printf("%.4f\\n", f)   // 3.1416
\tfmt.Printf("%8.2f\\n", f)  // "    3.14" width 8
\tfmt.Printf("%e\\n", f)     // 3.141593e+00
\tfmt.Printf("%g\\n", f)     // 3.14159265

\t// String verbs
\ts := "Hello, Go"
\tfmt.Printf("%s\\n", s)     // Hello, Go
\tfmt.Printf("%q\\n", s)     // "Hello, Go"
\tfmt.Printf("%10s\\n", s)   //  Hello, Go (right-aligned)
\tfmt.Printf("%-10s|\\n", s) // Hello, Go| (left-aligned)

\t// Sprintf — returns string
\tmsg := fmt.Sprintf("Name: %s, Age: %d", p.Name, p.Age)
\tfmt.Println(msg)
}`,
      },
      {
        id: "type-conversions",
        title: "Type Conversions (strconv)",
        summary: "Converting between strings, numbers, and booleans with the strconv package",
        explanation:
          "Go never implicitly converts between types — every conversion is explicit. For numeric type casting (`int` → `float64`, `int64` → `int32`), use the Go syntax `T(value)`. For string ↔ numeric conversions you need the `strconv` package: `strconv.Atoi` / `strconv.Itoa` for int↔string; `strconv.ParseFloat` / `strconv.FormatFloat` for float↔string; `strconv.ParseBool` / `strconv.FormatBool` for bool↔string; `strconv.ParseInt` for any base (binary, octal, hex). All Parse functions return `(value, error)` — always check the error because bad input returns the zero value silently. `fmt.Sprintf(\"%v\", x)` is a quick-but-slow alternative to `strconv.Format*` for simple cases.",
        keyPoints: [
          "`strconv.Atoi(s)` → `(int, error)` — \"ASCII to int\"; `strconv.Itoa(n)` → `string`",
          "`strconv.ParseFloat(s, bitSize)` — bitSize is 32 or 64; always use 64 unless you need float32",
          "`strconv.ParseInt(s, base, bitSize)` — base 0 auto-detects (0x → hex, 0 → octal, else decimal)",
          "`strconv.ParseBool` accepts: \"1\", \"t\", \"T\", \"true\", \"TRUE\", \"0\", \"f\", \"false\", \"FALSE\"",
          "`strconv.FormatFloat(f, fmt, prec, bitSize)` — fmt 'f' fixed, 'e' scientific, 'g' shortest",
          "Numeric type casting: `int(myFloat64)` truncates (does not round); `float64(myInt)` is exact",
          "`strconv.Quote(s)` / `strconv.Unquote(s)` — escape/unescape a Go string literal",
        ],
        examples: [
          // String ↔ Int
          { expr: `strconv.Atoi("42")`,        result: `42, nil`,    note: "string → int — happy path" },
          { expr: `strconv.Atoi("abc")`,        result: `0, error`,   note: "invalid string → zero + error" },
          { expr: `strconv.Itoa(99)`,           result: `"99"`,       note: "int → string" },
          { expr: `string(65)`,                 result: `"A"`,        note: "⚠ rune → string, NOT the digit 65" },
          { expr: `strconv.FormatInt(255, 16)`, result: `"ff"`,       note: "int → hex string" },
          { expr: `strconv.FormatInt(10, 2)`,   result: `"1010"`,     note: "int → binary string" },
          { expr: `strconv.ParseInt("FF", 16, 64)`, result: `255, nil`, note: "hex string → int64" },
          { expr: `strconv.ParseInt("1010", 2, 64)`, result: `10, nil`, note: "binary string → int64" },
          // String ↔ Float
          { expr: `strconv.ParseFloat("3.14", 64)`,           result: `3.14, nil`,   note: "string → float64" },
          { expr: `strconv.ParseFloat("bad", 64)`,            result: `0, error`,    note: "invalid → zero + error" },
          { expr: `strconv.FormatFloat(3.14159, 'f', 2, 64)`, result: `"3.14"`,      note: "float → fixed 2 decimal places" },
          { expr: `strconv.FormatFloat(3.14159, 'e', 3, 64)`, result: `"3.142e+00"`, note: "float → scientific notation" },
          { expr: `strconv.FormatFloat(3.14159, 'g', -1, 64)`,result: `"3.14159"`,   note: "float → shortest representation" },
          // String ↔ Bool
          { expr: `strconv.ParseBool("true")`,  result: `true, nil`,  note: "\"true\" / \"1\" / \"T\" / \"TRUE\" all valid" },
          { expr: `strconv.ParseBool("1")`,      result: `true, nil`,  note: "\"1\" → true" },
          { expr: `strconv.ParseBool("yes")`,    result: `false, error`, note: "⚠ \"yes\" is NOT a valid bool string" },
          { expr: `strconv.FormatBool(true)`,    result: `"true"`,     note: "bool → string" },
          // Numeric type casting
          { expr: `int(3.9)`,                   result: `3`,          note: "⚠ truncates, does NOT round" },
          { expr: `int(math.Round(3.9))`,        result: `4`,          note: "round first, then cast" },
          { expr: `float64(7)`,                  result: `7.0`,        note: "int → float64, always exact" },
          { expr: `int8(1000)`,                  result: `-24`,        note: "⚠ overflow wraps silently" },
          // String escaping
          { expr: `strconv.Quote("hi\tthere")`,  result: `"\"hi\\tthere\""`, note: "escape special chars" },
        ],
        gotchas: [
          "`int(3.9)` is 3, not 4 — truncation, not rounding. Use `math.Round` then cast if rounding is needed",
          "`string(65)` gives `\"A\"` (rune to string), NOT `\"65\"` — always use `strconv.Itoa` for int → string",
          "Parsing an empty string returns zero value + error, not a panic",
          "`strconv.ParseFloat(\"1e308\", 64)` overflows to `+Inf` without error — check with `math.IsInf`",
        ],
        code: `package main

import (
\t"fmt"
\t"math"
\t"strconv"
)

func main() {
\t// ── String → Int ──────────────────────────────────────────
\tn, err := strconv.Atoi("42")
\tif err != nil {
\t\tfmt.Println("error:", err)
\t} else {
\t\tfmt.Println("Atoi:", n, "(type: int)")
\t}

\t// Bad input — error, zero value returned
\t_, err = strconv.Atoi("abc")
\tfmt.Println("bad Atoi err:", err) // strconv.Atoi: parsing "abc": invalid syntax

\t// ParseInt — choose base and bit size explicitly
\ti64, _ := strconv.ParseInt("FF", 16, 64) // hex → int64
\tfmt.Println("ParseInt hex FF:", i64)      // 255

\ti64b, _ := strconv.ParseInt("1010", 2, 64) // binary
\tfmt.Println("ParseInt binary 1010:", i64b)  // 10

\ti64c, _ := strconv.ParseInt("-99", 10, 64) // signed
\tfmt.Println("ParseInt signed:", i64c)       // -99

\tunsigned, _ := strconv.ParseUint("4294967295", 10, 32)
\tfmt.Println("ParseUint:", unsigned) // 4294967295

\t// ── Int → String ──────────────────────────────────────────
\ts := strconv.Itoa(123)
\tfmt.Println("Itoa:", s, "(type: string)") // "123"

\t// GOTCHA: string(65) gives "A", not "65"
\tfmt.Println("string(65):", string(65))    // A  ← rune, not number!
\tfmt.Println("Itoa(65):", strconv.Itoa(65)) // 65 ← correct

\t// FormatInt — custom base
\tfmt.Println("FormatInt 255 hex:", strconv.FormatInt(255, 16)) // ff
\tfmt.Println("FormatInt 10 bin:", strconv.FormatInt(10, 2))    // 1010

\t// ── String → Float ────────────────────────────────────────
\tf, err := strconv.ParseFloat("3.14159", 64)
\tif err != nil {
\t\tfmt.Println("error:", err)
\t} else {
\t\tfmt.Printf("ParseFloat: %.5f\\n", f) // 3.14159
\t}

\tf32, _ := strconv.ParseFloat("2.718", 32) // parsed as float32 precision
\tfmt.Printf("ParseFloat32: %.4f\\n", f32)   // 2.7180

\t_, err = strconv.ParseFloat("not-a-number", 64)
\tfmt.Println("bad ParseFloat err:", err)

\t// ── Float → String ────────────────────────────────────────
\tpi := math.Pi
\t// 'f' = fixed, -1 prec = shortest representation, 64 = float64
\tfmt.Println("FormatFloat f:", strconv.FormatFloat(pi, 'f', 5, 64))  // 3.14159
\tfmt.Println("FormatFloat e:", strconv.FormatFloat(pi, 'e', 4, 64))  // 3.1416e+00
\tfmt.Println("FormatFloat g:", strconv.FormatFloat(pi, 'g', -1, 64)) // 3.141592653589793

\t// ── String → Bool ─────────────────────────────────────────
\tb1, _ := strconv.ParseBool("true")
\tb2, _ := strconv.ParseBool("1")
\tb3, _ := strconv.ParseBool("FALSE")
\tb4, _ := strconv.ParseBool("T")
\tfmt.Println("ParseBool:", b1, b2, b3, b4) // true true false true

\t_, err = strconv.ParseBool("yes") // "yes" is NOT valid
\tfmt.Println("ParseBool 'yes' err:", err)

\t// ── Bool → String ─────────────────────────────────────────
\tfmt.Println("FormatBool true:", strconv.FormatBool(true))   // true
\tfmt.Println("FormatBool false:", strconv.FormatBool(false)) // false

\t// ── Numeric type casting ──────────────────────────────────
\tvar bigFloat float64 = 9.99
\ttruncated := int(bigFloat)        // 9 — truncates, does NOT round
\trounded := int(math.Round(bigFloat)) // 10 — round first, then cast
\tfmt.Println("truncated:", truncated, "rounded:", rounded)

\tvar x int = 1000
\tvar x8 int8 = int8(x)   // overflow! int8 max is 127
\tfmt.Println("int → int8 overflow:", x8) // -24 (wraps around)

\tvar f64 float64 = 1.5
\tvar f32b float32 = float32(f64) // precision loss possible for large values
\tfmt.Println("float64 → float32:", f32b)

\t// ── String escaping ───────────────────────────────────────
\tquoted := strconv.Quote("Hello\\tWorld\\n\"Go\"")
\tfmt.Println("Quote:", quoted)

\tunquoted, _ := strconv.Unquote(\`"Hello\\tWorld"\`)
\tfmt.Println("Unquote:", unquoted)
}`,
      },
      {
        id: "sorting",
        title: "Sorting",
        summary: "sort package — built-in and custom comparison",
        explanation:
          "The `sort` package provides sorting for slices of basic types and custom comparators. `sort.Ints`, `sort.Strings`, `sort.Float64s` sort in place. For custom types or custom orderings, use `sort.Slice(slice, lessFunc)` with a comparison function. `sort.SliceStable` preserves the relative order of equal elements. `sort.Search` performs binary search. In Go 1.21+, the `slices` package provides generic sort functions: `slices.Sort`, `slices.SortFunc`.",
        keyPoints: [
          "`sort.Ints`, `sort.Strings` — sort in place, ascending",
          "`sort.Slice(s, func(i,j int) bool)` — custom comparator",
          "`sort.SliceStable` — preserves original order of equal elements",
          "`sort.Search(n, fn)` — binary search; returns smallest index where fn(i) is true",
          "Go 1.21+: `slices.Sort`, `slices.SortFunc` are generic alternatives",
        ],
        code: `package main

import (
\t"fmt"
\t"sort"
)

type Employee struct {
\tName   string
\tSalary int
\tAge    int
}

func main() {
\t// Sort basic types
\tnums := []int{5, 2, 4, 1, 3}
\tsort.Ints(nums)
\tfmt.Println(nums) // [1 2 3 4 5]

\twords := []string{"banana", "apple", "cherry", "date"}
\tsort.Strings(words)
\tfmt.Println(words) // [apple banana cherry date]

\t// Check if sorted
\tfmt.Println(sort.IntsAreSorted(nums)) // true

\t// Custom sort with sort.Slice
\temployees := []Employee{
\t\t{"Alice", 90000, 30},
\t\t{"Bob", 75000, 25},
\t\t{"Charlie", 90000, 28},
\t\t{"Dave", 85000, 35},
\t}

\t// Sort by salary descending, then by name ascending
\tsort.SliceStable(employees, func(i, j int) bool {
\t\tif employees[i].Salary != employees[j].Salary {
\t\t\treturn employees[i].Salary > employees[j].Salary
\t\t}
\t\treturn employees[i].Name < employees[j].Name
\t})

\tfor _, e := range employees {
\t\tfmt.Printf("%-10s %d  age:%d\\n", e.Name, e.Salary, e.Age)
\t}

\t// Binary search — slice must be sorted
\tsortedNums := []int{1, 3, 5, 7, 9, 11}
\ttarget := 7
\ti := sort.SearchInts(sortedNums, target)
\tif i < len(sortedNums) && sortedNums[i] == target {
\t\tfmt.Printf("Found %d at index %d\\n", target, i)
\t}
}`,
      },
      {
        id: "context",
        title: "Context",
        summary: "Cancellation, deadlines, and request-scoped values",
        explanation:
          "The `context` package provides a standard way to carry cancellation signals, deadlines, and request-scoped values across API boundaries and goroutines. `context.Background()` is the root context (never cancelled). `context.WithCancel` returns a derived context and a `cancel` function — calling cancel propagates cancellation downstream. `context.WithTimeout` and `context.WithDeadline` add time-based cancellation. Pass context as the first argument to functions that do I/O or call other services — this is a Go convention. Never store contexts in structs.",
        keyPoints: [
          "Always pass context as the first parameter: `func Do(ctx context.Context, ...)`",
          "`context.WithCancel` → call cancel() when done, always: `defer cancel()`",
          "`ctx.Done()` returns a channel closed when the context is cancelled/timed out",
          "`ctx.Err()` returns `context.Canceled` or `context.DeadlineExceeded`",
          "`context.WithValue` passes request-scoped values — use typed keys to avoid collisions",
        ],
        code: `package main

import (
\t"context"
\t"fmt"
\t"time"
)

// Simulate a slow operation that respects context cancellation
func slowOperation(ctx context.Context, id int) error {
\tselect {
\tcase <-time.After(200 * time.Millisecond): // work done
\t\tfmt.Printf("operation %d completed\\n", id)
\t\treturn nil
\tcase <-ctx.Done(): // cancelled or timed out
\t\treturn ctx.Err()
\t}
}

// Context value key — use typed keys to avoid collisions
type ctxKey string

const requestIDKey ctxKey = "requestID"

func processRequest(ctx context.Context) {
\trequestID := ctx.Value(requestIDKey)
\tfmt.Printf("processing request: %v\\n", requestID)
}

func main() {
\t// WithCancel — manual cancellation
\tctx, cancel := context.WithCancel(context.Background())
\tdefer cancel() // always cancel to free resources

\tgo func() {
\t\ttime.Sleep(50 * time.Millisecond)
\t\tcancel() // cancel after 50ms
\t}()

\terr := slowOperation(ctx, 1)
\tif err != nil {
\t\tfmt.Println("Error:", err) // context canceled
\t}

\t// WithTimeout — auto-cancel after duration
\tctx2, cancel2 := context.WithTimeout(context.Background(), 100*time.Millisecond)
\tdefer cancel2()

\terr = slowOperation(ctx2, 2) // takes 200ms — will timeout
\tif err != nil {
\t\tfmt.Println("Error:", err) // context deadline exceeded
\t}

\t// Successful operation — completes before timeout
\tctx3, cancel3 := context.WithTimeout(context.Background(), 500*time.Millisecond)
\tdefer cancel3()
\terr = slowOperation(ctx3, 3)
\tfmt.Println("op3:", err) // <nil>

\t// WithValue — attach request-scoped data
\tctx4 := context.WithValue(context.Background(), requestIDKey, "req-abc-123")
\tprocessRequest(ctx4)
}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 9. Advanced Go
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "advanced",
    icon: "🧠",
    title: "Advanced Go",
    topics: [
      {
        id: "generics",
        title: "Generics",
        summary: "Type parameters — write once, use for any type (Go 1.18+)",
        explanation:
          "Generics (type parameters) were added in Go 1.18. They let you write functions and types that work with any type satisfying a constraint. A constraint is an interface — `any` means no restriction; `comparable` means equality is supported; custom constraints define allowed method sets or type sets. Type inference means you usually don't need to specify the type parameter explicitly when calling a generic function — Go infers it from the arguments.",
        keyPoints: [
          "Syntax: `func F[T Constraint](v T) T`",
          "`any` constraint = no restriction (`interface{}`); `comparable` = supports == !=",
          "Type inference: compiler deduces T from call arguments — no explicit `F[int](...)`",
          "Generic types: `type Stack[T any] struct { items []T }`",
          "Union constraints: `type Number interface { int | int64 | float64 }` — allows only those types",
        ],
        code: `package main

import (
\t"fmt"
\t"golang.org/x/exp/constraints" // or define your own
)

// Generic Map — transform a slice
func Map[T, U any](s []T, fn func(T) U) []U {
\tresult := make([]U, len(s))
\tfor i, v := range s {
\t\tresult[i] = fn(v)
\t}
\treturn result
}

// Generic Filter
func Filter[T any](s []T, pred func(T) bool) []T {
\tvar result []T
\tfor _, v := range s {
\t\tif pred(v) {
\t\t\tresult = append(result, v)
\t\t}
\t}
\treturn result
}

// Custom constraint — numeric types
type Number interface {
\tint | int64 | float64
}

func Sum[T Number](nums []T) T {
\tvar total T
\tfor _, n := range nums {
\t\ttotal += n
\t}
\treturn total
}

// Generic Stack data structure
type Stack[T any] struct {
\titems []T
}

func (s *Stack[T]) Push(item T) {
\ts.items = append(s.items, item)
}

func (s *Stack[T]) Pop() (T, bool) {
\tif len(s.items) == 0 {
\t\tvar zero T
\t\treturn zero, false
\t}
\titem := s.items[len(s.items)-1]
\ts.items = s.items[:len(s.items)-1]
\treturn item, true
}

func (s *Stack[T]) Len() int { return len(s.items) }

func main() {
\t// Map — double integers
\tnums := []int{1, 2, 3, 4, 5}
\tdoubled := Map(nums, func(n int) int { return n * 2 })
\tfmt.Println(doubled) // [2 4 6 8 10]

\t// Map — convert int to string
\tstrs := Map(nums, func(n int) string { return fmt.Sprintf("%d", n) })
\tfmt.Println(strs) // [1 2 3 4 5]

\t// Filter — keep even numbers
\tevens := Filter(nums, func(n int) bool { return n%2 == 0 })
\tfmt.Println(evens) // [2 4]

\t// Generic Sum works for int and float64
\tfmt.Println(Sum([]int{1, 2, 3}))              // 6
\tfmt.Println(Sum([]float64{1.5, 2.5, 3.0}))   // 7

\t// Generic Stack
\tvar s Stack[string]
\ts.Push("hello")
\ts.Push("world")
\tv, ok := s.Pop()
\tfmt.Println(v, ok) // world true
\tfmt.Println(s.Len()) // 1
}`,
      },
      {
        id: "type-assertions",
        title: "Type Assertions & Type Switches",
        summary: "Extract concrete types from interface values safely",
        explanation:
          "When you hold an `interface{}` or any interface value, you often need to extract the concrete type to access type-specific methods or fields. Type assertion `v := i.(T)` panics if the interface doesn't hold a T — always use the safe two-value form `v, ok := i.(T)`. Type switches are cleaner when you need to handle multiple types — they avoid repeated `if/else` assertions. This is essential when working with JSON unmarshaling, reflection, or any API that returns `interface{}`.",
        keyPoints: [
          "Safe assertion: `v, ok := i.(T)` — ok is false on mismatch, no panic",
          "Unsafe assertion: `v := i.(T)` — panics if i doesn't hold T",
          "Type switch: `switch v := i.(type) { case int: ... }` — cleanest multi-type handling",
          "The `v` in type switch has the concrete type inside each case",
          "`interface{}` / `any` can hold any value — use assertions to extract",
        ],
        code: `package main

import "fmt"

// JSON-like dynamic data
type JSONValue interface{}

func processValue(v JSONValue) {
\tswitch val := v.(type) {
\tcase nil:
\t\tfmt.Println("null")
\tcase bool:
\t\tfmt.Printf("bool: %t\\n", val)
\tcase int:
\t\tfmt.Printf("int: %d\\n", val)
\tcase float64:
\t\tfmt.Printf("float64: %.2f\\n", val)
\tcase string:
\t\tfmt.Printf("string: %q\\n", val)
\tcase []interface{}:
\t\tfmt.Printf("array with %d elements\\n", len(val))
\tcase map[string]interface{}:
\t\tfmt.Printf("object with %d keys\\n", len(val))
\tdefault:
\t\tfmt.Printf("unknown: %T\\n", val)
\t}
}

// Type assertion to access interface-specific method
type Animal interface {
\tSound() string
}
type Dog struct{ Name string }
type Cat struct{ Name string }

func (d Dog) Sound() string { return "woof" }
func (c Cat) Sound() string { return "meow" }
func (d Dog) Fetch() string { return d.Name + " fetches!" }

func main() {
\t// Process various types
\tprocessValue(42)
\tprocessValue(3.14)
\tprocessValue("hello")
\tprocessValue(true)
\tprocessValue(nil)
\tprocessValue([]interface{}{1, 2, 3})

\t// Safe type assertion
\tvar a Animal = Dog{Name: "Rex"}

\t// Safe form — check before use
\tif dog, ok := a.(Dog); ok {
\t\tfmt.Println(dog.Fetch()) // access Dog-specific method
\t}

\t// Unsafe form — panics if wrong type
\tcat := a.(Dog) // fine — a is a Dog
\t_ = cat

\t// Would panic:
\t// _ = a.(Cat) // panic: interface conversion: a is Dog, not Cat
}`,
      },
      {
        id: "init-functions",
        title: "init Functions & Package Initialization",
        summary: "Package-level setup that runs once, automatically",
        explanation:
          "Each Go source file can have one or more `init()` functions. They run automatically — once per package — after all package-level variable declarations have been initialized, but before `main()`. Multiple `init` functions in the same file run in source order; across files they run in the order the files are processed. `init` functions cannot be called explicitly and don't take arguments or return values. Common uses: registering drivers (database/sql), validating configuration, seeding random generators, and initializing package-level state that requires logic.",
        keyPoints: [
          "Each file can have multiple `init()` functions; all run automatically",
          "Order: package-level vars → init() → main()",
          "Imported packages' init functions run before the importing package's",
          "Import for side effects: `import _ \"pkg\"` runs pkg's init without using any symbols",
          "`init` cannot be called manually — it's reserved by the compiler",
        ],
        code: `package main

import (
\t"fmt"
\t"math/rand"
\t"time"
)

// Package-level vars initialized before init()
var config = loadConfig()

func loadConfig() map[string]string {
\tfmt.Println("1. loadConfig() called (package-level var)")
\treturn map[string]string{"env": "production"}
}

// init runs after all package-level vars are set
func init() {
\tfmt.Println("2. init() called — seeding random")
\trand.Seed(time.Now().UnixNano())
}

// Multiple init functions in one file — run in order
func init() {
\tfmt.Printf("3. second init() — config loaded: %v\\n", config)
}

func main() {
\tfmt.Println("4. main() started")
\tfmt.Println("random:", rand.Intn(100))
}

// Output order:
// 1. loadConfig() called (package-level var)
// 2. init() called — seeding random
// 3. second init() — config loaded: map[env:production]
// 4. main() started`,
      },
    ],
  },
];
