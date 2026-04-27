export const DSA_CATEGORIES = [
  {
    id: "arrays-two-pointers",
    icon: "🧩",
    title: "Arrays + Two Pointers",
    problems: [
      {
        id: "two-sum",
        title: "Two Sum",
        difficulty: "Easy",
        leetcode: 1,
        description:
          "Given an array of integers nums and an integer target, return indices of the two numbers that add up to target. You may assume exactly one solution exists and you cannot use the same element twice.",
        examples: [
          {
            input: "nums = [2,7,11,15], target = 9",
            output: "[0,1]",
            explanation: "nums[0] + nums[1] = 2 + 7 = 9",
          },
          {
            input: "nums = [3,2,4], target = 6",
            output: "[1,2]",
            explanation: "nums[1] + nums[2] = 2 + 4 = 6",
          },
        ],
        approach:
          "Use a hash map to store each number's index as you iterate. For every element, check if (target − element) already exists in the map. If yes, return the stored index and the current index. This avoids the O(n²) brute-force nested loop.",
        complexity: { time: "O(n)", space: "O(n)" },
        code: `func twoSum(nums []int, target int) []int {
    seen := make(map[int]int) // value → index
    for i, n := range nums {
        complement := target - n
        if j, ok := seen[complement]; ok {
            return []int{j, i}
        }
        seen[n] = i
    }
    return nil
}`,
      },
      {
        id: "container-with-most-water",
        title: "Container With Most Water",
        difficulty: "Medium",
        leetcode: 11,
        description:
          "Given n non-negative integers representing heights of vertical lines, find two lines that together with the x-axis form a container that holds the most water.",
        examples: [
          {
            input: "height = [1,8,6,2,5,4,8,3,7]",
            output: "49",
            explanation:
              "Lines at index 1 (height 8) and index 8 (height 7), width = 7, area = 7 × 7 = 49",
          },
          {
            input: "height = [1,1]",
            output: "1",
            explanation: "Only two lines, area = 1 × 1 = 1",
          },
        ],
        approach:
          "Start with two pointers at both ends. The area is width × min(left, right). Always move the pointer with the shorter height inward — moving the taller one can never increase area (width shrinks but height can't improve past the shorter side).",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `func maxArea(height []int) int {
    left, right := 0, len(height)-1
    best := 0
    for left < right {
        h := min(height[left], height[right])
        area := h * (right - left)
        if area > best {
            best = area
        }
        if height[left] < height[right] {
            left++
        } else {
            right--
        }
    }
    return best
}

func min(a, b int) int {
    if a < b { return a }
    return b
}`,
      },
      {
        id: "three-sum",
        title: "3Sum",
        difficulty: "Medium",
        leetcode: 15,
        description:
          "Given an integer array nums, return all triplets [nums[i], nums[j], nums[k]] such that i, j, k are distinct and nums[i] + nums[j] + nums[k] == 0. The answer must not contain duplicate triplets.",
        examples: [
          {
            input: "nums = [-1,0,1,2,-1,-4]",
            output: "[[-1,-1,2],[-1,0,1]]",
            explanation: "Two unique triplets that sum to zero",
          },
          {
            input: "nums = [0,0,0]",
            output: "[[0,0,0]]",
            explanation: "Only one unique triplet",
          },
        ],
        approach:
          "Sort the array first. Fix one element with an outer loop, then use two pointers (left, right) on the remaining subarray to find pairs that sum to the negation of the fixed element. Skip duplicate values to avoid duplicate triplets.",
        complexity: { time: "O(n²)", space: "O(1)" },
        code: `func threeSum(nums []int) [][]int {
    sort.Ints(nums)
    result := [][]int{}
    for i := 0; i < len(nums)-2; i++ {
        if i > 0 && nums[i] == nums[i-1] {
            continue // skip duplicate anchor
        }
        left, right := i+1, len(nums)-1
        for left < right {
            sum := nums[i] + nums[left] + nums[right]
            if sum == 0 {
                result = append(result, []int{nums[i], nums[left], nums[right]})
                for left < right && nums[left] == nums[left+1] { left++ }
                for left < right && nums[right] == nums[right-1] { right-- }
                left++
                right--
            } else if sum < 0 {
                left++
            } else {
                right--
            }
        }
    }
    return result
}`,
      },
      {
        id: "move-zeroes",
        title: "Move Zeroes",
        difficulty: "Easy",
        leetcode: 283,
        description:
          "Given an integer array nums, move all zeroes to the end while maintaining the relative order of the non-zero elements. Do it in-place without making a copy of the array.",
        examples: [
          {
            input: "nums = [0,1,0,3,12]",
            output: "[1,3,12,0,0]",
            explanation: "Non-zeroes maintain their order; zeroes go to end",
          },
          {
            input: "nums = [0]",
            output: "[0]",
            explanation: "Single element, no change needed",
          },
        ],
        approach:
          "Use a slow pointer (insert) that tracks where the next non-zero should go. Iterate with a fast pointer: whenever you see a non-zero, swap it with nums[insert] and advance insert. All positions after insert at the end are implicitly zero.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `func moveZeroes(nums []int) {
    insert := 0
    for fast := 0; fast < len(nums); fast++ {
        if nums[fast] != 0 {
            nums[insert], nums[fast] = nums[fast], nums[insert]
            insert++
        }
    }
}`,
      },
      {
        id: "sort-colors",
        title: "Sort Colors",
        difficulty: "Medium",
        leetcode: 75,
        description:
          "Given an array nums with n objects colored red (0), white (1), or blue (2), sort them in-place so that objects of the same color are adjacent, in order 0, 1, 2. You must solve it without using the library's sort function.",
        examples: [
          {
            input: "nums = [2,0,2,1,1,0]",
            output: "[0,0,1,1,2,2]",
            explanation: "Dutch National Flag algorithm partitions into three sections",
          },
          {
            input: "nums = [2,0,1]",
            output: "[0,1,2]",
            explanation: "One pass places each element correctly",
          },
        ],
        approach:
          "Dutch National Flag: maintain three pointers — low (next 0 position), mid (current), high (next 2 position). If nums[mid]==0 swap with low and advance both. If 2 swap with high and retreat high only (mid stays to re-check). If 1 just advance mid.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `func sortColors(nums []int) {
    low, mid, high := 0, 0, len(nums)-1
    for mid <= high {
        switch nums[mid] {
        case 0:
            nums[low], nums[mid] = nums[mid], nums[low]
            low++
            mid++
        case 1:
            mid++
        case 2:
            nums[mid], nums[high] = nums[high], nums[mid]
            high--
            // don't advance mid; re-examine swapped element
        }
    }
}`,
      },
      {
        id: "trapping-rain-water",
        title: "Trapping Rain Water",
        difficulty: "Hard",
        leetcode: 42,
        description:
          "Given n non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.",
        examples: [
          {
            input: "height = [0,1,0,2,1,0,1,3,2,1,2,1]",
            output: "6",
            explanation: "6 units of water trapped in the valleys",
          },
          {
            input: "height = [4,2,0,3,2,5]",
            output: "9",
            explanation: "9 units trapped",
          },
        ],
        approach:
          "Two-pointer approach: maintain leftMax and rightMax. The water above any cell is min(leftMax, rightMax) − height[cell]. Move the pointer on the side with the smaller max — we already know the limiting wall. This avoids precomputing prefix/suffix max arrays.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `func trap(height []int) int {
    left, right := 0, len(height)-1
    leftMax, rightMax := 0, 0
    water := 0
    for left < right {
        if height[left] < height[right] {
            if height[left] >= leftMax {
                leftMax = height[left]
            } else {
                water += leftMax - height[left]
            }
            left++
        } else {
            if height[right] >= rightMax {
                rightMax = height[right]
            } else {
                water += rightMax - height[right]
            }
            right--
        }
    }
    return water
}`,
      },
      {
        id: "remove-duplicates-sorted-array",
        title: "Remove Duplicates from Sorted Array",
        difficulty: "Easy",
        leetcode: 26,
        description:
          "Given a sorted array nums, remove duplicates in-place so each unique element appears only once. Return k, the count of unique elements. The first k elements of nums should hold the result.",
        examples: [
          {
            input: "nums = [1,1,2]",
            output: "2, nums = [1,2,_]",
            explanation: "2 unique elements; first 2 positions hold 1 and 2",
          },
          {
            input: "nums = [0,0,1,1,1,2,2,3,3,4]",
            output: "5, nums = [0,1,2,3,4,_,_,_,_,_]",
            explanation: "5 unique elements placed at the front",
          },
        ],
        approach:
          "Use a write pointer k starting at 1. Iterate from index 1 onward: whenever nums[i] differs from nums[i−1], it's a new unique value — write it at nums[k] and advance k. Because the array is sorted, duplicates are always adjacent.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `func removeDuplicates(nums []int) int {
    if len(nums) == 0 {
        return 0
    }
    k := 1
    for i := 1; i < len(nums); i++ {
        if nums[i] != nums[i-1] {
            nums[k] = nums[i]
            k++
        }
    }
    return k
}`,
      },
      {
        id: "valid-palindrome",
        title: "Valid Palindrome",
        difficulty: "Easy",
        leetcode: 125,
        description:
          "A phrase is a palindrome if, after converting all uppercase letters to lowercase and removing all non-alphanumeric characters, it reads the same forward and backward. Given a string s, return true if it is a palindrome.",
        examples: [
          {
            input: 's = "A man, a plan, a canal: Panama"',
            output: "true",
            explanation: '"amanaplanacanalpanama" is a palindrome',
          },
          {
            input: 's = "race a car"',
            output: "false",
            explanation: '"raceacar" is not a palindrome',
          },
        ],
        approach:
          "Place left and right pointers at opposite ends. Skip non-alphanumeric characters by advancing pointers. Compare lowercased characters at both pointers — if they ever differ, return false. If pointers meet, return true.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `func isPalindrome(s string) bool {
    left, right := 0, len(s)-1
    for left < right {
        for left < right && !isAlNum(s[left]) {
            left++
        }
        for left < right && !isAlNum(s[right]) {
            right--
        }
        if toLower(s[left]) != toLower(s[right]) {
            return false
        }
        left++
        right--
    }
    return true
}

func isAlNum(c byte) bool {
    return (c >= 'a' && c <= 'z') ||
           (c >= 'A' && c <= 'Z') ||
           (c >= '0' && c <= '9')
}

func toLower(c byte) byte {
    if c >= 'A' && c <= 'Z' {
        return c + 32
    }
    return c
}`,
      },
      {
        id: "product-except-self",
        title: "Product of Array Except Self",
        difficulty: "Medium",
        leetcode: 238,
        description:
          "Given an integer array nums, return an array answer such that answer[i] equals the product of all elements of nums except nums[i]. You must solve it in O(n) time without using the division operation.",
        examples: [
          {
            input: "nums = [1,2,3,4]",
            output: "[24,12,8,6]",
            explanation:
              "answer[0]=2×3×4=24, answer[1]=1×3×4=12, answer[2]=1×2×4=8, answer[3]=1×2×3=6",
          },
          {
            input: "nums = [-1,1,0,-3,3]",
            output: "[0,0,9,0,0]",
            explanation: "Any position with 0 anywhere makes others 0",
          },
        ],
        approach:
          "Two passes. First pass: fill answer[i] with the product of all elements to the LEFT of i (prefix product). Second pass: maintain a running right-product, multiply it into answer[i] from right to left. No extra array needed for the right side.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `func productExceptSelf(nums []int) []int {
    n := len(nums)
    answer := make([]int, n)

    // Pass 1: prefix products
    answer[0] = 1
    for i := 1; i < n; i++ {
        answer[i] = answer[i-1] * nums[i-1]
    }

    // Pass 2: multiply in suffix products
    right := 1
    for i := n - 1; i >= 0; i-- {
        answer[i] *= right
        right *= nums[i]
    }
    return answer
}`,
      },
      {
        id: "find-duplicate-number",
        title: "Find the Duplicate Number",
        difficulty: "Medium",
        leetcode: 287,
        description:
          "Given an array nums of n+1 integers where each integer is in [1, n], there is exactly one repeated number. Find it without modifying the array and using only O(1) extra space.",
        examples: [
          {
            input: "nums = [1,3,4,2,2]",
            output: "2",
            explanation: "2 appears twice",
          },
          {
            input: "nums = [3,1,3,4,2]",
            output: "3",
            explanation: "3 appears twice",
          },
        ],
        approach:
          "Treat the array as a linked list where nums[i] points to index nums[i]. Because a value repeats, there is a cycle — Floyd's cycle detection finds it. Phase 1: slow moves 1 step, fast moves 2 steps until they meet. Phase 2: reset slow to 0, both move 1 step — meeting point is the duplicate.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `func findDuplicate(nums []int) int {
    // Phase 1: detect cycle
    slow, fast := nums[0], nums[nums[0]]
    for slow != fast {
        slow = nums[slow]
        fast = nums[nums[fast]]
    }

    // Phase 2: find entry point of cycle
    slow = 0
    for slow != fast {
        slow = nums[slow]
        fast = nums[fast]
    }
    return slow
}`,
      },
    ],
  },
  {
    id: "sliding-window",
    icon: "🪟",
    title: "Sliding Window",
    problems: [
      {
        id: "best-time-buy-sell-stock",
        title: "Best Time to Buy and Sell Stock",
        difficulty: "Easy",
        leetcode: 121,
        description:
          "Given an array prices where prices[i] is the price of a stock on day i, return the maximum profit you can achieve from one buy and one sell. If no profit is possible, return 0.",
        examples: [
          {
            input: "prices = [7,1,5,3,6,4]",
            output: "5",
            explanation: "Buy on day 2 (price=1), sell on day 5 (price=6), profit = 6−1 = 5",
          },
          {
            input: "prices = [7,6,4,3,1]",
            output: "0",
            explanation: "Prices only decrease — no profitable transaction possible",
          },
        ],
        approach:
          "Slide a window where the left pointer tracks the minimum price seen so far (best buy day) and the right pointer scans forward. At each step compute profit = prices[right] − minPrice and update the best. If prices[right] is lower than minPrice, move the buy day forward.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `func maxProfit(prices []int) int {
    minPrice := prices[0]
    best := 0
    for _, p := range prices {
        if p < minPrice {
            minPrice = p
        } else if p-minPrice > best {
            best = p - minPrice
        }
    }
    return best
}`,
      },
      {
        id: "longest-substring-without-repeating",
        title: "Longest Substring Without Repeating Characters",
        difficulty: "Medium",
        leetcode: 3,
        description:
          "Given a string s, find the length of the longest substring that contains no repeating characters.",
        examples: [
          {
            input: 's = "abcabcbb"',
            output: "3",
            explanation: '"abc" is the longest unique-character window',
          },
          {
            input: 's = "bbbbb"',
            output: "1",
            explanation: 'Only "b" with length 1',
          },
        ],
        approach:
          "Maintain a map of character → its last seen index. Expand right pointer each step. When s[right] is already in the window, jump left to max(left, lastSeen+1) so the duplicate is excluded. Track the longest window seen.",
        complexity: { time: "O(n)", space: "O(min(n,m)) where m=charset size" },
        code: `func lengthOfLongestSubstring(s string) int {
    lastSeen := make(map[byte]int)
    best, left := 0, 0
    for right := 0; right < len(s); right++ {
        if idx, ok := lastSeen[s[right]]; ok && idx >= left {
            left = idx + 1
        }
        lastSeen[s[right]] = right
        if right-left+1 > best {
            best = right - left + 1
        }
    }
    return best
}`,
      },
      {
        id: "minimum-window-substring",
        title: "Minimum Window Substring",
        difficulty: "Hard",
        leetcode: 76,
        description:
          "Given strings s and t, return the minimum window substring of s that contains every character in t (including duplicates). If none exists, return an empty string.",
        examples: [
          {
            input: 's = "ADOBECODEBANC", t = "ABC"',
            output: '"BANC"',
            explanation: "Shortest window containing A, B, and C",
          },
          {
            input: 's = "a", t = "aa"',
            output: '""',
            explanation: "t needs two a's but s only has one",
          },
        ],
        approach:
          "Use two frequency maps: need (counts for t) and window (counts in current window). Track formed — how many unique chars satisfy their required count. Expand right to grow the window; once all chars are satisfied (formed == required), shrink left to minimize. Record the best window at each valid state.",
        complexity: { time: "O(|s|+|t|)", space: "O(|s|+|t|)" },
        code: `func minWindow(s string, t string) string {
    need := make(map[byte]int)
    for i := 0; i < len(t); i++ {
        need[t[i]]++
    }
    window := make(map[byte]int)
    required := len(need)
    formed := 0
    left := 0
    best := ""

    for right := 0; right < len(s); right++ {
        c := s[right]
        window[c]++
        if need[c] > 0 && window[c] == need[c] {
            formed++
        }
        for formed == required {
            w := s[left : right+1]
            if best == "" || len(w) < len(best) {
                best = w
            }
            lc := s[left]
            window[lc]--
            if need[lc] > 0 && window[lc] < need[lc] {
                formed--
            }
            left++
        }
    }
    return best
}`,
      },
      {
        id: "longest-repeating-character-replacement",
        title: "Longest Repeating Character Replacement",
        difficulty: "Medium",
        leetcode: 424,
        description:
          "Given a string s and integer k, you can replace at most k characters in any window. Return the length of the longest substring containing only one distinct letter you can achieve.",
        examples: [
          {
            input: 's = "ABAB", k = 2',
            output: "4",
            explanation: 'Replace both B\'s → "AAAA", length 4',
          },
          {
            input: 's = "AABABBA", k = 1',
            output: "4",
            explanation: 'Window "AABA" → replace one B → "AAAA"',
          },
        ],
        approach:
          "Expand the window with right pointer, tracking frequency of each character and the max frequency in the current window. A window is valid when (windowSize − maxFreq) ≤ k — the remaining chars can all be replaced. If invalid, slide left by 1. The window never shrinks below the best valid size seen.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `func characterReplacement(s string, k int) int {
    freq := [26]int{}
    maxFreq, left, best := 0, 0, 0
    for right := 0; right < len(s); right++ {
        freq[s[right]-'A']++
        if freq[s[right]-'A'] > maxFreq {
            maxFreq = freq[s[right]-'A']
        }
        for (right-left+1)-maxFreq > k {
            freq[s[left]-'A']--
            left++
        }
        if right-left+1 > best {
            best = right - left + 1
        }
    }
    return best
}`,
      },
      {
        id: "permutation-in-string",
        title: "Permutation in String",
        difficulty: "Medium",
        leetcode: 567,
        description:
          "Given strings s1 and s2, return true if any permutation of s1 is a substring of s2.",
        examples: [
          {
            input: 's1 = "ab", s2 = "eidbaooo"',
            output: "true",
            explanation: '"ba" is a permutation of "ab" and appears in s2',
          },
          {
            input: 's1 = "ab", s2 = "eidboaoo"',
            output: "false",
            explanation: "No permutation of s1 appears as a contiguous window in s2",
          },
        ],
        approach:
          "Fixed-size sliding window of length len(s1) over s2. Keep a frequency array for s1 and a window frequency array. Track matches — how many of the 26 characters have equal counts in both. Slide: add s2[right], check if that char's count now matches or breaks a match. Remove s2[left] similarly. When matches==26, return true.",
        complexity: { time: "O(|s1|+|s2|)", space: "O(1)" },
        code: `func checkInclusion(s1 string, s2 string) bool {
    if len(s1) > len(s2) {
        return false
    }
    need, win := [26]int{}, [26]int{}
    for i := 0; i < len(s1); i++ {
        need[s1[i]-'a']++
        win[s2[i]-'a']++
    }
    matches := 0
    for i := 0; i < 26; i++ {
        if need[i] == win[i] {
            matches++
        }
    }
    for right := len(s1); right < len(s2); right++ {
        if matches == 26 {
            return true
        }
        in := s2[right] - 'a'
        win[in]++
        if win[in] == need[in] {
            matches++
        } else if win[in] == need[in]+1 {
            matches--
        }
        out := s2[right-len(s1)] - 'a'
        win[out]--
        if win[out] == need[out] {
            matches++
        } else if win[out] == need[out]-1 {
            matches--
        }
    }
    return matches == 26
}`,
      },
      {
        id: "sliding-window-maximum",
        title: "Sliding Window Maximum",
        difficulty: "Hard",
        leetcode: 239,
        description:
          "Given an integer array nums and a sliding window of size k, return the maximum value in each window position as the window moves left to right.",
        examples: [
          {
            input: "nums = [1,3,-1,-3,5,3,6,7], k = 3",
            output: "[3,3,5,5,6,7]",
            explanation: "Each window of size 3 — max values are 3,3,5,5,6,7",
          },
          {
            input: "nums = [1], k = 1",
            output: "[1]",
            explanation: "Single element window",
          },
        ],
        approach:
          "Use a monotonic decreasing deque storing indices. For each new element: pop from back while nums[back] ≤ nums[right] (they can never be a future max). Pop from front if the index is outside the window. The front of the deque is always the index of the current window's maximum.",
        complexity: { time: "O(n)", space: "O(k)" },
        code: `func maxSlidingWindow(nums []int, k int) []int {
    deque := []int{} // stores indices, decreasing by value
    result := []int{}

    for right := 0; right < len(nums); right++ {
        // remove elements outside the window
        for len(deque) > 0 && deque[0] < right-k+1 {
            deque = deque[1:]
        }
        // maintain decreasing deque
        for len(deque) > 0 && nums[deque[len(deque)-1]] <= nums[right] {
            deque = deque[:len(deque)-1]
        }
        deque = append(deque, right)

        if right >= k-1 {
            result = append(result, nums[deque[0]])
        }
    }
    return result
}`,
      },
      {
        id: "minimum-size-subarray-sum",
        title: "Minimum Size Subarray Sum",
        difficulty: "Medium",
        leetcode: 209,
        description:
          "Given an array of positive integers nums and a positive integer target, return the minimal length of a contiguous subarray whose sum is ≥ target. If none exists, return 0.",
        examples: [
          {
            input: "target = 7, nums = [2,3,1,2,4,3]",
            output: "2",
            explanation: "[4,3] has sum 7 and length 2",
          },
          {
            input: "target = 4, nums = [1,4,4]",
            output: "1",
            explanation: "[4] alone meets the target",
          },
        ],
        approach:
          "Expand right to grow the window sum. Once sum ≥ target, record the window length and shrink from left to see if a smaller window still satisfies. Continue until sum drops below target, then expand again.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `func minSubArrayLen(target int, nums []int) int {
    left, sum, best := 0, 0, 0
    for right := 0; right < len(nums); right++ {
        sum += nums[right]
        for sum >= target {
            length := right - left + 1
            if best == 0 || length < best {
                best = length
            }
            sum -= nums[left]
            left++
        }
    }
    return best
}`,
      },
      {
        id: "find-all-anagrams",
        title: "Find All Anagrams in a String",
        difficulty: "Medium",
        leetcode: 438,
        description:
          "Given strings s and p, return all start indices of p's anagrams in s. An anagram is a permutation of all characters.",
        examples: [
          {
            input: 's = "cbaebabacd", p = "abc"',
            output: "[0,6]",
            explanation: 'Anagrams "cba" at index 0, "bac" at index 6',
          },
          {
            input: 's = "abab", p = "ab"',
            output: "[0,1,2]",
            explanation: '"ab", "ba", "ab" all start at indices 0, 1, 2',
          },
        ],
        approach:
          "Fixed-size window of len(p) with two frequency arrays and a matches counter (same as Permutation in String). Every time matches==26, the current window is an anagram — record left index.",
        complexity: { time: "O(|s|+|p|)", space: "O(1)" },
        code: `func findAnagrams(s string, p string) []int {
    if len(p) > len(s) {
        return nil
    }
    need, win := [26]int{}, [26]int{}
    for i := 0; i < len(p); i++ {
        need[p[i]-'a']++
        win[s[i]-'a']++
    }
    matches := 0
    for i := 0; i < 26; i++ {
        if need[i] == win[i] {
            matches++
        }
    }
    result := []int{}
    for right := len(p); right < len(s); right++ {
        if matches == 26 {
            result = append(result, right-len(p))
        }
        in := s[right] - 'a'
        win[in]++
        if win[in] == need[in] { matches++ } else if win[in] == need[in]+1 { matches-- }

        out := s[right-len(p)] - 'a'
        win[out]--
        if win[out] == need[out] { matches++ } else if win[out] == need[out]-1 { matches-- }
    }
    if matches == 26 {
        result = append(result, len(s)-len(p))
    }
    return result
}`,
      },
      {
        id: "maximum-average-subarray",
        title: "Maximum Average Subarray I",
        difficulty: "Easy",
        leetcode: 643,
        description:
          "Given an integer array nums and integer k, find a contiguous subarray of length exactly k that has the maximum average value. Return the maximum average.",
        examples: [
          {
            input: "nums = [1,12,-5,-6,50,3], k = 4",
            output: "12.75",
            explanation: "Window [12,-5,-6,50] sums to 51, average = 51/4 = 12.75",
          },
          {
            input: "nums = [5], k = 1",
            output: "5.0",
            explanation: "Only one element",
          },
        ],
        approach:
          "Compute the sum of the first k elements. Then slide: add nums[right] and subtract nums[right-k] to maintain the running window sum in O(1). Track the maximum sum seen and divide by k at the end.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `func findMaxAverage(nums []int, k int) float64 {
    sum := 0
    for i := 0; i < k; i++ {
        sum += nums[i]
    }
    best := sum
    for right := k; right < len(nums); right++ {
        sum += nums[right] - nums[right-k]
        if sum > best {
            best = sum
        }
    }
    return float64(best) / float64(k)
}`,
      },
      {
        id: "fruit-into-baskets",
        title: "Fruit Into Baskets",
        difficulty: "Medium",
        leetcode: 904,
        description:
          "You have two baskets, each holding one type of fruit. Given an array fruits where fruits[i] is the type at tree i, return the maximum number of fruits you can collect from a contiguous subarray containing at most 2 distinct fruit types.",
        examples: [
          {
            input: "fruits = [1,2,1]",
            output: "3",
            explanation: "Pick all three — only 2 distinct types (1 and 2)",
          },
          {
            input: "fruits = [0,1,2,2]",
            output: "3",
            explanation: "Pick [1,2,2] — 2 distinct types, length 3",
          },
        ],
        approach:
          "Sliding window with a frequency map. Expand right by adding fruits[right] to the map. When the map has more than 2 keys, shrink left — decrement count and delete key if count reaches 0. Track the maximum window size.",
        complexity: { time: "O(n)", space: "O(1)" },
        code: `func totalFruit(fruits []int) int {
    count := make(map[int]int)
    left, best := 0, 0
    for right := 0; right < len(fruits); right++ {
        count[fruits[right]]++
        for len(count) > 2 {
            count[fruits[left]]--
            if count[fruits[left]] == 0 {
                delete(count, fruits[left])
            }
            left++
        }
        if right-left+1 > best {
            best = right - left + 1
        }
    }
    return best
}`,
      },
    ],
  },
];
