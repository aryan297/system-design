export const DSA_TEMPLATES = {
  "arrays-two-pointers": {
    title: "Arrays + Two Pointers — Templates",
    description: "Two pointers eliminate nested loops by maintaining two indices that move toward each other or in the same direction, reducing O(n²) to O(n).",
    variants: [
      {
        name: "Opposite Ends",
        when: "Sorted array — find pair/triplet, container water, valid palindrome",
        code: `// ── TWO POINTERS: OPPOSITE ENDS ────────────────────────────────
// Shrink the window from both sides based on a condition.
// Requires sorted input (or a problem where ends are meaningful).

left, right := 0, len(nums)-1

for left < right {
    sum := nums[left] + nums[right]

    if sum == target {
        // found — record result
        left++
        right--
    } else if sum < target {
        left++  // need larger sum → move left pointer right
    } else {
        right-- // need smaller sum → move right pointer left
    }
}`,
      },
      {
        name: "Fast / Slow (Write Pointer)",
        when: "Remove duplicates in-place, filter elements, partition array",
        code: `// ── TWO POINTERS: FAST / SLOW (WRITE POINTER) ─────────────────
// write tracks where the next valid element goes.
// read scans every element exactly once.

write := 0

for read := 0; read < len(nums); read++ {
    if shouldKeep(nums[read]) {
        nums[write] = nums[read]
        write++
    }
    // elements at indices >= write are "don't care" garbage
}

return write // new valid length`,
      },
      {
        name: "Squares of Sorted Array (Fill from Back)",
        when: "Output array filled largest-first; avoids extra sort pass",
        code: `// ── TWO POINTERS: FILL FROM BACK ───────────────────────────────
// Largest squares are always at one of the two ends.
// Fill result from the back to keep it sorted.

n := len(nums)
result := make([]int, n)
left, right := 0, n-1

for i := n - 1; i >= 0; i-- {
    l := nums[left] * nums[left]
    r := nums[right] * nums[right]
    if l > r {
        result[i] = l
        left++
    } else {
        result[i] = r
        right--
    }
}

return result`,
      },
    ],
  },

  "sliding-window": {
    title: "Sliding Window — Templates",
    description: "Maintain a window (subarray/substring) and slide it across the input. Fixed windows have constant size k; variable windows expand/shrink based on a validity condition.",
    variants: [
      {
        name: "Fixed Window (size k)",
        when: "Max/min/average of every subarray of exactly size k",
        code: `// ── SLIDING WINDOW: FIXED SIZE K ───────────────────────────────
// Build first window, then slide — add right element, drop left.

k := 3 // window size
windowSum := 0

// build first window
for i := 0; i < k; i++ {
    windowSum += nums[i]
}

best := windowSum

// slide: O(1) per step
for i := k; i < len(nums); i++ {
    windowSum += nums[i]       // add incoming right element
    windowSum -= nums[i-k]     // drop outgoing left element
    if windowSum > best {
        best = windowSum
    }
}

return best`,
      },
      {
        name: "Variable Window — Longest Valid",
        when: "Longest substring/subarray satisfying a constraint (at most k distinct, no repeats…)",
        code: `// ── SLIDING WINDOW: VARIABLE — LONGEST VALID ──────────────────
// Expand right freely. Shrink left until window is valid again.
// Answer = max window size seen.

left, best := 0, 0
state := make(map[byte]int) // track window contents

for right := 0; right < len(s); right++ {
    // ① expand: include s[right]
    state[s[right]]++

    // ② shrink: while window violates constraint
    for len(state) > k { // e.g. more than k distinct chars
        state[s[left]]--
        if state[s[left]] == 0 {
            delete(state, s[left])
        }
        left++
    }

    // ③ record: window [left, right] is now valid
    if right-left+1 > best {
        best = right - left + 1
    }
}

return best`,
      },
      {
        name: "Variable Window — Shortest Valid",
        when: "Minimum window substring, smallest subarray with sum ≥ target",
        code: `// ── SLIDING WINDOW: VARIABLE — SHORTEST VALID ─────────────────
// Try to shrink left as much as possible while window stays valid.
// Answer = min window size seen when valid.

left, best := 0, math.MaxInt
windowSum := 0

for right := 0; right < len(nums); right++ {
    // ① expand
    windowSum += nums[right]

    // ② shrink as much as possible while still valid
    for windowSum >= target {
        if right-left+1 < best {
            best = right - left + 1
        }
        windowSum -= nums[left]
        left++
    }
}

if best == math.MaxInt {
    return 0
}
return best`,
      },
      {
        name: "Fixed Window — Frequency Map (Permutation / Anagram)",
        when: "Permutation in string, find all anagrams — compare char frequency maps",
        code: `// ── SLIDING WINDOW: FIXED + FREQUENCY MAP ─────────────────────
// Maintain a frequency diff between pattern and current window.
// When matches == len(pattern), window is an anagram.

need := make(map[byte]int)
for i := 0; i < len(p); i++ { need[p[i]]++ }

window := make(map[byte]int)
matches, result := 0, []int{}
k := len(p)

for right := 0; right < len(s); right++ {
    // expand
    c := s[right]
    window[c]++
    if window[c] == need[c] { matches++ }

    // slide (drop left when window is full-sized)
    if right >= k {
        drop := s[right-k]
        if window[drop] == need[drop] { matches-- }
        window[drop]--
        if window[drop] == 0 { delete(window, drop) }
    }

    if matches == len(need) {
        result = append(result, right-k+1)
    }
}

return result`,
      },
    ],
  },

  "prefix-sum": {
    title: "Prefix Sum — Templates",
    description: "Pre-compute cumulative sums so any range query answers in O(1). Combine with a hash map to count subarrays matching a target sum.",
    variants: [
      {
        name: "Prefix Sum Array",
        when: "Range sum queries: sum of nums[l..r] in O(1) after O(n) build",
        code: `// ── PREFIX SUM ARRAY ────────────────────────────────────────────
// prefix[i] = sum of nums[0..i-1]  (1-indexed, extra slot avoids bounds check)

prefix := make([]int, len(nums)+1)
for i, v := range nums {
    prefix[i+1] = prefix[i] + v
}

// range sum [l, r] (0-indexed, inclusive):
rangeSum := func(l, r int) int {
    return prefix[r+1] - prefix[l]
}

_ = rangeSum`,
      },
      {
        name: "Prefix Sum + HashMap (Count subarrays = k)",
        when: "Subarray Sum Equals K, Count Nice Subarrays, subarrays divisible by k",
        code: `// ── PREFIX SUM + HASHMAP ────────────────────────────────────────
// count[s] = how many times prefix sum s has appeared so far.
// If (currentSum - k) was seen before, subarrays ending here sum to k.

count := map[int]int{0: 1} // seed: empty prefix has sum 0
sum, result := 0, 0

for _, v := range nums {
    sum += v                  // running prefix sum
    result += count[sum-k]    // subarrays [j+1..i] that sum to k
    count[sum]++
}

return result

// ── VARIANT: modular (divisible by k) ──────────────────────────
// Replace sum += v with:
//   sum = ((sum + v) % k + k) % k   // keep remainder non-negative
// Then count[sum-0] i.e. count[sum] gives subarrays divisible by k.`,
      },
      {
        name: "Difference Array (Range Update in O(1))",
        when: "Apply +val to range [l, r] many times, read final array once",
        code: `// ── DIFFERENCE ARRAY ────────────────────────────────────────────
// Instead of updating every element in [l, r],
// mark the start (+val) and one past end (-val).
// One prefix-sum pass reconstructs the final array.

diff := make([]int, n+1) // extra slot absorbs the right boundary

// range update: add val to nums[l..r]  (0-indexed)
addRange := func(l, r, val int) {
    diff[l] += val
    diff[r+1] -= val
}

// example updates
addRange(1, 3, 10)
addRange(2, 5, 20)

// reconstruct: prefix sum of diff
result := make([]int, n)
cur := 0
for i := 0; i < n; i++ {
    cur += diff[i]
    result[i] = cur
}`,
      },
      {
        name: "Kadane's Algorithm (Max Subarray)",
        when: "Maximum subarray sum — drop prefix when it goes negative",
        code: `// ── KADANE'S ALGORITHM ──────────────────────────────────────────
// At each element: extend current subarray OR start fresh.
// Equivalent to: drop any prefix with negative contribution.

best := nums[0]
cur := nums[0]

for _, n := range nums[1:] {
    // start fresh if current sum is a liability
    if cur+n > n {
        cur = cur + n
    } else {
        cur = n
    }
    if cur > best {
        best = cur
    }
}

return best

// ── WITH INDICES (track start/end of max subarray) ──────────────
// Reset start = i whenever we start fresh.
// Update best indices whenever cur > best.`,
      },
    ],
  },

  "hashing": {
    title: "Hashing — Templates",
    description: "Hash maps and sets reduce O(n²) lookups to O(1), enabling complement search, frequency counting, and grouping in a single pass.",
    variants: [
      {
        name: "Frequency Map",
        when: "Count occurrences, find majority element, group anagrams, top-k",
        code: `// ── FREQUENCY MAP ───────────────────────────────────────────────
freq := make(map[int]int)
for _, v := range nums {
    freq[v]++
}

// iterate frequencies
for val, cnt := range freq {
    _ = val
    _ = cnt
}

// fixed-alphabet (e.g. lowercase letters): use array instead of map
var freq26 [26]int
for _, c := range s {
    freq26[c-'a']++
}`,
      },
      {
        name: "Complement / Two-Sum Lookup",
        when: "Find pair summing to target — store seen values, check complement",
        code: `// ── COMPLEMENT LOOKUP ───────────────────────────────────────────
// For each element, check if its complement was already seen.

seen := make(map[int]int) // value → index

for i, n := range nums {
    complement := target - n
    if j, ok := seen[complement]; ok {
        return []int{j, i} // found pair
    }
    seen[n] = i
}

return nil`,
      },
      {
        name: "Seen Set (Duplicate / Presence Check)",
        when: "Contains duplicate, longest consecutive sequence, happy number",
        code: `// ── SEEN SET ────────────────────────────────────────────────────
seen := make(map[int]bool)

for _, v := range nums {
    if seen[v] {
        return true // duplicate found
    }
    seen[v] = true
}

return false`,
      },
      {
        name: "Group by Key",
        when: "Group anagrams, group by remainder, classify strings by signature",
        code: `// ── GROUP BY KEY ────────────────────────────────────────────────
// Compute a canonical key for each element, group by that key.

groups := make(map[string][]string)

for _, word := range words {
    key := canonicalKey(word) // e.g. sorted chars, char frequency array
    groups[key] = append(groups[key], word)
}

// collect groups
result := make([][]string, 0, len(groups))
for _, g := range groups {
    result = append(result, g)
}

// ── EXAMPLE: sort chars as key (group anagrams) ─────────────────
// key = sorted runes of word
// "eat","tea","ate" all map to "aet"`,
      },
    ],
  },

  "stack": {
    title: "Stack — Templates",
    description: "Stacks power bracket matching, expression evaluation, and monotonic patterns (next greater/smaller element). Last-In-First-Out order is the key property.",
    variants: [
      {
        name: "Basic Stack (LIFO)",
        when: "Valid parentheses, evaluate expression, undo operations",
        code: `// ── BASIC STACK ─────────────────────────────────────────────────
stack := []int{} // or []byte{}, []*TreeNode{}, etc.

// push
stack = append(stack, val)

// peek (top element)
top := stack[len(stack)-1]
_ = top

// pop
stack = stack[:len(stack)-1]

// is empty
if len(stack) == 0 { /* empty */ }

// ── VALID PARENTHESES PATTERN ────────────────────────────────────
pair := map[rune]rune{')': '(', ']': '[', '}': '{'}
for _, c := range s {
    if c == '(' || c == '[' || c == '{' {
        stack = append(stack, c) // push open bracket
    } else {
        if len(stack) == 0 || stack[len(stack)-1] != pair[c] {
            return false
        }
        stack = stack[:len(stack)-1] // pop matching open
    }
}
return len(stack) == 0`,
      },
      {
        name: "Monotonic Stack — Next Greater Element",
        when: "Next greater/smaller, daily temperatures, largest rectangle, trapping rain water",
        code: `// ── MONOTONIC STACK: NEXT GREATER ELEMENT ──────────────────────
// Stack stores indices of elements waiting for their answer.
// Maintain stack in decreasing order of values.

result := make([]int, len(nums))
for i := range result { result[i] = -1 } // default: no greater element

stack := []int{} // indices

for i, v := range nums {
    // pop all elements smaller than current → current is their answer
    for len(stack) > 0 && nums[stack[len(stack)-1]] < v {
        idx := stack[len(stack)-1]
        stack = stack[:len(stack)-1]
        result[idx] = v
    }
    stack = append(stack, i)
}

// remaining indices in stack: no next greater element → result[idx] = -1
return result

// ── VARIANT: Next Smaller — flip '<' to '>' ──────────────────────
// ── VARIANT: Circular array — iterate 2n, index with i % n ───────`,
      },
      {
        name: "Monotonic Stack — Largest Rectangle",
        when: "Largest rectangle in histogram, max area in binary matrix",
        code: `// ── MONOTONIC STACK: LARGEST RECTANGLE IN HISTOGRAM ────────────
// Stack stores indices in increasing height order.
// When a shorter bar is found, pop and compute area.

heights = append(heights, 0) // sentinel: flush remaining stack at end
stack := []int{}              // indices, increasing heights
best := 0

for i, h := range heights {
    for len(stack) > 0 && heights[stack[len(stack)-1]] > h {
        height := heights[stack[len(stack)-1]]
        stack = stack[:len(stack)-1]

        width := i
        if len(stack) > 0 {
            width = i - stack[len(stack)-1] - 1
        }
        if area := height * width; area > best {
            best = area
        }
    }
    stack = append(stack, i)
}

return best`,
      },
    ],
  },

  "binary-search": {
    title: "Binary Search — Templates",
    description: "Halve the search space each iteration. Works on any sorted/monotonic space. The key is defining lo/hi correctly and choosing the right boundary condition.",
    variants: [
      {
        name: "Classic (find exact target)",
        when: "Search in sorted array, find element index",
        code: `// ── BINARY SEARCH: CLASSIC ──────────────────────────────────────
lo, hi := 0, len(nums)-1

for lo <= hi {
    mid := lo + (hi-lo)/2 // avoids overflow vs (lo+hi)/2

    if nums[mid] == target {
        return mid
    } else if nums[mid] < target {
        lo = mid + 1
    } else {
        hi = mid - 1
    }
}

return -1 // not found`,
      },
      {
        name: "Left Boundary (first true)",
        when: "Find leftmost position satisfying a condition (lower bound)",
        code: `// ── BINARY SEARCH: LEFT BOUNDARY ───────────────────────────────
// Finds the FIRST index where condition(mid) is true.
// hi = len(nums) so lo can reach past-end if no element satisfies.

lo, hi := 0, len(nums)

for lo < hi {
    mid := lo + (hi-lo)/2
    if condition(mid) {
        hi = mid    // mid might be the answer; narrow right side
    } else {
        lo = mid + 1
    }
}

// lo == hi == first index where condition is true
// if lo == len(nums): no element satisfies condition
return lo`,
      },
      {
        name: "Right Boundary (last true)",
        when: "Find rightmost position satisfying a condition (upper bound)",
        code: `// ── BINARY SEARCH: RIGHT BOUNDARY ──────────────────────────────
// Finds the LAST index where condition(mid) is true.

lo, hi := 0, len(nums)-1
ans := -1

for lo <= hi {
    mid := lo + (hi-lo)/2
    if condition(mid) {
        ans = mid   // mid works; try to go further right
        lo = mid + 1
    } else {
        hi = mid - 1
    }
}

return ans`,
      },
      {
        name: "Binary Search on Answer",
        when: "Minimise maximum, Koko eating bananas, capacity to ship packages",
        code: `// ── BINARY SEARCH ON ANSWER ─────────────────────────────────────
// Search space is the ANSWER, not an index.
// feasible(mid) checks: can we achieve result ≤ mid?

lo, hi := minPossibleAnswer, maxPossibleAnswer

for lo < hi {
    mid := lo + (hi-lo)/2
    if feasible(mid) {
        hi = mid    // mid works; try to do better (smaller)
    } else {
        lo = mid + 1
    }
}

return lo // minimum answer that is feasible

// ── feasible example: Koko eating k bananas/hr ───────────────────
// feasible = func(speed int) bool {
//     hours := 0
//     for _, pile := range piles {
//         hours += (pile + speed - 1) / speed
//     }
//     return hours <= h
// }`,
      },
    ],
  },

  "linked-list": {
    title: "Linked List — Templates",
    description: "Linked list problems reduce to pointer manipulation. Dummy head nodes, fast/slow pointers, and in-place reversal cover virtually every pattern.",
    variants: [
      {
        name: "Dummy Head Node",
        when: "Build a new list, merge lists, remove nth node — avoids edge cases on head",
        code: `// ── DUMMY HEAD ──────────────────────────────────────────────────
// Attach a dummy before the real head so every insertion point
// has a predecessor — no special-casing for the head node.

type ListNode struct {
    Val  int
    Next *ListNode
}

dummy := &ListNode{Next: head}
cur := dummy

// ... build or modify list by updating cur.Next

return dummy.Next // real head of result`,
      },
      {
        name: "Fast / Slow Pointers",
        when: "Find middle, detect cycle, find cycle entry, kth from end",
        code: `// ── FAST / SLOW POINTERS ────────────────────────────────────────

// ① Find middle (slow stops at mid):
slow, fast := head, head
for fast != nil && fast.Next != nil {
    slow = slow.Next
    fast = fast.Next.Next
}
// slow = mid  (for even length: left-of-center)

// ② Detect cycle:
slow, fast = head, head
for fast != nil && fast.Next != nil {
    slow = slow.Next
    fast = fast.Next.Next
    if slow == fast {
        // cycle exists — find entry:
        slow = head
        for slow != fast {
            slow = slow.Next
            fast = fast.Next
        }
        return slow // cycle entry node
    }
}
return nil // no cycle

// ③ kth node from end: advance fast by k first, then move both.`,
      },
      {
        name: "Reverse Linked List",
        when: "Reverse entire list, reverse k-group, palindrome check",
        code: `// ── REVERSE LINKED LIST (iterative) ────────────────────────────
var prev *ListNode
cur := head

for cur != nil {
    next := cur.Next // save next before overwriting
    cur.Next = prev  // reverse the pointer
    prev = cur       // advance prev
    cur = next       // advance cur
}

return prev // prev is the new head

// ── REVERSE A SUBLIST [left, right] ─────────────────────────────
// 1. Walk to node just before 'left' (use dummy head).
// 2. Reverse exactly (right - left + 1) nodes.
// 3. Re-attach the reversed segment.`,
      },
      {
        name: "Merge Two Sorted Lists",
        when: "Merge K sorted lists (use this as the base), sort list",
        code: `// ── MERGE TWO SORTED LISTS ──────────────────────────────────────
func mergeTwoLists(l1, l2 *ListNode) *ListNode {
    dummy := &ListNode{}
    cur := dummy

    for l1 != nil && l2 != nil {
        if l1.Val <= l2.Val {
            cur.Next = l1
            l1 = l1.Next
        } else {
            cur.Next = l2
            l2 = l2.Next
        }
        cur = cur.Next
    }

    // attach remaining (at most one of l1, l2 is non-nil)
    if l1 != nil {
        cur.Next = l1
    } else {
        cur.Next = l2
    }

    return dummy.Next
}`,
      },
    ],
  },

  "trees": {
    title: "Trees — Templates",
    description: "Tree problems are almost always solved with DFS (recursive or iterative) or BFS (level-order). Choose DFS for path/depth problems, BFS for level-by-level processing.",
    variants: [
      {
        name: "DFS — Recursive (Post-order)",
        when: "Height, diameter, path sum, LCA — needs children's results before processing parent",
        code: `// ── DFS: RECURSIVE (POST-ORDER) ─────────────────────────────────
// Process left → right → current node.
// Use when parent's answer depends on both subtrees.

func dfs(node *TreeNode) int {
    if node == nil {
        return 0 // base case
    }

    left  := dfs(node.Left)   // ① solve left subtree
    right := dfs(node.Right)  // ② solve right subtree

    // ③ combine at current node
    // e.g. height = 1 + max(left, right)
    // e.g. update global max with left + right + node.Val

    return 1 + max(left, right) // return height
}`,
      },
      {
        name: "DFS — Recursive (Pre-order / Path tracking)",
        when: "Root-to-leaf paths, path sum II, build result as you go down",
        code: `// ── DFS: RECURSIVE (PRE-ORDER / PATH TRACKING) ─────────────────
// Process current node BEFORE recursing into children.
// Pass state (path, running sum) down through parameters.

var result [][]int

var dfs func(node *TreeNode, path []int, remaining int)
dfs = func(node *TreeNode, path []int, remaining int) {
    if node == nil {
        return
    }

    path = append(path, node.Val)   // ① choose (pre-order)
    remaining -= node.Val

    if node.Left == nil && node.Right == nil && remaining == 0 {
        // ② leaf reached with correct sum — record path
        tmp := make([]int, len(path))
        copy(tmp, path)
        result = append(result, tmp)
    }

    dfs(node.Left,  path, remaining)  // ③ recurse
    dfs(node.Right, path, remaining)
    // path automatically un-chooses when function returns (slice append)
}

dfs(root, []int{}, targetSum)
return result`,
      },
      {
        name: "BFS — Level Order",
        when: "Level averages, right side view, zigzag traversal, min depth",
        code: `// ── BFS: LEVEL ORDER ────────────────────────────────────────────
if root == nil {
    return nil
}

result := [][]int{}
queue := []*TreeNode{root}

for len(queue) > 0 {
    size := len(queue)         // number of nodes at this level
    level := make([]int, size)

    for i := 0; i < size; i++ {
        node := queue[0]
        queue = queue[1:]
        level[i] = node.Val

        if node.Left  != nil { queue = append(queue, node.Left) }
        if node.Right != nil { queue = append(queue, node.Right) }
    }

    result = append(result, level)
}

return result`,
      },
      {
        name: "Iterative DFS (Explicit Stack)",
        when: "Avoid recursion stack overflow on very deep trees; preorder traversal",
        code: `// ── DFS: ITERATIVE (EXPLICIT STACK) ────────────────────────────
stack := []*TreeNode{root}

for len(stack) > 0 {
    node := stack[len(stack)-1]   // pop
    stack = stack[:len(stack)-1]

    // process node here (pre-order)
    _ = node.Val

    // push RIGHT before LEFT so left is processed first
    if node.Right != nil { stack = append(stack, node.Right) }
    if node.Left  != nil { stack = append(stack, node.Left)  }
}`,
      },
    ],
  },

  "graphs": {
    title: "Graphs — Templates",
    description: "Graphs require tracking visited nodes to avoid cycles. BFS finds shortest paths; DFS explores all paths. Union-Find efficiently answers connectivity queries.",
    variants: [
      {
        name: "BFS (Shortest Path / Level Distance)",
        when: "Shortest path in unweighted graph, 0/1 BFS, multi-source BFS",
        code: `// ── BFS ─────────────────────────────────────────────────────────
visited := make([]bool, n)
dist    := make([]int,  n)

queue := []int{start}
visited[start] = true

for len(queue) > 0 {
    node := queue[0]
    queue = queue[1:]

    for _, nei := range graph[node] {
        if !visited[nei] {
            visited[nei] = true
            dist[nei] = dist[node] + 1
            queue = append(queue, nei)
        }
    }
}

// ── GRID BFS (4-directional) ─────────────────────────────────────
dirs := [][2]int{{0,1},{0,-1},{1,0},{-1,0}}
// for each dir: nr, nc := r+dir[0], c+dir[1]
// check bounds: nr >= 0 && nr < rows && nc >= 0 && nc < cols`,
      },
      {
        name: "DFS (Connected Components / Cycle Detection)",
        when: "Number of islands, connected components, path existence, topological sort",
        code: `// ── DFS ─────────────────────────────────────────────────────────
visited := make([]bool, n)

var dfs func(node int)
dfs = func(node int) {
    visited[node] = true
    for _, nei := range graph[node] {
        if !visited[nei] {
            dfs(nei)
        }
    }
}

// count connected components
components := 0
for i := 0; i < n; i++ {
    if !visited[i] {
        dfs(i)
        components++
    }
}

// ── CYCLE DETECTION (directed graph) ────────────────────────────
// Use three states: 0=unvisited, 1=in-stack, 2=done
// If we reach a node with state=1, there's a cycle.`,
      },
      {
        name: "Union-Find (Connectivity / Cycle in Undirected)",
        when: "Number of connected components, redundant connection, accounts merge",
        code: `// ── UNION-FIND ───────────────────────────────────────────────────
parent := make([]int, n)
rank   := make([]int, n)
for i := range parent { parent[i] = i }

// find with path compression
var find func(x int) int
find = func(x int) int {
    if parent[x] != x {
        parent[x] = find(parent[x]) // path compression
    }
    return parent[x]
}

// union by rank — returns false if already connected (cycle)
union := func(x, y int) bool {
    px, py := find(x), find(y)
    if px == py { return false } // already same component
    if rank[px] < rank[py] {
        parent[px] = py
    } else if rank[px] > rank[py] {
        parent[py] = px
    } else {
        parent[py] = px
        rank[px]++
    }
    return true
}

_ = union`,
      },
      {
        name: "Topological Sort (BFS / Kahn's Algorithm)",
        when: "Course schedule, task ordering, detect cycle in directed graph",
        code: `// ── TOPOLOGICAL SORT (KAHN'S BFS) ───────────────────────────────
inDegree := make([]int, n)
for _, edge := range edges {
    inDegree[edge[1]]++
}

queue := []int{}
for i := 0; i < n; i++ {
    if inDegree[i] == 0 {
        queue = append(queue, i)
    }
}

order := []int{}
for len(queue) > 0 {
    node := queue[0]
    queue = queue[1:]
    order = append(order, node)

    for _, nei := range graph[node] {
        inDegree[nei]--
        if inDegree[nei] == 0 {
            queue = append(queue, nei)
        }
    }
}

// if len(order) == n: valid topological order, no cycle
// if len(order) <  n: cycle exists`,
      },
    ],
  },

  "backtracking": {
    title: "Backtracking — Templates",
    description: "Backtracking is DFS on a decision tree: choose → explore → un-choose. Prune branches early to cut down the exponential search space.",
    variants: [
      {
        name: "Combinations (pick k from n, no repeats)",
        when: "Combinations, subsets, combination sum with distinct elements",
        code: `// ── BACKTRACKING: COMBINATIONS ──────────────────────────────────
// Each element used at most once. Pass 'start' to avoid re-using.

var result [][]int

var backtrack func(start int, path []int)
backtrack = func(start int, path []int) {
    // ① base case — record valid solution
    if len(path) == k {
        tmp := make([]int, k)
        copy(tmp, path)
        result = append(result, tmp)
        return
    }

    for i := start; i < len(nums); i++ {
        // ② prune (optional): if remaining elements can't fill path, break
        if len(nums)-i < k-len(path) { break }

        path = append(path, nums[i])   // ③ choose
        backtrack(i+1, path)           // ④ explore (i+1 = no reuse)
        path = path[:len(path)-1]      // ⑤ un-choose
    }
}

backtrack(0, []int{})
return result`,
      },
      {
        name: "Permutations (all orderings)",
        when: "All permutations, letter case permutation",
        code: `// ── BACKTRACKING: PERMUTATIONS ──────────────────────────────────
// Every element used exactly once in every position.
// Use a 'used' array instead of 'start'.

var result [][]int
used := make([]bool, len(nums))

var backtrack func(path []int)
backtrack = func(path []int) {
    if len(path) == len(nums) {
        tmp := make([]int, len(nums))
        copy(tmp, path)
        result = append(result, tmp)
        return
    }

    for i := 0; i < len(nums); i++ {
        if used[i] { continue }

        // skip duplicate permutations (if nums is sorted):
        // if i > 0 && nums[i] == nums[i-1] && !used[i-1] { continue }

        used[i] = true
        path = append(path, nums[i])
        backtrack(path)
        path = path[:len(path)-1]
        used[i] = false
    }
}

backtrack([]int{})
return result`,
      },
      {
        name: "Subsets (power set)",
        when: "All subsets/subsequences, subsets with/without duplicates",
        code: `// ── BACKTRACKING: SUBSETS ───────────────────────────────────────
// Record path at EVERY node, not just leaves.

var result [][]int

var backtrack func(start int, path []int)
backtrack = func(start int, path []int) {
    // ① record current subset (including empty set at root)
    tmp := make([]int, len(path))
    copy(tmp, path)
    result = append(result, tmp)

    for i := start; i < len(nums); i++ {
        // skip duplicates (sort nums first):
        // if i > start && nums[i] == nums[i-1] { continue }

        path = append(path, nums[i])
        backtrack(i+1, path)
        path = path[:len(path)-1]
    }
}

backtrack(0, []int{})
return result`,
      },
      {
        name: "Constraint Satisfaction (N-Queens, Sudoku)",
        when: "Place items on a board with row/col/diagonal constraints",
        code: `// ── BACKTRACKING: CONSTRAINT SATISFACTION ───────────────────────
// Check validity before placing; undo placement on backtrack.

cols    := make(map[int]bool)
diagL   := make(map[int]bool) // row - col
diagR   := make(map[int]bool) // row + col
board   := make([]string, n)

var backtrack func(row int)
backtrack = func(row int) {
    if row == n {
        result = append(result, append([]string{}, board...))
        return
    }

    for col := 0; col < n; col++ {
        if cols[col] || diagL[row-col] || diagR[row+col] {
            continue // ① prune invalid placements
        }

        // ② place queen
        cols[col] = true
        diagL[row-col] = true
        diagR[row+col] = true
        row_bytes := make([]byte, n)
        for i := range row_bytes { row_bytes[i] = '.' }
        row_bytes[col] = 'Q'
        board[row] = string(row_bytes)

        backtrack(row + 1) // ③ explore next row

        // ④ remove queen (un-choose)
        cols[col] = false
        diagL[row-col] = false
        diagR[row+col] = false
    }
}

backtrack(0)`,
      },
    ],
  },

  "dynamic-programming": {
    title: "Dynamic Programming — Templates",
    description: "DP stores sub-problem results to avoid recomputation. Identify the state, write the recurrence, decide top-down (memo) or bottom-up (tabulation).",
    variants: [
      {
        name: "1-D DP (Bottom-up)",
        when: "Climbing stairs, house robber, coin change, Fibonacci variants",
        code: `// ── 1-D DP: BOTTOM-UP ───────────────────────────────────────────
// dp[i] = answer for sub-problem of size i.
// Fill from smallest sub-problem up to n.

dp := make([]int, n+1)
dp[0] = 0 // base case
dp[1] = 1 // base case

for i := 2; i <= n; i++ {
    dp[i] = dp[i-1] + dp[i-2] // recurrence (example: Fibonacci)
}

return dp[n]

// ── SPACE OPTIMISED (rolling variables) ─────────────────────────
// When dp[i] only depends on dp[i-1] and dp[i-2]:
prev2, prev1 := 0, 1
for i := 2; i <= n; i++ {
    curr := prev1 + prev2
    prev2 = prev1
    prev1 = curr
}
return prev1`,
      },
      {
        name: "2-D DP (Bottom-up)",
        when: "Longest common subsequence, edit distance, unique paths, knapsack",
        code: `// ── 2-D DP: BOTTOM-UP ───────────────────────────────────────────
// dp[i][j] = answer using first i elements of A and first j of B.

m, n := len(text1), len(text2)
dp := make([][]int, m+1)
for i := range dp { dp[i] = make([]int, n+1) }

// base cases: dp[0][j] = 0, dp[i][0] = 0 (zero-init handles this)

for i := 1; i <= m; i++ {
    for j := 1; j <= n; j++ {
        if text1[i-1] == text2[j-1] {
            dp[i][j] = dp[i-1][j-1] + 1 // characters match
        } else {
            dp[i][j] = max(dp[i-1][j], dp[i][j-1]) // take best
        }
    }
}

return dp[m][n]`,
      },
      {
        name: "Top-Down DP (Memoisation)",
        when: "When recurrence is clearer recursively; irregular state transitions",
        code: `// ── TOP-DOWN DP: MEMOISATION ────────────────────────────────────
memo := make(map[int]int) // or []int with -1 sentinel

var dp func(i int) int
dp = func(i int) int {
    if i <= 1 { return i } // base case

    if v, ok := memo[i]; ok {
        return v // already computed
    }

    result := dp(i-1) + dp(i-2) // recurrence
    memo[i] = result
    return result
}

return dp(n)

// ── WHEN TO USE TOP-DOWN vs BOTTOM-UP ───────────────────────────
// Top-down:   natural when state space is sparse or hard to order.
// Bottom-up:  faster in practice (no function call overhead).
//             Required when you need to optimise space.`,
      },
      {
        name: "0/1 Knapsack Pattern",
        when: "Subset sum, partition equal subset, target sum, coin change (unbounded)",
        code: `// ── 0/1 KNAPSACK ────────────────────────────────────────────────
// dp[j] = true if subset summing to j is achievable.
// Iterate j in REVERSE to avoid using the same item twice.

dp := make([]bool, target+1)
dp[0] = true // empty subset sums to 0

for _, num := range nums {
    // reverse: ensures each num used at most once
    for j := target; j >= num; j-- {
        dp[j] = dp[j] || dp[j-num]
    }
}

return dp[target]

// ── UNBOUNDED KNAPSACK (coin change — item reusable) ─────────────
// Iterate j FORWARD to allow reuse of the same coin:
// for j := coin; j <= amount; j++ {
//     dp[j] = min(dp[j], dp[j-coin]+1)
// }`,
      },
    ],
  },
};
